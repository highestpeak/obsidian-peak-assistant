import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const [html, css, js, readme] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'mock.css'), 'utf8'),
  readFile(join(root, 'app.js'), 'utf8'),
  readFile(join(root, 'README.md'), 'utf8'),
]);

const declaredIds = new Set([
  ...[...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
  ...[...js.matchAll(/\bid=\\?"([^"\\]+)\\?"/g)].map((match) => match[1]),
]);
const referencedIds = [...new Set([...js.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]))];
const missingIds = referencedIds.filter((id) => !declaredIds.has(id));

const checks = [
  ['file tree owns navigation', html.includes('Obsidian 文件目录') && html.includes('Launch Tracker</span><small>.peaksheet') && html.includes('Blank Sheet</span><small>.peaksheet')],
  ['no internal sheet finder', !html.includes('Find a sheet') && !html.includes('New sheet')],
  ['unified grid state', js.includes('let gridState = { activeCell:') && js.includes("mode: 'navigation'") && js.includes("gridState.mode = 'editing'") && js.includes("gridState.mode = 'selecting'")],
  ['virtual spreadsheet surface', js.includes('MIN_GRID_ROWS = 64') && js.includes('MIN_GRID_COLUMNS = 30') && js.includes('visibleRowCount') && js.includes('visibleColumnCount')],
  ['materialize on use', js.includes('function materializeRow') && js.includes('function materializeField') && js.includes('pasteIntoGrid') && readme.includes('按使用 materialize')],
  ['full keyboard editing', js.includes("event.key === 'F2'") && js.includes("event.key === 'Tab'") && js.includes("event.key === 'Escape'") && js.includes('beginCellEdit(cell, event.key)') && js.includes('clearSelectedRange')],
  ['range clipboard', js.includes('copySelectedRange') && js.includes('pasteIntoGrid') && js.includes("values.join('\\t')")],
  ['columns materialize without schema forms', !html.includes('id="typed-field-button"') && !html.includes('id="field-editor"') && !js.includes('function openFieldEditor') && js.includes('function materializeField')],
  ['range selection', js.includes('startCellSelection') && js.includes('extendDraggedSelection') && js.includes('event.shiftKey') && css.includes('.is-in-range')],
  ['selection statistics', js.includes('Sum ${sum}') && js.includes('Avg ${(sum / numbers.length).toFixed(1)}')],
  ['column context menu', html.includes('data-field-action="insert-left"') && html.includes('data-field-action="insert-right"') && !html.includes('field-menu-trigger') && js.includes("header.addEventListener('contextmenu'")],
  ['row context menu', html.includes('data-row-action="insert-above"') && js.includes("addEventListener('contextmenu'")],
  ['three shared views', ['table', 'board', 'calendar'].every((view) => html.includes(`data-view="${view}"`)) && !html.includes('data-view="chart"') && !html.includes('data-view="scripts"')],
  ['group replaces basic pivot need', html.includes('Group & summarize') && ['Count records', 'Average numeric field', 'Sum numeric field', 'Min / Max'].every((label) => html.includes(label))],
  ['file identity visible without redundant status', html.includes('.peaksheet') && html.includes('JSON canonical') && !html.includes('Saved to Vault') && !html.includes('PEAK SHEET')],
  ['dense spreadsheet rhythm', css.includes('height: 31px') && readme.includes('31px')],
  ['animated ask ai', html.includes('id="ai-drawer"') && js.includes('setAiStep') && css.includes('@keyframes ai-running')],
  ['formula generate explain fix', js.includes('function typeFormula') && html.includes('Type check passed') && html.includes('id="ai-explain-formula"') && html.includes('id="ai-fix-formula"') && js.includes('applyGeneratedFormula')],
  ['grounded analysis example', html.includes('Grounded in selected rows') && html.includes('Three issues currently put the release at risk')],
  ['scripts are a sidecar', html.includes('id="scripts-drawer"') && ['Saved scripts', 'Preview', 'Run locally', 'Progress', 'History'].every((label) => html.includes(label)) && js.includes('function runScript')],
  ['local peakshare boundary', html.includes('Share via PeakShare') && html.includes('Nothing uploads until you confirm') && html.includes('Your .peaksheet is still local.') && !html.includes('collaboration-avatar')],
  ['all scripted nodes exist', missingIds.length === 0],
  ['paper hierarchy', css.includes('--paper: #fff') && css.includes('--accent: #6f52b5')],
  ['interactive datasets', js.includes("activeDatasetId = 'launch'") && js.includes('switchDataset')],
  ['storage boundary documented', readme.includes('CSV / XLSX 是导入导出格式') && readme.includes('SQLite')],
  ['layout contracts documented', readme.includes('## 布局契约（V5.1）') && readme.includes('固定槽位、可截断文字和受控滚动')],
  ['toolbar has explicit zones', html.includes('class="toolbar-primary"') && html.includes('class="toolbar-operations"') && html.includes('class="toolbar-actions"') && css.includes('grid-template-columns: minmax(0, 1fr) max-content')],
  ['stable interaction geometry', css.includes('.data-grid td.cell:hover::after') && css.includes('.data-grid td.cell.is-selected::after') && css.includes('pointer-events: none')],
  ['drawer scroll ownership', css.includes('.scripts-body { min-height: 0') && css.includes('.ai-thread { min-height: 0') && css.includes('grid-template-rows: auto auto minmax(0, 1fr) auto')],
  ['long text has constrained slots', css.includes('.status-bar > span { min-width: 0') && css.includes('.saved-script strong, .saved-script small') && css.includes('text-overflow: ellipsis')],
  ['semantic field width contracts', js.includes('const FIELD_WIDTH_CONTRACT') && js.includes('function fieldWidth(field)') && js.includes('if (!field) return 160') && js.includes('function startFieldResize')],
  ['column headers use Excel letters only', js.includes('aria-label="Column ${columnName(index)}') && !js.includes('field-title${field ?') && css.includes('.field-select-button { display: flex; align-items: center; justify-content: center') && css.includes('.field-resize-handle')],
  ['unified overlay state machine', js.includes('let overlayState = { id: null, trigger: null }') && js.includes('function openOverlay') && js.includes('function closeOverlay') && js.includes("overlayState.id === id && overlayState.trigger === trigger")],
  ['overlay close and focus contract', js.includes("event.key !== 'Escape'") && js.includes('overlay?.contains(event.target)') && js.includes("trigger.focus({ preventScroll: true })")],
  ['host boundary and fixture checklist', css.includes('.peak-sheet-root, .peak-sheet-root *') && readme.includes('### 极端 fixture 检查表') && readme.includes('file://')],
  ['ask ai preserves the grid viewport', css.includes('.workspace { display: flex; min-width: 0; min-height: 0') && css.includes('.sheet-document { position: relative; display: grid; min-width: 0; min-height: 0; flex: 1 1 auto; overflow: hidden') && js.includes("openOverlay('ai-drawer', byId('ask-ai-button'), syncAiContext);") && !js.includes("openOverlay('ai-drawer', byId('ask-ai-button'), syncAiContext, 'ai-prompt')")],
  ['board is a draggable status projection', js.includes('function bindBoardEvents') && js.includes("event.dataTransfer.effectAllowed = 'move'") && js.includes('function moveBoardRecord') && js.includes('class="board-lane-body"')],
  ['calendar is the same date projection', js.includes('function parseSheetDate') && js.includes('function openRecordFromProjection') && html.includes('id="add-record"') && readme.includes('## 同一 Dataset 的多视图（V5.3）')],
  ['calendar has view-native actions', js.includes("data-calendar-action=\"previous\"") && js.includes("data-calendar-action=\"today\"") && js.includes("data-calendar-action=\"new\"")],
  ['command menu has no legacy button chrome', css.includes('appearance: none') && css.includes('background: transparent !important') && !html.includes('Show location') && !html.includes('id="location-card"')],
  ['projection records return to the source row', js.includes('function openRecordFromProjection') && js.includes("projectionFlashRowIndex = rowIndex") && js.includes("cell?.scrollIntoView({ block: 'center', inline: 'nearest' })") && css.includes('@keyframes projection-row-flash')],
  ['multi-filter is a working table view control', html.includes('id="filter-button"') && html.includes('id="filter-menu"') && html.includes('id="add-filter-rule"') && js.includes('function applyTableFilter') && js.includes('tableFilters.every') && js.includes('filterDraft.push')],
  ['multi-sort is a working table view control', html.includes('id="sort-button"') && html.includes('id="sort-menu"') && html.includes('id="add-sort-rule"') && js.includes('function applyTableSort') && js.includes('function compareRowsByRules') && js.includes('sortDraft.push')],
  ['multi-group is a working table view control', html.includes('id="group-rules"') && html.includes('id="add-group-rule"') && js.includes('function groupedTableRows') && js.includes('tableGroupFields') && js.includes('groupDraft.push')],
  ['formula bar exposes a typed-only near-text AI shortcut', html.includes('class="formula-entry"') && html.includes('id="formula-shortcut-badge"') && !html.includes('拖选范围后 Ask AI') && js.includes('function syncFormulaInputWidth') && js.includes('function setFormulaShortcutVisible') && js.includes("byId('formula-input').addEventListener('keydown'") && js.includes("runAi('formula')")],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length > 0) process.exitCode = 1;
