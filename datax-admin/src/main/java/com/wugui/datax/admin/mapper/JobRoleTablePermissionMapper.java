package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobRoleTablePermission;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 角色库表权限数据访问层 Mapper
 *
 * @author ypc
 * @since 2026-09-11
 */
@Mapper
public interface JobRoleTablePermissionMapper extends BaseMapper<JobRoleTablePermission> {

    /**
     * 根据角色编码与数据源ID查询授权记录
     *
     * @param roleCode 角色标识
     * @param datasourceId 数据源ID
     * @return 权限记录
     */
    JobRoleTablePermission getByRoleAndDatasource(@Param("roleCode") String roleCode,
                                                 @Param("datasourceId") Long datasourceId);

    /**
     * 根据角色编码查询该角色下的所有库表授权配置
     *
     * @param roleCode 角色标识
     * @return 权限记录列表
     */
    List<JobRoleTablePermission> listByRoleCode(@Param("roleCode") String roleCode);

    /**
     * 查询系统全部角色库表授权配置列表
     *
     * @return 权限列表
     */
    List<JobRoleTablePermission> listAllPermissions();
}
