package com.wugui.datax.admin.tool.meta.converter;

import lombok.Data;
import org.apache.commons.lang3.StringUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 跨数据库字段类型标准化比对与风险分级工具
 *
 * @author ypc
 */
public final class SchemaTypeCompareUtil {

    private static final Pattern TYPE_WITH_ARGS_PATTERN = Pattern.compile("^([a-zA-Z0-9_ ]+)\\(([^)]+)\\)(.*)$");
    private static final Map<String, Integer> INT_RANK = new HashMap<>();

    static {
        INT_RANK.put("tinyint", 1);
        INT_RANK.put("smallint", 2);
        INT_RANK.put("mediumint", 3);
        INT_RANK.put("int", 4);
        INT_RANK.put("bigint", 5);
    }

    private SchemaTypeCompareUtil() {
    }

    /**
     * 比对源字段与目标物理字段的类型是否发生实质性调整，并判定风险等级
     *
     * @param sourceRawType 源端完整字段类型
     * @param sourceDbType  源端数据库类型
     * @param targetRawType 目标端完整字段类型
     * @param targetDbType  目标端数据库类型
     * @return 比对结果
     */
    public static TypeCompareResult compareTypes(String sourceRawType, String sourceDbType,
                                                 String targetRawType, String targetDbType) {
        TypeCompareResult result = new TypeCompareResult();
        DataTypeConverter converter = DataTypeConverterFactory.getConverter(sourceDbType, targetDbType);
        String expectedTargetType = converter.convert(sourceRawType);
        result.setExpectedTargetType(expectedTargetType);

        String normExpected = normalizeTypeForCompare(expectedTargetType);
        String normActual = normalizeTypeForCompare(targetRawType);
        result.setNormalizedExpectedType(normExpected);
        result.setNormalizedActualType(normActual);

        if (StringUtils.isBlank(normExpected) || StringUtils.isBlank(normActual) || normExpected.equals(normActual)) {
            result.setChanged(false);
            result.setRiskLevel("NONE");
            return result;
        }

        result.setChanged(true);
        result.setRiskLevel(classifyRisk(normActual, normExpected));
        return result;
    }

    /**
     * 标准化类型串，消除大小写、整型显示宽度（如 int(11) vs int）及常见同义词差异
     *
     * @param rawType 原始类型串
     * @return 标准化后的小写类型串
     */
    public static String normalizeTypeForCompare(String rawType) {
        if (StringUtils.isBlank(rawType)) {
            return "";
        }
        String s = rawType.trim();
        // 剥离 ClickHouse Nullable(...) 包装，避免与可空性变更重复报警
        if (s.startsWith("Nullable(") && s.endsWith(")")) {
            s = s.substring("Nullable(".length(), s.length() - 1).trim();
        }
        s = s.toLowerCase().replaceAll("\\s+", " ");
        // 统一去除 unsigned 等后缀修饰以便核心类型比对
        s = s.replaceAll("\\s+unsigned$", "").trim();

        String base = s;
        String args = "";
        Matcher m = TYPE_WITH_ARGS_PATTERN.matcher(s);
        if (m.matches()) {
            base = m.group(1).trim();
            args = m.group(2).replaceAll("\\s+", "");
        }

        // 同义词归一化
        if ("integer".equals(base) || "int4".equals(base) || "int32".equals(base)) {
            base = "int";
        } else if ("int8".equals(base) || "int64".equals(base)) {
            base = "bigint";
        } else if ("int2".equals(base) || "int16".equals(base)) {
            base = "smallint";
        } else if ("character varying".equals(base)) {
            base = "varchar";
        } else if ("character".equals(base)) {
            base = "char";
        } else if ("numeric".equals(base) || "dec".equals(base)) {
            base = "decimal";
        } else if ("bool".equals(base) || "boolean".equals(base)) {
            return "boolean";
        } else if ("float8".equals(base) || "float64".equals(base)) {
            base = "double";
        } else if ("float4".equals(base) || "float32".equals(base)) {
            base = "float";
        }

        // 消除 MySQL 整数默认显示宽度（保留 tinyint(1) 作为布尔惯例）
        if ("int".equals(base) || "bigint".equals(base) || "smallint".equals(base) || "mediumint".equals(base)) {
            return base;
        }
        if ("tinyint".equals(base)) {
            if ("1".equals(args)) {
                return "boolean";
            }
            return "tinyint";
        }
        if ("varchar".equals(base) || "char".equals(base) || "varchar2".equals(base)
                || "nvarchar".equals(base) || "nvarchar2".equals(base) || "decimal".equals(base)
                || "number".equals(base)) {
            return StringUtils.isNotBlank(args) ? base + "(" + args + ")" : base;
        }
        return base;
    }

