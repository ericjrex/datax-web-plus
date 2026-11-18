package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 字段注释变更明细 DTO
 *
 * @author ypc
 */
@Data
@ApiModel("字段注释变更明细")
public class ColumnCommentChangeDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty("字段名")
    private String columnName;

    @ApiModelProperty("目标端旧注释")
    private String oldComment;

    @ApiModelProperty("源端新注释")
    private String newComment;

    @ApiModelProperty("目标端当前完整字段类型(用于 MySQL/Doris/Hive 改注释时保底)")
    private String targetFullType;

    @ApiModelProperty("目标端当前是否可为空(true: NULL, false: NOT NULL)")
    private Boolean targetNullable;

    @ApiModelProperty("目标端当前默认值")
    private String targetDefaultValue;

    @ApiModelProperty("目标端当前扩展属性(如 auto_increment)")
    private String targetExtra;
}
