package com.wugui.datax.admin.util;

import com.wugui.datax.admin.util.OpenApiPermissionUtil.DatabaseAuth;
import com.wugui.datax.admin.util.OpenApiPermissionUtil.RowFilterRule;
import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.expression.AllComparisonExpression;
import net.sf.jsqlparser.expression.AnyComparisonExpression;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.ExpressionVisitorAdapter;
import net.sf.jsqlparser.expression.Parenthesis;
import net.sf.jsqlparser.expression.StringValue;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.expression.operators.relational.InExpression;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.OrderByElement;
import net.sf.jsqlparser.statement.select.ParenthesisFromItem;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SelectBody;
import net.sf.jsqlparser.statement.select.SelectExpressionItem;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SetOperationList;
import net.sf.jsqlparser.statement.select.SubSelect;
import net.sf.jsqlparser.statement.select.WithItem;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 外部开放 API SQL 租户行级隔离 AST 改写工具
 * <p>
 * 基于 JSqlParser 抽象语法树递归改写 SELECT 查询，对主表、JOIN 表、子查询、
 * UNION 分支及 WITH CTE 中引用的非豁免物理表强制注入服务端绑定的租户过滤条件，
 * 并采用 Fail-Closed 策略阻断跨库前缀及不安全 JOIN 语法。
 *
 * @author ypc
 * @since 2026-11-13
 */
public final class OpenApiSqlTenantRewriter {

    private OpenApiSqlTenantRewriter() {
    }

    /**
     * 根据数据源授权策略对 SQL 进行行级隔离 AST 改写 (无实时列元数据时默认对所有非排除目标表生效)
     *
     * @param sql           经过基础安全审计的只读 SELECT SQL
     * @param auth          当前目标数据源的授权配置
     * @param allowedSchema 当前数据源绑定的默认库名 (用于跨库前缀校验，可为空)
     * @return 改写后的安全 SQL (若未启用行级过滤则原样返回)
     * @throws SecurityException 当策略配置不完整、存在跨库前缀或不支持的 SQL 结构时抛出
     */
    public static String rewriteSqlForTenant(String sql, DatabaseAuth auth, String allowedSchema) {
        if (!OpenApiPermissionUtil.hasActiveRowFilters(auth)) {
            return sql;
        }
        if (StringUtils.isBlank(sql)) {
            throw new IllegalArgumentException("查询 SQL 不能为空");
        }

        // Fail-Closed：运行时再次强制校验证件绑定的规则策略完整性
        try {
            OpenApiPermissionUtil.validateTenantPolicy(auth);
        } catch (IllegalArgumentException e) {
            throw new SecurityException("行级过滤策略配置异常: " + e.getMessage(), e);
        }

        List<RowFilterRule> effectiveRules = OpenApiPermissionUtil.resolveEffectiveRules(auth);
        Set<String> assumedCols = new HashSet<>(effectiveRules.size());
        for (RowFilterRule rule : effectiveRules) {
            if (rule != null && StringUtils.isNotBlank(rule.getColumn())) {
                assumedCols.add(rule.getColumn().trim().toLowerCase());
            }
        }

        List<String> physicalTables = OpenApiSqlAstParser.parseAndValidateSql(sql, allowedSchema, true);
        Map<String, List<RowFilterRule>> tableRulesMap = new HashMap<>();
        for (String tbl : physicalTables) {
            String lowerTbl = OpenApiPermissionUtil.normalizeTableName(tbl);
            List<RowFilterRule> matched = OpenApiPermissionUtil.matchRulesForTable(
                    effectiveRules, lowerTbl, assumedCols, false);
            if (!matched.isEmpty()) {
                tableRulesMap.put(lowerTbl, matched);
            }
        }
        return rewriteSqlForRules(sql, tableRulesMap, allowedSchema);
    }

