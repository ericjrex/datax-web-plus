package com.wugui.datax.admin.tool;

import com.wugui.datax.admin.util.OpenApiPermissionUtil;
import com.wugui.datax.admin.util.OpenApiPermissionUtil.DatabaseAuth;
import com.wugui.datax.admin.util.OpenApiPermissionUtil.RowFilterRule;
import com.wugui.datax.admin.util.OpenApiSignUtil;
import com.wugui.datax.admin.util.OpenApiSqlAstParser;
import com.wugui.datax.admin.util.OpenApiSqlTenantRewriter;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import org.junit.Assert;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 外部开放 API 签名、防重放与 AST 语法树安全单元测试
 *
 * @author ypc
 * @since 2026-10-28
 */
public class OpenApiSecurityTest {

    @Test
    public void testHmacSha256Signature() {
        String method = "GET";
        String url = "/api/open/v1/metadata/tables";
        String accessKey = "ak_test123456";
        long timestamp = 1730000000L;
        String nonce = "randomNonce123";
        String secret = "secret_abcdefg123456789";

        // 1. 测试签名一致性
        String sign1 = OpenApiSignUtil.calculateSignature(method, url, accessKey, timestamp, nonce, secret);
        String sign2 = OpenApiSignUtil.calculateSignature("get", url + "?param=abc", accessKey, timestamp, nonce, secret);
        Assert.assertNotNull(sign1);
        Assert.assertEquals("不同大小写或带参数URL生成的标准签名应一致", sign1, sign2);

        // 2. 测试常量时间比较
        Assert.assertTrue(OpenApiSignUtil.constantTimeEquals(sign1, sign2));
        Assert.assertFalse(OpenApiSignUtil.constantTimeEquals(sign1, "wrong_signature"));
    }

    @Test
    public void testNonceAntiReplay() {
        String accessKey = "ak_replay_test";
        String nonce = "nonce_unique_999";

        // 首次使用应放行
        boolean firstTime = OpenApiSignUtil.verifyAndRecordNonce(accessKey, nonce);
        Assert.assertTrue("首次请求随机数应校验通过", firstTime);

        // 重复使用同一次 nonce 应被判定为重放攻击
        boolean secondTime = OpenApiSignUtil.verifyAndRecordNonce(accessKey, nonce);
        Assert.assertFalse("重复提交的随机数应被拦截", secondTime);
    }

    @Test
    public void testSqlAstTableExtraction() {
        // 1. 复杂子查询 + JOIN 查询
        String sql = "SELECT u.id, u.name, o.order_no " +
                "FROM dim_user u " +
                "LEFT JOIN dws_order_stat o ON u.id = o.user_id " +
                "WHERE u.status = 1 AND u.id IN (SELECT user_id FROM ods_login_log WHERE login_date >= '2026-10-01')";

        List<String> tables = OpenApiSqlAstParser.parseAndValidateSql(sql);
        Assert.assertNotNull(tables);
        Assert.assertTrue("应提取出 dim_user 表", tables.contains("dim_user"));
        Assert.assertTrue("应提取出 dws_order_stat 表", tables.contains("dws_order_stat"));
        Assert.assertTrue("应提取出子查询中的 ods_login_log 表", tables.contains("ods_login_log"));
        Assert.assertEquals("应精确提取出 3 张物理表", 3, tables.size());
    }

    @Test(expected = SecurityException.class)
    public void testBlockDangerousWriteCommand() {
        // 尝试写指令注入
        String maliciousSql = "DROP TABLE ads_driver_stat_df";
        OpenApiSqlAstParser.parseAndValidateSql(maliciousSql);
    }

    @Test(expected = SecurityException.class)
    public void testBlockProbingFunctionSleep() {
        // 尝试使用 sleep 进行拒绝服务探测
        String probingSql = "SELECT id, name FROM dim_user WHERE id = 1 AND SLEEP(5) = 0";
        OpenApiSqlAstParser.parseAndValidateSql(probingSql);
    }

