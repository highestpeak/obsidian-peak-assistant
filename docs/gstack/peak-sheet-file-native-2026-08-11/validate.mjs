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

const checks = [
  ['file tree owns navigation', html.includes('Obsidian 文件目录') && html.includes('Launch Tracker</span><small>.peaksheet')],
  ['no internal sheet finder', !html.includes('Find a sheet') && !html.includes('New sheet')],
  ['direct bottom record entry', html.includes('id="bottom-add-record"') && html.includes('New record')],
  ['direct column add entry', html.includes('id="inline-add-field"') || js.includes("byId('inline-add-field')")],
  ['column context menu', html.includes('data-field-action="insert-left"') && html.includes('data-field-action="insert-right"')],
  ['row context menu', html.includes('data-row-action="insert-above"') && js.includes("addEventListener('contextmenu'")],
  ['four shared views', ['table', 'board', 'calendar', 'chart'].every((view) => html.includes(`data-view="${view}"`))],
  ['file identity visible', html.includes('Saved to Vault') && html.includes('JSON canonical')],
  ['editorial row rhythm', css.includes('height: 42px')],
  ['paper hierarchy', css.includes('--paper: #fff') && css.includes('--accent: #6f52b5')],
  ['interactive datasets', js.includes("activeDatasetId = 'launch'") && js.includes('switchDataset')],
  ['storage boundary documented', readme.includes('CSV / XLSX 是导入导出格式') && readme.includes('SQLite')],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length > 0) process.exitCode = 1;
