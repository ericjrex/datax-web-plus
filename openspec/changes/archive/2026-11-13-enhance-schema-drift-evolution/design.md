# Design

## Context

当前元数据漂移实现位于 [SchemaDriftServiceImpl.java](file:///d:/code/not_itc/datax-web/datax-admin/src/main/java/com/wugui/datax/admin/service/impl/SchemaDriftServiceImpl.java)、[BaseDDLGenerator.java](file:///d:/code/not_itc/datax-web/datax-admin/src/main/java/com/wugui/datax/admin/tool/meta/ddl/BaseDDLGenerator.java) 及其 7 个数据库实现类，前端界面位于 [tab3_batch_job.js](file:///d:/code/not_itc/datax-web/datax-admin/src/main/resources/static/static/js/assistant/tabs/tab3_batch_job.js)。动机与范围见 [proposal.md](file:///d:/code/not_itc/datax-web/openspec/changes/enhance-schema-drift-evolution/proposal.md)。

现有代码有三个结构性约束决定本次方案设计：
1. `JobInfo.jobJson` 不保存表注释、字段注释和 `NOT NULL` 约束，因此仅靠“源表 vs `jobJson`”无法感知注释、类型精度与必填变化，必须拉取目标端物理表进行三方对比。
2. `BaseQueryTool.getColumns` 仅对 MySQL/Oracle 查询列注释，对 Hive/PG/Doris/ClickHouse/SQL Server 均不返回列注释；而 `TableDataQueryTool` 已具备方言系统视图与 JDBC `DatabaseMetaData` 读取表注释、列注释、长度精度与 `IS_NULLABLE` 的基础能力。
3. `DataTypeConverterFactory` 目前仅按 `targetDbType` 缓存单向 `MySQLToXxxConverter`，若不做同库直通和源端类型归一化，非 MySQL 源库（如 Oracle/PG -> 同库或异库）会出现严重类型误报。

## Goals / Non-Goals

**Goals:**
- 建立全数据库（MySQL、Hive/OBS、Doris、StarRocks、Oracle、PostgreSQL、ClickHouse、SQL Server）统一的物理表元数据采集（表注释、列注释、完整类型含长度/精度、可空性）。
- 在 `SchemaDriftServiceImpl` 中实现“源物理表 vs 目标物理表 vs `jobJson`”三方对比，产出结构化的表注释变更、列注释变更、列类型变更（含安全/高危分级）与必填变更明细。
- 扩展 `BaseDDLGenerator` 及其全部 7 个实现类，分离“自动注释演进 DDL”与“人工审查列修改（类型/必填）DDL”，确保绝不破坏已有列约束。
- 在 `SchemaDriftServiceImpl` 执行链路上隔离自动演进与人工审查手动执行，并在 `tab3_batch_job.js` 看板提供高亮对比与可编辑 DDL 审查确认弹窗。

**Non-Goals:**
- 不在自动演进（`autoApply`）阶段自动执行任何字段类型调整或 `NOT NULL` 约束变更 DDL。
- 不执行破坏性物理 `DROP COLUMN`、`DROP TABLE` 或目标表数据清洗（若目标端因存量 `NULL` 数据导致手动执行 `NOT NULL` 失败，由数据库返回报错给人工处理）。
- 不修改现有 `job_schema_drift_log` 表结构，新增扩展明细直接序列化写入 `drift_detail_json`。

## Decisions

### 1. 元数据采集：复用并补全全库物理表快照结构，替代单靠 `BaseQueryTool.getColumns`
- **选择**：在 `DatasourceQueryService` / `TableDataQueryTool` 中提供统一的物理表结构快照读取方法（返回 `tableComment` + 标准化列列表：`name`、`fullType`、`rawTypeName`、`columnSize`、`decimalDigits`、`nullable`、`comment`），补充 Hive（`DESC FORMATTED` 解析表注释 + `DESC` 解析列注释/类型）、ClickHouse（`system.tables` / `system.columns`）与 Doris/StarRocks（复用 MySQL `information_schema` 查询，补齐列 `COLUMN_TYPE`、`IS_NULLABLE`、`COLUMN_COMMENT`）。
- **备选方案与取舍**：直接在 `SchemaDriftServiceImpl` 里为 8 种数据库各自写 `DriverManager` 裸 SQL。拒绝该方案，因为会导致连接管理与方言查询重复分散，违反代码复用原则；统一收口到 `TableDataQueryTool` / `DatasourceQueryService` 可同时惠及平台其他元数据查询功能。
- **性能保护**：三方对比时每个任务最多多一次目标端单表元数据读取（仅查单表而非全库），在 `batchDetect` 线程池内并发完成；若目标端表不存在或连接异常，降级为仅做“源表 vs `jobJson`”加减列探测，并记录非阻塞提示。

### 2. 类型对比：引入“同库直通 + 源端类型归一化 + 精度解析”机制
- **选择**：
  - 同源同目标库（如 `mysql -> mysql`、`postgresql -> postgresql`、`oracle -> oracle`、`doris -> doris` 等）：跳过 `DataTypeConverter`，直接标准化两边类型字符串（统一大小写、去除 MySQL 无意义整数显示宽度如 `int(11)` vs `int`、统一同义词如 `integer`/`int`、`bool`/`boolean`）后比对基类型与长度/精度。
  - 异库同步（如 `mysql -> hive`、`oracle -> doris`）：先将非 MySQL 源端类型标准化为通用中间类型（如 `VARCHAR2 -> varchar`、`NUMBER(p,s) -> decimal/bigint/int`），再经 `DataTypeConverterFactory.getConverter(sourceDbType, targetDbType)` 得到期望目标类型，与目标库物理类型比对。
- **风险分级规则**：
  - `WIDENING`（安全扩容）：同大类内长度/精度增大（如 `varchar(50) -> varchar(200)`、`decimal(10,2) -> decimal(18,4)`）或无损整数升级（`tinyint -> smallint -> int -> bigint`、`float -> double`）。
  - `BREAKING`（高风险变更）：长度/精度缩小、跨大类转换（如 `varchar -> int`、`datetime -> varchar`）或非标类型变化。
  - 注意：**无论 `WIDENING` 还是 `BREAKING`，按已确认策略均不自动演进，必须人工审查后手动执行**；分级标签用于在前端直观用橙色/红色区分风险程度。

### 3. 全数据库 DDL 生成分离：`generateAlterCommentDDL` vs `generateModifyColumnDDL`
- **选择**：在 `BaseDDLGenerator` 新增两个带默认空实现的接口方法，并由 7 个实现类完整实现：
  1. `generateAlterCommentDDL(String tableName, String newTableComment, List<ColumnCommentChangeDto> commentChanges, boolean targetTableCommentExists)`：
     - **MySQL / Doris / StarRocks**：表注释用 `ALTER TABLE \`t\` COMMENT = '...'`；列注释用 `ALTER TABLE \`t\` MODIFY COLUMN \`c\` <目标库原有完整类型> [NOT NULL | NULL] COMMENT '...'`（**必须以目标列当前类型和可空性为准**，严禁在改注释时顺带套用源库新类型或新 `NOT NULL`！）。
     - **Hive**：表注释用 `ALTER TABLE \`t\` SET TBLPROPERTIES ('comment' = '...')`；列注释用 `ALTER TABLE \`t\` CHANGE COLUMN \`c\` \`c\` <目标库原有完整类型> COMMENT '...'`。
     - **PostgreSQL / Oracle**：独立 `COMMENT ON TABLE ... IS '...'` 与 `COMMENT ON COLUMN ... IS '...'`。
     - **ClickHouse**：表注释 `ALTER TABLE \`t\` MODIFY COMMENT '...'`；列注释 `ALTER TABLE \`t\` COMMENT COLUMN \`c\` '...'`。
     - **SQL Server**：根据目标库当前表/列是否已有 `MS_Description` 扩展属性，分别生成 `EXEC sp_addextendedproperty` 或 `EXEC sp_updateextendedproperty`。
  2. `generateModifyColumnDDL(String tableName, List<ColumnSchemaChangeDto> columnChanges)`（针对类型或必填变更）：
     - 生成对应方言的 `MODIFY COLUMN` / `ALTER COLUMN ... TYPE` + `SET/DROP NOT NULL` / `CHANGE COLUMN` / `Nullable(T)` 语句。
     - **Oracle `ORA-01442` 保护**：若列只是改类型且目标列原本已经是 `NOT NULL` 且未发生可空性变更，Oracle `MODIFY` 语句不重复输出 `NOT NULL` 关键字。
     - **Hive 兼容性处理**：Hive 不支持强制 `NOT NULL` 约束校验；若仅发生必填变更而无类型变更，生成注释说明（`-- Hive 外部表不支持 DDL 强制 NOT NULL 约束，仅作源端变更提醒`），不执行无效 SQL。
- **备选方案与取舍**：把改注释和改类型合并进一条 `MODIFY COLUMN` 执行。拒绝该方案，因为这样会让“注释自动演进”在混合变更场景下把未经人工审查的新类型或 `NOT NULL` 一起自动应用到目标库，违背安全分级边界。

### 4. 分级执行流与 `ApplySchemaEvolutionDto` 扩展
- **选择**：
  - 在 `SchemaDriftItemDto` 中分离两个 DDL 字段（保留 `recommendedDdl` 向下兼容或明确分工）：
    - `autoSafeDdl`：仅包含新增列 + 表/字段注释变更 DDL（用于 `autoApply` 自动执行）。
    - `manualReviewDdl`：包含字段类型与必填变更建议 DDL（仅在人工确认窗口展示和编辑）。
    - `recommendedDdl`：当存在可安全自动演进部分时包含安全 DDL，若仅有手动审查变更时展示审查 DDL 便于统一预览，或在前端分别清晰展示“自动演进 DDL”与“需审查 DDL”。
  - 在 `ApplySchemaEvolutionDto` 中新增 `applyScope`（如 `AUTO_SAFE`、`MANUAL_REVIEW`、`ALL_REVIEWED`，默认兼容历史调用语义：若前端传入用户审查编辑后的 `customDdl`，则执行用户确认的 DDL，否则按作用域生成对应 DDL）。
  - **触发与状态流转**：
    - `batchDetect(..., autoApply = true)` 仅执行 `AUTO_SAFE`（新增列 + 剔除删除列 + 表/字段注释变更）。若同时存在未人工审查的类型或必填变更，状态仍保留 `DETECTED`（或在 `statusMsg` 明确提示“安全变更已自动演进，另有 X 项类型/必填变更待人工审查”），确保不会被静默吞掉。
    - 手动审查确认执行后，若涉及 `hdfswriter` 对象数组型 `writer.parameter.column`，同步更新对应列的 `type` 字段，并完整保留 `beforeJobJson` / `afterJobJson` 快照以支持回滚。
    - **批量人工审查与二次确认**：当用户在看板多选/框选含 `hasManualReviewChanges == true` 的任务时，支持通过悬浮操作栏或顶部控制栏触发“批量审查DDL执行”，在批量汇总弹窗中展示各任务的变更字段、风险等级与独立可编辑 DDL；点击执行后**必须通过 `showDataxConfirm` 二次确认**（明确提示涉及任务数、高危变更数与不可逆性），确认后逐任务以 `applyScope = "MANUAL_REVIEW"` 调用 `/api/job/drift/apply` 并汇总成功/失败明细。

### 5. 前端看板与合规规范
- **选择**：在 [tab3_batch_job.js](file:///d:/code/not_itc/datax-web/datax-admin/src/main/resources/static/static/js/assistant/tabs/tab3_batch_job.js) 中：
  - 统计栏补充“注释/属性变动”统计项；`driftType` 徽标兼容原有 `ADD_COLUMN` / `DROP_COLUMN` / `MIXED` / `NONE`，新增 `COMMENT_DRIFT`、`SCHEMA_CHANGE`（类型/必填变动）。
  - 明细列中用清晰徽标区分：
    - 注释变更（`#1890ff` / `#722ed1` 提示 `表注释` 或 `列注释: 旧 -> 新`）
    - 类型扩容（`#fa8c16` 橙色：`col: int -> bigint`）与高危类型变更（`#f5222d` 红色：`col: varchar(200) -> varchar(50)`）
    - 必填变更（`#f5222d` 红色：`col: 可空 -> 必填(NOT NULL)` / `#8c8c8c`：`col: 必填 -> 可空`）
  - 提供单任务“审查DDL执行”与多任务“批量审查DDL执行”入口，打开可编辑 DDL 模态框并在执行前强制二次确认（纯文本标题，严格遵守 5 类 Emoji 白名单与 `safeEscapeHtml` XSS 防护）。

## Risks / Trade-offs

- **[Risk] 批量探测耗时增加**：每个任务增加一次目标物理表元数据查询（尤其是 Hive JDBC `DESC FORMATTED` 较慢）。→ **Mitigation**：利用现有 `MAX_CONCURRENT_THREADS` 并发探测，若同一批量任务中多个任务指向同一个目标库表（如分表/多任务同目标表），在单次 `batchDetect` 周期内按 `(writerDatasourceId, writerTable)` 做局部元数据缓存复用；目标表不可达时超时降级不阻断主流程。
- **[Risk] MySQL/Doris 改注释时 `MODIFY COLUMN` 可能丢失原列 `DEFAULT` 或 `AUTO_INCREMENT` 属性**：→ **Mitigation**：在读取 MySQL/Doris 列元数据时通过 `SHOW FULL COLUMNS FROM \`table\`` 或 `information_schema.COLUMNS` 提取完整 `COLUMN_TYPE`、`IS_NULLABLE`、`COLUMN_DEFAULT`、`EXTRA`，在 `MODIFY COLUMN` 改注释时原样保留原有类型、可空性、默认值与扩展属性。
- **[Risk] SQL Server `sp_addextendedproperty` 与 `sp_updateextendedproperty` 误用报错**：目标列没有扩展属性时调用 `update` 会报错，已有时调用 `add` 会报错。→ **Mitigation**：依据目标库查询出的当前注释是否非空动态选择 `add` 或 `update`（或生成先判断 `fn_listextendedproperty` 再分支执行的 T-SQL 脚本，确保幂等安全，同时放行 `EXEC sp_...` 不触发高危 DDL 误拦截）。
- **[Risk] `FORBIDDEN_DDL_PATTERN` 误拦截合法语句或放行危险语句**：→ **Mitigation**：维持现有对 `DROP DATABASE`/`DROP TABLE`/`DROP COLUMN`/`TRUNCATE TABLE`/`ALTER USER`/`GRANT`/`REVOKE` 的强拦截；人工审查编辑 DDL 时前后端均校验并提示风险。

## Migration Plan

1. **后端 DDL 与元数据底座升级**：先扩展 `TableSnapshotDto` / `TableDataQueryTool` / `DataTypeConverterFactory` 与 `BaseDDLGenerator` 7 个方言实现，补充单元测试覆盖各库改注释与改类型/必填 DDL 输出（重点校验 MySQL/Doris 原列属性保留、Oracle `ORA-01442` 规避、SQL Server 扩展属性语法、Hive 提示）。
2. **三方探测与分级演进接入**：升级 `SchemaDriftServiceImpl`、`SchemaDriftItemDto`、`ApplySchemaEvolutionDto`、`BatchSchemaDriftResultDto` 及审计序列化逻辑；保持旧接口入参/出参字段兼容。
3. **前端 Tab 3 看板与审查弹窗升级**：更新 `tab3_batch_job.js` 渲染、可编辑 DDL 审查框与历史弹窗展示；由于未新增数据库表或列，存量历史 `job_schema_drift_log` 记录可无缝兼容展示。
