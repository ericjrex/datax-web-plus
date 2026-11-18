package com.wugui.datax.admin.service.impl;

import com.wugui.datax.admin.dto.AutoBuildMappingDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.TableMappingDto;
import com.wugui.datax.admin.dto.TablePrefixSuffixRuleDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.service.DatasourceQueryService;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.service.TableMappingService;
import com.wugui.datax.admin.tool.database.ColumnInfo;
import com.wugui.datax.admin.tool.database.TableInfo;
import com.wugui.datax.admin.tool.meta.converter.DataTypeConverter;
import com.wugui.datax.admin.tool.meta.converter.DataTypeConverterFactory;
import com.wugui.datax.admin.tool.meta.ddl.BaseDDLGenerator;
import com.wugui.datax.admin.tool.meta.ddl.DDLGeneratorFactory;
import com.wugui.datax.admin.tool.util.TableNamingUtil;
import com.wugui.datax.admin.util.AESUtil;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import com.wugui.datax.admin.util.JdbcConstants;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 表与字段映射业务服务实现类
 *
 * @author ypc
 */
@Service
public class TableMappingServiceImpl implements TableMappingService {

    private static final Logger logger = LoggerFactory.getLogger(TableMappingServiceImpl.class);

    private static final Pattern FORBIDDEN_DDL_PATTERN = Pattern.compile("(?i)\\b(DROP\\s+DATABASE|DROP\\s+TABLE|TRUNCATE\\s+TABLE|ALTER\\s+USER|GRANT\\s+|REVOKE\\s+)\\b");

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Autowired
    private DatasourceQueryService datasourceQueryService;

    @Override
    public List<TableMappingDto> autoBuildTableMapping(AutoBuildMappingDto dto) throws IOException {
        if (dto == null || dto.getReaderTables() == null || dto.getReaderTables().isEmpty()) {
            return Collections.emptyList();
        }

        JobDatasource readerDs = jobDatasourceService.getById(dto.getReaderDatasourceId());
        JobDatasource writerDs = jobDatasourceService.getById(dto.getWriterDatasourceId());

        if (readerDs == null || writerDs == null) {
            throw new IllegalArgumentException("数据源不存在");
        }

        String sourceDbType = readerDs.getDatasource();
        String targetDbType = writerDs.getDatasource();
        DataTypeConverter typeConverter = DataTypeConverterFactory.getConverter(sourceDbType, targetDbType);
        BaseDDLGenerator ddlGenerator = DDLGeneratorFactory.getGenerator(targetDbType);

        List<TableMappingDto> result = new ArrayList<>(dto.getReaderTables().size());

        for (String readerTable : dto.getReaderTables()) {
            if (StringUtils.isBlank(readerTable)) {
                continue;
            }

            // 1. 根据规则计算目标表名
            String writerTable = TableNamingUtil.applyNamingRule(readerTable, dto.getNamingRule());

            // 2. 查询源表元数据与注释
            TableInfo readerTableInfo = datasourceQueryService.getTableDetails(dto.getReaderDatasourceId(), readerTable);
            String readerTableComment = readerTableInfo != null ? readerTableInfo.getComment() : "";
            List<ColumnInfo> readerColumns = datasourceQueryService.getColumnsDetails(dto.getReaderDatasourceId(), readerTable);
            if (JdbcConstants.MYSQL.equalsIgnoreCase(sourceDbType) && readerColumns != null) {
                enrichMysqlColumnTypes(readerDs, readerTable, readerColumns);
            }

            // 3. 检查目标表是否已存在
            boolean targetExists = datasourceQueryService.checkTableExists(dto.getWriterDatasourceId(), writerTable);

            // 4. 构建字段映射列表
            List<ColumnMappingDto> columnMappings = new ArrayList<>();
            Map<String, ColumnInfo> targetColumnMap = new HashMap<>();

            if (targetExists) {
                List<ColumnInfo> targetColumns = datasourceQueryService.getColumnsDetails(dto.getWriterDatasourceId(), writerTable);
                if (targetColumns != null) {
                    for (ColumnInfo tCol : targetColumns) {
                        targetColumnMap.put(tCol.getName().toLowerCase(), tCol);
                    }
                }
            }

            if (readerColumns != null) {
                for (ColumnInfo rCol : readerColumns) {
                    ColumnMappingDto mapDto = new ColumnMappingDto();
                    mapDto.setReaderColumn(rCol.getName());
                    mapDto.setReaderType(rCol.getType());
                    mapDto.setReaderComment(rCol.getComment());
                    mapDto.setIsPrimaryKey(rCol.getIfPrimaryKey() != null && rCol.getIfPrimaryKey());
                    mapDto.setIsNullable(rCol.getIsnull());
                    mapDto.setIsIgnored(false);

                    if (targetExists && targetColumnMap.containsKey(rCol.getName().toLowerCase())) {
                        // 目标表已存在且有匹配同名字段：使用目标端已有的字段名和类型
                        ColumnInfo matchCol = targetColumnMap.get(rCol.getName().toLowerCase());
                        mapDto.setWriterColumn(matchCol.getName());
                        mapDto.setWriterType(matchCol.getType());
                        mapDto.setWriterComment(StringUtils.isNotBlank(matchCol.getComment()) ? matchCol.getComment() : rCol.getComment());
                    } else {
                        // 目标表不存在或未匹配同名：自动推导字段名及转换目标端数据类型
                        mapDto.setWriterColumn(rCol.getName());
                        mapDto.setWriterType(typeConverter.convert(rCol.getType()));
                        mapDto.setWriterComment(rCol.getComment());
                    }
                    columnMappings.add(mapDto);
                }
            }

            // 5. 组装 TableMappingDto
            TableMappingDto mappingDto = new TableMappingDto();
            mappingDto.setReaderTable(readerTable);
            mappingDto.setWriterTable(writerTable);
            mappingDto.setReaderTableComment(readerTableComment);
            mappingDto.setWriterTableComment(readerTableComment);
            mappingDto.setTargetTableExists(targetExists);
            mappingDto.setColumns(columnMappings);

            // 6. 生成建表 DDL
            String ddl = null;
            if (JdbcConstants.MYSQL.equalsIgnoreCase(sourceDbType) && JdbcConstants.MYSQL.equalsIgnoreCase(targetDbType)) {
                ddl = getMysqlCreateTableDDL(readerDs, readerTable, writerTable);
            }
            if (StringUtils.isBlank(ddl)) {
                ddl = ddlGenerator.generateCreateTableDDL(writerTable, readerTableComment, columnMappings);
            }
            mappingDto.setCreateTableSql(ddl);

            result.add(mappingDto);
        }

        return result;
    }

