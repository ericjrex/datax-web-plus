package com.wugui.datax.admin.tool.meta.ddl;

import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.junit.Assert;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * 目标库建表 DDL 生成器单元测试
 *
 * @author ypc
 */
public class DDLGeneratorTest {

    private List<ColumnMappingDto> mockColumns() {
        List<ColumnMappingDto> cols = new ArrayList<>();

        ColumnMappingDto col1 = new ColumnMappingDto();
        col1.setReaderColumn("user_id");
        col1.setReaderType("BIGINT");
        col1.setWriterColumn("user_id");
        col1.setWriterType("BIGINT");
        col1.setWriterComment("用户ID");
        col1.setIsPrimaryKey(true);
        col1.setIsNullable(0);
        cols.add(col1);

        ColumnMappingDto col2 = new ColumnMappingDto();
        col2.setReaderColumn("user_name");
        col2.setReaderType("VARCHAR(64)");
        col2.setWriterColumn("user_name");
        col2.setWriterType("VARCHAR(64)");
        col2.setWriterComment("用户姓名");
        col2.setIsPrimaryKey(false);
        col2.setIsNullable(1);
        cols.add(col2);

        return cols;
    }

    @Test
    public void testMySQLDDL() {
        BaseDDLGenerator generator = DDLGeneratorFactory.getGenerator(JdbcConstants.MYSQL);
        String ddl = generator.generateCreateTableDDL("ods_sys_user_df", "用户表", mockColumns());
        Assert.assertTrue(ddl.contains("CREATE TABLE IF NOT EXISTS `ods_sys_user_df`"));
        Assert.assertTrue(ddl.contains("PRIMARY KEY (`user_id`)"));
        Assert.assertTrue(ddl.contains("COMMENT='用户表'"));
    }

    @Test
    public void testClickHouseDDL() {
        BaseDDLGenerator generator = DDLGeneratorFactory.getGenerator(JdbcConstants.CLICKHOUSE);
        List<ColumnMappingDto> cols = mockColumns();
        cols.get(0).setWriterType("Int64");
        cols.get(1).setWriterType("String");

        String ddl = generator.generateCreateTableDDL("ods_sys_user_df", "用户表", cols);
        Assert.assertTrue(ddl.contains("CREATE TABLE IF NOT EXISTS `ods_sys_user_df`"));
        Assert.assertTrue(ddl.contains("ENGINE = MergeTree()"));
        Assert.assertTrue(ddl.contains("ORDER BY (`user_id`)"));
    }

    @Test
    public void testOracleDDL() {
        BaseDDLGenerator generator = DDLGeneratorFactory.getGenerator(JdbcConstants.ORACLE);
        List<ColumnMappingDto> cols = mockColumns();
        cols.get(0).setWriterType("NUMBER(19)");
        cols.get(1).setWriterType("VARCHAR2(64)");

        String ddl = generator.generateCreateTableDDL("ODS_SYS_USER_DF", "用户表", cols);
        Assert.assertTrue(ddl.contains("CREATE TABLE \"ODS_SYS_USER_DF\""));
        Assert.assertTrue(ddl.contains("CONSTRAINT \"PK_ODS_SYS_USER_DF\" PRIMARY KEY (\"USER_ID\")"));
    }

    @Test
    public void testPostgresqlDDL() {
        BaseDDLGenerator generator = DDLGeneratorFactory.getGenerator(JdbcConstants.POSTGRESQL);
        List<ColumnMappingDto> cols = mockColumns();
        cols.get(0).setWriterType("INT8");
        cols.get(1).setWriterType("VARCHAR(64)");

        String ddl = generator.generateCreateTableDDL("ods_sys_user_df", "用户表", cols);
        Assert.assertTrue(ddl.contains("CREATE TABLE IF NOT EXISTS \"ods_sys_user_df\""));
        Assert.assertTrue(ddl.contains("PRIMARY KEY (\"user_id\")"));
    }
}
