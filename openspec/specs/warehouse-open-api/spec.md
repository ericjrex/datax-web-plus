# warehouse-open-api Specification

## Purpose

提供三方系统与外部 AI 平台安全访问数仓数据的开放接口能力，覆盖凭证签名认证、多数据库授权库表元数据获取、基于 AST 语法树的只读 SQL 安全执行、防脏读门禁与全流程调用审计。

## Requirements

### Requirement: API Authentication and Anti-Replay
The system SHALL authenticate all incoming open API requests using enterprise-standard AccessKey and HMAC-SHA256 signature verification, and enforce anti-replay checks using timestamp and nonce.

#### Scenario: Valid signature and unexpired timestamp
- **WHEN** client sends a request with valid `accessKey`, `timestamp` within 5 minutes, unique `nonce`, and correct HMAC-SHA256 `sign`
- **THEN** system accepts the request and proceeds to the authorization and business logic phase

#### Scenario: Request rejected due to signature mismatch or expiration
- **WHEN** client sends a request with expired timestamp (> 300 seconds), reused nonce, or invalid HMAC signature
- **THEN** system immediately rejects the request with HTTP 401 and an authentication failure message without executing downstream queries

### Requirement: Authorized Multi-Database Metadata Query
The system SHALL provide an API to return authorized table structures and column comments strictly scoped by the account's multi-database permissions, masking system internal tables and sensitive columns, without requiring a fixed `domainCode`, and SHALL indicate per-table active row filter columns when field-level row filtering applies to a table.

#### Scenario: Query metadata for specific authorized datasource
- **WHEN** client requests metadata providing an authorized `datasourceId`
- **THEN** system returns the list of whitelisted tables under that datasource with table comments, column names, column data types, and column comments

#### Scenario: Query metadata across all authorized datasources
- **WHEN** client requests metadata without specifying `datasourceId`
- **THEN** system returns all authorized tables across all granted databases bound to the account

#### Scenario: Rejection when requesting an unauthorized datasource
- **WHEN** client requests metadata for a `datasourceId` not granted to the account
- **THEN** system rejects the request with an error indicating unauthorized database access

#### Scenario: Metadata indicates matched row filter columns per table
- **WHEN** client requests metadata for a datasource that has active row filter rules
- **THEN** system includes per-table row isolation indicators (`rowIsolated`, `filterColumns`, and backward-compatible `tenantIsolated`) showing which configured filter columns apply to each table without exposing restricted values of other tenants or departments

### Requirement: Multi-Database AST-Audited Safe SQL Query Execution
The system SHALL parse all submitted SQL queries into an Abstract Syntax Tree (AST), extract all referenced physical tables, verify that the target database and every referenced table is within the account's database permission whitelist, enforce read-only commands, resolve and apply any configured datasource-level field row filter rules via AST rewriting with fail-closed metadata and schema checks, and execute through a timeout-guarded read-only connection.

#### Scenario: Execution of authorized read-only SQL on specified database
- **WHEN** client submits a `SELECT` SQL and an authorized `datasourceId`, and all referenced tables are within that database's allowed table list (or wildcard `*`)
- **THEN** system executes the query on the target database's read-only connection with a 10-second timeout, truncates results to at most 1000 rows, and returns the structured dataset

#### Scenario: Execution under field row filter rules enforces matched predicates only
- **WHEN** client submits an authorized `SELECT` SQL against a datasource with active field row filter rules
- **THEN** system inspects cached column metadata for each referenced physical table, resolves the matched rules (`AUTO_BY_COLUMN` skips tables without the column; `STRICT_TABLES` fails closed on missing columns), rewrites the SQL AST with `AND`-combined `=` / `IN` predicates, executes the rewritten SQL, and returns only rows matching the authorized field values

#### Scenario: Rejection of query targeting unauthorized database
- **WHEN** client submits a query for a `datasourceId` not granted to the account
- **THEN** system rejects the query with an unauthorized database response

#### Scenario: Rejection of query with unauthorized table or cross-table JOIN
- **WHEN** client submits a SQL referencing at least one table not in the allowed table list for the target database
- **THEN** system blocks the execution and returns a security violation response identifying the unauthorized table

#### Scenario: Rejection of high-risk keywords or probing functions
- **WHEN** client submits a SQL containing write keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`) or probing/benchmark functions (`SLEEP`, `BENCHMARK`, `LOAD_FILE`)
- **THEN** system immediately intercepts the SQL and records a security interception event

#### Scenario: Rejection of row-filter bypass, metadata failure, or strict missing column
- **WHEN** client submits a query against a datasource with active row filter rules that references a cross-schema prefix outside the datasource, uses unsupported SQL constructs that cannot be safely rewritten, encounters a table column metadata failure, or hits a `STRICT_TABLES` table lacking the required filter column
- **THEN** system intercepts the query with `status = 2` (security interception) in audit logs and refuses execution

### Requirement: Batch Ready State Gate Check
The system SHALL verify the ETL batch execution state for statistics tables, refusing queries when the current batch calculation is still in progress to prevent dirty reads of incomplete data.

#### Scenario: Query allowed after batch completion
- **WHEN** client queries data and the domain/system latest batch status (`latest_ready_date`) is ready
- **THEN** system allows the query to proceed normally

#### Scenario: Query rejected during ETL batch computation
- **WHEN** client queries statistics data while the current batch is still running or unready
- **THEN** system responds with a message stating that the current batch is calculating and advises retry later

### Requirement: Full Audit Logging and Rate Limiting
The system SHALL record audit logs for every API call—including caller identity, client IP, target datasource, executed SQL, execution duration, returned rows, and result status—and enforce IP blacklist priority checks, IP whitelist checks, rate limiting, and failure cooldown.

#### Scenario: Complete audit record generated on query completion
- **WHEN** an API call completes (whether successful, failed, or blocked by AST/table/IP security rules)
- **THEN** system asynchronously records an audit log entry into `job_api_log` with execution metrics and status

#### Scenario: Request rate limit exceeded
- **WHEN** an account exceeds its configured QPS limit or triggers excessive consecutive security errors
- **THEN** system rejects subsequent calls with a rate-limiting or cooldown error code

#### Scenario: Request blocked by IP blacklist recorded in audit log
- **WHEN** an incoming OpenAPI request is rejected by the gateway due to matching an active IP blacklist rule
- **THEN** system rejects the request with HTTP 403 and asynchronously writes an audit log entry with `status = 2` (安全拦截) and the blacklist interception reason

### Requirement: Available API Endpoints and Signature Specification
The system SHALL expose standardized endpoints for metadata discovery and read-only query execution, protected by enterprise HMAC-SHA256 request signing.

#### Scenario: Metadata discovery endpoint definition
- **WHEN** client queries `GET /api/open/v1/metadata/tables` with signature headers and optional `datasourceId`
- **THEN** system returns authorized databases, tables with Chinese comments, and field metadata formatted as JSON

#### Scenario: SQL execution endpoint definition
- **WHEN** client invokes `POST /api/open/v1/sql/execute` with JSON body `{ "datasourceId": 8, "sql": "SELECT ... LIMIT 100" }`
- **THEN** system validates AST, enforces read-only guardrails, executes on the target datasource, and returns column headers and row data
