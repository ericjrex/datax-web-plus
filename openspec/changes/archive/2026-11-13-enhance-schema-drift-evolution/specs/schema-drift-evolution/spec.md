# Spec Delta

## Purpose

为 DataX 同步任务提供“源端物理表、目标端物理表与任务配置”三方元数据漂移探测及分级演进能力，支持全数据库自动演进表注释与字段注释，并对字段类型调整与必填约束变更进行风险分级高亮标注、DDL 人工审查及安全审计。

## ADDED Requirements

### Requirement: Three-Way Metadata Drift Detection Across All Supported Databases
When detecting schema drift for a DataX synchronization job, the system SHALL retrieve table comments, column comments, full column data types (including length and precision), and column nullability from both the source physical table and the target physical table (when resolvable), and compare them alongside the configured job columns across all supported database dialects (MySQL, Hive/OBS, Doris, StarRocks, Oracle, PostgreSQL, ClickHouse, and SQL Server).

#### Scenario: Detect added and dropped columns alongside target metadata
- **WHEN** a user triggers batch or single-job drift detection and the source table has columns missing from or removed relative to the DataX job configuration
- **THEN** the system identifies added and dropped columns as before and includes source/target table comments, column comments, data types, and nullability comparison results in the drift report

#### Scenario: Detect table comment and column comment differences
- **WHEN** the source physical table comment or an existing column's comment differs from the target physical table comment (after whitespace trimming, treating `null` and empty strings as equivalent)
- **THEN** the system records the table comment difference (`targetComment -> sourceComment`) and affected column comment differences in the drift result

#### Scenario: Detect column data type or precision changes after cross-database normalization
- **WHEN** a source column's mapped target data type or length/precision differs from the target physical column's data type (for example `varchar(50)` expanded to `varchar(200)`, or `int` changed to `bigint` or `varchar`)
- **THEN** the system records a column type change item classifying safe widening changes separately from potentially lossy narrowing or incompatible cross-family conversions, without raising false positives for equivalent cross-database mapped types

#### Scenario: Detect column nullability (required/optional) changes
- **WHEN** a source column's nullability differs from the target physical column's nullability (`NULL` changed to `NOT NULL` or `NOT NULL` changed to `NULL`)
- **THEN** the system records a column nullability change item indicating whether the column became required (`NOT NULL`) or optional (`NULL`)

#### Scenario: Graceful degradation when target physical table is unreachable or absent
- **WHEN** a job's target physical table cannot be resolved or does not yet exist during detection
- **THEN** the system preserves source-vs-job added/dropped column detection and records a non-blocking warning instead of failing the entire detection item

### Requirement: Dialect-Specific Safe Comment and Column Modification DDL Generation
The system SHALL generate dialect-accurate DDL scripts for altering table comments, altering column comments, and modifying column types or nullability across all supported target databases while preserving existing target column definitions and intercepting forbidden destructive SQL statements.

#### Scenario: Preserve existing column type and nullability when altering comments in MySQL, Doris, StarRocks, and Hive
- **WHEN** generating automatic comment-evolution DDL for a column whose comment changed in MySQL, Doris, StarRocks, or Hive
- **THEN** the system preserves the target column's existing full data type and nullability constraint inside the generated statement (such as `MODIFY COLUMN` or `CHANGE COLUMN`) so altering a comment never silently resets column length or `NOT NULL` constraints

#### Scenario: Generate dialect-specific comment statements for PostgreSQL, Oracle, ClickHouse, and SQL Server
- **WHEN** generating comment-evolution DDL for PostgreSQL, Oracle, ClickHouse, or SQL Server
- **THEN** the system emits dialect-compliant statements (`COMMENT ON` for PostgreSQL/Oracle, `MODIFY COMMENT` / `COMMENT COLUMN` for ClickHouse, and `sp_addextendedproperty` / `sp_updateextendedproperty` for SQL Server depending on whether the target comment already exists)

#### Scenario: Generate reviewable DDL for column type and nullability changes with Hive compatibility handling
- **WHEN** a column type or nullability drift item exists on a target table
- **THEN** the system generates a reviewable suggested DDL script for databases that support column type/nullability alteration, and for Hive/OBS targets marks `NOT NULL` enforcement as unsupported by target DDL while still reporting the source requirement

#### Scenario: Reject forbidden destructive DDL statements
- **WHEN** a generated or user-edited DDL script contains forbidden destructive commands (`DROP DATABASE`, `DROP TABLE`, `DROP COLUMN`, `TRUNCATE TABLE`, `ALTER USER`, `GRANT`, `REVOKE`)
- **THEN** the system blocks execution with a security interception error

### Requirement: Tiered Evolution Execution (Auto-Apply Comments vs Manual Review for Type and Nullability)
The system SHALL enforce a strict safety boundary between automatic and manual schema evolution: automatic evolution SHALL apply only safe changes (added columns, dropped job-config column cleanup, and table/column comment updates), whereas column type changes and nullability changes SHALL require explicit human review and manual confirmation before execution.

#### Scenario: Auto-apply executes safe changes and skips type/nullability DDL
- **WHEN** a user triggers batch auto-evolution (`autoApply = true`) on a job that has both comment/added-column changes and column type or nullability changes
- **THEN** the system automatically executes only the safe DDL (added columns and comment updates) and updates the job configuration, while leaving type and nullability changes pending manual review with clear status feedback

#### Scenario: Manual review and execution of type or nullability DDL
- **WHEN** a user reviews and optionally edits the suggested DDL for a job with type or nullability changes and confirms manual execution
- **THEN** the system validates the DDL against security rules, executes it on the target datasource, updates `writer.parameter.column` types in the job configuration if applicable (such as `hdfswriter` object column arrays), and records an audit snapshot

#### Scenario: Batch manual review and execution of type or nullability DDL with secondary confirmation
- **WHEN** a user selects or marquee-selects multiple jobs containing pending type or nullability changes and triggers batch manual DDL review
- **THEN** the system opens a batch review modal listing affected tables, risk levels, and per-job editable DDL scripts, requires an explicit secondary confirmation before execution, executes each confirmed job's reviewed DDL via the manual-review scope, updates applicable job configurations, and reports a consolidated success/failure summary

### Requirement: Tab 3 Schema Drift Dashboard Highlighting and Audit Snapshot Display
The Tab 3 schema drift dashboard and history modal SHALL highlight comment changes, type changes (distinguishing safe widening from high-risk narrowing/incompatible changes), and required (`NOT NULL`) changes using Ant Design semantics and only the authorized Emoji whitelist, and SHALL persist structured drift details into `job_schema_drift_log`.

#### Scenario: Render highlighted badges and review modal for detected changes
- **WHEN** drift detection returns comment, type, or nullability changes for one or more jobs
- **THEN** the Tab 3 drift dashboard displays summary counts and per-row highlighted badges showing `old -> new` comparisons, provides both single-job and batch editable DDL review modals with secondary confirmation for type/nullability changes, and uses pure text for unwhitelisted buttons and modal titles

#### Scenario: Persist and render structured drift history snapshots
- **WHEN** a drift detection or evolution operation completes and a user opens the job's evolution history modal
- **THEN** the system persists added/dropped columns alongside comment, type, and nullability change details in the drift log snapshot and displays them clearly in the history cards
