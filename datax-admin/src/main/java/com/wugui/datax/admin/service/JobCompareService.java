package com.wugui.datax.admin.service;

import com.wugui.datax.admin.dto.BatchCompareDto;
import com.wugui.datax.admin.dto.BatchCompareResultDto;
import com.wugui.datax.admin.dto.JobCompareItemDto;

import java.util.List;

/**
 * 任务数据量比对与对账服务接口
 *
 * @author ypc
 */
public interface JobCompareService {

    /**
     * 批量比对任务源库与目标库数据量并落盘持久化
     *
     * @param dto 批量比对请求参数
     * @param username 操作人账号
     * @return 批次比对汇总结果
     */
    BatchCompareResultDto batchCompare(BatchCompareDto dto, String username);

    /**
     * 获取指定任务列表的最近一次对账记录 (优先读库，不穿透物理数据库)
     *
     * @param jobIds 任务ID列表
     * @return 对账结果汇总
     */
    BatchCompareResultDto getLatestCompare(List<Integer> jobIds);

    /**
     * 根据批次流水号获取历史对账记录
     *
     * @param batchNo 批次流水号
     * @return 对账结果汇总
     */
    BatchCompareResultDto getHistoryByBatchNo(String batchNo);

    /**
     * 单个任务即时比对并更新落盘
     *
     * @param jobId 任务ID
     * @param username 操作人账号
     * @return 单任务对账结果
     */
    JobCompareItemDto compareSingleJob(Integer jobId, String username);
}
