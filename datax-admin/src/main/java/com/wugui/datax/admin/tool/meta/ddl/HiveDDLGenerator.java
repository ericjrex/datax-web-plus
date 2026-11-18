package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.List;

/**
 * Hive 建表 DDL 生成器
 *
 * @author ypc
 */
public class HiveDDLGenerator implements BaseDDLGenerator {

    @Override
    public String getDbType() {
        return JdbcConstants.HIVE;
    }

    @Override
    public String generateCreateTableDDL(String tableName, String tableComment, List<ColumnMappingDto> columns) {
        StringBuilder sb = new StringBuilder();
        sb.append("CREATE TABLE IF NOT EXISTS `").append(tableName).append("` (\n");

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
            validColumnCount++;
        }

        sb.append("\n)");
        if (StringUtils.isNotBlank(tableComment)) {
            sb.append(" COMMENT '").append(escapeComment(tableComment)).append("'");
        }
        sb.append("\nROW FORMAT DELIMITED FIELDS TERMINATED BY '\\001'\nSTORED AS TEXTFILE;");

        return sb.toString();
    }

    @Override
    public String generateAddColumnsDDL(String tableName, List<ColumnMappingDto> newColumns) {
        if (newColumns == null || newColumns.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("ALTER TABLE `").append(tableName).append("` ADD COLUMNS (\n");
        int count = 0;
        for (ColumnMappingDto col : newColumns) {
            if (Boolean.TRUE.equals(col.getIsIgnored())) {
                continue;
            }
            if (count > 0) {
                sb.append(",\n");
            }
            sb.append("  `").append(col.getWriterColumn()).append("` ").append(col.getWriterType());
            if (StringUtils.isNotBlank(col.getWriterComment())) {
                sb.append(" COMMENT '").append(escapeComment(col.getWriterComment())).append("'");
            }
            count++;
        }
        sb.append("\n);");
        return count > 0 ? sb.toString() : "";
    }

    @Override
    public String generateAlterCommentDDL(String tableName, String newTableComment,
                                          List<ColumnCommentChangeDto> commentChanges,
                                          boolean targetTableCommentExists) {
        StringBuilder sb = new StringBuilder();
        if (newTableComment != null) {
            sb.append("ALTER TABLE `").append(tableName).append("` SET TBLPROPERTIES ('comment' = '")
                    .append(escapeComment(newTableComment)).append("');\n");
        }
        if (commentChanges != null) {
            for (ColumnCommentChangeDto ch : commentChanges) {
                if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                    continue;
                }
                String fullType = StringUtils.isNotBlank(ch.getTargetFullType()) ? ch.getTargetFullType() : "STRING";
                sb.append("ALTER TABLE `").append(tableName).append("` CHANGE COLUMN `")
                        .append(ch.getColumnName()).append("` `").append(ch.getColumnName()).append("` ")
                        .append(fullType)
                        .append(" COMMENT '").append(escapeComment(ch.getNewComment())).append("';\n");
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
                sb.append("ALTER TABLE `").append(tableName).append("` CHANGE COLUMN `")
                        .append(ch.getColumnName()).append("` `").append(ch.getColumnName()).append("` ")
                        .append(StringUtils.isNotBlank(newType) ? newType : "STRING");
                if (StringUtils.isNotBlank(ch.getTargetComment())) {
                    sb.append(" COMMENT '").append(escapeComment(ch.getTargetComment())).append("'");
                }
                sb.append(";\n");
            }
            if (Boolean.TRUE.equals(ch.getNullableChanged())) {
                String reqText = Boolean.FALSE.equals(ch.getNewNullable()) ? "必填(NOT NULL)" : "可空(NULL)";
                sb.append("-- 提示: Hive/OBS 外部表不支持 DDL 强制非空约束，源端字段 [")
                        .append(ch.getColumnName()).append("] 已变更为 ").append(reqText).append("\n");
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
