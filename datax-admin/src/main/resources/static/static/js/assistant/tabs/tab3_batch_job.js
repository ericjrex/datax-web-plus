/**
 * @fileoverview Tab 3: 任务批量操作与查询调度 (Tab3BatchJob)
 * 提供任务检索、批量启停/执行/删除、增量配置、配置比对、模式漂移审计与同步策略配置。
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

  /**
   * 兼容历史别名的统一模态确认对话框代理 (公共方法)
   *
   * @param {string|Error} content 确认提示内容
   * @param {Object} [options] 配置选项 (title, type, confirmText, cancelText 等)
   * @return {Promise<boolean>} 用户确认结果 Promise
   */
  function showDataxConfirm(content, options = {}) {
    return confirm(content, options);
  }

  /**
   * 兼容历史别名的统一通知提示代理 (公共方法，支持 toast 轻量浮动与 modal 阻断通知)
   *
   * @param {string|Error} content 提示内容
   * @param {Object} [options] 配置选项 (type, mode: 'toast', title 等)
   * @return {Promise<any>}
   */
  function showDataxNotice(content, options = {}) {
    if (options && options.mode === 'toast') {
      toast(content, options.duration || 2500);
      return Promise.resolve();
    }
    if (window.DataXCommon && window.DataXCommon.Notice && typeof window.DataXCommon.Notice.show === 'function') {
      return window.DataXCommon.Notice.show(content, options);
    }
    return Promise.resolve(alert(content));
  }

  /**
   * 动态加载 SheetJS 导出库 (公共方法，多级降级安全调度)
   *
   * @param {Function} callback 加载完成回调 (XLSX) => void
   */
  function loadSheetJs(callback) {
    if (window.DataXCommon && window.DataXCommon.Utils && typeof window.DataXCommon.Utils.loadSheetJs === 'function') {
      return window.DataXCommon.Utils.loadSheetJs(callback);
    }
    if (window.DataXAssistant && typeof window.DataXAssistant.loadSheetJs === 'function' && window.DataXAssistant.loadSheetJs !== loadSheetJs) {
      return window.DataXAssistant.loadSheetJs(callback);
    }
    if (window.XLSX) {
      return callback(window.XLSX);
    }
    const cdnUrls = [
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
    return res && (res.msg || res.message) ? (res.msg || res.message) : defaultMsg;
  }

  function getStorageItem(key, defaultValue) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  function setStorageItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function showDdlModal(title, ddl) {
    if (window.DataXAssistant && window.DataXAssistant.DomBuilder && typeof window.DataXAssistant.DomBuilder.showDdlModal === 'function') {
      return window.DataXAssistant.DomBuilder.showDdlModal(title, ddl);
    }
    if (window.DataXAssistant && typeof window.DataXAssistant.showDdlModal === 'function' && window.DataXAssistant.showDdlModal !== showDdlModal) {
      return window.DataXAssistant.showDdlModal(title, ddl);
    }
    alert(ddl);
  }


  // 14. Tab 3: 任务批量查询与启动核心逻辑
  // ==========================================
  let currentLoadedJobs = [];
  let cachedProjectList = [];

  /**
   * 异步获取系统所属项目列表并填充下拉框
   */
  async function loadProjectOptions() {
    const sel = document.getElementById('datax-job-search-project');
    if (!sel) return;

    try {
      const resp = await fetch('/api/jobProject/list', { method: 'GET', headers: getAuthHeaders() });
      const res = await resp.json();
      if ((res.code === 200 || res.code === 0) && Array.isArray(res.data)) {
        cachedProjectList = res.data;
      }
    } catch (e) {
      console.warn('获取项目列表异常:', e);
    }

    const curVal = sel.value;
    sel.innerHTML = '<option value="">📁 全部所属项目</option>';
    cachedProjectList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name ? `📁 ${p.name}` : `📁 项目 ${p.id}`;
      sel.appendChild(opt);
    });
    if (curVal) sel.value = curVal;
  }

  function updateJobCount() {
    const totalEl = document.getElementById('datax-job-total-count');
    const selectedEl = document.getElementById('datax-job-selected-count');
    const cbs = document.querySelectorAll('.datax-job-item-cb');
    const checkedCbs = document.querySelectorAll('.datax-job-item-cb:checked');

    if (totalEl) totalEl.textContent = String(cbs.length);
    if (selectedEl) selectedEl.textContent = String(checkedCbs.length);

    const headCb = document.getElementById('datax-job-check-all');
    if (headCb) {
      headCb.checked = cbs.length > 0 && cbs.length === checkedCbs.length;
    }
  }

  function getSelectedJobIds() {
    const checked = document.querySelectorAll('.datax-job-item-cb:checked');
    const ids = [];
    checked.forEach(cb => {
      const val = parseInt(cb.value, 10);
      if (!isNaN(val)) ids.push(val);
    });
    return ids;
  }

  async function queryJobList() {
    const descKeyword = (document.getElementById('datax-job-search-desc').value || '').trim();
    const statusVal = parseInt(document.getElementById('datax-job-search-status').value, 10);
    const projectSel = document.getElementById('datax-job-search-project');
    const projectVal = (projectSel ? projectSel.value : '').trim();
    const container = document.getElementById('datax-job-list-container');
    container.innerHTML = '<div style="padding: 24px; text-align: center; color: #1890ff; font-size: 12px;">⏳ 正在查询任务列表...</div>';

    try {
      let jobs = [];
      const queryParams = new URLSearchParams({
        current: '1',
        size: '500',
        jobGroup: '0',
        triggerStatus: String(statusVal),
        jobDesc: descKeyword,
        glueType: ''
      });
      if (projectVal) {
        queryParams.append('projectIds', projectVal);
      }

      const resp = await fetch(`/api/job/pageList?${queryParams.toString()}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const res = await resp.json();

      if (res.code === 200 && res.content && Array.isArray(res.content.data)) {
        jobs = res.content.data;
      } else {
        // 兜底全量接口
        const resp2 = await fetch('/api/job/list', { method: 'GET', headers: getAuthHeaders() });
        const res2 = await resp2.json();
        if (res2.code === 200 && Array.isArray(res2.content)) {
          jobs = res2.content;
          if (statusVal !== -1) jobs = jobs.filter(j => j.triggerStatus === statusVal);
          if (descKeyword) jobs = jobs.filter(j => (j.jobDesc || '').toLowerCase().includes(descKeyword.toLowerCase()));
          if (projectVal) {
            const pId = parseInt(projectVal, 10);
            jobs = jobs.filter(j => j.projectId === pId);
          }
        }
      }

      currentLoadedJobs = jobs;
      renderJobTable(currentLoadedJobs);
    } catch (e) {
      container.innerHTML = `<div style="padding: 24px; text-align: center; color: #ff4d4f; font-size: 12px;">查询失败: ${e.message}</div>`;
    }
  }

  /**
   * 生成任务状态徽章 HTML（严格单行不换行，保障自适应时不折行挤压）
   *
   * @param {boolean} isRunning 是否运行中
   * @return {string} 状态徽章 HTML
   */
  function getJobStatusBadge(isRunning) {
    return isRunning
      ? '<span style="color: #52c41a; font-weight: bold; background: #f6ffed; border: 1px solid #b7eb8f; padding: 2px 6px; border-radius: 4px; display: inline-block; white-space: nowrap; font-size: 11px; line-height: 1.3;">🟢 运行中</span>'
      : '<span style="color: #8c8c8c; background: #fafafa; border: 1px solid #d9d9d9; padding: 2px 6px; border-radius: 4px; display: inline-block; white-space: nowrap; font-size: 11px; line-height: 1.3;">⚪ 已停止</span>';
  }

  /**
   * 判定当前用户是否处于有效文本选区状态 (用于阻止选文字后释放鼠标触发整行点击)
   *
   * @return {boolean} 是否存在非空的文本选区
   */
  function isUserSelectingText() {
    const sel = window.getSelection ? window.getSelection() : null;
    return Boolean(sel && sel.toString().trim().length > 0);
  }

  // 记录各列表框选引擎实例，便于在重新渲染时安全注销旧监听器
  let currentJobMarquee = null;
  let currentDvMarquee = null;

  /**
   * 通用表格鼠标拖拽矩形框选引擎 (Universal Marquee Selection Engine)
   * 采用 AABB (Axis-Aligned Bounding Box) 空间碰撞检测算法，
   * 支持边缘感应平滑自动滚动 (Edge Auto-Scroll)、滚轮实时穿透及 Shift/Ctrl 复合操作。
   *
   * @param {Object} options 配置项
   * @param {HTMLElement} options.container 滚动容器 DOM 元素
   * @param {string} options.rowSelector 表格数据行选择器 (例如 '.datax-job-table-row')
   * @param {string} [options.checkboxSelector] 行复选框选择器 (可选，例如 '.datax-job-item-cb')
   * @return {Object} 框选引擎实例
   */
  function bindMarqueeSelection(options) {
    if (window.DataXAssistant && typeof window.DataXAssistant.bindMarqueeSelection === 'function') {
      return window.DataXAssistant.bindMarqueeSelection(options);
    }
    if (window.DataXAssistant && window.DataXAssistant.MarqueeSelector) {
      if (typeof window.DataXAssistant.MarqueeSelector.bindMarqueeSelection === 'function') {
        return window.DataXAssistant.MarqueeSelector.bindMarqueeSelection(options);
      }
      return new window.DataXAssistant.MarqueeSelector(options);
    }
    return {
      cleanup: () => {},
      destroy: () => {},
      syncRowHighlight: () => {},
      getSelectedSet: () => options.selectedSet || new Set()
    };
  }



  function renderJobTable(jobs) {
    const container = document.getElementById('datax-job-list-container');
    if (!jobs || jobs.length === 0) {
      if (currentJobMarquee && typeof currentJobMarquee.cleanup === 'function') {
        currentJobMarquee.cleanup();
        currentJobMarquee = null;
      }
      container.innerHTML = '<div style="padding: 24px; text-align: center; color: #909399; font-size: 12px;">未查询到匹配的任务</div>';
      updateJobCount();
      return;
    }

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
    html += `
      <thead>
        <tr style="background: #fafafa; border-bottom: 1px solid #e8e8e8; color: #595959; text-align: left;">
          <th style="padding: 7px 8px; width: 30px; text-align: center;"><input type="checkbox" id="datax-job-check-head" /></th>
          <th style="padding: 7px 8px; width: 45px;">ID</th>
          <th style="padding: 7px 8px;">任务描述 / 表名</th>
          <th style="padding: 7px 8px; width: 85px; min-width: 85px; text-align: center; white-space: nowrap;">状态</th>
          <th style="padding: 7px 8px; width: 140px; min-width: 140px; text-align: center; white-space: nowrap;">操作</th>
        </tr>
      </thead>
      <tbody>
    `;

    jobs.forEach(job => {
      const isRunning = job.triggerStatus === 1;
      const statusBadge = getJobStatusBadge(isRunning);

      const projectBadge = job.projectName
        ? `<span style="display:inline-block;background:#f0f5ff;border:1px solid #adc6ff;color:#2f54eb;font-size:10px;padding:0 4px;border-radius:2px;margin-right:5px;white-space:nowrap;" title="所属项目: ${job.projectName}">📁 ${job.projectName}</span>`
        : '';

      html += `
        <tr style="border-bottom: 1px solid #f0f0f0; transition: background 0.15s ease;" id="datax-job-row-${job.id}" class="datax-job-table-row" data-job-id="${job.id}">
          <td style="padding: 7px 8px; text-align: center;"><input type="checkbox" class="datax-job-item-cb" value="${job.id}" /></td>
          <td style="padding: 7px 8px; color: #888;">${job.id}</td>
          <td style="padding: 7px 8px; font-weight: 500; word-break: break-all;">${projectBadge}${job.jobDesc || '未命名任务'}</td>
          <td style="padding: 7px 8px; text-align: center; white-space: nowrap;" id="datax-job-status-cell-${job.id}">${statusBadge}</td>
          <td style="padding: 7px 8px; text-align: center; white-space: nowrap;">
            <a href="javascript:;" class="datax-job-single-action" data-action="${isRunning ? 'stop' : 'start'}" data-id="${job.id}" style="color: ${isRunning ? '#ff4d4f' : '#1890ff'}; margin-right: 6px; text-decoration: none;">
              ${isRunning ? '停止' : '开启'}
            </a>
            <a href="javascript:;" class="datax-job-single-action" data-action="trigger" data-id="${job.id}" style="color: #fa8c16; margin-right: 6px; text-decoration: none;">
              执行
            </a>
            <a href="javascript:;" class="datax-job-single-action" data-action="copy" data-id="${job.id}" style="color: #722ed1; margin-right: 6px; text-decoration: none;" title="复制此任务（复用加密配置，无需再次加密）">
              复制
            </a>
            <a href="javascript:;" class="datax-job-single-action" data-action="remove" data-id="${job.id}" style="color: #ff4d4f; text-decoration: none;" title="删除此任务">
              删除
            </a>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // 清理先前的框选监听器，避免重复绑定内存泄漏
    if (currentJobMarquee && typeof currentJobMarquee.cleanup === 'function') {
      currentJobMarquee.cleanup();
      currentJobMarquee = null;
    }

    const selectedJobIds = new Set();
    container.querySelectorAll('.datax-job-item-cb:checked').forEach(cb => {
      const jid = parseInt(cb.value, 10);
      if (!isNaN(jid)) selectedJobIds.add(jid);
    });

    // 绑定 Tab 3 任务列表通用矩形框选引擎
    currentJobMarquee = bindMarqueeSelection({
      container: container,
      rowSelector: '.datax-job-table-row',
      checkboxSelector: '.datax-job-item-cb',
      getIdFromRow: row => parseInt(row.getAttribute('data-job-id'), 10),
      selectedSet: selectedJobIds,
      selectedBg: '#e6f7ff',
      canStartSelection: e => e.altKey || !e.target.closest('button, input, select, a, textarea'),
      onSelectionChange: () => {
        updateJobCount();
      }
    });

    const headCb = document.getElementById('datax-job-check-head');
    if (headCb) {
      headCb.onchange = () => {
        const cbs = container.querySelectorAll('.datax-job-item-cb');
        cbs.forEach(cb => {
          cb.checked = headCb.checked;
          const jid = parseInt(cb.value, 10);
          if (!isNaN(jid)) {
            if (headCb.checked) selectedJobIds.add(jid);
            else selectedJobIds.delete(jid);
          }
        });
        if (currentJobMarquee) currentJobMarquee.syncRowHighlight();
        updateJobCount();
      };
    }

    container.querySelectorAll('.datax-job-item-cb').forEach(cb => {
      cb.onchange = function() {
        const jid = parseInt(this.value, 10);
        if (!isNaN(jid)) {
          if (this.checked) selectedJobIds.add(jid);
          else selectedJobIds.delete(jid);
        }
        if (currentJobMarquee) currentJobMarquee.syncRowHighlight();
        updateJobCount();
      };
    });

    // 支持单击整行切换选中状态（避免点中操作按钮与复选框自身触发冲突）
    container.querySelectorAll('.datax-job-table-row').forEach(tr => {
      tr.onclick = function(e) {
        if (e.target.closest('input, a, button')) return;
        if (isUserSelectingText()) return; // 选中文本划词复制时，拦截整行复选框翻转
        const cb = this.querySelector('.datax-job-item-cb');
        if (cb) {
          cb.checked = !cb.checked;
          const jid = parseInt(cb.value, 10);
          if (!isNaN(jid)) {
            if (cb.checked) selectedJobIds.add(jid);
            else selectedJobIds.delete(jid);
          }
          if (currentJobMarquee) currentJobMarquee.syncRowHighlight();
          updateJobCount();
        }
      };
    });

    container.querySelectorAll('.datax-job-single-action').forEach(btn => {
      btn.onclick = async function () {
        const id = parseInt(this.getAttribute('data-id'), 10);
        const action = this.getAttribute('data-action');
        if (action === 'start') {
          await singleJobAction(id, 'start');
        } else if (action === 'stop') {
          await singleJobAction(id, 'stop');
        } else if (action === 'trigger') {
          await singleJobAction(id, 'trigger');
        } else if (action === 'remove') {
          await singleJobAction(id, 'remove');
        }
      };
    });

    updateJobCount();
  }

  async function singleJobAction(id, action) {
    const tip = document.getElementById('datax-job-action-tip');
    if (action === 'start') {
      try {
        const resp = await fetch(`/api/job/start?id=${id}`, { method: 'POST', headers: getAuthHeaders() });
        const res = await resp.json();
        if (res.code === 200) {
          updateRowStatus(id, true);
          tip.textContent = `✅ 任务 ID:${id} 调度开启成功`;
        } else {
          alert('开启失败: ' + res.msg);
        }
      } catch (e) { alert('请求异常: ' + e.message); }
    } else if (action === 'stop') {
      try {
        const resp = await fetch(`/api/job/stop?id=${id}`, { method: 'POST', headers: getAuthHeaders() });
        const res = await resp.json();
        if (res.code === 200) {
          updateRowStatus(id, false);
          tip.textContent = `🛑 任务 ID:${id} 已停止调度`;
        } else {
          alert('停止失败: ' + res.msg);
        }
      } catch (e) { alert('请求异常: ' + e.message); }
    } else if (action === 'trigger') {
      try {
        const resp = await fetch('/api/job/trigger', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ jobId: id, executorParam: '' })
        });
        const res = await resp.json();
        if (res.code === 200) {
          tip.textContent = `🔥 任务 ID:${id} 已触发立即执行`;
        } else {
          alert('触发失败: ' + res.msg);
        }
      } catch (e) { alert('请求异常: ' + e.message); }
    } else if (action === 'copy') {
      const job = currentLoadedJobs.find(j => j.id === id);
      const name = job ? (job.jobDesc || `ID:${id}`) : `ID:${id}`;
      try {
        tip.textContent = `⏳ 正在复制任务「${name}」...`;
        const resp = await fetch(`/api/job/copy/${id}`, { method: 'POST', headers: getAuthHeaders() });
        const res = await resp.json();
        if (res.code === 200 || res.code === 0) {
          const newId = res.content;
          tip.textContent = `📋 任务「${name}」复制成功！新任务 ID: ${newId}`;
          await searchJobs();
        } else {
          alert('复制失败: ' + (res.msg || res.message || '未知异常'));
        }
      } catch (e) { alert('复制请求异常: ' + e.message); }
    } else if (action === 'remove') {
      const job = currentLoadedJobs.find(j => j.id === id);
      const name = job ? (job.jobDesc || `ID:${id}`) : `ID:${id}`;
      const confirmed = await showDataxConfirm(`确定要永久删除任务「${name}」(ID: ${id}) 及其历史执行日志吗？\n删除后不可恢复！`, { title: '删除任务确认', type: 'danger', confirmText: '确认删除' });
      if (!confirmed) return;
      try {
        const resp = await fetch(`/api/job/remove/${id}`, { method: 'POST', headers: getAuthHeaders() });
        const res = await resp.json();
        if (res.code === 200 || res.code === 0) {
          tip.textContent = `🗑️ 任务「${name}」已成功删除`;
          currentLoadedJobs = currentLoadedJobs.filter(j => j.id !== id);
          renderJobTable(currentLoadedJobs);
        } else {
          alert('删除失败: ' + (res.msg || res.message));
        }
      } catch (e) { alert('请求异常: ' + e.message); }
    }
  }

  function updateRowStatus(id, isRunning) {
    const cell = document.getElementById(`datax-job-status-cell-${id}`);
    if (cell) {
      cell.innerHTML = getJobStatusBadge(isRunning);
    }
    const item = currentLoadedJobs.find(j => j.id === id);
    if (item) item.triggerStatus = isRunning ? 1 : 0;
  }

  // 15. 批量操作执行器 (带后端原生优先与并发回退能力)
  async function batchStartSelectedJobs() {
    const ids = getSelectedJobIds();
    if (ids.length === 0) {
      alert('请先在下方勾选要启动的任务！');
      return;
    }
    const confirmed = await showDataxConfirm(`确定要批量开启这 ${ids.length} 个任务的定时调度吗？`, { title: '批量开启调度确认', type: 'info', confirmText: '立即开启' });
    if (!confirmed) return;

    const tip = document.getElementById('datax-job-action-tip');
    tip.textContent = `⏳ 正在批量开启 ${ids.length} 个任务...`;

    // 优先调用后端批量接口
    try {
      const resp = await fetch('/api/job/batchStart', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(ids)
      });
      if (resp.ok) {
        const res = await resp.json();
        if (res.code === 200) {
          ids.forEach(id => updateRowStatus(id, true));
          tip.textContent = `🎉 ${res.content || `成功开启 ${ids.length} 个任务调度！`}`;
          return;
        }
      }
    } catch (e) { }

    // 兜底并发循环
    let success = 0;
    for (const id of ids) {
      try {
        const r = await fetch(`/api/job/start?id=${id}`, { method: 'POST', headers: getAuthHeaders() });
        const res = await r.json();
        if (res.code === 200) {
          updateRowStatus(id, true);
          success++;
        }
      } catch (err) { }
    }
    tip.textContent = `🎉 批量开启完成：${success}/${ids.length} 个任务调度已激活！`;
  }

  async function batchTriggerSelectedJobs() {
    const ids = getSelectedJobIds();
    if (ids.length === 0) {
      alert('请先在下方勾选要执行的任务！');
      return;
    }
    const confirmed = await showDataxConfirm(`确定要立即触发这 ${ids.length} 个任务执行一次吗？\n（任务将在后台并发启动运行）`, { title: '批量触发确认', type: 'info', confirmText: '立即触发' });
    if (!confirmed) return;

    const tip = document.getElementById('datax-job-action-tip');
    tip.textContent = `⏳ 正在批量触发 ${ids.length} 个任务立即执行...`;

    try {
      const resp = await fetch('/api/job/batchTrigger', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(ids)
      });
      if (resp.ok) {
        const res = await resp.json();
        if (res.code === 200) {
          tip.textContent = `🔥 ${res.content || `成功触发 ${ids.length} 个任务执行！`}`;
          return;
        }
      }
    } catch (e) { }

    let success = 0;
    for (const id of ids) {
      try {
        const r = await fetch('/api/job/trigger', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ jobId: id, executorParam: '' })
        });
        const res = await r.json();
        if (res.code === 200) success++;
      } catch (err) { }
    }
    tip.textContent = `🔥 批量触发完成：成功触发 ${success}/${ids.length} 个任务立即运行！`;
  }

  async function batchStopSelectedJobs() {
    const ids = getSelectedJobIds();
    if (ids.length === 0) {
      alert('请先在下方勾选要停止的任务！');
      return;
    }
    const confirmed = await showDataxConfirm(`确定要批量停止这 ${ids.length} 个任务的调度吗？`, { title: '批量停止调度确认', type: 'warning', confirmText: '立即停止' });
    if (!confirmed) return;

    const tip = document.getElementById('datax-job-action-tip');
    tip.textContent = `⏳ 正在批量停止 ${ids.length} 个任务...`;

    try {
      const resp = await fetch('/api/job/batchStop', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(ids)
      });
      if (resp.ok) {
        const res = await resp.json();
        if (res.code === 200) {
          ids.forEach(id => updateRowStatus(id, false));
          tip.textContent = `🛑 ${res.content || `成功停止 ${ids.length} 个任务调度！`}`;
          return;
        }
      }
    } catch (e) { }

    let success = 0;
    for (const id of ids) {
      try {
        const r = await fetch(`/api/job/stop?id=${id}`, { method: 'POST', headers: getAuthHeaders() });
        const res = await r.json();
        if (res.code === 200) {
          updateRowStatus(id, false);
          success++;
        }
      } catch (err) { }
    }
    tip.textContent = `🛑 批量停止完成：${success}/${ids.length} 个任务调度已关闭！`;
  }

  async function batchRemoveSelectedJobs() {
    const ids = getSelectedJobIds();
    if (ids.length === 0) {
      alert('请先在下方勾选要删除的任务！');
      return;
    }
    const confirmed = await showDataxConfirm(`⚠️ 危险操作警告：\n\n确定要批量永久删除选中的 ${ids.length} 个任务及其所有历史运行日志吗？\n删除后不可恢复，请确认！`, { title: '批量永久删除警告', type: 'danger', confirmText: '确认删除' });
    if (!confirmed) return;

    const tip = document.getElementById('datax-job-action-tip');
    tip.textContent = `⏳ 正在批量删除 ${ids.length} 个任务...`;

    let success = false;
    // 优先调用后端批量删除原生接口
    try {
      const resp = await fetch('/api/job/batchRemove', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(ids)
      });
      if (resp.ok) {
        const res = await resp.json();
        if (res.code === 200) {
          currentLoadedJobs = currentLoadedJobs.filter(j => !ids.includes(j.id));
          renderJobTable(currentLoadedJobs);
          tip.textContent = `🗑️ ${res.content || `成功批量删除 ${ids.length} 个任务！`}`;
          success = true;
          return;
        }
      }
    } catch (e) { }

    // 兜底并发循环删除
    if (!success) {
      let deletedCount = 0;
      for (const id of ids) {
        try {
          const r = await fetch(`/api/job/remove/${id}`, { method: 'POST', headers: getAuthHeaders() });
          const res = await r.json();
          if (res.code === 200 || res.code === 0) {
            deletedCount++;
          }
        } catch (err) { }
      }
      currentLoadedJobs = currentLoadedJobs.filter(j => !ids.includes(j.id));
      renderJobTable(currentLoadedJobs);
      tip.textContent = `🗑️ 批量删除完成：已清理 ${deletedCount}/${ids.length} 个任务！`;
    }
  }

  // 批量将已有任务设为方案1时间增量同步模态框（主闭包内直接调用 getSelectedJobIds 并做 DOM 兜底）
  function openBatchSetIncrementModal() {
    let ids = [];
    if (typeof getSelectedJobIds === 'function') {
      ids = getSelectedJobIds();
    }
    if (!ids || ids.length === 0) {
      const checkedCbs = document.querySelectorAll('.datax-job-item-cb:checked');
      checkedCbs.forEach(cb => {
        const val = parseInt(cb.value, 10);
        if (!isNaN(val)) ids.push(val);
      });
    }

    if (!ids || ids.length === 0) {
      alert('请先在下方勾选要设为增量同步的任务！');
      return;
    }

    const existing = document.getElementById('datax-increment-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'datax-increment-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000005;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:520px;max-width:92vw;box-shadow:0 8px 24px rgba(0,0,0,0.25);overflow:hidden;">
        <div style="padding:14px 18px;background:linear-gradient(90deg,#722ed1,#9254de);color:#fff;display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:14px;">⏰ 批量设置【方案1：时间增量同步】</strong>
          <span id="datax-inc-modal-close" style="cursor:pointer;font-size:18px;font-weight:bold;">&times;</span>
        </div>
        <div style="padding:16px 18px;font-size:13px;color:#333;">
          <div style="background:#f9f0ff;border:1px solid #d3adf7;color:#531dab;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;">
            📌 已选中 <strong>${ids.length}</strong> 个任务。系统将自动配置 <strong>时间自增</strong>、注入精准 <strong>where 条件</strong> 与 <strong>replace 覆盖写入</strong>，彻底避免全库扫源库！
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-weight:600;margin-bottom:4px;">
              增量时间字段名 (Column):
              <span class="datax-inc-quick-tag" data-val="update_time" style="color:#722ed1;cursor:pointer;font-weight:normal;margin-left:4px;">[update_time]</span>
              <span class="datax-inc-quick-tag" data-val="modify_time" style="color:#722ed1;cursor:pointer;font-weight:normal;margin-left:2px;">[modify_time]</span>
              <span class="datax-inc-quick-tag" data-val="gmt_modified" style="color:#722ed1;cursor:pointer;font-weight:normal;margin-left:2px;">[gmt_modified]</span>
            </label>
            <input type="text" id="datax-modal-inc-col" value="update_time" placeholder="例如: update_time" style="width:100%;box-sizing:border-box;padding:7px 10px;font-size:13px;border:1px solid #dcdfe6;border-radius:4px;" />
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-weight:600;margin-bottom:4px;">
              增量起始时间 (不填默认为当前系统时间):
              <span id="datax-inc-fill-now" style="color:#722ed1;cursor:pointer;font-weight:normal;margin-left:6px;font-size:12px;">[填入当前时间]</span>
              <span id="datax-inc-fill-today" style="color:#722ed1;cursor:pointer;font-weight:normal;margin-left:4px;font-size:12px;">[今日零点]</span>
            </label>
            <input type="text" id="datax-modal-inc-time" placeholder="格式: yyyy-MM-dd HH:mm:ss" style="width:100%;box-sizing:border-box;padding:7px 10px;font-size:13px;border:1px solid #dcdfe6;border-radius:4px;" />
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block;font-weight:600;margin-bottom:4px;">目标库写入模式 (writeMode):</label>
            <select id="datax-modal-inc-writemode" style="width:100%;padding:7px 10px;font-size:13px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;">
              <option value="replace">replace (主键冲突覆盖更新，推荐)</option>
              <option value="update">update (更新已有记录)</option>
            </select>
          </div>
          <div style="font-size:11px;color:#888;line-height:1.5;">
            ⚠️ <strong>生产建议</strong>：请确保源数据库各表的时间字段建有索引，以保障每次增量仅毫秒级扫描最新变动数据。
          </div>
        </div>
        <div style="padding:10px 18px;border-top:1px solid #f0f0f0;background:#fafafa;display:flex;justify-content:flex-end;gap:10px;">
          <button id="datax-inc-modal-cancel" style="padding:6px 14px;border:1px solid #dcdfe6;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
          <button id="datax-inc-modal-submit" style="padding:6px 16px;border:none;background:#722ed1;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">立即批量应用</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.datax-inc-quick-tag').forEach(tag => {
      tag.onclick = function () {
        const inp = document.getElementById('datax-modal-inc-col');
        if (inp) inp.value = this.getAttribute('data-val');
      };
    });

    document.getElementById('datax-inc-modal-close').onclick = () => modal.remove();
    const formatDateTime = d => {
      const pad = n => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const fillNow = modal.querySelector('#datax-inc-fill-now');
    if (fillNow) {
      fillNow.onclick = () => {
        const inp = document.getElementById('datax-modal-inc-time');
        if (inp) inp.value = formatDateTime(new Date());
      };
    }
    const fillToday = modal.querySelector('#datax-inc-fill-today');
    if (fillToday) {
      fillToday.onclick = () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        const inp = document.getElementById('datax-modal-inc-time');
        if (inp) inp.value = formatDateTime(d);
      };
    };
    document.getElementById('datax-inc-modal-cancel').onclick = () => modal.remove();

    document.getElementById('datax-inc-modal-submit').onclick = async function () {
      const col = (document.getElementById('datax-modal-inc-col').value || '').trim();
      if (!col) {
        alert('请输入增量时间字段名！');
        return;
      }
      const timeStr = (document.getElementById('datax-modal-inc-time').value || '').trim().replace('T', ' ');
      const writeMode = document.getElementById('datax-modal-inc-writemode').value;

      this.disabled = true;
      this.textContent = '正在处理...';

      try {
        const payload = {
          jobIds: ids,
          timeColumn: col,
          incStartTime: timeStr || null,
          writeMode: writeMode
        };
        const resp = await fetch('/api/job/batchSetIncrement', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const res = await resp.json();
        if (res.code === 200 || res.code === 0) {
          alert('🎉 ' + (res.msg || res.content || '批量设置增量同步成功！'));
          modal.remove();
          if (typeof queryJobList === 'function') {
            await queryJobList();
          }
        } else {
          alert('设置失败: ' + (res.msg || '未知错误'));
          this.disabled = false;
          this.textContent = '立即批量应用';
        }
      } catch (err) {
        alert('请求异常: ' + err.message);
        this.disabled = false;
        this.textContent = '立即批量应用';
      }
    };
  }

  // 批量初始化勾选的任务目标表并全量同步模态框（含二次确认强防误触拦截）
  function openBatchInitSyncModal() {
    let ids = [];
    if (typeof getSelectedJobIds === 'function') {
      ids = getSelectedJobIds();
    }
    if (!ids || ids.length === 0) {
      const checkedCbs = document.querySelectorAll('.datax-job-item-cb:checked');
      checkedCbs.forEach(cb => {
        const val = parseInt(cb.value, 10);
        if (!isNaN(val)) ids.push(val);
      });
    }

    if (!ids || ids.length === 0) {
      alert('请先在下方列表中勾选要进行初始化并全量同步的任务！');
      return;
    }

    const selectedJobs = (currentLoadedJobs || []).filter(j => ids.includes(j.id));
    const tableNames = selectedJobs.map(j => j.jobDesc || `ID:${j.id}`);
    const previewList = tableNames.slice(0, 8).map(t => `<li style="margin-bottom:2px;">• <strong>${t}</strong></li>`).join('');
    const extraCount = tableNames.length > 8 ? `<li style="color:#888;">...等共计 ${tableNames.length} 个任务</li>` : '';

    const existing = document.getElementById('datax-init-sync-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'datax-init-sync-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:1000006;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:560px;max-width:94vw;box-shadow:0 10px 30px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;">
        
        <!-- 弹窗标题 -->
        <div id="datax-init-modal-header" style="padding:14px 18px;background:linear-gradient(90deg,#fa541c,#fa8c16);color:#fff;display:flex;justify-content:space-between;align-items:center;">
          <strong id="datax-init-modal-title" style="font-size:14px;display:flex;align-items:center;gap:6px;">
            批量初始化目标表并全量同步 (第 1/2 步：操作确认)
          </strong>
          <span id="datax-init-modal-close" style="cursor:pointer;font-size:18px;font-weight:bold;">&times;</span>
        </div>

        <!-- 步骤 1：操作确认内容 -->
        <div id="datax-init-step-1" style="padding:16px 20px;font-size:13px;color:#333;">
          <div style="background:#fff2e8;border:1px solid #ffbb96;color:#d4380d;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:12px;line-height:1.5;">
            <strong>高危操作警示：</strong><br/>
            此操作将对所选任务执行 <strong>清空目标表</strong>、<strong>重置增量起点</strong> 并 <strong>立即触发全量同步</strong>。适用于表结构变更后重新同步全量数据或修复脏数据。
          </div>

          <div style="margin-bottom:12px;">
            <label style="display:block;font-weight:600;margin-bottom:6px;color:#262626;">已选中的任务列表 (${tableNames.length} 个):</label>
            <div style="max-height:100px;overflow-y:auto;background:#fafafa;border:1px solid #f0f0f0;border-radius:4px;padding:6px 10px;font-size:12px;color:#595959;">
              <ul style="margin:0;padding-left:14px;">
                ${previewList}
                ${extraCount}
              </ul>
            </div>
          </div>

          <div style="margin-bottom:14px;background:#f6ffed;border:1px solid #b7eb8f;padding:10px 14px;border-radius:6px;">
            <label style="display:block;font-weight:600;margin-bottom:6px;color:#389e0d;">执行操作配置选项：</label>
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;font-size:12px;color:#333;">
              <input type="checkbox" id="datax-init-opt-truncate" checked style="cursor:pointer;" />
              <strong>1. 强制清空目标端对应数据表 (TRUNCATE TABLE)</strong>
            </label>
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;font-size:12px;color:#333;">
              <input type="checkbox" id="datax-init-opt-reset" checked style="cursor:pointer;" />
              <strong>2. 重置任务增量时间为初始时间 (1970-01-01，执行全量同步)</strong>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#333;">
              <input type="checkbox" id="datax-init-opt-trigger" checked style="cursor:pointer;" />
              <strong>3. 初始化后立即调用调度器触发全量同步运行</strong>
            </label>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button id="datax-init-step1-cancel" style="padding:7px 16px;border:1px solid #d9d9d9;background:#fff;color:#595959;border-radius:4px;cursor:pointer;font-size:13px;">取消</button>
            <button id="datax-init-step1-next" style="padding:7px 18px;border:none;background:#fa541c;color:#fff;border-radius:4px;cursor:pointer;font-weight:bold;font-size:13px;box-shadow:0 2px 6px rgba(250,84,28,0.3);">
              下一步：进入高危二次确认 ➔
            </button>
          </div>
        </div>

        <!-- 步骤 2：二次确认拦截内容 (默认隐藏) -->
        <div id="datax-init-step-2" style="padding:16px 20px;font-size:13px;color:#333;display:none;">
          <div style="background:#fff1f0;border:1px solid #ffa39e;color:#cf1322;padding:12px 14px;border-radius:6px;margin-bottom:14px;font-size:12px;line-height:1.6;">
            <strong style="font-size:13px;">极度危险拦截：此操作不可撤销！</strong><br/>
            目标端数据表的存量历史数据将被 <strong>物理清空</strong>！<br/>
            为防止误触，请在下方输入口令 <strong style="background:#ffccc7;padding:2px 6px;border-radius:3px;border:1px solid #ff7875;">全量初始化</strong> 以解锁执行按钮：
          </div>

          <div style="margin-bottom:16px;">
            <label style="display:block;font-weight:600;margin-bottom:6px;color:#262626;">输入安全确认口令：</label>
            <input type="text" id="datax-init-confirm-input" placeholder="请输入 '全量初始化' 确认" style="width:100%;box-sizing:border-box;padding:8px 12px;font-size:13px;border:1px solid #d9d9d9;border-radius:4px;outline:none;" />
            <div id="datax-init-input-tip" style="font-size:12px;color:#8c8c8c;margin-top:4px;">口令匹配成功后，执行按钮才会激活。</div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;">
            <button id="datax-init-step2-back" style="padding:7px 14px;border:1px solid #d9d9d9;background:#fff;color:#595959;border-radius:4px;cursor:pointer;font-size:13px;">
              返回上一步
            </button>
            <div style="display:flex;gap:10px;">
              <button id="datax-init-step2-cancel" style="padding:7px 14px;border:1px solid #d9d9d9;background:#fff;color:#595959;border-radius:4px;cursor:pointer;font-size:13px;">取消</button>
              <button id="datax-init-step2-submit" disabled style="padding:7px 20px;border:none;background:#ff4d4f;color:#fff;border-radius:4px;cursor:not-allowed;font-weight:bold;font-size:13px;opacity:0.4;transition:all 0.2s ease;">
                确认清空并启动全量同步
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('datax-init-modal-close');
    const step1Cancel = document.getElementById('datax-init-step1-cancel');
    const step2Cancel = document.getElementById('datax-init-step2-cancel');
    const step1Next = document.getElementById('datax-init-step1-next');
    const step2Back = document.getElementById('datax-init-step2-back');
    const step1Box = document.getElementById('datax-init-step-1');
    const step2Box = document.getElementById('datax-init-step-2');
    const header = document.getElementById('datax-init-modal-header');
    const title = document.getElementById('datax-init-modal-title');
    const confirmInput = document.getElementById('datax-init-confirm-input');
    const inputTip = document.getElementById('datax-init-input-tip');
    const submitBtn = document.getElementById('datax-init-step2-submit');

    const closeModal = () => modal.remove();
    closeBtn.onclick = closeModal;
    step1Cancel.onclick = closeModal;
    step2Cancel.onclick = closeModal;

    // 步骤1 ➔ 步骤2
    step1Next.onclick = () => {
      step1Box.style.display = 'none';
      step2Box.style.display = 'block';
      header.style.background = 'linear-gradient(90deg,#cf1322,#f5222d)';
      title.innerHTML = '批量初始化目标表并全量同步 (第 2/2 步：高危二次口令拦截)';
      confirmInput.value = '';
      confirmInput.focus();
    };

    // 步骤2 ➔ 步骤1
    step2Back.onclick = () => {
      step2Box.style.display = 'none';
      step1Box.style.display = 'block';
      header.style.background = 'linear-gradient(90deg,#fa541c,#fa8c16)';
      title.innerHTML = '批量初始化目标表并全量同步 (第 1/2 步：操作确认)';
    };

    // 口令动态校验
    confirmInput.oninput = function () {
      const val = (this.value || '').trim();
      if (val === '全量初始化') {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        submitBtn.style.boxShadow = '0 2px 8px rgba(245,34,45,0.4)';
        inputTip.innerHTML = '<span style="color:#52c41a;font-weight:600;">✅ 口令核对正确，已解锁执行按钮！</span>';
      } else {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.4';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.style.boxShadow = 'none';
        inputTip.innerHTML = '<span style="color:#8c8c8c;">口令必须输入为 <strong>全量初始化</strong> 才能解锁按钮。</span>';
      }
    };

    // 提交批量初始化并全量同步
    submitBtn.onclick = async function () {
      const truncateVal = document.getElementById('datax-init-opt-truncate').checked;
      const resetVal = document.getElementById('datax-init-opt-reset').checked;
      const triggerVal = document.getElementById('datax-init-opt-trigger').checked;

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ 正在初始化并全量同步...';

      try {
        const resp = await fetch('/api/job/batchInitAndSync', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            jobIds: ids,
            truncateTargetTable: truncateVal,
            resetIncrement: resetVal,
            triggerSync: triggerVal
          })
        });
        const res = await resp.json();
        if (res.code === 200 || res.code === 0) {
          alert('🎉 ' + (res.msg || res.content || '批量初始化与全量同步触发成功！'));
          modal.remove();
          const tip = document.getElementById('datax-job-action-tip');
          if (tip) tip.textContent = `🚀 ${res.msg || res.content || '初始化并全量同步触发成功！'}`;
          if (typeof queryJobList === 'function') {
            await queryJobList();
          }
        } else {
          alert('初始化失败: ' + (res.msg || res.message || '未知错误'));
          submitBtn.disabled = false;
          submitBtn.textContent = '确认清空并启动全量同步';
        }
      } catch (err) {
        alert('请求异常: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '确认清空并启动全量同步';
      }
    };
  }

  /**
   * 打开批量数据量比对与对账看板
   */
  function openBatchCompareModal() {
    let ids = [];
    if (typeof getSelectedJobIds === 'function') {
      ids = getSelectedJobIds();
    }
    if (!ids || ids.length === 0) {
      const checkedCbs = document.querySelectorAll('.datax-job-item-cb:checked');
      checkedCbs.forEach(cb => {
        const val = parseInt(cb.value, 10);
        if (!isNaN(val)) ids.push(val);
      });
    }

    if (!ids || ids.length === 0) {
      alert('请先在任务列表中勾选要进行数据量比对的任务！');
      return;
    }

    const existing = document.getElementById('datax-batch-compare-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'datax-batch-compare-modal';
    modal.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000007;overflow:hidden;';
    modal.innerHTML = `
      <div id="datax-batch-compare-dialog" style="background:#fff;border-radius:8px;width:1320px;max-width:96vw;height:86vh;max-height:86vh;box-shadow:0 12px 36px rgba(0,0,0,0.35);overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;position:fixed;top:50%;left:50%;transform:translate(-50%, -50%);min-width:680px;min-height:380px;">
        
        <!-- 弹窗标题栏 (支持按住拖拽与双击最大化) -->
        <div id="datax-cmp-modal-header" style="padding:12px 20px;background:linear-gradient(90deg,#08979c,#13c2c2);color:#fff;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;cursor:move;user-select:none;" title="按住可随意拖动位置，双击可最大化/还原">
          <div style="font-size:15px;font-weight:bold;display:flex;align-items:center;gap:8px;">
            <span>源库与目标库数据量批量比对看板</span>
            <span style="font-size:11px;font-weight:normal;background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:10px;">已选 ${ids.length} 个任务</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span id="datax-cmp-modal-max" style="cursor:pointer;font-size:14px;font-weight:bold;line-height:1;opacity:0.85;transition:opacity 0.2s;user-select:none;padding:2px 4px;border-radius:3px;" title="最大化 / 还原">🗖</span>
            <span id="datax-cmp-modal-close" style="cursor:pointer;font-size:20px;font-weight:bold;line-height:1;opacity:0.85;transition:opacity 0.2s;user-select:none;padding:2px 4px;border-radius:3px;" title="关闭">&times;</span>
          </div>
        </div>

        <!-- 统计指标与控制栏 -->
        <div style="padding:12px 18px;background:#fafafa;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;flex-shrink:0;">
          <!-- 指标卡片 -->
          <div style="display:flex;gap:12px;font-size:12px;align-items:center;">
            <div style="background:#fff;border:1px solid #d9d9d9;padding:4px 10px;border-radius:4px;">
              总数: <strong id="datax-cmp-stat-total">${ids.length}</strong>
            </div>
            <div style="background:#f6ffed;border:1px solid #b7eb8f;color:#389e0d;padding:4px 10px;border-radius:4px;">
              🟢 一致: <strong id="datax-cmp-stat-matched">0</strong>
            </div>
            <div style="background:#fff1f0;border:1px solid #ffa39e;color:#cf1322;padding:4px 10px;border-radius:4px;">
              🔴 差异: <strong id="datax-cmp-stat-diff">0</strong>
            </div>
            <div style="background:#fffbe6;border:1px solid #ffe58f;color:#d48806;padding:4px 10px;border-radius:4px;">
              ⚠️ 超时/异常: <strong id="datax-cmp-stat-err">0</strong>
            </div>
            <div style="color:#8c8c8c;font-size:11px;">
              耗时: <span id="datax-cmp-stat-cost">0</span> ms | 批次: <span id="datax-cmp-stat-batch">-</span>
            </div>
          </div>

          <!-- 快捷操作与筛选栏 -->
          <div style="display:flex;gap:8px;align-items:center;">
            <!-- 筛选 Radio/按钮组 -->
            <div style="display:inline-flex;border:1px solid #d9d9d9;border-radius:4px;overflow:hidden;background:#fff;font-size:12px;">
              <button id="datax-cmp-filter-all" class="datax-cmp-filter-btn" style="padding:4px 10px;border:none;background:#1890ff;color:#fff;cursor:pointer;">全部</button>
              <button id="datax-cmp-filter-diff" class="datax-cmp-filter-btn" style="padding:4px 10px;border:none;background:#fff;color:#595959;border-left:1px solid #d9d9d9;cursor:pointer;">仅看差异</button>
              <button id="datax-cmp-filter-err" class="datax-cmp-filter-btn" style="padding:4px 10px;border:none;background:#fff;color:#595959;border-left:1px solid #d9d9d9;cursor:pointer;">仅看异常</button>
            </div>

            <button id="datax-cmp-btn-refresh" style="background:#13c2c2;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;" title="强制穿透源库和目标库执行最新 COUNT(*) 并落盘">
              实时比对
            </button>
            <button id="datax-cmp-btn-cached" style="background:#722ed1;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;" title="直接加载各任务最后一次落盘的对账记录，不打扰生产数据库">
              读取历史
            </button>
            <button id="datax-cmp-btn-batch-sync-diff" style="background:#fa8c16;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;display:flex;align-items:center;gap:4px;" title="一键将当前列表中所有存在差异的任务在后台触发执行数据同步">
              批量同步差异表 (<span id="datax-cmp-diff-count-badge">0</span>)
            </button>
            <button id="datax-cmp-btn-goto-tab3" style="background:#08979c;color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;" title="关闭看板并携带当前差异表跳转到 Tab 3 工作台自动搜索并高亮勾选">
              🚀 带入Tab3
            </button>
            <button id="datax-cmp-btn-export" style="background:#52c41a;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;" title="将当前比对结果导出为 Excel">
              导出Excel
            </button>
          </div>
        </div>

        <!-- 加载动画与进度提示 -->
        <div id="datax-cmp-loading" style="padding:10px 20px;background:#e6fffb;border-bottom:1px solid #87e8de;display:flex;align-items:center;gap:12px;font-size:12px;color:#08979c;display:none;">
          <div style="width:18px;height:18px;border:2px solid #13c2c2;border-top-color:transparent;border-radius:50%;animation:datax-spin 0.8s linear infinite;"></div>
          <span id="datax-cmp-loading-text">正在比对中，单表硬超时保护 10 秒...</span>
        </div>

        <!-- 对账数据表格主体 (支持鼠标拖拽框选多选与快捷胶囊操作) -->
        <div id="datax-cmp-table-container" style="flex:1;overflow:auto;padding:10px 18px;position:relative;">
          <!-- 鼠标拖拽框选半透明覆盖矩形 -->
          <div id="datax-cmp-selection-box" style="display:none;position:absolute;border:1.5px dashed #1890ff;background:rgba(24,144,255,0.14);pointer-events:none;z-index:20;border-radius:2px;box-sizing:border-box;"></div>

          <table style="width:100%;min-width:1060px;border-collapse:collapse;font-size:12px;text-align:left;">
            <thead>
              <tr style="background:#fafafa;border-bottom:2px solid #e8e8e8;color:#595959;position:sticky;top:0;z-index:2;">
                <th style="padding:8px 4px;width:34px;min-width:34px;text-align:center;user-select:none;">
                  <input type="checkbox" id="datax-cmp-th-check-all" style="cursor:pointer;" title="全选 / 全不选当前筛选数据" />
                </th>
                <th style="padding:8px 6px;width:45px;min-width:45px;white-space:nowrap;">序号</th>
                <th style="padding:8px 6px;width:60px;min-width:60px;white-space:nowrap;">任务ID</th>
                <th style="padding:8px 8px;min-width:120px;max-width:200px;">任务描述</th>
                <th style="padding:8px 8px;min-width:130px;max-width:200px;">源端 (Reader)</th>
                <th style="padding:8px 8px;min-width:130px;max-width:200px;">目标端 (Writer)</th>
                <th style="padding:8px 8px;text-align:right;width:90px;min-width:90px;white-space:nowrap;">源库记录数</th>
                <th style="padding:8px 8px;text-align:right;width:90px;min-width:90px;white-space:nowrap;">目标库记录数</th>
                <th id="datax-cmp-th-diff" style="padding:8px 8px;text-align:right;width:120px;min-width:120px;white-space:nowrap;cursor:pointer;user-select:none;transition:background 0.2s;" title="点击切换按差异排序 (降序/升序/恢复原序)">
                  差异(源-目标) <span id="datax-cmp-diff-sort-icon" style="font-size:11px;color:#bfbfbf;margin-left:2px;">⇅</span>
                </th>
                <th style="padding:8px 8px;text-align:center;width:90px;min-width:90px;white-space:nowrap;">比对状态</th>
                <th style="padding:8px 8px;text-align:right;width:65px;min-width:65px;white-space:nowrap;">耗时</th>
                <th style="padding:8px 6px;text-align:center;width:110px;min-width:110px;white-space:nowrap;">操作</th>
              </tr>
            </thead>
            <tbody id="datax-cmp-table-body">
              <tr>
                <td colspan="12" style="text-align:center;padding:40px;color:#8c8c8c;">暂无数据，点击【实时比对】开始核验</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 悬浮快捷操作胶囊 (定位在弹窗底部上方，贴合底部固定展示，绝不遮挡中间表格数据) -->
        <div id="datax-cmp-floating-bar" style="display:none;position:absolute;bottom:46px;left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.95);color:#fff;border-radius:28px;padding:7px 18px;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:100;align-items:center;gap:12px;font-size:12px;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.18);user-select:none;transition:all 0.2s ease;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span>🎯 已选中</span>
            <strong id="datax-cmp-floating-total-count" style="color:#40a9ff;font-size:13px;">0</strong>
            <span>个任务</span>
            <span id="datax-cmp-floating-diff-badge" style="background:#ff4d4f;color:#fff;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:bold;margin-left:2px;">差异 0</span>
          </div>
          <div style="height:14px;width:1px;background:rgba(255,255,255,0.25);"></div>
          <button id="datax-cmp-floating-btn-sync" style="background:#fa8c16;color:#fff;border:none;padding:5px 14px;border-radius:16px;cursor:pointer;font-weight:bold;font-size:12px;display:flex;align-items:center;gap:5px;transition:background 0.2s;" title="针对选中的差异任务执行全量同步或时间回溯">
            🚀 同步所选差异 (<span id="datax-cmp-floating-sync-count">0</span>)
          </button>
          <button id="datax-cmp-floating-btn-retry" style="background:#13c2c2;color:#fff;border:none;padding:5px 12px;border-radius:16px;cursor:pointer;font-size:12px;transition:background 0.2s;" title="即时重新测试所选任务数据量">
            批量重测
          </button>
          <button id="datax-cmp-floating-btn-clear" style="background:transparent;color:#d9d9d9;border:none;cursor:pointer;font-size:12px;padding:4px 6px;margin-left:4px;" title="清空选择">
            取消
          </button>
        </div>

        <!-- 底部说明栏 -->
        <div style="padding:8px 18px;background:#fafafa;border-top:1px solid #e8e8e8;font-size:11px;color:#8c8c8c;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
          <div>
            💡 说明：支持<strong>按住 Alt 键任意拖拽框选</strong>或<strong>行首列拖拽</strong>批量多选；文字可正常划选双击复制；比对受 <strong>10 秒硬超时</strong> 熔断保护；自动穿透 <strong>Reader Where</strong> 条件。
          </div>
          <button id="datax-cmp-modal-btn-close" style="padding:4px 16px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;font-size:12px;color:#595959;">关闭</button>
        </div>

        <!-- 右下角自由缩放拖拽手柄 -->
        <div id="datax-cmp-resize-handle" style="position:absolute;right:2px;bottom:2px;width:14px;height:14px;cursor:nwse-resize;z-index:10;display:flex;align-items:flex-end;justify-content:flex-end;padding:2px;user-select:none;" title="按住拖拽自由调整看板大小">
          <svg viewBox="0 0 10 10" width="10" height="10" style="opacity:0.4;">
            <line x1="9" y1="1" x2="1" y2="9" stroke="#666" stroke-width="1.5" />
            <line x1="9" y1="5" x2="5" y2="9" stroke="#666" stroke-width="1.5" />
          </svg>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const dialogEl = modal.querySelector('#datax-batch-compare-dialog');
    const headerEl = modal.querySelector('#datax-cmp-modal-header');
    const maxBtn = modal.querySelector('#datax-cmp-modal-max');
    const resizeHandle = modal.querySelector('#datax-cmp-resize-handle');

    // ==========================================
    // 1. 窗口拖拽移动 (Draggable)
    // ==========================================
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onHeaderMouseDown = (e) => {
      if (e.target.closest('#datax-cmp-modal-close') || e.target.closest('#datax-cmp-modal-max')) {
        return;
      }
      if (isCmpMaximized) return;

      if (dialogEl.style.transform && dialogEl.style.transform !== 'none') {
        const rect = dialogEl.getBoundingClientRect();
        dialogEl.style.transform = 'none';
        dialogEl.style.left = `${rect.left}px`;
        dialogEl.style.top = `${rect.top}px`;
        dialogEl.style.width = `${rect.width}px`;
        dialogEl.style.height = `${rect.height}px`;
        dialogEl.style.maxWidth = '100vw';
        dialogEl.style.maxHeight = '100vh';
      }

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startLeft = dialogEl.offsetLeft;
      startTop = dialogEl.offsetTop;
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      const maxLeft = window.innerWidth - 100;
      const minLeft = -(dialogEl.offsetWidth - 100);
      const maxTop = window.innerHeight - 40;
      const minTop = 0;

      newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
      newTop = Math.max(minTop, Math.min(newTop, maxTop));

      dialogEl.style.left = `${newLeft}px`;
      dialogEl.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    };

    headerEl.addEventListener('mousedown', onHeaderMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // ==========================================
    // 2. 窗口最大化与还原 (Maximize / Restore)
    // ==========================================
    let isCmpMaximized = false;
    let preCmpState = null;

    function toggleCmpMaximize() {
      if (!isCmpMaximized) {
        const rect = dialogEl.getBoundingClientRect();
        preCmpState = {
          left: dialogEl.style.left || `${rect.left}px`,
          top: dialogEl.style.top || `${rect.top}px`,
          width: dialogEl.style.width || `${rect.width}px`,
          height: dialogEl.style.height || `${rect.height}px`,
          transform: dialogEl.style.transform
        };

        dialogEl.style.transform = 'none';
        dialogEl.style.top = '10px';
        dialogEl.style.left = '10px';
        dialogEl.style.width = 'calc(100vw - 20px)';
        dialogEl.style.height = 'calc(100vh - 20px)';
        dialogEl.style.maxWidth = '100vw';
        dialogEl.style.maxHeight = '100vh';
        dialogEl.style.borderRadius = '6px';
        isCmpMaximized = true;
        if (maxBtn) {
          maxBtn.innerHTML = '🗗';
          maxBtn.title = '还原窗口';
        }
      } else {
        if (preCmpState) {
          dialogEl.style.transform = preCmpState.transform || 'none';
          dialogEl.style.left = preCmpState.left;
          dialogEl.style.top = preCmpState.top;
          dialogEl.style.width = preCmpState.width;
          dialogEl.style.height = preCmpState.height;
          dialogEl.style.maxWidth = '96vw';
          dialogEl.style.maxHeight = '85vh';
          dialogEl.style.borderRadius = '8px';
        }
        isCmpMaximized = false;
        if (maxBtn) {
          maxBtn.innerHTML = '🗖';
          maxBtn.title = '最大化窗口';
        }
      }
    }

    if (maxBtn) {
      maxBtn.onclick = (e) => {
        e.stopPropagation();
        toggleCmpMaximize();
      };
    }

    headerEl.ondblclick = (e) => {
      if (e.target.closest('#datax-cmp-modal-close') || e.target.closest('#datax-cmp-modal-max')) {
        return;
      }
      toggleCmpMaximize();
    };

    // ==========================================
    // 3. 右下角边缘自由缩放拉伸 (Resizable)
    // ==========================================
    let isResizing = false;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let startWidth = 0;
    let startHeight = 0;

    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', (e) => {
        if (isCmpMaximized) return;

        if (dialogEl.style.transform && dialogEl.style.transform !== 'none') {
          const rect = dialogEl.getBoundingClientRect();
          dialogEl.style.transform = 'none';
          dialogEl.style.left = `${rect.left}px`;
          dialogEl.style.top = `${rect.top}px`;
          dialogEl.style.width = `${rect.width}px`;
          dialogEl.style.height = `${rect.height}px`;
          dialogEl.style.maxWidth = '100vw';
          dialogEl.style.maxHeight = '100vh';
        }

        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        startWidth = dialogEl.offsetWidth;
        startHeight = dialogEl.offsetHeight;

        document.body.style.userSelect = 'none';
        e.stopPropagation();
        e.preventDefault();
      });
    }

    const onResizeMove = (e) => {
      if (!isResizing) return;
      const deltaX = e.clientX - resizeStartX;
      const deltaY = e.clientY - resizeStartY;

      const newWidth = Math.max(580, Math.min(window.innerWidth - 20, startWidth + deltaX));
      const newHeight = Math.max(380, Math.min(window.innerHeight - 20, startHeight + deltaY));

      dialogEl.style.width = `${newWidth}px`;
      dialogEl.style.height = `${newHeight}px`;
    };

    const onResizeUp = () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeUp);

    // 选中的任务ID集合 (支持框选、复选框点击、Ctrl多选、Shift连续选)
    const selectedJobIds = new Set();
    let lastClickedJobId = null; // 用于 Shift 连续选行
    let cleanupMarqueeListeners = null; // 框选事件解绑函数

    // 绑定关闭按钮及事件清理
    const closeModal = () => {
      headerEl.removeEventListener('mousedown', onHeaderMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', onResizeUp);
      if (typeof cleanupMarqueeListeners === 'function') {
        cleanupMarqueeListeners();
      }
      modal.remove();
    };

    document.getElementById('datax-cmp-modal-close').onclick = closeModal;
    document.getElementById('datax-cmp-modal-btn-close').onclick = closeModal;

    let currentItems = [];
    let currentFilter = 'ALL'; // ALL, DIFF, ERR
    let currentBatchNo = '';
    let diffSortOrder = 'NONE'; // 差异排序状态: 'NONE' (默认原序) | 'DESC' (降序) | 'ASC' (升序)

    /**
     * 生成自适应且防挤压换行的比对状态徽章 (Badge)
     * 采用 inline-flex 与 white-space:nowrap 布局，确保图标与文字永不折行挤压变形
     * @param {number} status 状态码: 1-一致, 2-差异, 3-超时, 4-异常
     * @returns {string} 徽章HTML字符串
     */
    function getCompareStatusBadge(status) {
      const baseStyle = 'display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;padding:2px 8px;border-radius:4px;font-size:11px;line-height:1.4;font-weight:500;box-sizing:border-box;flex-shrink:0;';
      if (status === 1) {
        return `<span style="${baseStyle}color:#52c41a;background:#f6ffed;border:1px solid #b7eb8f;"><span style="font-size:10px;line-height:1;">🟢</span><span>一致</span></span>`;
      }
      if (status === 2) {
        return `<span style="${baseStyle}color:#f5222d;background:#fff1f0;border:1px solid #ffa39e;"><span style="font-size:10px;line-height:1;">🔴</span><span>差异</span></span>`;
      }
      if (status === 3) {
        return `<span style="${baseStyle}color:#fa8c16;background:#fffbe6;border:1px solid #ffe58f;"><span style="font-size:10px;line-height:1;">⚠️</span><span>超时</span></span>`;
      }
      return `<span style="${baseStyle}color:#ff4d4f;background:#fff1f0;border:1px solid #ffccc7;"><span style="font-size:10px;line-height:1;">❌</span><span>异常</span></span>`;
    }

    /**
     * 同步当前表格行的视觉高亮与复选框勾选状态
     */
    function syncRowHighlightAndCheckboxes() {
      const rows = modal.querySelectorAll('.datax-cmp-table-row');
      rows.forEach(row => {
        const jid = parseInt(row.getAttribute('data-job-id'), 10);
        const cb = row.querySelector('.datax-cmp-row-cb');
        const isSelected = selectedJobIds.has(jid);
        if (cb) cb.checked = isSelected;
        if (isSelected) {
          row.style.backgroundColor = '#e6f7ff';
        } else {
          const defaultBg = row.getAttribute('data-default-bg') || '#fff';
          row.style.backgroundColor = defaultBg;
        }
      });
    }

    /**
     * 统一更新选区状态 (表头全选状态、悬浮操作条显示与统计数值)
     */
    function updateSelectionUI() {
      let filtered = currentItems;
      if (currentFilter === 'DIFF') {
        filtered = currentItems.filter(i => i.status === 2);
      } else if (currentFilter === 'ERR') {
        filtered = currentItems.filter(i => i.status === 3 || i.status === 4);
      }

      // 1. 更新表头全选框状态
      const thCb = modal.querySelector('#datax-cmp-th-check-all');
      if (thCb) {
        if (filtered.length === 0) {
          thCb.checked = false;
          thCb.indeterminate = false;
        } else {
          const selectedVisibleCount = filtered.filter(x => selectedJobIds.has(x.jobId)).length;
          if (selectedVisibleCount === filtered.length) {
            thCb.checked = true;
            thCb.indeterminate = false;
          } else if (selectedVisibleCount > 0) {
            thCb.checked = false;
            thCb.indeterminate = true;
          } else {
            thCb.checked = false;
            thCb.indeterminate = false;
          }
        }
      }

      // 2. 更新悬浮操作胶囊
      const floatingBar = modal.querySelector('#datax-cmp-floating-bar');
      const totalCountEl = modal.querySelector('#datax-cmp-floating-total-count');
      const diffBadgeEl = modal.querySelector('#datax-cmp-floating-diff-badge');
      const syncBtn = modal.querySelector('#datax-cmp-floating-btn-sync');
      const syncCountEl = modal.querySelector('#datax-cmp-floating-sync-count');

      const selectedCount = selectedJobIds.size;
      if (selectedCount > 0 && floatingBar) {
        floatingBar.style.display = 'flex';
        if (totalCountEl) totalCountEl.textContent = String(selectedCount);

        const selectedDiffItems = currentItems.filter(x => selectedJobIds.has(x.jobId) && x.status === 2);
        const diffCount = selectedDiffItems.length;

        if (diffBadgeEl) {
          diffBadgeEl.textContent = `差异 ${diffCount}`;
          diffBadgeEl.style.background = diffCount > 0 ? '#ff4d4f' : '#8c8c8c';
        }
        if (syncCountEl) {
          syncCountEl.textContent = String(diffCount > 0 ? diffCount : selectedCount);
        }
        if (syncBtn) {
          if (diffCount > 0) {
            syncBtn.style.opacity = '1';
            syncBtn.innerHTML = `🚀 同步所选差异 (<span id="datax-cmp-floating-sync-count">${diffCount}</span>)`;
            syncBtn.title = `针对选中的 ${diffCount} 个差异任务启动补差同步策略`;
          } else {
            syncBtn.style.opacity = '0.9';
            syncBtn.innerHTML = `🚀 同步所选任务 (<span id="datax-cmp-floating-sync-count">${selectedCount}</span>)`;
            syncBtn.title = `选中的任务中无显式差异标记，点击可强制拉起所选 ${selectedCount} 个任务的同步作业`;
          }
        }
      } else if (floatingBar) {
        floatingBar.style.display = 'none';
      }
    }

    // 渲染表格方法
    function renderCompareTable() {
      const tbody = document.getElementById('datax-cmp-table-body');
      if (!tbody) return;

      // 清理已失效的任务ID
      const currentValidIds = new Set(currentItems.map(i => i.jobId));
      for (const id of selectedJobIds) {
        if (!currentValidIds.has(id)) {
          selectedJobIds.delete(id);
        }
      }

      let filtered = currentItems;
      if (currentFilter === 'DIFF') {
        filtered = currentItems.filter(i => i.status === 2);
      } else if (currentFilter === 'ERR') {
        filtered = currentItems.filter(i => i.status === 3 || i.status === 4);
      }

      // 差异(源-目标) 排序管道处理
      if (diffSortOrder !== 'NONE') {
        filtered = [...filtered].sort((a, b) => {
          // 有效差异数值行优先排序，超时/异常行统一置底
          const aValid = (a.status === 1 || a.status === 2) && typeof a.diffCount === 'number';
          const bValid = (b.status === 1 || b.status === 2) && typeof b.diffCount === 'number';
          if (!aValid && !bValid) return 0;
          if (!aValid) return 1;
          if (!bValid) return -1;

          const diffA = a.diffCount;
          const diffB = b.diffCount;
          return diffSortOrder === 'DESC' ? diffB - diffA : diffA - diffB;
        });
      }

      // 动态更新差异列头的排序指示图标与高亮背景
      const sortIconEl = document.getElementById('datax-cmp-diff-sort-icon');
      const thDiffEl = document.getElementById('datax-cmp-th-diff');
      if (sortIconEl) {
        if (diffSortOrder === 'DESC') {
          sortIconEl.innerHTML = '<span style="color:#f5222d;font-weight:bold;">▼ 降序</span>';
        } else if (diffSortOrder === 'ASC') {
          sortIconEl.innerHTML = '<span style="color:#1890ff;font-weight:bold;">▲ 升序</span>';
        } else {
          sortIconEl.innerHTML = '<span style="color:#bfbfbf;">⇅</span>';
        }
      }
      if (thDiffEl) {
        thDiffEl.style.background = diffSortOrder === 'NONE' ? '#fafafa' : '#fffbe6';
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:#8c8c8c;">无符合筛选条件的数据</td></tr>`;
        updateSelectionUI();
        return;
      }

      tbody.innerHTML = filtered.map((item, idx) => {
        let diffBadge = '';
        let rowBg = '#fff';

        if (item.status === 1) {
          diffBadge = '<span style="color:#52c41a;font-weight:bold;">0</span>';
        } else if (item.status === 2) {
          const sign = item.diffCount > 0 ? '+' : '';
          diffBadge = `<span style="color:#f5222d;font-weight:bold;">${sign}${item.diffCount.toLocaleString()}</span>`;
          rowBg = '#fffbe6';
        } else if (item.status === 3) {
          diffBadge = '<span style="color:#8c8c8c;">-</span>';
          rowBg = '#fff2e8';
        } else {
          diffBadge = '<span style="color:#8c8c8c;">-</span>';
          rowBg = '#fff1f0';
        }

        const isSelected = selectedJobIds.has(item.jobId);
        const displayBg = isSelected ? '#e6f7ff' : rowBg;
        const srcDisplay = item.sourceCount >= 0 ? item.sourceCount.toLocaleString() : '<span style="color:#fa8c16;">超时/失败</span>';
        const tgtDisplay = item.targetCount >= 0 ? item.targetCount.toLocaleString() : '<span style="color:#fa8c16;">超时/失败</span>';

        const whereTag = item.readerWhere ? `<br/><span style="font-size:10px;color:#1890ff;background:#e6f7ff;padding:1px 4px;border-radius:2px;" title="过滤条件: ${item.readerWhere}">🔍 ${item.readerWhere}</span>` : '';

        return `
          <tr class="datax-cmp-table-row" data-job-id="${item.jobId}" data-default-bg="${rowBg}" style="border-bottom:1px solid #f0f0f0;background:${displayBg};cursor:pointer;transition:background 0.15s;" title="${item.statusMsg || ''}">
            <td style="padding:7px 4px;text-align:center;white-space:nowrap;">
              <input type="checkbox" class="datax-cmp-row-cb" data-job-id="${item.jobId}" ${isSelected ? 'checked' : ''} style="cursor:pointer;" />
            </td>
            <td style="padding:7px 6px;color:#8c8c8c;white-space:nowrap;">${idx + 1}</td>
            <td style="padding:7px 6px;font-weight:bold;color:#262626;white-space:nowrap;">${item.jobId}</td>
            <td style="padding:7px 8px;color:#262626;font-weight:500;max-width:180px;word-break:break-all;" title="${item.jobDesc || ''}">${item.jobDesc || '-'}</td>
            <td style="padding:7px 8px;max-width:190px;word-break:break-all;">
              <strong>${item.readerTable || '-'}</strong>
              <div style="font-size:11px;color:#8c8c8c;">${item.readerDatasourceName || ''}</div>
              ${whereTag}
            </td>
            <td style="padding:7px 8px;max-width:190px;word-break:break-all;">
              <strong>${item.writerTable || '-'}</strong>
              <div style="font-size:11px;color:#8c8c8c;">${item.writerDatasourceName || ''}</div>
            </td>
            <td style="padding:7px 8px;text-align:right;font-size:12px;white-space:nowrap;">${srcDisplay}</td>
            <td style="padding:7px 8px;text-align:right;font-size:12px;white-space:nowrap;">${tgtDisplay}</td>
            <td style="padding:7px 8px;text-align:right;font-size:12px;white-space:nowrap;">${diffBadge}</td>
            <td style="padding:7px 8px;text-align:center;white-space:nowrap;">${getCompareStatusBadge(item.status)}</td>
            <td style="padding:7px 8px;text-align:right;color:#8c8c8c;font-size:11px;white-space:nowrap;">${item.costTimeMs || 0}ms</td>
            <td style="padding:7px 6px;text-align:center;white-space:nowrap;">
              ${item.status === 2
                ? `<button class="datax-cmp-single-sync" data-job-id="${item.jobId}" style="padding:2px 7px;border:1px solid #fa8c16;background:#fff7e6;color:#d46b08;border-radius:3px;cursor:pointer;font-size:11px;font-weight:bold;margin-right:4px;" title="检测到数据差异，点击选择【全量同步】或【回溯时间】进行同步">重新同步</button>`
                : `<button class="datax-cmp-single-sync" data-job-id="${item.jobId}" style="padding:2px 7px;border:1px solid #1890ff;background:#e6f7ff;color:#096dd9;border-radius:3px;cursor:pointer;font-size:11px;font-weight:bold;margin-right:4px;" title="立即触发该任务后台执行同步作业">同步</button>`
              }
              <button class="datax-cmp-single-retry" data-job-id="${item.jobId}" style="padding:2px 6px;border:1px solid #13c2c2;background:#e6fffb;color:#08979c;border-radius:3px;cursor:pointer;font-size:11px;" title="重新比对该表源与目标记录数">重测</button>
            </td>
          </tr>
        `;
      }).join('');

      // 绑定行内复选框切换
      tbody.querySelectorAll('.datax-cmp-row-cb').forEach(cb => {
        cb.onchange = (e) => {
          e.stopPropagation();
          const jid = parseInt(cb.getAttribute('data-job-id'), 10);
          if (isNaN(jid)) return;
          if (cb.checked) {
            selectedJobIds.add(jid);
          } else {
            selectedJobIds.delete(jid);
          }
          lastClickedJobId = jid;
          syncRowHighlightAndCheckboxes();
          updateSelectionUI();
        };
      });

      // 绑定行点击事件 (支持 Shift 连续多选、Ctrl 独立切换、单选整行)
      tbody.querySelectorAll('.datax-cmp-table-row').forEach(tr => {
        tr.onclick = (e) => {
          if (e.target.closest('button, input, a, select')) return;
          if (isUserSelectingText()) return; // 选中文本划词复制时，拦截整行选中切换

          const jid = parseInt(tr.getAttribute('data-job-id'), 10);
          if (isNaN(jid)) return;

          if (e.shiftKey && lastClickedJobId !== null) {
            // Shift 区间多选
            const idx1 = filtered.findIndex(x => x.jobId === lastClickedJobId);
            const idx2 = filtered.findIndex(x => x.jobId === jid);
            if (idx1 !== -1 && idx2 !== -1) {
              const startIdx = Math.min(idx1, idx2);
              const endIdx = Math.max(idx1, idx2);
              for (let k = startIdx; k <= endIdx; k++) {
                selectedJobIds.add(filtered[k].jobId);
              }
            }
          } else if (e.ctrlKey || e.metaKey) {
            // Ctrl / Command 反转
            if (selectedJobIds.has(jid)) {
              selectedJobIds.delete(jid);
            } else {
              selectedJobIds.add(jid);
            }
          } else {
            // 单击行
            if (selectedJobIds.has(jid) && selectedJobIds.size === 1) {
              selectedJobIds.delete(jid);
            } else {
              selectedJobIds.clear();
              selectedJobIds.add(jid);
            }
          }
          lastClickedJobId = jid;
          syncRowHighlightAndCheckboxes();
          updateSelectionUI();
        };
      });

      // 绑定单行同步按钮 (点击打开策略选择，支持全量同步与时间回溯)
      tbody.querySelectorAll('.datax-cmp-single-sync').forEach(btn => {
        btn.onclick = () => {
          const jidStr = btn.getAttribute('data-job-id');
          const jid = parseInt(jidStr, 10);
          if (isNaN(jid)) return;
          const targetItem = currentItems.find(x => x.jobId === jid) || { jobId: jid };
          openSyncStrategyModal({
            jobIds: [jid],
            targetItems: [targetItem],
            btnEl: btn,
            isBatch: false
          });
        };
      });

      // 绑定单行重测按钮
      tbody.querySelectorAll('.datax-cmp-single-retry').forEach(btn => {
        btn.onclick = async () => {
          const jidStr = btn.getAttribute('data-job-id');
          const jid = parseInt(jidStr, 10);
          if (isNaN(jid)) {
            alert('无效的任务ID: ' + jidStr);
            return;
          }
          btn.disabled = true;
          btn.textContent = '...';
          try {
            const r = await fetch(`/api/job/compare/single/${jid}`, {
              method: 'POST',
              headers: getAuthHeaders()
            });
            const d = await r.json();
            const newItem = d.content || d.data;
            if (newItem) {
              const targetIdx = currentItems.findIndex(x => x.jobId === jid);
              if (targetIdx !== -1) {
                currentItems[targetIdx] = newItem;
                updateStats();
                renderCompareTable();
              }
            }
          } catch (e) {
            alert('单任务重测失败: ' + e.message);
          } finally {
            btn.disabled = false;
            btn.textContent = '重测';
          }
        };
      });

      // 实时更新选区与统计状态
      syncRowHighlightAndCheckboxes();
      updateSelectionUI();
    }

    // 表头全选/反选复选框绑定
    const thCheckAll = modal.querySelector('#datax-cmp-th-check-all');
    if (thCheckAll) {
      thCheckAll.onchange = () => {
        let filtered = currentItems;
        if (currentFilter === 'DIFF') {
          filtered = currentItems.filter(i => i.status === 2);
        } else if (currentFilter === 'ERR') {
          filtered = currentItems.filter(i => i.status === 3 || i.status === 4);
        }

        if (thCheckAll.checked) {
          filtered.forEach(item => selectedJobIds.add(item.jobId));
        } else {
          filtered.forEach(item => selectedJobIds.delete(item.jobId));
        }
        syncRowHighlightAndCheckboxes();
        updateSelectionUI();
      };
    }

    // 绑定悬浮胶囊内部操作按钮
    const floatingSyncBtn = modal.querySelector('#datax-cmp-floating-btn-sync');
    if (floatingSyncBtn) {
      floatingSyncBtn.onclick = async () => {
        const selectedItems = currentItems.filter(i => selectedJobIds.has(i.jobId));
        if (selectedItems.length === 0) {
          showDataxNotice('请先框选或勾选需要执行同步的任务！', { type: 'warning', mode: 'toast' });
          return;
        }

        const diffItems = selectedItems.filter(i => i.status === 2);
        const targetItems = diffItems.length > 0 ? diffItems : selectedItems;

        // 安全审计限流与防呆提示
        if (targetItems.length > 50) {
          const ok = await showDataxConfirm(`⚠️ 提示：您选中的任务较多 (${targetItems.length} 个)，批量并发拉起可能对源库/目标库产生瞬时压力，是否确认继续？`, { title: '并发压力提示', type: 'warning' });
          if (!ok) return;
        }

        openSyncStrategyModal({
          jobIds: targetItems.map(i => i.jobId),
          targetItems: targetItems,
          btnEl: floatingSyncBtn,
          isBatch: true
        });
      };
    }

    const floatingRetryBtn = modal.querySelector('#datax-cmp-floating-btn-retry');
    if (floatingRetryBtn) {
      floatingRetryBtn.onclick = async () => {
        const selIds = Array.from(selectedJobIds);
        if (selIds.length === 0) {
          alert('请先框选或勾选需要重测的任务！');
          return;
        }

        floatingRetryBtn.disabled = true;
        floatingRetryBtn.textContent = '⏳ 重测中...';

        try {
          const resp = await fetch('/api/job/compare/batch', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ jobIds: selIds, forceRefresh: true })
          });
          const res = await resp.json();
          const payload = res.content || res.data || {};
          const newItems = payload.items || [];

          // 局部替换已更新的数据
          newItems.forEach(newItem => {
            const idx = currentItems.findIndex(x => x.jobId === newItem.jobId);
            if (idx !== -1) {
              currentItems[idx] = newItem;
            }
          });

          updateStats();
          renderCompareTable();
        } catch (e) {
          alert('批量重测请求失败: ' + e.message);
        } finally {
          floatingRetryBtn.disabled = false;
          floatingRetryBtn.textContent = '批量重测';
        }
      };
    }

    const floatingClearBtn = modal.querySelector('#datax-cmp-floating-btn-clear');
    if (floatingClearBtn) {
      floatingClearBtn.onclick = () => {
        selectedJobIds.clear();
        syncRowHighlightAndCheckboxes();
        updateSelectionUI();
      };
    }

    // ==========================================
    // 鼠标按住拖拽矩形框选引擎 (Marquee Selection Engine)
    // 复用全局公共方法 bindMarqueeSelection，统一 AABB 空间碰撞与平滑自动滚动
    // ==========================================
    const tableContainer = modal.querySelector('#datax-cmp-table-container');

    const cmpMarquee = bindMarqueeSelection({
      container: tableContainer,
      rowSelector: '.datax-cmp-table-row',
      checkboxSelector: '.datax-cmp-row-cb',
      getIdFromRow: row => parseInt(row.getAttribute('data-job-id'), 10),
      selectedSet: selectedJobIds,
      selectedBg: '#e6f7ff',
      selectionBoxId: 'datax-cmp-selection-box',
      canStartSelection: e => e.altKey || !e.target.closest('button, input, select, a, #datax-cmp-floating-bar, #datax-cmp-resize-handle'),
      onSelectionChange: ({ isDragging }) => {
        if (!isDragging) {
          updateSelectionUI();
        } else {
          // 拖拽过程中只轻量更新悬浮条数字，避免频繁全量 DOM 刷新
          const floatingCount = modal.querySelector('#datax-cmp-floating-selected-count');
          if (floatingCount) floatingCount.textContent = String(selectedJobIds.size);
        }
      }
    });

    cleanupMarqueeListeners = () => {
      if (cmpMarquee && typeof cmpMarquee.cleanup === 'function') {
        cmpMarquee.cleanup();
      }
    };


    // 绑定差异(源-目标) 表头点击排序事件 (NONE -> DESC -> ASC -> NONE)
    const thDiff = modal.querySelector('#datax-cmp-th-diff');
    if (thDiff) {
      thDiff.onclick = () => {
        if (diffSortOrder === 'NONE') {
          diffSortOrder = 'DESC';
        } else if (diffSortOrder === 'DESC') {
          diffSortOrder = 'ASC';
        } else {
          diffSortOrder = 'NONE';
        }
        renderCompareTable();
      };
    }

    // 更新指标统计卡片
    function updateStats(totalCostMs, batchNo) {
      const total = currentItems.length;
      let matched = 0;
      let diff = 0;
      let err = 0;
      currentItems.forEach(i => {
        if (i.status === 1) matched++;
        else if (i.status === 2) diff++;
        else err++;
      });

      document.getElementById('datax-cmp-stat-total').textContent = total;
      document.getElementById('datax-cmp-stat-matched').textContent = matched;
      document.getElementById('datax-cmp-stat-diff').textContent = diff;
      document.getElementById('datax-cmp-stat-err').textContent = err;
      if (typeof totalCostMs === 'number') {
        document.getElementById('datax-cmp-stat-cost').textContent = totalCostMs;
      }
      if (batchNo) {
        currentBatchNo = batchNo;
        document.getElementById('datax-cmp-stat-batch').textContent = batchNo;
      }

      document.getElementById('datax-cmp-filter-all').textContent = `全部 (${total})`;
      document.getElementById('datax-cmp-filter-diff').textContent = `仅看差异 (${diff})`;
      document.getElementById('datax-cmp-filter-err').textContent = `仅看异常 (${err})`;

      // 同步更新顶部【批量同步差异表 (N)】角标与按钮可用性状态
      const diffBadgeEl = document.getElementById('datax-cmp-diff-count-badge');
      if (diffBadgeEl) diffBadgeEl.textContent = String(diff);
      const batchSyncBtnEl = document.getElementById('datax-cmp-btn-batch-sync-diff');
      if (batchSyncBtnEl) {
        batchSyncBtnEl.style.opacity = diff > 0 ? '1' : '0.6';
      }
    }

    // 请求比对公共执行方法
    async function doExecuteCompare(isForceRefresh) {
      const loading = document.getElementById('datax-cmp-loading');
      const loadingText = document.getElementById('datax-cmp-loading-text');
      const btnRefresh = document.getElementById('datax-cmp-btn-refresh');
      const btnCached = document.getElementById('datax-cmp-btn-cached');

      loading.style.display = 'flex';
      loadingText.textContent = isForceRefresh
        ? `正在实时比对 ${ids.length} 个任务 (4并发限流，单表10秒硬超时)...`
        : `正在从持久化库读取 ${ids.length} 个任务的历史对账底账...`;
      btnRefresh.disabled = true;
      btnCached.disabled = true;

      try {
        const url = isForceRefresh ? '/api/job/compare/batch' : '/api/job/compare/latest';
        const body = isForceRefresh ? JSON.stringify({ jobIds: ids, forceRefresh: true }) : JSON.stringify(ids);

        const resp = await fetch(url, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: body
        });
        const res = await resp.json();
        const payload = res.content || res.data || {};

        currentItems = payload.items || [];
        updateStats(payload.totalCostTimeMs, payload.batchNo);
        renderCompareTable();

        if (currentItems.length === 0 && !isForceRefresh) {
          alert('所选任务暂无历史对账记录，请点击【实时比对】发起首次核验！');
        }
      } catch (err) {
        alert('比对请求异常: ' + err.message);
      } finally {
        loading.style.display = 'none';
        btnRefresh.disabled = false;
        btnCached.disabled = false;
      }
    }

    // 绑定筛选按钮切换
    const filterBtns = modal.querySelectorAll('.datax-cmp-filter-btn');
    function setFilterActive(activeId, filterType) {
      currentFilter = filterType;
      filterBtns.forEach(btn => {
        if (btn.id === activeId) {
          btn.style.background = '#1890ff';
          btn.style.color = '#fff';
        } else {
          btn.style.background = '#fff';
          btn.style.color = '#595959';
        }
      });
      renderCompareTable();
    }

    document.getElementById('datax-cmp-filter-all').onclick = function() {
      setFilterActive('datax-cmp-filter-all', 'ALL');
    };
    document.getElementById('datax-cmp-filter-diff').onclick = function() {
      setFilterActive('datax-cmp-filter-diff', 'DIFF');
    };
    document.getElementById('datax-cmp-filter-err').onclick = function() {
      setFilterActive('datax-cmp-filter-err', 'ERR');
    };

    // 绑定操作按钮
    document.getElementById('datax-cmp-btn-refresh').onclick = () => doExecuteCompare(true);
    document.getElementById('datax-cmp-btn-cached').onclick = () => doExecuteCompare(false);

    /**
     * 打开数据同步策略选择模态框 (公共组件)
     * 支持全量同步、向前回溯时间、常规增量三种模式
     * 解决业务数据延迟更新导致增量未覆盖的痛点
     *
     * @param {Object} options 配置入参
     * @param {Array<number>} options.jobIds 待同步的任务ID列表
     * @param {Array<Object>} options.targetItems 对应的对账数据行项
     * @param {HTMLElement} [options.btnEl] 触发源按钮元素
     * @param {boolean} [options.isBatch] 是否为批量触发
     */
    function openSyncStrategyModal({ jobIds, targetItems, btnEl, isBatch }) {
      if (!jobIds || jobIds.length === 0) {
        alert('未指定要同步的任务！');
        return;
      }

      const existingModal = document.getElementById('datax-sync-strategy-modal');
      if (existingModal) existingModal.remove();

      // 构建摘要文字
      const count = jobIds.length;
      let summaryText = '';
      if (count === 1) {
        const item = targetItems[0] || {};
        const diffStr = (item.status === 2 && typeof item.diffCount === 'number')
          ? `，差异: <strong style="color:#cf1322;">${item.diffCount > 0 ? '+' : ''}${item.diffCount.toLocaleString()}</strong> 条`
          : '';
        summaryText = `任务 ID: <strong>${item.jobId}</strong> | 源表: <code>${item.readerTable || item.jobDesc || '-'}</code>${diffStr}`;
      } else {
        const previewTables = targetItems.map(i => i.readerTable || `ID:${i.jobId}`).slice(0, 5).join('、');
        const extra = count > 5 ? ` 等共 <strong>${count}</strong> 个差异任务` : ` 共 <strong>${count}</strong> 个差异任务`;
        summaryText = `涉及表: ${previewTables}${extra}`;
      }

      const modalMask = document.createElement('div');
      modalMask.id = 'datax-sync-strategy-modal';
      modalMask.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
      modalMask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:1000012;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif;';

      modalMask.innerHTML = `
        <div style="background:#fff;border-radius:8px;width:580px;max-width:92vw;box-shadow:0 16px 40px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;">
          <!-- 弹窗标题 -->
          <div style="padding:13px 20px;background:linear-gradient(90deg,#08979c,#13c2c2);color:#fff;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <div style="font-size:14px;font-weight:bold;display:flex;align-items:center;gap:8px;">
              <span>🔄 选择数据同步策略</span>
              <span style="font-size:11px;background:rgba(255,255,255,0.25);padding:1px 8px;border-radius:10px;">${count} 个任务</span>
            </div>
            <span id="datax-sync-modal-close" style="cursor:pointer;font-size:20px;line-height:1;opacity:0.85;user-select:none;" title="关闭">&times;</span>
          </div>

          <!-- 内容主体 -->
          <div style="padding:16px 22px;max-height:75vh;overflow-y:auto;">
            <!-- 任务概览卡片 -->
            <div style="background:#f5f5f5;border:1px solid #e8e8e8;border-radius:6px;padding:9px 12px;font-size:12px;color:#262626;margin-bottom:14px;">
              ${summaryText}
            </div>

            <!-- 同步策略单选组 -->
            <div style="display:flex;flex-direction:column;gap:11px;">
              
              <!-- 选项 1: 全量同步 (推荐用于消除差异) -->
              <label id="datax-sync-card-all" style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1.5px solid #ff7875;background:#fff1f0;border-radius:6px;cursor:pointer;transition:border-color 0.2s;">
                <input type="radio" name="datax-sync-opt" value="ALL" checked style="margin-top:3px;cursor:pointer;" />
                <div style="flex:1;">
                  <div style="font-weight:bold;color:#cf1322;font-size:13px;display:flex;align-items:center;gap:6px;">
                    <span>🔥 全量同步 (重置起点为 1970-01-01，彻底消除差异)</span>
                  </div>
                  <div style="font-size:12px;color:#595959;margin-top:5px;line-height:1.5;">
                    重置增量起始时间为 <strong>1970-01-01</strong> 进行全量同步。<strong>不会清空目标表</strong>，基于主键/唯一索引更新数据，执行完成后自动记录最新增量时间。
                  </div>
                </div>
              </label>

              <!-- 选项 2: 向前回溯时间 -->
              <label id="datax-sync-card-hours" style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid #d9d9d9;background:#fafafa;border-radius:6px;cursor:pointer;transition:border-color 0.2s;">
                <input type="radio" name="datax-sync-opt" value="HOURS" style="margin-top:3px;cursor:pointer;" />
                <div style="flex:1;">
                  <div style="font-weight:bold;color:#262626;font-size:13px;display:flex;align-items:center;gap:8px;">
                    <span>🕒 向前回溯时间同步</span>
                    <select id="datax-sync-hours-sel" style="padding:2px 8px;font-size:12px;border:1px solid #d9d9d9;border-radius:4px;outline:none;background:#fff;cursor:pointer;">
                      <option value="1">回溯 1 小时 (60分钟)</option>
                      <option value="6">回溯 6 小时</option>
                      <option value="12">回溯 12 小时</option>
                      <option value="24" selected>回溯 1 天 (24小时)</option>
                      <option value="72">回溯 3 天 (72小时)</option>
                      <option value="168">回溯 7 天 (1周)</option>
                    </select>
                  </div>
                  <div style="font-size:12px;color:#595959;margin-top:5px;line-height:1.5;">
                    向前回溯增量起始时间，重新读取指定时间段内的数据，针对性覆盖近期延迟入库的数据。
                  </div>
                </div>
              </label>

              <!-- 选项 3: 常规增量 -->
              <label id="datax-sync-card-normal" style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid #d9d9d9;background:#fff;border-radius:6px;cursor:pointer;transition:border-color 0.2s;">
                <input type="radio" name="datax-sync-opt" value="NORMAL" style="margin-top:3px;cursor:pointer;" />
                <div style="flex:1;">
                  <div style="font-weight:bold;color:#595959;font-size:13px;">⚡ 常规增量调度</div>
                  <div style="font-size:12px;color:#8c8c8c;margin-top:5px;line-height:1.5;">
                    保持当前增量起始时间不变，按原计划立即触发一次同步执行。
                  </div>
                </div>
              </label>

            </div>
          </div>

          <!-- 底部操作按钮 -->
          <div style="padding:12px 22px;background:#fafafa;border-top:1px solid #e8e8e8;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
            <button id="datax-sync-modal-btn-cancel" style="padding:6px 16px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;font-size:12px;color:#595959;">取消</button>
            <button id="datax-sync-modal-btn-confirm" style="padding:6px 20px;background:#fa8c16;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;display:flex;align-items:center;gap:6px;">
              🚀 立即启动同步
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modalMask);

      // 关闭弹窗
      const closeSyncModal = () => modalMask.remove();
      modalMask.querySelector('#datax-sync-modal-close').onclick = closeSyncModal;
      modalMask.querySelector('#datax-sync-modal-btn-cancel').onclick = closeSyncModal;

      // 单选卡片切换边框底色
      const radios = modalMask.querySelectorAll('input[name="datax-sync-opt"]');
      radios.forEach(radio => {
        radio.onchange = () => {
          modalMask.querySelectorAll('label').forEach(lbl => {
            lbl.style.borderColor = '#d9d9d9';
            lbl.style.background = '#fff';
          });
          const activeCard = radio.closest('label');
          if (radio.value === 'ALL') {
            activeCard.style.borderColor = '#ff7875';
            activeCard.style.background = '#fff1f0';
          } else if (radio.value === 'HOURS') {
            activeCard.style.borderColor = '#13c2c2';
            activeCard.style.background = '#e6fffb';
          } else {
            activeCard.style.borderColor = '#1890ff';
            activeCard.style.background = '#e6f7ff';
          }
        };
      });

      // 确认并提交触发
      const confirmBtn = modalMask.querySelector('#datax-sync-modal-btn-confirm');
      confirmBtn.onclick = async () => {
        const selectedOpt = modalMask.querySelector('input[name="datax-sync-opt"]:checked').value;
        const hoursSelect = modalMask.querySelector('#datax-sync-hours-sel');
        const selectedHours = hoursSelect ? parseInt(hoursSelect.value, 10) : 24;

        confirmBtn.disabled = true;
        confirmBtn.textContent = '⏳ 正在拉起...';

        if (btnEl) {
          btnEl.disabled = true;
          btnEl.innerHTML = '<span style="display:inline-block;animation:datax-spin 0.8s linear infinite;">⏳</span> 触发中';
        }

        const loading = document.getElementById('datax-cmp-loading');
        const loadingText = document.getElementById('datax-cmp-loading-text');
        if (loading) {
          loading.style.display = 'flex';
          if (loadingText) loadingText.textContent = `正在按指定模式拉起 ${jobIds.length} 个任务后台同步作业...`;
        }

        try {
          let isSuccess = false;
          let tipMsg = '';

          if (selectedOpt === 'ALL' || selectedOpt === 'HOURS') {
            // 调用后端时间回溯与同步接口
            const payload = {
              jobIds: jobIds,
              rollbackType: selectedOpt,
              rollbackHours: selectedHours,
              triggerSync: true
            };
            const resp = await fetch('/api/job/rollbackIncrement', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify(payload)
            });
            const res = await resp.json();
            if (res.code === 200) {
              isSuccess = true;
              tipMsg = res.msg || res.content || '任务已成功拉起！';
            } else {
              alert('拉起失败: ' + (res.msg || res.message || '未知错误'));
            }
          } else {
            // 常规增量模式触发
            let successCount = 0;
            try {
              const resp = await fetch('/api/job/batchTrigger', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(jobIds)
              });
              if (resp.ok) {
                const res = await resp.json();
                if (res.code === 200) successCount = jobIds.length;
              }
            } catch (e) {}

            if (successCount === 0) {
              for (const jid of jobIds) {
                try {
                  const r = await fetch('/api/job/trigger', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ jobId: jid, executorParam: '' })
                  });
                  const res = await r.json();
                  if (res.code === 200) successCount++;
                } catch (err) {}
              }
            }
            if (successCount > 0) {
              isSuccess = true;
              tipMsg = `已成功以常规增量拉起 ${successCount}/${jobIds.length} 个任务后台运行！`;
            } else {
              alert('常规模式触发失败，请检查调度器状态');
            }
          }

          if (isSuccess) {
            closeSyncModal();
            // 更新看板表格中对应的行内同步按钮高亮反馈
            const tbody = document.getElementById('datax-cmp-table-body');
            if (tbody) {
              tbody.querySelectorAll('.datax-cmp-single-sync').forEach(b => {
                const jid = parseInt(b.getAttribute('data-job-id'), 10);
                if (jobIds.includes(jid)) {
                  b.innerHTML = '✅ 已触发';
                  b.style.borderColor = '#52c41a';
                  b.style.background = '#f6ffed';
                  b.style.color = '#389e0d';
                  setTimeout(() => {
                    b.innerHTML = '再次同步';
                    b.disabled = false;
                  }, 5000);
                }
              });
            }
            if (btnEl && isBatch) {
              btnEl.disabled = false;
              const countBadge = document.getElementById('datax-cmp-diff-count-badge')?.textContent || '0';
              btnEl.innerHTML = `批量同步差异表 (${countBadge})`;
            }
            alert(`🎉 触发成功！\n${tipMsg}\n\n💡 提示：后台同步完成后，请直接在行内点击【重测】进行数据核验。`);
          } else {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '🚀 立即启动同步';
            if (btnEl) {
              btnEl.disabled = false;
              btnEl.innerHTML = '同步';
            }
          }
        } catch (err) {
          alert('请求异常: ' + err.message);
          confirmBtn.disabled = false;
          confirmBtn.textContent = '🚀 立即启动同步';
          if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '▶ 同步';
          }
        } finally {
          if (loading) loading.style.display = 'none';
        }
      };
    }

    // 绑定顶部【🔥 批量同步差异表 (N)】按钮 (支持优先同步当前框选/勾选的任务)
    const batchSyncBtn = document.getElementById('datax-cmp-btn-batch-sync-diff');
    if (batchSyncBtn) {
      batchSyncBtn.onclick = async () => {
        let targetItems;
        if (selectedJobIds.size > 0) {
          const selectedItems = currentItems.filter(i => selectedJobIds.has(i.jobId));
          const diffs = selectedItems.filter(i => i.status === 2);
          targetItems = diffs.length > 0 ? diffs : selectedItems;
        } else {
          targetItems = currentItems.filter(i => i.status === 2);
        }

        if (!targetItems || targetItems.length === 0) {
          showDataxNotice('当前暂无存在数据差异的任务需要同步！', { type: 'info', mode: 'toast' });
          return;
        }

        if (targetItems.length > 50) {
          const ok = await showDataxConfirm(`⚠️ 提示：您选中的任务较多 (${targetItems.length} 个)，批量并发拉起可能对源库/目标库产生瞬时压力，是否确认继续？`, { title: '并发压力提示', type: 'warning' });
          if (!ok) return;
        }

        openSyncStrategyModal({
          jobIds: targetItems.map(i => i.jobId),
          targetItems: targetItems,
          btnEl: batchSyncBtn,
          isBatch: true
        });
      };
    }

    // 携带差异表一键跳转到 Tab 3 (任务工作台)
    const gotoTab3Btn = document.getElementById('datax-cmp-btn-goto-tab3');
    if (gotoTab3Btn) {
      gotoTab3Btn.onclick = async () => {
        const diffItems = currentItems.filter(i => i.status === 2);
        const targetItems = diffItems.length > 0 ? diffItems : currentItems;
        if (targetItems.length === 0) {
          alert('当前无可携带的任务！');
          return;
        }

        const targetJobIds = new Set(targetItems.map(i => i.jobId));
        const firstTable = targetItems[0].readerTable || '';

        // 1. 关闭比对看板弹窗
        closeModal();

        // 2. 唤醒并显示智能辅助面板
        setPanelVisibility(true);

        // 3. 模拟点击激活 Tab 3
        if (tabBtn3) tabBtn3.click();

        // 4. 自动填写检索关键词 (支持前缀或表名)
        const searchInput = document.getElementById('datax-job-search-desc');
        if (searchInput && firstTable) {
          const prefixMatch = firstTable.split('_').slice(0, 2).join('_');
          searchInput.value = prefixMatch || firstTable;
        }

        // 5. 触发 Tab 3 异步查询
        if (typeof queryJobList === 'function') {
          await queryJobList();
        }

        // 6. 在查询结果渲染后，自动高亮勾选该批次任务
        setTimeout(() => {
          let checkedCount = 0;
          document.querySelectorAll('.datax-job-item-cb').forEach(cb => {
            const jid = parseInt(cb.getAttribute('data-job-id') || cb.value, 10);
            if (targetJobIds.has(jid)) {
              cb.checked = true;
              checkedCount++;
            }
          });
          if (typeof updateJobCount === 'function') updateJobCount();
          const tip = document.getElementById('datax-job-action-tip');
          if (tip) {
            tip.textContent = `🎯 已自动为您定位并选中 ${checkedCount} 个来自看板的比对任务！可直接在上方执行批量调度`;
          }
        }, 350);
      };
    }

    // 导出 Excel 功能 (复用已有 SheetJS)
    document.getElementById('datax-cmp-btn-export').onclick = () => {
      if (!currentItems || currentItems.length === 0) {
        alert('当前没有可导出的对账数据！');
        return;
      }
      loadSheetJs((XLSX) => {
        if (!XLSX) {
          alert('未能加载 SheetJS 库，无法导出 Excel');
          return;
        }
        const data = currentItems.map(item => ({
          '任务ID': item.jobId,
          '任务描述': item.jobDesc,
          '源端数据源': item.readerDatasourceName || item.readerDatasourceId || '',
          '源端表名': item.readerTable || '',
          '源端过滤条件(Where)': item.readerWhere || '',
          '目标端数据源': item.writerDatasourceName || item.writerDatasourceId || '',
          '目标端表名': item.writerTable || '',
          '源端数据量': item.sourceCount >= 0 ? item.sourceCount : '查询超时/失败',
          '目标端数据量': item.targetCount >= 0 ? item.targetCount : '查询超时/失败',
          '差异值(源-目标)': item.diffCount,
          '比对状态': item.status === 1 ? '一致' : (item.status === 2 ? '存在差异' : (item.status === 3 ? '超时' : '异常')),
          '状态描述': item.statusMsg || '',
          '比对耗时(ms)': item.costTimeMs || 0,
          '对账时间': item.checkTime ? new Date(item.checkTime).toLocaleString() : ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '数据量对账报告');
        XLSX.writeFile(wb, `DataX_对账报告_${currentBatchNo || Date.now()}.xlsx`);
      });
    };

    // 弹窗打开时，默认自动发起一次实时比对
    doExecuteCompare(true);
  }

  /**
   * 打开批量字段漂移探测与模式自适应演进看板
   */
  function openBatchDriftModal() {
    let ids = [];
    if (typeof getSelectedJobIds === 'function') {
      ids = getSelectedJobIds();
    }
    if (!ids || ids.length === 0) {
      const checkedCbs = document.querySelectorAll('.datax-job-item-cb:checked');
      checkedCbs.forEach(cb => {
        const val = parseInt(cb.value, 10);
        if (!isNaN(val)) ids.push(val);
      });
    }

    if (!ids || ids.length === 0) {
      showDataxNotice('请先在任务列表中勾选要进行字段变动检测的任务！', { type: 'warning', mode: 'toast' });
      return;
    }

    const existing = document.getElementById('datax-batch-drift-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'datax-batch-drift-modal';
    modal.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000008;overflow:hidden;';
    modal.innerHTML = `
      <div id="datax-batch-drift-dialog" style="background:#fff;border-radius:8px;width:1360px;max-width:96vw;height:88vh;max-height:88vh;box-shadow:0 12px 36px rgba(0,0,0,0.35);overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;position:fixed;top:50%;left:50%;transform:translate(-50%, -50%);min-width:680px;min-height:380px;">
        
        <!-- 弹窗标题栏 -->
        <div id="datax-drift-modal-header" style="padding:12px 20px;background:linear-gradient(90deg,#2f54eb,#597ef7);color:#fff;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;cursor:move;user-select:none;" title="按住可随意拖动位置">
          <div style="font-size:15px;font-weight:bold;display:flex;align-items:center;gap:8px;">
            <span>🔍 源库与 OBS/Hive 字段变动探测与自适应演进看板</span>
            <span style="font-size:11px;font-weight:normal;background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:10px;">已选 ${ids.length} 个任务</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span id="datax-drift-modal-close" style="cursor:pointer;font-size:20px;font-weight:bold;line-height:1;opacity:0.85;padding:2px 4px;" title="关闭">&times;</span>
          </div>
        </div>

        <!-- 统计指标与控制栏 -->
        <div style="padding:12px 18px;background:#fafafa;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;flex-shrink:0;">
          <div style="display:flex;gap:10px;font-size:12px;align-items:center;">
            <div style="background:#fff;border:1px solid #d9d9d9;padding:4px 10px;border-radius:4px;">
              总数: <strong id="datax-drift-stat-total">${ids.length}</strong>
            </div>
            <div style="background:#f6ffed;border:1px solid #b7eb8f;color:#389e0d;padding:4px 10px;border-radius:4px;">
              🟢 无变动: <strong id="datax-drift-stat-normal">0</strong>
            </div>
            <div style="background:#e6f7ff;border:1px solid #91d5ff;color:#096dd9;padding:4px 10px;border-radius:4px;">
              🔵 新增字段: <strong id="datax-drift-stat-add">0</strong>
            </div>
            <div style="background:#fff1f0;border:1px solid #ffa39e;color:#cf1322;padding:4px 10px;border-radius:4px;">
              🔴 删除字段(高危): <strong id="datax-drift-stat-drop">0</strong>
            </div>
            <div style="background:#f9f0ff;border:1px solid #d3adf7;color:#722ed1;padding:4px 10px;border-radius:4px;">
              注释变动: <strong id="datax-drift-stat-comment">0</strong>
            </div>
            <div style="background:#fff7e6;border:1px solid #ffd591;color:#d46b08;padding:4px 10px;border-radius:4px;">
              类型/可空待审查: <strong id="datax-drift-stat-schema">0</strong>
            </div>
            <div style="background:#fffbe6;border:1px solid #ffe58f;color:#d48806;padding:4px 10px;border-radius:4px;">
              混合变动: <strong id="datax-drift-stat-mixed">0</strong>
            </div>
            <div style="color:#8c8c8c;font-size:11px;">
              耗时: <span id="datax-drift-stat-cost">0</span> ms
            </div>
          </div>

          <div style="display:flex;gap:8px;align-items:center;">
            <button id="datax-drift-btn-detect" style="background:#2f54eb;color:#fff;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;" title="实时比对源端当前字段 vs 任务配置 vs 目标端">
              实时探测
            </button>
            <button id="datax-drift-btn-auto-apply" style="background:#52c41a;color:#fff;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;" title="一键对所有检测到结构变动的任务执行模式演进（目标端加列/配置字段剔除）">
              批量自动演进变动任务
            </button>
            <button id="datax-drift-btn-batch-review" style="background:#f5222d;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;" title="批量审查所选或全部含类型/可空性变更的任务 DDL 并二次确认执行">
              批量审查DDL执行
            </button>
            <button id="datax-drift-btn-latest" style="background:#722ed1;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;" title="加载最近一次落盘的漂移记录">
              读取最近快照
            </button>
          </div>
        </div>

        <!-- 探测中动画 -->
        <div id="datax-drift-loading" style="padding:10px 20px;background:#f0f5ff;border-bottom:1px solid #adc6ff;display:flex;align-items:center;gap:12px;font-size:12px;color:#2f54eb;display:none;">
          <div style="width:18px;height:18px;border:2px solid #2f54eb;border-top-color:transparent;border-radius:50%;animation:datax-spin 0.8s linear infinite;"></div>
          <span id="datax-drift-loading-text">正在分析源库与目标库元数据...</span>
        </div>

        <!-- 表格展示区 (支持鼠标拖拽框选多选) -->
        <div id="datax-drift-table-container" style="flex:1;overflow:auto;padding:10px 18px;position:relative;">
          <!-- 鼠标拖拽框选半透明覆盖矩形 -->
          <div id="datax-drift-selection-box" style="display:none;position:absolute;border:1.5px dashed #2f54eb;background:rgba(47,84,235,0.14);pointer-events:none;z-index:20;border-radius:2px;box-sizing:border-box;"></div>

          <table style="width:100%;min-width:1120px;border-collapse:collapse;font-size:12px;text-align:left;">
            <thead>
              <tr style="background:#fafafa;border-bottom:2px solid #e8e8e8;color:#595959;position:sticky;top:0;z-index:2;">
                <th style="padding:8px 4px;width:34px;min-width:34px;text-align:center;user-select:none;">
                  <input type="checkbox" id="datax-drift-th-check-all" style="cursor:pointer;" title="全选 / 全不选" />
                </th>
                <th style="padding:8px 6px;width:45px;white-space:nowrap;text-align:center;">序号</th>
                <th style="padding:8px 6px;width:65px;white-space:nowrap;text-align:center;">任务ID</th>
                <th style="padding:8px 8px;min-width:140px;">任务描述</th>
                <th style="padding:8px 8px;min-width:130px;">源端表名</th>
                <th style="padding:8px 8px;min-width:130px;">目标表(OBS/Hive)</th>
                <th style="padding:8px 8px;width:125px;min-width:125px;white-space:nowrap;text-align:center;">变动状态</th>
                <th style="padding:8px 8px;min-width:260px;">变动字段明细</th>
                <th style="padding:8px 8px;width:105px;min-width:105px;white-space:nowrap;text-align:center;">建议 DDL</th>
                <th style="padding:8px 8px;width:115px;min-width:115px;white-space:nowrap;text-align:center;">演进状态</th>
                <th style="padding:8px 8px;width:140px;min-width:140px;white-space:nowrap;text-align:center;">操作</th>
              </tr>
            </thead>
            <tbody id="datax-drift-table-body">
              <tr>
                <td colspan="11" style="text-align:center;padding:40px;color:#8c8c8c;">点击【实时探测】开始分析源库表结构是否有新增或删除字段</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 悬浮快捷操作胶囊 (框选/选中后激活浮现，绝不遮挡中间数据) -->
        <div id="datax-drift-floating-bar" style="display:none;position:absolute;bottom:46px;left:50%;transform:translateX(-50%);background:rgba(25,25,35,0.92);color:#fff;border-radius:28px;padding:7px 18px;box-shadow:0 8px 24px rgba(0,0,0,0.35);z-index:100;align-items:center;gap:12px;font-size:12px;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.18);user-select:none;transition:all 0.2s ease;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span>🎯 已框选</span>
            <strong id="datax-drift-floating-total-count" style="color:#597ef7;font-size:13px;">0</strong>
            <span>个任务</span>
            <span id="datax-drift-floating-add-badge" style="background:#096dd9;color:#fff;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:bold;margin-left:2px;display:none;">新增 0</span>
            <span id="datax-drift-floating-drop-badge" style="background:#cf1322;color:#fff;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:bold;margin-left:2px;display:none;">缺失 0</span>
          </div>
          <div style="height:14px;width:1px;background:rgba(255,255,255,0.25);"></div>
          <button id="datax-drift-floating-btn-apply" style="background:#52c41a;color:#fff;border:none;padding:5px 14px;border-radius:16px;cursor:pointer;font-weight:bold;font-size:12px;display:none;align-items:center;gap:5px;transition:background 0.2s;" title="对选中的变动任务执行目标端加列或配置字段剔除">
            批量演进所选 (<span id="datax-drift-floating-apply-count">0</span>)
          </button>
          <button id="datax-drift-floating-btn-review" style="background:#f5222d;color:#fff;border:none;padding:5px 14px;border-radius:16px;cursor:pointer;font-weight:bold;font-size:12px;display:none;align-items:center;gap:5px;transition:background 0.2s;" title="批量审查所选任务的类型或可空性变更 DDL 并执行">
            批量审查DDL (<span id="datax-drift-floating-review-count">0</span>)
          </button>
          <button id="datax-drift-floating-btn-detect" style="background:#2f54eb;color:#fff;border:none;padding:5px 12px;border-radius:16px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;" title="仅对当前选中的任务重新探测元数据">
            重新探测所选
          </button>
          <a href="javascript:;" id="datax-drift-floating-btn-clear" style="color:rgba(255,255,255,0.7);font-size:11px;text-decoration:underline;cursor:pointer;margin-left:4px;">取消选择</a>
        </div>

        <!-- 底部说明栏 -->
        <div style="padding:8px 18px;background:#fafafa;border-top:1px solid #e8e8e8;font-size:11px;color:#8c8c8c;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
          <div>
            💡 说明：支持<strong>按住 Alt 键任意拖拽框选</strong>或<strong>行首列拖拽</strong>批量多选；文字可正常划选双击复制。演进时系统将自动在目标端（OBS/Hive）执行加列 DDL；若源端删除了字段，系统将自动从任务配置中剔除以避免同步报错（目标端保持历史数据兼容，不执行物理 DROP）。
          </div>
          <button id="datax-drift-modal-btn-close" style="padding:4px 16px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;font-size:12px;color:#595959;">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const dialogEl = modal.querySelector('#datax-batch-drift-dialog');
    const headerEl = modal.querySelector('#datax-drift-modal-header');
    const closeBtn = modal.querySelector('#datax-drift-modal-close');
    const closeBottomBtn = modal.querySelector('#datax-drift-modal-btn-close');

    const closeModal = () => {
      if (cleanupDriftMarquee) cleanupDriftMarquee();
      modal.remove();
    };
    closeBtn.onclick = closeModal;
    closeBottomBtn.onclick = closeModal;

    // 拖拽窗口
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0, startLeft = 0, startTop = 0;
    headerEl.onmousedown = (e) => {
      if (e.target.closest('#datax-drift-modal-close')) return;
      if (dialogEl.style.transform && dialogEl.style.transform !== 'none') {
        const rect = dialogEl.getBoundingClientRect();
        dialogEl.style.transform = 'none';
        dialogEl.style.left = `${rect.left}px`;
        dialogEl.style.top = `${rect.top}px`;
      }
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startLeft = dialogEl.offsetLeft;
      startTop = dialogEl.offsetTop;
      document.body.style.userSelect = 'none';
    };
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      dialogEl.style.left = `${startLeft + e.clientX - dragStartX}px`;
      dialogEl.style.top = `${startTop + e.clientY - dragStartY}px`;
    });
    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    });

    let currentDriftItems = [];
    const selectedDriftJobIds = new Set();
    let cleanupDriftMarquee = null;
    let lastClickedDriftIndex = -1;

    // 执行探测核心方法 (支持全量或仅探测已框选/勾选的任务)
    async function doExecuteDrift(autoApply = false, targetJobIds = null) {
      const loadingEl = modal.querySelector('#datax-drift-loading');
      const loadingText = modal.querySelector('#datax-drift-loading-text');
      const tbody = modal.querySelector('#datax-drift-table-body');

      const isSub = targetJobIds && Array.isArray(targetJobIds) && targetJobIds.length > 0;
      const jobIdsToRun = isSub ? targetJobIds : ids;

      if (loadingEl) {
        loadingEl.style.display = 'flex';
        loadingText.textContent = autoApply ? `正在探测并自动应用模式演进(目标端加列与配置重写)... 共 ${jobIdsToRun.length} 个任务` : `正在分析源库物理结构与当前任务配置... 共 ${jobIdsToRun.length} 个任务`;
      }

      try {
        const resp = await fetch('/api/job/drift/batch', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            jobIds: jobIdsToRun,
            autoApply: autoApply
          })
        });
        const res = await resp.json();
        if (res.code !== 200 && res.code !== 0) {
          throw new Error(res.msg || '检测失败');
        }

        const data = res.content || res.data || {};
        const incomingItems = data.items || [];

        if (isSub && currentDriftItems.length > 0) {
          const map = new Map(incomingItems.map(i => [i.jobId, i]));
          currentDriftItems = currentDriftItems.map(old => map.get(old.jobId) || old);

          // 重新汇总统计卡片数字
          let n = 0, a = 0, d = 0, c = 0, s = 0, m = 0;
          currentDriftItems.forEach(it => {
            if (it.driftType === 'ADD_COLUMN') a++;
            else if (it.driftType === 'DROP_COLUMN') d++;
            else if (it.driftType === 'COMMENT_DRIFT') c++;
            else if (it.driftType === 'SCHEMA_CHANGE') s++;
            else if (it.driftType === 'MIXED') m++;
            else n++;
          });
          modal.querySelector('#datax-drift-stat-normal').textContent = n;
          modal.querySelector('#datax-drift-stat-add').textContent = a;
          modal.querySelector('#datax-drift-stat-drop').textContent = d;
          modal.querySelector('#datax-drift-stat-comment').textContent = c;
          modal.querySelector('#datax-drift-stat-schema').textContent = s;
          modal.querySelector('#datax-drift-stat-mixed').textContent = m;
        } else {
          currentDriftItems = incomingItems;
          modal.querySelector('#datax-drift-stat-normal').textContent = data.normalCount || 0;
          modal.querySelector('#datax-drift-stat-add').textContent = data.addColumnCount || 0;
          modal.querySelector('#datax-drift-stat-drop').textContent = data.dropColumnCount || 0;
          modal.querySelector('#datax-drift-stat-comment').textContent = data.commentDriftCount || 0;
          modal.querySelector('#datax-drift-stat-schema').textContent = data.schemaChangeCount || 0;
          modal.querySelector('#datax-drift-stat-mixed').textContent = data.mixedCount || 0;
          modal.querySelector('#datax-drift-stat-cost').textContent = data.totalCostTimeMs || 0;
        }

        renderDriftTableRows(currentDriftItems);
        if (autoApply) {
          const manualCount = currentDriftItems.filter(it => it.hasManualReviewChanges).length;
          if (manualCount > 0) {
            showDataxNotice(`安全变更(加列/注释/清理)已自动执行；另有 ${manualCount} 个任务含字段类型或可空性变更，请人工审查后手动执行 DDL。`, { type: 'warning', mode: 'toast' });
          } else {
            showDataxNotice(`模式演进完成，已成功处理 ${jobIdsToRun.length} 个任务。`, { type: 'success', mode: 'toast' });
          }
        }
      } catch (err) {
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="11" style="text-align:center;padding:40px;color:#f5222d;">
                探测异常: ${safeEscapeHtml(err?.message || String(err || '未知异常'))}
              </td>
            </tr>
          `;
        }
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }

    // 选中态联动更新UI（高亮行、复选框、悬浮操作胶囊、顶部按钮）
    function updateDriftSelectionUI() {
      const tbody = modal.querySelector('#datax-drift-table-body');
      if (!tbody) return;

      const rows = tbody.querySelectorAll('.datax-drift-table-row');
      rows.forEach((row, idx) => {
        const jid = parseInt(row.getAttribute('data-job-id'), 10);
        const isSel = selectedDriftJobIds.has(jid);
        const cb = row.querySelector('.datax-drift-row-cb');
        if (cb && cb.checked !== isSel) cb.checked = isSel;

        const defaultBg = idx % 2 === 1 ? '#fafcff' : '#ffffff';
        row.style.background = isSel ? '#e6f7ff' : defaultBg;
      });

      // 更新表头全选框
      const thCheckAll = modal.querySelector('#datax-drift-th-check-all');
      if (thCheckAll) {
        const totalRows = rows.length;
        const selCount = rows.length > 0 ? Array.from(rows).filter(r => selectedDriftJobIds.has(parseInt(r.getAttribute('data-job-id'), 10))).length : 0;
        thCheckAll.checked = totalRows > 0 && selCount === totalRows;
        thCheckAll.indeterminate = selCount > 0 && selCount < totalRows;
      }

      // 更新悬浮操作胶囊
      const floatingBar = modal.querySelector('#datax-drift-floating-bar');
      const floatingTotal = modal.querySelector('#datax-drift-floating-total-count');
      const floatingAddBadge = modal.querySelector('#datax-drift-floating-add-badge');
      const floatingDropBadge = modal.querySelector('#datax-drift-floating-drop-badge');
      const floatingApplyBtn = modal.querySelector('#datax-drift-floating-btn-apply');
      const floatingApplyCount = modal.querySelector('#datax-drift-floating-apply-count');
      const floatingReviewBtn = modal.querySelector('#datax-drift-floating-btn-review');
      const floatingReviewCount = modal.querySelector('#datax-drift-floating-review-count');

      const count = selectedDriftJobIds.size;
      if (floatingBar) {
        if (count > 0) {
          floatingBar.style.display = 'flex';
          if (floatingTotal) floatingTotal.textContent = String(count);

          const selectedItems = currentDriftItems.filter(i => selectedDriftJobIds.has(i.jobId));
          const addItems = selectedItems.filter(i => i.driftType === 'ADD_COLUMN' || i.driftType === 'MIXED');
          const dropItems = selectedItems.filter(i => i.driftType === 'DROP_COLUMN');
          const evoItems = selectedItems.filter(i => i.driftType === 'ADD_COLUMN' || i.driftType === 'MIXED' || i.driftType === 'DROP_COLUMN' || i.driftType === 'COMMENT_DRIFT');
          const reviewItems = selectedItems.filter(i => i.hasManualReviewChanges);

          if (floatingAddBadge) {
            floatingAddBadge.style.display = addItems.length > 0 ? 'inline-block' : 'none';
            floatingAddBadge.textContent = `新增 ${addItems.length}`;
          }
          if (floatingDropBadge) {
            floatingDropBadge.style.display = dropItems.length > 0 ? 'inline-block' : 'none';
            floatingDropBadge.textContent = `缺失 ${dropItems.length}`;
          }
          if (floatingApplyBtn) {
            floatingApplyBtn.style.display = evoItems.length > 0 ? 'flex' : 'none';
            if (floatingApplyCount) floatingApplyCount.textContent = String(evoItems.length);
          }
          if (floatingReviewBtn) {
            floatingReviewBtn.style.display = reviewItems.length > 0 ? 'flex' : 'none';
            if (floatingReviewCount) floatingReviewCount.textContent = String(reviewItems.length);
          }
        } else {
          floatingBar.style.display = 'none';
        }
      }

      // 联动更新顶部按钮文案
      const topAutoApplyBtn = modal.querySelector('#datax-drift-btn-auto-apply');
      if (topAutoApplyBtn) {
        if (count > 0) {
          topAutoApplyBtn.innerHTML = `批量自动演进所选 (<span style="text-decoration:underline;font-weight:bold;">${count}</span>)`;
        } else {
          topAutoApplyBtn.innerHTML = '批量自动演进变动任务';
        }
      }
      const topBatchReviewBtn = modal.querySelector('#datax-drift-btn-batch-review');
      if (topBatchReviewBtn) {
        const selectedReviewCount = count > 0
          ? currentDriftItems.filter(i => selectedDriftJobIds.has(i.jobId) && i.hasManualReviewChanges).length
          : currentDriftItems.filter(i => i.hasManualReviewChanges).length;
        if (count > 0) {
          topBatchReviewBtn.innerHTML = `批量审查所选DDL (<span style="text-decoration:underline;font-weight:bold;">${selectedReviewCount}</span>)`;
        } else if (selectedReviewCount > 0) {
          topBatchReviewBtn.innerHTML = `批量审查DDL执行 (${selectedReviewCount})`;
        } else {
          topBatchReviewBtn.innerHTML = '批量审查DDL执行';
        }
      }
      const topDetectBtn = modal.querySelector('#datax-drift-btn-detect');
      if (topDetectBtn) {
        if (count > 0) {
          topDetectBtn.innerHTML = `探测所选 (<span style="text-decoration:underline;font-weight:bold;">${count}</span>)`;
        } else {
          topDetectBtn.innerHTML = '实时探测';
        }
      }
    }

    // 渲染表格行
    function renderDriftTableRows(items) {
      const tbody = modal.querySelector('#datax-drift-table-body');
      if (!tbody) return;

      if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:#8c8c8c;">未匹配到任务明细</td></tr>';
        updateDriftSelectionUI();
        return;
      }

      let html = '';
      items.forEach((item, idx) => {
        const rowBg = idx % 2 === 1 ? '#fafcff' : '#ffffff';
        const isSel = selectedDriftJobIds.has(item.jobId);

        // 状态徽标 (加 inline-flex, white-space: nowrap, 彻底杜绝换行和破框)
        let typeBadge = '<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#52c41a;font-weight:600;background:#f6ffed;padding:3px 10px;border-radius:12px;border:1px solid #b7eb8f;white-space:nowrap;font-size:11px;line-height:1;box-sizing:border-box;">无变动</span>';
        if (item.driftType === 'ADD_COLUMN') {
          typeBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#096dd9;font-weight:600;background:#e6f7ff;padding:3px 10px;border-radius:12px;border:1px solid #91d5ff;white-space:nowrap;font-size:11px;line-height:1;box-sizing:border-box;">新增 ${(item.addedColumns || []).length} 列</span>`;
        } else if (item.driftType === 'DROP_COLUMN') {
          typeBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#cf1322;font-weight:600;background:#fff1f0;padding:3px 10px;border-radius:12px;border:1px solid #ffa39e;white-space:nowrap;font-size:11px;line-height:1;box-sizing:border-box;">缺失 ${(item.droppedColumns || []).length} 列</span>`;
        } else if (item.driftType === 'COMMENT_DRIFT') {
          const commentCnt = (item.tableCommentChanged ? 1 : 0) + (item.columnCommentChanges ? item.columnCommentChanges.length : 0);
          typeBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#722ed1;font-weight:600;background:#f9f0ff;padding:3px 10px;border-radius:12px;border:1px solid #d3adf7;white-space:nowrap;font-size:11px;line-height:1;box-sizing:border-box;">注释变更 ${commentCnt}</span>`;
        } else if (item.driftType === 'SCHEMA_CHANGE') {
          typeBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#d46b08;font-weight:600;background:#fff7e6;padding:3px 10px;border-radius:12px;border:1px solid #ffd591;white-space:nowrap;font-size:11px;line-height:1;box-sizing:border-box;">类型/可空变更 ${(item.columnSchemaChanges || []).length}</span>`;
        } else if (item.driftType === 'MIXED') {
          typeBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#d48806;font-weight:600;background:#fffbe6;padding:3px 10px;border-radius:12px;border:1px solid #ffe58f;white-space:nowrap;font-size:11px;line-height:1;box-sizing:border-box;">混合变动</span>`;
        } else if (item.status === 'FAILED') {
          typeBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;color:#f5222d;font-weight:600;background:#fff1f0;padding:3px 8px;border-radius:12px;border:1px solid #ffa39e;white-space:nowrap;font-size:11px;line-height:1;box-sizing:border-box;">探测失败</span>`;
        }

        // 演进状态
        let evoBadge = '<span style="color:#bfbfbf;white-space:nowrap;">-</span>';
        if (item.status === 'AUTO_APPLIED') {
          evoBadge = '<span style="display:inline-flex;align-items:center;justify-content:center;gap:3px;color:#52c41a;font-weight:600;background:#f6ffed;border:1px solid #b7eb8f;padding:3px 8px;border-radius:12px;white-space:nowrap;font-size:11px;line-height:1;">已自动演进</span>';
        } else if (item.status === 'MANUAL_APPLIED') {
          evoBadge = '<span style="display:inline-flex;align-items:center;justify-content:center;gap:3px;color:#52c41a;font-weight:600;background:#f6ffed;border:1px solid #b7eb8f;padding:3px 8px;border-radius:12px;white-space:nowrap;font-size:11px;line-height:1;">已演进</span>';
        } else if (item.status === 'DETECTED' && item.hasManualReviewChanges) {
          evoBadge = '<span style="display:inline-flex;align-items:center;justify-content:center;gap:3px;color:#f5222d;font-weight:600;background:#fff1f0;border:1px solid #ffa39e;padding:3px 8px;border-radius:12px;white-space:nowrap;font-size:11px;line-height:1;">待人工审查</span>';
        } else if (item.status === 'DETECTED') {
          evoBadge = '<span style="display:inline-flex;align-items:center;justify-content:center;gap:3px;color:#fa8c16;font-weight:600;background:#fff7e6;border:1px solid #ffd591;padding:3px 8px;border-radius:12px;white-space:nowrap;font-size:11px;line-height:1;">待演进</span>';
        } else if (item.status === 'FAILED') {
          evoBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:3px;color:#f5222d;font-weight:600;background:#fff1f0;border:1px solid #ffa39e;padding:3px 8px;border-radius:12px;white-space:nowrap;font-size:11px;line-height:1;" title="${safeEscapeHtml(item.statusMsg || '')}">失败</span>`;
        }

        // 变动字段详情展示
        let detailHtml = '';
        if (item.addedColumns && item.addedColumns.length > 0) {
          detailHtml += '<div style="margin-bottom:3px;"><span style="color:#096dd9;font-weight:bold;font-size:11px;white-space:nowrap;">新增:</span> ';
          item.addedColumns.forEach(c => {
            detailHtml += `<span style="display:inline-flex;align-items:center;background:#e6f7ff;color:#096dd9;border:1px solid #91d5ff;padding:1px 6px;border-radius:3px;font-size:11px;margin:2px;white-space:nowrap;" title="类型:${safeEscapeHtml(c.writerType || c.readerType || '')} 注释:${safeEscapeHtml(c.writerComment || '')}">+ ${safeEscapeHtml(c.writerColumn || c.readerColumn)} <span style="color:#8c8c8c;font-size:10px;margin-left:2px;">(${safeEscapeHtml(c.writerType || 'string')})</span></span>`;
          });
          detailHtml += '</div>';
        }
        if (item.droppedColumns && item.droppedColumns.length > 0) {
          detailHtml += '<div style="margin-bottom:3px;"><span style="color:#cf1322;font-weight:bold;font-size:11px;white-space:nowrap;">已删除:</span> ';
          item.droppedColumns.forEach(c => {
            detailHtml += `<span style="display:inline-flex;align-items:center;background:#fff1f0;color:#cf1322;border:1px solid #ffa39e;padding:1px 6px;border-radius:3px;font-size:11px;margin:2px;white-space:nowrap;">- ${safeEscapeHtml(c)}</span>`;
          });
          detailHtml += '</div>';
        }
        if (item.tableCommentChanged) {
          detailHtml += `<div style="margin-bottom:3px;"><span style="color:#722ed1;font-weight:bold;font-size:11px;">表注释:</span> <span style="display:inline-flex;align-items:center;background:#f9f0ff;color:#531dab;border:1px solid #d3adf7;padding:1px 6px;border-radius:3px;font-size:11px;margin:2px;">${safeEscapeHtml(item.oldTableComment || '(空)')} -> ${safeEscapeHtml(item.newTableComment || '(空)')}</span></div>`;
        }
        if (item.columnCommentChanges && item.columnCommentChanges.length > 0) {
          detailHtml += '<div style="margin-bottom:3px;"><span style="color:#722ed1;font-weight:bold;font-size:11px;white-space:nowrap;">字段注释:</span> ';
          item.columnCommentChanges.forEach(cc => {
            detailHtml += `<span style="display:inline-flex;align-items:center;background:#f9f0ff;color:#531dab;border:1px solid #d3adf7;padding:1px 6px;border-radius:3px;font-size:11px;margin:2px;" title="${safeEscapeHtml(cc.oldComment || '')} -> ${safeEscapeHtml(cc.newComment || '')}">${safeEscapeHtml(cc.columnName)}: ${safeEscapeHtml(cc.oldComment || '(空)')} -> ${safeEscapeHtml(cc.newComment || '(空)')}</span>`;
          });
          detailHtml += '</div>';
        }
        if (item.columnSchemaChanges && item.columnSchemaChanges.length > 0) {
          detailHtml += '<div style="margin-bottom:3px;"><span style="color:#d46b08;font-weight:bold;font-size:11px;white-space:nowrap;">类型/可空(待审查):</span> ';
          item.columnSchemaChanges.forEach(sc => {
            const isBreaking = sc.riskLevel === 'BREAKING';
            const badgeBg = isBreaking ? '#fff1f0' : '#fff7e6';
            const badgeColor = isBreaking ? '#cf1322' : '#d46b08';
            const badgeBorder = isBreaking ? '#ffa39e' : '#ffd591';
            const riskTag = isBreaking ? '[高危]' : '[放宽]';
            let changeDesc = '';
            if (sc.typeChanged) {
              changeDesc += `${sc.targetOldType || '?'} -> ${sc.expectedNewType || sc.sourceRawType || '?'}`;
            }
            if (sc.nullableChanged) {
              const fromNull = sc.oldNullable === false ? 'NOT NULL' : 'NULL';
              const toNull = sc.newNullable === false ? 'NOT NULL' : 'NULL';
              changeDesc += (changeDesc ? ' | ' : '') + `${fromNull} -> ${toNull}`;
            }
            detailHtml += `<span style="display:inline-flex;align-items:center;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};padding:1px 6px;border-radius:3px;font-size:11px;margin:2px;font-weight:600;">${riskTag} ${safeEscapeHtml(sc.columnName)}: ${safeEscapeHtml(changeDesc)}</span>`;
          });
          detailHtml += '</div>';
        }
        if (item.targetWarningMsg) {
          detailHtml += `<div style="color:#8c8c8c;font-size:10px;margin-top:2px;">提示: ${safeEscapeHtml(item.targetWarningMsg)}</div>`;
        }
        if (!detailHtml) {
          detailHtml = '<span style="color:#bfbfbf;">无字段差异</span>';
        }

        // 建议 DDL 预览
        let ddlHtml = '-';
        if (item.recommendedDdl) {
          const encodedDdl = encodeURIComponent(item.recommendedDdl);
          ddlHtml = `<button type="button" class="datax-view-drift-ddl-btn" data-sql="${encodedDdl}" data-table="${safeEscapeHtml(item.writerTable || '')}" style="cursor:pointer;padding:2px 8px;background:#1890ff;color:#fff;border:none;border-radius:3px;font-size:11px;font-weight:bold;white-space:nowrap;">预览 DDL</button>`;
        }

        // 操作列
        let opHtml = '';
        const hasSafeActions = Boolean(item.autoSafeDdl) || (item.addedColumns && item.addedColumns.length > 0)
          || (item.droppedColumns && item.droppedColumns.length > 0)
          || item.tableCommentChanged || (item.columnCommentChanges && item.columnCommentChanges.length > 0);

        if (hasSafeActions) {
          const btnLabel = item.driftType === 'DROP_COLUMN' ? '剔除演进' : (item.hasManualReviewChanges ? '安全演进' : '演进');
          const btnBg = item.driftType === 'DROP_COLUMN' ? '#fa8c16' : '#52c41a';
          const applyScope = item.hasManualReviewChanges ? 'AUTO_SAFE' : 'ALL_REVIEWED';
          opHtml += `<button type="button" class="datax-apply-drift-btn" data-jobid="${item.jobId}" data-drift-type="${item.driftType}" data-apply-scope="${applyScope}" style="cursor:pointer;padding:2px 8px;background:${btnBg};color:#fff;border:none;border-radius:3px;font-size:11px;font-weight:bold;margin-right:4px;white-space:nowrap;">${btnLabel}</button>`;
        }
        if (item.hasManualReviewChanges) {
          opHtml += `<button type="button" class="datax-review-ddl-btn" data-jobid="${item.jobId}" style="cursor:pointer;padding:2px 8px;background:#f5222d;color:#fff;border:none;border-radius:3px;font-size:11px;font-weight:bold;margin-right:4px;white-space:nowrap;">审查DDL执行</button>`;
        }
        opHtml += `<button type="button" class="datax-history-drift-btn" data-jobid="${item.jobId}" style="cursor:pointer;padding:2px 6px;background:#f0f2f5;color:#595959;border:1px solid #d9d9d9;border-radius:3px;font-size:11px;white-space:nowrap;">历史</button>`;

        html += `
          <tr class="datax-drift-table-row" data-job-id="${item.jobId}" style="background:${isSel ? '#e6f7ff' : rowBg};border-bottom:1px solid #f0f0f0;cursor:pointer;">
            <td style="padding:8px 4px;text-align:center;white-space:nowrap;" onclick="event.stopPropagation();">
              <input type="checkbox" class="datax-drift-row-cb" data-job-id="${item.jobId}" ${isSel ? 'checked' : ''} style="cursor:pointer;" />
            </td>
            <td style="padding:8px 6px;color:#8c8c8c;text-align:center;white-space:nowrap;">${idx + 1}</td>
            <td style="padding:8px 6px;font-weight:bold;color:#1890ff;text-align:center;white-space:nowrap;">${item.jobId}</td>
            <td style="padding:8px 8px;word-break:break-all;">${safeEscapeHtml(item.jobDesc || '-')}</td>
            <td style="padding:8px 8px;font-weight:500;">${safeEscapeHtml(item.readerTable || '-')}</td>
            <td style="padding:8px 8px;font-weight:500;color:#722ed1;">${safeEscapeHtml(item.writerTable || '-')}</td>
            <td style="padding:8px 8px;text-align:center;white-space:nowrap;">${typeBadge}</td>
            <td style="padding:8px 8px;">${detailHtml}</td>
            <td style="padding:8px 8px;text-align:center;white-space:nowrap;">${ddlHtml}</td>
            <td style="padding:8px 8px;text-align:center;white-space:nowrap;">${evoBadge}</td>
            <td style="padding:8px 8px;text-align:center;white-space:nowrap;" onclick="event.stopPropagation();">${opHtml}</td>
          </tr>
        `;
      });

      tbody.innerHTML = html;

      // 绑定行复选框点击
      tbody.querySelectorAll('.datax-drift-row-cb').forEach(cb => {
        cb.onchange = (e) => {
          e.stopPropagation();
          const jid = parseInt(cb.getAttribute('data-job-id'), 10);
          if (cb.checked) {
            selectedDriftJobIds.add(jid);
          } else {
            selectedDriftJobIds.delete(jid);
          }
          updateDriftSelectionUI();
        };
      });

      // 绑定行点击选择（按住 Ctrl 多选，Shift 连续选，普通单选）
      tbody.querySelectorAll('.datax-drift-table-row').forEach((row, rIdx) => {
        row.onclick = (e) => {
          if (e.target.closest('button, input, a')) return;
          if (isUserSelectingText()) return; // 选中文本划词复制时，拦截整行选中切换
          const jid = parseInt(row.getAttribute('data-job-id'), 10);
          if (!jid) return;

          if (e.shiftKey && lastClickedDriftIndex !== -1) {
            const start = Math.min(lastClickedDriftIndex, rIdx);
            const end = Math.max(lastClickedDriftIndex, rIdx);
            for (let i = start; i <= end; i++) {
              const rowItem = items[i];
              if (rowItem && rowItem.jobId) selectedDriftJobIds.add(rowItem.jobId);
            }
          } else if (e.ctrlKey || e.metaKey) {
            if (selectedDriftJobIds.has(jid)) {
              selectedDriftJobIds.delete(jid);
            } else {
              selectedDriftJobIds.add(jid);
            }
            lastClickedDriftIndex = rIdx;
          } else {
            if (selectedDriftJobIds.has(jid) && selectedDriftJobIds.size === 1) {
              selectedDriftJobIds.clear();
            } else {
              selectedDriftJobIds.clear();
              selectedDriftJobIds.add(jid);
            }
            lastClickedDriftIndex = rIdx;
          }
          updateDriftSelectionUI();
        };
      });

      // 绑定表头全选/全不选
      const thCheckAll = modal.querySelector('#datax-drift-th-check-all');
      if (thCheckAll) {
        thCheckAll.onchange = () => {
          if (thCheckAll.checked) {
            items.forEach(i => { if (i.jobId) selectedDriftJobIds.add(i.jobId); });
          } else {
            selectedDriftJobIds.clear();
          }
          updateDriftSelectionUI();
        };
      }

      // 绑定预览 DDL
      tbody.querySelectorAll('.datax-view-drift-ddl-btn').forEach(btn => {
        btn.onclick = function() {
          const sql = decodeURIComponent(this.getAttribute('data-sql') || '');
          const table = this.getAttribute('data-table') || 'target_table';
          showDdlModal(`目标表 [${table}] 加列 DDL 预览`, sql);
        };
      });

      // 绑定单任务执行演进 (安全演进或全量演进)
      tbody.querySelectorAll('.datax-apply-drift-btn').forEach(btn => {
        btn.onclick = async function() {
          const jid = parseInt(this.getAttribute('data-jobid'), 10);
          const dType = this.getAttribute('data-drift-type') || '';
          const applyScope = this.getAttribute('data-apply-scope') || 'ALL_REVIEWED';
          if (!jid) return;

          let confirmTitle = '模式演进确认';
          let confirmType = 'info';
          let confirmBtnText = '立即演进';
          let confirmMsg = `确定为任务 [${jid}] 应用模式演进吗？\n系统将自动在目标库执行加列/注释 DDL 并重写任务配置。`;
          if (dType === 'DROP_COLUMN') {
            confirmTitle = '配置剔除演进确认';
            confirmType = 'warning';
            confirmBtnText = '确认剔除';
            confirmMsg = `确定为任务 [${jid}] 演进配置吗？\n系统将自动从任务 Reader/Writer 配置中剔除源库已删除的字段。\n（注：目标端 OBS/Hive 保持历史兼容，不执行破坏性物理 DROP）。`;
          } else if (applyScope === 'AUTO_SAFE') {
            confirmTitle = '安全变更演进确认';
            confirmType = 'info';
            confirmBtnText = '执行安全演进';
            confirmMsg = `确定为任务 [${jid}] 执行安全变更(加列/注释/配置清理)吗？\n（注：字段类型或可空性变更将被跳过，仍需后续人工审查执行）。`;
          } else if (dType === 'COMMENT_DRIFT') {
            confirmTitle = '注释同步演进确认';
            confirmType = 'info';
            confirmBtnText = '同步注释';
            confirmMsg = `确定将源表的表/字段注释同步到目标表 [${jid}] 吗？`;
          } else if (dType === 'MIXED') {
            confirmTitle = '混合模式演进确认';
            confirmType = 'warning';
            confirmBtnText = '立即演进';
            confirmMsg = `确定为任务 [${jid}] 应用模式演进吗？\n系统将自动在目标库执行加列/注释 DDL，并从配置中剔除已删除的字段。`;
          }

          const confirmed = await showDataxConfirm(confirmMsg, {
            title: confirmTitle,
            type: confirmType,
            confirmText: confirmBtnText
          });
          if (!confirmed) return;

          this.disabled = true;
          const origText = this.textContent;
          this.textContent = '演进中...';
          try {
            const resp = await fetch('/api/job/drift/apply', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                jobId: jid,
                handleDroppedColumns: true,
                applyScope: applyScope
              })
            });
            const res = await resp.json();
            if (res.code === 200 || res.code === 0) {
              showDataxNotice(`任务 [${jid}] 模式演进成功！`, { type: 'success', mode: 'toast' });
              doExecuteDrift(false);
            } else {
              showDataxNotice(`演进失败: ${res.msg || '未知错误'}`, { type: 'error' });
            }
          } catch (e) {
            showDataxNotice(`异常: ${e.message}`, { type: 'error' });
          } finally {
            this.disabled = false;
            this.textContent = origText;
          }
        };
      });

      // 绑定人工审查 DDL 弹窗
      tbody.querySelectorAll('.datax-review-ddl-btn').forEach(btn => {
        btn.onclick = function() {
          const jid = parseInt(this.getAttribute('data-jobid'), 10);
          const item = currentDriftItems.find(it => it.jobId === jid);
          if (item) {
            openManualReviewDdlModal(item);
          }
        };
      });

      // 绑定查看历史与回滚
      tbody.querySelectorAll('.datax-history-drift-btn').forEach(btn => {
        btn.onclick = async function() {
          const jid = parseInt(this.getAttribute('data-jobid'), 10);
          if (!jid) return;
          try {
            const resp = await fetch(`/api/job/drift/history/${jid}`, { headers: getAuthHeaders() });
            const res = await resp.json();
            const logs = res.content || res.data || [];
            if (logs.length === 0) {
              showDataxNotice(`任务 [${jid}] 暂无模式演进历史记录`, { type: 'info', mode: 'toast' });
              return;
            }
            openDriftHistoryModal(jid, logs);
          } catch (e) {
            showDataxNotice(`获取历史记录失败: ${e.message}`, { type: 'error' });
          }
        };
      });

      // 绑定通用矩形框选引擎 (Marquee Selection Engine)
      if (cleanupDriftMarquee) cleanupDriftMarquee();

      const driftMarquee = bindMarqueeSelection({
        container: modal.querySelector('#datax-drift-table-container'),
        rowSelector: '.datax-drift-table-row',
        checkboxSelector: '.datax-drift-row-cb',
        getIdFromRow: row => parseInt(row.getAttribute('data-job-id'), 10),
        selectedSet: selectedDriftJobIds,
        selectedBg: '#e6f7ff',
        selectionBoxId: 'datax-drift-selection-box',
        canStartSelection: e => e.altKey || !e.target.closest('button, input, select, a, #datax-drift-floating-bar, #datax-drift-th-check-all'),
        onSelectionChange: ({ isDragging }) => {
          if (!isDragging) {
            updateDriftSelectionUI();
          } else {
            const floatingBar = modal.querySelector('#datax-drift-floating-bar');
            const floatingTotal = modal.querySelector('#datax-drift-floating-total-count');
            if (floatingBar) floatingBar.style.display = selectedDriftJobIds.size > 0 ? 'flex' : 'none';
            if (floatingTotal) floatingTotal.textContent = String(selectedDriftJobIds.size);
          }
        }
      });

      cleanupDriftMarquee = () => {
        if (driftMarquee && typeof driftMarquee.cleanup === 'function') {
          driftMarquee.cleanup();
        }
      };

      updateDriftSelectionUI();
    }

      // 公共方法：构建字段类型/可空性变更表格行 HTML
      function buildSchemaChangeRowsHtml(changes) {
        let rows = '';
        (changes || []).forEach(sc => {
          const isBreaking = sc.riskLevel === 'BREAKING';
          const riskBadge = isBreaking
            ? '<span style="background:#fff1f0;color:#cf1322;border:1px solid #ffa39e;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:bold;">高危收缩</span>'
            : '<span style="background:#fff7e6;color:#d46b08;border:1px solid #ffd591;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:bold;">放宽调整</span>';
          const oldNull = sc.oldNullable === false ? 'NOT NULL' : (sc.oldNullable === true ? 'NULL' : '-');
          const newNull = sc.newNullable === false ? 'NOT NULL' : (sc.newNullable === true ? 'NULL' : '-');
          rows += `
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:6px 8px;font-weight:600;">${safeEscapeHtml(sc.columnName || '')}</td>
              <td style="padding:6px 8px;">${riskBadge}</td>
              <td style="padding:6px 8px;font-family:monospace;">${safeEscapeHtml(sc.targetOldType || '-')} -> <strong style="color:#1890ff;">${safeEscapeHtml(sc.expectedNewType || sc.sourceRawType || '-')}</strong></td>
              <td style="padding:6px 8px;">${safeEscapeHtml(oldNull)} -> <strong>${safeEscapeHtml(newNull)}</strong></td>
            </tr>
          `;
        });
        return rows;
      }

      // 人工审查并编辑执行高风险 DDL 弹窗 (字段类型与可空性变更专用)
      function openManualReviewDdlModal(item) {
        const existingR = document.getElementById('datax-drift-review-modal');
        if (existingR) existingR.remove();

        const rModal = document.createElement('div');
        rModal.id = 'datax-drift-review-modal';
        rModal.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
        rModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000035;display:flex;align-items:center;justify-content:center;';

        const changesRows = buildSchemaChangeRowsHtml(item.columnSchemaChanges);

        const defaultSql = item.manualReviewDdl || '';
        rModal.innerHTML = `
          <div style="width:780px;max-width:92vw;max-height:85vh;background:#fff;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.35);">
            <div style="padding:12px 18px;background:#f5222d;color:#fff;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:bold;font-size:14px;">人工审查与执行结构变更 DDL - 任务 #${item.jobId} (${safeEscapeHtml(item.writerTable || '')})</span>
              <span id="datax-review-modal-close" style="cursor:pointer;font-size:20px;line-height:1;">&times;</span>
            </div>
            <div style="padding:14px 18px;overflow:auto;flex:1;font-size:12px;">
              <div style="background:#fff1f0;border:1px solid #ffa39e;color:#cf1322;padding:8px 12px;border-radius:4px;margin-bottom:12px;">
                以下字段存在数据类型、精度或必填约束(NOT NULL)变更，自动演进已跳过。请核对目标库历史数据兼容性后，审查或编辑下方 DDL 再手动执行。
              </div>
              <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #e8e8e8;">
                <thead>
                  <tr style="background:#fafafa;border-bottom:1px solid #e8e8e8;text-align:left;">
                    <th style="padding:6px 8px;">字段名</th>
                    <th style="padding:6px 8px;">风险评估</th>
                    <th style="padding:6px 8px;">类型变更 (目标 -> 预期)</th>
                    <th style="padding:6px 8px;">可空性变更</th>
                  </tr>
                </thead>
                <tbody>${changesRows}</tbody>
              </table>
              <div style="margin-bottom:6px;font-weight:600;color:#262626;">待执行 DDL (支持手动修改):</div>
              <textarea id="datax-review-ddl-textarea" style="width:100%;height:150px;font-family:Consolas,Monaco,monospace;font-size:12px;padding:10px;border:1px solid #d9d9d9;border-radius:4px;box-sizing:border-box;background:#fafafa;color:#262626;">${safeEscapeHtml(defaultSql)}</textarea>
              <label style="display:flex;align-items:center;gap:6px;margin-top:10px;cursor:pointer;color:#595959;">
                <input type="checkbox" id="datax-review-sync-types" checked />
                <span>同步更新任务 Writer 字段类型 (仅对 JSON 对象数组型插件如 hdfswriter 生效)</span>
              </label>
            </div>
            <div style="padding:10px 18px;background:#fafafa;border-top:1px solid #e8e8e8;display:flex;justify-content:flex-end;gap:10px;">
              <button type="button" id="datax-review-modal-cancel" style="padding:5px 14px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
              <button type="button" id="datax-review-modal-exec" style="padding:5px 16px;background:#f5222d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">确认执行 DDL</button>
            </div>
          </div>
        `;
        document.body.appendChild(rModal);

        const closeReview = () => rModal.remove();
        rModal.querySelector('#datax-review-modal-close').onclick = closeReview;
        rModal.querySelector('#datax-review-modal-cancel').onclick = closeReview;
        rModal.querySelector('#datax-review-modal-exec').onclick = async function() {
          const customSql = (rModal.querySelector('#datax-review-ddl-textarea').value || '').trim();
          const syncTypes = rModal.querySelector('#datax-review-sync-types').checked;
          if (!customSql) {
            showDataxNotice('待执行 DDL 不能为空！', { type: 'warning', mode: 'toast' });
            return;
          }
          const confirmed = await showDataxConfirm(
            `确认对任务 [${item.jobId}] 的目标表 [${item.writerTable || ''}] 执行已审查的 DDL 吗？`,
            { title: '执行人工审查 DDL', type: 'warning', confirmText: '立即执行' }
          );
          if (!confirmed) return;

          this.disabled = true;
          this.textContent = '执行中...';
          try {
            const resp = await fetch('/api/job/drift/apply', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                jobId: item.jobId,
                applyScope: 'MANUAL_REVIEW',
                customDdl: customSql,
                syncJobColumnTypes: syncTypes,
                handleDroppedColumns: false
              })
            });
            const res = await resp.json();
            if (res.code === 200 || res.code === 0) {
              showDataxNotice(`任务 [${item.jobId}] 人工审查 DDL 执行成功！`, { type: 'success', mode: 'toast' });
              closeReview();
              doExecuteDrift(false);
            } else {
              showDataxNotice(`执行失败: ${res.msg || '未知错误'}`, { type: 'error' });
            }
          } catch (e) {
            showDataxNotice(`执行异常: ${e.message}`, { type: 'error' });
          } finally {
            this.disabled = false;
            this.textContent = '确认执行 DDL';
          }
        };
      }

      // 批量人工审查并编辑执行高风险 DDL 弹窗 (带二次确认)
      function openBatchManualReviewDdlModal(reviewItems) {
        if (!reviewItems || reviewItems.length === 0) {
          showDataxNotice('当前没有待人工审查的类型或可空性变更任务！', { type: 'warning', mode: 'toast' });
          return;
        }
        const existingB = document.getElementById('datax-drift-batch-review-modal');
        if (existingB) existingB.remove();

        let totalBreakingCount = 0;
        let totalChangeCount = 0;
        let cardsHtml = '';
        reviewItems.forEach(item => {
          const changes = item.columnSchemaChanges || [];
          totalChangeCount += changes.length;
          totalBreakingCount += changes.filter(c => c.riskLevel === 'BREAKING').length;
          const rowsHtml = buildSchemaChangeRowsHtml(changes);
          cardsHtml += `
            <div style="border:1px solid #e8e8e8;border-radius:6px;margin-bottom:12px;overflow:hidden;background:#fff;">
              <div style="padding:8px 12px;background:#fafafa;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div style="font-weight:600;color:#262626;">
                  任务 #${item.jobId} - ${safeEscapeHtml(item.jobDesc || '')}
                  <span style="color:#722ed1;margin-left:8px;">目标表: ${safeEscapeHtml(item.writerTable || '-')}</span>
                </div>
                <span style="color:#cf1322;font-size:11px;font-weight:bold;">${changes.length} 项变更</span>
              </div>
              <div style="padding:10px 12px;">
                <table style="width:100%;border-collapse:collapse;margin-bottom:8px;border:1px solid #f0f0f0;">
                  <thead>
                    <tr style="background:#fafafa;border-bottom:1px solid #e8e8e8;text-align:left;">
                      <th style="padding:5px 8px;">字段名</th>
                      <th style="padding:5px 8px;">风险评估</th>
                      <th style="padding:5px 8px;">类型变更 (目标 -> 预期)</th>
                      <th style="padding:5px 8px;">可空性变更</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
                <div style="font-size:11px;font-weight:600;color:#595959;margin-bottom:4px;">待执行 DDL (支持按任务微调):</div>
                <textarea class="datax-batch-review-ddl" data-jobid="${item.jobId}" style="width:100%;height:96px;font-family:Consolas,Monaco,monospace;font-size:12px;padding:8px;border:1px solid #d9d9d9;border-radius:4px;box-sizing:border-box;background:#fafafa;color:#262626;">${safeEscapeHtml(item.manualReviewDdl || '')}</textarea>
              </div>
            </div>
          `;
        });

        const bModal = document.createElement('div');
        bModal.id = 'datax-drift-batch-review-modal';
        bModal.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
        bModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000035;display:flex;align-items:center;justify-content:center;';
        bModal.innerHTML = `
          <div style="width:880px;max-width:94vw;max-height:88vh;background:#fff;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.35);">
            <div style="padding:12px 18px;background:#f5222d;color:#fff;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:bold;font-size:14px;">批量人工审查与执行结构变更 DDL (${reviewItems.length} 个任务)</span>
              <span id="datax-batch-review-close" style="cursor:pointer;font-size:20px;line-height:1;">&times;</span>
            </div>
            <div style="padding:14px 18px;overflow:auto;flex:1;font-size:12px;background:#f5f5f5;">
              <div style="background:#fff1f0;border:1px solid #ffa39e;color:#cf1322;padding:8px 12px;border-radius:4px;margin-bottom:12px;">
                本次共涉及 ${reviewItems.length} 个任务、${totalChangeCount} 项类型或必填约束变更（其中高危收缩 ${totalBreakingCount} 项）。请逐一核对 DDL 后执行，物理 DDL 变更不可自动回滚。
              </div>
              ${cardsHtml}
              <label style="display:flex;align-items:center;gap:6px;margin-top:4px;cursor:pointer;color:#595959;">
                <input type="checkbox" id="datax-batch-review-sync-types" checked />
                <span>同步更新任务 Writer 字段类型 (仅对 JSON 对象数组型插件如 hdfswriter 生效)</span>
              </label>
            </div>
            <div style="padding:10px 18px;background:#fafafa;border-top:1px solid #e8e8e8;display:flex;justify-content:flex-end;gap:10px;">
              <button type="button" id="datax-batch-review-cancel" style="padding:5px 14px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;font-size:12px;">取消</button>
              <button type="button" id="datax-batch-review-exec" style="padding:5px 16px;background:#f5222d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">批量执行已审查 DDL</button>
            </div>
          </div>
        `;
        document.body.appendChild(bModal);

        const closeBatchReview = () => bModal.remove();
        bModal.querySelector('#datax-batch-review-close').onclick = closeBatchReview;
        bModal.querySelector('#datax-batch-review-cancel').onclick = closeBatchReview;
        bModal.querySelector('#datax-batch-review-exec').onclick = async function() {
          const textareas = Array.from(bModal.querySelectorAll('.datax-batch-review-ddl'));
          const payloadList = [];
          for (const ta of textareas) {
            const jid = parseInt(ta.getAttribute('data-jobid'), 10);
            const sql = (ta.value || '').trim();
            if (!sql) {
              showDataxNotice(`任务 [${jid}] 的待执行 DDL 不能为空！`, { type: 'warning', mode: 'toast' });
              return;
            }
            payloadList.push({ jobId: jid, customDdl: sql });
          }
          const syncTypes = bModal.querySelector('#datax-batch-review-sync-types').checked;

          // 二次确认防护
          const confirmed = await showDataxConfirm(
            `二次确认：确定要批量对 ${payloadList.length} 个任务的目标表执行人工审查后的结构变更 DDL 吗？\n\n本次共 ${totalChangeCount} 项变更（含高危收缩 ${totalBreakingCount} 项），DDL 一经物理执行无法自动撤销。`,
            { title: '批量执行 DDL 二次确认', type: 'warning', confirmText: '确认批量执行' }
          );
          if (!confirmed) return;

          this.disabled = true;
          this.textContent = `执行中 (0/${payloadList.length})...`;
          let successCount = 0;
          const failMsgs = [];

          for (let idx = 0; idx < payloadList.length; idx++) {
            const entry = payloadList[idx];
            this.textContent = `执行中 (${idx + 1}/${payloadList.length})...`;
            try {
              const resp = await fetch('/api/job/drift/apply', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  jobId: entry.jobId,
                  applyScope: 'MANUAL_REVIEW',
                  customDdl: entry.customDdl,
                  syncJobColumnTypes: syncTypes,
                  handleDroppedColumns: false
                })
              });
              const res = await resp.json();
              if (res.code === 200 || res.code === 0) {
                successCount++;
              } else {
                failMsgs.push(`任务[${entry.jobId}]: ${res.msg || '未知错误'}`);
              }
            } catch (e) {
              failMsgs.push(`任务[${entry.jobId}]: ${e.message}`);
            }
          }

          this.disabled = false;
          this.textContent = '批量执行已审查 DDL';

          if (failMsgs.length === 0) {
            showDataxNotice(`批量审查演进完成：成功执行 ${successCount} 个任务。`, { type: 'success', mode: 'toast' });
            closeBatchReview();
          } else {
            showDataxNotice(`批量审查演进完成：成功 ${successCount} 个，失败 ${failMsgs.length} 个。\n${failMsgs.join('\n')}`, { type: 'warning' });
          }
          doExecuteDrift(false);
        };
      }

      // 历史卡片列表弹窗 (z-index 设为 1000030，确保始终处于演进看板之上)
      function openDriftHistoryModal(jid, logs) {
        const existingH = document.getElementById('datax-drift-history-modal');
        if (existingH) existingH.remove();

        const hModal = document.createElement('div');
        hModal.id = 'datax-drift-history-modal';
        hModal.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
        hModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000030;display:flex;align-items:center;justify-content:center;';

        let listHtml = '';
        logs.forEach(l => {
          let statusBadge = '';
          if (l.status === 'DETECTED') {
            statusBadge = '<span style="color:#d48806;background:#fffbe6;border:1px solid #ffe58f;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">⏳ 待演进</span>';
          } else if (l.status === 'NORMAL') {
            statusBadge = '<span style="color:#52c41a;background:#f6ffed;border:1px solid #b7eb8f;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">🟢 正常</span>';
          } else if (l.status === 'MANUAL_APPLIED') {
            statusBadge = '<span style="color:#52c41a;background:#f6ffed;border:1px solid #b7eb8f;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">✅ 已演进</span>';
          } else if (l.status === 'AUTO_APPLIED') {
            statusBadge = '<span style="color:#52c41a;background:#f6ffed;border:1px solid #b7eb8f;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">✅ 已自动演进</span>';
          } else if (l.status === 'ROLLED_BACK') {
            statusBadge = '<span style="color:#722ed1;background:#f9f0ff;border:1px solid #d3adf7;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">↩️ 已回滚</span>';
          } else if (l.status === 'FAILED') {
            statusBadge = '<span style="color:#cf1322;background:#fff1f0;border:1px solid #ffa39e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">❌ 失败</span>';
          } else {
            statusBadge = `<span style="color:#8c8c8c;background:#f5f5f5;border:1px solid #d9d9d9;padding:2px 8px;border-radius:10px;font-size:11px;">${safeEscapeHtml(l.status || '-')}</span>`;
          }

          let typeText = '-';
          if (l.driftType === 'ADD_COLUMN') {
            typeText = '<span style="color:#096dd9;font-weight:600;">新增字段 (ADD_COLUMN)</span>';
          } else if (l.driftType === 'DROP_COLUMN') {
            typeText = '<span style="color:#cf1322;font-weight:600;">删除字段 (DROP_COLUMN)</span>';
          } else if (l.driftType === 'COMMENT_DRIFT') {
            typeText = '<span style="color:#722ed1;font-weight:600;">注释变更 (COMMENT_DRIFT)</span>';
          } else if (l.driftType === 'SCHEMA_CHANGE') {
            typeText = '<span style="color:#d46b08;font-weight:600;">类型/可空变更 (SCHEMA_CHANGE)</span>';
          } else if (l.driftType === 'MIXED') {
            typeText = '<span style="color:#d48806;font-weight:600;">混合变动 (MIXED)</span>';
          } else if (l.driftType === 'NONE') {
            typeText = '<span style="color:#52c41a;font-weight:600;">无变动 (NONE)</span>';
          } else if (l.driftType) {
            typeText = `<span style="font-weight:600;">${safeEscapeHtml(l.driftType)}</span>`;
          }

          const hasRollback = !!l.beforeJobJson && l.status !== 'ROLLED_BACK';

          // 解析变动字段详情
          let addedCols = [];
          let droppedCols = [];
          let tableCommentChanged = false;
          let oldTableComment = '';
          let newTableComment = '';
          let commentChanges = [];
          let schemaChanges = [];
          if (l.driftDetailJson) {
            try {
              const detail = typeof l.driftDetailJson === 'string' ? JSON.parse(l.driftDetailJson) : l.driftDetailJson;
              if (detail) {
                if (Array.isArray(detail.addedColumns)) addedCols = detail.addedColumns;
                if (Array.isArray(detail.droppedColumns)) droppedCols = detail.droppedColumns;
                tableCommentChanged = Boolean(detail.tableCommentChanged);
                oldTableComment = detail.oldTableComment || '';
                newTableComment = detail.newTableComment || '';
                if (Array.isArray(detail.columnCommentChanges)) commentChanges = detail.columnCommentChanges;
                if (Array.isArray(detail.columnSchemaChanges)) schemaChanges = detail.columnSchemaChanges;
              }
            } catch (e) {}
          }
          // 智能兜底：若 detailJson 为空，通过对比演进前后 Job JSON 还原变动列
          if (addedCols.length === 0 && droppedCols.length === 0 && l.beforeJobJson && l.afterJobJson) {
            try {
              const bJson = JSON.parse(l.beforeJobJson);
              const aJson = JSON.parse(l.afterJobJson);
              const getCols = (root) => {
                const p = root && root.job && root.job.content && root.job.content[0] && root.job.content[0].reader && root.job.content[0].reader.parameter;
                const c = p && p.column;
                if (Array.isArray(c)) {
                  return c.map(x => (typeof x === 'string' ? x : (x && x.name ? x.name : ''))).filter(Boolean);
                }
                return [];
              };
              const bCols = getCols(bJson);
              const aCols = getCols(aJson);
              const bSet = new Set(bCols.map(x => x.toLowerCase().replace(/[`"]/g, '')));
              const aSet = new Set(aCols.map(x => x.toLowerCase().replace(/[`"]/g, '')));
              aCols.forEach(c => {
                const clean = c.toLowerCase().replace(/[`"]/g, '');
                if (!bSet.has(clean)) addedCols.push({ writerColumn: c });
              });
              bCols.forEach(c => {
                const clean = c.toLowerCase().replace(/[`"]/g, '');
                if (!aSet.has(clean)) droppedCols.push(c);
              });
            } catch (e) {}
          }

          let colsSectionHtml = '';
          if (addedCols.length > 0 || droppedCols.length > 0 || tableCommentChanged || commentChanges.length > 0 || schemaChanges.length > 0) {
            colsSectionHtml += `
              <div style="margin:8px 0 6px 0;background:#ffffff;border:1px solid #e8e8e8;border-radius:6px;padding:8px 12px;">
                <div style="font-size:11px;font-weight:bold;color:#595959;margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <span>处理变动明细：</span>
                  ${addedCols.length > 0 ? `<span style="background:#e6f7ff;color:#096dd9;border:1px solid #91d5ff;padding:0 6px;border-radius:10px;font-size:10px;font-weight:600;">新增 ${addedCols.length} 列</span>` : ''}
                  ${droppedCols.length > 0 ? `<span style="background:#fff1f0;color:#cf1322;border:1px solid #ffa39e;padding:0 6px;border-radius:10px;font-size:10px;font-weight:600;">剔除 ${droppedCols.length} 列</span>` : ''}
                  ${(tableCommentChanged || commentChanges.length > 0) ? `<span style="background:#f9f0ff;color:#722ed1;border:1px solid #d3adf7;padding:0 6px;border-radius:10px;font-size:10px;font-weight:600;">注释变更 ${(tableCommentChanged ? 1 : 0) + commentChanges.length}</span>` : ''}
                  ${schemaChanges.length > 0 ? `<span style="background:#fff7e6;color:#d46b08;border:1px solid #ffd591;padding:0 6px;border-radius:10px;font-size:10px;font-weight:600;">类型/可空 ${schemaChanges.length} 列</span>` : ''}
                </div>
            `;
            if (addedCols.length > 0) {
              colsSectionHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;align-items:center;">
                <span style="color:#096dd9;font-weight:600;font-size:11px;white-space:nowrap;">+ 新增同步:</span>`;
              addedCols.forEach(c => {
                const colName = typeof c === 'string' ? c : (c.writerColumn || c.readerColumn || '');
                const colType = typeof c === 'object' ? (c.writerType || c.readerType || '') : '';
                const colComment = typeof c === 'object' ? (c.writerComment || '') : '';
                colsSectionHtml += `<span style="display:inline-flex;align-items:center;background:#e6f7ff;color:#096dd9;border:1px solid #91d5ff;padding:2px 8px;border-radius:4px;font-size:11px;" title="类型: ${safeEscapeHtml(colType)} 注释: ${safeEscapeHtml(colComment)}">
                  <strong>+ ${safeEscapeHtml(colName)}</strong>
                  ${colType ? `<span style="color:#8c8c8c;font-size:10px;margin-left:4px;">(${safeEscapeHtml(colType)})</span>` : ''}
                </span>`;
              });
              colsSectionHtml += `</div>`;
            }
            if (droppedCols.length > 0) {
              colsSectionHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;align-items:center;">
                <span style="color:#cf1322;font-weight:600;font-size:11px;white-space:nowrap;">- 剔除字段:</span>`;
              droppedCols.forEach(c => {
                const colName = typeof c === 'string' ? c : (c.readerColumn || c.writerColumn || String(c));
                colsSectionHtml += `<span style="display:inline-flex;align-items:center;background:#fff1f0;color:#cf1322;border:1px solid #ffa39e;padding:2px 8px;border-radius:4px;font-size:11px;" title="源库已删除，已自动从 DataX 任务配置中安全剔除">
                  <strong>- ${safeEscapeHtml(colName)}</strong>
                  <span style="color:#8c8c8c;font-size:10px;margin-left:4px;">(目标端OBS保留兼容)</span>
                </span>`;
              });
              colsSectionHtml += `</div>`;
            }
            if (tableCommentChanged) {
              colsSectionHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;align-items:center;">
                <span style="color:#722ed1;font-weight:600;font-size:11px;white-space:nowrap;">表注释:</span>
                <span style="background:#f9f0ff;color:#531dab;border:1px solid #d3adf7;padding:2px 8px;border-radius:4px;font-size:11px;">${safeEscapeHtml(oldTableComment || '(空)')} -> ${safeEscapeHtml(newTableComment || '(空)')}</span>
              </div>`;
            }
            if (commentChanges.length > 0) {
              colsSectionHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;align-items:center;">
                <span style="color:#722ed1;font-weight:600;font-size:11px;white-space:nowrap;">字段注释:</span>`;
              commentChanges.forEach(cc => {
                colsSectionHtml += `<span style="background:#f9f0ff;color:#531dab;border:1px solid #d3adf7;padding:2px 8px;border-radius:4px;font-size:11px;">${safeEscapeHtml(cc.columnName || '')}: ${safeEscapeHtml(cc.oldComment || '(空)')} -> ${safeEscapeHtml(cc.newComment || '(空)')}</span>`;
              });
              colsSectionHtml += `</div>`;
            }
            if (schemaChanges.length > 0) {
              colsSectionHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                <span style="color:#d46b08;font-weight:600;font-size:11px;white-space:nowrap;">类型/可空:</span>`;
              schemaChanges.forEach(sc => {
                const isBreaking = sc.riskLevel === 'BREAKING';
                const bg = isBreaking ? '#fff1f0' : '#fff7e6';
                const fg = isBreaking ? '#cf1322' : '#d46b08';
                const bd = isBreaking ? '#ffa39e' : '#ffd591';
                colsSectionHtml += `<span style="background:${bg};color:${fg};border:1px solid ${bd};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${safeEscapeHtml(sc.columnName || '')}: ${safeEscapeHtml(sc.targetOldType || '-')} -> ${safeEscapeHtml(sc.expectedNewType || sc.sourceRawType || '-')}</span>`;
              });
              colsSectionHtml += `</div>`;
            }
            colsSectionHtml += `</div>`;
          } else if (l.driftType && l.driftType !== 'NONE') {
            colsSectionHtml += `<div style="margin:4px 0;font-size:11px;color:#bfbfbf;">（历史快照中无具体字段变动明细）</div>`;
          }

          listHtml += `
            <div style="border:1px solid #e8e8e8;border-radius:6px;padding:12px;margin-bottom:10px;background:#fafafa;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <strong style="color:#1890ff;font-size:13px;">#${l.id}</strong>
                  <span style="color:#8c8c8c;font-size:12px;">${safeEscapeHtml(l.createTime || '-')}</span>
                  ${statusBadge}
                  <span style="font-size:12px;color:#595959;">类型: ${typeText}</span>
                  <span style="font-size:11px;color:#8c8c8c;background:#fff;border:1px solid #e8e8e8;padding:1px 6px;border-radius:3px;">操作人: <strong>${safeEscapeHtml(l.createBy || 'admin')}</strong></span>
                  ${l.batchNo ? `<span style="font-size:10px;color:#bfbfbf;">${safeEscapeHtml(l.batchNo)}</span>` : ''}
                </div>
                <div>
                  ${hasRollback ? `<button class="datax-rollback-log-btn" data-logid="${l.id}" style="background:#722ed1;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;transition:background 0.15s;">↩️ 回滚至此版本前</button>` : ''}
                </div>
              </div>
              ${colsSectionHtml}
              ${l.targetDdl ? `
                <div style="margin-top:6px;background:#282c34;padding:8px 12px;border-radius:4px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="color:#61afef;font-size:11px;font-weight:bold;">目标端执行 DDL：</span>
                    <button type="button" class="datax-copy-ddl-btn" data-sql="${encodeURIComponent(l.targetDdl)}" style="background:#3e4451;color:#abb2bf;border:1px solid #4b5263;border-radius:3px;padding:2px 8px;font-size:10px;cursor:pointer;">复制 DDL</button>
                  </div>
                  <div style="font-family:Consolas,Monaco,monospace;font-size:11px;color:#98c379;white-space:pre-wrap;word-break:break-all;">${safeEscapeHtml(l.targetDdl)}</div>
                </div>` : ''}
              ${l.statusMsg ? `<div style="margin-top:6px;color:#595959;font-size:12px;background:#fff;border:1px solid #f0f0f0;padding:4px 8px;border-radius:4px;">💬 说明: ${safeEscapeHtml(l.statusMsg)}</div>` : ''}
            </div>
          `;
        });

        hModal.innerHTML = `
          <div style="background:#fff;border-radius:8px;width:880px;max-width:95vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 36px rgba(0,0,0,0.35);">
            <div style="padding:12px 18px;background:linear-gradient(90deg,#722ed1,#9254de);color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
              <strong>任务 [${jid}] 模式演进历史与快照</strong>
              <span id="datax-drift-history-close" style="cursor:pointer;font-size:20px;font-weight:bold;">&times;</span>
            </div>
            <div style="padding:16px;flex:1;overflow-y:auto;">
              ${listHtml}
            </div>
            <div style="padding:10px 18px;border-top:1px solid #e8e8e8;display:flex;justify-content:flex-end;">
              <button id="datax-drift-history-btn-close" style="padding:4px 16px;background:#fff;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;font-size:12px;color:#595959;">关闭</button>
            </div>
          </div>
        `;
        document.body.appendChild(hModal);
        hModal.onclick = (e) => { if (e.target === hModal) hModal.remove(); };
        hModal.querySelector('#datax-drift-history-close').onclick = () => hModal.remove();
        hModal.querySelector('#datax-drift-history-btn-close').onclick = () => hModal.remove();

        hModal.querySelectorAll('.datax-copy-ddl-btn').forEach(btn => {
          btn.onclick = function() {
            const sql = decodeURIComponent(this.getAttribute('data-sql') || '');
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(sql).then(() => {
                showDataxNotice('🎉 DDL 已成功复制到剪贴板！', { type: 'success', mode: 'toast' });
              });
            } else {
              const ta = document.createElement('textarea');
              ta.value = sql;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
              showDataxNotice('🎉 DDL 已成功复制到剪贴板！', { type: 'success', mode: 'toast' });
            }
          };
        });

        hModal.querySelectorAll('.datax-rollback-log-btn').forEach(btn => {
          btn.onclick = async function() {
            const lid = this.getAttribute('data-logid');
            const confirmed = await showDataxConfirm(
              `确定要将任务 [${jid}] 回滚至记录 #${lid} 执行前的 Job JSON 快照吗？\n回滚后任务配置将自动恢复为历史版本。`,
              { title: '历史快照回滚确认', type: 'warning', confirmText: '确认回滚' }
            );
            if (!confirmed) return;
            try {
              const resp = await fetch(`/api/job/drift/rollback/${lid}`, { method: 'POST', headers: getAuthHeaders() });
              const res = await resp.json();
              if (res.code === 200 || res.code === 0) {
                showDataxNotice('🎉 回滚成功！任务配置已恢复为历史快照。', { type: 'success', mode: 'toast' });
                hModal.remove();
                doExecuteDrift(false);
              } else {
                showDataxNotice('回滚失败: ' + (res.msg || '未知错误'), { type: 'error' });
              }
            } catch (e) {
              showDataxNotice('回滚请求异常: ' + e.message, { type: 'error' });
            }
          };
        });
      }

    // 悬浮条操作事件绑定
    const floatingClearBtn = modal.querySelector('#datax-drift-floating-btn-clear');
    if (floatingClearBtn) {
      floatingClearBtn.onclick = () => {
        selectedDriftJobIds.clear();
        updateDriftSelectionUI();
      };
    }
    const floatingDetectBtn = modal.querySelector('#datax-drift-floating-btn-detect');
    if (floatingDetectBtn) {
      floatingDetectBtn.onclick = () => {
        if (selectedDriftJobIds.size === 0) return;
        doExecuteDrift(false, Array.from(selectedDriftJobIds));
      };
    }
    const floatingApplyBtn = modal.querySelector('#datax-drift-floating-btn-apply');
    if (floatingApplyBtn) {
      floatingApplyBtn.onclick = async () => {
        const selEvoItems = currentDriftItems.filter(i => selectedDriftJobIds.has(i.jobId) && (i.driftType === 'ADD_COLUMN' || i.driftType === 'MIXED' || i.driftType === 'DROP_COLUMN' || i.driftType === 'COMMENT_DRIFT'));
        if (selEvoItems.length === 0) {
          showDataxNotice('所选任务中暂无可自动演进的安全变更（新增/删列/注释）！', { type: 'warning', mode: 'toast' });
          return;
        }
        const confirmed = await showDataxConfirm(
          `确定要对框选的 ${selEvoItems.length} 个任务执行安全自动演进吗？\n\n• 新增字段与表/列注释：自动在目标端执行\n• 删除字段：自动从任务配置中剔除\n• 类型/可空性变更：自动跳过，需人工审查后手动执行`,
          { title: '批量安全演进确认', type: 'warning', confirmText: '立即批量演进' }
        );
        if (!confirmed) return;
        doExecuteDrift(true, selEvoItems.map(i => i.jobId));
      };
    }
    const floatingReviewBtn = modal.querySelector('#datax-drift-floating-btn-review');
    if (floatingReviewBtn) {
      floatingReviewBtn.onclick = () => {
        const selReviewItems = currentDriftItems.filter(i => selectedDriftJobIds.has(i.jobId) && i.hasManualReviewChanges);
        openBatchManualReviewDdlModal(selReviewItems);
      };
    }

    // 绑定顶部按钮
    modal.querySelector('#datax-drift-btn-detect').onclick = () => {
      if (selectedDriftJobIds.size > 0) {
        doExecuteDrift(false, Array.from(selectedDriftJobIds));
      } else {
        doExecuteDrift(false);
      }
    };
    const topBatchReviewBtn = modal.querySelector('#datax-drift-btn-batch-review');
    if (topBatchReviewBtn) {
      topBatchReviewBtn.onclick = () => {
        const targetReviewItems = selectedDriftJobIds.size > 0
          ? currentDriftItems.filter(i => selectedDriftJobIds.has(i.jobId) && i.hasManualReviewChanges)
          : currentDriftItems.filter(i => i.hasManualReviewChanges);
        openBatchManualReviewDdlModal(targetReviewItems);
      };
    }
    modal.querySelector('#datax-drift-btn-auto-apply').onclick = async () => {
      if (selectedDriftJobIds.size > 0) {
        const selEvoItems = currentDriftItems.filter(i => selectedDriftJobIds.has(i.jobId) && (i.driftType === 'ADD_COLUMN' || i.driftType === 'MIXED' || i.driftType === 'DROP_COLUMN' || i.driftType === 'COMMENT_DRIFT'));
        if (selEvoItems.length === 0) {
          showDataxNotice('当前框选的任务中没有可自动演进的安全变更字段！', { type: 'warning', mode: 'toast' });
          return;
        }
        const confirmed = await showDataxConfirm(
          `确定要对框选的 ${selEvoItems.length} 个任务执行安全自动演进吗？\n\n• 新增字段与表/列注释：自动在目标端执行\n• 删除字段：自动从任务配置中剔除\n• 类型/可空性变更：自动跳过，需人工审查`,
          { title: '批量安全演进确认', type: 'warning', confirmText: '立即批量演进' }
        );
        if (!confirmed) return;
        doExecuteDrift(true, selEvoItems.map(i => i.jobId));
      } else {
        const confirmed = await showDataxConfirm(
          `确定要一键对所有检测到变动的任务执行安全自动演进吗？\n\n• 新增字段与表/列注释：自动在目标端执行并重写配置\n• 缺失字段：自动从任务配置中剔除\n• 类型/可空性变更：自动跳过，需人工审查后手动执行`,
          { title: '全量安全自动演进确认', type: 'warning', confirmText: '立即全量演进' }
        );
        if (!confirmed) return;
        doExecuteDrift(true);
      }
    };
    modal.querySelector('#datax-drift-btn-latest').onclick = async () => {
      const tbody = modal.querySelector('#datax-drift-table-body');
      try {
        const resp = await fetch('/api/job/drift/latest', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(ids)
        });
        const res = await resp.json();
        const logs = res.content || res.data || [];
        if (logs.length === 0) {
          showDataxNotice('暂无已持久化的漂移快照记录，请先点击【🔄 实时探测】', { type: 'info', mode: 'toast' });
          return;
        }
        const mappedItems = logs.map(l => ({
          jobId: l.jobId,
          jobDesc: l.jobDesc,
          readerTable: l.readerTable,
          writerTable: l.writerTable,
          driftType: l.driftType,
          status: l.status,
          statusMsg: l.statusMsg,
          recommendedDdl: l.targetDdl
        }));
        selectedDriftJobIds.clear();
        renderDriftTableRows(mappedItems);
      } catch (e) {
        showDataxNotice('读取历史快照失败: ' + e.message, { type: 'error' });
      }
    };

    // 弹窗打开时默认发起一次实时探测
    doExecuteDrift(false);
  }

  /**
   * 智能识别并勾选重复任务（同项目且同 jobDesc，或全列表同 jobDesc）
   * 默认每组同名任务保留最新一条（ID 最大的任务），将历史多余的旧任务自动设为勾选
   */
  function selectDuplicateJobs() {
    if (!currentLoadedJobs || currentLoadedJobs.length === 0) {
      alert('当前任务列表为空，请先点击【🔍 查询任务列表】加载任务！');
      return;
    }

    const map = new Map();
    currentLoadedJobs.forEach(job => {
      const desc = (job.jobDesc || '').trim();
      if (!desc) return;
      const key = `${job.projectId || 0}___${desc.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(job);
    });

    const duplicateJobIds = new Set();
    let duplicateGroupCount = 0;

    map.forEach((group) => {
      if (group.length > 1) {
        duplicateGroupCount++;
        // 按 ID 降序排序，第 0 项是最新的一条任务（保留），其余是要清理的旧任务
        group.sort((a, b) => b.id - a.id);
        for (let i = 1; i < group.length; i++) {
          duplicateJobIds.add(group[i].id);
        }
      }
    });

    if (duplicateJobIds.size === 0) {
      alert('🎉 太棒了！当前查询列表中未检测到同项目同表名的重复任务。');
      return;
    }

    // 勾选表格中的复选框
    const cbs = document.querySelectorAll('.datax-job-item-cb');
    cbs.forEach(cb => {
      const val = parseInt(cb.value, 10);
      cb.checked = duplicateJobIds.has(val);
    });

    updateJobCount();

    const tip = document.getElementById('datax-job-action-tip');
    tip.textContent = `🧹 检测到 ${duplicateGroupCount} 组重复任务，已自动勾选 ${duplicateJobIds.size} 个历史冗余任务（保留最新），可直接点击【🗑️ 批量删除】进行清理！`;
    alert(`🧹 查重分析完成：\n\n检测到 ${duplicateGroupCount} 组同名重复任务。\n已自动保留每组中最新的 1 个任务，并将剩余 ${duplicateJobIds.size} 个历史旧任务自动勾选。\n\n请核对勾选列表，确认无误后点击【🗑️ 批量删除】即可一键清理！`);
  }

  // 16. 一键匹配本批次建的表
  function matchRecentBatchTables() {
    const ctx = getJsonBuildContext();
    const tableSet = new Set();

    if (ctx && ctx.tableReader && ctx.tableReader.readerForm && Array.isArray(ctx.tableReader.readerForm.tables)) {
      ctx.tableReader.readerForm.tables.forEach(t => tableSet.add(t.toLowerCase()));
    }
    if (ctx && ctx.tableMapper && ctx.tableMapper.readerForm) {
      if (Array.isArray(ctx.tableMapper.readerForm.ltables)) {
        ctx.tableMapper.readerForm.ltables.forEach(t => tableSet.add(t.toLowerCase()));
      }
      if (Array.isArray(ctx.tableMapper.readerForm.rtables)) {
        ctx.tableMapper.readerForm.rtables.forEach(t => tableSet.add(t.toLowerCase()));
      }
    }
    const tab1Tables = extractTablesFromTab1();
    tab1Tables.forEach(t => tableSet.add(t.toLowerCase()));

    if (tableSet.size === 0) {
      alert('未检测到近期操作的表名，请先在 Tab 1 或步骤 1 中勾选表！');
      return;
    }

    if (currentLoadedJobs.length === 0) {
      queryJobList().then(() => doMatchTables(tableSet));
    } else {
      doMatchTables(tableSet);
    }
  }

  function doMatchTables(tableSet) {
    let matchedCount = 0;
    const cbs = document.querySelectorAll('.datax-job-item-cb');
    cbs.forEach(cb => {
      const id = parseInt(cb.value, 10);
      const job = currentLoadedJobs.find(j => j.id === id);
      if (job) {
        const desc = (job.jobDesc || '').toLowerCase();
        let matched = false;
        for (const t of tableSet) {
          if (desc.includes(t)) {
            matched = true;
            break;
          }
        }
        cb.checked = matched;
        if (matched) matchedCount++;
      }
    });

    updateJobCount();
    const tip = document.getElementById('datax-job-action-tip');
    tip.textContent = `🎯 成功自动匹配并勾选了 ${matchedCount} 个对应任务！`;
  }


  function bindTab3Events() {
    const btnQuery = document.getElementById('datax-btn-query-jobs');
    if (btnQuery) btnQuery.onclick = queryJobList;

    const projectSearchSel = document.getElementById('datax-job-search-project');
    if (projectSearchSel) {
      projectSearchSel.onchange = queryJobList;
    }

    const btnMatchRecent = document.getElementById('datax-btn-match-recent-jobs');
    if (btnMatchRecent) btnMatchRecent.onclick = matchRecentBatchTables;

    const btnSelectDuplicates = document.getElementById('datax-btn-select-duplicates');
    if (btnSelectDuplicates) btnSelectDuplicates.onclick = selectDuplicateJobs;

    const btnBatchStart = document.getElementById('datax-btn-batch-start');
    if (btnBatchStart) btnBatchStart.onclick = batchStartSelectedJobs;

    const btnBatchTrigger = document.getElementById('datax-btn-batch-trigger');
    if (btnBatchTrigger) btnBatchTrigger.onclick = batchTriggerSelectedJobs;

    const btnBatchStop = document.getElementById('datax-btn-batch-stop');
    if (btnBatchStop) btnBatchStop.onclick = batchStopSelectedJobs;

    const btnBatchRemove = document.getElementById('datax-btn-batch-remove');
    if (btnBatchRemove) btnBatchRemove.onclick = batchRemoveSelectedJobs;

    const btnBatchIncrement = document.getElementById('datax-btn-batch-increment');
    if (btnBatchIncrement) btnBatchIncrement.onclick = openBatchSetIncrementModal;

    const btnInitSync = document.getElementById('datax-btn-batch-init-sync');
    if (btnInitSync) {
      btnInitSync.onclick = openBatchInitSyncModal;
    }

    const btnCompare = document.getElementById('datax-btn-batch-compare');
    if (btnCompare) {
      btnCompare.onclick = openBatchCompareModal;
    }

    const btnDrift = document.getElementById('datax-btn-batch-drift');
    if (btnDrift) {
      btnDrift.onclick = openBatchDriftModal;
    }

    const checkAll = document.getElementById('datax-job-check-all');
    if (checkAll) {
      checkAll.onchange = function () {
        const cbs = document.querySelectorAll('.datax-job-item-cb');
        cbs.forEach(cb => { cb.checked = this.checked; });
        updateJobCount();
      };
    }
  }

  // 增强 updateJobCount
  const origUpdateJobCount = updateJobCount;
  updateJobCount = function () {
    origUpdateJobCount();
    if (window.DataXAssistant && window.DataXAssistant.EventBus) {
      window.DataXAssistant.EventBus.emit('job:selection_change', getSelectedJobIds());
    }
  };

  class Tab3BatchJob {
    constructor(container) {
      this.container = container;
    }

    init() {
      bindTab3Events();
      loadProjectOptions();
      if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.isUserLoggedIn && window.DataXCommon.Utils.isUserLoggedIn()) {
        queryJobList();
      }
    }

    refresh() {
      loadProjectOptions();
      queryJobList();
    }

    getSelectedJobIds() {
      return getSelectedJobIds();
    }

    getCurrentLoadedJobs() {
      return currentLoadedJobs;
    }
  }

  window.DataXAssistant.Tabs.Tab3Class = Tab3BatchJob;
  window.DataXAssistant.getSelectedJobIds = getSelectedJobIds;
  window.DataXAssistant.getCurrentLoadedJobs = () => currentLoadedJobs;
  window.DataXAssistant.showDataxConfirm = showDataxConfirm;
  window.DataXAssistant.showDataxNotice = showDataxNotice;
})();
