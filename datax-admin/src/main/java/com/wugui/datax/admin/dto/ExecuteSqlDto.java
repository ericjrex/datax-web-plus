package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 只读 SQL 自定义查询请求 DTO
 *
 * @author ypc
 */
@Data
@ApiModel("只读SQL自定义查询请求参数")
public class ExecuteSqlDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "数据源ID", required = true)
    private Long datasourceId;

    @ApiModelProperty(value = "只读查询SQL语句 (仅支持 SELECT/WITH/EXPLAIN/SHOW/DESC)", required = true)
    private String sql;

    @ApiModelProperty("当前页码 (从1开始，默认1)")
    private Integer pageNo = 1;

    @ApiModelProperty("每页条数 (默认50，最大1000)")
    private Integer pageSize = 50;
}
