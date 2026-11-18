package com.wugui.datax.admin.tool.api;

import com.wugui.datax.admin.dto.ApiTestRunDto;
import com.wugui.datax.admin.dto.ApiTestRunResultDto;
import org.junit.Assert;
import org.junit.Test;

/**
 * 接口数据采集与提取引擎单元测试
 *
 * @author ypc
 */
public class HttpApiExtractEngineTest {

    @Test
    public void testSsrfSecurityDefense() {
        HttpApiExtractEngine.setAllowLocalAddress(false);
        try {
            // 1. 验证拦截 localhost 回环地址
            try {
                HttpApiExtractEngine.validateSsrfSecurity("http://localhost:8080/actuator");
                Assert.fail("未能成功拦截 localhost 环回地址请求");
            } catch (SecurityException e) {
                Assert.assertTrue(e.getMessage().contains("SSRF 拦截") || e.getMessage().contains("localhost"));
            }

            // 2. 验证拦截 127.0.0.1 回环地址
            try {
                HttpApiExtractEngine.validateSsrfSecurity("http://127.0.0.1:9090/metrics");
                Assert.fail("未能成功拦截 127.0.0.1 环回地址请求");
            } catch (SecurityException e) {
                Assert.assertTrue(e.getMessage().contains("SSRF 拦截") || e.getMessage().contains("127.0.0.1"));
            }

            // 3. 验证拦截危险协议 (file://)
            try {
                HttpApiExtractEngine.validateSsrfSecurity("file:///etc/passwd");
                Assert.fail("未能拦截非法 file 协议");
            } catch (SecurityException e) {
                Assert.assertTrue(e.getMessage().contains("仅支持 HTTP/HTTPS"));
            }
        } finally {
            HttpApiExtractEngine.setAllowLocalAddress(true);
        }
    }

    @Test
    public void testDebugSampleWithInvalidUrl() {
        HttpApiExtractEngine.setAllowLocalAddress(false);
        try {
            ApiTestRunDto dto = new ApiTestRunDto();
            dto.setRequestUrl("http://127.0.0.1:8080/api/users");
            ApiTestRunResultDto result = HttpApiExtractEngine.debugSample(dto);

            Assert.assertNotNull(result);
            Assert.assertFalse(result.getSuccess());
            Assert.assertTrue(result.getMessage().contains("安全拦截") || result.getMessage().contains("SSRF"));
        } finally {
            HttpApiExtractEngine.setAllowLocalAddress(true);
        }
    }

    @Test
    public void testParseDateSafely() {
        // 1. 标准时间字符串
        java.util.Date d1 = HttpApiExtractEngine.parseDateSafely("2026-09-14 23:59:59");
        Assert.assertNotNull(d1);
        Assert.assertEquals("2026-09-14 23:59:59", cn.hutool.core.date.DateUtil.format(d1, "yyyy-MM-dd HH:mm:ss"));

        // 2. 秒级时间戳 (10位)
        java.util.Date d2 = HttpApiExtractEngine.parseDateSafely(1753974530L);
        Assert.assertNotNull(d2);
        Assert.assertEquals(1753974530000L, d2.getTime());

        // 3. 毫秒级时间戳 (13位)
        java.util.Date d3 = HttpApiExtractEngine.parseDateSafely("1753974530000");
        Assert.assertNotNull(d3);
        Assert.assertEquals(1753974530000L, d3.getTime());

        // 4. ISO-8601 格式
        java.util.Date d4 = HttpApiExtractEngine.parseDateSafely("2026-05-08T00:05:51.000Z");
        Assert.assertNotNull(d4);

        // 5. 纯年月日格式
        java.util.Date d5 = HttpApiExtractEngine.parseDateSafely("2026-09-14");
        Assert.assertNotNull(d5);

        // 6. 空与非法输入容错
        Assert.assertNull(HttpApiExtractEngine.parseDateSafely(null));
        Assert.assertNull(HttpApiExtractEngine.parseDateSafely(""));
        Assert.assertNull(HttpApiExtractEngine.parseDateSafely("invalid_date"));
    }

