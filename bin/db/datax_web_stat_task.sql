-- -------------------------------------------------------------
-- DataX-Web 统计计算任务管理模块增量 SQL 脚本
-- Author: ypc
-- -------------------------------------------------------------

SET NAMES utf8mb4;

-- ----------------------------
-- 1. 创建统计计算任务配置表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `job_stat_task` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `task_name` varchar(128) NOT NULL COMMENT '统计任务名称',
  `task_type` varchar(32) NOT NULL DEFAULT 'SQL' COMMENT '任务类型: SQL / PYTHON',
  `job_id` int(11) NULL DEFAULT NULL COMMENT '关联的 xxl-job (job_info) 调度ID',
  `cron_expression` varchar(128) NULL DEFAULT NULL COMMENT '定时调度CRON表达式',
  `status` tinyint(4) NOT NULL DEFAULT 0 COMMENT '调度状态: 0-停止, 1-运行',
  
  -- 计算源端配置
  `source_datasource_id` bigint(20) NULL DEFAULT NULL COMMENT '源端数据源ID (单库SQL模式必填)',
  `source_sql` mediumtext NULL COMMENT '统计查询SQL语句 (SQL模式生效)',
  `is_cross_db` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否开启跨库多源查询: 0-单库模式, 1-跨库多源模式',
  `cross_db_config_json` mediumtext NULL COMMENT '跨库多源配置JSON (包含多数据源节点列表、合并策略 UNION_ALL / KEY_JOIN / FEDERATED_SQL 等)',
  `python_script` mediumtext NULL COMMENT 'Python计算脚本源码 (PYTHON模式生效)',
  `python_params` varchar(1000) NULL DEFAULT NULL COMMENT 'Python脚本动态参数 (JSON格式)',
  
  -- 目标端写入配置 (可选库、选表输出)
  `target_datasource_id` bigint(20) NOT NULL COMMENT '目标端数据源ID (可选库)',
  `target_table_name` varchar(128) NOT NULL COMMENT '目标端数据表名 (选表输出)',
  `auto_create_table` tinyint(1) NOT NULL DEFAULT 0 COMMENT '目标表不存在时是否自动建表: 0-否, 1-是',
  `write_mode` varchar(32) NOT NULL DEFAULT 'APPEND' COMMENT '写入模式: APPEND(追加), OVERWRITE(覆盖), UPSERT(更新插入), NONE(仅脚本内自更新/跳过入库)',
  `column_mapping_json` text NULL COMMENT '字段映射关系配置JSON ([{"sourceCol":"col1","targetCol":"col1","dataType":"VARCHAR"}])',
  `batch_size` int(11) NOT NULL DEFAULT 1000 COMMENT '批量写入BatchSize',
  `timeout_seconds` int(11) NOT NULL DEFAULT 3600 COMMENT '执行超时时间(秒)',
  `alarm_email` varchar(255) NULL DEFAULT NULL COMMENT '失败报警邮箱',
  `executor_block_strategy` varchar(32) NOT NULL DEFAULT 'DISCARD_LATER' COMMENT '阻塞处理策略: SERIAL_EXECUTION(单机串行), DISCARD_LATER(丢弃后续调度), COVER_EARLY(覆盖之前调度), CONCURRENT(允许并行)',
  
  -- 最近执行状态快照
  `last_run_time` datetime(0) NULL DEFAULT NULL COMMENT '最近一次触发时间',
  `last_run_status` tinyint(4) NOT NULL DEFAULT 0 COMMENT '最近执行状态: 0-未运行, 1-成功, 2-失败',
  `last_run_msg` varchar(2000) NULL DEFAULT NULL COMMENT '最近执行摘要/行数/耗时',
  
  -- 审计字段
  `comments` varchar(500) NULL DEFAULT NULL COMMENT '备注描述',
  `create_by` varchar(50) NULL DEFAULT 'admin' COMMENT '创建人',
  `create_time` datetime(0) NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_by` varchar(50) NULL DEFAULT 'admin' COMMENT '更新人',
  `update_time` datetime(0) NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP(0) COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_job_id`(`job_id`) USING BTREE,
  INDEX `idx_target_ds`(`target_datasource_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '数据统计计算与定时输出任务表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- 2. 菜单与权限配置 (注册至系统权限表)
-- ----------------------------
INSERT INTO `job_permission` (`name`, `description`, `url`, `pid`) 
SELECT '数据加工与结果表输出', '多源关联SQL与Python计算，定时输出至最终目标表', '/job/statTask', 0 
WHERE NOT EXISTS (SELECT 1 FROM `job_permission` WHERE `url` = '/job/statTask');

-- -------------------------------------------------------------
-- 3. 已有表增量升级脚本: 跨库多源查询字段扩展
-- -------------------------------------------------------------
-- 如果您的系统此前已执行过旧版建表脚本，请执行以下增量 ALTER 语句：
ALTER TABLE `job_stat_task` 
  ADD COLUMN `is_cross_db` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否开启跨库多源查询: 0-单库模式, 1-跨库多源模式' AFTER `source_sql`,
  ADD COLUMN  `cross_db_config_json` mediumtext NULL COMMENT '跨库多源配置JSON (包含多数据源节点列表、合并策略 UNION_ALL / KEY_JOIN / FEDERATED_SQL 等)' AFTER `is_cross_db`;

-- -------------------------------------------------------------
-- 4. 已有系统菜单文案规范化升级: 「统计计算任务」->「数据加工与结果表输出」
-- -------------------------------------------------------------
UPDATE `job_permission` 
SET `name` = '数据加工与结果表输出', 
    `description` = '数据加工与结果表输出' 
WHERE `url` = '/job/statTask';

-- -------------------------------------------------------------
-- 5. 任务检索性能索引优化 (数据源与目标表名联合快速筛选)
-- -------------------------------------------------------------
-- 如有需要可对源端数据源及目标表名增加索引以加速模糊检索：
-- ALTER TABLE `job_stat_task` ADD INDEX `idx_source_ds`(`source_datasource_id`);
-- ALTER TABLE `job_stat_task` ADD INDEX `idx_target_table`(`target_table_name`);

-- -------------------------------------------------------------
-- 6. 已有表增量升级脚本: 统计任务阻塞处理策略可配置支持
-- -------------------------------------------------------------
ALTER TABLE `job_stat_task` 
  ADD COLUMN `executor_block_strategy` varchar(32) NOT NULL DEFAULT 'DISCARD_LATER' COMMENT '阻塞处理策略: SERIAL_EXECUTION(单机串行), DISCARD_LATER(丢弃后续调度), COVER_EARLY(覆盖之前调度), CONCURRENT(允许并行)' AFTER `alarm_email`;


-- -------------------------------------------------------------
-- DataX-Web 增强特性增量 SQL 脚本：表映射模板、数据对账与元数据漂移审计
-- Author: ypc
-- -------------------------------------------------------------

SET NAMES utf8mb4;

-- ----------------------------
-- 1. 数据集成表与字段映射模板配置表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `job_table_mapping_template` (
                                                            `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `template_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '映射模板名称',
    `reader_datasource_id` bigint(20) NOT NULL COMMENT '源端数据源ID',
    `writer_datasource_id` bigint(20) NOT NULL COMMENT '目标端数据源ID',
    `naming_rule_json` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '批量表命名规则JSON配置',
    `mapping_detail_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '表与字段映射明细JSON配置',
    `comments` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '备注描述',
    `create_by` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT 'admin' COMMENT '创建人',
    `create_time` datetime(0) NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime(0) NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP(0) COMMENT '更新时间',
    PRIMARY KEY (`id`) USING BTREE,
    INDEX `idx_reader_ds`(`reader_datasource_id`) USING BTREE,
    INDEX `idx_writer_ds`(`writer_datasource_id`) USING BTREE
    ) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '数据集成表与字段映射模板配置表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- 2. 任务数据量比对与对账日志明细表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `job_data_compare_log` (
                                                      `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `batch_no` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '对账批次号',
    `job_id` int(11) NOT NULL COMMENT '任务ID',
    `job_desc` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '任务描述',
    `reader_datasource_id` bigint(20) DEFAULT NULL COMMENT '源库数据源ID',
    `reader_table` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '源库表名',
    `writer_datasource_id` bigint(20) DEFAULT NULL COMMENT '目标库数据源ID',
    `writer_table` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '目标库表名',
    `source_count` bigint(20) DEFAULT -1 COMMENT '源库记录数(-1表示查询失败或超时)',
    `target_count` bigint(20) DEFAULT -1 COMMENT '目标库记录数(-1表示查询失败或超时)',
    `diff_count` bigint(20) DEFAULT 0 COMMENT '差异记录数(源 - 目标)',
    `status` int(11) NOT NULL DEFAULT 1 COMMENT '比对状态: 1-一致, 2-不一致, 3-超时, 4-异常',
    `status_msg` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '状态描述或异常信息',
    `cost_time` bigint(20) DEFAULT 0 COMMENT '比对耗时(毫秒)',
    `create_time` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '比对时间',
    `create_by` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '操作人',
    PRIMARY KEY (`id`) USING BTREE,
    INDEX `idx_batch_no`(`batch_no`) USING BTREE,
    INDEX `idx_job_id`(`job_id`) USING BTREE,
    INDEX `idx_create_time`(`create_time`) USING BTREE
    ) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '任务数据量比对与对账日志明细表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- 3. DataX 任务元数据漂移与模式演进审计日志表
-- ----------------------------
CREATE TABLE IF NOT EXISTS `job_schema_drift_log` (
                                                      `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `batch_no` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '探测或演进批次号',
    `job_id` int(11) NOT NULL COMMENT '任务ID(对应 job_info.id)',
    `job_desc` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '任务描述',
    `reader_datasource_id` bigint(20) DEFAULT NULL COMMENT '源端数据源ID',
    `reader_table` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '源端表名',
    `writer_datasource_id` bigint(20) DEFAULT NULL COMMENT '目标端数据源ID',
    `writer_table` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '目标端表名(OBS外部表等)',
    `drift_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '漂移类型: NONE(无变动), ADD_COLUMN(新增列), DROP_COLUMN(删除列), MODIFY_COLUMN(类型变动), MIXED(混合变动)',
    `drift_detail_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '差异明细JSON(新增列、删除列、类型变动等)',
    `before_job_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '演进前的Job JSON快照(用于版本回滚)',
    `after_job_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '演进后的Job JSON快照',
    `target_ddl` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '在目标端(OBS/Hive等)执行的演进DDL语句',
    `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'DETECTED' COMMENT '状态: DETECTED(已探测到差异), AUTO_APPLIED(已自动演进), MANUAL_APPLIED(已手动演进), ROLLED_BACK(已回滚), FAILED(失败)',
    `status_msg` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '状态描述或异常信息',
    `create_time` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '检测时间',
    `update_time` datetime(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP(0) COMMENT '更新时间',
    `create_by` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '操作人',
    PRIMARY KEY (`id`) USING BTREE,
    INDEX `idx_batch_no`(`batch_no`) USING BTREE,
    INDEX `idx_job_id`(`job_id`) USING BTREE,
    INDEX `idx_create_time`(`create_time`) USING BTREE
    ) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = 'DataX任务元数据漂移与模式演进审计日志表' ROW_FORMAT = Dynamic;



-- 2026-9-8
-- ----------------------------------------------------
-- Table structure for job_api_task (接口数据采集与落库任务配置表)
-- Author: ypc
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_api_task` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `task_name` varchar(128) NOT NULL COMMENT '任务名称',
  `job_id` int(11) DEFAULT NULL COMMENT '关联的 xxl-job (job_info) 调度ID',
  `cron_expression` varchar(128) DEFAULT NULL COMMENT '定时调度CRON表达式',
  `status` tinyint(4) NOT NULL DEFAULT 0 COMMENT '调度状态: 0-停止, 1-运行',

  -- 请求定义
  `request_url` varchar(1024) NOT NULL COMMENT '请求URL (支持${}占位符)',
  `request_method` varchar(10) NOT NULL DEFAULT 'GET' COMMENT '请求方法: GET, POST, PUT',
  `request_headers` text COMMENT '请求头配置 JSON',
  `request_params` text COMMENT 'Query参数配置 JSON',
  `request_body_type` varchar(32) DEFAULT 'none' COMMENT '请求体类型: none, json, form',
  `request_body` text COMMENT '请求体内容',

  -- 认证与鉴权
  `auth_type` varchar(32) DEFAULT 'NONE' COMMENT '认证类型: NONE, API_KEY, BEARER_TOKEN, BASIC_AUTH',
  `auth_config` text COMMENT '认证配置 (密文存储)',

  -- 分页策略与时间增量
  `page_strategy` varchar(32) DEFAULT 'NONE' COMMENT '分页策略: NONE, PAGE_NUM, OFFSET, CURSOR',
  `page_param_name` varchar(64) DEFAULT 'pageNum' COMMENT '页码/偏移量参数名',
  `size_param_name` varchar(64) DEFAULT 'pageSize' COMMENT '每页条数参数名',
  `page_start_index` int(11) DEFAULT 1 COMMENT '分页起始页码 (0或1)',
  `page_size` int(11) DEFAULT 100 COMMENT '每页拉取数量',
  `cursor_extract_path` varchar(255) DEFAULT NULL COMMENT '游标提取JSONPath',
  `max_page_limit` int(11) DEFAULT 500 COMMENT '最大循环保护阈值 (防死循环)',
  `stop_condition_path` varchar(255) DEFAULT NULL COMMENT '停止判定JSONPath (如$.has_more)',
  `increment_type` tinyint(4) DEFAULT 0 COMMENT '增量同步模式: 0-全量同步, 1-时间增量同步',
  `inc_start_time` datetime DEFAULT NULL COMMENT '增量起始时间/下次增量时间',
  `inc_time_format` varchar(64) DEFAULT 'yyyy-MM-dd HH:mm:ss' COMMENT '增量时间格式(如yyyy-MM-dd HH:mm:ss, timestamp)',
  `inc_time_column` varchar(128) DEFAULT NULL COMMENT '增量时间提取字段名(从返回数据对象中提取，如updateTime, loginDate)',
  `inc_strategy` tinyint(4) DEFAULT 0 COMMENT '增量推进策略: 0-取数据中最大业务时间(推荐), 1-按系统物理时间',

  -- 响应解析与提取
  `response_success_path` varchar(255) DEFAULT '$.code' COMMENT '成功状态码提取路径',
  `response_success_value` varchar(64) DEFAULT '200' COMMENT '成功状态码期望值',
  `response_msg_path` varchar(255) DEFAULT '$.message' COMMENT '错误消息提取路径',
  `data_extract_path` varchar(255) NOT NULL DEFAULT '$.data' COMMENT '数据列表根路径 (如$.data.list)',

  -- 目标输出库表配置
  `target_datasource_id` bigint(20) NOT NULL COMMENT '目标端数据源ID (关联job_jdbc_datasource)',
  `target_table_name` varchar(128) NOT NULL COMMENT '目标表名',
  `auto_create_table` tinyint(4) DEFAULT 0 COMMENT '目标表不存在时是否自动建表: 0-否, 1-是',
  `write_mode` varchar(32) DEFAULT 'APPEND' COMMENT '写入模式: APPEND, OVERWRITE, UPSERT',
  `column_mapping_json` text NOT NULL COMMENT '字段映射配置 JSON',
  `pre_sql` text COMMENT '写入前执行SQL',
  `post_sql` text COMMENT '写入后执行SQL',
  `batch_size` int(11) DEFAULT 1000 COMMENT '批处理批量大小',

  -- 健壮性与告警
  `request_delay_ms` int(11) DEFAULT 0 COMMENT '分页请求休眠间隔 (ms)',
  `timeout_seconds` int(11) DEFAULT 60 COMMENT '单次请求超时时间(秒)',
  `retry_count` int(11) DEFAULT 3 COMMENT '失败重试次数',
  `alarm_email` varchar(255) DEFAULT NULL COMMENT '告警通知邮箱',

  -- 执行监控与审计
  `last_run_time` datetime DEFAULT NULL COMMENT '最近一次运行时间',
  `last_run_status` tinyint(4) DEFAULT 0 COMMENT '最近运行状态: 0-未运行, 1-成功, 2-失败',
  `last_run_msg` varchar(1024) DEFAULT NULL COMMENT '最近运行摘要信息 (拉取条数/耗时)',
  `comments` varchar(500) DEFAULT NULL COMMENT '备注说明',
  `create_by` varchar(64) DEFAULT NULL COMMENT '创建者',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT NULL COMMENT '更新者',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_job_id` (`job_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='接口数据采集与落库任务配置表';

