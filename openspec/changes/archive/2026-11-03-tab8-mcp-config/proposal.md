# Proposal: Tab8 一键复制密钥 MCP 配置与本地安全接入

## Why

此前 Tab8 提供的「整体复制 (供 AI 提数)」功能直接将通信私钥 `AppSecret` 明文硬编码拼接在 System Prompt 文本中，用户复制给外部 AI 工具（如 Trae、DeepSeek Harness 或外部大模型）时，私钥和内部网关拓扑会被发送至云端，存在严重的凭据泄露风险。即使是要求本地 AI Agent“自动配置”，只要将包含明文私钥的 Prompt 粘贴进对话框，该密钥仍会直接作为网络请求发送到云端大模型厂商服务器并留存在云端日志中。

为满足用户在本地 AI IDE（Trae、DeepSeek Harness、WorkBuddy、Qoder、OpenCode、Codex、Antigravity、Cursor 等）中通过自然语言直接问数的需求，采用 Model Context Protocol (MCP) 架构，将原功能重构为「一键复制密钥MCP 配置」。通过本地 MCP Server 在用户宿主机内存中加载私钥并代行 HMAC-SHA256 签名，做到“凭据不出本地、大模型只生成 SQL、工具安全提数”，彻底切断凭据外泄路径。

## What Changes

- **重构 Tab8 凭据弹窗交互按钮**：将原「整体复制 (供 AI 提数)」按钮文字及交互重构为「一键复制密钥MCP 配置」。
- **新增 MCP 密钥配置与指引弹窗**：点击后弹出支持本地一键自动装配与手动配置的模态弹窗，默认激活本地批处理脚本一键写入，彻底阻断任何将明文密钥粘贴进 AI 聊天框的伪“自动安装”入口。
- **提供 Windows 本地一键安装脚本 (`setup_mcp.bat`)**：采用 Hybrid Batch/Python 单文件技术，用户下载后在本地双击执行，离线完成依赖安装，并直接优先将配置安全注入本地 Trae、DeepSeek Harness、WorkBuddy、Qoder、OpenCode、Codex 等 AI 工具以及 Antigravity、Cursor、Claude Desktop、Windsurf 及 VS Code 等工具的配置文件中，全程不经过任何 AI 对话框。
- **提供标准单文件 MCP 脚本模版 (`datax_mcp.py`) 与 JSON 配置**：在前端模板库中提供标准的 Python MCP Server 脚本内容，实现 `get_tables` 与 `execute_sql` 两大核心工具，内置本地 HMAC-SHA256 签名计算，确保私钥只在本地进程内存中流转，绝不进入大模型提示词上下文。
- **剔除 System Prompt 中的高危密钥注入与接口废弃**：清理原 `OpenApiTemplates.getAiPrompt` 中把真实 `AppSecret` 拼接进 AI 提示词规范的高危逻辑；将原 `getAiAgentSetupPrompt` 标记废弃并强制使用脱敏占位符，严禁泄露密钥。
- **界面用语与规范清理**：全面移除所有“小白”字样与非白名单 Emoji 图标，对齐工业级 Ant Design 界面规范。
- **调用日志审计体验与分析能力强化**：
  - **SQL 文本自适应自动换行**：调用日志审计明细弹窗中将“完整执行 SQL”代码块样式重构为 `white-space: pre-wrap; word-break: break-all;`，消除了单行横向滚动条，超长 SQL 达到边界自动折行并支持纵向滚动。
  - **调用账号中文名称与 AK 联合展示**：调用日志列表表头重命名为「调用账号 / AppKey」，每行同时展示账号中文名称与 AK 代码标签，明细弹窗中同步展示「账号名称 (AppKey)」，后端实体扩展非持久化字段并通过内存字典映射动态填充，兼顾历史与未来日志。
  - **动态分页大小与总页数联动**：审计日志列表默认分页大小提升至 20 条/页，并在分页栏右侧新增 `20 / 50 / 100 / 300 / 500 条/页` 下拉选择器，切换后自动重置第 1 页并联动更新 `第 X / Y 页`。
  - **全量审计日志一键导出**：在日志筛选栏新增纯文本「导出 Excel」按钮（严格符合白名单规范，严禁违规 Emoji），支持按当前筛选条件一键将审计日志导出为包含自适应列宽的 `.xlsx` 工作簿，并内置带 UTF-8 BOM 的纯原生 CSV 离线兜底导出引擎。

## Capabilities

### New Capabilities
- `open-api-mcp-config`: Tab8 开放 API 账号管理中优先面向主流 AI 工具（Trae / DeepSeek Harness / WorkBuddy / Qoder / OpenCode / Codex）并兼容全球工具（Antigravity / Cursor 等）的 MCP 密钥配置导出、本地一键注入脚本与单文件 MCP Server 客户端支持；同时包含调用日志审计自适应换行、账号中文联合展示、多档位分页大小切换与多级安全导出报表能力。

### Modified Capabilities
<!-- 无现有已归档 spec 发生变更 -->

## Impact

- **前端交互与模板库**：
  - `datax-admin/src/main/resources/static/static/js/assistant/tabs/tab8_open_api.js`：更新凭据信息弹窗中的按钮事件，提供纯本地化的 MCP 配置弹窗与选项卡切换；重构日志审计明细 SQL 为自适应折行；列表与弹窗联合展示账号中文名与 AK；新增分页大小选择器与 `exportLogs` 导出逻辑。
  - `datax-admin/src/main/resources/static/static/js/assistant/templates/open_api_templates.js`：新增 MCP 配置 JSON 生成器 (`getMcpConfigJson`)、单文件 Python MCP 脚本模版 (`getPythonMcpScript`)、Windows 本地一键安装脚本生成器 (`getWindowsSetupBatScript`)，废弃并脱敏旧提示词模版。
- **后端服务与持久层**：
  - `JobApiLog.java`：新增 `@TableField(exist = false) private String accountName;` 非持久化展示字段。
  - `JobOpenAdminController.java`：`pageLogs` 默认 pageSize 调整为 20，并与 `getLogDetail` 批量/单个注入 `accountName` 字典映射，复用现有网关与管理接口，无需变更数据库表结构。
