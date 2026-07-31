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
  visualVersion: document.body.dataset.visualVersion,
  canvasColor: getComputedStyle(document.body).getPropertyValue('--bg').trim(),
  headerHeights: [
    '.document-bar',
    '.view-tabs',
    '.data-toolbar',
    '.formula-bar',
    '.filter-line',
  ].map((selector) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0),
  headerBackgrounds: [
    '.document-bar',
    '.view-tabs',
    '.data-toolbar',
    '.formula-bar',
    '.filter-line',
  ].map((selector) => getComputedStyle(document.querySelector(selector)).backgroundColor),
  toolbarDividerWidth: document.querySelector('.toolbar-divider')?.getBoundingClientRect().width ?? 0,
  fieldHeaderFontSize: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(2)')).fontSize,
  textHeaderAlignment: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(4) .field-heading')).justifyContent,
  numericHeaderAlignment: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(8) .field-heading')).justifyContent,
  booleanHeaderAlignment: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(13) .field-heading')).justifyContent,
  companyHeaderLeft: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(2) .field-heading > span')?.getBoundingClientRect().left ?? 0,
  companyValueLeft: document.querySelector('tr[data-record-id="aster"] .company-cell strong')?.getBoundingClientRect().left ?? 0,
  workModeHeaderLeft: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(4) .field-heading > span')?.getBoundingClientRect().left ?? 0,
  workModeValueLeft: document.querySelector('tr[data-record-id="aster"] .work-mode')?.getBoundingClientRect().left ?? 0,
  salaryHeaderRight: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(7) .field-heading > span')?.getBoundingClientRect().right ?? 0,
  salaryValueRight: document.querySelector('tr[data-record-id="aster"] .salary')?.getBoundingClientRect().right ?? 0,
  scoreHeaderRight: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(8) .field-heading > span')?.getBoundingClientRect().right ?? 0,
  scoreValueRight: document.querySelector('tr[data-record-id="aster"] .score-cell strong')?.getBoundingClientRect().right ?? 0,
  booleanHeaderCenter: (() => {
    const rect = document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(13) .field-heading > span')?.getBoundingClientRect();
    return rect ? rect.left + rect.width / 2 : 0;
  })(),
  booleanValueCenter: (() => {
    const rect = document.querySelector('tr[data-record-id="aster"] .boolean-cell')?.getBoundingClientRect();
    return rect ? rect.left + rect.width / 2 : 0;
  })(),
  ordinaryVerticalLine: getComputedStyle(document.querySelector('.record-table td:nth-child(4)')).borderRightWidth,
  ordinaryHorizontalLine: getComputedStyle(document.querySelector('.record-table td:nth-child(4)')).borderBottomWidth,
  headerRule: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(4)')).borderBottomWidth,
  frozenColumnEdge: getComputedStyle(document.querySelector('.record-table td:nth-child(2)')).boxShadow,
  activeCellEdge: getComputedStyle(document.querySelector('.record-table .active-cell')).boxShadow,
  cellBackgroundImage: getComputedStyle(document.querySelector('.record-table td:nth-child(4)')).backgroundImage,
  rowHeight: document.querySelector('.record-table td')?.getBoundingClientRect().height ?? 0,
  companyFontSize: getComputedStyle(document.querySelector('.company-cell strong')).fontSize,
  companyDirection: getComputedStyle(document.querySelector('.company-line')).flexDirection,
  companyLogoDisplay: getComputedStyle(document.querySelector('.company-logo')).display,
  stageTagHeight: document.querySelector('.stage-cell .tag')?.getBoundingClientRect().height ?? 0,
  stageTagFontSize: getComputedStyle(document.querySelector('.stage-cell .tag')).fontSize,
  stageTagBorderWidth: getComputedStyle(document.querySelector('.stage-cell .tag')).borderTopWidth,
  workModeBorderWidth: getComputedStyle(document.querySelector('.work-mode')).borderTopWidth,
  workModeBackground: getComputedStyle(document.querySelector('.work-mode')).backgroundColor,
  workModePaddingLeft: getComputedStyle(document.querySelector('.work-mode')).paddingLeft,
  oddRowBackground: getComputedStyle(document.querySelector('tr[data-record-id="aster"] td:nth-child(4)')).backgroundColor,
  evenRowBackground: getComputedStyle(document.querySelector('tr[data-record-id="tide"] td:nth-child(4)')).backgroundColor,
  oddFrozenBackground: getComputedStyle(document.querySelector('tr[data-record-id="aster"] td:nth-child(2)')).backgroundColor,
  evenFrozenBackground: getComputedStyle(document.querySelector('tr[data-record-id="tide"] td:nth-child(2)')).backgroundColor,
  visibleScoreRings: [...document.querySelectorAll('.score-ring')]
    .filter((ring) => getComputedStyle(ring).display !== 'none').length,
  fieldTypeIconDisplay: getComputedStyle(document.querySelector('.field-heading > svg')).display,
  multiSelectColumnCount: document.querySelectorAll('.skills-column').length,
  multiSelectValueCount: document.querySelectorAll('.skill-tags').length,
  maxVisibleSkillTags: Math.max(...[...document.querySelectorAll('.skills-column')]
    .map((cell) => cell.querySelectorAll('.skill-tag').length)),
  skillOverflowCount: document.querySelectorAll('.tag-overflow').length,
  skillTagPaletteCount: new Set([...document.querySelectorAll('.skill-tag')]
    .map((tag) => {
      const style = getComputedStyle(tag);
      return `${style.backgroundColor}|${style.borderColor}|${style.color}`;
    })).size,
  stageTagPaletteCount: new Set([...document.querySelectorAll('.stage-cell .tag')]
    .map((tag) => getComputedStyle(tag).backgroundColor)).size,
  checkboxCellCount: document.querySelectorAll('.boolean-cell').length,
  linkColumnCount: document.querySelectorAll('.link-column').length,
  linkCellCount: document.querySelectorAll('.link-cell').length,
  attachmentColumnCount: document.querySelectorAll('.attachment-column').length,
  attachmentCellCount: document.querySelectorAll('.attachment-cell').length,
  multipleAttachmentCount: document.querySelectorAll('.attachment-cell.is-multiple').length,
  dateTimeCellCount: document.querySelectorAll('.datetime-cell').length,
  progressCellCount: document.querySelectorAll('.progress-cell').length,
  noteColumnCount: document.querySelectorAll('.note-column').length,
  emptyCellCount: document.querySelectorAll('.cell-empty').length,
  emptyCellGlyphs: [...new Set([...document.querySelectorAll('.cell-empty')]
    .map((cell) => cell.textContent?.trim()))],
  emptyCellBorderWidth: getComputedStyle(document.querySelector('.cell-empty')).borderTopWidth,
  clippedValueCount: [...document.querySelectorAll('.skill-tag > span, .link-cell > span, .note-cell')]
    .filter((cell) => cell.scrollWidth > cell.clientWidth).length,
  rightFieldFontSize: getComputedStyle(document.querySelector('.link-cell')).fontSize,
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
assert.equal(initial.theme, 'light', 'Editorial V2 should default to the approved Paper direction');
assert.equal(initial.visualVersion, 'editorial-v2', 'mock should expose an explicit independent visual version');
assert.equal(initial.canvasColor, '#eef0ec', 'Paper canvas should use a warm mineral grey');
assert.deepEqual(initial.headerHeights, [52, 38, 38, 32, 28], 'Header bands should share the approved compact vertical rhythm');
assert.equal(new Set(initial.headerBackgrounds).size, 1, 'Header bands should read as one continuous paper surface');
assert.equal(initial.toolbarDividerWidth, 0, 'toolbar groups should use spacing instead of vertical divider cages');
assert.equal(initial.fieldHeaderFontSize, '11.5px', 'field headers should use the same readable type scale as table metadata');
assert.equal(initial.textHeaderAlignment, 'flex-start', 'text field headers should follow the left reading axis');
assert.equal(initial.numericHeaderAlignment, 'flex-end', 'numeric field headers should follow the right reading axis');
assert.equal(initial.booleanHeaderAlignment, 'center', 'boolean field headers should follow the centered control axis');
assert.ok(Math.abs(initial.companyHeaderLeft - initial.companyValueLeft) <= 1, 'primary text header should align with its values');
assert.ok(Math.abs(initial.workModeHeaderLeft - initial.workModeValueLeft) <= 1, 'plain text header should align with its values');
assert.ok(Math.abs(initial.salaryHeaderRight - initial.salaryValueRight) <= 1, 'salary header should align with the numeric edge');
assert.ok(Math.abs(initial.scoreHeaderRight - initial.scoreValueRight) <= 1, 'formula number header should align with the numeric edge');
assert.ok(Math.abs(initial.booleanHeaderCenter - initial.booleanValueCenter) <= 1, 'checkbox header should align with the control center');
assert.equal(initial.ordinaryVerticalLine, '0px', 'ordinary fields should not form a vertical cage');
assert.equal(initial.ordinaryHorizontalLine, '1px', 'records should use one quiet horizontal separator');
assert.equal(initial.headerRule, '2px', 'field headers should terminate in one authoritative rule');
assert.match(initial.frozenColumnEdge, /rgb\(217, 221, 215\)/, 'frozen column should use one structural edge');
assert.match(initial.activeCellEdge, /rgb\(115, 99, 181\)/, 'active data edge should use the single editorial accent');
assert.equal(initial.cellBackgroundImage, 'none', 'table cells should not use hatching or gradients');
assert.equal(initial.rowHeight, 42, 'Editorial V2 should inherit the approved 42px row rhythm');
assert.equal(initial.companyFontSize, '14.5px', 'primary record text should use the approved 14.5px size');
assert.equal(initial.companyDirection, 'row', 'primary record metadata should stay on one aligned line');
assert.equal(initial.companyLogoDisplay, 'none', 'primary records should be led by typography rather than decorative logos');
assert.equal(initial.stageTagHeight, 24, 'stage tags should remain compact values rather than buttons');
assert.equal(initial.stageTagFontSize, '12px', 'stage tags should use the approved 12px text');
assert.equal(initial.stageTagBorderWidth, '0px', 'stage tags should not add another box line');
assert.equal(initial.workModeBorderWidth, '0px', 'secondary categorical fields should not all become boxed tags');
assert.equal(initial.workModeBackground, 'rgba(0, 0, 0, 0)', 'plain categorical values should not retain a chip background');
assert.equal(initial.workModePaddingLeft, '0px', 'plain categorical values should align with ordinary cell text');
assert.equal(initial.oddRowBackground, initial.evenRowBackground, 'ordinary rows should not introduce zebra-striping noise');
assert.equal(initial.oddFrozenBackground, initial.evenFrozenBackground, 'the frozen primary field should preserve the same paper surface across rows');
assert.equal(initial.visibleScoreRings, 0, 'fit numbers should remain primary instead of repeating a ring in every row');
assert.equal(initial.fieldTypeIconDisplay, 'none', 'field type icons should move out of the default reading layer');
assert.equal(initial.multiSelectColumnCount, 20, 'each visible record should render the multi-select field');
assert.ok(initial.multiSelectValueCount > 0, 'multi-select columns should contain real populated combinations');
assert.ok(initial.maxVisibleSkillTags <= 2, 'multi-select cells should show at most two tags before overflow');
assert.ok(initial.skillOverflowCount > 0, 'multi-select cells should expose a +N overflow state');
assert.equal(initial.skillTagPaletteCount, 1, 'skill tags should use one coherent neutral palette');
assert.ok(initial.stageTagPaletteCount >= 5, 'single-select stage tags should retain semantic option colors');
assert.equal(initial.checkboxCellCount, 20, 'each visible record should render the checkbox field');
assert.equal(initial.linkColumnCount, 20, 'each visible record should render the link field');
assert.ok(initial.linkCellCount < initial.linkColumnCount, 'link fields should include real empty states');
assert.equal(initial.attachmentColumnCount, 20, 'each visible record should render the attachment field');
assert.ok(initial.attachmentCellCount < initial.attachmentColumnCount, 'attachment fields should include real empty states');
assert.ok(initial.multipleAttachmentCount > 0, 'attachment fields should include a multiple-file state');
assert.equal(initial.dateTimeCellCount, 20, 'each visible record should render the date-time field');
assert.equal(initial.progressCellCount, 20, 'each visible record should render the formatted numeric progress field');
assert.equal(initial.noteColumnCount, 20, 'each visible record should render the multi-line text projection');
assert.ok(initial.emptyCellCount >= 20, 'typed fields should exercise visible empty-value states');
assert.deepEqual(initial.emptyCellGlyphs, ['—'], 'all empty typed cells should share one quiet glyph');
assert.equal(initial.emptyCellBorderWidth, '0px', 'empty values should not become fake boxed controls');
assert.ok(initial.clippedValueCount > 0, 'long values should exercise real one-line ellipsis behavior');
assert.equal(initial.rightFieldFontSize, '12.5px', 'right-side secondary values should stay subordinate to primary data');
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

