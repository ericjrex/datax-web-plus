# Spec Delta

## MODIFIED Requirements

### Requirement: API Call Audit Log Filtering and SQL Detail Inspection
The system SHALL provide a dedicated audit log interface supporting multi-dimensional filtering (including AccessKey, client IP, execution status, and date range), row checkbox selection (single, Shift-range, and marquee selection), visual blacklist badges on client IPs, one-click IP blacklisting/unblocking actions, and a modal dialog to inspect the executed SQL text, involved tables, execution duration, and failure reasons.

#### Scenario: Multi-condition log search
- **WHEN** administrator filters audit logs by AccessKey, client IP keyword, execution status (success/intercepted/failed), and date range
- **THEN** system renders the paginated log list showing selection checkboxes, invocation time, caller account name and AccessKey, client IP (with a "已拉黑" red tag if currently blacklisted), involved tables, result rows, latency, status tag, and row actions (`🔍 详情`, `拉黑IP` / `解封IP`)

#### Scenario: View full SQL execution details and interception reason
- **WHEN** administrator clicks "🔍 详情" on an intercepted or slow query record
- **THEN** system opens a modal showing the exact SQL formatted in a code block, the AST-extracted table list, the security interception message, and a quick button to add or remove the log's client IP from the blacklist
