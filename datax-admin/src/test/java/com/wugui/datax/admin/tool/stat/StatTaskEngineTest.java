package com.wugui.datax.admin.tool.stat;

import com.wugui.datax.admin.dto.StatTaskColumnMappingDto;
import com.wugui.datax.admin.dto.StatTaskResultDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.util.SqlSecurityUtil;
import org.junit.Assert;
import org.junit.Test;

import java.lang.reflect.Method;
import java.util.*;

/**
 * 统计计算双引擎与目标写入单元测试
 *
 * @author ypc
 */
public class StatTaskEngineTest {

    @Test
    public void testSqlDynamicParamsReplacement() {
        String templateSql = "SELECT dept_id, count(1) as cnt FROM sys_user WHERE create_time >= '${bizDate} 00:00:00' AND status = ${status} GROUP BY dept_id";
        Map<String, String> customParams = new HashMap<>();
        customParams.put("status", "1");

        String resolvedSql = SqlStatEngine.replaceDynamicParams(templateSql, customParams);
        Assert.assertFalse(resolvedSql.contains("${bizDate}"));
        Assert.assertFalse(resolvedSql.contains("${status}"));
        Assert.assertTrue(resolvedSql.contains("status = 1"));
    }

    @Test
    public void testSqlSecurityAuditPass() {
        String safeSql = "SELECT a.dept_id, count(1) as total_emp, sum(a.salary) as total_salary " +
                "FROM sys_emp a " +
                "WHERE a.is_deleted = 0 " +
                "GROUP BY a.dept_id " +
                "HAVING count(1) > 5 " +
                "ORDER BY total_salary DESC";

        String validated = SqlSecurityUtil.validateReadOnlySql(safeSql);
        Assert.assertNotNull(validated);
        Assert.assertTrue(validated.startsWith("SELECT"));
    }

    @Test(expected = SecurityException.class)
    public void testSqlSecurityAuditBlockDml() {
        String maliciousSql = "SELECT * FROM sys_user; DROP TABLE sys_user;";
        SqlSecurityUtil.validateReadOnlySql(maliciousSql);
    }

    @Test(expected = SecurityException.class)
    public void testSqlSecurityAuditBlockDelete() {
        String maliciousSql = "DELETE FROM sys_log WHERE id > 0";
        SqlSecurityUtil.validateReadOnlySql(maliciousSql);
    }

    @Test
    public void testPythonFormatAParsing() throws Exception {
        String simulatedOutput = "INFO: starting python script...\n" +
                "DEBUG: fetching data from API...\n" +
                "===DATAX_STAT_DATA_START===\n" +
                "[\n" +
                "  {\"stat_date\": \"2026-09-03\", \"dept_id\": 101, \"user_cnt\": 50, \"amount\": 12500.50},\n" +
                "  {\"stat_date\": \"2026-09-03\", \"dept_id\": 102, \"user_cnt\": 30, \"amount\": 8300.00}\n" +
                "]\n" +
                "===DATAX_STAT_DATA_END===\n" +
                "INFO: done!";

        StatTaskResultDto result = new StatTaskResultDto();
        Method parseMethod = PythonStatEngine.class.getDeclaredMethod("parseStandardDataOutput", String.class, StatTaskResultDto.class, Integer.class);
        parseMethod.setAccessible(true);
        parseMethod.invoke(null, simulatedOutput, result, 50);

        Assert.assertEquals(2, result.getTotalRows().longValue());
        Assert.assertEquals(4, result.getColumns().size());
        Assert.assertTrue(result.getColumns().contains("stat_date"));
        Assert.assertTrue(result.getColumns().contains("dept_id"));
        Assert.assertTrue(result.getColumns().contains("user_cnt"));
        Assert.assertTrue(result.getColumns().contains("amount"));
        Assert.assertEquals("2026-09-03", result.getRows().get(0).get("stat_date"));
    }

