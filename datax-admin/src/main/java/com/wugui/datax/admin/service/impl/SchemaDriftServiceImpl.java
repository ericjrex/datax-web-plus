package com.wugui.datax.admin.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.RandomUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.parser.Feature;
import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datax.admin.dto.ApplySchemaEvolutionDto;
import com.wugui.datax.admin.dto.BatchSchemaDriftDto;
import com.wugui.datax.admin.dto.BatchSchemaDriftResultDto;
import com.wugui.datax.admin.dto.ColumnCommentChangeDto;
import com.wugui.datax.admin.dto.ColumnMappingDto;
import com.wugui.datax.admin.dto.ColumnSchemaChangeDto;
import com.wugui.datax.admin.dto.SchemaDriftItemDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.dto.TableSchemaSnapshotDto;
import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.entity.JobInfo;
import com.wugui.datax.admin.entity.JobSchemaDriftLog;
import com.wugui.datax.admin.mapper.JobInfoMapper;
import com.wugui.datax.admin.mapper.JobSchemaDriftLogMapper;
import com.wugui.datax.admin.service.DatasourceQueryService;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.service.SchemaDriftService;
import com.wugui.datax.admin.service.TableMappingService;
import com.wugui.datax.admin.tool.database.ColumnInfo;
import com.wugui.datax.admin.tool.meta.converter.DataTypeConverter;
import com.wugui.datax.admin.tool.meta.converter.DataTypeConverterFactory;
import com.wugui.datax.admin.tool.meta.converter.SchemaTypeCompareUtil;
import com.wugui.datax.admin.tool.meta.ddl.BaseDDLGenerator;
import com.wugui.datax.admin.tool.meta.ddl.DDLGeneratorFactory;
import com.wugui.datax.admin.util.AESUtil;
import com.wugui.datax.admin.util.JSONUtils;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * 元数据漂移探测与模式自适应演进服务实现类
 *
 * @author ypc
 */
@Service
public class SchemaDriftServiceImpl implements SchemaDriftService {

    private static final Logger logger = LoggerFactory.getLogger(SchemaDriftServiceImpl.class);

    /**
     * 高危或破坏性 SQL 拦截模式
     */
    private static final Pattern FORBIDDEN_DDL_PATTERN = Pattern.compile("(?i)\\b(DROP\\s+DATABASE|DROP\\s+TABLE|DROP\\s+COLUMN|TRUNCATE\\s+TABLE|ALTER\\s+USER|GRANT\\s+|REVOKE\\s+)\\b");

    /**
     * 最大并发探测线程数
     */
    private static final int MAX_CONCURRENT_THREADS = 4;

    @Autowired
    private JobInfoMapper jobInfoMapper;

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Autowired
    private DatasourceQueryService datasourceQueryService;

    @Autowired
    private TableMappingService tableMappingService;

    @Autowired
    private JobSchemaDriftLogMapper jobSchemaDriftLogMapper;

    @Override
    public SchemaDriftItemDto detectSingleJob(Integer jobId, String username) {
        long startTime = System.currentTimeMillis();
        List<JobDatasource> allDatasources = safeGetAllDatasources();
        SchemaDriftItemDto item = executeDetect(jobId, allDatasources);
        item.setCostTimeMs(System.currentTimeMillis() - startTime);
        item.setCheckTime(new Date());

        // 持久化单次探测记录
        String singleBatchNo = "DRIFT_SINGLE_" + DateUtil.format(new Date(), "yyyyMMddHHmmss");
        JobSchemaDriftLog logEntity = convertDtoToLogEntity(item, singleBatchNo, username, null, null, null);
        try {
            jobSchemaDriftLogMapper.insert(logEntity);
        } catch (Exception e) {
            logger.error("单任务持久化漂移日志异常: jobId={}, error={}", jobId, e.getMessage());
        }
        return item;
    }

