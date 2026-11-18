# Spec Delta

## MODIFIED Requirements

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
