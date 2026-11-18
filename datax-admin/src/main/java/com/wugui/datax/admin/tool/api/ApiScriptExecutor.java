package com.wugui.datax.admin.tool.api;

import jdk.nashorn.api.scripting.ClassFilter;
import jdk.nashorn.api.scripting.NashornScriptEngineFactory;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.script.Bindings;
import javax.script.ScriptEngine;
import javax.script.SimpleBindings;
import java.io.StringWriter;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 接口通用前置脚本执行器 (ApiScriptExecutor)
 * 提供基于 Java 8 内置 Nashorn 引擎的安全沙箱脚本执行能力，支持在 HTTP 请求发包前动态计算签名、
 * 时间戳、随机数并修改请求头或参数 (类似于 Postman Pre-request Script 机制)。
 *
 * <p>安全提示: 前置脚本具有服务端代码执行能力，本沙箱为「尽力而为」的纵深防御而非绝对隔离边界，
 * 严禁向不可信用户开放脚本编写/测试能力，调用方必须限定为管理员或受信账号。</p>
 *
 * @author ypc
 */
public class ApiScriptExecutor {

    private static final Logger logger = LoggerFactory.getLogger(ApiScriptExecutor.class);

    /**
     * 禁用高危类名黑名单 (双重沙箱保护)
     */
    private static final String[] FORBIDDEN_KEYWORDS = new String[]{
            "java.lang.System",
            "java.lang.Runtime",
            "java.lang.ProcessBuilder",
            "java.lang.reflect",
            "java.lang.Thread",
            "java.lang.Class",
            "java.io.File",
            "java.net.Socket",
            "javax.script",
            "jdk.nashorn"
    };

    /**
     * Nashorn 引擎工厂（单例缓存）
     */
    private static final NashornScriptEngineFactory NASHORN_FACTORY = new NashornScriptEngineFactory();

    /**
     * 脚本最长执行时间 (毫秒)。脚本在独立守护线程池中执行，超过该时限强制中断，防止死循环永久挂死请求/调度线程。
     * 注意: 无限循环脚本对线程中断响应有限 (Nashorn 限制)，超时仅保证调用方不被阻塞，请务必限制脚本编写者权限。
     */
    private static final long SCRIPT_TIMEOUT_MS = 10_000L;

    /**
     * 脚本内容最大长度限制 (字符)，防止超大脚本拖垮服务
     */
    private static final int SCRIPT_MAX_LENGTH = 50_000;

