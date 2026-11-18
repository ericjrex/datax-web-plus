package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

/**
 * 转换器：MySQL -> PostgreSQL 类型映射
 *
 * @author ypc
 */
public class MySQLToPostgresqlConverter extends BaseDataTypeConverter {

    @Override
    public String getTargetDbType() {
        return JdbcConstants.POSTGRESQL;
    }

    @Override
    public String convert(String sourceColumnType) {
        if (StringUtils.isBlank(sourceColumnType)) {
            return "VARCHAR(255)";
        }
        String baseType = extractBaseType(sourceColumnType);
        String param = extractTypeParam(sourceColumnType);

        switch (baseType) {
            case "TINYINT":
            case "SMALLINT":
                return "INT2";
            case "MEDIUMINT":
            case "INT":
            case "INTEGER":
                return "INT4";
            case "BIGINT":
                return "INT8";
            case "FLOAT":
                return "FLOAT4";
            case "DOUBLE":
            case "REAL":
                return "FLOAT8";
            case "DECIMAL":
            case "NUMERIC":
                return StringUtils.isNotBlank(param) ? "NUMERIC" + param : "NUMERIC(18, 4)";
            case "DATE":
            case "YEAR":
                return "DATE";
            case "DATETIME":
            case "TIMESTAMP":
                return "TIMESTAMP";
            case "CHAR":
                return StringUtils.isNotBlank(param) ? "CHAR" + param : "CHAR(1)";
            case "VARCHAR":
                return StringUtils.isNotBlank(param) ? "VARCHAR" + param : "VARCHAR(255)";
            case "TINYTEXT":
            case "TEXT":
            case "MEDIUMTEXT":
            case "LONGTEXT":
            case "JSON":
                return "TEXT";
            case "TINYBLOB":
            case "BLOB":
            case "MEDIUMBLOB":
            case "LONGBLOB":
            case "BINARY":
            case "VARBINARY":
                return "BYTEA";
            case "BIT":
            case "BOOLEAN":
            case "BOOL":
                return "BOOLEAN";
            default:
                return "VARCHAR(255)";
        }
    }
}
