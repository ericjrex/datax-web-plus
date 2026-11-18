package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;

import java.io.Serializable;
import java.util.List;

/**
 * 库表基础元数据与注解传输对象
 *
 * @author ypc
 */
@ApiModel(value = "TableInfoDto", description = "库表基础元数据及注解对象")
public class TableInfoDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "数据表名")
    private String tableName;

    @ApiModelProperty(value = "数据表注解/备注说明")
    private String tableComment;

    @ApiModelProperty(value = "字段列表")
    private List<TableColumnDto> columns;

    public TableInfoDto() {
    }

    public TableInfoDto(String tableName, String tableComment) {
        this.tableName = tableName;
        this.tableComment = (tableComment != null) ? tableComment : "";
    }

    public String getTableName() {
        return tableName;
    }

    public void setTableName(String tableName) {
        this.tableName = tableName;
    }

    public String getTableComment() {
        return tableComment;
    }

    public void setTableComment(String tableComment) {
        this.tableComment = (tableComment != null) ? tableComment : "";
    }

    public List<TableColumnDto> getColumns() {
        return columns;
    }

    public void setColumns(List<TableColumnDto> columns) {
        this.columns = columns;
    }
}