    @Override
    public BatchSchemaDriftResultDto batchDetect(BatchSchemaDriftDto dto, String username) {
        long batchStartTime = System.currentTimeMillis();
        BatchSchemaDriftResultDto result = new BatchSchemaDriftResultDto();
        if (dto == null || CollUtil.isEmpty(dto.getJobIds())) {
            result.setItems(Collections.emptyList());
            return result;
        }

        List<Integer> jobIds = dto.getJobIds();
        result.setTotalCount(jobIds.size());
        String batchNo = "DRIFT_" + DateUtil.format(new Date(), "yyyyMMddHHmmss") + "_" + RandomUtil.randomNumbers(4);
        result.setBatchNo(batchNo);

        List<JobDatasource> allDatasources = safeGetAllDatasources();
        Map<String, TableSchemaSnapshotDto> targetSnapshotCache = new ConcurrentHashMap<>();
        ExecutorService executor = Executors.newFixedThreadPool(MAX_CONCURRENT_THREADS);
        List<CompletableFuture<SchemaDriftItemDto>> futures = new ArrayList<>();

        for (Integer jobId : jobIds) {
            futures.add(CompletableFuture.supplyAsync(() -> {
                long start = System.currentTimeMillis();
                SchemaDriftItemDto item = executeDetect(jobId, allDatasources, targetSnapshotCache);
                item.setCostTimeMs(System.currentTimeMillis() - start);
                item.setCheckTime(new Date());
                return item;
            }, executor));
        }

        List<SchemaDriftItemDto> items = new ArrayList<>();
        List<JobSchemaDriftLog> logsToInsert = new ArrayList<>();
        int normalCount = 0;
        int addColumnCount = 0;
        int dropColumnCount = 0;
        int mixedCount = 0;
        int commentDriftCount = 0;
        int schemaChangeCount = 0;
        int errorCount = 0;
        int autoAppliedCount = 0;

        for (CompletableFuture<SchemaDriftItemDto> future : futures) {
            try {
                SchemaDriftItemDto item = future.get();
                if (item != null) {
                    items.add(item);
                    // 状态计数统计
                    if ("FAILED".equalsIgnoreCase(item.getStatus())) {
                        errorCount++;
                    } else if ("NONE".equalsIgnoreCase(item.getDriftType())) {
                        normalCount++;
                    } else if ("ADD_COLUMN".equalsIgnoreCase(item.getDriftType())) {
                        addColumnCount++;
                    } else if ("DROP_COLUMN".equalsIgnoreCase(item.getDriftType())) {
                        dropColumnCount++;
                    } else if ("COMMENT_DRIFT".equalsIgnoreCase(item.getDriftType())) {
                        commentDriftCount++;
                    } else if ("SCHEMA_CHANGE".equalsIgnoreCase(item.getDriftType())) {
                        schemaChangeCount++;
                    } else if ("MIXED".equalsIgnoreCase(item.getDriftType())) {
                        mixedCount++;
                        if (Boolean.TRUE.equals(item.getHasManualReviewChanges())) {
                            schemaChangeCount++;
                        }
                        if (Boolean.TRUE.equals(item.getTableCommentChanged()) || CollUtil.isNotEmpty(item.getColumnCommentChanges())) {
                            commentDriftCount++;
                        }
                    } else {
                        errorCount++;
                    }

                    // 自动演进支持：仅自动执行安全变更（新增列、配置删列剔除、表/字段注释变更）；字段类型/必填变更绝不自动执行
                    String executedDdl = null;
                    String beforeJson = null;
                    String afterJson = null;
                    boolean hasSafeEvolution = CollUtil.isNotEmpty(item.getAddedColumns())
                            || CollUtil.isNotEmpty(item.getDroppedColumns())
                            || Boolean.TRUE.equals(item.getTableCommentChanged())
                            || CollUtil.isNotEmpty(item.getColumnCommentChanges());
                    boolean appliedSuccess = false;
                    if (Boolean.TRUE.equals(dto.getAutoApply()) && hasSafeEvolution && !"FAILED".equalsIgnoreCase(item.getStatus())) {
                        try {
                            ApplySchemaEvolutionDto applyDto = new ApplySchemaEvolutionDto();
                            applyDto.setJobId(item.getJobId());
                            applyDto.setAddedColumns(item.getAddedColumns());
                            applyDto.setHandleDroppedColumns(true);
                            applyDto.setApplyScope("AUTO_SAFE");
                            item.setStatus("AUTO_APPLIED");
                            ReturnT<String> applyResult = applyEvolutionInternal(applyDto, username, item);
                            if (applyResult.getCode() == ReturnT.SUCCESS_CODE) {
                                appliedSuccess = true;
                                if (Boolean.TRUE.equals(item.getHasManualReviewChanges())) {
                                    int manualCount = item.getColumnSchemaChanges() != null ? item.getColumnSchemaChanges().size() : 0;
                                    item.setStatus("DETECTED");
                                    item.setStatusMsg("已自动完成安全演进(加列/注释/配置同步)，另有 " + manualCount + " 项字段类型/必填变更待人工审查");
                                } else {
                                    item.setStatus("AUTO_APPLIED");
                                    autoAppliedCount++;
                                    if ("DROP_COLUMN".equalsIgnoreCase(item.getDriftType())) {
                                        item.setStatusMsg("已自动从任务配置中剔除源端已删字段 (目标库保持历史兼容不执行物理DROP)");
                                    } else if ("COMMENT_DRIFT".equalsIgnoreCase(item.getDriftType())) {
                                        item.setStatusMsg("已自动完成表与字段注释同步演进");
                                    } else if ("MIXED".equalsIgnoreCase(item.getDriftType())) {
                                        item.setStatusMsg("已自动完成目标端加列、注释同步及配置字段剔除");
                                    } else {
                                        item.setStatusMsg("已自动完成目标端加列与配置演进更新");
                                    }
                                }
                                executedDdl = item.getAutoSafeDdl();
                            } else {
                                item.setStatus("FAILED");
                                item.setStatusMsg("自动模式演进失败: " + applyResult.getMsg());
                            }
                        } catch (Exception e) {
                            logger.error("任务 [{}] 自动演进异常", item.getJobId(), e);
                            item.setStatus("FAILED");
                            item.setStatusMsg("自动演进异常: " + e.getMessage());
                        }
                    }

                    // 若未在 applyEvolutionInternal 中持久化过（如非自动演进或自动演进失败），则在此处持久化探测记录
                    if (!appliedSuccess) {
                        JobSchemaDriftLog logEntity = convertDtoToLogEntity(item, batchNo, username, beforeJson, afterJson, executedDdl);
                        logsToInsert.add(logEntity);
                    }
                }
            } catch (Exception e) {
                logger.error("批量检测漂移多线程执行异常", e);
                errorCount++;
            }
        }
        executor.shutdown();

        // 批量落库
        if (!logsToInsert.isEmpty()) {
            try {
                jobSchemaDriftLogMapper.insertBatch(logsToInsert);
            } catch (Exception e) {
                logger.error("批量插入漂移检测日志异常", e);
            }
        }

        result.setItems(items);
        result.setNormalCount(normalCount);
        result.setAddColumnCount(addColumnCount);
        result.setDropColumnCount(dropColumnCount);
        result.setMixedCount(mixedCount);
        result.setCommentDriftCount(commentDriftCount);
        result.setSchemaChangeCount(schemaChangeCount);
        result.setErrorCount(errorCount);
        result.setAutoAppliedCount(autoAppliedCount);
        result.setTotalCostTimeMs(System.currentTimeMillis() - batchStartTime);
        return result;
    }

