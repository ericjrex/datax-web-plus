# Tasks

## 1. 数据库演进基线与实体模型扩展

- [x] 1.1 在 `bin/db/datax_web_stat_task.sql` 末尾追加平台系统 SQL：为 `job_api_log` 表新增 `client_source` (`varchar(128)`) 与 `user_agent` (`varchar(512)`) 字段及索引，检查 SQL 语法符合规范。
- [x] 1.2 在 `JobApiLog.java` 中新增 `clientSource` 和 `userAgent` 两个字段及 Getter/Setter 方法，保持原有 `@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")` 注解规范。
- [x] 1.3 在 `JobApiLogService.java` 和 `JobApiLogServiceImpl.java` 中新增 `@PostConstruct` 自动检查并幂等补齐 `job_api_log` 表的 `client_source` 与 `user_agent` 字段，实现 `resolveClientSource(HttpServletRequest)` 与 `extractUserAgent(HttpServletRequest)` 公共解析方法（支持识别 `X-Client-Source`、各主流 AI 工具、Edge/Chrome/Firefox/Safari 浏览器、Postman/Apifox/curl/Python 脚本等，并截断长度与过滤控制字符），扩展 `pageLogs` 支持 `clientSource` 模糊检索。

## 2. 开放 API 网关与管理端 Controller 接入

- [x] 2.1 修改 `OpenApiSecurityInterceptor.java` 的 `recordRejectLog` 方法，调用 `jobApiLogService.resolveClientSource(request)` 和 `extractUserAgent(request)` 将调用终端与原始 `User-Agent` 写入被拦截的审计日志记录。
- [x] 2.2 修改 `JobOpenApiController.java` 中所有生成 `JobApiLog` 的入口（包括元数据查询、在线测试与 `/query` 接口），统一填充 `clientSource` 与 `userAgent` 字段。
- [x] 2.3 修改 `JobOpenAdminController.java` 的 `/api/openAdmin/log/list` 接口，新增 `@RequestParam(required = false) String clientSource` 参数并透传给 `jobApiLogService.pageLogs`。

## 3. 本地 MCP 脚本与一键安装向导宿主 AI 工具识别

- [x] 3.1 修改 `open_api_templates.js` 中的 `getWindowsSetupBatScript`：在写入 Trae、WorkBuddy、Qoder、Antigravity、DeepSeek Harness、OpenCode、Codex、Cursor、Claude Desktop、Windsurf、VS Code 等各工具配置文件时，按目标工具精准注入 `"DATAX_MCP_CLIENT"` 环境变量。
- [x] 3.2 修改 `open_api_templates.js` 中的 `RAW_PYTHON_MCP_TEMPLATE` (`datax_mcp.py`)：新增 `_detect_ai_client_source()` 三层识别函数（读取 `DATAX_MCP_CLIENT` -> 扫描宿主机特征环境变量 -> 探测 `os.getppid()` 父进程名）与 `_build_headers()` 公共请求头构造函数，在所有 `requests.get` / `requests.post` 调用中统一携带 `X-Client-Source` 和 `User-Agent` 请求头。

## 4. Tab8 调用日志审计前端展示、筛选与导出

- [x] 4.1 修改 `tab8_open_api.js`：在调用日志筛选栏新增“筛选终端/AI工具 (如 Trae/Chrome)”输入框；在表格中新增“调用终端 / AI工具”列，按 AI 工具 (`MCP`)、浏览器、调试工具渲染不同颜色的徽标（全部经过 `safeEscapeHtml` 转义）；在日志详情弹窗与 Excel 导出中同步展示 `clientSource` 与完整 `userAgent`，并通过 `node --check` 校验 JS 语法零错误。
