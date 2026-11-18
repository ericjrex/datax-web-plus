package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.entity.JobRoleMenuPermission;

import java.util.List;

/**
 * 角色系统菜单访问权限服务接口
 *
 * @author ypc
 * @since 2026-09-11
 */
public interface RoleMenuPermissionService extends IService<JobRoleMenuPermission> {

    /**
     * 获取指定角色允许访问的菜单标识列表
     * 管理员角色返回包含 "*" 的列表；未配置策略的角色返回基础默认安全白名单
     *
     * @param roleCode 角色标识
     * @return 允许访问的菜单编码列表
     */
    List<String> getRoleAllowedMenuCodes(String roleCode);

    /**
     * 保存或更新角色系统菜单访问策略
     *
     * @param permission 实体
     * @return 是否成功
     */
    boolean saveOrUpdateRoleMenuPermission(JobRoleMenuPermission permission);

    /**
     * 查询所有角色系统菜单配置列表
     *
     * @return 配置列表
     */
    List<JobRoleMenuPermission> getAllRoleMenuPermissions();
}
