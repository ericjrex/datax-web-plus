package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;

import java.io.Serializable;
import java.util.List;

/**
 * 数据库全量结构导出传输对象
 *
 * @author ypc
 */
@ApiModel(value = "DatabaseSchemaDto", description = "数据库全量结构导出传输对象")
public class DatabaseSchemaDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "数据源ID")
    private Long datasourceId;

    @ApiModelProperty(value = "数据源名称")
    private String datasourceName;

    @ApiModelProperty(value = "数据库库名")
    private String databaseName;

    @ApiModelProperty(value = "数据源或库中文备注说明")
    private String comments;

    @ApiModelProperty(value = "数据源类型 (如 MYSQL, ORACLE, POSTGRESQL 等)")
    private String datasourceType;

    @ApiModelProperty(value = "Schema名称")
    private String tableSchema;

    @ApiModelProperty(value = "数据表及字段结构清单")
    private List<TableInfoDto> tables;

    public DatabaseSchemaDto() {
    }

    public Long getDatasourceId() {
        return datasourceId;
    }

    public void setDatasourceId(Long datasourceId) {
        this.datasourceId = datasourceId;
    }

    public String getDatasourceName() {
        return datasourceName;
    }

    public void setDatasourceName(String datasourceName) {
        this.datasourceName = datasourceName;
    }

    public String getDatabaseName() {
        return databaseName;
    }

    public void setDatabaseName(String databaseName) {
        this.databaseName = databaseName;
    }

    public String getComments() {
        return comments;
    }

    public void setComments(String comments) {
        this.comments = comments;
    }

    public String getDatasourceType() {
        return datasourceType;
    }

    public void setDatasourceType(String datasourceType) {
        this.datasourceType = datasourceType;
    }

    public String getTableSchema() {
        return tableSchema;
    }

    public void setTableSchema(String tableSchema) {
        this.tableSchema = tableSchema;
    }

    public List<TableInfoDto> getTables() {
        return tables;
    }

    public void setTables(List<TableInfoDto> tables) {
        this.tables = tables;
    }
}
