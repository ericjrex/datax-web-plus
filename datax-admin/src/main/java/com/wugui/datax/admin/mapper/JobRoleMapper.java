package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobRole;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 系统角色元数据字典持久层 Mapper
 *
 * @author ypc
 * @since 2026-10-23
 */
@Mapper
@Repository
public interface JobRoleMapper extends BaseMapper<JobRole> {

    /**
     * 根据角色标识精确查询角色实体
     *
     * @param roleCode 角色编码
     * @return 角色实体
     */
    JobRole getByRoleCode(@Param("roleCode") String roleCode);

    /**
     * 查询所有角色列表 (按 sort_order, id 升序排列)
     *
     * @return 角色列表
     */
    List<JobRole> listAllRoles();
}
