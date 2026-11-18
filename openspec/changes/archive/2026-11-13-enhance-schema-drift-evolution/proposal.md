# Proposal

## Why

当前 Tab 3 元数据漂移探测与模式演进仅按“字段名集合”比对源端物理表与 DataX 任务配置（`jobJson`），既无法感知源库新增或修改的表/字段注释（`comment`），也无法识别已有字段的必填约束（`NOT NULL` / `NULL`）变更及数据类型/长度精度调整，导致数仓目标表长期缺少注释说明、字段类型或非空约束失真且缺乏风险预警。本次变更新增“源物理表 vs 目标物理表 vs 任务配置”三方元数据对比能力，支持全数据库自动演进表与字段注释，并对字段类型与必填变更进行高亮标注和人工审查后手动执行。

## What Changes

- **三方元数据采集与对比**：探测阶段同时抓取源端物理表与目标端物理表的表注释、字段注释、完整字段类型（含长度与精度）及可空性（`NULL` / `NOT NULL`），在保留原有新增/删除字段探测的基础上，新增表注释差异、字段注释差异、字段类型/精度差异与字段必填差异的对比识别。
- **全数据库类型归一化与方言 DDL 生成**：覆盖系统 `DDLGeneratorFactory` 支持的全部数据库（MySQL、Hive/OBS、Doris、StarRocks、Oracle、PostgreSQL、ClickHouse、SQL Server），支持生成安全改注释 DDL 以及类型/必填变更建议 DDL，并在异库对比时先经过类型映射转换避免误报。
- **分级演进执行策略**：
  - 勾选自动演进（`autoApply`）或一键自动演进时，仅自动执行安全变更（新增字段、剔除源端已删字段、表与字段 `comment` 变更），绝不自动执行字段类型或必填变更 DDL。
  - 字段类型调整与必填变更在前端演进看板高亮标注（区分无损扩容与有损/强约束高风险），提供单任务及多任务**批量审查 DDL** 预览编辑弹窗，并在执行前增加**二次确认**防护，由人工审查后手动确认执行；若涉及 `hdfswriter` 对象数组列配置，手动演进后同步更新 `jobJson` 中对应列类型。
- **前端演进看板与审计快照增强**：在 Tab 3 演进看板、统计栏、变更明细列、确认弹窗与历史快照卡片中清晰展示表/字段注释、类型、必填变动明细，保持 Ant Design 规范与 5 类白名单图标约束，并将新增/扩展明细持久化到 `job_schema_drift_log.drift_detail_json`。

## Capabilities

### New Capabilities
- `schema-drift-evolution`: 基于源物理表、目标物理表与 DataX 任务配置的三方元数据漂移探测与分级演进能力，涵盖全数据库表/字段注释自动演进，以及字段类型调整与必填变更的高亮标注、DDL 审查预览和手动执行审计。

### Modified Capabilities
<!-- 无既有 Spec 需要修改 -->

## Impact

- **后端核心模块**：
  - `datax-admin` 元数据探测与 DDL 生成层：`BaseDDLGenerator` 及其 7 个数据库方言实现（MySQL、Hive、Doris/StarRocks、Oracle、PostgreSQL、ClickHouse、SQL Server）、`DataTypeConverterFactory` 与类型转换器、元数据查询工具（`BaseQueryTool` / `TableDataQueryTool` / `DatasourceQueryService`）。
  - 漂移服务与 DTO：`SchemaDriftServiceImpl`、`SchemaDriftItemDto`、`BatchSchemaDriftResultDto`、`ApplySchemaEvolutionDto`、`ColumnMappingDto` 及新增差异明细 DTO。
- **前端界面**：`datax-admin/src/main/resources/static/static/js/assistant/tabs/tab3_batch_job.js`（Tab 3 模式演进看板弹窗、DDL 审查编辑弹窗、历史快照弹窗）。
- **数据库存储**：沿用现有 `job_schema_drift_log` 表的 `drift_detail_json`、`drift_type` 与 `target_ddl` 字段（无需破坏性表结构变更；若扩展 `drift_type` 枚举说明将同步更新注释）。
- **安全与兼容性**：保持既有高危 SQL 拦截正则（禁止 `DROP DATABASE`/`DROP TABLE`/`DROP COLUMN`/`TRUNCATE` 等），保持 Hive 不支持列级 `NOT NULL` 约束的兼容性提示，避免 MySQL/Doris 改注释时误擦除原有类型与非空约束。
