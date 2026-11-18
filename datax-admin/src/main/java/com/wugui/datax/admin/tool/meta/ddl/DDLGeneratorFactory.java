package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 目标库 DDL 生成器工厂类
 *
 * @author ypc
 */
public class DDLGeneratorFactory {

    private static final Map<String, BaseDDLGenerator> GENERATOR_CACHE = new ConcurrentHashMap<>();

    static {
        GENERATOR_CACHE.put(JdbcConstants.MYSQL, new MySQLDDLGenerator());
        GENERATOR_CACHE.put(JdbcConstants.CLICKHOUSE, new ClickHouseDDLGenerator());
        GENERATOR_CACHE.put(JdbcConstants.ORACLE, new OracleDDLGenerator());
        GENERATOR_CACHE.put(JdbcConstants.POSTGRESQL, new PostgresqlDDLGenerator());
        GENERATOR_CACHE.put(JdbcConstants.HIVE, new HiveDDLGenerator());
        GENERATOR_CACHE.put(JdbcConstants.SQL_SERVER, new SqlServerDDLGenerator());
        GENERATOR_CACHE.put("doris", new DorisDDLGenerator());
        GENERATOR_CACHE.put("starrocks", new DorisDDLGenerator());
    }

    private DDLGeneratorFactory() {
    }

    /**
     * 根据数据库类型获取对应的 DDL 生成器
     *
     * @param dbType 数据库类型标识（如 mysql, clickhouse, oracle, postgresql, doris 等）
     * @return 对应的 BaseDDLGenerator，若未匹配则默认返回 MySQLDDLGenerator
     */
    public static BaseDDLGenerator getGenerator(String dbType) {
        if (StringUtils.isBlank(dbType)) {
            return new MySQLDDLGenerator();
        }
        String key = dbType.trim().toLowerCase();
        BaseDDLGenerator generator = GENERATOR_CACHE.get(key);
        if (generator != null) {
            return generator;
        }
        return new MySQLDDLGenerator();
    }
}
