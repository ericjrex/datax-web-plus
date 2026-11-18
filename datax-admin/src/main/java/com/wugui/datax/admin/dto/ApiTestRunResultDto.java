package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 接口在线试运行返回结果 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "接口在线试运行返回结果DTO")
public class ApiTestRunResultDto {

    @ApiModelProperty(value = "是否调用成功")
    private Boolean success;

    @ApiModelProperty(value = "HTTP状态码")
    private Integer httpStatus;

    @ApiModelProperty(value = "请求总耗时 (毫秒)")
    private Long elapsedMs;

    @ApiModelProperty(value = "返回提示或错误详情")
    private String message;

    @ApiModelProperty(value = "原始响应内容 (限制长度前4000字符)")
    private String rawResponseSnippet;

    @ApiModelProperty(value = "提取到的总记录数")
    private Integer totalExtracted;

    @ApiModelProperty(value = "推导解析出的字段名列表")
    private List<String> inferredFields;

    @ApiModelProperty(value = "取样数据行 (默认最多10条)")
    private List<Map<String, Object>> sampleRows;

    @ApiModelProperty(value = "前置脚本打印日志 (console.log / print 输出列表)")
    private List<String> scriptLogs;
}
