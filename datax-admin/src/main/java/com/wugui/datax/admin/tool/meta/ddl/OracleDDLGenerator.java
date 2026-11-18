package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Oracle 建表 DDL 生成器
 *
 * @author ypc
 */
public class OracleDDLGenerator implements BaseDDLGenerator {

    @Override
    public String getDbType() {
        return JdbcConstants.ORACLE;
    }

    @Override
    public String generateCreateTableDDL(String tableName, String tableComment, List<ColumnMappingDto> columns) {
        String upperTableName = tableName.toUpperCase();
        StringBuilder sb = new StringBuilder();
        sb.append("CREATE TABLE \"").append(upperTableName).append("\" (\n");

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
            String upperCol = col.getWriterColumn().toUpperCase();
            sb.append("  \"").append(upperCol).append("\" ").append(col.getWriterType());
            if (Boolean.TRUE.equals(col.getIsPrimaryKey()) || (col.getIsNullable() != null && col.getIsNullable() == 0)) {
                sb.append(" NOT NULL");
            }
            if (Boolean.TRUE.equals(col.getIsPrimaryKey())) {
                primaryKeys.add(upperCol);
            }
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                commentSqls.add("COMMENT ON COLUMN \"" + upperTableName + "\".\"" + upperCol + "\" IS '" + escapeComment(col.getWriterComment()) + "';");
            }
            validColumnCount++;
        }

        if (!primaryKeys.isEmpty()) {
            sb.append(",\n  CONSTRAINT \"PK_").append(upperTableName.length() > 20 ? upperTableName.substring(0, 20) : upperTableName)
                    .append("\" PRIMARY KEY (\"").append(String.join("\", \"", primaryKeys)).append("\")");
        }

        sb.append("\n);\n");

        if (StringUtils.isNotBlank(tableComment)) {
            sb.append("COMMENT ON TABLE \"").append(upperTableName).append("\" IS '").append(escapeComment(tableComment)).append("';\n");
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
        String upperTableName = tableName.toUpperCase();
        StringBuilder sb = new StringBuilder();
        if (newTableComment != null) {
            sb.append("COMMENT ON TABLE \"").append(upperTableName).append("\" IS '")
                    .append(escapeComment(newTableComment)).append("';\n");
        }
        if (commentChanges != null) {
            for (ColumnCommentChangeDto ch : commentChanges) {
                if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                    continue;
                }
                sb.append("COMMENT ON COLUMN \"").append(upperTableName).append("\".\"")
                        .append(ch.getColumnName().toUpperCase()).append("\" IS '")
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
        String upperTableName = tableName.toUpperCase();
        StringBuilder sb = new StringBuilder();
        for (ColumnSchemaChangeDto ch : columnChanges) {
            if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                continue;
            }
            String upperCol = ch.getColumnName().toUpperCase();
            String targetType = Boolean.TRUE.equals(ch.getTypeChanged()) ? ch.getExpectedNewType() : ch.getTargetOldType();
            if (StringUtils.isBlank(targetType)) {
                targetType = "VARCHAR2(255)";
            }
            sb.append("ALTER TABLE \"").append(upperTableName).append("\" MODIFY (\"")
                    .append(upperCol).append("\" ").append(targetType);
            // 仅在可空性实际发生变化时才输出 NOT NULL / NULL，防止触发 Oracle ORA-01442
            if (Boolean.TRUE.equals(ch.getNullableChanged())) {
                sb.append(Boolean.FALSE.equals(ch.getNewNullable()) ? " NOT NULL" : " NULL");
            }
            sb.append(");\n");
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
