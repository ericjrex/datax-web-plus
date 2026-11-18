package com.wugui.datax.admin.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.api.R;
import com.wugui.datax.admin.dto.ApiScriptTestDto;
import com.wugui.datax.admin.dto.ApiScriptTestResultDto;
import com.wugui.datax.admin.dto.ApiTestRunDto;
import com.wugui.datax.admin.dto.ApiTestRunResultDto;
import com.wugui.datax.admin.dto.JobApiTaskDto;
import com.wugui.datax.admin.entity.JobApiTask;
import com.wugui.datax.admin.service.JobApiTaskService;
import com.wugui.datax.admin.tool.api.ApiTaskLogManager;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 接口数据采集任务控制器
 *
 * @author ypc
 */
@RestController
@RequestMapping("/api/apiTask")
@Api(tags = "接口数据采集与落库任务接口")
public class JobApiTaskController extends BaseController {

    private static final Logger logger = LoggerFactory.getLogger(JobApiTaskController.class);

    @Autowired
    private JobApiTaskService jobApiTaskService;

    /**
     * 分页查询接口任务列表
     */
    @GetMapping("/pageList")
    @ApiOperation("分页查询接口采集任务列表")
    public R<IPage<JobApiTask>> getApiTaskPage(
            @RequestParam(value = "pageNo", defaultValue = "1") int pageNo,
            @RequestParam(value = "pageSize", defaultValue = "10") int pageSize,
            @RequestParam(value = "taskName", required = false) String taskName,
            @RequestParam(value = "status", required = false) Integer status) {
        try {
            IPage<JobApiTask> page = jobApiTaskService.getApiTaskPage(pageNo, pageSize, taskName, status);
            return success(page);
        } catch (Exception e) {
            return failed("查询任务列表失败: " + e.getMessage());
        }
    }

    /**
     * 根据主键查询任务详细配置
     */
    @GetMapping("/detail/{id}")
    @ApiOperation("获取接口任务详细配置")
    public R<JobApiTask> getApiTaskDetail(@PathVariable("id") Long id) {
        try {
            JobApiTask task = jobApiTaskService.getApiTaskById(id);
            return success(task);
        } catch (Exception e) {
            return failed("获取任务详情失败: " + e.getMessage());
        }
    }

    /**
     * 保存或更新任务配置
     */
    @PostMapping("/save")
    @ApiOperation("保存或更新接口采集任务")
    public R<Long> saveOrUpdateApiTask(@RequestBody JobApiTaskDto dto, HttpServletRequest request) {
        try {
            String username = "admin";
            try {
                Integer userId = getCurrentUserId(request);
                if (userId != null) {
                    username = "user_" + userId;
                }
            } catch (Exception ignored) {
            }
            Long taskId = jobApiTaskService.saveOrUpdateApiTask(dto, username);
            return success(taskId);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("保存任务失败: " + e.getMessage());
        }
    }

    /**
     * 删除任务
     */
    @PostMapping("/delete/{id}")
    @ApiOperation("删除接口数据采集任务")
    public R<Boolean> deleteApiTask(@PathVariable("id") Long id) {
        try {
            boolean result = jobApiTaskService.deleteApiTask(id);
            return success(result);
        } catch (Exception e) {
            return failed("删除任务失败: " + e.getMessage());
        }
    }

    /**
     * 开启定时调度
     */
    @PostMapping("/start/{id}")
    @ApiOperation("开启接口任务定时调度")
    public R<Boolean> startApiTask(@PathVariable("id") Long id) {
        try {
            boolean ok = jobApiTaskService.startApiTask(id);
            return success(ok);
        } catch (Exception e) {
            return failed("开启调度失败: " + e.getMessage());
        }
    }

    /**
     * 停止定时调度
     */
    @PostMapping("/stop/{id}")
    @ApiOperation("停止接口任务定时调度")
    public R<Boolean> stopApiTask(@PathVariable("id") Long id) {
        try {
            boolean ok = jobApiTaskService.stopApiTask(id);
            return success(ok);
        } catch (Exception e) {
            return failed("停止调度失败: " + e.getMessage());
        }
    }

    /**
     * 立即手动执行一次任务
     */
    @PostMapping("/executeOnce/{id}")
    @ApiOperation("立即手动执行一次接口采集入库")
    public R<String> executeOnce(@PathVariable("id") Long id) {
        try {
            String msg = jobApiTaskService.executeOnce(id);
            return success(msg);
        } catch (Exception e) {
            logger.error("手动执行接口采集入库异常, taskId: " + id, e);
            return failed(e.getMessage() != null ? e.getMessage() : "执行出现异常");
        }
    }

    /**
     * 在线接口调试与样本提取
     */
    @PostMapping("/testRun")
    @ApiOperation("接口在线试运行与取样")
    public R<ApiTestRunResultDto> testRun(@RequestBody ApiTestRunDto dto) {
        try {
            ApiTestRunResultDto result = jobApiTaskService.debugSample(dto);
            return success(result);
        } catch (Exception e) {
            return failed("试运行出错: " + e.getMessage());
        }
    }

    /**
     * 在线单测前置脚本与控制台打印
     */
    @PostMapping("/testScript")
    @ApiOperation("在线单测前置脚本与控制台打印")
    public R<ApiScriptTestResultDto> testScript(@RequestBody ApiScriptTestDto dto) {
        try {
            ApiScriptTestResultDto result = jobApiTaskService.testScript(dto);
            return success(result);
        } catch (Exception e) {
            return failed("脚本执行出错: " + e.getMessage());
        }
    }

    /**
     * 分页查询接口任务执行历史流水记录
     */
    @GetMapping("/logList")
    @ApiOperation("分页获取接口任务执行历史日志")
    public R<Map<String, Object>> getApiTaskLogPage(
            @RequestParam Long taskId,
            @RequestParam(defaultValue = "1") int current,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) Integer logStatus,
            @RequestParam(required = false) String triggerType) {
        try {
            Map<String, Object> result = jobApiTaskService.getApiTaskLogPage(taskId, current, size, logStatus, triggerType);
            return success(result);
        } catch (Exception e) {
            return failed("查询执行历史记录失败: " + e.getMessage());
        }
    }

    /**
     * 增量抓取单次任务运行日志控制台输出
     */
    @GetMapping("/logDetailCat")
    @ApiOperation("增量抓取单次接口采集运行日志控制台输出")
    public R<Map<String, Object>> getApiTaskLogDetail(
            @RequestParam Long logId,
            @RequestParam(defaultValue = "1") int fromLineNum) {
        try {
            if (logId == null || logId <= 0) {
                return failed("无效的日志ID");
            }
            Map<String, Object> result = ApiTaskLogManager.readLog(logId, fromLineNum);
            return success(result);
        } catch (Exception e) {
            return failed("读取运行日志失败: " + e.getMessage());
        }
    }
}
