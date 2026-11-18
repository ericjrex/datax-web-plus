package com.wugui.datax.admin.tool.util;

import com.wugui.datax.admin.dto.TablePrefixSuffixRuleDto;
import com.wugui.datax.admin.util.JdbcConstants;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 表名命名规则与安全处理公共工具类
 *
 * @author ypc
 */
public class TableNamingUtil {

    /**
     * 安全标识符正则白名单：仅允许字母、数字、下划线
     */
    private static final Pattern SAFE_IDENTIFIER_PATTERN = Pattern.compile("^[a-zA-Z0-9_]+$");

    private TableNamingUtil() {
    }

    /**
     * 批量应用命名规则
     *
     * @param tableNames 原表名列表
     * @param rule 命名规则对象
     * @return 目标表名列表
     */
    public static List<String> applyNamingRuleBatch(List<String> tableNames, TablePrefixSuffixRuleDto rule) {
        if (tableNames == null || tableNames.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> result = new ArrayList<>(tableNames.size());
        for (String tableName : tableNames) {
            result.add(applyNamingRule(tableName, rule));
        }
        return result;
    }

    /**
     * 对单张表应用命名规则
     *
     * @param tableName 原表名
     * @param rule 命名规则对象
     * @return 转换后的目标表名
     */
    public static String applyNamingRule(String tableName, TablePrefixSuffixRuleDto rule) {
        if (StringUtils.isBlank(tableName)) {
            return tableName;
        }
        if (rule == null) {
            return tableName;
        }

        String targetName = tableName;

        // 1. 执行大小写与风格转换
        if (StringUtils.isNotBlank(rule.getCaseType())) {
            switch (rule.getCaseType().toUpperCase()) {
                case "UPPER":
                    targetName = targetName.toUpperCase();
                    break;
                case "LOWER":
                    targetName = targetName.toLowerCase();
                    break;
                case "CAMEL_TO_UNDERLINE":
                    targetName = camelToUnderline(targetName);
                    break;
                case "UNDERLINE_TO_CAMEL":
                    targetName = underlineToCamel(targetName);
                    break;
                case "ORIGINAL":
                default:
                    break;
            }
        }

        // 2. 执行字符替换（若配置，使用忽略大小写安全替换）
        if (StringUtils.isNotEmpty(rule.getReplaceFrom())) {
            String replaceTo = rule.getReplaceTo() == null ? "" : rule.getReplaceTo();
            targetName = targetName.replaceAll("(?i)" + Pattern.quote(rule.getReplaceFrom()), replaceTo);
        }

        // 3. 拼接前缀与后缀
        String prefix = rule.getPrefix() == null ? "" : rule.getPrefix();
        String suffix = rule.getSuffix() == null ? "" : rule.getSuffix();
        targetName = prefix + targetName + suffix;

        return targetName;
    }

    /**
     * 驼峰转下划线命名（例如 sysUser -> sys_user）
     *
     * @param param 驼峰字符串
     * @return 下划线命名
     */
    public static String camelToUnderline(String param) {
        if (StringUtils.isBlank(param)) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < param.length(); i++) {
            char c = param.charAt(i);
            if (Character.isUpperCase(c)) {
                if (i > 0 && param.charAt(i - 1) != '_') {
                    sb.append('_');
                }
                sb.append(Character.toLowerCase(c));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /**
     * 下划线转驼峰命名（例如 sys_user -> sysUser）
     *
     * @param param 下划线字符串
     * @return 驼峰命名
     */
    public static String underlineToCamel(String param) {
        if (StringUtils.isBlank(param)) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        boolean nextUpper = false;
        for (int i = 0; i < param.length(); i++) {
            char c = param.charAt(i);
            if (c == '_') {
                if (sb.length() > 0) {
                    nextUpper = true;
                }
            } else {
                if (nextUpper) {
                    sb.append(Character.toUpperCase(c));
                    nextUpper = false;
                } else {
                    sb.append(c);
                }
            }
        }
        return sb.toString();
    }

    /**
     * 校验 SQL 标识符（表名、列名、前后缀）安全性，防御 SQL 注入
     *
     * @param identifier 标识符
     * @return true-合法，false-包含非法字符
     */
    public static boolean isValidSqlIdentifier(String identifier) {
        if (StringUtils.isBlank(identifier)) {
            return false;
        }
        return SAFE_IDENTIFIER_PATTERN.matcher(identifier).matches();
    }

    /**
     * 根据不同数据库方言添加安全界定符（如 MySQL 反引号、Oracle 双引号）
     *
     * @param identifier 标识符
     * @param dbType 数据库类型
     * @return 转义后的标识符
     */
    public static String quoteIdentifier(String identifier, String dbType) {
        if (StringUtils.isBlank(identifier)) {
            return "";
        }
        if (JdbcConstants.MYSQL.equalsIgnoreCase(dbType)
                || JdbcConstants.CLICKHOUSE.equalsIgnoreCase(dbType)) {
            return "`" + identifier + "`";
        } else if (JdbcConstants.ORACLE.equalsIgnoreCase(dbType)
                || JdbcConstants.POSTGRESQL.equalsIgnoreCase(dbType)) {
            return "\"" + identifier + "\"";
        } else if (JdbcConstants.SQL_SERVER.equalsIgnoreCase(dbType)) {
            return "[" + identifier + "]";
        }
        return identifier;
    }
}
