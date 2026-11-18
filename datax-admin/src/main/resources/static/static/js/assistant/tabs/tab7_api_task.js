/**
 * @fileoverview Tab 7: 接口数据采集与落库任务管理 (Tab7ApiTask)
 * 提供 HTTP RESTful API 定时调用、鉴权、分页拉取、JSONPath 提取及批量入库功能。
 *
 * @author ypc
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
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getAuthHeaders(customHeaders = {}) {
    if (window.DataXCommon && window.DataXCommon.Http && window.DataXCommon.Http.getAuthHeaders) {
      return window.DataXCommon.Http.getAuthHeaders(customHeaders);
    }
    return { 'Content-Type': 'application/json', ...customHeaders };
  }

  function isApiSuccess(res) {
    if (window.DataXCommon && window.DataXCommon.Http && window.DataXCommon.Http.isApiSuccess) {
      return window.DataXCommon.Http.isApiSuccess(res);
    }
    return Boolean(res && (res.code === 200 || res.code === 0 || res.success === true));
  }

  function getApiMsg(res, defaultMsg = '未知错误') {
    if (window.DataXCommon && window.DataXCommon.Http && window.DataXCommon.Http.getApiMsg) {
      return window.DataXCommon.Http.getApiMsg(res, defaultMsg);
    }
    return (res && (res.msg || res.message)) || defaultMsg;
  }

  /**
   * 将输入的时间字符串规整为标准 "yyyy-MM-dd HH:mm:ss"
   *
   * @param {string} str 输入日期时间
   * @return {string|null} 标准格式字符串
   */
  function normalizeDateTimeString(str) {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.trim();
    if (!trimmed) return null;
    if (trimmed.includes('T')) {
      const parts = trimmed.split('T');
      const datePart = parts[0];
      let timePart = parts[1] || '00:00:00';
      if (timePart.includes('.')) timePart = timePart.split('.')[0];
      if (timePart.includes('+')) timePart = timePart.split('+')[0];
      if (timePart.includes('Z')) timePart = timePart.replace('Z', '');
      return `${datePart} ${timePart}`.substring(0, 19);
    }
    return trimmed;
  }

  /**
   * 安全解析复合 JSON 格式
   *
   * @param {string} str 待解析字符串
   * @return {{isValid: boolean, parsed: any}} 解析结果
   */
  function safeParseJson(str) {
    if (!str || typeof str !== 'string') return { isValid: false, parsed: null };
    const trimmed = str.trim();
    if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
      return { isValid: false, parsed: null };
    }
    try {
      const parsed = JSON.parse(trimmed);
      return { isValid: typeof parsed === 'object' && parsed !== null, parsed };
    } catch (e) {
      return { isValid: false, parsed: null };
    }
  }

  /**
   * 弹出详情预览模态窗口 (对齐智能助手 Tab5/Tab3 规范)
   * 包含等宽文本展示、一键复制、Esc独立关闭与 JSON 格式化支持
   *
   * @param {string} title 弹窗标题
   * @param {string} rawContent 原始内容
   */
  function showDetailModal(title, rawContent) {
    const existing = document.getElementById('datax-api-detail-modal');
    if (existing) existing.remove();

    const strContent = (rawContent === null || rawContent === undefined) ? '' : String(rawContent);
    const jsonCheck = safeParseJson(strContent);
    const isJson = jsonCheck.isValid;
    let currentContent = isJson ? JSON.stringify(jsonCheck.parsed, null, 2) : strContent;

    const modal = document.createElement('div');
    modal.id = 'datax-api-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000025;display:flex;align-items:center;justify-content:center;';

    const statusBadge = isJson
      ? '<span style="background:#f6ffed;color:#52c41a;border:1px solid #b7eb8f;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:normal;">🏷️ JSON 格式 (已自动格式化)</span>'
      : '';

    const jsonActionsHtml = isJson ? `
      <div style="display:flex;gap:8px;">
        <button type="button" id="datax-api-modal-btn-format" style="background:#fafafa;border:1px solid #d9d9d9;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;color:#303133;">格式化 JSON</button>
        <button type="button" id="datax-api-modal-btn-compress" style="background:#fafafa;border:1px solid #d9d9d9;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;color:#303133;">压缩为单行</button>
      </div>
    ` : '<div></div>';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:720px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,0.25);">
        <div style="padding:12px 16px;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:13px;color:#303133;">[${safeEscapeHtml(title)}] 详情预览</strong>
            ${statusBadge}
          </div>
          <span id="datax-api-modal-close" style="cursor:pointer;font-size:20px;color:#909399;font-weight:bold;line-height:1;">&times;</span>
        </div>
        <div style="padding:14px 16px;flex:1;overflow:auto;display:flex;flex-direction:column;">
          <textarea id="datax-api-modal-textarea" readonly style="width:100%;box-sizing:border-box;height:320px;padding:10px 12px;font-family:Consolas, Monaco, monospace;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;background:#f8f9fa;line-height:1.5;resize:vertical;">${safeEscapeHtml(currentContent)}</textarea>
        </div>
        <div style="padding:10px 16px;border-top:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;">
          ${jsonActionsHtml}
          <div style="display:flex;gap:8px;">
            <button type="button" id="datax-api-modal-copy-btn" style="background:#1890ff;color:#fff;border:none;padding:5px 16px;border-radius:4px;cursor:pointer;font-size:12px;">复制当前内容</button>
            <button type="button" id="datax-api-modal-cancel-btn" style="background:#fff;border:1px solid #d9d9d9;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;color:#595959;">关闭</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const textarea = modal.querySelector('#datax-api-modal-textarea');
    const btnFormat = modal.querySelector('#datax-api-modal-btn-format');
    const btnCompress = modal.querySelector('#datax-api-modal-btn-compress');
    const closeBtn = modal.querySelector('#datax-api-modal-close');
    const cancelBtn = modal.querySelector('#datax-api-modal-cancel-btn');
    const copyBtn = modal.querySelector('#datax-api-modal-copy-btn');

    const closeModal = () => {
      window.removeEventListener('keydown', onModalKeyDown, true);
      modal.remove();
    };

    const onModalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    };
    window.addEventListener('keydown', onModalKeyDown, true);

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    if (btnFormat) {
      btnFormat.onclick = () => {
        try {
          textarea.value = JSON.stringify(JSON.parse(textarea.value), null, 2);
        } catch (e) {}
      };
    }
    if (btnCompress) {
      btnCompress.onclick = () => {
        try {
          textarea.value = JSON.stringify(JSON.parse(textarea.value));
        } catch (e) {}
      };
    }

    if (copyBtn) {
      copyBtn.onclick = () => {
        const textToCopy = textarea.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            toast('🎉 已成功复制到剪贴板！');
          }).catch(() => {
            alert('复制失败，请手动选取复制');
          });
        } else {
          textarea.select();
          document.execCommand('copy');
          toast('🎉 已成功复制到剪贴板！');
        }
      };
    }
  }

  /**
   * 驼峰转下划线命名 (CamelCase -> snake_case)
   * 例如: glueUpdatetime -> glue_updatetime, datasourceId -> datasource_id
   */
  function camelToSnake(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/([A-Z]+)/g, '_$1')
      .replace(/^_/, '')
      .toLowerCase();
  }

  /**
   * 下划线转小驼峰命名 (snake_case -> camelCase)
   * 例如: glue_updatetime -> glueUpdatetime
   */
  function snakeToCamel(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * 归一化清洗字符串（移除下划线、中划线并全小写）
   */
  function normalizeFieldName(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[-_]/g, '').toLowerCase();
  }

  /**
   * 智能多级字段匹配引擎
   * 优先级：1.完全同名 -> 2.驼峰转下划线 -> 3.下划线转驼峰 -> 4.归一化清洗对比
   */
  function findBestMatchedColumn(srcField, candidateCols) {
    if (!srcField || !candidateCols || candidateCols.length === 0) return null;

    const cleanSrc = srcField.trim();
    if (!cleanSrc) return null;

    const srcLower = cleanSrc.toLowerCase();
    const srcSnake = camelToSnake(cleanSrc);
    const srcCamel = snakeToCamel(cleanSrc);
    const srcNorm = normalizeFieldName(cleanSrc);

    // 标准化候选列结构
    const cols = candidateCols.map(c => {
      const name = typeof c === 'string' ? c : (c.columnName || c.name || '');
      return {
        raw: name,
        lower: name.toLowerCase(),
        snake: camelToSnake(name),
        camel: snakeToCamel(name),
        norm: normalizeFieldName(name)
      };
    }).filter(c => Boolean(c.raw));

    // 级别 1: 忽略大小写的完全同名匹配
    const exact = cols.find(c => c.lower === srcLower);
    if (exact) {
      return { targetCol: exact.raw, matchType: 'EXACT' };
    }

    // 级别 2: 源字段为驼峰，目标列为下划线 (如 glueUpdatetime -> glue_updatetime)
    const camelToSnakeMatch = cols.find(c => c.lower === srcSnake || c.snake === srcSnake);
    if (camelToSnakeMatch) {
      return { targetCol: camelToSnakeMatch.raw, matchType: 'CAMEL_TO_SNAKE' };
    }

    // 级别 3: 源字段为下划线，目标列为驼峰 (如 glue_updatetime -> glueUpdatetime)
    const snakeToCamelMatch = cols.find(c => c.lower === srcCamel.toLowerCase() || c.camel === srcCamel);
    if (snakeToCamelMatch) {
      return { targetCol: snakeToCamelMatch.raw, matchType: 'SNAKE_TO_CAMEL' };
    }

    // 级别 4: 剔除所有下划线/连字符的归一化松散匹配 (如 jobCron -> job_cron / jobcron)
    const normMatch = cols.find(c => c.norm === srcNorm);
    if (normMatch) {
      return { targetCol: normMatch.raw, matchType: 'NORMALIZED' };
    }

    return null;
  }

  class Tab7ApiTask {
    constructor(container) {
      this.container = container;
      this.currentPage = 1;
      this.pageSize = 10;
      this.total = 0;
      this.currentTasks = [];
      this.datasources = [];
      this.currentSampleFields = [];
      this.currentSampleRows = [];
      this.currentTargetColumns = [];
      this.targetTableSelect = null; // 目标端表名可搜索一体化下拉组件实例 (对齐 Tab 5)
      this._lastLoadedTargetTable = null; // 缓存已加载列结构的目标表名，避免输入时重复发起请求
    }

    init() {
      this.renderSkeleton();
      this.bindEvents();
      this.loadDatasources();
      this.loadTaskList();
    }

    renderSkeleton() {
      this.container.innerHTML = `
        <div style="background: #f8f9fa; border: 1px solid #dcdfe6; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; flex: 1; min-width: 260px;">
            <input type="text" id="datax-api-search-name" placeholder="🔍 检索任务名称..." style="padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; min-width: 140px; flex: 1; box-sizing: border-box;" />
            <select id="datax-api-search-status" style="padding: 5px 6px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
              <option value="">全部状态</option>
              <option value="1">🟢 运行中</option>
              <option value="0">⚪ 已停止</option>
              <option value="2">📝 暂存草稿</option>
            </select>
            <button id="datax-api-btn-query" style="background: #1890ff; color: #fff; border: none; padding: 5px 12px; border-radius: 3px; font-weight: bold; cursor: pointer; white-space: nowrap;">🔍 查询</button>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button id="datax-api-btn-refresh" style="background: #f0f2f5; color: #303133; border: 1px solid #dcdfe6; padding: 5px 10px; border-radius: 3px; cursor: pointer; white-space: nowrap;">刷新</button>
            <button id="datax-api-btn-top-demo" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 5px 12px; border-radius: 3px; font-weight: bold; cursor: pointer; white-space: nowrap;">快速载入任务管理Demo</button>
            <button id="datax-api-btn-create" style="background: #52c41a; color: #fff; border: none; padding: 5px 14px; border-radius: 3px; font-weight: bold; cursor: pointer; white-space: nowrap;">➕ 新建接口采集任务</button>
          </div>
        </div>

        <!-- 任务编辑抽屉 (可折叠展开) -->
        <div id="datax-api-editor-panel" style="display: none; background: #fff; border: 1px solid #1890ff; border-radius: 6px; padding: 12px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(24,144,255,0.12);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ebeef5; padding-bottom: 8px; margin-bottom: 10px;">
            <div style="display: flex; align-items: center;">
              <span id="datax-api-editor-title" style="font-size: 13px; font-weight: bold; color: #1890ff;">➕ 新建接口数据采集与落库任务</span>
              <button id="datax-api-btn-load-demo" type="button" style="background: #e6f7ff; color: #1890ff; border: 1px dashed #1890ff; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; margin-left: 10px;" title="一键自动填充查询本地任务管理列表的Demo配置">载入本地任务管理列表Demo</button>
            </div>
            <span id="datax-api-btn-close-editor" style="cursor: pointer; font-size: 18px; color: #909399; font-weight: bold;" title="关闭">&times;</span>
          </div>
          <input type="hidden" id="datax-api-form-id" value="" />

          <!-- 卡片 1: 基础请求协议 -->
          <div id="datax-api-step1-card" style="background: #fafafa; border: 1px solid #ebeef5; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px;">
            <div id="datax-api-step1-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; margin-bottom: 6px;">
              <span style="font-weight: bold; color: #303133;">🌐 1. 接口请求协议定义</span>
              <button type="button" id="datax-api-step1-toggle" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 1px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">▲ 收起</button>
            </div>
            <div id="datax-api-step1-body">
              <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-bottom: 6px;">
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">任务名称 <span style="color:red;">*</span>:</label>
                  <input type="text" id="datax-api-form-name" placeholder="如: 每日同步ERP销售订单接口" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">请求方式 <span style="color:red;">*</span>:</label>
                  <select id="datax-api-form-method" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">认证方式:</label>
                  <select id="datax-api-form-auth-type" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                    <option value="NONE">无认证 (NONE)</option>
                    <option value="BEARER_TOKEN">Bearer Token</option>
                    <option value="API_KEY">API Key / 固定Token</option>
                    <option value="BASIC_AUTH">Basic Auth</option>
                    <option value="PRE_SCRIPT">自定义前置脚本 (PRE_SCRIPT)</option>
                  </select>
                </div>
              </div>

              <div style="margin-bottom: 6px;">
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">请求 URL <span style="color:red;">*</span> <span style="font-size: 11px; font-weight: normal; color: #888;">(支持 \${yyyyMMdd}, \${yyyy-MM-dd}, \${timestamp})</span>:</label>
                <input type="text" id="datax-api-form-url" placeholder="https://api.example.com/v1/orders?date=\${yyyyMMdd}" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
              </div>

              <!-- 动态认证参数配置区域 -->
              <div id="datax-api-auth-config-box" style="display: none; background: #fff; border: 1px dashed #dcdfe6; border-radius: 4px; padding: 6px; margin-bottom: 6px;">
                <div id="datax-api-auth-bearer-row" style="display: none;">
                  <label style="font-size: 11px; font-weight: bold;">Bearer Token:</label>
                  <input type="text" id="datax-api-auth-bearer-token" placeholder="输入 token 字符串..." style="width: 100%; box-sizing: border-box; padding: 4px 6px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div id="datax-api-auth-apikey-row" style="display: none; grid-template-columns: 1fr 2fr 1fr; gap: 6px;">
                  <div>
                    <label style="font-size: 11px; font-weight: bold;">Key 名称:</label>
                    <input type="text" id="datax-api-auth-key-name" placeholder="如: X-Access-Token" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                  </div>
                  <div>
                    <label style="font-size: 11px; font-weight: bold;">Key 对应值:</label>
                    <input type="text" id="datax-api-auth-key-val" placeholder="密钥值..." style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                  </div>
                  <div>
                    <label style="font-size: 11px; font-weight: bold;">位置:</label>
                    <select id="datax-api-auth-key-pos" style="width: 100%; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                      <option value="header">请求头 (Header)</option>
                      <option value="query">URL参数 (Query)</option>
                    </select>
                  </div>
                </div>
                <div id="datax-api-auth-basic-row" style="display: none; grid-template-columns: 1fr 1fr; gap: 6px;">
                  <div>
                    <label style="font-size: 11px; font-weight: bold;">用户名:</label>
                    <input type="text" id="datax-api-auth-basic-user" placeholder="Basic Username" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                  </div>
                  <div>
                    <label style="font-size: 11px; font-weight: bold;">密码:</label>
                    <input type="password" id="datax-api-auth-basic-pass" placeholder="Basic Password" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                  </div>
                </div>
                <div id="datax-api-auth-prescript-row" style="display: none; flex-direction: column; gap: 6px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 11px; font-weight: bold; color: #1890ff;">
                      JavaScript 前置脚本 (Pre-request Script) <span style="color:red;">*</span>
                    </label>
                    <div style="display: flex; gap: 6px; align-items: center;">
                      <span style="font-size: 11px; color: #909399;">预设模板:</span>
                      <button type="button" id="datax-api-tpl-hst" style="background: #fafafa; border: 1px solid #d9d9d9; padding: 2px 8px; border-radius: 3px; font-size: 11px; cursor: pointer; color: #1890ff;">出租平台HMAC加签</button>
                      <button type="button" id="datax-api-tpl-md5" style="background: #fafafa; border: 1px solid #d9d9d9; padding: 2px 8px; border-radius: 3px; font-size: 11px; cursor: pointer; color: #52c41a;">MD5签名</button>
                      <button type="button" id="datax-api-tpl-clear" style="background: #fafafa; border: 1px solid #d9d9d9; padding: 2px 8px; border-radius: 3px; font-size: 11px; cursor: pointer; color: #909399;">清空</button>
                      <button type="button" id="datax-api-btn-test-script" style="background: #e6f7ff; border: 1px solid #91d5ff; padding: 2px 10px; border-radius: 3px; font-size: 11px; cursor: pointer; color: #096dd9; font-weight: bold;">测试脚本</button>
                    </div>
                  </div>
                  <textarea id="datax-api-auth-prescript-code" placeholder="// 在此编写 JavaScript 前置脚本，发包前由沙箱引擎执行&#10;// 内置对象: context.url, context.method, context.path, context.headers, context.params, context.body&#10;// 工具库: crypto.hmacSha256(str, key), crypto.md5(str), crypto.sha256(str), crypto.base64Encode(str)&#10;// 打印命令: console.log(...) 或 print(...)&#10;&#10;context.headers['X-Custom-Time'] = Math.floor(Date.now() / 1000).toString();&#10;console.log('当前注入的时间戳: ' + context.headers['X-Custom-Time']);" style="width: 100%; height: 160px; box-sizing: border-box; padding: 8px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; line-height: 1.5; resize: vertical; background: #fdfdfd;"></textarea>
                  <div style="font-size: 11px; color: #8c8c8c; line-height: 1.4;">
                    💡 <strong>脚本说明:</strong> 在 HTTP 请求每次发包前执行（翻页时自动重新执行），支持使用 <code style="color: #1890ff;">console.log(...)</code> 或 <code style="color: #1890ff;">print(...)</code> 输出调试日志，点击「测试脚本」即可在本地沙箱运行并实时查看打印输出及修改后的 Headers。
                  </div>
                  <div id="datax-api-script-console-box" style="display: none; background: #1e1e1e; color: #d4d4d4; padding: 8px 10px; border-radius: 4px; font-family: Consolas, Monaco, monospace; font-size: 12px; margin-top: 4px; max-height: 200px; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 6px;">
                      <span style="font-weight: bold; color: #52c41a;">控制台输出 (Console Logs)</span>
                      <button type="button" id="datax-api-script-console-clear" style="background: #333; color: #aaa; border: none; padding: 1px 6px; border-radius: 2px; font-size: 10px; cursor: pointer;">清空</button>
                    </div>
                    <div id="datax-api-script-console-content" style="white-space: pre-wrap; word-break: break-all; line-height: 1.5;"></div>
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 6px;">
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">请求头 (Headers JSON):</label>
                  <textarea id="datax-api-form-headers" placeholder='{"Content-Type":"application/json"}' style="width: 100%; height: 45px; box-sizing: border-box; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; resize: vertical;"></textarea>
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">Query 参数 (JSON) <span style="font-size: 11px; font-weight: normal; color: #888;">(仅填业务过滤参数，分页参数由下方策略动态注入)</span>:</label>
                  <textarea id="datax-api-form-params" placeholder='{"jobGroup":0}' style="width: 100%; height: 45px; box-sizing: border-box; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; resize: vertical;"></textarea>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 3fr; gap: 8px;">
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">请求体类型:</label>
                  <select id="datax-api-form-body-type" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                    <option value="none">none (无Body)</option>
                    <option value="json">application/json</option>
                    <option value="form">x-www-form-urlencoded</option>
                  </select>
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">请求体内容 (Body):</label>
                  <textarea id="datax-api-form-body" placeholder="POST请求时的 Body 报文..." style="width: 100%; height: 45px; box-sizing: border-box; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; resize: vertical;"></textarea>
                </div>
              </div>
            </div>
          </div>

          <!-- 卡片 1.5: 参数驱动源配置 (可选) -->
          <div id="datax-api-step-driver-card" style="background: #fafafa; border: 1px solid #ebeef5; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px;">
            <div id="datax-api-step-driver-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: bold; color: #303133;">💡 1.5 参数驱动源配置 (可选)</span>
                <span style="font-size: 11px; color: #909399;">(根据内部业务表查询参数，动态遍历或切片过滤三方接口，避免全量同步海量数据)</span>
              </div>
              <button type="button" id="datax-api-step-driver-toggle" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 1px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">▲ 收起</button>
            </div>
            <div id="datax-api-step-driver-body">
              <div style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 6px;">
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">驱动端数据源:</label>
                  <select id="datax-api-form-driver-ds" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                    <option value="">⚪ 无驱动源 (普通单接口模式)</option>
                  </select>
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">驱动切片模式:</label>
                  <select id="datax-api-form-driver-mode" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                    <option value="ROW">ROW (单行逐条遍历)</option>
                    <option value="BATCH">BATCH (批次切片拼接)</option>
                  </select>
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">切片批次大小:</label>
                  <input type="number" id="datax-api-form-driver-batch-size" value="1" min="1" placeholder="ROW填1/BATCH填20~100" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">批次请求休眠 (ms):</label>
                  <input type="number" id="datax-api-form-driver-delay" value="0" min="0" placeholder="防三方429限流" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
              </div>

              <div style="margin-bottom: 6px;">
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">
                  驱动参数查询 SQL (只读 SELECT):
                  <span style="font-size: 11px; font-weight: normal; color: #888;">(例如: SELECT veh_num FROM dim_vehicle WHERE is_active = 1)</span>
                </label>
                <textarea id="datax-api-form-driver-sql" placeholder="SELECT veh_num FROM dim_vehicle WHERE is_active = 1" style="width: 100%; height: 50px; box-sizing: border-box; padding: 5px; font-size: 12px; font-family: Consolas, Monaco, monospace; border: 1px solid #dcdfe6; border-radius: 4px; resize: vertical;"></textarea>
              </div>

              <!-- 驱动动态占位符复制栏 -->
              <div style="background: #f6ffed; border: 1px dashed #b7eb8f; border-radius: 4px; padding: 6px 10px; font-size: 11px; color: #389e0d; line-height: 1.6;">
                <div style="font-weight: bold; margin-bottom: 4px;">💡 驱动动态占位符 (可在 URL、Headers、Params、Body 中直接引用，点击一键复制)：</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                  <span class="datax-driver-badge" data-code="\${driver.veh_num}" style="cursor: pointer; background: #fff; border: 1px solid #b7eb8f; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：当前行字段值 (单行模式或批次逗号拼接，如 粤B1,粤B2)">📋 \${driver.字段名}</span>
                  <span class="datax-driver-badge" data-code="\${driver.veh_num_json}" style="cursor: pointer; background: #fff; border: 1px solid #b7eb8f; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：JSON 数组格式 (仅 BATCH 模式有效，如 ['粤B1','粤B2'])">📋 \${driver.字段名_json}</span>
                  <span class="datax-driver-badge" data-code="\${driver.veh_num_sql}" style="cursor: pointer; background: #fff; border: 1px solid #b7eb8f; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：SQL IN 列表格式 (如 '粤B1','粤B2')">📋 \${driver.字段名_sql}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 卡片 2: 分页策略与响应提取 -->
          <div id="datax-api-step2-card" style="background: #fafafa; border: 1px solid #ebeef5; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px;">
            <div id="datax-api-step2-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; margin-bottom: 6px;">
              <span style="font-weight: bold; color: #303133;">📑 2. 分页策略与响应数据提取 (JSONPath)</span>
              <button type="button" id="datax-api-step2-toggle" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 1px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">▲ 收起</button>
            </div>
            <div id="datax-api-step2-body">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1.2fr; gap: 8px; margin-bottom: 6px;">
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">分页模式:</label>
                  <select id="datax-api-form-page-strat" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                    <option value="NONE">单次请求 (不分页)</option>
                    <option value="PAGE_NUM">页码分页 (PageNum & PageSize)</option>
                    <option value="OFFSET">偏移量分页 (Offset & Limit)</option>
                    <option value="CURSOR">游标滚动 (Cursor / NextToken)</option>
                  </select>
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">页码/偏移量参数名:</label>
                  <input type="text" id="datax-api-form-page-param" value="pageNum" placeholder="如 pageNum 或 offset" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">每页数量参数名:</label>
                  <input type="text" id="datax-api-form-size-param" value="pageSize" placeholder="如 pageSize 或 limit" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">起始页 / 每页条数 / 上限:</label>
                  <div style="display: flex; gap: 4px;">
                    <input type="number" id="datax-api-form-page-start" value="1" title="起始页码(0或1)" style="width: 33%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                    <input type="number" id="datax-api-form-page-size" value="100" title="每页条数" style="width: 33%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                    <input type="number" id="datax-api-form-max-pages" value="500" title="最大保护页数" style="width: 34%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 8px;">
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">数据列表提取路径 (JSONPath) <span style="color:red;">*</span>:</label>
                  <input type="text" id="datax-api-form-data-path" value="$.data" placeholder="如 $.data.list 或 $.data.records 或 $" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">游标提取路径:</label>
                  <input type="text" id="datax-api-form-cursor-path" placeholder="如 $.data.next_cursor" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">业务状态码路径:</label>
                  <input type="text" id="datax-api-form-code-path" value="$.code" placeholder="如 $.code" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">状态码期望值:</label>
                  <input type="text" id="datax-api-form-code-val" value="200" placeholder="如 200 或 0 或 true" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
              </div>
            </div>
          </div>

          <!-- 卡片 2.5: 增量模式与增量时间配置 -->
          <div id="datax-api-step-inc-card" style="background: #fafafa; border: 1px solid #ebeef5; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px;">
            <div id="datax-api-step-inc-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: bold; color: #303133;">⏱️ 2.5 增量配置</span>
                <span style="font-size: 11px; color: #909399;">(支持基于时间自动进行增量同步)</span>
              </div>
              <button type="button" id="datax-api-step-inc-toggle" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 1px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">▲ 收起</button>
            </div>
            <div id="datax-api-step-inc-body">
              <div style="display: grid; grid-template-columns: 1.2fr 2fr 1.5fr; gap: 8px; margin-bottom: 6px;">
                <div>
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">同步模式 <span style="color:red;">*</span>:</label>
                  <select id="datax-api-form-inc-type" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                    <option value="0">⚪ 全量同步 (Full Sync)</option>
                    <option value="1">⏱️ 时间增量同步 (Incremental)</option>
                  </select>
                </div>
                <div id="datax-api-inc-time-group" style="display: none;">
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">
                    增量起始时间 <span style="color:red;">*</span>:
                  </label>
                  <div style="display: flex; gap: 4px;">
                    <input type="text" id="datax-api-form-inc-start-time" placeholder="如: 2026-01-01 00:00:00" style="flex: 1; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                    <button type="button" id="datax-api-btn-inc-today" style="background: #f0f2f5; border: 1px solid #dcdfe6; padding: 2px 6px; border-radius: 3px; font-size: 11px; cursor: pointer; white-space: nowrap;" title="设为今天零点">今天0点</button>
                    <button type="button" id="datax-api-btn-inc-1hour" style="background: #f0f2f5; border: 1px solid #dcdfe6; padding: 2px 6px; border-radius: 3px; font-size: 11px; cursor: pointer; white-space: nowrap;" title="设为1小时前">1小时前</button>
                  </div>
                </div>
                <div id="datax-api-inc-fmt-group" style="display: none;">
                  <label style="font-weight: bold; display: block; margin-bottom: 2px;">时间格式化模板:</label>
                  <div style="display: flex; gap: 4px;">
                    <input type="text" id="datax-api-form-inc-time-fmt" value="yyyy-MM-dd HH:mm:ss" placeholder="yyyy-MM-dd HH:mm:ss" style="flex: 1; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                    <select id="datax-api-inc-fmt-presets" style="width: 85px; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; background: #f8f9fa;">
                      <option value="">预设</option>
                      <option value="yyyy-MM-dd HH:mm:ss">标准时间</option>
                      <option value="yyyy-MM-dd">年月日</option>
                      <option value="yyyy-MM-ddTHH:mm:ss.SSSZ">ISO-8601</option>
                      <option value="timestamp">毫秒时间戳</option>
                      <option value="timestamp_sec">秒时间戳</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- 增量推进策略与时间字段抽取配置 -->
              <div id="datax-api-inc-advance-group" style="display: none; background: #fff; border: 1px solid #e8e8e8; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                <div style="display: grid; grid-template-columns: 1.5fr 2fr; gap: 8px;">
                  <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 2px;">增量推进策略:</label>
                    <select id="datax-api-form-inc-strategy" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                      <option value="0">⏱️ 取拉取数据中最大业务时间 (推荐/防T-1延迟漏数)</option>
                      <option value="1">🌐 按任务执行系统物理时间</option>
                    </select>
                  </div>
                  <div>
                    <label style="font-weight: bold; display: block; margin-bottom: 2px;">
                      数据时间字段名 (抽取最新时间):
                    </label>
                    <input type="text" id="datax-api-form-inc-col" placeholder="如 update_time、loginDate、insertTime" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                  </div>
                </div>
                <!-- 常用业务时间字段快捷候选 -->
                <div style="margin-top: 4px; font-size: 11px; color: #8c8c8c; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span>快捷填入字段:</span>
                  <span class="datax-inc-col-tag" data-col="update_time" style="cursor: pointer; background: #f5f5f5; border: 1px solid #d9d9d9; padding: 1px 6px; border-radius: 2px; color: #1890ff;">update_time</span>
                  <span class="datax-inc-col-tag" data-col="updateTime" style="cursor: pointer; background: #f5f5f5; border: 1px solid #d9d9d9; padding: 1px 6px; border-radius: 2px; color: #1890ff;">updateTime</span>
                  <span class="datax-inc-col-tag" data-col="loginDate" style="cursor: pointer; background: #f5f5f5; border: 1px solid #d9d9d9; padding: 1px 6px; border-radius: 2px; color: #1890ff;">loginDate</span>
                  <span class="datax-inc-col-tag" data-col="create_time" style="cursor: pointer; background: #f5f5f5; border: 1px solid #d9d9d9; padding: 1px 6px; border-radius: 2px; color: #1890ff;">create_time</span>
                  <span class="datax-inc-col-tag" data-col="createTime" style="cursor: pointer; background: #f5f5f5; border: 1px solid #d9d9d9; padding: 1px 6px; border-radius: 2px; color: #1890ff;">createTime</span>
                </div>
              </div>

              <!-- 动态占位符快速复制栏 -->
              <div style="background: #e6f7ff; border: 1px dashed #91d5ff; border-radius: 4px; padding: 6px 10px; font-size: 11px; color: #0050b3; line-height: 1.6;">
                <div style="font-weight: bold; margin-bottom: 4px;">💡 增量动态占位符 (可在 URL、Headers、Params、Body 中直接引用，点击一键复制)：</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                  <span class="datax-inc-badge" data-code="\${incStartTime}" style="cursor: pointer; background: #fff; border: 1px solid #91d5ff; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：本次增量起始时间（按模板格式化）">📋 \${incStartTime}</span>
                  <span class="datax-inc-badge" data-code="\${incEndTime}" style="cursor: pointer; background: #fff; border: 1px solid #91d5ff; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：本次增量结束时间（按模板格式化）">📋 \${incEndTime}</span>
                  <span class="datax-inc-badge" data-code="\${incStartTimestamp}" style="cursor: pointer; background: #fff; border: 1px solid #91d5ff; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：增量起始毫秒时间戳">📋 \${incStartTimestamp}</span>
                  <span class="datax-inc-badge" data-code="\${incEndTimestamp}" style="cursor: pointer; background: #fff; border: 1px solid #91d5ff; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：增量结束毫秒时间戳">📋 \${incEndTimestamp}</span>
                  <span class="datax-inc-badge" data-code="\${yyyyMMdd}" style="cursor: pointer; background: #fff; border: 1px solid #91d5ff; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：当天日期如 20260908">📋 \${yyyyMMdd}</span>
                  <span class="datax-inc-badge" data-code="\${yyyy-MM-dd}" style="cursor: pointer; background: #fff; border: 1px solid #91d5ff; padding: 2px 7px; border-radius: 3px; font-size: 11px;" title="点击复制：当天日期如 2026-09-08">📋 \${yyyy-MM-dd}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 卡片 3: 在线试运行与取样抽检 (支持垂直拖拽拉伸) -->
          <div id="datax-api-step3-card" style="background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px; resize: vertical; overflow: auto; min-height: 85px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: bold; color: #0050b3;">⚡ 3. 在线接口试运行与自动字段解析 <span style="font-size: 11px; font-weight: normal; color: #096dd9;">(可向下拖拽卡片右下角拉伸高度 ↘)</span></span>
              <button id="datax-api-btn-test-run" style="background: #1890ff; color: #fff; border: none; padding: 5px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;">🚀 发送请求并取样测试</button>
            </div>
            <div id="datax-api-test-run-result" style="display: none; background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; padding: 8px; font-size: 11px; resize: vertical; overflow: auto; min-height: 120px;"></div>
          </div>

          <!-- 卡片 4: 目标输出库表与字段映射 -->
          <div style="background: #fafafa; border: 1px solid #ebeef5; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px;">
            <div style="font-weight: bold; margin-bottom: 6px; color: #303133;">🎯 4. 输出目标库表与字段映射</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">目标端数据源 <span style="color:red;">*</span>:</label>
                <select id="datax-api-form-target-ds" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;"></select>
              </div>
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">目标端数据表 <span style="color:red;">*</span>:</label>
                <div id="datax-api-target-table-combobox" style="width: 100%;"></div>
                <input type="hidden" id="datax-api-form-target-table" value="" />
                <div id="datax-api-target-table-status-tip" style="font-size: 11px; margin-top: 2px; color: #909399; min-height: 15px; line-height: 1.2;"></div>
              </div>
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">写入模式:</label>
                <select id="datax-api-form-write-mode" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                  <option value="APPEND">APPEND (直接追加写入)</option>
                  <option value="OVERWRITE">OVERWRITE (写入前清空目标表)</option>
                  <option value="UPSERT">UPSERT (主键冲突则更新)</option>
                </select>
              </div>
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">目标表不存在时:</label>
                <label style="display: flex; align-items: center; gap: 4px; margin-top: 5px; cursor: pointer;">
                  <input type="checkbox" id="datax-api-form-auto-create" />
                  <span>自动推导建表</span>
                </label>
              </div>
            </div>

            <!-- 字段映射表格 -->
            <div style="margin-top: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <label style="font-weight: bold;">字段映射规则 <span style="color:red;">*</span>:</label>
                  <span id="datax-api-map-stat-tip" style="font-size: 11px; color: #909399;">(支持下拉模糊搜索目标列，智能匹配支持驼峰/下划线互转)</span>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button id="datax-api-btn-auto-map" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 2px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold;" title="一键根据接口源属性名自动匹配目标表列名，支持驼峰与下划线互转">自动一键同名匹配</button>
                  <button id="datax-api-btn-add-map-row" style="background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">➕ 添加映射行</button>
                </div>
              </div>
              <div style="max-height: 260px; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff;">
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                  <thead style="background: #f5f7fa; color: #606266; position: sticky; top: 0; z-index: 10;">
                    <tr>
                      <th style="padding: 5px 8px; text-align: left; border-bottom: 1px solid #ebeef5; width: 30%;">接口源属性 (Source Field)</th>
                      <th style="padding: 5px; text-align: center; border-bottom: 1px solid #ebeef5; width: 26px;">➡️</th>
                      <th style="padding: 5px 8px; text-align: left; border-bottom: 1px solid #ebeef5; width: 44%;">目标表列 (下拉搜索 / 智能匹配)</th>
                      <th style="padding: 5px 8px; text-align: left; border-bottom: 1px solid #ebeef5; width: 18%;">默认值 / 类型</th>
                      <th style="padding: 5px; text-align: center; border-bottom: 1px solid #ebeef5; width: 40px;">操作</th>
                    </tr>
                  </thead>
                  <tbody id="datax-api-mapping-tbody">
                    <tr><td colspan="5" style="text-align: center; color: #909399; padding: 15px;">暂无字段映射，点击【🚀 发送请求并取样测试】后可自动推导</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 卡片 5: 定时调度与健壮性配置 -->
          <div style="background: #fafafa; border: 1px solid #ebeef5; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px;">
            <div style="font-weight: bold; margin-bottom: 6px; color: #303133;">⏱️ 5. 定时调度与保护控制</div>
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 6px;">
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">Cron 定时调度表达式:</label>
                <div style="display: flex; gap: 4px;">
                  <input type="text" id="datax-api-form-cron" placeholder="0 0 2 * * ?" value="0 0 2 * * ?" style="flex: 1; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                  <select id="datax-api-cron-presets" style="width: 80px; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; background: #f8f9fa;">
                    <option value="">预设</option>
                    <option value="0 0 2 * * ?">每天02点</option>
                    <option value="0 0 * * * ?">每小时</option>
                    <option value="0 0/30 * * * ?">每30分钟</option>
                    <option value="0 0/10 * * * ?">每10分钟</option>
                  </select>
                </div>
              </div>
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">批处理大小 (Batch):</label>
                <input type="number" id="datax-api-form-batch-size" value="1000" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
              </div>
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">请求休眠延时 (ms):</label>
                <input type="number" id="datax-api-form-delay" value="0" placeholder="防限流休眠" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
              </div>
              <div>
                <label style="font-weight: bold; display: block; margin-bottom: 2px;">超时时间(秒):</label>
                <input type="number" id="datax-api-form-timeout" value="60" style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
              </div>
            </div>
          </div>

          <!-- 底部保存操作栏 -->
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
            <button id="datax-api-btn-cancel-save" style="background: #f0f2f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 18px; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="datax-api-btn-draft-save" style="background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; padding: 6px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;" title="暂存当前草稿配置（即使部分项未填写完整也可暂存），可随时重新打开编辑">暂存草稿</button>
            <button id="datax-api-btn-submit-save" style="background: #1890ff; color: #fff; border: none; padding: 6px 24px; border-radius: 4px; font-weight: bold; cursor: pointer;">保存采集任务</button>
          </div>
        </div>

        <!-- 任务列表容器 -->
        <div id="datax-api-task-list-box" style="flex: 1; overflow-y: auto; background: #fff; border: 1px solid #ebeef5; border-radius: 6px;"></div>

        <!-- 分页控件栏 -->
        <div id="datax-api-pagination-bar" style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #606266;"></div>
      `;
    }

    bindEvents() {
      // 搜索与刷新
      this.container.querySelector('#datax-api-btn-query').onclick = () => { this.currentPage = 1; this.loadTaskList(); };
      this.container.querySelector('#datax-api-btn-refresh').onclick = () => { this.loadTaskList(); };
      this.container.querySelector('#datax-api-search-name').onkeydown = (e) => { if (e.key === 'Enter') { this.currentPage = 1; this.loadTaskList(); } };

      // 新建任务与快速 Demo
      this.container.querySelector('#datax-api-btn-create').onclick = () => { this.openEditor(); };
      this.container.querySelector('#datax-api-btn-top-demo').onclick = () => {
        this.openEditor();
        this.loadLocalJobDemo();
      };
      this.container.querySelector('#datax-api-btn-load-demo').onclick = () => {
        this.loadLocalJobDemo();
      };
      this.container.querySelector('#datax-api-btn-close-editor').onclick = () => { this.closeEditor(); };
      this.container.querySelector('#datax-api-btn-cancel-save').onclick = () => { this.closeEditor(); };

      // 认证模式切换联动
      const authSelect = this.container.querySelector('#datax-api-form-auth-type');
      authSelect.onchange = () => { this.toggleAuthFields(authSelect.value); };

      // Cron 预设快捷填充
      this.container.querySelector('#datax-api-cron-presets').onchange = (e) => {
        if (e.target.value) {
          this.container.querySelector('#datax-api-form-cron').value = e.target.value;
        }
      };

      // 目标数据源切换联动加载表名并清空已选表
      this.container.querySelector('#datax-api-form-target-ds').onchange = (e) => {
        this.setTargetTableValue('');
        this.loadTargetTables(e.target.value);
      };

      // 实例化目标端表名一体化可搜索下拉框 (对齐 Tab 5 规范与视觉风格，支持已有表检索与自由手写新表名)
      const SearchSelectClass = (window.DataXAssistant && window.DataXAssistant.SearchableSelect) || null;
      if (SearchSelectClass) {
        const tableBox = this.container.querySelector('#datax-api-target-table-combobox');
        const hiddenInput = this.container.querySelector('#datax-api-form-target-table');
        if (tableBox && hiddenInput) {
          this.targetTableSelect = new SearchSelectClass({
            container: tableBox,
            hiddenInput: hiddenInput,
            placeholder: '-- 搜索表名或业务中文注解 (支持输入新表名) --',
            allowCustomInput: true,
            emptyText: '未检索到匹配的已有表，可直接使用当前输入的新表名',
            onSelect: () => {
              this.handleTargetTableInputChange();
            }
          });
          if (this.targetTableSelect.dropdownEl) {
            this.targetTableSelect.dropdownEl.style.minWidth = '360px';
          }
        }
      }

      // 目标数据表输入兼容兜底监听 (若未挂载 SearchableSelect 时兼容处理)
      const targetTableInput = this.container.querySelector('#datax-api-form-target-table');
      if (targetTableInput && targetTableInput.tagName === 'INPUT' && targetTableInput.type !== 'hidden') {
        targetTableInput.oninput = () => {
          this.handleTargetTableInputChange();
        };
        targetTableInput.onchange = () => {
          this.handleTargetTableInputChange(true);
        };
      }

      // 目标表自动建表复选框联动刷新字段映射状态徽标
      const autoCreateCheckbox = this.container.querySelector('#datax-api-form-auto-create');
      if (autoCreateCheckbox) {
        autoCreateCheckbox.onchange = () => {
          this.refreshMappingRowBadges();
        };
      }

      // 全局点击自动收起所有打开的目标列下拉候选浮层
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.datax-target-col-wrap')) {
          this.container.querySelectorAll('.datax-col-dropdown-panel').forEach(p => {
            p.style.display = 'none';
          });
        }
      });

      // 在线试运行与取样
      this.container.querySelector('#datax-api-btn-test-run').onclick = () => { this.handleTestRun(); };

      // 字段映射快捷操作
      this.container.querySelector('#datax-api-btn-auto-map').onclick = () => { this.autoMapFields(); };
      this.container.querySelector('#datax-api-btn-add-map-row').onclick = () => { this.addMappingRow('', ''); };

      // 前置脚本预设模板载入与单测
      const prescriptTextarea = this.container.querySelector('#datax-api-auth-prescript-code');
      const btnTplHst = this.container.querySelector('#datax-api-tpl-hst');
      if (btnTplHst) {
        btnTplHst.onclick = () => {
          const tplHst =
            '// 出租平台 (慧视通/HST) HMAC-SHA256 动态签名模板\n' +
            'var accessKey = "YOUR_ACCESS_KEY";\n' +
            'var accessSecret = "YOUR_ACCESS_SECRET";\n\n' +
            '// 1. 生成当前秒时间戳与 6位随机数\n' +
            'var timestamp = Math.floor(Date.now() / 1000).toString();\n' +
            'var nonce = Math.floor(100000 + Math.random() * 900000).toString();\n\n' +
            '// 2. 拼接规范待签串: method & urlPath & accessKey & timestamp & nonce\n' +
            '// (context.path 自动去除域名与Query参数，例如: /api/vehicle/vehiclePage)\n' +
            'var stringToSign = context.method + "&" + context.path + "&" + accessKey + "&" + timestamp + "&" + nonce;\n\n' +
            '// 3. 计算 HMAC-SHA256 签名 (Base64编码)\n' +
            'var sign = crypto.hmacSha256(stringToSign, accessSecret);\n\n' +
            '// 4. 打印调试输出 (支持 console.log 或 print)\n' +
            'console.log("[HST Sign] 待签串: " + stringToSign);\n' +
            'console.log("[HST Sign] 签名值: " + sign);\n\n' +
            '// 5. 动态写入请求头\n' +
            'context.headers["accessKey"] = accessKey;\n' +
            'context.headers["timestamp"] = timestamp;\n' +
            'context.headers["nonce"] = nonce;\n' +
            'context.headers["sign"] = sign;\n';
          if (prescriptTextarea) {
            prescriptTextarea.value = tplHst;
            toast('已载入出租平台 HMAC 加签模板，请替换 accessKey 与 accessSecret！');
          }
        };
      }
      const btnTplMd5 = this.container.querySelector('#datax-api-tpl-md5');
      if (btnTplMd5) {
        btnTplMd5.onclick = () => {
          const tplMd5 =
            '// 通用 MD5 签名模板\n' +
            'var appSecret = "YOUR_APP_SECRET";\n' +
            'var timestamp = Math.floor(Date.now() / 1000).toString();\n\n' +
            '// 拼接规范串\n' +
            'var stringToSign = context.path + "?timestamp=" + timestamp + "&secret=" + appSecret;\n' +
            'var sign = crypto.md5(stringToSign);\n\n' +
            'console.log("[MD5 Sign] 待签串: " + stringToSign);\n' +
            'console.log("[MD5 Sign] 签名值: " + sign);\n\n' +
            'context.headers["X-Timestamp"] = timestamp;\n' +
            'context.headers["X-Signature"] = sign;\n';
          if (prescriptTextarea) {
            prescriptTextarea.value = tplMd5;
            toast('已载入通用 MD5 签名模板！');
          }
        };
      }
      const btnTplClear = this.container.querySelector('#datax-api-tpl-clear');
      if (btnTplClear) {
        btnTplClear.onclick = () => {
          if (prescriptTextarea) {
            prescriptTextarea.value = '';
            toast('已清空前置脚本内容');
          }
        };
      }
      const btnTestScript = this.container.querySelector('#datax-api-btn-test-script');
      if (btnTestScript) {
        btnTestScript.onclick = () => { this.handleTestScript(); };
      }
      const btnClearConsole = this.container.querySelector('#datax-api-script-console-clear');
      if (btnClearConsole) {
        btnClearConsole.onclick = () => {
          const consoleContent = this.container.querySelector('#datax-api-script-console-content');
          const consoleBox = this.container.querySelector('#datax-api-script-console-box');
          if (consoleContent) consoleContent.innerHTML = '';
          if (consoleBox) consoleBox.style.display = 'none';
        };
      }

      // 暂存草稿与正式保存提交
      const btnDraftSave = this.container.querySelector('#datax-api-btn-draft-save');
      if (btnDraftSave) {
        btnDraftSave.onclick = () => { this.handleDraftSave(); };
      }
      this.container.querySelector('#datax-api-btn-submit-save').onclick = () => { this.handleSubmitSave(); };
      const btnCancelSave = this.container.querySelector('#datax-api-btn-cancel-save');
      if (btnCancelSave) {
        btnCancelSave.onclick = () => { this.closeEditor(); };
      }

      // 步骤 1 和 步骤 2 折叠/收起切换事件绑定
      const step1Header = this.container.querySelector('#datax-api-step1-header');
      const step1Body = this.container.querySelector('#datax-api-step1-body');
      const step1Toggle = this.container.querySelector('#datax-api-step1-toggle');
      if (step1Header) {
        step1Header.onclick = () => this.toggleSectionCollapse(step1Body, step1Toggle);
      }

      const step2Header = this.container.querySelector('#datax-api-step2-header');
      const step2Body = this.container.querySelector('#datax-api-step2-body');
      const step2Toggle = this.container.querySelector('#datax-api-step2-toggle');
      if (step2Header) {
        step2Header.onclick = () => this.toggleSectionCollapse(step2Body, step2Toggle);
      }

      // 增量同步模式切换联动
      const incSelect = this.container.querySelector('#datax-api-form-inc-type');
      if (incSelect) {
        incSelect.onchange = () => {
          this.toggleIncrementFields(incSelect.value === '1');
        };
      }

      // 增量时间格式预设
      const fmtPreset = this.container.querySelector('#datax-api-inc-fmt-presets');
      if (fmtPreset) {
        fmtPreset.onchange = (e) => {
          if (e.target.value) {
            this.container.querySelector('#datax-api-form-inc-time-fmt').value = e.target.value;
          }
        };
      }

      // 快捷设置起始时间
      const btnToday = this.container.querySelector('#datax-api-btn-inc-today');
      if (btnToday) {
        btnToday.onclick = () => {
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          this.container.querySelector('#datax-api-form-inc-start-time').value = `${y}-${m}-${d} 00:00:00`;
        };
      }
      const btn1Hour = this.container.querySelector('#datax-api-btn-inc-1hour');
      if (btn1Hour) {
        btn1Hour.onclick = () => {
          const past = new Date(Date.now() - 3600 * 1000);
          const y = past.getFullYear();
          const m = String(past.getMonth() + 1).padStart(2, '0');
          const d = String(past.getDate()).padStart(2, '0');
          const h = String(past.getHours()).padStart(2, '0');
          const mm = String(past.getMinutes()).padStart(2, '0');
          const s = String(past.getSeconds()).padStart(2, '0');
          this.container.querySelector('#datax-api-form-inc-start-time').value = `${y}-${m}-${d} ${h}:${mm}:${s}`;
        };
      }

      // 点击占位符一键复制
      this.container.querySelectorAll('.datax-inc-badge').forEach(badge => {
        badge.onclick = (e) => {
          e.stopPropagation();
          const code = badge.getAttribute('data-code');
          if (!code) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(() => {
              toast(`已复制占位符: ${code}`);
            }).catch(() => {
              toast(`复制失败: ${code}`);
            });
          } else {
            const input = document.createElement('input');
            input.value = code;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            toast(`已复制占位符: ${code}`);
          }
        };
      });

      // 驱动动态占位符一键复制
      this.container.querySelectorAll('.datax-driver-badge').forEach(badge => {
        badge.onclick = (e) => {
          e.stopPropagation();
          const code = badge.getAttribute('data-code');
          if (!code) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(() => {
              toast(`已复制驱动占位符: ${code}`);
            }).catch(() => {
              toast(`复制失败: ${code}`);
            });
          } else {
            const input = document.createElement('input');
            input.value = code;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            toast(`已复制驱动占位符: ${code}`);
          }
        };
      });

      // 步骤 1.5 驱动源配置折叠/收起切换事件绑定
      const stepDriverHeader = this.container.querySelector('#datax-api-step-driver-header');
      const stepDriverBody = this.container.querySelector('#datax-api-step-driver-body');
      const stepDriverToggle = this.container.querySelector('#datax-api-step-driver-toggle');
      if (stepDriverHeader) {
        stepDriverHeader.onclick = () => this.toggleSectionCollapse(stepDriverBody, stepDriverToggle);
      }

      // 步骤 2.5 折叠/收起切换事件绑定
      const stepIncHeader = this.container.querySelector('#datax-api-step-inc-header');
      const stepIncBody = this.container.querySelector('#datax-api-step-inc-body');
      const stepIncToggle = this.container.querySelector('#datax-api-step-inc-toggle');
      if (stepIncHeader) {
        stepIncHeader.onclick = () => this.toggleSectionCollapse(stepIncBody, stepIncToggle);
      }

      // 增量字段快捷填入事件绑定
      this.container.querySelectorAll('.datax-inc-col-tag').forEach(tag => {
        tag.onclick = () => {
          const col = tag.getAttribute('data-col');
          const input = this.container.querySelector('#datax-api-form-inc-col');
          if (input && col) {
            input.value = col;
            toast(`已选择增量时间字段: ${col}`);
          }
        };
      });
    }

    /**
     * 切换增量参数配置输入区的显隐状态
     *
     * @param {boolean} isInc 是否为增量模式
     */
    toggleIncrementFields(isInc) {
      const timeGroup = this.container.querySelector('#datax-api-inc-time-group');
      const fmtGroup = this.container.querySelector('#datax-api-inc-fmt-group');
      const advGroup = this.container.querySelector('#datax-api-inc-advance-group');
      if (timeGroup) timeGroup.style.display = isInc ? 'block' : 'none';
      if (fmtGroup) fmtGroup.style.display = isInc ? 'block' : 'none';
      if (advGroup) advGroup.style.display = isInc ? 'block' : 'none';
    }

    /**
     * 切换配置步骤卡片的折叠与展开状态 (公共方法)
     *
     * @param {HTMLElement} bodyEl 卡片内容容器
     * @param {HTMLElement} toggleBtn 状态指示按钮
     */
    toggleSectionCollapse(bodyEl, toggleBtn) {
      if (!bodyEl || !toggleBtn) return;
      const isCollapsed = bodyEl.style.display === 'none';
      if (isCollapsed) {
        bodyEl.style.display = '';
        toggleBtn.textContent = '▲ 收起';
        toggleBtn.style.background = '#e6f7ff';
        toggleBtn.style.color = '#1890ff';
        toggleBtn.style.borderColor = '#91d5ff';
      } else {
        bodyEl.style.display = 'none';
        toggleBtn.textContent = '▼ 展开';
        toggleBtn.style.background = '#f0f2f5';
        toggleBtn.style.color = '#606266';
        toggleBtn.style.borderColor = '#dcdfe6';
      }
    }

    toggleAuthFields(authType) {
      const box = this.container.querySelector('#datax-api-auth-config-box');
      const bearerRow = this.container.querySelector('#datax-api-auth-bearer-row');
      const apiKeyRow = this.container.querySelector('#datax-api-auth-apikey-row');
      const basicRow = this.container.querySelector('#datax-api-auth-basic-row');
      const preScriptRow = this.container.querySelector('#datax-api-auth-prescript-row');

      bearerRow.style.display = 'none';
      apiKeyRow.style.display = 'none';
      basicRow.style.display = 'none';
      if (preScriptRow) preScriptRow.style.display = 'none';

      if (!authType || authType === 'NONE') {
        box.style.display = 'none';
        return;
      }

      box.style.display = 'block';
      if (authType === 'BEARER_TOKEN') {
        bearerRow.style.display = 'block';
      } else if (authType === 'API_KEY') {
        apiKeyRow.style.display = 'grid';
      } else if (authType === 'BASIC_AUTH') {
        basicRow.style.display = 'grid';
      } else if (authType === 'PRE_SCRIPT') {
        if (preScriptRow) preScriptRow.style.display = 'flex';
      }
    }

    loadDatasources() {
      fetch('/api/jobJdbcDatasource?current=1&size=200', {
        headers: getAuthHeaders()
      })
        .then(r => r.json())
        .then(res => {
          if (isApiSuccess(res)) {
            this.datasources = (res.data && res.data.records) || res.data || [];
            this.renderDatasourceOptions();
          }
        })
        .catch(e => console.error('加载数据源失败', e));
    }

    renderDatasourceOptions() {
      const sel = this.container.querySelector('#datax-api-form-target-ds');
      if (sel) {
        sel.innerHTML = '<option value="">-- 请选择目标数据源 --</option>' +
          this.datasources.map(d => `<option value="${d.id}">💾 ${safeEscapeHtml(d.datasourceName)} (${d.datasource || 'RDBMS'})</option>`).join('');
      }
      const driverSel = this.container.querySelector('#datax-api-form-driver-ds');
      if (driverSel) {
        driverSel.innerHTML = '<option value="">⚪ 无驱动源 (普通单接口模式)</option>' +
          this.datasources.map(d => `<option value="${d.id}">💾 ${safeEscapeHtml(d.datasourceName)} (${d.datasource || 'RDBMS'})</option>`).join('');
      }
    }

    /**
     * 将表信息集合转换为 SearchableSelect 格式 (对齐 Tab 5 风格，携带业务中文注解)
     *
     * @param {Array<Object|string>} tables 表元数据列表
     * @return {Array<Object>} 适配下拉候选项列表
     */
    mapTablesToSelectItems(tables) {
      if (!Array.isArray(tables)) return [];
      return tables.map(t => {
        const name = typeof t === 'string' ? t : (t.tableName || '');
        const comment = (typeof t === 'object' && t.tableComment) ? t.tableComment.trim() : '';
        return {
          value: name,
          label: name,
          subLabel: comment,
          title: comment ? `${name}\n注解: ${comment}` : name
        };
      });
    }

    /**
     * 安全获取当前目标表名 (优先从 SearchableSelect 读取，安全修剪空白)
     *
     * @return {string} 目标表名
     */
    getTargetTableValue() {
      if (this.targetTableSelect && typeof this.targetTableSelect.getValue === 'function') {
        return (this.targetTableSelect.getValue() || '').trim();
      }
      const el = this.container.querySelector('#datax-api-form-target-table');
      return (el ? el.value : '').trim();
    }

    /**
     * 安全设置目标表名 (联动同步 SearchableSelect 实例并触发元数据检测)
     *
     * @param {string} val 目标表名
     */
    setTargetTableValue(val) {
      const cleanVal = (val || '').trim();
      if (this.targetTableSelect && typeof this.targetTableSelect.setValue === 'function') {
        this.targetTableSelect.setValue(cleanVal, cleanVal);
      }
      const el = this.container.querySelector('#datax-api-form-target-table');
      if (el) {
        el.value = cleanVal;
      }
      this.handleTargetTableInputChange();
    }

    async loadTargetTables(datasourceId, initialSelectedTable = null) {
      const tip = this.container.querySelector('#datax-api-target-table-status-tip');

      if (!datasourceId) {
        this.currentDatasourceTables = [];
        if (this.targetTableSelect) {
          this.targetTableSelect.setItems([]);
          this.targetTableSelect.setBadge('0 张表');
          if (this.targetTableSelect.inputEl) {
            this.targetTableSelect.inputEl.placeholder = '-- 请先选择目标数据源 --';
          }
        }
        if (tip) tip.innerHTML = '';
        return;
      }

      if (this.targetTableSelect) {
        this.targetTableSelect.setBadge('获取中...');
      }

      try {
        let tables = [];
        // 1. 优先调用带注释的高级表信息接口 (与 Tab 5 一致)
        try {
          const r1 = await fetch(`/api/tableData/tables?datasourceId=${datasourceId}`, {
            headers: getAuthHeaders()
          });
          const res1 = await r1.json();
          if (isApiSuccess(res1) && Array.isArray(res1.data) && res1.data.length > 0) {
            tables = res1.data;
          }
        } catch (ignored) {}

        // 2. 若高级接口未获取到，降级调用基础元数据接口兜底
        if (!tables || tables.length === 0) {
          const r2 = await fetch(`/api/metadata/getTables?datasourceId=${datasourceId}`, {
            headers: getAuthHeaders()
          });
          const res2 = await r2.json();
          if (isApiSuccess(res2) && Array.isArray(res2.data)) {
            tables = res2.data;
          }
        }

        this.currentDatasourceTables = tables || [];
        const tableItems = this.mapTablesToSelectItems(this.currentDatasourceTables);

        if (this.targetTableSelect) {
          this.targetTableSelect.setItems(tableItems);
          this.targetTableSelect.setBadge(tableItems.length > 0 ? `${tableItems.length} 张表` : '0 张表');
          if (this.targetTableSelect.inputEl) {
            this.targetTableSelect.inputEl.placeholder = tableItems.length > 0
              ? '搜索表名或业务中文注解 (支持输入新表名)...'
              : '该数据源下暂无表，支持直接手动输入新表名';
          }
        }

        const targetVal = initialSelectedTable !== null ? initialSelectedTable : this.getTargetTableValue();
        if (targetVal) {
          this.setTargetTableValue(targetVal);
        } else {
          this.handleTargetTableInputChange();
        }
      } catch (err) {
        console.error('加载目标表失败', err);
        if (this.targetTableSelect) {
          this.targetTableSelect.setItems([]);
          this.targetTableSelect.setBadge('加载失败');
        }
      }
    }

    /**
     * 目标表名输入/切换时，实时检测表是否存在，新表自动开启「自动推导建表」
     */
    handleTargetTableInputChange(isBlur = false) {
      const tip = this.container.querySelector('#datax-api-target-table-status-tip');
      const autoCreateCheckbox = this.container.querySelector('#datax-api-form-auto-create');

      const tableName = this.getTargetTableValue();
      if (!tableName) {
        if (tip) tip.innerHTML = '';
        this.currentTargetColumns = [];
        this._lastLoadedTargetTable = null;
        this.refreshMappingRowBadges();
        return;
      }

      const existingTables = (this.currentDatasourceTables || []).map(t => {
        return typeof t === 'string' ? t.toLowerCase() : (t.tableName || '').toLowerCase();
      });

      const isExisting = existingTables.includes(tableName.toLowerCase());

      if (isExisting) {
        if (tip) {
          tip.innerHTML = `<span style="color: #52c41a; font-weight: bold;">✅ 已存在物理表</span> <span style="color: #8c8c8c;">(已加载真实列元数据)</span>`;
        }
        if (autoCreateCheckbox) {
          autoCreateCheckbox.checked = false;
        }
        // 仅当表名变动时重新加载列元数据，避免高频打字造成网络冗余请求
        if (this._lastLoadedTargetTable !== tableName) {
          this._lastLoadedTargetTable = tableName;
          this.loadTargetTableColumns(tableName);
        }
      } else {
        this._lastLoadedTargetTable = null;
        // 新表：自动勾选推导建表，免去冲突与多余手动配置
        if (autoCreateCheckbox) {
          autoCreateCheckbox.checked = true;
        }
        if (tip) {
          tip.innerHTML = `<span style="color: #1890ff; font-weight: bold;">✨ 新目标表（不存在）</span> <span style="color: #8c8c8c;">已自动开启「自动推导建表」</span>`;
        }
        this.currentTargetColumns = [];
        const tipEl = this.container.querySelector('#datax-api-map-stat-tip');
        if (tipEl) {
          tipEl.textContent = `(新表 [${safeEscapeHtml(tableName)}]，任务首次执行将自动推导建表，字段映射将作为建表列定义)`;
          tipEl.style.color = '#1890ff';
        }
        this.refreshMappingRowBadges();
      }
    }

    loadTaskList() {
      const listBox = this.container.querySelector('#datax-api-task-list-box');
      listBox.innerHTML = '<div style="text-align: center; color: #909399; padding: 40px;">⏳ 正在加载接口数据采集任务...</div>';

      const taskName = this.container.querySelector('#datax-api-search-name').value.trim();
      const status = this.container.querySelector('#datax-api-search-status').value;

      let url = `/api/apiTask/pageList?pageNo=${this.currentPage}&pageSize=${this.pageSize}`;
      if (taskName) url += `&taskName=${encodeURIComponent(taskName)}`;
      if (status !== '') url += `&status=${status}`;

      fetch(url, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(res => {
          if (!isApiSuccess(res)) {
            listBox.innerHTML = `<div style="text-align: center; color: #f5222d; padding: 30px;">❌ 加载失败: ${safeEscapeHtml(getApiMsg(res))}</div>`;
            return;
          }
          const pageData = res.data || {};
          this.currentTasks = pageData.records || [];
          this.total = pageData.total || 0;
          this.renderTable();
          this.renderPagination();
        })
        .catch(err => {
          listBox.innerHTML = `<div style="text-align: center; color: #f5222d; padding: 30px;">网络错误: ${safeEscapeHtml(err.message)}</div>`;
        });
    }

    renderTable() {
      const listBox = this.container.querySelector('#datax-api-task-list-box');
      if (this.currentTasks.length === 0) {
        listBox.innerHTML = '<div style="text-align: center; color: #909399; padding: 40px;">📭 暂无接口采集任务，点击右上角【➕ 新建接口采集任务】立即创建</div>';
        return;
      }

      let html = `
        <div style="width: 100%; overflow-x: auto;">
          <table style="min-width: 980px; width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead>
              <tr style="background: #f5f7fa; border-bottom: 1px solid #ebeef5; color: #606266; font-weight: bold; white-space: nowrap;">
                <th style="padding: 8px 6px; width: 45px; text-align: center;">ID</th>
                <th style="padding: 8px 6px; min-width: 130px;">任务名称</th>
                <th style="padding: 8px 6px; width: 70px; text-align: center;">请求方式</th>
                <th style="padding: 8px 6px; min-width: 160px; max-width: 220px;">请求 URL</th>
                <th style="padding: 8px 6px; width: 140px;">目标输出库表</th>
                <th style="padding: 8px 6px; width: 95px;">Cron</th>
                <th style="padding: 8px 6px; width: 85px; min-width: 85px; text-align: center; white-space: nowrap;">调度状态</th>
                <th style="padding: 8px 6px; width: 180px; min-width: 170px;">最近执行快照</th>
                <th style="padding: 8px 6px; width: 220px; min-width: 210px; text-align: center; white-space: nowrap;">操作</th>
              </tr>
            </thead>
            <tbody>
      `;

      this.currentTasks.forEach(task => {
        const isRunning = (task.status === 1);
        const isDraft = (task.status === 2);
        let statusBadge = '';
        if (isRunning) {
          statusBadge = `<span style="display: inline-block; white-space: nowrap; color: #52c41a; font-weight: bold; background: #f6ffed; border: 1px solid #b7eb8f; padding: 2px 7px; border-radius: 4px; font-size: 11px; line-height: 1.3; cursor: pointer;" title="点击停止调度" data-action="toggle-status" data-id="${task.id}" data-status="1">🟢 运行中</span>`;
        } else if (isDraft) {
          statusBadge = `<span style="display: inline-block; white-space: nowrap; color: #d48806; font-weight: bold; background: #fffbe6; border: 1px solid #ffe58f; padding: 2px 7px; border-radius: 4px; font-size: 11px; line-height: 1.3;" title="草稿暂存中，尚未正式保存">📝 暂存草稿</span>`;
        } else {
          statusBadge = `<span style="display: inline-block; white-space: nowrap; color: #8c8c8c; background: #fafafa; border: 1px solid #d9d9d9; padding: 2px 7px; border-radius: 4px; font-size: 11px; line-height: 1.3; cursor: pointer;" title="点击启动调度" data-action="toggle-status" data-id="${task.id}" data-status="0">⚪ 已停止</span>`;
        }

        let runBadge = '<span style="color: #8c8c8c; background: #fafafa; border: 1px solid #d9d9d9; padding: 1px 5px; border-radius: 3px; font-size: 10px; display: inline-block; white-space: nowrap;">⚪ 未运行</span>';
        if (task.lastRunStatus === 1) {
          runBadge = `<span style="color: #52c41a; font-weight: bold; background: #f6ffed; border: 1px solid #b7eb8f; padding: 1px 5px; border-radius: 3px; font-size: 10px; display: inline-block; white-space: nowrap;">🟢 成功</span>`;
        } else if (task.lastRunStatus === 2) {
          runBadge = `<span style="color: #f5222d; font-weight: bold; background: #fff1f0; border: 1px solid #ffa39e; padding: 1px 5px; border-radius: 3px; font-size: 10px; display: inline-block; white-space: nowrap;">🔴 失败</span>`;
        }

        const runTime = task.lastRunTime ? task.lastRunTime.replace('T', ' ').substring(0, 19) : '-';

        let runMsgHtml = '<div style="color: #bfbfbf; font-size: 10px; margin-top: 2px;">无执行日志</div>';
        if (task.lastRunMsg) {
          const fullMsg = String(task.lastRunMsg);
          const shortMsg = fullMsg.length > 25 ? fullMsg.substring(0, 22) + '...' : fullMsg;
          runMsgHtml = `
            <div class="datax-cell-long-text datax-api-msg-trigger" data-content="${encodeURIComponent(fullMsg)}" data-title="任务 [${safeEscapeHtml(task.taskName)}] 执行快照详情" style="color: #1890ff; font-size: 11px; cursor: pointer; text-decoration: underline; max-width: 175px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;" title="点击查看完整快照信息及日志堆栈 (支持一键复制)">
              🔍 ${safeEscapeHtml(shortMsg)}
            </div>
          `;
        }

        const urlFull = task.requestUrl || '';
        const shortUrl = urlFull.length > 30 ? urlFull.substring(0, 27) + '...' : urlFull;
        const urlHtml = `
          <div class="datax-cell-long-text datax-api-url-trigger" data-content="${encodeURIComponent(urlFull)}" data-title="任务 [${safeEscapeHtml(task.taskName)}] 请求 URL 详情" style="font-size: 12px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; color: #1890ff; text-decoration: underline;" title="点击查看完整请求 URL (支持复制)">
            ${safeEscapeHtml(shortUrl)}
          </div>
        `;

        html += `
          <tr style="border-bottom: 1px solid #ebeef5; transition: background 0.15s ease;" class="datax-api-table-row">
            <td style="padding: 8px 6px; text-align: center; color: #909399;">${task.id}</td>
            <td style="padding: 8px 6px; font-weight: bold; color: #1890ff;">
              <div>${safeEscapeHtml(task.taskName)}</div>
              ${task.driverDatasourceId > 0 ? `<div style="font-size: 10px; color: #52c41a; margin-top: 2px; font-weight: normal;">💡 驱动: ${safeEscapeHtml(task.driverDatasourceName || 'DS #' + task.driverDatasourceId)} (${task.driverParamMode || 'ROW'})</div>` : ''}
            </td>
            <td style="padding: 8px 6px; text-align: center;">
              <span style="font-size: 10px; font-weight: bold; padding: 1px 4px; border-radius: 2px; ${task.requestMethod === 'POST' ? 'background:#e6f7ff;color:#1890ff;' : 'background:#f6ffed;color:#52c41a;'}">${task.requestMethod || 'GET'}</span>
            </td>
            <td style="padding: 8px 6px;" data-cell-type="url">${urlHtml}</td>
            <td style="padding: 8px 6px;">
              <div style="font-weight: 500;">${safeEscapeHtml(task.targetTableName || '-')}</div>
              <div style="font-size: 10px; color: #909399;">${safeEscapeHtml(task.targetDatasourceName || 'DS #' + task.targetDatasourceId)}</div>
            </td>
            <td style="padding: 8px 6px; font-size: 12px;">
              <div>${safeEscapeHtml(task.cronExpression || '-')}</div>
              ${task.incrementType === 1
                ? `<div style="font-size: 11px; color: #1890ff; margin-top: 2px; white-space: nowrap;" title="增量策略: ${task.incStrategy === 1 ? '物理时间' : '业务最大时间 (字段: ' + (task.incTimeColumn || '未设') + ')'}&#10;下次增量时间: ${task.incStartTime ? String(task.incStartTime).replace('T', ' ') : '-'}">⏱️增量: ${task.incStartTime ? String(task.incStartTime).replace('T', ' ').substring(5, 16) : '未设'}${task.incTimeColumn ? ' (' + safeEscapeHtml(task.incTimeColumn) + ')' : ''}</div>`
                : `<div style="font-size: 11px; color: #8c8c8c; margin-top: 2px; white-space: nowrap;">⚪全量同步</div>`
              }
            </td>
            <td style="padding: 8px 6px; text-align: center; white-space: nowrap;">${statusBadge}</td>
            <td style="padding: 8px 6px; font-size: 12px; cursor: pointer;" data-cell-type="snapshot" class="datax-api-cell-last-run" data-id="${task.id}" title="点击查看历史执行记录">
              <div style="display: flex; align-items: center; white-space: nowrap;">${runBadge} <span style="color:#8c8c8c; font-size: 11px; margin-left: 4px;">${runTime}</span></div>
              ${runMsgHtml}
            </td>
            <td style="padding: 8px 6px; text-align: center; white-space: nowrap;">
              <button class="datax-api-action-btn" data-action="run-once" data-id="${task.id}" style="background: #1890ff; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; font-size: 10px; cursor: pointer; margin-right: 3px;" title="立即正式执行一次并入库">🚀 执行</button>
              <button class="datax-api-action-btn" data-action="history" data-id="${task.id}" style="background: #722ed1; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-right: 3px;" title="查看执行历史记录">历史</button>
              <button class="datax-api-action-btn" data-action="toggle-status" data-id="${task.id}" data-status="${task.status}" data-is-draft="${isDraft}" style="background: ${isRunning ? '#faad14' : (isDraft ? '#e8e8e8' : '#52c41a')}; color: ${isDraft ? '#8c8c8c' : '#fff'}; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-right: 3px;" title="${isRunning ? '暂停调度' : (isDraft ? '草稿尚未正式保存，无法启动调度' : '开启调度')}">${isRunning ? '停止' : '启动'}</button>
              <button class="datax-api-action-btn" data-action="edit" data-id="${task.id}" style="background: #f0f2f5; color: #303133; border: 1px solid #dcdfe6; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-right: 3px;" title="编辑任务配置">✏️ 编辑</button>
              <button class="datax-api-action-btn" data-action="delete" data-id="${task.id}" style="background: #ff4d4f; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px;" title="删除此任务">🗑️ 删除</button>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table></div>';
      listBox.innerHTML = html;

      // 绑定表格操作按钮
      listBox.querySelectorAll('button[data-action="run-once"]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.handleRunOnce(btn.getAttribute('data-id'), btn);
        };
      });
      listBox.querySelectorAll('button[data-action="history"]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const task = this.currentTasks.find(t => String(t.id) === String(id));
          if (task) {
            openApiTaskLogModal(task);
          }
        };
      });
      listBox.querySelectorAll('.datax-api-cell-last-run').forEach(cell => {
        cell.onclick = (e) => {
          if (e.target.closest('.datax-api-msg-trigger')) {
            return;
          }
          const id = cell.getAttribute('data-id');
          const task = this.currentTasks.find(t => String(t.id) === String(id));
          if (task) {
            openApiTaskLogModal(task);
          }
        };
      });
      listBox.querySelectorAll('button[data-action="edit"]').forEach(btn => {
        btn.onclick = () => this.handleEdit(btn.getAttribute('data-id'));
      });
      listBox.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.onclick = () => this.handleDelete(btn.getAttribute('data-id'));
      });
      listBox.querySelectorAll('[data-action="toggle-status"]').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const isDraft = el.getAttribute('data-is-draft') === 'true' || el.getAttribute('data-status') === '2';
          this.handleToggleStatus(el.getAttribute('data-id'), el.getAttribute('data-status') === '1', isDraft);
        };
      });

      // 绑定超长文本/执行快照点击弹窗预览事件 (对齐 Tab5 风格)
      listBox.querySelectorAll('.datax-api-msg-trigger, .datax-api-url-trigger').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const title = el.getAttribute('data-title') || '详情预览';
          const content = decodeURIComponent(el.getAttribute('data-content') || '');
          showDetailModal(title, content);
        };
      });

      // 绑定单元格双击快捷预览
      listBox.querySelectorAll('td[data-cell-type="snapshot"]').forEach(td => {
        td.ondblclick = (e) => {
          e.stopPropagation();
          const trigger = td.querySelector('.datax-api-msg-trigger');
          if (trigger) {
            const title = trigger.getAttribute('data-title') || '执行快照详情';
            const content = decodeURIComponent(trigger.getAttribute('data-content') || '');
            showDetailModal(title, content);
          }
        };
      });
      listBox.querySelectorAll('td[data-cell-type="url"]').forEach(td => {
        td.ondblclick = (e) => {
          e.stopPropagation();
          const trigger = td.querySelector('.datax-api-url-trigger');
          if (trigger) {
            const title = trigger.getAttribute('data-title') || '请求 URL 详情';
            const content = decodeURIComponent(trigger.getAttribute('data-content') || '');
            showDetailModal(title, content);
          }
        };
      });
    }

    renderPagination() {
      const bar = this.container.querySelector('#datax-api-pagination-bar');
      const totalPages = Math.ceil(this.total / this.pageSize) || 1;

      bar.innerHTML = `
        <div>共 <strong>${this.total}</strong> 条采集任务，当前第 <strong>${this.currentPage} / ${totalPages}</strong> 页</div>
        <div style="display: flex; gap: 4px;">
          <button id="datax-api-pg-prev" ${this.currentPage <= 1 ? 'disabled' : ''} style="padding: 2px 8px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">上一页</button>
          <button id="datax-api-pg-next" ${this.currentPage >= totalPages ? 'disabled' : ''} style="padding: 2px 8px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">下一页</button>
        </div>
      `;

      bar.querySelector('#datax-api-pg-prev').onclick = () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadTaskList();
        }
      };
      bar.querySelector('#datax-api-pg-next').onclick = () => {
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.loadTaskList();
        }
      };
    }

    openEditor(task = null) {
      const panel = this.container.querySelector('#datax-api-editor-panel');
      panel.style.display = 'block';
      const isDraft = task && task.status === 2;
      this.container.querySelector('#datax-api-editor-title').textContent = task
        ? (isDraft ? `✏️ 编辑暂存草稿 [ID: ${task.id}]` : `✏️ 编辑接口采集任务 [ID: ${task.id}]`)
        : '新建接口数据采集与落库任务';

      this.container.querySelector('#datax-api-form-id').value = task ? task.id : '';
      this.container.querySelector('#datax-api-form-name').value = task ? task.taskName : '';
      this.container.querySelector('#datax-api-form-method').value = task ? (task.requestMethod || 'GET') : 'GET';
      this.container.querySelector('#datax-api-form-url').value = task ? task.requestUrl : '';
      this.container.querySelector('#datax-api-form-headers').value = task ? (task.requestHeaders || '') : '';
      this.container.querySelector('#datax-api-form-params').value = task ? (task.requestParams || '') : '';
      this.container.querySelector('#datax-api-form-body-type').value = task ? (task.requestBodyType || 'none') : 'none';
      this.container.querySelector('#datax-api-form-body').value = task ? (task.requestBody || '') : '';

      // 驱动源配置
      const driverDsEl = this.container.querySelector('#datax-api-form-driver-ds');
      if (driverDsEl) driverDsEl.value = (task && task.driverDatasourceId) ? task.driverDatasourceId : '';
      const driverSqlEl = this.container.querySelector('#datax-api-form-driver-sql');
      if (driverSqlEl) driverSqlEl.value = task ? (task.driverSql || '') : '';
      const driverModeEl = this.container.querySelector('#datax-api-form-driver-mode');
      if (driverModeEl) driverModeEl.value = task ? (task.driverParamMode || 'ROW') : 'ROW';
      const driverBatchEl = this.container.querySelector('#datax-api-form-driver-batch-size');
      if (driverBatchEl) driverBatchEl.value = (task && task.driverBatchSize) ? task.driverBatchSize : 1;
      const driverDelayEl = this.container.querySelector('#datax-api-form-driver-delay');
      if (driverDelayEl) driverDelayEl.value = (task && task.driverDelayMs !== undefined && task.driverDelayMs !== null) ? task.driverDelayMs : 0;

      // Auth
      const authType = task ? (task.authType || 'NONE') : 'NONE';
      this.container.querySelector('#datax-api-form-auth-type').value = authType;
      this.toggleAuthFields(authType);
      if (task && task.authConfig) {
        try {
          const authCfg = JSON.parse(task.authConfig);
          if (authType === 'BEARER_TOKEN') {
            this.container.querySelector('#datax-api-auth-bearer-token').value = authCfg.token || '';
          } else if (authType === 'API_KEY') {
            this.container.querySelector('#datax-api-auth-key-name').value = authCfg.key || '';
            this.container.querySelector('#datax-api-auth-key-val').value = authCfg.value || '';
            this.container.querySelector('#datax-api-auth-key-pos').value = authCfg.position || 'header';
          } else if (authType === 'BASIC_AUTH') {
            this.container.querySelector('#datax-api-auth-basic-user').value = authCfg.username || '';
            this.container.querySelector('#datax-api-auth-basic-pass').value = authCfg.password || '';
          } else if (authType === 'PRE_SCRIPT') {
            const scriptInput = this.container.querySelector('#datax-api-auth-prescript-code');
            if (scriptInput) scriptInput.value = authCfg.script || '';
          }
        } catch (e) {
          console.warn('解析 authConfig 失败', e);
        }
      } else if (!task) {
        const scriptInput = this.container.querySelector('#datax-api-auth-prescript-code');
        if (scriptInput) scriptInput.value = '';
      }

      // 分页
      this.container.querySelector('#datax-api-form-page-strat').value = task ? (task.pageStrategy || 'NONE') : 'NONE';
      this.container.querySelector('#datax-api-form-page-param').value = task ? (task.pageParamName || 'pageNum') : 'pageNum';
      this.container.querySelector('#datax-api-form-size-param').value = task ? (task.sizeParamName || 'pageSize') : 'pageSize';
      this.container.querySelector('#datax-api-form-page-start').value = task ? (task.pageStartIndex || 1) : 1;
      this.container.querySelector('#datax-api-form-page-size').value = task ? (task.pageSize || 100) : 100;
      this.container.querySelector('#datax-api-form-max-pages').value = task ? (task.maxPageLimit || 500) : 500;

      // 提取路径
      this.container.querySelector('#datax-api-form-data-path').value = task ? (task.dataExtractPath || '$.data') : '$.data';
      this.container.querySelector('#datax-api-form-cursor-path').value = task ? (task.cursorExtractPath || '') : '';
      this.container.querySelector('#datax-api-form-code-path').value = task ? (task.responseSuccessPath || '$.code') : '$.code';
      this.container.querySelector('#datax-api-form-code-val').value = task ? (task.responseSuccessValue || '200') : '200';

      // 目标库表
      const targetDsId = task ? task.targetDatasourceId : '';
      const targetTable = task ? (task.targetTableName || '') : '';
      this.container.querySelector('#datax-api-form-target-ds').value = targetDsId || '';
      if (targetDsId) {
        this.loadTargetTables(targetDsId, targetTable);
      } else {
        this.loadTargetTables(null);
        this.setTargetTableValue(targetTable);
      }
      this.container.querySelector('#datax-api-form-write-mode').value = task ? (task.writeMode || 'APPEND') : 'APPEND';
      this.container.querySelector('#datax-api-form-auto-create').checked = task ? (task.autoCreateTable === 1) : false;

      // 调度
      this.container.querySelector('#datax-api-form-cron').value = task ? (task.cronExpression || '0 0 2 * * ?') : '0 0 2 * * ?';
      this.container.querySelector('#datax-api-form-batch-size').value = task ? (task.batchSize || 1000) : 1000;
      this.container.querySelector('#datax-api-form-delay').value = task ? (task.requestDelayMs || 0) : 0;
      this.container.querySelector('#datax-api-form-timeout').value = task ? (task.timeoutSeconds || 60) : 60;

      // 增量配置
      const incType = (task && task.incrementType !== undefined && task.incrementType !== null) ? String(task.incrementType) : '0';
      this.container.querySelector('#datax-api-form-inc-type').value = incType;
      let incStartStr = '';
      if (task && task.incStartTime) {
        incStartStr = String(task.incStartTime).replace('T', ' ').substring(0, 19);
      }
      this.container.querySelector('#datax-api-form-inc-start-time').value = incStartStr;
      this.container.querySelector('#datax-api-form-inc-time-fmt').value = (task && task.incTimeFormat) ? task.incTimeFormat : 'yyyy-MM-dd HH:mm:ss';
      this.container.querySelector('#datax-api-form-inc-strategy').value = (task && task.incStrategy !== undefined && task.incStrategy !== null) ? String(task.incStrategy) : '0';
      this.container.querySelector('#datax-api-form-inc-col').value = (task && task.incTimeColumn) ? task.incTimeColumn : '';
      this.toggleIncrementFields(incType === '1');

      // 字段映射表格
      this.renderMappingRows(task ? task.columnMappingJson : null);
      this.container.querySelector('#datax-api-test-run-result').style.display = 'none';

      const s1Body = this.container.querySelector('#datax-api-step1-body');
      const s1Toggle = this.container.querySelector('#datax-api-step1-toggle');
      if (s1Body && s1Toggle) {
        s1Body.style.display = '';
        s1Toggle.textContent = '▲ 收起';
        s1Toggle.style.background = '#e6f7ff';
        s1Toggle.style.color = '#1890ff';
        s1Toggle.style.borderColor = '#91d5ff';
      }
      const sDriverBody = this.container.querySelector('#datax-api-step-driver-body');
      const sDriverToggle = this.container.querySelector('#datax-api-step-driver-toggle');
      if (sDriverBody && sDriverToggle) {
        sDriverBody.style.display = '';
        sDriverToggle.textContent = '▲ 收起';
        sDriverToggle.style.background = '#e6f7ff';
        sDriverToggle.style.color = '#1890ff';
        sDriverToggle.style.borderColor = '#91d5ff';
      }
      const s2Body = this.container.querySelector('#datax-api-step2-body');
      const s2Toggle = this.container.querySelector('#datax-api-step2-toggle');
      if (s2Body && s2Toggle) {
        s2Body.style.display = '';
        s2Toggle.textContent = '▲ 收起';
        s2Toggle.style.background = '#e6f7ff';
        s2Toggle.style.color = '#1890ff';
        s2Toggle.style.borderColor = '#91d5ff';
      }
      const sIncBody = this.container.querySelector('#datax-api-step-inc-body');
      const sIncToggle = this.container.querySelector('#datax-api-step-inc-toggle');
      if (sIncBody && sIncToggle) {
        sIncBody.style.display = '';
        sIncToggle.textContent = '▲ 收起';
        sIncToggle.style.background = '#e6f7ff';
        sIncToggle.style.color = '#1890ff';
        sIncToggle.style.borderColor = '#91d5ff';
      }

      panel.scrollIntoView({ behavior: 'smooth' });
    }

    closeEditor() {
      const panel = this.container.querySelector('#datax-api-editor-panel');
      panel.style.display = 'none';
    }

    loadLocalJobDemo() {
      const origin = window.location.origin || 'http://127.0.0.1:18080';
      const token = (window.DataXCommon && window.DataXCommon.Http && window.DataXCommon.Http.getAuthToken)
        ? window.DataXCommon.Http.getAuthToken()
        : '';

      this.container.querySelector('#datax-api-form-name').value = 'Demo-定时采集本地DataX任务管理列表';
      this.container.querySelector('#datax-api-form-method').value = 'GET';
      this.container.querySelector('#datax-api-form-url').value = `${origin}/api/job/pageList`;

      // 增量配置默认为全量
      this.container.querySelector('#datax-api-form-inc-type').value = '0';
      this.container.querySelector('#datax-api-form-inc-start-time').value = '';
      this.container.querySelector('#datax-api-form-inc-time-fmt').value = 'yyyy-MM-dd HH:mm:ss';
      this.toggleIncrementFields(false);

      // 请求头与参数 (仅保留纯业务过滤参数，分页参数由下方分页策略自动动态注入)
      this.container.querySelector('#datax-api-form-headers').value = JSON.stringify({
        "Content-Type": "application/json"
      }, null, 2);
      this.container.querySelector('#datax-api-form-params').value = JSON.stringify({
        "jobGroup": 0,
        "triggerStatus": -1,
        "updateTime": "${incStartTime}"
      }, null, 2);

      // 认证：自动将当前登录的 Token 带入
      if (token) {
        this.container.querySelector('#datax-api-form-auth-type').value = 'BEARER_TOKEN';
        this.toggleAuthFields('BEARER_TOKEN');
        this.container.querySelector('#datax-api-auth-bearer-token').value = token;
      } else {
        this.container.querySelector('#datax-api-form-auth-type').value = 'NONE';
        this.toggleAuthFields('NONE');
      }

      // 分页配置
      this.container.querySelector('#datax-api-form-page-strat').value = 'PAGE_NUM';
      this.container.querySelector('#datax-api-form-page-param').value = 'current';
      this.container.querySelector('#datax-api-form-size-param').value = 'size';
      this.container.querySelector('#datax-api-form-page-start').value = 1;
      this.container.querySelector('#datax-api-form-page-size').value = 10;
      this.container.querySelector('#datax-api-form-max-pages').value = 20;

      // 响应解析提取配置
      this.container.querySelector('#datax-api-form-code-path').value = '$.code';
      this.container.querySelector('#datax-api-form-code-val').value = '200';
      this.container.querySelector('#datax-api-form-data-path').value = '$.content.data';

      // 目标表配置
      this.setTargetTableValue('ods_datax_job_info');
      this.container.querySelector('#datax-api-form-auto-create').checked = false;
      this.container.querySelector('#datax-api-form-write-mode').value = 'APPEND';

      // 自动生成全部 37 个字段的映射关系
      const fullDemoMappings = [
        { sourceCol: 'id', targetCol: 'id', dataType: 'BIGINT' },
        { sourceCol: 'jobGroup', targetCol: 'job_group', dataType: 'INT' },
        { sourceCol: 'jobCron', targetCol: 'job_cron', dataType: 'VARCHAR' },
        { sourceCol: 'jobDesc', targetCol: 'job_desc', dataType: 'VARCHAR' },
        { sourceCol: 'projectId', targetCol: 'project_id', dataType: 'INT' },
        { sourceCol: 'projectName', targetCol: 'project_name', dataType: 'VARCHAR' },
        { sourceCol: 'userId', targetCol: 'user_id', dataType: 'INT' },
        { sourceCol: 'userName', targetCol: 'user_name', dataType: 'VARCHAR' },
        { sourceCol: 'executorHandler', targetCol: 'executor_handler', dataType: 'VARCHAR' },
        { sourceCol: 'executorParam', targetCol: 'executor_param', dataType: 'VARCHAR' },
        { sourceCol: 'executorRouteStrategy', targetCol: 'executor_route_strategy', dataType: 'VARCHAR' },
        { sourceCol: 'executorBlockStrategy', targetCol: 'executor_block_strategy', dataType: 'VARCHAR' },
        { sourceCol: 'executorTimeout', targetCol: 'executor_timeout', dataType: 'INT' },
        { sourceCol: 'executorFailRetryCount', targetCol: 'executor_fail_retry_count', dataType: 'INT' },
        { sourceCol: 'glueType', targetCol: 'glue_type', dataType: 'VARCHAR' },
        { sourceCol: 'glueSource', targetCol: 'glue_source', dataType: 'MEDIUMTEXT' },
        { sourceCol: 'glueRemark', targetCol: 'glue_remark', dataType: 'VARCHAR' },
        { sourceCol: 'glueUpdatetime', targetCol: 'glue_updatetime', dataType: 'DATETIME' },
        { sourceCol: 'childJobId', targetCol: 'child_job_id', dataType: 'VARCHAR' },
        { sourceCol: 'triggerStatus', targetCol: 'trigger_status', dataType: 'INT' },
        { sourceCol: 'triggerLastTime', targetCol: 'trigger_last_time', dataType: 'BIGINT' },
        { sourceCol: 'triggerNextTime', targetCol: 'trigger_next_time', dataType: 'BIGINT' },
        { sourceCol: 'jobJson', targetCol: 'job_json', dataType: 'LONGTEXT' },
        { sourceCol: 'replaceParam', targetCol: 'replace_param', dataType: 'VARCHAR' },
        { sourceCol: 'replaceParamType', targetCol: 'replace_param_type', dataType: 'VARCHAR' },
        { sourceCol: 'jvmParam', targetCol: 'jvm_param', dataType: 'VARCHAR' },
        { sourceCol: 'incStartTime', targetCol: 'inc_start_time', dataType: 'DATETIME' },
        { sourceCol: 'incStartId', targetCol: 'inc_start_id', dataType: 'BIGINT' },
        { sourceCol: 'incrementType', targetCol: 'increment_type', dataType: 'INT' },
        { sourceCol: 'datasourceId', targetCol: 'datasource_id', dataType: 'INT' },
        { sourceCol: 'readerTable', targetCol: 'reader_table', dataType: 'VARCHAR' },
        { sourceCol: 'primaryKey', targetCol: 'primary_key', dataType: 'VARCHAR' },
        { sourceCol: 'partitionInfo', targetCol: 'partition_info', dataType: 'VARCHAR' },
        { sourceCol: 'lastHandleCode', targetCol: 'last_handle_code', dataType: 'INT' },
        { sourceCol: 'alarmEmail', targetCol: 'alarm_email', dataType: 'VARCHAR' },
        { sourceCol: 'addTime', targetCol: 'add_time', dataType: 'DATETIME' },
        { sourceCol: 'updateTime', targetCol: 'update_time', dataType: 'DATETIME' }
      ];
      this.currentSampleFields = fullDemoMappings.map(m => m.sourceCol);
      this.renderMappingRows(fullDemoMappings);

      // 调度配置
      this.container.querySelector('#datax-api-form-cron').value = '0 0/10 * * * ?';

      toast('已自动填充本地任务管理接口 Demo 配置！可直接点击「在线调试与采样」进行验证');
    }

    handleTestRun() {
      const url = this.container.querySelector('#datax-api-form-url').value.trim();
      if (!url) {
        alert('请先输入请求 URL！');
        return;
      }

      const method = this.container.querySelector('#datax-api-form-method').value;
      const headers = this.container.querySelector('#datax-api-form-headers').value.trim();
      const params = this.container.querySelector('#datax-api-form-params').value.trim();
      const bodyType = this.container.querySelector('#datax-api-form-body-type').value;
      const body = this.container.querySelector('#datax-api-form-body').value.trim();
      const dataExtractPath = this.container.querySelector('#datax-api-form-data-path').value.trim() || '$.data';
      const codePath = this.container.querySelector('#datax-api-form-code-path').value.trim();
      const codeVal = this.container.querySelector('#datax-api-form-code-val').value.trim();

      const authType = this.container.querySelector('#datax-api-form-auth-type').value;
      const authConfig = this.buildAuthConfigObject(authType);

      if (authType === 'PRE_SCRIPT' && !authConfig.script) {
        alert('采用自定义前置脚本 (PRE_SCRIPT) 认证时，脚本内容不能为空！');
        return;
      }

      const incTypeVal = parseInt(this.container.querySelector('#datax-api-form-inc-type').value, 10) || 0;
      const incStartTimeVal = normalizeDateTimeString(this.container.querySelector('#datax-api-form-inc-start-time').value);
      const incTimeFmtVal = this.container.querySelector('#datax-api-form-inc-time-fmt').value.trim() || 'yyyy-MM-dd HH:mm:ss';

      const pageStratVal = this.container.querySelector('#datax-api-form-page-strat').value;
      const pageParamVal = this.container.querySelector('#datax-api-form-page-param').value.trim();
      const sizeParamVal = this.container.querySelector('#datax-api-form-size-param').value.trim();
      const pageStartVal = parseInt(this.container.querySelector('#datax-api-form-page-start').value, 10) || 1;
      const pageSizeVal = parseInt(this.container.querySelector('#datax-api-form-page-size').value, 10) || 10;

      const runBtn = this.container.querySelector('#datax-api-btn-test-run');
      const resultBox = this.container.querySelector('#datax-api-test-run-result');

      runBtn.disabled = true;
      runBtn.textContent = '⏳ 请求中...';
      resultBox.style.display = 'block';
      resultBox.innerHTML = '<div style="color: #1890ff; padding: 10px;">🚀 正在向目标接口发送调试请求...</div>';

      const driverDsVal = parseInt(this.container.querySelector('#datax-api-form-driver-ds')?.value, 10) || 0;
      const driverSqlVal = this.container.querySelector('#datax-api-form-driver-sql')?.value?.trim() || '';
      const driverModeVal = this.container.querySelector('#datax-api-form-driver-mode')?.value || 'ROW';
      const driverBatchVal = parseInt(this.container.querySelector('#datax-api-form-driver-batch-size')?.value, 10) || 1;
      const driverDelayVal = parseInt(this.container.querySelector('#datax-api-form-driver-delay')?.value, 10) || 0;
      const timeoutVal = parseInt(this.container.querySelector('#datax-api-form-timeout')?.value, 10) || 60;

      const reqBody = {
        requestUrl: url,
        requestMethod: method,
        requestHeaders: headers,
        requestParams: params,
        requestBodyType: bodyType,
        requestBody: body,
        driverDatasourceId: driverDsVal,
        driverSql: driverSqlVal,
        driverParamMode: driverModeVal,
        driverBatchSize: driverBatchVal,
        driverDelayMs: driverDelayVal,
        authType: authType,
        authConfig: JSON.stringify(authConfig),
        pageStrategy: pageStratVal,
        pageParamName: pageParamVal,
        sizeParamName: sizeParamVal,
        pageStartIndex: pageStartVal,
        pageSize: pageSizeVal,
        dataExtractPath: dataExtractPath,
        responseSuccessPath: codePath,
        responseSuccessValue: codeVal,
        sampleLimit: 5,
        incrementType: incTypeVal,
        incStartTime: incStartTimeVal,
        incTimeFormat: incTimeFmtVal,
        timeoutSeconds: timeoutVal
      };

      fetch('/api/apiTask/testRun', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(reqBody)
      })
        .then(r => r.json())
        .then(res => {
          runBtn.disabled = false;
          runBtn.textContent = '🚀 发送请求并取样测试';

          const scriptLogs = (res.data && res.data.scriptLogs) || [];
          const scriptLogsHtml = scriptLogs.length > 0 ? `
            <div style="background: #1e1e1e; color: #d4d4d4; padding: 6px 10px; border-radius: 4px; font-family: Consolas, Monaco, monospace; font-size: 11px; margin-bottom: 6px; max-height: 120px; overflow-y: auto;">
              <div style="color: #52c41a; font-weight: bold; margin-bottom: 2px;">⚡ 前置脚本打印日志 (共 ${scriptLogs.length} 条):</div>
              ${scriptLogs.map(log => `<div style="color: #dcdcdc;">&gt; ${safeEscapeHtml(log)}</div>`).join('')}
            </div>
          ` : '';

          if (!isApiSuccess(res) || !res.data || !res.data.success) {
            const msg = (res.data && res.data.message) || getApiMsg(res);
            resultBox.innerHTML = `
              ${scriptLogsHtml}
              <div style="color: #f5222d; font-weight: bold; margin-bottom: 4px;">❌ 调试失败: ${safeEscapeHtml(msg)}</div>
              <div style="color: #888;">HTTP状态: ${res.data ? res.data.httpStatus : '-'}, 耗时: ${res.data ? res.data.elapsedMs : 0}ms</div>
              ${res.data && res.data.rawResponseSnippet ? `<pre style="min-height: 80px; max-height: 300px; resize: vertical; overflow: auto; background: #fff1f0; padding: 6px; border-radius: 3px; margin-top: 4px; font-family: monospace;">${safeEscapeHtml(res.data.rawResponseSnippet)}</pre>` : ''}
            `;
            return;
          }

          const data = res.data;
          this.currentSampleFields = data.inferredFields || [];
          this.currentSampleRows = data.sampleRows || [];

          resultBox.innerHTML = `
            ${scriptLogsHtml}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="color: #52c41a; font-weight: bold;">
                ✅ 响应成功 (HTTP ${data.httpStatus})，总抽取到 ${data.totalExtracted} 行，自动解析出 ${this.currentSampleFields.length} 个字段！(耗时 ${data.elapsedMs}ms)
              </span>
              <button id="datax-api-btn-apply-fields" style="background: #52c41a; color: #fff; border: none; padding: 2px 10px; border-radius: 3px; font-weight: bold; cursor: pointer;">将字段直接导入映射</button>
            </div>
            <div style="margin-bottom: 4px; color: #555;">
              <strong>解析字段清单:</strong> <code style="color: #1890ff;">${safeEscapeHtml(this.currentSampleFields.join(', '))}</code>
            </div>
            ${(() => {
              const timeFields = (this.currentSampleFields || []).filter(f => /time|date|create|update|modify|timestamp/i.test(f));
              if (timeFields.length === 0) return '';
              return `
                <div style="margin-bottom: 6px; font-size: 11px; color: #0050b3; background: #e6f7ff; padding: 4px 8px; border-radius: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span>💡 检测到时间字段，点击一键设为增量时间源:</span>
                  ${timeFields.map(f => `<button type="button" class="datax-api-detect-time-btn" data-field="${safeEscapeHtml(f)}" style="background: #fff; border: 1px solid #91d5ff; color: #1890ff; padding: 1px 6px; border-radius: 3px; cursor: pointer; font-size: 11px;">⏱️ ${safeEscapeHtml(f)}</button>`).join('')}
                </div>
              `;
            })()}
            ${data.sampleRows && data.sampleRows.length > 0 ? `
              <div style="font-weight: bold; margin-top: 6px;">抽检首行数据预览 (可拖拽右下角拉伸查看更多):</div>
              <pre style="min-height: 80px; max-height: 360px; resize: vertical; overflow: auto; background: #f6ffed; padding: 6px; border-radius: 3px; margin: 2px 0; font-family: monospace;">${safeEscapeHtml(JSON.stringify(data.sampleRows[0], null, 2))}</pre>
            ` : ''}
          `;

          resultBox.querySelector('#datax-api-btn-apply-fields').onclick = () => {
            this.applyInferredFieldsToMapping();
          };

          resultBox.querySelectorAll('.datax-api-detect-time-btn').forEach(btn => {
            btn.onclick = () => {
              const field = btn.getAttribute('data-field');
              const incColInput = this.container.querySelector('#datax-api-form-inc-col');
              const incTypeSelect = this.container.querySelector('#datax-api-form-inc-type');
              if (incColInput && field) {
                incColInput.value = field;
                if (incTypeSelect && incTypeSelect.value !== '1') {
                  incTypeSelect.value = '1';
                  this.toggleIncrementFields(true);
                }
                toast(`已设为增量提取时间字段: ${field}`);
              }
            };
          });
        })
        .catch(err => {
          runBtn.disabled = false;
          runBtn.textContent = '🚀 发送请求并取样测试';
          resultBox.innerHTML = `<div style="color: #f5222d;">请求异常: ${safeEscapeHtml(err.message)}</div>`;
        });
    }

    handleTestScript() {
      const scriptArea = this.container.querySelector('#datax-api-auth-prescript-code');
      const script = scriptArea ? scriptArea.value.trim() : '';
      if (!script) {
        alert('请先输入 JavaScript 脚本内容！');
        return;
      }

      const url = this.container.querySelector('#datax-api-form-url').value.trim() || 'https://api.example.com/demo';
      const method = this.container.querySelector('#datax-api-form-method').value || 'GET';
      const headers = this.container.querySelector('#datax-api-form-headers').value.trim();
      const params = this.container.querySelector('#datax-api-form-params').value.trim();
      const body = this.container.querySelector('#datax-api-form-body').value.trim();

      const testBtn = this.container.querySelector('#datax-api-btn-test-script');
      const consoleBox = this.container.querySelector('#datax-api-script-console-box');
      const consoleContent = this.container.querySelector('#datax-api-script-console-content');

      if (testBtn) {
        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
      }
      if (consoleBox && consoleContent) {
        consoleBox.style.display = 'block';
        consoleContent.innerHTML = '<div style="color: #1890ff;">⚡ 正在沙箱环境单测前置脚本...</div>';
      }

      const reqBody = {
        script: script,
        requestUrl: url,
        requestMethod: method,
        requestHeaders: headers,
        requestParams: params,
        requestBody: body
      };

      fetch('/api/apiTask/testScript', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(reqBody)
      })
        .then(r => r.json())
        .then(res => {
          if (testBtn) {
            testBtn.disabled = false;
            testBtn.textContent = '测试脚本';
          }
          if (!consoleBox || !consoleContent) return;

          if (!isApiSuccess(res) || !res.data) {
            const msg = (res.data && res.data.message) || getApiMsg(res) || '脚本执行失败';
            consoleContent.innerHTML = `<div style="color: #f5222d;">❌ 脚本执行异常: ${safeEscapeHtml(msg)}</div>`;
            return;
          }

          const data = res.data;
          let html = '';

          if (data.success) {
            html += `<div style="color: #52c41a; font-weight: bold; margin-bottom: 4px;">✅ 脚本执行成功 (耗时: ${data.elapsedMs}ms)</div>`;
          } else {
            html += `<div style="color: #f5222d; font-weight: bold; margin-bottom: 4px;">❌ 脚本执行失败 (耗时: ${data.elapsedMs}ms): ${safeEscapeHtml(data.message || '')}</div>`;
          }

          if (data.logs && data.logs.length > 0) {
            html += `<div style="color: #faad14; margin-top: 4px; font-weight: bold;">[控制台日志输出 (共 ${data.logs.length} 条)]:</div>`;
            data.logs.forEach(item => {
              html += `<div style="color: #dcdcdc; padding: 1px 0;">&gt; ${safeEscapeHtml(item)}</div>`;
            });
          } else {
            html += `<div style="color: #8c8c8c; margin-top: 2px;">(脚本未产生 console.log 或 print 输出)</div>`;
          }

          if (data.resultHeaders && Object.keys(data.resultHeaders).length > 0) {
            html += `<div style="color: #40a9ff; margin-top: 6px; font-weight: bold;">[脚本执行后生成的 Headers]:</div>`;
            html += `<div style="color: #95de64;">${safeEscapeHtml(JSON.stringify(data.resultHeaders, null, 2))}</div>`;
          }

          if (data.resultParams && Object.keys(data.resultParams).length > 0) {
            html += `<div style="color: #40a9ff; margin-top: 6px; font-weight: bold;">[脚本执行后生成的 Params]:</div>`;
            html += `<div style="color: #95de64;">${safeEscapeHtml(JSON.stringify(data.resultParams, null, 2))}</div>`;
          }

          consoleContent.innerHTML = html;
          consoleBox.scrollTop = consoleBox.scrollHeight;
        })
        .catch(err => {
          if (testBtn) {
            testBtn.disabled = false;
            testBtn.textContent = '测试脚本';
          }
          if (consoleContent) {
            consoleContent.innerHTML = `<div style="color: #f5222d;">❌ 请求异常: ${safeEscapeHtml(err.message)}</div>`;
          }
        });
    }

    applyInferredFieldsToMapping() {
      if (!this.currentSampleFields || this.currentSampleFields.length === 0) {
        alert('尚未解析出字段！');
        return;
      }
      const tbody = this.container.querySelector('#datax-api-mapping-tbody');
      tbody.innerHTML = '';
      this.currentSampleFields.forEach(f => {
        // 自动将源属性名转为规范数据库下划线列名 (如 vehicleId -> vehicle_id)
        const colBase = f.includes('.') ? f.split('.').pop() : f;
        const colName = camelToSnake(colBase);
        this.addMappingRow(f, colName);
      });
      this.refreshMappingRowBadges();
      toast(`已成功导入 ${this.currentSampleFields.length} 个字段到映射表！`);
    }

    renderMappingRows(mappingJson) {
      const tbody = this.container.querySelector('#datax-api-mapping-tbody');
      tbody.innerHTML = '';

      let mappings = [];
      if (mappingJson) {
        try {
          mappings = typeof mappingJson === 'string' ? JSON.parse(mappingJson) : mappingJson;
        } catch (e) {
        }
      }

      if (mappings && mappings.length > 0) {
        mappings.forEach(m => {
          this.addMappingRow(m.sourceField || m.apiField || '', m.targetColumn || m.dbColumn || '', m.defaultValue || '', m.columnType || 'VARCHAR');
        });
      } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #909399; padding: 15px;">暂无字段映射，点击【🚀 发送请求并取样测试】后可自动推导</td></tr>';
      }
    }

    /**
     * 加载目标表的字段结构并缓存 (包含列名、类型与注释)
     */
    async loadTargetTableColumns(tableName = null) {
      const targetDsId = this.container.querySelector('#datax-api-form-target-ds')?.value;
      const targetTable = tableName || this.getTargetTableValue();

      if (!targetDsId || !targetTable) {
        this.currentTargetColumns = [];
        this.refreshMappingRowBadges();
        return;
      }

      try {
        let cols = [];
        // 1. 优先调用带注释的高级字段接口
        try {
          const r1 = await fetch(`/api/tableData/columns?datasourceId=${targetDsId}&tableName=${encodeURIComponent(targetTable)}`, {
            headers: getAuthHeaders()
          });
          const res1 = await r1.json();
          if (isApiSuccess(res1) && Array.isArray(res1.data) && res1.data.length > 0) {
            cols = res1.data.map(c => ({
              columnName: c.columnName || c.name || '',
              dataType: c.dataType || c.type || 'VARCHAR',
              columnComment: c.columnComment || c.comment || ''
            })).filter(c => Boolean(c.columnName));
          }
        } catch (ignored) {}

        // 2. 若高级接口未获取到，降级调用基础元数据接口兜底
        if (!cols || cols.length === 0) {
          const r2 = await fetch(`/api/metadata/getColumns?datasourceId=${targetDsId}&tableName=${encodeURIComponent(targetTable)}`, {
            headers: getAuthHeaders()
          });
          const res2 = await r2.json();
          if (isApiSuccess(res2) && Array.isArray(res2.data)) {
            cols = res2.data.map(c => {
              const name = typeof c === 'string' ? c : (c.columnName || c.name || '');
              return { columnName: name, dataType: 'VARCHAR', columnComment: '' };
            }).filter(c => Boolean(c.columnName));
          }
        }

        this.currentTargetColumns = cols;
        const tipEl = this.container.querySelector('#datax-api-map-stat-tip');
        if (tipEl) {
          if (cols && cols.length > 0) {
            tipEl.textContent = `(表 [${safeEscapeHtml(targetTable)}] 共加载 ${cols.length} 个字段，支持下拉搜索与智能同名匹配)`;
            tipEl.style.color = '#52c41a';
          } else {
            tipEl.textContent = `(新表 [${safeEscapeHtml(targetTable)}]，任务首次执行将自动推导建表，可直接配置字段映射)`;
            tipEl.style.color = '#1890ff';
          }
        }
        this.refreshMappingRowBadges();
      } catch (err) {
        console.error('加载目标表字段失败', err);
        this.currentTargetColumns = [];
        this.refreshMappingRowBadges();
      }
    }

    /**
     * 刷新所有映射行的匹配徽标和视觉高亮状态
     */
    refreshMappingRowBadges() {
      const rows = this.container.querySelectorAll('#datax-api-mapping-tbody tr');
      const candidateCols = this.currentTargetColumns || [];
      const colMap = new Map();
      candidateCols.forEach(c => colMap.set(c.columnName.toLowerCase(), c));

      rows.forEach(tr => {
        const targetInput = tr.querySelector('.datax-map-target');
        const badge = tr.querySelector('.datax-match-badge');
        if (!targetInput || !badge) return;

        const val = targetInput.value.trim();
        if (!val) {
          badge.textContent = '⚪ 待对齐';
          badge.title = '尚未选择目标表列';
          badge.style.cssText = 'display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px; background: #fafafa; border: 1px dashed #d9d9d9; color: #8c8c8c; cursor: default;';
          targetInput.style.borderColor = '#dcdfe6';
          targetInput.style.background = '#fff';
          targetInput.style.color = '#333';
          targetInput.style.fontWeight = 'normal';
        } else if (colMap.has(val.toLowerCase())) {
          const colInfo = colMap.get(val.toLowerCase());
          const isAuto = badge.getAttribute('data-matched-by') === 'AUTO';
          badge.textContent = isAuto ? '🎯 自动匹配' : '✅ 已对齐';
          badge.title = `目标列存在: ${colInfo.columnName} (${colInfo.dataType}${colInfo.columnComment ? ' - ' + colInfo.columnComment : ''})`;
          badge.style.cssText = 'display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 3px; background: #f6ffed; border: 1px solid #b7eb8f; color: #52c41a; font-weight: bold; cursor: default; box-shadow: 0 0 4px rgba(82,196,26,0.18);';
          targetInput.style.borderColor = '#52c41a';
          targetInput.style.background = '#f6ffed';
          targetInput.style.color = '#135200';
          targetInput.style.fontWeight = 'bold';
        } else {
          const isAutoCreate = this.container.querySelector('#datax-api-form-auto-create')?.checked;
          badge.textContent = isAutoCreate ? '✨ 待推导建表' : '✏️ 自定义列';
          badge.title = isAutoCreate ? '该列将在首次运行时由系统自动建表创建' : '目标表中未检测到该字段（将依赖自动建表或需在数据库新增）';
          badge.style.cssText = 'display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px; background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; cursor: default;';
          targetInput.style.borderColor = '#91d5ff';
          targetInput.style.background = '#fff';
          targetInput.style.color = '#333';
          targetInput.style.fontWeight = 'normal';
        }
      });
    }

    addMappingRow(srcField = '', targetCol = '', defaultVal = '', colType = 'VARCHAR') {
      const tbody = this.container.querySelector('#datax-api-mapping-tbody');
      const placeholder = tbody.querySelector('td[colspan="5"]');
      if (placeholder) {
        tbody.innerHTML = '';
      }

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #f0f0f0';
      tr.innerHTML = `
        <td style="padding: 4px;">
          <input type="text" class="datax-map-src" value="${safeEscapeHtml(srcField)}" placeholder="接口属性如 order_sn" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #dcdfe6; border-radius: 3px; font-size: 12px;" />
        </td>
        <td style="text-align: center; color: #1890ff; font-weight: bold;">➡️</td>
        <td style="padding: 4px; position: relative;">
          <div class="datax-target-col-wrap" style="position: relative; width: 100%;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <div style="position: relative; flex: 1; display: flex; align-items: center;">
                <input type="text" class="datax-map-target" value="${safeEscapeHtml(targetCol)}" placeholder="搜索或输入目标列..." style="width: 100%; box-sizing: border-box; padding: 4px 22px 4px 6px; border: 1px solid #dcdfe6; border-radius: 3px; font-size: 12px;" autocomplete="off" />
                <button type="button" class="datax-col-toggle-btn" style="position: absolute; right: 2px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #909399; font-size: 9px; padding: 2px 4px; line-height: 1;" title="展开目标表全部字段">▼</button>
              </div>
              <span class="datax-match-badge" style="display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px; white-space: nowrap; cursor: default;">⚪ 待对齐</span>
            </div>
            <!-- 悬浮选项列表 -->
            <div class="datax-col-dropdown-panel" style="display: none; position: absolute; top: calc(100% + 2px); left: 0; width: 100%; min-width: 260px; max-height: 200px; overflow-y: auto; background: #fff; border: 1px solid #dcdfe6; border-radius: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); z-index: 1000; font-size: 11px;">
            </div>
          </div>
        </td>
        <td style="padding: 4px;">
          <input type="text" class="datax-map-default" value="${safeEscapeHtml(defaultVal)}" placeholder="默认值(可选)" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #dcdfe6; border-radius: 3px; font-size: 11px;" />
        </td>
        <td style="padding: 4px; text-align: center;">
          <button class="datax-map-del-btn" style="background: transparent; border: none; color: #ff4d4f; cursor: pointer; font-size: 14px;" title="删除此行">&times;</button>
        </td>
      `;

      const targetInput = tr.querySelector('.datax-map-target');
      const toggleBtn = tr.querySelector('.datax-col-toggle-btn');
      const dropPanel = tr.querySelector('.datax-col-dropdown-panel');
      const matchBadge = tr.querySelector('.datax-match-badge');

      // 渲染过滤后的下拉选项列表
      const renderOptions = (keyword = '') => {
        const cols = this.currentTargetColumns || [];
        if (cols.length === 0) {
          dropPanel.innerHTML = '<div style="padding: 10px; text-align: center; color: #909399;">⚠️ 暂无字段结构，请先在上方步骤4选择目标表</div>';
          return;
        }

        const kw = keyword.trim().toLowerCase();
        const filtered = kw
          ? cols.filter(c => c.columnName.toLowerCase().includes(kw) || (c.columnComment && c.columnComment.toLowerCase().includes(kw)) || (c.dataType && c.dataType.toLowerCase().includes(kw)))
          : cols;

        if (filtered.length === 0) {
          dropPanel.innerHTML = `<div style="padding: 10px; text-align: center; color: #909399;">未找到匹配 "${safeEscapeHtml(kw)}" 的列</div>`;
          return;
        }

        let optsHtml = '';
        filtered.forEach(col => {
          optsHtml += `
            <div class="datax-col-option-item" data-col="${safeEscapeHtml(col.columnName)}" style="padding: 5px 8px; cursor: pointer; border-bottom: 1px solid #f5f5f5; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s;">
              <div style="font-weight: bold; color: #262626; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${safeEscapeHtml(col.columnName)}
              </div>
              <div style="display: flex; gap: 4px; align-items: center; font-size: 10px; white-space: nowrap;">
                <span style="background: #f0f2f5; color: #595959; padding: 1px 4px; border-radius: 2px;">${safeEscapeHtml(col.dataType || 'VARCHAR')}</span>
                ${col.columnComment ? `<span style="color: #1890ff; max-width: 100px; overflow: hidden; text-overflow: ellipsis;" title="${safeEscapeHtml(col.columnComment)}">${safeEscapeHtml(col.columnComment)}</span>` : ''}
              </div>
            </div>
          `;
        });
        dropPanel.innerHTML = optsHtml;

        // 绑定选项点击
        dropPanel.querySelectorAll('.datax-col-option-item').forEach(item => {
          item.onmouseenter = () => { item.style.background = '#e6f7ff'; };
          item.onmouseleave = () => { item.style.background = '#fff'; };
          item.onclick = (e) => {
            e.stopPropagation();
            const selectedCol = item.getAttribute('data-col');
            targetInput.value = selectedCol;
            matchBadge.removeAttribute('data-matched-by');
            dropPanel.style.display = 'none';
            this.refreshMappingRowBadges();
          };
        });
      };

      // 切换下拉面板展示
      const openDropdown = () => {
        // 先关闭其它行的下拉框
        this.container.querySelectorAll('.datax-col-dropdown-panel').forEach(p => {
          if (p !== dropPanel) p.style.display = 'none';
        });
        renderOptions(targetInput.value);
        dropPanel.style.display = 'block';
      };

      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropPanel.style.display === 'block') {
          dropPanel.style.display = 'none';
        } else {
          openDropdown();
        }
      };

      targetInput.onfocus = () => {
        openDropdown();
      };

      targetInput.oninput = () => {
        dropPanel.style.display = 'block';
        matchBadge.removeAttribute('data-matched-by');
        renderOptions(targetInput.value);
        this.refreshMappingRowBadges();
      };

      targetInput.onchange = () => {
        this.refreshMappingRowBadges();
      };

      tr.querySelector('.datax-map-del-btn').onclick = () => tr.remove();
      tbody.appendChild(tr);

      // 初次添加行时触发一次状态刷新
      this.refreshMappingRowBadges();
    }

    async autoMapFields() {
      const targetTable = this.getTargetTableValue();
      const targetDsId = this.container.querySelector('#datax-api-form-target-ds')?.value;

      if (!targetDsId || !targetTable) {
        alert('请先在步骤 4 中选择目标数据源并输入目标数据表！');
        return;
      }

      const rows = this.container.querySelectorAll('#datax-api-mapping-tbody tr');
      if (rows.length === 0 || rows[0].querySelector('td[colspan="5"]')) {
        alert('当前没有可供映射的字段行，请先点击【➕ 添加映射行】或【🚀 发送请求并取样测试】导入接口属性！');
        return;
      }

      // 如果当前表名在数据源中已存在，且尚未拉取列结构，尝试获取一次
      const existingTables = (this.currentDatasourceTables || []).map(t => typeof t === 'string' ? t.toLowerCase() : (t.tableName || '').toLowerCase());
      const isExisting = existingTables.includes(targetTable.toLowerCase());

      if (isExisting && (!this.currentTargetColumns || this.currentTargetColumns.length === 0)) {
        toast('⏳ 正在获取目标表列结构元数据...');
        await this.loadTargetTableColumns(targetTable);
      }

      const hasTargetCols = this.currentTargetColumns && this.currentTargetColumns.length > 0;
      let matchedCount = 0;
      let totalCount = 0;

      rows.forEach(tr => {
        const srcInput = tr.querySelector('.datax-map-src');
        const targetInput = tr.querySelector('.datax-map-target');
        const badge = tr.querySelector('.datax-match-badge');
        if (!srcInput || !targetInput) return;

        totalCount++;
        const src = srcInput.value.trim();
        if (!src) return;

        if (hasTargetCols) {
          // 场景 A: 目标库已有物理表，按完全同名、驼峰/下划线互转精准匹配物理列
          const matchResult = findBestMatchedColumn(src, this.currentTargetColumns);
          if (matchResult) {
            targetInput.value = matchResult.targetCol;
            if (badge) {
              badge.setAttribute('data-matched-by', 'AUTO');
            }
            matchedCount++;
          }
        } else {
          // 场景 B: 目标表为新表（不存在物理列），自动将源属性转为规范数据库下划线列名
          const cleanCol = src.includes('.') ? src.split('.').pop() : src;
          targetInput.value = camelToSnake(cleanCol);
          if (badge) {
            badge.setAttribute('data-matched-by', 'AUTO');
          }
          matchedCount++;
        }
      });

      // 刷新高亮样式
      this.refreshMappingRowBadges();

      if (hasTargetCols) {
        if (matchedCount > 0) {
          toast(`🎉 智能匹配完成！共扫描 ${totalCount} 个接口源属性，成功自动对齐 ${matchedCount} 个字段！`);
        } else {
          alert(`已扫描 ${totalCount} 个字段，未能在目标表 [${targetTable}] 中匹配到相似字段，请使用下拉选择器手动指定。`);
        }
      } else {
        toast(`✨ 已为新表 [${targetTable}] 自动将 ${matchedCount} 个源字段推导为标准下划线列名，任务首次运行将自动建表！`);
      }
    }

    buildAuthConfigObject(authType) {
      const cfg = {};
      if (authType === 'BEARER_TOKEN') {
        cfg.token = this.container.querySelector('#datax-api-auth-bearer-token').value.trim();
      } else if (authType === 'API_KEY') {
        cfg.key = this.container.querySelector('#datax-api-auth-key-name').value.trim();
        cfg.value = this.container.querySelector('#datax-api-auth-key-val').value.trim();
        cfg.position = this.container.querySelector('#datax-api-auth-key-pos').value;
      } else if (authType === 'BASIC_AUTH') {
        cfg.username = this.container.querySelector('#datax-api-auth-basic-user').value.trim();
        cfg.password = this.container.querySelector('#datax-api-auth-basic-pass').value.trim();
      } else if (authType === 'PRE_SCRIPT') {
        const scriptInput = this.container.querySelector('#datax-api-auth-prescript-code');
        cfg.script = scriptInput ? scriptInput.value.trim() : '';
      }
      return cfg;
    }

    handleDraftSave() {
      const taskName = this.container.querySelector('#datax-api-form-name').value.trim();
      if (!taskName) {
        alert('请先输入任务名称，以便后续查找草稿！');
        return;
      }

      const id = this.container.querySelector('#datax-api-form-id').value;
      const url = this.container.querySelector('#datax-api-form-url').value.trim();
      const targetDsId = this.container.querySelector('#datax-api-form-target-ds').value;
      const targetTable = this.getTargetTableValue();
      const dataExtractPath = this.container.querySelector('#datax-api-form-data-path').value.trim();

      // 提取字段映射（有多少存多少，允许为空）
      const mappingRows = this.container.querySelectorAll('#datax-api-mapping-tbody tr');
      const mappings = [];
      mappingRows.forEach(tr => {
        const src = tr.querySelector('.datax-map-src')?.value.trim();
        const target = tr.querySelector('.datax-map-target')?.value.trim();
        const def = tr.querySelector('.datax-map-default')?.value.trim();
        if (src || target) {
          mappings.push({ sourceCol: src || '', targetCol: target || '', sourceField: src || '', targetColumn: target || '', defaultValue: def || '', dataType: 'VARCHAR', columnType: 'VARCHAR' });
        }
      });

      const authType = this.container.querySelector('#datax-api-form-auth-type').value;
      const authConfig = this.buildAuthConfigObject(authType);

      const incType = parseInt(this.container.querySelector('#datax-api-form-inc-type').value, 10) || 0;
      const incStartTime = normalizeDateTimeString(this.container.querySelector('#datax-api-form-inc-start-time').value);
      const incTimeFormat = this.container.querySelector('#datax-api-form-inc-time-fmt').value.trim() || 'yyyy-MM-dd HH:mm:ss';

      const draftBtn = this.container.querySelector('#datax-api-btn-draft-save');
      if (draftBtn) {
        draftBtn.disabled = true;
        draftBtn.textContent = '暂存中...';
      }

      const postData = {
        id: id ? parseInt(id, 10) : null,
        taskName: taskName,
        isDraft: true,
        status: 2, // 2 = 暂存草稿
        requestUrl: url,
        requestMethod: this.container.querySelector('#datax-api-form-method').value,
        requestHeaders: this.container.querySelector('#datax-api-form-headers').value.trim(),
        requestParams: this.container.querySelector('#datax-api-form-params').value.trim(),
        requestBodyType: this.container.querySelector('#datax-api-form-body-type').value,
        requestBody: this.container.querySelector('#datax-api-form-body').value.trim(),
        authType: authType,
        authConfig: JSON.stringify(authConfig),
        pageStrategy: this.container.querySelector('#datax-api-form-page-strat').value,
        pageParamName: this.container.querySelector('#datax-api-form-page-param').value.trim(),
        sizeParamName: this.container.querySelector('#datax-api-form-size-param').value.trim(),
        pageStartIndex: parseInt(this.container.querySelector('#datax-api-form-page-start').value, 10) || 1,
        pageSize: parseInt(this.container.querySelector('#datax-api-form-page-size').value, 10) || 100,
        maxPageLimit: parseInt(this.container.querySelector('#datax-api-form-max-pages').value, 10) || 500,
        dataExtractPath: dataExtractPath || '$.data',
        cursorExtractPath: this.container.querySelector('#datax-api-form-cursor-path').value.trim(),
        responseSuccessPath: this.container.querySelector('#datax-api-form-code-path').value.trim(),
        responseSuccessValue: this.container.querySelector('#datax-api-form-code-val').value.trim(),
        driverDatasourceId: parseInt(this.container.querySelector('#datax-api-form-driver-ds')?.value, 10) || 0,
        driverSql: this.container.querySelector('#datax-api-form-driver-sql')?.value?.trim() || '',
        driverParamMode: this.container.querySelector('#datax-api-form-driver-mode')?.value || 'ROW',
        driverBatchSize: parseInt(this.container.querySelector('#datax-api-form-driver-batch-size')?.value, 10) || 1,
        driverDelayMs: parseInt(this.container.querySelector('#datax-api-form-driver-delay')?.value, 10) || 0,
        targetDatasourceId: targetDsId ? parseInt(targetDsId, 10) : 0,
        targetTableName: targetTable,
        writeMode: this.container.querySelector('#datax-api-form-write-mode').value,
        autoCreateTable: this.container.querySelector('#datax-api-form-auto-create').checked ? 1 : 0,
        columnMappingJson: JSON.stringify(mappings),
        cronExpression: this.container.querySelector('#datax-api-form-cron').value.trim(),
        batchSize: parseInt(this.container.querySelector('#datax-api-form-batch-size').value, 10) || 1000,
        requestDelayMs: parseInt(this.container.querySelector('#datax-api-form-delay').value, 10) || 0,
        timeoutSeconds: parseInt(this.container.querySelector('#datax-api-form-timeout').value, 10) || 60,
        incrementType: incType,
        incStartTime: incStartTime || null,
        incTimeFormat: incTimeFormat,
        incStrategy: parseInt(this.container.querySelector('#datax-api-form-inc-strategy').value || '0', 10),
        incTimeColumn: this.container.querySelector('#datax-api-form-inc-col').value.trim()
      };

      fetch('/api/apiTask/save', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(postData)
      })
        .then(r => r.json())
        .then(res => {
          if (draftBtn) {
            draftBtn.disabled = false;
            draftBtn.textContent = '暂存草稿';
          }
          if (!isApiSuccess(res)) {
            alert('暂存失败: ' + getApiMsg(res));
            return;
          }
          toast('📝 任务草稿已成功暂存！可随时在列表中重新打开编辑。');
          this.closeEditor();
          this.loadTaskList();
        })
        .catch(err => {
          if (draftBtn) {
            draftBtn.disabled = false;
            draftBtn.textContent = '暂存草稿';
          }
          alert('暂存请求异常: ' + err.message);
        });
    }

    handleSubmitSave() {
      const taskName = this.container.querySelector('#datax-api-form-name').value.trim();
      const url = this.container.querySelector('#datax-api-form-url').value.trim();
      const targetDsId = this.container.querySelector('#datax-api-form-target-ds').value;
      const targetTable = this.getTargetTableValue();
      const dataExtractPath = this.container.querySelector('#datax-api-form-data-path').value.trim();

      if (!taskName) { alert('请输入任务名称！'); return; }
      if (!url) { alert('请输入请求 URL！'); return; }
      if (!targetDsId) { alert('请选择目标端数据源！'); return; }
      if (!targetTable) { alert('请选择或输入目标表名！'); return; }
      if (!dataExtractPath) { alert('请输入数据提取路径 (JSONPath)！'); return; }

      // 提取字段映射
      const mappingRows = this.container.querySelectorAll('#datax-api-mapping-tbody tr');
      const mappings = [];
      mappingRows.forEach(tr => {
        const src = tr.querySelector('.datax-map-src')?.value.trim();
        const target = tr.querySelector('.datax-map-target')?.value.trim();
        const def = tr.querySelector('.datax-map-default')?.value.trim();
        if (src && target) {
          let matchedDataType = 'VARCHAR';
          if (this.currentTargetColumns && this.currentTargetColumns.length > 0) {
            const found = this.currentTargetColumns.find(c => (c.columnName || c.name || '') === target);
            if (found && (found.columnType || found.type)) {
              matchedDataType = found.columnType || found.type;
            }
          }
          mappings.push({ sourceCol: src, targetCol: target, sourceField: src, targetColumn: target, defaultValue: def, dataType: matchedDataType, columnType: matchedDataType });
        }
      });

      if (mappings.length === 0) {
        alert('请至少配置一个有效的字段映射！');
        return;
      }

      const id = this.container.querySelector('#datax-api-form-id').value;
      const authType = this.container.querySelector('#datax-api-form-auth-type').value;
      const authConfig = this.buildAuthConfigObject(authType);

      if (authType === 'PRE_SCRIPT' && !authConfig.script) {
        alert('采用自定义前置脚本 (PRE_SCRIPT) 认证时，脚本内容不能为空！');
        return;
      }

      const incType = parseInt(this.container.querySelector('#datax-api-form-inc-type').value, 10) || 0;
      const incStartTime = normalizeDateTimeString(this.container.querySelector('#datax-api-form-inc-start-time').value);
      const incTimeFormat = this.container.querySelector('#datax-api-form-inc-time-fmt').value.trim() || 'yyyy-MM-dd HH:mm:ss';
      if (incType === 1 && !incStartTime) {
        alert('启用时间增量同步时，必须指定增量起始时间（如 2026-01-01 00:00:00）！');
        return;
      }

      const postData = {
        id: id ? parseInt(id, 10) : null,
        taskName: taskName,
        isDraft: false,
        requestUrl: url,
        requestMethod: this.container.querySelector('#datax-api-form-method').value,
        requestHeaders: this.container.querySelector('#datax-api-form-headers').value.trim(),
        requestParams: this.container.querySelector('#datax-api-form-params').value.trim(),
        requestBodyType: this.container.querySelector('#datax-api-form-body-type').value,
        requestBody: this.container.querySelector('#datax-api-form-body').value.trim(),
        authType: authType,
        authConfig: JSON.stringify(authConfig),
        pageStrategy: this.container.querySelector('#datax-api-form-page-strat').value,
        pageParamName: this.container.querySelector('#datax-api-form-page-param').value.trim(),
        sizeParamName: this.container.querySelector('#datax-api-form-size-param').value.trim(),
        pageStartIndex: parseInt(this.container.querySelector('#datax-api-form-page-start').value, 10) || 1,
        pageSize: parseInt(this.container.querySelector('#datax-api-form-page-size').value, 10) || 100,
        maxPageLimit: parseInt(this.container.querySelector('#datax-api-form-max-pages').value, 10) || 500,
        dataExtractPath: dataExtractPath,
        cursorExtractPath: this.container.querySelector('#datax-api-form-cursor-path').value.trim(),
        responseSuccessPath: this.container.querySelector('#datax-api-form-code-path').value.trim(),
        responseSuccessValue: this.container.querySelector('#datax-api-form-code-val').value.trim(),
        driverDatasourceId: parseInt(this.container.querySelector('#datax-api-form-driver-ds')?.value, 10) || 0,
        driverSql: this.container.querySelector('#datax-api-form-driver-sql')?.value?.trim() || '',
        driverParamMode: this.container.querySelector('#datax-api-form-driver-mode')?.value || 'ROW',
        driverBatchSize: parseInt(this.container.querySelector('#datax-api-form-driver-batch-size')?.value, 10) || 1,
        driverDelayMs: parseInt(this.container.querySelector('#datax-api-form-driver-delay')?.value, 10) || 0,
        targetDatasourceId: parseInt(targetDsId, 10),
        targetTableName: targetTable,
        writeMode: this.container.querySelector('#datax-api-form-write-mode').value,
        autoCreateTable: (() => {
          const isChecked = this.container.querySelector('#datax-api-form-auto-create').checked;
          const existingTables = (this.currentDatasourceTables || []).map(t => typeof t === 'string' ? t.toLowerCase() : (t.tableName || '').toLowerCase());
          const isExisting = existingTables.includes(targetTable.toLowerCase());
          // 若目标表在目标库不存在，强一致自动置为推导建表 (1)
          if (!isExisting || isChecked) {
            return 1;
          }
          return 0;
        })(),
        columnMappingJson: JSON.stringify(mappings),
        cronExpression: this.container.querySelector('#datax-api-form-cron').value.trim(),
        batchSize: parseInt(this.container.querySelector('#datax-api-form-batch-size').value, 10) || 1000,
        requestDelayMs: parseInt(this.container.querySelector('#datax-api-form-delay').value, 10) || 0,
        timeoutSeconds: parseInt(this.container.querySelector('#datax-api-form-timeout').value, 10) || 60,
        incrementType: incType,
        incStartTime: incStartTime || null,
        incTimeFormat: incTimeFormat,
        incStrategy: parseInt(this.container.querySelector('#datax-api-form-inc-strategy').value || '0', 10),
        incTimeColumn: this.container.querySelector('#datax-api-form-inc-col').value.trim()
      };

      const saveBtn = this.container.querySelector('#datax-api-btn-submit-save');
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ 保存中...';

      fetch('/api/apiTask/save', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(postData)
      })
        .then(r => r.json())
        .then(res => {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存采集任务';
          if (isApiSuccess(res)) {
            toast('🎉 保存接口采集任务成功！');
            this.closeEditor();
            this.loadTaskList();
          } else {
            alert('保存失败: ' + getApiMsg(res));
          }
        })
        .catch(err => {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存采集任务';
          alert('网络错误: ' + err.message);
        });
    }

    async handleRunOnce(id, btn = null) {
      if (this._isExecuting) {
        toast('⚠️ 正在执行任务中，请稍候...');
        return;
      }

      const ok = await confirm('确定要立即执行一次该接口的数据采集入库任务吗？');
      if (!ok) return;

      this._isExecuting = true;
      let originalBtnText = '';
      if (btn) {
        btn.disabled = true;
        originalBtnText = btn.textContent;
        btn.textContent = '⏳执行中';
        btn.style.opacity = '0.6';
      }

      toast('🚀 已触发接口数据同步任务，正在执行入库...');
      try {
        const resp = await fetch(`/api/apiTask/executeOnce/${id}`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const res = await resp.json();
        if (isApiSuccess(res)) {
          await alert(res.data ? `🎉 ${res.data}` : '🎉 任务执行成功');
        } else {
          let errText = getApiMsg(res);
          if (errText && !errText.startsWith('执行失败')) {
            errText = '执行失败: ' + errText;
          }
          await alert(errText);
        }
      } catch (e) {
        await alert('请求异常: ' + (e ? e.message : '网络连接失败'));
      } finally {
        this._isExecuting = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalBtnText || '🚀 执行';
          btn.style.opacity = '1';
        }
        this.loadTaskList();
      }
    }

    handleEdit(id) {
      fetch(`/api/apiTask/detail/${id}`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(res => {
          if (isApiSuccess(res) && res.data) {
            this.openEditor(res.data);
          } else {
            alert('获取任务详情失败: ' + getApiMsg(res));
          }
        })
        .catch(e => alert('加载任务失败: ' + e.message));
    }

    handleDelete(id) {
      confirm('确定要删除该接口数据采集任务吗？关联的定时调度也将同步注销！').then(ok => {
        if (!ok) return;
        fetch(`/api/apiTask/delete/${id}`, {
          method: 'POST',
          headers: getAuthHeaders()
        })
          .then(r => r.json())
          .then(res => {
            if (isApiSuccess(res)) {
              toast('已成功删除任务');
              this.loadTaskList();
            } else {
              alert('删除失败: ' + getApiMsg(res));
            }
          })
          .catch(e => alert('删除请求异常: ' + e.message));
      });
    }

    handleToggleStatus(id, currentRunning, isDraft = false) {
      if (isDraft) {
        alert('该任务当前为「暂存草稿」状态，配置尚未正式确认，请先点击【✏️ 编辑】完善配置并正式保存后再开启调度！');
        return;
      }
      const action = currentRunning ? 'stop' : 'start';
      const tip = currentRunning ? '停止' : '开启';
      fetch(`/api/apiTask/${action}/${id}`, {
        method: 'POST',
        headers: getAuthHeaders()
      })
        .then(r => r.json())
        .then(res => {
          if (isApiSuccess(res)) {
            toast(`已${tip}定时调度`);
            this.loadTaskList();
          } else {
            alert(`${tip}失败: ` + getApiMsg(res));
          }
        })
        .catch(e => alert('操作异常: ' + e.message));
    }
  }

  // ==================== 接口采集任务执行历史流水弹窗逻辑 ====================
  let currentLogTaskId = null;
  let currentLogTaskName = '';
  let currentLogPage = 1;
  const currentLogPageSize = 10;
  let currentLogStatus = 0;
  let currentLogTriggerType = '';

  function copyTextToClipboard(text) {
    if (!text) {
      toast('暂无可复制的内容');
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        toast('✅ 已复制到剪贴板');
      }).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
  }

  function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      toast('✅ 已复制到剪贴板');
    } catch (err) {
      toast('复制失败，请手动复制');
    }
    textArea.remove();
  }

  function openApiTaskLogModal(task) {
    if (!task) return;
    currentLogTaskId = task.id;
    currentLogTaskName = task.taskName || `任务 #${task.id}`;
    currentLogPage = 1;
    currentLogStatus = 0;
    currentLogTriggerType = '';

    // 清理可能遗留的旧 DOM
    let modalEl = document.getElementById('datax-api-log-modal');
    if (modalEl) {
      modalEl.remove();
    }

    modalEl = document.createElement('div');
    modalEl.id = 'datax-api-log-modal';
    modalEl.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
    // 对齐工作台弹窗层级规范：主工作台为 999999，浮层弹窗设为 1000025，确保始终位于主工作台之上
    modalEl.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.48); z-index: 1000025; backdrop-filter: blur(3px);';
    modalEl.innerHTML = `
      <!-- 统一风格窗口：蓝色渐变头部 + 可拖拽 + 8 向缩放 (复用 PanelWindowManager) -->
      <div id="datax-api-log-dialog" style="background: #fff; border-radius: 8px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28), 0 6px 16px rgba(0, 0, 0, 0.12); display: flex; flex-direction: column; overflow: hidden; position: absolute; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;">
        <!-- 窗口头部：统一蓝色渐变，拖拽移动 + 双击最大化/还原 -->
        <div id="datax-api-log-header" title="按住鼠标左键可自由拖动，双击最大化/还原" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; border-radius: 8px 8px 0 0; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <strong style="font-size: 14px;" id="datax-api-log-title">任务执行历史记录</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="datax-api-log-btn-refresh" data-window-ctrl title="刷新执行记录" style="background: rgba(255,255,255,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: 4px; padding: 3px 10px; font-size: 12px; cursor: pointer; transition: all 0.2s;">刷新</button>
            <span id="datax-api-log-max" data-window-ctrl title="最大化 / 还原" style="font-size: 15px; line-height: 1; padding: 0 3px; cursor: pointer; opacity: 0.9;">&#x25A2;</span>
            <span id="datax-api-log-btn-close" data-window-ctrl title="关闭 (Esc)" style="font-size: 20px; line-height: 1; padding: 0 4px; cursor: pointer; opacity: 0.9;">&times;</span>
          </div>
        </div>

        <!-- 过滤工具栏：统一白色工具条 -->
        <div style="padding: 8px 16px; background: #fafafa; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0;">
          <span style="font-size: 12px; color: #595959; white-space: nowrap;">触发状态</span>
          <select id="datax-api-log-filter-status" style="border: 1px solid #d9d9d9; border-radius: 4px; padding: 4px 10px; font-size: 12px; outline: none; background: #fff; color: #595959; cursor: pointer; transition: all 0.2s;">
            <option value="0">全部状态</option>
            <option value="1">🟢 执行成功</option>
            <option value="2">🔴 执行失败</option>
            <option value="3">⏳ 待完成 / 未回调</option>
          </select>
          <span style="font-size: 12px; color: #595959; white-space: nowrap;">触发方式</span>
          <select id="datax-api-log-filter-type" style="border: 1px solid #d9d9d9; border-radius: 4px; padding: 4px 10px; font-size: 12px; outline: none; background: #fff; color: #595959; cursor: pointer; transition: all 0.2s;">
            <option value="">全部方式</option>
            <option value="MANUAL">🚀 手动执行</option>
            <option value="CRON">⏰ 定时调度</option>
          </select>
        </div>

        <!-- 任务摘要信息条：Ant Design 说明标签栏 -->
        <div id="datax-api-log-meta-bar" style="background: #fbfbfb; border-bottom: 1px solid #f0f0f0; padding: 8px 20px; font-size: 12px; color: #595959; display: flex; gap: 18px; align-items: center; flex-wrap: wrap;">
          <span>任务ID: <strong style="color: #262626; font-family: monospace;">#${task.id}</strong></span>
          <span>目标库表: <span style="background: #e6f7ff; color: #096dd9; border: 1px solid #91d5ff; padding: 1px 8px; border-radius: 4px; font-weight: 500;">${safeEscapeHtml(task.targetTableName || '-')} (${safeEscapeHtml(task.writeMode || 'APPEND')})</span></span>
          <span>请求地址: <span style="background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; padding: 1px 8px; border-radius: 4px; font-family: monospace;" title="${safeEscapeHtml(task.requestUrl || '')}">[${safeEscapeHtml(task.requestMethod || 'GET')}] ${safeEscapeHtml((task.requestUrl && task.requestUrl.length > 40) ? task.requestUrl.substring(0, 38) + '...' : (task.requestUrl || '-'))}</span></span>
          <span>Cron周期: <span style="background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; padding: 1px 8px; border-radius: 4px; font-family: monospace;">${safeEscapeHtml(task.cronExpression || '未配置')}</span></span>
          <span>调度状态: ${task.status === 1 ? '<span style="color: #52c41a; font-weight: 600;">🟢 运行中</span>' : (task.status === 2 ? '<span style="color: #d48806; font-weight: 600;">📝 暂存草稿</span>' : '<span style="color: #8c8c8c;">⚪ 已停止</span>')}</span>
        </div>

        <!-- 日志内容滚动区域 -->
        <div id="datax-api-log-body" style="flex: 1; overflow-y: auto; padding: 0; box-sizing: border-box; background: #fff;">
          <div style="text-align: center; color: #8c8c8c; padding: 60px 20px; font-size: 13px;">⏳ 正在读取执行历史记录...</div>
        </div>

        <!-- 底部工具栏与分页：Ant Design 规范分页组件 -->
        <div style="padding: 10px 20px; border-top: 1px solid #f0f0f0; background: #fafafa; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #595959;">
          <div id="datax-api-log-page-info">共 0 条执行记录</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="datax-api-log-prev-page" style="background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; padding: 3px 10px; font-size: 12px; color: #595959; cursor: pointer; transition: all 0.2s;">◀ 上一页</button>
            <span id="datax-api-log-cur-page-text" style="font-size: 12px; color: #262626;">第 1 页</span>
            <button id="datax-api-log-next-page" style="background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; padding: 3px 10px; font-size: 12px; color: #595959; cursor: pointer; transition: all 0.2s;">下一页 ▶</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    // 初始尺寸与视口居中定位
    const logDialog = modalEl.querySelector('#datax-api-log-dialog');
    const initLogW = Math.min(1060, Math.max(720, window.innerWidth * 0.72));
    const initLogH = Math.min(window.innerHeight * 0.84, 760);
    logDialog.style.width = `${initLogW}px`;
    logDialog.style.height = `${initLogH}px`;
    logDialog.style.left = `${Math.max(10, Math.round((window.innerWidth - initLogW) / 2))}px`;
    logDialog.style.top = `${Math.max(10, Math.round((window.innerHeight - initLogH) / 2))}px`;

    // 8 方向缩放手柄
    ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `datax-resize-handle datax-resize-${dir}`;
      handle.setAttribute('data-dir', dir);
      handle.title = (dir === 'se') ? '按住拖动调整窗口尺寸' : '调整窗口尺寸';
      logDialog.appendChild(handle);
    });

    // 复用统一窗口交互管理器
    const logWindowManager = new window.DataXAssistant.PanelWindowManager(
      logDialog,
      modalEl.querySelector('#datax-api-log-header'),
      {
        maxBtn: modalEl.querySelector('#datax-api-log-max'),
        minWidth: 640,
        minHeight: 420,
        storageKeyPos: 'datax_api_log_pos',
        storageKeySize: 'datax_api_log_size'
      }
    );

    // 关闭逻辑与 ESC 按键监听
    const closeModal = () => {
      modalEl.remove();
      if (logWindowManager && typeof logWindowManager.destroy === 'function') {
        logWindowManager.destroy();
      }
      document.removeEventListener('keydown', handleKeydown);
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        const detailModal = document.getElementById('datax-api-log-detail-modal');
        if (detailModal) {
          if (detailModal._wm && typeof detailModal._wm.destroy === 'function') {
            detailModal._wm.destroy();
          }
          detailModal.remove();
          return;
        }
        closeModal();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    document.getElementById('datax-api-log-btn-close').onclick = closeModal;
    modalEl.onclick = (e) => {
      if (e.target === modalEl) closeModal();
    };

    document.getElementById('datax-api-log-filter-status').onchange = (e) => {
      currentLogStatus = parseInt(e.target.value, 10) || 0;
      currentLogPage = 1;
      fetchAndRenderApiTaskLogs();
    };

    document.getElementById('datax-api-log-filter-type').onchange = (e) => {
      currentLogTriggerType = e.target.value || '';
      currentLogPage = 1;
      fetchAndRenderApiTaskLogs();
    };

    document.getElementById('datax-api-log-btn-refresh').onclick = () => {
      fetchAndRenderApiTaskLogs();
    };

    document.getElementById('datax-api-log-prev-page').onclick = () => {
      if (currentLogPage > 1) {
        currentLogPage--;
        fetchAndRenderApiTaskLogs();
      }
    };

    document.getElementById('datax-api-log-next-page').onclick = () => {
      currentLogPage++;
      fetchAndRenderApiTaskLogs();
    };

    const titleEl = document.getElementById('datax-api-log-title');
    if (titleEl) {
      titleEl.textContent = `任务执行历史记录 - 【${task.taskName}】`;
    }

    fetchAndRenderApiTaskLogs();
  }

  async function fetchAndRenderApiTaskLogs() {
    const logBody = document.getElementById('datax-api-log-body');
    const pageInfo = document.getElementById('datax-api-log-page-info');
    const curPageText = document.getElementById('datax-api-log-cur-page-text');
    const btnPrev = document.getElementById('datax-api-log-prev-page');
    const btnNext = document.getElementById('datax-api-log-next-page');

    if (!logBody || !currentLogTaskId) return;

    logBody.innerHTML = '<div style="text-align: center; color: #8c8c8c; padding: 60px 20px; font-size: 13px;">⏳ 正在读取执行历史记录...</div>';

    let url = `/api/apiTask/logList?taskId=${currentLogTaskId}&current=${currentLogPage}&size=${currentLogPageSize}`;
    if (currentLogStatus > 0) {
      url += `&logStatus=${currentLogStatus}`;
    }
    if (currentLogTriggerType) {
      url += `&triggerType=${encodeURIComponent(currentLogTriggerType)}`;
    }

    try {
      const res = await fetch(url, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!isApiSuccess(json) || !json.data) {
        logBody.innerHTML = `<div style="text-align: center; color: #f5222d; padding: 40px 20px; font-size: 13px;">❌ 加载历史记录失败: ${safeEscapeHtml(getApiMsg(json))}</div>`;
        return;
      }

      const { records, total, current, size } = json.data;
      const totalCount = total || 0;
      const totalPages = Math.ceil(totalCount / size) || 1;

      if (pageInfo) pageInfo.textContent = `共 ${totalCount} 条执行记录，每页 ${size} 条`;
      if (curPageText) curPageText.textContent = `第 ${current} / ${totalPages} 页`;
      if (btnPrev) {
        btnPrev.disabled = (current <= 1);
        btnPrev.style.opacity = (current <= 1) ? '0.5' : '1';
        btnPrev.style.cursor = (current <= 1) ? 'not-allowed' : 'pointer';
      }
      if (btnNext) {
        btnNext.disabled = (current >= totalPages);
        btnNext.style.opacity = (current >= totalPages) ? '0.5' : '1';
        btnNext.style.cursor = (current >= totalPages) ? 'not-allowed' : 'pointer';
      }

      if (!records || records.length === 0) {
        logBody.innerHTML = `
          <div style="text-align: center; color: #8c8c8c; padding: 80px 20px;">
            <div style="font-size: 38px; margin-bottom: 10px;">📭</div>
            <div style="font-size: 14px; font-weight: 600; color: #262626;">暂无该任务的执行历史记录</div>
            <div style="font-size: 12px; color: #8c8c8c; margin-top: 8px;">点击列表页【🚀 执行】或等待定时调度触发后将在此统一生成留痕记录</div>
          </div>
        `;
        return;
      }

      let tblHtml = `
        <div style="width: 100%; overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead>
              <tr style="background: #fafafa; border-bottom: 1px solid #f0f0f0; color: #262626; font-weight: 600; white-space: nowrap; position: sticky; top: 0; z-index: 2;">
                <th style="padding: 10px 12px; width: 75px; white-space: nowrap;">记录ID</th>
                <th style="padding: 10px 12px; width: 155px; white-space: nowrap;">触发时间</th>
                <th style="padding: 10px 12px; width: 85px; text-align: center; white-space: nowrap;">触发方式</th>
                <th style="padding: 10px 12px; width: 105px; text-align: center; white-space: nowrap;">执行状态</th>
                <th style="padding: 10px 12px; width: 85px; text-align: center; white-space: nowrap;">执行耗时</th>
                <th style="padding: 10px 12px; min-width: 260px;">执行信息 / 写入结果</th>
                <th style="padding: 10px 12px; width: 75px; text-align: center; white-space: nowrap;">操作</th>
              </tr>
            </thead>
            <tbody>
      `;

      records.forEach(r => {
        const isSuccess = r.status === 'SUCCESS';
        const isFail = r.status === 'FAIL';
        const isRunning = r.status === 'RUNNING';
        const isTimeout = r.status === 'TIMEOUT';

        let statusBadge = '';
        if (isSuccess) {
          statusBadge = `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap; background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; line-height: 18px;">🟢 成功</span>`;
        } else if (isFail) {
          statusBadge = `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap; background: #fff1f0; color: #f5222d; border: 1px solid #ffa39e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; line-height: 18px;">🔴 失败</span>`;
        } else if (isRunning) {
          statusBadge = `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; line-height: 18px;">⏳ 进行中</span>`;
        } else if (isTimeout) {
          statusBadge = `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap; background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; line-height: 18px;">⚠️ 未回调</span>`;
        } else {
          statusBadge = `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap; background: #fafafa; color: #8c8c8c; border: 1px solid #d9d9d9; padding: 2px 8px; border-radius: 4px; font-size: 11px; line-height: 18px;">⚪ ${safeEscapeHtml(r.statusDesc || r.status || '-')}</span>`;
        }

        const triggerTypeBadge = r.triggerType === 'MANUAL'
          ? `<span style="display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 1px 7px; border-radius: 4px; font-size: 11px; line-height: 18px;">🚀 手动</span>`
          : `<span style="display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; padding: 1px 7px; border-radius: 4px; font-size: 11px; line-height: 18px;">⏰ 定时</span>`;

        let rawMsg = r.handleMsg;
        if (!rawMsg) {
          if (isRunning) {
            rawMsg = '正在执行接口采集与入库中...';
          } else if (isTimeout) {
            rawMsg = '调度已触发，但未收到落库执行回调（历史调度残留或执行器异常）';
          } else {
            rawMsg = r.triggerMsg || '-';
          }
        }
        const cleanMsg = String(rawMsg).replace(/<br\s*[\/]?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
        const safeMsg = safeEscapeHtml(cleanMsg);
        const costDisp = r.costText ? `<span style="font-family: monospace; color: #595959;">${safeEscapeHtml(r.costText)}</span>` : '-';

        tblHtml += `
          <tr style="border-bottom: 1px solid #f0f0f0; transition: background 0.15s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
            <td style="padding: 9px 12px; color: #8c8c8c; font-family: monospace; white-space: nowrap;">#${r.id}</td>
            <td style="padding: 9px 12px; font-family: monospace; color: #595959; white-space: nowrap;">${safeEscapeHtml(r.triggerTime || '-')}</td>
            <td style="padding: 9px 12px; text-align: center; white-space: nowrap;">${triggerTypeBadge}</td>
            <td style="padding: 9px 12px; text-align: center; white-space: nowrap;">${statusBadge}</td>
            <td style="padding: 9px 12px; text-align: center; white-space: nowrap;">${costDisp}</td>
            <td style="padding: 9px 12px; word-break: break-all;">
              <div style="max-height: 42px; overflow: hidden; text-overflow: ellipsis; line-height: 1.45;" title="${safeMsg}">
                ${isFail ? `<strong style="color: #f5222d;">${safeMsg}</strong>` : (isTimeout ? `<span style="color: #d48806;">${safeMsg}</span>` : `<span style="color: #262626;">${safeMsg}</span>`)}
              </div>
            </td>
            <td style="padding: 9px 12px; text-align: center; white-space: nowrap;">
              <button class="datax-api-log-detail-btn" data-log-id="${r.id}" data-status="${r.status}" data-msg="${encodeURIComponent(cleanMsg)}" style="background: #fafafa; color: #1890ff; border: 1px solid #d9d9d9; padding: 3px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s;">🔍 日志</button>
            </td>
          </tr>
        `;
      });

      tblHtml += '</tbody></table></div>';
      logBody.innerHTML = tblHtml;

      // 绑定日志点击弹窗
      logBody.querySelectorAll('.datax-api-log-detail-btn').forEach(btn => {
        btn.onclick = () => {
          const logId = btn.getAttribute('data-log-id');
          const status = btn.getAttribute('data-status');
          const rawMsg = decodeURIComponent(btn.getAttribute('data-msg') || '');
          showApiLogDetailModal(logId, status, rawMsg);
        };
      });

    } catch (e) {
      logBody.innerHTML = `<div style="text-align: center; color: #f5222d; padding: 40px 20px; font-size: 13px;">❌ 加载异常: ${safeEscapeHtml(e.message)}</div>`;
    }
  }

  function showApiLogDetailModal(logId, status, fallbackMsg) {
    let detailModal = document.getElementById('datax-api-log-detail-modal');
    if (detailModal) {
      detailModal.remove();
    }

    const isRunning = (status === 'RUNNING');
    let pollTimer = null;
    let fromLineNum = 1;
    let autoScroll = true;

    detailModal = document.createElement('div');
    detailModal.id = 'datax-api-log-detail-modal';
    // 设为 1000040，确保处于历史流水列表 (1000025) 与主工作台 (999999) 之上
    detailModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.55); z-index: 1000040; backdrop-filter: blur(2px);';
    detailModal.innerHTML = `
      <!-- 统一风格窗口：深色控制台终端主题 (蓝色渐变头部 + 可拖拽 + 8 向缩放) -->
      <div id="datax-api-log-detail-dialog" style="background: #1e1e1e; border-radius: 8px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45); display: flex; flex-direction: column; overflow: hidden; position: absolute; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;">
        <div id="datax-api-log-detail-header" title="按住鼠标左键可自由拖动，双击最大化/还原" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; border-radius: 8px 8px 0 0; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <strong style="font-size: 14px;">接口任务运行日志控制台 - [#${logId}]</strong>
            <span id="datax-api-log-status-tag" style="background: ${isRunning ? '#52c41a' : '#595959'}; color: #fff; font-size: 11px; padding: 1px 8px; border-radius: 10px;">${isRunning ? '运行中 (动态轮询中)' : (status === 'SUCCESS' ? '已成功完成' : (status === 'FAIL' ? '执行失败' : '历史留痕'))}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span id="datax-api-log-detail-max" data-window-ctrl title="最大化 / 还原" style="font-size: 15px; line-height: 1; padding: 0 3px; cursor: pointer; opacity: 0.9;">&#x25A2;</span>
            <span id="datax-api-log-detail-close" data-window-ctrl title="关闭 (Esc)" style="font-size: 20px; line-height: 1; padding: 0 4px; cursor: pointer; opacity: 0.9;">&times;</span>
          </div>
        </div>
        <!-- 顶部工具控制栏 -->
        <div style="padding: 8px 16px; background: #2d2d2d; border-bottom: 1px solid #3d3d3d; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #d4d4d4; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="datax-api-log-autoscroll-chk" checked style="cursor: pointer;" />
              <span>自动跟随滚动</span>
            </label>
            <span id="datax-api-log-poll-hint" style="color: #8c8c8c; font-size: 11px;">${isRunning ? '⏳ 每 1.5 秒增量抓取' : '✅ 执行已结束'}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="datax-api-log-refresh-btn" data-window-ctrl style="background: #3a3a3a; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;">刷新</button>
            <button id="datax-api-log-clear-btn" data-window-ctrl style="background: #3a3a3a; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;">清屏</button>
            <button id="datax-api-log-copy-btn" data-window-ctrl style="background: #1890ff; color: #fff; border: 1px solid #1890ff; border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;">复制日志</button>
          </div>
        </div>
        <!-- 日志终端输出主视图 -->
        <div style="padding: 12px 16px; flex: 1; min-height: 0; display: flex; background: #1e1e1e;">
          <pre id="datax-api-log-detail-pre" style="width: 100%; height: 100%; font-family: Consolas, 'Fira Code', Monaco, 'Courier New', monospace; font-size: 12px; line-height: 1.55; padding: 12px 14px; border: 1px solid #333; border-radius: 4px; box-sizing: border-box; background: #141414; color: #d4d4d4; outline: none; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin: 0;">正在加载日志...</pre>
        </div>
        <div style="padding: 8px 16px; border-top: 1px solid #2d2d2d; background: #252525; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
          <button id="datax-api-log-detail-confirm" data-window-ctrl style="background: #3a3a3a; border: 1px solid #555; border-radius: 4px; padding: 5px 16px; font-size: 12px; color: #d4d4d4; cursor: pointer; transition: all 0.2s;">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(detailModal);

    // 初始尺寸与视口居中定位
    const detailDialog = detailModal.querySelector('#datax-api-log-detail-dialog');
    const initDetailW = Math.min(880, Math.max(620, window.innerWidth * 0.62));
    const initDetailH = Math.min(window.innerHeight * 0.78, 620);
    detailDialog.style.width = `${initDetailW}px`;
    detailDialog.style.height = `${initDetailH}px`;
    detailDialog.style.left = `${Math.max(10, Math.round((window.innerWidth - initDetailW) / 2))}px`;
    detailDialog.style.top = `${Math.max(10, Math.round((window.innerHeight - initDetailH) / 2))}px`;

    // 8 方向缩放手柄
    ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `datax-resize-handle datax-resize-${dir}`;
      handle.setAttribute('data-dir', dir);
      handle.title = (dir === 'se') ? '按住拖动调整窗口尺寸' : '调整窗口尺寸';
      detailDialog.appendChild(handle);
    });

    // 统一窗口交互管理器
    const detailWindowManager = new window.DataXAssistant.PanelWindowManager(
      detailDialog,
      detailModal.querySelector('#datax-api-log-detail-header'),
      {
        maxBtn: detailModal.querySelector('#datax-api-log-detail-max'),
        minWidth: 500,
        minHeight: 350,
        storageKeyPos: 'datax_api_log_detail_pos',
        storageKeySize: 'datax_api_log_detail_size'
      }
    );
    detailModal._wm = detailWindowManager;

    const preEl = document.getElementById('datax-api-log-detail-pre');
    const pollHintEl = document.getElementById('datax-api-log-poll-hint');
    const statusTagEl = document.getElementById('datax-api-log-status-tag');
    const chkAutoScroll = document.getElementById('datax-api-log-autoscroll-chk');

    chkAutoScroll.onchange = (e) => {
      autoScroll = e.target.checked;
    };

    // 监听用户向上翻页滚动，暂停贴底跟随
    preEl.addEventListener('scroll', () => {
      const isAtBottom = (preEl.scrollHeight - preEl.scrollTop <= preEl.clientHeight + 25);
      if (!isAtBottom && chkAutoScroll.checked) {
        chkAutoScroll.checked = false;
        autoScroll = false;
      }
    });

    const stopPolling = (finishText) => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (pollHintEl) {
        pollHintEl.textContent = '✅ ' + (finishText || '执行已完成');
      }
      if (statusTagEl && isRunning) {
        statusTagEl.style.background = '#595959';
        statusTagEl.textContent = '已完成';
      }
    };

    // 增量拉取日志分片
    async function fetchLogChunk() {
      if (!logId) return;
      try {
        const res = await fetch(`/api/apiTask/logDetailCat?logId=${logId}&fromLineNum=${fromLineNum}`, { headers: getAuthHeaders() });
        const json = await res.json();
        if (isApiSuccess(json) && json.data) {
          const { logContent, toLineNum, isEnd } = json.data;
          if (logContent && logContent.trim()) {
            if (fromLineNum === 1 && preEl.textContent === '正在加载日志...') {
              preEl.textContent = '';
            }
            preEl.textContent += logContent;
            fromLineNum = toLineNum + 1;
            if (autoScroll) {
              preEl.scrollTop = preEl.scrollHeight;
            }
          } else if (fromLineNum === 1 && (!logContent || !logContent.trim())) {
            preEl.textContent = fallbackMsg ? `[历史摘要留痕]\n${fallbackMsg}\n\n(提示: 该任务未生成物理控制台日志或已归档)` : '暂无详细日志内容';
          }

          if (isEnd) {
            stopPolling('执行已落幕');
          }
        }
      } catch (err) {
        console.warn('[ApiLogDetailCat] 轮询异常:', err);
      }
    }

    // 首次立即拉取
    fetchLogChunk();

    // 进行中的任务开启 1.5 秒动态增量轮询
    if (isRunning) {
      pollTimer = setInterval(fetchLogChunk, 1500);
    }

    const closeDetail = () => {
      stopPolling('窗口已关闭');
      detailModal.remove();
      if (detailWindowManager && typeof detailWindowManager.destroy === 'function') {
        detailWindowManager.destroy();
      }
    };

    document.getElementById('datax-api-log-detail-close').onclick = closeDetail;
    document.getElementById('datax-api-log-detail-confirm').onclick = closeDetail;
    detailModal.onclick = (e) => { if (e.target === detailModal) closeDetail(); };

    document.getElementById('datax-api-log-refresh-btn').onclick = () => {
      fetchLogChunk();
    };

    document.getElementById('datax-api-log-clear-btn').onclick = () => {
      preEl.textContent = '';
    };

    document.getElementById('datax-api-log-copy-btn').onclick = () => {
      copyTextToClipboard(preEl.textContent);
    };
  }

  window.DataXAssistant.Tabs.Tab7Class = Tab7ApiTask;

})();
