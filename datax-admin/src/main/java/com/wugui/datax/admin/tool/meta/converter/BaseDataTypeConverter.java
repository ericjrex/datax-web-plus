package com.wugui.datax.admin.tool.meta.converter;

import org.apache.commons.lang3.StringUtils;

/**
 * 抽象数据类型转换基类
 *
 * @author ypc
 */
public abstract class BaseDataTypeConverter implements DataTypeConverter {

    /**
     * 提取基础数据类型名称（大写，去除长度、括号、UNSIGNED等修饰词）
     * 例如：varchar(64) -> VARCHAR, int(11) unsigned -> INT, decimal(10,2) -> DECIMAL
     *
     * @param fullType 完整类型字符串
     * @return 基础类型名
     */
    protected String extractBaseType(String fullType) {
        if (StringUtils.isBlank(fullType)) {
            return "";
        }
        String cleanType = fullType.trim().toUpperCase();
        int parenIndex = cleanType.indexOf('(');
        if (parenIndex > 0) {
            cleanType = cleanType.substring(0, parenIndex).trim();
        }
        // 去除 UNSIGNED / ZEROFILL 等修饰
        int spaceIndex = cleanType.indexOf(' ');
        if (spaceIndex > 0) {
            cleanType = cleanType.substring(0, spaceIndex).trim();
        }
        return cleanType;
    }

    /**
     * 提取类型括号中的参数（如长度、精度）
     * 例如：decimal(10,2) -> (10,2), varchar(255) -> (255)
     *
     * @param fullType 完整类型字符串
     * @return 参数字符串，如 "(10,2)"，若无则返回空字符串 ""
     */
    protected String extractTypeParam(String fullType) {
        if (StringUtils.isBlank(fullType)) {
            return "";
        }
        int start = fullType.indexOf('(');
        int end = fullType.lastIndexOf(')');
        if (start >= 0 && end > start) {
            return fullType.substring(start, end + 1).trim();
        }
        return "";
    }
}
