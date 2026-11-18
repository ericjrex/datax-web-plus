package com.wugui.datax.admin.service;

import com.wugui.datax.admin.dto.AutoBuildMappingDto;
import com.wugui.datax.admin.dto.TableMappingDto;
import com.wugui.datax.admin.dto.TablePrefixSuffixRuleDto;

import java.io.IOException;
import java.util.List;

/**
 * 表与字段映射业务服务接口
 *
 * @author ypc
 */
public interface TableMappingService {

    /**
     * 自动构建源表与目标表的表名及字段映射关系
     *
     * @param dto 自动构建请求DTO
     * @return 表映射关系列表
     * @throws IOException IO异常
     */
    List<TableMappingDto> autoBuildTableMapping(AutoBuildMappingDto dto) throws IOException;

    /**
     * 批量预览命名规则转换后的目标表名
     *
     * @param tableNames 原表名列表
     * @param ruleDto 命名规则DTO
     * @return 转换后的目标表名列表
     */
    List<String> previewNaming(List<String> tableNames, TablePrefixSuffixRuleDto ruleDto);

    /**
     * 根据表映射配置生成目标库建表 DDL
     *
     * @param writerDatasourceId 目标数据源ID
     * @param mappingDto 表映射关系
     * @return 建表 DDL
     */
    String generateDDL(Long writerDatasourceId, TableMappingDto mappingDto);

    /**
     * 在目标数据源执行建表 DDL
     *
     * @param datasourceId 目标数据源ID
     * @param ddlSql 建表 DDL
     * @throws Exception 执行异常
     */
    void executeDDL(Long datasourceId, String ddlSql) throws Exception;

    /**
     * 自动根据源表结构推导类型并在目标库中完成建表
     *
     * @param readerDatasourceId 源端数据源ID
     * @param readerTable 源端表名
     * @param writerDatasourceId 目标端数据源ID
     * @param writerTable 目标端表名
     * @throws Exception 执行异常
     */
    void autoCreateTargetTable(Long readerDatasourceId, String readerTable, Long writerDatasourceId, String writerTable) throws Exception;
}
