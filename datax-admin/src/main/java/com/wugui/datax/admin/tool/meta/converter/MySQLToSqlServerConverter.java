package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

/**
 * 转换器：MySQL -> SQL Server 类型映射
 *
 * @author ypc
 */
public class MySQLToSqlServerConverter extends BaseDataTypeConverter {

    @Override
    public String getTargetDbType() {
        return JdbcConstants.SQL_SERVER;
    }

    @Override
    public String convert(String sourceColumnType) {
        if (StringUtils.isBlank(sourceColumnType)) {
            return "NVARCHAR(255)";
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
                return "REAL";
            case "DOUBLE":
            case "REAL":
                return "FLOAT";
            case "DECIMAL":
            case "NUMERIC":
                return StringUtils.isNotBlank(param) ? "DECIMAL" + param : "DECIMAL(18, 4)";
            case "DATE":
                return "DATE";
            case "DATETIME":
            case "TIMESTAMP":
                return "DATETIME2";
            case "CHAR":
                return StringUtils.isNotBlank(param) ? "NCHAR" + param : "NCHAR(1)";
            case "VARCHAR":
                return StringUtils.isNotBlank(param) ? "NVARCHAR" + param : "NVARCHAR(255)";
            case "TINYTEXT":
            case "TEXT":
            case "MEDIUMTEXT":
            case "LONGTEXT":
            case "JSON":
                return "NVARCHAR(MAX)";
            case "TINYBLOB":
            case "BLOB":
            case "MEDIUMBLOB":
            case "LONGBLOB":
            case "BINARY":
            case "VARBINARY":
                return "VARBINARY(MAX)";
            case "BIT":
            case "BOOLEAN":
            case "BOOL":
                return "BIT";
            default:
                return "NVARCHAR(255)";
        }
    }
}
