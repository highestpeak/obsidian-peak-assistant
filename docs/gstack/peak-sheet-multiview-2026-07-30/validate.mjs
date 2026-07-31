import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, 'index.html');
const cssPath = path.join(dir, 'mock.css');
const jsPath = path.join(dir, 'mock.js');
const readmePath = path.join(dir, 'README.md');
const requirementPath = path.resolve(dir, '../../research/2026-07-22-peak-sheet-compute/README.md');

for (const filePath of [htmlPath, cssPath, jsPath, readmePath, requirementPath]) {
  assert.ok(fs.existsSync(filePath), `missing required file: ${filePath}`);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const localHrefs = [...html.matchAll(/href="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((href) => !href.startsWith('#') && !/^[a-z]+:/i.test(href));
for (const href of localHrefs) {
  assert.ok(fs.existsSync(path.resolve(dir, href)), `broken local href: ${href}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const consoleErrors = [];
const pageErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(pathToFileURL(htmlPath).href);
await page.waitForSelector('.record-table');

const initial = await page.evaluate(() => ({
  bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  appWidth: document.querySelector('.app-shell')?.getBoundingClientRect().width ?? 0,
  appHeight: document.querySelector('.app-shell')?.getBoundingClientRect().height ?? 0,
  workspaceWidth: document.querySelector('.workspace')?.getBoundingClientRect().width ?? 0,
  sidebarCount: document.querySelectorAll('.data-sidebar').length,
  tableRows: document.querySelectorAll('.record-table tbody tr[data-record-id]').length,
  groupRows: document.querySelectorAll('.record-table .group-row').length,
  activeView: document.querySelector('.view-tab.is-active')?.dataset.view,
  frozenColumnPosition: getComputedStyle(document.querySelector('.record-table td:nth-child(2)')).position,
  columnLetters: document.querySelectorAll('.record-table .column-letters th:not(.sheet-corner)').length,
  typedFieldHeaders: document.querySelectorAll('.record-table thead tr:nth-child(2) th:not(.row-number-header)').length,
  rowNumbers: document.querySelectorAll('.record-table .row-number').length,
  firstRecordCellCount: document.querySelector('.record-table tbody tr[data-record-id]')?.cells.length ?? 0,
  selectedRangeCells: document.querySelectorAll('.record-table .selected-range').length,
  activeCells: document.querySelectorAll('.record-table .active-cell').length,
  selectionStatistics: document.querySelectorAll('.selection-statistics > span').length,
  formulaColumns: document.querySelectorAll('.record-table thead .formula-mark').length,
  activeCellName: document.querySelector('#active-cell-name')?.textContent,
  formulaValue: document.querySelector('#formula-input')?.value,
  theme: document.body.dataset.theme,
  canvasColor: getComputedStyle(document.body).getPropertyValue('--bg').trim(),
  gridLine: getComputedStyle(document.querySelector('.record-table td:nth-child(4)')).borderRightColor,
  structuralLine: getComputedStyle(document.querySelector('.record-table td:nth-child(2)')).borderRightColor,
  activeCellEdge: getComputedStyle(document.querySelector('.record-table .active-cell')).boxShadow,
  rowHeight: document.querySelector('.record-table td')?.getBoundingClientRect().height ?? 0,
  companyFontSize: getComputedStyle(document.querySelector('.company-cell strong')).fontSize,
  companyDirection: getComputedStyle(document.querySelector('.company-line')).flexDirection,
  stageTagHeight: document.querySelector('.stage-cell .tag')?.getBoundingClientRect().height ?? 0,
  stageTagFontSize: getComputedStyle(document.querySelector('.stage-cell .tag')).fontSize,
  workModeBorderWidth: getComputedStyle(document.querySelector('.work-mode')).borderTopWidth,
  scoreRingCount: document.querySelectorAll('.score-ring').length,
  multiSelectCellCount: document.querySelectorAll('.skill-tags').length,
  checkboxCellCount: document.querySelectorAll('.boolean-cell').length,
  linkCellCount: document.querySelectorAll('.link-cell').length,
  attachmentCellCount: document.querySelectorAll('.attachment-cell').length,
  dateTimeCellCount: document.querySelectorAll('.datetime-cell').length,
  progressCellCount: document.querySelectorAll('.progress-cell').length,
  noteCellCount: document.querySelectorAll('.note-cell').length,
  rowNumberOverflow: [...document.querySelectorAll('.record-table .row-number')]
    .some((cell) => cell.scrollWidth > cell.clientWidth),
  letterHeaderBottom: document.querySelector('.record-table .column-letters th:nth-child(2)')?.getBoundingClientRect().bottom ?? 0,
  fieldHeaderTop: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(2)')?.getBoundingClientRect().top ?? 0,
}));

assert.equal(initial.bodyOverflow, 0, 'page should not overflow horizontally at 1600px');
assert.equal(initial.appWidth, 1600, 'desktop app should fill the viewport');
assert.equal(initial.appHeight, 1000, 'desktop app should fill the viewport height');
assert.equal(initial.workspaceWidth, 1600, 'single Dataset workspace should own the full viewport width');
assert.equal(initial.sidebarCount, 0, 'mock should not duplicate Obsidian navigation with an app sidebar');
assert.equal(initial.tableRows, 20, 'table fixture should render twenty visible records');
assert.equal(initial.groupRows, 0, 'initial table should preserve the continuous computational grid');
assert.equal(initial.activeView, 'table', 'table should be the initial view');
assert.equal(initial.frozenColumnPosition, 'sticky', 'primary record field should be frozen');
assert.equal(initial.columnLetters, 17, 'table should expose spreadsheet column letters A-Q');
assert.equal(initial.typedFieldHeaders, 17, 'table should expose seventeen typed Dataset fields');
assert.equal(initial.rowNumbers, 20, 'table should expose stable row numbers');
assert.equal(initial.firstRecordCellCount, 18, 'each record row should align with the row header plus seventeen fields');
assert.equal(initial.selectedRangeCells, 5, 'initial grid should show the G2:G6 selection');
assert.equal(initial.activeCells, 1, 'initial grid should show one active formula cell');
assert.equal(initial.selectionStatistics, 5, 'status bar should expose count, sum, average, min and max');
assert.equal(initial.formulaColumns, 3, 'table should identify three computed columns');
assert.equal(initial.activeCellName, 'J6', 'formula name box should identify the active cell');
assert.match(initial.formulaValue, /^=IF\(AND\(G6>=85,H6>=7\)/, 'formula bar should expose the active formula');
assert.equal(initial.theme, 'dark', 'mock should default to the premium graphite theme');
assert.equal(initial.canvasColor, '#0d0f0e', 'default canvas should use graphite rather than pure black');
assert.notEqual(initial.gridLine, initial.structuralLine, 'grid hairlines and frozen-column dividers should use different weights');
assert.match(initial.activeCellEdge, /rgb\(165, 200, 118\)/, 'active data edge should use the restrained sage accent');
assert.equal(initial.rowHeight, 44, 'graphite table should use a dense but readable 44px row rhythm');
assert.equal(initial.companyFontSize, '13px', 'primary record text should use a normal readable 13px size');
assert.equal(initial.companyDirection, 'row', 'primary record metadata should stay on one aligned line');
assert.equal(initial.stageTagHeight, 24, 'stage tags should share a stable 24px control height');
assert.equal(initial.stageTagFontSize, '11px', 'stage tags should use readable 11px text');
assert.equal(initial.workModeBorderWidth, '0px', 'secondary categorical fields should not all become boxed tags');
assert.equal(initial.scoreRingCount, 20, 'each visible record should have one compact score glyph');
assert.equal(initial.multiSelectCellCount, 20, 'each visible record should render the multi-select field');
assert.equal(initial.checkboxCellCount, 20, 'each visible record should render the checkbox field');
assert.equal(initial.linkCellCount, 20, 'each visible record should render the link field');
assert.equal(initial.attachmentCellCount, 20, 'each visible record should render the attachment field');
assert.equal(initial.dateTimeCellCount, 20, 'each visible record should render the date-time field');
assert.equal(initial.progressCellCount, 20, 'each visible record should render the formatted numeric progress field');
assert.equal(initial.noteCellCount, 20, 'each visible record should render the multi-line text projection');
assert.equal(initial.rowNumberOverflow, false, 'two-digit row numbers should remain fully visible');
assert.equal(initial.letterHeaderBottom, initial.fieldHeaderTop, 'column letters and typed field headers should stack without overlap');
await page.screenshot({ path: path.join(dir, 'preview.png') });
await page.locator('.table-view').screenshot({ path: path.join(dir, 'preview-table.png') });
const horizontalScroll = await page.locator('.table-viewport').evaluate((viewport) => {
  viewport.scrollLeft = 1450;
  return {
    left: viewport.scrollLeft,
    max: viewport.scrollWidth - viewport.clientWidth,
  };
});
assert.ok(horizontalScroll.max > 1000, 'diverse typed fields should extend the internal spreadsheet canvas');
assert.ok(horizontalScroll.left > 0, 'table viewport should support horizontal field exploration');
await page.locator('.table-view').screenshot({ path: path.join(dir, 'preview-table-types.png') });
await page.locator('.table-viewport').evaluate((viewport) => {
  viewport.scrollLeft = 0;
});

await page.click('#theme-toggle');
assert.equal(await page.getAttribute('body', 'data-theme'), 'light');
assert.match(await page.getAttribute('#theme-toggle', 'aria-label'), /深色/);
await page.screenshot({ path: path.join(dir, 'preview-light.png') });
await page.click('#theme-toggle');
assert.equal(await page.getAttribute('body', 'data-theme'), 'dark');

await page.click('#open-format-menu');
await page.waitForSelector('#format-menu:not([hidden])');
assert.equal(await page.locator('[data-number-format]').count(), 8);
assert.match(await page.textContent('#format-menu'), /货币/);
assert.match(await page.textContent('#format-menu'), /百分比/);
assert.match(await page.textContent('#format-menu'), /日期时间/);
assert.match(await page.textContent('#format-menu'), /自定义/);
await page.screenshot({ path: path.join(dir, 'preview-format.png') });
await page.click('#open-conditional-from-menu');
await page.waitForSelector('#conditional-panel:not([hidden])');
assert.equal(await page.locator('.conditional-rule').count(), 2);
assert.match(await page.textContent('#conditional-panel'), /数据条/);
assert.match(await page.textContent('#conditional-panel'), /等待超过 7 天/);
await page.screenshot({ path: path.join(dir, 'preview-conditional.png') });
await page.click('#close-conditional-format');

await page.click('#open-fields');
await page.waitForSelector('#field-panel:not([hidden])');
assert.match(await page.textContent('#field-panel'), /字段类型/);
assert.match(await page.textContent('#field-panel'), /单选/);
assert.equal(await page.locator('.field-list > button:not(.field-add)').count(), 17);
await page.click('#field-type-select');
await page.waitForSelector('#field-type-menu:not([hidden])');
assert.equal(await page.locator('#field-type-menu .field-type-grid button').count(), 9);
assert.equal(await page.locator('#field-type-menu [data-field-type]').count(), 11);
assert.match(await page.textContent('#field-type-menu'), /单行文本/);
assert.match(await page.textContent('#field-type-menu'), /多行文本/);
assert.match(await page.textContent('#field-type-menu'), /数字/);
assert.match(await page.textContent('#field-type-menu'), /多选/);
assert.match(await page.textContent('#field-type-menu'), /日期与时间/);
assert.match(await page.textContent('#field-type-menu'), /复选框/);
assert.match(await page.textContent('#field-type-menu'), /链接/);
assert.match(await page.textContent('#field-type-menu'), /Vault 附件/);
assert.match(await page.textContent('#field-type-menu'), /公式/);
assert.match(await page.textContent('#field-type-menu'), /自动编号/);
await page.screenshot({ path: path.join(dir, 'preview-fields.png') });
await page.click('[data-field-type="公式"]');
await page.waitForSelector('#formula-panel:not([hidden])');
assert.match(await page.textContent('#formula-panel'), /IF/);
assert.match(await page.textContent('#formula-panel'), /DATE_DIFF/);
assert.match(await page.textContent('#formula-panel'), /条件聚合/);
assert.match(await page.textContent('#formula-panel'), /自定义函数/);
assert.ok(await page.locator('[data-function]').count() >= 40, 'formula library should expose a broad basic-function baseline');
assert.match(await page.textContent('#formula-panel'), /20 条预览 · 0 个错误 · 无循环引用/);
assert.equal(await page.locator('.formula-preview > span').count(), 3);
await page.screenshot({ path: path.join(dir, 'preview-formula.png') });
await page.click('#close-formula');

await page.click('#toggle-stats');
assert.equal(await page.locator('#selection-statistics').isHidden(), true);
await page.click('#toggle-stats');
assert.equal(await page.locator('#selection-statistics').isVisible(), true);

await page.click('[data-view="board"]');
await page.waitForSelector('.board-view');
assert.equal(await page.locator('.board-column').count(), 4);

await page.click('[data-view="calendar"]');
await page.waitForSelector('.calendar-grid');
assert.equal(await page.locator('.calendar-day').count(), 35);

await page.click('[data-view="gallery"]');
await page.waitForSelector('.gallery-view');
assert.equal(await page.locator('.gallery-card').count(), 20);
assert.match(await page.textContent('.gallery-view'), /卡片字段/);
await page.screenshot({ path: path.join(dir, 'preview-gallery.png') });

await page.click('[data-view="dashboard"]');
await page.waitForSelector('.dashboard');
assert.equal(await page.locator('.metric').count(), 5);
assert.equal(await page.locator('.analysis-panel').count(), 5);
await page.screenshot({ path: path.join(dir, 'preview-dashboard.png') });

await page.click('#dashboard-open-ai');
await page.waitForSelector('#ai-drawer.is-open');
await page.click('#generate-plan');
await page.waitForSelector('#plan-preview:not([hidden])');
await page.screenshot({ path: path.join(dir, 'preview-plan.png') });
await page.click('#accept-plan');
await page.waitForSelector('.record-table');
assert.equal(await page.locator('.record-table tr[data-record-id]').count(), 5);
assert.match(await page.textContent('#filter-line'), /高价值待跟进/);

await page.click('#show-source');
await page.waitForSelector('#source-dialog:not([hidden])');
assert.match(await page.textContent('#source-dialog'), /Markdown source/);
assert.match(await page.textContent('#source-dialog'), /View projections/);
await page.click('#confirm-source');

await page.click('#open-mobile');
await page.waitForSelector('#mobile-overlay:not([hidden])');
assert.match(await page.textContent('.phone-footer'), /只读消费模式/);
await page.screenshot({ path: path.join(dir, 'preview-mobile.png') });
await page.click('#close-mobile');

assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);

const basicFunctionCount = await page.locator('[data-function]').count();
const fieldTypeCount = await page.locator('#field-type-menu [data-field-type]').count();
await browser.close();
console.log(JSON.stringify({
  status: 'PASS',
  viewport: '1600x1000',
  initialRows: initial.tableRows,
  typedFields: initial.typedFieldHeaders,
  fieldTypesExposed: fieldTypeCount,
  groupRows: initial.groupRows,
  selectionStatistics: initial.selectionStatistics,
  computedColumns: initial.formulaColumns,
  basicFunctions: basicFunctionCount,
  defaultTheme: initial.theme,
  lineSystem: {
    grid: initial.gridLine,
    structural: initial.structuralLine,
    active: initial.activeCellEdge,
  },
  localLinks: localHrefs.length,
  viewsChecked: ['table', 'board', 'calendar', 'gallery', 'dashboard'],
  flowsChecked: ['theme-switch', 'number-format', 'conditional-format', 'field-type-select', 'formula-library', 'selection-statistics', 'compute-plan-accept', 'data-boundary', 'mobile-consumption'],
  screenshots: ['preview.png', 'preview-table.png', 'preview-table-types.png', 'preview-light.png', 'preview-format.png', 'preview-conditional.png', 'preview-fields.png', 'preview-formula.png', 'preview-gallery.png', 'preview-dashboard.png', 'preview-plan.png', 'preview-mobile.png'],
}, null, 2));
