package com.wugui.datax.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datax.admin.entity.JobApiIpBlacklist;
import com.wugui.datax.admin.mapper.JobApiIpBlacklistMapper;
import com.wugui.datax.admin.service.JobApiIpBlacklistService;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 开放 API 客户端 IP 黑名单管控服务实现类
 * 内置 JVM 内存级快照缓存与 60 秒自动兜底刷新机制，确保网关前置拦截零数据库 IO 开销。
 *
 * @author ypc
 * @since 2026-11-03
 */
@Service
public class JobApiIpBlacklistServiceImpl extends ServiceImpl<JobApiIpBlacklistMapper, JobApiIpBlacklist>
        implements JobApiIpBlacklistService {

    private static final Logger logger = LoggerFactory.getLogger(JobApiIpBlacklistServiceImpl.class);

    public static final String GLOBAL_APP_KEY = "*";

    /**
     * 缓存兜底刷新周期：60 秒
     */
    private static final long CACHE_TTL_MS = 60_000L;

    @Autowired
    private JobApiIpBlacklistMapper jobApiIpBlacklistMapper;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    /**
     * JVM 内存活跃黑名单只读快照
     */
    private volatile List<JobApiIpBlacklist> activeCache = Collections.emptyList();

    /**
     * 上次从数据库刷新快照的时间戳
     */
    private volatile long lastRefreshTimeMs = 0L;

    /**
     * 启动时自动确保平台系统表 job_api_ip_blacklist 存在并预热内存缓存
     */
    @PostConstruct
    public void initTableAndCache() {
        if (jdbcTemplate != null) {
            try {
                String createTableSql = "CREATE TABLE IF NOT EXISTS `job_api_ip_blacklist` ("
                        + "`id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增主键ID',"
                        + "`ip_address` varchar(64) NOT NULL COMMENT '被封禁的客户端IP地址(支持精确IP、*通配符或CIDR网段)',"
                        + "`app_key` varchar(64) NOT NULL DEFAULT '*' COMMENT '封禁作用范围：* 代表全局封禁所有API账号，指定app_key代表仅封禁该账号',"
                        + "`reason` varchar(255) DEFAULT NULL COMMENT '封禁原因说明或拦截备注',"
                        + "`source_log_id` bigint(20) DEFAULT NULL COMMENT '关联触发拉黑的源调用审计日志ID(job_api_log.id)',"
                        + "`status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '黑名单状态：1-生效中，0-已解封',"
                        + "`create_by` varchar(64) DEFAULT NULL COMMENT '操作管理员用户名',"
                        + "`create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                        + "`update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',"
                        + "PRIMARY KEY (`id`) USING BTREE,"
                        + "UNIQUE INDEX `uk_ip_appkey` (`ip_address`, `app_key`) USING BTREE,"
                        + "INDEX `idx_status` (`status`) USING BTREE,"
                        + "INDEX `idx_source_log` (`source_log_id`) USING BTREE"
                        + ") ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '开放API客户端IP黑名单管控表' ROW_FORMAT = Dynamic";
                jdbcTemplate.execute(createTableSql);
            } catch (Exception e) {
                logger.warn("[JobApiIpBlacklistService] 自动检查/初始化表 job_api_ip_blacklist 忽略异常: {}", e.getMessage());
            }
        }
        refreshCache();
    }

    @Override
    public synchronized void refreshCache() {
        try {
            List<JobApiIpBlacklist> list = jobApiIpBlacklistMapper.listActiveBlacklist();
            this.activeCache = (list != null) ? Collections.unmodifiableList(new ArrayList<>(list)) : Collections.emptyList();
            this.lastRefreshTimeMs = System.currentTimeMillis();
        } catch (Exception e) {
            logger.warn("[JobApiIpBlacklistService] 刷新 IP 黑名单缓存异常: {}", e.getMessage());
        }
    }

    @Override
    public List<JobApiIpBlacklist> getActiveBlacklistSnapshot() {
        long now = System.currentTimeMillis();
        if (now - this.lastRefreshTimeMs > CACHE_TTL_MS) {
            refreshCache();
        }
        return this.activeCache;
    }

    @Override
    public JobApiIpBlacklist matchActiveBlacklist(String clientIp, String appKey) {
        if (StringUtils.isBlank(clientIp)) {
            return null;
        }
        String normIp = clientIp.trim();
        String normAk = StringUtils.isNotBlank(appKey) ? appKey.trim() : "";

        List<JobApiIpBlacklist> snapshot = getActiveBlacklistSnapshot();
        if (snapshot.isEmpty()) {
            return null;
        }

        for (JobApiIpBlacklist rule : snapshot) {
            if (rule == null || !Integer.valueOf(1).equals(rule.getStatus())) {
                continue;
            }
            String ruleAk = StringUtils.defaultIfBlank(rule.getAppKey(), GLOBAL_APP_KEY).trim();
            boolean scopeMatched = GLOBAL_APP_KEY.equals(ruleAk)
                    || "ALL".equalsIgnoreCase(ruleAk)
                    || (StringUtils.isNotBlank(normAk) && ruleAk.equalsIgnoreCase(normAk));
            if (!scopeMatched) {
                continue;
            }
            if (isIpMatchRule(normIp, rule.getIpAddress())) {
                return rule;
            }
        }
        return null;
    }

    /**
     * 判断客户端 IP 是否命中单条黑名单 IP 表达式（支持精确匹配、* 通配符、IPv4 CIDR 网段）
     */
    public static boolean isIpMatchRule(String clientIp, String ruleIpPattern) {
        if (StringUtils.isAnyBlank(clientIp, ruleIpPattern)) {
            return false;
        }
        String ip = clientIp.trim();
        String pattern = ruleIpPattern.trim();

        // 1. 精确相等或全局通配
        if (pattern.equalsIgnoreCase(ip) || "*".equals(pattern)) {
            return true;
        }

        // 2. 含星号通配符 (如 192.168.1.*)
        if (pattern.contains("*")) {
            String regex = "^" + Pattern.quote(pattern).replace("\\*", ".*") + "$";
            return Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(ip).matches();
        }

        // 3. IPv4 CIDR 网段匹配 (如 192.168.1.0/24)
        if (pattern.contains("/")) {
            try {
                String[] parts = pattern.split("/");
                if (parts.length == 2) {
                    long ipLong = ipv4ToLong(ip);
                    long netLong = ipv4ToLong(parts[0].trim());
                    int prefixLen = Integer.parseInt(parts[1].trim());
                    if (ipLong >= 0 && netLong >= 0 && prefixLen >= 0 && prefixLen <= 32) {
                        long mask = prefixLen == 0 ? 0L : (~0L << (32 - prefixLen)) & 0xFFFFFFFFL;
                        return (ipLong & mask) == (netLong & mask);
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    /**
     * 将点分十进制 IPv4 转换为无符号 32 位长整型，非标准 IPv4 返回 -1
     */
    private static long ipv4ToLong(String ipv4) {
        String[] octets = ipv4.split("\\.");
        if (octets.length != 4) {
            return -1L;
        }
        long result = 0L;
        for (String octet : octets) {
            int val = Integer.parseInt(octet.trim());
            if (val < 0 || val > 255) {
                return -1L;
            }
            result = (result << 8) | val;
        }
        return result & 0xFFFFFFFFL;
    }

    @Override
    public JobApiIpBlacklist addOrUpdateBlacklist(String ipAddress, String appKey, String reason, Long sourceLogId, String operator) {
        if (StringUtils.isBlank(ipAddress)) {
            throw new IllegalArgumentException("待封禁的 IP 地址不能为空");
        }
        String normIp = ipAddress.trim();
        String normAk = StringUtils.isNotBlank(appKey) ? appKey.trim() : GLOBAL_APP_KEY;
        String safeReason = StringUtils.abbreviate(StringUtils.defaultIfBlank(reason, "管理员从调用日志审计手动拉黑"), 250);

        JobApiIpBlacklist existing = jobApiIpBlacklistMapper.getByIpAndAppKey(normIp, normAk);
        Date now = new Date();
        if (existing != null) {
            existing.setStatus(1);
            existing.setReason(safeReason);
            if (sourceLogId != null) {
                existing.setSourceLogId(sourceLogId);
            }
            if (StringUtils.isNotBlank(operator)) {
                existing.setCreateBy(operator);
            }
            existing.setUpdateTime(now);
            this.updateById(existing);
            refreshCache();
            return existing;
        } else {
            JobApiIpBlacklist record = new JobApiIpBlacklist();
            record.setIpAddress(normIp);
            record.setAppKey(normAk);
            record.setReason(safeReason);
            record.setSourceLogId(sourceLogId);
            record.setStatus(1);
            record.setCreateBy(StringUtils.defaultIfBlank(operator, "admin"));
            record.setCreateTime(now);
            record.setUpdateTime(now);
            this.save(record);
            refreshCache();
            return record;
        }
    }

    @Override
    public int unblockByIp(String ipAddress, String appKey) {
        if (StringUtils.isBlank(ipAddress)) {
            return 0;
        }
        String normIp = ipAddress.trim();
        QueryWrapper<JobApiIpBlacklist> qw = new QueryWrapper<>();
        qw.eq("ip_address", normIp).eq("status", 1);
        if (StringUtils.isNotBlank(appKey) && !GLOBAL_APP_KEY.equals(appKey.trim())) {
            String ak = appKey.trim();
            qw.and(w -> w.eq("app_key", GLOBAL_APP_KEY).or().eq("app_key", ak));
        }

        List<JobApiIpBlacklist> matched = this.list(qw);
        int count = 0;
        if (matched != null && !matched.isEmpty()) {
            Date now = new Date();
            for (JobApiIpBlacklist item : matched) {
                item.setStatus(0);
                item.setUpdateTime(now);
                if (this.updateById(item)) {
                    count++;
                }
            }
        }
        refreshCache();
        return count;
    }

    @Override
    public boolean isLoopbackIp(String ip) {
        if (StringUtils.isBlank(ip)) {
            return false;
        }
        String s = ip.trim().toLowerCase();
        return "127.0.0.1".equals(s)
                || "localhost".equals(s)
                || "::1".equals(s)
                || "0:0:0:0:0:0:0:1".equals(s)
                || s.startsWith("127.");
    }

    @Override
    public String extractClientIp(HttpServletRequest request) {
        if (request == null) {
            return "";
        }
        String ip = request.getHeader("X-Forwarded-For");
        if (StringUtils.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (StringUtils.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (StringUtils.isNotBlank(ip) && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return "0:0:0:0:0:0:0:1".equals(ip) ? "127.0.0.1" : StringUtils.defaultString(ip).trim();
    }
}
