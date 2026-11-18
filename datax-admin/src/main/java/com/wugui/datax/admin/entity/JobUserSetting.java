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
 * 用户个性化偏好设置实体类 (job_user_setting)
 * 用于记录用户选项卡显示/隐藏、工作台偏好等，保证换机或换浏览器保留相同配置。
 *
 * @author ypc
 */
@Data
@EqualsAndHashCode(callSuper = false)
@ApiModel("用户个性化偏好设置")
@TableName("job_user_setting")
public class JobUserSetting extends Model<JobUserSetting> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键ID
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "主键ID")
    private Integer id;

    /**
     * 关联的用户ID (job_user.id)
     */
    @ApiModelProperty(value = "用户ID")
    private Integer userId;

    /**
     * 用户名 (冗余存储，便于排查与审计)
     */
    @ApiModelProperty(value = "用户名")
    private String username;

    /**
     * 配置键名 (例如: visible_tabs)
     */
    @ApiModelProperty(value = "配置键名")
    private String settingKey;

    /**
     * 配置值 (JSON 格式或文本配置)
     */
    @ApiModelProperty(value = "配置值")
    private String settingValue;

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
