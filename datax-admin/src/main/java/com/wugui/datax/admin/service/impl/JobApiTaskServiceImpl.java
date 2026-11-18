package com.wugui.datax.admin.service.impl;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjectUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datatx.core.glue.GlueTypeEnum;
import com.wugui.datax.admin.dto.ApiTestRunDto;
import com.wugui.datax.admin.dto.ApiTestRunResultDto;
import com.wugui.datax.admin.dto.JobApiTaskDto;
import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datax.admin.dto.StatTaskColumnMappingDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.entity.JobInfo;
import com.wugui.datax.admin.entity.JobApiTask;
import com.wugui.datax.admin.entity.JobLog;
import com.wugui.datax.admin.mapper.JobInfoMapper;
import com.wugui.datax.admin.mapper.JobApiTaskMapper;
import com.wugui.datax.admin.mapper.JobLogMapper;
import com.wugui.datax.admin.core.cron.CronExpression;
import com.wugui.datax.admin.core.thread.JobScheduleHelper;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.service.JobService;
import com.wugui.datax.admin.service.JobApiTaskService;
import com.wugui.datax.admin.dto.ApiScriptTestDto;
import com.wugui.datax.admin.dto.ApiScriptTestResultDto;
import com.wugui.datax.admin.tool.api.ApiScriptExecutor;
import com.wugui.datax.admin.tool.api.ApiTaskLogManager;
import com.wugui.datax.admin.tool.api.HttpApiExtractEngine;
import com.wugui.datax.admin.tool.stat.TargetDataWriterEngine;
import com.wugui.datax.admin.util.SqlSecurityUtil;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 接口数据采集任务核心业务实现类
 *
 * @author ypc
 */
@Service
public class JobApiTaskServiceImpl extends ServiceImpl<JobApiTaskMapper, JobApiTask> implements JobApiTaskService {

    private static final Logger logger = LoggerFactory.getLogger(JobApiTaskServiceImpl.class);

    public static final String API_TASK_HANDLER = "apiTaskJobHandler";

    @Autowired
    private JobApiTaskMapper jobApiTaskMapper;

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Autowired
    private JobInfoMapper jobInfoMapper;

    @Autowired
    private JobService jobService;

    @Autowired
    private JobLogMapper jobLogMapper;

    @Override
    public IPage<JobApiTask> getApiTaskPage(int pageNo, int pageSize, String taskName, Integer status) {
        Page<JobApiTask> page = new Page<>(pageNo, pageSize);
        IPage<JobApiTask> result = jobApiTaskMapper.selectApiTaskPage(page, taskName, status);
        setLinkData(result.getRecords());
        return result;
    }

