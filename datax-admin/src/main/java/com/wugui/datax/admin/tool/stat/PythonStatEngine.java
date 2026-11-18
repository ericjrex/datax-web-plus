package com.wugui.datax.admin.tool.stat;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.wugui.datax.admin.dto.StatTaskResultDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.util.AESUtil;
import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Python 统计计算执行引擎
 *
 * @author ypc
 */
public class PythonStatEngine {

    private static final Logger logger = LoggerFactory.getLogger(PythonStatEngine.class);

    public static final String DATA_START_MARKER = "===DATAX_STAT_DATA_START===";
    public static final String DATA_END_MARKER = "===DATAX_STAT_DATA_END===";

    /**
     * 单次读取输出流的最大字节数 (50MB 熔断保护，防止内存溢出)
     */
    private static final int MAX_BUFFER_BYTES = 50 * 1024 * 1024;

    /**
     * 执行 Python 脚本 (兼容旧调用，无绑定数据源)
     */
    public static StatTaskResultDto executePythonScript(String pythonPath,
                                                        String scriptContent,
                                                        String paramsJson,
                                                        int timeoutSeconds,
                                                        Integer limit) throws Exception {
        return executePythonScript(pythonPath, scriptContent, paramsJson, timeoutSeconds, limit, null);
    }

    /**
     * 执行 Python 脚本并解析固定格式输出 (支持动态注入已配置的数据源凭据)
     *
     * @param pythonPath Python 可执行程序路径 (如 python 或 D:/python3/python.exe)
     * @param scriptContent Python 脚本源码
     * @param paramsJson 动态参数 JSON (如 {"bizDate": "2026-09-03"})
     * @param timeoutSeconds 超时时间 (单位: 秒)
     * @param limit 限制返回行数 (null 或 <= 0 表示不限制)
     * @param sourceDs 关联的源端数据源实体 (传入则自动解密注入环境变量，Python脚本可免密动态读取)
     * @return 统计结果对象
     * @throws Exception 执行异常
    /**
     * 执行 Python 脚本并解析固定格式输出 (兼容旧接口签名，自动尝试从上下文获取 logId)
     */
    public static StatTaskResultDto executePythonScript(String pythonPath,
                                                        String scriptContent,
                                                        String paramsJson,
                                                        int timeoutSeconds,
                                                        Integer limit,
                                                        JobDatasource sourceDs) throws Exception {
        return executePythonScript(pythonPath, scriptContent, paramsJson, timeoutSeconds, limit, sourceDs, null);
    }

