# Design

## Context

See `proposal.md` for motivation. Currently (Phase 1 implementation):
- `OpenApiPermissionUtil.DatabaseAuth` stores single-column tenant fields (`tenantIsolationEnabled`, `tenantColumn`, `tenantValues`, `tenantExemptTables`) inside `job_api_account.permissions` JSON.
- `OpenApiSqlTenantRewriter` injects one fixed `tenantColumn` predicate for all tables not in `tenantExemptTables`, and `JobOpenApiController` rejects any non-exempt table lacking `tenantColumn`.
- `tab8_open_api.js` renders a single tenant configuration bar per datasource tab.

Constraints from workspace rules:
- Preserve existing code formatting; extract shared helpers; strictly NO `mvn` build/test commands executed by the agent.
- Zero breaking changes for existing accounts (both unisolated accounts and Phase 1 `tenantIsolationEnabled` JSON payloads).
- UI must follow Ant Design palette and the 5-Emoji whitelist (`🚀`, `🔍`, `➕`, `✏️`, `🗑️`), with pure-text modal titles and buttons.

## Architecture Overview

```
External Caller / MCP Client
  │  POST /api/open/v1/sql/execute { datasourceId, sql }
  ▼
OpenApiSecurityInterceptor (AK/SK HMAC-SHA256 + IP + QPS)
  │
  ▼
JobOpenApiController#executeReadOnlySql
  ├─ 1. Resolve DatabaseAuth + normalize rules (rowFilterRules + legacy fallback)
  ├─ 2. hasActiveFilters = !effectiveRules.isEmpty()
  ├─ 3. OpenApiSqlAstParser.parseAndValidateSql(sql, boundSchema, hasActiveFilters)
  │      ├─ Validate SELECT-only, forbid multi-statement, probing funcs, INTO OUTFILE
  │      └─ Cross-schema check (reject db.table when db != bound datasource schema)
  ├─ 4. Table whitelist check (OpenApiPermissionUtil.isTableAllowed)
  ├─ 5. [If hasActiveFilters == true]
  │      ├─ Validate all RowFilterRules (column identifier, values whitelist)
  │      ├─ Resolve physical column sets for every involved table (cached 5 min)
  │      │      └─ Fail-Closed: metadata query exception or empty columns -> SecurityException
  │      ├─ Match effective rules per table:
  │      │      ├─ AUTO_BY_COLUMN: apply if table has column & not in excludeTables; else skip
  │      │      └─ STRICT_TABLES: apply to target tables; Fail-Closed if target lacks column
  │      └─ OpenApiSqlTenantRewriter.rewriteSqlForRules(sql, tableMatchedRules, boundSchema)
  │           ├─ Traverse PlainSelect / SetOperationList (UNION) / WithItem (CTE) / SubSelect
  │           ├─ For each physical Table node: build (col1 = 'v' AND col2 IN (...)) predicate
  │           └─ Wrap existing WHERE/ON in (...) and combine via AND (preserving LEFT/RIGHT JOIN)
  ▼
OpenApiWarehouseExecutor.executeQuery(..., rewrittenSql, ...)
  │  (Read-only Connection, 10s timeout, 1000-row cap, dynamic masking)
  ▼
job_api_log (Async audit log)
```

## Goals / Non-Goals

**Goals:**
- Upgrade datasource-scoped single-tenant isolation into general field-level row filtering (`0..N` rules per datasource, any business column such as `tenant_id`, `dept_id`, `org_id`, `area_code`).
- Support automatic skipping of tables that do not physically contain the rule's column (`AUTO_BY_COLUMN`), eliminating manual exempt-table blacklists for large warehouses with mixed public/dimension tables.
- Preserve strict Fail-Closed guarantees: metadata lookup failures never skip filtering, `STRICT_TABLES` fails closed on missing columns, cross-schema references are blocked whenever any filter rule is active, and `OR`/outer-join bypasses remain impossible.
- Give admins clear visibility in Tab 8 UI showing which tables match which rules before saving.

**Non-Goals:**
- Non-equality operators (`LIKE`, `!=`, `>`, `<`, `IS NULL`, regex) — explicitly deferred; rules remain strict `=` / `IN` equality predicates for safety and index usage.
- Cross-row dynamic expressions or client-supplied filter parameter overrides.
- Eliminating `DatabaseAuth` JSON backward compatibility (existing Phase 1 JSON keeps working without migration scripts).

