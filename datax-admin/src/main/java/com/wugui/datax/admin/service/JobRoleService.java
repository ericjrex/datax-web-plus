package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.entity.JobRole;

import java.util.List;

/**
 * 系统角色元数据字典服务接口
 *
 * @author ypc
 * @since 2026-10-23
 */
public interface JobRoleService extends IService<JobRole> {

    /**
     * 查询所有角色列表 (按排序号升序排列)
     *
     * @return 角色列表
     */
    List<JobRole> listAllRoles();

    /**
     * 新增角色 (包含合法性校验与防重保护)
     *
     * @param jobRole 角色实体
     * @return 保存成功返回 null，失败返回错误原因提示
     */
    String addRole(JobRole jobRole);

    /**
     * 根据角色编码精确查询角色实体
     *
     * @param roleCode 角色标识
     * @return 角色实体
     */
    JobRole getByRoleCode(String roleCode);

    /**
     * 删除指定角色及其所有关联配置（级联删除库表权限、菜单权限并重置关联用户为普通用户）
     *
     * @param roleCode 角色标识
     * @return 成功返回 null，失败返回错误原因提示
     */
    String deleteRole(String roleCode);
}
