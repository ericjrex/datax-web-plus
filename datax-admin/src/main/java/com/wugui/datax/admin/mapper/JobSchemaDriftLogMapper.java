package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobSchemaDriftLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * DataX任务元数据漂移与模式演进审计日志 Mapper 接口
 *
 * @author ypc
 */
@Mapper
public interface JobSchemaDriftLogMapper extends BaseMapper<JobSchemaDriftLog> {

    /**
     * 批量插入漂移日志
     *
     * @param logs 漂移日志列表
     * @return 插入行数
     */
    int insertBatch(@Param("logs") List<JobSchemaDriftLog> logs);

    /**
     * 获取指定任务列表的最新一次漂移记录
     *
     * @param jobIds 任务ID列表
     * @return 漂移记录列表
     */
    List<JobSchemaDriftLog> selectLatestByJobIds(@Param("jobIds") List<Integer> jobIds);

    /**
     * 根据批次号查询明细
     *
     * @param batchNo 批次流水号
     * @return 漂移日志列表
     */
    List<JobSchemaDriftLog> selectByBatchNo(@Param("batchNo") String batchNo);

    /**
     * 根据任务ID查询历史审计日志
     *
     * @param jobId 任务ID
     * @return 审计日志列表(按时间倒序)
     */
    List<JobSchemaDriftLog> selectHistoryByJobId(@Param("jobId") Integer jobId);
}
