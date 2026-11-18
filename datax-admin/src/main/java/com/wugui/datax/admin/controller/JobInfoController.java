package com.wugui.datax.admin.controller;


import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datatx.core.util.DateUtil;
import com.wugui.datax.admin.core.cron.CronExpression;
import com.wugui.datax.admin.core.thread.JobTriggerPoolHelper;
import com.wugui.datax.admin.core.trigger.TriggerTypeEnum;
import com.wugui.datax.admin.core.util.I18nUtil;
import com.wugui.datax.admin.dto.BatchAddWithMappingDto;
import com.wugui.datax.admin.dto.BatchInitSyncDto;
import com.wugui.datax.admin.dto.BatchRollbackDto;
import com.wugui.datax.admin.dto.BatchSetIncrementDto;
import com.wugui.datax.admin.dto.BatchUpdateWriterDto;
import com.wugui.datax.admin.dto.CheckTargetTableResultDto;
import com.wugui.datax.admin.dto.DataXBatchJsonBuildDto;
import com.wugui.datax.admin.dto.TriggerJobDto;
import com.wugui.datax.admin.entity.JobInfo;
import com.wugui.datax.admin.service.JobService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * index controller
 *
 * @author xuxueli 2015-12-19 16:13:16
 */
@Api(tags = "任务配置接口")
@RestController
@RequestMapping("/api/job")
public class JobInfoController extends BaseController{

    @Resource
    private JobService jobService;


    @GetMapping("/pageList")
    @ApiOperation("任务列表")
    public ReturnT<Map<String, Object>> pageList(@RequestParam(required = false, defaultValue = "0") int current,
                                        @RequestParam(required = false, defaultValue = "10") int size,
                                        int jobGroup, int triggerStatus, String jobDesc, String glueType, Integer[] projectIds,
                                        @RequestParam(required = false) String updateTime,
                                        @RequestParam(required = false, value = "update_time") String updateTimeSnake) {

        String timeStr = (updateTime != null && !updateTime.trim().isEmpty()) ? updateTime : updateTimeSnake;
        Date parsedUpdateTime = parseDateSafely(timeStr);

        return new ReturnT<>(jobService.pageList((current-1)*size, size, jobGroup, triggerStatus, jobDesc, glueType, 0, projectIds, parsedUpdateTime));
    }

    @GetMapping("/list")
    @ApiOperation("全部任务列表")
    public ReturnT<List<JobInfo>> list(){
        return new ReturnT<>(jobService.list());
    }

    @PostMapping("/add")
    @ApiOperation("添加任务")
    public ReturnT<String> add(HttpServletRequest request, @RequestBody JobInfo jobInfo) {
        jobInfo.setUserId(getCurrentUserId(request));
        return jobService.add(jobInfo);
    }

    @PostMapping("/update")
    @ApiOperation("更新任务")
    public ReturnT<String> update(HttpServletRequest request,@RequestBody JobInfo jobInfo) {
        jobInfo.setUserId(getCurrentUserId(request));
        return jobService.update(jobInfo);
    }

    @PostMapping(value = "/remove/{id}")
    @ApiOperation("移除任务")
    public ReturnT<String> remove(@PathVariable(value = "id") int id) {
        return jobService.remove(id);
    }

    @RequestMapping(value = "/stop",method = RequestMethod.POST)
    @ApiOperation("停止任务")
    public ReturnT<String> pause(int id) {
        return jobService.stop(id);
    }

    @RequestMapping(value = "/start",method = RequestMethod.POST)
    @ApiOperation("开启任务")
    public ReturnT<String> start(int id) {
        return jobService.start(id);
    }

    @PostMapping(value = "/trigger")
    @ApiOperation("触发任务")
    public ReturnT<String> triggerJob(@RequestBody TriggerJobDto dto) {
        // force cover job param
        String executorParam=dto.getExecutorParam();
        if (executorParam == null) {
            executorParam = "";
        }
        JobTriggerPoolHelper.trigger(dto.getJobId(), TriggerTypeEnum.MANUAL, -1, null, executorParam);
        return ReturnT.SUCCESS;
    }

