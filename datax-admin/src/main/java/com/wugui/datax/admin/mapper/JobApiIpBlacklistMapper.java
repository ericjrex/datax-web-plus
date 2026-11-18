package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobApiIpBlacklist;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 开放 API 客户端 IP 黑名单持久层 Mapper
 *
 * @author ypc
 * @since 2026-11-03
 */
@Mapper
@Repository
public interface JobApiIpBlacklistMapper extends BaseMapper<JobApiIpBlacklist> {

    /**
     * 查询所有生效中的 IP 黑名单记录 (status = 1)
     *
     * @return 生效中的黑名单列表
     */
    List<JobApiIpBlacklist> listActiveBlacklist();

    /**
     * 根据 IP 地址和作用范围 AppKey 精确查询单条记录
     *
     * @param ipAddress 客户端 IP
     * @param appKey    作用范围 (* 或具体 appKey)
     * @return 黑名单实体
     */
    JobApiIpBlacklist getByIpAndAppKey(@Param("ipAddress") String ipAddress, @Param("appKey") String appKey);
}
