# Tasks

## 1. Field-Level Row Filter Model and Admin Validation

- [x] 1.1 Refactor `OpenApiPermissionUtil` to introduce `RowFilterRule` (`column`, `values`, `matchMode` [`AUTO_BY_COLUMN` | `STRICT_TABLES`], `tables`, `excludeTables`) inside `DatabaseAuth.rowFilterRules`, implement `resolveEffectiveRules` with automatic fallback conversion from legacy `tenantIsolationEnabled` / `tenantColumn` / `tenantValues` / `tenantExemptTables` fields, and update `validateTenantPolicy` / `validateRowFilterRules` to validate identifiers and allowed value tokens across all rules.
- [x] 1.2 Update `JobOpenAdminController#saveAccount` to validate `rowFilterRules` for every `DatabaseAuth` entry, and add a table-rule match preview endpoint (`POST /api/open/admin/account/previewRuleMatches`) that inspects cached table columns and returns per-table matched filter column names for the UI.

## 2. Multi-Rule AST Rewriter and Cross-Schema Security Hardening

- [x] 2.1 Refactor `OpenApiSqlTenantRewriter` to support per-table multi-rule predicate injection (`rewriteSqlForRules(sql, tableRulesMap, allowedSchema)`), combining multiple matched rules per table with `AND` while preserving `OR` parenthesis wrapping, `LEFT`/`RIGHT JOIN` outer-join placement, `UNION`, `WITH` CTE virtual reference skipping, nested subqueries, cross-schema prefix blocking, and `NATURAL JOIN`/`USING`/`FULL JOIN` rejection; keep `rewriteSqlForTenant` as a compatible delegating wrapper.

## 3. Open API Runtime Enforcement and Metadata Exposure

- [x] 3.1 Update `JobOpenApiController#executeReadOnlySql` to activate strict cross-schema validation and metadata resolution whenever `resolveEffectiveRules(targetAuth)` is non-empty, resolve per-table matched rules using cached column sets (auto-skipping absent columns in `AUTO_BY_COLUMN`, rejecting missing columns in `STRICT_TABLES`, and failing closed on metadata lookup errors or empty column sets), invoke `OpenApiSqlTenantRewriter.rewriteSqlForRules`, and record `status = 2` audit logs on interception.
- [x] 3.2 Update `JobOpenApiController#fetchAuthorizedTablesForDatasource` (`GET /api/open/v1/metadata/tables`) to compute per-table matched filter columns from the table's real columns and expose `rowIsolated`, `filterColumns`, and backward-compatible `tenantIsolated` metadata fields.

## 4. Tab 8 Management UI Upgrade

- [x] 4.1 Upgrade `tab8_open_api.js` `openAccountModal` per-datasource workspace from the single tenant bar to a multi-rule "行级字段过滤规则" builder (add/remove rules with `column`, `values`, `matchMode` [`AUTO_BY_COLUMN` / `STRICT_TABLES`], optional `tables` / `excludeTables`), automatically convert legacy `tenantIsolationEnabled` accounts when editing, and add client-side validation for every configured rule.
- [x] 4.2 Add a rule-match preview trigger and per-table match badges (`过滤: col1, col2` vs `无匹配字段-全行`) inside the table checklist in `tab8_open_api.js`, and update `formatPermissionsSummary` in the account list to display the multi-rule summary (`过滤: col=val`) while adhering strictly to the 5-Emoji whitelist and pure-text button/title rules.

## 5. Unit Tests and End-to-End Verification

- [x] 5.1 Update and expand `OpenApiSecurityTest.java` to cover `AUTO_BY_COLUMN` skipping tables without the column, `STRICT_TABLES` failing closed on missing columns, same-datasource multi-table different columns (`tenant_id` + `corp_id`), single-table multi-rule `AND` combination across `WHERE` (`OR` protection) and `LEFT JOIN`, `excludeTables`, legacy `tenantIsolationEnabled` fallback compatibility, cross-schema rejection under `rowFilterRules`, and invalid rule config rejection (note: per workspace rules, do not execute `mvn` commands directly from agent; let user run IDE/Maven test verification).
