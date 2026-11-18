package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * SQL Server 建表 DDL 生成器
 *
 * @author ypc
 */
public class SqlServerDDLGenerator implements BaseDDLGenerator {

    @Override
    public String getDbType() {
        return JdbcConstants.SQL_SERVER;
    }

    @Override
    public String generateCreateTableDDL(String tableName, String tableComment, List<ColumnMappingDto> columns) {
        StringBuilder sb = new StringBuilder();
        sb.append("IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[").append(tableName).append("]') AND type in (N'U'))\n");
        sb.append("CREATE TABLE [").append(tableName).append("] (\n");

        List<String> primaryKeys = new ArrayList<>();
        int validColumnCount = 0;

        for (ColumnMappingDto col : columns) {
            if (Boolean.TRUE.equals(col.getIsIgnored())) {
                continue;
            }
            if (validColumnCount > 0) {
                sb.append(",\n");
            }
            sb.append("  [").append(col.getWriterColumn()).append("] ").append(col.getWriterType());
            if (Boolean.TRUE.equals(col.getIsPrimaryKey()) || (col.getIsNullable() != null && col.getIsNullable() == 0)) {
                sb.append(" NOT NULL");
            } else {
                sb.append(" NULL");
            }
            if (Boolean.TRUE.equals(col.getIsPrimaryKey())) {
                primaryKeys.add(col.getWriterColumn());
            }
            validColumnCount++;
        }

        if (!primaryKeys.isEmpty()) {
            sb.append(",\n  PRIMARY KEY ([");
            sb.append(String.join("], [", primaryKeys));
            sb.append("])");
        }

        sb.append("\n);");
        return sb.toString();
    }

    @Override
    public String generateAlterCommentDDL(String tableName, String newTableComment,
                                          List<ColumnCommentChangeDto> commentChanges,
                                          boolean targetTableCommentExists) {
        StringBuilder sb = new StringBuilder();
        if (newTableComment != null) {
            String proc = targetTableCommentExists ? "sp_updateextendedproperty" : "sp_addextendedproperty";
            sb.append("EXEC ").append(proc)
                    .append(" @name = N'MS_Description', @value = N'").append(escapeComment(newTableComment)).append("'")
                    .append(", @level0type = N'SCHEMA', @level0name = N'dbo'")
                    .append(", @level1type = N'TABLE', @level1name = N'").append(escapeComment(tableName)).append("';\n");
        }
        if (commentChanges != null) {
            for (ColumnCommentChangeDto ch : commentChanges) {
                if (ch == null || StringUtils.isBlank(ch.getColumnName())) {
                    continue;
                }
                String proc = StringUtils.isNotBlank(ch.getOldComment()) ? "sp_updateextendedproperty" : "sp_addextendedproperty";
                sb.append("EXEC ").append(proc)
                        .append(" @name = N'MS_Description', @value = N'").append(escapeComment(ch.getNewComment())).append("'")
                        .append(", @level0type = N'SCHEMA', @level0name = N'dbo'")
                        .append(", @level1type = N'TABLE', @level1name = N'").append(escapeComment(tableName)).append("'")
                        .append(", @level2type = N'COLUMN', @level2name = N'").append(escapeComment(ch.getColumnName())).append("';\n");
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
            String targetType = Boolean.TRUE.equals(ch.getTypeChanged()) ? ch.getExpectedNewType() : ch.getTargetOldType();
            if (StringUtils.isBlank(targetType)) {
                targetType = "NVARCHAR(255)";
            }
            Boolean targetNullable = Boolean.TRUE.equals(ch.getNullableChanged()) ? ch.getNewNullable() : ch.getOldNullable();
            boolean isNullable = !Boolean.FALSE.equals(targetNullable);
            sb.append("ALTER TABLE [").append(tableName).append("] ALTER COLUMN [")
                    .append(ch.getColumnName()).append("] ").append(targetType)
                    .append(isNullable ? " NULL" : " NOT NULL").append(";\n");
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
