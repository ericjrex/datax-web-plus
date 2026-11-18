package com.wugui.datax.admin.core.conf;

import com.wugui.datax.admin.core.scheduler.JobScheduler;
import com.wugui.datax.admin.mapper.*;
import com.wugui.datax.admin.service.JobApiTaskService;
import com.wugui.datax.admin.service.StatTaskService;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import javax.sql.DataSource;

/**
 * xxl-job config
 *
 * @author xuxueli 2017-04-28
 */

@Component
public class JobAdminConfig implements InitializingBean, DisposableBean {

    private static JobAdminConfig adminConfig = null;

    public static JobAdminConfig getAdminConfig() {
        return adminConfig;
    }


    // ---------------------- XxlJobScheduler ----------------------

    private JobScheduler xxlJobScheduler;

    @Override
    public void afterPropertiesSet() throws Exception {
        adminConfig = this;

        xxlJobScheduler = new JobScheduler();
        xxlJobScheduler.init();
    }

    @Override
    public void destroy() throws Exception {
        xxlJobScheduler.destroy();
    }


    // ---------------------- XxlJobScheduler ----------------------

    // conf
    @Value("${datax.job.i18n}")
    private String i18n;

    @Value("${datax.job.accessToken}")
    private String accessToken;

    @Value("${spring.mail.username}")
    private String emailUserName;

    @Value("${datax.job.triggerpool.fast.max}")
    private int triggerPoolFastMax;

    @Value("${datax.job.triggerpool.slow.max}")
    private int triggerPoolSlowMax;

    @Value("${datax.job.logretentiondays}")
    private int logretentiondays;

    @Value("${datasource.aes.key}")
    private String dataSourceAESKey;

    @Value("${datax.job.scheduler.enabled:true}")
    private boolean schedulerEnabled = true;

    // dao, service

    @Resource
    private JobLogMapper jobLogMapper;
    @Resource
    private JobInfoMapper jobInfoMapper;
    @Resource
    private JobRegistryMapper jobRegistryMapper;
    @Resource
    private JobGroupMapper jobGroupMapper;
    @Resource
    private JobLogReportMapper jobLogReportMapper;
    @Resource
    private JavaMailSender mailSender;
    @Resource
    private DataSource dataSource;
    @Resource
    private JobDatasourceMapper jobDatasourceMapper;
    @Resource
    private StatTaskService statTaskService;
    @Resource
    private JobApiTaskService jobApiTaskService;

    public StatTaskService getStatTaskService() {
        return statTaskService;
    }

    public JobApiTaskService getJobApiTaskService() {
        return jobApiTaskService;
    }

    public String getI18n() {
        return i18n;
    }

    public String getAccessToken() {
        return accessToken;
    }

    public String getEmailUserName() {
        return emailUserName;
    }

    public int getTriggerPoolFastMax() {
        return triggerPoolFastMax < 200 ? 200 : triggerPoolFastMax;
    }

    public int getTriggerPoolSlowMax() {
        return triggerPoolSlowMax < 100 ? 100 : triggerPoolSlowMax;
    }

    public int getLogretentiondays() {
        return logretentiondays < 7 ? -1 : logretentiondays;
    }

    public JobLogMapper getJobLogMapper() {
        return jobLogMapper;
    }

    public JobInfoMapper getJobInfoMapper() {
        return jobInfoMapper;
    }

    public JobRegistryMapper getJobRegistryMapper() {
        return jobRegistryMapper;
    }

    public JobGroupMapper getJobGroupMapper() {
        return jobGroupMapper;
    }

    public JobLogReportMapper getJobLogReportMapper() {
        return jobLogReportMapper;
    }

    public JavaMailSender getMailSender() {
        return mailSender;
    }

    public DataSource getDataSource() {
        return dataSource;
    }

    public JobDatasourceMapper getJobDatasourceMapper() {
        return jobDatasourceMapper;
    }

    public boolean isSchedulerEnabled() {
        return schedulerEnabled;
    }

    public String getDataSourceAESKey() {
        return dataSourceAESKey;
    }

    public void setDataSourceAESKey(String dataSourceAESKey) {
        this.dataSourceAESKey = dataSourceAESKey;
    }
}
