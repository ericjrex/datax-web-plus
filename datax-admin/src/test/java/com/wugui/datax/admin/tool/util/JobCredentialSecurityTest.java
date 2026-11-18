package com.wugui.datax.admin.tool.util;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.wugui.datax.admin.util.AESUtil;
import com.wugui.datax.admin.util.JSONUtils;
import org.junit.Assert;
import org.junit.Test;

/**
 * 任务凭证加密与复制防二次加密安全单元测试
 *
 * @author ypc
 */
public class JobCredentialSecurityTest {

    private static final String MOCK_PLAIN_USER = "db_admin";
    private static final String MOCK_PLAIN_PASS = "Pass_2026!#$";

    /**
     * 构建标准 DataX 测试配置 JSON
     */
    private String buildMockJobJson(String rUser, String rPass, String wUser, String wPass) {
        return "{\n" +
                "  \"job\": {\n" +
                "    \"setting\": {\n" +
                "      \"speed\": { \"channel\": 3 }\n" +
                "    },\n" +
                "    \"content\": [\n" +
                "      {\n" +
                "        \"reader\": {\n" +
                "          \"name\": \"mysqlreader\",\n" +
                "          \"parameter\": {\n" +
                "            \"username\": \"" + rUser + "\",\n" +
                "            \"password\": \"" + rPass + "\",\n" +
                "            \"connection\": [{ \"jdbcUrl\": [\"jdbc:mysql://localhost:3306/db_src\"], \"table\": [\"t_user\"] }]\n" +
                "          }\n" +
                "        },\n" +
                "        \"writer\": {\n" +
                "          \"name\": \"mysqlwriter\",\n" +
                "          \"parameter\": {\n" +
                "            \"username\": \"" + wUser + "\",\n" +
                "            \"password\": \"" + wPass + "\",\n" +
                "            \"connection\": [{ \"jdbcUrl\": \"jdbc:mysql://localhost:3306/db_dest\", \"table\": [\"t_user\"] }]\n" +
                "          }\n" +
                "        }\n" +
                "      }\n" +
                "    ]\n" +
                "  }\n" +
                "}";
    }

    @Test
    public void testIsEncryptedAndEncryptIfNot() {
        // 1. 明文检测
        Assert.assertFalse(AESUtil.isEncrypted(MOCK_PLAIN_USER));
        Assert.assertFalse(AESUtil.isEncrypted(MOCK_PLAIN_PASS));
        Assert.assertFalse(AESUtil.isEncrypted(""));
        Assert.assertFalse(AESUtil.isEncrypted(null));

        // 2. 首次加密
        String cipherUser = AESUtil.encryptIfNot(MOCK_PLAIN_USER);
        String cipherPass = AESUtil.encryptIfNot(MOCK_PLAIN_PASS);
        Assert.assertNotNull(cipherUser);
        Assert.assertNotNull(cipherPass);
        Assert.assertNotEquals(MOCK_PLAIN_USER, cipherUser);
        Assert.assertNotEquals(MOCK_PLAIN_PASS, cipherPass);

        // 3. 密文检测
        Assert.assertTrue(AESUtil.isEncrypted(cipherUser));
        Assert.assertTrue(AESUtil.isEncrypted(cipherPass));

        // 4. 复制场景：对已加密的密文再次执行 encryptIfNot，必须直接复用原密文，无需再加密
        String reEncryptedUser = AESUtil.encryptIfNot(cipherUser);
        String reEncryptedPass = AESUtil.encryptIfNot(cipherPass);
        Assert.assertEquals(cipherUser, reEncryptedUser);
        Assert.assertEquals(cipherPass, reEncryptedPass);

        // 5. 解密验证
        Assert.assertEquals(MOCK_PLAIN_USER, AESUtil.decrypt(cipherUser));
        Assert.assertEquals(MOCK_PLAIN_PASS, AESUtil.decrypt(cipherPass));
    }

