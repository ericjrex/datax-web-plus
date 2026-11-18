package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.dto.StatTaskColumnMappingDto;
import com.wugui.datax.admin.dto.StatTaskDto;
import com.wugui.datax.admin.dto.StatTaskResultDto;
import com.wugui.datax.admin.dto.StatTaskTestRunDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.entity.JobStatTask;

import java.util.List;
import java.util.Map;

/**
 * 数据加工与结果表输出任务核心业务接口
 * 支持单库/跨库多源关联 SQL 与 Python 复杂计算，定时加工输出至最终目标表
 *
 * @author ypc
 */
public interface StatTaskService extends IService<JobStatTask> {

    /**
     * 分页查询统计任务列表
     *
     * @param pageNo 当前页码
     * @param pageSize 每页条数
     * @param taskName 任务名称模糊搜索
     * @param taskType 任务类型
     * @param status 调度状态
     * @param datasourceId 数据源ID (源端或目标端)
     * @param tableName 目标表名模糊搜索
     * @return 分页任务列表
     */
    IPage<JobStatTask> getStatTaskPage(int pageNo, int pageSize, String taskName, String taskType, Integer status, Long datasourceId, String tableName);

    /**
     * 根据主键查询统计任务详细配置
     *
     * @param id 任务主键ID
     * @return 任务实体
     */
    JobStatTask getStatTaskById(Long id);

    /**
     * 保存或更新统计任务配置
     *
     * @param dto 任务请求数据传输对象
     * @param currentUsername 当前登录用户
     * @return 保存成功后的任务ID
     * @throws Exception 业务校验或底层调度同步异常
     */
    Long saveOrUpdateStatTask(StatTaskDto dto, String currentUsername) throws Exception;

    /**
     * 删除统计任务并级联注销调度作业
     *
     * @param id 任务ID
     * @return 是否删除成功
     */
    boolean deleteStatTask(Long id);

    /**
     * 在线试运行与数据调试 (支持 DryRun 仅预览数据不落库)
     *
     * @param testRunDto 试运行入参
     * @return 执行统计与结果数据对象
     * @throws Exception 执行异常
     */
    StatTaskResultDto testRunStatTask(StatTaskTestRunDto testRunDto) throws Exception;

    /**
     * 正式执行统计任务并将结果持久化写入目标表
     *
     * @param id 任务ID
     * @return 执行结果对象
     * @throws Exception 执行异常
     */
    StatTaskResultDto executeStatTask(Long id) throws Exception;

    /**
     * 正式执行统计任务并将结果持久化写入目标表 (支持指定触发来源)
     *
     * @param id 任务ID
     * @param triggerSource 触发方式 ("CRON" 或 "MANUAL")
     * @return 执行结果对象
     * @throws Exception 执行异常
     */
    default StatTaskResultDto executeStatTask(Long id, String triggerSource) throws Exception {
        return executeStatTask(id);
    }

    /**
     * 正式执行统计任务并将结果持久化写入目标表 (支持指定触发来源与调度流水ID)
     *
     * @param id 任务ID
     * @param triggerSource 触发方式 ("CRON" 或 "MANUAL")
     * @param logId 调度流水日志主键ID (用于物理流式日志落盘)
     * @return 执行结果对象
     * @throws Exception 执行异常
     */
    default StatTaskResultDto executeStatTask(Long id, String triggerSource, Long logId) throws Exception {
        return executeStatTask(id, triggerSource);
    }

    /**
     * 启动统计任务的定时调度
     *
     * @param id 任务ID
     * @return 是否启动成功
     * @throws Exception 调度异常
     */
    boolean startSchedule(Long id) throws Exception;

    /**
     * 暂停统计任务的定时调度
     *
     * @param id 任务ID
     * @return 是否暂停成功
     * @throws Exception 调度异常
     */
    boolean stopSchedule(Long id) throws Exception;

    /**
     * 推导计算结果集的列元数据信息
     *
     * @param sourceDsId 源端数据源ID
     * @param sql 统计 SQL
     * @param pythonScript Python 脚本
     * @param pythonParams Python 脚本参数
     * @return 字段元数据列表
     * @throws Exception 推导异常
     */
    List<TableColumnDto> inferSourceColumns(Long sourceDsId, String sql, String pythonScript, String pythonParams) throws Exception;

    /**
     * 在目标数据库中一键自动创建目标表
     *
     * @param targetDsId 目标数据源ID
     * @param targetTableName 目标数据表名
     * @param columnMappings 字段映射列表
     * @return 是否建表成功
     * @throws Exception 建表异常
     */
    boolean autoCreateTargetTable(Long targetDsId, String targetTableName, List<StatTaskColumnMappingDto> columnMappings) throws Exception;

    /**
     * 批量启动统计任务的定时调度
     *
     * @param ids 任务ID集合
     * @return 执行统计汇总信息 (含 total, successCount, failCount, details)
     */
    Map<String, Object> batchStartSchedule(List<Long> ids);

    /**
     * 批量停止统计任务的定时调度
     *
     * @param ids 任务ID集合
     * @return 执行统计汇总信息 (含 total, successCount, failCount, details)
     */
    Map<String, Object> batchStopSchedule(List<Long> ids);

    /**
     * 批量正式执行统计任务并将结果落库
     *
     * @param ids 任务ID集合
     * @return 执行统计汇总信息 (含 total, successCount, failCount, details)
     */
    Map<String, Object> batchExecuteStatTasks(List<Long> ids);

    /**
     * 批量删除统计任务并级联注销关联调度作业
     *
     * @param ids 任务ID集合
     * @return 执行统计汇总信息 (含 total, successCount, failCount, details)
     */
    Map<String, Object> batchDeleteStatTasks(List<Long> ids);

    /**
     * 手动触发正式执行统计任务并将流水日志留痕至 job_log
     *
     * @param id 任务ID
     * @return 执行结果对象
     * @throws Exception 执行异常
     */
    StatTaskResultDto triggerStatTaskWithLog(Long id) throws Exception;

    /**
     * 分页查询统计计算任务的历史执行流水日志
     *
     * @param taskId 统计任务ID
     * @param current 当前页码
     * @param size 每页条数
     * @param logStatus 状态筛选 (1:成功, 2:失败, 3:进行中, 其他:全部)
     * @return 分页结果封装
     */
    default Map<String, Object> getStatTaskLogPage(Long taskId, int current, int size, Integer logStatus) {
        return getStatTaskLogPage(taskId, current, size, logStatus, null);
    }

    /**
     * 分页查询统计计算任务的历史执行流水日志 (支持触发方式与状态多重筛选)
     *
     * @param taskId 统计任务ID
     * @param current 当前页码
     * @param size 每页条数
     * @param logStatus 状态筛选 (1:成功, 2:失败, 3:进行中, 其他:全部)
     * @param triggerType 触发方式筛选 (MANUAL:手动, CRON:定时, 其他:全部)
     * @return 分页结果封装
     */
    Map<String, Object> getStatTaskLogPage(Long taskId, int current, int size, Integer logStatus, String triggerType);

    /**
     * 批量正式执行统计任务并将流水日志留痕至 job_log
     *
     * @param ids 任务ID集合
     * @return 执行统计汇总信息
     */
    Map<String, Object> batchExecuteStatTasksWithLog(List<Long> ids);
}
