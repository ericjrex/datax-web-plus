package com.wugui.datax.admin.interceptor;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.extension.api.R;
import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.util.concurrent.RateLimiter;
import com.wugui.datax.admin.entity.JobApiAccount;
import com.wugui.datax.admin.entity.JobApiIpBlacklist;
import com.wugui.datax.admin.entity.JobApiLog;
import com.wugui.datax.admin.service.JobApiAccountService;
import com.wugui.datax.admin.service.JobApiIpBlacklistService;
import com.wugui.datax.admin.service.JobApiLogService;
import com.wugui.datax.admin.util.OpenApiSignUtil;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.Arrays;
import java.util.Date;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

/**
 * 外部开放 API 安全准入网关拦截器
 * 负责 AK/SK 验签、时间戳防重放、IP 来源白名单与单账号 QPS 令牌桶限流
 *
 * @author ypc
 * @since 2026-10-28
 */
@Component
public class OpenApiSecurityInterceptor implements HandlerInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(OpenApiSecurityInterceptor.class);

    public static final String ATTR_CURRENT_ACCOUNT = "CURRENT_OPEN_API_ACCOUNT";

    public static final String HEADER_ACCESS_KEY = "accessKey";
    public static final String HEADER_TIMESTAMP = "timestamp";
    public static final String HEADER_NONCE = "nonce";
    public static final String HEADER_SIGN = "sign";

    @Autowired
    private JobApiAccountService jobApiAccountService;

    @Autowired
    private JobApiIpBlacklistService jobApiIpBlacklistService;

    @Autowired
    private JobApiLogService jobApiLogService;

    /**
     * 单账号 QPS 令牌桶本地缓存 (最大容纳 1000 个账号，30分钟无请求自动剔除)
     */
    private final Cache<String, RateLimiter> rateLimiterCache = CacheBuilder.newBuilder()
            .maximumSize(1000)
            .expireAfterAccess(30, TimeUnit.MINUTES)
            .build();

    /**
     * 黑名单拦截审计日志防洪限频缓存 (同一 clientIp + appKey 每 60 秒最多落库 1 条黑名单拦截审计记录)
     */
    private final Cache<String, Boolean> blacklistLogThrottleCache = CacheBuilder.newBuilder()
            .maximumSize(2000)
            .expireAfterWrite(60, TimeUnit.SECONDS)
            .build();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 放行 OPTIONS 预检请求
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String accessKey = getParamOrHeader(request, HEADER_ACCESS_KEY);
        String timestampStr = getParamOrHeader(request, HEADER_TIMESTAMP);
        String nonce = getParamOrHeader(request, HEADER_NONCE);
        String sign = getParamOrHeader(request, HEADER_SIGN);

        // 0. 网关前置：IP 黑名单一票否决校验 (拒绝优先于允许，内存级匹配零 DB IO)
        String clientIp = getClientIp(request);
        JobApiIpBlacklist hitBlacklist = jobApiIpBlacklistService.matchActiveBlacklist(clientIp, accessKey);
        if (hitBlacklist != null) {
            String reasonDesc = StringUtils.defaultIfBlank(hitBlacklist.getReason(), "恶意访问或违规调用");
            String errMsg = "安全拦截: 客户端 IP [" + clientIp + "] 已被列入黑名单 (" + reasonDesc + ")";
            logger.warn("[OpenApi] 命中 IP 黑名单一票否决拦截: ip={}, accessKey={}, ruleId={}", clientIp, accessKey, hitBlacklist.getId());
            recordBlacklistInterceptLogThrottled(accessKey, clientIp, request, errMsg);
            writeErrorResponse(response, HttpServletResponse.SC_FORBIDDEN, errMsg);
            return false;
        }

        // 1. 基础凭据完整性检查
        if (StringUtils.isAnyBlank(accessKey, timestampStr, nonce, sign)) {
            writeErrorResponse(response, HttpServletResponse.SC_UNAUTHORIZED, "缺少必要的鉴权头: accessKey, timestamp, nonce, sign 均为必传项");
            return false;
        }

        long timestamp;
        try {
            timestamp = Long.parseLong(timestampStr.trim());
        } catch (NumberFormatException e) {
            writeErrorResponse(response, HttpServletResponse.SC_BAD_REQUEST, "时间戳格式错误，必须为秒级数字");
            return false;
        }

        // 2. 时间戳防重放校验 (允许 5 分钟误差)
        if (!OpenApiSignUtil.verifyTimestamp(timestamp)) {
            writeErrorResponse(response, HttpServletResponse.SC_UNAUTHORIZED, "请求已过期或客户端时钟偏差过大 (最大允许5分钟)");
            return false;
        }

        // 3. 校验账号存在性与启用状态
        JobApiAccount account = jobApiAccountService.getActiveAccount(accessKey.trim());
        if (account == null) {
            writeErrorResponse(response, HttpServletResponse.SC_UNAUTHORIZED, "无效的 accessKey 或该接口账号已被停用");
            return false;
        }

        // 4. IP 来源白名单校验
        if (StringUtils.isNotBlank(account.getAllowedIps())) {
            String[] ips = account.getAllowedIps().split("[,\\s]+");
            boolean inWhiteList = Arrays.stream(ips).anyMatch(ip -> ip.trim().equalsIgnoreCase(clientIp));
            if (!inWhiteList) {
                logger.warn("[OpenApi] 拦截未授权 IP 访问: account={}, ip={}", account.getAccountName(), clientIp);
                writeErrorResponse(response, HttpServletResponse.SC_FORBIDDEN, "客户端 IP [" + clientIp + "] 未在授权白名单列表中");
                return false;
            }
        }

        // 5. Nonce 唯一性防重放校验
        if (!OpenApiSignUtil.verifyAndRecordNonce(accessKey, nonce)) {
            writeErrorResponse(response, HttpServletResponse.SC_UNAUTHORIZED, "重复的请求随机数 nonce，请求可能已被重放拦截");
            return false;
        }

        // 6. 签名准确性校验
        String expectedSign = OpenApiSignUtil.calculateSignature(
                request.getMethod(),
                request.getRequestURI(),
                accessKey,
                timestamp,
                nonce,
                account.getAppSecret()
        );

        if (!OpenApiSignUtil.constantTimeEquals(expectedSign, sign.trim())) {
            logger.warn("[OpenApi] 签名校验失败: account={}, uri={}", account.getAccountName(), request.getRequestURI());
            writeErrorResponse(response, HttpServletResponse.SC_UNAUTHORIZED, "签名校验失败，请核对 Secret 密钥与参数拼接规则");
            return false;
        }

        // 7. 单账号 QPS 令牌桶限流保护
        int qps = (account.getRateLimitQps() != null && account.getRateLimitQps() > 0) ? account.getRateLimitQps() : 10;
        try {
            RateLimiter limiter = rateLimiterCache.get(accessKey, () -> RateLimiter.create(qps));
            if (!limiter.tryAcquire()) {
                writeErrorResponse(response, 429, "当前账号调用过于频繁，已触发 QPS 上限保护 (" + qps + "/s)");
                return false;
            }
        } catch (ExecutionException ignored) {
        }

        // 将当前已鉴权账号存入请求上下文，供下游 Controller 取用
        request.setAttribute(ATTR_CURRENT_ACCOUNT, account);
        return true;
    }

    /**
     * 获取请求参数，优先读 Header，其次读 QueryParam
     */
    private String getParamOrHeader(HttpServletRequest request, String name) {
        String val = request.getHeader(name);
        if (StringUtils.isBlank(val)) {
            val = request.getParameter(name);
        }
        return val;
    }

    /**
     * 获取客户端真实 IP (复用公共黑名单服务提取逻辑)
     */
    private String getClientIp(HttpServletRequest request) {
        return jobApiIpBlacklistService.extractClientIp(request);
    }

    /**
     * 限频记录黑名单拦截审计日志 (防止恶意 IP 洪水请求打爆审计表)
     */
    private void recordBlacklistInterceptLogThrottled(String accessKey, String clientIp, HttpServletRequest request, String errMsg) {
        try {
            String safeAk = StringUtils.defaultIfBlank(accessKey, "UNKNOWN_AK").trim();
            String throttleKey = clientIp + "|" + safeAk;
            if (blacklistLogThrottleCache.getIfPresent(throttleKey) != null) {
                return;
            }
            blacklistLogThrottleCache.put(throttleKey, Boolean.TRUE);

            JobApiLog log = new JobApiLog();
            log.setAppKey(StringUtils.abbreviate(safeAk, 60));
            log.setClientIp(StringUtils.abbreviate(clientIp, 60));
            log.setClientSource(jobApiLogService.resolveClientSource(request));
            log.setUserAgent(jobApiLogService.extractUserAgent(request));
            log.setDomainCode("ALL");
            log.setExecuteSql("[网关黑名单拦截] " + request.getMethod() + " " + request.getRequestURI());
            log.setTablesInvolved("");
            log.setResultRows(0);
            log.setCostMs(0);
            log.setStatus(2);
            log.setErrorMsg(StringUtils.abbreviate(errMsg, 500));
            log.setCreateTime(new Date());
            jobApiLogService.logAsync(log);
        } catch (Exception ignored) {
        }
    }

    /**
     * 输出标准 JSON 格式错误响应
     */
    private void writeErrorResponse(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        PrintWriter writer = response.getWriter();
        R<String> fail = R.failed(message);
        fail.setCode(status);
        writer.write(JSON.toJSONString(fail));
        writer.flush();
    }
}