    @Test
    public void testJobJsonEncryptionAndNoReEncryption() {
        String originalJson = buildMockJobJson(MOCK_PLAIN_USER, MOCK_PLAIN_PASS, MOCK_PLAIN_USER, MOCK_PLAIN_PASS);

        // 步骤 1：任务保存，触发初次加密
        String encryptedJson = JSONUtils.encryptJobJson(originalJson);
        Assert.assertNotNull(encryptedJson);

        JSONObject root1 = JSON.parseObject(encryptedJson);
        JSONObject readerParam1 = root1.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("reader").getJSONObject("parameter");
        JSONObject writerParam1 = root1.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("writer").getJSONObject("parameter");

        String encryptedRUser = readerParam1.getString("username");
        String encryptedRPass = readerParam1.getString("password");
        String encryptedWUser = writerParam1.getString("username");
        String encryptedWPass = writerParam1.getString("password");

        Assert.assertTrue(AESUtil.isEncrypted(encryptedRUser));
        Assert.assertTrue(AESUtil.isEncrypted(encryptedRPass));
        Assert.assertTrue(AESUtil.isEncrypted(encryptedWUser));
        Assert.assertTrue(AESUtil.isEncrypted(encryptedWPass));

        // 步骤 2：任务复制，复制出来直接保存（无需再加密，密文保持绝对不变）
        String copiedAndSavedJson = JSONUtils.encryptJobJson(encryptedJson);
        JSONObject root2 = JSON.parseObject(copiedAndSavedJson);
        JSONObject readerParam2 = root2.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("reader").getJSONObject("parameter");
        JSONObject writerParam2 = root2.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("writer").getJSONObject("parameter");

        Assert.assertEquals(encryptedRUser, readerParam2.getString("username"));
        Assert.assertEquals(encryptedRPass, readerParam2.getString("password"));
        Assert.assertEquals(encryptedWUser, writerParam2.getString("username"));
        Assert.assertEquals(encryptedWPass, writerParam2.getString("password"));

        // 步骤 3：任务调度触发执行时，解密为纯明文供 DataX 连接数据库
        String decryptedJson = JSONUtils.decryptJobJson(copiedAndSavedJson);
        JSONObject root3 = JSON.parseObject(decryptedJson);
        JSONObject readerParam3 = root3.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("reader").getJSONObject("parameter");
        JSONObject writerParam3 = root3.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("writer").getJSONObject("parameter");

        Assert.assertEquals(MOCK_PLAIN_USER, readerParam3.getString("username"));
        Assert.assertEquals(MOCK_PLAIN_PASS, readerParam3.getString("password"));
        Assert.assertEquals(MOCK_PLAIN_USER, writerParam3.getString("username"));
        Assert.assertEquals(MOCK_PLAIN_PASS, writerParam3.getString("password"));
    }

    @Test
    public void testMongoDBFieldCompatibility() {
        String mongoJson = "{\n" +
                "  \"job\": {\n" +
                "    \"content\": [\n" +
                "      {\n" +
                "        \"reader\": {\n" +
                "          \"name\": \"mongodbreader\",\n" +
                "          \"parameter\": {\n" +
                "            \"userName\": \"mongo_user\",\n" +
                "            \"userPassword\": \"mongo_pwd\"\n" +
                "          }\n" +
                "        }\n" +
                "      }\n" +
                "    ]\n" +
                "  }\n" +
                "}";

        String encrypted = JSONUtils.encryptJobJson(mongoJson);
        JSONObject root = JSON.parseObject(encrypted);
        JSONObject param = root.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("reader").getJSONObject("parameter");
        Assert.assertTrue(AESUtil.isEncrypted(param.getString("userName")));
        Assert.assertTrue(AESUtil.isEncrypted(param.getString("userPassword")));

        // 再次加密无需再加密
        String reEncrypted = JSONUtils.encryptJobJson(encrypted);
        JSONObject rootRe = JSON.parseObject(reEncrypted);
        JSONObject paramRe = rootRe.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("reader").getJSONObject("parameter");
        Assert.assertEquals(param.getString("userName"), paramRe.getString("userName"));
        Assert.assertEquals(param.getString("userPassword"), paramRe.getString("userPassword"));

        // 解密还原
        String decrypted = JSONUtils.decryptJobJson(encrypted);
        JSONObject rootDec = JSON.parseObject(decrypted);
        JSONObject paramDec = rootDec.getJSONObject("job").getJSONArray("content").getJSONObject(0).getJSONObject("reader").getJSONObject("parameter");
        Assert.assertEquals("mongo_user", paramDec.getString("userName"));
        Assert.assertEquals("mongo_pwd", paramDec.getString("userPassword"));
    }

    @Test
    public void testBoundaryAndEmptyCases() {
        Assert.assertNull(JSONUtils.encryptJobJson(null));
        Assert.assertEquals("", JSONUtils.encryptJobJson(""));
        Assert.assertEquals("   ", JSONUtils.encryptJobJson("   "));
        Assert.assertEquals("{ invalid json }", JSONUtils.encryptJobJson("{ invalid json }"));
        Assert.assertEquals("{}", JSONUtils.encryptJobJson("{}"));
    }
}
