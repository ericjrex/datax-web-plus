# Tasks: Tab8 一键复制密钥 MCP 配置与本地安全接入

## 1. 模版库扩展与提示词解耦 (OpenApiTemplates)

- [x] 1.1 在 `open_api_templates.js` 中新增 `getMcpConfigJson(appKey, appSecret, origin)` 方法，组装针对 Trae / DeepSeek Harness 的标准 `mcp.json` 配置片段
- [x] 1.2 在 `open_api_templates.js` 中新增 `getPythonMcpScript()` 方法，提供基于 Stdio 模式、包含 `get_tables` 与 `execute_sql` 工具的轻量级单文件 `datax_mcp.py` 客户端源码
- [x] 1.3 重构 `open_api_templates.js` 中的通用 AI Prompt 模版，彻底移除明文 `AppSecret` 注入，替换为安全的占位符说明
- [x] 1.4 在 `open_api_templates.js` 中实现基于 Hybrid Batch/Python 单文件技术的 Windows 本地一键安装脚本生成器 `getWindowsSetupBatScript`，实现依赖离线安装与本地多工具配置写入
- [x] 1.5 废弃 `getAiAgentSetupPrompt` 并将内部私钥强制替换为脱敏占位符，阻断任何将明文密钥传给大模型云端的问题
- [x] 1.6 在 `open_api_templates.js` 的 `setup_mcp.bat` 目标注入列表与模板中增加 Qoder 配置路径 (`~/.qoder/settings.json`)
- [x] 1.7 在 `open_api_templates.js` 的 `setup_mcp.bat` 目标注入列表与模板中增加 WorkBuddy 配置路径 (`~/.workbuddy/.mcp.json`、`~/.codebuddy/.mcp.json`)
- [x] 1.8 在 `open_api_templates.js` 的 `setup_mcp.bat` 目标注入中增加 OpenCode 配置路径 (`~/.config/opencode/opencode.json`、`~/.opencode/opencode.json`、`opencode.json`) 与专有 `mcp` 结构写入
- [x] 1.9 在 `open_api_templates.js` 的 `setup_mcp.bat` 目标注入中增加 OpenAI Codex 配置路径 (`~/.codex/config.toml`、`.codex/config.toml`) 与 TOML 格式注入支持

## 2. Tab8 界面与交互重构 (Tab8OpenApi)

- [x] 2.1 重命名 Tab8 凭据信息弹窗底部的按钮文案与事件绑定：将原「整体复制 (供 AI 提数)」重构为「一键复制密钥MCP 配置」，严格遵循 Emoji 白名单与 Ant Design 样式规范
- [x] 2.2 在 `tab8_open_api.js` 中实现 `showMcpConfigModal(appKey, appSecret)` 模态弹窗构建逻辑，默认展示并激活「一键脚本 (全平台自动写入)」面板，支持一键下载 `setup_mcp.bat`
- [x] 2.3 彻底下线并移除「AI 自动安装 (发给 Antigravity/Trae/Cursor)」Tab 及文本面板，杜绝用户误复制密钥发给云端大模型
- [x] 2.4 全面清理界面中的“小白”等口语化字眼与非白名单 Emoji 图标（如 💡 等），遵循纯洁性规范
- [x] 2.5 在 MCP 弹窗中提供针对 Antigravity / Trae / Cursor / DeepSeek Harness 的本地目录配置操作指引与黄色安全防泄露警示，并支持一键复制配置与一键复制代码功能
- [x] 2.6 在 `tab8_open_api.js` 的接入指南列表中补充 Qoder 工具配置文件路径与说明
- [x] 2.7 在 `tab8_open_api.js` 的弹窗标题、接入指南列表中补充 WorkBuddy 配置文件路径与说明
- [x] 2.8 在 `tab8_open_api.js` 的弹窗标题、接入指南列表中补充 OpenCode 配置文件路径与格式说明
- [x] 2.9 在 `tab8_open_api.js` 的弹窗标题、接入指南列表中补充 OpenAI Codex 配置文件路径与 TOML 格式说明

## 3. 功能联调与安全合规审查

- [x] 3.1 验证在 Tab8 凭据弹窗点击「一键复制密钥MCP 配置」能准确拉取并填充当前账号的 AK/SK 凭据
- [x] 3.2 验证生成的 `setup_mcp.bat` 脚本能够离线注入本地多款工具的配置文件且不产生网络泄露
- [x] 3.3 验证单文件 `datax_mcp.py` 能够在本地 Python 环境下正常初始化 stdio MCP 服务并执行签名查询
- [x] 3.4 审查前端代码，确保未格式化旧代码、未引入非白名单 Emoji，并完成 `safeEscapeHtml` XSS 安全审计
- [x] 3.5 验证 `setup_mcp.bat` 在本地存在 `~/.qoder` 时能正常注入 `mcpServers` 配置并完成校验
- [x] 3.6 验证 `setup_mcp.bat` 在本地存在 `~/.workbuddy` 或 `~/.codebuddy` 时能正常注入 `mcpServers` 配置并完成校验
- [x] 3.7 验证 `setup_mcp.bat` 在本地存在 OpenCode 配置时能准确注入 `mcp` 节点并完成格式校验
- [x] 3.8 验证 `setup_mcp.bat` 在本地存在 ~/.codex 目录时能准确注入 config.toml 并保留既有配置

## 4. Tab8 调用日志审计强化与导出 (Tab8LogAudit)

- [x] 4.1 在 `JobApiLog.java` 中新增非持久化字段 `@TableField(exist = false) private String accountName;`
- [x] 4.2 在 `JobOpenAdminController.java` 中调整 `pageLogs` 默认 pageSize 为 20，并与 `getLogDetail` 动态组装注入账号中文名
- [x] 4.3 在 `tab8_open_api.js` 的 `showLogDetailModal` 中重构 SQL 展示容器样式为 `white-space: pre-wrap; word-break: break-all;`，支持自动换行
- [x] 4.4 在 `tab8_open_api.js` 中重命名第二列表头为「调用账号 / AppKey」，列表行内与详情弹窗联合展示账号中文名与 AK
- [x] 4.5 在 `tab8_open_api.js` 中实现 `20 / 50 / 100 / 300 / 500 条/页` 分页大小选择器与 `logTotalPages` 联动计算控制
- [x] 4.6 在 `tab8_open_api.js` 中引入 `loadSheetJs` 与 `exportToCsvFallback` 导出引擎，实现纯文本「导出 Excel」按钮与全量数据下载
