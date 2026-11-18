package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

/**
 * 转换器：MySQL -> Doris / StarRocks 类型映射
 *
 * @author ypc
 */
public class MySQLToDorisConverter extends BaseDataTypeConverter {

    @Override
    public String getTargetDbType() {
        return "doris";
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
            case "YEAR":
                return "DATE";
            case "DATETIME":
            case "TIMESTAMP":
                return "DATETIME";
            case "CHAR":
                return StringUtils.isNotBlank(param) ? "CHAR" + param : "CHAR(1)";
            case "VARCHAR":
                return StringUtils.isNotBlank(param) ? "VARCHAR" + param : "VARCHAR(255)";
            case "TINYTEXT":
            case "TEXT":
            case "MEDIUMTEXT":
            case "LONGTEXT":
            case "JSON":
                return "STRING";
            case "BIT":
            case "BOOLEAN":
            case "BOOL":
                return "BOOLEAN";
            default:
                return "VARCHAR(255)";
        }
    }
}
