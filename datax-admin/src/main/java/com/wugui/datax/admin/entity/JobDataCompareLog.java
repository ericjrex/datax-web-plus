package com.wugui.datax.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Date;

/**
 * 任务数据量比对与对账日志明细实体类
 *
 * @author ypc
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "任务数据量比对与对账日志明细实体")
@TableName("job_data_compare_log")
public class JobDataCompareLog extends Model<JobDataCompareLog> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "自增主键ID")
    private Long id;

    /**
     * 对账批次号
     */
    @ApiModelProperty(value = "对账批次号")
    private String batchNo;

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
     * 目标端表名
     */
    @ApiModelProperty(value = "目标端表名")
    private String writerTable;

    /**
     * 源库记录数 (-1 表示查询失败或超时)
     */
    @ApiModelProperty(value = "源库记录数")
    private Long sourceCount;

    /**
     * 目标库记录数 (-1 表示查询失败或超时)
     */
    @ApiModelProperty(value = "目标库记录数")
    private Long targetCount;

    /**
     * 差异记录数 (源库记录数 - 目标库记录数)
     */
    @ApiModelProperty(value = "差异记录数(源 - 目标)")
    private Long diffCount;

    /**
     * 比对状态: 1-一致, 2-不一致, 3-超时, 4-异常
     */
    @ApiModelProperty(value = "比对状态: 1-一致, 2-不一致, 3-超时, 4-异常")
    private Integer status;

    /**
     * 状态说明或异常详情
     */
    @ApiModelProperty(value = "状态说明或异常详情")
    private String statusMsg;

    /**
     * 比对总耗时 (毫秒)
     */
    @ApiModelProperty(value = "比对总耗时(毫秒)")
    private Long costTime;

    /**
     * 对账执行时间
     */
    @ApiModelProperty(value = "对账执行时间")
    private Date createTime;

    /**
     * 操作人
     */
    @ApiModelProperty(value = "操作人")
    private String createBy;
}
