package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 应用模式演进请求 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "应用模式演进请求")
public class ApplySchemaEvolutionDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 任务ID
     */
    @ApiModelProperty(value = "任务ID", required = true)
    private Integer jobId;

    /**
     * 待同步的新增字段列表(若为空则系统自动探测比对后提取)
     */
    @ApiModelProperty(value = "待同步的新增字段列表(可选)")
    private List<ColumnMappingDto> addedColumns;

    /**
     * 自定义目标表加列 DDL(可选，若不传则由系统自动推导生成)
     */
    @ApiModelProperty(value = "自定义目标表加列 DDL(可选)")
    private String customDdl;

    /**
     * 是否处理删除的字段(将删除字段从 Job JSON Reader 中剔除，默认 true)
     */
    @ApiModelProperty(value = "是否处理删除的字段", example = "true")
    private Boolean handleDroppedColumns;

    /**
     * 演进作用域: AUTO_SAFE(仅安全变更: 加列/注释/删配置列), MANUAL_REVIEW(人工审查DDL), ALL_REVIEWED(全部已审查变更)
     */
    @ApiModelProperty(value = "演进作用域", example = "ALL_REVIEWED")
    private String applyScope;

    /**
     * 手动演进后是否同步更新 jobJson 中 writer.parameter.column 的类型(如 hdfswriter 对象数组)
     */
    @ApiModelProperty(value = "是否同步更新 Job JSON 列类型", example = "true")
    private Boolean syncJobColumnTypes;
}
