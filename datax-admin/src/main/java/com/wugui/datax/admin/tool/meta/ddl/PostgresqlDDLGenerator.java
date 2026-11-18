package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * PostgreSQL 建表 DDL 生成器
 *
 * @author ypc
 */
public class PostgresqlDDLGenerator implements BaseDDLGenerator {

    @Override
    public String getDbType() {
        return JdbcConstants.POSTGRESQL;
    }

    @Override
    public String generateCreateTableDDL(String tableName, String tableComment, List<ColumnMappingDto> columns) {
        StringBuilder sb = new StringBuilder();
        sb.append("CREATE TABLE IF NOT EXISTS \"").append(tableName).append("\" (\n");

        List<String> primaryKeys = new ArrayList<>();
        List<String> commentSqls = new ArrayList<>();
        int validColumnCount = 0;

        for (ColumnMappingDto col : columns) {
            if (Boolean.TRUE.equals(col.getIsIgnored())) {
                continue;
            }
            if (validColumnCount > 0) {
                sb.append(",\n");
            }
            sb.append("  \"").append(col.getWriterColumn()).append("\" ").append(col.getWriterType());
            if (Boolean.TRUE.equals(col.getIsPrimaryKey()) || (col.getIsNullable() != null && col.getIsNullable() == 0)) {
                sb.append(" NOT NULL");
            }
            if (Boolean.TRUE.equals(col.getIsPrimaryKey())) {
                primaryKeys.add(col.getWriterColumn());
            }
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                commentSqls.add("COMMENT ON COLUMN \"" + tableName + "\".\"" + col.getWriterColumn() + "\" IS '" + escapeComment(col.getWriterComment()) + "';");
            }
            validColumnCount++;
        }

        if (!primaryKeys.isEmpty()) {
            sb.append(",\n  PRIMARY KEY (\"").append(String.join("\", \"", primaryKeys)).append("\")");
        }

        sb.append("\n);\n");

        if (StringUtils.isNotBlank(tableComment)) {
            sb.append("COMMENT ON TABLE \"").append(tableName).append("\" IS '").append(escapeComment(tableComment)).append("';\n");
        }
        for (String cSql : commentSqls) {
            sb.append(cSql).append("\n");
        }

        return sb.toString();
    }

    @Override
    public String generateAlterCommentDDL(String tableName, String newTableComment,
                                          List<ColumnCommentChangeDto> commentChanges,
                                          boolean targetTableCommentExists) {
        StringBuilder sb = new StringBuilder();
        if (newTableComment != null) {
            sb.append("COMMENT ON TABLE \"").append(tableName).append("\" IS '")
                    .append(escapeComment(newTableComment)).append("';\n");
        }
        if (commentChanges != null) {
            for (ColumnCommentChangeDto ch : commentChanges) {
                if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                    continue;
                }
                sb.append("COMMENT ON COLUMN \"").append(tableName).append("\".\"")
                        .append(ch.getColumnName()).append("\" IS '")
                        .append(escapeComment(ch.getNewComment())).append("';\n");
            }
        }
        return sb.toString().trim();
    }

    @Override
    public String generateModifyColumnDDL(String tableName, List<ColumnSchemaChangeDto> columnChanges) {
        if (columnChanges == null || columnChanges.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (ColumnSchemaChangeDto ch : columnChanges) {
            if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                continue;
            }
            if (Boolean.TRUE.equals(ch.getTypeChanged())) {
                String newType = StringUtils.isNotBlank(ch.getExpectedNewType()) ? ch.getExpectedNewType() : ch.getTargetOldType();
                sb.append("ALTER TABLE \"").append(tableName).append("\" ALTER COLUMN \"")
                        .append(ch.getColumnName()).append("\" TYPE ")
                        .append(StringUtils.isNotBlank(newType) ? newType : "VARCHAR(255)").append(";\n");
            }
            if (Boolean.TRUE.equals(ch.getNullableChanged())) {
                sb.append("ALTER TABLE \"").append(tableName).append("\" ALTER COLUMN \"")
                        .append(ch.getColumnName()).append("\" ")
                        .append(Boolean.FALSE.equals(ch.getNewNullable()) ? "SET NOT NULL" : "DROP NOT NULL")
                        .append(";\n");
            }
        }
        return sb.toString().trim();
    }

    private String escapeComment(String comment) {
        if (comment == null) {
            return "";
        }
        return comment.replace("'", "''");
    }
}
