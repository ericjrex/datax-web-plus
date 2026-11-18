package com.wugui.datax.admin.tool.meta.converter;

/**
 * 跨数据库字段数据类型转换器接口
 *
 * @author ypc
 */
public interface DataTypeConverter {

    /**
     * 将源端数据库的字段类型转换为目标端数据库对应的字段类型
     *
     * @param sourceColumnType 源字段类型（如 VARCHAR(64)、BIGINT、DATETIME 等）
     * @return 目标端字段类型（如 String、Int64、DateTime 等）
     */
    String convert(String sourceColumnType);

    /**
     * 获取支持的目标数据库类型
     *
     * @return 目标数据库标识
     */
    String getTargetDbType();
}
