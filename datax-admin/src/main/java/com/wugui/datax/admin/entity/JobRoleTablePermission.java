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
 * 角色库表权限映射实体类 (job_role_table_permission)
 *
 * @author ypc
 * @since 2026-09-11
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(description = "角色库表权限授权配置实体")
@TableName("job_role_table_permission")
public class JobRoleTablePermission extends Model<JobRoleTablePermission> {

    private static final long serialVersionUID = 1L;

    /**
     * 自增主键
     */
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(value = "自增主键ID")
    private Integer id;

    /**
     * 角色标识，如 ROLE_ADMIN, ROLE_USER 或自定义业务角色
     */
    @ApiModelProperty(value = "角色标识编码")
    private String roleCode;

    /**
     * 数据源ID，关联 job_jdbc_datasource.id
     */
    @ApiModelProperty(value = "被授权的数据源ID")
    private Long datasourceId;

    /**
     * 允许访问的表名列表，以逗号分隔；* 代表整库所有表
     */
    @ApiModelProperty(value = "允许访问的表名列表(逗号分隔)，* 表示全表")
    private String tableNames;

    /**
     * 是否允许查看表数据：1-允许预览数据，0-仅允许看表名与字段结构
     */
    @ApiModelProperty(value = "是否允许查看表数据：1-允许，0-禁止")
    private Integer allowQuery;

    /**
     * 是否允许执行只读自定义SQL：1-允许，0-禁止使用SQL编辑器
     */
    @ApiModelProperty(value = "是否允许在工作台执行SQL：1-允许，0-禁止")
    private Integer allowSql;

    /**
     * 单次查询最大返回记录数限制，默认 100
     */
    @ApiModelProperty(value = "单次查询最大返回记录数限制")
    private Integer maxQueryRows;

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