    @Test(expected = SecurityException.class)
    public void testBlockSystemCatalogProbe() {
        // 尝试跨库读取 information_schema
        String catalogSql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";
        OpenApiSqlAstParser.parseAndValidateSql(catalogSql);
    }

    @Test
    public void testMultiDatabasePermissions() {
        String permissionsJson = "[{\"datasourceId\":8,\"datasourceName\":\"datax_final\",\"allTables\":false,\"tables\":[\"dim_sys_platform\",\"dwd_taxi_driver_shift_di\"]},{\"datasourceId\":9,\"datasourceName\":\"beidou_dw\",\"allTables\":true,\"tables\":[\"*\"]}]";
        List<OpenApiPermissionUtil.DatabaseAuth> authList = OpenApiPermissionUtil.parsePermissions(permissionsJson, null, null);
        Assert.assertEquals(2, authList.size());

        // 验证库 8 表白名单与大小写容错
        OpenApiPermissionUtil.DatabaseAuth auth8 = OpenApiPermissionUtil.findAuthByDatasourceId(authList, 8L);
        Assert.assertNotNull(auth8);
        Assert.assertFalse(auth8.getAllTables());
        Assert.assertTrue(OpenApiPermissionUtil.isTableAllowed(auth8, "dim_sys_platform"));
        Assert.assertTrue(OpenApiPermissionUtil.isTableAllowed(auth8, "DIM_SYS_PLATFORM"));
        Assert.assertFalse(OpenApiPermissionUtil.isTableAllowed(auth8, "ods_other_table"));

        // 验证库 9 通配全表
        OpenApiPermissionUtil.DatabaseAuth auth9 = OpenApiPermissionUtil.findAuthByDatasourceId(authList, 9L);
        Assert.assertNotNull(auth9);
        Assert.assertTrue(auth9.getAllTables());
        Assert.assertTrue(OpenApiPermissionUtil.isTableAllowed(auth9, "any_random_table"));

        // 验证旧单库向下兼容降级
        List<OpenApiPermissionUtil.DatabaseAuth> fallbackList = OpenApiPermissionUtil.parsePermissions(null, 10L, "table_a,table_b");
        Assert.assertEquals(1, fallbackList.size());
        OpenApiPermissionUtil.DatabaseAuth auth10 = fallbackList.get(0);
        Assert.assertEquals(Long.valueOf(10L), auth10.getDatasourceId());
        Assert.assertTrue(OpenApiPermissionUtil.isTableAllowed(auth10, "table_a"));
        Assert.assertFalse(OpenApiPermissionUtil.isTableAllowed(auth10, "table_c"));
        Assert.assertFalse(OpenApiPermissionUtil.isTenantIsolationEnabled(auth10));
    }

