/**
 * @fileoverview DataX Web 通用公共基础设施组件库
 * 提供统一通知弹窗、鉴权网络请求、通用手势交互与实用工具。
 *
 * @author ypc
 * @version 1.1.0
 */

(function () {
  'use strict';

  if (window.DataXCommon) return;

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  // ==========================
  // 工具函数 (Utils)
  // ==========================
  const Utils = {
    safeEscapeHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, (m) => ESCAPE_MAP[m]);
    },

    async copyToClipboard(text) {
      if (!text) return false;

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {}
      }

      // 降级方案：隐藏文本域选区复制
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    },

    loadScript(url, callback) {
      if (document.querySelector(`script[src="${url}"]`)) {
        callback?.(null);
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.onload = () => callback?.(null);
      script.onerror = (err) => callback?.(err);
      document.head.appendChild(script);
    },

    loadSheetJs(callback) {
      if (window.XLSX) {
        callback(window.XLSX);
        return;
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
        Utils.loadScript(cdnUrls[idx++], (err) => (!err && window.XLSX ? callback(window.XLSX) : next()));
      };
      next();
    },

    isUserLoggedIn() {
      const hash = window.location.hash?.toLowerCase() ?? '';
      const path = window.location.pathname?.toLowerCase() ?? '';
      if (hash.includes('login') || path.includes('login')) return false;
      if (document.querySelector('.login-container, form.login-form')) return false;

      const token = Http.getAuthToken();
      return Boolean(token && token !== 'undefined' && token !== 'null');
    },

    parseDbNameFromUrl(jdbcUrl) {
      if (!jdbcUrl) return '';
      try {
        const clean = jdbcUrl.split('?')[0];
        const lastSlash = clean.lastIndexOf('/');
        if (lastSlash > 0 && lastSlash < clean.length - 1) {
          return clean.substring(lastSlash + 1);
        }
      } catch (e) {}
      return '';
    },

    getDatasourceListFromMemory() {
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
  };

  // ==========================
  // HTTP & 凭据管理 (Http)
  // ==========================
  const Http = {
    cleanToken(raw) {
      if (!raw || typeof raw !== 'string') return '';
      let t = raw.trim();
      if (t === 'null' || t === 'undefined') return '';
      if (t.includes('%')) {
        try {
          t = decodeURIComponent(t);
        } catch (e) {}
      }
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        t = t.slice(1, -1).trim();
      }
      if (/^bearer\s+/i.test(t)) {
        t = t.replace(/^bearer\s+/i, '').trim();
      } else if (/^bearer%20/i.test(t)) {
        t = t.replace(/^bearer%20/i, '').trim();
      }
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        t = t.slice(1, -1).trim();
      }
      return t;
    },

    isTokenValid(token) {
      if (!token || typeof token !== 'string') return false;
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(base64);
        const payload = JSON.parse(json);
        if (payload && payload.exp && typeof payload.exp === 'number') {
          return (payload.exp * 1000) > Date.now();
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    getAuthToken() {
      try {
        // 1. 最高权威优先级: 原生系统的 Cookie (Admin-Token)
        const cookieMatch = document.cookie.match(/(?:^|;\s*)(?:Admin-Token|token|datax_token)=([^;]*)/i);
        if (cookieMatch?.[1]) {
          const cleaned = Http.cleanToken(cookieMatch[1]);
          if (cleaned) return cleaned;
        }

        // 2. 次优先级: Storage 备选 (sessionStorage / localStorage)
        const direct = sessionStorage.getItem('Admin-Token')
          ?? localStorage.getItem('Admin-Token')
          ?? sessionStorage.getItem('datax_web_token')
          ?? localStorage.getItem('datax_web_token');
        const cleanedDirect = Http.cleanToken(direct);
        if (cleanedDirect && Http.isTokenValid(cleanedDirect)) {
          return cleanedDirect;
        }

        const vuex = JSON.parse(sessionStorage.getItem('vuex') ?? localStorage.getItem('vuex') ?? '{}');
        const vuexToken = Http.cleanToken(vuex?.user?.token);
        if (vuexToken && Http.isTokenValid(vuexToken)) {
          return vuexToken;
        }

        // 3. 遍历探查合规三段式 JWT 令牌
        for (let i = 0; i < sessionStorage.length; i++) {
          const val = Http.cleanToken(sessionStorage.getItem(sessionStorage.key(i)));
          if (val && val.split('.').length === 3 && val.length > 30 && Http.isTokenValid(val)) {
            return val;
          }
        }
        for (let i = 0; i < localStorage.length; i++) {
          const val = Http.cleanToken(localStorage.getItem(localStorage.key(i)));
          if (val && val.split('.').length === 3 && val.length > 30 && Http.isTokenValid(val)) {
            return val;
          }
        }
      } catch {}
      return '';
    },

    getAuthHeaders(customHeaders = {}) {
      const headers = { 'Content-Type': 'application/json', ...customHeaders };
      const token = Http.getAuthToken();
      if (token) {
        headers['XXL-JOB-ACCESS-TOKEN'] = token;
        headers['Admin-Token'] = token;
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    },

    isApiSuccess(res) {
      return Boolean(res && (res.code === 200 || res.code === 0 || res.success === true));
    },

    isUserLoggedIn() {
      return Utils.isUserLoggedIn();
    },

    getApiMsg(res, fallback = '未知错误') {
      return res?.msg ?? res?.message ?? fallback;
    },

    async fetchJson(url, options = {}) {
      const { body, headers = {}, ...rest } = options;
      const isJson = body && typeof body === 'object' && !(body instanceof FormData);

      const resp = await fetch(url, {
        ...rest,
        headers: Http.getAuthHeaders(headers),
        body: isJson ? JSON.stringify(body) : body
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      return resp.json();
    },

    extractListFromResponse(res) {
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
  };

  // ==========================
  // 现代通知引擎 (Notice)
  // ==========================
  const THEMES = {
    success: {
      color: '#52c41a',
      bg: 'linear-gradient(135deg, #f6ffed 0%, #ffffff 100%)',
      border: '#b7eb8f',
      icon: '🎉',
      title: '操作成功',
      btnBg: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)'
    },
    error: {
      color: '#ff4d4f',
      bg: 'linear-gradient(135deg, #fff1f0 0%, #ffffff 100%)',
      border: '#ffa39e',
      icon: '❌',
      title: '执行异常',
      btnBg: 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)'
    },
    warning: {
      color: '#faad14',
      bg: 'linear-gradient(135deg, #fffbe6 0%, #ffffff 100%)',
      border: '#ffe58f',
      icon: '⚠️',
      title: '温馨提示',
      btnBg: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)'
    },
    info: {
      color: '#1890ff',
      bg: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 100%)',
      border: '#adc6ff',
      icon: '💡',
      title: '系统提示',
      btnBg: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)'
    }
  };

  const Notice = {
    ensureStyles() {
      if (document.getElementById('datax-notice-style')) return;
      const style = document.createElement('style');
      style.id = 'datax-notice-style';
      style.textContent = `
        @keyframes datax-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes datax-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes datax-scale-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes datax-toast-in { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes datax-toast-out { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -12px); } }
        .datax-btn-hover:hover { filter: brightness(1.08); transform: translateY(-1px); }
        .datax-btn-hover:active { transform: translateY(0); filter: brightness(0.96); }
      `;
      document.head.appendChild(style);
    },

    formatBody(raw, allowHtml = false) {
      if (typeof raw !== 'string') raw = String(raw ?? '');
      // 若显式允许HTML，或者内容包含安全排版标签，直接允许HTML渲染并将换行转为<br/>
      const hasSafeHtml = allowHtml || /<(strong|span|br|b|i|font|p|div|u|s|em)[^>]*>/i.test(raw);
      if (hasSafeHtml) {
        return raw
          .replace(/\[(.*?)\]/g, '<strong style="color:#1890ff;background:#e6f7ff;padding:1px 6px;border-radius:3px;font-size:12px;margin:0 2px;">$1</strong>')
          .replace(/\n/g, '<br/>');
      }
      return Utils.safeEscapeHtml(raw)
        .replace(/\[(.*?)\]/g, '<strong style="color:#1890ff;background:#e6f7ff;padding:1px 6px;border-radius:3px;font-size:12px;margin:0 2px;">$1</strong>')
        .replace(/\n/g, '<br/>');
    },

    inferType(msg) {
      if (/🎉|✅|成功|完成/i.test(msg)) return 'success';
      if (/❌|失败|异常|错误|error/i.test(msg)) return 'error';
      if (/⚠️|警告|注意|请先|未|请选择/i.test(msg)) return 'warning';
      return 'info';
    },

    // 核心通用模态框挂载器 (SoC 彻底消除重复渲染代码)
    mountModal({ title, content, type = 'auto', buttons = [], allowHtml = false }) {
      Notice.ensureStyles();
      const rawMsg = content instanceof Error ? content.message : String(content ?? '').trim();
      const activeType = type === 'auto' ? Notice.inferType(rawMsg) : (type || 'info');
      const theme = THEMES[activeType] ?? THEMES.info;
      const displayTitle = title || theme.title;

      return new Promise((resolve) => {
        const asstPanel = document.getElementById('datax-excel-selector-panel');
        if (asstPanel) asstPanel.style.opacity = '1';

        const overlay = document.createElement('div');
        overlay.className = 'datax-modal-overlay datax-common-overlay';
        overlay.id = 'datax-modal-overlay-' + Date.now();
        overlay.setAttribute('data-datax-modal', 'true');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:2147483646;animation:datax-fade-in 0.18s ease-out;';

        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.22);width:460px;max-width:90vw;overflow:hidden;display:flex;flex-direction:column;animation:datax-scale-in 0.2s cubic-bezier(0.16,1,0.3,1);border:1px solid rgba(0,0,0,0.08);';

        card.innerHTML = `
          <div style="background:${theme.bg};padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:28px;height:28px;border-radius:50%;background:#fff;border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;font-size:15px;">${theme.icon}</span>
              <strong style="font-size:15px;color:#1f1f1f;">${Utils.safeEscapeHtml(displayTitle)}</strong>
            </div>
            <button type="button" class="datax-close-btn" style="background:none;border:none;font-size:16px;color:#8c8c8c;cursor:pointer;padding:4px 8px;line-height:1;" title="关闭 (Esc)">✕</button>
          </div>
          <div style="padding:18px 22px;font-size:13.5px;color:#262626;max-height:58vh;overflow-y:auto;line-height:1.6;word-break:break-word;">
            ${Notice.formatBody(rawMsg, allowHtml)}
          </div>
          <div class="datax-actions" style="padding:10px 18px 14px;background:#fafafa;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:10px;"></div>
        `;

        const actionsEl = card.querySelector('.datax-actions');
        buttons.forEach(({ text, primary, onClick, value }) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'datax-btn-hover';
          btn.style.cssText = primary
            ? `background:${theme.btnBg};color:#fff;border:none;padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);`
            : 'background:#fff;color:#595959;border:1px solid #d9d9d9;padding:7px 18px;border-radius:6px;font-size:13px;cursor:pointer;';
          btn.textContent = text;
          btn.onclick = async () => {
            const ret = await onClick?.();
            if (ret !== false) {
              close(value !== undefined ? value : (ret ?? true));
            }
          };
          actionsEl.appendChild(btn);
        });

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        let closed = false;
        const close = (result) => {
          if (closed) return;
          closed = true;
          if (asstPanel) asstPanel.style.opacity = '1';
          window.removeEventListener('keydown', onKey);
          overlay.style.animation = 'datax-fade-out 0.12s ease-in forwards';
          setTimeout(() => {
            overlay.remove();
            if (asstPanel) asstPanel.style.opacity = '1';
            resolve(result);
          }, 120);
        };

        const onKey = (e) => {
          if (e.key === 'Escape') close(false);
          if (e.key === 'Enter') close(true);
        };
        window.addEventListener('keydown', onKey);

        card.querySelector('.datax-close-btn').onclick = () => close(false);
        overlay.onclick = (e) => (e.target === overlay ? close(false) : null);

        // 默认聚焦首要按钮
        const primaryBtn = actionsEl.querySelector('.datax-btn-hover:last-child');
        setTimeout(() => primaryBtn?.focus(), 50);
      });
    },

    show(content, options = {}) {
      return Notice.mountModal({
        content,
        title: options.title,
        type: options.type,
        buttons: [{
          text: '我知道了',
          primary: true,
          onClick: () => options.onClose?.()
        }]
      });
    },

    alert(msg) {
      return Notice.show(msg);
    },

    confirm(content, options = {}) {
      return Notice.mountModal({
        content,
        title: options.title,
        type: options.type ?? 'warning',
        allowHtml: options.allowHtml,
        buttons: [
          { text: options.cancelText ?? '取消', primary: false, value: false },
          { text: options.confirmText ?? '确定', primary: true, value: true }
        ]
      });
    },

    toast(text, duration = 2500) {
      Notice.ensureStyles();
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;top:24px;left:50%;transform:translate(-50%,0);background:rgba(0,0,0,0.8);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.2);animation:datax-toast-in 0.2s ease-out;pointer-events:none;';
      el.textContent = text;
      document.body.appendChild(el);

      setTimeout(() => {
        el.style.animation = 'datax-toast-out 0.2s ease-in forwards';
        setTimeout(() => el.remove(), 200);
      }, duration);
    }
  };

  // ==========================
  // 窗口交互手势 (Window)
  // ==========================
  const Window = {
    makeDraggable(panel, handle, options = {}) {
      if (!panel || !handle) return;

      let dragging = false;
      let startX = 0;
      let startY = 0;
      let initLeft = 0;
      let initTop = 0;

      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || options.canDrag?.(e) === false) return;

        // 去除 transform 居中定位偏移，固化为绝对 left/top
        if (panel.style.transform && panel.style.transform !== 'none') {
          const r = panel.getBoundingClientRect();
          panel.style.transform = 'none';
          panel.style.left = `${r.left}px`;
          panel.style.top = `${r.top}px`;
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        }

        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initLeft = rect.left;
        initTop = rect.top;

        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = `${initLeft}px`;
        panel.style.top = `${initTop}px`;
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const nextLeft = Math.max(-(panel.offsetWidth - 100), Math.min(initLeft + (e.clientX - startX), window.innerWidth - 80));
        const nextTop = Math.max(0, Math.min(initTop + (e.clientY - startY), window.innerHeight - 40));

        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
      });

      document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
      });
    },

    makeResizable(panel, resizer, options = {}) {
      if (!panel || !resizer) return;
      const minW = options.minWidth ?? 400;
      const minH = options.minHeight ?? 300;

      let resizing = false;
      let startX = 0;
      let startY = 0;
      let startW = 0;
      let startH = 0;

      resizer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();

        resizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = panel.offsetWidth;
        startH = panel.offsetHeight;
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        panel.style.width = `${Math.max(minW, Math.min(startW + (e.clientX - startX), window.innerWidth - 20))}px`;
        panel.style.height = `${Math.max(minH, Math.min(startH + (e.clientY - startY), window.innerHeight - 20))}px`;
      });

      document.addEventListener('mouseup', () => {
        if (!resizing) return;
        resizing = false;
        document.body.style.userSelect = '';
      });
    }
  };

  // ==========================
  // 全局布局与滚动管控 (Layout)
  // ==========================
  const Layout = {
    ensureGlobalLayoutStyles() {
      if (document.getElementById('datax-global-layout-style')) return;
      const style = document.createElement('style');
      style.id = 'datax-global-layout-style';
      style.textContent = `
        /* 根容器锁定视口高度，彻底杜绝全局/外部滚动条与窗口抖动 */
        html, body {
          height: 100% !important;
          overflow: hidden !important;
        }
        #app, .app-wrapper {
          height: 100% !important;
          overflow: hidden !important;
        }
        /* 主容器 Flex 纵向自适应布局 */
        #app .main-container {
          height: 100% !important;
          min-height: 100% !important;
          position: relative !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        }
        /* 顶部导航栏占位且宽度自适应，杜绝脱离文档流造成的计算偏差与硬编码宽度 */
        #app .main-container > .fixed-header {
          position: static !important;
          width: 100% !important;
          flex-shrink: 0 !important;
          z-index: 9 !important;
        }
        /* 主工作区内部自适应滚动，超长内容在内部优雅滚动，杜绝外部溢出 */
        #app .main-container .app-main {
          flex: 1 !important;
          height: auto !important;
          min-height: 0 !important;
          padding-top: 0 !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          box-sizing: border-box !important;
        }
        /* 现代轻量内部滚动条美化 (6px 优雅贴合，避免默认 17px 粗滚动条挤占视觉空间) */
        #app .main-container .app-main::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        #app .main-container .app-main::-webkit-scrollbar-thumb {
          background: #c0c4cc;
          border-radius: 4px;
        }
        #app .main-container .app-main::-webkit-scrollbar-thumb:hover {
          background: #909399;
        }
        #app .main-container .app-main::-webkit-scrollbar-track {
          background: transparent;
        }
        /* 暗黑模式深度适配滚动条配色 */
        body.datax-dark-mode #app .main-container .app-main::-webkit-scrollbar-thumb,
        #app.datax-dark-mode .main-container .app-main::-webkit-scrollbar-thumb {
          background: #4b5563 !important;
        }
        body.datax-dark-mode #app .main-container .app-main::-webkit-scrollbar-thumb:hover,
        #app.datax-dark-mode .main-container .app-main::-webkit-scrollbar-thumb:hover {
          background: #6b7280 !important;
        }
      `;
      document.head.appendChild(style);
    }
  };

  // 立即初始化全局无外部滚动条布局规范
  Layout.ensureGlobalLayoutStyles();

  window.DataXCommon = Object.freeze({
    Utils,
    Http,
    Notice,
    Window,
    Layout,
    version: '1.1.4'
  });
})();
