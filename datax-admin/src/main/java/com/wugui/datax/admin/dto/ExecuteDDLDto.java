package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 执行建表 DDL 请求对象
 *
 * @author ypc
 */
@Data
@ApiModel(value = "执行DDL请求对象", description = "用于向指定目标数据源执行建表或表结构变更DDL")
public class ExecuteDDLDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 目标端数据源ID
     */
    @ApiModelProperty(value = "目标端数据源ID", required = true, example = "2")
    private Long datasourceId;

    /**
     * 建表 DDL 语句
     */
    @ApiModelProperty(value = "DDL语句", required = true, example = "CREATE TABLE IF NOT EXISTS ods_sys_user (...)")
    private String ddlSql;
}
