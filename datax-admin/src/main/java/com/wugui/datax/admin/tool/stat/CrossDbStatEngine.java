package com.wugui.datax.admin.tool.stat;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.wugui.datax.admin.dto.CrossDbConfigDto;
import com.wugui.datax.admin.dto.CrossDbSourceItemDto;
import com.wugui.datax.admin.dto.StatTaskResultDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.service.JobDatasourceService;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.text.SimpleDateFormat;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 跨库多源协同计算执行引擎
 * 支持 FEDERATED_SQL (单SQL跨库宏替换)、UNION_ALL (多源行集合并追加)、KEY_JOIN (多源键值横向关联)
 *
 * @author ypc
 */
public class CrossDbStatEngine {

    private static final Logger logger = LoggerFactory.getLogger(CrossDbStatEngine.class);

    /**
     * 跨库数据源标记正则: /*ds:标识符* / (支持数据源ID或名称)
     */
    private static final Pattern DS_TAG_PATTERN = Pattern.compile("/\\*(?i)ds:([a-zA-Z0-9_\\u4e00-\\u9fa5-]+)\\*/");

    /**
     * 判断 SQL 语句中是否包含跨库数据源注解
     *
     * @param sql 待检测 SQL
     * @return 是否包含 /*ds:...* /
     */
    public static boolean containsCrossDbAnnotation(String sql) {
        if (StringUtils.isBlank(sql)) {
            return false;
        }
        return DS_TAG_PATTERN.matcher(sql).find();
    }

