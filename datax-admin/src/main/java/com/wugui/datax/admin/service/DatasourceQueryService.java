package com.wugui.datax.admin.service;

import com.wugui.datax.admin.dto.TableSchemaSnapshotDto;
import com.wugui.datax.admin.tool.database.ColumnInfo;
import com.wugui.datax.admin.tool.database.TableInfo;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;

/**
 * 数据库查询服务
 *
 * @author zhouhongfa@gz-yibo.com
 * @ClassName JdbcDatasourceQueryService
 * @Version 1.0
 * @since 2019/7/31 20:50
 */
public interface DatasourceQueryService {

    /**
     * 获取db列表
     * @param id
     * @return
     */
    List<String> getDBs(Long id) throws IOException;

    /**
     * 根据数据源表id查询出可用的表
     *
     * @param id
     * @return
     */
    List<String> getTables(Long id,String tableSchema) throws IOException;

    /**
     * 获取CollectionNames
     * @param dbName
     * @return
     */
    List<String> getCollectionNames(long id,String dbName) throws IOException;

    /**
     * 根据数据源id，表名查询出该表所有字段
     *
     * @param id
     * @return
     */
    List<String> getColumns(Long id, String tableName) throws IOException;

    /**
     * 根据 sql 语句获取字段
     *
     * @param datasourceId
     * @param querySql
     * @return
     */
    List<String> getColumnsByQuerySql(Long datasourceId, String querySql) throws SQLException;

    /**
     * 获取PG table schema
     * @param id
     * @return
     */
    List<String> getTableSchema(Long id);

    /**
     * 根据数据源ID和表名获取字段详细元数据（字段名、数据类型、注释、主键、是否为空等）
     *
     * @param id 数据源ID
     * @param tableName 表名
     * @return 字段详细信息列表
     * @throws IOException IO异常
     */
    List<ColumnInfo> getColumnsDetails(Long id, String tableName) throws IOException;

    /**
     * 获取表及字段完整元数据
     *
     * @param id 数据源ID
     * @param tableName 表名
     * @return 表详细信息
     * @throws IOException IO异常
     */
    TableInfo getTableDetails(Long id, String tableName) throws IOException;

    /**
     * 检查目标数据源中指定表名是否存在
     *
     * @param id 数据源ID
     * @param tableName 表名
     * @return true-存在，false-不存在
     * @throws IOException IO异常
     */
    boolean checkTableExists(Long id, String tableName) throws IOException;

    /**
     * 获取单张物理表的完整结构快照（表注释、字段注释、完整字段类型含长度精度、可空性等）
     *
     * @param id        数据源ID
     * @param tableName 表名
     * @return 表结构快照，若数据源不存在或表名为空返回 null
     * @throws IOException IO/SQL 异常
     */
    TableSchemaSnapshotDto getTableSchemaSnapshot(Long id, String tableName) throws IOException;
}

