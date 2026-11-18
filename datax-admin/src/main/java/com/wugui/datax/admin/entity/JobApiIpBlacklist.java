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
 * 开放 API 客户端 IP 黑名单实体类 (job_api_ip_blacklist)
 *
 * @author ypc
 * @since 2026-11-03
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "开放API客户端IP黑名单管控实体")
@TableName("job_api_ip_blacklist")
public class JobApiIpBlacklist extends Model<JobApiIpBlacklist> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键ID
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "自增主键ID")
    private Integer id;

    /**
     * 被封禁的客户端 IP 地址(支持精确 IP、* 通配符或 CIDR 网段)
     */
    @ApiModelProperty(value = "被封禁的客户端IP地址(支持精确IP、*通配符或CIDR网段)")
    private String ipAddress;

    /**
     * 封禁作用范围：* 代表全局封禁所有 API 账号，指定 app_key 代表仅封禁该账号
     */
    @ApiModelProperty(value = "封禁作用范围(*表示全局封禁，或指定appKey)")
    private String appKey;

    /**
     * 关联账号中文名称 (非持久化展示字段)
     */
    @TableField(exist = false)
    @ApiModelProperty(value = "关联账号中文名称")
    private String accountName;

    /**
     * 封禁原因说明或拦截备注
     */
    @ApiModelProperty(value = "封禁原因说明或拦截备注")
    private String reason;

    /**
     * 关联触发拉黑的源调用审计日志 ID (job_api_log.id)
     */
    @ApiModelProperty(value = "关联触发拉黑的源调用审计日志ID")
    private Long sourceLogId;

    /**
     * 黑名单状态：1-生效中，0-已解封
     */
    @ApiModelProperty(value = "黑名单状态：1-生效中，0-已解封")
    private Integer status;

    /**
     * 操作管理员用户名
     */
    @ApiModelProperty(value = "操作管理员用户名")
    private String createBy;

    /**
     * 创建时间
     */
    @ApiModelProperty(value = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date createTime;

    /**
     * 更新时间
     */
    @ApiModelProperty(value = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date updateTime;
}
