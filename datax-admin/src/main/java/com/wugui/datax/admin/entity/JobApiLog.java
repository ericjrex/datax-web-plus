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
 * 外部 API 执行与安全审计日志实体类 (job_api_log)
 *
 * @author ypc
 * @since 2026-10-28
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "外部API查询与安全审计日志实体")
@TableName("job_api_log")
public class JobApiLog extends Model<JobApiLog> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键ID
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "自增主键ID")
    private Long id;

    /**
     * 调用账号 AccessKey
     */
    @ApiModelProperty(value = "调用方 AccessKey")
    private String appKey;

    /**
     * 调用账号中文名称 (非持久化业务字段，展示审计列表时动态填充)
     */
    @TableField(exist = false)
    @ApiModelProperty(value = "调用账号中文名称")
    private String accountName;

    /**
     * 客户端IP
     */
    @ApiModelProperty(value = "客户端发起请求的真实IP")
    private String clientIp;

    /**
     * 调用终端或 AI 工具来源标识 (如 Trae (MCP)、WorkBuddy (MCP)、Chrome 130、Postman)
     */
    @ApiModelProperty(value = "调用终端或AI工具来源标识")
    private String clientSource;

    /**
     * 原始 HTTP User-Agent 请求头
     */
    @ApiModelProperty(value = "原始 HTTP User-Agent 请求头")
    private String userAgent;

    /**
     * 请求系统领域
     */
    @ApiModelProperty(value = "请求系统领域代码")
    private String domainCode;

    /**
     * 执行的SQL语句
     */
    @ApiModelProperty(value = "执行的完整SQL文本")
    private String executeSql;

    /**
     * AST解析涉及的表清单
     */
    @ApiModelProperty(value = "AST语法树提取涉及的数据表清单")
    private String tablesInvolved;

    /**
     * 返回数据行数(条)
     */
    @ApiModelProperty(value = "返回数据记录数(条)")
    private Integer resultRows;

    /**
     * 执行耗时(毫秒)
     */
    @ApiModelProperty(value = "执行耗时(毫秒)")
    private Integer costMs;

    /**
     * 执行结果：1-成功，0-失败，2-安全拦截
     */
    @ApiModelProperty(value = "执行结果状态：1-成功，0-失败，2-安全拦截")
    private Integer status;

    /**
     * 失败或拦截原因
     */
    @ApiModelProperty(value = "失败或拦截报错信息说明")
    private String errorMsg;

    /**
     * 调用时间
     */
    @ApiModelProperty(value = "调用请求接收时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date createTime;
}
