# AI Agent 开发规范约束（智能助手与全栈功能专规）

本文档为所有在此代码库工作的 AI 助手（包括 Antigravity、Gemini 等 Agent）必须严格遵守的刚性规范。严禁任何 AI 异想天开或乱加规则。

---

## 1. 文案与反馈口吻红线（严禁生造概念，必须“说人话”）
- **拒绝流计算行话**：严禁出现“水位线推进”、“拉取 X 行”、“流吞吐”等晦涩生硬词汇。
- **与 DataX Web 原生术语严格对齐**：
  - 计数量词：一律用 **“条”**（如 `读取 2 条，写入 2 条`），严禁用“行/Rows”。
  - 增量提示：一律用 **“下次增量时间: yyyy-MM-dd HH:mm:ss”** 或 **“增量时间已更新至: ...”**。
  - 成功反馈：`🎉 任务执行成功：读取 {M} 条，写入目标表 [{tableName}] {N} 条，耗时 {time}（下次增量时间: {nextTime}）`。
  - 失败反馈：`任务执行失败 (耗时 {time}): {errorMessage}`。
  - 弹窗避免套娃重复：直接弹出单行总结，避免“🎉 执行成功！\n任务执行成功：...”。

---

## 2. 日期与时间处理铁律
- **实体反序列化注解必加**：所有实体/DTO 包含的 `Date` 字段必须显式标注：
  `@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")`。
- **GET 请求防空格吞噬**：
  - 客户端发起 URL 传参时未编码的空格必须替换为 `%20`。
  - 服务端 Controller 日期解析必须增加容错，若遇到 `yyyy-MM-ddHH:mm:ss`（18位粘连串），需自动在第 10 位补齐空格后解析。

---

## 3. 增量过滤与命名规范
- **配置数据本身增量过滤**：如查询任务配置表 `/api/job/pageList`，**必须且只能以 `update_time` 物理更新时间为准**，入参同时兼容 `updateTime` 与 `update_time`。
- 严禁将任务自身数据同步增量的 `incStartTime` 混淆为配置表本身的增量字段。

---

## 4. MyBatis 映射器避坑规范
- **严禁在 Mapper 接口中声明同名重载的抽象方法**！MyBatis XML 依赖方法名作为 Statement ID，同名会导致加载冲突抛错。
- 如需保留历史签名实现向下兼容，必须声明为 Java 8 的 `default` 接口方法。

---

## 5. 前端规范与安全防御
- **原生 Vanilla JS 体系**：所有页签按 `tabs/tab{N}_{name}.js` 划分，复用公共组件（`components/`）与核心通信（`core/`）。
- **统一配色**：采用 Ant Design 规范调色盘（成功 `#52c41a`、失败 `#f5222d`、主色 `#1890ff`、警示 `#fa8c16`）。
- **强制 XSS 防御**：任何从后端返回的内容写入 DOM 必须先经 `safeEscapeHtml` 转义。
- **界面图标与 Emoji 白名单红线**：
  - 智能助手所有列表操作按钮（Table row actions / Toolbars）以及弹窗标题栏、弹窗内部按钮中，**严禁随意添加或保留未授权的 Emoji 图标**。
  - **白名单机制（仅允许保留以下 5 类特定业务图标）**：
    1. 助手的火箭（`🚀`）：如助手主启动悬浮球、任务执行/批量执行按钮；
    2. 查询放大镜（`🔍`）：如列表查询按钮、搜索框占位符、详情查看按钮；
    3. 新增（`➕`）：如新建任务、添加字段映射行等新增按钮；
    4. 修改/编辑（`✏️`）：如编辑任务配置按钮；
    5. 删除（`🗑️`）：如删除任务、批量删除按钮。
  - 除上述白名单外，列表操作按钮（如 `历史`、`启动`、`停止`、`刷新`、`导入`、`导出` 等）以及弹窗标题一律禁止使用 Emoji 图标，保持 Ant Design 专业质感。

---

## 6. 十大不可逾越的红线
1. 严禁格式化已有旧代码；
2. 严禁删除已有的 class 或 target 编译文件（防止热运行报错）；
3. 严禁在修改行或方法上乱写作者，仅全新建文件才允许标注 `author: ypc`；
4. 严禁使用全类名，必须规范 import 包；
5. 凡有表结构变更、新增字段、字典或菜单，必须区分平台系统与用户业务：平台系统变更必须追加到 `bin/db/datax_web_stat_task.sql` 末尾作为基线，用户业务变更存放在业务独立 SQL 文件中；
6. 重复代码超过 2 处必须抽取公共辅助方法；
7. 代码需符合 Google 编程规范，自带详细中文注释；
8. OAsystem 无需执行 mvn 相关操作；
9. 必须使用中文回答与汇报；
10. 详细规范完整版请查阅：[assistant_development_spec.md](file:///d:/code/not_itc/datax-web-other/doc/datax-web/assistant_development_spec.md)。

---

## 7. AI 生成 SQL 分类与基线归档规范（铁律）
AI 在编写、生成或调整任何 SQL 脚本时，**必须严格区分“平台系统 SQL”与“用户业务 SQL”**：

### 1) 平台系统 SQL（Platform System SQL）
- **定义范围**：
  - 支撑 DataX-Web 自身平台能力、调度任务扩展（如 Tab 6 结果表计算、Tab 7 接口采集）；
  - 智能助手各个 Tab 的内部配置元数据（如偏好设置 `job_user_setting`、对账差异日志 `job_data_diff_log`、元数据漂移审计 `job_schema_drift_log`）；
  - 平台账号体系、权限表、系统菜单与数据字典等。
- **归档规则（强制）**：
  - **必须无条件追加追加到 `bin/db/datax_web_stat_task.sql` 末尾**！
  - 必须包含标准注释说明：注明变更日期、功能说明、字段用途；
  - DDL 必须使用 `CREATE TABLE IF NOT EXISTS`，字符集统一为 `utf8mb4`；
  - 若为字段变更（`ADD COLUMN` / `MODIFY COLUMN`），除全量建表语句更新外，必须在末尾附带供存量环境执行的兼容 `ALTER TABLE` 语句。

### 2) 用户业务 SQL（User Business SQL）
- **定义范围**：
  - 用户面向具体业务场景的数仓建模（如驾培 `jiapei_school_supervise_dw_tables.sql`、北斗车辆 `ods_beidou_*`、`dws_oasystem_*`）；
  - 具体的业务清洗转换、指标计算、业务报表对账查询等。
- **归档规则（强制）**：
  - **严禁写入或混入 `datax_web_stat_task.sql`**，防止污染平台底层系统底座；
  - 必须独立归档到 `bin/db/{业务模块名}.sql` 或存放在对应业务文档（如 `bin/other/{业务方案}.md`）中。
