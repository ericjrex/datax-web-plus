package com.wugui.datax.admin.util;

import org.apache.commons.lang3.StringUtils;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * SQL 语法与安全性审计工具类
 *
 * @author ypc
 */
public final class SqlSecurityUtil {

    private SqlSecurityUtil() {
    }

    /**
     * 合法标识符正则（仅允许字母、数字、下划线、美元符、点、中划线）
     */
    private static final Pattern IDENTIFIER_PATTERN = Pattern.compile("^[a-zA-Z0-9_$.-]+$");

    /**
     * 单引号字符串字面量正则（匹配单引号字符串，支持 '' 转义与反斜杠转义）
     */
    private static final Pattern STRING_LITERAL_PATTERN = Pattern.compile("'(?:''|\\\\['\"\\\\bfnrt]|[^'])*'");

    /**
     * 危险关键词黑名单（禁止在只读查询或过滤条件中出现）
     */
    private static final Set<String> DANGEROUS_KEYWORDS = new HashSet<>(Arrays.asList(
            "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE",
            "REPLACE", "GRANT", "REVOKE", "INTO", "OUTFILE", "DUMPFILE",
            "XP_CMDSHELL", "EXEC", "EXECUTE", "SHUTDOWN"
    ));

    /**
     * 校验数据库标识符（库名、Schema名、表名、字段名）的安全性
     *
     * @param identifier 标识符名称
     * @return 校验通过返回原标识符，不合法则抛出安全异常
     */
    public static String validateIdentifier(String identifier) {
        if (StringUtils.isBlank(identifier)) {
            throw new IllegalArgumentException("标识符名称不能为空");
        }
        String trimmed = identifier.trim();
        if (!IDENTIFIER_PATTERN.matcher(trimmed).matches()) {
            throw new SecurityException("标识符名称包含非法字符: " + identifier);
        }
        return trimmed;
    }

    /**
     * 校验只读 SQL 语句的合法性
     *
     * @param sql 待执行的 SQL
     * @return 清洗后的合法 SQL
     */
    public static String validateReadOnlySql(String sql) {
        if (StringUtils.isBlank(sql)) {
            throw new IllegalArgumentException("查询 SQL 不能为空");
        }

        // 去除前后空白与末尾分号
        String cleanSql = sql.trim();
        while (cleanSql.endsWith(";")) {
            cleanSql = cleanSql.substring(0, cleanSql.length() - 1).trim();
        }

        // 检查是否包含未转义的分号（防止多语句注入）
        if (cleanSql.contains(";")) {
            throw new SecurityException("禁止执行多条 SQL 语句（不允许包含分号 ';'）");
        }

        // 安全剥离单行注释 (-- 开头) 与普通多行注释 (保留跨库路由标记 /*ds:...*/)
        String sanitizedSql = stripSafeComments(cleanSql);

        // 去除多余空白字符并转大写
        String upperSql = sanitizedSql.toUpperCase().replaceAll("\\s+", " ");

        // 严格限定必须以 SELECT、WITH、EXPLAIN、SHOW 或 DESC 开头 (忽略可能的前置空白)
        boolean isValidStart = upperSql.startsWith("SELECT ")
                || upperSql.startsWith("WITH ")
                || upperSql.startsWith("EXPLAIN ")
                || upperSql.startsWith("SHOW ")
                || upperSql.startsWith("DESC ");

        if (!isValidStart) {
            throw new SecurityException("仅支持执行只读查询语句（SELECT / WITH / EXPLAIN / SHOW / DESC）");
        }

        // 剥离单引号字符串字面量，避免业务常量（如 '%/create'、'UPDATE'）误触发高危语法指令拦截
        String sqlWithoutLiterals = stripStringLiterals(sanitizedSql);
        String upperWithoutLiterals = sqlWithoutLiterals.toUpperCase().replaceAll("\\s+", " ");

        // 扫描是否包含高危关键词
        String[] words = upperWithoutLiterals.split("[^A-Z0-9_]+");
        for (String word : words) {
            if (DANGEROUS_KEYWORDS.contains(word)) {
                // 如果是 INTO，且前面不是 SELECT，或者是 INTO OUTFILE/DUMPFILE
                if ("INTO".equals(word) && (upperWithoutLiterals.contains("INTO OUTFILE") || upperWithoutLiterals.contains("INTO DUMPFILE"))) {
                    throw new SecurityException("SQL 语句中包含高危指令: " + word);
                } else if ("REPLACE".equals(word)) {
                    // 如果是 REPLACE，仅当其构成 REPLACE INTO 时予以拦截，放行纯只读字符串函数 REPLACE(...)
                    if (upperWithoutLiterals.contains("REPLACE INTO")) {
                        throw new SecurityException("SQL 语句中包含高危指令: " + word);
                    }
                } else if (!"INTO".equals(word)) {
                    throw new SecurityException("SQL 语句中包含被禁止的高危指令: " + word);
                }
            }
        }

        return sanitizedSql;
    }