await page.locator('[data-long-cell="aster"]').click();
await page.waitForSelector('#cell-reader:not([hidden])');
const truncatedLongText = await page.evaluate(() => {
  const row = document.querySelector('tr[data-record-id="aster"]');
  const note = row?.querySelector('.note-cell');
  return {
    activeCellName: document.querySelector('#active-cell-name')?.textContent,
    formulaValue: document.querySelector('#formula-input')?.value,
    formulaState: document.querySelector('.formula-state')?.textContent?.trim(),
    readerTitle: document.querySelector('#cell-reader-title')?.textContent,
    readerCopy: document.querySelector('#cell-reader-copy')?.textContent,
    readerCount: document.querySelector('#cell-reader-count')?.textContent,
    activeLongCells: document.querySelectorAll('.active-long-cell').length,
    suspendedRangeCells: document.querySelectorAll('.selected-range.is-suspended-range').length,
    suspendedFormulaEdge: getComputedStyle(document.querySelector('.active-cell')).boxShadow,
    rowHeight: row?.querySelector('td')?.getBoundingClientRect().height ?? 0,
    noteWhiteSpace: note ? getComputedStyle(note).whiteSpace : '',
    noteClipped: note ? note.scrollWidth > note.clientWidth : false,
  };
});
assert.equal(truncatedLongText.activeCellName, 'Q2', 'name box should follow the selected long-text cell');
assert.match(truncatedLongText.formulaValue, /年度调薪与远程政策/, 'formula bar should expose the complete raw text value');
assert.equal(truncatedLongText.formulaState, '文本值', 'formula bar should identify text rather than formula state');
assert.equal(truncatedLongText.readerTitle, 'Q2 · 备注', 'cell reader should identify the field and row');
assert.match(truncatedLongText.readerCopy, /试用期结束后的调整空间/, 'cell reader should expose the complete long value');
assert.match(truncatedLongText.readerCount, /^\d+ 字$/, 'cell reader should expose the raw character count');
assert.equal(truncatedLongText.activeLongCells, 1, 'only one long-text cell should be active');
assert.equal(truncatedLongText.suspendedRangeCells, 5, 'the previous range should be suspended while another cell owns focus');
assert.equal(truncatedLongText.suspendedFormulaEdge, 'none', 'the previous formula cell should not leave a second active outline');
assert.equal(truncatedLongText.rowHeight, 42, 'opening the reader should not disturb the approved compact row rhythm');
assert.equal(truncatedLongText.noteWhiteSpace, 'nowrap', 'long text should default to one aligned line');
assert.equal(truncatedLongText.noteClipped, true, 'long text should visibly exercise ellipsis');
await page.screenshot({ path: path.join(dir, 'preview-long-text.png') });

