/**
 * @fileoverview Tab 1: 本地 Excel 解析与表名智能提取增强引擎 (Tab1Excel)
 * 提供 SheetJS 异步加载、多工作表分析、语义列（主表/从表）识别与批量勾选。
 *
 * @author ypc
 */

(function () {
  'use strict';

  window.DataXAssistant = window.DataXAssistant || {};
  window.DataXAssistant.Tabs = window.DataXAssistant.Tabs || {};

  const TABLE_NAME_BLACKLIST = new Set([
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
    'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'NULL', 'NOT', 'IN',
    'ID', 'NAME', 'VARCHAR', 'INT', 'DATETIME', 'TIMESTAMP', 'TEXT', 'NONE',
    'TRUE', 'FALSE', 'SET', 'INSERT', 'UPDATE', 'DELETE', 'TABLE', 'CREATE'
  ]);

  let parsedWorkbook = null;

  function alert(msg) {
    if (window.DataXCommon?.Notice?.alert) {
      return window.DataXCommon.Notice.alert(msg);
    }
    window.alert(msg);
  }

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

    return {
      jsonBuildComp,
      activeStep: jsonBuildComp.active,
      tableReader: readerRef ? readerRef.$refs.tablereader : null,
      tableWriter: writerRef ? writerRef.$refs.tablewriter : null,
      tableMapper: mapperRef ? mapperRef.$refs.mapper : null
    };
  }

  /**
   * 智能分析工作表元数据及列语义
   */
  function analyzeSheetMeta(ws) {
    if (!ws || !window.XLSX) {
      return { rows: [], dataStartRow: 1, headers: [], relCols: [], mainCols: [], otherCols: [] };
    }
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows || rows.length === 0) {
      return { rows: [], dataStartRow: 1, headers: [], relCols: [], mainCols: [], otherCols: [] };
    }

    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const rowStr = rows[r].map(c => String(c || '').trim()).join(' ');
      if (/(表|table|name|标识|字段)/i.test(rowStr)) {
        headerRowIdx = r;
        break;
      }
    }

    const headers = (rows[headerRowIdx] || []).map(c => String(c || '').trim());
    const relCols = [];
    const mainCols = [];
    const otherCols = [];

    const relHeaderRegex = /(关联表标识|从表标识|子表标识|关联表名|从表名|关联表|从表|子表|rel_table|slave_table|sub_table)/i;
    const mainHeaderRegex = /(主表标识|主表名|表标识|主表|表名|table_name|tableName|main_table)/i;
    const excludeHeaderRegex = /(中文|说明|注释|建议|事项|关系|外键)/i;

    headers.forEach((h, colIdx) => {
      if (!h) return;
      if (relHeaderRegex.test(h) && !excludeHeaderRegex.test(h) && !h.includes('主表')) {
        relCols.push({ colIdx, header: h });
      } else if (mainHeaderRegex.test(h) && !excludeHeaderRegex.test(h) && !relHeaderRegex.test(h)) {
        mainCols.push({ colIdx, header: h });
      } else {
        otherCols.push({ colIdx, header: h });
      }
    });

    mainCols.sort((a, b) => {
      const aScore = a.header.includes('标识') ? 2 : 1;
      const bScore = b.header.includes('标识') ? 2 : 1;
      return bScore - aScore;
    });

    relCols.sort((a, b) => {
      const aScore = a.header.includes('标识') ? 2 : 1;
      const bScore = b.header.includes('标识') ? 2 : 1;
      return bScore - aScore;
    });

    return {
      rows,
      dataStartRow: headerRowIdx + 1,
      headers,
      relCols,
      mainCols,
      otherCols
    };
  }

  /**
   * 从单元格文本中安全提取表名
   */
  function extractTableNamesFromCell(val) {
    if (val === null || val === undefined) return [];
    const str = String(val).trim();
    if (!str) return [];

    const matches = str.match(/[a-zA-Z][a-zA-Z0-9_]{1,63}/g);
    if (!matches) return [];

    const validTables = [];
    matches.forEach(m => {
      const upper = m.toUpperCase();
      if (TABLE_NAME_BLACKLIST.has(upper)) return;
      if (m.includes('_') || m.length >= 3) {
        validTables.push(m);
      }
    });
    return validTables;
  }

  /**
   * 根据提取模式智能匹配最佳工作表
   */
  function findBestSheetForMode(wb, mode) {
    if (!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length === 0) return null;

    if (mode === 'auto') {
      for (const name of wb.SheetNames) {
        const meta = analyzeSheetMeta(wb.Sheets[name]);
        if (meta && meta.mainCols.length > 0 && meta.relCols.length > 0) return name;
      }
      for (const name of wb.SheetNames) {
        if (/关联|从表|主从|rel|sub|slave/i.test(name)) {
          const meta = analyzeSheetMeta(wb.Sheets[name]);
          if (meta && (meta.relCols.length > 0 || meta.mainCols.length > 0)) return name;
        }
      }
      for (const name of wb.SheetNames) {
        const meta = analyzeSheetMeta(wb.Sheets[name]);
        if (meta && meta.relCols.length > 0) return name;
      }
      for (const name of wb.SheetNames) {
        const meta = analyzeSheetMeta(wb.Sheets[name]);
        if (meta && meta.mainCols.length > 0) return name;
      }
    } else if (mode === 'rel_only') {
      for (const name of wb.SheetNames) {
        const meta = analyzeSheetMeta(wb.Sheets[name]);
        if (meta && meta.relCols.length > 0) return name;
      }
      for (const name of wb.SheetNames) {
        if (/关联|从表|rel|sub|slave/i.test(name)) return name;
      }
    } else if (mode === 'main_only') {
      for (const name of wb.SheetNames) {
        const meta = analyzeSheetMeta(wb.Sheets[name]);
        if (meta && meta.mainCols.length > 0 && meta.relCols.length === 0) return name;
      }
      for (const name of wb.SheetNames) {
        const meta = analyzeSheetMeta(wb.Sheets[name]);
        if (meta && meta.mainCols.length > 0) return name;
      }
    }
    return wb.SheetNames[0];
  }

  /**
   * 从指定工作表根据模式提取表名列表
   */
  function extractTablesFromWorksheet(ws, mode) {
    const meta = analyzeSheetMeta(ws);
    const { rows, dataStartRow, relCols, mainCols } = meta;
    const tableSet = new Set();

    let targetCols = [];
    if (mode === 'rel_only') {
      targetCols = relCols.length > 0 ? [relCols[0].colIdx] : [];
    } else if (mode === 'main_only') {
      targetCols = mainCols.length > 0 ? [mainCols[0].colIdx] : [];
    } else if (mode === 'auto') {
      targetCols = [];
      if (mainCols.length > 0) targetCols.push(mainCols[0].colIdx);
      if (relCols.length > 0) targetCols.push(relCols[0].colIdx);
    } else {
      // all_cols: 遍历整行所有列
      targetCols = null;
    }

    for (let r = dataStartRow; r < rows.length; r++) {
      const row = rows[r] || [];
      if (targetCols !== null) {
        targetCols.forEach(colIdx => {
          const val = row[colIdx];
          extractTableNamesFromCell(val).forEach(t => tableSet.add(t));
        });
      } else {
        row.forEach(val => {
          extractTableNamesFromCell(val).forEach(t => tableSet.add(t));
        });
      }
    }

    return Array.from(tableSet);
  }

  /**
   * 安全 HTML 转义方法 (防止 XSS 注入)
   *
   * @param {string} str 待转义原始字符串
   * @return {string} 转义后的安全字符串
   */
  function escapeHtml(str) {
    if (window.DataXCommon?.Utils?.safeEscapeHtml) {
      return window.DataXCommon.Utils.safeEscapeHtml(str);
    }
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 实时更新 Tab 1 解析预览与统计信息面板
   */
  function updateTab1Preview() {
    const statusBox = document.getElementById('datax-status-box');
    const summaryElem = document.getElementById('datax-status-summary');
    const diffElem = document.getElementById('datax-diff-details');

    const paste = (document.getElementById('datax-paste-input')?.value || '').trim();
    if (paste) {
      const tables = extractTablesFromTab1();
      if (statusBox && summaryElem && diffElem) {
        statusBox.style.display = 'block';
        summaryElem.innerHTML = `
          <div style="font-size: 12px; font-weight: bold; color: #1890ff; margin-bottom: 4px;">
            📋 粘贴文本模式：共提取到 <b>${tables.length}</b> 张表
          </div>
        `;
        diffElem.innerHTML = tables.length > 0
          ? tables.slice(0, 80).map(t => `<span style="display:inline-block; padding:2px 6px; margin:2px; background:#e6f7ff; border:1px solid #91d5ff; border-radius:3px; color:#1890ff; font-size:11px;">${escapeHtml(t)}</span>`).join('') + (tables.length > 80 ? `<span style="color:#888; font-size:11px; margin-left:4px;">...等 ${tables.length} 张</span>` : '')
          : '<span style="color:#999; font-style:italic;">未解析到有效英文表名</span>';
      }
      return;
    }

    if (!parsedWorkbook) {
      if (statusBox) statusBox.style.display = 'none';
      return;
    }

    const colModeSel = document.getElementById('datax-col-select');
    const mode = colModeSel ? colModeSel.value : 'auto';
    const sheetSel = document.getElementById('datax-sheet-select');
    const sName = sheetSel ? sheetSel.value : '';
    const isAllSheets = sName === '__ALL_SHEETS__';

    let targetColsDesc = '';
    let sheetDisplayName = sName;

    if (isAllSheets) {
      sheetDisplayName = `📑 全部工作表 (共 ${parsedWorkbook.SheetNames.length} 个 Sheet 合并)`;
      targetColsDesc = '🌐 已智能聚合扫描所有工作表中的目标表名列';
    } else {
      const ws = parsedWorkbook.Sheets[sName];
      if (!ws) {
        if (statusBox) statusBox.style.display = 'none';
        return;
      }
      const meta = analyzeSheetMeta(ws);
      if (mode === 'rel_only') {
        targetColsDesc = meta.relCols.length > 0
          ? `目标从表列：<b style="color:#52c41a;">${meta.relCols.map(c => escapeHtml(c.header)).join(', ')}</b> (已隔离过滤主表)`
          : '<b style="color:#ff4d4f;">⚠️ 当前工作表未检测到从表/关联表标识列</b>';
      } else if (mode === 'main_only') {
        targetColsDesc = meta.mainCols.length > 0
          ? `目标主表列：<b style="color:#1890ff;">${meta.mainCols.map(c => escapeHtml(c.header)).join(', ')}</b> (已隔离过滤从表)`
          : '<b style="color:#faad14;">⚠️ 未识别出专属主表列</b>';
      } else if (mode === 'auto') {
        const allCols = [...meta.mainCols, ...meta.relCols];
        targetColsDesc = allCols.length > 0
          ? `智能识别列：${allCols.map(c => escapeHtml(c.header)).join(', ')}`
          : '扫描全表有效表名列';
      } else {
        targetColsDesc = '全表无差别扫描所有英文表名';
      }
    }

    const tables = extractTablesFromTab1();
    if (statusBox && summaryElem && diffElem) {
      statusBox.style.display = 'block';

      const modeLabels = {
        'auto': '⚡ 智能识别（主表+从表）',
        'main_only': '仅主表（表标识列）',
        'rel_only': '仅从表（关联表标识列）',
        'all_cols': '全列扫描'
      };

      summaryElem.innerHTML = `
        <div style="margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span><b>当前工作表：</b><span style="color:#1890ff; font-weight: bold;">${escapeHtml(sheetDisplayName)}</span></span>
          <span><b>提取范围：</b><span style="color:#722ed1; font-weight: bold;">${modeLabels[mode] || mode}</span></span>
        </div>
        <div style="margin-bottom: 4px; font-size: 11px; color: #555;">
          ${targetColsDesc}
        </div>
        <div style="font-size: 12px; font-weight: bold; color: ${tables.length > 0 ? '#52c41a' : '#ff4d4f'};">
          🎯 成功提取表名：共 <b>${tables.length}</b> 个
        </div>
      `;

      if (tables.length > 0) {
        diffElem.innerHTML = tables.slice(0, 100).map(t =>
          `<span style="display:inline-block; padding:2px 6px; margin:2px; background:#e6f7ff; border:1px solid #91d5ff; border-radius:3px; color:#1890ff; font-size:11px;">${escapeHtml(t)}</span>`
        ).join('') + (tables.length > 100 ? `<span style="color:#888; font-size:11px; margin-left:4px;">...等 ${tables.length} 张表</span>` : '');
      } else {
        diffElem.innerHTML = '<span style="color:#999; font-style:italic;">未提取到符合条件的表名</span>';
      }
    }

    // 兼容简易容器（若有）
    const countEl = document.getElementById('datax-table-count');
    const previewEl = document.getElementById('datax-table-preview');
    if (countEl) countEl.innerText = tables.length;
    if (previewEl) previewEl.innerHTML = tables.map(t => `<div style="padding: 2px 0;">${escapeHtml(t)}</div>`).join('');
  }

  function extractTablesFromTab1() {
    const pasteInput = document.getElementById('datax-paste-input');
    const paste = pasteInput ? pasteInput.value.trim() : '';
    if (paste) {
      const list = [];
      paste.split(/[\r\n,;\t\s]+/).forEach(s => {
        extractTableNamesFromCell(s).forEach(t => list.push(t));
      });
      return Array.from(new Set(list));
    }

    if (!parsedWorkbook) return [];

    const colModeSel = document.getElementById('datax-col-select');
    const mode = colModeSel ? colModeSel.value : 'auto';
    const sheetSel = document.getElementById('datax-sheet-select');
    let sName = sheetSel ? sheetSel.value : '';

    if (sName === '__ALL_SHEETS__') {
      const allSet = new Set();
      parsedWorkbook.SheetNames.forEach(name => {
        const ws = parsedWorkbook.Sheets[name];
        if (ws) {
          extractTablesFromWorksheet(ws, mode).forEach(t => allSet.add(t));
        }
      });
      return Array.from(allSet);
    }

    let ws = parsedWorkbook.Sheets[sName];
    if (mode === 'rel_only') {
      const currentMeta = analyzeSheetMeta(ws);
      if (!currentMeta || currentMeta.relCols.length === 0) {
        const bestSheet = findBestSheetForMode(parsedWorkbook, 'rel_only');
        if (bestSheet && bestSheet !== sName) {
          sName = bestSheet;
          if (sheetSel) sheetSel.value = bestSheet;
          ws = parsedWorkbook.Sheets[sName];
        }
      }
    } else if (mode === 'auto') {
      const currentMeta = analyzeSheetMeta(ws);
      if (!currentMeta || currentMeta.relCols.length === 0) {
        const bestSheet = findBestSheetForMode(parsedWorkbook, 'auto');
        if (bestSheet && bestSheet !== sName) {
          sName = bestSheet;
          if (sheetSel) sheetSel.value = bestSheet;
          ws = parsedWorkbook.Sheets[sName];
        }
      }
    }

    if (!ws) return [];
    return extractTablesFromWorksheet(ws, mode);
  }

  class Tab1Excel {
    constructor(container) {
      this.container = container;
    }

    init() {
      this.bindEvents();
    }

    bindEvents() {
      const fileInput = document.getElementById('datax-file-input') || document.getElementById('datax-excel-file');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const loadSheet = (callback) => {
            if (window.DataXCommon?.Utils?.loadSheetJs) {
              window.DataXCommon.Utils.loadSheetJs(callback);
            } else if (window.XLSX) {
              callback(window.XLSX);
            } else {
              alert('未检测到 SheetJS 库，正在尝试动态载入...');
            }
          };

          loadSheet((XLSX) => {
            if (!XLSX) {
              alert('加载 SheetJS 库失败，无法解析 Excel！请检查网络。');
              return;
            }
            const reader = new FileReader();
            reader.onload = (re) => {
              try {
                const data = new Uint8Array(re.target.result);
                parsedWorkbook = XLSX.read(data, { type: 'array' });
                const sel = document.getElementById('datax-sheet-select');
                if (!sel) return;
                sel.innerHTML = '';

                parsedWorkbook.SheetNames.forEach(n => {
                  const opt = document.createElement('option');
                  opt.value = n;
                  opt.textContent = n;
                  sel.appendChild(opt);
                });

                if (parsedWorkbook.SheetNames.length > 1) {
                  const allOpt = document.createElement('option');
                  allOpt.value = '__ALL_SHEETS__';
                  allOpt.textContent = '📑 全部工作表 (主从表跨表合并提取)';
                  sel.appendChild(allOpt);
                }

                const colModeSel = document.getElementById('datax-col-select');
                const currentMode = colModeSel ? colModeSel.value : 'auto';
                const bestSheet = findBestSheetForMode(parsedWorkbook, currentMode);
                if (bestSheet) sel.value = bestSheet;

                const sheetSection = document.getElementById('datax-sheet-section');
                if (sheetSection) sheetSection.style.display = 'block';
                updateTab1Preview();
              } catch (err) {
                alert('解析 Excel 失败: ' + err.message);
              }
            };
            reader.readAsArrayBuffer(file);
          });
        });
      }

      const sheetSel = document.getElementById('datax-sheet-select');
      if (sheetSel) sheetSel.onchange = updateTab1Preview;

      const colSel = document.getElementById('datax-col-select');
      if (colSel) {
        colSel.onchange = function () {
          const mode = this.value;
          if (parsedWorkbook && sheetSel) {
            const currentSheet = sheetSel.value;
            if (currentSheet !== '__ALL_SHEETS__') {
              const currentWs = parsedWorkbook.Sheets[currentSheet];
              const currentMeta = analyzeSheetMeta(currentWs);

              if (mode === 'rel_only' && (!currentMeta || currentMeta.relCols.length === 0)) {
                const bestSheet = findBestSheetForMode(parsedWorkbook, 'rel_only');
                if (bestSheet && bestSheet !== currentSheet) sheetSel.value = bestSheet;
              } else if (mode === 'main_only' && (!currentMeta || currentMeta.mainCols.length === 0)) {
                const bestSheet = findBestSheetForMode(parsedWorkbook, 'main_only');
                if (bestSheet && bestSheet !== currentSheet) sheetSel.value = bestSheet;
              } else if (mode === 'auto' && (!currentMeta || currentMeta.relCols.length === 0)) {
                const bestSheet = findBestSheetForMode(parsedWorkbook, 'auto');
                if (bestSheet && bestSheet !== currentSheet) sheetSel.value = bestSheet;
              }
            }
          }
          updateTab1Preview();
        };
      }

      const pasteInput = document.getElementById('datax-paste-input');
      if (pasteInput) pasteInput.oninput = updateTab1Preview;

      const togglePasteBtn = document.getElementById('datax-toggle-paste');
      if (togglePasteBtn && pasteInput) {
        togglePasteBtn.onclick = () => {
          pasteInput.style.display = pasteInput.style.display === 'none' ? 'block' : 'none';
        };
      }

      const execBtn = document.getElementById('datax-btn-execute');
      if (execBtn) {
        execBtn.onclick = function () {
          const tables = extractTablesFromTab1();
          if (tables.length === 0) {
            alert('未提取到有效表名！请检查工作表和提取范围是否匹配。');
            return;
          }
          const ctx = getJsonBuildContext();
          if (!ctx) {
            alert('未检测到构建组件，请确保处于 jsonBuildBatch 页面！');
            return;
          }
          const sName = sheetSel ? sheetSel.value : '';
          const sheetDisplayName = sName === '__ALL_SHEETS__' ? '全部工作表' : sName;
          const modeLabel = colSel && colSel.options[colSel.selectedIndex] ? colSel.options[colSel.selectedIndex].text : '';

          if (ctx.activeStep === 1 && ctx.tableReader) {
            ctx.tableReader.$set(ctx.tableReader.readerForm, 'tables', tables);
            ctx.tableReader.rHandleCheckedChange(tables);
            if (ctx.tableReader.$forceUpdate) ctx.tableReader.$forceUpdate();
            alert(`🎉 成功从 [${sheetDisplayName}]（${modeLabel}）为步骤 1 (Reader) 自动勾选 ${tables.length} 张表！`);
          } else if (ctx.activeStep === 2 && ctx.tableWriter) {
            ctx.tableWriter.$set(ctx.tableWriter.writerForm, 'tables', tables);
            ctx.tableWriter.wHandleCheckedChange(tables);
            if (ctx.tableWriter.$forceUpdate) ctx.tableWriter.$forceUpdate();
            alert(`🎉 成功从 [${sheetDisplayName}]（${modeLabel}）为步骤 2 (Writer) 自动勾选 ${tables.length} 张表！`);
          } else {
            alert(`成功从 [${sheetDisplayName}] 提取 ${tables.length} 张表！请前往步骤 1 或步骤 2 进行自动勾选。`);
          }
          updateTab1Preview();
        };
      }

      const clearBtn = document.getElementById('datax-btn-clear');
      if (clearBtn) {
        clearBtn.onclick = function () {
          const ctx = getJsonBuildContext();
          if (ctx && ctx.tableReader) {
            ctx.tableReader.$set(ctx.tableReader.readerForm, 'tables', []);
            ctx.tableReader.rHandleCheckedChange([]);
          }
          if (ctx && ctx.tableWriter) {
            ctx.tableWriter.$set(ctx.tableWriter.writerForm, 'tables', []);
            ctx.tableWriter.wHandleCheckedChange([]);
          }
          alert('已清空勾选！');
          updateTab1Preview();
        };
      }
    }
  }

  window.DataXAssistant.Tabs.Tab1 = Tab1Excel;
  window.DataXAssistant.Tabs.Tab1Class = Tab1Excel;
})();
