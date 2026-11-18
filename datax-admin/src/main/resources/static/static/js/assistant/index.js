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
 * @fileoverview DataX 智能助手启动装配器入口 (Launcher)
 * 负责装配主面板骨架、初始化各 Tab 业务模块、手势控制器、偏好设置及原生界面拦截注入。
 *
 * @author ypc
 * @version 3.1.2
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};
  window.DataXAssistant.Tabs = window.DataXAssistant.Tabs || {};

  const OLD_PANEL_ID = 'datax-excel-selector-panel';
  const OLD_BADGE_ID = 'datax-helper-floating-badge';
  const STORAGE_KEY_PANEL_POS = 'datax_assistant_panel_pos';
  const STORAGE_KEY_PANEL_SIZE = 'datax_assistant_panel_size';
  const STORAGE_KEY_PANEL_TAB = 'datax_assistant_active_tab';
  const STORAGE_KEY_PANEL_VISIBLE = 'datax_assistant_panel_visible';

  // 清除旧实例
  const existingPanel = document.getElementById(OLD_PANEL_ID);
  if (existingPanel) existingPanel.remove();
  const existingBadge = document.getElementById(OLD_BADGE_ID);
  if (existingBadge) existingBadge.remove();

  // 1. 确保样式已注入
  if (window.DataXAssistant.DomBuilder && window.DataXAssistant.DomBuilder.ensureEnhancedStyles) {
    window.DataXAssistant.DomBuilder.ensureEnhancedStyles();
  }

  function isUserLoggedIn() {
    if (window.DataXCommon && window.DataXCommon.Utils && window.DataXCommon.Utils.isUserLoggedIn) {
      return window.DataXCommon.Utils.isUserLoggedIn();
    }
    return true;
  }

  function getStorageItem(key, defaultValue) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  function setStorageItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  // 2. 创建浮动小助手唤醒徽标 (右下角常驻)
  const badge = document.createElement('div');
  badge.id = OLD_BADGE_ID;
  badge.innerHTML = '🚀 DataX 智能助手';
  badge.title = '打开/收起智能工作台 (Alt + `)';
  badge.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
    color: #fff;
    padding: 10px 18px;
    border-radius: 24px;
    box-shadow: 0 4px 16px rgba(24, 144, 255, 0.38);
    cursor: pointer;
    z-index: 999998;
    font-size: 13px;
    font-weight: bold;
    user-select: none;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  badge.onmouseenter = () => {
    badge.style.transform = 'translateY(-2px) scale(1.03)';
    badge.style.boxShadow = '0 6px 20px rgba(24, 144, 255, 0.48)';
  };
  badge.onmouseleave = () => {
    badge.style.transform = 'none';
    badge.style.boxShadow = '0 4px 16px rgba(24, 144, 255, 0.38)';
  };
  document.body.appendChild(badge);

  // 3. 读取保存的窗口几何尺寸与位置
  let savedPos = null;
  try {
    const rawPos = getStorageItem(STORAGE_KEY_PANEL_POS, '');
    if (rawPos) savedPos = JSON.parse(rawPos);
  } catch (e) {}

  let savedSize = null;
  try {
    const rawSize = getStorageItem(STORAGE_KEY_PANEL_SIZE, '');
    if (rawSize) savedSize = JSON.parse(rawSize);
  } catch (e) {}

  const initTop = (savedPos && typeof savedPos.top === 'number') ? `${savedPos.top}px` : '50px';
  const initLeft = (savedPos && typeof savedPos.left === 'number') ? `${savedPos.left}px` : '';
  const initRight = (!initLeft) ? '20px' : 'auto';
  const initWidth = (savedSize && typeof savedSize.width === 'number' && savedSize.width >= 820) ? `${savedSize.width}px` : '840px';
  const initHeight = (savedSize && typeof savedSize.height === 'number' && savedSize.height >= 480) ? `${savedSize.height}px` : '580px';

  // 4. 创建工作台面板容器
  const panel = document.createElement('div');
  panel.id = OLD_PANEL_ID;
  panel.style.cssText = `
    position: fixed;
    top: ${initTop};
    ${initLeft ? `left: ${initLeft};` : `right: ${initRight};`}
    width: ${initWidth};
    height: ${initHeight};
    min-width: 600px;
    min-height: 400px;
    max-width: 98vw;
    max-height: 96vh;
    background: #ffffff;
    border: 1px solid #e4e7ed;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
    color: #303133;
    font-size: 13px;
    display: none;
    flex-direction: column;
    box-sizing: border-box;
    opacity: 1;
    transition: box-shadow 0.2s ease, opacity 0.25s ease;
  `;

  // 挂载 8 方向缩放手柄
  const resizeDirs = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
  resizeDirs.forEach(dir => {
    const h = document.createElement('div');
    h.className = `datax-resize-handle datax-resize-${dir}`;
    h.setAttribute('data-dir', dir);
    panel.appendChild(h);
  });

  // 注入面板骨架 HTML
  const contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; border-radius: 9px;';
  contentWrapper.innerHTML = `
    <div id="datax-panel-header" title="按住鼠标左键可自由拖动，双击最大化/还原" style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 10px 14px; font-weight: bold; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none; border-radius: 9px 9px 0 0;">
      <span id="datax-panel-header-title" style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
        <span>🚀 DataX 智能构建与调度工作台</span>
      </span>
      <div style="display:flex;gap:10px;align-items:center;">
        <span id="datax-panel-perm-btn" style="cursor: pointer; font-size: 11px; padding: 2px 7px; background: rgba(255,255,255,0.22); border-radius: 4px; color: #fff; font-weight: normal; display: none; align-items: center; gap: 4px; transition: background 0.2s;" title="管理各角色可访问的数据库、数据表及操作权限">🛡️ 角色权限</span>
        <span id="datax-panel-settings-btn" style="cursor: pointer; font-size: 15px; line-height: 1; padding: 0 3px; transition: transform 0.2s; display: none;" title="智能助手个性化设置">⚙️</span>
        <span id="datax-panel-min" style="cursor: pointer; font-size: 18px; line-height: 1; padding: 0 3px;" title="最小化 / 收起 (Esc / Alt + \`)">&minus;</span>
        <span id="datax-panel-max" style="cursor: pointer; font-size: 14px; line-height: 1; padding: 0 3px;" title="最大化 / 还原">&#x25A2;</span>
        <span id="datax-panel-close" style="cursor: pointer; font-size: 18px; line-height: 1; padding: 0 3px;" title="关闭 / 收起 (Esc / Alt + \`)">&times;</span>
      </div>
    </div>
    <div id="datax-panel-tab-nav" style="display: none; border-bottom: 1px solid #e8e8e8; background: #fafafa; overflow-x: auto; white-space: nowrap; scrollbar-width: thin; scrollbar-color: #d9d9d9 transparent;">
      <button id="datax-tab-btn-1" style="flex: 1; min-width: max-content; padding: 9px 8px; border: none; background: #fff; color: #1890ff; font-weight: bold; cursor: pointer; border-bottom: 2px solid #1890ff; font-size: 12px; white-space: nowrap; flex-shrink: 0;">
        📁 1. 表勾选
      </button>
      <button id="datax-tab-btn-2" style="flex: 1; min-width: max-content; padding: 9px 8px; border: none; background: #fafafa; color: #606266; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; white-space: nowrap; flex-shrink: 0;">
        🛠️ 2. 映射建表
      </button>
      <button id="datax-tab-btn-3" style="flex: 1; min-width: max-content; padding: 9px 8px; border: none; background: #fafafa; color: #606266; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; white-space: nowrap; flex-shrink: 0;">
        ⚡ 3. 任务批处理
      </button>
      <button id="datax-tab-btn-4" style="flex: 1; min-width: max-content; padding: 9px 6px; border: none; background: #fafafa; color: #606266; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; white-space: nowrap; flex-shrink: 0;" title="批量改库：支持批量置换源库(Reader)与目标库(Writer)连接">
        🔄 4. 批量改库
      </button>
      <button id="datax-tab-btn-5" style="flex: 1; min-width: max-content; padding: 9px 8px; border: none; background: #fafafa; color: #606266; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; white-space: nowrap; flex-shrink: 0;">
        📊 5. 数据浏览
      </button>
      <button id="datax-tab-btn-6" style="flex: 1; min-width: max-content; padding: 9px 8px; border: none; background: #fafafa; color: #606266; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; white-space: nowrap; flex-shrink: 0;" title="多源关联查询/Python复杂计算，定时加工输出至最终目标表">
        🛠️ 6. 结果表加工
      </button>
      <button id="datax-tab-btn-7" style="flex: 1; min-width: max-content; padding: 9px 8px; border: none; background: #fafafa; color: #606266; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; white-space: nowrap; flex-shrink: 0;" title="外部接口数据定时采集与结构化入库">
        🌐 7. 接口采集
      </button>
      <button id="datax-tab-btn-8" style="flex: 1; min-width: max-content; padding: 9px 8px; border: none; background: #fafafa; color: #606266; font-weight: normal; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; white-space: nowrap; flex-shrink: 0;" title="三方开放API账号授权与全链路调用审计">
        8. 三方API
      </button>
    </div>

    <!-- Tab 1: 表快速勾选 -->
    <div id="datax-tab-content-1" style="padding: 14px; overflow-y: auto; flex: 1;">
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-weight: 600; margin-bottom: 6px;">1. 选择本地 Excel 文件 (.xlsx / .xls)：</label>
        <input type="file" id="datax-file-input" accept=".xlsx, .xls, .csv" style="width: 100%; box-sizing: border-box; padding: 6px; border: 1px dashed #1890ff; border-radius: 4px; background: #f0f7ff; cursor: pointer;" />
      </div>
      <div id="datax-sheet-section" style="display: none; margin-bottom: 12px; background: #f4f6f8; padding: 10px; border-radius: 6px; border: 1px solid #e8e8e8;">
        <div style="margin-bottom: 8px;">
          <label style="font-weight: 600; font-size: 12px; display: block; margin-bottom: 3px;">工作表 (Sheet)：</label>
          <select id="datax-sheet-select" style="width: 100%; padding: 5px; border-radius: 4px; border: 1px solid #dcdfe6; font-size: 12px; background: #fff;"></select>
        </div>
        <div>
          <label style="font-weight: 600; font-size: 12px; display: block; margin-bottom: 3px;">提取范围：</label>
          <select id="datax-col-select" style="width: 100%; padding: 5px; border-radius: 4px; border: 1px solid #dcdfe6; font-size: 12px; background: #fff;">
            <option value="auto">⚡ 智能识别（主表+从表，仅英文表名，过滤中文）</option>
            <option value="main_only">仅主表（表标识 / 主表标识列）</option>
            <option value="rel_only">仅从表（关联表标识列）</option>
            <option value="all_cols">扫描所有英文表名 (匹配 t_*, ar_*, system_* 等)</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <label style="font-weight: 600;">或直接粘贴表名文本：</label>
          <a id="datax-toggle-paste" href="javascript:;" style="color: #1890ff; font-size: 12px; text-decoration: none;">展开/收起粘贴框</a>
        </div>
        <textarea id="datax-paste-input" placeholder="支持换行/逗号/空格分隔表名" style="display: none; width: 100%; height: 75px; box-sizing: border-box; padding: 6px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;"></textarea>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button id="datax-btn-execute" style="flex: 2; background: #1890ff; color: #fff; border: none; padding: 9px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px;">
          一键自动勾选对应表
        </button>
        <button id="datax-btn-clear" style="flex: 1; background: #ff4d4f; color: #fff; border: none; padding: 9px 8px; border-radius: 4px; cursor: pointer; font-size: 13px;">
          清空勾选
        </button>
      </div>
      <div id="datax-status-box" style="display: none; background: #fdfdfd; border: 1px solid #ebeef5; border-radius: 6px; padding: 10px; font-size: 12px;">
        <div id="datax-status-summary" style="line-height: 1.7;"></div>
        <div id="datax-diff-details" style="margin-top: 8px; max-height: 130px; overflow-y: auto; font-size: 12px;"></div>
      </div>
    </div>

    <!-- Tab 2: 映射前后缀与建表 -->
    <div id="datax-tab-content-2" style="padding: 14px; overflow-y: auto; flex: 1; display: none;">
      <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 8px;">批量自定义表名前后缀：</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <input type="text" id="datax-rule-prefix" placeholder="前缀: ods_" style="padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
          <input type="text" id="datax-rule-suffix" placeholder="后缀: _df" style="padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <input type="text" id="datax-rule-replace-from" placeholder="查找: t_" style="padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
          <input type="text" id="datax-rule-replace-to" placeholder="替换为空" style="padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
        </div>
        <select id="datax-rule-case" style="width: 100%; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; margin-bottom: 8px; background: #fff;">
          <option value="ORIGINAL">保持原样</option>
          <option value="LOWER">转小写</option>
          <option value="UPPER">转大写</option>
          <option value="CAMEL_TO_UNDERLINE">驼峰转下划线</option>
        </select>
        <button id="datax-btn-sync-to-step3" style="width: 100%; background: #1890ff; color: #fff; border: none; padding: 8px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px;">
          一键同步规则到步骤3并自动勾选目标表
        </button>
      </div>
    </div>

    <!-- Tab 3: 任务批量查询与启动 (NEW) -->
    <div id="datax-tab-content-3" style="padding: 14px; overflow-y: auto; flex: 1; display: none; flex-direction: column; box-sizing: border-box;">
      <!-- 查询过滤区 -->
      <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
        <div style="font-weight: bold; margin-bottom: 6px; color: #1890ff; display: flex; justify-content: space-between;">
          <span>🔍 任务多维度查询检索</span>
          <span style="font-size: 11px; color: #888; font-weight: normal;">支持模糊搜索或一键匹配</span>
        </div>
        <div style="display: grid; grid-template-columns: 1.2fr 1.5fr 1fr; gap: 6px; margin-bottom: 8px;">
          <select id="datax-job-search-project" style="padding: 6px 4px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
            <option value="">📁 全部所属项目</option>
          </select>
          <input type="text" id="datax-job-search-desc" placeholder="表名/任务描述 (如 t_)" style="padding: 6px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; box-sizing: border-box;" />
          <select id="datax-job-search-status" style="padding: 6px 4px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
            <option value="-1">全部状态</option>
            <option value="0">⚪ 仅已停止</option>
            <option value="1">🟢 仅已开启</option>
          </select>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="datax-btn-query-jobs" style="flex: 1; background: #1890ff; color: #fff; border: none; padding: 7px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">
            🔍 查询任务列表
          </button>
          <button id="datax-btn-match-recent-jobs" style="flex: 1; background: #722ed1; color: #fff; border: none; padding: 7px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="自动提取步骤1或Excel提取的表名并全选匹配任务">
            匹配本批次表
          </button>
          <button id="datax-btn-select-duplicates" style="flex: 1.1; background: #eb2f96; color: #fff; border: none; padding: 7px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="自动分析列表中同名同表名重复任务，保留最新一条并自动勾选历史重复冗余任务">
            勾选同名重复
          </button>
        </div>
      </div>

      <!-- 批量操作控制条 -->
      <div style="display: flex; gap: 6px; margin-bottom: 10px;">
        <button id="datax-btn-batch-start" style="flex: 1; background: #52c41a; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="开启定时调度Cron">
          批量开启
        </button>
        <button id="datax-btn-batch-trigger" style="flex: 1.1; background: #fa8c16; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="立即执行一次，即刻运行">
          🚀 立即执行
        </button>
        <button id="datax-btn-batch-stop" style="flex: 1; background: #faad14; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="停止调度">
          批量停止
        </button>
        <button id="datax-btn-batch-remove" style="flex: 1; background: #f5222d; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="批量永久删除所选任务及其日志">
          🗑️ 批量删除
        </button>
        <button id="datax-btn-batch-increment" style="flex: 1.1; background: #722ed1; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="批量将勾选的任务设置为方案1时间自增增量同步（避免全库扫源库）">
          设为增量
        </button>
        <button id="datax-btn-batch-init-sync" style="flex: 1.4; background: #eb2f96; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="清空所选任务的目标端数据表，重置增量起点为全量并立即触发同步（含高危二次提醒）">
          批量初始化(全量同步)
        </button>
        <button id="datax-btn-batch-compare" style="flex: 1.2; background: #08979c; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="批量比对所选任务的源库与目标库记录数一致性，支持超时熔断与结果落盘">
          比对数据量
        </button>
        <button id="datax-btn-batch-drift" style="flex: 1.3; background: #2f54eb; color: #fff; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;" title="探测源库字段新增/删除(Schema Drift)，支持自动为OBS/Hive加列并演进更新任务配置">
          🔍 字段变动演进
        </button>
      </div>

      <!-- 列表状态与全选控制 -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px;">
        <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <input type="checkbox" id="datax-job-check-all" /> <strong>当前列表全选 (<span id="datax-job-selected-count">0</span> / <span id="datax-job-total-count">0</span>)</strong>
        </label>
        <span style="font-size: 11px; color: #8c8c8c;">💡 文字可自由划词双击复制；按住 <kbd style="background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;padding:0 3px;font-size:10px;">Alt</kbd> 键或在行首勾选列拖拽可框选</span>
        <span id="datax-job-action-tip" style="font-size: 12px; color: #52c41a; font-weight: bold;"></span>
      </div>

      <!-- 任务表格容器 -->
      <div id="datax-job-list-container" style="flex: 1; min-height: 200px; max-height: 60vh; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff;">
        <div style="padding: 24px; text-align: center; color: #909399; font-size: 12px;">
          点击上方【🔍 查询任务列表】或【🎯 一键匹配本批次表】加载任务
        </div>
      </div>
    </div>

    <!-- Tab 4: 任务 连接批量置换 (源库 / 目标库) -->
    <div id="datax-tab-content-4" style="padding: 14px; overflow-y: auto; flex: 1; display: none; flex-direction: column; box-sizing: border-box;">
      <!-- 任务选择提示与同步控制 -->
      <div style="background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: bold; color: #0050b3;">当前选中的待调整任务：</span>
          <span style="font-weight: bold; color: #1890ff; font-size: 14px;" id="datax-writer-selected-badge">0 个任务</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="datax-writer-sync-jobs-btn" style="flex: 1; background: #1890ff; color: #fff; border: none; padding: 6px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">
            同步 Tab 3 勾选的任务
          </button>
          <button id="datax-writer-select-all-btn" style="flex: 1; background: #722ed1; color: #fff; border: none; padding: 6px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">
            全选所有已载入任务
          </button>
        </div>
      </div>

      <!-- 1. 数据库连接批量置换 (可选) -->
      <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 8px; color: #303133; display: flex; align-items: center; justify-content: space-between;">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;">
            <input type="checkbox" id="datax-dbchange-enable" checked style="cursor: pointer; width: 14px; height: 14px;" />
            <strong style="color: #096dd9;">1. 数据库连接批量置换 (可选)</strong>
          </label>
          <span style="font-size: 11px; color: #8c8c8c; font-weight: normal;">若无需改库，可取消勾选仅批量调整调度属性</span>
        </div>

        <div id="datax-dbchange-config-wrap">
          <!-- 改库作用端选择 -->
          <div style="background: #fdf6ec; border: 1px solid #faecd8; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px;">
            <div style="font-weight: bold; margin-bottom: 6px; color: #d46b08; display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 12px;">改库目标作用端：</span>
              <span style="font-size: 11px; color: #8c8c8c; font-weight: normal;">支持选择仅改目标库、仅改源库或两端同时修改</span>
            </div>
            <div style="display: flex; gap: 16px; font-size: 12px; flex-wrap: wrap;">
              <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <input type="radio" name="datax-dbchange-scope" value="WRITER" checked style="cursor: pointer;" />
                <strong style="color: #096dd9;">📥 目标库 (Writer)</strong>
              </label>
              <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <input type="radio" name="datax-dbchange-scope" value="READER" style="cursor: pointer;" />
                <strong style="color: #722ed1;">📤 源库 (Reader)</strong>
              </label>
              <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <input type="radio" name="datax-dbchange-scope" value="BOTH" style="cursor: pointer;" />
                <strong style="color: #fa8c16;">🔄 源库与目标库同时修改 (Both)</strong>
              </label>
            </div>
          </div>

          <!-- 置换模式选择 -->
          <div style="background: #fff; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px; margin-bottom: 4px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: #303133; font-size: 12px;">选择连接置换模式：</div>
            <div style="display: flex; gap: 16px; margin-bottom: 8px; font-size: 12px;">
              <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <input type="radio" name="datax-writer-mode" value="datasource" checked />
                <strong>模式 1: 绑定已有系统数据源 (推荐)</strong>
              </label>
              <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <input type="radio" name="datax-writer-mode" value="rule" />
                <strong>模式 2: 连接串规则替换</strong>
              </label>
            </div>

            <!-- 模式 1: 数据源选择面板 -->
            <div id="datax-writer-mode-ds-panel" style="background: #fafafa; border: 1px solid #dcdfe6; border-radius: 4px; padding: 8px;">
              <label id="datax-writer-ds-label" style="display: block; font-weight: 600; margin-bottom: 4px; font-size: 12px;">目标端数据源：</label>
              <select id="datax-writer-target-ds" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #dcdfe6; font-size: 12px; background: #fff; margin-bottom: 8px;">
                <option value="">-- 请选择系统数据源 --</option>
              </select>
              <div id="datax-writer-ds-info" style="font-size: 11px; color: #606266; background: #fff; padding: 6px 8px; border-radius: 3px; border: 1px dashed #e8e8e8; line-height: 1.5; word-break: break-all;">
                请选择数据源，系统将自动继承其 JDBC 连接串、驱动、用户名和密码
              </div>
              <div id="datax-writer-auto-create-wrap" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e8e8e8; display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" id="datax-writer-auto-create-table" checked style="cursor: pointer; width: 14px; height: 14px;" />
                <label for="datax-writer-auto-create-table" style="font-size: 12px; color: #303133; cursor: pointer; user-select: none;">
                  <strong>🛠️ 自动建表</strong>：若目标库中不存在对应表，则在更新连接前自动在目标库创建表
                </label>
              </div>
              <div id="datax-reader-notice-wrap" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e8e8e8; font-size: 11px; color: #722ed1; line-height: 1.5;">
                💡 <strong>源库提示</strong>：源库为只读数据源，系统在执行更新时不会建表；点击【变更 Diff 预览】可自动检测各任务的源表在目标源库中是否存在。
              </div>
            </div>

            <!-- 模式 2: 规则替换面板 -->
            <div id="datax-writer-mode-rule-panel" style="display: none; background: #fafafa; border: 1px solid #dcdfe6; border-radius: 4px; padding: 8px;">
              <div style="margin-bottom: 8px;">
                <label style="display: block; font-weight: 600; margin-bottom: 3px; font-size: 12px;">旧连接串匹配关键字/原串：</label>
                <input type="text" id="datax-writer-rule-old" placeholder="例如: 192.168.1.100:3306 或 datax_original" style="width: 100%; box-sizing: border-box; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
              </div>
              <div style="margin-bottom: 8px;">
                <label style="display: block; font-weight: 600; margin-bottom: 3px; font-size: 12px;">替换为新连接串/目标串：</label>
                <input type="text" id="datax-writer-rule-new" placeholder="例如: 192.168.1.101:3306 或 datax_final" style="width: 100%; box-sizing: border-box; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div>
                  <label style="display: block; font-size: 11px; color: #666; margin-bottom: 2px;">新用户名 (可选覆盖)：</label>
                  <input type="text" id="datax-writer-rule-user" placeholder="不填则保持原样" style="width: 100%; box-sizing: border-box; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
                <div>
                  <label style="display: block; font-size: 11px; color: #666; margin-bottom: 2px;">新密码 (可选覆盖)：</label>
                  <input type="password" id="datax-writer-rule-pwd" placeholder="不填则保持原样" style="width: 100%; box-sizing: border-box; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 任务调度与运行属性批量调整 (可选) -->
      <div style="background: #f0f5ff; border: 1px solid #adc6ff; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 8px; color: #1d39c4; display: flex; align-items: center; justify-content: space-between;">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;">
            <input type="checkbox" id="datax-jobprop-enable" checked style="cursor: pointer; width: 14px; height: 14px;" />
            <strong style="color: #1d39c4;">⏱️ 2. 调度与运行属性批量调整 (可选)</strong>
          </label>
          <span style="font-size: 11px; color: #595959; font-weight: normal;">留空或选择【保持原样】的属性不会被修改</span>
        </div>

        <div id="datax-jobprop-config-wrap">
          <!-- 属性网格：第1行 (路由策略、CRON表达式) -->
          <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px; margin-bottom: 8px;">
            <div>
              <label style="display: block; font-weight: 600; font-size: 11px; color: #333; margin-bottom: 3px;">
                🎯 路由策略 (Route Strategy)：
              </label>
              <select id="datax-jobprop-route-strategy" style="width: 100%; padding: 5px; border-radius: 4px; border: 1px solid #dcdfe6; font-size: 12px; background: #fff;">
                <option value="">-- 保持原样 (不修改) --</option>
                <option value="FIRST">第一个 (FIRST)</option>
                <option value="LAST">最后一个 (LAST)</option>
                <option value="ROUND">轮询 (ROUND)</option>
                <option value="RANDOM">随机 (RANDOM)</option>
                <option value="CONSISTENT_HASH">一致性HASH (CONSISTENT_HASH)</option>
                <option value="LEAST_FREQUENTLY_USED">最不经常使用 (LEAST_FREQUENTLY_USED)</option>
                <option value="LEAST_RECENTLY_USED">最近最久未使用 (LEAST_RECENTLY_USED)</option>
                <option value="FAILOVER">故障转移 (FAILOVER)</option>
                <option value="BUSYOVER">忙碌转移 (BUSYOVER)</option>
                <option value="SHARDING_BROADCAST">分片广播 (SHARDING_BROADCAST)</option>
              </select>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                <label style="font-weight: 600; font-size: 11px; color: #333;">
                  ⏰ Cron 表达式：
                </label>
                <select id="datax-jobprop-cron-preset" style="padding: 1px 4px; font-size: 11px; border: 1px solid #adc6ff; border-radius: 3px; background: #e6f7ff; color: #1d39c4; cursor: pointer;">
                  <option value="">⚡ 常用 Cron 预设</option>
                  <option value="0 0 1 * * ?">每天凌晨 01:00</option>
                  <option value="0 0 2 * * ?">每天凌晨 02:00</option>
                  <option value="0 0 3 * * ?">每天凌晨 03:00</option>
                  <option value="0 0 * * * ?">每小时整点一次</option>
                  <option value="0 0/30 * * * ?">每 30 分钟一次</option>
                  <option value="0 0/10 * * * ?">每 10 分钟一次</option>
                  <option value="0 0/5 * * * ?">每 5 分钟一次</option>
                </select>
              </div>
              <input type="text" id="datax-jobprop-cron" placeholder="留空保持原样 (如: 0 0 1 * * ?)" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
            </div>
          </div>

          <!-- 属性网格：第2行 (阻塞处理、任务类型) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
            <div>
              <label style="display: block; font-weight: 600; font-size: 11px; color: #333; margin-bottom: 3px;">
                🛑 阻塞处理策略 (Block Strategy)：
              </label>
              <select id="datax-jobprop-block-strategy" style="width: 100%; padding: 5px; border-radius: 4px; border: 1px solid #dcdfe6; font-size: 12px; background: #fff;">
                <option value="">-- 保持原样 (不修改) --</option>
                <option value="SERIAL_EXECUTION">单机串行 (SERIAL_EXECUTION)</option>
                <option value="DISCARD_LATER">丢弃后续调度 (DISCARD_LATER)</option>
                <option value="COVER_EARLY">覆盖之前调度 (COVER_EARLY)</option>
              </select>
            </div>

            <div>
              <label style="display: block; font-weight: 600; font-size: 11px; color: #333; margin-bottom: 3px;">
                📦 任务类型 (Task Type)：
              </label>
              <select id="datax-jobprop-glue-type" style="width: 100%; padding: 5px; border-radius: 4px; border: 1px solid #dcdfe6; font-size: 12px; background: #fff;">
                <option value="">-- 保持原样 (不修改) --</option>
                <option value="BEAN">DataX任务 (BEAN)</option>
                <option value="GLUE_SHELL">Shell任务 (GLUE_SHELL)</option>
                <option value="GLUE_PYTHON">Python任务 (GLUE_PYTHON)</option>
                <option value="GLUE_POWERSHELL">PowerShell任务 (GLUE_POWERSHELL)</option>
              </select>
            </div>
          </div>

          <!-- 属性网格：第3行 (失败重试次数、超时时间、报警邮件) -->
          <div style="display: grid; grid-template-columns: 0.9fr 0.9fr 1.4fr; gap: 10px;">
            <div>
              <label style="display: block; font-weight: 600; font-size: 11px; color: #333; margin-bottom: 3px;">
                🔄 失败重试次数：
              </label>
              <input type="number" id="datax-jobprop-retry-count" min="0" max="20" placeholder="留空原样 (0-20)" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
            </div>

            <div>
              <label style="display: block; font-weight: 600; font-size: 11px; color: #333; margin-bottom: 3px;">
                ⏳ 超时时间(分钟)：
              </label>
              <input type="number" id="datax-jobprop-timeout" min="0" max="1440" placeholder="留空原样 (0=不限)" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                <label style="font-weight: 600; font-size: 11px; color: #333;">
                  📧 报警邮件：
                </label>
                <label style="font-size: 10px; color: #f5222d; cursor: pointer; display: flex; align-items: center; gap: 2px; user-select: none;">
                  <input type="checkbox" id="datax-jobprop-clear-email" style="cursor: pointer; width: 11px; height: 11px;" />
                  <span>清空邮件</span>
                </label>
              </div>
              <input type="text" id="datax-jobprop-alarm-email" placeholder="留空保持原样；多个以逗号隔开" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px;" />
            </div>
          </div>
        </div>
      </div>

      <!-- 操作与 Diff 预览控制区 -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button id="datax-writer-preview-btn" style="flex: 1; background: #fa8c16; color: #fff; border: none; padding: 9px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px;">
          🔍 变更 Diff 预览
        </button>
        <button id="datax-writer-execute-btn" style="flex: 1.2; background: #52c41a; color: #fff; border: none; padding: 9px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px;">
          确认并提交批量修改
        </button>
      </div>

      <!-- 执行状态与反馈提示 -->
      <div id="datax-writer-status-tip" style="font-size: 12px; font-weight: bold; margin-bottom: 8px; min-height: 18px;"></div>

      <!-- Diff 结果对比展示容器 -->
      <div id="datax-writer-diff-container" style="display: none; border: 1px solid #ebeef5; border-radius: 6px; padding: 8px; background: #fff; flex: 1; min-height: 180px; max-height: 52vh; overflow-y: auto; font-size: 12px; box-sizing: border-box; flex-direction: column;"></div>
    </div>

    <!-- Tab 5: 库表数据浏览与查询 (NEW) -->
    <div id="datax-tab-content-5" style="padding: 12px; overflow-y: auto; flex: 1; display: none; flex-direction: column; box-sizing: border-box; font-size: 12px;">
      <!-- 顶部数据源与库表三级选择器 -->
      <div style="background: #f8f9fa; border: 1px solid #dcdfe6; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
        <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.6fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <label style="font-size: 11px; font-weight: bold; color: #333;">1. 选择数据源 (Datasource):</label>
              <button id="datax-dv-btn-reload-ds" title="点击重新获取数据源列表" style="border: none; background: transparent; color: #1890ff; cursor: pointer; font-size: 11px; padding: 0 2px; font-weight: bold;">重新加载</button>
            </div>
            <div id="datax-dv-datasource-combobox" style="width: 100%;"></div>
            <input type="hidden" id="datax-dv-datasource-select" value="" />
          </div>
          <div id="datax-dv-schema-container" style="display: none;">
            <label style="font-size: 11px; font-weight: bold; color: #333; display: block; margin-bottom: 3px;">2. Schema / 库名:</label>
            <select id="datax-dv-schema-select" style="width: 100%; padding: 5px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;"></select>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <label style="font-size: 11px; font-weight: bold; color: #333;">3. 检索并选择数据表 (支持表名与注解查询):</label>
            </div>
            <div id="datax-dv-table-combobox" style="width: 100%;"></div>
            <input type="hidden" id="datax-dv-table-select" value="" />
          </div>
        </div>

        <!-- 快捷功能子 Tab 切换 -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e8e8e8; padding-top: 8px;">
          <div style="display: flex; gap: 6px;">
            <button id="datax-dv-viewtab-data" style="background: #1890ff; color: #fff; border: 1px solid #1890ff; padding: 4px 10px; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer;">表数据预览</button>
            <button id="datax-dv-viewtab-schema" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 4px 10px; border-radius: 3px; font-size: 11px; cursor: pointer;">字段结构元数据</button>
            <button id="datax-dv-viewtab-sql" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 4px 10px; border-radius: 3px; font-size: 11px; cursor: pointer;">只读 SQL 控制台</button>
          </div>
          <div style="display: flex; gap: 6px;">
            <button id="datax-dv-btn-refresh" style="background: #f0f2f5; color: #303133; border: 1px solid #dcdfe6; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">刷新</button>
            <button id="datax-dv-btn-export-excel" style="background: #52c41a; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer;">导出 Excel</button>
            <button id="datax-dv-btn-copy-json" style="background: #722ed1; color: #fff; border: none; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;">复制 JSON</button>
          </div>
        </div>
      </div>

      <!-- 视图 1：表数据列表面板 -->
      <div id="datax-dv-panel-data" style="display: flex; flex-direction: column; flex: 1;">
        <!-- 条件过滤工具条 -->
        <div style="display: flex; gap: 6px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; background: #fff; padding: 6px 8px; border: 1px solid #ebeef5; border-radius: 4px;">
          <input type="text" id="datax-dv-where-input" placeholder="高级 WHERE 条件 (例如: status = 1 AND id > 10)" style="flex: 2; min-width: 220px; padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 3px;" />
          <select id="datax-dv-order-field" style="width: 120px; padding: 5px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;">
            <option value="">-- 默认排序 --</option>
          </select>
          <select id="datax-dv-order-type" style="width: 80px; padding: 5px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;">
            <option value="ASC">升序 ASC</option>
            <option value="DESC">降序 DESC</option>
          </select>
          <select id="datax-dv-page-size" style="width: 90px; padding: 5px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff;">
            <option value="20">20 条/页</option>
            <option value="50">50 条/页</option>
            <option value="100">100 条/页</option>
            <option value="200">200 条/页</option>
            <option value="500">500 条/页</option>
          </select>
          <button id="datax-dv-btn-query" style="background: #1890ff; color: #fff; border: none; padding: 5px 12px; border-radius: 3px; font-weight: bold; cursor: pointer; font-size: 12px;">🔍 查询</button>
          <button id="datax-dv-btn-reset" style="background: #f0f2f5; color: #606266; border: 1px solid #dcdfe6; padding: 5px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">重置</button>
          <div style="display: flex; align-items: center; gap: 4px; margin-left: auto;">
            <label style="font-size: 11px; color: #595959; white-space: nowrap; font-weight: 600;">表头备注:</label>
            <select id="datax-dv-comment-mode" style="padding: 4px 8px; font-size: 11px; border: 1px solid #91d5ff; border-radius: 3px; background: #e6f7ff; color: #096dd9; font-weight: 600; cursor: pointer;" title="切换数据预览表头的字段备注展示方式">
              <option value="both">🏷️ 字段名 + 备注 (双行)</option>
              <option value="commentFirst">📝 优先显示备注</option>
              <option value="nameOnly">🔤 仅显示字段名</option>
            </select>
          </div>
        </div>

        <!-- 表格状态与统计 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px; color: #606266;">
          <div>
            <span id="datax-dv-table-target-desc" style="font-weight: bold; color: #303133;">-</span>
            <span id="datax-dv-query-stat" style="margin-left: 10px; color: #52c41a;"></span>
            <span style="margin-left: 10px; color: #8c8c8c;">💡 数据单元格可直接划词双击复制；按住 <kbd style="background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;padding:0 3px;font-size:10px;">Alt</kbd> 键或在序号列拖拽可多选行</span>
          </div>
          <div id="datax-dv-status-tip" style="color: #1890ff; font-weight: bold;"></div>
        </div>

        <!-- 动态数据表格容器 -->
        <div id="datax-dv-table-container" style="flex: 1; min-height: 220px; max-height: 52vh; overflow: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff; position: relative;">
          <div style="padding: 40px; text-align: center; color: #909399;">请选择数据源与表后点击【🔍 查询】</div>
        </div>

        <!-- 分页控制栏 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; background: #fafafa; padding: 6px 10px; border-radius: 4px; border: 1px solid #ebeef5;">
          <div style="font-size: 11px; color: #606266;">
            共 <strong id="datax-dv-total-records" style="color: #1890ff;">0</strong> 条记录 | 第 <span id="datax-dv-current-page-text">1</span> / <span id="datax-dv-total-pages-text">1</span> 页
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button id="datax-dv-btn-first" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">首页</button>
            <button id="datax-dv-btn-prev" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">上一页</button>
            <input type="number" id="datax-dv-jump-page" min="1" value="1" style="width: 44px; padding: 2px 4px; font-size: 11px; text-align: center; border: 1px solid #dcdfe6; border-radius: 3px;" />
            <button id="datax-dv-btn-jump" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">跳转</button>
            <button id="datax-dv-btn-next" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 3px; background: #fff; cursor: pointer;">下一页</button>
          </div>
        </div>
      </div>

      <!-- 视图 2：表结构元数据面板 -->
      <div id="datax-dv-panel-schema" style="display: none; flex-direction: column; flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: #303133;">表字段详细结构与元数据</strong>
          <button id="datax-dv-btn-copy-ddl" style="background: #fa8c16; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; font-size: 11px; cursor: pointer;">复制建表 DDL</button>
        </div>
        <div id="datax-dv-schema-container-box" style="flex: 1; min-height: 240px; max-height: 56vh; overflow: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff;"></div>
      </div>

      <!-- 视图 3：只读 SQL 控制台 -->
      <div id="datax-dv-panel-sql" style="display: none; flex-direction: column; flex: 1;">
        <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <strong style="color: #303133;">只读 SQL 查询控制台</strong>
            <span style="margin-left: 8px; font-size: 11px; color: #52c41a; background: #f6ffed; border: 1px solid #b7eb8f; padding: 1px 6px; border-radius: 3px;">只读安全模式 (仅允许 SELECT / WITH / EXPLAIN)</span>
          </div>
          <div id="datax-dv-sql-actions-bar" style="display: flex; align-items: center; gap: 6px;">
            <button id="datax-dv-btn-execute-sql" style="background: #1890ff; color: #fff; border: none; padding: 5px 14px; border-radius: 3px; font-weight: bold; cursor: pointer; font-size: 12px;" title="快捷键: Ctrl + Enter">执行 SQL</button>
          </div>
        </div>
        <textarea id="datax-dv-sql-input" placeholder="请输入 SELECT 语句..." style="width: 100%; height: 90px; box-sizing: border-box; padding: 8px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fdfdfd; line-height: 1.4; resize: vertical;"></textarea>
        <div id="datax-dv-sql-result-container" style="margin-top: 8px; flex: 1; min-height: 180px; max-height: 48vh; overflow: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff;">
          <div style="padding: 30px; text-align: center; color: #909399;">输入只读 SQL 并点击【执行 SQL】查看结果</div>
        </div>
      </div>
    </div>

    <!-- Tab 6: 数据加工与结果表输出 (SQL/Python 多源计算输出目标表) -->
    <div id="datax-tab-content-6" style="padding: 12px; overflow-y: auto; flex: 1; display: none; flex-direction: column; box-sizing: border-box; font-size: 12px;">
      <!-- 顶部操作与筛选栏 -->
      <div style="background: #f8f9fa; border: 1px solid #dcdfe6; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; flex: 1; min-width: 260px;">
          <input type="text" id="datax-st-search-name" placeholder="🔍 检索任务名称..." style="padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; min-width: 120px; flex: 1; box-sizing: border-box;" />
          <select id="datax-st-search-ds" style="padding: 5px 6px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; max-width: 160px; flex-shrink: 0;">
            <option value="">全部数据源</option>
          </select>
          <input type="text" id="datax-st-search-table" placeholder="🔍 目标表名..." style="padding: 5px 8px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; width: 110px; box-sizing: border-box; flex-shrink: 0;" />
          <select id="datax-st-search-type" style="padding: 5px 6px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; flex-shrink: 0;">
            <option value="">全部模式</option>
            <option value="SQL">SQL 关联计算</option>
            <option value="PYTHON">Python 脚本计算</option>
          </select>
          <select id="datax-st-search-status" style="padding: 5px 6px; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; flex-shrink: 0;">
            <option value="">全部状态</option>
            <option value="1">🟢 运行中</option>
            <option value="0">⚪ 已停止</option>
          </select>
          <button id="datax-st-btn-query" style="background: #1890ff; color: #fff; border: none; padding: 5px 12px; border-radius: 3px; font-weight: bold; cursor: pointer; white-space: nowrap; flex-shrink: 0;">🔍 查询</button>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
          <button id="datax-st-btn-refresh" style="background: #f0f2f5; color: #303133; border: 1px solid #dcdfe6; padding: 5px 10px; border-radius: 3px; cursor: pointer; white-space: nowrap; flex-shrink: 0;">刷新</button>
          <button id="datax-st-btn-create-task" style="background: #52c41a; color: #fff; border: none; padding: 5px 14px; border-radius: 3px; font-weight: bold; cursor: pointer; white-space: nowrap; flex-shrink: 0;">➕ 新建加工任务</button>
        </div>
      </div>

      <!-- 任务配置与编辑抽屉面板 (可折叠) -->
      <div id="datax-st-editor-panel" style="display: none; background: #fff; border: 1px solid #1890ff; border-radius: 6px; padding: 12px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(24,144,255,0.12);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ebeef5; padding-bottom: 8px; margin-bottom: 10px;">
          <span id="datax-st-editor-title" style="font-size: 13px; font-weight: bold; color: #1890ff;">新建数据加工与结果表输出任务</span>
          <span id="datax-st-btn-close-editor" style="cursor: pointer; font-size: 18px; color: #909399; font-weight: bold;" title="关闭编辑">&times;</span>
        </div>
        <input type="hidden" id="datax-st-form-id" value="" />

        <!-- 基础配置 -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; margin-bottom: 2px;">任务名称 <span style="color:red;">*</span>:</label>
            <input type="text" id="datax-st-form-name" placeholder="如: 每日多源订单清洗与汇总宽表输出" style="width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px;" />
          </div>
          <div>
            <label style="font-weight: bold; display: block; margin-bottom: 2px;">计算模式 <span style="color:red;">*</span>:</label>
            <select id="datax-st-form-type" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
              <option value="SQL">📊 SQL 关联与多源计算模式</option>
              <option value="PYTHON">🐍 Python 脚本模式 (标准输出)</option>
            </select>
          </div>
          <div>
            <label style="font-weight: bold; display: block; margin-bottom: 2px;">Cron 定时调度表达式:</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="datax-st-form-cron" placeholder="0 0 2 * * ?" value="0 0 2 * * ?" style="flex: 1; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px;" />
              <select id="datax-st-cron-presets" style="width: 85px; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 11px; background: #f8f9fa;">
                <option value="">--预设--</option>
                <option value="0 0 2 * * ?">每天02点</option>
                <option value="0 0 * * * ?">每小时</option>
                <option value="0 0/30 * * * ?">每30分钟</option>
                <option value="0/30 * * * * ?">每30秒(测)</option>
              </select>
            </div>
          </div>
          <div>
            <label style="font-weight: bold; display: block; margin-bottom: 2px;">阻塞处理策略:</label>
            <select id="datax-st-form-block-strategy" style="width: 100%; padding: 5px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
              <option value="DISCARD_LATER">丢弃后续调度 (推荐，防并发堆叠)</option>
              <option value="SERIAL_EXECUTION">单机串行 (排队等待上一轮结束)</option>
              <option value="COVER_EARLY">覆盖之前调度 (强杀上一轮并立即启动)</option>
              <option value="CONCURRENT">允许并行 (多进程并发跑)</option>
            </select>
          </div>
        </div>

        <!-- SQL 模式专属配置区 -->
        <div id="datax-st-box-sql" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 8px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
            <label style="font-weight: bold; color: #1890ff;">源端数据源 (Source Datasource) & 统计 SQL:</label>
            <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 11px; user-select: none; color: #722ed1; font-weight: bold; background: #f9f0ff; padding: 2px 8px; border: 1px solid #d3adf7; border-radius: 4px;">
              <input type="checkbox" id="datax-st-form-is-cross-db" style="cursor: pointer;" />
              <span>🌐 启用跨库多源协同查询</span>
            </label>
          </div>

          <!-- 单库/主库配置容器 -->
          <div id="datax-st-single-ds-box">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 280px;">
                <span style="font-size: 11px; color: #606266; font-weight: bold;" id="datax-st-source-ds-label">源端数据源:</span>
                <div id="datax-st-source-ds-combobox" style="flex: 1; max-width: 360px;"></div>
                <input type="hidden" id="datax-st-form-source-ds" value="" />
              </div>
            </div>

            <!-- 源端表名与注解查询工具栏 -->
            <div id="datax-st-source-table-bar" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; background: #fff; border: 1px solid #e8e8e8; border-radius: 4px; padding: 4px 8px; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 280px;">
                <span style="font-size: 11px; color: #1890ff; font-weight: bold; white-space: nowrap;">源库表查询:</span>
                <div id="datax-st-source-table-combobox" style="flex: 1; min-width: 200px; max-width: 360px;"></div>
                <input type="hidden" id="datax-st-source-table-val" value="" />
              </div>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button type="button" id="datax-st-btn-insert-table" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 3px; font-size: 11px; padding: 2px 8px; cursor: pointer; font-weight: 500;" title="将当前选中的表名插入到下方 SQL 光标处">➕ 插入表名</button>
                <button type="button" id="datax-st-btn-gen-select" style="background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; border-radius: 3px; font-size: 11px; padding: 2px 8px; cursor: pointer; font-weight: 500;" title="为当前选中的表生成基础统计 SQL 模板">生成查询SQL</button>
              </div>
            </div>
            <textarea id="datax-st-form-sql" rows="8" placeholder="请输入只读统计 SQL，支持动态宏变量: \${bizDate}, \${yesterday}, \${today}, \${now}&#10;示例: SELECT dept_id, count(1) as total_users, sum(salary) as total_salary FROM sys_emp WHERE create_time >= '\${bizDate} 00:00:00' GROUP BY dept_id" style="width: 100%; min-height: 200px; height: 200px; line-height: 1.5; box-sizing: border-box; padding: 8px 10px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; resize: vertical;"></textarea>
            <div style="font-size: 11px; color: #888; margin-top: 4px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
              <span>支持直接在SQL中嵌入跨库子查询: <code>/*ds:数据源ID或名称*/ (SELECT ...)</code>，引擎将自动跨库取值</span>
              <button type="button" id="datax-st-btn-insert-macro" style="background:#e6f7ff;color:#1890ff;border:1px solid #91d5ff;border-radius:3px;font-size:11px;padding:2px 8px;cursor:pointer;">➕ 插入跨库子查询模板</button>
            </div>
          </div>

          <!-- 跨库多源可视化编排面板 (默认隐藏) -->
          <div id="datax-st-cross-db-panel" style="display: none; margin-top: 8px; border-top: 1px dashed #d3adf7; padding-top: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; background: #fdf6ec; padding: 6px 8px; border-radius: 4px; border: 1px solid #faecd8;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: bold; color: #e6a23c;">多源合并模式:</span>
                <select id="datax-st-cross-merge-mode" style="padding: 3px 6px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                  <option value="UNION_ALL">UNION ALL (多库记录行合并追加 - 适用多租户/分库合并写入)</option>
                  <option value="KEY_JOIN">KEY JOIN (按主键横向关联 - 适用多库指标汇聚单行宽表)</option>
                  <option value="FEDERATED_SQL">FEDERATED SQL (以主库为主，跨库宏替换注入)</option>
                </select>
              </div>
              <div id="datax-st-cross-join-keys-box" style="display: none; align-items: center; gap: 4px;">
                <span style="font-size: 11px; font-weight: bold; color: #e6a23c;">关联主键:</span>
                <input type="text" id="datax-st-cross-join-keys" placeholder="如: tenant_id, stat_date" style="padding: 3px 6px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; width: 170px;" />
              </div>
            </div>

            <!-- FEDERATED SQL 模式说明提示 (仅该模式显示) -->
            <div id="datax-st-cross-fed-tip" style="display: none; padding: 8px 12px; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 4px; font-size: 11px; color: #389e0d; margin-bottom: 6px;">
              <strong>FEDERATED SQL 模式说明</strong>：在此模式下，直接在上方主 SQL 中使用 <code>/*ds:数据源ID或名称*/ (SELECT ...)</code> 嵌入跨库子查询即可，<strong>无需在下方添加额外的独立源节点</strong>。
            </div>

            <!-- 动态多源节点容器 (UNION_ALL / KEY_JOIN 时展示) -->
            <div id="datax-st-cross-sources-container" style="display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; padding-right: 2px;"></div>

            <div id="datax-st-cross-add-btn-box" style="margin-top: 8px; text-align: right;">
              <button type="button" id="datax-st-btn-add-cross-source" style="background: #722ed1; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold;">➕ 添加跨库数据源节点</button>
            </div>
          </div>
        </div>

        <!-- Python 模式专属配置区 -->
        <div id="datax-st-box-python" style="display: none; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-bottom: 8px; align-items: start;">
            <div>
              <label style="font-size: 11px; color: #722ed1; font-weight: bold; display: block; margin-bottom: 4px;">关联源端库 (免密注入):</label>
              <div id="datax-st-python-ds-combobox"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="font-size: 11px; color: #606266; font-weight: bold;">动态运行参数 (JSON 格式):</label>
                <span style="font-size: 10px; color: #909399;">支持多行输入 (如 limit, maxSeconds, delay 等)</span>
              </div>
              <textarea id="datax-st-form-python-params" rows="3" placeholder='动态参数 JSON，例如：&#10;{&#10;  "limit": 500,&#10;  "maxSeconds": 50,&#10;  "delay": 0.05&#10;}' style="width: 100%; min-height: 58px; height: 58px; box-sizing: border-box; padding: 6px 8px; font-family: Consolas, Monaco, monospace; font-size: 11px; line-height: 1.4; border: 1px solid #dcdfe6; border-radius: 4px; resize: vertical; background: #fff;"></textarea>
            </div>
          </div>


          <!-- 可选数据源提示与快捷标签栏 (前端提示哪些库可选) -->
          <div id="datax-st-python-ds-hint-bar" style="background: #fff; border: 1px dashed #d3adf7; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
              <span style="font-size: 11px; color: #722ed1; font-weight: bold;">系统已配置可选数据源清单 (点击可快速切换绑定):</span>
              <div style="display: flex; gap: 6px; align-items: center;">
                <button type="button" id="datax-st-btn-load-demo-code" style="background: #f0f5ff; color: #1d39c4; border: 1px solid #adc6ff; border-radius: 3px; font-size: 11px; padding: 2px 8px; cursor: pointer; font-weight: 500;" title="在编辑框中载入生产级标准 Python 加工参考 Demo 模板">参考示例模板</button>
                <button type="button" id="datax-st-btn-insert-py-db-code" style="background: #f9f0ff; color: #722ed1; border: 1px solid #d3adf7; border-radius: 3px; font-size: 11px; padding: 2px 8px; cursor: pointer; font-weight: 500;" title="在当前 Python 光标处插入免密读取数据库连接代码模板">➕ 插入免密读取代码</button>
              </div>
            </div>
            <div id="datax-st-python-available-ds-badges" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 80px; overflow-y: auto;">
              <span style="font-size: 11px; color: #909399;">正在加载已配置数据源...</span>
            </div>
          </div>

          <textarea id="datax-st-form-python-script" rows="8" placeholder="Python 源码..." style="width: 100%; min-height: 180px; height: 180px; line-height: 1.5; box-sizing: border-box; padding: 8px 10px; font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #dcdfe6; border-radius: 4px; resize: vertical;"></textarea>
        </div>

        <!-- 目标输出端配置 (支持可选库和选表输出) -->
        <div style="background: #f0f7ff; border: 1px solid #bae7ff; border-radius: 4px; padding: 8px; margin-bottom: 8px;">
          <div style="font-weight: bold; color: #0050b3; margin-bottom: 6px;">目标端输出配置 (可选目标库、选表输出与写入模式):</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 6px;">
            <div>
              <label style="font-size: 11px; display: block; margin-bottom: 2px; font-weight: bold;">目标端数据源 (可选库) <span style="color:red;">*</span>:</label>
              <div id="datax-st-target-ds-combobox"></div>
              <input type="hidden" id="datax-st-form-target-ds" value="" />
            </div>
            <div style="grid-column: span 2;">
              <label style="font-size: 11px; display: block; margin-bottom: 2px; font-weight: bold;">目标端表名 (选已有表或直接输入新表名) <span style="color:red;">*</span>:</label>
              <div id="datax-st-target-table-combobox"></div>
              <input type="hidden" id="datax-st-form-target-table" value="" />
            </div>
            <div>
              <label style="font-size: 11px; display: block; margin-bottom: 2px; font-weight: bold;">写入策略:</label>
              <select id="datax-st-form-write-mode" style="width: 100%; padding: 4px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
                <option value="APPEND">APPEND (追加插入)</option>
                <option value="OVERWRITE">OVERWRITE (清空覆盖)</option>
                <option value="UPSERT">UPSERT (主键存在即更新)</option>
                <option value="NONE">NONE (不入库，脚本内自写库)</option>
              </select>

            </div>
            <div style="display: flex; align-items: flex-end; padding-bottom: 4px;">
              <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 11px; user-select: none;">
                <input type="checkbox" id="datax-st-form-auto-create" checked style="cursor: pointer;" />
                <strong>若目标表不存在则自动建表</strong>
              </label>
            </div>
          </div>
        </div>

        <!-- 操作按钮与反馈栏 -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px;">
          <div id="datax-st-form-tip" style="font-size: 12px; font-weight: bold; min-height: 18px;"></div>
          <div style="display: flex; gap: 6px;">
            <button id="datax-st-btn-test-run" style="background: #fa8c16; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer;">试运行调试 (预览数据)</button>
            <button id="datax-st-btn-save" style="background: #1890ff; color: #fff; border: none; padding: 6px 18px; border-radius: 4px; font-weight: bold; cursor: pointer;">保存任务配置</button>
            <button id="datax-st-btn-cancel" style="background: #f0f2f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 4px; cursor: pointer;">取消</button>
          </div>
        </div>

        <!-- 试运行结果展示面板 -->
        <div id="datax-st-test-run-result-box" style="display: none; margin-top: 10px; border: 1px solid #d9d9d9; border-radius: 4px; padding: 8px; background: #fafafa;">
          <div id="datax-st-test-run-summary" style="font-weight: bold; color: #1890ff; margin-bottom: 6px;"></div>
          <div id="datax-st-test-run-table-container" style="max-height: 220px; overflow-y: auto; border: 1px solid #ebeef5; background: #fff;"></div>
        </div>
      </div>

      <!-- 统计任务列表状态与全选控制 & 批量操作栏 -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; flex-wrap: wrap; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <input type="checkbox" id="datax-st-check-all" /> <strong>全选 (<span id="datax-st-selected-count">0</span> / <span id="datax-st-total-count">0</span>)</strong>
          </label>
          <!-- 批量操作按钮组 (选中时激活高亮浮现) -->
          <div id="datax-st-batch-bar" style="display: none; align-items: center; gap: 6px;">
            <button id="datax-st-btn-batch-trigger" style="background: #1890ff; color: #fff; border: none; padding: 3px 10px; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer;" title="立即正式执行所选统计任务并写入目标库">🚀 批量执行 (<span class="datax-st-sel-num">0</span>)</button>
            <button id="datax-st-btn-batch-start" style="background: #52c41a; color: #fff; border: none; padding: 3px 10px; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer;" title="批量启动所选统计任务的定时调度">批量启动</button>
            <button id="datax-st-btn-batch-stop" style="background: #faad14; color: #fff; border: none; padding: 3px 10px; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer;" title="批量停止所选统计任务的定时调度">批量停止</button>
            <button id="datax-st-btn-batch-delete" style="background: #ff4d4f; color: #fff; border: none; padding: 3px 10px; border-radius: 3px; font-size: 11px; font-weight: bold; cursor: pointer;" title="批量删除所选统计任务">🗑️ 批量删除</button>
          </div>
        </div>
        <span style="font-size: 11px; color: #8c8c8c;">💡 文字可自由划词复制；按住 <kbd style="background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;padding:0 3px;font-size:10px;">Alt</kbd> 键或在行首勾选列拖拽可框选</span>
      </div>

      <!-- 任务列表容器 -->
      <div id="datax-st-list-container" style="flex: 1; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 4px; background: #fff; min-height: 240px; position: relative;">
        <div style="text-align: center; color: #909399; padding: 40px;">⏳ 正在加载统计任务列表...</div>
      </div>
    </div>

    <!-- Tab 7: 接口数据采集与落库 (HTTP API -> DB) -->
    <div id="datax-tab-content-7" style="padding: 12px; overflow-y: auto; flex: 1; display: none; flex-direction: column; box-sizing: border-box; font-size: 12px;"></div>
    <!-- Tab 8: 三方开放 API 管理与调用审计 -->
    <div id="datax-tab-content-8" style="padding: 0; overflow-y: auto; flex: 1; display: none; flex-direction: column; box-sizing: border-box; font-size: 12px;"></div>

    <div class="datax-resize-handle datax-resize-n" data-dir="n" title="上下拉伸"></div>
    <div class="datax-resize-handle datax-resize-s" data-dir="s" title="上下拉伸"></div>
    <div class="datax-resize-handle datax-resize-w" data-dir="w" title="左右拉伸"></div>
    <div class="datax-resize-handle datax-resize-e" data-dir="e" title="左右拉伸"></div>
    <div class="datax-resize-handle datax-resize-nw" data-dir="nw" title="四向等比缩放"></div>
    <div class="datax-resize-handle datax-resize-ne" data-dir="ne" title="四向等比缩放"></div>
    <div class="datax-resize-handle datax-resize-sw" data-dir="sw" title="四向等比缩放"></div>
    <div id="datax-panel-resize-handle" class="datax-resize-handle datax-resize-se" data-dir="se" title="按住拖动可自由调整窗口宽高" style="position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: se-resize; z-index: 101; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; box-sizing: border-box; user-select: none;">
      <svg width="10" height="10" viewBox="0 0 10 10" style="opacity: 0.5;">
        <path d="M9 1 L1 9 M9 5 L5 9 M9 9 L9 9" stroke="#909399" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </div>

    <!-- 智能助手偏好设置模态浮层 -->
    <div id="datax-settings-modal" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px); z-index: 200; border-radius: 10px; align-items: center; justify-content: center; box-sizing: border-box; padding: 20px;">
      <div id="datax-settings-dialog" style="width: 480px; max-width: 96%; background: #ffffff; border-radius: 10px; box-shadow: 0 12px 36px rgba(0,0,0,0.25); border: 1px solid #e4e7ed; overflow: hidden; animation: dataxFadeIn 0.2s ease;">
        <div style="background: linear-gradient(90deg, #1890ff, #096dd9); color: #fff; padding: 12px 16px; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; align-items: center; user-select: none;">
          <span style="display: flex; align-items: center; gap: 8px;">智能助手个性化设置</span>
          <span id="datax-settings-close" style="cursor: pointer; font-size: 20px; line-height: 1; padding: 0 4px;" title="关闭设置">&times;</span>
        </div>
        <div style="padding: 16px 20px; max-height: 70vh; overflow-y: auto;">
          <!-- 1. 外观主题模式 -->
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-weight: bold; margin-bottom: 8px; color: #303133;">外观主题模式：</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <div class="datax-theme-card" data-theme="light" style="padding: 10px; border: 2px solid #1890ff; border-radius: 6px; cursor: pointer; text-align: center; background: #fafafa; font-size: 12px; font-weight: bold; color: #303133; transition: all 0.2s;">
                浅色明亮
              </div>
              <div class="datax-theme-card" data-theme="dark" style="padding: 10px; border: 1px solid #dcdfe6; border-radius: 6px; cursor: pointer; text-align: center; background: #25262c; font-size: 12px; font-weight: bold; color: #e5e7eb; transition: all 0.2s;">
                暗黑极客
              </div>
              <div class="datax-theme-card" data-theme="auto" style="padding: 10px; border: 1px solid #dcdfe6; border-radius: 6px; cursor: pointer; text-align: center; background: #f0f2f5; font-size: 12px; font-weight: bold; color: #606266; transition: all 0.2s;">
                跟随系统
              </div>
            </div>
          </div>

          <!-- 2. 不选中透明度调整 -->
          <div style="margin-bottom: 16px; background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-weight: bold; color: #303133;">未选中/失焦透明度：</label>
              <span id="datax-setting-opacity-val" style="font-weight: bold; color: #1890ff; font-size: 13px;">25% (透视底层)</span>
            </div>
            <div style="margin-bottom: 8px;">
              <input type="range" id="datax-setting-opacity-slider" min="5" max="100" step="5" value="25" style="width: 100%; cursor: pointer;" />
            </div>
            <div style="display: flex; justify-content: space-between; gap: 6px;">
              <button type="button" class="datax-opacity-quick" data-val="10" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">10% 极透</button>
              <button type="button" class="datax-opacity-quick" data-val="25" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">25% 推荐</button>
              <button type="button" class="datax-opacity-quick" data-val="50" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">50% 半透</button>
              <button type="button" class="datax-opacity-quick" data-val="80" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">80% 微透</button>
              <button type="button" class="datax-opacity-quick" data-val="100" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">100% 不透明</button>
            </div>
            <div style="font-size: 11px; color: #909399; margin-top: 6px;">
              说明：点击悬浮工作台外部时，自动变为设定透明度；点击工作台内部立即恢复 100% 实色。
            </div>
          </div>

          <!-- 3. 工作台全局字体大小 -->
          <div style="margin-bottom: 16px; background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-weight: bold; color: #303133;">工作台全局字体大小：</label>
              <span id="datax-setting-font-val" style="font-weight: bold; color: #1890ff; font-size: 13px;">13px (默认)</span>
            </div>
            <div style="margin-bottom: 8px;">
              <input type="range" id="datax-setting-font-slider" min="12" max="17" step="1" value="13" style="width: 100%; cursor: pointer;" />
            </div>
            <div style="display: flex; justify-content: space-between; gap: 6px; margin-bottom: 8px;">
              <button type="button" class="datax-font-quick" data-val="12" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">小 (12px)</button>
              <button type="button" class="datax-font-quick" data-val="13" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">默认 (13px)</button>
              <button type="button" class="datax-font-quick" data-val="14" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">中等 (14px)</button>
              <button type="button" class="datax-font-quick" data-val="15" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">大号 (15px)</button>
              <button type="button" class="datax-font-quick" data-val="16" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer;">特大 (16px)</button>
            </div>
            <div id="datax-setting-font-preview" style="padding: 6px 10px; background: #fff; border: 1px dashed #dcdfe6; border-radius: 4px; color: #606266; font-size: 13px;">
              预览文本：DataX 智能调度工作台 · 批量表映射与数据流转
            </div>
          </div>

          <!-- 4. 选项卡显示与隐藏控制 -->
          <div style="margin-bottom: 16px; background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div>
                <label style="font-weight: bold; color: #303133; font-size: 13px;">选项卡显示与隐藏控制：</label>
                <div style="font-size: 11px; color: #909399; margin-top: 2px;">
                  勾选以在顶部导航栏常驻展示，取消勾选则隐藏（至少保留 1 个可见）
                </div>
              </div>
              <div style="display: flex; gap: 6px;">
                <button type="button" id="datax-tab-visibility-all-btn" class="datax-tab-btn-quick" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer; color: #1890ff;">全选</button>
                <button type="button" id="datax-tab-visibility-default-btn" class="datax-tab-btn-quick" style="padding: 3px 8px; font-size: 11px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer; color: #606266;">恢复默认</button>
              </div>
            </div>
            <div id="datax-tab-visibility-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="1" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">📁 1. 表勾选</div>
                  <div style="font-size: 10px; color: #909399;">Excel与粘贴文本智能勾选</div>
                </div>
              </label>
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="2" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">🛠️ 2. 映射建表</div>
                  <div style="font-size: 10px; color: #909399;">批量类型映射与建表DDL</div>
                </div>
              </label>
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="3" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">⚡ 3. 任务批处理</div>
                  <div style="font-size: 10px; color: #909399;">批量构建任务与时间增量</div>
                </div>
              </label>
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="4" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">🔄 4. 批量改库</div>
                  <div style="font-size: 10px; color: #909399;">批量置换Reader/Writer连接</div>
                </div>
              </label>
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="5" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">📊 5. 数据浏览</div>
                  <div style="font-size: 10px; color: #909399;">表目录清单检索与数据预览</div>
                </div>
              </label>
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="6" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">🛠️ 6. 结果表加工</div>
                  <div style="font-size: 10px; color: #909399;">多源关联统计与Python加工</div>
                </div>
              </label>
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="7" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">🌐 7. 接口采集</div>
                  <div style="font-size: 10px; color: #909399;">外部HTTP/API接口定时拉取落库</div>
                </div>
              </label>
              <label class="datax-tab-visibility-item" style="display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; cursor: pointer; user-select: none;">
                <input type="checkbox" class="datax-tab-visible-cb" data-tab-id="8" checked style="margin-top: 2px; cursor: pointer;" />
                <div>
                  <div class="tab-title" style="font-weight: 600; font-size: 12px; color: #303133;">8. 三方API</div>
                  <div style="font-size: 10px; color: #909399;">三方开放API账号授权与审计</div>
                </div>
              </label>
            </div>
          </div>

          <!-- 5. 窗口位置与缩放重置 -->
          <div style="margin-bottom: 16px; background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: bold; color: #303133; font-size: 12px;">窗口尺寸与全向缩放</div>
              <div style="font-size: 11px; color: #909399; margin-top: 2px;">支持窗口 4 条边框与 4 个拐角（8方向）自由拖拽拉伸</div>
            </div>
            <button type="button" id="datax-setting-reset-pos-btn" style="background: #f0f2f5; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; color: #606266; font-weight: 500;">
              恢复默认位置与尺寸
            </button>
          </div>

          <!-- 6. 键盘快捷键指南 -->
          <div style="background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px;">
            <div style="font-weight: bold; color: #303133; font-size: 12px; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
              <span>全局快捷键指南</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #606266;">
              <div style="background: #fff; padding: 6px 8px; border-radius: 4px; border: 1px solid #e4e7ed; display: flex; justify-content: space-between; align-items: center;">
                <span>打开 / 收起助手：</span>
                <kbd style="background: #f2f3f5; border: 1px solid #dcdfe6; border-radius: 3px; padding: 1px 5px; font-weight: bold; color: #1890ff;">Alt + \`</kbd>
              </div>
              <div style="background: #fff; padding: 6px 8px; border-radius: 4px; border: 1px solid #e4e7ed; display: flex; justify-content: space-between; align-items: center;">
                <span>快速收起助手：</span>
                <kbd style="background: #f2f3f5; border: 1px solid #dcdfe6; border-radius: 3px; padding: 1px 5px; font-weight: bold; color: #1890ff;">Esc</kbd>
              </div>
              <div style="grid-column: 1 / -1; background: #fff; padding: 6px 8px; border-radius: 4px; border: 1px solid #e4e7ed; display: flex; justify-content: space-between; align-items: center;">
                <span>切换选项卡 (Tab 1 ~ 6 及后续新增Tab)：</span>
                <kbd style="background: #f2f3f5; border: 1px solid #dcdfe6; border-radius: 3px; padding: 1px 5px; font-weight: bold; color: #1890ff;">Alt + 1 ~ 9</kbd>
              </div>
            </div>
          </div>
        </div>
        <div style="padding: 10px 20px; background: #fafafa; border-top: 1px solid #ebeef5; display: flex; justify-content: flex-end;">
          <button type="button" id="datax-settings-done-btn" style="background: #1890ff; color: #fff; border: none; padding: 7px 20px; border-radius: 4px; font-weight: bold; font-size: 12px; cursor: pointer;">
            完成
          </button>
        </div>
      </div>
    </div>
  `;
  panel.appendChild(contentWrapper);
  document.body.appendChild(panel);

  // 5. 初始化交互管理器与偏好设置
  const headerEl = document.getElementById('datax-panel-header');
  const maxBtn = document.getElementById('datax-panel-max');
  const windowManager = new window.DataXAssistant.PanelWindowManager(panel, headerEl, {
    maxBtn,
    minWidth: 600,
    minHeight: 400
  });

  const settingsModalEl = document.getElementById('datax-settings-modal');
  const settingsController = new window.DataXAssistant.SettingsModal(panel, settingsModalEl, {
    activateTab: (tabId) => activateTab(tabId),
    mountTabs: () => mountTabs()
  });
  window.DataXAssistant.settingsController = settingsController;
  window.DataXAssistant.activateTab = activateTab;

  const settingsBtn = document.getElementById('datax-panel-settings-btn');
  if (settingsBtn) settingsBtn.onclick = () => settingsController.open();

  /**
   * 智能助手子窗口选择器列表 (包含偏好设置、DDL预览生成、批量增量配置及各类详情弹窗)
   */
  const SUB_MODAL_SELECTORS = [
    '#datax-settings-modal',
    '#datax-ddl-modal',
    '#datax-increment-modal',
    '.datax-sub-modal',
    'div[id^="datax-"][id$="-modal"]',
    'div[id^="datax-modal-"]'
  ].join(', ');

  /**
   * 暂存挂起的子窗口集合 (用于主面板关闭时休眠，下次重新打开时一并唤醒恢复)
   * 元素结构: { el: HTMLElement, originalDisplay: string }
   */
  let suspendedSubModals = [];

  /**
   * 挂起并隐藏当前打开的所有助手子窗口 (公共方法)
   */
  function suspendActiveSubModals() {
    suspendedSubModals = [];
    const modalEls = document.querySelectorAll(SUB_MODAL_SELECTORS);
    modalEls.forEach(el => {
      // 仅挂起当前处于显示状态且存活于 DOM 中的助手子窗口
      if (el && document.body.contains(el)) {
        const computedDisplay = window.getComputedStyle ? window.getComputedStyle(el).display : el.style.display;
        if (computedDisplay !== 'none') {
          const originalDisplay = el.style.display || computedDisplay || 'flex';
          suspendedSubModals.push({ el, originalDisplay });
          el.style.display = 'none';
        }
      }
    });
  }

  /**
   * 唤醒并恢复之前挂起隐藏的子窗口 (公共方法)
   */
  function resumeSuspendedSubModals() {
    if (!suspendedSubModals || suspendedSubModals.length === 0) return;
    suspendedSubModals.forEach(item => {
      if (item && item.el && document.body.contains(item.el)) {
        item.el.style.display = item.originalDisplay || 'flex';
      }
    });
    suspendedSubModals = [];
  }

  function isCurrentUserAdmin() {
    return Boolean(window.DataXAssistant && window.DataXAssistant.AuthGuard && window.DataXAssistant.AuthGuard.isAdmin());
  }

  function setPanelVisibility(visible) {
    if (!visible) {
      // 当关闭主面板时，将当前打开的子窗口一并休眠挂起
      suspendActiveSubModals();
      panel.style.display = 'none';
      setStorageItem(STORAGE_KEY_PANEL_VISIBLE, '0');
      return;
    }

    const isCurAdmin = isCurrentUserAdmin();
    if (!isCurAdmin) {
      // 普通用户：严禁进入 Tab 1~7 全功能工作台，一律打开库表简易查询
      if (window.DataXAssistant && window.DataXAssistant.NoviceTableQuery) {
        window.DataXAssistant.NoviceTableQuery.openNoviceQueryWorkbench();
      }
      setStorageItem(STORAGE_KEY_PANEL_VISIBLE, '1');
      return;
    }

    // 管理员用户：若此前处于简易查询模式，自动恢复为全功能助手
    if (window.DataXAssistant?.NoviceTableQuery?.isNoviceMode?.()) {
      if (typeof window.DataXAssistant?.NoviceTableQuery?.restoreFullAssistantMode === 'function') {
        window.DataXAssistant.NoviceTableQuery.restoreFullAssistantMode();
      }
    }

    const tabNav = document.getElementById('datax-panel-tab-nav');
    if (tabNav) tabNav.style.display = 'flex';
    const pBtn = document.getElementById('datax-panel-perm-btn');
    if (pBtn) pBtn.style.display = 'inline-flex';
    const sBtn = document.getElementById('datax-panel-settings-btn');
    if (sBtn) sBtn.style.display = 'inline-block';

    panel.style.display = 'flex';
    resumeSuspendedSubModals();
    settingsController.setPanelOpacity(1);
    setStorageItem(STORAGE_KEY_PANEL_VISIBLE, '1');
    if (isUserLoggedIn()) {
      refreshCurrentTabApi();
    }
  }

  const closeBtn = document.getElementById('datax-panel-close');
  if (closeBtn) closeBtn.onclick = () => setPanelVisibility(false);
  const minBtn = document.getElementById('datax-panel-min');
  if (minBtn) minBtn.onclick = () => setPanelVisibility(false);

  const permHeaderBtn = document.getElementById('datax-panel-perm-btn');
  if (permHeaderBtn) {
    const isCurAdmin = isCurrentUserAdmin();
    permHeaderBtn.style.display = isCurAdmin ? 'inline-flex' : 'none';
    permHeaderBtn.onclick = (e) => {
      e.stopPropagation();
      if (window.DataXAssistant && window.DataXAssistant.NoviceTableQuery) {
        window.DataXAssistant.NoviceTableQuery.openRoleTablePermissionModal();
      }
    };
  }

  const settingsHeaderBtn = document.getElementById('datax-panel-settings-btn');
  if (settingsHeaderBtn) {
    const isCurAdmin = isCurrentUserAdmin();
    settingsHeaderBtn.style.display = isCurAdmin ? 'inline-block' : 'none';
  }

  if (badge) {
    badge.onclick = () => {
      const isCurAdmin = isCurrentUserAdmin();
      if (!isCurAdmin) {
        // 普通用户：点击浮动球仅在打开/关闭简易查询之间切换
        if (panel.style.display === 'none') {
          if (window.DataXAssistant && window.DataXAssistant.NoviceTableQuery) {
            window.DataXAssistant.NoviceTableQuery.openNoviceQueryWorkbench();
          }
        } else {
          setPanelVisibility(false);
        }
        return;
      }

      // 管理员用户：若当前正处于简易查询模式，点击浮动球直接切回全功能 Tab 助手
      if (panel.style.display !== 'none' && window.DataXAssistant?.NoviceTableQuery?.isNoviceMode?.()) {
        if (typeof window.DataXAssistant?.NoviceTableQuery?.restoreFullAssistantMode === 'function') {
          window.DataXAssistant.NoviceTableQuery.restoreFullAssistantMode();
        }
        return;
      }
      setPanelVisibility(panel.style.display === 'none');
    };
  }

  // 6. 注册与装配各个 Tab (采用动态发现与公共激活方法，消除重复代码并支持后续扩展新增 Tab)
  const tabContent1 = document.getElementById('datax-tab-content-1');
  const tabContent2 = document.getElementById('datax-tab-content-2');
  const tabContent3 = document.getElementById('datax-tab-content-3');
  const tabContent4 = document.getElementById('datax-tab-content-4');
  const tabContent5 = document.getElementById('datax-tab-content-5');
  const tabContent6 = document.getElementById('datax-tab-content-6');
  const tabContent7 = document.getElementById('datax-tab-content-7');
  const tabContent8 = document.getElementById('datax-tab-content-8');

  /**
   * 重置所有 Tab 按钮及内容容器样式
   * 采用动态 DOM 查询，天然兼容现有 1~6 以及后续扩展的任意数量 Tab
   */
  function resetTabs() {
    const allTabBtns = panel.querySelectorAll('[id^="datax-tab-btn-"]');
    const allTabContents = panel.querySelectorAll('[id^="datax-tab-content-"]');
    allTabBtns.forEach(b => {
      b.style.background = '#fafafa';
      b.style.color = '#606266';
      b.style.borderBottom = '2px solid transparent';
      b.style.fontWeight = 'normal';
      b.classList.remove('active-tab');
    });
    allTabContents.forEach(c => {
      c.style.display = 'none';
    });
  }

  /**
   * 触发当前激活 Tab 对应的后台 API 数据刷新
   * @param {string|number} [targetTab] 目标 Tab 编号
   */
  function refreshCurrentTabApi(targetTab) {
    if (!isUserLoggedIn()) return;
    const activeTab = String(targetTab || getStorageItem(STORAGE_KEY_PANEL_TAB, '1'));
    // 优先动态尝试从命名空间调用业务 Tab 的 refresh 钩子
    const tabModule = window.DataXAssistant?.Tabs?.[`Tab${activeTab}`];
    if (tabModule && typeof tabModule.refresh === 'function') {
      tabModule.refresh();
      return;
    }
    switch (activeTab) {
      case '3':
        window.DataXAssistant?.Tabs?.Tab3?.refresh?.();
        break;
      case '4':
        window.DataXAssistant?.Tabs?.Tab4?.refresh?.();
        break;
      case '5':
        window.DataXAssistant?.Tabs?.Tab5?.refresh?.();
        break;
      case '6':
        window.DataXAssistant?.Tabs?.Tab6?.refresh?.();
        break;
      case '7':
        window.DataXAssistant?.Tabs?.Tab7?.loadTaskList?.();
        break;
      default:
        break;
    }
  }

  /**
   * 激活指定 Tab 的统一公共方法
   * 消除重复代码，天然支持后续动态新增的 Tab (Tab 7, 8, ...)
   *
   * @param {string|number} tabId Tab 标识或编号
   * @return {boolean} 是否成功激活
   */
  function activateTab(tabId) {
    const isCurAdmin = isCurrentUserAdmin();
    if (!isCurAdmin) {
      // 普通用户无权激活任何全功能 Tab，直接转入库表简易查询
      if (window.DataXAssistant && window.DataXAssistant.NoviceTableQuery) {
        window.DataXAssistant.NoviceTableQuery.openNoviceQueryWorkbench();
      }
      return false;
    }

    // 管理员若此前处于简易查询模式，先退出并展示 Tab 导航
    if (window.DataXAssistant?.NoviceTableQuery?.isNoviceMode?.()) {
      if (typeof window.DataXAssistant?.NoviceTableQuery?.restoreFullAssistantMode === 'function') {
        window.DataXAssistant.NoviceTableQuery.restoreFullAssistantMode();
      }
    }
    const tabNav = document.getElementById('datax-panel-tab-nav');
    if (tabNav && tabNav.style.display === 'none') {
      tabNav.style.display = 'flex';
    }

    const tabNum = String(tabId);
    let targetBtn = document.getElementById(`datax-tab-btn-${tabNum}`);
    let targetContent = document.getElementById(`datax-tab-content-${tabNum}`);

    // 若未直接按 ID 命中，尝试按 DOM 出现顺序匹配（兼容未来扩展）
    if (!targetBtn) {
      const allBtns = panel.querySelectorAll('[id^="datax-tab-btn-"]');
      const idx = parseInt(tabNum, 10) - 1;
      if (allBtns && allBtns[idx]) {
        targetBtn = allBtns[idx];
        const match = targetBtn.id.match(/^datax-tab-btn-(.+)$/);
        if (match) {
          targetContent = document.getElementById(`datax-tab-content-${match[1]}`);
        }
      }
    }

    // 校验：若按钮不存在或处于隐藏状态 (如 Tab 7 隐藏)，则不允许激活
    if (!targetBtn || targetBtn.style.display === 'none') return false;

    // 若目标 Tab 尚未挂载实例，支持按需懒加载初始化 (针对未来动态解除隐藏场景)
    if (tabNum === '8' && window.DataXAssistant?.Tabs?.Tab8Class && !window.DataXAssistant?.Tabs?.Tab8Instance && targetContent) {
      const tabs = window.DataXAssistant.Tabs;
      tabs.Tab8Instance = new tabs.Tab8Class(targetContent);
      tabs.Tab8Instance.init?.();
      tabs.Tab8 = tabs.Tab8Instance;
    }
    if (tabNum === '7' && window.DataXAssistant?.Tabs?.Tab7Class && !window.DataXAssistant?.Tabs?.Tab7Instance && targetContent) {
      const tabs = window.DataXAssistant.Tabs;
      tabs.Tab7Instance = new tabs.Tab7Class(targetContent);
      tabs.Tab7Instance.init?.();
      tabs.Tab7 = tabs.Tab7Instance;
    }

    resetTabs();

    targetBtn.style.background = '#fff';
    targetBtn.style.color = '#1890ff';
    targetBtn.style.borderBottom = '2px solid #1890ff';
    targetBtn.style.fontWeight = 'bold';
    targetBtn.classList.add('active-tab');

    if (targetContent) {
      if (tabNum === '1' || tabNum === '2') {
        targetContent.style.display = 'block';
      } else {
        targetContent.style.display = 'flex';
        targetContent.style.flexDirection = 'column';
      }
    }

    setStorageItem(STORAGE_KEY_PANEL_TAB, tabNum);
    refreshCurrentTabApi(tabNum);
    return true;
  }

  /**
   * 统一为所有现存及后续新增的 Tab 按钮绑定点击事件
   */
  function bindTabEvents() {
    const nav = panel.querySelector('#datax-panel-tab-nav');
    if (nav && !nav.__wheel_bound__) {
      nav.__wheel_bound__ = true;
      nav.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          nav.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }
    const allTabBtns = panel.querySelectorAll('[id^="datax-tab-btn-"]');
    allTabBtns.forEach(btn => {
      btn.onclick = () => {
        const match = btn.id.match(/^datax-tab-btn-(.+)$/);
        if (match) {
          activateTab(match[1]);
        }
      };
    });
  }
  bindTabEvents();

  /**
   * 快捷键按数字切换 Tab（支持自动唤醒主面板并直达对应 Tab）
   * @param {number} num 选项卡序号
   * @return {boolean} 是否成功切换
   */
  function switchTabByNumber(num) {
    const isCurAdmin = isCurrentUserAdmin();
    if (!isCurAdmin) {
      if (panel.style.display === 'none') {
        if (window.DataXAssistant && window.DataXAssistant.NoviceTableQuery) {
          window.DataXAssistant.NoviceTableQuery.openNoviceQueryWorkbench();
        }
      }
      return false;
    }

    if (panel.style.display === 'none') {
      setPanelVisibility(true);
    } else if (window.DataXAssistant?.NoviceTableQuery?.isNoviceMode?.()) {
      if (typeof window.DataXAssistant?.NoviceTableQuery?.restoreFullAssistantMode === 'function') {
        window.DataXAssistant.NoviceTableQuery.restoreFullAssistantMode();
      }
    }
    return activateTab(num);
  }

  // 7. 初始化各业务 Tab
  function mountTabs() {
    window.DataXAssistant = window.DataXAssistant || {};
    window.DataXAssistant.Tabs = window.DataXAssistant.Tabs || {};
    const tabs = window.DataXAssistant.Tabs;

    if (tabs.Tab1Class && !tabs.Tab1Instance && tabContent1) {
      tabs.Tab1Instance = new tabs.Tab1Class(tabContent1);
      tabs.Tab1Instance.init?.();
      tabs.Tab1 = tabs.Tab1Instance;
    }
    if (tabs.Tab2Class && !tabs.Tab2Instance && tabContent2) {
      tabs.Tab2Instance = new tabs.Tab2Class(tabContent2);
      tabs.Tab2Instance.init?.();
      tabs.Tab2 = tabs.Tab2Instance;
    }
    if (tabs.Tab3Class && !tabs.Tab3Instance && tabContent3) {
      tabs.Tab3Instance = new tabs.Tab3Class(tabContent3);
      tabs.Tab3Instance.init?.();
      tabs.Tab3 = tabs.Tab3Instance;
    }
    if (tabs.Tab4Class && !tabs.Tab4Instance && tabContent4) {
      tabs.Tab4Instance = new tabs.Tab4Class(tabContent4);
      tabs.Tab4Instance.init?.();
      tabs.Tab4 = tabs.Tab4Instance;
    }
    if (tabs.Tab5Class && !tabs.Tab5Instance && tabContent5) {
      tabs.Tab5Instance = new tabs.Tab5Class(tabContent5);
      tabs.Tab5Instance.init?.();
      tabs.Tab5 = tabs.Tab5Instance;
    }
    if (tabs.Tab6Class && !tabs.Tab6Instance && tabContent6) {
      tabs.Tab6Instance = new tabs.Tab6Class(tabContent6);
      tabs.Tab6Instance.init?.();
      tabs.Tab6 = tabs.Tab6Instance;
    }
    const tabBtn8 = document.getElementById('datax-tab-btn-8');
    const isTab8Visible = tabBtn8 && tabBtn8.style.display !== 'none';
    if (tabs.Tab8Class && !tabs.Tab8Instance && tabContent8 && isTab8Visible) {
      tabs.Tab8Instance = new tabs.Tab8Class(tabContent8);
      tabs.Tab8Instance.init?.();
      tabs.Tab8 = tabs.Tab8Instance;
    }
    const tabBtn7 = document.getElementById('datax-tab-btn-7');
    const isTab7Visible = tabBtn7 && tabBtn7.style.display !== 'none';
    if (tabs.Tab7Class && !tabs.Tab7Instance && tabContent7 && isTab7Visible) {
      tabs.Tab7Instance = new tabs.Tab7Class(tabContent7);
      tabs.Tab7Instance.init?.();
      tabs.Tab7 = tabs.Tab7Instance;
    }
  }
  mountTabs();
  window.DataXAssistant.mountTabs = mountTabs;

  // 7.5 应用保存的 Tab 显隐配置
  if (settingsController && typeof settingsController.applyTabVisibility === 'function') {
    settingsController.applyTabVisibility(settingsController.getVisibleTabs(), false);
  }

  // 恢复上次激活的 Tab (仅管理员激活 Tab，普通用户保持简易查询)
  if (isCurrentUserAdmin()) {
    const savedTab = getStorageItem(STORAGE_KEY_PANEL_TAB, '1');
    if (!activateTab(savedTab)) {
      const visibleTabs = (settingsController && typeof settingsController.getVisibleTabs === 'function')
        ? settingsController.getVisibleTabs()
        : ['1'];
      const fallbackTab = visibleTabs[0] || '1';
      activateTab(fallbackTab);
    }
  }

  // 8. 注册全局快捷键管理器 (Alt+` 打开/收起, Esc 退出, Alt+1~9 切换Tab)
  if (window.DataXAssistant.ShortcutManager) {
    window.DataXAssistant.shortcutManager = new window.DataXAssistant.ShortcutManager({
      togglePanel: () => {
        const isCurAdmin = isCurrentUserAdmin();
        if (!isCurAdmin) {
          if (panel.style.display === 'none') {
            if (window.DataXAssistant && window.DataXAssistant.NoviceTableQuery) {
              window.DataXAssistant.NoviceTableQuery.openNoviceQueryWorkbench();
            }
          } else {
            setPanelVisibility(false);
          }
          return;
        }

        if (panel.style.display !== 'none' && window.DataXAssistant?.NoviceTableQuery?.isNoviceMode?.()) {
          if (typeof window.DataXAssistant?.NoviceTableQuery?.restoreFullAssistantMode === 'function') {
            window.DataXAssistant.NoviceTableQuery.restoreFullAssistantMode();
          }
          return;
        }
        setPanelVisibility(panel.style.display === 'none');
      },
      closePanel: () => setPanelVisibility(false),
      switchTab: (num) => switchTabByNumber(num),
      isPanelVisible: () => panel.style.display !== 'none',
      canCloseOnEsc: () => {
        // 1. 如果当前设置弹窗处于打开状态，按 Esc 优先关闭设置弹窗而非关闭主面板
        if (settingsModalEl && settingsModalEl.style.display !== 'none') {
          settingsController.close();
          return false;
        }

        // 2. 检测是否存在打开的子模态窗口/详情预览弹窗，按 Esc 优先关闭最顶层子窗口，避免误触关闭助手主面板
        //    注意: 多个弹窗并存时按最后插入 (即最顶层、z-index 最大) 的元素优先关闭 (历史->详情 层级场景)
        const subModals = Array.from(document.querySelectorAll('#datax-ddl-modal, .datax-sub-modal, div[id$="-modal"]:not(#datax-settings-modal)'))
          .filter(m => m.style.display !== 'none' && document.body.contains(m));
        if (subModals.length > 0) {
          const activeSubModal = subModals[subModals.length - 1];
          const closeBtn = activeSubModal.querySelector('#datax-ddl-close, #datax-ddl-cancel-btn, [id*="close"], [id*="cancel"], .close-btn');
          if (closeBtn && typeof closeBtn.click === 'function') {
            closeBtn.click();
          } else {
            activeSubModal.remove();
          }
          return false;
        }

        return true;
      }
    });
  }

  // 暴露公共控制方法至全局命名空间
  window.DataXAssistant.activateTab = activateTab;
  window.DataXAssistant.switchTab = switchTabByNumber;
  window.DataXAssistant.setPanelVisibility = setPanelVisibility;
  window.DataXAssistant.bindTabEvents = bindTabEvents;

  // 8. 启动 NativeToolbar
  if (window.DataXAssistant.NativeToolbar) {
    window.DataXAssistant.NativeToolbar.init();
  }

  // 9. 登录态同步监听
  let hasAppliedSavedVisibilityOnLogin = false;
  function syncAssistantLoginState() {
    const loggedIn = isUserLoggedIn();
    if (loggedIn) {
      if (badge) badge.style.display = 'block';
      if (!hasAppliedSavedVisibilityOnLogin) {
        hasAppliedSavedVisibilityOnLogin = true;
        const shouldBeVisible = getStorageItem(STORAGE_KEY_PANEL_VISIBLE, '0') === '1';
        if (shouldBeVisible) {
          setPanelVisibility(true);
        }
      }
    } else {
      if (panel) panel.style.display = 'none';
      if (badge) badge.style.display = 'none';
      hasAppliedSavedVisibilityOnLogin = false;
    }
  }

  setInterval(syncAssistantLoginState, 1000);
  syncAssistantLoginState();

  // 10. 侧边栏与顶部导航快捷入口
  // ==========================================
  const SIDEBAR_ITEM_ID = 'datax-sidebar-table-data-menu-item';
  const SIDEBAR_STAT_ITEM_ID = 'datax-sidebar-stat-task-menu-item';
  const NAVBAR_BTN_ID = 'datax-navbar-table-data-btn';
  const NAVBAR_STAT_BTN_ID = 'datax-navbar-stat-task-btn';

  function injectNavigationShortcuts() {
    // 彻底移除【统计计算任务】与【库表数据浏览/预览】菜单及导航按钮
    const existingSideItem = document.getElementById(SIDEBAR_ITEM_ID);
    if (existingSideItem) existingSideItem.remove();
    const existingStatItem = document.getElementById(SIDEBAR_STAT_ITEM_ID);
    if (existingStatItem) existingStatItem.remove();
    const existingNavBtn = document.getElementById(NAVBAR_BTN_ID);
    if (existingNavBtn) existingNavBtn.remove();
    const existingStatNavBtn = document.getElementById(NAVBAR_STAT_BTN_ID);
    if (existingStatNavBtn) existingStatNavBtn.remove();
  }

  setInterval(injectNavigationShortcuts, 800);

  // 11. 原生表格复制按钮注入
