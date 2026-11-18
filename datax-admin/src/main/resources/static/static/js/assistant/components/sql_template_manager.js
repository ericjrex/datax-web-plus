/**
 * @fileoverview SQL 查询管理与模板库核心引擎 (SqlTemplateManager)
 * 支持自定义新增只读 SQL 模板、快捷选用填入、编辑、删除及账号强隔离存储。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  function alertMsg(msg) {
    if (window.DataXCommon && window.DataXCommon.Notice && window.DataXCommon.Notice.alert) {
      return window.DataXCommon.Notice.alert(msg);
    }
    window.alert(msg);
  }

  function confirmMsg(content, options = {}) {
    if (window.DataXCommon && window.DataXCommon.Notice && window.DataXCommon.Notice.confirm) {
      return window.DataXCommon.Notice.confirm(content, options);
    }
    return Promise.resolve(window.confirm(content));
  }

  function toastMsg(text, duration = 2500) {
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
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getAuthHeaders(customHeaders = {}) {
    if (window.DataXCommon && window.DataXCommon.Http && window.DataXCommon.Http.getAuthHeaders) {
      return window.DataXCommon.Http.getAuthHeaders(customHeaders);
    }
    return { 'Content-Type': 'application/json', ...customHeaders };
  }

  /**
   * 解析当前登录用户的账号身份信息 (账号强隔离基石)
   *
   * @return {{userId: number|null, username: string}}
   */
  function getCurrentUser() {
    let token = '';
    if (window.DataXCommon && window.DataXCommon.Http && typeof window.DataXCommon.Http.getAuthToken === 'function') {
      token = window.DataXCommon.Http.getAuthToken();
    }

    let username = '';
    let userId = null;

    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload && payload.sub) {
            const subParts = String(payload.sub).split(',');
            if (subParts.length >= 2) {
              userId = parseInt(subParts[0], 10) || null;
              username = subParts[1].trim();
            } else {
              username = subParts[0].trim();
            }
          }
        }
      } catch (e) {
        // Token 解析异常容错
      }
    }

    if (!username) {
      try {
        username = localStorage.getItem('datax_username') || sessionStorage.getItem('datax_username') || 'admin';
      } catch (e) {
        username = 'admin';
      }
    }

    return { userId, username };
  }

  const STORAGE_KEY_SETTING = 'custom_sql_queries';

  /**
   * 异步从服务端获取当前登录账号的 SQL 模板列表
   * 服务端接口 /api/user/setting 底层基于 JWT token 提取当前 userId，实现物理账号隔离
   *
   * @return {Promise<Array<Object>>}
   */
  async function loadUserSqlQueries() {
    const user = getCurrentUser();
    const localFallbackKey = `datax_sql_queries_${user.username || 'default'}`;

    try {
      const resp = await fetch(`/api/user/setting?key=${encodeURIComponent(STORAGE_KEY_SETTING)}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const res = await resp.json();
      if ((res.code === 200 || res.code === 0) && res.content) {
        let parsed = [];
        try {
          parsed = typeof res.content === 'string' ? JSON.parse(res.content) : res.content;
        } catch (e) {
          parsed = [];
        }
        if (Array.isArray(parsed)) {
          // 同步缓存至本账号本地存储
          try {
            localStorage.setItem(localFallbackKey, JSON.stringify(parsed));
          } catch (e) {}
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[SqlTemplateManager] 从远程读取 SQL 模板失败，启用本地账号缓存降级', e);
    }

    // 本地降级读取
    try {
      const cached = localStorage.getItem(localFallbackKey);
      if (cached) {
        const list = JSON.parse(cached);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {}

    return [];
  }

  /**
   * 持久化当前账号的 SQL 模板列表至服务端 (跨设备同步 + 账号物理隔离)
   *
   * @param {Array<Object>} queryList
   * @return {Promise<boolean>}
   */
  async function saveUserSqlQueries(queryList) {
    const user = getCurrentUser();
    const localFallbackKey = `datax_sql_queries_${user.username || 'default'}`;
    const valueStr = JSON.stringify(queryList || []);

    // 1. 本地立即存盘
    try {
      localStorage.setItem(localFallbackKey, valueStr);
    } catch (e) {}

    // 2. 异步调用后端 /api/user/setting 存盘 (自动绑定当前登录人 userId)
    try {
      const resp = await fetch('/api/user/setting', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          key: STORAGE_KEY_SETTING,
          value: valueStr
        })
      });
      const res = await resp.json();
      return Boolean(res.code === 200 || res.code === 0);
    } catch (e) {
      console.warn('[SqlTemplateManager] 远程保存 SQL 模板失败，已保留本地缓存', e);
      return false;
    }
  }

  /**
   * 校验待保存的 SQL 语句安全性 (只读安全校验)
   *
   * @param {string} sql
   * @return {{valid: boolean, message: string}}
   */
  function validateReadOnlySql(sql) {
    if (!sql || !sql.trim()) {
      return { valid: false, message: 'SQL 语句内容不能为空！' };
    }
    const clean = sql.trim().replace(/\/\*[\s\S]*?\*\/|--[^\r\n]*/g, '').trim();
    if (!clean) {
      return { valid: false, message: 'SQL 语句不能纯为注释！' };
    }
    const firstWord = clean.split(/\s+/)[0].toUpperCase();
    const allowed = ['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'DESC', 'DESCRIBE'];
    if (!allowed.includes(firstWord)) {
      return { valid: false, message: `安全拦截: 仅允许只读查询语句 (${allowed.join(' / ')})，禁止执行数据变更操作！` };
    }
    return { valid: true, message: '' };
  }

  /**
   * 赋予模态对话框标题栏拖拽移动能力，支持在视口内自由移动
   *
   * @param {HTMLElement} dialog 弹窗容器元素
   * @param {HTMLElement} header 标题栏把手元素
   * @return {Function} 销毁拖拽监听的清理函数
   */
  function enableModalDrag(dialog, header) {
    if (!dialog || !header) return () => {};
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e) => {
      if (e.target.closest('button, input, select, textarea, a')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      const maxLeft = Math.max(0, window.innerWidth - dialog.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - dialog.offsetHeight);
      newLeft = Math.max(0, Math.min(maxLeft, newLeft));
      newTop = Math.max(0, Math.min(maxTop, newTop));
      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
      dialog.style.right = 'auto';
      dialog.style.bottom = 'auto';
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    header.style.cursor = 'move';
    header.style.userSelect = 'none';
    header.addEventListener('mousedown', onMouseDown);

    return () => {
      header.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  /**
   * 打开【SQL 查询管理】全功能模态弹窗
   *
   * @param {Object} options 配置项
   * @param {Function} [options.onSelect] 选中模板并载入的回调 (sql, queryItem) => void
   * @param {string} [options.currentSql] 当前编辑器中的 SQL (用于一键新增时带入)
   * @param {string} [options.currentTable] 当前查看的数据表名 (用于一键新增时带入)
   * @param {number|string} [options.currentDatasourceId] 当前选中的数据源 ID
   * @param {Function} [options.onListChange] 模板列表变更回调 (list) => void
   */
  async function showSqlManageModal(options = {}) {
    const user = getCurrentUser();
    let queries = await loadUserSqlQueries();

    // 移除已存在的管理弹窗
    const existing = document.getElementById('datax-sql-manage-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'datax-sql-manage-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.45); z-index: 1000030; overflow: hidden; backdrop-filter: blur(2px); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;';

    modal.innerHTML = `
      <div class="datax-sql-manage-dialog" style="background: #ffffff; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); width: 880px; max-width: 95vw; height: 600px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; position: absolute; animation: dataxModalFadeIn 0.2s ease;">
        <!-- 弹窗头部 -->
        <div id="datax-sql-mgr-header" style="padding: 12px 18px; background: #fafafa; border-bottom: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center; user-select: none; cursor: move;">
          <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <strong style="font-size: 14px; color: #1f1f1f;">SQL 查询管理</strong>
            <span style="font-size: 11px; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 2px 8px; border-radius: 12px;">当前账号: <strong>${safeEscapeHtml(user.username || '当前用户')}</strong> (物理隔离)</span>
          </div>
          <button type="button" id="datax-sql-mgr-close-btn" style="background: transparent; border: none; font-size: 18px; color: #8c8c8c; cursor: pointer; padding: 2px 6px; line-height: 1;">&times;</button>
        </div>

        <!-- 顶部工具栏 (搜索与新增) -->
        <div style="padding: 10px 18px; background: #fbfbfb; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; gap: 8px; align-items: center; flex: 1; min-width: 260px;">
            <input type="text" id="datax-sql-mgr-search-input" placeholder="🔍 检索查询名称、关联表或 SQL 关键词..." style="flex: 1; padding: 5px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
            <button type="button" id="datax-sql-mgr-search-clear" style="background: #f0f2f5; color: #606266; border: 1px solid #d9d9d9; padding: 5px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">清空</button>
          </div>
          <button type="button" id="datax-sql-mgr-create-btn" style="background: #1890ff; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(24,144,255,0.25);">
            ➕ 新增 SQL 查询
          </button>
        </div>

        <!-- 列表容器 -->
        <div id="datax-sql-mgr-list-container" style="flex: 1; overflow-y: auto; padding: 12px 18px; background: #ffffff;">
          <div style="padding: 40px; text-align: center; color: #909399; font-size: 13px;">加载中...</div>
        </div>

        <!-- 弹窗底部 -->
        <div style="padding: 10px 18px; background: #fafafa; border-top: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #8c8c8c;">
          <div id="datax-sql-mgr-count-stat">共 0 条自定义 SQL 查询</div>
          <button type="button" id="datax-sql-mgr-bottom-close" style="background: #ffffff; border: 1px solid #d9d9d9; color: #595959; padding: 5px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const dialog = modal.querySelector('.datax-sql-manage-dialog');
    const initW = Math.min(880, window.innerWidth - 30);
    const initH = Math.min(600, window.innerHeight - 30);
    dialog.style.width = `${initW}px`;
    dialog.style.height = `${initH}px`;
    dialog.style.left = `${Math.max(15, Math.round((window.innerWidth - initW) / 2))}px`;
    dialog.style.top = `${Math.max(15, Math.round((window.innerHeight - initH) / 2))}px`;

    const mgrHeader = modal.querySelector('#datax-sql-mgr-header');
    const destroyDrag = enableModalDrag(dialog, mgrHeader);

    const listContainer = modal.querySelector('#datax-sql-mgr-list-container');
    const searchInput = modal.querySelector('#datax-sql-mgr-search-input');
    const searchClear = modal.querySelector('#datax-sql-mgr-search-clear');
    const createBtn = modal.querySelector('#datax-sql-mgr-create-btn');
    const closeBtn = modal.querySelector('#datax-sql-mgr-close-btn');
    const bottomClose = modal.querySelector('#datax-sql-mgr-bottom-close');
    const countStat = modal.querySelector('#datax-sql-mgr-count-stat');

    const closeModal = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (typeof destroyDrag === 'function') destroyDrag();
      modal.remove();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);

    modal.onmousedown = (e) => {
      if (e.target === modal) closeModal();
    };

    closeBtn.onclick = closeModal;
    bottomClose.onclick = closeModal;

    // 渲染模板列表
    function renderList(keyword = '') {
      const kw = (keyword || '').trim().toLowerCase();
      const filtered = queries.filter(q => {
        if (!kw) return true;
        return (q.name && q.name.toLowerCase().includes(kw)) ||
               (q.tableName && q.tableName.toLowerCase().includes(kw)) ||
               (q.description && q.description.toLowerCase().includes(kw)) ||
               (q.sql && q.sql.toLowerCase().includes(kw));
      });

      countStat.textContent = `当前账号共 ${queries.length} 条已保存查询${kw ? ` (检索到 ${filtered.length} 条)` : ''}`;

      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div style="padding: 60px 20px; text-align: center; color: #8c8c8c;">
            <div style="font-size: 28px; margin-bottom: 8px;">📋</div>
            <div style="font-weight: bold; margin-bottom: 4px; color: #595959;">${kw ? '未检索到匹配的 SQL 查询' : '当前账号暂无保存的自定义 SQL 查询'}</div>
            <div style="font-size: 12px; color: #bfbfbf;">${kw ? '请更换关键词重试' : '点击右上角【➕ 新增 SQL 查询】或在控制台点击【保存当前 SQL】进行收藏'}</div>
          </div>
        `;
        return;
      }

      let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">
          <thead>
            <tr style="background: #fafafa; border-bottom: 2px solid #e8e8e8; color: #595959; text-align: left;">
              <th style="padding: 8px 10px; width: 40px; text-align: center;">#</th>
              <th style="padding: 8px 10px; width: 170px;">查询名称 / 关联表</th>
              <th style="padding: 8px 10px;">SQL 语句预览</th>
              <th style="padding: 8px 10px; width: 130px;">更新时间</th>
              <th style="padding: 8px 10px; width: 150px; text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody>
      `;

      filtered.forEach((item, idx) => {
        const rowBg = idx % 2 === 1 ? '#fafcff' : '#ffffff';
        const displaySql = item.sql ? item.sql.replace(/\s+/g, ' ').trim() : '';
        const shortSql = displaySql.length > 90 ? displaySql.substring(0, 87) + '...' : displaySql;
        const targetDesc = item.tableName ? `<span style="font-size: 11px; color: #8c8c8c; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="关联表: ${safeEscapeHtml(item.tableName)}">📊 ${safeEscapeHtml(item.tableName)}</span>` : '';

        html += `
          <tr style="background: ${rowBg}; border-bottom: 1px solid #f0f0f0; transition: background 0.15s ease;" onmouseenter="this.style.background='#f0f7ff'" onmouseleave="this.style.background='${rowBg}'">
            <td style="padding: 8px 10px; text-align: center; color: #8c8c8c;">${idx + 1}</td>
            <td style="padding: 8px 10px; word-break: break-all;">
              <strong style="color: #1890ff; font-size: 12px; display: block;" title="${safeEscapeHtml(item.description || item.name)}">${safeEscapeHtml(item.name)}</strong>
              ${targetDesc}
            </td>
            <td style="padding: 8px 10px;">
              <div style="font-family: Consolas, Monaco, monospace; font-size: 11px; color: #262626; background: #fdfdfd; padding: 4px 6px; border: 1px solid #e8e8e8; border-radius: 3px; max-height: 48px; overflow: hidden; text-overflow: ellipsis; white-space: pre-wrap; line-height: 1.3;" title="${safeEscapeHtml(item.sql)}">${safeEscapeHtml(shortSql)}</div>
            </td>
            <td style="padding: 8px 10px; color: #8c8c8c; font-size: 11px; white-space: nowrap;">${safeEscapeHtml(item.updateTime || item.createTime || '-')}</td>
            <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
              <button type="button" class="datax-sql-action-select" data-id="${item.id}" style="background: #1890ff; color: #fff; border: none; padding: 3px 8px; border-radius: 3px; font-size: 11px; cursor: pointer; margin-right: 4px;" title="将此 SQL 填入当前编辑器">选用</button>
              <button type="button" class="datax-sql-action-edit" data-id="${item.id}" style="background: #f0f2f5; color: #606266; border: 1px solid #d9d9d9; padding: 3px 6px; border-radius: 3px; font-size: 11px; cursor: pointer; margin-right: 4px;" title="修改名称、备注或 SQL">✏️</button>
              <button type="button" class="datax-sql-action-delete" data-id="${item.id}" style="background: #fff1f0; color: #ff4d4f; border: 1px solid #ffa39e; padding: 3px 6px; border-radius: 3px; font-size: 11px; cursor: pointer;" title="删除此条 SQL 模板">🗑️</button>
            </td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      listContainer.innerHTML = html;

      // 绑定操作按钮
      listContainer.querySelectorAll('.datax-sql-action-select').forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-id');
          const target = queries.find(q => String(q.id) === String(id));
          if (target && typeof options.onSelect === 'function') {
            options.onSelect(target.sql, target);
            toastMsg(`✨ 已选用 SQL: [${target.name}]`);
            closeModal();
          }
        };
      });

      listContainer.querySelectorAll('.datax-sql-action-edit').forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-id');
          const target = queries.find(q => String(q.id) === String(id));
          if (target) {
            showSqlEditModal({
              item: target,
              onSave: async (updated) => {
                const targetIdx = queries.findIndex(q => String(q.id) === String(id));
                if (targetIdx !== -1) {
                  queries[targetIdx] = { ...queries[targetIdx], ...updated, updateTime: new Date().toLocaleString() };
                  await saveUserSqlQueries(queries);
                  renderList(searchInput.value);
                  options.onListChange?.(queries);
                  toastMsg('✏️ SQL 查询修改已成功保存');
                }
              }
            });
          }
        };
      });

      listContainer.querySelectorAll('.datax-sql-action-delete').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-id');
          const target = queries.find(q => String(q.id) === String(id));
          if (!target) return;
          const ok = await confirmMsg(`确定要删除自定义 SQL 查询 [${target.name}] 吗？此操作不可逆。`);
          if (ok) {
            queries = queries.filter(q => String(q.id) !== String(id));
            await saveUserSqlQueries(queries);
            renderList(searchInput.value);
            options.onListChange?.(queries);
            toastMsg('🗑️ 已成功删除该 SQL 查询');
          }
        };
      });
    }

    // 搜索监听
    searchInput.oninput = () => renderList(searchInput.value);
    searchClear.onclick = () => {
      searchInput.value = '';
      renderList('');
    };

    // 新增按钮
    createBtn.onclick = () => {
      showSqlEditModal({
        defaultSql: options.currentSql || '',
        defaultTable: options.currentTable || '',
        datasourceId: options.currentDatasourceId || '',
        onSave: async (newRecord) => {
          const newItem = {
            id: 'sql_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            ...newRecord,
            createTime: new Date().toLocaleString(),
            updateTime: new Date().toLocaleString()
          };
          queries.unshift(newItem);
          await saveUserSqlQueries(queries);
          renderList(searchInput.value);
          options.onListChange?.(queries);
          toastMsg(`➕ 成功新增 SQL 查询: [${newItem.name}]`);
        }
      });
    };

    renderList();
  }

  /**
   * 弹出新建/编辑 SQL 查询表单模态框
   *
   * @param {Object} options 配置项
   * @param {Object} [options.item] 待编辑的现有项
   * @param {string} [options.defaultSql] 新增时默认带入的 SQL
   * @param {string} [options.defaultTable] 新增时默认带入的表名
   * @param {string|number} [options.datasourceId] 数据源 ID
   * @param {Function} options.onSave 保存回调 (record) => Promise<void>
   */
  function showSqlEditModal(options = {}) {
    const isEdit = Boolean(options.item);
    const item = options.item || {};

    const editModal = document.createElement('div');
    editModal.id = 'datax-sql-edit-modal';
    editModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 1000050; overflow: hidden; backdrop-filter: blur(2px); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;';

    editModal.innerHTML = `
      <div class="datax-sql-edit-dialog" style="background: #ffffff; border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,0.3); width: 680px; max-width: 92vw; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; position: absolute; animation: dataxModalFadeIn 0.2s ease;">
        <div id="datax-sql-form-header" style="padding: 12px 18px; background: #fafafa; border-bottom: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center; user-select: none; cursor: move;">
          <strong style="font-size: 14px; color: #1f1f1f; pointer-events: none;">${isEdit ? '✏️ 修改自定义 SQL 查询' : '➕ 新增自定义 SQL 查询'}</strong>
          <button type="button" id="datax-sql-form-close-btn" style="background: transparent; border: none; font-size: 18px; color: #8c8c8c; cursor: pointer; padding: 2px 6px; line-height: 1;">&times;</button>
        </div>

        <div style="padding: 16px 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: bold; color: #262626; margin-bottom: 4px;">
              查询名称 <span style="color: #ff4d4f;">*</span>
            </label>
            <input type="text" id="datax-sql-form-name" placeholder="例如: 司机驾驶区域统计日增量报表" value="${safeEscapeHtml(item.name || '')}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
          </div>

          <div style="display: flex; gap: 12px;">
            <div style="flex: 1;">
              <label style="display: block; font-size: 12px; font-weight: bold; color: #262626; margin-bottom: 4px;">关联数据表 (选填)</label>
              <input type="text" id="datax-sql-form-table" placeholder="例如: dws_oasystem_driver_drive_region_di" value="${safeEscapeHtml(item.tableName || options.defaultTable || '')}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
            </div>
            <div style="flex: 1;">
              <label style="display: block; font-size: 12px; font-weight: bold; color: #262626; margin-bottom: 4px;">业务描述 / 备注 (选填)</label>
              <input type="text" id="datax-sql-form-desc" placeholder="例如: 用于每日对账与驾驶员行驶区域统计核验" value="${safeEscapeHtml(item.description || '')}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-size: 12px; font-weight: bold; color: #262626;">
                SQL 语句内容 <span style="color: #ff4d4f;">*</span>
              </label>
              <span style="font-size: 11px; color: #52c41a; background: #f6ffed; border: 1px solid #b7eb8f; padding: 1px 6px; border-radius: 3px;">只读模式 (仅限 SELECT / WITH / EXPLAIN)</span>
            </div>
            <textarea id="datax-sql-form-sql" placeholder="请输入 SELECT 语句..." style="width: 100%; height: 180px; box-sizing: border-box; padding: 10px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fdfdfd; line-height: 1.45; resize: vertical; outline: none;">${safeEscapeHtml(item.sql || options.defaultSql || '')}</textarea>
          </div>
        </div>

        <div style="padding: 12px 20px; background: #fafafa; border-top: 1px solid #e8e8e8; display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" id="datax-sql-form-cancel" style="background: #ffffff; border: 1px solid #d9d9d9; color: #606266; padding: 5px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">取消</button>
          <button type="button" id="datax-sql-form-submit" style="background: #1890ff; border: none; color: #ffffff; padding: 5px 20px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(24,144,255,0.25);">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(editModal);

    const dialog = editModal.querySelector('.datax-sql-edit-dialog');
    const initW = Math.min(680, window.innerWidth - 30);
    const initH = Math.min(580, window.innerHeight - 30);
    dialog.style.width = `${initW}px`;
    dialog.style.left = `${Math.max(15, Math.round((window.innerWidth - initW) / 2))}px`;
    dialog.style.top = `${Math.max(15, Math.round((window.innerHeight - initH) / 2))}px`;

    const formHeader = editModal.querySelector('#datax-sql-form-header');
    const destroyDrag = enableModalDrag(dialog, formHeader);

    const closeForm = () => {
      window.removeEventListener('keydown', onFormKeyDown, true);
      if (typeof destroyDrag === 'function') destroyDrag();
      editModal.remove();
    };

    const onFormKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeForm();
      }
    };
    window.addEventListener('keydown', onFormKeyDown, true);

    editModal.onmousedown = (e) => {
      if (e.target === editModal) closeForm();
    };

    editModal.querySelector('#datax-sql-form-close-btn').onclick = closeForm;
    editModal.querySelector('#datax-sql-form-cancel').onclick = closeForm;

    editModal.querySelector('#datax-sql-form-submit').onclick = async () => {
      const name = (editModal.querySelector('#datax-sql-form-name').value || '').trim();
      const tableName = (editModal.querySelector('#datax-sql-form-table').value || '').trim();
      const description = (editModal.querySelector('#datax-sql-form-desc').value || '').trim();
      const sql = (editModal.querySelector('#datax-sql-form-sql').value || '').trim();

      if (!name) {
        alertMsg('请输入查询名称！');
        editModal.querySelector('#datax-sql-form-name').focus();
        return;
      }

      const check = validateReadOnlySql(sql);
      if (!check.valid) {
        alertMsg(check.message);
        editModal.querySelector('#datax-sql-form-sql').focus();
        return;
      }

      const record = {
        name,
        tableName,
        description,
        sql,
        datasourceId: options.datasourceId || item.datasourceId || ''
      };

      if (typeof options.onSave === 'function') {
        await options.onSave(record);
      }
      closeForm();
    };
  }

  /**
   * 一键为目标 SQL 控制台操作栏装配【SQL 查询管理】与【常用 SQL 选用】组件（公共集成方法）
   *
   * @param {Object} options 配置项
   * @param {HTMLElement} options.toolbarContainer 操作栏容器
   * @param {HTMLTextAreaElement|string} options.textarea 绑定的 SQL 文本输入域或其元素 ID
   * @param {Function} [options.getDatasourceId] 获取当前数据源 ID 的回调函数
   * @param {Function} [options.getTableName] 获取当前表名的回调函数
   * @param {Function} [options.onSelect] 选中模板后的额外回调 (sql) => void
   */
  async function bindSqlToolbar(options = {}) {
    const { toolbarContainer, textarea, getDatasourceId, getTableName, onSelect } = options;
    if (!toolbarContainer) return;

    const getTextareaEl = () => {
      if (typeof textarea === 'string') return document.getElementById(textarea);
      return textarea;
    };

    // 检查是否已初始化，避免重复注入
    let wrapper = toolbarContainer.querySelector('.datax-sql-template-toolbar-wrap');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'datax-sql-template-toolbar-wrap';
      wrapper.style.cssText = 'display: inline-flex; align-items: center; gap: 6px;';
      toolbarContainer.prepend(wrapper);
    }

    // 异步加载当前账号下的 SQL 模板
    const queries = await loadUserSqlQueries();

    // 渲染下拉框与管理按钮
    wrapper.innerHTML = `
      <select class="datax-sql-tpl-select" style="padding: 4px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; background: #ffffff; color: #262626; max-width: 170px; cursor: pointer; outline: none;" title="快速选用已保存的 SQL 查询模板">
        <option value="">-- 常用 SQL 查询 (${queries.length}) --</option>
        ${queries.map((q, idx) => `<option value="${safeEscapeHtml(q.id)}">${idx + 1}. ${safeEscapeHtml(q.name)}</option>`).join('')}
      </select>
      <button type="button" class="datax-sql-tpl-save-btn" style="background: #52c41a; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;" title="将当前编辑框中的 SQL 保存为模板 (账号隔离)">
        保存当前 SQL
      </button>
      <button type="button" class="datax-sql-tpl-manage-btn" style="background: #722ed1; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;" title="打开 SQL 查询管理窗口">
        SQL 管理
      </button>
    `;

    const selectEl = wrapper.querySelector('.datax-sql-tpl-select');
    const saveBtn = wrapper.querySelector('.datax-sql-tpl-save-btn');
    const manageBtn = wrapper.querySelector('.datax-sql-tpl-manage-btn');

    // 下拉选中立即填入
    selectEl.onchange = function () {
      const qId = this.value;
      if (!qId) return;
      const target = queries.find(q => String(q.id) === String(qId));
      const ta = getTextareaEl();
      if (target && ta) {
        ta.value = target.sql;
        toastMsg(`✨ 已载入 SQL 模板: [${target.name}]`);
        onSelect?.(target.sql, target);
      }
      this.value = '';
    };

    // 保存当前 SQL 为新模板
    saveBtn.onclick = () => {
      const ta = getTextareaEl();
      const currentSql = ta ? (ta.value || '').trim() : '';
      if (!currentSql) {
        alertMsg('当前 SQL 输入框为空，请先编写需要保存的 SQL 语句！');
        ta?.focus();
        return;
      }
      const check = validateReadOnlySql(currentSql);
      if (!check.valid) {
        alertMsg(check.message);
        ta?.focus();
        return;
      }

      const currentTable = typeof getTableName === 'function' ? getTableName() : '';
      const currentDsId = typeof getDatasourceId === 'function' ? getDatasourceId() : '';

      showSqlEditModal({
        defaultSql: currentSql,
        defaultTable: currentTable,
        datasourceId: currentDsId,
        onSave: async (newRecord) => {
          const list = await loadUserSqlQueries();
          const newItem = {
            id: 'sql_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            ...newRecord,
            createTime: new Date().toLocaleString(),
            updateTime: new Date().toLocaleString()
          };
          list.unshift(newItem);
          await saveUserSqlQueries(list);
          toastMsg(`➕ 成功保存 SQL 查询: [${newItem.name}]`);
          bindSqlToolbar(options); // 刷新下拉框
        }
      });
    };

    // 打开全功能管理模态窗
    manageBtn.onclick = () => {
      const ta = getTextareaEl();
      showSqlManageModal({
        currentSql: ta ? ta.value : '',
        currentTable: typeof getTableName === 'function' ? getTableName() : '',
        currentDatasourceId: typeof getDatasourceId === 'function' ? getDatasourceId() : '',
        onSelect: (sql, target) => {
          const taEl = getTextareaEl();
          if (taEl) {
            taEl.value = sql;
            onSelect?.(sql, target);
          }
        },
        onListChange: () => {
          bindSqlToolbar(options); // 列表变动后刷新下拉框候选项
        }
      });
    };
  }

  // 挂载核心引擎
  window.DataXAssistant.SqlTemplateManager = {
    getCurrentUser,
    loadUserSqlQueries,
    saveUserSqlQueries,
    validateReadOnlySql,
    showSqlManageModal,
    showSqlEditModal,
    bindSqlToolbar
  };

})();
