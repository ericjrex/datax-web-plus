# Design: Tab8 一键复制密钥 MCP 配置与本地安全接入

## Context

见 `proposal.md`。当前 DataX-Web 已具备完善的只读开放 API 网关（`/api/open/v1/metadata/tables` 与 `/api/open/v1/sql/execute`）以及前端 Tab8 账号管理面板。
原设计中通过 `OpenApiTemplates.getAiPrompt(appKey, appSecret)` 生成融合了真实私钥的 Markdown 规范供直接复制给大模型，存在严重的通信私钥外泄隐患。此外，如果通过让 AI 对话助手“自动装配”而将包含真实私钥的 Prompt 发送至聊天框，该密钥仍会直接上传到云端模型厂商（DeepSeek/Anthropic/OpenAI等）的日志与上下文中。为彻底做到“私钥不出本地”，必须完全摒弃任何将私钥发送给 AI 对话框的途径，提供纯本地离线批处理脚本与标准 MCP 配置文件。

## Goals / Non-Goals

**Goals:**
- 将 Tab8 API 凭据弹窗中的「整体复制 (供 AI 提数)」重构为「一键复制密钥MCP 配置」。
- 在 `open_api_templates.js` 中新增标准 MCP 配置文件（`mcp.json` 片段）、开箱即用的 Python MCP 客户端模版（`datax_mcp.py`）以及 Windows 本地离线一键安装脚本（`setup_mcp.bat`）。
- 彻底下线并废弃将密钥注入 AI 对话提示词的“AI 自动安装”入口，杜绝私钥上传云端大模型。
- 在 `tab8_open_api.js` 中新增「通用 MCP 接入与密钥配置」弹窗，默认激活本地一键脚本面板，支持一键下载脚本与复制手动配置。
- 全面移除“小白”等口语化字眼与非白名单 Emoji，遵循严谨的工业级界面规范。
- 彻底剔除 `RAW_AI_PROMPT_TEMPLATE` 中的明文密钥注入，改为环境变量占位符。
- 增强 Tab8 调用日志审计：SQL 弹窗自适应折行换行、列表与明细联合展示账号中文名称与 AK、支持多档位分页大小选择、支持带格式 Excel 与离线 CSV 导出。

**Non-Goals:**
- 不改动后端 OpenAPI 接口与鉴权机制（复用现有的 HMAC-SHA256 签名与 Druid AST 只读校验）。
- 不在后端开发长连接 SSE 网关（MCP Server 直接作为本地 stdio 进程运行在用户宿主机上）。

## Decisions

### 1. 采用 Local Stdio 协议的 Python 单文件 MCP Server 模版
- **决策**：提供基于标准 Python 3 + `mcp` SDK / `requests` 的独立脚本 `datax_mcp.py`，采用 stdio 进程通信方式。
- **理由**：
  - Trae、DeepSeek Harness、WorkBuddy、Qoder、OpenCode、Codex、Antigravity、Cursor 等各大 Agent IDE 原生支持 stdio / local 模式的 MCP Server；
  - 数据分析师与工程师本地普遍具备 Python 环境；
  - 核心逻辑仅包含获取表结构（`get_tables`）与执行 SQL（`execute_sql`），代码轻量（100 行内），无侵入性。

### 2. 拒绝 AI 对话 Prompt 装配，采用 Windows 本地离线批处理脚本 (`setup_mcp.bat`)
- **决策**：彻底下线复制给 AI 对话框的 Prompt 装配入口，改为提供本地一键下载并双击运行的 Hybrid Batch/Python 脚本 `setup_mcp.bat`。
- **理由**：
  - **严重安全风险**：如果把包含真实 `AppSecret` 的配置指令发给 AI 对话框，即使 AI 跑在本地 IDE 里，该指令文本仍会被作为 Prompt 网络请求发送给云端大模型（DeepSeek、Claude、OpenAI），导致私钥留存在外部服务器日志与会话历史中，直接造成云端泄密。
  - **本地自动化更安全可靠**：`setup_mcp.bat` 第一行启动 Python，后续由原生 Python 离线解析执行，自动安装依赖并将配置优先写入主流 AI 工具（`%APPDATA%/Trae`、`~/.workbuddy-ai`、`~/.workbuddy`、`~/.qoder`、`~/.config/opencode`、`~/.codex`、`~/.gemini`、`~/.cursor` 等）本地工具配置路径，并对 WorkBuddy 自动完成 `mcp-approvals.json` 信任注入，对 OpenCode 自动注入 `mcp` 结构与 `type: "local"`，对 Codex 自动注入 TOML 格式表项，全程不与任何外部 AI 产生网络交互，凭据生命周期严格闭环在本地机器中。