    @GetMapping("/nextTriggerTime")
    @ApiOperation("获取近5次触发时间")
    public ReturnT<List<String>> nextTriggerTime(String cron) {
        List<String> result = new ArrayList<>();
        try {
            CronExpression cronExpression = new CronExpression(cron);
            Date lastTime = new Date();
            for (int i = 0; i < 5; i++) {
                lastTime = cronExpression.getNextValidTimeAfter(lastTime);
                if (lastTime != null) {
                    result.add(DateUtil.formatDateTime(lastTime));
                } else {
                    break;
                }
            }
        } catch (ParseException e) {
            return new ReturnT<>(ReturnT.FAIL_CODE, I18nUtil.getString("jobinfo_field_cron_invalid"));
        }
        return new ReturnT<>(result);
    }

    @PostMapping("/batchAdd")
    @ApiOperation("批量创建任务")
    public ReturnT<String> batchAdd(@RequestBody DataXBatchJsonBuildDto dto) throws IOException {
        if (dto.getTemplateId() ==0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_choose") + I18nUtil.getString("jobinfo_field_temp")));
        }
        return jobService.batchAdd(dto);
    }

    @PostMapping("/batchAddWithMapping")
    @ApiOperation("带表与字段映射批量创建任务")
    public ReturnT<String> batchAddWithMapping(@RequestBody BatchAddWithMappingDto dto) throws IOException {
        if (dto.getTemplateId() == 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_choose") + I18nUtil.getString("jobinfo_field_temp")));
        }
        return jobService.batchAddWithMapping(dto);
    }

    @PostMapping(value = "/batchStart")
    @ApiOperation("批量开启任务调度")
    public ReturnT<String> batchStart(@RequestBody List<Integer> ids) {
        return jobService.batchStart(ids);
    }

    @PostMapping(value = "/batchStop")
    @ApiOperation("批量停止任务调度")
    public ReturnT<String> batchStop(@RequestBody List<Integer> ids) {
        return jobService.batchStop(ids);
    }

    @PostMapping(value = "/batchTrigger")
    @ApiOperation("批量触发任务立即执行")
    public ReturnT<String> batchTrigger(@RequestBody List<Integer> ids) {
        return jobService.batchTrigger(ids);
    }

    @PostMapping(value = "/batchRemove")
    @ApiOperation("批量删除任务")
    public ReturnT<String> batchRemove(@RequestBody List<Integer> ids) {
        return jobService.batchRemove(ids);
    }

    @PostMapping(value = "/batchUpdateWriter")
    @ApiOperation("批量调整任务的Writer连接信息")
    public ReturnT<String> batchUpdateWriter(@RequestBody BatchUpdateWriterDto dto) {
        return jobService.batchUpdateWriter(dto);
    }

    @PostMapping(value = "/checkTargetTables")
    @ApiOperation("检测所选任务的表在指定数据源是否存在及是否需建表（支持源库与目标库）")
    public ReturnT<List<CheckTargetTableResultDto>> checkTargetTables(@RequestParam("writerDatasourceId") Long writerDatasourceId,
                                                                      @RequestParam(value = "scope", required = false, defaultValue = "WRITER") String scope,
                                                                      @RequestBody List<Integer> jobIds) {
        return jobService.checkTargetTables(jobIds, writerDatasourceId, scope);
    }

    @PostMapping(value = "/copy/{id}")
    @ApiOperation("复制任务")
    public ReturnT<String> copy(@PathVariable(value = "id") int id) {
        return jobService.copy(id);
    }

    @PostMapping(value = "/copy")
    @ApiOperation("复制任务（参数传参）")
    public ReturnT<String> copyByParam(@RequestParam(value = "id") int id) {
        return jobService.copy(id);
    }

