/**
 * @fileoverview 智能助手全局发布订阅事件总线 (EventBus)
 * 解耦跨 Tab、工具栏与交互组件之间的通信依赖，支持单向数据流通知。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  class EventBus {
    constructor() {
      /** @private @type {Map<string, Set<Function>>} */
      this.listeners = new Map();
    }

    /**
     * 注册事件监听器
     *
     * @param {string} event 事件名称
     * @param {Function} handler 处理回调函数
     */
    on(event, handler) {
      if (!event || typeof handler !== 'function') return;
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(handler);
    }

    /**
     * 注册单次执行的事件监听器
     *
     * @param {string} event 事件名称
     * @param {Function} handler 处理回调函数
     */
    once(event, handler) {
      if (!event || typeof handler !== 'function') return;
      const onceWrapper = (...args) => {
        this.off(event, onceWrapper);
        handler(...args);
      };
      this.on(event, onceWrapper);
    }

    /**
     * 移除事件监听器
     *
     * @param {string} event 事件名称
     * @param {Function} [handler] 指定解绑的回调函数；若不传则解绑该事件下的所有监听
     */
    off(event, handler) {
      if (!this.listeners.has(event)) return;
      if (!handler) {
        this.listeners.delete(event);
        return;
      }
      const handlers = this.listeners.get(event);
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }

    /**
     * 派发事件通知
     *
     * @param {string} event 事件名称
     * @param {...*} args 传递给监听器的参数列表
     */
    emit(event, ...args) {
      if (!this.listeners.has(event)) return;
      const handlers = Array.from(this.listeners.get(event));
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (err) {
          console.error(`[EventBus] 事件处理异常 [${event}]:`, err);
        }
      }
    }

    /**
     * 清空所有事件监听
     */
    clear() {
      this.listeners.clear();
    }
  }

  window.DataXAssistant.EventBus = new EventBus();
})();
