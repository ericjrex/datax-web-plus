# Spec Delta

## MODIFIED Requirements

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
