/**
 * ============================================================================
 * 🤖 AI Agent 刚性开发规范约束 (智能助手与全栈功能专规)
 * 来源参考: .agents/rules/assistant_development_rules.md
 * 任何在此代码库工作的 AI 助手 (Antigravity / Gemini 等) 必须无条件严格遵守:
 * ============================================================================
 * 1. 文案与反馈口吻红线 (严禁生造概念，必须“说人话”):
 *    - 拒绝流计算行话: 严禁出现“水位线推进”、“拉取X行”、“流吞吐”等词汇。
 *    - 计数量词: 一律使用“条”(如“读取 2 条，写入 2 条”)，严禁用“行/Rows”。
 *    - 增量时间: 一律使用“下次增量时间: yyyy-MM-dd HH:mm:ss”或“增量时间已更新至: ...”。
 *    - 成功反馈格式: 🎉 任务执行成功：读取 {M} 条，写入目标表 [{tableName}] {N} 条，耗时 {time}（下次增量时间: {nextTime}）。
 *    - 失败反馈格式: 任务执行失败 (耗时 {time}): {errorMessage}。
 *    - 弹窗反馈直奔主题单行总结，避免套娃重复。
 *
 * 2. 日期与时间处理铁律:
 *    - 所有实体/DTO 的 Date 必须标注 @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")。
 *    - GET 请求 URL 空格必须转为 %20；Controller 日期解析必须做 18 位无空格粘连串的容错补齐。
 *
 * 3. 增量过滤与命名规范:
 *    - 配置数据本身的增量一律且只能以物理更新时间 update_time 为准，入参兼容驼峰与下划线。
 *
 * 4. MyBatis 映射器避坑:
 *    - 严禁在 Mapper 接口中声明同名重载抽象方法！保持向下兼容请使用 Java 8 default 接口方法。
 *
 * 5. 前端规范与安全防御:
 *    - 统一采用 Ant Design 规范调色盘: 主色 #1890ff、紫调 #722ed1、成功 #52c41a、失败 #f5222d、警示 #fa8c16。
 *    - 强制 XSS 防御: 任何从后端返回的内容写入 DOM 必须先经 safeEscapeHtml 转义。
 *    - 界面图标与 Emoji 白名单规范: 所有列表按钮与弹窗标题/按钮仅允许保留 🚀 (火箭)、🔍 (查询放大镜)、➕ (新增)、✏️ (修改/编辑)、🗑️ (删除)，其余禁用 Emoji。
 *    - 重复代码超 2 处必须抽取公共辅助方法；保持 Vanilla JS 纯原生架构与组件化规范。
 *
 * 6. 十大不可逾越的红线:
 *    - 严禁格式化旧代码；
 *    - 严禁删除已有的 class 或 target 编译文件；
 *    - 严禁随意标注作者，新建文件才允许写 author: ypc，行内/修改不要写；
 *    - 严禁使用全类名，规范 import；
 *    - 有表结构、字典、菜单变更自动在 bin/db/ 产出对应 SQL 脚本；
 *    - OAsystem 与本工程日常前端迭代严禁执行任何 mvn 相关操作；
 *    - 必须使用中文回答与汇报。
 * ============================================================================
 *
 * @fileoverview DataX 智能助手启动调度器 (Bootstrap Loader)
 * 负责顺序装配 assistant/ 模块生态，初始化微内核架构并挂载 window.DataXAssistant。
 *
 * @version 3.1.1
 */

(function () {
  'use strict';

  if (window.__DATAX_ASSISTANT_LOADED__) return;
  window.__DATAX_ASSISTANT_LOADED__ = true;

  // 模块脚本拓扑加载序列：先载入权限守卫与微内核核心，再注册各业务 Tab，最后装配主面板并挂载激活
  const SCRIPTS = [
    '/static/js/lib/xlsx.full.min.js',
    '/static/js/assistant/core/auth_guard.js',
    '/static/js/assistant/core/event_bus.js',
    '/static/js/assistant/core/dom_builder.js',
    '/static/js/assistant/components/marquee_selector.js',
    '/static/js/assistant/components/searchable_select.js',
    '/static/js/assistant/components/window_manager.js',
    '/static/js/assistant/components/settings_modal.js',
    '/static/js/assistant/components/native_toolbar.js',
    '/static/js/assistant/components/shortcut_manager.js',
    '/static/js/assistant/components/sql_template_manager.js',
    '/static/js/assistant/components/novice_table_query.js',
    '/static/js/assistant/tabs/tab1_excel.js',
    '/static/js/assistant/tabs/tab2_mapping.js',
    '/static/js/assistant/tabs/tab3_batch_job.js',
    '/static/js/assistant/tabs/tab4_db_switch.js',
    '/static/js/assistant/tabs/tab5_data_viewer.js',
    '/static/js/assistant/tabs/tab6_stat_task.js',
    '/static/js/assistant/tabs/tab7_api_task.js',
    '/static/js/assistant/templates/open_api_templates.js',
    '/static/js/assistant/tabs/tab8_open_api.js',
    '/static/js/assistant/index.js'
  ];

  const VERSION = '3.9.1';

  /**
   * 按依赖顺序异步加载脚本序列
   *
   * @param {Array<string>} urls 脚本路径列表
   * @param {Function} [onComplete] 加载完成回调
   */
  function loadScriptSequence(urls, onComplete) {
    let index = 0;
    function next() {
      if (index >= urls.length) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      const url = urls[index++];
      const queryUrl = `${url}?v=${VERSION}`;
      if (document.querySelector(`script[src*="${url}"]`)) {
        next();
        return;
      }
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.charset = 'utf-8';
      script.src = queryUrl;
      script.onload = () => next();
      script.onerror = (err) => {
        console.error(`[DataX Assistant] 加载模块失败: ${url}`, err);
        next();
      };
      document.head.appendChild(script);
    }
    next();
  }

  function startBootstrap() {
    loadScriptSequence(SCRIPTS, () => {
      // 当所有模块全部加载完毕后，统一挂载激活所有 Tab
      if (window.DataXAssistant && typeof window.DataXAssistant.mountTabs === 'function') {
        window.DataXAssistant.mountTabs();
      }
      console.log('[DataX Assistant] 所有解耦模块装配就绪 v' + VERSION);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBootstrap);
  } else {
    startBootstrap();
  }
})();