    private static String classifyRisk(String actualNorm, String expectedNorm) {
        String actualBase = extractBase(actualNorm);
        String expectedBase = extractBase(expectedNorm);

        // 1. 整型无损扩容
        Integer rActual = INT_RANK.get(actualBase);
        Integer rExpected = INT_RANK.get(expectedBase);
        if (rActual != null && rExpected != null) {
            return rExpected > rActual ? "WIDENING" : "BREAKING";
        }

        // 2. 浮点无损扩容
        if ("float".equals(actualBase) && "double".equals(expectedBase)) {
            return "WIDENING";
        }

        // 3. 字符串长度扩容或升级为 text/string
        if (isStringBase(actualBase) && isStringBase(expectedBase)) {
            if (isUnboundedText(expectedBase) && !isUnboundedText(actualBase)) {
                return "WIDENING";
            }
            int lenActual = extractFirstIntArg(actualNorm);
            int lenExpected = extractFirstIntArg(expectedNorm);
            if (lenActual > 0 && lenExpected > lenActual && actualBase.equals(expectedBase)) {
                return "WIDENING";
            }
            return "BREAKING";
        }

        // 4. Decimal 精度扩容
        if (("decimal".equals(actualBase) || "number".equals(actualBase))
                && ("decimal".equals(expectedBase) || "number".equals(expectedBase))) {
            int[] psActual = extractPrecisionScale(actualNorm);
            int[] psExpected = extractPrecisionScale(expectedNorm);
            if (psActual != null && psExpected != null) {
                int intActual = psActual[0] - psActual[1];
                int intExpected = psExpected[0] - psExpected[1];
                if (psExpected[0] >= psActual[0] && psExpected[1] >= psActual[1] && intExpected >= intActual) {
                    return "WIDENING";
                }
            }
            return "BREAKING";
        }

        return "BREAKING";
    }

    private static String extractBase(String norm) {
        int idx = norm.indexOf('(');
        return idx > 0 ? norm.substring(0, idx).trim() : norm.trim();
    }

    private static boolean isStringBase(String base) {
        return "varchar".equals(base) || "varchar2".equals(base) || "nvarchar".equals(base)
                || "nvarchar2".equals(base) || "char".equals(base) || "text".equals(base)
                || "mediumtext".equals(base) || "longtext".equals(base) || "string".equals(base)
                || "clob".equals(base);
    }

    private static boolean isUnboundedText(String base) {
        return "text".equals(base) || "mediumtext".equals(base) || "longtext".equals(base)
                || "string".equals(base) || "clob".equals(base);
    }

    private static int extractFirstIntArg(String norm) {
        int l = norm.indexOf('(');
        int r = norm.indexOf(')');
        if (l < 0 || r <= l) {
            return -1;
        }
        String inner = norm.substring(l + 1, r);
        if (inner.contains(",")) {
            inner = inner.substring(0, inner.indexOf(','));
        }
        try {
            return Integer.parseInt(inner.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private static int[] extractPrecisionScale(String norm) {
        int l = norm.indexOf('(');
        int r = norm.indexOf(')');
        if (l < 0 || r <= l) {
            return null;
        }
        String inner = norm.substring(l + 1, r);
        String[] parts = inner.split(",");
        try {
            int p = Integer.parseInt(parts[0].trim());
            int s = parts.length > 1 ? Integer.parseInt(parts[1].trim()) : 0;
            return new int[]{p, s};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 类型比对结果 DTO
     */
    @Data
    public static class TypeCompareResult {
        private boolean changed;
        private String expectedTargetType;
        private String normalizedExpectedType;
        private String normalizedActualType;
        /**
         * NONE / WIDENING / BREAKING
         */
        private String riskLevel;
    }
}