### 3. 标准 MCP 密钥配置结构 (`mcp.json`) 与 OpenCode / Codex 适配
- **决策**：生成符合 Model Context Protocol 规范的 `mcp.json` 片段（`mcpServers`），并在一键脚本与接入指南中同时适配 OpenCode 规范（`opencode.json` 的 `mcp` 节点与 `type: "local"`）以及 Codex 规范（`config.toml` 的 `[mcp_servers]`）：
  ```json
  // 标准 mcpServers (Trae / WorkBuddy / Qoder / Antigravity / Cursor)
  {
    "mcpServers": {
      "datax-web": {
        "type": "stdio",
        "command": "python",
        "args": ["datax_mcp.py"],
        "env": {
          "DATAX_BASE_URL": "http://127.0.0.1:8080/api/open/v1",
          "DATAX_OPEN_AK": "your_app_key",
          "DATAX_OPEN_SK": "your_app_secret"
        }
      }
    }
  }

  // OpenCode 格式 (opencode.json)
  {
    "$schema": "https://opencode.ai/config.json",
    "mcp": {
      "datax-web": {
        "type": "local",
        "command": ["python", "datax_mcp.py"],
        "environment": {
          "DATAX_BASE_URL": "http://127.0.0.1:8080/api/open/v1",
          "DATAX_OPEN_AK": "your_app_key",
          "DATAX_OPEN_SK": "your_app_secret"
        },
        "enabled": true
      }
    }
  }
  ```
  ```toml
  # Codex 格式 (~/.codex/config.toml)
  [mcp_servers.datax-web]
  command = "python"
  args = ["datax_mcp.py"]

  [mcp_servers.datax-web.env]
  DATAX_BASE_URL = "http://127.0.0.1:8080/api/open/v1"
  DATAX_OPEN_AK = "your_app_key"
  DATAX_OPEN_SK = "your_app_secret"
  ```
- **理由**：为高级用户提供清晰透明的手动配置视图，AK 与 SK 仅作为本地进程的环境变量存在。针对 OpenCode 与 Codex 等差异化配置格式进行专项兼容。

### 4. 界面用语严谨度与白名单 Emoji 规范
- **决策**：清理弹窗内“小白友好”、“小白推荐”等用语，移除 💡 等非白名单图标，保持界面严谨纯洁。

### 5. 模板与视图逻辑分层维护
- **决策**：所有静态文档、脚本源码与代码模板收敛在 `static/js/assistant/templates/open_api_templates.js`，Tab 视图组件 `tab8_open_api.js` 仅负责弹窗事件触发、数据填充与 DOM 渲染。

### 6. 调用日志审计 SQL 自适应折行排版
- **决策**：在审计明细弹窗中将 `<pre>` 样式调整为 `white-space: pre-wrap; word-break: break-all; overflow-y: auto; overflow-x: hidden;`。
- **理由**：默认 `pre` 样式遇到长 SQL 只能单行向右撑开出现横向滚动条，严重影响阅读体验。`pre-wrap` 既能保留 SQL 原始换行与缩进，又能在弹窗宽度边界自动折行，杜绝横向滚动条。

