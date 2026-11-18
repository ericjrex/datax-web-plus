package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 单表映射关系传输对象
 *
 * @author ypc
 */
@Data
@ApiModel(value = "单表映射传输对象", description = "包含单张表的源表名、目标表名、目标表存在状态、字段映射明细及建表DDL")
public class TableMappingDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 源表名称
     */
    @ApiModelProperty(value = "源表名称", required = true, example = "sys_user")
    private String readerTable;

    /**
     * 目标表名称（支持自定义/已应用前后缀）
     */
    @ApiModelProperty(value = "目标表名称", required = true, example = "ods_sys_user_df")
    private String writerTable;

    /**
     * 源表注释
     */
    @ApiModelProperty(value = "源表注释", example = "系统用户表")
    private String readerTableComment;

    /**
     * 目标表注释
     */
    @ApiModelProperty(value = "目标表注释", example = "系统用户表")
    private String writerTableComment;

    /**
     * 目标端表是否已存在：true-已存在，false-未创建
     */
    @ApiModelProperty(value = "目标表是否存在", example = "false")
    private Boolean targetTableExists = false;

    /**
     * 字段映射明细列表
     */
    @ApiModelProperty(value = "字段映射列表")
    private List<ColumnMappingDto> columns;

    /**
     * 自动推导或人工修改后的目标库建表DDL语句
     */
    @ApiModelProperty(value = "建表DDL语句", example = "CREATE TABLE IF NOT EXISTS ods_sys_user_df (...)")
    private String createTableSql;
}
