package com.wugui.datax.admin.tool.meta.converter;

import com.wugui.datax.admin.util.JdbcConstants;
import org.junit.Assert;
import org.junit.Test;

/**
 * 跨数据库类型转换器单元测试
 *
 * @author ypc
 */
public class DataTypeConverterTest {

    @Test
    public void testMySQLToClickHouse() {
        DataTypeConverter converter = DataTypeConverterFactory.getConverter(JdbcConstants.MYSQL, JdbcConstants.CLICKHOUSE);
        Assert.assertEquals("String", converter.convert("varchar(64)"));
        Assert.assertEquals("Int32", converter.convert("int(11)"));
        Assert.assertEquals("Int64", converter.convert("bigint(20) unsigned"));
        Assert.assertEquals("Decimal(10,2)", converter.convert("decimal(10,2)"));
        Assert.assertEquals("DateTime", converter.convert("datetime"));
        Assert.assertEquals("Date", converter.convert("date"));
    }

    @Test
    public void testMySQLToOracle() {
        DataTypeConverter converter = DataTypeConverterFactory.getConverter(JdbcConstants.MYSQL, JdbcConstants.ORACLE);
        Assert.assertEquals("VARCHAR2(64)", converter.convert("varchar(64)"));
        Assert.assertEquals("NUMBER(10)", converter.convert("int(11)"));
        Assert.assertEquals("NUMBER(19)", converter.convert("bigint(20)"));
        Assert.assertEquals("NUMBER(10,2)", converter.convert("decimal(10,2)"));
        Assert.assertEquals("TIMESTAMP", converter.convert("datetime"));
        Assert.assertEquals("CLOB", converter.convert("text"));
    }

    @Test
    public void testMySQLToPostgresql() {
        DataTypeConverter converter = DataTypeConverterFactory.getConverter(JdbcConstants.MYSQL, JdbcConstants.POSTGRESQL);
        Assert.assertEquals("VARCHAR(64)", converter.convert("varchar(64)"));
        Assert.assertEquals("INT4", converter.convert("int(11)"));
        Assert.assertEquals("INT8", converter.convert("bigint(20)"));
        Assert.assertEquals("NUMERIC(10,2)", converter.convert("decimal(10,2)"));
        Assert.assertEquals("TEXT", converter.convert("text"));
    }

    @Test
    public void testMySQLToDoris() {
        DataTypeConverter converter = DataTypeConverterFactory.getConverter(JdbcConstants.MYSQL, "doris");
        Assert.assertEquals("VARCHAR(64)", converter.convert("varchar(64)"));
        Assert.assertEquals("INT", converter.convert("int(11)"));
        Assert.assertEquals("BIGINT", converter.convert("bigint(20)"));
        Assert.assertEquals("DECIMAL(10,2)", converter.convert("decimal(10,2)"));
        Assert.assertEquals("DATETIME", converter.convert("datetime"));
    }

    @Test
    public void testMySQLToHive() {
        DataTypeConverter converter = DataTypeConverterFactory.getConverter(JdbcConstants.MYSQL, JdbcConstants.HIVE);
        Assert.assertEquals("STRING", converter.convert("varchar(64)"));
        Assert.assertEquals("INT", converter.convert("int(11)"));
        Assert.assertEquals("BIGINT", converter.convert("bigint(20)"));
        Assert.assertEquals("TIMESTAMP", converter.convert("datetime"));
    }
}
