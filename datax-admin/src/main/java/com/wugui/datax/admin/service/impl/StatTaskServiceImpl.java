package com.wugui.datax.admin.service.impl;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjectUtil;
import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datatx.core.glue.GlueTypeEnum;
import com.wugui.datax.admin.core.cron.CronExpression;
import com.wugui.datax.admin.core.thread.JobScheduleHelper;
import com.wugui.datax.admin.dto.*;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.entity.JobInfo;
import com.wugui.datax.admin.entity.JobLog;
import com.wugui.datax.admin.entity.JobStatTask;
import com.wugui.datax.admin.mapper.JobInfoMapper;
import com.wugui.datax.admin.mapper.JobLogMapper;
import com.wugui.datax.admin.mapper.JobStatTaskMapper;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.service.JobService;
import com.wugui.datax.admin.service.StatTaskService;
import com.wugui.datax.admin.tool.stat.CrossDbStatEngine;
import com.wugui.datax.admin.tool.stat.PythonStatEngine;
import com.wugui.datax.admin.tool.stat.SqlStatEngine;
import com.wugui.datax.admin.tool.stat.StatDatasourceHelper;
import com.wugui.datax.admin.tool.stat.StatTaskExecutionManager;
import com.wugui.datax.admin.tool.stat.TargetDataWriterEngine;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Connection;
import java.util.*;

/**
 * 统计计算任务核心业务实现类
 *
 * @author ypc
 */
@Service
public class StatTaskServiceImpl extends ServiceImpl<JobStatTaskMapper, JobStatTask> implements StatTaskService {

    private static final Logger logger = LoggerFactory.getLogger(StatTaskServiceImpl.class);

    public static final String STAT_TASK_HANDLER = "statTaskJobHandler";

    @Autowired
    private JobStatTaskMapper jobStatTaskMapper;

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Autowired
    private JobInfoMapper jobInfoMapper;

    @Autowired
    private JobLogMapper jobLogMapper;

    @Autowired
    private JobService jobService;

    @Value("${stat-task.python.path:python}")
    private String defaultPythonPath;

    @Override
    public IPage<JobStatTask> getStatTaskPage(int pageNo, int pageSize, String taskName, String taskType, Integer status, Long datasourceId, String tableName) {
        Page<JobStatTask> page = new Page<>(pageNo, pageSize);
        IPage<JobStatTask> taskPage = jobStatTaskMapper.selectStatTaskPage(page, taskName, taskType, status, datasourceId, tableName);
        setLinkData(taskPage.getRecords());
        return taskPage;
    }

