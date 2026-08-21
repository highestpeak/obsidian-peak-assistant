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
  ['typed fields are optional', html.includes('id="typed-field-button"') && html.includes('General / Text') && html.includes('Blank columns stay General')],
  ['range selection', js.includes('startCellSelection') && js.includes('extendDraggedSelection') && js.includes('event.shiftKey') && css.includes('.is-in-range')],
  ['selection statistics', js.includes('Sum ${sum}') && js.includes('Avg ${(sum / numbers.length).toFixed(1)}')],
  ['column context menu', html.includes('data-field-action="insert-left"') && html.includes('data-field-action="insert-right"')],
  ['row context menu', html.includes('data-row-action="insert-above"') && js.includes("addEventListener('contextmenu'")],
  ['three shared views', ['table', 'board', 'calendar'].every((view) => html.includes(`data-view="${view}"`)) && !html.includes('data-view="chart"') && !html.includes('data-view="scripts"')],
  ['group replaces basic pivot need', html.includes('Group & summarize') && ['Count records', 'Average numeric field', 'Sum numeric field', 'Min / Max'].every((label) => html.includes(label))],
  ['file identity visible', html.includes('Saved to Vault') && html.includes('JSON canonical')],
  ['dense spreadsheet rhythm', css.includes('height: 31px') && readme.includes('31px')],
  ['animated ask ai', html.includes('id="ai-drawer"') && js.includes('setAiStep') && css.includes('@keyframes ai-running')],
  ['formula generate explain fix', js.includes('function typeFormula') && html.includes('Type check passed') && html.includes('id="ai-explain-formula"') && html.includes('id="ai-fix-formula"') && js.includes('applyGeneratedFormula')],
  ['grounded analysis example', html.includes('Grounded in selected rows') && html.includes('Three issues currently put the release at risk')],
  ['scripts are a sidecar', html.includes('id="scripts-drawer"') && ['Saved scripts', 'Preview', 'Run locally', 'Progress', 'History'].every((label) => html.includes(label)) && js.includes('function runScript')],
  ['local peakshare boundary', html.includes('class="local-badge"') && html.includes('Share via PeakShare') && html.includes('Nothing uploads until you confirm') && !html.includes('collaboration-avatar')],
  ['all scripted nodes exist', missingIds.length === 0],
  ['paper hierarchy', css.includes('--paper: #fff') && css.includes('--accent: #6f52b5')],
  ['interactive datasets', js.includes("activeDatasetId = 'launch'") && js.includes('switchDataset')],
  ['storage boundary documented', readme.includes('CSV / XLSX 是导入导出格式') && readme.includes('SQLite')],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length > 0) process.exitCode = 1;
