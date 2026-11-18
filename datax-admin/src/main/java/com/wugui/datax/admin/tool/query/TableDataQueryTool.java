package com.wugui.datax.admin.tool.query;

import com.mongodb.MongoClient;
import com.mongodb.MongoClientURI;
import com.mongodb.MongoCredential;
import com.mongodb.ServerAddress;
import com.mongodb.client.FindIterable;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.wugui.datax.admin.core.util.LocalCacheUtil;
import com.wugui.datax.admin.dto.ExecuteSqlDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.dto.TableDataQueryDto;
import com.wugui.datax.admin.dto.TableDataResultDto;
import com.wugui.datax.admin.dto.TableInfoDto;
import com.wugui.datax.admin.dto.TableSchemaSnapshotDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.util.AESUtil;
import com.wugui.datax.admin.util.JdbcConstants;
import com.wugui.datax.admin.util.JdbcUtils;
import com.wugui.datax.admin.util.SqlSecurityUtil;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.commons.lang3.StringUtils;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.sql.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.Date;

/**
 * 多数据库通用库表数据与元数据查询工具
 *
 * @author ypc
 */
public class TableDataQueryTool {

    private static final Logger logger = LoggerFactory.getLogger(TableDataQueryTool.class);

    private final JobDatasource jobDatasource;
    private final String dbType;
    private Connection connection;

    public TableDataQueryTool(JobDatasource jobDatasource) throws SQLException {
        this.jobDatasource = jobDatasource;
        this.dbType = (jobDatasource.getDatasource() != null) ? jobDatasource.getDatasource().toUpperCase() : "";
        if (!JdbcConstants.MONGODB.equalsIgnoreCase(this.dbType)) {
            initConnection();
        }
    }

    /**
     * 初始化 JDBC 连接
     */
    private void initConnection() throws SQLException {
        String cacheKey = "TABLE_DATA_CONN_" + jobDatasource.getId();
        Object cachedConn = LocalCacheUtil.get(cacheKey);
        if (cachedConn instanceof Connection) {
            Connection conn = (Connection) cachedConn;
            try {
                if (conn.isValid(1000)) {
                    this.connection = conn;
                    return;
                }
            } catch (Exception ignored) {
            }
            LocalCacheUtil.remove(cacheKey);
        }

        String username = AESUtil.decrypt(jobDatasource.getJdbcUsername());
        String password = AESUtil.decrypt(jobDatasource.getJdbcPassword());

        HikariDataSource ds = new HikariDataSource();
        ds.setUsername(username);
        ds.setPassword(password);
        ds.setJdbcUrl(jobDatasource.getJdbcUrl());
        ds.setDriverClassName(jobDatasource.getJdbcDriverClass());
        ds.setMaximumPoolSize(2);
        ds.setMinimumIdle(0);
        ds.setConnectionTimeout(15000);
        ds.setIdleTimeout(60000);
        ds.setMaxLifetime(300000);

        this.connection = ds.getConnection();
        LocalCacheUtil.set(cacheKey, this.connection, 30 * 60 * 1000);
    }

    /**
     * 分页查询库表数据
     *
     * @param queryDto 查询请求对象
     * @return 查询结果
     */
    public TableDataResultDto queryTableData(TableDataQueryDto queryDto) throws Exception {
        long startTime = System.currentTimeMillis();
        TableDataResultDto result = new TableDataResultDto();
        result.setPageNo(queryDto.getPageNo());
        result.setPageSize(queryDto.getPageSize());
        result.setDbType(this.dbType);
        result.setTableName(queryDto.getTableName());
        result.setTableSchema(queryDto.getTableSchema());

        if (JdbcConstants.MONGODB.equalsIgnoreCase(this.dbType)) {
            return queryMongoData(queryDto, startTime);
        }

        // 1. 安全校验标识符与子句
        String safeTable = SqlSecurityUtil.validateIdentifier(queryDto.getTableName());
        String safeSchema = StringUtils.isNotBlank(queryDto.getTableSchema())
                ? SqlSecurityUtil.validateIdentifier(queryDto.getTableSchema()) : null;
        String safeWhere = SqlSecurityUtil.validateWhereClause(queryDto.getWhereClause());
        String safeOrderBy = SqlSecurityUtil.validateOrderBy(queryDto.getOrderBy());

        // 2. 统计总条数
        if (Boolean.TRUE.equals(queryDto.getCountTotal())) {
            result.setTotalCount(queryTotalCount(safeSchema, safeTable, safeWhere));
        }

        // 3. 构建列投影
        String columnsPart = "*";
        if (queryDto.getColumns() != null && !queryDto.getColumns().isEmpty()) {
            List<String> validCols = new ArrayList<>();
            for (String col : queryDto.getColumns()) {
                if (StringUtils.isNotBlank(col)) {
                    validCols.add(quoteIdentifier(SqlSecurityUtil.validateIdentifier(col)));
                }
            }
            if (!validCols.isEmpty()) {
                columnsPart = String.join(", ", validCols);
            }
        }

        // 4. 构建全限定表名与分页 SQL
        String fullTableName = buildFullTableName(safeSchema, safeTable);
        int pageNo = Math.max(1, queryDto.getPageNo() != null ? queryDto.getPageNo() : 1);
        int pageSize = Math.min(500, Math.max(1, queryDto.getPageSize() != null ? queryDto.getPageSize() : 20));
        int offset = (pageNo - 1) * pageSize;

        String pageSql = buildPaginationSql(columnsPart, fullTableName, safeWhere, safeOrderBy, offset, pageSize);
        logger.info("[TableDataQueryTool] 执行分页查询 SQL: {}", pageSql);

        // 5. 执行查询并解析结果
        Statement stmt = null;
        ResultSet rs = null;
        try {
            stmt = connection.createStatement();
            stmt.setQueryTimeout(30);
            stmt.setMaxRows(pageSize);
            rs = stmt.executeQuery(pageSql);

            // 获取字段元数据
            List<TableColumnDto> columns = extractColumnsFromResultSet(rs, safeSchema, safeTable);
            result.setColumns(columns);

            // 获取行数据
            List<Map<String, Object>> rows = extractRowsFromResultSet(rs, columns);
            result.setRows(rows);

        } finally {
            JdbcUtils.close(rs);
            JdbcUtils.close(stmt);
        }

        result.setExecuteTimeMs(System.currentTimeMillis() - startTime);
        return result;
    }

