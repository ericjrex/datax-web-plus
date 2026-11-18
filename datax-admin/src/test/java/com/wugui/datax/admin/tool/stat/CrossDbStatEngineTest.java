package com.wugui.datax.admin.tool.stat;

import com.wugui.datax.admin.util.SqlSecurityUtil;
import org.junit.Assert;
import org.junit.Test;

import java.lang.reflect.Method;
import java.util.*;

/**
 * 跨库多源协同计算执行引擎单元测试
 *
 * @author ypc
 */
public class CrossDbStatEngineTest {

    @Test
    public void testContainsCrossDbAnnotation() {
        String normalSql = "SELECT count(1) FROM sys_user";
        Assert.assertFalse(CrossDbStatEngine.containsCrossDbAnnotation(normalSql));

        String crossSql1 = "SELECT 0 as tenant_id, /*ds:15*/ (SELECT count(*) FROM t_sign_apply) as total";
        Assert.assertTrue(CrossDbStatEngine.containsCrossDbAnnotation(crossSql1));

        String crossSql2 = "SELECT 0 as tenant_id, /*ds:oa_db*/ (SELECT count(*) FROM bpm_oa_report) as total";
        Assert.assertTrue(CrossDbStatEngine.containsCrossDbAnnotation(crossSql2));

        String crossSql3 = "SELECT 0 as tenant_id, /*DS:校车业务库*/ (SELECT count(*) FROM t_bus_trips) as total";
        Assert.assertTrue(CrossDbStatEngine.containsCrossDbAnnotation(crossSql3));
    }

    @Test
    public void testSqlCommentStrippingAndCrossDbTagPreservation() {
        String sqlWithComments = "-- 这是行首注释\n" +
                "SELECT 0 as tenant_id, -- 租户ID注释\n" +
                "/*ds:oa_db*/ (SELECT count(*) FROM bpm_oa_report) as oa_cnt, /* 内部说明注释 */\n" +
                "10 as const_val -- 行尾注释";

        String sanitized = SqlSecurityUtil.stripSafeComments(sqlWithComments);
        // 单行注释应当被剥离
        Assert.assertFalse(sanitized.contains("这是行首注释"));
        Assert.assertFalse(sanitized.contains("租户ID注释"));
        Assert.assertFalse(sanitized.contains("行尾注释"));
        Assert.assertFalse(sanitized.contains("内部说明注释"));

        // 跨库路由标记必须完整保留
        Assert.assertTrue(sanitized.contains("/*ds:oa_db*/"));

        // 只读安全审计应该顺利放行该 SQL
        String validated = SqlSecurityUtil.validateReadOnlySql(sqlWithComments);
        Assert.assertNotNull(validated);
        Assert.assertTrue(validated.startsWith("SELECT"));
    }

    @Test
    public void testFormatSqlLiteral() {
        Assert.assertEquals("NULL", CrossDbStatEngine.formatSqlLiteral(null));
        Assert.assertEquals("123", CrossDbStatEngine.formatSqlLiteral(123));
        Assert.assertEquals("45.67", CrossDbStatEngine.formatSqlLiteral(45.67));
        Assert.assertEquals("1", CrossDbStatEngine.formatSqlLiteral(true));
        Assert.assertEquals("0", CrossDbStatEngine.formatSqlLiteral(false));
        Assert.assertEquals("'hello'", CrossDbStatEngine.formatSqlLiteral("hello"));
        Assert.assertEquals("'O''Reilly'", CrossDbStatEngine.formatSqlLiteral("O'Reilly"));
    }

    @Test
    public void testCloseParenMatching() throws Exception {
        Method method = CrossDbStatEngine.class.getDeclaredMethod("findMatchingCloseParen", String.class, int.class);
        method.setAccessible(true);

        // 包含嵌套括号与字符串常量的复杂子查询
        String complexSql = "SELECT /*ds:oa*/ (SELECT count(*) FROM bpm_oa WHERE type IN ('A', 'B') AND name != ')hello') AS cnt";
        int openParen = complexSql.indexOf('(');

        int closeParen = (int) method.invoke(null, complexSql, openParen);
        Assert.assertTrue(closeParen > openParen);
        String subquery = complexSql.substring(openParen + 1, closeParen);
        Assert.assertEquals("SELECT count(*) FROM bpm_oa WHERE type IN ('A', 'B') AND name != ')hello'", subquery);
    }

    @Test
    public void testCompositeKeyBuilding() throws Exception {
        Method method = CrossDbStatEngine.class.getDeclaredMethod("buildCompositeKey", Map.class, List.class);
        method.setAccessible(true);

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("tenant_id", 155);
        row.put("stat_date", "2026-09-03");
        row.put("amount", 99.5);

        List<String> joinKeys = Arrays.asList("tenant_id", "stat_date");
        String compositeKey = (String) method.invoke(null, row, joinKeys);
        Assert.assertEquals("155||2026-09-03||", compositeKey);
    }
}
