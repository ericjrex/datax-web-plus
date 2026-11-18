package com.wugui.datax.admin.tool.stat;

import com.wugui.datax.admin.dto.StatTaskColumnMappingDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.util.JdbcConstants;
import com.wugui.datax.admin.util.SqlSecurityUtil;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import cn.hutool.core.date.DateUtil;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * 目标端多库多表数据写入引擎
 *
 * @author ypc
 */
public class TargetDataWriterEngine {

    private static final Logger logger = LoggerFactory.getLogger(TargetDataWriterEngine.class);

    /**
     * 批量将结构化数据写入目标数据库表
     *
     * @param targetDs 目标数据源实体
     * @param targetTableName 目标数据表名
     * @param writeMode 写入模式 (APPEND, OVERWRITE, UPSERT)
     * @param columnMappings 字段映射关系列表
     * @param inferredColumns 推导出的字段元数据 (用于自动建表)
     * @param autoCreateTable 目标表不存在时是否自动建表
     * @param rows 待写入数据行集合
     * @param batchSize 批量提交大小
     * @return 实际写入目标表的记录数
     * @throws Exception 写入异常
     */
    public static long writeDataToTarget(JobDatasource targetDs,
                                         String targetTableName,
                                         String writeMode,
                                         List<StatTaskColumnMappingDto> columnMappings,
                                         List<TableColumnDto> inferredColumns,
                                         boolean autoCreateTable,
                                         List<Map<String, Object>> rows,
                                         int batchSize) throws Exception {
        if ("NONE".equalsIgnoreCase(writeMode) || "SKIP".equalsIgnoreCase(writeMode)) {
            logger.info("写入策略为 {} (脚本内自行更新落库)，跳过平台目标端写入", writeMode);
            return 0L;
        }

        if (targetDs == null || StringUtils.isBlank(targetTableName) || "NONE".equalsIgnoreCase(targetTableName)) {
            logger.info("目标端未配置或为 NONE，跳过平台目标端写入");
            return 0L;
        }

        if (rows == null || rows.isEmpty()) {
            logger.info("待写入数据为空，跳过目标端入库操作");
            return 0L;
        }

        String safeTableName = SqlSecurityUtil.validateIdentifier(targetTableName);
        String dbType = (targetDs.getDatasource() != null) ? targetDs.getDatasource().toUpperCase() : "MYSQL";
        int safeBatchSize = batchSize > 0 ? batchSize : 1000;

        try (Connection conn = StatDatasourceHelper.getConnection(targetDs)) {
            conn.setAutoCommit(false); // 开启显式事务控制

            try {
                // 1. 检查目标表是否存在，若不存在且开启了 autoCreateTable 则自动建表
                boolean tableExists = checkTableExists(conn, safeTableName);
                if (!tableExists) {
                    if (autoCreateTable) {
                        createTargetTable(conn, dbType, safeTableName, columnMappings, inferredColumns);
                    } else {
                        throw new IllegalArgumentException("目标数据库中表 [" + safeTableName + "] 不存在，请先建表或开启自动建表选项！");
                    }
                }

                // 2. 如果是 OVERWRITE 模式，清空目标表数据
                if ("OVERWRITE".equalsIgnoreCase(writeMode)) {
                    truncateTable(conn, dbType, safeTableName);
                }

                // 3. 准备字段映射对应关系
                List<ColumnPair> activePairs = buildActiveColumnPairs(columnMappings, inferredColumns, rows.get(0));
                if (activePairs.isEmpty()) {
                    throw new IllegalArgumentException("未找到匹配的目标表字段映射关系，请检查字段配置！");
                }

                // 3.1 结合目标库表真实物理元数据校准字段类型，杜绝类型不一致与误判
                Map<String, String> realTypes = getTargetTableColumnTypes(conn, safeTableName);
                for (ColumnPair pair : activePairs) {
                    String realType = realTypes.get(pair.targetCol.toLowerCase().trim());
                    if (StringUtils.isNotBlank(realType)) {
                        pair.dataType = realType;
                    }
                }

                // 4. 构造 INSERT 或 UPSERT PreparedStatement 语句
                String insertSql = buildInsertSql(dbType, safeTableName, writeMode, activePairs);
                logger.info("目标表写入准备就绪, SQL: {}, 记录数: {}", insertSql, rows.size());

                long writtenCount = 0;
                try (PreparedStatement pstmt = conn.prepareStatement(insertSql)) {
                    int countInBatch = 0;
                    for (Map<String, Object> row : rows) {
                        for (int i = 0; i < activePairs.size(); i++) {
                            ColumnPair pair = activePairs.get(i);
                            Object val = row.get(pair.sourceCol);
                            Object safeVal = cleanAndConvertValue(val, pair.dataType, pair.targetCol);
                            pstmt.setObject(i + 1, safeVal);
                        }
                        pstmt.addBatch();
                        countInBatch++;
                        writtenCount++;

                        if (countInBatch >= safeBatchSize) {
                            pstmt.executeBatch();
                            countInBatch = 0;
                        }
                    }

                    if (countInBatch > 0) {
                        pstmt.executeBatch();
                    }
                }

                // 提交事务
                conn.commit();
                logger.info("成功写入目标表 [{}], 影响记录数: {}", safeTableName, writtenCount);
                return writtenCount;

            } catch (Exception ex) {
                conn.rollback(); // 异常自动回滚
                logger.error("写入目标表失败，已触发事务回滚: {}", ex.getMessage(), ex);
                throw ex;
            }
        }
    }