    /**
     * 校验 WHERE 过滤子句的安全性
     *
     * @param whereClause 过滤条件
     * @return 清洗后的安全过滤条件
     */
    public static String validateWhereClause(String whereClause) {
        if (StringUtils.isBlank(whereClause)) {
            return "";
        }

        String trimmed = whereClause.trim();
        if (trimmed.toLowerCase().startsWith("where ")) {
            trimmed = trimmed.substring(6).trim();
        }

        if (trimmed.contains(";") || trimmed.contains("--") || trimmed.contains("/*") || trimmed.contains("*/")) {
            throw new SecurityException("过滤条件中包含非法字符或注释符");
        }

        // 剥离单引号字面量后再进行关键词分词检测
        String withoutLiterals = stripStringLiterals(trimmed);
        String upper = withoutLiterals.toUpperCase().replaceAll("\\s+", " ");
        String[] words = upper.split("[^A-Z0-9_]+");
        for (String word : words) {
            if (DANGEROUS_KEYWORDS.contains(word)) {
                if ("REPLACE".equals(word) && !upper.contains("REPLACE INTO")) {
                    continue;
                }
                throw new SecurityException("过滤条件中包含被禁止的指令: " + word);
            }
        }

        return trimmed;
    }

    /**
     * 校验 ORDER BY 子句的安全性
     *
     * @param orderBy 排序条件
     * @return 清洗后的排序条件
     */
    public static String validateOrderBy(String orderBy) {
        if (StringUtils.isBlank(orderBy)) {
            return "";
        }
        String trimmed = orderBy.trim();
        if (trimmed.toLowerCase().startsWith("order by ")) {
            trimmed = trimmed.substring(9).trim();
        }
        if (trimmed.contains(";") || trimmed.contains("--") || trimmed.contains("/*") || trimmed.contains("*/")) {
            throw new SecurityException("排序条件中包含非法字符");
        }
        return trimmed;
    }

    /**
     * 安全剥离 SQL 中的标准注释，同时放行并保留跨库路由标记 (如 /*ds:15* /)
     *
     * @param sql 原始 SQL
     * @return 剥离注释后的安全 SQL
     */
    public static String stripSafeComments(String sql) {
        if (StringUtils.isBlank(sql)) {
            return "";
        }
        // 1. 剥离单行注释 -- ...
        String result = sql.replaceAll("(?m)--.*$", " ");

        // 2. 剥离除 /*ds:...*/ 以外的多行注释 (不区分大小写保留 ds: 跨库标记)
        result = result.replaceAll("/\\*(?!(?i)ds:)[^*]*\\*+(?:[^/*][^*]*\\*+)*/", " ");

        return result.trim();
    }

    /**
     * 安全剥离 SQL 中的单引号字符串字面量（替换为空白）
     * 作用：避免 WHERE / ON 等过滤条件中的常量字符串值（如 '%/create'、'UPDATE'）误触发语法级别的高危黑名单拦截
     *
     * @param sql 原始 SQL
     * @return 剥离字面量后的安全 SQL
     */
    public static String stripStringLiterals(String sql) {
        if (StringUtils.isBlank(sql)) {
            return "";
        }
        return STRING_LITERAL_PATTERN.matcher(sql).replaceAll(" ");
    }
}
