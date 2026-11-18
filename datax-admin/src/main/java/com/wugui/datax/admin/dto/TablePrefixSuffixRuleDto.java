package com.wugui.datax.admin.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 批量表名前后缀与命名转换规则传输对象
 *
 * @author ypc
 */
@Data
@ApiModel(value = "批量命名规则传输对象", description = "用于批量设置目标表名的前后缀、替换规则及大小写转换")
public class TablePrefixSuffixRuleDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 前缀（如 ods_、stg_）
     */
    @ApiModelProperty(value = "表名前缀", example = "ods_")
    private String prefix;

    /**
     * 后缀（如 _df、_di、_sync）
     */
    @ApiModelProperty(value = "表名词缀", example = "_df")
    private String suffix;

    /**
     * 替换规则：待匹配的子串/正则
     */
    @ApiModelProperty(value = "待替换的子串或正则", example = "t_")
    private String replaceFrom;

    /**
     * 替换规则：替换后的目标文本
     */
    @ApiModelProperty(value = "替换后的目标文本", example = "")
    private String replaceTo;

    /**
     * 大小写转换策略：ORIGINAL(保持原样)、UPPER(转大写)、LOWER(转小写)、CAMEL_TO_UNDERLINE(驼峰转下划线)、UNDERLINE_TO_CAMEL(下划线转驼峰)
     */
    @ApiModelProperty(value = "大小写转换策略: ORIGINAL, UPPER, LOWER, CAMEL_TO_UNDERLINE, UNDERLINE_TO_CAMEL", example = "LOWER")
    private String caseType = "ORIGINAL";
}
