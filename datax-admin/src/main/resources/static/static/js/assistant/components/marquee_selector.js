/**
 * @fileoverview 通用表格鼠标拖拽矩形框选引擎 (MarqueeSelector)
 * 采用 AABB (Axis-Aligned Bounding Box) 空间碰撞检测算法，
 * 支持边缘感应平滑自动滚动 (Edge Auto-Scroll)、滚轮穿透、Alt/Ctrl/Shift 组合操作与防误触拦截。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  /**
   * 判定当前用户是否正在进行文本选区操作
   *
   * @return {boolean}
   */
  function isUserSelectingText() {
    const sel = window.getSelection ? window.getSelection() : null;
    return Boolean(sel && sel.toString().trim().length > 0);
  }

  class MarqueeSelector {
    /**
     * @param {Object} options 配置项
     * @param {HTMLElement} options.container 滚动容器 DOM 元素
     * @param {string} options.rowSelector 表格数据行选择器 (例如 '.datax-job-table-row')
     * @param {string} [options.checkboxSelector] 行复选框选择器 (例如 '.datax-job-item-cb')
     * @param {Function} options.getIdFromRow 从行 DOM 提取唯一标识 (row => id/index)
     * @param {Set} options.selectedSet 保存选中项唯一标识的 Set
     * @param {Function} [options.onSelectionChange] 选中态改变回调 ({ selectedSet, isDragging })
     * @param {string} [options.selectedBg='#e6f7ff'] 选中行高亮背景
     * @param {string} [options.selectionBoxId] 选框 DOM 元素 ID
     * @param {Function} [options.canStartSelection] 判定是否允许发起框选 (e => boolean)
     */
    constructor(options) {
      this.options = options;
      this.container = options.container;
      this.selectedSet = options.selectedSet || new Set();
      this.selectedBg = options.selectedBg || '#e6f7ff';

      this.isMarquee = false;
      this.marqueeStartX = 0;
      this.marqueeStartY = 0;
      this.marqueeInitialSelected = new Set();
      this.marqueeDraggedDistance = 0;
      this.lastClientX = 0;
      this.lastClientY = 0;
      this.scrollVelocityY = 0;
      this.autoScrollRafId = null;

      this.init();
    }

    init() {
      if (!this.container) return;

      if (getComputedStyle(this.container).position === 'static') {
        this.container.style.position = 'relative';
      }

      const boxId = this.options.selectionBoxId || `${this.container.id || 'marquee'}-selection-box`;
      let marqueeBox = document.getElementById(boxId);
      if (!marqueeBox) {
        marqueeBox = document.createElement('div');
        marqueeBox.id = boxId;
        marqueeBox.style.cssText = 'position: absolute; border: 1.5px dashed #1890ff; background-color: rgba(24, 144, 255, 0.12); pointer-events: none; z-index: 1000; display: none;';
        this.container.appendChild(marqueeBox);
      }
      this.marqueeBox = marqueeBox;

      this.bindEvents();
      this.syncRowHighlight();
    }

    syncRowHighlight() {
      if (!this.container) return;
      const rows = this.container.querySelectorAll(this.options.rowSelector);
      rows.forEach(row => {
        const id = this.options.getIdFromRow(row);
        if (id === null || id === undefined || (typeof id === 'number' && isNaN(id))) return;

        if (!row.hasAttribute('data-orig-bg')) {
          row.setAttribute('data-orig-bg', row.style.backgroundColor || row.style.background || '');
        }

        const isSel = this.selectedSet.has(id);
        const origBg = row.getAttribute('data-orig-bg') || '';
        row.style.background = isSel ? this.selectedBg : origBg;
        if (isSel) {
          row.setAttribute('data-selected', 'true');
        } else {
          row.removeAttribute('data-selected');
        }

        if (this.options.checkboxSelector) {
          const cb = row.querySelector(this.options.checkboxSelector);
          if (cb && cb.checked !== isSel) {
            cb.checked = isSel;
          }
        }
      });
    }

    getContentBounds() {
      const tableEl = this.container.querySelector('table');
      let width = this.container.clientWidth;
      let height = this.container.clientHeight;

      if (tableEl) {
        width = Math.max(this.container.clientWidth, tableEl.offsetWidth);
        height = Math.max(this.container.clientHeight, tableEl.offsetTop + tableEl.offsetHeight);
      } else {
        const rows = this.container.querySelectorAll(this.options.rowSelector);
        if (rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          height = Math.max(this.container.clientHeight, lastRow.offsetTop + lastRow.offsetHeight);
        }
      }

      const maxScrollTop = Math.max(0, height - this.container.clientHeight);
      return { width, height, maxScrollTop };
    }

    updateMarqueeBoxAndCollision(clientX, clientY, isCtrlOrMeta) {
      if (!this.isMarquee || !this.container) return;

      const rect = this.container.getBoundingClientRect();
      const bounds = this.getContentBounds();

      const rawCurrX = clientX - rect.left + this.container.scrollLeft;
      const rawCurrY = clientY - rect.top + this.container.scrollTop;
      const currX = Math.max(0, Math.min(bounds.width, rawCurrX));
      const currY = Math.max(0, Math.min(bounds.height, rawCurrY));

      const deltaX = currX - this.marqueeStartX;
      const deltaY = currY - this.marqueeStartY;
      this.marqueeDraggedDistance = Math.hypot(deltaX, deltaY);

      if (this.marqueeDraggedDistance > 4) {
        this.marqueeBox.style.display = 'block';
        document.body.style.userSelect = 'none';

        const boxLeft = Math.max(0, Math.min(this.marqueeStartX, currX));
        const boxTop = Math.max(0, Math.min(this.marqueeStartY, currY));
        const boxRight = Math.min(bounds.width, Math.max(this.marqueeStartX, currX));
        const boxBottom = Math.min(bounds.height, Math.max(this.marqueeStartY, currY));
        const boxWidth = Math.max(0, boxRight - boxLeft);
        const boxHeight = Math.max(0, boxBottom - boxTop);

        this.marqueeBox.style.left = `${boxLeft}px`;
        this.marqueeBox.style.top = `${boxTop}px`;
        this.marqueeBox.style.width = `${boxWidth}px`;
        this.marqueeBox.style.height = `${boxHeight}px`;

        const rows = this.container.querySelectorAll(this.options.rowSelector);
        rows.forEach(row => {
          const id = this.options.getIdFromRow(row);
          if (id === null || id === undefined || (typeof id === 'number' && isNaN(id))) return;

          const rTop = row.offsetTop;
          const rBottom = rTop + row.offsetHeight;
          const rLeft = row.offsetLeft;
          const rRight = rLeft + row.offsetWidth;

          const isIntersect = !(boxRight < rLeft || boxLeft > rRight || boxBottom < rTop || boxTop > rBottom);

          if (isCtrlOrMeta) {
            if (isIntersect) {
              if (this.marqueeInitialSelected.has(id)) {
                this.selectedSet.delete(id);
              } else {
                this.selectedSet.add(id);
              }
            } else {
              if (this.marqueeInitialSelected.has(id)) {
                this.selectedSet.add(id);
              } else {
                this.selectedSet.delete(id);
              }
            }
          } else {
            if (isIntersect) {
              this.selectedSet.add(id);
            } else {
              if (!this.marqueeInitialSelected.has(id)) {
                this.selectedSet.delete(id);
              }
            }
          }
        });

        this.syncRowHighlight();
        if (typeof this.options.onSelectionChange === 'function') {
          this.options.onSelectionChange({ selectedSet: this.selectedSet, isDragging: true });
        }
      }
    }

    startAutoScrollLoop(isCtrlOrMeta) {
      if (this.autoScrollRafId !== null) return;

      const autoScrollStep = () => {
        if (!this.isMarquee) {
          this.autoScrollRafId = null;
          return;
        }

        if (this.scrollVelocityY !== 0 && this.container) {
          const bounds = this.getContentBounds();
          const prevScrollTop = this.container.scrollTop;

          if (this.scrollVelocityY > 0) {
            if (this.container.scrollTop >= bounds.maxScrollTop) {
              this.container.scrollTop = bounds.maxScrollTop;
              this.scrollVelocityY = 0;
            } else {
              this.container.scrollTop = Math.min(bounds.maxScrollTop, this.container.scrollTop + this.scrollVelocityY);
            }
          } else if (this.scrollVelocityY < 0) {
            if (this.container.scrollTop <= 0) {
              this.container.scrollTop = 0;
              this.scrollVelocityY = 0;
            } else {
              this.container.scrollTop = Math.max(0, this.container.scrollTop + this.scrollVelocityY);
            }
          }

          if (this.container.scrollTop !== prevScrollTop) {
            this.updateMarqueeBoxAndCollision(this.lastClientX, this.lastClientY, isCtrlOrMeta);
          }
        }

        this.autoScrollRafId = requestAnimationFrame(autoScrollStep);
      };

      this.autoScrollRafId = requestAnimationFrame(autoScrollStep);
    }

    stopAutoScrollLoop() {
      if (this.autoScrollRafId !== null) {
        cancelAnimationFrame(this.autoScrollRafId);
        this.autoScrollRafId = null;
      }
      this.scrollVelocityY = 0;
    }

    bindEvents() {
      this.onMouseDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, select, textarea, a, .datax-cell-long-text, [data-prevent-marquee]')) {
          return;
        }
        if (e.target.tagName === 'INPUT' && !e.altKey) {
          return;
        }
        if (typeof this.options.canStartSelection === 'function') {
          if (!this.options.canStartSelection(e)) return;
        }

        const rect = this.container.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          return;
        }

        const isAltKey = Boolean(e.altKey);
        const isBlankOrTriggerZone = Boolean(
          e.target === this.container ||
          e.target.tagName === 'TBODY' ||
          e.target.tagName === 'TABLE' ||
          e.target.closest('td:first-child, th, .datax-marquee-trigger, [data-marquee-trigger]') !== null
        );

        if (!isAltKey && !isBlankOrTriggerZone) {
          return;
        }

        const bounds = this.getContentBounds();
        this.isMarquee = true;
        this.marqueeDraggedDistance = 0;
        this.scrollVelocityY = 0;
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        this.marqueeStartX = Math.max(0, Math.min(bounds.width, e.clientX - rect.left + this.container.scrollLeft));
        this.marqueeStartY = Math.max(0, Math.min(bounds.height, e.clientY - rect.top + this.container.scrollTop));

        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          this.marqueeInitialSelected = new Set(this.selectedSet);
        } else {
          this.marqueeInitialSelected = new Set();
        }
      };

      this.onMouseMove = (e) => {
        if (!this.isMarquee) return;

        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        const isCtrlOrMeta = Boolean(e.ctrlKey || e.metaKey);

        const rect = this.container.getBoundingClientRect();
        const bounds = this.getContentBounds();
        const edgeThreshold = 45;

        if (e.clientY > rect.bottom - edgeThreshold) {
          if (this.container.scrollTop >= bounds.maxScrollTop) {
            this.scrollVelocityY = 0;
          } else {
            const overflow = Math.max(1, e.clientY - (rect.bottom - edgeThreshold));
            this.scrollVelocityY = Math.min(24, Math.round(overflow * 0.4) + 6);
          }
        } else if (e.clientY < rect.top + edgeThreshold) {
          if (this.container.scrollTop <= 0) {
            this.scrollVelocityY = 0;
          } else {
            const overflow = Math.max(1, (rect.top + edgeThreshold) - e.clientY);
            this.scrollVelocityY = -Math.min(24, Math.round(overflow * 0.4) + 6);
          }
        } else {
          this.scrollVelocityY = 0;
        }

        if (!isCtrlOrMeta && !e.shiftKey && this.marqueeDraggedDistance <= 6 && Math.hypot(e.clientX - (rect.left + this.marqueeStartX - this.container.scrollLeft), e.clientY - (rect.top + this.marqueeStartY - this.container.scrollTop)) > 4) {
          this.selectedSet.clear();
        }

        this.updateMarqueeBoxAndCollision(e.clientX, e.clientY, isCtrlOrMeta);
        this.startAutoScrollLoop(isCtrlOrMeta);
      };

      this.onMouseUp = () => {
        if (!this.isMarquee) return;
        this.isMarquee = false;
        this.stopAutoScrollLoop();
        if (this.marqueeBox) this.marqueeBox.style.display = 'none';
        document.body.style.userSelect = '';

        if (this.marqueeDraggedDistance > 4 && typeof this.options.onSelectionChange === 'function') {
          this.options.onSelectionChange({ selectedSet: this.selectedSet, isDragging: false });
        }
      };

      this.onWheel = () => {
        if (this.isMarquee) {
          setTimeout(() => {
            this.updateMarqueeBoxAndCollision(this.lastClientX, this.lastClientY, false);
          }, 16);
        }
      };

      this.onClickCapture = (e) => {
        if (this.marqueeDraggedDistance > 6) {
          e.stopPropagation();
          e.preventDefault();
          this.marqueeDraggedDistance = 0;
        }
      };

      this.onKeyDown = (e) => {
        if (e.altKey && this.container) {
          this.container.style.cursor = 'crosshair';
        }
      };

      this.onKeyUp = (e) => {
        if (!e.altKey && this.container) {
          this.container.style.cursor = '';
        }
      };

      this.container.addEventListener('mousedown', this.onMouseDown);
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
      this.container.addEventListener('click', this.onClickCapture, true);
      this.container.addEventListener('wheel', this.onWheel, { passive: true });
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
    }

    destroy() {
      this.stopAutoScrollLoop();
      if (this.container) {
        this.container.removeEventListener('mousedown', this.onMouseDown);
        this.container.removeEventListener('click', this.onClickCapture, true);
        this.container.removeEventListener('wheel', this.onWheel);
        this.container.style.cursor = '';
      }
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      if (this.marqueeBox) {
        this.marqueeBox.style.display = 'none';
      }
    }

    /**
     * 兼容旧版 cleanup 接口，安全注销监听与还原 DOM
     */
    cleanup() {
      this.destroy();
    }

    /**
     * 获取当前已选中的标识集合
     *
     * @return {Set}
     */
    getSelectedSet() {
      return this.selectedSet;
    }

    /**
     * 静态工厂方法：快捷绑定通用矩形框选引擎
     *
     * @param {Object} options 配置项
     * @return {MarqueeSelector} 框选引擎实例
     */
    static bindMarqueeSelection(options) {
      return new MarqueeSelector(options);
    }
  }

  window.DataXAssistant.MarqueeSelector = MarqueeSelector;
  window.DataXAssistant.bindMarqueeSelection = function (options) {
    return new MarqueeSelector(options);
  };
  window.DataXAssistant.isUserSelectingText = isUserSelectingText;
})();
