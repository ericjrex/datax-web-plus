/**
 * @fileoverview 智能助手偏好设置控制器 (SettingsModal)
 * 提供主题模式 (亮色/暗黑/系统自适应)、失焦半透明透视与全局字号动态缩放调节。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  const STORAGE_KEY_THEME = 'datax_assistant_theme';
  const STORAGE_KEY_OPACITY = 'datax_assistant_inactive_opacity';
  const STORAGE_KEY_FONT_SIZE = 'datax_assistant_font_size';
  const STORAGE_KEY_VISIBLE_TABS = 'datax_assistant_visible_tabs';
  const KNOWN_LEGACY_TABS = ['1', '2', '3', '4', '5', '6', '7'];

  /**
   * 智能助手支持的选项卡清单及元数据 (单一可信源)
   */
  const TAB_DEFINITIONS = [
    { id: '1', name: '1. 表勾选', desc: 'Excel与粘贴文本智能勾选源库表' },
    { id: '2', name: '2. 映射建表', desc: '批量类型映射与智能目标表DDL生成' },
    { id: '3', name: '3. 任务批处理', desc: '批量自动构建同步任务与批量时间增量配置' },
    { id: '4', name: '4. 批量改库', desc: '批量置换同步任务的Reader/Writer数据源连接' },
    { id: '5', name: '5. 数据浏览', desc: '全库表目录清单检索、表结构查看与数据快速预览' },
    { id: '6', name: '6. 结果表加工', desc: '多源关联聚合、跨库统计与Python数据加工' },
    { id: '7', name: '7. 接口采集', desc: '外部HTTP/API接口定时拉取与结构化落库' },
    { id: '8', name: '8. 三方API', desc: '三方开放API账号授权与全链路调用审计' }
  ];

  class SettingsModal {
    /**
     * @param {HTMLElement} panel 主面板 DOM 元素
     * @param {HTMLElement} modal 设置弹窗 DOM 元素
     * @param {Object} [options={}] 配置项
     */
    constructor(panel, modal, options = {}) {
      this.panel = panel;
      this.modal = modal;
      this.options = options;

      this.currentInactiveOpacity = parseFloat(localStorage.getItem(STORAGE_KEY_OPACITY) || '1.0');
      if (isNaN(this.currentInactiveOpacity)) this.currentInactiveOpacity = 1.0;

      this.currentFontSize = parseInt(localStorage.getItem(STORAGE_KEY_FONT_SIZE) || '13', 10);
      if (isNaN(this.currentFontSize)) this.currentFontSize = 13;

      this.visibleTabs = this.getVisibleTabs();
      this.saveTimer = null;

      this.init();
    }

    init() {
      const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'light';
      this.applyTheme(savedTheme);
      this.applyInactiveOpacity(this.currentInactiveOpacity);
      this.applyFontSize(this.currentFontSize);
      this.applyTabVisibility(this.visibleTabs, false);

      this.bindSystemThemeWatcher();
      this.bindModalEvents();
      this.bindGlobalFocusWatcher();
      this.bindAuthWatcher();
      this.syncRemoteUserVisibleTabs();
    }

    /**
     * 设置主面板不透明度
     *
     * @param {number|string} opacity 不透明度 (0.05 ~ 1)
     */
    setPanelOpacity(opacity) {
      if (!this.panel) return;
      const targetVal = String(opacity);
      if (this.panel.style.opacity !== targetVal) {
        this.panel.style.opacity = targetVal;
      }
    }

    /**
     * 应用主题模式
     *
     * @param {'light'|'dark'|'auto'} theme 主题
     */
    applyTheme(theme = 'light') {
      if (!['light', 'dark', 'auto'].includes(theme)) theme = 'light';
      try {
        localStorage.setItem(STORAGE_KEY_THEME, theme);
      } catch (e) {}

      let isDark = false;
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'auto') {
        isDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      }

      if (this.panel) {
        this.panel.classList.toggle('datax-dark-mode', isDark);
      }

      // 同步切换可能处于展示态的子模态弹窗 (如查看表字段、查看表数据、任务执行历史、批量比对/演进、DDL预览等全部弹窗)
      document.querySelectorAll('.datax-sub-modal, div[id$="-modal"], #datax-ddl-modal').forEach(m => {
        m.classList.toggle('datax-dark-mode', isDark);
      });

      if (this.modal) {
        this.modal.querySelectorAll('.datax-theme-card').forEach(card => {
          const cTheme = card.getAttribute('data-theme');
          if (cTheme === theme) {
            card.style.border = '2px solid #1890ff';
            card.style.boxShadow = '0 0 0 2px rgba(24, 144, 255, 0.2)';
          } else {
            card.style.border = isDark ? '1px solid #3f4350' : '1px solid #dcdfe6';
            card.style.boxShadow = 'none';
          }
        });
      }
    }

    /**
     * 应用失焦未选中时的透明度
     *
     * @param {number} opacity 数值 0.05 ~ 1.0
     * @param {boolean} [preview=false] 是否为拖拽预览模式
     */
    applyInactiveOpacity(opacity, preview = false) {
      const clamped = Math.max(0.05, Math.min(1.0, opacity));
      this.currentInactiveOpacity = clamped;
      if (!preview) {
        try {
          localStorage.setItem(STORAGE_KEY_OPACITY, String(clamped));
        } catch (e) {}
      }

      const percent = Math.round(clamped * 100);
      const valEl = document.getElementById('datax-setting-opacity-val');
      if (valEl) {
        valEl.textContent = `${percent}% ${percent === 100 ? '(始终完全不透明)' : '(失焦透视底层)'}`;
      }

      const slider = document.getElementById('datax-setting-opacity-slider');
      if (slider && String(slider.value) !== String(percent)) {
        slider.value = String(percent);
      }

      if (this.modal) {
        this.modal.querySelectorAll('.datax-opacity-quick').forEach(btn => {
          const bVal = parseInt(btn.getAttribute('data-val'), 10);
          if (bVal === percent) {
            btn.style.borderColor = '#1890ff';
            btn.style.color = '#1890ff';
            btn.style.fontWeight = 'bold';
          } else {
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.fontWeight = 'normal';
          }
        });
      }
    }

    /**
     * 应用工作台基础字号
     *
     * @param {number} size 字号 12 ~ 17
     */
    applyFontSize(size) {
      const clamped = Math.max(12, Math.min(17, size));
      this.currentFontSize = clamped;
      try {
        localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(clamped));
      } catch (e) {}

      if (this.panel) {
        this.panel.style.setProperty('--datax-font-base', `${clamped}px`);
      }

      const valEl = document.getElementById('datax-setting-font-val');
      if (valEl) {
        valEl.textContent = `${clamped}px ${clamped === 13 ? '(默认标准)' : ''}`;
      }

      const previewEl = document.getElementById('datax-setting-font-preview');
      if (previewEl) {
        previewEl.style.fontSize = `${clamped}px`;
      }

      const slider = document.getElementById('datax-setting-font-slider');
      if (slider && String(slider.value) !== String(clamped)) {
        slider.value = String(clamped);
      }

      if (this.modal) {
        this.modal.querySelectorAll('.datax-font-quick').forEach(btn => {
          const bVal = parseInt(btn.getAttribute('data-val'), 10);
          if (bVal === clamped) {
            btn.style.borderColor = '#1890ff';
            btn.style.color = '#1890ff';
            btn.style.fontWeight = 'bold';
          } else {
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.fontWeight = 'normal';
          }
        });
      }
    }

    bindSystemThemeWatcher() {
      if (window.matchMedia) {
        try {
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if ((localStorage.getItem(STORAGE_KEY_THEME) || 'light') === 'auto') {
              this.applyTheme('auto');
            }
          });
        } catch (e) {}
      }
    }

    open() {
      if (this.modal) {
        this.modal.style.display = 'flex';
        this.setPanelOpacity(1);
        this.applyTheme(localStorage.getItem(STORAGE_KEY_THEME) || 'light');
        this.applyInactiveOpacity(this.currentInactiveOpacity);
        this.applyFontSize(this.currentFontSize);
        this.applyTabVisibility(this.getVisibleTabs(), false);
        this.syncRemoteUserVisibleTabs();
      }
    }

    close() {
      if (this.modal) {
        this.modal.style.display = 'none';
      }
    }

    bindModalEvents() {
      if (!this.modal) return;

      const closeBtn = document.getElementById('datax-settings-close');
      const doneBtn = document.getElementById('datax-settings-done-btn');
      if (closeBtn) closeBtn.onclick = () => this.close();
      if (doneBtn) doneBtn.onclick = () => this.close();

      this.modal.onclick = (e) => {
        if (e.target === this.modal) this.close();
      };

      // 主题卡片点击
      this.modal.querySelectorAll('.datax-theme-card').forEach(card => {
        card.onclick = () => {
          const theme = card.getAttribute('data-theme');
          this.applyTheme(theme);
        };
      });

      // 透明度滑块与快捷按钮
      const opSlider = document.getElementById('datax-setting-opacity-slider');
      if (opSlider) {
        opSlider.oninput = () => {
          const val = parseInt(opSlider.value, 10);
          this.applyInactiveOpacity(val / 100, true);
        };
        opSlider.onchange = () => {
          const val = parseInt(opSlider.value, 10);
          this.applyInactiveOpacity(val / 100, false);
        };
      }
      this.modal.querySelectorAll('.datax-opacity-quick').forEach(btn => {
        btn.onclick = () => {
          const val = parseInt(btn.getAttribute('data-val'), 10);
          this.applyInactiveOpacity(val / 100, false);
        };
      });

      // 字号滑块与快捷按钮
      const fontSlider = document.getElementById('datax-setting-font-slider');
      if (fontSlider) {
        fontSlider.oninput = () => {
          const val = parseInt(fontSlider.value, 10);
          this.applyFontSize(val);
        };
      }
      this.modal.querySelectorAll('.datax-font-quick').forEach(btn => {
        btn.onclick = () => {
          const val = parseInt(btn.getAttribute('data-val'), 10);
          this.applyFontSize(val);
        };
      });

      // 恢复默认尺寸与位置
      const resetPosBtn = document.getElementById('datax-setting-reset-pos-btn');
      if (resetPosBtn) {
        resetPosBtn.onclick = () => {
          if (this.panel) {
            this.panel.style.width = '780px';
            this.panel.style.height = '560px';
            this.panel.style.top = '50px';
            this.panel.style.left = '';
            this.panel.style.right = '20px';
            this.panel.style.bottom = 'auto';
          }
          try {
            localStorage.setItem('datax_assistant_panel_size', JSON.stringify({ width: 780, height: 560 }));
            localStorage.setItem('datax_assistant_panel_pos', JSON.stringify({ top: 50, left: Math.max(20, window.innerWidth - 800) }));
          } catch (e) {}
          resetPosBtn.textContent = '已成功重置默认位置与尺寸！';
          setTimeout(() => {
            resetPosBtn.textContent = '恢复默认位置与尺寸';
          }, 2200);
        };
      }

      // 选项卡显示与隐藏控制相关事件绑定
      this.bindTabVisibilityEvents();
    }

    /**
     * 获取当前持久化的可见 Tab ID 集合 (含安全白名单校验)
     *
     * @return {Array<string>} 可见 Tab 标识列表
     */
    getVisibleTabs() {
      const allTabIds = TAB_DEFINITIONS.map(t => t.id);
      try {
        const raw = localStorage.getItem(STORAGE_KEY_VISIBLE_TABS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // 白名单过滤，仅保留已知的有效 Tab ID
            const valid = parsed.map(String).filter(id => allTabIds.includes(id));
            if (valid.length > 0) {
              allTabIds.forEach(id => {
                if (!KNOWN_LEGACY_TABS.includes(id) && !valid.includes(id)) {
                  valid.push(id);
                }
              });
              valid.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
              return valid;
            }
          }
        }
      } catch (e) {}
      return allTabIds; // 默认全量可见
    }

    /**
     * 应用 Tab 显隐状态并同步 DOM
     *
     * @param {Array<string>} visibleTabs 可见 Tab 标识列表
     * @param {boolean} [shouldSave=true] 是否同步存入 localStorage
     */
    applyTabVisibility(visibleTabs, shouldSave = true) {
      const allTabIds = TAB_DEFINITIONS.map(t => t.id);
      const safeTabs = (Array.isArray(visibleTabs) && visibleTabs.length > 0)
        ? visibleTabs.map(String).filter(id => allTabIds.includes(id))
        : allTabIds;

      this.visibleTabs = safeTabs;
      if (shouldSave) {
        try {
          localStorage.setItem(STORAGE_KEY_VISIBLE_TABS, JSON.stringify(safeTabs));
        } catch (e) {}
        this.saveRemoteUserVisibleTabs(safeTabs);
      }

      if (!this.panel) return;

      // 1. 遍历更新顶部导航栏所有 Tab 按钮的显隐状态
      TAB_DEFINITIONS.forEach(def => {
        const btn = document.getElementById(`datax-tab-btn-${def.id}`);
        const isVisible = safeTabs.includes(def.id);
        if (btn) {
          btn.style.display = isVisible ? '' : 'none';
        }
      });

      // 2. 同步设置弹窗内的 Checkbox 状态
      if (this.modal) {
        TAB_DEFINITIONS.forEach(def => {
          const cb = this.modal.querySelector(`.datax-tab-visible-cb[data-tab-id="${def.id}"]`);
          if (cb) {
            cb.checked = safeTabs.includes(def.id);
          }
        });
      }

      // 3. 检查当前激活态的 Tab 是否被隐藏；若被隐藏，自动切换到第一个可见的 Tab
      const currentActiveTab = localStorage.getItem('datax_panel_active_tab') || '1';
      if (!safeTabs.includes(currentActiveTab)) {
        const firstVisible = safeTabs[0] || '1';
        if (typeof this.options?.activateTab === 'function') {
          this.options.activateTab(firstVisible);
        } else if (typeof window.DataXAssistant?.activateTab === 'function') {
          window.DataXAssistant.activateTab(firstVisible);
        } else {
          const firstBtn = document.getElementById(`datax-tab-btn-${firstVisible}`);
          if (firstBtn) firstBtn.click();
        }
      }

      // 4. 若 Tab 7 变为可见，且尚未挂载实例，支持惰性挂载
      if (safeTabs.includes('7') || safeTabs.includes('8')) {
        if (typeof this.options?.mountTabs === 'function') {
          try { this.options.mountTabs(); } catch (e) {}
        } else if (typeof window.DataXAssistant?.mountTabs === 'function') {
          try { window.DataXAssistant.mountTabs(); } catch (e) {}
        }
      }

      // 5. 若配置了外部联动回调
      if (typeof this.options?.onVisibleTabsChange === 'function') {
        this.options.onVisibleTabsChange(safeTabs);
      }
    }

    /**
     * 绑定选项卡显示与隐藏控制相关事件
     */
    bindTabVisibilityEvents() {
      if (!this.modal) return;

      // 1. 各个 Tab 复选框切换
      this.modal.querySelectorAll('.datax-tab-visible-cb').forEach(cb => {
        cb.onchange = () => {
          const tabId = cb.getAttribute('data-tab-id');
          const isChecked = cb.checked;
          const currentVisible = [...this.visibleTabs];

          if (isChecked) {
            if (!currentVisible.includes(tabId)) {
              currentVisible.push(tabId);
              // 按数字顺序排序保证一致性
              currentVisible.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
            }
          } else {
            // 防呆校验：至少保留 1 个可见选项卡
            if (currentVisible.length <= 1) {
              cb.checked = true;
              alert('为了保证正常操作，至少需要保留一个可见的选项卡！');
              return;
            }
            const idx = currentVisible.indexOf(tabId);
            if (idx !== -1) {
              currentVisible.splice(idx, 1);
            }
          }

          this.applyTabVisibility(currentVisible, true);
        };
      });

      // 2. 全选按钮
      const selectAllBtn = document.getElementById('datax-tab-visibility-all-btn');
      if (selectAllBtn) {
        selectAllBtn.onclick = () => {
          const allTabIds = TAB_DEFINITIONS.map(t => t.id);
          this.applyTabVisibility(allTabIds, true);
        };
      }

      // 3. 恢复默认按钮
      const resetDefaultBtn = document.getElementById('datax-tab-visibility-default-btn');
      if (resetDefaultBtn) {
        resetDefaultBtn.onclick = () => {
          const allTabIds = TAB_DEFINITIONS.map(t => t.id);
          this.applyTabVisibility(allTabIds, true);
        };
      }
    }

    /**
     * 监听当前登录用户切换事件，实现多账号独立配置隔离
     */
    bindAuthWatcher() {
      if (window.DataXAssistant && window.DataXAssistant.EventBus) {
        window.DataXAssistant.EventBus.on('auth:user_changed', () => {
          this.syncRemoteUserVisibleTabs();
        });
      }
    }

    /**
     * 异步从后端数据库拉取当前登录用户的 Tab 显隐偏好，并同步至 DOM 与本地缓存
     */
    async syncRemoteUserVisibleTabs() {
      try {
        const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
        const token = http ? http.getAuthToken() : (localStorage.getItem('datax_assistant_token') || '');
        if (!token) return;

        let res = null;
        if (http && typeof http.fetchJson === 'function') {
          res = await http.fetchJson('/api/user/setting?key=visible_tabs');
        } else {
          const authVal = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
          const resp = await fetch('/api/user/setting?key=visible_tabs', {
            headers: { 'Authorization': authVal }
          });
          if (resp.ok) {
            res = await resp.json();
          }
        }

        if (res && (res.code === 200 || res.code === 0) && res.content) {
          const val = res.content;
          let parsed = null;
          try {
            parsed = JSON.parse(val);
          } catch (e) {
            if (typeof val === 'string' && val.includes(',')) {
              parsed = val.split(',').map(s => s.trim());
            }
          }
          if (Array.isArray(parsed) && parsed.length > 0) {
            const allTabIds = TAB_DEFINITIONS.map(t => t.id);
            const valid = parsed.map(String).filter(id => allTabIds.includes(id));
            if (valid.length > 0) {
              allTabIds.forEach(id => {
                if (!KNOWN_LEGACY_TABS.includes(id) && !valid.includes(id)) {
                  valid.push(id);
                }
              });
              valid.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
              // 应用到 DOM 与内存中，shouldSave = false 避免反向重复写回数据库
              this.applyTabVisibility(valid, false);
              try {
                localStorage.setItem(STORAGE_KEY_VISIBLE_TABS, JSON.stringify(valid));
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        // 静默降级，不阻断前端渲染
      }
    }

    /**
     * 将当前 Tab 显隐状态持久化保存至后端用户记录表 (换机/换浏览器无缝保留)
     *
     * @param {Array<string>} safeTabs 已校验的有效 Tab 标识列表
     */
    async saveRemoteUserVisibleTabs(safeTabs) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
      }
      this.saveTimer = setTimeout(async () => {
        try {
          const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
          const token = http ? http.getAuthToken() : (localStorage.getItem('datax_assistant_token') || '');
          if (!token) return;

          const payload = {
            key: 'visible_tabs',
            value: JSON.stringify(safeTabs)
          };

          if (http && typeof http.fetchJson === 'function') {
            await http.fetchJson('/api/user/setting', {
              method: 'POST',
              body: payload
            });
          } else {
            const authVal = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
            await fetch('/api/user/setting', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Authorization': authVal
              },
              body: JSON.stringify(payload)
            });
          }
        } catch (err) {
          console.warn('[SettingsModal] 保存用户个性化配置至云端失败:', err);
        }
      }, 300);
    }

    bindGlobalFocusWatcher() {
      // 点击工作台内部恢复 100% 透明度，失焦半透明透视
      document.addEventListener('click', (e) => {
        if (!this.panel || this.panel.style.display === 'none') return;

        const hasActiveModal = Boolean(
          document.querySelector('.datax-modal-overlay, .datax-common-overlay, [data-datax-modal], [id^="datax-modal-"]')
        );
        const isInsideModal = Boolean(
          e.target?.closest?.('.datax-modal-overlay, .datax-common-overlay, [data-datax-modal], [id^="datax-modal-"]')
        );
        if (hasActiveModal || isInsideModal) {
          this.setPanelOpacity(1);
          return;
        }

        const badge = document.getElementById('datax-helper-floating-badge');
        const isInsideAssistant = Boolean(
          this.panel.contains(e.target) ||
          (badge && badge.contains(e.target)) ||
          e.target?.closest?.('[id^="datax-"], [class*="datax-"]')
        );

        if (isInsideAssistant) {
          this.setPanelOpacity(1);
        } else {
          this.setPanelOpacity(this.currentInactiveOpacity);
        }
      }, true);

      if (this.panel) {
        this.panel.addEventListener('mousedown', () => {
          this.setPanelOpacity(1);
        });
      }
    }
  }

  window.DataXAssistant.SettingsModal = SettingsModal;
})();