    @Test
    public void testTenantPolicyParseAndValidation() {
        String json = "[{\"datasourceId\":12,\"datasourceName\":\"ods_oa_system\",\"allTables\":true,\"tables\":[],"
                + "\"tenantIsolationEnabled\":true,\"tenantColumn\":\"tenant_id\",\"tenantValues\":[\"1001\",\"1002\"],\"tenantExemptTables\":[\"sys_dict\"]}]";
        List<OpenApiPermissionUtil.DatabaseAuth> list = OpenApiPermissionUtil.parsePermissions(json, null, null);
        Assert.assertEquals(1, list.size());
        OpenApiPermissionUtil.DatabaseAuth auth = list.get(0);
        Assert.assertTrue(OpenApiPermissionUtil.isTenantIsolationEnabled(auth));
        Assert.assertEquals("tenant_id", auth.getTenantColumn());
        Assert.assertEquals(2, auth.getTenantValues().size());
        Assert.assertTrue(OpenApiPermissionUtil.isTableTenantExempt(auth, "SYS_DICT"));
        OpenApiPermissionUtil.validateTenantPolicy(auth);

        // 非法空租户值校验
        OpenApiPermissionUtil.DatabaseAuth emptyValAuth = new OpenApiPermissionUtil.DatabaseAuth();
        emptyValAuth.setDatasourceId(12L);
        emptyValAuth.setTenantIsolationEnabled(true);
        emptyValAuth.setTenantColumn("tenant_id");
        emptyValAuth.setTenantValues(Collections.emptyList());
        try {
            OpenApiPermissionUtil.validateTenantPolicy(emptyValAuth);
            Assert.fail("开启租户隔离但未配租户值应抛出异常");
        } catch (IllegalArgumentException expected) {
            Assert.assertTrue(expected.getMessage().contains("必须至少配置一个允许访问的租户值"));
        }

        // 非法字段名与租户值注入字符校验
        OpenApiPermissionUtil.DatabaseAuth badColAuth = new OpenApiPermissionUtil.DatabaseAuth();
        badColAuth.setDatasourceId(12L);
        badColAuth.setTenantIsolationEnabled(true);
        badColAuth.setTenantColumn("tenant_id;DROP");
        badColAuth.setTenantValues(Collections.singletonList("1001"));
        try {
            OpenApiPermissionUtil.validateTenantPolicy(badColAuth);
            Assert.fail("非法租户字段名应抛出异常");
        } catch (IllegalArgumentException expected) {
            Assert.assertTrue(expected.getMessage().contains("不合法"));
        }

        OpenApiPermissionUtil.DatabaseAuth badValAuth = new OpenApiPermissionUtil.DatabaseAuth();
        badValAuth.setDatasourceId(12L);
        badValAuth.setTenantIsolationEnabled(true);
        badValAuth.setTenantColumn("tenant_id");
        badValAuth.setTenantValues(Collections.singletonList("1001' OR '1'='1"));
        try {
            OpenApiPermissionUtil.validateTenantPolicy(badValAuth);
            Assert.fail("含 SQL 控制字符的租户值应抛出异常");
        } catch (IllegalArgumentException expected) {
            Assert.assertTrue(expected.getMessage().contains("非法字符"));
        }
    }

    @Test
    public void testCrossSchemaIsolationInAstParser() {
        Assert.assertEquals("ods_oa_system",
                OpenApiSqlAstParser.extractSchemaFromJdbcUrl("jdbc:mysql://10.0.0.1:3306/ods_oa_system?useUnicode=true&characterEncoding=utf-8"));

        List<String> sameSchemaTables = OpenApiSqlAstParser.parseAndValidateSql(
                "SELECT id FROM ods_oa_system.oa_user", "ods_oa_system", true);
        Assert.assertEquals(Collections.singletonList("oa_user"), sameSchemaTables);

        try {
            OpenApiSqlAstParser.parseAndValidateSql("SELECT id FROM other_db.oa_user", "ods_oa_system", true);
            Assert.fail("跨库表访问应被拦截");
        } catch (SecurityException expected) {
            Assert.assertTrue(expected.getMessage().contains("禁止跨库访问"));
        }
    }

    @Test
    public void testTenantRewriterOrPrecedenceAndMultiTenant() throws Exception {
        OpenApiPermissionUtil.DatabaseAuth singleTenantAuth = buildTenantAuth(Collections.singletonList("1001"), Collections.singletonList("sys_dict"));
        String rewritten = OpenApiSqlTenantRewriter.rewriteSqlForTenant(
                "SELECT id, name FROM oa_user WHERE status = 1 OR dept_id = 2", singleTenantAuth, "ods_oa_system");

        Assert.assertTrue("应包含括号保护原 OR 条件", rewritten.contains("(status = 1 OR dept_id = 2)"));
        Assert.assertTrue("应注入单租户等值过滤", rewritten.contains("oa_user.tenant_id = '1001'"));
        Assert.assertTrue(CCJSqlParserUtil.parse(rewritten) instanceof Select);

        OpenApiPermissionUtil.DatabaseAuth multiTenantAuth = buildTenantAuth(Arrays.asList("1001", "1002"), Collections.emptyList());
        String multiRewritten = OpenApiSqlTenantRewriter.rewriteSqlForTenant(
                "SELECT COUNT(*) FROM oa_user u", multiTenantAuth, "ods_oa_system");
        Assert.assertTrue("多租户应注入 IN 条件", multiRewritten.contains("u.tenant_id IN ('1001', '1002')"));
    }