    /**
     * 执行 Python 脚本并解析固定格式输出 (支持动态注入已配置的数据源凭据及物理流式日志输出)
     *
     * @param pythonPath Python 可执行程序路径 (如 python 或 D:/python3/python.exe)
     * @param scriptContent Python 脚本源码
     * @param paramsJson 动态参数 JSON (如 {"bizDate": "2026-09-03"})
     * @param timeoutSeconds 超时时间 (单位: 秒)
     * @param limit 限制返回行数 (null 或 <= 0 表示不限制)
     * @param sourceDs 关联的源端数据源实体 (传入则自动解密注入环境变量，Python脚本可免密动态读取)
     * @param logId 本次执行绑定的调度流水日志ID (传入则自动实时流式落盘)
     * @return 统计结果对象
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executePythonScript(String pythonPath,
                                                        String scriptContent,
                                                        String paramsJson,
                                                        int timeoutSeconds,
                                                        Integer limit,
                                                        JobDatasource sourceDs,
                                                        Long logId) throws Exception {
        long startTime = System.currentTimeMillis();
        StatTaskResultDto result = new StatTaskResultDto();

        if (StringUtils.isBlank(scriptContent)) {
            throw new IllegalArgumentException("Python 脚本内容不能为空");
        }

        // 解析有效 logId (优先传入参数，次之从线程上下文读取)
        Long effectiveLogId = (logId != null && logId > 0) ? logId : StatTaskExecutionManager.getCurrentLogId();

        // 脚本高危操作静态安全审计 (拦截 DROP/TRUNCATE 与全表 DELETE，审计带 WHERE 的删除)
        validatePythonScriptSecurity(scriptContent, effectiveLogId);

        String execPythonCmd = resolvePythonExecutable(pythonPath, effectiveLogId);
        int safeTimeout = timeoutSeconds > 0 ? timeoutSeconds : 3600;

        // 1. 准备临时脚本文件 (采用 NIO 高可用原子落盘、绝对路径与瞬态并发重试机制)
        File tempScriptFile = prepareTempScriptFile(scriptContent);

        // 处理动态参数
        String resolvedParams = resolveParamsJson(paramsJson);

        try {
            // 2. 构造进程命令行参数
            List<String> command = new ArrayList<>();
            command.add(execPythonCmd);
            command.add("-u"); // 强制无缓冲输出
            command.add(tempScriptFile.getAbsolutePath());
            if (StringUtils.isNotBlank(resolvedParams)) {
                command.add(resolvedParams);
            }

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(tempScriptFile.getParentFile()); // 显式设定工作目录为脚本所在目录
            pb.redirectErrorStream(true); // 合并 stderr 到 stdout

            // 环境变量注入 (基于子进程私有内存，防止在命令行明文泄露)
            Map<String, String> env = pb.environment();
            env.put("PYTHONIOENCODING", "utf-8");
            env.put("PYTHONUNBUFFERED", "1");
            env.put("DATAX_STAT_PARAMS", resolvedParams);
            if (limit != null && limit > 0) {
                env.put("DATAX_STAT_IS_TEST_RUN", "true");
                env.put("DATAX_STAT_LIMIT", String.valueOf(limit));
            } else {
                env.put("DATAX_STAT_IS_TEST_RUN", "false");
            }

            // 若配置了源端数据源，自动安全解密并注入数据库连接信息
            if (sourceDs != null) {
                injectDatasourceToEnv(env, sourceDs);
            }

            logger.info("启动 Python 统计计算子进程: {}, logId: {}", command, effectiveLogId);
            Process process = pb.start();
            StatTaskExecutionManager.registerActiveProcess(process);

            // 3. 异步读取输出并进行流式日志物理刷盘与缓冲区安全熔断控制
            StringBuilder outputBuilder = new StringBuilder();
            boolean bufferOverflow = false;

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (outputBuilder.length() + line.length() > MAX_BUFFER_BYTES) {
                        bufferOverflow = true;
                        break;
                    }
                    outputBuilder.append(line).append("\n");

                    // 实时流式写入本地物理日志文件，供前端控制台即时增量查看
                    if (effectiveLogId != null) {
                        StatTaskLogManager.appendLog(effectiveLogId, line);
                    }
                }
            }

            // 4. 等待进程结束与超时看门狗强杀
            boolean finished = process.waitFor(safeTimeout, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new TimeoutException("Python 脚本执行超时 (已超过 " + safeTimeout + " 秒)，已被系统强制终止");
            }

            if (bufferOverflow) {
                process.destroyForcibly();
                throw new SecurityException("Python 脚本输出流超出单次上限 (50MB)，触发内存熔断保护已终止！");
            }

            int exitCode = process.exitValue();
            String fullOutput = outputBuilder.toString();
            result.setLogOutput(fullOutput);

            if (exitCode != 0) {
                result.setSuccess(false);
                result.setMessage("Python 脚本执行异常，退出码: " + exitCode);
                result.setCostMs(System.currentTimeMillis() - startTime);
                if (effectiveLogId != null) {
                    StatTaskLogManager.finishLog(effectiveLogId, false, result.getMessage());
                }
                return result;
            }

            // 5. 提取固定格式标准数据块并解析
            parseStandardDataOutput(fullOutput, result, limit);
            result.setSuccess(true);
            result.setCostMs(System.currentTimeMillis() - startTime);

            // 优先使用脚本在 JSON 数据块或控制台末尾显式透传的业务成功总结
            if (StringUtils.isBlank(result.getMessage())) {
                String successSummary = extractSuccessSummary(fullOutput);
                if (StringUtils.isNotBlank(successSummary)) {
                    result.setMessage(successSummary);
                } else {
                    result.setMessage("Python 脚本计算完成，成功解析出 " + result.getTotalRows() + " 行数据");
                }
            }

            if (effectiveLogId != null) {
                StatTaskLogManager.finishLog(effectiveLogId, true, result.getMessage());
            }

        } finally {
            StatTaskExecutionManager.unregisterActiveProcess();
            // 确保临时脚本文件彻底清理 (防止 Windows 文件句柄占用导致删除异常)
            if (tempScriptFile != null) {
                try {
                    Files.deleteIfExists(tempScriptFile.toPath());
                } catch (Exception e) {
                    tempScriptFile.deleteOnExit();
                    logger.debug("临时脚本未能立即物理删除，已标记为退出时删除: {}", tempScriptFile.getAbsolutePath());
                }
            }
        }

        return result;
    }

    /**
     * 从控制台完整输出中提取标准定界数据块并解析为结构化结果
     */
    private static void parseStandardDataOutput(String fullOutput, StatTaskResultDto result, Integer limit) {
        String jsonPayload = null;

        if (fullOutput.contains(DATA_START_MARKER) && fullOutput.contains(DATA_END_MARKER)) {
            int startIdx = fullOutput.indexOf(DATA_START_MARKER) + DATA_START_MARKER.length();
            int endIdx = fullOutput.indexOf(DATA_END_MARKER);
            if (startIdx <= endIdx) {
                jsonPayload = fullOutput.substring(startIdx, endIdx).trim();
            }
        } else {
            // 容错机制：尝试查找输出中最后一个完整的 JSON 数组或对象
            int lastArrayStart = fullOutput.lastIndexOf('[');
            int lastArrayEnd = fullOutput.lastIndexOf(']');
            if (lastArrayStart != -1 && lastArrayEnd > lastArrayStart) {
                jsonPayload = fullOutput.substring(lastArrayStart, lastArrayEnd + 1).trim();
            } else {
                int lastObjStart = fullOutput.lastIndexOf('{');
                int lastObjEnd = fullOutput.lastIndexOf('}');
                if (lastObjStart != -1 && lastObjEnd > lastObjStart) {
                    jsonPayload = fullOutput.substring(lastObjStart, lastObjEnd + 1).trim();
                }
            }
        }

        if (StringUtils.isBlank(jsonPayload)) {
            throw new IllegalArgumentException("未在 Python 脚本输出中检测到固定标准格式数据块！请使用定界符 "
                    + DATA_START_MARKER + " ... " + DATA_END_MARKER + " 输出 JSON 数据。");
        }

        // 解析 JSON 数据
        Object parsedObj = JSON.parse(jsonPayload);
        List<String> columnNames = new ArrayList<>();
        List<TableColumnDto> columnDetails = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        long totalRows = 0;

        if (parsedObj instanceof JSONArray) {
            // 格式 A：[{"col1": val, "col2": val}, ...]
            JSONArray jsonArray = (JSONArray) parsedObj;
            totalRows = jsonArray.size();

            if (!jsonArray.isEmpty()) {
                JSONObject firstObj = jsonArray.getJSONObject(0);
                if (firstObj != null) {
                    columnNames.addAll(firstObj.keySet());
                }
            }

            int fetchCount = (limit != null && limit > 0) ? Math.min(limit, jsonArray.size()) : jsonArray.size();
            for (int i = 0; i < fetchCount; i++) {
                JSONObject item = jsonArray.getJSONObject(i);
                if (item != null) {
                    rows.add(new LinkedHashMap<>(item));
                }
            }
        } else if (parsedObj instanceof JSONObject) {
            JSONObject jsonObj = (JSONObject) parsedObj;

            // 提取脚本主动透传的业务总结与真实统计条数 (兼容就地清洗型大批量任务)
            if (jsonObj.containsKey("summary") && StringUtils.isNotBlank(jsonObj.getString("summary"))) {
                result.setMessage(jsonObj.getString("summary").trim());
            }
            if (jsonObj.containsKey("total")) {
                totalRows = jsonObj.getLongValue("total");
            }

            // 格式 C：{"total": 2586, "summary": "...", "rows": [{"col1": val, ...}]}
            JSONArray rowsArr = jsonObj.containsKey("rows") ? jsonObj.getJSONArray("rows") : jsonObj.getJSONArray("data");
            if (rowsArr != null && !rowsArr.isEmpty() && rowsArr.get(0) instanceof JSONObject) {
                if (!jsonObj.containsKey("total")) {
                    totalRows = rowsArr.size();
                }
                JSONObject firstObj = rowsArr.getJSONObject(0);
                if (firstObj != null) {
                    columnNames.addAll(firstObj.keySet());
                }
                int fetchCount = (limit != null && limit > 0) ? Math.min(limit, rowsArr.size()) : rowsArr.size();
                for (int i = 0; i < fetchCount; i++) {
                    JSONObject item = rowsArr.getJSONObject(i);
                    if (item != null) {
                        rows.add(new LinkedHashMap<>(item));
                    }
                }
            } else {
                // 格式 B：{"columns": ["c1", "c2"], "data": [[v1, v2], ...]}
                JSONArray cols = jsonObj.getJSONArray("columns");
                JSONArray data = jsonObj.getJSONArray("data");

                if (cols != null) {
                    for (int i = 0; i < cols.size(); i++) {
                        columnNames.add(cols.getString(i));
                    }
                }

                if (data != null) {
                    if (!jsonObj.containsKey("total")) {
                        totalRows = data.size();
                    }
                    int fetchCount = (limit != null && limit > 0) ? Math.min(limit, data.size()) : data.size();
                    for (int i = 0; i < fetchCount; i++) {
                        JSONArray rowArr = data.getJSONArray(i);
                        Map<String, Object> rowMap = new LinkedHashMap<>();
                        for (int c = 0; c < columnNames.size(); c++) {
                            Object val = (rowArr != null && c < rowArr.size()) ? rowArr.get(c) : null;
                            rowMap.put(columnNames.get(c), val);
                        }
                        rows.add(rowMap);
                    }
                }
            }
        } else {
            throw new IllegalArgumentException("Python 输出的数据格式不合法，必须为 JSON 列表或包含 columns/data/rows 的对象");
        }

        // 推导推断字段元数据
        if (!rows.isEmpty()) {
            Map<String, Object> sampleRow = rows.get(0);
            int colIdx = 1;
            for (String col : columnNames) {
                TableColumnDto dto = new TableColumnDto();
                dto.setColumnIndex(colIdx++);
                dto.setColumnName(col);
                Object val = sampleRow.get(col);
                dto.setColumnType(inferDataType(val));
                dto.setIsNullable(true);
                columnDetails.add(dto);
            }
        }

        result.setColumns(columnNames);
        result.setColumnDetails(columnDetails);
        result.setRows(rows);
        result.setTotalRows(totalRows);
    }

