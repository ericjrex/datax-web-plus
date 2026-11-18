/**
 * ============================================================================
 * 🤖 AI Agent 刚性开发规范约束 (智能助手与全栈功能专规)
 * 来源参考: .agents/rules/assistant_development_rules.md
 * 任何在此代码库工作的 AI 助手 (Antigravity / Gemini 等) 必须无条件严格遵守:
 * ============================================================================
 * 1. 文案与反馈口吻红线 (严禁生造概念，必须“说人话”):
 *    - 拒绝流计算行话: 严禁出现“水位线推进”、“拉取X行”、“流吞吐”等词汇。
 *    - 计数量词: 一律使用“条”(如“读取 2 条，写入 2 条”)，严禁用“行/Rows”。
 *    - 增量时间: 一律使用“下次增量时间: yyyy-MM-dd HH:mm:ss”或“增量时间已更新至: ...”。
 *    - 成功反馈格式: 🎉 任务执行成功：读取 {M} 条，写入目标表 [{tableName}] {N} 条，耗时 {time}（下次增量时间: {nextTime}）。
 *    - 失败反馈格式: 任务执行失败 (耗时 {time}): {errorMessage}。
 *    - 弹窗反馈直奔主题单行总结，避免套娃重复。
 *
 * 2. 日期与时间处理铁律:
 *    - 所有实体/DTO 的 Date 必须标注 @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")。
 *    - GET 请求 URL 空格必须转为 %20；Controller 日期解析必须做 18 位无空格粘连串的容错补齐。
 *
 * 3. 增量过滤与命名规范:
 *    - 配置数据本身的增量一律且只能以物理更新时间 update_time 为准，入参兼容驼峰与下划线。
 *
 * 4. MyBatis 映射器避坑:
 *    - 严禁在 Mapper 接口中声明同名重载抽象方法！保持向下兼容请使用 Java 8 default 接口方法。
 *
 * 5. 前端规范与安全防御:
 *    - 统一采用 Ant Design 规范调色盘: 主色 #1890ff、紫调 #722ed1、成功 #52c41a、失败 #f5222d、警示 #fa8c16。
 *    - 强制 XSS 防御: 任何从后端返回的内容写入 DOM 必须先经 safeEscapeHtml 转义。
 *    - 重复代码超 2 处必须抽取公共辅助方法；保持 Vanilla JS 纯原生架构与组件化规范。
 *
 * 6. 十大不可逾越的红线:
 *    - 严禁格式化旧代码；
 *    - 严禁删除已有的 class 或 target 编译文件；
 *    - 严禁随意标注作者，新建文件才允许写 author: ypc，行内/修改不要写；
 *    - 严禁使用全类名，规范 import；
 *    - 有表结构、字典、菜单变更自动在 bin/db/ 产出对应 SQL 脚本；
 *    - OAsystem 与本工程日常前端迭代严禁执行任何 mvn 相关操作；
 *    - 必须使用中文回答与汇报。
 * ============================================================================
 *
 * @fileoverview DataX-Web 简易库表查询工作台与左侧菜单注入器 (NoviceTableQuery)
 * 面向业务与非技术人员设计的直观查询工具：
 * 1. 在系统左侧原生菜单栏动态注入【🔍 库表简易查询】菜单项；
 * 2. 点击进入智能助手专属纯净模式，彻底隐藏所有其他 Tab，降到零认知负担；
 * 3. 上方快速选择库与模糊搜索，下方表格列出所有表清单与业务注释；
 * 4. 提供【查看表字段】与【查看表数据】轻量弹窗；
 * 5. 查看表数据弹窗表头默认优先展示字段备注，窗口顶部支持按字段（默认展示备注）进行灵活条件查询。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  // 常量定义
  const NOVICE_MENU_ID = 'datax-native-novice-query-menu';
  const PERM_MENU_ID = 'datax-native-role-perm-menu';
  const NOVICE_CONTENT_ID = 'datax-novice-query-content';
  const STORAGE_KEY_LAST_DS = 'datax_novice_last_datasource_id';
  const STORAGE_KEY_LAST_SCHEMA = 'datax_novice_last_schema';

  // 状态变量
  let noviceDatasources = [];
  let allNoviceDatasourcesCache = [];
  let noviceTables = [];
  let noviceFilteredTables = [];
  let currentSelectedDsId = null;
  let currentSelectedSchema = '';
  let isNoviceMode = false;
  let currentDsAllowSql = true; // 当前选中的数据库是否允许执行只读 SQL
  let currentDsMaxQueryRows = 100; // 当前选中的数据库单次最大查询行数限制

  // 工作台模式与 SQL 状态 (对齐 Tab 5)
  let activeWorkbenchTab = 'tables'; // 'tables' | 'sql'
  let workbenchSqlResultColumns = [];
  let workbenchSqlResultRows = [];

  // 弹窗状态 (查看数据 - 对齐 Tab 5 高级工作台风格)
  let activeDataModal = null;
  let currentPreviewTable = null;
  let currentPreviewColumns = [];
  let currentPreviewRows = [];
  let currentPreviewTotal = 0;
  let currentPreviewPage = 1;
  let currentPreviewPageSize = 20;
  let currentQueryField = '';
  let currentQueryOp = 'LIKE';
  let currentQueryVal = '';
  let currentWhereClause = '';
  let currentOrderField = '';
  let currentOrderType = 'ASC';
  let currentCommentMode = 'both';

  // 弹窗状态 (查看字段)
  let activeColumnModal = null;

  // ==========================
  // 公共工具方法
  // ==========================
  function safeEscapeHtml(str) {
    if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.safeEscapeHtml) {
      return window.DataXCommon.Utils.safeEscapeHtml(str);
    }
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getHttp() {
    return window.DataXCommon && window.DataXCommon.Http ? window.DataXCommon.Http : null;
  }

  function toast(msg, duration = 2500) {
    if (window.DataXCommon && window.DataXCommon.Notice && window.DataXCommon.Notice.toast) {
      window.DataXCommon.Notice.toast(msg, duration);
      return;
    }
    console.log('[Toast]', msg);
  }

  function alertMsg(msg) {
    if (window.DataXCommon && window.DataXCommon.Notice && window.DataXCommon.Notice.alert) {
      window.DataXCommon.Notice.alert(msg);
      return;
    }
    window.alert(msg);
  }

  function copyText(text) {
    if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.copyToClipboard) {
      return window.DataXCommon.Utils.copyToClipboard(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve(true);
  }

  function loadSheetJs(cb) {
    if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.loadSheetJs) {
      window.DataXCommon.Utils.loadSheetJs(cb);
      return;
    }
    if (window.XLSX) return cb(window.XLSX);
    cb(null);
  }

  /**
   * 判断当前工作台或助手面板是否处于暗黑模式
   *
   * @return {boolean} 是否为暗黑模式
   */
  function isCurrentDarkMode() {
    const panel = document.getElementById('datax-excel-selector-panel');
    if (panel && panel.classList.contains('datax-dark-mode')) return true;
    try {
      const theme = localStorage.getItem('datax_assistant_theme') || 'light';
      if (theme === 'dark') return true;
      if (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
    } catch (e) {}
    return false;
  }

  /**
   * 为弹窗绑定平滑拖拽移动、8方向全向缩放拉伸与最大化/还原 (公共工具方法)
   *
   * @param {HTMLElement} dialog 弹窗主体容器
   * @param {HTMLElement} header 标题栏拖拽手柄
   * @param {Object} [options] 配置项
   * @param {HTMLElement} [options.maxBtn] 最大化按钮
   * @param {number} [options.minWidth=650] 最小宽度
   * @param {number} [options.minHeight=420] 最小高度
   * @return {Function} 弹窗销毁时的事件解绑函数
   */
  function makeDialogDraggableAndResizable(dialog, header, options = {}) {
    if (!dialog || !header) return () => {};

    const minWidth = options.minWidth || 650;
    const minHeight = options.minHeight || 420;
    const maxBtn = options.maxBtn || null;

    // 1. 设置样式与手势
    dialog.style.position = 'absolute';
    dialog.style.margin = '0';
    header.style.cursor = 'move';
    header.style.userSelect = 'none';

    // 2. 最大化与还原管理
    let isMaximized = false;
    let preMaxBounds = null;

    function toggleMaximize() {
      if (!isMaximized) {
        preMaxBounds = {
          left: dialog.style.left,
          top: dialog.style.top,
          width: dialog.style.width,
          height: dialog.style.height,
          borderRadius: dialog.style.borderRadius
        };
        dialog.style.left = '10px';
        dialog.style.top = '10px';
        dialog.style.width = 'calc(100vw - 20px)';
        dialog.style.height = 'calc(100vh - 20px)';
        dialog.style.borderRadius = '6px';
        isMaximized = true;
        if (maxBtn) {
          maxBtn.innerHTML = '&#x25A3;';
          maxBtn.title = '还原窗口';
        }
      } else {
        if (preMaxBounds) {
          dialog.style.left = preMaxBounds.left;
          dialog.style.top = preMaxBounds.top;
          dialog.style.width = preMaxBounds.width;
          dialog.style.height = preMaxBounds.height;
          dialog.style.borderRadius = preMaxBounds.borderRadius || '8px';
        }
        isMaximized = false;
        if (maxBtn) {
          maxBtn.innerHTML = '&#x25A2;';
          maxBtn.title = '最大化窗口';
        }
      }
    }

    if (maxBtn) {
      maxBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMaximize();
      };
    }

    header.ondblclick = (e) => {
      if (e.target.closest('button, input, select, a, #datax-data-modal-close, #datax-col-modal-close')) return;
      toggleMaximize();
    };

    // 3. 拖拽平滑移动
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dialogStartLeft = 0;
    let dialogStartTop = 0;

    const onHeaderMouseDown = (e) => {
      if (e.target.closest('button, input, select, a, #datax-data-modal-close, #datax-col-modal-close, #datax-data-modal-max, #datax-col-modal-max')) return;
      if (isMaximized) return;

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dialogStartLeft = parseFloat(dialog.style.left) || dialog.offsetLeft;
      dialogStartTop = parseFloat(dialog.style.top) || dialog.offsetTop;
      document.body.style.userSelect = 'none';
    };

    const onDocMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      let newLeft = dialogStartLeft + deltaX;
      let newTop = dialogStartTop + deltaY;

      const maxLeft = window.innerWidth - 80;
      const minLeft = -(dialog.offsetWidth - 100);
      const maxTop = window.innerHeight - 50;
      const minTop = 0;

      newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
      newTop = Math.max(minTop, Math.min(newTop, maxTop));

      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
    };

    const onDocMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    };

    header.addEventListener('mousedown', onHeaderMouseDown);
    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup', onDocMouseUp);

    // 4. 8方向边缘缩放拉伸
    const dirs = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
    const handleWrapper = document.createElement('div');
    handleWrapper.className = 'datax-dialog-resize-handles';

    dirs.forEach(dir => {
      const h = document.createElement('div');
      h.className = `datax-resize-handle datax-resize-${dir}`;
      h.setAttribute('data-dir', dir);
      if (dir === 'se') {
        h.title = '按住拖动调整窗口尺寸';
      }
      handleWrapper.appendChild(h);

      h.addEventListener('mousedown', (e) => {
        if (isMaximized) return;
        e.stopPropagation();
        e.preventDefault();

        const activeDir = dir;
        const resizeStartX = e.clientX;
        const resizeStartY = e.clientY;
        const startW = dialog.offsetWidth;
        const startH = dialog.offsetHeight;
        const startLeft = parseFloat(dialog.style.left) || dialog.offsetLeft;
        const startTop = parseFloat(dialog.style.top) || dialog.offsetTop;

        document.body.style.userSelect = 'none';

        const onResizeMouseMove = (moveEvt) => {
          const deltaX = moveEvt.clientX - resizeStartX;
          const deltaY = moveEvt.clientY - resizeStartY;
          const maxW = window.innerWidth - 10;
          const maxH = window.innerHeight - 10;

          let newW = startW;
          let newH = startH;
          let newL = startLeft;
          let newT = startTop;

          if (activeDir.includes('e')) {
            newW = Math.max(minWidth, Math.min(maxW - startLeft, startW + deltaX));
          } else if (activeDir.includes('w')) {
            const candW = startW - deltaX;
            if (candW >= minWidth) {
              newW = Math.min(startLeft + startW, candW);
              newL = startLeft + (startW - newW);
            } else {
              newW = minWidth;
              newL = startLeft + startW - minWidth;
            }
            newL = Math.max(0, newL);
          }

          if (activeDir.includes('s')) {
            newH = Math.max(minHeight, Math.min(maxH - startTop, startH + deltaY));
          } else if (activeDir.includes('n')) {
            const candH = startH - deltaY;
            if (candH >= minHeight) {
              newH = Math.min(startTop + startH, candH);
              newT = startTop + (startH - newH);
            } else {
              newH = minHeight;
              newT = startTop + startH - minHeight;
            }
            newT = Math.max(0, newT);
          }

          dialog.style.width = `${Math.round(newW)}px`;
          dialog.style.height = `${Math.round(newH)}px`;
          dialog.style.left = `${Math.round(newL)}px`;
          dialog.style.top = `${Math.round(newT)}px`;
        };

        const onResizeMouseUp = () => {
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onResizeMouseMove);
          document.removeEventListener('mouseup', onResizeMouseUp);
        };

        document.addEventListener('mousemove', onResizeMouseMove);
        document.addEventListener('mouseup', onResizeMouseUp);
      });
    });

    dialog.appendChild(handleWrapper);

    // 5. 销毁清理器
    return () => {
      header.removeEventListener('mousedown', onHeaderMouseDown);
      document.removeEventListener('mousemove', onDocMouseMove);
      document.removeEventListener('mouseup', onDocMouseUp);
    };
  }

  // ==========================
  // 1. 左侧原生菜单动态挂载
  function injectLeftSidebarMenu() {
    // 探测 DataX-Web 左侧菜单容器 (Element-UI el-menu)
    const sidebar = document.querySelector('.sidebar-container .el-menu');
    if (!sidebar) return;

    const isAdmin = window.DataXAssistant && window.DataXAssistant.AuthGuard ? window.DataXAssistant.AuthGuard.isAdmin() : false;

    const isDarkSidebar = (() => {
      try {
        const bg = window.getComputedStyle(sidebar).backgroundColor;
        return bg && !bg.includes('255, 255, 255') && bg !== 'transparent';
      } catch (e) {
        return true;
      }
    })();

    // 1. 注入【🔍 库表简易查询】菜单
    let noviceWrapper = document.getElementById(NOVICE_MENU_ID);
    if (!noviceWrapper) {
      noviceWrapper = document.createElement('div');
      noviceWrapper.className = 'menu-wrapper';
      noviceWrapper.id = NOVICE_MENU_ID;
      noviceWrapper.innerHTML = `
        <li class="el-menu-item" role="menuitem" tabindex="-1" style="padding-left: 20px; cursor: pointer; display: flex; align-items: center; transition: background-color 0.3s, color 0.3s; color: ${isDarkSidebar ? 'rgb(191, 203, 217)' : '#303133'};">
          <i class="el-icon-search" style="margin-right: 14px; font-size: 16px; color: #1890ff; vertical-align: middle;"></i>
          <span slot="title" style="font-weight: bold; font-size: 14px;">库表简易查询</span>
        </li>
      `;

      const menuItem = noviceWrapper.querySelector('.el-menu-item');
      menuItem.onmouseenter = () => {
        menuItem.style.backgroundColor = isDarkSidebar ? '#263445' : '#ecf5ff';
        menuItem.style.color = '#1890ff';
      };
      menuItem.onmouseleave = () => {
        if (!isNoviceMode) {
          menuItem.style.backgroundColor = 'transparent';
          menuItem.style.color = isDarkSidebar ? 'rgb(191, 203, 217)' : '#303133';
        }
      };

      menuItem.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openNoviceQueryWorkbench();
      };

      sidebar.appendChild(noviceWrapper);
    }

    // 2. 注入【🛡️ 角色权限管理】菜单 (仅管理员可见)
    let permWrapper = document.getElementById(PERM_MENU_ID);
    if (!isAdmin) {
      if (permWrapper) permWrapper.remove();
    } else {
      if (!permWrapper) {
        permWrapper = document.createElement('div');
        permWrapper.className = 'menu-wrapper';
        permWrapper.id = PERM_MENU_ID;
        permWrapper.innerHTML = `
          <li class="el-menu-item" role="menuitem" tabindex="-1" style="padding-left: 20px; cursor: pointer; display: flex; align-items: center; transition: background-color 0.3s, color 0.3s; color: ${isDarkSidebar ? 'rgb(191, 203, 217)' : '#303133'};">
            <i class="el-icon-lock" style="margin-right: 14px; font-size: 16px; color: #722ed1; vertical-align: middle;"></i>
            <span slot="title" style="font-weight: bold; font-size: 14px;">角色权限管理</span>
          </li>
        `;

        const permItem = permWrapper.querySelector('.el-menu-item');
        permItem.onmouseenter = () => {
          permItem.style.backgroundColor = isDarkSidebar ? '#263445' : '#f9f0ff';
          permItem.style.color = '#722ed1';
        };
        permItem.onmouseleave = () => {
          permItem.style.backgroundColor = 'transparent';
          permItem.style.color = isDarkSidebar ? 'rgb(191, 203, 217)' : '#303133';
        };

        permItem.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openRoleTablePermissionModal();
        };

        sidebar.appendChild(permWrapper);
      }
    }
  }

  // ==========================
  // 2. 唤醒智能助手专属纯净模式 (无其他Tab干扰)
  // ==========================
  function openNoviceQueryWorkbench() {
    const panel = document.getElementById('datax-excel-selector-panel');
    if (!panel) {
      // 若助手面板尚未创建，稍等微任务尝试唤起
      setTimeout(openNoviceQueryWorkbench, 200);
      return;
    }

    const isAdmin = window.DataXAssistant && window.DataXAssistant.AuthGuard ? window.DataXAssistant.AuthGuard.isAdmin() : false;
    isNoviceMode = true;

    // 1. 彻底隐藏主面板的所有其他业务 Tab (Tab 1~7)
    const tabNav = document.getElementById('datax-panel-tab-nav');
    if (tabNav) {
      tabNav.style.display = 'none';
    }

    const allTabContents = panel.querySelectorAll('[id^="datax-tab-content-"]');
    allTabContents.forEach(c => {
      c.style.display = 'none';
    });

    // 2. 调整面板标题为简易查询标题，并增加全功能模式切换入口 (仅管理员展示)
    const headerTitle = document.getElementById('datax-panel-header-title') || panel.querySelector('#datax-panel-header > span');
    if (headerTitle) {
      headerTitle.innerHTML = `
        <span style="display: flex; align-items: center; gap: 8px;">
          <span>🔍 DataX 库表简易查询</span>
          ${isAdmin ? '<a id="datax-novice-switch-full-btn" href="javascript:;" style="font-size: 11px; color: #bae7ff; text-decoration: underline; margin-left: 10px; cursor: pointer;" title="开发者切回全量任务构建与批处理工作台">[切换全功能模式]</a>' : ''}
        </span>
      `;

      if (isAdmin) {
        const switchBtn = headerTitle.querySelector('#datax-novice-switch-full-btn');
        if (switchBtn) {
          switchBtn.onclick = (e) => {
            e.stopPropagation();
            restoreFullAssistantMode();
          };
        }
      }
    }

    // 隐藏/显示右上角个性化设置按钮与角色权限入口 (仅管理员展示)
    const settingsBtn = panel.querySelector('#datax-panel-settings-btn');
    if (settingsBtn) {
      settingsBtn.style.display = isAdmin ? 'inline-block' : 'none';
    }
    const permHeaderBtn = panel.querySelector('#datax-panel-perm-btn');
    if (permHeaderBtn) {
      permHeaderBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    // 3. 挂载并展示库表简易查询专用容器
    let noviceContainer = document.getElementById(NOVICE_CONTENT_ID);
    if (!noviceContainer) {
      noviceContainer = createNoviceWorkbenchContainer();
      const contentWrapper = panel.querySelector('div[style*="flex-direction: column"]');
      if (contentWrapper) {
        contentWrapper.appendChild(noviceContainer);
      } else {
        panel.appendChild(noviceContainer);
      }
    }
    noviceContainer.style.display = 'flex';

    // 联动控制权限配置按钮与 SQL 工作台显示
    const permBtnWrap = document.getElementById('datax-novice-perm-btn-wrap');
    if (permBtnWrap) {
      permBtnWrap.style.display = isAdmin ? 'block' : 'none';
    }
    const sqlTabBtn = document.getElementById('datax-novice-tab-sql');
    if (sqlTabBtn) {
      sqlTabBtn.style.display = 'flex';
    }

    // 4. 优化面板尺寸与居中舒适视野
    panel.style.display = 'flex';
    if (panel.offsetWidth < 880) {
      panel.style.width = '900px';
    }
    if (panel.offsetHeight < 580) {
      panel.style.height = '600px';
    }

    // 5. 高亮左侧菜单
    const menuItem = document.querySelector(`#${NOVICE_MENU_ID} .el-menu-item`);
    if (menuItem) {
      const isDark = menuItem.style.color === 'rgb(191, 203, 217)' || (document.querySelector('.sidebar-container') && window.getComputedStyle(document.querySelector('.sidebar-container')).backgroundColor !== 'rgb(255, 255, 255)');
      menuItem.style.backgroundColor = isDark ? '#263445' : '#e6f7ff';
      menuItem.style.color = '#1890ff';
    }

    // 6. 自动拉取最新数据源
    loadDatasources();
  }

  /**
   * 恢复为全功能助手模式 (带 Tab 1~7 完整导航)
   */
  function restoreFullAssistantMode() {
    const isAdmin = window.DataXAssistant && window.DataXAssistant.AuthGuard ? window.DataXAssistant.AuthGuard.isAdmin() : false;
    if (!isAdmin) {
      console.warn('[NoviceTableQuery] 普通用户无权访问全功能智能助手');
      return;
    }
    isNoviceMode = false;
    const panel = document.getElementById('datax-excel-selector-panel');
    if (!panel) return;

    // 重置左侧菜单激活样式
    const menuItem = document.querySelector(`#${NOVICE_MENU_ID} .el-menu-item`);
    if (menuItem) {
      const isDark = document.querySelector('.sidebar-container') && window.getComputedStyle(document.querySelector('.sidebar-container')).backgroundColor !== 'rgb(255, 255, 255)';
      menuItem.style.backgroundColor = 'transparent';
      menuItem.style.color = isDark ? 'rgb(191, 203, 217)' : '#303133';
    }

    // 恢复 Tab 导航条
    const tabNav = document.getElementById('datax-panel-tab-nav');
    if (tabNav) {
      tabNav.style.display = 'flex';
    }

    // 隐藏简易查询专用容器
    const noviceContainer = document.getElementById(NOVICE_CONTENT_ID);
    if (noviceContainer) {
      noviceContainer.style.display = 'none';
    }

    // 还原标题
    const headerTitle = document.getElementById('datax-panel-header-title') || panel.querySelector('#datax-panel-header > span');
    if (headerTitle) {
      headerTitle.innerHTML = `
        <span style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
          <span>🚀 DataX 智能构建与调度工作台</span>
          <a id="datax-full-switch-novice-btn" href="javascript:;" style="font-size: 11px; color: #bae7ff; text-decoration: underline; margin-left: 10px; cursor: pointer;" title="返回库表简易查询工作台">[返回库表查询]</a>
        </span>
      `;
      const backBtn = headerTitle.querySelector('#datax-full-switch-novice-btn');
      if (backBtn) {
        backBtn.onclick = (e) => {
          e.stopPropagation();
          openNoviceQueryWorkbench();
        };
      }
    }

    // 恢复右上角个性化设置按钮
    const settingsBtn = panel.querySelector('#datax-panel-settings-btn');
    if (settingsBtn) {
      settingsBtn.style.display = 'inline-block';
    }

    // 激活 Tab 1 或上次记忆的 Tab
    const activeTab = localStorage.getItem('datax_panel_active_tab') || localStorage.getItem('datax_assistant_active_tab') || '1';
    if (window.DataXAssistant && typeof window.DataXAssistant.activateTab === 'function') {
      window.DataXAssistant.activateTab(activeTab);
    } else {
      const btn = document.getElementById(`datax-tab-btn-${activeTab}`) || document.getElementById('datax-tab-btn-1');
      if (btn) btn.click();
    }
  }

  // ==========================
  // 3. 构建库表简易查询工作台主容器
  // ==========================
  function createNoviceWorkbenchContainer() {
    const isAdmin = window.DataXAssistant && window.DataXAssistant.AuthGuard ? window.DataXAssistant.AuthGuard.isAdmin() : false;
    const container = document.createElement('div');
    container.id = NOVICE_CONTENT_ID;
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      overflow: hidden;
      background: #f7f9fa;
      padding: 14px;
      box-sizing: border-box;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    `;

    container.innerHTML = `
      <!-- 上部：库选择与过滤卡片 -->
      <div class="datax-novice-card" style="background: #ffffff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 13px; font-weight: bold; color: #1890ff; display: flex; align-items: center; gap: 8px;">
            <span>🗄️ 1. 请选择要查询的数据库：</span>
            <div id="datax-novice-ds-badge" style="display: inline-flex; align-items: center; gap: 8px;">
              <span style="font-size: 12px; color: #909399; background: #f4f4f5; border: 1px solid #e9e9eb; padding: 2px 8px; border-radius: 4px; line-height: 18px; font-weight: normal;">未选择</span>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.3fr 2fr 1.2fr 1.5fr auto auto; gap: 10px; align-items: center;">
          <!-- 库备注/名称快速搜索输入框 -->
          <div>
            <input type="text" id="datax-novice-ds-search" placeholder="🔍 搜库名/备注..." style="width: 100%; box-sizing: border-box; padding: 7px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; background: #fff;" />
          </div>

          <!-- 库选择下拉 -->
          <div>
            <select id="datax-novice-ds-select" style="width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; outline: none; cursor: pointer; color: #333;">
              <option value="">-- 请选择数据库 --</option>
            </select>
          </div>

          <!-- Schema 选择 (PG/Oracle等) -->
          <div id="datax-novice-schema-wrap" style="display: none;">
            <select id="datax-novice-schema-select" style="width: 100%; padding: 7px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; outline: none; cursor: pointer; color: #333;">
              <option value="">默认 Schema</option>
            </select>
          </div>

          <!-- 表名/中文备注即时搜索框 -->
          <div>
            <input type="text" id="datax-novice-table-search" placeholder="🔍 搜表名/表备注..." style="width: 100%; box-sizing: border-box; padding: 7px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; transition: border-color 0.2s;" />
          </div>

          <!-- 刷新按钮 -->
          <div>
            <button id="datax-novice-refresh-btn" style="background: #1890ff; color: #fff; border: none; padding: 7px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(24,144,255,0.25);">
              刷新
            </button>
          </div>

          <!-- 角色库表权限管理入口 (仅管理员展示) -->
          <div id="datax-novice-perm-btn-wrap" style="display: ${isAdmin ? 'block' : 'none'};">
            <button id="datax-novice-perm-btn" type="button" style="background: linear-gradient(135deg, #722ed1 0%, #531dab 100%); color: #fff; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(114,46,209,0.3); transition: all 0.2s;" title="管理各角色可访问的数据库、数据表及操作权限">
              角色库表权限
            </button>
          </div>
        </div>
      </div>

      <!-- 下部：数据表列表与只读 SQL 控制台卡片 (对齐 Tab 5 双模式) -->
      <div class="datax-novice-card" style="background: #ffffff; border: 1px solid #e8e8e8; border-radius: 8px; flex: 1; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
        <!-- 表列表头部状态条与子 Tab 切换 -->
        <div class="datax-novice-card-header" style="padding: 8px 16px; border-bottom: 1px solid #f0f0f0; background: #fafafa; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <!-- 子 Tab 按钮组 (对齐 Tab 5) -->
            <div style="display: inline-flex; background: #f0f2f5; padding: 2px; border-radius: 6px; border: 1px solid #e4e7ed;">
              <button id="datax-novice-tab-tables" type="button" style="padding: 5px 12px; font-size: 12px; font-weight: bold; border-radius: 4px; border: none; background: #fff; color: #1890ff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; gap: 5px;">
                <span>数据表列表</span>
                <span id="datax-novice-table-count" style="font-size: 11px; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 0 6px; border-radius: 10px; font-weight: normal;">0</span>
              </button>
              <button id="datax-novice-tab-sql" type="button" style="padding: 5px 12px; font-size: 12px; font-weight: normal; border-radius: 4px; border: none; background: transparent; color: #606266; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                <span>SQL 查询</span>
              </button>
            </div>
          </div>

          <!-- 右侧工具条 -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <!-- 仅在表清单模式展示 -->
            <div id="datax-novice-tables-actions" style="display: flex; gap: 6px; align-items: center;">
              <button id="datax-novice-export-schema-btn" style="background: #52c41a; color: #fff; border: none; padding: 5px 14px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 4px rgba(82,196,26,0.25); transition: all 0.2s;" title="导出当前库全部表及字段结构说明 (Excel 多 Sheet，支持目录一键直达表结构)">
                导出库表结构 (Excel)
              </button>
            </div>
            <!-- 仅在 SQL 查询工作台模式展示 -->
            <div id="datax-novice-sql-actions" style="display: none; gap: 6px; align-items: center;">
              <button id="datax-novice-btn-execute-sql" style="background: #1890ff; color: #fff; border: none; padding: 5px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(24,144,255,0.25);" title="快捷键: Ctrl + Enter">
                执行 SQL
              </button>
              <button id="datax-novice-btn-export-sql-excel" style="background: #52c41a; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;" title="导出当前 SQL 查询结果为 Excel">
                导出 Excel
              </button>
              <button id="datax-novice-btn-copy-sql-json" style="background: #722ed1; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="复制当前 SQL 查询结果为 JSON">
                复制 JSON
              </button>
              <button id="datax-novice-btn-clear-sql" style="background: #f0f2f5; color: #606266; border: 1px solid #dcdfe6; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                清空
              </button>
            </div>
          </div>
        </div>

        <!-- 面板 1：数据表列表面板 -->
        <div id="datax-novice-panel-tables" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <div id="datax-novice-table-container" style="flex: 1; overflow-y: auto; padding: 0;">
            <div style="padding: 48px; text-align: center; color: #909399; font-size: 13px;">
              请先选择数据库
            </div>
          </div>
        </div>

        <!-- 面板 2：SQL 查询面板 -->
        <div id="datax-novice-panel-sql" style="flex: 1; display: none; flex-direction: column; overflow: hidden; padding: 10px 14px; box-sizing: border-box; gap: 8px;">
          <!-- SQL 工具条与快捷模板 -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <select id="datax-novice-sql-table-helper" style="padding: 4px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; max-width: 250px; cursor: pointer;" title="快速选择数据表">
                <option value="">-- 选择表 --</option>
              </select>
              <button type="button" id="datax-novice-sql-tpl-select" style="background: #e6f7ff; border: 1px solid #91d5ff; color: #096dd9; font-size: 11px; padding: 3px 8px; border-radius: 3px; cursor: pointer;">
                SELECT *
              </button>
              <button type="button" id="datax-novice-sql-tpl-count" style="background: #e6f7ff; border: 1px solid #91d5ff; color: #096dd9; font-size: 11px; padding: 3px 8px; border-radius: 3px; cursor: pointer;">
                COUNT(*)
              </button>
            </div>
          </div>

          <!-- SQL 文本域 -->
          <textarea id="datax-novice-workbench-sql-input" placeholder="输入 SQL 语句 (Ctrl + Enter 执行)..." style="width: 100%; height: 86px; min-height: 70px; box-sizing: border-box; padding: 8px 10px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fdfdfd; line-height: 1.45; resize: vertical; outline: none;"></textarea>

          <!-- SQL 结果容器 -->
          <div id="datax-novice-workbench-sql-result" style="flex: 1; min-height: 180px; overflow: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff; position: relative;">
            <div style="padding: 36px; text-align: center; color: #909399; font-size: 12px;">
              暂无查询结果
            </div>
          </div>
        </div>
      </div>
    `;

    // 绑定事件
    const dsSearchInput = container.querySelector('#datax-novice-ds-search');
    if (dsSearchInput) {
      dsSearchInput.oninput = () => {
        const kw = (dsSearchInput.value || '').trim().toLowerCase();
        const baseList = allNoviceDatasourcesCache.length > 0 ? allNoviceDatasourcesCache : noviceDatasources;
        if (!kw) {
          populateDatasourceOptions(baseList);
        } else {
          const filtered = baseList.filter(ds => {
            const commentMatch = (ds.comments || '').toLowerCase().includes(kw);
            const nameMatch = (ds.datasourceName || '').toLowerCase().includes(kw);
            const dbMatch = (ds.databaseName || '').toLowerCase().includes(kw);
            return commentMatch || nameMatch || dbMatch;
          });
          populateDatasourceOptions(filtered);
        }
      };

      dsSearchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const kw = dsSearchInput.value.trim();
          loadDatasources(kw);
        }
      };
    }

    const dsSelect = container.querySelector('#datax-novice-ds-select');
    dsSelect.onchange = () => {
      const dsId = dsSelect.value;
      if (dsId) {
        currentSelectedDsId = parseInt(dsId, 10);
        localStorage.setItem(STORAGE_KEY_LAST_DS, String(currentSelectedDsId));
        loadTablesForSelectedDs(currentSelectedDsId);
      } else {
        currentSelectedDsId = null;
        noviceTables = [];
        noviceFilteredTables = [];
        const badge = document.getElementById('datax-novice-ds-badge');
        if (badge) {
          badge.innerHTML = '<span style="font-size: 12px; color: #909399; background: #f4f4f5; border: 1px solid #e9e9eb; padding: 2px 8px; border-radius: 4px; line-height: 18px; font-weight: normal;">未选择</span>';
        }
        renderNoviceTableList();
      }
    };

    const schemaSelect = container.querySelector('#datax-novice-schema-select');
    schemaSelect.onchange = () => {
      currentSelectedSchema = schemaSelect.value || '';
      localStorage.setItem(STORAGE_KEY_LAST_SCHEMA, currentSelectedSchema);
      if (currentSelectedDsId) {
        loadTablesForSelectedDs(currentSelectedDsId, currentSelectedSchema);
      }
    };

    const searchInput = container.querySelector('#datax-novice-table-search');
    searchInput.oninput = () => {
      const kw = (searchInput.value || '').trim().toLowerCase();
      if (!kw) {
        noviceFilteredTables = [...noviceTables];
      } else {
        noviceFilteredTables = noviceTables.filter(t => {
          const nameMatch = (t.tableName || '').toLowerCase().includes(kw);
          const commentMatch = (t.tableComment || '').toLowerCase().includes(kw);
          return nameMatch || commentMatch;
        });
      }
      renderNoviceTableList();
    };

    const refreshBtn = container.querySelector('#datax-novice-refresh-btn');
    refreshBtn.onclick = () => {
      if (currentSelectedDsId) {
        loadTablesForSelectedDs(currentSelectedDsId, currentSelectedSchema);
      } else {
        const kw = dsSearchInput ? dsSearchInput.value.trim() : '';
        loadDatasources(kw);
      }
    };

    const exportSchemaBtn = container.querySelector('#datax-novice-export-schema-btn');
    if (exportSchemaBtn) {
      exportSchemaBtn.onclick = () => {
        exportDatabaseSchemaToExcel();
      };
    }

    // 工作台子 Tab 切换事件绑定 (表列表 / 只读 SQL)
    const btnTabTables = container.querySelector('#datax-novice-tab-tables');
    const btnTabSql = container.querySelector('#datax-novice-tab-sql');
    if (btnTabTables) {
      btnTabTables.onclick = () => switchNoviceWorkbenchTab('tables');
    }
    if (btnTabSql) {
      btnTabSql.onclick = () => switchNoviceWorkbenchTab('sql');
    }

    // 工作台 SQL 查询按钮与回车快捷键绑定
    const btnExecuteSql = container.querySelector('#datax-novice-btn-execute-sql');
    if (btnExecuteSql) {
      btnExecuteSql.onclick = executeNoviceWorkbenchSql;
    }

    const workbenchSqlInput = container.querySelector('#datax-novice-workbench-sql-input');
    if (workbenchSqlInput) {
      workbenchSqlInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          executeNoviceWorkbenchSql();
        }
      });
    }

    // 快捷模板与快捷选表辅助下拉框
    const sqlTableHelper = container.querySelector('#datax-novice-sql-table-helper');
    if (sqlTableHelper) {
      sqlTableHelper.onchange = () => {
        const table = sqlTableHelper.value;
        if (!table) return;
        if (workbenchSqlInput) {
          workbenchSqlInput.value = `SELECT * FROM ${table} LIMIT 50;`;
          workbenchSqlInput.focus();
        }
      };
    }

    const tplSelectBtn = container.querySelector('#datax-novice-sql-tpl-select');
    if (tplSelectBtn) {
      tplSelectBtn.onclick = () => {
        const curTable = (sqlTableHelper && sqlTableHelper.value) ? sqlTableHelper.value : (noviceTables[0] ? noviceTables[0].tableName : 'table_name');
        if (workbenchSqlInput) {
          workbenchSqlInput.value = `SELECT * FROM ${curTable} LIMIT 50;`;
          workbenchSqlInput.focus();
        }
      };
    }

    const tplCountBtn = container.querySelector('#datax-novice-sql-tpl-count');
    if (tplCountBtn) {
      tplCountBtn.onclick = () => {
        const curTable = (sqlTableHelper && sqlTableHelper.value) ? sqlTableHelper.value : (noviceTables[0] ? noviceTables[0].tableName : 'table_name');
        if (workbenchSqlInput) {
          workbenchSqlInput.value = `SELECT COUNT(*) AS total_count FROM ${curTable};`;
          workbenchSqlInput.focus();
        }
      };
    }

    const btnExportSqlExcel = container.querySelector('#datax-novice-btn-export-sql-excel');
    if (btnExportSqlExcel) {
      btnExportSqlExcel.onclick = () => {
        exportNoviceSqlResultToExcel(workbenchSqlResultRows, workbenchSqlResultColumns, 'workbench_sql');
      };
    }

    const btnCopySqlJson = container.querySelector('#datax-novice-btn-copy-sql-json');
    if (btnCopySqlJson) {
      btnCopySqlJson.onclick = () => {
        copyNoviceSqlResultToJson(workbenchSqlResultRows);
      };
    }

    const btnClearSql = container.querySelector('#datax-novice-btn-clear-sql');
    if (btnClearSql) {
      btnClearSql.onclick = () => {
        if (workbenchSqlInput) workbenchSqlInput.value = '';
        const resBox = document.getElementById('datax-novice-workbench-sql-result');
        if (resBox) {
          resBox.innerHTML = `
            <div style="padding: 36px; text-align: center; color: #909399; font-size: 12px;">
              💡 在上方输入只读 SQL 并点击【⚡ 执行 SQL】或按 <kbd style="background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;padding:1px 4px;">Ctrl+Enter</kbd> 查看结果
            </div>
          `;
        }
        workbenchSqlResultColumns = [];
        workbenchSqlResultRows = [];
      };
    }

    const permBtn = container.querySelector('#datax-novice-perm-btn');
    if (permBtn) {
      permBtn.onclick = (e) => {
        e.stopPropagation();
        openRoleTablePermissionModal();
      };
    }

    return container;
  }

  // ==========================
  // 4. 填充与加载数据源
  // ==========================
  function populateDatasourceOptions(datasources) {
    const dsSelect = document.getElementById('datax-novice-ds-select');
    if (!dsSelect) return;
    const curVal = dsSelect.value;
    dsSelect.innerHTML = '<option value="">-- 请选择数据库 --</option>';

    datasources.forEach(ds => {
      const opt = document.createElement('option');
      opt.value = ds.id;
      const comment = (ds.comments || '').trim();
      const type = (ds.datasource || '').toUpperCase();
      const dbName = ds.databaseName || (window.DataXCommon?.Utils?.parseDbNameFromUrl?.(ds.jdbcUrl) || '');

      // 默认优先大字突出【备注】，方便快速按业务名称选库
      const label = comment
        ? `【${comment}】 ${ds.datasourceName || ds.datasource}${type ? ' (' + type + ')' : ''}`
        : `${ds.datasourceName || ds.datasource}${type ? ' (' + type + ')' : ''}`;

      opt.textContent = label;
      opt.title = `数据源: ${ds.datasourceName}\n库备注: ${comment || '无备注'}\n数据库名: ${dbName || '默认'}\nJDBC连接: ${ds.jdbcUrl || ''}`;
      dsSelect.appendChild(opt);
    });

    if (curVal && Array.from(dsSelect.options).some(o => o.value == curVal)) {
      dsSelect.value = curVal;
    }
  }

  async function loadDatasources(kw = '', retryCount = 0) {
    const dsSelect = document.getElementById('datax-novice-ds-select');
    if (!dsSelect) return;

    try {
      dsSelect.innerHTML = '<option value="">⏳ 正在加载数据库列表...</option>';
      const url = kw ? `/api/tableData/datasources?keyword=${encodeURIComponent(kw)}` : '/api/tableData/datasources';
      const res = await getHttp().fetchJson(url, { method: 'GET' });
      if (!getHttp().isApiSuccess(res)) {
        throw new Error(getHttp().getApiMsg(res, '获取数据库列表失败'));
      }

      const list = getHttp().extractListFromResponse(res) || [];
      if (!kw) {
        allNoviceDatasourcesCache = [...list];
      }
      noviceDatasources = list;
      populateDatasourceOptions(noviceDatasources);

      // 恢复上次选中的库
      const lastDsId = localStorage.getItem(STORAGE_KEY_LAST_DS);
      if (lastDsId && Array.from(dsSelect.options).some(o => o.value === lastDsId)) {
        dsSelect.value = lastDsId;
        currentSelectedDsId = parseInt(lastDsId, 10);
        loadTablesForSelectedDs(currentSelectedDsId);
      }
    } catch (err) {
      // 刚登录首屏并发导致的 401/403 凭据未就绪，自动延迟重试
      if (retryCount < 2 && (err.message?.includes('403') || err.message?.includes('401'))) {
        setTimeout(() => loadDatasources(kw, retryCount + 1), 400);
        return;
      }
      dsSelect.innerHTML = `<option value="">❌ 加载数据库失败: ${safeEscapeHtml(err.message)}</option>`;
    }
  }

  async function loadTablesForSelectedDs(dsId, schema = '') {
    const container = document.getElementById('datax-novice-table-container');
    const badge = document.getElementById('datax-novice-ds-badge');
    const countEl = document.getElementById('datax-novice-table-count');

    const dsList = allNoviceDatasourcesCache.length > 0 ? allNoviceDatasourcesCache : noviceDatasources;
    const ds = dsList.find(d => d.id === dsId);
    if (badge && ds) {
      const type = (ds.datasource || '').toUpperCase();
      const comment = (ds.comments || '').trim();
      badge.innerHTML = `
        <span style="display: inline-flex; align-items: center; font-size: 12px; color: #1890ff; background: #e6f7ff; border: 1px solid #91d5ff; padding: 2px 10px; border-radius: 4px; line-height: 18px; font-weight: 500;">
          ${safeEscapeHtml(ds.datasourceName || '库')} (${type || 'JDBC'})
        </span>
        ${comment
          ? `<span style="display: inline-flex; align-items: center; font-size: 12px; color: #d46b08; background: #fff7e6; border: 1px solid #ffd591; padding: 2px 10px; border-radius: 4px; line-height: 18px; font-weight: 500;">${safeEscapeHtml(comment)}</span>`
          : ''
        }
      `;
    }

    if (container) {
      container.innerHTML = `
        <div style="padding: 48px; text-align: center; color: #1890ff; font-size: 13px;">
          ⏳ 正在加载数据表列表...
        </div>
      `;
    }

    try {
      const queryParam = schema ? `?datasourceId=${dsId}&tableSchema=${encodeURIComponent(schema)}` : `?datasourceId=${dsId}`;
      const [res, permRes] = await Promise.all([
        getHttp().fetchJson(`/api/tableData/tables${queryParam}`, { method: 'GET' }),
        getHttp().fetchJson(`/api/tableData/permission/current?datasourceId=${dsId}`, { method: 'GET' }).catch(() => null)
      ]);

      if (!getHttp().isApiSuccess(res)) {
        throw new Error(getHttp().getApiMsg(res, '读取数据表列表失败'));
      }

      noviceTables = getHttp().extractListFromResponse(res) || [];
      noviceFilteredTables = [...noviceTables];

      if (countEl) {
        countEl.textContent = `共 ${noviceTables.length} 张表`;
      }

      // 动态解析当前库的生效权限画像
      // 默认开放只读 SQL 工作台（后端在 /executeSql 接口层进行细粒度角色与表白名单强校验拦截）
      let allowSql = true;
      let maxRows = 100;
      if (permRes && getHttp().isApiSuccess(permRes) && permRes.data) {
        allowSql = Boolean(permRes.data.allowSql);
        if (permRes.data.maxQueryRows) {
          maxRows = Number(permRes.data.maxQueryRows);
        }
      }
      currentDsAllowSql = allowSql;
      currentDsMaxQueryRows = maxRows;

      // 联动控制主工作台 SQL Tab 按钮显隐
      const sqlTabBtn = document.getElementById('datax-novice-tab-sql');
      if (sqlTabBtn) {
        sqlTabBtn.style.display = allowSql ? 'flex' : 'none';
      }
      if (!allowSql && activeWorkbenchTab === 'sql') {
        switchNoviceWorkbenchTab('tables');
      }

      // 清空搜索框
      const searchInput = document.getElementById('datax-novice-table-search');
      if (searchInput) searchInput.value = '';

      renderNoviceTableList();
      populateNoviceSqlTableHelper();
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #ff4d4f; font-size: 13px;">
            ❌ 加载表列表异常: ${safeEscapeHtml(err.message)}
          </div>
        `;
      }
    }
  }

  // ==========================
  // 5. 渲染下方表列表表格
  // ==========================
  function renderNoviceTableList() {
    const container = document.getElementById('datax-novice-table-container');
    const countEl = document.getElementById('datax-novice-table-count');
    if (!container) return;

    if (countEl) {
      countEl.textContent = `共 ${noviceFilteredTables.length} / ${noviceTables.length} 张表`;
    }

    if (!noviceFilteredTables || noviceFilteredTables.length === 0) {
      container.innerHTML = `
        <div style="padding: 48px; text-align: center; color: #909399; font-size: 13px;">
          未检索到符合条件的数据表
        </div>
      `;
      return;
    }

    const isAdmin = window.DataXAssistant && window.DataXAssistant.AuthGuard ? window.DataXAssistant.AuthGuard.isAdmin() : false;

    let html = `
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
        <thead>
          <tr style="background: #fafafa; border-bottom: 1px solid #e8e8e8; color: #595959; font-weight: 600;">
            <th style="padding: 10px 14px; width: 60px; text-align: center;">序号</th>
            <th style="padding: 10px 14px; width: 34%;">数据表名 (Table)</th>
            <th style="padding: 10px 14px; width: 36%;">业务说明 / 表中文备注</th>
            <th style="padding: 10px 14px; text-align: center; width: ${currentDsAllowSql ? '310px' : '200px'};">快捷操作</th>
          </tr>
        </thead>
        <tbody>
    `;

    noviceFilteredTables.forEach((t, idx) => {
      const isEven = idx % 2 === 0;
      const comment = t.tableComment ? t.tableComment.trim() : '';
      const commentBadge = comment
        ? `<span class="datax-table-comment-text" style="font-weight: 500;">${safeEscapeHtml(comment)}</span>`
        : `<span style="color: #bfbfbf; font-style: italic;">暂无备注</span>`;

      html += `
        <tr class="datax-novice-tr ${isEven ? 'even' : 'odd'}" style="border-bottom: 1px solid #f0f0f0; transition: background-color 0.2s;">
          <td style="padding: 9px 14px; text-align: center; color: #8c8c8c; font-size: 12px;">${idx + 1}</td>
          <td style="padding: 9px 14px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <code class="datax-table-name-code" style="font-size: 13px; font-weight: 600; color: #096dd9; font-family: monospace;">${safeEscapeHtml(t.tableName)}</code>
              <button class="datax-copy-btn" data-text="${safeEscapeHtml(t.tableName)}" title="复制表名" style="background: none; border: none; cursor: pointer; color: #8c8c8c; font-size: 12px; padding: 0 4px;">复制</button>
            </div>
          </td>
          <td style="padding: 9px 14px;">
            ${commentBadge}
          </td>
          <td style="padding: 9px 14px; text-align: center;">
            <div style="display: inline-flex; gap: 6px; justify-content: center; flex-wrap: nowrap;">
              <button class="datax-btn-view-cols" data-table="${safeEscapeHtml(t.tableName)}" data-comment="${safeEscapeHtml(comment)}" style="background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 3px; transition: all 0.2s;">
                字段
              </button>
              <button class="datax-btn-view-data" data-table="${safeEscapeHtml(t.tableName)}" data-comment="${safeEscapeHtml(comment)}" style="background: #f6ffed; border: 1px solid #b7eb8f; color: #52c41a; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 3px; transition: all 0.2s;">
                数据
              </button>
              ${currentDsAllowSql ? `
              <button class="datax-btn-view-sql" data-table="${safeEscapeHtml(t.tableName)}" data-comment="${safeEscapeHtml(comment)}" style="background: #f9f0ff; border: 1px solid #d3adf7; color: #722ed1; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 3px; transition: all 0.2s;" title="快速使用只读 SQL 查询此表">
                SQL
              </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // 绑定表格操作按钮
    container.querySelectorAll('.datax-copy-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-text');
        copyText(text).then(() => toast(`表名已复制: ${text}`));
      };
    });

    container.querySelectorAll('.datax-btn-view-cols').forEach(btn => {
      btn.onclick = () => {
        const table = btn.getAttribute('data-table');
        const comment = btn.getAttribute('data-comment');
        openColumnStructureModal(table, comment);
      };
    });

    container.querySelectorAll('.datax-btn-view-data').forEach(btn => {
      btn.onclick = () => {
        const table = btn.getAttribute('data-table');
        const comment = btn.getAttribute('data-comment');
        openTableDataPreviewModal(table, comment);
      };
    });

    container.querySelectorAll('.datax-btn-view-sql').forEach(btn => {
      btn.onclick = () => {
        const table = btn.getAttribute('data-table');
        openWorkbenchSqlForTable(table);
      };
    });
  }

  // ==========================
  // 6. 弹窗 1：查看表字段结构弹窗
  // ==========================
  async function openColumnStructureModal(tableName, tableComment) {
    if (activeColumnModal) {
      activeColumnModal.remove();
      activeColumnModal = null;
    }

    const modal = document.createElement('div');
    modal.className = isCurrentDarkMode() ? 'datax-sub-modal datax-dark-mode' : 'datax-sub-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 1000002;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div class="datax-col-dialog" style="background: #fff; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden; position: absolute;">
        <!-- 头部 -->
        <div id="datax-col-modal-header" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 11px 18px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
          <div style="font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <span>表字段结构清单 - <code style="font-size: 14px; background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 4px;">${safeEscapeHtml(tableName)}</code></span>
            ${tableComment ? `<span style="font-size: 12px; font-weight: normal; opacity: 0.9;">(${safeEscapeHtml(tableComment)})</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="datax-col-modal-max" title="最大化窗口" style="font-size: 16px; cursor: pointer; line-height: 1; opacity: 0.85; user-select: none;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.85'">&#x25A2;</span>
            <span id="datax-col-modal-close" title="关闭" style="font-size: 20px; cursor: pointer; line-height: 1; opacity: 0.85; user-select: none;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.85'">&times;</span>
          </div>
        </div>

        <!-- 过滤与工具栏 -->
        <div style="padding: 10px 18px; background: #fafafa; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <input type="text" id="datax-col-search-kw" placeholder="🔍 搜索字段名称或中文注释..." style="width: 280px; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
            <span id="datax-col-stat-text" style="font-size: 12px; color: #8c8c8c;">加载中...</span>
          </div>
          <div>
            <button id="datax-col-copy-all-btn" style="background: #1890ff; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: bold;">
              复制所有字段名 (逗号分隔)
            </button>
          </div>
        </div>

        <!-- 字段表格 -->
        <div id="datax-col-table-container" style="flex: 1; overflow-y: auto; padding: 0;">
          <div style="padding: 40px; text-align: center; color: #1890ff; font-size: 13px;">
            ⏳ 正在读取表结构元数据...
          </div>
        </div>

        <!-- 底部 -->
        <div style="padding: 10px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; text-align: right;">
          <button id="datax-col-modal-cancel" style="background: #fff; border: 1px solid #d9d9d9; color: #606266; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            关闭窗口
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    activeColumnModal = modal;

    // 初始居中与尺寸设定
    const colDialog = modal.querySelector('.datax-col-dialog');
    const initColW = Math.min(880, Math.max(600, window.innerWidth * 0.8));
    const initColH = Math.min(window.innerHeight * 0.82, 680);
    colDialog.style.width = `${initColW}px`;
    colDialog.style.height = `${initColH}px`;
    colDialog.style.left = `${Math.max(10, Math.round((window.innerWidth - initColW) / 2))}px`;
    colDialog.style.top = `${Math.max(10, Math.round((window.innerHeight - initColH) / 2))}px`;

    const colHeader = modal.querySelector('#datax-col-modal-header');
    const colMaxBtn = modal.querySelector('#datax-col-modal-max');
    const destroyColDrag = makeDialogDraggableAndResizable(colDialog, colHeader, {
      minWidth: 500,
      minHeight: 320,
      maxBtn: colMaxBtn
    });

    const closeModal = () => {
      if (typeof destroyColDrag === 'function') destroyColDrag();
      modal.remove();
      activeColumnModal = null;
    };

    modal.querySelector('#datax-col-modal-close').onclick = closeModal;
    modal.querySelector('#datax-col-modal-cancel').onclick = closeModal;
    modal.onmousedown = (e) => {
      if (e.target === modal) closeModal();
    };

    // 拉取字段元数据
    try {
      const url = `/api/tableData/columns?datasourceId=${currentSelectedDsId}&tableName=${encodeURIComponent(tableName)}${currentSelectedSchema ? '&tableSchema=' + encodeURIComponent(currentSelectedSchema) : ''}`;
      const res = await getHttp().fetchJson(url, { method: 'GET' });
      if (!getHttp().isApiSuccess(res)) {
        throw new Error(getHttp().getApiMsg(res, '读取表结构失败'));
      }

      const columns = getHttp().extractListFromResponse(res) || [];
      renderColumnsTable(modal, columns);
    } catch (err) {
      modal.querySelector('#datax-col-table-container').innerHTML = `
        <div style="padding: 36px; text-align: center; color: #ff4d4f; font-size: 13px;">
          ❌ 获取字段结构异常: ${safeEscapeHtml(err.message)}
        </div>
      `;
    }
  }

  function renderColumnsTable(modal, allColumns, options = {}) {
    const container = options.container || modal.querySelector('#datax-col-table-container');
    const statText = options.statText || modal.querySelector('#datax-col-stat-text');
    const searchInput = options.searchInput || modal.querySelector('#datax-col-search-kw');
    const copyBtn = options.copyBtn || modal.querySelector('#datax-col-copy-all-btn');

    const updateView = (cols) => {
      if (statText) statText.textContent = `共 ${cols.length} / ${allColumns.length} 个字段`;

      if (cols.length === 0) {
        container.innerHTML = '<div style="padding: 36px; text-align: center; color: #909399;">未找到匹配字段</div>';
        return;
      }

      let html = `
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead>
            <tr style="background: #fafafa; border-bottom: 1px solid #e8e8e8; color: #595959; font-weight: 600;">
              <th style="padding: 8px 12px; width: 50px; text-align: center;">序号</th>
              <th style="padding: 8px 12px; width: 25%;">字段名称 (Column)</th>
              <th style="padding: 8px 12px; width: 18%;">数据类型</th>
              <th style="padding: 8px 12px; width: 10%; text-align: center;">主键</th>
              <th style="padding: 8px 12px; width: 10%; text-align: center;">允许空</th>
              <th style="padding: 8px 12px; width: 37%;">字段中文备注说明 (Comment)</th>
            </tr>
          </thead>
          <tbody>
      `;

      cols.forEach((c, idx) => {
        const isEven = idx % 2 === 0;
        const isPk = c.isPrimaryKey
          ? '<span style="background: #fff7e6; border: 1px solid #ffd591; color: #d46b08; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">🔑 主键</span>'
          : '<span style="color: #bfbfbf;">-</span>';
        const nullable = c.isNullable
          ? '<span style="color: #52c41a;">YES</span>'
          : '<span style="color: #ff4d4f; font-weight: bold;">NO</span>';
        const comment = c.comment
          ? `<strong class="datax-col-comment" style="color: #096dd9;">${safeEscapeHtml(c.comment)}</strong>`
          : '<span style="color: #bfbfbf; font-style: italic;">暂无备注</span>';

        html += `
          <tr class="datax-col-tr ${isEven ? 'even' : 'odd'}" style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 8px 12px; text-align: center; color: #8c8c8c;">${idx + 1}</td>
            <td style="padding: 8px 12px;">
              <code class="datax-col-name" style="font-weight: bold; font-size: 13px;">${safeEscapeHtml(c.columnName)}</code>
            </td>
            <td style="padding: 8px 12px; color: #595959;">
              ${safeEscapeHtml(c.columnType || '')}${c.columnSize ? '(' + c.columnSize + ')' : ''}
            </td>
            <td style="padding: 8px 12px; text-align: center;">${isPk}</td>
            <td style="padding: 8px 12px; text-align: center;">${nullable}</td>
            <td style="padding: 8px 12px;">${comment}</td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    };

    updateView(allColumns);

    // 搜索过滤
    searchInput.oninput = () => {
      const kw = (searchInput.value || '').trim().toLowerCase();
      if (!kw) {
        updateView(allColumns);
      } else {
        const filtered = allColumns.filter(c => {
          return (c.columnName || '').toLowerCase().includes(kw) || (c.comment || '').toLowerCase().includes(kw);
        });
        updateView(filtered);
      }
    };

    // 一键复制所有字段名
    copyBtn.onclick = () => {
      const colNames = allColumns.map(c => c.columnName).filter(Boolean).join(', ');
      copyText(colNames).then(() => toast('所有字段名已复制到剪贴板'));
    };
  }

  // ==========================
  // 7. 弹窗 2：查看表数据工作台 (对齐 Tab 5 风格：支持高级WHERE、多维排序、三种表头备注展示、列宽拖拽与单元格详情)
  // ==========================

  const STORAGE_KEY_DV_COL_WIDTHS = 'datax_dv_col_widths';
  const STORAGE_KEY_DV_COMMENT_MODE = 'datax_dv_comment_mode';

  /**
   * 严格校验 JSON 字符串有效性并解析（公共方法）
   *
   * @param {*} val 待检验的值
   * @return {{isValid: boolean, parsed: *|null, isObjectOrArray: boolean}} 检查与解析结果
   */
  function safeParseJson(val) {
    if (val === null || val === undefined) {
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
    const str = String(val).trim();
    if (!str || str.length < 2) {
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
    const isObj = str.startsWith('{') && str.endsWith('}');
    const isArr = str.startsWith('[') && str.endsWith(']');
    if (!isObj && !isArr) {
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
    try {
      const parsed = JSON.parse(str);
      const isComplex = parsed !== null && typeof parsed === 'object';
      return { isValid: isComplex, parsed: parsed, isObjectOrArray: isComplex };
    } catch (e) {
      return { isValid: false, parsed: null, isObjectOrArray: false };
    }
  }

  /**
   * 获取持久化的列宽 (px)（公共方法）
   *
   * @param {string} colName 列名
   * @param {number} [defaultWidth=180] 默认列宽
   * @return {number} 列宽 (px)
   */
  function getNoviceColumnWidth(colName, defaultWidth = 180) {
    if (!colName) return defaultWidth;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DV_COL_WIDTHS);
      if (raw) {
        const map = JSON.parse(raw);
        if (map && typeof map[colName] === 'number' && map[colName] >= 50) {
          return map[colName];
        }
      }
    } catch (e) {}
    return defaultWidth;
  }

  /**
   * 安全持久化列宽配置（公共方法）
   *
   * @param {string} colName 列名
   * @param {number} width 列宽 (px)
   */
  function saveNoviceColumnWidth(colName, width) {
    if (!colName || typeof width !== 'number' || width < 50) return;
    try {
      let map = {};
      const raw = localStorage.getItem(STORAGE_KEY_DV_COL_WIDTHS);
      if (raw) map = JSON.parse(raw) || {};
      map[colName] = Math.round(width);
      localStorage.setItem(STORAGE_KEY_DV_COL_WIDTHS, JSON.stringify(map));
    } catch (e) {}
  }

  /**
   * 绑定表格列宽自由拖拽调整引擎 (对齐 Tab 5)
   *
   * @param {HTMLElement} container 表格容器 DOM
   */
  function bindNoviceColumnResize(container) {
    if (!container) return;
    const resizers = container.querySelectorAll('.datax-th-resizer');
    resizers.forEach(resizer => {
      resizer.onmousedown = function (e) {
        e.stopPropagation();
        e.preventDefault();

        const th = this.closest('th');
        if (!th) return;

        const colName = this.getAttribute('data-col');
        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        const thIndex = Array.from(th.parentNode.children).indexOf(th);

        const table = container.querySelector('table');
        const colCells = table ? table.querySelectorAll(`tr > *:nth-child(${thIndex + 1})`) : [];

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        this.style.background = '#1890ff';
        this.style.opacity = '0.8';

        const onMouseMove = (moveEvent) => {
          const deltaX = moveEvent.pageX - startX;
          const newWidth = Math.max(60, startWidth + deltaX);
          th.style.width = `${newWidth}px`;
          th.style.minWidth = `${newWidth}px`;
          colCells.forEach(cell => {
            cell.style.width = `${newWidth}px`;
            cell.style.maxWidth = `${newWidth}px`;
          });
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          resizer.style.background = '';
          resizer.style.opacity = '';

          const finalWidth = parseInt(th.style.width, 10);
          if (colName && !isNaN(finalWidth)) {
            saveNoviceColumnWidth(colName, finalWidth);
          }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
    });
  }

  /**
   * 单元格内容完整详情模态弹窗 (支持 JSON 格式化排版、单行压缩与一键复制)
   *
   * @param {string} title 弹窗标题
   * @param {string} rawContent 原始内容
   * @param {string} [colName=''] 列名
   */
  function showNoviceCellDetailModal(title, rawContent, colName = '') {
    const existing = document.getElementById('datax-ddl-modal');
    if (existing) existing.remove();

    const strContent = (rawContent === null || rawContent === undefined) ? '' : String(rawContent);
    const jsonCheck = safeParseJson(strContent);
    const isJson = jsonCheck.isValid;

    let currentContent = isJson ? JSON.stringify(jsonCheck.parsed, null, 2) : strContent;

    const modal = document.createElement('div');
    modal.id = 'datax-ddl-modal';
    modal.className = isCurrentDarkMode() ? 'datax-sub-modal datax-dark-mode' : 'datax-sub-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000025;display:flex;align-items:center;justify-content:center;';

    let statusBadge = isJson ? '<span style="background:#f6ffed;color:#52c41a;border:1px solid #b7eb8f;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:normal;">🏷️ JSON 格式 (已自动格式化)</span>' : '';

    const jsonActionsHtml = isJson ? `
      <div style="display:flex;gap:8px;">
        <button type="button" id="datax-novice-btn-format-json" style="background:#fafafa;border:1px solid #d9d9d9;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;color:#303133;">格式化 JSON</button>
        <button type="button" id="datax-novice-btn-compress-json" style="background:#fafafa;border:1px solid #d9d9d9;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;color:#303133;">压缩为单行</button>
      </div>
    ` : '<div></div>';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;width:720px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,0.25);">
        <div style="padding:12px 16px;border-bottom:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:14px;color:#303133;">[${safeEscapeHtml(title)}] 详情预览</strong>
            ${statusBadge}
          </div>
          <span id="datax-ddl-close" style="cursor:pointer;font-size:20px;color:#909399;font-weight:bold;line-height:1;">&times;</span>
        </div>
        <div style="padding:14px 16px;flex:1;overflow:auto;display:flex;flex-direction:column;">
          <textarea id="datax-novice-modal-textarea" readonly style="width:100%;box-sizing:border-box;height:320px;padding:10px 12px;font-family:Consolas, Monaco, monospace;font-size:12px;border:1px solid #dcdfe6;border-radius:4px;background:#f8f9fa;line-height:1.5;resize:vertical;">${safeEscapeHtml(currentContent)}</textarea>
        </div>
        <div style="padding:10px 16px;border-top:1px solid #e8e8e8;display:flex;justify-content:space-between;align-items:center;">
          ${jsonActionsHtml}
          <div style="display:flex;gap:8px;">
            <button type="button" id="datax-ddl-copy-btn" style="background:#1890ff;color:#fff;border:none;padding:5px 16px;border-radius:4px;cursor:pointer;font-size:12px;">复制当前内容</button>
            <button type="button" id="datax-ddl-cancel-btn" style="background:#fff;border:1px solid #d9d9d9;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:12px;">关闭</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const textarea = document.getElementById('datax-novice-modal-textarea');
    const btnFormat = document.getElementById('datax-novice-btn-format-json');
    const btnCompress = document.getElementById('datax-novice-btn-compress-json');
    const closeBtn = document.getElementById('datax-ddl-close');
    const cancelBtn = document.getElementById('datax-ddl-cancel-btn');
    const copyBtn = document.getElementById('datax-ddl-copy-btn');

    const closeModal = () => {
      window.removeEventListener('keydown', onModalKeyDown, true);
      modal.remove();
    };

    const onModalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    };
    window.addEventListener('keydown', onModalKeyDown, true);

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (btnFormat) {
      btnFormat.onclick = () => {
        const check = safeParseJson(strContent);
        if (check.isValid) {
          textarea.value = JSON.stringify(check.parsed, null, 2);
          toast('✨ 已格式化为标准 JSON 排版');
        } else {
          alertMsg('当前字段内容非有效 JSON，无法排版！');
        }
      };
    }

    if (btnCompress) {
      btnCompress.onclick = () => {
        const check = safeParseJson(strContent);
        if (check.isValid) {
          textarea.value = JSON.stringify(check.parsed);
          toast('🗜️ 已压缩为紧凑单行格式');
        } else {
          alertMsg('当前字段内容非有效 JSON，无法压缩！');
        }
      };
    }

    if (copyBtn) {
      copyBtn.onclick = () => {
        const valToCopy = textarea ? textarea.value : currentContent;
        copyText(valToCopy).then(() => toast('已成功复制当前内容到剪贴板！'));
      };
    }
  }

  /**
   * 渲染表格单元格内容 (对齐 Tab 5: 支持智能识别 JSON/长文本截断与双击详情)
   *
   * @param {*} val 单元格值
   * @param {string} [colName=''] 列名
   * @return {string} 渲染后的 td HTML 字符串
   */
  function renderNoviceCellTd(val, colName = '') {
    const colWidth = getNoviceColumnWidth(colName, 180);
    const baseTdStyle = `padding: 6px 10px; border-right: 1px solid #f0f0f0; width: ${colWidth}px; max-width: ${colWidth}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box;`;

    if (val === null || val === undefined) {
      return `<td style="${baseTdStyle}"><span style="color: #bfbfbf; font-style: italic;">null</span></td>`;
    }

    const strVal = String(val);
    const escapedFull = safeEscapeHtml(strVal);
    const jsonCheck = safeParseJson(strVal);
    const isMultiline = strVal.includes('\n') || strVal.includes('\r');
    const isLong = strVal.length > 20 || isMultiline || jsonCheck.isValid;

    if (isLong) {
      const tooltip = escapedFull.length > 300 ? escapedFull.substring(0, 300) + '...' : escapedFull;
      const displaySnippet = isMultiline ? strVal.replace(/[\r\n]+/g, ' ') : strVal;
      const shortText = displaySnippet.length > 35 ? displaySnippet.substring(0, 32) + '...' : displaySnippet;
      const encodedContent = encodeURIComponent(strVal);
      const jsonBadge = jsonCheck.isValid ? '<span style="background:#e6f7ff;color:#1890ff;border:1px solid #91d5ff;font-size:10px;padding:0 3px;border-radius:2px;margin-right:4px;font-weight:500;user-select:none;">JSON</span>' : '';
      const titleAttr = `title="${jsonCheck.isValid ? '【JSON 数据】' : ''}点击或双击查看完整内容 (支持格式化/压缩)&#10;${tooltip}"`;

      return `<td class="datax-dv-cell" data-full-content="${encodedContent}" data-col-name="${safeEscapeHtml(colName)}" style="${baseTdStyle}" ${titleAttr}>` +
        `${jsonBadge}<span class="datax-cell-long-text" data-content="${encodedContent}" style="color: #1890ff; cursor: pointer; text-decoration: underline;">${safeEscapeHtml(shortText)}</span>` +
        `</td>`;
    }

    return `<td class="datax-dv-cell" data-full-content="${encodeURIComponent(strVal)}" data-col-name="${safeEscapeHtml(colName)}" title="${escapedFull}" style="${baseTdStyle}">${escapedFull}</td>`;
  }

  /**
   * 绑定表格单元格详情事件 (单击超链接、双击单元格)
   */
  function bindNoviceCellDetailEvents(container) {
    if (!container) return;

    container.querySelectorAll('.datax-cell-long-text').forEach(el => {
      el.onclick = function (e) {
        e.stopPropagation();
        const content = decodeURIComponent(this.getAttribute('data-content') || '');
        const td = this.closest('td');
        const colName = td ? td.getAttribute('data-col-name') : '';
        const title = colName ? `字段 [${colName}]` : '字段文本详情';
        showNoviceCellDetailModal(title, content, colName);
      };
    });

    container.querySelectorAll('.datax-dv-cell').forEach(td => {
      td.ondblclick = function (e) {
        e.stopPropagation();
        const content = decodeURIComponent(this.getAttribute('data-full-content') || '');
        if (content) {
          const colName = this.getAttribute('data-col-name') || '';
          const title = colName ? `字段 [${colName}]` : '单元格内容详情';
          showNoviceCellDetailModal(title, content, colName);
        }
      };
    });
  }

  /**
   * 复制当前预览数据为格式化 JSON
   */
  function copyNoviceCurrentDataJson() {
    if (!currentPreviewRows || currentPreviewRows.length === 0) {
      toast('当前无数据记录可供复制');
      return;
    }
    const jsonStr = JSON.stringify(currentPreviewRows, null, 2);
    copyText(jsonStr).then(() => {
      toast(`📋 已成功复制当前页 ${currentPreviewRows.length} 条记录为 JSON 格式！`);
    });
  }

  // ==========================
  // 只读 SQL 执行与渲染公共引擎 (全面对齐 Tab 5)
  // ==========================

  /**
   * 渲染 SQL 查询返回的结果表格 (公共方法，全面对齐 Tab 5)
   *
   * @param {HTMLElement} resBox 结果容器 DOM
   * @param {Array<Object>} columns 列元数据列表 [{columnName, ...}]
   * @param {Array<Object>} rows 数据行列表
   * @param {number} costMs 执行耗时 (毫秒)
   */
  function renderNoviceSqlResultTable(resBox, columns, rows, costMs = 0) {
    if (!resBox) return;

    if (!columns || columns.length === 0 || !rows || rows.length === 0) {
      resBox.innerHTML = `<div style="padding: 36px; text-align: center; color: #52c41a; font-size: 13px;">🎉 SQL 执行成功！耗时: <strong>${costMs}</strong> ms (返回 0 行记录)</div>`;
      return;
    }

    let html = `
      <div style="padding: 6px 12px; background: #f6ffed; border-bottom: 1px solid #b7eb8f; color: #52c41a; font-size: 11px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 6;">
        <span>🎉 SQL 查询成功，共返回 <strong>${rows.length}</strong> 行记录</span>
        <span>⚡ 耗时: <strong>${costMs}</strong> ms</span>
      </div>
      <table style="width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; table-layout: fixed;">
        <thead>
          <tr style="background: #fafafa; border-bottom: 2px solid #e8e8e8; position: sticky; top: 29px; z-index: 5;">
            <th style="padding: 6px 10px; width: 45px; min-width: 45px; text-align: center; position: relative; user-select: none; background: #fafafa; border-right: 1px solid #f0f0f0;">#</th>
    `;

    columns.forEach(c => {
      const colName = c.columnName || '';
      const colWidth = getNoviceColumnWidth(colName, 180);
      html += `
        <th style="padding: 6px 10px; border-right: 1px solid #f0f0f0; white-space: nowrap; width: ${colWidth}px; min-width: 70px; background: #fafafa; vertical-align: middle; position: relative; box-sizing: border-box;">
          <span>${safeEscapeHtml(colName)}</span>
          <span class="datax-th-resizer" data-col="${safeEscapeHtml(colName)}" data-prevent-marquee="true" title="按住左右拖拽调整此列宽度" style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; user-select: none; z-index: 10;"></span>
        </th>
      `;
    });

    html += `</tr></thead><tbody>`;

    rows.forEach((r, idx) => {
      const rowBg = idx % 2 === 1 ? '#fafcff' : '#ffffff';
      html += `
        <tr style="background: ${rowBg}; border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 6px 10px; text-align: center; color: #8c8c8c; border-right: 1px solid #f0f0f0; width: 45px; box-sizing: border-box;">${idx + 1}</td>
      `;
      columns.forEach(c => {
        const colName = c.columnName || '';
        const val = r[colName];
        html += renderNoviceCellTd(val, colName);
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    resBox.innerHTML = html;

    // 绑定列宽自由拖拽与单元格详情
    bindNoviceColumnResize(resBox);
    bindNoviceCellDetailEvents(resBox);
  }

  /**
   * 统一执行只读 SQL (公共方法，集成鉴权、只读拦截、错误捕获与结果渲染)
   *
   * @param {Object} options 执行配置
   * @param {number} options.datasourceId 数据源 ID
   * @param {string} options.sql 待执行的 SQL 语句
   * @param {HTMLElement} options.resBox 结果容器
   * @param {number} [options.pageNo=1] 分页页码
   * @param {number} [options.pageSize=100] 最大拉取条数
   * @param {Function} [options.onSuccess] 成功回调 ({columns, rows, costMs}) => void
   */
  async function executeNoviceReadOnlySql(options = {}) {
    const { datasourceId, sql, resBox, pageNo = 1, pageSize = 100, onSuccess } = options;

    if (!datasourceId) {
      alertMsg('请先选择目标数据库！');
      return;
    }

    const cleanSql = (sql || '').trim();
    if (!cleanSql) {
      alertMsg('请输入待执行的只读 SELECT SQL 语句！');
      return;
    }

    if (resBox) {
      resBox.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #1890ff; font-size: 13px;">
          <div style="font-size: 22px; margin-bottom: 8px;">⏳</div>
          <div>正在执行 SQL 查询，请稍候...</div>
        </div>
      `;
    }

    try {
      const res = await getHttp().fetchJson('/api/tableData/executeSql', {
        method: 'POST',
        body: {
          datasourceId: parseInt(datasourceId, 10),
          sql: cleanSql,
          pageNo: pageNo,
          pageSize: pageSize
        }
      });

      if (!getHttp().isApiSuccess(res)) {
        throw new Error(getHttp().getApiMsg(res, 'SQL 执行失败'));
      }

      const queryResult = res.data || res.content || {};
      const columns = queryResult.columns || [];
      const rows = queryResult.rows || [];
      const costMs = queryResult.executeTimeMs || 0;

      renderNoviceSqlResultTable(resBox, columns, rows, costMs);

      if (typeof onSuccess === 'function') {
        onSuccess({ columns, rows, costMs });
      }
    } catch (err) {
      if (resBox) {
        resBox.innerHTML = `
          <div style="padding: 24px; text-align: center; color: #f5222d;">
            <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">❌ SQL 执行失败</div>
            <div style="font-size: 12px; background: #fff1f0; padding: 10px 14px; border-radius: 4px; display: inline-block; max-width: 90%; word-break: break-all; border: 1px solid #ffa39e; text-align: left;">
              ${safeEscapeHtml(err.message)}
            </div>
          </div>
        `;
      }
    }
  }

  /**
   * 通用导出 SQL 查询结果至 Excel
   *
   * @param {Array<Object>} rows 数据行
   * @param {Array<Object>} columns 列元数据
   * @param {string} [prefix='sql_query_result'] 文件名前缀
   */
  function exportNoviceSqlResultToExcel(rows, columns, prefix = 'sql_query_result') {
    if (!rows || rows.length === 0) {
      alertMsg('当前 SQL 查询结果为空，无可导出的数据！');
      return;
    }

    loadSheetJs((XLSX) => {
      if (!XLSX) {
        alertMsg('未检测到 SheetJS 导出引擎，请检查网络连接');
        return;
      }

      try {
        const exportData = rows.map(r => {
          const item = {};
          columns.forEach(c => {
            const colName = c.columnName || '';
            item[colName] = r[colName] !== undefined && r[colName] !== null ? r[colName] : '';
          });
          return item;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'SQL查询结果');
        const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        toast(`🎉 成功导出 ${rows.length} 条记录至 [${filename}]！`);
      } catch (err) {
        alertMsg('导出 Excel 失败: ' + err.message);
      }
    });
  }

  /**
   * 通用复制 SQL 查询结果为 JSON
   *
   * @param {Array<Object>} rows 数据行
   */
  function copyNoviceSqlResultToJson(rows) {
    if (!rows || rows.length === 0) {
      alertMsg('当前无查询结果可供复制！');
      return;
    }
    const jsonStr = JSON.stringify(rows, null, 2);
    copyText(jsonStr).then(() => {
      toast(`📋 已成功复制 ${rows.length} 条记录为 JSON 格式！`);
    });
  }

  /**
   * 填充工作台 SQL 辅助选表下拉框候选项
   */
  function populateNoviceSqlTableHelper() {
    const helperSel = document.getElementById('datax-novice-sql-table-helper');
    if (!helperSel) return;
    const curVal = helperSel.value;
    helperSel.innerHTML = '<option value="">-- 选择表 --</option>';

    noviceTables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.tableName;
      const comment = (t.tableComment || '').trim();
      opt.textContent = comment ? `${t.tableName} (${comment})` : t.tableName;
      helperSel.appendChild(opt);
    });

    if (curVal && Array.from(helperSel.options).some(o => o.value === curVal)) {
      helperSel.value = curVal;
    }
  }

  /**
   * 切换主工作台下部子 Tab (表清单 / 只读 SQL)
   *
   * @param {string} targetTab 目标标签 ('tables' | 'sql')
   */
  function switchNoviceWorkbenchTab(targetTab) {
    if (targetTab === 'sql' && !currentDsAllowSql) {
      toast('当前角色未开通在目标库执行只读 SQL 的权限');
      return;
    }
    activeWorkbenchTab = targetTab;
    const btnTables = document.getElementById('datax-novice-tab-tables');
    const btnSql = document.getElementById('datax-novice-tab-sql');
    const pnlTables = document.getElementById('datax-novice-panel-tables');
    const pnlSql = document.getElementById('datax-novice-panel-sql');
    const actTables = document.getElementById('datax-novice-tables-actions');
    const actSql = document.getElementById('datax-novice-sql-actions');

    if (targetTab === 'tables') {
      if (btnTables) {
        btnTables.style.background = '#fff';
        btnTables.style.color = '#1890ff';
        btnTables.style.fontWeight = 'bold';
        btnTables.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }
      if (btnSql) {
        btnSql.style.background = 'transparent';
        btnSql.style.color = '#606266';
        btnSql.style.fontWeight = 'normal';
        btnSql.style.boxShadow = 'none';
      }
      if (pnlTables) pnlTables.style.display = 'flex';
      if (pnlSql) pnlSql.style.display = 'none';
      if (actTables) actTables.style.display = 'flex';
      if (actSql) actSql.style.display = 'none';
    } else {
      if (btnTables) {
        btnTables.style.background = 'transparent';
        btnTables.style.color = '#606266';
        btnTables.style.fontWeight = 'normal';
        btnTables.style.boxShadow = 'none';
      }
      if (btnSql) {
        btnSql.style.background = '#fff';
        btnSql.style.color = '#1890ff';
        btnSql.style.fontWeight = 'bold';
        btnSql.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }
      if (pnlTables) pnlTables.style.display = 'none';
      if (pnlSql) pnlSql.style.display = 'flex';
      if (actTables) actTables.style.display = 'none';
      if (actSql) actSql.style.display = 'flex';

      populateNoviceSqlTableHelper();
      const sqlInput = document.getElementById('datax-novice-workbench-sql-input');
      if (sqlInput && !sqlInput.value.trim() && noviceTables.length > 0) {
        sqlInput.value = `SELECT * FROM ${noviceTables[0].tableName} LIMIT 50;`;
      }

      // 装配【SQL 查询管理】与【常用 SQL 选用】工具条 (账号强隔离)
      if (window.DataXAssistant && window.DataXAssistant.SqlTemplateManager && actSql) {
        window.DataXAssistant.SqlTemplateManager.bindSqlToolbar({
          toolbarContainer: actSql,
          textarea: 'datax-novice-workbench-sql-input',
          getTableName: () => {
            const helperSel = document.getElementById('datax-novice-sql-table-helper');
            return helperSel ? helperSel.value : '';
          },
          getDatasourceId: () => currentSelectedDsId,
          onSelect: () => executeNoviceWorkbenchSql()
        });
      }
    }
  }

  /**
   * 执行工作台只读 SQL 查询
   */
  async function executeNoviceWorkbenchSql() {
    const sqlInput = document.getElementById('datax-novice-workbench-sql-input');
    const resBox = document.getElementById('datax-novice-workbench-sql-result');
    const sql = (sqlInput ? sqlInput.value : '').trim();

    await executeNoviceReadOnlySql({
      datasourceId: currentSelectedDsId,
      sql: sql,
      resBox: resBox,
      pageNo: 1,
      pageSize: 100,
      onSuccess: ({ columns, rows }) => {
        workbenchSqlResultColumns = columns;
        workbenchSqlResultRows = rows;
      }
    });
  }

  /**
   * 从表列表快捷跳转并执行指定表的 SQL 查询
   *
   * @param {string} tableName 表名
   */
  function openWorkbenchSqlForTable(tableName) {
    switchNoviceWorkbenchTab('sql');
    const sqlInput = document.getElementById('datax-novice-workbench-sql-input');
    const helperSel = document.getElementById('datax-novice-sql-table-helper');
    if (sqlInput) {
      sqlInput.value = `SELECT * FROM ${tableName} LIMIT 50;`;
      sqlInput.focus();
    }
    if (helperSel) {
      helperSel.value = tableName;
    }
    executeNoviceWorkbenchSql();
  }

  /**
   * 打开表数据预览弹窗 (核心重构：全面对齐 Tab 5 视觉与交互风格)
   */
  async function openTableDataPreviewModal(tableName, tableComment) {
    if (activeDataModal) {
      activeDataModal.remove();
      activeDataModal = null;
    }

    currentPreviewTable = tableName;
    currentPreviewPage = 1;
    currentPreviewPageSize = 20;
    currentWhereClause = '';
    currentOrderField = '';
    currentOrderType = 'ASC';
    currentPreviewColumns = [];
    currentPreviewRows = [];
    currentCommentMode = localStorage.getItem(STORAGE_KEY_DV_COMMENT_MODE) || 'both';

    const modal = document.createElement('div');
    modal.className = isCurrentDarkMode() ? 'datax-sub-modal datax-dark-mode' : 'datax-sub-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 1000003;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div class="datax-data-dialog" style="background: #fff; border-radius: 8px; box-shadow: 0 8px 36px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden; position: absolute;">
        <!-- 头部 (支持拖拽移动与双击最大化) -->
        <div id="datax-data-modal-header" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 11px 18px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
          <div style="font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <span>库表数据浏览 - <code style="font-size: 14px; background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 4px;">${safeEscapeHtml(tableName)}</code></span>
            ${tableComment ? `<span style="font-size: 12px; font-weight: normal; opacity: 0.92;">(${safeEscapeHtml(tableComment)})</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="datax-data-modal-max" title="最大化窗口" style="font-size: 16px; cursor: pointer; line-height: 1; opacity: 0.85; user-select: none;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.85'">&#x25A2;</span>
            <span id="datax-data-modal-close" title="关闭" style="font-size: 20px; cursor: pointer; line-height: 1; opacity: 0.85; user-select: none;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.85'">&times;</span>
          </div>
        </div>

        <!-- 快捷功能子 Tab 切换 (对齐 Tab 5: 数据预览 / 字段结构 / 只读 SQL) -->
        <div class="datax-modal-subtab-bar" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: #fafafa; border-bottom: 1px solid #e8e8e8;">
          <div style="display: flex; gap: 6px;">
            <button id="datax-modal-tab-data" type="button" style="background: #1890ff; color: #fff; border: 1px solid #1890ff; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">表数据</button>
            <button id="datax-modal-tab-cols" type="button" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer;">字段结构</button>
            <button id="datax-modal-tab-sql" type="button" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer;">SQL 查询</button>
          </div>
        </div>

        <!-- 子面板 1：表数据列表面板 -->
        <div id="datax-modal-panel-data" style="display: flex; flex-direction: column; flex: 1; overflow: hidden;">
          <!-- 顶部控制与过滤栏 (第一行：快捷字段过滤 + 高级 WHERE 条件 + 查询/重置) -->
          <div class="datax-data-filter-bar" style="display: flex; gap: 6px; padding: 8px 14px; background: #fff; border-bottom: 1px solid #ebeef5; align-items: center; flex-wrap: wrap;">
            <!-- 快捷字段过滤 (优先展示中文备注) -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 12px; font-weight: bold; color: #1890ff; white-space: nowrap;">🔍 字段过滤:</span>
              <!-- 字段下拉选择框 -->
              <select id="datax-novice-col-select" style="min-width: 170px; max-width: 250px; padding: 5px 6px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;" title="选择要过滤的字段（优先展示中文注释）">
                <option value="">-- 选择过滤字段 --</option>
              </select>
              <!-- 关系操作符 -->
              <select id="datax-novice-op-select" style="width: 86px; padding: 5px 4px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;">
                <option value="LIKE">包含</option>
                <option value="=">等于 =</option>
                <option value="!=">不等于 !=</option>
                <option value=">">大于 &gt;</option>
                <option value="<">小于 &lt;</option>
                <option value=">=">大于等于 &gt;=</option>
                <option value="<=">小于等于 &lt;=</option>
                <option value="IS NULL">为空 NULL</option>
                <option value="IS NOT NULL">非空 NOT NULL</option>
              </select>
              <!-- 过滤值输入框 -->
              <input type="text" id="datax-novice-val-input" placeholder="输入过滤内容..." style="width: 150px; padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 3px;" />
            </div>

            <!-- 高级 WHERE 条件输入框 (可选协同) -->
            <input type="text" id="datax-novice-where-input" placeholder="可选高级 WHERE (例如: id > 10 或 status = 1)" style="flex: 1; min-width: 180px; padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 3px;" />

            <!-- 查询与重置按钮 -->
            <button id="datax-novice-btn-query" style="background: #1890ff; color: #fff; border: none; padding: 5px 14px; border-radius: 3px; font-weight: bold; cursor: pointer; font-size: 12px; white-space: nowrap;">🔍 查询</button>
            <button id="datax-novice-btn-reset" style="background: #f0f2f5; color: #606266; border: 1px solid #dcdfe6; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; white-space: nowrap;">重置</button>
          </div>

          <!-- 顶部工具与偏好栏 (第二行：排序、分页、表头模式、刷新、导出Excel、复制JSON) -->
          <div class="datax-data-tools-bar" style="display: flex; gap: 8px; padding: 6px 14px; background: #fafafa; border-bottom: 1px solid #ebeef5; align-items: center; flex-wrap: wrap;">
            <!-- 排序字段与方向 -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 11px; color: #606266; white-space: nowrap; font-weight: 500;">排序:</label>
              <select id="datax-novice-order-field" style="width: 140px; padding: 4px 6px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;">
                <option value="">-- 默认排序 --</option>
              </select>
              <select id="datax-novice-order-type" style="width: 80px; padding: 4px 6px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;">
                <option value="ASC">升序 ASC</option>
                <option value="DESC">降序 DESC</option>
              </select>
            </div>

            <!-- 分页大小 -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 11px; color: #606266; white-space: nowrap; font-weight: 500;">每页:</label>
              <select id="datax-novice-page-size" style="width: 86px; padding: 4px 6px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;">
                <option value="20">20 条/页</option>
                <option value="50">50 条/页</option>
                <option value="100">100 条/页</option>
                <option value="200">200 条/页</option>
                <option value="500">500 条/页</option>
              </select>
            </div>

            <!-- 表头备注展示模式切换 (对齐 Tab 5) -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 11px; color: #595959; white-space: nowrap; font-weight: 600;">表头备注:</label>
              <select id="datax-novice-comment-mode" style="padding: 3px 8px; font-size: 11px; border: 1px solid #91d5ff; border-radius: 3px; background: #e6f7ff; color: #096dd9; font-weight: 600; cursor: pointer;" title="切换数据预览表头的字段备注展示方式">
                <option value="both"${currentCommentMode === 'both' ? ' selected' : ''}>🏷️ 字段名 + 备注 (双行)</option>
                <option value="commentFirst"${currentCommentMode === 'commentFirst' ? ' selected' : ''}>📝 优先显示备注</option>
                <option value="nameOnly"${currentCommentMode === 'nameOnly' ? ' selected' : ''}>🔤 仅显示字段名</option>
              </select>
            </div>

            <!-- 右侧快捷操作按钮组 -->
            <div style="display: flex; gap: 6px; margin-left: auto;">
              <button id="datax-novice-btn-refresh" style="background: #f0f2f5; color: #303133; border: 1px solid #dcdfe6; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">刷新</button>
              <button id="datax-novice-btn-export-excel" style="background: #52c41a; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer;">导出 Excel</button>
              <button id="datax-novice-btn-copy-json" style="background: #722ed1; color: #fff; border: none; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">复制 JSON</button>
            </div>
          </div>

          <!-- 表格状态与统计提示行 (对齐 Tab 5) -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: #fafafa; border-bottom: 1px solid #f0f0f0; font-size: 11px; color: #606266;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="datax-novice-table-target-desc" style="font-weight: bold; color: #303133;">-</span>
              <span id="datax-novice-query-stat" style="color: #52c41a; font-weight: 500;"></span>
              <span style="color: #8c8c8c;">💡 数据单元格可直接划词双击查看详情与复制；拖拽表头边线可调整列宽</span>
            </div>
            <div id="datax-novice-status-tip" style="color: #1890ff; font-weight: bold;"></div>
          </div>

          <!-- 数据表格展示区域 (对齐 Tab 5) -->
          <div id="datax-data-table-container" style="flex: 1; overflow: auto; background: #fff; position: relative;">
            <div style="padding: 48px; text-align: center; color: #1890ff; font-size: 13px;">
              ⏳ 正在读取数据表行记录...
            </div>
          </div>

          <!-- 分页控制栏 (对齐 Tab 5: 首页/上一页/跳转页码/下一页) -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 14px; background: #fafafa; border-top: 1px solid #ebeef5;">
            <div style="font-size: 11px; color: #606266;">
              共 <strong id="datax-novice-total-records" style="color: #1890ff;">0</strong> 条记录 | 第 <span id="datax-novice-current-page-text">1</span> / <span id="datax-novice-total-pages-text">1</span> 页
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
              <button id="datax-novice-btn-first" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">首页</button>
              <button id="datax-novice-btn-prev" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">上一页</button>
              <input type="number" id="datax-novice-jump-page" min="1" value="1" style="width: 44px; padding: 2px 4px; font-size: 11px; text-align: center; border: 1px solid #dcdfe6; border-radius: 3px;" />
              <button id="datax-novice-btn-jump" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">跳转</button>
              <button id="datax-novice-btn-next" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">下一页</button>
            </div>
          </div>
        </div>

        <!-- 子面板 2：表字段结构元数据面板 -->
        <div id="datax-modal-panel-cols" style="display: none; flex-direction: column; flex: 1; overflow: hidden;">
          <div style="padding: 10px 18px; background: #fafafa; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
              <input type="text" id="datax-modal-col-search-kw" placeholder="🔍 搜索字段名称或中文注释..." style="width: 280px; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
              <span id="datax-modal-col-stat-text" style="font-size: 12px; color: #8c8c8c;">加载中...</span>
            </div>
            <div>
              <button id="datax-modal-col-copy-all-btn" style="background: #1890ff; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: bold;">
                复制所有字段名 (逗号分隔)
              </button>
            </div>
          </div>
          <div id="datax-modal-col-table-container" style="flex: 1; overflow-y: auto; padding: 0;">
            <div style="padding: 40px; text-align: center; color: #1890ff; font-size: 13px;">
              ⏳ 正在读取表结构元数据...
            </div>
          </div>
        </div>

        <!-- 子面板 3：只读 SQL 控制台面板 (全面对齐 Tab 5) -->
        <div id="datax-modal-panel-sql" style="display: none; flex-direction: column; flex: 1; overflow: hidden; padding: 10px 14px; box-sizing: border-box; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="color: #303133; font-size: 13px;">只读 SQL 查询控制台</strong>
              <span style="font-size: 11px; color: #52c41a; background: #f6ffed; border: 1px solid #b7eb8f; padding: 2px 8px; border-radius: 3px;">🛡️ 仅允许 SELECT / WITH / EXPLAIN</span>
            </div>
            <div id="datax-modal-sql-actions-bar" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <button id="datax-modal-btn-execute-sql" style="background: #1890ff; color: #fff; border: none; padding: 5px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(24,144,255,0.25);" title="快捷键: Ctrl + Enter">
                执行 SQL
              </button>
              <button id="datax-modal-btn-export-sql-excel" style="background: #52c41a; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;" title="导出当前 SQL 查询结果为 Excel">
                导出 Excel
              </button>
              <button id="datax-modal-btn-copy-sql-json" style="background: #722ed1; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="复制当前 SQL 结果为 JSON">
                复制 JSON
              </button>
              <button id="datax-modal-btn-clear-sql" style="background: #f0f2f5; color: #606266; border: 1px solid #dcdfe6; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                清空
              </button>
            </div>
          </div>

          <textarea id="datax-modal-sql-input" placeholder="请输入 SELECT 语句，按 Ctrl+Enter 快捷执行..." style="width: 100%; height: 86px; min-height: 70px; box-sizing: border-box; padding: 8px 10px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fdfdfd; line-height: 1.45; resize: vertical; outline: none;">SELECT * FROM ${safeEscapeHtml(tableName)} LIMIT 50;</textarea>

          <div id="datax-modal-sql-result-container" style="flex: 1; min-height: 180px; overflow: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff; position: relative;">
            <div style="padding: 36px; text-align: center; color: #909399; font-size: 12px;">
              💡 点击【⚡ 执行 SQL】或按 <kbd style="background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;padding:1px 4px;">Ctrl+Enter</kbd> 查看查询结果
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    activeDataModal = modal;

    // 初始居中与尺寸设定
    const dataDialog = modal.querySelector('.datax-data-dialog');
    const initDataW = Math.min(1250, Math.max(780, window.innerWidth * 0.94));
    const initDataH = Math.min(window.innerHeight * 0.90, 820);
    dataDialog.style.width = `${initDataW}px`;
    dataDialog.style.height = `${initDataH}px`;
    dataDialog.style.left = `${Math.max(10, Math.round((window.innerWidth - initDataW) / 2))}px`;
    dataDialog.style.top = `${Math.max(10, Math.round((window.innerHeight - initDataH) / 2))}px`;

    const dataHeader = modal.querySelector('#datax-data-modal-header');
    const dataMaxBtn = modal.querySelector('#datax-data-modal-max');
    const destroyDataDrag = makeDialogDraggableAndResizable(dataDialog, dataHeader, {
      minWidth: 650,
      minHeight: 420,
      maxBtn: dataMaxBtn
    });

    const closeModal = () => {
      if (typeof destroyDataDrag === 'function') destroyDataDrag();
      modal.remove();
      activeDataModal = null;
    };

    modal.querySelector('#datax-data-modal-close').onclick = closeModal;
    modal.onmousedown = (e) => {
      if (e.target === modal) closeModal();
    };

    // 弹窗内部子 Tab 切换绑定 (数据预览 / 字段结构 / 只读 SQL)
    let modalSqlColumns = [];
    let modalSqlRows = [];
    let modalColumnsLoaded = false;

    const btnTabDat = modal.querySelector('#datax-modal-tab-data');
    const btnTabCols = modal.querySelector('#datax-modal-tab-cols');
    const btnTabSql = modal.querySelector('#datax-modal-tab-sql');
    if (btnTabSql) {
      btnTabSql.style.display = currentDsAllowSql ? 'inline-block' : 'none';
    }
    const pnlDat = modal.querySelector('#datax-modal-panel-data');
    const pnlCols = modal.querySelector('#datax-modal-panel-cols');
    const pnlSql = modal.querySelector('#datax-modal-panel-sql');

    function resetModalSubTabs() {
      [btnTabDat, btnTabCols, btnTabSql].forEach(b => {
        if (!b) return;
        b.style.background = '#fff';
        b.style.color = '#606266';
        b.style.borderColor = '#dcdfe6';
        b.style.fontWeight = 'normal';
      });
      [pnlDat, pnlCols, pnlSql].forEach(p => { if (p) p.style.display = 'none'; });
    }

    if (btnTabDat) {
      btnTabDat.onclick = () => {
        resetModalSubTabs();
        btnTabDat.style.background = '#1890ff';
        btnTabDat.style.color = '#fff';
        btnTabDat.style.borderColor = '#1890ff';
        btnTabDat.style.fontWeight = 'bold';
        if (pnlDat) pnlDat.style.display = 'flex';
      };
    }

    if (btnTabCols) {
      btnTabCols.onclick = async () => {
        resetModalSubTabs();
        btnTabCols.style.background = '#1890ff';
        btnTabCols.style.color = '#fff';
        btnTabCols.style.borderColor = '#1890ff';
        btnTabCols.style.fontWeight = 'bold';
        if (pnlCols) pnlCols.style.display = 'flex';

        if (!modalColumnsLoaded) {
          modalColumnsLoaded = true;
          try {
            const url = `/api/tableData/columns?datasourceId=${currentSelectedDsId}&tableName=${encodeURIComponent(tableName)}${currentSelectedSchema ? '&tableSchema=' + encodeURIComponent(currentSelectedSchema) : ''}`;
            const res = await getHttp().fetchJson(url, { method: 'GET' });
            if (getHttp().isApiSuccess(res)) {
              const cols = getHttp().extractListFromResponse(res) || [];
              renderColumnsTable(modal, cols, {
                container: modal.querySelector('#datax-modal-col-table-container'),
                statText: modal.querySelector('#datax-modal-col-stat-text'),
                searchInput: modal.querySelector('#datax-modal-col-search-kw'),
                copyBtn: modal.querySelector('#datax-modal-col-copy-all-btn')
              });
            }
          } catch (e) {
            const cBox = modal.querySelector('#datax-modal-col-table-container');
            if (cBox) cBox.innerHTML = `<div style="padding:30px;text-align:center;color:#ff4d4f;">❌ 获取字段元数据失败: ${safeEscapeHtml(e.message)}</div>`;
          }
        }
      };
    }

    async function executeModalSql() {
      const sqlInput = modal.querySelector('#datax-modal-sql-input');
      const resBox = modal.querySelector('#datax-modal-sql-result-container');
      const sql = (sqlInput ? sqlInput.value : '').trim();

      await executeNoviceReadOnlySql({
        datasourceId: currentSelectedDsId,
        sql: sql,
        resBox: resBox,
        pageNo: 1,
        pageSize: 100,
        onSuccess: ({ columns, rows }) => {
          modalSqlColumns = columns;
          modalSqlRows = rows;
        }
      });
    }

    if (btnTabSql) {
      btnTabSql.onclick = () => {
        resetModalSubTabs();
        btnTabSql.style.background = '#1890ff';
        btnTabSql.style.color = '#fff';
        btnTabSql.style.borderColor = '#1890ff';
        btnTabSql.style.fontWeight = 'bold';
        if (pnlSql) pnlSql.style.display = 'flex';

        // 首次切入若尚未执行过查询，自动执行一次
        if (modalSqlRows.length === 0) {
          executeModalSql();
        }
      };
    }

    const modalBtnExecSql = modal.querySelector('#datax-modal-btn-execute-sql');
    if (modalBtnExecSql) modalBtnExecSql.onclick = executeModalSql;

    const modalSqlInput = modal.querySelector('#datax-modal-sql-input');
    if (modalSqlInput) {
      modalSqlInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          executeModalSql();
        }
      });
    }

    const modalBtnExportSql = modal.querySelector('#datax-modal-btn-export-sql-excel');
    if (modalBtnExportSql) {
      modalBtnExportSql.onclick = () => {
        exportNoviceSqlResultToExcel(modalSqlRows, modalSqlColumns, `${tableName}_sql`);
      };
    }

    const modalBtnCopySql = modal.querySelector('#datax-modal-btn-copy-sql-json');
    if (modalBtnCopySql) {
      modalBtnCopySql.onclick = () => {
        copyNoviceSqlResultToJson(modalSqlRows);
      };
    }

    const modalBtnClearSql = modal.querySelector('#datax-modal-btn-clear-sql');
    if (modalBtnClearSql) {
      modalBtnClearSql.onclick = () => {
        if (modalSqlInput) modalSqlInput.value = '';
        const resBox = modal.querySelector('#datax-modal-sql-result-container');
        if (resBox) {
          resBox.innerHTML = `
            <div style="padding: 36px; text-align: center; color: #909399; font-size: 12px;">
              💡 点击【⚡ 执行 SQL】或按 <kbd style="background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;padding:1px 4px;">Ctrl+Enter</kbd> 查看查询结果
            </div>
          `;
        }
      };
    }

    // 装配【SQL 查询管理】与【常用 SQL 选用】工具条 (账号强隔离)
    if (window.DataXAssistant && window.DataXAssistant.SqlTemplateManager) {
      const modalSqlToolbar = modal.querySelector('#datax-modal-sql-actions-bar');
      if (modalSqlToolbar) {
        window.DataXAssistant.SqlTemplateManager.bindSqlToolbar({
          toolbarContainer: modalSqlToolbar,
          textarea: modalSqlInput,
          getTableName: () => tableName,
          getDatasourceId: () => currentSelectedDsId,
          onSelect: () => {
            executeModalSql();
          }
        });
      }
    }
    // 事件绑定：快捷字段过滤与高级查询
    const colSelect = modal.querySelector('#datax-novice-col-select');
    const opSelect = modal.querySelector('#datax-novice-op-select');
    const valInput = modal.querySelector('#datax-novice-val-input');
    const whereInput = modal.querySelector('#datax-novice-where-input');
    const orderFieldSel = modal.querySelector('#datax-novice-order-field');
    const orderTypeSel = modal.querySelector('#datax-novice-order-type');
    const pageSizeSel = modal.querySelector('#datax-novice-page-size');
    const commentModeSel = modal.querySelector('#datax-novice-comment-mode');

    // 操作符切换联动 (IS NULL / IS NOT NULL 禁用输入框)
    if (opSelect && valInput) {
      opSelect.onchange = () => {
        if (opSelect.value === 'IS NULL' || opSelect.value === 'IS NOT NULL') {
          valInput.value = '';
          valInput.disabled = true;
          valInput.placeholder = '无需输入内容';
        } else {
          valInput.disabled = false;
          valInput.placeholder = '输入过滤内容...';
        }
      };
    }

    const doQuery = (pageNo = 1) => {
      currentPreviewPage = pageNo;
      currentQueryField = colSelect ? colSelect.value : '';
      currentQueryOp = opSelect ? opSelect.value : 'LIKE';
      currentQueryVal = valInput ? valInput.value.trim() : '';

      const quickWhere = buildSafeWhereClause(currentQueryField, currentQueryOp, currentQueryVal);
      const advWhere = (whereInput ? whereInput.value : '').trim();

      // 智能融合：快捷字段条件与高级 WHERE 条件协同组合
      if (quickWhere && advWhere) {
        currentWhereClause = `(${quickWhere}) AND (${advWhere})`;
      } else if (quickWhere) {
        currentWhereClause = quickWhere;
      } else if (advWhere) {
        currentWhereClause = advWhere;
      } else {
        currentWhereClause = '';
      }

      currentOrderField = orderFieldSel ? orderFieldSel.value : '';
      currentOrderType = orderTypeSel ? orderTypeSel.value : 'ASC';
      currentPreviewPageSize = parseInt(pageSizeSel ? pageSizeSel.value : '20', 10);
      fetchAndRenderTableData(modal);
    };

    modal.querySelector('#datax-novice-btn-query').onclick = () => doQuery(1);
    if (valInput) {
      valInput.onkeydown = (e) => {
        if (e.key === 'Enter') doQuery(1);
      };
    }
    if (whereInput) {
      whereInput.onkeydown = (e) => {
        if (e.key === 'Enter') doQuery(1);
      };
    }

    if (orderFieldSel) orderFieldSel.onchange = () => doQuery(1);
    if (orderTypeSel) orderTypeSel.onchange = () => doQuery(1);
    if (pageSizeSel) pageSizeSel.onchange = () => doQuery(1);

    // 重置按钮：清空快捷字段与高级条件
    modal.querySelector('#datax-novice-btn-reset').onclick = () => {
      if (colSelect) colSelect.value = '';
      if (opSelect) opSelect.value = 'LIKE';
      if (valInput) {
        valInput.value = '';
        valInput.disabled = false;
        valInput.placeholder = '输入过滤内容...';
      }
      if (whereInput) whereInput.value = '';
      if (orderFieldSel) orderFieldSel.value = '';
      if (orderTypeSel) orderTypeSel.value = 'ASC';
      doQuery(1);
    };

    // 表头备注模式切换 (即时刷新表头展示，无需重新请求后台)
    if (commentModeSel) {
      commentModeSel.onchange = function () {
        currentCommentMode = this.value || 'both';
        try {
          localStorage.setItem(STORAGE_KEY_DV_COMMENT_MODE, currentCommentMode);
        } catch (e) {}
        if (currentPreviewColumns && currentPreviewColumns.length > 0 && currentPreviewRows && currentPreviewRows.length > 0) {
          renderDataTableGrid(modal, currentPreviewColumns, currentPreviewRows);
        }
      };
    }

    // 刷新按钮
    modal.querySelector('#datax-novice-btn-refresh').onclick = () => {
      doQuery(currentPreviewPage);
    };

    // 导出 Excel 按钮
    modal.querySelector('#datax-novice-btn-export-excel').onclick = () => {
      exportCurrentDataToExcel();
    };

    // 复制 JSON 按钮
    modal.querySelector('#datax-novice-btn-copy-json').onclick = () => {
      copyNoviceCurrentDataJson();
    };

    // 分页栏绑定 (首页/上一页/下一页/跳转)
    modal.querySelector('#datax-novice-btn-first').onclick = () => doQuery(1);
    modal.querySelector('#datax-novice-btn-prev').onclick = () => {
      if (currentPreviewPage > 1) doQuery(currentPreviewPage - 1);
    };
    modal.querySelector('#datax-novice-btn-next').onclick = () => {
      const totalPages = Math.max(1, Math.ceil(currentPreviewTotal / currentPreviewPageSize));
      if (currentPreviewPage < totalPages) doQuery(currentPreviewPage + 1);
    };
    modal.querySelector('#datax-novice-btn-jump').onclick = () => {
      const jumpInput = modal.querySelector('#datax-novice-jump-page');
      const page = parseInt(jumpInput ? jumpInput.value : '1', 10);
      if (page >= 1) doQuery(page);
    };

    // 先拉取表字段以预填充快捷过滤与排序字段下拉框
    await populateNoviceFieldsMeta(modal, tableName);

    // 随后拉取表数据
    fetchAndRenderTableData(modal);
  }

  /**
   * 拉取表字段以预填充快捷过滤与排序下拉框 (对齐 Tab 5 规范)
   */
  async function populateNoviceFieldsMeta(modal, tableName) {
    const colSelect = modal.querySelector('#datax-novice-col-select');
    const orderSelect = modal.querySelector('#datax-novice-order-field');
    if (!colSelect && !orderSelect) return;

    try {
      const url = `/api/tableData/columns?datasourceId=${currentSelectedDsId}&tableName=${encodeURIComponent(tableName)}${currentSelectedSchema ? '&tableSchema=' + encodeURIComponent(currentSelectedSchema) : ''}`;
      const res = await getHttp().fetchJson(url, { method: 'GET' });
      if (getHttp().isApiSuccess(res)) {
        const columns = getHttp().extractListFromResponse(res) || [];
        renderNoviceFilterFieldOptions(modal, columns, currentQueryField);
        renderNoviceOrderFieldOptions(modal, columns, currentOrderField);
      }
    } catch (ignored) {}
  }

  /**
   * 渲染快捷过滤字段下拉框候选项 (优先突出中文注释)
   */
  function renderNoviceFilterFieldOptions(modal, columns, selectedField = '') {
    const colSelect = modal.querySelector('#datax-novice-col-select');
    if (!colSelect) return;

    colSelect.innerHTML = '<option value="">-- 选择过滤字段 --</option>';
    columns.forEach(col => {
      const opt = document.createElement('option');
      opt.value = col.columnName;
      const comment = col.comment ? col.comment.trim() : '';
      opt.textContent = comment ? `${comment} (${col.columnName})` : col.columnName;
      if (selectedField && col.columnName === selectedField) {
        opt.selected = true;
      }
      colSelect.appendChild(opt);
    });
  }

  /**
   * 渲染排序字段下拉框候选项
   */
  function renderNoviceOrderFieldOptions(modal, columns, selectedField = '') {
    const orderSelect = modal.querySelector('#datax-novice-order-field');
    if (!orderSelect) return;

    orderSelect.innerHTML = '<option value="">-- 默认排序 --</option>';
    columns.forEach(col => {
      const opt = document.createElement('option');
      opt.value = col.columnName;
      const comment = col.comment ? col.comment.trim() : '';
      opt.textContent = comment ? `${col.columnName} (${comment})` : col.columnName;
      if (selectedField && col.columnName === selectedField) {
        opt.selected = true;
      }
      orderSelect.appendChild(opt);
    });
  }

  /**
   * 构建安全 WHERE 过滤条件 (防 SQL 注入，过滤非法列名与转义单引号)
   */
  function buildSafeWhereClause(col, op, val) {
    if (!col) return '';
    const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeCol) return '';

    if (op === 'IS NULL') {
      return `${safeCol} IS NULL`;
    }
    if (op === 'IS NOT NULL') {
      return `${safeCol} IS NOT NULL`;
    }

    if (val === undefined || val === null || val === '') return '';

    // 防 SQL 注入：单引号转义为双单引号
    const safeVal = String(val).replace(/'/g, "''");

    if (op === 'LIKE') {
      return `${safeCol} LIKE '%${safeVal}%'`;
    }
    if (['=', '!=', '>', '<', '>=', '<='].includes(op)) {
      return `${safeCol} ${op} '${safeVal}'`;
    }
    return '';
  }

  /**
   * 分页拉取真实表数据并渲染表格 (对齐 Tab 5: 支持 WHERE、ORDER BY、耗时统计与多模式表头)
   */
  async function fetchAndRenderTableData(modal) {
    const tableContainer = modal.querySelector('#datax-data-table-container');
    const targetDescEl = modal.querySelector('#datax-novice-table-target-desc');
    const queryStatEl = modal.querySelector('#datax-novice-query-stat');
    const statusTipEl = modal.querySelector('#datax-novice-status-tip');
    const totalRecordsEl = modal.querySelector('#datax-novice-total-records');
    const curPageEl = modal.querySelector('#datax-novice-current-page-text');
    const totalPagesEl = modal.querySelector('#datax-novice-total-pages-text');
    const jumpInput = modal.querySelector('#datax-novice-jump-page');
    const btnPrev = modal.querySelector('#datax-novice-btn-prev');
    const btnNext = modal.querySelector('#datax-novice-btn-next');

    if (tableContainer) {
      tableContainer.innerHTML = `
        <div style="padding: 48px; text-align: center; color: #1890ff; font-size: 13px;">
          <div style="font-size: 22px; margin-bottom: 8px;">⏳</div>
          <div>正在从数据库查询数据中，请稍候...</div>
        </div>
      `;
    }
    if (statusTipEl) statusTipEl.textContent = '查询中...';

    try {
      const orderByStr = currentOrderField ? `${currentOrderField} ${currentOrderType}` : null;
      const payload = {
        datasourceId: currentSelectedDsId,
        tableSchema: currentSelectedSchema || null,
        tableName: currentPreviewTable,
        pageNo: currentPreviewPage,
        pageSize: currentPreviewPageSize,
        whereClause: currentWhereClause || null,
        orderBy: orderByStr,
        countTotal: true
      };

      const res = await getHttp().fetchJson('/api/tableData/query', {
        method: 'POST',
        body: payload
      });

      if (!getHttp().isApiSuccess(res)) {
        throw new Error(getHttp().getApiMsg(res, '查询数据失败'));
      }

      const result = res.data || {};
      currentPreviewColumns = result.columns || [];
      currentPreviewRows = result.rows || [];
      currentPreviewTotal = typeof result.totalCount === 'number' && result.totalCount >= 0 ? result.totalCount : currentPreviewRows.length;
      const executeTime = result.executeTimeMs !== undefined ? `${result.executeTimeMs}ms` : '';

      const totalPages = Math.max(1, Math.ceil(currentPreviewTotal / currentPreviewPageSize));

      if (targetDescEl) {
        targetDescEl.textContent = `当前表: ${currentPreviewTable}`;
      }
      if (queryStatEl) {
        queryStatEl.textContent = `共 ${currentPreviewTotal.toLocaleString()} 条记录${executeTime ? ' · 耗时 ' + executeTime : ''}`;
      }
      if (statusTipEl) statusTipEl.textContent = '';
      if (totalRecordsEl) totalRecordsEl.textContent = currentPreviewTotal.toLocaleString();
      if (curPageEl) curPageEl.textContent = currentPreviewPage;
      if (totalPagesEl) totalPagesEl.textContent = totalPages;
      if (jumpInput) {
        jumpInput.value = currentPreviewPage;
        jumpInput.max = totalPages;
      }

      if (btnPrev) btnPrev.disabled = currentPreviewPage <= 1;
      if (btnNext) btnNext.disabled = currentPreviewPage >= totalPages;

      // 若排序下拉框尚未初始化候选项，自动填充
      const orderSelect = modal.querySelector('#datax-novice-order-field');
      if (orderSelect && orderSelect.options.length <= 1 && currentPreviewColumns.length > 0) {
        renderNoviceOrderFieldOptions(modal, currentPreviewColumns, currentOrderField);
      }

      renderDataTableGrid(modal, currentPreviewColumns, currentPreviewRows);
    } catch (err) {
      if (statusTipEl) statusTipEl.textContent = '';
      if (tableContainer) {
        tableContainer.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #ff4d4f; font-size: 13px;">
            ❌ 数据读取异常: ${safeEscapeHtml(err.message)}
          </div>
        `;
      }
    }
  }

  /**
   * 渲染数据表格主体 (全面对齐 Tab 5: 固定布局、三种表头备注展示、列宽拖拽手柄、智能单元格)
   */
  function renderDataTableGrid(modal, columns, rows) {
    const container = modal.querySelector('#datax-data-table-container');
    if (!container) return;

    if (!columns || columns.length === 0) {
      container.innerHTML = `
        <div style="padding: 48px; text-align: center; color: #909399; font-size: 13px;">
          未检索到任何字段数据
        </div>
      `;
      return;
    }

    if (!rows || rows.length === 0) {
      container.innerHTML = `
        <div style="padding: 48px; text-align: center; color: #909399; font-size: 13px;">
          当前表无符合条件的数据记录 (当前表为空或 WHERE 条件无匹配)
        </div>
      `;
      return;
    }

    let html = `
      <table style="width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; table-layout: fixed;">
        <thead>
          <tr style="background: #fafafa; border-bottom: 2px solid #e8e8e8; position: sticky; top: 0; z-index: 5;">
            <th style="padding: 8px 10px; color: #595959; font-weight: 600; border-right: 1px solid #f0f0f0; width: 45px; min-width: 45px; text-align: center; background: #fafafa; position: relative; user-select: none;">#</th>
    `;

    // 依次渲染表头列 (根据 currentCommentMode 动态切换)
    columns.forEach(col => {
      const colWidth = getNoviceColumnWidth(col.columnName, 180);
      const pkBadge = col.isPrimaryKey ? ' <span title="主键" style="color:#faad14;">🔑</span>' : '';
      const typeDesc = col.columnType ? `<span style="font-size: 10px; color: #8c8c8c; font-weight: normal; margin-left: 3px;">(${col.columnType})</span>` : '';
      const commentDesc = col.comment ? ` title="注释: ${safeEscapeHtml(col.comment)}"` : '';

      let headerContent = '';
      if (currentCommentMode === 'both') {
        // 模式 1：字段名 + 备注 (双行立体展示，对齐 Tab 5 默认推荐)
        headerContent = `
          <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="font-weight: 600; font-size: 12px; color: #1f1f1f; overflow: hidden; text-overflow: ellipsis;">${safeEscapeHtml(col.columnName)}</span>
              ${pkBadge}
              ${typeDesc}
            </div>
            <div style="font-size: 11px; color: ${col.comment ? '#d46b08' : '#bfbfbf'}; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${col.comment ? `注释: ${safeEscapeHtml(col.comment)}` : '暂无注释'}">
              ${col.comment ? `📝 ${safeEscapeHtml(col.comment)}` : '<span style="color:#bfbfbf;">(无备注)</span>'}
            </div>
          </div>
        `;
      } else if (currentCommentMode === 'commentFirst') {
        // 模式 2：优先突出显示备注 (备注为主标题，字段名为副标题)
        headerContent = `
          <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="font-weight: bold; font-size: 12px; color: ${col.comment ? '#d4380d' : '#1f1f1f'}; overflow: hidden; text-overflow: ellipsis;">
                ${col.comment ? `📝 ${safeEscapeHtml(col.comment)}` : safeEscapeHtml(col.columnName)}
              </span>
              ${pkBadge}
            </div>
            <div style="font-size: 11px; color: #8c8c8c; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${col.comment ? safeEscapeHtml(col.columnName) : ''} ${typeDesc}
            </div>
          </div>
        `;
      } else {
        // 模式 3：纯字段名紧凑模式
        headerContent = `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeEscapeHtml(col.columnName)}</span>${pkBadge}${typeDesc}`;
      }

      html += `
        <th style="padding: 6px 10px; color: #262626; font-weight: 600; border-right: 1px solid #f0f0f0; white-space: nowrap; width: ${colWidth}px; min-width: 70px; background: #fafafa; vertical-align: middle; position: relative; box-sizing: border-box;"${commentDesc}>
          ${headerContent}
          <span class="datax-th-resizer" data-col="${safeEscapeHtml(col.columnName)}" title="按住左右拖拽调整此列宽度" style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; user-select: none; z-index: 10;"></span>
        </th>
      `;
    });

    html += `</tr></thead><tbody>`;

    // 数据行渲染 (对齐 Tab 5: 斑马纹、智能单元格、长文本截断、JSON标签)
    rows.forEach((row, rIdx) => {
      const isEven = rIdx % 2 === 0;
      const seq = (currentPreviewPage - 1) * currentPreviewPageSize + (rIdx + 1);

      html += `
        <tr class="datax-data-tr ${isEven ? 'even' : 'odd'}" style="border-bottom: 1px solid #f0f0f0; transition: background 0.15s ease;">
          <td style="padding: 6px 10px; color: #8c8c8c; text-align: center; border-right: 1px solid #f0f0f0; font-size: 11px; user-select: none; width: 45px; box-sizing: border-box;">${seq}</td>
      `;

      columns.forEach(col => {
        const val = row[col.columnName];
        html += renderNoviceCellTd(val, col.columnName);
      });

      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;

    // 绑定列宽自由拖拽调整手柄
    bindNoviceColumnResize(container);

    // 绑定单元格点击/双击查看完整内容弹窗
    bindNoviceCellDetailEvents(container);
  }

  /**
   * 导出当前已预览的数据为 Excel 文件 (自适应表头备注)
   */
  function exportCurrentDataToExcel() {
    if (!currentPreviewRows || currentPreviewRows.length === 0) {
      alertMsg('当前无数据可供导出');
      return;
    }

    loadSheetJs((XLSX) => {
      if (!XLSX) {
        alertMsg('未检测到 SheetJS 导出引擎，请检查网络连接');
        return;
      }

      // 组装表头行：根据表头模式自适应列名与备注
      const exportData = currentPreviewRows.map(row => {
        const item = {};
        currentPreviewColumns.forEach(col => {
          const headerName = col.comment ? `${col.comment} (${col.columnName})` : col.columnName;
          item[headerName] = row[col.columnName] ?? '';
        });
        return item;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '数据表导出');
      const filename = `${currentPreviewTable}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast(`已成功导出 Excel 文件: ${filename}`);
    });
  }

  // ==========================
  // 8. 库表结构全量导出为 Excel (含表清单超链接目录与各表字段 Sheet)
  // ==========================

  /**
   * 规范化 Excel Sheet 名称 (过滤非法字符并截取最大 31 字符，且保证名称唯一)
   *
   * @param {string} rawName 原始表名
   * @param {Set<string>} usedNames 已使用的 Sheet 名称集合
   * @return {string} 规范后的唯一 Sheet 名称
   */
  function sanitizeSheetName(rawName, usedNames) {
    let name = (rawName || 'Sheet').replace(/[:\\/?*\[\]]/g, '_').trim();
    if (!name) name = 'Table';
    if (name.length > 31) {
      name = name.substring(0, 31);
    }
    let finalName = name;
    let counter = 1;
    while (usedNames.has(finalName)) {
      const suffix = `_${counter}`;
      const base = name.substring(0, Math.max(1, 31 - suffix.length));
      finalName = `${base}${suffix}`;
      counter++;
    }
    usedNames.add(finalName);
    return finalName;
  }

  /**
   * 导出当前选中数据库的完整表结构设计文档为 Excel
   * 首个 Sheet 为表清单目录 (支持点击超链接直达对应表)，后续各 Sheet 均为表字段详情
   */
  async function exportDatabaseSchemaToExcel() {
    if (!currentSelectedDsId) {
      toast('请先在上方选择目标数据库');
      return;
    }

    const exportBtn = document.getElementById('datax-novice-export-schema-btn');
    const origBtnHtml = exportBtn ? exportBtn.innerHTML : '';
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.innerHTML = '⏳ 正在拉取结构元数据...';
      exportBtn.style.opacity = '0.7';
    }

    try {
      // 1. 调用后端接口批量获取全量库表与字段结构元数据
      const queryParam = currentSelectedSchema
        ? `?datasourceId=${currentSelectedDsId}&tableSchema=${encodeURIComponent(currentSelectedSchema)}`
        : `?datasourceId=${currentSelectedDsId}`;
      const res = await getHttp().fetchJson(`/api/tableData/exportSchema${queryParam}`, { method: 'GET' });

      if (!getHttp().isApiSuccess(res)) {
        throw new Error(getHttp().getApiMsg(res, '获取库表结构失败'));
      }

      const schemaData = res.data || res.content || {};
      const tables = schemaData.tables || [];

      if (!tables || tables.length === 0) {
        alertMsg('当前数据库下暂无可导出的数据表');
        return;
      }

      if (exportBtn) {
        exportBtn.innerHTML = `⏳ 正在构建 Excel (${tables.length} 张表)...`;
      }

      // 2. 加载 SheetJS 导出引擎
      loadSheetJs((XLSX) => {
        if (!XLSX) {
          alertMsg('未检测到 SheetJS 引擎，请检查网络连接');
          if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = origBtnHtml;
            exportBtn.style.opacity = '1';
          }
          return;
        }

        try {
          const wb = XLSX.utils.book_new();
          const DIR_SHEET_NAME = '库表清单目录';
          const usedSheetNames = new Set([DIR_SHEET_NAME]);
          const tableSheetMap = new Map();

          // 预分配并映射各表的规范 Sheet 名称
          tables.forEach(t => {
            const sName = sanitizeSheetName(t.tableName, usedSheetNames);
            tableSheetMap.set(t.tableName, sName);
          });

          const dbName = schemaData.databaseName || schemaData.datasourceName || '数据库';
          const dbComment = (schemaData.comments || '').trim();
          const dsType = (schemaData.datasourceType || '').toUpperCase();
          const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });

          // ----------------------------------------------------
          // 3. 构建 Sheet 1: 【库表清单目录】
          // ----------------------------------------------------
          const dirRows = [
            ['【数据库结构设计与表清单目录】'],
            ['所属数据库:', dbName, '业务说明/备注:', dbComment || '无备注', '数据源类型:', dsType || 'RDBMS'],
            ['导出时间:', nowStr, '数据表总数:', `${tables.length} 张`, '生成引擎:', 'DataX-Web 智能助手'],
            [], // 空行分隔
            ['序号', '数据表名 (Table)', '表中文说明 / 业务备注', '字段数', '快捷操作 (点击直达表结构)']
          ];

          tables.forEach((t, idx) => {
            const colCount = (t.columns || []).length;
            const comment = (t.tableComment || '').trim() || '暂无备注';
            dirRows.push([
              idx + 1,
              t.tableName,
              comment,
              colCount,
              '查看表结构 ➜'
            ]);
          });

          const wsDir = XLSX.utils.aoa_to_sheet(dirRows);

          // 为目录表中的每一行设置直达对应表 Sheet 的超链接
          tables.forEach((t, idx) => {
            const rowIndex = 5 + idx; // 0-indexed 行号
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: 4 }); // E 列
            const targetSheetName = tableSheetMap.get(t.tableName);

            if (!wsDir[cellRef]) {
              wsDir[cellRef] = { t: 's', v: '查看表结构 ➜' };
            }
            // 绑定 SheetJS 内部跳转超链接对象
            wsDir[cellRef].l = {
              Target: `#'${targetSheetName}'!A1`,
              Tooltip: `点击直接跳转到 [${targetSheetName}] 表结构`
            };
            // 绑定标准 Excel HYPERLINK 函数公式，确保 WPS 与各版 Excel 均可点击跳转
            wsDir[cellRef].f = `HYPERLINK("#'${targetSheetName}'!A1", "查看表结构 ➜")`;
          });

          // 设置目录 Sheet 列宽
          wsDir['!cols'] = [
            { wch: 8 },  // 序号
            { wch: 32 }, // 数据表名
            { wch: 38 }, // 表中文说明
            { wch: 12 }, // 字段数
            { wch: 22 }  // 快捷操作
          ];

          XLSX.utils.book_append_sheet(wb, wsDir, DIR_SHEET_NAME);

          // ----------------------------------------------------
          // 4. 依次构建各个数据表的字段结构 Sheet
          // ----------------------------------------------------
          tables.forEach(t => {
            const sName = tableSheetMap.get(t.tableName);
            const tComment = (t.tableComment || '').trim();
            const cols = t.columns || [];

            const tableRows = [
              [`【数据表结构设计】 - ${t.tableName}${tComment ? ' (' + tComment + ')' : ''}`],
              ['所属数据库:', dbName, '字段总数:', `${cols.length} 个`, '快捷返回:', '⬅️ 返回表清单目录'],
              [], // 空行分隔
              ['序号', '字段名称 (Column)', '数据类型 (Type)', '主键', '允许为空', '默认值', '字段中文说明 / 注释 (Comment)']
            ];

            cols.forEach((col, cIdx) => {
              let typeStr = col.columnType || '';
              if (col.columnSize) {
                typeStr += col.decimalDigits ? `(${col.columnSize}, ${col.decimalDigits})` : `(${col.columnSize})`;
              }

              tableRows.push([
                cIdx + 1,
                col.columnName || '',
                typeStr,
                col.isPrimaryKey ? 'YES' : '-',
                col.isNullable ? 'YES' : 'NO',
                col.defaultValue != null ? String(col.defaultValue) : '-',
                col.comment || ''
              ]);
            });

            const wsTable = XLSX.utils.aoa_to_sheet(tableRows);

            // 设置“⬅️ 返回表清单目录”返回超链接 (第 2 行 F 列，即 rowIndex = 1, colIndex = 5)
            const backCellRef = XLSX.utils.encode_cell({ r: 1, c: 5 });
            if (!wsTable[backCellRef]) {
              wsTable[backCellRef] = { t: 's', v: '⬅️ 返回表清单目录' };
            }
            wsTable[backCellRef].l = {
              Target: `#'${DIR_SHEET_NAME}'!A1`,
              Tooltip: '点击返回库表清单目录'
            };
            wsTable[backCellRef].f = `HYPERLINK("#'${DIR_SHEET_NAME}'!A1", "⬅️ 返回表清单目录")`;

            // 设置表结构列宽
            wsTable['!cols'] = [
              { wch: 8 },  // 序号
              { wch: 28 }, // 字段名称
              { wch: 20 }, // 数据类型
              { wch: 10 }, // 主键
              { wch: 12 }, // 允许为空
              { wch: 16 }, // 默认值
              { wch: 42 }  // 字段中文说明
            ];

            XLSX.utils.book_append_sheet(wb, wsTable, sName);
          });

          // ----------------------------------------------------
          // 5. 触发客户端 Excel 下载
          // ----------------------------------------------------
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const cleanDbName = dbName.replace(/[:\\/?*\[\]]/g, '_');
          const fileName = `【库表结构】${cleanDbName}_${dateStr}.xlsx`;
          XLSX.writeFile(wb, fileName);

          toast(`🎉 库表结构已成功导出为 Excel！包含 ${tables.length} 张表`);
        } catch (exportErr) {
          alertMsg(`生成 Excel 发生异常: ${exportErr.message}`);
        } finally {
          if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = origBtnHtml;
            exportBtn.style.opacity = '1';
          }
        }
      });

    } catch (err) {
      alertMsg(`导出失败: ${err.message}`);
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = origBtnHtml;
        exportBtn.style.opacity = '1';
      }
    }
  }

  // ==========================
  // 8.5 角色库表访问授权配置弹窗 (管理员专属)
  // ==========================
  let activePermModal = null;

  async function openRoleTablePermissionModal() {
    const isAdmin = window.DataXAssistant && window.DataXAssistant.AuthGuard ? window.DataXAssistant.AuthGuard.isAdmin() : false;
    if (!isAdmin) {
      alertMsg('仅系统超级管理员可访问角色权限管理中心');
      return;
    }

    if (activePermModal) {
      activePermModal.remove();
      activePermModal = null;
    }

    const http = getHttp();
    if (!http) {
      alertMsg('HTTP 模块未就绪，请稍后重试');
      return;
    }

    // 状态
    let permList = [];
    let dsList = allNoviceDatasourcesCache && allNoviceDatasourcesCache.length > 0 ? allNoviceDatasourcesCache : [];
    let curDsTables = [];
    let currentLoadedDsId = null;
    let selectedTableSet = new Set();
    let currentEditingId = null;
    let tableMarqueeInstance = null;
    let tableLastClickedIdx = null;

    const modal = document.createElement('div');
    modal.className = isCurrentDarkMode() ? 'datax-sub-modal datax-dark-mode' : 'datax-sub-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000005;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const initialPurple = isCurrentDarkMode() ? '#b37feb' : '#722ed1';

    modal.innerHTML = `
      <div class="datax-perm-dialog" style="background: #fff; border-radius: 8px; box-shadow: 0 10px 36px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; position: absolute;">
        <!-- 头部 -->
        <div id="datax-perm-modal-header" style="background: linear-gradient(90deg, #722ed1, #531dab); color: #fff; padding: 11px 18px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
          <div style="font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 8px; pointer-events: none;">
            <span>角色权限管理中心 (库表授权与菜单控制)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="datax-perm-modal-max" title="最大化窗口" style="font-size: 16px; cursor: pointer; line-height: 1; opacity: 0.85; user-select: none;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.85'">&#x25A2;</span>
            <span id="datax-perm-modal-close" title="关闭" style="font-size: 20px; cursor: pointer; line-height: 1; opacity: 0.85; user-select: none;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.85'">&times;</span>
          </div>
        </div>

        <!-- 顶部功能 Tab 切换栏 -->
        <div style="background: #fafafa; border-bottom: 1px solid #e8e8e8; padding: 0 18px; display: flex; gap: 8px; user-select: none;">
          <button id="datax-perm-tab-btn-menu" type="button" style="padding: 10px 18px; font-size: 13px; font-weight: bold; cursor: pointer; border: none; border-bottom: 2px solid ${initialPurple}; color: ${initialPurple}; background: transparent; display: flex; align-items: center; gap: 6px; outline: none; transition: all 0.2s;">
            <span>角色系统菜单权限</span>
          </button>
          <button id="datax-perm-tab-btn-table" type="button" style="padding: 10px 18px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; border-bottom: 2px solid transparent; color: #595959; background: transparent; display: flex; align-items: center; gap: 6px; outline: none; transition: all 0.2s;">
            <span>角色库表权限策略</span>
          </button>
        </div>

        <!-- 主体容器 (可垂直滚动) -->
        <div style="flex: 1; overflow-y: auto; padding: 16px; background: #f7f9fa; display: flex; flex-direction: column;">
          <!-- ================= TAB 1: 角色系统菜单权限面板 (首选推荐) ================= -->
          <div id="datax-perm-tab-content-menu" style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
            <!-- 上部卡片：角色菜单快速授权 -->
            <div style="background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 10px;">
              <!-- 表单头部行：角色选择与操作按钮 -->
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span id="datax-menu-perm-form-title" style="font-size: 13px; font-weight: bold; color: ${initialPurple};">
                    🎯 角色菜单授权
                  </span>
                  <div id="datax-menu-perm-edit-indicator" style="display: none; font-size: 11px; background: #fffbe6; color: #fa8c16; border: 1px solid #ffe58f; padding: 1px 6px; border-radius: 4px;">
                    编辑中
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <label style="font-size: 12px; font-weight: 600; color: #595959;">角色：</label>
                    <select id="datax-menu-perm-role-select" style="padding: 4px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; background: #fff;">
                      <option value="ROLE_USER">普通用户 (ROLE_USER)</option>
                      <option value="ROLE_ADMIN">👑 管理员 (ROLE_ADMIN - 默认全特权无需配置)</option>
                    </select>
                    <button id="datax-menu-perm-role-add-btn" type="button" style="white-space: nowrap; padding: 4px 10px; font-size: 11px; background: #f9f0ff; border: 1px solid #d3adf7; color: #722ed1; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s;">➕ 新建角色</button>
                    <button id="datax-menu-perm-role-del-btn" type="button" style="display: none; white-space: nowrap; padding: 4px 10px; font-size: 11px; background: #fff1f0; border: 1px solid #ffa39e; color: #f5222d; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s;">🗑️ 删除角色</button>
                  </div>
                </div>

                <!-- 快捷工具与保存按钮 -->
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span id="datax-menu-selected-count-badge" style="font-size: 11px; color: #722ed1; font-weight: 600; background: #f9f0ff; border: 1px solid #d3adf7; padding: 3px 8px; border-radius: 4px; white-space: nowrap;">已选 1 / 7 项 (支持拖拽框选)</span>
                  <div id="datax-menu-perm-quick-tools" style="display: flex; align-items: center; gap: 6px;">
                    <button id="datax-menu-perm-quick-all" type="button" style="background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">全选</button>
                    <button id="datax-menu-perm-quick-recommend" type="button" style="background: #f6ffed; border: 1px solid #b7eb8f; color: #52c41a; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">常用业务</button>
                    <button id="datax-menu-perm-quick-clear" type="button" style="background: #fff; border: 1px solid #d9d9d9; color: #595959; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">清空</button>
                    <button id="datax-menu-perm-reset-btn" type="button" style="background: #fff; border: 1px solid #d9d9d9; color: #595959; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 4px;">重置</button>
                  </div>
                  <button id="datax-menu-perm-save-btn" type="button" style="background: linear-gradient(135deg, #722ed1 0%, #531dab 100%); color: #fff; border: none; padding: 4px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 6px rgba(114,46,209,0.3); transition: all 0.2s; white-space: nowrap;">
                    保存菜单配置
                  </button>
                </div>
              </div>

              <!-- 菜单授权列表容器 (支持鼠标拖拽框选与整行点击勾选) -->
              <div id="datax-menu-list-wrapper" style="border: 1px solid #e8e8e8; border-radius: 6px; overflow: hidden; background: #fff; position: relative;">
                <div id="datax-menu-list-container" style="max-height: 290px; overflow-y: auto; position: relative; user-select: none;">
                  <!-- 表头与列表数据由 JS 动态渲染并绑定 MarqueeSelector 框选引擎 -->
                </div>
              </div>
            </div>

            <!-- 中部卡片：关联用户管理 (支持实时搜索过滤与批量多选勾选) -->
            <div style="background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="font-size: 13px; font-weight: bold; color: #262626; display: flex; align-items: center; gap: 8px;">
                  <span>关联用户管理</span>
                  <span id="datax-role-user-count-badge" style="font-size: 11px; font-weight: normal; background: #f0f2f5; color: #595959; padding: 1px 8px; border-radius: 10px;">当前角色关联 0 人</span>
                </div>
                <!-- 快捷操作：当前人员过滤 + 批量添加按钮 + 一键移出 -->
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="text" id="datax-role-user-filter-input" placeholder="🔍 过滤当前人员..." style="padding: 4px 8px; font-size: 11px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; width: 120px;" />
                  <button id="datax-role-user-batch-open-btn" type="button" style="background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%); border: none; color: #fff; padding: 4px 14px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(24,144,255,0.3);">
                    ➕ 批量添加用户
                  </button>
                  <button id="datax-role-user-clear-all-btn" type="button" style="display: none; background: #fff1f0; border: 1px solid #ffa39e; color: #f5222d; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                    全部移出
                  </button>
                </div>
              </div>

              <!-- 已关联用户标签展示盒 -->
              <div id="datax-role-user-tags-box" style="display: flex; flex-wrap: wrap; gap: 6px; min-height: 36px; max-height: 120px; overflow-y: auto; padding: 6px 10px; background: #fafafa; border: 1px dashed #d9d9d9; border-radius: 6px; align-items: center;">
                <span style="color: #bfbfbf; font-size: 12px;">加载关联用户中...</span>
              </div>
            </div>

            <!-- 下部卡片：已生效角色菜单策略列表 -->
            <div style="background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex: 1; display: flex; flex-direction: column; overflow: hidden; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: bold; color: #262626; display: flex; align-items: center; gap: 6px;">
                  <span>已生效菜单策略</span>
                  <span id="datax-menu-perm-total-badge" style="font-size: 11px; background: #f0f2f5; color: #595959; padding: 1px 8px; border-radius: 10px; font-weight: normal;">共 0 条</span>
                </span>
                <button id="datax-menu-perm-refresh-list-btn" type="button" style="background: #fff; border: 1px solid #d9d9d9; color: #1890ff; padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                  刷新
                </button>
              </div>

              <!-- 菜单权限表格容器 -->
              <div id="datax-menu-perm-table-container" style="flex: 1; overflow: auto; border: 1px solid #e8e8e8; border-radius: 6px; background: #fff;">
                <div style="text-align: center; color: #8c8c8c; font-size: 12px; padding: 20px;">
                  ⏳ 正在拉取数据...
                </div>
              </div>
            </div>
          </div>

          <!-- ================= TAB 2: 库表权限配置面板 ================= -->
          <div id="datax-perm-tab-content-table" style="display: none; flex-direction: column; gap: 14px; flex: 1;">
            <!-- 上部卡片：新增/编辑授权表单 -->
            <div style="background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px;">
                <span id="datax-perm-form-title" style="font-size: 13px; font-weight: bold; color: #722ed1; display: flex; align-items: center; gap: 6px;">
                  <span>➕ 配置角色授权策略</span>
                </span>
                <div id="datax-perm-edit-indicator" style="display: none; font-size: 11px; background: #fffbe6; color: #fa8c16; border: 1px solid #ffe58f; padding: 2px 8px; border-radius: 4px;">
                  编辑模式中
                </div>
              </div>

              <!-- 表单第一行：角色、数据源、权限项、最大行数 -->
              <div style="display: grid; grid-template-columns: 1.2fr 1.6fr 1.8fr 1fr; gap: 12px; align-items: center;">
                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: #595959; margin-bottom: 4px;">目标角色：</label>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <select id="datax-perm-role-select" style="flex: 1; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; background: #fff;">
                      <option value="ROLE_USER">普通用户 (ROLE_USER)</option>
                      <option value="ROLE_ADMIN">管理员 (ROLE_ADMIN)</option>
                    </select>
                    <button id="datax-perm-role-add-btn" type="button" style="white-space: nowrap; padding: 6px 10px; font-size: 11px; background: #f9f0ff; border: 1px solid #d3adf7; color: #722ed1; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s;">➕ 新建角色</button>
                    <button id="datax-perm-role-del-btn" type="button" style="display: none; white-space: nowrap; padding: 6px 10px; font-size: 11px; background: #fff1f0; border: 1px solid #ffa39e; color: #f5222d; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s;">🗑️ 删除角色</button>
                  </div>
                </div>

                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: #595959; margin-bottom: 4px;">目标数据库：</label>
                  <select id="datax-perm-ds-select" style="width: 100%; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; background: #fff;">
                    <option value="">-- 请选择数据库 --</option>
                  </select>
                </div>

                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: #595959; margin-bottom: 4px;">操作权限控制：</label>
                  <div style="display: flex; gap: 12px; align-items: center; padding-top: 4px;">
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; color: #262626;">
                      <input type="checkbox" id="datax-perm-chk-query" checked />
                      <span>👁️ 允许查看表数据</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; color: #262626;">
                      <input type="checkbox" id="datax-perm-chk-sql" checked />
                      <span>💻 允许执行只读SQL</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: #595959; margin-bottom: 4px;">单次上限行数：</label>
                  <select id="datax-perm-max-rows-select" style="width: 100%; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; background: #fff;">
                    <option value="100">100 行</option>
                    <option value="500">500 行</option>
                    <option value="1000">1000 行</option>
                    <option value="2000" selected>2000 行 (推荐)</option>
                    <option value="5000">5000 行</option>
                  </select>
                </div>
              </div>

              <!-- 表单第二行：整库通配开关与表选择面板 -->
              <div style="border: 1px dashed #d9d9d9; border-radius: 6px; padding: 10px 14px; background: #fafafa; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: bold; cursor: pointer; color: #52c41a;">
                    <input type="checkbox" id="datax-perm-chk-all-tables" checked />
                    <span>🌟 授权目标库全部数据表 (通配符 *)</span>
                  </label>
                  <span id="datax-perm-selected-count-badge" style="display: none; font-size: 11px; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 1px 8px; border-radius: 10px;">
                    已勾选 0 张表
                  </span>
                </div>

                <!-- 细粒度表选择区域 (取消整库勾选时展开，支持列表框选、Shift连选与搜索过滤) -->
                <div id="datax-perm-tables-selector-wrap" style="display: none; flex-direction: column; gap: 8px; margin-top: 4px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <input type="text" id="datax-perm-table-filter" placeholder="🔍 快速过滤当前库数据表名或中文备注..." style="flex: 1; min-width: 220px; padding: 5px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; background: #fff;" />
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <button id="datax-perm-select-all-btn" type="button" style="background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; padding: 3px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">全选过滤项</button>
                      <button id="datax-perm-invert-sel-btn" type="button" style="background: #fff; border: 1px solid #d9d9d9; color: #1890ff; padding: 3px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">反选</button>
                      <button id="datax-perm-clear-all-btn" type="button" style="background: #fff; border: 1px solid #d9d9d9; color: #595959; padding: 3px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">清空</button>
                      <span style="font-size: 11px; color: #8c8c8c;">💡 支持鼠标拖拽框选、整行点击与 Shift 连续多选</span>
                    </div>
                  </div>

                  <!-- 数据表列表滚动容器 (支持表格展示与鼠标拖拽框选) -->
                  <div id="datax-perm-table-list-container" style="max-height: 190px; min-height: 110px; overflow-y: auto; overflow-x: hidden; border: 1px solid #e8e8e8; border-radius: 4px; background: #fff; position: relative; user-select: none;">
                    <div style="text-align: center; color: #bfbfbf; font-size: 12px; padding: 22px;">请先选择数据库以加载表列表</div>
                  </div>
                </div>
              </div>

              <!-- 操作按钮栏 -->
              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px;">
                <button id="datax-perm-reset-btn" type="button" style="background: #fff; border: 1px solid #d9d9d9; color: #595959; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                  重置表单
                </button>
                <button id="datax-perm-save-btn" type="button" style="background: linear-gradient(135deg, #722ed1 0%, #531dab 100%); color: #fff; border: none; padding: 6px 20px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 6px rgba(114,46,209,0.3); transition: all 0.2s;">
                  保存授权策略
                </button>
              </div>
            </div>

            <!-- 下部卡片：已有授权策略列表 -->
            <div style="background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex: 1; display: flex; flex-direction: column; overflow: hidden; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: bold; color: #262626; display: flex; align-items: center; gap: 6px;">
                  <span>已生效的角色库表权限策略列表</span>
                  <span id="datax-perm-total-badge" style="font-size: 11px; background: #f0f2f5; color: #595959; padding: 1px 8px; border-radius: 10px; font-weight: normal;">共 0 条</span>
                </span>
                <button id="datax-perm-refresh-list-btn" type="button" style="background: #fff; border: 1px solid #d9d9d9; color: #1890ff; padding: 3px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                  刷新列表
                </button>
              </div>

              <!-- 表格容器 -->
              <div id="datax-perm-table-container" style="flex: 1; overflow: auto; border: 1px solid #e8e8e8; border-radius: 6px; background: #fff;">
                <div style="text-align: center; color: #8c8c8c; font-size: 12px; padding: 30px;">
                  ⏳ 正在拉取权限策略数据...
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <div style="padding: 10px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; text-align: right;">
          <button id="datax-perm-modal-close-btn" style="background: #fff; border: 1px solid #d9d9d9; color: #606266; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            关闭窗口
          </button>
        </div>

        <!-- 子弹窗：批量关联用户 (支持表格列表展示、搜索过滤、鼠标拖拽框选与多选批量关联) -->
        <div id="datax-user-batch-modal" style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); z-index: 20; display: none; align-items: center; justify-content: center; backdrop-filter: blur(1px);">
          <div style="background: #fff; border-radius: 8px; width: 740px; max-width: 94%; max-height: 85%; display: flex; flex-direction: column; box-shadow: 0 10px 36px rgba(0,0,0,0.25); overflow: hidden; border: 1px solid #d9d9d9;">
            <!-- 弹窗标题 -->
            <div style="padding: 12px 18px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; background: #fafafa;">
              <div style="font-size: 13px; font-weight: bold; color: #262626;" id="datax-user-batch-title">
                批量关联用户
              </div>
              <span id="datax-user-batch-close-btn" style="cursor: pointer; font-size: 18px; color: #8c8c8c; line-height: 1;">×</span>
            </div>
            <!-- 搜索与快捷操作栏 -->
            <div style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; background: #fff; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <input type="text" id="datax-user-batch-search-input" placeholder="🔍 搜索系统用户名 / 角色..." style="flex: 1; min-width: 180px; padding: 5px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
              <button id="datax-user-batch-select-all-btn" type="button" style="padding: 4px 10px; font-size: 11px; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 4px; cursor: pointer;">全选未关联</button>
              <button id="datax-user-batch-clear-sel-btn" type="button" style="padding: 4px 10px; font-size: 11px; background: #fff; color: #595959; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer;">清空勾选</button>
              <span id="datax-user-batch-count-stat" style="font-size: 11px; color: #1890ff; font-weight: 600; background: #e6f7ff; border: 1px solid #91d5ff; padding: 2px 8px; border-radius: 4px; white-space: nowrap;">已选 0 人 (支持拖拽框选)</span>
            </div>
            <!-- 用户表格列表容器 (支持鼠标拖拽框选与整行点击) -->
            <div id="datax-user-batch-user-list" style="flex: 1; overflow-y: auto; padding: 0; min-height: 240px; max-height: 380px; position: relative; background: #fff; user-select: none; border-bottom: 1px solid #f0f0f0;">
              <!-- 动态表格数据由 JS 渲染 -->
            </div>
            <!-- 弹窗底部 -->
            <div style="padding: 10px 18px; border-top: 1px solid #f0f0f0; display: flex; justify-content: flex-end; align-items: center; gap: 10px; background: #fafafa;">
              <button id="datax-user-batch-cancel-btn" type="button" style="padding: 5px 14px; font-size: 12px; border: 1px solid #d9d9d9; background: #fff; color: #595959; border-radius: 4px; cursor: pointer;">取消</button>
              <button id="datax-user-batch-submit-btn" type="button" style="padding: 6px 18px; font-size: 12px; font-weight: bold; border: none; background: #1890ff; color: #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 2px 5px rgba(24,144,255,0.3);">
                确认关联选中的用户 (0 人)
              </button>
            </div>
          </div>
        </div>

        <!-- 新增角色快捷小弹窗 -->
        <div id="datax-role-create-modal" style="display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45); z-index: 1000010; justify-content: center; align-items: center;">
          <div style="background: #fff; border-radius: 8px; width: 420px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #722ed1, #531dab); color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 13px; font-weight: bold;">➕ 新建系统角色</span>
              <span id="datax-role-create-close-btn" style="font-size: 18px; cursor: pointer; line-height: 1;">&times;</span>
            </div>
            <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; background: #fff;">
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: #595959; margin-bottom: 4px;">
                  <span style="color: #f5222d;">*</span> 角色标识 (Code)：
                </label>
                <input type="text" id="datax-role-create-code" placeholder="如 ROLE_ANALYST (大写字母与下划线)" style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; font-family: monospace;" />
              </div>
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: #595959; margin-bottom: 4px;">
                  <span style="color: #f5222d;">*</span> 角色名称 (Name)：
                </label>
                <input type="text" id="datax-role-create-name" placeholder="如 业务数据分析师" style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none;" />
              </div>
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: #595959; margin-bottom: 4px;">
                  角色说明 (Description)：
                </label>
                <textarea id="datax-role-create-desc" placeholder="简述该角色的业务范围与职责 (选填)" rows="2" style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; outline: none; resize: none;"></textarea>
              </div>
            </div>
            <div style="padding: 10px 18px; border-top: 1px solid #f0f0f0; display: flex; justify-content: flex-end; align-items: center; gap: 10px; background: #fafafa;">
              <button id="datax-role-create-cancel-btn" type="button" style="padding: 5px 14px; font-size: 12px; border: 1px solid #d9d9d9; background: #fff; color: #595959; border-radius: 4px; cursor: pointer;">取消</button>
              <button id="datax-role-create-submit-btn" type="button" style="padding: 6px 18px; font-size: 12px; font-weight: bold; border: none; background: #722ed1; color: #fff; border-radius: 4px; cursor: pointer; box-shadow: 0 2px 5px rgba(114,46,209,0.3);">
                确认创建
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    activePermModal = modal;

    // 初始居中与尺寸
    const permDialog = modal.querySelector('.datax-perm-dialog');
    const initW = Math.min(1060, Math.max(780, window.innerWidth * 0.86));
    const initH = Math.min(window.innerHeight * 0.88, 760);
    permDialog.style.width = `${initW}px`;
    permDialog.style.height = `${initH}px`;
    permDialog.style.left = `${Math.max(10, Math.round((window.innerWidth - initW) / 2))}px`;
    permDialog.style.top = `${Math.max(10, Math.round((window.innerHeight - initH) / 2))}px`;

    const permHeader = modal.querySelector('#datax-perm-modal-header');
    const permMaxBtn = modal.querySelector('#datax-perm-modal-max');
    const destroyDrag = makeDialogDraggableAndResizable(permDialog, permHeader, {
      minWidth: 700,
      minHeight: 460,
      maxBtn: permMaxBtn
    });

    const closeModal = () => {
      if (tableMarqueeInstance && typeof tableMarqueeInstance.destroy === 'function') {
        tableMarqueeInstance.destroy();
        tableMarqueeInstance = null;
      }
      destroyDrag();
      modal.remove();
      activePermModal = null;
    };

    modal.querySelector('#datax-perm-modal-close').onclick = closeModal;
    modal.querySelector('#datax-perm-modal-close-btn').onclick = closeModal;

    // ==========================================
    // 0. 主 Tab 切换器逻辑
    // ==========================================
    const tabBtnTable = modal.querySelector('#datax-perm-tab-btn-table');
    const tabBtnMenu = modal.querySelector('#datax-perm-tab-btn-menu');
    const tabContentTable = modal.querySelector('#datax-perm-tab-content-table');
    const tabContentMenu = modal.querySelector('#datax-perm-tab-content-menu');

    const switchMainTab = (target) => {
      const isDark = isCurrentDarkMode();
      const activeColor = isDark ? '#b37feb' : '#722ed1';
      const inactiveColor = isDark ? '#9ca3af' : '#595959';
      if (target === 'table') {
        tabBtnTable.style.borderBottomColor = activeColor;
        tabBtnTable.style.color = activeColor;
        tabBtnTable.style.fontWeight = 'bold';
        tabBtnMenu.style.borderBottomColor = 'transparent';
        tabBtnMenu.style.color = inactiveColor;
        tabBtnMenu.style.fontWeight = '500';
        tabContentTable.style.display = 'flex';
        tabContentMenu.style.display = 'none';
        fetchPermList();
      } else {
        tabBtnMenu.style.borderBottomColor = activeColor;
        tabBtnMenu.style.color = activeColor;
        tabBtnMenu.style.fontWeight = 'bold';
        tabBtnTable.style.borderBottomColor = 'transparent';
        tabBtnTable.style.color = inactiveColor;
        tabBtnTable.style.fontWeight = '500';
        tabContentTable.style.display = 'none';
        tabContentMenu.style.display = 'flex';
        fetchRoleMenuList();
      }
    };

    tabBtnTable.onclick = () => switchMainTab('table');
    tabBtnMenu.onclick = () => switchMainTab('menu');

    // ==========================================
    // 1. 角色库表权限策略 (Tab 1)
    // ==========================================
    const roleSelect = modal.querySelector('#datax-perm-role-select');
    const dsSelect = modal.querySelector('#datax-perm-ds-select');
    const chkQuery = modal.querySelector('#datax-perm-chk-query');
    const chkSql = modal.querySelector('#datax-perm-chk-sql');
    const maxRowsSelect = modal.querySelector('#datax-perm-max-rows-select');
    const chkAllTables = modal.querySelector('#datax-perm-chk-all-tables');
    const tablesSelectorWrap = modal.querySelector('#datax-perm-tables-selector-wrap');
    const selectedCountBadge = modal.querySelector('#datax-perm-selected-count-badge');
    const tableFilterInput = modal.querySelector('#datax-perm-table-filter');
    const tableListContainer = modal.querySelector('#datax-perm-table-list-container');
    const saveBtn = modal.querySelector('#datax-perm-save-btn');
    const resetBtn = modal.querySelector('#datax-perm-reset-btn');
    const formTitle = modal.querySelector('#datax-perm-form-title');
    const editIndicator = modal.querySelector('#datax-perm-edit-indicator');
    const tableContainer = modal.querySelector('#datax-perm-table-container');
    const totalBadge = modal.querySelector('#datax-perm-total-badge');
    const refreshListBtn = modal.querySelector('#datax-perm-refresh-list-btn');

    // 抽取的公共状态同步方法：同步行视觉高亮、行内复选框与表头复选框状态
    function syncTableVisuals() {
      if (!tableListContainer) return;
      const rows = tableListContainer.querySelectorAll('.datax-perm-tbl-row');
      let visibleCount = 0;
      let checkedCount = 0;

      rows.forEach(row => {
        visibleCount++;
        const tblName = row.getAttribute('data-table');
        const isChecked = selectedTableSet.has(tblName);
        if (isChecked) checkedCount++;

        const isDark = isCurrentDarkMode();
        const isEven = row.getAttribute('data-even') === 'true';
        row.style.backgroundColor = isChecked
          ? (isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff')
          : (isDark ? (isEven ? '#1e1f25' : '#22252c') : (isEven ? '#fff' : '#fafbfc'));
        row.style.borderLeft = isChecked ? '3px solid #1890ff' : '3px solid transparent';

        const chk = row.querySelector('.datax-perm-tbl-chk');
        if (chk && chk.checked !== isChecked) {
          chk.checked = isChecked;
        }
      });

      const headerChk = tableListContainer.querySelector('#datax-perm-tbl-header-chk');
      if (headerChk) {
        if (visibleCount === 0) {
          headerChk.checked = false;
          headerChk.indeterminate = false;
        } else if (checkedCount === visibleCount) {
          headerChk.checked = true;
          headerChk.indeterminate = false;
        } else if (checkedCount > 0) {
          headerChk.checked = false;
          headerChk.indeterminate = true;
        } else {
          headerChk.checked = false;
          headerChk.indeterminate = false;
        }
      }

      updateSelectedCountText();
    }

    function updateSelectedCountText() {
      selectedCountBadge.textContent = `已勾选 ${selectedTableSet.size} 张表`;
    }

    // 全表通配符联动
    chkAllTables.onchange = () => {
      if (chkAllTables.checked) {
        tablesSelectorWrap.style.display = 'none';
        selectedCountBadge.style.display = 'none';
      } else {
        tablesSelectorWrap.style.display = 'flex';
        selectedCountBadge.style.display = 'inline-block';
        updateSelectedCountText();
        // 取消通配时：只要选了库，且当前没有加载过该库的表，立即加载真实数据表
        if (dsSelect.value && (!currentLoadedDsId || currentLoadedDsId !== dsSelect.value || curDsTables.length === 0)) {
          loadTablesForDatasource(dsSelect.value);
        } else if (curDsTables.length > 0) {
          renderTableList();
        }
      }
    };

    // 填充数据源下拉
    function populateDsOptions() {
      dsSelect.innerHTML = '<option value="">-- 请选择数据库 --</option>';
      dsList.forEach(ds => {
        const opt = document.createElement('option');
        opt.value = ds.id;
        const comment = (ds.comments || '').trim();
        opt.textContent = `${ds.datasourceName || ds.name || '未命名'} (${ds.datasource || 'DB'})${comment ? ' - ' + comment : ''}`;
        dsSelect.appendChild(opt);
      });
    }

    // 加载目标库表列表 (带竞态防护与时间戳穿透缓存)
    async function loadTablesForDatasource(datasourceId) {
      if (!datasourceId) {
        currentLoadedDsId = null;
        curDsTables = [];
        renderTableList();
        return;
      }
      currentLoadedDsId = String(datasourceId);
      tableListContainer.innerHTML = '<div style="text-align: center; color: #1890ff; font-size: 12px; padding: 24px;">⏳ 正在拉取目标库真实数据表列表...</div>';
      try {
        const res = await http.fetchJson(`/api/tableData/tables?datasourceId=${datasourceId}&_t=${Date.now()}`, { method: 'GET' });
        // 校验竞态：如果用户在请求期间已切换至其他库，丢弃旧响应
        if (dsSelect.value !== String(datasourceId)) {
          return;
        }
        curDsTables = http.extractListFromResponse(res) || [];
        renderTableList();
      } catch (err) {
        if (dsSelect.value !== String(datasourceId)) return;
        tableListContainer.innerHTML = `<div style="text-align: center; color: #ff4d4f; font-size: 12px; padding: 24px;">加载表列表失败: ${safeEscapeHtml(err.message)}</div>`;
      }
    }

    // 数据源切换联动：立即清空旧表缓存与旧勾选项，杜绝串库残留
    dsSelect.onchange = () => {
      const dsId = dsSelect.value;
      curDsTables = [];
      currentLoadedDsId = null;
      selectedTableSet.clear();
      tableLastClickedIdx = null;
      updateSelectedCountText();

      if (!dsId) {
        tableListContainer.innerHTML = '<div style="text-align: center; color: #bfbfbf; font-size: 12px; padding: 20px;">请先选择数据库以加载表列表</div>';
        return;
      }

      // 如果当前未勾选通配符，立即去后端拉取选中的库真实表清单
      if (!chkAllTables.checked) {
        loadTablesForDatasource(dsId);
      }
    };

    // 渲染表列表 (支持表格展示、整行点击、Shift连续区间选、MarqueeSelector鼠标框选与搜索过滤)
    function renderTableList() {
      if (tableMarqueeInstance && typeof tableMarqueeInstance.destroy === 'function') {
        tableMarqueeInstance.destroy();
        tableMarqueeInstance = null;
      }

      if (!dsSelect.value) {
        tableListContainer.innerHTML = '<div style="text-align: center; color: #bfbfbf; font-size: 12px; padding: 20px;">请先选择数据库以加载表列表</div>';
        return;
      }

      const filterKw = (tableFilterInput.value || '').trim().toLowerCase();
      const filtered = curDsTables.filter(t => {
        if (!filterKw) return true;
        const name = (t.tableName || '').toLowerCase();
        const comment = (t.tableComment || '').toLowerCase();
        return name.includes(filterKw) || comment.includes(filterKw);
      });

      if (filtered.length === 0) {
        tableListContainer.innerHTML = curDsTables.length === 0
          ? '<div style="text-align: center; color: #8c8c8c; font-size: 12px; padding: 20px;">当前数据库下暂无可用的数据表</div>'
          : '<div style="text-align: center; color: #bfbfbf; font-size: 12px; padding: 20px;">未匹配到符合过滤条件的数据表</div>';
        return;
      }

      let html = `
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead style="position: sticky; top: 0; z-index: 5; background: #fafafa; border-bottom: 1px solid #e8e8e8; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
            <tr style="color: #595959; font-weight: 600; white-space: nowrap;">
              <th style="padding: 6px 10px; width: 44px; text-align: center;">
                <input type="checkbox" id="datax-perm-tbl-header-chk" title="全选/全不选当前过滤结果" style="cursor: pointer; vertical-align: middle;" />
              </th>
              <th style="padding: 6px 10px; width: 50px; text-align: center;">#</th>
              <th style="padding: 6px 12px; width: 340px;">数据表名</th>
              <th style="padding: 6px 12px;">表业务说明 / 备注</th>
            </tr>
          </thead>
          <tbody>
      `;

      filtered.forEach((t, idx) => {
        const name = t.tableName;
        const comment = (t.tableComment || '').trim();
        const isChecked = selectedTableSet.has(name);
        const isEven = idx % 2 === 0;
        const isDark = isCurrentDarkMode();
        const rowBg = isChecked
          ? (isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff')
          : (isDark ? (isEven ? '#1e1f25' : '#22252c') : (isEven ? '#fff' : '#fafbfc'));
        const rowBorder = isDark ? '#2b2d35' : '#f0f0f0';

        html += `
          <tr class="datax-perm-tbl-row" data-table="${safeEscapeHtml(name)}" data-idx="${idx}" data-even="${isEven}"
              style="border-bottom: 1px solid ${rowBorder}; background: ${rowBg}; border-left: ${isChecked ? '3px solid #1890ff' : '3px solid transparent'}; cursor: pointer; transition: background-color 0.15s;">
            <td style="padding: 6px 10px; text-align: center; vertical-align: middle;">
              <input type="checkbox" class="datax-perm-tbl-chk" data-table="${safeEscapeHtml(name)}" data-idx="${idx}" ${isChecked ? 'checked' : ''} style="cursor: pointer; vertical-align: middle;" />
            </td>
            <td style="padding: 6px 10px; text-align: center; vertical-align: middle; color: #8c8c8c; font-size: 11px;">
              ${idx + 1}
            </td>
            <td style="padding: 6px 12px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-family: 'SFMono-Regular', Consolas, monospace; color: #1890ff;" title="${safeEscapeHtml(name)}">
              📄 ${safeEscapeHtml(name)}
            </td>
            <td style="padding: 6px 12px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #595959; font-size: 11px;" title="${safeEscapeHtml(comment || '无表备注说明')}">
              ${comment ? `💬 ${safeEscapeHtml(comment)}` : '<span style="color: #bfbfbf;">无备注说明</span>'}
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      tableListContainer.innerHTML = html;

      // 绑定表头全选
      const headerChk = tableListContainer.querySelector('#datax-perm-tbl-header-chk');
      if (headerChk) {
        headerChk.onchange = () => {
          const checked = headerChk.checked;
          filtered.forEach(t => {
            if (checked) {
              selectedTableSet.add(t.tableName);
            } else {
              selectedTableSet.delete(t.tableName);
            }
          });
          syncTableVisuals();
        };
      }

      // 绑定行点击与 Shift 连续区间多选
      const rows = tableListContainer.querySelectorAll('.datax-perm-tbl-row');
      rows.forEach(row => {
        row.onclick = (e) => {
          const tblName = row.getAttribute('data-table');
          const rowIdx = parseInt(row.getAttribute('data-idx'), 10);
          const isCheckboxClick = Boolean(e.target.closest('.datax-perm-tbl-chk'));

          if (e.shiftKey && tableLastClickedIdx !== null && tableLastClickedIdx !== rowIdx) {
            const start = Math.min(tableLastClickedIdx, rowIdx);
            const end = Math.max(tableLastClickedIdx, rowIdx);
            const targetState = !selectedTableSet.has(tblName);
            for (let i = start; i <= end; i++) {
              const item = filtered[i];
              if (item) {
                if (targetState) {
                  selectedTableSet.add(item.tableName);
                } else {
                  selectedTableSet.delete(item.tableName);
                }
              }
            }
          } else {
            if (isCheckboxClick) {
              const chk = e.target.closest('.datax-perm-tbl-chk');
              if (chk.checked) {
                selectedTableSet.add(tblName);
              } else {
                selectedTableSet.delete(tblName);
              }
            } else {
              if (selectedTableSet.has(tblName)) {
                selectedTableSet.delete(tblName);
              } else {
                selectedTableSet.add(tblName);
              }
            }
          }

          tableLastClickedIdx = rowIdx;
          syncTableVisuals();
        };
      });

      // 绑定通用矩形框选引擎 (MarqueeSelector)
      if (window.DataXAssistant && (typeof window.DataXAssistant.bindMarqueeSelection === 'function' || window.DataXAssistant.MarqueeSelector)) {
        const bindFn = window.DataXAssistant.bindMarqueeSelection || ((opts) => new window.DataXAssistant.MarqueeSelector(opts));
        tableMarqueeInstance = bindFn({
          container: tableListContainer,
          rowSelector: '.datax-perm-tbl-row',
          checkboxSelector: '.datax-perm-tbl-chk',
          getIdFromRow: (row) => row.getAttribute('data-table'),
          selectedSet: selectedTableSet,
          selectedBg: isCurrentDarkMode() ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff',
          selectionBoxId: 'datax-perm-tbl-marquee-box',
          onSelectionChange: () => {
            syncTableVisuals();
          }
        });
      }

      syncTableVisuals();
    }

    tableFilterInput.oninput = () => renderTableList();

    // 快捷按钮：全选当前过滤出的表
    modal.querySelector('#datax-perm-select-all-btn').onclick = () => {
      const filterKw = (tableFilterInput.value || '').trim().toLowerCase();
      const filtered = curDsTables.filter(t => {
        if (!filterKw) return true;
        const name = (t.tableName || '').toLowerCase();
        const comment = (t.tableComment || '').toLowerCase();
        return name.includes(filterKw) || comment.includes(filterKw);
      });
      filtered.forEach(t => selectedTableSet.add(t.tableName));
      syncTableVisuals();
    };

    // 快捷按钮：反选当前过滤项
    const invertBtn = modal.querySelector('#datax-perm-invert-sel-btn');
    if (invertBtn) {
      invertBtn.onclick = () => {
        const filterKw = (tableFilterInput.value || '').trim().toLowerCase();
        const filtered = curDsTables.filter(t => {
          if (!filterKw) return true;
          const name = (t.tableName || '').toLowerCase();
          const comment = (t.tableComment || '').toLowerCase();
          return name.includes(filterKw) || comment.includes(filterKw);
        });
        filtered.forEach(t => {
          if (selectedTableSet.has(t.tableName)) {
            selectedTableSet.delete(t.tableName);
          } else {
            selectedTableSet.add(t.tableName);
          }
        });
        syncTableVisuals();
      };
    }

    // 快捷按钮：清空选择
    modal.querySelector('#datax-perm-clear-all-btn').onclick = () => {
      selectedTableSet.clear();
      syncTableVisuals();
    };

    // 重置表单
    function resetForm() {
      currentEditingId = null;
      roleSelect.value = 'ROLE_USER';
      dsSelect.value = '';
      chkQuery.checked = true;
      chkSql.checked = true;
      maxRowsSelect.value = '2000';
      chkAllTables.checked = true;
      tablesSelectorWrap.style.display = 'none';
      selectedCountBadge.style.display = 'none';
      selectedTableSet.clear();
      curDsTables = [];
      currentLoadedDsId = null;
      tableLastClickedIdx = null;
      if (tableMarqueeInstance && typeof tableMarqueeInstance.destroy === 'function') {
        tableMarqueeInstance.destroy();
        tableMarqueeInstance = null;
      }
      tableListContainer.innerHTML = '<div style="text-align: center; color: #bfbfbf; font-size: 12px; padding: 20px;">请先选择数据库以加载表列表</div>';
      formTitle.innerHTML = '<span>➕ 配置角色授权策略</span>';
      editIndicator.style.display = 'none';
      saveBtn.textContent = '保存授权策略';
      saveBtn.style.background = 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)';
      syncRoleDeleteBtnState();
    }

    resetBtn.onclick = resetForm;
    if (roleSelect) {
      roleSelect.onchange = () => syncRoleDeleteBtnState();
    }

    // 保存策略
    saveBtn.onclick = async () => {
      const roleCode = (roleSelect.value || '').trim();
      if (!roleCode) {
        alertMsg('请选择目标角色');
        return;
      }

      const dsId = dsSelect.value ? parseInt(dsSelect.value, 10) : null;
      if (!dsId) {
        alertMsg('请选择被授权的目标数据库');
        return;
      }

      let tablesStr = '*';
      if (!chkAllTables.checked) {
        if (selectedTableSet.size === 0) {
          alertMsg('您未勾选【通配整库全部表】，请至少勾选一张具体数据表');
          return;
        }
        tablesStr = Array.from(selectedTableSet).join(',');
      }

      const payload = {
        id: currentEditingId || null,
        roleCode: roleCode,
        datasourceId: dsId,
        tableNames: tablesStr,
        allowQuery: chkQuery.checked ? 1 : 0,
        allowSql: chkSql.checked ? 1 : 0,
        maxQueryRows: parseInt(maxRowsSelect.value, 10) || 2000
      };

      try {
        saveBtn.disabled = true;
        saveBtn.textContent = '正在保存...';
        const res = await http.fetchJson('/api/tableData/permission/save', {
          method: 'POST',
          body: payload
        });

        if (http.isApiSuccess(res)) {
          toast(currentEditingId ? '🎉 角色库表权限策略已成功更新！' : '🎉 角色库表权限策略已成功创建！');
          resetForm();
          await fetchPermList();
        } else {
          alertMsg(`保存失败: ${http.getApiMsg(res, '未知原因')}`);
        }
      } catch (err) {
        alertMsg(`保存异常: ${err.message}`);
      } finally {
        saveBtn.disabled = false;
        if (!currentEditingId) {
          saveBtn.textContent = '保存授权策略';
        }
      }
    };

    // 拉取与渲染已有策略清单
    async function fetchPermList() {
      tableContainer.innerHTML = '<div style="text-align: center; color: #1890ff; font-size: 12px; padding: 24px;">⏳ 正在刷新权限列表...</div>';
      try {
        const res = await http.fetchJson('/api/tableData/permission/list', { method: 'GET' });
        permList = http.extractListFromResponse(res) || [];
        totalBadge.textContent = `共 ${permList.length} 条`;
        renderPermTable();
      } catch (err) {
        tableContainer.innerHTML = `<div style="text-align: center; color: #ff4d4f; font-size: 12px; padding: 24px;">获取权限配置失败: ${safeEscapeHtml(err.message)}</div>`;
      }
    }

    refreshListBtn.onclick = () => fetchPermList();

    function renderPermTable() {
      if (permList.length === 0) {
        tableContainer.innerHTML = `
          <div style="text-align: center; color: #8c8c8c; font-size: 12px; padding: 36px;">
            暂无已配置的角色库表权限，默认非管理员角色无权查库。请在上方表单添加授权。
          </div>
        `;
        return;
      }

      const isDark = isCurrentDarkMode();
      let html = `
        <table style="width: 100%; min-width: 860px; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead>
            <tr style="background: ${isDark ? '#252831' : '#fafafa'}; border-bottom: 1px solid ${isDark ? '#333740' : '#e8e8e8'}; color: ${isDark ? '#9ca3af' : '#595959'}; font-weight: 600; white-space: nowrap;">
              <th style="padding: 10px 12px; width: 60px; text-align: center;">ID</th>
              <th style="padding: 10px 14px; width: 140px;">角色标识</th>
              <th style="padding: 10px 14px; width: 180px;">目标数据库</th>
              <th style="padding: 10px 14px; min-width: 180px;">授权数据表范围</th>
              <th style="padding: 10px 14px; width: 150px; text-align: center;">权限细项</th>
              <th style="padding: 10px 14px; width: 90px; text-align: center;">单次上限</th>
              <th style="padding: 10px 14px; width: 155px; text-align: center;">更新时间</th>
              <th style="padding: 10px 14px; width: 130px; text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody>
      `;

      permList.forEach((p, idx) => {
        const isEven = idx % 2 === 0;
        const dsObj = dsList.find(d => String(d.id) === String(p.datasourceId));
        const dsName = dsObj ? `${dsObj.datasourceName || dsObj.name} (${dsObj.datasource})` : `数据源 #${p.datasourceId}`;

        let tablesBadge = '';
        if (p.tableNames === '*' || !p.tableNames) {
          tablesBadge = `<span style="background: ${isDark ? 'rgba(82, 196, 26, 0.18)' : '#f6ffed'}; border: 1px solid ${isDark ? 'rgba(82, 196, 26, 0.45)' : '#b7eb8f'}; color: #52c41a; padding: 3px 10px; border-radius: 4px; font-weight: bold; display: inline-flex; align-items: center; white-space: nowrap; line-height: 1.4;">🌟 整库全部表 (*)</span>`;
        } else {
          const arr = p.tableNames.split(',').map(s => s.trim()).filter(Boolean);
          const preview = arr.slice(0, 3).map(tbl => `<code style="background: ${isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff'}; color: ${isDark ? '#40a9ff' : '#096dd9'}; padding: 2px 6px; border-radius: 3px; font-size: 11px; white-space: nowrap; display: inline-block;">${safeEscapeHtml(tbl)}</code>`).join(' ');
          tablesBadge = `<span style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">${preview} ${arr.length > 3 ? `<span style="color: #8c8c8c; font-size: 11px;">(共 ${arr.length} 张)</span>` : ''}</span>`;
        }

        const queryTag = p.allowQuery === 1
          ? `<span style="color: #52c41a; background: ${isDark ? 'rgba(82, 196, 26, 0.18)' : '#f6ffed'}; border: 1px solid ${isDark ? 'rgba(82, 196, 26, 0.45)' : '#b7eb8f'}; padding: 2px 7px; border-radius: 4px; font-size: 11px; white-space: nowrap; display: inline-block; line-height: 1.4;">查数据 √</span>`
          : '<span style="color: #bfbfbf; white-space: nowrap; font-size: 11px;">无数据</span>';
        const sqlTag = p.allowSql === 1
          ? `<span style="color: ${isDark ? '#d3adf7' : '#722ed1'}; background: ${isDark ? 'rgba(114, 46, 209, 0.25)' : '#f9f0ff'}; border: 1px solid ${isDark ? 'rgba(179, 127, 235, 0.45)' : '#d3adf7'}; padding: 2px 7px; border-radius: 4px; font-size: 11px; white-space: nowrap; display: inline-block; line-height: 1.4;">SQL √</span>`
          : '<span style="color: #bfbfbf; white-space: nowrap; font-size: 11px;">无SQL</span>';

        html += `
          <tr style="border-bottom: 1px solid ${isDark ? '#2b2d35' : '#f0f0f0'}; background: ${isDark ? (isEven ? '#1e1f25' : '#22252c') : (isEven ? '#fff' : '#fafbfc')}; transition: background-color 0.2s;">
            <td style="padding: 10px 12px; text-align: center; color: #8c8c8c; vertical-align: middle; white-space: nowrap; font-weight: bold;">${p.id}</td>
            <td style="padding: 10px 14px; vertical-align: middle; white-space: nowrap;">
              <span style="font-weight: 600; color: ${isDark ? '#e5e7eb' : '#262626'}; background: ${isDark ? '#282a32' : '#f0f2f5'}; border: 1px solid ${isDark ? '#3f4350' : '#e4e7ed'}; padding: 3px 8px; border-radius: 4px; font-family: monospace;">${safeEscapeHtml(p.roleCode)}</span>
            </td>
            <td style="padding: 10px 14px; vertical-align: middle; white-space: nowrap;" title="${safeEscapeHtml(dsName)}">
              <span style="font-weight: 600; color: #1890ff;">${safeEscapeHtml(dsName)}</span>
            </td>
            <td style="padding: 10px 14px; vertical-align: middle; white-space: nowrap;">
              ${tablesBadge}
            </td>
            <td style="padding: 10px 14px; text-align: center; vertical-align: middle; white-space: nowrap;">
              <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: center;">
                ${queryTag}
                ${sqlTag}
              </div>
            </td>
            <td style="padding: 10px 14px; text-align: center; vertical-align: middle; white-space: nowrap; font-family: monospace; color: #595959;">
              ${p.maxQueryRows || 2000} 行
            </td>
            <td style="padding: 10px 14px; text-align: center; vertical-align: middle; white-space: nowrap; color: #8c8c8c; font-size: 11px;">
              ${safeEscapeHtml(p.updateTime || p.createTime || '-')}
            </td>
            <td style="padding: 10px 14px; text-align: center; vertical-align: middle; white-space: nowrap;">
              <div style="display: inline-flex; gap: 8px; align-items: center; justify-content: center;">
                <button class="datax-perm-edit-btn" data-id="${p.id}" type="button" style="background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; transition: all 0.2s;">
                  ✏️ 编辑
                </button>
                <button class="datax-perm-del-btn" data-id="${p.id}" data-role="${safeEscapeHtml(p.roleCode)}" type="button" style="background: #fff1f0; border: 1px solid #ffa39e; color: #f5222d; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; transition: all 0.2s;">
                  🗑️ 删除
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      tableContainer.innerHTML = html;

      // 绑定编辑
      tableContainer.querySelectorAll('.datax-perm-edit-btn').forEach(btn => {
        btn.onclick = () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const item = permList.find(p => p.id === id);
          if (!item) return;

          currentEditingId = item.id;
          formTitle.innerHTML = `<span>✏️ 编辑授权策略 (ID: ${item.id})</span>`;
          editIndicator.style.display = 'block';
          saveBtn.textContent = `更新授权策略 (ID: ${item.id})`;
          saveBtn.style.background = 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)';

          const rCode = (item.roleCode || '').trim();
          let roleFound = false;
          for (let i = 0; i < roleSelect.options.length; i++) {
            if (roleSelect.options[i].value === rCode) {
              roleFound = true;
              break;
            }
          }
          if (!roleFound && rCode) {
            const opt = document.createElement('option');
            opt.value = rCode;
            opt.textContent = `${rCode} (历史角色)`;
            roleSelect.appendChild(opt);
          }
          roleSelect.value = rCode || 'ROLE_USER';
          syncRoleDeleteBtnState();

          dsSelect.value = String(item.datasourceId);
          chkQuery.checked = item.allowQuery === 1;
          chkSql.checked = item.allowSql === 1;
          maxRowsSelect.value = String(item.maxQueryRows || 2000);

          if (item.tableNames === '*' || !item.tableNames) {
            chkAllTables.checked = true;
            tablesSelectorWrap.style.display = 'none';
            selectedCountBadge.style.display = 'none';
            selectedTableSet.clear();
          } else {
            chkAllTables.checked = false;
            tablesSelectorWrap.style.display = 'flex';
            selectedCountBadge.style.display = 'inline-block';
            selectedTableSet.clear();
            item.tableNames.split(',').map(s => s.trim()).filter(Boolean).forEach(t => selectedTableSet.add(t));
            updateSelectedCountText();
            loadTablesForDatasource(item.datasourceId);
          }

          tabContentTable.scrollTo({ top: 0, behavior: 'smooth' });
        };
      });

      // 绑定删除
      tableContainer.querySelectorAll('.datax-perm-del-btn').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const role = btn.getAttribute('data-role');
          if (!confirm(`确定要删除角色 [${role}] 的该条库表访问授权规则吗？删除后该角色将失去该库的访问权。`)) {
            return;
          }

          try {
            btn.disabled = true;
            btn.textContent = '删除中...';
            const res = await http.fetchJson(`/api/tableData/permission/delete?id=${id}`, {
              method: 'POST'
            });
            if (http.isApiSuccess(res)) {
              toast('已成功删除授权策略');
              if (currentEditingId === id) {
                resetForm();
              }
              await fetchPermList();
            } else {
              alertMsg(`删除失败: ${http.getApiMsg(res, '未知原因')}`);
            }
          } catch (err) {
            alertMsg(`删除异常: ${err.message}`);
          }
        };
      });
    }

    // ==========================================
    // 2. 角色系统菜单权限策略 (Tab 2)
    // ==========================================
    // 系统标准菜单注册表（按 DataX-Web 左侧原生菜单栏物理标准顺序 1:1 严格定义）
    const MENU_DEFINITIONS = [
      { code: 'dashboard', name: '运行报表', icon: '📊', order: 1, path: '/dashboard', desc: '大屏运行概况与任务统计趋势', isDefault: false },
      { code: 'project', name: '项目管理', icon: '📁', order: 2, path: '/datax/jobProject', desc: '数据同步业务项目与分组维护', isDefault: false },
      { code: 'jobInfo', name: '任务管理', icon: '⚙️', order: 3, path: '/datax/job/jobInfo', desc: 'DataX 数据抽取与写入任务', isDefault: false },
      { code: 'jdbcDatasource', name: '数据源管理', icon: '🗄️', order: 4, path: '/datax/jdbcDatasource', desc: '数据库连接、敏感账号密码配置', isDefault: false },
      { code: 'jobLog', name: '任务日志', icon: '📜', order: 5, path: '/datax/log/jobLog', desc: '任务调度与执行历史详细日志', isDefault: false },
      { code: 'executor', name: '执行器管理', icon: '💻', order: 6, path: '/datax/executor', desc: '执行器节点心跳与路由策略维护', isDefault: false },
      { code: 'user', name: '用户管理', icon: '👥', order: 7, path: '/datax/user', desc: '系统账户与角色分配管理', isDefault: false },
      { code: 'registry', name: '资源监控', icon: '🔋', order: 8, path: '/datax/registry', desc: '服务器 JVM、CPU 与内存资源监控', isDefault: false },
      { code: 'jsonFormat', name: 'JSON 格式化', icon: '📋', order: 9, path: '/tool/jsonFormat', desc: '在线 JSON 语法高亮与校验格式化工具', isDefault: false },
      { code: 'tableQuery', name: '库表简易查询', icon: '🔍', order: 10, path: '原生侧边栏快捷入口', desc: '零代码库表结构探查与数据检索', isDefault: true }
    ];

    /**
     * 获取菜单排序序号权重
     * @param {string} code 菜单编码
     * @returns {number} 排序序号
     */
    function getMenuOrder(code) {
      if (!code) return 999;
      const found = MENU_DEFINITIONS.find(m => m.code === code);
      return found ? found.order : 999;
    }

    /**
     * 统一对菜单编码列表按系统标准顺序排序（公共方法）
     * @param {Array<string>|Set<string>|string} codes 菜单编码集合或逗号分隔字符串
     * @returns {Array<string>} 排好序的菜单编码数组
     */
    function sortMenuCodes(codes) {
      if (!codes) return [];
      let list = [];
      if (typeof codes === 'string') {
        list = codes.split(',').map(s => s.trim()).filter(Boolean);
      } else if (codes instanceof Set) {
        list = Array.from(codes);
      } else if (Array.isArray(codes)) {
        list = [...codes];
      }
      return list.sort((a, b) => getMenuOrder(a) - getMenuOrder(b));
    }

    const menuRoleSelect = modal.querySelector('#datax-menu-perm-role-select');
    const menuListContainer = modal.querySelector('#datax-menu-list-container');
    const menuSelectedCountBadge = modal.querySelector('#datax-menu-selected-count-badge');
    const menuSaveBtn = modal.querySelector('#datax-menu-perm-save-btn');
    const menuResetBtn = modal.querySelector('#datax-menu-perm-reset-btn');
    const menuRefreshListBtn = modal.querySelector('#datax-menu-perm-refresh-list-btn');
    const menuTableContainer = modal.querySelector('#datax-menu-perm-table-container');
    const menuTotalBadge = modal.querySelector('#datax-menu-perm-total-badge');
    const menuFormTitle = modal.querySelector('#datax-menu-perm-form-title');
    const menuEditIndicator = modal.querySelector('#datax-menu-perm-edit-indicator');

    // 关联用户管理 DOM 节点
    const roleUserCountBadge = modal.querySelector('#datax-role-user-count-badge');
    const roleUserTagsBox = modal.querySelector('#datax-role-user-tags-box');
    const roleUserFilterInput = modal.querySelector('#datax-role-user-filter-input');
    const roleUserBatchOpenBtn = modal.querySelector('#datax-role-user-batch-open-btn');
    const roleUserClearAllBtn = modal.querySelector('#datax-role-user-clear-all-btn');

    // 批量弹窗节点
    const userBatchModal = modal.querySelector('#datax-user-batch-modal');
    const userBatchTitle = modal.querySelector('#datax-user-batch-title');
    const userBatchCloseBtn = modal.querySelector('#datax-user-batch-close-btn');
    const userBatchCancelBtn = modal.querySelector('#datax-user-batch-cancel-btn');
    const userBatchSearchInput = modal.querySelector('#datax-user-batch-search-input');
    const userBatchSelectAllBtn = modal.querySelector('#datax-user-batch-select-all-btn');
    const userBatchClearSelBtn = modal.querySelector('#datax-user-batch-clear-sel-btn');
    const userBatchCountStat = modal.querySelector('#datax-user-batch-count-stat');
    const userBatchUserList = modal.querySelector('#datax-user-batch-user-list');
    const userBatchSubmitBtn = modal.querySelector('#datax-user-batch-submit-btn');

    const selectedMenuSet = new Set(['tableQuery']);
    let roleMenuList = [];
    let allSystemUsers = [];
    let currentRoleUsers = [];
    const selectedUserIdsForBatch = new Set();
    let menuMarqueeInstance = null;
    let userBatchMarqueeInstance = null;

    // ==========================================
    // 系统角色字典动态管控与新建逻辑
    // ==========================================
    let systemRoleList = [];

    const roleCreateModal = modal.querySelector('#datax-role-create-modal');
    const roleCreateCloseBtn = modal.querySelector('#datax-role-create-close-btn');
    const roleCreateCancelBtn = modal.querySelector('#datax-role-create-cancel-btn');
    const roleCreateSubmitBtn = modal.querySelector('#datax-role-create-submit-btn');
    const roleCreateCodeInput = modal.querySelector('#datax-role-create-code');
    const roleCreateNameInput = modal.querySelector('#datax-role-create-name');
    const roleCreateDescInput = modal.querySelector('#datax-role-create-desc');

    const permRoleAddBtn = modal.querySelector('#datax-perm-role-add-btn');
    const menuRoleAddBtn = modal.querySelector('#datax-menu-perm-role-add-btn');
    const permRoleDelBtn = modal.querySelector('#datax-perm-role-del-btn');
    const menuRoleDelBtn = modal.querySelector('#datax-menu-perm-role-del-btn');

    function syncRoleDeleteBtnState() {
      const curMenuRole = (menuRoleSelect ? menuRoleSelect.value : '').trim();
      const canDelMenuRole = curMenuRole && curMenuRole !== 'ROLE_ADMIN' && curMenuRole !== 'ROLE_USER';
      if (menuRoleDelBtn) {
        menuRoleDelBtn.style.display = canDelMenuRole ? 'inline-block' : 'none';
      }

      const curPermRole = (roleSelect ? roleSelect.value : '').trim();
      const canDelPermRole = curPermRole && curPermRole !== 'ROLE_ADMIN' && curPermRole !== 'ROLE_USER';
      if (permRoleDelBtn) {
        permRoleDelBtn.style.display = canDelPermRole ? 'inline-block' : 'none';
      }
    }

    /**
     * 级联删除指定角色及其全部库表权限与菜单策略（公共方法）
     * @param {string} roleCode 待删除角色编码
     */
    async function handleDeleteRole(roleCode) {
      if (!roleCode) return;
      const r = String(roleCode).trim();
      if (r === 'ROLE_ADMIN' || r === 'ROLE_USER') {
        alertMsg(`系统内置基础角色 [${r}] 禁止删除`);
        return;
      }
      if (!confirm(`确定彻底删除角色 [${r}] 吗？\n删除后将同时清理该角色的菜单权限与全部库表授权规则，关联用户将重置为普通用户。`)) {
        return;
      }

      try {
        const res = await http.fetchJson(`/api/tableData/role/delete?roleCode=${encodeURIComponent(r)}`, { method: 'POST' });
        if (http.isApiSuccess(res)) {
          toast(`已成功删除角色 [${r}] 及其所有权限规则`);
          if (window.DataXAssistant?.AuthGuard?.refreshAllowedMenus) {
            window.DataXAssistant.AuthGuard.refreshAllowedMenus();
          }

          // 两个下拉框统一重置为 ROLE_USER
          if (menuRoleSelect) menuRoleSelect.value = 'ROLE_USER';
          if (roleSelect) roleSelect.value = 'ROLE_USER';
          updateMenuConfigStateByRole('ROLE_USER');
          fetchRoleUsers('ROLE_USER');
          syncRoleDeleteBtnState();

          // 刷新所有相关数据列表
          await fetchSystemRoleList('ROLE_USER');
          await fetchRoleMenuList();
          await fetchPermList();
        } else {
          alertMsg(`删除角色失败: ${http.getApiMsg(res, '未知原因')}`);
        }
      } catch (err) {
        alertMsg(`删除角色异常: ${err.message}`);
      }
    }

    function openRoleCreateModal() {
      if (!roleCreateModal) return;
      roleCreateCodeInput.value = '';
      roleCreateNameInput.value = '';
      roleCreateDescInput.value = '';
      roleCreateModal.style.display = 'flex';
      setTimeout(() => roleCreateCodeInput.focus(), 60);
    }

    function closeRoleCreateModal() {
      if (roleCreateModal) roleCreateModal.style.display = 'none';
    }

    if (roleCreateCloseBtn) roleCreateCloseBtn.onclick = closeRoleCreateModal;
    if (roleCreateCancelBtn) roleCreateCancelBtn.onclick = closeRoleCreateModal;
    if (menuRoleAddBtn) menuRoleAddBtn.onclick = openRoleCreateModal;
    if (permRoleAddBtn) permRoleAddBtn.onclick = openRoleCreateModal;
    if (menuRoleDelBtn) {
      menuRoleDelBtn.onclick = () => {
        const r = menuRoleSelect ? menuRoleSelect.value : '';
        handleDeleteRole(r);
      };
    }
    if (permRoleDelBtn) {
      permRoleDelBtn.onclick = () => {
        const r = roleSelect ? roleSelect.value : '';
        handleDeleteRole(r);
      };
    }

    /**
     * 动态渲染单个角色下拉框的 options
     * @param {HTMLSelectElement} selectEl 下拉框元素
     * @param {string} selectedVal 当前应选中的 roleCode
     * @param {boolean} isMenuTab 是否是菜单权限 Tab
     */
    function renderRoleOptionsForSelect(selectEl, selectedVal, isMenuTab = false) {
      if (!selectEl) return;
      let html = '';
      let hasAdmin = false;
      let hasUser = false;

      if (Array.isArray(systemRoleList) && systemRoleList.length > 0) {
        systemRoleList.forEach(r => {
          const code = r.roleCode;
          if (code === 'ROLE_ADMIN') hasAdmin = true;
          if (code === 'ROLE_USER') hasUser = true;

          let label = '';
          if (code === 'ROLE_ADMIN') {
            label = isMenuTab ? '👑 管理员 (ROLE_ADMIN - 默认全特权无需配置)' : '👑 管理员 (ROLE_ADMIN)';
          } else if (code === 'ROLE_USER') {
            label = '普通用户 (ROLE_USER)';
          } else {
            label = `${r.roleName || code} (${code})`;
          }
          html += `<option value="${safeEscapeHtml(code)}">${safeEscapeHtml(label)}</option>`;
        });
      }

      if (!hasUser) {
        html = `<option value="ROLE_USER">普通用户 (ROLE_USER)</option>` + html;
      }
      if (!hasAdmin) {
        html += `<option value="ROLE_ADMIN">${isMenuTab ? '👑 管理员 (ROLE_ADMIN - 默认全特权无需配置)' : '👑 管理员 (ROLE_ADMIN)'}</option>`;
      }
      // 若当前选中的角色既非内置角色也未在系统字典中（历史策略），优雅追加显示
      if (selectedVal && selectedVal !== 'ROLE_USER' && selectedVal !== 'ROLE_ADMIN') {
        const inList = Array.isArray(systemRoleList) && systemRoleList.some(r => r.roleCode === selectedVal);
        if (!inList) {
          html += `<option value="${safeEscapeHtml(selectedVal)}">${safeEscapeHtml(selectedVal)} (历史角色)</option>`;
        }
      }
      selectEl.innerHTML = html;
      selectEl.value = selectedVal || 'ROLE_USER';
    }

    /**
     * 从后端动态拉取系统角色列表，并同步刷新两个 Tab 的角色选择下拉框
     * @param {string} [targetSelectRole=null] 刷新后指定选中的角色
     */
    async function fetchSystemRoleList(targetSelectRole = null) {
      try {
        const res = await http.fetchJson('/api/tableData/role/list', { method: 'GET' });
        systemRoleList = http.extractListFromResponse(res) || [];
      } catch (e) {
        console.warn('拉取系统角色字典失败:', e);
      }

      const curMenuVal = targetSelectRole || (menuRoleSelect ? menuRoleSelect.value : 'ROLE_USER');
      const curPermVal = targetSelectRole || (roleSelect ? roleSelect.value : 'ROLE_USER');

      renderRoleOptionsForSelect(menuRoleSelect, curMenuVal, true);
      renderRoleOptionsForSelect(roleSelect, curPermVal, false);

      if (targetSelectRole) {
        updateMenuConfigStateByRole(targetSelectRole);
        if (!isAdminRole(targetSelectRole)) {
          loadRoleMenusForSelected(targetSelectRole);
        }
        fetchRoleUsers(targetSelectRole);
      }
      syncRoleDeleteBtnState();
    }

    // 确认创建新角色
    if (roleCreateSubmitBtn) {
      roleCreateSubmitBtn.onclick = async () => {
        let code = (roleCreateCodeInput.value || '').trim();
        const name = (roleCreateNameInput.value || '').trim();
        const desc = (roleCreateDescInput.value || '').trim();

        if (!code) {
          alertMsg('请输入角色标识编码 (如 ROLE_ANALYST)');
          roleCreateCodeInput.focus();
          return;
        }
        code = code.toUpperCase();
        if (!/^[A-Z][A-Z0-9_]{2,30}$/.test(code)) {
          alertMsg('角色标识格式错误: 须以大写字母开头，仅允许大写字母、数字和下划线，长度3-30位');
          roleCreateCodeInput.focus();
          return;
        }

        if (!name) {
          alertMsg('请输入角色中文名称 (如 业务数据分析师)');
          roleCreateNameInput.focus();
          return;
        }

        try {
          roleCreateSubmitBtn.disabled = true;
          roleCreateSubmitBtn.textContent = '创建中...';
          const res = await http.fetchJson('/api/tableData/role/add', {
            method: 'POST',
            body: {
              roleCode: code,
              roleName: name,
              description: desc
            }
          });

          if (http.isApiSuccess(res)) {
            toast(`🎉 角色 [${name} (${code})] 创建成功`);
            closeRoleCreateModal();
            // 刷新并选中新角色，跨两个 Tab 联动生效
            await fetchSystemRoleList(code);
          } else {
            alertMsg(`创建角色失败: ${http.getApiMsg(res, '未知原因')}`);
          }
        } catch (err) {
          alertMsg(`创建角色异常: ${err.message}`);
        } finally {
          roleCreateSubmitBtn.disabled = false;
          roleCreateSubmitBtn.textContent = '确认创建';
        }
      };
    }

    // 获取当前选中的角色编码
    function getSelectedRoleCode() {
      return (menuRoleSelect ? menuRoleSelect.value : '').trim();
    }

    // 判断是否为管理员角色
    function isAdminRole(role) {
      if (!role) return false;
      const r = String(role).trim().toUpperCase();
      return r === 'ROLE_ADMIN' || r === 'ADMIN' || r === '1';
    }

    // 根据角色类型切换菜单配置状态 (如果是 admin 角色无需配置菜单)
    function updateMenuConfigStateByRole(roleCode) {
      const isAdmin = isAdminRole(roleCode);
      const quickTools = modal.querySelector('#datax-menu-perm-quick-tools');

      if (isAdmin) {
        MENU_DEFINITIONS.forEach(m => selectedMenuSet.add(m.code));
        if (quickTools) quickTools.style.display = 'none';
        menuSaveBtn.disabled = true;
        menuSaveBtn.textContent = '管理员无需配置菜单';
        menuSaveBtn.style.background = '#e8e8e8';
        menuSaveBtn.style.color = '#8c8c8c';
        menuSaveBtn.style.boxShadow = 'none';
        menuSaveBtn.style.cursor = 'not-allowed';
        renderMenuList(true);
      } else {
        if (quickTools) quickTools.style.display = 'flex';
        menuSaveBtn.disabled = false;
        menuSaveBtn.textContent = '保存菜单配置';
        menuSaveBtn.style.background = 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)';
        menuSaveBtn.style.color = '#fff';
        menuSaveBtn.style.boxShadow = '0 2px 6px rgba(114,46,209,0.3)';
        menuSaveBtn.style.cursor = 'pointer';
        renderMenuList(false);
      }
    }

    /**
     * 渲染菜单授权列表（支持整行点击与鼠标拖拽框选）
     * @param {boolean} [isDisabled=false] 是否处于只读锁定模式（例如管理员角色）
     */
    function renderMenuList(isDisabled = false) {
      if (!menuListContainer) return;

      // 清理上一次的框选实例
      if (menuMarqueeInstance && typeof menuMarqueeInstance.cleanup === 'function') {
        menuMarqueeInstance.cleanup();
        menuMarqueeInstance = null;
      }

      let tipHtml = '';
      if (isDisabled) {
        tipHtml = `
          <div style="margin: 8px 12px; font-size: 12px; color: #722ed1; background: #f9f0ff; border: 1px solid #d3adf7; padding: 6px 12px; border-radius: 4px; display: flex; align-items: center; gap: 6px;">
            <span>👑</span>
            <span><strong>管理员角色默认拥有系统全量功能菜单特权，无需配置策略。</strong> 人员维护请在下方直接管理关联用户。</span>
          </div>
        `;
      }

      // 严格按照标准 order 顺序排列
      const sortedMenus = [...MENU_DEFINITIONS].sort((a, b) => a.order - b.order);

      let tableHtml = `
        ${tipHtml}
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead>
            <tr style="background: #fafafa; border-bottom: 1px solid #e8e8e8; color: #595959; font-weight: 600; white-space: nowrap; user-select: none;">
              <th style="width: 44px; text-align: center; padding: 8px 4px;">
                <input type="checkbox" id="datax-menu-check-all-cb" ${isDisabled ? 'disabled' : ''} style="cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; margin: 0;" title="全选 / 反选" />
              </th>
              <th style="width: 44px; text-align: center; padding: 8px 4px;">#</th>
              <th style="width: 160px; padding: 8px 10px;">功能菜单</th>
              <th style="width: 180px; padding: 8px 10px;">权限路由 / 标识</th>
              <th style="padding: 8px 10px;">功能说明</th>
              <th style="width: 100px; text-align: center; padding: 8px 10px;">属性级别</th>
            </tr>
          </thead>
          <tbody>
      `;

      sortedMenus.forEach((m, idx) => {
        const isChecked = selectedMenuSet.has(m.code);
        tableHtml += `
          <tr class="datax-menu-list-row" data-code="${safeEscapeHtml(m.code)}" style="cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; border-bottom: 1px solid #f0f0f0; background: ${isChecked ? '#f9f0ff' : (idx % 2 === 0 ? '#fff' : '#fafbfc')}; transition: background 0.15s; user-select: none;">
            <td style="text-align: center; padding: 7px 4px; vertical-align: middle;">
              <input type="checkbox" class="datax-menu-chk-item" value="${safeEscapeHtml(m.code)}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} style="cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; margin: 0;" />
            </td>
            <td style="text-align: center; padding: 7px 4px; vertical-align: middle; color: #8c8c8c; font-weight: 600;">${m.order}</td>
            <td style="padding: 7px 10px; vertical-align: middle; font-weight: 600; color: #262626; white-space: nowrap;">
              <span style="margin-right: 6px; font-size: 14px;">${m.icon}</span>
              <span>${safeEscapeHtml(m.name)}</span>
            </td>
            <td style="padding: 7px 10px; vertical-align: middle; white-space: nowrap;">
              <span style="font-family: monospace; background: #f5f5f5; border: 1px solid #e8e8e8; padding: 2px 6px; border-radius: 4px; color: #595959; font-size: 11px;">${safeEscapeHtml(m.path || m.code)}</span>
            </td>
            <td style="padding: 7px 10px; vertical-align: middle; color: #595959;">
              ${safeEscapeHtml(m.desc)}
            </td>
            <td style="text-align: center; padding: 7px 10px; vertical-align: middle; white-space: nowrap;">
              ${m.isDefault ? '<span style="background: #f6ffed; border: 1px solid #b7eb8f; color: #52c41a; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">🌟 常用业务</span>' : '<span style="background: #f0f5ff; border: 1px solid #adc6ff; color: #1890ff; padding: 1px 6px; border-radius: 4px; font-size: 11px;">系统内置</span>'}
            </td>
          </tr>
        `;
      });

      tableHtml += `
          </tbody>
        </table>
      `;

      menuListContainer.innerHTML = tableHtml;

      if (!isDisabled) {
        // 1. 绑定整行点击切换
        menuListContainer.querySelectorAll('.datax-menu-list-row').forEach(row => {
          row.onclick = (e) => {
            const code = row.getAttribute('data-code');
            if (!code) return;
            if (e.target.tagName !== 'INPUT') {
              const chk = row.querySelector('.datax-menu-chk-item');
              if (chk) chk.checked = !chk.checked;
            }
            const chk = row.querySelector('.datax-menu-chk-item');
            if (chk) {
              if (chk.checked) {
                selectedMenuSet.add(code);
              } else {
                selectedMenuSet.delete(code);
              }
            }
            syncMenuRowVisuals();
          };
        });

        // 2. 绑定表头全选 / 反选 Checkbox
        const headCb = menuListContainer.querySelector('#datax-menu-check-all-cb');
        if (headCb) {
          headCb.onclick = (e) => {
            e.stopPropagation();
            if (headCb.checked) {
              MENU_DEFINITIONS.forEach(m => selectedMenuSet.add(m.code));
            } else {
              selectedMenuSet.clear();
            }
            syncMenuRowVisuals();
          };
        }

        // 3. 绑定通用矩形框选引擎 (MarqueeSelector)
        if (window.DataXAssistant && typeof window.DataXAssistant.bindMarqueeSelection === 'function') {
          menuMarqueeInstance = window.DataXAssistant.bindMarqueeSelection({
            container: menuListContainer,
            rowSelector: '.datax-menu-list-row',
            checkboxSelector: '.datax-menu-chk-item',
            getIdFromRow: row => row.getAttribute('data-code'),
            selectedSet: selectedMenuSet,
            selectedBg: isCurrentDarkMode() ? 'rgba(114, 46, 209, 0.28)' : '#f9f0ff',
            canStartSelection: e => !e.target.closest('button, select, input[type="text"]'),
            onSelectionChange: () => {
              syncMenuRowVisuals();
            }
          });
        }
      }

      syncMenuRowVisuals();
    }

    /**
     * 兼容别名
     */
    function renderMenuCheckboxes(isDisabled = false) {
      renderMenuList(isDisabled);
    }

    /**
     * 同步菜单列表行的高亮背景、复选框状态与统计徽章（公共方法）
     */
    function syncMenuRowVisuals() {
      if (!menuListContainer) return;
      const rows = menuListContainer.querySelectorAll('.datax-menu-list-row');
      let checkedCount = 0;
      const isDark = isCurrentDarkMode();
      rows.forEach((row, idx) => {
        const code = row.getAttribute('data-code');
        const chk = row.querySelector('.datax-menu-chk-item');
        const isSelected = selectedMenuSet.has(code);
        if (chk && chk.checked !== isSelected) {
          chk.checked = isSelected;
        }
        if (isSelected) {
          checkedCount++;
          row.style.backgroundColor = isDark ? 'rgba(114, 46, 209, 0.28)' : '#f9f0ff';
        } else {
          row.style.backgroundColor = isDark
            ? (idx % 2 === 0 ? '#1e1f25' : '#22252c')
            : (idx % 2 === 0 ? '#fff' : '#fafbfc');
        }
      });

      const allCb = menuListContainer.querySelector('#datax-menu-check-all-cb');
      if (allCb) {
        allCb.checked = checkedCount === MENU_DEFINITIONS.length && checkedCount > 0;
        allCb.indeterminate = checkedCount > 0 && checkedCount < MENU_DEFINITIONS.length;
      }

      if (menuSelectedCountBadge) {
        menuSelectedCountBadge.textContent = `已选 ${checkedCount} / ${MENU_DEFINITIONS.length} 项 (支持拖拽框选)`;
      }

      // 同步框选引擎内部状态
      if (menuMarqueeInstance && typeof menuMarqueeInstance.syncRowHighlight === 'function') {
        menuMarqueeInstance.syncRowHighlight();
      }
    }

    // 预热拉取系统全量用户
    async function fetchAllSystemUsers() {
      try {
        const res = await http.fetchJson('/api/tableData/roleUser/all', { method: 'GET' });
        if (http.isApiSuccess(res) && Array.isArray(res.data)) {
          allSystemUsers = res.data;
        }
      } catch (e) {
        console.warn('获取系统全量用户异常:', e);
      }
    }

    // 过滤已关联用户标签
    roleUserFilterInput.oninput = () => {
      const q = (roleUserFilterInput.value || '').trim().toLowerCase();
      const tags = roleUserTagsBox.querySelectorAll('.datax-user-tag-item');
      tags.forEach(tag => {
        const name = (tag.getAttribute('data-name') || '').toLowerCase();
        tag.style.display = !q || name.includes(q) ? 'inline-flex' : 'none';
      });
    };

    // 一键清空该角色人员
    roleUserClearAllBtn.onclick = async () => {
      const roleCode = getSelectedRoleCode();
      if (!roleCode || currentRoleUsers.length === 0) return;
      if (!confirm(`确定要将角色 [${roleCode}] 下关联的全部 ${currentRoleUsers.length} 位用户移出吗？（将批量重置为普通用户）`)) {
        return;
      }
      try {
        roleUserClearAllBtn.disabled = true;
        roleUserClearAllBtn.textContent = '移出中...';
        await Promise.all(currentRoleUsers.map(u => http.fetchJson(`/api/tableData/roleUser/remove?userId=${u.id}`, { method: 'POST' })));
        toast(`已清空角色 [${roleCode}] 下的所有关联用户`);
        fetchRoleUsers(roleCode);
      } catch (err) {
        alertMsg(`清空异常: ${err.message}`);
      } finally {
        roleUserClearAllBtn.disabled = false;
        roleUserClearAllBtn.textContent = '全部移出';
      }
    };

    // 获取当前角色已关联的用户列表并渲染标签
    async function fetchRoleUsers(roleCode) {
      if (!roleCode) {
        roleUserTagsBox.innerHTML = '<span style="color: #bfbfbf; font-size: 12px;">请先指定具体角色编码</span>';
        roleUserCountBadge.textContent = '当前角色关联 0 人';
        currentRoleUsers = [];
        roleUserClearAllBtn.style.display = 'none';
        return;
      }
      roleUserTagsBox.innerHTML = '<span style="color: #1890ff; font-size: 12px;">⏳ 正在拉取用户...</span>';
      try {
        const res = await http.fetchJson(`/api/tableData/roleUser/list?roleCode=${encodeURIComponent(roleCode)}`, { method: 'GET' });
        const list = http.isApiSuccess(res) && Array.isArray(res.data) ? res.data : [];
        currentRoleUsers = list;
        roleUserCountBadge.textContent = `当前角色关联 ${list.length} 人`;
        roleUserClearAllBtn.style.display = list.length > 0 ? 'inline-block' : 'none';

        if (list.length === 0) {
          roleUserTagsBox.innerHTML = '<span style="color: #8c8c8c; font-size: 12px;">暂无用户关联至此角色，点击上方「➕ 批量添加用户」进行批量勾选关联</span>';
          return;
        }
        let html = '';
        list.forEach(u => {
          html += `
            <span class="datax-user-tag-item" data-name="${safeEscapeHtml(u.username)}" style="display: inline-flex; align-items: center; gap: 4px; background: #f0f5ff; border: 1px solid #adc6ff; color: #1d39c4; padding: 2px 8px; border-radius: 4px; font-size: 12px; transition: all 0.15s;">
              <span>👤 ${safeEscapeHtml(u.username)}</span>
              <span class="datax-remove-user-btn" data-id="${u.id}" data-name="${safeEscapeHtml(u.username)}" title="移出该角色" style="cursor: pointer; color: #ff4d4f; font-weight: bold; margin-left: 3px; font-size: 13px; line-height: 1;">×</span>
            </span>
          `;
        });
        roleUserTagsBox.innerHTML = html;

        if (roleUserFilterInput.value) {
          roleUserFilterInput.oninput();
        }

        // 绑定移出用户事件
        roleUserTagsBox.querySelectorAll('.datax-remove-user-btn').forEach(btn => {
          btn.onclick = async () => {
            const uid = btn.getAttribute('data-id');
            const uname = btn.getAttribute('data-name');
            if (!confirm(`确定将用户 [${uname}] 从角色 [${roleCode}] 中移出吗？（将重置为普通用户）`)) {
              return;
            }
            try {
              btn.style.pointerEvents = 'none';
              const r = await http.fetchJson(`/api/tableData/roleUser/remove?userId=${uid}`, { method: 'POST' });
              if (http.isApiSuccess(r)) {
                toast(`已将用户 [${uname}] 移出`);
                fetchRoleUsers(roleCode);
              } else {
                alertMsg(`移出失败: ${http.getApiMsg(r, '未知原因')}`);
              }
            } catch (err) {
              alertMsg(`移出异常: ${err.message}`);
            }
          };
        });
      } catch (e) {
        roleUserTagsBox.innerHTML = `<span style="color: #ff4d4f; font-size: 12px;">获取用户失败: ${safeEscapeHtml(e.message)}</span>`;
      }
    }

    // ===================================
    // 批量关联用户弹窗逻辑 (可搜索、批量多选勾选)
    // ===================================
    roleUserBatchOpenBtn.onclick = async () => {
      const roleCode = getSelectedRoleCode();
      if (!roleCode) {
        alertMsg('请先选择或指定角色');
        return;
      }
      await fetchAllSystemUsers();
      selectedUserIdsForBatch.clear();
      userBatchSearchInput.value = '';
      userBatchTitle.innerHTML = `批量关联用户至角色: <span style="color: #722ed1; font-family: monospace;">${safeEscapeHtml(roleCode)}</span>`;
      renderBatchUserList();
      userBatchModal.style.display = 'flex';
      setTimeout(() => userBatchSearchInput.focus(), 50);
    };

    const closeBatchModal = () => {
      userBatchModal.style.display = 'none';
      if (userBatchMarqueeInstance && typeof userBatchMarqueeInstance.cleanup === 'function') {
        userBatchMarqueeInstance.cleanup();
        userBatchMarqueeInstance = null;
      }
    };
    userBatchCloseBtn.onclick = closeBatchModal;
    userBatchCancelBtn.onclick = closeBatchModal;

    const renderBatchRoleBadge = (role) => {
      if (!role) return '<span style="color: #bfbfbf;">-</span>';
      const isDark = isCurrentDarkMode();
      const isAdm = role === 'ROLE_ADMIN';
      const isUser = role === 'ROLE_USER';
      const bg = isDark
        ? (isAdm ? 'rgba(114, 46, 209, 0.25)' : (isUser ? 'rgba(24, 144, 255, 0.18)' : '#282a32'))
        : (isAdm ? '#f9f0ff' : (isUser ? '#e6f7ff' : '#f5f5f5'));
      const border = isDark
        ? (isAdm ? 'rgba(179, 127, 235, 0.45)' : (isUser ? 'rgba(24, 144, 255, 0.45)' : '#3f4350'))
        : (isAdm ? '#d3adf7' : (isUser ? '#91d5ff' : '#d9d9d9'));
      const color = isDark
        ? (isAdm ? '#d3adf7' : (isUser ? '#40a9ff' : '#d1d5db'))
        : (isAdm ? '#722ed1' : (isUser ? '#1890ff' : '#595959'));
      return `<span style="display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 4px; background: ${bg}; border: 1px solid ${border}; color: ${color}; font-family: monospace;">${safeEscapeHtml(role)}</span>`;
    };

    function syncBatchUserVisuals() {
      const rows = userBatchUserList.querySelectorAll('.datax-batch-user-row:not([data-disabled="true"])');
      let selectableCount = 0;
      let selectedSelectableCount = 0;
      const isDark = isCurrentDarkMode();

      rows.forEach(row => {
        selectableCount++;
        const uid = parseInt(row.getAttribute('data-id'), 10);
        const isSelected = selectedUserIdsForBatch.has(uid);
        if (isSelected) selectedSelectableCount++;

        row.style.background = isSelected ? (isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff') : (isDark ? '#1e1f25' : '#ffffff');
        const cb = row.querySelector('.datax-batch-user-chk');
        if (cb && cb.checked !== isSelected) {
          cb.checked = isSelected;
        }
        const nameCell = row.querySelector('.datax-batch-user-name-cell');
        if (nameCell) {
          nameCell.style.color = isSelected ? '#1890ff' : (isDark ? '#e5e7eb' : '#262626');
          nameCell.style.fontWeight = isSelected ? '600' : '500';
        }
        const statusCell = row.querySelector('.datax-batch-user-status-cell');
        if (statusCell) {
          statusCell.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 4px; color: ${isSelected ? '#1890ff' : '#8c8c8c'}; font-size: 11px; ${isSelected ? 'font-weight: 600;' : ''}">
              ${isSelected ? '● 待添加' : '○ 未关联'}
            </span>
          `;
        }
      });

      const allCb = document.getElementById('datax-batch-user-all-cb');
      if (allCb) {
        if (selectableCount === 0) {
          allCb.checked = false;
          allCb.indeterminate = false;
          allCb.disabled = true;
        } else {
          allCb.disabled = false;
          allCb.checked = selectedSelectableCount === selectableCount;
          allCb.indeterminate = selectedSelectableCount > 0 && selectedSelectableCount < selectableCount;
        }
      }
    }

    function renderBatchUserList() {
      if (userBatchMarqueeInstance && typeof userBatchMarqueeInstance.cleanup === 'function') {
        userBatchMarqueeInstance.cleanup();
        userBatchMarqueeInstance = null;
      }

      const currentRoleUserIds = new Set(currentRoleUsers.map(u => u.id));
      const keyword = (userBatchSearchInput.value || '').trim().toLowerCase();

      const filtered = allSystemUsers.filter(u => {
        if (!keyword) return true;
        const name = (u.username || '').toLowerCase();
        const role = (u.role || '').toLowerCase();
        return name.includes(keyword) || role.includes(keyword);
      });

      if (filtered.length === 0) {
        userBatchUserList.innerHTML = '<div style="width: 100%; text-align: center; color: #8c8c8c; font-size: 12px; padding: 40px;">没有匹配的系统用户</div>';
        updateBatchCount();
        return;
      }

      const isDark = isCurrentDarkMode();
      let rowsHtml = '';
      filtered.forEach(u => {
        const isAlreadyIn = currentRoleUserIds.has(u.id);
        const isSelected = selectedUserIdsForBatch.has(u.id);

        if (isAlreadyIn) {
          rowsHtml += `
            <tr class="datax-batch-user-row" data-id="${u.id}" data-disabled="true" style="border-bottom: 1px solid ${isDark ? '#2b2d35' : '#f5f5f5'}; background: ${isDark ? '#22242a' : '#fafafa'}; color: ${isDark ? '#6b7280' : '#bfbfbf'}; cursor: not-allowed; user-select: none;">
              <td style="padding: 8px; text-align: center;">
                <input type="checkbox" disabled checked style="cursor: not-allowed; margin: 0; opacity: 0.45;" />
              </td>
              <td style="padding: 8px 6px; font-family: monospace; color: #8c8c8c;">${u.id}</td>
              <td style="padding: 8px 10px; font-weight: 500; color: ${isDark ? '#6b7280' : '#8c8c8c'};">${safeEscapeHtml(u.username)}</td>
              <td style="padding: 8px 10px;">${renderBatchRoleBadge(u.role)}</td>
              <td style="padding: 8px 10px;">
                <span style="display: inline-flex; align-items: center; gap: 4px; color: #52c41a; font-size: 11px; background: ${isDark ? 'rgba(82, 196, 26, 0.18)' : '#f6ffed'}; border: 1px solid ${isDark ? 'rgba(82, 196, 26, 0.45)' : '#b7eb8f'}; padding: 1px 8px; border-radius: 4px;">
                  ✔ 已在此角色中
                </span>
              </td>
            </tr>
          `;
        } else {
          rowsHtml += `
            <tr class="datax-batch-user-row" data-id="${u.id}" data-disabled="false" style="border-bottom: 1px solid ${isDark ? '#2b2d35' : '#f0f0f0'}; background: ${isSelected ? (isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff') : (isDark ? '#1e1f25' : '#ffffff')}; cursor: pointer; user-select: none; transition: background 0.15s;">
              <td style="padding: 8px; text-align: center;">
                <input type="checkbox" class="datax-batch-user-chk" value="${u.id}" ${isSelected ? 'checked' : ''} style="cursor: pointer; margin: 0;" />
              </td>
              <td style="padding: 8px 6px; font-family: monospace; color: ${isDark ? '#9ca3af' : '#595959'};">${u.id}</td>
              <td style="padding: 8px 10px; font-weight: ${isSelected ? '600' : '500'}; color: ${isSelected ? '#1890ff' : (isDark ? '#e5e7eb' : '#262626')};" class="datax-batch-user-name-cell">${safeEscapeHtml(u.username)}</td>
              <td style="padding: 8px 10px;">${renderBatchRoleBadge(u.role)}</td>
              <td style="padding: 8px 10px;" class="datax-batch-user-status-cell">
                <span style="display: inline-flex; align-items: center; gap: 4px; color: ${isSelected ? '#1890ff' : '#8c8c8c'}; font-size: 11px; ${isSelected ? 'font-weight: 600;' : ''}">
                  ${isSelected ? '● 待添加' : '○ 未关联'}
                </span>
              </td>
            </tr>
          `;
        }
      });

      userBatchUserList.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="background: ${isDark ? '#252831' : '#fafafa'}; border-bottom: 2px solid ${isDark ? '#333740' : '#f0f0f0'}; position: sticky; top: 0; z-index: 2;">
              <th style="width: 44px; padding: 8px; text-align: center;">
                <input type="checkbox" id="datax-batch-user-all-cb" style="cursor: pointer; margin: 0;" title="全选/反选未关联用户" />
              </th>
              <th style="width: 55px; padding: 8px 6px; color: #595959; font-weight: 600;">ID</th>
              <th style="width: 190px; padding: 8px 10px; color: #595959; font-weight: 600;">系统用户名</th>
              <th style="width: 170px; padding: 8px 10px; color: #595959; font-weight: 600;">当前所属角色</th>
              <th style="padding: 8px 10px; color: #595959; font-weight: 600;">关联关系 / 状态</th>
            </tr>
          </thead>
          <tbody id="datax-batch-user-table-body">
            ${rowsHtml}
          </tbody>
        </table>
      `;

      // 绑定表头全选
      const allCb = document.getElementById('datax-batch-user-all-cb');
      if (allCb) {
        allCb.onclick = (e) => {
          const checked = e.target.checked;
          const rows = userBatchUserList.querySelectorAll('.datax-batch-user-row:not([data-disabled="true"])');
          rows.forEach(row => {
            const uid = parseInt(row.getAttribute('data-id'), 10);
            if (checked) {
              selectedUserIdsForBatch.add(uid);
            } else {
              selectedUserIdsForBatch.delete(uid);
            }
          });
          syncBatchUserVisuals();
          updateBatchCount();
        };
      }

      // 绑定行点击整行勾选
      userBatchUserList.querySelectorAll('.datax-batch-user-row:not([data-disabled="true"])').forEach(row => {
        row.onclick = (e) => {
          if (userBatchMarqueeInstance && userBatchMarqueeInstance.isMarquee) return;
          const cb = row.querySelector('.datax-batch-user-chk');
          if (!cb) return;

          if (e.target !== cb) {
            cb.checked = !cb.checked;
          }
          const uid = parseInt(cb.value, 10);
          if (cb.checked) {
            selectedUserIdsForBatch.add(uid);
          } else {
            selectedUserIdsForBatch.delete(uid);
          }
          syncBatchUserVisuals();
          updateBatchCount();
        };
      });

      // 绑定通用矩形框选引擎 (MarqueeSelector)
      if (window.DataXAssistant && (typeof window.DataXAssistant.bindMarqueeSelection === 'function' || window.DataXAssistant.MarqueeSelector)) {
        const bindFn = window.DataXAssistant.bindMarqueeSelection || ((opts) => new window.DataXAssistant.MarqueeSelector(opts));
        userBatchMarqueeInstance = bindFn({
          container: userBatchUserList,
          rowSelector: '.datax-batch-user-row:not([data-disabled="true"])',
          checkboxSelector: '.datax-batch-user-chk',
          getIdFromRow: (row) => parseInt(row.getAttribute('data-id'), 10),
          selectedSet: selectedUserIdsForBatch,
          selectedBg: '#e6f7ff',
          selectionBoxId: 'datax-batch-user-marquee-box',
          onSelectionChange: () => {
            syncBatchUserVisuals();
            updateBatchCount();
          }
        });
      }

      syncBatchUserVisuals();
      updateBatchCount();
    }

    userBatchSearchInput.oninput = () => {
      renderBatchUserList();
    };

    userBatchSelectAllBtn.onclick = () => {
      const currentRoleUserIds = new Set(currentRoleUsers.map(u => u.id));
      const keyword = (userBatchSearchInput.value || '').trim().toLowerCase();
      allSystemUsers.forEach(u => {
        if (!currentRoleUserIds.has(u.id)) {
          if (!keyword || (u.username || '').toLowerCase().includes(keyword) || (u.role || '').toLowerCase().includes(keyword)) {
            selectedUserIdsForBatch.add(u.id);
          }
        }
      });
      syncBatchUserVisuals();
      updateBatchCount();
    };

    userBatchClearSelBtn.onclick = () => {
      selectedUserIdsForBatch.clear();
      syncBatchUserVisuals();
      updateBatchCount();
    };

    function updateBatchCount() {
      const count = selectedUserIdsForBatch.size;
      userBatchCountStat.textContent = `已选 ${count} 人 (支持拖拽框选)`;
      userBatchSubmitBtn.textContent = `确认关联选中的用户 (${count} 人)`;
      userBatchSubmitBtn.disabled = count === 0;
      userBatchSubmitBtn.style.opacity = count === 0 ? '0.6' : '1';
      userBatchSubmitBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }

    // 确认批量关联提交
    userBatchSubmitBtn.onclick = async () => {
      const roleCode = getSelectedRoleCode();
      if (!roleCode || selectedUserIdsForBatch.size === 0) return;

      const userIds = Array.from(selectedUserIdsForBatch);
      try {
        userBatchSubmitBtn.disabled = true;
        userBatchSubmitBtn.textContent = `正在批量关联 (0/${userIds.length})...`;

        let successCount = 0;
        await Promise.all(userIds.map(async (uid, idx) => {
          try {
            const res = await http.fetchJson(`/api/tableData/roleUser/assign?userId=${uid}&roleCode=${encodeURIComponent(roleCode)}`, { method: 'POST' });
            if (http.isApiSuccess(res)) successCount++;
            userBatchSubmitBtn.textContent = `正在批量关联 (${idx + 1}/${userIds.length})...`;
          } catch (e) {}
        }));

        toast(`🎉 已成功将 ${successCount} 位用户批量关联至角色 [${roleCode}]`);
        closeBatchModal();
        fetchRoleUsers(roleCode);
      } catch (err) {
        alertMsg(`批量关联异常: ${err.message}`);
      } finally {
        userBatchSubmitBtn.disabled = false;
        updateBatchCount();
      }
    };

    // 角色下拉联动
    menuRoleSelect.onchange = async () => {
      const val = menuRoleSelect.value;
      updateMenuConfigStateByRole(val);
      if (!isAdminRole(val)) {
        await loadRoleMenusForSelected(val);
      }
      fetchRoleUsers(val);
      syncRoleDeleteBtnState();
    };

    // 从后端动态加载指定角色的菜单配置并回填
    async function loadRoleMenusForSelected(roleKey) {
      if (!roleKey) return;
      try {
        const res = await http.fetchJson(`/api/tableData/roleMenu/get?roleCode=${encodeURIComponent(roleKey)}&roleKey=${encodeURIComponent(roleKey)}&_t=${Date.now()}`, { method: 'GET' });
        if (http.isApiSuccess(res) && Array.isArray(res.data)) {
          selectedMenuSet.clear();
          if (res.data.includes('*')) {
            MENU_DEFINITIONS.forEach(m => selectedMenuSet.add(m.code));
          } else {
            sortMenuCodes(res.data).forEach(c => selectedMenuSet.add(c));
          }
          syncMenuRowVisuals();
        }
      } catch (e) {
        console.warn('拉取角色菜单失败:', e);
      }
    }

    // 快捷按钮绑定
    modal.querySelector('#datax-menu-perm-quick-all').onclick = () => {
      MENU_DEFINITIONS.forEach(m => selectedMenuSet.add(m.code));
      syncMenuRowVisuals();
    };

    modal.querySelector('#datax-menu-perm-quick-recommend').onclick = () => {
      selectedMenuSet.clear();
      MENU_DEFINITIONS.filter(m => m.isDefault).forEach(m => selectedMenuSet.add(m.code));
      syncMenuRowVisuals();
    };

    modal.querySelector('#datax-menu-perm-quick-clear').onclick = () => {
      selectedMenuSet.clear();
      syncMenuRowVisuals();
    };

    menuResetBtn.onclick = () => {
      selectedMenuSet.clear();
      MENU_DEFINITIONS.filter(m => m.isDefault).forEach(m => selectedMenuSet.add(m.code));
      menuRoleSelect.value = 'ROLE_USER';
      menuFormTitle.innerHTML = '<span>角色菜单授权</span>';
      menuEditIndicator.style.display = 'none';
      updateMenuConfigStateByRole('ROLE_USER');
      fetchRoleUsers('ROLE_USER');
      syncRoleDeleteBtnState();
    };

    // 保存菜单权限策略
    menuSaveBtn.onclick = async () => {
      const roleCode = getSelectedRoleCode();
      if (!roleCode) {
        alertMsg('请选择或输入要配置的角色编码');
        return;
      }
      if (isAdminRole(roleCode)) {
        alertMsg('管理员角色拥有系统全部菜单特权，无需单独保存配置');
        return;
      }

      if (selectedMenuSet.size === 0) {
        if (!confirm(`角色 [${roleCode}] 未勾选任何菜单，该角色登录后左侧将无法看到任何功能入口。确定保存吗？`)) {
          return;
        }
      }

      // 保存至数据库前严格按照标准顺序进行排序拼接
      const menuCodesStr = sortMenuCodes(selectedMenuSet).join(',');
      try {
        menuSaveBtn.disabled = true;
        menuSaveBtn.textContent = '正在保存...';
        const res = await http.fetchJson('/api/tableData/roleMenu/save', {
          method: 'POST',
          body: {
            roleCode: roleCode,
            roleKey: roleCode,
            menuCodes: menuCodesStr,
            status: 1
          }
        });

        if (http.isApiSuccess(res)) {
          toast(`角色 [${roleCode}] 菜单配置已生效`);
          // 同步刷新本地高速缓存，确保普通用户登录时 0ms 命中免闪烁
          if (window.DataXAssistant?.AuthGuard?.setCachedRoleMenus) {
            window.DataXAssistant.AuthGuard.setCachedRoleMenus(roleCode, sortMenuCodes(selectedMenuSet));
          }
          // 实时刷新 AuthGuard 菜单限制
          if (window.DataXAssistant?.AuthGuard?.refreshAllowedMenus) {
            window.DataXAssistant.AuthGuard.refreshAllowedMenus();
          }
          await fetchRoleMenuList();
        } else {
          alertMsg(`保存菜单权限失败: ${http.getApiMsg(res, '未知原因')}`);
        }
      } catch (err) {
        alertMsg(`保存异常: ${err.message}`);
      } finally {
        menuSaveBtn.disabled = false;
        menuSaveBtn.textContent = '保存菜单配置';
      }
    };

    // 拉取与渲染角色菜单策略列表
    async function fetchRoleMenuList() {
      menuTableContainer.innerHTML = '<div style="text-align: center; color: #1890ff; font-size: 12px; padding: 24px;">⏳ 正在刷新角色菜单策略列表...</div>';
      try {
        const res = await http.fetchJson('/api/tableData/roleMenu/list', { method: 'GET' });
        roleMenuList = http.extractListFromResponse(res) || [];
        menuTotalBadge.textContent = `共 ${roleMenuList.length} 条`;
        renderRoleMenuTable();
      } catch (err) {
        menuTableContainer.innerHTML = `<div style="text-align: center; color: #ff4d4f; font-size: 12px; padding: 24px;">获取菜单策略失败: ${safeEscapeHtml(err.message)}</div>`;
      }
    }

    menuRefreshListBtn.onclick = () => fetchRoleMenuList();

    function renderRoleMenuTable() {
      if (roleMenuList.length === 0) {
        menuTableContainer.innerHTML = `
          <div style="text-align: center; color: #8c8c8c; font-size: 12px; padding: 24px;">
            暂无已配置的角色菜单策略
          </div>
        `;
        return;
      }

      const isDark = isCurrentDarkMode();
      let html = `
        <table style="width: 100%; min-width: 860px; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead>
            <tr style="background: ${isDark ? '#252831' : '#fafafa'}; border-bottom: 1px solid ${isDark ? '#333740' : '#e8e8e8'}; color: ${isDark ? '#9ca3af' : '#595959'}; font-weight: 600; white-space: nowrap;">
              <th style="padding: 10px 12px; width: 60px; text-align: center;">ID</th>
              <th style="padding: 10px 14px; width: 160px;">角色标识</th>
              <th style="padding: 10px 14px; min-width: 260px;">开放菜单</th>
              <th style="padding: 10px 14px; width: 80px; text-align: center;">状态</th>
              <th style="padding: 10px 14px; width: 155px; text-align: center;">更新时间</th>
              <th style="padding: 10px 14px; width: 130px; text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody>
      `;

      roleMenuList.forEach((item, idx) => {
        const isEven = idx % 2 === 0;
        const roleKey = item.roleCode || item.roleKey || '';
        let menuBadges = '';
        if (item.menuCodes === '*' || !item.menuCodes) {
          menuBadges = `<span style="background: ${isDark ? 'rgba(82, 196, 26, 0.18)' : '#f6ffed'}; border: 1px solid ${isDark ? 'rgba(82, 196, 26, 0.45)' : '#b7eb8f'}; color: #52c41a; padding: 2px 8px; border-radius: 4px; font-weight: bold; display: inline-flex; align-items: center; white-space: nowrap;">🌟 全部菜单 (*)</span>`;
        } else {
          // 严格按标准顺序展示开放菜单胶囊
          const codes = sortMenuCodes(item.menuCodes);
          const badgeList = codes.map(c => {
            const found = MENU_DEFINITIONS.find(m => m.code === c);
            const name = found ? `${found.icon} ${found.name}` : c;
            return `<span style="background: ${isDark ? '#1b2636' : '#f0f5ff'}; border: 1px solid ${isDark ? '#274163' : '#adc6ff'}; color: ${isDark ? '#69c0ff' : '#1d39c4'}; padding: 2px 7px; border-radius: 4px; font-size: 11px; white-space: nowrap; display: inline-block; margin: 2px 3px;">${safeEscapeHtml(name)}</span>`;
          });
          menuBadges = badgeList.join('');
        }

        const roleTag = roleKey === 'ROLE_ADMIN'
          ? `<span style="color: ${isDark ? '#d3adf7' : '#722ed1'}; font-weight: bold; background: ${isDark ? 'rgba(114, 46, 209, 0.25)' : '#f9f0ff'}; border: 1px solid ${isDark ? 'rgba(179, 127, 235, 0.45)' : '#d3adf7'}; padding: 2px 8px; border-radius: 4px; font-family: monospace;">ROLE_ADMIN (管理员)</span>`
          : roleKey === 'ROLE_USER'
          ? `<span style="color: #1890ff; font-weight: bold; background: ${isDark ? 'rgba(24, 144, 255, 0.18)' : '#e6f7ff'}; border: 1px solid ${isDark ? 'rgba(24, 144, 255, 0.45)' : '#91d5ff'}; padding: 2px 8px; border-radius: 4px; font-family: monospace;">ROLE_USER (普通用户)</span>`
          : `<span style="font-weight: 600; color: ${isDark ? '#d1d5db' : '#595959'}; background: ${isDark ? '#282a32' : '#f0f2f5'}; border: 1px solid ${isDark ? '#3f4350' : '#e4e7ed'}; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${safeEscapeHtml(roleKey || '-')}</span>`;

        html += `
          <tr style="border-bottom: 1px solid ${isDark ? '#2b2d35' : '#f0f0f0'}; background: ${isDark ? (isEven ? '#1e1f25' : '#22252c') : (isEven ? '#fff' : '#fafbfc')}; transition: background-color 0.2s;">
            <td style="padding: 10px 12px; text-align: center; color: #8c8c8c; vertical-align: middle; white-space: nowrap; font-weight: bold;">${item.id}</td>
            <td style="padding: 10px 14px; vertical-align: middle; white-space: nowrap;">${roleTag}</td>
            <td style="padding: 10px 14px; vertical-align: middle;">
              <div style="display: flex; flex-wrap: wrap; align-items: center;">${menuBadges}</div>
            </td>
            <td style="padding: 10px 14px; text-align: center; vertical-align: middle; white-space: nowrap;">
              ${item.status === 0 ? '<span style="color: #fa8c16; font-size: 11px; background: #fffbe6; border: 1px solid #ffe58f; padding: 2px 6px; border-radius: 4px;">禁用</span>' : '<span style="color: #52c41a; font-size: 11px; background: #f6ffed; border: 1px solid #b7eb8f; padding: 2px 6px; border-radius: 4px;">启用</span>'}
            </td>
            <td style="padding: 10px 14px; text-align: center; vertical-align: middle; white-space: nowrap; color: #8c8c8c; font-size: 11px;">
              ${safeEscapeHtml(item.updateTime || item.createTime || '-')}
            </td>
            <td style="padding: 10px 14px; text-align: center; vertical-align: middle; white-space: nowrap;">
              <div style="display: inline-flex; gap: 8px; align-items: center; justify-content: center;">
                <button class="datax-menu-edit-btn" data-id="${item.id}" type="button" style="background: #e6f7ff; border: 1px solid #91d5ff; color: #1890ff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; transition: all 0.2s;">
                  ✏️ 编辑
                </button>
                ${(roleKey === 'ROLE_ADMIN' || roleKey === 'ROLE_USER')
                  ? `<button type="button" disabled title="系统内置基础角色禁止删除" style="background: #f5f5f5; border: 1px solid #d9d9d9; color: #bfbfbf; padding: 4px 10px; border-radius: 4px; cursor: not-allowed; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; opacity: 0.6;">🗑️ 删除</button>`
                  : `<button class="datax-menu-del-btn" data-id="${item.id}" data-role="${safeEscapeHtml(roleKey)}" type="button" style="background: #fff1f0; border: 1px solid #ffa39e; color: #f5222d; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; transition: all 0.2s;">🗑️ 删除</button>`}
              </div>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      menuTableContainer.innerHTML = html;

      // 绑定编辑回填
      menuTableContainer.querySelectorAll('.datax-menu-edit-btn').forEach(btn => {
        btn.onclick = () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const item = roleMenuList.find(r => r.id === id);
          if (!item) return;

          const roleKey = item.roleCode || item.roleKey || '';

          menuFormTitle.innerHTML = `<span>✏️ 编辑角色菜单策略 (${safeEscapeHtml(roleKey)})</span>`;
          menuEditIndicator.style.display = 'block';
          menuSaveBtn.textContent = `更新菜单策略 (${safeEscapeHtml(roleKey)})`;
          menuSaveBtn.style.background = 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)';

          let roleFound = false;
          for (let i = 0; i < menuRoleSelect.options.length; i++) {
            if (menuRoleSelect.options[i].value === roleKey) {
              roleFound = true;
              break;
            }
          }
          if (!roleFound && roleKey) {
            const opt = document.createElement('option');
            opt.value = roleKey;
            opt.textContent = `${roleKey} (历史角色)`;
            menuRoleSelect.appendChild(opt);
          }
          menuRoleSelect.value = roleKey || 'ROLE_USER';

          updateMenuConfigStateByRole(roleKey);
          if (!isAdminRole(roleKey)) {
            selectedMenuSet.clear();
            if (item.menuCodes === '*' || !item.menuCodes) {
              MENU_DEFINITIONS.forEach(m => selectedMenuSet.add(m.code));
            } else {
              sortMenuCodes(item.menuCodes).forEach(c => selectedMenuSet.add(c));
            }
            syncMenuRowVisuals();
          }
          fetchRoleUsers(roleKey);
          syncRoleDeleteBtnState();

          tabContentMenu.scrollTo({ top: 0, behavior: 'smooth' });
        };
      });

      // 绑定删除（级联删除角色、菜单权限与库表权限）
      menuTableContainer.querySelectorAll('.datax-menu-del-btn').forEach(btn => {
        btn.onclick = async () => {
          const role = btn.getAttribute('data-role');
          await handleDeleteRole(role);
        };
      });
    }

    // 初始渲染菜单复选框 (根据默认角色状态)
    updateMenuConfigStateByRole('ROLE_USER');

    // 初始化加载 (菜单权限优先装配)
    try {
      fetchSystemRoleList();
      fetchRoleMenuList();
      loadRoleMenusForSelected('ROLE_USER');
      fetchRoleUsers('ROLE_USER');
      fetchAllSystemUsers();

      // 后台预热库表数据源及策略
      if (dsList.length === 0) {
        http.fetchJson('/api/tableData/datasources', { method: 'GET' }).then(dsRes => {
          dsList = http.extractListFromResponse(dsRes) || [];
          populateDsOptions();
        }).catch(() => {});
      } else {
        populateDsOptions();
      }
      fetchPermList().catch(() => {});
    } catch (e) {
      console.warn('[RolePermissionModal] 初始化加载异常:', e);
    }
  }

  // ==========================
  // 9. 模块生命周期初始化
  // ==========================
  function init() {
    // 轮询并观测左侧侧边栏挂载菜单
    const tryInjectSidebar = () => {
      if (window.DataXCommon?.Utils?.isUserLoggedIn && !window.DataXCommon.Utils.isUserLoggedIn()) {
        return;
      }
      injectLeftSidebarMenu();
    };

    // 立即执行一次
    tryInjectSidebar();

    // 周期性探测确保 SPA 路由跳转后菜单依然持久驻留
    setInterval(tryInjectSidebar, 1000);

    // 监听 URL Hash 变化
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash || '';
      if (hash.includes('/datax/table-query') || hash.includes('/simple-table-query')) {
        openNoviceQueryWorkbench();
      }
    });

    // 若初始打开即为简易查询路由，自动唤起
    if (window.location.hash.includes('/datax/table-query') || window.location.hash.includes('/simple-table-query')) {
      setTimeout(openNoviceQueryWorkbench, 500);
    }

    // 监听全局用户与会话变动事件
    if (window.DataXAssistant?.EventBus) {
      window.DataXAssistant.EventBus.on('auth:user_changed', (user) => {
        const permModal = document.getElementById('datax-role-permission-modal');
        if (permModal && permModal.style.display !== 'none' && !user?.isAdmin) {
          permModal.style.display = 'none';
        }
        const workbench = document.getElementById('datax-novice-table-query-workbench');
        if (workbench && workbench.style.display !== 'none' && typeof loadDatasources === 'function') {
          loadDatasources();
        }
      });
      window.DataXAssistant.EventBus.on('auth:logout', () => {
        const permModal = document.getElementById('datax-role-permission-modal');
        if (permModal) permModal.style.display = 'none';
      });
    }
  }

  // 暴露公共接口
  window.DataXAssistant.NoviceTableQuery = {
    init,
    isNoviceMode: () => isNoviceMode,
    openNoviceQueryWorkbench,
    restoreFullAssistantMode,
    openRoleTablePermissionModal,
    openColumnStructureModal,
    openTableDataPreviewModal,
    exportDatabaseSchemaToExcel,
    switchNoviceWorkbenchTab,
    executeNoviceWorkbenchSql,
    openWorkbenchSqlForTable
  };

  // 随脚本载入自启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
