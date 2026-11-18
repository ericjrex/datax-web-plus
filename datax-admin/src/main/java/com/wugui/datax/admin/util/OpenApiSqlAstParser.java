package com.wugui.datax.admin.util;

import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.util.TablesNamesFinder;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 外部开放 API SQL 抽象语法树 (AST) 安全审计与表名提取工具
 *
 * @author ypc
 * @since 2026-10-28
 */
public final class OpenApiSqlAstParser {

    private static final Logger logger = LoggerFactory.getLogger(OpenApiSqlAstParser.class);

    /**
     * 系统元数据与内部危险库黑名单
     */
    private static final Set<String> FORBIDDEN_CATALOGS = new HashSet<>(Arrays.asList(
            "INFORMATION_SCHEMA", "PERFORMANCE_SCHEMA", "MYSQL", "SYS"
    ));

    /**
     * 高危指令关键词黑名单
     */
    private static final Set<String> FORBIDDEN_KEYWORDS = new HashSet<>(Arrays.asList(
            "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE",
            "REPLACE", "GRANT", "REVOKE", "XP_CMDSHELL", "EXEC", "EXECUTE", "SHUTDOWN"
    ));

    /**
     * 高危探测函数正则 (如 sleep, benchmark, load_file, user(), database())
     */
    private static final Pattern PROBING_FUNCTION_PATTERN = Pattern.compile(
            "(?i)\\b(sleep|benchmark|load_file|sys_eval|pg_sleep|user|current_user|database|schema|version)\\s*\\("
    );

    private OpenApiSqlAstParser() {
    }

    /**
     * 对 SQL 进行全面安全审计，并使用 AST 抽象语法树提取涉及的全部物理表
     *
     * @param sql 待执行的查询 SQL
     * @return 涉及的唯一表名集合 (不包含引号)
     * @throws SecurityException 若包含违规语法、写指令或探测函数
     */
    public static List<String> parseAndValidateSql(String sql) {
        return parseAndValidateSql(sql, null, false);
    }