    /**
     * 执行只读自定义 SQL
     *
     * @param executeSqlDto SQL 请求对象
     * @return 查询结果
     */
    public TableDataResultDto executeReadOnlySql(ExecuteSqlDto executeSqlDto) throws Exception {
        long startTime = System.currentTimeMillis();
        String safeSql = SqlSecurityUtil.validateReadOnlySql(executeSqlDto.getSql());

        int pageNo = Math.max(1, executeSqlDto.getPageNo() != null ? executeSqlDto.getPageNo() : 1);
        int pageSize = Math.min(1000, Math.max(1, executeSqlDto.getPageSize() != null ? executeSqlDto.getPageSize() : 50));

        TableDataResultDto result = new TableDataResultDto();
        result.setPageNo(pageNo);
        result.setPageSize(pageSize);
        result.setDbType(this.dbType);

        Statement stmt = null;
        ResultSet rs = null;
        try {
            stmt = connection.createStatement();
            stmt.setQueryTimeout(30);
            stmt.setMaxRows(pageSize);

            rs = stmt.executeQuery(safeSql);
            List<TableColumnDto> columns = extractColumnsFromResultSet(rs, null, null);
            result.setColumns(columns);

            List<Map<String, Object>> rows = extractRowsFromResultSet(rs, columns);
            result.setRows(rows);
            result.setTotalCount((long) rows.size());

        } finally {
            JdbcUtils.close(rs);
            JdbcUtils.close(stmt);
        }

        result.setExecuteTimeMs(System.currentTimeMillis() - startTime);
        return result;
    }

    /**
     * 获取表字段详细元数据
     *
     * @param tableSchema Schema 名
     * @param tableName 表名
     * @return 字段列表
     */
    public List<TableColumnDto> getTableColumnsDetails(String tableSchema, String tableName) throws SQLException {
        String safeTable = SqlSecurityUtil.validateIdentifier(tableName);
        String safeSchema = StringUtils.isNotBlank(tableSchema)
                ? SqlSecurityUtil.validateIdentifier(tableSchema) : null;

        List<TableColumnDto> columnList = new ArrayList<>();
        DatabaseMetaData metaData = connection.getMetaData();

        // 获取主键集合
        Set<String> primaryKeys = new HashSet<>();
        ResultSet pkRs = null;
        try {
            pkRs = metaData.getPrimaryKeys(null, safeSchema, safeTable);
            while (pkRs.next()) {
                String pkName = pkRs.getString("COLUMN_NAME");
                if (StringUtils.isNotBlank(pkName)) {
                    primaryKeys.add(pkName.toUpperCase());
                }
            }
        } catch (Exception e) {
            logger.warn("获取表主键失败: {}", e.getMessage());
        } finally {
            JdbcUtils.close(pkRs);
        }

        // 获取列信息
        ResultSet colRs = null;
        try {
            colRs = metaData.getColumns(null, safeSchema, safeTable, "%");
            int index = 1;
            while (colRs.next()) {
                TableColumnDto dto = new TableColumnDto();
                String colName = colRs.getString("COLUMN_NAME");
                dto.setColumnIndex(index++);
                dto.setColumnName(colName);
                dto.setColumnType(colRs.getString("TYPE_NAME"));
                dto.setColumnSize(colRs.getInt("COLUMN_SIZE"));
                dto.setDecimalDigits(colRs.getInt("DECIMAL_DIGITS"));
                dto.setIsNullable("YES".equalsIgnoreCase(colRs.getString("IS_NULLABLE")));
                dto.setComment(colRs.getString("REMARKS"));
                dto.setDefaultValue(colRs.getString("COLUMN_DEF"));
                dto.setIsPrimaryKey(colName != null && primaryKeys.contains(colName.toUpperCase()));
                columnList.add(dto);
            }
        } finally {
            JdbcUtils.close(colRs);
        }

        return columnList;
    }

    /**
     * 获取指定库/Schema下的所有表及注释信息
     * 支持各主流数据库原生方言系统视图查询与 JDBC 标准元数据自动降级
     *
     * @param tableSchema Schema或库名 (可选)
     * @return 包含表名和注解说明的表信息列表
     */
    public List<TableInfoDto> getTablesWithComments(String tableSchema) {
        if (JdbcConstants.MONGODB.equalsIgnoreCase(this.dbType)) {
            return getMongoCollections();
        }

        List<TableInfoDto> resultList = new ArrayList<>();
        // 1. 优先尝试根据具体数据库方言的高效系统视图查询表注解
        try {
            List<TableInfoDto> dialectTables = queryTablesWithCommentsByDialect(tableSchema);
            if (dialectTables != null && !dialectTables.isEmpty()) {
                return dialectTables;
            }
        } catch (Exception e) {
            logger.warn("通过数据库方言视图获取表注解失败，转入 JDBC 标准元数据兜底: {}", e.getMessage());
        }

        // 2. JDBC 标准 DatabaseMetaData 兜底获取
        ResultSet rs = null;
        try {
            DatabaseMetaData metaData = connection.getMetaData();
            String catalog = connection.getCatalog();
            String schemaPattern = StringUtils.isNotBlank(tableSchema) ? tableSchema : null;
            rs = metaData.getTables(catalog, schemaPattern, "%", new String[]{"TABLE", "VIEW"});
            while (rs.next()) {
                String tableName = rs.getString("TABLE_NAME");
                if (StringUtils.isBlank(tableName)) {
                    continue;
                }
                // 排除部分系统的临时或回收站表 (如 Oracle BIN$ 开头)
                if (tableName.startsWith("BIN$")) {
                    continue;
                }
                String remarks = "";
                try {
                    remarks = rs.getString("REMARKS");
                } catch (Exception ignored) {
                }
                resultList.add(new TableInfoDto(tableName, remarks != null ? remarks : ""));
            }
        } catch (Exception e) {
            logger.error("JDBC 标准元数据获取表列表失败: {}", e.getMessage());
        } finally {
            JdbcUtils.close(rs);
        }

        resultList.sort(Comparator.comparing(TableInfoDto::getTableName, String.CASE_INSENSITIVE_ORDER));
        return resultList;
    }

