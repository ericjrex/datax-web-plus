package com.wugui.datax.admin.tool.meta.converter;

import org.apache.commons.lang3.StringUtils;

/**
 * 默认/同构数据类型转换器（保留原类型或做通用清洗）
 *
 * @author ypc
 */
public class DefaultDataTypeConverter extends BaseDataTypeConverter {

    private final String targetDbType;

    public DefaultDataTypeConverter(String targetDbType) {
        this.targetDbType = targetDbType;
    }

    @Override
    public String getTargetDbType() {
        return targetDbType;
    }

    @Override
    public String convert(String sourceColumnType) {
        if (StringUtils.isBlank(sourceColumnType)) {
            return "VARCHAR(255)";
        }
        String type = sourceColumnType.trim();
        String upper = type.toUpperCase();
        if ("VARCHAR".equals(upper)) {
            return "VARCHAR(255)";
        }
        if ("CHAR".equals(upper)) {
            return "CHAR(255)";
        }
        if ("DECIMAL".equals(upper)) {
            return "DECIMAL(18, 4)";
        }
        if ("NUMERIC".equals(upper)) {
            return "NUMERIC(18, 4)";
        }
        return type;
    }
}
