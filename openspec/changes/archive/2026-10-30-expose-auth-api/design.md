# Design: 权限三方开放 API 与可视化管理控制台（多库表勾选授权与调用日志）

## Context

见 `proposal.md`。工程当前具备强大的 Vanilla JS 智能助手框架（`static/static/js/assistant`），采用组件化 Tab 挂载方式（如 `tab5_data_viewer.js`、`tab6_stat_task.js`、`tab7_api_task.js`），并通过 `auth_guard.js` 与 `dom_builder.js` 统一处理权限拦截与安全 DOM 渲染。为满足管理员对开放 API 账号、多库表权限以及调用日志的可视化运维诉求，需在原有网关能力上扩展后端管理端 CRUD 接口，并在前端智能助手中重构 `tab8_open_api.js`，支持多库绑定与表列表交互勾选。

## Goals / Non-Goals

**Goals:**
- **后端多库鉴权能力**：支持单账号授权绑定多个数据源库；支持为每个库独立配置白名单表或通配 `*`；元数据查询与 SQL 执行严格基于多库白名单鉴权，移除强绑单一 `domainCode` 的限制。
- **管理端 CRUD 接口**：`/api/open/admin/account/**` 支持多库权限数据结构（`permissions` JSON）的持久化与读取；`/api/open/admin/log/**` 支持调用日志多维分页检索。
- **前端交互式勾选面板**：在 `tab8_open_api.js` 中提供清晰的多数据源选择、库表联动加载、表名/中文注释实时搜索过滤、一键全选/反选与逐行复选框授权，直观呈现授权统计。
- **规范与安全**：图标严格遵循白名单（🚀、🔍、➕、✏️、🗑️），所有渲染文本执行 `safeEscapeHtml` 转义，管理员权限严格校验。

**Non-Goals:**
- 不支持外部调用端在无授权情况下自助注册账号（全部由管理员后台分配）。
- 不支持跨物理数仓库的跨库事务或跨库直接 JOIN（每次 SQL 执行指定单一目标库或通过数据联邦引擎）。

## Decisions

### 1. 前端架构选型：集成至助手 Tab8 vs 改造原有 Vue 单页
- **决策**：在 `static/static/js/assistant/tabs/` 维护 `tab8_open_api.js`，并在 `index.js` 中挂载为助手 Tab8。
- **原因**：符合目前助手体系演进机制，零打包编译成本，原生 Vanilla JS 极轻量，热加载即可生效，支持浮窗与独立工作区。

### 2. 多库与表授权数据结构：轻量 JSON 字段 vs 独立从表
- **决策**：在 `job_api_account` 实体扩展 `permissions` 文本/JSON 字段，格式如下：
  ```json
  [
    {
      "datasourceId": 8,
      "datasourceName": "datax_final",
      "allTables": false,
      "tables": ["dim_sys_platform", "dwd_taxi_driver_shift_di"]
    },
    {
      "datasourceId": 9,
      "datasourceName": "beidou_dw",
      "allTables": true,
      "tables": ["*"]
    }
  ]
  ```
  同时向下兼容原有的 `datasource_id` 和 `allowed_tables` 字段（默认同步填充首个配置的数据源）。
- **原因**：
  1. 避免新增关系从表及其联表查询与事务维护开销；
  2. 开放接口网关验签拦截时，可在内存中一次性快速反序列化为 `Map<Long, Set<String>>` 高效完成表名白名单判定；
  3. 极大简化了前端与管理端之间的数据传输契约。

### 3. 表权限交互设计：交互式列表勾选 + 实时搜索 + 通配开关
- **决策**：在新增/编辑弹窗中，展示数据源选择区域。点击某一数据源库后：
  1. 异步拉取该库所有的表名与表中文注释（复用现有表元数据接口）；
  2. 顶部提供“允许访问该库全部表 (*)”快速通配勾选项；
  3. 未通配时，下方提供表名与注释实时检索输入框、以及【全选】/【取消全选】快捷按钮；
  4. 采用双列或紧凑表格展示带有复选框的表列表，并实时显示计数 Badge（如“已授权 3 / 11 张表”）。
- **原因**：彻底杜绝手动键入表名容易拼错字母导致 API 拦截的问题，同时极大提升授权配置效率。

### 4. 业务领域（Domain）定位：自包含于表名与表注释
- **决策**：不再将 `domainCode` 作为必填划分边界。在元数据接口与表列表中，领域信息通过表名命名规范（如 `dwd_taxi_*`、`dws_jiapei_*`）与中文注释（如 `明细中间层_出租网约领域_...`、`汇总中间层_驾培领域_...`）天然表达。
- **原因**：数仓建模本身已按主题域与业务域分层命名，额外在账号层强绑固定领域代码反而割裂了跨域联合分析的诉求。

### 5. 日志明细透视：单行摘要 + 模态弹窗查看完整 SQL
- **决策**：日志列表仅展示基础指标（时间、账号、IP、返回行数、耗时、状态 Tag）；点击【🔍 查看明细】弹出模态弹窗（`z-index: 1000025`），使用代码块样式展示完整格式化 SQL 及 AST 涉及表列表与报错信息。

## Risks / Trade-offs

- **[Risk: 库内表数量较多（例如几百张表）时勾选性能]** → **Mitigation**: 表列表容器设置固定最大高度与 `overflow-y: auto` 滚动；搜索过滤采用内存模糊匹配防抖过滤，保持流畅交互。
- **[Risk: 旧账号存量数据无 permissions 字段]** → **Mitigation**: 后端及前端做兼容处理，若 `permissions` 为空但旧字段 `datasource_id` 与 `allowed_tables` 有值，自动降级为单库权限模型。

## Migration Plan

1. 在 `bin/db/datax_web_stat_task.sql` 末尾追加 `permissions` 字段定义：`ALTER TABLE job_api_account ADD COLUMN permissions LONGTEXT DEFAULT NULL COMMENT '多库与表授权清单JSON' AFTER allowed_tables;`。
2. 更新后端实体 `JobApiAccount` 与相关接口逻辑。
3. 重构前端 `tab8_open_api.js` 的新增/编辑弹窗，实现多库绑定与表列表勾选控制。
4. 验证多库与单库表权限授权、元数据查询与 SQL 安全执行。
