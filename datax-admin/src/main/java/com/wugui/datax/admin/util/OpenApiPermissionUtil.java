package com.wugui.datax.admin.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Serializable;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 外部开放 API 多数据源与库表白名单权限解析工具类
 *
 * @author ypc
 * @since 2026-10-28
 */
public final class OpenApiPermissionUtil {

    private static final Logger logger = LoggerFactory.getLogger(OpenApiPermissionUtil.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public static final String DEFAULT_TENANT_COLUMN = "tenant_id";

    /**
     * 行级过滤匹配模式：按物理表字段自动匹配（表含该字段且不在排除列表中即生效，不含则自动跳过）
     */
    public static final String MATCH_MODE_AUTO_BY_COLUMN = "AUTO_BY_COLUMN";

    /**
     * 行级过滤匹配模式：严格指定表强制生效（目标表缺失该字段时 Fail-Closed 拦截）
     */
    public static final String MATCH_MODE_STRICT_TABLES = "STRICT_TABLES";

    /**
     * 租户过滤字段名合法字符正则 (仅允许标准 SQL 标识符)
     */
    private static final Pattern TENANT_COLUMN_PATTERN = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]{0,63}$");

    /**
     * 租户值合法字符正则 (防 SQL 注入，仅允许字母、数字、下划线与连字符)
     */
    private static final Pattern TENANT_VALUE_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{1,64}$");