    /**
     * 跨库多源任务统一调度执行入口
     *
     * @param config 跨库多源配置对象
     * @param defaultSourceDs 默认主数据源 (单库或联邦主库)
     * @param fallbackSql 兜底主 SQL
     * @param dsService 数据源服务
     * @param limit 限制行数 (试运行调试时生效)
     * @param customParams 动态宏变量参数
     * @return 统计结果集 DTO
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executeCrossDbTask(CrossDbConfigDto config,
                                                      JobDatasource defaultSourceDs,
                                                      String fallbackSql,
                                                      JobDatasourceService dsService,
                                                      Integer limit,
                                                      Map<String, String> customParams) throws Exception {
        // 若未提供跨库聚合对象，则优先按包含跨库注解的单 SQL 联邦模式执行
        if (config == null || (config.getSources() == null || config.getSources().isEmpty())) {
            String sqlToRun = (config != null && StringUtils.isNotBlank(config.getMainSql())) ? config.getMainSql() : fallbackSql;
            return executeFederatedSql(defaultSourceDs, sqlToRun, dsService, limit, customParams);
        }

        String mode = StringUtils.isNotBlank(config.getMergeMode()) ? config.getMergeMode().toUpperCase() : "UNION_ALL";

        switch (mode) {
            case "KEY_JOIN":
                return executeKeyJoin(config, dsService, limit, customParams);
            case "FEDERATED_SQL":
                String fedSql = StringUtils.isNotBlank(config.getMainSql()) ? config.getMainSql() : fallbackSql;
                return executeFederatedSql(defaultSourceDs, fedSql, dsService, limit, customParams);
            case "UNION_ALL":
            default:
                return executeUnionAll(config, dsService, limit, customParams);
        }
    }

    /**
     * 模式一: 单 SQL 联邦子查询宏替换执行 (FEDERATED_SQL)
     * 将 SQL 中形如 /*ds:oa_db* / (SELECT count(*) FROM ...) 的子查询在目标库上计算标量后反填入主 SQL
     *
     * @param mainDatasource 主查询执行的数据源
     * @param rawSql 包含跨库注解的主 SQL
     * @param dsService 数据源服务
     * @param limit 限制行数
     * @param customParams 动态宏变量参数
     * @return 统计计算结果
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executeFederatedSql(JobDatasource mainDatasource,
                                                       String rawSql,
                                                       JobDatasourceService dsService,
                                                       Integer limit,
                                                       Map<String, String> customParams) throws Exception {
        if (StringUtils.isBlank(rawSql)) {
            throw new IllegalArgumentException("统计 SQL 不能为空");
        }
        if (mainDatasource == null) {
            throw new IllegalArgumentException("联邦执行主数据源不能为空");
        }

        // 解析并替换所有跨库注解子查询
        String resolvedSql = resolveFederatedSubqueries(rawSql, dsService, customParams);

        logger.info("联邦跨库替换完成，最终执行主 SQL: {}", resolvedSql);

        // 使用通用 SqlStatEngine 在主数据源上执行重构后的 SQL
        return SqlStatEngine.executeStatQuery(mainDatasource, resolvedSql, limit, customParams);
    }

    /**
     * 模式二: 多数据源行集合并追加模式 (UNION_ALL)
     * 并行/串行执行各数据源 SQL，垂直追加所有数据行，自动构建字段并集并补齐 NULL
     *
     * @param config 跨库配置
     * @param dsService 数据源服务
     * @param limit 试运行限额
     * @param customParams 动态宏变量
     * @return 合并后的结果集
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executeUnionAll(CrossDbConfigDto config,
                                                   JobDatasourceService dsService,
                                                   Integer limit,
                                                   Map<String, String> customParams) throws Exception {
        List<CrossDbSourceItemDto> sources = config.getSources();
        if (sources == null || sources.isEmpty()) {
            throw new IllegalArgumentException("跨库 UNION_ALL 模式必须配置至少一个数据源节点！");
        }

        long startTime = System.currentTimeMillis();
        List<Map<String, Object>> mergedRows = new ArrayList<>();
        Map<String, TableColumnDto> columnMap = new LinkedHashMap<>();
        long totalCount = 0;

        for (int i = 0; i < sources.size(); i++) {
            CrossDbSourceItemDto item = sources.get(i);
            if (StringUtils.isBlank(item.getSql())) {
                continue;
            }

            JobDatasource ds = resolveDatasource(item.getDatasourceId(), item.getDatasourceName(), dsService);
            logger.info("正在执行跨库 UNION 节点 [{}], 数据源: {}", (i + 1), ds.getDatasourceName());

            StatTaskResultDto subResult = SqlStatEngine.executeStatQuery(ds, item.getSql(), limit, customParams);

            // 合并列元数据
            mergeColumnMetadata(columnMap, subResult.getColumnDetails());

            // 合并行数据
            if (subResult.getRows() != null && !subResult.getRows().isEmpty()) {
                mergedRows.addAll(subResult.getRows());
            }
            totalCount += subResult.getTotalRows();
        }

        // 补全所有行缺失的列为 null，保证列结构一致
        normalizeRowColumns(mergedRows, columnMap.keySet());

        StatTaskResultDto finalResult = new StatTaskResultDto();
        finalResult.setSuccess(true);
        finalResult.setColumns(new ArrayList<>(columnMap.keySet()));
        finalResult.setColumnDetails(new ArrayList<>(columnMap.values()));
        finalResult.setRows(mergedRows);
        finalResult.setTotalRows(totalCount);
        finalResult.setCostMs(System.currentTimeMillis() - startTime);
        finalResult.setMessage("跨库 UNION ALL 执行成功，共汇聚 " + sources.size() + " 个数据源，" + totalCount + " 行数据");

        return finalResult;
    }

    /**
     * 模式三: 多数据源键值横向关联模式 (KEY_JOIN)
     * 基于指定的主键字段 (如 tenant_id, stat_date) 在内存中做 Hash Join，将各库指标并成单行宽表
     *
     * @param config 跨库配置
     * @param dsService 数据源服务
     * @param limit 试运行限额
     * @param customParams 动态宏变量
     * @return 关联后的结果集
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executeKeyJoin(CrossDbConfigDto config,
                                                  JobDatasourceService dsService,
                                                  Integer limit,
                                                  Map<String, String> customParams) throws Exception {
        List<CrossDbSourceItemDto> sources = config.getSources();
        if (sources == null || sources.size() < 2) {
            throw new IllegalArgumentException("跨库 KEY_JOIN 模式需要配置至少两个数据源节点！");
        }

        List<String> joinKeys = config.getJoinKeys();
        if (joinKeys == null || joinKeys.isEmpty()) {
            throw new IllegalArgumentException("跨库 KEY_JOIN 模式必须指定至少一个关联主键字段 (如 tenant_id, stat_date)！");
        }

        long startTime = System.currentTimeMillis();
        Map<String, TableColumnDto> columnMap = new LinkedHashMap<>();
        Map<String, Map<String, Object>> joinedRowMap = new LinkedHashMap<>();

        for (int i = 0; i < sources.size(); i++) {
            CrossDbSourceItemDto item = sources.get(i);
            if (StringUtils.isBlank(item.getSql())) {
                continue;
            }

            JobDatasource ds = resolveDatasource(item.getDatasourceId(), item.getDatasourceName(), dsService);
            logger.info("正在执行跨库 KEY_JOIN 节点 [{}], 数据源: {}", (i + 1), ds.getDatasourceName());

            StatTaskResultDto subResult = SqlStatEngine.executeStatQuery(ds, item.getSql(), limit, customParams);
            mergeColumnMetadata(columnMap, subResult.getColumnDetails());

            if (subResult.getRows() != null) {
                for (Map<String, Object> row : subResult.getRows()) {
                    String compositeKey = buildCompositeKey(row, joinKeys);
                    Map<String, Object> targetRow = joinedRowMap.computeIfAbsent(compositeKey, k -> {
                        Map<String, Object> newRow = new LinkedHashMap<>();
                        // 预先填充连接键字段
                        for (String keyCol : joinKeys) {
                            newRow.put(keyCol, row.get(keyCol));
                        }
                        return newRow;
                    });
                    // 合并当前源的所有指标列到关联行中
                    targetRow.putAll(row);
                }
            }
        }

        List<Map<String, Object>> finalRows = new ArrayList<>(joinedRowMap.values());
        normalizeRowColumns(finalRows, columnMap.keySet());

        StatTaskResultDto finalResult = new StatTaskResultDto();
        finalResult.setSuccess(true);
        finalResult.setColumns(new ArrayList<>(columnMap.keySet()));
        finalResult.setColumnDetails(new ArrayList<>(columnMap.values()));
        finalResult.setRows(finalRows);
        finalResult.setTotalRows((long) finalRows.size());
        finalResult.setCostMs(System.currentTimeMillis() - startTime);
        finalResult.setMessage("跨库 KEY_JOIN 执行成功，关联出 " + finalRows.size() + " 行聚合宽表数据");

        return finalResult;
    }

    /**
     * 推导跨库任务输出的字段元数据
     *
     * @param config 跨库配置
     * @param defaultSourceDs 默认主数据源
     * @param fallbackSql 兜底 SQL
     * @param dsService 数据源服务
     * @return 字段列表
     * @throws Exception 推导异常
     */
    public static List<TableColumnDto> inferCrossDbColumns(CrossDbConfigDto config,
                                                          JobDatasource defaultSourceDs,
                                                          String fallbackSql,
                                                          JobDatasourceService dsService) throws Exception {
        StatTaskResultDto result = executeCrossDbTask(config, defaultSourceDs, fallbackSql, dsService, 1, null);
        return result.getColumnDetails();
    }

