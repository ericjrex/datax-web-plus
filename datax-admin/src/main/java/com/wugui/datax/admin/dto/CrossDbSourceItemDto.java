package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 跨库多源单个源节点配置 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "跨库多源单个源节点配置")
public class CrossDbSourceItemDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "源端数据源ID", required = true)
    private Long datasourceId;

    @ApiModelProperty(value = "源端数据源名称")
    private String datasourceName;

    @ApiModelProperty(value = "数据源别名 (如 oa, bus)")
    private String alias;

    @ApiModelProperty(value = "在该数据源上执行的只读统计SQL", required = true)
    private String sql;
}
