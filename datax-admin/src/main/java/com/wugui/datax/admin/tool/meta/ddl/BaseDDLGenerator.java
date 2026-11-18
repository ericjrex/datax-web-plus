package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import java.util.List;

/**
 * 目标端数据库 DDL 建表脚本生成器接口
 *
 * @author ypc
 */
public interface BaseDDLGenerator {

    /**
     * 根据目标表名、注释和字段映射列表生成 CREATE TABLE DDL
     *
     * @param tableName 目标表名
     * @param tableComment 目标表注释
     * @param columns 字段映射列表
     * @return 格式化的建表 DDL 脚本
     */
    String generateCreateTableDDL(String tableName, String tableComment, List<ColumnMappingDto> columns);

    /**
     * 获取支持的目标数据库类型
     *
     * @return 数据库标识
     */
    String getDbType();

    /**
     * 根据目标表名和新增字段列表生成 ALTER TABLE ADD COLUMN(S) 脚本
     *
     * @param tableName 目标表名
     * @param newColumns 新增字段映射列表
     * @return ALTER TABLE 语句
     */
    default String generateAddColumnsDDL(String tableName, List<ColumnMappingDto> newColumns) {
        return "";
    }

    /**
     * 生成修改表注释或字段注释的安全 DDL（绝不修改字段类型或必填约束）
     *
     * @param tableName               目标表名
     * @param newTableComment         新的表注释（null 表示表注释未变更，无需生成表级注释语句）
     * @param commentChanges          发生注释变更的字段列表
     * @param targetTableCommentExists 目标表当前是否已存在表注释（用于 SQL Server add/update 区分）
     * @return ALTER/COMMENT DDL 语句
     */
    default String generateAlterCommentDDL(String tableName, String newTableComment,
                                           List<ColumnCommentChangeDto> commentChanges,
                                           boolean targetTableCommentExists) {
        return "";
    }

    /**
     * 生成修改字段类型或必填约束（NOT NULL / NULL）的建议 DDL（供人工审查后手动执行）
     *
     * @param tableName     目标表名
     * @param columnChanges 发生类型或必填变更的字段列表
     * @return MODIFY/ALTER COLUMN DDL 语句
     */
    default String generateModifyColumnDDL(String tableName, List<ColumnSchemaChangeDto> columnChanges) {
        return "";
    }
}