    @Override
    public List<String> previewNaming(List<String> tableNames, TablePrefixSuffixRuleDto ruleDto) {
        return TableNamingUtil.applyNamingRuleBatch(tableNames, ruleDto);
    }

    @Override
    public String generateDDL(Long writerDatasourceId, TableMappingDto mappingDto) {
        if (writerDatasourceId == null || mappingDto == null) {
            return "";
        }
        JobDatasource writerDs = jobDatasourceService.getById(writerDatasourceId);
        if (writerDs == null) {
            throw new IllegalArgumentException("目标数据源不存在");
        }
        BaseDDLGenerator ddlGenerator = DDLGeneratorFactory.getGenerator(writerDs.getDatasource());
        return ddlGenerator.generateCreateTableDDL(
                mappingDto.getWriterTable(),
                mappingDto.getWriterTableComment(),
                mappingDto.getColumns() != null ? mappingDto.getColumns() : Collections.emptyList()
        );
    }

    @Override
    public void executeDDL(Long datasourceId, String ddlSql) throws Exception {
        if (datasourceId == null || StringUtils.isBlank(ddlSql)) {
            throw new IllegalArgumentException("数据源ID或DDL语句不能为空");
        }

        // 安全审计拦截高危破坏性指令
        if (FORBIDDEN_DDL_PATTERN.matcher(ddlSql).find()) {
            throw new SecurityException("检测到高危或禁止执行的 SQL 指令，操作已拦截！");
        }

        JobDatasource ds = jobDatasourceService.getById(datasourceId);
        if (ds == null) {
            throw new IllegalArgumentException("数据源不存在");
        }

        String username = AESUtil.decrypt(ds.getJdbcUsername());
        String password = AESUtil.decrypt(ds.getJdbcPassword());

        if (StringUtils.isNotBlank(ds.getJdbcDriverClass())) {
            Class.forName(ds.getJdbcDriverClass());
        }

        try (Connection conn = DriverManager.getConnection(ds.getJdbcUrl(), username, password);
             Statement stmt = conn.createStatement()) {

            // 安全分割多条 DDL（忽略单引号、双引号与反引号内的分号，如注释中的分号）
            List<String> statements = splitSqlStatements(ddlSql);
            for (String sql : statements) {
                String trimmed = sql.trim();
                if (StringUtils.isNotBlank(trimmed)) {
                    logger.info("执行 DDL: {}", trimmed);
                    try {
                        stmt.execute(trimmed);
                    } catch (SQLException e) {
                        logger.error("DDL 执行失败! error={}, sql=\n{}", e.getMessage(), trimmed, e);
                        throw new SQLException("执行 DDL 失败: " + e.getMessage() + "，SQL 语句:\n" + trimmed, e);
                    }
                }
            }
        }
    }

