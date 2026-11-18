package com.wugui.datax.admin.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;
import java.util.List;

/**
 * 带有表与字段映射的批量添加任务请求对象
 *
 * @author ypc
 */
@Data
@ApiModel(value = "带映射的批量任务构建请求对象", description = "用于接收用户确认后的表与字段映射列表，并执行自动建表及批量生成DataX任务")
public class BatchAddWithMappingDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 任务模板ID
     */
    @ApiModelProperty(value = "任务模板ID", required = true, example = "1")
    private int templateId;

    /**
     * 源端数据源ID
     */
    @ApiModelProperty(value = "源端数据源ID", required = true, example = "1")
    private Long readerDatasourceId;

    /**
     * 目标端数据源ID
     */
    @ApiModelProperty(value = "目标端数据源ID", required = true, example = "2")
    private Long writerDatasourceId;

    /**
     * 表与字段映射配置列表
     */
    @ApiModelProperty(value = "表与字段映射配置列表", required = true)
    private List<TableMappingDto> tableMappings;

    /**
     * 是否在任务创建前自动在目标库执行建表 DDL（仅对未存在的表生效）
     */
    @ApiModelProperty(value = "是否自动执行建表DDL", example = "true")
    private Boolean autoCreateTable = false;

    /**
     * RdbmsReader 特有配置参数（如 splitPk, where 等）
     */
    @ApiModelProperty(value = "RdbmsReader高级配置")
    private RdbmsReaderDto rdbmsReader;

    /**
     * RdbmsWriter 特有配置参数（如 preSql, postSql, writeMode 等）
     */
    @ApiModelProperty(value = "RdbmsWriter高级配置")
    private RdbmsWriterDto rdbmsWriter;

    /**
     * 是否开启方案1时间增量同步
     */
    @ApiModelProperty(value = "是否开启方案1时间增量同步", example = "true")
    private Boolean isIncrement;

    /**
     * 增量时间字段名（例如 update_time）
     */
    @ApiModelProperty(value = "增量时间字段名", example = "update_time")
    private String timeColumn;

    /**
     * 增量起始时间（不填则默认为当前时间）
     */
    @ApiModelProperty(value = "增量起始时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date incStartTime;

    /**
     * 写入模式（例如 replace 或 update，默认 replace）
     */
    @ApiModelProperty(value = "写入模式", example = "replace")
    private String writeMode;

    /**
     * 任务名称个性化前缀
     */
    @ApiModelProperty(value = "任务名称个性化前缀", example = "dev_")
    private String jobNamePrefix;

    /**
     * 任务名称个性化词缀
     */
    @ApiModelProperty(value = "任务名称个性化词缀", example = "_sync")
    private String jobNameSuffix;

    /**
     * 任务名称命名基准规则 (READER_TABLE: 基于源表名, WRITER_TABLE: 基于目标表名, READER_TO_WRITER: 基于映射关系)
     */
    @ApiModelProperty(value = "任务名称命名基准规则", example = "READER_TABLE")
    private String jobNameRule;
}