    @Test
    public void testTenantRewriterJoinsAndExemptTables() throws Exception {
        OpenApiPermissionUtil.DatabaseAuth auth = buildTenantAuth(Collections.singletonList("1001"), Collections.singletonList("sys_dict"));

        // 1. INNER JOIN + 公共豁免表
        String joinSql = "SELECT u.id, d.dict_label FROM oa_user u INNER JOIN sys_dict d ON u.sex = d.dict_val";
        String joinRewritten = OpenApiSqlTenantRewriter.rewriteSqlForTenant(joinSql, auth, "ods_oa_system");
        Assert.assertTrue(joinRewritten.contains("u.tenant_id = '1001'"));
        Assert.assertFalse("公共豁免表不应注入租户过滤", joinRewritten.contains("d.tenant_id"));

        // 2. LEFT JOIN 右表条件必须进入 ON 子句，左表条件进入 WHERE
        String leftJoinSql = "SELECT u.id, o.order_no FROM oa_user u LEFT JOIN oa_order o ON u.id = o.user_id";
        String leftRewritten = OpenApiSqlTenantRewriter.rewriteSqlForTenant(leftJoinSql, auth, "ods_oa_system");
        Select leftParsed = (Select) CCJSqlParserUtil.parse(leftRewritten);
        PlainSelect leftPs = (PlainSelect) leftParsed.getSelectBody();
        Assert.assertTrue("左表过滤应在 WHERE", leftPs.getWhere().toString().contains("u.tenant_id = '1001'"));
        Assert.assertFalse("LEFT JOIN 右表过滤不应放入 WHERE", leftPs.getWhere().toString().contains("o.tenant_id"));
        Assert.assertTrue("LEFT JOIN 右表过滤应在 ON", leftPs.getJoins().get(0).getOnExpression().toString().contains("o.tenant_id = '1001'"));

        // 3. RIGHT JOIN 左表进 ON，右表进 WHERE
        String rightJoinSql = "SELECT u.id, o.order_no FROM oa_user u RIGHT JOIN oa_order o ON u.id = o.user_id";
        String rightRewritten = OpenApiSqlTenantRewriter.rewriteSqlForTenant(rightJoinSql, auth, "ods_oa_system");
        Select rightParsed = (Select) CCJSqlParserUtil.parse(rightRewritten);
        PlainSelect rightPs = (PlainSelect) rightParsed.getSelectBody();
        Assert.assertTrue("RIGHT JOIN 右表过滤应在 WHERE", rightPs.getWhere().toString().contains("o.tenant_id = '1001'"));
        Assert.assertTrue("RIGHT JOIN 左表过滤应在 ON", rightPs.getJoins().get(0).getOnExpression().toString().contains("u.tenant_id = '1001'"));

        // 4. 禁止 NATURAL JOIN / JOIN USING
        try {
            OpenApiSqlTenantRewriter.rewriteSqlForTenant("SELECT * FROM oa_user NATURAL JOIN oa_dept", auth, "ods_oa_system");
            Assert.fail("NATURAL JOIN 应被拒绝");
        } catch (SecurityException expected) {
            Assert.assertTrue(expected.getMessage().contains("NATURAL JOIN"));
        }
        try {
            OpenApiSqlTenantRewriter.rewriteSqlForTenant("SELECT * FROM oa_user JOIN oa_dept USING (dept_id)", auth, "ods_oa_system");
            Assert.fail("JOIN USING 应被拒绝");
        } catch (SecurityException expected) {
            Assert.assertTrue(expected.getMessage().contains("USING"));
        }
    }

