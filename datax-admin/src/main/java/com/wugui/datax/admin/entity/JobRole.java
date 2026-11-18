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
 * 系统角色元数据字典实体类 (job_role)
 *
 * @author ypc
 * @since 2026-10-23
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "系统角色元数据字典实体")
@TableName("job_role")
public class JobRole extends Model<JobRole> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "主键ID")
    private Integer id;

    /**
     * 角色标识编码，如 ROLE_ADMIN, ROLE_USER, ROLE_ANALYST
     */
    @ApiModelProperty(value = "角色唯一编码")
    private String roleCode;

    /**
     * 角色中文名称，如 系统管理员, 普通用户
     */
    @ApiModelProperty(value = "角色中文名称")
    private String roleName;

    /**
     * 角色职责与权限说明描述
     */
    @ApiModelProperty(value = "角色描述说明")
    private String description;

    /**
     * 是否系统内置(1:是，禁止删除与修改编码; 0:自定义角色)
     */
    @ApiModelProperty(value = "是否系统内置(1:是, 0:否)")
    private Integer isSystem;

    /**
     * 界面展示排序号 (数字越小越靠前)
     */
    @ApiModelProperty(value = "展示排序号")
    private Integer sortOrder;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    @ApiModelProperty(value = "创建时间")
    private Date createTime;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    @ApiModelProperty(value = "更新时间")
    private Date updateTime;

    /**
     * 兼容前端传入或读取的 roleKey 别名
     */
    public void setRoleKey(String roleKey) {
        if (this.roleCode == null || this.roleCode.isEmpty()) {
            this.roleCode = roleKey;
        }
    }

    public String getRoleKey() {
        return this.roleCode;
    }
}
