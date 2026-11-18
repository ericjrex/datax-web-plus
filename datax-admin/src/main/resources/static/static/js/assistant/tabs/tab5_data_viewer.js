/**
 * @fileoverview Tab 5: 库表数据浏览与查询工作台 (Tab5DataViewer)
 * 提供数据源选择、元数据展示、只读 SQL 查询与框选复制。
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
   * 纯前端原生零依赖 CSV 兜底导出引擎 (公共方法)
   * 带 UTF-8 BOM，防止 Windows Excel 打开乱码，保障在完全无外网与无第三方库环境下 100% 成功导出
   *
   * @param {Array<string>} headers 表头文本数组
   * @param {Array<Array<*>>} rowsData 二维表格数据数组
   * @param {string} fileName 导出文件名
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

      alert(`🎉 成功通过离线原生引擎导出 ${rowsData.length} 条记录至 [${safeName}]！\n(已使用 UTF-8 编码，可直接用 Excel / WPS 打开)`);
    } catch (err) {
      alert('导出失败: ' + err.message);
    }
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

  // 库表浏览持久化缓存键常量定义
  const STORAGE_KEY_DV_DS_ID = 'datax_dv_last_datasource_id';
  const STORAGE_KEY_DV_SCHEMA = 'datax_dv_last_schema';
  const STORAGE_KEY_DV_TABLE = 'datax_dv_last_table';

  /**
   * 安全持久化 Tab 5 最后选中的数据源 ID、Schema 与表名（公共方法）
   * 防御非法参数，确保状态可追溯可恢复
   *
   * @param {string|number} dsId 数据源 ID
   * @param {string} [schema] 数据库 Schema
   * @param {string} [table] 数据表名
   */
  function saveDvLastSelection(dsId, schema, table) {
    if (dsId !== undefined && dsId !== null) {
      setStorageItem(STORAGE_KEY_DV_DS_ID, String(dsId));
    }
    if (schema !== undefined && schema !== null) {
      setStorageItem(STORAGE_KEY_DV_SCHEMA, String(schema));
    }
    if (table !== undefined && table !== null) {
      setStorageItem(STORAGE_KEY_DV_TABLE, String(table));
    }
  }

  /**
   * 安全获取 Tab 5 上次持久化保存的选择信息（公共方法）
   *
   * @return {{dsId: string, schema: string, table: string}} 上次选中的库表信息
   */
  function getDvLastSelection() {
    return {
      dsId: getStorageItem(STORAGE_KEY_DV_DS_ID, ''),
      schema: getStorageItem(STORAGE_KEY_DV_SCHEMA, ''),
      table: getStorageItem(STORAGE_KEY_DV_TABLE, '')
    };
  }

  /**
   * 通用剪贴板异步复制辅助方法（多级降级兜底）
   *
   * @param {string} text 待复制文本内容
   * @return {Promise<boolean>} 是否复制成功
   */
  async function copyTextToClipboard(text) {
    if (text === undefined || text === null) {
      return false;
    }
    const val = String(text);
    const copyFn = window.DataXAssistant?.DomBuilder?.copyToClipboard
      || window.DataXCommon?.Utils?.copyToClipboard;
    if (typeof copyFn === 'function') {
      try {
        return Boolean(await copyFn(val));
      } catch (e) {
        return false;
      }
    }
    return false;
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

  // 21. 库表数据浏览与查询工作台 (Tab 5) 核心引擎
  // ==========================================
  let dvDatasources = [];
  let dvTables = [];
  let dvFilteredTables = [];
  let dvCurrentColumns = [];
  let dvCurrentRows = [];
  let dvCurrentTotal = 0;
  let dvCurrentPage = 1;
  let dvCurrentPageSize = 20;
  let dvActiveSubView = 'data'; // 'data' | 'schema' | 'sql'
  let dvCurrentLoadedTableKey = ''; // 记录当前加载的表标识 (dsId:schema:table)，用于检测表切换
  const dvSelectedRowIndices = new Set(); // 记录 Tab 5 库表数据浏览已框选的行索引 (0-based)
  let dvLastClickedIdx = null; // 记录最近点击的行索引，用于 Shift 连续区间多选
  let currentDvMarquee = null; // 记录 Tab 5 库表数据浏览框选引擎实例
  let dvDsSelect = null; // Tab 5 数据源可搜索下拉组件实例
  let dvTableSelect = null; // Tab 5 数据表可搜索下拉组件实例

  // 只读 SQL 控制台专用数据状态与选区追踪
  let dvSqlCurrentColumns = [];
  let dvSqlCurrentRows = [];
  let dvSqlLastExecutedSql = '';
  let dvSqlLastCostMs = 0;
  const dvSqlSelectedRowIndices = new Set();
  let dvSqlLastClickedIdx = null;
  let currentDvSqlMarquee = null;

  /**
   * 将数据源原始集合转换为 SearchableSelect 格式
   * @param {Array<Object>} datasources 数据源列表
   * @return {Array<Object>} 适配候选项
   */
  function mapDvDatasourcesToSelectItems(datasources) {
    if (!Array.isArray(datasources)) return [];
    return datasources.map(ds => {
      const name = ds.datasourceName || ds.datasource || `ID:${ds.id}`;
      const type = ds.datasource ? ds.datasource.toUpperCase() : '';
      const dbName = ds.databaseName || parseDbNameFromUrl(ds.jdbcUrl);
      const subLabel = dbName ? `${type ? type + ' · ' : ''}${dbName}` : type;
      return {
        value: ds.id,
        label: `${name} (ID: ${ds.id})`,
        subLabel: subLabel,
        title: `${name} [${type}]\n数据库: ${dbName || '默认'}\nJDBC: ${ds.jdbcUrl || ''}`
      };
    });
  }

  /**
   * 将表信息集合转换为 SearchableSelect 格式 (携带业务中文注解)
   * @param {Array<Object>} tables 表列表
   * @return {Array<Object>} 适配候选项
   */
  function mapDvTablesToSelectItems(tables) {
    if (!Array.isArray(tables)) return [];
    return tables.map(t => {
      const comment = t.tableComment ? t.tableComment.trim() : '';
      return {
        value: t.tableName,
        label: t.tableName,
        subLabel: comment,
        title: comment ? `${t.tableName}\n注解: ${comment}` : t.tableName
      };
    });
  }

  /**
   * 判定当前用户是否正在进行文本选区操作（划词复制）
   *
   * @return {boolean}
   */
  function isUserSelectingText() {
    const sel = window.getSelection ? window.getSelection() : null;
    return Boolean(sel && sel.toString().trim().length > 0);
  }

  /**
   * 绑定通用表格鼠标拖拽矩形框选引擎 (Universal Marquee Selection Engine)
   *
   * @param {Object} options 配置项
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

  /**
   * 刷新 Tab 5 库表数据浏览选区统计提示信息
   */
  function updateDvSelectionTip() {
    const tipEl = document.getElementById('datax-dv-status-tip');
    const count = dvSelectedRowIndices.size;
    if (tipEl) {
      if (count > 0) {
        tipEl.innerHTML = `✨ 已框选 <span style="color:#1890ff;font-weight:bold;">${count}</span> 行数据 (支持优先复制/导出所选) <a href="javascript:;" id="datax-dv-clear-selection-btn" style="color:#ff4d4f;margin-left:6px;font-size:11px;text-decoration:underline;cursor:pointer;">取消所选</a>`;
        const clearBtn = document.getElementById('datax-dv-clear-selection-btn');
        if (clearBtn) {
          clearBtn.onclick = () => {
            dvSelectedRowIndices.clear();
            if (currentDvMarquee) currentDvMarquee.syncRowHighlight();
            updateDvSelectionTip();
          };
        }
      } else {
        tipEl.textContent = '';
      }
    }
  }

  /**
   * 刷新 Tab 5 只读 SQL 控制台选区统计提示信息（公共方法）
   */
  function updateDvSqlSelectionTip() {
    const tipEl = document.getElementById('datax-dv-sql-selection-tip');
    const count = dvSqlSelectedRowIndices.size;
    if (tipEl) {
      if (count > 0) {
        tipEl.innerHTML = `已框选 <span style="color:#1890ff;font-weight:bold;">${count}</span> 行数据 (支持优先导出/复制所选) <a href="javascript:;" id="datax-dv-clear-sql-selection-btn" style="color:#ff4d4f;margin-left:6px;font-size:11px;text-decoration:underline;cursor:pointer;">取消所选</a>`;
        const clearBtn = document.getElementById('datax-dv-clear-sql-selection-btn');
        if (clearBtn) {
          clearBtn.onclick = () => {
            dvSqlSelectedRowIndices.clear();
            if (currentDvSqlMarquee) currentDvSqlMarquee.syncRowHighlight();
            updateDvSqlSelectionTip();
          };
        }
      } else {
        tipEl.textContent = '';
      }
    }
  }

  /**
   * 渲染/刷新数据预览排序字段下拉选项（公共方法）
   * 防御 XSS 注入并自动匹配主键标识 🔑，安全校验回显字段
   * @param {Array} columns 当前表字段元数据列表
   * @param {string} selectedField 需回显选中的排序列名
   */
  function renderDvOrderFieldOptions(columns, selectedField = '') {
    const orderFieldSel = document.getElementById('datax-dv-order-field');
    if (!orderFieldSel) return;

    orderFieldSel.innerHTML = '<option value="">-- 默认排序 --</option>';
    if (Array.isArray(columns) && columns.length > 0) {
      columns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.columnName;
        opt.textContent = `${c.columnName}${c.isPrimaryKey ? ' 🔑' : ''}`;
        orderFieldSel.appendChild(opt);
      });
    }

    // 若回显字段在当前表中有效则选中，否则保持为默认排序
    if (selectedField && Array.isArray(columns) && columns.some(c => c.columnName === selectedField)) {
      orderFieldSel.value = selectedField;
    } else {
      orderFieldSel.value = '';
    }
  }

  // 智能从多种响应格式中解析列表数据
  function extractListFromResponse(res) {
    if (window.DataXCommon && window.DataXCommon.Http && window.DataXCommon.Http.extractListFromResponse) {
      return window.DataXCommon.Http.extractListFromResponse(res);
    }
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.data) {
      if (Array.isArray(res.data)) return res.data;
      if (res.data.records && Array.isArray(res.data.records)) return res.data.records;
      if (res.data.data && Array.isArray(res.data.data)) return res.data.data;
    }
    if (res.content) {
      if (Array.isArray(res.content)) return res.content;
      if (res.content.data && Array.isArray(res.content.data)) return res.content.data;
      if (res.content.records && Array.isArray(res.content.records)) return res.content.records;
    }
    return [];
  }

  /**
   * 从前端组件或内存上下文尝试提取数据源 (安全降级兜底)
   */
  function getDatasourceListFromMemory() {
    if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.getDatasourceListFromMemory) {
      return window.DataXCommon.Utils.getDatasourceListFromMemory();
    }
    try {
      const map = new Map();
      const allElems = document.querySelectorAll('*');
      for (let i = 0; i < allElems.length; i++) {
        const v = allElems[i].__vue__;
        if (v && v.$options && v.$options.name === 'JsonBuild') {
          const rList = v.$refs?.reader?.$refs?.tablereader?.rDsList;
          const wList = v.$refs?.writer?.$refs?.tablewriter?.wDsList;
          if (Array.isArray(rList)) rList.forEach(ds => ds?.id && map.set(ds.id, ds));
          if (Array.isArray(wList)) wList.forEach(ds => ds?.id && map.set(ds.id, ds));
          break;
        }
      }
      return Array.from(map.values());
    } catch (e) {
      return [];
    }
  }

  /**
   * 从 JDBC 连接串中提取库名 (如 jdbc:mysql://127.0.0.1:3306/my_db?xxx)
   */
  function parseDbNameFromUrl(jdbcUrl) {
    if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.parseDbNameFromUrl) {
      return window.DataXCommon.Utils.parseDbNameFromUrl(jdbcUrl);
    }
    if (!jdbcUrl) return '';
    try {
      const clean = jdbcUrl.split('?')[0];
      const lastSlash = clean.lastIndexOf('/');
      if (lastSlash > 0 && lastSlash < clean.length - 1) {
        return clean.substring(lastSlash + 1);
      }
    } catch (e) {}
    return '';
  }

  // 加载数据源列表 (多级探测 + 自动重试)
  async function loadDataViewerDatasources(forceRefresh = false) {
    const selDs = document.getElementById('datax-dv-datasource-select');
    if (!selDs && !dvDsSelect) return;

    if (!forceRefresh && dvDatasources.length > 0) return;

    if (selDs && selDs.tagName === 'SELECT') {
      selDs.innerHTML = '<option value="">-- 正在加载已配置数据源... --</option>';
    }

    let list = [];
    const endpoints = [
      '/api/tableData/datasources',
      '/api/jobJdbcDatasource/all',
      '/api/jobJdbcDatasource?current=1&size=500'
    ];

    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: getAuthHeaders()
        });
        if (resp.ok) {
          const res = await resp.json();
          const items = extractListFromResponse(res);
          if (items && items.length > 0) {
            list = items;
            console.log(`✅ 成功从 [${url}] 获取到 ${items.length} 个数据源`);
            break;
          }
        }
      } catch (e) {
        console.warn(`请求数据源接口 [${url}] 失败:`, e);
      }
    }

    if (list.length === 0) {
      list = getDatasourceListFromMemory();
      if (list.length > 0) {
        console.log(`✅ 从页面内存组件提取到 ${list.length} 个数据源`);
      }
    }

    dvDatasources = list;
    const dsItems = mapDvDatasourcesToSelectItems(list);
    if (dvDsSelect) {
      dvDsSelect.setItems(dsItems);
    }

    if (list.length === 0) {
      if (dvDsSelect) dvDsSelect.clear();
      return;
    }

    const lastSelection = getDvLastSelection();
    const matchedDs = lastSelection.dsId ? list.find(d => String(d.id) === String(lastSelection.dsId)) : null;
    const targetId = matchedDs ? String(matchedDs.id) : String(list[0].id);
    if (dvDsSelect) {
      dvDsSelect.setValue(targetId);
    } else if (selDs) {
      selDs.value = targetId;
    }
    saveDvLastSelection(targetId, '', '');
    onDvDatasourceChange(true);
  }

  // 切换数据源
  async function onDvDatasourceChange(isRestoring = false) {
    const selDs = document.getElementById('datax-dv-datasource-select');
    const schemaContainer = document.getElementById('datax-dv-schema-container');
    const selSchema = document.getElementById('datax-dv-schema-select');

    const dsIdVal = dvDsSelect ? dvDsSelect.getValue() : (selDs ? selDs.value : '');

    if (!dsIdVal) {
      if (dvTableSelect) {
        dvTableSelect.setItems([]);
        dvTableSelect.clear();
        dvTableSelect.setBadge('0 张表');
      }
      if (schemaContainer) schemaContainer.style.display = 'none';
      renderDvOrderFieldOptions([], '');
      return;
    }

    const dsId = parseInt(dsIdVal, 10);
    const dsObj = dvDatasources.find(d => String(d.id) === String(dsId));
    const dsType = dsObj && dsObj.datasource ? dsObj.datasource.toUpperCase() : '';

    if (!isRestoring) {
      // 用户主动切换数据源时，更新记录的数据源 ID 并清空旧的 schema 和 table 记忆
      saveDvLastSelection(dsId, '', '');
    }

    // 检测是否需要 Schema 下拉 (PG, MONGO, ORACLE 等)
    const needSchema = ['POSTGRESQL', 'ORACLE', 'MONGODB'].includes(dsType);
    if (needSchema && schemaContainer && selSchema) {
      schemaContainer.style.display = 'block';
      selSchema.innerHTML = '<option value="">-- 加载 Schema 中... --</option>';
      try {
        const apiPath = dsType === 'MONGODB' ? `/api/metadata/getDBs?datasourceId=${dsId}` : `/api/metadata/getDBSchema?datasourceId=${dsId}`;
        const resp = await fetch(apiPath, { headers: getAuthHeaders() });
        const res = await resp.json();
        const schemas = extractListFromResponse(res);
        selSchema.innerHTML = '<option value="">-- 默认/全部 Schema --</option>';
        schemas.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          selSchema.appendChild(opt);
        });

        const lastSelection = getDvLastSelection();
        if (isRestoring && lastSelection.schema && schemas.includes(lastSelection.schema)) {
          selSchema.value = lastSelection.schema;
        } else if (schemas.length > 0 && dsType === 'POSTGRESQL') {
          // PG 默认选中 public
          const hasPublic = schemas.find(s => s.toLowerCase() === 'public');
          if (hasPublic) selSchema.value = hasPublic;
        }

        if (!isRestoring) {
          saveDvLastSelection(dsId, selSchema.value, '');
        }
      } catch (e) {
        selSchema.innerHTML = '<option value="">默认 Schema</option>';
      }
    } else if (schemaContainer) {
      schemaContainer.style.display = 'none';
      if (selSchema) selSchema.innerHTML = '';
    }

    // 加载数据表列表
    await loadDvTableList(isRestoring);
  }

  /**
   * 规范化表数据结构 (公共方法，兼容带注解的对象与降级字符串)
   * @param {Object|string} item 表信息项
   * @return {{tableName: string, tableComment: string}} 规范化表对象
   */
  function normalizeTableItem(item) {
    if (!item) return { tableName: '', tableComment: '' };
    if (typeof item === 'string') {
      return { tableName: item, tableComment: '' };
    }
    const tableName = item.tableName || item.name || item.TABLE_NAME || '';
    const tableComment = item.tableComment || item.comment || item.remarks || item.COMMENTS || item.TABLE_COMMENT || '';
    return { tableName, tableComment };
  }

  // 加载数据表列表 (支持获取表注释及平滑降级)
  async function loadDvTableList(isRestoring = false) {
    const selDs = document.getElementById('datax-dv-datasource-select');
    const selSchema = document.getElementById('datax-dv-schema-select');
    const selTable = document.getElementById('datax-dv-table-select');
    const tableBadge = document.getElementById('datax-dv-table-count-badge');
    const filterInput = document.getElementById('datax-dv-table-filter');

    const dsIdVal = dvDsSelect ? dvDsSelect.getValue() : (selDs ? selDs.value : '');
    if (!dsIdVal) return;

    const dsId = parseInt(dsIdVal, 10);
    const schema = (selSchema && selSchema.value) ? selSchema.value : '';

    if (dvTableSelect) {
      dvTableSelect.setBadge('获取中...');
    } else if (selTable && selTable.tagName === 'SELECT') {
      selTable.innerHTML = '<option value="">⏳ 正在获取表清单及注解...</option>';
    }
    if (tableBadge) tableBadge.textContent = '获取中...';

    try {
      // 1. 优先调用携带表注解的高级元数据接口
      let url = `/api/tableData/tables?datasourceId=${dsId}`;
      if (schema) url += `&tableSchema=${encodeURIComponent(schema)}`;

      let res = null;
      try {
        const resp = await fetch(url, { headers: getAuthHeaders() });
        if (resp.ok) {
          res = await resp.json();
        }
      } catch (ignored) {}

      // 2. 若高级接口未命中或报错，平滑降级至基础表名接口兜底
      if (!res || !isApiSuccess(res)) {
        let fallbackUrl = `/api/metadata/getTables?datasourceId=${dsId}`;
        if (schema) fallbackUrl += `&tableSchema=${encodeURIComponent(schema)}`;
        const fbResp = await fetch(fallbackUrl, { headers: getAuthHeaders() });
        res = await fbResp.json();
      }

      if (!isApiSuccess(res)) {
        throw new Error(getApiMsg(res, '数据库连接异常或未授权访问'));
      }

      const rawList = extractListFromResponse(res);
      dvTables = rawList.map(item => normalizeTableItem(item)).filter(t => Boolean(t.tableName));
      dvFilteredTables = [...dvTables];

      const tableItems = mapDvTablesToSelectItems(dvTables);
      if (dvTableSelect) {
        dvTableSelect.setItems(tableItems);
        dvTableSelect.setBadge(`${tableItems.length} 张表`);
      } else {
        if (filterInput) filterInput.value = '';
        renderDvTableDropdown();
      }

      // 如果有表，优先回显历史选中的表，否则默认触发第 1 张表查询
      if (dvTables.length > 0) {
        const lastSelection = getDvLastSelection();
        const hasLast = lastSelection.table && dvTables.some(t => t.tableName === lastSelection.table);
        const targetTable = (isRestoring && hasLast) ? lastSelection.table : dvTables[0].tableName;

        if (dvTableSelect) {
          dvTableSelect.setValue(targetTable);
        } else if (selTable) {
          selTable.value = targetTable;
        }
        onDvTableChange();
      } else {
        if (dvTableSelect) {
          dvTableSelect.clear();
          dvTableSelect.setBadge('0 张表');
        }
        renderDvEmptyTable('该数据源/Schema 下暂无可用表');
        renderDvOrderFieldOptions([], '');
      }
    } catch (err) {
      if (dvTableSelect) {
        dvTableSelect.setItems([]);
        dvTableSelect.clear();
        dvTableSelect.setBadge('0 张表');
      }
      if (selTable && selTable.tagName === 'SELECT') {
        selTable.innerHTML = `<option value="">❌ 获取失败: ${err.message}</option>`;
      }
      if (tableBadge) tableBadge.textContent = '0 张表';
      renderDvEmptyTable(`获取数据表清单失败: ${err.message}`);
    }
  }

  // 渲染表下拉列表 (同时展示表名与注解信息)
  function renderDvTableDropdown() {
    const selTable = document.getElementById('datax-dv-table-select');
    const tableBadge = document.getElementById('datax-dv-table-count-badge');
    if (!selTable || selTable.tagName !== 'SELECT') return;

    selTable.innerHTML = '';
    if (dvFilteredTables.length === 0) {
      selTable.innerHTML = '<option value="">未匹配到符合条件的表</option>';
      if (tableBadge) tableBadge.textContent = `0 / ${dvTables.length} 张表`;
      return;
    }

    if (tableBadge) {
      tableBadge.textContent = dvFilteredTables.length === dvTables.length
        ? `${dvTables.length} 张表`
        : `${dvFilteredTables.length} / ${dvTables.length} 张表`;
    }

    dvFilteredTables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.tableName;
      // 若存在表注解，则展示 "表名 (注解)"，并支持悬浮查看完整提示
      if (t.tableComment && t.tableComment.trim()) {
        opt.textContent = `${t.tableName} (${t.tableComment.trim()})`;
        opt.title = `${t.tableName}\n注解: ${t.tableComment.trim()}`;
      } else {
        opt.textContent = t.tableName;
        opt.title = t.tableName;
      }
      selTable.appendChild(opt);
    });
  }

  // 过滤表名与表注解 (同时支持表名和注解模糊检索)
  function onDvTableFilterInput(e) {
    const kw = (e.target.value || '').trim().toLowerCase();
    if (!kw) {
      dvFilteredTables = [...dvTables];
    } else {
      dvFilteredTables = dvTables.filter(t => {
        const matchName = t.tableName && t.tableName.toLowerCase().includes(kw);
        const matchComment = t.tableComment && t.tableComment.toLowerCase().includes(kw);
        return matchName || matchComment;
      });
    }
    renderDvTableDropdown();
    if (dvFilteredTables.length > 0) {
      onDvTableChange();
    }
  }

  // 切换选中表
  function onDvTableChange() {
    const selDs = document.getElementById('datax-dv-datasource-select');
    const selSchema = document.getElementById('datax-dv-schema-select');
    const selTable = document.getElementById('datax-dv-table-select');
    const targetDesc = document.getElementById('datax-dv-table-target-desc');
    const sqlInput = document.getElementById('datax-dv-sql-input');

    const table = selTable ? selTable.value : '';
    if (!table) return;

    // 持久化当前选中的数据源 ID、Schema 与数据表名，确保状态可追溯
    const dsId = selDs ? selDs.value : '';
    const schema = (selSchema && selSchema.value) ? selSchema.value : '';
    saveDvLastSelection(dsId, schema, table);

    const currentTableObj = dvTables.find(t => t.tableName === table);
    const commentTip = (currentTableObj && currentTableObj.tableComment)
      ? ` (${currentTableObj.tableComment})`
      : '';

    if (targetDesc) {
      targetDesc.textContent = schema
        ? `📌 当前查看表: ${schema}.${table}${commentTip}`
        : `📌 当前查看表: ${table}${commentTip}`;
    }

    if (sqlInput) {
      sqlInput.value = `SELECT * FROM ${table} LIMIT 50;`;
    }

    // 重置为第一页并清空当前数据缓存与排序下拉框
    dvCurrentPage = 1;
    dvCurrentRows = [];
    renderDvOrderFieldOptions([], '');
    const jumpPageInput = document.getElementById('datax-dv-jump-page');
    if (jumpPageInput) jumpPageInput.value = 1;

    if (dvActiveSubView === 'data') {
      queryDvTableData(1);
    } else if (dvActiveSubView === 'schema') {
      loadDvTableSchema();
    }
  }

  // 分页查询表数据
  async function queryDvTableData(pageNo = 1) {
    const selDs = document.getElementById('datax-dv-datasource-select');
    const selSchema = document.getElementById('datax-dv-schema-select');
    const selTable = document.getElementById('datax-dv-table-select');
    const whereInput = document.getElementById('datax-dv-where-input');
    const orderFieldSel = document.getElementById('datax-dv-order-field');
    const orderTypeSel = document.getElementById('datax-dv-order-type');
    const pageSizeSel = document.getElementById('datax-dv-page-size');
    const container = document.getElementById('datax-dv-table-container');
    const statEl = document.getElementById('datax-dv-query-stat');
    const tipEl = document.getElementById('datax-dv-status-tip');

    if (!selDs || !selDs.value || !selTable || !selTable.value) {
      if (container) container.innerHTML = '<div style="padding: 40px; text-align: center; color: #909399;">请先选择数据源与表</div>';
      return;
    }

    const dsId = parseInt(selDs.value, 10);
    const schema = (selSchema && selSchema.value) ? selSchema.value : '';
    const table = selTable.value;
    const tableKey = `${dsId}:${schema}:${table}`;
    const isNewTable = (dvCurrentLoadedTableKey !== tableKey);
    if (isNewTable) {
      dvCurrentLoadedTableKey = tableKey;
      if (orderFieldSel) {
        orderFieldSel.value = '';
      }
    }

    const whereClause = (whereInput ? whereInput.value : '').trim();
    const orderField = orderFieldSel ? orderFieldSel.value : '';
    const orderType = orderTypeSel ? orderTypeSel.value : 'ASC';
    const orderBy = orderField ? `${orderField} ${orderType}` : '';
    const pageSize = parseInt(pageSizeSel ? pageSizeSel.value : '20', 10);

    dvCurrentPage = pageNo;
    dvCurrentPageSize = pageSize;

    if (container) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #1890ff;">
          <div style="font-size: 20px; margin-bottom: 8px;">⏳</div>
          <div>正在从数据库查询数据中，请稍候...</div>
        </div>
      `;
    }
    if (tipEl) tipEl.textContent = '查询中...';

    try {
      const resp = await fetch('/api/tableData/query', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          datasourceId: dsId,
          tableSchema: schema,
          tableName: table,
          pageNo: dvCurrentPage,
          pageSize: dvCurrentPageSize,
          whereClause: whereClause,
          orderBy: orderBy,
          countTotal: true
        })
      });

      const res = await resp.json();
      if (res.code !== 200 && res.code !== 0) {
        throw new Error(res.msg || '查询失败');
      }

      const dataResult = res.data || res.content || {};
      dvCurrentColumns = dataResult.columns || [];
      dvCurrentRows = dataResult.rows || [];
      dvCurrentTotal = (typeof dataResult.totalCount === 'number' && dataResult.totalCount >= 0) ? dataResult.totalCount : dvCurrentRows.length;

      // 填充或更新排序字段下拉选项（切换新表或首次加载时触发重新渲染）
      if (orderFieldSel && (isNewTable || orderFieldSel.options.length <= 1) && dvCurrentColumns.length > 0) {
        renderDvOrderFieldOptions(dvCurrentColumns, orderField);
      }

      // 渲染表格
      renderDvDataTable(dvCurrentColumns, dvCurrentRows);

      // 更新统计与分页信息
      const costMs = dataResult.executeTimeMs || 0;
      if (statEl) statEl.textContent = `⚡ 耗时: ${costMs} ms`;
      if (tipEl) tipEl.textContent = '';

      updateDvPaginationControls();
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div style="padding: 30px; text-align: center; color: #f5222d;">
            <div style="font-size: 18px; margin-bottom: 6px;">❌ 查询异常</div>
            <div style="font-size: 12px; background: #fff1f0; padding: 10px; border-radius: 4px; display: inline-block; max-width: 90%; word-break: break-all;">
              ${err.message}
            </div>
          </div>
        `;
      }
      if (tipEl) tipEl.textContent = '❌ 查询失败';
    }
  }

  const STORAGE_KEY_DV_COL_WIDTHS = 'datax_dv_col_widths_v2';

  /**
   * 安全检测并解析 JSON 字符串（公共方法）
   * 严格判空、数据类型安全校验并防御非法格式解析崩溃
   *
   * @param {*} val 待检验的值
   * @return {{isValid: boolean, parsed: *|null, isObjectOrArray: boolean}} 检查与解析结果
   */
  function safeParseJson(val) {
    if (val === null || val === undefined) {
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
    const str = String(val).trim();
    if (!str || str.length < 2) {
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
    const isObj = str.startsWith('{') && str.endsWith('}');
    const isArr = str.startsWith('[') && str.endsWith(']');
    if (!isObj && !isArr) {
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
    try {
      const parsed = JSON.parse(str);
      const isComplex = parsed !== null && typeof parsed === 'object';
      return { isValid: isComplex, parsed: parsed, isObjectOrArray: isComplex };
    } catch (e) {
      // 语法非法防御，安全降级，绝不崩溃
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
  }

  /**
   * 获取持久化的列宽 (px)（公共方法）
   *
   * @param {string} colName 列名
   * @param {number} [defaultWidth=180] 默认列宽
   * @return {number} 列宽 (px)
   */
  function getDvColumnWidth(colName, defaultWidth = 180) {
    if (!colName) return defaultWidth;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DV_COL_WIDTHS);
      if (raw) {
        const map = JSON.parse(raw);
        if (map && typeof map[colName] === 'number' && map[colName] >= 50) {
          return map[colName];
        }
      }
    } catch (e) {}
    return defaultWidth;
  }

  /**
   * 安全持久化列宽配置（公共方法）
   *
   * @param {string} colName 列名
   * @param {number} width 列宽 (px)
   */
  function saveDvColumnWidth(colName, width) {
    if (!colName || typeof width !== 'number' || width < 50) return;
    try {
      let map = {};
      const raw = localStorage.getItem(STORAGE_KEY_DV_COL_WIDTHS);
      if (raw) map = JSON.parse(raw) || {};
      map[colName] = Math.round(width);
      localStorage.setItem(STORAGE_KEY_DV_COL_WIDTHS, JSON.stringify(map));
    } catch (e) {}
  }

  /**
   * 绑定表格列宽自由拖拽调整引擎 (Universal Column Resizer)
   * 采用绝对定位手柄与动态双向尺寸同步，支持实时持久化保存
   *
   * @param {HTMLElement} container 表格容器 DOM
   */
  function bindDvTableColumnResize(container) {
    if (!container) return;
    const resizers = container.querySelectorAll('.datax-th-resizer');
    resizers.forEach(resizer => {
      resizer.onmousedown = function (e) {
        e.stopPropagation();
        e.preventDefault();

        const th = this.closest('th');
        if (!th) return;

        const colName = this.getAttribute('data-col');
        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        const thIndex = Array.from(th.parentNode.children).indexOf(th);

        const table = container.querySelector('table');
        const colCells = table ? table.querySelectorAll(`tr > *:nth-child(${thIndex + 1})`) : [];

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        this.style.background = '#1890ff';
        this.style.opacity = '0.8';

        const onMouseMove = (moveEvent) => {
          const deltaX = moveEvent.pageX - startX;
          const newWidth = Math.max(60, startWidth + deltaX);
          th.style.width = `${newWidth}px`;
          th.style.minWidth = `${newWidth}px`;
          colCells.forEach(cell => {
            cell.style.width = `${newWidth}px`;
            cell.style.maxWidth = `${newWidth}px`;
          });
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          resizer.style.background = '';
          resizer.style.opacity = '';

          const finalWidth = parseInt(th.style.width, 10);
          if (colName && !isNaN(finalWidth)) {
            saveDvColumnWidth(colName, finalWidth);
          }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
    });
  }

  /**
   * 展示字段详情模态弹窗（公共方法）
   * 支持 JSON 智能识别、默认格式化、非法语法防御、格式化/压缩切换与一键复制
   *
   * @param {string} title 弹窗标题
   * @param {string} rawContent 原始内容
   * @param {string} [colName=''] 列名
   */
  function showDvCellDetailModal(title, rawContent, colName = '') {
    const existing = document.getElementById('datax-ddl-modal');
    if (existing) existing.remove();

    const strContent = (rawContent === null || rawContent === undefined) ? '' : String(rawContent);
    const jsonCheck = safeParseJson(strContent);
    const isJson = jsonCheck.isValid; // 严格判断字段是否为合法复合 JSON

    // 只有判断字段是 JSON 时才自动进行格式化排版；非 JSON 严格展示原始内容，杜绝误格式化
    let currentContent = isJson
      ? JSON.stringify(jsonCheck.parsed, null, 2)
      : strContent;

    const modal = document.createElement('div');
    modal.id = 'datax-ddl-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000025;display:flex;align-items:center;justify-content:center;';

    // 顶部状态徽标：仅在判定为合法 JSON 时才显示徽标
    let statusBadge = '';
    if (isJson) {
      statusBadge = '<span style="background:#f6ffed;color:#52c41a;border:1px solid #b7eb8f;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:normal;">🏷️ JSON 格式 (已自动格式化)</span>';
    }

    // 格式化/压缩按钮组：仅当字段确实是 JSON 时才渲染出现
    const jsonActionsHtml = isJson ? `
      <div style="display:flex;gap:8px;">
        <button type="button" id="datax-dv-btn-format-json" style="background:#fafafa;border:1px solid #d9d9d9;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;color:#303133;">格式化 JSON</button>
        <button type="button" id="datax-dv-btn-compress-json" style="background:#fafafa;border:1px solid #d9d9d9;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;color:#303133;">压缩为单行</button>
      </div>
    ` : '<div></div>';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:720px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,0.25);">
        <div style="padding:12px 16px;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:14px;color:#303133;">[${escapeHtml(title)}] 详情预览</strong>
            ${statusBadge}
          </div>
          <span id="datax-ddl-close" style="cursor:pointer;font-size:20px;color:#909399;font-weight:bold;line-height:1;">&times;</span>
        </div>
        <div style="padding:14px 16px;flex:1;overflow:auto;display:flex;flex-direction:column;">
          <textarea id="datax-dv-modal-textarea" readonly style="width:100%;box-sizing:border-box;height:320px;padding:10px 12px;font-family:Consolas, Monaco, monospace;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;background:#f8f9fa;line-height:1.5;resize:vertical;">${escapeHtml(currentContent)}</textarea>
        </div>
        <div style="padding:10px 16px;border-top:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;">
          ${jsonActionsHtml}
          <div style="display:flex;gap:8px;">
            <button type="button" id="datax-ddl-copy-btn" style="background:#1890ff;color:#fff;border:none;padding:5px 16px;border-radius:4px;cursor:pointer;font-size:12px;">复制当前内容</button>
            <button type="button" id="datax-ddl-cancel-btn" style="background:#fff;border:1px solid #d9d9d9;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;">关闭</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const textarea = document.getElementById('datax-dv-modal-textarea');
    const btnFormat = document.getElementById('datax-dv-btn-format-json');
    const btnCompress = document.getElementById('datax-dv-btn-compress-json');
    const closeBtn = document.getElementById('datax-ddl-close');
    const cancelBtn = document.getElementById('datax-ddl-cancel-btn');
    const copyBtn = document.getElementById('datax-ddl-copy-btn');

    // 子窗口关闭与事件注销公共方法
    const closeModal = () => {
      window.removeEventListener('keydown', onModalKeyDown, true);
      modal.remove();
    };

    // 核心：捕获阶段监听 Esc 键，仅关闭子窗口并阻断事件冒泡，杜绝误关闭助手主窗口
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

    // 仅在存在 JSON 格式化按钮时绑定事件
    if (btnFormat) {
      btnFormat.onclick = () => {
        const check = safeParseJson(strContent);
        if (check.isValid) {
          textarea.value = JSON.stringify(check.parsed, null, 2);
          toast('✨ 已格式化为标准 JSON 排版');
        } else {
          alert('当前字段内容非有效 JSON，无法排版！');
        }
      };
    }

    if (btnCompress) {
      btnCompress.onclick = () => {
        const check = safeParseJson(strContent);
        if (check.isValid) {
          textarea.value = JSON.stringify(check.parsed);
          toast('🗜️ 已压缩为紧凑单行格式');
        } else {
          alert('当前字段内容非有效 JSON，无法压缩！');
        }
      };
    }

    // 复制按钮
    if (copyBtn) {
      copyBtn.onclick = async function () {
        const valToCopy = textarea ? textarea.value : currentContent;
        const ok = await copyTextToClipboard(valToCopy);
        if (ok) {
          toast('已成功复制当前内容到剪贴板！');
        } else {
          alert('当前浏览器环境不支持自动复制，请手动选中文本复制');
        }
      };
    }
  }

  /**
   * 渲染表格单元格内容（公共方法）
   * 智能识别长文本、JSON 或包含换行的数据，自适应提供悬浮预览、点击超链接及双击弹窗详情
   *
   * @param {*} val 单元格值
   * @param {string} [colName=''] 列名
   * @return {string} 包含完整样式的 td HTML 字符串
   */
  function renderDvCellTd(val, colName = '') {
    const colWidth = getDvColumnWidth(colName, 180);
    const baseTdStyle = `padding: 6px 10px; color: #262626; border-right: 1px solid #f0f0f0; width: ${colWidth}px; max-width: ${colWidth}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box;`;

    if (val === null || val === undefined) {
      return `<td style="${baseTdStyle}"><span style="color: #bfbfbf; font-style: italic;">null</span></td>`;
    }

    const strVal = String(val);
    const escapedFull = escapeHtml(strVal);
    const jsonCheck = safeParseJson(strVal);
    const isMultiline = strVal.includes('\n') || strVal.includes('\r');
    const isLong = strVal.length > 20 || isMultiline || jsonCheck.isValid;

    if (isLong) {
      const tooltip = escapedFull.length > 300 ? escapedFull.substring(0, 300) + '...' : escapedFull;
      const displaySnippet = isMultiline ? strVal.replace(/[\r\n]+/g, ' ') : strVal;
      const shortText = displaySnippet.length > 35 ? displaySnippet.substring(0, 32) + '...' : displaySnippet;
      const encodedContent = encodeURIComponent(strVal);
      const jsonBadge = jsonCheck.isValid ? '<span style="background:#e6f7ff;color:#1890ff;border:1px solid #91d5ff;font-size:10px;padding:0 3px;border-radius:2px;margin-right:4px;font-weight:500;user-select:none;">JSON</span>' : '';
      const titleAttr = `title="${jsonCheck.isValid ? '【JSON 数据】' : ''}点击或双击查看完整内容 (支持格式化/压缩)&#10;${tooltip}"`;

      return `<td class="datax-dv-cell" data-full-content="${encodedContent}" data-col-name="${escapeHtml(colName)}" style="${baseTdStyle}" ${titleAttr}>` +
        `${jsonBadge}<span class="datax-cell-long-text" data-content="${encodedContent}" style="color: #1890ff; cursor: pointer; text-decoration: underline;">${escapeHtml(shortText)}</span>` +
        `</td>`;
    }

    return `<td class="datax-dv-cell" data-full-content="${encodeURIComponent(strVal)}" data-col-name="${escapeHtml(colName)}" title="${escapedFull}" style="${baseTdStyle}">${escapedFull}</td>`;
  }

  /**
   * 绑定容器内单元格点击/双击查看完整详情（公共方法）
   *
   * @param {HTMLElement} container 包含表格的容器 DOM
   */
  function bindDvCellDetailEvents(container) {
    if (!container) return;

    // 单击长文本超链接打开弹窗
    container.querySelectorAll('.datax-cell-long-text').forEach(el => {
      el.onclick = function (e) {
        e.stopPropagation();
        const content = decodeURIComponent(this.getAttribute('data-content') || '');
        const td = this.closest('td');
        const colName = td ? td.getAttribute('data-col-name') : '';
        const title = colName ? `字段 [${colName}]` : '字段文本详情';
        showDvCellDetailModal(title, content, colName);
      };
    });

    // 双击任意单元格快捷查看完整内容
    container.querySelectorAll('.datax-dv-cell').forEach(td => {
      td.ondblclick = function (e) {
        e.stopPropagation();
        const content = decodeURIComponent(this.getAttribute('data-full-content') || '');
        if (content) {
          const colName = this.getAttribute('data-col-name') || '';
          const title = colName ? `字段 [${colName}]` : '单元格内容详情';
          showDvCellDetailModal(title, content, colName);
        }
      };
    });
  }

  // 渲染数据表格 DOM
  function renderDvDataTable(columns, rows) {
    const container = document.getElementById('datax-dv-table-container');
    if (!container) return;

    // 清理先前的框选监听器与选中状态，防止内存泄漏
    if (currentDvMarquee && typeof currentDvMarquee.cleanup === 'function') {
      currentDvMarquee.cleanup();
      currentDvMarquee = null;
    }
    dvSelectedRowIndices.clear();
    dvLastClickedIdx = null;
    updateDvSelectionTip();

    if (!columns || columns.length === 0) {
      container.innerHTML = '<div style="padding: 40px; text-align: center; color: #909399;">未获取到任何字段数据</div>';
      return;
    }

    if (!rows || rows.length === 0) {
      container.innerHTML = '<div style="padding: 40px; text-align: center; color: #909399;">暂无数据记录 (当前表为空或条件无匹配)</div>';
      return;
    }

    let html = `
      <table style="width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; table-layout: fixed;">
        <thead>
          <tr style="background: #fafafa; border-bottom: 2px solid #e8e8e8; position: sticky; top: 0; z-index: 5;">
            <th style="padding: 8px 10px; color: #595959; font-weight: 600; border-right: 1px solid #f0f0f0; width: 45px; min-width: 45px; text-align: center; background: #fafafa; position: relative; user-select: none;">#</th>
    `;

    const commentModeEl = document.getElementById('datax-dv-comment-mode');
    const commentMode = (commentModeEl ? commentModeEl.value : '') || getStorageItem('datax_dv_comment_mode') || 'both';

    columns.forEach(col => {
      const colWidth = getDvColumnWidth(col.columnName, 180);
      const pkBadge = col.isPrimaryKey ? ' <span title="主键" style="color:#faad14;">🔑</span>' : '';
      const typeDesc = col.columnType ? `<span style="font-size: 10px; color: #8c8c8c; font-weight: normal; margin-left: 3px;">(${col.columnType})</span>` : '';
      const commentDesc = col.comment ? ` title="注释: ${escapeHtml(col.comment)}"` : '';

      let headerContent = '';
      if (commentMode === 'both') {
        // 模式 1：字段名 + 备注 (双行立体展示，最清晰)
        headerContent = `
          <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="font-weight: 600; font-size: 12px; color: #1f1f1f; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(col.columnName)}</span>
              ${pkBadge}
              ${typeDesc}
            </div>
            <div style="font-size: 11px; color: ${col.comment ? '#d46b08' : '#bfbfbf'}; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${col.comment ? `注释: ${escapeHtml(col.comment)}` : '暂无注释'}">
              ${col.comment ? `📝 ${escapeHtml(col.comment)}` : '<span style="color:#bfbfbf;">(无备注)</span>'}
            </div>
          </div>
        `;
      } else if (commentMode === 'commentFirst') {
        // 模式 2：优先突出显示备注 (备注为主标题，字段名为副标题)
        headerContent = `
          <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="font-weight: bold; font-size: 12px; color: ${col.comment ? '#d4380d' : '#1f1f1f'}; overflow: hidden; text-overflow: ellipsis;">
                ${col.comment ? `📝 ${escapeHtml(col.comment)}` : escapeHtml(col.columnName)}
              </span>
              ${pkBadge}
            </div>
            <div style="font-size: 11px; color: #8c8c8c; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${col.comment ? escapeHtml(col.columnName) : ''} ${typeDesc}
            </div>
          </div>
        `;
      } else {
        // 模式 3：纯字段名紧凑模式
        headerContent = `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(col.columnName)}</span>${pkBadge}${typeDesc}`;
      }

      html += `
        <th style="padding: 6px 10px; color: #262626; font-weight: 600; border-right: 1px solid #f0f0f0; white-space: nowrap; width: ${colWidth}px; min-width: 70px; background: #fafafa; vertical-align: middle; position: relative; box-sizing: border-box;"${commentDesc}>
          ${headerContent}
          <span class="datax-th-resizer" data-col="${escapeHtml(col.columnName)}" data-prevent-marquee="true" title="按住左右拖拽调整此列宽度" style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; user-select: none; z-index: 10;"></span>
        </th>
      `;
    });

    html += `
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach((row, rIdx) => {
      const rowBg = rIdx % 2 === 1 ? '#fafcff' : '#ffffff';
      const seq = (dvCurrentPage - 1) * dvCurrentPageSize + (rIdx + 1);

      html += `
        <tr style="background: ${rowBg}; border-bottom: 1px solid #f0f0f0; transition: background 0.15s ease; cursor: pointer;" class="datax-dv-table-row" data-row-idx="${rIdx}" data-orig-bg="${rowBg}" onmouseenter="if(!this.hasAttribute('data-selected')) this.style.background='#f0f7ff'" onmouseleave="if(!this.hasAttribute('data-selected')) this.style.background=this.getAttribute('data-orig-bg')">
          <td style="padding: 6px 10px; color: #8c8c8c; text-align: center; border-right: 1px solid #f0f0f0; font-size: 11px; user-select: none; width: 45px; box-sizing: border-box;">${seq}</td>
      `;

      columns.forEach(col => {
        const val = row[col.columnName];
        html += renderDvCellTd(val, col.columnName);
      });

      html += `</tr>`;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;

    // 绑定表格列宽自由拖拽调整
    bindDvTableColumnResize(container);

    // 绑定单元格点击/双击查看完整详情与格式化弹窗
    bindDvCellDetailEvents(container);

    // 绑定 Tab 5 库表数据通用矩形框选引擎
    currentDvMarquee = bindMarqueeSelection({
      container: container,
      rowSelector: '.datax-dv-table-row',
      getIdFromRow: row => {
        const idx = parseInt(row.getAttribute('data-row-idx'), 10);
        return isNaN(idx) ? null : idx;
      },
      selectedSet: dvSelectedRowIndices,
      selectedBg: '#bae7ff',
      canStartSelection: e => e.altKey || !e.target.closest('.datax-cell-long-text, .datax-th-resizer, a, button, input, select'),
      onSelectionChange: () => {
        updateDvSelectionTip();
      }
    });

    // 支持单击行、Ctrl 独立切换、Shift 连续区间选行
    container.querySelectorAll('.datax-dv-table-row').forEach(tr => {
      tr.onclick = function(e) {
        if (e.target.closest('.datax-cell-long-text, .datax-th-resizer, a, button, input, select')) return;
        if (isUserSelectingText()) return; // 选中文本划词复制时，拦截整行选中切换
        const idx = parseInt(this.getAttribute('data-row-idx'), 10);
        if (isNaN(idx)) return;

        if (e.shiftKey && dvLastClickedIdx !== null) {
          const start = Math.min(dvLastClickedIdx, idx);
          const end = Math.max(dvLastClickedIdx, idx);
          for (let i = start; i <= end; i++) {
            dvSelectedRowIndices.add(i);
          }
        } else if (e.ctrlKey || e.metaKey) {
          if (dvSelectedRowIndices.has(idx)) {
            dvSelectedRowIndices.delete(idx);
          } else {
            dvSelectedRowIndices.add(idx);
          }
        } else {
          if (dvSelectedRowIndices.has(idx) && dvSelectedRowIndices.size === 1) {
            dvSelectedRowIndices.clear();
          } else {
            dvSelectedRowIndices.clear();
            dvSelectedRowIndices.add(idx);
          }
        }
        dvLastClickedIdx = idx;
        if (currentDvMarquee) currentDvMarquee.syncRowHighlight();
        updateDvSelectionTip();
      };
    });
  }

  // 更新分页控件
  function updateDvPaginationControls() {
    const totalRecordsEl = document.getElementById('datax-dv-total-records');
    const curPageEl = document.getElementById('datax-dv-current-page-text');
    const totalPagesEl = document.getElementById('datax-dv-total-pages-text');
    const jumpInput = document.getElementById('datax-dv-jump-page');
    const btnPrev = document.getElementById('datax-dv-btn-prev');
    const btnNext = document.getElementById('datax-dv-btn-next');

    const totalPages = Math.max(1, Math.ceil(dvCurrentTotal / dvCurrentPageSize));

    if (totalRecordsEl) totalRecordsEl.textContent = dvCurrentTotal;
    if (curPageEl) curPageEl.textContent = dvCurrentPage;
    if (totalPagesEl) totalPagesEl.textContent = totalPages;
    if (jumpInput) {
      jumpInput.value = dvCurrentPage;
      jumpInput.max = totalPages;
    }

    if (btnPrev) btnPrev.disabled = dvCurrentPage <= 1;
    if (btnNext) btnNext.disabled = dvCurrentPage >= totalPages;
  }

  // 加载并渲染表字段结构元数据
  async function loadDvTableSchema() {
    const selDs = document.getElementById('datax-dv-datasource-select');
    const selSchema = document.getElementById('datax-dv-schema-select');
    const selTable = document.getElementById('datax-dv-table-select');
    const box = document.getElementById('datax-dv-schema-container-box');

    if (!selDs || !selDs.value || !selTable || !selTable.value) {
      if (box) box.innerHTML = '<div style="padding: 30px; text-align: center; color: #909399;">请先选择数据源与表</div>';
      return;
    }

    const dsId = parseInt(selDs.value, 10);
    const schema = (selSchema && selSchema.value) ? selSchema.value : '';
    const table = selTable.value;

    if (box) box.innerHTML = '<div style="padding: 30px; text-align: center; color: #1890ff;">⏳ 正在读取表元数据结构...</div>';

    try {
      let url = `/api/tableData/columns?datasourceId=${dsId}&tableName=${encodeURIComponent(table)}`;
      if (schema) url += `&tableSchema=${encodeURIComponent(schema)}`;

      const resp = await fetch(url, { headers: getAuthHeaders() });
      const res = await resp.json();
      const columns = res.data || res.content || [];
      dvCurrentColumns = columns;
      // 同步刷新排序字段选项，确保在结构视图下切表后再回数据视图依然有效
      renderDvOrderFieldOptions(columns, '');

      if (columns.length === 0) {
        if (box) box.innerHTML = '<div style="padding: 30px; text-align: center; color: #909399;">暂未解析到字段结构</div>';
        return;
      }

      let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="background: #fafafa; border-bottom: 2px solid #e8e8e8; position: sticky; top: 0; z-index: 5;">
              <th style="padding: 8px 10px; width: 45px; text-align: center;">序号</th>
              <th style="padding: 8px 10px;">字段名称 (Column)</th>
              <th style="padding: 8px 10px;">数据类型 (Type)</th>
              <th style="padding: 8px 10px;">长度/精度</th>
              <th style="padding: 8px 10px;">允许为空</th>
              <th style="padding: 8px 10px;">主键标识</th>
              <th style="padding: 8px 10px;">默认值</th>
              <th style="padding: 8px 10px;">字段注释 (Comment)</th>
            </tr>
          </thead>
          <tbody>
      `;

      columns.forEach((col, idx) => {
        const pkTag = col.isPrimaryKey ? '<span style="background: #fffbe6; border: 1px solid #ffe58f; color: #faad14; padding: 2px 6px; border-radius: 3px; font-weight: bold;">🔑 主键</span>' : '-';
        const nullTag = col.isNullable ? '<span style="color: #52c41a;">YES</span>' : '<span style="color: #f5222d; font-weight: bold;">NO</span>';
        const rowBg = idx % 2 === 1 ? '#fafcff' : '#ffffff';

        html += `
          <tr style="background: ${rowBg}; border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 6px 10px; text-align: center; color: #8c8c8c;">${idx + 1}</td>
            <td style="padding: 6px 10px; font-weight: 600; color: #1890ff;">${col.columnName}</td>
            <td style="padding: 6px 10px; color: #722ed1;">${col.columnType || '-'}</td>
            <td style="padding: 6px 10px; color: #606266;">${col.columnSize || '-'}</td>
            <td style="padding: 6px 10px;">${nullTag}</td>
            <td style="padding: 6px 10px;">${pkTag}</td>
            <td style="padding: 6px 10px; color: #8c8c8c;">${col.defaultValue || '-'}</td>
            <td style="padding: 6px 10px; color: #303133;">${col.comment || '-'}</td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      if (box) box.innerHTML = html;
    } catch (e) {
      if (box) box.innerHTML = `<div style="padding: 30px; text-align: center; color: #f5222d;">元数据读取异常: ${e.message}</div>`;
    }
  }

  // 执行只读自定义 SQL
  async function executeDvSql() {
    const selDs = document.getElementById('datax-dv-datasource-select');
    const sqlInput = document.getElementById('datax-dv-sql-input');
    const resBox = document.getElementById('datax-dv-sql-result-container');

    if (!selDs || !selDs.value) {
      alert('请先选择目标数据源！');
      return;
    }

    const sql = (sqlInput ? sqlInput.value : '').trim();
    if (!sql) {
      alert('请输入待执行的只读 SELECT SQL 语句！');
      return;
    }

    const dsId = parseInt(selDs.value, 10);
    if (resBox) {
      resBox.innerHTML = '<div style="padding: 30px; text-align: center; color: #1890ff;">⏳ 正在执行 SQL 查询，请稍候...</div>';
    }

    try {
      const resp = await fetch('/api/tableData/executeSql', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          datasourceId: dsId,
          sql: sql,
          pageNo: 1,
          pageSize: 100
        })
      });

      const res = await resp.json();
      if (res.code !== 200 && res.code !== 0) {
        throw new Error(res.msg || 'SQL 执行失败');
      }

      const queryResult = res.data || res.content || {};
      const columns = queryResult.columns || [];
      const rows = queryResult.rows || [];
      const costMs = queryResult.executeTimeMs || 0;

      // 核心：保存 SQL 执行结果与列结构状态，供导出与复制消费
      dvSqlCurrentColumns = columns;
      dvSqlCurrentRows = rows;
      dvSqlLastExecutedSql = sql;
      dvSqlLastCostMs = costMs;
      dvSqlSelectedRowIndices.clear();
      dvSqlLastClickedIdx = null;

      // 清理上一次的 SQL 框选实例
      if (currentDvSqlMarquee && typeof currentDvSqlMarquee.cleanup === 'function') {
        currentDvSqlMarquee.cleanup();
        currentDvSqlMarquee = null;
      }

      if (columns.length === 0 || rows.length === 0) {
        if (resBox) resBox.innerHTML = `<div style="padding: 30px; text-align: center; color: #52c41a;">🎉 SQL 执行成功！耗时: ${costMs} ms (返回 0 行记录)</div>`;
        return;
      }

      let html = `
        <div style="padding: 6px 10px; background: #f6ffed; border-bottom: 1px solid #b7eb8f; color: #52c41a; font-size: 11px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 6;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>🎉 SQL 查询成功，共返回 <strong>${rows.length}</strong> 行记录</span>
            <span>⚡ 耗时: <strong>${costMs}</strong> ms</span>
            <span id="datax-dv-sql-selection-tip" style="margin-left: 8px; color: #1890ff; font-weight: bold;"></span>
          </div>
          <div>
            <span style="color: #8c8c8c; font-size: 11px;">💡 统一点击上方【导出 Excel】或【复制 JSON】(支持拖拽多选)</span>
          </div>
        </div>
        <table style="width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; table-layout: fixed;">
          <thead>
            <tr style="background: #fafafa; border-bottom: 2px solid #e8e8e8; position: sticky; top: 31px; z-index: 5;">
              <th style="padding: 6px 10px; width: 45px; min-width: 45px; text-align: center; position: relative; user-select: none;">#</th>
      `;

      columns.forEach(c => {
        const colWidth = getDvColumnWidth(c.columnName, 180);
        html += `
          <th style="padding: 6px 10px; border-right: 1px solid #f0f0f0; white-space: nowrap; width: ${colWidth}px; min-width: 70px; background: #fafafa; vertical-align: middle; position: relative; box-sizing: border-box;">
            <span>${escapeHtml(c.columnName)}</span>
            <span class="datax-th-resizer" data-col="${escapeHtml(c.columnName)}" data-prevent-marquee="true" title="按住左右拖拽调整此列宽度" style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; user-select: none; z-index: 10;"></span>
          </th>
        `;
      });

      html += `</tr></thead><tbody>`;

      rows.forEach((r, idx) => {
        const rowBg = idx % 2 === 1 ? '#fafcff' : '#ffffff';
        html += `
          <tr style="background: ${rowBg}; border-bottom: 1px solid #f0f0f0; transition: background 0.15s ease; cursor: pointer;" class="datax-dv-sql-table-row" data-row-idx="${idx}" data-orig-bg="${rowBg}" onmouseenter="if(!this.hasAttribute('data-selected')) this.style.background='#f0f7ff'" onmouseleave="if(!this.hasAttribute('data-selected')) this.style.background=this.getAttribute('data-orig-bg')">
            <td style="padding: 6px 10px; text-align: center; color: #8c8c8c; border-right: 1px solid #f0f0f0; width: 45px; box-sizing: border-box; user-select: none;">${idx + 1}</td>
        `;
        columns.forEach(c => {
          const val = r[c.columnName];
          html += renderDvCellTd(val, c.columnName);
        });
        html += `</tr>`;
      });

      html += `</tbody></table>`;
      if (resBox) {
        resBox.innerHTML = html;
        bindDvTableColumnResize(resBox);
        bindDvCellDetailEvents(resBox);

        // 绑定 SQL 结果表格框选引擎
        currentDvSqlMarquee = bindMarqueeSelection({
          container: resBox,
          rowSelector: '.datax-dv-sql-table-row',
          getIdFromRow: row => {
            const idx = parseInt(row.getAttribute('data-row-idx'), 10);
            return isNaN(idx) ? null : idx;
          },
          selectedSet: dvSqlSelectedRowIndices,
          selectedBg: '#bae7ff',
          canStartSelection: e => e.altKey || !e.target.closest('.datax-cell-long-text, .datax-th-resizer, a, button, input, select'),
          onSelectionChange: () => {
            updateDvSqlSelectionTip();
          }
        });

        // 绑定单行点击、Shift 连续区间选行、Ctrl 多选
        resBox.querySelectorAll('.datax-dv-sql-table-row').forEach(tr => {
          tr.onclick = function(e) {
            if (e.target.closest('.datax-cell-long-text, .datax-th-resizer, a, button, input, select')) return;
            if (isUserSelectingText()) return;
            const idx = parseInt(this.getAttribute('data-row-idx'), 10);
            if (isNaN(idx)) return;

            if (e.shiftKey && dvSqlLastClickedIdx !== null) {
              const start = Math.min(dvSqlLastClickedIdx, idx);
              const end = Math.max(dvSqlLastClickedIdx, idx);
              for (let i = start; i <= end; i++) {
                dvSqlSelectedRowIndices.add(i);
              }
            } else if (e.ctrlKey || e.metaKey) {
              if (dvSqlSelectedRowIndices.has(idx)) {
                dvSqlSelectedRowIndices.delete(idx);
              } else {
                dvSqlSelectedRowIndices.add(idx);
              }
            } else {
              dvSqlSelectedRowIndices.clear();
              dvSqlSelectedRowIndices.add(idx);
            }
            dvSqlLastClickedIdx = idx;
            if (currentDvSqlMarquee) currentDvSqlMarquee.syncRowHighlight();
            updateDvSqlSelectionTip();
          };
        });
      }
    } catch (err) {
      if (resBox) {
        resBox.innerHTML = `
          <div style="padding: 24px; text-align: center; color: #f5222d;">
            <div style="font-weight: bold; margin-bottom: 4px;">❌ SQL 执行失败</div>
            <div style="font-size: 12px; background: #fff1f0; padding: 10px; border-radius: 4px; display: inline-block; max-width: 90%; word-break: break-all;">
              ${escapeHtml(err.message)}
            </div>
          </div>
        `;
      }
    }
  }

  /**
   * 导出表数据预览当前数据为 Excel (优先导出当前框选/选中的数据)
   */
  function exportDvDataPreviewToExcel() {
    const selTable = document.getElementById('datax-dv-table-select');
    const table = selTable ? selTable.value : 'data_export';

    if (dvCurrentRows.length === 0) {
      alert('当前表预览没有可导出的数据，请先选择表并点击【🔍 查询】！');
      return;
    }

    let targetRows = dvCurrentRows;
    let isPartial = false;
    if (dvSelectedRowIndices && dvSelectedRowIndices.size > 0) {
      targetRows = dvCurrentRows.filter((_, idx) => dvSelectedRowIndices.has(idx));
      isPartial = true;
    }

    const fileName = `${table}_data_${isPartial ? 'selected_' : ''}export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const headers = dvCurrentColumns.map(c => c.columnName + (c.comment ? ` (${c.comment})` : ''));
    const rowsData = targetRows.map(row => dvCurrentColumns.map(c => {
      const v = row[c.columnName];
      return v !== null && v !== undefined ? v : '';
    }));

    loadSheetJs((XLSX) => {
      if (!XLSX) {
        // 优雅降级：纯前端原生零依赖导出，不阻断业务
        exportToCsvFallback(headers, rowsData, fileName);
        return;
      }

      try {
        const sheetData = [headers, ...rowsData];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, table.substring(0, 31));
        XLSX.writeFile(wb, fileName);
        alert(`🎉 成功导出 ${isPartial ? '已框选的 ' : ''}${targetRows.length} 条记录至 [${fileName}]！`);
      } catch (e) {
        exportToCsvFallback(headers, rowsData, fileName);
      }
    });
  }

  /**
   * 导出只读 SQL 控制台当前查询结果为 Excel
   * 优先导出已选中的行数据，若未选中则导出全部查询记录
   */
  function exportDvSqlToExcel() {
    if (!dvSqlCurrentRows || dvSqlCurrentRows.length === 0) {
      alert('当前只读 SQL 控制台暂无可导出的查询结果，请先输入并执行 SELECT SQL 语句！');
      return;
    }

    let targetRows = dvSqlCurrentRows;
    let isPartial = false;
    if (dvSqlSelectedRowIndices && dvSqlSelectedRowIndices.size > 0) {
      targetRows = dvSqlCurrentRows.filter((_, idx) => dvSqlSelectedRowIndices.has(idx));
      isPartial = true;
    }

    // 生成规范语义文件名 (带有数据源标识与日期)
    const selDs = document.getElementById('datax-dv-datasource-select');
    let dsName = 'datasource';
    if (selDs && selDs.selectedOptions && selDs.selectedOptions[0]) {
      dsName = selDs.selectedOptions[0].text.split('(')[0].trim().replace(/[\\/:*?"<>|]/g, '_');
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `${dsName}_sql_query_${isPartial ? 'selected_' : ''}result_${dateStr}.xlsx`;

    const headers = dvSqlCurrentColumns.map(c => {
      const colName = c.columnName || '';
      return c.comment ? `${colName} (${c.comment})` : colName;
    });
    const rowsData = targetRows.map(row => dvSqlCurrentColumns.map(c => {
      const v = row[c.columnName];
      return v !== null && v !== undefined ? v : '';
    }));

    loadSheetJs((XLSX) => {
      if (!XLSX) {
        // 优雅降级：纯前端原生零依赖导出，不阻断业务
        exportToCsvFallback(headers, rowsData, fileName);
        return;
      }

      try {
        const sheetData = [headers, ...rowsData];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'SQL查询结果');
        XLSX.writeFile(wb, fileName);
        alert(`🎉 成功导出 ${isPartial ? '已框选的 ' : ''}${targetRows.length} 条 SQL 查询记录至 [${fileName}]！`);
      } catch (e) {
        exportToCsvFallback(headers, rowsData, fileName);
      }
    });
  }

  /**
   * 导出表字段元数据为 Excel
   */
  function exportDvSchemaToExcel() {
    const selTable = document.getElementById('datax-dv-table-select');
    const table = selTable ? selTable.value : 'table_schema';
    if (!dvCurrentColumns || dvCurrentColumns.length === 0) {
      alert('当前表暂无字段元数据可供导出，请先选择表！');
      return;
    }

    const fileName = `${table}_schema_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const headers = ['序号', '字段名', '数据类型', '字段长度/精度', '可为空', '主键', '默认值', '字段注释'];
    const rowsData = dvCurrentColumns.map((col, idx) => [
      idx + 1,
      col.columnName || '',
      col.columnType || '',
      col.columnSize || '',
      col.isNullable ? 'YES' : 'NO',
      col.isPrimaryKey ? 'PRI' : '',
      col.defaultValue || '',
      col.comment || ''
    ]);

    loadSheetJs((XLSX) => {
      if (!XLSX) {
        exportToCsvFallback(headers, rowsData, fileName);
        return;
      }
      try {
        const sheetData = [headers, ...rowsData];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '字段结构');
        XLSX.writeFile(wb, fileName);
        alert(`🎉 成功导出表 [${table}] 的 ${dvCurrentColumns.length} 个字段元数据至 [${fileName}]！`);
      } catch (e) {
        exportToCsvFallback(headers, rowsData, fileName);
      }
    });
  }

  // 统一导出当前数据为 Excel (按子 Tab 智能分发，优先导出框选数据)
  function exportDvTableToExcel() {
    if (dvActiveSubView === 'sql') {
      return exportDvSqlToExcel();
    }
    if (dvActiveSubView === 'schema') {
      return exportDvSchemaToExcel();
    }
    return exportDvDataPreviewToExcel();
  }

  /**
   * 公共辅助方法：将表格或查询结果行集合格式化为 JSON 并复制到剪贴板
   *
   * @param {Array<Object>} rows 全量行数据集合
   * @param {Set<number>} selectedIndices 已框选/选中的行索引集合
   * @param {string} emptyMsg 数据为空时的提示文案
   * @param {string} dataLabel 提示语中的数据类别描述（如“数据”或“SQL 查询数据”）
   * @return {Promise<void>}
   */
  async function copyDvRowsAsJson(rows, selectedIndices, emptyMsg, dataLabel) {
    if (!rows || rows.length === 0) {
      alert(emptyMsg);
      return;
    }

    let targetRows = rows;
    let isPartial = false;
    if (selectedIndices && selectedIndices.size > 0) {
      targetRows = rows.filter((_, idx) => selectedIndices.has(idx));
      isPartial = true;
    }

    // 边界防御：若索引集合因翻页或刷新失效导致过滤结果为空，提前拦截
    if (targetRows.length === 0) {
      alert('当前框选范围内暂无有效数据！');
      return;
    }

    let jsonStr = '';
    try {
      jsonStr = JSON.stringify(targetRows, null, 2);
    } catch (e) {
      alert('JSON 序列化失败: ' + (e && e.message ? e.message : '未知错误'));
      return;
    }

    const ok = await copyTextToClipboard(jsonStr);
    if (ok) {
      alert(`🎉 成功将 ${isPartial ? '已框选的 ' : ''}${targetRows.length} 条${dataLabel} JSON 复制到剪贴板！`);
    } else {
      alert('当前浏览器环境不支持自动复制，请手动复制');
    }
  }

  /**
   * 复制表数据预览当前数据为 JSON (优先复制当前框选/选中的数据)
   */
  async function copyDvDataPreviewJson() {
    await copyDvRowsAsJson(
      dvCurrentRows,
      dvSelectedRowIndices,
      '当前表预览没有可复制的数据！',
      '数据'
    );
  }

  /**
   * 复制只读 SQL 控制台当前查询结果为 JSON (优先复制当前框选/选中的数据)
   */
  async function copyDvSqlJson() {
    await copyDvRowsAsJson(
      dvSqlCurrentRows,
      dvSqlSelectedRowIndices,
      '当前只读 SQL 控制台暂无可复制的查询结果！',
      'SQL 查询数据'
    );
  }

  // 统一复制当前数据为 JSON (按子 Tab 智能分发)
  async function copyDvTableJson() {
    if (dvActiveSubView === 'sql') {
      return await copyDvSqlJson();
    }
    return await copyDvDataPreviewJson();
  }

  // HTML 安全转义
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderDvEmptyTable(tip) {
    const container = document.getElementById('datax-dv-table-container');
    if (container) {
      container.innerHTML = `<div style="padding: 40px; text-align: center; color: #909399;">${tip}</div>`;
    }
  }

  // 初始化 Tab 5 数据浏览事件绑定
  function initDataViewerEvents() {
    if (!document.getElementById('datax-dv-column-resizer-style')) {
      const style = document.createElement('style');
      style.id = 'datax-dv-column-resizer-style';
      style.textContent = `
        .datax-th-resizer {
          transition: background 0.15s ease, opacity 0.15s ease;
        }
        .datax-th-resizer:hover {
          background: #1890ff !important;
          opacity: 0.7 !important;
        }
      `;
      document.head.appendChild(style);
    }

    const SearchSelectClass = (window.DataXAssistant && window.DataXAssistant.SearchableSelect) || null;

    // 1. 实例化数据源一体化可搜索下拉框
    if (SearchSelectClass && (!dvDsSelect || !document.body.contains(dvDsSelect.wrapEl))) {
      const dsBox = document.getElementById('datax-dv-datasource-combobox');
      if (dsBox) {
        dvDsSelect = new SearchSelectClass({
          container: dsBox,
          hiddenInput: 'datax-dv-datasource-select',
          placeholder: '-- 请选择或搜索数据源 --',
          allowCustomInput: false,
          emptyText: '未检索到匹配的数据源',
          onSelect: () => {
            onDvDatasourceChange(false);
          }
        });
      }
    }

    const selDs = document.getElementById('datax-dv-datasource-select');
    if (selDs && selDs.tagName === 'SELECT') {
      selDs.onchange = () => onDvDatasourceChange(false);
    }

    const selSchema = document.getElementById('datax-dv-schema-select');
    if (selSchema) {
      selSchema.onchange = () => {
        const dsId = dvDsSelect ? dvDsSelect.getValue() : (selDs ? selDs.value : '');
        saveDvLastSelection(dsId, selSchema.value, '');
        loadDvTableList(false);
      };
    }

    // 2. 实例化数据表一体化可搜索下拉框 (支持同时检索表名与业务注解)
    if (SearchSelectClass && (!dvTableSelect || !document.body.contains(dvTableSelect.wrapEl))) {
      const tableBox = document.getElementById('datax-dv-table-combobox');
      if (tableBox) {
        dvTableSelect = new SearchSelectClass({
          container: tableBox,
          hiddenInput: 'datax-dv-table-select',
          placeholder: '-- 搜索表名或业务中文注解 --',
          allowCustomInput: false,
          emptyText: '未检索到匹配的数据表',
          onSelect: () => {
            onDvTableChange();
          }
        });
      }
    }

    const selTable = document.getElementById('datax-dv-table-select');
    if (selTable && selTable.tagName === 'SELECT') {
      selTable.onchange = onDvTableChange;
    }

    const filterInput = document.getElementById('datax-dv-table-filter');
    if (filterInput) filterInput.oninput = onDvTableFilterInput;

    const btnQuery = document.getElementById('datax-dv-btn-query');
    if (btnQuery) btnQuery.onclick = () => queryDvTableData(1);

    // 监听排序字段、排序类型与每页条数变化，切换后自动刷新第一页数据
    const orderFieldSel = document.getElementById('datax-dv-order-field');
    if (orderFieldSel) orderFieldSel.onchange = () => queryDvTableData(1);

    const orderTypeSel = document.getElementById('datax-dv-order-type');
    if (orderTypeSel) orderTypeSel.onchange = () => queryDvTableData(1);

    const pageSizeSel = document.getElementById('datax-dv-page-size');
    if (pageSizeSel) pageSizeSel.onchange = () => queryDvTableData(1);

    const btnReset = document.getElementById('datax-dv-btn-reset');
    if (btnReset) {
      btnReset.onclick = () => {
        const whereInput = document.getElementById('datax-dv-where-input');
        const orderFieldSel = document.getElementById('datax-dv-order-field');
        const orderTypeSel = document.getElementById('datax-dv-order-type');
        if (whereInput) whereInput.value = '';
        if (orderFieldSel) orderFieldSel.value = '';
        if (orderTypeSel) orderTypeSel.value = 'ASC';
        queryDvTableData(1);
      };
    }

    const commentModeSel = document.getElementById('datax-dv-comment-mode');
    if (commentModeSel) {
      const savedMode = getStorageItem('datax_dv_comment_mode') || 'both';
      commentModeSel.value = savedMode;
      commentModeSel.onchange = function () {
        setStorageItem('datax_dv_comment_mode', this.value);
        if (dvCurrentColumns && dvCurrentColumns.length > 0 && dvCurrentRows && dvCurrentRows.length > 0) {
          renderDvDataTable(dvCurrentColumns, dvCurrentRows);
        }
      };
    }

    const btnReloadDs = document.getElementById('datax-dv-btn-reload-ds');
    if (btnReloadDs) {
      btnReloadDs.onclick = (e) => {
        e.preventDefault();
        loadDataViewerDatasources(true);
      };
    }

    const btnRefresh = document.getElementById('datax-dv-btn-refresh');
    if (btnRefresh) {
      btnRefresh.onclick = () => {
        // 按当前激活的子视图分发刷新动作
        if (dvActiveSubView === 'sql') {
          executeDvSql();
        } else if (dvActiveSubView === 'schema') {
          loadDvTableSchema();
        } else {
          queryDvTableData(dvCurrentPage || 1);
        }
      };
    }

    const btnExport = document.getElementById('datax-dv-btn-export-excel');
    if (btnExport) btnExport.onclick = exportDvTableToExcel;

    const btnCopyJson = document.getElementById('datax-dv-btn-copy-json');
    if (btnCopyJson) btnCopyJson.onclick = copyDvTableJson;

    const btnExecuteSql = document.getElementById('datax-dv-btn-execute-sql');
    if (btnExecuteSql) btnExecuteSql.onclick = executeDvSql;

    // 监听只读 SQL 输入框快捷键: Ctrl + Enter / Cmd + Enter 快速执行
    const sqlInput = document.getElementById('datax-dv-sql-input');
    if (sqlInput) {
      sqlInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          executeDvSql();
        }
      });
    }

    // 子 Tab 切换 (数据 / 表结构 / SQL)
    const btnTabDat = document.getElementById('datax-dv-viewtab-data');
    const btnTabSch = document.getElementById('datax-dv-viewtab-schema');
    const btnTabSql = document.getElementById('datax-dv-viewtab-sql');
    const pnlDat = document.getElementById('datax-dv-panel-data');
    const pnlSch = document.getElementById('datax-dv-panel-schema');
    const pnlSql = document.getElementById('datax-dv-panel-sql');

    function resetSubTabs() {
      [btnTabDat, btnTabSch, btnTabSql].forEach(b => {
        if (!b) return;
        b.style.background = '#fff';
        b.style.color = '#606266';
        b.style.borderColor = '#dcdfe6';
        b.style.fontWeight = 'normal';
      });
      [pnlDat, pnlSch, pnlSql].forEach(p => { if (p) p.style.display = 'none'; });
    }

    if (btnTabDat) {
      btnTabDat.onclick = () => {
        resetSubTabs();
        btnTabDat.style.background = '#1890ff';
        btnTabDat.style.color = '#fff';
        btnTabDat.style.borderColor = '#1890ff';
        btnTabDat.style.fontWeight = 'bold';
        if (pnlDat) pnlDat.style.display = 'flex';
        dvActiveSubView = 'data';
        if (dvCurrentRows.length === 0) queryDvTableData(1);
      };
    }

    if (btnTabSch) {
      btnTabSch.onclick = () => {
        resetSubTabs();
        btnTabSch.style.background = '#1890ff';
        btnTabSch.style.color = '#fff';
        btnTabSch.style.borderColor = '#1890ff';
        btnTabSch.style.fontWeight = 'bold';
        if (pnlSch) pnlSch.style.display = 'flex';
        dvActiveSubView = 'schema';
        loadDvTableSchema();
      };
    }

    if (btnTabSql) {
      btnTabSql.onclick = () => {
        resetSubTabs();
        btnTabSql.style.background = '#1890ff';
        btnTabSql.style.color = '#fff';
        btnTabSql.style.borderColor = '#1890ff';
        btnTabSql.style.fontWeight = 'bold';
        if (pnlSql) pnlSql.style.display = 'flex';
        dvActiveSubView = 'sql';

        // 装配【SQL 查询管理】与【常用 SQL 选用】工具条 (账号强隔离)
        if (window.DataXAssistant && window.DataXAssistant.SqlTemplateManager) {
          const dvSqlToolbar = document.getElementById('datax-dv-sql-actions-bar');
          if (dvSqlToolbar) {
            window.DataXAssistant.SqlTemplateManager.bindSqlToolbar({
              toolbarContainer: dvSqlToolbar,
              textarea: 'datax-dv-sql-input',
              getTableName: () => {
                const selTable = document.getElementById('datax-dv-table-select');
                return selTable ? selTable.value : '';
              },
              getDatasourceId: () => {
                const selDs = document.getElementById('datax-dv-datasource-select');
                return selDs ? selDs.value : '';
              },
              onSelect: () => executeDvSql()
            });
          }
        }
      };
    }

    // 分页按钮绑定
    const btnFirst = document.getElementById('datax-dv-btn-first');
    if (btnFirst) btnFirst.onclick = () => queryDvTableData(1);

    const btnPrev = document.getElementById('datax-dv-btn-prev');
    if (btnPrev) btnPrev.onclick = () => { if (dvCurrentPage > 1) queryDvTableData(dvCurrentPage - 1); };

    const btnNext = document.getElementById('datax-dv-btn-next');
    if (btnNext) {
      btnNext.onclick = () => {
        const totalPages = Math.max(1, Math.ceil(dvCurrentTotal / dvCurrentPageSize));
        if (dvCurrentPage < totalPages) queryDvTableData(dvCurrentPage + 1);
      };
    }

    const btnJump = document.getElementById('datax-dv-btn-jump');
    if (btnJump) {
      btnJump.onclick = () => {
        const jumpInput = document.getElementById('datax-dv-jump-page');
        const page = parseInt(jumpInput ? jumpInput.value : '1', 10);
        if (page >= 1) queryDvTableData(page);
      };
    }

    const copyDdlBtn = document.getElementById('datax-dv-btn-copy-ddl');
    if (copyDdlBtn) {
      copyDdlBtn.onclick = () => {
        const selTable = document.getElementById('datax-dv-table-select');
        const table = selTable ? selTable.value : 'table_name';
        if (dvCurrentColumns.length === 0) {
          alert('请先加载字段元数据！');
          return;
        }
        let ddl = `CREATE TABLE \`${table}\` (\n`;
        const colDefs = dvCurrentColumns.map(c => {
          let s = `  \`${c.columnName}\` ${c.columnType || 'VARCHAR(255)'}`;
          if (!c.isNullable) s += ' NOT NULL';
          if (c.defaultValue) s += ` DEFAULT '${c.defaultValue}'`;
          if (c.comment) s += ` COMMENT '${c.comment}'`;
          return s;
        });
        const pkCols = dvCurrentColumns.filter(c => c.isPrimaryKey).map(c => `\`${c.columnName}\``);
        if (pkCols.length > 0) {
          colDefs.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
        }
        ddl += colDefs.join(',\n') + '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;';
        showDdlModal(table, ddl);
      };
    }
  }

  class Tab5DataViewer {
    constructor(container) {
      this.container = container;
    }

    init() {
      if (typeof initDataViewerEvents === 'function') {
        initDataViewerEvents();
      }
      if (typeof loadDataViewerDatasources === 'function') {
        loadDataViewerDatasources();
      }
    }

    refresh() {
      const selDs = document.getElementById('datax-dv-datasource-select');
      const selTable = document.getElementById('datax-dv-table-select');

      // 场景 1: 若当前已经初始化，且已经选定了数据源和数据表
      if (dvDatasources.length > 0 && selDs && selDs.value && selTable && selTable.value) {
        // 如果当前已有渲染的数据记录或在表结构/SQL等子视图中，完整保护当前现场，无需重刷
        if (dvCurrentRows && dvCurrentRows.length > 0) {
          return;
        }
        // 若当前处于数据视图但尚未加载数据，仅针对当前选定的表触发一次数据查询
        if (dvActiveSubView === 'data' && typeof queryDvTableData === 'function') {
          queryDvTableData(dvCurrentPage || 1);
        }
        return;
      }

      // 场景 2: 首次加载或处于未初始化状态，触发加载数据源并恢复上次选中的库表
      if (typeof loadDataViewerDatasources === 'function') {
        loadDataViewerDatasources(false);
      }
    }
  }

  window.DataXAssistant.Tabs.Tab5Class = Tab5DataViewer;
  window.DataXAssistant.loadSheetJs = loadSheetJs;
})();