    @Test
    public void testTenantRewriterCteUnionAndSubqueries() throws Exception {
        OpenApiPermissionUtil.DatabaseAuth auth = buildTenantAuth(Collections.singletonList("1001"), Collections.emptyList());

        String complexSql = "WITH active_users AS (SELECT id, dept_id FROM oa_user WHERE status = 1) "
                + "SELECT au.id FROM active_users au WHERE au.dept_id IN (SELECT id FROM oa_dept WHERE level > ALL (SELECT min_level FROM oa_rule)) "
                + "UNION ALL "
                + "SELECT emp.id FROM oa_emp emp WHERE EXISTS (SELECT 1 FROM oa_log l WHERE l.emp_id = emp.id)";

        String rewritten = OpenApiSqlTenantRewriter.rewriteSqlForTenant(complexSql, auth, "ods_oa_system");
        Assert.assertTrue(rewritten.contains("oa_user.tenant_id = '1001'"));
        Assert.assertFalse("虚拟 CTE 引用不应被注入过滤条件", rewritten.contains("au.tenant_id"));
        Assert.assertTrue(rewritten.contains("oa_dept.tenant_id = '1001'"));
        Assert.assertTrue(rewritten.contains("oa_rule.tenant_id = '1001'"));
        Assert.assertTrue(rewritten.contains("emp.tenant_id = '1001'"));
        Assert.assertTrue(rewritten.contains("l.tenant_id = '1001'"));
        Assert.assertTrue(CCJSqlParserUtil.parse(rewritten) instanceof Select);
    }

    @Test(expected = SecurityException.class)
    public void testTenantRewriterFailClosedOnEmptyRuntimeTenantValues() {
        OpenApiPermissionUtil.DatabaseAuth brokenAuth = new OpenApiPermissionUtil.DatabaseAuth();
        brokenAuth.setDatasourceId(12L);
        brokenAuth.setTenantIsolationEnabled(true);
        brokenAuth.setTenantColumn("tenant_id");
        brokenAuth.setTenantValues(Collections.emptyList());
        OpenApiSqlTenantRewriter.rewriteSqlForTenant("SELECT * FROM oa_user", brokenAuth, "ods_oa_system");
    }

    @Test
    public void testRowFilterRulesParseValidationAndLegacyFallback() {
        String json = "[{\"datasourceId\":15,\"datasourceName\":\"dwd_hr\",\"allTables\":true,\"tables\":[],"
                + "\"rowFilterRules\":["
                + "{\"column\":\"tenant_id\",\"values\":[\"1001\"],\"matchMode\":\"AUTO_BY_COLUMN\",\"excludeTables\":[\"sys_cfg\"]},"
                + "{\"column\":\"dept_id\",\"values\":[\"10\",\"20\"],\"matchMode\":\"STRICT_TABLES\",\"tables\":[\"oa_emp\"]}"
                + "]}]";
        List<DatabaseAuth> list = OpenApiPermissionUtil.parsePermissions(json, null, null);
        Assert.assertEquals(1, list.size());
        DatabaseAuth auth = list.get(0);
        Assert.assertTrue(OpenApiPermissionUtil.hasActiveRowFilters(auth));
        List<RowFilterRule> rules = OpenApiPermissionUtil.resolveEffectiveRules(auth);
        Assert.assertEquals(2, rules.size());
        OpenApiPermissionUtil.validateTenantPolicy(auth);

        // 旧版单租户配置自动降级兼容
        DatabaseAuth legacyAuth = buildTenantAuth(Collections.singletonList("1001"), Collections.singletonList("sys_dict"));
        List<RowFilterRule> legacyRules = OpenApiPermissionUtil.resolveEffectiveRules(legacyAuth);
        Assert.assertEquals(1, legacyRules.size());
        Assert.assertEquals("tenant_id", legacyRules.get(0).getColumn());
        Assert.assertEquals(OpenApiPermissionUtil.MATCH_MODE_STRICT_TABLES, legacyRules.get(0).getMatchMode());
        Assert.assertTrue(legacyRules.get(0).getExcludeTables().contains("sys_dict"));

        // 非法匹配模式应拦截
        DatabaseAuth badModeAuth = new DatabaseAuth();
        badModeAuth.setDatasourceId(15L);
        RowFilterRule badRule = new RowFilterRule();
        badRule.setColumn("dept_id");
        badRule.setValues(Collections.singletonList("10"));
        badRule.setMatchMode("INVALID_MODE");
        badModeAuth.setRowFilterRules(Collections.singletonList(badRule));
        try {
            OpenApiPermissionUtil.validateTenantPolicy(badModeAuth);
            Assert.fail("非法 matchMode 应抛出异常");
        } catch (IllegalArgumentException expected) {
            Assert.assertTrue(expected.getMessage().contains("匹配模式"));
        }
    }

