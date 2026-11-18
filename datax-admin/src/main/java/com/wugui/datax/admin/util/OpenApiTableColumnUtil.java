package com.wugui.datax.admin.util;

import com.wugui.datax.admin.core.util.LocalCacheUtil;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.service.TableDataService;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 开放 API 数据表字段结构缓存工具 (用于行级过滤规则匹配与 Fail-Closed 校验)
 *
 * @author ypc
 * @since 2026-11-13
 */
public final class OpenApiTableColumnUtil {

    private static final Logger logger = LoggerFactory.getLogger(OpenApiTableColumnUtil.class);

    private static final long TABLE_COLUMN_CACHE_TTL_MS = 5 * 60 * 1000L;

    private OpenApiTableColumnUtil() {
    }

    /**
     * 获取指定数据表的小写字段名集合 (带 5 分钟本地缓存，查询失败或无字段时不缓存并抛出 SecurityException 维持 Fail-Closed)
     *
     * @param tableDataService 表结构查询服务
     * @param datasourceId     目标数据源 ID
     * @param tableName        目标数据表名
     * @return 小写列名不可变集合
     */
    @SuppressWarnings("unchecked")
    public static Set<String> getCachedTableColumnSet(
            TableDataService tableDataService,
            Long datasourceId,
            String tableName) {
        if (tableDataService == null || datasourceId == null || StringUtils.isBlank(tableName)) {
            throw new SecurityException("校验表 [" + tableName + "] 字段结构参数异常，已拦截查询");
        }
        String lowerTbl = tableName.trim().toLowerCase();
        String cacheKey = "OPEN_API_TBL_COLS_" + datasourceId + "_" + lowerTbl;
        Object cached = LocalCacheUtil.get(cacheKey);
        if (cached instanceof Set) {
            return (Set<String>) cached;
        }

        List<TableColumnDto> columns;
        try {
            columns = tableDataService.getTableColumnsDetails(datasourceId, null, tableName);
        } catch (Exception e) {
            logger.warn("[OpenApiTableColumnUtil] 校验表 [{}] 字段结构失败: {}", tableName, e.getMessage());
            throw new SecurityException("校验表 [" + tableName + "] 过滤字段结构失败，已拦截查询: " + e.getMessage(), e);
        }

        if (columns == null || columns.isEmpty()) {
            throw new SecurityException("未获取到表 [" + tableName + "] 的字段元信息，无法确认过滤字段安全性，已拦截查询");
        }

        Set<String> colSet = new HashSet<>(columns.size());
        for (TableColumnDto col : columns) {
            if (col != null && StringUtils.isNotBlank(col.getColumnName())) {
                colSet.add(col.getColumnName().trim().toLowerCase());
            }
        }
        if (colSet.isEmpty()) {
            throw new SecurityException("表 [" + tableName + "] 未返回有效字段名，已拦截查询");
        }
        Set<String> unmodifiableSet = Collections.unmodifiableSet(colSet);
        LocalCacheUtil.set(cacheKey, unmodifiableSet, TABLE_COLUMN_CACHE_TTL_MS);
        return unmodifiableSet;
    }
}
