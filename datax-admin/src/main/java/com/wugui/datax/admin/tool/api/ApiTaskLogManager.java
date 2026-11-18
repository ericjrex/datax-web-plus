package com.wugui.datax.admin.tool.api;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * 接口数据采集任务执行日志管理器
 * 提供基于本地物理文件的分片追加、实时增量读取与容量防爆熔断保护机制
 *
 * @author ypc
 */
public class ApiTaskLogManager {

    private static final Logger logger = LoggerFactory.getLogger(ApiTaskLogManager.class);

    /**
     * 接口采集日志存储主目录
     */
    private static final String LOG_BASE_DIR = "./data/api-task/logs";

    /**
     * 单个任务日志文件最大字节限制 (20MB 熔断保护，防止死循环请求刷爆磁盘)
     */
    private static final long MAX_LOG_FILE_SIZE = 20 * 1024 * 1024;

    /**
     * 单次拉取最大行数限制，防止一次返回过大导致前端卡顿
     */
    private static final int MAX_FETCH_LINES = 1000;

    /**
     * 结束标识文本，用于供客户端识别任务已落幕
     */
    public static final String LOG_END_MARKER = "===DATAX_API_TASK_COMPLETED===";

    /**
     * 获取日志物理文件句柄 (严格校验，杜绝路径穿越攻击)
     *
     * @param logId 调度流水日志主键ID
     * @return 对应的文件对象
     */
    public static File getLogFile(Long logId) {
        if (logId == null || logId <= 0) {
            return null;
        }
        File baseDir = new File(LOG_BASE_DIR).getAbsoluteFile();
        if (!baseDir.exists()) {
            try {
                java.nio.file.Files.createDirectories(baseDir.toPath());
            } catch (Exception ignored) {
                baseDir.mkdirs();
            }
        }
        return new File(baseDir, "api_task_" + logId + ".log");
    }

    /**
     * 初始化任务日志头信息
     *
     * @param logId 调度流水日志主键ID
     * @param taskName 任务名称
     * @param triggerSource 触发源 (MANUAL 或 CRON)
     */
    public static void initLog(Long logId, String taskName, String triggerSource) {
        File file = getLogFile(logId);
        if (file == null) {
            return;
        }
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String timeStr = sdf.format(new Date());

        StringBuilder headSb = new StringBuilder();
        headSb.append("----------------------------------------------------------------------\n");
        headSb.append(String.format("[%s] 任务名称: %s\n", timeStr, StringUtils.defaultString(taskName, "-")));
        headSb.append(String.format("[%s] 执行日志ID: #%d\n", timeStr, logId));
        headSb.append(String.format("[%s] 触发方式: %s\n", timeStr, "MANUAL".equalsIgnoreCase(triggerSource) ? "手动立即触发" : "定时调度触发"));
        headSb.append(String.format("[%s] 执行环境: 本地接口采集引擎 (Local HTTP Extract Engine)\n", timeStr));
        headSb.append("----------------------------------------------------------------------\n");

        writeRawLine(file, headSb.toString(), false);
    }

    /**
     * 实时追加单行输出日志 (带容量熔断保护)
     *
     * @param logId 调度流水日志主键ID
     * @param line 输出的一行文本
     */
    public static void appendLog(Long logId, String line) {
        if (logId == null || logId <= 0 || line == null) {
            return;
        }

        File file = getLogFile(logId);
        if (file == null) {
            return;
        }

        // 容量防爆检查
        if (file.exists() && file.length() > MAX_LOG_FILE_SIZE) {
            return;
        }

        appendFormattedLine(file, line);
    }

    /**
     * 追加带有时间戳格式的标准日志行
     */
    public static void appendFormattedLine(File file, String content) {
        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm:ss.SSS");
        String timeStr = sdf.format(new Date());
        writeRawLine(file, String.format("[%s] %s\n", timeStr, content), true);
    }

    /**
     * 标记任务执行结束并写入收尾摘要
     *
     * @param logId 调度流水日志主键ID
     * @param success 是否执行成功
     * @param summaryMsg 最终处理摘要说明
     */
    public static void finishLog(Long logId, boolean success, String summaryMsg) {
        if (logId == null || logId <= 0) {
            return;
        }
        File file = getLogFile(logId);
        if (file == null) {
            return;
        }

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String timeStr = sdf.format(new Date());
        StringBuilder footSb = new StringBuilder();
        footSb.append("----------------------------------------------------------------------\n");
        footSb.append(String.format("[%s] 任务执行状态: %s\n", timeStr, success ? "执行成功 (SUCCESS)" : "执行失败 (FAIL)"));
        if (StringUtils.isNotBlank(summaryMsg)) {
            footSb.append(String.format("[%s] 结果摘要: %s\n", timeStr, summaryMsg));
        }
        footSb.append(String.format("[%s] %s\n", timeStr, LOG_END_MARKER));
        footSb.append("----------------------------------------------------------------------\n");

        writeRawLine(file, footSb.toString(), true);
    }

    /**
     * 分片增量读取日志内容 (支持客户端轮询)
     *
     * @param logId 调度流水日志主键ID
     * @param fromLineNum 起始行号 (1-indexed)
     * @return 分片日志结果 Map
     */
    public static Map<String, Object> readLog(Long logId, int fromLineNum) {
        Map<String, Object> result = new HashMap<>();
        int startLine = Math.max(fromLineNum, 1);
        result.put("fromLineNum", startLine);
        result.put("toLineNum", startLine);
        result.put("logContent", "");
        result.put("isEnd", false);

        File file = getLogFile(logId);
        if (file == null || !file.exists()) {
            return result;
        }

        StringBuilder contentSb = new StringBuilder();
        int currentLine = 0;
        int collectedLines = 0;
        boolean isEnd = false;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                currentLine++;
                if (line.contains(LOG_END_MARKER)) {
                    isEnd = true;
                }
                if (currentLine >= startLine) {
                    contentSb.append(line).append("\n");
                    collectedLines++;
                    if (collectedLines >= MAX_FETCH_LINES) {
                        break;
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("读取接口任务执行日志异常 [logId: {}]: {}", logId, e.getMessage());
        }

        result.put("toLineNum", Math.max(currentLine, startLine));
        result.put("logContent", contentSb.toString());
        result.put("isEnd", isEnd);
        return result;
    }

    /**
     * 安全写入原始文本到文件并立即刷盘
     */
    private static synchronized void writeRawLine(File file, String content, boolean append) {
        if (file == null || content == null) {
            return;
        }
        try (PrintWriter writer = new PrintWriter(new OutputStreamWriter(new FileOutputStream(file, append), StandardCharsets.UTF_8))) {
            writer.print(content);
            writer.flush();
        } catch (Exception e) {
            logger.warn("写入接口任务日志物理文件失败 [path: {}]: {}", file.getAbsolutePath(), e.getMessage());
        }
    }
}