    /**
     * 批量获取指定库下表结构详情（包含表注释与各表字段元数据）
     * 用于库表结构 Excel 导出
     *
     * @param tableSchema Schema或库名 (可选)
     * @param tableNames  指定表名列表 (可选，为空则获取当前库全部表)
     * @return 填充了字段元数据信息的表列表
     */
    public List<TableInfoDto> getDatabaseFullSchema(String tableSchema, List<String> tableNames) throws SQLException {
        List<TableInfoDto> allTables = getTablesWithComments(tableSchema);
        if (allTables == null || allTables.isEmpty()) {
            return Collections.emptyList();
        }

        Set<String> filterSet = null;
        if (tableNames != null && !tableNames.isEmpty()) {
            filterSet = new HashSet<>();
            for (String tn : tableNames) {
                if (StringUtils.isNotBlank(tn)) {
                    filterSet.add(tn.trim().toUpperCase());
                }
            }
        }

        List<TableInfoDto> result = new ArrayList<>();
        for (TableInfoDto table : allTables) {
            String tName = table.getTableName();
            if (StringUtils.isBlank(tName)) {
                continue;
            }
            if (filterSet != null && !filterSet.contains(tName.toUpperCase())) {
                continue;
            }

            try {
                List<TableColumnDto> columns = getTableColumnsDetails(tableSchema, tName);
                table.setColumns(columns != null ? columns : Collections.emptyList());
            } catch (Exception e) {
                logger.warn("读取数据表 [{}] 字段结构元数据失败: {}", tName, e.getMessage());
                table.setColumns(Collections.emptyList());
            }
            result.add(table);
        }
        return result;
    }

    /**
     * 根据具体数据库方言查询表名与表注解
     *
     * @param tableSchema Schema名 (可选)
     * @return 表信息列表
     */
    private List<TableInfoDto> queryTablesWithCommentsByDialect(String tableSchema) throws SQLException {
        List<TableInfoDto> list = new ArrayList<>();
        Statement stmt = null;
        PreparedStatement pstmt = null;
        ResultSet rs = null;

        try {
            if (JdbcConstants.MYSQL.equalsIgnoreCase(this.dbType) || this.dbType.contains("MYSQL")) {
                String schema = StringUtils.isNotBlank(tableSchema) ? tableSchema : connection.getCatalog();
                if (StringUtils.isBlank(schema)) {
                    stmt = connection.createStatement();
                    rs = stmt.executeQuery("SELECT DATABASE()");
                    if (rs.next()) {
                        schema = rs.getString(1);
                    }
                    JdbcUtils.close(rs);
                    JdbcUtils.close(stmt);
                }
                if (StringUtils.isNotBlank(schema)) {
                    String sql = "SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE IN ('BASE TABLE', 'VIEW') ORDER BY TABLE_NAME ASC";
                    pstmt = connection.prepareStatement(sql);
                    pstmt.setString(1, schema);
                    rs = pstmt.executeQuery();
                    while (rs.next()) {
                        list.add(new TableInfoDto(rs.getString("TABLE_NAME"), rs.getString("TABLE_COMMENT")));
                    }
                    return list;
                }
            } else if (JdbcConstants.ORACLE.equalsIgnoreCase(this.dbType) || this.dbType.contains("ORACLE")) {
                if (StringUtils.isNotBlank(tableSchema)) {
                    String sql = "SELECT TABLE_NAME, COMMENTS FROM ALL_TAB_COMMENTS WHERE OWNER = ? AND TABLE_TYPE IN ('TABLE', 'VIEW') AND TABLE_NAME NOT LIKE 'BIN$%' ORDER BY TABLE_NAME ASC";
                    pstmt = connection.prepareStatement(sql);
                    pstmt.setString(1, tableSchema.toUpperCase());
                    rs = pstmt.executeQuery();
                } else {
                    String sql = "SELECT TABLE_NAME, COMMENTS FROM USER_TAB_COMMENTS WHERE TABLE_TYPE IN ('TABLE', 'VIEW') AND TABLE_NAME NOT LIKE 'BIN$%' ORDER BY TABLE_NAME ASC";
                    stmt = connection.createStatement();
                    rs = stmt.executeQuery(sql);
                }
                while (rs.next()) {
                    list.add(new TableInfoDto(rs.getString("TABLE_NAME"), rs.getString("COMMENTS")));
                }
                return list;
            } else if (JdbcConstants.POSTGRESQL.equalsIgnoreCase(this.dbType) || this.dbType.contains("POSTGRE")) {
                String schema = StringUtils.isNotBlank(tableSchema) ? tableSchema : "public";
                String sql = "SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS table_comment " +
                        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
                        "WHERE n.nspname = ? AND c.relkind IN ('r', 'v', 'm') AND c.relname NOT LIKE 'pg_%' AND c.relname NOT LIKE 'sql_%' " +
                        "ORDER BY c.relname ASC";
                pstmt = connection.prepareStatement(sql);
                pstmt.setString(1, schema);
                rs = pstmt.executeQuery();
                while (rs.next()) {
                    list.add(new TableInfoDto(rs.getString("table_name"), rs.getString("table_comment")));
                }
                return list;

            } else if (JdbcConstants.SQL_SERVER.equalsIgnoreCase(this.dbType) || this.dbType.contains("SQLSERVER")) {
                String sql = "SELECT t.name AS table_name, CAST(ep.value AS VARCHAR(500)) AS table_comment " +
                        "FROM sys.tables t LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description' " +
                        "ORDER BY t.name ASC";
                stmt = connection.createStatement();
                rs = stmt.executeQuery(sql);
                while (rs.next()) {
                    list.add(new TableInfoDto(rs.getString("table_name"), rs.getString("table_comment")));
                }
                return list;
            }
        } finally {
            JdbcUtils.close(rs);
            JdbcUtils.close(stmt);
            JdbcUtils.close(pstmt);
        }
        return list;
    }