    /**
     * 推断值的数据类型
     */
    private static String inferDataType(Object val) {
        if (val == null) {
            return "VARCHAR";
        }
        if (val instanceof Integer || val instanceof Long || val instanceof Short) {
            return "BIGINT";
        }
        if (val instanceof Double || val instanceof Float || val instanceof Number) {
            return "DECIMAL";
        }
        if (val instanceof Boolean) {
            return "TINYINT";
        }
        return "VARCHAR";
    }

    /**
     * 解析参数 JSON 并填充系统宏变量
     */
    private static String resolveParamsJson(String paramsJson) {
        Calendar cal = Calendar.getInstance();
        Date now = cal.getTime();
        SimpleDateFormat dfDay = new SimpleDateFormat("yyyy-MM-dd");
        SimpleDateFormat dfTime = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

        String today = dfDay.format(now);
        String nowStr = dfTime.format(now);

        cal.add(Calendar.DATE, -1);
        String yesterday = dfDay.format(cal.getTime());

        JSONObject paramObj = new JSONObject();
        paramObj.put("bizDate", yesterday);
        paramObj.put("yesterday", yesterday);
        paramObj.put("today", today);
        paramObj.put("now", nowStr);

        if (StringUtils.isNotBlank(paramsJson)) {
            try {
                JSONObject custom = JSON.parseObject(paramsJson);
                if (custom != null) {
                    paramObj.putAll(custom);
                }
            } catch (Exception ignored) {
            }
        }

        return paramObj.toJSONString();
    }