## Decisions

### Decision 1: `RowFilterRule` Model inside `DatabaseAuth` with Backward-Compatible Normalization
- **Choice**: Add `List<RowFilterRule> rowFilterRules` to `OpenApiPermissionUtil.DatabaseAuth`:
  - `String column`: valid SQL identifier (`^[a-zA-Z_][a-zA-Z0-9_]{0,63}$`).
  - `List<String> values`: non-empty list of safe tokens (`^[a-zA-Z0-9_-]{1,64}$`), rewritten as `= 'v'` (size 1) or `IN ('v1', 'v2')` (size > 1).
  - `String matchMode`:
    - `AUTO_BY_COLUMN` (default): automatically apply to any involved physical table whose metadata contains `column` (case-insensitive), unless the table is listed in `excludeTables`.
    - `STRICT_TABLES`: strictly apply to tables listed in `tables` (or all tables when `tables` contains `*` / `allTablesScope`—specifically, if `tables` is empty/wildcard in strict mode, enforce on all tables except `excludeTables`); if a target table lacks `column`, reject with `SecurityException`.
  - `List<String> tables`: normalized lowercase table names (used in `STRICT_TABLES`; if empty in `STRICT_TABLES`, treats all allowed tables minus `excludeTables` as strict targets).
  - `List<String> excludeTables`: normalized lowercase table names excluded from the rule.
- **Backward Compatibility**:
  - Retain `tenantIsolationEnabled`, `tenantColumn`, `tenantValues`, `tenantExemptTables` on `DatabaseAuth`.
  - Provide `OpenApiPermissionUtil.resolveEffectiveRules(DatabaseAuth auth)`: if `rowFilterRules` is non-empty, return `rowFilterRules`; otherwise, if `Boolean.TRUE.equals(auth.getTenantIsolationEnabled())`, synthesize one `RowFilterRule` with `column = tenantColumn`, `values = tenantValues`, `matchMode = STRICT_TABLES`, `tables = []` (all non-excluded), `excludeTables = tenantExemptTables`.
- **Rationale**: Zero database schema changes, seamless upgrade for any existing accounts, and clean separation between "auto-skip tables without column" (`AUTO_BY_COLUMN`) and "strictly require column" (`STRICT_TABLES`).
- **Alternative Considered**: Adding a separate relational table `job_api_row_rule`. Rejected because `DatabaseAuth` JSON is already parsed per request, versioned with the account, and edited atomically in Tab 8.

### Decision 2: Metadata-Driven Rule Resolution & Fail-Closed Error Handling
- **Choice**: In `JobOpenApiController#executeReadOnlySql`, once `involvedTables` is extracted:
  1. Fetch `Set<String> columnSet = getCachedTableColumnSet(datasourceId, tbl)` for every physical table in `involvedTables` (5-minute `LocalCacheUtil` cache; throws `SecurityException` if metadata lookup fails or returns empty columns).
  2. Build `Map<String, List<RowFilterRule>> tableRuleMap`: for each `tbl` and each effective `RowFilterRule`:
     - Normalize `col = rule.getColumn().toLowerCase()` and `tblLower = tbl.toLowerCase()`.
     - If `rule.getExcludeTables().contains(tblLower)` → skip this rule for `tbl`.
     - If `matchMode == AUTO_BY_COLUMN`: if `columnSet.contains(col)` → bind rule to `tbl`; else skip.
     - If `matchMode == STRICT_TABLES`: check if `tblLower` is targeted (`rule.getTables().isEmpty()` means all non-excluded tables, otherwise `rule.getTables().contains(tblLower)`). If targeted: require `columnSet.contains(col)` or throw `SecurityException("表 [" + tbl + "] 未包含过滤字段 [" + rule.getColumn() + "]...")`, then bind rule to `tbl`.
- **Rationale**: Prevents silent data exposure during DB connectivity glitches (metadata error still fails closed) while completely eliminating manual exempt-table maintenance in `AUTO_BY_COLUMN` mode.

