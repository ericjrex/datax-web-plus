package com.wugui.datax.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.api.R;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.wugui.datax.admin.dto.TableInfoDto;
import com.wugui.datax.admin.entity.JobApiAccount;
import com.wugui.datax.admin.entity.JobApiIpBlacklist;
import com.wugui.datax.admin.entity.JobApiLog;
import com.wugui.datax.admin.service.JobApiAccountService;
import com.wugui.datax.admin.service.JobApiIpBlacklistService;
import com.wugui.datax.admin.service.JobApiLogService;
import com.wugui.datax.admin.service.TableDataService;
import com.wugui.datax.admin.util.JwtTokenUtils;
import com.wugui.datax.admin.util.OpenApiPermissionUtil;
import com.wugui.datax.admin.util.OpenApiPermissionUtil.DatabaseAuth;
import com.wugui.datax.admin.util.OpenApiPermissionUtil.RowFilterRule;
import com.wugui.datax.admin.util.OpenApiTableColumnUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.Data;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 外部开放 API 账号与调用审计管理控制器 (仅平台管理员可用)
 *
 * @author ypc
 * @since 2026-10-28
 */
@RestController
@RequestMapping("/api/open/admin")
@Api(tags = "开放API管理控制台-账号与审计日志")
public class JobOpenAdminController extends BaseController {

    private static final int MAX_PAGE_SIZE = 2000;

    @Autowired
    private JobApiAccountService jobApiAccountService;

    @Autowired
    private JobApiLogService jobApiLogService;

    @Autowired
    private JobApiIpBlacklistService jobApiIpBlacklistService;

    @Autowired
    private TableDataService tableDataService;

