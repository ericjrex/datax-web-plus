# Tasks

## 1. 已选表查看与过滤（Tab 8 账号编辑弹窗）

- [x] 1.1 在 [tab8_open_api.js](file:///d:/code/not_itc/datax-web/datax-admin/src/main/resources/static/static/js/assistant/tabs/tab8_open_api.js) 的 `#datax-table-ctrl-bar` 增加“仅看已选”纯文本切换按钮，并在 `renderTableItems()` 中叠加 `onlyShowSelected` 过滤条件；验证：开启“仅看已选”后仅展示当前数据源已勾选表，可与搜索关键字叠加，切换数据源时状态正确重置或同步。
- [x] 1.2 为 `#datax-table-count-badge`（或旁置纯文本“已选表”按钮）绑定跨库已选表汇总弹窗（复用 `createDraggableModal`，`zIndex: 1000035`），按数据源分组展示已选表或 `*` 通配标识，支持一键复制表名和单表移除；验证：打开汇总弹窗可查看所有已绑定数据源的已选表，移除某张表后主弹窗计数与勾选状态同步更新。

## 2. 跨账号库表权限同步（Tab 8 账号编辑弹窗）

- [x] 2.1 抽取公共账号权限解析辅助方法（兼容新版 `permissions` JSON 与旧版 `datasourceId + allowedTables`），在“授权数据源库与表控制”标题栏增加纯文本“从其他账号同步”按钮；验证：点击按钮后打开权限同步弹窗并正确加载除当前编辑账号外的账号列表。
- [x] 2.2 实现来源账号选择与库表勾选视图：支持勾选单个或多个有效数据源库（对已失效数据源禁用并标注），并支持展开单个库勾选/取消其中部分表；验证：切换来源账号时正确渲染各库的表数量、通配状态与规则数，单库/多库及展开微调表勾选交互正常。
- [x] 2.3 实现同步选项与合并执行逻辑：提供“追加合并”与“覆盖替换”单选，提供默认不勾选的“同时同步行级字段过滤规则”复选框及风险提示文案；确认后更新 `authList` 并刷新主弹窗 `renderDsPills()` 与 `renderTableWorkspace()`；验证：分别测试追加、覆盖、勾/不勾行级规则导入后，主弹窗展示正确且点击“保存”可持久化到后端。

## 3. 规范与回归验证

- [x] 3.1 检查本次新增的所有按钮、弹窗标题、提示文案均符合 Emoji 白名单（纯文本，无未授权 Emoji）、Ant Design 配色与 `safeEscapeHtml` XSS 转义规范；验证：人工核对 DOM 渲染与无浏览器控制台报错。