    /**
     * 对 SQL 进行全面安全审计，并在严格模式下阻止跨库表前缀访问
     *
     * @param sql                   待执行的查询 SQL
     * @param allowedSchema         当前数据源绑定的库名/Schema (可为空)
     * @param strictSchemaIsolation 是否启用严格跨库隔离校验
     * @return 涉及的唯一物理表名集合 (不包含引号与库前缀)
     * @throws SecurityException 若包含违规语法、写指令、探测函数或跨库访问
     */
    public static List<String> parseAndValidateSql(String sql, String allowedSchema, boolean strictSchemaIsolation) {
        if (StringUtils.isBlank(sql)) {
            throw new IllegalArgumentException("查询 SQL 不能为空");
        }

        // 1. 清洗分号与末尾空白
        String cleanSql = sql.trim();
        while (cleanSql.endsWith(";")) {
            cleanSql = cleanSql.substring(0, cleanSql.length() - 1).trim();
        }

        if (cleanSql.contains(";")) {
            throw new SecurityException("禁止执行多条 SQL 语句 (不允许包含分号 ';')");
        }

        // 2. 检查高危探测与拒绝服务函数
        Matcher functionMatcher = PROBING_FUNCTION_PATTERN.matcher(cleanSql);
        if (functionMatcher.find()) {
            throw new SecurityException("SQL 中包含被禁止的探测函数: " + functionMatcher.group(1));
        }

        // 3. 检查是否包含高危写指令与文件导出
        String upperSql = cleanSql.toUpperCase();
        if (upperSql.contains("INTO OUTFILE") || upperSql.contains("INTO DUMPFILE")) {
            throw new SecurityException("禁止使用 INTO OUTFILE / DUMPFILE 导出数据");
        }

        // 4. 使用 JSqlParser 解析 AST 语法树
        Statement statement;
        try {
            statement = CCJSqlParserUtil.parse(cleanSql);
        } catch (Exception e) {
            logger.warn("[OpenApiSqlAstParser] AST 语法树解析失败, SQL: {}, 原因: {}", cleanSql, e.getMessage());
            throw new SecurityException("SQL 语法解析失败，请确保输入合法的标准 SQL 语句: " + e.getMessage());
        }

        // 5. 必须为只读 SELECT 语句 (包含 WITH CTE 查询)
        if (!(statement instanceof Select)) {
            throw new SecurityException("仅支持执行只读 SELECT 查询，拒绝执行非查询语句");
        }

        // 6. 递归提取所有物理表名 (包括主表、JOIN 表、子查询、UNION ALL 等)
        TablesNamesFinder tablesNamesFinder = new TablesNamesFinder();
        List<String> rawTables = tablesNamesFinder.getTableList(statement);

        List<String> cleanTables = new ArrayList<>();
        if (rawTables != null) {
            for (String tbl : rawTables) {
                if (StringUtils.isBlank(tbl)) {
                    continue;
                }
                // 去除可能存在的反引号或双引号、单引号
                String normalized = tbl.replaceAll("[`\"']", "").trim();

                // 检查是否跨库探测系统表，如 information_schema.tables，以及严格模式下的跨库访问
                if (normalized.contains(".")) {
                    String[] parts = normalized.split("\\.");
                    String firstPart = parts[0].trim();
                    if (FORBIDDEN_CATALOGS.contains(firstPart.toUpperCase())) {
                        throw new SecurityException("禁止跨库访问系统库表: " + normalized);
                    }
                    if (parts.length > 2) {
                        if (strictSchemaIsolation) {
                            throw new SecurityException("租户隔离模式下禁止使用多级跨库表名: " + normalized);
                        }
                        normalized = parts[parts.length - 1].trim();
                    } else {
                        String schemaPart = firstPart;
                        String tablePart = parts[1].trim();
                        if (strictSchemaIsolation && (StringUtils.isBlank(allowedSchema) || !allowedSchema.equalsIgnoreCase(schemaPart))) {
                            throw new SecurityException("租户隔离模式下禁止跨库访问 [" + normalized + "]");
                        }
                        normalized = tablePart;
                    }
                } else if (FORBIDDEN_CATALOGS.contains(normalized.toUpperCase())) {
                    throw new SecurityException("禁止访问系统内置表: " + normalized);
                }

                if (!cleanTables.contains(normalized)) {
                    cleanTables.add(normalized);
                }
            }
        }

        if (cleanTables.isEmpty()) {
            // 兜底：如果 AST 未解析出表（例如 SELECT 1），直接放行
            logger.debug("[OpenApiSqlAstParser] 未提取到数据表, SQL: {}", cleanSql);
        }

        return cleanTables;
    }

    /**
     * 从 JDBC URL 中提取绑定的默认数据库名称 (用于跨库访问隔离校验)
     *
     * @param jdbcUrl 数据源 JDBC 连接串
     * @return 提取到的库名，无法识别时返回 null
     */
    public static String extractSchemaFromJdbcUrl(String jdbcUrl) {
        if (StringUtils.isBlank(jdbcUrl)) {
            return null;
        }
        String url = jdbcUrl.trim();
        // 处理 SQLServer databaseName=xxx 形式
        Matcher sqlServerMatcher = Pattern.compile("(?i)databaseName=([^;/?]+)").matcher(url);
        if (sqlServerMatcher.find()) {
            return sqlServerMatcher.group(1).trim();
        }
        // 处理标准 jdbc:subprotocol://host:port/dbName?params
        int schemeEnd = url.indexOf("://");
        if (schemeEnd >= 0) {
            int pathStart = url.indexOf('/', schemeEnd + 3);
            if (pathStart >= 0 && pathStart < url.length() - 1) {
                String tail = url.substring(pathStart + 1);
                int qIdx = tail.indexOf('?');
                if (qIdx >= 0) {
                    tail = tail.substring(0, qIdx);
                }
                int semiIdx = tail.indexOf(';');
                if (semiIdx >= 0) {
                    tail = tail.substring(0, semiIdx);
                }
                tail = tail.trim();
                if (StringUtils.isNotBlank(tail) && !tail.contains("/")) {
                    return tail;
                }
            }
        }
        return null;
    }
}