    /**
     * 根据逐表已解析的行级过滤规则映射对 SQL 执行 AST 改写 (同表多规则以 AND 叠加注入)
     *
     * @param sql           经过基础安全审计的只读 SELECT SQL
     * @param tableRulesMap 小写物理表名 -> 命中的行级过滤规则列表
     * @param allowedSchema 当前数据源绑定的默认库名 (用于跨库前缀校验，可为空)
     * @return 改写后的安全 SQL (若没有任何表命中规则则原样返回)
     * @throws SecurityException 当规则异常、存在跨库前缀或不支持的 SQL 结构时抛出
     */
    public static String rewriteSqlForRules(
            String sql,
            Map<String, List<RowFilterRule>> tableRulesMap,
            String allowedSchema) {
        if (StringUtils.isBlank(sql)) {
            throw new IllegalArgumentException("查询 SQL 不能为空");
        }
        if (tableRulesMap == null || tableRulesMap.isEmpty()) {
            return sql;
        }

        Map<String, List<RowFilterRule>> normalizedRulesMap = new HashMap<>(tableRulesMap.size());
        boolean anyRule = false;
        for (Map.Entry<String, List<RowFilterRule>> entry : tableRulesMap.entrySet()) {
            if (StringUtils.isBlank(entry.getKey()) || entry.getValue() == null || entry.getValue().isEmpty()) {
                continue;
            }
            for (RowFilterRule rule : entry.getValue()) {
                try {
                    OpenApiPermissionUtil.validateRowFilterRule("runtime", rule);
                } catch (IllegalArgumentException e) {
                    throw new SecurityException("行级过滤规则配置异常: " + e.getMessage(), e);
                }
            }
            normalizedRulesMap.put(OpenApiPermissionUtil.normalizeTableName(entry.getKey()), entry.getValue());
            anyRule = true;
        }
        if (!anyRule) {
            return sql;
        }

        String cleanSql = stripTrailingSemicolons(sql);
        if (cleanSql.contains(";")) {
            throw new SecurityException("禁止执行多条 SQL 语句 (不允许包含分号 ';')");
        }

        Statement statement;
        try {
            statement = CCJSqlParserUtil.parse(cleanSql);
        } catch (Exception e) {
            throw new SecurityException("行级过滤 SQL 语法解析失败: " + e.getMessage(), e);
        }

        if (!(statement instanceof Select)) {
            throw new SecurityException("仅支持对只读 SELECT 查询应用行级字段过滤");
        }

        Select select = (Select) statement;
        Set<String> cteNames = new HashSet<>();
        if (select.getWithItemsList() != null) {
            rewriteWithItems(select.getWithItemsList(), normalizedRulesMap, allowedSchema, cteNames);
        }
        if (select.getSelectBody() == null) {
            throw new SecurityException("SQL 查询主体为空，拒绝执行");
        }

        rewriteSelectBody(select.getSelectBody(), normalizedRulesMap, allowedSchema, cteNames);
        return select.toString();
    }

    /**
     * 清洗 SQL 末尾多余分号与空白
     */
    private static String stripTrailingSemicolons(String sql) {
        String cleanSql = sql.trim();
        while (cleanSql.endsWith(";")) {
            cleanSql = cleanSql.substring(0, cleanSql.length() - 1).trim();
        }
        return cleanSql;
    }

    /**
     * 按顺序改写 WITH CTE 列表并维护作用域内的虚拟 CTE 表名集合
     */
    private static void rewriteWithItems(
            List<WithItem> withItems,
            Map<String, List<RowFilterRule>> tableRulesMap,
            String allowedSchema,
            Set<String> cteNames) {
        if (withItems == null || withItems.isEmpty()) {
            return;
        }
        for (WithItem withItem : withItems) {
            if (withItem == null) {
                continue;
            }
            String cteName = stripIdentifierQuotes(withItem.getName()).toLowerCase();
            // 仅当显式声明 RECURSIVE 时才允许自引用，防止非递归 CTE 利用同名覆盖物理表
            if (withItem.isRecursive() && StringUtils.isNotBlank(cteName)) {
                cteNames.add(cteName);
            }
            if (withItem.getSelectBody() != null) {
                rewriteSelectBody(withItem.getSelectBody(), tableRulesMap, allowedSchema, cteNames);
            }
            if (!withItem.isRecursive() && StringUtils.isNotBlank(cteName)) {
                cteNames.add(cteName);
            }
        }
    }

    /**
     * 递归分发改写各类 SelectBody (PlainSelect / SetOperationList / WithItem)
     */
    private static void rewriteSelectBody(
            SelectBody selectBody,
            Map<String, List<RowFilterRule>> tableRulesMap,
            String allowedSchema,
            Set<String> cteNames) {
        if (selectBody instanceof PlainSelect) {
            rewritePlainSelect((PlainSelect) selectBody, tableRulesMap, allowedSchema, cteNames);
        } else if (selectBody instanceof SetOperationList) {
            SetOperationList setOpList = (SetOperationList) selectBody;
            List<SelectBody> selects = setOpList.getSelects();
            if (selects == null || selects.isEmpty()) {
                throw new SecurityException("集合查询分支为空，拒绝执行");
            }
            for (SelectBody branch : selects) {
                rewriteSelectBody(branch, tableRulesMap, allowedSchema, new HashSet<>(cteNames));
            }
        } else if (selectBody instanceof WithItem) {
            WithItem withItem = (WithItem) selectBody;
            if (withItem.getSelectBody() != null) {
                rewriteSelectBody(withItem.getSelectBody(), tableRulesMap, allowedSchema, cteNames);
            }
        } else {
            // Fail-Closed: 未识别的 SelectBody 结构一律阻断
            throw new SecurityException("行级过滤暂不支持该查询结构: " + selectBody.getClass().getSimpleName());
        }
    }

