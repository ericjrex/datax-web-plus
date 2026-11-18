package com.wugui.datax.admin.tool;

import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.dto.SchemaDriftItemDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.dto.TableSchemaSnapshotDto;
import com.wugui.datax.admin.service.impl.SchemaDriftServiceImpl;
import com.wugui.datax.admin.tool.meta.converter.SchemaTypeCompareUtil;
import com.wugui.datax.admin.tool.meta.ddl.BaseDDLGenerator;
import com.wugui.datax.admin.tool.meta.ddl.DDLGeneratorFactory;
import com.wugui.datax.admin.tool.query.TableDataQueryTool;
import com.wugui.datax.admin.util.JdbcConstants;
import org.junit.Assert;
import org.junit.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 元数据漂移增强功能单元测试 (8库DDL、类型精度比对、三方演进探测)
 *
 * @author ypc
 */
public class SchemaDriftEnhancementTest {

    @Test
    public void testHiveDescFormattedCommentAndFullType() {
        List<String[]> lines = Arrays.asList(
                new String[]{"# Detailed Table Information", null, null},
                new String[]{"Database:", "default", null},
                new String[]{"Table Parameters:", null, null},
                new String[]{"", "comment", "订单明细表"},
                new String[]{"", "transient_lastDdlTime", "1700000000"}
        );
        Assert.assertEquals("订单明细表", TableDataQueryTool.parseHiveDescFormattedComment(lines));
        Assert.assertEquals("varchar(128)", TableDataQueryTool.formatFullColumnType("varchar", 128, null, JdbcConstants.MYSQL));
        Assert.assertEquals("decimal(18,4)", TableDataQueryTool.formatFullColumnType("decimal", 18, 4, JdbcConstants.MYSQL));
        Assert.assertEquals("bigint", TableDataQueryTool.formatFullColumnType("bigint", 19, 0, JdbcConstants.MYSQL));
    }

    @Test
    public void testSchemaTypeCompareUtil() {
        // 同库整型显示宽度等价
        SchemaTypeCompareUtil.TypeCompareResult intEq =
                SchemaTypeCompareUtil.compareTypes("int(11)", JdbcConstants.MYSQL, "int", JdbcConstants.MYSQL);
        Assert.assertFalse(intEq.isChanged());
        Assert.assertEquals("NONE", intEq.getRiskLevel());

        // 同库无损放宽
        SchemaTypeCompareUtil.TypeCompareResult widenVarchar =
                SchemaTypeCompareUtil.compareTypes("varchar(200)", JdbcConstants.MYSQL, "varchar(50)", JdbcConstants.MYSQL);
        Assert.assertTrue(widenVarchar.isChanged());
        Assert.assertEquals("WIDENING", widenVarchar.getRiskLevel());

        SchemaTypeCompareUtil.TypeCompareResult widenDecimal =
                SchemaTypeCompareUtil.compareTypes("decimal(12,4)", JdbcConstants.MYSQL, "decimal(10,2)", JdbcConstants.MYSQL);
        Assert.assertTrue(widenDecimal.isChanged());
        Assert.assertEquals("WIDENING", widenDecimal.getRiskLevel());

        // 同库高危收缩或不兼容变更
        SchemaTypeCompareUtil.TypeCompareResult shrinkVarchar =
                SchemaTypeCompareUtil.compareTypes("varchar(50)", JdbcConstants.MYSQL, "varchar(200)", JdbcConstants.MYSQL);
        Assert.assertTrue(shrinkVarchar.isChanged());
        Assert.assertEquals("BREAKING", shrinkVarchar.getRiskLevel());

        SchemaTypeCompareUtil.TypeCompareResult incompatible =
                SchemaTypeCompareUtil.compareTypes("int", JdbcConstants.MYSQL, "varchar(64)", JdbcConstants.MYSQL);
        Assert.assertTrue(incompatible.isChanged());
        Assert.assertEquals("BREAKING", incompatible.getRiskLevel());

        // 跨库同语义等价 (MySQL -> Hive)
        SchemaTypeCompareUtil.TypeCompareResult mysqlToHive =
                SchemaTypeCompareUtil.compareTypes("varchar(100)", JdbcConstants.MYSQL, "string", JdbcConstants.HIVE);
        Assert.assertFalse(mysqlToHive.isChanged());

        // 跨库放宽 (Oracle NUMBER(10,2) -> Doris DECIMAL(18,4))
        SchemaTypeCompareUtil.TypeCompareResult oracleToDoris =
                SchemaTypeCompareUtil.compareTypes("NUMBER(18,4)", JdbcConstants.ORACLE, "DECIMAL(10,2)", "doris");
        Assert.assertTrue(oracleToDoris.isChanged());
        Assert.assertEquals("WIDENING", oracleToDoris.getRiskLevel());
    }