    /**
     * 将已配置的数据源解密并安全注入环境变量
     *
     * @param env 进程环境变量 Map
     * @param sourceDs 数据源实体
     */
    private static void injectDatasourceToEnv(Map<String, String> env, JobDatasource sourceDs) {
        if (env == null || sourceDs == null) {
            return;
        }
        try {
            String username = AESUtil.decrypt(sourceDs.getJdbcUsername());
            String password = AESUtil.decrypt(sourceDs.getJdbcPassword());
            JdbcConnectionInfo urlInfo = parseJdbcUrl(sourceDs.getJdbcUrl(), sourceDs.getDatasource());

            String dbType = StringUtils.isNotBlank(sourceDs.getDatasource()) ? sourceDs.getDatasource().toUpperCase() : "MYSQL";
            String host = StringUtils.isNotBlank(urlInfo.getHost()) ? urlInfo.getHost() : "127.0.0.1";
            int port = urlInfo.getPort() > 0 ? urlInfo.getPort() : 3306;
            String dbName = StringUtils.isNotBlank(urlInfo.getDbName()) ? urlInfo.getDbName() : "";

            env.put("DATAX_DS_ID", String.valueOf(sourceDs.getId()));
            env.put("DATAX_DS_NAME", StringUtils.isNotBlank(sourceDs.getDatasourceName()) ? sourceDs.getDatasourceName() : "");
            env.put("DATAX_DS_TYPE", dbType);
            env.put("DATAX_DS_HOST", host);
            env.put("DATAX_DS_PORT", String.valueOf(port));
            env.put("DATAX_DS_USERNAME", username != null ? username : "");
            env.put("DATAX_DS_PASSWORD", password != null ? password : "");
            env.put("DATAX_DS_DBNAME", dbName);
            env.put("DATAX_DS_JDBC_URL", sourceDs.getJdbcUrl() != null ? sourceDs.getJdbcUrl() : "");

            // 统一构造免密配置 JSON，方便 Python 一键 load
            JSONObject dsJson = new JSONObject();
            dsJson.put("id", sourceDs.getId());
            dsJson.put("name", sourceDs.getDatasourceName());
            dsJson.put("dbType", dbType);
            dsJson.put("host", host);
            dsJson.put("port", port);
            dsJson.put("username", username != null ? username : "");
            dsJson.put("password", password != null ? password : "");
            dsJson.put("database", dbName);
            dsJson.put("jdbcUrl", sourceDs.getJdbcUrl());
            env.put("DATAX_DS_CONFIG", dsJson.toJSONString());

            logger.info("已安全注入数据源 [ID: {}, 名称: {}, 类型: {}] 到 Python 环境变量",
                    sourceDs.getId(), sourceDs.getDatasourceName(), dbType);
        } catch (Exception e) {
            logger.warn("注入数据源凭据至 Python 子进程失败 [ID: {}]: {}", sourceDs.getId(), e.getMessage());
        }
    }