    /**
     * 改写单层 PlainSelect，覆盖 SELECT/WHERE/HAVING/ORDER BY 嵌套子查询、FROM 主表与 JOIN 子句
     */
    private static void rewritePlainSelect(
            PlainSelect plainSelect,
            Map<String, List<RowFilterRule>> tableRulesMap,
            String allowedSchema,
            Set<String> cteNames) {
        // 1. 先改写 SELECT 列、WHERE、HAVING、ORDER BY 中的嵌套子查询
        ExpressionVisitorAdapter subSelectRewriter = createSubSelectRewriter(tableRulesMap, allowedSchema, cteNames);
        if (plainSelect.getSelectItems() != null) {
            for (SelectItem item : plainSelect.getSelectItems()) {
                if (item instanceof SelectExpressionItem) {
                    Expression expr = ((SelectExpressionItem) item).getExpression();
                    if (expr != null) {
                        expr.accept(subSelectRewriter);
                    }
                }
            }
        }
        if (plainSelect.getWhere() != null) {
            plainSelect.getWhere().accept(subSelectRewriter);
        }
        if (plainSelect.getHaving() != null) {
            plainSelect.getHaving().accept(subSelectRewriter);
        }
        if (plainSelect.getOrderByElements() != null) {
            for (OrderByElement orderBy : plainSelect.getOrderByElements()) {
                if (orderBy != null && orderBy.getExpression() != null) {
                    orderBy.getExpression().accept(subSelectRewriter);
                }
            }
        }

        // 2. 处理 FROM 主表 (若为无 FROM 的常量查询如 SELECT 1 则跳过)
        List<Expression> wherePredicates = new ArrayList<>();
        Expression primaryPredicate = null;
        if (plainSelect.getFromItem() != null) {
            primaryPredicate = processFromItemAndBuildPredicate(plainSelect.getFromItem(), tableRulesMap, allowedSchema, cteNames);
        }

        // 3. 处理 JOIN 列表，区分 INNER/LEFT/RIGHT 保证外连接语义正确与零数据泄露
        List<Join> joins = plainSelect.getJoins();
        boolean singleRightJoinOnly = (joins != null && joins.size() == 1 && joins.get(0).isRight());
        if (primaryPredicate != null && !singleRightJoinOnly) {
            wherePredicates.add(primaryPredicate);
        }

        if (joins != null) {
            for (Join join : joins) {
                if (join == null) {
                    continue;
                }
                if (join.isNatural() || (join.getUsingColumns() != null && !join.getUsingColumns().isEmpty())) {
                    throw new SecurityException("行级过滤模式下禁止使用 NATURAL JOIN 或 JOIN ... USING，请改用显式 JOIN ... ON 语法");
                }
                if (join.isFull()) {
                    throw new SecurityException("行级过滤模式下不支持 FULL JOIN 语法");
                }
                if (join.getOnExpression() != null) {
                    join.getOnExpression().accept(subSelectRewriter);
                }
                if (join.getRightItem() == null) {
                    throw new SecurityException("检测到异常的空 JOIN 目标对象，拒绝执行");
                }

                Expression rightPredicate = processFromItemAndBuildPredicate(join.getRightItem(), tableRulesMap, allowedSchema, cteNames);
                if (join.isLeft()) {
                    // LEFT JOIN: 右表行级过滤必须写入 ON，防止 LEFT JOIN 退化为 INNER JOIN
                    if (rightPredicate != null) {
                        join.setOnExpression(combineWithAnd(join.getOnExpression(), rightPredicate));
                    }
                } else if (join.isRight()) {
                    // RIGHT JOIN: 右表为主保留表放入 WHERE；若为单 RIGHT JOIN，左表放入 ON 保持外连接语义
                    if (singleRightJoinOnly && primaryPredicate != null) {
                        join.setOnExpression(combineWithAnd(join.getOnExpression(), primaryPredicate));
                    }
                    if (rightPredicate != null) {
                        wherePredicates.add(rightPredicate);
                    }
                } else {
                    // INNER / CROSS / 逗号隐式连接: 直接注入 WHERE
                    if (rightPredicate != null) {
                        wherePredicates.add(rightPredicate);
                    }
                }
            }
        }

        // 4. 合并并注入 WHERE 条件 (原有条件必须加括号保护，防止 OR 优先级绕过)
        if (!wherePredicates.isEmpty()) {
            Expression mergedWhere = plainSelect.getWhere();
            for (Expression predicate : wherePredicates) {
                mergedWhere = combineWithAnd(mergedWhere, predicate);
            }
            plainSelect.setWhere(mergedWhere);
        }
    }