await page.click('[data-cell-display="wrap"]');
const wrappedLongText = await page.evaluate(() => {
  const row = document.querySelector('tr[data-record-id="aster"]');
  const note = row?.querySelector('.note-cell');
  return {
    wrappedRows: document.querySelectorAll('.has-wrapped-cell').length,
    rowHeight: row?.querySelector('td')?.getBoundingClientRect().height ?? 0,
    noteWhiteSpace: note ? getComputedStyle(note).whiteSpace : '',
    lineClamp: note ? getComputedStyle(note).webkitLineClamp : '',
    scope: document.querySelector('.formula-scope')?.textContent,
  };
});
assert.equal(wrappedLongText.wrappedRows, 1, 'only the active row should expand for wrapped text');
assert.equal(wrappedLongText.rowHeight, 92, 'auto-wrap should expand the active row to a bounded three-line rhythm');
assert.equal(wrappedLongText.noteWhiteSpace, 'normal', 'auto-wrap should restore natural word wrapping');
assert.equal(wrappedLongText.lineClamp, '3', 'auto-wrap should remain bounded to three lines');
assert.match(wrappedLongText.scope, /自动换行/, 'formula metadata should expose the current cell display mode');
await page.screenshot({ path: path.join(dir, 'preview-long-text-wrap.png') });

