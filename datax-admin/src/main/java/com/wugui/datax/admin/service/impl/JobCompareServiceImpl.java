package com.wugui.datax.admin.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.RandomUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.parser.Feature;
import com.wugui.datax.admin.dto.BatchCompareDto;
import com.wugui.datax.admin.dto.BatchCompareResultDto;
import com.wugui.datax.admin.dto.JobCompareItemDto;
import com.wugui.datax.admin.entity.JobDataCompareLog;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.entity.JobInfo;
import com.wugui.datax.admin.mapper.JobDataCompareLogMapper;
import com.wugui.datax.admin.mapper.JobInfoMapper;
import com.wugui.datax.admin.service.JobCompareService;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.util.AESUtil;
import com.wugui.datax.admin.util.JSONUtils;
import com.wugui.datax.admin.util.JdbcUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLTimeoutException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * 任务数据量比对与对账服务实现类
 *
 * @author ypc
 */
@Service
public class JobCompareServiceImpl implements JobCompareService {

    private static final Logger logger = LoggerFactory.getLogger(JobCompareServiceImpl.class);

    /**
     * 标识符安全校验正则 (表名/库名，允许点号分割的 schema.table)
     */
    private static final Pattern SAFE_TABLE_PATTERN = Pattern.compile("^[a-zA-Z0-9_$.]+$");

    /**
     * 单表查询硬超时时间 (单位: 秒)
     */
    private static final int QUERY_TIMEOUT_SECONDS = 10;

    /**
     * 最大并发线程数 (物理并发隔离，防打满数据库连接)
     */
    private static final int MAX_CONCURRENT_THREADS = 4;

    @Autowired
    private JobInfoMapper jobInfoMapper;

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Autowired
    private JobDataCompareLogMapper jobDataCompareLogMapper;

    @Override
    public BatchCompareResultDto batchCompare(BatchCompareDto dto, String username) {
        long batchStartTime = System.currentTimeMillis();
        BatchCompareResultDto result = new BatchCompareResultDto();
        if (dto == null || CollUtil.isEmpty(dto.getJobIds())) {
            result.setItems(Collections.emptyList());
            return result;
        }

        List<Integer> jobIds = dto.getJobIds();
        result.setTotalCount(jobIds.size());

        // 1. 生成唯一对账批次流水号
        String batchNo = "CMP_" + DateUtil.format(new Date(), "yyyyMMddHHmmss") + "_" + RandomUtil.randomNumbers(4);
        result.setBatchNo(batchNo);

        // 2. 预加载全部数据源列表用于连接匹配缓存
        List<JobDatasource> allDatasources = safeGetAllDatasources();

        // 3. 构建受限并发线程池 (最大 4 并发执行比对任务)
        ExecutorService executor = Executors.newFixedThreadPool(MAX_CONCURRENT_THREADS);
        List<CompletableFuture<JobCompareItemDto>> futures = new ArrayList<>();

        for (Integer jobId : jobIds) {
            futures.add(CompletableFuture.supplyAsync(() -> executeSingleJobCompare(jobId, allDatasources), executor));
        }

        List<JobCompareItemDto> items = new ArrayList<>();
        List<JobDataCompareLog> logsToInsert = new ArrayList<>();
        int matched = 0;
        int mismatched = 0;
        int timeout = 0;
        int error = 0;

        Date now = new Date();
        for (CompletableFuture<JobCompareItemDto> future : futures) {
            try {
                JobCompareItemDto item = future.get();
                if (item != null) {
                    item.setCheckTime(now);
                    items.add(item);

                    // 统计计数
                    if (item.getStatus() == 1) {
                        matched++;
                    } else if (item.getStatus() == 2) {
                        mismatched++;
                    } else if (item.getStatus() == 3) {
                        timeout++;
                    } else {
                        error++;
                    }

                    // 转换为持久化日志实体
                    JobDataCompareLog logEntity = convertDtoToLogEntity(item, batchNo, username, now);
                    logsToInsert.add(logEntity);
                }
            } catch (Exception e) {
                logger.error("获取比对子任务执行结果异常", e);
                error++;
            }
        }

        executor.shutdown();

        // 4. 批量落盘持久化至对账日志明细表
        if (CollUtil.isNotEmpty(logsToInsert)) {
            try {
                jobDataCompareLogMapper.insertBatch(logsToInsert);
            } catch (Exception e) {
                logger.error("批量持久化对账日志异常", e);
            }
        }

        // 5. 组装批次汇总结果
        result.setItems(items);
        result.setMatchedCount(matched);
        result.setMismatchedCount(mismatched);
        result.setTimeoutCount(timeout);
        result.setErrorCount(error);
        result.setTotalCostTimeMs(System.currentTimeMillis() - batchStartTime);
        return result;
    }

