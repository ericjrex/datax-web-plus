package com.wugui.datax.admin.tool.stat;

import com.wugui.datax.admin.dto.StatTaskResultDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.util.SqlSecurityUtil;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * SQL 统计计算执行引擎
 *
 * @author ypc
 */
public class SqlStatEngine {

    private static final Logger logger = LoggerFactory.getLogger(SqlStatEngine.class);

    /**
     * 动态宏变量替换
     *
     * @param sql 原始 SQL
     * @param customParams 自定义宏变量映射
     * @return 替换后的 SQL
     */
    public static String replaceDynamicParams(String sql, Map<String, String> customParams) {
        if (StringUtils.isBlank(sql)) {
            return "";
        }

        Calendar cal = Calendar.getInstance();
        Date now = cal.getTime();
        SimpleDateFormat dfDay = new SimpleDateFormat("yyyy-MM-dd");
        SimpleDateFormat dfTime = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

        String todayStr = dfDay.format(now);
        String nowStr = dfTime.format(now);

        cal.add(Calendar.DATE, -1);
        String yesterdayStr = dfDay.format(cal.getTime());

        String processedSql = sql;
        processedSql = processedSql.replace("${bizDate}", yesterdayStr);
        processedSql = processedSql.replace("${yesterday}", yesterdayStr);
        processedSql = processedSql.replace("${today}", todayStr);
        processedSql = processedSql.replace("${now}", nowStr);

        if (customParams != null && !customParams.isEmpty()) {
            for (Map.Entry<String, String> entry : customParams.entrySet()) {
                if (StringUtils.isNotBlank(entry.getKey()) && entry.getValue() != null) {
                    processedSql = processedSql.replace("${" + entry.getKey() + "}", entry.getValue());
                }
            }
        }

        return processedSql;
    }

    /**
     * 执行只读统计 SQL 查询并获取结果集与字段元数据
     *
     * @param datasource 源端数据源实体
     * @param rawSql 待执行统计 SQL
     * @param limit 限制获取行数 (null 或 <= 0 则获取全部)
     * @param customParams 动态宏变量参数
     * @return 统计结果对象
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executeStatQuery(JobDatasource datasource,
                                                    String rawSql,
                                                    Integer limit,
                                                    Map<String, String> customParams) throws Exception {
        long startTime = System.currentTimeMillis();
        StatTaskResultDto result = new StatTaskResultDto();

        // 1. 动态宏变量参数替换
        String interpolatedSql = replaceDynamicParams(rawSql, customParams);

        // 2. SQL 语法与安全性审计
        String cleanSql = SqlSecurityUtil.validateReadOnlySql(interpolatedSql);

        logger.info("执行统计 SQL 查询, 数据源: {}, SQL: {}", datasource.getDatasourceName(), cleanSql);

        // 3. 执行数据库查询
        try (Connection conn = StatDatasourceHelper.getConnection(datasource);
             Statement stmt = conn.createStatement()) {

            StatTaskExecutionManager.registerActiveStatement(stmt);
            try {
                // 设置流式读取，避免大量数据导致内存溢出
                stmt.setFetchSize(1000);
                if (limit != null && limit > 0) {
                    stmt.setMaxRows(limit);
                }

                try (ResultSet rs = stmt.executeQuery(cleanSql)) {
                    ResultSetMetaData metaData = rs.getMetaData();
                    int columnCount = metaData.getColumnCount();

                    List<String> columnNames = new ArrayList<>();
                    List<TableColumnDto> columnDetails = new ArrayList<>();

                    for (int i = 1; i <= columnCount; i++) {
                        String colLabel = metaData.getColumnLabel(i);
                        String colName = metaData.getColumnName(i);
                        String finalName = StringUtils.isNotBlank(colLabel) ? colLabel : colName;
                        columnNames.add(finalName);

                        TableColumnDto colDto = new TableColumnDto();
                        colDto.setColumnIndex(i);
                        colDto.setColumnName(finalName);
                        colDto.setColumnType(metaData.getColumnTypeName(i));
                        colDto.setColumnSize(metaData.getColumnDisplaySize(i));
                        colDto.setDecimalDigits(metaData.getScale(i));
                        colDto.setIsNullable(metaData.isNullable(i) != ResultSetMetaData.columnNoNulls);
                        columnDetails.add(colDto);
                    }

                    result.setColumns(columnNames);
                    result.setColumnDetails(columnDetails);

                    List<Map<String, Object>> rows = new ArrayList<>();
                    long rowCount = 0;

                    while (rs.next()) {
                        rowCount++;
                        if (limit == null || limit <= 0 || rows.size() < limit) {
                            Map<String, Object> rowMap = new LinkedHashMap<>();
                            for (int i = 1; i <= columnCount; i++) {
                                String colName = columnNames.get(i - 1);
                                Object val = rs.getObject(i);
                                rowMap.put(colName, val);
                            }
                            rows.add(rowMap);
                        }
                    }

                    result.setRows(rows);
                    result.setTotalRows(rowCount);
                    result.setSuccess(true);
                    result.setCostMs(System.currentTimeMillis() - startTime);
                    result.setMessage("SQL 查询成功，共检索出 " + rowCount + " 行数据");
                }
            } finally {
                StatTaskExecutionManager.unregisterActiveStatement();
            }
        } catch (Exception e) {
            logger.error("统计 SQL 执行失败: {}", e.getMessage(), e);
            result.setSuccess(false);
            result.setCostMs(System.currentTimeMillis() - startTime);
            result.setMessage("SQL 查询失败: " + e.getMessage());
            throw e;
        }

        return result;
    }
}
