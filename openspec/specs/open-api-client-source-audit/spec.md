# open-api-client-source-audit Specification

## Purpose
在开放 API 安全网关、本地 MCP 客户端脚本与 Tab8 调用日志审计模块中提供调用端浏览器、接口工具与 AI 工具来源（如 Trae、WorkBuddy、Qoder、DeepSeek、OpenCode、Codex、Antigravity、Cursor 等）的自动识别、归一化存储、可视化展示与多维检索能力。

## Requirements

### Requirement: Multi-Layer AI Tool Detection in Local MCP Client and Setup Script
The system SHALL inject per-tool client identifiers (`DATAX_MCP_CLIENT`) in `setup_mcp.bat` when writing tool-specific configuration files, and implement fallback environment variable and parent process (`ppid`) inspection in `datax_mcp.py`, transmitting the detected AI tool name via the `X-Client-Source` and `User-Agent` HTTP headers on every OpenAPI request.

#### Scenario: Auto-injected MCP configuration reports specific AI IDE name
- **WHEN** a user runs `setup_mcp.bat` and invokes the `datax-web` MCP server from Trae, WorkBuddy, Qoder, DeepSeek Harness, OpenCode, Codex, Antigravity, or Cursor
- **THEN** `datax_mcp.py` reads the injected `DATAX_MCP_CLIENT` environment variable (or detects the parent process / host environment) and sends `X-Client-Source: <ToolName> (MCP)` and an enriched `User-Agent` header to the DataX-Web gateway

#### Scenario: Manually configured MCP script detects host AI tool via parent process or environment
- **WHEN** a user manually configures `mcp.json` without setting `DATAX_MCP_CLIENT` and starts `datax_mcp.py` inside an AI IDE
- **THEN** `datax_mcp.py` inspects host environment variables and parent process executable names to identify the AI tool, falling back to `MCP Client (Python)` if unrecognized

### Requirement: Gateway Client Source and Browser Normalization
The system SHALL parse incoming `X-Client-Source` and `User-Agent` headers on OpenAPI requests to normalize the caller into a human-readable `clientSource` label (e.g., `Trae (MCP)`, `WorkBuddy (MCP)`, `Chrome 130`, `Edge 129`, `Postman`, `Apifox`, `curl`, `Python 脚本`) and persist both `clientSource` and raw `userAgent` in `job_api_log`.

#### Scenario: Browser or API debugging tool invokes OpenAPI directly
- **WHEN** a client sends an OpenAPI request using Chrome, Edge, Firefox, Safari, Postman, Apifox, or curl without `X-Client-Source`
- **THEN** system parses the `User-Agent` header into a concise browser or tool name (e.g., `Chrome 130`, `Postman`) and stores both `client_source` and raw `user_agent` in `job_api_log`

#### Scenario: AI MCP client invokes OpenAPI with X-Client-Source header
- **WHEN** `datax_mcp.py` sends a request carrying `X-Client-Source: Trae (MCP)`
- **THEN** system sanitizes and records `Trae (MCP)` in `client_source` along with the raw `user_agent` in `job_api_log`

### Requirement: Client Source Filtering, Visual Tagging, and Export in Tab 8 Audit Logs
The system SHALL display the normalized `clientSource` tag in the Tab 8 audit log table and detail modal, support filtering logs by `clientSource` keyword, and include `clientSource` and `userAgent` in exported Excel/CSV reports.

#### Scenario: Filter audit logs by AI tool or browser keyword
- **WHEN** administrator enters a keyword (such as `Trae`, `WorkBuddy`, `Chrome`, or `Python`) in the "筛选终端/AI工具" input box and clicks search
- **THEN** system returns only audit log records whose `client_source` or `user_agent` matches the keyword
