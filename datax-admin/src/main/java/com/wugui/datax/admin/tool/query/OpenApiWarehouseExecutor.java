package com.wugui.datax.admin.tool.query;

import com.wugui.datax.admin.core.util.LocalCacheUtil;
import com.wugui.datax.admin.dto.OpenApiQueryResultDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.util.AESUtil;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.*;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 外部开放 API 数仓安全查询执行工具
 * 保证物理连接只读、10秒超时强杀、1000条强制截断与敏感字段脱敏
 *
 * @author ypc
 * @since 2026-10-28
 */
public final class OpenApiWarehouseExecutor {

    private static final Logger logger = LoggerFactory.getLogger(OpenApiWarehouseExecutor.class);

    private static final int DEFAULT_TIMEOUT_SECONDS = 10;
    private static final int DEFAULT_MAX_ROWS = 1000;

    /**
     * 敏感字段自动脱敏正则 (匹配手机号、身份证、密码等)
     */
    private static final Pattern SENSITIVE_PHONE_PATTERN = Pattern.compile("(?i).*(phone|mobile|tel).*");
    private static final Pattern SENSITIVE_IDCARD_PATTERN = Pattern.compile("(?i).*(id_card|idcard|id_number|identity).*");
    private static final Pattern SENSITIVE_SECRET_PATTERN = Pattern.compile("(?i).*(password|passwd|secret|token).*");

    private OpenApiWarehouseExecutor() {
    }

    /**
     * 获取或初始化只读数据源连接
     */
    private static Connection getReadOnlyConnection(JobDatasource jobDatasource) throws SQLException {
        String cacheKey = "OPEN_API_READONLY_CONN_" + jobDatasource.getId();
        Object cachedConn = LocalCacheUtil.get(cacheKey);
        if (cachedConn instanceof Connection) {
            Connection conn = (Connection) cachedConn;
            try {
                if (conn.isValid(1000)) {
                    return conn;
                }
            } catch (Exception ignored) {
            }
            LocalCacheUtil.remove(cacheKey);
        }

        String username = AESUtil.decrypt(jobDatasource.getJdbcUsername());
        String password = AESUtil.decrypt(jobDatasource.getJdbcPassword());

        HikariDataSource ds = new HikariDataSource();
        ds.setUsername(username);
        ds.setPassword(password);
        ds.setJdbcUrl(jobDatasource.getJdbcUrl());
        ds.setDriverClassName(jobDatasource.getJdbcDriverClass());
        ds.setReadOnly(true);
        ds.setMaximumPoolSize(3);
        ds.setMinimumIdle(0);
        ds.setConnectionTimeout(10000);
        ds.setIdleTimeout(60000);
        ds.setMaxLifetime(300000);

        Connection connection = ds.getConnection();
        connection.setReadOnly(true);
        LocalCacheUtil.set(cacheKey, connection, 30 * 60 * 1000);
        return connection;
    }

    /**
     * 执行只读 SQL 并返回封装后的结构化数据
     *
     * @param datasource 数据源配置实体
     * @param domainCode 业务领域编码
     * @param sql 经过安全审计的 SELECT SQL
     * @param maxRows 客户端请求的行数 (上限 1000)
     * @return 查询结果 DTO
     * @throws Exception 业务或执行异常
     */
    public static OpenApiQueryResultDto executeQuery(JobDatasource datasource, String domainCode, String sql, Integer maxRows) throws Exception {
        long startTime = System.currentTimeMillis();
        Connection connection = getReadOnlyConnection(datasource);

        // 1. 跑批完成态门禁拦截
        checkBatchReadyGate(connection, domainCode);

        // 2. 限制最大拉取条数 (物理不可超过 1000)
        int effectiveLimit = DEFAULT_MAX_ROWS;
        if (maxRows != null && maxRows > 0 && maxRows < DEFAULT_MAX_ROWS) {
            effectiveLimit = maxRows;
        }

        OpenApiQueryResultDto resultDto = new OpenApiQueryResultDto();
        List<String> columnNames = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();

        try (Statement statement = connection.createStatement()) {
            // 物理 10 秒超时强杀
            statement.setQueryTimeout(DEFAULT_TIMEOUT_SECONDS);
            // 驱动层最大条数截断
            statement.setMaxRows(effectiveLimit);

            try (ResultSet rs = statement.executeQuery(sql)) {
                ResultSetMetaData metaData = rs.getMetaData();
                int columnCount = metaData.getColumnCount();
                for (int i = 1; i <= columnCount; i++) {
                    String colLabel = metaData.getColumnLabel(i);
                    columnNames.add(colLabel);
                }

                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= columnCount; i++) {
                        String colName = columnNames.get(i - 1);
                        Object val = rs.getObject(i);
                        // 数据动态脱敏
                        row.put(colName, maskSensitiveValue(colName, val));
                    }
                    rows.add(row);
                }
            }
        } catch (SQLException e) {
            logger.warn("[OpenApiWarehouseExecutor] SQL 执行失败: {}, SQL: {}", e.getMessage(), sql);
            throw new RuntimeException("SQL 查询执行失败: " + e.getMessage(), e);
        }

        resultDto.setColumns(columnNames);
        resultDto.setRows(rows);
        resultDto.setTotalRows(rows.size());
        resultDto.setCostMs(System.currentTimeMillis() - startTime);
        return resultDto;
    }

    /**
     * 数仓跑批就绪状态门禁校验
     * 如果数仓中建立了批次就绪状态表 (如 latest_ready_date)，检查今日批次是否计算完毕
     */
    public static void checkBatchReadyGate(Connection conn, String domainCode) {
        if (conn == null || StringUtils.isBlank(domainCode)) {
            return;
        }
        try (Statement stmt = conn.createStatement()) {
            stmt.setQueryTimeout(2);
            // 尝试探测是否存在 latest_ready_date 表
            try (ResultSet rs = stmt.executeQuery("SELECT status, stat_date FROM latest_ready_date WHERE domain_code = '" + domainCode.trim() + "' LIMIT 1")) {
                if (rs.next()) {
                    String status = rs.getString("status");
                    if ("RUNNING".equalsIgnoreCase(status) || "0".equals(status)) {
                        throw new SecurityException("数仓业务领域 [" + domainCode + "] 凌晨批次正在计算中，数据尚未就绪，暂未开放查询");
                    }
                }
            }
        } catch (SQLException ignored) {
            // 若底层不存在该状态表，视为未开启物理批次表门禁，放行
        }
    }

    /**
     * 敏感字段动态脱敏
     */
    private static Object maskSensitiveValue(String columnName, Object value) {
        if (value == null) {
            return null;
        }
        String str = String.valueOf(value);
        if (StringUtils.isBlank(str)) {
            return value;
        }

        // 手机号掩码：保留前3后4，中间4位掩码 (如 138****0000)
        if (SENSITIVE_PHONE_PATTERN.matcher(columnName).matches() && str.length() >= 11) {
            return str.replaceAll("(\\d{3})\\d{4}(\\d{4})", "$1****$2");
        }

        // 身份证掩码：保留前6后4 (如 110101********1234)
        if (SENSITIVE_IDCARD_PATTERN.matcher(columnName).matches() && str.length() >= 15) {
            return str.replaceAll("(\\d{6})\\d+(\\d{4})", "$1********$2");
        }

        // 密码/Token 全部掩码
        if (SENSITIVE_SECRET_PATTERN.matcher(columnName).matches()) {
            return "******";
        }

        return value;
    }
}
