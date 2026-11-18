package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 外部开放 API 查询请求入参 DTO
 *
 * @author ypc
 * @since 2026-10-28
 */
@Data
@ApiModel(description = "开放API执行SQL请求参数")
public class OpenApiExecuteSqlDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "目标查询数据源ID (多库账号必传，单库账号可选)")
    private Long datasourceId;

    @ApiModelProperty(value = "所属业务领域编码 (可选)")
    private String domainCode;

    @ApiModelProperty(value = "待执行的只读 SELECT SQL (必传)", required = true)
    private String sql;

    @ApiModelProperty(value = "单次拉取最大记录数限制 (可选，最大1000)")
    private Integer pageSize;
}
