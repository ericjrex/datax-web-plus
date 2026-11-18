# Proposal: Tab8 调用日志审计新增 IP 黑名单管控与一键封禁能力

## Why

当前 Tab8（三方开放 API 管理）仅在账号配置层面提供静态的「客户端 IP 白名单 (`allowed_ips`)」。然而在实际生产与本地 AI / MCP 工具接入场景中，大量合法调用端处于动态办公网 IP 或多终端环境，无法预先配置固定白名单，通常默认留空不限制。当管理员在「调用日志审计」中发现某个异常 IP 频繁发起越权表探测（触发安全拦截）、恶意高频刷接口或执行慢查询时，缺乏直接从审计日志现场快速封禁该恶意 IP 的手段，若直接停用账号或重置密钥又会误伤该账号下其他正常终端的业务调用。

为此，亟需在 Tab8 调用日志审计模块构建“**审计发现 -> 一键拉黑 -> 网关秒级阻断 -> 黑名单集中管理**”的安全风控闭环，支持在日志列表中单选或多选日志直接将客户端 IP 加入黑名单，并提供可视化的 IP 黑名单管理面板与防误封本机保护机制。

## What Changes

- **新增开放 API 平台级与账号级 IP 黑名单表 (`job_api_ip_blacklist`)**：
  - 支持全局封禁（`app_key = '*'`，阻断该 IP 访问任何开放 API 账号）与单账号定向封禁（仅阻断该 IP 访问指定 `app_key`）；
  - 记录被封禁 IP 地址（支持精确 IP、通配符 `*` 及 CIDR 网段）、封禁原因备注、触发封禁的源审计日志 ID (`source_log_id`)、启用状态 (`status`) 及创建/更新时间。
- **网关拦截器 (`OpenApiSecurityInterceptor`) 黑名单一票否决与内存高速缓存**：
  - 遵循“**黑名单优先于白名单（拒绝一票否决）**”安全准则，在网关鉴权前置阶段优先校验客户端 IP 是否命中生效中的黑名单；
  - 内置内存级高速缓存与管理端变更即时刷新机制，实现零数据库 IO 开销的毫秒级实时阻断；
  - 命中黑名单时返回 HTTP 403 Forbidden，并异步记录一条状态为 `2 (安全拦截)` 的审计日志，明确标注“安全拦截: 客户端 IP [xxx] 已被列入黑名单”。
- **调用日志审计列表支持单条/批量选中加入 IP 黑名单 (`tab8_open_api.js`)**：
  - 日志列表新增复选框列（支持单选、全选、Shift 连续多选与矩形框选 `MarqueeSelector`）及客户端 IP 筛选输入框；
  - 日志表格中针对已处于黑名单的 IP 直观渲染红底「已拉黑」警示标签；
  - 单行操作列与日志详情弹窗新增纯文本「拉黑IP」/「解封IP」快捷按钮，筛选工具栏新增「批量拉黑选中IP」按钮，支持一键填入封禁原因（自动关联源日志 ID 与原拦截状态）并即时生效。
- **防自锁与防误封安全校验**：
  - 当管理员尝试封禁回环地址（`127.0.0.1`、`localhost`、`::1`）或当前管理员自身所在客户端 IP 时，强制弹出高危风险二次确认提示，防止误锁本机 MCP 或管理端调用。
- **新增 IP 黑名单集中管理视图**：
  - 在 Tab8 顶部或日志审计工具栏提供「IP 黑名单管理」入口，支持按 IP / AppKey / 状态检索黑名单记录，支持手动新增（`➕ 新增黑名单IP`）、编辑原因与范围（`✏️ 编辑`）、快速启停/解封与彻底删除（`🗑️ 删除`）。

## Capabilities

### New Capabilities
- `open-api-ip-blacklist`: 开放 API 客户端 IP 黑名单全生命周期管控能力，涵盖从调用审计日志单条/批量一键拉黑 IP、网关前置黑名单一票否决高速拦截、防误封本机校验及黑名单可视化增删改查管理。

### Modified Capabilities
- `open-api-manage-ui`: 扩展 Tab8 调用日志审计界面，新增按客户端 IP 筛选、日志行复选框多选与框选、单行/批量加入 IP 黑名单、已拉黑状态标记及 IP 黑名单管理弹窗/子视图。
- `warehouse-open-api`: 扩展开放 API 安全网关拦截链，在签名与白名单校验前增加 IP 黑名单一票否决校验，并对黑名单拦截事件记录审计日志。

## Impact

- **数据库基线演进 (`bin/db/datax_web_stat_task.sql`)**：
  - 在平台系统 SQL 基线末尾追加 `job_api_ip_blacklist` 建表语句（`CREATE TABLE IF NOT EXISTS`，字符集 `utf8mb4`）。
- **后端代码 (`datax-admin`)**：
  - 新增实体类 `JobApiIpBlacklist.java`、Mapper 接口 `JobApiIpBlacklistMapper.java` 与 XML 映射文件、服务接口 `JobApiIpBlacklistService.java` 及其实现类（含本地内存缓存与通配/CIDR 匹配逻辑）；
  - 修改 `OpenApiSecurityInterceptor.java`：注入 `JobApiIpBlacklistService` 与 `JobApiLogService`，执行黑名单前置拦截与拦截审计记录；
  - 修改 `JobOpenAdminController.java`：`pageLogs` 增加 `clientIp` 筛选参数；新增 `/api/open/admin/blacklist/page`、`save`、`batchAddFromLogs`、`toggleStatus`、`delete`、`activeIps` 等管理端接口（严格限制管理员权限）。
- **前端代码 (`datax-admin/src/main/resources/static/static/js/assistant/tabs/tab8_open_api.js`)**：
  - 扩展调用日志审计工具栏与表格，集成复选框多选、客户端 IP 检索、已拉黑徽标、单行/详情弹窗/批量一键拉黑与解封交互，以及 IP 黑名单管理弹窗。
