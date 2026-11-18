# Spec Delta: open-api-manage-ui

## Purpose

在 DataX 智能助手中提供开箱即用的开放 API 账号管理、多库表权限可视化勾选配置与全链路调用审计日志查询界面，实现权限与风控的全流程闭环管理。

## ADDED Requirements

### Requirement: API Account Lifecycle and Credential Management UI
The system SHALL provide an administrative user interface to list, create, edit, delete, enable/disable API accounts, and safely view or reset their AccessKey and AppSecret credentials.

#### Scenario: Successfully create a new API account with generated credentials
- **WHEN** administrator opens the account creation modal, enters account name, configures database and table permissions, fills optional IP whitelist and QPS limit, and submits
- **THEN** system automatically generates a unique AccessKey and secure AppSecret, persists the account, and displays the credentials for copy confirmation

#### Scenario: Toggle account active status
- **WHEN** administrator clicks the enable/disable switch on an existing account in the list
- **THEN** system updates the account status immediately and blocks subsequent API calls if disabled

#### Scenario: Delete an existing account
- **WHEN** administrator confirms deletion of a specific API account
- **THEN** system removes the account configuration and denies all future requests with that AccessKey

### Requirement: Multi-Database Binding and Table Checklist Authorization UI
The system SHALL provide an interactive user interface allowing administrators to bind multiple target datasources, dynamically inspect tables under each selected database along with Chinese comments, and grant table access via an interactive checklist (with search filter, select all / deselect all, and wildcard options).

#### Scenario: Bind multiple databases to an account
- **WHEN** administrator selects or adds one or more target datasources in the account editor
- **THEN** system maintains each database's authorization entry and allows switching between databases to configure table permissions independently

#### Scenario: Search and check specific tables under a database
- **WHEN** administrator selects a database, filters tables by name or comment in the search box, and checks specific table checkboxes
- **THEN** system records the authorized table set for that database and displays an accurate badge of selected count (e.g., "已授权 3 / 11 张表")

#### Scenario: Grant all-tables wildcard permission for a specific database
- **WHEN** administrator checks the "允许访问该库全部表 (*)" option for a database
- **THEN** system disables individual table selection for that database and grants access to all non-system tables under it

### Requirement: API Call Audit Log Filtering and SQL Detail Inspection
The system SHALL provide a dedicated audit log interface supporting multi-dimensional filtering and a modal dialog to inspect the executed SQL text, involved tables, execution duration, and failure reasons.

#### Scenario: Multi-condition log search
- **WHEN** administrator filters audit logs by AccessKey, execution status (success/intercepted/failed), and date range
- **THEN** system renders the paginated log list showing invocation time, client IP, target datasource, result rows, latency, and status tag

#### Scenario: View full SQL execution details and interception reason
- **WHEN** administrator clicks "View Details" on an intercepted or slow query record
- **THEN** system opens a modal showing the exact SQL formatted in a code block, the AST-extracted table list, and the security interception message

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
