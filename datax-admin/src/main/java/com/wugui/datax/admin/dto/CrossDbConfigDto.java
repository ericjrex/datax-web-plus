package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 跨库多源整体配置聚合 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(value = "跨库多源配置聚合模型")
public class CrossDbConfigDto implements Serializable {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "多源数据合并模式: UNION_ALL (行集合并追加), KEY_JOIN (键值横向关联), FEDERATED_SQL (单SQL联邦替换)")
    private String mergeMode;

    @ApiModelProperty(value = "关联主键字段列表 (KEY_JOIN 模式时生效，如 [tenant_id, stat_date])")
    private List<String> joinKeys;

    @ApiModelProperty(value = "多数据源节点列表")
    private List<CrossDbSourceItemDto> sources;

    @ApiModelProperty(value = "主查询SQL (FEDERATED_SQL 模式下生效)")
    private String mainSql;
}
