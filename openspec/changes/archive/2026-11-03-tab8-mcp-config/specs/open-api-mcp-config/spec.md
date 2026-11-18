# Spec Delta

## Purpose

为 DataX-Web 开放 API 账号管理（Tab8）提供面向主流 AI 工具（Trae、DeepSeek Harness、WorkBuddy、Qoder、OpenCode、Codex）与全球平台（Antigravity、Cursor 等）的标准 MCP (Model Context Protocol) 密钥配置导出、本地一键脚本注入与单文件客户端模版，确保通信私钥仅在本地运行环境流转，彻底阻断任何通过 AI 对话框上传私钥的泄密途径。

## ADDED Requirements

### Requirement: Tab8 凭据弹窗支持一键复制密钥MCP配置
系统 SHALL 在 Tab8「API 凭据信息」弹窗底部将原有的「整体复制 (供 AI 提数)」按钮重构为「一键复制密钥MCP 配置」，并提供统一的模态弹窗用于展示与复制 MCP 协议配置及客户端模版。弹窗默认激活「一键脚本 (全平台自动写入)」面板，主按钮对齐为「下载安装脚本 (setup_mcp.bat)」。

#### Scenario: 点击一键复制密钥MCP配置
- **WHEN** 用户在 Tab8 凭据弹窗中点击「一键复制密钥MCP 配置」按钮
- **THEN** 系统弹出「通用 MCP 接入与密钥配置」窗口，展示针对当前账号的离线一键安装脚本预览、`mcp.json` 配置片段、Python 客户端代码以及各工具接入操作指引。

### Requirement: 本地自动化安装批处理脚本生成与全平台配置注入
系统 SHALL 提供基于 Hybrid Batch/Python 单文件技术的 Windows 一键安装脚本 (`setup_mcp.bat`)。脚本内置当前账号凭据，用户下载后直接双击执行，离线完成 `mcp` 与 `requests` 依赖安装，自动生成本地 `datax_mcp.py` 客户端，并全自动将配置注入本地所有已安装的 AI 工具（优先覆盖 Trae、DeepSeek Harness、WorkBuddy、Qoder、OpenCode、Codex，并支持 Antigravity、Cursor、Claude Desktop、Windsurf、VS Code）。针对 WorkBuddy，脚本必须显式声明 `"type": "stdio"` 并自动注入 `~/.workbuddy-ai/mcp.json` 与信任授权快照 (`mcp-approvals.json`)，确保连接器中心即时可用。针对 OpenCode，脚本需检测 `~/.config/opencode/opencode.json` 等路径并自动注入 `mcp` 结构与 `type: "local"`。针对 OpenAI Codex，脚本需检测 `~/.codex/config.toml` 与 `.codex/config.toml`，以 TOML 格式写入 `[mcp_servers.datax-web]` 与 `[mcp_servers.datax-web.env]` 节点。

#### Scenario: 下载一键安装脚本
- **WHEN** 用户在弹窗中点击「下载安装脚本 (setup_mcp.bat)」按钮
- **THEN** 系统以 `application/octet-stream` 格式触发本地下载包含完整安装逻辑与当前凭据的 `setup_mcp.bat` 脚本文件。

#### Scenario: 针对 OpenCode 配置文件注入
- **WHEN** 运行安装脚本且本机存在 OpenCode 配置目录
- **THEN** 脚本在 `opencode.json` 的 `mcp` 节点下写入 `datax-web`，配置 `type: "local"` 与 `environment` 环境变量，保留原有其他 MCP 配置。

#### Scenario: 针对 OpenAI Codex 配置文件注入
- **WHEN** 运行安装脚本且本机存在 `~/.codex` 目录
- **THEN** 脚本以 TOML 语法在 `config.toml` 中追加或更新 `[mcp_servers.datax-web]` 配置与环境变量，保留原有 TOML 配置。

### Requirement: MCP 密钥配置 JSON 生成与手动导出
系统 SHALL 自动组装符合标准 Model Context Protocol (MCP) 规范的 `mcp.json` 片段，在 `env` 节点中注入当前账号的真实网关地址、AccessKey 及 AppSecret，提供给本地 IDE（如 Trae / DeepSeek Harness / WorkBuddy / Qoder / Antigravity / Cursor 等）手动加载。

#### Scenario: 复制 MCP 配置片段
- **WHEN** 用户在手动配置面板中点击「复制 JSON」按钮
- **THEN** 系统将包含当前账号真实 `DATAX_BASE_URL`、`DATAX_OPEN_AK` 与 `DATAX_OPEN_SK` 的标准 JSON 配置文本复制到系统剪贴板，并弹出成功提示。

### Requirement: 单文件 Python MCP 客户端模版生成
系统 SHALL 在前端模版库中内置标准、零额外依赖（仅依赖标准库及 requests/mcp）的单文件 Python MCP Server 脚本模版 (`datax_mcp.py`)，对外注册 `get_tables`（元数据发现）与 `execute_sql`（安全只读 SQL 执行）两个工具，并在本地完成 HMAC-SHA256 签名，避免私钥外泄给大模型上下文。

#### Scenario: 复制 MCP 客户端脚本代码
- **WHEN** 用户在手动配置面板中切换到「通用客户端脚本 (datax_mcp.py)」标签并点击复制
- **THEN** 系统将完整的单文件 Python MCP 脚本源码复制到剪贴板，支持直接保存为本地文件运行。

