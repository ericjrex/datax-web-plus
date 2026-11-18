/**
 * @fileoverview 智能助手窗口交互管理器 (PanelWindowManager)
 * 提供窗口平滑拖拽移动、8方向全向缩放拉伸、最大化/还原以及位置尺寸持久化记忆。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  const STORAGE_KEY_PANEL_POS = 'datax_assistant_panel_pos';
  const STORAGE_KEY_PANEL_SIZE = 'datax_assistant_panel_size';

  class PanelWindowManager {
    /**
     * @param {HTMLElement} panel 目标窗口 DOM 元素
     * @param {HTMLElement} header 标题栏手柄元素
     * @param {Object} [options={}] 配置项
     * @param {HTMLElement} [options.maxBtn] 最大化按钮元素
     * @param {number} [options.minWidth=560] 最小宽度限制
     * @param {number} [options.minHeight=380] 最小高度限制
     * @param {string} [options.storageKeyPos] 位置存储键名
     * @param {string} [options.storageKeySize] 尺寸存储键名
     */
    constructor(panel, header, options = {}) {
      this.panel = panel;
      this.header = header;
      this.maxBtn = options.maxBtn || null;
      this.minWidth = options.minWidth || 560;
      this.minHeight = options.minHeight || 380;
      this.storageKeyPos = options.storageKeyPos || STORAGE_KEY_PANEL_POS;
      this.storageKeySize = options.storageKeySize || STORAGE_KEY_PANEL_SIZE;

      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartY = 0;
      this.panelStartLeft = 0;
      this.panelStartTop = 0;

      this.isMaximized = false;
      this.preMaxState = null;

      this.activeDir = null;
      this.resizeStartX = 0;
      this.resizeStartY = 0;
      this.startW = 0;
      this.startH = 0;
      this.startLeft = 0;
      this.startTop = 0;

      this.init();
    }

    init() {
      if (!this.panel) return;
      this.restoreBounds();
      this.bindDrag();
      this.bindMaximize();
      this.bindAllDirectionResize();
    }

    /**
     * 恢复已保存的几何尺寸与屏幕坐标
     */
    restoreBounds() {
      try {
        const rawPos = localStorage.getItem(this.storageKeyPos);
        if (rawPos) {
          const pos = JSON.parse(rawPos);
          if (typeof pos.top === 'number' && typeof pos.left === 'number') {
            const maxLeft = window.innerWidth - 80;
            const minLeft = -(this.panel.offsetWidth - 100);
            const maxTop = window.innerHeight - 40;
            const top = Math.max(0, Math.min(pos.top, maxTop));
            const left = Math.max(minLeft, Math.min(pos.left, maxLeft));
            this.panel.style.top = `${top}px`;
            this.panel.style.left = `${left}px`;
            this.panel.style.right = 'auto';
            this.panel.style.bottom = 'auto';
          }
        }

        const rawSize = localStorage.getItem(this.storageKeySize);
        if (rawSize) {
          const size = JSON.parse(rawSize);
          if (typeof size.width === 'number' && size.width >= this.minWidth) {
            this.panel.style.width = `${Math.min(window.innerWidth - 20, size.width)}px`;
          }
          if (typeof size.height === 'number' && size.height >= this.minHeight) {
            this.panel.style.height = `${Math.min(window.innerHeight - 20, size.height)}px`;
          }
        }
      } catch (e) {
        console.warn('[WindowManager] 恢复面板尺寸位置异常:', e);
      }
    }

    /**
     * 绑定标题栏拖拽移动
     */
    bindDrag() {
      if (!this.header) return;

      this.onHeaderMouseDown = (e) => {
        if (e.target.closest('#datax-panel-min, #datax-panel-max, #datax-panel-close, #datax-panel-settings-btn, button, input, select, textarea, a, label, [data-window-ctrl]')) {
          return;
        }
        if (this.isMaximized) return;

        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        const rect = this.panel.getBoundingClientRect();
        this.panelStartLeft = rect.left;
        this.panelStartTop = rect.top;

        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
        this.panel.style.left = `${this.panelStartLeft}px`;
        this.panel.style.top = `${this.panelStartTop}px`;

        document.body.style.userSelect = 'none';
      };

      this.onDocMouseMove = (e) => {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;

        let newLeft = this.panelStartLeft + deltaX;
        let newTop = this.panelStartTop + deltaY;

        const maxLeft = window.innerWidth - 80;
        const minLeft = -(this.panel.offsetWidth - 100);
        const maxTop = window.innerHeight - 40;
        const minTop = 0;

        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        newTop = Math.max(minTop, Math.min(newTop, maxTop));

        this.panel.style.left = `${newLeft}px`;
        this.panel.style.top = `${newTop}px`;
      };

      this.onDocMouseUp = () => {
        if (this.isDragging) {
          this.isDragging = false;
          document.body.style.userSelect = '';
          const rect = this.panel.getBoundingClientRect();
          try {
            localStorage.setItem(this.storageKeyPos, JSON.stringify({
              top: Math.round(rect.top),
              left: Math.round(rect.left)
            }));
          } catch (e) {}
        }
      };

      this.header.addEventListener('mousedown', this.onHeaderMouseDown);
      document.addEventListener('mousemove', this.onDocMouseMove);
      document.addEventListener('mouseup', this.onDocMouseUp);
    }

    /**
     * 绑定最大化与还原
     */
    bindMaximize() {
      this.toggleMaximize = () => {
        if (!this.isMaximized) {
          this.preMaxState = {
            top: this.panel.style.top,
            left: this.panel.style.left,
            right: this.panel.style.right,
            width: this.panel.style.width,
            height: this.panel.style.height,
            borderRadius: this.panel.style.borderRadius
          };

          this.panel.style.top = '10px';
          this.panel.style.left = '10px';
          this.panel.style.right = 'auto';
          this.panel.style.bottom = 'auto';
          this.panel.style.width = 'calc(100vw - 20px)';
          this.panel.style.height = 'calc(100vh - 20px)';
          this.panel.style.maxWidth = '100vw';
          this.panel.style.maxHeight = '100vh';
          this.panel.style.borderRadius = '6px';
          this.isMaximized = true;
          if (this.maxBtn) {
            this.maxBtn.innerHTML = '&#x25A3;';
            this.maxBtn.title = '还原窗口';
          }
        } else {
          if (this.preMaxState) {
            this.panel.style.top = this.preMaxState.top;
            this.panel.style.left = this.preMaxState.left;
            this.panel.style.right = this.preMaxState.right;
            this.panel.style.width = this.preMaxState.width;
            this.panel.style.height = this.preMaxState.height;
            this.panel.style.maxWidth = '98vw';
            this.panel.style.maxHeight = '96vh';
            this.panel.style.borderRadius = this.preMaxState.borderRadius || '10px';
          }
          this.isMaximized = false;
          if (this.maxBtn) {
            this.maxBtn.innerHTML = '&#x25A2;';
            this.maxBtn.title = '最大化窗口';
          }
        }
      };

      if (this.maxBtn) {
        this.maxBtn.onclick = (e) => {
          e.stopPropagation();
          this.toggleMaximize();
        };
      }

      if (this.header) {
        this.header.ondblclick = (e) => {
          if (e.target.closest('#datax-panel-min, #datax-panel-max, #datax-panel-close, #datax-panel-settings-btn, button, input, select, textarea, a, label, [data-window-ctrl]')) {
            return;
          }
          this.toggleMaximize();
        };
      }
    }

    /**
     * 绑定 8 方向全向缩放手柄
     */
    bindAllDirectionResize() {
      const handles = this.panel.querySelectorAll('.datax-resize-handle');
      if (!handles || handles.length === 0) return;

      handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
          if (this.isMaximized) return;

          this.activeDir = handle.getAttribute('data-dir');
          if (!this.activeDir) return;

          this.resizeStartX = e.clientX;
          this.resizeStartY = e.clientY;
          this.startW = this.panel.offsetWidth;
          this.startH = this.panel.offsetHeight;

          const rect = this.panel.getBoundingClientRect();
          this.startLeft = rect.left;
          this.startTop = rect.top;

          this.panel.style.right = 'auto';
          this.panel.style.bottom = 'auto';
          this.panel.style.left = `${this.startLeft}px`;
          this.panel.style.top = `${this.startTop}px`;

          document.body.style.userSelect = 'none';
          e.stopPropagation();
          e.preventDefault();
        });
      });

      this.onResizeMouseMove = (e) => {
        if (!this.activeDir) return;

        const deltaX = e.clientX - this.resizeStartX;
        const deltaY = e.clientY - this.resizeStartY;

        const maxViewportW = window.innerWidth - 10;
        const maxViewportH = window.innerHeight - 10;

        let newWidth = this.startW;
        let newHeight = this.startH;
        let newLeft = this.startLeft;
        let newTop = this.startTop;

        if (this.activeDir.includes('e')) {
          newWidth = Math.max(this.minWidth, Math.min(maxViewportW - this.startLeft, this.startW + deltaX));
        } else if (this.activeDir.includes('w')) {
          const candidateWidth = this.startW - deltaX;
          if (candidateWidth >= this.minWidth) {
            newWidth = Math.min(this.startLeft + this.startW, candidateWidth);
            newLeft = this.startLeft + (this.startW - newWidth);
          } else {
            newWidth = this.minWidth;
            newLeft = this.startLeft + this.startW - this.minWidth;
          }
          newLeft = Math.max(0, newLeft);
        }

        if (this.activeDir.includes('s')) {
          newHeight = Math.max(this.minHeight, Math.min(maxViewportH - this.startTop, this.startH + deltaY));
        } else if (this.activeDir.includes('n')) {
          const candidateHeight = this.startH - deltaY;
          if (candidateHeight >= this.minHeight) {
            newHeight = Math.min(this.startTop + this.startH, candidateHeight);
            newTop = this.startTop + (this.startH - newHeight);
          } else {
            newHeight = this.minHeight;
            newTop = this.startTop + this.startH - this.minHeight;
          }
          newTop = Math.max(0, newTop);
        }

        this.panel.style.width = `${Math.round(newWidth)}px`;
        this.panel.style.height = `${Math.round(newHeight)}px`;
        this.panel.style.left = `${Math.round(newLeft)}px`;
        this.panel.style.top = `${Math.round(newTop)}px`;
      };

      this.onResizeMouseUp = () => {
        if (this.activeDir) {
          this.activeDir = null;
          document.body.style.userSelect = '';
          const rect = this.panel.getBoundingClientRect();
          try {
            localStorage.setItem(this.storageKeySize, JSON.stringify({
              width: Math.round(this.panel.offsetWidth),
              height: Math.round(this.panel.offsetHeight)
            }));
            localStorage.setItem(this.storageKeyPos, JSON.stringify({
              left: Math.round(rect.left),
              top: Math.round(rect.top)
            }));
          } catch (e) {}
        }
      };

      document.addEventListener('mousemove', this.onResizeMouseMove);
      document.addEventListener('mouseup', this.onResizeMouseUp);
    }

    destroy() {
      if (this.header) {
        this.header.removeEventListener('mousedown', this.onHeaderMouseDown);
      }
      document.removeEventListener('mousemove', this.onDocMouseMove);
      document.removeEventListener('mouseup', this.onDocMouseUp);
      document.removeEventListener('mousemove', this.onResizeMouseMove);
      document.removeEventListener('mouseup', this.onResizeMouseUp);
    }
  }

  window.DataXAssistant.PanelWindowManager = PanelWindowManager;
})();
