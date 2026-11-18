package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

/**
 * 接口前置脚本在线单测请求 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "接口前置脚本单测请求DTO")
public class ApiScriptTestDto {

    @ApiModelProperty(value = "前置 JavaScript 脚本内容")
    private String script;

    @ApiModelProperty(value = "请求 URL")
    private String requestUrl;

    @ApiModelProperty(value = "请求方式 (GET, POST 等)")
    private String requestMethod;

    @ApiModelProperty(value = "请求头配置 JSON")
    private String requestHeaders;

    @ApiModelProperty(value = "Query参数配置 JSON")
    private String requestParams;

    @ApiModelProperty(value = "请求体内容")
    private String requestBody;
}
