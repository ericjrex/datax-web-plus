package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 批量数据量比对请求参数 DTO
 *
 * @author ypc
 */
@Data
@ApiModel(description = "批量数据量比对请求参数")
public class BatchCompareDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 待比对的 DataX 任务 ID 列表
     */
    @ApiModelProperty(value = "任务ID列表", required = true)
    private List<Integer> jobIds;

    /**
     * 是否强制实时穿透查询数据库 (true: 强制查源目标库并入库; false: 默认穿透)
     */
    @ApiModelProperty(value = "是否强制实时查询数据库")
    private Boolean forceRefresh = true;
}