### Requirement: 严禁将通信私钥注入任何 AI 对话提示词
系统 SHALL 彻底下线并禁止任何通过 AI 对话框要求 Agent 自动装配 MCP 的提示词复制入口。在生成通用 AI 提示词规范或文本模板时，SHALL 禁止向提示词文本中注入真实明文 `AppSecret`，必须使用环境变量占位符或提示说明替代。

#### Scenario: 提示词模板不含明文密钥
- **WHEN** 系统渲染或生成供 AI 读取的 Markdown 提示词时
- **THEN** 文档中的通信私钥字段必须保持环境变量占位符（如 `DATAX_OPEN_SK`），不包含任何真实明文密钥。

### Requirement: 界面用语严谨度与纯洁度规范
系统在 MCP 配置弹窗的所有标题、说明、Tab 标签与按钮文案中，SHALL 严格遵守界面纯洁性规范，严禁出现“小白”等口语化字眼，严禁在弹窗内引入非白名单 Emoji 图标。

#### Scenario: 弹窗展示纯洁性与规范文案
- **WHEN** 用户打开 MCP 接入与配置弹窗时
- **THEN** 界面中所有 Tab 与说明文本均使用严谨专业的中台术语，不含任何“小白”字样，且仅保留白名单图标或纯文本。

### Requirement: 调用日志审计明细支持 SQL 自动换行自适应展示
系统 SHALL 在调用日志审计明细弹窗中将「完整执行 SQL」的代码展示容器配置为自适应自动折行样式（`white-space: pre-wrap; word-break: break-all;`），隐藏横向滚动条，长 SQL 达到对话框宽度时自动折行，同时保留纵向平滑滚动与代码高亮/字体样式。

#### Scenario: 查看超长 SQL 审计明细
- **WHEN** 用户在调用日志列表中点击某条包含长查询语句记录的「🔍 详情」按钮
- **THEN** 弹出的日志审计明细窗口中，完整执行 SQL 在容器宽度内自动折行展示，不出现任何底部横向滚动条。

### Requirement: 调用日志列表与详情联合展示账号中文名称与 AppKey
系统 SHALL 在调用日志列表表格中将第二列声明为「调用账号 / AppKey」，单元格上方以突出字色展示账号中文名称（如“大模型提数专用账号”），下方以代码标签展示对应 AK；在详情明细弹窗中同样联合展示为「账号中文名 (AppKey)」。后端管理接口与实体需通过关联映射动态补齐 `accountName`，且前端需内置字典缓存自动兜底。

#### Scenario: 调用日志表格展示账号中文名称
- **WHEN** 管理员在 Tab8 切换到「调用日志审计」子选项卡并加载日志列表
- **THEN** 表格每行第二列上方清晰呈现该调用方在账号管理中配置的中文名称，下方呈现对应的 AppKey。

#### Scenario: 详情弹窗展示账号中文名称
- **WHEN** 用户点击日志行的「🔍 详情」
- **THEN** 明细弹窗顶部「调用账号」字段展示为「账号中文名称 (AppKey)」。

### Requirement: 调用日志审计提供多档位分页大小切换
系统 SHALL 为调用日志审计列表提供分页大小控制，默认每页展示 **20** 条，并在分页栏右侧提供下拉框支持在 **20 / 50 / 100 / 300 / 500 条/页** 之间自由切换。切换后自动回到第 1 页重新检索，并精确计算总页数及上一页/下一页按钮禁用状态。

#### Scenario: 切换分页大小至 100 条/页
- **WHEN** 用户在调用日志审计底部分页栏将分页大小下拉框切换至「100 条/页」
- **THEN** 列表自动以 pageSize=100 发起检索并重置到第 1 页，底部分页信息更新为「共 X 条 / 第 1 / Y 页」。

### Requirement: 调用日志审计支持按筛选条件全量导出 Excel
系统 SHALL 在调用日志审计筛选栏提供纯文本「导出 Excel」按钮（严禁使用非白名单 Emoji）。点击后自动根据当前填写的筛选条件（AppKey、状态、起止日期）异步拉取前 2000 条日志，组装包含日志ID、调用时间、账号名称、AppKey、IP、表名、条数、耗时、状态、异常原因及完整 SQL 等完整字段的工作簿，自适应配置各列列宽后触发浏览器原生下载。当检测到网络或 SheetJS 依赖异常时，系统 SHALL 自动优雅降级为带 UTF-8 BOM 头的原生 CSV 文件导出，保证中文无乱码且流程不中断。

#### Scenario: 导出当前筛选的审计日志为 Excel
- **WHEN** 用户在设置筛选条件后点击「导出 Excel」按钮
- **THEN** 按钮显示「正在导出...」并进入禁用状态，数据拉取完成后自动生成并下载 `API调用审计日志_YYYYMMDD_HHmmss.xlsx` 文件，下载完毕后弹出成功提示并恢复按钮状态。

#### Scenario: 离线环境优雅降级为 CSV 导出
- **WHEN** 在内网无外部 CDN 环境下触发导出
- **THEN** 系统自动降级执行原生 CSV 生成逻辑，添加 `\uFEFF` UTF-8 BOM 头，文件安全下载为 `.csv` 格式，在 Windows Excel / WPS 中双击直接打开不乱码。
