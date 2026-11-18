# open-api-tenant-isolation Specification

## Purpose

为三方开放 API 提供基于数据源级多字段规则的行级数据过滤隔离能力，支持按物理表字段自动匹配过滤或指定表严格过滤，并在 SQL 抽象语法树层面强制以 `AND` 组合注入服务端绑定的等值或集合条件，兼顾多业务字段扩展与 Fail-Closed 安全防护。

## Requirements

### Requirement: Datasource-Scoped Field-Level Row Filter Rules
The system SHALL allow each authorized datasource entry of an API account to define zero or more server-side row filter rules, where each rule specifies a target column name (such as `tenant_id`, `dept_id`, `org_id`, or `area_code`), an immutable list of allowed values (evaluated via `=` for a single value or `IN` for multiple values), a match mode (`AUTO_BY_COLUMN` or `STRICT_TABLES`), optional target tables, and optional excluded tables, while remaining backward-compatible with legacy single-tenant isolation configurations.

#### Scenario: Account configured with multiple field filter rules on a datasource
- **WHEN** an administrator configures two row filter rules on a datasource (`tenant_id` = `1001` and `dept_id` IN `["10", "20"]`)
- **THEN** the system persists both rules within the datasource authorization entry and binds them strictly to the server-side account context

#### Scenario: Reject rule with empty values or invalid identifier characters
- **WHEN** an administrator configures a row filter rule with an empty value list, an invalid column identifier outside `[a-zA-Z_][a-zA-Z0-9_]*`, or values containing SQL control characters (quotes, semicolons, comments)
- **THEN** the system rejects the configuration with a validation error instead of persisting an unsafe or unconstrained rule

#### Scenario: Ignore client-supplied filter overrides at runtime
- **WHEN** an external caller submits a query request containing extra parameters or SQL comments attempting to override rule columns or values
- **THEN** the system enforces only the server-side rules bound to the authenticated AccessKey

#### Scenario: Backward compatibility with legacy single-tenant configuration
- **WHEN** an existing API account uses legacy single-tenant isolation fields without a `rowFilterRules` array
- **THEN** the system automatically interprets the legacy policy as an active strict row filter rule using its configured `tenantColumn`, `tenantValues`, and `tenantExemptTables`

### Requirement: Metadata-Driven Automatic Table Matching and Fail-Closed Safety
When a datasource has one or more active row filter rules, the system SHALL resolve applicable rules per physical table using verified table column metadata, automatically skipping tables that lack a rule's column in `AUTO_BY_COLUMN` mode while strictly failing closed on metadata retrieval failures, `STRICT_TABLES` missing columns, or cross-schema table prefixes.

#### Scenario: AUTO_BY_COLUMN injects predicate for tables containing the column and skips tables without it
- **WHEN** a datasource configures rule `tenant_id = 1001` in `AUTO_BY_COLUMN` mode and a caller joins `oa_user` (which has `tenant_id`) with `sys_dict` (which does not have `tenant_id`)
- **THEN** the system injects `tenant_id = '1001'` for `oa_user` and automatically skips `sys_dict` without requiring manual exempt table registration

#### Scenario: AUTO_BY_COLUMN respects explicit excludeTables
- **WHEN** a table physically contains `tenant_id` but is listed in the rule's `excludeTables`
- **THEN** the system skips injecting that rule for the excluded table

#### Scenario: Different tables in the same datasource filtered by different columns
- **WHEN** a datasource configures rule 1 (`tenant_id = 1001`, `AUTO_BY_COLUMN`) and rule 2 (`corp_id = 1001`, `AUTO_BY_COLUMN`), and a caller queries `oa_user` (has `tenant_id`) and `oa_bill` (has `corp_id`)
- **THEN** the system injects `tenant_id = '1001'` on `oa_user` and `corp_id = '1001'` on `oa_bill`

#### Scenario: STRICT_TABLES rejects target table lacking the configured column
- **WHEN** a rule is configured in `STRICT_TABLES` mode for a target table that does not physically contain the rule's column
- **THEN** the system blocks execution with a security/configuration error and records a security interception audit log rather than skipping filtering

#### Scenario: Metadata lookup failure fails closed even in AUTO_BY_COLUMN mode
- **WHEN** a caller queries a datasource with active row filter rules and retrieving physical column metadata for an involved table fails or returns empty columns
- **THEN** the system blocks query execution with a security interception error and never assumes the column is absent

#### Scenario: Cross-database table prefix blocked whenever any row filter rule is active
- **WHEN** a caller submits SQL referencing a schema-qualified table (such as `other_db.oa_user`) that does not match the authorized datasource's current schema while row filter rules are configured
- **THEN** the system blocks execution as a security violation before query execution

### Requirement: Recursive AST Multi-Rule Predicate Injection
When one or more row filter rules match a physical table, the system SHALL rewrite the read-only SQL query at the Abstract Syntax Tree (AST) level to inject all matched `=` or `IN` predicates combined with `AND` across main `FROM` clauses, `JOIN` clauses, subqueries, `UNION` branches, and `WITH` CTEs.

#### Scenario: Multiple matched rules on one table combined with AND
- **WHEN** table `oa_user` matches both `tenant_id = '1001'` and `dept_id IN ('10', '20')`
- **THEN** the system injects both predicates combined with `AND` for `oa_user`, wrapping any existing `WHERE` expression in parentheses to prevent `OR` precedence bypass

#### Scenario: Multi-table INNER JOIN and LEFT JOIN preserve outer join semantics
- **WHEN** caller submits `SELECT u.id, o.order_no FROM oa_user u LEFT JOIN oa_order o ON u.id = o.user_id` where both tables match active field rules
- **THEN** the system injects `u`'s matched predicates into `WHERE` and injects `o`'s matched predicates into the `LEFT JOIN ... ON` condition so unmatched left rows are preserved while unauthorized right-table rows are excluded

#### Scenario: Subquery, UNION, and WITH CTE isolation
- **WHEN** caller submits a query containing nested subqueries, `UNION ALL` branches, or `WITH` CTE definitions referencing physical tables
- **THEN** the system recursively injects each referenced physical table's matched field predicates while skipping duplicate injection on virtual CTE aliases

#### Scenario: Unsupported JOIN constructs blocked under active row filtering
- **WHEN** caller submits `NATURAL JOIN`, `JOIN ... USING`, or `FULL JOIN` against a datasource with active row filter rules
- **THEN** the system blocks execution with a security violation instructing the caller to use explicit `JOIN ... ON`
