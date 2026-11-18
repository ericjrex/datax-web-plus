package com.wugui.datax.admin.service.impl;

import cn.hutool.core.util.ObjectUtil;
import com.google.common.collect.Lists;
import com.wugui.datax.admin.dto.TableSchemaSnapshotDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.service.DatasourceQueryService;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.tool.query.*;
import com.wugui.datax.admin.util.JdbcConstants;
import com.wugui.datax.admin.tool.database.ColumnInfo;
import com.wugui.datax.admin.tool.database.TableInfo;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Collections;
import java.util.List;

/**
 * datasource query
 *
 * @author zhouhongfa@gz-yibo.com
 * @ClassName JdbcDatasourceQueryServiceImpl
 * @Version 1.0
 * @since 2019/7/31 20:51
 */
@Service
public class DatasourceQueryServiceImpl implements DatasourceQueryService {

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Override
    public List<String> getDBs(Long id) throws IOException {
        //获取数据源对象
        JobDatasource datasource = jobDatasourceService.getById(id);
        return new MongoDBQueryTool(datasource).getDBNames();
    }


    @Override
    public List<String> getTables(Long id, String tableSchema) throws IOException {
        //获取数据源对象
        JobDatasource datasource = jobDatasourceService.getById(id);
        //queryTool组装
        if (ObjectUtil.isNull(datasource)) {
            return Lists.newArrayList();
        }
        if (JdbcConstants.HBASE.equals(datasource.getDatasource())) {
            return new HBaseQueryTool(datasource).getTableNames();
        } else if (JdbcConstants.MONGODB.equals(datasource.getDatasource())) {
            return new MongoDBQueryTool(datasource).getCollectionNames(datasource.getDatabaseName());
        } else {
            BaseQueryTool qTool = QueryToolFactory.getByDbType(datasource);
            if(StringUtils.isBlank(tableSchema)){
                return qTool.getTableNames();
            }else{
                return qTool.getTableNames(tableSchema);
            }
        }
    }

    @Override
    public List<String> getTableSchema(Long id) {
        //获取数据源对象
        JobDatasource datasource = jobDatasourceService.getById(id);
        //queryTool组装
        if (ObjectUtil.isNull(datasource)) {
            return Lists.newArrayList();
        }
        BaseQueryTool qTool = QueryToolFactory.getByDbType(datasource);
        return qTool.getTableSchema();
    }

    @Override
    public List<String> getCollectionNames(long id, String dbName) throws IOException {
        //获取数据源对象
        JobDatasource datasource = jobDatasourceService.getById(id);
        //queryTool组装
        if (ObjectUtil.isNull(datasource)) {
            return Lists.newArrayList();
        }
        return new MongoDBQueryTool(datasource).getCollectionNames(dbName);
    }


    @Override
    public List<String> getColumns(Long id, String tableName) throws IOException {
        //获取数据源对象
        JobDatasource datasource = jobDatasourceService.getById(id);
        //queryTool组装
        if (ObjectUtil.isNull(datasource)) {
            return Lists.newArrayList();
        }
        if (JdbcConstants.HBASE.equals(datasource.getDatasource())) {
            return new HBaseQueryTool(datasource).getColumns(tableName);
        } else if (JdbcConstants.MONGODB.equals(datasource.getDatasource())) {
            return new MongoDBQueryTool(datasource).getColumns(tableName);
        } else {
            BaseQueryTool queryTool = QueryToolFactory.getByDbType(datasource);
            return queryTool.getColumnNames(tableName, datasource.getDatasource());
        }
    }

    @Override
    public List<String> getColumnsByQuerySql(Long datasourceId, String querySql) throws SQLException {
        //获取数据源对象
        JobDatasource jdbcDatasource = jobDatasourceService.getById(datasourceId);
        //queryTool组装
        if (ObjectUtil.isNull(jdbcDatasource)) {
            return Lists.newArrayList();
        }
        BaseQueryTool queryTool = QueryToolFactory.getByDbType(jdbcDatasource);
        return queryTool.getColumnsByQuerySql(querySql);
    }

    @Override
    public List<ColumnInfo> getColumnsDetails(Long id, String tableName) throws IOException {
        JobDatasource datasource = jobDatasourceService.getById(id);
        if (ObjectUtil.isNull(datasource) || StringUtils.isBlank(tableName)) {
            return Collections.emptyList();
        }
        if (JdbcConstants.HBASE.equals(datasource.getDatasource())
                || JdbcConstants.MONGODB.equals(datasource.getDatasource())) {
            List<String> names = getColumns(id, tableName);
            List<ColumnInfo> result = Lists.newArrayList();
            if (names != null) {
                for (String name : names) {
                    ColumnInfo col = new ColumnInfo();
                    col.setName(name);
                    col.setType("String");
                    col.setIfPrimaryKey(false);
                    col.setIsnull(1);
                    result.add(col);
                }
            }
            return result;
        }
        BaseQueryTool queryTool = QueryToolFactory.getByDbType(datasource);
        return queryTool.getColumns(tableName);
    }

    @Override
    public TableInfo getTableDetails(Long id, String tableName) throws IOException {
        JobDatasource datasource = jobDatasourceService.getById(id);
        if (ObjectUtil.isNull(datasource) || StringUtils.isBlank(tableName)) {
            return null;
        }
        BaseQueryTool queryTool = QueryToolFactory.getByDbType(datasource);
        try {
            return queryTool.buildTableInfo(tableName);
        } catch (Exception e) {
            TableInfo tableInfo = new TableInfo();
            tableInfo.setName(tableName);
            tableInfo.setColumns(getColumnsDetails(id, tableName));
            return tableInfo;
        }
    }

    @Override
    public boolean checkTableExists(Long id, String tableName) throws IOException {
        if (id == null || StringUtils.isBlank(tableName)) {
            return false;
        }
        List<String> tables = getTables(id, null);
        if (tables == null || tables.isEmpty()) {
            return false;
        }
        for (String t : tables) {
            if (tableName.equalsIgnoreCase(t)) {
                return true;
            }
        }
        return false;
    }

    @Override
    public TableSchemaSnapshotDto getTableSchemaSnapshot(Long id, String tableName) throws IOException {
        JobDatasource datasource = jobDatasourceService.getById(id);
        if (ObjectUtil.isNull(datasource) || StringUtils.isBlank(tableName)) {
            return null;
        }
        String cleanTable = tableName.replace("`", "").replace("\"", "").trim();
        String schema = null;
        String pureTable = cleanTable;
        int dotIdx = cleanTable.indexOf('.');
        if (dotIdx > 0 && dotIdx < cleanTable.length() - 1) {
            schema = cleanTable.substring(0, dotIdx).trim();
            pureTable = cleanTable.substring(dotIdx + 1).trim();
        }
        try {
            TableDataQueryTool tool = new TableDataQueryTool(datasource);
            return tool.getSingleTableSchemaSnapshot(schema, pureTable);
        } catch (SQLException e) {
            throw new IOException("获取表 [" + tableName + "] 结构快照失败: " + e.getMessage(), e);
        }
    }
}
