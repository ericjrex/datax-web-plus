package com.wugui.datax.admin.service;

import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datax.admin.dto.ApplySchemaEvolutionDto;
import com.wugui.datax.admin.dto.BatchSchemaDriftDto;
import com.wugui.datax.admin.dto.BatchSchemaDriftResultDto;
import com.wugui.datax.admin.dto.SchemaDriftItemDto;
import com.wugui.datax.admin.entity.JobSchemaDriftLog;

import java.util.List;

/**
 * 元数据漂移探测与模式自适应演进服务接口
 *
 * @author ypc
 */
public interface SchemaDriftService {

    /**
     * 单任务即时探测元数据漂移
     *
     * @param jobId 任务ID
     * @param username 操作人
     * @return 漂移检测明细
     */
    SchemaDriftItemDto detectSingleJob(Integer jobId, String username);

    /**
     * 批量并发检测元数据漂移
     *
     * @param dto 批量检测入参
     * @param username 操作人
     * @return 批量比对结果汇总
     */
    BatchSchemaDriftResultDto batchDetect(BatchSchemaDriftDto dto, String username);

    /**
     * 应用模式演进 (为目标端加列并更新任务 JSON)
     *
     * @param dto 演进请求入参
     * @param username 操作人
     * @return 执行结果
     */
    ReturnT<String> applyEvolution(ApplySchemaEvolutionDto dto, String username);

    /**
     * 一键版本回滚 (将任务 JSON 回退至指定日志记录前的快照)
     *
     * @param logId 日志记录ID
     * @param username 操作人
     * @return 回滚结果
     */
    ReturnT<String> rollbackEvolution(Long logId, String username);

    /**
     * 获取指定任务的历史漂移与演进日志
     *
     * @param jobId 任务ID
     * @return 日志列表
     */
    List<JobSchemaDriftLog> getHistoryByJobId(Integer jobId);

    /**
     * 获取指定任务列表的最新一次漂移记录
     *
     * @param jobIds 任务ID列表
     * @return 记录列表
     */
    List<JobSchemaDriftLog> getLatestByJobIds(List<Integer> jobIds);
}
