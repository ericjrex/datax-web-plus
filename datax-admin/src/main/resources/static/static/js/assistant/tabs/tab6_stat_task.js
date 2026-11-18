/**
 * @fileoverview Tab 6: 统计计算任务管理 (Tab6StatTask)
 * 提供 SQL / Python 双引擎的指标计算调度、运行日志与目标表输出。
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


  // 阻塞策略字典映射与标签样式
  const BLOCK_STRATEGY_MAP = {
    'DISCARD_LATER': { label: '丢弃后续调度', short: '丢弃', color: '#595959', bg: '#fafafa', border: '#d9d9d9' },
    'SERIAL_EXECUTION': { label: '单机串行', short: '串行', color: '#d46b08', bg: '#fff7e6', border: '#ffd591' },
    'COVER_EARLY': { label: '覆盖之前调度', short: '覆盖', color: '#531dab', bg: '#f9f0ff', border: '#d3adf7' },
    'CONCURRENT': { label: '允许并行', short: '并行', color: '#08979c', bg: '#e6fffb', border: '#87e8de' }
  };

  function getBlockStrategyInfo(strategy) {
    const key = (strategy || 'DISCARD_LATER').trim().toUpperCase();
    return BLOCK_STRATEGY_MAP[key] || { label: strategy || '丢弃后续调度', short: '策略', color: '#595959', bg: '#fafafa', border: '#d9d9d9' };
  }

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

  let stAllDatasources = [];
  let stCurrentEditingTask = null;
  const stSelectedTaskIds = new Set(); // 选中的统计任务 ID 集合 (支持框选、复选框点击、Ctrl多选、Shift连续选)
  let currentStMarquee = null; // 统计任务列表通用矩形框选引擎实例
  let stLastClickedId = null; // 记录最近点击的任务 ID，用于 Shift 连续区间多选
  let stCurrentRecords = []; // 记录当前页统计任务列表数据

  // 元数据缓存与表清单状态 (源端与目标端)
  const stDsTablesCache = new Map(); // 内存缓存池: dsId -> Array<{tableName, tableComment}>
  let stSourceTables = []; // 源端当前数据源的全部表清单
  let stFilteredSourceTables = []; // 源端过滤后的表清单
  let stTargetTables = []; // 目标端当前数据源的全部表清单
  let stFilteredTargetTables = []; // 目标端过滤后的表清单

  // 一体化可搜索下拉选择组件全局实例
  let stSourceDsSelect = null;    // 源端数据源 Combobox 实例
  let stPythonDsSelect = null;    // Python 模式源端数据源 Combobox 实例
  let stSourceTableSelect = null; // 源端表名与注解 Combobox 实例
  let stTargetDsSelect = null;    // 目标端数据源 Combobox 实例
  let stTargetTableSelect = null; // 目标端表名与注解 Combobox 实例 (支持手写输入新表名)

  /**
   * 下拉搜索一体化组件 (SearchableSelect / Combobox)
   * 采用纯原生 DOM 构建，支持框内键入即时模糊检索、业务中文注解标签、清空、键盘快速选择与自定义新建输入。
   */
  class SearchableSelect {
    /**
     * @param {Object} options 配置参数
     * @param {string|HTMLElement} options.container 挂载容器元素或 CSS 选择器
     * @param {string|HTMLElement} options.hiddenInput 关联绑定的隐藏域元素或 ID
     * @param {string} [options.placeholder='-- 请选择 --'] 占位提示文案
     * @param {boolean} [options.allowCustomInput=false] 是否允许自由手写输入新值 (如目标端自动建表)
     * @param {Function} [options.onSelect] 选中项回调: (value, item) => void
     * @param {string} [options.emptyText='未找到匹配项'] 空结果提示文案
     */
    constructor(options) {
      this.container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
      this.hiddenInput = typeof options.hiddenInput === 'string' ? document.getElementById(options.hiddenInput) : options.hiddenInput;
      this.placeholder = options.placeholder || '-- 请选择 --';
      this.allowCustomInput = !!options.allowCustomInput;
      this.onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
      this.emptyText = options.emptyText || '未找到匹配项';

      this.items = [];         // 全部候选项: Array<{ value, label, subLabel?, title? }>
      this.filteredItems = []; // 经过关键字检索过滤后的候选项
      this.selectedValue = ''; // 当前实际选中的 value
      this.isOpen = false;     // 下拉浮层展开状态

      this.initDOM();
      this.bindEvents();
    }

    /**
     * 构建组件原生 DOM 骨架
     */
    initDOM() {
      if (!this.container) return;
      this.container.innerHTML = '';
      this.container.style.position = 'relative';

      // 控件外层容器
      this.wrapEl = document.createElement('div');
      this.wrapEl.className = 'datax-ss-control';
      this.wrapEl.style.cssText = 'display: flex; align-items: center; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; padding: 2px 6px; box-sizing: border-box; cursor: pointer; min-height: 28px; width: 100%; transition: border-color 0.2s;';

      // 文本/检索输入框
      this.inputEl = document.createElement('input');
      this.inputEl.type = 'text';
      this.inputEl.className = 'datax-ss-input';
      this.inputEl.placeholder = this.placeholder;
      this.inputEl.autocomplete = 'off';
      this.inputEl.style.cssText = 'flex: 1; border: none; outline: none; background: transparent; font-size: 11px; padding: 3px 0; min-width: 60px; color: #303133;';

      // 徽标指示器 (如 "120 张表")
      this.badgeEl = document.createElement('span');
      this.badgeEl.className = 'datax-ss-badge';
      this.badgeEl.style.cssText = 'font-size: 10px; color: #52c41a; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 3px; padding: 0 5px; margin-right: 4px; display: none; white-space: nowrap; line-height: 16px; user-select: none;';

      // 清空按钮
      this.clearBtn = document.createElement('span');
      this.clearBtn.className = 'datax-ss-clear';
      this.clearBtn.innerHTML = '&times;';
      this.clearBtn.title = '清空';
      this.clearBtn.style.cssText = 'font-size: 14px; line-height: 1; color: #c0c4cc; cursor: pointer; margin-right: 4px; display: none; font-weight: bold; user-select: none;';

      // 下拉小箭头
      this.arrowEl = document.createElement('span');
      this.arrowEl.className = 'datax-ss-arrow';
      this.arrowEl.textContent = '▼';
      this.arrowEl.style.cssText = 'font-size: 9px; color: #909399; user-select: none; transition: transform 0.2s; transform-origin: center; display: inline-block;';

      this.wrapEl.appendChild(this.inputEl);
      this.wrapEl.appendChild(this.badgeEl);
      this.wrapEl.appendChild(this.clearBtn);
      this.wrapEl.appendChild(this.arrowEl);

      // 下拉面板浮层 (绝对定位)
      this.dropdownEl = document.createElement('div');
      this.dropdownEl.className = 'datax-ss-dropdown';
      this.dropdownEl.style.cssText = 'display: none; position: absolute; top: calc(100% + 2px); left: 0; right: 0; max-height: 220px; overflow-y: auto; background: #fff; border: 1px solid #dcdfe6; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); z-index: 1050; padding: 4px 0; box-sizing: border-box;';

      this.container.appendChild(this.wrapEl);
      this.container.appendChild(this.dropdownEl);
    }

    /**
     * 绑定交互与事件监听
     */
    bindEvents() {
      if (!this.wrapEl || !this.inputEl) return;

      // 点击控件外壳聚焦并展开
      this.wrapEl.addEventListener('click', (e) => {
        if (e.target === this.clearBtn) return;
        this.inputEl.focus();
        if (!this.isOpen) {
          this.openDropdown();
        }
      });

      // 输入框聚焦展开
      this.inputEl.addEventListener('focus', () => {
        this.wrapEl.style.borderColor = '#1890ff';
        this.openDropdown();
      });

      // 实时打字检索过滤
      this.inputEl.addEventListener('input', () => {
        const kw = this.inputEl.value.trim();
        this.updateClearBtnVisibility();

        if (this.allowCustomInput) {
          // 自定义自由手写模式下 (如目标表)，当前输入内容即为最终输出表名
          this.selectedValue = kw;
          if (this.hiddenInput) this.hiddenInput.value = kw;
          this.onSelect(kw, null);
        }

        this.filterAndRenderOptions(kw);
        if (!this.isOpen) {
          this.openDropdown();
        }
      });

      // 键盘按键支持
      this.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeDropdown();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.filteredItems && this.filteredItems.length > 0) {
            this.selectItem(this.filteredItems[0]);
          } else if (this.allowCustomInput) {
            this.closeDropdown();
          }
        }
      });

      // 清空事件
      this.clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clear();
      });

      // 点击外部自动收起浮层
      this._docClickHandler = (e) => {
        if (!this.container || !this.container.contains(e.target)) {
          if (this.isOpen) {
            this.closeDropdown();
            this.onBlurCheck();
          }
        }
      };
      document.addEventListener('click', this._docClickHandler);
    }

    onBlurCheck() {
      if (!this.wrapEl) return;
      this.wrapEl.style.borderColor = '#dcdfe6';
      if (this.allowCustomInput) {
        const cur = this.inputEl.value.trim();
        this.selectedValue = cur;
        if (this.hiddenInput) this.hiddenInput.value = cur;
      } else {
        // 非自由输入项 (如数据源)：若输入的文字与选中项不一致，自动恢复上次选中项
        const matched = this.items.find(it => String(it.value) === String(this.selectedValue));
        if (matched) {
          this.inputEl.value = matched.label;
        } else if (!this.selectedValue) {
          this.inputEl.value = '';
        }
      }
      this.updateClearBtnVisibility();
    }

    updateClearBtnVisibility() {
      if (this.clearBtn) {
        this.clearBtn.style.display = (this.inputEl.value || this.selectedValue) ? 'inline' : 'none';
      }
    }

    openDropdown() {
      this.isOpen = true;
      if (this.dropdownEl) this.dropdownEl.style.display = 'block';
      if (this.arrowEl) this.arrowEl.style.transform = 'rotate(180deg)';
      this.filterAndRenderOptions(this.inputEl ? this.inputEl.value.trim() : '');
    }

    closeDropdown() {
      this.isOpen = false;
      if (this.dropdownEl) this.dropdownEl.style.display = 'none';
      if (this.arrowEl) this.arrowEl.style.transform = 'rotate(0deg)';
    }

    /**
     * 设置全部候选项
     * @param {Array<{value: string|number, label: string, subLabel?: string, title?: string}>} items
     */
    setItems(items) {
      this.items = Array.isArray(items) ? items : [];
      this.filteredItems = [...this.items];
      if (this.selectedValue !== '') {
        const found = this.items.find(it => String(it.value) === String(this.selectedValue));
        if (found && this.inputEl) {
          this.inputEl.value = found.label;
        }
      }
      this.updateClearBtnVisibility();
      if (this.isOpen) {
        this.filterAndRenderOptions(this.inputEl ? this.inputEl.value.trim() : '');
      }
    }

    /**
     * 过滤并使用纯原生安全 DOM 渲染候选项
     * @param {string} keyword 检索词
     */
    filterAndRenderOptions(keyword) {
      if (!this.dropdownEl) return;
      const kw = (keyword || '').toLowerCase();

      if (!kw) {
        this.filteredItems = [...this.items];
      } else {
        this.filteredItems = this.items.filter(it => {
          const matchLabel = it.label && String(it.label).toLowerCase().includes(kw);
          const matchSub = it.subLabel && String(it.subLabel).toLowerCase().includes(kw);
          const matchVal = it.value && String(it.value).toLowerCase().includes(kw);
          return matchLabel || matchSub || matchVal;
        });
      }

      this.dropdownEl.innerHTML = '';
      if (this.filteredItems.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.style.cssText = 'padding: 8px 12px; font-size: 11px; color: #909399; text-align: center;';
        emptyEl.textContent = this.emptyText;
        this.dropdownEl.appendChild(emptyEl);
        return;
      }

      const fragment = document.createDocumentFragment();
      this.filteredItems.forEach(it => {
        const optEl = document.createElement('div');
        const isSelected = String(it.value) === String(this.selectedValue);
        optEl.style.cssText = `padding: 6px 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f2f2f2; font-size: 11px; ${isSelected ? 'background: #e6f7ff; color: #1890ff; font-weight: bold;' : 'color: #303133;'}`;

        optEl.addEventListener('mouseenter', () => {
          if (String(it.value) !== String(this.selectedValue)) {
            optEl.style.background = '#f5f7fa';
          }
        });
        optEl.addEventListener('mouseleave', () => {
          if (String(it.value) !== String(this.selectedValue)) {
            optEl.style.background = 'transparent';
          }
        });

        // 标签左侧 (表名或数据源名称)
        const labelEl = document.createElement('span');
        labelEl.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 6px;';
        labelEl.textContent = it.label; // 原生安全赋值杜绝 XSS
        optEl.appendChild(labelEl);

        // 注解右侧 (如业务中文表注解或库名)，以绿色/浅蓝徽章呈现
        if (it.subLabel) {
          const subEl = document.createElement('span');
          subEl.style.cssText = 'font-size: 10px; color: #52c41a; background: #f6ffed; border: 1px solid #b7eb8f; padding: 1px 5px; border-radius: 3px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0;';
          subEl.textContent = it.subLabel;
          optEl.appendChild(subEl);
        }

        if (it.title) {
          optEl.title = it.title;
        } else if (it.subLabel) {
          optEl.title = `${it.label} (${it.subLabel})`;
        } else {
          optEl.title = it.label;
        }

        optEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectItem(it);
        });

        fragment.appendChild(optEl);
      });

      this.dropdownEl.appendChild(fragment);
    }

    selectItem(item) {
      this.setValue(item.value, item.label);
      this.closeDropdown();
      this.onSelect(item.value, item);
    }

    /**
     * 设置选中值与回显文本
     * @param {string|number} value 选中值
     * @param {string} [label] 回显文本
     */
    setValue(value, label = null) {
      this.selectedValue = value !== null && value !== undefined ? String(value) : '';
      if (this.hiddenInput) {
        this.hiddenInput.value = this.selectedValue;
      }

      if (label !== null) {
        if (this.inputEl) this.inputEl.value = label;
      } else if (this.selectedValue) {
        const found = this.items.find(it => String(it.value) === String(this.selectedValue));
        if (this.inputEl) {
          this.inputEl.value = found ? found.label : (this.allowCustomInput ? this.selectedValue : '');
        }
      } else {
        if (this.inputEl) this.inputEl.value = '';
      }

      this.updateClearBtnVisibility();
    }

    getValue() {
      return this.selectedValue || (this.allowCustomInput && this.inputEl ? this.inputEl.value.trim() : '');
    }

    /**
     * 设置右侧徽章文本 (如 '120 张表')
     * @param {string} text 徽章内容
     */
    setBadge(text) {
      if (!this.badgeEl) return;
      if (text) {
        this.badgeEl.textContent = text;
        this.badgeEl.style.display = 'inline-block';
      } else {
        this.badgeEl.textContent = '';
        this.badgeEl.style.display = 'none';
      }
    }

    clear() {
      this.setValue('', '');
      if (this.isOpen) {
        this.filterAndRenderOptions('');
      }
      this.onSelect('', null);
    }

    destroy() {
      if (this._docClickHandler) {
        document.removeEventListener('click', this._docClickHandler);
      }
    }
  }

  /**
   * 将数据源原始集合转换为 SearchableSelect 格式
   * @param {Array<Object>} datasources 数据源列表
   * @return {Array<Object>} 适配项
   */
  function mapDatasourcesToSelectItems(datasources) {
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
   * 将表信息集合转换为 SearchableSelect 格式
   * @param {Array<Object>} tables 表列表
   * @return {Array<Object>} 适配项
   */
  function mapTablesToSelectItems(tables) {
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

  /**
   * 模糊过滤数据源列表 (公共方法，供顶部原生 select 筛选备用)
   * @param {Array<Object>} datasources 数据源列表
   * @param {string} keyword 过滤关键字
   * @return {Array<Object>} 匹配的数据源列表
   */
  function filterDatasourceOptions(datasources, keyword) {
    if (!Array.isArray(datasources)) return [];
    const kw = (keyword || '').trim().toLowerCase();
    if (!kw) return [...datasources];
    return datasources.filter(ds => {
      const name = String(ds.datasourceName || ds.datasource || '').toLowerCase();
      const type = String(ds.datasource || '').toLowerCase();
      const dbName = String(ds.databaseName || parseDbNameFromUrl(ds.jdbcUrl) || '').toLowerCase();
      const idStr = String(ds.id || '');
      return name.includes(kw) || type.includes(kw) || dbName.includes(kw) || idStr.includes(kw);
    });
  }

  /**
   * 模糊过滤表名与表注解 (公共方法)
   * @param {Array<Object>} tables 规范化的表对象列表
   * @param {string} keyword 过滤关键字
   * @return {Array<Object>} 匹配的表对象列表
   */
  function filterTableInfoList(tables, keyword) {
    if (!Array.isArray(tables)) return [];
    const kw = (keyword || '').trim().toLowerCase();
    if (!kw) return [...tables];
    return tables.filter(t => {
      const matchName = t.tableName && t.tableName.toLowerCase().includes(kw);
      const matchComment = t.tableComment && t.tableComment.toLowerCase().includes(kw);
      return matchName || matchComment;
    });
  }

  /**
   * 统一渲染数据源下拉选项 (供顶部查询栏下拉使用)
   * @param {HTMLSelectElement} selectEl 下拉框元素
   * @param {Array<Object>} datasources 数据源列表
   * @param {string|number} selectedVal 当前选中的数据源ID
   * @param {string} placeholder 占位提示文案
   */
  function renderDatasourceDropdown(selectEl, datasources, selectedVal = '', placeholder = '-- 请选择数据源 --') {
    if (!selectEl) return;
    let opts = `<option value="">${placeholder}</option>`;
    datasources.forEach(ds => {
      const name = ds.datasourceName || ds.datasource || `ID:${ds.id}`;
      const type = ds.datasource ? ` [${ds.datasource.toUpperCase()}]` : '';
      const dbName = ds.databaseName || parseDbNameFromUrl(ds.jdbcUrl);
      const dbBadge = dbName ? ` (库: ${dbName})` : '';
      const isSel = String(selectedVal) === String(ds.id) ? 'selected' : '';
      opts += `<option value="${ds.id}" ${isSel}>${name}${type}${dbBadge} - (ID: ${ds.id})</option>`;
    });
    selectEl.innerHTML = opts;
  }

  /**
   * 异步获取指定数据源的数据表及注解信息 (带会话级内存缓存与平滑降级)
   * @param {number|string} datasourceId 数据源ID
   * @return {Promise<Array<Object>>} 表对象集合
   */
  async function fetchDatasourceTablesWithCache(datasourceId) {
    if (!datasourceId) return [];
    const dsId = parseInt(datasourceId, 10);
    if (isNaN(dsId)) return [];

    if (stDsTablesCache.has(dsId)) {
      return stDsTablesCache.get(dsId);
    }

    try {
      // 1. 优先调用携带表注解的高级元数据接口
      let res = null;
      try {
        const resp = await fetch(`/api/tableData/tables?datasourceId=${dsId}`, {
          headers: getAuthHeaders()
        });
        if (resp.ok) {
          res = await resp.json();
        }
      } catch (ignored) {}

      // 2. 若高级接口未响应或报错，降级调用基础表名接口兜底
      if (!res || !isApiSuccess(res)) {
        const fbResp = await fetch(`/api/metadata/getTables?datasourceId=${dsId}`, {
          headers: getAuthHeaders()
        });
        res = await fbResp.json();
      }

      if (isApiSuccess(res)) {
        const rawList = extractListFromResponse(res);
        const normalized = rawList.map(item => normalizeTableItem(item)).filter(t => Boolean(t.tableName));
        stDsTablesCache.set(dsId, normalized);
        return normalized;
      }
    } catch (err) {
      console.warn(`获取数据源 [${dsId}] 表清单失败:`, err);
    }
    return [];
  }

  /**
   * 绑定通用表格鼠标拖拽矩形框选引擎 (Universal Marquee Selection Engine)
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
   * 刷新 Tab 6 统计任务多选状态与批量操作栏
   */
  function updateStSelectionUI() {
    const count = stSelectedTaskIds.size;
    const total = stCurrentRecords.length;

    const countEl = document.getElementById('datax-st-selected-count');
    if (countEl) countEl.textContent = String(count);

    const totalEl = document.getElementById('datax-st-total-count');
    if (totalEl) totalEl.textContent = String(total);

    const checkAll = document.getElementById('datax-st-check-all');
    if (checkAll) {
      checkAll.checked = total > 0 && count === total;
      checkAll.indeterminate = count > 0 && count < total;
    }

    const thCheckAll = document.getElementById('datax-st-th-check-all');
    if (thCheckAll) {
      thCheckAll.checked = total > 0 && count === total;
      thCheckAll.indeterminate = count > 0 && count < total;
    }

    const batchBar = document.getElementById('datax-st-batch-bar');
    if (batchBar) {
      batchBar.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    document.querySelectorAll('.datax-st-sel-num').forEach(el => {
      el.textContent = String(count);
    });

    if (currentStMarquee) {
      currentStMarquee.syncRowHighlight();
    }
  }

  // 1. 加载数据源列表 (供统计任务源库与目标库选择，多级探测 + 自动降级兜底)
  async function loadStatTaskDatasources(forceRefresh = false) {
    if (!forceRefresh && stAllDatasources && stAllDatasources.length > 0) return;

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
            break;
          }
        }
      } catch (e) {
        console.warn(`请求数据源接口 [${url}] 失败:`, e);
      }
    }

    if (list.length === 0) {
      list = getDatasourceListFromMemory();
    }

    stAllDatasources = list;

    // 渲染顶部查询栏数据源下拉
    const searchDsSelect = document.getElementById('datax-st-search-ds');
    if (searchDsSelect) {
      const curSearchDs = searchDsSelect.value;
      renderDatasourceDropdown(searchDsSelect, stAllDatasources, curSearchDs, '全部数据源');
    }

    // 渲染源端、Python模式与目标端一体化数据源下拉组件
    const dsItems = mapDatasourcesToSelectItems(stAllDatasources);
    if (stSourceDsSelect) {
      stSourceDsSelect.setItems(dsItems);
    }
    if (stPythonDsSelect) {
      stPythonDsSelect.setItems(dsItems);
    }
    if (stTargetDsSelect) {
      stTargetDsSelect.setItems(dsItems);
    }
    renderPythonAvailableDatasources();
  }

  // 2. 分页查询并渲染统计任务列表
  async function loadStatTaskList(pageNo = 1) {
    const listContainer = document.getElementById('datax-st-list-container');
    if (!listContainer) return;

    const nameInput = document.getElementById('datax-st-search-name');
    const dsSelect = document.getElementById('datax-st-search-ds');
    const tableInput = document.getElementById('datax-st-search-table');
    const typeSelect = document.getElementById('datax-st-search-type');
    const statusSelect = document.getElementById('datax-st-search-status');

    const name = nameInput ? nameInput.value.trim() : '';
    const dsId = dsSelect ? dsSelect.value : '';
    const tableName = tableInput ? tableInput.value.trim() : '';
    const type = typeSelect ? typeSelect.value : '';
    const status = statusSelect ? statusSelect.value : '';

    let url = `/api/statTask/pageList?pageNo=${pageNo}&pageSize=20`;
    if (name) url += `&taskName=${encodeURIComponent(name)}`;
    if (dsId) url += `&datasourceId=${encodeURIComponent(dsId)}`;
    if (tableName) url += `&tableName=${encodeURIComponent(tableName)}`;
    if (type) url += `&taskType=${encodeURIComponent(type)}`;
    if (status !== '') url += `&status=${status}`;

    listContainer.innerHTML = '<div style="text-align: center; color: #909399; padding: 40px;">⏳ 正在加载数据加工任务列表...</div>';

    try {
      const res = await fetch(url, { headers: getAuthHeaders() });
      const json = await res.json();
      if (isApiSuccess(json) && json.data) {
        renderStatTaskList(json.data.records || (Array.isArray(json.data) ? json.data : []));
      } else {
        listContainer.innerHTML = `<div style="text-align: center; color: #f5222d; padding: 30px;">❌ 加载失败: ${getApiMsg(json)}</div>`;
      }
    } catch (e) {
      listContainer.innerHTML = `<div style="text-align: center; color: #f5222d; padding: 30px;">❌ 请求异常: ${e.message}</div>`;
    }
  }

  // 加载源端数据源的数据表清单及注解 (驱动一体化表下拉框)
  async function loadStatSourceTables(datasourceId, initialSelectedTable = '') {
    if (!datasourceId) {
      stSourceTables = [];
      stFilteredSourceTables = [];
      if (stSourceTableSelect) {
        stSourceTableSelect.setItems([]);
        stSourceTableSelect.clear();
        stSourceTableSelect.setBadge('0 张表');
      }
      return;
    }

    if (stSourceTableSelect) {
      stSourceTableSelect.setBadge('获取中...');
    }

    stSourceTables = await fetchDatasourceTablesWithCache(datasourceId);
    stFilteredSourceTables = [...stSourceTables];
    const tableItems = mapTablesToSelectItems(stSourceTables);

    if (stSourceTableSelect) {
      stSourceTableSelect.setItems(tableItems);
      stSourceTableSelect.setBadge(`${tableItems.length} 张表`);
      if (initialSelectedTable) {
        stSourceTableSelect.setValue(initialSelectedTable);
      }
    }
  }

  // 将选中的源端表名插入到 SQL 光标处
  function insertSourceTableToSql() {
    const tableName = stSourceTableSelect ? stSourceTableSelect.getValue() : '';
    if (!tableName) {
      alert('请先在源端表下拉搜索框中选择一张数据表！');
      return;
    }
    const sqlArea = document.getElementById('datax-st-form-sql');
    if (!sqlArea) return;
    const pos = sqlArea.selectionStart !== undefined ? sqlArea.selectionStart : sqlArea.value.length;
    const text = sqlArea.value;
    sqlArea.value = text.substring(0, pos) + tableName + text.substring(pos);
    sqlArea.focus();
    const newPos = pos + tableName.length;
    if (sqlArea.setSelectionRange) {
      sqlArea.setSelectionRange(newPos, newPos);
    }
  }

  // 生成所选源端表的基础统计 SQL
  function generateSourceTableSelectSql() {
    const tableName = stSourceTableSelect ? stSourceTableSelect.getValue() : '';
    if (!tableName) {
      alert('请先在源端表下拉搜索框中选择一张数据表！');
      return;
    }
    const sqlArea = document.getElementById('datax-st-form-sql');
    if (!sqlArea) return;
    const templateSql = `SELECT * FROM ${tableName} WHERE 1 = 1 LIMIT 100;`;
    if (sqlArea.value.trim() && !confirm('当前 SQL 输入框已有内容，生成模板将覆盖现有内容，是否继续？')) {
      return;
    }
    sqlArea.value = templateSql;
    sqlArea.focus();
  }

  /**
   * 渲染 Python 模式专属的已配置可选数据源徽标列表
   * 提示用户哪些库可选，支持一键点击切换绑定源库
   * @param {string|number} [selectedDsId] 当前选中的数据源 ID
   */
  function renderPythonAvailableDatasources(selectedDsId) {
    const container = document.getElementById('datax-st-python-available-ds-badges');
    if (!container) return;

    if (!stAllDatasources || stAllDatasources.length === 0) {
      container.innerHTML = '<span style="font-size: 11px; color: #909399;">暂未检测到已配置的数据源，可在系统【数据源管理】中添加</span>';
      return;
    }

    const currentDsVal = selectedDsId !== undefined && selectedDsId !== null && selectedDsId !== ''
      ? String(selectedDsId)
      : (document.getElementById('datax-st-form-source-ds')?.value || '');

    container.innerHTML = '';
    stAllDatasources.forEach(ds => {
      const dsIdStr = String(ds.id);
      const isSelected = (dsIdStr === currentDsVal);
      const name = ds.datasourceName || ds.datasource || `ID:${ds.id}`;
      const type = (ds.datasource || '').toUpperCase();
      const dbName = ds.databaseName || parseDbNameFromUrl(ds.jdbcUrl) || '默认库';

      const badge = document.createElement('span');
      badge.className = 'datax-st-py-ds-badge';
      badge.setAttribute('data-ds-id', dsIdStr);
      badge.title = `点击快捷关联绑定该数据源\nID: ${ds.id}\n名称: ${name}\n类型: ${type}\n数据库: ${dbName}\nJDBC: ${ds.jdbcUrl || ''}`;
      badge.style.cssText = `display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: all 0.2s; user-select: none; ${
        isSelected
          ? 'background: #722ed1; color: #fff; border: 1px solid #722ed1; font-weight: bold; box-shadow: 0 1px 4px rgba(114,46,209,0.3);'
          : 'background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7;'
      }`;

      badge.innerHTML = `<span>[ID: ${ds.id}] ${name}</span><span style="font-size: 10px; opacity: 0.85;">(${type} · ${dbName})</span>`;

      badge.onclick = () => {
        document.getElementById('datax-st-form-source-ds').value = dsIdStr;
        if (stSourceDsSelect) stSourceDsSelect.setValue(dsIdStr);
        if (stPythonDsSelect) stPythonDsSelect.setValue(dsIdStr);
        renderPythonAvailableDatasources(dsIdStr);
        loadStatSourceTables(dsIdStr);

        const tip = document.getElementById('datax-st-form-tip');
        if (tip) {
          tip.innerHTML = `<span style="color: #722ed1;">已绑定数据源 [ID: ${ds.id}] ${name}，执行 Python 时将自动注入该库免密连接凭据</span>`;
        }
      };

      container.appendChild(badge);
    });
  }

  /**
   * 在当前 Python 代码光标处插入免密数据库连接代码模板
   */
  function insertPythonDbCodeSnippet() {
    const sqlArea = document.getElementById('datax-st-form-python-script');
    if (!sqlArea) return;

    const currentDsId = document.getElementById('datax-st-form-source-ds')?.value;
    const selectedDs = (stAllDatasources || []).find(d => String(d.id) === String(currentDsId)) || (stAllDatasources && stAllDatasources[0]);
    const dbType = (selectedDs && selectedDs.datasource ? selectedDs.datasource.toUpperCase() : 'MYSQL');

    let connSnippet = '';
    const healDeps = (dbType === 'POSTGRESQL' ? "['psycopg2-binary', 'requests']" : "['pymysql', 'requests']");
    if (dbType === 'POSTGRESQL') {
      connSnippet = `    # 动态获取 DataX-Web 注入的免密数据源配置 (PostgreSQL 示例)
    import psycopg2
    import psycopg2.extras
    conn = psycopg2.connect(
        host=ds["host"],
        port=ds["port"],
        user=ds["username"],
        password=ds["password"],
        dbname=ds["database"]
    )
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM your_table LIMIT 100;")
            records = cursor.fetchall()
    finally:
        conn.close()`;
    } else {
      connSnippet = `    # 动态获取 DataX-Web 注入的免密数据源配置 (MySQL 示例)
    import pymysql
    conn = pymysql.connect(
        host=ds["host"],
        port=ds["port"],
        user=ds["username"],
        password=ds["password"],
        database=ds["database"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM your_table LIMIT 100;")
            records = cursor.fetchall()
    finally:
        conn.close()`;
    }

    const templateCode = `
# ----------------- 依赖环境自愈检测 (缺少包自动安装) -----------------
def auto_heal_environment():
    import sys, subprocess
    required_pkgs = ${healDeps}
    missing = []
    for pkg in required_pkgs:
        mod_name = 'psycopg2' if 'psycopg2' in pkg else pkg
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"【自愈】检测到运行环境缺少依赖: {missing}，正在自动安装...")
        try:
            cmd = [sys.executable, "-m", "pip", "install", *missing, 
                   "-i", "https://pypi.tuna.tsinghua.edu.cn/simple", 
                   "--trusted-host", "pypi.tuna.tsinghua.edu.cn"]
            subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"【自愈】依赖 {missing} 自动安装成功！")
        except Exception as e:
            print(f"【警告】自动安装依赖失败: {e}，离线环境请登录服务器执行 bash bin/python/install_deps.sh")

auto_heal_environment()

def get_datasource_config():
    """动态读取 DataX-Web 注入的数据源凭据 (免密安全规范)."""
    import os, json
    ds_json = os.environ.get("DATAX_DS_CONFIG")
    if ds_json:
        try:
            return json.loads(ds_json)
        except Exception:
            pass
    return {
        "host": os.environ.get("DATAX_DS_HOST", "127.0.0.1"),
        "port": int(os.environ.get("DATAX_DS_PORT", "3306")),
        "username": os.environ.get("DATAX_DS_USERNAME", ""),
        "password": os.environ.get("DATAX_DS_PASSWORD", ""),
        "database": os.environ.get("DATAX_DS_DBNAME", ""),
        "dbType": os.environ.get("DATAX_DS_TYPE", "${dbType}")
    }

# 数据库免密查询示例:
# ds = get_datasource_config()
${connSnippet}
`;

    const pos = sqlArea.selectionStart !== undefined ? sqlArea.selectionStart : sqlArea.value.length;
    const text = sqlArea.value;
    sqlArea.value = text.substring(0, pos) + templateCode + text.substring(pos);
    sqlArea.focus();
    const newPos = pos + templateCode.length;
    if (sqlArea.setSelectionRange) {
      sqlArea.setSelectionRange(newPos, newPos);
    }
  }

  /**
   * 生产级 Python 数据加工标准参考 Demo (对齐 stat_parking_geocode.py 生产范式)
   * 具备：依赖环境自愈、免密数据源读取、动态参数解析、规范环节进度日志、标准定界输出协议
   */
  const STAT_TASK_PYTHON_DEMO = `# -*- coding: utf-8 -*-
"""DataX-Web 统计计算与数据加工标准参考模板 (Demo)

本脚本提供了一套生产级 Python 数据加工范式，可在 Tab 6 统计计算工作台直接运行。
主要特性：
1. 依赖环境自愈：运行时若缺失第三方包，自动尝试轻量在线补齐，纯内网环境给出明确离线指引。
2. 免密数据源读取：由平台在子进程私有内存中自动注入凭据，代码中零明文账密。
3. 动态入参解析：安全解析从平台配置的动态参数 JSON (或 sys.argv 传参)。
4. 规范化环节日志：按照【自检】、【计划】、【进度】、【成功】规范打标，Tab 6 控制台可实时感知当前环节。
5. 标准输出定界协议：输出带真实处理量与样例数据的定界 JSON 块，供前端表格秒开预览。
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime, timedelta


# ==============================================================================
# 1. 运行环境依赖自动自愈 (缺失依赖自动在线补齐，内网离线抛出明确指引)
# ==============================================================================
def auto_heal_environment():
    """检测并在线补齐所需依赖包 (根据实际业务脚本需要增减，如 pymysql, requests 等)."""
    required_modules = ["pymysql", "requests"]
    missing = []
    for mod in required_modules:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)

    if not missing:
        return

    print(f"【自检】检测到当前 Python 环境缺少必要依赖: {missing}，正在尝试自动安装...", flush=True)
    try:
        cmd = [
            sys.executable, "-m", "pip", "install", *missing,
            "-i", "https://pypi.tuna.tsinghua.edu.cn/simple",
            "--trusted-host", "pypi.tuna.tsinghua.edu.cn"
        ]
        # 静默执行 pip 安装
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"【自检】缺失依赖 {missing} 已成功在线安装！", flush=True)
    except Exception as e:
        print(f"【警告】自动安装依赖失败 (服务器可能无外网访问权限): {e}", flush=True)
        print("【离线运维指引】请登录服务器执行: bash bin/python/install_deps.sh 完成离线依赖包部署", flush=True)
        raise


# 执行依赖自愈
auto_heal_environment()

import pymysql
import requests


# ==============================================================================
# 2. 动态免密读取数据源连接凭据与任务入参
# ==============================================================================
def get_datasource_config() -> dict:
    """动态安全读取 DataX-Web 注入的源端/目标端数据源凭据 (代码中零明文密码)."""
    ds_json = os.environ.get("DATAX_DS_CONFIG")
    if ds_json:
        try:
            cfg = json.loads(ds_json)
            if cfg.get("host") and cfg.get("user"):
                return cfg
        except Exception:
            pass

    # 若未绑定或本地调试，回退读取分项环境变量或本地默认参数
    return {
        "host": os.environ.get("DATAX_DS_HOST", "127.0.0.1"),
        "port": int(os.environ.get("DATAX_DS_PORT", "3306")),
        "user": os.environ.get("DATAX_DS_USERNAME", "root"),
        "password": os.environ.get("DATAX_DS_PASSWORD", ""),
        "database": os.environ.get("DATAX_DS_DBNAME", ""),
        "charset": "utf8mb4",
        "autocommit": True
    }


def get_task_params() -> dict:
    """动态读取任务入参 JSON (Tab 6 动态参数配置区)."""
    raw = os.environ.get("DATAX_STAT_PARAMS")
    if not raw and len(sys.argv) > 1:
        raw = sys.argv[1]

    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return {}


# ==============================================================================
# 3. 标准定界输出协议 (供 Tab 6 控制台捕获真实处理量与表格数据预览)
# ==============================================================================
def output_stat_data(data_rows: list, total_count: int = None, summary_msg: str = None):
    """按 DataX 规范输出标准定界 JSON 数据块.

    Args:
        data_rows: 预览样本行列表 (建议 50 条以内，避免超大 JSON 导致前端卡死)
        total_count: 真实处理/更新的总记录数
        summary_msg: 最终业务执行总结摘要 (将直接同步展示在任务流水和最近执行说明中)
    """
    print("===DATAX_STAT_DATA_START===", flush=True)
    total_val = total_count if total_count is not None else len(data_rows)
    payload = {
        "total": total_val,
        "summary": summary_msg or f"数据处理计算完成，累计统计/更新 {total_val} 条记录",
        "rows": data_rows
    }
    print(json.dumps(payload, ensure_ascii=False, default=str), flush=True)
    print("===DATAX_STAT_DATA_END===", flush=True)


# ==============================================================================
# 4. 业务加工主流程范式 (支持就地清洗更新或数据抽取)
# ==============================================================================
def run_stat_demo_job():
    """生产级加工任务主流程范例."""
    start_time = time.time()

    # 1. 解析动态业务参数
    params = get_task_params()
    default_biz_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    biz_date = params.get("bizDate") or default_biz_date
    batch_size = int(params.get("batchSize") or 100)
    max_total = int(params.get("maxTotal") or 0)  # 0 表示不限总条数

    print(f"【自检】当前业务分析日期: {biz_date}，单批处理量: {batch_size} 条", flush=True)

    # 2. 建立免密数据库连接
    db_cfg = get_datasource_config()
    print(f"【自检】已成功读取关联数据源: {db_cfg.get('database')} ({db_cfg.get('host')}:{db_cfg.get('port')})", flush=True)

    # 3. 模拟业务处理环节 (演示进度日志与批次汇报)
    # 场景示例：假设有 350 条数据需要处理
    simulated_total = 350 if max_total <= 0 else min(max_total, 350)
    total_batches = (simulated_total + batch_size - 1) // batch_size
    print(f"【计划】开始执行分批计算：目标记录总数 {simulated_total} 条，预计共执行 {total_batches} 批...", flush=True)

    processed_count = 0
    preview_sample_rows = []

    for batch_no in range(1, total_batches + 1):
        # 计算当前批次处理量
        curr_batch_len = min(batch_size, simulated_total - processed_count)
        print(f"【第 {batch_no}/{total_batches} 批】正在计算并写回处理 {curr_batch_len} 条...", flush=True)

        # 模拟行级业务计算
        for i in range(curr_batch_len):
            row_id = processed_count + i + 1
            item = {
                "id": row_id,
                "stat_date": biz_date,
                "dept_code": f"DEP_{(row_id % 5) + 1:02d}",
                "metric_order_count": 100 + (row_id * 3),
                "metric_amount": round(5000.50 + (row_id * 12.3), 2),
                "process_status": "SUCCESS"
            }
            # 收集前 50 条样本供前端表格秒开预览
            if len(preview_sample_rows) < 50:
                preview_sample_rows.append(item)

        # 模拟批次耗时 (生产代码中替换为真实 sql / api 请求)
        time.sleep(0.3)

        processed_count += curr_batch_len
        pct = (processed_count * 100) // simulated_total if simulated_total > 0 else 100
        cost_sec = int(time.time() - start_time)
        print(f"【进度】子批次写回 {curr_batch_len} 条，累计已完成 {processed_count}/{simulated_total} 条 ({pct}%)，已耗时 {cost_sec}s...", flush=True)

    total_cost = int(time.time() - start_time)
    summary_msg = f"全部分页计算完毕！共执行 {total_batches} 批，累计处理更新 {processed_count} 条记录，总耗时 {total_cost}s。"
    print(f"【成功】{summary_msg}", flush=True)

    # 4. 输出标准定界数据块 (透传真实处理量 + 业务总结 + 前50条样本)
    output_stat_data(
        data_rows=preview_sample_rows,
        total_count=processed_count,
        summary_msg=summary_msg
    )


if __name__ == "__main__":
    run_stat_demo_job()`;

  const STAT_TASK_PYTHON_DEMO_PARAMS = JSON.stringify({
    bizDate: "2026-09-15",
    batchSize: 100,
    maxTotal: 350
  }, null, 2);

  /**
   * 载入生产级标准 Python 加工参考 Demo 模板
   */
  async function loadStatPythonDemo() {
    const pyArea = document.getElementById('datax-st-form-python-script');
    if (!pyArea) return;

    if (pyArea.value.trim() && pyArea.value.trim() !== STAT_TASK_PYTHON_DEMO.trim()) {
      const ok = await confirm('当前 Python 编辑框已有代码，载入参考示例模板将覆盖现有内容，是否继续？');
      if (!ok) return;
    }

    pyArea.value = STAT_TASK_PYTHON_DEMO;
    const paramsArea = document.getElementById('datax-st-form-python-params');
    if (paramsArea && (!paramsArea.value.trim() || paramsArea.value.trim() === '{\\n  "env": "prod"\\n}')) {
      paramsArea.value = STAT_TASK_PYTHON_DEMO_PARAMS;
    }
    toast('已载入生产级标准 Python 参考模板');
    pyArea.focus();
  }

  /**
   * 检查 Python 脚本或 SQL 中的高危操作与物理删除风险
   * @param {string} scriptContent 脚本源码
   * @return {{ hasDangerousDrop: boolean, hasFullDelete: boolean, hasDeleteWhere: boolean, riskDetails: string[] }}
   */
  function auditScriptDangerousOperations(scriptContent) {
    if (!scriptContent || !scriptContent.trim()) {
      return { hasDangerousDrop: false, hasFullDelete: false, hasDeleteWhere: false, riskDetails: [] };
    }

    // 1. 安全剥离 Python 多行三引号文档注释 ("""...""" 与 '''...''')
    let cleanCode = scriptContent.replace(/"""[\s\S]*?"""/g, ' ')
                                 .replace(/'''[\s\S]*?'''/g, ' ');
    // 2. 安全剥离 Python 单行注释 (# ...)
    cleanCode = cleanCode.replace(/(^|[^"'])(?:#.*$)/gm, '$1');
    // 3. 剥离纯用于控制台提示的 print(...) 语句，避免日志说明文案误触发拦截
    cleanCode = cleanCode.replace(/\bprint\s*\([^()]*\)/g, ' ');

    const text = cleanCode;
    const riskSet = new Set();

    // 1. 检查 DROP / TRUNCATE 毁灭性 DDL
    const dropRegex = /\b(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+(?:TABLE)?)\s+([`"'{\w.]+)/gi;
    let dropMatch;
    let hasDangerousDrop = false;
    while ((dropMatch = dropRegex.exec(text)) !== null) {
      const target = dropMatch[2].replace(/[`"'{}]/g, '').trim();
      if (target && !/^\.+$/.test(target)) {
        hasDangerousDrop = true;
        riskSet.add('包含高危删表指令: ' + dropMatch[1].toUpperCase() + ' ' + target);
      }
    }

    // 2. 检查 DELETE 操作 (支持常规表名、反引号/引号以及 Python f-string 动态变量 {table})
    const deleteRegex = /\bDELETE\s+FROM\s+([`"'{\w.]+)([\s\S]*?)(?:;|["'\n\r]|$)/gi;
    let hasDeleteWhere = false;
    let hasFullDelete = false;

    let match;
    while ((match = deleteRegex.exec(text)) !== null) {
      const rawTarget = match[1];
      const cleanTarget = rawTarget.replace(/[`"'{}]/g, '').trim();
      // 过滤掉如 "..." 这种省略号伪表名
      if (!cleanTarget || /^\.+$/.test(cleanTarget)) {
        continue;
      }

      const rest = match[2] || '';
      if (/\bWHERE\b/i.test(rest)) {
        hasDeleteWhere = true;
        riskSet.add('表 [' + cleanTarget + '] 执行条件范围删除 (DELETE ... WHERE)');
      } else {
        const tableSafe = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fallbackRegex = new RegExp('\\bDELETE\\s+FROM\\s+[`"\'{]*' + tableSafe + '[`"\'}]*[\\s\\S]*?\\bWHERE\\b', 'i');
        if (fallbackRegex.test(text)) {
          hasDeleteWhere = true;
          riskSet.add('表 [' + cleanTarget + '] 执行条件范围删除 (DELETE ... WHERE)');
        } else {
          hasFullDelete = true;
          riskSet.add('表 [' + cleanTarget + '] 执行无条件全表清空 (DELETE FROM 未带 WHERE)');
        }
      }
    }

    if (!hasDeleteWhere) {
      const globalWhereRegex = /\bDELETE\s+FROM\s+(?!\.{2,})[`"'{\w.]+\s+[\s\S]*?\bWHERE\b/i;
      if (globalWhereRegex.test(text)) {
        hasDeleteWhere = true;
        riskSet.add('检测到物理条件删除语句 (DELETE ... WHERE)');
      }
    }

    return {
      hasDangerousDrop,
      hasFullDelete,
      hasDeleteWhere,
      riskDetails: Array.from(riskSet)
    };
  }

  /**
   * 对高危操作进行二次确认交互拦截 (支持 DELETE WHERE 等操作)
   * @param {string} scriptContent 脚本源码
   * @param {string} actionName 触发动作名称（如'试运行'、'保存任务配置'、'正式执行'）
   * @return {Promise<boolean>} 是否允许继续执行
   */
  async function confirmDangerousOperationIfNeeded(scriptContent, actionName = '执行') {
    const audit = auditScriptDangerousOperations(scriptContent);

    // 1. 若存在 DROP / TRUNCATE
    if (audit.hasDangerousDrop) {
      const msg = `⚠️【严重高危警告】检测到脚本中包含 DROP / TRUNCATE 删表指令：\n${audit.riskDetails.join('\n')}\n\n该操作将直接销毁数据库物理表结构！\n确定仍要强制${actionName}吗？`;
      return await confirm(msg);
    }

    // 2. 若存在无 WHERE 的全表清空
    if (audit.hasFullDelete) {
      const msg = `🚨【全表清空警报】检测到脚本中包含【无 WHERE 条件的全表清空语句】：\n${audit.riskDetails.join('\n')}\n\n该操作将清除目标表全部数据！\n确定仍要强制${actionName}吗？`;
      return await confirm(msg);
    }

    // 3. 用户明确要求：检测到存在 delete where 的需要提示二次确认
    if (audit.hasDeleteWhere) {
      const msg = `⚠️【数据删除提示】检测到脚本中包含物理删除语句 (DELETE ... WHERE)：\n${audit.riskDetails.join('\n')}\n\n${actionName}后将物理删除满足条件的数据记录。\n是否确认继续${actionName}？`;
      return await confirm(msg);
    }

    return true;
  }

  // 加载目标端数据源的数据表清单及注解 (驱动一体化表下拉框)
  async function loadStatTargetTables(datasourceId, initialSelectedTable = '') {
    if (!datasourceId) {
      stTargetTables = [];
      stFilteredTargetTables = [];
      if (stTargetTableSelect) {
        stTargetTableSelect.setItems([]);
        stTargetTableSelect.setBadge('0 张表');
      }
      return;
    }

    if (stTargetTableSelect) {
      stTargetTableSelect.setBadge('获取中...');
    }

    stTargetTables = await fetchDatasourceTablesWithCache(datasourceId);
    stFilteredTargetTables = [...stTargetTables];
    const tableItems = mapTablesToSelectItems(stTargetTables);

    if (stTargetTableSelect) {
      stTargetTableSelect.setItems(tableItems);
      stTargetTableSelect.setBadge(`${tableItems.length} 张表`);
      const formTargetTable = document.getElementById('datax-st-form-target-table');
      const targetVal = initialSelectedTable || (formTargetTable ? formTargetTable.value.trim() : '');
      if (targetVal) {
        stTargetTableSelect.setValue(targetVal);
      }
    }
  }

  // 3. 渲染任务列表表格 (支持鼠标框选与批量操作)
  function renderStatTaskList(records) {
    const listContainer = document.getElementById('datax-st-list-container');
    if (!listContainer) return;

    if (currentStMarquee && typeof currentStMarquee.cleanup === 'function') {
      currentStMarquee.cleanup();
      currentStMarquee = null;
    }

    stCurrentRecords = records || [];

    if (!records || records.length === 0) {
      stSelectedTaskIds.clear();
      updateStSelectionUI();
      listContainer.innerHTML = `
        <div style="text-align: center; color: #909399; padding: 40px;">
          <div style="font-size: 36px; margin-bottom: 8px;">🛠️</div>
          <div>暂无加工输出任务，点击右上角【➕ 新建加工任务】创建</div>
        </div>
      `;
      return;
    }

    // 清理已被删除的非本页任务ID
    const validIds = new Set(records.map(r => r.id));
    for (const id of Array.from(stSelectedTaskIds)) {
      if (!validIds.has(id)) stSelectedTaskIds.delete(id);
    }

    let html = `
      <div style="width: 100%; overflow-x: auto;">
        <table style="min-width: 720px; width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead>
            <tr style="background: #f5f7fa; border-bottom: 1px solid #ebeef5; color: #606266; font-weight: bold; white-space: nowrap;">
              <th style="padding: 8px 6px; width: 38px; text-align: center;"><input type="checkbox" id="datax-st-th-check-all" /></th>
              <th style="padding: 8px 6px; width: 45px;">ID</th>
              <th style="padding: 8px 6px; min-width: 130px;">任务名称</th>
              <th style="padding: 8px 6px; width: 65px;">模式</th>
              <th style="padding: 8px 6px; min-width: 150px;">源库 / 目标库表</th>
              <th style="padding: 8px 6px; width: 90px;">Cron 调度</th>
              <th style="padding: 8px 6px; width: 75px;">调度状态</th>
              <th style="padding: 8px 6px; width: 120px;">最近执行结果</th>
              <th style="padding: 8px 6px; width: 175px; text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody>
    `;

    records.forEach(t => {
      const isSql = t.taskType === 'SQL';
      const isCross = isSql && (t.isCrossDb === 1);
      let typeBadge = isSql
        ? '<span style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 1px 5px; border-radius: 3px; font-weight: bold;">SQL</span>'
        : '<span style="background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; padding: 1px 5px; border-radius: 3px; font-weight: bold;">Python</span>';
      if (isCross) {
        typeBadge += '<span style="background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; padding: 1px 5px; border-radius: 3px; font-weight: bold; margin-left: 3px;" title="跨库多源协同任务">🌐 跨库</span>';
      }

      let lastRunBadge = '<span style="color: #909399;">⚪ 未运行</span>';
      if (t.lastRunStatus === 1 || t.lastRunStatus === 2) {
        const isManual = t.lastTriggerType === 'MANUAL' || (t.lastRunMsg && (t.lastRunMsg.includes('手动') || t.lastRunMsg.includes('MANUAL')));
        const triggerBadge = isManual
          ? '<span style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 0 4px; border-radius: 3px; font-size: 10px; margin-left: 4px; display: inline-flex; align-items: center; white-space: nowrap;">🚀 手动</span>'
          : '<span style="background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; padding: 0 4px; border-radius: 3px; font-size: 10px; margin-left: 4px; display: inline-flex; align-items: center; white-space: nowrap;">⏰ 定时</span>';

        if (t.lastRunStatus === 1) {
          lastRunBadge = `<span style="color: #52c41a; font-weight: bold; display: inline-flex; align-items: center; white-space: nowrap;" title="${safeEscapeHtml(t.lastRunMsg || '')}">🟢 成功${triggerBadge}</span>`;
        } else {
          lastRunBadge = `<span style="color: #f5222d; font-weight: bold; display: inline-flex; align-items: center; white-space: nowrap;" title="${safeEscapeHtml(t.lastRunMsg || '')}">🔴 失败${triggerBadge}</span>`;
        }
      }

      const blockInfo = getBlockStrategyInfo(t.executorBlockStrategy);
      const blockBadge = `<span style="font-size: 10px; color: ${blockInfo.color}; background: ${blockInfo.bg}; border: 1px solid ${blockInfo.border}; padding: 0 4px; border-radius: 2px;" title="阻塞策略: ${blockInfo.label}">${blockInfo.short}</span>`;

      if (t.isRunning) {
        lastRunBadge = '<span style="color: #1890ff; font-weight: bold; display: inline-flex; align-items: center; white-space: nowrap;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#1890ff;margin-right:4px;"></span>计算中...</span>';
      }

      const isRunning = t.status === 1;
      const statusBadge = isRunning
        ? '<span style="color: #52c41a; font-weight: bold;">🟢 运行中</span>'
        : '<span style="color: #909399;">⚪ 已停止</span>';

      const targetInfo = `${safeEscapeHtml(t.targetDatasourceName || '目标库')} &rarr; <strong>${safeEscapeHtml(t.targetTableName)}</strong> (${t.writeMode || 'APPEND'})`;
      const isChecked = stSelectedTaskIds.has(t.id);

      html += `
        <tr style="border-bottom: 1px solid #ebeef5; transition: background 0.15s; white-space: nowrap;" id="datax-st-row-${t.id}" class="datax-st-table-row" data-task-id="${t.id}">
          <td style="padding: 7px 6px; text-align: center;"><input type="checkbox" class="datax-st-row-cb" value="${t.id}" ${isChecked ? 'checked' : ''} /></td>
          <td style="padding: 7px 6px; color: #888;">${t.id}</td>
          <td style="padding: 7px 6px; font-weight: bold; color: #303133;">${safeEscapeHtml(t.taskName)}</td>
          <td style="padding: 7px 6px;">${typeBadge}</td>
          <td style="padding: 7px 6px;">
            ${isSql ? `<div>源: ${safeEscapeHtml(t.sourceDatasourceName || '源库')}</div>` : ''}
            <div>到: ${targetInfo}</div>
          </td>
          <td style="padding: 7px 6px;">
            <div>${safeEscapeHtml(t.cronExpression || '-')}</div>
            <div style="margin-top: 2px;">${blockBadge}</div>
          </td>
          <td style="padding: 7px 6px;">${statusBadge}</td>
          <td style="padding: 7px 6px; cursor: pointer;" class="datax-st-cell-last-run" data-id="${t.id}" title="点击查看历史执行记录">
            <div style="display: flex; align-items: center;">${lastRunBadge}</div>
            <div style="font-size: 10px; color: #8c8c8c; font-family: monospace; margin-top: 2px;">${t.lastRunTime ? t.lastRunTime.substring(0, 19).replace('T', ' ') : '-'}</div>
          </td>
          <td style="padding: 7px 6px; text-align: center; white-space: nowrap;">
            <button class="datax-st-action-btn" data-action="trigger" data-id="${t.id}" style="background: #1890ff; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-right: 3px;" title="立即正式执行并入库">🚀 执行</button>
            <button class="datax-st-action-btn" data-action="history" data-id="${t.id}" style="background: #722ed1; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-right: 3px;" title="查看执行历史记录">历史</button>
            <button class="datax-st-action-btn" data-action="toggle-schedule" data-id="${t.id}" data-status="${t.status}" style="background: ${isRunning ? '#faad14' : '#52c41a'}; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-right: 3px;">${isRunning ? '停止' : '启动'}</button>
            <button class="datax-st-action-btn" data-action="edit" data-id="${t.id}" style="background: #f0f2f5; color: #303133; border: 1px solid #dcdfe6; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-right: 3px;">✏️ 编辑</button>
            <button class="datax-st-action-btn" data-action="delete" data-id="${t.id}" style="background: #ff4d4f; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px;">🗑️</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    listContainer.innerHTML = html;

    // 绑定矩形框选引擎 (Marquee Selector)
    currentStMarquee = bindMarqueeSelection({
      container: listContainer,
      rowSelector: '.datax-st-table-row',
      checkboxSelector: '.datax-st-row-cb',
      getIdFromRow: row => {
        const id = parseInt(row.getAttribute('data-task-id'), 10);
        return isNaN(id) ? null : id;
      },
      selectedSet: stSelectedTaskIds,
      selectedBg: '#e6f7ff',
      canStartSelection: e => e.altKey || !e.target.closest('button, input, select, a, #datax-st-batch-bar'),
      onSelectionChange: () => {
        updateStSelectionUI();
      }
    });

    // 绑定行点击与连续选择 (Shift / Ctrl)
    listContainer.querySelectorAll('.datax-st-table-row').forEach(row => {
      row.onclick = (e) => {
        if (e.target.closest('button, select, a, input')) return;
        const id = parseInt(row.getAttribute('data-task-id'), 10);
        if (isNaN(id)) return;

        if (e.shiftKey && stLastClickedId !== null) {
          const idxA = records.findIndex(r => r.id === stLastClickedId);
          const idxB = records.findIndex(r => r.id === id);
          if (idxA !== -1 && idxB !== -1) {
            const start = Math.min(idxA, idxB);
            const end = Math.max(idxA, idxB);
            for (let i = start; i <= end; i++) {
              stSelectedTaskIds.add(records[i].id);
            }
          }
        } else if (e.ctrlKey || e.metaKey) {
          if (stSelectedTaskIds.has(id)) {
            stSelectedTaskIds.delete(id);
          } else {
            stSelectedTaskIds.add(id);
          }
          stLastClickedId = id;
        } else {
          if (stSelectedTaskIds.has(id)) {
            stSelectedTaskIds.delete(id);
          } else {
            stSelectedTaskIds.add(id);
          }
          stLastClickedId = id;
        }
        updateStSelectionUI();
      };

      const cb = row.querySelector('.datax-st-row-cb');
      if (cb) {
        cb.onclick = (e) => {
          e.stopPropagation();
          const id = parseInt(cb.value, 10);
          if (cb.checked) {
            stSelectedTaskIds.add(id);
          } else {
            stSelectedTaskIds.delete(id);
          }
          stLastClickedId = id;
          updateStSelectionUI();
        };
      }
    });

    // 全选联动绑定
    const onToggleAll = (e) => {
      const checked = e.target.checked;
      if (checked) {
        records.forEach(r => stSelectedTaskIds.add(r.id));
      } else {
        stSelectedTaskIds.clear();
      }
      updateStSelectionUI();
    };

    const topCheckAll = document.getElementById('datax-st-check-all');
    if (topCheckAll) topCheckAll.onchange = onToggleAll;

    const thCheckAll = document.getElementById('datax-st-th-check-all');
    if (thCheckAll) thCheckAll.onchange = onToggleAll;

    // 绑定批量操作按钮
    bindBatchActions();

    // 绑定表格内行操作按钮
    listContainer.querySelectorAll('.datax-st-action-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'trigger') {
          const task = records.find(r => String(r.id) === String(id));
          if (task && task.taskType === 'PYTHON' && task.pythonScript) {
            const allow = await confirmDangerousOperationIfNeeded(task.pythonScript, `正式执行任务【${task.taskName || id}】`);
            if (!allow) return;
          }
          btn.disabled = true;
          btn.textContent = '执行中...';
          try {
            const res = await fetch(`/api/statTask/trigger/${id}`, { method: 'POST', headers: getAuthHeaders() });
            const json = await res.json();
            if (isApiSuccess(json)) {
              alert('🎉 执行成功: ' + (json.data && json.data.message ? json.data.message : '已成功写入目标表'));
              loadStatTaskList();
            } else {
              alert('❌ 执行失败: ' + getApiMsg(json));
            }
          } catch (err) {
            alert('❌ 触发异常: ' + err.message);
          } finally {
            btn.disabled = false;
            btn.textContent = '🚀 执行';
          }
        } else if (action === 'history') {
          const task = records.find(r => String(r.id) === String(id));
          if (task) openStatTaskLogModal(task);
        } else if (action === 'toggle-schedule') {
          const curStatus = btn.getAttribute('data-status');
          const isStop = curStatus === '1';
          const endpoint = isStop ? `/api/statTask/stop/${id}` : `/api/statTask/start/${id}`;
          try {
            const res = await fetch(endpoint, { method: 'POST', headers: getAuthHeaders() });
            const json = await res.json();
            if (isApiSuccess(json)) {
              loadStatTaskList();
            } else {
              alert('❌ 调度状态切换失败: ' + getApiMsg(json));
            }
          } catch (err) {
            alert('❌ 异常: ' + err.message);
          }
        } else if (action === 'edit') {
          // 优化：列表不返回大字段，编辑时点对点查询任务全量详情回填，提升列表性能并保证大文本无损回显
          try {
            const res = await fetch(`/api/statTask/detail/${id}`, { headers: getAuthHeaders() });
            const json = await res.json();
            if (isApiSuccess(json) && json.data) {
              openStatTaskEditor(json.data);
            } else {
              const fallbackTask = records.find(r => String(r.id) === String(id));
              if (fallbackTask) openStatTaskEditor(fallbackTask);
            }
          } catch (err) {
            console.warn('获取任务全量详情失败，使用列表轻量数据回显:', err);
            const fallbackTask = records.find(r => String(r.id) === String(id));
            if (fallbackTask) openStatTaskEditor(fallbackTask);
          }
        } else if (action === 'delete') {
          const ok = await confirm(`确认要删除统计任务 [ID: ${id}] 吗？`);
          if (ok) {
            try {
              const res = await fetch(`/api/statTask/delete/${id}`, { method: 'POST', headers: getAuthHeaders() });
              const json = await res.json();
              if (isApiSuccess(json)) {
                loadStatTaskList();
              } else {
                alert('❌ 删除失败: ' + getApiMsg(json));
              }
            } catch (err) {
              alert('❌ 删除异常: ' + err.message);
            }
          }
        }
      };
    });

    // 绑定最近执行结果单元格点击快速打开历史弹窗
    listContainer.querySelectorAll('.datax-st-cell-last-run').forEach(cell => {
      cell.onclick = (e) => {
        e.stopPropagation();
        const id = cell.getAttribute('data-id');
        const task = records.find(r => String(r.id) === String(id));
        if (task) openStatTaskLogModal(task);
      };
    });

    updateStSelectionUI();
  }

  /**
   * 绑定 Tab 6 批量操作按钮逻辑
   */
  function bindBatchActions() {
    // 批量触发执行
    const btnBatchTrigger = document.getElementById('datax-st-btn-batch-trigger');
    if (btnBatchTrigger) {
      btnBatchTrigger.onclick = async () => {
        if (stSelectedTaskIds.size === 0) return;
        const ids = Array.from(stSelectedTaskIds);
        const dangerousTasks = [];
        ids.forEach(id => {
          const t = stCurrentRecords.find(r => r.id === id);
          if (t && t.taskType === 'PYTHON' && t.pythonScript) {
            const audit = auditScriptDangerousOperations(t.pythonScript);
            if (audit.hasDeleteWhere || audit.hasFullDelete || audit.hasDangerousDrop) {
              dangerousTasks.push(t.taskName || `#${t.id}`);
            }
          }
        });
        if (dangerousTasks.length > 0) {
          const okDanger = await confirm(`⚠️ 所选任务中包含物理删除或高危操作的 Python 任务：\n【${dangerousTasks.join('，')}】\n批量执行将同时对数据库执行删除修改，是否确认继续？`);
          if (!okDanger) return;
        }
        const ok = await confirm(`确定要立即正式执行所选的 ${ids.length} 个统计任务并入库吗？`);
        if (!ok) return;
        try {
          btnBatchTrigger.disabled = true;
          btnBatchTrigger.textContent = '批量执行中...';
          const res = await fetch('/api/statTask/batchTrigger', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(ids)
          });
          const json = await res.json();
          if (isApiSuccess(json)) {
            const data = json.data || {};
            alert(`🎉 批量触发完成！成功: ${data.successCount ?? ids.length}，失败: ${data.failCount ?? 0}`);
            loadStatTaskList();
          } else {
            alert('❌ 批量触发失败: ' + getApiMsg(json));
          }
        } catch (err) {
          alert('❌ 请求异常: ' + err.message);
        } finally {
          btnBatchTrigger.disabled = false;
          btnBatchTrigger.innerHTML = `🚀 批量执行 (<span class="datax-st-sel-num">${stSelectedTaskIds.size}</span>)`;
        }
      };
    }

    // 批量启动调度
    const btnBatchStart = document.getElementById('datax-st-btn-batch-start');
    if (btnBatchStart) {
      btnBatchStart.onclick = async () => {
        if (stSelectedTaskIds.size === 0) return;
        const ids = Array.from(stSelectedTaskIds);
        const ok = await confirm(`确定要批量启动所选的 ${ids.length} 个统计任务的定时调度吗？`);
        if (!ok) return;
        try {
          const res = await fetch('/api/statTask/batchStart', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(ids)
          });
          const json = await res.json();
          if (isApiSuccess(json)) {
            const data = json.data || {};
            alert(`🎉 批量启动完成！成功: ${data.successCount ?? ids.length}，失败: ${data.failCount ?? 0}`);
            loadStatTaskList();
          } else {
            alert('❌ 批量启动失败: ' + getApiMsg(json));
          }
        } catch (err) {
          alert('❌ 请求异常: ' + err.message);
        }
      };
    }

    // 批量停止调度
    const btnBatchStop = document.getElementById('datax-st-btn-batch-stop');
    if (btnBatchStop) {
      btnBatchStop.onclick = async () => {
        if (stSelectedTaskIds.size === 0) return;
        const ids = Array.from(stSelectedTaskIds);
        const ok = await confirm(`确定要批量停止所选的 ${ids.length} 个统计任务的定时调度吗？`);
        if (!ok) return;
        try {
          const res = await fetch('/api/statTask/batchStop', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(ids)
          });
          const json = await res.json();
          if (isApiSuccess(json)) {
            const data = json.data || {};
            alert(`🎉 批量停止完成！成功: ${data.successCount ?? ids.length}，失败: ${data.failCount ?? 0}`);
            loadStatTaskList();
          } else {
            alert('❌ 批量停止失败: ' + getApiMsg(json));
          }
        } catch (err) {
          alert('❌ 请求异常: ' + err.message);
        }
      };
    }

    // 批量删除
    const btnBatchDelete = document.getElementById('datax-st-btn-batch-delete');
    if (btnBatchDelete) {
      btnBatchDelete.onclick = async () => {
        if (stSelectedTaskIds.size === 0) return;
        const ids = Array.from(stSelectedTaskIds);
        const ok = await confirm(`⚠️ 确定要批量删除所选的 ${ids.length} 个统计任务吗？此操作将自动注销其调度作业，不可恢复！`);
        if (!ok) return;
        try {
          const res = await fetch('/api/statTask/batchDelete', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(ids)
          });
          const json = await res.json();
          if (isApiSuccess(json)) {
            stSelectedTaskIds.clear();
            alert(`🎉 批量删除成功！`);
            loadStatTaskList();
          } else {
            alert('❌ 批量删除失败: ' + getApiMsg(json));
          }
        } catch (err) {
          alert('❌ 请求异常: ' + err.message);
        }
      };
    }
  }

  // 4. 打开新建/编辑表单抽屉
  function openStatTaskEditor(task = null) {
    const editor = document.getElementById('datax-st-editor-panel');
    if (!editor) return;

    stCurrentEditingTask = task;
    document.getElementById('datax-st-form-id').value = task ? task.id : '';
    document.getElementById('datax-st-editor-title').textContent = task ? `✏️ 编辑加工任务 [ID: ${task.id}]` : '新建数据加工与结果表输出任务';
    document.getElementById('datax-st-form-name').value = task ? task.taskName : '';
    document.getElementById('datax-st-form-type').value = task ? task.taskType : 'SQL';
    document.getElementById('datax-st-form-cron').value = task && task.cronExpression ? task.cronExpression : '0 0 2 * * ?';

    const blockStrategyEl = document.getElementById('datax-st-form-block-strategy');
    if (blockStrategyEl) {
      blockStrategyEl.value = task && task.executorBlockStrategy ? task.executorBlockStrategy : 'DISCARD_LATER';
    }

    const isCross = !!(task && task.isCrossDb === 1);
    const crossCheckbox = document.getElementById('datax-st-form-is-cross-db');
    if (crossCheckbox) crossCheckbox.checked = isCross;

    const srcDsVal = task && task.sourceDatasourceId ? String(task.sourceDatasourceId) : '';
    document.getElementById('datax-st-form-source-ds').value = srcDsVal;
    if (stSourceDsSelect) {
      stSourceDsSelect.setValue(srcDsVal);
    }
    if (stPythonDsSelect) {
      stPythonDsSelect.setValue(srcDsVal);
    }
    renderPythonAvailableDatasources(srcDsVal);
    document.getElementById('datax-st-form-sql').value = task && task.sourceSql ? task.sourceSql : `SELECT dept_id, count(1) as total_users, sum(salary) as total_salary FROM sys_emp WHERE create_time >= '\${bizDate} 00:00:00' GROUP BY dept_id`;

    // 异步加载源端表清单及注解 (驱动一体化表下拉框)
    if (srcDsVal) {
      loadStatSourceTables(srcDsVal);
    } else {
      loadStatSourceTables(null);
    }

    // 加载并渲染跨库节点配置
    const crossContainer = document.getElementById('datax-st-cross-sources-container');
    if (crossContainer) {
      crossContainer.innerHTML = '';
      let cfg = null;
      if (task && task.crossDbConfigJson) {
        try { cfg = JSON.parse(task.crossDbConfigJson); } catch (e) {}
      }
      if (cfg) {
        if (cfg.mergeMode) document.getElementById('datax-st-cross-merge-mode').value = cfg.mergeMode;
        if (cfg.joinKeys) document.getElementById('datax-st-cross-join-keys').value = Array.isArray(cfg.joinKeys) ? cfg.joinKeys.join(', ') : cfg.joinKeys;
        if (cfg.sources && cfg.sources.length > 0) {
          cfg.sources.forEach(s => renderCrossDbSourceNode(s));
        }
      }
    }

    const defaultPy = STAT_TASK_PYTHON_DEMO;

    // 回填 Python 脚本源码 (新建任务赋予默认骨架模板，编辑任务精准回填已保存的源码)
    const pyScriptEl = document.getElementById('datax-st-form-python-script');
    if (pyScriptEl) {
      if (task && task.pythonScript !== undefined && task.pythonScript !== null) {
        pyScriptEl.value = task.pythonScript;
      } else if (!task) {
        pyScriptEl.value = defaultPy;
      } else {
        pyScriptEl.value = '';
      }
    }

    let formattedParams = '{\n  "env": "prod"\n}';
    if (task && task.pythonParams) {
      try {
        const parsed = JSON.parse(task.pythonParams);
        formattedParams = JSON.stringify(parsed, null, 2);
      } catch (e) {
        formattedParams = task.pythonParams;
      }
    } else if (!task) {
      formattedParams = STAT_TASK_PYTHON_DEMO_PARAMS;
    }
    document.getElementById('datax-st-form-python-params').value = formattedParams;


    const tgtDsVal = task && task.targetDatasourceId ? String(task.targetDatasourceId) : '';
    const tgtTableVal = task && task.targetTableName ? task.targetTableName : '';
    document.getElementById('datax-st-form-target-ds').value = tgtDsVal;
    document.getElementById('datax-st-form-target-table').value = tgtTableVal;
    if (stTargetDsSelect) {
      stTargetDsSelect.setValue(tgtDsVal);
    }
    if (stTargetTableSelect) {
      stTargetTableSelect.setValue(tgtTableVal);
    }
    document.getElementById('datax-st-form-write-mode').value = task && task.writeMode ? task.writeMode : 'APPEND';
    document.getElementById('datax-st-form-auto-create').checked = !task || task.autoCreateTable === 1;

    // 异步加载目标端表清单及注解 (驱动一体化表下拉框)
    if (tgtDsVal) {
      loadStatTargetTables(tgtDsVal, tgtTableVal);
    } else {
      loadStatTargetTables(null);
    }

    document.getElementById('datax-st-form-tip').innerHTML = '';
    document.getElementById('datax-st-test-run-result-box').style.display = 'none';

    // 切换 SQL / Python 模式视图与跨库面板状态
    toggleStatTaskMode();
    toggleCrossDbPanel();
    editor.style.display = 'block';
    editor.scrollIntoView({ behavior: 'smooth' });
  }

  function toggleStatTaskMode() {
    const typeSelect = document.getElementById('datax-st-form-type');
    const sqlBox = document.getElementById('datax-st-box-sql');
    const pyBox = document.getElementById('datax-st-box-python');
    if (!typeSelect || !sqlBox || !pyBox) return;

    if (typeSelect.value === 'PYTHON') {
      sqlBox.style.display = 'none';
      pyBox.style.display = 'block';
      const curDs = document.getElementById('datax-st-form-source-ds')?.value || '';
      if (stPythonDsSelect) stPythonDsSelect.setValue(curDs);
      renderPythonAvailableDatasources(curDs);
    } else {
      sqlBox.style.display = 'block';
      pyBox.style.display = 'none';
      const curDs = document.getElementById('datax-st-form-source-ds')?.value || '';
      if (stSourceDsSelect) stSourceDsSelect.setValue(curDs);
      toggleCrossDbPanel();
    }
  }

  // 切换跨库多源查询面板显示状态
  function toggleCrossDbPanel() {
    const crossCheckbox = document.getElementById('datax-st-form-is-cross-db');
    const crossPanel = document.getElementById('datax-st-cross-db-panel');
    const singleDsBox = document.getElementById('datax-st-single-ds-box');
    const mergeModeSelect = document.getElementById('datax-st-cross-merge-mode');
    const joinKeysBox = document.getElementById('datax-st-cross-join-keys-box');
    const sourcesContainer = document.getElementById('datax-st-cross-sources-container');
    const addBtnBox = document.getElementById('datax-st-cross-add-btn-box');
    const fedTip = document.getElementById('datax-st-cross-fed-tip');
    const isCross = crossCheckbox ? crossCheckbox.checked : false;

    if (crossPanel) crossPanel.style.display = isCross ? 'block' : 'none';

    if (singleDsBox) {
      if (isCross) {
        const mode = mergeModeSelect ? mergeModeSelect.value : 'UNION_ALL';
        const isFed = (mode === 'FEDERATED_SQL');
        // 联邦模式显示主库与主SQL，UNION_ALL与KEY_JOIN隐藏单库SQL框
        singleDsBox.style.display = isFed ? 'block' : 'none';
        const srcLabel = document.getElementById('datax-st-source-ds-label');
        if (srcLabel) srcLabel.textContent = '联邦主数据源:';

        // 联邦模式隐藏多源节点容器与添加按钮，展示说明提示
        if (fedTip) fedTip.style.display = isFed ? 'block' : 'none';
        if (sourcesContainer) sourcesContainer.style.display = isFed ? 'none' : 'flex';
        if (addBtnBox) addBtnBox.style.display = isFed ? 'none' : 'block';
      } else {
        singleDsBox.style.display = 'block';
        const srcLabel = document.getElementById('datax-st-source-ds-label');
        if (srcLabel) srcLabel.textContent = '源端数据源:';
        if (fedTip) fedTip.style.display = 'none';
        if (sourcesContainer) sourcesContainer.style.display = 'flex';
        if (addBtnBox) addBtnBox.style.display = 'block';
      }
    }

    if (joinKeysBox && mergeModeSelect) {
      joinKeysBox.style.display = (isCross && mergeModeSelect.value === 'KEY_JOIN') ? 'flex' : 'none';
    }
  }

  // 渲染单个跨库数据源节点
  function renderCrossDbSourceNode(item = null) {
    const container = document.getElementById('datax-st-cross-sources-container');
    if (!container) return;
    const nodeIndex = container.children.length + 1;
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'datax-st-cross-source-item';
    nodeDiv.style.cssText = 'background: #fff; border: 1px solid #dcdfe6; border-radius: 4px; padding: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);';

    let dsOptions = '<option value="">-- 选择数据源 --</option>';
    if (stAllDatasources && stAllDatasources.length > 0) {
      stAllDatasources.forEach(ds => {
        const selected = (item && String(item.datasourceId) === String(ds.id)) ? 'selected' : '';
        const dbName = ds.databaseName || parseDbNameFromUrl(ds.jdbcUrl);
        const dbBadge = dbName ? ` (库: ${dbName})` : '';
        dsOptions += `<option value="${ds.id}" ${selected}>${ds.datasourceName} (${ds.datasource || 'RDBMS'})${dbBadge}</option>`;
      });
    }

    nodeDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
          <span style="font-weight: bold; font-size: 11px; color: #722ed1;" class="datax-st-cross-node-label">源节点 ${nodeIndex}:</span>
          <input type="text" class="datax-st-cross-node-filter" placeholder="🔍 检索库..." style="padding: 2px 4px; font-size: 10px; border: 1px solid #dcdfe6; border-radius: 3px; width: 65px;" title="根据名称或库名快速过滤该节点数据源" />
          <select class="datax-st-cross-node-ds" style="padding: 2px 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; max-width: 200px;">
            ${dsOptions}
          </select>
          <input type="text" class="datax-st-cross-node-alias" placeholder="别名(如oa)" value="${item && item.alias ? item.alias : ''}" style="padding: 2px 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; width: 70px;" />
        </div>
        <button type="button" class="datax-st-btn-remove-source" style="background: #ff4d4f; color: #fff; border: none; padding: 2px 7px; border-radius: 3px; cursor: pointer; font-size: 10px;" title="移除该节点">✕ 移除</button>
      </div>
      <textarea class="datax-st-cross-node-sql" rows="4" placeholder="输入该数据源专属只读统计 SQL..." style="width: 100%; min-height: 90px; height: 90px; line-height: 1.4; box-sizing: border-box; padding: 6px 8px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #ebeef5; border-radius: 3px; resize: vertical;">${item && item.sql ? item.sql : ''}</textarea>
    `;

    const filterInput = nodeDiv.querySelector('.datax-st-cross-node-filter');
    const dsSelect = nodeDiv.querySelector('.datax-st-cross-node-ds');
    if (filterInput && dsSelect) {
      filterInput.oninput = (e) => {
        const kw = (e.target.value || '').trim();
        const filtered = filterDatasourceOptions(stAllDatasources, kw);
        const curVal = dsSelect.value;
        renderDatasourceDropdown(dsSelect, filtered, curVal, '-- 选择数据源 --');
      };
    }

    nodeDiv.querySelector('.datax-st-btn-remove-source').onclick = () => {
      nodeDiv.remove();
      renumberCrossDbNodes();
    };

    container.appendChild(nodeDiv);
  }

  // 重新给跨库节点编号
  function renumberCrossDbNodes() {
    const container = document.getElementById('datax-st-cross-sources-container');
    if (!container) return;
    Array.from(container.children).forEach((child, idx) => {
      const label = child.querySelector('.datax-st-cross-node-label');
      if (label) label.textContent = `源节点 ${idx + 1}:`;
    });
  }

  // 收集跨库多源配置
  function collectCrossDbConfig() {
    const crossCheckbox = document.getElementById('datax-st-form-is-cross-db');
    if (!crossCheckbox || !crossCheckbox.checked) return null;

    const mergeMode = document.getElementById('datax-st-cross-merge-mode').value;
    const joinKeysVal = document.getElementById('datax-st-cross-join-keys').value.trim();
    const joinKeys = joinKeysVal ? joinKeysVal.split(/[,，\s]+/).filter(k => k) : [];

    const container = document.getElementById('datax-st-cross-sources-container');
    const sources = [];
    if (container) {
      container.querySelectorAll('.datax-st-cross-source-item').forEach(itemEl => {
        const dsSelect = itemEl.querySelector('.datax-st-cross-node-ds');
        const aliasInput = itemEl.querySelector('.datax-st-cross-node-alias');
        const sqlTextarea = itemEl.querySelector('.datax-st-cross-node-sql');

        const dsId = dsSelect ? dsSelect.value : '';
        const alias = aliasInput ? aliasInput.value.trim() : '';
        const sql = sqlTextarea ? sqlTextarea.value.trim() : '';

        if (dsId && sql) {
          const selectedOpt = dsSelect.options[dsSelect.selectedIndex];
          sources.push({
            datasourceId: Number(dsId),
            datasourceName: selectedOpt ? selectedOpt.text : '',
            alias: alias,
            sql: sql
          });
        }
      });
    }

    return {
      mergeMode: mergeMode,
      joinKeys: joinKeys,
      sources: sources,
      mainSql: document.getElementById('datax-st-form-sql').value.trim()
    };
  }

  // 插入跨库子查询宏代码片段模板
  function insertCrossDbMacroSnippet() {
    const sqlArea = document.getElementById('datax-st-form-sql');
    if (!sqlArea) return;
    let dsName = '目标数据源ID或名称';
    if (stAllDatasources && stAllDatasources.length > 0) {
      dsName = stAllDatasources[0].datasourceName || stAllDatasources[0].id;
    }
    const snippet = `/*ds:${dsName}*/ (SELECT COUNT(*) FROM 外部表名 WHERE deleted = 0)`;
    const pos = sqlArea.selectionStart || sqlArea.value.length;
    const text = sqlArea.value;
    sqlArea.value = text.substring(0, pos) + snippet + text.substring(pos);
    sqlArea.focus();
  }

  // 5. 保存统计任务配置
  async function saveStatTaskConfig() {
    const name = document.getElementById('datax-st-form-name').value.trim();
    const type = document.getElementById('datax-st-form-type').value;
    const cron = document.getElementById('datax-st-form-cron').value.trim();
    const targetDs = document.getElementById('datax-st-form-target-ds').value;
    const targetTable = document.getElementById('datax-st-form-target-table').value.trim();
    const writeMode = document.getElementById('datax-st-form-write-mode').value;
    const autoCreate = document.getElementById('datax-st-form-auto-create').checked ? 1 : 0;
    const idVal = document.getElementById('datax-st-form-id').value;
    const blockStrategyEl = document.getElementById('datax-st-form-block-strategy');
    const blockStrategy = blockStrategyEl ? blockStrategyEl.value : 'DISCARD_LATER';

    const tip = document.getElementById('datax-st-form-tip');

    if (!name) { alert('请输入任务名称！'); return; }
    if (!targetDs) { alert('请选择目标端数据源！'); return; }
    if (!targetTable) { alert('请输入目标端表名！'); return; }

    const payload = {
      taskName: name,
      taskType: type,
      cronExpression: cron,
      executorBlockStrategy: blockStrategy,
      targetDatasourceId: Number(targetDs),
      targetTableName: targetTable,
      writeMode: writeMode,
      autoCreateTable: autoCreate
    };

    if (idVal) {
      payload.id = Number(idVal);
    }

    if (type === 'SQL') {
      const crossCfg = collectCrossDbConfig();
      if (crossCfg) {
        if (crossCfg.mergeMode !== 'FEDERATED_SQL' && (!crossCfg.sources || crossCfg.sources.length === 0)) {
          alert('跨库模式下请至少配置一个数据源节点与对应 SQL！');
          return;
        }
        if (crossCfg.mergeMode === 'KEY_JOIN' && (!crossCfg.joinKeys || crossCfg.joinKeys.length === 0)) {
          alert('KEY_JOIN 模式下必须填写至少一个关联主键（如: tenant_id, stat_date）！');
          return;
        }
        payload.isCrossDb = 1;
        payload.crossDbConfig = crossCfg;
        // 如果同时选了主库或写了主SQL则一并提交
        const srcDsVal = document.getElementById('datax-st-form-source-ds').value;
        if (srcDsVal) payload.sourceDatasourceId = Number(srcDsVal);
        payload.sourceSql = document.getElementById('datax-st-form-sql').value.trim();
      } else {
        const sourceDs = document.getElementById('datax-st-form-source-ds').value;
        const sql = document.getElementById('datax-st-form-sql').value.trim();
        if (!sourceDs) { alert('SQL 模式下必须选择源端数据源！'); return; }
        if (!sql) { alert('请输入只读统计 SQL！'); return; }
        payload.sourceDatasourceId = Number(sourceDs);
        payload.sourceSql = sql;
        payload.isCrossDb = 0;
      }
    } else {
      const pyScript = document.getElementById('datax-st-form-python-script').value.trim();
      const pyParams = document.getElementById('datax-st-form-python-params').value.trim();
      if (!pyScript) { alert('请输入 Python 脚本！'); return; }
      const allow = await confirmDangerousOperationIfNeeded(pyScript, '保存任务配置');
      if (!allow) return;
      payload.pythonScript = pyScript;
      payload.pythonParams = pyParams;
      const srcDsVal = document.getElementById('datax-st-form-source-ds').value;
      if (srcDsVal) payload.sourceDatasourceId = Number(srcDsVal);
    }

    const saveBtn = document.getElementById('datax-st-btn-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    tip.innerHTML = '<span style="color:#1890ff;">⏳ 正在保存配置并同步调度中...</span>';

    try {
      const res = await fetch('/api/statTask/save', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        tip.innerHTML = '<span style="color:#52c41a;">🎉 保存成功！</span>';
        setTimeout(() => {
          document.getElementById('datax-st-editor-panel').style.display = 'none';
          loadStatTaskList();
        }, 600);
      } else {
        tip.innerHTML = `<span style="color:#f5222d;">❌ 保存失败: ${getApiMsg(json)}</span>`;
      }
    } catch (e) {
      tip.innerHTML = `<span style="color:#f5222d;">❌ 异常: ${e.message}</span>`;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存任务配置';
    }
  }

  // 6. 在线试运行调试 (Test Run)
  async function testRunStatTask() {
    const type = document.getElementById('datax-st-form-type').value;
    const testBtn = document.getElementById('datax-st-btn-test-run');
    const resultBox = document.getElementById('datax-st-test-run-result-box');
    const summary = document.getElementById('datax-st-test-run-summary');
    const tableContainer = document.getElementById('datax-st-test-run-table-container');

    const payload = {
      taskType: type,
      limit: 50,
      dryRun: true
    };

    if (type === 'SQL') {
      const crossCfg = collectCrossDbConfig();
      if (crossCfg) {
        if (crossCfg.mergeMode !== 'FEDERATED_SQL' && (!crossCfg.sources || crossCfg.sources.length === 0)) {
          alert('跨库模式下请至少配置一个数据源节点与对应 SQL！');
          return;
        }
        payload.isCrossDb = 1;
        payload.crossDbConfig = crossCfg;
        const srcDsVal = document.getElementById('datax-st-form-source-ds').value;
        if (srcDsVal) payload.sourceDatasourceId = Number(srcDsVal);
        payload.sourceSql = document.getElementById('datax-st-form-sql').value.trim();
      } else {
        const sourceDs = document.getElementById('datax-st-form-source-ds').value;
        const sql = document.getElementById('datax-st-form-sql').value.trim();
        if (!sourceDs) { alert('请先选择源端数据源！'); return; }
        if (!sql) { alert('请输入统计 SQL 语句！'); return; }
        payload.sourceDatasourceId = Number(sourceDs);
        payload.sourceSql = sql;
      }
    } else {
      const pyScript = document.getElementById('datax-st-form-python-script').value.trim();
      const pyParams = document.getElementById('datax-st-form-python-params').value.trim();
      if (!pyScript) { alert('请输入 Python 脚本！'); return; }
      const allow = await confirmDangerousOperationIfNeeded(pyScript, '试运行');
      if (!allow) return;
      payload.pythonScript = pyScript;
      payload.pythonParams = pyParams;
      const srcDsVal = document.getElementById('datax-st-form-source-ds').value;
      if (srcDsVal) payload.sourceDatasourceId = Number(srcDsVal);
    }

    testBtn.disabled = true;
    testBtn.textContent = '试跑计算中...';
    resultBox.style.display = 'block';
    summary.innerHTML = '⏳ 正在拉起计算引擎执行，请稍候...';
    tableContainer.innerHTML = '';

    try {
      const res = await fetch('/api/statTask/testRun', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (isApiSuccess(json) && json.data) {
        const d = json.data;
        summary.innerHTML = `✅ 试运行成功！共提取出 <strong>${d.totalRows || 0}</strong> 行数据，耗时 <strong>${d.costMs || 0}ms</strong>（预览前 ${d.rows ? d.rows.length : 0} 行）`;

        let contentHtml = '';
        if (d.rows && d.rows.length > 0 && d.columns && d.columns.length > 0) {
          let tbl = '<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr style="background:#f5f7fa;border-bottom:1px solid #dcdfe6;">';
          d.columns.forEach(c => { tbl += `<th style="padding:6px;border:1px solid #ebeef5;">${safeEscapeHtml(c)}</th>`; });
          tbl += '</tr></thead><tbody>';
          d.rows.forEach(r => {
            tbl += '<tr style="border-bottom:1px solid #ebeef5;">';
            d.columns.forEach(c => {
              const val = r[c] !== undefined && r[c] !== null ? r[c] : '';
              tbl += `<td style="padding:5px 6px;border:1px solid #ebeef5;">${safeEscapeHtml(val)}</td>`;
            });
            tbl += '</tr>';
          });
          tbl += '</tbody></table>';
          contentHtml += tbl;
        } else {
          contentHtml += '<div style="padding:15px;color:#888;text-align:center;">计算完成，未返回数据行</div>';
        }

        if (d.logOutput && d.logOutput.trim()) {
          contentHtml += `
            <details style="margin-top:8px;border:1px solid #e8e8e8;border-radius:4px;background:#fafafa;padding:6px 10px;" ${(d.totalRows === 0 || !d.rows || d.rows.length === 0) ? 'open' : ''}>
              <summary style="cursor:pointer;font-weight:bold;color:#1890ff;font-size:11px;outline:none;user-select:none;">
                控制台执行日志 (stdout/stderr)
              </summary>
              <pre style="margin:6px 0 0 0;padding:8px;background:#1e1e1e;color:#d4d4d4;border-radius:3px;font-family:Consolas, Monaco, monospace;font-size:11px;line-height:1.4;max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;">${safeEscapeHtml(d.logOutput)}</pre>
            </details>
          `;
        }
        tableContainer.innerHTML = contentHtml;
      } else {
        const d = json.data;
        let failHtml = `<span style="color:#f5222d;">❌ 试运行失败: ${safeEscapeHtml(getApiMsg(json))}</span>`;
        if (d && d.logOutput && d.logOutput.trim()) {
          failHtml += `
            <details open style="margin-top:8px;border:1px solid #ffa39e;border-radius:4px;background:#fff1f0;padding:6px 10px;">
              <summary style="cursor:pointer;font-weight:bold;color:#f5222d;font-size:11px;outline:none;user-select:none;">
                异常控制台日志输出
              </summary>
              <pre style="margin:6px 0 0 0;padding:8px;background:#1e1e1e;color:#ff7875;border-radius:3px;font-family:Consolas, Monaco, monospace;font-size:11px;line-height:1.4;max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;">${safeEscapeHtml(d.logOutput)}</pre>
            </details>
          `;
        }
        summary.innerHTML = failHtml;
      }
    } catch (e) {
      summary.innerHTML = `<span style="color:#f5222d;">❌ 试运行异常: ${safeEscapeHtml(e.message)}</span>`;
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '试运行调试 (预览数据)';
    }
  }

  // 7. 初始化 Tab 6 所有控件事件
  function initStatTaskEvents() {
    const queryBtn = document.getElementById('datax-st-btn-query');
    if (queryBtn) queryBtn.onclick = () => loadStatTaskList(1);

    const refreshBtn = document.getElementById('datax-st-btn-refresh');
    if (refreshBtn) refreshBtn.onclick = () => loadStatTaskList(1);

    const createBtn = document.getElementById('datax-st-btn-create-task');
    if (createBtn) createBtn.onclick = () => openStatTaskEditor(null);

    const closeBtn = document.getElementById('datax-st-btn-close-editor');
    if (closeBtn) closeBtn.onclick = () => { document.getElementById('datax-st-editor-panel').style.display = 'none'; };

    const cancelBtn = document.getElementById('datax-st-btn-cancel');
    if (cancelBtn) cancelBtn.onclick = () => { document.getElementById('datax-st-editor-panel').style.display = 'none'; };

    const typeSelect = document.getElementById('datax-st-form-type');
    if (typeSelect) typeSelect.onchange = toggleStatTaskMode;

    const isCrossCheckbox = document.getElementById('datax-st-form-is-cross-db');
    if (isCrossCheckbox) isCrossCheckbox.onchange = toggleCrossDbPanel;

    const crossMergeMode = document.getElementById('datax-st-cross-merge-mode');
    if (crossMergeMode) crossMergeMode.onchange = toggleCrossDbPanel;

    const addCrossSrcBtn = document.getElementById('datax-st-btn-add-cross-source');
    if (addCrossSrcBtn) addCrossSrcBtn.onclick = () => renderCrossDbSourceNode();

    const insertMacroBtn = document.getElementById('datax-st-btn-insert-macro');
    if (insertMacroBtn) insertMacroBtn.onclick = insertCrossDbMacroSnippet;

    const cronPreset = document.getElementById('datax-st-cron-presets');
    if (cronPreset) {
      cronPreset.onchange = () => {
        if (cronPreset.value) {
          document.getElementById('datax-st-form-cron').value = cronPreset.value;
        }
      };
    }

    const saveBtn = document.getElementById('datax-st-btn-save');
    if (saveBtn) saveBtn.onclick = saveStatTaskConfig;

    const testBtn = document.getElementById('datax-st-btn-test-run');
    if (testBtn) testBtn.onclick = testRunStatTask;

    // 顶部数据源筛选直接联动查询
    const topDsSelect = document.getElementById('datax-st-search-ds');
    if (topDsSelect) topDsSelect.onchange = () => loadStatTaskList(1);

    // 顶部目标表名按回车触发查询
    const topTableInput = document.getElementById('datax-st-search-table');
    if (topTableInput) {
      topTableInput.onkeydown = (e) => {
        if (e.key === 'Enter') loadStatTaskList(1);
      };
    }

    // 1. 实例化源端数据源一体化可搜索下拉框
    if (!stSourceDsSelect) {
      stSourceDsSelect = new SearchableSelect({
        container: '#datax-st-source-ds-combobox',
        hiddenInput: 'datax-st-form-source-ds',
        placeholder: '-- 请选择或搜索源端数据源 --',
        allowCustomInput: false,
        onSelect: (val) => {
          if (stPythonDsSelect) stPythonDsSelect.setValue(val);
          renderPythonAvailableDatasources(val);
          loadStatSourceTables(val);
        }
      });
    }

    // 1.1 实例化 Python 模式源端数据源一体化可搜索下拉框
    if (!stPythonDsSelect) {
      stPythonDsSelect = new SearchableSelect({
        container: '#datax-st-python-ds-combobox',
        hiddenInput: 'datax-st-form-source-ds',
        placeholder: '-- 可选：关联源端数据库 (免密注入) --',
        allowCustomInput: false,
        onSelect: (val) => {
          if (stSourceDsSelect) stSourceDsSelect.setValue(val);
          renderPythonAvailableDatasources(val);
          loadStatSourceTables(val);
        }
      });
    }

    // Python 免密连接代码插入与参考 Demo 模板载入按钮绑定
    const btnInsertPyDbCode = document.getElementById('datax-st-btn-insert-py-db-code');
    if (btnInsertPyDbCode) {
      btnInsertPyDbCode.onclick = insertPythonDbCodeSnippet;
    }
    const btnLoadDemoCode = document.getElementById('datax-st-btn-load-demo-code');
    if (btnLoadDemoCode) {
      btnLoadDemoCode.onclick = loadStatPythonDemo;
    }

    // 2. 实例化源库表一体化可搜索下拉框 (支持同时检索表名与注解)
    if (!stSourceTableSelect) {
      stSourceTableSelect = new SearchableSelect({
        container: '#datax-st-source-table-combobox',
        hiddenInput: 'datax-st-source-table-val',
        placeholder: '-- 搜索表名或中文注解 (请先选源端库) --',
        allowCustomInput: false,
        emptyText: '未检索到匹配的数据表'
      });
    }

    // 3. 源端表快捷操作按钮
    const btnInsertTable = document.getElementById('datax-st-btn-insert-table');
    if (btnInsertTable) btnInsertTable.onclick = insertSourceTableToSql;

    const btnGenSelect = document.getElementById('datax-st-btn-gen-select');
    if (btnGenSelect) btnGenSelect.onclick = generateSourceTableSelectSql;

    // 4. 实例化目标端数据源一体化可搜索下拉框
    if (!stTargetDsSelect) {
      stTargetDsSelect = new SearchableSelect({
        container: '#datax-st-target-ds-combobox',
        hiddenInput: 'datax-st-form-target-ds',
        placeholder: '-- 请选择或搜索目标端数据源 --',
        allowCustomInput: false,
        onSelect: (val) => {
          loadStatTargetTables(val);
        }
      });
    }

    // 5. 实例化目标端表名 Combobox (支持模糊检索已有表，也支持自由打字输入新表名)
    if (!stTargetTableSelect) {
      stTargetTableSelect = new SearchableSelect({
        container: '#datax-st-target-table-combobox',
        hiddenInput: 'datax-st-form-target-table',
        placeholder: '请选择已有表或直接输入新表名 (如: rpt_user_stat_daily)',
        allowCustomInput: true,
        emptyText: '未检索到已有表，可直接回车使用当前输入的新表名'
      });
    }
  }

  // ==================== 统计任务执行历史流水弹窗逻辑 ====================
  let currentLogTaskId = null;
  let currentLogTaskName = '';
  let currentLogPage = 1;
  const currentLogPageSize = 10;
  let currentLogStatus = 0;
  let currentLogTriggerType = '';

  function openStatTaskLogModal(task) {
    if (!task) return;
    currentLogTaskId = task.id;
    currentLogTaskName = task.taskName || `任务 #${task.id}`;
    currentLogPage = 1;
    currentLogStatus = 0;
    currentLogTriggerType = '';

    // 清理可能遗留的旧 DOM，确保全生命周期干净重构与样式统一
    let modalEl = document.getElementById('datax-st-log-modal');
    if (modalEl) {
      modalEl.remove();
    }

    const blockInfo = getBlockStrategyInfo(task.executorBlockStrategy);

    modalEl = document.createElement('div');
    modalEl.id = 'datax-st-log-modal';
    modalEl.className = 'datax-sub-modal' + (window.DataXAssistant?.isDarkMode?.() ? ' datax-dark-mode' : '');
    // 对齐工作台弹窗层级规范：主工作台为 999999，浮层弹窗统一设为 1000025，确保始终位于主工作台之上
    modalEl.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.48); z-index: 1000025; backdrop-filter: blur(3px);';
    modalEl.innerHTML = `
      <!-- 统一风格窗口：蓝色渐变头部 + 可拖拽 + 8 向缩放 (复用 PanelWindowManager) -->
      <div id="datax-st-log-dialog" style="background: #fff; border-radius: 8px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28), 0 6px 16px rgba(0, 0, 0, 0.12); display: flex; flex-direction: column; overflow: hidden; position: absolute; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;">
        <!-- 窗口头部：统一蓝色渐变，拖拽移动 + 双击最大化/还原 -->
        <div id="datax-st-log-header" title="按住鼠标左键可自由拖动，双击最大化/还原" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; border-radius: 8px 8px 0 0; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <strong style="font-size: 14px;" id="datax-st-log-title">任务执行历史记录</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="datax-st-log-btn-refresh" data-window-ctrl title="刷新执行记录" style="background: rgba(255,255,255,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: 4px; padding: 3px 10px; font-size: 12px; cursor: pointer; transition: all 0.2s;">刷新</button>
            <span id="datax-st-log-max" data-window-ctrl title="最大化 / 还原" style="font-size: 15px; line-height: 1; padding: 0 3px; cursor: pointer; opacity: 0.9;">&#x25A2;</span>
            <span id="datax-st-log-btn-close" data-window-ctrl title="关闭 (Esc)" style="font-size: 20px; line-height: 1; padding: 0 4px; cursor: pointer; opacity: 0.9;">&times;</span>
          </div>
        </div>

        <!-- 过滤工具栏：统一窗口白色工具条 -->
        <div style="padding: 8px 16px; background: #fafafa; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0;">
          <span style="font-size: 12px; color: #595959; white-space: nowrap;">触发状态</span>
          <select id="datax-st-log-filter-status" style="border: 1px solid #d9d9d9; border-radius: 4px; padding: 4px 10px; font-size: 12px; outline: none; background: #fff; color: #595959; cursor: pointer; transition: all 0.2s;">
            <option value="0">全部状态</option>
            <option value="1">🟢 执行成功</option>
            <option value="2">🔴 执行失败</option>
            <option value="3">⏳ 待完成 / 未回调</option>
          </select>
          <span style="font-size: 12px; color: #595959; white-space: nowrap;">触发方式</span>
          <select id="datax-st-log-filter-type" style="border: 1px solid #d9d9d9; border-radius: 4px; padding: 4px 10px; font-size: 12px; outline: none; background: #fff; color: #595959; cursor: pointer; transition: all 0.2s;">
            <option value="">全部方式</option>
            <option value="MANUAL">🚀 手动执行</option>
            <option value="CRON">⏰ 定时调度</option>
          </select>
        </div>

        <!-- 任务摘要信息条：Ant Design 说明标签栏 -->
        <div id="datax-st-log-meta-bar" style="background: #fbfbfb; border-bottom: 1px solid #f0f0f0; padding: 8px 20px; font-size: 12px; color: #595959; display: flex; gap: 18px; align-items: center; flex-wrap: wrap;">
          <span>任务ID: <strong style="color: #262626; font-family: monospace;">#${task.id}</strong></span>
          <span>目标库表: <span style="background: #e6f7ff; color: #096dd9; border: 1px solid #91d5ff; padding: 1px 8px; border-radius: 4px; font-weight: 500;">${safeEscapeHtml(task.targetTableName || '-')} (${safeEscapeHtml(task.writeMode || 'APPEND')})</span></span>
          <span>Cron周期: <span style="background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; padding: 1px 8px; border-radius: 4px; font-family: monospace;">${safeEscapeHtml(task.cronExpression || '未配置')}</span></span>
          <span>阻塞策略: <span style="background: ${blockInfo.bg}; color: ${blockInfo.color}; border: 1px solid ${blockInfo.border}; padding: 1px 8px; border-radius: 4px; font-weight: 500;">${safeEscapeHtml(blockInfo.label)}</span></span>
          <span>调度状态: ${task.status === 1 ? '<span style="color: #52c41a; font-weight: 600;">🟢 运行中</span>' : '<span style="color: #8c8c8c;">⚪ 已停止</span>'}</span>
        </div>

        <!-- 日志内容滚动区域 -->
        <div id="datax-st-log-body" style="flex: 1; overflow-y: auto; padding: 0; box-sizing: border-box; background: #fff;">
          <div style="text-align: center; color: #8c8c8c; padding: 60px 20px; font-size: 13px;">⏳ 正在读取执行历史记录...</div>
        </div>

        <!-- 底部工具栏与分页：Ant Design 规范分页组件 -->
        <div style="padding: 10px 20px; border-top: 1px solid #f0f0f0; background: #fafafa; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #595959;">
          <div id="datax-st-log-page-info">共 0 条执行记录</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="datax-st-log-prev-page" style="background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; padding: 3px 10px; font-size: 12px; color: #595959; cursor: pointer; transition: all 0.2s;">◀ 上一页</button>
            <span id="datax-st-log-cur-page-text" style="font-size: 12px; color: #262626;">第 1 页</span>
            <button id="datax-st-log-next-page" style="background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; padding: 3px 10px; font-size: 12px; color: #595959; cursor: pointer; transition: all 0.2s;">下一页 ▶</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    // 初始尺寸与视口居中定位 (保存过的位置/尺寸由 PanelWindowManager 内部恢复)
    const logDialog = modalEl.querySelector('#datax-st-log-dialog');
    const initLogW = Math.min(1060, Math.max(720, window.innerWidth * 0.72));
    const initLogH = Math.min(window.innerHeight * 0.84, 760);
    logDialog.style.width = `${initLogW}px`;
    logDialog.style.height = `${initLogH}px`;
    logDialog.style.left = `${Math.max(10, Math.round((window.innerWidth - initLogW) / 2))}px`;
    logDialog.style.top = `${Math.max(10, Math.round((window.innerHeight - initLogH) / 2))}px`;

    // 8 方向缩放手柄 (统一样式，样式来自 ensureEnhancedStyles 注入)
    ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `datax-resize-handle datax-resize-${dir}`;
      handle.setAttribute('data-dir', dir);
      handle.title = (dir === 'se') ? '按住拖动调整窗口尺寸' : '调整窗口尺寸';
      logDialog.appendChild(handle);
    });

    // 复用统一窗口交互管理器：拖拽移动、8 向缩放、最大化/还原、位置尺寸记忆
    const logWindowManager = new window.DataXAssistant.PanelWindowManager(
      logDialog,
      modalEl.querySelector('#datax-st-log-header'),
      {
        maxBtn: modalEl.querySelector('#datax-st-log-max'),
        minWidth: 640,
        minHeight: 420,
        storageKeyPos: 'datax_st_log_pos',
        storageKeySize: 'datax_st_log_size'
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
        const detailModal = document.getElementById('datax-st-log-detail-modal');
        if (detailModal) {
          // 释放详情窗口的拖拽/缩放监听，避免重复打开时监听器累积
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

    document.getElementById('datax-st-log-btn-close').onclick = closeModal;
    modalEl.onclick = (e) => {
      if (e.target === modalEl) closeModal();
    };

    document.getElementById('datax-st-log-filter-status').onchange = (e) => {
      currentLogStatus = parseInt(e.target.value, 10) || 0;
      currentLogPage = 1;
      fetchAndRenderStatTaskLogs();
    };

    document.getElementById('datax-st-log-filter-type').onchange = (e) => {
      currentLogTriggerType = e.target.value || '';
      currentLogPage = 1;
      fetchAndRenderStatTaskLogs();
    };

    document.getElementById('datax-st-log-btn-refresh').onclick = () => {
      fetchAndRenderStatTaskLogs();
    };

    document.getElementById('datax-st-log-prev-page').onclick = () => {
      if (currentLogPage > 1) {
        currentLogPage--;
        fetchAndRenderStatTaskLogs();
      }
    };

    document.getElementById('datax-st-log-next-page').onclick = () => {
      currentLogPage++;
      fetchAndRenderStatTaskLogs();
    };

    const titleEl = document.getElementById('datax-st-log-title');
    if (titleEl) {
      titleEl.textContent = `任务执行历史记录 - 【${task.taskName}】`;
    }

    fetchAndRenderStatTaskLogs();
  }

  async function fetchAndRenderStatTaskLogs() {
    const logBody = document.getElementById('datax-st-log-body');
    const pageInfo = document.getElementById('datax-st-log-page-info');
    const curPageText = document.getElementById('datax-st-log-cur-page-text');
    const btnPrev = document.getElementById('datax-st-log-prev-page');
    const btnNext = document.getElementById('datax-st-log-next-page');

    if (!logBody || !currentLogTaskId) return;

    logBody.innerHTML = '<div style="text-align: center; color: #8c8c8c; padding: 60px 20px; font-size: 13px;">⏳ 正在读取执行历史记录...</div>';

    let url = `/api/statTask/logList?taskId=${currentLogTaskId}&current=${currentLogPage}&size=${currentLogPageSize}`;
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
            rawMsg = '正在执行计算与落库中...';
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
              <button class="datax-st-log-detail-btn" data-log-id="${r.id}" data-status="${r.status}" data-msg="${encodeURIComponent(cleanMsg)}" style="background: #fafafa; color: #1890ff; border: 1px solid #d9d9d9; padding: 3px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s;">🔍 日志</button>
            </td>
          </tr>
        `;
      });

      tblHtml += '</tbody></table></div>';
      logBody.innerHTML = tblHtml;

      // 绑定日志点击弹窗
      logBody.querySelectorAll('.datax-st-log-detail-btn').forEach(btn => {
        btn.onclick = () => {
          const logId = btn.getAttribute('data-log-id');
          const status = btn.getAttribute('data-status');
          const rawMsg = decodeURIComponent(btn.getAttribute('data-msg') || '');
          showLogDetailModal(logId, status, rawMsg);
        };
      });

    } catch (e) {
      logBody.innerHTML = `<div style="text-align: center; color: #f5222d; padding: 40px 20px; font-size: 13px;">❌ 加载异常: ${safeEscapeHtml(e.message)}</div>`;
    }
  }

  function showLogDetailModal(logId, status, fallbackMsg) {
    let detailModal = document.getElementById('datax-st-log-detail-modal');
    if (detailModal) {
      detailModal.remove();
    }

    const isRunning = (status === 'RUNNING');
    let pollTimer = null;
    let fromLineNum = 1;
    let autoScroll = true;

    detailModal = document.createElement('div');
    detailModal.id = 'datax-st-log-detail-modal';
    // 设为 1000040，确保处于历史流水列表 (1000025) 与主工作台 (999999) 之上
    detailModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.55); z-index: 1000040; backdrop-filter: blur(2px);';
    detailModal.innerHTML = `
      <!-- 统一风格窗口：深色控制台终端主题 (蓝色渐变头部 + 可拖拽 + 8 向缩放) -->
      <div id="datax-st-log-detail-dialog" style="background: #1e1e1e; border-radius: 8px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45); display: flex; flex-direction: column; overflow: hidden; position: absolute; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;">
        <div id="datax-st-log-detail-header" title="按住鼠标左键可自由拖动，双击最大化/还原" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; border-radius: 8px 8px 0 0; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <strong style="font-size: 14px;">任务运行日志控制台 - [#${logId}]</strong>
            <span id="datax-st-log-status-tag" style="background: ${isRunning ? '#52c41a' : '#595959'}; color: #fff; font-size: 11px; padding: 1px 8px; border-radius: 10px;">${isRunning ? '运行中 (动态轮询中)' : (status === 'SUCCESS' ? '已成功完成' : (status === 'FAIL' ? '执行失败' : '历史留痕'))}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span id="datax-st-log-detail-max" data-window-ctrl title="最大化 / 还原" style="font-size: 15px; line-height: 1; padding: 0 3px; cursor: pointer; opacity: 0.9;">&#x25A2;</span>
            <span id="datax-st-log-detail-close" data-window-ctrl title="关闭 (Esc)" style="font-size: 20px; line-height: 1; padding: 0 4px; cursor: pointer; opacity: 0.9;">&times;</span>
          </div>
        </div>
        <!-- 顶部工具控制栏 -->
        <div style="padding: 8px 16px; background: #2d2d2d; border-bottom: 1px solid #3d3d3d; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #d4d4d4; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="datax-st-log-autoscroll-chk" checked style="cursor: pointer;" />
              <span>自动跟随滚动</span>
            </label>
            <span id="datax-st-log-poll-hint" style="color: #8c8c8c; font-size: 11px;">${isRunning ? '⏳ 每 1.5 秒增量抓取' : '✅ 执行已结束'}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="datax-st-log-refresh-btn" data-window-ctrl style="background: #3a3a3a; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;">刷新</button>
            <button id="datax-st-log-clear-btn" data-window-ctrl style="background: #3a3a3a; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;">清屏</button>
            <button id="datax-st-log-copy-btn" data-window-ctrl style="background: #1890ff; color: #fff; border: 1px solid #1890ff; border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;">复制日志</button>
          </div>
        </div>
        <!-- 日志终端输出主视图 -->
        <div style="padding: 12px 16px; flex: 1; min-height: 0; display: flex; background: #1e1e1e;">
          <pre id="datax-st-log-detail-pre" style="width: 100%; height: 100%; font-family: Consolas, 'Fira Code', Monaco, 'Courier New', monospace; font-size: 12px; line-height: 1.55; padding: 12px 14px; border: 1px solid #333; border-radius: 4px; box-sizing: border-box; background: #141414; color: #d4d4d4; outline: none; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin: 0;">正在加载日志...</pre>
        </div>
        <div style="padding: 8px 16px; border-top: 1px solid #2d2d2d; background: #252525; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
          <button id="datax-st-log-detail-confirm" data-window-ctrl style="background: #3a3a3a; border: 1px solid #555; border-radius: 4px; padding: 5px 16px; font-size: 12px; color: #d4d4d4; cursor: pointer; transition: all 0.2s;">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(detailModal);

    // 初始尺寸与视口居中定位
    const detailDialog = detailModal.querySelector('#datax-st-log-detail-dialog');
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
      detailModal.querySelector('#datax-st-log-detail-header'),
      {
        maxBtn: detailModal.querySelector('#datax-st-log-detail-max'),
        minWidth: 500,
        minHeight: 350,
        storageKeyPos: 'datax_st_log_detail_pos',
        storageKeySize: 'datax_st_log_detail_size'
      }
    );
    detailModal._wm = detailWindowManager;

    const preEl = document.getElementById('datax-st-log-detail-pre');
    const pollHintEl = document.getElementById('datax-st-log-poll-hint');
    const statusTagEl = document.getElementById('datax-st-log-status-tag');
    const chkAutoScroll = document.getElementById('datax-st-log-autoscroll-chk');

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
        const res = await fetch(`/api/statTask/logDetailCat?logId=${logId}&fromLineNum=${fromLineNum}`, { headers: getAuthHeaders() });
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
            // 若物理文件尚未生成或无分片，展示 fallbackMsg 作为兜底
            preEl.textContent = fallbackMsg ? `[历史摘要留痕]\n${fallbackMsg}\n\n(提示: 该任务未生成物理控制台日志或已归档)` : '暂无详细日志内容';
          }

          if (isEnd) {
            stopPolling('执行已落幕');
          }
        }
      } catch (err) {
        console.warn('[LogDetailCat] 轮询异常:', err);
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

    document.getElementById('datax-st-log-detail-close').onclick = closeDetail;
    document.getElementById('datax-st-log-detail-confirm').onclick = closeDetail;
    detailModal.onclick = (e) => { if (e.target === detailModal) closeDetail(); };

    document.getElementById('datax-st-log-refresh-btn').onclick = () => {
      fetchLogChunk();
    };

    document.getElementById('datax-st-log-clear-btn').onclick = () => {
      preEl.textContent = '';
    };

    document.getElementById('datax-st-log-copy-btn').onclick = () => {
      copyTextToClipboard(preEl.textContent);
    };
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast('📋 已复制日志详情到剪贴板');
      }).catch(() => {
        legacyCopy(text);
      });
    } else {
      legacyCopy(text);
    }
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('📋 已复制日志详情到剪贴板');
    } catch (e) {
      alert('复制失败，请手动选中文本复制');
    }
    document.body.removeChild(ta);
  }

  class Tab6StatTask {
    constructor(container) {
      this.container = container;
    }

    init() {
      if (typeof initStatTaskEvents === 'function') {
        initStatTaskEvents();
      }
      if (typeof loadStatTaskDatasources === 'function') {
        loadStatTaskDatasources();
      }
      if (typeof loadStatTaskList === 'function') {
        loadStatTaskList(1);
      }
    }

    refresh() {
      if (typeof loadStatTaskDatasources === 'function') {
        loadStatTaskDatasources();
      }
      if (typeof loadStatTaskList === 'function') {
        loadStatTaskList(1);
      }
    }
  }

  window.DataXAssistant.Tabs.Tab6Class = Tab6StatTask;
})();
