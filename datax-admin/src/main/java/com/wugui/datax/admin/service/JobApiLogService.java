package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.entity.JobApiLog;

import javax.servlet.http.HttpServletRequest;

/**
 * 外部 API 执行与安全审计日志服务接口
 *
 * @author ypc
 * @since 2026-10-28
 */
public interface JobApiLogService extends IService<JobApiLog> {

    /**
     * 异步持久化保存审计日志
     *
     * @param apiLog 审计日志实体
     */
    void logAsync(JobApiLog apiLog);

    /**
     * 解析并归一化请求端的浏览器、调试工具或 AI 工具来源名称
     *
     * @param request HTTP 请求对象
     * @return 归一化后的终端/AI工具名称（如 Trae (MCP)、WorkBuddy (MCP)、Chrome 131、Postman）
     */
    String resolveClientSource(HttpServletRequest request);

    /**
     * 提取并安全截断原始 User-Agent 字符串
     *
     * @param request HTTP 请求对象
     * @return 安全清洗后的原始 User-Agent（最长 500 字符）
     */
    String extractUserAgent(HttpServletRequest request);
}