    @Test
    public void testGetFieldValueCaseInsensitive() {
        java.util.Map<String, Object> row = new java.util.HashMap<>();
        row.put("update_time", "2026-09-14 18:00:00");
        row.put("loginDate", "2026-09-14 19:30:00");

        // 1. 驼峰查下划线
        Object val1 = HttpApiExtractEngine.getFieldValueCaseInsensitive(row, "updateTime");
        Assert.assertEquals("2026-09-14 18:00:00", val1);

        // 2. 下划线查驼峰
        Object val2 = HttpApiExtractEngine.getFieldValueCaseInsensitive(row, "login_date");
        Assert.assertEquals("2026-09-14 19:30:00", val2);

        // 3. 忽略大小写
        Object val3 = HttpApiExtractEngine.getFieldValueCaseInsensitive(row, "UPDATETIME");
        Assert.assertEquals("2026-09-14 18:00:00", val3);

        // 4. 不存在的字段
        Assert.assertNull(HttpApiExtractEngine.getFieldValueCaseInsensitive(row, "non_existent"));
    }

    @Test
    public void testMaxRecordTimeCalculation() {
        // 模拟接口乱序返回的多行数据
        java.util.List<java.util.Map<String, Object>> rows = new java.util.ArrayList<>();
        java.util.Map<String, Object> r1 = new java.util.HashMap<>();
        r1.put("updateTime", "2026-09-14 10:00:00");
        java.util.Map<String, Object> r2 = new java.util.HashMap<>();
        r2.put("updateTime", "2026-09-14 23:59:59"); // 最大时间
        java.util.Map<String, Object> r3 = new java.util.HashMap<>();
        r3.put("updateTime", "2026-09-14 18:30:00"); // 较旧时间，故意乱序排在最后

        rows.add(r1);
        rows.add(r2);
        rows.add(r3);

        java.util.Date maxDate = null;
        for (java.util.Map<String, Object> row : rows) {
            Object val = HttpApiExtractEngine.getFieldValueCaseInsensitive(row, "update_time");
            java.util.Date d = HttpApiExtractEngine.parseDateSafely(val);
            if (d != null && (maxDate == null || d.after(maxDate))) {
                maxDate = d;
            }
        }

        Assert.assertNotNull(maxDate);
        Assert.assertEquals("2026-09-14 23:59:59", cn.hutool.core.date.DateUtil.format(maxDate, "yyyy-MM-dd HH:mm:ss"));
    }

    @Test
    public void testReplaceDriverPlaceholdersRowMode() {
        java.util.List<java.util.Map<String, Object>> chunk = new java.util.ArrayList<>();
        java.util.Map<String, Object> row = new java.util.LinkedHashMap<>();
        row.put("veh_num", "粤B12345");
        row.put("org_name", "深港集团");
        chunk.add(row);

        String template = "http://api.example.com/alarm?vehNum=${driver.veh_num}&org=${driver.org_name}&code=${driver.vehNum}";
        String rendered = HttpApiExtractEngine.replaceDriverPlaceholders(template, chunk, "ROW");

        Assert.assertEquals("http://api.example.com/alarm?vehNum=粤B12345&org=深港集团&code=粤B12345", rendered);
    }

    @Test
    public void testReplaceDriverPlaceholdersBatchMode() {
        java.util.List<java.util.Map<String, Object>> chunk = new java.util.ArrayList<>();
        java.util.Map<String, Object> r1 = new java.util.LinkedHashMap<>();
        r1.put("veh_num", "粤B11111");
        java.util.Map<String, Object> r2 = new java.util.LinkedHashMap<>();
        r2.put("veh_num", "粤B22222");
        chunk.add(r1);
        chunk.add(r2);

        // 1. 测试逗号拼接
        String urlTpl = "http://api.example.com/alarm?vehNums=${driver.veh_num}";
        String renderedUrl = HttpApiExtractEngine.replaceDriverPlaceholders(urlTpl, chunk, "BATCH");
        Assert.assertEquals("http://api.example.com/alarm?vehNums=粤B11111,粤B22222", renderedUrl);

        // 2. 测试 JSON 数组拼接
        String bodyTpl = "{\"vehList\":${driver.veh_num_json}}";
        String renderedBody = HttpApiExtractEngine.replaceDriverPlaceholders(bodyTpl, chunk, "BATCH");
        Assert.assertEquals("{\"vehList\":[\"粤B11111\",\"粤B22222\"]}", renderedBody);

        // 3. 测试 SQL IN 列表拼接
        String sqlTpl = "SELECT * FROM tb WHERE num IN (${driver.veh_num_sql})";
        String renderedSql = HttpApiExtractEngine.replaceDriverPlaceholders(sqlTpl, chunk, "BATCH");
        Assert.assertEquals("SELECT * FROM tb WHERE num IN ('粤B11111','粤B22222')", renderedSql);
    }
}
