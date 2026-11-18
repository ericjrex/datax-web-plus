/**
 * @fileoverview DataX-Web 核心权限守卫 (AuthGuard)
 * 负责客户端角色解析、接口鉴权上下文拉取、原生菜单裁剪、页面级路由防护与右上角用户信息展示。
 *
 * @author ypc
 * @version 1.1.0
 * @since 2026-09-11
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  const STORAGE_KEY_USER_ROLE = 'datax_assistant_cached_role';
  const STORAGE_KEY_USERNAME = 'datax_assistant_cached_username';
  const STORAGE_KEY_ROLE_MENUS_PREFIX = 'datax_assistant_role_menus_';
  const STYLE_ID = 'datax-auth-guard-style';

  let cachedUser = null;
  let isFetching = false;
  let lastEffectiveToken = '';
  const callbacks = [];
  let pendingTimeout = null;
  let domObserver = null;
  let rafId = null;

  /**
   * 读取指定角色的本地缓存菜单白名单 (0ms 同步返回，彻底杜绝首次渲染菜单闪烁)
   *
   * @param {string} roleKey 角色编码
   * @return {Array<string>|null} 缓存的菜单编码列表
   */
  function getCachedRoleMenus(roleKey) {
    if (!roleKey) return null;
    if (roleKey === 'ROLE_ADMIN' || roleKey === '1') {
      return ['*'];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ROLE_MENUS_PREFIX + roleKey);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          return list;
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * 写入指定角色的本地缓存菜单白名单
   *
   * @param {string} roleKey 角色编码
   * @param {Array<string>|Set<string>} menuCodes 菜单编码集合
   */
  function setCachedRoleMenus(roleKey, menuCodes) {
    if (!roleKey || !menuCodes) return;
    try {
      const arr = Array.from(menuCodes);
      localStorage.setItem(STORAGE_KEY_ROLE_MENUS_PREFIX + roleKey, JSON.stringify(arr));
    } catch (e) {}
  }

  /**
   * 设置侧边栏过渡平滑就绪状态 (无本地缓存时透明渐入，杜绝原生 10 项全量菜单闪现后被裁切)
   *
   * @param {boolean} isPending 是否处于权限未就绪等待态
   */
  function setSidebarPending(isPending) {
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    if (isPending) {
      document.body.classList.add('auth-pending');
      // 800ms 超时强制兜底，防止网络异常导致侧边栏永久透明
      pendingTimeout = setTimeout(() => {
        document.body.classList.remove('auth-pending');
      }, 800);
    } else {
      document.body.classList.remove('auth-pending');
    }
  }

  /**
   * 实时监听 DOM 树变动，在 Vue 动态挂载侧边栏节点的第一时间（微任务/绘制前）同步裁切，杜绝定时器延迟
   */
  function startDomObserver() {
    if (domObserver || typeof MutationObserver === 'undefined') return;
    try {
      domObserver = new MutationObserver((mutations) => {
        let hasAddedNodes = false;
        for (let i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
            hasAddedNodes = true;
            break;
          }
        }
        if (!hasAddedNodes) return;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (isMenuFetched) {
            applyNativeMenuRestrictions();
            applyTagsViewRestrictions();
          }
        });
      });

      domObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[AuthGuard] 启动 DOM Observer 失败:', e);
    }
  }

  /**
   * 注入防御性全局 CSS 样式表，防止 Vue/ElementUI 重绘时清除 display:none
   */
  function injectGuardStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      [data-auth-hidden="true"] { display: none !important; }
      .sidebar-container .menu-wrapper[data-auth-hidden="true"] { display: none !important; }
      .sidebar-container .el-menu-item[data-auth-hidden="true"] { display: none !important; }
      .sidebar-container [data-auth-hidden="true"] { display: none !important; }
      .sidebar-container {
        transition: opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
      body.auth-pending .sidebar-container {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .navbar .right-menu .avatar-container .avatar-wrapper {
        display: inline-flex !important;
        align-items: center !important;
        margin-top: 5px !important;
        position: relative !important;
        cursor: pointer !important;
      }
      .navbar .right-menu .avatar-container .avatar-wrapper .user-avatar {
        vertical-align: middle !important;
      }
      .navbar .right-menu .avatar-container .avatar-wrapper .datax-avatar-name {
        margin-left: 8px !important;
        margin-right: 4px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        color: #333333 !important;
        max-width: 120px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        display: inline-block !important;
        vertical-align: middle !important;
      }
      .navbar .right-menu .avatar-container .avatar-wrapper .el-icon-caret-bottom {
        position: static !important;
        font-size: 12px !important;
        color: #909399 !important;
        margin-left: 2px !important;
        vertical-align: middle !important;
      }
    `;
  }

  /**
   * 重置当前会话上下文（用户登出或切换时调用）
   */
  function resetSession() {
    cachedUser = null;
    lastEffectiveToken = '';
    allowedMenuCodes = new Set(['tableQuery']);
    isMenuFetched = false;
    setSidebarPending(false);
    try {
      localStorage.removeItem(STORAGE_KEY_USER_ROLE);
      localStorage.removeItem(STORAGE_KEY_USERNAME);
    } catch (e) {}

    // 移除右上角用户名称挂件，防止登出后残留在登录页或过渡页
    const navbar = document.querySelector('.navbar .right-menu');
    if (navbar) {
      const nameSpan = navbar.querySelector('.datax-avatar-name');
      if (nameSpan) {
        nameSpan.remove();
      }
    }

    // 清理顶部历史标签栏 (TagsView) 中旧用户的全部 Tab
    clearAllTagsViews();
  }

  /**
   * 从 JWT Token 中解析 Payload (无额外网络请求，毫秒级响应)
   *
   * @param {string} [explicitToken] 可选显式传入的 Token 串
   * @return {Object|null} 用户基本信息
   */
  function parseUserFromJwt(explicitToken) {
    try {
      const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
      let token = explicitToken || (http ? http.getAuthToken() : '');
      if (!token) return null;

      if (http && typeof http.cleanToken === 'function') {
        token = http.cleanToken(token);
      } else {
        token = token.replace(/^Bearer\s+/i, '').replace(/^Bearer%20/i, '').trim();
      }
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      // Base64Url 解码 (兼容中文字符集与 URL 安全格式)
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      const payload = JSON.parse(jsonPayload);
      const sub = (payload.sub || '').split(',');
      const userId = sub[0] ? parseInt(sub[0], 10) : null;
      const username = sub[1] || '';
      const role = payload.rol || 'ROLE_USER';
      const roleStr = String(role).toUpperCase().trim();
      const userStr = String(username).toLowerCase().trim();
      const isAdmin = roleStr === 'ROLE_ADMIN' || roleStr === 'ADMIN' || roleStr === '1' || userStr === 'admin';

      return {
        userId,
        username,
        role,
        isAdmin
      };
    } catch (e) {
      console.warn('[AuthGuard] 解析本地 Token 失败:', e);
      return null;
    }
  }

  /**
   * 从服务端拉取当前精确用户信息与角色状态
   *
   * @param {Function} [cb] 完成回调
   */
  async function fetchCurrentUser(cb) {
    if (isFetching) {
      if (cb) callbacks.push(cb);
      return;
    }
    isFetching = true;
    if (cb) callbacks.push(cb);

    try {
      const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
      const utils = window.DataXCommon && window.DataXCommon.Utils ? window.DataXCommon.Utils : null;
      const currentToken = http ? http.getAuthToken() : '';
      const isLoggedIn = utils && typeof utils.isUserLoggedIn === 'function'
        ? utils.isUserLoggedIn()
        : Boolean(currentToken);

      if (!http || !isLoggedIn || !currentToken) {
        // 未登录状态置空，严禁将 guest 作为有效用户状态缓存
        cachedUser = null;
        triggerCallbacks();
        return;
      }

      // 先从当前有效 Token 快速补位
      const local = parseUserFromJwt(currentToken);
      if (local && local.username) {
        cachedUser = local;
      }

      const res = await http.fetchJson('/api/user/current', { method: 'GET' });
      const userData = res && (res.content || res.data);
      if (http.isApiSuccess(res) && userData && userData.username && userData.username !== 'guest') {
        const uRole = String(userData.role || 'ROLE_USER').toUpperCase().trim();
        const uName = String(userData.username || '').toLowerCase().trim();
        const isAdm = Boolean(userData.isAdmin) || uRole === 'ROLE_ADMIN' || uRole === 'ADMIN' || uRole === '1' || uName === 'admin';
        cachedUser = {
          userId: userData.userId,
          username: userData.username,
          role: userData.role || 'ROLE_USER',
          isAdmin: isAdm
        };
        try {
          localStorage.setItem(STORAGE_KEY_USER_ROLE, cachedUser.role);
          localStorage.setItem(STORAGE_KEY_USERNAME, cachedUser.username);
        } catch (e) {}
      } else if (!cachedUser && local) {
        cachedUser = local;
      }
    } catch (err) {
      console.warn('[AuthGuard] 拉取当前用户接口异常，回退至本地解析:', err);
      const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
      const curToken = http ? http.getAuthToken() : '';
      if (curToken) {
        cachedUser = parseUserFromJwt(curToken) || cachedUser;
      }
    } finally {
      isFetching = false;
      triggerCallbacks();
    }
  }

  /**
   * 核心响应式凭据巡检：检测 Token 变动与登录态切换
   * 无论用户从账号1退出、还是无刷新登录账号2，均能在毫秒级捕获并自动刷新
   *
   * @param {boolean} [forceRefresh] 是否强制执行完全刷新
   */
  function checkTokenAndSync(forceRefresh = false) {
    const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
    const currentToken = http ? http.getAuthToken() : '';
    const hash = window.location.hash?.toLowerCase() ?? '';
    const path = window.location.pathname?.toLowerCase() ?? '';
    const isAtLogin = hash.includes('login') || path.includes('login');

    // 1. 用户登出状态处理：无 Token 或处于登录页面
    if (!currentToken || isAtLogin) {
      if (lastEffectiveToken || cachedUser) {
        console.log('[AuthGuard] 检测到用户登出或会话过期，重置状态');
        resetSession();
        if (window.DataXAssistant && window.DataXAssistant.EventBus) {
          window.DataXAssistant.EventBus.emit('auth:logout');
        }
      }
      return;
    }

    // 2. 检测到新登录或切换了账号 (Token 变更、强制刷新、或当前缓存无效/为 guest)
    if (currentToken !== lastEffectiveToken || forceRefresh || !cachedUser || cachedUser.username === 'guest') {
      console.log('[AuthGuard] 检测到有效 Token 切换或重载，执行全局用户会话同步');
      lastEffectiveToken = currentToken;

      // 阶段一：毫秒级本地 JWT 解析补位（实现 0 毫秒无感切换新用户，杜绝界面残留旧账号或闪现 guest）
      const local = parseUserFromJwt(currentToken);
      if (local && local.username) {
        cachedUser = local;
        // 立即更新右上角名称挂件
        injectNavbarUserInfo();

        // 核心：0ms 瞬时预热白名单策略，彻底消除菜单闪现后消失
        if (local.isAdmin) {
          allowedMenuCodes = new Set(['*']);
          isMenuFetched = true;
          setSidebarPending(false);
          applyNativeMenuRestrictions();
        } else {
          const cached = getCachedRoleMenus(local.role);
          if (cached) {
            allowedMenuCodes = new Set(cached);
            isMenuFetched = true;
            setSidebarPending(false);
            applyNativeMenuRestrictions();
          } else {
            // 首次无本地缓存：激活平滑透明防闪态，等待服务端返回后淡入
            setSidebarPending(true);
          }
        }
      }

      // 阶段二：向服务端校验最新精准画像并拉取新角色菜单白名单
      AuthGuard.refresh((user) => {
        protectCurrentRoute();
        if (window.DataXAssistant && window.DataXAssistant.EventBus) {
          window.DataXAssistant.EventBus.emit('auth:user_changed', user);
        }
      });
    }
  }

  /**
   * 挂载网络请求拦截器，在用户提交登录表单成功时第一时间感知 Token 写入
   */
  function attachNetworkLoginWatcher() {
    // 1. 拦截 fetch
    if (typeof window.fetch === 'function' && !window.__DATAX_FETCH_INTERCEPTED__) {
      window.__DATAX_FETCH_INTERCEPTED__ = true;
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const resp = await originalFetch.apply(this, args);
        try {
          const url = (args[0] && typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
          if (url.includes('/api/auth/login') && resp.ok) {
            setTimeout(() => checkTokenAndSync(true), 60);
          } else if (url.includes('logout')) {
            setTimeout(() => checkTokenAndSync(true), 60);
          }
        } catch (e) {}
        return resp;
      };
    }

    // 2. 拦截 XMLHttpRequest (原生 axios 登录请求)
    if (typeof window.XMLHttpRequest === 'function' && !window.__DATAX_XHR_INTERCEPTED__) {
      window.__DATAX_XHR_INTERCEPTED__ = true;
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._reqUrl = url || '';
        return originalOpen.apply(this, [method, url, ...rest]);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
          try {
            if (this._reqUrl && this._reqUrl.includes('/api/auth/login') && this.status >= 200 && this.status < 300) {
              setTimeout(() => checkTokenAndSync(true), 60);
            } else if (this._reqUrl && this._reqUrl.includes('logout')) {
              setTimeout(() => checkTokenAndSync(true), 60);
            }
          } catch (e) {}
        });
        return originalSend.apply(this, args);
      };
    }
  }

  function triggerCallbacks() {
    while (callbacks.length > 0) {
      const fn = callbacks.shift();
      try {
        fn(cachedUser);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // 系统标准菜单注册表 (与后端 role_menu_permission 对齐，覆盖所有原生菜单与助手工作台)
  const SYSTEM_MENUS = [
    { code: 'dashboard', name: '运行报表', icon: 'el-icon-data-line', desc: '任务执行大屏趋势与统计', navPath: '#/dashboard', hashPatterns: ['/dashboard'], pathMatch: '/dashboard', textMatch: ['运行报表', '报表', 'Dashboard'] },
    { code: 'project', name: '项目管理', icon: 'el-icon-folder-opened', desc: '数据同步项目分组维护', navPath: '#/datax/jobProject', hashPatterns: ['/datax/project', '/datax/jobProject', '/project'], pathMatch: '/project', textMatch: ['项目管理', '项目', 'Project'] },
    { code: 'jobLog', name: '任务日志', icon: 'el-icon-document', desc: '任务调度与执行历史日志', navPath: '#/datax/log/jobLog', hashPatterns: ['/datax/log', '/datax/jobLog', '/jobLog'], pathMatch: '/log', textMatch: ['任务日志', '日志管理', '日志', 'Log'] },
    { code: 'jobInfo', name: '任务管理', icon: 'el-icon-s-operation', desc: 'DataX 同步任务配置与执行', navPath: '#/datax/job/jobInfo', hashPatterns: ['/datax/job/', '/datax/jobInfo', '/datax/job'], pathMatch: '/job/', textMatch: ['任务管理', '任务构建', 'DataX任务', 'Job'] },
    { code: 'jdbcDatasource', name: '数据源管理', icon: 'el-icon-coin', desc: '数据库连接与敏感凭证配置', navPath: '#/datax/datasource/jdbcDatasource', hashPatterns: ['/datax/datasource', '/datax/jdbc-datasource', '/datax/jdbcDatasource'], pathMatch: '/datasource', textMatch: ['数据源管理', '数据源', 'Datasource'] },
    { code: 'executor', name: '执行器管理', icon: 'el-icon-cpu', desc: '执行器节点心跳与路由配置', navPath: '#/datax/executor/executor', hashPatterns: ['/datax/executor'], pathMatch: '/executor', textMatch: ['执行器管理', '执行器', 'Executor'] },
    { code: 'user', name: '用户管理', icon: 'el-icon-user-solid', desc: '系统账户与角色分配维护', navPath: '#/datax/user/user', hashPatterns: ['/datax/user'], pathMatch: '/user', textMatch: ['用户管理', '用户', 'User'] },
    { code: 'registry', name: '资源监控', icon: 'el-icon-monitor', desc: '服务器 JVM、CPU 与内存负载监控', navPath: '#/datax/registry/registry', hashPatterns: ['/datax/registry'], pathMatch: '/registry', textMatch: ['资源监控', '监控', 'Registry'] },
    { code: 'jsonFormat', name: 'JSON 格式化', icon: 'el-icon-document-copy', desc: 'JSON 语法验证与高亮工具', navPath: '#/tool/jsonFormat', hashPatterns: ['/tool', '/jsonFormat'], pathMatch: '/tool', textMatch: ['JSON 格式化', 'JSON格式化', 'JSON', 'jsonFormat', '工具'] },
    { code: 'tableQuery', name: '库表简易查询', icon: 'el-icon-search', desc: '零代码库表结构探查与数据检索', navPath: '#/datax/table-query', hashPatterns: ['/datax/table-query', '/simple-table-query'], idMatch: 'datax-native-novice-query-menu', textMatch: ['库表简易查询', '简易查询'] }
  ];

  // 默认允许的降级菜单集合 (未拉取到权限配置时的安全防呆白名单，默认仅开放库表简易查询)
  let allowedMenuCodes = new Set(['tableQuery']);
  let isMenuFetched = false;

  /**
   * 路径分段边界精准匹配 (彻底解决 /datax/job 误匹配 /datax/jobLog 或 /datax/jobProject 等前缀冲突)
   *
   * @param {string} target 待检查的目标路径 (如 href、index 或当前 hash)
   * @param {string} pattern 配置的标准路由模式
   * @return {boolean} 是否符合路径分段匹配
   */
  function matchPathSegment(target, pattern) {
    if (!target || !pattern) return false;
    const t = target.toLowerCase().replace(/^#/, '').split('?')[0].replace(/\/+$/, '');
    const p = pattern.toLowerCase().replace(/^#/, '').split('?')[0].replace(/\/+$/, '');
    if (!t || !p) return false;
    const cleanP = p.replace(/^\//, '');
    return t === p || t.startsWith(p + '/') || t.endsWith('/' + cleanP) || t.includes('/' + cleanP + '/');
  }

  /**
   * 根据 URL Hash 精准解析当前页面属于哪个系统菜单编码
   *
   * @param {string} hash 当前 hash (如 #/datax/user)
   * @return {string|null} 对应的菜单编码 (如 'user')
   */
  function resolveMenuCodeByHash(hash) {
    if (!hash) return null;
    const clean = hash.toLowerCase().split('?')[0].replace(/^#/, '');
    if (!clean || clean === '/' || clean === '/dashboard') return 'dashboard';

    for (const m of SYSTEM_MENUS) {
      if (m.hashPatterns) {
        const match = m.hashPatterns.some((p) => matchPathSegment(clean, p));
        if (match) return m.code;
      }
      if (m.pathMatch && matchPathSegment(clean, m.pathMatch)) {
        return m.code;
      }
    }
    return null;
  }

  /**
   * 根据当前用户的生效权限白名单，计算其有权访问的首选合法业务路由 (必须存在于原生 Vue 路由表中)
   *
   * @return {string} 合法的路由 Hash 字符串 (如 '#/datax/jobProject' 或 '#/dashboard')
   */
  function getValidFirstRoute() {
    const isAdmin = AuthGuard.isAdmin();
    if (isAdmin || allowedMenuCodes.has('*')) {
      return '#/dashboard';
    }

    // 优先从已授权的原生业务菜单中选取第一个合法页面 (排除无实体路由的 tableQuery 和未被授权的 dashboard)
    for (const m of SYSTEM_MENUS) {
      if (m.code !== 'tableQuery' && m.code !== 'dashboard' && allowedMenuCodes.has(m.code)) {
        return m.navPath;
      }
    }

    // 如果拥有 dashboard 权限
    if (allowedMenuCodes.has('dashboard')) {
      return '#/dashboard';
    }

    // 若无任何原生业务菜单权限（或仅有助手 tableQuery 权限）：
    // 严禁导向不存在原生路由的 '#/datax/table-query'，否则 Vue Router 必跳 404 并销毁 Layout 侧边栏！
    // 统一导向默认合法路由 '#/dashboard'，由安全阻断卡片在 Layout 内部优雅提示
    return '#/dashboard';
  }

  /**
   * 从后端拉取当前角色允许访问的菜单编码清单
   *
   * @param {string} roleKey 角色标识
   * @param {Function} [cb] 完成回调
   */
  async function fetchAllowedMenus(roleKey, cb) {
    if (!roleKey) {
      if (cb) cb(allowedMenuCodes);
      return;
    }
    // 管理员角色默认全放行
    if (roleKey === 'ROLE_ADMIN' || roleKey === '1') {
      allowedMenuCodes = new Set(['*']);
      isMenuFetched = true;
      if (cb) cb(allowedMenuCodes);
      return;
    }

    try {
      const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
      if (!http) {
        if (cb) cb(allowedMenuCodes);
        return;
      }
      // 兼容 roleCode 与 roleKey 双参数传递并带时间戳防缓存
      const res = await http.fetchJson(`/api/tableData/roleMenu/get?roleCode=${encodeURIComponent(roleKey)}&roleKey=${encodeURIComponent(roleKey)}&_t=${Date.now()}`, { method: 'GET' });
      if (http.isApiSuccess(res) && Array.isArray(res.data)) {
        if (res.data.includes('*')) {
          allowedMenuCodes = new Set(['*']);
        } else {
          allowedMenuCodes = new Set(res.data);
        }
        isMenuFetched = true;
        setCachedRoleMenus(roleKey, allowedMenuCodes);
      }
    } catch (err) {
      console.warn('[AuthGuard] 拉取角色菜单权限异常，采用默认安全降级策略:', err);
    } finally {
      setSidebarPending(false);
      if (cb) cb(allowedMenuCodes);
    }
  }

  /**
   * 根据 DOM 节点的链接、文本、index 或 ID 识别对应的系统菜单编码
   *
   * @param {HTMLElement} item DOM 菜单节点
   * @return {string|null} 匹配到的菜单编码
   */
  function identifyMenuCode(item) {
    if (!item) return null;

    // 助手自定义菜单匹配
    if (item.id === 'datax-native-novice-query-menu') {
      return 'tableQuery';
    }
    if (item.id === 'datax-native-role-perm-menu' || item.id === 'datax-native-perm-menu') {
      return 'rolePermission';
    }

    // 优先检查当前节点或内部/父级 a 标签
    const linkEl = item.querySelector ? (item.querySelector('a[href]') || (item.tagName === 'A' ? item : (item.closest ? item.closest('a[href]') : null))) : null;
    const href = (linkEl ? (linkEl.getAttribute ? linkEl.getAttribute('href') : linkEl.href) : '') || '';

    // 检查 Element-UI 绑定的 index
    const itemIndex = (item.getAttribute ? (item.getAttribute('index') || item.getAttribute('data-index')) : '') || (item.__vue__?.index || '');

    // 获取纯文本 (消除空格与换行)
    const text = (item.innerText || item.textContent || '').replace(/\s+/g, ' ').trim();

    const lowHref = href.toLowerCase();
    const lowIndex = itemIndex.toLowerCase();

    for (const m of SYSTEM_MENUS) {
      if (m.idMatch && item.id === m.idMatch) {
        return m.code;
      }
      if (m.hashPatterns && m.hashPatterns.some((p) => {
        return matchPathSegment(lowHref, p) || matchPathSegment(lowIndex, p);
      })) {
        return m.code;
      }
      if (m.pathMatch && (matchPathSegment(lowHref, m.pathMatch) || matchPathSegment(lowIndex, m.pathMatch))) {
        return m.code;
      }
      if (m.textMatch && m.textMatch.some((k) => text.includes(k))) {
        return m.code;
      }
    }

    return null;
  }

  /**
   * 针对非管理员用户，基于服务端动态白名单裁剪原生及助手左侧功能菜单
   */
  function applyNativeMenuRestrictions() {
    injectGuardStyles();
    const isAdmin = AuthGuard.isAdmin();

    // 1. 角色权限管理特权菜单：仅超级管理员显示，普通角色坚决物理移除
    const permMenuEl = document.getElementById('datax-native-role-perm-menu') || document.getElementById('datax-native-perm-menu');
    if (permMenuEl) {
      if (!isAdmin) {
        permMenuEl.remove();
      } else {
        permMenuEl.style.display = 'block';
      }
    }

    // 2. 库表简易查询助手菜单：管理员、全权限或显式授权 tableQuery 时展示
    const noviceMenuEl = document.getElementById('datax-native-novice-query-menu');
    if (noviceMenuEl) {
      const allowNovice = isAdmin || allowedMenuCodes.has('*') || allowedMenuCodes.has('tableQuery');
      noviceMenuEl.style.display = allowNovice ? 'block' : 'none';
    }

    // 若当前为管理员且白名单包含 *，恢复所有隐藏菜单并放行
    if (isAdmin || allowedMenuCodes.has('*')) {
      const allHidden = document.querySelectorAll('.sidebar-container [data-auth-hidden="true"]');
      allHidden.forEach((el) => {
        el.style.display = '';
        el.removeAttribute('data-auth-hidden');
      });
      setSidebarPending(false);
      return;
    }

    // 安全前置防呆：若当前尚未从服务端拉取到真实权限清单且无本地预热缓存（处于网络就绪等待期），暂不执行粗暴裁剪，保持防闪遮罩
    if (!isMenuFetched) {
      setSidebarPending(true);
      return;
    }

    // 第一阶段：对侧边栏所有具体可点击叶子项 (.el-menu-item) 执行精准白名单裁决
    const leafItems = document.querySelectorAll('.sidebar-container .el-menu-item');
    leafItems.forEach((item) => {
      // 助手挂载的独立特权/工具菜单由专门逻辑处理
      if (item.id === 'datax-native-role-perm-menu' || item.id === 'datax-native-perm-menu' || item.id === 'datax-native-novice-query-menu') {
        return;
      }

      const code = identifyMenuCode(item);
      if (code) {
        const isAllowed = allowedMenuCodes.has('*') || allowedMenuCodes.has(code);
        if (isAllowed) {
          item.style.display = '';
          item.removeAttribute('data-auth-hidden');
        } else {
          item.style.setProperty('display', 'none', 'important');
          item.setAttribute('data-auth-hidden', 'true');
        }
      }
    });

    // 第二阶段：自底向上更新所有复合菜单容器 (.el-submenu) 与最外层包装器 (.menu-wrapper)
    // 核心准则：当且仅当容器内部所有的子菜单项全部被隐藏时，才隐藏该容器；只要存在至少一个可见子项，容器必须保持显示！
    const subMenus = document.querySelectorAll('.sidebar-container .el-submenu');
    subMenus.forEach((sub) => {
      const allChildren = Array.from(sub.querySelectorAll('.el-menu-item'));
      const hasVisibleChild = allChildren.length === 0 || allChildren.some((child) => {
        return child.style.display !== 'none' && child.getAttribute('data-auth-hidden') !== 'true';
      });
      if (hasVisibleChild) {
        sub.style.display = '';
        sub.removeAttribute('data-auth-hidden');
      } else {
        sub.style.setProperty('display', 'none', 'important');
        sub.setAttribute('data-auth-hidden', 'true');
      }
    });

    const wrappers = document.querySelectorAll('.sidebar-container .menu-wrapper');
    wrappers.forEach((wrapper) => {
      // 检查包装器内部是否有可见的菜单项或子菜单
      const itemsInWrapper = Array.from(wrapper.querySelectorAll('.el-menu-item, .el-submenu'));
      if (itemsInWrapper.length > 0) {
        const hasVisible = itemsInWrapper.some((el) => {
          return el.style.display !== 'none' && el.getAttribute('data-auth-hidden') !== 'true';
        });
        if (hasVisible) {
          wrapper.style.display = '';
          wrapper.removeAttribute('data-auth-hidden');
        } else {
          wrapper.style.setProperty('display', 'none', 'important');
          wrapper.setAttribute('data-auth-hidden', 'true');
        }
      } else {
        // 单个独立包装器，按自身匹配
        const code = identifyMenuCode(wrapper);
        if (code) {
          const isAllowed = allowedMenuCodes.has('*') || allowedMenuCodes.has(code);
          if (isAllowed) {
            wrapper.style.display = '';
            wrapper.removeAttribute('data-auth-hidden');
          } else {
            wrapper.style.setProperty('display', 'none', 'important');
            wrapper.setAttribute('data-auth-hidden', 'true');
          }
        }
      }
    });

    // 裁剪完成，平滑展示侧边栏
    setSidebarPending(false);
  }

  /**
   * 清空顶部历史标签栏 (TagsView) 中所有视图 (跨账号登出/切换时调用)
   */
  function clearAllTagsViews() {
    try {
      const container = document.getElementById('tags-view-container');
      const vm = container ? container.__vue__ : null;
      if (vm && vm.$store && typeof vm.$store.dispatch === 'function') {
        vm.$store.dispatch('tagsView/delAllViews').catch(() => {});
      }
    } catch (e) {}
  }

  /**
   * 针对非管理员用户，实施顶部历史标签栏 (TagsView) 安全白名单裁剪与清理
   * 彻底消除登出/切换账号后残留的无权限 Tab (如“数据源管理 ×”)
   */
  function applyTagsViewRestrictions() {
    const isAdmin = AuthGuard.isAdmin();
    // 管理员或拥有全部权限直接放行
    if (isAdmin || allowedMenuCodes.has('*')) {
      return;
    }

    // 1. 优先通过 Vuex 数据层安全关闭未授权 Tab
    try {
      const container = document.getElementById('tags-view-container');
      const vm = container ? container.__vue__ : null;
      if (vm && vm.$store && Array.isArray(vm.visitedViews)) {
        const unauthViews = vm.visitedViews.filter((view) => {
          const path = (view.path || view.fullPath || '').toLowerCase();
          const code = resolveMenuCodeByHash(path);
          if (!code) {
            const title = (view.title || '').trim();
            const matchMeta = SYSTEM_MENUS.find((m) => m.textMatch && m.textMatch.some((k) => title.includes(k)));
            if (matchMeta) {
              return !allowedMenuCodes.has(matchMeta.code);
            }
            return false;
          }
          return !allowedMenuCodes.has(code);
        });

        unauthViews.forEach((view) => {
          try {
            if (typeof vm.closeSelectedTag === 'function') {
              vm.closeSelectedTag(view);
            } else {
              vm.$store.dispatch('tagsView/delView', view);
            }
          } catch (e) {}
        });
      }
    } catch (e) {}

    // 2. DOM 表现层防护：双重兜底，遍历并强行隐藏/移除所有未授权 Tab 元素
    const tagItems = document.querySelectorAll('.tags-view-container .tags-view-item');
    tagItems.forEach((item) => {
      // 获取 Tab 文本标题 (消除空白字符与关闭图标 '×')
      const text = (item.innerText || item.textContent || '')
        .replace(/\s+/g, '')
        .replace(/[×xX]/g, '')
        .trim();

      let matchedCode = null;
      for (const m of SYSTEM_MENUS) {
        if (m.textMatch && m.textMatch.some((k) => text.includes(k.replace(/\s+/g, '')))) {
          matchedCode = m.code;
          break;
        }
      }

      if (!matchedCode && item.__vue__ && item.__vue__.to) {
        const toPath = (item.__vue__.to.path || item.__vue__.to.fullPath || '').toLowerCase();
        matchedCode = resolveMenuCodeByHash(toPath);
      }

      if (matchedCode && !allowedMenuCodes.has(matchedCode) && !allowedMenuCodes.has('*')) {
        // 未授权的 Tab 项直接从视图中清除
        const closeBtn = item.querySelector('.el-icon-close');
        if (closeBtn) {
          try { closeBtn.click(); } catch (e) {}
        }
        item.style.setProperty('display', 'none', 'important');
        item.setAttribute('data-auth-hidden', 'true');
      } else if (item.getAttribute('data-auth-hidden') === 'true') {
        item.removeAttribute('data-auth-hidden');
        item.style.display = '';
      }
    });
  }

  /**
   * 页面级全路由防护与 404 自愈引擎：
   * 彻底拦截因 admin 登出残留 redirect、地址栏直接输入或角色无权访问导致的越权页面与 404
   */
  function protectCurrentRoute() {
    const isAdmin = AuthGuard.isAdmin();
    // 超级管理员或拥有通配符权限，直接全放行并清除所有拦截遮罩
    if (isAdmin || allowedMenuCodes.has('*')) {
      const mask = document.getElementById('datax-route-blocked-mask');
      if (mask) mask.remove();
      const legacyMask = document.getElementById('datax-dashboard-blocked-mask');
      if (legacyMask) legacyMask.remove();
      const editor = document.querySelector('.dashboard-editor-container');
      if (editor) editor.style.display = '';
      return;
    }

    const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
    const token = http ? http.getAuthToken() : '';
    if (!token) return; // 未登录时不拦截（由原生登录守卫控制）

    // 权限数据尚未从服务端就绪时暂不强行路由跳转，防止异步竞争
    if (!isMenuFetched) {
      return;
    }

    const hash = window.location.hash || '';
    const cleanHash = hash.toLowerCase().split('?')[0];

    // 1. 拦截 404 路由 (如普通用户因访问不存在的 admin 路由被原生打入 404)
    if (cleanHash.includes('/404')) {
      const validTarget = getValidFirstRoute();
      console.warn(`[AuthGuard] 检测到普通用户误入 404，安全自愈重定向至已授权页面: ${validTarget}`);
      window.location.hash = validTarget;
      return;
    }

    // 2. 识别当前页面所属功能模块
    const currentCode = resolveMenuCodeByHash(hash);
    if (!currentCode) return;

    // 检查当前模块是否在允许白名单中
    const isAllowed = allowedMenuCodes.has('*') || allowedMenuCodes.has(currentCode);

    // 特殊情况：当前页面是 tableQuery
    if (currentCode === 'tableQuery') {
      if (isAllowed) {
        const mask = document.getElementById('datax-route-blocked-mask');
        if (mask) mask.remove();
      }
      return;
    }

    // 若具备权限：清除遮罩并恢复内容区正常显示
    if (isAllowed) {
      const mask = document.getElementById('datax-route-blocked-mask');
      if (mask) mask.remove();
      const legacyMask = document.getElementById('datax-dashboard-blocked-mask');
      if (legacyMask) legacyMask.remove();
      if (currentCode === 'dashboard') {
        const editor = document.querySelector('.dashboard-editor-container');
        if (editor) editor.style.display = '';
      }
      return;
    }

    // 3. 当前页面未被授权！(例如用户无权的 #/dashboard、admin 退出残留的 #/datax/user 等)
    // 策略 A: 若用户具备其他合法原生业务页面权限，自动平滑导向该合法页面
    const validTarget = getValidFirstRoute();
    const targetCode = resolveMenuCodeByHash(validTarget);

    if (targetCode && targetCode !== currentCode) {
      console.warn(`[AuthGuard] 当前账号未获【${currentCode}】访问授权，自动安全导向已授权业务页面: ${validTarget}`);
      window.location.hash = validTarget;
      return;
    }

    // 策略 B: 若无其他原生业务菜单权限可跳 (留在 #/dashboard 等)
    // 就在内容区域挂载安全友好阻断卡片，绝不把 hash 改写为未知的 #/datax/table-query，确保 Vue 原生 Layout 侧边栏完好保留！
    const editor = document.querySelector('.dashboard-editor-container');
    if (editor) editor.style.setProperty('display', 'none', 'important');

    const mainContainer = document.querySelector('.app-main') || document.querySelector('.main-container');
    if (mainContainer && !document.getElementById('datax-route-blocked-mask')) {
      const mask = document.createElement('div');
      mask.id = 'datax-route-blocked-mask';
      mask.style.cssText = 'padding: 40px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 480px;';
      const user = AuthGuard.getCurrentUser();
      const safeUsername = user.username || '当前用户';
      const safeRole = user.role || 'ROLE_USER';

      const menuMeta = SYSTEM_MENUS.find((m) => m.code === currentCode);
      const menuName = menuMeta ? menuMeta.name : currentCode;

      mask.innerHTML = `
        <div style="background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 36px 48px; max-width: 620px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); text-align: center;">
          <div style="font-size: 18px; font-weight: bold; color: #262626; margin-bottom: 8px;">未授权访问【${menuName}】功能</div>
          <div style="font-size: 13px; color: #8c8c8c; line-height: 1.6; margin-bottom: 22px;">
            当前账号 <code style="background: #f0f2f5; color: #1890ff; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${safeUsername}</code> (${safeRole}) 暂无此功能访问权限。
          </div>
          ${allowedMenuCodes.has('tableQuery') ? `
            <button id="datax-open-novice-btn-from-mask" type="button" style="background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%); color: #fff; border: none; padding: 8px 24px; border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 8px rgba(24,144,255,0.3);">
              🔍 打开【库表简易查询】工作台
            </button>
          ` : '<div style="font-size: 12px; color: #bfbfbf;">请联系管理员为您分配相关业务模块权限</div>'}
        </div>
      `;
      mainContainer.prepend(mask);
      const openBtn = mask.querySelector('#datax-open-novice-btn-from-mask');
      if (openBtn) {
        openBtn.onclick = () => {
          const noviceMenu = document.getElementById('datax-native-novice-query-menu');
          if (noviceMenu) noviceMenu.click();
        };
      }
    }
  }

  function protectDashboardView() {
    protectCurrentRoute();
  }

  /**
   * 在顶部导航栏 (Navbar) 右上角挂载当前登录用户信息挂件
   */
  function injectNavbarUserInfo() {
    // 1. 彻底移除旧版多余且样式错位的独立卡片
    const oldProfileEl = document.getElementById('datax-navbar-user-profile');
    if (oldProfileEl) {
      oldProfileEl.remove();
    }

    const navbar = document.querySelector('.navbar .right-menu');
    if (!navbar) return;

    const user = AuthGuard.getCurrentUser();
    if (!user || !user.username || user.username === 'guest') {
      const existingName = navbar.querySelector('.datax-avatar-name');
      if (existingName) existingName.remove();
      return;
    }

    const avatarWrapper = navbar.querySelector('.avatar-container .avatar-wrapper');
    if (!avatarWrapper) return;

    // 清理旧版本可能存在的历史临时节点
    const legacyLabel = avatarWrapper.querySelector('.datax-avatar-name-label');
    if (legacyLabel) {
      legacyLabel.remove();
    }

    const safeName = user.username;
    let nameSpan = avatarWrapper.querySelector('.datax-avatar-name');
    if (!nameSpan) {
      nameSpan = document.createElement('span');
      nameSpan.className = 'datax-avatar-name';
      const caret = avatarWrapper.querySelector('.el-icon-caret-bottom');
      if (caret) {
        avatarWrapper.insertBefore(nameSpan, caret);
      } else {
        avatarWrapper.appendChild(nameSpan);
      }
    }

    if (nameSpan.textContent !== safeName) {
      nameSpan.textContent = safeName;
      nameSpan.title = safeName;
    }
  }

  const AuthGuard = {
    /**
     * 获取当前用户信息同步快照
     *
     * @return {Object} { userId, username, role, isAdmin }
     */
    getCurrentUser() {
      const http = window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
      const currentToken = http ? http.getAuthToken() : '';
      if (currentToken) {
        if (!cachedUser || cachedUser.username === 'guest' || cachedUser._token !== currentToken) {
          const parsed = parseUserFromJwt(currentToken);
          if (parsed) {
            cachedUser = { ...parsed, _token: currentToken };
            try {
              localStorage.setItem(STORAGE_KEY_USER_ROLE, cachedUser.role);
              localStorage.setItem(STORAGE_KEY_USERNAME, cachedUser.username);
            } catch (e) {}
          }
        }
      }
      if (!cachedUser || cachedUser.username === 'guest') {
        const cachedRole = localStorage.getItem(STORAGE_KEY_USER_ROLE) || sessionStorage.getItem(STORAGE_KEY_USER_ROLE);
        const cachedUname = localStorage.getItem(STORAGE_KEY_USERNAME) || sessionStorage.getItem(STORAGE_KEY_USERNAME);
        if (cachedUname && cachedUname !== 'guest') {
          const rStr = String(cachedRole || '').toUpperCase().trim();
          const uStr = String(cachedUname || '').toLowerCase().trim();
          const isAdm = rStr === 'ROLE_ADMIN' || rStr === 'ADMIN' || rStr === '1' || uStr === 'admin';
          cachedUser = {
            userId: 0,
            username: cachedUname,
            role: cachedRole || 'ROLE_USER',
            isAdmin: isAdm
          };
        }
      }
      return cachedUser || { userId: 0, username: 'guest', role: 'ROLE_USER', isAdmin: false };
    },

    /**
     * 手动重置当前会话凭证与权限状态
     */
    reset() {
      resetSession();
    },

    /**
     * 手动触发 Token 凭据感知与全局用户状态同步
     *
     * @param {boolean} [force] 是否强制刷新
     */
    syncUserSession(force = false) {
      checkTokenAndSync(force);
    },

    /**
     * 判断当前用户是否具备超级管理员特权
     *
     * @return {boolean} 是否为管理员
     */
    isAdmin() {
      const user = this.getCurrentUser();
      if (!user) return false;
      const uRole = String(user.role || '').toUpperCase().trim();
      const uName = String(user.username || '').toLowerCase().trim();
      return Boolean(user.isAdmin) || uRole === 'ROLE_ADMIN' || uRole === 'ADMIN' || uRole === '1' || uName === 'admin';
    },

    /**
     * 刷新并获取最新用户角色 (并行拉取用户信息与菜单权限，消除串行网络延迟)
     *
     * @param {Function} [cb] 回调
     */
    refresh(cb) {
      const user = cachedUser || this.getCurrentUser();
      const roleKey = (user && user.role) ? user.role : 'ROLE_USER';

      let userFetched = false;
      let menuFetched = false;
      let latestUser = user;

      const checkAllDone = () => {
        if (userFetched && menuFetched) {
          applyNativeMenuRestrictions();
          applyTagsViewRestrictions();
          protectDashboardView();
          injectNavbarUserInfo();
          setSidebarPending(false);
          if (cb) cb(latestUser);
        }
      };

      fetchCurrentUser((u) => {
        userFetched = true;
        latestUser = u || cachedUser;
        checkAllDone();
      });

      fetchAllowedMenus(roleKey, () => {
        menuFetched = true;
        checkAllDone();
      });
    },

    /**
     * 写入或更新角色的本地缓存菜单白名单
     *
     * @param {string} roleKey 角色编码
     * @param {Array<string>|Set<string>} menuCodes 菜单集合
     */
    setCachedRoleMenus(roleKey, menuCodes) {
      setCachedRoleMenus(roleKey, menuCodes);
    },

    /**
     * 主动刷新当前角色的菜单白名单并重新应用裁剪
     *
     * @param {Function} [cb] 回调
     */
    refreshAllowedMenus(cb) {
      const user = this.getCurrentUser();
      fetchAllowedMenus(user.role, () => {
        applyNativeMenuRestrictions();
        applyTagsViewRestrictions();
        protectDashboardView();
        injectNavbarUserInfo();
        setSidebarPending(false);
        if (cb) cb(allowedMenuCodes);
      });
    },

    /**
     * 检查某个菜单是否允许当前用户访问
     *
     * @param {string} menuCode 菜单编码
     * @return {boolean} 是否允许
     */
    isMenuAllowed(menuCode) {
      if (this.isAdmin()) return true;
      return allowedMenuCodes.has('*') || allowedMenuCodes.has(menuCode);
    },

    /**
     * 获取系统标准菜单注册表
     *
     * @return {Array} 菜单元数据数组
     */
    getSystemMenus() {
      return SYSTEM_MENUS;
    },

    /**
     * 执行原生界面菜单安全裁剪
     */
    applyNativeMenuRestrictions() {
      applyNativeMenuRestrictions();
    },

    /**
     * 执行顶部历史标签栏 (TagsView) 安全白名单裁剪
     */
    applyTagsViewRestrictions() {
      applyTagsViewRestrictions();
    },

    /**
     * 清空顶部历史标签栏中所有视图
     */
    clearAllTagsViews() {
      clearAllTagsViews();
    },

    /**
     * 执行页面级全路由防护与 404 自愈
     */
    protectCurrentRoute() {
      protectCurrentRoute();
    },

    /**
     * 执行页面级大屏防护 (向下兼容代理至 protectCurrentRoute)
     */
    protectDashboardView() {
      protectCurrentRoute();
    },

    /**
     * 获取当前账号生效的首选合法业务路由
     *
     * @return {string} 路由 Hash 字符串
     */
    getValidFirstRoute() {
      return getValidFirstRoute();
    },

    /**
     * 挂载右上角用户信息
     */
    injectNavbarUserInfo() {
      injectNavbarUserInfo();
    },

    /**
     * 404 自愈重定向 (收口至通用 protectCurrentRoute)
     */
    heal404Route() {
      protectCurrentRoute();
    },

    /**
     * 初始化守卫监听
     */
    init() {
      injectGuardStyles();
      attachNetworkLoginWatcher();
      startDomObserver();

      // 首次加载立即执行凭据巡检与会话同步
      checkTokenAndSync(true);

      // 路由切换监听 (SPA 路由变更时检测登出态、账号切换与页面越权防护)
      window.addEventListener('hashchange', () => {
        checkTokenAndSync(false);
        protectCurrentRoute();
      });
      window.addEventListener('popstate', () => {
        checkTokenAndSync(false);
        protectCurrentRoute();
      });

      // 周期性轮询守护 (SPA 路由切换重绘时同步执行菜单裁剪、TagsView裁剪、全路由防护与右上角用户信息挂载)
      setInterval(() => {
        checkTokenAndSync(false);
        applyNativeMenuRestrictions();
        applyTagsViewRestrictions();
        protectCurrentRoute();
        injectNavbarUserInfo();
      }, 600);
    }
  };

  window.DataXAssistant.AuthGuard = AuthGuard;

  // 立即启动探测
  AuthGuard.init();
})();