    // ==================== 私有公共辅助方法 (遵循 single responsibility 与 common methods 规范) ====================

    /**
     * 解析并替换 SQL 中的所有 /*ds:TAG* / (子查询) 跨库注解
     */
    private static String resolveFederatedSubqueries(String sql,
                                                     JobDatasourceService dsService,
                                                     Map<String, String> customParams) throws Exception {
        StringBuilder sb = new StringBuilder();
        int currentIndex = 0;
        int length = sql.length();

        while (currentIndex < length) {
            Matcher matcher = DS_TAG_PATTERN.matcher(sql);
            if (!matcher.find(currentIndex)) {
                sb.append(sql.substring(currentIndex));
                break;
            }

            int tagStart = matcher.start();
            int tagEnd = matcher.end();
            String dsTag = matcher.group(1);

            // 追加标记之前的内容
            sb.append(sql, currentIndex, tagStart);

            // 寻找标记后第一个紧跟的左括号 '('
            int openParenIndex = -1;
            for (int i = tagEnd; i < length; i++) {
                char c = sql.charAt(i);
                if (Character.isWhitespace(c)) {
                    continue;
                }
                if (c == '(') {
                    openParenIndex = i;
                    break;
                }
                break; // 如果标记后紧跟的非空白不是 '(' 则不是合法子查询
            }

            if (openParenIndex == -1) {
                // 不构成合法子查询，原样保留
                sb.append(sql, tagStart, tagEnd);
                currentIndex = tagEnd;
                continue;
            }

            // 使用括号平衡算法准确截取包含嵌套括号的子查询主体
            int closeParenIndex = findMatchingCloseParen(sql, openParenIndex);
            if (closeParenIndex == -1) {
                throw new IllegalArgumentException("跨库子查询括号不匹配，请检查: /*ds:" + dsTag + "*/ 后的语句");
            }

            String subquerySql = sql.substring(openParenIndex + 1, closeParenIndex).trim();

            // 解析目标数据源并在该数据源上计算标量值
            JobDatasource targetDs = resolveDatasource(dsTag, dsService);
            logger.info("提取到跨库子查询, 目标数据源 [{}]: {}", targetDs.getDatasourceName(), subquerySql);

            Object scalarValue = executeScalarQuery(targetDs, subquerySql, customParams);
            String literalSqlValue = formatSqlLiteral(scalarValue);

            // 将标量值注入 SQL
            sb.append(literalSqlValue);

            currentIndex = closeParenIndex + 1;
        }

        return sb.toString();
    }

    /**
     * 执行只读子查询并提取第一行第一列的标量结果
     */
    private static Object executeScalarQuery(JobDatasource ds, String sql, Map<String, String> customParams) throws Exception {
        StatTaskResultDto res = SqlStatEngine.executeStatQuery(ds, sql, 1, customParams);
        if (res.getRows() != null && !res.getRows().isEmpty()) {
            Map<String, Object> firstRow = res.getRows().get(0);
            if (!firstRow.isEmpty()) {
                return firstRow.values().iterator().next();
            }
        }
        return null;
    }