### Decision 3: Multi-Rule AST Injection in `OpenApiSqlTenantRewriter`
- **Choice**: Refactor `OpenApiSqlTenantRewriter` to accept a per-table rule resolver (e.g., `rewriteSqlForRules(String sql, Map<String, List<RowFilterRule>> tableRulesMap, String allowedSchema)` or `Function<String, List<RowFilterRule>>`), while keeping `rewriteSqlForTenant(sql, auth, allowedSchema)` delegating through `resolveEffectiveRules` + single-rule fallback for backward-compatible unit calls.
- When `processFromItemAndBuildPredicate` visits a physical `Table`:
  - Validate schema prefix (`validateTableSchema`).
  - Skip CTE virtual references (`cteNames`).
  - Look up `List<RowFilterRule> matchedRules` for `cleanTableName.toLowerCase()`.
  - If empty → return `null`.
  - If non-empty → build one equality/`IN` `Expression` per rule and combine them with `AndExpression` (`(r1 AND r2 ...)` or sequentially via `combineWithAnd`), then inject into `WHERE` / `LEFT JOIN ON` / `RIGHT JOIN ON` using the exact existing outer-join & parenthesis-wrapping logic.
- **Rationale**: Reuses all proven AST traversal, `OR` parenthesis wrapping, `LEFT/RIGHT JOIN` handling, `UNION`, and `WITH` CTE isolation logic without duplicating parser visitors.

### Decision 4: Admin Table-Rule Hit Preview Endpoint & Metadata Disclosure
- **Choice**:
  - **Open Metadata API (`GET /api/open/v1/metadata/tables`)**: For each authorized table, after fetching `columns`, match `effectiveRules` against the table's real columns and include:
    - `rowIsolated` (`boolean`, `true` if >= 1 rule applies to this table)
    - `filterColumns` (`List<String>`, column names applied to this table, e.g. `["tenant_id", "dept_id"]`)
    - Keep `tenantIsolated` (`boolean`, `rowIsolated || legacyEnabled`) for backward compatibility with callers inspecting Phase 1 metadata fields.
  - **Admin UI Preview (`JobOpenAdminController`)**: Add an endpoint (e.g. `POST /api/open/admin/account/previewRuleMatches`) accepting `{ datasourceId, tables, rowFilterRules }` that inspects cached table columns and returns `{ tableName: ["tenant_id", ...] }` so Tab 8 UI can display live match badges (`[过滤: tenant_id]` vs `[无匹配字段-全行]`) alongside the table checklist.
- **Rationale**: Without a match preview, an admin configuring `AUTO_BY_COLUMN` on `tenant_id` might not notice that table `oa_corp_bill` actually names its column `corp_id` instead of `tenant_id`. Live badges make missing rules immediately visible at configuration time.

## Risks / Trade-offs

- **Risk: Column-name mismatch across tables in `AUTO_BY_COLUMN` mode (`tenant_id` vs `corp_id`)** → Mitigation: Provide live rule-match badges in Tab 8 table checklist (`[无匹配字段-全行]`) and expose `filterColumns` in `/api/open/v1/metadata/tables` so admins see uncovered tables immediately and can add a second rule for `corp_id` or switch sensitive tables to `STRICT_TABLES`.
- **Risk: Batch column scanning on 200+ tables in Tab 8 UI preview could be slow on cold cache** → Mitigation: Only trigger preview on demand ("🔍 预览命中字段") or asynchronously for currently visible/authorized tables, reusing `LocalCacheUtil` 5-minute column cache (`OPEN_API_TBL_COLS_<dsId>_<table>`).
- **Risk: Multi-rule `AND` chains in `LEFT JOIN ... ON` or `WHERE`** → Mitigation: Wrap existing `WHERE`/`ON` in `Parenthesis` before appending each `AND` predicate so operator precedence holds identically for 1 or N rules.

## Migration Plan

1. **Zero-downtime JSON upgrade**: Deploy updated `OpenApiPermissionUtil`, `OpenApiSqlTenantRewriter`, `JobOpenApiController`, `JobOpenAdminController`, and `tab8_open_api.js`. Existing accounts with `tenantIsolationEnabled: true` continue functioning seamlessly via `resolveEffectiveRules` fallback; when re-saved in Tab 8 UI, they migrate cleanly to `rowFilterRules`.
2. **Rollback**: Removing rules from a datasource in Tab 8 reverts it to table-level whitelist mode with zero DDL rollback required.
