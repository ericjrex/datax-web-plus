/**
 * @fileoverview Tab 2: 目标表前后缀规则同步面板 (Tab2Mapping)
 * 收集批量前后缀与字符替换规则，并通过 EventBus 一键同步到原生步骤 3 工具栏。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};
  window.DataXAssistant.Tabs = window.DataXAssistant.Tabs || {};

  class Tab2Mapping {
    constructor(container) {
      this.container = container;
    }

    init() {
      this.bindEvents();
    }

    getRules() {
      const prefix = document.getElementById('datax-rule-prefix')?.value || '';
      const suffix = document.getElementById('datax-rule-suffix')?.value || '';
      const replaceFrom = document.getElementById('datax-rule-replace-from')?.value || '';
      const replaceTo = document.getElementById('datax-rule-replace-to')?.value || '';
      const caseType = document.getElementById('datax-rule-case')?.value || 'ORIGINAL';
      return { prefix, suffix, replaceFrom, replaceTo, caseType };
    }

    bindEvents() {
      const syncBtn = document.getElementById('datax-btn-sync-to-step3');
      if (syncBtn) {
        syncBtn.onclick = () => {
          const rules = this.getRules();
          if (window.DataXAssistant.EventBus) {
            window.DataXAssistant.EventBus.emit('step3:sync_rules', rules);
          } else if (window.DataXAssistant.NativeToolbar?.applyPrefixSuffixToNativeStep3) {
            const p = document.getElementById('datax-native-prefix');
            const s = document.getElementById('datax-native-suffix');
            const rf = document.getElementById('datax-native-replace-from');
            const rt = document.getElementById('datax-native-replace-to');
            const c = document.getElementById('datax-native-case');
            if (p) p.value = rules.prefix;
            if (s) s.value = rules.suffix;
            if (rf) rf.value = rules.replaceFrom;
            if (rt) rt.value = rules.replaceTo;
            if (c) c.value = rules.caseType;
            window.DataXAssistant.NativeToolbar.applyPrefixSuffixToNativeStep3();
          }
        };
      }
    }
  }

  window.DataXAssistant.Tabs.Tab2 = Tab2Mapping;
  window.DataXAssistant.Tabs.Tab2Class = Tab2Mapping;
})();
