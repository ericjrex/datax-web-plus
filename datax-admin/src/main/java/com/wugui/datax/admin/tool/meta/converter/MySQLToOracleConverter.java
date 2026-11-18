package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

/**
 * 转换器：MySQL -> Oracle 类型映射
 *
 * @author ypc
 */
public class MySQLToOracleConverter extends BaseDataTypeConverter {

    @Override
    public String getTargetDbType() {
        return JdbcConstants.ORACLE;
    }

    @Override
    public String convert(String sourceColumnType) {
        if (StringUtils.isBlank(sourceColumnType)) {
            return "VARCHAR2(255)";
        }
        String baseType = extractBaseType(sourceColumnType);
        String param = extractTypeParam(sourceColumnType);

        switch (baseType) {
            case "TINYINT":
                return "NUMBER(3)";
            case "SMALLINT":
                return "NUMBER(5)";
            case "MEDIUMINT":
                return "NUMBER(7)";
            case "INT":
            case "INTEGER":
                return "NUMBER(10)";
            case "BIGINT":
                return "NUMBER(19)";
            case "FLOAT":
            case "DOUBLE":
            case "REAL":
                return "FLOAT";
            case "DECIMAL":
            case "NUMERIC":
                return StringUtils.isNotBlank(param) ? "NUMBER" + param : "NUMBER(18, 4)";
            case "DATE":
            case "YEAR":
                return "DATE";
            case "DATETIME":
            case "TIMESTAMP":
                return "TIMESTAMP";
            case "CHAR":
                return StringUtils.isNotBlank(param) ? "CHAR" + param : "CHAR(1)";
            case "VARCHAR":
                return StringUtils.isNotBlank(param) ? "VARCHAR2" + param : "VARCHAR2(255)";
            case "TINYTEXT":
            case "TEXT":
            case "MEDIUMTEXT":
            case "LONGTEXT":
            case "JSON":
                return "CLOB";
            case "TINYBLOB":
            case "BLOB":
            case "MEDIUMBLOB":
            case "LONGBLOB":
            case "BINARY":
            case "VARBINARY":
                return "BLOB";
            case "BIT":
            case "BOOLEAN":
            case "BOOL":
                return "NUMBER(1)";
            default:
                return "VARCHAR2(255)";
        }
    }
}
