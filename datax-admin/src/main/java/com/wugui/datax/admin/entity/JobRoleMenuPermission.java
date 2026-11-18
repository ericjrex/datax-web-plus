package com.wugui.datax.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Collection;
import java.util.Date;
import java.util.stream.Collectors;

/**
 * 角色系统菜单访问权限实体类 (job_role_menu_permission)
 *
 * @author ypc
 * @since 2026-09-11
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "角色系统菜单权限配置实体")
@TableName("job_role_menu_permission")
public class JobRoleMenuPermission extends Model<JobRoleMenuPermission> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "自增主键ID")
    private Integer id;

    /**
     * 角色标识，如 ROLE_USER 或自定义业务角色
     */
    @ApiModelProperty(value = "角色标识编码")
    private String roleCode;

    /**
     * 兼容前端传入的 roleKey 别名
     */
    public void setRoleKey(String roleKey) {
        if (this.roleCode == null || this.roleCode.isEmpty()) {
            this.roleCode = roleKey;
        }
    }

    public String getRoleKey() {
        return this.roleCode;
    }

    /**
     * 允许访问的系统菜单编码列表，以逗号分隔，如 dashboard,project,jobInfo,jobLog,tableQuery
     */
    @ApiModelProperty(value = "允许访问的菜单标识列表(逗号分隔)")
    private String menuCodes;

    /**
     * 容错处理：兼容前端传入逗号字符串或 JSON 数组
     */
    @JsonSetter("menuCodes")
    public void setMenuCodes(Object val) {
        if (val instanceof Collection) {
            this.menuCodes = ((Collection<?>) val).stream()
                    .map(Object::toString)
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.joining(","));
        } else if (val != null) {
            this.menuCodes = String.valueOf(val).trim();
        } else {
            this.menuCodes = "";
        }
    }

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
