package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 批量调整任务Writer连接信息请求入参DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "批量调整任务Writer连接信息入参")
public class BatchUpdateWriterDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 待批量更新的任务ID列表
     */
    @ApiModelProperty(value = "任务ID列表", required = true)
    private List<Integer> jobIds;

    /**
     * 改库作用端：WRITER（默认，修改目标端）、READER（修改源端）、BOTH（源端与目标端均修改）
     */
    @ApiModelProperty(value = "改库作用端：WRITER（默认）、READER、BOTH")
    private String updateScope;

    /**
     * 模式一：源端数据源ID（若作用端为READER，可传此值或writerDatasourceId）
     */
    @ApiModelProperty(value = "源端数据源ID（模式一：绑定已有数据源）")
    private Long readerDatasourceId;

    /**
     * 模式一：目标数据源ID（若指定则从该数据源同步读取jdbcUrl、username、password）
     */
    @ApiModelProperty(value = "目标数据源ID（模式一：绑定已有数据源）")
    private Long writerDatasourceId;

    /**
     * 模式二：旧JDBC连接串查找匹配模式/关键字（为空则匹配全部已有连接）
     */
    @ApiModelProperty(value = "旧JDBC连接串匹配关键字或正则（模式二：规则替换）")
    private String oldJdbcUrlPattern;

    /**
     * 模式二：新JDBC连接串（若oldJdbcUrlPattern不为空，则进行局部替换；若为空，则整体覆盖）
     */
    @ApiModelProperty(value = "新JDBC连接串（模式二：规则替换）")
    private String newJdbcUrl;

    /**
     * 模式二：可选覆盖新用户名
     */
    @ApiModelProperty(value = "新用户名（可选）")
    private String newUsername;

    /**
     * 模式二：可选覆盖新密码
     */
    @ApiModelProperty(value = "新密码（可选）")
    private String newPassword;

    /**
     * 若目标库表不存在是否自动在目标库建表
     */
    @ApiModelProperty(value = "若目标库表不存在是否自动在目标库建表")
    private Boolean autoCreateTable;

    /**
     * 执行器路由策略（选填，如 ROUND, RANDOM, FIRST 等）
     */
    @ApiModelProperty(value = "执行器路由策略（选填）")
    private String executorRouteStrategy;

    /**
     * 任务执行CRON表达式（选填）
     */
    @ApiModelProperty(value = "任务执行CRON表达式（选填）")
    private String jobCron;

    /**
     * 阻塞处理策略（选填，如 SERIAL_EXECUTION, DISCARD_LATER, COVER_EARLY）
     */
    @ApiModelProperty(value = "阻塞处理策略（选填）")
    private String executorBlockStrategy;

    /**
     * 报警邮件（选填，多个用逗号分隔，传空字符串可清空报警邮件）
     */
    @ApiModelProperty(value = "报警邮件（选填）")
    private String alarmEmail;

    /**
     * 任务类型/GLUE类型（选填，如 BEAN, GLUE_SHELL, GLUE_PYTHON, GLUE_POWERSHELL）
     */
    @ApiModelProperty(value = "任务类型（选填）")
    private String glueType;

    /**
     * 失败重试次数（选填，范围 0-20）
     */
    @ApiModelProperty(value = "失败重试次数（选填）")
    private Integer executorFailRetryCount;

    /**
     * 任务执行超时时间，单位分钟（选填，0表示不超时）
     */
    @ApiModelProperty(value = "任务执行超时时间，单位分钟（选填）")
    private Integer executorTimeout;
}
