package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 统计任务请求与详情 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "统计计算任务配置请求入参")
public class StatTaskDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "主键ID (更新时传入)")
    private Long id;

    @ApiModelProperty(value = "统计任务名称", required = true)
    private String taskName;

    @ApiModelProperty(value = "任务类型: SQL / PYTHON", required = true)
    private String taskType;

    @ApiModelProperty(value = "定时调度CRON表达式 (如: 0 0 2 * * ?)")
    private String cronExpression;

    @ApiModelProperty(value = "调度状态: 0-停止, 1-运行")
    private Integer status;

    @ApiModelProperty(value = "源端数据源ID (SQL模式必填)")
    private Long sourceDatasourceId;

    @ApiModelProperty(value = "统计查询SQL语句 (SQL模式生效)")
    private String sourceSql;

    @ApiModelProperty(value = "是否开启跨库多源查询: 0-单库模式, 1-跨库多源模式")
    private Integer isCrossDb;

    @ApiModelProperty(value = "跨库多源配置对象")
    private CrossDbConfigDto crossDbConfig;

    @ApiModelProperty(value = "跨库多源配置JSON字符串")
    private String crossDbConfigJson;

    @ApiModelProperty(value = "Python计算脚本源码 (PYTHON模式生效)")
    private String pythonScript;

    @ApiModelProperty(value = "Python脚本动态参数 (JSON格式)")
    private String pythonParams;

    @ApiModelProperty(value = "目标端数据源ID (可选库)", required = true)
    private Long targetDatasourceId;

    @ApiModelProperty(value = "目标端数据表名 (选表输出)", required = true)
    private String targetTableName;

    @ApiModelProperty(value = "目标表不存在时是否自动建表: 0-否, 1-是")
    private Integer autoCreateTable;

    @ApiModelProperty(value = "写入模式: APPEND(追加), OVERWRITE(覆盖), UPSERT(更新插入)")
    private String writeMode;

    @ApiModelProperty(value = "字段映射列表")
    private List<StatTaskColumnMappingDto> columnMappings;

    @ApiModelProperty(value = "批量写入BatchSize (默认1000)")
    private Integer batchSize;

    @ApiModelProperty(value = "执行超时时间(秒，默认3600)")
    private Integer timeoutSeconds;

    @ApiModelProperty(value = "失败报警邮箱")
    private String alarmEmail;

    @ApiModelProperty(value = "阻塞处理策略: SERIAL_EXECUTION, DISCARD_LATER, COVER_EARLY, CONCURRENT")
    private String executorBlockStrategy;

    @ApiModelProperty(value = "备注描述")
    private String comments;
}
