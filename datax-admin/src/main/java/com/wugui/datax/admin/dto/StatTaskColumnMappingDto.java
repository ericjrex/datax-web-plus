package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 统计任务字段映射项 DTO
 *
 * @author ypc
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "统计任务字段映射项")
public class StatTaskColumnMappingDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "源端或计算结果字段名")
    private String sourceCol;

    @ApiModelProperty(value = "目标端表字段名")
    private String targetCol;

    @ApiModelProperty(value = "字段数据类型 (如 VARCHAR, BIGINT, DECIMAL, DATETIME)")
    private String dataType;

    @ApiModelProperty(value = "是否为主键/唯一匹配键")
    private Boolean isPrimaryKey;

    @ApiModelProperty(value = "字段描述备注")
    private String comment;
}
