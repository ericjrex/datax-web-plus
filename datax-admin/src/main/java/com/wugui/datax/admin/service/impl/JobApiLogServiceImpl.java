package com.wugui.datax.admin.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datax.admin.entity.JobApiLog;
import com.wugui.datax.admin.mapper.JobApiLogMapper;
import com.wugui.datax.admin.service.JobApiLogService;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.servlet.http.HttpServletRequest;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 外部 API 执行与安全审计日志服务实现类
 *
 * @author ypc
 * @since 2026-10-28
 */
@Service
public class JobApiLogServiceImpl extends ServiceImpl<JobApiLogMapper, JobApiLog>
        implements JobApiLogService {

    private static final Logger logger = LoggerFactory.getLogger(JobApiLogServiceImpl.class);

    public static final String HEADER_CLIENT_SOURCE = "X-Client-Source";
    public static final String HEADER_USER_AGENT = "User-Agent";

    private static final Pattern EDGE_VERSION_PATTERN = Pattern.compile("(?i)Edg(?:e|A|iOS)?/(\\d+)");
    private static final Pattern OPR_VERSION_PATTERN = Pattern.compile("(?i)(?:OPR|Opera)/(\\d+)");
    private static final Pattern CHROME_VERSION_PATTERN = Pattern.compile("(?i)Chrome/(\\d+)");
    private static final Pattern FIREFOX_VERSION_PATTERN = Pattern.compile("(?i)Firefox/(\\d+)");
    private static final Pattern SAFARI_VERSION_PATTERN = Pattern.compile("(?i)Version/(\\d+).*Safari/");

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    private final ExecutorService logExecutor = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "OpenApiLog-Pool");
        t.setDaemon(true);
        return t;
    });

    /**
     * 启动时自动检查并幂等补齐 job_api_log 表的 client_source 和 user_agent 字段
     */
    @PostConstruct
    public void ensureClientSourceColumns() {
        if (jdbcTemplate == null) {
            return;
        }
        try {
            Integer clientSourceCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_api_log' AND COLUMN_NAME = 'client_source'",
                    Integer.class);
            if (clientSourceCount == null || clientSourceCount == 0) {
                jdbcTemplate.execute("ALTER TABLE `job_api_log` ADD COLUMN `client_source` varchar(128) DEFAULT NULL COMMENT '调用终端或AI工具来源标识' AFTER `client_ip`");
                jdbcTemplate.execute("ALTER TABLE `job_api_log` ADD INDEX `idx_client_source` (`client_source`) USING BTREE");
                logger.info("[JobApiLogService] 已自动为 job_api_log 补齐 client_source 字段与索引");
            }

            Integer userAgentCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_api_log' AND COLUMN_NAME = 'user_agent'",
                    Integer.class);
            if (userAgentCount == null || userAgentCount == 0) {
                jdbcTemplate.execute("ALTER TABLE `job_api_log` ADD COLUMN `user_agent` varchar(512) DEFAULT NULL COMMENT '原始 HTTP User-Agent 请求头' AFTER `client_source`");
                logger.info("[JobApiLogService] 已自动为 job_api_log 补齐 user_agent 字段");
            }
        } catch (Exception e) {
            logger.warn("[JobApiLogService] 自动检查/补齐 job_api_log 终端识别字段忽略异常: {}", e.getMessage());
        }
    }

    @Override
    public void logAsync(JobApiLog apiLog) {
        if (apiLog == null) {
            return;
        }
        if (apiLog.getCreateTime() == null) {
            apiLog.setCreateTime(new Date());
        }
        if (StringUtils.isBlank(apiLog.getClientSource()) && StringUtils.isNotBlank(apiLog.getUserAgent())) {
            apiLog.setClientSource(parseClientSourceFromHeaders(null, apiLog.getUserAgent()));
        }
        logExecutor.submit(() -> {
            try {
                this.save(apiLog);
            } catch (Exception e) {
                logger.error("[OpenApi] 异步持久化审计日志失败: {}", e.getMessage(), e);
            }
        });
    }

    @Override
    public String resolveClientSource(HttpServletRequest request) {
        if (request == null) {
            return "未知终端";
        }
        String explicitSource = request.getHeader(HEADER_CLIENT_SOURCE);
        if (StringUtils.isBlank(explicitSource)) {
            explicitSource = request.getParameter("clientSource");
        }
        String rawUa = request.getHeader(HEADER_USER_AGENT);
        return parseClientSourceFromHeaders(explicitSource, rawUa);
    }

    @Override
    public String extractUserAgent(HttpServletRequest request) {
        if (request == null) {
            return "";
        }
        String rawUa = request.getHeader(HEADER_USER_AGENT);
        return sanitizeHeaderText(rawUa, 500);
    }

    /**
     * 根据 X-Client-Source 和 User-Agent 综合归一化识别调用终端或 AI 工具
     */
    private String parseClientSourceFromHeaders(String explicitSource, String rawUa) {
        String cleanExplicit = sanitizeHeaderText(explicitSource, 120);
        if (StringUtils.isNotBlank(cleanExplicit)) {
            return normalizeAiToolLabel(cleanExplicit);
        }

        String ua = sanitizeHeaderText(rawUa, 500);
        if (StringUtils.isBlank(ua)) {
            return "未知终端";
        }
        String lowerUa = ua.toLowerCase();

        // 1. 优先识别 AI IDE / Agent / MCP 客户端特征
        if (lowerUa.contains("trae")) {
            return "Trae (MCP)";
        }
        if (lowerUa.contains("workbuddy") || lowerUa.contains("codebuddy")) {
            return "WorkBuddy (MCP)";
        }
        if (lowerUa.contains("qoder")) {
            return "Qoder (MCP)";
        }
        if (lowerUa.contains("antigravity")) {
            return "Antigravity (MCP)";
        }
        if (lowerUa.contains("deepseek") || lowerUa.contains("dsh")) {
            return "DeepSeek (MCP)";
        }
        if (lowerUa.contains("opencode")) {
            return "OpenCode (MCP)";
        }
        if (lowerUa.contains("codex")) {
            return "Codex (MCP)";
        }
        if (lowerUa.contains("cursor")) {
            return "Cursor (MCP)";
        }
        if (lowerUa.contains("windsurf") || lowerUa.contains("codeium")) {
            return "Windsurf (MCP)";
        }
        if (lowerUa.contains("claude")) {
            return "Claude (MCP)";
        }
        if (lowerUa.contains("datax-mcp")) {
            return "MCP Client (Python)";
        }

        // 2. 识别主流接口调试与命令行工具
        if (lowerUa.contains("apifox")) {
            return "Apifox";
        }
        if (lowerUa.contains("postman")) {
            return "Postman";
        }
        if (lowerUa.contains("insomnia")) {
            return "Insomnia";
        }
        if (lowerUa.contains("apipost")) {
            return "ApiPost";
        }
        if (lowerUa.startsWith("curl/") || lowerUa.contains(" curl/")) {
            return "curl 命令行";
        }
        if (lowerUa.startsWith("wget/") || lowerUa.contains(" wget/")) {
            return "Wget 命令行";
        }
        if (lowerUa.contains("httpie")) {
            return "HTTPie";
        }

        // 3. 识别主流浏览器 (注意顺序：Edge / Opera 包含 Chrome 字样，必须先于 Chrome 匹配)
        Matcher edgeMatcher = EDGE_VERSION_PATTERN.matcher(ua);
        if (edgeMatcher.find()) {
            return "Edge " + edgeMatcher.group(1);
        }
        Matcher oprMatcher = OPR_VERSION_PATTERN.matcher(ua);
        if (oprMatcher.find()) {
            return "Opera " + oprMatcher.group(1);
        }
        Matcher chromeMatcher = CHROME_VERSION_PATTERN.matcher(ua);
        if (chromeMatcher.find()) {
            return "Chrome " + chromeMatcher.group(1);
        }
        Matcher firefoxMatcher = FIREFOX_VERSION_PATTERN.matcher(ua);
        if (firefoxMatcher.find()) {
            return "Firefox " + firefoxMatcher.group(1);
        }
        Matcher safariMatcher = SAFARI_VERSION_PATTERN.matcher(ua);
        if (safariMatcher.find() && !lowerUa.contains("chrome")) {
            return "Safari " + safariMatcher.group(1);
        }

        // 4. 识别编程语言 HTTP SDK 或旧版未带标识的 MCP 脚本
        if (lowerUa.contains("python-requests") || lowerUa.contains("python-urllib")
                || lowerUa.contains("aiohttp") || lowerUa.contains("httpx")) {
            return "Python 脚本 / MCP";
        }
        if (lowerUa.contains("java/") || lowerUa.contains("apache-httpclient") || lowerUa.contains("okhttp")) {
            return "Java 客户端";
        }
        if (lowerUa.contains("go-http-client")) {
            return "Go 客户端";
        }
        if (lowerUa.contains("axios") || lowerUa.contains("node-fetch") || lowerUa.contains("undici")) {
            return "Node.js 客户端";
        }

        // 5. 兜底提取首个标识词
        String firstToken = ua.split("[\\s;()]+")[0];
        return StringUtils.abbreviate(StringUtils.defaultIfBlank(firstToken, "未知终端"), 60);
    }

    /**
     * 规范化显式上报的 AI 工具名称
     */
    private String normalizeAiToolLabel(String label) {
        String trimmed = label.trim();
        String lower = trimmed.toLowerCase();
        if (lower.equals("trae")) {
            return "Trae (MCP)";
        }
        if (lower.equals("workbuddy") || lower.equals("codebuddy")) {
            return "WorkBuddy (MCP)";
        }
        if (lower.equals("qoder")) {
            return "Qoder (MCP)";
        }
        if (lower.equals("antigravity") || lower.equals("gemini")) {
            return "Antigravity (MCP)";
        }
        if (lower.equals("deepseek") || lower.equals("deepseek harness") || lower.equals("dsh")) {
            return "DeepSeek (MCP)";
        }
        if (lower.equals("opencode")) {
            return "OpenCode (MCP)";
        }
        if (lower.equals("codex")) {
            return "Codex (MCP)";
        }
        if (lower.equals("cursor")) {
            return "Cursor (MCP)";
        }
        if (lower.equals("windsurf")) {
            return "Windsurf (MCP)";
        }
        if (lower.equals("claude") || lower.equals("claude desktop")) {
            return "Claude (MCP)";
        }
        if (lower.equals("vscode") || lower.equals("vs code")) {
            return "VS Code (MCP)";
        }
        return StringUtils.abbreviate(trimmed, 120);
    }

    /**
     * 清洗请求头中的不可见控制字符并限制最大长度，防止日志污染与超长攻击
     */
    private String sanitizeHeaderText(String input, int maxLen) {
        if (StringUtils.isBlank(input)) {
            return "";
        }
        String cleaned = input.replaceAll("[\\r\\n\\t\\p{Cntrl}]", " ").trim();
        return StringUtils.abbreviate(cleaned, maxLen);
    }
}
