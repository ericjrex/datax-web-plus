package com.wugui.datax.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Date;

/**
 * 统计计算任务实体类 (job_stat_task)
 *
 * @author ypc
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "统计计算任务实体")
@TableName("job_stat_task")
public class JobStatTask extends Model<JobStatTask> {

    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "主键ID")
    private Long id;

    @ApiModelProperty(value = "统计任务名称")
    private String taskName;

    @ApiModelProperty(value = "任务类型: SQL / PYTHON")
    private String taskType;

    @ApiModelProperty(value = "关联的 xxl-job (job_info) 调度ID")
    private Integer jobId;

    @ApiModelProperty(value = "定时调度CRON表达式")
    private String cronExpression;

    @ApiModelProperty(value = "调度状态: 0-停止, 1-运行")
    private Integer status;

    @ApiModelProperty(value = "源端数据源ID (SQL模式必填)")
    private Long sourceDatasourceId;

    @ApiModelProperty(value = "统计查询SQL语句 (SQL模式生效)")
    private String sourceSql;

    @ApiModelProperty(value = "是否开启跨库多源查询: 0-单库模式, 1-跨库多源模式")
    private Integer isCrossDb;

    @ApiModelProperty(value = "跨库多源配置JSON (包含多数据源节点列表、合并策略 UNION_ALL / KEY_JOIN / FEDERATED_SQL 等)")
    private String crossDbConfigJson;

    @ApiModelProperty(value = "Python计算脚本源码 (PYTHON模式生效)")
    private String pythonScript;

    @ApiModelProperty(value = "Python脚本动态参数 (JSON格式)")
    private String pythonParams;

    @ApiModelProperty(value = "目标端数据源ID (可选库)")
    private Long targetDatasourceId;

    @ApiModelProperty(value = "目标端数据表名 (选表输出)")
    private String targetTableName;

    @ApiModelProperty(value = "目标表不存在时是否自动建表: 0-否, 1-是")
    private Integer autoCreateTable;

    @ApiModelProperty(value = "写入模式: APPEND(追加), OVERWRITE(覆盖), UPSERT(更新插入)")
    private String writeMode;

    @ApiModelProperty(value = "字段映射关系配置JSON")
    private String columnMappingJson;

    @ApiModelProperty(value = "批量写入BatchSize")
    private Integer batchSize;

    @ApiModelProperty(value = "执行超时时间(秒)")
    private Integer timeoutSeconds;

    @ApiModelProperty(value = "失败报警邮箱")
    private String alarmEmail;

    @ApiModelProperty(value = "阻塞处理策略: SERIAL_EXECUTION, DISCARD_LATER, COVER_EARLY, CONCURRENT")
    private String executorBlockStrategy;

    @ApiModelProperty(value = "最近一次触发时间")
    private Date lastRunTime;

    @ApiModelProperty(value = "最近执行状态: 0-未运行, 1-成功, 2-失败")
    private Integer lastRunStatus;

    @ApiModelProperty(value = "最近执行摘要/行数/耗时")
    private String lastRunMsg;

    @ApiModelProperty(value = "备注描述")
    private String comments;

    @ApiModelProperty(value = "创建人")
    private String createBy;

    @ApiModelProperty(value = "创建时间")
    private Date createTime;

    @ApiModelProperty(value = "更新人")
    private String updateBy;

    @ApiModelProperty(value = "更新时间")
    private Date updateTime;

    @TableField(exist = false)
    @ApiModelProperty(value = "源端数据源名称")
    private String sourceDatasourceName;

    @TableField(exist = false)
    @ApiModelProperty(value = "目标端数据源名称")
    private String targetDatasourceName;

    @TableField(exist = false)
    @ApiModelProperty(value = "最近一次执行触发类型: MANUAL(手动), CRON(定时)")
    private String lastTriggerType;

    @TableField(exist = false)
    @ApiModelProperty(value = "当前是否正在执行计算")
    private Boolean isRunning;
}