    @Override
    public BatchCompareResultDto getLatestCompare(List<Integer> jobIds) {
        BatchCompareResultDto result = new BatchCompareResultDto();
        if (CollUtil.isEmpty(jobIds)) {
            result.setItems(Collections.emptyList());
            return result;
        }

        List<JobDataCompareLog> logs = jobDataCompareLogMapper.selectLatestByJobIds(jobIds);
        return assembleResultFromLogs(logs, "LATEST_CACHE");
    }

    @Override
    public BatchCompareResultDto getHistoryByBatchNo(String batchNo) {
        BatchCompareResultDto result = new BatchCompareResultDto();
        if (StringUtils.isBlank(batchNo)) {
            result.setItems(Collections.emptyList());
            return result;
        }

        List<JobDataCompareLog> logs = jobDataCompareLogMapper.selectByBatchNo(batchNo);
        return assembleResultFromLogs(logs, batchNo);
    }

    @Override
    public JobCompareItemDto compareSingleJob(Integer jobId, String username) {
        List<JobDatasource> allDatasources = safeGetAllDatasources();
        JobCompareItemDto item = executeSingleJobCompare(jobId, allDatasources);
        if (item != null) {
            Date now = new Date();
            item.setCheckTime(now);
            String singleBatchNo = "CMP_SINGLE_" + DateUtil.format(now, "yyyyMMddHHmmss");
            JobDataCompareLog logEntity = convertDtoToLogEntity(item, singleBatchNo, username, now);
            try {
                jobDataCompareLogMapper.insert(logEntity);
            } catch (Exception e) {
                logger.error("单任务持久化对账日志异常", e);
            }
        }
        return item;
    }

