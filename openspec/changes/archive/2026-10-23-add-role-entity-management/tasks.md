# Tasks

## 1. 数据库基线变更

- [x] 1.1 在 `bin/db/datax_web_stat_task.sql` 末尾追加 `job_role` 实体表建表语句与内置管理员/普通用户初始化数据，并检查字段注释与唯一约束完整性。

## 2. 后端角色实体与服务层实现

- [x] 2.1 新建 `JobRole.java` 实体类（标注 `author: ypc`），映射 `job_role` 表字段，遵守 Google Java 规范与详细中文注释。
- [x] 2.2 新建 `JobRoleMapper.java` 持久层接口，继承 MyBatis-Plus `BaseMapper<JobRole>`，提供按排序号和主键排序的查询能力。
- [x] 2.3 新建 `JobRoleService.java` 及其实现类 `JobRoleServiceImpl.java`，封装角色的格式正则校验（`^[A-Z][A-Z0-9_]{2,30}$`）、查重逻辑与列表获取。
- [x] 2.4 在 `TableDataController.java` 中引入 `JobRoleService`，暴露 `GET /api/tableData/role/list` 与 `POST /api/tableData/role/add` 接口，加入 `isCurrentAdmin` 严格权限校验。

## 3. 前端角色权限中心联动与快捷新建

- [x] 3.1 在 `novice_table_query.js` 中新增角色列表动态加载函数 `fetchSystemRoleList()`，将菜单权限与库表权限两个 Tab 的角色下拉框从写死选项改为动态渲染。
- [x] 3.2 在两个 Tab 的角色下拉框右侧挂载 `➕ 新建角色` 按钮，并封装轻量内嵌创建弹窗（支持角色标识、名称、描述录入与 `safeEscapeHtml` 转义）。
- [x] 3.3 实现新建角色异步提交与跨 Tab 联动，验证保存成功后自动刷新下拉框并默认选中新角色。

## 4. 角色级联全量删除与权限联动

- [x] 4.1 在 `JobRoleService` 与 `JobRoleServiceImpl` 中实现 `deleteRole` 事务方法，级联物理清理 `job_role_table_permission` 库表权限规则、`job_role_menu_permission` 菜单权限策略、`job_role` 实体字典记录，并重置 `job_user` 关联用户。
- [x] 4.2 在 `TableDataController.java` 中增加 `POST /api/tableData/role/delete` 接口，并改造 `/roleMenu/delete` 实现全量级联清理。
- [x] 4.3 在 `novice_table_query.js` 菜单与库表下拉框旁提供动态 `🗑️ 删除角色` 按钮，并在策略表格中复用公共删除逻辑，删除后自动跨 Tab 全量刷新数据。
