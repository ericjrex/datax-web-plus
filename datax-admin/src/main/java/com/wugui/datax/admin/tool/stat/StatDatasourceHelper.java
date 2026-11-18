package com.wugui.datax.admin.tool.stat;

import com.wugui.datax.admin.core.util.LocalCacheUtil;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.util.AESUtil;
import com.wugui.datax.admin.util.JdbcConstants;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * 统计任务数据源连接与方言辅助工具类
 *
 * @author ypc
 */
public class StatDatasourceHelper {

    private static final Logger logger = LoggerFactory.getLogger(StatDatasourceHelper.class);

    /**
     * 获取数据源可用的 JDBC 连接 (带连接池缓存)
     *
     * @param datasource 数据源配置对象
     * @return 数据库连接
     * @throws SQLException 连接异常
     */
    public static Connection getConnection(JobDatasource datasource) throws SQLException {
        if (datasource == null) {
            throw new IllegalArgumentException("数据源配置对象不能为空");
        }

        String cacheKey = "STAT_TASK_DS_POOL_" + datasource.getId();
        Object cachedPool = LocalCacheUtil.get(cacheKey);
        if (cachedPool instanceof HikariDataSource) {
            HikariDataSource ds = (HikariDataSource) cachedPool;
            if (!ds.isClosed()) {
                return ds.getConnection();
            }
            LocalCacheUtil.remove(cacheKey);
        }

        String username = AESUtil.decrypt(datasource.getJdbcUsername());
        String password = AESUtil.decrypt(datasource.getJdbcPassword());

        HikariDataSource ds = new HikariDataSource();
        ds.setUsername(username);
        ds.setPassword(password);
        ds.setJdbcUrl(datasource.getJdbcUrl());
        ds.setDriverClassName(datasource.getJdbcDriverClass());
        ds.setMaximumPoolSize(5);
        ds.setMinimumIdle(1);
        ds.setConnectionTimeout(15000);
        ds.setIdleTimeout(60000);
        ds.setMaxLifetime(300000);
        ds.setPoolName("StatTaskPool_" + datasource.getId());

        LocalCacheUtil.set(cacheKey, ds, 30 * 60 * 1000);
        return ds.getConnection();
    }

    /**
     * 根据数据源类型为表名或列名添加安全反引号或双引号包裹
     *
     * @param dbType 数据库类型 (如 MYSQL, POSTGRESQL, ORACLE)
     * @param identifier 标识符
     * @return 包裹后的安全标识符
     */
    public static String quoteIdentifier(String dbType, String identifier) {
        if (StringUtils.isBlank(identifier)) {
            return "";
        }
        if (JdbcConstants.POSTGRESQL.equalsIgnoreCase(dbType) || JdbcConstants.ORACLE.equalsIgnoreCase(dbType)) {
            return "\"" + identifier + "\"";
        } else if (JdbcConstants.SQL_SERVER.equalsIgnoreCase(dbType)) {
            return "[" + identifier + "]";
        }
        return "`" + identifier + "`";
    }

    /**
     * 将通用 Java 类型或 SQL 类型转换为对应数据库方言的建表列类型
     *
     * @param dbType 数据库类型
     * @param genericType 通用类型 (如 VARCHAR, BIGINT, DECIMAL, DATETIME)
     * @return 数据库方言列定义
     */
    public static String mapColumnTypeToDialect(String dbType, String genericType) {
        String upper = StringUtils.isNotBlank(genericType) ? genericType.toUpperCase() : "VARCHAR";

        boolean isPg = JdbcConstants.POSTGRESQL.equalsIgnoreCase(dbType);
        boolean isOracle = JdbcConstants.ORACLE.equalsIgnoreCase(dbType);

        if (upper.contains("INT") || upper.equals("LONG") || upper.equals("BIGINT")) {
            if (isPg) return "BIGINT";
            if (isOracle) return "NUMBER(19)";
            return "BIGINT";
        } else if (upper.contains("DECIMAL") || upper.contains("NUMERIC") || upper.contains("DOUBLE") || upper.contains("FLOAT")) {
            if (isPg) return "NUMERIC(18, 4)";
            if (isOracle) return "NUMBER(18, 4)";
            return "DECIMAL(18, 4)";
        } else if (upper.contains("TIME") || upper.contains("DATE")) {
            if (isPg) return "TIMESTAMP";
            if (isOracle) return "TIMESTAMP";
            return "DATETIME";
        } else if (upper.contains("TEXT")) {
            if (isPg) return "TEXT";
            if (isOracle) return "CLOB";
            return "TEXT";
        } else {
            if (isOracle) return "VARCHAR2(255)";
            return "VARCHAR(255)";
        }
    }
}
