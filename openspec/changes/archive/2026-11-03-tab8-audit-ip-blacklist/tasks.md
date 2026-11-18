# Tasks

## 1. 平台数据库基线与实体映射层 (`job_api_ip_blacklist`)

- [x] 1.1 在 `bin/db/datax_web_stat_task.sql` 末尾追加平台系统表 `job_api_ip_blacklist` 建表 SQL（含 `id`, `ip_address`, `app_key`, `reason`, `source_log_id`, `status`, `create_by`, `create_time`, `update_time` 及唯一索引 `uk_ip_appkey`），校验 SQL 语法符合 `utf8mb4` 与 `CREATE TABLE IF NOT EXISTS` 规范
- [x] 1.2 新建实体类 `JobApiIpBlacklist.java`（标注 `author: ypc`，`Date` 字段声明 `@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")`，包含非持久化展示字段 `accountName`），并验证字段与表结构一一对应
- [x] 1.3 新建 `JobApiIpBlacklistMapper.java` 与 `JobApiIpBlacklistMapper.xml`（遵循禁止同名抽象重载铁律），提供查询生效黑名单列表与按 `(ip_address, app_key)` 检索方法，验证 XML 映射无冲突

## 2. 黑名单核心服务与网关一票否决拦截 (`OpenApiSecurityInterceptor`)

- [x] 2.1 新建 `JobApiIpBlacklistService.java` 与 `JobApiIpBlacklistServiceImpl.java`，实现 JVM 内存级活跃黑名单缓存快照（支持精确 IP、通配符 `*`、CIDR 网段匹配及增删改后即时 `refreshCache()`），验证匹配逻辑对全局 `*` 与指定 `appKey` 均准确生效
- [x] 2.2 修改 `OpenApiSecurityInterceptor.java`，在网关鉴权前置阶段接入 `JobApiIpBlacklistService` 黑名单一票否决校验（优先于白名单 `allowed_ips`），命中时返回 HTTP 403 并通过限频保护异步写入 `job_api_log`（`status = 2` 安全拦截），验证黑名单 IP 请求被即时拦截且留有审计记录

## 3. 管理端黑名单与日志扩展接口 (`JobOpenAdminController`)

- [x] 3.1 在 `JobOpenAdminController.pageLogs` 接口新增可选参数 `clientIp`（支持模糊/精确检索），并在返回或辅助接口中支持获取当前生效黑名单 IP 集合，验证按客户端 IP 筛选日志结果准确
- [x] 3.2 在 `JobOpenAdminController` 新增黑名单管理接口（`/api/open/admin/blacklist/page`、`save`、`batchAddFromLogs`、`unblockByIp`、`toggleStatus`、`delete`、`activeList`），内置管理员权限校验与回环地址/当前管理员 IP 防误封校验，验证单条/批量从日志拉黑及解封接口幂等可用

## 4. Tab8 前端日志审计联动与黑名单管理界面 (`tab8_open_api.js`)

- [x] 4.1 在 `tab8_open_api.js` 顶部子选项卡栏新增第 3 个子标签页「IP 黑名单」，并在「调用日志审计」筛选栏新增「筛选客户端IP」输入框与「批量拉黑选中IP」按钮，验证界面布局与 Ant Design 配色及 Emoji 白名单规范一致
- [x] 4.2 升级「调用日志审计」表格与日志详情弹窗：首列增加多选复选框（支持全选、Shift 连续选与 `MarqueeSelector` 矩形框选），客户端 IP 列渲染「已拉黑」红底标签，操作列与详情弹窗提供「拉黑IP」/「解封IP」按钮，验证选中单条或多条日志可一键加入黑名单并实时更新标签
- [x] 4.3 实现拉黑确认弹窗与防误封护栏（识别 `127.0.0.1`、`localhost`、`::1` 弹出高危提示，支持选择「全局封禁所有账号」或「仅封禁该日志所属账号」并自动带出源日志原因），以及「IP 黑名单」子面板的列表检索、手动新增（`➕`）、编辑（`✏️`）、启停与删除（`🗑️`）闭环，验证所有 DOM 渲染均通过 `safeEscapeHtml` 转义