    /**
     * 单个任务比对核心逻辑
     */
    private JobCompareItemDto executeSingleJobCompare(Integer jobId, List<JobDatasource> allDatasources) {
        long startTime = System.currentTimeMillis();
        JobCompareItemDto item = new JobCompareItemDto();
        item.setJobId(jobId);
        item.setSourceCount(-1L);
        item.setTargetCount(-1L);
        item.setDiffCount(0L);
        item.setStatus(4);

        if (jobId == null || jobId <= 0) {
            item.setStatusMsg("任务ID无效");
            item.setCostTimeMs(System.currentTimeMillis() - startTime);
            return item;
        }

        JobInfo jobInfo = jobInfoMapper.loadById(jobId);
        if (jobInfo == null) {
            item.setStatusMsg("未找到对应任务记录");
            item.setCostTimeMs(System.currentTimeMillis() - startTime);
            return item;
        }

        item.setJobDesc(StringUtils.isNotBlank(jobInfo.getJobDesc()) ? jobInfo.getJobDesc() : ("ID:" + jobId));

        String rawJson = JSONUtils.decryptJobJson(jobInfo.getJobJson());
        if (StringUtils.isBlank(rawJson)) {
            item.setStatusMsg("任务配置 JSON 为空");
            item.setCostTimeMs(System.currentTimeMillis() - startTime);
            return item;
        }

        JSONObject root;
        try {
            root = JSON.parseObject(rawJson, Feature.OrderedField);
        } catch (Exception e) {
            item.setStatusMsg("任务配置 JSON 解析失败: " + e.getMessage());
            item.setCostTimeMs(System.currentTimeMillis() - startTime);
            return item;
        }

        // 解析 Reader 端信息
        TableEndpointInfo readerInfo = parseEndpoint(root, "reader", allDatasources);
        item.setReaderDatasourceId(readerInfo.datasourceId);
        item.setReaderDatasourceName(readerInfo.datasourceName);
        item.setReaderTable(readerInfo.tableName);

        // 清洗与展示 Reader 过滤条件
        String sanitizedWhere = cleanWhereClause(readerInfo.whereClause);
        if (StringUtils.isNotBlank(readerInfo.whereClause) && StringUtils.isBlank(sanitizedWhere)) {
            item.setReaderWhere("增量模板(全量比对)");
        } else {
            item.setReaderWhere(sanitizedWhere);
        }

        // 解析 Writer 端信息
        TableEndpointInfo writerInfo = parseEndpoint(root, "writer", allDatasources);
        item.setWriterDatasourceId(writerInfo.datasourceId);
        item.setWriterDatasourceName(writerInfo.datasourceName);
        item.setWriterTable(writerInfo.tableName);

        // 校验表名与连接信息
        if (StringUtils.isBlank(readerInfo.tableName) || StringUtils.isBlank(readerInfo.jdbcUrl)) {
            item.setStatusMsg("无法解析源端表名或连接串");
            item.setCostTimeMs(System.currentTimeMillis() - startTime);
            return item;
        }
        if (StringUtils.isBlank(writerInfo.tableName) || StringUtils.isBlank(writerInfo.jdbcUrl)) {
            item.setStatusMsg("无法解析目标端表名或连接串");
            item.setCostTimeMs(System.currentTimeMillis() - startTime);
            return item;
        }

        // 执行源端 Count 查询
        CountQueryResult srcResult = executeCountQuery(readerInfo.jdbcUrl, readerInfo.username, readerInfo.password,
                readerInfo.tableName, readerInfo.whereClause, readerInfo.querySql);

        // 执行目标端 Count 查询
        CountQueryResult tgtResult = executeCountQuery(writerInfo.jdbcUrl, writerInfo.username, writerInfo.password,
                writerInfo.tableName, null, null);

        item.setSourceCount(srcResult.count);
        item.setTargetCount(tgtResult.count);

        if (srcResult.isTimeout || tgtResult.isTimeout) {
            item.setStatus(3);
            item.setStatusMsg("查询超时(> " + QUERY_TIMEOUT_SECONDS + "s): "
                    + (srcResult.isTimeout ? "[源库超时] " : "")
                    + (tgtResult.isTimeout ? "[目标库超时]" : ""));
        } else if (!srcResult.isSuccess || !tgtResult.isSuccess) {
            item.setStatus(4);
            item.setStatusMsg("查询失败: "
                    + (!srcResult.isSuccess ? ("[源库: " + srcResult.errorMsg + "] ") : "")
                    + (!tgtResult.isSuccess ? ("[目标库: " + tgtResult.errorMsg + "]") : ""));
        } else {
            long diff = srcResult.count - tgtResult.count;
            item.setDiffCount(diff);
            if (diff == 0) {
                item.setStatus(1);
                item.setStatusMsg("两端数据量完全一致");
            } else {
                item.setStatus(2);
                item.setStatusMsg("数据量不一致: 源端 " + srcResult.count + " 行, 目标端 " + tgtResult.count + " 行 (差 " + diff + " 行)");
            }
        }

        item.setCostTimeMs(System.currentTimeMillis() - startTime);
        return item;
    }

