package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Doris / StarRocks 建表 DDL 生成器
 *
 * @author ypc
 */
public class DorisDDLGenerator implements BaseDDLGenerator {

    @Override
    public String getDbType() {
        return "doris";
    }

    @Override
    public String generateCreateTableDDL(String tableName, String tableComment, List<ColumnMappingDto> columns) {
        StringBuilder sb = new StringBuilder();
        sb.append("CREATE TABLE IF NOT EXISTS `").append(tableName).append("` (\n");

        List<String> primaryKeys = new ArrayList<>();
        int validColumnCount = 0;

        for (ColumnMappingDto col : columns) {
            if (Boolean.TRUE.equals(col.getIsIgnored())) {
                continue;
            }
            if (validColumnCount > 0) {
                sb.append(",\n");
            }
            sb.append("  `").append(col.getWriterColumn()).append("` ").append(col.getWriterType());
            if (Boolean.TRUE.equals(col.getIsPrimaryKey()) || (col.getIsNullable() != null && col.getIsNullable() == 0)) {
                sb.append(" NOT NULL");
            } else {
                sb.append(" NULL");
            }
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                sb.append(" COMMENT '").append(escapeComment(col.getWriterComment())).append("'");
            }
            if (Boolean.TRUE.equals(col.getIsPrimaryKey())) {
                primaryKeys.add(col.getWriterColumn());
            }
            validColumnCount++;
        }

        sb.append("\n) ENGINE=OLAP\n");

        if (!primaryKeys.isEmpty()) {
            sb.append("UNIQUE KEY(`").append(String.join("`, `", primaryKeys)).append("`)\n");
            sb.append("DISTRIBUTED BY HASH(`").append(primaryKeys.get(0)).append("`) BUCKETS 10\n");
        } else if (validColumnCount > 0) {
            String firstCol = columns.get(0).getWriterColumn();
            sb.append("DUPLICATE KEY(`").append(firstCol).append("`)\n");
            sb.append("DISTRIBUTED BY HASH(`").append(firstCol).append("`) BUCKETS 10\n");
        }

        sb.append("PROPERTIES(\"replication_num\" = \"1\"");
        if (StringUtils.isNotBlank(tableComment)) {
            sb.append(", \"comment\" = \"").append(escapeComment(tableComment)).append("\"");
        }
        sb.append(");");

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
            sb.append("  ADD COLUMN `").append(col.getWriterColumn()).append("` ").append(col.getWriterType());
            sb.append(" DEFAULT NULL");
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                sb.append(" COMMENT '").append(escapeComment(col.getWriterComment())).append("'");
            }
            count++;
        }
        sb.append(";");
        return count > 0 ? sb.toString() : "";
    }

    @Override
    public String generateAlterCommentDDL(String tableName, String newTableComment,
                                          List<ColumnCommentChangeDto> commentChanges,
                                          boolean targetTableCommentExists) {
        StringBuilder sb = new StringBuilder();
        if (newTableComment != null) {
            sb.append("ALTER TABLE `").append(tableName).append("` MODIFY COMMENT '")
                    .append(escapeSingleQuoteComment(newTableComment)).append("';\n");
        }
        if (commentChanges != null) {
            for (ColumnCommentChangeDto ch : commentChanges) {
                if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                    continue;
                }
                String fullType = StringUtils.isNotBlank(ch.getTargetFullType()) ? ch.getTargetFullType() : "VARCHAR(255)";
                boolean isNullable = !Boolean.FALSE.equals(ch.getTargetNullable());
                sb.append("ALTER TABLE `").append(tableName).append("` MODIFY COLUMN `")
                        .append(ch.getColumnName()).append("` ").append(fullType)
                        .append(isNullable ? " NULL" : " NOT NULL")
                        .append(" COMMENT '").append(escapeSingleQuoteComment(ch.getNewComment())).append("';\n");
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
            String fullType = Boolean.TRUE.equals(ch.getTypeChanged()) ? ch.getExpectedNewType() : ch.getTargetOldType();
            if (StringUtils.isBlank(fullType)) {
                fullType = "VARCHAR(255)";
            }
            Boolean targetNullable = Boolean.TRUE.equals(ch.getNullableChanged()) ? ch.getNewNullable() : ch.getOldNullable();
            boolean isNullable = !Boolean.FALSE.equals(targetNullable);
            sb.append("ALTER TABLE `").append(tableName).append("` MODIFY COLUMN `")
                    .append(ch.getColumnName()).append("` ").append(fullType)
                    .append(isNullable ? " NULL" : " NOT NULL");
            if (StringUtils.isNotBlank(ch.getTargetComment())) {
                sb.append(" COMMENT '").append(escapeSingleQuoteComment(ch.getTargetComment())).append("'");
            }
            sb.append(";\n");
        }
        return sb.toString().trim();
    }

    private String escapeSingleQuoteComment(String comment) {
        if (comment == null) {
            return "";
        }
        return comment.replace("'", "''");
    }

    private String escapeComment(String comment) {
        if (comment == null) {
            return "";
        }
        return comment.replace("\"", "\\\"").replace("'", "''");
    }
}
