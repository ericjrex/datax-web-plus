package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

/**
 * 转换器：MySQL -> ClickHouse 类型映射
 *
 * @author ypc
 */
public class MySQLToClickHouseConverter extends BaseDataTypeConverter {

    @Override
    public String getTargetDbType() {
        return JdbcConstants.CLICKHOUSE;
    }

    @Override
    public String convert(String sourceColumnType) {
        if (StringUtils.isBlank(sourceColumnType)) {
            return "String";
        }
        String baseType = extractBaseType(sourceColumnType);
        String param = extractTypeParam(sourceColumnType);

        switch (baseType) {
            case "TINYINT":
                return "Int8";
            case "SMALLINT":
                return "Int16";
            case "MEDIUMINT":
            case "INT":
            case "INTEGER":
                return "Int32";
            case "BIGINT":
                return "Int64";
            case "FLOAT":
                return "Float32";
            case "DOUBLE":
            case "REAL":
                return "Float64";
            case "DECIMAL":
            case "NUMERIC":
                return StringUtils.isNotBlank(param) ? "Decimal" + param : "Decimal(18, 4)";
            case "DATE":
            case "YEAR":
                return "Date";
            case "DATETIME":
            case "TIMESTAMP":
                return "DateTime";
            case "CHAR":
            case "VARCHAR":
            case "TINYTEXT":
            case "TEXT":
            case "MEDIUMTEXT":
            case "LONGTEXT":
            case "JSON":
            case "ENUM":
            case "SET":
                return "String";
            case "BINARY":
            case "VARBINARY":
            case "TINYBLOB":
            case "BLOB":
            case "MEDIUMBLOB":
            case "LONGBLOB":
                return "String";
            case "BIT":
            case "BOOLEAN":
            case "BOOL":
                return "UInt8";
            default:
                return "String";
        }
    }
}
