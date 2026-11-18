# Tasks

## 1. 数据库基线与实体模型建设

- [x] 1.1 将 `job_api_account`（接口账号表）与 `job_api_log`（审计日志表）DDL 追加到平台系统演进基线 `bin/db/datax_web_stat_task.sql` 末尾，验证字段规范与字符集
- [x] 1.2 创建实体类 `JobApiAccount` 与 `JobApiLog`，按规范配置 `@JsonFormat`、Swagger 注解与 Lombok，新建文件标注作者 `ypc`
- [x] 1.3 创建对应的 MyBatis-Plus Mapper 接口（`JobApiAccountMapper`、`JobApiLogMapper`）与 Service 服务（`JobApiAccountService`、`JobApiLogService`）
- [x] 1.4 在 `bin/db/datax_web_stat_task.sql` 追加助手 Tab8 对应的系统菜单配置与初始权限 SQL
- [x] 1.5 在 `bin/db/datax_web_stat_task.sql` 追加 `permissions` 字段（多库表授权 JSON）DDL，并在 `JobApiAccount` 实体中增加对应字段

## 2. API 安全准入网关与签名拦截器

- [x] 2.1 实现企业级 AK/SK 签名验签工具类 `OpenApiSignUtil`，支持 HMAC-SHA256 算法、5 分钟时间戳过期校验与 Nonce 防重放
- [x] 2.2 实现安全拦截器 `OpenApiSecurityInterceptor`，完成请求头解析、账号状态检查、IP 白名单校验与基于内存/Guava 的单账号 QPS 令牌桶限流
- [x] 2.3 在 Spring MVC 配置中注册 `OpenApiSecurityInterceptor`，拦截 `/api/open/v1/**` 开放路径，放行后台管理端接口

## 3. AST 语法树深度安全审计与只读执行器

- [x] 3.1 封装 AST 语法树表名解析工具 `OpenApiSqlAstParser`（基于 JSqlParser），递归提取主表、JOIN 表与子查询中涉及的所有物理表名
- [x] 3.2 增加高危写操作指令与系统探测函数（`SLEEP`、`BENCHMARK`、`USER` 等）黑名单拦截规则，确保只允许合法只读查询
- [x] 3.3 实现数仓只读执行工具 `OpenApiWarehouseExecutor`，绑定物理只读连接、强制注入 `statement.setQueryTimeout(10)` 与最大返回 1000 条截断
- [x] 3.4 增加数仓跑批状态就绪门禁，在查询前检查对应领域的 `latest_ready_date` 状态，未就绪拒绝开放并返回友好提示

## 4. 后台管理接口与开放接口层多库改造

- [x] 4.1 新建 `JobOpenAdminController`，提供 API 账号管理管理端接口（分页列表、新增生成密钥、删除、重置 Secret、启停开关）
- [x] 4.2 在 `JobOpenAdminController` 中提供调用日志多维分页检索与明细查询接口（支持按账号、状态、时间范围过滤）
- [x] 4.3 升级 `JobOpenApiController` 元数据接口 `GET /api/open/v1/metadata/tables`，解除 `domainCode` 必传限制，支持可选传 `datasourceId` 并按多库权限返回授权表及中文注释
- [x] 4.4 升级 `JobOpenApiController` 查询接口 `POST /api/open/v1/query/execute`，校验目标 `datasourceId` 与对应库的表白名单（支持 `*` 与多表精确校验）
- [x] 4.5 在 `JobOpenAdminController` 中支持 `permissions` 多库权限结构的接收、解析、校验与回显

## 5. 前端可视化管理界面开发与表列表勾选重构（Tab 8）

- [x] 5.1 在 `static/static/js/assistant/tabs/` 新建 `tab8_open_api.js`，设计子面板结构（“API账号管理”与“调用日志审计”），采用 Ant Design 规范样式
- [x] 5.2 规范弹窗层级（`z-index: 1000025` 与 `1000040`）与毛玻璃遮罩，支持 Esc 快捷键关闭
- [x] 5.3 重构新增/编辑账号弹窗：移除业务领域输入框，新增多数据源库添加/切换面板
- [x] 5.4 引入交互式表列表勾选组件：切换选定数据源库时异步拉取所有表名与中文注释
- [x] 5.5 实现表名与中文注释快速检索过滤输入框、一键全选（*）通配开关、全选/反选快捷按钮与每行复选框多选
- [x] 5.6 实现已授权表数量统计徽标实时联动（如“已授权 3 / 11 张表”），组装 `permissions` JSON 提交

## 6. 全流程联调验证与功能验收

- [x] 6.1 验证在 Tab 8 界面创建多库账号，为库 A 勾选部分表、为库 B 授予全部表（*），保存成功并正确回显
- [x] 6.2 验证元数据接口无需 `domainCode` 即可正常拉取当前账号在已授权多库下的表结构与注释
- [x] 6.3 验证外部 SQL 查询在合法表上成功执行，在未授权表或未授权库上被 AST 安全拦截并在日志留痕

## 7. 开放 API 说明文档与接入指引支持

- [x] 7.1 在 `specs/warehouse-open-api/spec.md` 与 `specs/open-api-manage-ui/spec.md` 明确可用 API 规格与前端文档弹窗定义
- [x] 7.2 在 Tab 8 前端界面顶部工具栏与「API 凭据信息」弹窗增加「API 说明」入口
- [x] 7.3 在 `tab8_open_api.js` 中实现「API 接入指引与接口说明」弹窗组件，包含 BaseURL、签名公式、2个核心接口与 cURL 示例

## 8. Tab 8 全子页面与组件对齐统一开发规范审计与改造

- [x] 8.1 审计并修正 Tab 8 弹窗标题与界面文案，清除弹窗标题中的 Emoji（如调用明细弹窗标题），确保严格对齐 5 类业务图标白名单规范
- [x] 8.2 校验计数量词统一为“条”（将 1000 行截断保护更正为 1000 条截断保护，审计表格与分页量词统一）
- [x] 8.3 服务端与客户端日期时间容错强化：为 `JobOpenAdminController` 审计日志查询增加 18 位粘连串补齐第 10 位空格容错解析
- [x] 8.4 审计 XSS 防护与 Ant Design 统一调色盘，确保全部子页面与模态框样式统一规范
