package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobDataCompareLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 任务数据量比对与对账日志 Mapper 接口
 *
 * @author ypc
 */
@Mapper
public interface JobDataCompareLogMapper extends BaseMapper<JobDataCompareLog> {

    /**
     * 批量插入对账日志
     *
     * @param logs 对账日志列表
     * @return 插入行数
     */
    int insertBatch(@Param("logs") List<JobDataCompareLog> logs);

    /**
     * 获取指定任务列表的最新一次对账记录
     *
     * @param jobIds 任务ID列表
     * @return 对账记录列表 (每个任务保留最新一条)
     */
    List<JobDataCompareLog> selectLatestByJobIds(@Param("jobIds") List<Integer> jobIds);

    /**
     * 根据批次号查询明细
     *
     * @param batchNo 批次流水号
     * @return 对账日志列表
     */
    List<JobDataCompareLog> selectByBatchNo(@Param("batchNo") String batchNo);
}
