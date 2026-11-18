package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 统计任务执行与试运行结果 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "统计计算任务执行结果")
public class StatTaskResultDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "是否执行成功")
    private Boolean success = true;

    @ApiModelProperty(value = "字段列名称列表")
    private List<String> columns = new ArrayList<>();

    @ApiModelProperty(value = "字段元数据列表 (包含数据类型)")
    private List<TableColumnDto> columnDetails = new ArrayList<>();

    @ApiModelProperty(value = "数据结果行列表")
    private List<Map<String, Object>> rows = new ArrayList<>();

    @ApiModelProperty(value = "计算生成的总数据行数")
    private Long totalRows = 0L;

    @ApiModelProperty(value = "成功写入目标表的行数")
    private Long writtenRows = 0L;

    @ApiModelProperty(value = "执行总耗时 (毫秒)")
    private Long costMs = 0L;

    @ApiModelProperty(value = "运行控制台输出日志")
    private String logOutput;

    @ApiModelProperty(value = "提示或错误消息")
    private String message;
}
