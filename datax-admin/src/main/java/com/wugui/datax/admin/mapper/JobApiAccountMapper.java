package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobApiAccount;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Repository;

/**
 * 外部 API 接口账号及权限持久层 Mapper
 *
 * @author ypc
 * @since 2026-10-28
 */
@Mapper
@Repository
public interface JobApiAccountMapper extends BaseMapper<JobApiAccount> {

    /**
     * 根据 AppKey 查询有效的启用账号
     *
     * @param appKey AccessKey
     * @return 账号实体
     */
    JobApiAccount getByAppKey(@Param("appKey") String appKey);
}
