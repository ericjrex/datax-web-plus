package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 批量数据量比对与对账汇总结果 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "批量数据量比对与对账汇总结果")
public class BatchCompareResultDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 对账批次流水号
     */
    @ApiModelProperty(value = "对账批次流水号")
    private String batchNo;

    /**
     * 参与比对的任务总数
     */
    @ApiModelProperty(value = "比对任务总数")
    private Integer totalCount = 0;

    /**
     * 数据量完全一致的任务数
     */
    @ApiModelProperty(value = "完全一致任务数")
    private Integer matchedCount = 0;

    /**
     * 存在数据量差异的任务数
     */
    @ApiModelProperty(value = "存在差异任务数")
    private Integer mismatchedCount = 0;

    /**
     * 查询超时的任务数
     */
    @ApiModelProperty(value = "超时任务数")
    private Integer timeoutCount = 0;

    /**
     * 查询异常或失败的任务数
     */
    @ApiModelProperty(value = "异常失败任务数")
    private Integer errorCount = 0;

    /**
     * 批次总耗时 (毫秒)
     */
    @ApiModelProperty(value = "批次总耗时(毫秒)")
    private Long totalCostTimeMs = 0L;

    /**
     * 各任务明细对账列表
     */
    @ApiModelProperty(value = "明细列表")
    private List<JobCompareItemDto> items;
}
