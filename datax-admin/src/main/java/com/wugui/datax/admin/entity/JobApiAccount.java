package com.wugui.datax.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
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
 * 外部 API 接口账号及权限配置实体类 (job_api_account)
 *
 * @author ypc
 * @since 2026-10-28
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "外部API调用账号与权限配置实体")
@TableName("job_api_account")
public class JobApiAccount extends Model<JobApiAccount> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键ID
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "自增主键ID")
    private Integer id;

    /**
     * 分配给三方系统的 AccessKey
     */
    @ApiModelProperty(value = "三方调用 AccessKey (AK)")
    private String appKey;

    /**
     * 签名密钥 Secret
     */
    @ApiModelProperty(value = "签名密钥 Secret (SK)")
    private String appSecret;

    /**
     * 三方系统或账号名称
     */
    @ApiModelProperty(value = "三方系统或账号中文名称")
    private String accountName;

    /**
     * 所属业务领域代码(如 JIA_PEI, BEI_DOU, TAXICAB)
     */
    @ApiModelProperty(value = "所属业务领域编码")
    private String domainCode;

    /**
     * 绑定的只读数据源ID (关联 job_jdbc_datasource.id)
     */
    @ApiModelProperty(value = "绑定的只读数据源ID")
    private Long datasourceId;

    /**
     * 允许访问的表列表(逗号分隔)，* 代表该领域下全部表
     */
    @ApiModelProperty(value = "允许访问的数据表白名单(逗号分隔，*表示整库表)")
    private String allowedTables;

    /**
     * 多数据源库与表授权清单JSON配置
     */
    @ApiModelProperty(value = "多数据源库与表授权清单JSON配置")
    private String permissions;

    /**
     * 允许调用的客户端服务器IP白名单(逗号分隔，空表示不限)
     */
    @ApiModelProperty(value = "客户端IP来源白名单(逗号分隔，空表示不限制)")
    private String allowedIps;

    /**
     * 单账号QPS限流上限，默认 10
     */
    @ApiModelProperty(value = "单账号每秒最大请求QPS限制")
    private Integer rateLimitQps;

    /**
     * 账号状态：1-启用，0-停用
     */
    @ApiModelProperty(value = "账号状态：1-启用，0-停用")
    private Integer status;

    /**
     * 账号用途描述与备注
     */
    @ApiModelProperty(value = "账号用途与配置说明")
    private String comments;

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
