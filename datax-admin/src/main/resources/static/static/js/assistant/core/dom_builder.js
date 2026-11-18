/**
 * @fileoverview 智能助手 DOM 构造与样式基础设施 (DomBuilder)
 * 统一管理 DOM 工厂、存储读写、样式注入及安全实体转义。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  /**
   * 安全读取 localStorage 存储项
   *
   * @param {string} key 键名
   * @param {string} defaultValue 缺省值
   * @return {string} 存储值或缺省值
   */
  function getStorageItem(key, defaultValue) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  /**
   * 安全写入 localStorage 存储项
   *
   * @param {string} key 键名
   * @param {string} value 待写入值
   */
  function setStorageItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // 容错处理：无痕模式或存储已满
    }
  }

  /**
   * 安全 HTML 实体转义方法 (防止 XSS 注入)
   *
   * @param {string} str 待转义原始字符串
   * @return {string} 转义后的安全字符串
   */
  function safeEscapeHtml(str) {
    if (window.DataXCommon?.Utils?.safeEscapeHtml) {
      return window.DataXCommon.Utils.safeEscapeHtml(str);
    }
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 统一消息提示框 (委托给 DataXCommon.Notice)
   *
   * @param {string|Error} message 提示信息
   */
  function alert(message) {
    if (window.DataXCommon?.Notice?.alert) {
      return window.DataXCommon.Notice.alert(message);
    }
    window.alert(message);
  }

  /**
   * 统一确认对话框 (委托给 DataXCommon.Notice)
   *
   * @param {string} content 确认提示内容
   * @param {Object} [options={}] 对话框配置
   * @return {Promise<boolean>} 是否确认
   */
  function confirm(content, options = {}) {
    if (window.DataXCommon?.Notice?.confirm) {
      return window.DataXCommon.Notice.confirm(content, options);
    }
    return Promise.resolve(window.confirm(content));
  }

  /**
   * 统一轻量 Toast 提示
   *
   * @param {string} text 提示文本
   * @param {number} [duration=2500] 展示时长 (ms)
   */
  function toast(text, duration = 2500) {
    if (window.DataXCommon?.Notice?.toast) {
      window.DataXCommon.Notice.toast(text, duration);
      return;
    }
    console.log('[Toast]', text);
  }

  /**
   * 判断当前工作台或助手面板是否处于暗黑模式 (全局可信源)
   *
   * @return {boolean} 是否为暗黑模式
   */
  function isDarkMode() {
    const panel = document.getElementById('datax-excel-selector-panel');
    if (panel && panel.classList.contains('datax-dark-mode')) return true;
    try {
      const theme = localStorage.getItem('datax_assistant_theme') || 'light';
      if (theme === 'dark') return true;
      if (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
    } catch (e) {}
    return false;
  }
  window.DataXAssistant.isDarkMode = isDarkMode;

  /**
   * 注入智能助手增强样式（包含暗黑模式、全局字体自适应、8方向全向缩放手柄与设置弹窗）
   */
  function ensureEnhancedStyles() {
    window.DataXCommon?.Layout?.ensureGlobalLayoutStyles?.();
    if (document.getElementById('datax-assistant-enhanced-style')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'datax-assistant-enhanced-style';
    styleEl.textContent = `
      #datax-excel-selector-panel,
      .datax-assistant-modal,
      .datax-assistant-dialog,
      #datax-batch-compare-dialog,
      #datax-batch-drift-dialog,
      #datax-rollback-strategy-modal {
        --datax-asst-font-size: 13px;
        font-size: var(--datax-asst-font-size) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        letter-spacing: 0.1px;
      }
      #datax-excel-selector-panel [id^="datax-tab-content-"],
      #datax-excel-selector-panel [id^="datax-tab-btn-"],
      #datax-excel-selector-panel table,
      #datax-excel-selector-panel input,
      #datax-excel-selector-panel select,
      #datax-excel-selector-panel button,
      #datax-excel-selector-panel textarea,
      #datax-excel-selector-panel label,
      #datax-excel-selector-panel span,
      #datax-excel-selector-panel td,
      #datax-excel-selector-panel th,
      #datax-excel-selector-panel div {
        font-family: inherit;
        font-size: inherit;
      }
      #datax-excel-selector-panel pre,
      #datax-excel-selector-panel code,
      .datax-code-font {
        font-family: Consolas, Monaco, "Courier New", monospace !important;
        font-size: 12px !important;
      }
      .datax-resize-handle {
        position: absolute;
        z-index: 1000001;
        user-select: none;
      }
      .datax-resize-n { top: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize; }
      .datax-resize-s { bottom: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize; }
      .datax-resize-w { left: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize; }
      .datax-resize-e { right: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize; }
      .datax-resize-nw { top: -4px; left: -4px; width: 12px; height: 12px; cursor: nwse-resize; }
      .datax-resize-ne { top: -4px; right: -4px; width: 12px; height: 12px; cursor: nesw-resize; }
      .datax-resize-sw { bottom: -4px; left: -4px; width: 12px; height: 12px; cursor: nesw-resize; }
      .datax-resize-se {
        bottom: 0; right: 0; width: 14px; height: 14px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, #c0c4cc 50%);
        border-radius: 0 0 9px 0;
      }
      #datax-excel-selector-panel.datax-dark-mode {
        background: #18191d !important;
        border-color: #333740 !important;
        color: #e5e7eb !important;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5) !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-panel-header {
        background: linear-gradient(90deg, #172a45, #0d1e33) !important;
        border-bottom: 1px solid #23344d !important;
      }
      #datax-excel-selector-panel.datax-dark-mode [id^="datax-tab-btn-"] {
        background: #212328 !important;
        color: #9ca3af !important;
        border-right: 1px solid #2d3039 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode [id^="datax-tab-btn-"].active-tab,
      #datax-excel-selector-panel.datax-dark-mode [id^="datax-tab-btn-"][style*="border-bottom: 2px solid rgb(24, 144, 255)"],
      #datax-excel-selector-panel.datax-dark-mode [id^="datax-tab-btn-"][style*="border-bottom: 2px solid #1890ff"] {
        background: #18191d !important;
        color: #3b82f6 !important;
        font-weight: bold !important;
        border-bottom: 2px solid #3b82f6 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode [id^="datax-tab-content-"] {
        background: #18191d !important;
        color: #e5e7eb !important;
      }
      /* === 核心抽屉面板与容器暗黑模式规则 === */
      #datax-excel-selector-panel.datax-dark-mode #datax-st-editor-panel,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-editor-panel,
      #datax-excel-selector-panel.datax-dark-mode #datax-job-list-container,
      #datax-excel-selector-panel.datax-dark-mode #datax-writer-diff-container,
      #datax-excel-selector-panel.datax-dark-mode #datax-dv-table-container,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-list-container,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-task-list-box,
      #datax-excel-selector-panel.datax-dark-mode #datax-status-box,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-test-run-result-box,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-test-run-table-container,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-test-run-result,
      #datax-excel-selector-panel.datax-dark-mode #datax-sheet-section,
      #datax-excel-selector-panel.datax-dark-mode div[style*="max-height: 260px;"][style*="background"] {
        background: #1e1f25 !important;
        border-color: #333740 !important;
        color: #d1d5db !important;
      }

      /* 抽屉顶部标题底边框适配 */
      #datax-excel-selector-panel.datax-dark-mode #datax-st-editor-panel > div:first-child,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-editor-panel > div:first-child {
        border-bottom-color: #333740 !important;
      }

      /* 通用白色与浅色容器背景拦截 (全标签覆盖，防止任何漏网之白) */
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #fff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #ffffff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background:#fff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background:#ffffff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: white"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(255, 255, 255)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background-color: rgb(255, 255, 255)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(248, 249, 250)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(244, 246, 248)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(245, 247, 250)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(240, 247, 255)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(230, 247, 255)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(240, 245, 255)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(250, 250, 250)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(253, 253, 253)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #e6f7ff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f0f7ff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f0f5ff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f4f6f8"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f8f9fa"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #fafafa"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #fdfdfd"] {
        background: #21232a !important;
        border-color: #353945 !important;
        color: #d1d5db !important;
      }

      /* 业务特定浅色模块高亮容器暗黑重构 */
      #datax-excel-selector-panel.datax-dark-mode #datax-st-box-sql,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-box-python,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-source-table-bar,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-python-ds-hint-bar,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-auth-config-box,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-inc-advance-group {
        background: #23252d !important;
        border-color: #393e4d !important;
      }

      /* Tab 6 & Tab 7 目标端输出配置容器 (原浅蓝 #f0f7ff) */
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f0f7ff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(240, 247, 255)"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f0f5ff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(240, 245, 255)"] {
        background: #172435 !important;
        border-color: #203a5c !important;
      }
      #datax-excel-selector-panel.datax-dark-mode div[style*="color: #0050b3"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="color: #1d39c4"],
      #datax-excel-selector-panel.datax-dark-mode strong[style*="color: #1d39c4"] {
        color: #69c0ff !important;
      }

      /* 跨库与多源警告提示卡片 (原黄色 #fdf6ec / 绿色 #f6ffed) */
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #fdf6ec"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(253, 246, 236)"] {
        background: #2b241c !important;
        border-color: #4d3d25 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f6ffed"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(246, 255, 237)"] {
        background: #1b2d1e !important;
        border-color: #2b4f2c !important;
      }
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: #f9f0ff"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="background: rgb(249, 240, 255)"] {
        background: #2a2238 !important;
        border-color: #4c3366 !important;
      }

      /* 按钮暗黑化：彻底消除白底灰色按钮 (刷新、取消、暂存草稿、分页等) */
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-refresh,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-cancel,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-btn-refresh,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-btn-cancel-save,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-pg-prev,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-pg-next,
      #datax-excel-selector-panel.datax-dark-mode button.datax-st-action-btn[data-action="edit"],
      #datax-excel-selector-panel.datax-dark-mode button.datax-api-action-btn[data-action="edit"],
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: #f0f2f5"],
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: rgb(240, 242, 245)"],
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: #fff"],
      #datax-excel-selector-panel.datax-dark-mode button[style*="background:#fff"],
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: rgb(255, 255, 255)"],
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: #fafafa"],
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: #f5f5f5"] {
        background: #2b2e38 !important;
        border-color: #3f4350 !important;
        color: #d1d5db !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-refresh:hover,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-cancel:hover,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-btn-refresh:hover,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-btn-cancel-save:hover,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-pg-prev:hover,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-pg-next:hover,
      #datax-excel-selector-panel.datax-dark-mode button.datax-st-action-btn[data-action="edit"]:hover,
      #datax-excel-selector-panel.datax-dark-mode button.datax-api-action-btn[data-action="edit"]:hover,
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: #f0f2f5"]:hover,
      #datax-excel-selector-panel.datax-dark-mode button[style*="background: #fff"]:hover {
        background: #383c4a !important;
        color: #ffffff !important;
      }

      /* 草稿保存与功能插入类按钮暗黑化 */
      #datax-excel-selector-panel.datax-dark-mode #datax-api-btn-draft-save {
        background: rgba(212, 136, 6, 0.2) !important;
        border-color: rgba(212, 136, 6, 0.5) !important;
        color: #e6a23c !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-load-demo-code,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-insert-table,
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-insert-macro,
      #datax-excel-selector-panel.datax-dark-mode .datax-api-detect-time-btn,
      #datax-excel-selector-panel.datax-dark-mode #datax-api-btn-load-demo,
      #datax-excel-selector-panel.datax-dark-mode button[id$="-toggle"] {
        background: rgba(24, 144, 255, 0.16) !important;
        border-color: rgba(24, 144, 255, 0.45) !important;
        color: #40a9ff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-gen-select {
        background: rgba(82, 196, 26, 0.16) !important;
        border-color: rgba(82, 196, 26, 0.45) !important;
        color: #73d13d !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-st-btn-insert-py-db-code {
        background: rgba(114, 46, 209, 0.2) !important;
        border-color: rgba(114, 46, 209, 0.5) !important;
        color: #d3adf7 !important;
      }

      /* 一体化可搜索下拉组件 (SearchableSelect) 暗黑模式适配 */
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-control,
      .datax-sub-modal.datax-dark-mode .datax-ss-control,
      div[id$="-modal"].datax-dark-mode .datax-ss-control {
        background: #282a32 !important;
        border-color: #3f4350 !important;
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-control:hover,
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-control:focus-within,
      .datax-sub-modal.datax-dark-mode .datax-ss-control:hover,
      .datax-sub-modal.datax-dark-mode .datax-ss-control:focus-within,
      div[id$="-modal"].datax-dark-mode .datax-ss-control:hover,
      div[id$="-modal"].datax-dark-mode .datax-ss-control:focus-within {
        border-color: #177ddc !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-input,
      .datax-sub-modal.datax-dark-mode .datax-ss-input,
      div[id$="-modal"].datax-dark-mode .datax-ss-input {
        background: transparent !important;
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-dropdown,
      #datax-excel-selector-panel.datax-dark-mode .datax-col-dropdown-panel,
      .datax-sub-modal.datax-dark-mode .datax-ss-dropdown,
      .datax-sub-modal.datax-dark-mode .datax-col-dropdown-panel,
      div[id$="-modal"].datax-dark-mode .datax-ss-dropdown,
      div[id$="-modal"].datax-dark-mode .datax-col-dropdown-panel {
        background: #23252d !important;
        border-color: #3f4350 !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-dropdown > div,
      #datax-excel-selector-panel.datax-dark-mode .datax-col-dropdown-panel > div,
      .datax-sub-modal.datax-dark-mode .datax-ss-dropdown > div,
      div[id$="-modal"].datax-dark-mode .datax-ss-dropdown > div {
        border-bottom: 1px solid #2e313b !important;
        color: #d1d5db !important;
        background: transparent !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-dropdown > div:hover,
      #datax-excel-selector-panel.datax-dark-mode .datax-col-dropdown-panel > div:hover,
      .datax-sub-modal.datax-dark-mode .datax-ss-dropdown > div:hover,
      div[id$="-modal"].datax-dark-mode .datax-ss-dropdown > div:hover {
        background: #2e323e !important;
        color: #40a9ff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-dropdown > div[style*="background: #e6f7ff"],
      #datax-excel-selector-panel.datax-dark-mode .datax-ss-dropdown > div[style*="background: rgb(230, 247, 255)"],
      .datax-sub-modal.datax-dark-mode .datax-ss-dropdown > div[style*="background: #e6f7ff"],
      div[id$="-modal"].datax-dark-mode .datax-ss-dropdown > div[style*="background: #e6f7ff"] {
        background: #172d4d !important;
        color: #40a9ff !important;
      }

      /* 徽标、标签与提示药丸暗黑重构 */
      #datax-excel-selector-panel.datax-dark-mode .datax-driver-badge,
      #datax-excel-selector-panel.datax-dark-mode .datax-inc-badge,
      #datax-excel-selector-panel.datax-dark-mode span[class*="-badge"][style*="background: #fff"],
      #datax-excel-selector-panel.datax-dark-mode span[class*="-badge"][style*="background: rgb(255, 255, 255)"] {
        background: #282a32 !important;
        border-color: #3f4350 !important;
        color: #40a9ff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-st-py-ds-badge {
        background: #282236 !important;
        border-color: #493361 !important;
        color: #d3adf7 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-st-py-ds-badge[style*="background: #722ed1"],
      #datax-excel-selector-panel.datax-dark-mode .datax-st-py-ds-badge[style*="background: rgb(114, 46, 209)"] {
        background: #722ed1 !important;
        border-color: #9254de !important;
        color: #ffffff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode kbd {
        background: #282a32 !important;
        border-color: #3f4350 !important;
        color: #d1d5db !important;
      }

      /* 状态胶囊深色背景 */
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: #f6ffed"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: rgb(246, 255, 237)"],
      .datax-sub-modal.datax-dark-mode span[style*="background: #f6ffed"],
      .datax-sub-modal.datax-dark-mode span[style*="background: rgb(246, 255, 237)"],
      div[id$="-modal"].datax-dark-mode span[style*="background: #f6ffed"],
      div[id$="-modal"].datax-dark-mode span[style*="background: rgb(246, 255, 237)"] {
        background: rgba(82, 196, 26, 0.18) !important;
        border-color: rgba(82, 196, 26, 0.45) !important;
        color: #73d13d !important;
      }
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: #e6f7ff"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: rgb(230, 247, 255)"],
      .datax-sub-modal.datax-dark-mode span[style*="background: #e6f7ff"],
      .datax-sub-modal.datax-dark-mode span[style*="background: rgb(230, 247, 255)"],
      div[id$="-modal"].datax-dark-mode span[style*="background: #e6f7ff"],
      div[id$="-modal"].datax-dark-mode span[style*="background: rgb(230, 247, 255)"] {
        background: rgba(24, 144, 255, 0.18) !important;
        border-color: rgba(24, 144, 255, 0.45) !important;
        color: #40a9ff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: #f9f0ff"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: rgb(249, 240, 255)"],
      .datax-sub-modal.datax-dark-mode span[style*="background: #f9f0ff"],
      .datax-sub-modal.datax-dark-mode span[style*="background: rgb(249, 240, 255)"],
      div[id$="-modal"].datax-dark-mode span[style*="background: #f9f0ff"],
      div[id$="-modal"].datax-dark-mode span[style*="background: rgb(249, 240, 255)"] {
        background: rgba(114, 46, 209, 0.22) !important;
        border-color: rgba(179, 127, 235, 0.45) !important;
        color: #d3adf7 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: #fffbe6"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: rgb(255, 251, 230)"],
      .datax-sub-modal.datax-dark-mode span[style*="background: #fffbe6"],
      .datax-sub-modal.datax-dark-mode span[style*="background: rgb(255, 251, 230)"],
      div[id$="-modal"].datax-dark-mode span[style*="background: #fffbe6"],
      div[id$="-modal"].datax-dark-mode span[style*="background: rgb(255, 251, 230)"] {
        background: rgba(212, 136, 6, 0.2) !important;
        border-color: rgba(212, 136, 6, 0.45) !important;
        color: #e6a23c !important;
      }
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: #fff1f0"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: rgb(255, 241, 240)"],
      .datax-sub-modal.datax-dark-mode span[style*="background: #fff1f0"],
      .datax-sub-modal.datax-dark-mode span[style*="background: rgb(255, 241, 240)"],
      div[id$="-modal"].datax-dark-mode span[style*="background: #fff1f0"],
      div[id$="-modal"].datax-dark-mode span[style*="background: rgb(255, 241, 240)"] {
        background: rgba(245, 34, 45, 0.2) !important;
        border-color: rgba(245, 34, 45, 0.45) !important;
        color: #ff7875 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: #fafafa"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: rgb(250, 250, 250)"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="background: #f0f2f5"],
      .datax-sub-modal.datax-dark-mode span[style*="background: #fafafa"],
      .datax-sub-modal.datax-dark-mode span[style*="background: rgb(250, 250, 250)"],
      .datax-sub-modal.datax-dark-mode span[style*="background: #f0f2f5"],
      div[id$="-modal"].datax-dark-mode span[style*="background: #fafafa"],
      div[id$="-modal"].datax-dark-mode span[style*="background: #f0f2f5"] {
        background: #252830 !important;
        border-color: #393e4d !important;
        color: #9ca3af !important;
      }

      /* 文本与标签颜色容错暗黑 */
      #datax-excel-selector-panel.datax-dark-mode span[style*="color: #303133"],
      #datax-excel-selector-panel.datax-dark-mode td[style*="color: #303133"],
      #datax-excel-selector-panel.datax-dark-mode label[style*="color: #333"],
      #datax-excel-selector-panel.datax-dark-mode div[style*="color: #303133"] {
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode span[style*="color: #606266"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="color: #8c8c8c"],
      #datax-excel-selector-panel.datax-dark-mode span[style*="color: #888"] {
        color: #9ca3af !important;
      }

      #datax-excel-selector-panel.datax-dark-mode input[type="text"],
      #datax-excel-selector-panel.datax-dark-mode input[type="number"],
      #datax-excel-selector-panel.datax-dark-mode input[type="password"],
      #datax-excel-selector-panel.datax-dark-mode input[type="file"],
      #datax-excel-selector-panel.datax-dark-mode select,
      #datax-excel-selector-panel.datax-dark-mode textarea {
        background: #282a32 !important;
        color: #e5e7eb !important;
        border-color: #3f4350 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode input::placeholder,
      #datax-excel-selector-panel.datax-dark-mode textarea::placeholder {
        color: #6b7280 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode option {
        background: #282a32 !important;
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode table {
        background: #1e1f25 !important;
        color: #d1d5db !important;
      }
      #datax-excel-selector-panel.datax-dark-mode th {
        background: #272932 !important;
        color: #9ca3af !important;
        border-color: #333740 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode td {
        border-color: #2b2d35 !important;
        color: #d1d5db !important;
      }
      #datax-excel-selector-panel.datax-dark-mode tr,
      #datax-excel-selector-panel.datax-dark-mode tr[style*="background"] {
        background: #1e1f25 !important;
        border-color: #2b2d35 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode tbody tr.odd,
      #datax-excel-selector-panel.datax-dark-mode tbody tr:nth-child(even),
      #datax-excel-selector-panel.datax-dark-mode tbody tr[style*="background: #fafcff"] {
        background: #22252c !important;
      }
      #datax-excel-selector-panel.datax-dark-mode tr:hover,
      #datax-excel-selector-panel.datax-dark-mode tr:hover td,
      #datax-excel-selector-panel.datax-dark-mode tbody tr:hover {
        background: #2a2e38 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode label,
      #datax-excel-selector-panel.datax-dark-mode strong {
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-settings-dialog {
        background: #1e1f24 !important;
        border-color: #333740 !important;
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-settings-dialog div[style*="background: #f8f9fa"],
      #datax-excel-selector-panel.datax-dark-mode #datax-settings-dialog div[style*="background: #fafafa"] {
        background: #262830 !important;
        border-color: #363a45 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-opacity-quick,
      #datax-excel-selector-panel.datax-dark-mode .datax-font-quick,
      #datax-excel-selector-panel.datax-dark-mode .datax-tab-btn-quick,
      #datax-excel-selector-panel.datax-dark-mode #datax-setting-reset-pos-btn {
        background: #2e313b !important;
        border-color: #444856 !important;
        color: #d1d5db !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-tab-visibility-item {
        background: #282a32 !important;
        border-color: #3f4350 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-tab-visibility-item .tab-title {
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-setting-font-preview {
        background: #282a32 !important;
        border-color: #444856 !important;
        color: #9ca3af !important;
      }
      /* 库表简易查询工作台与表格专属暗黑模式规则 */
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-query-content {
        background: #18191d !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-query-content > div {
        background: #1e1f25 !important;
        border-color: #333740 !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4) !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-query-content div[style*="background: #fafafa"] {
        background: #252831 !important;
        border-color: #333740 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-query-content .datax-novice-title,
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-query-content span[style*="color: #303133"] {
        color: #e5e7eb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-count {
        background: rgba(24, 144, 255, 0.18) !important;
        border-color: rgba(24, 144, 255, 0.4) !important;
        color: #69c0ff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container {
        background: #1e1f25 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container table {
        background: #1e1f25 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container thead tr,
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container thead th {
        background: #252831 !important;
        color: #9ca3af !important;
        border-bottom: 1px solid #333740 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container tbody tr,
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container tbody tr[style*="background"] {
        background: #1e1f25 !important;
        border-bottom: 1px solid #2b2d35 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container tbody tr.odd,
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container tbody tr:nth-child(even) {
        background: #22252c !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container tbody tr:hover,
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container tbody tr:hover td {
        background: #2a2e38 !important;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container .datax-table-name-code,
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container code {
        color: #40a9ff !important;
        background: rgba(64, 169, 255, 0.1) !important;
        border-radius: 3px;
      }
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container .datax-table-comment-text,
      #datax-excel-selector-panel.datax-dark-mode #datax-novice-table-container span[style*="color: #262626"] {
        color: #d1d5db !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-btn-view-cols {
        background: rgba(24, 144, 255, 0.15) !important;
        border-color: rgba(24, 144, 255, 0.4) !important;
        color: #40a9ff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-btn-view-cols:hover {
        background: rgba(24, 144, 255, 0.3) !important;
        color: #69c0ff !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-btn-view-data {
        background: rgba(82, 196, 26, 0.15) !important;
        border-color: rgba(82, 196, 26, 0.4) !important;
        color: #73d13d !important;
      }
      #datax-excel-selector-panel.datax-dark-mode .datax-btn-view-data:hover {
        background: rgba(82, 196, 26, 0.3) !important;
        color: #95de64 !important;
      }
      /* 子模态弹窗与浮层弹窗暗黑模式全局适配 (支持表字段、表数据、角色权限、批量用户、执行历史、批量比对/演进、DDL预览等全部弹窗) */
      .datax-sub-modal.datax-dark-mode .datax-col-dialog,
      .datax-sub-modal.datax-dark-mode .datax-data-dialog,
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog,
      .datax-sub-modal.datax-dark-mode #datax-user-batch-modal > div,
      .datax-sub-modal.datax-dark-mode #datax-st-log-dialog,
      .datax-sub-modal.datax-dark-mode #datax-api-log-dialog,
      .datax-sub-modal.datax-dark-mode #datax-batch-compare-dialog,
      .datax-sub-modal.datax-dark-mode #datax-batch-drift-dialog,
      .datax-sub-modal.datax-dark-mode #datax-sync-strategy-modal > div,
      .datax-sub-modal.datax-dark-mode #datax-drift-history-modal > div,
      .datax-sub-modal.datax-dark-mode #datax-ddl-modal > div,
      #datax-st-log-modal.datax-dark-mode #datax-st-log-dialog,
      #datax-api-log-modal.datax-dark-mode #datax-api-log-dialog,
      #datax-batch-compare-modal.datax-dark-mode #datax-batch-compare-dialog,
      #datax-batch-drift-modal.datax-dark-mode #datax-batch-drift-dialog,
      #datax-sync-strategy-modal.datax-dark-mode > div,
      #datax-drift-history-modal.datax-dark-mode > div,
      #datax-ddl-modal.datax-dark-mode > div {
        background: #1e1f25 !important;
        border: 1px solid #333740 !important;
        color: #e5e7eb !important;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6) !important;
      }
      .datax-sub-modal.datax-dark-mode div[style*="background: #fafafa"],
      .datax-sub-modal.datax-dark-mode div[style*="background: #fdfdfd"],
      .datax-sub-modal.datax-dark-mode div[style*="background: rgb(250, 250, 250)"],
      .datax-sub-modal.datax-dark-mode div[style*="background: rgb(253, 253, 253)"],
      .datax-sub-modal.datax-dark-mode div[style*="background: #f5f5f5"],
      .datax-sub-modal.datax-dark-mode div[style*="background: #f7f9fa"],
      .datax-sub-modal.datax-dark-mode div[style*="background: rgb(247, 249, 250)"],
      .datax-sub-modal.datax-dark-mode div[style*="background: #fff"],
      .datax-sub-modal.datax-dark-mode div[style*="background: rgb(255, 255, 255)"],
      div[id$="-modal"].datax-dark-mode div[style*="background: #fafafa"],
      div[id$="-modal"].datax-dark-mode div[style*="background: #f5f5f5"],
      div[id$="-modal"].datax-dark-mode div[style*="background: #f7f9fa"],
      div[id$="-modal"].datax-dark-mode div[style*="background: #fff"],
      div[id$="-modal"].datax-dark-mode div[style*="background: rgb(255, 255, 255)"],
      .datax-sub-modal.datax-dark-mode .datax-data-filter-bar,
      .datax-sub-modal.datax-dark-mode .datax-data-tools-bar,
      .datax-sub-modal.datax-dark-mode #datax-st-log-body,
      .datax-sub-modal.datax-dark-mode #datax-api-log-body,
      div[id$="-modal"].datax-dark-mode #datax-st-log-body,
      div[id$="-modal"].datax-dark-mode #datax-api-log-body {
        background: #252831 !important;
        border-color: #333740 !important;
        color: #e5e7eb !important;
      }
      /* 角色权限管理中心主体内容与卡片暗黑定制 */
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog div[style*="background: #f7f9fa"],
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog div[style*="background: rgb(247, 249, 250)"],
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog div[style*="background:#f7f9fa"] {
        background: #18191d !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog #datax-perm-tab-content-menu > div,
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog #datax-perm-tab-content-table > div {
        background: #1e1f25 !important;
        border: 1px solid #333740 !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35) !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog div[style*="border-bottom: 1px solid #f0f0f0"],
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog div[style*="border-bottom: 1px solid #e8e8e8"] {
        border-bottom-color: #333740 !important;
      }
      .datax-sub-modal.datax-dark-mode #datax-role-user-tags-box,
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog div[style*="border: 1px dashed #d9d9d9"] {
        background: #252831 !important;
        border-color: #3a3f4d !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-user-tag-item {
        background: #1b2636 !important;
        border: 1px solid #274163 !important;
        color: #69c0ff !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-remove-user-btn {
        color: #ff7875 !important;
      }
      /* 角色权限弹窗与批量弹窗按钮暗黑微调 */
      .datax-sub-modal.datax-dark-mode button[style*="background: #fff"],
      .datax-sub-modal.datax-dark-mode button[style*="background:#fff"],
      .datax-sub-modal.datax-dark-mode button[style*="background: rgb(255, 255, 255)"],
      .datax-sub-modal.datax-dark-mode #datax-perm-modal-close-btn,
      div[id$="-modal"].datax-dark-mode button[style*="background: #fff"],
      div[id$="-modal"].datax-dark-mode button[style*="background:#fff"],
      div[id$="-modal"].datax-dark-mode button[style*="background: rgb(255, 255, 255)"] {
        background: #2e313b !important;
        border-color: #444856 !important;
        color: #d1d5db !important;
      }
      .datax-sub-modal.datax-dark-mode button[style*="background: #fff"]:hover,
      .datax-sub-modal.datax-dark-mode button[style*="background:#fff"]:hover,
      .datax-sub-modal.datax-dark-mode #datax-perm-modal-close-btn:hover,
      div[id$="-modal"].datax-dark-mode button[style*="background: #fff"]:hover {
        background: #393e4d !important;
        color: #ffffff !important;
      }
      .datax-sub-modal.datax-dark-mode button[style*="background: #fff1f0"],
      .datax-sub-modal.datax-dark-mode button[style*="background: rgb(255, 241, 240)"] {
        background: rgba(245, 34, 45, 0.18) !important;
        border-color: rgba(245, 34, 45, 0.45) !important;
        color: #ff7875 !important;
      }
      .datax-sub-modal.datax-dark-mode button[style*="background: #fff1f0"]:hover {
        background: rgba(245, 34, 45, 0.35) !important;
        color: #ffa39e !important;
      }
      .datax-sub-modal.datax-dark-mode button[style*="background: #e6f7ff"],
      .datax-sub-modal.datax-dark-mode button[style*="background: rgb(230, 247, 255)"] {
        background: rgba(24, 144, 255, 0.18) !important;
        border-color: rgba(24, 144, 255, 0.45) !important;
        color: #40a9ff !important;
      }
      .datax-sub-modal.datax-dark-mode button[style*="background: #e6f7ff"]:hover {
        background: rgba(24, 144, 255, 0.35) !important;
        color: #69c0ff !important;
      }
      .datax-sub-modal.datax-dark-mode button[style*="background: #f6ffed"],
      .datax-sub-modal.datax-dark-mode button[style*="background: rgb(246, 255, 237)"] {
        background: rgba(82, 196, 26, 0.18) !important;
        border-color: rgba(82, 196, 26, 0.45) !important;
        color: #73d13d !important;
      }
      .datax-sub-modal.datax-dark-mode button[style*="background: #f6ffed"]:hover {
        background: rgba(82, 196, 26, 0.35) !important;
        color: #95de64 !important;
      }
      /* 菜单列表容器与表格暗黑重构 */
      .datax-sub-modal.datax-dark-mode #datax-menu-list-wrapper,
      .datax-sub-modal.datax-dark-mode #datax-menu-perm-table-container,
      .datax-sub-modal.datax-dark-mode #datax-perm-table-container,
      .datax-sub-modal.datax-dark-mode #datax-perm-table-list-container,
      .datax-sub-modal.datax-dark-mode #datax-user-batch-user-list {
        background: #1e1f25 !important;
        border: 1px solid #333740 !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-menu-list-row,
      .datax-sub-modal.datax-dark-mode .datax-perm-tbl-row,
      .datax-sub-modal.datax-dark-mode .datax-batch-user-row {
        background: #1e1f25 !important;
        border-bottom: 1px solid #2b2d35 !important;
        color: #d1d5db !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-menu-list-row:nth-child(even),
      .datax-sub-modal.datax-dark-mode .datax-perm-tbl-row:nth-child(even) {
        background: #22252c !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-menu-list-row:hover,
      .datax-sub-modal.datax-dark-mode .datax-perm-tbl-row:hover,
      .datax-sub-modal.datax-dark-mode .datax-batch-user-row:hover:not([data-disabled="true"]) {
        background: #2a2e38 !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-menu-list-row[style*="background: #f9f0ff"],
      .datax-sub-modal.datax-dark-mode .datax-menu-list-row[style*="background-color: #f9f0ff"],
      .datax-sub-modal.datax-dark-mode .datax-menu-list-row[style*="background: rgb(249, 240, 255)"],
      .datax-sub-modal.datax-dark-mode .datax-menu-list-row[style*="background-color: rgb(249, 240, 255)"] {
        background: rgba(114, 46, 209, 0.28) !important;
        background-color: rgba(114, 46, 209, 0.28) !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-batch-user-row[data-disabled="true"] {
        background: #22242a !important;
        color: #6b7280 !important;
        border-bottom-color: #2b2d35 !important;
      }
      /* 批量关联用户弹窗专属暗黑 */
      .datax-sub-modal.datax-dark-mode #datax-user-batch-modal > div {
        background: #1e1f25 !important;
        border: 1px solid #333740 !important;
      }
      .datax-sub-modal.datax-dark-mode #datax-user-batch-modal div[style*="background: #fafafa"],
      .datax-sub-modal.datax-dark-mode #datax-user-batch-modal div[style*="background: #fff"] {
        background: #1e1f25 !important;
        border-color: #333740 !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-data-tools-bar label {
        color: #9ca3af !important;
      }
      .datax-sub-modal.datax-dark-mode span[style*="color: #303133"],
      div[id$="-modal"].datax-dark-mode span[style*="color: #303133"],
      div[id$="-modal"].datax-dark-mode div[style*="color: #262626"] {
        color: #e5e7eb !important;
      }
      .datax-sub-modal.datax-dark-mode input[type="text"],
      .datax-sub-modal.datax-dark-mode select,
      div[id$="-modal"].datax-dark-mode input[type="text"],
      div[id$="-modal"].datax-dark-mode select {
        background: #282a32 !important;
        color: #e5e7eb !important;
        border-color: #3f4350 !important;
      }
      .datax-sub-modal.datax-dark-mode input::placeholder,
      div[id$="-modal"].datax-dark-mode input::placeholder {
        color: #6b7280 !important;
      }
      .datax-sub-modal.datax-dark-mode option,
      div[id$="-modal"].datax-dark-mode option {
        background: #282a32 !important;
        color: #e5e7eb !important;
      }
      .datax-sub-modal.datax-dark-mode table,
      div[id$="-modal"].datax-dark-mode table {
        background: #1e1f25 !important;
        color: #d1d5db !important;
      }
      .datax-sub-modal.datax-dark-mode thead th,
      .datax-sub-modal.datax-dark-mode thead tr,
      div[id$="-modal"].datax-dark-mode thead th,
      div[id$="-modal"].datax-dark-mode thead tr {
        background: #252831 !important;
        color: #9ca3af !important;
        border-color: #333740 !important;
      }
      .datax-sub-modal.datax-dark-mode tbody tr,
      .datax-sub-modal.datax-dark-mode tbody tr[style*="background"],
      div[id$="-modal"].datax-dark-mode tbody tr,
      div[id$="-modal"].datax-dark-mode tbody tr[style*="background"] {
        background: #1e1f25 !important;
        border-color: #2b2d35 !important;
      }
      .datax-sub-modal.datax-dark-mode tbody tr.odd,
      .datax-sub-modal.datax-dark-mode tbody tr:nth-child(even),
      div[id$="-modal"].datax-dark-mode tbody tr.odd,
      div[id$="-modal"].datax-dark-mode tbody tr:nth-child(even) {
        background: #22252c !important;
      }
      .datax-sub-modal.datax-dark-mode tbody tr:hover,
      .datax-sub-modal.datax-dark-mode tbody tr:hover td,
      div[id$="-modal"].datax-dark-mode tbody tr:hover,
      div[id$="-modal"].datax-dark-mode tbody tr:hover td {
        background: #2a2e38 !important;
      }
      .datax-sub-modal.datax-dark-mode td,
      div[id$="-modal"].datax-dark-mode td {
        border-color: #2b2d35 !important;
        color: #d1d5db !important;
      }
      .datax-sub-modal.datax-dark-mode #datax-data-table-container,
      .datax-sub-modal.datax-dark-mode #datax-col-table-container,
      div[id$="-modal"].datax-dark-mode div[style*="background:#fff"][style*="overflow:auto"],
      div[id$="-modal"].datax-dark-mode div[style*="background: #fff"][style*="overflow:auto"] {
        background: #1e1f25 !important;
        border-color: #333740 !important;
      }
      .datax-sub-modal.datax-dark-mode code,
      .datax-sub-modal.datax-dark-mode .datax-col-name,
      div[id$="-modal"].datax-dark-mode code {
        color: #40a9ff !important;
      }
      .datax-sub-modal.datax-dark-mode textarea,
      div[id$="-modal"].datax-dark-mode textarea {
        background: #23252d !important;
        color: #e5e7eb !important;
        border-color: #3f4350 !important;
      }
      .datax-sub-modal.datax-dark-mode button[id$="-cancel"],
      .datax-sub-modal.datax-dark-mode button[id$="-cancel-btn"],
      .datax-sub-modal.datax-dark-mode button[id$="-reset-btn"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-reset"],
      .datax-sub-modal.datax-dark-mode button[id$="-prev-page"],
      .datax-sub-modal.datax-dark-mode button[id$="-next-page"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-first"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-prev"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-jump"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-next"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-refresh"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-format-json"],
      .datax-sub-modal.datax-dark-mode button[id$="-btn-compress-json"],
      div[id$="-modal"].datax-dark-mode button[id$="-cancel"],
      div[id$="-modal"].datax-dark-mode button[id$="-btn-cancel"],
      div[id$="-modal"].datax-dark-mode button[id$="-prev-page"],
      div[id$="-modal"].datax-dark-mode button[id$="-next-page"] {
        background: #2e313b !important;
        border-color: #444856 !important;
        color: #d1d5db !important;
      }
      .datax-sub-modal.datax-dark-mode button[id$="-cancel"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-cancel-btn"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-reset-btn"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-reset"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-prev-page"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-next-page"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-first"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-prev"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-jump"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-next"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-refresh"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-format-json"]:hover,
      .datax-sub-modal.datax-dark-mode button[id$="-btn-compress-json"]:hover,
      div[id$="-modal"].datax-dark-mode button[id$="-cancel"]:hover,
      div[id$="-modal"].datax-dark-mode button[id$="-btn-cancel"]:hover,
      div[id$="-modal"].datax-dark-mode button[id$="-prev-page"]:hover,
      div[id$="-modal"].datax-dark-mode button[id$="-next-page"]:hover {
        background: #393e4d !important;
        color: #fff !important;
      }
      /* 暗黑模式下全局提升紫调文字与边框对比度 (#722ed1 ➔ #b37feb)，彻底杜绝黑底紫字辨识度差 */
      #datax-excel-selector-panel.datax-dark-mode [style*="color: #722ed1"],
      #datax-excel-selector-panel.datax-dark-mode [style*="color: rgb(114, 46, 209)"],
      #datax-excel-selector-panel.datax-dark-mode [style*="color:#722ed1"],
      .datax-sub-modal.datax-dark-mode [style*="color: #722ed1"],
      .datax-sub-modal.datax-dark-mode [style*="color: rgb(114, 46, 209)"],
      .datax-sub-modal.datax-dark-mode [style*="color:#722ed1"],
      div[id$="-modal"].datax-dark-mode [style*="color: #722ed1"],
      div[id$="-modal"].datax-dark-mode [style*="color: rgb(114, 46, 209)"],
      div[id$="-modal"].datax-dark-mode [style*="color:#722ed1"] {
        color: #b37feb !important;
      }
      #datax-excel-selector-panel.datax-dark-mode [style*="border-bottom: 2px solid #722ed1"],
      #datax-excel-selector-panel.datax-dark-mode [style*="border-bottom-color: #722ed1"],
      .datax-sub-modal.datax-dark-mode [style*="border-bottom: 2px solid #722ed1"],
      .datax-sub-modal.datax-dark-mode [style*="border-bottom-color: #722ed1"],
      div[id$="-modal"].datax-dark-mode [style*="border-bottom: 2px solid #722ed1"],
      div[id$="-modal"].datax-dark-mode [style*="border-bottom-color: #722ed1"] {
        border-bottom-color: #b37feb !important;
      }
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog > div[style*="background: #fafafa"],
      .datax-sub-modal.datax-dark-mode .datax-perm-dialog > div[style*="background:#fafafa"] {
        background: #1e1f25 !important;
        border-color: #333740 !important;
      }
      /* 亮色模式默认表格条纹效果 */
      #datax-novice-table-container tbody tr.even,
      .datax-col-dialog tbody tr.even,
      .datax-data-dialog tbody tr.even {
        background: #ffffff;
      }
      #datax-novice-table-container tbody tr.odd,
      .datax-col-dialog tbody tr.odd,
      .datax-data-dialog tbody tr.odd {
        background: #fafcff;
      }
      #datax-novice-table-container tbody tr:hover,
      .datax-col-dialog tbody tr:hover,
      .datax-data-dialog tbody tr:hover {
        background: #f0f7ff;
      }
      #datax-excel-selector-panel.datax-dark-mode ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      #datax-excel-selector-panel.datax-dark-mode ::-webkit-scrollbar-track {
        background: #18191d;
      }
      #datax-excel-selector-panel.datax-dark-mode ::-webkit-scrollbar-thumb {
        background: #393e4d;
        border-radius: 3px;
      }
      #datax-excel-selector-panel.datax-dark-mode ::-webkit-scrollbar-thumb:hover {
        background: #4d5366;
      }
    `;
    document.head.appendChild(styleEl);
  }

  /**
   * 通用 DDL / 代码 / 长文本预览模态弹窗
   *
   * @param {string} title 弹窗标题
   * @param {string} content 展示文本/DDL
   */
  function showDdlModal(title, content) {
    const existing = document.getElementById('datax-ddl-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'datax-ddl-modal';
    modal.className = 'datax-sub-modal' + (isDarkMode() ? ' datax-dark-mode' : '');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000025;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:650px;max-width:92vw;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 8px 24px rgba(0,0,0,0.2);">
        <div style="padding:12px 16px;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:14px;color:#303133;">[${safeEscapeHtml(title)}] 详情预览</strong>
          <span id="datax-ddl-close" style="cursor:pointer;font-size:18px;color:#909399;font-weight:bold;">&times;</span>
        </div>
        <div style="padding:16px;flex:1;overflow:auto;">
          <textarea readonly style="width:100%;box-sizing:border-box;height:260px;padding:10px;font-family:Consolas, Monaco, monospace;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;background:#f8f9fa;line-height:1.5;">${safeEscapeHtml(content)}</textarea>
        </div>
        <div style="padding:10px 16px;border-top:1px solid #e8e8e8;display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" id="datax-ddl-copy-btn" style="background:#1890ff;color:#fff;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;">复制内容</button>
          <button type="button" id="datax-ddl-cancel-btn" style="background:#fff;border:1px solid #d9d9d9;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 子窗口关闭与事件注销公共方法
    const closeModal = () => {
      window.removeEventListener('keydown', onModalKeyDown, true);
      modal.remove();
    };

    // 捕获阶段监听 Esc 键，仅关闭当前弹窗并阻断冒泡，杜绝误关闭助手主面板
    const onModalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    };
    window.addEventListener('keydown', onModalKeyDown, true);

    const closeBtn = document.getElementById('datax-ddl-close');
    if (closeBtn) closeBtn.onclick = closeModal;
    const cancelBtn = document.getElementById('datax-ddl-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = closeModal;
    const copyBtn = document.getElementById('datax-ddl-copy-btn');
    if (copyBtn) {
      copyBtn.onclick = async function () {
        const ok = await copyToClipboard(content);
        if (ok) {
          toast('已成功复制到剪贴板！');
        } else {
          alert('当前浏览器环境不支持自动复制，请手动选中文本进行复制');
        }
      };
    }
  }

  /**
   * 通用复制文本到剪贴板公共方法
   * 优先调用系统级 DataXCommon，兼顾现代安全上下文与内网非安全上下文的降级兼容
   *
   * @param {string} text 待复制文本内容
   * @return {Promise<boolean>} 是否复制成功
   */
  async function copyToClipboard(text) {
    if (text === undefined || text === null) {
      return false;
    }
    const val = String(text);

    // 1. 优先调用系统级 DataXCommon 封装的方法
    if (window.DataXCommon && window.DataXCommon.Utils && typeof window.DataXCommon.Utils.copyToClipboard === 'function') {
      try {
        const ok = await window.DataXCommon.Utils.copyToClipboard(val);
        if (ok) return true;
      } catch (e) {
        // 静默捕获，继续尝试内部兜底
      }
    }

    // 2. 现代浏览器 Clipboard API（要求 HTTPS 或 localhost 处于安全上下文）
    if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(val);
        return true;
      } catch (e) {
        // 用户拒绝权限或处于 iframe 非焦点等情况，继续走 textarea 降级
      }
    }

    // 3. 通用 DOM 选区降级兜底方案（完全兼容 HTTP / 局域网 IP / 旧版浏览器）
    try {
      const ta = document.createElement('textarea');
      ta.value = val;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const success = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!success;
    } catch (err) {
      return false;
    }
  }

  window.DataXAssistant.showDdlModal = showDdlModal;
  window.DataXAssistant.DomBuilder = {
    getStorageItem,
    setStorageItem,
    safeEscapeHtml,
    alert,
    confirm,
    toast,
    copyToClipboard,
    showDdlModal,
    ensureEnhancedStyles
  };
})();