    @Test
    public void testAutoByColumnAndStrictTablesMatching() {
        RowFilterRule tenantRule = buildRule("tenant_id", Collections.singletonList("1001"),
                OpenApiPermissionUtil.MATCH_MODE_AUTO_BY_COLUMN, Collections.emptyList(), Collections.singletonList("oa_global"));
        RowFilterRule corpRule = buildRule("corp_id", Collections.singletonList("c99"),
                OpenApiPermissionUtil.MATCH_MODE_AUTO_BY_COLUMN, Collections.emptyList(), Collections.emptyList());
        RowFilterRule deptStrictRule = buildRule("dept_id", Arrays.asList("10", "20"),
                OpenApiPermissionUtil.MATCH_MODE_STRICT_TABLES, Collections.singletonList("oa_user"), Collections.emptyList());
        List<RowFilterRule> rules = Arrays.asList(tenantRule, corpRule, deptStrictRule);

        // 1. oa_user 含 tenant_id 和 dept_id，命中 2 条规则
        Set<String> userCols = new HashSet<>(Arrays.asList("id", "name", "tenant_id", "dept_id"));
        List<RowFilterRule> userMatched = OpenApiPermissionUtil.matchRulesForTable(rules, "oa_user", userCols, true);
        Assert.assertEquals(2, userMatched.size());

        // 2. oa_bill 仅含 corp_id，自动跳过 tenant_id 与非目标的 dept_id
        Set<String> billCols = new HashSet<>(Arrays.asList("id", "amount", "corp_id"));
        List<RowFilterRule> billMatched = OpenApiPermissionUtil.matchRulesForTable(rules, "oa_bill", billCols, true);
        Assert.assertEquals(1, billMatched.size());
        Assert.assertEquals("corp_id", billMatched.get(0).getColumn());

        // 3. sys_dict 不含任何规则字段，AUTO_BY_COLUMN 自动跳过
        Set<String> dictCols = new HashSet<>(Arrays.asList("id", "dict_key", "dict_val"));
        List<RowFilterRule> dictMatched = OpenApiPermissionUtil.matchRulesForTable(rules, "sys_dict", dictCols, true);
        Assert.assertTrue(dictMatched.isEmpty());

        // 4. oa_global 虽含 tenant_id 但在 excludeTables 中，应被排除
        Set<String> globalCols = new HashSet<>(Arrays.asList("id", "tenant_id"));
        List<RowFilterRule> globalMatched = OpenApiPermissionUtil.matchRulesForTable(rules, "oa_global", globalCols, true);
        Assert.assertTrue(globalMatched.isEmpty());

        // 5. STRICT_TABLES 目标表 oa_user 缺失 dept_id 时 Fail-Closed 抛出 SecurityException
        Set<String> brokenUserCols = new HashSet<>(Arrays.asList("id", "tenant_id"));
        try {
            OpenApiPermissionUtil.matchRulesForTable(rules, "oa_user", brokenUserCols, true);
            Assert.fail("STRICT_TABLES 目标表缺少过滤字段时应拦截");
        } catch (SecurityException expected) {
            Assert.assertTrue(expected.getMessage().contains("未包含行级过滤字段"));
        }
    }