    /**
     * 豁免表名合法字符正则
     */
    private static final Pattern TABLE_NAME_PATTERN = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_$]{0,127}$");

    private OpenApiPermissionUtil() {
    }

    /**
     * 单个数据源库及其表白名单授权配置对象
     */
    @Data
    public static class DatabaseAuth implements Serializable {
        private static final long serialVersionUID = 1L;

        /**
         * 数据源ID (关联 job_jdbc_datasource.id)
         */
        private Long datasourceId;

        /**
         * 数据源名称
         */
        private String datasourceName;

        /**
         * 是否允许访问该库全部表 (*)
         */
        private Boolean allTables;

        /**
         * 允许访问的数据表列表清单
         */
        private List<String> tables;

        /**
         * 是否开启该数据源的行级租户隔离 (默认 false，向后兼容旧配置)
         */
        private Boolean tenantIsolationEnabled;

        /**
         * 租户过滤字段名 (默认 tenant_id)
         */
        private String tenantColumn;

        /**
         * 允许访问的租户标识值列表 (由服务端账号绑定，严禁客户端覆盖)
         */
        private List<String> tenantValues;

        /**
         * 豁免租户过滤的公共字典/共享表列表 (小写表名)
         */
        private List<String> tenantExemptTables;

        /**
         * 字段级行过滤规则列表 (0..N 条，支持任意业务字段与自动/严格匹配模式)
         */
        private List<RowFilterRule> rowFilterRules;
    }

    /**
     * 数据源级字段行过滤规则定义
     */
    @Data
    public static class RowFilterRule implements Serializable {
        private static final long serialVersionUID = 1L;

        /**
         * 过滤字段名 (如 tenant_id, dept_id, org_id, area_code)
         */
        private String column;

        /**
         * 允许访问的字段值列表 (1个值用 =，多个值用 IN)
         */
        private List<String> values;

        /**
         * 匹配模式：AUTO_BY_COLUMN (有该字段才过滤，无则自动跳过) / STRICT_TABLES (目标表缺字段报错)
         */
        private String matchMode;

        /**
         * 指定生效的数据表列表 (仅 STRICT_TABLES 模式使用；为空表示全库非排除表)
         */
        private List<String> tables;

        /**
         * 手动排除不应用该规则的数据表列表 (小写表名)
         */
        private List<String> excludeTables;
    }

    /**
     * 解析账号的多库表授权配置清单（具备向下兼容降级机制）
     *
     * @param permissionsJson     多库配置 JSON 字符串
     * @param legacyDatasourceId  兼容旧字段：单数据源ID
     * @param legacyAllowedTables 兼容旧字段：逗号分隔的表白名单
     * @return 格式化后的多库授权配置列表
     */
    public static List<DatabaseAuth> parsePermissions(String permissionsJson, Long legacyDatasourceId, String legacyAllowedTables) {
        if (StringUtils.isNotBlank(permissionsJson)) {
            try {
                List<DatabaseAuth> list = OBJECT_MAPPER.readValue(permissionsJson.trim(), new TypeReference<List<DatabaseAuth>>() {});
                if (list != null && !list.isEmpty()) {
                    // 标准化处理每个库的表名，转小写便于匹配
                    for (DatabaseAuth auth : list) {
                        normalizeAuth(auth);
                    }
                    return list;
                }
            } catch (Exception e) {
                logger.warn("[OpenApiPermissionUtil] 解析 permissions JSON 异常: {}", e.getMessage());
            }
        }

        // 降级兜底：从旧字段还原单库配置
        if (legacyDatasourceId != null && legacyDatasourceId > 0) {
            DatabaseAuth fallback = new DatabaseAuth();
            fallback.setDatasourceId(legacyDatasourceId);
            boolean wildcard = "*".equals(legacyAllowedTables) || StringUtils.isBlank(legacyAllowedTables);
            fallback.setAllTables(wildcard);
            if (!wildcard && StringUtils.isNotBlank(legacyAllowedTables)) {
                List<String> tbls = new ArrayList<>();
                for (String t : legacyAllowedTables.split(",")) {
                    if (StringUtils.isNotBlank(t)) {
                        tbls.add(t.trim().toLowerCase());
                    }
                }
                fallback.setTables(tbls);
            } else {
                fallback.setTables(Collections.emptyList());
            }
            normalizeAuth(fallback);
            return Collections.singletonList(fallback);
        }

        return Collections.emptyList();
    }

    /**
     * 根据目标数据源ID查找对应的授权配置
     */
    public static DatabaseAuth findAuthByDatasourceId(List<DatabaseAuth> list, Long datasourceId) {
        if (list == null || datasourceId == null) {
            return null;
        }
        for (DatabaseAuth auth : list) {
            if (datasourceId.equals(auth.getDatasourceId())) {
                return auth;
            }
        }
        return null;
    }

    /**
     * 校验指定数据表是否在数据源授权白名单内
     *
     * @param auth      目标库授权配置
     * @param tableName 物理数据表名称
     * @return 是否允许访问
     */
    public static boolean isTableAllowed(DatabaseAuth auth, String tableName) {
        if (auth == null || StringUtils.isBlank(tableName)) {
            return false;
        }
        if (Boolean.TRUE.equals(auth.getAllTables())) {
            return true;
        }
        if (auth.getTables() == null || auth.getTables().isEmpty()) {
            return false;
        }
        return auth.getTables().contains(tableName.trim().toLowerCase());
    }

    /**
     * 标准化处理表名清单
     */
    private static void normalizeAuth(DatabaseAuth auth) {
        if (auth == null) {
            return;
        }
        if (auth.getAllTables() == null) {
            auth.setAllTables(false);
        }
        if (auth.getTables() != null) {
            List<String> lowerTables = new ArrayList<>();
            for (String t : auth.getTables()) {
                if (StringUtils.isNotBlank(t)) {
                    if ("*".equals(t.trim())) {
                        auth.setAllTables(true);
                    } else {
                        lowerTables.add(t.trim().toLowerCase());
                    }
                }
            }
            auth.setTables(lowerTables);
        } else {
            auth.setTables(Collections.emptyList());
        }

        // 标准化租户行级隔离策略字段（兼容旧 JSON 缺失字段场景）
        if (auth.getTenantIsolationEnabled() == null) {
            auth.setTenantIsolationEnabled(false);
        }
        if (StringUtils.isBlank(auth.getTenantColumn())) {
            auth.setTenantColumn(DEFAULT_TENANT_COLUMN);
        } else {
            auth.setTenantColumn(auth.getTenantColumn().trim());
        }
        auth.setTenantValues(normalizeTokenList(auth.getTenantValues(), false));
        auth.setTenantExemptTables(normalizeTokenList(auth.getTenantExemptTables(), true));

        // 标准化新版字段级行过滤规则列表
        if (auth.getRowFilterRules() != null && !auth.getRowFilterRules().isEmpty()) {
            List<RowFilterRule> normalizedRules = new ArrayList<>(auth.getRowFilterRules().size());
            for (RowFilterRule rule : auth.getRowFilterRules()) {
                if (rule == null) {
                    continue;
                }
                normalizeRowFilterRule(rule);
                normalizedRules.add(rule);
            }
            auth.setRowFilterRules(normalizedRules.isEmpty() ? Collections.emptyList() : normalizedRules);
        } else {
            auth.setRowFilterRules(Collections.emptyList());
        }
    }

    /**
     * 标准化单条字段行过滤规则
     */
    private static void normalizeRowFilterRule(RowFilterRule rule) {
        if (rule == null) {
            return;
        }
        rule.setColumn(StringUtils.isBlank(rule.getColumn()) ? "" : rule.getColumn().trim());
        rule.setValues(normalizeTokenList(rule.getValues(), false));
        String mode = StringUtils.isBlank(rule.getMatchMode())
                ? MATCH_MODE_AUTO_BY_COLUMN
                : rule.getMatchMode().trim().toUpperCase();
        rule.setMatchMode(mode);
        rule.setTables(normalizeTokenList(rule.getTables(), true));
        rule.setExcludeTables(normalizeTokenList(rule.getExcludeTables(), true));
    }

    /**
     * 标准化字符串列表：去除空白项、可选转小写并保持顺序去重
     */
    private static List<String> normalizeTokenList(List<String> source, boolean toLowerCase) {
        if (source == null || source.isEmpty()) {
            return Collections.emptyList();
        }
        Set<String> dedup = new LinkedHashSet<>();
        for (String item : source) {
            if (StringUtils.isNotBlank(item)) {
                String trimmed = item.trim();
                dedup.add(toLowerCase ? trimmed.toLowerCase() : trimmed);
            }
        }
        return dedup.isEmpty() ? Collections.emptyList() : new ArrayList<>(dedup);
    }

    /**
     * 清洗表名：移除反引号/引号与库名前缀并转为小写
     */
    public static String normalizeTableName(String tableName) {
        if (StringUtils.isBlank(tableName)) {
            return "";
        }
        String normalized = tableName.replaceAll("[`\"']", "").trim().toLowerCase();
        int dotIdx = normalized.lastIndexOf('.');
        if (dotIdx >= 0 && dotIdx < normalized.length() - 1) {
            normalized = normalized.substring(dotIdx + 1);
        }
        return normalized;
    }

    /**
     * 解析当前数据源最终生效的行级过滤规则列表（优先使用 rowFilterRules，若为空则自动兼容旧版单租户字段）
     */
    public static List<RowFilterRule> resolveEffectiveRules(DatabaseAuth auth) {
        if (auth == null) {
            return Collections.emptyList();
        }
        if (auth.getRowFilterRules() != null && !auth.getRowFilterRules().isEmpty()) {
            return auth.getRowFilterRules();
        }
        if (Boolean.TRUE.equals(auth.getTenantIsolationEnabled())) {
            RowFilterRule legacyRule = new RowFilterRule();
            legacyRule.setColumn(StringUtils.defaultIfBlank(auth.getTenantColumn(), DEFAULT_TENANT_COLUMN).trim());
            legacyRule.setValues(auth.getTenantValues() != null ? auth.getTenantValues() : Collections.emptyList());
            legacyRule.setMatchMode(MATCH_MODE_STRICT_TABLES);
            legacyRule.setTables(Collections.emptyList());
            legacyRule.setExcludeTables(auth.getTenantExemptTables() != null ? auth.getTenantExemptTables() : Collections.emptyList());
            return Collections.singletonList(legacyRule);
        }
        return Collections.emptyList();
    }

    /**
     * 判断数据源授权是否启用了任意行级过滤隔离（含新版字段规则与旧版单租户开关）
     */
    public static boolean hasActiveRowFilters(DatabaseAuth auth) {
        return !resolveEffectiveRules(auth).isEmpty();
    }

    /**
     * 判断数据源授权是否启用了行级租户隔离（兼容旧方法名）
     */
    public static boolean isTenantIsolationEnabled(DatabaseAuth auth) {
        return hasActiveRowFilters(auth);
    }

    /**
     * 根据物理表真实字段集合，匹配该表应当生效的行级过滤规则列表
     *
     * @param rules               当前数据源生效中的行级过滤规则
     * @param tableName           目标物理表名
     * @param tableColumns        目标物理表的小写列名集合
     * @param failOnStrictMissing STRICT_TABLES 模式下目标表缺失过滤字段时是否抛出 SecurityException
     * @return 该表命中的行级过滤规则列表（保持配置顺序，同一字段按规则顺序保留）
     */
    public static List<RowFilterRule> matchRulesForTable(
            List<RowFilterRule> rules,
            String tableName,
            Set<String> tableColumns,
            boolean failOnStrictMissing) {
        if (rules == null || rules.isEmpty() || StringUtils.isBlank(tableName)) {
            return Collections.emptyList();
        }
        String lowerTbl = normalizeTableName(tableName);
        List<RowFilterRule> matched = new ArrayList<>();
        for (RowFilterRule rule : rules) {
            if (rule == null || StringUtils.isBlank(rule.getColumn())) {
                continue;
            }
            if (rule.getExcludeTables() != null && rule.getExcludeTables().contains(lowerTbl)) {
                continue;
            }
            String colLower = rule.getColumn().trim().toLowerCase();
            boolean hasCol = tableColumns != null && tableColumns.contains(colLower);

            if (MATCH_MODE_STRICT_TABLES.equalsIgnoreCase(rule.getMatchMode())) {
                boolean isTarget = rule.getTables() == null
                        || rule.getTables().isEmpty()
                        || rule.getTables().contains("*")
                        || rule.getTables().contains(lowerTbl);
                if (!isTarget) {
                    continue;
                }
                if (!hasCol) {
                    if (failOnStrictMissing) {
                        throw new SecurityException("表 [" + tableName + "] 未包含行级过滤字段 [" + rule.getColumn()
                                + "]，请核对表结构或调整过滤规则模式");
                    }
                    continue;
                }
                matched.add(rule);
            } else {
                // AUTO_BY_COLUMN：物理表含该字段则注入条件，无该字段则自动跳过
                if (hasCol) {
                    matched.add(rule);
                }
            }
        }
        return matched.isEmpty() ? Collections.emptyList() : matched;
    }

    /**
     * 判断指定数据表是否属于该数据源的公共豁免表（无需拼接租户条件）
     */
    public static boolean isTableTenantExempt(DatabaseAuth auth, String tableName) {
        if (auth == null || StringUtils.isBlank(tableName)
                || auth.getTenantExemptTables() == null || auth.getTenantExemptTables().isEmpty()) {
            return false;
        }
        return auth.getTenantExemptTables().contains(normalizeTableName(tableName));
    }

    /**
     * 校验单条字段行过滤规则的合法性（Fail-Closed）
     */
    public static void validateRowFilterRule(String dsLabel, RowFilterRule rule) {
        if (rule == null) {
            throw new IllegalArgumentException("数据源 [" + dsLabel + "] 包含空的行级过滤规则");
        }
        normalizeRowFilterRule(rule);
        String col = rule.getColumn();
        if (StringUtils.isBlank(col) || !TENANT_COLUMN_PATTERN.matcher(col).matches()) {
            throw new IllegalArgumentException("数据源 [" + dsLabel + "] 的过滤字段名 [" + col + "] 不合法，仅支持字母/数字/下划线且以字母或下划线开头");
        }

        String mode = rule.getMatchMode();
        if (!MATCH_MODE_AUTO_BY_COLUMN.equals(mode) && !MATCH_MODE_STRICT_TABLES.equals(mode)) {
            throw new IllegalArgumentException("数据源 [" + dsLabel + "] 的过滤规则匹配模式 [" + mode + "] 不合法，仅支持 AUTO_BY_COLUMN 或 STRICT_TABLES");
        }

        List<String> values = rule.getValues();
        if (values == null || values.isEmpty()) {
            throw new IllegalArgumentException("数据源 [" + dsLabel + "] 的字段 [" + col + "] 过滤规则必须至少配置一个允许访问的值");
        }
        for (String val : values) {
            if (StringUtils.isBlank(val) || !TENANT_VALUE_PATTERN.matcher(val).matches()) {
                throw new IllegalArgumentException("数据源 [" + dsLabel + "] 的过滤值 [" + val + "] 包含非法字符，仅支持字母、数字、下划线和连字符");
            }
        }

        validateTableNameList(dsLabel, "指定目标表", rule.getTables());
        validateTableNameList(dsLabel, "排除表", rule.getExcludeTables());
    }

    /**
     * 校验表名列表格式合法性
     */
    private static void validateTableNameList(String dsLabel, String fieldLabel, List<String> tables) {
        if (tables == null || tables.isEmpty()) {
            return;
        }
        for (String tbl : tables) {
            if (!"*".equals(tbl) && !TABLE_NAME_PATTERN.matcher(tbl).matches()) {
                throw new IllegalArgumentException("数据源 [" + dsLabel + "] 的" + fieldLabel + " [" + tbl + "] 格式不合法");
            }
        }
    }

    /**
     * 校验单个数据源的租户/行级字段过滤策略配置是否完整安全（Fail-Closed）
     *
     * @param auth 数据源授权配置
     * @throws IllegalArgumentException 若配置了过滤规则或启用了租户隔离但字段名、值或表名配置不合法
     */
    public static void validateTenantPolicy(DatabaseAuth auth) {
        if (auth == null) {
            return;
        }
        normalizeAuth(auth);
        String dsLabel = StringUtils.defaultIfBlank(auth.getDatasourceName(), String.valueOf(auth.getDatasourceId()));

        if (auth.getRowFilterRules() != null && !auth.getRowFilterRules().isEmpty()) {
            for (RowFilterRule rule : auth.getRowFilterRules()) {
                validateRowFilterRule(dsLabel, rule);
            }
        }

        if (!Boolean.TRUE.equals(auth.getTenantIsolationEnabled())) {
            return;
        }

        String col = auth.getTenantColumn();
        if (StringUtils.isBlank(col) || !TENANT_COLUMN_PATTERN.matcher(col).matches()) {
            throw new IllegalArgumentException("数据源 [" + dsLabel + "] 的租户字段名 [" + col + "] 不合法，仅支持字母/数字/下划线且以字母或下划线开头");
        }

        List<String> values = auth.getTenantValues();
        if (values == null || values.isEmpty()) {
            throw new IllegalArgumentException("数据源 [" + dsLabel + "] 已开启租户行级隔离，必须至少配置一个允许访问的租户值");
        }
        for (String val : values) {
            if (StringUtils.isBlank(val) || !TENANT_VALUE_PATTERN.matcher(val).matches()) {
                throw new IllegalArgumentException("数据源 [" + dsLabel + "] 的租户值 [" + val + "] 包含非法字符，仅支持字母、数字、下划线和连字符");
            }
        }

        validateTableNameList(dsLabel, "豁免公共表名", auth.getTenantExemptTables());
    }

    /**
     * 批量校验多个数据源授权的租户隔离配置
     */
    public static void validateAllTenantPolicies(List<DatabaseAuth> authList) {
        if (authList == null || authList.isEmpty()) {
            return;
        }
        for (DatabaseAuth auth : authList) {
            validateTenantPolicy(auth);
        }
    }
}