    @Override
    public JobStatTask getStatTaskById(Long id) {
        JobStatTask task = validateExists(id);
        fillSingleLinkData(task);
        return task;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long saveOrUpdateStatTask(StatTaskDto dto, String currentUsername) throws Exception {
        validateData(dto);

        JobStatTask entity;
        boolean isCreate = (dto.getId() == null);
        if (isCreate) {
            entity = new JobStatTask();
            initData(entity, currentUsername);
        } else {
            entity = validateExists(dto.getId());
            entity.setUpdateBy(StringUtils.isNotBlank(currentUsername) ? currentUsername : "admin");
            entity.setUpdateTime(new Date());
        }

        copyPropertiesFromDto(dto, entity);

        // 先入库获取/更新主键ID
        if (isCreate) {
            jobStatTaskMapper.insert(entity);
        }

        // 同步维护底层 xxl-job (job_info) 调度配置
        syncWithJobInfo(entity);

        // 更新 job_stat_task 中绑定的 job_id
        jobStatTaskMapper.updateById(entity);

        return entity.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteStatTask(Long id) {
        JobStatTask task = validateExists(id);
        if (task.getJobId() != null && task.getJobId() > 0) {
            try {
                jobService.remove(task.getJobId());
            } catch (Exception e) {
                logger.warn("注销底层 xxl-job 失败: {}", e.getMessage());
            }
        }
        return jobStatTaskMapper.deleteById(id) > 0;
    }

    @Override
    public StatTaskResultDto testRunStatTask(StatTaskTestRunDto testRunDto) throws Exception {
        Assert.notNull(testRunDto, "试运行入参不能为空");
        Assert.notBlank(testRunDto.getTaskType(), "任务类型不能为空");

        StatTaskResultDto result;
        Integer limit = (testRunDto.getLimit() != null && testRunDto.getLimit() > 0) ? testRunDto.getLimit() : 50;

        if ("SQL".equalsIgnoreCase(testRunDto.getTaskType())) {
            boolean isCross = (testRunDto.getIsCrossDb() != null && testRunDto.getIsCrossDb() == 1)
                    || (testRunDto.getCrossDbConfig() != null && testRunDto.getCrossDbConfig().getSources() != null && !testRunDto.getCrossDbConfig().getSources().isEmpty());
            if (isCross) {
                JobDatasource defaultDs = (testRunDto.getSourceDatasourceId() != null && testRunDto.getSourceDatasourceId() > 0)
                        ? getDatasource(testRunDto.getSourceDatasourceId()) : null;
                result = CrossDbStatEngine.executeCrossDbTask(testRunDto.getCrossDbConfig(), defaultDs, testRunDto.getSourceSql(), jobDatasourceService, limit, null);
            } else if (CrossDbStatEngine.containsCrossDbAnnotation(testRunDto.getSourceSql())) {
                Assert.notNull(testRunDto.getSourceDatasourceId(), "SQL 模式下源数据源ID不能为空");
                JobDatasource sourceDs = getDatasource(testRunDto.getSourceDatasourceId());
                result = CrossDbStatEngine.executeFederatedSql(sourceDs, testRunDto.getSourceSql(), jobDatasourceService, limit, null);
            } else {
                Assert.notNull(testRunDto.getSourceDatasourceId(), "SQL 模式下源数据源ID不能为空");
                Assert.notBlank(testRunDto.getSourceSql(), "SQL 模式下统计SQL不能为空");
                JobDatasource sourceDs = getDatasource(testRunDto.getSourceDatasourceId());
                result = SqlStatEngine.executeStatQuery(sourceDs, testRunDto.getSourceSql(), limit, null);
            }
        } else if ("PYTHON".equalsIgnoreCase(testRunDto.getTaskType())) {
            Assert.notBlank(testRunDto.getPythonScript(), "Python 脚本不能为空");
            JobDatasource sourceDs = testRunDto.getSourceDatasourceId() != null
                    ? getDatasource(testRunDto.getSourceDatasourceId()) : null;
            result = PythonStatEngine.executePythonScript(
                    defaultPythonPath,
                    testRunDto.getPythonScript(),
                    testRunDto.getPythonParams(),
                    60,
                    limit,
                    sourceDs
            );
        } else {
            throw new IllegalArgumentException("不支持的统计任务类型: " + testRunDto.getTaskType());
        }

        // 如果用户选择了非 DryRun 并且指定了目标表，则测试写入目标库 (NONE 模式跳过)
        if (Boolean.FALSE.equals(testRunDto.getDryRun())
                && testRunDto.getTargetDatasourceId() != null
                && StringUtils.isNotBlank(testRunDto.getTargetTableName())
                && !"NONE".equalsIgnoreCase(testRunDto.getWriteMode())
                && !"SKIP".equalsIgnoreCase(testRunDto.getWriteMode())) {
            JobDatasource targetDs = getDatasource(testRunDto.getTargetDatasourceId());
            long written = TargetDataWriterEngine.writeDataToTarget(
                    targetDs,
                    testRunDto.getTargetTableName(),
                    StringUtils.isNotBlank(testRunDto.getWriteMode()) ? testRunDto.getWriteMode() : "APPEND",
                    testRunDto.getColumnMappings(),
                    result.getColumnDetails(),
                    false,
                    result.getRows(),
                    1000
            );
            result.setWrittenRows(written);
            result.setMessage(result.getMessage() + "，并已成功试写入目标表 " + written + " 行");
        }

        return result;
    }

    @Override
    public StatTaskResultDto executeStatTask(Long id) throws Exception {
        return executeStatTask(id, "CRON", null);
    }

    @Override
    public StatTaskResultDto executeStatTask(Long id, String triggerSource) throws Exception {
        return executeStatTask(id, triggerSource, null);
    }

    @Override
    public StatTaskResultDto executeStatTask(Long id, String triggerSource, Long logId) throws Exception {
        JobStatTask task = validateExists(id);
        return StatTaskExecutionManager.executeWithStrategy(task, triggerSource, logId, () -> doExecuteStatTask(task));
    }

    /**
     * 实际执行统计计算与入库的核心逻辑
     */
    private StatTaskResultDto doExecuteStatTask(JobStatTask task) throws Exception {
        long startTime = System.currentTimeMillis();

        StatTaskResultDto executeResult;
        try {
            // 1. 根据任务类型调用相应计算引擎执行全量数据抽取与计算
            if ("SQL".equalsIgnoreCase(task.getTaskType())) {
                boolean isCross = (task.getIsCrossDb() != null && task.getIsCrossDb() == 1 && StringUtils.isNotBlank(task.getCrossDbConfigJson()));
                if (isCross) {
                    CrossDbConfigDto config = parseCrossDbConfig(task.getCrossDbConfigJson());
                    JobDatasource defaultDs = (task.getSourceDatasourceId() != null && task.getSourceDatasourceId() > 0)
                            ? getDatasource(task.getSourceDatasourceId()) : null;
                    executeResult = CrossDbStatEngine.executeCrossDbTask(config, defaultDs, task.getSourceSql(), jobDatasourceService, null, null);
                } else if (CrossDbStatEngine.containsCrossDbAnnotation(task.getSourceSql())) {
                    JobDatasource sourceDs = getDatasource(task.getSourceDatasourceId());
                    executeResult = CrossDbStatEngine.executeFederatedSql(sourceDs, task.getSourceSql(), jobDatasourceService, null, null);
                } else {
                    JobDatasource sourceDs = getDatasource(task.getSourceDatasourceId());
                    executeResult = SqlStatEngine.executeStatQuery(sourceDs, task.getSourceSql(), null, null);
                }
            } else if ("PYTHON".equalsIgnoreCase(task.getTaskType())) {
                int timeout = (task.getTimeoutSeconds() != null && task.getTimeoutSeconds() > 0) ? task.getTimeoutSeconds() : 3600;
                JobDatasource sourceDs = task.getSourceDatasourceId() != null
                        ? getDatasource(task.getSourceDatasourceId()) : null;
                executeResult = PythonStatEngine.executePythonScript(
                        defaultPythonPath,
                        task.getPythonScript(),
                        task.getPythonParams(),
                        timeout,
                        null,
                        sourceDs
                );
            } else {
                throw new IllegalArgumentException("未知的任务计算类型: " + task.getTaskType());
            }

            // 2. 将计算结果集持久化写入目标库表 (NONE/SKIP 策略跳过)
            long writtenRows = 0L;
            if (!"NONE".equalsIgnoreCase(task.getWriteMode()) && !"SKIP".equalsIgnoreCase(task.getWriteMode())) {
                JobDatasource targetDs = getDatasource(task.getTargetDatasourceId());
                List<StatTaskColumnMappingDto> mappings = parseColumnMappings(task.getColumnMappingJson());
                boolean autoCreate = (task.getAutoCreateTable() != null && task.getAutoCreateTable() == 1);
                int batchSize = (task.getBatchSize() != null && task.getBatchSize() > 0) ? task.getBatchSize() : 1000;

                writtenRows = TargetDataWriterEngine.writeDataToTarget(
                        targetDs,
                        task.getTargetTableName(),
                        task.getWriteMode(),
                        mappings,
                        executeResult.getColumnDetails(),
                        autoCreate,
                        executeResult.getRows(),
                        batchSize
                );
            } else {
                logger.info("任务 [{}] 写入策略为 {} (脚本内自行更新)，跳过平台目标端写入", task.getTaskName(), task.getWriteMode());
            }

            long totalCost = System.currentTimeMillis() - startTime;
            executeResult.setWrittenRows(writtenRows);
            executeResult.setCostMs(totalCost);

            // 3. 更新任务最近执行状态快照
            task.setLastRunTime(new Date());
            task.setLastRunStatus(1);
            int readCount = (executeResult.getRows() != null) ? executeResult.getRows().size() : 0;
            String statSummary = ("NONE".equalsIgnoreCase(task.getWriteMode()) || "SKIP".equalsIgnoreCase(task.getWriteMode()))
                    && StringUtils.isNotBlank(executeResult.getMessage())
                    ? executeResult.getMessage()
                    : "读取 " + readCount + " 条，写入目标表 [" + task.getTargetTableName() + "] " + writtenRows + " 条";
            task.setLastRunMsg("【定时调度】" + statSummary + "，耗时 " + totalCost + "ms");
            jobStatTaskMapper.updateById(task);

            return executeResult;

        } catch (Exception ex) {
            logger.error("统计任务 [{}] 执行失败: {}", task.getTaskName(), ex.getMessage(), ex);
            task.setLastRunTime(new Date());
            task.setLastRunStatus(2);
            task.setLastRunMsg("【定时调度】执行异常: " + ex.getMessage());
            jobStatTaskMapper.updateById(task);
            throw ex;
        }
    }

    @Override
    public boolean startSchedule(Long id) throws Exception {
        JobStatTask task = validateExists(id);
        if (StringUtils.isBlank(task.getCronExpression())) {
            throw new IllegalArgumentException("该任务未配置 Cron 表达式，无法启动定时调度！");
        }

        if (task.getJobId() == null || task.getJobId() <= 0) {
            syncWithJobInfo(task);
            jobStatTaskMapper.updateById(task);
        }

        jobService.start(task.getJobId());
        task.setStatus(1);
        return jobStatTaskMapper.updateById(task) > 0;
    }

    @Override
    public boolean stopSchedule(Long id) throws Exception {
        JobStatTask task = validateExists(id);
        if (task.getJobId() != null && task.getJobId() > 0) {
            jobService.stop(task.getJobId());
        }
        task.setStatus(0);
        return jobStatTaskMapper.updateById(task) > 0;
    }

    @Override
    public List<TableColumnDto> inferSourceColumns(Long sourceDsId, String sql, String pythonScript, String pythonParams) throws Exception {
        if (StringUtils.isNotBlank(sql)) {
            if (CrossDbStatEngine.containsCrossDbAnnotation(sql)) {
                Assert.notNull(sourceDsId, "推导 SQL 字段时，源数据源ID不能为空");
                JobDatasource sourceDs = getDatasource(sourceDsId);
                StatTaskResultDto result = CrossDbStatEngine.executeFederatedSql(sourceDs, sql, jobDatasourceService, 1, null);
                return result.getColumnDetails();
            }
            Assert.notNull(sourceDsId, "推导 SQL 字段时，源数据源ID不能为空");
            JobDatasource sourceDs = getDatasource(sourceDsId);
            StatTaskResultDto result = SqlStatEngine.executeStatQuery(sourceDs, sql, 1, null);
            return result.getColumnDetails();
        } else if (StringUtils.isNotBlank(pythonScript)) {
            JobDatasource sourceDs = sourceDsId != null ? getDatasource(sourceDsId) : null;
            StatTaskResultDto result = PythonStatEngine.executePythonScript(
                    defaultPythonPath,
                    pythonScript,
                    pythonParams,
                    30,
                    1,
                    sourceDs
            );
            return result.getColumnDetails();
        }
        throw new IllegalArgumentException("请提供 SQL 语句或 Python 脚本以供推导字段！");
    }

    @Override
    public boolean autoCreateTargetTable(Long targetDsId, String targetTableName, List<StatTaskColumnMappingDto> columnMappings) throws Exception {
        Assert.notNull(targetDsId, "目标数据源ID不能为空");
        Assert.notBlank(targetTableName, "目标表名不能为空");
        Assert.notEmpty(columnMappings, "字段映射列表不能为空");

        JobDatasource targetDs = getDatasource(targetDsId);
        String dbType = (targetDs.getDatasource() != null) ? targetDs.getDatasource().toUpperCase() : "MYSQL";

        try (Connection conn = StatDatasourceHelper.getConnection(targetDs)) {
            TargetDataWriterEngine.createTargetTable(conn, dbType, targetTableName, columnMappings, null);
            return true;
        }
    }

    @Override
    public Map<String, Object> batchStartSchedule(List<Long> ids) {
        return executeBatchTaskOperation("批量启动调度", ids, (id, detail) -> {
            try {
                boolean ok = startSchedule(id);
                if (ok) {
                    detail.put("status", "SUCCESS");
                    detail.put("msg", "调度启动成功");
                } else {
                    detail.put("status", "FAIL");
                    detail.put("msg", "调度启动返回失败");
                }
            } catch (Exception e) {
                detail.put("status", "FAIL");
                detail.put("msg", e.getMessage());
            }
        });
    }

    @Override
    public Map<String, Object> batchStopSchedule(List<Long> ids) {
        return executeBatchTaskOperation("批量停止调度", ids, (id, detail) -> {
            try {
                boolean ok = stopSchedule(id);
                if (ok) {
                    detail.put("status", "SUCCESS");
                    detail.put("msg", "调度停止成功");
                } else {
                    detail.put("status", "FAIL");
                    detail.put("msg", "调度停止返回失败");
                }
            } catch (Exception e) {
                detail.put("status", "FAIL");
                detail.put("msg", e.getMessage());
            }
        });
    }

    @Override
    public Map<String, Object> batchExecuteStatTasks(List<Long> ids) {
        return executeBatchTaskOperation("批量触发执行", ids, (id, detail) -> {
            try {
                StatTaskResultDto res = executeStatTask(id);
                detail.put("status", "SUCCESS");
                detail.put("msg", res != null && StringUtils.isNotBlank(res.getMessage()) ? res.getMessage() : "执行成功");
                if (res != null) {
                    detail.put("writtenRows", res.getWrittenRows());
                    detail.put("costMs", res.getCostMs());
                }
            } catch (Exception e) {
                detail.put("status", "FAIL");
                detail.put("msg", e.getMessage());
            }
        });
    }

    @Override
    public Map<String, Object> batchDeleteStatTasks(List<Long> ids) {
        return executeBatchTaskOperation("批量删除任务", ids, (id, detail) -> {
            try {
                boolean ok = deleteStatTask(id);
                if (ok) {
                    detail.put("status", "SUCCESS");
                    detail.put("msg", "删除成功并注销关联调度作业");
                } else {
                    detail.put("status", "FAIL");
                    detail.put("msg", "删除失败，数据可能已不存在");
                }
            } catch (Exception e) {
                detail.put("status", "FAIL");
                detail.put("msg", e.getMessage());
            }
        });
    }

    @FunctionalInterface
    private interface BatchTaskConsumer {
        void accept(Long id, Map<String, Object> detail);
    }

    /**
     * 通用批量操作处理器公共模板方法，统一处理判空、截断保护与结果归集
     *
     * @param opName 操作名称
     * @param ids 任务ID列表
     * @param consumer 单项操作回调函数
     * @return 统计结果Map
     */
    private Map<String, Object> executeBatchTaskOperation(String opName, List<Long> ids, BatchTaskConsumer consumer) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (ids == null || ids.isEmpty()) {
            result.put("total", 0);
            result.put("successCount", 0);
            result.put("failCount", 0);
            result.put("details", Collections.emptyList());
            return result;
        }

        // 安全防御：单批次最大限制处理100条，防止超长列表拒绝服务攻击
        List<Long> targetIds = ids.size() > 100 ? ids.subList(0, 100) : ids;
        int successCount = 0;
        int failCount = 0;
        List<Map<String, Object>> details = new ArrayList<>(targetIds.size());

        for (Long id : targetIds) {
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("taskId", id);
            try {
                JobStatTask task = jobStatTaskMapper.selectById(id);
                if (task != null) {
                    detail.put("taskName", task.getTaskName());
                }
            } catch (Exception ignored) {
            }

            try {
                consumer.accept(id, detail);
                if ("SUCCESS".equals(detail.get("status"))) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (Exception ex) {
                failCount++;
                detail.put("status", "FAIL");
                detail.put("msg", ex.getMessage());
                logger.error("{}执行异常 [ID: {}]: {}", opName, id, ex.getMessage(), ex);
            }
            details.add(detail);
        }

        result.put("total", targetIds.size());
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("details", details);
        return result;
    }

    // ==================== 私有辅助方法 (遵循 single responsibility 与 common methods 规范) ====================

    /**
     * 校验任务存在性
     */
    private JobStatTask validateExists(Long id) {
        Assert.notNull(id, "任务ID不能为空");
        JobStatTask task = jobStatTaskMapper.selectById(id);
        if (ObjectUtil.isNull(task)) {
            throw new IllegalArgumentException("未找到ID为 " + id + " 的统计任务");
        }
        return task;
    }

    /**
     * 业务参数合法性快速失败断言校验
     */
    private void validateData(StatTaskDto dto) {
        Assert.notNull(dto, "任务配置参数不能为空");
        Assert.notBlank(dto.getTaskName(), "任务名称不能为空");
        Assert.notBlank(dto.getTaskType(), "任务类型不能为空");
        Assert.notNull(dto.getTargetDatasourceId(), "目标端数据源ID不能为空");
        Assert.notBlank(dto.getTargetTableName(), "目标端数据表名不能为空");

        if ("SQL".equalsIgnoreCase(dto.getTaskType())) {
            boolean isCross = (dto.getIsCrossDb() != null && dto.getIsCrossDb() == 1);
            if (isCross) {
                CrossDbConfigDto config = dto.getCrossDbConfig();
                if (config == null && StringUtils.isNotBlank(dto.getCrossDbConfigJson())) {
                    config = parseCrossDbConfig(dto.getCrossDbConfigJson());
                }
                Assert.notNull(config, "跨库多源模式下配置对象不能为空");
                if ("FEDERATED_SQL".equalsIgnoreCase(config.getMergeMode())) {
                    Assert.notBlank(config.getMainSql(), "联邦 SQL 模式下主 SQL 不能为空");
                    Assert.notNull(dto.getSourceDatasourceId(), "联邦 SQL 模式下必须选择主源端数据源");
                } else {
                    Assert.notEmpty(config.getSources(), "跨库多源模式下必须配置至少一个数据源节点");
                    for (CrossDbSourceItemDto item : config.getSources()) {
                        Assert.notNull(item.getDatasourceId(), "跨库数据源节点的数据源ID不能为空");
                        Assert.notBlank(item.getSql(), "跨库数据源节点的统计 SQL 不能为空");
                    }
                }
            } else {
                Assert.notNull(dto.getSourceDatasourceId(), "SQL 统计模式下必须选择源端数据源");
                Assert.notBlank(dto.getSourceSql(), "SQL 统计模式下统计SQL不能为空");
            }
        } else if ("PYTHON".equalsIgnoreCase(dto.getTaskType())) {
            Assert.notBlank(dto.getPythonScript(), "Python 统计模式下脚本代码不能为空");
        } else {
            throw new IllegalArgumentException("不支持的任务计算类型: " + dto.getTaskType());
        }
    }

    /**
     * 参数初始化
     */
    private void initData(JobStatTask entity, String currentUsername) {
        Date now = new Date();
        entity.setStatus(0);
        entity.setLastRunStatus(0);
        entity.setExecutorBlockStrategy("DISCARD_LATER");
        entity.setBatchSize(1000);
        entity.setTimeoutSeconds(3600);
        entity.setAutoCreateTable(0);
        entity.setWriteMode("APPEND");
        entity.setCreateBy(StringUtils.isNotBlank(currentUsername) ? currentUsername : "admin");
        entity.setCreateTime(now);
        entity.setUpdateBy(entity.getCreateBy());
        entity.setUpdateTime(now);
    }

    /**
     * DTO 属性向实体拷贝
     */
    private void copyPropertiesFromDto(StatTaskDto dto, JobStatTask entity) {
        BeanUtils.copyProperties(dto, entity, "id", "createBy", "createTime", "updateBy", "updateTime", "jobId", "status");
        if (dto.getStatus() != null) {
            entity.setStatus(dto.getStatus());
        }
        if (dto.getIsCrossDb() != null) {
            entity.setIsCrossDb(dto.getIsCrossDb());
        }
        if (dto.getCrossDbConfig() != null) {
            entity.setCrossDbConfigJson(JSON.toJSONString(dto.getCrossDbConfig()));
        } else if (StringUtils.isNotBlank(dto.getCrossDbConfigJson())) {
            entity.setCrossDbConfigJson(dto.getCrossDbConfigJson());
        }
        if (dto.getColumnMappings() != null) {
            entity.setColumnMappingJson(JSON.toJSONString(dto.getColumnMappings()));
        }
        if (StringUtils.isBlank(entity.getWriteMode())) {
            entity.setWriteMode("APPEND");
        }
        if (StringUtils.isNotBlank(dto.getExecutorBlockStrategy())) {
            entity.setExecutorBlockStrategy(dto.getExecutorBlockStrategy().trim());
        } else if (StringUtils.isBlank(entity.getExecutorBlockStrategy())) {
            entity.setExecutorBlockStrategy("DISCARD_LATER");
        }
    }

    /**
     * 联查填充数据源名称 (遵循 setLinkData 规范)
     */
    private void setLinkData(List<JobStatTask> list) {
        if (list == null || list.isEmpty()) {
            return;
        }

        // 批量预解析缺失的数据源名称，单次查询搞定，彻底消除 N+1 数据库往返
        Set<Long> missingDsIds = new HashSet<>();
        for (JobStatTask task : list) {
            if (task == null) {
                continue;
            }
            if ((task.getIsCrossDb() == null || task.getIsCrossDb() == 0)
                    && StringUtils.isBlank(task.getSourceDatasourceName())
                    && task.getSourceDatasourceId() != null) {
                missingDsIds.add(task.getSourceDatasourceId());
            }
            if (StringUtils.isBlank(task.getTargetDatasourceName()) && task.getTargetDatasourceId() != null) {
                missingDsIds.add(task.getTargetDatasourceId());
            }
        }

        Map<Long, String> dsNameMap = new HashMap<>();
        if (!missingDsIds.isEmpty()) {
            try {
                Collection<JobDatasource> dsList = jobDatasourceService.listByIds(missingDsIds);
                if (dsList != null) {
                    for (JobDatasource ds : dsList) {
                        if (ds != null && ds.getId() != null) {
                            dsNameMap.put(ds.getId(), ds.getDatasourceName());
                        }
                    }
                }
            } catch (Exception e) {
                logger.warn("批量补充数据源名称异常: {}", e.getMessage());
            }
        }

        for (JobStatTask task : list) {
            if (task == null) {
                continue;
            }
            if (task.getIsCrossDb() != null && task.getIsCrossDb() == 1) {
                int srcCount = 0;
                if (StringUtils.isNotBlank(task.getCrossDbConfigJson())) {
                    CrossDbConfigDto cfg = parseCrossDbConfig(task.getCrossDbConfigJson());
                    if (cfg != null && cfg.getSources() != null) {
                        srcCount = cfg.getSources().size();
                    }
                }
                task.setSourceDatasourceName("🌐 跨库多源 (" + (srcCount > 0 ? srcCount : "多") + "源)");
            } else if (StringUtils.isBlank(task.getSourceDatasourceName()) && task.getSourceDatasourceId() != null) {
                task.setSourceDatasourceName(dsNameMap.getOrDefault(task.getSourceDatasourceId(), "未知或已删除数据源"));
            }

            if (StringUtils.isBlank(task.getTargetDatasourceName()) && task.getTargetDatasourceId() != null) {
                task.setTargetDatasourceName(dsNameMap.getOrDefault(task.getTargetDatasourceId(), "未知或已删除数据源"));
            }

            // 填充运行时状态标记 (纯内存操作)
            task.setIsRunning(StatTaskExecutionManager.isRunning(task.getId()));

            // 解析并填充最近一次执行的触发类型 (纯内存推断，杜绝循环查询未建索引的庞大 job_log 表)
            resolveLastTriggerType(task);
        }
    }

    /**
     * 填充单个实体的关联属性
     */
    private void fillSingleLinkData(JobStatTask task) {
        if (task == null) return;
        if (task.getIsCrossDb() != null && task.getIsCrossDb() == 1) {
            int srcCount = 0;
            if (StringUtils.isNotBlank(task.getCrossDbConfigJson())) {
                CrossDbConfigDto cfg = parseCrossDbConfig(task.getCrossDbConfigJson());
                if (cfg != null && cfg.getSources() != null) {
                    srcCount = cfg.getSources().size();
                }
            }
            task.setSourceDatasourceName("🌐 跨库多源 (" + (srcCount > 0 ? srcCount : "多") + "源)");
        } else if (StringUtils.isBlank(task.getSourceDatasourceName()) && task.getSourceDatasourceId() != null) {
            JobDatasource sds = jobDatasourceService.getById(task.getSourceDatasourceId());
            if (sds != null) {
                task.setSourceDatasourceName(sds.getDatasourceName());
            }
        }
        if (StringUtils.isBlank(task.getTargetDatasourceName()) && task.getTargetDatasourceId() != null) {
            JobDatasource tds = jobDatasourceService.getById(task.getTargetDatasourceId());
            if (tds != null) {
                task.setTargetDatasourceName(tds.getDatasourceName());
            }
        }

        // 填充运行时状态标记 (纯内存操作)
        task.setIsRunning(StatTaskExecutionManager.isRunning(task.getId()));

        // 解析并填充最近一次执行的触发类型 (纯内存推断)
        resolveLastTriggerType(task);
    }

    /**
     * 解析并快速填充最近一次执行的触发方式 (纯内存推断，杜绝在分页列表中进行 N+1 跨表全表扫描)
     */
    private void resolveLastTriggerType(JobStatTask task) {
        if (task == null || task.getLastRunTime() == null) {
            return;
        }
        if (task.getLastTriggerType() != null) {
            return;
        }
        String msg = task.getLastRunMsg();
        if (msg != null && (msg.contains("【手动") || msg.contains("MANUAL"))) {
            task.setLastTriggerType("MANUAL");
        } else {
            task.setLastTriggerType("CRON");
        }
    }

    /**
     * 解析跨库多源配置 JSON 字符串
     */
    private CrossDbConfigDto parseCrossDbConfig(String json) {
        if (StringUtils.isBlank(json)) {
            return null;
        }
        try {
            return JSON.parseObject(json, CrossDbConfigDto.class);
        } catch (Exception e) {
            logger.warn("解析跨库配置 JSON 失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 获取数据源实体并断言存在
     */
    private JobDatasource getDatasource(Long datasourceId) {
        if (datasourceId == null) {
            throw new IllegalArgumentException("数据源ID不能为空");
        }
        JobDatasource ds = jobDatasourceService.getById(datasourceId);
        if (ds == null) {
            throw new IllegalArgumentException("未找到ID为 " + datasourceId + " 的数据源配置");
        }
        return ds;
    }

    /**
     * 解析字段映射 JSON 字符串
     */
    private List<StatTaskColumnMappingDto> parseColumnMappings(String json) {
        if (StringUtils.isBlank(json)) {
            return Collections.emptyList();
        }
        try {
            return JSON.parseArray(json, StatTaskColumnMappingDto.class);
        } catch (Exception e) {
            logger.warn("解析字段映射 JSON 失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 同步创建或更新底层 xxl-job (job_info) 调度记录
     */
    private void syncWithJobInfo(JobStatTask task) {
        JobInfo jobInfo = null;
        if (task.getJobId() != null && task.getJobId() > 0) {
            jobInfo = jobInfoMapper.loadById(task.getJobId());
        }

        boolean isNewJob = (jobInfo == null);
        String oldCron = (jobInfo != null) ? jobInfo.getJobCron() : null;
        if (isNewJob) {
            jobInfo = new JobInfo();
            jobInfo.setJobGroup(1); // 默认 datax-executor 执行器组
            jobInfo.setAddTime(new Date());
            jobInfo.setUserId(1);
        }

        jobInfo.setJobCron(StringUtils.isNotBlank(task.getCronExpression()) ? task.getCronExpression() : "");
        jobInfo.setJobDesc("[统计任务] " + task.getTaskName());
        jobInfo.setUpdateTime(new Date());
        jobInfo.setGlueUpdatetime(new Date());
        jobInfo.setExecutorRouteStrategy("FIRST");
        jobInfo.setExecutorHandler(STAT_TASK_HANDLER);
        jobInfo.setExecutorParam(String.valueOf(task.getId()));
        jobInfo.setExecutorBlockStrategy(StringUtils.isNotBlank(task.getExecutorBlockStrategy())
                ? task.getExecutorBlockStrategy() : "DISCARD_LATER");
        jobInfo.setExecutorTimeout((task.getTimeoutSeconds() != null) ? task.getTimeoutSeconds() : 3600);
        jobInfo.setExecutorFailRetryCount(1);
        jobInfo.setGlueType(GlueTypeEnum.BEAN.getDesc());
        jobInfo.setAlarmEmail(task.getAlarmEmail());

        if (isNewJob) {
            jobInfo.setTriggerStatus(task.getStatus() != null ? task.getStatus() : 0);
            jobInfoMapper.save(jobInfo);
            task.setJobId(jobInfo.getId());
        } else {
            // 若任务处于运行状态且配置了有效 Cron，保存配置时主动重算并刷新下次触发时间，避免被历史残留时间卡住
            if (jobInfo.getTriggerStatus() == 1
                    && StringUtils.isNotBlank(task.getCronExpression())) {
                try {
                    Date nextValidTime = new CronExpression(task.getCronExpression())
                            .getNextValidTimeAfter(new Date(System.currentTimeMillis() + JobScheduleHelper.PRE_READ_MS));
                    if (nextValidTime != null) {
                        jobInfo.setTriggerNextTime(nextValidTime.getTime());
                    }
                } catch (Exception e) {
                    logger.warn("刷新统计任务下次触发时间异常: {}", e.getMessage());
                }
            }
            jobInfoMapper.update(jobInfo);
        }
    }

    @Override
    public StatTaskResultDto triggerStatTaskWithLog(Long id) throws Exception {
        JobStatTask task = validateExists(id);
        if (task.getJobId() == null || task.getJobId() <= 0) {
            syncWithJobInfo(task);
            jobStatTaskMapper.updateById(task);
        }

        Date triggerTime = new Date();
        JobLog jobLog = new JobLog();
        jobLog.setJobGroup(1);
        jobLog.setJobId(task.getJobId() != null ? task.getJobId() : 0);
        jobLog.setJobDesc("[统计任务] " + task.getTaskName());
        jobLog.setTriggerTime(triggerTime);
        jobLog.setTriggerCode(ReturnT.SUCCESS_CODE);
        jobLog.setTriggerMsg("【手动立即触发】由管理员手动触发执行并落库");
        jobLog.setExecutorAddress("127.0.0.1(local-stat-engine)");
        jobLog.setExecutorHandler(STAT_TASK_HANDLER);
        jobLog.setExecutorParam(String.valueOf(task.getId()));
        jobLog.setHandleCode(0);
        jobLogMapper.save(jobLog);

        StatTaskResultDto result;
        try {
            result = executeStatTask(id, "MANUAL", jobLog.getId());
            if (result != null && result.getMessage() != null && result.getMessage().contains("丢弃后续调度")) {
                jobLog.setHandleCode(ReturnT.FAIL_CODE);
                jobLog.setHandleMsg(result.getMessage());
                jobLog.setHandleTime(new Date());
                jobLogMapper.updateHandleInfo(jobLog);
                return result;
            }
            jobLog.setHandleCode(ReturnT.SUCCESS_CODE);
            int readCount = (result != null && result.getRows() != null) ? result.getRows().size() : 0;
            long writeCount = (result != null) ? result.getWrittenRows() : 0;
            String successMsg = (result != null && StringUtils.isNotBlank(result.getMessage()))
                    ? result.getMessage()
                    : "读取 " + readCount + " 条，写入目标表 [" + task.getTargetTableName() + "] " + writeCount + " 条";
            jobLog.setHandleMsg(successMsg);
            jobLog.setHandleTime(new Date());
            jobLogMapper.updateHandleInfo(jobLog);

            // 明确打上【手动执行】前缀与标识
            task.setLastRunTime(new Date());
            task.setLastRunStatus(1);
            task.setLastRunMsg("【手动执行】" + successMsg + "，耗时 " + (result != null ? result.getCostMs() : 0) + "ms");
            task.setLastTriggerType("MANUAL");
            jobStatTaskMapper.updateById(task);

            return result;
        } catch (Exception e) {
            jobLog.setHandleCode(ReturnT.FAIL_CODE);
            String failMsg = "执行失败: " + e.getMessage();
            jobLog.setHandleMsg(failMsg.length() > 2000 ? failMsg.substring(0, 2000) : failMsg);
            jobLog.setHandleTime(new Date());
            jobLogMapper.updateHandleInfo(jobLog);

            task.setLastRunTime(new Date());
            task.setLastRunStatus(2);
            task.setLastRunMsg("【手动执行】" + failMsg);
            task.setLastTriggerType("MANUAL");
            jobStatTaskMapper.updateById(task);
            throw e;
        }
    }

    @Override
    public Map<String, Object> getStatTaskLogPage(Long taskId, int current, int size, Integer logStatus) {
        return getStatTaskLogPage(taskId, current, size, logStatus, null);
    }

    @Override
    public Map<String, Object> getStatTaskLogPage(Long taskId, int current, int size, Integer logStatus, String triggerType) {
        Map<String, Object> resultMap = new HashMap<>();
        if (taskId == null) {
            resultMap.put("total", 0);
            resultMap.put("records", Collections.emptyList());
            return resultMap;
        }

        JobStatTask task = jobStatTaskMapper.selectById(taskId);
        if (task == null || task.getJobId() == null || task.getJobId() <= 0) {
            resultMap.put("total", 0);
            resultMap.put("records", Collections.emptyList());
            return resultMap;
        }

        int cur = Math.max(current, 1);
        int pageSize = (size > 0 && size <= 100) ? size : 10;
        int offset = (cur - 1) * pageSize;
        int statusParam = (logStatus != null) ? logStatus : 0;

        List<JobLog> logList = jobLogMapper.pageList(offset, pageSize, 0, task.getJobId(), null, null, statusParam);
        int total = jobLogMapper.pageListCount(offset, pageSize, 0, task.getJobId(), null, null, statusParam);

        List<Map<String, Object>> recordList = new ArrayList<>();
        if (logList != null) {
            for (JobLog log : logList) {
                Map<String, Object> item = new HashMap<>();
                item.put("id", log.getId());
                item.put("jobId", log.getJobId());
                item.put("triggerTime", log.getTriggerTime() != null ? DateUtil.format(log.getTriggerTime(), "yyyy-MM-dd HH:mm:ss") : "");
                item.put("triggerCode", log.getTriggerCode());
                item.put("triggerMsg", log.getTriggerMsg());

                boolean isManual = log.getTriggerMsg() != null && (log.getTriggerMsg().contains("手动") || log.getTriggerMsg().contains("MANUAL"));
                String actualType = isManual ? "MANUAL" : "CRON";
                item.put("triggerType", actualType);
                item.put("triggerTypeDesc", isManual ? "🚀 手动执行" : "⏰ 定时调度");

                // 按触发方式过滤 (若前端传递)
                if (StringUtils.isNotBlank(triggerType) && !triggerType.equalsIgnoreCase(actualType)) {
                    continue;
                }

                item.put("handleTime", log.getHandleTime() != null ? DateUtil.format(log.getHandleTime(), "yyyy-MM-dd HH:mm:ss") : "");
                item.put("handleCode", log.getHandleCode());
                item.put("handleMsg", log.getHandleMsg());

                if (log.getTriggerTime() != null && log.getHandleTime() != null) {
                    long cost = log.getHandleTime().getTime() - log.getTriggerTime().getTime();
                    item.put("costMs", Math.max(cost, 0));
                    item.put("costText", formatCostText(cost));
                } else {
                    item.put("costMs", null);
                    item.put("costText", "-");
                }

                if (log.getHandleCode() == 200) {
                    item.put("status", "SUCCESS");
                    item.put("statusDesc", "🟢 成功");
                } else if (log.getHandleCode() > 0 && log.getHandleCode() != 200) {
                    item.put("status", "FAIL");
                    item.put("statusDesc", "🔴 失败");
                } else {
                    if (log.getTriggerCode() != 200 && log.getTriggerCode() > 0) {
                        item.put("status", "FAIL");
                        item.put("statusDesc", "🔴 调度失败");
                    } else {
                        // 1. 优先探测当前内存中该统计任务是否正在真实运行，且匹配当前流水日志ID
                        StatTaskExecutionManager.TaskRunningContext runCtx = StatTaskExecutionManager.getRunningContext(task.getId());
                        boolean isActuallyRunning = (runCtx != null && (runCtx.getLogId() == null || runCtx.getLogId().equals(log.getId())));

                        // 2. 超时时间对齐任务实际配置的超时时间 (默认 3600 秒/1小时)，拒绝硬编码 10 分钟误判
                        int taskTimeout = (task.getTimeoutSeconds() != null && task.getTimeoutSeconds() > 0) ? task.getTimeoutSeconds() : 3600;
                        long timeoutMillis = (long) taskTimeout * 1000L;
                        long elapsed = (log.getTriggerTime() != null)
                                ? System.currentTimeMillis() - log.getTriggerTime().getTime()
                                : 0;

                        if (isActuallyRunning || elapsed <= timeoutMillis) {
                            item.put("status", "RUNNING");
                            item.put("statusDesc", "⏳ 进行中");
                        } else {
                            item.put("status", "TIMEOUT");
                            item.put("statusDesc", "⚠️ 未回调");
                        }
                    }
                }

                recordList.add(item);
            }
        }

        resultMap.put("total", total);
        resultMap.put("current", cur);
        resultMap.put("size", pageSize);
        resultMap.put("records", recordList);
        resultMap.put("taskId", task.getId());
        resultMap.put("taskName", task.getTaskName());
        resultMap.put("targetTable", task.getTargetTableName());
        return resultMap;
    }

    @Override
    public Map<String, Object> batchExecuteStatTasksWithLog(List<Long> ids) {
        return executeBatchTaskOperation("批量触发执行", ids, (id, detail) -> {
            try {
                StatTaskResultDto res = triggerStatTaskWithLog(id);
                detail.put("status", "SUCCESS");
                detail.put("msg", res != null && StringUtils.isNotBlank(res.getMessage()) ? res.getMessage() : "执行成功");
                if (res != null) {
                    detail.put("writtenRows", res.getWrittenRows());
                    detail.put("costMs", res.getCostMs());
                }
            } catch (Exception e) {
                detail.put("status", "FAIL");
                detail.put("msg", e.getMessage());
            }
        });
    }

    private String formatCostText(long costMs) {
        if (costMs < 1000) {
            return costMs + "ms";
        }
        double sec = costMs / 1000.0;
        return String.format("%.2fs", sec);
    }
}
