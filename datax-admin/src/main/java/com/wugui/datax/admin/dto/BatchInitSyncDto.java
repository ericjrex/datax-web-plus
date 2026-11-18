package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;

import java.io.Serializable;
import java.util.List;

/**
 * 批量初始化目标表并全量同步请求入参 DTO
 *
 * @author ypc
 */
@ApiModel("批量初始化目标表并全量同步入参")
public class BatchInitSyncDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "需要初始化的任务ID列表", required = true)
    private List<Integer> jobIds;

    @ApiModelProperty(value = "是否清空目标表数据 (TRUNCATE TABLE)，默认 true")
    private Boolean truncateTargetTable = true;

    @ApiModelProperty(value = "是否重置增量起始时间为全量 (1970-01-01)，默认 true")
    private Boolean resetIncrement = true;

    @ApiModelProperty(value = "是否在初始化后立即触发调度全量同步，默认 true")
    private Boolean triggerSync = true;

    @ApiModelProperty(value = "目标端数据源ID (可选，未指定时从各任务配置中自动推导)")
    private Long writerDatasourceId;

    public List<Integer> getJobIds() {
        return jobIds;
    }

    public void setJobIds(List<Integer> jobIds) {
        this.jobIds = jobIds;
    }

    public Boolean getTruncateTargetTable() {
        return truncateTargetTable != null ? truncateTargetTable : true;
    }

    public void setTruncateTargetTable(Boolean truncateTargetTable) {
        this.truncateTargetTable = truncateTargetTable;
    }

    public Boolean getResetIncrement() {
        return resetIncrement != null ? resetIncrement : true;
    }

    public void setResetIncrement(Boolean resetIncrement) {
        this.resetIncrement = resetIncrement;
    }

    public Boolean getTriggerSync() {
        return triggerSync != null ? triggerSync : true;
    }

    public void setTriggerSync(Boolean triggerSync) {
        this.triggerSync = triggerSync;
    }

    public Long getWriterDatasourceId() {
        return writerDatasourceId;
    }

    public void setWriterDatasourceId(Long writerDatasourceId) {
        this.writerDatasourceId = writerDatasourceId;
    }
}
