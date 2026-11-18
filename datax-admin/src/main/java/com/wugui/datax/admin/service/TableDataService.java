package com.wugui.datax.admin.service;

import com.wugui.datax.admin.dto.DatabaseSchemaDto;
import com.wugui.datax.admin.dto.ExecuteSqlDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.dto.TableDataQueryDto;
import com.wugui.datax.admin.dto.TableDataResultDto;
import com.wugui.datax.admin.dto.TableInfoDto;

import java.util.List;

/**
 * 库表数据查询与元数据浏览服务
 *
 * @author ypc
 */
public interface TableDataService {

    /**
     * 分页查询指定数据源库表的数据
     *
     * @param queryDto 查询请求参数
     * @return 包含列元数据、数据行、总数与耗时的结果对象
     * @throws Exception 查询异常
     */
    TableDataResultDto queryTableData(TableDataQueryDto queryDto) throws Exception;

    /**
     * 执行只读自定义 SQL 查询
     *
     * @param executeSqlDto SQL 请求参数
     * @return 查询结果对象
     * @throws Exception 执行异常
     */
    TableDataResultDto executeReadOnlySql(ExecuteSqlDto executeSqlDto) throws Exception;

    /**
     * 获取指定表字段详细元数据
     *
     * @param datasourceId 数据源ID
     * @param tableSchema Schema/库名
     * @param tableName 表名
     * @return 字段详细信息列表
     * @throws Exception 获取异常
     */
    List<TableColumnDto> getTableColumnsDetails(Long datasourceId, String tableSchema, String tableName) throws Exception;

    /**
     * 快速获取表总记录数
     *
     * @param datasourceId 数据源ID
     * @param tableSchema Schema/库名
     * @param tableName 表名
     * @param whereClause 过滤条件 (可选)
     * @return 记录数
     * @throws Exception 统计异常
     */
    Long getTableCount(Long datasourceId, String tableSchema, String tableName, String whereClause) throws Exception;

    /**
     * 获取指定数据源下的所有表及注解说明
     *
     * @param datasourceId 数据源ID
     * @param tableSchema Schema/库名 (可选)
     * @return 包含表名与注解的列表
     * @throws Exception 获取异常
     */
    List<TableInfoDto> getTablesWithComments(Long datasourceId, String tableSchema) throws Exception;

    /**
     * 导出库表完整结构信息 (包含数据源信息、表列表与各表字段详情)
     *
     * @param datasourceId 数据源ID
     * @param tableSchema  Schema/库名 (可选)
     * @param tableNames   指定导出的表名列表 (可选，为空则导出全部)
     * @return 库表完整结构 DTO
     * @throws Exception 获取异常
     */
    DatabaseSchemaDto getDatabaseFullSchema(Long datasourceId, String tableSchema, List<String> tableNames) throws Exception;
}
