package com.wugui.datax.admin.controller;

import com.baomidou.mybatisplus.extension.api.R;
import com.wugui.datax.admin.dto.OpenApiExecuteSqlDto;
import com.wugui.datax.admin.dto.OpenApiQueryResultDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.dto.TableInfoDto;
import com.wugui.datax.admin.entity.JobApiAccount;
import com.wugui.datax.admin.entity.JobApiLog;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.interceptor.OpenApiSecurityInterceptor;
import com.wugui.datax.admin.service.JobApiLogService;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.service.TableDataService;
import com.wugui.datax.admin.tool.query.OpenApiWarehouseExecutor;
import com.wugui.datax.admin.util.OpenApiPermissionUtil;
import com.wugui.datax.admin.util.OpenApiPermissionUtil.DatabaseAuth;
import com.wugui.datax.admin.util.OpenApiPermissionUtil.RowFilterRule;
import com.wugui.datax.admin.util.OpenApiSqlAstParser;
import com.wugui.datax.admin.util.OpenApiSqlTenantRewriter;
import com.wugui.datax.admin.util.OpenApiTableColumnUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 外部开放 API 核心控制器 (供三方平台与外部 AI Agent 调用)
 *
 * @author ypc
 * @since 2026-10-28
 */
@RestController
@RequestMapping("/api/open/v1")
@Api(tags = "三方开放API-库表元数据与只读SQL执行")
public class JobOpenApiController extends BaseController {

    private static final Logger logger = LoggerFactory.getLogger(JobOpenApiController.class);

    private static final Pattern SENSITIVE_COLUMN_PATTERN = Pattern.compile("(?i).*(password|passwd|secret|token).*");

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Autowired
    private TableDataService tableDataService;

    @Autowired
    private JobApiLogService jobApiLogService;

    /**
     * 获取当前通过网关鉴权的 API 账号
     */
    private JobApiAccount getCurrentAccount(HttpServletRequest request) {
        Object attr = request.getAttribute(OpenApiSecurityInterceptor.ATTR_CURRENT_ACCOUNT);
        if (attr instanceof JobApiAccount) {
            return (JobApiAccount) attr;
        }
        throw new SecurityException("未检测到有效的开放 API 鉴权上下文");
    }

    /**
     * 获取客户端真实 IP
     */
    private String getClientIp(HttpServletRequest request) {
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
        return "0:0:0:0:0:0:0:1".equals(ip) ? "127.0.0.1" : ip;
    }

    /**
     * 1. 获取当前账号有权限查阅的库表元数据 (包含数据源、表名、表注释与字段中文说明)
     */
    @GetMapping("/metadata/tables")
    @ApiOperation("获取当前账号已授权的库表结构元数据")
    public R<Map<String, Object>> getMetadataTables(
            HttpServletRequest request,
            @RequestParam(required = false) Long datasourceId,
            @RequestParam(required = false) String domainCode) {
        long startTime = System.currentTimeMillis();
        String clientIp = getClientIp(request);
        JobApiAccount account = getCurrentAccount(request);
        String safeDomain = StringUtils.defaultIfBlank(domainCode, StringUtils.defaultIfBlank(account.getDomainCode(), "ALL"));

        List<DatabaseAuth> authList = OpenApiPermissionUtil.parsePermissions(
                account.getPermissions(), account.getDatasourceId(), account.getAllowedTables());
        if (authList.isEmpty()) {
            recordAuditLog(request, account, clientIp, safeDomain, "[元数据拉取] GET /api/open/v1/metadata/tables", "", 0, 0, 2, "安全拦截: 当前调用账号未配置任何数据源授权");
            return failed("安全拦截: 当前调用账号未配置任何数据源授权");
        }

        List<DatabaseAuth> targetAuths = new ArrayList<>();
        if (datasourceId != null) {
            DatabaseAuth auth = OpenApiPermissionUtil.findAuthByDatasourceId(authList, datasourceId);
            if (auth == null) {
                String errMsg = "安全拦截: 当前调用账号未获得数据源ID [" + datasourceId + "] 的授权";
                recordAuditLog(request, account, clientIp, safeDomain, "[元数据拉取] GET /api/open/v1/metadata/tables?datasourceId=" + datasourceId, "", 0, 0, 2, errMsg);
                return failed(errMsg);
            }
            targetAuths.add(auth);
        } else {
            targetAuths.addAll(authList);
        }

        try {
            List<Map<String, Object>> tableResultList = new ArrayList<>();
            for (DatabaseAuth auth : targetAuths) {
                JobDatasource datasource = jobDatasourceService.getById(auth.getDatasourceId());
                if (datasource == null) {
                    continue;
                }
                tableResultList.addAll(fetchAuthorizedTablesForDatasource(datasource, auth));
            }

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("accountName", account.getAccountName());
            data.put("databaseCount", targetAuths.size());
            data.put("tableCount", tableResultList.size());
            data.put("tables", tableResultList);
            recordAuditLog(request, account, clientIp, safeDomain,
                    "[元数据拉取] GET /api/open/v1/metadata/tables",
                    "共授权 " + tableResultList.size() + " 张表",
                    tableResultList.size(),
                    (int) (System.currentTimeMillis() - startTime),
                    1,
                    null);
            return success(data);
        } catch (Exception e) {
            logger.error("[JobOpenApiController] 获取库表元数据异常: {}", e.getMessage(), e);
            recordAuditLog(request, account, clientIp, safeDomain,
                    "[元数据拉取] GET /api/open/v1/metadata/tables",
                    "",
                    0,
                    (int) (System.currentTimeMillis() - startTime),
                    0,
                    "获取库表元数据失败: " + e.getMessage());
            return failed("获取库表元数据失败: " + e.getMessage());
        }
    }