-- -------------------------------------------------------------
-- 5. 接口数据采集与落库任务: 本地任务管理列表采集 Demo 数据
-- -------------------------------------------------------------
INSERT INTO `job_api_task` (
  `id`, `task_name`, `job_id`, `cron_expression`, `status`,
  `request_url`, `request_method`, `request_headers`, `request_params`, `request_body_type`, `request_body`,
  `auth_type`, `auth_config`,
  `page_strategy`, `page_param_name`, `size_param_name`, `page_start_index`, `page_size`, `max_page_limit`,
  `response_success_path`, `response_success_value`, `response_msg_path`, `data_extract_path`,
  `target_datasource_id`, `target_table_name`, `auto_create_table`, `write_mode`, `column_mapping_json`,
  `batch_size`, `request_delay_ms`, `timeout_seconds`, `retry_count`, `comments`, `create_by`
) VALUES (
  1,
  'Demo-定时采集本地DataX任务管理列表',
  NULL,
  '0 0/10 * * * ?',
  0,
  'http://127.0.0.1:18080/api/job/pageList',
  'GET',
  '{"Content-Type":"application/json"}',
  '{"current":1,"size":10,"jobGroup":0,"triggerStatus":-1}',
  'none',
  NULL,
  'NONE',
  NULL,
  'PAGE_NUM',
  'current',
  'size',
  1,
  10,
  20,
  '$.code',
  '200',
  '$.msg',
  '$.content.data',
  1,
  'ods_datax_job_info',
  1,
  'APPEND',
  '[{"sourceCol":"id","targetCol":"job_id","dataType":"BIGINT"},{"sourceCol":"jobDesc","targetCol":"job_desc","dataType":"VARCHAR"},{"sourceCol":"jobGroup","targetCol":"job_group_id","dataType":"INT"},{"sourceCol":"jobCron","targetCol":"job_cron","dataType":"VARCHAR"},{"sourceCol":"executorHandler","targetCol":"executor_handler","dataType":"VARCHAR"},{"sourceCol":"triggerStatus","targetCol":"trigger_status","dataType":"INT"},{"sourceCol":"glueType","targetCol":"glue_type","dataType":"VARCHAR"}]',
  1000,
  0,
  60,
  3,
  '系统演示Demo：拉取本地DataX-Web自身的任务管理列表并同步落库',
  'admin'
) ON DUPLICATE KEY UPDATE
  `task_name` = VALUES(`task_name`),
  `request_url` = VALUES(`request_url`),
  `request_params` = VALUES(`request_params`),
  `column_mapping_json` = VALUES(`column_mapping_json`);



