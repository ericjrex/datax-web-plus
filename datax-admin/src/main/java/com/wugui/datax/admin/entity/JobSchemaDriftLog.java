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
 * DataX任务元数据漂移与模式演进审计日志实体类
 *
 * @author ypc
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "DataX任务元数据漂移与模式演进审计日志实体")
@TableName("job_schema_drift_log")
public class JobSchemaDriftLog extends Model<JobSchemaDriftLog> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键ID
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "自增主键ID")
    private Long id;

    /**
     * 探测或演进批次号
     */
    @ApiModelProperty(value = "探测或演进批次号")
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
     * 目标端表名(OBS外部表等)
     */
    @ApiModelProperty(value = "目标端表名(OBS外部表等)")
    private String writerTable;

    /**
     * 漂移类型: NONE, ADD_COLUMN, DROP_COLUMN, MODIFY_COLUMN, MIXED
     */
    @ApiModelProperty(value = "漂移类型")
    private String driftType;

    /**
     * 差异明细JSON(新增列、删除列等)
     */
    @ApiModelProperty(value = "差异明细JSON")
    private String driftDetailJson;

    /**
     * 演进前的Job JSON快照(用于版本回滚)
     */
    @ApiModelProperty(value = "演进前的Job JSON快照(用于版本回滚)")
    private String beforeJobJson;

    /**
     * 演进后的Job JSON快照
     */
    @ApiModelProperty(value = "演进后的Job JSON快照")
    private String afterJobJson;

    /**
     * 在目标端(OBS/Hive等)执行的演进DDL语句
     */
    @ApiModelProperty(value = "在目标端执行的演进DDL语句")
    private String targetDdl;

    /**
     * 状态: DETECTED, AUTO_APPLIED, MANUAL_APPLIED, ROLLED_BACK, FAILED
     */
    @ApiModelProperty(value = "状态")
    private String status;

    /**
     * 状态描述或异常信息
     */
    @ApiModelProperty(value = "状态描述或异常信息")
    private String statusMsg;

    /**
     * 检测或执行时间
     */
    @ApiModelProperty(value = "检测或执行时间")
    private Date createTime;

    /**
     * 更新时间
     */
    @ApiModelProperty(value = "更新时间")
    private Date updateTime;

    /**
     * 操作人
     */
    @ApiModelProperty(value = "操作人")
    private String createBy;
}