    /**
     * 获取指定数据源下符合白名单的表及其列结构
     */
    private List<Map<String, Object>> fetchAuthorizedTablesForDatasource(JobDatasource datasource, DatabaseAuth auth) throws Exception {
        List<TableInfoDto> allTables = tableDataService.getTablesWithComments(datasource.getId(), null);
        if (allTables == null) {
            return Collections.emptyList();
        }

        List<RowFilterRule> effectiveRules = OpenApiPermissionUtil.resolveEffectiveRules(auth);
        boolean hasActiveFilters = !effectiveRules.isEmpty();

        List<Map<String, Object>> result = new ArrayList<>();
        for (TableInfoDto tableInfo : allTables) {
            String tableName = tableInfo.getTableName();
            if (StringUtils.isBlank(tableName)) {
                continue;
            }
            String lowerName = tableName.toLowerCase();
            if (lowerName.startsWith("job_") || lowerName.startsWith("sys_") || lowerName.startsWith("schema_")) {
                continue;
            }

            if (!OpenApiPermissionUtil.isTableAllowed(auth, lowerName)) {
                continue;
            }

            List<TableColumnDto> columns = null;
            try {
                columns = tableDataService.getTableColumnsDetails(datasource.getId(), null, tableName);
            } catch (Exception e) {
                logger.warn("[JobOpenApiController] 获取表 [{}] 字段结构异常: {}", tableName, e.getMessage());
            }

            Set<String> rawColSet = new HashSet<>();
            List<Map<String, String>> columnMaps = new ArrayList<>();
            if (columns != null) {
                for (TableColumnDto col : columns) {
                    String colName = col.getColumnName();
                    if (StringUtils.isNotBlank(colName)) {
                        rawColSet.add(colName.trim().toLowerCase());
                    }
                    if (SENSITIVE_COLUMN_PATTERN.matcher(colName).matches()) {
                        continue;
                    }
                    Map<String, String> colMap = new LinkedHashMap<>();
                    colMap.put("columnName", colName);
                    colMap.put("dataType", col.getColumnType());
                    colMap.put("columnComment", col.getComment());
                    columnMaps.add(colMap);
                }
            }

            List<RowFilterRule> matchedRules = hasActiveFilters
                    ? OpenApiPermissionUtil.matchRulesForTable(effectiveRules, tableName, rawColSet, false)
                    : Collections.emptyList();
            List<String> filterColumns = new ArrayList<>();
            for (RowFilterRule rule : matchedRules) {
                if (rule != null && StringUtils.isNotBlank(rule.getColumn()) && !filterColumns.contains(rule.getColumn())) {
                    filterColumns.add(rule.getColumn());
                }
            }
            boolean rowIsolated = !filterColumns.isEmpty();

            Map<String, Object> tableMap = new LinkedHashMap<>();
            tableMap.put("datasourceId", datasource.getId());
            tableMap.put("datasourceName", datasource.getDatasourceName());
            tableMap.put("tableName", tableName);
            tableMap.put("tableComment", tableInfo.getTableComment());
            tableMap.put("rowIsolated", rowIsolated);
            tableMap.put("filterColumns", filterColumns);
            // 向下兼容旧版元数据字段
            tableMap.put("tenantIsolated", hasActiveFilters);
            if (Boolean.TRUE.equals(auth.getTenantIsolationEnabled())) {
                tableMap.put("tenantColumn", auth.getTenantColumn());
                tableMap.put("tenantExempt", OpenApiPermissionUtil.isTableTenantExempt(auth, lowerName));
            }
            tableMap.put("columns", columnMaps);
            result.add(tableMap);
        }
        return result;
    }

