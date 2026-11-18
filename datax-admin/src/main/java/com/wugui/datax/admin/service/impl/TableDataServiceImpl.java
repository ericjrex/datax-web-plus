package com.wugui.datax.admin.service.impl;

import cn.hutool.core.util.ObjectUtil;
import com.wugui.datax.admin.dto.DatabaseSchemaDto;
import com.wugui.datax.admin.dto.ExecuteSqlDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.dto.TableDataQueryDto;
import com.wugui.datax.admin.dto.TableDataResultDto;
import com.wugui.datax.admin.dto.TableInfoDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.service.TableDataService;
import com.wugui.datax.admin.tool.query.TableDataQueryTool;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 库表数据查询与元数据浏览服务实现类
 *
 * @author ypc
 */
@Service
public class TableDataServiceImpl implements TableDataService {

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Override
    public TableDataResultDto queryTableData(TableDataQueryDto queryDto) throws Exception {
        JobDatasource datasource = getDatasource(queryDto.getDatasourceId());
        TableDataQueryTool queryTool = new TableDataQueryTool(datasource);
        return queryTool.queryTableData(queryDto);
    }

    @Override
    public TableDataResultDto executeReadOnlySql(ExecuteSqlDto executeSqlDto) throws Exception {
        JobDatasource datasource = getDatasource(executeSqlDto.getDatasourceId());
        TableDataQueryTool queryTool = new TableDataQueryTool(datasource);
        return queryTool.executeReadOnlySql(executeSqlDto);
    }

    @Override
    public List<TableColumnDto> getTableColumnsDetails(Long datasourceId, String tableSchema, String tableName) throws Exception {
        JobDatasource datasource = getDatasource(datasourceId);
        TableDataQueryTool queryTool = new TableDataQueryTool(datasource);
        return queryTool.getTableColumnsDetails(tableSchema, tableName);
    }

    @Override
    public Long getTableCount(Long datasourceId, String tableSchema, String tableName, String whereClause) throws Exception {
        JobDatasource datasource = getDatasource(datasourceId);
        TableDataQueryTool queryTool = new TableDataQueryTool(datasource);
        return queryTool.queryTotalCount(tableSchema, tableName, whereClause);
    }

    @Override
    public List<TableInfoDto> getTablesWithComments(Long datasourceId, String tableSchema) throws Exception {
        JobDatasource datasource = getDatasource(datasourceId);
        TableDataQueryTool queryTool = new TableDataQueryTool(datasource);
        return queryTool.getTablesWithComments(tableSchema);
    }

    @Override
    public DatabaseSchemaDto getDatabaseFullSchema(Long datasourceId, String tableSchema, List<String> tableNames) throws Exception {
        JobDatasource datasource = getDatasource(datasourceId);
        TableDataQueryTool queryTool = new TableDataQueryTool(datasource);
        List<TableInfoDto> tables = queryTool.getDatabaseFullSchema(tableSchema, tableNames);

        DatabaseSchemaDto dto = new DatabaseSchemaDto();
        dto.setDatasourceId(datasource.getId());
        dto.setDatasourceName(datasource.getDatasourceName());
        dto.setDatabaseName(datasource.getDatabaseName());
        dto.setComments(datasource.getComments());
        dto.setDatasourceType(datasource.getDatasource());
        dto.setTableSchema(tableSchema);
        dto.setTables(tables);
        return dto;
    }

    /**
     * 获取数据源实体并校验存在性
     */
    private JobDatasource getDatasource(Long datasourceId) {
        if (datasourceId == null) {
            throw new IllegalArgumentException("数据源ID不能为空");
        }
        JobDatasource datasource = jobDatasourceService.getById(datasourceId);
        if (ObjectUtil.isNull(datasource)) {
            throw new IllegalArgumentException("未找到ID为 " + datasourceId + " 的数据源");
        }
        return datasource;
    }
}
