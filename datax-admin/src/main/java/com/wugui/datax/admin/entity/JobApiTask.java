package com.wugui.datax.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Date;

/**
 * 接口数据采集与落库任务实体类 (job_api_task)
 *
 * @author ypc
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "接口数据采集任务实体")
@TableName("job_api_task")
public class JobApiTask extends Model<JobApiTask> {

    @TableField(exist = false)
    @ApiModelProperty(value = "目标端数据源名称 (关联显示)")
    private String targetDatasourceName;

    @TableField(exist = false)
    @ApiModelProperty(value = "驱动端数据源名称 (关联显示)")
    private String driverDatasourceName;

    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "主键ID")
    private Long id;

    @ApiModelProperty(value = "任务名称")
    private String taskName;

    @ApiModelProperty(value = "关联的 xxl-job (job_info) 调度ID")
    private Integer jobId;

    @ApiModelProperty(value = "定时调度CRON表达式")
    private String cronExpression;

    @ApiModelProperty(value = "调度状态: 0-停止, 1-运行, 2-草稿")
    private Integer status;

    @ApiModelProperty(value = "请求URL (支持${}占位符)")
    private String requestUrl;

    @ApiModelProperty(value = "请求方法: GET, POST, PUT")
    private String requestMethod;

    @ApiModelProperty(value = "请求头配置 JSON")
    private String requestHeaders;

    @ApiModelProperty(value = "Query参数配置 JSON")
    private String requestParams;

    @ApiModelProperty(value = "请求体类型: none, json, form")
    private String requestBodyType;

    @ApiModelProperty(value = "请求体内容")
    private String requestBody;

    @ApiModelProperty(value = "认证类型: NONE, API_KEY, BEARER_TOKEN, BASIC_AUTH")
    private String authType;

    @ApiModelProperty(value = "认证配置 (密文存储)")
    private String authConfig;

    @ApiModelProperty(value = "参数驱动源数据源ID (0表示无驱动源)")
    private Long driverDatasourceId;

    @ApiModelProperty(value = "参数驱动查询SQL (如: SELECT veh_num FROM dim_vehicle WHERE is_active=1)")
    private String driverSql;

    @ApiModelProperty(value = "驱动模式: ROW-按单行逐条遍历, BATCH-按批次切片拼接")
    private String driverParamMode;

    @ApiModelProperty(value = "驱动批次大小 (ROW模式为1，BATCH模式可为20~100)")
    private Integer driverBatchSize;

    @ApiModelProperty(value = "驱动批次间请求休眠间隔(ms，防三方频控)")
    private Integer driverDelayMs;

    @ApiModelProperty(value = "分页策略: NONE, PAGE_NUM, OFFSET, CURSOR")
    private String pageStrategy;

    @ApiModelProperty(value = "页码/偏移量参数名")
    private String pageParamName;

    @ApiModelProperty(value = "每页条数参数名")
    private String sizeParamName;

    @ApiModelProperty(value = "分页起始页码 (0或1)")
    private Integer pageStartIndex;

    @ApiModelProperty(value = "每页拉取数量")
    private Integer pageSize;

    @ApiModelProperty(value = "游标提取JSONPath")
    private String cursorExtractPath;

    @ApiModelProperty(value = "最大循环保护阈值 (防死循环)")
    private Integer maxPageLimit;

    @ApiModelProperty(value = "停止判定JSONPath (如$.has_more)")
    private String stopConditionPath;

    @ApiModelProperty(value = "增量同步模式: 0-全量同步, 1-时间增量同步")
    private Integer incrementType;

    @ApiModelProperty(value = "增量起始时间/下次增量时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date incStartTime;

    @ApiModelProperty(value = "增量时间格式 (如yyyy-MM-dd HH:mm:ss, timestamp)")
    private String incTimeFormat;

    @ApiModelProperty(value = "增量时间提取字段名 (从返回数据对象中提取，如 updateTime, loginDate)")
    private String incTimeColumn;

    @ApiModelProperty(value = "增量时间推进策略: 0-取返回数据中最大业务时间, 1-按系统物理时间")
    private Integer incStrategy;

    @ApiModelProperty(value = "成功状态码提取路径")
    private String responseSuccessPath;

    @ApiModelProperty(value = "成功状态码期望值")
    private String responseSuccessValue;

    @ApiModelProperty(value = "错误消息提取路径")
    private String responseMsgPath;

    @ApiModelProperty(value = "数据列表根路径 (如$.data.list)")
    private String dataExtractPath;

    @ApiModelProperty(value = "目标端数据源ID (关联job_jdbc_datasource)")
    private Long targetDatasourceId;

    @ApiModelProperty(value = "目标表名")
    private String targetTableName;

    @ApiModelProperty(value = "目标表不存在时是否自动建表: 0-否, 1-是")
    private Integer autoCreateTable;

    @ApiModelProperty(value = "写入模式: APPEND, OVERWRITE, UPSERT")
    private String writeMode;

    @ApiModelProperty(value = "字段映射配置 JSON")
    private String columnMappingJson;

    @ApiModelProperty(value = "写入前执行SQL")
    private String preSql;

    @ApiModelProperty(value = "写入后执行SQL")
    private String postSql;

    @ApiModelProperty(value = "批处理批量大小")
    private Integer batchSize;

    @ApiModelProperty(value = "分页请求休眠间隔 (ms)")
    private Integer requestDelayMs;

    @ApiModelProperty(value = "单次请求超时时间(秒)")
    private Integer timeoutSeconds;

    @ApiModelProperty(value = "失败重试次数")
    private Integer retryCount;

    @ApiModelProperty(value = "告警通知邮箱")
    private String alarmEmail;

    @ApiModelProperty(value = "最近一次运行时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date lastRunTime;

    @ApiModelProperty(value = "最近运行状态: 0-未运行, 1-成功, 2-失败")
    private Integer lastRunStatus;

    @ApiModelProperty(value = "最近运行摘要信息 (拉取条数/耗时)")
    private String lastRunMsg;

    @ApiModelProperty(value = "备注说明")
    private String comments;

    @ApiModelProperty(value = "创建者")
    private String createBy;

    @ApiModelProperty(value = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date createTime;

    @ApiModelProperty(value = "更新者")
    private String updateBy;

    @ApiModelProperty(value = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date updateTime;
}
