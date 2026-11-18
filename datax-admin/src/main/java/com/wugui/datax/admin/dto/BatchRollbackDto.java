package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 批量回溯增量时间并触发同步请求 DTO
 * 用于解决业务数据更新时间落后于调度执行时间导致差异无法拉回的问题
 *
 * @author ypc
 */
@Data
@ApiModel(description = "批量回溯增量时间并触发同步请求参数")
public class BatchRollbackDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 待处理的 DataX 任务 ID 列表
     */
    @ApiModelProperty(value = "任务ID列表", required = true)
    private List<Integer> jobIds;

    /**
     * 回溯模式:
     * ALL - 全量同步 (重置起点为 1970-01-01，推荐用于彻底消除差异)
     * HOURS - 按指定小时数向前回溯
     * CUSTOM - 自定义具体起始时间
     */
    @ApiModelProperty(value = "回溯模式: ALL-全量同步, HOURS-按小时回溯, CUSTOM-指定具体时间", required = true)
    private String rollbackType = "ALL";

    /**
     * 向前回溯的小时数 (当 rollbackType 为 HOURS 时生效，例如 1, 12, 24, 72)
     */
    @ApiModelProperty(value = "向前回溯的小时数")
    private Integer rollbackHours = 24;

    /**
     * 自定义起始时间 (格式: yyyy-MM-dd HH:mm:ss，当 rollbackType 为 CUSTOM 时生效)
     */
    @ApiModelProperty(value = "自定义起始时间 (yyyy-MM-dd HH:mm:ss)")
    private String customStartTime;

    /**
     * 回溯更新增量时间成功后，是否立即自动触发调度执行 (默认 true)
     */
    @ApiModelProperty(value = "是否立即触发调度执行", required = true)
    private Boolean triggerSync = true;
}
