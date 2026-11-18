package com.wugui.datax.admin.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;
import java.util.List;

/**
 * 构建json dto
 *
 * @author jingwk
 * @ClassName DataXJsonDto
 * @Version 2.1.2
 * @since 2020/05/05 17:15
 */
@Data
public class DataXBatchJsonBuildDto implements Serializable {

    private Long readerDatasourceId;

    private List<String> readerTables;

    private Long writerDatasourceId;

    private List<String> writerTables;

    private int templateId;

    private RdbmsReaderDto rdbmsReader;

    private RdbmsWriterDto rdbmsWriter;

    /**
     * 是否开启方案1时间增量同步
     */
    private Boolean isIncrement;

    /**
     * 增量时间字段名（例如 update_time）
     */
    private String timeColumn;

    /**
     * 增量起始时间（不填则默认为当前时间）
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Date incStartTime;

    /**
     * 写入模式（例如 replace 或 update，默认 replace）
     */
    private String writeMode;

    /**
     * 任务名称个性化前缀
     */
    private String jobNamePrefix;

    /**
     * 任务名称个性化词缀
     */
    private String jobNameSuffix;

    /**
     * 任务名称命名基准规则 (READER_TABLE: 基于源表名, WRITER_TABLE: 基于目标表名, READER_TO_WRITER: 基于映射关系)
     */
    private String jobNameRule;
}