    @Test
    public void testAllEightDatabasesCommentAndModifyDdl() {
        ColumnCommentChangeDto cc = new ColumnCommentChangeDto();
        cc.setColumnName("user_name");
        cc.setOldComment("旧姓名");
        cc.setNewComment("新姓名'备注");
        cc.setTargetFullType("varchar(64)");
        cc.setTargetNullable(true);

        ColumnSchemaChangeDto sc = new ColumnSchemaChangeDto();
        sc.setColumnName("amount");
        sc.setSourceRawType("decimal(18,4)");
        sc.setTargetOldType("decimal(10,2)");
        sc.setExpectedNewType("decimal(18,4)");
        sc.setTypeChanged(true);
        sc.setNewNullable(false);
        sc.setOldNullable(true);
        sc.setNullableChanged(true);
        sc.setTargetComment("交易金额");

        // 1. MySQL
        BaseDDLGenerator mysqlGen = DDLGeneratorFactory.getGenerator(JdbcConstants.MYSQL);
        String mysqlComment = mysqlGen.generateAlterCommentDDL("t_order", "订单表", Collections.singletonList(cc), true);
        Assert.assertTrue(mysqlComment.contains("ALTER TABLE `t_order` COMMENT = '订单表'"));
        Assert.assertTrue(mysqlComment.contains("MODIFY COLUMN `user_name` varchar(64) NULL COMMENT '新姓名''备注'"));
        String mysqlModify = mysqlGen.generateModifyColumnDDL("t_order", Collections.singletonList(sc));
        Assert.assertTrue(mysqlModify.contains("MODIFY COLUMN `amount` decimal(18,4) NOT NULL COMMENT '交易金额'"));

        // 2 & 3. Doris / StarRocks
        for (String db : Arrays.asList("doris", "starrocks")) {
            BaseDDLGenerator dorisGen = DDLGeneratorFactory.getGenerator(db);
            String dorisComment = dorisGen.generateAlterCommentDDL("t_order", "订单表", Collections.singletonList(cc), true);
            Assert.assertTrue(dorisComment.contains("ALTER TABLE `t_order` MODIFY COMMENT '订单表'"));
            Assert.assertTrue(dorisComment.contains("MODIFY COLUMN `user_name` varchar(64) NULL COMMENT '新姓名''备注'"));
            String dorisModify = dorisGen.generateModifyColumnDDL("t_order", Collections.singletonList(sc));
            Assert.assertTrue(dorisModify.contains("MODIFY COLUMN `amount` decimal(18,4) NOT NULL COMMENT '交易金额'"));
        }

        // 4. Hive
        BaseDDLGenerator hiveGen = DDLGeneratorFactory.getGenerator(JdbcConstants.HIVE);
        String hiveComment = hiveGen.generateAlterCommentDDL("t_order", "订单表", Collections.singletonList(cc), true);
        Assert.assertTrue(hiveComment.contains("SET TBLPROPERTIES ('comment' = '订单表')"));
        Assert.assertTrue(hiveComment.contains("CHANGE COLUMN `user_name` `user_name` varchar(64) COMMENT"));
        String hiveModify = hiveGen.generateModifyColumnDDL("t_order", Collections.singletonList(sc));
        Assert.assertTrue(hiveModify.contains("CHANGE COLUMN `amount` `amount` decimal(18,4)"));

        // 5. PostgreSQL
        BaseDDLGenerator pgGen = DDLGeneratorFactory.getGenerator(JdbcConstants.POSTGRESQL);
        String pgComment = pgGen.generateAlterCommentDDL("t_order", "订单表", Collections.singletonList(cc), true);
        Assert.assertTrue(pgComment.contains("COMMENT ON TABLE \"t_order\" IS '订单表'"));
        Assert.assertTrue(pgComment.contains("COMMENT ON COLUMN \"t_order\".\"user_name\" IS"));
        String pgModify = pgGen.generateModifyColumnDDL("t_order", Collections.singletonList(sc));
        Assert.assertTrue(pgModify.contains("ALTER COLUMN \"amount\" TYPE decimal(18,4)"));
        Assert.assertTrue(pgModify.contains("ALTER COLUMN \"amount\" SET NOT NULL"));

        // 6. Oracle (含 ORA-01442: nullableChanged=false 时不重复输出 NULL/NOT NULL)
        BaseDDLGenerator oracleGen = DDLGeneratorFactory.getGenerator(JdbcConstants.ORACLE);
        String oracleComment = oracleGen.generateAlterCommentDDL("T_ORDER", "订单表", Collections.singletonList(cc), true);
        Assert.assertTrue(oracleComment.contains("COMMENT ON TABLE \"T_ORDER\" IS '订单表'"));
        Assert.assertTrue(oracleComment.contains("COMMENT ON COLUMN \"T_ORDER\".\"user_name\" IS"));
        String oracleModify = oracleGen.generateModifyColumnDDL("T_ORDER", Collections.singletonList(sc));
        Assert.assertTrue(oracleModify.contains("MODIFY (\"amount\" decimal(18,4) NOT NULL)"));

        ColumnSchemaChangeDto oracleTypeOnly = new ColumnSchemaChangeDto();
        oracleTypeOnly.setColumnName("remark");
        oracleTypeOnly.setExpectedNewType("VARCHAR2(500)");
        oracleTypeOnly.setTypeChanged(true);
        oracleTypeOnly.setNullableChanged(false);
        oracleTypeOnly.setNewNullable(true);
        String oracleNoNullRedundant = oracleGen.generateModifyColumnDDL("T_ORDER", Collections.singletonList(oracleTypeOnly));
        Assert.assertFalse(oracleNoNullRedundant.contains("NULL)"));

        // 7. ClickHouse (Nullable 包装)
        BaseDDLGenerator ckGen = DDLGeneratorFactory.getGenerator(JdbcConstants.CLICKHOUSE);
        String ckComment = ckGen.generateAlterCommentDDL("t_order", "订单表", Collections.singletonList(cc), true);
        Assert.assertTrue(ckComment.contains("MODIFY COMMENT '订单表'"));
        Assert.assertTrue(ckComment.contains("COMMENT COLUMN `t_order`.`user_name`"));
        ColumnSchemaChangeDto ckNullable = new ColumnSchemaChangeDto();
        ckNullable.setColumnName("amount");
        ckNullable.setExpectedNewType("Decimal(18,4)");
        ckNullable.setTypeChanged(true);
        ckNullable.setNewNullable(true);
        ckNullable.setNullableChanged(true);
        String ckModify = ckGen.generateModifyColumnDDL("t_order", Collections.singletonList(ckNullable));
        Assert.assertTrue(ckModify.contains("Nullable(Decimal(18,4))"));

        // 8. SQL Server (新增用 sp_addextendedproperty，更新用 sp_updateextendedproperty)
        BaseDDLGenerator sqlServerGen = DDLGeneratorFactory.getGenerator(JdbcConstants.SQL_SERVER);
        String ssAdd = sqlServerGen.generateAlterCommentDDL("t_order", "订单表", Collections.singletonList(cc), false);
        Assert.assertTrue(ssAdd.contains("sp_addextendedproperty"));
        Assert.assertTrue(ssAdd.contains("sp_updateextendedproperty"));
        String ssModify = sqlServerGen.generateModifyColumnDDL("t_order", Collections.singletonList(sc));
        Assert.assertTrue(ssModify.contains("ALTER COLUMN [amount] decimal(18,4) NOT NULL"));
    }