### 7. 调用账号中文名称与 AK 联合展示与内存字典映射
- **决策**：`JobApiLog` 实体新增非持久化字段 `@TableField(exist = false) private String accountName;`，后端在分页检索与单条详情返回前，从账号服务获取 `appKey -> accountName` 字典并批量组装注入；前端同时内置字典缓存自动兜底。
- **理由**：
  - 无需执行数据库 DDL 添加物理冗余列，避免锁表风险；
  - 动态关联可使历史存量日志直接呈现最新账号中文名；
  - 账号管理修改名称后，调用日志审计能即时感知最新的中文名称。

### 8. 分页条数多档位与默认 20 条/页
- **决策**：审计日志默认分页大小提升为 20 条/页，提供 20/50/100/300/500 下拉切换，并与总页数和前后翻页按钮联动。
- **理由**：原有 10 条/页对于高频 API 调用审计场景翻页过于频繁，20~500 的梯度能够满足快速定位与批量查阅需求。

### 9. 审计日志双级离线安全导出引擎
- **决策**：在筛选栏新增纯文本「导出 Excel」按钮（严禁违规 Emoji），采用 SheetJS 引擎构建多列宽 `.xlsx` 文件；当无外网或 CDN 离线时，优雅降级为纯原生带 `\uFEFF` UTF-8 BOM 头的 CSV 文件导出。
- **理由**：审计数据需要离线归档与跨部门同步，双级导出引擎确保在任何局域网或内网离线环境中 100% 成功下载且 Windows Excel 打开不乱码。

## Architecture & Data Flow

```
+--------------------------------------------------------------------------------+
| 用户本地宿主机 (Windows 环境)                                                   |
|                                                                                |
|  [用户在 Tab8 弹窗下载 setup_mcp.bat]                                          |
|         |                                                                      |
|         v                                                                      |
|  [双击运行 setup_mcp.bat (离线自动写入本地配置)]                                |
|         +---> 自动生成本地 datax_mcp.py                                        |
|         +---> 自动注入配置至本机 ~/.gemini/、%APPDATA%/Trae/ 等本地路径        |
|         |     (全程不发送至云端，凭据不出本机)                                 |
|         v                                                                      |
|  [Trae / DeepSeek / WorkBuddy / Qoder / Antigravity 宿主进程 (读取本地配置拉起 stdio 进程)] |
|         |                                                                      |
|         +---> 1. 向云端大模型上送: 用户问数指令 + MCP 工具元数据               |
|         |        (绝无 AK/SK/Secret 敏感凭据)                                  |
|         v                                                                      |
|  [云端 LLM (DeepSeek / Claude)]                                                |
|         |                                                                      |
|         +---> 2. 模型决策并生成只读 SQL，触发工具调用:                         |
|                  call: execute_sql(datasourceId=8, sql="SELECT ...")           |
|         v                                                                      |
|  [本地 datax_mcp.py (Stdio 进程)]                                              |
|         | 读取本地环境变量: DATAX_OPEN_AK, DATAX_OPEN_SK                       |
|         | 在本地内存完成 HMAC-SHA256 签名计算                                  |
|         +---> 3. HTTP POST /api/open/v1/sql/execute                            |
|         |                                                                      |
|         <---+ 4. 返回查询数据结果                                              |
|         v                                                                      |
|  [聊天窗口] <--- 5. 渲染 Markdown 表格或数据图表                               |
+--------------------------------------------------------------------------------+
                                    | 步骤 3
                                    v
            +-----------------------------------------------+
            |  DataX-Web OpenAPI 网关 (/api/open/v1/**)     |
            +-----------------------------------------------+
```

## Risks / Trade-offs

- **[云端 Prompt 密钥泄露风险]** → 缓解措施：彻底下线 AI 对话提示词复制入口，废弃相关方法并强制脱敏占位符，仅允许本地 `.bat` 离线注入或手动配 `mcp.json`。
- **[用户本地未安装 Python 环境]** → 缓解措施：`setup_mcp.bat` 启动前通过 `where python` 自动校验，未安装时给出清晰错误提示并暂停，避免异常退出。
- **[本地 `mcp.json` 被误提交公网 Git]** → 缓解措施：在弹窗界面以黄色警示框显著提示用户妥善保管本地配置，严禁提交至 Git。