    /**
     * 解析 JDBC URL 中的主机名、端口号与数据库名
     *
     * @param jdbcUrl JDBC 连接串
     * @param dbType 数据库类型 (如 mysql, postgresql, oracle, sqlserver)
     * @return 结构化连接信息对象
     */
    public static JdbcConnectionInfo parseJdbcUrl(String jdbcUrl, String dbType) {
        JdbcConnectionInfo info = new JdbcConnectionInfo();
        info.setJdbcUrl(jdbcUrl);
        info.setDbType(dbType);
        if (StringUtils.isBlank(jdbcUrl)) {
            return info;
        }

        try {
            String cleanUrl = jdbcUrl.trim();
            if (cleanUrl.contains("://")) {
                int protoIdx = cleanUrl.indexOf("://");
                String mainPart = cleanUrl.substring(protoIdx + 3);
                String queryPart = "";
                if (mainPart.contains("?")) {
                    int qIdx = mainPart.indexOf("?");
                    queryPart = mainPart.substring(qIdx + 1);
                    mainPart = mainPart.substring(0, qIdx);
                } else if (mainPart.contains(";")) {
                    int scIdx = mainPart.indexOf(";");
                    queryPart = mainPart.substring(scIdx + 1);
                    mainPart = mainPart.substring(0, scIdx);
                }

                String hostPort = mainPart;
                String dbName = "";
                if (mainPart.contains("/")) {
                    int slashIdx = mainPart.indexOf("/");
                    hostPort = mainPart.substring(0, slashIdx);
                    dbName = mainPart.substring(slashIdx + 1);
                }

                if (hostPort.contains(":")) {
                    String[] hp = hostPort.split(":");
                    info.setHost(hp[0]);
                    try {
                        info.setPort(Integer.parseInt(hp[1]));
                    } catch (Exception ignored) {
                    }
                } else {
                    info.setHost(hostPort);
                }

                if (StringUtils.isBlank(dbName) && StringUtils.isNotBlank(queryPart)) {
                    for (String param : queryPart.split("[;&]")) {
                        String[] kv = param.split("=");
                        if (kv.length == 2 && ("databaseName".equalsIgnoreCase(kv[0]) || "database".equalsIgnoreCase(kv[0]))) {
                            dbName = kv[1];
                            break;
                        }
                    }
                }
                info.setDbName(dbName);
            } else if (cleanUrl.contains("@")) {
                String afterAt = cleanUrl.substring(cleanUrl.indexOf("@") + 1).trim();
                if (afterAt.startsWith("//")) {
                    afterAt = afterAt.substring(2);
                }
                String[] parts = afterAt.split("[:/]");
                if (parts.length >= 1) info.setHost(parts[0]);
                if (parts.length >= 2) {
                    try {
                        info.setPort(Integer.parseInt(parts[1]));
                    } catch (Exception ignored) {
                    }
                }
                if (parts.length >= 3) info.setDbName(parts[2]);
            }
        } catch (Exception e) {
            logger.warn("解析 JDBC URL 异常 [{}]: {}", jdbcUrl, e.getMessage());
        }

        // 常见类型缺省端口兜底
        if (info.getPort() <= 0) {
            if ("POSTGRESQL".equalsIgnoreCase(dbType)) info.setPort(5432);
            else if ("ORACLE".equalsIgnoreCase(dbType)) info.setPort(1521);
            else if ("SQLSERVER".equalsIgnoreCase(dbType)) info.setPort(1433);
            else if ("CLICKHOUSE".equalsIgnoreCase(dbType)) info.setPort(8123);
            else if ("MONGODB".equalsIgnoreCase(dbType)) info.setPort(27017);
            else info.setPort(3306);
        }

        return info;
    }

