package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 接口前置脚本在线单测结果 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "接口前置脚本单测结果DTO")
public class ApiScriptTestResultDto {

    @ApiModelProperty(value = "是否执行成功")
    private Boolean success;

    @ApiModelProperty(value = "返回提示或异常信息")
    private String message;

    @ApiModelProperty(value = "脚本执行耗时 (毫秒)")
    private Long elapsedMs;

    @ApiModelProperty(value = "控制台打印日志 (console.log / print 输出列表)")
    private List<String> logs;

    @ApiModelProperty(value = "脚本执行后的最终 Headers 映射")
    private Map<String, String> resultHeaders;

    @ApiModelProperty(value = "脚本执行后的最终 QueryParams 映射")
    private Map<String, Object> resultParams;
}
