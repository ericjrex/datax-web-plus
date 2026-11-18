# Spec Delta

## Purpose

提供系统角色元数据字典的持久化存储、合法性校验、内置系统保护以及统一角色查询与新建能力，支撑前后端统一权限管控与无缝关联。

## ADDED Requirements

### Requirement: Role Entity Persistence
系统 SHALL 提供独立的 `job_role` 表用于持久化存储所有系统角色，包含角色唯一编码（`role_code`）、角色中文名称（`role_name`）、角色描述（`description`）、是否内置（`is_system`）以及排序号（`sort_order`）。

#### Scenario: Query all roles
- **WHEN** 管理员通过接口或前端组件请求全部角色列表
- **THEN** 系统 SHALL 按 `sort_order` 和 `id` 升序返回所有角色实体列表，内置系统角色排在首位。

### Requirement: Role Creation Validation and Protection
系统 SHALL 允许管理员创建新自定义角色，并对角色编码与角色名称进行严格合法性校验，同时杜绝同名重复与内置角色冲突。

#### Scenario: Successfully create custom role
- **WHEN** 管理员提交包含有效 `roleCode`（如 `ROLE_ANALYST`，大写字母与下划线，长度 3~30 位）与有效 `roleName`（非空，长度 2~30 位）的新增角色请求
- **THEN** 系统 SHALL 校验通过并将记录持久化入库，默认设置 `is_system = 0`，返回成功响应。

#### Scenario: Reject duplicate role code
- **WHEN** 管理员提交已存在的角色编码（如 `ROLE_ADMIN` 或已有的自定义角色编码）
- **THEN** 系统 SHALL 拦截该操作并返回明确的查重错误提示“角色编码已存在”。

#### Scenario: Reject non-admin role creation
- **WHEN** 非管理员用户尝试调用角色新增接口
- **THEN** 系统 SHALL 拦截并返回“无权限: 仅管理员可操作”的拒绝响应。

### Requirement: Dynamic Role Selector in Management Dialog
在前端角色权限管理中心（包含菜单权限 Tab 与库表权限 Tab）中，系统 SHALL 动态拉取后台 `job_role` 列表填充角色下拉选择框，并提供快捷创建入口。

#### Scenario: Dynamically render role options
- **WHEN** 管理员打开角色权限管理中心弹窗
- **THEN** 角色下拉框 SHALL 动态显示所有可用角色，展示文案为 `角色名称 (ROLE_CODE)`。

#### Scenario: Quick create and auto-select
- **WHEN** 管理员在下拉框旁点击 `➕ 新建角色` 按钮并成功提交新角色
- **THEN** 系统 SHALL 自动重新拉取角色列表，将新角色追加至下拉框选项中，并自动选中当前新建的角色。
