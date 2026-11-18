package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 批量元数据漂移检测请求 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "批量元数据漂移检测请求")
public class BatchSchemaDriftDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 任务ID列表
     */
    @ApiModelProperty(value = "需要检测元数据漂移的任务ID列表", required = true)
    private List<Integer> jobIds;

    /**
     * 是否在检测到新增字段时自动应用模式演进 (默认 false: 仅探测比对)
     */
    @ApiModelProperty(value = "是否自动应用模式演进(自动执行加列并更新任务JSON)", example = "false")
    private Boolean autoApply;
}