    /**
     * 判断当前请求用户是否具有管理员特权
     */
    private boolean isCurrentAdmin(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        String token = JwtTokenUtils.extractToken(request);
        if (StringUtils.isNotBlank(token)) {
            try {
                String role = JwtTokenUtils.getUserRole(token);
                return "ROLE_ADMIN".equalsIgnoreCase(role) || "1".equals(role);
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    /**
     * 获取当前操作管理员用户名
     */
    private String getCurrentOperator(HttpServletRequest request) {
        if (request != null) {
            String token = JwtTokenUtils.extractToken(request);
            if (StringUtils.isNotBlank(token)) {
                try {
                    String username = JwtTokenUtils.getUsername(token);
                    if (StringUtils.isNotBlank(username)) {
                        return username.trim();
                    }
                } catch (Exception ignored) {
                }
            }
        }
        return "admin";
    }

    /**
     * 构建 AppKey -> 账号中文名称 映射字典公共方法
     */
    private Map<String, String> buildAppKeyAccountNameMap() {
        List<JobApiAccount> accounts = jobApiAccountService.list();
        if (accounts == null || accounts.isEmpty()) {
            return new HashMap<>(0);
        }
        Map<String, String> nameMap = new HashMap<>(accounts.size());
        for (JobApiAccount acc : accounts) {
            if (StringUtils.isNotBlank(acc.getAppKey()) && StringUtils.isNotBlank(acc.getAccountName())) {
                nameMap.put(acc.getAppKey(), acc.getAccountName());
            }
        }
        return nameMap;
    }

    /**
     * 构造安全分页参数对象，防止非法负值、零值或超大分页尺寸引发全表拉取风险
     *
     * @param pageNo      请求页码
     * @param pageSize    请求分页大小
     * @param defaultSize 默认分页大小
     * @param <T>         分页记录类型
     * @return 校验后的 MyBatis-Plus 分页对象
     */
    private <T> Page<T> buildSafePage(Integer pageNo, Integer pageSize, int defaultSize) {
        int safePageNo = (pageNo == null || pageNo < 1) ? 1 : pageNo;
        int safePageSize = (pageSize == null || pageSize < 1) ? defaultSize : Math.min(pageSize, MAX_PAGE_SIZE);
        return new Page<>(safePageNo, safePageSize);
    }

    /**
     * 规范化分页响应结果，避免全局 overflow=true 在超页查询时仍回退返回第 1 页数据
     *
     * @param pageResult      MyBatis-Plus 查询返回的分页结果
     * @param requestedPageNo 客户端实际请求的合法页码
     * @param <T>             分页记录类型
     * @return 规范化后的分页结果
     */
    private <T> Page<T> normalizePageOverflow(Page<T> pageResult, long requestedPageNo) {
        if (pageResult == null) {
            return null;
        }
        long totalPages = Math.max(1L, pageResult.getPages());
        if (requestedPageNo > totalPages) {
            pageResult.setCurrent(requestedPageNo);
            pageResult.setRecords(Collections.emptyList());
        }
        return pageResult;
    }

    // ==========================================
    // 1. API 账号管理接口
    // ==========================================

    @GetMapping("/account/page")
    @ApiOperation("分页查询 API 账号列表 (仅管理员)")
    public R<Page<JobApiAccount>> pageAccounts(
            HttpServletRequest request,
            @RequestParam(defaultValue = "1") Integer pageNo,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String domainCode,
            @RequestParam(required = false) Integer status) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看接口账号列表");
        }

        Page<JobApiAccount> page = buildSafePage(pageNo, pageSize, 10);
        long requestedPageNo = page.getCurrent();
        QueryWrapper<JobApiAccount> qw = new QueryWrapper<>();
        if (StringUtils.isNotBlank(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like("account_name", kw).or().like("app_key", kw));
        }
        if (StringUtils.isNotBlank(domainCode)) {
            qw.eq("domain_code", domainCode.trim());
        }
        if (status != null) {
            qw.eq("status", status);
        }
        qw.orderByDesc("id");

        Page<JobApiAccount> result = normalizePageOverflow(jobApiAccountService.page(page, qw), requestedPageNo);
        if (result != null && result.getRecords() != null) {
            for (JobApiAccount acc : result.getRecords()) {
                // 列表安全脱敏：AppSecret 掩码展示
                if (StringUtils.isNotBlank(acc.getAppSecret()) && acc.getAppSecret().length() > 8) {
                    acc.setAppSecret(acc.getAppSecret().substring(0, 4) + "••••••••" + acc.getAppSecret().substring(acc.getAppSecret().length() - 4));
                }
            }
        }
        return success(result);
    }

    @PostMapping("/account/save")
    @ApiOperation("新增或修改 API 账号 (仅管理员)")
    public R<JobApiAccount> saveAccount(
            HttpServletRequest request,
            @RequestBody JobApiAccount account) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可配置接口账号");
        }
        if (account == null) {
            return failed("参数错误: 账号配置对象不能为空");
        }
        if (StringUtils.isBlank(account.getAccountName())) {
            return failed("参数错误: 账号名称不能为空");
        }

        // 解析并校验多数据源授权清单
        List<DatabaseAuth> authList = OpenApiPermissionUtil.parsePermissions(
                account.getPermissions(), account.getDatasourceId(), account.getAllowedTables());
        if (authList.isEmpty()) {
            return failed("参数错误: 必须至少配置一个数据源库授权");
        }
        try {
            OpenApiPermissionUtil.validateAllTenantPolicies(authList);
        } catch (IllegalArgumentException e) {
            return failed("参数错误: " + e.getMessage());
        }

        // 双写兼容旧单库字段
        DatabaseAuth firstAuth = authList.get(0);
        if (account.getDatasourceId() == null) {
            account.setDatasourceId(firstAuth.getDatasourceId());
        }
        if (StringUtils.isBlank(account.getAllowedTables())) {
            if (Boolean.TRUE.equals(firstAuth.getAllTables()) || firstAuth.getTables() == null || firstAuth.getTables().isEmpty()) {
                account.setAllowedTables("*");
            } else {
                account.setAllowedTables(String.join(",", firstAuth.getTables()));
            }
        }
        if (StringUtils.isBlank(account.getDomainCode())) {
            account.setDomainCode("ALL");
        }

