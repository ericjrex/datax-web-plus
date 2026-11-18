package com.wugui.datax.admin.util;

import com.wugui.datax.admin.core.conf.JobAdminConfig;
import org.apache.commons.lang3.StringUtils;
import lombok.extern.slf4j.Slf4j;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

@Slf4j
public class AESUtil {

    private static String DEFAULT_CIPHER_ALGORITHM = "SHA1PRNG";
    private static String KEY_ALGORITHM = "AES";

    /**
     * 加密
     *
     * @param key
     * @param messBytes
     * @return
     */
    private static byte[] encrypt(Key key, byte[] messBytes) throws Exception {
        if (key != null) {

            Cipher cipher = Cipher.getInstance(KEY_ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            return cipher.doFinal(messBytes);
        }
        return null;
    }

    /**
     * AES（256）解密
     *
     * @param key
     * @param cipherBytes
     * @return
     */
    private static byte[] decrypt(Key key, byte[] cipherBytes) throws Exception {
        if (key != null) {

            Cipher cipher = Cipher.getInstance(KEY_ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, key);
            return cipher.doFinal(cipherBytes);
        }
        return null;
    }


    /**
     * 生成加密秘钥
     *
     * @return
     * @throws NoSuchAlgorithmException
     */
    private static KeyGenerator getKeyGenerator() {

        String key = null;
        try {
            if (JobAdminConfig.getAdminConfig() != null) {
                key = JobAdminConfig.getAdminConfig().getDataSourceAESKey();
            }
        } catch (Exception e) {
            // ignore
        }
        if (StringUtils.isBlank(key)) {
            key = "AD42F6697B035B75";
        }

        KeyGenerator keygen = null;
        try {
            keygen = KeyGenerator.getInstance(KEY_ALGORITHM);
            SecureRandom secureRandom = SecureRandom.getInstance(DEFAULT_CIPHER_ALGORITHM);
            secureRandom.setSeed(key.getBytes());
            keygen.init(128, secureRandom);
        } catch (NoSuchAlgorithmException e) {
            log.warn("Get key generator error {}", e.getMessage());
        }

        return keygen;
    }

    public static String encrypt(String message) {
        if (message == null || message.trim().isEmpty()) {
            return message;
        }
        try {
            // 先通过 decrypt 提取最内核纯明文，杜绝把已有密文再次加密成多重密文
            String plain = decrypt(message);
            String target = plain != null ? plain : message;
            KeyGenerator keygen = getKeyGenerator();
            SecretKey secretKey = new SecretKeySpec(keygen.generateKey().getEncoded(), KEY_ALGORITHM);
            return Base64.getEncoder().encodeToString(encrypt(secretKey, target.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            log.warn("content encrypt error {}", e.getMessage());
        }
        return null;
    }

    public static String decrypt(String ciphertext) {
        if (ciphertext == null || ciphertext.trim().isEmpty()) {
            return ciphertext;
        }
        try {
            KeyGenerator keygen = getKeyGenerator();
            SecretKey secretKey = new SecretKeySpec(keygen.generateKey().getEncoded(), KEY_ALGORITHM);
            String current = ciphertext;

            while (true) {
                try {
                    byte[] decodedBytes = Base64.getDecoder().decode(current);
                    byte[] decryptedBytes = decrypt(secretKey, decodedBytes);
                    if (decryptedBytes != null && decryptedBytes.length > 0) {
                        String decryptedStr = new String(decryptedBytes, StandardCharsets.UTF_8);
                        if (decryptedStr.equals(current)) {
                            break;
                        }
                        current = decryptedStr;
                    } else {
                        break;
                    }
                } catch (Exception ex) {
                    // 解密异常说明 current 已经到达最内层纯明文
                    break;
                }
            }
            return current;
        } catch (Exception e) {
            log.warn("content decrypt error {}", e.getMessage());
        }
        return ciphertext;
    }

    /**
     * 判断给定文本是否为有效的 AES 密文且解密后内容不同于原密文
     *
     * @param text 待检测文本
     * @return true 如果是有效 AES 密文；false 否则
     */
    public static boolean isEncrypted(String text) {
        if (StringUtils.isBlank(text)) {
            return false;
        }
        String trimmed = text.trim();
        // AES 最小分组为 16 字节，Base64 编码后最小长度为 24 字符
        if (trimmed.length() < 24) {
            return false;
        }
        try {
            byte[] decodedBytes = Base64.getDecoder().decode(trimmed);
            if (decodedBytes == null || decodedBytes.length % 16 != 0) {
                return false;
            }
            KeyGenerator keygen = getKeyGenerator();
            if (keygen == null) {
                return false;
            }
            SecretKey secretKey = new SecretKeySpec(keygen.generateKey().getEncoded(), KEY_ALGORITHM);
            byte[] decryptedBytes = decrypt(secretKey, decodedBytes);
            if (decryptedBytes != null && decryptedBytes.length > 0) {
                String plain = new String(decryptedBytes, StandardCharsets.UTF_8);
                return !trimmed.equals(plain);
            }
        } catch (Exception e) {
            return false;
        }
        return false;
    }

    /**
     * 若已是有效密文则直接返回原密文（无需再加密），若为明文则进行 AES 加密
     *
     * @param message 待处理明文或密文
     * @return 加密后的密文，或保持原有合法密文
     */
    public static String encryptIfNot(String message) {
        if (StringUtils.isBlank(message)) {
            return message;
        }
        if (isEncrypted(message)) {
            return message.trim();
        }
        return encrypt(message);
    }

    public static void main(String[] args) {
        String message = "root";
        String ciphertext = encrypt(message);

        System.out.println("加密后密文为: " + ciphertext);
        System.out.println("解密后明文为:" + decrypt(ciphertext));
    }

}