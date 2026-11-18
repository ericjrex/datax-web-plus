package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 字段级映射传输对象
 *
 * @author ypc
 */
@Data
@ApiModel(value = "字段映射传输对象", description = "用于描述源表字段到目标表字段的映射及类型转换规则")
public class ColumnMappingDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 源端字段名称
     */
    @ApiModelProperty(value = "源端字段名称", required = true, example = "user_id")
    private String readerColumn;

    /**
     * 源端字段类型（包含长度/精度，如 VARCHAR(64)、INT、DECIMAL(10,2)）
     */
    @ApiModelProperty(value = "源端字段类型", example = "VARCHAR(64)")
    private String readerType;

    /**
     * 源端字段注释
     */
    @ApiModelProperty(value = "源端字段注释", example = "用户ID")
    private String readerComment;

    /**
     * 目标端字段名称（支持自定义/重命名）
     */
    @ApiModelProperty(value = "目标端字段名称", required = true, example = "user_id")
    private String writerColumn;

    /**
     * 目标端字段类型（由类型转换引擎自动推导或人工微调）
     */
    @ApiModelProperty(value = "目标端字段类型", example = "String")
    private String writerType;

    /**
     * 目标端字段注释
     */
    @ApiModelProperty(value = "目标端字段注释", example = "用户ID")
    private String writerComment;

    /**
     * 是否是主键字段
     */
    @ApiModelProperty(value = "是否是主键字段", example = "true")
    private Boolean isPrimaryKey = false;

    /**
     * 是否允许为空：0-不允许为空，1-允许为空
     */
    @ApiModelProperty(value = "是否允许为空：0-不允许为空，1-允许为空", example = "1")
    private Integer isNullable = 1;

    /**
     * 是否忽略该字段（不参与同步）
     */
    @ApiModelProperty(value = "是否忽略该字段（不参与同步）", example = "false")
    private Boolean isIgnored = false;

    /**
     * 默认值表达式（可选）
     */
    @ApiModelProperty(value = "默认值表达式", example = "NULL")
    private String defaultValue;
}
