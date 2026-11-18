# Proposal

## Why

目前 DataX-Web 的角色权限控制体系中缺少独立的角色实体表（`job_role`），所有自定义角色均以临时字符串形式散落在权限关联表或用户表中。这导致在角色权限弹窗中无法统一查看或选择已有角色，每次配置必须手动输入英文字符串，且无法维护角色的中文名称与业务说明。通过引入轻量级角色字典表与快捷创建能力，实现角色元数据的集中管控与前端下拉框的动态联动。

## What Changes

- **新增角色元数据实体与基线数据**：在 `bin/db/datax_web_stat_task.sql` 追加 `job_role` 建表语句及 `ROLE_ADMIN`、`ROLE_USER` 初始化记录。
- **提供角色基础服务与接口**：
  - 新增后端实体 `JobRole`、持久层 `JobRoleMapper` 与服务层 `JobRoleService`。
  - 在 `TableDataController` 暴露查询所有角色列表（`GET /api/tableData/role/list`）与新增自定义角色（`POST /api/tableData/role/add`）接口。
- **前端角色权限管理中心轻量化升级**：
  - 在现有角色权限弹窗（`novice_table_query.js`）的角色下拉选择框旁增加 `➕ 新建角色` 按钮与轻量内嵌弹窗。
  - 角色下拉框由写死选项改为动态从后端拉取 `job_role` 列表展示（格式为 `角色中文名 (ROLE_CODE)`）。
  - 创建角色成功后自动刷新下拉框并默认选中新角色，无缝支持在菜单权限和库表权限两个 Tab 中复用。

## Capabilities

### New Capabilities
- `role-management`: 系统角色元数据字典维护与快捷创建能力，支持角色的持久化存储、合法性校验、内置角色保护及前端动态下拉联动。

### Modified Capabilities
<!-- 无已有能力的需求变更 -->

## Impact

- **数据库**：在系统基线 `bin/db/datax_web_stat_task.sql` 末尾追加 `job_role` 建表脚本。
- **后端代码**：
  - 新增 `JobRole.java`、`JobRoleMapper.java`、`JobRoleService.java`、`JobRoleServiceImpl.java`。
  - 修改 `TableDataController.java` 接入角色查询与新增接口。
- **前端代码**：
  - 修改 `novice_table_query.js`，动态加载角色列表并集成轻量新建角色弹窗。
- **兼容性**：原有用户表 `job_user.role` 及权限表 `role_code` 逻辑不受影响，完全向下兼容。
