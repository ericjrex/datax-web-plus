package com.wugui.datax.admin.service.impl;

import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datatx.core.enums.ExecutorBlockStrategyEnum;
import com.wugui.datatx.core.enums.IncrementTypeEnum;
import com.wugui.datatx.core.glue.GlueTypeEnum;
import com.wugui.datatx.core.util.DateUtil;
import com.wugui.datax.admin.core.cron.CronExpression;
import com.wugui.datax.admin.core.route.ExecutorRouteStrategyEnum;
import com.wugui.datax.admin.core.thread.JobScheduleHelper;
import com.wugui.datax.admin.core.thread.JobTriggerPoolHelper;
import com.wugui.datax.admin.core.trigger.TriggerTypeEnum;
import com.wugui.datax.admin.core.util.I18nUtil;
import com.wugui.datax.admin.dto.*;
import com.wugui.datax.admin.entity.JobGroup;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.parser.Feature;
import com.alibaba.fastjson.serializer.SerializerFeature;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.entity.JobInfo;
import com.wugui.datax.admin.entity.JobLogReport;
import com.wugui.datax.admin.entity.JobTemplate;
import com.wugui.datax.admin.mapper.*;
import com.wugui.datax.admin.service.*;
import com.wugui.datax.admin.tool.database.ColumnInfo;
import com.wugui.datax.admin.util.AESUtil;
import com.wugui.datax.admin.util.JSONUtils;
import com.wugui.datax.admin.util.DateFormatUtils;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.text.MessageFormat;
import java.text.ParseException;
import java.util.*;
import java.util.regex.Pattern;

/**
 * core job action for xxl-job
 *
 * @author xuxueli 2016-5-28 15:30:33
 */
@Service
public class JobServiceImpl implements JobService {
    private static Logger logger = LoggerFactory.getLogger(JobServiceImpl.class);

    @Resource
    private JobGroupMapper jobGroupMapper;
    @Resource
    private JobInfoMapper jobInfoMapper;
    @Resource
    private JobLogMapper jobLogMapper;
    @Resource
    private JobLogGlueMapper jobLogGlueMapper;
    @Resource
    private JobLogReportMapper jobLogReportMapper;
    @Resource
    private DatasourceQueryService datasourceQueryService;
    @Resource
    private JobTemplateMapper jobTemplateMapper;
    @Resource
    private DataxJsonService dataxJsonService;
    @Resource
    private TableMappingService tableMappingService;
    @Resource
    private JobDatasourceService jobJdbcDatasourceService;


    @Override
    public Map<String, Object> pageList(int start, int length, int jobGroup, int triggerStatus, String jobDesc, String glueType, int userId, Integer[] projectIds) {
        return pageList(start, length, jobGroup, triggerStatus, jobDesc, glueType, userId, projectIds, null);
    }

    @Override
    public Map<String, Object> pageList(int start, int length, int jobGroup, int triggerStatus, String jobDesc, String glueType, int userId, Integer[] projectIds, Date updateTime) {

        // page list with optional update_time incremental filter
        List<JobInfo> list = jobInfoMapper.pageList(start, length, jobGroup, triggerStatus, jobDesc, glueType, userId, projectIds, updateTime);
        int list_count = jobInfoMapper.pageListCount(start, length, jobGroup, triggerStatus, jobDesc, glueType, userId, projectIds, updateTime);

        // package result
        Map<String, Object> maps = new HashMap<>();
        maps.put("recordsTotal", list_count);        // 总记录数
        maps.put("recordsFiltered", list_count);    // 过滤后的总记录数
        maps.put("data", list);                    // 分页列表
        return maps;
    }

    public List<JobInfo> list() {
        return jobInfoMapper.findAll();
    }

