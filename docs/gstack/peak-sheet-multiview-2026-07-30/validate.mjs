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
  tableRows: document.querySelectorAll('.record-table tbody tr[data-record-id]').length,
  groupRows: document.querySelectorAll('.record-table .group-row').length,
  activeView: document.querySelector('.view-tab.is-active')?.dataset.view,
  frozenColumnPosition: getComputedStyle(document.querySelector('.record-table td:nth-child(2)')).position,
  summaryCells: document.querySelectorAll('.table-summary > span').length,
  formulaColumns: document.querySelectorAll('.record-table thead .formula-mark').length,
  theme: document.body.dataset.theme,
  canvasColor: getComputedStyle(document.body).getPropertyValue('--bg').trim(),
}));

assert.equal(initial.bodyOverflow, 0, 'page should not overflow horizontally at 1600px');
assert.equal(initial.appWidth, 1600, 'desktop app should fill the viewport');
assert.equal(initial.appHeight, 1000, 'desktop app should fill the viewport height');
assert.equal(initial.tableRows, 12, 'table fixture should render twelve records');
assert.equal(initial.groupRows, 5, 'initial table should show five stage groups');
assert.equal(initial.activeView, 'table', 'table should be the initial view');
assert.equal(initial.frozenColumnPosition, 'sticky', 'primary record field should be frozen');
assert.equal(initial.summaryCells, 6, 'table should expose six inline statistics');
assert.equal(initial.formulaColumns, 2, 'table should identify two computed columns');
assert.equal(initial.theme, 'light', 'mock should default to the light theme');
assert.equal(initial.canvasColor, '#f6f7f4', 'default canvas should be neutral light');
await page.screenshot({ path: path.join(dir, 'preview.png') });

await page.click('#theme-toggle');
assert.equal(await page.getAttribute('body', 'data-theme'), 'dark');
assert.match(await page.getAttribute('#theme-toggle', 'aria-label'), /浅色/);
await page.click('#theme-toggle');
assert.equal(await page.getAttribute('body', 'data-theme'), 'light');

await page.click('#open-fields');
await page.waitForSelector('#field-panel:not([hidden])');
assert.match(await page.textContent('#field-panel'), /字段类型/);
assert.match(await page.textContent('#field-panel'), /单选/);
await page.click('#field-type-select');
await page.waitForSelector('#field-type-menu:not([hidden])');
assert.equal(await page.locator('#field-type-menu .field-type-grid button').count(), 7);
assert.match(await page.textContent('#field-type-menu'), /单行文本/);
assert.match(await page.textContent('#field-type-menu'), /数字/);
assert.match(await page.textContent('#field-type-menu'), /多选/);
assert.match(await page.textContent('#field-type-menu'), /日期/);
assert.match(await page.textContent('#field-type-menu'), /复选框/);
assert.match(await page.textContent('#field-type-menu'), /链接/);
assert.match(await page.textContent('#field-type-menu'), /公式/);
await page.screenshot({ path: path.join(dir, 'preview-fields.png') });
await page.click('[data-field-type="公式"]');
await page.waitForSelector('#formula-panel:not([hidden])');
assert.match(await page.textContent('#formula-panel'), /IF/);
assert.match(await page.textContent('#formula-panel'), /DATE_DIFF/);
assert.match(await page.textContent('#formula-panel'), /24 条预览 · 0 个错误/);
assert.equal(await page.locator('.formula-preview > span').count(), 3);
await page.screenshot({ path: path.join(dir, 'preview-formula.png') });
await page.click('#close-formula');

await page.click('#toggle-stats');
assert.equal(await page.locator('.table-summary').count(), 0);
await page.click('#toggle-stats');
assert.equal(await page.locator('.table-summary > span').count(), 6);

await page.click('[data-view="board"]');
await page.waitForSelector('.board-view');
assert.equal(await page.locator('.board-column').count(), 4);

await page.click('[data-view="calendar"]');
await page.waitForSelector('.calendar-grid');
assert.equal(await page.locator('.calendar-day').count(), 35);

await page.click('[data-view="gallery"]');
await page.waitForSelector('.gallery-view');
assert.equal(await page.locator('.gallery-card').count(), 12);
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

await browser.close();
console.log(JSON.stringify({
  status: 'PASS',
  viewport: '1600x1000',
  initialRows: initial.tableRows,
  groupRows: initial.groupRows,
  statistics: initial.summaryCells,
  computedColumns: initial.formulaColumns,
  localLinks: localHrefs.length,
  viewsChecked: ['table', 'board', 'calendar', 'gallery', 'dashboard'],
  flowsChecked: ['theme-switch', 'field-type-select', 'formula-preview', 'inline-statistics', 'compute-plan-accept', 'data-boundary', 'mobile-consumption'],
  screenshots: ['preview.png', 'preview-fields.png', 'preview-formula.png', 'preview-gallery.png', 'preview-dashboard.png', 'preview-plan.png', 'preview-mobile.png'],
}, null, 2));
