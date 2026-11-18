package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 跨数据库类型转换器工厂类
 *
 * @author ypc
 */
public class DataTypeConverterFactory {

    private static final Map<String, DataTypeConverter> CONVERTER_CACHE = new ConcurrentHashMap<>();

    static {
        CONVERTER_CACHE.put(JdbcConstants.CLICKHOUSE, new MySQLToClickHouseConverter());
        CONVERTER_CACHE.put(JdbcConstants.ORACLE, new MySQLToOracleConverter());
        CONVERTER_CACHE.put(JdbcConstants.POSTGRESQL, new MySQLToPostgresqlConverter());
        CONVERTER_CACHE.put(JdbcConstants.HIVE, new MySQLToHiveConverter());
        CONVERTER_CACHE.put(JdbcConstants.SQL_SERVER, new MySQLToSqlServerConverter());
        CONVERTER_CACHE.put("doris", new MySQLToDorisConverter());
        CONVERTER_CACHE.put("starrocks", new MySQLToDorisConverter());
    }

    private DataTypeConverterFactory() {
    }

    /**
     * 根据源数据库与目标数据库类型获取类型转换器
     *
     * @param sourceDbType 源数据库类型（如 mysql）
     * @param targetDbType 目标数据库类型（如 clickhouse、oracle、postgresql）
     * @return 对应的 DataTypeConverter
     */
    public static DataTypeConverter getConverter(String sourceDbType, String targetDbType) {
        if (StringUtils.isBlank(targetDbType)) {
            return new DefaultDataTypeConverter(targetDbType);
        }
        String srcKey = StringUtils.isNotBlank(sourceDbType) ? sourceDbType.trim().toLowerCase() : "";
        String tgtKey = targetDbType.trim().toLowerCase();

        // 同库同步或同协议库（如 doris <-> starrocks）直通保留原始完整类型
        if (isSameDialectFamily(srcKey, tgtKey)) {
            return new DataTypeConverter() {
                @Override
                public String convert(String sourceColumnType) {
                    return StringUtils.isNotBlank(sourceColumnType) ? sourceColumnType.trim() : "";
                }

                @Override
                public String getTargetDbType() {
                    return targetDbType;
                }
            };
        }

        DataTypeConverter targetConverter = CONVERTER_CACHE.get(tgtKey);
        if (targetConverter == null) {
            targetConverter = new DefaultDataTypeConverter(targetDbType);
        }

        // 非 MySQL 源库先将源类型归一化为通用中间类型，再执行目标端转换
        if (StringUtils.isNotBlank(srcKey) && !JdbcConstants.MYSQL.equals(srcKey) && !"mariadb".equals(srcKey)) {
            final DataTypeConverter delegate = targetConverter;
            return new DataTypeConverter() {
                @Override
                public String convert(String sourceColumnType) {
                    return delegate.convert(normalizeNonMysqlSourceType(srcKey, sourceColumnType));
                }

                @Override
                public String getTargetDbType() {
                    return delegate.getTargetDbType();
                }
            };
        }
        return targetConverter;
    }

    private static boolean isSameDialectFamily(String srcKey, String tgtKey) {
        if (StringUtils.isBlank(srcKey)) {
            return false;
        }
        if (srcKey.equals(tgtKey)) {
            return true;
        }
        return ("doris".equals(srcKey) || "starrocks".equals(srcKey))
                && ("doris".equals(tgtKey) || "starrocks".equals(tgtKey));
    }

    /**
     * 将 Oracle / PostgreSQL / SQL Server / Hive / ClickHouse 等源库类型归一化为通用中间类型
     */
    private static String normalizeNonMysqlSourceType(String srcKey, String rawType) {
        if (StringUtils.isBlank(rawType)) {
            return "varchar(255)";
        }
        String trimmed = rawType.trim();
        if (trimmed.startsWith("Nullable(") && trimmed.endsWith(")")) {
            trimmed = trimmed.substring("Nullable(".length(), trimmed.length() - 1).trim();
        }
        String lower = trimmed.toLowerCase();
        String base = lower.contains("(") ? lower.substring(0, lower.indexOf('(')).trim() : lower;
        String args = lower.contains("(") ? lower.substring(lower.indexOf('(')) : "";

        if ("varchar2".equals(base) || "nvarchar2".equals(base) || "character varying".equals(base) || "nvarchar".equals(base)) {
            return "varchar" + args;
        }
        if ("nchar".equals(base) || "character".equals(base)) {
            return "char" + args;
        }
        if ("clob".equals(base) || "nclob".equals(base)) {
            return "longtext";
        }
        if ("number".equals(base) || "numeric".equals(base)) {
            if (StringUtils.isBlank(args)) {
                return "decimal(18,4)";
            }
            if (!args.contains(",")) {
                String pStr = args.replaceAll("[^0-9]", "");
                int p = StringUtils.isNotBlank(pStr) ? Integer.parseInt(pStr) : 10;
                return p > 9 ? "bigint" : "int";
            }
            if (args.matches("\\(\\s*\\d+\\s*,\\s*0\\s*\\)")) {
                String pStr = args.substring(1, args.indexOf(',')).trim();
                int p = Integer.parseInt(pStr);
                return p > 9 ? "bigint" : "int";
            }
            return "decimal" + args;
        }
        if ("int4".equals(base) || "integer".equals(base) || "int32".equals(base) || "serial".equals(base)) {
            return "int";
        }
        if ("int8".equals(base) || "int64".equals(base) || "bigserial".equals(base)) {
            return "bigint";
        }
        if ("int2".equals(base) || "int16".equals(base)) {
            return "smallint";
        }
        if ("int8".equals(base) || "uint8".equals(base)) {
            return "tinyint";
        }
        if ("float4".equals(base) || "float32".equals(base) || "binary_float".equals(base)) {
            return "float";
        }
        if ("float8".equals(base) || "float64".equals(base) || "binary_double".equals(base)) {
            return "double";
        }
        if ("timestamptz".equals(base) || "datetime2".equals(base) || "datetime64".equals(base)) {
            return "datetime";
        }
        if ("string".equals(base)) {
            return "varchar(500)";
        }
        if ("bool".equals(base) || "boolean".equals(base) || "bit".equals(base)) {
            return "tinyint(1)";
        }
        return trimmed;
    }
}