    @Override
    public ReturnT<String> add(JobInfo jobInfo) {
        // valid
        JobGroup group = jobGroupMapper.load(jobInfo.getJobGroup());
        if (group == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_choose") + I18nUtil.getString("jobinfo_field_jobgroup")));
        }
        if (!CronExpression.isValidExpression(jobInfo.getJobCron())) {
            return new ReturnT<>(ReturnT.FAIL_CODE, I18nUtil.getString("jobinfo_field_cron_invalid"));
        }
        if (jobInfo.getGlueType().equals(GlueTypeEnum.BEAN.getDesc()) && jobInfo.getJobJson().trim().length() <= 2) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + I18nUtil.getString("jobinfo_field_jobjson")));
        }
        if (jobInfo.getJobDesc() == null || jobInfo.getJobDesc().trim().length() == 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + I18nUtil.getString("jobinfo_field_jobdesc")));
        }
        if (jobInfo.getUserId() == 0 ) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + I18nUtil.getString("jobinfo_field_author")));
        }
        if (ExecutorRouteStrategyEnum.match(jobInfo.getExecutorRouteStrategy(), null) == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_executorRouteStrategy") + I18nUtil.getString("system_invalid")));
        }
        if (ExecutorBlockStrategyEnum.match(jobInfo.getExecutorBlockStrategy(), null) == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_executorBlockStrategy") + I18nUtil.getString("system_invalid")));
        }
        if (GlueTypeEnum.match(jobInfo.getGlueType()) == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_gluetype") + I18nUtil.getString("system_invalid")));
        }
        if (GlueTypeEnum.BEAN == GlueTypeEnum.match(jobInfo.getGlueType()) && (jobInfo.getExecutorHandler() == null || jobInfo.getExecutorHandler().trim().length() == 0)) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + "JobHandler"));
        }


        if (StringUtils.isBlank(jobInfo.getReplaceParamType()) || !DateFormatUtils.formatList().contains(jobInfo.getReplaceParamType())) {
            jobInfo.setReplaceParamType(DateFormatUtils.TIMESTAMP);
        }

        // fix "\r" in shell
        if (GlueTypeEnum.GLUE_SHELL == GlueTypeEnum.match(jobInfo.getGlueType()) && jobInfo.getGlueSource() != null) {
            jobInfo.setGlueSource(jobInfo.getGlueSource().replaceAll("\r", ""));
        }

        // ChildJobId valid
        if (jobInfo.getChildJobId() != null && jobInfo.getChildJobId().trim().length() > 0) {
            String[] childJobIds = jobInfo.getChildJobId().split(",");
            for (String childJobIdItem : childJobIds) {
                if (StringUtils.isNotBlank(childJobIdItem) && isNumeric(childJobIdItem) && Integer.parseInt(childJobIdItem) > 0) {
                    JobInfo childJobInfo = jobInfoMapper.loadById(Integer.parseInt(childJobIdItem));
                    if (childJobInfo == null) {
                        return new ReturnT<String>(ReturnT.FAIL_CODE,
                                MessageFormat.format((I18nUtil.getString("jobinfo_field_childJobId") + "({0})" + I18nUtil.getString("system_not_found")), childJobIdItem));
                    }
                } else {
                    return new ReturnT<String>(ReturnT.FAIL_CODE,
                            MessageFormat.format((I18nUtil.getString("jobinfo_field_childJobId") + "({0})" + I18nUtil.getString("system_invalid")), childJobIdItem));
                }
            }

            // join , avoid "xxx,,"
            String temp = "";
            for (String item : childJobIds) {
                temp += item + ",";
            }
            temp = temp.substring(0, temp.length() - 1);

            jobInfo.setChildJobId(temp);
        }

        // add in db
        jobInfo.setAddTime(new Date());
        if (GlueTypeEnum.BEAN.getDesc().equals(jobInfo.getGlueType()) && StringUtils.isNotBlank(jobInfo.getJobJson())) {
            // 保存任务配置时将数据库账密加密，若已是密文则直接保留无需再加密
            jobInfo.setJobJson(JSONUtils.encryptJobJson(jobInfo.getJobJson()));
        } else {
            jobInfo.setJobJson(jobInfo.getJobJson());
        }
        jobInfo.setUpdateTime(new Date());
        jobInfo.setGlueUpdatetime(new Date());
        jobInfoMapper.save(jobInfo);
        if (jobInfo.getId() < 1) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_add") + I18nUtil.getString("system_fail")));
        }

        return new ReturnT<>(String.valueOf(jobInfo.getId()));
    }

    private boolean isNumeric(String str) {
        try {
            Integer.valueOf(str);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    @Override
    public ReturnT<String> update(JobInfo jobInfo) {

        // valid
        if (!CronExpression.isValidExpression(jobInfo.getJobCron())) {
            return new ReturnT<>(ReturnT.FAIL_CODE, I18nUtil.getString("jobinfo_field_cron_invalid"));
        }
        if (jobInfo.getGlueType().equals(GlueTypeEnum.BEAN.getDesc()) && jobInfo.getJobJson().trim().length() <= 2) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + I18nUtil.getString("jobinfo_field_jobjson")));
        }
        if (jobInfo.getJobDesc() == null || jobInfo.getJobDesc().trim().length() == 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + I18nUtil.getString("jobinfo_field_jobdesc")));
        }

        if (jobInfo.getProjectId() == 0) {
            return new ReturnT<String>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + I18nUtil.getString("jobinfo_field_jobproject")));
        }
        if (jobInfo.getUserId() == 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("system_please_input") + I18nUtil.getString("jobinfo_field_author")));
        }
        if (ExecutorRouteStrategyEnum.match(jobInfo.getExecutorRouteStrategy(), null) == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_executorRouteStrategy") + I18nUtil.getString("system_invalid")));
        }
        if (ExecutorBlockStrategyEnum.match(jobInfo.getExecutorBlockStrategy(), null) == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_executorBlockStrategy") + I18nUtil.getString("system_invalid")));
        }

        // ChildJobId valid
        if (jobInfo.getChildJobId() != null && jobInfo.getChildJobId().trim().length() > 0) {
            String[] childJobIds = jobInfo.getChildJobId().split(",");
            for (String childJobIdItem : childJobIds) {
                if (childJobIdItem != null && childJobIdItem.trim().length() > 0 && isNumeric(childJobIdItem)) {
                    JobInfo childJobInfo = jobInfoMapper.loadById(Integer.parseInt(childJobIdItem));
                    if (childJobInfo == null) {
                        return new ReturnT<String>(ReturnT.FAIL_CODE,
                                MessageFormat.format((I18nUtil.getString("jobinfo_field_childJobId") + "({0})" + I18nUtil.getString("system_not_found")), childJobIdItem));
                    }
                } else {
                    return new ReturnT<String>(ReturnT.FAIL_CODE,
                            MessageFormat.format((I18nUtil.getString("jobinfo_field_childJobId") + "({0})" + I18nUtil.getString("system_invalid")), childJobIdItem));
                }
            }

            // join , avoid "xxx,,"
            String temp = "";
            for (String item : childJobIds) {
                temp += item + ",";
            }
            temp = temp.substring(0, temp.length() - 1);

            jobInfo.setChildJobId(temp);
        }

        // group valid
        JobGroup jobGroup = jobGroupMapper.load(jobInfo.getJobGroup());
        if (jobGroup == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_jobgroup") + I18nUtil.getString("system_invalid")));
        }

        // stage job info
        JobInfo exists_jobInfo = jobInfoMapper.loadById(jobInfo.getId());
        if (exists_jobInfo == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_id") + I18nUtil.getString("system_not_found")));
        }

        // next trigger time (5s后生效，避开预读周期)
        long nextTriggerTime = exists_jobInfo.getTriggerNextTime();
        if (exists_jobInfo.getTriggerStatus() == 1 && !jobInfo.getJobCron().equals(exists_jobInfo.getJobCron())) {
            try {
                Date nextValidTime = new CronExpression(jobInfo.getJobCron()).getNextValidTimeAfter(new Date(System.currentTimeMillis() + JobScheduleHelper.PRE_READ_MS));
                if (nextValidTime == null) {
                    return new ReturnT<String>(ReturnT.FAIL_CODE, I18nUtil.getString("jobinfo_field_cron_never_fire"));
                }
                nextTriggerTime = nextValidTime.getTime();
            } catch (ParseException e) {
                logger.error(e.getMessage(), e);
                return new ReturnT<String>(ReturnT.FAIL_CODE, I18nUtil.getString("jobinfo_field_cron_invalid") + " | " + e.getMessage());
            }
        }

        BeanUtils.copyProperties(jobInfo, exists_jobInfo);
        if (StringUtils.isBlank(jobInfo.getReplaceParamType())) {
            jobInfo.setReplaceParamType(DateFormatUtils.TIMESTAMP);
        }
        exists_jobInfo.setTriggerNextTime(nextTriggerTime);
        exists_jobInfo.setUpdateTime(new Date());

        if (GlueTypeEnum.BEAN.getDesc().equals(jobInfo.getGlueType())) {
            // 更新任务配置时将数据库账密加密，若已是密文则直接保留无需再加密
            exists_jobInfo.setJobJson(JSONUtils.encryptJobJson(jobInfo.getJobJson()));
            exists_jobInfo.setGlueSource(null);
        } else {
            exists_jobInfo.setGlueSource(jobInfo.getGlueSource());
            exists_jobInfo.setJobJson(null);
        }
        exists_jobInfo.setGlueUpdatetime(new Date());
        jobInfoMapper.update(exists_jobInfo);


        return ReturnT.SUCCESS;
    }

    @Override
    public ReturnT<String> remove(int id) {
        JobInfo xxlJobInfo = jobInfoMapper.loadById(id);
        if (xxlJobInfo == null) {
            return ReturnT.SUCCESS;
        }

        jobInfoMapper.delete(id);
        jobLogMapper.delete(id);
        jobLogGlueMapper.deleteByJobId(id);
        return ReturnT.SUCCESS;
    }

    @Override
    public ReturnT<String> start(int id) {
        JobInfo xxlJobInfo = jobInfoMapper.loadById(id);

        // next trigger time (5s后生效，避开预读周期)
        long nextTriggerTime = 0;
        try {
            Date nextValidTime = new CronExpression(xxlJobInfo.getJobCron()).getNextValidTimeAfter(new Date(System.currentTimeMillis() + JobScheduleHelper.PRE_READ_MS));
            if (nextValidTime == null) {
                return new ReturnT<String>(ReturnT.FAIL_CODE, I18nUtil.getString("jobinfo_field_cron_never_fire"));
            }
            nextTriggerTime = nextValidTime.getTime();
        } catch (ParseException e) {
            logger.error(e.getMessage(), e);
            return new ReturnT<String>(ReturnT.FAIL_CODE, I18nUtil.getString("jobinfo_field_cron_invalid") + " | " + e.getMessage());
        }

        xxlJobInfo.setTriggerStatus(1);
        xxlJobInfo.setTriggerLastTime(0);
        xxlJobInfo.setTriggerNextTime(nextTriggerTime);

        xxlJobInfo.setUpdateTime(new Date());
        jobInfoMapper.update(xxlJobInfo);
        return ReturnT.SUCCESS;
    }

    @Override
    public ReturnT<String> stop(int id) {
        JobInfo jobInfo = jobInfoMapper.loadById(id);

        jobInfo.setTriggerStatus(0);
        jobInfo.setTriggerLastTime(0);
        jobInfo.setTriggerNextTime(0);

        jobInfo.setUpdateTime(new Date());
        jobInfoMapper.update(jobInfo);
        return ReturnT.SUCCESS;
    }

    @Override
    public Map<String, Object> dashboardInfo() {

        int jobInfoCount = jobInfoMapper.findAllCount();
        int jobLogCount = 0;
        int jobLogSuccessCount = 0;
        JobLogReport jobLogReport = jobLogReportMapper.queryLogReportTotal();
        if (jobLogReport != null) {
            jobLogCount = jobLogReport.getRunningCount() + jobLogReport.getSucCount() + jobLogReport.getFailCount();
            jobLogSuccessCount = jobLogReport.getSucCount();
        }

        // executor count
        Set<String> executorAddressSet = new HashSet<>();
        List<JobGroup> groupList = jobGroupMapper.findAll();

        if (groupList != null && !groupList.isEmpty()) {
            for (JobGroup group : groupList) {
                if (group.getRegistryList() != null && !group.getRegistryList().isEmpty()) {
                    executorAddressSet.addAll(group.getRegistryList());
                }
            }
        }

        int executorCount = executorAddressSet.size();

        Map<String, Object> dashboardMap = new HashMap<>();
        dashboardMap.put("jobInfoCount", jobInfoCount);
        dashboardMap.put("jobLogCount", jobLogCount);
        dashboardMap.put("jobLogSuccessCount", jobLogSuccessCount);
        dashboardMap.put("executorCount", executorCount);
        return dashboardMap;
    }

    @Override
    public ReturnT<Map<String, Object>> chartInfo() {
        // process
        List<String> triggerDayList = new ArrayList<String>();
        List<Integer> triggerDayCountRunningList = new ArrayList<Integer>();
        List<Integer> triggerDayCountSucList = new ArrayList<Integer>();
        List<Integer> triggerDayCountFailList = new ArrayList<Integer>();
        int triggerCountRunningTotal = 0;
        int triggerCountSucTotal = 0;
        int triggerCountFailTotal = 0;

        List<JobLogReport> logReportList = jobLogReportMapper.queryLogReport(DateUtil.addDays(new Date(), -7), new Date());

        if (logReportList != null && logReportList.size() > 0) {
            for (JobLogReport item : logReportList) {
                String day = DateUtil.formatDate(item.getTriggerDay());
                int triggerDayCountRunning = item.getRunningCount();
                int triggerDayCountSuc = item.getSucCount();
                int triggerDayCountFail = item.getFailCount();

                triggerDayList.add(day);
                triggerDayCountRunningList.add(triggerDayCountRunning);
                triggerDayCountSucList.add(triggerDayCountSuc);
                triggerDayCountFailList.add(triggerDayCountFail);

                triggerCountRunningTotal += triggerDayCountRunning;
                triggerCountSucTotal += triggerDayCountSuc;
                triggerCountFailTotal += triggerDayCountFail;
            }
        } else {
            for (int i = -6; i <= 0; i++) {
                triggerDayList.add(DateUtil.formatDate(DateUtil.addDays(new Date(), i)));
                triggerDayCountRunningList.add(0);
                triggerDayCountSucList.add(0);
                triggerDayCountFailList.add(0);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("triggerDayList", triggerDayList);
        result.put("triggerDayCountRunningList", triggerDayCountRunningList);
        result.put("triggerDayCountSucList", triggerDayCountSucList);
        result.put("triggerDayCountFailList", triggerDayCountFailList);

        result.put("triggerCountRunningTotal", triggerCountRunningTotal);
        result.put("triggerCountSucTotal", triggerCountSucTotal);
        result.put("triggerCountFailTotal", triggerCountFailTotal);

        return new ReturnT<>(result);
    }


    @Override
    public ReturnT<String> batchAdd(DataXBatchJsonBuildDto dto) throws IOException {

        String key = "system_please_choose";
        List<String> rdTables = dto.getReaderTables();
        List<String> wrTables = dto.getWriterTables();
        if (dto.getReaderDatasourceId() == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, I18nUtil.getString(key) + I18nUtil.getString("jobinfo_field_readerDataSource"));
        }
        if (dto.getWriterDatasourceId() == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, I18nUtil.getString(key) + I18nUtil.getString("jobinfo_field_writerDataSource"));
        }
        if (rdTables.size() != wrTables.size()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, I18nUtil.getString("json_build_inconsistent_number_r_w_tables"));
        }

        DataXJsonBuildDto jsonBuild = new DataXJsonBuildDto();

        List<String> rColumns;
        List<String> wColumns;
        for (int i = 0; i < rdTables.size(); i++) {
            String rTable = rdTables.get(i);
            String wTable = wrTables.get(i);

            // 检查目标库表是否存在，若不存在则根据源表元数据自动推导建表 DDL 并执行建表
            try {
                tableMappingService.autoCreateTargetTable(dto.getReaderDatasourceId(), rTable, dto.getWriterDatasourceId(), wTable);
            } catch (Exception e) {
                logger.error("自动建表失败: table={}, error={}", wTable, e.getMessage(), e);
                return new ReturnT<>(ReturnT.FAIL_CODE, "目标表 [" + wTable + "] 自动建表失败: " + e.getMessage());
            }

            rColumns = datasourceQueryService.getColumns(dto.getReaderDatasourceId(), rTable);
            wColumns = datasourceQueryService.getColumns(dto.getWriterDatasourceId(), wTable);

            jsonBuild.setReaderDatasourceId(dto.getReaderDatasourceId());
            jsonBuild.setWriterDatasourceId(dto.getWriterDatasourceId());

            jsonBuild.setReaderColumns(rColumns);
            jsonBuild.setWriterColumns(wColumns);

            jsonBuild.setRdbmsReader(dto.getRdbmsReader());
            jsonBuild.setRdbmsWriter(dto.getRdbmsWriter());

            List<String> rdTable = new ArrayList<>();
            rdTable.add(rdTables.get(i));
            jsonBuild.setReaderTables(rdTable);

            List<String> wdTable = new ArrayList<>();
            wdTable.add(wrTables.get(i));
            jsonBuild.setWriterTables(wdTable);

            String json = dataxJsonService.buildJobJson(jsonBuild);

            JobTemplate jobTemplate = jobTemplateMapper.loadById(dto.getTemplateId());
            JobInfo jobInfo = new JobInfo();
            BeanUtils.copyProperties(jobTemplate, jobInfo);
            if (Boolean.TRUE.equals(dto.getIsIncrement())) {
                // 开启方案1时间增量同步
                jobInfo.setJobJson(applyTimeIncrementConfig(jobInfo, json, dto.getTimeColumn(), dto.getIncStartTime(), dto.getWriteMode()));
            } else {
                // 批量创建任务保存时对账密统一加密
                jobInfo.setJobJson(JSONUtils.encryptJobJson(json));
            }
            String finalJobDesc = resolveJobDesc(
                    rdTables.get(i),
                    wrTables.get(i),
                    dto.getJobNamePrefix(),
                    dto.getJobNameSuffix(),
                    dto.getJobNameRule(),
                    rdTables.get(i)
            );
            jobInfo.setJobDesc(finalJobDesc);
            jobInfo.setAddTime(new Date());
            jobInfo.setUpdateTime(new Date());
            jobInfo.setGlueUpdatetime(new Date());
            jobInfoMapper.save(jobInfo);
        }
        return ReturnT.SUCCESS;
    }

    @Override
    public ReturnT<String> batchAddWithMapping(BatchAddWithMappingDto dto) throws IOException {
        if (dto == null || dto.getTableMappings() == null || dto.getTableMappings().isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "表映射配置列表不能为空");
        }
        if (dto.getReaderDatasourceId() == null || dto.getWriterDatasourceId() == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "源数据源或目标数据源不能为空");
        }
        if (dto.getTemplateId() == 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, I18nUtil.getString("system_please_choose") + I18nUtil.getString("jobinfo_field_temp"));
        }

        JobTemplate jobTemplate = jobTemplateMapper.loadById(dto.getTemplateId());
        if (jobTemplate == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "所选任务模板不存在");
        }

        for (TableMappingDto mapping : dto.getTableMappings()) {
            if (StringUtils.isBlank(mapping.getReaderTable()) || StringUtils.isBlank(mapping.getWriterTable())) {
                continue;
            }

            // 若开启自动建表且目标表尚未创建且包含 DDL
            if (Boolean.TRUE.equals(dto.getAutoCreateTable())
                    && !Boolean.TRUE.equals(mapping.getTargetTableExists())
                    && StringUtils.isNotBlank(mapping.getCreateTableSql())) {
                try {
                    tableMappingService.executeDDL(dto.getWriterDatasourceId(), mapping.getCreateTableSql());
                } catch (Exception e) {
                    logger.error("自动建表失败: table={}, error={}", mapping.getWriterTable(), e.getMessage());
                    return new ReturnT<>(ReturnT.FAIL_CODE, "目标表 [" + mapping.getWriterTable() + "] 自动建表失败: " + e.getMessage());
                }
            }

            // 组装 readerColumns 与 writerColumns
            List<String> rCols = new ArrayList<>();
            List<String> wCols = new ArrayList<>();
            if (mapping.getColumns() != null) {
                for (ColumnMappingDto col : mapping.getColumns()) {
                    if (Boolean.TRUE.equals(col.getIsIgnored())) {
                        continue;
                    }
                    if (StringUtils.isNotBlank(col.getReaderColumn()) && StringUtils.isNotBlank(col.getWriterColumn())) {
                        rCols.add(col.getReaderColumn());
                        wCols.add(col.getWriterColumn());
                    }
                }
            }

            if (rCols.isEmpty() || wCols.isEmpty()) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "表 [" + mapping.getReaderTable() + "] 没有有效的字段映射");
            }

            DataXJsonBuildDto jsonBuild = new DataXJsonBuildDto();
            jsonBuild.setReaderDatasourceId(dto.getReaderDatasourceId());
            jsonBuild.setWriterDatasourceId(dto.getWriterDatasourceId());
            jsonBuild.setReaderColumns(rCols);
            jsonBuild.setWriterColumns(wCols);
            jsonBuild.setRdbmsReader(dto.getRdbmsReader());
            jsonBuild.setRdbmsWriter(dto.getRdbmsWriter());

            List<String> rdTable = new ArrayList<>();
            rdTable.add(mapping.getReaderTable());
            jsonBuild.setReaderTables(rdTable);

            List<String> wdTable = new ArrayList<>();
            wdTable.add(mapping.getWriterTable());
            jsonBuild.setWriterTables(wdTable);

            String json = dataxJsonService.buildJobJson(jsonBuild);

            JobInfo jobInfo = new JobInfo();
            BeanUtils.copyProperties(jobTemplate, jobInfo);
            if (Boolean.TRUE.equals(dto.getIsIncrement())) {
                // 开启方案1时间增量同步
                jobInfo.setJobJson(applyTimeIncrementConfig(jobInfo, json, dto.getTimeColumn(), dto.getIncStartTime(), dto.getWriteMode()));
            } else {
                // 带映射批量创建任务保存时对账密统一加密
                jobInfo.setJobJson(JSONUtils.encryptJobJson(json));
            }
            String defaultMappingDesc = mapping.getReaderTable() + " -> " + mapping.getWriterTable();
            String finalJobDesc = resolveJobDesc(
                    mapping.getReaderTable(),
                    mapping.getWriterTable(),
                    dto.getJobNamePrefix(),
                    dto.getJobNameSuffix(),
                    dto.getJobNameRule(),
                    defaultMappingDesc
            );
            jobInfo.setJobDesc(finalJobDesc);
            jobInfo.setAddTime(new Date());
            jobInfo.setUpdateTime(new Date());
            jobInfo.setGlueUpdatetime(new Date());
            jobInfoMapper.save(jobInfo);
        }
        return ReturnT.SUCCESS;
    }

    /**
     * 根据个性化配置解析生成最终任务名称（jobDesc）
     * 支持任务名前后缀、命名基准规则（源表名、目标表名、源表->目标表）及防超长安全截断
     *
     * @param readerTable 源端表名
     * @param writerTable 目标端表名
     * @param prefix      任务名称个性化前缀
     * @param suffix      任务名称个性化词缀
     * @param rule        任务名称命名基准规则 (READER_TABLE, WRITER_TABLE, READER_TO_WRITER)
     * @param defaultName 兜底默认任务名称
     * @return 解析后的任务名称
     */
    private String resolveJobDesc(String readerTable, String writerTable, String prefix, String suffix, String rule, String defaultName) {
        String baseName;
        if ("WRITER_TABLE".equalsIgnoreCase(rule)) {
            baseName = StringUtils.isNotBlank(writerTable) ? writerTable : readerTable;
        } else if ("READER_TO_WRITER".equalsIgnoreCase(rule)) {
            baseName = readerTable + " -> " + (StringUtils.isNotBlank(writerTable) ? writerTable : readerTable);
        } else if ("READER_TABLE".equalsIgnoreCase(rule)) {
            baseName = StringUtils.isNotBlank(readerTable) ? readerTable : defaultName;
        } else {
            // 未指定命名基准时，保持默认行为
            baseName = defaultName;
        }

        StringBuilder sb = new StringBuilder();
        if (StringUtils.isNotBlank(prefix)) {
            sb.append(prefix.trim());
        }
        sb.append(baseName != null ? baseName : "");
        if (StringUtils.isNotBlank(suffix)) {
            sb.append(suffix.trim());
        }

        String finalJobDesc = sb.toString();
        // 安全防护：防止任务名称过长超出数据库字段限制（MySQL job_desc 一般为 varchar(255)）
        int maxLength = 250;
        if (finalJobDesc.length() > maxLength) {
            logger.warn("任务名称过长进行安全截断: 原名称长度={}, 截断长度={}", finalJobDesc.length(), maxLength);
            finalJobDesc = finalJobDesc.substring(0, maxLength);
        }
        return finalJobDesc;
    }

    @Override
    public ReturnT<String> batchStart(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }
        int successCount = 0;
        for (Integer id : ids) {
            if (id != null) {
                ReturnT<String> res = start(id);
                if (res.getCode() == ReturnT.SUCCESS_CODE) {
                    successCount++;
                }
            }
        }
        return new ReturnT<>("成功开启 " + successCount + " 个任务调度");
    }

    @Override
    public ReturnT<String> batchStop(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }
        int successCount = 0;
        for (Integer id : ids) {
            if (id != null) {
                ReturnT<String> res = stop(id);
                if (res.getCode() == ReturnT.SUCCESS_CODE) {
                    successCount++;
                }
            }
        }
        return new ReturnT<>("成功停止 " + successCount + " 个任务调度");
    }

    @Override
    public ReturnT<String> batchTrigger(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }
        int successCount = 0;
        for (Integer id : ids) {
            if (id != null) {
                JobTriggerPoolHelper.trigger(id, TriggerTypeEnum.MANUAL, -1, null, "");
                successCount++;
            }
        }
        return new ReturnT<>("成功触发 " + successCount + " 个任务立即执行");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ReturnT<String> batchRemove(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }
        int successCount = 0;
        for (Integer id : ids) {
            if (id != null) {
                ReturnT<String> res = remove(id);
                if (res.getCode() == ReturnT.SUCCESS_CODE) {
                    successCount++;
                }
            }
        }
        return new ReturnT<>("成功删除 " + successCount + " 个任务");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ReturnT<String> batchUpdateWriter(BatchUpdateWriterDto dto) {
        if (dto == null || dto.getJobIds() == null || dto.getJobIds().isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }

        String scope = StringUtils.isNotBlank(dto.getUpdateScope()) ? dto.getUpdateScope().trim().toUpperCase() : "WRITER";
        boolean updateWriter = "WRITER".equals(scope) || "BOTH".equals(scope);
        boolean updateReader = "READER".equals(scope) || "BOTH".equals(scope);

        Long datasourceId = dto.getWriterDatasourceId();
        if (datasourceId == null || datasourceId <= 0) {
            datasourceId = dto.getReaderDatasourceId();
        }
        boolean hasDatasource = datasourceId != null && datasourceId > 0;
        boolean hasPattern = StringUtils.isNotBlank(dto.getOldJdbcUrlPattern()) || StringUtils.isNotBlank(dto.getNewJdbcUrl());
        boolean hasCredential = StringUtils.isNotBlank(dto.getNewUsername()) || StringUtils.isNotBlank(dto.getNewPassword());
        boolean hasConnectionUpdate = hasDatasource || hasPattern || hasCredential;

        boolean hasJobConfigUpdate = StringUtils.isNotBlank(dto.getExecutorRouteStrategy())
                || StringUtils.isNotBlank(dto.getJobCron())
                || StringUtils.isNotBlank(dto.getExecutorBlockStrategy())
                || dto.getAlarmEmail() != null
                || StringUtils.isNotBlank(dto.getGlueType())
                || dto.getExecutorFailRetryCount() != null
                || dto.getExecutorTimeout() != null;

        if (!hasConnectionUpdate && !hasJobConfigUpdate) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "请至少指定数据源、配置连接替换规则或配置待调整的调度属性");
        }

        // 全局入参安全性与合法性校验
        if (StringUtils.isNotBlank(dto.getJobCron())) {
            String cron = dto.getJobCron().trim();
            if (!CronExpression.isValidExpression(cron)) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "CRON表达式格式无效: " + cron);
            }
            try {
                Date nextValidTime = new CronExpression(cron).getNextValidTimeAfter(
                        new Date(System.currentTimeMillis() + JobScheduleHelper.PRE_READ_MS));
                if (nextValidTime == null) {
                    return new ReturnT<>(ReturnT.FAIL_CODE, "CRON表达式未来无法触发调度: " + cron);
                }
            } catch (Exception e) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "CRON表达式解析异常: " + e.getMessage());
            }
        }

        if (StringUtils.isNotBlank(dto.getExecutorRouteStrategy())) {
            if (ExecutorRouteStrategyEnum.match(dto.getExecutorRouteStrategy().trim(), null) == null) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "无效的执行器路由策略: " + dto.getExecutorRouteStrategy());
            }
        }

        if (StringUtils.isNotBlank(dto.getExecutorBlockStrategy())) {
            if (ExecutorBlockStrategyEnum.match(dto.getExecutorBlockStrategy().trim(), null) == null) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "无效的阻塞处理策略: " + dto.getExecutorBlockStrategy());
            }
        }

        if (StringUtils.isNotBlank(dto.getGlueType())) {
            if (GlueTypeEnum.match(dto.getGlueType().trim()) == null) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "无效的任务类型: " + dto.getGlueType());
            }
        }

        if (dto.getExecutorFailRetryCount() != null) {
            if (dto.getExecutorFailRetryCount() < 0 || dto.getExecutorFailRetryCount() > 20) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "失败重试次数范围需在 0 到 20 之间");
            }
        }

        if (dto.getExecutorTimeout() != null) {
            if (dto.getExecutorTimeout() < 0 || dto.getExecutorTimeout() > 1440) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "任务超时时间范围需在 0 到 1440 分钟之间");
            }
        }

        JobDatasource targetDs = null;
        if (hasDatasource) {
            targetDs = jobJdbcDatasourceService.getById(datasourceId);
            if (targetDs == null) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "指定的数据源不存在 (ID: " + datasourceId + ")");
            }
        }

        int successCount = 0;
        int failCount = 0;
        int autoCreatedCount = 0;
        List<String> failDetails = new ArrayList<>();

        // 若勾选了自动建表且包含目标库修改且指定了数据源，在目标库执行自动建表
        if (hasConnectionUpdate && updateWriter && Boolean.TRUE.equals(dto.getAutoCreateTable()) && targetDs != null) {
            Set<String> createdTables = new HashSet<>();
            for (Integer jobId : dto.getJobIds()) {
                if (jobId == null) {
                    continue;
                }
                JobInfo jobInfo = jobInfoMapper.loadById(jobId);
                if (jobInfo == null || StringUtils.isBlank(jobInfo.getJobJson())) {
                    continue;
                }
                try {
                    JSONObject jobRoot = JSON.parseObject(jobInfo.getJobJson(), Feature.OrderedField);
                    String writerTable = extractWriterTable(jobRoot);
                    if (StringUtils.isBlank(writerTable) || createdTables.contains(writerTable.toLowerCase())) {
                        continue;
                    }
                    boolean exists = false;
                    try {
                        exists = datasourceQueryService.checkTableExists(datasourceId, writerTable);
                    } catch (Exception e) {
                        exists = false;
                    }
                    if (!exists) {
                        String readerTable = extractReaderTable(jobRoot);
                        String readerJdbcUrl = extractReaderJdbcUrl(jobRoot);
                        String ddl = buildTargetTableDDL(jobRoot, readerTable, writerTable, readerJdbcUrl, datasourceId);
                        if (StringUtils.isNotBlank(ddl)) {
                            tableMappingService.executeDDL(datasourceId, ddl);
                            createdTables.add(writerTable.toLowerCase());
                            autoCreatedCount++;
                            logger.info("自动建表成功: 目标表 [{}] 已在目标数据源 (ID: {}) 中创建", writerTable, datasourceId);
                        }
                    }
                } catch (Exception e) {
                    logger.warn("任务 ID {} 自动建表跳过或失败: {}", jobId, e.getMessage());
                }
            }
        }

        for (Integer jobId : dto.getJobIds()) {
            if (jobId == null) {
                continue;
            }
            JobInfo jobInfo = jobInfoMapper.loadById(jobId);
            if (jobInfo == null) {
                failCount++;
                failDetails.add("任务 ID " + jobId + " 不存在");
                continue;
            }

            boolean modified = false;

            // 1. 若包含连接更新
            if (hasConnectionUpdate) {
                if (StringUtils.isBlank(jobInfo.getJobJson())) {
                    failCount++;
                    failDetails.add("任务 ID " + jobId + " 配置 JSON 为空");
                    continue;
                }
                try {
                    boolean connModified = updateSingleJobConnection(jobInfo, targetDs, dto, updateReader, updateWriter);
                    if (connModified) {
                        modified = true;
                    }
                } catch (Exception e) {
                    logger.error("更新任务 ID {} 连接信息失败: {}", jobId, e.getMessage(), e);
                    failCount++;
                    failDetails.add("任务 ID " + jobId + " 连接更新异常: " + e.getMessage());
                    continue;
                }
            }

            // 2. 若包含调度运行属性更新
            if (hasJobConfigUpdate) {
                try {
                    boolean propModified = applyJobConfigUpdates(jobInfo, dto);
                    if (propModified) {
                        modified = true;
                    }
                } catch (Exception e) {
                    logger.error("更新任务 ID {} 调度属性失败: {}", jobId, e.getMessage(), e);
                    failCount++;
                    failDetails.add("任务 ID " + jobId + " 调度属性更新异常: " + e.getMessage());
                    continue;
                }
            }

            if (modified) {
                jobInfo.setUpdateTime(new Date());
                jobInfoMapper.update(jobInfo);
                successCount++;
            } else {
                failCount++;
                failDetails.add("任务 ID " + jobId + " 未匹配到可更新的配置或属性未发生改变");
            }
        }

        StringBuilder msg = new StringBuilder("批量调整完成：成功更新 ").append(successCount).append(" 个任务");
        List<String> changeTypes = new ArrayList<>();
        if (hasConnectionUpdate) {
            String scopeLabel = "BOTH".equals(scope) ? "源库与目标库" : ("READER".equals(scope) ? "源库 (Reader)" : "目标库 (Writer)");
            changeTypes.add("连接置换[" + scopeLabel + "]");
        }
        if (hasJobConfigUpdate) {
            List<String> propNames = new ArrayList<>();
            if (StringUtils.isNotBlank(dto.getExecutorRouteStrategy())) propNames.add("路由策略");
            if (StringUtils.isNotBlank(dto.getJobCron())) propNames.add("CRON");
            if (StringUtils.isNotBlank(dto.getExecutorBlockStrategy())) propNames.add("阻塞处理");
            if (dto.getAlarmEmail() != null) propNames.add("报警邮件");
            if (StringUtils.isNotBlank(dto.getGlueType())) propNames.add("任务类型");
            if (dto.getExecutorFailRetryCount() != null) propNames.add("重试次数");
            if (dto.getExecutorTimeout() != null) propNames.add("超时时间");
            changeTypes.add("调度属性[" + String.join(",", propNames) + "]");
        }
        if (!changeTypes.isEmpty()) {
            msg.append("（涉及：").append(String.join(" + ", changeTypes)).append("）");
        }
        if (autoCreatedCount > 0) {
            msg.append("，已自动在目标库创建 ").append(autoCreatedCount).append(" 张表");
        }
        if (failCount > 0) {
            msg.append("，失败/跳过 ").append(failCount).append(" 个 (").append(String.join("; ", failDetails)).append(")");
        }
        return new ReturnT<>(msg.toString());
    }

    /**
     * 批量调整任务配置属性（路由策略、CRON、阻塞处理策略、报警邮件、任务类型、失败重试次数、超时时间）
     * 并针对运行中的任务在 CRON 变动时动态重新计算下次触发时间
     *
     * @param jobInfo 待修改的任务实体
     * @param dto 批量修改入参DTO
     * @return 是否有属性发生改变
     */
    private boolean applyJobConfigUpdates(JobInfo jobInfo, BatchUpdateWriterDto dto) {
        boolean modified = false;

        // 1. 调整路由策略
        if (StringUtils.isNotBlank(dto.getExecutorRouteStrategy())) {
            String route = dto.getExecutorRouteStrategy().trim();
            if (!route.equals(jobInfo.getExecutorRouteStrategy())) {
                jobInfo.setExecutorRouteStrategy(route);
                modified = true;
            }
        }

        // 2. 调整 CRON 表达式
        if (StringUtils.isNotBlank(dto.getJobCron())) {
            String newCron = dto.getJobCron().trim();
            if (!newCron.equals(jobInfo.getJobCron())) {
                jobInfo.setJobCron(newCron);
                // 若任务当前处于运行状态，必须避开预读周期重新计算下次调度时间
                if (jobInfo.getTriggerStatus() == 1) {
                    try {
                        Date nextValidTime = new CronExpression(newCron).getNextValidTimeAfter(
                                new Date(System.currentTimeMillis() + JobScheduleHelper.PRE_READ_MS));
                        if (nextValidTime != null) {
                            jobInfo.setTriggerNextTime(nextValidTime.getTime());
                        }
                    } catch (ParseException e) {
                        logger.error("计算任务 ID {} 下次调度时间异常: {}", jobInfo.getId(), e.getMessage(), e);
                    }
                }
                modified = true;
            }
        }

        // 3. 调整阻塞处理策略
        if (StringUtils.isNotBlank(dto.getExecutorBlockStrategy())) {
            String block = dto.getExecutorBlockStrategy().trim();
            if (!block.equals(jobInfo.getExecutorBlockStrategy())) {
                jobInfo.setExecutorBlockStrategy(block);
                modified = true;
            }
        }

        // 4. 调整报警邮件
        if (dto.getAlarmEmail() != null) {
            String email = dto.getAlarmEmail().trim();
            if (!Objects.equals(email, jobInfo.getAlarmEmail())) {
                jobInfo.setAlarmEmail(email);
                modified = true;
            }
        }

        // 5. 调整任务类型 (GLUE类型)
        if (StringUtils.isNotBlank(dto.getGlueType())) {
            String glue = dto.getGlueType().trim();
            if (!glue.equals(jobInfo.getGlueType())) {
                jobInfo.setGlueType(glue);
                if (GlueTypeEnum.BEAN.getDesc().equals(glue) || GlueTypeEnum.BEAN.name().equals(glue)) {
                    jobInfo.setExecutorHandler("executorJobHandler");
                } else {
                    jobInfo.setExecutorHandler("");
                }
                jobInfo.setGlueUpdatetime(new Date());
                modified = true;
            }
        }

        // 6. 调整失败重试次数
        if (dto.getExecutorFailRetryCount() != null) {
            int retry = dto.getExecutorFailRetryCount();
            if (retry != jobInfo.getExecutorFailRetryCount()) {
                jobInfo.setExecutorFailRetryCount(retry);
                modified = true;
            }
        }

        // 7. 调整超时时间（分钟）
        if (dto.getExecutorTimeout() != null) {
            int timeout = dto.getExecutorTimeout();
            if (timeout != jobInfo.getExecutorTimeout()) {
                jobInfo.setExecutorTimeout(timeout);
                modified = true;
            }
        }

        return modified;
    }

    /**
     * 安全更新单个任务配置中的连接信息（支持源端 Reader 与目标端 Writer）
     * 保持源表、目标表、字段映射、增量配置以及前置/后置 SQL 不受破坏
     *
     * @param jobInfo 任务实体
     * @param targetDs 目标数据源（若指定）
     * @param dto 批量更新规则
     * @param updateReader 是否更新源端 Reader
     * @param updateWriter 是否更新目标端 Writer
     * @return 是否发生修改
     */
    private boolean updateSingleJobConnection(JobInfo jobInfo, JobDatasource targetDs, BatchUpdateWriterDto dto, boolean updateReader, boolean updateWriter) {
        JSONObject jobRoot = JSON.parseObject(jobInfo.getJobJson(), Feature.OrderedField);
        if (jobRoot == null || !jobRoot.containsKey("job")) {
            return false;
        }
        JSONObject job = jobRoot.getJSONObject("job");
        if (job == null) {
            return false;
        }
        JSONArray contentArray = job.getJSONArray("content");
        if (contentArray == null || contentArray.isEmpty()) {
            return false;
        }

        boolean anyUpdated = false;
        for (int i = 0; i < contentArray.size(); i++) {
            JSONObject content = contentArray.getJSONObject(i);
            if (content == null) {
                continue;
            }

            // 更新 Reader 源端连接与凭据
            if (updateReader) {
                JSONObject reader = content.getJSONObject("reader");
                if (reader != null && reader.containsKey("parameter")) {
                    JSONObject parameter = reader.getJSONObject("parameter");
                    if (parameter != null) {
                        // 模式一：基于系统数据源
                        if (targetDs != null) {
                            String plainUsername = getPlainCredential(targetDs.getJdbcUsername());
                            String plainPassword = getPlainCredential(targetDs.getJdbcPassword());
                            if (StringUtils.isNotBlank(plainUsername)) {
                                parameter.put("username", plainUsername);
                                anyUpdated = true;
                            }
                            if (StringUtils.isNotBlank(plainPassword)) {
                                parameter.put("password", plainPassword);
                                anyUpdated = true;
                            }
                            JSONArray connectionArray = parameter.getJSONArray("connection");
                            if (connectionArray != null) {
                                for (int j = 0; j < connectionArray.size(); j++) {
                                    JSONObject conn = connectionArray.getJSONObject(j);
                                    if (conn != null) {
                                        // Reader 的 jdbcUrl 在 DataX 标准格式中为数组
                                        JSONArray urlArr = new JSONArray();
                                        urlArr.add(targetDs.getJdbcUrl());
                                        conn.put("jdbcUrl", urlArr);
                                        anyUpdated = true;
                                    }
                                }
                            }
                            String pluginName = resolveReaderPluginName(targetDs.getDatasource());
                            if (StringUtils.isNotBlank(pluginName)) {
                                reader.put("name", pluginName);
                            }
                            // 同步更新 job_info 表中的 datasource_id 字段保持一致
                            jobInfo.setDatasourceId(targetDs.getId().intValue());
                        }

                        // 模式二：规则替换 / 账号密码覆盖
                        if (targetDs == null) {
                            if (StringUtils.isNotBlank(dto.getNewUsername())) {
                                parameter.put("username", getPlainCredential(dto.getNewUsername()));
                                anyUpdated = true;
                            }
                            if (StringUtils.isNotBlank(dto.getNewPassword())) {
                                parameter.put("password", getPlainCredential(dto.getNewPassword()));
                                anyUpdated = true;
                            }
                            JSONArray connectionArray = parameter.getJSONArray("connection");
                            if (connectionArray != null) {
                                for (int j = 0; j < connectionArray.size(); j++) {
                                    JSONObject conn = connectionArray.getJSONObject(j);
                                    if (conn != null) {
                                        Object urlObj = conn.get("jdbcUrl");
                                        if (urlObj instanceof JSONArray) {
                                            JSONArray arr = (JSONArray) urlObj;
                                            JSONArray newArr = new JSONArray();
                                            for (int k = 0; k < arr.size(); k++) {
                                                String u = arr.getString(k);
                                                if (StringUtils.isNotBlank(u)) {
                                                    if (StringUtils.isNotBlank(dto.getOldJdbcUrlPattern()) && StringUtils.isNotBlank(dto.getNewJdbcUrl())) {
                                                        newArr.add(u.replace(dto.getOldJdbcUrlPattern(), dto.getNewJdbcUrl()));
                                                        anyUpdated = true;
                                                    } else if (StringUtils.isNotBlank(dto.getNewJdbcUrl())) {
                                                        newArr.add(dto.getNewJdbcUrl());
                                                        anyUpdated = true;
                                                    } else {
                                                        newArr.add(u);
                                                    }
                                                }
                                            }
                                            conn.put("jdbcUrl", newArr);
                                        } else if (urlObj instanceof String) {
                                            String u = (String) urlObj;
                                            if (StringUtils.isNotBlank(u)) {
                                                if (StringUtils.isNotBlank(dto.getOldJdbcUrlPattern()) && StringUtils.isNotBlank(dto.getNewJdbcUrl())) {
                                                    conn.put("jdbcUrl", u.replace(dto.getOldJdbcUrlPattern(), dto.getNewJdbcUrl()));
                                                    anyUpdated = true;
                                                } else if (StringUtils.isNotBlank(dto.getNewJdbcUrl())) {
                                                    conn.put("jdbcUrl", dto.getNewJdbcUrl());
                                                    anyUpdated = true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 更新 Writer 目标端连接与凭据
            if (updateWriter) {
                JSONObject writer = content.getJSONObject("writer");
                if (writer != null && writer.containsKey("parameter")) {
                    JSONObject parameter = writer.getJSONObject("parameter");
                    if (parameter != null) {
                        // 模式一：基于系统数据源
                        if (targetDs != null) {
                            String plainUsername = getPlainCredential(targetDs.getJdbcUsername());
                            String plainPassword = getPlainCredential(targetDs.getJdbcPassword());
                            if (StringUtils.isNotBlank(plainUsername)) {
                                parameter.put("username", plainUsername);
                                anyUpdated = true;
                            }
                            if (StringUtils.isNotBlank(plainPassword)) {
                                parameter.put("password", plainPassword);
                                anyUpdated = true;
                            }
                            JSONArray connectionArray = parameter.getJSONArray("connection");
                            if (connectionArray != null) {
                                for (int j = 0; j < connectionArray.size(); j++) {
                                    JSONObject conn = connectionArray.getJSONObject(j);
                                    if (conn != null) {
                                        conn.put("jdbcUrl", targetDs.getJdbcUrl());
                                        anyUpdated = true;
                                    }
                                }
                            }
                            String pluginName = resolveWriterPluginName(targetDs.getDatasource());
                            if (StringUtils.isNotBlank(pluginName)) {
                                writer.put("name", pluginName);
                            }
                        }

                        // 模式二：规则替换 / 账号密码覆盖
                        if (targetDs == null) {
                            if (StringUtils.isNotBlank(dto.getNewUsername())) {
                                parameter.put("username", getPlainCredential(dto.getNewUsername()));
                                anyUpdated = true;
                            }
                            if (StringUtils.isNotBlank(dto.getNewPassword())) {
                                parameter.put("password", getPlainCredential(dto.getNewPassword()));
                                anyUpdated = true;
                            }
                            JSONArray connectionArray = parameter.getJSONArray("connection");
                            if (connectionArray != null) {
                                for (int j = 0; j < connectionArray.size(); j++) {
                                    JSONObject conn = connectionArray.getJSONObject(j);
                                    if (conn != null) {
                                        String currentUrl = conn.getString("jdbcUrl");
                                        if (StringUtils.isNotBlank(currentUrl)) {
                                            if (StringUtils.isNotBlank(dto.getOldJdbcUrlPattern()) && StringUtils.isNotBlank(dto.getNewJdbcUrl())) {
                                                conn.put("jdbcUrl", currentUrl.replace(dto.getOldJdbcUrlPattern(), dto.getNewJdbcUrl()));
                                                anyUpdated = true;
                                            } else if (StringUtils.isNotBlank(dto.getNewJdbcUrl())) {
                                                conn.put("jdbcUrl", dto.getNewJdbcUrl());
                                                anyUpdated = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 对 Reader 与 Writer 的账号密码均做纯明文清洗
            sanitizeCredentials(content);
        }

        if (anyUpdated) {
            // 加密保存回数据库
            jobInfo.setJobJson(JSONUtils.encryptJobJson(JSON.toJSONString(jobRoot, SerializerFeature.PrettyFormat)));
        }
        return anyUpdated;
    }

    /**
     * 安全更新单个任务配置中的 Writer 连接信息（保持原方法兼容）
     *
     * @param jobInfo 任务实体
     * @param targetDs 目标数据源（若有）
     * @param dto 批量更新规则
     * @return 是否成功修改
     */
    private boolean updateSingleJobWriter(JobInfo jobInfo, JobDatasource targetDs, BatchUpdateWriterDto dto) {
        return updateSingleJobConnection(jobInfo, targetDs, dto, false, true);
    }

    /**
     * 对任务内容中的 Reader 与 Writer 凭证执行纯明文清洗（公共方法，消除重复代码）
     *
     * @param content 任务内容 JSON 对象
     */
    private void sanitizeCredentials(JSONObject content) {
        if (content == null) {
            return;
        }
        sanitizePluginCredential(content.getJSONObject("reader"));
        sanitizePluginCredential(content.getJSONObject("writer"));
    }

    /**
     * 对指定插件的参数凭证执行纯明文清洗
     *
     * @param plugin 插件 JSON 对象
     */
    private void sanitizePluginCredential(JSONObject plugin) {
        if (plugin == null || !plugin.containsKey("parameter")) {
            return;
        }
        JSONObject param = plugin.getJSONObject("parameter");
        if (param == null) {
            return;
        }
        String user = param.getString("username");
        String pwd = param.getString("password");
        if (StringUtils.isNotBlank(user)) {
            String plainUser = getPlainCredential(user);
            if (!plainUser.equals(user)) {
                param.put("username", plainUser);
            }
        }
        if (StringUtils.isNotBlank(pwd)) {
            String plainPwd = getPlainCredential(pwd);
            if (!plainPwd.equals(pwd)) {
                param.put("password", plainPwd);
            }
        }
    }

    /**
     * 根据数据源类型解析对应的 DataX Reader 插件名称
     *
     * @param datasourceType 数据源类型
     * @return 插件名称
     */
    private String resolveReaderPluginName(String datasourceType) {
        if (StringUtils.isBlank(datasourceType)) {
            return null;
        }
        String type = datasourceType.trim().toLowerCase();
        switch (type) {
            case "mysql":
                return "mysqlreader";
            case "oracle":
                return "oraclereader";
            case "postgresql":
                return "postgresqlreader";
            case "sqlserver":
                return "sqlserverreader";
            case "clickhouse":
                return "clickhousereader";
            case "hive":
                return "hdfsreader";
            case "hbase":
                return "hbase11xreader";
            case "mongodb":
                return "mongodbreader";
            default:
                return type + "reader";
        }
    }

    /**
     * 根据数据源类型解析对应的 DataX Writer 插件名称
     *
     * @param datasourceType 数据源类型
     * @return 插件名称
     */
    private String resolveWriterPluginName(String datasourceType) {
        if (StringUtils.isBlank(datasourceType)) {
            return null;
        }
        String type = datasourceType.trim().toLowerCase();
        switch (type) {
            case "mysql":
                return "mysqlwriter";
            case "oracle":
                return "oraclewriter";
            case "postgresql":
                return "postgresqlwriter";
            case "sqlserver":
                return "sqlserverwriter";
            case "clickhouse":
                return "clickhousewriter";
            case "hive":
                return "hdfswriter";
            case "hbase":
                return "hbase11xwriter";
            case "mongodb":
                return "mongodbwriter";
            default:
                return type + "writer";
        }
    }

    /**
     * 安全提取纯明文凭证（若为密文则解密，若多重密文则彻底剥离至最内层纯明文，若已是明文则直接返回）
     * 确保写入任务 JSON 的全部是干净的真实账号密码，杜绝 MySQL 认证时将密文当作用户名引发 Access denied
     *
     * @param value 待解析的用户名或密码
     * @return 最终纯明文字符串
     */
    private String getPlainCredential(String value) {
        if (StringUtils.isBlank(value)) {
            return value;
        }
        try {
            String current = value;
            while (true) {
                String decrypted = AESUtil.decrypt(current);
                if (decrypted == null || decrypted.equals(current)) {
                    break;
                }
                current = decrypted;
            }
            return current;
        } catch (Exception e) {
            logger.warn("解析凭证为纯明文异常，保持原值: {}", e.getMessage());
        }
        return value;
    }

    @Override
    public ReturnT<List<CheckTargetTableResultDto>> checkTargetTables(List<Integer> jobIds, Long writerDatasourceId) {
        return checkTargetTables(jobIds, writerDatasourceId, "WRITER");
    }

    @Override
    public ReturnT<List<CheckTargetTableResultDto>> checkTargetTables(List<Integer> jobIds, Long datasourceId, String scope) {
        if (jobIds == null || jobIds.isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID列表不能为空");
        }
        if (datasourceId == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "数据源ID不能为空");
        }
        JobDatasource ds = jobJdbcDatasourceService.getById(datasourceId);
        if (ds == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "指定的数据源不存在 (ID: " + datasourceId + ")");
        }

        boolean isReaderScope = "READER".equalsIgnoreCase(scope);

        // 优先一次性获取数据源全部已有表集合，支持高效内存比对（大小写不敏感）
        Set<String> existingTables = new HashSet<>();
        try {
            List<String> tables = datasourceQueryService.getTables(datasourceId, null);
            if (tables != null) {
                for (String t : tables) {
                    if (StringUtils.isNotBlank(t)) {
                        existingTables.add(t.trim().toLowerCase());
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("获取数据源已有表集合异常，将降级逐表探测: {}", e.getMessage());
        }

        List<CheckTargetTableResultDto> resultList = new ArrayList<>();
        for (Integer jobId : jobIds) {
            if (jobId == null) {
                continue;
            }
            JobInfo jobInfo = jobInfoMapper.loadById(jobId);
            if (jobInfo == null || StringUtils.isBlank(jobInfo.getJobJson())) {
                continue;
            }

            CheckTargetTableResultDto item = new CheckTargetTableResultDto();
            item.setJobId(jobId);
            item.setJobDesc(jobInfo.getJobDesc());

            try {
                JSONObject jobRoot = JSON.parseObject(jobInfo.getJobJson(), Feature.OrderedField);
                String writerTable = extractWriterTable(jobRoot);
                String readerTable = extractReaderTable(jobRoot);
                String readerJdbcUrl = extractReaderJdbcUrl(jobRoot);

                item.setWriterTable(writerTable);
                item.setReaderTable(readerTable);

                String checkTable = isReaderScope ? readerTable : writerTable;

                if (StringUtils.isBlank(checkTable)) {
                    item.setTargetTableExists(false);
                    item.setNeedCreate(false);
                    resultList.add(item);
                    continue;
                }

                boolean exists = false;
                if (!existingTables.isEmpty()) {
                    exists = existingTables.contains(checkTable.toLowerCase());
                } else {
                    try {
                        exists = datasourceQueryService.checkTableExists(datasourceId, checkTable);
                    } catch (Exception e) {
                        exists = false;
                    }
                }

                item.setTargetTableExists(exists);

                if (isReaderScope) {
                    // 源库为只读数据源，绝不自动建表
                    item.setNeedCreate(false);
                } else {
                    item.setNeedCreate(!exists);
                    // 若目标表在目标库中不存在，推导安全的建表 DDL
                    if (!exists) {
                        String ddl = buildTargetTableDDL(jobRoot, readerTable, writerTable, readerJdbcUrl, datasourceId);
                        item.setCreateTableSql(ddl);
                    }
                }
            } catch (Exception e) {
                logger.error("解析任务 ID {} 库表状态失败: {}", jobId, e.getMessage(), e);
                item.setTargetTableExists(false);
                item.setNeedCreate(false);
            }

            resultList.add(item);
        }

        return new ReturnT<>(resultList);
    }

    /**
     * 针对缺失的目标表推导安全建表 DDL（包含全部字段定义）
     *
     * @param jobRoot 任务 JSON 根对象
     * @param readerTable 源表名
     * @param writerTable 目标表名
     * @param readerJdbcUrl 源端连接串
     * @param writerDatasourceId 目标端数据源 ID
     * @return 建表 DDL
     */
    private String buildTargetTableDDL(JSONObject jobRoot, String readerTable, String writerTable, String readerJdbcUrl, Long writerDatasourceId) {
        if (StringUtils.isBlank(writerTable)) {
            return null;
        }

        // 策略 1：匹配源端数据源，若能连上源库则通过 SHOW CREATE TABLE 直接提取完整高保真 DDL
        if (StringUtils.isNotBlank(readerJdbcUrl) && StringUtils.isNotBlank(readerTable)) {
            JobDatasource readerDs = findDatasourceByJdbcUrl(readerJdbcUrl);
            if (readerDs != null) {
                try {
                    String mysqlDdl = getMysqlTableDDL(readerDs, readerTable, writerTable);
                    if (StringUtils.isNotBlank(mysqlDdl)) {
                        return mysqlDdl;
                    }
                } catch (Exception e) {
                    logger.warn("通过 SHOW CREATE TABLE 提取 [{}] 建表语句失败: {}", readerTable, e.getMessage());
                }
            }
        }

        // 策略 2：基于任务 JSON 中明确声明的 column 字段列表自动生成包含所有字段的完整 CREATE TABLE 语句
        List<String> columns = extractWriterColumns(jobRoot);
        if (columns == null || columns.isEmpty()) {
            columns = extractReaderColumns(jobRoot);
        }

        StringBuilder sb = new StringBuilder();
        sb.append("CREATE TABLE IF NOT EXISTS `").append(writerTable).append("` (\n");
        if (columns != null && !columns.isEmpty()) {
            boolean hasId = false;
            List<String> colDefs = new ArrayList<>();
            for (String column : columns) {
                String col = column.replace("`", "").trim();
                if (StringUtils.isBlank(col)) {
                    continue;
                }
                if ("id".equalsIgnoreCase(col)) {
                    hasId = true;
                    colDefs.add("  `" + col + "` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID'");
                } else if (col.toLowerCase().endsWith("_time") || col.toLowerCase().endsWith("_date")
                        || "create_time".equalsIgnoreCase(col) || "update_time".equalsIgnoreCase(col)) {
                    colDefs.add("  `" + col + "` datetime DEFAULT NULL COMMENT '" + col + "'");
                } else if (col.toLowerCase().endsWith("_id") || col.toLowerCase().endsWith("_num")
                        || col.toLowerCase().endsWith("_count") || "deleted".equalsIgnoreCase(col) || "tenant_id".equalsIgnoreCase(col)) {
                    colDefs.add("  `" + col + "` bigint(20) DEFAULT NULL COMMENT '" + col + "'");
                } else {
                    colDefs.add("  `" + col + "` varchar(255) DEFAULT NULL COMMENT '" + col + "'");
                }
            }
            if (hasId) {
                colDefs.add("  PRIMARY KEY (`id`)");
            } else {
                colDefs.add("  PRIMARY KEY (`" + columns.get(0).replace("`", "").trim() + "`)");
            }
            sb.append(String.join(",\n", colDefs)).append("\n");
        } else {
            sb.append("  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',\n  PRIMARY KEY (`id`)\n");
        }
        sb.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        return sb.toString();
    }

    /**
     * 当源数据源为 MySQL 时直接获取源表完整建表 DDL 并替换为目标表名
     */
    private String getMysqlTableDDL(JobDatasource ds, String readerTable, String writerTable) {
        if (ds == null) {
            return null;
        }
        try {
            String username = AESUtil.decrypt(ds.getJdbcUsername());
            String password = AESUtil.decrypt(ds.getJdbcPassword());
            if (StringUtils.isNotBlank(ds.getJdbcDriverClass())) {
                Class.forName(ds.getJdbcDriverClass());
            }
            try (Connection conn = DriverManager.getConnection(ds.getJdbcUrl(), username, password);
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SHOW CREATE TABLE `" + readerTable + "`")) {
                if (rs.next()) {
                    String createSql = rs.getString(2);
                    if (StringUtils.isNotBlank(createSql)) {
                        createSql = createSql.replaceAll("(?i)\\s+AUTO_INCREMENT=\\d+", "");
                        createSql = createSql.replaceFirst("(?i)CREATE\\s+TABLE\\s+`?" + Pattern.quote(readerTable) + "`?", "CREATE TABLE IF NOT EXISTS `" + writerTable + "`");
                        return createSql + ";";
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("从源库获取 [{}] 建表 DDL 失败: {}", readerTable, e.getMessage());
        }
        return null;
    }

    /**
     * 从任务 JSON 中提取源端字段列表
     */
    private List<String> extractReaderColumns(JSONObject jobRoot) {
        List<String> cols = new ArrayList<>();
        try {
            JSONArray contentArray = jobRoot.getJSONObject("job").getJSONArray("content");
            if (contentArray != null && !contentArray.isEmpty()) {
                JSONObject reader = contentArray.getJSONObject(0).getJSONObject("reader");
                if (reader != null && reader.containsKey("parameter")) {
                    JSONArray colArr = reader.getJSONObject("parameter").getJSONArray("column");
                    if (colArr != null) {
                        for (int i = 0; i < colArr.size(); i++) {
                            cols.add(colArr.getString(i));
                        }
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return cols;
    }

    /**
     * 从任务 JSON 中提取目标表名
     *
     * @param jobRoot 任务 JSON 根对象
     * @return 目标表名
     */
    /**
     * 从任务 JSON 指定插件中提取数据表名公共方法
     *
     * @param jobRoot 任务 JSON 根对象
     * @param pluginName 插件名称（reader 或 writer）
     * @return 提取到的数据表名
     */
    private String extractTableFromPlugin(JSONObject jobRoot, String pluginName) {
        try {
            JSONArray contentArray = jobRoot.getJSONObject("job").getJSONArray("content");
            if (contentArray != null && !contentArray.isEmpty()) {
                JSONObject plugin = contentArray.getJSONObject(0).getJSONObject(pluginName);
                if (plugin != null && plugin.containsKey("parameter")) {
                    JSONObject param = plugin.getJSONObject("parameter");
                    JSONArray connArray = param.getJSONArray("connection");
                    if (connArray != null && !connArray.isEmpty()) {
                        JSONObject conn = connArray.getJSONObject(0);
                        Object tableObj = conn.get("table");
                        if (tableObj instanceof JSONArray && !((JSONArray) tableObj).isEmpty()) {
                            return ((JSONArray) tableObj).getString(0);
                        } else if (tableObj instanceof String) {
                            return (String) tableObj;
                        }
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    private String extractWriterTable(JSONObject jobRoot) {
        return extractTableFromPlugin(jobRoot, "writer");
    }

    private String extractReaderTable(JSONObject jobRoot) {
        return extractTableFromPlugin(jobRoot, "reader");
    }

    /**
     * 从任务 JSON 中提取源端 JDBC 连接串
     *
     * @param jobRoot 任务 JSON 根对象
     * @return 源端 JDBC 连接串
     */
    private String extractReaderJdbcUrl(JSONObject jobRoot) {
        return extractJdbcUrlFromPlugin(jobRoot, "reader");
    }

    /**
     * 从任务 JSON 中提取目标端 JDBC 连接串
     *
     * @param jobRoot 任务 JSON 根对象
     * @return 目标端 JDBC 连接串
     */
    private String extractWriterJdbcUrl(JSONObject jobRoot) {
        return extractJdbcUrlFromPlugin(jobRoot, "writer");
    }

    /**
     * 从任务 JSON 指定插件中提取 JDBC 连接串公共方法
     *
     * @param jobRoot 任务 JSON 根对象
     * @param pluginName 插件名称（reader 或 writer）
     * @return 提取到的 JDBC 连接串
     */
    private String extractJdbcUrlFromPlugin(JSONObject jobRoot, String pluginName) {
        try {
            JSONArray contentArray = jobRoot.getJSONObject("job").getJSONArray("content");
            if (contentArray != null && !contentArray.isEmpty()) {
                JSONObject plugin = contentArray.getJSONObject(0).getJSONObject(pluginName);
                if (plugin != null && plugin.containsKey("parameter")) {
                    JSONObject param = plugin.getJSONObject("parameter");
                    JSONArray connArray = param.getJSONArray("connection");
                    if (connArray != null && !connArray.isEmpty()) {
                        JSONObject conn = connArray.getJSONObject(0);
                        Object urlObj = conn.get("jdbcUrl");
                        if (urlObj instanceof JSONArray && !((JSONArray) urlObj).isEmpty()) {
                            return ((JSONArray) urlObj).getString(0);
                        } else if (urlObj instanceof String) {
                            return (String) urlObj;
                        }
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    /**
     * 从任务 JSON 中提取目标端字段列表
     *
     * @param jobRoot 任务 JSON 根对象
     * @return 字段列表
     */
    private List<String> extractWriterColumns(JSONObject jobRoot) {
        List<String> cols = new ArrayList<>();
        try {
            JSONArray contentArray = jobRoot.getJSONObject("job").getJSONArray("content");
            if (contentArray != null && !contentArray.isEmpty()) {
                JSONObject writer = contentArray.getJSONObject(0).getJSONObject("writer");
                if (writer != null && writer.containsKey("parameter")) {
                    JSONArray colArr = writer.getJSONObject("parameter").getJSONArray("column");
                    if (colArr != null) {
                        for (int i = 0; i < colArr.size(); i++) {
                            cols.add(colArr.getString(i));
                        }
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return cols;
    }

    /**
     * 根据 JDBC URL 匹配已注册的数据源
     *
     * @param jdbcUrl 数据库连接串
     * @return 数据源实体
     */
    private JobDatasource findDatasourceByJdbcUrl(String jdbcUrl) {
        if (StringUtils.isBlank(jdbcUrl)) {
            return null;
        }
        try {
            List<JobDatasource> list = jobJdbcDatasourceService.list();
            if (list != null) {
                String cleanTarget = cleanJdbcUrl(jdbcUrl);
                for (JobDatasource ds : list) {
                    if (StringUtils.isNotBlank(ds.getJdbcUrl())) {
                        if (cleanJdbcUrl(ds.getJdbcUrl()).equalsIgnoreCase(cleanTarget)) {
                            return ds;
                        }
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    /**
     * 规范化截取 JDBC URL 的主机与库名部分用于精准比对
     *
     * @param url 完整连接串
     * @return 截断后的基础连接串
     */
    private String cleanJdbcUrl(String url) {
        if (url == null) {
            return "";
        }
        int q = url.indexOf('?');
        return q != -1 ? url.substring(0, q).trim() : url.trim();
    }

    /**
     * 复制任务（生成一条新任务，复用原配置与已加密的作业JSON，无需再加密）
     *
     * @param id 源任务ID
     * @return 复制成功后的新任务ID
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ReturnT<String> copy(int id) {
        JobInfo sourceJob = jobInfoMapper.loadById(id);
        if (sourceJob == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_id") + I18nUtil.getString("system_not_found")));
        }

        JobInfo targetJob = new JobInfo();
        BeanUtils.copyProperties(sourceJob, targetJob);

        // 重置新任务主键与调度状态
        targetJob.setId(0);
        targetJob.setJobDesc((sourceJob.getJobDesc() != null ? sourceJob.getJobDesc() : "") + "_copy");
        targetJob.setTriggerStatus(0);
        targetJob.setTriggerLastTime(0);
        targetJob.setTriggerNextTime(0);
        Date now = new Date();
        targetJob.setAddTime(now);
        targetJob.setUpdateTime(now);
        targetJob.setGlueUpdatetime(now);

        // 核心保障：源任务的 jobJson 已经由保存逻辑进行加密保护，复制时直接复用原密文，无需再加密
        targetJob.setJobJson(sourceJob.getJobJson());

        jobInfoMapper.save(targetJob);
        if (targetJob.getId() < 1) {
            return new ReturnT<>(ReturnT.FAIL_CODE, (I18nUtil.getString("jobinfo_field_add") + I18nUtil.getString("system_fail")));
        }
        return new ReturnT<>(String.valueOf(targetJob.getId()));
    }

    /**
     * 校验字段名是否为合法的数据库标识符（防止 SQL 注入）
     */
    private static final Pattern SAFE_COLUMN_PATTERN = Pattern.compile("^[a-zA-Z0-9_`\\[\\]\"]+$");

    /**
     * 将方案1（时间自增）配置应用到 JobInfo 实体与对应的 DataX 配置 JSON 中
     *
     * @param jobInfo 待配置的任务实体
     * @param rawJobJson 原始配置 JSON
     * @param timeColumn 增量时间字段（如 update_time）
     * @param incStartTime 增量起始时间
     * @param writeMode 写入模式（默认 replace）
     * @return 应用增量配置并加密账密后的新 Job JSON
     */
    private String applyTimeIncrementConfig(JobInfo jobInfo, String rawJobJson, String timeColumn, Date incStartTime, String writeMode) {
        String cleanCol = StringUtils.isNotBlank(timeColumn) ? timeColumn.trim() : "update_time";
        if (!SAFE_COLUMN_PATTERN.matcher(cleanCol).matches()) {
            throw new IllegalArgumentException("增量时间字段名包含非法字符: " + cleanCol);
        }

        String mode = StringUtils.isNotBlank(writeMode) ? writeMode.trim().toLowerCase() : "replace";

        String modifiedJson = rawJobJson;
        try {
            if (StringUtils.isNotBlank(rawJobJson)) {
                JSONObject root = JSON.parseObject(rawJobJson, Feature.OrderedField);
                if (root != null && root.containsKey("job")) {
                    JSONObject job = root.getJSONObject("job");
                    if (job != null && job.containsKey("content")) {
                        JSONArray contents = job.getJSONArray("content");
                        if (contents != null) {
                            for (int i = 0; i < contents.size(); i++) {
                                JSONObject item = contents.getJSONObject(i);
                                if (item == null) continue;

                                // 1. Reader 注入带时间占位符的 where 过滤条件，避免全库扫描
                                JSONObject reader = item.getJSONObject("reader");
                                if (reader != null && reader.containsKey("parameter")) {
                                    JSONObject rParam = reader.getJSONObject("parameter");
                                    if (rParam != null) {
                                        String readerName = reader.getString("name");
                                        String whereCondition;
                                        if (StringUtils.isBlank(readerName) || "mysqlreader".equalsIgnoreCase(readerName)) {
                                            // 对齐 DataX 官方标准推荐写法：采用纯数字秒级时间戳搭配 FROM_UNIXTIME 函数，杜绝空格拆分与双单引号语法报错
                                            whereCondition = cleanCol + " >= FROM_UNIXTIME(${lastTime}) AND " + cleanCol + " < FROM_UNIXTIME(${currentTime})";
                                        } else {
                                            // 其它数据源通用方案：利用 REPLACE 函数将占位符 % 还原为空格，避免引号嵌套
                                            whereCondition = cleanCol + " >= REPLACE(${lastTime}, '%', ' ') AND " + cleanCol + " < REPLACE(${currentTime}, '%', ' ')";
                                        }
                                        rParam.put("where", whereCondition);
                                    }
                                }

                                // 2. Writer 设置 writeMode 为 replace/update 幂等覆盖，并清除可能误删历史数据的 TRUNCATE
                                JSONObject writer = item.getJSONObject("writer");
                                if (writer != null && writer.containsKey("parameter")) {
                                    JSONObject wParam = writer.getJSONObject("parameter");
                                    if (wParam != null) {
                                        wParam.put("writeMode", mode);
                                        if (wParam.containsKey("preSql")) {
                                            Object preSqlObj = wParam.get("preSql");
                                            if (preSqlObj instanceof JSONArray) {
                                                JSONArray preSqlArr = (JSONArray) preSqlObj;
                                                JSONArray filtered = new JSONArray();
                                                for (int j = 0; j < preSqlArr.size(); j++) {
                                                    String sql = preSqlArr.getString(j);
                                                    if (sql != null && !sql.toUpperCase().contains("TRUNCATE")) {
                                                        filtered.add(sql);
                                                    }
                                                }
                                                wParam.put("preSql", filtered);
                                            }
                                        }
                                    }
                                }
                            }
                            modifiedJson = JSON.toJSONString(root, SerializerFeature.PrettyFormat);
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("解析并注入时间增量参数异常: {}", e.getMessage());
        }

        // 3. 配置 JobInfo 实体：采用官方标准的秒级时间戳模式
        jobInfo.setIncrementType(IncrementTypeEnum.TIME.getCode());
        jobInfo.setIncStartTime(incStartTime != null ? incStartTime : new Date());
        jobInfo.setReplaceParam("-DlastTime='%s' -DcurrentTime='%s'");
        jobInfo.setReplaceParamType(DateFormatUtils.TIMESTAMP);

        // 4. 凭证加密持久化
        return JSONUtils.encryptJobJson(modifiedJson);
    }

    /**
     * 批量将已有任务配置为方案1时间自增同步
     *
     * @param dto 批量设置入参DTO
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ReturnT<String> batchSetIncrement(BatchSetIncrementDto dto) {
        if (dto == null || dto.getJobIds() == null || dto.getJobIds().isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "请至少勾选一个任务");
        }
        int successCount = 0;
        for (Integer id : dto.getJobIds()) {
            if (id == null || id <= 0) continue;
            JobInfo job = jobInfoMapper.loadById(id);
            if (job == null) continue;

            if (GlueTypeEnum.BEAN.getDesc().equals(job.getGlueType()) && StringUtils.isNotBlank(job.getJobJson())) {
                String newJson = applyTimeIncrementConfig(job, job.getJobJson(), dto.getTimeColumn(), dto.getIncStartTime(), dto.getWriteMode());
                job.setJobJson(newJson);
                job.setUpdateTime(new Date());
                job.setGlueUpdatetime(new Date());
                jobInfoMapper.update(job);
                successCount++;
            }
        }
        return new ReturnT<>(ReturnT.SUCCESS_CODE, "成功将 " + successCount + " 个任务批量配置为方案1时间自增同步！");
    }

    /**
     * 批量初始化目标表并全量同步
     *
     * @param dto 批量初始化入参DTO
     * @return 操作结果
     */
    @Override
    public ReturnT<String> batchInitAndSync(BatchInitSyncDto dto) {
        if (dto == null || dto.getJobIds() == null || dto.getJobIds().isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "请至少勾选一个需要初始化的任务");
        }

        int total = dto.getJobIds().size();
        int truncateSuccess = 0;
        int resetSuccess = 0;
        int triggerSuccess = 0;
        List<String> warnings = new ArrayList<>();

        for (Integer jobId : dto.getJobIds()) {
            if (jobId == null || jobId <= 0) continue;
            JobInfo jobInfo = jobInfoMapper.loadById(jobId);
            if (jobInfo == null) {
                warnings.add("任务 ID " + jobId + " 不存在");
                continue;
            }

            String jobDesc = StringUtils.isNotBlank(jobInfo.getJobDesc()) ? jobInfo.getJobDesc() : ("ID:" + jobId);

            // 1. 若开启清空目标表，提取目标表名与目标数据源执行 TRUNCATE TABLE
            if (dto.getTruncateTargetTable()) {
                String rawJson = JSONUtils.decryptJobJson(jobInfo.getJobJson());
                if (StringUtils.isNotBlank(rawJson)) {
                    try {
                        JSONObject root = JSON.parseObject(rawJson, Feature.OrderedField);
                        String writerTable = extractWriterTable(root);
                        String writerJdbcUrl = extractWriterJdbcUrl(root);

                        if (StringUtils.isNotBlank(writerTable)) {
                            // 安全校验目标表名是否合规，防止 SQL 注入
                            String cleanTable = writerTable.replace("`", "").trim();
                            if (SAFE_COLUMN_PATTERN.matcher(cleanTable).matches()) {
                                JobDatasource ds = null;
                                if (dto.getWriterDatasourceId() != null) {
                                    ds = jobJdbcDatasourceService.getById(dto.getWriterDatasourceId());
                                }
                                if (ds == null && StringUtils.isNotBlank(writerJdbcUrl)) {
                                    ds = findDatasourceByJdbcUrl(writerJdbcUrl);
                                }

                                if (ds != null) {
                                    boolean ok = executeTruncateTable(ds, cleanTable);
                                    if (ok) {
                                        truncateSuccess++;
                                    } else {
                                        warnings.add("任务 [" + jobDesc + "] 目标表清空失败");
                                    }
                                } else {
                                    warnings.add("任务 [" + jobDesc + "] 未匹配到目标端数据源");
                                }
                            } else {
                                warnings.add("任务 [" + jobDesc + "] 目标表名格式非法");
                            }
                        }
                    } catch (Exception e) {
                        logger.error("任务 [{}] 清空目标表异常: {}", jobDesc, e.getMessage(), e);
                        warnings.add("任务 [" + jobDesc + "] 清空异常: " + e.getMessage());
                    }
                }
            }

            // 2. 若开启重置增量起点，将其重置为 1970-01-01 00:00:00 (保证拉取全量数据)
            if (dto.getResetIncrement()) {
                try {
                    // Unix 时间戳 0 毫秒对应 1970-01-01 00:00:00，DataX 变量替换为 0
                    Date epochZero = new Date(0L);
                    jobInfoMapper.incrementTimeUpdate(jobId, epochZero);
                    resetSuccess++;
                } catch (Exception e) {
                    logger.warn("任务 [{}] 重置增量时间戳异常: {}", jobDesc, e.getMessage());
                }
            }

            // 3. 若开启立即触发全量同步，调度执行器立即执行
            if (dto.getTriggerSync()) {
                try {
                    JobTriggerPoolHelper.trigger(jobId, TriggerTypeEnum.MANUAL, -1, null, "");
                    triggerSuccess++;
                } catch (Exception e) {
                    logger.error("任务 [{}] 触发调度执行异常: {}", jobDesc, e.getMessage(), e);
                    warnings.add("任务 [" + jobDesc + "] 触发失败: " + e.getMessage());
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("已处理 ").append(total).append(" 个任务：");
        if (dto.getTruncateTargetTable()) {
            sb.append("清空目标表 ").append(truncateSuccess).append(" 个；");
        }
        if (dto.getResetIncrement()) {
            sb.append("重置全量起点 ").append(resetSuccess).append(" 个；");
        }
        if (dto.getTriggerSync()) {
            sb.append("成功触发全量同步 ").append(triggerSuccess).append(" 个。");
        }
        if (!warnings.isEmpty()) {
            sb.append(" 部分异常: ").append(String.join("; ", warnings));
        }

        return new ReturnT<>(ReturnT.SUCCESS_CODE, sb.toString());
    }

    /**
     * 安全在目标端数据源上执行 TRUNCATE TABLE 指令
     *
     * @param ds 目标数据源实体
     * @param tableName 经过安全校验的目标表名
     * @return 是否成功执行清空
     */
    private boolean executeTruncateTable(JobDatasource ds, String tableName) {
        if (ds == null || StringUtils.isBlank(tableName)) {
            return false;
        }
        try {
            String username = AESUtil.decrypt(ds.getJdbcUsername());
            String password = AESUtil.decrypt(ds.getJdbcPassword());
            if (StringUtils.isNotBlank(ds.getJdbcDriverClass())) {
                Class.forName(ds.getJdbcDriverClass());
            }
            try (Connection conn = DriverManager.getConnection(ds.getJdbcUrl(), username, password);
                 Statement stmt = conn.createStatement()) {
                String sql;
                String datasourceType = ds.getDatasource() != null ? ds.getDatasource().toLowerCase() : "";
                if ("oracle".equals(datasourceType)) {
                    sql = "TRUNCATE TABLE \"" + tableName.toUpperCase() + "\"";
                } else if ("postgresql".equals(datasourceType)) {
                    sql = "TRUNCATE TABLE \"" + tableName + "\"";
                } else {
                    sql = "TRUNCATE TABLE `" + tableName + "`";
                }
                logger.info("执行目标表初始化清空: [{}], URL: {}", sql, ds.getJdbcUrl());
                stmt.execute(sql);
                return true;
            }
        } catch (Exception e) {
            logger.error("执行 TRUNCATE TABLE [{}] 失败: {}", tableName, e.getMessage());
            return false;
        }
    }

    /**
     * 批量回溯增量时间并触发同步
     * 用于解决业务数据更新时间落后于调度执行时间导致差异无法拉回的问题
     *
     * @param dto 批量回溯入参DTO
     * @return 操作结果
     */
    @Override
    public ReturnT<String> rollbackIncrementAndSync(BatchRollbackDto dto) {
        if (dto == null || dto.getJobIds() == null || dto.getJobIds().isEmpty()) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "请至少勾选一个需要回溯同步的任务");
        }

        // 1. 计算目标起始时间
        Date targetStartTime;
        String modeDesc;
        String type = StringUtils.isNotBlank(dto.getRollbackType()) ? dto.getRollbackType().toUpperCase() : "ALL";

        if ("HOURS".equals(type)) {
            int hours = (dto.getRollbackHours() != null && dto.getRollbackHours() > 0) ? dto.getRollbackHours() : 24;
            targetStartTime = new Date(System.currentTimeMillis() - hours * 3600000L);
            modeDesc = "回溯 " + hours + " 小时 (" + DateUtil.formatDateTime(targetStartTime) + ")";
        } else if ("CUSTOM".equals(type)) {
            if (StringUtils.isBlank(dto.getCustomStartTime())) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "请指定自定义起始时间 (yyyy-MM-dd HH:mm:ss)");
            }
            try {
                targetStartTime = DateUtil.parseDateTime(dto.getCustomStartTime().trim());
                modeDesc = "指定时间 (" + dto.getCustomStartTime() + ")";
            } catch (Exception e) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "时间格式非法，请使用 yyyy-MM-dd HH:mm:ss 格式");
            }
        } else {
            // 默认全量覆盖 (Unix 时间戳 0 毫秒对应 1970-01-01 00:00:00)
            targetStartTime = new Date(0L);
            modeDesc = "全量同步 (重置起点为 1970-01-01)";
        }

        int updateSuccess = 0;
        int triggerSuccess = 0;
        List<String> warnings = new ArrayList<>();

        // 2. 批量回溯增量时间并触发调度
        for (Integer jobId : dto.getJobIds()) {
            if (jobId == null || jobId <= 0) continue;
            JobInfo jobInfo = jobInfoMapper.loadById(jobId);
            if (jobInfo == null) {
                warnings.add("任务 ID " + jobId + " 不存在");
                continue;
            }

            String jobDesc = StringUtils.isNotBlank(jobInfo.getJobDesc()) ? jobInfo.getJobDesc() : ("ID:" + jobId);

            try {
                // 安全更新增量起始时间 (仅调整时间戳，不破坏原有任务 JSON 与其它配置)
                jobInfoMapper.incrementTimeUpdate(jobId, targetStartTime);
                updateSuccess++;
            } catch (Exception e) {
                logger.error("任务 [{}] 回溯增量时间异常: {}", jobDesc, e.getMessage(), e);
                warnings.add("任务 [" + jobDesc + "] 更新增量时间异常: " + e.getMessage());
                continue;
            }

            // 若开启立即触发同步
            if (Boolean.TRUE.equals(dto.getTriggerSync())) {
                try {
                    JobTriggerPoolHelper.trigger(jobId, TriggerTypeEnum.MANUAL, -1, null, "");
                    triggerSuccess++;
                } catch (Exception e) {
                    logger.error("任务 [{}] 触发调度执行异常: {}", jobDesc, e.getMessage(), e);
                    warnings.add("任务 [" + jobDesc + "] 触发失败: " + e.getMessage());
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("已按【").append(modeDesc).append("】处理 ").append(dto.getJobIds().size()).append(" 个任务：");
        sb.append("更新增量时间 ").append(updateSuccess).append(" 个；");
        if (Boolean.TRUE.equals(dto.getTriggerSync())) {
            sb.append("触发执行 ").append(triggerSuccess).append(" 个。");
        }
        if (!warnings.isEmpty()) {
            sb.append(" 部分告警: ").append(String.join("; ", warnings));
        }

        return new ReturnT<>(ReturnT.SUCCESS_CODE, sb.toString());
    }
}
