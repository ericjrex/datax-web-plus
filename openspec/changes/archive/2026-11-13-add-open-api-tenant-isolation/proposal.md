# Proposal

## Why

一期实现的租户隔离模型仅支持在单个数据源上配置“单一租户开关 + 单一 `tenantColumn` + 手动维护 `tenantExemptTables` 豁免黑名单”，在实际多库多表数仓场景下局限性较大：
1. **字段名不统一**：不同库、甚至同一库的不同表可能使用不同的隔离字段（如 `tenant_id`、`corp_id`、`org_id`、`dept_id`、`area_code`），单一字段名无法适配。
2. **公私表混杂配置成本高**：许多数据源（尤其是数仓公共库或维度表较多的库）仅部分业务表包含隔离字段，若采用“全库强制 + 手动列举豁免表”，管理员需手工维护大量无租户字段的表名，极易漏配导致正常查询被拦截。
3. **非租户类通用行权限受限**：不少数据源并没有“租户”概念，但需要按部门（`dept_id`）、机构（`org_id`）或区域（`area_code`）等业务字段做组合行级数据范围控制。

因此，需要将“库级单租户字段隔离”升级为**基于字段规则的通用行级数据过滤控制（Field-Level Row Filter Rules）**，在保持 `=` / `IN` 等值安全拦截与 Fail-Closed 底线的前提下，支持多字段规则配置与按表物理字段自动匹配过滤。

## What Changes

- **数据源级多字段行级过滤规则模型（`rowFilterRules`）**：
  - 扩展 `OpenApiPermissionUtil.DatabaseAuth`（仍存储在 `job_api_account.permissions` JSON 中，零 DDL 变更），新增 `List<RowFilterRule> rowFilterRules`，允许每个数据源配置 `0..N` 条字段过滤规则；未配置规则的数据源不启用行级改写。
  - 每条规则包含：`column`（任意合法 SQL 字段名，如 `tenant_id`、`dept_id`、`org_id`）、`values`（服务端绑定的允许值列表，仅支持 `=` / `IN` 等值过滤，暂不引入 `LIKE` 或不等于判断）、`matchMode`（`AUTO_BY_COLUMN` 按表物理字段自动匹配过滤 / `STRICT_TABLES` 指定表强制过滤）、`tables`（`STRICT_TABLES` 模式指定的目标表）与 `excludeTables`（`AUTO_BY_COLUMN` 模式可选排除表）。
  - **完全向下兼容**：保留旧版 `tenantIsolationEnabled` / `tenantColumn` / `tenantValues` / `tenantExemptTables` 字段反序列化支持，并在标准化时自动映射为等效规则。
- **元数据驱动的自动过滤与 Fail-Closed 安全底线**：
  - 在 `AUTO_BY_COLUMN` 模式下，系统基于缓存的表结构元数据自动判断SQL涉及的每张物理表是否包含规则字段：包含（且不在 `excludeTables` 中）则自动注入过滤条件，不包含则自动跳过，无需手填大量公共豁免表。
  - **Fail-Closed 安全底线不降级**：若获取表字段元数据失败或返回空列集合，一律安全拦截（`SecurityException`），绝不因查表结构失败而静默跳过；`STRICT_TABLES` 模式下若指定表缺少规则字段，同样直接拦截报错；只要数据源启用了任意行级过滤规则，跨库前缀（如 `other_db.table`）一律禁止。
- **AST 多规则组合注入（`AND` 叠加）**：
  - 升级 `OpenApiSqlTenantRewriter`，由“单字段策略改写”升级为“按物理表动态匹配多条 `RowFilterRule` 并以 `AND` 叠加注入”，继续完整保留 `OR` 括号保护、`LEFT/RIGHT JOIN` 外连接语义、子查询、`UNION`、`WITH` CTE 虚拟表跳过以及 `NATURAL JOIN`/`USING`/`FULL JOIN` 阻断能力。
- **元数据提示与管理端字段命中预览**：
  - `GET /api/open/v1/metadata/tables` 返回授权表信息时，补充 `rowIsolated` 与该表实际命中的过滤字段列表（如 `filterColumns`），同时保留兼容字段 `tenantIsolated`；
  - `JobOpenAdminController` 提供表字段规则命中预览能力，使 Tab 8 账号编辑弹窗在配置字段规则后，能直接在表清单旁标注每张表命中的规则字段或“无匹配规则-全行可见”，避免因字段名拼写差异导致漏防。
- **Tab 8 管理控制台 UI 升级**：
  - 将 `tab8_open_api.js` 中单个“租户行级隔离配置条”升级为“行级字段过滤规则”多规则列表编辑器（支持增删规则、配置字段名/值/匹配模式、可选指定表或排除表、字段命中预览标签），并更新账号列表摘要展示。

## Capabilities

### New Capabilities
- `open-api-tenant-isolation`: 提供开放 API 数据源级多字段行级过滤规则模型、按表物理字段自动匹配与严格指定模式、JSqlParser AST 多规则递归 `AND` 注入、跨库前缀阻断及 Fail-Closed 元数据校验能力。

### Modified Capabilities
- `warehouse-open-api`: 扩展 `POST /api/open/v1/sql/execute` 与 `GET /api/open/v1/metadata/tables` 行为，在库表白名单校验后强制应用数据源绑定的多字段行级过滤 AST 改写、元数据安全校验与表级过滤字段披露。
- `open-api-manage-ui`: 扩展 Tab 8 API 账号新增/编辑弹窗与账号列表展示，支持按数据源管理多条字段行级过滤规则、预览表字段命中状态及查看过滤规则摘要。

## Impact

- **后端核心代码**：
  - `datax-admin/src/main/java/com/wugui/datax/admin/util/OpenApiPermissionUtil.java`（新增 `RowFilterRule`、`matchMode`、规则校验与旧字段兼容转换）
  - `datax-admin/src/main/java/com/wugui/datax/admin/util/OpenApiSqlTenantRewriter.java`（支持按表解析命中的多条字段规则并 `AND` 拼接注入）
  - `datax-admin/src/main/java/com/wugui/datax/admin/controller/JobOpenApiController.java`（基于表字段集合匹配规则、Fail-Closed 元数据校验、多规则改写与元数据披露）
  - `datax-admin/src/main/java/com/wugui/datax/admin/controller/JobOpenAdminController.java`（校验 `rowFilterRules` 合法性，并提供表字段规则命中预览接口）
- **前端管理界面**：
  - `datax-admin/src/main/resources/static/static/js/assistant/tabs/tab8_open_api.js`（多字段规则配置 UI、表清单命中标签预览、列表摘要展示）
- **数据库与兼容**：
  - 复用 `job_api_account.permissions` JSON 字段（零 DDL 变更），完全向下兼容历史单租户字段配置与未开启隔离的账号。
- **测试**：
  - 更新并扩展 `OpenApiSecurityTest.java`，覆盖多字段规则 `AND` 叠加、同库不同表不同字段、无该字段表自动跳过、严格指定表缺列拦截、旧版配置兼容及现有 AST 边界用例。