    /**
     * 将 Java 对象安全格式化为 SQL 字面量
     */
    public static String formatSqlLiteral(Object val) {
        if (val == null) {
            return "NULL";
        }
        if (val instanceof Number) {
            return val.toString();
        }
        if (val instanceof Boolean) {
            return (Boolean) val ? "1" : "0";
        }
        if (val instanceof Date) {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            return "'" + sdf.format((Date) val) + "'";
        }
        String str = val.toString();
        // 对单引号进行标准 SQL 转义防注入
        str = str.replace("'", "''");
        return "'" + str + "'";
    }

    /**
     * 括号平衡算法寻找匹配的右括号
     */
    private static int findMatchingCloseParen(String s, int openIndex) {
        int balance = 1;
        boolean inSingleQuote = false;
        for (int i = openIndex + 1; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\'') {
                // 判断是否为转义单引号
                if (!inSingleQuote || (i + 1 < s.length() && s.charAt(i + 1) != '\'')) {
                    inSingleQuote = !inSingleQuote;
                }
            } else if (!inSingleQuote) {
                if (c == '(') {
                    balance++;
                } else if (c == ')') {
                    balance--;
                    if (balance == 0) {
                        return i;
                    }
                }
            }
        }
        return -1;
    }

    /**
     * 根据数据源 ID 或名称查找数据源实体
     */
    private static JobDatasource resolveDatasource(String dsIdentifier, JobDatasourceService dsService) {
        if (StringUtils.isBlank(dsIdentifier)) {
            throw new IllegalArgumentException("跨库数据源标识不能为空");
        }
        // 尝试按数字主键 ID 匹配
        if (StringUtils.isNumeric(dsIdentifier)) {
            try {
                JobDatasource ds = dsService.getById(Long.parseLong(dsIdentifier));
                if (ds != null) {
                    return ds;
                }
            } catch (Exception ignored) {
            }
        }
        // 尝试按数据源名称模糊/精确匹配
        QueryWrapper<JobDatasource> qw = new QueryWrapper<>();
        qw.eq("datasource_name", dsIdentifier);
        List<JobDatasource> list = dsService.list(qw);
        if (list != null && !list.isEmpty()) {
            return list.get(0);
        }

        throw new IllegalArgumentException("未找到标识为 [" + dsIdentifier + "] 的有效已注册数据源！");
    }

    /**
     * 根据 ID 或 Name 解析数据源
     */
    private static JobDatasource resolveDatasource(Long id, String name, JobDatasourceService dsService) {
        if (id != null && id > 0) {
            JobDatasource ds = dsService.getById(id);
            if (ds != null) return ds;
        }
        if (StringUtils.isNotBlank(name)) {
            return resolveDatasource(name, dsService);
        }
        throw new IllegalArgumentException("无法定位跨库数据源配置 (ID: " + id + ", 名称: " + name + ")");
    }

    /**
     * 合并字段元数据信息，避免重复列覆盖
     */
    private static void mergeColumnMetadata(Map<String, TableColumnDto> targetMap, List<TableColumnDto> newColumns) {
        if (newColumns == null) return;
        int currIndex = targetMap.size() + 1;
        for (TableColumnDto col : newColumns) {
            if (!targetMap.containsKey(col.getColumnName())) {
                TableColumnDto copy = new TableColumnDto();
                copy.setColumnIndex(currIndex++);
                copy.setColumnName(col.getColumnName());
                copy.setColumnType(col.getColumnType());
                copy.setColumnSize(col.getColumnSize());
                copy.setDecimalDigits(col.getDecimalDigits());
                copy.setIsNullable(col.getIsNullable());
                targetMap.put(col.getColumnName(), copy);
            }
        }
    }

    /**
     * 规范化行字段，缺失字段补充 null
     */
    private static void normalizeRowColumns(List<Map<String, Object>> rows, Set<String> allColumns) {
        if (rows == null || allColumns == null) return;
        for (Map<String, Object> row : rows) {
            for (String col : allColumns) {
                if (!row.containsKey(col)) {
                    row.put(col, null);
                }
            }
        }
    }

    /**
     * 构建关联键复合字符串
     */
    private static String buildCompositeKey(Map<String, Object> row, List<String> joinKeys) {
        StringBuilder sb = new StringBuilder();
        for (String k : joinKeys) {
            Object v = row.get(k);
            sb.append(v != null ? v.toString() : "NULL").append("||");
        }
        return sb.toString();
    }
}
