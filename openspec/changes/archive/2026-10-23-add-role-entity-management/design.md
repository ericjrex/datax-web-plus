# Design

## Context

目前 DataX-Web 中的角色权限控制（菜单权限与库表策略）均通过字符串 `role_code` 进行弱关联，缺乏实体主表支持（详见 [proposal.md](file:///d:/code/not_itc/datax-web/openspec/changes/add-role-entity-management/proposal.md)）。系统基于 Spring Boot、MyBatis-Plus 及原生 JavaScript 实现。

## Goals / Non-Goals

**Goals:**
- 在数据库中增加 `job_role` 系统角色实体表，并初始化 `ROLE_ADMIN` 与 `ROLE_USER` 基线记录。
- 新建 `JobRole` 实体（标注 `author: ypc`）、Mapper、Service 及 Controller 接口。
- 在现有角色权限管理中心（[novice_table_query.js](file:///d:/code/not_itc/datax-web/datax-admin/src/main/resources/static/static/js/assistant/components/novice_table_query.js)）中，将下拉框从写死选项改为动态拉取 `job_role` 列表。
- 在角色下拉框右侧增加 `➕ 新建角色` 按钮与轻量内嵌弹窗，支持录入角色编码、名称与说明，保存后自动刷新并选中新角色。

**Non-Goals:**
- 不修改原有 `job_user.role` 字段类型（保持 `VARCHAR(50)` 兼容性），确保所有现有鉴权拦截器零破坏。
- 不对已打包的历史 Vue 页面进行重构，仅聚焦于当前活跃的智能助手与简易查询权限中心。

## Decisions

### 1. 交互形式：采用下拉框右侧内嵌快捷弹窗
- **决策内容**：在菜单权限 Tab 和库表策略 Tab 的目标角色下拉框右侧，统一挂载 `➕ 新建角色` 按钮，点击唤起轻量模态框。
- **权衡考量**：相比于在顶部再加一个独立的“角色字典管理 Tab”，该方案无需用户在多个 Tab 间来回切换，录入角色后直接留在当前页面进行菜单与库表授权，交互链路最短、改动最小。

### 2. 接口路由：收敛在 `TableDataController` 统一路径
- **决策内容**：在 [TableDataController.java](file:///d:/code/not_itc/datax-web/datax-admin/src/main/java/com/wugui/datax/admin/controller/TableDataController.java) 中增加 `/api/tableData/role/list` 和 `/api/tableData/role/add` 接口。
- **权衡考量**：现有的 `/api/tableData/roleMenu/*`（菜单权限）与 `/api/tableData/roleUser/*`（用户角色分配）均在该控制器下，接口收敛于此具备极高的内聚性，无需新增 Controller 配置。

### 3. SQL 归档规范遵循
- **决策内容**：依据工作区指导规范，`job_role` 属于支撑平台运行与智能助手功能的系统元数据，追加于 [datax_web_stat_task.sql](file:///d:/code/not_itc/datax-web/bin/db/datax_web_stat_task.sql) 末尾。

## Risks / Trade-offs

- **[风险 1: 角色编码格式不规范]** → **防御策略**：后端强制正则校验 `^[A-Z][A-Z0-9_]{2,30}$`，入库前转大写去空格，避免特殊字符引发鉴权或前端拼接问题。
- **[风险 2: 管理员误操作内置角色]** → **防御策略**：设置 `is_system = 1` 物理保护字段，后端在修改/删除时严禁对系统内置角色进行破坏。
- **[风险 3: 前端动态拼接导致的 XSS]** → **防御策略**：所有角色名称、描述等动态数据插入 DOM 时必须调用 `safeEscapeHtml`。