    @Test
    public void testMultiRuleAstRewriteWithAndAndJoins() throws Exception {
        RowFilterRule tenantRule = buildRule("tenant_id", Collections.singletonList("1001"),
                OpenApiPermissionUtil.MATCH_MODE_AUTO_BY_COLUMN, Collections.emptyList(), Collections.emptyList());
        RowFilterRule deptRule = buildRule("dept_id", Arrays.asList("10", "20"),
                OpenApiPermissionUtil.MATCH_MODE_AUTO_BY_COLUMN, Collections.emptyList(), Collections.emptyList());
        RowFilterRule corpRule = buildRule("corp_id", Collections.singletonList("c99"),
                OpenApiPermissionUtil.MATCH_MODE_AUTO_BY_COLUMN, Collections.emptyList(), Collections.emptyList());

        Map<String, List<RowFilterRule>> tableRulesMap = new HashMap<>();
        tableRulesMap.put("oa_user", Arrays.asList(tenantRule, deptRule));
        tableRulesMap.put("oa_bill", Collections.singletonList(corpRule));
        // sys_dict 未命中任何规则，不放入 map

        String sql = "SELECT u.id, b.amount, d.dict_label "
                + "FROM oa_user u "
                + "LEFT JOIN oa_bill b ON u.id = b.user_id "
                + "LEFT JOIN sys_dict d ON u.sex = d.dict_val "
                + "WHERE u.status = 1 OR u.flag = 2";

        String rewritten = OpenApiSqlTenantRewriter.rewriteSqlForRules(sql, tableRulesMap, "ods_oa_system");
        Select parsed = (Select) CCJSqlParserUtil.parse(rewritten);
        PlainSelect ps = (PlainSelect) parsed.getSelectBody();

        String whereStr = ps.getWhere().toString();
        Assert.assertTrue("应括号保护原有 OR 条件", whereStr.contains("(u.status = 1 OR u.flag = 2)"));
        Assert.assertTrue("主表应注入 tenant_id", whereStr.contains("u.tenant_id = '1001'"));
        Assert.assertTrue("主表应 AND 叠加注入 dept_id", whereStr.contains("u.dept_id IN ('10', '20')"));

        String billOnStr = ps.getJoins().get(0).getOnExpression().toString();
        Assert.assertTrue("LEFT JOIN 右表 oa_bill 应注入不同字段 corp_id 到 ON", billOnStr.contains("b.corp_id = 'c99'"));

        String dictOnStr = ps.getJoins().get(1).getOnExpression().toString();
        Assert.assertFalse("无匹配规则的 sys_dict 不应注入任何过滤条件", dictOnStr.contains("tenant_id"));
        Assert.assertFalse("无匹配规则的 sys_dict 不应注入 corp_id", dictOnStr.contains("corp_id"));

        // 跨库表前缀在行级规则启用下必须拦截
        try {
            OpenApiSqlTenantRewriter.rewriteSqlForRules(
                    "SELECT * FROM other_db.oa_user", tableRulesMap, "ods_oa_system");
            Assert.fail("跨库表名应被拦截");
        } catch (SecurityException expected) {
            Assert.assertTrue(expected.getMessage().contains("禁止跨库访问"));
        }
    }

    private RowFilterRule buildRule(
            String column,
            List<String> values,
            String matchMode,
            List<String> tables,
            List<String> excludeTables) {
        RowFilterRule rule = new RowFilterRule();
        rule.setColumn(column);
        rule.setValues(values);
        rule.setMatchMode(matchMode);
        rule.setTables(tables);
        rule.setExcludeTables(excludeTables);
        return rule;
    }

    private OpenApiPermissionUtil.DatabaseAuth buildTenantAuth(List<String> tenantValues, List<String> exemptTables) {
        OpenApiPermissionUtil.DatabaseAuth auth = new OpenApiPermissionUtil.DatabaseAuth();
        auth.setDatasourceId(12L);
        auth.setDatasourceName("ods_oa_system");
        auth.setAllTables(true);
        auth.setTenantIsolationEnabled(true);
        auth.setTenantColumn("tenant_id");
        auth.setTenantValues(tenantValues);
        auth.setTenantExemptTables(exemptTables);
        return auth;
    }
}
