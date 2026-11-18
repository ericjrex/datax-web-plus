package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 表字段详细元数据 DTO
 *
 * @author ypc
 */
@Data
@ApiModel("表字段详细元数据")
public class TableColumnDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty("字段序号")
    private Integer columnIndex;

    @ApiModelProperty("字段名称")
    private String columnName;

    @ApiModelProperty("数据类型名称")
    private String columnType;

    @ApiModelProperty("字段长度/精度")
    private Integer columnSize;

    @ApiModelProperty("小数位数")
    private Integer decimalDigits;

    @ApiModelProperty("是否允许为空 (true: 允许, false: 不允许)")
    private Boolean isNullable;

    @ApiModelProperty("是否主键")
    private Boolean isPrimaryKey;

    @ApiModelProperty("字段注释/描述")
    private String comment;

    @ApiModelProperty("默认值")
    private String defaultValue;

    @ApiModelProperty("完整字段类型定义(含长度/精度，如 varchar(100)、decimal(18,2))")
    private String fullType;

    @ApiModelProperty("扩展属性(如 auto_increment、on update CURRENT_TIMESTAMP)")
    private String extra;
}
