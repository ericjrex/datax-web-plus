/**
 * @fileoverview Tab 8: 三方开放 API 账号管理与全链路调用审计 (Tab8OpenApi)
 * 提供可配置化的三方 API 账号管理、多数据源库绑定、交互式表列表勾选授权、以及调用日志多维检索与明细透视功能。
 *
 * @author ypc
 * @since 2026-10-28
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};
  window.DataXAssistant.Tabs = window.DataXAssistant.Tabs || {};

  function alert(msg) {
    if (window.DataXCommon && window.DataXCommon.Notice && window.DataXCommon.Notice.alert) {
      return window.DataXCommon.Notice.alert(msg);
    }
    window.alert(msg);
  }

  function confirm(content, options = {}) {
    if (window.DataXCommon && window.DataXCommon.Notice && window.DataXCommon.Notice.confirm) {
      return window.DataXCommon.Notice.confirm(content, options);
    }
    return Promise.resolve(window.confirm(content));
  }

  function toast(text, duration = 2500) {
    if (window.DataXCommon && window.DataXCommon.Notice && window.DataXCommon.Notice.toast) {
      window.DataXCommon.Notice.toast(text, duration);
      return;
    }
    console.log('[Toast]', text);
  }

  function safeEscapeHtml(str) {
    if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.safeEscapeHtml) {
      return window.DataXCommon.Utils.safeEscapeHtml(str);
    }
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getAuthHeaders(customHeaders = {}) {
    const headers = Object.assign({
      'Content-Type': 'application/json'
    }, customHeaders);
    const token = (window.DataXCommon && window.DataXCommon.Http && window.DataXCommon.Http.getAuthToken)
      ? window.DataXCommon.Http.getAuthToken()
      : (localStorage.getItem('datax_assistant_token') || localStorage.getItem('token') || '');
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
    return headers;
  }

  function copyText(text, successMsg) {
    const msg = successMsg || '已复制到剪贴板';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast(msg);
      }).catch(() => fallbackCopy(text, msg));
    } else {
      fallbackCopy(text, msg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const msg = successMsg || '已复制到剪贴板';
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(msg);
    } catch (e) {
      alert('复制失败，请手动选中文本复制');
    }
    document.body.removeChild(ta);
  }

  /**
   * 生成时间戳字符串 (YYYYMMDD_HHmmss)
   */
  function getTimestampString() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /**
   * 动态加载 SheetJS 导出库 (复用全局或多级降级安全调度)
   */
  function loadSheetJs(callback) {
    if (window.DataXCommon && window.DataXCommon.Utils && typeof window.DataXCommon.Utils.loadSheetJs === 'function') {
      return window.DataXCommon.Utils.loadSheetJs(callback);
    }
    if (window.DataXAssistant && typeof window.DataXAssistant.loadSheetJs === 'function') {
      return window.DataXAssistant.loadSheetJs(callback);
    }
    if (window.XLSX) {
      return callback(window.XLSX);
    }
    const cdnUrls = [
      '/static/js/lib/xlsx.full.min.js',
      'static/js/lib/xlsx.full.min.js',
      'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://unpkg.com/xlsx/dist/xlsx.full.min.js'
    ];
    let idx = 0;
    const next = () => {
      if (idx >= cdnUrls.length) {
        callback(null);
        return;
      }
      const script = document.createElement('script');
      script.src = cdnUrls[idx++];
      script.onload = () => (window.XLSX ? callback(window.XLSX) : next());
      script.onerror = () => next();
      document.head.appendChild(script);
    };
    next();
  }

  /**
   * 纯前端原生零依赖 CSV 兜底导出引擎 (带 UTF-8 BOM，防止 Windows Excel 打开乱码)
   */
  function exportToCsvFallback(headers, rowsData, fileName) {
    try {
      const escapeCsvCell = (val) => {
        if (val === null || val === undefined) return '""';
        let str = String(val);
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
          str = str.replace(/"/g, '""');
          return `"${str}"`;
        }
        return `"${str}"`;
      };

      const csvLines = [];
      csvLines.push(headers.map(escapeCsvCell).join(','));
      rowsData.forEach(row => {
        csvLines.push(row.map(escapeCsvCell).join(','));
      });

      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const safeName = fileName.replace(/\.xlsx$/i, '.csv');

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', safeName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast(`已成功导出 ${rowsData.length} 条记录至 [${safeName}]！`);
    } catch (err) {
      alert('导出失败: ' + err.message);
    }
  }

  /**
   * 通用可拖拽与 8 方向全向缩放模态弹窗构建器 (统一复用 PanelWindowManager)
   * 严格遵循 UI 规范与 Emoji 白名单，支持：
   * 1. 顶部标题栏按住鼠标拖拽移动，双击标题栏最大化 / 还原；
   * 2. 右上角最大化按钮 (▢) 与关闭按钮 (×)；
   * 3. 八个方向的调整手柄 (n, s, w, e, nw, ne, sw, se) 全向平滑拖拉拉伸；
   * 4. 记住上次拖拽移动与拉伸后的尺寸与位置 (localStorage 持久化)；
   * 5. ESC 按键快速关闭与资源安全销毁 (PanelWindowManager.destroy())。
   *
   * @param {Object} options
   * @param {string} options.modalId 弹窗唯一 ID
   * @param {string} options.dialogId 弹窗对话框主容器 ID
   * @param {string} options.title 弹窗标题文本 (严格纯文本，严禁随意添加 Emoji)
   * @param {number} [options.width=780] 初始推荐宽度
   * @param {number} [options.height=600] 初始推荐高度
   * @param {number} [options.minWidth=500] 最小宽度限制
   * @param {number} [options.minHeight=350] 最小高度限制
   * @param {string} [options.storageKeyPrefix='datax_oa'] 位置与尺寸存储键前缀
   * @param {string} [options.extraHeaderHtml=''] 头部右侧额外控制区 HTML
   * @param {string} [options.bodyHtml=''] 主体滚动区域 HTML
   * @param {string} [options.footerHtml=''] 底部操作栏 HTML
   * @param {number} [options.zIndex=1000025] 浮层层级 (默认位于主工作台之上的 1000025)
   * @param {Function} [options.onClose] 关闭弹窗时的回调钩子
   * @return {{ modalEl: HTMLElement, dialogEl: HTMLElement, headerEl: HTMLElement, bodyEl: HTMLElement, footerEl: HTMLElement, maxBtn: HTMLElement, closeBtn: HTMLElement, close: Function, windowManager: Object }}
   */
  function createDraggableModal(options) {
    const {
      modalId,
      dialogId,
      title = '',
      width = 780,
      height = 600,
      minWidth = 500,
      minHeight = 350,
      storageKeyPrefix = 'datax_oa',
      extraHeaderHtml = '',
      bodyHtml = '',
      footerHtml = '',
      zIndex = 1000025,
      onClose = null
    } = options;

    // 清理可能已存在的旧弹窗 DOM 及未销毁的事件监听，确保全生命周期干净
    const existing = document.getElementById(modalId);
    if (existing) {
      if (existing._wm && typeof existing._wm.destroy === 'function') {
        existing._wm.destroy();
      }
      existing.remove();
    }

    const modalEl = document.createElement('div');
    modalEl.id = modalId;
    modalEl.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
    modalEl.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.48); z-index: ${zIndex}; backdrop-filter: blur(2px);`;

    const headerId = `${dialogId}-header`;
    const maxBtnId = `${dialogId}-max`;
    const closeBtnId = `${dialogId}-close`;
    const bodyId = `${dialogId}-body`;
    const footerId = `${dialogId}-footer`;

    modalEl.innerHTML = `
      <!-- 统一可拖拽与 8 向缩放对话框容器 -->
      <div id="${dialogId}" style="background: #fff; border-radius: 8px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28), 0 6px 16px rgba(0, 0, 0, 0.12); display: flex; flex-direction: column; overflow: hidden; position: absolute; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;">
        <!-- 窗口头部：统一蓝色渐变，拖拽移动 + 双击最大化/还原 (标题严格无无意义 Emoji) -->
        <div id="${headerId}" title="按住鼠标左键可自由拖动，双击最大化/还原" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; border-radius: 8px 8px 0 0; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <strong style="font-size: 14px;">${safeEscapeHtml(title)}</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${extraHeaderHtml}
            <span id="${maxBtnId}" data-window-ctrl title="最大化 / 还原" style="font-size: 15px; line-height: 1; padding: 0 3px; cursor: pointer; opacity: 0.9; user-select: none;">&#x25A2;</span>
            <span id="${closeBtnId}" data-window-ctrl title="关闭 (Esc)" style="font-size: 20px; line-height: 1; padding: 0 4px; cursor: pointer; opacity: 0.9; user-select: none;">&times;</span>
          </div>
        </div>
        <!-- 弹窗内容主体滚动区域 -->
        <div id="${bodyId}" style="flex: 1; overflow-y: auto; padding: 0; box-sizing: border-box; background: #fff; display: flex; flex-direction: column; min-height: 0;">
          ${bodyHtml}
        </div>
        <!-- 底部固定操作栏 -->
        ${footerHtml ? `<div id="${footerId}" style="flex-shrink: 0;">${footerHtml}</div>` : ''}
      </div>
    `;

    document.body.appendChild(modalEl);

    const dialogEl = modalEl.querySelector(`#${dialogId}`);
    const headerEl = modalEl.querySelector(`#${headerId}`);
    const bodyEl = modalEl.querySelector(`#${bodyId}`);
    const footerEl = footerHtml ? modalEl.querySelector(`#${footerId}`) : null;
    const maxBtn = modalEl.querySelector(`#${maxBtnId}`);
    const closeBtn = modalEl.querySelector(`#${closeBtnId}`);

    // 计算视口居中初始尺寸与居中位置 (若 localStorage 已持久化，则由 PanelWindowManager 自动恢复覆盖)
    const initW = Math.min(window.innerWidth - 30, Math.max(minWidth, width));
    const initH = Math.min(window.innerHeight - 30, Math.max(minHeight, height));
    dialogEl.style.width = `${initW}px`;
    dialogEl.style.height = `${initH}px`;
    dialogEl.style.left = `${Math.max(10, Math.round((window.innerWidth - initW) / 2))}px`;
    dialogEl.style.top = `${Math.max(10, Math.round((window.innerHeight - initH) / 2))}px`;

    // 挂载 8 方向全向缩放手柄 (复用全局注入的 .datax-resize-handle 样式)
    ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `datax-resize-handle datax-resize-${dir}`;
      handle.setAttribute('data-dir', dir);
      handle.title = (dir === 'se') ? '按住拖动调整窗口尺寸' : '调整窗口尺寸';
      dialogEl.appendChild(handle);
    });

    // 复用统一窗口管理器 PanelWindowManager 实现平滑拖拽移动、8 向缩放与记忆
    let windowManager = null;
    if (window.DataXAssistant && window.DataXAssistant.PanelWindowManager) {
      windowManager = new window.DataXAssistant.PanelWindowManager(
        dialogEl,
        headerEl,
        {
          maxBtn: maxBtn,
          minWidth: minWidth,
          minHeight: minHeight,
          storageKeyPos: `${storageKeyPrefix}_pos`,
          storageKeySize: `${storageKeyPrefix}_size`
        }
      );
    }
    modalEl._wm = windowManager;

    // 关闭逻辑与 ESC 快捷键监听及安全注销
    let isClosed = false;
    const close = () => {
      if (isClosed) return;
      isClosed = true;
      modalEl.remove();
      if (windowManager && typeof windowManager.destroy === 'function') {
        windowManager.destroy();
      }
      document.removeEventListener('keydown', handleKeydown);
      if (typeof onClose === 'function') {
        onClose();
      }
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        close();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    closeBtn.onclick = close;

    return {
      modalEl,
      dialogEl,
      headerEl,
      bodyEl,
      footerEl,
      maxBtn,
      closeBtn,
      close,
      windowManager
    };
  }

  /**
   * 拆分逗号分隔词条列表
   */
  function parseCsvTokens(raw, toLower) {
    return String(raw || '')
      .split(/[,，]/)
      .map(s => (toLower ? s.trim().toLowerCase() : s.trim()))
      .filter(Boolean);
  }

  /**
   * 标准化单个数据源配置下的行级字段过滤规则列表 (兼容旧版单租户字段)
   */
  function normalizeClientRowRules(p) {
    if (!p || typeof p !== 'object') {
      return [];
    }
    if (Array.isArray(p.rowFilterRules) && p.rowFilterRules.length > 0) {
      return p.rowFilterRules
        .filter(r => r && typeof r === 'object')
        .map(r => ({
          column: r.column ? String(r.column).trim() : '',
          values: Array.isArray(r.values) ? r.values.map(s => String(s).trim()).filter(Boolean) : [],
          matchMode: String(r.matchMode || 'AUTO_BY_COLUMN').trim().toUpperCase() === 'STRICT_TABLES'
            ? 'STRICT_TABLES'
            : 'AUTO_BY_COLUMN',
          tables: Array.isArray(r.tables) ? r.tables.map(s => String(s).trim().toLowerCase()).filter(Boolean) : [],
          excludeTables: Array.isArray(r.excludeTables) ? r.excludeTables.map(s => String(s).trim().toLowerCase()).filter(Boolean) : []
        }));
    }
    if (p.tenantIsolationEnabled) {
      return [{
        column: (p.tenantColumn && String(p.tenantColumn).trim()) ? String(p.tenantColumn).trim() : 'tenant_id',
        values: Array.isArray(p.tenantValues) ? p.tenantValues.map(s => String(s).trim()).filter(Boolean) : [],
        matchMode: 'STRICT_TABLES',
        tables: [],
        excludeTables: Array.isArray(p.tenantExemptTables) ? p.tenantExemptTables.map(s => String(s).trim().toLowerCase()).filter(Boolean) : []
      }];
    }
    return [];
  }

  /**
   * 解析账号多数据源库表权限配置（兼容新版 permissions JSON 与旧版单库字段）
   * @param {Object} account 账号对象
   * @param {Array} datasources 当前可用数据源列表
   * @return {Array<{datasourceId: number, datasourceName: string, allTables: boolean, tables: Set<string>, rowFilterRules: Array}>}
   */
  function parseAccountAuthList(account, datasources = []) {
    const authList = [];
    if (!account) return authList;

    if (account.permissions) {
      try {
        const parsed = JSON.parse(account.permissions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach(p => {
            const dsId = Number(p.datasourceId);
            const dsObj = datasources.find(d => Number(d.id) === dsId);
            authList.push({
              datasourceId: dsId,
              datasourceName: p.datasourceName || (dsObj ? dsObj.datasourceName : `库${p.datasourceId}`),
              allTables: Boolean(p.allTables),
              tables: new Set(Array.isArray(p.tables) ? p.tables.map(s => String(s).trim().toLowerCase()).filter(Boolean) : []),
              rowFilterRules: normalizeClientRowRules(p)
            });
          });
          return authList;
        }
      } catch (e) { }
    }

    if (account.datasourceId) {
      const dsId = Number(account.datasourceId);
      const dsObj = datasources.find(d => Number(d.id) === dsId);
      const all = account.allowedTables === '*' || !account.allowedTables;
      const set = all ? new Set() : new Set((account.allowedTables || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
      authList.push({
        datasourceId: dsId,
        datasourceName: dsObj ? dsObj.datasourceName : `库${account.datasourceId}`,
        allTables: all,
        tables: set,
        rowFilterRules: []
      });
    }
    return authList;
  }

  /**
   * 格式化账号权限摘要
   */
  function formatPermissionsSummary(item) {
    if (item.permissions) {
      try {
        const parsed = JSON.parse(item.permissions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(p => {
            const dsName = p.datasourceName || `库${p.datasourceId}`;
            const detail = p.allTables ? '全部表' : `${(p.tables || []).length}张表`;
            const rules = normalizeClientRowRules(p);
            let filterTag = '';
            if (rules.length > 0) {
              const ruleText = rules
                .map(r => `${r.column || '?'}=${(r.values || []).join('/') || '?'}`)
                .join(', ');
              filterTag = ` | 过滤: ${ruleText}`;
            }
            return `${dsName}(${detail}${filterTag})`;
          }).join('; ');
        }
      } catch (e) { }
    }
    const dsName = item.datasourceId ? `库${item.datasourceId}` : '未绑定';
    const tbls = item.allowedTables === '*' ? '全部表' : (item.allowedTables || '未授权');
    return `${dsName}(${tbls})`;
  }

  class Tab8OpenApi {
    constructor(container) {
      this.container = container;
      this.currentSubTab = 'account'; // 'account' | 'log' | 'blacklist'
      this.datasources = [];
      this.accountPageNo = 1;
      this.accountPageSize = 10;
      this.accountTotalPages = 1;
      this.logPageNo = 1;
      this.logPageSize = 20;
      this.logTotalPages = 1;
      this.blacklistPageNo = 1;
      this.blacklistPageSize = 20;
      this.blacklistTotalPages = 1;
      this.activeBlacklistRules = []; // 生效中的黑名单规则缓存
      this.currentAdminIp = '';
      this.selectedLogIds = new Set(); // 当前页已选中的日志 ID 集合
      this.currentLogRecords = []; // 当前页日志数据缓存
      this.logMarqueeInstance = null;
      this.accountMap = {}; // appKey -> accountName 字典缓存
      this.tableCache = {}; // dsId -> [{tableName, tableComment}]
    }

    init() {
      this.renderSkeleton();
      this.bindEvents();
      this.loadDatasources();
      this.loadAccounts();
      this.loadActiveBlacklistRules();
    }

    renderSkeleton() {
      this.container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; box-sizing: border-box; background: #fff;">
          <!-- 顶部子选项卡切换栏 -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e8e8e8; background: #fafafa; padding: 0 16px;">
            <div style="display: flex; gap: 4px;">
              <button type="button" id="datax-openapi-subtab-acc" class="datax-openapi-subtab-btn" style="padding: 10px 16px; border: none; background: transparent; color: #1890ff; font-weight: 600; cursor: pointer; border-bottom: 2px solid #1890ff; font-size: 13px;">
                API 账号管理
              </button>
              <button type="button" id="datax-openapi-subtab-log" class="datax-openapi-subtab-btn" style="padding: 10px 16px; border: none; background: transparent; color: #595959; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 13px;">
                调用日志审计
              </button>
              <button type="button" id="datax-openapi-subtab-blacklist" class="datax-openapi-subtab-btn" style="padding: 10px 16px; border: none; background: transparent; color: #595959; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 13px;">
                IP 黑名单 <span id="datax-openapi-blacklist-count-badge" style="display: none; background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; padding: 0 6px; border-radius: 10px; font-size: 11px; font-weight: 600; margin-left: 4px;">0</span>
              </button>
            </div>
            <div style="font-size: 12px; color: #8c8c8c; display: flex; align-items: center; gap: 10px;">
              <span>仅管理员可分配接口密钥与审计全量 SQL</span>
              <button type="button" id="datax-openapi-doc-btn" style="padding: 4px 12px; background: #fff; border: 1px solid #1890ff; color: #1890ff; border-radius: 4px; font-size: 12px; cursor: pointer;">API 说明</button>
            </div>
          </div>

          <!-- 子面板 1: API 账号管理 -->
          <div id="datax-openapi-panel-acc" style="display: flex; flex-direction: column; flex: 1; padding: 14px; overflow: hidden;">
            <!-- 顶部筛选与操作栏 -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" id="datax-openapi-acc-keyword" placeholder="🔍 检索账号名称或 AppKey" style="width: 220px; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <select id="datax-openapi-acc-status" style="padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; background: #fff;">
                  <option value="">全部状态</option>
                  <option value="1">启用</option>
                  <option value="0">停用</option>
                </select>
                <button type="button" id="datax-openapi-acc-search-btn" style="padding: 6px 14px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🔍 查询</button>
              </div>
              <button type="button" id="datax-openapi-acc-add-btn" style="padding: 6px 16px; background: #52c41a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">➕ 新增账号</button>
            </div>

            <!-- 账号表格 -->
            <div style="flex: 1; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 4px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <thead style="background: #fafafa; border-bottom: 1px solid #e8e8e8; position: sticky; top: 0; z-index: 1;">
                  <tr>
                    <th style="padding: 8px 10px; width: 50px;">ID</th>
                    <th style="padding: 8px 10px; width: 140px;">账号名称</th>
                    <th style="padding: 8px 10px; width: 160px;">AppKey</th>
                    <th style="padding: 8px 10px;">已授权数据源与表</th>
                    <th style="padding: 8px 10px; width: 60px;">QPS</th>
                    <th style="padding: 8px 10px; width: 70px;">状态</th>
                    <th style="padding: 8px 10px; width: 180px; text-align: center;">操作</th>
                  </tr>
                </thead>
                <tbody id="datax-openapi-acc-tbody">
                  <tr><td colspan="7" style="text-align: center; padding: 20px; color: #8c8c8c;">正在加载数据...</td></tr>
                </tbody>
              </table>
            </div>

            <!-- 分页条 -->
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 8px; font-size: 12px;">
              <span id="datax-openapi-acc-total" style="color: #8c8c8c;">共 0 条</span>
              <button type="button" id="datax-openapi-acc-prev-btn" disabled style="padding: 3px 8px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; opacity: 0.5; cursor: not-allowed;">上一页</button>
              <span id="datax-openapi-acc-page-indicator">第 1 / 1 页</span>
              <button type="button" id="datax-openapi-acc-next-btn" disabled style="padding: 3px 8px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; opacity: 0.5; cursor: not-allowed;">下一页</button>
            </div>
          </div>

          <!-- 子面板 2: 调用日志审计 -->
          <div id="datax-openapi-panel-log" style="display: none; flex-direction: column; flex: 1; padding: 14px; overflow: hidden;">
            <!-- 筛选栏 -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                <input type="text" id="datax-openapi-log-appkey" placeholder="筛选 AppKey" style="width: 135px; padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <input type="text" id="datax-openapi-log-clientip" placeholder="筛选客户端IP" style="width: 120px; padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <input type="text" id="datax-openapi-log-clientsource" placeholder="筛选终端/AI工具 (如 Trae/Chrome)" style="width: 185px; padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <select id="datax-openapi-log-status" style="padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; background: #fff;">
                  <option value="">全部执行状态</option>
                  <option value="1">成功</option>
                  <option value="2">安全拦截</option>
                  <option value="0">执行失败</option>
                </select>
                <input type="date" id="datax-openapi-log-start" style="padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <span style="color: #8c8c8c;">至</span>
                <input type="date" id="datax-openapi-log-end" style="padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <button type="button" id="datax-openapi-log-search-btn" style="padding: 5px 14px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🔍 检索</button>
              </div>
              <div style="display: flex; gap: 6px; align-items: center;">
                <button type="button" id="datax-openapi-log-batch-block-btn" title="将已勾选日志对应的客户端 IP 批量加入黑名单" style="padding: 5px 12px; background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">批量拉黑选中IP</button>
                <button type="button" id="datax-openapi-log-export-btn" style="padding: 5px 14px; background: #52c41a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">导出 Excel</button>
              </div>
            </div>

            <!-- 日志表格 (支持复选框、Shift连续选与矩形框选) -->
            <div id="datax-openapi-log-table-wrap" style="flex: 1; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 4px; position: relative; user-select: none;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <thead style="background: #fafafa; border-bottom: 1px solid #e8e8e8; position: sticky; top: 0; z-index: 1;">
                  <tr>
                    <th style="padding: 8px 6px; width: 32px; text-align: center;">
                      <input type="checkbox" id="datax-openapi-log-check-all" title="全选/取消全选当前页日志" style="cursor: pointer;" />
                    </th>
                    <th style="padding: 8px 10px; width: 140px;">调用时间</th>
                    <th style="padding: 8px 10px; min-width: 175px;">调用账号 / AppKey</th>
                    <th style="padding: 8px 10px; width: 140px;">客户端IP</th>
                    <th style="padding: 8px 10px; width: 135px;">调用终端 / AI工具</th>
                    <th style="padding: 8px 10px;">涉及表名</th>
                    <th style="padding: 8px 10px; width: 68px;">返回条数</th>
                    <th style="padding: 8px 10px; width: 68px;">耗时</th>
                    <th style="padding: 8px 10px; width: 75px;">状态</th>
                    <th style="padding: 8px 10px; width: 125px; text-align: center;">操作</th>
                  </tr>
                </thead>
                <tbody id="datax-openapi-log-tbody">
                  <tr><td colspan="10" style="text-align: center; padding: 20px; color: #8c8c8c;">正在加载日志...</td></tr>
                </tbody>
              </table>
            </div>

            <!-- 分页条 -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; font-size: 12px;">
              <span id="datax-openapi-log-selected-hint" style="color: #8c8c8c; font-size: 11px;">支持勾选或按住鼠标左键矩形框选多条日志一键加入 IP 黑名单</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="datax-openapi-log-total" style="color: #8c8c8c;">共 0 条</span>
                <select id="datax-openapi-log-pagesize" style="padding: 3px 6px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; color: #595959; cursor: pointer; outline: none;">
                  <option value="20" selected>20 条/页</option>
                  <option value="50">50 条/页</option>
                  <option value="100">100 条/页</option>
                  <option value="300">300 条/页</option>
                  <option value="500">500 条/页</option>
                </select>
                <button type="button" id="datax-openapi-log-prev-btn" disabled style="padding: 3px 8px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; opacity: 0.5; cursor: not-allowed;">上一页</button>
                <span id="datax-openapi-log-page-indicator">第 1 / 1 页</span>
                <button type="button" id="datax-openapi-log-next-btn" disabled style="padding: 3px 8px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; opacity: 0.5; cursor: not-allowed;">下一页</button>
              </div>
            </div>
          </div>

          <!-- 子面板 3: IP 黑名单管控 -->
          <div id="datax-openapi-panel-blacklist" style="display: none; flex-direction: column; flex: 1; padding: 14px; overflow: hidden;">
            <!-- 顶部筛选与操作栏 -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <input type="text" id="datax-openapi-bl-keyword" placeholder="🔍 检索封禁 IP 或原因备注" style="width: 210px; padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <input type="text" id="datax-openapi-bl-appkey" placeholder="筛选 AppKey (或 *)" style="width: 150px; padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
                <select id="datax-openapi-bl-status" style="padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; background: #fff;">
                  <option value="">全部状态</option>
                  <option value="1">生效中 (拦截)</option>
                  <option value="0">已解封</option>
                </select>
                <button type="button" id="datax-openapi-bl-search-btn" style="padding: 5px 14px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🔍 查询</button>
              </div>
              <button type="button" id="datax-openapi-bl-add-btn" style="padding: 5px 14px; background: #f5222d; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">➕ 新增黑名单IP</button>
            </div>

            <!-- 黑名单表格 -->
            <div style="flex: 1; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 4px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <thead style="background: #fafafa; border-bottom: 1px solid #e8e8e8; position: sticky; top: 0; z-index: 1;">
                  <tr>
                    <th style="padding: 8px 10px; width: 50px;">ID</th>
                    <th style="padding: 8px 10px; width: 150px;">被封禁客户端 IP</th>
                    <th style="padding: 8px 10px; width: 200px;">封禁作用范围 (账号 / AppKey)</th>
                    <th style="padding: 8px 10px;">封禁原因与拦截备注</th>
                    <th style="padding: 8px 10px; width: 90px;">关联源日志</th>
                    <th style="padding: 8px 10px; width: 90px;">状态</th>
                    <th style="padding: 8px 10px; width: 140px;">更新时间</th>
                    <th style="padding: 8px 10px; width: 150px; text-align: center;">操作</th>
                  </tr>
                </thead>
                <tbody id="datax-openapi-bl-tbody">
                  <tr><td colspan="8" style="text-align: center; padding: 20px; color: #8c8c8c;">正在加载黑名单数据...</td></tr>
                </tbody>
              </table>
            </div>

            <!-- 黑名单分页条 -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; font-size: 12px;">
              <span style="color: #8c8c8c; font-size: 11px;">安全准则：黑名单优先级高于账号 IP 白名单（一票否决），修改后网关内存即时生效</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="datax-openapi-bl-total" style="color: #8c8c8c;">共 0 条</span>
                <button type="button" id="datax-openapi-bl-prev-btn" disabled style="padding: 3px 8px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; opacity: 0.5; cursor: not-allowed;">上一页</button>
                <span id="datax-openapi-bl-page-indicator">第 1 / 1 页</span>
                <button type="button" id="datax-openapi-bl-next-btn" disabled style="padding: 3px 8px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; opacity: 0.5; cursor: not-allowed;">下一页</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    bindEvents() {
      const subtabAcc = document.getElementById('datax-openapi-subtab-acc');
      const subtabLog = document.getElementById('datax-openapi-subtab-log');
      const subtabBl = document.getElementById('datax-openapi-subtab-blacklist');
      const panelAcc = document.getElementById('datax-openapi-panel-acc');
      const panelLog = document.getElementById('datax-openapi-panel-log');
      const panelBl = document.getElementById('datax-openapi-panel-blacklist');

      const switchSubTab = (tabName) => {
        this.currentSubTab = tabName;
        const tabs = [
          { key: 'account', btn: subtabAcc, panel: panelAcc },
          { key: 'log', btn: subtabLog, panel: panelLog },
          { key: 'blacklist', btn: subtabBl, panel: panelBl }
        ];
        tabs.forEach(t => {
          if (!t.btn || !t.panel) return;
          const active = t.key === tabName;
          t.btn.style.color = active ? '#1890ff' : '#595959';
          t.btn.style.fontWeight = active ? '600' : 'normal';
          t.btn.style.borderBottomColor = active ? '#1890ff' : 'transparent';
          t.panel.style.display = active ? 'flex' : 'none';
        });
      };

      subtabAcc.onclick = () => {
        switchSubTab('account');
        this.loadAccounts();
      };

      subtabLog.onclick = () => {
        switchSubTab('log');
        this.loadLogs();
      };

      if (subtabBl) {
        subtabBl.onclick = () => {
          switchSubTab('blacklist');
          this.loadBlacklist();
        };
      }

      // API 接入说明文档弹窗
      const docBtn = document.getElementById('datax-openapi-doc-btn');
      if (docBtn) {
        docBtn.onclick = () => this.showApiDocModal();
      }

      // 账号搜索
      document.getElementById('datax-openapi-acc-search-btn').onclick = () => {
        this.accountPageNo = 1;
        this.loadAccounts();
      };
      document.getElementById('datax-openapi-acc-keyword').onkeydown = (e) => {
        if (e.key === 'Enter') {
          this.accountPageNo = 1;
          this.loadAccounts();
        }
      };

      // 新增账号
      document.getElementById('datax-openapi-acc-add-btn').onclick = () => {
        this.openAccountModal(null);
      };

      // 账号分页
      this.bindPaginationEvents({
        prevBtnId: 'datax-openapi-acc-prev-btn',
        nextBtnId: 'datax-openapi-acc-next-btn',
        getPageNo: () => this.accountPageNo,
        setPageNo: (no) => { this.accountPageNo = no; },
        getTotalPages: () => this.accountTotalPages,
        onLoad: () => this.loadAccounts()
      });

      // 日志检索
      document.getElementById('datax-openapi-log-search-btn').onclick = () => {
        this.logPageNo = 1;
        this.loadLogs();
      };
      const logClientIpInput = document.getElementById('datax-openapi-log-clientip');
      if (logClientIpInput) {
        logClientIpInput.onkeydown = (e) => {
          if (e.key === 'Enter') {
            this.logPageNo = 1;
            this.loadLogs();
          }
        };
      }
      const logClientSourceInput = document.getElementById('datax-openapi-log-clientsource');
      if (logClientSourceInput) {
        logClientSourceInput.onkeydown = (e) => {
          if (e.key === 'Enter') {
            this.logPageNo = 1;
            this.loadLogs();
          }
        };
      }

      // 批量拉黑选中日志 IP
      const logBatchBlockBtn = document.getElementById('datax-openapi-log-batch-block-btn');
      if (logBatchBlockBtn) {
        logBatchBlockBtn.onclick = () => {
          const selectedLogs = (this.currentLogRecords || []).filter(r => this.selectedLogIds.has(String(r.id)));
          if (selectedLogs.length === 0) {
            alert('请先在下方日志表格中勾选至少一条调用日志（支持按住鼠标左键拖拉框选）！');
            return;
          }
          this.openBlockIpFromLogsModal(selectedLogs);
        };
      }

      // 导出日志
      const logExportBtn = document.getElementById('datax-openapi-log-export-btn');
      if (logExportBtn) {
        logExportBtn.onclick = () => {
          this.exportLogs();
        };
      }

      // 日志分页大小切换
      const logPageSizeEl = document.getElementById('datax-openapi-log-pagesize');
      if (logPageSizeEl) {
        logPageSizeEl.onchange = () => {
          this.logPageSize = parseInt(logPageSizeEl.value, 10) || 20;
          this.logPageNo = 1;
          this.loadLogs();
        };
      }

      // 日志分页
      this.bindPaginationEvents({
        prevBtnId: 'datax-openapi-log-prev-btn',
        nextBtnId: 'datax-openapi-log-next-btn',
        getPageNo: () => this.logPageNo,
        setPageNo: (no) => { this.logPageNo = no; },
        getTotalPages: () => this.logTotalPages,
        onLoad: () => this.loadLogs()
      });

      // 黑名单搜索与新增
      const blSearchBtn = document.getElementById('datax-openapi-bl-search-btn');
      if (blSearchBtn) {
        blSearchBtn.onclick = () => {
          this.blacklistPageNo = 1;
          this.loadBlacklist();
        };
      }
      const blKwInput = document.getElementById('datax-openapi-bl-keyword');
      if (blKwInput) {
        blKwInput.onkeydown = (e) => {
          if (e.key === 'Enter') {
            this.blacklistPageNo = 1;
            this.loadBlacklist();
          }
        };
      }
      const blAddBtn = document.getElementById('datax-openapi-bl-add-btn');
      if (blAddBtn) {
        blAddBtn.onclick = () => {
          this.openBlacklistEditModal(null);
        };
      }
      this.bindPaginationEvents({
        prevBtnId: 'datax-openapi-bl-prev-btn',
        nextBtnId: 'datax-openapi-bl-next-btn',
        getPageNo: () => this.blacklistPageNo,
        setPageNo: (no) => { this.blacklistPageNo = no; },
        getTotalPages: () => this.blacklistTotalPages,
        onLoad: () => this.loadBlacklist()
      });
    }

    /**
     * 统一绑定上下页翻页按钮点击事件（带总页数边界校验，防止无数据或不足一页时越界翻页）
     *
     * @param {Object} options 翻页绑定参数
     * @param {string} options.prevBtnId 上一页按钮 DOM ID
     * @param {string} options.nextBtnId 下一页按钮 DOM ID
     * @param {Function} options.getPageNo 获取当前页码回调
     * @param {Function} options.setPageNo 设置新页码回调
     * @param {Function} options.getTotalPages 获取总页数回调
     * @param {Function} options.onLoad 触发数据加载回调
     */
    bindPaginationEvents(options) {
      const { prevBtnId, nextBtnId, getPageNo, setPageNo, getTotalPages, onLoad } = options;
      const prevBtn = document.getElementById(prevBtnId);
      if (prevBtn) {
        prevBtn.onclick = () => {
          const cur = Number(getPageNo()) || 1;
          if (cur > 1) {
            setPageNo(cur - 1);
            onLoad();
          }
        };
      }
      const nextBtn = document.getElementById(nextBtnId);
      if (nextBtn) {
        nextBtn.onclick = () => {
          const cur = Number(getPageNo()) || 1;
          const totalPages = Math.max(1, Number(getTotalPages()) || 1);
          if (cur < totalPages) {
            setPageNo(cur + 1);
            onLoad();
          }
        };
      }
    }

    /**
     * 同步更新上下页按钮的禁用状态与视觉样式
     *
     * @param {string} prevBtnId 上一页按钮 DOM ID
     * @param {string} nextBtnId 下一页按钮 DOM ID
     * @param {number} currentPage 当前页码
     * @param {number} totalPages 总页数
     */
    setPaginationButtonsDisabled(prevBtnId, nextBtnId, currentPage, totalPages) {
      const safeCurrent = Math.max(1, Number(currentPage) || 1);
      const safeTotal = Math.max(1, Number(totalPages) || 1);
      const disablePrev = safeCurrent <= 1;
      const disableNext = safeCurrent >= safeTotal;

      const prevBtn = document.getElementById(prevBtnId);
      if (prevBtn) {
        prevBtn.disabled = disablePrev;
        prevBtn.style.opacity = disablePrev ? '0.5' : '1';
        prevBtn.style.cursor = disablePrev ? 'not-allowed' : 'pointer';
      }

      const nextBtn = document.getElementById(nextBtnId);
      if (nextBtn) {
        nextBtn.disabled = disableNext;
        nextBtn.style.opacity = disableNext ? '0.5' : '1';
        nextBtn.style.cursor = disableNext ? 'not-allowed' : 'pointer';
      }
    }

    /**
     * 统一计算并渲染分页状态、页码指示器与按钮禁用态
     *
     * @param {Object} options 分页更新配置
     * @param {Object} options.pageData 后端分页响应数据
     * @param {number} options.currentPage 当前请求页码
     * @param {number} options.pageSize 前端分页大小
     * @param {string} options.totalElId 总条数元素 ID
     * @param {string} options.indicatorElId 页码指示器元素 ID
     * @param {string} options.prevBtnId 上一页按钮 ID
     * @param {string} options.nextBtnId 下一页按钮 ID
     * @return {{ total: number, totalPages: number, safePageNo: number, needReload: boolean }} 归一化分页结果
     */
    updatePaginationState(options) {
      const {
        pageData,
        currentPage,
        pageSize,
        totalElId,
        indicatorElId,
        prevBtnId,
        nextBtnId
      } = options;

      const safeSize = Math.max(1, Number(pageSize) || 10);
      const total = Math.max(0, Number(pageData && pageData.total) || 0);
      const serverSize = Math.max(1, Number(pageData && pageData.size) || safeSize);
      // 严格依据总条数与分页大小计算总页数，保证数据不足一页时 totalPages 恒为 1
      const totalPages = Math.max(1, Math.ceil(total / serverSize));
      const serverCurrent = Number(pageData && pageData.current);
      const records = (pageData && Array.isArray(pageData.records)) ? pageData.records : [];

      let safePageNo = Math.max(1, Number(currentPage) || 1);
      let needReload = false;

      if (safePageNo > totalPages) {
        if (Number.isFinite(serverCurrent) && serverCurrent >= 1 && serverCurrent <= totalPages && records.length > 0) {
          // 兼容旧版后端 overflow 机制：若已返回有效页记录，直接对齐页码避免重复请求
          safePageNo = serverCurrent;
        } else {
          safePageNo = totalPages;
          if (total > 0 && records.length === 0) {
            needReload = true;
          }
        }
      }

      const totalEl = document.getElementById(totalElId);
      if (totalEl) {
        totalEl.textContent = `共 ${total} 条`;
      }

      const indicatorEl = document.getElementById(indicatorElId);
      if (indicatorEl) {
        indicatorEl.textContent = `第 ${safePageNo} / ${totalPages} 页`;
      }

      this.setPaginationButtonsDisabled(prevBtnId, nextBtnId, safePageNo, totalPages);

      return { total, totalPages, safePageNo, needReload };
    }

    async loadDatasources() {
      try {
        const res = await fetch('/api/tableData/datasources', { headers: getAuthHeaders() });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0)) {
          this.datasources = json.data || [];
        }
      } catch (e) {
        console.warn('[Tab8OpenApi] 加载数据源异常:', e);
      }
    }

    async ensureAccountMapLoaded() {
      if (Object.keys(this.accountMap).length > 0) return;
      try {
        const res = await fetch('/api/open/admin/account/page?pageNo=1&pageSize=1000', { headers: getAuthHeaders() });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0) && json.data) {
          const list = json.data.records || [];
          list.forEach(acc => {
            if (acc.appKey) {
              this.accountMap[acc.appKey] = acc.accountName || '';
            }
          });
        }
      } catch (e) {
        console.warn('[Tab8OpenApi] 预加载账号字典失败:', e);
      }
    }

    async loadAccounts() {
      const kw = document.getElementById('datax-openapi-acc-keyword').value.trim();
      const status = document.getElementById('datax-openapi-acc-status').value;
      const requestedPageNo = Math.max(1, Number(this.accountPageNo) || 1);
      this.accountPageNo = requestedPageNo;

      let url = `/api/open/admin/account/page?pageNo=${requestedPageNo}&pageSize=${this.accountPageSize}`;
      if (kw) url += `&keyword=${encodeURIComponent(kw)}`;
      if (status) url += `&status=${status}`;

      const tbody = document.getElementById('datax-openapi-acc-tbody');
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #8c8c8c;">正在加载中...</td></tr>';

      try {
        const res = await fetch(url, { headers: getAuthHeaders() });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0) && json.data) {
          const records = json.data.records || [];
          const pg = this.updatePaginationState({
            pageData: json.data,
            currentPage: requestedPageNo,
            pageSize: this.accountPageSize,
            totalElId: 'datax-openapi-acc-total',
            indicatorElId: 'datax-openapi-acc-page-indicator',
            prevBtnId: 'datax-openapi-acc-prev-btn',
            nextBtnId: 'datax-openapi-acc-next-btn'
          });
          this.accountTotalPages = pg.totalPages;
          this.accountPageNo = pg.safePageNo;
          if (pg.needReload && pg.safePageNo !== requestedPageNo) {
            return this.loadAccounts();
          }

          records.forEach(item => {
            if (item.appKey) {
              this.accountMap[item.appKey] = item.accountName || '';
            }
          });

          if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #8c8c8c;">暂无 API 账号配置</td></tr>';
            return;
          }

          tbody.innerHTML = records.map(item => {
            const permSummary = formatPermissionsSummary(item);
            return `
              <tr style="border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 8px 10px; color: #8c8c8c;">${item.id}</td>
                <td style="padding: 8px 10px; font-weight: 500; color: #262626;">${safeEscapeHtml(item.accountName)}</td>
                <td style="padding: 8px 10px;">
                  <code style="background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-size: 11px;">${safeEscapeHtml(item.appKey)}</code>
                </td>
                <td style="padding: 8px 10px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeEscapeHtml(permSummary)}">
                  <span style="background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; padding: 2px 6px; border-radius: 3px; font-size: 11px;">
                    ${safeEscapeHtml(permSummary)}
                  </span>
                </td>
                <td style="padding: 8px 10px;">${item.rateLimitQps || 10}</td>
                <td style="padding: 8px 10px;">
                  <span style="display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; ${item.status === 1 ? 'background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f;' : 'background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e;'}">
                    ${item.status === 1 ? '启用' : '停用'}
                  </span>
                </td>
                <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                  <button class="datax-acc-btn-secret" data-id="${item.id}" data-appkey="${safeEscapeHtml(item.appKey)}" style="background: none; border: none; color: #722ed1; cursor: pointer; padding: 0 4px; font-size: 12px;">查看密钥</button>
                  <button class="datax-acc-btn-toggle" data-id="${item.id}" data-status="${item.status}" style="background: none; border: none; color: ${item.status === 1 ? '#fa8c16' : '#52c41a'}; cursor: pointer; padding: 0 4px; font-size: 12px;">${item.status === 1 ? '停用' : '启用'}</button>
                  <button class="datax-acc-btn-edit" data-item='${JSON.stringify(item).replace(/'/g, "&apos;")}' style="background: none; border: none; color: #1890ff; cursor: pointer; padding: 0 4px; font-size: 12px;">✏️ 编辑</button>
                  <button class="datax-acc-btn-del" data-id="${item.id}" data-name="${safeEscapeHtml(item.accountName)}" style="background: none; border: none; color: #f5222d; cursor: pointer; padding: 0 4px; font-size: 12px;">🗑️ 删除</button>
                </td>
              </tr>
            `;
          }).join('');

          // 绑定表格操作按钮
          tbody.querySelectorAll('.datax-acc-btn-secret').forEach(btn => {
            btn.onclick = () => this.showSecretModal(btn.dataset.id, btn.dataset.appkey);
          });
          tbody.querySelectorAll('.datax-acc-btn-toggle').forEach(btn => {
            btn.onclick = () => this.toggleAccountStatus(btn.dataset.id, btn.dataset.status);
          });
          tbody.querySelectorAll('.datax-acc-btn-edit').forEach(btn => {
            btn.onclick = () => {
              const raw = btn.getAttribute('data-item');
              if (raw) this.openAccountModal(JSON.parse(raw));
            };
          });
          tbody.querySelectorAll('.datax-acc-btn-del').forEach(btn => {
            btn.onclick = () => this.deleteAccount(btn.dataset.id, btn.dataset.name);
          });
        } else {
          this.accountTotalPages = 1;
          this.setPaginationButtonsDisabled('datax-openapi-acc-prev-btn', 'datax-openapi-acc-next-btn', 1, 1);
          tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #f5222d;">加载失败: ${safeEscapeHtml((json && json.msg) || '请求异常')}</td></tr>`;
        }
      } catch (e) {
        this.setPaginationButtonsDisabled('datax-openapi-acc-prev-btn', 'datax-openapi-acc-next-btn', this.accountPageNo, this.accountTotalPages);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #f5222d;">加载失败: ${safeEscapeHtml(e.message)}</td></tr>`;
      }
    }

    async toggleAccountStatus(id, currentStatus) {
      const nextStatus = Number(currentStatus) === 1 ? 0 : 1;
      const text = nextStatus === 1 ? '启用' : '停用';
      const confirmed = await confirm(`确定要${text}该接口账号吗？`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/open/admin/account/toggleStatus?id=${id}&status=${nextStatus}`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0)) {
          toast(`账号已${text}`);
          this.loadAccounts();
        } else {
          alert('操作失败: ' + (json.msg || '未知错误'));
        }
      } catch (e) {
        alert('请求异常: ' + e.message);
      }
    }

    async deleteAccount(id, name) {
      const confirmed = await confirm(`确定要彻底删除接口账号 [${name}] 吗？删除后三方将无法使用该 AK 调用！`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/open/admin/account/delete?id=${id}`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0)) {
          toast('删除成功');
          this.loadAccounts();
        } else {
          alert('删除失败: ' + (json.msg || '未知错误'));
        }
      } catch (e) {
        alert('请求异常: ' + e.message);
      }
    }

    /**
     * 核心模态弹窗：新增或编辑 API 账号（支持多数据源库绑定与表列表交互勾选）
     */
    async openAccountModal(account) {
      if (!this.datasources || this.datasources.length === 0) {
        await this.loadDatasources();
      }
      const isEdit = Boolean(account && account.id);

      // 1. 初始化多库权限内存模型
      let authList = parseAccountAuthList(account, this.datasources);
      if (authList.length === 0 && this.datasources.length > 0) {
        authList.push({
          datasourceId: Number(this.datasources[0].id),
          datasourceName: this.datasources[0].datasourceName,
          allTables: false,
          tables: new Set(),
          rowFilterRules: []
        });
      }

      let activeDsId = authList.length > 0 ? authList[0].datasourceId : null;
      let tableMarqueeInstance = null;

      const modalObj = createDraggableModal({
        modalId: 'datax-acc-edit-modal',
        dialogId: 'datax-acc-edit-dialog',
        title: isEdit ? '编辑接口账号' : '新增接口账号',
        width: 860,
        height: 720,
        minWidth: 660,
        minHeight: 480,
        storageKeyPrefix: 'datax_oa_acc',
        zIndex: 1000025,
        onClose: () => {
          if (tableMarqueeInstance && typeof tableMarqueeInstance.destroy === 'function') {
            tableMarqueeInstance.destroy();
            tableMarqueeInstance = null;
          }
        },
        bodyHtml: `
          <div style="padding: 16px 18px; font-size: 12px; display: flex; flex-direction: column; gap: 14px; flex: 1; min-height: 0;">
            <!-- 基础配置 -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex-shrink: 0;">
              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #333;"><span style="color: red;">*</span> 账号名称：</label>
                <input type="text" id="datax-form-acc-name" value="${safeEscapeHtml(account ? account.accountName : '')}" placeholder="例如: 智能AI助手提数、北斗车辆分析平台" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
              </div>
              <div style="display: flex; gap: 10px;">
                <div style="flex: 1;">
                  <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #333;">QPS 限流：</label>
                  <input type="number" id="datax-form-acc-qps" value="${account ? account.rateLimitQps : 10}" min="1" max="100" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
                </div>
                <div style="flex: 1;">
                  <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #333;">状态：</label>
                  <select id="datax-form-acc-status-sel" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;">
                    <option value="1" ${(!account || account.status === 1) ? 'selected' : ''}>启用</option>
                    <option value="0" ${(account && account.status === 0) ? 'selected' : ''}>停用</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 选填信息：IP白名单与备注 -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex-shrink: 0;">
              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #595959;">客户端 IP 白名单 (选填)：</label>
                <input type="text" id="datax-form-acc-ips" value="${safeEscapeHtml(account ? account.allowedIps : '')}" placeholder="多个以逗号隔开，留空表示不限制" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
              </div>
              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #595959;">用途描述 / 备注 (选填)：</label>
                <input type="text" id="datax-form-acc-comments" value="${safeEscapeHtml(account ? account.comments : '')}" placeholder="简要说明使用场景" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
              </div>
            </div>

            <!-- 授权数据源库与表控制工作区 -->
            <div style="background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; flex: 1; min-height: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-shrink: 0;">
                <div>
                  <span style="font-weight: 600; color: #262626;"><span style="color: red;">*</span> 授权数据源库与表控制：</span>
                  <span style="font-size: 11px; color: #8c8c8c;">可添加多个库，切换标签分别进行表授权</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button type="button" id="datax-ds-sync-btn" title="从已有 API 账号同步单库或多库表权限" style="padding: 4px 10px; background: #fff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 4px; cursor: pointer; font-size: 11px;">从其他账号同步</button>
                  <button type="button" id="datax-ds-add-btn" style="padding: 4px 12px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">➕ 添加数据源库</button>
                </div>
              </div>

              <!-- 数据源切换卡片 Pills -->
              <div id="datax-ds-pills-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; min-height: 28px; align-items: center; flex-shrink: 0;"></div>

              <!-- 当前选定数据源的表授权工作区 (自适应填充) -->
              <div id="datax-table-auth-workspace" style="background: #fff; border: 1px solid #e8e8e8; border-radius: 4px; padding: 10px; display: flex; flex-direction: column; flex: 1; min-height: 0;">
                <!-- 当前配置数据源直接切换栏 -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; flex-wrap: wrap; gap: 8px; flex-shrink: 0;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="font-weight: 600; color: #262626; font-size: 12px;">当前授权数据源：</label>
                    <select id="datax-active-ds-select" style="padding: 4px 10px; border: 1px solid #1890ff; border-radius: 4px; font-size: 12px; background: #fff; font-weight: 500; color: #096dd9; outline: none; cursor: pointer;">
                      <!-- 动态填充数据源列表，当前激活库为 selected -->
                    </select>
                    <span style="color: #8c8c8c; font-size: 11px;">(切换下拉可直接变更当前标签对应的库)</span>
                  </div>
                  <div id="datax-remove-ds-wrap"></div>
                </div>

                <!-- 行级字段过滤规则配置面板（按当前选中数据源独立生效，支持 0..N 条字段规则） -->
                <div id="datax-row-rules-panel" style="background: #fafafa; border: 1px solid #f0f0f0; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span style="font-weight: 600; color: #262626; font-size: 12px;">行级字段过滤规则</span>
                      <span style="font-size: 11px; color: #8c8c8c;">支持任意字段 (= / IN) 与多规则 AND 叠加；无规则时仅做表白名单校验</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <button type="button" id="datax-preview-rules-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #91d5ff; border-radius: 4px; background: #e6f7ff; color: #1890ff; cursor: pointer;">🔍 预览命中字段</button>
                      <button type="button" id="datax-add-rule-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid #b7eb8f; border-radius: 4px; background: #f6ffed; color: #52c41a; cursor: pointer;">➕ 添加过滤规则</button>
                    </div>
                  </div>
                  <div id="datax-row-rules-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 132px; overflow-y: auto;"></div>
                </div>

                <!-- 顶部控制条与检索工具栏 -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px; flex-shrink: 0;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="color: #1890ff; font-weight: 500; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                      <input type="checkbox" id="datax-current-ds-alltables" style="cursor: pointer;" /> 允许访问该库全部表 (*)
                    </label>
                    <span style="color: #8c8c8c; font-size: 11px;">(按住鼠标左键可矩形框选，按住 Shift 连续选)</span>
                  </div>
                  <div id="datax-table-ctrl-bar" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    <input type="text" id="datax-table-search-input" placeholder="🔍 检索表名或注释..." style="padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 11px; width: 150px;" />
                    <button type="button" id="datax-table-only-selected-btn" title="仅显示当前数据源下已勾选的表" style="padding: 3px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa; color: #595959; cursor: pointer;">仅看已选</button>
                    <button type="button" id="datax-table-select-all" style="padding: 3px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa; cursor: pointer;">全选</button>
                    <button type="button" id="datax-table-deselect-all" style="padding: 3px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa; cursor: pointer;">取消全选</button>
                    <button type="button" id="datax-table-selected-summary-btn" title="汇总查看所有已授权数据源的已选表清单" style="padding: 3px 8px; font-size: 11px; border: 1px solid #91d5ff; border-radius: 4px; background: #fff; color: #1890ff; cursor: pointer;">已选表</button>
                    <span id="datax-table-count-badge" title="点击查看所有已授权数据源的已选表清单" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; cursor: pointer;">已授权 0 / 0 张表</span>
                  </div>
                </div>

                <!-- 数据表紧凑列表与框选主视图 (随弹窗拖拽拉伸全向动态自适应) -->
                <div id="datax-tables-list-container" style="flex: 1; min-height: 200px; height: 100%; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 4px; background: #fff; position: relative;">
                  <div style="text-align: center; padding: 40px; color: #8c8c8c;">请选择上方数据源加载数据表清单</div>
                </div>
              </div>
            </div>
          </div>
        `,
        footerHtml: `
          <div style="padding: 12px 18px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: flex-end; gap: 8px;">
            <button id="datax-acc-modal-cancel" style="padding: 6px 14px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px;">取消</button>
            <button id="datax-acc-modal-submit" style="padding: 6px 18px; border: none; border-radius: 4px; background: #1890ff; color: #fff; cursor: pointer; font-size: 12px; font-weight: 500;">保存</button>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-acc-modal-cancel').onclick = closeModal;

      // 2. 内部逻辑与 DOM 交互控制器
      const dsSyncBtn = modal.querySelector('#datax-ds-sync-btn');
      const dsAddBtn = modal.querySelector('#datax-ds-add-btn');
      const pillsContainer = modal.querySelector('#datax-ds-pills-container');
      const activeDsSelect = modal.querySelector('#datax-active-ds-select');
      const removeDsWrap = modal.querySelector('#datax-remove-ds-wrap');
      const chkAllTables = modal.querySelector('#datax-current-ds-alltables');
      const btnPreviewRules = modal.querySelector('#datax-preview-rules-btn');
      const btnAddRule = modal.querySelector('#datax-add-rule-btn');
      const rowRulesListEl = modal.querySelector('#datax-row-rules-list');
      const searchInput = modal.querySelector('#datax-table-search-input');
      const btnOnlySelected = modal.querySelector('#datax-table-only-selected-btn');
      const btnSelectAll = modal.querySelector('#datax-table-select-all');
      const btnDeselectAll = modal.querySelector('#datax-table-deselect-all');
      const btnSelectedSummary = modal.querySelector('#datax-table-selected-summary-btn');
      const countBadge = modal.querySelector('#datax-table-count-badge');
      const tablesContainer = modal.querySelector('#datax-tables-list-container');
      const rulePreviewCache = {};
      let onlyShowSelected = false;

      const syncOnlySelectedBtnStyle = () => {
        if (!btnOnlySelected) return;
        if (onlyShowSelected) {
          btnOnlySelected.style.background = '#e6f7ff';
          btnOnlySelected.style.color = '#1890ff';
          btnOnlySelected.style.borderColor = '#91d5ff';
          btnOnlySelected.style.fontWeight = '600';
        } else {
          btnOnlySelected.style.background = '#fafafa';
          btnOnlySelected.style.color = '#595959';
          btnOnlySelected.style.borderColor = '#d9d9d9';
          btnOnlySelected.style.fontWeight = 'normal';
        }
      };

      // 更新添加数据源按钮状态
      const updateDsAddBtnState = () => {
        const addedIds = authList.map(a => a.datasourceId);
        const available = this.datasources.filter(d => !addedIds.includes(d.id));
        if (available.length === 0) {
          dsAddBtn.disabled = true;
          dsAddBtn.style.opacity = '0.5';
          dsAddBtn.style.cursor = 'not-allowed';
          dsAddBtn.textContent = '所有库均已添加';
        } else {
          dsAddBtn.disabled = false;
          dsAddBtn.style.opacity = '1';
          dsAddBtn.style.cursor = 'pointer';
          dsAddBtn.textContent = '➕ 添加数据源库';
        }
      };

      // 移除指定数据源授权
      const removeDatasource = (dsId) => {
        if (authList.length <= 1) {
          alert('至少需要保留一个数据源授权！');
          return;
        }
        authList = authList.filter(a => a.datasourceId !== dsId);
        if (activeDsId === dsId) {
          activeDsId = authList[0].datasourceId;
        }
        renderDsPills();
        renderTableWorkspace();
        updateDsAddBtnState();
      };

      // 渲染顶部数据源标签 Pills
      const renderDsPills = () => {
        pillsContainer.innerHTML = authList.map(auth => {
          const isActive = auth.datasourceId === activeDsId;
          const countDesc = auth.allTables ? '全部表 (*)' : `${auth.tables.size} 张表`;
          const rulesCount = Array.isArray(auth.rowFilterRules) ? auth.rowFilterRules.length : 0;
          const filterBadge = rulesCount > 0
            ? `<span style="font-size: 10px; background: #fff7e6; color: #fa8c16; border: 1px solid #ffd591; padding: 0 5px; border-radius: 8px;">${rulesCount}条过滤</span>`
            : '';
          return `
            <div class="datax-ds-pill" data-ds-id="${auth.datasourceId}" style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 14px; font-size: 11px; cursor: pointer; border: 1px solid ${isActive ? '#1890ff' : '#d9d9d9'}; background: ${isActive ? '#e6f7ff' : '#fff'}; color: ${isActive ? '#1890ff' : '#595959'}; font-weight: ${isActive ? '600' : 'normal'}; transition: all 0.2s;">
              <span>${safeEscapeHtml(auth.datasourceName)}</span>
              <span style="font-size: 10px; background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 8px;">${countDesc}</span>
              ${filterBadge}
              ${authList.length > 1 ? `<span class="datax-ds-remove" data-ds-id="${auth.datasourceId}" title="移除该库授权" style="color: #ff4d4f; font-weight: bold; margin-left: 2px; cursor: pointer; padding: 0 2px;">&times;</span>` : ''}
            </div>
          `;
        }).join('');

        pillsContainer.querySelectorAll('.datax-ds-pill').forEach(pill => {
          pill.onclick = (e) => {
            if (e.target.classList.contains('datax-ds-remove')) return;
            const dsId = Number(pill.getAttribute('data-ds-id'));
            if (activeDsId !== dsId) {
              activeDsId = dsId;
              renderDsPills();
              renderTableWorkspace();
            }
          };
        });

        pillsContainer.querySelectorAll('.datax-ds-remove').forEach(rmBtn => {
          rmBtn.onclick = (e) => {
            e.stopPropagation();
            const dsId = Number(rmBtn.getAttribute('data-ds-id'));
            removeDatasource(dsId);
          };
        });
      };

      // 异步加载指定库的表元数据 (带前端内存缓存)
      const fetchTablesForDs = async (dsId) => {
        if (this.tableCache[dsId]) {
          return this.tableCache[dsId];
        }
        try {
          const res = await fetch(`/api/tableData/tables?datasourceId=${dsId}`, { headers: getAuthHeaders() });
          const json = await res.json();
          if (json && (json.code === 200 || json.code === 0) && Array.isArray(json.data)) {
            // 过滤系统内置表
            const filtered = json.data.filter(t => {
              const lower = (t.tableName || '').toLowerCase();
              return !lower.startsWith('job_') && !lower.startsWith('sys_') && !lower.startsWith('schema_');
            });
            this.tableCache[dsId] = filtered;
            return filtered;
          }
        } catch (e) {
          console.warn('[fetchTablesForDs] 加载失败:', e);
        }
        return [];
      };

      // 渲染当前数据源下的表授权控制面板 (高密度列表 + 框选引擎 + 快捷检索)
      const renderTableWorkspace = async () => {
        if (tableMarqueeInstance && typeof tableMarqueeInstance.destroy === 'function') {
          tableMarqueeInstance.destroy();
          tableMarqueeInstance = null;
        }

        const curAuth = authList.find(a => a.datasourceId === activeDsId);
        if (!curAuth) {
          tablesContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #8c8c8c;">未选择有效数据源</div>';
          return;
        }

        // 渲染当前库下拉选项
        activeDsSelect.innerHTML = this.datasources.map(d => {
          const isSelected = d.id === curAuth.datasourceId;
          const isUsedByOther = authList.some(a => a.datasourceId === d.id && a.datasourceId !== curAuth.datasourceId);
          return `<option value="${d.id}" ${isSelected ? 'selected' : ''} ${isUsedByOther ? 'disabled' : ''}>${safeEscapeHtml(d.datasourceName)} (${safeEscapeHtml(d.datasource)})${isUsedByOther ? ' [已在其他标签]' : ''}</option>`;
        }).join('');

        // 渲染移除该库按钮
        if (authList.length > 1) {
          removeDsWrap.innerHTML = '<button type="button" id="datax-remove-current-ds-btn" style="padding: 3px 10px; font-size: 11px; border: 1px solid #ffa39e; color: #f5222d; border-radius: 4px; background: #fff1f0; cursor: pointer;">移除该库授权</button>';
          removeDsWrap.querySelector('#datax-remove-current-ds-btn').onclick = () => {
            removeDatasource(activeDsId);
          };
        } else {
          removeDsWrap.innerHTML = '';
        }

        // 同步通配全部表复选框
        chkAllTables.checked = Boolean(curAuth.allTables);
        if (!Array.isArray(curAuth.rowFilterRules)) {
          curAuth.rowFilterRules = [];
        }

        // 渲染单张表的规则命中预览徽标 HTML
        const buildRuleHitBadgeHtml = (lowerTblName) => {
          if (!curAuth.rowFilterRules || curAuth.rowFilterRules.length === 0) {
            return '<span style="color: #bfbfbf; font-size: 11px;">未启用</span>';
          }
          const preview = rulePreviewCache[curAuth.datasourceId];
          if (!preview) {
            return '<span style="color: #8c8c8c; font-size: 11px;">点击预览检查</span>';
          }
          const missingCols = (preview.missingStrictColumns && preview.missingStrictColumns[lowerTblName]) || [];
          if (missingCols.length > 0) {
            return `<span style="display: inline-block; background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; padding: 1px 6px; border-radius: 3px; font-size: 10px;" title="严格模式下缺少字段">缺字段: ${safeEscapeHtml(missingCols.join(', '))}</span>`;
          }
          if (Array.isArray(preview.failedTables) && preview.failedTables.includes(lowerTblName)) {
            return '<span style="display: inline-block; background: #fffbe6; color: #faad14; border: 1px solid #ffe58f; padding: 1px 6px; border-radius: 3px; font-size: 10px;">元数据异常</span>';
          }
          const matchedCols = (preview.matchedColumns && preview.matchedColumns[lowerTblName]) || [];
          if (matchedCols.length > 0) {
            return `<span style="display: inline-block; background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; padding: 1px 6px; border-radius: 3px; font-size: 10px;" title="将注入行级过滤字段">过滤: ${safeEscapeHtml(matchedCols.join(', '))}</span>`;
          }
          return '<span style="display: inline-block; background: #fafafa; color: #8c8c8c; border: 1px solid #d9d9d9; padding: 1px 6px; border-radius: 3px; font-size: 10px;">全行可见</span>';
        };

        // 原地刷新表清单中每一行的规则命中徽标 (不打断滚动位置与框选状态)
        const refreshTableRuleBadges = () => {
          const rows = tablesContainer.querySelectorAll('.datax-table-auth-row');
          rows.forEach(row => {
            const tName = row.getAttribute('data-table-name');
            const badgeCell = row.querySelector('.datax-rule-hit-cell');
            if (badgeCell && tName) {
              badgeCell.innerHTML = buildRuleHitBadgeHtml(tName);
            }
          });
        };

        // 渲染当前数据源下的行级字段过滤规则编辑器
        const renderRowFilterRules = () => {
          const rules = curAuth.rowFilterRules;
          if (!rules || rules.length === 0) {
            rowRulesListEl.innerHTML = '<div style="font-size: 11px; color: #8c8c8c; padding: 4px 2px;">当前数据源未配置行级过滤规则（所有已授权表全行可见）。点击右侧“➕ 添加过滤规则”可按业务字段限制数据范围。</div>';
            return;
          }

          rowRulesListEl.innerHTML = rules.map((rule, idx) => {
            const isStrict = rule.matchMode === 'STRICT_TABLES';
            const scopeValues = isStrict ? (rule.tables || []) : (rule.excludeTables || []);
            const scopePlaceholder = isStrict
              ? '指定表(留空=全库，逗号分隔，如 oa_user)'
              : '排除表(选填，如 sys_global_cfg)';
            const scopeTitle = isStrict
              ? '严格指定表模式：留空表示针对该库所有未排除的表强制要求含此字段；填写表名则仅对指定表强制校验'
              : '自动匹配模式：表含有该字段时自动过滤，不含该字段自动跳过；此处可填需额外排除的表';

            return `
              <div class="datax-row-rule-item" data-rule-idx="${idx}" style="display: grid; grid-template-columns: 120px 1fr 150px 1fr 28px; gap: 6px; align-items: center; background: #fff; border: 1px solid #e8e8e8; border-radius: 4px; padding: 5px 8px;">
                <input type="text" class="datax-rule-col-input" value="${safeEscapeHtml(rule.column || '')}" placeholder="字段名 如 tenant_id" title="物理表过滤字段名" style="width: 100%; box-sizing: border-box; padding: 3px 6px; border: 1px solid #d9d9d9; border-radius: 3px; font-size: 11px;" />
                <input type="text" class="datax-rule-vals-input" value="${safeEscapeHtml((rule.values || []).join(','))}" placeholder="允许值(逗号分隔，如 1001 或 10,20)" title="允许访问的字段值列表 (= 或 IN)" style="width: 100%; box-sizing: border-box; padding: 3px 6px; border: 1px solid #d9d9d9; border-radius: 3px; font-size: 11px;" />
                <select class="datax-rule-mode-select" title="匹配模式" style="width: 100%; box-sizing: border-box; padding: 3px 4px; border: 1px solid #d9d9d9; border-radius: 3px; font-size: 11px; background: #fff;">
                  <option value="AUTO_BY_COLUMN" ${!isStrict ? 'selected' : ''}>有该字段自动过滤</option>
                  <option value="STRICT_TABLES" ${isStrict ? 'selected' : ''}>指定表严格(缺列拦截)</option>
                </select>
                <input type="text" class="datax-rule-scope-input" value="${safeEscapeHtml(scopeValues.join(','))}" placeholder="${scopePlaceholder}" title="${scopeTitle}" style="width: 100%; box-sizing: border-box; padding: 3px 6px; border: 1px solid #d9d9d9; border-radius: 3px; font-size: 11px;" />
                <button type="button" class="datax-rule-del-btn" title="删除此条过滤规则" style="border: 1px solid #ffa39e; background: #fff1f0; color: #f5222d; border-radius: 3px; padding: 2px 4px; font-size: 11px; cursor: pointer;">🗑️</button>
              </div>
            `;
          }).join('');

          rowRulesListEl.querySelectorAll('.datax-row-rule-item').forEach(rowEl => {
            const idx = Number(rowEl.getAttribute('data-rule-idx'));
            const rule = curAuth.rowFilterRules[idx];
            if (!rule) return;

            const colInput = rowEl.querySelector('.datax-rule-col-input');
            const valsInput = rowEl.querySelector('.datax-rule-vals-input');
            const modeSelect = rowEl.querySelector('.datax-rule-mode-select');
            const scopeInput = rowEl.querySelector('.datax-rule-scope-input');
            const delBtn = rowEl.querySelector('.datax-rule-del-btn');

            const invalidatePreview = () => {
              rulePreviewCache[curAuth.datasourceId] = null;
              refreshTableRuleBadges();
            };

            colInput.oninput = () => {
              rule.column = colInput.value.trim();
              invalidatePreview();
            };
            valsInput.oninput = () => {
              rule.values = parseCsvTokens(valsInput.value, false);
              invalidatePreview();
            };
            modeSelect.onchange = () => {
              rule.matchMode = modeSelect.value === 'STRICT_TABLES' ? 'STRICT_TABLES' : 'AUTO_BY_COLUMN';
              renderRowFilterRules();
              invalidatePreview();
            };
            scopeInput.oninput = () => {
              const tokens = parseCsvTokens(scopeInput.value, true);
              if (rule.matchMode === 'STRICT_TABLES') {
                rule.tables = tokens;
              } else {
                rule.excludeTables = tokens;
              }
              invalidatePreview();
            };
            delBtn.onclick = () => {
              curAuth.rowFilterRules.splice(idx, 1);
              rulePreviewCache[curAuth.datasourceId] = null;
              renderRowFilterRules();
              renderDsPills();
              refreshTableRuleBadges();
            };
          });
        };

        renderRowFilterRules();

        btnAddRule.onclick = () => {
          curAuth.rowFilterRules.push({
            column: 'tenant_id',
            values: [],
            matchMode: 'AUTO_BY_COLUMN',
            tables: [],
            excludeTables: []
          });
          rulePreviewCache[curAuth.datasourceId] = null;
          renderRowFilterRules();
          renderDsPills();
          refreshTableRuleBadges();
        };

        tablesContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #1890ff;">⏳ 正在读取该库数据表清单...</div>';
        const tables = await fetchTablesForDs(activeDsId);

        // 调用后端预览表字段规则命中情况
        const runRuleMatchPreview = async (silent) => {
          const rules = curAuth.rowFilterRules || [];
          if (rules.length === 0) {
            rulePreviewCache[curAuth.datasourceId] = null;
            refreshTableRuleBadges();
            if (!silent) {
              alert('当前数据源尚未配置行级过滤规则。');
            }
            return;
          }
          const colPattern = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
          const valPattern = /^[a-zA-Z0-9_-]{1,64}$/;
          const invalidRule = rules.find(r =>
            !r.column || !colPattern.test(r.column.trim())
            || !Array.isArray(r.values) || r.values.length === 0
            || r.values.some(v => !valPattern.test(v))
          );
          if (invalidRule) {
            if (!silent) {
              alert('请先补全所有过滤规则的合法字段名与允许值后再预览！');
            }
            return;
          }

          btnPreviewRules.disabled = true;
          btnPreviewRules.textContent = '预览中...';
          try {
            const res = await fetch('/api/open/admin/account/previewRuleMatches', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                datasourceId: curAuth.datasourceId,
                tables: tables.map(t => t.tableName),
                rowFilterRules: rules
              })
            });
            const json = await res.json();
            if (json && (json.code === 200 || json.code === 0) && json.data) {
              rulePreviewCache[curAuth.datasourceId] = json.data;
              refreshTableRuleBadges();
            } else if (!silent) {
              alert('预览失败: ' + (json.msg || '未知错误'));
            }
          } catch (e) {
            if (!silent) {
              alert('预览请求异常: ' + e.message);
            }
          } finally {
            btnPreviewRules.disabled = false;
            btnPreviewRules.textContent = '🔍 预览命中字段';
          }
        };

        btnPreviewRules.onclick = () => runRuleMatchPreview(false);

        if (tables.length === 0) {
          tablesContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #8c8c8c;">该数据源下未检索到业务数据表</div>';
          countBadge.textContent = '已授权 0 / 0 张表';
          return;
        }

        let lastClickedIdx = -1;

        // 同步列表高亮、复选框、表头全选态与授权 Badge 计数
        const syncTableVisuals = () => {
          const isAll = Boolean(curAuth.allTables);
          const rows = tablesContainer.querySelectorAll('.datax-table-auth-row');
          let visibleTotal = 0;
          let visibleSelected = 0;

          rows.forEach((row, idx) => {
            if (row.style.display === 'none') return;
            visibleTotal++;
            const tName = row.getAttribute('data-table-name');
            const isSel = isAll || curAuth.tables.has(tName);
            if (isSel) visibleSelected++;

            const isEven = idx % 2 === 0;
            row.style.background = isSel ? '#e6f7ff' : (isEven ? '#fff' : '#fafafa');
            row.style.borderLeft = isSel ? '3px solid #1890ff' : '3px solid transparent';
            const cb = row.querySelector('.datax-table-cb');
            if (cb) {
              cb.checked = isSel;
              cb.disabled = isAll;
            }
          });

          // 同步表头复选框
          const headerChk = tablesContainer.querySelector('#datax-tbl-header-chk');
          if (headerChk) {
            headerChk.checked = visibleTotal > 0 && visibleSelected === visibleTotal;
            headerChk.indeterminate = visibleSelected > 0 && visibleSelected < visibleTotal;
            headerChk.disabled = isAll;
          }

          // 同步已授权 Badge
          if (isAll) {
            countBadge.textContent = `已授权 全部表 (*) [共 ${tables.length} 张]`;
            countBadge.style.background = '#f6ffed';
            countBadge.style.color = '#52c41a';
            countBadge.style.borderColor = '#b7eb8f';
          } else {
            countBadge.textContent = `已授权 ${curAuth.tables.size} / ${tables.length} 张表`;
            countBadge.style.background = '#e6f7ff';
            countBadge.style.color = '#1890ff';
            countBadge.style.borderColor = '#91d5ff';
          }

          // 同步顶部 Pills 标签数量
          renderDsPills();
        };

        // 渲染高密度数据表列表视图 (含粘性表头)
        const renderTableItems = () => {
          if (tableMarqueeInstance && typeof tableMarqueeInstance.destroy === 'function') {
            tableMarqueeInstance.destroy();
            tableMarqueeInstance = null;
          }

          const kw = (searchInput.value || '').trim().toLowerCase();
          const filtered = tables.filter(t => {
            const lowerName = (t.tableName || '').toLowerCase();
            if (onlyShowSelected && !curAuth.allTables && !curAuth.tables.has(lowerName)) {
              return false;
            }
            if (!kw) return true;
            const comment = (t.tableComment || '').toLowerCase();
            return lowerName.includes(kw) || comment.includes(kw);
          });

          if (filtered.length === 0) {
            const emptyMsg = onlyShowSelected
              ? (kw ? '未找到匹配的已选数据表' : '当前数据源暂无已选数据表')
              : '未找到匹配的数据表';
            tablesContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: #8c8c8c;">${emptyMsg}</div>`;
            countBadge.textContent = curAuth.allTables ? `已授权 全部表 (*) [共 ${tables.length} 张]` : `已授权 ${curAuth.tables.size} / ${tables.length} 张表`;
            return;
          }

          let html = `
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; table-layout: fixed;">
              <thead style="position: sticky; top: 0; z-index: 5; background: #fafafa; border-bottom: 1px solid #e8e8e8; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <tr style="color: #595959; font-weight: 600; white-space: nowrap; height: 32px;">
                  <th style="padding: 4px 8px; width: 38px; text-align: center;">
                    <input type="checkbox" id="datax-tbl-header-chk" title="全选/取消全选当前可见数据表" style="cursor: pointer; vertical-align: middle;" />
                  </th>
                  <th style="padding: 4px 6px; width: 45px; text-align: center; color: #8c8c8c;">#</th>
                  <th style="padding: 4px 12px; width: 38%; min-width: 220px;">数据表名</th>
                  <th style="padding: 4px 10px; width: 155px;">规则命中</th>
                  <th style="padding: 4px 12px; width: auto;">业务注释 / 说明</th>
                </tr>
              </thead>
              <tbody id="datax-tbl-tbody">
          `;

          const isAll = Boolean(curAuth.allTables);

          filtered.forEach((tbl, idx) => {
            const lowerName = (tbl.tableName || '').toLowerCase();
            const comment = (tbl.tableComment || '').trim();
            const isChecked = isAll || curAuth.tables.has(lowerName);
            const isEven = idx % 2 === 0;

            html += `
              <tr class="datax-table-auth-row datax-marquee-trigger" data-table-name="${safeEscapeHtml(lowerName)}" data-idx="${idx}"
                  style="border-bottom: 1px solid #f0f0f0; background: ${isChecked ? '#e6f7ff' : (isEven ? '#fff' : '#fafafa')}; border-left: ${isChecked ? '3px solid #1890ff' : '3px solid transparent'}; cursor: pointer; height: 30px; transition: background-color 0.12s; user-select: none;">
                <td style="padding: 4px 8px; text-align: center; vertical-align: middle;" class="datax-marquee-trigger">
                  <input type="checkbox" class="datax-table-cb" value="${safeEscapeHtml(lowerName)}" ${isChecked ? 'checked' : ''} ${isAll ? 'disabled' : ''} style="cursor: pointer; vertical-align: middle;" />
                </td>
                <td style="padding: 4px 6px; text-align: center; vertical-align: middle; color: #8c8c8c; font-size: 11px;" class="datax-marquee-trigger">
                  ${idx + 1}
                </td>
                <td style="padding: 4px 12px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-family: 'SFMono-Regular', Consolas, Monaco, monospace; color: #1890ff;" title="${safeEscapeHtml(tbl.tableName)}" class="datax-marquee-trigger">
                  ${safeEscapeHtml(tbl.tableName)}
                </td>
                <td style="padding: 4px 10px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" class="datax-marquee-trigger datax-rule-hit-cell">
                  ${buildRuleHitBadgeHtml(lowerName)}
                </td>
                <td style="padding: 4px 12px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #595959; font-size: 11px;" title="${safeEscapeHtml(comment || '无业务注释')}" class="datax-marquee-trigger">
                  ${comment ? safeEscapeHtml(comment) : '<span style="color: #bfbfbf;">暂无业务注释</span>'}
                </td>
              </tr>
            `;
          });

          html += '</tbody></table>';
          tablesContainer.innerHTML = html;

          // 绑定表头全选复选框
          const headerChk = tablesContainer.querySelector('#datax-tbl-header-chk');
          if (headerChk) {
            headerChk.onchange = () => {
              if (curAuth.allTables) return;
              const isChecked = headerChk.checked;
              filtered.forEach(tbl => {
                const lowerName = (tbl.tableName || '').toLowerCase();
                if (isChecked) {
                  curAuth.tables.add(lowerName);
                } else {
                  curAuth.tables.delete(lowerName);
                }
              });
              syncTableVisuals();
            };
          }

          // 绑定行点击与 Shift 连续选
          const allRows = tablesContainer.querySelectorAll('.datax-table-auth-row');
          allRows.forEach((row, rowIdx) => {
            // 鼠标悬浮反馈
            row.onmouseenter = () => {
              const tName = row.getAttribute('data-table-name');
              if (!curAuth.allTables && !curAuth.tables.has(tName)) {
                row.style.background = '#f5f5f5';
              }
            };
            row.onmouseleave = () => {
              const tName = row.getAttribute('data-table-name');
              if (!curAuth.allTables && !curAuth.tables.has(tName)) {
                row.style.background = rowIdx % 2 === 0 ? '#fff' : '#fafafa';
              }
            };

            // 单击复选框
            const cb = row.querySelector('.datax-table-cb');
            if (cb) {
              cb.onclick = (e) => {
                e.stopPropagation();
                if (curAuth.allTables) return;
                const tName = cb.value;
                if (cb.checked) {
                  curAuth.tables.add(tName);
                } else {
                  curAuth.tables.delete(tName);
                }
                lastClickedIdx = rowIdx;
                syncTableVisuals();
              };
            }

            // 单击整行支持 Shift 连续多选
            row.onclick = (e) => {
              if (curAuth.allTables) return;
              const tName = row.getAttribute('data-table-name');

              if (e.shiftKey && lastClickedIdx >= 0) {
                const start = Math.min(lastClickedIdx, rowIdx);
                const end = Math.max(lastClickedIdx, rowIdx);
                for (let i = start; i <= end; i++) {
                  const r = allRows[i];
                  if (r) {
                    const name = r.getAttribute('data-table-name');
                    if (name) curAuth.tables.add(name);
                  }
                }
              } else {
                if (curAuth.tables.has(tName)) {
                  curAuth.tables.delete(tName);
                } else {
                  curAuth.tables.add(tName);
                }
                lastClickedIdx = rowIdx;
              }
              syncTableVisuals();
            };
          });

          // 绑定通用矩形框选引擎 (MarqueeSelector)
          if (!curAuth.allTables && window.DataXAssistant && window.DataXAssistant.MarqueeSelector) {
            tableMarqueeInstance = new window.DataXAssistant.MarqueeSelector({
              container: tablesContainer,
              rowSelector: '.datax-table-auth-row',
              checkboxSelector: '.datax-table-cb',
              getIdFromRow: (row) => row.getAttribute('data-table-name'),
              selectedSet: curAuth.tables,
              selectedBg: '#e6f7ff',
              selectionBoxId: 'datax-oa-tbl-marquee-box',
              onSelectionChange: () => {
                syncTableVisuals();
              }
            });
          }

          syncTableVisuals();
        };

        renderTableItems();

        // 绑定搜索输入事件
        searchInput.oninput = () => {
          renderTableItems();
        };

        // 绑定【仅看已选】切换按钮
        if (btnOnlySelected) {
          btnOnlySelected.onclick = () => {
            onlyShowSelected = !onlyShowSelected;
            syncOnlySelectedBtnStyle();
            renderTableItems();
          };
        }

        // 绑定全库通配复选框
        chkAllTables.onchange = (e) => {
          curAuth.allTables = Boolean(e.target.checked);
          renderDsPills();
          renderTableItems();
        };

        // 绑定【全选】按钮（勾选当前过滤可见的所有表）
        btnSelectAll.onclick = () => {
          if (curAuth.allTables) return;
          const kw = (searchInput.value || '').trim().toLowerCase();
          tables.forEach(t => {
            const lowerName = (t.tableName || '').toLowerCase();
            if (onlyShowSelected && !curAuth.tables.has(lowerName)) return;
            const searchKey = `${lowerName} ${(t.tableComment || '').toLowerCase()}`;
            if (!kw || searchKey.includes(kw)) {
              curAuth.tables.add(lowerName);
            }
          });
          syncTableVisuals();
        };

        // 绑定【取消全选】按钮
        btnDeselectAll.onclick = () => {
          if (curAuth.allTables) return;
          const kw = (searchInput.value || '').trim().toLowerCase();
          tables.forEach(t => {
            const lowerName = (t.tableName || '').toLowerCase();
            if (onlyShowSelected && !curAuth.tables.has(lowerName)) return;
            const searchKey = `${lowerName} ${(t.tableComment || '').toLowerCase()}`;
            if (!kw || searchKey.includes(kw)) {
              curAuth.tables.delete(lowerName);
            }
          });
          if (onlyShowSelected) {
            renderDsPills();
            renderTableItems();
          } else {
            syncTableVisuals();
          }
        };

        // 若该库已配有效行级过滤规则且尚未预览，打开时静默拉取一次命中标记
        if (curAuth.rowFilterRules.length > 0 && !rulePreviewCache[curAuth.datasourceId]) {
          runRuleMatchPreview(true);
        }
      };

      // 绑定当前库直接切换事件
      activeDsSelect.onchange = (e) => {
        const newDsId = Number(e.target.value);
        if (!newDsId || newDsId === activeDsId) return;

        const newDsObj = this.datasources.find(d => d.id === newDsId);
        if (!newDsObj) return;

        const curAuth = authList.find(a => a.datasourceId === activeDsId);
        if (curAuth) {
          curAuth.datasourceId = newDsId;
          curAuth.datasourceName = newDsObj.datasourceName;
          curAuth.allTables = false;
          curAuth.tables = new Set();
          curAuth.rowFilterRules = [];
        }
        activeDsId = newDsId;
        renderDsPills();
        renderTableWorkspace();
        updateDsAddBtnState();
      };

      // 3. 绑定添加数据源按钮
      dsAddBtn.onclick = () => {
        const addedIds = authList.map(a => a.datasourceId);
        const available = this.datasources.filter(d => !addedIds.includes(d.id));
        if (available.length === 0) {
          alert('所有已配置的数据源均已添加！');
          return;
        }

        const nextDs = available[0];
        authList.push({
          datasourceId: Number(nextDs.id),
          datasourceName: nextDs.datasourceName,
          allTables: false,
          tables: new Set(),
          rowFilterRules: []
        });
        activeDsId = Number(nextDs.id);
        renderDsPills();
        renderTableWorkspace();
        updateDsAddBtnState();
      };

      // 3.1 跨数据源已选表汇总查看弹窗
      const openSelectedTablesSummaryModal = () => {
        const sumModalObj = createDraggableModal({
          modalId: 'datax-acc-selected-summary-modal',
          dialogId: 'datax-acc-selected-summary-dialog',
          title: '已选数据表汇总',
          width: 680,
          height: 520,
          minWidth: 460,
          minHeight: 340,
          storageKeyPrefix: 'datax_oa_sel_sum',
          zIndex: 1000035,
          bodyHtml: `
            <div id="datax-sel-sum-body" style="padding: 14px 16px; font-size: 12px; display: flex; flex-direction: column; gap: 12px;"></div>
          `,
          footerHtml: `
            <div style="padding: 10px 16px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: flex-end;">
              <button type="button" id="datax-sel-sum-close-btn" style="padding: 5px 16px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px;">关闭</button>
            </div>
          `
        });

        const sumBody = sumModalObj.modalEl.querySelector('#datax-sel-sum-body');
        sumModalObj.modalEl.querySelector('#datax-sel-sum-close-btn').onclick = sumModalObj.close;

        const renderSummaryContent = () => {
          if (!authList || authList.length === 0) {
            sumBody.innerHTML = '<div style="text-align: center; padding: 36px; color: #8c8c8c;">当前尚未绑定任何数据源</div>';
            return;
          }

          sumBody.innerHTML = authList.map(auth => {
            const sortedTables = Array.from(auth.tables || []).sort();
            const countText = auth.allTables ? '全部表 (*)' : `已选 ${sortedTables.length} 张`;
            const badgeStyle = auth.allTables
              ? 'background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f;'
              : (sortedTables.length > 0
                ? 'background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff;'
                : 'background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e;');

            let contentHtml = '';
            if (auth.allTables) {
              contentHtml = '<div style="padding: 8px 10px; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 4px; color: #389e0d; font-size: 11px;">已开启全库通配授权：允许访问该数据源下全部非系统数据表 (*)。</div>';
            } else if (sortedTables.length === 0) {
              contentHtml = '<div style="padding: 8px 10px; color: #8c8c8c; font-size: 11px;">暂未勾选任何数据表</div>';
            } else {
              contentHtml = `
                <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow-y: auto; padding: 2px 0;">
                  ${sortedTables.map(tbl => `
                    <span style="display: inline-flex; align-items: center; gap: 6px; background: #f0f5ff; border: 1px solid #adc6ff; color: #1d39c4; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: 'SFMono-Regular', Consolas, Monaco, monospace;">
                      <span>${safeEscapeHtml(tbl)}</span>
                      <button type="button" class="datax-sel-sum-remove-tbl" data-ds-id="${auth.datasourceId}" data-table-name="${safeEscapeHtml(tbl)}" title="移除该表授权" style="border: none; background: transparent; color: #8c8c8c; cursor: pointer; padding: 0; font-size: 12px; line-height: 1;">&times;</button>
                    </span>
                  `).join('')}
                </div>
              `;
            }

            return `
              <div style="border: 1px solid #e8e8e8; border-radius: 6px; padding: 10px 12px; background: #fff;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="color: #262626; font-size: 12px;">${safeEscapeHtml(auth.datasourceName)}</strong>
                    <span style="padding: 1px 8px; border-radius: 10px; font-size: 11px; ${badgeStyle}">${countText}</span>
                  </div>
                  <div style="display: flex; gap: 6px;">
                    ${(!auth.allTables && sortedTables.length > 0) ? `<button type="button" class="datax-sel-sum-copy-btn" data-ds-id="${auth.datasourceId}" style="padding: 2px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa; color: #595959; cursor: pointer;">复制表名</button>` : ''}
                    ${auth.datasourceId !== activeDsId ? `<button type="button" class="datax-sel-sum-switch-btn" data-ds-id="${auth.datasourceId}" style="padding: 2px 8px; font-size: 11px; border: 1px solid #91d5ff; border-radius: 4px; background: #e6f7ff; color: #1890ff; cursor: pointer;">切换到该库</button>` : ''}
                  </div>
                </div>
                ${contentHtml}
              </div>
            `;
          }).join('');

          sumBody.querySelectorAll('.datax-sel-sum-copy-btn').forEach(btn => {
            btn.onclick = () => {
              const targetDsId = Number(btn.getAttribute('data-ds-id'));
              const targetAuth = authList.find(a => a.datasourceId === targetDsId);
              if (!targetAuth || targetAuth.tables.size === 0) return;
              copyText(Array.from(targetAuth.tables).sort().join(','), `已复制 ${targetAuth.tables.size} 张表名`);
            };
          });

          sumBody.querySelectorAll('.datax-sel-sum-switch-btn').forEach(btn => {
            btn.onclick = () => {
              const targetDsId = Number(btn.getAttribute('data-ds-id'));
              if (!targetDsId) return;
              activeDsId = targetDsId;
              renderDsPills();
              renderTableWorkspace();
              sumModalObj.close();
            };
          });

          sumBody.querySelectorAll('.datax-sel-sum-remove-tbl').forEach(btn => {
            btn.onclick = () => {
              const targetDsId = Number(btn.getAttribute('data-ds-id'));
              const tblName = btn.getAttribute('data-table-name');
              const targetAuth = authList.find(a => a.datasourceId === targetDsId);
              if (!targetAuth || !tblName) return;
              targetAuth.tables.delete(tblName);
              renderSummaryContent();
              renderDsPills();
              if (targetDsId === activeDsId) {
                renderTableWorkspace();
              }
            };
          });
        };

        renderSummaryContent();
      };

      if (btnSelectedSummary) {
        btnSelectedSummary.onclick = openSelectedTablesSummaryModal;
      }
      if (countBadge) {
        countBadge.onclick = openSelectedTablesSummaryModal;
      }

      // 3.2 从其他账号同步库表权限弹窗
      const openSyncPermissionsModal = async () => {
        const syncModalObj = createDraggableModal({
          modalId: 'datax-acc-perm-sync-modal',
          dialogId: 'datax-acc-perm-sync-dialog',
          title: '从其他账号同步权限',
          width: 720,
          height: 580,
          minWidth: 520,
          minHeight: 400,
          storageKeyPrefix: 'datax_oa_perm_sync',
          zIndex: 1000035,
          bodyHtml: `
            <div style="padding: 14px 16px; font-size: 12px; display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0;">
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex-shrink: 0;">
                <label style="font-weight: 600; color: #262626; white-space: nowrap;">来源 API 账号：</label>
                <input type="text" id="datax-sync-acc-filter" placeholder="🔍 过滤账号名或 AppKey..." style="padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; width: 170px;" />
                <select id="datax-sync-acc-select" style="flex: 1; min-width: 220px; padding: 5px 8px; border: 1px solid #1890ff; border-radius: 4px; font-size: 12px; background: #fff;">
                  <option value="">正在加载账号列表...</option>
                </select>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                <span style="font-weight: 600; color: #262626;">选择要同步的数据源库与表（支持单库 / 多库及单库表微调）：</span>
                <div style="display: flex; gap: 6px;">
                  <button type="button" id="datax-sync-ds-select-all" style="padding: 2px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa; cursor: pointer;">全选库</button>
                  <button type="button" id="datax-sync-ds-deselect-all" style="padding: 2px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa; cursor: pointer;">清空选择</button>
                </div>
              </div>

              <div id="datax-sync-ds-list" style="flex: 1; min-height: 180px; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 4px; padding: 10px; background: #fafafa; display: flex; flex-direction: column; gap: 8px;">
                <div style="text-align: center; padding: 36px; color: #8c8c8c;">正在加载来源账号...</div>
              </div>

              <div style="background: #fff; border: 1px solid #e8e8e8; border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                  <span style="font-weight: 600; color: #262626;">合并策略：</span>
                  <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer; color: #262626;">
                    <input type="radio" name="datax-sync-merge-mode" value="append" checked style="cursor: pointer;" />
                    追加合并（保留当前已有表，同名库取并集）
                  </label>
                  <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer; color: #cf1322;">
                    <input type="radio" name="datax-sync-merge-mode" value="overwrite" style="cursor: pointer;" />
                    覆盖替换（用来源账号的表覆盖同名库）
                  </label>
                </div>
                <div style="border-top: 1px dashed #f0f0f0; padding-top: 8px;">
                  <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 500; color: #262626;">
                    <input type="checkbox" id="datax-sync-include-rules" style="cursor: pointer;" />
                    同时同步来源库的行级字段过滤规则
                  </label>
                  <div id="datax-sync-rules-hint" style="margin-top: 4px; font-size: 11px; color: #8c8c8c;">
                    提示：不同账号的租户/业务过滤值（如 tenant_id）可能不同，默认不勾选；勾选后将一并导入规则，请导入后在工作区核对修改。
                  </div>
                </div>
              </div>
            </div>
          `,
          footerHtml: `
            <div style="padding: 10px 16px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: flex-end; gap: 8px;">
              <button type="button" id="datax-sync-cancel-btn" style="padding: 5px 14px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px;">取消</button>
              <button type="button" id="datax-sync-confirm-btn" style="padding: 5px 16px; border: none; border-radius: 4px; background: #1890ff; color: #fff; cursor: pointer; font-size: 12px; font-weight: 500;">确认同步</button>
            </div>
          `
        });

        const syncEl = syncModalObj.modalEl;
        const accFilterInput = syncEl.querySelector('#datax-sync-acc-filter');
        const accSelect = syncEl.querySelector('#datax-sync-acc-select');
        const dsListEl = syncEl.querySelector('#datax-sync-ds-list');
        const btnAllDs = syncEl.querySelector('#datax-sync-ds-select-all');
        const btnClearDs = syncEl.querySelector('#datax-sync-ds-deselect-all');
        const chkIncludeRules = syncEl.querySelector('#datax-sync-include-rules');
        const rulesHintEl = syncEl.querySelector('#datax-sync-rules-hint');
        syncEl.querySelector('#datax-sync-cancel-btn').onclick = syncModalObj.close;

        let allSourceAccounts = [];
        let syncItems = [];

        const renderSyncDsList = () => {
          if (syncItems.length === 0) {
            dsListEl.innerHTML = '<div style="text-align: center; padding: 36px; color: #8c8c8c;">请选择有效的来源 API 账号</div>';
            return;
          }

          dsListEl.innerHTML = syncItems.map((item, idx) => {
            const tableSummary = item.allTables
              ? '全部表 (*)'
              : `已选 ${item.selectedTables.size} / ${item.sourceTables.length} 张表`;
            const ruleCount = (item.rowFilterRules || []).length;
            const ruleBadge = ruleCount > 0
              ? `<span style="background: #fff7e6; color: #d46b08; border: 1px solid #ffd591; padding: 1px 6px; border-radius: 3px; font-size: 10px;">含 ${ruleCount} 条行级规则</span>`
              : '<span style="color: #bfbfbf; font-size: 11px;">无行级规则</span>';
            const invalidBadge = !item.dsExists
              ? '<span style="background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; padding: 1px 6px; border-radius: 3px; font-size: 10px;">数据源已失效</span>'
              : '';

            let expandedHtml = '';
            if (item.expanded && !item.allTables && item.sourceTables.length > 0) {
              expandedHtml = `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e8e8e8;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 11px; color: #595959;">勾选需要同步的数据表：</span>
                    <div style="display: flex; gap: 6px;">
                      <button type="button" class="datax-sync-tbl-all" data-idx="${idx}" style="padding: 1px 6px; font-size: 10px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; cursor: pointer;">全选表</button>
                      <button type="button" class="datax-sync-tbl-none" data-idx="${idx}" style="padding: 1px 6px; font-size: 10px; border: 1px solid #d9d9d9; border-radius: 3px; background: #fff; cursor: pointer;">清空表</button>
                    </div>
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 150px; overflow-y: auto; padding: 4px; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 4px;">
                    ${item.sourceTables.map(tName => {
                      const tChecked = item.selectedTables.has(tName);
                      return `
                        <label style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 3px; border: 1px solid ${tChecked ? '#91d5ff' : '#d9d9d9'}; background: ${tChecked ? '#e6f7ff' : '#fff'}; cursor: pointer; font-size: 11px; font-family: 'SFMono-Regular', Consolas, Monaco, monospace;">
                          <input type="checkbox" class="datax-sync-tbl-cb" data-idx="${idx}" value="${safeEscapeHtml(tName)}" ${tChecked ? 'checked' : ''} style="cursor: pointer;" />
                          <span>${safeEscapeHtml(tName)}</span>
                        </label>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }

            return `
              <div style="background: #fff; border: 1px solid ${item.checked ? '#91d5ff' : '#e8e8e8'}; border-radius: 4px; padding: 8px 10px; opacity: ${item.dsExists ? '1' : '0.6'};">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <label style="display: flex; align-items: center; gap: 8px; cursor: ${item.dsExists ? 'pointer' : 'not-allowed'};">
                    <input type="checkbox" class="datax-sync-ds-cb" data-idx="${idx}" ${item.checked ? 'checked' : ''} ${!item.dsExists ? 'disabled' : ''} style="cursor: pointer;" />
                    <strong style="color: #262626;">${safeEscapeHtml(item.datasourceName)}</strong>
                    <span style="color: #1890ff; font-size: 11px;">(${tableSummary})</span>
                    ${ruleBadge}
                    ${invalidBadge}
                  </label>
                  ${(item.dsExists && !item.allTables && item.sourceTables.length > 0) ? `
                    <button type="button" class="datax-sync-expand-btn" data-idx="${idx}" style="padding: 2px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa; color: #595959; cursor: pointer;">
                      ${item.expanded ? '收起选表' : '展开选表'}
                    </button>
                  ` : ''}
                </div>
                ${expandedHtml}
              </div>
            `;
          }).join('');

          dsListEl.querySelectorAll('.datax-sync-ds-cb').forEach(cb => {
            cb.onchange = () => {
              const idx = Number(cb.getAttribute('data-idx'));
              const item = syncItems[idx];
              if (!item || !item.dsExists) return;
              item.checked = cb.checked;
              if (item.checked && !item.allTables && item.selectedTables.size === 0 && item.sourceTables.length > 0) {
                item.sourceTables.forEach(t => item.selectedTables.add(t));
              }
              renderSyncDsList();
            };
          });

          dsListEl.querySelectorAll('.datax-sync-expand-btn').forEach(btn => {
            btn.onclick = () => {
              const idx = Number(btn.getAttribute('data-idx'));
              if (!syncItems[idx]) return;
              syncItems[idx].expanded = !syncItems[idx].expanded;
              renderSyncDsList();
            };
          });

          dsListEl.querySelectorAll('.datax-sync-tbl-cb').forEach(cb => {
            cb.onchange = () => {
              const idx = Number(cb.getAttribute('data-idx'));
              const item = syncItems[idx];
              if (!item) return;
              const tbl = cb.value;
              if (cb.checked) {
                item.selectedTables.add(tbl);
                item.checked = true;
              } else {
                item.selectedTables.delete(tbl);
                if (item.selectedTables.size === 0) {
                  item.checked = false;
                }
              }
              renderSyncDsList();
            };
          });

          dsListEl.querySelectorAll('.datax-sync-tbl-all').forEach(btn => {
            btn.onclick = () => {
              const idx = Number(btn.getAttribute('data-idx'));
              const item = syncItems[idx];
              if (!item) return;
              item.sourceTables.forEach(t => item.selectedTables.add(t));
              item.checked = true;
              renderSyncDsList();
            };
          });

          dsListEl.querySelectorAll('.datax-sync-tbl-none').forEach(btn => {
            btn.onclick = () => {
              const idx = Number(btn.getAttribute('data-idx'));
              const item = syncItems[idx];
              if (!item) return;
              item.selectedTables.clear();
              item.checked = false;
              renderSyncDsList();
            };
          });
        };

        const loadSourceAccountPermissions = (accId) => {
          const srcAcc = allSourceAccounts.find(a => Number(a.id) === Number(accId));
          if (!srcAcc) {
            syncItems = [];
            renderSyncDsList();
            return;
          }
          const parsedList = parseAccountAuthList(srcAcc, this.datasources);
          syncItems = parsedList.map(p => {
            const dsExists = this.datasources.some(d => Number(d.id) === p.datasourceId);
            const srcTables = Array.from(p.tables || []).sort();
            return {
              datasourceId: p.datasourceId,
              datasourceName: p.datasourceName,
              dsExists,
              allTables: p.allTables,
              sourceTables: srcTables,
              selectedTables: new Set(srcTables),
              rowFilterRules: p.rowFilterRules || [],
              checked: dsExists,
              expanded: false
            };
          });

          const totalRuleCount = syncItems.reduce((sum, it) => sum + (it.rowFilterRules ? it.rowFilterRules.length : 0), 0);
          if (totalRuleCount > 0) {
            rulesHintEl.innerHTML = `<span style="color: #d46b08;">提示：来源账号包含 ${totalRuleCount} 条行级字段过滤规则，默认不勾选；如目标账号需复用相同过滤条件再勾选。</span>`;
          } else {
            rulesHintEl.textContent = '提示：来源账号未配置行级字段过滤规则。';
          }
          renderSyncDsList();
        };

        const renderSourceAccountOptions = () => {
          const kw = (accFilterInput.value || '').trim().toLowerCase();
          const filteredAccs = allSourceAccounts.filter(a => {
            if (!kw) return true;
            const name = (a.accountName || '').toLowerCase();
            const key = (a.appKey || '').toLowerCase();
            return name.includes(kw) || key.includes(kw);
          });
          if (filteredAccs.length === 0) {
            accSelect.innerHTML = '<option value="">无匹配的可同步账号</option>';
            syncItems = [];
            renderSyncDsList();
            return;
          }
          const prevVal = accSelect.value;
          accSelect.innerHTML = filteredAccs.map(a =>
            `<option value="${a.id}">${safeEscapeHtml(a.accountName)} (${safeEscapeHtml(a.appKey || '')})</option>`
          ).join('');
          if (prevVal && filteredAccs.some(a => String(a.id) === String(prevVal))) {
            accSelect.value = prevVal;
          }
          loadSourceAccountPermissions(accSelect.value);
        };

        accFilterInput.oninput = renderSourceAccountOptions;
        accSelect.onchange = () => loadSourceAccountPermissions(accSelect.value);

        btnAllDs.onclick = () => {
          syncItems.forEach(item => {
            if (!item.dsExists) return;
            item.checked = true;
            if (!item.allTables && item.selectedTables.size === 0) {
              item.sourceTables.forEach(t => item.selectedTables.add(t));
            }
          });
          renderSyncDsList();
        };

        btnClearDs.onclick = () => {
          syncItems.forEach(item => {
            item.checked = false;
          });
          renderSyncDsList();
        };

        syncEl.querySelector('#datax-sync-confirm-btn').onclick = async () => {
          const chosen = syncItems.filter(it => it.checked && it.dsExists && (it.allTables || it.selectedTables.size > 0));
          if (chosen.length === 0) {
            alert('请至少选择一个有效数据源库及数据表！');
            return;
          }

          const mergeModeEl = syncEl.querySelector('input[name="datax-sync-merge-mode"]:checked');
          const mergeMode = mergeModeEl ? mergeModeEl.value : 'append';
          const includeRules = Boolean(chkIncludeRules.checked);

          const cloneRules = (rules) => (rules || []).map(r => ({
            column: r.column || '',
            values: Array.isArray(r.values) ? [...r.values] : [],
            matchMode: r.matchMode === 'STRICT_TABLES' ? 'STRICT_TABLES' : 'AUTO_BY_COLUMN',
            tables: Array.isArray(r.tables) ? [...r.tables] : [],
            excludeTables: Array.isArray(r.excludeTables) ? [...r.excludeTables] : []
          }));

          chosen.forEach(src => {
            const clonedRules = includeRules ? cloneRules(src.rowFilterRules) : [];
            const existing = authList.find(a => a.datasourceId === src.datasourceId);
            if (!existing) {
              authList.push({
                datasourceId: src.datasourceId,
                datasourceName: src.datasourceName,
                allTables: src.allTables,
                tables: src.allTables ? new Set() : new Set(src.selectedTables),
                rowFilterRules: clonedRules
              });
            } else if (mergeMode === 'overwrite') {
              existing.allTables = src.allTables;
              existing.tables = src.allTables ? new Set() : new Set(src.selectedTables);
              if (includeRules) {
                existing.rowFilterRules = clonedRules;
              }
            } else {
              existing.allTables = existing.allTables || src.allTables;
              if (existing.allTables) {
                existing.tables = new Set();
              } else {
                src.selectedTables.forEach(t => existing.tables.add(t));
              }
              if (includeRules && clonedRules.length > 0) {
                const seen = new Set((existing.rowFilterRules || []).map(r =>
                  `${r.column}|${r.matchMode}|${(r.values || []).join(',')}`
                ));
                clonedRules.forEach(r => {
                  const sig = `${r.column}|${r.matchMode}|${(r.values || []).join(',')}`;
                  if (!seen.has(sig)) {
                    seen.add(sig);
                    existing.rowFilterRules.push(r);
                  }
                });
              }
            }
            rulePreviewCache[src.datasourceId] = null;
          });

          activeDsId = chosen[0].datasourceId;
          syncModalObj.close();
          updateDsAddBtnState();
          renderDsPills();
          await renderTableWorkspace();
          toast(`已${mergeMode === 'overwrite' ? '覆盖' : '追加'}同步 ${chosen.length} 个数据源权限，请核对后点击保存`);
        };

        try {
          const res = await fetch('/api/open/admin/account/page?pageNo=1&pageSize=1000', { headers: getAuthHeaders() });
          const json = await res.json();
          if (json && (json.code === 200 || json.code === 0) && json.data) {
            const curId = account && account.id ? Number(account.id) : null;
            allSourceAccounts = (json.data.records || []).filter(a => !curId || Number(a.id) !== curId);
            if (allSourceAccounts.length === 0) {
              accSelect.innerHTML = '<option value="">暂无其他可同步的 API 账号</option>';
              dsListEl.innerHTML = '<div style="text-align: center; padding: 36px; color: #8c8c8c;">当前系统暂无其他 API 账号可供同步</div>';
              return;
            }
            renderSourceAccountOptions();
          } else {
            dsListEl.innerHTML = `<div style="text-align: center; padding: 36px; color: #f5222d;">加载账号列表失败: ${safeEscapeHtml((json && json.msg) || '请求异常')}</div>`;
          }
        } catch (e) {
          dsListEl.innerHTML = `<div style="text-align: center; padding: 36px; color: #f5222d;">加载账号列表异常: ${safeEscapeHtml(e.message)}</div>`;
        }
      };

      if (dsSyncBtn) {
        dsSyncBtn.onclick = openSyncPermissionsModal;
      }

      // 4. 初次加载渲染
      renderDsPills();
      await renderTableWorkspace();
      updateDsAddBtnState();

      // 5. 保存提交
      modal.querySelector('#datax-acc-modal-submit').onclick = async () => {
        const name = modal.querySelector('#datax-form-acc-name').value.trim();
        const qps = Number(modal.querySelector('#datax-form-acc-qps').value) || 10;
        const status = Number(modal.querySelector('#datax-form-acc-status-sel').value);
        const ips = modal.querySelector('#datax-form-acc-ips').value.trim();
        const comments = modal.querySelector('#datax-form-acc-comments').value.trim();

        if (!name) {
          alert('请填写账号名称');
          return;
        }

        if (authList.length === 0) {
          alert('请至少配置一个授权数据源！');
          return;
        }

        // 校验各个库是否均已授权及行级字段过滤规则是否完整合法
        const colPattern = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
        const valPattern = /^[a-zA-Z0-9_-]{1,64}$/;
        const tblPattern = /^[a-zA-Z_][a-zA-Z0-9_$]{0,127}$/;
        for (const auth of authList) {
          if (!auth.allTables && auth.tables.size === 0) {
            alert(`数据源【${auth.datasourceName}】未勾选任何数据表，请勾选表或允许访问全部表！`);
            return;
          }
          const rules = Array.isArray(auth.rowFilterRules) ? auth.rowFilterRules : [];
          for (let rIdx = 0; rIdx < rules.length; rIdx++) {
            const rule = rules[rIdx];
            const colName = (rule.column || '').trim();
            if (!colName || !colPattern.test(colName)) {
              alert(`数据源【${auth.datasourceName}】第 ${rIdx + 1} 条规则的过滤字段名 [${colName}] 不合法，仅支持字母/数字/下划线且以字母或下划线开头！`);
              return;
            }
            const vals = Array.isArray(rule.values) ? rule.values : [];
            if (vals.length === 0) {
              alert(`数据源【${auth.datasourceName}】字段 [${colName}] 的过滤规则必须至少填写一个允许值！`);
              return;
            }
            const invalidVal = vals.find(v => !valPattern.test(v));
            if (invalidVal) {
              alert(`数据源【${auth.datasourceName}】字段 [${colName}] 的允许值 [${invalidVal}] 包含非法字符，仅支持字母、数字、下划线和连字符！`);
              return;
            }
            const checkTables = (rule.matchMode === 'STRICT_TABLES' ? rule.tables : rule.excludeTables) || [];
            const badTbl = checkTables.find(t => t !== '*' && !tblPattern.test(t));
            if (badTbl) {
              alert(`数据源【${auth.datasourceName}】字段 [${colName}] 配置的表名 [${badTbl}] 格式不合法！`);
              return;
            }
          }
        }

        // 打包多库授权配置（统一序列化为 rowFilterRules，旧字段置默认关闭以防双写歧义）
        const permissionsJson = JSON.stringify(authList.map(a => ({
          datasourceId: a.datasourceId,
          datasourceName: a.datasourceName,
          allTables: a.allTables,
          tables: a.allTables ? [] : Array.from(a.tables),
          tenantIsolationEnabled: false,
          tenantColumn: 'tenant_id',
          tenantValues: [],
          tenantExemptTables: [],
          rowFilterRules: (a.rowFilterRules || []).map(r => ({
            column: (r.column || '').trim(),
            values: r.values || [],
            matchMode: r.matchMode === 'STRICT_TABLES' ? 'STRICT_TABLES' : 'AUTO_BY_COLUMN',
            tables: r.matchMode === 'STRICT_TABLES' ? (r.tables || []) : [],
            excludeTables: r.matchMode === 'STRICT_TABLES' ? [] : (r.excludeTables || [])
          }))
        })));

        const primaryAuth = authList[0];
        const payload = {
          id: account ? account.id : null,
          accountName: name,
          datasourceId: primaryAuth.datasourceId,
          allowedTables: primaryAuth.allTables ? '*' : Array.from(primaryAuth.tables).join(','),
          permissions: permissionsJson,
          rateLimitQps: qps,
          status: status,
          allowedIps: ips,
          comments: comments
        };

        try {
          const res = await fetch('/api/open/admin/account/save', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json && (json.code === 200 || json.code === 0)) {
            toast('保存成功');
            closeModal();
            this.loadAccounts();
            if (!isEdit && json.data) {
              this.showSecretModal(json.data.id, json.data.appKey, json.data.appSecret);
            }
          } else {
            alert('保存失败: ' + (json.msg || '未知错误'));
          }
        } catch (e) {
          alert('保存异常: ' + e.message);
        }
      };
    }

    /**
     * 生成融合了 AI 数仓提数智能体 Prompt 规范与当前 OpenAPI 接入契约的完整提示词规范文档
     * (已完全提取至 static/js/assistant/templates/open_api_templates.js 独立维护)
     *
     * @param {string} [appKey] 可选，当前账号的 AccessKey
     * @param {string} [appSecret] 可选，当前账号的 AppSecret
     * @return {string} 结构化 Markdown 文档
     */
    generateAiPromptDoc(appKey = '', appSecret = '') {
      if (window.DataXAssistant && window.DataXAssistant.OpenApiTemplates) {
        return window.DataXAssistant.OpenApiTemplates.getAiPrompt(appKey, appSecret);
      }
      return '';
    }

    async showSecretModal(id, appKey, appSecret) {
      let currentSecret = appSecret || '';

      const modalObj = createDraggableModal({
        modalId: 'datax-secret-detail-modal',
        dialogId: 'datax-secret-detail-dialog',
        title: 'API 凭据信息',
        width: 620,
        height: 380,
        minWidth: 500,
        minHeight: 320,
        storageKeyPrefix: 'datax_oa_secret',
        zIndex: 1000040,
        bodyHtml: `
          <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 12px;">
            <div style="background: #fffbe6; border: 1px solid #ffe58f; padding: 8px 10px; border-radius: 4px; color: #d46b08;">
              请妥善保管您的 Secret 密钥，泄露后任何人均可伪造签名发起数据查询！
            </div>
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 4px;">AccessKey (AK)：</label>
              <div style="display: flex; gap: 6px;">
                <input type="text" readonly id="datax-secret-ak-input" value="${safeEscapeHtml(appKey)}" style="flex: 1; padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; background: #f5f5f5;" />
                <button id="datax-secret-copy-ak" style="padding: 5px 12px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">复制</button>
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 4px;">AppSecret (SK)：</label>
              <div style="display: flex; gap: 6px;">
                <input type="text" readonly id="datax-secret-sk-input" value="${safeEscapeHtml(appSecret || '••••••••••••••••••••••••••••••••')}" style="flex: 1; padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 4px; background: #f5f5f5;" />
                ${appSecret ? '<button id="datax-secret-copy-sk" style="padding: 5px 12px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">复制</button>' : ''}
              </div>
            </div>
          </div>
        `,
        footerHtml: `
          <div style="padding: 10px 16px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <div style="display: flex; gap: 8px;">
              <button id="datax-secret-reset-btn" style="padding: 5px 12px; border: 1px solid #ff4d4f; color: #ff4d4f; border-radius: 4px; background: #fff; cursor: pointer; white-space: nowrap;">重置 Secret 密钥</button>
              <button id="datax-secret-doc-btn" style="padding: 5px 12px; border: 1px solid #d9d9d9; color: #595959; border-radius: 4px; background: #fff; cursor: pointer; white-space: nowrap;">API 说明</button>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="datax-secret-copy-ak-sk" style="padding: 5px 12px; border: 1px solid #d9d9d9; color: #595959; border-radius: 4px; background: #fff; cursor: pointer; white-space: nowrap;">复制 AK/SK</button>
              <button id="datax-secret-copy-all" style="padding: 5px 14px; border: 1px solid #1890ff; color: #1890ff; border-radius: 4px; background: #fff; cursor: pointer; font-weight: 500; white-space: nowrap;">一键复制密钥MCP 配置</button>
              <button id="datax-secret-confirm-btn" style="padding: 5px 16px; border: none; border-radius: 4px; background: #1890ff; color: #fff; cursor: pointer; white-space: nowrap;">知道了</button>
            </div>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-secret-confirm-btn').onclick = closeModal;

      modal.querySelector('#datax-secret-copy-ak').onclick = () => {
        copyText(appKey, 'AccessKey 已复制');
      };
      const copySkBtn = modal.querySelector('#datax-secret-copy-sk');
      if (copySkBtn) {
        copySkBtn.onclick = () => copyText(currentSecret, 'AppSecret 已复制');
      }

      const docBtn = modal.querySelector('#datax-secret-doc-btn');
      if (docBtn) {
        docBtn.onclick = () => this.showApiDocModal(appKey, currentSecret);
      }

      // 若当前 Secret 为空或脱敏掩码，则尝试从后端拉取完整明文
      if (!currentSecret || currentSecret.includes('•')) {
        const skInput = modal.querySelector('#datax-secret-sk-input');
        if (skInput) {
          skInput.placeholder = '正在安全加载密钥...';
        }
        fetch(`/api/open/admin/account/getSecret?id=${id}`, {
          method: 'GET',
          headers: getAuthHeaders()
        })
          .then(res => res.json())
          .then(json => {
            if (json && (json.code === 200 || json.code === 0) && json.data) {
              currentSecret = json.data;
              if (skInput) skInput.value = currentSecret;
              let skBtn = modal.querySelector('#datax-secret-copy-sk');
              if (!skBtn) {
                skBtn = document.createElement('button');
                skBtn.id = 'datax-secret-copy-sk';
                skBtn.textContent = '复制';
                skBtn.style.cssText = 'padding: 5px 12px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer;';
                skInput.parentElement.appendChild(skBtn);
              }
              skBtn.onclick = () => copyText(currentSecret, 'AppSecret 已复制');
            }
          })
          .catch(() => { });
      }

      // 仅复制纯文本 AK/SK
      const copyAkSkBtn = modal.querySelector('#datax-secret-copy-ak-sk');
      if (copyAkSkBtn) {
        copyAkSkBtn.onclick = () => {
          if (currentSecret && !currentSecret.includes('•')) {
            const combined = `AccessKey: ${appKey}\nAppSecret: ${currentSecret}`;
            copyText(combined, 'AK 与 Secret 凭据已复制到剪贴板！');
          } else {
            const combined = `AccessKey: ${appKey}`;
            copyText(combined, 'AccessKey 已复制（当前 Secret 未解密，如需完整凭据请点击【重置 Secret 密钥】）');
          }
        };
      }

      // 一键复制密钥MCP 配置：打开针对 Trae / DeepSeek Harness 的 MCP 接入配置弹窗
      modal.querySelector('#datax-secret-copy-all').onclick = () => {
        this.showMcpConfigModal(appKey, currentSecret);
      };

      // 重置密钥
      modal.querySelector('#datax-secret-reset-btn').onclick = async () => {
        const confirmed = await confirm('重置密钥后，原 Secret 将立即失效，三方接入系统需同步更新，确定要重置吗？');
        if (!confirmed) return;

        try {
          const res = await fetch(`/api/open/admin/account/resetSecret?id=${id}`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          const json = await res.json();
          if (json && (json.code === 200 || json.code === 0)) {
            toast('密钥重置成功！');
            const newSk = json.data;
            currentSecret = newSk;
            modal.querySelector('#datax-secret-sk-input').value = newSk;
            let skBtn = modal.querySelector('#datax-secret-copy-sk');
            if (!skBtn) {
              skBtn = document.createElement('button');
              skBtn.id = 'datax-secret-copy-sk';
              skBtn.textContent = '复制';
              skBtn.style.cssText = 'padding: 5px 12px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer;';
              modal.querySelector('#datax-secret-sk-input').parentElement.appendChild(skBtn);
            }
            skBtn.onclick = () => copyText(newSk, 'AppSecret 已复制');
            this.loadAccounts();
          } else {
            alert('重置失败: ' + (json.msg || '未知错误'));
          }
        } catch (e) {
          alert('重置异常: ' + e.message);
        }
      };
    }

    /**
     * 打开针对 Trae / DeepSeek Harness / Antigravity 的 MCP 接入与自动化配置弹窗
     *
     * @param {string} [appKey] 可选，当前账号的 AccessKey
     * @param {string} [appSecret] 可选，当前账号的 AppSecret
     */
    showMcpConfigModal(appKey = '', appSecret = '') {
      const ak = appKey || 'YOUR_ACCESS_KEY';
      const sk = (appSecret && !appSecret.includes('•')) ? appSecret : 'YOUR_APP_SECRET';
      const origin = window.location.origin || 'http://localhost:8080';

      const templates = window.DataXAssistant?.OpenApiTemplates;
      const batScript = templates?.getWindowsSetupBatScript?.(ak, sk, origin) || '';
      const mcpJson = templates?.getMcpConfigJson?.(ak, sk, origin) || '';
      const mcpScript = templates?.getPythonMcpScript?.() || '';

      function downloadTextFile(filename, text) {
        const normalizedText = filename.endsWith('.bat') ? text.replace(/\r?\n/g, '\r\n') : text;
        const blob = new Blob([normalizedText], { type: 'application/octet-stream;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('脚本已开始下载');
      }

      const modalObj = createDraggableModal({
        modalId: 'datax-mcp-config-modal',
        dialogId: 'datax-mcp-config-dialog',
        title: '通用 MCP 接入与密钥配置 (Trae / Trae CN / Qoder / Qoder CN / DeepSeek / WorkBuddy / OpenCode / Codex / 全平台通用)',
        width: 900,
        height: 720,
        minWidth: 620,
        minHeight: 460,
        storageKeyPrefix: 'datax_oa_mcp_config',
        zIndex: 1000060,
        bodyHtml: `
          <!-- 安全防泄露警示横幅 -->
          <div style="background: #fffbe6; border-bottom: 1px solid #ffe58f; padding: 10px 18px; color: #d46b08; font-size: 12px; line-height: 1.5; flex-shrink: 0;">
            <strong>安全提示：</strong> 下方配置已自动注入当前账号的真实 AccessKey 与 AppSecret。请将配置保存在您本地电脑的 MCP 配置文件中，<strong>严禁将包含明文密钥的文件提交至公网 Git 仓库，严禁直接复制到网页大模型对话框中！</strong>
          </div>

          <!-- Tab 选项卡头部 -->
          <div style="display: flex; gap: 4px; border-bottom: 1px solid #e8e8e8; background: #fafafa; padding: 0 18px; flex-shrink: 0;">
            <button id="datax-mcp-tab-btn-bat" class="datax-mcp-tab-btn" style="padding: 10px 16px; border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500; color: #1890ff; border-bottom: 2px solid #1890ff; outline: none;">一键脚本 (全平台自动写入)</button>
            <button id="datax-mcp-tab-btn-manual" class="datax-mcp-tab-btn" style="padding: 10px 16px; border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 400; color: #595959; border-bottom: 2px solid transparent; outline: none;">手动配置 (mcp.json / 代码)</button>
            <button id="datax-mcp-tab-btn-guide" class="datax-mcp-tab-btn" style="padding: 10px 16px; border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 400; color: #595959; border-bottom: 2px solid transparent; outline: none;">各工具接入指南</button>
          </div>

          <!-- Tab 内容面板容器 -->
          <div style="padding: 16px 18px; flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto;">
            
            <!-- 面板 1: Windows 一键脚本 (双击运行) -->
            <div id="datax-mcp-panel-bat" class="datax-mcp-panel" style="display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 12px;">
              <div style="background: #f6ffed; border: 1px solid #b7eb8f; padding: 12px 16px; border-radius: 4px; color: #389e0d; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="font-size: 13px;">Windows 一键自动化配置脚本 (全平台覆盖)：</strong><br/>
                  <span style="font-size: 11px; color: #52c41a;">无需与任何 AI 对话，下载后直接双击运行！若本机未安装 Python，脚本将通过国内官方高速镜像全自动静默安装配置 Python 3.11，并全自动完成 pip 依赖安装及 Trae / Trae CN、腾讯云 Qoder / Qoder CN、DeepSeek、WorkBuddy、OpenCode、Codex、Antigravity、Cursor 等全平台本地配置注入！</span>
                </div>
                <button id="datax-mcp-download-bat-btn" style="padding: 6px 18px; background: #52c41a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; white-space: nowrap;">下载安装脚本 (setup_mcp.bat)</button>
              </div>
              <div style="color: #8c8c8c; font-size: 11px;">脚本源码预览 (已内置当前账号凭据，双击执行)：</div>
              <textarea readonly id="datax-mcp-bat-textarea" style="width: 100%; flex: 1; min-height: 320px; box-sizing: border-box; padding: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #282c34; color: #abb2bf; font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 12px; line-height: 1.5; resize: none; outline: none; white-space: pre;">${safeEscapeHtml(batScript)}</textarea>
            </div>

            <!-- 面板 2: 手动配置 (自定义模式) -->
            <div id="datax-mcp-panel-manual" class="datax-mcp-panel" style="display: none; flex-direction: column; flex: 1; min-height: 0; gap: 10px;">
              <div style="display: flex; gap: 8px;">
                <button id="datax-mcp-subtab-json" style="padding: 4px 12px; border: 1px solid #1890ff; background: #e6f7ff; color: #1890ff; border-radius: 4px; cursor: pointer; font-size: 11px;">通用 mcp.json 配置片段</button>
                <button id="datax-mcp-subtab-script" style="padding: 4px 12px; border: 1px solid #d9d9d9; background: #fff; color: #595959; border-radius: 4px; cursor: pointer; font-size: 11px;">通用客户端脚本 (datax_mcp.py)</button>
              </div>
              
              <div id="datax-mcp-subpanel-json" style="display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; color: #8c8c8c; font-size: 11px;">
                  <span>标准 MCP JSON，可配置到 Trae / DeepSeek / WorkBuddy / Qoder / OpenCode / Codex / Antigravity / Cursor 等任何工具中：</span>
                  <button id="datax-mcp-copy-json-inline" style="padding: 3px 10px; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 3px; cursor: pointer; font-size: 11px;">复制 JSON</button>
                </div>
                <textarea readonly id="datax-mcp-json-textarea" style="width: 100%; flex: 1; min-height: 330px; box-sizing: border-box; padding: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #282c34; color: #abb2bf; font-family: Consolas, monospace; font-size: 12px; line-height: 1.5; resize: none; outline: none; white-space: pre;">${safeEscapeHtml(mcpJson)}</textarea>
              </div>

              <div id="datax-mcp-subpanel-script" style="display: none; flex-direction: column; flex: 1; min-height: 0; gap: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; color: #8c8c8c; font-size: 11px;">
                  <span>保存为本地工作区的 <code>datax_mcp.py</code>，需执行 <code>pip install mcp requests</code>：</span>
                  <button id="datax-mcp-copy-script-inline" style="padding: 3px 10px; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 3px; cursor: pointer; font-size: 11px;">复制代码</button>
                </div>
                <textarea readonly id="datax-mcp-script-textarea" style="width: 100%; flex: 1; min-height: 330px; box-sizing: border-box; padding: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #282c34; color: #abb2bf; font-family: Consolas, monospace; font-size: 12px; line-height: 1.5; resize: none; outline: none; white-space: pre;">${safeEscapeHtml(mcpScript)}</textarea>
              </div>
            </div>

            <!-- 面板 3: 本地接入指引 -->
            <div id="datax-mcp-panel-guide" class="datax-mcp-panel" style="display: none; flex-direction: column; flex: 1; min-height: 0; gap: 14px; font-size: 12px; line-height: 1.6; color: #262626; overflow-y: auto;">
              <div style="background: #f6ffed; border: 1px solid #b7eb8f; padding: 12px 14px; border-radius: 4px; color: #389e0d;">
                <strong>核心通用性与安全机制：</strong><br/>
                基于 Anthropic 官方 Model Context Protocol (MCP) 开放标准，兼容所有主流 AI Agent 工具。私钥与签名计算全程在本地完成，杜绝凭据泄露。
              </div>

              <div>
                <h4 style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #1f1f1f; border-left: 3px solid #1890ff; padding-left: 8px;">推荐使用方式</h4>
                <ul style="margin: 0; padding-left: 20px; color: #595959;">
                  <li style="margin-bottom: 6px;"><strong>方式 1（推荐：本地一键脚本）</strong>：在「一键脚本」标签页下载 <code>setup_mcp.bat</code> 双击运行，私钥全程留存本地，全自动完成依赖安装并注入本地已安装的 AI 工具。</li>
                  <li style="margin-bottom: 6px;"><strong>方式 2（手动配置）</strong>：在「手动配置」标签页复制 <code>mcp.json</code> 片段与 <code>datax_mcp.py</code> 客户端代码，手动配置到对应工具中。</li>
                </ul>
              </div>

              <div>
                <h4 style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #1f1f1f; border-left: 3px solid #1890ff; padding-left: 8px;">各 AI 工具配置文件路径参考 (Windows)</h4>
                <div style="background: #fafafa; border: 1px solid #e8e8e8; padding: 8px 12px; border-radius: 4px; font-family: Consolas, monospace; font-size: 11px; color: #595959; line-height: 1.8;">
                  • <strong>字节跳动 Trae / Trae CN (国内版)</strong>: %APPDATA%\\Trae CN\\User\\mcp.json 或 %APPDATA%\\Trae\\User\\mcp.json (工程根目录 .trae\\mcp.json 或 .trae-cn\\mcp.json)<br/>
                  • <strong>DeepSeek Harness (DSH)</strong>: %USERPROFILE%\\.dsh\\profiles\\desktop\\cordis.patch.yml<br/>
                  • <strong>腾讯 WorkBuddy (连接器中心)</strong>: %USERPROFILE%\\.workbuddy-ai\\mcp.json (或 %USERPROFILE%\\.workbuddy\\mcp.json)<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #8c8c8c; font-size: 11px;">(注：WorkBuddy 需显式声明 <code>"type": "stdio"</code>；脚本已自动注入信任，若手动添加请在客户端「连接器」页面中点击「信任/启用」)</span><br/>
                  • <strong>腾讯云 Qoder / Qoder CN (国内版)</strong>: %USERPROFILE%\\.qoder\\settings.json 或 %APPDATA%\\com.qoder.app.stable\\User\\settings.json (工程根目录 .qoder\\settings.json)<br/>
                  • <strong>OpenCode (opencode.ai)</strong>: %USERPROFILE%\\.config\\opencode\\opencode.json (或工程根目录 opencode.json)<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #8c8c8c; font-size: 11px;">(注：OpenCode 采用 <code>mcp</code> 根节点与 <code>"type": "local"</code>，命令采用数组 <code>["python", "..."]</code>)</span><br/>
                  • <strong>OpenAI Codex</strong>: %USERPROFILE%\\.codex\\config.toml (或工程根目录 .codex\\config.toml)<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #8c8c8c; font-size: 11px;">(注：Codex 采用 TOML 格式，支持 <code>[mcp_servers.datax-web]</code> 与 <code>[mcp_servers.datax-web.env]</code>)</span><br/>
                  • <strong>Google Antigravity</strong>: %USERPROFILE%\\.gemini\\config\\mcp_config.json<br/>
                  • <strong>Cursor</strong>: %USERPROFILE%\\.cursor\\mcp.json (或工程根目录 .cursor\\mcp.json)<br/>
                  • <strong>Claude Desktop</strong>: %APPDATA%\\Claude\\claude_desktop_config.json<br/>
                  • <strong>Windsurf</strong>: %USERPROFILE%\\.codeium\\windsurf\\mcp_config.json<br/>
                  • <strong>VS Code (Cline / Roo)</strong>: %APPDATA%\\Code\\User\\globalStorage\\...\\settings\\mcp_settings.json
                </div>
              </div>
            </div>

          </div>
        `,
        footerHtml: `
          <div style="padding: 10px 18px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <span style="color: #8c8c8c; font-size: 11px;">可在上方文本框直接全选，也可点击右侧按钮一键操作</span>
            <div style="gap: 10px; display: flex;">
              <button id="datax-mcp-copy-active-btn" style="padding: 6px 18px; background: #52c41a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">下载安装脚本 (setup_mcp.bat)</button>
              <button id="datax-mcp-close-btn" style="padding: 6px 16px; border: 1px solid #d9d9d9; background: #fff; color: #595959; border-radius: 4px; cursor: pointer; font-size: 12px;">关闭</button>
            </div>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-mcp-close-btn').onclick = closeModal;

      let currentTab = 'bat';
      const tabBtnBat = modal.querySelector('#datax-mcp-tab-btn-bat');
      const tabBtnManual = modal.querySelector('#datax-mcp-tab-btn-manual');
      const tabBtnGuide = modal.querySelector('#datax-mcp-tab-btn-guide');
      const panelBat = modal.querySelector('#datax-mcp-panel-bat');
      const panelManual = modal.querySelector('#datax-mcp-panel-manual');
      const panelGuide = modal.querySelector('#datax-mcp-panel-guide');
      const copyActiveBtn = modal.querySelector('#datax-mcp-copy-active-btn');

      function switchTab(tabKey) {
        currentTab = tabKey;
        [tabBtnBat, tabBtnManual, tabBtnGuide].forEach(btn => {
          btn.style.borderBottom = '2px solid transparent';
          btn.style.color = '#595959';
          btn.style.fontWeight = '400';
        });
        [panelBat, panelManual, panelGuide].forEach(panel => panel.style.display = 'none');

        if (tabKey === 'bat') {
          tabBtnBat.style.borderBottom = '2px solid #1890ff';
          tabBtnBat.style.color = '#1890ff';
          tabBtnBat.style.fontWeight = '500';
          panelBat.style.display = 'flex';
          copyActiveBtn.style.display = 'inline-block';
          copyActiveBtn.style.background = '#52c41a';
          copyActiveBtn.textContent = '下载安装脚本 (setup_mcp.bat)';
        } else if (tabKey === 'manual') {
          tabBtnManual.style.borderBottom = '2px solid #1890ff';
          tabBtnManual.style.color = '#1890ff';
          tabBtnManual.style.fontWeight = '500';
          panelManual.style.display = 'flex';
          copyActiveBtn.style.display = 'inline-block';
          copyActiveBtn.style.background = '#1890ff';
          copyActiveBtn.textContent = '复制当前配置';
        } else if (tabKey === 'guide') {
          tabBtnGuide.style.borderBottom = '2px solid #1890ff';
          tabBtnGuide.style.color = '#1890ff';
          tabBtnGuide.style.fontWeight = '500';
          panelGuide.style.display = 'flex';
          copyActiveBtn.style.display = 'none';
        }
      }

      tabBtnBat.onclick = () => switchTab('bat');
      tabBtnManual.onclick = () => switchTab('manual');
      tabBtnGuide.onclick = () => switchTab('guide');

      // 面板 1 下载与复制代码
      modal.querySelector('#datax-mcp-download-bat-btn').onclick = () => {
        downloadTextFile('setup_mcp.bat', batScript);
      };

      // 面板 2 手动配置子 Tab 切换
      let currentManualSub = 'json';
      const subtabJson = modal.querySelector('#datax-mcp-subtab-json');
      const subtabScript = modal.querySelector('#datax-mcp-subtab-script');
      const subpanelJson = modal.querySelector('#datax-mcp-subpanel-json');
      const subpanelScript = modal.querySelector('#datax-mcp-subpanel-script');

      subtabJson.onclick = () => {
        currentManualSub = 'json';
        subtabJson.style.background = '#e6f7ff';
        subtabJson.style.borderColor = '#1890ff';
        subtabJson.style.color = '#1890ff';
        subtabScript.style.background = '#fff';
        subtabScript.style.borderColor = '#d9d9d9';
        subtabScript.style.color = '#595959';
        subpanelJson.style.display = 'flex';
        subpanelScript.style.display = 'none';
      };

      subtabScript.onclick = () => {
        currentManualSub = 'script';
        subtabScript.style.background = '#e6f7ff';
        subtabScript.style.borderColor = '#1890ff';
        subtabScript.style.color = '#1890ff';
        subtabJson.style.background = '#fff';
        subtabJson.style.borderColor = '#d9d9d9';
        subtabJson.style.color = '#595959';
        subpanelScript.style.display = 'flex';
        subpanelJson.style.display = 'none';
      };

      modal.querySelector('#datax-mcp-copy-json-inline').onclick = () => {
        copyText(mcpJson, 'MCP 配置 JSON 已复制到剪贴板！');
      };
      modal.querySelector('#datax-mcp-copy-script-inline').onclick = () => {
        copyText(mcpScript, 'Python MCP 客户端代码已复制到剪贴板！');
      };

      copyActiveBtn.onclick = () => {
        if (currentTab === 'bat') {
          downloadTextFile('setup_mcp.bat', batScript);
        } else if (currentTab === 'manual') {
          if (currentManualSub === 'json') {
            copyText(mcpJson, 'MCP 配置 JSON 已复制到剪贴板！');
          } else {
            copyText(mcpScript, 'Python MCP 客户端代码已复制到剪贴板！');
          }
        }
      };
    }

    /**
     * 打开 AI 提数 Prompt 规范整体预览与复制弹窗
     *
     * @param {string} [appKey] 可选，当前账号的 AccessKey
     * @param {string} [appSecret] 可选，当前账号的 AppSecret
     */
    showPromptPreviewModal(appKey = '', appSecret = '') {
      const doc = this.generateAiPromptDoc(appKey, appSecret);

      const modalObj = createDraggableModal({
        modalId: 'datax-prompt-preview-modal',
        dialogId: 'datax-prompt-preview-dialog',
        title: 'AI 提数 Prompt 规范整体预览',
        width: 860,
        height: 720,
        minWidth: 580,
        minHeight: 420,
        storageKeyPrefix: 'datax_oa_prompt_preview',
        zIndex: 1000060,
        bodyHtml: `
          <!-- 提示横幅 -->
          <div style="background: #e6f7ff; border-bottom: 1px solid #91d5ff; padding: 10px 18px; color: #0050b3; font-size: 12px; line-height: 1.5; flex-shrink: 0;">
            已自动注入当前账号的真实密钥凭据与网关接口地址。核对下方完整 Prompt 规范无误后，点击右下方按钮可一键复制并直接发给 ChatGPT、Claude 或 DeepSeek 开展提数与编码。
          </div>

          <!-- 核心预览文本区域 -->
          <div style="padding: 16px 18px; flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; color: #8c8c8c; font-size: 11px; flex-shrink: 0;">
              <span>预览内容格式: Markdown (System Prompt 规范)</span>
              <span>字数统计: 约 ${doc.length} 字</span>
            </div>
            <textarea readonly id="datax-preview-textarea" style="width: 100%; flex: 1; min-height: 320px; box-sizing: border-box; padding: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #282c34; color: #abb2bf; font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 12px; line-height: 1.5; resize: none; outline: none; white-space: pre;">${safeEscapeHtml(doc)}</textarea>
          </div>
        `,
        footerHtml: `
          <div style="padding: 10px 18px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <span style="color: #8c8c8c; font-size: 11px;">可在上方文本框直接 Ctrl+A 全选，也可点击右侧按钮复制</span>
            <div style="gap: 10px; display: flex;">
              <button id="datax-preview-copy-btn" style="padding: 6px 18px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">一键复制完整 Prompt</button>
              <button id="datax-preview-cancel-btn" style="padding: 6px 16px; border: 1px solid #d9d9d9; background: #fff; color: #595959; border-radius: 4px; cursor: pointer; font-size: 12px;">关闭</button>
            </div>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-preview-cancel-btn').onclick = closeModal;

      modal.querySelector('#datax-preview-copy-btn').onclick = () => {
        copyText(doc, 'AI 提数 Prompt 规范已整体复制！可直接粘贴发给 AI 开始提数');
      };
    }

    /**
     * 打开开放 API 接入说明与调用指南弹窗
     *
     * @param {string} [appKey] 可选，当前账号的 AccessKey
     * @param {string} [appSecret] 可选，当前账号的 AppSecret
     */
    showApiDocModal(appKey = '', appSecret = '') {
      const ak = appKey || 'YOUR_ACCESS_KEY';
      const sk = (appSecret && !appSecret.includes('•')) ? appSecret : 'YOUR_APP_SECRET';
      const origin = window.location.origin || 'http://localhost:8080';

      const pythonDemo = (window.DataXAssistant && window.DataXAssistant.OpenApiTemplates)
        ? window.DataXAssistant.OpenApiTemplates.getPythonDemo(appKey, appSecret, origin)
        : '';
      const aiMarkdownDoc = this.generateAiPromptDoc(appKey, appSecret);

      const modalObj = createDraggableModal({
        modalId: 'datax-openapi-doc-modal',
        dialogId: 'datax-openapi-doc-dialog',
        title: '开放 API 接入说明与调用指南',
        width: 900,
        height: 760,
        minWidth: 620,
        minHeight: 440,
        storageKeyPrefix: 'datax_oa_apidoc',
        zIndex: 1000050,
        bodyHtml: `
          <div style="padding: 18px; display: flex; flex-direction: column; gap: 16px; font-size: 12px;">
            <!-- 基础信息卡片 -->
            <div style="background: #f6ffed; border: 1px solid #b7eb8f; padding: 10px 14px; border-radius: 4px; color: #389e0d; line-height: 1.6;">
              <strong>网关入口与安全规范：</strong><br/>
              • 基础路径 (Base URL)：<code style="background: #fff; padding: 2px 6px; border: 1px solid #d9d9d9; border-radius: 3px; color: #096dd9;">${origin}/api/open/v1</code> <span style="color: #8c8c8c; font-size: 11px;">(外部系统调用请替换为服务器真实对外 IP 或域名)</span><br/>
              • 通信格式：统一为 <code style="background: #fff; padding: 2px 6px; border: 1px solid #d9d9d9; border-radius: 3px;">application/json</code>，字符集 UTF-8。<br/>
              • 核心安全防线：物理只读连接池、10 秒超时强制 Kill、单次结果集截断上限 1000 条、敏感字段自动掩码脱敏、跑批门禁检查。
            </div>

            <!-- 签名认证规范 -->
            <div>
              <h4 style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #1f1f1f; border-left: 3px solid #1890ff; padding-left: 8px;">1. HMAC-SHA256 签名算法 (HTTP Headers)</h4>
              <p style="margin: 0 0 6px; color: #595959;">所有请求必须在 HTTP Request Headers 中携带以下 4 个安全鉴权字段：</p>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px;">
                <thead>
                  <tr style="background: #fafafa; border: 1px solid #e8e8e8;">
                    <th style="padding: 6px 10px; border: 1px solid #e8e8e8; width: 110px;">Header 字段</th>
                    <th style="padding: 6px 10px; border: 1px solid #e8e8e8; width: 80px;">类型</th>
                    <th style="padding: 6px 10px; border: 1px solid #e8e8e8;">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border: 1px solid #e8e8e8;">
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8; font-family: monospace;">accessKey</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">String</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">分配的应用唯一公钥 AK</td>
                  </tr>
                  <tr style="border: 1px solid #e8e8e8;">
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8; font-family: monospace;">timestamp</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">Long</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">当前时间戳（毫秒），与服务器时差超过 300 秒自动拒绝</td>
                  </tr>
                  <tr style="border: 1px solid #e8e8e8;">
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8; font-family: monospace;">nonce</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">String</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">唯一随机字符串（如 UUID），防重放攻击拦截</td>
                  </tr>
                  <tr style="border: 1px solid #e8e8e8;">
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8; font-family: monospace;">sign</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">String</td>
                    <td style="padding: 6px 10px; border: 1px solid #e8e8e8;">使用 AppSecret 对待签字串进行 HMAC-SHA256 运算得到的 64 位十六进制小写哈希</td>
                  </tr>
                </tbody>
              </table>
              <div style="background: #fafafa; border: 1px solid #e8e8e8; padding: 8px 10px; border-radius: 4px; font-family: Consolas, monospace; font-size: 11px; color: #595959;">
                <strong>待签字符串拼接规则：</strong><br/>
                stringToSign = HTTP_METHOD + "\\n" + REQUEST_PATH + "\\n" + accessKey + "\\n" + timestamp + "\\n" + nonce<br/>
                <span style="color: #8c8c8c;">示例: 'GET\\n/api/open/v1/metadata/tables\\nak_xxx\\n1730000000000\\n8a7b6c5d'</span>
              </div>
            </div>

            <!-- 可用 API 清单 -->
            <div>
              <h4 style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #1f1f1f; border-left: 3px solid #1890ff; padding-left: 8px;">2. 可用开放 API 清单</h4>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="border: 1px solid #e8e8e8; border-radius: 4px; padding: 10px 12px; background: #fff;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; font-weight: 600; padding: 1px 6px; border-radius: 3px; font-size: 11px;">GET</span>
                    <strong style="font-family: monospace; font-size: 13px; color: #262626;">/api/open/v1/metadata/tables</strong>
                    <span style="color: #595959; font-size: 11px;">查询已授权库表结构元数据</span>
                  </div>
                  <div style="color: #8c8c8c; font-size: 11px; line-height: 1.5;">
                    • Query 参数: datasourceId (可选，不传返回当前账号已授权的所有数据源)<br/>
                    • 返回内容: 数据源 ID、数据源名称、表名、表中中文注释、字段名、数据类型与字段注释（敏感字段自动屏蔽）。
                  </div>
                </div>

                <div style="border: 1px solid #e8e8e8; border-radius: 4px; padding: 10px 12px; background: #fff;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; font-weight: 600; padding: 1px 6px; border-radius: 3px; font-size: 11px;">POST</span>
                    <strong style="font-family: monospace; font-size: 13px; color: #262626;">/api/open/v1/sql/execute</strong>
                    <span style="color: #595959; font-size: 11px;">安全执行只读 SQL 查询</span>
                  </div>
                  <div style="color: #8c8c8c; font-size: 11px; line-height: 1.5;">
                    • Body (JSON): <code>{"datasourceId": 8, "sql": "SELECT ... LIMIT 10"}</code><br/>
                    • 安全防线: SQL 经 AST 语法树解析，跨库/跨表越权立即拦截；严禁写入命令与探测函数；强制 10 秒超时中断与 1000 行截断保护。
                  </div>
                </div>
              </div>
            </div>

            <!-- Python 客户端代码示例 -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: #1f1f1f; border-left: 3px solid #1890ff; padding-left: 8px;">3. 客户端调用示例 (Python)</h4>
                <button id="datax-doc-copy-python" style="padding: 3px 12px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">复制 Python 代码</button>
              </div>
              <pre style="background: #282c34; color: #abb2bf; padding: 12px; border-radius: 4px; max-height: 280px; overflow-y: auto; font-size: 11px; line-height: 1.45; font-family: Consolas, Monaco, monospace; margin: 0;"><code>${safeEscapeHtml(pythonDemo)}</code></pre>
            </div>
          </div>
        `,
        footerHtml: `
          <div style="padding: 10px 18px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <span style="color: #8c8c8c; font-size: 11px;">支持一键复制整篇规范发给 ChatGPT / Claude / DeepSeek 生成调用代码</span>
            <div style="display: flex; gap: 8px;">
              <button id="datax-doc-copy-all-bottom" style="padding: 5px 14px; border: 1px solid #1890ff; color: #1890ff; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px; font-weight: 500;">一键复制 API 规范 (供 AI 提数)</button>
              <button id="datax-doc-confirm-btn" style="padding: 5px 18px; border: none; border-radius: 4px; background: #1890ff; color: #fff; cursor: pointer;">关闭</button>
            </div>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-doc-confirm-btn').onclick = closeModal;
      modal.querySelector('#datax-doc-copy-python').onclick = () => {
        copyText(pythonDemo, 'Python 接入示例代码已复制到剪贴板！');
      };

      modal.querySelector('#datax-doc-copy-all-bottom').onclick = () => {
        copyText(aiMarkdownDoc, 'AI 提数 Prompt 规范已复制到剪贴板！可直接粘贴发给 AI 开始提数');
      };
    }

    /**
     * 拉取当前生效中的 IP 黑名单快照及当前管理员 IP，更新顶部标签页角标
     */
    async loadActiveBlacklistRules() {
      try {
        const res = await fetch('/api/open/admin/blacklist/activeList', { headers: getAuthHeaders() });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0) && json.data) {
          this.activeBlacklistRules = json.data.records || [];
          this.currentAdminIp = json.data.currentAdminIp || '';
          const badge = document.getElementById('datax-openapi-blacklist-count-badge');
          if (badge) {
            const count = this.activeBlacklistRules.length;
            badge.textContent = String(count);
            badge.style.display = count > 0 ? 'inline-block' : 'none';
          }
        }
      } catch (e) {
        console.warn('[Tab8OpenApi] 获取生效黑名单快照失败:', e);
      }
    }

    /**
     * 判断指定客户端 IP 与 AppKey 是否命中当前生效黑名单
     */
    matchIpInActiveBlacklist(clientIp, appKey) {
      if (!clientIp || !Array.isArray(this.activeBlacklistRules) || this.activeBlacklistRules.length === 0) {
        return null;
      }
      const normIp = String(clientIp).trim().toLowerCase();
      const normAk = appKey ? String(appKey).trim().toLowerCase() : '';
      for (const rule of this.activeBlacklistRules) {
        if (!rule || rule.status !== 1) continue;
        const ruleAk = String(rule.appKey || '*').trim().toLowerCase();
        const scopeOk = ruleAk === '*' || ruleAk === 'all' || (normAk && ruleAk === normAk);
        if (!scopeOk) continue;

        const pattern = String(rule.ipAddress || '').trim().toLowerCase();
        if (!pattern) continue;
        if (pattern === normIp || pattern === '*') {
          return rule;
        }
        if (pattern.includes('*')) {
          const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          if (new RegExp(`^${escaped}$`, 'i').test(normIp)) {
            return rule;
          }
        }
      }
      return null;
    }

    /**
     * 判断 IP 是否为本机回环地址或当前管理员所在客户端 IP (防自锁校验)
     */
    isRiskSelfOrLoopbackIp(ip) {
      if (!ip) return false;
      const s = String(ip).trim().toLowerCase();
      if (s === '127.0.0.1' || s === 'localhost' || s === '::1' || s === '0:0:0:0:0:0:0:1' || s.startsWith('127.')) {
        return true;
      }
      if (this.currentAdminIp && s === String(this.currentAdminIp).trim().toLowerCase()) {
        return true;
      }
      return false;
    }

    /**
     * 渲染调用终端 / AI 工具来源彩色徽标（严格遵循 Ant Design 调色盘与 XSS 转义）
     */
    renderClientSourceBadge(clientSource, userAgent) {
      const src = (clientSource || '').trim();
      const ua = (userAgent || '').trim();
      if (!src && !ua) {
        return '<span style="color: #bfbfbf;">-</span>';
      }
      const label = src || '未知终端';
      const lower = label.toLowerCase();
      const tooltip = ua ? `终端标识: ${label}\n原始 User-Agent: ${ua}` : label;

      let style = 'background: #f5f5f5; color: #595959; border: 1px solid #d9d9d9;';
      if (lower.includes('mcp') || lower.includes('trae') || lower.includes('workbuddy') || lower.includes('qoder')
          || lower.includes('antigravity') || lower.includes('deepseek') || lower.includes('opencode')
          || lower.includes('codex') || lower.includes('cursor') || lower.includes('claude') || lower.includes('windsurf')) {
        style = 'background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; font-weight: 500;';
      } else if (lower.includes('chrome') || lower.includes('edge') || lower.includes('firefox')
          || lower.includes('safari') || lower.includes('opera')) {
        style = 'background: #e6fffb; color: #08979c; border: 1px solid #87e8de;';
      } else if (lower.includes('postman') || lower.includes('apifox') || lower.includes('insomnia')
          || lower.includes('apipost') || lower.includes('curl') || lower.includes('wget') || lower.includes('httpie')) {
        style = 'background: #fff7e6; color: #d46b08; border: 1px solid #ffd591;';
      }

      return `<span title="${safeEscapeHtml(tooltip)}" style="display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; max-width: 125px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${style}">${safeEscapeHtml(label)}</span>`;
    }

    async loadLogs() {
      await Promise.all([
        this.ensureAccountMapLoaded(),
        this.loadActiveBlacklistRules()
      ]);

      const appKey = document.getElementById('datax-openapi-log-appkey').value.trim();
      const clientIpEl = document.getElementById('datax-openapi-log-clientip');
      const clientIp = clientIpEl ? clientIpEl.value.trim() : '';
      const clientSourceEl = document.getElementById('datax-openapi-log-clientsource');
      const clientSource = clientSourceEl ? clientSourceEl.value.trim() : '';
      const status = document.getElementById('datax-openapi-log-status').value;
      const start = document.getElementById('datax-openapi-log-start').value;
      const end = document.getElementById('datax-openapi-log-end').value;

      const requestedPageNo = Math.max(1, Number(this.logPageNo) || 1);
      this.logPageNo = requestedPageNo;
      let url = `/api/open/admin/log/page?pageNo=${requestedPageNo}&pageSize=${this.logPageSize}`;
      if (appKey) url += `&appKey=${encodeURIComponent(appKey)}`;
      if (clientIp) url += `&clientIp=${encodeURIComponent(clientIp)}`;
      if (clientSource) url += `&clientSource=${encodeURIComponent(clientSource)}`;
      if (status) url += `&status=${status}`;
      if (start) url += `&startTime=${encodeURIComponent(start + ' 00:00:00')}`;
      if (end) url += `&endTime=${encodeURIComponent(end + ' 23:59:59')}`;

      if (this.logMarqueeInstance && typeof this.logMarqueeInstance.destroy === 'function') {
        this.logMarqueeInstance.destroy();
        this.logMarqueeInstance = null;
      }
      this.selectedLogIds.clear();
      const checkAllEl = document.getElementById('datax-openapi-log-check-all');
      if (checkAllEl) checkAllEl.checked = false;

      const tbody = document.getElementById('datax-openapi-log-tbody');
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px; color: #8c8c8c;">正在检索调用日志...</td></tr>';

      try {
        const res = await fetch(url, { headers: getAuthHeaders() });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0) && json.data) {
          const records = json.data.records || [];
          this.currentLogRecords = records;
          const pg = this.updatePaginationState({
            pageData: json.data,
            currentPage: requestedPageNo,
            pageSize: this.logPageSize,
            totalElId: 'datax-openapi-log-total',
            indicatorElId: 'datax-openapi-log-page-indicator',
            prevBtnId: 'datax-openapi-log-prev-btn',
            nextBtnId: 'datax-openapi-log-next-btn'
          });
          this.logTotalPages = pg.totalPages;
          this.logPageNo = pg.safePageNo;
          if (pg.needReload && pg.safePageNo !== requestedPageNo) {
            return this.loadLogs();
          }

          if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 30px; color: #8c8c8c;">暂无符合条件的调用日志</td></tr>';
            return;
          }

          tbody.innerHTML = records.map(item => {
            const accName = item.accountName || this.accountMap[item.appKey] || '';
            const accNameHtml = accName
              ? `<div style="font-weight: 500; color: #262626; line-height: 1.35; margin-bottom: 2px;">${safeEscapeHtml(accName)}</div>`
              : `<div style="color: #bfbfbf; line-height: 1.35; margin-bottom: 2px;">未命名账号</div>`;

            let statusTag = '<span style="color: #52c41a; font-weight: 500;">成功</span>';
            if (item.status === 2) {
              statusTag = '<span style="color: #fa8c16; font-weight: 500;">安全拦截</span>';
            } else if (item.status === 0) {
              statusTag = '<span style="color: #f5222d; font-weight: 500;">失败</span>';
            }

            let costColor = '#52c41a';
            if (item.costMs > 3000) costColor = '#f5222d';
            else if (item.costMs > 1000) costColor = '#fa8c16';

            const matchedBl = this.matchIpInActiveBlacklist(item.clientIp, item.appKey);
            const blBadgeHtml = matchedBl
              ? `<span title="${safeEscapeHtml('已列入黑名单 (' + (matchedBl.appKey === '*' ? '全局' : matchedBl.appKey) + '): ' + (matchedBl.reason || ''))}" style="display: inline-block; margin-left: 4px; padding: 0 5px; background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; border-radius: 3px; font-size: 10px; font-weight: 500;">已拉黑</span>`
              : '';

            const clientSourceBadgeHtml = this.renderClientSourceBadge(item.clientSource, item.userAgent);

            const ipActionBtnHtml = matchedBl
              ? `<button class="datax-log-btn-unblock" data-ip="${safeEscapeHtml(item.clientIp)}" data-appkey="${safeEscapeHtml(item.appKey)}" style="background: none; border: none; color: #52c41a; cursor: pointer; padding: 0 4px; font-size: 12px;">解封IP</button>`
              : `<button class="datax-log-btn-block" data-id="${item.id}" style="background: none; border: none; color: #f5222d; cursor: pointer; padding: 0 4px; font-size: 12px;">拉黑IP</button>`;

            return `
              <tr class="datax-openapi-log-row" data-log-id="${item.id}" style="border-bottom: 1px solid #f0f0f0; transition: background 0.15s;">
                <td style="padding: 8px 6px; text-align: center;">
                  <input type="checkbox" class="datax-log-row-cb" value="${item.id}" style="cursor: pointer;" />
                </td>
                <td style="padding: 8px 10px; color: #595959; font-size: 11px;">${safeEscapeHtml(item.createTime)}</td>
                <td style="padding: 8px 10px;">
                  ${accNameHtml}
                  <div><code style="background: #f5f5f5; color: #595959; padding: 2px 4px; border-radius: 3px; font-size: 11px; font-family: Consolas, monospace;">${safeEscapeHtml(item.appKey)}</code></div>
                </td>
                <td style="padding: 8px 10px; color: #595959; white-space: nowrap;">
                  <span>${safeEscapeHtml(item.clientIp)}</span>${blBadgeHtml}
                </td>
                <td style="padding: 8px 10px; white-space: nowrap;">
                  ${clientSourceBadgeHtml}
                </td>
                <td style="padding: 8px 10px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeEscapeHtml(item.tablesInvolved || '')}">${safeEscapeHtml(item.tablesInvolved || '-')}</td>
                <td style="padding: 8px 10px;">${item.resultRows || 0}</td>
                <td style="padding: 8px 10px; color: ${costColor}; font-weight: 500;">${item.costMs || 0} ms</td>
                <td style="padding: 8px 10px;">${statusTag}</td>
                <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                  <button class="datax-log-btn-detail" data-item='${JSON.stringify(item).replace(/'/g, "&apos;")}' style="background: none; border: none; color: #1890ff; cursor: pointer; padding: 0 4px; font-size: 12px;">🔍 详情</button>
                  ${ipActionBtnHtml}
                </td>
              </tr>
            `;
          }).join('');

          // 同步行复选框与选中计数提示
          const allLogRows = tbody.querySelectorAll('.datax-openapi-log-row');
          let lastClickedLogIdx = -1;
          const syncLogSelectionVisuals = () => {
            allLogRows.forEach(row => {
              const lid = String(row.getAttribute('data-log-id'));
              const cb = row.querySelector('.datax-log-row-cb');
              const selected = this.selectedLogIds.has(lid);
              if (cb) cb.checked = selected;
              row.style.background = selected ? '#e6f7ff' : '#fff';
            });
            if (checkAllEl) {
              checkAllEl.checked = allLogRows.length > 0 && this.selectedLogIds.size === allLogRows.length;
            }
            const hintEl = document.getElementById('datax-openapi-log-selected-hint');
            if (hintEl) {
              if (this.selectedLogIds.size > 0) {
                const selectedRecords = records.filter(r => this.selectedLogIds.has(String(r.id)));
                const uniqueIps = new Set(selectedRecords.map(r => r.clientIp).filter(Boolean));
                hintEl.innerHTML = `<span style="color: #1890ff; font-weight: 500;">已选中 ${this.selectedLogIds.size} 条日志 (涉及 ${uniqueIps.size} 个独立 IP)</span>`;
              } else {
                hintEl.textContent = '支持勾选或按住鼠标左键矩形框选多条日志一键加入 IP 黑名单';
              }
            }
          };

          if (checkAllEl) {
            checkAllEl.onchange = (e) => {
              const checked = Boolean(e.target.checked);
              records.forEach(r => {
                if (checked) this.selectedLogIds.add(String(r.id));
                else this.selectedLogIds.delete(String(r.id));
              });
              syncLogSelectionVisuals();
            };
          }

          allLogRows.forEach((row, rowIdx) => {
            const cb = row.querySelector('.datax-log-row-cb');
            if (cb) {
              cb.onclick = (e) => {
                e.stopPropagation();
                const lid = String(cb.value);
                if (e.shiftKey && lastClickedLogIdx >= 0) {
                  const startIdx = Math.min(lastClickedLogIdx, rowIdx);
                  const endIdx = Math.max(lastClickedLogIdx, rowIdx);
                  for (let i = startIdx; i <= endIdx; i++) {
                    const r = allLogRows[i];
                    if (r) this.selectedLogIds.add(String(r.getAttribute('data-log-id')));
                  }
                } else {
                  if (cb.checked) this.selectedLogIds.add(lid);
                  else this.selectedLogIds.delete(lid);
                }
                lastClickedLogIdx = rowIdx;
                syncLogSelectionVisuals();
              };
            }
          });

          const tableWrap = document.getElementById('datax-openapi-log-table-wrap');
          if (tableWrap && window.DataXAssistant && window.DataXAssistant.MarqueeSelector) {
            this.logMarqueeInstance = new window.DataXAssistant.MarqueeSelector({
              container: tableWrap,
              rowSelector: '.datax-openapi-log-row',
              checkboxSelector: '.datax-log-row-cb',
              getIdFromRow: (row) => String(row.getAttribute('data-log-id')),
              selectedSet: this.selectedLogIds,
              selectedBg: '#e6f7ff',
              selectionBoxId: 'datax-oa-log-marquee-box',
              onSelectionChange: () => {
                syncLogSelectionVisuals();
              }
            });
          }

          // 绑定详情、单条拉黑与解封按钮
          tbody.querySelectorAll('.datax-log-btn-detail').forEach(btn => {
            btn.onclick = () => {
              const raw = btn.getAttribute('data-item');
              if (raw) this.showLogDetailModal(JSON.parse(raw));
            };
          });
          tbody.querySelectorAll('.datax-log-btn-block').forEach(btn => {
            btn.onclick = () => {
              const lid = String(btn.getAttribute('data-id'));
              const logObj = records.find(r => String(r.id) === lid);
              if (logObj) {
                this.openBlockIpFromLogsModal([logObj]);
              }
            };
          });
          tbody.querySelectorAll('.datax-log-btn-unblock').forEach(btn => {
            btn.onclick = () => {
              this.quickUnblockIp(btn.getAttribute('data-ip'), btn.getAttribute('data-appkey'));
            };
          });
        } else {
          this.logTotalPages = 1;
          this.setPaginationButtonsDisabled('datax-openapi-log-prev-btn', 'datax-openapi-log-next-btn', 1, 1);
          tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 20px; color: #f5222d;">加载日志失败: ${safeEscapeHtml((json && json.msg) || '请求异常')}</td></tr>`;
        }
      } catch (e) {
        this.setPaginationButtonsDisabled('datax-openapi-log-prev-btn', 'datax-openapi-log-next-btn', this.logPageNo, this.logTotalPages);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 20px; color: #f5222d;">加载日志异常: ${safeEscapeHtml(e.message)}</td></tr>`;
      }
    }

    showLogDetailModal(log) {
      const accountDisplayName = log.accountName || this.accountMap[log.appKey] || '';
      const accountDisplay = accountDisplayName
        ? `${safeEscapeHtml(accountDisplayName)} (${safeEscapeHtml(log.appKey)})`
        : safeEscapeHtml(log.appKey);
      const matchedBl = this.matchIpInActiveBlacklist(log.clientIp, log.appKey);
      const ipStatusHtml = matchedBl
        ? `<span style="margin-left: 6px; padding: 1px 6px; background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; border-radius: 3px; font-size: 11px;">已拉黑</span>`
        : '';
      const clientSourceHtml = this.renderClientSourceBadge(log.clientSource, log.userAgent);

      const modalObj = createDraggableModal({
        modalId: 'datax-log-detail-modal',
        dialogId: 'datax-log-detail-dialog',
        title: `调用日志审计明细 (#${log.id})`,
        width: 740,
        height: 620,
        minWidth: 500,
        minHeight: 380,
        storageKeyPrefix: 'datax_oa_logdetail',
        zIndex: 1000025,
        bodyHtml: `
          <div style="padding: 16px; display: flex; flex-direction: column; gap: 10px; font-size: 12px; flex: 1; min-height: 0; box-sizing: border-box;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #f9f9f9; padding: 10px; border-radius: 4px; border: 1px solid #f0f0f0;">
              <div><strong style="color: #8c8c8c;">调用账号:</strong> ${accountDisplay}</div>
              <div><strong style="color: #8c8c8c;">客户端IP:</strong> ${safeEscapeHtml(log.clientIp)}${ipStatusHtml}</div>
              <div><strong style="color: #8c8c8c;">调用终端/AI工具:</strong> ${clientSourceHtml}</div>
              <div><strong style="color: #8c8c8c;">请求时间:</strong> ${safeEscapeHtml(log.createTime)}</div>
              <div><strong style="color: #8c8c8c;">返回条数:</strong> ${log.resultRows || 0} 条</div>
              <div><strong style="color: #8c8c8c;">执行耗时 / 状态:</strong> ${log.costMs || 0} ms (${log.status === 1 ? '成功' : (log.status === 2 ? '安全拦截' : '失败')})</div>
            </div>

            ${log.userAgent ? `
              <div>
                <strong style="display: block; margin-bottom: 4px; color: #595959;">原始客户端 User-Agent:</strong>
                <div style="background: #f5f5f5; padding: 6px 8px; border-radius: 4px; font-family: Consolas, monospace; font-size: 11px; color: #595959; word-break: break-all;">${safeEscapeHtml(log.userAgent)}</div>
              </div>
            ` : ''}

            ${log.tablesInvolved ? `
              <div>
                <strong style="display: block; margin-bottom: 4px; color: #595959;">AST 提取涉及数据表:</strong>
                <div style="background: #f5f5f5; padding: 6px 8px; border-radius: 4px; font-family: monospace; word-break: break-all;">${safeEscapeHtml(log.tablesInvolved)}</div>
              </div>
            ` : ''}

            ${log.errorMsg ? `
              <div>
                <strong style="display: block; margin-bottom: 4px; color: #f5222d;">异常 / 拦截原因:</strong>
                <div style="background: #fff2f0; border: 1px solid #ffccc7; color: #cf1322; padding: 8px; border-radius: 4px; word-break: break-all;">${safeEscapeHtml(log.errorMsg)}</div>
              </div>
            ` : ''}

            <div style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-shrink: 0;">
                <strong style="color: #595959;">完整执行 SQL:</strong>
                <button id="datax-log-copy-sql-btn" style="border: none; background: none; color: #1890ff; cursor: pointer; font-size: 11px;">复制 SQL</button>
              </div>
              <pre style="background: #282c34; color: #abb2bf; padding: 10px; border-radius: 4px; flex: 1; min-height: 180px; overflow-y: auto; overflow-x: hidden; white-space: pre-wrap; word-break: break-all; font-size: 11px; line-height: 1.5; margin: 0; font-family: 'Fira Code', Consolas, Monaco, monospace;"><code>${safeEscapeHtml(log.executeSql)}</code></pre>
            </div>
          </div>
        `,
        footerHtml: `
          <div style="padding: 10px 16px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: space-between; align-items: center;">
            <div>
              ${matchedBl
                ? `<button id="datax-log-detail-unblock-btn" style="padding: 5px 14px; border: 1px solid #b7eb8f; border-radius: 4px; background: #f6ffed; color: #52c41a; cursor: pointer; font-size: 12px;">解封该客户端 IP (${safeEscapeHtml(log.clientIp)})</button>`
                : `<button id="datax-log-detail-block-btn" style="padding: 5px 14px; border: 1px solid #ffa39e; border-radius: 4px; background: #fff1f0; color: #f5222d; cursor: pointer; font-size: 12px; font-weight: 500;">加入 IP 黑名单 (${safeEscapeHtml(log.clientIp)})</button>`
              }
            </div>
            <button id="datax-log-detail-confirm" style="padding: 5px 16px; border: none; border-radius: 4px; background: #1890ff; color: #fff; cursor: pointer; font-size: 12px;">关闭</button>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-log-detail-confirm').onclick = closeModal;
      modal.querySelector('#datax-log-copy-sql-btn').onclick = () => {
        copyText(log.executeSql);
      };

      const blockBtn = modal.querySelector('#datax-log-detail-block-btn');
      if (blockBtn) {
        blockBtn.onclick = () => {
          closeModal();
          this.openBlockIpFromLogsModal([log]);
        };
      }
      const unblockBtn = modal.querySelector('#datax-log-detail-unblock-btn');
      if (unblockBtn) {
        unblockBtn.onclick = () => {
          closeModal();
          this.quickUnblockIp(log.clientIp, log.appKey);
        };
      }
    }

    /**
     * 从单条或多条选中的审计日志打开「加入 IP 黑名单」确认弹窗
     */
    openBlockIpFromLogsModal(logItems) {
      if (!Array.isArray(logItems) || logItems.length === 0) return;

      // 提取去重后的客户端 IP 列表与风险识别
      const uniqueIpMap = new Map();
      logItems.forEach(item => {
        const ip = (item.clientIp || '').trim();
        if (!ip) return;
        if (!uniqueIpMap.has(ip)) {
          uniqueIpMap.set(ip, {
            ipAddress: ip,
            appKey: item.appKey || '',
            accountName: item.accountName || this.accountMap[item.appKey] || '',
            sourceLogId: item.id,
            status: item.status,
            errorMsg: item.errorMsg || ''
          });
        }
      });

      const dedupList = Array.from(uniqueIpMap.values());
      if (dedupList.length === 0) {
        alert('所选日志记录中未包含有效的客户端 IP 地址');
        return;
      }

      const riskIps = dedupList.filter(d => this.isRiskSelfOrLoopbackIp(d.ipAddress)).map(d => d.ipAddress);
      const isSingle = dedupList.length === 1;
      const firstItem = dedupList[0];

      let defaultReason = '';
      if (isSingle) {
        const statusDesc = firstItem.status === 2 ? '安全拦截' : (firstItem.status === 0 ? '执行失败' : '人工审计');
        defaultReason = `从调用日志 #${firstItem.sourceLogId} 一键拉黑 [原状态: ${statusDesc}]`;
        if (firstItem.errorMsg) {
          defaultReason += ` - ${firstItem.errorMsg.substring(0, 80)}`;
        }
      } else {
        defaultReason = `从调用日志批量选中 ${logItems.length} 条记录 (${dedupList.length} 个独立 IP) 一键拉黑`;
      }

      const riskBannerHtml = riskIps.length > 0 ? `
        <div style="background: #fff2f0; border: 1px solid #ffccc7; color: #cf1322; padding: 10px 12px; border-radius: 4px; font-size: 12px; line-height: 1.5;">
          <strong>防误封高危预警：</strong> 检测到待封禁列表中包含本机回环地址或您当前所在的客户端 IP (<code>${safeEscapeHtml(riskIps.join(', '))}</code>)。封禁后可能导致您本机运行的 MCP 提数工具无法调用开放接口，请谨慎确认！
        </div>
      ` : '';

      const ipSummaryHtml = dedupList.map(d => {
        const accLabel = d.accountName ? `${safeEscapeHtml(d.accountName)} (${safeEscapeHtml(d.appKey)})` : safeEscapeHtml(d.appKey);
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; border-bottom: 1px solid #f0f0f0; font-size: 12px;">
            <div>
              <strong style="color: #f5222d; font-family: Consolas, monospace;">${safeEscapeHtml(d.ipAddress)}</strong>
              ${this.isRiskSelfOrLoopbackIp(d.ipAddress) ? '<span style="margin-left: 6px; background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; padding: 0 4px; border-radius: 3px; font-size: 10px;">本机/当前IP</span>' : ''}
            </div>
            <span style="color: #8c8c8c; font-size: 11px;">触发日志 #${d.sourceLogId} | 账号: ${accLabel}</span>
          </div>
        `;
      }).join('');

      const modalObj = createDraggableModal({
        modalId: 'datax-block-ip-confirm-modal',
        dialogId: 'datax-block-ip-confirm-dialog',
        title: isSingle ? `将客户端 IP [${firstItem.ipAddress}] 加入黑名单` : `批量将 ${dedupList.length} 个客户端 IP 加入黑名单`,
        width: 560,
        height: riskIps.length > 0 ? 450 : 390,
        minWidth: 460,
        minHeight: 340,
        storageKeyPrefix: 'datax_oa_blockconfirm',
        zIndex: 1000045,
        bodyHtml: `
          <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 12px; flex: 1; min-height: 0;">
            ${riskBannerHtml}
            <div>
              <label style="display: block; font-weight: 600; margin-bottom: 4px; color: #262626;">待加入黑名单的客户端 IP (${dedupList.length} 个)：</label>
              <div style="max-height: 110px; overflow-y: auto; border: 1px solid #d9d9d9; border-radius: 4px; background: #fafafa;">
                ${ipSummaryHtml}
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 600; margin-bottom: 4px; color: #262626;">封禁作用范围：</label>
              <select id="datax-block-scope-select" style="width: 100%; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; background: #fff;">
                <option value="*" selected>全局封禁 (*) —— 阻断上述 IP 访问平台所有开放 API 账号 (推荐)</option>
                <option value="ACCOUNT">仅限日志对应账号 —— 仅阻断上述 IP 访问各自触发日志所属的 AppKey</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-weight: 600; margin-bottom: 4px; color: #262626;">封禁原因备注：</label>
              <input type="text" id="datax-block-reason-input" value="${safeEscapeHtml(defaultReason)}" placeholder="填写封禁原因以便后续审计溯源" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px;" />
            </div>
          </div>
        `,
        footerHtml: `
          <div style="padding: 10px 16px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: flex-end; gap: 8px;">
            <button id="datax-block-cancel-btn" style="padding: 5px 14px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px;">取消</button>
            <button id="datax-block-submit-btn" style="padding: 5px 16px; border: none; border-radius: 4px; background: #f5222d; color: #fff; cursor: pointer; font-size: 12px; font-weight: 500;">确认拉黑并立即阻断</button>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-block-cancel-btn').onclick = closeModal;

      const submitBlock = async (forceConfirmFlag = false) => {
        const scope = modal.querySelector('#datax-block-scope-select').value;
        const reason = modal.querySelector('#datax-block-reason-input').value.trim();

        try {
          const res = await fetch('/api/open/admin/blacklist/batchAddFromLogs', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              items: dedupList,
              scope: scope,
              reason: reason,
              forceConfirm: forceConfirmFlag
            })
          });
          const json = await res.json();
          if (json && (json.code === 200 || json.code === 0)) {
            const count = (json.data && json.data.blockedCount) || dedupList.length;
            toast(`已成功将 ${count} 个客户端 IP 加入黑名单，网关已实时生效！`);
            closeModal();
            await this.loadActiveBlacklistRules();
            if (this.currentSubTab === 'log') {
              this.loadLogs();
            } else if (this.currentSubTab === 'blacklist') {
              this.loadBlacklist();
            }
          } else if (json && json.msg && json.msg.includes('RISK_CONFIRM_REQUIRED:')) {
            const cleanWarn = json.msg.replace('RISK_CONFIRM_REQUIRED:', '').trim();
            const ok = await confirm(cleanWarn);
            if (ok) {
              await submitBlock(true);
            }
          } else {
            alert('拉黑失败: ' + (json ? (json.msg || '未知错误') : '请求异常'));
          }
        } catch (e) {
          alert('请求异常: ' + e.message);
        }
      };

      modal.querySelector('#datax-block-submit-btn').onclick = () => submitBlock(false);
    }

    /**
     * 从审计日志一键解封指定客户端 IP
     */
    async quickUnblockIp(ipAddress, appKey) {
      if (!ipAddress) return;
      const confirmed = await confirm(`确定要立即解封客户端 IP [${ipAddress}] 吗？解封后该 IP 将恢复正常开放 API 访问。`);
      if (!confirmed) return;

      try {
        let url = `/api/open/admin/blacklist/unblockByIp?ipAddress=${encodeURIComponent(ipAddress)}`;
        if (appKey) url += `&appKey=${encodeURIComponent(appKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0)) {
          toast(json.data || `已解封 IP [${ipAddress}]`);
          await this.loadActiveBlacklistRules();
          if (this.currentSubTab === 'log') {
            this.loadLogs();
          } else if (this.currentSubTab === 'blacklist') {
            this.loadBlacklist();
          }
        } else {
          alert('解封失败: ' + (json.msg || '未知错误'));
        }
      } catch (e) {
        alert('解封请求异常: ' + e.message);
      }
    }

    /**
     * 加载子面板 3：IP 黑名单分页列表
     */
    async loadBlacklist() {
      await Promise.all([
        this.ensureAccountMapLoaded(),
        this.loadActiveBlacklistRules()
      ]);

      const kwEl = document.getElementById('datax-openapi-bl-keyword');
      const akEl = document.getElementById('datax-openapi-bl-appkey');
      const statusEl = document.getElementById('datax-openapi-bl-status');

      const kw = kwEl ? kwEl.value.trim() : '';
      const appKey = akEl ? akEl.value.trim() : '';
      const status = statusEl ? statusEl.value : '';

      const requestedPageNo = Math.max(1, Number(this.blacklistPageNo) || 1);
      this.blacklistPageNo = requestedPageNo;
      let url = `/api/open/admin/blacklist/page?pageNo=${requestedPageNo}&pageSize=${this.blacklistPageSize}`;
      if (kw) url += `&keyword=${encodeURIComponent(kw)}`;
      if (appKey) url += `&appKey=${encodeURIComponent(appKey)}`;
      if (status) url += `&status=${status}`;

      const tbody = document.getElementById('datax-openapi-bl-tbody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #8c8c8c;">正在加载黑名单列表...</td></tr>';

      try {
        const res = await fetch(url, { headers: getAuthHeaders() });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0) && json.data) {
          const records = json.data.records || [];
          const pg = this.updatePaginationState({
            pageData: json.data,
            currentPage: requestedPageNo,
            pageSize: this.blacklistPageSize,
            totalElId: 'datax-openapi-bl-total',
            indicatorElId: 'datax-openapi-bl-page-indicator',
            prevBtnId: 'datax-openapi-bl-prev-btn',
            nextBtnId: 'datax-openapi-bl-next-btn'
          });
          this.blacklistTotalPages = pg.totalPages;
          this.blacklistPageNo = pg.safePageNo;
          if (pg.needReload && pg.safePageNo !== requestedPageNo) {
            return this.loadBlacklist();
          }

          if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: #8c8c8c;">当前暂无 IP 黑名单记录（可在「调用日志审计」中选中异常日志一键拉黑，或点击右上方「➕ 新增黑名单IP」）</td></tr>';
            return;
          }

          tbody.innerHTML = records.map(item => {
            const isGlobal = !item.appKey || item.appKey === '*';
            const scopeHtml = isGlobal
              ? `<span style="background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 500;">全局所有账号 (*)</span>`
              : `<div style="font-weight: 500; color: #262626;">${safeEscapeHtml(item.accountName || this.accountMap[item.appKey] || '指定账号')}</div><div><code style="background: #f5f5f5; color: #595959; padding: 1px 4px; border-radius: 3px; font-size: 11px;">${safeEscapeHtml(item.appKey)}</code></div>`;

            const statusBadge = item.status === 1
              ? `<span style="display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; font-weight: 500;">生效拦截中</span>`
              : `<span style="display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; background: #f5f5f5; color: #8c8c8c; border: 1px solid #d9d9d9;">已解封</span>`;

            const srcLogHtml = item.sourceLogId
              ? `<span style="color: #1890ff; font-family: monospace;">#${item.sourceLogId}</span>`
              : `<span style="color: #bfbfbf;">手动录入</span>`;

            return `
              <tr style="border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 8px 10px; color: #8c8c8c;">${item.id}</td>
                <td style="padding: 8px 10px; font-family: Consolas, monospace; font-weight: 600; color: ${item.status === 1 ? '#cf1322' : '#595959'};">
                  ${safeEscapeHtml(item.ipAddress)}
                </td>
                <td style="padding: 8px 10px;">${scopeHtml}</td>
                <td style="padding: 8px 10px; color: #595959; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeEscapeHtml(item.reason || '')}">
                  ${safeEscapeHtml(item.reason || '-')}
                </td>
                <td style="padding: 8px 10px;">${srcLogHtml}</td>
                <td style="padding: 8px 10px;">${statusBadge}</td>
                <td style="padding: 8px 10px; color: #8c8c8c; font-size: 11px;">${safeEscapeHtml(item.updateTime || item.createTime || '')}</td>
                <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                  <button class="datax-bl-btn-toggle" data-id="${item.id}" data-status="${item.status}" style="background: none; border: none; color: ${item.status === 1 ? '#52c41a' : '#fa8c16'}; cursor: pointer; padding: 0 4px; font-size: 12px;">${item.status === 1 ? '解封' : '恢复封禁'}</button>
                  <button class="datax-bl-btn-edit" data-item='${JSON.stringify(item).replace(/'/g, "&apos;")}' style="background: none; border: none; color: #1890ff; cursor: pointer; padding: 0 4px; font-size: 12px;">✏️ 编辑</button>
                  <button class="datax-bl-btn-del" data-id="${item.id}" data-ip="${safeEscapeHtml(item.ipAddress)}" style="background: none; border: none; color: #f5222d; cursor: pointer; padding: 0 4px; font-size: 12px;">🗑️ 删除</button>
                </td>
              </tr>
            `;
          }).join('');

          tbody.querySelectorAll('.datax-bl-btn-toggle').forEach(btn => {
            btn.onclick = () => this.toggleBlacklistStatus(btn.dataset.id, btn.dataset.status);
          });
          tbody.querySelectorAll('.datax-bl-btn-edit').forEach(btn => {
            btn.onclick = () => {
              const raw = btn.getAttribute('data-item');
              if (raw) this.openBlacklistEditModal(JSON.parse(raw));
            };
          });
          tbody.querySelectorAll('.datax-bl-btn-del').forEach(btn => {
            btn.onclick = () => this.deleteBlacklist(btn.dataset.id, btn.dataset.ip);
          });
        } else {
          this.blacklistTotalPages = 1;
          this.setPaginationButtonsDisabled('datax-openapi-bl-prev-btn', 'datax-openapi-bl-next-btn', 1, 1);
          tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #f5222d;">加载黑名单失败: ${safeEscapeHtml((json && json.msg) || '请求异常')}</td></tr>`;
        }
      } catch (e) {
        this.setPaginationButtonsDisabled('datax-openapi-bl-prev-btn', 'datax-openapi-bl-next-btn', this.blacklistPageNo, this.blacklistTotalPages);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #f5222d;">加载黑名单失败: ${safeEscapeHtml(e.message)}</td></tr>`;
      }
    }

    /**
     * 新增或编辑单条 IP 黑名单弹窗
     */
    async openBlacklistEditModal(item) {
      await this.ensureAccountMapLoaded();
      const isEdit = Boolean(item && item.id);
      const curAppKey = item ? (item.appKey || '*') : '*';

      const accountOptionsHtml = Object.entries(this.accountMap).map(([ak, name]) => {
        const selected = curAppKey === ak ? 'selected' : '';
        return `<option value="${safeEscapeHtml(ak)}" ${selected}>仅限账号: ${safeEscapeHtml(name)} (${safeEscapeHtml(ak)})</option>`;
      }).join('');

      const modalObj = createDraggableModal({
        modalId: 'datax-bl-edit-modal',
        dialogId: 'datax-bl-edit-dialog',
        title: isEdit ? '编辑 IP 黑名单规则' : '新增 IP 黑名单规则',
        width: 520,
        height: 360,
        minWidth: 440,
        minHeight: 310,
        storageKeyPrefix: 'datax_oa_bledit',
        zIndex: 1000045,
        bodyHtml: `
          <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 12px;">
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #262626;"><span style="color: red;">*</span> 客户端 IP 地址或网段：</label>
              <input type="text" id="datax-bl-form-ip" value="${safeEscapeHtml(item ? item.ipAddress : '')}" placeholder="支持精确IP (如 192.168.1.50)、通配符 (192.168.1.*) 或 CIDR (10.0.0.0/24)" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
            </div>
            <div style="display: flex; gap: 10px;">
              <div style="flex: 2;">
                <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #262626;">封禁作用范围：</label>
                <select id="datax-bl-form-appkey" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;">
                  <option value="*" ${curAppKey === '*' ? 'selected' : ''}>全局封禁所有账号 (*)</option>
                  ${accountOptionsHtml}
                </select>
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #262626;">状态：</label>
                <select id="datax-bl-form-status" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;">
                  <option value="1" ${(!item || item.status === 1) ? 'selected' : ''}>生效拦截中</option>
                  <option value="0" ${(item && item.status === 0) ? 'selected' : ''}>已解封</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 4px; color: #262626;">封禁原因备注：</label>
              <input type="text" id="datax-bl-form-reason" value="${safeEscapeHtml(item ? item.reason : '')}" placeholder="例如: 审计发现高频越权探测表结构" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px;" />
            </div>
          </div>
        `,
        footerHtml: `
          <div style="padding: 10px 16px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; justify-content: flex-end; gap: 8px;">
            <button id="datax-bl-form-cancel" style="padding: 5px 14px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px;">取消</button>
            <button id="datax-bl-form-submit" style="padding: 5px 16px; border: none; border-radius: 4px; background: #1890ff; color: #fff; cursor: pointer; font-size: 12px; font-weight: 500;">保存</button>
          </div>
        `
      });

      const modal = modalObj.modalEl;
      const closeModal = modalObj.close;
      modal.querySelector('#datax-bl-form-cancel').onclick = closeModal;

      const doSave = async (forceConfirmFlag = false) => {
        const ipAddress = modal.querySelector('#datax-bl-form-ip').value.trim();
        const appKey = modal.querySelector('#datax-bl-form-appkey').value;
        const status = Number(modal.querySelector('#datax-bl-form-status').value);
        const reason = modal.querySelector('#datax-bl-form-reason').value.trim();

        if (!ipAddress) {
          alert('请填写客户端 IP 地址或网段');
          return;
        }

        try {
          const res = await fetch('/api/open/admin/blacklist/save', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              id: item ? item.id : null,
              ipAddress,
              appKey,
              status,
              reason,
              sourceLogId: item ? item.sourceLogId : null,
              forceConfirm: forceConfirmFlag
            })
          });
          const json = await res.json();
          if (json && (json.code === 200 || json.code === 0)) {
            toast('黑名单规则已保存并即时生效');
            closeModal();
            this.loadBlacklist();
          } else if (json && json.msg && json.msg.includes('RISK_CONFIRM_REQUIRED:')) {
            const cleanWarn = json.msg.replace('RISK_CONFIRM_REQUIRED:', '').trim();
            const ok = await confirm(cleanWarn);
            if (ok) {
              await doSave(true);
            }
          } else {
            alert('保存失败: ' + (json.msg || '未知错误'));
          }
        } catch (e) {
          alert('保存异常: ' + e.message);
        }
      };

      modal.querySelector('#datax-bl-form-submit').onclick = () => doSave(false);
    }

    async toggleBlacklistStatus(id, currentStatus) {
      const nextStatus = Number(currentStatus) === 1 ? 0 : 1;
      const actionText = nextStatus === 1 ? '恢复封禁' : '解封';
      const confirmed = await confirm(`确定要${actionText}该条 IP 黑名单规则吗？`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/open/admin/blacklist/toggleStatus?id=${id}&status=${nextStatus}`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0)) {
          toast(`已${actionText}`);
          this.loadBlacklist();
        } else {
          alert('操作失败: ' + (json.msg || '未知错误'));
        }
      } catch (e) {
        alert('请求异常: ' + e.message);
      }
    }

    async deleteBlacklist(id, ip) {
      const confirmed = await confirm(`确定要彻底删除黑名单记录 [${ip}] 吗？`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/open/admin/blacklist/delete?id=${id}`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const json = await res.json();
        if (json && (json.code === 200 || json.code === 0)) {
          toast('删除成功');
          this.loadBlacklist();
        } else {
          alert('删除失败: ' + (json.msg || '未知错误'));
        }
      } catch (e) {
        alert('请求异常: ' + e.message);
      }
    }

    async exportLogs() {
      const exportBtn = document.getElementById('datax-openapi-log-export-btn');
      if (exportBtn) {
        if (exportBtn.disabled) return;
        exportBtn.disabled = true;
        exportBtn.textContent = '正在导出...';
        exportBtn.style.opacity = '0.7';
      }

      try {
        await this.ensureAccountMapLoaded();

        const appKey = document.getElementById('datax-openapi-log-appkey').value.trim();
        const clientIpEl = document.getElementById('datax-openapi-log-clientip');
        const clientIp = clientIpEl ? clientIpEl.value.trim() : '';
        const clientSourceEl = document.getElementById('datax-openapi-log-clientsource');
        const clientSource = clientSourceEl ? clientSourceEl.value.trim() : '';
        const status = document.getElementById('datax-openapi-log-status').value;
        const start = document.getElementById('datax-openapi-log-start').value;
        const end = document.getElementById('datax-openapi-log-end').value;

        // 默认拉取符合当前检索条件的前 2000 条调用日志
        let url = `/api/open/admin/log/page?pageNo=1&pageSize=2000`;
        if (appKey) url += `&appKey=${encodeURIComponent(appKey)}`;
        if (clientIp) url += `&clientIp=${encodeURIComponent(clientIp)}`;
        if (clientSource) url += `&clientSource=${encodeURIComponent(clientSource)}`;
        if (status) url += `&status=${status}`;
        if (start) url += `&startTime=${encodeURIComponent(start + ' 00:00:00')}`;
        if (end) url += `&endTime=${encodeURIComponent(end + ' 23:59:59')}`;

        const res = await fetch(url, { headers: getAuthHeaders() });
        const json = await res.json();
        if (!json || (json.code !== 200 && json.code !== 0) || !json.data) {
          alert('导出失败: ' + (json ? (json.msg || '获取日志异常') : '网络请求失败'));
          return;
        }

        const records = json.data.records || [];
        if (records.length === 0) {
          toast('当前筛选条件下暂无审计日志可供导出');
          return;
        }

        const headers = [
          '日志ID',
          '调用时间',
          '调用账号名称',
          'AppKey',
          '客户端IP',
          '调用终端/AI工具',
          '原始User-Agent',
          '涉及表名',
          '返回条数',
          '耗时(ms)',
          '执行状态',
          '异常或拦截原因',
          '完整执行SQL'
        ];

        const rowsData = records.map(item => {
          let statusText = '成功';
          if (item.status === 2) statusText = '安全拦截';
          else if (item.status === 0) statusText = '失败';

          const accName = item.accountName || this.accountMap[item.appKey] || '未命名账号';
          return [
            item.id,
            item.createTime || '',
            accName,
            item.appKey || '',
            item.clientIp || '',
            item.clientSource || '-',
            item.userAgent || '',
            item.tablesInvolved || '',
            item.resultRows || 0,
            item.costMs || 0,
            statusText,
            item.errorMsg || '',
            item.executeSql || ''
          ];
        });

        const fileName = `API调用审计日志_${getTimestampString()}.xlsx`;

        loadSheetJs((XLSX) => {
          if (XLSX) {
            try {
              const ws = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
              ws['!cols'] = [
                { wch: 10 },
                { wch: 20 },
                { wch: 22 },
                { wch: 28 },
                { wch: 16 },
                { wch: 20 },
                { wch: 36 },
                { wch: 30 },
                { wch: 10 },
                { wch: 10 },
                { wch: 12 },
                { wch: 35 },
                { wch: 60 }
              ];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, '调用审计日志');
              XLSX.writeFile(wb, fileName);
              toast(`已成功导出 ${records.length} 条审计日志！`);
            } catch (err) {
              console.warn('[Tab8OpenApi] SheetJS 导出异常，降级为 CSV 导出:', err);
              exportToCsvFallback(headers, rowsData, fileName);
            }
          } else {
            exportToCsvFallback(headers, rowsData, fileName);
          }
        });
      } catch (e) {
        alert('导出日志发生异常: ' + e.message);
      } finally {
        if (exportBtn) {
          exportBtn.disabled = false;
          exportBtn.textContent = '导出 Excel';
          exportBtn.style.opacity = '1';
        }
      }
    }
  }

  window.DataXAssistant.Tabs.Tab8Class = Tab8OpenApi;

})();