    /**
     * 2. 安全执行只读自定义 SQL 查询并返回结构化数据
     */
    @PostMapping("/sql/execute")
    @ApiOperation("安全执行只读 SQL 查询")
    public R<OpenApiQueryResultDto> executeReadOnlySql(
            HttpServletRequest request,
            @RequestBody OpenApiExecuteSqlDto executeDto) {
        long startTime = System.currentTimeMillis();
        String clientIp = getClientIp(request);
        JobApiAccount account = getCurrentAccount(request);

        if (executeDto == null || StringUtils.isBlank(executeDto.getSql())) {
            return failed("参数错误: 查询 SQL 语句不能为空");
        }

        List<DatabaseAuth> authList = OpenApiPermissionUtil.parsePermissions(
                account.getPermissions(), account.getDatasourceId(), account.getAllowedTables());
        if (authList.isEmpty()) {
            recordAuditLog(request, account, clientIp, executeDto.getDomainCode(), executeDto.getSql(), "", 0, 0, 2, "安全拦截: 账号未授权任何数据源");
            return failed("安全拦截: 当前调用账号未配置任何数据源授权");
        }

        Long targetDsId = executeDto.getDatasourceId();
        if (targetDsId == null) {
            if (authList.size() == 1) {
                targetDsId = authList.get(0).getDatasourceId();
            } else {
                return failed("参数错误: 当前账号被授权了多个数据源，请在请求体中明确传入目标 datasourceId");
            }
        }

        DatabaseAuth targetAuth = OpenApiPermissionUtil.findAuthByDatasourceId(authList, targetDsId);
        if (targetAuth == null) {
            String errMsg = "安全拦截: 当前调用账号未获得目标数据源ID [" + targetDsId + "] 的查询权限";
            recordAuditLog(request, account, clientIp, executeDto.getDomainCode(), executeDto.getSql(), "", 0, 0, 2, errMsg);
            return failed(errMsg);
        }

        JobDatasource datasource = jobDatasourceService.getById(targetDsId);
        if (datasource == null) {
            return failed("配置异常: 目标只读数据源不存在或已被删除");
        }

        List<String> involvedTables = Collections.emptyList();
        try {
            List<RowFilterRule> effectiveRules = OpenApiPermissionUtil.resolveEffectiveRules(targetAuth);
            boolean hasActiveFilters = !effectiveRules.isEmpty();
            String boundSchema = OpenApiSqlAstParser.extractSchemaFromJdbcUrl(datasource.getJdbcUrl());

            // 1. AST 语法树深度安全解析 (启用行级过滤规则时同步开启严格跨库前缀校验)
            involvedTables = OpenApiSqlAstParser.parseAndValidateSql(executeDto.getSql(), boundSchema, hasActiveFilters);

            // 2. 数据表白名单校验
            for (String tbl : involvedTables) {
                if (!OpenApiPermissionUtil.isTableAllowed(targetAuth, tbl)) {
                    String dsName = StringUtils.defaultIfBlank(targetAuth.getDatasourceName(), String.valueOf(targetDsId));
                    String errMsg = "安全拦截: SQL 中引用的数据表 [" + tbl + "] 未获得该账号在数据源 [" + dsName + "] 下的授权，禁止查询";
                    recordAuditLog(request, account, clientIp, executeDto.getDomainCode(), executeDto.getSql(),
                            String.join(",", involvedTables), 0, (int) (System.currentTimeMillis() - startTime), 2, errMsg);
                    return failed(errMsg);
                }
            }

            // 3. 若配置了行级字段过滤规则，基于物理表列元数据进行规则匹配并执行 AST 强制改写 (Fail-Closed)
            String executableSql = executeDto.getSql();
            if (hasActiveFilters) {
                try {
                    OpenApiPermissionUtil.validateTenantPolicy(targetAuth);
                } catch (IllegalArgumentException iae) {
                    throw new SecurityException("行级过滤规则配置异常: " + iae.getMessage(), iae);
                }
                Map<String, List<RowFilterRule>> tableRulesMap = resolveTableFilterRules(
                        datasource.getId(), involvedTables, effectiveRules);
                executableSql = OpenApiSqlTenantRewriter.rewriteSqlForRules(
                        executeDto.getSql(), tableRulesMap, boundSchema);
            }

            // 4. 执行只读查询 (带物理只读连接、10s 超时、1000条截断与动态脱敏)
            OpenApiQueryResultDto resultDto = OpenApiWarehouseExecutor.executeQuery(
                    datasource,
                    executeDto.getDomainCode(),
                    executableSql,
                    executeDto.getPageSize()
            );
            resultDto.setTables(involvedTables);

            // 4. 异步记录成功审计日志
            recordAuditLog(request, account, clientIp, executeDto.getDomainCode(), executeDto.getSql(),
                    String.join(",", involvedTables), resultDto.getTotalRows(), (int) (System.currentTimeMillis() - startTime), 1, null);

            return success(resultDto);
        } catch (SecurityException se) {
            String errMsg = "安全拦截: " + se.getMessage();
            recordAuditLog(request, account, clientIp, executeDto.getDomainCode(), executeDto.getSql(),
                    String.join(",", involvedTables), 0, (int) (System.currentTimeMillis() - startTime), 2, errMsg);
            return failed(errMsg);
        } catch (Exception e) {
            String errMsg = "SQL 查询执行失败: " + e.getMessage();
            recordAuditLog(request, account, clientIp, executeDto.getDomainCode(), executeDto.getSql(),
                    String.join(",", involvedTables), 0, (int) (System.currentTimeMillis() - startTime), 0, errMsg);
            return failed(errMsg);
        }
    }

