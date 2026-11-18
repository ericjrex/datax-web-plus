package com.wugui.datax.admin.controller;

import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datax.admin.dto.BatchCompareDto;
import com.wugui.datax.admin.dto.BatchCompareResultDto;
import com.wugui.datax.admin.dto.JobCompareItemDto;
import com.wugui.datax.admin.service.JobCompareService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;

/**
 * 任务数据量比对与对账控制器
 *
 * @author ypc
 */
@RestController
@RequestMapping("/api/job/compare")
@Api(tags = "任务数据量比对与对账控制器")
public class JobCompareController extends BaseController {

    @Autowired
    private JobCompareService jobCompareService;

    /**
     * 批量比对任务源库与目标库数据量并落盘
     *
     * @param dto 比对请求参数
     * @param request HTTP 请求对象
     * @return 批次对账汇总结果
     */
    @PostMapping("/batch")
    @ApiOperation("批量比对任务源库与目标库数据量并落盘")
    public ReturnT<BatchCompareResultDto> batchCompare(@RequestBody BatchCompareDto dto, HttpServletRequest request) {
        if (dto == null || dto.getJobIds() == null || dto.getJobIds().isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "请至少勾选一个需要比对的任务");
        }
        String username = resolveCurrentUsername(request);
        BatchCompareResultDto result = jobCompareService.batchCompare(dto, username);
        return new ReturnT<>(result);
    }

    /**
     * 获取指定任务列表的最近一次对账记录 (优先读库缓存，秒级返回)
     *
     * @param jobIds 任务ID列表
     * @return 对账记录
     */
    @PostMapping("/latest")
    @ApiOperation("获取指定任务列表的最近一次对账记录")
    public ReturnT<BatchCompareResultDto> getLatestCompare(@RequestBody List<Integer> jobIds) {
        if (jobIds == null || jobIds.isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }
        BatchCompareResultDto result = jobCompareService.getLatestCompare(jobIds);
        return new ReturnT<>(result);
    }

    /**
     * 根据批次流水号查询历史对账明细
     *
     * @param batchNo 批次流水号
     * @return 对账明细汇总
     */
    @GetMapping("/history")
    @ApiOperation("根据批次流水号查询历史对账明细")
    public ReturnT<BatchCompareResultDto> getHistory(@RequestParam("batchNo") String batchNo) {
        BatchCompareResultDto result = jobCompareService.getHistoryByBatchNo(batchNo);
        return new ReturnT<>(result);
    }

    /**
     * 单任务即时重测与比对
     *
     * @param jobId 任务ID
     * @param request HTTP 请求对象
     * @return 单任务对账结果
     */
    @PostMapping("/single/{jobId}")
    @ApiOperation("单任务即时重测与比对")
    public ReturnT<JobCompareItemDto> compareSingle(@PathVariable("jobId") Integer jobId, HttpServletRequest request) {
        if (jobId == null || jobId <= 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID不合法");
        }
        String username = resolveCurrentUsername(request);
        JobCompareItemDto result = jobCompareService.compareSingleJob(jobId, username);
        return new ReturnT<>(result);
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
