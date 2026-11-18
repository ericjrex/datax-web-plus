package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

/**
 * 转换器：MySQL -> Hive 类型映射
 *
 * @author ypc
 */
public class MySQLToHiveConverter extends BaseDataTypeConverter {

    @Override
    public String getTargetDbType() {
        return JdbcConstants.HIVE;
    }

    @Override
    public String convert(String sourceColumnType) {
        if (StringUtils.isBlank(sourceColumnType)) {
            return "STRING";
        }
        String baseType = extractBaseType(sourceColumnType);
        String param = extractTypeParam(sourceColumnType);

        switch (baseType) {
            case "TINYINT":
                return "TINYINT";
            case "SMALLINT":
                return "SMALLINT";
            case "MEDIUMINT":
            case "INT":
            case "INTEGER":
                return "INT";
            case "BIGINT":
                return "BIGINT";
            case "FLOAT":
                return "FLOAT";
            case "DOUBLE":
            case "REAL":
                return "DOUBLE";
            case "DECIMAL":
            case "NUMERIC":
                return StringUtils.isNotBlank(param) ? "DECIMAL" + param : "DECIMAL(18, 4)";
            case "DATE":
                return "DATE";
            case "DATETIME":
            case "TIMESTAMP":
                return "TIMESTAMP";
            case "CHAR":
            case "VARCHAR":
            case "TINYTEXT":
            case "TEXT":
            case "MEDIUMTEXT":
            case "LONGTEXT":
            case "JSON":
                return "STRING";
            case "BINARY":
            case "VARBINARY":
            case "BLOB":
                return "BINARY";
            case "BIT":
            case "BOOLEAN":
            case "BOOL":
                return "BOOLEAN";
            default:
                return "STRING";
        }
    }
}