    /**
     * JDBC 连接信息载体 (内部结构体)
     */
    public static class JdbcConnectionInfo {
        private String host = "127.0.0.1";
        private int port = 3306;
        private String dbName = "";
        private String dbType = "";
        private String jdbcUrl = "";

        public String getHost() { return host; }
        public void setHost(String host) { this.host = host; }
        public int getPort() { return port; }
        public void setPort(int port) { this.port = port; }
        public String getDbName() { return dbName; }
        public void setDbName(String dbName) { this.dbName = dbName; }
        public String getDbType() { return dbType; }
        public void setDbType(String dbType) { this.dbType = dbType; }
        public String getJdbcUrl() { return jdbcUrl; }
        public void setJdbcUrl(String jdbcUrl) { this.jdbcUrl = jdbcUrl; }
    }

    public static class TimeoutException extends RuntimeException {
        public TimeoutException(String message) {
            super(message);
        }
    }

    /**
     * 从子进程控制台完整输出中倒序寻找以【成功】开头的业务总结提示行
     *
     * @param fullOutput 控制台完整输出文本
     * @return 业务成功总结摘要，未找到则返回 null
     */
    private static String extractSuccessSummary(String fullOutput) {
        if (StringUtils.isBlank(fullOutput)) {
            return null;
        }
        String[] lines = fullOutput.split("\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i].trim();
            if (line.startsWith("【成功】") || line.startsWith("[成功]")) {
                return line.replace("【成功】", "").replace("[成功]", "").trim();
            }
        }
        return null;
    }

