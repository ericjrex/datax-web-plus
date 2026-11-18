package com.wugui.datax.admin.service;


import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datax.admin.dto.BatchAddWithMappingDto;
import com.wugui.datax.admin.dto.BatchInitSyncDto;
import com.wugui.datax.admin.dto.BatchRollbackDto;
import com.wugui.datax.admin.dto.BatchSetIncrementDto;
import com.wugui.datax.admin.dto.BatchUpdateWriterDto;
import com.wugui.datax.admin.dto.CheckTargetTableResultDto;
import com.wugui.datax.admin.dto.DataXBatchJsonBuildDto;
import com.wugui.datax.admin.dto.TaskScheduleDto;
import com.wugui.datax.admin.entity.JobInfo;

import java.io.IOException;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * core job action for datax-web
 *
 * @author xuxueli 2016-5-28 15:30:33
 */
public interface JobService {

    /**
     * page list
     *
     * @param start
     * @param length
     * @param jobGroup
     * @param jobDesc
     * @param glueType
     * @param userId
     * @return
     */
    Map<String, Object> pageList(int start, int length, int jobGroup, int triggerStatus, String jobDesc, String glueType, int userId,Integer[] projectIds);

    /**
     * page list (支持按 update_time 增量时间过滤)
     *
     * @param start
     * @param length
     * @param jobGroup
     * @param triggerStatus
     * @param jobDesc
     * @param glueType
     * @param userId
     * @param projectIds
     * @param updateTime 更新增量起始时间
     * @return
     */
    Map<String, Object> pageList(int start, int length, int jobGroup, int triggerStatus, String jobDesc, String glueType, int userId, Integer[] projectIds, Date updateTime);

    List<JobInfo> list();

    /**
     * add job
     *
     * @param jobInfo
     * @return
     */
    ReturnT<String> add(JobInfo jobInfo);

    /**
     * update job
     *
     * @param jobInfo
     * @return
     */
    ReturnT<String> update(JobInfo jobInfo);

    /**
     * remove job
     * *
     *
     * @param id
     * @return
     */
    ReturnT<String> remove(int id);

    /**
     * start job
     *
     * @param id
     * @return
     */
    ReturnT<String> start(int id);

    /**
     * stop job
     *
     * @param id
     * @return
     */
    ReturnT<String> stop(int id);

    /**
     * dashboard info
     *
     * @return
     */
    Map<String, Object> dashboardInfo();

    /**
     * chart info
     *
     * @return
     */
    ReturnT<Map<String, Object>> chartInfo();

    /**
     * batch add
     * @param dto
     * @return
     */
    ReturnT<String> batchAdd(DataXBatchJsonBuildDto dto) throws IOException;

    /**
     * 基于表与字段映射配置批量添加任务
     *
     * @param dto 批量构建请求DTO
     * @return 执行结果
     * @throws IOException IO异常
     */
    ReturnT<String> batchAddWithMapping(BatchAddWithMappingDto dto) throws IOException;

    /**
     * 批量开启任务调度
     *
     * @param ids 任务ID列表
     * @return 执行结果
     */
    ReturnT<String> batchStart(List<Integer> ids);

    /**
     * 批量停止任务调度
     *
     * @param ids 任务ID列表
     * @return 执行结果
     */
    ReturnT<String> batchStop(List<Integer> ids);

    /**
     * 批量触发任务立即执行一次
     *
     * @param ids 任务ID列表
     * @return 执行结果
     */
    ReturnT<String> batchTrigger(List<Integer> ids);

    /**
     * 批量删除任务及其关联日志
     *
     * @param ids 任务ID列表
     * @return 执行结果
     */
    ReturnT<String> batchRemove(List<Integer> ids);

    /**
     * 批量调整任务Writer连接信息
     *
     * @param dto 批量更新入参DTO
     * @return 执行结果
     */
    ReturnT<String> batchUpdateWriter(BatchUpdateWriterDto dto);

    /**
     * 检测所选任务的目标表在目标数据源中是否存在，并给出建表判定及DDL
     *
     * @param jobIds 任务ID列表
     * @param writerDatasourceId 目标端数据源ID
     * @return 目标表检测明细列表
     */
    ReturnT<List<CheckTargetTableResultDto>> checkTargetTables(List<Integer> jobIds, Long writerDatasourceId);

    /**
     * 检测所选任务的表在指定数据源中是否存在（支持源库 Reader 表与目标库 Writer 表检测）
     *
     * @param jobIds 任务ID列表
     * @param datasourceId 数据源ID
     * @param scope 作用端（READER 或 WRITER）
     * @return 库表检测明细列表
     */
    ReturnT<List<CheckTargetTableResultDto>> checkTargetTables(List<Integer> jobIds, Long datasourceId, String scope);

    /**
     * 复制任务（生成一条新任务，复用原配置与已加密的作业JSON，无需再加密）
     *
     * @param id 源任务ID
     * @return 复制成功后的新任务ID
     */
    ReturnT<String> copy(int id);

    /**
     * 批量将已有任务配置为方案1时间自增同步
     *
     * @param dto 批量设置入参DTO
     * @return 操作结果
     */
    ReturnT<String> batchSetIncrement(BatchSetIncrementDto dto);

    /**
     * 批量初始化目标表并全量同步
     *
     * @param dto 批量初始化入参DTO
     * @return 操作结果
     */
    ReturnT<String> batchInitAndSync(BatchInitSyncDto dto);

    /**
     * 批量回溯增量时间并触发同步
     * 用于解决业务数据延迟更新导致增量未覆盖的痛点
     *
     * @param dto 批量回溯入参DTO
     * @return 操作结果
     */
    ReturnT<String> rollbackIncrementAndSync(BatchRollbackDto dto);
}