    /**
     * 脚本执行线程池 (守护线程，带超时控制；采用缓存线程池，避免单个卡死脚本阻塞后续脚本执行)
     */
    private static final ExecutorService SCRIPT_EXECUTOR = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "hst-pre-script-executor");
        t.setDaemon(true);
        return t;
    });

    /**
     * 沙箱类过滤器
     */
    private static final ClassFilter SANDBOX_FILTER = new ClassFilter() {
        @Override
        public boolean exposeToScripts(String className) {
            if (StringUtils.isBlank(className)) {
                return false;
            }
            // 严格禁止访问系统级、反射、进程与文件 I/O 类
            if (className.startsWith("java.lang.System")
                    || className.startsWith("java.lang.Runtime")
                    || className.startsWith("java.lang.Process")
                    || className.startsWith("java.lang.Thread")
                    || className.startsWith("java.lang.Class")
                    || className.startsWith("java.lang.reflect.")
                    || className.startsWith("java.io.")
                    || className.startsWith("java.nio.")
                    || className.startsWith("java.net.")
                    || className.startsWith("javax.script.")
                    || className.startsWith("jdk.nashorn.")) {
                return false;
            }
            return true;
        }
    };

    /**
     * 内置密码学工具箱，暴露给 JavaScript 脚本直接调用
     */
    public static class CryptoHelper {

        /**
         * 计算 HMAC-SHA256 散列并返回 Base64 编码字符串
         */
        public String hmacSha256(String data, String secret) throws Exception {
            if (data == null || secret == null) {
                return "";
            }
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKeySpec);
            byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(raw);
        }

        /**
         * 计算 HMAC-SHA256 散列并返回小写十六进制 Hex 字符串
         */
        public String hmacSha256Hex(String data, String secret) throws Exception {
            if (data == null || secret == null) {
                return "";
            }
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKeySpec);
            byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : raw) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        }

        /**
         * 计算 MD5 散列并返回 32 位小写 Hex
         */
        public String md5(String data) throws Exception {
            if (data == null) {
                return "";
            }
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        }

        /**
         * 计算 SHA-256 散列并返回 64 位小写 Hex
         */
        public String sha256(String data) throws Exception {
            if (data == null) {
                return "";
            }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        }

        /**
         * 字符串 Base64 编码
         */
        public String base64Encode(String data) {
            if (data == null) {
                return "";
            }
            return Base64.getEncoder().encodeToString(data.getBytes(StandardCharsets.UTF_8));
        }

        /**
         * 字符串 Base64 解码
         */
        public String base64Decode(String base64Str) {
            if (base64Str == null) {
                return "";
            }
            byte[] decoded = Base64.getDecoder().decode(base64Str);
            return new String(decoded, StandardCharsets.UTF_8);
        }
    }

    /**
     * 控制台日志输出助手，支持脚本中调用 console.log / info / warn / error
     */
    public static class ConsoleHelper {
        private final List<String> logs;

        public ConsoleHelper(List<String> logs) {
            this.logs = logs;
        }

        public void log(Object msg) {
            if (msg != null) {
                logs.add(String.valueOf(msg));
            } else {
                logs.add("null");
            }
        }

        public void info(Object msg) {
            log(msg);
        }

        public void warn(Object msg) {
            logs.add("[WARN] " + String.valueOf(msg));
        }

        public void error(Object msg) {
            logs.add("[ERROR] " + String.valueOf(msg));
        }
    }

    /**
     * 脚本执行结果结构体
     */
    public static class ScriptExecutionResult {
        private boolean success;
        private String message;
        private long elapsedMs;
        private List<String> logs = new ArrayList<>();
        private Map<String, String> headers = new HashMap<>();
        private Map<String, Object> queryParams = new HashMap<>();

        public boolean isSuccess() { return success; }
        public void setSuccess(boolean success) { this.success = success; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public long getElapsedMs() { return elapsedMs; }
        public void setElapsedMs(long elapsedMs) { this.elapsedMs = elapsedMs; }
        public List<String> getLogs() { return logs; }
        public void setLogs(List<String> logs) { this.logs = logs; }
        public Map<String, String> getHeaders() { return headers; }
        public void setHeaders(Map<String, String> headers) { this.headers = headers; }
        public Map<String, Object> getQueryParams() { return queryParams; }
        public void setQueryParams(Map<String, Object> queryParams) { this.queryParams = queryParams; }
    }

    /**
     * 执行用户配置的前置 JavaScript 脚本 (返回包含日志的完整结果)
     *
     * @param script        用户编写的 JS 脚本
     * @param headers       HTTP 请求头容器
     * @param queryParams   URL 查询参数容器
     * @param requestUrl    目标请求 URL
     * @param requestMethod 请求方法 (GET, POST 等)
     * @param requestBody   请求体内容
     * @return 脚本执行结果 (包含打印日志、耗时与处理后的 Headers/Params)
     */
    public static ScriptExecutionResult executePreScriptWithResult(String script, Map<String, String> headers, Map<String, Object> queryParams,
                                                                   String requestUrl, String requestMethod, String requestBody) {
        ScriptExecutionResult result = new ScriptExecutionResult();
        long startTime = System.currentTimeMillis();

        Map<String, String> targetHeaders = (headers != null) ? headers : new HashMap<>();
        Map<String, Object> targetParams = (queryParams != null) ? queryParams : new HashMap<>();
        result.setHeaders(targetHeaders);
        result.setQueryParams(targetParams);

        if (StringUtils.isBlank(script)) {
            result.setSuccess(true);
            result.setMessage("未配置前置脚本，跳过执行");
            result.setElapsedMs(0L);
            return result;
        }

        if (script.length() > SCRIPT_MAX_LENGTH) {
            result.setSuccess(false);
            result.setMessage("安全拦截: 前置脚本长度超过限制 (" + SCRIPT_MAX_LENGTH + " 字符)");
            result.setElapsedMs(System.currentTimeMillis() - startTime);
            return result;
        }

        // 1. 静态安全性审查
        for (String forbidden : FORBIDDEN_KEYWORDS) {
            if (script.contains(forbidden)) {
                logger.error("[前置脚本执行] 安全拦截: 脚本中禁止包含敏感高危关键字 [{}]", forbidden);
                result.setSuccess(false);
                result.setMessage("安全拦截: 脚本包含受限的高危系统关键字 [" + forbidden + "]");
                result.setElapsedMs(System.currentTimeMillis() - startTime);
                return result;
            }
        }

        StringWriter stdoutWriter = new StringWriter();
        try {
            // 2. 初始化带沙箱过滤器的 Nashorn 实例并配置标准输出捕获
            ScriptEngine engine = NASHORN_FACTORY.getScriptEngine(SANDBOX_FILTER);
            engine.getContext().setWriter(stdoutWriter);
            engine.getContext().setErrorWriter(stdoutWriter);

            // 3. 构建 context 上下文对象
            Map<String, Object> context = new HashMap<>();
            context.put("url", requestUrl != null ? requestUrl : "");
            context.put("method", requestMethod != null ? requestMethod.trim().toUpperCase() : "GET");
            context.put("path", extractUrlPath(requestUrl));
            context.put("headers", targetHeaders);
            context.put("params", targetParams);
            context.put("body", requestBody != null ? requestBody : "");

            Bindings bindings = new SimpleBindings();
            bindings.put("context", context);
            bindings.put("crypto", new CryptoHelper());
            bindings.put("console", new ConsoleHelper(result.getLogs()));

            // 4. 在带超时控制的线程池中执行脚本，防止死循环永久挂死请求/调度线程
            Future<?> scriptFuture = SCRIPT_EXECUTOR.submit(() -> engine.eval(script, bindings));
            try {
                scriptFuture.get(SCRIPT_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            } catch (TimeoutException timeoutEx) {
                scriptFuture.cancel(true);
                result.setSuccess(false);
                result.setMessage("脚本执行超时 (超过 " + SCRIPT_TIMEOUT_MS / 1000 + " 秒)，已强制终止执行");
                result.setElapsedMs(System.currentTimeMillis() - startTime);
                return result;
            } catch (ExecutionException execEx) {
                // 解包脚本执行异步包装异常，恢复原始异常类型 (如 SecurityException 需命中下方「安全拦截」分支)
                Throwable cause = execEx.getCause() != null ? execEx.getCause() : execEx;
                if (cause instanceof Exception) {
                    throw (Exception) cause;
                }
                throw new IllegalStateException(cause);
            }

            // 5. 捕获通过 print(...) 输出的内容
            String stdout = stdoutWriter.toString();
            if (StringUtils.isNotBlank(stdout)) {
                String[] lines = stdout.split("\\r?\\n");
                for (String line : lines) {
                    if (StringUtils.isNotBlank(line)) {
                        result.getLogs().add(line);
                    }
                }
            }

            long elapsed = System.currentTimeMillis() - startTime;
            result.setSuccess(true);
            result.setMessage("脚本执行成功，产生 " + result.getLogs().size() + " 条打印日志");
            result.setElapsedMs(elapsed);

        } catch (SecurityException se) {
            result.setSuccess(false);
            result.setMessage("安全拦截: " + se.getMessage());
            result.setElapsedMs(System.currentTimeMillis() - startTime);
        } catch (Exception e) {
            logger.error("[前置脚本执行] 运行时发生异常: {}", e.getMessage(), e);
            result.setSuccess(false);
            result.setMessage("脚本执行异常: " + e.getMessage());
            result.setElapsedMs(System.currentTimeMillis() - startTime);
        }

        return result;
    }

    /**
     * 执行用户配置的前置 JavaScript 脚本 (常规调用，异常时抛出)
     *
     * @param script        用户编写的 JS 脚本
     * @param headers       HTTP 请求头容器 (脚本可直接修改)
     * @param queryParams   URL 查询参数容器 (脚本可直接修改)
     * @param requestUrl    目标请求 URL
     * @param requestMethod 请求方法 (GET, POST 等)
     * @param requestBody   请求体内容
     */
    public static void executePreScript(String script, Map<String, String> headers, Map<String, Object> queryParams,
                                        String requestUrl, String requestMethod, String requestBody) {
        ScriptExecutionResult res = executePreScriptWithResult(script, headers, queryParams, requestUrl, requestMethod, requestBody);
        if (!res.isSuccess()) {
            throw new IllegalStateException(res.getMessage());
        }
        if (!res.getLogs().isEmpty()) {
            logger.info("[前置脚本日志] 输出: {}", res.getLogs());
        }
    }

    /**
     * 提取 URL 中的纯 Path 路径 (去除协议、域名、端口以及 Query 参数，保证以 / 开头)
     *
     * @param fullUrl 原始完整 URL
     * @return 纯 Path 路径，例如 /api/vehicle/vehiclePage
     */
    public static String extractUrlPath(String fullUrl) {
        if (StringUtils.isBlank(fullUrl)) {
            return "/";
        }
        String url = fullUrl.trim();
        try {
            URI uri = new URI(url);
            String path = uri.getPath();
            if (StringUtils.isNotBlank(path)) {
                return path.startsWith("/") ? path : "/" + path;
            }
        } catch (Exception ignored) {
        }

        // 降级截取逻辑
        if (url.contains("://")) {
            url = url.substring(url.indexOf("://") + 3);
            int slashIndex = url.indexOf('/');
            url = (slashIndex >= 0) ? url.substring(slashIndex) : "/";
        }
        if (url.contains("?")) {
            url = url.substring(0, url.indexOf('?'));
        }
        if (url.contains("#")) {
            url = url.substring(0, url.indexOf('#'));
        }
        return url.startsWith("/") ? url : "/" + url;
    }
}
