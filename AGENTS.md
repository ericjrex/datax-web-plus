# Antigravity & AI Agent 工作区指导规范 (AGENTS.md)

欢迎在此工程中协助进行代码编写与架构迭代。为了确保本仓库架构稳定、代码风格与 DataX-Web 原生体系深度统一，**请在处理任何开发与重构任务前严格遵循以下强制规范**：

1. **核心开发规范文档**：
   - 工作区核心规则集：[.agents/rules/assistant_development_rules.md](file:///d:/code/not_itc/datax-web/.agents/rules/assistant_development_rules.md)
   - 详细规范手册请查阅：[assistant_development_spec.md](file:///d:/code/not_itc/datax-web-other/doc/datax-web/assistant_development_spec.md)

2. **必须遵守的关键铁律**：
   - **说人话、对齐 DataX 风格**：严禁用“水位线推进”、“拉取X行”等生造词，计数量词统一用“条”，一律使用“读取 X 条，写入目标表 [xxx] Y 条，耗时 Z，下次增量时间: ...”；
   - **时间与日期**：所有包含 `Date` 的 DTO 与实体必须声明 `@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")`，URL GET 请求未编码空格需转 `%20`，Controller 需容错解析；
   - **增量查询以物理时间为准**：配置数据查询增量一律使用 `update_time` 过滤，接口同时兼容驼峰与下划线；
   - **禁止 MyBatis 同名抽象重载**：避免 Statement ID 冲突，兼容旧签名请用 Java 8 `default` 接口方法；
   - **前端规范与安全**：统一采用 Ant Design 规范调色盘，动态 DOM 渲染强制 `safeEscapeHtml` 转义 XSS，重复代码抽公共方法；
   - **界面图标与 Emoji 白名单规范**：严禁在智能助手所有列表按钮和弹窗标题/按钮中随意使用 Emoji 图标。**仅允许保留以下 5 类业务图标**：助手的火箭（🚀）、查询放大镜（🔍）、新增（➕）、修改/编辑（✏️）、删除（🗑️）。其余按钮（如历史、启动、停止、刷新、导出等）及弹窗标题一律使用纯文本，保持界面严谨纯洁；
   - **不格式化旧代码，不删除 class/target 编译文件**；
   - **严禁执行 mvn 相关编译或打包操作**；
   - **AI 生成 SQL 归档规范（严格区分平台系统与用户业务）**：
     1. **平台系统 SQL**：凡涉及支撑 DataX-Web 平台系统运行、智能助手功能、系统表/字段扩展、用户偏好配置（如 `job_user_setting`）、任务审计表等系统元数据变更，**必须无条件追加到 `bin/db/datax_web_stat_task.sql` 末尾**作为系统演进基线；
     2. **用户业务 SQL**：凡是数仓业务建模、业务报表统计、业务数据清洗等用户业务层面的 SQL（如驾培、北斗车载等），**严禁混入平台基线**，一律独立存放在 `bin/db/{业务模块}.sql` 或业务文档中；
   - **新建文件才标 `author: ypc`，行内/修改方法不要写作者**；
   - **全流程直奔主题讲大白话，提供架构图与安全性审计**。