-- -------------------------------------------------------------
-- 表结构: ods_datax_job_info (标准下划线规范)
-- 包含用户指定的全部 37 个字段与同步审计字段
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ods_datax_job_info` (
  `id` bigint(20) NOT NULL COMMENT '任务主键ID',
  `job_group` int(11) NULL DEFAULT 0 COMMENT '执行器主键ID',
  `job_cron` varchar(128) NULL DEFAULT NULL COMMENT '任务执行CRON表达式',
  `job_desc` varchar(255) NULL DEFAULT NULL COMMENT '任务描述/标题',
  `project_id` int(11) NULL DEFAULT 0 COMMENT '所属项目ID',
  `project_name` varchar(100) NULL DEFAULT NULL COMMENT '项目名称',
  `user_id` int(11) NULL DEFAULT 0 COMMENT '操作用户ID',
  `user_name` varchar(100) NULL DEFAULT NULL COMMENT '操作用户名',
  `executor_handler` varchar(255) NULL DEFAULT NULL COMMENT '执行器任务Handler',
  `executor_param` varchar(1000) NULL DEFAULT NULL COMMENT '执行器任务参数',
  `executor_route_strategy` varchar(50) NULL DEFAULT NULL COMMENT '执行器路由策略',
  `executor_block_strategy` varchar(50) NULL DEFAULT NULL COMMENT '阻塞处理策略',
  `executor_timeout` int(11) NULL DEFAULT 0 COMMENT '任务超时时间(秒)',
  `executor_fail_retry_count` int(11) NULL DEFAULT 0 COMMENT '失败重试次数',
  `glue_type` varchar(50) NULL DEFAULT NULL COMMENT 'GLUE类型',
  `glue_source` mediumtext NULL COMMENT 'GLUE源代码',
  `glue_remark` varchar(255) NULL DEFAULT NULL COMMENT 'GLUE备注',
  `glue_updatetime` datetime(0) NULL DEFAULT NULL COMMENT 'GLUE更新时间',
  `child_job_id` varchar(500) NULL DEFAULT NULL COMMENT '子任务ID(逗号分隔)',
  `trigger_status` tinyint(4) NULL DEFAULT 0 COMMENT '调度状态: 0-停止, 1-运行',
  `trigger_last_time` bigint(20) NULL DEFAULT 0 COMMENT '上次调度时间戳',
  `trigger_next_time` bigint(20) NULL DEFAULT 0 COMMENT '下次调度时间戳',
  `job_json` longtext NULL COMMENT 'DataX运行配置JSON报文',
  `replace_param` varchar(255) NULL DEFAULT NULL COMMENT '脚本动态替换参数',
  `replace_param_type` varchar(50) NULL DEFAULT NULL COMMENT '增量日期格式类型',
  `jvm_param` varchar(512) NULL DEFAULT NULL COMMENT 'JVM运行调优参数',
  `inc_start_time` datetime(0) NULL DEFAULT NULL COMMENT '增量起始时间',
  `inc_start_id` bigint(20) NULL DEFAULT 0 COMMENT '增量起始ID',
  `increment_type` int(11) NULL DEFAULT 0 COMMENT '增量同步方式',
  `datasource_id` int(11) NULL DEFAULT 0 COMMENT '关联数据源ID',
  `reader_table` varchar(255) NULL DEFAULT NULL COMMENT 'DataX读表名称',
  `primary_key` varchar(100) NULL DEFAULT NULL COMMENT '业务主键字段',
  `partition_info` varchar(255) NULL DEFAULT NULL COMMENT '分区信息',
  `last_handle_code` int(11) NULL DEFAULT 0 COMMENT '最近一次执行状态码',
  `alarm_email` varchar(255) NULL DEFAULT NULL COMMENT '报警接收邮件',
  `add_time` datetime(0) NULL DEFAULT NULL COMMENT '任务创建时间',
  `update_time` datetime(0) NULL DEFAULT NULL COMMENT '任务更新时间',
  `sync_time` datetime(0) NULL DEFAULT CURRENT_TIMESTAMP COMMENT '数据同步入库时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_job_group`(`job_group`) USING BTREE,
  INDEX `idx_project_id`(`project_id`) USING BTREE,
  INDEX `idx_trigger_status`(`trigger_status`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = 'DataX本地任务管理接口采集落地表' ROW_FORMAT = Dynamic;


-- -------------------------------------------------------------
-- 2026-09-14 历史调度任务 glue_updatetime 字段空值修复补丁
-- 解决 Tab6 (结果表加工/JobStatTask) 与 Tab7 (接口采集/JobApiTask) 
-- 在 xxl-job 调度触发时因 glue_updatetime 为空抛出 NullPointerException 导致任务无法执行的问题
-- -------------------------------------------------------------
UPDATE `job_info` 
SET `glue_updatetime` = NOW() 
WHERE `glue_updatetime` IS NULL;

-- -------------------------------------------------------------
-- 7. 统计计算任务执行方式标识扩展 (可选物理字段说明)
-- 运行时已通过 last_run_msg 及 xxl-job 调度日志自动动态识别【手动】与【定时】方式；
-- 如需在数据库物理表中落盘存储最近一次触发类型，可执行以下 ALTER TABLE 语句：
-- ALTER TABLE `job_stat_task` ADD COLUMN `last_trigger_type` varchar(32) NULL DEFAULT NULL COMMENT '最近一次触发类型: MANUAL(手动), CRON(定时)' AFTER `last_run_msg`;
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- 8. 2026-09-15 Tab7 接口采集支持从数据行提取业务时间作为增量时间 (解决延迟/T-1漏数大坑)
-- -------------------------------------------------------------
ALTER TABLE `job_api_task` 
ADD COLUMN `inc_time_column` varchar(128) NULL DEFAULT NULL COMMENT '增量时间提取字段名(从返回数据对象中提取，如updateTime, loginDate)' AFTER `inc_time_format`,
ADD COLUMN `inc_strategy` tinyint(4) NULL DEFAULT 0 COMMENT '增量推进策略: 0-取数据中最大业务时间(推荐), 1-按系统物理时间' AFTER `inc_time_column`;

-- -------------------------------------------------------------
-- 9. 2026-09-15 Tab6 Python 模式支持绑定源端数据源并免密安全注入
-- job_stat_task 表原有 source_datasource_id 字段已在 Python 模式复用，
-- 前端支持可视化数据源徽标列表提示与一键绑定，执行时通过环境变量安全注入连接配置，
-- 无需新增物理字段。
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- 10. 2026-09-17 Tab 7 (job_api_task) 扩展支持「参数驱动源查询」
-- 支持根据内部业务表查询参数，动态过滤拉取三方接口数据
-- -------------------------------------------------------------
ALTER TABLE `job_api_task`
  ADD COLUMN `driver_datasource_id` bigint(20) DEFAULT 0 COMMENT '参数驱动源数据源ID (0表示无驱动源)' AFTER `auth_config`,
  ADD COLUMN `driver_sql` text DEFAULT NULL COMMENT '参数驱动查询SQL (如: SELECT veh_num FROM dim_vehicle WHERE is_active=1)' AFTER `driver_datasource_id`,
  ADD COLUMN `driver_param_mode` varchar(32) DEFAULT 'ROW' COMMENT '驱动模式: ROW(逐行遍历), BATCH(按批次切片拼接)' AFTER `driver_sql`,
  ADD COLUMN `driver_batch_size` int(11) DEFAULT 1 COMMENT '驱动批次切片大小 (ROW模式为1，BATCH模式如20~100)' AFTER `driver_param_mode`,
  ADD COLUMN `driver_delay_ms` int(11) DEFAULT 0 COMMENT '驱动批次间请求休眠间隔(ms，防三方频控)' AFTER `driver_batch_size`;

-- -------------------------------------------------------------
-- 11. 2026-09-17 用户个性化偏好配置表 (Tab显隐与自定义 SQL 查询模板跨设备同步，支持账号物理隔离)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_user_setting` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` int(11) NOT NULL COMMENT '用户ID (关联 job_user.id)',
  `username` varchar(64) NOT NULL DEFAULT '' COMMENT '用户名',
  `setting_key` varchar(64) NOT NULL COMMENT '配置键名 (如 visible_tabs, custom_sql_queries)',
  `setting_value` mediumtext NULL COMMENT '配置值 (JSON 格式配置)',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_user_setting` (`user_id`, `setting_key`) USING BTREE,
  INDEX `idx_username` (`username`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '用户个性化偏好配置表' ROW_FORMAT = Dynamic;

-- 针对存量已存在该表的库，执行以下语句平滑升级字段长度 (防止大量自定义 SQL 模板超出 64KB 限制):
-- ALTER TABLE `job_user_setting` MODIFY COLUMN `setting_value` mediumtext NULL COMMENT '配置值 (JSON 格式配置)';

-- -------------------------------------------------------------
-- 12. 2026-10-23 系统角色元数据字典表 (支撑系统角色新增与集中管理)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_role` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `role_code` varchar(50) NOT NULL COMMENT '角色标识：如 ROLE_ADMIN, ROLE_USER, ROLE_ANALYST',
  `role_name` varchar(50) NOT NULL COMMENT '角色中文名称：如 超级管理员, 数据分析师',
  `description` varchar(255) DEFAULT NULL COMMENT '角色职责与权限描述说明',
  `is_system` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否系统内置(1:是，禁止删除与修改编码)',
  `sort_order` int(4) NOT NULL DEFAULT 100 COMMENT '展示排序号',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_role_code` (`role_code`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '系统角色字典表' ROW_FORMAT = Dynamic;

-- 初始化平台默认内置基线角色
INSERT INTO `job_role` (`role_code`, `role_name`, `description`, `is_system`, `sort_order`)
VALUES
('ROLE_ADMIN', '系统管理员', '拥有平台所有库表、菜单及数据同步任务最高特权', 1, 1),
('ROLE_USER', '普通用户', '受库表权限与菜单权限白名单管控的普通操作员', 1, 2)
ON DUPLICATE KEY UPDATE `role_name` = VALUES(`role_name`);



-- -------------------------------------------------------------
-- 13. 2026-10-28 开放 API 账号管理与全链路调用审计日志基线表 (支撑三方系统/AI 安全取数与可视化管理)
-- -------------------------------------------------------------

-- 1. 外部 API 接口账号及权限配置表
CREATE TABLE IF NOT EXISTS `job_api_account` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增主键ID',
  `app_key` varchar(64) NOT NULL COMMENT '分配给三方系统的 AccessKey',
  `app_secret` varchar(128) NOT NULL COMMENT '签名密钥 Secret',
  `account_name` varchar(64) NOT NULL COMMENT '三方系统或账号名称',
  `domain_code` varchar(64) DEFAULT NULL COMMENT '所属业务领域代码(可选)',
  `datasource_id` bigint(20) DEFAULT NULL COMMENT '绑定的首个只读数据源ID (关联 job_jdbc_datasource.id)',
  `allowed_tables` text DEFAULT NULL COMMENT '允许访问的表列表(逗号分隔)，* 代表全部表',
  `permissions` longtext DEFAULT NULL COMMENT '多数据源库与表授权清单JSON配置',
  `allowed_ips` varchar(512) DEFAULT NULL COMMENT '允许调用的客户端服务器IP白名单(逗号分隔，空表示不限)',
  `rate_limit_qps` int(11) DEFAULT 10 COMMENT '单账号QPS限流上限',
  `status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '账号状态：1-启用，0-停用',
  `comments` varchar(255) DEFAULT NULL COMMENT '账号用途描述与备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_app_key` (`app_key`) USING BTREE,
  INDEX `idx_domain` (`domain_code`) USING BTREE,
  INDEX `idx_status` (`status`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '外部API接口调用账号与权限配置表' ROW_FORMAT = Dynamic;

-- 2. 外部 API 执行与安全审计日志表
CREATE TABLE IF NOT EXISTS `job_api_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键ID',
  `app_key` varchar(64) NOT NULL COMMENT '调用账号 AccessKey',
  `client_ip` varchar(64) NOT NULL COMMENT '客户端IP',
  `client_source` varchar(128) DEFAULT NULL COMMENT '调用终端或AI工具来源标识(如 Trae (MCP)、WorkBuddy (MCP)、Chrome、Postman)',
  `user_agent` varchar(512) DEFAULT NULL COMMENT '原始 HTTP User-Agent 请求头',
  `domain_code` varchar(64) NOT NULL COMMENT '请求系统领域',
  `execute_sql` mediumtext NOT NULL COMMENT '执行的SQL语句',
  `tables_involved` varchar(512) DEFAULT NULL COMMENT 'AST解析涉及的表清单',
  `result_rows` int(11) NOT NULL DEFAULT 0 COMMENT '返回数据行数(条)',
  `cost_ms` int(11) NOT NULL DEFAULT 0 COMMENT '执行耗时(毫秒)',
  `status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '执行结果：1-成功，0-失败，2-安全拦截',
  `error_msg` varchar(512) DEFAULT NULL COMMENT '失败或拦截原因',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '调用时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_app_key_time` (`app_key`, `create_time`) USING BTREE,
  INDEX `idx_client_source` (`client_source`) USING BTREE,
  INDEX `idx_status` (`status`) USING BTREE,
  INDEX `idx_create_time` (`create_time`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '外部API查询执行与安全审计日志表' ROW_FORMAT = Dynamic;

-- 3. 智能助手 Tab8（三方开放API管理）系统菜单与权限配置
INSERT INTO `job_permission` (`name`, `description`, `url`, `pid`) 
SELECT '三方开放API管理', '三方API接口账号分配、库表白名单授权及全链路调用审计', '/job/openApi', 0 
WHERE NOT EXISTS (SELECT 1 FROM `job_permission` WHERE `url` = '/job/openApi');

-- 4. 接口账号表支持多数据源与表列表授权控制字段 permissions
ALTER TABLE `job_api_account` 
  MODIFY COLUMN `domain_code` varchar(64) DEFAULT NULL COMMENT '所属业务领域代码(可选)',
  MODIFY COLUMN `datasource_id` bigint(20) DEFAULT NULL COMMENT '绑定的首个只读数据源ID',
  ADD COLUMN `permissions` longtext DEFAULT NULL COMMENT '多数据源库与表授权清单JSON配置' AFTER `allowed_tables`;

-- -------------------------------------------------------------
-- 14. 2026-11-03 开放 API 客户端 IP 黑名单与一键封禁基线表 (支撑 Tab8 调用日志审计现场封禁异常 IP)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_api_ip_blacklist` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增主键ID',
  `ip_address` varchar(64) NOT NULL COMMENT '被封禁的客户端IP地址(支持精确IP、*通配符或CIDR网段)',
  `app_key` varchar(64) NOT NULL DEFAULT '*' COMMENT '封禁作用范围：* 代表全局封禁所有API账号，指定app_key代表仅封禁该账号',
  `reason` varchar(255) DEFAULT NULL COMMENT '封禁原因说明或拦截备注',
  `source_log_id` bigint(20) DEFAULT NULL COMMENT '关联触发拉黑的源调用审计日志ID(job_api_log.id)',
  `status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '黑名单状态：1-生效中，0-已解封',
  `create_by` varchar(64) DEFAULT NULL COMMENT '操作管理员用户名',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_ip_appkey` (`ip_address`, `app_key`) USING BTREE,
  INDEX `idx_status` (`status`) USING BTREE,
  INDEX `idx_source_log` (`source_log_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '开放API客户端IP黑名单管控表' ROW_FORMAT = Dynamic;

-- -------------------------------------------------------------
-- 15. 2026-11-03 开放 API 调用审计日志表扩展调用终端与 AI 工具来源识别字段
-- -------------------------------------------------------------
ALTER TABLE `job_api_log`
  ADD COLUMN `client_source` varchar(128) DEFAULT NULL COMMENT '调用终端或AI工具来源标识(如 Trae (MCP)、WorkBuddy (MCP)、Chrome、Postman)' AFTER `client_ip`,
  ADD COLUMN `user_agent` varchar(512) DEFAULT NULL COMMENT '原始 HTTP User-Agent 请求头' AFTER `client_source`,
  ADD INDEX `idx_client_source` (`client_source`) USING BTREE;


