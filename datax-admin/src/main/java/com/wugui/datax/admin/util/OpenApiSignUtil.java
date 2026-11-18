package com.wugui.datax.admin.util;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

/**
 * 外部开放 API 签名验签与防重放工具类
 *
 * @author ypc
 * @since 2026-10-28
 */
public final class OpenApiSignUtil {

    private static final Logger logger = LoggerFactory.getLogger(OpenApiSignUtil.class);

    private static final String HMAC_SHA256_ALGORITHM = "HmacSHA256";

    /**
     * 允许的时间戳误差范围（秒），默认 5 分钟 (300 秒)
     */
    public static final long MAX_TIMESTAMP_DIFF_SECONDS = 300;

    /**
     * Nonce 防重放防篡改本地缓存（5分钟滑动过期，防止重复利用同一请求）
     */
    private static final Cache<String, Boolean> NONCE_CACHE = CacheBuilder.newBuilder()
            .maximumSize(50000)
            .expireAfterWrite(MAX_TIMESTAMP_DIFF_SECONDS, TimeUnit.SECONDS)
            .build();

    private OpenApiSignUtil() {
    }

    /**
     * 计算 HMAC-SHA256 签名 (Base64 输出)
     *
     * @param method HTTP 方法 (大写，如 GET, POST)
     * @param url 请求路径 URI (以 / 开头，不包含协议、域名和参数)
     * @param accessKey 身份标识
     * @param timestamp 时间戳 (秒)
     * @param nonce 唯一随机串
     * @param secret 密钥
     * @return 签名字符串 (Base64)
     */
    public static String calculateSignature(String method, String url, String accessKey, long timestamp, String nonce, String secret) {
        try {
            String upperMethod = method != null ? method.toUpperCase().trim() : "";
            String cleanUrl = url != null ? url.trim() : "";
            if (cleanUrl.contains("?")) {
                cleanUrl = cleanUrl.substring(0, cleanUrl.indexOf("?"));
            }
            // 规范拼接：method & url & accessKey & timestamp & nonce
            String rawString = upperMethod + "&" + cleanUrl + "&" + accessKey + "&" + timestamp + "&" + nonce;

            Mac mac = Mac.getInstance(HMAC_SHA256_ALGORITHM);
            SecretKeySpec secretKey = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256_ALGORITHM);
            mac.init(secretKey);
            byte[] hmacBytes = mac.doFinal(rawString.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hmacBytes);
        } catch (Exception e) {
            logger.error("[OpenApiSignUtil] 签名计算异常: {}", e.getMessage(), e);
            throw new RuntimeException("签名计算失败: " + e.getMessage(), e);
        }
    }

    /**
     * 校验请求时间戳有效性 (防止时钟漂移过大与过期重放)
     *
     * @param timestamp 请求中的时间戳 (秒)
     * @return true-有效，false-已过期或未来时间过大
     */
    public static boolean verifyTimestamp(long timestamp) {
        long currentSeconds = System.currentTimeMillis() / 1000;
        long diff = Math.abs(currentSeconds - timestamp);
        return diff <= MAX_TIMESTAMP_DIFF_SECONDS;
    }

    /**
     * 校验 Nonce 是否已被使用 (防重放)
     *
     * @param accessKey 身份标识
     * @param nonce 随机数
     * @return true-首次使用合法，false-已使用过的重复请求
     */
    public static boolean verifyAndRecordNonce(String accessKey, String nonce) {
        if (StringUtils.isBlank(accessKey) || StringUtils.isBlank(nonce)) {
            return false;
        }
        String key = accessKey.trim() + "_" + nonce.trim();
        synchronized (NONCE_CACHE) {
            if (NONCE_CACHE.getIfPresent(key) != null) {
                return false;
            }
            NONCE_CACHE.put(key, Boolean.TRUE);
            return true;
        }
    }

    /**
     * 常量时间安全比对两个签名 (防时序侧信道攻击 Timing Attack)
     */
    public static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