    /**
     * 检查目标表是否存在
     */
    public static boolean checkTableExists(Connection conn, String tableName) {
        try {
            DatabaseMetaData metaData = conn.getMetaData();
            try (ResultSet rs = metaData.getTables(conn.getCatalog(), conn.getSchema(), tableName, new String[]{"TABLE", "VIEW"})) {
                if (rs.next()) {
                    return true;
                }
            }
            // 兼容大小写数据库检测
            try (ResultSet rs = metaData.getTables(conn.getCatalog(), conn.getSchema(), tableName.toUpperCase(), new String[]{"TABLE", "VIEW"})) {
                if (rs.next()) {
                    return true;
                }
            }
            try (ResultSet rs = metaData.getTables(conn.getCatalog(), conn.getSchema(), tableName.toLowerCase(), new String[]{"TABLE", "VIEW"})) {
                return rs.next();
            }
        } catch (Exception e) {
            logger.warn("检测表存在性抛出异常，尝试以 SELECT 1 探测: {}", e.getMessage());
            try (Statement stmt = conn.createStatement()) {
                stmt.executeQuery("SELECT 1 FROM " + tableName + " WHERE 1=0");
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }
    }

    /**
     * 根据推导字段自动在目标端建表
     */
    public static void createTargetTable(Connection conn,
                                         String dbType,
                                         String tableName,
                                         List<StatTaskColumnMappingDto> columnMappings,
                                         List<TableColumnDto> inferredColumns) throws SQLException {
        StringBuilder ddl = new StringBuilder();
        String quotedTable = StatDatasourceHelper.quoteIdentifier(dbType, tableName);
        ddl.append("CREATE TABLE ").append(quotedTable).append(" (\n");

        List<ColumnPair> pairs = buildActiveColumnPairs(columnMappings, inferredColumns, null);
        List<String> colDefs = new ArrayList<>();
        List<String> primaryKeys = new ArrayList<>();

        for (ColumnPair pair : pairs) {
            String quotedCol = StatDatasourceHelper.quoteIdentifier(dbType, pair.targetCol);
            String colType = StatDatasourceHelper.mapColumnTypeToDialect(dbType, pair.dataType);
            colDefs.add("  " + quotedCol + " " + colType);
            if (pair.isPrimaryKey) {
                primaryKeys.add(quotedCol);
            }
        }

        if (!primaryKeys.isEmpty()) {
            colDefs.add("  PRIMARY KEY (" + String.join(", ", primaryKeys) + ")");
        }

        ddl.append(String.join(",\n", colDefs));
        ddl.append("\n)");

        if (JdbcConstants.MYSQL.equalsIgnoreCase(dbType)) {
            ddl.append(" ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计任务自动生成表'");
        }

        String finalDdl = ddl.toString();
        logger.info("在目标库执行自动建表 DDL:\n{}", finalDdl);

        try (Statement stmt = conn.createStatement()) {
            stmt.execute(finalDdl);
        }
    }

    /**
     * 清空目标表数据 (OVERWRITE 模式)
     */
    private static void truncateTable(Connection conn, String dbType, String tableName) throws SQLException {
        String quotedTable = StatDatasourceHelper.quoteIdentifier(dbType, tableName);
        String truncateSql = "TRUNCATE TABLE " + quotedTable;
        try (Statement stmt = conn.createStatement()) {
            stmt.execute(truncateSql);
            logger.info("已清空目标表: {}", tableName);
        } catch (SQLException e) {
            // 部分数据库或外键约束可能不支持 TRUNCATE，降级为 DELETE FROM
            logger.warn("TRUNCATE 目标表失败，降级使用 DELETE 语句: {}", e.getMessage());
            try (Statement stmt = conn.createStatement()) {
                stmt.execute("DELETE FROM " + quotedTable);
            }
        }
    }

    /**
     * 构造 INSERT 或 UPSERT SQL 语句
     */
    private static String buildInsertSql(String dbType,
                                         String tableName,
                                         String writeMode,
                                         List<ColumnPair> pairs) {
        String quotedTable = StatDatasourceHelper.quoteIdentifier(dbType, tableName);
        StringBuilder sql = new StringBuilder();
        sql.append("INSERT INTO ").append(quotedTable).append(" (");

        for (int i = 0; i < pairs.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append(StatDatasourceHelper.quoteIdentifier(dbType, pairs.get(i).targetCol));
        }

        sql.append(") VALUES (");
        for (int i = 0; i < pairs.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append("?");
        }
        sql.append(")");

        // 处理 UPSERT 写入模式
        if ("UPSERT".equalsIgnoreCase(writeMode) && JdbcConstants.MYSQL.equalsIgnoreCase(dbType)) {
            sql.append(" ON DUPLICATE KEY UPDATE ");
            boolean first = true;
            for (ColumnPair pair : pairs) {
                if (pair.isPrimaryKey) {
                    continue; // 主键不更新
                }
                if (!first) sql.append(", ");
                String quotedCol = StatDatasourceHelper.quoteIdentifier(dbType, pair.targetCol);
                sql.append(quotedCol).append(" = VALUES(").append(quotedCol).append(")");
                first = false;
            }
        }

        return sql.toString();
    }

    /**
     * 构建有效的字段对应关系对
     */
    public static List<ColumnPair> buildActiveColumnPairs(List<StatTaskColumnMappingDto> columnMappings,
                                                          List<TableColumnDto> inferredColumns,
                                                          Map<String, Object> sampleRow) {
        List<ColumnPair> pairs = new ArrayList<>();

        if (columnMappings != null && !columnMappings.isEmpty()) {
            for (StatTaskColumnMappingDto mapping : columnMappings) {
                if (StringUtils.isNotBlank(mapping.getSourceCol()) && StringUtils.isNotBlank(mapping.getTargetCol())) {
                    ColumnPair pair = new ColumnPair();
                    pair.sourceCol = SqlSecurityUtil.validateIdentifier(mapping.getSourceCol());
                    pair.targetCol = SqlSecurityUtil.validateIdentifier(mapping.getTargetCol());
                    pair.dataType = StringUtils.isNotBlank(mapping.getDataType()) ? mapping.getDataType() : "VARCHAR";
                    pair.isPrimaryKey = Boolean.TRUE.equals(mapping.getIsPrimaryKey());
                    pairs.add(pair);
                }
            }
            return pairs;
        }

        // 若未提供显式映射，则从推导列或样本行自动推断同名字段
        if (inferredColumns != null && !inferredColumns.isEmpty()) {
            for (TableColumnDto col : inferredColumns) {
                ColumnPair pair = new ColumnPair();
                pair.sourceCol = SqlSecurityUtil.validateIdentifier(col.getColumnName());
                pair.targetCol = pair.sourceCol;
                pair.dataType = StringUtils.isNotBlank(col.getColumnType()) ? col.getColumnType() : "VARCHAR";
                pair.isPrimaryKey = Boolean.TRUE.equals(col.getIsPrimaryKey());
                pairs.add(pair);
            }
            return pairs;
        }

        if (sampleRow != null) {
            for (String key : sampleRow.keySet()) {
                ColumnPair pair = new ColumnPair();
                pair.sourceCol = SqlSecurityUtil.validateIdentifier(key);
                pair.targetCol = pair.sourceCol;
                pair.dataType = "VARCHAR";
                pair.isPrimaryKey = false;
                pairs.add(pair);
            }
        }

        return pairs;
    }

    /**
     * 对待写入目标库的原始值进行健壮性清洗与格式兼容转换
     * 特别针对各种 ISO-8601、带时区/毫秒的时间字符串 (如 2026-09-07T07:15:59.000+0000) 自动转换为标准 Timestamp，
     * 避免 MySQL 严格模式报 Data truncation: Incorrect datetime value 异常。
     *
     * @param rawVal 原始字段值
     * @param dataType 字段数据类型
     * @param colName 目标字段名
     * @return 转换后的值
     */
    public static Object cleanAndConvertValue(Object rawVal, String dataType, String colName) {
        if (rawVal == null) {
            return null;
        }

        String typeUpper = StringUtils.isNotBlank(dataType) ? dataType.toUpperCase().trim() : "";
        boolean isNumericField = typeUpper.contains("INT") || typeUpper.contains("DECIMAL")
                || typeUpper.contains("NUMERIC") || typeUpper.contains("DOUBLE")
                || typeUpper.contains("FLOAT") || typeUpper.contains("BIGINT");

        boolean isDateField = typeUpper.contains("DATE") || typeUpper.contains("TIME")
                || typeUpper.contains("TIMESTAMP");

        String colLower = colName != null ? colName.toLowerCase().trim() : "";
        boolean colNameSuggestsTime = (colLower.endsWith("time") || colLower.endsWith("date")
                || colLower.contains("_time") || colLower.contains("_date") || colLower.endsWith("at"))
                && !isNumericField; // 关键：如果目标表明确是数值字段(如 trigger_last_time bigint)，绝对不能当作日期转成字符串！

        // 1. 处理 String 类型的值
        if (rawVal instanceof String) {
            String strVal = ((String) rawVal).trim();
            // 空串与 "null" 字符串防御：对于数值类型或日期类型，空字符串必须转换为 null，否则 MySQL 必报 Data truncation / Incorrect integer value！
            if (StringUtils.isBlank(strVal) || "null".equalsIgnoreCase(strVal)) {
                return (isNumericField || isDateField) ? null : "";
            }

            // 1.1 目标列为数值类型 (BIGINT, INT, DECIMAL 等)
            if (isNumericField) {
                try {
                    if (typeUpper.contains("DOUBLE") || typeUpper.contains("FLOAT") || typeUpper.contains("DECIMAL")) {
                        return Double.parseDouble(strVal);
                    }
                    if (typeUpper.contains("BIGINT")) {
                        return Long.parseLong(strVal);
                    }
                    return Integer.parseInt(strVal);
                } catch (Exception e) {
                    logger.warn("数值字段 [{}] 无法将字符串 [{}] 转为数值，安全置为 null", colName, strVal);
                    return null;
                }
            }

            // 1.2 目标列为日期时间类型，或字段未指定类型但具备显著时间特征
            boolean isIsoTimeStr = (strVal.contains("T") && strVal.length() >= 19)
                    || (strVal.contains("+") && strVal.length() >= 15)
                    || (strVal.endsWith("Z") && strVal.length() >= 19);

            if (isDateField || colNameSuggestsTime || isIsoTimeStr) {
                // 纯数字时间戳字符串 (如 "1725700830000")
                if (StringUtils.isNumeric(strVal) && strVal.length() >= 10 && strVal.length() <= 13) {
                    try {
                        long longVal = Long.parseLong(strVal);
                        long millis = (longVal < 10000000000L) ? longVal * 1000 : longVal;
                        return DateUtil.format(new Date(millis), "yyyy-MM-dd HH:mm:ss");
                    } catch (Exception ignored) {
                    }
                }
                return parseToStandardDatetimeString(strVal);
            }

            return strVal;
        }

        // 2. 处理纯数字 (Long / Integer / Double)
        if (rawVal instanceof Number) {
            Number numVal = (Number) rawVal;
            // 目标字段是数值类型：按目标类型自适应强转
            if (isNumericField) {
                if (typeUpper.contains("BIGINT")) {
                    return numVal.longValue();
                }
                if (typeUpper.contains("DOUBLE") || typeUpper.contains("FLOAT") || typeUpper.contains("DECIMAL")) {
                    return numVal.doubleValue();
                }
                return numVal.intValue();
            }

            // 目标字段是时间类型 (如目标表是 DATETIME，但源数据给的是毫秒时间戳数字)
            if (isDateField || colNameSuggestsTime) {
                long longVal = numVal.longValue();
                if (longVal <= 0) {
                    return null; // 0 时间戳在 MySQL datetime 中非法，转为 null
                }
                if (longVal > 1000000000L && longVal < 4102416000000L) {
                    long millis = (longVal < 10000000000L) ? longVal * 1000 : longVal;
                    return DateUtil.format(new Date(millis), "yyyy-MM-dd HH:mm:ss");
                }
            }
            return rawVal;
        }

        // 3. 处理 Date 类型
        if (rawVal instanceof Date) {
            if (isNumericField) {
                return ((Date) rawVal).getTime();
            }
            return DateUtil.format((Date) rawVal, "yyyy-MM-dd HH:mm:ss");
        }

        return rawVal;
    }

    /**
     * 读取目标表的真实列类型映射 (列名全小写 -> 数据类型大写)
     *
     * @param conn 数据库连接
     * @param tableName 目标表名
     * @return 列类型映射字典
     */
    public static Map<String, String> getTargetTableColumnTypes(Connection conn, String tableName) {
        Map<String, String> colTypes = new HashMap<>();
        if (conn == null || StringUtils.isBlank(tableName)) {
            return colTypes;
        }
        try {
            DatabaseMetaData metaData = conn.getMetaData();
            try (ResultSet rs = metaData.getColumns(conn.getCatalog(), conn.getSchema(), tableName, "%")) {
                while (rs.next()) {
                    String colName = rs.getString("COLUMN_NAME");
                    String typeName = rs.getString("TYPE_NAME");
                    if (StringUtils.isNotBlank(colName) && StringUtils.isNotBlank(typeName)) {
                        colTypes.put(colName.toLowerCase().trim(), typeName.toUpperCase().trim());
                    }
                }
            }
            if (colTypes.isEmpty()) {
                try (ResultSet rs = metaData.getColumns(null, null, tableName.toUpperCase(), "%")) {
                    while (rs.next()) {
                        String colName = rs.getString("COLUMN_NAME");
                        String typeName = rs.getString("TYPE_NAME");
                        if (StringUtils.isNotBlank(colName) && StringUtils.isNotBlank(typeName)) {
                            colTypes.put(colName.toLowerCase().trim(), typeName.toUpperCase().trim());
                        }
                    }
                }
            }
            if (colTypes.isEmpty()) {
                try (ResultSet rs = metaData.getColumns(null, null, tableName.toLowerCase(), "%")) {
                    while (rs.next()) {
                        String colName = rs.getString("COLUMN_NAME");
                        String typeName = rs.getString("TYPE_NAME");
                        if (StringUtils.isNotBlank(colName) && StringUtils.isNotBlank(typeName)) {
                            colTypes.put(colName.toLowerCase().trim(), typeName.toUpperCase().trim());
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("读取目标表 [{}] 元数据列类型失败: {}", tableName, e.getMessage());
        }
        return colTypes;
    }

    /**
     * 智能时间字符串多模解析器 (公共方法)
     * 支持包含 ISO-8601、RFC-3339、带毫秒、带时区偏移 (+0000, +08:00, Z) 等异构时间字符串解析为标准 yyyy-MM-dd HH:mm:ss。
     * 采用模式串精确匹配 + 正则保底清洗双保险机制，杜绝老旧版本 Hutool 无法解析带时区格式导致的 Data truncation 错误。
     *
     * @param strVal 原始时间字符串
     * @return 格式化后的标准时间字符串 (yyyy-MM-dd HH:mm:ss) 或原始字符串
     */
    public static String parseToStandardDatetimeString(String strVal) {
        if (StringUtils.isBlank(strVal)) {
            return null;
        }
        String s = strVal.trim();

        // 1. 针对常见的 Fastjson/Jackson 复合 ISO 格式 (例如 2026-09-07T07:15:59.000+0000 或 2026-09-07T07:15:59Z)
        // 若以 yyyy-MM-ddTHH:mm:ss 形式开头，采用快速规范化提取 (保持本义时间，杜绝时区解析抖动与性能开销)
        if (s.length() >= 19 && s.charAt(4) == '-' && s.charAt(7) == '-' && (s.charAt(10) == 'T' || s.charAt(10) == ' ')
                && s.charAt(13) == ':' && s.charAt(16) == ':') {
            String datePart = s.substring(0, 10);
            String timePart = s.substring(11, 19);
            return datePart + " " + timePart;
        }

        // 2. 多 Pattern 尝试解析列表
        String[] patterns = new String[]{
                "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
                "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ssZ",
                "yyyy-MM-dd'T'HH:mm:ssXXX",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd HH:mm:ss.SSS",
                "yyyy-MM-dd HH:mm:ss",
                "yyyy/MM/dd HH:mm:ss",
                "yyyy-MM-dd",
                "yyyy/MM/dd"
        };

        for (String pattern : patterns) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(pattern, Locale.ROOT);
                Date d = sdf.parse(s);
                if (d != null) {
                    return DateUtil.format(d, "yyyy-MM-dd HH:mm:ss");
                }
            } catch (Exception ignored) {
            }
        }

        // 3. 兜底尝试 Hutool DateUtil
        try {
            Date parsedDate = DateUtil.parse(s);
            if (parsedDate != null) {
                return DateUtil.format(parsedDate, "yyyy-MM-dd HH:mm:ss");
            }
        } catch (Exception ignored) {
        }

        return s;
    }

    public static class ColumnPair {
        public String sourceCol;
        public String targetCol;
        public String dataType;
        public boolean isPrimaryKey;
    }
}