    @Override
    public ReturnT<String> applyEvolution(ApplySchemaEvolutionDto dto, String username) {
        if (dto == null || dto.getJobId() == null || dto.getJobId() <= 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务ID不能为空");
        }
        List<JobDatasource> allDatasources = safeGetAllDatasources();
        SchemaDriftItemDto item = executeDetect(dto.getJobId(), allDatasources);
        if ("FAILED".equalsIgnoreCase(item.getStatus())) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "前置元数据探测失败: " + item.getStatusMsg());
        }
        if (CollUtil.isEmpty(dto.getAddedColumns()) && CollUtil.isNotEmpty(item.getAddedColumns())) {
            dto.setAddedColumns(item.getAddedColumns());
        }
        return applyEvolutionInternal(dto, username, item);
    }

    @Override
    public ReturnT<String> rollbackEvolution(Long logId, String username) {
        if (logId == null || logId <= 0) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "日志记录ID不能为空");
        }
        JobSchemaDriftLog logEntity = jobSchemaDriftLogMapper.selectById(logId);
        if (logEntity == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "未找到对应的演进日志记录");
        }
        if (StringUtils.isBlank(logEntity.getBeforeJobJson())) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "该记录不包含变更前的 Job JSON 快照，无法回滚");
        }

        JobInfo jobInfo = jobInfoMapper.loadById(logEntity.getJobId());
        if (jobInfo == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "目标任务不存在");
        }

        // 重新加密还原旧版本 Job JSON
        jobInfo.setJobJson(JSONUtils.encryptJobJson(logEntity.getBeforeJobJson()));
        jobInfo.setUpdateTime(new Date());
        jobInfoMapper.update(jobInfo);

        // 更新日志状态
        logEntity.setStatus("ROLLED_BACK");
        logEntity.setStatusMsg("已成功回滚至 " + DateUtil.formatDateTime(logEntity.getCreateTime()) + " 快照版本 (操作人: " + username + ")");
        logEntity.setUpdateTime(new Date());
        jobSchemaDriftLogMapper.updateById(logEntity);

        return ReturnT.SUCCESS;
    }

    @Override
    public List<JobSchemaDriftLog> getHistoryByJobId(Integer jobId) {
        if (jobId == null || jobId <= 0) {
            return Collections.emptyList();
        }
        return jobSchemaDriftLogMapper.selectHistoryByJobId(jobId);
    }

    @Override
    public List<JobSchemaDriftLog> getLatestByJobIds(List<Integer> jobIds) {
        if (CollUtil.isEmpty(jobIds)) {
            return Collections.emptyList();
        }
        return jobSchemaDriftLogMapper.selectLatestByJobIds(jobIds);
    }

    /**
     * 单任务探测核心逻辑 (无跨任务缓存)
     */
    private SchemaDriftItemDto executeDetect(Integer jobId, List<JobDatasource> allDatasources) {
        return executeDetect(jobId, allDatasources, null);
    }

    /**
     * 单任务探测核心逻辑 (支持目标库快照缓存与三方元数据比对)
     */
    private SchemaDriftItemDto executeDetect(Integer jobId, List<JobDatasource> allDatasources,
                                             Map<String, TableSchemaSnapshotDto> targetSnapshotCache) {
        SchemaDriftItemDto item = new SchemaDriftItemDto();
        item.setJobId(jobId);
        item.setDriftType("NONE");
        item.setStatus("NORMAL");

        JobInfo jobInfo = jobInfoMapper.loadById(jobId);
        if (jobInfo == null) {
            item.setStatus("FAILED");
            item.setStatusMsg("未找到对应任务记录");
            return item;
        }

        item.setJobDesc(StringUtils.isNotBlank(jobInfo.getJobDesc()) ? jobInfo.getJobDesc() : ("ID:" + jobId));

        String rawJson = JSONUtils.decryptJobJson(jobInfo.getJobJson());
        if (StringUtils.isBlank(rawJson)) {
            item.setStatus("FAILED");
            item.setStatusMsg("任务配置 JSON 为空");
            return item;
        }

        JSONObject root;
        try {
            root = JSON.parseObject(rawJson, Feature.OrderedField);
        } catch (Exception e) {
            item.setStatus("FAILED");
            item.setStatusMsg("任务配置 JSON 解析异常: " + e.getMessage());
            return item;
        }

        // 解析 Reader 端信息
        TableEndpointInfo readerInfo = parseEndpoint(root, "reader", allDatasources);
        item.setReaderDatasourceId(readerInfo.datasourceId);
        item.setReaderDatasourceName(readerInfo.datasourceName);
        item.setReaderTable(readerInfo.tableName);

        // 解析 Writer 端信息
        TableEndpointInfo writerInfo = parseEndpoint(root, "writer", allDatasources);
        item.setWriterDatasourceId(writerInfo.datasourceId);
        item.setWriterDatasourceName(writerInfo.datasourceName);
        item.setWriterTable(writerInfo.tableName);

        // 校验源端与目标端解析完整性
        if (readerInfo.datasourceId == null || StringUtils.isBlank(readerInfo.tableName)) {
            item.setStatus("FAILED");
            item.setStatusMsg("无法识别源端数据源或表名");
            return item;
        }

        // 提取当前任务配置的 Reader 字段列表
        List<String> currentConfigColumns = extractColumnNames(readerInfo.columnObj);
        item.setCurrentConfigColumns(currentConfigColumns);

        // 获取源库最新物理表结构快照 (含表注释、列完整类型、列注释与可空性)
        String sourceDbType = readerInfo.dbType != null ? readerInfo.dbType : JdbcConstants.MYSQL;
        String targetDbType = writerInfo.dbType != null ? writerInfo.dbType : JdbcConstants.HIVE;
        TableSchemaSnapshotDto sourceSnapshot = null;
        try {
            sourceSnapshot = datasourceQueryService.getTableSchemaSnapshot(readerInfo.datasourceId, readerInfo.tableName);
        } catch (Exception e) {
            logger.warn("读取源库表快照失败，尝试降级读取列详情: table={}, err={}", readerInfo.tableName, e.getMessage());
        }

        if (sourceSnapshot == null || CollUtil.isEmpty(sourceSnapshot.getColumns())) {
            List<ColumnInfo> latestSourceCols;
            try {
                latestSourceCols = datasourceQueryService.getColumnsDetails(readerInfo.datasourceId, readerInfo.tableName);
                if (JdbcConstants.MYSQL.equalsIgnoreCase(sourceDbType) && latestSourceCols != null) {
                    enrichMysqlColumnTypes(readerInfo, latestSourceCols);
                }
            } catch (Exception e) {
                item.setStatus("FAILED");
                item.setStatusMsg("读取源库物理表元数据异常: " + e.getMessage());
                return item;
            }
            if (CollUtil.isEmpty(latestSourceCols)) {
                item.setStatus("FAILED");
                item.setStatusMsg("未获取到源库物理表的字段列表，请确认表是否存在");
                return item;
            }
            sourceSnapshot = convertColumnInfosToSnapshot(sourceDbType, readerInfo.tableName, latestSourceCols);
        } else if (JdbcConstants.MYSQL.equalsIgnoreCase(sourceDbType)) {
            enrichSnapshotMysqlTypesIfMissing(readerInfo, sourceSnapshot);
        }

        // 获取目标库物理表结构快照 (带同批次缓存；失败时优雅降级，不阻断探测)
        TableSchemaSnapshotDto targetSnapshot = null;
        if (writerInfo.datasourceId != null && StringUtils.isNotBlank(writerInfo.tableName)) {
            String cacheKey = writerInfo.datasourceId + ":" + writerInfo.tableName.trim().toLowerCase();
            if (targetSnapshotCache != null && targetSnapshotCache.containsKey(cacheKey)) {
                targetSnapshot = targetSnapshotCache.get(cacheKey);
            } else {
                try {
                    targetSnapshot = datasourceQueryService.getTableSchemaSnapshot(writerInfo.datasourceId, writerInfo.tableName);
                    if (targetSnapshot != null && CollUtil.isEmpty(targetSnapshot.getColumns())) {
                        item.setTargetWarningMsg("未读取到目标表 [" + writerInfo.tableName + "] 字段，跳过注释与类型/可空性比对");
                        targetSnapshot = null;
                    } else if (targetSnapshot != null && targetSnapshotCache != null) {
                        targetSnapshotCache.put(cacheKey, targetSnapshot);
                    }
                } catch (Exception e) {
                    logger.warn("读取目标表快照异常: table={}, err={}", writerInfo.tableName, e.getMessage());
                    item.setTargetWarningMsg("读取目标表 [" + writerInfo.tableName + "] 元数据异常: " + e.getMessage());
                }
            }
        }

        compareThreeWaySchema(item, currentConfigColumns, sourceSnapshot, targetSnapshot, sourceDbType, targetDbType, writerInfo.tableName);
        return item;
    }

    /**
     * 三方结构比对核心方法 (源物理表 vs 目标物理表 vs 任务配置)
     */
    static void compareThreeWaySchema(SchemaDriftItemDto item,
                                      List<String> currentConfigColumns,
                                      TableSchemaSnapshotDto sourceSnapshot,
                                      TableSchemaSnapshotDto targetSnapshot,
                                      String sourceDbType,
                                      String targetDbType,
                                      String writerTableName) {
        List<TableColumnDto> sourceCols = sourceSnapshot != null && sourceSnapshot.getColumns() != null
                ? sourceSnapshot.getColumns() : Collections.emptyList();

        List<String> liveSourceColNames = new ArrayList<>(sourceCols.size());
        Map<String, TableColumnDto> liveSourceColMap = new LinkedHashMap<>();
        for (TableColumnDto col : sourceCols) {
            if (col != null && StringUtils.isNotBlank(col.getColumnName())) {
                String cleanName = cleanColumnName(col.getColumnName());
                liveSourceColNames.add(cleanName);
                liveSourceColMap.put(cleanName.toLowerCase(), col);
            }
        }
        item.setLatestSourceColumns(liveSourceColNames);

        Set<String> configColSet = new HashSet<>();
        if (currentConfigColumns != null) {
            for (String c : currentConfigColumns) {
                configColSet.add(cleanColumnName(c).toLowerCase());
            }
        }

        Set<String> liveSourceColSet = new HashSet<>(liveSourceColMap.keySet());

        Map<String, TableColumnDto> targetColMap = new LinkedHashMap<>();
        if (targetSnapshot != null && CollUtil.isNotEmpty(targetSnapshot.getColumns())) {
            for (TableColumnDto col : targetSnapshot.getColumns()) {
                if (col != null && StringUtils.isNotBlank(col.getColumnName())) {
                    targetColMap.put(cleanColumnName(col.getColumnName()).toLowerCase(), col);
                }
            }
        }

        // 1. 探测新增字段 (源表有但任务配置没有)
        List<ColumnMappingDto> addedColumns = new ArrayList<>();
        List<ColumnMappingDto> addColsForTargetDdl = new ArrayList<>();
        DataTypeConverter converter = DataTypeConverterFactory.getConverter(sourceDbType, targetDbType);
        for (TableColumnDto srcCol : sourceCols) {
            if (srcCol == null || StringUtils.isBlank(srcCol.getColumnName())) {
                continue;
            }
            String cleanName = cleanColumnName(srcCol.getColumnName());
            String srcType = StringUtils.isNotBlank(srcCol.getFullType()) ? srcCol.getFullType() : srcCol.getColumnType();
            if (!configColSet.contains(cleanName.toLowerCase())) {
                ColumnMappingDto mapping = new ColumnMappingDto();
                mapping.setReaderColumn(cleanName);
                mapping.setReaderType(srcType);
                mapping.setReaderComment(srcCol.getComment());
                mapping.setWriterColumn(cleanName);
                mapping.setWriterType(converter.convert(srcType));
                mapping.setWriterComment(srcCol.getComment());
                mapping.setIsPrimaryKey(Boolean.TRUE.equals(srcCol.getIsPrimaryKey()));
                mapping.setIsNullable(Boolean.FALSE.equals(srcCol.getIsNullable()) ? 0 : 1);
                addedColumns.add(mapping);
                if (targetColMap.isEmpty() || !targetColMap.containsKey(cleanName.toLowerCase())) {
                    addColsForTargetDdl.add(mapping);
                }
            }
        }
        item.setAddedColumns(addedColumns);

        // 2. 探测删除字段 (任务配置有但源表已删除)
        List<String> droppedColumns = new ArrayList<>();
        if (currentConfigColumns != null) {
            for (String c : currentConfigColumns) {
                String cleanName = cleanColumnName(c);
                if (!liveSourceColSet.contains(cleanName.toLowerCase())) {
                    droppedColumns.add(cleanName);
                }
            }
        }
        item.setDroppedColumns(droppedColumns);

        // 3. 当目标物理表快照可用时，比对表级 Comment、字段 Comment、字段类型与可空性
        boolean tableCommentChanged = false;
        String oldTableComment = null;
        String newTableComment = null;
        List<ColumnCommentChangeDto> columnCommentChanges = new ArrayList<>();
        List<ColumnSchemaChangeDto> columnSchemaChanges = new ArrayList<>();

        if (targetSnapshot != null && !targetColMap.isEmpty()) {
            oldTableComment = normalizeComment(targetSnapshot.getTableComment());
            newTableComment = normalizeComment(sourceSnapshot != null ? sourceSnapshot.getTableComment() : null);
            if (!Objects.equals(oldTableComment, newTableComment)) {
                tableCommentChanged = true;
            }

            for (TableColumnDto srcCol : sourceCols) {
                if (srcCol == null || StringUtils.isBlank(srcCol.getColumnName())) {
                    continue;
                }
                String cleanName = cleanColumnName(srcCol.getColumnName());
                TableColumnDto tgtCol = targetColMap.get(cleanName.toLowerCase());
                if (tgtCol == null) {
                    continue;
                }

                String tgtColType = StringUtils.isNotBlank(tgtCol.getFullType()) ? tgtCol.getFullType() : tgtCol.getColumnType();
                String srcColComment = normalizeComment(srcCol.getComment());
                String tgtColComment = normalizeComment(tgtCol.getComment());
                if (!Objects.equals(srcColComment, tgtColComment)) {
                    ColumnCommentChangeDto cc = new ColumnCommentChangeDto();
                    cc.setColumnName(cleanName);
                    cc.setOldComment(tgtColComment);
                    cc.setNewComment(srcColComment);
                    cc.setTargetFullType(tgtColType);
                    cc.setTargetNullable(tgtCol.getIsNullable());
                    cc.setTargetDefaultValue(tgtCol.getDefaultValue());
                    cc.setTargetExtra(tgtCol.getExtra());
                    columnCommentChanges.add(cc);
                }

                String srcColType = StringUtils.isNotBlank(srcCol.getFullType()) ? srcCol.getFullType() : srcCol.getColumnType();
                SchemaTypeCompareUtil.TypeCompareResult typeResult =
                        SchemaTypeCompareUtil.compareTypes(srcColType, sourceDbType, tgtColType, targetDbType);
                boolean nullChanged = srcCol.getIsNullable() != null && tgtCol.getIsNullable() != null
                        && !Objects.equals(srcCol.getIsNullable(), tgtCol.getIsNullable());

                if (typeResult.isChanged() || nullChanged) {
                    ColumnSchemaChangeDto sc = new ColumnSchemaChangeDto();
                    sc.setColumnName(cleanName);
                    sc.setSourceRawType(srcColType);
                    sc.setTargetOldType(tgtColType);
                    sc.setExpectedNewType(typeResult.getExpectedTargetType());
                    sc.setTypeChanged(typeResult.isChanged());
                    sc.setOldNullable(tgtCol.getIsNullable());
                    sc.setNewNullable(srcCol.getIsNullable());
                    sc.setTargetComment(StringUtils.isNotBlank(srcColComment) ? srcColComment : tgtColComment);
                    sc.setTargetDefaultValue(tgtCol.getDefaultValue());
                    sc.setTargetExtra(tgtCol.getExtra());
                    sc.setNullableChanged(nullChanged);
                    // NULL -> NOT NULL 属于高危收紧变更
                    boolean narrowedToNotNull = nullChanged && Boolean.FALSE.equals(srcCol.getIsNullable())
                            && Boolean.TRUE.equals(tgtCol.getIsNullable());
                    if ("BREAKING".equals(typeResult.getRiskLevel()) || narrowedToNotNull) {
                        sc.setRiskLevel("BREAKING");
                    } else {
                        sc.setRiskLevel("WIDENING");
                    }
                    columnSchemaChanges.add(sc);
                }
            }
        }

        item.setTableCommentChanged(tableCommentChanged);
        item.setOldTableComment(oldTableComment);
        item.setNewTableComment(newTableComment);
        item.setColumnCommentChanges(columnCommentChanges);
        item.setColumnSchemaChanges(columnSchemaChanges);

        boolean hasAdded = !addedColumns.isEmpty();
        boolean hasDropped = !droppedColumns.isEmpty();
        boolean hasCommentDrift = tableCommentChanged || !columnCommentChanges.isEmpty();
        boolean hasSchemaChange = !columnSchemaChanges.isEmpty();
        item.setHasManualReviewChanges(hasSchemaChange);

        // 4. 分别生成安全自动 DDL 与待人工审查 DDL
        if (StringUtils.isNotBlank(writerTableName)) {
            BaseDDLGenerator ddlGenerator = DDLGeneratorFactory.getGenerator(targetDbType);
            StringBuilder autoDdlSb = new StringBuilder();
            if (!addColsForTargetDdl.isEmpty()) {
                String addDdl = ddlGenerator.generateAddColumnsDDL(writerTableName, addColsForTargetDdl);
                if (StringUtils.isNotBlank(addDdl)) {
                    autoDdlSb.append(addDdl.trim());
                }
            }
            if (hasCommentDrift) {
                String commentDdl = ddlGenerator.generateAlterCommentDDL(
                        writerTableName,
                        tableCommentChanged ? newTableComment : null,
                        columnCommentChanges,
                        StringUtils.isNotBlank(oldTableComment));
                if (StringUtils.isNotBlank(commentDdl)) {
                    if (autoDdlSb.length() > 0) {
                        autoDdlSb.append("\n");
                    }
                    autoDdlSb.append(commentDdl.trim());
                }
            }
            if (autoDdlSb.length() > 0) {
                item.setAutoSafeDdl(autoDdlSb.toString());
            }

            if (hasSchemaChange) {
                String modifyDdl = ddlGenerator.generateModifyColumnDDL(writerTableName, columnSchemaChanges);
                if (StringUtils.isNotBlank(modifyDdl)) {
                    item.setManualReviewDdl(modifyDdl.trim());
                }
            }

            StringBuilder recSb = new StringBuilder();
            if (StringUtils.isNotBlank(item.getAutoSafeDdl())) {
                recSb.append(item.getAutoSafeDdl());
            }
            if (StringUtils.isNotBlank(item.getManualReviewDdl())) {
                if (recSb.length() > 0) {
                    recSb.append("\n");
                }
                recSb.append(item.getManualReviewDdl());
            }
            if (recSb.length() > 0) {
                item.setRecommendedDdl(recSb.toString());
            }
        }

        // 5. 判定漂移类型与提示文案
        int driftCategories = (hasAdded ? 1 : 0) + (hasDropped ? 1 : 0)
                + (hasCommentDrift ? 1 : 0) + (hasSchemaChange ? 1 : 0);
        if (driftCategories == 0) {
            item.setDriftType("NONE");
            item.setStatus("NORMAL");
            item.setStatusMsg("源表、目标表与任务配置一致，无元数据漂移");
        } else {
            item.setStatus("DETECTED");
            if (driftCategories > 1) {
                item.setDriftType("MIXED");
            } else if (hasAdded) {
                item.setDriftType("ADD_COLUMN");
            } else if (hasDropped) {
                item.setDriftType("DROP_COLUMN");
            } else if (hasCommentDrift) {
                item.setDriftType("COMMENT_DRIFT");
            } else {
                item.setDriftType("SCHEMA_CHANGE");
            }

            List<String> parts = new ArrayList<>();
            if (hasAdded) {
                parts.add("新增 " + addedColumns.size() + " 列");
            }
            if (hasDropped) {
                parts.add("源端删除 " + droppedColumns.size() + " 列(高风险)");
            }
            if (hasCommentDrift) {
                parts.add((tableCommentChanged ? "表注释变更+" : "") + columnCommentChanges.size() + " 个字段注释变更");
            }
            if (hasSchemaChange) {
                parts.add(columnSchemaChanges.size() + " 个字段类型/可空性变更(需人工审查)");
            }
            item.setStatusMsg("检测到元数据变更: " + String.join("，", parts));
        }
    }

    private static String normalizeComment(String comment) {
        return comment == null ? "" : comment.trim();
    }

    private TableSchemaSnapshotDto convertColumnInfosToSnapshot(String dbType, String tableName, List<ColumnInfo> cols) {
        TableSchemaSnapshotDto snapshot = new TableSchemaSnapshotDto();
        snapshot.setDbType(dbType);
        snapshot.setTableName(tableName);
        List<TableColumnDto> list = new ArrayList<>();
        for (ColumnInfo col : cols) {
            if (col == null || StringUtils.isBlank(col.getName())) {
                continue;
            }
            TableColumnDto dto = new TableColumnDto();
            dto.setColumnName(col.getName());
            dto.setColumnType(col.getType());
            dto.setFullType(col.getType());
            dto.setComment(col.getComment());
            dto.setIsPrimaryKey(Boolean.TRUE.equals(col.getIfPrimaryKey()));
            dto.setIsNullable(col.getIsnull() != 0);
            list.add(dto);
        }
        snapshot.setColumns(list);
        return snapshot;
    }

    private void enrichSnapshotMysqlTypesIfMissing(TableEndpointInfo readerInfo, TableSchemaSnapshotDto snapshot) {
        if (snapshot == null || CollUtil.isEmpty(snapshot.getColumns())) {
            return;
        }
        boolean needEnrich = false;
        for (TableColumnDto c : snapshot.getColumns()) {
            if (StringUtils.isBlank(c.getFullType())) {
                needEnrich = true;
                break;
            }
        }
        if (!needEnrich) {
            return;
        }
        List<ColumnInfo> tmp = new ArrayList<>();
        for (TableColumnDto c : snapshot.getColumns()) {
            ColumnInfo info = new ColumnInfo();
            info.setName(c.getColumnName());
            info.setType(c.getColumnType());
            tmp.add(info);
        }
        enrichMysqlColumnTypes(readerInfo, tmp);
        for (int i = 0; i < snapshot.getColumns().size() && i < tmp.size(); i++) {
            if (StringUtils.isBlank(snapshot.getColumns().get(i).getFullType())) {
                snapshot.getColumns().get(i).setFullType(tmp.get(i).getType());
            }
        }
    }

    /**
     * 内部演进执行核心流程
     */
    private ReturnT<String> applyEvolutionInternal(ApplySchemaEvolutionDto dto, String username, SchemaDriftItemDto item) {
        JobInfo jobInfo = jobInfoMapper.loadById(dto.getJobId());
        if (jobInfo == null) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务不存在");
        }

        String rawJson = JSONUtils.decryptJobJson(jobInfo.getJobJson());
        if (StringUtils.isBlank(rawJson)) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "任务配置 JSON 为空");
        }

        JSONObject root;
        try {
            root = JSON.parseObject(rawJson, Feature.OrderedField);
        } catch (Exception e) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "解析 Job JSON 失败: " + e.getMessage());
        }

        String applyScope = StringUtils.isNotBlank(dto.getApplyScope()) ? dto.getApplyScope().trim().toUpperCase() : "ALL_REVIEWED";
        boolean isAutoSafeOnly = "AUTO_SAFE".equals(applyScope);
        boolean isManualReviewOnly = "MANUAL_REVIEW".equals(applyScope);

        List<ColumnMappingDto> newCols = isManualReviewOnly ? Collections.emptyList()
                : (dto.getAddedColumns() != null ? dto.getAddedColumns() : item.getAddedColumns());
        List<String> droppedCols = (isManualReviewOnly || Boolean.FALSE.equals(dto.getHandleDroppedColumns()))
                ? Collections.emptyList() : item.getDroppedColumns();
        List<ColumnSchemaChangeDto> schemaChangesToSync = (!isAutoSafeOnly && !Boolean.FALSE.equals(dto.getSyncJobColumnTypes()))
                ? item.getColumnSchemaChanges() : Collections.emptyList();

        // 1. 根据 applyScope 选择待执行 DDL (AUTO_SAFE 绝不执行类型/可空性变更 DDL)
        String ddlToExecute;
        if (isAutoSafeOnly) {
            ddlToExecute = item.getAutoSafeDdl();
        } else if (StringUtils.isNotBlank(dto.getCustomDdl())) {
            ddlToExecute = dto.getCustomDdl();
        } else if (isManualReviewOnly) {
            ddlToExecute = item.getManualReviewDdl();
        } else {
            ddlToExecute = item.getRecommendedDdl();
        }

        if (StringUtils.isNotBlank(ddlToExecute) && item.getWriterDatasourceId() != null) {
            // 安全审计校验
            if (FORBIDDEN_DDL_PATTERN.matcher(ddlToExecute).find()) {
                return new ReturnT<>(ReturnT.FAIL_CODE, "安全拦截: 检测到禁止执行的高危或破坏性 SQL 指令！");
            }
            try {
                tableMappingService.executeDDL(item.getWriterDatasourceId(), ddlToExecute);
            } catch (Exception e) {
                logger.error("执行目标端 DDL 失败: ddl={}, error={}", ddlToExecute, e.getMessage(), e);
                return new ReturnT<>(ReturnT.FAIL_CODE, "执行目标端 DDL 失败: " + e.getMessage());
            }
        }

        // 2. 重写 Job JSON (更新 Reader 与 Writer 的 column 节点)
        String beforeJson = rawJson;
        try {
            rewriteJobJson(root, newCols, droppedCols, schemaChangesToSync);
        } catch (Exception e) {
            return new ReturnT<>(ReturnT.FAIL_CODE, "重写 Job JSON 异常: " + e.getMessage());
        }
        String afterJson = root.toJSONString();

        // 3. 重新加密并持久化保存至 JobInfo
        jobInfo.setJobJson(JSONUtils.encryptJobJson(afterJson));
        jobInfo.setUpdateTime(new Date());
        jobInfoMapper.update(jobInfo);

        // 4. 插入演进成功审计快照
        String batchNo = "EVO_" + DateUtil.format(new Date(), "yyyyMMddHHmmss") + "_" + RandomUtil.randomNumbers(4);
        if (!"AUTO_APPLIED".equalsIgnoreCase(item.getStatus())) {
            item.setStatus("MANUAL_APPLIED");
        }
        if (isAutoSafeOnly && Boolean.TRUE.equals(item.getHasManualReviewChanges())) {
            item.setStatusMsg("已自动执行安全变更(加列/注释/清理)，存在类型或可空性变更待人工审查");
        } else if (isManualReviewOnly) {
            item.setStatusMsg("已人工确认并执行字段类型/可空性变更 DDL");
        } else if (CollUtil.isNotEmpty(droppedCols) && CollUtil.isEmpty(newCols)) {
            item.setStatusMsg("已成功从任务配置中剔除源端已删字段 (目标库保持历史兼容，不执行物理DROP)");
        } else if (CollUtil.isNotEmpty(droppedCols)) {
            item.setStatusMsg("已成功在目标端加列并从配置中剔除源端已删字段");
        } else {
            item.setStatusMsg("已成功同步目标端结构并更新任务字段配置");
        }
        item.setAddedColumns(newCols);
        item.setDroppedColumns(droppedCols);
        JobSchemaDriftLog logEntity = convertDtoToLogEntity(item, batchNo, username, beforeJson, afterJson, ddlToExecute);
        try {
            jobSchemaDriftLogMapper.insert(logEntity);
        } catch (Exception e) {
            logger.error("记录演进日志异常", e);
        }

        return ReturnT.SUCCESS;
    }

    /**
     * 重写 Job JSON 中的 reader 与 writer 的 column 列表 (支持新增、删列、以及对象数组型 writer 类型同步)
     */
    private void rewriteJobJson(JSONObject root, List<ColumnMappingDto> addedCols, List<String> droppedCols,
                                List<ColumnSchemaChangeDto> schemaChanges) {
        JSONArray content = root.getJSONObject("job").getJSONArray("content");
        if (content == null || content.isEmpty()) {
            return;
        }
        JSONObject firstContent = content.getJSONObject(0);

        Set<String> dropSet = new HashSet<>();
        if (CollUtil.isNotEmpty(droppedCols)) {
            for (String d : droppedCols) {
                dropSet.add(cleanColumnName(d).toLowerCase());
            }
        }

        // 重写 Reader 列
        JSONObject reader = firstContent.getJSONObject("reader");
        if (reader != null && reader.containsKey("parameter")) {
            JSONObject param = reader.getJSONObject("parameter");
            Object colObj = param.get("column");
            if (colObj instanceof JSONArray) {
                JSONArray colArr = (JSONArray) colObj;
                JSONArray newArr = new JSONArray();

                for (int i = 0; i < colArr.size(); i++) {
                    Object val = colArr.get(i);
                    String colName = extractSingleColumnName(val);
                    if (!dropSet.contains(colName.toLowerCase())) {
                        newArr.add(val);
                    }
                }
                // 追加新增字段
                if (CollUtil.isNotEmpty(addedCols)) {
                    for (ColumnMappingDto added : addedCols) {
                        newArr.add(added.getReaderColumn());
                    }
                }
                param.put("column", newArr);
            }
        }

        // 构建需要同步目标类型的列映射 (仅针对 writer.column 为 JSONObject 数组，如 hdfswriter)
        Map<String, String> schemaTypeMap = new HashMap<>();
        if (CollUtil.isNotEmpty(schemaChanges)) {
            for (ColumnSchemaChangeDto sc : schemaChanges) {
                if (sc != null && StringUtils.isNotBlank(sc.getColumnName())
                        && StringUtils.isNotBlank(sc.getExpectedNewType())) {
                    schemaTypeMap.put(cleanColumnName(sc.getColumnName()).toLowerCase(), sc.getExpectedNewType().toLowerCase());
                }
            }
        }

        // 重写 Writer 列
        JSONObject writer = firstContent.getJSONObject("writer");
        if (writer != null && writer.containsKey("parameter")) {
            JSONObject param = writer.getJSONObject("parameter");
            Object colObj = param.get("column");
            if (colObj instanceof JSONArray) {
                JSONArray colArr = (JSONArray) colObj;
                JSONArray newArr = new JSONArray();

                boolean isObjectArray = false;
                for (int i = 0; i < colArr.size(); i++) {
                    Object val = colArr.get(i);
                    if (val instanceof JSONObject) {
                        isObjectArray = true;
                    }
                    String colName = extractSingleColumnName(val);
                    String lowerColName = colName.toLowerCase();
                    if (!dropSet.contains(lowerColName)) {
                        if (val instanceof JSONObject && schemaTypeMap.containsKey(lowerColName)) {
                            ((JSONObject) val).put("type", schemaTypeMap.get(lowerColName));
                        }
                        newArr.add(val);
                    }
                }

                // 追加新增字段
                if (CollUtil.isNotEmpty(addedCols)) {
                    for (ColumnMappingDto added : addedCols) {
                        if (isObjectArray) {
                            JSONObject obj = new JSONObject();
                            obj.put("name", added.getWriterColumn());
                            obj.put("type", StringUtils.isNotBlank(added.getWriterType()) ? added.getWriterType().toLowerCase() : "string");
                            newArr.add(obj);
                        } else {
                            newArr.add(added.getWriterColumn());
                        }
                    }
                }
                param.put("column", newArr);
            }
        }
    }

    /**
     * 解析插件的库表、连接与字段配置对象
     */
    private TableEndpointInfo parseEndpoint(JSONObject root, String pluginType, List<JobDatasource> allDatasources) {
        TableEndpointInfo info = new TableEndpointInfo();
        try {
            JSONArray content = root.getJSONObject("job").getJSONArray("content");
            if (content != null && !content.isEmpty()) {
                JSONObject plugin = content.getJSONObject(0).getJSONObject(pluginType);
                if (plugin != null && plugin.containsKey("parameter")) {
                    JSONObject param = plugin.getJSONObject("parameter");
                    info.columnObj = param.get("column");

                    // 提取 connection 节点中的 table 和 jdbcUrl
                    JSONArray connectionArr = param.getJSONArray("connection");
                    if (connectionArr != null && !connectionArr.isEmpty()) {
                        JSONObject connObj = connectionArr.getJSONObject(0);
                        Object tableObj = connObj.get("table");
                        if (tableObj instanceof JSONArray) {
                            JSONArray tableArr = (JSONArray) tableObj;
                            if (!tableArr.isEmpty()) {
                                info.tableName = cleanColumnName(tableArr.getString(0));
                            }
                        } else if (tableObj instanceof String) {
                            info.tableName = cleanColumnName((String) tableObj);
                        }

                        Object urlObj = connObj.get("jdbcUrl");
                        if (urlObj instanceof JSONArray) {
                            JSONArray urlArr = (JSONArray) urlObj;
                            if (!urlArr.isEmpty()) {
                                info.jdbcUrl = urlArr.getString(0);
                            }
                        } else if (urlObj instanceof String) {
                            info.jdbcUrl = (String) urlObj;
                        }
                    }

                    // 针对 HdfsWriter / OBS 插件处理
                    String pluginName = plugin.getString("name");
                    if ("hdfswriter".equalsIgnoreCase(pluginName)) {
                        info.dbType = JdbcConstants.HIVE;
                        String fileName = param.getString("fileName");
                        String path = param.getString("path");
                        if (StringUtils.isNotBlank(fileName)) {
                            info.tableName = fileName;
                        } else if (StringUtils.isNotBlank(path)) {
                            String[] segments = path.split("/");
                            info.tableName = segments[segments.length - 1];
                        }
                        String defaultFs = param.getString("defaultFS");
                        if (StringUtils.isNotBlank(defaultFs) && allDatasources != null) {
                            for (JobDatasource ds : allDatasources) {
                                if (JdbcConstants.HIVE.equalsIgnoreCase(ds.getDatasource())) {
                                    info.datasourceId = ds.getId();
                                    info.datasourceName = ds.getDatasourceName();
                                    info.jdbcUrl = ds.getJdbcUrl();
                                    break;
                                }
                            }
                        }
                    }

                    // 匹配数据源
                    if (StringUtils.isNotBlank(info.jdbcUrl) && allDatasources != null) {
                        String cleanTarget = cleanJdbcUrl(info.jdbcUrl);
                        for (JobDatasource ds : allDatasources) {
                            if (StringUtils.isNotBlank(ds.getJdbcUrl())
                                    && cleanJdbcUrl(ds.getJdbcUrl()).equalsIgnoreCase(cleanTarget)) {
                                info.datasourceId = ds.getId();
                                info.datasourceName = ds.getDatasourceName();
                                info.dbType = ds.getDatasource();
                                break;
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("解析插件 [{}] 配置异常: {}", pluginType, e.getMessage());
        }
        return info;
    }

    /**
     * 针对 MySQL 查询实际字段类型
     */
    private void enrichMysqlColumnTypes(TableEndpointInfo info, List<ColumnInfo> columns) {
        JobDatasource ds = jobDatasourceService.getById(info.datasourceId);
        if (ds == null || !JdbcConstants.MYSQL.equalsIgnoreCase(ds.getDatasource())) {
            return;
        }
        try {
            String username = AESUtil.decrypt(ds.getJdbcUsername());
            String password = AESUtil.decrypt(ds.getJdbcPassword());
            if (StringUtils.isNotBlank(ds.getJdbcDriverClass())) {
                Class.forName(ds.getJdbcDriverClass());
            }
            try (Connection conn = DriverManager.getConnection(ds.getJdbcUrl(), username, password);
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("DESC `" + info.tableName + "`")) {
                Map<String, String> typeMap = new HashMap<>();
                while (rs.next()) {
                    String field = rs.getString("Field");
                    String type = rs.getString("Type");
                    if (StringUtils.isNotBlank(field) && StringUtils.isNotBlank(type)) {
                        typeMap.put(field.toLowerCase(), type);
                    }
                }
                for (ColumnInfo col : columns) {
                    if (col != null && col.getName() != null) {
                        String realType = typeMap.get(col.getName().toLowerCase());
                        if (StringUtils.isNotBlank(realType)) {
                            col.setType(realType);
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("获取 MySQL 原生列类型失败，使用通用类型: {}", e.getMessage());
        }
    }

    /**
     * 从列配置数组中提取纯字段名列表
     */
    private List<String> extractColumnNames(Object colObj) {
        List<String> names = new ArrayList<>();
        if (colObj instanceof JSONArray) {
            JSONArray arr = (JSONArray) colObj;
            for (int i = 0; i < arr.size(); i++) {
                Object item = arr.get(i);
                names.add(extractSingleColumnName(item));
            }
        }
        return names;
    }

    /**
     * 提取单个列配置的列名
     */
    private String extractSingleColumnName(Object item) {
        if (item instanceof String) {
            return cleanColumnName((String) item);
        } else if (item instanceof JSONObject) {
            JSONObject obj = (JSONObject) item;
            String name = obj.getString("name");
            return cleanColumnName(name);
        }
        return "";
    }

    /**
     * 清理列名中的反引号与多余空格
     */
    private static String cleanColumnName(String name) {
        if (name == null) return "";
        return name.replace("`", "").replace("\"", "").replace("'", "").trim();
    }

    /**
     * 清理 JDBC 连接串中的参数
     */
    private String cleanJdbcUrl(String jdbcUrl) {
        if (jdbcUrl == null) return "";
        int qIdx = jdbcUrl.indexOf("?");
        if (qIdx > 0) {
            return jdbcUrl.substring(0, qIdx).trim();
        }
        return jdbcUrl.trim();
    }

    /**
     * 安全获取全部数据源
     */
    private List<JobDatasource> safeGetAllDatasources() {
        try {
            return jobDatasourceService.selectAllDatasource();
        } catch (Exception e) {
            logger.warn("获取全部数据源列表异常: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * DTO 转换持久化日志实体
     */
    private JobSchemaDriftLog convertDtoToLogEntity(SchemaDriftItemDto dto, String batchNo, String username,
                                                   String beforeJson, String afterJson, String executedDdl) {
        JobSchemaDriftLog entity = new JobSchemaDriftLog();
        entity.setBatchNo(batchNo);
        entity.setJobId(dto.getJobId());
        entity.setJobDesc(dto.getJobDesc());
        entity.setReaderDatasourceId(dto.getReaderDatasourceId());
        entity.setReaderTable(dto.getReaderTable());
        entity.setWriterDatasourceId(dto.getWriterDatasourceId());
        entity.setWriterTable(dto.getWriterTable());
        entity.setDriftType(dto.getDriftType());

        Map<String, Object> detailMap = new HashMap<>();
        detailMap.put("addedColumns", dto.getAddedColumns());
        detailMap.put("droppedColumns", dto.getDroppedColumns());
        detailMap.put("tableCommentChanged", dto.getTableCommentChanged());
        detailMap.put("oldTableComment", dto.getOldTableComment());
        detailMap.put("newTableComment", dto.getNewTableComment());
        detailMap.put("columnCommentChanges", dto.getColumnCommentChanges());
        detailMap.put("columnSchemaChanges", dto.getColumnSchemaChanges());
        entity.setDriftDetailJson(JSON.toJSONString(detailMap));

        entity.setBeforeJobJson(beforeJson);
        entity.setAfterJobJson(afterJson);
        entity.setTargetDdl(StringUtils.isNotBlank(executedDdl) ? executedDdl : dto.getRecommendedDdl());
        entity.setStatus(dto.getStatus());
        entity.setStatusMsg(dto.getStatusMsg());
        entity.setCreateTime(dto.getCheckTime() != null ? dto.getCheckTime() : new Date());
        entity.setUpdateTime(new Date());
        entity.setCreateBy(StringUtils.isNotBlank(username) ? username : "SYSTEM");
        return entity;
    }

    /**
     * 端点解析封装类
     */
    private static class TableEndpointInfo {
        Long datasourceId;
        String datasourceName;
        String tableName;
        String jdbcUrl;
        String dbType;
        Object columnObj;
    }
}
