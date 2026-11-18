package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 单表物理结构快照 DTO（包含表注释与标准化列元数据）
 *
 * @author ypc
 */
@Data
@ApiModel("单表物理结构快照")
public class TableSchemaSnapshotDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty("数据库类型")
    private String dbType;

    @ApiModelProperty("表名")
    private String tableName;

    @ApiModelProperty("表注释")
    private String tableComment;

    @ApiModelProperty("列元数据列表")
    private List<TableColumnDto> columns;
}