    /**
     * 对 Python 脚本中的高危操作进行安全审计与阻断拦截
     * 1. 严格拦截 DROP TABLE / DROP DATABASE / TRUNCATE TABLE 破坏性 DDL 指令；
     * 2. 严格拦截无 WHERE 条件的 DELETE FROM 全表清空操作；
     * 3. 对带 WHERE 条件的物理范围删除 (DELETE ... WHERE) 进行明确审计与日志留痕。
     *
     * @param scriptContent 脚本内容
     * @param effectiveLogId 关联的日志ID (可用于写日志审计)
     */
    private static void validatePythonScriptSecurity(String scriptContent, Long effectiveLogId) {
        if (StringUtils.isBlank(scriptContent)) {
            return;
        }

        // 1. 安全剥离 Python 多行三引号注释 ("""...""" 与 '''...''')
        String cleanScript = scriptContent.replaceAll("(?s)\"\"\"[\\s\\S]*?\"\"\"", " ")
                                          .replaceAll("(?s)'''[\\s\\S]*?'''", " ");
        // 2. 安全剥离 Python 单行注释 (# ...)
        cleanScript = cleanScript.replaceAll("(?m)^\\s*#.*$", " ")
                                 .replaceAll("(?m)(?<!['\"])#.*$", " ");
        // 3. 剥离 print(...) 提示语句
        cleanScript = cleanScript.replaceAll("\\bprint\\s*\\([^()]*\\)", " ");

        // 1. 拦截 DROP TABLE / DROP DATABASE / TRUNCATE TABLE
        Pattern dropPattern = Pattern.compile("\\b(DROP\\s+TABLE|DROP\\s+DATABASE|TRUNCATE\\s+(?:TABLE)?)\\s+([`\"'{\\w.]+)", Pattern.CASE_INSENSITIVE);
        Matcher dropMatcher = dropPattern.matcher(cleanScript);
        if (dropMatcher.find()) {
            String rawDdlTarget = dropMatcher.group(2).replaceAll("[`\"'{}]", "").trim();
            if (StringUtils.isNotBlank(rawDdlTarget) && !rawDdlTarget.matches("^\\.+$")) {
                String dangerousDdl = dropMatcher.group(0);
                String errMsg = "【安全拦截】检测到 Python 脚本包含高危破坏性 DDL 指令 [" + dangerousDdl + "]，系统已强制拒绝执行！";
                logger.error(errMsg);
                if (effectiveLogId != null) {
                    StatTaskLogManager.appendLog(effectiveLogId, errMsg);
                }
                throw new SecurityException(errMsg);
            }
        }

        // 2. 检查 DELETE 操作 (支持常规表名、反引号/引号以及 Python f-string 动态变量 {table})
        Pattern deletePattern = Pattern.compile("\\bDELETE\\s+FROM\\s+([`\"'{\\w.]+)([\\s\\S]*?)(?:;|[\"'\\n\\r]|$)", Pattern.CASE_INSENSITIVE);
        Matcher delMatcher = deletePattern.matcher(cleanScript);
        boolean hasDeleteWhere = false;
        while (delMatcher.find()) {
            String rawTable = delMatcher.group(1);
            String tableName = rawTable.replaceAll("[`\"'{}]", "").trim();
            if (StringUtils.isBlank(tableName) || tableName.matches("^\\.+$")) {
                continue;
            }

            String rest = delMatcher.group(2);
            if (rest != null && Pattern.compile("\\bWHERE\\b", Pattern.CASE_INSENSITIVE).matcher(rest).find()) {
                hasDeleteWhere = true;
            } else {
                // 如果片段内未找到 WHERE，做全局兜底扫描当前表名后方是否带有 WHERE
                Pattern fallbackWhere = Pattern.compile("\\bDELETE\\s+FROM\\s+[`\"'{]*" + Pattern.quote(tableName) + "[`\"'}]*[\\s\\S]*?\\bWHERE\\b", Pattern.CASE_INSENSITIVE);
                if (!fallbackWhere.matcher(cleanScript).find()) {
                    String errMsg = "【安全拦截】检测到表 [" + tableName + "] 包含无 WHERE 条件的全表清空操作 (DELETE FROM)，存在整表清空高危风险，系统已强制拒绝执行！";
                    logger.error(errMsg);
                    if (effectiveLogId != null) {
                        StatTaskLogManager.appendLog(effectiveLogId, errMsg);
                    }
                    throw new SecurityException(errMsg);
                } else {
                    hasDeleteWhere = true;
                }
            }
        }

        // 3. 记录 DELETE ... WHERE 审计日志
        if (hasDeleteWhere) {
            String auditMsg = "【安全审计提示】检测到 Python 脚本包含范围物理删除指令 (DELETE ... WHERE ...)，请确保操作已通过二次确认。";
            logger.warn("logId: {}, {}", effectiveLogId, auditMsg);
            if (effectiveLogId != null) {
                StatTaskLogManager.appendLog(effectiveLogId, auditMsg);
            }
        }
    }