    /**
     * 执行带硬超时的 COUNT 查询公共方法
     */
    private CountQueryResult executeCountQuery(String jdbcUrl, String username, String password,
                                               String tableName, String whereClause, String querySql) {
        CountQueryResult qr = new CountQueryResult();
        String countSql;

        if (StringUtils.isNotBlank(querySql)) {
            // querySql 模式
            countSql = "SELECT COUNT(1) FROM (" + querySql + ") datax_tmp_cnt_";
        } else {
            String cleanTable = cleanTableName(tableName);
            if (!SAFE_TABLE_PATTERN.matcher(cleanTable).matches()) {
                qr.isSuccess = false;
                qr.errorMsg = "表名包含不合规字符，已拦截";
                return qr;
            }
            String wrappedTable = wrapTableName(cleanTable, jdbcUrl);
            StringBuilder sb = new StringBuilder("SELECT COUNT(1) FROM ").append(wrappedTable);
            if (StringUtils.isNotBlank(whereClause)) {
                String cleanWhere = cleanWhereClause(whereClause);
                if (StringUtils.isNotBlank(cleanWhere)) {
                    sb.append(" WHERE ").append(cleanWhere);
                }
            }
            countSql = sb.toString();
        }

        Connection conn = null;
        Statement stmt = null;
        ResultSet rs = null;
        try {
            String driverClass = detectDriverClass(jdbcUrl);
            if (StringUtils.isNotBlank(driverClass)) {
                try {
                    Class.forName(driverClass);
                } catch (Exception ignored) {
                }
            }

            DriverManager.setLoginTimeout(QUERY_TIMEOUT_SECONDS);
            Properties props = new Properties();
            if (username != null) props.put("user", username);
            if (password != null) props.put("password", password);

            // MySQL 连接安全配置，杜绝 SSL 告警与公钥异常
            if (jdbcUrl != null && jdbcUrl.startsWith("jdbc:mysql:")) {
                if (!jdbcUrl.contains("useSSL=")) {
                    props.put("useSSL", "false");
                    props.put("verifyServerCertificate", "false");
                    props.put("allowPublicKeyRetrieval", "true");
                }
            }

            conn = DriverManager.getConnection(jdbcUrl, props);
            stmt = conn.createStatement();
            stmt.setQueryTimeout(QUERY_TIMEOUT_SECONDS);

            rs = stmt.executeQuery(countSql);
            if (rs.next()) {
                qr.count = rs.getLong(1);
                qr.isSuccess = true;
            } else {
                qr.count = 0L;
                qr.isSuccess = true;
            }
        } catch (SQLTimeoutException e) {
            qr.isTimeout = true;
            qr.isSuccess = false;
            qr.errorMsg = "查询超时: " + e.getMessage();
            logger.warn("执行数据量统计超时 [{}]: {}", countSql, e.getMessage());
        } catch (Exception e) {
            qr.isSuccess = false;
            qr.errorMsg = e.getMessage();
            logger.warn("执行数据量统计异常 [{}]: {}", countSql, e.getMessage());
        } finally {
            JdbcUtils.close(rs);
            JdbcUtils.close(stmt);
            JdbcUtils.close(conn);
        }

        return qr;
    }