    @Test
    public void testThreeWaySchemaComparisonScenarios() throws Exception {
        Method compareMethod = SchemaDriftServiceImpl.class.getDeclaredMethod(
                "compareThreeWaySchema",
                SchemaDriftItemDto.class, List.class, TableSchemaSnapshotDto.class,
                TableSchemaSnapshotDto.class, String.class, String.class, String.class);
        compareMethod.setAccessible(true);

        // 场景 1: 纯注释变更 -> COMMENT_DRIFT，全在 autoSafeDdl，无人工审查项
        TableSchemaSnapshotDto src1 = buildSnapshot(JdbcConstants.MYSQL, "t_user", "用户主表",
                col("id", "bigint", "主键", false),
                col("name", "varchar(64)", "用户昵称", true));
        TableSchemaSnapshotDto tgt1 = buildSnapshot(JdbcConstants.MYSQL, "t_user", "用户表",
                col("id", "bigint", "主键", false),
                col("name", "varchar(64)", "姓名", true));
        SchemaDriftItemDto item1 = new SchemaDriftItemDto();
        compareMethod.invoke(null, item1, Arrays.asList("id", "name"), src1, tgt1,
                JdbcConstants.MYSQL, JdbcConstants.MYSQL, "t_user");
        Assert.assertEquals("COMMENT_DRIFT", item1.getDriftType());
        Assert.assertFalse(Boolean.TRUE.equals(item1.getHasManualReviewChanges()));
        Assert.assertTrue(Boolean.TRUE.equals(item1.getTableCommentChanged()));
        Assert.assertEquals(1, item1.getColumnCommentChanges().size());
        Assert.assertNotNull(item1.getAutoSafeDdl());
        Assert.assertNull(item1.getManualReviewDdl());

        // 场景 2: 类型收缩 + 可空性收紧 -> SCHEMA_CHANGE，BREAKING 仅进入 manualReviewDdl
        TableSchemaSnapshotDto src2 = buildSnapshot(JdbcConstants.MYSQL, "t_user", "用户表",
                col("id", "bigint", "主键", false),
                col("name", "varchar(32)", "姓名", false));
        TableSchemaSnapshotDto tgt2 = buildSnapshot(JdbcConstants.MYSQL, "t_user", "用户表",
                col("id", "bigint", "主键", false),
                col("name", "varchar(64)", "姓名", true));
        SchemaDriftItemDto item2 = new SchemaDriftItemDto();
        compareMethod.invoke(null, item2, Arrays.asList("id", "name"), src2, tgt2,
                JdbcConstants.MYSQL, JdbcConstants.MYSQL, "t_user");
        Assert.assertEquals("SCHEMA_CHANGE", item2.getDriftType());
        Assert.assertTrue(Boolean.TRUE.equals(item2.getHasManualReviewChanges()));
        Assert.assertNull(item2.getAutoSafeDdl());
        Assert.assertNotNull(item2.getManualReviewDdl());
        Assert.assertEquals(1, item2.getColumnSchemaChanges().size());
        Assert.assertEquals("BREAKING", item2.getColumnSchemaChanges().get(0).getRiskLevel());
        Assert.assertTrue(Boolean.TRUE.equals(item2.getColumnSchemaChanges().get(0).getTypeChanged()));
        Assert.assertTrue(Boolean.TRUE.equals(item2.getColumnSchemaChanges().get(0).getNullableChanged()));

        // 场景 3: 目标表快照缺失时优雅降级 (仅做新增字段比对)
        TableSchemaSnapshotDto src3 = buildSnapshot(JdbcConstants.MYSQL, "t_user", "用户表",
                col("id", "bigint", "主键", false),
                col("ext", "varchar(50)", "扩展", true));
        SchemaDriftItemDto item3 = new SchemaDriftItemDto();
        compareMethod.invoke(null, item3, Collections.singletonList("id"), src3, null,
                JdbcConstants.MYSQL, JdbcConstants.HIVE, "t_user");
        Assert.assertEquals("ADD_COLUMN", item3.getDriftType());
        Assert.assertFalse(Boolean.TRUE.equals(item3.getHasManualReviewChanges()));
        Assert.assertEquals(1, item3.getAddedColumns().size());
    }

    private TableSchemaSnapshotDto buildSnapshot(String dbType, String tableName, String tableComment, TableColumnDto... cols) {
        TableSchemaSnapshotDto dto = new TableSchemaSnapshotDto();
        dto.setDbType(dbType);
        dto.setTableName(tableName);
        dto.setTableComment(tableComment);
        dto.setColumns(new ArrayList<>(Arrays.asList(cols)));
        return dto;
    }

    private TableColumnDto col(String name, String fullType, String comment, boolean nullable) {
        TableColumnDto dto = new TableColumnDto();
        dto.setColumnName(name);
        dto.setColumnType(fullType);
        dto.setFullType(fullType);
        dto.setComment(comment);
        dto.setIsNullable(nullable);
        return dto;
    }
}
