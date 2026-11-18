package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobRoleMenuPermission;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 角色系统菜单访问权限持久层 Mapper
 *
 * @author ypc
 * @since 2026-09-11
 */
@Mapper
@Repository
public interface JobRoleMenuPermissionMapper extends BaseMapper<JobRoleMenuPermission> {

    /**
     * 根据角色编码精确查询菜单授权策略
     *
     * @param roleCode 角色编码
     * @return 角色菜单权限实体
     */
    JobRoleMenuPermission getByRoleCode(@Param("roleCode") String roleCode);

    /**
     * 查询所有角色系统菜单授权记录
     *
     * @return 列表
     */
    List<JobRoleMenuPermission> listAllRoleMenus();
}
