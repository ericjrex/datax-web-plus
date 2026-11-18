package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * 库表数据查询结果响应 DTO
 *
 * @author ypc
 */
@Data
@ApiModel("库表数据查询结果响应")
public class TableDataResultDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty("字段元数据列表")
    private List<TableColumnDto> columns;

    @ApiModelProperty("行数据列表 (键值对映射)")
    private List<Map<String, Object>> rows;

    @ApiModelProperty("总记录数")
    private Long totalCount;

    @ApiModelProperty("当前页码")
    private Integer pageNo;

    @ApiModelProperty("每页行数")
    private Integer pageSize;

    @ApiModelProperty("查询执行耗时 (毫秒)")
    private Long executeTimeMs;

    @ApiModelProperty("数据库类型 (MYSQL/POSTGRESQL/ORACLE/SQLSERVER/CLICKHOUSE/HIVE/MONGODB等)")
    private String dbType;

    @ApiModelProperty("Schema / 库名")
    private String tableSchema;

    @ApiModelProperty("表名")
    private String tableName;

    @ApiModelProperty("建表 DDL (如果可用)")
    private String createTableSql;
}