    /**
     * 安全准备临时 Python 脚本物理文件 (解决 Windows 并发/文件锁及 Commons-IO 误报目录创建失败问题)
     *
     * @param scriptContent 脚本源码内容
     * @return 准备好的物理文件对象
     * @throws IOException 文件写入异常
     */
    private static File prepareTempScriptFile(String scriptContent) throws IOException {
        File primaryDir = new File("./data/stat-task/scripts").getAbsoluteFile();
        IOException lastException = null;

        // 优先使用主目录，带 3 次微小间隔重试防瞬态文件系统竞态
        for (int retry = 0; retry < 3; retry++) {
            try {
                Path dirPath = primaryDir.toPath();
                if (!Files.exists(dirPath)) {
                    Files.createDirectories(dirPath);
                }
                String tempFileName = "stat_job_" + UUID.randomUUID().toString().replace("-", "") + ".py";
                Path scriptPath = dirPath.resolve(tempFileName);
                Files.write(scriptPath, scriptContent.getBytes(StandardCharsets.UTF_8),
                        StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
                return scriptPath.toFile();
            } catch (IOException e) {
                lastException = e;
                try {
                    Thread.sleep(30L * (retry + 1));
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
        }

        // 若主目录遭遇 Windows 极端文件占用或权限异常，自动降级至系统临时目录，确保业务不中断
        try {
            File fallbackDir = new File(System.getProperty("java.io.tmpdir"), "datax-stat-scripts").getAbsoluteFile();
            Path fallbackDirPath = fallbackDir.toPath();
            if (!Files.exists(fallbackDirPath)) {
                Files.createDirectories(fallbackDirPath);
            }
            String tempFileName = "stat_job_" + UUID.randomUUID().toString().replace("-", "") + ".py";
            Path fallbackPath = fallbackDirPath.resolve(tempFileName);
            Files.write(fallbackPath, scriptContent.getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            logger.warn("主脚本目录写入重试失败，已安全降级至系统临时目录: {}", fallbackPath.toAbsolutePath());
            return fallbackPath.toFile();
        } catch (Exception fallbackEx) {
            logger.error("主目录及系统临时目录均无法写入脚本文件", fallbackEx);
            if (lastException != null) {
                throw lastException;
            }
            throw new IOException("无法创建 Python 临时脚本文件: " + fallbackEx.getMessage(), fallbackEx);
        }
    }

    /**
     * 缓存已探测成功的 Python 3 解释器指令 (避免每次任务重复启动子进程探测)
     */
    private static volatile String cachedResolvedPythonCmd = null;

    /**
     * 智能解析并探测符合要求的 Python 3 解释器路径
     * 解决 Linux 环境下默认 "python" 指向 Python 2.7 导致 f-string 等 Python 3 语法抛出 SyntaxError 的问题。
     *
     * @param configuredPath 用户或配置中心传入的路径
     * @param effectiveLogId 当前日志ID，用于审计留痕
     * @return 可执行的 Python 3 命令或绝对路径
     */
    public static String resolvePythonExecutable(String configuredPath, Long effectiveLogId) {
        // 1. 如果用户显式配置了自定义的具体路径 (非默认的 "python" 或 "python3")，直接优先使用
        if (StringUtils.isNotBlank(configuredPath)
                && !"python".equalsIgnoreCase(configuredPath.trim())
                && !"python3".equalsIgnoreCase(configuredPath.trim())) {
            return configuredPath.trim();
        }

        // 2. 命中探测缓存直接返回
        if (cachedResolvedPythonCmd != null) {
            return cachedResolvedPythonCmd;
        }

        synchronized (PythonStatEngine.class) {
            if (cachedResolvedPythonCmd != null) {
                return cachedResolvedPythonCmd;
            }

            boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");
            // Linux/Unix 下优先探测 python3，Windows 下优先探测 python
            List<String> candidates = isWindows
                    ? Arrays.asList("python", "python3")
                    : Arrays.asList("python3", "/usr/bin/python3", "/usr/local/bin/python3", "python");

            String python2Detected = null;

            for (String candidate : candidates) {
                try {
                    ProcessBuilder pb = new ProcessBuilder(candidate, "-c", "import sys; sys.stdout.write(str(sys.version_info[0]))");
                    pb.redirectErrorStream(true);
                    Process p = pb.start();
                    boolean finished = p.waitFor(2, TimeUnit.SECONDS);
                    if (finished && p.exitValue() == 0) {
                        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                            String output = reader.readLine();
                            if ("3".equals(StringUtils.trim(output))) {
                                logger.info("成功自动探测到 Python 3 解释器: {}", candidate);
                                cachedResolvedPythonCmd = candidate;
                                return candidate;
                            } else if ("2".equals(StringUtils.trim(output))) {
                                python2Detected = candidate;
                            }
                        }
                    } else {
                        p.destroyForcibly();
                    }
                } catch (Exception ignored) {
                    // 当前候选命令不存在或执行失败，继续尝试下一个候选
                }
            }

            // 若候选均不是 Python 3，但检测到了 Python 2，主动抛出明确指引异常
            if (python2Detected != null) {
                String errMsg = "【运行环境异常】当前系统默认解释器为 Python 2 (" + python2Detected + ")，未检测到 Python 3 环境！"
                        + "当前统计计算脚本基于 Python 3.6+ 编写。请登录服务器安装 Python 3 (如: yum install -y python3 python3-pip 或 apt install -y python3)，"
                        + "并执行 bash bin/python/install_deps.sh 部署依赖。";
                logger.error(errMsg);
                if (effectiveLogId != null) {
                    StatTaskLogManager.appendLog(effectiveLogId, errMsg);
                }
                throw new IllegalStateException(errMsg);
            }

            // 兜底降级：如果探测失败 (例如权限受限或环境变量异常)，回退到合理缺省值
            String fallback = StringUtils.isNotBlank(configuredPath)
                    ? configuredPath.trim()
                    : (isWindows ? "python" : "python3");
            cachedResolvedPythonCmd = fallback;
            return fallback;
        }
    }
}