    @Override
    public void autoCreateTargetTable(Long readerDatasourceId, String readerTable, Long writerDatasourceId, String writerTable) throws Exception {
        if (readerDatasourceId == null || writerDatasourceId == null || StringUtils.isBlank(readerTable) || StringUtils.isBlank(writerTable)) {
            throw new IllegalArgumentException("数据源ID与表名不能为空");
        }

        // 若目标库已存在该表，无需重复建表
        if (datasourceQueryService.checkTableExists(writerDatasourceId, writerTable)) {
            logger.info("目标库已存在表 [{}]，跳过自动建表", writerTable);
            return;
        }

        JobDatasource readerDs = jobDatasourceService.getById(readerDatasourceId);
        JobDatasource writerDs = jobDatasourceService.getById(writerDatasourceId);
        if (readerDs == null || writerDs == null) {
            throw new IllegalArgumentException("数据源不存在");
        }

        String sourceDbType = readerDs.getDatasource();
        String targetDbType = writerDs.getDatasource();
        DataTypeConverter typeConverter = DataTypeConverterFactory.getConverter(sourceDbType, targetDbType);
        BaseDDLGenerator ddlGenerator = DDLGeneratorFactory.getGenerator(targetDbType);

        TableInfo readerTableInfo = datasourceQueryService.getTableDetails(readerDatasourceId, readerTable);
        String readerTableComment = readerTableInfo != null ? readerTableInfo.getComment() : "";
        List<ColumnInfo> readerColumns = datasourceQueryService.getColumnsDetails(readerDatasourceId, readerTable);
        if (JdbcConstants.MYSQL.equalsIgnoreCase(sourceDbType) && readerColumns != null) {
            enrichMysqlColumnTypes(readerDs, readerTable, readerColumns);
        }

        String ddl = null;
        if (JdbcConstants.MYSQL.equalsIgnoreCase(sourceDbType) && JdbcConstants.MYSQL.equalsIgnoreCase(targetDbType)) {
            ddl = getMysqlCreateTableDDL(readerDs, readerTable, writerTable);
        }
        if (StringUtils.isBlank(ddl)) {
            List<ColumnMappingDto> columnMappings = new ArrayList<>();
            if (readerColumns != null) {
                for (ColumnInfo rCol : readerColumns) {
                    ColumnMappingDto mapDto = new ColumnMappingDto();
                    mapDto.setReaderColumn(rCol.getName());
                    mapDto.setReaderType(rCol.getType());
                    mapDto.setReaderComment(rCol.getComment());
                    mapDto.setIsPrimaryKey(rCol.getIfPrimaryKey() != null && rCol.getIfPrimaryKey());
                    mapDto.setIsNullable(rCol.getIsnull());
                    mapDto.setIsIgnored(false);

                    mapDto.setWriterColumn(rCol.getName());
                    mapDto.setWriterType(typeConverter.convert(rCol.getType()));
                    mapDto.setWriterComment(rCol.getComment());
                    columnMappings.add(mapDto);
                }
            }
            ddl = ddlGenerator.generateCreateTableDDL(writerTable, readerTableComment, columnMappings);
        }

        logger.info("自动执行目标库建表 DDL: datasourceId={}, table={}, sql=\n{}", writerDatasourceId, writerTable, ddl);
        executeDDL(writerDatasourceId, ddl);
    }