(function setupNativeTableCopyBtn() {
  function injectCopyButtons() {
      if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) return;
    if (!window.location?.hash || !window.location.hash.toLowerCase().includes('jobinfo')) {
      return;
    }
    const tables = document.querySelectorAll('.el-table__body-wrapper table');
    tables.forEach(table => {
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(tr => {
        if (tr.querySelector('.datax-native-copy-btn')) return;
        const cells = tr.querySelectorAll('td');
        if (cells.length < 3) return;
        let id = NaN;
        for (let i = 0; i < Math.min(3, cells.length); i++) {
          const num = parseInt(cells[i].textContent.trim(), 10);
          if (!isNaN(num) && num > 0) {
            id = num;
            break;
          }
        }
        if (isNaN(id) || id <= 0) return;

        const actionCell = tr.querySelector('td:last-child');
        if (!actionCell) return;
        const dropdown = actionCell.querySelector('.el-dropdown');
        if (!dropdown) return;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'el-button el-button--mini el-button--info datax-native-copy-btn';
        copyBtn.type = 'button';
        copyBtn.style.cssText = 'margin-left: 6px; padding: 5px 8px; font-size: 11px;';
        copyBtn.title = '复制任务（保留原配置并复用已加密密码，无需再次加密）';
        copyBtn.innerHTML = '<span>复制</span>';
        copyBtn.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`确认复制任务 ID:${id} 吗？`)) return;
          try {
            copyBtn.disabled = true;
            copyBtn.innerText = '复制中...';
            const headers = window.DataXCommon && window.DataXCommon.Http
              ? window.DataXCommon.Http.getAuthHeaders()
              : { 'Content-Type': 'application/json' };
            const resp = await fetch(`/api/job/copy/${id}`, { method: 'POST', headers });
            const res = await resp.json();
            if (res.code === 200 || res.code === 0) {
              alert(`✅ 任务 ID:${id} 复制成功！新任务 ID: ${res.content}`);
              const searchBtn = document.querySelector('.filter-container .el-button--primary');
              if (searchBtn) searchBtn.click();
            } else {
              alert('复制失败: ' + (res.msg || res.message || '未知错误'));
            }
          } catch (err) {
            alert('复制请求异常: ' + err.message);
          } finally {
            copyBtn.disabled = false;
            copyBtn.innerHTML = '<span>复制</span>';
          }
        };
        dropdown.parentNode.insertBefore(copyBtn, dropdown.nextSibling);
      });
    });
  }
  setInterval(injectCopyButtons, 1500);
})();


  // 12. 全局批量构建增量参数请求拦截
