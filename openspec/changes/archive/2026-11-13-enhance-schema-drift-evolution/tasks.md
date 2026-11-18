# Tasks

## 1. 全数据库元数据快照与类型对比底座

- [x] 1.1 在 `datax-admin` 扩展统一物理表元数据模型与查询能力（新增或扩展表结构快照 DTO 及 `TableDataQueryTool` / `DatasourceQueryService` 单表详情方法），覆盖 MySQL、Hive、Doris、StarRocks、Oracle、PostgreSQL、ClickHouse、SQL Server 8 类数据源的表注释、列注释、完整列类型（含长度/精度与 MySQL/Doris 原列 `DEFAULT`/`EXTRA`）、可空性（`IS_NULLABLE`），并通过单元测试验证各库方言元数据解析逻辑。
- [x] 1.2 升级 `DataTypeConverterFactory` 与类型标准化对比辅助工具，支持同库直通对比（忽略 `int(11)` 显示宽度及大小写差异）与跨库类型映射后精确比对，输出 `WIDENING`（安全扩容）与 `BREAKING`（高风险缩容/跨类转换）分级结果，并通过 JUnit 单测验证同库、异库及各类长度/精度边界场景。

## 2. 全数据库方言 DDL 生成器扩展

- [x] 2.1 在 `BaseDDLGenerator` 新增 `generateAlterCommentDDL` 与 `generateModifyColumnDDL` 默认接口方法及对应的变更参数 DTO（`ColumnCommentChangeDto`、`ColumnSchemaChangeDto`），保持现有 `generateCreateTableDDL` 与 `generateAddColumnsDDL` 向后兼容，验证现有调用方无编译破坏。
- [x] 2.2 实现 MySQL 与 Doris（含 StarRocks）的 `generateAlterCommentDDL` 与 `generateModifyColumnDDL`，确保修改注释时严格沿用目标列当前完整类型、可空性、默认值与扩展属性，修改类型/必填时按目标定义生成 `MODIFY COLUMN` 脚本，并编写单元测试断言生成 SQL 准确无误。
- [x] 2.3 实现 Hive、PostgreSQL、Oracle、ClickHouse 与 SQL Server 的 `generateAlterCommentDDL` 与 `generateModifyColumnDDL`（包括 Hive `TBLPROPERTIES`/`CHANGE COLUMN` 及 `NOT NULL` 不支持提示、Oracle `ORA-01442` 重复非空规避、PostgreSQL `COMMENT ON`/`ALTER COLUMN` 拆句、ClickHouse `Nullable(T)` 包装、SQL Server `sp_addextendedproperty`/`sp_updateextendedproperty` 分支），并通过覆盖全部 8 类数据库的 DDL 生成器单元测试验证。

## 3. 三方漂移探测与分级演进后端服务

- [x] 3.1 扩展 `SchemaDriftItemDto`、`BatchSchemaDriftResultDto`、`ApplySchemaEvolutionDto` 与 `ColumnMappingDto`（新增表/列注释差异、类型变更、必填变更明细、`autoSafeDdl`、`manualReviewDdl`、`applyScope` 及统计计数），保持原有字段与响应结构兼容，确认 JSON 序列化格式符合时间与字段规范。
- [x] 3.2 重构 `SchemaDriftServiceImpl#executeDetect` 为“源物理表 vs 目标物理表 vs `jobJson`”三方对比，增加批量探测单周期内 `(writerDatasourceId, writerTable)` 局部缓存复用及目标表不可达时的非阻塞降级逻辑，并通过单元测试验证新增/删除列、注释变更、类型调整、必填变更与目标表缺失场景的判定输出。
- [x] 3.3 改造 `SchemaDriftServiceImpl#batchDetect` 与 `applyEvolutionInternal` 分级执行策略：勾选 `autoApply` 时仅自动执行安全变更（新增列、剔除源端已删列、表与字段 `comment` 变更）并保留未审查的类型/必填变更待人工处理；手动执行支持传入审查编辑后的 `customDdl`，校拦截高危 SQL，并在 `hdfswriter` 对象数组列配置场景同步更新 `jobJson` 中列类型，同时将完整差异明细持久化到 `job_schema_drift_log.drift_detail_json`。

## 4. Tab 3 前端演进看板、DDL 审查弹窗与联调验证

- [x] 4.1 更新 `tab3_batch_job.js` 模式演进看板顶部统计栏、变动状态徽标及明细列渲染，使用 Ant Design 调色盘高亮标注表/字段注释变更（`旧 -> 新`）、安全扩容（橙色）、高危类型转换（红色）与必填变更（红色 `NOT NULL`），严格遵守 5 类白名单 Emoji 图标约束及 `safeEscapeHtml` XSS 转义。
- [x] 4.2 在 `tab3_batch_job.js` 实现“人工审查并演进”可编辑 DDL 预览确认弹窗及批处理控制交互（分离自动安全演进与人工审查手动执行），同步升级历史快照弹窗（`openDriftHistoryModal`）以展示持久化快照中的注释、类型与必填变更详情，并通过 `node --check` 语法校验及前后端端到端功能验证。
- [x] 4.3 在 `tab3_batch_job.js` 扩展“批量审查DDL执行”能力：支持对悬浮框选/多选的含类型或可空性变更任务打开批量审查汇总弹窗（展示各任务风险明细及独立可编辑 DDL），点击执行时强制弹出二次确认框，确认后按 `MANUAL_REVIEW` 作用域逐任务调用 `/api/job/drift/apply` 并汇总成功/失败结果，刷新看板并通过 `node --check` 语法校验。
