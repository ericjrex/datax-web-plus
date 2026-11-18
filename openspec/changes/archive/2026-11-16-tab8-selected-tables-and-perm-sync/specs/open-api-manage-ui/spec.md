# Spec Delta

## ADDED Requirements

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