    @Test
    public void testPythonFormatBParsing() throws Exception {
        String simulatedOutput = "===DATAX_STAT_DATA_START===\n" +
                "{\n" +
                "  \"columns\": [\"stat_date\", \"channel\", \"pv\"],\n" +
                "  \"data\": [\n" +
                "    [\"2026-09-03\", \"APP\", 15000],\n" +
                "    [\"2026-09-03\", \"WEB\", 8500]\n" +
                "  ]\n" +
                "}\n" +
                "===DATAX_STAT_DATA_END===";

        StatTaskResultDto result = new StatTaskResultDto();
        Method parseMethod = PythonStatEngine.class.getDeclaredMethod("parseStandardDataOutput", String.class, StatTaskResultDto.class, Integer.class);
        parseMethod.setAccessible(true);
        parseMethod.invoke(null, simulatedOutput, result, 50);

        Assert.assertEquals(2, result.getTotalRows().longValue());
        Assert.assertEquals(3, result.getColumns().size());
        Assert.assertEquals("APP", result.getRows().get(0).get("channel"));
        Assert.assertEquals(15000, result.getRows().get(0).get("pv"));
    }

    @Test
    public void testTargetWriterColumnPairsAndInsertSql() throws Exception {
        List<StatTaskColumnMappingDto> mappings = new ArrayList<>();
        mappings.add(new StatTaskColumnMappingDto("stat_date", "stat_date", "VARCHAR", false, "统计日期"));
        mappings.add(new StatTaskColumnMappingDto("dept_id", "dept_id", "BIGINT", true, "部门ID"));
        mappings.add(new StatTaskColumnMappingDto("total_amt", "amount", "DECIMAL", false, "总金额"));

        List<TargetDataWriterEngine.ColumnPair> pairs = TargetDataWriterEngine.buildActiveColumnPairs(mappings, null, null);
        Assert.assertEquals(3, pairs.size());

        Method buildInsertSqlMethod = TargetDataWriterEngine.class.getDeclaredMethod("buildInsertSql", String.class, String.class, String.class, List.class);
        buildInsertSqlMethod.setAccessible(true);

        // 测试 APPEND SQL 构造
        String appendSql = (String) buildInsertSqlMethod.invoke(null, "MYSQL", "rpt_daily_stat", "APPEND", pairs);
        Assert.assertTrue(appendSql.contains("INSERT INTO `rpt_daily_stat`"));
        Assert.assertTrue(appendSql.contains("VALUES (?, ?, ?)"));
        Assert.assertFalse(appendSql.contains("ON DUPLICATE KEY UPDATE"));

        // 测试 UPSERT SQL 构造
        String upsertSql = (String) buildInsertSqlMethod.invoke(null, "MYSQL", "rpt_daily_stat", "UPSERT", pairs);
        Assert.assertTrue(upsertSql.contains("ON DUPLICATE KEY UPDATE"));
        Assert.assertTrue(upsertSql.contains("`amount` = VALUES(`amount`)"));
        // 主键不应出现在 UPDATE 中
        Assert.assertFalse(upsertSql.contains("`dept_id` = VALUES(`dept_id`)"));
    }

    @Test
    public void testDialectQuotesAndTypeMapping() {
        Assert.assertEquals("`user`", StatDatasourceHelper.quoteIdentifier("MYSQL", "user"));
        Assert.assertEquals("\"user\"", StatDatasourceHelper.quoteIdentifier("POSTGRESQL", "user"));
        Assert.assertEquals("[user]", StatDatasourceHelper.quoteIdentifier("SQLSERVER", "user"));

        Assert.assertEquals("VARCHAR(255)", StatDatasourceHelper.mapColumnTypeToDialect("MYSQL", "VARCHAR"));
        Assert.assertEquals("VARCHAR2(255)", StatDatasourceHelper.mapColumnTypeToDialect("ORACLE", "VARCHAR"));
        Assert.assertEquals("NUMERIC(18, 4)", StatDatasourceHelper.mapColumnTypeToDialect("POSTGRESQL", "DECIMAL"));
        Assert.assertEquals("BIGINT", StatDatasourceHelper.mapColumnTypeToDialect("MYSQL", "INT"));
    }
}
