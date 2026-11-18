# Proposal: Tab8 调用日志审计新增调用终端与 AI 工具来源识别

## Why

目前 Tab8「调用日志审计」仅记录了调用账号（`app_key`）与客户端 IP（`client_ip`），无法得知请求究竟是由什么终端发起的——是浏览器直连（Chrome / Edge）、接口调试工具（Postman / Apifox / curl）、普通 Python 脚本，还是具体的某款 AI 工具（如 Trae、WorkBuddy、Qoder、DeepSeek Harness、OpenCode、Codex、Antigravity、Cursor 等）。尤其在多款本地 AI 工具通过同一个 `python datax_mcp.py` 进程访问开放 API 时，Python `requests` 默认发送的 `User-Agent` 均为 `python-requests/2.x`，导致服务端存在识别盲区。

为了帮助管理员在审计与排查异常调用时一眼看清请求端使用的浏览器或 AI 工具，本变更通过在本地 MCP 脚本与一键配置向导中植入三层客户端特征探测并透传 `X-Client-Source` / `User-Agent`，结合服务端请求头智能解析与持久化，在 Tab8 审计日志中实现调用终端与 AI 工具来源的可视化展示、检索与报表导出。

## What Changes

- **扩展 `job_api_log` 审计日志表结构与自动升级兜底**：
  - 新增字段 `client_source`（`varchar(128)`）：存储归一化的调用终端或 AI 工具名称（如 `Trae (MCP)`、`WorkBuddy (MCP)`、`Antigravity (MCP)`、`DeepSeek (MCP)`、`Chrome 130`、`Postman`、`Python 脚本` 等）；
  - 新增字段 `user_agent`（`varchar(512)`）：存储完整的原始 HTTP `User-Agent` 字符串，供日志详情弹窗深度溯源；
  - 追加平台系统基线 SQL 至 `bin/db/datax_web_stat_task.sql` 末尾，并在后端启动时自动检测与平滑补齐列。
- **升级本地 MCP 客户端 (`datax_mcp.py`) 与一键安装脚本 (`setup_mcp.bat`)**：
  - **第一层（配置级精准注入）**：`setup_mcp.bat` 在向 Trae、WorkBuddy、Qoder、Antigravity、DeepSeek Harness、OpenCode、Codex、Cursor、Claude Desktop、Windsurf、VS Code 等不同工具目录注入配置时，自动在 `env` 中写入专属 `DATAX_MCP_CLIENT` 标识；
  - **第二层（环境变量与宿主机上下文嗅探）**：若用户手动配置未带 `DATAX_MCP_CLIENT`，`datax_mcp.py` 自动扫描进程环境变量特征（如 `TRAE_*`, `CURSOR_*`, `VSCODE_*`, `ANTIGRAVITY_*`, `WORKBUDDY_*`, `QODER_*` 等）；
  - **第三层（父进程树可执行文件名探测）**：通过 `os.getppid()` 结合系统进程名（如 `Trae.exe`, `Cursor.exe`, `WorkBuddy.exe`, `Qoder.exe`, `Code.exe`）自动识别宿主 AI 工具；
  - `datax_mcp.py` 在发起 `/metadata/tables` 与 `/sql/execute` 请求时，自动在请求头携带 `X-Client-Source` 与增强版 `User-Agent`。
- **新增服务端客户端来源解析器与全链路审计记录**：
  - 抽取公共工具/服务方法 `resolveClientSource(HttpServletRequest)` 与 `extractUserAgent(HttpServletRequest)`，同时支持识别 AI MCP 工具、主流浏览器（Edge / Chrome / Firefox / Safari）、接口工具（Postman / Apifox / Insomnia / curl）与各类 SDK（Python / Java / Go / Node.js）；
  - 在 `JobOpenApiController`（正常/越权/失败请求与元数据查询）及 `OpenApiSecurityInterceptor`（黑名单拦截）中统一记录 `client_source` 与 `user_agent`。
- **升级 Tab8 调用日志审计界面与 Excel 导出 (`tab8_open_api.js`)**：
  - 日志筛选栏新增「筛选终端 / AI工具」输入框；
  - 日志表格「客户端IP」列（或独立展示区）直观渲染调用终端与 AI 工具徽标（区分 AI MCP 工具蓝紫色标签、浏览器青色标签、脚本灰色标签）；
  - 日志详情弹窗展示归一化「调用终端 / AI工具」及完整原始 `User-Agent`；
  - Excel / CSV 导出新增「调用终端/AI工具」与「原始User-Agent」列。

## Capabilities

### New Capabilities
- `open-api-client-source-audit`: 开放 API 调用端浏览器与 AI 工具来源识别与审计能力，涵盖本地 MCP 三层宿主工具嗅探、HTTP 请求头解析归一化、日志持久化、多维筛选与详情透视。

### Modified Capabilities
- `open-api-manage-ui`: 扩展 Tab8 调用日志审计界面，支持展示与按关键字筛选调用端浏览器或 AI 工具名称，并在详情弹窗与导出报表中包含终端来源与原始 `User-Agent`。

## Impact

- **数据库基线演进 (`bin/db/datax_web_stat_task.sql`)**：
  - 更新 `job_api_log` 表结构并追加 `ALTER TABLE job_api_log ADD COLUMN client_source ...` 与 `user_agent` 升级语句。
- **后端代码 (`datax-admin`)**：
  - `JobApiLog.java`：新增 `clientSource` 与 `userAgent` 属性；
  - `JobApiLogServiceImpl.java`：启动时自动检查并补齐 `job_api_log` 的 `client_source` 和 `user_agent` 字段，提供公共方法解析请求端浏览器与 AI 工具标识；
  - `JobOpenApiController.java` & `OpenApiSecurityInterceptor.java`：记录审计日志时填充 `clientSource` 与 `userAgent`；
  - `JobOpenAdminController.java`：`pageLogs` 新增可选筛选参数 `clientSource`。
- **前端代码 (`datax-admin/src/main/resources/static/static/js/assistant/`)**：
  - `templates/open_api_templates.js`：升级 `RAW_PYTHON_MCP_TEMPLATE` 与 `getWindowsSetupBatScript`，注入 `DATAX_MCP_CLIENT` 与三层自动探测逻辑；
  - `tabs/tab8_open_api.js`：日志列表、筛选栏、详情弹窗及导出 Excel 增加调用终端/AI工具展示与过滤。