    /**
     * 创建用于递归改写表达式内部 SubSelect 的访问器
     */
    private static ExpressionVisitorAdapter createSubSelectRewriter(
            Map<String, List<RowFilterRule>> tableRulesMap,
            String allowedSchema,
            Set<String> cteNames) {
        return new ExpressionVisitorAdapter() {
            @Override
            public void visit(SubSelect subSelect) {
                rewriteSubSelect(subSelect, tableRulesMap, allowedSchema, cteNames);
            }

            @Override
            public void visit(AllComparisonExpression allComparisonExpression) {
                if (allComparisonExpression != null && allComparisonExpression.getSubSelect() != null) {
                    rewriteSubSelect(allComparisonExpression.getSubSelect(), tableRulesMap, allowedSchema, cteNames);
                }
            }

            @Override
            public void visit(AnyComparisonExpression anyComparisonExpression) {
                if (anyComparisonExpression != null && anyComparisonExpression.getSubSelect() != null) {
                    rewriteSubSelect(anyComparisonExpression.getSubSelect(), tableRulesMap, allowedSchema, cteNames);
                }
            }
        };
    }

    /**
     * 改写嵌套 SubSelect (含子查询自身声明的 WITH CTE)
     */
    private static void rewriteSubSelect(
            SubSelect subSelect,
            Map<String, List<RowFilterRule>> tableRulesMap,
            String allowedSchema,
            Set<String> parentCtes) {
        if (subSelect == null) {
            return;
        }
        Set<String> childCtes = new HashSet<>(parentCtes);
        if (subSelect.getWithItemsList() != null) {
            rewriteWithItems(subSelect.getWithItemsList(), tableRulesMap, allowedSchema, childCtes);
        }
        if (subSelect.getSelectBody() != null) {
            rewriteSelectBody(subSelect.getSelectBody(), tableRulesMap, allowedSchema, childCtes);
        }
    }

    /**
     * 解析并处理单个 FromItem：若是 SubSelect 则递归改写；若是物理表则返回需要注入的行级过滤条件表达式
     */
    private static Expression processFromItemAndBuildPredicate(
            FromItem fromItem,
            Map<String, List<RowFilterRule>> tableRulesMap,
            String allowedSchema,
            Set<String> cteNames) {
        if (fromItem instanceof Table) {
            Table table = (Table) fromItem;
            validateTableSchema(table, allowedSchema);
            String cleanTableName = stripIdentifierQuotes(table.getName());
            String lowerTableName = cleanTableName.toLowerCase();
            if (StringUtils.isBlank(table.getSchemaName()) && cteNames.contains(lowerTableName)) {
                // 虚拟 CTE 引用已在定义处隔离，无需对其自身别名再次拼接过滤条件
                return null;
            }
            List<RowFilterRule> matchedRules = tableRulesMap.get(lowerTableName);
            if (matchedRules == null || matchedRules.isEmpty()) {
                // 未命中任何规则的物理表（如 AUTO_BY_COLUMN 下不含过滤字段的公共表或排除表），跳过注入
                return null;
            }
            return buildTableRulesPredicate(table, matchedRules);
        } else if (fromItem instanceof SubSelect) {
            rewriteSubSelect((SubSelect) fromItem, tableRulesMap, allowedSchema, cteNames);
            return null;
        } else if (fromItem instanceof ParenthesisFromItem) {
            FromItem inner = ((ParenthesisFromItem) fromItem).getFromItem();
            if (inner == null) {
                throw new SecurityException("检测到空括号 FROM 子句，拒绝执行");
            }
            return processFromItemAndBuildPredicate(inner, tableRulesMap, allowedSchema, cteNames);
        } else {
            // Fail-Closed: 不支持的 FromItem 类型 (如 SubJoin / TableFunction / LateralSubSelect) 一律阻断
            throw new SecurityException("行级过滤模式下不支持该 FROM 子句类型: " + fromItem.getClass().getSimpleName());
        }
    }