    /**
     * 获取 MongoDB 集合列表 (公共方法)
     *
     * @return 集合列表对象
     */
    private List<TableInfoDto> getMongoCollections() {
        List<TableInfoDto> list = new ArrayList<>();
        MongoClient client = null;
        try {
            client = createMongoClient();
            MongoDatabase db = client.getDatabase(jobDatasource.getDatabaseName());
            for (String name : db.listCollectionNames()) {
                list.add(new TableInfoDto(name, ""));
            }
            list.sort(Comparator.comparing(TableInfoDto::getTableName, String.CASE_INSENSITIVE_ORDER));
        } catch (Exception e) {
            logger.error("获取 MongoDB 集合列表失败: {}", e.getMessage());
        } finally {
            if (client != null) {
                client.close();
            }
        }
        return list;
    }

    /**
     * 创建 MongoDB 客户端连接 (公共方法)
     */
    private MongoClient createMongoClient() {
        if (StringUtils.isBlank(jobDatasource.getJdbcUsername()) && StringUtils.isBlank(jobDatasource.getJdbcPassword())) {
            return new MongoClient(new MongoClientURI(jobDatasource.getJdbcUrl()));
        } else {
            String username = AESUtil.decrypt(jobDatasource.getJdbcUsername());
            String password = AESUtil.decrypt(jobDatasource.getJdbcPassword());
            MongoCredential credential = MongoCredential.createCredential(username, jobDatasource.getDatabaseName(), password.toCharArray());
            return new MongoClient(parseServerAddress(jobDatasource.getJdbcUrl()), Collections.singletonList(credential));
        }
    }

    /**
     * 获取表总记录数
     */
    public Long queryTotalCount(String schema, String tableName, String whereClause) {
        String fullTable = buildFullTableName(schema, tableName);
        StringBuilder countSql = new StringBuilder("SELECT COUNT(1) FROM ").append(fullTable);
        if (StringUtils.isNotBlank(whereClause)) {
            countSql.append(" WHERE ").append(whereClause);
        }

        Statement stmt = null;
        ResultSet rs = null;
        try {
            stmt = connection.createStatement();
            stmt.setQueryTimeout(10);
            rs = stmt.executeQuery(countSql.toString());
            if (rs.next()) {
                return rs.getLong(1);
            }
        } catch (Exception e) {
            logger.warn("统计表总记录数失败或超时: {}", e.getMessage());
        } finally {
            JdbcUtils.close(rs);
            JdbcUtils.close(stmt);
        }
        return -1L;
    }

    /**
     * 构建全限定表名
     */
    private String buildFullTableName(String schema, String tableName) {
        if (StringUtils.isNotBlank(schema)) {
            return quoteIdentifier(schema) + "." + quoteIdentifier(tableName);
        }
        return quoteIdentifier(tableName);
    }

    /**
     * 为标识符添加安全转义引号
     */
    private String quoteIdentifier(String identifier) {
        if (StringUtils.isBlank(identifier)) {
            return identifier;
        }
        if (JdbcConstants.MYSQL.equalsIgnoreCase(dbType) || JdbcConstants.CLICKHOUSE.equalsIgnoreCase(dbType)) {
            return "`" + identifier.replace("`", "``") + "`";
        } else if (JdbcConstants.POSTGRESQL.equalsIgnoreCase(dbType)
                || JdbcConstants.ORACLE.equalsIgnoreCase(dbType)
                || JdbcConstants.HBASE20XSQL.equalsIgnoreCase(dbType)) {
            return "\"" + identifier.replace("\"", "\"\"") + "\"";
        } else if (JdbcConstants.SQL_SERVER.equalsIgnoreCase(dbType)) {
            return "[" + identifier.replace("]", "]]") + "]";
        }
        return identifier;
    }

    /**
     * 根据多数据库方言构建分页 SQL
     */
    private String buildPaginationSql(String columns, String fullTable, String where, String orderBy, int offset, int limit) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ").append(columns).append(" FROM ").append(fullTable);

        if (StringUtils.isNotBlank(where)) {
            sql.append(" WHERE ").append(where);
        }
        if (StringUtils.isNotBlank(orderBy)) {
            sql.append(" ORDER BY ").append(orderBy);
        }

        String baseSql = sql.toString();

        if (JdbcConstants.MYSQL.equalsIgnoreCase(dbType)
                || JdbcConstants.CLICKHOUSE.equalsIgnoreCase(dbType)
                || JdbcConstants.HIVE.equalsIgnoreCase(dbType)) {
            return baseSql + " LIMIT " + offset + ", " + limit;
        } else if (JdbcConstants.POSTGRESQL.equalsIgnoreCase(dbType) || "SQLITE".equalsIgnoreCase(dbType)) {
            return baseSql + " LIMIT " + limit + " OFFSET " + offset;
        } else if (JdbcConstants.ORACLE.equalsIgnoreCase(dbType)) {
            // Oracle 12c+ 兼容分页 / ROWNUM 子查询
            int endRow = offset + limit;
            return "SELECT * FROM (SELECT a.*, ROWNUM rnum FROM (" + baseSql + ") a WHERE ROWNUM <= " + endRow + ") WHERE rnum > " + offset;
        } else if (JdbcConstants.SQL_SERVER.equalsIgnoreCase(dbType)) {
            if (StringUtils.isBlank(orderBy)) {
                return baseSql + " ORDER BY (SELECT NULL) OFFSET " + offset + " ROWS FETCH NEXT " + limit + " ROWS ONLY";
            }
            return baseSql + " OFFSET " + offset + " ROWS FETCH NEXT " + limit + " ROWS ONLY";
        }

