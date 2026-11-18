# Spec Delta

## MODIFIED Requirements

### Requirement: API Call Audit Log Filtering and SQL Detail Inspection
The system SHALL provide a dedicated audit log interface supporting multi-dimensional filtering (including AccessKey, client IP, client source/AI tool, execution status, and date range), row checkbox selection, visual blacklist badges on client IPs, caller browser/AI tool badges, and a modal dialog to inspect the executed SQL text, involved tables, client source, raw User-Agent, execution duration, and failure reasons.

#### Scenario: Multi-condition log search
- **WHEN** administrator filters audit logs by AccessKey, client IP, client source/AI tool keyword, execution status (success/intercepted/failed), and date range
- **THEN** system renders the paginated log list showing invocation time, caller account, client IP, caller terminal/AI tool badge, target tables, result rows, latency, and status tag

#### Scenario: View full SQL execution details and interception reason
- **WHEN** administrator clicks "View Details" on an intercepted or slow query record
- **THEN** system opens a modal showing the exact SQL formatted in a code block, the AST-extracted table list, the normalized client source and raw User-Agent, and the security interception message
