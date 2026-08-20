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
  ['file tree owns navigation', html.includes('Obsidian 文件目录') && html.includes('Launch Tracker</span><small>.peaksheet')],
  ['no internal sheet finder', !html.includes('Find a sheet') && !html.includes('New sheet')],
  ['many rows on first open', js.includes('MIN_GRID_ROWS = 32') && js.includes('visibleRowCount')],
  ['one-click row entry', html.includes('id="bottom-add-record"') && html.includes('id="toolbar-add-record"') && js.includes("addEventListener('click', addRecord)")],
  ['one-click column entry', js.includes('id="inline-add-field"') && js.includes('function addColumnOneClick()') && js.includes('beginInlineFieldRename(index)')],
  ['range selection', js.includes('startCellSelection') && js.includes('extendDraggedSelection') && js.includes('event.shiftKey') && css.includes('.is-in-range')],
  ['selection statistics', js.includes('Sum ${sum}') && js.includes('Avg ${(sum / numbers.length).toFixed(1)}')],
  ['column context menu', html.includes('data-field-action="insert-left"') && html.includes('data-field-action="insert-right"')],
  ['row context menu', html.includes('data-row-action="insert-above"') && js.includes("addEventListener('contextmenu'")],
  ['four shared views', ['table', 'board', 'calendar', 'chart'].every((view) => html.includes(`data-view="${view}"`))],
  ['file identity visible', html.includes('Saved to Vault') && html.includes('JSON canonical')],
  ['dense spreadsheet rhythm', css.includes('height: 31px') && readme.includes('31px')],
  ['animated ask ai', html.includes('id="ai-drawer"') && js.includes('setAiStep') && css.includes('@keyframes ai-running')],
  ['formula type and preview', js.includes('function typeFormula') && html.includes('Insert formula column') && js.includes('applyGeneratedFormula')],
  ['grounded analysis example', html.includes('Grounded in selected rows') && html.includes('Three issues currently put the release at risk')],
  ['all scripted nodes exist', missingIds.length === 0],
  ['paper hierarchy', css.includes('--paper: #fff') && css.includes('--accent: #6f52b5')],
  ['interactive datasets', js.includes("activeDatasetId = 'launch'") && js.includes('switchDataset')],
  ['storage boundary documented', readme.includes('CSV / XLSX 是导入导出格式') && readme.includes('SQLite')],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length > 0) process.exitCode = 1;
