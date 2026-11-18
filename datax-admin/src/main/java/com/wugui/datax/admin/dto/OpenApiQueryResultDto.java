package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * 外部开放 API 数据查询响应 DTO
 *
 * @author ypc
 * @since 2026-10-28
 */
@Data
@ApiModel(description = "开放API查询结果数据传输对象")
public class OpenApiQueryResultDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "返回的列名列表")
    private List<String> columns;

    @ApiModelProperty(value = "数据记录列表")
    private List<Map<String, Object>> rows;

    @ApiModelProperty(value = "返回数据记录总条数(条)")
    private Integer totalRows;

    @ApiModelProperty(value = "执行耗时(毫秒)")
    private Long costMs;

    @ApiModelProperty(value = "执行涉及的数据表清单")
    private List<String> tables;
}