await page.click('#close-cell-reader');
assert.equal(await page.locator('#cell-reader').isHidden(), true);
assert.equal(await page.textContent('#active-cell-name'), 'J6');
assert.match(await page.inputValue('#formula-input'), /^=IF\(AND\(G6>=85,H6>=7\)/);
await page.locator('.table-viewport').evaluate((viewport) => {
  viewport.scrollLeft = 0;
});

await page.click('#theme-toggle');
assert.equal(await page.getAttribute('body', 'data-theme'), 'dark');
assert.match(await page.getAttribute('#theme-toggle', 'aria-label'), /浅色/);
await page.screenshot({ path: path.join(dir, 'preview-dark.png') });
await page.click('#theme-toggle');
assert.equal(await page.getAttribute('body', 'data-theme'), 'light');

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
    vertical: initial.ordinaryVerticalLine,
    row: initial.ordinaryHorizontalLine,
    structural: initial.headerRule,
    active: initial.activeCellEdge,
  },
  localLinks: localHrefs.length,
  viewsChecked: ['table', 'board', 'calendar', 'gallery', 'dashboard'],
  flowsChecked: ['long-text-reader', 'bounded-row-wrap', 'theme-switch', 'number-format', 'conditional-format', 'field-type-select', 'formula-library', 'selection-statistics', 'compute-plan-accept', 'data-boundary', 'mobile-consumption'],
  screenshots: ['preview.png', 'preview-table.png', 'preview-table-types.png', 'preview-long-text.png', 'preview-long-text-wrap.png', 'preview-dark.png', 'preview-format.png', 'preview-conditional.png', 'preview-fields.png', 'preview-formula.png', 'preview-gallery.png', 'preview-dashboard.png', 'preview-plan.png', 'preview-mobile.png'],
}, null, 2));
