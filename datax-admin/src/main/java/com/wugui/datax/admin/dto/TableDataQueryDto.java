package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 库表数据分页查询请求 DTO
 *
 * @author ypc
 */
@Data
@ApiModel("库表数据分页查询请求参数")
public class TableDataQueryDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "数据源ID", required = true)
    private Long datasourceId;

    @ApiModelProperty("数据库/Schema名称 (针对 PG, Mongo, Oracle 等)")
    private String tableSchema;

    @ApiModelProperty(value = "表名", required = true)
    private String tableName;

    @ApiModelProperty("当前页码 (从1开始，默认1)")
    private Integer pageNo = 1;

    @ApiModelProperty("每页条数 (默认20，最大500)")
    private Integer pageSize = 20;

    @ApiModelProperty("过滤条件 (WHERE 子句，如 status = 1)")
    private String whereClause;

    @ApiModelProperty("排序条件 (ORDER BY 子句，如 id DESC)")
    private String orderBy;

    @ApiModelProperty("指定查询字段列表 (为空则默认查询所有字段)")
    private List<String> columns;

    @ApiModelProperty("是否统计总记录数 (默认 true)")
    private Boolean countTotal = true;

    @ApiModelProperty("快速模糊搜索关键词 (匹配所有文本字段)")
    private String quickSearch;
}
