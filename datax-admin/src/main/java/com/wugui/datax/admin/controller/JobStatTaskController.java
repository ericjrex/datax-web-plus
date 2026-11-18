package com.wugui.datax.admin.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.api.R;
import com.wugui.datax.admin.dto.*;
import com.wugui.datax.admin.entity.JobStatTask;
import com.wugui.datax.admin.service.StatTaskService;
import com.wugui.datax.admin.tool.stat.StatTaskLogManager;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * 数据统计计算任务管理控制器
 *
 * @author ypc
 */
@RestController
@RequestMapping("/api/statTask")
@Api(tags = "数据加工与结果表输出任务接口")
public class JobStatTaskController extends BaseController {

    @Autowired
    private StatTaskService statTaskService;

    /**
     * 分页查询统计任务列表
     */
    @GetMapping("/pageList")
    @ApiOperation("分页查询统计计算任务列表")
    public R<IPage<JobStatTask>> getStatTaskPage(
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String taskName,
            @RequestParam(required = false) String taskType,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) Long datasourceId,
            @RequestParam(required = false) String tableName) {
        try {
            IPage<JobStatTask> page = statTaskService.getStatTaskPage(pageNo, pageSize, taskName, taskType, status, datasourceId, tableName);
            return success(page);
        } catch (Exception e) {
            return failed("查询统计任务列表失败: " + e.getMessage());
        }
    }

    /**
     * 根据主键查询统计任务详细配置
     */
    @GetMapping("/detail/{id}")
    @ApiOperation("获取统计任务详细配置")
    public R<JobStatTask> getStatTaskDetail(@PathVariable("id") Long id) {
        try {
            JobStatTask task = statTaskService.getStatTaskById(id);
            return success(task);
        } catch (Exception e) {
            return failed("获取任务详情失败: " + e.getMessage());
        }
    }

    /**
     * 保存或更新统计任务配置
     */
    @PostMapping("/save")
    @ApiOperation("保存或更新统计任务")
    public R<Long> saveOrUpdateStatTask(@RequestBody StatTaskDto dto, HttpServletRequest request) {
        try {
            String username = "admin";
            try {
                Integer userId = getCurrentUserId(request);
                if (userId != null) {
                    username = "user_" + userId;
                }
            } catch (Exception ignored) {
            }
            Long taskId = statTaskService.saveOrUpdateStatTask(dto, username);
            return success(taskId);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("保存任务失败: " + e.getMessage());
        }
    }

    /**
     * 删除统计任务
     */
    @PostMapping("/delete/{id}")
    @ApiOperation("删除统计计算任务")
    public R<Boolean> deleteStatTask(@PathVariable("id") Long id) {
        try {
            boolean result = statTaskService.deleteStatTask(id);
            return success(result);
        } catch (Exception e) {
            return failed("删除任务失败: " + e.getMessage());
        }
    }

    /**
     * 在线试运行与数据调试
     */
    @PostMapping("/testRun")
    @ApiOperation("在线试运行与数据调试 (支持SQL与Python)")
    public R<StatTaskResultDto> testRunStatTask(@RequestBody StatTaskTestRunDto testRunDto) {
        try {
            StatTaskResultDto result = statTaskService.testRunStatTask(testRunDto);
            return success(result);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("试运行失败: " + e.getMessage());
        }
    }

    /**
     * 立即正式执行统计任务 (全量抽取并落库，记录流水日志)
     */
    @PostMapping("/trigger/{id}")
    @ApiOperation("立即触发执行统计任务并落库")
    public R<StatTaskResultDto> triggerStatTask(@PathVariable("id") Long id) {
        try {
            StatTaskResultDto result = statTaskService.triggerStatTaskWithLog(id);
            return success(result);
        } catch (Exception e) {
            return failed("执行统计任务失败: " + e.getMessage());
        }
    }

    /**
     * 启动定时调度
     */
    @PostMapping("/start/{id}")
    @ApiOperation("启动统计任务定时调度")
    public R<Boolean> startSchedule(@PathVariable("id") Long id) {
        try {
            boolean ok = statTaskService.startSchedule(id);
            return success(ok);
        } catch (Exception e) {
            return failed("启动调度失败: " + e.getMessage());
        }
    }

    /**
     * 停止定时调度
     */
    @PostMapping("/stop/{id}")
    @ApiOperation("停止统计任务定时调度")
    public R<Boolean> stopSchedule(@PathVariable("id") Long id) {
        try {
            boolean ok = statTaskService.stopSchedule(id);
            return success(ok);
        } catch (Exception e) {
            return failed("停止调度失败: " + e.getMessage());
        }
    }

    /**
     * 推导计算结果集的列元数据信息
     */
    @PostMapping("/inferColumns")
    @ApiOperation("推导推断统计查询或脚本的输出字段信息")
    public R<List<TableColumnDto>> inferSourceColumns(
            @RequestParam(required = false) Long sourceDsId,
            @RequestParam(required = false) String sql,
            @RequestParam(required = false) String pythonScript,
            @RequestParam(required = false) String pythonParams) {
        try {
            List<TableColumnDto> columns = statTaskService.inferSourceColumns(sourceDsId, sql, pythonScript, pythonParams);
            return success(columns);
        } catch (Exception e) {
            return failed("推导字段失败: " + e.getMessage());
        }
    }

    /**
     * 在目标数据库一键自动建表
     */
    @PostMapping("/autoCreateTable")
    @ApiOperation("在目标数据库一键自动创建目标表")
    public R<Boolean> autoCreateTargetTable(
            @RequestParam Long targetDsId,
            @RequestParam String targetTableName,
            @RequestBody List<StatTaskColumnMappingDto> columnMappings) {
        try {
            boolean ok = statTaskService.autoCreateTargetTable(targetDsId, targetTableName, columnMappings);
            return success(ok);
        } catch (Exception e) {
            return failed("自动建表失败: " + e.getMessage());
        }
    }

    /**
     * 批量启动统计任务定时调度
     */
    @PostMapping("/batchStart")
    @ApiOperation("批量启动统计任务定时调度")
    public R<Map<String, Object>> batchStart(@RequestBody List<Long> ids) {
        try {
            Map<String, Object> result = statTaskService.batchStartSchedule(ids);
            return success(result);
        } catch (Exception e) {
            return failed("批量启动调度失败: " + e.getMessage());
        }
    }

    /**
     * 批量停止统计任务定时调度
     */
    @PostMapping("/batchStop")
    @ApiOperation("批量停止统计任务定时调度")
    public R<Map<String, Object>> batchStop(@RequestBody List<Long> ids) {
        try {
            Map<String, Object> result = statTaskService.batchStopSchedule(ids);
            return success(result);
        } catch (Exception e) {
            return failed("批量停止调度失败: " + e.getMessage());
        }
    }

    /**
     * 批量触发执行统计任务
     */
    @PostMapping("/batchTrigger")
    @ApiOperation("批量触发执行统计任务并落库")
    public R<Map<String, Object>> batchTrigger(@RequestBody List<Long> ids) {
        try {
            Map<String, Object> result = statTaskService.batchExecuteStatTasksWithLog(ids);
            return success(result);
        } catch (Exception e) {
            return failed("批量触发任务失败: " + e.getMessage());
        }
    }

    /**
     * 批量删除统计任务并级联注销调度作业
     */
    @PostMapping("/batchDelete")
    @ApiOperation("批量删除统计任务")
    public R<Map<String, Object>> batchDelete(@RequestBody List<Long> ids) {
        try {
            Map<String, Object> result = statTaskService.batchDeleteStatTasks(ids);
            return success(result);
        } catch (Exception e) {
            return failed("批量删除任务失败: " + e.getMessage());
        }
    }

    /**
     * 分页查询统计任务执行历史流水记录
     */
    @GetMapping("/logList")
    @ApiOperation("分页获取统计任务执行历史记录")
    public R<Map<String, Object>> getStatTaskLogPage(
            @RequestParam Long taskId,
            @RequestParam(defaultValue = "1") int current,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) Integer logStatus,
            @RequestParam(required = false) String triggerType) {
        try {
            Map<String, Object> result = statTaskService.getStatTaskLogPage(taskId, current, size, logStatus, triggerType);
            return success(result);
        } catch (Exception e) {
            return failed("获取执行历史记录失败: " + e.getMessage());
        }
    }

    /**
     * 分片增量拉取统计任务物理执行日志 (支持前端控制台动态轮询)
     */
    @GetMapping("/logDetailCat")
    @ApiOperation("分片增量获取统计任务执行物理日志")
    public R<Map<String, Object>> getStatTaskLogDetail(
            @RequestParam Long logId,
            @RequestParam(defaultValue = "1") int fromLineNum) {
        try {
            if (logId == null || logId <= 0) {
                return failed("无效的日志ID");
            }
            Map<String, Object> result = StatTaskLogManager.readLog(logId, fromLineNum);
            return success(result);
        } catch (Exception e) {
            return failed("读取物理执行日志失败: " + e.getMessage());
        }
    }
}
