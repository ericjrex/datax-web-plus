package com.wugui.datax.admin.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;
import java.util.List;

/**
 * 单任务元数据漂移检测明细 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "单任务元数据漂移检测明细")
public class SchemaDriftItemDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 任务ID
     */
    @ApiModelProperty(value = "任务ID")
    private Integer jobId;

    /**
     * 任务描述
     */
    @ApiModelProperty(value = "任务描述")
    private String jobDesc;

    /**
     * 源端数据源ID
     */
    @ApiModelProperty(value = "源端数据源ID")
    private Long readerDatasourceId;

    /**
     * 源端数据源名称
     */
    @ApiModelProperty(value = "源端数据源名称")
    private String readerDatasourceName;

    /**
     * 源端表名
     */
    @ApiModelProperty(value = "源端表名")
    private String readerTable;

    /**
     * 目标端数据源ID
     */
    @ApiModelProperty(value = "目标端数据源ID")
    private Long writerDatasourceId;

    /**
     * 目标端数据源名称
     */
    @ApiModelProperty(value = "目标端数据源名称")
    private String writerDatasourceName;

    /**
     * 目标端表名(OBS外部表等)
     */
    @ApiModelProperty(value = "目标端表名(OBS外部表等)")
    private String writerTable;

    /**
     * 当前任务配置的源表字段列表
     */
    @ApiModelProperty(value = "当前任务配置的源表字段列表")
    private List<String> currentConfigColumns;

    /**
     * 源库物理表当前最新字段列表
     */
    @ApiModelProperty(value = "源库物理表当前最新字段列表")
    private List<String> latestSourceColumns;

    /**
     * 目标端物理表当前字段列表
     */
    @ApiModelProperty(value = "目标端物理表当前字段列表")
    private List<String> latestTargetColumns;

    /**
     * 源端新增的字段明细列表
     */
    @ApiModelProperty(value = "源端新增的字段明细列表")
    private List<ColumnMappingDto> addedColumns;

    /**
     * 源端删除的字段列表
     */
    @ApiModelProperty(value = "源端删除的字段列表")
    private List<String> droppedColumns;

    /**
     * 漂移类型: NONE(无变动), ADD_COLUMN(新增列), DROP_COLUMN(删除列), MIXED(混合变动)
     */
    @ApiModelProperty(value = "漂移类型: NONE(无变动), ADD_COLUMN(新增列), DROP_COLUMN(删除列), MIXED(混合变动)")
    private String driftType;

    /**
     * 目标端建议执行的加列 DDL
     */
    @ApiModelProperty(value = "目标端建议执行的加列 DDL")
    private String recommendedDdl;

    /**
     * 演进处理状态: DETECTED(已探测到差异), AUTO_APPLIED(已自动演进), MANUAL_APPLIED(已手动演进), NORMAL(无差异), FAILED(检测失败)
     */
    @ApiModelProperty(value = "演进处理状态")
    private String status;

    /**
     * 状态描述或异常信息
     */
    @ApiModelProperty(value = "状态描述或异常信息")
    private String statusMsg;

    /**
     * 耗时(毫秒)
     */
    @ApiModelProperty(value = "耗时(毫秒)")
    private Long costTimeMs;

    /**
     * 检测时间
     */
    @ApiModelProperty(value = "检测时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date checkTime;

    /**
     * 表注释是否发生变更
     */
    @ApiModelProperty(value = "表注释是否发生变更")
    private Boolean tableCommentChanged;

    /**
     * 目标端旧表注释
     */
    @ApiModelProperty(value = "目标端旧表注释")
    private String oldTableComment;

    /**
     * 源端新表注释
     */
    @ApiModelProperty(value = "源端新表注释")
    private String newTableComment;

    /**
     * 字段注释变更明细列表
     */
    @ApiModelProperty(value = "字段注释变更明细列表")
    private List<ColumnCommentChangeDto> columnCommentChanges;

    /**
     * 字段类型或必填约束变更明细列表
     */
    @ApiModelProperty(value = "字段类型或必填约束变更明细列表")
    private List<ColumnSchemaChangeDto> columnSchemaChanges;

    /**
     * 可安全自动演进的 DDL(新增列 + 表/字段注释修改)
     */
    @ApiModelProperty(value = "可安全自动演进的 DDL")
    private String autoSafeDdl;

    /**
     * 需人工审查后手动执行的 DDL(字段类型/必填变更)
     */
    @ApiModelProperty(value = "需人工审查后手动执行的 DDL")
    private String manualReviewDdl;

    /**
     * 是否包含需要人工审查的变更(类型或必填变更)
     */
    @ApiModelProperty(value = "是否包含需要人工审查的变更")
    private Boolean hasManualReviewChanges;

    /**
     * 目标物理表探测降级提示(非阻塞)
     */
    @ApiModelProperty(value = "目标物理表探测降级提示")
    private String targetWarningMsg;
}