(function setupBatchAddIncrementInterceptor() {
    function injectEnhancedBatchParamsToBody(bodyStr) {
    if (!bodyStr || typeof bodyStr !== 'string') return bodyStr;
    try {
        const bodyObj = JSON.parse(bodyStr);

        // 1. 注入方案1：时间增量同步参数
      const incToggle = document.getElementById('datax-native-increment-toggle');
      if (incToggle && incToggle.checked) {
        bodyObj.isIncrement = true;
        const colInput = document.getElementById('datax-native-inc-col');
        bodyObj.timeColumn = colInput && colInput.value.trim() ? colInput.value.trim() : 'update_time';
        const timeInput = document.getElementById('datax-native-inc-time');
        if (timeInput && timeInput.value.trim()) {
          bodyObj.incStartTime = timeInput.value.trim();
        }
        const modeSelect = document.getElementById('datax-native-inc-writemode');
        bodyObj.writeMode = modeSelect ? modeSelect.value : 'replace';
        }

        // 2. 注入任务名称个性化规则参数（与表名前缀完全分开控制）
        const jobPrefix = document.getElementById('datax-native-job-prefix');
        if (jobPrefix && jobPrefix.value.trim()) {
          bodyObj.jobNamePrefix = jobPrefix.value.trim();
        }
        const jobSuffix = document.getElementById('datax-native-job-suffix');
        if (jobSuffix && jobSuffix.value.trim()) {
          bodyObj.jobNameSuffix = jobSuffix.value.trim();
        }
        const jobRule = document.getElementById('datax-native-job-rule');
        if (jobRule && jobRule.value) {
          bodyObj.jobNameRule = jobRule.value;
        }

        return JSON.stringify(bodyObj);
    } catch (e) {
        console.warn('注入批量构建参数失败:', e);
    }
    return bodyStr;
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
      if ((url.includes('/api/job/batchAdd') || url.includes('/api/job/batchAddWithMapping')) && args[1] && args[1].body) {
          args[1].body = injectEnhancedBatchParamsToBody(args[1].body);
      }
    } catch (e) { }
    return origFetch.apply(this, args);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._requestUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this._requestUrl && (this._requestUrl.includes('/api/job/batchAdd') || this._requestUrl.includes('/api/job/batchAddWithMapping'))) {
          body = injectEnhancedBatchParamsToBody(body);
      }
    } catch (e) { }
    return origSend.call(this, body);
  };
})();


  window.DataXAssistant.App = {
    setPanelVisibility,
    refreshCurrentTabApi,
    windowManager,
    settingsController
  };
})();
