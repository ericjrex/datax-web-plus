package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 目标端表存在性检测结果DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "目标端表存在性检测结果")
public class CheckTargetTableResultDto implements Serializable {

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
     * 源端表名
     */
    @ApiModelProperty(value = "源端表名")
    private String readerTable;

    /**
     * 目标端表名
     */
    @ApiModelProperty(value = "目标端表名")
    private String writerTable;

    /**
     * 目标库中该表是否已存在
     */
    @ApiModelProperty(value = "目标库中该表是否已存在")
    private Boolean targetTableExists;

    /**
     * 是否需要建表（true：需要建表；false：无需建表）
     */
    @ApiModelProperty(value = "是否需要建表")
    private Boolean needCreate;

    /**
     * 自动推导出的建表DDL语句
     */
    @ApiModelProperty(value = "自动推导出的建表DDL语句")
    private String createTableSql;
}
