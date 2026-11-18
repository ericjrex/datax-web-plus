/**
 * @fileoverview 通用一体化可搜索下拉选择组件 (SearchableSelect / Combobox)
 * 采用纯原生 DOM 构建，支持框内键入即时模糊检索、业务中文注解徽章、一键清空、键盘快速选择与自定义新建输入。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  /**
   * 下拉搜索一体化组件核心类
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

  window.DataXAssistant.SearchableSelect = SearchableSelect;
})();
