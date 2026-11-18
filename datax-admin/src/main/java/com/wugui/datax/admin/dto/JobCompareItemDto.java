package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;

/**
 * 单任务数据量比对与对账明细 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "单任务数据量比对与对账明细")
public class JobCompareItemDto implements Serializable {

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
     * 源端过滤条件 (Reader Where)
     */
    @ApiModelProperty(value = "源端过滤条件")
    private String readerWhere;

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
     * 目标端表名
     */
    @ApiModelProperty(value = "目标端表名")
    private String writerTable;

    /**
     * 源端总记录数 (-1 表示查询失败或超时)
     */
    @ApiModelProperty(value = "源端总记录数")
    private Long sourceCount;

    /**
     * 目标端总记录数 (-1 表示查询失败或超时)
     */
    @ApiModelProperty(value = "目标端总记录数")
    private Long targetCount;

    /**
     * 差异记录数 (源端行数 - 目标端行数)
     */
    @ApiModelProperty(value = "差异记录数(源 - 目标)")
    private Long diffCount;

    /**
     * 对账状态: 1-一致, 2-不一致, 3-超时, 4-异常
     */
    @ApiModelProperty(value = "对账状态: 1-一致, 2-不一致, 3-超时, 4-异常")
    private Integer status;

    /**
     * 状态说明或异常详情
     */
    @ApiModelProperty(value = "状态说明或异常详情")
    private String statusMsg;

    /**
     * 查询与比对耗时 (毫秒)
     */
    @ApiModelProperty(value = "比对耗时(毫秒)")
    private Long costTimeMs;

    /**
     * 对账时间
     */
    @ApiModelProperty(value = "对账时间")
    private Date checkTime;
}
