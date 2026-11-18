package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 批量元数据漂移检测汇总结果 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "批量元数据漂移检测汇总结果")
public class BatchSchemaDriftResultDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 检测批次号
     */
    @ApiModelProperty(value = "检测批次号")
    private String batchNo;

    /**
     * 总检测任务数
     */
    @ApiModelProperty(value = "总检测任务数")
    private Integer totalCount;

    /**
     * 完全一致(无漂移)任务数
     */
    @ApiModelProperty(value = "完全一致(无漂移)任务数")
    private Integer normalCount;

    /**
     * 存在字段新增的任务数
     */
    @ApiModelProperty(value = "存在字段新增的任务数")
    private Integer addColumnCount;

    /**
     * 存在字段删除的任务数(高风险)
     */
    @ApiModelProperty(value = "存在字段删除的任务数(高风险)")
    private Integer dropColumnCount;

    /**
     * 混合变动任务数
     */
    @ApiModelProperty(value = "混合变动任务数")
    private Integer mixedCount;

    /**
     * 检测失败任务数
     */
    @ApiModelProperty(value = "检测失败任务数")
    private Integer errorCount;

    /**
     * 已自动演进任务数
     */
    @ApiModelProperty(value = "已自动演进任务数")
    private Integer autoAppliedCount;

    /**
     * 存在表/字段注释变动的任务数
     */
    @ApiModelProperty(value = "存在表/字段注释变动的任务数")
    private Integer commentDriftCount;

    /**
     * 存在字段类型或必填变动的任务数(待人工审查)
     */
    @ApiModelProperty(value = "存在字段类型或必填变动的任务数")
    private Integer schemaChangeCount;

    /**
     * 总耗时(毫秒)
     */
    @ApiModelProperty(value = "总耗时(毫秒)")
    private Long totalCostTimeMs;

    /**
     * 各任务详细漂移检测记录
     */
    @ApiModelProperty(value = "各任务详细漂移检测记录")
    private List<SchemaDriftItemDto> items;
}
