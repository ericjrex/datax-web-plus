package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * ClickHouse 建表 DDL 生成器
 *
 * @author ypc
 */
public class ClickHouseDDLGenerator implements BaseDDLGenerator {

    @Override
    public String getDbType() {
        return JdbcConstants.CLICKHOUSE;
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
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                sb.append(" COMMENT '").append(escapeComment(col.getWriterComment())).append("'");
            }
            if (Boolean.TRUE.equals(col.getIsPrimaryKey())) {
                primaryKeys.add(col.getWriterColumn());
            }
            validColumnCount++;
        }

        sb.append("\n) ENGINE = MergeTree()\n");
        if (!primaryKeys.isEmpty()) {
            sb.append("ORDER BY (`").append(String.join("`, `", primaryKeys)).append("`)");
        } else {
            sb.append("ORDER BY tuple()");
        }
        if (StringUtils.isNotBlank(tableComment)) {
            sb.append("\nCOMMENT '").append(escapeComment(tableComment)).append("'");
        }
        sb.append(";");
        return sb.toString();
    }

    @Override
    public String generateAlterCommentDDL(String tableName, String newTableComment,
                                          List<ColumnCommentChangeDto> commentChanges,
                                          boolean targetTableCommentExists) {
        StringBuilder sb = new StringBuilder();
        if (newTableComment != null) {
            sb.append("ALTER TABLE `").append(tableName).append("` MODIFY COMMENT '")
                    .append(escapeComment(newTableComment)).append("';\n");
        }
        if (commentChanges != null) {
            for (ColumnCommentChangeDto ch : commentChanges) {
                if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                    continue;
                }
                sb.append("ALTER TABLE `").append(tableName).append("` COMMENT COLUMN `")
                        .append(ch.getColumnName()).append("` '")
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
            String rawType = Boolean.TRUE.equals(ch.getTypeChanged()) ? ch.getExpectedNewType() : ch.getTargetOldType();
            if (StringUtils.isBlank(rawType)) {
                rawType = "String";
            }
            String baseType = rawType.trim();
            if (baseType.startsWith("Nullable(") && baseType.endsWith(")")) {
                baseType = baseType.substring("Nullable(".length(), baseType.length() - 1).trim();
            }
            Boolean targetNullable = Boolean.TRUE.equals(ch.getNullableChanged()) ? ch.getNewNullable() : ch.getOldNullable();
            String finalType = Boolean.FALSE.equals(targetNullable) ? baseType : ("Nullable(" + baseType + ")");
            sb.append("ALTER TABLE `").append(tableName).append("` MODIFY COLUMN `")
                    .append(ch.getColumnName()).append("` ").append(finalType).append(";\n");
        }
        return sb.toString().trim();
    }

    private String escapeComment(String comment) {
        if (comment == null) {
            return "";
        }
        return comment.replace("'", "''").replace("\\", "\\\\");
    }
}
