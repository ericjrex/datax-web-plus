package com.wugui.datax.admin.tool.util;

import com.wugui.datax.admin.dto.TablePrefixSuffixRuleDto;
import org.junit.Assert;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;

/**
 * 表名命名规则工具类测试
 *
 * @author ypc
 */
public class TableNamingUtilTest {

    @Test
    public void testPrefixSuffix() {
        TablePrefixSuffixRuleDto rule = new TablePrefixSuffixRuleDto();
        rule.setPrefix("ods_");
        rule.setSuffix("_df");

        String result = TableNamingUtil.applyNamingRule("sys_user", rule);
        Assert.assertEquals("ods_sys_user_df", result);
    }

    @Test
    public void testReplaceAndCase() {
        TablePrefixSuffixRuleDto rule = new TablePrefixSuffixRuleDto();
        rule.setPrefix("dwd_");
        rule.setReplaceFrom("t_");
        rule.setReplaceTo("");
        rule.setCaseType("LOWER");
        rule.setSuffix("_di");

        String result = TableNamingUtil.applyNamingRule("T_SYS_ORDER", rule);
        Assert.assertEquals("dwd_sys_order_di", result);
    }

    @Test
    public void testCamelAndUnderline() {
        Assert.assertEquals("sys_user_role", TableNamingUtil.camelToUnderline("sysUserRole"));
        Assert.assertEquals("sysUserRole", TableNamingUtil.underlineToCamel("sys_user_role"));
    }

    @Test
    public void testBatchApply() {
        TablePrefixSuffixRuleDto rule = new TablePrefixSuffixRuleDto();
        rule.setPrefix("stg_");
        rule.setSuffix("_full");

        List<String> tables = Arrays.asList("user", "order", "product");
        List<String> results = TableNamingUtil.applyNamingRuleBatch(tables, rule);

        Assert.assertEquals(3, results.size());
        Assert.assertEquals("stg_user_full", results.get(0));
        Assert.assertEquals("stg_order_full", results.get(1));
        Assert.assertEquals("stg_product_full", results.get(2));
    }

    @Test
    public void testSqlIdentifierValidation() {
        Assert.assertTrue(TableNamingUtil.isValidSqlIdentifier("sys_user_123"));
        Assert.assertFalse(TableNamingUtil.isValidSqlIdentifier("sys_user; DROP TABLE test;"));
        Assert.assertFalse(TableNamingUtil.isValidSqlIdentifier("sys_user' OR '1'='1"));
        Assert.assertFalse(TableNamingUtil.isValidSqlIdentifier("sys user"));
    }
}
