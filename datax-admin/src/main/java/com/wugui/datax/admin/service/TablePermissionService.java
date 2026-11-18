package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.entity.JobRoleTablePermission;

import java.util.List;

/**
 * 角色库表权限业务逻辑接口
 *
 * @author ypc
 * @since 2026-09-11
 */
public interface TablePermissionService extends IService<JobRoleTablePermission> {

    /**
     * 判断当前角色对指定数据源下的数据表是否有访问权限
     *
     * @param roleCode 角色标识
     * @param datasourceId 数据源ID
     * @param tableName 表名
     * @return 是否允许访问
     */
    boolean isTableAllowed(String roleCode, Long datasourceId, String tableName);

    /**
     * 判断当前角色对指定数据源表是否有数据预览查询权限
     *
     * @param roleCode 角色标识
     * @param datasourceId 数据源ID
     * @param tableName 表名
     * @return 是否允许查询表数据
     */
    boolean isQueryAllowed(String roleCode, Long datasourceId, String tableName);

    /**
     * 判断当前角色在指定数据源上是否允许执行只读自定义 SQL
     *
     * @param roleCode 角色标识
     * @param datasourceId 数据源ID
     * @return 是否允许执行自定义SQL
     */
    boolean isSqlAllowed(String roleCode, Long datasourceId);

    /**
     * 获取当前角色在指定数据源上的单次最大查询返回行数
     *
     * @param roleCode 角色标识
     * @param datasourceId 数据源ID
     * @return 最大行数限制
     */
    int getMaxQueryRows(String roleCode, Long datasourceId);

    /**
     * 获取指定角色被授权的所有数据源 ID 列表 (管理员返回 null，表示无限制全量)
     *
     * @param roleCode 角色标识
     * @return 数据源ID列表
     */
    List<Long> getAllowedDatasourceIds(String roleCode);

    /**
     * 获取指定角色在某数据源上允许访问的表名列表配置
     *
     * @param roleCode 角色标识
     * @param datasourceId 数据源ID
     * @return 表名列表（如果包含 * 则表示全量）
     */
    List<String> getAllowedTableNames(String roleCode, Long datasourceId);

    /**
     * 保存或更新角色库表权限配置
     *
     * @param permission 权限实体
     * @return 操作是否成功
     */
    boolean saveOrUpdateRolePermission(JobRoleTablePermission permission);

    /**
     * 查询指定角色的所有库表授权记录
     *
     * @param roleCode 角色编码
     * @return 权限配置列表
     */
    List<JobRoleTablePermission> getPermissionsByRole(String roleCode);

    /**
     * 查询系统中所有角色的库表授权列表
     *
     * @return 全部权限配置列表
     */
    List<JobRoleTablePermission> getAllPermissions();
}