    /**
     * 解析插件的库表、连接及账密信息
     */
    private TableEndpointInfo parseEndpoint(JSONObject root, String pluginType, List<JobDatasource> allDatasources) {
        TableEndpointInfo info = new TableEndpointInfo();
        try {
            JSONArray content = root.getJSONObject("job").getJSONArray("content");
            if (content != null && !content.isEmpty()) {
                JSONObject plugin = content.getJSONObject(0).getJSONObject(pluginType);
                if (plugin != null && plugin.containsKey("parameter")) {
                    JSONObject param = plugin.getJSONObject("parameter");

                    info.username = param.getString("username");
                    info.password = param.getString("password");
                    info.whereClause = param.getString("where");

                    // 提取 querySql
                    JSONArray querySqlArr = param.getJSONArray("querySql");
                    if (querySqlArr != null && !querySqlArr.isEmpty()) {
                        info.querySql = querySqlArr.getString(0);
                    }

                    // 提取 connection 节点中的 table 和 jdbcUrl
                    JSONArray connectionArr = param.getJSONArray("connection");
                    if (connectionArr != null && !connectionArr.isEmpty()) {
                        JSONObject connObj = connectionArr.getJSONObject(0);

                        // 提取 table
                        Object tableObj = connObj.get("table");
                        if (tableObj instanceof JSONArray) {
                            JSONArray tableArr = (JSONArray) tableObj;
                            if (!tableArr.isEmpty()) {
                                info.tableName = tableArr.getString(0);
                            }
                        } else if (tableObj instanceof String) {
                            info.tableName = (String) tableObj;
                        }

                        // 提取 jdbcUrl
                        Object urlObj = connObj.get("jdbcUrl");
                        if (urlObj instanceof JSONArray) {
                            JSONArray urlArr = (JSONArray) urlObj;
                            if (!urlArr.isEmpty()) {
                                info.jdbcUrl = urlArr.getString(0);
                            }
                        } else if (urlObj instanceof String) {
                            info.jdbcUrl = (String) urlObj;
                        }
                    }

                    // 匹配数据源以获取数据源ID和友好名称
                    if (StringUtils.isNotBlank(info.jdbcUrl) && allDatasources != null) {
                        String cleanTarget = cleanJdbcUrl(info.jdbcUrl);
                        for (JobDatasource ds : allDatasources) {
                            if (StringUtils.isNotBlank(ds.getJdbcUrl())
                                    && cleanJdbcUrl(ds.getJdbcUrl()).equalsIgnoreCase(cleanTarget)) {
                                info.datasourceId = ds.getId();
                                info.datasourceName = ds.getDatasourceName();
                                // 若 JSON 里的账密为空，复用数据源已配置的账密
                                if (StringUtils.isBlank(info.username)) {
                                    info.username = AESUtil.decrypt(ds.getJdbcUsername());
                                }
                                if (StringUtils.isBlank(info.password)) {
                                    info.password = AESUtil.decrypt(ds.getJdbcPassword());
                                }
                                break;
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("解析插件 [{}] 配置异常: {}", pluginType, e.getMessage());
        }
        return info;
    }

    /**
     * 安全清洗表名
     */
    private String cleanTableName(String tableName) {
        if (tableName == null) return "";
        return tableName.replace("`", "").replace("\"", "").replace("'", "").trim();
    }

    /**
     * 安全转义表名 (适配异构库双引号与反引号)
     */
    private String wrapTableName(String tableName, String jdbcUrl) {
        if (StringUtils.isBlank(tableName)) return "";
        boolean isPgOrOracle = jdbcUrl != null && (jdbcUrl.startsWith("jdbc:postgresql:") || jdbcUrl.startsWith("jdbc:oracle:"));
        char quote = isPgOrOracle ? '"' : '`';

        if (tableName.contains(".")) {
            String[] parts = tableName.split("\\.");
            if (parts.length == 2) {
                return quote + parts[0] + quote + "." + quote + parts[1] + quote;
            }
        }
        return quote + tableName + quote;
    }

    /**
     * 清洗与解析 WHERE 过滤条件用于数据量对账
     * 自动剥离调度运行期的动态增量占位符（如 ${lastTime}, ${currentTime} 等），保留静态业务过滤条件
     * 保证生成的对账 SQL 语法绝对合法，且准确反映全量或业务范围的数据量
     *
     * @param where 原始 where 语句
     * @return 适用于对账的静态 where 语句，若全为动态占位符则返回空字符串
     */
    private String cleanWhereClause(String where) {
        if (StringUtils.isBlank(where)) {
            return "";
        }
        String s = where.trim();
        while (s.endsWith(";")) {
            s = s.substring(0, s.length() - 1).trim();
        }

        // 如果不含动态调度占位符 ${...}，直接返回原静态过滤条件
        if (!s.contains("${")) {
            return s;
        }

        // 包含动态调度占位符（如方案1增量同步模板）：按 AND 拆分子表达式，剥离含有 ${ 的增量切片条件
        String[] parts = s.split("(?i)\\s+AND\\s+");
        List<String> validParts = new ArrayList<>();
        for (String part : parts) {
            String trimmed = part.trim();
            // 剥离含有动态占位符的切片条件
            if (!trimmed.contains("${")) {
                validParts.add(trimmed);
            }
        }

        if (validParts.isEmpty()) {
            return "";
        }

        String result = StringUtils.join(validParts, " AND ");
        // 校验并清理可能不平衡的外层括号
        result = cleanUnbalancedParentheses(result);
        if (result.contains("${")) {
            return "";
        }
        return result.trim();
    }

    /**
     * 清理表达式外层不配对的括号
     */
    private String cleanUnbalancedParentheses(String expr) {
        if (StringUtils.isBlank(expr)) {
            return "";
        }
        int open = 0;
        int close = 0;
        for (int i = 0; i < expr.length(); i++) {
            char c = expr.charAt(i);
            if (c == '(') open++;
            else if (c == ')') close++;
        }
        String s = expr.trim();
        while (open > close && s.startsWith("(")) {
            s = s.substring(1).trim();
            open--;
        }
        while (close > open && s.endsWith(")")) {
            s = s.substring(0, s.length() - 1).trim();
            close--;
        }
        return s;
    }

    /**
     * 智能探测 JDBC 驱动类
     */
    private String detectDriverClass(String jdbcUrl) {
        if (jdbcUrl == null) return null;
        if (jdbcUrl.startsWith("jdbc:mysql:")) return "com.mysql.jdbc.Driver";
        if (jdbcUrl.startsWith("jdbc:oracle:")) return "oracle.jdbc.OracleDriver";
        if (jdbcUrl.startsWith("jdbc:postgresql:")) return "org.postgresql.Driver";
        if (jdbcUrl.startsWith("jdbc:sqlserver:")) return "com.microsoft.sqlserver.jdbc.SQLServerDriver";
        if (jdbcUrl.startsWith("jdbc:clickhouse:")) return "ru.yandex.clickhouse.ClickHouseDriver";
        if (jdbcUrl.startsWith("jdbc:hive2:")) return "org.apache.hive.jdbc.HiveDriver";
        return null;
    }

    /**
     * 安全提取 JDBC URL 主体部分
     */
    private String cleanJdbcUrl(String url) {
        if (url == null) return "";
        int q = url.indexOf('?');
        return q != -1 ? url.substring(0, q).trim() : url.trim();
    }

    /**
     * 安全获取所有数据源列表
     */
    private List<JobDatasource> safeGetAllDatasources() {
        try {
            return jobDatasourceService.selectAllDatasource();
        } catch (Exception e) {
            logger.warn("获取全部数据源列表异常: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * DTO 转换持久化实体
     */
    private JobDataCompareLog convertDtoToLogEntity(JobCompareItemDto dto, String batchNo, String username, Date createTime) {
        JobDataCompareLog entity = new JobDataCompareLog();
        entity.setBatchNo(batchNo);
        entity.setJobId(dto.getJobId());
        entity.setJobDesc(dto.getJobDesc());
        entity.setReaderDatasourceId(dto.getReaderDatasourceId());
        entity.setReaderTable(dto.getReaderTable());
        entity.setWriterDatasourceId(dto.getWriterDatasourceId());
        entity.setWriterTable(dto.getWriterTable());
        entity.setSourceCount(dto.getSourceCount());
        entity.setTargetCount(dto.getTargetCount());
        entity.setDiffCount(dto.getDiffCount());
        entity.setStatus(dto.getStatus());
        entity.setStatusMsg(dto.getStatusMsg());
        entity.setCostTime(dto.getCostTimeMs());
        entity.setCreateTime(createTime);
        entity.setCreateBy(StringUtils.isNotBlank(username) ? username : "SYSTEM");
        return entity;
    }

    /**
     * 从日志实体集合组装批次汇总结果
     */
    private BatchCompareResultDto assembleResultFromLogs(List<JobDataCompareLog> logs, String batchNo) {
        BatchCompareResultDto result = new BatchCompareResultDto();
        result.setBatchNo(batchNo);
        if (CollUtil.isEmpty(logs)) {
            result.setItems(Collections.emptyList());
            return result;
        }

        result.setTotalCount(logs.size());
        List<JobCompareItemDto> items = new ArrayList<>();
        int matched = 0;
        int mismatched = 0;
        int timeout = 0;
        int error = 0;

        for (JobDataCompareLog log : logs) {
            JobCompareItemDto item = new JobCompareItemDto();
            item.setJobId(log.getJobId());
            item.setJobDesc(log.getJobDesc());
            item.setReaderDatasourceId(log.getReaderDatasourceId());
            item.setReaderTable(log.getReaderTable());
            item.setWriterDatasourceId(log.getWriterDatasourceId());
            item.setWriterTable(log.getWriterTable());
            item.setSourceCount(log.getSourceCount());
            item.setTargetCount(log.getTargetCount());
            item.setDiffCount(log.getDiffCount());
            item.setStatus(log.getStatus());
            item.setStatusMsg(log.getStatusMsg());
            item.setCostTimeMs(log.getCostTime());
            item.setCheckTime(log.getCreateTime());
            items.add(item);

            if (log.getStatus() == 1) {
                matched++;
            } else if (log.getStatus() == 2) {
                mismatched++;
            } else if (log.getStatus() == 3) {
                timeout++;
            } else {
                error++;
            }
        }

        result.setItems(items);
        result.setMatchedCount(matched);
        result.setMismatchedCount(mismatched);
        result.setTimeoutCount(timeout);
        result.setErrorCount(error);
        return result;
    }

    /**
     * 内部端点解析结果封装
     */
    private static class TableEndpointInfo {
        Long datasourceId;
        String datasourceName;
        String tableName;
        String jdbcUrl;
        String username;
        String password;
        String whereClause;
        String querySql;
    }

    /**
     * 内部 COUNT 查询结果封装
     */
    private static class CountQueryResult {
        long count = -1L;
        boolean isSuccess = false;
        boolean isTimeout = false;
        String errorMsg = "";
    }
}
