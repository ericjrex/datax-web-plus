package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.dto.ApiScriptTestDto;
import com.wugui.datax.admin.dto.ApiScriptTestResultDto;
import com.wugui.datax.admin.dto.ApiTestRunDto;
import com.wugui.datax.admin.dto.ApiTestRunResultDto;
import com.wugui.datax.admin.dto.JobApiTaskDto;
import com.wugui.datax.admin.entity.JobApiTask;

import java.util.Map;

/**
 * 接口数据采集任务业务服务接口
 *
 * @author ypc
 */
public interface JobApiTaskService extends IService<JobApiTask> {

    /**
     * 分页查询接口任务列表
     *
     * @param pageNo 当前页
     * @param pageSize 每页条数
     * @param taskName 任务名称
     * @param status 状态
     * @return 分页对象
     */
    IPage<JobApiTask> getApiTaskPage(int pageNo, int pageSize, String taskName, Integer status);

    /**
     * 根据主键查询详细配置
     *
     * @param id 任务ID
     * @return 任务实体
     */
    JobApiTask getApiTaskById(Long id);

    /**
     * 保存或更新接口采集任务
     *
     * @param dto 任务配置DTO
     * @param username 操作用户
     * @return 任务ID
     */
    Long saveOrUpdateApiTask(JobApiTaskDto dto, String username);

    /**
     * 删除接口任务及关联的xxl-job
     *
     * @param id 任务ID
     * @return 是否成功
     */
    boolean deleteApiTask(Long id);

    /**
     * 开启定时调度
     *
     * @param id 任务ID
     * @return 是否成功
     */
    boolean startApiTask(Long id);

    /**
     * 停止定时调度
     *
     * @param id 任务ID
     * @return 是否成功
     */
    boolean stopApiTask(Long id);

    /**
     * 立即执行一次接口拉取入库
     *
     * @param id 任务ID
     * @return 执行反馈消息
     */
    String executeOnce(Long id);

    /**
     * 立即执行一次接口拉取入库 (支持指定日志ID与触发源)
     *
     * @param id 任务ID
     * @param logId 调度流水日志ID (可选，若为null则自动创建)
     * @param triggerSource 触发源: MANUAL 或 CRON
     * @return 执行反馈消息
     */
    String executeOnce(Long id, Long logId, String triggerSource);

    /**
     * 分页查询接口任务执行历史流水记录
     *
     * @param taskId 接口任务ID
     * @param current 当前页码
     * @param size 每页条数
     * @param logStatus 日志状态过滤 (1-成功, 2-失败, 3-进行中)
     * @param triggerType 触发方式过滤 (MANUAL 或 CRON)
     * @return 分页结果数据 Map
     */
    Map<String, Object> getApiTaskLogPage(Long taskId, int current, int size, Integer logStatus, String triggerType);

    /**
     * 在线试运行与接口取样
     *
     * @param dto 试运行参数
     * @return 试运行取样结果
     */
    ApiTestRunResultDto debugSample(ApiTestRunDto dto);

    /**
     * 在线单测前置脚本与打印捕获
     *
     * @param dto 脚本测试参数
     * @return 脚本测试结果
     */
    ApiScriptTestResultDto testScript(ApiScriptTestDto dto);
}
