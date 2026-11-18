package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 字段类型或必填约束变更明细 DTO
 *
 * @author ypc
 */
@Data
@ApiModel("字段类型或必填约束变更明细")
public class ColumnSchemaChangeDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty("字段名")
    private String columnName;

    @ApiModelProperty("源端物理完整类型")
    private String sourceRawType;

    @ApiModelProperty("目标端当前物理完整类型")
    private String targetOldType;

    @ApiModelProperty("源端映射后的期望目标类型")
    private String expectedNewType;

    @ApiModelProperty("字段类型是否变更")
    private Boolean typeChanged;

    @ApiModelProperty("类型变更风险等级: NONE / WIDENING / BREAKING")
    private String riskLevel;

    @ApiModelProperty("目标端原可空性(true: NULL, false: NOT NULL)")
    private Boolean oldNullable;

    @ApiModelProperty("源端新可空性(true: NULL, false: NOT NULL)")
    private Boolean newNullable;

    @ApiModelProperty("必填约束是否变更")
    private Boolean nullableChanged;

    @ApiModelProperty("目标端当前注释(用于 MODIFY 时保留)")
    private String targetComment;

    @ApiModelProperty("目标端当前默认值")
    private String targetDefaultValue;

    @ApiModelProperty("目标端当前扩展属性")
    private String targetExtra;
}
