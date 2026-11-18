package com.wugui.datax.admin.util;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.parser.Feature;
import com.alibaba.fastjson.serializer.SerializerFeature;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;

/**
 * DataX JSON 用户名密码加解密工具类
 *
 * @author zhouhongfa@gz-yibo.com
 * @ClassName JSONUtils
 * @Version 1.0
 * @since 2019/7/31 14:54
 */
@Slf4j
public class JSONUtils {

    /**
     * decrypt 解密
     */
    public static Integer decrypt = 0;
    /**
     * encrypt 加密
     */
    public static Integer encrypt = 1;

    /**
     * 对 DataX 作业配置 JSON 中 reader 与 writer 的数据库用户名和密码进行 AES 加密
     * 若已是合法密文则直接保留原密文，无需再加密（彻底杜绝复制或重复保存时的二次嵌套加密）
     *
     * @param jsonStr DataX 配置 JSON 字符串
     * @return 加密后的 JSON 文本（保持原有的键名顺序及优美格式）
     */
    public static String encryptJobJson(String jsonStr) {
        return processJobJsonCredentials(jsonStr, true);
    }

    /**
     * 对 DataX 作业配置 JSON 中 reader 与 writer 的数据库用户名和密码进行 AES 解密为纯明文
     * 供任务调度触发时使用，确保 DataX 进程能够正常认证并连接数据库
     *
     * @param jsonStr DataX 配置 JSON 字符串
     * @return 解密后的 JSON 文本（包含纯明文账密）
     */
    public static String decryptJobJson(String jsonStr) {
        return processJobJsonCredentials(jsonStr, false);
    }

    /**
     * 统一安全处理 Job JSON 凭证的公共方法
     *
     * @param jsonStr 原始配置 JSON 字符串
     * @param isEncrypt true 为加密，false 为解密
     * @return 处理后的 JSON 文本
     */
    private static String processJobJsonCredentials(String jsonStr, boolean isEncrypt) {
        if (StringUtils.isBlank(jsonStr)) {
            return jsonStr;
        }
        try {
            // 使用 Feature.OrderedField 严格保持原 JSON 键名顺序
            JSONObject root = JSON.parseObject(jsonStr, Feature.OrderedField);
            if (root == null || !root.containsKey("job")) {
                return jsonStr;
            }
            JSONObject job = root.getJSONObject("job");
            if (job == null || !job.containsKey("content")) {
                return jsonStr;
            }
            JSONArray contents = job.getJSONArray("content");
            if (contents == null || contents.isEmpty()) {
                return jsonStr;
            }

            for (int i = 0; i < contents.size(); i++) {
                JSONObject contentItem = contents.getJSONObject(i);
                if (contentItem == null) {
                    continue;
                }
                // 处理 reader
                processPluginCredential(contentItem.getJSONObject("reader"), isEncrypt);
                // 处理 writer
                processPluginCredential(contentItem.getJSONObject("writer"), isEncrypt);
            }

            return JSON.toJSONString(root, SerializerFeature.PrettyFormat);
        } catch (Exception e) {
            log.warn("处理 DataX 配置 JSON 账密{}异常，保持原 JSON: {}", isEncrypt ? "加密" : "解密", e.getMessage());
            return jsonStr;
        }
    }

    /**
     * 处理单个 reader 或 writer 插件 parameter 中的账密凭证
     *
     * @param pluginObj reader 或 writer 的 JSON 对象
     * @param isEncrypt true 为加密，false 为解密
     */
    private static void processPluginCredential(JSONObject pluginObj, boolean isEncrypt) {
        if (pluginObj == null || !pluginObj.containsKey("parameter")) {
            return;
        }
        JSONObject parameter = pluginObj.getJSONObject("parameter");
        if (parameter == null) {
            return;
        }

        // 1. 处理标准关系型数据库命名：username 与 password
        processField(parameter, "username", isEncrypt);
        processField(parameter, "password", isEncrypt);

        // 2. 兼容 MongoDB 等特定插件命名：userName 与 userPassword
        processField(parameter, "userName", isEncrypt);
        processField(parameter, "userPassword", isEncrypt);
    }

    /**
     * 处理 parameter 中具体字段值的加解密转换
     *
     * @param parameter 参数对象
     * @param fieldName 属性名
     * @param isEncrypt true 为加密，false 为解密
     */
    private static void processField(JSONObject parameter, String fieldName, boolean isEncrypt) {
        if (parameter.containsKey(fieldName)) {
            String val = parameter.getString(fieldName);
            if (StringUtils.isNotBlank(val)) {
                if (isEncrypt) {
                    // 若已是合法密文，encryptIfNot 会直接复用原密文，杜绝二次加密
                    parameter.put(fieldName, AESUtil.encryptIfNot(val));
                } else {
                    parameter.put(fieldName, AESUtil.decrypt(val));
                }
            }
        }
    }

    /**
     * @param content
     * @param key
     * @param changeType 0解密 or 1加密
     * @return
     */
    public static JSONObject change(String content, String key, Integer changeType) {
        if (StringUtils.isBlank(content)) {
            return new JSONObject();
        }
        try {
            JSONObject contentObj = JSONObject.parseObject(content);
            if (contentObj == null || !contentObj.containsKey(key)) {
                return contentObj;
            }
            JSONObject keyObj = contentObj.getJSONObject(key);
            if (keyObj == null) {
                return null;
            }
            processPluginCredential(keyObj, encrypt.equals(changeType));
            return keyObj;
        } catch (Exception e) {
            log.warn("change 解析异常: {}", e.getMessage());
            return new JSONObject();
        }
    }

    /**
     * 兼容历史旧方法调用
     *
     * @param jsonStr DataX 配置 JSON
     * @param changeType 0 为解密，1 为加密
     * @return 转换后的 JSON 文本
     */
    public static String changeJson(String jsonStr, Integer changeType) {
        if (encrypt.equals(changeType)) {
            return encryptJobJson(jsonStr);
        } else {
            return decryptJobJson(jsonStr);
        }
    }
}

