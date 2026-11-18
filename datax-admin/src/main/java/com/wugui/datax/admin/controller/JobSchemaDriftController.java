package com.wugui.datax.admin.controller;

import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datax.admin.dto.ApplySchemaEvolutionDto;
import com.wugui.datax.admin.dto.BatchSchemaDriftDto;
import com.wugui.datax.admin.dto.BatchSchemaDriftResultDto;
import com.wugui.datax.admin.dto.SchemaDriftItemDto;
import com.wugui.datax.admin.entity.JobSchemaDriftLog;
import com.wugui.datax.admin.service.SchemaDriftService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;

/**
 * 元数据漂移探测与模式自适应演进控制器
 *
 * @author ypc
 */
@RestController
@RequestMapping("/api/job/drift")
@Api(tags = "元数据漂移探测与模式自适应演进控制器")
public class JobSchemaDriftController extends BaseController {

    @Autowired
    private SchemaDriftService schemaDriftService;

    /**
     * 批量并发检测元数据漂移
     *
     * @param dto 比对入参
     * @param request HTTP 请求
     * @return 批次汇总结果
     */
    @PostMapping("/batch")
    @ApiOperation("批量并发检测元数据漂移")
    public ReturnT<BatchSchemaDriftResultDto> batchDetect(@RequestBody BatchSchemaDriftDto dto, HttpServletRequest request) {
        if (dto == null || dto.getJobIds() == null || dto.getJobIds().isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "请至少勾选一个需要检测的任务");
        }
        String username = resolveCurrentUsername(request);
        BatchSchemaDriftResultDto result = schemaDriftService.batchDetect(dto, username);
        return new ReturnT<>(result);
    }

    /**
     * 单任务即时检测元数据漂移
     *
     * @param jobId 任务ID
     * @param request HTTP 请求
     * @return 单任务探测明细
     */
    @PostMapping("/single/{jobId}")
    @ApiOperation("单任务即时检测元数据漂移")
    public ReturnT<SchemaDriftItemDto> detectSingle(@PathVariable("jobId") Integer jobId, HttpServletRequest request) {
        if (jobId == null || jobId <= 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID不合法");
        }
        String username = resolveCurrentUsername(request);
        SchemaDriftItemDto result = schemaDriftService.detectSingleJob(jobId, username);
        return new ReturnT<>(result);
    }

    /**
     * 应用模式演进 (为目标端执行加列 DDL 并更新任务配置)
     *
     * @param dto 演进请求入参
     * @param request HTTP 请求
     * @return 执行结果
     */
    @PostMapping("/apply")
    @ApiOperation("应用模式演进(自动加列并更新任务配置)")
    public ReturnT<String> applyEvolution(@RequestBody ApplySchemaEvolutionDto dto, HttpServletRequest request) {
        if (dto == null || dto.getJobId() == null || dto.getJobId() <= 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID不合法");
        }
        String username = resolveCurrentUsername(request);
        return schemaDriftService.applyEvolution(dto, username);
    }

    /**
     * 一键版本回滚 (将任务配置回退至指定审计快照版本)
     *
     * @param logId 审计日志ID
     * @param request HTTP 请求
     * @return 回滚结果
     */
    @PostMapping("/rollback/{logId}")
    @ApiOperation("一键版本回滚至演进前快照")
    public ReturnT<String> rollbackEvolution(@PathVariable("logId") Long logId, HttpServletRequest request) {
        if (logId == null || logId <= 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "日志记录ID不合法");
        }
        String username = resolveCurrentUsername(request);
        return schemaDriftService.rollbackEvolution(logId, username);
    }

    /**
     * 获取指定任务的历史漂移与演进日志
     *
     * @param jobId 任务ID
     * @return 审计记录列表
     */
    @GetMapping("/history/{jobId}")
    @ApiOperation("获取指定任务的历史漂移与演进日志")
    public ReturnT<List<JobSchemaDriftLog>> getHistory(@PathVariable("jobId") Integer jobId) {
        if (jobId == null || jobId <= 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID不合法");
        }
        List<JobSchemaDriftLog> logs = schemaDriftService.getHistoryByJobId(jobId);
        return new ReturnT<>(logs);
    }

    /**
     * 获取指定任务列表的最新一次漂移记录
     *
     * @param jobIds 任务ID列表
     * @return 记录列表
     */
    @PostMapping("/latest")
    @ApiOperation("获取指定任务列表的最新一次漂移记录")
    public ReturnT<List<JobSchemaDriftLog>> getLatest(@RequestBody List<Integer> jobIds) {
        if (jobIds == null || jobIds.isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }
        List<JobSchemaDriftLog> logs = schemaDriftService.getLatestByJobIds(jobIds);
        return new ReturnT<>(logs);
    }

    /**
     * 解析当前登录人用户名公共方法
     */
    private String resolveCurrentUsername(HttpServletRequest request) {
        String username = "admin";
        try {
            Integer userId = getCurrentUserId(request);
            if (userId != null) {
                username = "USER_" + userId;
            }
        } catch (Exception ignored) {
        }
        return username;
    }
}
