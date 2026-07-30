import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = path.dirname(new URL(import.meta.url).pathname);
const htmlPath = path.join(dir, 'index.html');
const cssPath = path.join(dir, 'mock.css');
const jsPath = path.join(dir, 'mock.js');
const requirementPath = path.resolve(dir, '../../research/2026-07-22-peak-sheet-compute/README.md');

for (const filePath of [htmlPath, cssPath, jsPath, requirementPath]) {
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
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
  appWidth: document.querySelector('.app-window')?.getBoundingClientRect().width ?? 0,
  tableRows: document.querySelectorAll('.record-table tbody tr').length,
  activeView: document.querySelector('.view-button.is-active')?.dataset.view,
}));
assert.equal(initial.bodyOverflow, 0, 'page should not overflow horizontally at 1600px');
assert.ok(initial.appWidth > 1300, 'desktop app window should remain the primary visual');
assert.equal(initial.tableRows, 8, 'table fixture should render eight visible records');
assert.equal(initial.activeView, 'table', 'table should be the initial view');
await page.screenshot({ path: path.join(dir, 'preview.png'), fullPage: true });

await page.click('[data-view="chart"]');
await page.waitForSelector('.chart-view');
assert.equal(await page.textContent('#current-view-title'), 'Chart');
await page.screenshot({ path: path.join(dir, 'preview-chart.png'), fullPage: true });

await page.click('[data-view="board"]');
await page.waitForSelector('.board-grid');
assert.match(await page.textContent('#current-view-phase'), /后续阶段/);

for (const [view, selector] of [
  ['gallery', '.gallery-grid'],
  ['calendar', '.calendar-grid'],
  ['map', '.map-shell'],
]) {
  await page.click(`[data-view="${view}"]`);
  await page.waitForSelector(selector);
}
await page.click('#add-view');
await page.waitForSelector('#view-menu:not([hidden])');
await page.click('[data-menu-view="globe"]');
await page.waitForSelector('.globe-concept');

await page.click('[data-view="table"]');
await page.click('#generate-plan');
await page.waitForSelector('#plan-card:not([hidden])');
await page.screenshot({ path: path.join(dir, 'preview-plan.png'), fullPage: true });
await page.click('#accept-plan');
await page.click('[data-panel-tab="run"]');
await page.waitForSelector('#run-receipt:not([hidden])');
assert.equal(await page.getAttribute('#remote-filter', 'aria-pressed'), 'true');
assert.match(await page.textContent('#footer-state'), /recipe saved/);

await page.click('#open-mobile');
await page.waitForSelector('#mobile-overlay:not([hidden])');
await page.screenshot({ path: path.join(dir, 'preview-mobile.png'), fullPage: true });
await page.click('[data-mobile-view="records"]');
await page.waitForSelector('#mobile-records:not([hidden])');
await page.click('#close-mobile');

assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);

await browser.close();
console.log(JSON.stringify({
  status: 'PASS',
  viewport: '1600x1000',
  tableRows: initial.tableRows,
  localLinks: localHrefs.length,
  viewsChecked: ['table', 'chart', 'board', 'gallery', 'calendar', 'map', 'globe'],
  flowsChecked: ['plan-preview-accept', 'mobile-consumption'],
  screenshots: ['preview.png', 'preview-chart.png', 'preview-plan.png', 'preview-mobile.png'],
}, null, 2));