        // 通用降级
        return baseSql + " LIMIT " + limit;
    }

    /**
     * 从 ResultSetMetaData 提取列元数据
     */
    /**
     * 从 ResultSetMetaData 提取列元数据，并补充主键及字段注释信息
     */
    private List<TableColumnDto> extractColumnsFromResultSet(ResultSet rs, String schema, String table) throws SQLException {
        List<TableColumnDto> columns = new ArrayList<>();
        ResultSetMetaData md = rs.getMetaData();
        int count = md.getColumnCount();

        Set<String> primaryKeys = new HashSet<>();
        Map<String, String> columnComments = new HashMap<>();

        if (StringUtils.isNotBlank(table) && connection != null) {
            try {
                DatabaseMetaData dbMeta = connection.getMetaData();
                // 1. 获取主键列集合
                try (ResultSet pkRs = dbMeta.getPrimaryKeys(null, schema, table)) {
                    while (pkRs != null && pkRs.next()) {
                        String pkName = pkRs.getString("COLUMN_NAME");
                        if (StringUtils.isNotBlank(pkName)) {
                            primaryKeys.add(pkName.toUpperCase());
                        }
                    }
                }
                // 2. 获取字段注释与描述信息
                try (ResultSet colRs = dbMeta.getColumns(null, schema, table, "%")) {
                    while (colRs != null && colRs.next()) {
                        String cName = colRs.getString("COLUMN_NAME");
                        String remarks = colRs.getString("REMARKS");
                        if (StringUtils.isNotBlank(cName) && StringUtils.isNotBlank(remarks)) {
                            columnComments.put(cName.toUpperCase(), remarks);
                        }
                    }
                }
            } catch (Exception ignored) {
            }

            // 针对 MySQL，若常规元数据未能获取到备注，通过 SHOW FULL COLUMNS 强力补充
            if (columnComments.isEmpty() && JdbcConstants.MYSQL.equalsIgnoreCase(dbType)) {
                try (Statement stmt = connection.createStatement();
                     ResultSet fullColRs = stmt.executeQuery("SHOW FULL COLUMNS FROM " + quoteIdentifier(table))) {
                    while (fullColRs.next()) {
                        String fName = fullColRs.getString("Field");
                        String fComment = fullColRs.getString("Comment");
                        if (StringUtils.isNotBlank(fName) && StringUtils.isNotBlank(fComment)) {
                            columnComments.put(fName.toUpperCase(), fComment);
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        }

        for (int i = 1; i <= count; i++) {
            TableColumnDto dto = new TableColumnDto();
            String label = md.getColumnLabel(i);
            String name = md.getColumnName(i);
            String colName = StringUtils.isNotBlank(label) ? label : name;

            dto.setColumnIndex(i);
            dto.setColumnName(colName);
            dto.setColumnType(md.getColumnTypeName(i));
            dto.setColumnSize(md.getColumnDisplaySize(i));
            dto.setIsNullable(md.isNullable(i) == ResultSetMetaData.columnNullable);
            dto.setIsPrimaryKey(primaryKeys.contains(colName.toUpperCase()));
            dto.setComment(columnComments.get(colName.toUpperCase()));
            columns.add(dto);
        }
        return columns;
    }

    /**
     * 从 ResultSet 提取行数据，并对特殊类型进行安全转换
     */
    private List<Map<String, Object>> extractRowsFromResultSet(ResultSet rs, List<TableColumnDto> columns) throws SQLException {
        List<Map<String, Object>> rows = new ArrayList<>();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (TableColumnDto col : columns) {
                Object val = rs.getObject(col.getColumnName());
                if (val == null) {
                    row.put(col.getColumnName(), null);
                    continue;
                }

                // 日期时间安全格式化
                if (val instanceof java.sql.Timestamp) {
                    row.put(col.getColumnName(), sdf.format((Date) val));
                } else if (val instanceof java.sql.Date) {
                    row.put(col.getColumnName(), val.toString());
                } else if (val instanceof java.sql.Time) {
                    row.put(col.getColumnName(), val.toString());
                } else if (val instanceof Clob) {
                    Clob clob = (Clob) val;
                    row.put(col.getColumnName(), clob.getSubString(1, (int) Math.min(clob.length(), 4000)));
                } else if (val instanceof Blob) {
                    row.put(col.getColumnName(), "[BLOB 二进制数据]");
                } else if (val instanceof byte[]) {
                    row.put(col.getColumnName(), "[BINARY " + ((byte[]) val).length + " 字节]");
                } else {
                    row.put(col.getColumnName(), String.valueOf(val));
                }
            }
            rows.add(row);
        }
        return rows;
    }

    /**
     * MongoDB 数据集查询实现
     */
    private TableDataResultDto queryMongoData(TableDataQueryDto queryDto, long startTime) throws IOException {
        TableDataResultDto result = new TableDataResultDto();
        result.setPageNo(queryDto.getPageNo());
        result.setPageSize(queryDto.getPageSize());
        result.setDbType(JdbcConstants.MONGODB);
        result.setTableName(queryDto.getTableName());
        result.setTableSchema(jobDatasource.getDatabaseName());

        MongoClient client = null;
        try {
            client = createMongoClient();

            MongoDatabase db = client.getDatabase(jobDatasource.getDatabaseName());
            MongoCollection<Document> collection = db.getCollection(queryDto.getTableName());
            long total = 0;
            try {
                total = collection.count();
            } catch (Throwable t) {
                try {
                    total = (Long) collection.getClass().getMethod("countDocuments").invoke(collection);
                } catch (Throwable ignored) {
                }
            }
            result.setTotalCount(total);

            int pageNo = Math.max(1, queryDto.getPageNo() != null ? queryDto.getPageNo() : 1);
            int pageSize = Math.min(500, Math.max(1, queryDto.getPageSize() != null ? queryDto.getPageSize() : 20));
            int skip = (pageNo - 1) * pageSize;

            FindIterable<Document> docs = collection.find().skip(skip).limit(pageSize);

            List<Map<String, Object>> rows = new ArrayList<>();
            Set<String> allKeys = new LinkedHashSet<>();
            for (Document doc : docs) {
                Map<String, Object> map = new LinkedHashMap<>();
                doc.forEach((k, v) -> {
                    allKeys.add(k);
                    map.put(k, v != null ? String.valueOf(v) : null);
                });
                rows.add(map);
            }

            List<TableColumnDto> columns = new ArrayList<>();
            int idx = 1;
            for (String key : allKeys) {
                TableColumnDto col = new TableColumnDto();
                col.setColumnIndex(idx++);
                col.setColumnName(key);
                col.setColumnType("_id".equals(key) ? "ObjectId" : "String");
                col.setIsPrimaryKey("_id".equals(key));
                col.setIsNullable(!"_id".equals(key));
                columns.add(col);
            }

            result.setColumns(columns);
            result.setRows(rows);

        } finally {
            if (client != null) {
                client.close();
            }
        }

        result.setExecuteTimeMs(System.currentTimeMillis() - startTime);
        return result;
    }

    private static List<ServerAddress> parseServerAddress(String rawAddress) {
        List<ServerAddress> addressList = new ArrayList<>();
        for (String address : Arrays.asList(rawAddress.split(","))) {
            String[] tempAddress = address.split(":");
            addressList.add(new ServerAddress(tempAddress[0], Integer.parseInt(tempAddress[1])));
        }
        return addressList;
    }

    /**
     * 获取单张物理表的完整结构快照（表注释、字段注释、完整字段类型含精度/长度、可空性、默认值与扩展属性）
     * 支持 MySQL、Doris、StarRocks、Hive、ClickHouse、Oracle、PostgreSQL、SQL Server
     *
     * @param tableSchema Schema 或库名（可选）
     * @param tableName   物理表名
     * @return 单表结构快照
     * @throws SQLException SQL 查询异常
     */
    public TableSchemaSnapshotDto getSingleTableSchemaSnapshot(String tableSchema, String tableName) throws SQLException {
        String safeTable = SqlSecurityUtil.validateIdentifier(tableName);
        String safeSchema = StringUtils.isNotBlank(tableSchema)
                ? SqlSecurityUtil.validateIdentifier(tableSchema) : null;

        TableSchemaSnapshotDto snapshot = new TableSchemaSnapshotDto();
        snapshot.setDbType(this.dbType);
        snapshot.setTableName(safeTable);

        if (JdbcConstants.MONGODB.equalsIgnoreCase(this.dbType)) {
            snapshot.setTableComment("");
            snapshot.setColumns(Collections.emptyList());
            return snapshot;
        }

        if (isMysqlProtocolDialect(this.dbType)) {
            snapshot.setTableComment(querySingleMysqlTableComment(safeSchema, safeTable));
            snapshot.setColumns(queryMysqlFullColumns(safeTable));
            return snapshot;
        }

        if (JdbcConstants.HIVE.equalsIgnoreCase(this.dbType)) {
            snapshot.setTableComment(queryHiveTableComment(safeTable));
            snapshot.setColumns(queryHiveColumns(safeTable));
            return snapshot;
        }

        if (JdbcConstants.CLICKHOUSE.equalsIgnoreCase(this.dbType)) {
            snapshot.setTableComment(queryClickHouseTableComment(safeTable));
            snapshot.setColumns(queryClickHouseColumns(safeTable));
            return snapshot;
        }

        // Oracle / PostgreSQL / SQL Server 及其他 JDBC 通用方言
        snapshot.setTableComment(querySingleDialectOrJdbcTableComment(safeSchema, safeTable));
        List<TableColumnDto> cols = getTableColumnsDetails(safeSchema, safeTable);
        if (cols != null) {
            enrichDialectColumnDetails(safeSchema, safeTable, cols);
        }
        snapshot.setColumns(cols != null ? cols : Collections.emptyList());
        return snapshot;
    }

    private boolean isMysqlProtocolDialect(String type) {
        if (StringUtils.isBlank(type)) {
            return false;
        }
        return JdbcConstants.MYSQL.equalsIgnoreCase(type)
                || type.contains("MYSQL")
                || "DORIS".equalsIgnoreCase(type)
                || "STARROCKS".equalsIgnoreCase(type);
    }

    private String querySingleMysqlTableComment(String tableSchema, String tableName) {
        Statement stmt = null;
        PreparedStatement pstmt = null;
        ResultSet rs = null;
        try {
            String schema = StringUtils.isNotBlank(tableSchema) ? tableSchema : connection.getCatalog();
            if (StringUtils.isBlank(schema)) {
                stmt = connection.createStatement();
                rs = stmt.executeQuery("SELECT DATABASE()");
                if (rs.next()) {
                    schema = rs.getString(1);
                }
                JdbcUtils.close(rs);
                JdbcUtils.close(stmt);
                rs = null;
                stmt = null;
            }
            if (StringUtils.isNotBlank(schema)) {
                String sql = "SELECT TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?";
                pstmt = connection.prepareStatement(sql);
                pstmt.setString(1, schema);
                pstmt.setString(2, tableName);
                rs = pstmt.executeQuery();
                if (rs.next()) {
                    return StringUtils.defaultString(rs.getString(1));
                }
            }
        } catch (Exception e) {
            logger.warn("获取 MySQL/Doris 表 [{}] 注释失败: {}", tableName, e.getMessage());
        } finally {
            JdbcUtils.close(rs);
            JdbcUtils.close(stmt);
            JdbcUtils.close(pstmt);
        }
        return "";
    }

    private List<TableColumnDto> queryMysqlFullColumns(String tableName) throws SQLException {
        List<TableColumnDto> list = new ArrayList<>();
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery("SHOW FULL COLUMNS FROM `" + tableName + "`")) {
            int idx = 1;
            while (rs.next()) {
                TableColumnDto dto = new TableColumnDto();
                dto.setColumnIndex(idx++);
                dto.setColumnName(rs.getString("Field"));
                String fullType = rs.getString("Type");
                dto.setFullType(fullType);
                dto.setColumnType(extractBaseTypeName(fullType));
                dto.setIsNullable(!"NO".equalsIgnoreCase(rs.getString("Null")));
                dto.setIsPrimaryKey("PRI".equalsIgnoreCase(rs.getString("Key")));
                dto.setDefaultValue(rs.getString("Default"));
                dto.setExtra(rs.getString("Extra"));
                dto.setComment(StringUtils.defaultString(rs.getString("Comment")));
                list.add(dto);
            }
        }
        return list;
    }

    private String queryHiveTableComment(String tableName) {
        List<String[]> rows = new ArrayList<>();
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery("DESC FORMATTED `" + tableName + "`")) {
            while (rs.next()) {
                String c1 = rs.getString(1);
                String c2 = rs.getMetaData().getColumnCount() >= 2 ? rs.getString(2) : null;
                String c3 = rs.getMetaData().getColumnCount() >= 3 ? rs.getString(3) : null;
                rows.add(new String[]{c1, c2, c3});
            }
        } catch (Exception e) {
            logger.warn("读取 Hive 表 [{}] DESC FORMATTED 失败: {}", tableName, e.getMessage());
        }
        return parseHiveDescFormattedComment(rows);
    }

    /**
     * 解析 Hive DESC FORMATTED 输出中的表级 comment（静态方法便于单元测试）
     *
     * @param rows DESC FORMATTED 行列表 [col1, col2, col3]
     * @return 表注释（未找到返回空串）
     */
    public static String parseHiveDescFormattedComment(List<String[]> rows) {
        if (rows == null || rows.isEmpty()) {
            return "";
        }
        boolean inTableParams = false;
        for (String[] row : rows) {
            if (row == null || row.length == 0) {
                continue;
            }
            String c1 = row[0] != null ? row[0].trim() : "";
            String c2 = row.length > 1 && row[1] != null ? row[1].trim() : "";
            String c3 = row.length > 2 && row[2] != null ? row[2].trim() : "";
            if (c1.startsWith("Table Parameters:")) {
                inTableParams = true;
                if ("comment".equalsIgnoreCase(c2)) {
                    return c3;
                }
                continue;
            }
            if (inTableParams) {
                if (c1.startsWith("#") || StringUtils.isNotBlank(c1)) {
                    inTableParams = false;
                } else if ("comment".equalsIgnoreCase(c2)) {
                    return c3;
                }
            }
        }
        return "";
    }

    private List<TableColumnDto> queryHiveColumns(String tableName) throws SQLException {
        List<TableColumnDto> list = new ArrayList<>();
        Set<String> seenCols = new HashSet<>();
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery("DESC `" + tableName + "`")) {
            int idx = 1;
            int colCount = rs.getMetaData().getColumnCount();
            while (rs.next()) {
                String colName = rs.getString(1);
                if (StringUtils.isBlank(colName)) {
                    continue;
                }
                String trimmed = colName.trim();
                if (trimmed.startsWith("#")) {
                    continue;
                }
                if (!seenCols.add(trimmed.toLowerCase())) {
                    continue;
                }
                String dataType = colCount >= 2 ? StringUtils.trimToEmpty(rs.getString(2)) : "string";
                String comment = colCount >= 3 ? StringUtils.trimToEmpty(rs.getString(3)) : "";
                TableColumnDto dto = new TableColumnDto();
                dto.setColumnIndex(idx++);
                dto.setColumnName(trimmed);
                dto.setFullType(dataType);
                dto.setColumnType(extractBaseTypeName(dataType));
                dto.setIsNullable(true);
                dto.setIsPrimaryKey(false);
                dto.setComment(comment);
                list.add(dto);
            }
        }
        return list;
    }

    private String queryClickHouseTableComment(String tableName) {
        String sql = "SELECT comment FROM system.tables WHERE database = currentDatabase() AND name = ?";
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, tableName);
            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    return StringUtils.defaultString(rs.getString(1));
                }
            }
        } catch (Exception e) {
            logger.warn("读取 ClickHouse 表 [{}] 注释失败: {}", tableName, e.getMessage());
        }
        return "";
    }

    private List<TableColumnDto> queryClickHouseColumns(String tableName) throws SQLException {
        List<TableColumnDto> list = new ArrayList<>();
        String sql = "SELECT name, type, comment, default_expression FROM system.columns WHERE database = currentDatabase() AND table = ? ORDER BY position ASC";
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, tableName);
            try (ResultSet rs = pstmt.executeQuery()) {
                int idx = 1;
                while (rs.next()) {
                    String name = rs.getString("name");
                    String rawType = StringUtils.trimToEmpty(rs.getString("type"));
                    TableColumnDto dto = new TableColumnDto();
                    dto.setColumnIndex(idx++);
                    dto.setColumnName(name);
                    dto.setFullType(rawType);
                    dto.setColumnType(extractBaseTypeName(unwrapClickHouseNullable(rawType)));
                    dto.setIsNullable(rawType.startsWith("Nullable("));
                    dto.setComment(StringUtils.defaultString(rs.getString("comment")));
                    dto.setDefaultValue(rs.getString("default_expression"));
                    dto.setIsPrimaryKey(false);
                    list.add(dto);
                }
            }
        }
        return list;
    }

    private String unwrapClickHouseNullable(String rawType) {
        if (rawType != null && rawType.startsWith("Nullable(") && rawType.endsWith(")")) {
            return rawType.substring("Nullable(".length(), rawType.length() - 1).trim();
        }
        return rawType;
    }

    private String querySingleDialectOrJdbcTableComment(String tableSchema, String tableName) {
        try {
            List<TableInfoDto> tables = queryTablesWithCommentsByDialect(tableSchema);
            if (tables != null) {
                for (TableInfoDto t : tables) {
                    if (tableName.equalsIgnoreCase(t.getTableName())) {
                        return StringUtils.defaultString(t.getTableComment());
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("按方言查询表 [{}] 注释失败，降级 JDBC: {}", tableName, e.getMessage());
        }
        try {
            DatabaseMetaData metaData = connection.getMetaData();
            String catalog = connection.getCatalog();
            try (ResultSet rs = metaData.getTables(catalog, tableSchema, tableName, new String[]{"TABLE", "VIEW"})) {
                if (rs.next()) {
                    return StringUtils.defaultString(rs.getString("REMARKS"));
                }
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private void enrichDialectColumnDetails(String tableSchema, String tableName, List<TableColumnDto> cols) {
        Map<String, String> dialectComments = queryDialectColumnComments(tableSchema, tableName);
        for (TableColumnDto col : cols) {
            if (StringUtils.isBlank(col.getFullType())) {
                col.setFullType(formatFullColumnType(col.getColumnType(), col.getColumnSize(), col.getDecimalDigits(), this.dbType));
            }
            if (StringUtils.isBlank(col.getComment()) && col.getColumnName() != null) {
                String c = dialectComments.get(col.getColumnName().toLowerCase());
                if (c != null) {
                    col.setComment(c);
                }
            }
        }
    }

    private Map<String, String> queryDialectColumnComments(String tableSchema, String tableName) {
        Map<String, String> map = new HashMap<>();
        PreparedStatement pstmt = null;
        ResultSet rs = null;
        try {
            if (JdbcConstants.POSTGRESQL.equalsIgnoreCase(this.dbType) || this.dbType.contains("POSTGRE")) {
                String schema = StringUtils.isNotBlank(tableSchema) ? tableSchema : "public";
                String sql = "SELECT a.attname AS col_name, col_description(c.oid, a.attnum) AS col_comment " +
                        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
                        "JOIN pg_attribute a ON a.attrelid = c.oid " +
                        "WHERE n.nspname = ? AND c.relname = ? AND a.attnum > 0 AND NOT a.attisdropped";
                pstmt = connection.prepareStatement(sql);
                pstmt.setString(1, schema);
                pstmt.setString(2, tableName);
                rs = pstmt.executeQuery();
                while (rs.next()) {
                    String name = rs.getString("col_name");
                    String comment = rs.getString("col_comment");
                    if (StringUtils.isNotBlank(name) && comment != null) {
                        map.put(name.toLowerCase(), comment);
                    }
                }
            } else if (JdbcConstants.ORACLE.equalsIgnoreCase(this.dbType) || this.dbType.contains("ORACLE")) {
                String sql = StringUtils.isNotBlank(tableSchema)
                        ? "SELECT COLUMN_NAME, COMMENTS FROM ALL_COL_COMMENTS WHERE OWNER = ? AND TABLE_NAME = ?"
                        : "SELECT COLUMN_NAME, COMMENTS FROM USER_COL_COMMENTS WHERE TABLE_NAME = ?";
                pstmt = connection.prepareStatement(sql);
                if (StringUtils.isNotBlank(tableSchema)) {
                    pstmt.setString(1, tableSchema.toUpperCase());
                    pstmt.setString(2, tableName.toUpperCase());
                } else {
                    pstmt.setString(1, tableName.toUpperCase());
                }
                rs = pstmt.executeQuery();
                while (rs.next()) {
                    String name = rs.getString("COLUMN_NAME");
                    String comment = rs.getString("COMMENTS");
                    if (StringUtils.isNotBlank(name) && comment != null) {
                        map.put(name.toLowerCase(), comment);
                    }
                }
            } else if (JdbcConstants.SQL_SERVER.equalsIgnoreCase(this.dbType) || this.dbType.contains("SQLSERVER")) {
                String schema = StringUtils.isNotBlank(tableSchema) ? tableSchema : "dbo";
                String sql = "SELECT c.name AS col_name, CAST(ep.value AS NVARCHAR(1000)) AS col_comment " +
                        "FROM sys.tables t " +
                        "JOIN sys.schemas s ON s.schema_id = t.schema_id " +
                        "JOIN sys.columns c ON c.object_id = t.object_id " +
                        "LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description' " +
                        "WHERE s.name = ? AND t.name = ?";
                pstmt = connection.prepareStatement(sql);
                pstmt.setString(1, schema);
                pstmt.setString(2, tableName);
                rs = pstmt.executeQuery();
                while (rs.next()) {
                    String name = rs.getString("col_name");
                    String comment = rs.getString("col_comment");
                    if (StringUtils.isNotBlank(name) && comment != null) {
                        map.put(name.toLowerCase(), comment);
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("查询表 [{}] 方言列注释失败: {}", tableName, e.getMessage());
        } finally {
            JdbcUtils.close(rs);
            JdbcUtils.close(pstmt);
        }
        return map;
    }

    private static String extractBaseTypeName(String fullType) {
        if (StringUtils.isBlank(fullType)) {
            return "";
        }
        int idx = fullType.indexOf('(');
        return idx > 0 ? fullType.substring(0, idx).trim() : fullType.trim();
    }

    /**
     * 根据 JDBC 元数据拼装包含长度/精度的完整字段类型（静态方法便于单元测试）
     */
    public static String formatFullColumnType(String typeName, Integer columnSize, Integer decimalDigits, String dbType) {
        if (StringUtils.isBlank(typeName)) {
            return "varchar(255)";
        }
        String raw = typeName.trim();
        if (raw.contains("(")) {
            return raw;
        }
        String upper = raw.toUpperCase();
        if (upper.equals("TEXT") || upper.equals("LONGTEXT") || upper.equals("MEDIUMTEXT")
                || upper.equals("TINYTEXT") || upper.equals("CLOB") || upper.equals("BLOB")
                || upper.equals("DATE") || upper.equals("DATETIME") || upper.equals("TIMESTAMP")
                || upper.equals("BOOLEAN") || upper.equals("BOOL") || upper.equals("JSON")
                || upper.equals("INT") || upper.equals("INTEGER") || upper.equals("BIGINT")
                || upper.equals("SMALLINT") || upper.equals("TINYINT") || upper.equals("INT4")
                || upper.equals("INT8") || upper.equals("INT2") || upper.equals("FLOAT")
                || upper.equals("DOUBLE") || upper.equals("SERIAL") || upper.equals("BIGSERIAL")) {
            return raw;
        }
        if (columnSize != null && columnSize > 0) {
            if (upper.contains("DECIMAL") || upper.contains("NUMERIC") || upper.equals("NUMBER")) {
                int scale = (decimalDigits != null && decimalDigits >= 0) ? decimalDigits : 0;
                return raw + "(" + columnSize + "," + scale + ")";
            }
            if (upper.contains("CHAR") || upper.contains("BINARY") || upper.equals("NVARCHAR2") || upper.equals("VARCHAR2")) {
                return raw + "(" + columnSize + ")";
            }
        }
        return raw;
    }
}
