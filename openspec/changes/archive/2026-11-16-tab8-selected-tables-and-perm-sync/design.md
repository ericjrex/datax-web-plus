# Design

## Context

Tab 8 账号编辑弹窗（`openAccountModal` in [tab8_open_api.js](file:///d:/code/not_itc/datax-web/datax-admin/src/main/resources/static/static/js/assistant/tabs/tab8_open_api.js)）在内存中维护多库权限模型 `authList`：
- 每个元素结构为 `{ datasourceId, datasourceName, allTables, tables: Set<string>, rowFilterRules: Array }`。
- 当前只有全量表渲染逻辑 `renderTableItems()`，控制条 `#datax-table-ctrl-bar` 仅包含搜索框、全选、取消全选与计数徽标 `#datax-table-count-badge`。
- 所有账号的完整 `permissions` JSON 可通过现有 `/api/open/admin/account/page?pageNo=1&pageSize=1000` 获取，保存时统一由 `authList` 序列化并提交 `/api/open/admin/account/save`。

约束条件：
- 严禁随意添加 Emoji，新增按钮与弹窗标题使用纯文本，遵循 Ant Design 调色盘与 `safeEscapeHtml` XSS 防护。
- 新增子弹窗复用 `createDraggableModal`，`zIndex` 须高于账号编辑主弹窗（`1000025`），例如 `1000035`。

## Goals / Non-Goals

**Goals:**
- 在不增加后端接口的前提下，解决大表数量下“已选表核对困难”和“跨账号复用库表权限繁琐”两个高频痛点。
- 保证同步操作可预览、可撤回（先落入编辑器内存 `authList`，由管理员核对后再点保存生效）。

**Non-Goals:**
- 不做外层账号列表页的“1 对多批量静默覆盖”，避免误覆盖其他账号的行级租户隔离规则。
- 不改动后端 `OpenApiAccount` 实体与 `/api/open/admin/account/save` 接口。

## Decisions

### 1. 已选表查看：控制条“仅看已选”过滤 + 跨库汇总弹窗双形态
- **设计**：
  - **单库快速过滤**：在 `#datax-table-ctrl-bar` 新增“仅看已选”切换按钮（或分段态），维护布尔状态 `onlyShowSelected`。`renderTableItems()` 在关键字过滤之后叠加 `onlyShowSelected` 过滤（当 `curAuth.allTables` 为 true 时视为全部已选）。
  - **跨库汇总弹窗**：点击 `#datax-table-count-badge`（加 `cursor: pointer` 与提示）或旁置纯文本“已选表”按钮，通过 `createDraggableModal`（`zIndex: 1000035`）按数据源分组展示当前 `authList` 中所有已选表。每组支持“复制表名（逗号分隔）”和单表移除（移除后同步刷新主弹窗 `renderDsPills()` 与 `renderTableItems()`）。
- **备选方案**：将表格改为左右双栏穿梭框。因现有表格包含复选框、序号、表名、规则命中、业务注释 5 列，分双栏会导致横向严重拥挤，故放弃。

### 2. 跨账号权限同步：弹窗内拉取 + 可展开微调 + 合并/规则显式选择
- **设计**：
  - 在“授权数据源库与表控制”标题右侧（`➕ 添加数据源库` 左侧）新增纯文本按钮 `从其他账号同步`。
  - 打开同步弹窗（`createDraggableModal`，`zIndex: 1000035`），拉取 `/api/open/admin/account/page?pageNo=1&pageSize=1000` 并过滤掉当前正在编辑的账号自身。
  - 选中来源账号后，解析其 `permissions`（兼容旧版 `datasourceId + allowedTables`），展示每个数据源的勾选框、库名、表数量（或 `*`）及规则数量。点击“展开选表”可展示该库下的表复选框清单，支持仅勾选其中部分表。
  - **合并模式**（单选）：
    - `append`（追加合并，默认）：目标不存在该库则新增；已存在则对 `tables` 取并集，任一方 `allTables === true` 时结果为 `allTables: true`。
    - `overwrite`（覆盖替换）：目标不存在该库则新增；已存在则直接替换 `allTables` 与 `tables`。
  - **行级规则提示**：提供复选框 `同时同步来源库的行级字段过滤规则`（**默认不勾选**）；当来源库包含规则且未勾选时展示明确提示“不同账号租户/过滤值可能不同，已默认跳过行级规则”。若勾选，追加模式下按字段+模式去重合并，覆盖模式下直接深拷贝替换。
  - 确认导入后更新 `authList`，触发 `updateDsAddBtnState()`、`renderDsPills()`、`renderTableWorkspace()`，不自动提交保存。
- **备选方案**：在后端新增 `/account/syncPermissions` 接口直接写库。缺点是无法在同步后立即预览微调单张表或修改 `tenant_id` 规则，且需要改动后端并回归测试，故采用前端内存导入方案。

## Risks / Trade-offs

- **[Risk] 在“仅看已选”状态下取消勾选某张表，行立即消失可能引起误触担忧** → **Mitigation**: 可在取消勾选时仅更新徽标与状态，或直接重绘并配合底部计数实时变化；若希望更平滑，也可在点击“仅看已选”切换或搜索时重绘，单行取消勾选时保留该行置灰取消态直到下次过滤（实现时优先保证直观，重绘前记录滚动位置）。
- **[Risk] 来源账号的 `permissions` 中某个数据源在当前 `this.datasources` 列表已被删除** → **Mitigation**: 同步时校验 `this.datasources` 是否存在对应 `datasourceId`，不存在的库禁用勾选并标注“数据源已失效”。
- **[Risk] 来源账号数量极多时 `pageSize=1000` 下拉选择不便** → **Mitigation**: 同步弹窗内来源账号选择器支持关键字检索过滤（或复用现有下拉过滤）。
