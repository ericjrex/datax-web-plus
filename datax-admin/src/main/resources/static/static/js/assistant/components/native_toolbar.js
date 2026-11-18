/**
 * @fileoverview Step 3 原生界面工具栏注入器 (NativeToolbar)
 * 动态在 DataX Web 原生任务构建向导步骤 3 注入批量表名前后缀与智能建表映射工作台。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};

  const INJECTED_STEP3_TOOLBAR_ID = 'datax-injected-step3-toolbar';
  let nativeCurrentMappings = [];

  function getCommon() {
    return window.DataXCommon || {};
  }

  function getHttp() {
    return getCommon().Http || {};
  }

  function getNotice() {
    return getCommon().Notice || {};
  }

  function alert(msg) {
    if (getNotice().alert) return getNotice().alert(msg);
    window.alert(msg);
  }

  function confirm(content) {
    if (getNotice().confirm) return getNotice().confirm(content);
    return Promise.resolve(window.confirm(content));
  }

  /**
   * 表名规则转换计算
   *
   * @param {string} srcName 原始表名
   * @param {Object} rule 规则配置
   * @return {string} 转换后表名
   */
  function transformTableName(srcName, rule) {
    let name = (srcName || '').trim();
    if (!name) return '';

    if (rule.caseType === 'LOWER') {
      name = name.toLowerCase();
    } else if (rule.caseType === 'UPPER') {
      name = name.toUpperCase();
    } else if (rule.caseType === 'CAMEL_TO_UNDERLINE') {
      name = name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    } else if (rule.caseType === 'UNDERLINE_TO_CAMEL') {
      name = name.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    if (rule.replaceFrom) {
      const reg = new RegExp(rule.replaceFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      name = name.replace(reg, rule.replaceTo || '');
    }

    const prefix = rule.prefix || '';
    const suffix = rule.suffix || '';
    return `${prefix}${name}${suffix}`;
  }

  /**
   * 获取原生 JsonBuild Vue 根实例与各步骤组件
   */
  function getJsonBuildContext() {
    let jsonBuildComp = null;
    const allElems = document.querySelectorAll('*');
    for (let i = 0; i < allElems.length; i++) {
      const v = allElems[i].__vue__;
      if (v && v.$options && v.$options.name === 'JsonBuild') {
        jsonBuildComp = v;
        break;
      }
    }

    if (!jsonBuildComp) return null;

    const readerRef = jsonBuildComp.$refs.reader;
    const writerRef = jsonBuildComp.$refs.writer;
    const mapperRef = jsonBuildComp.$refs.mapper;

    const tableReader = readerRef ? readerRef.$refs.tablereader : null;
    const tableWriter = writerRef ? writerRef.$refs.tablewriter : null;
    const tableMapper = mapperRef ? mapperRef.$refs.mapper : null;

    return {
      jsonBuildComp,
      activeStep: jsonBuildComp.active,
      readerRef,
      writerRef,
      mapperRef,
      tableReader,
      tableWriter,
      tableMapper,
      readerForm: tableReader ? tableReader.readerForm : null,
      writerForm: tableWriter ? tableWriter.writerForm : null,
      mapperForm: tableMapper ? tableMapper.readerForm : null
    };
  }

  /**
   * 从 Vue 内存组件及 DOM 中提取数据源列表
   */
  function getDatasourceListFromMemory() {
    const ctx = getJsonBuildContext();
    const map = new Map();

    if (ctx && ctx.tableReader && Array.isArray(ctx.tableReader.rDsList) && ctx.tableReader.rDsList.length > 0) {
      ctx.tableReader.rDsList.forEach(ds => {
        if (ds && ds.id) map.set(ds.id, ds);
      });
    }

    if (ctx && ctx.tableWriter && Array.isArray(ctx.tableWriter.wDsList) && ctx.tableWriter.wDsList.length > 0) {
      ctx.tableWriter.wDsList.forEach(ds => {
        if (ds && ds.id) map.set(ds.id, ds);
      });
    }

    // 从已有下拉框缓存提取
    const readSel = document.getElementById('datax-native-reader-ds');
    if (readSel) {
      Array.from(readSel.options).forEach(opt => {
        if (opt.value) {
          const id = parseInt(opt.value, 10);
          if (!map.has(id)) map.set(id, { id, datasourceName: opt.text });
        }
      });
    }

    return Array.from(map.values());
  }

  /**
   * 获取当前选中的源端与目标端数据源 ID
   */
  function getDatasourceIds() {
    let readerDsId = null;
    let writerDsId = null;
    const ctx = getJsonBuildContext();

    if (ctx) {
      if (ctx.readerForm && ctx.readerForm.datasourceId) readerDsId = ctx.readerForm.datasourceId;
      if (ctx.writerForm && ctx.writerForm.datasourceId) writerDsId = ctx.writerForm.datasourceId;
      if (!readerDsId && ctx.tableReader && ctx.tableReader.rDsList && ctx.tableReader.rDsList.length === 1) {
        readerDsId = ctx.tableReader.rDsList[0].id;
      }
      if (!writerDsId && ctx.tableWriter && ctx.tableWriter.wDsList && ctx.tableWriter.wDsList.length === 1) {
        writerDsId = ctx.tableWriter.wDsList[0].id;
      }
    }

    const readSel = document.getElementById('datax-native-reader-ds');
    const writeSel = document.getElementById('datax-native-writer-ds');
    if (readSel && readSel.value) readerDsId = parseInt(readSel.value, 10);
    if (writeSel && writeSel.value) writerDsId = parseInt(writeSel.value, 10);

    return { readerDsId, writerDsId };
  }

  /**
   * 填充数据源下拉选择框
   */
  function populateDatasourceDropdowns() {
    const list = getDatasourceListFromMemory();
    const readSel = document.getElementById('datax-native-reader-ds');
    const writeSel = document.getElementById('datax-native-writer-ds');
    if (!readSel || !writeSel) return;

    const ctx = getJsonBuildContext();
    const detectedReaderId = ctx && ctx.readerForm ? ctx.readerForm.datasourceId : null;
    const detectedWriterId = ctx && ctx.writerForm ? ctx.writerForm.datasourceId : null;

    const fillSelect = (sel, detectedId, defaultPlaceholder) => {
      const curVal = sel.value;
      sel.innerHTML = `<option value="">-- ${defaultPlaceholder} --</option>`;
      list.forEach(ds => {
        const opt = document.createElement('option');
        opt.value = ds.id;
        opt.textContent = `${ds.datasourceName || ds.name || '未命名'} (ID: ${ds.id})`;
        sel.appendChild(opt);
      });
      if (detectedId && Array.from(sel.options).some(o => o.value == detectedId)) {
        sel.value = detectedId;
      } else if (curVal && Array.from(sel.options).some(o => o.value == curVal)) {
        sel.value = curVal;
      }
    };

    fillSelect(readSel, detectedReaderId, '请选择源端数据源 (Reader)');
    fillSelect(writeSel, detectedWriterId, '请选择目标端数据源 (Writer)');

    const readTag = document.getElementById('datax-reader-ds-tag');
    const writeTag = document.getElementById('datax-writer-ds-tag');
    if (readTag) readTag.textContent = readSel.value ? `ID: ${readSel.value}` : '未指定';
    if (writeTag) writeTag.textContent = writeSel.value ? `ID: ${writeSel.value}` : '未指定';
  }

  /**
   * 注入 Step 3 原生工具栏
   */
  function injectStep3NativeToolbar() {
    const existingToolbar = document.getElementById(INJECTED_STEP3_TOOLBAR_ID);
    if (existingToolbar) {
      existingToolbar.style.display = 'block';
      populateDatasourceDropdowns();
      return;
    }

    const step3 = document.querySelector('.step3');
    if (!step3) return;

    const toolbar = document.createElement('div');
    toolbar.id = INJECTED_STEP3_TOOLBAR_ID;
    toolbar.style.cssText = `
      background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%);
      border: 1px solid #91d5ff;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 18px;
      box-shadow: 0 2px 8px rgba(24, 144, 255, 0.08);
      font-size: 13px;
    `;

    toolbar.innerHTML = `
      <div style="font-weight: bold; color: #096dd9; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 14px;">目标表批量自定义前后缀与智能建表映射工作台</span>
        <span style="font-size: 11px; background: #e6f7ff; color: #1890ff; padding: 2px 8px; border-radius: 4px; border: 1px solid #91d5ff;">解决读写表数量不一致 & 目标库自动建表</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; background: #ffffff; padding: 10px; border-radius: 6px; border: 1px solid #d9e8ff;">
        <div>
          <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 4px;">
            源端数据源 (Reader): <span id="datax-reader-ds-tag" style="color: #1890ff; font-weight: normal;">检测中...</span>
          </label>
          <select id="datax-native-reader-ds" style="width: 100%; padding: 6px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;"></select>
        </div>
        <div>
          <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 4px;">
            目标端数据源 (Writer): <span id="datax-writer-ds-tag" style="color: #52c41a; font-weight: normal;">检测中...</span>
          </label>
          <select id="datax-native-writer-ds" style="width: 100%; padding: 6px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;"></select>
        </div>
      </div>

      <div style="background: #f7faff; padding: 8px 12px; border-radius: 6px; border: 1px solid #b7d6ec; margin-bottom: 8px;">
        <div style="font-size: 12px; font-weight: bold; color: #096dd9; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
          <span>目标表名 (Writer Table) 命名规则 <span style="font-weight: normal; color: #666; font-size: 11px;">(作用于目标库建表与表映射，不污染任务名)</span></span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          <div>
            <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 3px;">表名前缀 (Prefix):</label>
            <input type="text" id="datax-native-prefix" placeholder="例如: ods_" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;" />
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 3px;">表名词缀 (Suffix):</label>
            <input type="text" id="datax-native-suffix" placeholder="例如: _df" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;" />
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 3px;">字符替换 (查找 ➔ 替换为):</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="datax-native-replace-from" placeholder="查找 t_" style="width: 50%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;" />
              <input type="text" id="datax-native-replace-to" placeholder="替换为空" style="width: 50%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;" />
            </div>
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 3px;">大小写转换:</label>
            <select id="datax-native-case" style="width: 100%; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;">
              <option value="ORIGINAL">保持原样 (ORIGINAL)</option>
              <option value="LOWER">全部转小写 (LOWER)</option>
              <option value="UPPER">全部转大写 (UPPER)</option>
              <option value="CAMEL_TO_UNDERLINE">驼峰转下划线 (camel_to_underline)</option>
              <option value="UNDERLINE_TO_CAMEL">下划线转驼峰 (underlineToCamel)</option>
            </select>
          </div>
        </div>
      </div>

      <div style="background: #fdfaf5; padding: 8px 12px; border-radius: 6px; border: 1px solid #ffe7ba; margin-bottom: 10px;">
        <div style="font-size: 12px; font-weight: bold; color: #d46b08; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
          <span>任务名称 (Job Name) 个性化命名规则 <span style="font-weight: normal; color: #8c6b33; font-size: 11px;">(与表名前缀完全分开控制，决定最终生成的任务描述 job_desc)</span></span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 10px;">
          <div>
            <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 3px;">任务名前缀 (Job Prefix):</label>
            <input type="text" id="datax-native-job-prefix" placeholder="例如: dev_ 或 [JOB]-" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;" />
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 3px;">任务名词缀 (Job Suffix):</label>
            <input type="text" id="datax-native-job-suffix" placeholder="例如: _sync 或 _增量" style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;" />
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 600; color: #333; display: block; margin-bottom: 3px;">任务名命名基准规则:</label>
            <select id="datax-native-job-rule" style="width: 100%; padding: 5px 8px; font-size: 12px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff;">
              <option value="READER_TABLE">基于源表名 (默认: [前缀]源表名[词缀])</option>
              <option value="WRITER_TABLE">基于目标表名 ([前缀]目标表名[词缀])</option>
              <option value="READER_TO_WRITER">基于映射关系 ([前缀]源表 ➔ 目标表[词缀])</option>
            </select>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button id="datax-native-apply-btn" style="background: #1890ff; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px; box-shadow: 0 2px 6px rgba(24, 144, 255, 0.3);">
          批量应用规则并自动 1:1 勾选目标表
        </button>
        <button id="datax-native-autobuild-btn" style="background: #52c41a; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px; box-shadow: 0 2px 6px rgba(82, 196, 26, 0.3);">
          智能推导字段映射与自动建表 (Auto-Build)
        </button>
        <label style="display: inline-flex; align-items: center; gap: 4px; color: #096dd9; font-weight: 600; cursor: pointer; font-size: 12px;">
          <input type="checkbox" id="datax-native-auto-create-toggle" checked style="cursor: pointer;" />
          推导后若表不存在直接建表
        </label>
        <span id="datax-native-tip" style="font-size: 12px; color: #52c41a; font-weight: bold;"></span>
      </div>

      <!-- 智能映射列表与 DDL 预览卡片 -->
      <div id="datax-native-mapping-box" style="display: none; margin-top: 12px; background: #fff; border: 1px solid #d9d9d9; border-radius: 6px; padding: 10px;">
        <div style="font-weight: bold; margin-bottom: 6px; color: #333; display: flex; justify-content: space-between; align-items: center;">
          <span>智能表映射关系与 DDL 执行状态：</span>
          <button id="datax-native-batch-ddl-btn" style="background: #fa8c16; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">
            🚀 执行批量建表 DDL
          </button>
        </div>
        <div id="datax-native-mapping-list" style="max-height: 220px; overflow-y: auto; font-size: 12px;"></div>
      </div>
    `;

    const step3Container = step3.querySelector('.app-container') || step3;
    step3Container.prepend(toolbar);
    populateDatasourceDropdowns();

    // 绑定事件
    document.getElementById('datax-native-apply-btn').onclick = applyPrefixSuffixToNativeStep3;
    document.getElementById('datax-native-autobuild-btn').onclick = () => {
      const autoCreate = document.getElementById('datax-native-auto-create-toggle')?.checked;
      autoBuildAndCreateTableNative(autoCreate);
    };
    document.getElementById('datax-native-batch-ddl-btn').onclick = () => executeBatchDDLNative(false);

    ['datax-native-job-prefix', 'datax-native-job-suffix'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', refreshJobNamePreviews);
    });
    const jobRuleEl = document.getElementById('datax-native-job-rule');
    if (jobRuleEl) jobRuleEl.addEventListener('change', refreshJobNamePreviews);
  }

  /**
   * 将目标表列表同步注入原生步骤 3 的 TableMapper 组件中
   * 更新 toTablesList 候选列表并 1:1 勾选 rtables，触发原生 Vue 响应式更新与界面重绘
   *
   * @param {Array<string>} targetTables 目标表名列表
   */
  function syncTargetTablesToNativeTableMapper(targetTables) {
    if (!Array.isArray(targetTables) || targetTables.length === 0) return;

    const ctx = getJsonBuildContext();
    if (!ctx || !ctx.tableMapper) return;

    const mapper = ctx.tableMapper;

    // 1. 合并填充原生目标端备选表列表 (toTablesList)
    const existingTo = Array.isArray(mapper.toTablesList) ? mapper.toTablesList : [];
    const mergedTo = Array.from(new Set([...existingTo, ...targetTables]));
    mapper.$set(mapper, 'toTablesList', mergedTo);

    // 2. 将目标表全量 1:1 勾选入 readerForm.rtables
    if (mapper.readerForm) {
      mapper.$set(mapper.readerForm, 'rtables', [...targetTables]);
      mapper.readerForm.rcheckAll = (targetTables.length >= mergedTo.length && mergedTo.length > 0);
      mapper.readerForm.isIndeterminate = (!mapper.readerForm.rcheckAll && targetTables.length > 0);

      // 触发原生组件勾选联动逻辑
      if (typeof mapper.rHandleCheckedChange === 'function') {
        mapper.rHandleCheckedChange([...targetTables]);
      }
    }

    // 3. 确保源端表也处于全选状态
    if (mapper.readerForm && ctx.readerForm && Array.isArray(ctx.readerForm.tables)) {
      if (!Array.isArray(mapper.readerForm.ltables) || mapper.readerForm.ltables.length === 0) {
        mapper.$set(mapper.readerForm, 'ltables', [...ctx.readerForm.tables]);
      }
    }

    // 4. 同步更新步骤 2 Writer 表单已选表列表
    if (ctx.tableWriter && ctx.tableWriter.writerForm) {
      const curW = Array.isArray(ctx.tableWriter.writerForm.tables) ? ctx.tableWriter.writerForm.tables : [];
      const mergedW = Array.from(new Set([...curW, ...targetTables]));
      ctx.tableWriter.$set(ctx.tableWriter.writerForm, 'tables', mergedW);
    }

    // 5. 触发 Element-UI 复选框组组件事件与样式同步
    const cbGroups = document.querySelectorAll('.step3 .el-checkbox-group');
    if (cbGroups.length >= 2 && cbGroups[1].__vue__) {
      cbGroups[1].__vue__.$emit('input', targetTables);
      cbGroups[1].__vue__.$emit('change', targetTables);
    }

    // 6. 强制 Vue 组件实例重绘视图
    if (typeof mapper.$forceUpdate === 'function') {
      mapper.$forceUpdate();
    }

    // 7. 微任务二次确保 DOM 类名与 input checkbox 状态被激活
    setTimeout(() => {
      const cbs = document.querySelectorAll('.step3 .el-form-item:nth-child(2) .el-checkbox');
      cbs.forEach((cb) => {
        const input = cb.querySelector('input[type="checkbox"]');
        if (input && targetTables.includes(input.value)) {
          cb.classList.add('is-checked');
          input.checked = true;
        }
      });
    }, 60);
  }

  /**
   * 应用前后缀并自动 1:1 勾选目标表
   */
  async function applyPrefixSuffixToNativeStep3() {
    const ctx = getJsonBuildContext();
    if (!ctx || !ctx.tableMapper) {
      alert('未检测到步骤3表映射组件，请先点击并进入步骤3！');
      return;
    }

    const rule = {
      prefix: document.getElementById('datax-native-prefix').value,
      suffix: document.getElementById('datax-native-suffix').value,
      replaceFrom: document.getElementById('datax-native-replace-from').value,
      replaceTo: document.getElementById('datax-native-replace-to').value,
      caseType: document.getElementById('datax-native-case').value
    };

    const selectedReaderTables = ctx.tableMapper.readerForm.ltables || [];
    if (selectedReaderTables.length === 0) {
      alert('源端未勾选任何表，请先在步骤1勾选需要同步的数据表！');
      return;
    }

    const targetTableNames = selectedReaderTables.map(src => transformTableName(src, rule));

    // 立即向原生步骤 3 注入目标表候选与选中，保证界面实时出现对应新表
    syncTargetTablesToNativeTableMapper(targetTableNames);

    const tip = document.getElementById('datax-native-tip');
    if (tip) {
      tip.textContent = `⚡ 规则应用成功！已为步骤 3 注入并自动勾选 ${targetTableNames.length} 张目标表。`;
      setTimeout(() => { tip.textContent = ''; }, 4000);
    }

    const autoCreate = document.getElementById('datax-native-auto-create-toggle')?.checked;
    await autoBuildAndCreateTableNative(autoCreate);
  }

  /**
   * 智能推导字段并展示 DDL / 自动建表
   */
  async function autoBuildAndCreateTableNative(autoExecute = false) {
    const { readerDsId, writerDsId } = getDatasourceIds();
    const ctx = getJsonBuildContext();
    const selectedTables = ctx && ctx.tableMapper ? ctx.tableMapper.readerForm.ltables : [];

    if (!readerDsId || !writerDsId) {
      alert(`未检测到数据源！\n源端数据源: ${readerDsId || '未获取'}\n目标端数据源: ${writerDsId || '未获取'}\n请在上方的「源端/目标端数据源」下拉框中直接选择！`);
      return;
    }

    const rule = {
      prefix: document.getElementById('datax-native-prefix').value,
      suffix: document.getElementById('datax-native-suffix').value,
      replaceFrom: document.getElementById('datax-native-replace-from').value,
      replaceTo: document.getElementById('datax-native-replace-to').value,
      caseType: document.getElementById('datax-native-case').value
    };

    const btn = document.getElementById('datax-native-autobuild-btn');
    if (btn) {
      btn.textContent = '⏳ 正在分析元数据并推导 DDL...';
      btn.disabled = true;
    }

    try {
      const res = await getHttp().fetchJson('/api/mapping/autoBuild', {
        method: 'POST',
        body: {
          readerDatasourceId: readerDsId,
          readerTables: selectedTables,
          writerDatasourceId: writerDsId,
          namingRule: rule
        }
      });

      if (!getHttp().isApiSuccess(res)) {
        throw new Error(getHttp().getApiMsg(res, '自动构建失败'));
      }

      nativeCurrentMappings = res.data || [];
      renderNativeMappingList(nativeCurrentMappings);
      const mapBox = document.getElementById('datax-native-mapping-box');
      if (mapBox) mapBox.style.display = 'block';

      // 提取推导出的所有目标表名
      const allWriterTables = nativeCurrentMappings.map(m => m.writerTable).filter(Boolean);

      const uncreated = nativeCurrentMappings.filter(m => !m.targetTableExists && m.createTableSql);
      if (uncreated.length > 0 && autoExecute) {
        await executeBatchDDLNative(true);
      } else {
        // 所有表已在目标库存在就绪（如用户截图中全部为“🟢 目标库已存在”）
        syncTargetTablesToNativeTableMapper(allWriterTables);
        const tip = document.getElementById('datax-native-tip');
        if (tip) {
          tip.textContent = `🟢 目标库所有 ${nativeCurrentMappings.length} 张表均已存在就绪，已自动在原生目标表中 1:1 呈现并勾选！`;
        }
      }
    } catch (err) {
      alert('智能推导异常: ' + err.message);
    } finally {
      if (btn) {
        btn.textContent = '智能推导字段映射与自动建表 (Auto-Build)';
        btn.disabled = false;
      }
    }
  }

  function calculatePreviewJobName(readerTable, writerTable) {
    const jobPrefix = (document.getElementById('datax-native-job-prefix')?.value || '').trim();
    const jobSuffix = (document.getElementById('datax-native-job-suffix')?.value || '').trim();
    const jobRule = document.getElementById('datax-native-job-rule')?.value || 'READER_TABLE';

    let baseName = readerTable;
    if (jobRule === 'WRITER_TABLE') {
      baseName = writerTable || readerTable;
    } else if (jobRule === 'READER_TO_WRITER') {
      baseName = `${readerTable} -> ${writerTable || readerTable}`;
    }
    return `${jobPrefix}${baseName}${jobSuffix}`;
  }

  function refreshJobNamePreviews() {
    const listEl = document.getElementById('datax-native-mapping-list');
    if (!listEl || !nativeCurrentMappings || nativeCurrentMappings.length === 0) return;
    const previewBadges = listEl.querySelectorAll('.datax-job-preview-text');
    nativeCurrentMappings.forEach((m, idx) => {
      if (previewBadges[idx]) {
        previewBadges[idx].textContent = calculatePreviewJobName(m.readerTable, m.writerTable);
      }
    });
  }

  function renderNativeMappingList(mappings) {
    const listEl = document.getElementById('datax-native-mapping-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    mappings.forEach((m, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding: 6px 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;';

      const statusBadge = m.targetTableExists
        ? '<span style="color:#52c41a; font-weight:bold;">🟢 目标库已存在</span>'
        : '<span style="color:#fa8c16; font-weight:bold;">🟠 目标库待建表</span>';

      const previewJobDesc = calculatePreviewJobName(m.readerTable, m.writerTable);

      row.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span style="color:#888;">${idx + 1}.</span>
          <span>源表: <code style="color:#1890ff;">${m.readerTable}</code></span>
          <span>➔ 目标表: <code style="color:#52c41a; font-weight:bold;">${m.writerTable}</code></span>
          ${statusBadge}
          <span style="background: #fff7e6; border: 1px solid #ffd591; color: #d46b08; padding: 1px 6px; border-radius: 3px; font-size: 11px;">
            📌 预估任务名: <strong class="datax-job-preview-text">${previewJobDesc}</strong>
          </span>
        </div>
        <div>
          ${m.createTableSql ? `<button class="datax-native-ddl-view" data-index="${idx}" style="background:#e6f7ff; border:1px solid #91d5ff; color:#1890ff; padding:2px 6px; border-radius:3px; font-size:11px; cursor:pointer;">预览 DDL</button>` : ''}
        </div>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.datax-native-ddl-view').forEach((b) => {
      b.onclick = function () {
        const idx = parseInt(this.getAttribute('data-index'), 10);
        const m = nativeCurrentMappings[idx];
        if (m && m.createTableSql) {
          alert(`【目标表 ${m.writerTable} 建表 DDL】：\n\n${m.createTableSql}`);
        }
      };
    });
  }

  async function executeBatchDDLNative(silent = false) {
    const { writerDsId } = getDatasourceIds();
    if (!writerDsId) {
      if (!silent) alert('未获取到目标端数据源 ID，请在上方的「目标端数据源」下拉框中选择！');
      return;
    }

    const uncreated = nativeCurrentMappings.filter(m => !m.targetTableExists && m.createTableSql);
    if (uncreated.length === 0) {
      if (!silent) alert('所有目标表均已在目标数据库中创建！');
      return;
    }

    if (!silent) {
      const ok = await confirm(`确定要在目标库执行 ${uncreated.length} 张表的自动建表 DDL 吗？`);
      if (!ok) return;
    }

    let count = 0;
    for (const m of uncreated) {
      try {
        const res = await getHttp().fetchJson('/api/mapping/executeDDL', {
          method: 'POST',
          body: {
            datasourceId: writerDsId,
            ddlSql: m.createTableSql
          }
        });
        if (getHttp().isApiSuccess(res)) {
          m.targetTableExists = true;
          count++;
        }
      } catch (err) {
        console.error(err);
      }
    }

    renderNativeMappingList(nativeCurrentMappings);

    // 建表完成后，将所有目标表同步注入到原生步骤 3 复选框并自动勾选！
    const allWriterTables = nativeCurrentMappings.map(m => m.writerTable).filter(Boolean);
    syncTargetTablesToNativeTableMapper(allWriterTables);

    const tip = document.getElementById('datax-native-tip');
    if (tip) {
      tip.textContent = `🎉 目标库已成功自动创建 ${count} 张新表！读写表 1:1 且已自动在原生目标表中呈现勾选，请直接进入下一步。`;
      setTimeout(() => { tip.textContent = ''; }, 6000);
    }
    if (!silent) alert(`批量建表完成！成功在目标库创建了 ${count} 张表，已自动在原生目标表中呈现并勾选！`);
  }

  /**
   * 智能同步原生步骤 3 工具栏可见性
   * 确保用户在点击“上一步”返回步骤 2 或切换到其他页面时，工具栏即时隐藏；
   * 当重新进入步骤 3 时，工具栏即时唤醒并更新数据源下拉框。
   */
  function syncStep3ToolbarVisibility() {
    if (window.DataXCommon?.Utils?.isUserLoggedIn && !window.DataXCommon.Utils.isUserLoggedIn()) {
      const tb = document.getElementById(INJECTED_STEP3_TOOLBAR_ID);
      if (tb) tb.style.display = 'none';
      return;
    }

    const ctx = getJsonBuildContext();
    const step3 = document.querySelector('.step3');

    // 双重校验：优先检查 Vue 内部步骤状态，其次检查 DOM 可见性
    let isInStep3 = false;
    if (ctx && typeof ctx.activeStep === 'number') {
      isInStep3 = (ctx.activeStep === 3);
    } else if (step3) {
      isInStep3 = (step3.style.display !== 'none');
    }

    const toolbar = document.getElementById(INJECTED_STEP3_TOOLBAR_ID);

    if (isInStep3 && step3) {
      if (!toolbar) {
        injectStep3NativeToolbar();
      } else {
        toolbar.style.display = 'block';
        populateDatasourceDropdowns();
      }
    } else {
      // 离开步骤 3（例如在步骤 3 点击“上一步”返回步骤 2，或处于步骤 1 / 4）
      if (toolbar) {
        toolbar.style.display = 'none';
      }
    }
  }

  function init() {
    // 监听 Tab 2 同步规则事件
    if (window.DataXAssistant.EventBus) {
      window.DataXAssistant.EventBus.on('step3:sync_rules', (rules) => {
        if (!rules) return;
        const p = document.getElementById('datax-native-prefix');
        const s = document.getElementById('datax-native-suffix');
        const rf = document.getElementById('datax-native-replace-from');
        const rt = document.getElementById('datax-native-replace-to');
        const c = document.getElementById('datax-native-case');
        if (p) p.value = rules.prefix || '';
        if (s) s.value = rules.suffix || '';
        if (rf) rf.value = rules.replaceFrom || '';
        if (rt) rt.value = rules.replaceTo || '';
        if (c) c.value = rules.caseType || 'ORIGINAL';
        applyPrefixSuffixToNativeStep3();
      });
    }

    // 监听全局点击事件，当用户点击“上一步”/“下一步”按钮时毫秒级同步工具栏可见性
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const btn = target.closest ? target.closest('button, .el-button') : null;
      if (btn && (btn.textContent.includes('上一步') || btn.textContent.includes('下一步'))) {
        setTimeout(syncStep3ToolbarVisibility, 30);
        setTimeout(syncStep3ToolbarVisibility, 150);
      }
    }, true);

    // 周期性轮询兜底检查步骤可见性
    setInterval(syncStep3ToolbarVisibility, 300);
  }

  window.DataXAssistant.NativeToolbar = {
    init,
    transformTableName,
    injectStep3NativeToolbar,
    syncStep3ToolbarVisibility,
    applyPrefixSuffixToNativeStep3,
    autoBuildAndCreateTableNative,
    executeBatchDDLNative
  };
})();
