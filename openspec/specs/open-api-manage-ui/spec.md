# open-api-manage-ui Specification

## Purpose

在 DataX 智能助手中提供开箱即用的开放 API 账号管理、多库表权限可视化勾选配置与全链路调用审计日志查询界面，实现权限与风控的全流程闭环管理。

## Requirements

### Requirement: API Account Lifecycle and Credential Management UI
The system SHALL provide an administrative user interface to list, create, edit, delete, enable/disable API accounts, safely view or reset their AccessKey and AppSecret credentials, and display datasource authorization summaries including active row-level field filter rules.

#### Scenario: Successfully create a new API account with generated credentials
- **WHEN** administrator opens the account creation modal, enters account name, configures database, table, and optional field-level row filter rules, fills optional IP whitelist and QPS limit, and submits
- **THEN** system automatically generates a unique AccessKey and secure AppSecret, persists the account, and displays the credentials for copy confirmation

#### Scenario: Account list summary displays field filter rule scope
- **WHEN** an API account has one or more active row filter rules configured on bound datasources
- **THEN** the "已授权数据源与表" column in the account list displays the bound field filter summary (such as `过滤: tenant_id=1001`) alongside the datasource and table count

#### Scenario: Toggle account active status
- **WHEN** administrator clicks the enable/disable switch on an existing account in the list
- **THEN** system updates the account status immediately and blocks subsequent API calls if disabled

#### Scenario: Delete an existing account
- **WHEN** administrator confirms deletion of a specific API account
- **THEN** system removes the account configuration and denies all future requests with that AccessKey

### Requirement: Multi-Database Binding and Table Checklist Authorization UI
The system SHALL provide an interactive user interface allowing administrators to bind multiple target datasources, dynamically inspect tables under each selected database along with Chinese comments, grant table access via an interactive checklist (with search filter, select all / deselect all, and wildcard options), configure multiple per-datasource field-level row filter rules, and preview which tables match the configured rules.

#### Scenario: Bind multiple databases to an account
- **WHEN** administrator selects or adds one or more target datasources in the account editor
- **THEN** system maintains each database's authorization entry and allows switching between databases to configure table permissions and row filter rules independently

#### Scenario: Search and check specific tables under a database
- **WHEN** administrator selects a database, filters tables by name or comment in the search box, and checks specific table checkboxes
- **THEN** system records the authorized table set for that database and displays an accurate badge of selected count (e.g., "已授权 3 / 11 张表")

#### Scenario: Grant all-tables wildcard permission for a specific database
- **WHEN** administrator checks the "允许访问该库全部表 (*)" option for a database
- **THEN** system disables individual table selection for that database and grants access to all non-system tables under it

#### Scenario: Add and configure multiple field-level row filter rules for a datasource
- **WHEN** administrator switches to a datasource tab in the account editor, adds one or more field filter rules specifying column name (such as `tenant_id` or `dept_id`), comma-separated allowed values, match mode (`AUTO_BY_COLUMN` or `STRICT_TABLES`), and optional target/excluded tables
- **THEN** system validates each rule before saving, persists the rule list inside that datasource's JSON configuration, and keeps other datasources' rules independent

#### Scenario: Preview table rule matches in the table checklist
- **WHEN** administrator configures row filter rules for a datasource and triggers rule-match preview (or inspects the table list)
- **THEN** system inspects table column metadata and renders per-table badges indicating matched filter columns (such as `过滤: tenant_id`) or unmatched status (`无匹配字段-全行`) so missing rules are immediately visible

#### Scenario: Validation prevents saving incomplete row filter rule
- **WHEN** administrator adds a row filter rule with an empty column name, invalid identifier, or empty allowed values and clicks "保存"
- **THEN** system blocks submission and prompts the administrator to complete or remove the invalid rule

### Requirement: API Call Audit Log Filtering and SQL Detail Inspection
The system SHALL provide a dedicated audit log interface supporting multi-dimensional filtering (including AccessKey, client IP, execution status, and date range), row checkbox selection (single, Shift-range, and marquee selection), visual blacklist badges on client IPs, one-click IP blacklisting/unblocking actions, and a modal dialog to inspect the executed SQL text, involved tables, execution duration, and failure reasons.

#### Scenario: Multi-condition log search
- **WHEN** administrator filters audit logs by AccessKey, client IP keyword, execution status (success/intercepted/failed), and date range
- **THEN** system renders the paginated log list showing selection checkboxes, invocation time, caller account name and AccessKey, client IP (with a "已拉黑" red tag if currently blacklisted), involved tables, result rows, latency, status tag, and row actions (`🔍 详情`, `拉黑IP` / `解封IP`)