    /**
     * 校验物理表的 Schema 限定前缀，阻止行级过滤模式下跨库访问
     */
    private static void validateTableSchema(Table table, String allowedSchema) {
        if (table == null) {
            return;
        }
        String databaseName = table.getDatabase() != null ? stripIdentifierQuotes(table.getDatabase().getDatabaseName()) : null;
        String schemaName = stripIdentifierQuotes(table.getSchemaName());
        if (StringUtils.isNotBlank(databaseName)) {
            throw new SecurityException("行级过滤模式下禁止使用三级跨库表名: " + table.getFullyQualifiedName());
        }
        if (StringUtils.isNotBlank(schemaName)) {
            if (StringUtils.isBlank(allowedSchema) || !allowedSchema.equalsIgnoreCase(schemaName)) {
                throw new SecurityException("行级过滤模式下禁止跨库访问表 [" + table.getFullyQualifiedName() + "]");
            }
        }
    }

    /**
     * 为指定物理表节点按命中的多条过滤规则构建以 AND 组合的等值 (=) 或集合 (IN) 表达式
     */
    private static Expression buildTableRulesPredicate(Table table, List<RowFilterRule> rules) {
        Table qualifierTable = resolveQualifierTable(table);
        Expression combined = null;
        for (RowFilterRule rule : rules) {
            if (rule == null) {
                continue;
            }
            Expression singleExpr = buildSingleRulePredicate(qualifierTable, rule);
            combined = (combined == null) ? singleExpr : new AndExpression(combined, singleExpr);
        }
        return combined;
    }

    /**
     * 为单条行级过滤规则构建等值 (=) 或集合 (IN) 表达式
     */
    private static Expression buildSingleRulePredicate(Table qualifierTable, RowFilterRule rule) {
        Column filterCol = new Column(qualifierTable, rule.getColumn().trim());
        List<String> values = rule.getValues();
        if (values == null || values.isEmpty()) {
            throw new SecurityException("安全拦截: 行级过滤规则 [" + rule.getColumn() + "] 未绑定任何有效允许值");
        }

        if (values.size() == 1) {
            EqualsTo eq = new EqualsTo();
            eq.setLeftExpression(filterCol);
            eq.setRightExpression(new StringValue(values.get(0)));
            return eq;
        }

        List<Expression> exprList = new ArrayList<>(values.size());
        for (String val : values) {
            exprList.add(new StringValue(val));
        }
        InExpression inExpr = new InExpression();
        inExpr.setLeftExpression(filterCol);
        inExpr.setRightItemsList(new ExpressionList(exprList));
        return inExpr;
    }

    /**
     * 解析表引用前缀：优先使用别名，其次使用原表名（若带同库 Schema 前缀则保留）
     */
    private static Table resolveQualifierTable(Table table) {
        Alias alias = table.getAlias();
        if (alias != null && StringUtils.isNotBlank(alias.getName())) {
            return new Table(alias.getName().trim());
        }
        if (StringUtils.isNotBlank(table.getSchemaName())) {
            return new Table(table.getSchemaName(), table.getName());
        }
        return new Table(table.getName());
    }

    /**
     * 将已有条件表达式用括号包裹后与新条件通过 AND 拼接，防止 OR 优先级越权
     */
    private static Expression combineWithAnd(Expression existing, Expression additional) {
        if (additional == null) {
            return existing;
        }
        if (existing == null) {
            return additional;
        }
        Expression safeExisting = (existing instanceof Parenthesis) ? existing : new Parenthesis(existing);
        return new AndExpression(safeExisting, additional);
    }

    /**
     * 去除 SQL 标识符首尾的反引号、双引号或单引号
     */
    private static String stripIdentifierQuotes(String identifier) {
        if (StringUtils.isBlank(identifier)) {
            return "";
        }
        return identifier.replaceAll("[`\"']", "").trim();
    }

    /**
     * 提取用于检查表字段结构的目标物理表集合（排除虚拟 CTE 与公共豁免表）
     *
     * @param sql           原始只读 SELECT SQL
     * @param auth          数据源授权配置
     * @return 需要核验租户字段存在性的物理表名列表（小写去重）
     */
    public static List<String> extractNonExemptPhysicalTables(String sql, DatabaseAuth auth) {
        if (!OpenApiPermissionUtil.isTenantIsolationEnabled(auth) || StringUtils.isBlank(sql)) {
            return Collections.emptyList();
        }
        List<String> allTables = OpenApiSqlAstParser.parseAndValidateSql(sql);
        List<String> result = new ArrayList<>();
        for (String tbl : allTables) {
            if (StringUtils.isBlank(tbl)) {
                continue;
            }
            String lower = tbl.trim().toLowerCase();
            if (!OpenApiPermissionUtil.isTableTenantExempt(auth, lower) && !result.contains(lower)) {
                result.add(lower);
            }
        }
        return result;
    }
}
