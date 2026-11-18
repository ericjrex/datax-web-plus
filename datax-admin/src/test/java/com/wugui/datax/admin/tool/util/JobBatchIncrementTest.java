package com.wugui.datax.admin.tool.util;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.parser.Feature;
import com.wugui.datatx.core.enums.IncrementTypeEnum;
import com.wugui.datax.admin.dto.BatchInitSyncDto;
import com.wugui.datax.admin.dto.BatchSetIncrementDto;
import com.wugui.datax.admin.entity.JobInfo;
import com.wugui.datax.admin.util.AESUtil;
import com.wugui.datax.admin.util.DateFormatUtils;
import com.wugui.datax.admin.util.JSONUtils;
import org.apache.commons.lang3.StringUtils;
import org.junit.Assert;
import org.junit.Test;

import java.util.Arrays;
import java.util.Date;
import java.util.regex.Pattern;

/**
 * 方案1（时间自增）批量增量同步配置与安全性单元测试
 *
 * @author ypc
 */
public class JobBatchIncrementTest {

    private static final Pattern SAFE_COLUMN_PATTERN = Pattern.compile("^[a-zA-Z0-9_`\\[\\]\"]+$");

    /**
     * 模拟公共注入方法逻辑进行脱机单元测试
     */
    private String simulateApplyTimeIncrement(JobInfo jobInfo, String rawJobJson, String timeColumn, Date incStartTime, String writeMode) {
        String cleanCol = StringUtils.isNotBlank(timeColumn) ? timeColumn.trim() : "update_time";
        if (!SAFE_COLUMN_PATTERN.matcher(cleanCol).matches()) {
            throw new IllegalArgumentException("增量时间字段名包含非法字符: " + cleanCol);
        }

        String mode = StringUtils.isNotBlank(writeMode) ? writeMode.trim().toLowerCase() : "replace";
        String modifiedJson = rawJobJson;
        try {
            if (StringUtils.isNotBlank(rawJobJson)) {
                JSONObject root = JSON.parseObject(rawJobJson, Feature.OrderedField);
                if (root != null && root.containsKey("job")) {
                    JSONObject job = root.getJSONObject("job");
                    if (job != null && job.containsKey("content")) {
                        JSONArray contents = job.getJSONArray("content");
                        if (contents != null) {
                            for (int i = 0; i < contents.size(); i++) {
                                JSONObject item = contents.getJSONObject(i);
                                if (item == null) continue;

                                JSONObject reader = item.getJSONObject("reader");
                                if (reader != null && reader.containsKey("parameter")) {
                                    JSONObject rParam = reader.getJSONObject("parameter");
                                    if (rParam != null) {
                                        String readerName = reader.getString("name");
                                        String whereCondition;
                                        if (StringUtils.isBlank(readerName) || "mysqlreader".equalsIgnoreCase(readerName)) {
                                            whereCondition = cleanCol + " >= FROM_UNIXTIME(${lastTime}) AND " + cleanCol + " < FROM_UNIXTIME(${currentTime})";
                                        } else {
                                            whereCondition = cleanCol + " >= REPLACE(${lastTime}, '%', ' ') AND " + cleanCol + " < REPLACE(${currentTime}, '%', ' ')";
                                        }
                                        rParam.put("where", whereCondition);
                                    }
                                }

                                JSONObject writer = item.getJSONObject("writer");
                                if (writer != null && writer.containsKey("parameter")) {
                                    JSONObject wParam = writer.getJSONObject("parameter");
                                    if (wParam != null) {
                                        wParam.put("writeMode", mode);
                                        if (wParam.containsKey("preSql")) {
                                            Object preSqlObj = wParam.get("preSql");
                                            if (preSqlObj instanceof JSONArray) {
                                                JSONArray preSqlArr = (JSONArray) preSqlObj;
                                                JSONArray filtered = new JSONArray();
                                                for (int j = 0; j < preSqlArr.size(); j++) {
                                                    String sql = preSqlArr.getString(j);
                                                    if (sql != null && !sql.toUpperCase().contains("TRUNCATE")) {
                                                        filtered.add(sql);
                                                    }
                                                }
                                                wParam.put("preSql", filtered);
                                            }
                                        }
                                    }
                                }
                            }
                            modifiedJson = JSON.toJSONString(root);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Assert.fail("注入异常: " + e.getMessage());
        }

        jobInfo.setIncrementType(IncrementTypeEnum.TIME.getCode());
        jobInfo.setIncStartTime(incStartTime != null ? incStartTime : new Date());
        jobInfo.setReplaceParam("-DlastTime='%s' -DcurrentTime='%s'");
        jobInfo.setReplaceParamType(DateFormatUtils.TIMESTAMP);

        return JSONUtils.encryptJobJson(modifiedJson);
    }

    @Test
    public void testScheme1IncrementInjectionAndSafety() {
        String testJson = "{\n" +
                "  \"job\": {\n" +
                "    \"content\": [\n" +
                "      {\n" +
                "        \"reader\": {\n" +
                "          \"name\": \"mysqlreader\",\n" +
                "          \"parameter\": {\n" +
                "            \"username\": \"root\",\n" +
                "            \"password\": \"123456\",\n" +
                "            \"connection\": [{\"jdbcUrl\": [\"jdbc:mysql://localhost:3306/db\"], \"table\": [\"t_order\"]}]\n" +
                "          }\n" +
                "        },\n" +
                "        \"writer\": {\n" +
                "          \"name\": \"mysqlwriter\",\n" +
                "          \"parameter\": {\n" +
                "            \"username\": \"root\",\n" +
                "            \"password\": \"123456\",\n" +
                "            \"preSql\": [\"TRUNCATE TABLE t_order\", \"SELECT 1\"],\n" +
                "            \"connection\": [{\"jdbcUrl\": \"jdbc:mysql://localhost:3306/db_dest\", \"table\": [\"t_order\"]}]\n" +
                "          }\n" +
                "        }\n" +
                "      }\n" +
                "    ]\n" +
                "  }\n" +
                "}";

        JobInfo jobInfo = new JobInfo();
        Date startTime = new Date();
        String encJson = simulateApplyTimeIncrement(jobInfo, testJson, "modify_time", startTime, "replace");

        // 1. 验证实体字段配置
        Assert.assertEquals(Integer.valueOf(2), Integer.valueOf(jobInfo.getIncrementType()));
        Assert.assertEquals("-DlastTime='%s' -DcurrentTime='%s'", jobInfo.getReplaceParam());
        Assert.assertEquals(DateFormatUtils.TIMESTAMP, jobInfo.getReplaceParamType());
        Assert.assertNotNull(jobInfo.getIncStartTime());

        // 2. 验证凭证已被加密存储
        Assert.assertFalse(encJson.contains("\"123456\""));

        // 3. 解密后验证 JSON 结构
        String decJson = JSONUtils.decryptJobJson(encJson);
        JSONObject root = JSON.parseObject(decJson);
        JSONObject content = root.getJSONObject("job").getJSONArray("content").getJSONObject(0);

        // 验证 Reader where 条件注入（符合官方 FROM_UNIXTIME 规范）
        String where = content.getJSONObject("reader").getJSONObject("parameter").getString("where");
        Assert.assertEquals("modify_time >= FROM_UNIXTIME(${lastTime}) AND modify_time < FROM_UNIXTIME(${currentTime})", where);

        // 验证 Writer 写入模式覆盖
        String writeMode = content.getJSONObject("writer").getJSONObject("parameter").getString("writeMode");
        Assert.assertEquals("replace", writeMode);

        // 验证 TRUNCATE 危险语句已被安全清理
        JSONArray preSql = content.getJSONObject("writer").getJSONObject("parameter").getJSONArray("preSql");
        Assert.assertEquals(1, preSql.size());
        Assert.assertEquals("SELECT 1", preSql.getString(0));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testSqlInjectionProtection() {
        JobInfo jobInfo = new JobInfo();
        simulateApplyTimeIncrement(jobInfo, "{}", "update_time; DROP TABLE users;--", new Date(), "replace");
    }

    @Test
    public void testBatchSetIncrementDto() {
        BatchSetIncrementDto dto = new BatchSetIncrementDto();
        dto.setJobIds(Arrays.asList(1, 2, 3));
        dto.setTimeColumn("update_time");
        dto.setWriteMode("replace");
        dto.setIncStartTime(new Date());

        Assert.assertEquals(3, dto.getJobIds().size());
        Assert.assertEquals("update_time", dto.getTimeColumn());
        Assert.assertEquals("replace", dto.getWriteMode());
    }

    @Test
    public void testBatchInitSyncDtoAndSecurity() {
        BatchInitSyncDto dto = new BatchInitSyncDto();
        dto.setJobIds(Arrays.asList(101, 102));
        dto.setTruncateTargetTable(true);
        dto.setResetIncrement(true);
        dto.setTriggerSync(true);

        Assert.assertEquals(2, dto.getJobIds().size());
        Assert.assertTrue(dto.getTruncateTargetTable());
        Assert.assertTrue(dto.getResetIncrement());
        Assert.assertTrue(dto.getTriggerSync());

        // 验证表名安全正则拦截恶意 SQL
        Pattern pattern = Pattern.compile("^[a-zA-Z0-9_`\\[\\]\"]+$");
        Assert.assertTrue(pattern.matcher("t_student_receive_detail").matches());
        Assert.assertTrue(pattern.matcher("`t_order`").matches());
        Assert.assertFalse(pattern.matcher("t_table; DROP TABLE users;").matches());
        Assert.assertFalse(pattern.matcher("t_table -- comment").matches());
        Assert.assertFalse(pattern.matcher("t_table' OR '1'='1").matches());

        // 验证 Unix 初始时间戳（1970-01-01 00:00:00）的换算为 0
        Date epochZero = new Date(0L);
        Assert.assertEquals(0L, epochZero.getTime());
    }
}