        if (account.getId() == null) {
            // 新增：自动生成 AK/SK
            JobApiAccount created = jobApiAccountService.createAccount(account);
            return success(created);
        } else {
            // 更新现有账号
            JobApiAccount existing = jobApiAccountService.getById(account.getId());
            if (existing == null) {
                return failed("更新失败: 未找到指定ID的账号");
            }
            existing.setAccountName(account.getAccountName());
            existing.setDomainCode(account.getDomainCode());
            existing.setDatasourceId(account.getDatasourceId());
            existing.setAllowedTables(account.getAllowedTables());
            existing.setPermissions(account.getPermissions());
            existing.setAllowedIps(account.getAllowedIps());
            existing.setRateLimitQps(account.getRateLimitQps());
            existing.setStatus(account.getStatus());
            existing.setComments(account.getComments());
            existing.setUpdateTime(new Date());
            jobApiAccountService.updateById(existing);
            return success(existing);
        }
    }

    /**
     * 预览指定数据源下各数据表命中的行级字段过滤规则 (仅管理员)
     */
    @PostMapping("/account/previewRuleMatches")
    @ApiOperation("预览数据表命中的字段行过滤规则 (仅管理员)")
    public R<Map<String, Object>> previewRuleMatches(
            HttpServletRequest request,
            @RequestBody PreviewRuleMatchRequest previewReq) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可预览行级过滤规则命中情况");
        }
        if (previewReq == null || previewReq.getDatasourceId() == null) {
            return failed("参数错误: 数据源 ID 不能为空");
        }

        List<RowFilterRule> rules = previewReq.getRowFilterRules() != null
                ? previewReq.getRowFilterRules()
                : Collections.emptyList();
        try {
            for (RowFilterRule rule : rules) {
                OpenApiPermissionUtil.validateRowFilterRule(String.valueOf(previewReq.getDatasourceId()), rule);
            }
        } catch (IllegalArgumentException e) {
            return failed("参数错误: " + e.getMessage());
        }

        List<String> targetTables = previewReq.getTables();
        if (targetTables == null || targetTables.isEmpty()) {
            try {
                List<TableInfoDto> allTables = tableDataService.getTablesWithComments(previewReq.getDatasourceId(), null);
                targetTables = new ArrayList<>();
                if (allTables != null) {
                    for (TableInfoDto t : allTables) {
                        if (t == null || StringUtils.isBlank(t.getTableName())) {
                            continue;
                        }
                        String lower = t.getTableName().trim().toLowerCase();
                        if (!lower.startsWith("job_") && !lower.startsWith("sys_") && !lower.startsWith("schema_")) {
                            targetTables.add(t.getTableName().trim());
                        }
                    }
                }
            } catch (Exception e) {
                return failed("获取数据源表清单失败: " + e.getMessage());
            }
        }

        Map<String, List<String>> matchedColumns = new LinkedHashMap<>();
        Map<String, List<String>> missingStrictColumns = new LinkedHashMap<>();
        List<String> failedTables = new ArrayList<>();

        for (String rawTable : targetTables) {
            if (StringUtils.isBlank(rawTable)) {
                continue;
            }
            String lowerTbl = OpenApiPermissionUtil.normalizeTableName(rawTable);
            try {
                Set<String> colSet = OpenApiTableColumnUtil.getCachedTableColumnSet(
                        tableDataService, previewReq.getDatasourceId(), rawTable);
                List<RowFilterRule> matched = OpenApiPermissionUtil.matchRulesForTable(rules, rawTable, colSet, false);
                List<String> cols = new ArrayList<>(matched.size());
                for (RowFilterRule rule : matched) {
                    if (!cols.contains(rule.getColumn())) {
                        cols.add(rule.getColumn());
                    }
                }
                matchedColumns.put(lowerTbl, cols);

                // 同时标记 STRICT_TABLES 模式下缺少目标字段的表，便于配置阶段提前发现
                List<String> missing = collectMissingStrictColumns(rules, lowerTbl, colSet);
                if (!missing.isEmpty()) {
                    missingStrictColumns.put(lowerTbl, missing);
                }
            } catch (Exception e) {
                failedTables.add(lowerTbl);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("matchedColumns", matchedColumns);
        result.put("missingStrictColumns", missingStrictColumns);
        result.put("failedTables", failedTables);
        return success(result);
    }

    /**
     * 收集指定表在 STRICT_TABLES 规则下缺失的过滤字段列表
     */
    private List<String> collectMissingStrictColumns(
            List<RowFilterRule> rules,
            String lowerTbl,
            Set<String> colSet) {
        if (rules == null || rules.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> missing = new ArrayList<>();
        for (RowFilterRule rule : rules) {
            if (rule == null || !OpenApiPermissionUtil.MATCH_MODE_STRICT_TABLES.equalsIgnoreCase(rule.getMatchMode())) {
                continue;
            }
            if (rule.getExcludeTables() != null && rule.getExcludeTables().contains(lowerTbl)) {
                continue;
            }
            boolean isTarget = rule.getTables() == null
                    || rule.getTables().isEmpty()
                    || rule.getTables().contains("*")
                    || rule.getTables().contains(lowerTbl);
            if (isTarget && (colSet == null || !colSet.contains(rule.getColumn().trim().toLowerCase()))) {
                missing.add(rule.getColumn());
            }
        }
        return missing;
    }

    /**
     * 表规则命中预览请求 DTO
     */
    @Data
    public static class PreviewRuleMatchRequest {
        private Long datasourceId;
        private List<String> tables;
        private List<RowFilterRule> rowFilterRules;
    }

    @PostMapping("/account/delete")
    @ApiOperation("删除 API 账号 (仅管理员)")
    public R<String> deleteAccount(
            HttpServletRequest request,
            @RequestParam Integer id) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可删除接口账号");
        }
        if (id == null) {
            return failed("参数错误: 账号ID不能为空");
        }
        boolean ok = jobApiAccountService.removeById(id);
        return ok ? success("删除账号成功") : failed("删除账号失败");
    }

    @PostMapping("/account/resetSecret")
    @ApiOperation("重置 API 账号密钥 (仅管理员)")
    public R<String> resetSecret(
            HttpServletRequest request,
            @RequestParam Integer id) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可重置密钥");
        }
        try {
            String newSecret = jobApiAccountService.resetSecret(id);
            return success(newSecret);
        } catch (Exception e) {
            return failed("重置密钥失败: " + e.getMessage());
        }
    }

    @GetMapping("/account/getSecret")
    @ApiOperation("查看 API 账号完整密钥 (仅管理员)")
    public R<String> getSecret(
            HttpServletRequest request,
            @RequestParam Integer id) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看密钥");
        }
        if (id == null) {
            return failed("参数错误: 账号ID不能为空");
        }
        JobApiAccount account = jobApiAccountService.getById(id);
        if (account == null) {
            return failed("未找到指定账号");
        }
        return success(account.getAppSecret());
    }

    @PostMapping("/account/toggleStatus")
    @ApiOperation("启停 API 账号 (仅管理员)")
    public R<String> toggleStatus(
            HttpServletRequest request,
            @RequestParam Integer id,
            @RequestParam Integer status) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可切换账号状态");
        }
        JobApiAccount account = jobApiAccountService.getById(id);
        if (account == null) {
            return failed("未找到指定账号");
        }
        account.setStatus(status);
        account.setUpdateTime(new Date());
        jobApiAccountService.updateById(account);
        return success(Integer.valueOf(1).equals(status) ? "已启用该账号" : "已停用该账号");
    }

    /**
     * 规范化并容错解析日期时间字符串
     * 若遇到 yyyy-MM-ddHH:mm:ss（18位粘连串），自动在第 10 位补齐空格
     */
    private String normalizeDateTime(String dt) {
        if (StringUtils.isBlank(dt)) {
            return null;
        }
        String s = dt.trim();
        if (s.length() == 18 && s.charAt(10) != ' ') {
            s = s.substring(0, 10) + " " + s.substring(10);
        }
        return s;
    }

    // ==========================================
    // 2. 调用审计日志查询接口
    // ==========================================

    @GetMapping("/log/page")
    @ApiOperation("多条件分页检索调用审计日志 (仅管理员)")
    public R<Page<JobApiLog>> pageLogs(
            HttpServletRequest request,
            @RequestParam(defaultValue = "1") Integer pageNo,
            @RequestParam(defaultValue = "20") Integer pageSize,
            @RequestParam(required = false) String appKey,
            @RequestParam(required = false) String clientIp,
            @RequestParam(required = false) String clientSource,
            @RequestParam(required = false) String domainCode,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看审计日志");
        }

        Page<JobApiLog> page = buildSafePage(pageNo, pageSize, 20);
        long requestedPageNo = page.getCurrent();
        QueryWrapper<JobApiLog> qw = new QueryWrapper<>();
        if (StringUtils.isNotBlank(appKey)) {
            qw.eq("app_key", appKey.trim());
        }
        if (StringUtils.isNotBlank(clientIp)) {
            qw.like("client_ip", clientIp.trim());
        }
        if (StringUtils.isNotBlank(clientSource)) {
            String cs = clientSource.trim();
            qw.and(w -> w.like("client_source", cs).or().like("user_agent", cs));
        }
        if (StringUtils.isNotBlank(domainCode)) {
            qw.eq("domain_code", domainCode.trim());
        }
        if (status != null) {
            qw.eq("status", status);
        }
        String normStart = normalizeDateTime(startTime);
        if (StringUtils.isNotBlank(normStart)) {
            qw.ge("create_time", normStart);
        }
        String normEnd = normalizeDateTime(endTime);
        if (StringUtils.isNotBlank(normEnd)) {
            qw.le("create_time", normEnd);
        }
        qw.orderByDesc("id");

        Page<JobApiLog> result = normalizePageOverflow(jobApiLogService.page(page, qw), requestedPageNo);
        if (result != null && result.getRecords() != null && !result.getRecords().isEmpty()) {
            Map<String, String> nameMap = buildAppKeyAccountNameMap();
            if (!nameMap.isEmpty()) {
                for (JobApiLog log : result.getRecords()) {
                    if (StringUtils.isNotBlank(log.getAppKey())) {
                        log.setAccountName(nameMap.get(log.getAppKey()));
                    }
                }
            }
        }
        return success(result);
    }

    @GetMapping("/log/detail")
    @ApiOperation("查询单条审计日志明细 (仅管理员)")
    public R<JobApiLog> getLogDetail(
            HttpServletRequest request,
            @RequestParam Long id) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看审计日志详情");
        }
        if (id == null) {
            return failed("日志ID不能为空");
        }
        JobApiLog apiLog = jobApiLogService.getById(id);
        if (apiLog != null && StringUtils.isNotBlank(apiLog.getAppKey())) {
            JobApiAccount account = jobApiAccountService.getActiveAccount(apiLog.getAppKey());
            if (account != null) {
                apiLog.setAccountName(account.getAccountName());
            }
        }
        return apiLog != null ? success(apiLog) : failed("未找到该日志记录");
    }

    // ==========================================
    // 3. IP 黑名单管控与日志现场一键封禁接口
    // ==========================================

    @GetMapping("/blacklist/page")
    @ApiOperation("分页检索 IP 黑名单列表 (仅管理员)")
    public R<Page<JobApiIpBlacklist>> pageBlacklist(
            HttpServletRequest request,
            @RequestParam(defaultValue = "1") Integer pageNo,
            @RequestParam(defaultValue = "20") Integer pageSize,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String appKey,
            @RequestParam(required = false) Integer status) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看 IP 黑名单");
        }

        Page<JobApiIpBlacklist> page = buildSafePage(pageNo, pageSize, 20);
        long requestedPageNo = page.getCurrent();
        QueryWrapper<JobApiIpBlacklist> qw = new QueryWrapper<>();
        if (StringUtils.isNotBlank(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like("ip_address", kw).or().like("reason", kw));
        }
        if (StringUtils.isNotBlank(appKey)) {
            qw.eq("app_key", appKey.trim());
        }
        if (status != null) {
            qw.eq("status", status);
        }
        qw.orderByDesc("status").orderByDesc("update_time").orderByDesc("id");

        Page<JobApiIpBlacklist> result = normalizePageOverflow(jobApiIpBlacklistService.page(page, qw), requestedPageNo);
        if (result != null && result.getRecords() != null && !result.getRecords().isEmpty()) {
            Map<String, String> nameMap = buildAppKeyAccountNameMap();
            for (JobApiIpBlacklist item : result.getRecords()) {
                if ("*".equals(item.getAppKey()) || StringUtils.isBlank(item.getAppKey())) {
                    item.setAccountName("全局所有账号 (*)");
                } else {
                    item.setAccountName(nameMap.getOrDefault(item.getAppKey(), item.getAppKey()));
                }
            }
        }
        return success(result);
    }

    @GetMapping("/blacklist/activeList")
    @ApiOperation("获取当前所有生效中的 IP 黑名单快照及当前管理员 IP (仅管理员)")
    public R<Map<String, Object>> getActiveBlacklist(HttpServletRequest request) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可获取生效黑名单");
        }
        List<JobApiIpBlacklist> activeList = jobApiIpBlacklistService.getActiveBlacklistSnapshot();
        Map<String, String> nameMap = buildAppKeyAccountNameMap();
        List<Map<String, Object>> enriched = new ArrayList<>(activeList.size());
        for (JobApiIpBlacklist item : activeList) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", item.getId());
            m.put("ipAddress", item.getIpAddress());
            m.put("appKey", item.getAppKey());
            m.put("accountName", "*".equals(item.getAppKey()) ? "全局所有账号 (*)" : nameMap.getOrDefault(item.getAppKey(), item.getAppKey()));
            m.put("reason", item.getReason());
            m.put("sourceLogId", item.getSourceLogId());
            m.put("status", item.getStatus());
            enriched.add(m);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("records", enriched);
        data.put("totalActive", enriched.size());
        data.put("currentAdminIp", jobApiIpBlacklistService.extractClientIp(request));
        return success(data);
    }

    @PostMapping("/blacklist/save")
    @ApiOperation("新增或编辑单条 IP 黑名单记录 (仅管理员)")
    public R<JobApiIpBlacklist> saveBlacklist(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可配置 IP 黑名单");
        }
        if (body == null) {
            return failed("参数错误: 请求体不能为空");
        }
        String ipAddress = body.get("ipAddress") != null ? String.valueOf(body.get("ipAddress")).trim() : "";
        if (StringUtils.isBlank(ipAddress)) {
            return failed("参数错误: 被封禁的 IP 地址不能为空");
        }
        String appKey = body.get("appKey") != null ? String.valueOf(body.get("appKey")).trim() : "*";
        if (StringUtils.isBlank(appKey)) {
            appKey = "*";
        }
        String reason = body.get("reason") != null ? String.valueOf(body.get("reason")).trim() : "";
        Long sourceLogId = null;
        if (body.get("sourceLogId") != null && StringUtils.isNotBlank(String.valueOf(body.get("sourceLogId")))) {
            try {
                sourceLogId = Long.valueOf(String.valueOf(body.get("sourceLogId")));
            } catch (NumberFormatException ignored) {
            }
        }
        Integer id = null;
        if (body.get("id") != null && StringUtils.isNotBlank(String.valueOf(body.get("id")))) {
            try {
                id = Integer.valueOf(String.valueOf(body.get("id")));
            } catch (NumberFormatException ignored) {
            }
        }
        Integer status = 1;
        if (body.get("status") != null && StringUtils.isNotBlank(String.valueOf(body.get("status")))) {
            try {
                status = Integer.valueOf(String.valueOf(body.get("status")));
            } catch (NumberFormatException ignored) {
            }
        }
        boolean forceConfirm = Boolean.parseBoolean(String.valueOf(body.getOrDefault("forceConfirm", "false")));

        // 防自锁校验：识别本机回环地址或当前管理员所在客户端 IP
        String currentAdminIp = jobApiIpBlacklistService.extractClientIp(request);
        if (!forceConfirm && Integer.valueOf(1).equals(status)) {
            if (jobApiIpBlacklistService.isLoopbackIp(ipAddress)) {
                return failed("RISK_CONFIRM_REQUIRED: 目标 IP [" + ipAddress + "] 为本机回环地址，拉黑后将导致本机运行的 MCP 工具无法调用接口，请确认是否继续强制封禁？");
            }
            if (StringUtils.isNotBlank(currentAdminIp) && ipAddress.equalsIgnoreCase(currentAdminIp)) {
                return failed("RISK_CONFIRM_REQUIRED: 目标 IP [" + ipAddress + "] 与您当前所在的客户端 IP 相同，拉黑后将阻断当前机器的开放 API 调用，请确认是否继续强制封禁？");
            }
        }

        String operator = getCurrentOperator(request);
        if (id != null) {
            JobApiIpBlacklist existing = jobApiIpBlacklistService.getById(id);
            if (existing == null) {
                return failed("未找到指定 ID 的黑名单记录");
            }
            existing.setIpAddress(ipAddress);
            existing.setAppKey(appKey);
            existing.setReason(StringUtils.abbreviate(StringUtils.defaultIfBlank(reason, "管理员手动维护"), 250));
            if (sourceLogId != null) {
                existing.setSourceLogId(sourceLogId);
            }
            existing.setStatus(status);
            existing.setCreateBy(operator);
            existing.setUpdateTime(new Date());
            jobApiIpBlacklistService.updateById(existing);
            jobApiIpBlacklistService.refreshCache();
            return success(existing);
        } else {
            JobApiIpBlacklist saved = jobApiIpBlacklistService.addOrUpdateBlacklist(ipAddress, appKey, reason, sourceLogId, operator);
            if (!Integer.valueOf(1).equals(status)) {
                saved.setStatus(status);
                jobApiIpBlacklistService.updateById(saved);
                jobApiIpBlacklistService.refreshCache();
            }
            return success(saved);
        }
    }

    @PostMapping("/blacklist/batchAddFromLogs")
    @ApiOperation("从调用审计日志单条或批量选中加入 IP 黑名单 (仅管理员)")
    @SuppressWarnings("unchecked")
    public R<Map<String, Object>> batchAddFromLogs(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可执行批量拉黑操作");
        }
        if (body == null) {
            return failed("参数错误: 请求体不能为空");
        }

        String scope = body.get("scope") != null ? String.valueOf(body.get("scope")).trim() : "*";
        String customReason = body.get("reason") != null ? String.valueOf(body.get("reason")).trim() : "";
        boolean forceConfirm = Boolean.parseBoolean(String.valueOf(body.getOrDefault("forceConfirm", "false")));
        String currentAdminIp = jobApiIpBlacklistService.extractClientIp(request);
        String operator = getCurrentOperator(request);

        List<Map<String, Object>> items = new ArrayList<>();
        if (body.get("items") instanceof List) {
            items = (List<Map<String, Object>>) body.get("items");
        } else if (body.get("logIds") instanceof List) {
            List<Object> rawIds = (List<Object>) body.get("logIds");
            for (Object rawId : rawIds) {
                try {
                    Long logId = Long.valueOf(String.valueOf(rawId));
                    JobApiLog logObj = jobApiLogService.getById(logId);
                    if (logObj != null && StringUtils.isNotBlank(logObj.getClientIp())) {
                        Map<String, Object> m = new HashMap<>(4);
                        m.put("ipAddress", logObj.getClientIp());
                        m.put("appKey", logObj.getAppKey());
                        m.put("sourceLogId", logObj.getId());
                        m.put("status", logObj.getStatus());
                        items.add(m);
                    }
                } catch (Exception ignored) {
                }
            }
        }

        if (items.isEmpty()) {
            return failed("未找到有效的客户端 IP，请至少勾选一条包含客户端 IP 的调用日志");
        }

        // 先执行防自锁安全扫描
        if (!forceConfirm) {
            for (Map<String, Object> item : items) {
                String ip = item.get("ipAddress") != null ? String.valueOf(item.get("ipAddress")).trim() : "";
                if (StringUtils.isBlank(ip)) {
                    continue;
                }
                if (jobApiIpBlacklistService.isLoopbackIp(ip)) {
                    return failed("RISK_CONFIRM_REQUIRED: 选中的日志中包含本机回环地址 [" + ip + "]，拉黑后将导致本机 MCP 工具无法访问接口，请确认是否继续强制封禁？");
                }
                if (StringUtils.isNotBlank(currentAdminIp) && ip.equalsIgnoreCase(currentAdminIp)) {
                    return failed("RISK_CONFIRM_REQUIRED: 选中的日志中包含您当前所在的客户端 IP [" + ip + "]，拉黑后将阻断当前机器的接口调用，请确认是否继续强制封禁？");
                }
            }
        }

        Set<String> dedupKeys = new LinkedHashSet<>();
        int processedCount = 0;
        for (Map<String, Object> item : items) {
            String ip = item.get("ipAddress") != null ? String.valueOf(item.get("ipAddress")).trim() : "";
            if (StringUtils.isBlank(ip)) {
                continue;
            }
            String itemAk = item.get("appKey") != null ? String.valueOf(item.get("appKey")).trim() : "";
            String targetAk = ("ACCOUNT".equalsIgnoreCase(scope) && StringUtils.isNotBlank(itemAk)) ? itemAk : "*";
            String uk = ip.toLowerCase() + "|" + targetAk.toLowerCase();
            if (!dedupKeys.add(uk)) {
                continue;
            }

            Long srcLogId = null;
            if (item.get("sourceLogId") != null && StringUtils.isNotBlank(String.valueOf(item.get("sourceLogId")))) {
                try {
                    srcLogId = Long.valueOf(String.valueOf(item.get("sourceLogId")));
                } catch (NumberFormatException ignored) {
                }
            }

            String finalReason = customReason;
            if (StringUtils.isBlank(finalReason)) {
                finalReason = srcLogId != null
                        ? "从调用审计日志 #" + srcLogId + " 选中一键拉黑"
                        : "从调用审计日志选中一键拉黑";
            }

            jobApiIpBlacklistService.addOrUpdateBlacklist(ip, targetAk, finalReason, srcLogId, operator);
            processedCount++;
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("blockedCount", processedCount);
        return success(res);
    }

    @PostMapping("/blacklist/unblockByIp")
    @ApiOperation("根据客户端 IP 一键解封黑名单 (仅管理员)")
    public R<String> unblockByIp(
            HttpServletRequest request,
            @RequestParam String ipAddress,
            @RequestParam(required = false) String appKey) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可解封 IP 黑名单");
        }
        if (StringUtils.isBlank(ipAddress)) {
            return failed("参数错误: IP 地址不能为空");
        }
        int count = jobApiIpBlacklistService.unblockByIp(ipAddress, appKey);
        return success("已成功解封 IP [" + ipAddress.trim() + "] (共释放 " + count + " 条规则)");
    }

    @PostMapping("/blacklist/toggleStatus")
    @ApiOperation("切换单条 IP 黑名单启用/解封状态 (仅管理员)")
    public R<String> toggleBlacklistStatus(
            HttpServletRequest request,
            @RequestParam Integer id,
            @RequestParam Integer status) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可修改黑名单状态");
        }
        JobApiIpBlacklist record = jobApiIpBlacklistService.getById(id);
        if (record == null) {
            return failed("未找到指定黑名单记录");
        }
        record.setStatus(status);
        record.setUpdateTime(new Date());
        jobApiIpBlacklistService.updateById(record);
        jobApiIpBlacklistService.refreshCache();
        return success(Integer.valueOf(1).equals(status) ? "已恢复封禁该 IP" : "已解封该 IP");
    }

    @PostMapping("/blacklist/delete")
    @ApiOperation("彻底删除单条 IP 黑名单记录 (仅管理员)")
    public R<String> deleteBlacklist(
            HttpServletRequest request,
            @RequestParam Integer id) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可删除黑名单记录");
        }
        if (id == null) {
            return failed("参数错误: 记录 ID 不能为空");
        }
        boolean ok = jobApiIpBlacklistService.removeById(id);
        jobApiIpBlacklistService.refreshCache();
        return ok ? success("删除黑名单记录成功") : failed("删除黑名单记录失败");
    }
}