    @PostMapping(value = "/batchSetIncrement")
    @ApiOperation("批量将任务配置为方案1时间自增同步")
    public ReturnT<String> batchSetIncrement(@RequestBody BatchSetIncrementDto dto) {
        return jobService.batchSetIncrement(dto);
    }

    @PostMapping(value = "/batchInitAndSync")
    @ApiOperation("批量初始化目标表并全量同步")
    public ReturnT<String> batchInitAndSync(@RequestBody BatchInitSyncDto dto) {
        return jobService.batchInitAndSync(dto);
    }

    @PostMapping(value = "/rollbackIncrement")
    @ApiOperation("批量回溯增量时间并触发同步")
    public ReturnT<String> rollbackIncrement(@RequestBody BatchRollbackDto dto) {
        return jobService.rollbackIncrementAndSync(dto);
    }

    /**
     * 安全解析增量时间字符串为 Date 对象
     * 兼容标准格式、紧凑无空格格式(如2026-09-0708:28:19)、URL加号格式、带T复合格式以及毫秒/秒时间戳
     *
     * @param dateStr 时间字符串
     * @return 解析后的 Date 对象，解析失败或为空时返回 null
     */
    private Date parseDateSafely(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            return null;
        }
        String cleanStr = dateStr.trim();

        // 1. 如果是纯数字时间戳
        if (cleanStr.matches("^\\d{10,13}$")) {
            long ts = Long.parseLong(cleanStr);
            if (cleanStr.length() == 10) {
                ts *= 1000L;
            }
            return new Date(ts);
        }

        // 2. 规整带 T 或时区的复合 ISO 时间格式
        if (cleanStr.contains("T")) {
            String[] parts = cleanStr.split("T");
            String datePart = parts[0];
            String timePart = parts.length > 1 ? parts[1] : "00:00:00";
            if (timePart.contains(".")) {
                timePart = timePart.split("\\.")[0];
            }
            if (timePart.contains("+")) {
                timePart = timePart.split("\\+")[0];
            }
            timePart = timePart.replace("Z", "");
            cleanStr = datePart + " " + timePart;
        }

        // 3. 处理 URL 传输中未解码的加号 (如 2026-09-07+08:28:19)
        if (cleanStr.matches("^\\d{4}[-/]\\d{2}[-/]\\d{2}\\+\\d{2}:\\d{2}:\\d{2}.*$")) {
            cleanStr = cleanStr.replace("+", " ");
        }

        // 4. 智能修复日期与时间之间因 HTTP 传输丢失空格的粘连格式 (如 2026-09-0708:28:19 -> 2026-09-07 08:28:19)
        if (cleanStr.matches("^\\d{4}-\\d{2}-\\d{2}\\d{2}:\\d{2}:\\d{2}.*$")) {
            cleanStr = cleanStr.substring(0, 10) + " " + cleanStr.substring(10);
        } else if (cleanStr.matches("^\\d{4}/\\d{2}/\\d{2}\\d{2}:\\d{2}:\\d{2}.*$")) {
            cleanStr = cleanStr.substring(0, 10) + " " + cleanStr.substring(10);
        }

        // 5. 剥离可能附带的毫秒部分 (如 .000)
        if (cleanStr.contains(".")) {
            cleanStr = cleanStr.split("\\.")[0];
        }

        if (cleanStr.length() > 19) {
            cleanStr = cleanStr.substring(0, 19);
        }

        // 6. 多 Pattern 弹性容错匹配
        String[] patterns = new String[] {
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-ddHH:mm:ss",
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd",
            "yyyyMMddHHmmss",
            "yyyyMMdd",
            "yyyy/MM/dd HH:mm:ss",
            "yyyy/MM/ddHH:mm:ss",
            "yyyy/MM/dd"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(pattern);
                sdf.setLenient(false);
                return sdf.parse(cleanStr);
            } catch (Exception ignored) {
            }
        }
        return null;
    }
}

