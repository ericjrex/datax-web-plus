package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 自动构建表与字段映射请求对象
 *
 * @author ypc
 */
@Data
@ApiModel(value = "自动构建映射请求对象", description = "用于根据选中的源表列表和目标数据源，自动计算目标表名、生成字段映射和建表DDL")
public class AutoBuildMappingDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 源端数据源ID
     */
    @ApiModelProperty(value = "源端数据源ID", required = true, example = "1")
    private Long readerDatasourceId;

    /**
     * 选中的源端表名称列表
     */
    @ApiModelProperty(value = "选中的源端表名称列表", required = true, example = "[\"sys_user\", \"sys_role\"]")
    private List<String> readerTables;

    /**
     * 目标端数据源ID
     */
    @ApiModelProperty(value = "目标端数据源ID", required = true, example = "2")
    private Long writerDatasourceId;

    /**
     * 批量命名规则（前后缀、替换、大小写）
     */
    @ApiModelProperty(value = "批量命名规则")
    private TablePrefixSuffixRuleDto namingRule;
}
