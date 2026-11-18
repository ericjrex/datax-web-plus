package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobApiLog;
import org.apache.ibatis.annotations.Mapper;
import org.springframework.stereotype.Repository;

/**
 * 外部 API 执行与安全审计日志持久层 Mapper
 *
 * @author ypc
 * @since 2026-10-28
 */
@Mapper
@Repository
public interface JobApiLogMapper extends BaseMapper<JobApiLog> {
}
