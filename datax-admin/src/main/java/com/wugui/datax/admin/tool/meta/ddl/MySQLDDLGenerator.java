package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * MySQL 建表 DDL 生成器
 *
 * @author ypc
 */
public class MySQLDDLGenerator implements BaseDDLGenerator {

    @Override
    public String getDbType() {
        return JdbcConstants.MYSQL;
    }

    @Override
    public String generateCreateTableDDL(String tableName, String tableComment, List<ColumnMappingDto> columns) {
        StringBuilder sb = new StringBuilder();
        sb.append("CREATE TABLE IF NOT EXISTS `").append(tableName).append("` (\n");

        List<String> primaryKeys = new ArrayList<>();
        int validColumnCount = 0;

        for (int i = 0; i < columns.size(); i++) {
            ColumnMappingDto col = columns.get(i);
            if (Boolean.TRUE.equals(col.getIsIgnored())) {
                continue;
            }
            if (validColumnCount > 0) {
                sb.append(",\n");
            }
            sb.append("  `").append(col.getWriterColumn()).append("` ").append(formatMysqlType(col.getWriterType()));
            if (Boolean.TRUE.equals(col.getIsPrimaryKey()) || (col.getIsNullable() != null && col.getIsNullable() == 0)) {
                sb.append(" NOT NULL");
            } else {
                sb.append(" DEFAULT NULL");
            }
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                sb.append(" COMMENT '").append(escapeComment(col.getWriterComment())).append("'");
            }
            if (Boolean.TRUE.equals(col.getIsPrimaryKey())) {
                primaryKeys.add(col.getWriterColumn());
            }
            validColumnCount++;
        }

        if (!primaryKeys.isEmpty()) {
            sb.append(",\n  PRIMARY KEY (`");
            sb.append(String.join("`, `", primaryKeys));
            sb.append("`) USING BTREE");
        }

        sb.append("\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        if (StringUtils.isNotBlank(tableComment)) {
            sb.append(" COMMENT='").append(escapeComment(tableComment)).append("'");
        }
        sb.append(";");
        return sb.toString();
    }

    @Override
    public String generateAddColumnsDDL(String tableName, List<ColumnMappingDto> newColumns) {
        if (newColumns == null || newColumns.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("ALTER TABLE `").append(tableName).append("`\n");
        int count = 0;
        for (ColumnMappingDto col : newColumns) {
            if (Boolean.TRUE.equals(col.getIsIgnored())) {
                continue;
            }
            if (count > 0) {
                sb.append(",\n");
            }
            sb.append("  ADD COLUMN `").append(col.getWriterColumn()).append("` ").append(formatMysqlType(col.getWriterType()));
            sb.append(" DEFAULT NULL");
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                sb.append(" COMMENT '").append(escapeComment(col.getWriterComment())).append("'");
            }
            count++;
        }
        sb.append(";");
        return count > 0 ? sb.toString() : "";
    }

    /**
     * 规范化 MySQL 字段类型
     *
     * @param rawType 原始类型
     * @return 规范化后的 MySQL 类型
     */
    private String formatMysqlType(String rawType) {
        if (StringUtils.isBlank(rawType)) {
            return "VARCHAR(255)";
        }
        String type = rawType.trim();
        String upper = type.toUpperCase();
        if ("VARCHAR".equals(upper)) {
            return "VARCHAR(255)";
        }
        if ("CHAR".equals(upper)) {
            return "CHAR(255)";
        }
        if ("DECIMAL".equals(upper)) {
            return "DECIMAL(18, 4)";
        }
        if ("NUMERIC".equals(upper)) {
            return "NUMERIC(18, 4)";
        }
        return type;
    }

    @Override
    public String generateAlterCommentDDL(String tableName, String newTableComment,
                                          List<ColumnCommentChangeDto> commentChanges,
                                          boolean targetTableCommentExists) {
        StringBuilder sb = new StringBuilder();
        if (newTableComment != null) {
            sb.append("ALTER TABLE `").append(tableName).append("` COMMENT = '")
                    .append(escapeComment(newTableComment)).append("';\n");
        }
        if (commentChanges != null) {
            for (ColumnCommentChangeDto ch : commentChanges) {
                if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                    continue;
                }
                String fullType = formatMysqlType(ch.getTargetFullType());
                boolean isNullable = !Boolean.FALSE.equals(ch.getTargetNullable());
                sb.append("ALTER TABLE `").append(tableName).append("` MODIFY COLUMN `")
                        .append(ch.getColumnName()).append("` ").append(fullType)
                        .append(isNullable ? " NULL" : " NOT NULL");
                appendDefaultAndExtra(sb, ch.getTargetDefaultValue(), ch.getTargetExtra());
                sb.append(" COMMENT '").append(escapeComment(ch.getNewComment())).append("';\n");
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
            String rawType = Boolean.TRUE.equals(ch.getTypeChanged()) ? ch.getExpectedNewType() : ch.getTargetOldType();
            String fullType = formatMysqlType(rawType);
            Boolean targetNullable = Boolean.TRUE.equals(ch.getNullableChanged()) ? ch.getNewNullable() : ch.getOldNullable();
            boolean isNullable = !Boolean.FALSE.equals(targetNullable);
            sb.append("ALTER TABLE `").append(tableName).append("` MODIFY COLUMN `")
                    .append(ch.getColumnName()).append("` ").append(fullType)
                    .append(isNullable ? " NULL" : " NOT NULL");
            appendDefaultAndExtra(sb, ch.getTargetDefaultValue(), ch.getTargetExtra());
            if (StringUtils.isNotBlank(ch.getTargetComment())) {
                sb.append(" COMMENT '").append(escapeComment(ch.getTargetComment())).append("'");
            }
            sb.append(";\n");
        }
        return sb.toString().trim();
    }

    private void appendDefaultAndExtra(StringBuilder sb, String defaultValue, String extra) {
        if (defaultValue != null) {
            String trimmed = defaultValue.trim();
            if ("NULL".equalsIgnoreCase(trimmed) || "CURRENT_TIMESTAMP".equalsIgnoreCase(trimmed)
                    || trimmed.matches("^-?\\d+(\\.\\d+)?$")) {
                sb.append(" DEFAULT ").append(trimmed);
            } else {
                sb.append(" DEFAULT '").append(escapeComment(defaultValue)).append("'");
            }
        }
        if (StringUtils.isNotBlank(extra)) {
            sb.append(" ").append(extra.trim());
        }
    }

    private String escapeComment(String comment) {
        if (comment == null) {
            return "";
        }
        return comment.replace("'", "''").replace("\\", "\\\\");
    }
}
