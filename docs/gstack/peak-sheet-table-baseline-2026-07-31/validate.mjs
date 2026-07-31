import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, 'index.html');
const cssPath = path.join(dir, 'mock.css');
const readmePath = path.join(dir, 'README.md');

for (const filePath of [htmlPath, cssPath, readmePath]) {
  assert.ok(fs.existsSync(filePath), `missing required file: ${filePath}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const consoleErrors = [];
const pageErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(pathToFileURL(htmlPath).href);
await page.waitForSelector('.baseline-table');

const result = await page.evaluate(() => {
  const firstCell = document.querySelector('.data-row td:nth-child(2)');
  const firstRow = document.querySelector('.data-row');
  const primary = document.querySelector('.record-line strong');
  const secondary = document.querySelector('.record-line small');
  const stageTag = document.querySelector('.stage-tag');
  const numeric = document.querySelector('.numeric-value');
  const active = document.querySelector('.active-data-cell');
  const header = document.querySelector('.baseline-table thead th');
  const total = document.querySelector('.total-row th');
  return {
    bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    frameWidth: document.querySelector('.baseline-frame')?.getBoundingClientRect().width ?? 0,
    fieldHeaders: document.querySelectorAll('.baseline-table thead th').length,
    dataRows: document.querySelectorAll('.data-row').length,
    groupRows: document.querySelectorAll('.group-row').length,
    stageTags: document.querySelectorAll('.stage-tag').length,
    maxTagsPerRow: Math.max(...[...document.querySelectorAll('.data-row')]
      .map((row) => row.querySelectorAll('.stage-tag').length)),
    rowHeight: firstRow?.getBoundingClientRect().height ?? 0,
    primaryFontSize: primary ? getComputedStyle(primary).fontSize : '',
    primaryFontWeight: primary ? getComputedStyle(primary).fontWeight : '',
    secondaryFontSize: secondary ? getComputedStyle(secondary).fontSize : '',
    bodyFontSize: firstCell ? getComputedStyle(firstCell).fontSize : '',
    stageTagHeight: stageTag?.getBoundingClientRect().height ?? 0,
    stageTagFontSize: stageTag ? getComputedStyle(stageTag).fontSize : '',
    stageTagBorder: stageTag ? getComputedStyle(stageTag).borderTopWidth : '',
    ordinaryVerticalLine: firstCell ? getComputedStyle(firstCell).borderRightWidth : '',
    ordinaryHorizontalLine: firstCell ? getComputedStyle(firstCell).borderBottomWidth : '',
    headerRule: header ? getComputedStyle(header).borderBottomWidth : '',
    totalRule: total ? getComputedStyle(total).borderTopWidth : '',
    numericAlignment: numeric ? getComputedStyle(numeric).textAlign : '',
    numericVariant: numeric ? getComputedStyle(numeric).fontVariantNumeric : '',
    activeEdge: active ? getComputedStyle(active).boxShadow : '',
    bodyBackgroundImage: getComputedStyle(document.body).backgroundImage,
    tableBackgroundImage: getComputedStyle(document.querySelector('.baseline-table')).backgroundImage,
    actionClipped: [...document.querySelectorAll('.action-value > span')]
      .some((value) => value.scrollWidth > value.clientWidth),
    summaryMetrics: document.querySelectorAll('.summary-strip > div').length,
  };
});

assert.equal(result.bodyOverflow, 0, 'baseline should not overflow the 1440px viewport');
assert.equal(result.frameWidth, 1392, 'baseline should keep a disciplined 24px outer canvas margin');
assert.equal(result.fieldHeaders, 8, 'baseline should expose seven fields plus one row-number column');
assert.equal(result.dataRows, 10, 'baseline should use ten records to prove table rhythm');
assert.equal(result.groupRows, 3, 'baseline should exercise three editorial group dividers');
assert.equal(result.stageTags, 10, 'stage should be the only always-tagged record field');
assert.equal(result.maxTagsPerRow, 1, 'each row should show at most one persistent tag');
assert.equal(result.rowHeight, 42, 'default data rows should use the 42px baseline');
assert.equal(result.primaryFontSize, '14.5px', 'primary record text should be visibly larger than body text');
assert.equal(result.primaryFontWeight, '570', 'primary record text should avoid generic heavy bold');
assert.equal(result.secondaryFontSize, '12px', 'secondary metadata should stay subordinate');
assert.equal(result.bodyFontSize, '13.5px', 'ordinary cell text should use the 13.5px baseline');
assert.equal(result.stageTagHeight, 24, 'stage tags should remain compact 24px values, not buttons');
assert.equal(result.stageTagFontSize, '12px', 'stage tags should use a readable 12px value');
assert.equal(result.stageTagBorder, '0px', 'stage tags should not add another box line');
assert.equal(result.ordinaryVerticalLine, '0px', 'ordinary cells should not create a vertical cage');
assert.equal(result.ordinaryHorizontalLine, '1px', 'ordinary rows should use one quiet separator');
assert.equal(result.headerRule, '2px', 'field headers should terminate with one authoritative rule');
assert.equal(result.totalRule, '2px', 'totals should reuse the authoritative rule');
assert.equal(result.numericAlignment, 'right', 'numeric fields should align on the right edge');
assert.match(result.numericVariant, /tabular-nums/, 'numeric fields should use stable tabular numerals');
assert.match(result.activeEdge, /rgb\(115, 99, 181\)/, 'one 1.5px accent should identify the active cell');
assert.equal(result.bodyBackgroundImage, 'none', 'baseline canvas should not use decorative gradients');
assert.equal(result.tableBackgroundImage, 'none', 'table should not use hatching or background decoration');
assert.ok(result.actionClipped, 'fixture should prove long next actions remain on one aligned line');
assert.equal(result.summaryMetrics, 3, 'masthead should expose only three restrained summary metrics');
assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);

await page.screenshot({ path: path.join(dir, 'preview-baseline.png'), fullPage: true });
await page.locator('.table-shell').screenshot({ path: path.join(dir, 'preview-table.png') });

await browser.close();
console.log(JSON.stringify({
  status: 'PASS',
  viewport: '1440x960',
  records: result.dataRows,
  fieldsIncludingRowNumber: result.fieldHeaders,
  rowHeight: result.rowHeight,
  typography: {
    primary: result.primaryFontSize,
    body: result.bodyFontSize,
    secondary: result.secondaryFontSize,
    tag: result.stageTagFontSize,
  },
  lineSystem: {
    vertical: result.ordinaryVerticalLine,
    row: result.ordinaryHorizontalLine,
    structural: result.headerRule,
  },
  screenshots: ['preview-baseline.png', 'preview-table.png'],
}, null, 2));