    @Override
    public JobApiTask getApiTaskById(Long id) {
        JobApiTask task = validateExists(id);
        fillSingleLinkData(task);
        return task;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long saveOrUpdateApiTask(JobApiTaskDto dto, String username) {
        Assert.notNull(dto, "任务配置参数不能为空");
        boolean isDraft = Boolean.TRUE.equals(dto.getIsDraft()) || (dto.getStatus() != null && dto.getStatus() == 2);

        if (isDraft) {
            // 暂存草稿模式：门槛极低，只需任务名称即可暂存
            Assert.notBlank(dto.getTaskName(), "暂存任务名称不能为空");
            // 对未填写的项进行安全空值填充，规避数据库底层非空约束
            if (StringUtils.isBlank(dto.getRequestUrl())) {
                dto.setRequestUrl("");
            }
            if (dto.getTargetDatasourceId() == null) {
                dto.setTargetDatasourceId(0L);
            }
            if (StringUtils.isBlank(dto.getTargetTableName())) {
                dto.setTargetTableName("");
            }
            if (StringUtils.isBlank(dto.getDataExtractPath())) {
                dto.setDataExtractPath("$.data");
            }
            if (StringUtils.isBlank(dto.getColumnMappingJson())) {
                dto.setColumnMappingJson("[]");
            }
            if (dto.getDriverDatasourceId() == null) {
                dto.setDriverDatasourceId(0L);
            }
            if (StringUtils.isBlank(dto.getDriverParamMode())) {
                dto.setDriverParamMode("ROW");
            }
            if (dto.getDriverBatchSize() == null) {
                dto.setDriverBatchSize(1);
            }
            if (dto.getDriverDelayMs() == null) {
                dto.setDriverDelayMs(0);
            }
            dto.setStatus(2); // 2 代表暂存草稿状态
        } else {
            // 正式保存模式：全量严格校验
            validateData(dto);
            // 若原为草稿状态转为正式保存，状态设为就绪已停止 (0)
            if (dto.getStatus() == null || dto.getStatus() == 2) {
                dto.setStatus(0);
            }
        }

        JobApiTask entity;
        boolean isNew = (dto.getId() == null || dto.getId() <= 0);

        if (isNew) {
            entity = new JobApiTask();
            initData(entity, username);
        } else {
            entity = validateExists(dto.getId());
            entity.setUpdateBy(StringUtils.isNotBlank(username) ? username : "admin");
            entity.setUpdateTime(new Date());
        }

        copyPropertiesFromDto(dto, entity);

        if (isNew) {
            jobApiTaskMapper.insert(entity);
        } else {
            jobApiTaskMapper.updateById(entity);
        }

        // 仅在正式保存时才同步 xxl-job 定时调度配置；草稿暂存状态不同步调度
        if (!isDraft) {
            syncWithJobInfo(entity);
            jobApiTaskMapper.updateById(entity);
        }

        return entity.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteApiTask(Long id) {
        JobApiTask task = validateExists(id);
        if (task.getJobId() != null && task.getJobId() > 0) {
            try {
                jobService.remove(task.getJobId());
            } catch (Exception ex) {
                logger.warn("删除关联的调度任务失败 [jobId: {}]: {}", task.getJobId(), ex.getMessage());
            }
        }
        return jobApiTaskMapper.deleteById(id) > 0;
    }

    @Override
    public boolean startApiTask(Long id) {
        JobApiTask task = validateExists(id);
        if (task.getStatus() != null && task.getStatus() == 2) {
            throw new IllegalArgumentException("该任务处于「暂存草稿」状态，请点击编辑补充完整并正式保存后再开启调度！");
        }
        if (StringUtils.isBlank(task.getCronExpression())) {
            throw new IllegalArgumentException("该任务未配置 Cron 表达式，无法开启定时调度！");
        }

        if (task.getJobId() == null || task.getJobId() <= 0) {
            syncWithJobInfo(task);
            jobApiTaskMapper.updateById(task);
        }

        jobService.start(task.getJobId());
        task.setStatus(1);
        return jobApiTaskMapper.updateById(task) > 0;
    }

    @Override
    public boolean stopApiTask(Long id) {
        JobApiTask task = validateExists(id);
        if (task.getJobId() != null && task.getJobId() > 0) {
            jobService.stop(task.getJobId());
        }
        task.setStatus(0);
        return jobApiTaskMapper.updateById(task) > 0;
    }

    @Override
    public String executeOnce(Long id) {
        return executeOnce(id, null, "MANUAL");
    }

    @Override
    public String executeOnce(Long id, Long logId, String triggerSource) {
        JobApiTask task = validateExists(id);
        if (task.getStatus() != null && task.getStatus() == 2) {
            if (task.getTargetDatasourceId() == null || task.getTargetDatasourceId() <= 0
                    || StringUtils.isBlank(task.getTargetTableName())
                    || StringUtils.isBlank(task.getRequestUrl())) {
                throw new IllegalArgumentException("该任务处于「暂存草稿」状态，缺少必要的目标库表或接口配置，请先编辑补充完整后再执行！");
            }
        }

        // 确保任务有关联的 jobInfo，以便流水能归属到该任务
        if (task.getJobId() == null || task.getJobId() <= 0) {
            syncWithJobInfo(task);
            jobApiTaskMapper.updateById(task);
        }

        boolean isExternalLog = (logId != null && logId > 0);
        JobLog jobLog = null;
        Date triggerTime = new Date();
        String actualSource = StringUtils.defaultIfBlank(triggerSource, isExternalLog ? "CRON" : "MANUAL");

        if (!isExternalLog) {
            jobLog = new JobLog();
            jobLog.setJobGroup(1);
            jobLog.setJobId(task.getJobId() != null ? task.getJobId() : 0);
            jobLog.setJobDesc("[接口采集] " + task.getTaskName());
            jobLog.setTriggerTime(triggerTime);
            jobLog.setTriggerCode(ReturnT.SUCCESS_CODE);
            jobLog.setTriggerMsg("【手动立即触发】由管理员手动触发执行接口数据采集入库");
            jobLog.setExecutorAddress("127.0.0.1(local-api-engine)");
            jobLog.setExecutorHandler(API_TASK_HANDLER);
            jobLog.setExecutorParam(String.valueOf(task.getId()));
            jobLog.setHandleCode(0);
            jobLogMapper.save(jobLog);
            logId = jobLog.getId();
        }

        final Long currentLogId = logId;
        ApiTaskLogManager.initLog(currentLogId, task.getTaskName(), actualSource);

        long startTime = System.currentTimeMillis();

        JobDatasource targetDs = getDatasource(task.getTargetDatasourceId());
        JobDatasource driverDs = null;
        if (task.getDriverDatasourceId() != null && task.getDriverDatasourceId() > 0) {
            driverDs = jobDatasourceService.getById(task.getDriverDatasourceId());
        }
        List<StatTaskColumnMappingDto> mappings = parseColumnMappings(task.getColumnMappingJson());
        boolean autoCreate = (task.getAutoCreateTable() != null && task.getAutoCreateTable() == 1);
        int batchSize = (task.getBatchSize() != null && task.getBatchSize() > 0) ? task.getBatchSize() : 1000;
        String writeMode = StringUtils.defaultIfBlank(task.getWriteMode(), "APPEND");
        boolean isIncrement = (task.getIncrementType() != null && task.getIncrementType() == 1);

        ApiTaskLogManager.appendLog(currentLogId, "开始执行接口数据采集与落库任务 [ID: #" + task.getId() + ", 任务名称: " + task.getTaskName() + "]");
        ApiTaskLogManager.appendLog(currentLogId, "请求定义: [" + task.getRequestMethod() + "] " + task.getRequestUrl());
        if (driverDs != null && StringUtils.isNotBlank(task.getDriverSql())) {
            ApiTaskLogManager.appendLog(currentLogId, "驱动配置: 参数驱动采集, 数据源 [" + driverDs.getDatasourceName() + "], 模式: "
                    + task.getDriverParamMode() + ", 切片批次: " + task.getDriverBatchSize() + ", 驱动SQL: " + task.getDriverSql());
        }
        ApiTaskLogManager.appendLog(currentLogId, "目标输出: 数据源ID #" + task.getTargetDatasourceId() + ", 目标表 [" + task.getTargetTableName() + "], 写入模式: " + writeMode);
        if (isIncrement) {
            ApiTaskLogManager.appendLog(currentLogId, "同步模式: 时间增量同步, 当前增量起始时间: " + (task.getIncStartTime() != null ? DateUtil.format(task.getIncStartTime(), "yyyy-MM-dd HH:mm:ss") : "未设置(首期全量)"));
        } else {
            ApiTaskLogManager.appendLog(currentLogId, "同步模式: 全量同步");
        }

        List<TableColumnDto> inferredCols = new ArrayList<>();
        for (StatTaskColumnMappingDto mapping : mappings) {
            TableColumnDto col = new TableColumnDto();
            col.setColumnName(mapping.getTargetCol());
            col.setColumnType(StringUtils.defaultIfBlank(mapping.getDataType(), "VARCHAR(255)"));
            col.setComment("来自接口字段: " + mapping.getSourceCol());
            inferredCols.add(col);
        }

        long[] writtenCount = new long[]{0L};
        Date windowEndTime = new Date();

        try {
            // 执行全量/增量接口分页拉取并写入目标库 (支持实时过程日志回调)
            HttpApiExtractEngine.ApiExtractionResult extractResult = HttpApiExtractEngine.executeExtractionWithResult(
                    task,
                    driverDs,
                    windowEndTime,
                    rows -> {
                        if (rows == null || rows.isEmpty()) return;
                        try {
                            long count = TargetDataWriterEngine.writeDataToTarget(
                                    targetDs,
                                    task.getTargetTableName(),
                                    writeMode,
                                    mappings,
                                    inferredCols,
                                    autoCreate,
                                    rows,
                                    batchSize
                            );
                            writtenCount[0] += count;
                            ApiTaskLogManager.appendLog(currentLogId, String.format("批次数据落库成功: 写入目标表 [%s] %d 条, 累计写入 %d 条",
                                    task.getTargetTableName(), count, writtenCount[0]));
                        } catch (Exception e) {
                            ApiTaskLogManager.appendLog(currentLogId, "❌ 写入目标表失败: " + e.getMessage());
                            throw new RuntimeException("写入目标表失败: " + e.getMessage(), e);
                        }
                    },
                    line -> ApiTaskLogManager.appendLog(currentLogId, line)
            );

            long pulledCount = extractResult != null ? extractResult.getTotalRecords() : 0L;

            // 若开启了增量同步模式，且全流程成功入库，根据策略计算并更新下次增量时间
            Date nextIncTime = null;
            if (isIncrement) {
                int strategy = (task.getIncStrategy() != null) ? task.getIncStrategy() : 0;
                if (strategy == 0 && StringUtils.isNotBlank(task.getIncTimeColumn())) {
                    // 策略 0: 取拉取数据中提取到的最大业务时间
                    if (extractResult != null && extractResult.getMaxRecordTime() != null) {
                        nextIncTime = extractResult.getMaxRecordTime();
                        task.setIncStartTime(nextIncTime);
                        ApiTaskLogManager.appendLog(currentLogId, "增量推进策略: 提取到业务数据最大时间 " + DateUtil.format(nextIncTime, "yyyy-MM-dd HH:mm:ss") + "，下次增量时间已更新");
                    } else if (pulledCount == 0) {
                        // 本次无新数据，保持原增量时间不变，避免跳漏数据
                        nextIncTime = task.getIncStartTime();
                        String incTimeStr = nextIncTime != null ? DateUtil.format(nextIncTime, "yyyy-MM-dd HH:mm:ss") : "未设";
                        logger.info("任务 [{}] 本次拉取 0 条数据，保持原有增量起始时间 [{}] 不变", task.getTaskName(), incTimeStr);
                        ApiTaskLogManager.appendLog(currentLogId, "增量推进策略: 本次拉取 0 条数据，保持原有增量起点 [" + incTimeStr + "] 不变");
                    } else {
                        // 虽然拉取了数据但字段无法解析，兜底使用当前物理窗口时间
                        nextIncTime = windowEndTime;
                        task.setIncStartTime(nextIncTime);
                        ApiTaskLogManager.appendLog(currentLogId, "增量推进策略: 业务时间字段未解析成功，兜底使用物理窗口时间推进: " + DateUtil.format(nextIncTime, "yyyy-MM-dd HH:mm:ss"));
                    }
                } else {
                    // 策略 1 或未指定时间字段: 默认按物理窗口时间推进
                    nextIncTime = windowEndTime;
                    task.setIncStartTime(nextIncTime);
                    ApiTaskLogManager.appendLog(currentLogId, "增量推进策略: 按照系统物理窗口时间推进: " + DateUtil.format(nextIncTime, "yyyy-MM-dd HH:mm:ss"));
                }
            }

            long elapsed = System.currentTimeMillis() - startTime;
            String timeText = formatElapsed(elapsed);
            StringBuilder msgBuilder = new StringBuilder();
            msgBuilder.append("任务执行成功：读取 ").append(pulledCount).append(" 条，写入目标表 [")
                    .append(task.getTargetTableName()).append("] ").append(writtenCount[0]).append(" 条，耗时 ").append(timeText);
            if (isIncrement && nextIncTime != null) {
                msgBuilder.append("（下次增量时间: ").append(DateUtil.format(nextIncTime, "yyyy-MM-dd HH:mm:ss")).append("）");
            }
            String successMsg = msgBuilder.toString();

            ApiTaskLogManager.appendLog(currentLogId, successMsg);
            ApiTaskLogManager.finishLog(currentLogId, true, successMsg);

            if (jobLog != null) {
                jobLog.setHandleCode(ReturnT.SUCCESS_CODE);
                jobLog.setHandleMsg(successMsg);
                jobLog.setHandleTime(new Date());
                jobLogMapper.updateHandleInfo(jobLog);
            }

            task.setLastRunTime(new Date());
            task.setLastRunStatus(1);
            String displayMsg = ("MANUAL".equalsIgnoreCase(actualSource) ? "【手动执行】" : "【定时调度】") + successMsg;
            task.setLastRunMsg(displayMsg.length() > 1000 ? displayMsg.substring(0, 1000) : displayMsg);
            jobApiTaskMapper.updateById(task);

            return successMsg;

        } catch (Exception ex) {
            long elapsed = System.currentTimeMillis() - startTime;
            logger.error("接口任务 [{}] 执行失败: {}", task.getTaskName(), ex.getMessage(), ex);

            String errMsg = "任务执行失败 (耗时 " + formatElapsed(elapsed) + "): " + ex.getMessage();
            ApiTaskLogManager.appendLog(currentLogId, "❌ " + errMsg);
            ApiTaskLogManager.finishLog(currentLogId, false, errMsg);

            if (jobLog != null) {
                jobLog.setHandleCode(ReturnT.FAIL_CODE);
                jobLog.setHandleMsg(errMsg.length() > 2000 ? errMsg.substring(0, 2000) : errMsg);
                jobLog.setHandleTime(new Date());
                jobLogMapper.updateHandleInfo(jobLog);
            }

            task.setLastRunTime(new Date());
            task.setLastRunStatus(2);
            String displayErrMsg = ("MANUAL".equalsIgnoreCase(actualSource) ? "【手动执行】" : "【定时调度】") + errMsg;
            task.setLastRunMsg(displayErrMsg.length() > 1000 ? displayErrMsg.substring(0, 1000) : displayErrMsg);
            jobApiTaskMapper.updateById(task);

            throw new RuntimeException(ex.getMessage(), ex);
        }
    }

    @Override
    public Map<String, Object> getApiTaskLogPage(Long taskId, int current, int size, Integer logStatus, String triggerType) {
        Map<String, Object> resultMap = new HashMap<>();
        if (taskId == null) {
            resultMap.put("total", 0);
            resultMap.put("records", Collections.emptyList());
            return resultMap;
        }

        JobApiTask task = jobApiTaskMapper.selectById(taskId);
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

                // 按触发方式过滤 (若前端指定)
                if (StringUtils.isNotBlank(triggerType) && !triggerType.equalsIgnoreCase(actualType)) {
                    continue;
                }

                item.put("handleTime", log.getHandleTime() != null ? DateUtil.format(log.getHandleTime(), "yyyy-MM-dd HH:mm:ss") : "");
                item.put("handleCode", log.getHandleCode());
                item.put("handleMsg", log.getHandleMsg());

                if (log.getTriggerTime() != null && log.getHandleTime() != null) {
                    long cost = log.getHandleTime().getTime() - log.getTriggerTime().getTime();
                    item.put("costMs", Math.max(cost, 0));
                    item.put("costText", formatElapsed(cost));
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
                        // 超时时间对齐任务实际配置的超时时间 (默认 3600 秒/1小时)，拒绝硬编码 10 分钟误判
                        int taskTimeout = (task.getTimeoutSeconds() != null && task.getTimeoutSeconds() > 0) ? task.getTimeoutSeconds() : 3600;
                        long timeoutMillis = (long) taskTimeout * 1000L;
                        long elapsed = (log.getTriggerTime() != null)
                                ? System.currentTimeMillis() - log.getTriggerTime().getTime()
                                : 0;

                        if (elapsed <= timeoutMillis) {
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
    public ApiTestRunResultDto debugSample(ApiTestRunDto dto) {
        Assert.notNull(dto, "试运行参数不能为空");
        Assert.notBlank(dto.getRequestUrl(), "请求URL不能为空");
        JobDatasource driverDs = null;
        if (dto.getDriverDatasourceId() != null && dto.getDriverDatasourceId() > 0) {
            driverDs = jobDatasourceService.getById(dto.getDriverDatasourceId());
        }
        return HttpApiExtractEngine.debugSample(dto, driverDs);
    }

    @Override
    public ApiScriptTestResultDto testScript(ApiScriptTestDto dto) {
        Assert.notNull(dto, "脚本测试参数不能为空");
        String script = dto.getScript();
        Assert.notBlank(script, "脚本内容不能为空");

        Map<String, String> headers = new HashMap<>();
        if (StringUtils.isNotBlank(dto.getRequestHeaders())) {
            try {
                JSONObject obj = JSON.parseObject(dto.getRequestHeaders());
                if (obj != null) {
                    for (String k : obj.keySet()) {
                        headers.put(k, obj.getString(k));
                    }
                }
            } catch (Exception ignored) {
            }
        }

        Map<String, Object> queryParams = new HashMap<>();
        if (StringUtils.isNotBlank(dto.getRequestParams())) {
            try {
                JSONObject obj = JSON.parseObject(dto.getRequestParams());
                if (obj != null) {
                    queryParams.putAll(obj);
                }
            } catch (Exception ignored) {
            }
        }

        String url = StringUtils.defaultIfBlank(dto.getRequestUrl(), "http://localhost/api/test");
        String method = StringUtils.defaultIfBlank(dto.getRequestMethod(), "POST");
        String body = dto.getRequestBody();

        ApiScriptExecutor.ScriptExecutionResult execRes = ApiScriptExecutor.executePreScriptWithResult(
                script, headers, queryParams, url, method, body
        );

        ApiScriptTestResultDto resDto = new ApiScriptTestResultDto();
        resDto.setSuccess(execRes.isSuccess());
        resDto.setMessage(execRes.getMessage());
        resDto.setElapsedMs(execRes.getElapsedMs());
        resDto.setLogs(execRes.getLogs());
        resDto.setResultHeaders(execRes.getHeaders());
        resDto.setResultParams(execRes.getQueryParams());
        return resDto;
    }

    // ==================== 私有辅助方法 (单一职责与公共方法规范) ====================

    /**
     * 格式化耗时展示（毫秒/秒级友好转换，贴合标准运维日志风格）
     *
     * @param elapsedMs 毫秒数
     * @return 格式化后的耗时文本
     */
    private String formatElapsed(long elapsedMs) {
        if (elapsedMs < 1000) {
            return elapsedMs + "ms";
        }
        return String.format("%.2fs", elapsedMs / 1000.0);
    }

    private JobApiTask validateExists(Long id) {
        Assert.notNull(id, "任务ID不能为空");
        JobApiTask task = jobApiTaskMapper.selectById(id);
        if (ObjectUtil.isNull(task)) {
            throw new IllegalArgumentException("未找到ID为 " + id + " 的接口数据采集任务");
        }
        return task;
    }

    private void validateData(JobApiTaskDto dto) {
        Assert.notNull(dto, "任务配置参数不能为空");
        Assert.notBlank(dto.getTaskName(), "任务名称不能为空");
        Assert.notBlank(dto.getRequestUrl(), "请求URL不能为空");
        Assert.notNull(dto.getTargetDatasourceId(), "目标端数据源ID不能为空");
        Assert.notBlank(dto.getTargetTableName(), "目标端数据表名不能为空");
        Assert.notBlank(dto.getDataExtractPath(), "数据列表提取路径不能为空");
        Assert.notBlank(dto.getColumnMappingJson(), "字段映射配置不能为空");
        if (dto.getDriverDatasourceId() != null && dto.getDriverDatasourceId() > 0) {
            Assert.notBlank(dto.getDriverSql(), "配置了参数驱动源数据源时，驱动查询SQL不能为空");
            // 校验驱动 SQL 只读安全性
            SqlSecurityUtil.validateReadOnlySql(dto.getDriverSql());
        }
    }

    private void initData(JobApiTask entity, String currentUsername) {
        Date now = new Date();
        entity.setStatus(0);
        entity.setLastRunStatus(0);
        entity.setBatchSize(1000);
        entity.setTimeoutSeconds(60);
        entity.setRetryCount(3);
        entity.setRequestDelayMs(0);
        entity.setAutoCreateTable(0);
        entity.setWriteMode("APPEND");
        entity.setPageStrategy("NONE");
        entity.setPageSize(100);
        entity.setPageStartIndex(1);
        entity.setMaxPageLimit(500);
        entity.setIncStrategy(0);
        entity.setDriverDatasourceId(0L);
        entity.setDriverParamMode("ROW");
        entity.setDriverBatchSize(1);
        entity.setDriverDelayMs(0);
        entity.setCreateBy(StringUtils.isNotBlank(currentUsername) ? currentUsername : "admin");
        entity.setCreateTime(now);
        entity.setUpdateBy(entity.getCreateBy());
        entity.setUpdateTime(now);
    }

    private void copyPropertiesFromDto(JobApiTaskDto dto, JobApiTask entity) {
        BeanUtils.copyProperties(dto, entity, "id", "createBy", "createTime", "updateBy", "updateTime", "jobId", "status");
        if (dto.getStatus() != null) {
            entity.setStatus(dto.getStatus());
        }
        if (entity.getIncStrategy() == null) {
            entity.setIncStrategy(0);
        }
        if (entity.getDriverDatasourceId() == null) {
            entity.setDriverDatasourceId(0L);
        }
        if (StringUtils.isBlank(entity.getDriverParamMode())) {
            entity.setDriverParamMode("ROW");
        }
        if (entity.getDriverBatchSize() == null || entity.getDriverBatchSize() <= 0) {
            entity.setDriverBatchSize(1);
        }
        if (entity.getDriverDelayMs() == null || entity.getDriverDelayMs() < 0) {
            entity.setDriverDelayMs(0);
        }
        if (StringUtils.isBlank(entity.getWriteMode())) {
            entity.setWriteMode("APPEND");
        }
    }

    private void setLinkData(List<JobApiTask> list) {
        if (list == null || list.isEmpty()) return;
        for (JobApiTask task : list) {
            fillSingleLinkData(task);
        }
    }

    private void fillSingleLinkData(JobApiTask task) {
        if (task == null) return;
        if (StringUtils.isBlank(task.getTargetDatasourceName()) && task.getTargetDatasourceId() != null) {
            JobDatasource tds = jobDatasourceService.getById(task.getTargetDatasourceId());
            if (tds != null) {
                task.setTargetDatasourceName(tds.getDatasourceName());
            }
        }
        if (StringUtils.isBlank(task.getDriverDatasourceName()) && task.getDriverDatasourceId() != null && task.getDriverDatasourceId() > 0) {
            JobDatasource dds = jobDatasourceService.getById(task.getDriverDatasourceId());
            if (dds != null) {
                task.setDriverDatasourceName(dds.getDatasourceName());
            }
        }
    }

    private JobDatasource getDatasource(Long datasourceId) {
        if (datasourceId == null) {
            throw new IllegalArgumentException("目标数据源ID不能为空");
        }
        JobDatasource ds = jobDatasourceService.getById(datasourceId);
        if (ds == null) {
            throw new IllegalArgumentException("未找到ID为 " + datasourceId + " 的数据源配置");
        }
        return ds;
    }

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

    private void syncWithJobInfo(JobApiTask task) {
        if (StringUtils.isBlank(task.getCronExpression())) {
            return;
        }

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

        jobInfo.setJobCron(task.getCronExpression());
        jobInfo.setJobDesc("[接口采集] " + task.getTaskName());
        jobInfo.setUpdateTime(new Date());
        jobInfo.setGlueUpdatetime(new Date());
        jobInfo.setExecutorRouteStrategy("FIRST");
        jobInfo.setExecutorHandler(API_TASK_HANDLER);
        jobInfo.setExecutorParam(String.valueOf(task.getId()));
        jobInfo.setExecutorBlockStrategy("SERIAL_EXECUTION");
        jobInfo.setExecutorTimeout((task.getTimeoutSeconds() != null) ? task.getTimeoutSeconds() : 3600);
        jobInfo.setExecutorFailRetryCount(task.getRetryCount() != null ? task.getRetryCount() : 1);
        jobInfo.setGlueType(GlueTypeEnum.BEAN.getDesc());
        jobInfo.setAlarmEmail(task.getAlarmEmail());

        if (isNewJob) {
            jobInfo.setTriggerStatus(task.getStatus() != null ? task.getStatus() : 0);
            jobInfoMapper.save(jobInfo);
            task.setJobId(jobInfo.getId());
        } else {
            jobInfo.setTriggerStatus(task.getStatus() != null ? task.getStatus() : jobInfo.getTriggerStatus());
            // 若任务处于运行状态且 Cron 发生变更，联动刷新下次触发时间
            if (jobInfo.getTriggerStatus() == 1
                    && oldCron != null && !task.getCronExpression().equals(oldCron)) {
                try {
                    Date nextValidTime = new CronExpression(task.getCronExpression())
                            .getNextValidTimeAfter(new Date(System.currentTimeMillis() + JobScheduleHelper.PRE_READ_MS));
                    if (nextValidTime != null) {
                        jobInfo.setTriggerNextTime(nextValidTime.getTime());
                    }
                } catch (Exception e) {
                    logger.warn("刷新接口采集任务下次触发时间异常: {}", e.getMessage());
                }
            }
            jobInfoMapper.update(jobInfo);
        }
    }
}
