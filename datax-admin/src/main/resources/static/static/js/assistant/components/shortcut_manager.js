/**
 * @fileoverview 智能助手全局快捷键调度管理器 (ShortcutManager)
 * 统一管理智能助手全局快捷键分发：
 * 1. Alt + ` (反引号): 快速展开 / 收起智能助手面板 (数字 1 左侧，高效防冲突)
 * 2. Escape: 当智能助手打开且无顶层阻断弹窗时，快速收起面板
 * 3. Alt + 1~9: 快速切换至对应选项卡 (Tab 1 ~ Tab 6 及后续动态新增 Tab)
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  class ShortcutManager {
    /**
     * @param {Object} options 快捷键调度配置项
     * @param {Function} options.togglePanel 切换助手面板展开/收起回调
     * @param {Function} options.closePanel 关闭助手面板回调
     * @param {Function} options.switchTab 切换指定 Tab 回调，入参为 tab 编号(1, 2, ...)
     * @param {Function} options.isPanelVisible 判断面板当前是否处于显示状态的回调
     * @param {Function} [options.canCloseOnEsc] 判断按 Esc 时是否允许关闭主面板的回调
     */
    constructor(options = {}) {
      this.togglePanel = options.togglePanel || (() => {});
      this.closePanel = options.closePanel || (() => {});
      this.switchTab = options.switchTab || (() => false);
      this.isPanelVisible = options.isPanelVisible || (() => false);
      this.canCloseOnEsc = options.canCloseOnEsc || (() => true);

      this.boundOnKeyDown = this.onKeyDown.bind(this);
      this.init();
    }

    /**
     * 注册全局键盘事件监听
     */
    init() {
      window.addEventListener('keydown', this.boundOnKeyDown, true);
    }

    /**
     * 全局按键事件处理
     * @param {KeyboardEvent} e 键盘事件对象
     */
    onKeyDown(e) {
      // 过滤长按连续触发，避免按键抖动
      if (e.repeat) return;

      const key = e.key;

      // 1. 按 Escape: 如果助手处于展开状态，统一由本管理器裁决 ——
      //    有顶层子弹窗时优先关子窗 (canCloseOnEsc 内部处理并返回 false)，否则收起面板。
      //    一律 stopPropagation，防止下游重复处理导致“一次 Esc 连关多个窗口”。
      if (key === 'Escape' && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        if (this.isPanelVisible()) {
          e.preventDefault();
          e.stopPropagation();
          if (this.canCloseOnEsc()) {
            this.closePanel();
          }
        }
        return;
      }

      // 2. 组合键：需要精准匹配 Alt 键，且排除 Ctrl / Meta 等系统冲突组合
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        // 2.1 打开或收起智能助手：快捷键 Alt + ` (反引号，位于数字 1 键左侧，无冲突且极易单手呼出)
        const isToggleKey = (
          e.code === 'Backquote' || key === '`' || key === '~' || key === '·'
        );
        if (isToggleKey) {
          e.preventDefault();
          e.stopPropagation();
          this.togglePanel();
          return;
        }

        // 2.2 Alt + 1 ~ 9: 快速切换 Tab (Tab 1 ~ Tab 6 及后续动态新增 Tab)
        // 兼容主键盘数字与小键盘数字
        let tabNum = null;
        if (/^[1-9]$/.test(key)) {
          tabNum = parseInt(key, 10);
        } else if (e.code && /^Digit([1-9])$/.test(e.code)) {
          tabNum = parseInt(e.code.replace('Digit', ''), 10);
        } else if (e.code && /^Numpad([1-9])$/.test(e.code)) {
          tabNum = parseInt(e.code.replace('Numpad', ''), 10);
        }

        if (tabNum !== null) {
          const switched = this.switchTab(tabNum);
          if (switched) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    }

    /**
     * 注销并释放全局事件监听
     */
    destroy() {
      window.removeEventListener('keydown', this.boundOnKeyDown, true);
    }
  }

  window.DataXAssistant.ShortcutManager = ShortcutManager;
})();
