package com.wugui.datax.admin.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;
import java.util.List;

/**
 * 批量设置已有任务为方案1时间增量同步入参DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "批量设置时间增量同步入参DTO", description = "用于一键将已有选中的任务配置为方案1时间自增同步")
public class BatchSetIncrementDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 需修改的任务ID列表
     */
    @ApiModelProperty(value = "任务ID列表", required = true)
    private List<Integer> jobIds;

    /**
     * 增量时间字段名（例如 update_time，默认 update_time）
     */
    @ApiModelProperty(value = "增量时间字段名", example = "update_time")
    private String timeColumn;

    /**
     * 增量起始时间（不传则默认为当前时间）
     */
    @ApiModelProperty(value = "增量起始时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date incStartTime;

    /**
     * 目标端写入模式（默认 replace 覆盖写入）
     */
    @ApiModelProperty(value = "写入模式", example = "replace")
    private String writeMode;
}