#### Scenario: View full SQL execution details and interception reason
- **WHEN** administrator clicks "🔍 详情" on an intercepted or slow query record
- **THEN** system opens a modal showing the exact SQL formatted in a code block, the AST-extracted table list, the security interception message, and a quick button to add or remove the log's client IP from the blacklist

### Requirement: Role-Based Access Control and Menu Integration
The system SHALL integrate the API management panel into the assistant navigation tabs, restricting access strictly to administrators.

#### Scenario: Non-admin user access attempt
- **WHEN** a user without administrator role attempts to view the API management tab or invokes administrative CRUD endpoints
- **THEN** system denies access and hides the management controls according to the platform role-guard policy

### Requirement: API Integration Documentation and Guide Modal UI
The system SHALL provide an interactive API documentation view in Tab 8, allowing administrators to inspect gateway base URLs, authentication headers and signature algorithm formulas, available endpoints, and cURL/Python request examples directly within the interface.

#### Scenario: Open API documentation modal from Tab 8 header
- **WHEN** administrator clicks the "API 说明" button on the Tab 8 toolbar or inside the credentials modal
- **THEN** system displays a structured documentation modal with signature computation rules, available endpoints, and copyable code snippets

### Requirement: Unified Development and Design Specification Compliance
Tab 8 and all associated sub-pages, modals, and toolbars SHALL strictly comply with the workspace assistant development rules (`assistant_development_rules.md`), specifically respecting Emoji whitelists, pure text titles, "条" quantifiers, Ant Design color palette, and robust XSS/date handling.

#### Scenario: Modal titles and buttons conform to Emoji whitelist
- **WHEN** opening any sub-page or modal in Tab 8 (account list, log audit, credentials, API doc, preview, or log detail)
- **THEN** modal titles and unwhitelisted action buttons SHALL use pure text without unapproved Emoji icons, strictly preserving the 5 whitelisted operational Emoji categories (`🚀`, `🔍`, `➕`, `✏️`, `🗑️`)

#### Scenario: Quantifier uniformity
- **WHEN** rendering counts, truncation notices, and table pagination
- **THEN** system SHALL strictly use the quantifier "条" and avoid "行/Rows"

### Requirement: Selected Tables Inspection and Filtering in Account Editor
The system SHALL allow administrators to filter the active datasource's table checklist to show only selected tables and to open a cross-datasource summary view of all currently selected tables in the account editor modal.

#### Scenario: Filter current datasource table list to show only selected tables
- **WHEN** administrator toggles the "仅看已选" filter mode in the table control bar of the account editor
- **THEN** system filters the visible rows to only tables currently authorized under the active datasource (combined with any search keyword), allowing direct inspection or deselection without scrolling through unselected tables

#### Scenario: View cross-datasource summary of all selected tables
- **WHEN** administrator clicks the authorization count badge or the "已选表" summary action in the account editor
- **THEN** system opens a summary dialog listing every bound datasource and its authorized tables (or `*` wildcard indicator), with one-click copy of table names and individual table removal

### Requirement: Cross-Account Datasource and Table Permission Synchronization
The system SHALL allow administrators to synchronize datasource and table permissions from another existing API account into the account currently being edited, supporting single or multiple datasources/tables, explicit merge mode selection (append vs overwrite), and an explicit prompt on whether to include row-level field filter rules.

#### Scenario: Select source account and single or multiple datasources to synchronize
- **WHEN** administrator clicks "从其他账号同步" in the account editor and selects a source API account
- **THEN** system lists all datasources configured on the source account with table counts and rule indicators, allowing the administrator to check one or multiple datasources and optionally expand a datasource to pick a subset of tables

#### Scenario: Synchronize permissions using append or overwrite mode
- **WHEN** administrator confirms synchronization after choosing "追加合并" or "覆盖替换"
- **THEN** for each selected datasource, system adds missing datasources to the target editor state, merges table sets by union in append mode (preserving existing tables) or replaces the target datasource's table set in overwrite mode, and leaves unrelated datasources untouched

#### Scenario: Prompt whether to include row-level field filter rules during synchronization
- **WHEN** administrator configures a permission synchronization from a source account whose selected datasources contain row-level field filter rules
- **THEN** system presents an explicit option (unchecked by default) asking whether to synchronize the source datasources' row-level field filter rules, only copying those rules into the target editor state when explicitly checked
