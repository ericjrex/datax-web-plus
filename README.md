# DataX-Web-Plus 🚀

<p align="center">
  <a href="https://github.com/ericjrex/datax-web-plus">
    <img src="https://img.shields.io/badge/Release-v2.1.3--plus-blue.svg" alt="Release" />
  </a>
  <a href="https://github.com/WeiYe-Jing/datax-web">
    <img src="https://img.shields.io/badge/Upstream-DataX--Web-green.svg" alt="Upstream" />
  </a>
  <img src="https://img.shields.io/badge/JDK-1.8%2B-orange.svg" alt="JDK" />
  <img src="https://img.shields.io/badge/Spring%20Boot-2.1.x-brightgreen.svg" alt="Spring Boot" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" />
</p>

> **基于 DataX-Web 深度二次开发的企业级数仓集成、元数据自适应演进与安全开放网关平台**  
> *An enhanced enterprise-grade DataX-Web platform featuring warehouse integration, schema drift auto-evolution, secure OpenAPI gateway, and AI-driven automation.*

---

## 📖 项目简介 / Introduction

**DataX-Web-Plus** 是在开源项目 [DataX-Web](https://github.com/WeiYe-Jing/datax-web) 基础之上进行的深度企业级增强与二次开发。

原版 DataX-Web 提供了开箱即用的 DataX 可视化全流程任务配置与调度能力。而在复杂的企业数仓集成与数据中台演化场景中，往往面临**表结构漂移失控、外部系统/AI 工具取数安全无保障、多租户行级数据隔离缺失、以及大批量任务运维低效**等痛点。

本项目针对上述实际痛点，在保持原调度内核稳定的前提下，深度研发了：
1. **Schema 漂移自适应演进引擎**（8 库对比、DDL 批量评审、字段注释演进）；
2. **通用接口数据采集引擎**（前置 JavaScript 签名预处理、分页动态驱动、时间水印增量采集）；
3. **数仓 OpenAPI 安全网关与 MCP 协议支持**（HMAC-SHA256 签名、SQL AST 语法树解析、高危写拦截、AI 工具一键接入）；
4. **企业级动态 RBAC 与行级租户隔离**（多角色字典、动态菜单权限、数据源级多字段行级过滤）；
5. **DataX 智能助手与批量运维套件**（批量改库、并发跨库对账核验、历史调度追踪）。

---

## 🌟 核心特性 / Key Features

### 1. 🔄 Schema 漂移检测与自适应演进 (Schema Drift Auto-Evolution)
- **多库三方 Schema 比对**：支持 MySQL、ClickHouse、Oracle、PostgreSQL、Doris、Hive、SQL Server 等 8 种主流数据库字段元数据实时探查。
- **字段类型跨库智能映射与 DDL 推导**：内置 DataTypeConverter 智能转换器，根据源库表自动推导并生成目标库 CREATE TABLE / ALTER TABLE 语句。
- **字段注释自动演进与批量评审**：自动提取源端与字典备注演进，提供批量 DDL 手动/自动评审工单，防止生产同步任务因上游改表而中断。

<p align="center">
  <img src="doc/images/01_schema_drift.png" alt="Schema 漂移探测与自适应演进看板" width="95%" />
</p>

### 2. 🌐 通用接口数据采集引擎 (HTTP/API Data Collector)
- **可视化 HTTP 协议与前置脚本**：支持 GET/POST 请求及动态 Header/Body 组装，内置 JavaScript 前置脚本沙箱（Pre-request Script），可在线实时执行出组平台 HMAC 签名、MD5 签名及动态参数追加。
- **动态参数切片与多模式分页驱动**：支持驱动参数 SQL 查源切片（如车辆清单、租户分组），结合 PageNum/PageSize、起始游标与期望业务状态码进行全自动深度翻页采集。
- **时间水印与字段自动映射入仓**：支持根据采集数据的最新时间字段（如 dtTime）自动推进增量水印，支持一键同名匹配或手动映射至目标库表（MySQL / ClickHouse / Doris 等），支持 UPSERT 主键去重更新。

<p align="center">
  <img src="doc/images/04_api_collector.png" alt="接口数据采集任务配置与前置签名脚本" width="95%" />
</p>

### 3. 🛡️ 数仓 OpenAPI 安全网关与 MCP 协议生态 (OpenAPI Gateway & MCP)
- **金融级鉴权验签与防重放**：支持标准 HMAC-SHA256 签名校验（AK/SK 机制），结合 Nonce 随机数缓存实现高效防重放攻击。
- **Druid SQL AST 语法树深度解析与安全审计**：
  - 基于 Druid SQL AST 语法树逐层解析，强制提取物理表清单并比对权限白名单；
  - 刚性拦截写指令（DROP / TRUNCATE / UPDATE / DELETE）及高危探测函数（SLEEP / BENCHMARK / 元数据跨库探测）。
- **细粒度库表授权与 IP 黑名单管控**：支持单账号多库多表白名单配置（JSON 策略）、动态限流 QPS，并支持在调用日志中一键拉黑异常客户端 IP。
- **一键配置全平台通用 MCP 协议**：内置跨平台自动化配置向导（`setup_mcp.bat`），支持 Trae、Cursor、DeepSeek、Qoder、WorkBuddy、OpenCode 等 AI Agent 直接安全免密调用数仓数据。

<p align="center">
  <img src="doc/images/06_mcp_config.png" alt="通用 MCP 协议接入与 AI 工具自动化配置" width="85%" />
</p>

### 4. 👥 动态角色权限与租户级行级隔离 (Dynamic RBAC & Tenant Isolation)
- **系统角色字典动态管理**：扩展 job_role 元数据，支持自定义角色（如开发员、审计员、业务分析师）及动态权限分配。
- **跨账号权限同步与多表勾选查看**：前端管理界面支持一键跨账号复制权限策略，支持海量表的拼音/名称搜索与全选。
- **数据源级多字段行级过滤**：在数据接入端支持根据租户、地区、机构等多维度进行行级 SQL 拼接隔离，保障多租户数据安全。

### 5. 🤖 DataX 智能助手与批量运维套件 (Assistant & Batch Operations)
- **无侵入智能助手面板**：前端内置原生 DOM 构造的高质感侧边助手，无需重构主工程即可快速扩展 Tab 视图。
- **批量任务迁移与改库调度**：支持通过正则或字符串替换批量修改数百个任务的 Reader/Writer 连接串，支持任务批量复制与参数热插拔。
- **并发批量对账与数据量核对**：内置统计计算任务引擎（StatTaskEngine），上百个任务秒级并发比对源库与目标库的数据吞吐与日增量差异。
- **数据同步策略灵活回溯**：发现对账差异后，可一键选择全量同步（重置 1970 彻底消除差异）、向前回溯时间同步或常规增量重跑。

<p align="center">
  <img src="doc/images/02_data_compare.png" alt="源库与目标库数据量批量比对看板" width="95%" />
</p>

<p align="center">
  <img src="doc/images/03_sync_strategy.png" alt="数据同步策略选择与回溯" width="75%" />
</p>

<p align="center">
  <img src="doc/images/05_task_history.png" alt="任务执行历史记录与写入结果明细" width="95%" />
</p>


---

## 🏗️ 架构拓扑 / Architecture

```mermaid
flowchart TD
    subgraph 客户端与接入层
        WebUser[Web 浏览器 / 管理员]
        AIClient[AI 工具 / Agent / Cursor / Trae]
        ThirdParty[三方业务系统 / 微服务]
    end

    subgraph 网关与安全防护层
        Nginx[Nginx 负载均衡与反向代理: 9095]
        OpenApiSec[OpenAPI 安全拦截器<br/>HMAC 签名 / 防重放 / IP 黑名单]
        ASTParser[Druid SQL AST 语法树解析器<br/>物理表白名单匹配 / 高危拦截]
    end

    subgraph 核心服务调度层
        Admin[DataX-Admin 调度管理中心<br/>• 动态 RBAC 权限体系<br/>• Schema 漂移比对引擎<br/>• 智能助手与批量任务运维]
        Executor[DataX-Executor 任务执行器<br/>• 任务状态心跳与日志上报]
        MetaDB[(MySQL 业务元数据库<br/>datax_web)]
    end

    subgraph 数据同步与数仓层
        Engine[DataX 同步引擎 / Python]
        Sources[(异构源端数据源<br/>MySQL / Oracle / PG)]
        Targets[(目标数仓与大数据分析引擎<br/>ClickHouse / Doris / Hive)]
    end

    WebUser -->|HTTP 页面访问| Nginx
    ThirdParty & AIClient -->|API 鉴权调用| OpenApiSec
    OpenApiSec --> ASTParser --> Admin
    Nginx --> Admin

    Admin <-->|9999 RPC| Executor
    Admin <-->|读写调度元数据| MetaDB
    Executor -->|调度启动| Engine
    Engine -->|数据抽取与写入| Sources & Targets
```

---

## 📂 项目结构 / Project Structure

```text
datax-web-plus/
├── bin/                        # 运维、自动化部署与数据库初始化脚本
│   ├── db/                     # 核心数据库脚本 (datax_web.sql, datax_web_stat_task.sql)
│   ├── python/                 # OpenAPI 客户端 Demo 与 MCP 协议支持
│   └── install.sh              # 一键部署与环境自检脚本
├── datax-admin/                # 调度管理核心模块 (Spring Boot)
│   ├── src/main/java/          # 核心控制器、服务层、OpenAPI 安全网关、AST 解析器
│   └── src/main/resources/     # 配置文件、MyBatis Mapper、前端管理静态页面
├── datax-core/                 # 核心公共组件与加解密抽象
├── datax-executor/             # 调度执行器客户端模块
├── datax-rpc/                  # 内部轻量级 RPC 通信框架
└── doc/                        # 技术规范与详细文档
    ├── datax-web/              # 部署手册 (deploy-guide.md) 与系统配置说明
    └── openspec/               # 各特性模块的设计规范与演化提案
```

---

## 🚀 快速上手 / Quick Start

### 1. 环境准备
- **Java**: JDK 1.8+
- **Python**: Python 2.7 或 Python 3.x（用于运行 DataX 引擎）
- **Maven**: 3.3+
- **MySQL**: 5.7+ / 8.0+

### 2. 初始化数据库
在 MySQL 中执行初始化脚本：
```bash
mysql -u root -p < bin/db/datax_web.sql
mysql -u root -p < bin/db/datax_web_stat_task.sql
```

### 3. 配置数据库连接
修改 datax-admin/src/main/resources/bootstrap.properties 中的数据库配置（支持通过系统环境变量覆盖）：
```properties
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=datax_web
```

### 4. 编译与打包
```bash
mvn clean package -DskipTests
```

### 5. 详细部署与生产运维手册
关于 Nginx 反向代理配置、启停脚本、跨环境迁移与发版运维，请参阅：  
👉 **[生产部署与运维完整指南 (doc/datax-web/deploy-guide.md)](doc/datax-web/deploy-guide.md)**

---

## 🔒 安全说明 / Security Notice

1. **凭证脱敏**：本项目开源代码已剥离所有生产环境密码与外网 IP 凭据。生产环境建议通过操作系统环境变量（如 DB_PASSWORD）或配置中心注入密码。
2. **OpenAPI 规范**：外部系统调用时，请在管理后台 Tab8（三方开放 API 管理）分配专用的 AppKey 与 AppSecret，严禁在公网透传明文私钥。

---

## 🤝 鸣谢 / Acknowledgements

- 感谢阿里巴巴开源的高效数据同步引擎 [Alibaba DataX](https://github.com/alibaba/DataX)。
- 感谢 [WeiYe-Jing/datax-web](https://github.com/WeiYe-Jing/datax-web) 提供的开箱即用可视化调度基线。
- 感谢 [LINUX DO](https://linux.do/) 社区对本项目开源推广的支持与认可。

---

## 📄 开源许可 / License

本项目遵循 [Apache-2.0 License](LICENSE) 开源协议。