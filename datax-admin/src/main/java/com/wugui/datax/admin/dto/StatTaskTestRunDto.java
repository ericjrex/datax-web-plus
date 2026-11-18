package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 统计任务试运行/在线调试请求 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "统计任务试运行请求入参")
public class StatTaskTestRunDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "任务类型: SQL / PYTHON", required = true)
    private String taskType;

    @ApiModelProperty(value = "源端数据源ID (SQL模式)")
    private Long sourceDatasourceId;

    @ApiModelProperty(value = "统计查询SQL (SQL模式)")
    private String sourceSql;

    @ApiModelProperty(value = "是否开启跨库多源查询: 0-单库模式, 1-跨库多源模式")
    private Integer isCrossDb;

    @ApiModelProperty(value = "跨库多源配置对象")
    private CrossDbConfigDto crossDbConfig;

    @ApiModelProperty(value = "Python计算脚本 (PYTHON模式)")
    private String pythonScript;

    @ApiModelProperty(value = "Python脚本动态参数 (JSON格式)")
    private String pythonParams;

    @ApiModelProperty(value = "预览返回行数限制 (默认50)")
    private Integer limit = 50;

    @ApiModelProperty(value = "目标端数据源ID (可选测试写入)")
    private Long targetDatasourceId;

    @ApiModelProperty(value = "目标端数据表名 (可选测试写入)")
    private String targetTableName;

    @ApiModelProperty(value = "写入模式 (APPEND / OVERWRITE / UPSERT)")
    private String writeMode;

    @ApiModelProperty(value = "是否仅试跑不落库 (Dry Run 模式，默认 true)")
    private Boolean dryRun = true;

    @ApiModelProperty(value = "字段映射列表 (如需测试写入)")
    private List<StatTaskColumnMappingDto> columnMappings;
}
