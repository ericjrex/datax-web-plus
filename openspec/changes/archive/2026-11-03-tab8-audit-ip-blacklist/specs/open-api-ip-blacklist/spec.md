# open-api-ip-blacklist Specification

## Purpose

在开放 API 安全网关与 Tab8 调用日志审计模块中提供客户端 IP 黑名单全生命周期管控能力，支持从审计日志现场单条或批量选中日志一键拉黑异常 IP、网关前置一票否决实时阻断、防误封本机回环地址保护及黑名单集中增删改查管理。

## ADDED Requirements

### Requirement: Single and Batch IP Blacklisting from Audit Logs
The system SHALL allow administrators to select a single audit log entry or multiple audit log entries in Tab 8 and add the corresponding `clientIp` into the IP blacklist with one click, automatically associating the source log metadata.

#### Scenario: Block client IP directly from a single audit log row or detail modal
- **WHEN** administrator clicks the "拉黑IP" action button on an audit log row or inside the log detail modal and confirms the block scope (global `*` or current account `appKey`) and reason
- **THEN** system persists the IP into the blacklist, refreshes the gateway in-memory blacklist cache immediately, and marks all log rows matching that IP with a "已拉黑" status badge

#### Scenario: Batch block multiple selected audit logs
- **WHEN** administrator selects multiple audit log rows (via row checkboxes, Shift range selection, or marquee selection) and clicks "批量拉黑选中IP"
- **THEN** system deduplicates the selected `clientIp` addresses, persists or re-activates their blacklist entries with auto-filled source log context, and returns the count of newly blocked IPs

#### Scenario: Quick unblock of an already blacklisted IP from audit logs
- **WHEN** administrator clicks "解封IP" on an audit log row whose `clientIp` is currently blacklisted
- **THEN** system disables or removes the corresponding active blacklist rule, refreshes the gateway cache immediately, and removes the "已拉黑" badge from the log list

### Requirement: Gateway IP Blacklist Priority Enforcement (Deny Overrides Allow)
The system SHALL enforce IP blacklist verification in the OpenAPI security gateway before signature verification and before IP whitelist checks, ensuring that any active blacklist rule (exact IP, wildcard `*`, or CIDR subnet) takes precedence over account IP whitelists.

#### Scenario: Request from globally blacklisted IP is rejected immediately
- **WHEN** a client sends an OpenAPI request from an IP matching an active global blacklist rule (`appKey = '*'`)
- **THEN** system immediately rejects the request with HTTP 403 Forbidden (`安全拦截: 客户端 IP [xxx] 已被列入黑名单`) and asynchronously records an audit log with `status = 2` (security interception)

#### Scenario: Request from account-scoped blacklisted IP is rejected even if in account whitelist
- **WHEN** a client sends an OpenAPI request using `appKey = 'ak_xxx'` from an IP that is present in both the account's `allowedIps` whitelist and an active blacklist rule for `ak_xxx` (or `*`)
- **THEN** system enforces deny-overrides-allow priority, rejects the request with HTTP 403 Forbidden, and records a security interception audit log

### Requirement: Loopback and Self-IP Anti-Lockout Protection
The system SHALL detect when an administrator attempts to blacklist a loopback address (`127.0.0.1`, `localhost`, `0:0:0:0:0:0:0:1`, `::1`) or the administrator's own current request IP, and require explicit high-risk confirmation to prevent accidental self-lockout of local MCP clients or gateway calls.

#### Scenario: Warning triggered when attempting to blacklist loopback or current admin IP
- **WHEN** administrator selects a log with `clientIp = '127.0.0.1'` (or the administrator's own IP) to add to the blacklist
- **THEN** system displays an explicit warning dialog alerting that blocking loopback/current IP will break local MCP tools or current client access, proceeding only if the administrator explicitly confirms

### Requirement: Centralized IP Blacklist Management UI
The system SHALL provide a centralized IP Blacklist management view in Tab 8 allowing administrators to search, manually add (`➕`), edit (`✏️`), enable/disable, and delete (`🗑️`) IP blacklist entries while strictly adhering to the workspace Emoji whitelist and Ant Design specifications.

#### Scenario: Search and manage IP blacklist entries
- **WHEN** administrator opens the IP Blacklist management panel and filters by IP keyword, `appKey`, or status
- **THEN** system displays the paginated blacklist records showing IP address/pattern, scope (Global `*` or specific account name + `appKey`), block reason, source log ID, status tag, update time, and action buttons
