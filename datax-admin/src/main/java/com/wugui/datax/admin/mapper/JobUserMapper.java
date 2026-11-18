package com.wugui.datax.admin.mapper;

import com.wugui.datax.admin.entity.JobUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * @author xuxueli 2019-05-04 16:44:59
 */
@Mapper
@Repository
public interface JobUserMapper {

    List<JobUser> pageList(@Param("offset") int offset,
                           @Param("pagesize") int pagesize,
                           @Param("username") String username);

    List<JobUser> findAll(@Param("username") String username);

    int pageListCount(@Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("username") String username);

    JobUser loadByUserName(@Param("username") String username);

    JobUser getUserById(@Param("id") int id);

    List<JobUser> getUsersByIds(@Param("ids") String[] ids);

    int save(JobUser jobUser);

    int update(JobUser jobUser);

    int delete(@Param("id") int id);

    List<JobUser> findByRole(@Param("role") String role);

    int updateUserRole(@Param("id") int id, @Param("role") String role);

    /**
     * 将指定角色的所有用户批量更新重置为新角色（用于角色删除后重置用户）
     *
     * @param oldRole 旧角色编码
     * @param newRole 新角色编码
     * @return 影响行数
     */
    int resetUserRoleByRole(@Param("oldRole") String oldRole, @Param("newRole") String newRole);

}