    /**
     * 读取 MySQL 原生列类型（包含真实长度，如 varchar(64) 而非裸露的 VARCHAR）
     */
    private void enrichMysqlColumnTypes(JobDatasource ds, String tableName, List<ColumnInfo> columns) {
        if (ds == null || columns == null || columns.isEmpty()) {
            return;
        }
        String username = AESUtil.decrypt(ds.getJdbcUsername());
        String password = AESUtil.decrypt(ds.getJdbcPassword());
        try {
            if (StringUtils.isNotBlank(ds.getJdbcDriverClass())) {
                Class.forName(ds.getJdbcDriverClass());
            }
            try (Connection conn = DriverManager.getConnection(ds.getJdbcUrl(), username, password);
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SHOW FULL COLUMNS FROM `" + tableName + "`")) {
                Map<String, String> typeMap = new HashMap<>();
                while (rs.next()) {
                    String field = rs.getString("Field");
                    String type = rs.getString("Type");
                    if (StringUtils.isNotBlank(field) && StringUtils.isNotBlank(type)) {
                        typeMap.put(field.toLowerCase(), type);
                    }
                }
                for (ColumnInfo col : columns) {
                    if (col != null && col.getName() != null) {
                        String realType = typeMap.get(col.getName().toLowerCase());
                        if (StringUtils.isNotBlank(realType)) {
                            col.setType(realType);
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("获取 MySQL 原生列类型失败，使用通用类型: {}", e.getMessage());
        }
    }

    /**
     * 当源和目标均为 MySQL 时，直接提取并复用源库的高保真建表 DDL
     */
    private String getMysqlCreateTableDDL(JobDatasource ds, String readerTable, String writerTable) {
        if (ds == null || !JdbcConstants.MYSQL.equalsIgnoreCase(ds.getDatasource())) {
            return null;
        }
        try {
            String username = AESUtil.decrypt(ds.getJdbcUsername());
            String password = AESUtil.decrypt(ds.getJdbcPassword());
            if (StringUtils.isNotBlank(ds.getJdbcDriverClass())) {
                Class.forName(ds.getJdbcDriverClass());
            }
            try (Connection conn = DriverManager.getConnection(ds.getJdbcUrl(), username, password);
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SHOW CREATE TABLE `" + readerTable + "`")) {
                if (rs.next()) {
                    String createSql = rs.getString(2);
                    if (StringUtils.isNotBlank(createSql)) {
                        createSql = createSql.replaceAll("(?i)\\s+AUTO_INCREMENT=\\d+", "");
                        createSql = createSql.replaceFirst("(?i)CREATE\\s+TABLE\\s+`?" + Pattern.quote(readerTable) + "`?", "CREATE TABLE IF NOT EXISTS `" + writerTable + "`");
                        return createSql + ";";
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("通过 SHOW CREATE TABLE 获取 [{}] 建表语句失败: {}", readerTable, e.getMessage());
        }
        return null;
    }

    /**
     * 安全分割多条 SQL 语句，忽略单引号、双引号与反引号内部的分号（例如注释或字符串常量中包含分号）
     *
     * @param sqlScript SQL 脚本
     * @return 独立可执行的 SQL 语句列表
     */
    private List<String> splitSqlStatements(String sqlScript) {
        List<String> statements = new ArrayList<>();
        if (StringUtils.isBlank(sqlScript)) {
            return statements;
        }
        StringBuilder current = new StringBuilder();
        boolean inSingleQuote = false;
        boolean inDoubleQuote = false;
        boolean inBacktick = false;

        for (int i = 0; i < sqlScript.length(); i++) {
            char c = sqlScript.charAt(i);

            // 处理转义字符 \' 或 \\
            if (c == '\\' && i + 1 < sqlScript.length()) {
                current.append(c).append(sqlScript.charAt(i + 1));
                i++;
                continue;
            }

            // 处理成对出现的单引号转义 '' (SQL标准字符串转义)
            if (c == '\'' && inSingleQuote && i + 1 < sqlScript.length() && sqlScript.charAt(i + 1) == '\'') {
                current.append("''");
                i++;
                continue;
            }

            if (c == '\'') {
                inSingleQuote = !inSingleQuote;
            } else if (c == '"') {
                inDoubleQuote = !inDoubleQuote;
            } else if (c == '`') {
                inBacktick = !inBacktick;
            }

            if (c == ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
                String stmt = current.toString().trim();
                if (!stmt.isEmpty()) {
                    statements.add(stmt);
                }
                current.setLength(0);
            } else {
                current.append(c);
            }
        }

        String remaining = current.toString().trim();
        if (!remaining.isEmpty()) {
            statements.add(remaining);
        }
        return statements;
    }
}