    /**
     * 基于物理表真实字段集合，逐表解析并校验命中的行级字段过滤规则 (Fail-Closed)
     */
    private Map<String, List<RowFilterRule>> resolveTableFilterRules(
            Long datasourceId,
            List<String> involvedTables,
            List<RowFilterRule> effectiveRules) {
        if (involvedTables == null || involvedTables.isEmpty() || effectiveRules == null || effectiveRules.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, List<RowFilterRule>> tableRulesMap = new LinkedHashMap<>();
        for (String tbl : involvedTables) {
            if (StringUtils.isBlank(tbl)) {
                continue;
            }
            // Fail-Closed：查表元数据失败或返回空字段时直接抛出 SecurityException，绝不静默跳过
            Set<String> columnSet = OpenApiTableColumnUtil.getCachedTableColumnSet(tableDataService, datasourceId, tbl);
            List<RowFilterRule> matched = OpenApiPermissionUtil.matchRulesForTable(effectiveRules, tbl, columnSet, true);
            if (!matched.isEmpty()) {
                tableRulesMap.put(OpenApiPermissionUtil.normalizeTableName(tbl), matched);
            }
        }
        return tableRulesMap;
    }

    /**
     * 辅助方法：快速组装并异步写入审计日志（含请求终端/AI工具来源识别）
     */
    private void recordAuditLog(HttpServletRequest request, JobApiAccount account, String clientIp, String domainCode, String sql,
                                String tables, int rows, int costMs, int status, String errorMsg) {
        JobApiLog log = new JobApiLog();
        log.setAppKey(account.getAppKey());
        log.setClientIp(clientIp);
        log.setClientSource(jobApiLogService.resolveClientSource(request));
        log.setUserAgent(jobApiLogService.extractUserAgent(request));
        log.setDomainCode(StringUtils.defaultIfBlank(domainCode, "ALL"));
        log.setExecuteSql(sql);
        log.setTablesInvolved(tables);
        log.setResultRows(rows);
        log.setCostMs(costMs);
        log.setStatus(status);
        log.setErrorMsg(StringUtils.abbreviate(errorMsg, 500));
        log.setCreateTime(new Date());
        jobApiLogService.logAsync(log);
    }
}
