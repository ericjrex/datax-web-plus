package com.wugui.datax.admin.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.util.Date;

/**
 * 接口在线试运行与取样请求参数 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "接口在线试运行入参DTO")
public class ApiTestRunDto {

    @ApiModelProperty(value = "请求URL (必填)", required = true)
    private String requestUrl;

    @ApiModelProperty(value = "请求方法: GET, POST, PUT")
    private String requestMethod = "GET";

    @ApiModelProperty(value = "请求头配置 JSON")
    private String requestHeaders;

    @ApiModelProperty(value = "Query参数配置 JSON")
    private String requestParams;

    @ApiModelProperty(value = "请求体类型: none, json, form")
    private String requestBodyType = "none";

    @ApiModelProperty(value = "请求体内容")
    private String requestBody;

    @ApiModelProperty(value = "认证类型: NONE, API_KEY, BEARER_TOKEN, BASIC_AUTH")
    private String authType = "NONE";

    @ApiModelProperty(value = "认证配置 JSON")
    private String authConfig;

    @ApiModelProperty(value = "参数驱动源数据源ID (0表示无驱动源)")
    private Long driverDatasourceId;

    @ApiModelProperty(value = "参数驱动查询SQL (如: SELECT veh_num FROM dim_vehicle WHERE is_active=1)")
    private String driverSql;

    @ApiModelProperty(value = "驱动模式: ROW-按单行逐条遍历, BATCH-按批次切片拼接")
    private String driverParamMode = "ROW";

    @ApiModelProperty(value = "驱动批次大小 (ROW模式为1，BATCH模式可为20~100)")
    private Integer driverBatchSize = 1;

    @ApiModelProperty(value = "分页策略: NONE, PAGE_NUM, OFFSET, CURSOR")
    private String pageStrategy = "NONE";

    @ApiModelProperty(value = "页码/偏移量参数名")
    private String pageParamName;

    @ApiModelProperty(value = "每页条数参数名")
    private String sizeParamName;

    @ApiModelProperty(value = "分页起始页码 (0或1)")
    private Integer pageStartIndex = 1;

    @ApiModelProperty(value = "每页拉取数量")
    private Integer pageSize = 10;

    @ApiModelProperty(value = "数据列表根提取路径 (如$.data.list)")
    private String dataExtractPath = "$.data";

    @ApiModelProperty(value = "业务成功状态路径 (如$.code)")
    private String responseSuccessPath = "$.code";

    @ApiModelProperty(value = "业务成功期望值 (如200)")
    private String responseSuccessValue = "200";

    @ApiModelProperty(value = "最大取样条数 (默认10条)")
    private Integer sampleLimit = 10;

    @ApiModelProperty(value = "增量同步模式: 0-全量同步, 1-时间增量同步")
    private Integer incrementType = 0;

    @ApiModelProperty(value = "增量起始时间/下次增量时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date incStartTime;

    @ApiModelProperty(value = "增量时间格式 (如yyyy-MM-dd HH:mm:ss, timestamp)")
    private String incTimeFormat = "yyyy-MM-dd HH:mm:ss";

    @ApiModelProperty(value = "单次请求超时时间(秒，默认60秒)")
    private Integer timeoutSeconds = 60;
}
