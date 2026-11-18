/**
 * @fileoverview Tab 4: 任务数据源/Writer 批量置换与属性批量调整 (Tab4DbSwitch)
 * 提供目标库/源库连接置换、JVM 参数、Cron 表达式与任务属性的批量更新。
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


  function getSelectedJobIds() {
    if (window.DataXAssistant && window.DataXAssistant.getSelectedJobIds) {
      return window.DataXAssistant.getSelectedJobIds();
    }
    if (window.DataXAssistant && window.DataXAssistant.Tabs && window.DataXAssistant.Tabs.Tab3 && typeof window.DataXAssistant.Tabs.Tab3.getSelectedJobIds === 'function') {
      return window.DataXAssistant.Tabs.Tab3.getSelectedJobIds();
    }
    const checked = document.querySelectorAll('.datax-job-item-cb:checked');
    const ids = [];
    checked.forEach(cb => {
      const val = parseInt(cb.value, 10);
      if (!isNaN(val)) ids.push(val);
    });
    return ids;
  }

  /**
   * 安全获取当前已加载的任务列表 (公共方法，跨 Tab3/微内核实例容错获取)
   *
   * @return {Array<Object>} 当前已载入的任务列表
   */
  function getCurrentLoadedJobs() {
    if (window.DataXAssistant && typeof window.DataXAssistant.getCurrentLoadedJobs === 'function') {
      return window.DataXAssistant.getCurrentLoadedJobs() || [];
    }
    if (window.DataXAssistant && window.DataXAssistant.Tabs) {
      const tab3 = window.DataXAssistant.Tabs.Tab3 || window.DataXAssistant.Tabs.Tab3Instance;
      if (tab3 && typeof tab3.getCurrentLoadedJobs === 'function') {
        return tab3.getCurrentLoadedJobs() || [];
      }
    }
    return [];
  }

  /**
   * 安全获取当前 Tab 3 已载入的任务列表
   *
   * @return {Array<Object>} 任务列表
   */
  function getCurrentLoadedJobs() {
    if (window.DataXAssistant && typeof window.DataXAssistant.getCurrentLoadedJobs === 'function') {
      return window.DataXAssistant.getCurrentLoadedJobs() || [];
    }
    if (window.DataXAssistant && window.DataXAssistant.Tabs && window.DataXAssistant.Tabs.Tab3Instance && typeof window.DataXAssistant.Tabs.Tab3Instance.getCurrentLoadedJobs === 'function') {
      return window.DataXAssistant.Tabs.Tab3Instance.getCurrentLoadedJobs() || [];
    }
    return [];
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

  function queryJobList() {
    if (window.DataXAssistant && window.DataXAssistant.Tabs && window.DataXAssistant.Tabs.Tab3 && typeof window.DataXAssistant.Tabs.Tab3.refresh === 'function') {
      window.DataXAssistant.Tabs.Tab3.refresh();
    } else if (window.DataXAssistant && window.DataXAssistant.EventBus) {
      window.DataXAssistant.EventBus.emit('job:refresh');
    }
  }

  // 17. Tab 4: 任务 Writer 连接批量置换核心逻辑
  // ==========================================
  let cachedDatasourceList = [];

  function syncTab3SelectedCount() {
    const ids = getSelectedJobIds();
    const badge = document.getElementById('datax-writer-selected-badge');
    if (badge) {
      badge.textContent = `${ids.length} 个任务`;
    }
  }

  async function loadWriterDatasourceList() {
    const select = document.getElementById('datax-writer-target-ds');
    if (!select) return;

    // 先用已有的缓存或拉取最新
    try {
      const resp = await fetch('/api/jobJdbcDatasource/all', { method: 'GET', headers: getAuthHeaders() });
      const res = await resp.json();
      if ((res.code === 200 || res.code === 0) && Array.isArray(res.data)) {
        cachedDatasourceList = res.data;
      }
    } catch (e) {
      console.warn('获取数据源失败，尝试使用上下文数据源:', e);
      cachedDatasourceList = extractDatasources();
    }

    if (cachedDatasourceList.length === 0) {
      cachedDatasourceList = extractDatasources();
    }

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- 请选择系统数据源 --</option>';
    cachedDatasourceList.forEach(ds => {
      const opt = document.createElement('option');
      opt.value = ds.id;
      opt.textContent = `[${ds.datasource || 'db'}] ${ds.datasourceName || ds.id}`;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
    updateWriterDsInfo();
  }

  function updateWriterDsInfo() {
    const select = document.getElementById('datax-writer-target-ds');
    const info = document.getElementById('datax-writer-ds-info');
    if (!select || !info) return;

    const val = parseInt(select.value, 10);
    const ds = cachedDatasourceList.find(d => d.id === val);
    if (ds) {
      info.innerHTML = `
        <div><strong>类型:</strong> ${ds.datasource} | <strong>用户:</strong> ${ds.jdbcUsername || '-'}</div>
        <div style="margin-top:3px;"><strong>URL:</strong> <code style="color:#1890ff;">${ds.jdbcUrl || '-'}</code></div>
      `;
    } else {
      info.textContent = '请选择数据源，系统将自动继承其 JDBC 连接串、驱动、用户名和密码';
    }
  }

  // 作用端切换联动
  function updateScopeUi() {
    const scope = document.querySelector('input[name="datax-dbchange-scope"]:checked')?.value || 'WRITER';
    const dsLabel = document.getElementById('datax-writer-ds-label');
    const autoCreateWrap = document.getElementById('datax-writer-auto-create-wrap');
    const readerNoticeWrap = document.getElementById('datax-reader-notice-wrap');

    if (scope === 'READER') {
      if (dsLabel) dsLabel.textContent = '源端系统数据源 (Reader)：';
      if (autoCreateWrap) autoCreateWrap.style.display = 'none';
      if (readerNoticeWrap) readerNoticeWrap.style.display = 'block';
    } else if (scope === 'BOTH') {
      if (dsLabel) dsLabel.textContent = '统一系统数据源 (同时应用于 Reader 与 Writer)：';
      if (autoCreateWrap) autoCreateWrap.style.display = 'flex';
      if (readerNoticeWrap) readerNoticeWrap.style.display = 'none';
    } else {
      if (dsLabel) dsLabel.textContent = '目标端系统数据源 (Writer)：';
      if (autoCreateWrap) autoCreateWrap.style.display = 'flex';
      if (readerNoticeWrap) readerNoticeWrap.style.display = 'none';
    }
  }


  /**
   * 从界面解析数据库连接置换配置
   * @return {Object} 连接置换配置对象
   */
  function getConnectionChangesFromForm() {
    const isEnabled = document.getElementById('datax-dbchange-enable')?.checked;
    if (!isEnabled) {
      return { isEnabled: false, hasChanges: false };
    }
    const scope = document.querySelector('input[name="datax-dbchange-scope"]:checked')?.value || 'WRITER';
    const mode = document.querySelector('input[name="datax-writer-mode"]:checked')?.value || 'datasource';
    let dsId = null;
    let oldPattern = '';
    let targetUrl = '';
    let targetUser = '';
    let targetPwd = '';
    let autoCreateTable = false;

    if (mode === 'datasource') {
      dsId = parseInt(document.getElementById('datax-writer-target-ds')?.value, 10);
      autoCreateTable = document.getElementById('datax-writer-auto-create-table')?.checked || false;
      return {
        isEnabled: true,
        hasChanges: Boolean(dsId),
        mode,
        scope,
        dsId,
        autoCreateTable
      };
    } else {
      oldPattern = (document.getElementById('datax-writer-rule-old')?.value || '').trim();
      targetUrl = (document.getElementById('datax-writer-rule-new')?.value || '').trim();
      targetUser = (document.getElementById('datax-writer-rule-user')?.value || '').trim();
      targetPwd = (document.getElementById('datax-writer-rule-pwd')?.value || '').trim();
      const hasRule = Boolean(oldPattern || targetUrl || targetUser || targetPwd);
      return {
        isEnabled: true,
        hasChanges: hasRule,
        mode,
        scope,
        oldPattern,
        targetUrl,
        targetUser,
        targetPwd
      };
    }
  }

  /**
   * 从界面解析 7 大任务调度与运行属性配置
   * @return {Object} 调度属性配置对象与可读摘要
   */
  function getJobPropertyChangesFromForm() {
    const isEnabled = document.getElementById('datax-jobprop-enable')?.checked;
    if (!isEnabled) {
      return { isEnabled: false, hasChanges: false, config: {}, labels: [] };
    }

    const route = (document.getElementById('datax-jobprop-route-strategy')?.value || '').trim();
    const cron = (document.getElementById('datax-jobprop-cron')?.value || '').trim();
    const block = (document.getElementById('datax-jobprop-block-strategy')?.value || '').trim();
    const glue = (document.getElementById('datax-jobprop-glue-type')?.value || '').trim();
    const isClearEmail = document.getElementById('datax-jobprop-clear-email')?.checked;
    const emailInput = (document.getElementById('datax-jobprop-alarm-email')?.value || '').trim();
    const retryVal = (document.getElementById('datax-jobprop-retry-count')?.value || '').trim();
    const timeoutVal = (document.getElementById('datax-jobprop-timeout')?.value || '').trim();

    const config = {};
    const labels = [];

    if (route) {
      config.executorRouteStrategy = route;
      const routeText = document.querySelector(`#datax-jobprop-route-strategy option[value="${route}"]`)?.textContent || route;
      labels.push(`路由: ${routeText}`);
    }
    if (cron) {
      config.jobCron = cron;
      labels.push(`Cron: ${cron}`);
    }
    if (block) {
      config.executorBlockStrategy = block;
      const blockText = document.querySelector(`#datax-jobprop-block-strategy option[value="${block}"]`)?.textContent || block;
      labels.push(`阻塞: ${blockText}`);
    }
    if (glue) {
      config.glueType = glue;
      const glueText = document.querySelector(`#datax-jobprop-glue-type option[value="${glue}"]`)?.textContent || glue;
      labels.push(`类型: ${glueText}`);
    }
    if (isClearEmail) {
      config.alarmEmail = '';
      labels.push('邮件: [清空]');
    } else if (emailInput) {
      config.alarmEmail = emailInput;
      labels.push(`邮件: ${emailInput}`);
    }
    if (retryVal !== '') {
      config.executorFailRetryCount = parseInt(retryVal, 10);
      labels.push(`重试: ${retryVal}次`);
    }
    if (timeoutVal !== '') {
      config.executorTimeout = parseInt(timeoutVal, 10);
      labels.push(`超时: ${timeoutVal}分钟`);
    }

    return {
      isEnabled: true,
      hasChanges: labels.length > 0,
      config,
      labels
    };
  }


  function bindTab4Events() {

  document.querySelectorAll('input[name="datax-dbchange-scope"]').forEach(r => {
    r.onchange = updateScopeUi;
  });

  // 模式切换
  document.querySelectorAll('input[name="datax-writer-mode"]').forEach(r => {
    r.onchange = function () {
      const mode = this.value;
      const pDs = document.getElementById('datax-writer-mode-ds-panel');
      const pRule = document.getElementById('datax-writer-mode-rule-panel');
      if (mode === 'datasource') {
        pDs.style.display = 'block';
        pRule.style.display = 'none';
      } else {
        pDs.style.display = 'none';
        pRule.style.display = 'block';
      }
    };
  });

  const dsSelectEl = document.getElementById('datax-writer-target-ds');
  if (dsSelectEl) dsSelectEl.onchange = updateWriterDsInfo;

  // 数据库改库开关联动
  const dbChangeEnableCb = document.getElementById('datax-dbchange-enable');
  const dbChangeConfigWrap = document.getElementById('datax-dbchange-config-wrap');
  if (dbChangeEnableCb && dbChangeConfigWrap) {
    dbChangeEnableCb.onchange = () => {
      dbChangeConfigWrap.style.display = dbChangeEnableCb.checked ? 'block' : 'none';
    };
  }

  // 调度与运行属性调整开关联动
  const jobPropEnableCb = document.getElementById('datax-jobprop-enable');
  const jobPropConfigWrap = document.getElementById('datax-jobprop-config-wrap');
  if (jobPropEnableCb && jobPropConfigWrap) {
    jobPropEnableCb.onchange = () => {
      jobPropConfigWrap.style.display = jobPropEnableCb.checked ? 'block' : 'none';
    };
  }

  // Cron 快捷预设选择联动
  const cronPresetSel = document.getElementById('datax-jobprop-cron-preset');
  const cronInput = document.getElementById('datax-jobprop-cron');
  if (cronPresetSel && cronInput) {
    cronPresetSel.onchange = () => {
      if (cronPresetSel.value) {
        cronInput.value = cronPresetSel.value;
      }
    };
  }

  // 清空报警邮件复选框联动
  const clearEmailCb = document.getElementById('datax-jobprop-clear-email');
  const alarmEmailInput = document.getElementById('datax-jobprop-alarm-email');
  if (clearEmailCb && alarmEmailInput) {
    clearEmailCb.onchange = () => {
      if (clearEmailCb.checked) {
        alarmEmailInput.value = '';
        alarmEmailInput.disabled = true;
        alarmEmailInput.placeholder = '【已勾选清空报警邮件】';
        alarmEmailInput.style.backgroundColor = '#f5f5f5';
      } else {
        alarmEmailInput.disabled = false;
        alarmEmailInput.placeholder = '留空保持原样；多个以逗号隔开';
        alarmEmailInput.style.backgroundColor = '#fff';
      }
    };
  }

  // 按钮事件绑定
  document.getElementById('datax-writer-sync-jobs-btn').onclick = () => {
    syncTab3SelectedCount();
    const tip = document.getElementById('datax-writer-status-tip');
    const ids = getSelectedJobIds();
    tip.style.color = '#1890ff';
    tip.textContent = `📥 已同步 Tab 3 勾选的 ${ids.length} 个任务`;
  };

  document.getElementById('datax-writer-select-all-btn').onclick = () => {
    const loadedJobs = getCurrentLoadedJobs();
    if (loadedJobs.length === 0) {
      alert('尚未载入任务列表，请先在 Tab 3 中点击查询！');
      return;
    }
    const cbs = document.querySelectorAll('.datax-job-item-cb');
    cbs.forEach(cb => { cb.checked = true; });
    updateJobCount();
    syncTab3SelectedCount();
    const tip = document.getElementById('datax-writer-status-tip');
    tip.style.color = '#52c41a';
    tip.textContent = `⚡ 已全选当前全部 ${loadedJobs.length} 个任务`;
  };

  // 预览 Diff 与库表检测
  document.getElementById('datax-writer-preview-btn').onclick = async () => {
    const ids = getSelectedJobIds();
    if (ids.length === 0) {
      alert('请先勾选待调整的任务！');
      return;
    }

    const connChanges = getConnectionChangesFromForm();
    const propChanges = getJobPropertyChangesFromForm();

    if (!connChanges.hasChanges && !propChanges.hasChanges) {
      alert('请至少配置一项待调整内容（数据库连接置换 或 任务调度运行属性批量调整）！');
      return;
    }

    if (connChanges.isEnabled) {
      if (connChanges.mode === 'datasource' && !connChanges.dsId) {
        alert('已启用数据库连接置换，请在下拉列表中选择系统数据源！');
        return;
      }
      if (connChanges.mode === 'rule' && !connChanges.hasChanges) {
        alert('已启用数据库连接置换，请至少填写一项连接串替换规则！');
        return;
      }
    }

    const diffContainer = document.getElementById('datax-writer-diff-container');
    diffContainer.style.display = 'flex';
    diffContainer.style.flexDirection = 'column';
    diffContainer.innerHTML = '<div style="padding:16px;text-align:center;color:#1890ff;font-weight:bold;">🔍 正在检测变更配置与库表状态，请稍候...</div>';

    let targetUrl = '';
    let targetUser = '';
    let oldPattern = '';
    let dsId = null;
    let scope = connChanges.scope || 'WRITER';
    let mode = connChanges.mode || 'datasource';

    if (connChanges.isEnabled && connChanges.hasChanges) {
      if (mode === 'datasource') {
        dsId = connChanges.dsId;
        const ds = cachedDatasourceList.find(d => d.id === dsId);
        if (ds) {
          targetUrl = ds.jdbcUrl || '';
          targetUser = ds.jdbcUsername || '';
        }
      } else {
        oldPattern = connChanges.oldPattern || '';
        targetUrl = connChanges.targetUrl || '';
        targetUser = connChanges.targetUser || '';
      }
    }

    // 异步检测库表存在性（仅在启用数据源模式改库时检测）
    let checkMap = {};
    if (connChanges.isEnabled && mode === 'datasource' && dsId) {
      try {
        const resp = await fetch(`/api/job/checkTargetTables?writerDatasourceId=${dsId}&scope=${scope}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(ids)
        });
        const res = await resp.json();
        if ((res.code === 200 || res.code === 0) && Array.isArray(res.content)) {
          res.content.forEach(item => {
            checkMap[item.jobId] = item;
          });
        }
      } catch (e) {
        console.warn('探测库表存在性失败:', e);
      }
    }

    // 统计库表状态
    let statTag = '';
    if (connChanges.isEnabled && mode === 'datasource') {
      let needCreateCount = 0;
      let existCount = 0;
      Object.values(checkMap).forEach(c => {
        if (c.needCreate) needCreateCount++;
        else if (c.targetTableExists) existCount++;
      });

      if (scope === 'READER') {
        if (existCount === ids.length) {
          statTag = `<span style="background:#f6ffed;color:#389e0d;border:1px solid #b7eb8f;padding:2px 8px;border-radius:4px;font-size:11px;">✅ 源库检测：全部 ${ids.length} 张源表均在所选源库中就绪</span>`;
        } else {
          const missingCount = ids.length - existCount;
          statTag = `<span style="background:#fff1f0;color:#cf1322;border:1px solid #ffa39e;padding:2px 8px;border-radius:4px;font-size:11px;">⚠️ 源库检测：${existCount} 张源表已就绪，<strong>${missingCount} 张源表在所选源库未找到</strong></span>`;
        }
      } else {
        if (needCreateCount > 0) {
          statTag = `<span style="background:#fff7e6;color:#d46b08;border:1px solid #ffd591;padding:2px 8px;border-radius:4px;font-size:11px;">⚠️ 目标库检测：${existCount} 张表已存在，<strong>${needCreateCount} 张表不存在(需建表)</strong></span>`;
        } else {
          statTag = `<span style="background:#f6ffed;color:#389e0d;border:1px solid #b7eb8f;padding:2px 8px;border-radius:4px;font-size:11px;">✅ 目标库检测：全部 ${ids.length} 张表均已就绪</span>`;
        }
      }
    } else if (!connChanges.isEnabled) {
      statTag = '<span style="background:#f0f5ff;color:#1d39c4;border:1px solid #adc6ff;padding:2px 8px;border-radius:4px;font-size:11px;">ℹ️ 未启用连接置换 (仅批量修改调度运行属性)</span>';
    }

    // 调度属性拟变更摘要徽章
    let propSummaryBadge = '';
    if (propChanges.hasChanges) {
      propSummaryBadge = `<span style="background:#e6f7ff;color:#096dd9;border:1px solid #91d5ff;padding:2px 8px;border-radius:4px;font-size:11px;" title="${propChanges.labels.join('；')}">⏱️ 拟批量变更属性: <strong>${propChanges.labels.join(' | ')}</strong></span>`;
    }

    // 表头文字动态确定
    let colTableTitle = '所属表名';
    let colStatusTitle = '库表状态';
    if (connChanges.isEnabled) {
      if (scope === 'READER') {
        colTableTitle = '源端表名';
        colStatusTitle = '源库状态';
      } else if (scope === 'BOTH') {
        colTableTitle = '源表 / 目标表';
        colStatusTitle = '库表状态';
      } else {
        colTableTitle = '目标表名';
        colStatusTitle = '目标库状态';
      }
    }

    // 生成自适应宽高的全景对比视图
    let html = `
      <div style="font-weight:bold;margin-bottom:8px;color:#fa8c16;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span>📋 变更与表结构检测 (共 ${ids.length} 个任务)</span>
          ${statTag}
          ${propSummaryBadge}
        </div>
        <span style="font-size:11px;color:#888;font-weight:normal;">跟随窗口自动拉伸，支持滚动查看</span>
      </div>
      <div style="flex:1;overflow:auto;border:1px solid #ebeef5;border-radius:4px;background:#fff;max-height:100%;">
        <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:11px;table-layout:fixed;">
          <colgroup>
            <col style="width: 45px;" />
            <col style="width: 120px;" />
            <col style="width: 130px;" />
            <col style="width: 170px;" />
            <col style="width: calc(50% - 212px);" />
            <col style="width: calc(50% - 212px);" />
          </colgroup>
          <thead style="position:sticky;top:0;background:#fafafa;z-index:2;box-shadow:0 1px 2px rgba(0,0,0,0.06);">
            <tr style="border-bottom:1px solid #e8e8e8;color:#595959;text-align:left;">
              <th style="padding:6px;">ID</th>
              <th style="padding:6px;">任务名</th>
              <th style="padding:6px;">${colTableTitle}</th>
              <th style="padding:6px;">${colStatusTitle}</th>
              <th style="padding:6px;">连接置换对比 (原 ➔ 新)</th>
              <th style="padding:6px;">调度属性拟调整 (原 ➔ 新)</th>
            </tr>
          </thead>
          <tbody>
    `;

    const loadedJobs = getCurrentLoadedJobs();
    const selectedJobs = loadedJobs.filter(j => ids.includes(j.id));
    if (selectedJobs.length === 0) {
      alert('未获取到所选任务的完整配置详情，请先在 Tab 3【查询任务列表】加载任务！');
      return;
    }
    selectedJobs.slice(0, 30).forEach(job => {
      let currentReaderUrl = '-';
      let parsedReaderTable = '-';
      let currentWriterUrl = '-';
      let parsedWriterTable = '-';

      try {
        if (job.jobJson) {
          const parsed = JSON.parse(job.jobJson);
          if (parsed && parsed.job && parsed.job.content && parsed.job.content[0]) {
            const c0 = parsed.job.content[0];
            if (c0.reader && c0.reader.parameter && c0.reader.parameter.connection && c0.reader.parameter.connection[0]) {
              const rConn = c0.reader.parameter.connection[0];
              const rUrl = rConn.jdbcUrl;
              currentReaderUrl = Array.isArray(rUrl) ? (rUrl[0] || '-') : (rUrl || '-');
              const rt = rConn.table;
              parsedReaderTable = Array.isArray(rt) ? rt[0] : (rt || '-');
            }
            if (c0.writer && c0.writer.parameter && c0.writer.parameter.connection && c0.writer.parameter.connection[0]) {
              const wConn = c0.writer.parameter.connection[0];
              currentWriterUrl = wConn.jdbcUrl || '-';
              const wt = wConn.table;
              parsedWriterTable = Array.isArray(wt) ? wt[0] : (wt || '-');
            }
          }
        }
      } catch (e) { }

      const checkItem = checkMap[job.id];
      let rowTableName = '-';
      let rowCurrentUrl = '-';
      let rowExpectedUrl = targetUrl;

      if (scope === 'READER') {
        rowTableName = checkItem ? (checkItem.readerTable || parsedReaderTable) : parsedReaderTable;
        rowCurrentUrl = currentReaderUrl;
        if (mode === 'rule' && oldPattern && targetUrl && currentReaderUrl !== '-') {
          rowExpectedUrl = currentReaderUrl.replace(oldPattern, targetUrl);
        }
      } else if (scope === 'BOTH') {
        rowTableName = `源: ${parsedReaderTable}<br>目: ${parsedWriterTable}`;
        rowCurrentUrl = `源: ${currentReaderUrl}<br>目: ${currentWriterUrl}`;
        if (mode === 'rule' && oldPattern && targetUrl) {
          const expR = currentReaderUrl !== '-' ? currentReaderUrl.replace(oldPattern, targetUrl) : targetUrl;
          const expW = currentWriterUrl !== '-' ? currentWriterUrl.replace(oldPattern, targetUrl) : targetUrl;
          rowExpectedUrl = `源: ${expR}<br>目: ${expW}`;
        }
      } else {
        rowTableName = checkItem ? (checkItem.writerTable || parsedWriterTable) : parsedWriterTable;
        rowCurrentUrl = currentWriterUrl;
        if (mode === 'rule' && oldPattern && targetUrl && currentWriterUrl !== '-') {
          rowExpectedUrl = currentWriterUrl.replace(oldPattern, targetUrl);
        }
      }

      // 库表状态展示
      let statusHtml = '<span style="color:#888;">-</span>';
      if (connChanges.isEnabled && checkItem) {
        if (scope === 'READER') {
          if (checkItem.targetTableExists) {
            statusHtml = '<span style="color:#52c41a;font-weight:bold;background:#f6ffed;padding:2px 6px;border-radius:3px;border:1px solid #b7eb8f;">🟢 源表就绪</span>';
          } else {
            statusHtml = '<span style="color:#f5222d;font-weight:bold;background:#fff1f0;padding:2px 6px;border-radius:3px;border:1px solid #ffa39e;">🔴 源表缺失</span>';
          }
        } else {
          if (checkItem.targetTableExists) {
            statusHtml = '<span style="color:#52c41a;font-weight:bold;background:#f6ffed;padding:2px 6px;border-radius:3px;border:1px solid #b7eb8f;">🟢 表已存在</span>';
          } else {
            const encodedDdl = encodeURIComponent(checkItem.createTableSql || '');
            statusHtml = `
              <span style="color:#fa8c16;font-weight:bold;background:#fff7e6;padding:2px 6px;border-radius:3px;border:1px solid #ffd591;">🟠 需建表</span>
              ${checkItem.createTableSql ? `<button type="button" class="datax-view-ddl-btn" data-sql="${encodedDdl}" data-table="${checkItem.writerTable}" style="margin-left:2px;cursor:pointer;padding:1px 4px;background:#1890ff;color:#fff;border:none;border-radius:3px;font-size:10px;">DDL</button>` : ''}
            `;
          }
        }
      }

      // 连接 URL 对比 HTML
      let connDiffHtml = '';
      if (connChanges.isEnabled && connChanges.hasChanges) {
        connDiffHtml = `
          <div style="color:#cf1322;background:#fff1f0;padding:2px 4px;border-radius:2px;font-size:11px;word-break:break-all;margin-bottom:2px;" title="变更前连接">原: ${rowCurrentUrl}</div>
          <div style="color:#389e0d;background:#f6ffed;font-weight:bold;padding:2px 4px;border-radius:2px;font-size:11px;word-break:break-all;" title="拟变更连接">新: ${rowExpectedUrl}</div>
        `;
      } else {
        connDiffHtml = '<span style="color:#8c8c8c;font-style:italic;">保持原连接配置</span>';
      }

      // 调度属性拟变更 HTML
      const propDiffs = [];
      const cfg = propChanges.config;
      if (cfg.executorRouteStrategy) {
        propDiffs.push(`🎯 路由: <span style="color:#888;">${job.executorRouteStrategy || '-'}</span> ➔ <strong style="color:#1890ff;">${cfg.executorRouteStrategy}</strong>`);
      }
      if (cfg.jobCron) {
        propDiffs.push(`⏰ Cron: <span style="color:#888;">${job.jobCron || '-'}</span> ➔ <strong style="color:#52c41a;">${cfg.jobCron}</strong>`);
      }
      if (cfg.executorBlockStrategy) {
        propDiffs.push(`🛑 阻塞: <span style="color:#888;">${job.executorBlockStrategy || '-'}</span> ➔ <strong style="color:#fa8c16;">${cfg.executorBlockStrategy}</strong>`);
      }
      if (cfg.glueType) {
        propDiffs.push(`📦 类型: <span style="color:#888;">${job.glueType || '-'}</span> ➔ <strong style="color:#722ed1;">${cfg.glueType}</strong>`);
      }
      if (cfg.executorFailRetryCount !== undefined) {
        const curRetry = job.executorFailRetryCount != null ? job.executorFailRetryCount : 0;
        propDiffs.push(`🔄 重试: <span style="color:#888;">${curRetry}次</span> ➔ <strong style="color:#13c2c2;">${cfg.executorFailRetryCount}次</strong>`);
      }
      if (cfg.executorTimeout !== undefined) {
        const curTimeout = job.executorTimeout != null ? job.executorTimeout : 0;
        propDiffs.push(`⏳ 超时: <span style="color:#888;">${curTimeout}分</span> ➔ <strong style="color:#eb2f96;">${cfg.executorTimeout}分</strong>`);
      }
      if (cfg.alarmEmail !== undefined) {
        const curEmail = job.alarmEmail || '无';
        const newEmail = cfg.alarmEmail || '清空';
        propDiffs.push(`📧 邮件: <span style="color:#888;">${curEmail}</span> ➔ <strong style="color:#f5222d;">${newEmail}</strong>`);
      }
      const propDiffHtml = propDiffs.length > 0
        ? `<div style="display:flex;flex-direction:column;gap:2px;line-height:1.3;font-size:11px;">${propDiffs.join('')}</div>`
        : '<span style="color:#8c8c8c;font-style:italic;">保持原调度属性</span>';

      html += `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:6px;color:#888;">${job.id}</td>
          <td style="padding:6px;font-weight:500;word-break:break-all;">${job.jobDesc || '-'}</td>
          <td style="padding:6px;font-weight:bold;color:#1890ff;word-break:break-all;">${rowTableName}</td>
          <td style="padding:6px;">${statusHtml}</td>
          <td style="padding:6px;">${connDiffHtml}</td>
          <td style="padding:6px;">${propDiffHtml}</td>
        </tr>
      `;
    });

    if (selectedJobs.length > 30) {
      html += `<tr><td colspan="6" style="padding:6px;text-align:center;color:#888;background:#fafafa;">... 其余 ${selectedJobs.length - 30} 个任务变更同理，篇幅限制已省略展示</td></tr>`;
    }
    html += '</tbody></table></div>';
    diffContainer.innerHTML = html;

    // 绑定【预览DDL】按钮事件
    diffContainer.querySelectorAll('.datax-view-ddl-btn').forEach(btn => {
      btn.onclick = function (e) {
        e.stopPropagation();
        const sql = decodeURIComponent(this.getAttribute('data-sql') || '');
        const table = this.getAttribute('data-table') || '目标表';
        showDdlModal(table, sql);
      };
    });
  };

  // 执行批量更新
  document.getElementById('datax-writer-execute-btn').onclick = async () => {
    const ids = getSelectedJobIds();
    if (ids.length === 0) {
      alert('请先勾选要批量更新的任务！');
      return;
    }

    const connChanges = getConnectionChangesFromForm();
    const propChanges = getJobPropertyChangesFromForm();

    if (!connChanges.hasChanges && !propChanges.hasChanges) {
      alert('请至少配置一项待调整内容（数据库连接置换 或 任务调度运行属性批量调整）！');
      return;
    }

    const reqBody = {
      jobIds: ids
    };

    if (connChanges.isEnabled && connChanges.hasChanges) {
      reqBody.updateScope = connChanges.scope;
      if (connChanges.mode === 'datasource') {
        reqBody.writerDatasourceId = connChanges.dsId;
        reqBody.readerDatasourceId = connChanges.dsId;
        reqBody.autoCreateTable = connChanges.autoCreateTable;
      } else {
        reqBody.oldJdbcUrlPattern = connChanges.oldPattern || '';
        reqBody.newJdbcUrl = connChanges.targetUrl || '';
        reqBody.newUsername = connChanges.targetUser || '';
        reqBody.newPassword = connChanges.targetPwd || '';
      }
    }

    if (propChanges.hasChanges) {
      Object.assign(reqBody, propChanges.config);
    }

    // 组装二次确认提示信息
    const changeList = [];
    if (connChanges.isEnabled && connChanges.hasChanges) {
      let scopeDesc = '目标库 (Writer)';
      if (connChanges.scope === 'READER') scopeDesc = '源库 (Reader)';
      else if (connChanges.scope === 'BOTH') scopeDesc = '源库与目标库 (Reader & Writer)';
      changeList.push(`1. 数据库连接置换【${scopeDesc}】`);
    }
    if (propChanges.hasChanges) {
      changeList.push(`2. 调度运行属性调整：\n   · ${propChanges.labels.join('\n   · ')}`);
    }

    const confirmPrompt = `⚠️ 高危批量操作确认：\n确定要批量更新这 ${ids.length} 个任务的配置吗？\n\n【拟变更清单】：\n${changeList.join('\n')}\n\n(系统将精准应用上述配置，未配置项完整保持原样，字段映射与增量参数不受影响)`;
    const isConfirmed = await confirm(confirmPrompt);
    if (!isConfirmed) {
      return;
    }

    const btnExecute = document.getElementById('datax-writer-execute-btn');
    if (btnExecute) {
      btnExecute.disabled = true;
      btnExecute.style.opacity = '0.6';
      btnExecute.style.cursor = 'not-allowed';
    }

    const tip = document.getElementById('datax-writer-status-tip');
    tip.style.color = '#1890ff';
    tip.textContent = `⏳ 正在批量提交更新 ${ids.length} 个任务...`;

    try {
      const resp = await fetch('/api/job/batchUpdateWriter', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(reqBody)
      });
      const res = await resp.json();
      if (res.code === 200 || res.code === 0) {
        tip.style.color = '#52c41a';
        tip.textContent = `🎉 ${res.content || res.msg || '批量调整成功！'}`;
        alert(`🎉 操作完成！\n${res.content || res.msg || '所有所选任务已成功更新！'}`);
        // 刷新列表
        if (typeof queryJobList === 'function') queryJobList();
      } else {
        tip.style.color = '#ff4d4f';
        tip.textContent = `❌ 更新失败: ${res.msg || '未知错误'}`;
        alert('批量更新失败: ' + (res.msg || '服务端异常'));
      }
    } catch (e) {
      tip.style.color = '#ff4d4f';
      tip.textContent = `❌ 网络异常: ${e.message}`;
      alert('请求网络异常: ' + e.message);
    } finally {
      if (btnExecute) {
        btnExecute.disabled = false;
        btnExecute.style.opacity = '1';
        btnExecute.style.cursor = 'pointer';
      }
    }
  };
  }

  class Tab4DbSwitch {
    constructor(container) {
      this.container = container;
    }

    init() {
      bindTab4Events();
      loadWriterDatasourceList();
      syncTab3SelectedCount();

      if (window.DataXAssistant && window.DataXAssistant.EventBus) {
        window.DataXAssistant.EventBus.on('job:selection_change', () => {
          syncTab3SelectedCount();
        });
      }
    }

    refresh() {
      loadWriterDatasourceList();
      syncTab3SelectedCount();
    }
  }

  window.DataXAssistant.Tabs.Tab4Class = Tab4DbSwitch;
})();
