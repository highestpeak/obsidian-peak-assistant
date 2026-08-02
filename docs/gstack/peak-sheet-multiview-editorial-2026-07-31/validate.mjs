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

async function settleMotion() {
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
}

await page.goto(pathToFileURL(htmlPath).href);
await page.waitForSelector('.record-table');
await page.locator('.view-stage > *').evaluate(async (view) => {
  await Promise.all(view.getAnimations().map((animation) => animation.finished));
});

const initial = await page.evaluate(() => ({
  bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  appWidth: document.querySelector('.app-shell')?.getBoundingClientRect().width ?? 0,
  appHeight: document.querySelector('.app-shell')?.getBoundingClientRect().height ?? 0,
  appOverflow: getComputedStyle(document.querySelector('.app-shell')).overflow,
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
  motionBase: getComputedStyle(document.body).getPropertyValue('--motion-base').trim(),
  viewAnimationName: getComputedStyle(document.querySelector('.view-stage > *')).animationName,
  buttonTransitionDuration: getComputedStyle(document.querySelector('.tool-button')).transitionDuration,
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
  searchLeft: document.querySelector('.toolbar-record-search')?.getBoundingClientRect().left ?? Infinity,
  searchWidth: document.querySelector('.toolbar-record-search')?.getBoundingClientRect().width ?? 0,
  tableCommandBars: document.querySelectorAll('#table-command-bar').length,
  duplicateViewSearches: document.querySelectorAll('.view-tab-actions [aria-label*="搜索"]').length,
  toolbarOverflow: (() => {
    const toolbar = document.querySelector('.toolbar-primary');
    return toolbar ? toolbar.scrollWidth - toolbar.clientWidth : Infinity;
  })(),
  searchToFieldsGap: (() => {
    const search = document.querySelector('.toolbar-record-search')?.getBoundingClientRect();
    const fields = document.querySelector('#open-fields')?.getBoundingClientRect();
    return search && fields ? fields.left - search.right : Infinity;
  })(),
  dataActionGap: (() => {
    const dedupe = document.querySelector('#open-dedupe')?.getBoundingClientRect();
    const analysis = document.querySelector('#open-ai')?.getBoundingClientRect();
    return dedupe && analysis ? analysis.left - dedupe.right : Infinity;
  })(),
  dedupeHitTarget: (() => {
    const rect = document.querySelector('#open-dedupe')?.getBoundingClientRect();
    return rect ? [rect.width, rect.height] : [0, 0];
  })(),
  analysisHitTarget: (() => {
    const rect = document.querySelector('#open-ai')?.getBoundingClientRect();
    return rect ? [rect.width, rect.height] : [0, 0];
  })(),
  fieldHeaderFontSize: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(2)')).fontSize,
  textHeaderAlignment: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(5) .field-heading')).justifyContent,
  numericHeaderAlignment: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(9) .field-heading')).justifyContent,
  booleanHeaderAlignment: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(14) .field-heading')).justifyContent,
  companyHeaderLeft: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(2) .field-heading > span')?.getBoundingClientRect().left ?? 0,
  companyValueLeft: document.querySelector('tr[data-record-id="aster"] .company-cell strong')?.getBoundingClientRect().left ?? 0,
  workModeHeaderLeft: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(5) .field-heading > span')?.getBoundingClientRect().left ?? 0,
  workModeValueLeft: document.querySelector('tr[data-record-id="aster"] .work-mode')?.getBoundingClientRect().left ?? 0,
  salaryHeaderRight: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(8) .field-heading > span')?.getBoundingClientRect().right ?? 0,
  salaryValueRight: document.querySelector('tr[data-record-id="aster"] .salary')?.getBoundingClientRect().right ?? 0,
  scoreHeaderRight: document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(9) .field-heading > span')?.getBoundingClientRect().right ?? 0,
  scoreValueRight: document.querySelector('tr[data-record-id="aster"] .score-cell strong')?.getBoundingClientRect().right ?? 0,
  booleanHeaderCenter: (() => {
    const rect = document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(14) .field-heading > span')?.getBoundingClientRect();
    return rect ? rect.left + rect.width / 2 : 0;
  })(),
  booleanValueCenter: (() => {
    const rect = document.querySelector('tr[data-record-id="aster"] .boolean-cell')?.getBoundingClientRect();
    return rect ? rect.left + rect.width / 2 : 0;
  })(),
  ordinaryVerticalLine: getComputedStyle(document.querySelector('.record-table td:nth-child(5)')).borderRightWidth,
  ordinaryHorizontalLine: getComputedStyle(document.querySelector('.record-table td:nth-child(5)')).borderBottomWidth,
  headerRule: getComputedStyle(document.querySelector('.record-table thead tr:nth-child(2) th:nth-child(5)')).borderBottomWidth,
  frozenColumnEdge: getComputedStyle(document.querySelector('.record-table td:nth-child(2)')).boxShadow,
  activeCellEdge: getComputedStyle(document.querySelector('.record-table .active-cell')).boxShadow,
  cellBackgroundImage: getComputedStyle(document.querySelector('.record-table td:nth-child(5)')).backgroundImage,
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
  oddRowBackground: getComputedStyle(document.querySelector('tr[data-record-id="aster"] td:nth-child(5)')).backgroundColor,
  evenRowBackground: getComputedStyle(document.querySelector('tr[data-record-id="tide"] td:nth-child(5)')).backgroundColor,
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
assert.equal(initial.appOverflow, 'clip', 'the off-canvas AI drawer must not turn the app shell into a hidden scroll container');
assert.equal(initial.workspaceWidth, 1600, 'single Dataset workspace should own the full viewport width');
assert.equal(initial.sidebarCount, 0, 'mock should not duplicate Obsidian navigation with an app sidebar');
assert.equal(initial.tableRows, 20, 'table fixture should render twenty visible records');
assert.equal(initial.groupRows, 0, 'initial table should preserve the continuous computational grid');
assert.equal(initial.activeView, 'table', 'table should be the initial view');
assert.equal(initial.frozenColumnPosition, 'sticky', 'primary record field should be frozen');
assert.equal(initial.columnLetters, 18, 'table should expose spreadsheet column letters A-R');
assert.equal(initial.typedFieldHeaders, 18, 'table should expose eighteen typed Dataset fields');
assert.equal(initial.rowNumbers, 20, 'table should expose stable row numbers');
assert.equal(initial.firstRecordCellCount, 19, 'each record row should align with the row header plus eighteen fields');
assert.equal(initial.selectedRangeCells, 5, 'initial grid should show the H2:H6 selection');
assert.equal(initial.activeCells, 1, 'initial grid should show one active formula cell');
assert.equal(initial.selectionStatistics, 5, 'status bar should expose count, sum, average, min and max');
assert.equal(initial.formulaColumns, 3, 'table should identify three computed columns');
assert.equal(initial.activeCellName, 'K6', 'formula name box should identify the active cell');
assert.match(initial.formulaValue, /^=IF\(AND\(H6>=85,I6>=7\)/, 'formula bar should expose the active formula');
assert.equal(initial.theme, 'light', 'Editorial V2 should default to the approved Paper direction');
assert.equal(initial.visualVersion, 'editorial-v2', 'mock should expose an explicit independent visual version');
assert.equal(initial.canvasColor, '#eef0ec', 'Paper canvas should use a warm mineral grey');
assert.equal(initial.motionBase, '180ms', 'motion should use one shared interaction timing token');
assert.equal(initial.viewAnimationName, 'editorial-view-enter', 'view changes should use the restrained editorial entrance');
assert.match(initial.buttonTransitionDuration, /0.12s/, 'toolbar actions should expose fast state transitions');
assert.deepEqual(initial.headerHeights, [52, 38, 38, 32, 0], 'toolbar search should not create a separate oversized command band');
assert.ok(new Set(initial.headerBackgrounds).size <= 1, 'Header bands should remain within one continuous paper hierarchy');
assert.equal(initial.toolbarDividerWidth, 0, 'toolbar groups should use spacing instead of vertical divider cages');
assert.ok(initial.searchLeft > 80 && initial.searchLeft < 260, 'record search should follow Add Record inside the primary toolbar');
assert.ok(initial.searchWidth >= 188 && initial.searchWidth <= 230, 'record search should stay compact instead of becoming a full-width frame');
assert.equal(initial.tableCommandBars, 0, 'the obsolete separate search rail should be removed');
assert.equal(initial.duplicateViewSearches, 0, 'the view header should not retain a second remote search entry');
assert.ok(initial.toolbarOverflow <= 0, 'the redesigned primary toolbar should remain fully reachable at 1600px');
assert.ok(initial.searchToFieldsGap >= 0 && initial.searchToFieldsGap <= 8, 'search and field controls should remain one reachable sequence');
assert.ok(initial.dataActionGap >= 0 && initial.dataActionGap <= 8, 'data quality and AI analysis should remain adjacent rather than scattered');
assert.ok(initial.dedupeHitTarget[0] >= 50 && initial.dedupeHitTarget[1] >= 28, 'duplicate checking should expose a practical toolbar hit target');
assert.ok(initial.analysisHitTarget[0] >= 50 && initial.analysisHitTarget[1] >= 28, 'AI analysis should expose a practical toolbar hit target');
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
await page.locator('.active-cell.is-suspended-active').evaluate(async (cell) => {
  await Promise.all(cell.getAnimations().map((animation) => animation.finished));
});
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
assert.equal(truncatedLongText.activeCellName, 'R2', 'name box should follow the selected long-text cell');
assert.match(truncatedLongText.formulaValue, /年度调薪与远程政策/, 'formula bar should expose the complete raw text value');
assert.equal(truncatedLongText.formulaState, '文本值', 'formula bar should identify text rather than formula state');
assert.equal(truncatedLongText.readerTitle, 'R2 · 备注', 'cell reader should identify the field and row');
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
assert.equal(await page.textContent('#active-cell-name'), 'K6');
assert.match(await page.inputValue('#formula-input'), /^=IF\(AND\(H6>=85,I6>=7\)/);
await page.locator('.table-viewport').evaluate((viewport) => {
  viewport.scrollLeft = 0;
});

const asterLocation = page.locator('tr[data-record-id="aster"] td[data-field="location"]');
await asterLocation.dblclick();
await page.waitForSelector('tr[data-record-id="aster"] td[data-field="location"].is-editing .cell-editor');
assert.equal(await page.getAttribute('.cell-editor', 'aria-label'), '编辑 地点');
await page.locator('.cell-editor').fill('Auckland CBD');
assert.equal(await page.inputValue('#formula-input'), 'Auckland CBD', 'formula bar should mirror the in-progress cell value');
assert.equal(await page.locator('#formula-bar').getAttribute('class'), 'formula-bar is-plain-cell', 'plain text cells must not be misread as AI formula prompts');
assert.equal(await page.locator('#generate-inline-formula').isHidden(), true, 'AI generation belongs to computed-field context');
await page.screenshot({ path: path.join(dir, 'preview-cell-edit.png') });
await page.locator('.cell-editor').press('Enter');
assert.equal((await asterLocation.textContent())?.trim(), 'Auckland CBD');
assert.equal(await page.textContent('#active-cell-name'), 'E2');
assert.match(await page.textContent('#status-secondary'), /双击或 Enter 编辑/);
assert.equal(await page.locator('.cell-editor').count(), 0);

const tideCompany = page.locator('tr[data-record-id="tide"] td[data-field="company"]');
await tideCompany.dblclick();
await page.locator('.cell-editor').fill('Temporary Company');
await page.locator('.cell-editor').press('Escape');
assert.equal((await tideCompany.locator('.company-cell strong').textContent())?.trim(), 'Tide Systems');

const tideRole = page.locator('tr[data-record-id="tide"] td[data-field="role"]');
await tideRole.dblclick();
await page.locator('.cell-editor').fill('Principal Frontend Engineer');
await page.locator('.cell-editor').press('Enter');
assert.equal((await tideRole.textContent())?.trim(), 'Principal Frontend Engineer', 'role should be an independent editable field');

const asterWorkMode = page.locator('tr[data-record-id="aster"] td[data-field="workMode"]');
await asterWorkMode.dblclick();
await page.locator('select.cell-editor').selectOption('On-site');
assert.equal((await asterWorkMode.textContent())?.trim(), 'On-site');

const asterFit = page.locator('tr[data-record-id="aster"] td[data-field="fit"]');
await asterFit.dblclick();
await page.locator('input.cell-editor[type="number"]').fill('93');
await page.locator('.cell-editor').press('Enter');
assert.equal((await asterFit.locator('.score-cell strong').textContent())?.trim(), '93');

const asterNext = page.locator('tr[data-record-id="aster"] td[data-field="next"]');
await asterNext.scrollIntoViewIfNeeded();
await asterNext.focus();
await asterNext.press('F2');
assert.equal(await page.locator('input.cell-editor').count(), 1, 'F2 should enter inline editing');
await page.locator('.cell-editor').press('Escape');
assert.match(await asterNext.textContent(), /薪资与成长路径比较/);

const tideLocation = page.locator('tr[data-record-id="tide"] td[data-field="location"]');
await tideLocation.dblclick();
await page.locator('.cell-editor').fill('Wellington Central');
await page.locator('.cell-editor').press('Tab');
assert.equal((await tideLocation.textContent())?.trim(), 'Wellington Central');
assert.equal(
  await page.getAttribute('tr[data-record-id="tide"] td.is-current-cell', 'data-field'),
  'applied',
  'Tab should commit and advance to the next editable field',
);

const asterStarred = page.locator('tr[data-record-id="aster"] td[data-field="starred"]');
await asterStarred.scrollIntoViewIfNeeded();
assert.equal(await asterStarred.locator('.boolean-cell').getAttribute('aria-checked'), 'true');
const checkboxViewportBefore = await page.locator('.table-viewport').evaluate((viewport) => {
  viewport.dataset.continuityProbe = 'checkbox';
  viewport.continuityTable = viewport.querySelector('.record-table');
  return {
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
  };
});
assert.ok(checkboxViewportBefore.scrollLeft > 0, 'right-side checkbox should exercise a horizontally scrolled viewport');
await asterStarred.locator('.boolean-cell').click();
assert.equal(await asterStarred.locator('.boolean-cell').getAttribute('aria-checked'), 'false');
const checkboxViewportAfter = await page.locator('.table-viewport').evaluate((viewport) => ({
  sameViewport: viewport.dataset.continuityProbe === 'checkbox',
  sameTable: viewport.continuityTable === viewport.querySelector('.record-table'),
  scrollLeft: viewport.scrollLeft,
  scrollTop: viewport.scrollTop,
}));
assert.equal(checkboxViewportAfter.sameViewport, true, 'checkbox commit should not replace the table viewport');
assert.equal(checkboxViewportAfter.sameTable, true, 'checkbox commit should not rebuild the record table');
assert.ok(
  Math.abs(checkboxViewportAfter.scrollLeft - checkboxViewportBefore.scrollLeft) <= 1,
  'checkbox commit should preserve horizontal scroll position',
);
assert.ok(
  Math.abs(checkboxViewportAfter.scrollTop - checkboxViewportBefore.scrollTop) <= 1,
  'checkbox commit should preserve vertical scroll position',
);

const asterSkills = page.locator('tr[data-record-id="aster"] td[data-field="skills"]');
await asterSkills.dblclick();
await page.locator('input.cell-editor').fill('Product Strategy, Systems Thinking');
const textViewportBefore = await page.locator('.table-viewport').evaluate((viewport) => {
  viewport.dataset.continuityProbe = 'text';
  viewport.continuityTable = viewport.querySelector('.record-table');
  return {
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
  };
});
await page.locator('.cell-editor').press('Enter');
assert.match(await asterSkills.textContent(), /Product Strategy/);
const textViewportAfter = await page.locator('.table-viewport').evaluate((viewport) => ({
  sameViewport: viewport.dataset.continuityProbe === 'text',
  sameTable: viewport.continuityTable === viewport.querySelector('.record-table'),
  scrollLeft: viewport.scrollLeft,
  scrollTop: viewport.scrollTop,
}));
assert.equal(textViewportAfter.sameViewport, true, 'text commit should not replace the table viewport');
assert.equal(textViewportAfter.sameTable, true, 'text commit should not rebuild the record table');
assert.ok(
  Math.abs(textViewportAfter.scrollLeft - textViewportBefore.scrollLeft) <= 1,
  'text commit should preserve horizontal scroll position',
);
assert.ok(
  Math.abs(textViewportAfter.scrollTop - textViewportBefore.scrollTop) <= 1,
  'text commit should preserve vertical scroll position',
);

const pohutukawaCompany = page.locator('tr[data-record-id="pohutukawa"] td[data-field="company"]');
await pohutukawaCompany.click();
const frozenSelection = await page.evaluate(() => {
  const current = document.querySelector('tr[data-record-id="pohutukawa"] td[data-field="company"]');
  const reference = document.querySelector('tr[data-record-id="southern"] td[data-field="company"]');
  const currentRect = current?.getBoundingClientRect();
  const referenceRect = reference?.getBoundingClientRect();
  const style = current ? getComputedStyle(current) : null;
  return {
    position: style?.position ?? '',
    overflow: style?.overflow ?? '',
    leftDelta: currentRect && referenceRect ? currentRect.left - referenceRect.left : Infinity,
    rightDelta: currentRect && referenceRect ? currentRect.right - referenceRect.right : Infinity,
  };
});
assert.equal(frozenSelection.position, 'sticky', 'selected primary cells should remain frozen');
assert.equal(frozenSelection.overflow, 'hidden', 'selected cells should keep their outline inside the cell');
assert.ok(Math.abs(frozenSelection.leftDelta) <= 1, 'selected frozen cells should not drift from the column axis');
assert.ok(Math.abs(frozenSelection.rightDelta) <= 1, 'selected frozen cells should not cover adjacent fields');
await page.screenshot({ path: path.join(dir, 'preview-frozen-selection.png') });

await pohutukawaCompany.dblclick();
const frozenEditor = await pohutukawaCompany.evaluate((cell) => {
  const style = getComputedStyle(cell);
  return {
    position: style.position,
    overflow: style.overflow,
    boxShadow: style.boxShadow,
  };
});
assert.equal(frozenEditor.position, 'sticky', 'editing should not replace frozen-cell positioning');
assert.equal(frozenEditor.overflow, 'hidden', 'editing controls should stay clipped to the cell');
assert.doesNotMatch(frozenEditor.boxShadow, /6px 18px/, 'editing should not add a floating elevation shadow');
await page.locator('.cell-editor').press('Escape');

const ordinaryCell = page.locator('tr[data-record-id="southern"] td[data-field="workMode"]');
const ordinaryBackground = await ordinaryCell.evaluate((cell) => getComputedStyle(cell).backgroundColor);
await ordinaryCell.hover();
const hoveredBackground = await ordinaryCell.evaluate((cell) => getComputedStyle(cell).backgroundColor);
assert.equal(hoveredBackground, ordinaryBackground, 'row hover should not recolor or lift the table surface');

const asterPriority = page.locator('tr[data-record-id="aster"] td[data-field="priority"]');
await asterPriority.scrollIntoViewIfNeeded();
await asterPriority.dblclick();
assert.equal(await asterPriority.locator('.cell-editor').count(), 0, 'computed cells should remain read-only');
assert.equal((await page.textContent('#toast-title'))?.trim(), '这是只读字段');
assert.match(await page.inputValue('#formula-input'), /^=IF\(AND\(H2>=85,I2>=7\)/);

await page.locator('.table-viewport').evaluate((viewport) => { viewport.scrollLeft = 0; });
const rangeStart = page.locator('tr[data-record-id="fern"] td[data-field="role"]');
const rangeEnd = page.locator('tr[data-record-id="northstar"] td[data-field="next"]');
const startBox = await rangeStart.boundingBox();
const endBox = await rangeEnd.boundingBox();
assert.ok(startBox && endBox, 'range endpoints should be visible before drag selection');
await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
await page.mouse.down();
await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 12 });
await page.mouse.up();
assert.equal(await page.locator('.record-table td.selected-range').count(), 36, 'dragging should select a 4 × 9 rectangular cell range');
assert.equal(await page.locator('.record-table td.selected-range.range-top').count(), 9);
assert.equal(await page.locator('.record-table td.selected-range.range-bottom').count(), 9);
assert.equal(await page.locator('.record-table td.selected-range.range-left').count(), 4);
assert.equal(await page.locator('.record-table td.selected-range.range-right').count(), 4);
assert.equal(await page.locator('.record-table td.range-anchor').count(), 1, 'range selection should keep one active anchor cell');
assert.equal(await page.evaluate(() => window.getSelection()?.toString() ?? ''), '', 'cell dragging must not leak into browser text selection');
assert.equal((await page.textContent('#status-primary'))?.trim(), 'B4:J7');
assert.match(await page.textContent('#status-secondary'), /36 个单元格/);
assert.equal((await page.locator('.selection-statistics b').first().textContent())?.trim(), '36');
await page.screenshot({ path: path.join(dir, 'preview-cell-range.png') });
await rangeStart.click();
assert.equal(await page.locator('.record-table td.selected-range').count(), 0, 'a normal click should collapse the range back to one cell');
assert.match(await rangeStart.getAttribute('class'), /is-current-cell/);
await page.keyboard.press('F2');
assert.equal(await rangeStart.locator('.cell-editor').count(), 1, 'a clicked cell should retain keyboard editing focus');
await page.keyboard.press('Escape');

await page.click('[data-view="board"]');
await page.waitForSelector('.board-view');
await page.click('[data-view="table"]');
await page.waitForSelector('.record-table');
await settleMotion();
assert.equal(await page.locator('.record-table .selected-range').count(), 5);
assert.equal(await page.locator('.record-table .active-cell').count(), 1);
assert.equal((await page.locator('.selection-statistics b').nth(1).textContent())?.trim(), '442');
assert.equal((await page.locator('.selection-statistics b').nth(2).textContent())?.trim(), '88.4');
await page.locator('.table-viewport').evaluate((viewport) => {
  viewport.scrollLeft = 0;
});

await page.click('#theme-toggle');
assert.equal(await page.getAttribute('body', 'data-theme'), 'dark');
assert.match(await page.getAttribute('#theme-toggle', 'aria-label'), /浅色/);
await settleMotion();
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
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-format.png') });
assert.equal(await page.locator('#conditional-panel, #open-conditional-format, #open-conditional-from-menu').count(), 0, 'conditional formatting should not remain in this mock');
await page.click('#close-format-menu');

await page.click('#open-fields');
await page.waitForSelector('#field-panel:not([hidden])');
await settleMotion();
const fieldPanelAnchor = await page.evaluate(() => {
  const trigger = document.querySelector('#open-fields')?.getBoundingClientRect();
  const panel = document.querySelector('#field-panel')?.getBoundingClientRect();
  return {
    leftDelta: trigger && panel ? panel.left - trigger.left : Infinity,
    topGap: trigger && panel ? panel.top - trigger.bottom : Infinity,
  };
});
assert.ok(Math.abs(fieldPanelAnchor.leftDelta) <= 1, 'field panel should align to the Fields trigger');
assert.ok(fieldPanelAnchor.topGap >= 4 && fieldPanelAnchor.topGap <= 7, 'field panel should open directly under the toolbar');
assert.match(await page.textContent('#field-panel'), /字段类型/);
assert.match(await page.textContent('#field-panel'), /单选/);
assert.match(await page.textContent('#field-panel'), /公司/);
assert.match(await page.textContent('#field-panel'), /职位/);
assert.equal(await page.locator('.field-list > button:not(.field-add)').count(), 18);
await page.click('[data-field-key="role"]');
assert.equal(await page.inputValue('#field-name-input'), '职位', 'the persistent field list should switch the editor in place');
await page.click('[data-field-key="stage"]');
assert.equal(await page.inputValue('#field-name-input'), '阶段');
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
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-fields.png') });
await page.click('[data-field-type="公式"]');
assert.equal(await page.locator('#field-panel').isVisible(), true, 'choosing a field type must not close the workbench');
assert.equal(await page.locator('#formula-panel').isHidden(), true, 'field type selection should not prematurely launch formula candidates');
await page.click('#save-fields');
assert.equal(await page.locator('#field-panel').isVisible(), true, 'saving one field must keep the workbench open');
assert.match(await page.textContent('#field-save-status'), /可继续选择其他字段/);
await page.click('#add-field');
assert.equal(await page.locator('.field-list > button:not(.field-add)').count(), 19, 'Add Field should create a selectable draft in the persistent list');
await page.fill('#field-name-input', '负责人');
await page.click('#save-fields');
assert.equal(await page.locator('#field-panel').isVisible(), true);
assert.match(await page.textContent('#field-count'), /19 个字段/);
assert.match(await page.textContent('.field-list'), /负责人/);
await page.screenshot({ path: path.join(dir, 'preview-field-added.png') });
await page.click('#close-fields');
assert.equal(await page.locator('.record-table thead tr:nth-child(2) th:not(.row-number-header)').count(), 19, 'saved fields should become real table columns');
assert.equal(await page.locator('.record-table .column-letters th:not(.sheet-corner)').count(), 19);
assert.match(await page.textContent('.record-table .column-letters'), /S/);

assert.equal(await page.locator('#formula-panel').isHidden(), true, 'the candidate surface should remain closed before formula-bar submission');
await page.fill('#formula-input', 'Offer 需要立即决策，其余高匹配且等待七天的岗位优先跟进');
assert.match(await page.getAttribute('#formula-bar', 'class'), /is-ai-entry/, 'natural language in the existing formula input should switch to AI mode automatically');
assert.equal(await page.locator('#generate-inline-formula').isVisible(), true, 'the generation action should appear inside the existing formula bar');
assert.match(await page.textContent('.formula-state'), /AI 规则/);
assert.match(await page.textContent('.formula-scope'), /Enter 生成候选/);
assert.equal(await page.locator('#formula-panel').isHidden(), true, 'typing the rule should stay in place and not open a second composer');
const formulaBarGeometry = await page.evaluate(() => {
  const bar = document.querySelector('#formula-bar')?.getBoundingClientRect();
  const input = document.querySelector('#formula-input')?.getBoundingClientRect();
  const actions = document.querySelector('.formula-entry-actions')?.getBoundingClientRect();
  const style = document.querySelector('#formula-input')
    ? getComputedStyle(document.querySelector('#formula-input'))
    : null;
  return {
    inputHeight: input?.height ?? 0,
    inputBottomGap: bar && input ? bar.bottom - input.bottom : -1,
    actionGap: input && actions ? actions.left - input.right : Infinity,
    rightClearance: actions ? window.innerWidth - actions.right : -1,
    borderBottomWidth: style?.borderBottomWidth ?? '0px',
    focusEdge: style?.boxShadow ?? 'none',
  };
});
assert.equal(formulaBarGeometry.inputHeight, 28, 'the formula input should leave room for a complete focus edge');
assert.ok(formulaBarGeometry.inputBottomGap >= 1, 'the lower focus edge must remain inside the formula band');
assert.ok(formulaBarGeometry.actionGap >= 4 && formulaBarGeometry.actionGap <= 6, 'AI actions should follow the formula input instead of floating at the far edge');
assert.ok(formulaBarGeometry.rightClearance >= 360, 'AI actions should stay in the primary reading area on a wide table');
assert.equal(formulaBarGeometry.borderBottomWidth, '1px');
assert.notEqual(formulaBarGeometry.focusEdge, 'none', 'focused formula input should expose a complete inset edge');
await page.screenshot({ path: path.join(dir, 'preview-formula-inline.png') });
await page.setViewportSize({ width: 980, height: 1000 });
const compactFormulaActions = await page.evaluate(() => {
  const actions = document.querySelector('.formula-entry-actions')?.getBoundingClientRect();
  const generate = document.querySelector('#generate-inline-formula')?.getBoundingClientRect();
  return {
    actionsRight: actions?.right ?? Infinity,
    generateWidth: generate?.width ?? 0,
  };
});
assert.ok(compactFormulaActions.actionsRight <= 972, 'formula actions should remain visible at the compact workspace width');
assert.ok(compactFormulaActions.generateWidth >= 72, 'the compact formula action must remain a normal click target');
await page.setViewportSize({ width: 1600, height: 1000 });
await settleMotion();
await page.press('#formula-input', 'Enter');
await page.waitForSelector('#formula-panel:not([hidden])');
await settleMotion();
const formulaSurfaceState = await page.evaluate(() => {
  const panel = document.querySelector('#formula-panel')?.getBoundingClientRect();
  return {
    left: panel?.left ?? -1,
    right: panel?.right ?? Infinity,
    appScrollLeft: document.querySelector('.app-shell')?.scrollLeft ?? -1,
    aiDrawerOpen: document.querySelector('#ai-drawer')?.classList.contains('is-open') ?? true,
  };
});
assert.ok(formulaSurfaceState.left >= 0 && formulaSurfaceState.right <= 1600, 'AI formula surface should remain centered inside the viewport');
assert.equal(formulaSurfaceState.appScrollLeft, 0, 'right-side cell interactions must not shift the entire workspace');
assert.equal(formulaSurfaceState.aiDrawerOpen, false, 'AI formula authoring should not leave the analysis drawer open');
assert.match(await page.textContent('#formula-panel'), /用一句话描述规则/);
assert.match(await page.textContent('#formula-panel'), /重新生成候选/);
assert.match(await page.inputValue('#ai-formula-prompt'), /Offer 需要立即决策/);
assert.equal(await page.locator('[data-formula-candidate]').count(), 3, 'AI formula flow should offer multiple selectable candidates');
assert.equal(await page.locator('[data-function]').count(), 8, 'manual functions should remain a secondary compact escape hatch');
assert.match(await page.textContent('#formula-panel'), /类型检查通过/);
assert.equal(await page.locator('.formula-result-preview > div').count(), 3);
await page.fill('#ai-formula-prompt', 'Offer 需要立即决策，其余高匹配且等待七天的岗位优先跟进');
await page.click('#generate-formula-candidates');
assert.match(await page.textContent('#formula-generation-state'), /刚刚生成/);
await page.click('[data-formula-candidate="stage-aware"]');
assert.equal(await page.locator('[data-formula-candidate="stage-aware"]').getAttribute('class'), 'formula-candidate is-selected');
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-formula.png') });
await page.click('#save-formula');
assert.match(await page.textContent('#toast-title'), /AI 公式已确认/);

await page.click('#open-filter');
await page.waitForSelector('#filter-panel:not([hidden])');
await settleMotion();
assert.equal(await page.locator('.record-table tr[data-record-id]').count(), 20, 'opening Filter must not apply a rule or blank the table');
const filterPanelAnchor = await page.evaluate(() => {
  const trigger = document.querySelector('#open-filter')?.getBoundingClientRect();
  const panel = document.querySelector('#filter-panel')?.getBoundingClientRect();
  return {
    leftDelta: trigger && panel ? panel.left - trigger.left : Infinity,
    topGap: trigger && panel ? panel.top - trigger.bottom : Infinity,
  };
});
assert.ok(Math.abs(filterPanelAnchor.leftDelta) <= 1, 'filter panel should align to the Filter trigger');
assert.ok(filterPanelAnchor.topGap >= 4 && filterPanelAnchor.topGap <= 7, 'filter panel should open directly under the toolbar');
assert.equal(await page.locator('#filter-rules .combination-rule').count(), 2, 'filter should begin with a useful multi-condition draft');
await page.screenshot({ path: path.join(dir, 'preview-filter-panel.png') });
await page.fill('#filter-ai-prompt', '高匹配、等待超过一周、且尚未结束');
await page.click('#generate-filter-rules');
assert.equal(await page.locator('#filter-rules .combination-rule').count(), 3, 'AI filter input should generate a composable condition set');
await page.click('#apply-filter');
const filteredCount = await page.locator('.record-table tr[data-record-id]').count();
assert.ok(filteredCount > 0 && filteredCount < 20, 'an explicit filter should narrow records without producing an accidental blank view');
assert.equal(await page.locator('#filter-line [data-remove-filter]').count(), 3);
assert.match(await page.textContent('#filter-line'), /匹配度 大于等于 85/);
assert.match(await page.textContent('#filter-line'), /阶段 不等于 已结束/);
assert.equal(await page.locator('#filter-count').isHidden(), false);
await page.screenshot({ path: path.join(dir, 'preview-filter-rule.png') });
await page.click('[data-remove-filter="0"]');
assert.equal(await page.locator('#filter-line [data-remove-filter]').count(), 2, 'individual conditions should be removable without clearing the set');
await page.click('#open-filter');
await page.click('#clear-filter');
assert.equal(await page.locator('.record-table tr[data-record-id]').count(), 20);
await page.click('#close-filter');

await page.click('#open-sort');
await page.waitForSelector('#sort-panel:not([hidden])');
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-sort-panel.png') });
assert.equal(await page.locator('#sort-rules .combination-rule').count(), 2);
await page.fill('#sort-ai-prompt', '高匹配优先，其次等待更久，再按申请日期');
await page.click('#generate-sort-rules');
assert.equal(await page.locator('#sort-rules .combination-rule').count(), 3, 'sort should support ordered secondary and tertiary rules');
assert.match(await page.textContent('#sort-preview'), /匹配度 ↓ → 等待天数 ↓ → 申请日期 ↓/);
await page.click('#apply-sort');
assert.equal((await page.locator('.record-table tr[data-record-id]').first().getAttribute('data-record-id')), 'aster');
assert.equal(await page.locator('.record-table .sort-mark').count(), 3, 'each active sort priority should own a numbered direction indicator');
assert.equal(await page.locator('#sort-count').isHidden(), false);
await page.click('#open-sort');
await page.click('#clear-sort');
await page.click('#close-sort');

await page.click('#open-group');
await page.waitForSelector('#group-panel:not([hidden])');
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-group-panel.png') });
assert.equal(await page.locator('#group-rules .combination-rule').count(), 2);
await page.fill('#group-ai-prompt', '先按阶段，再按工作模式分组');
await page.click('#generate-group-rules');
assert.equal(await page.locator('#group-rules .combination-rule').count(), 2);
await page.click('#apply-group');
assert.ok(await page.locator('.record-table .group-row').count() > 3, 'two-level grouping should produce composite groups');
assert.match(await page.textContent('.record-table'), /Remote/);
assert.match(await page.textContent('.record-table'), /Hybrid/);
assert.match(await page.textContent('.record-table'), /On-site/);
assert.match(await page.textContent('#status-secondary'), /阶段 → 工作模式/);
await page.screenshot({ path: path.join(dir, 'preview-group-rule.png') });
await page.click('#open-group');
await page.click('#clear-group');
assert.equal(await page.locator('.record-table .group-row').count(), 0);
await page.click('#close-group');

await page.fill('#record-search', 'Tide Systems');
assert.equal(await page.locator('.record-table tr[data-record-id]').count(), 1, 'table-local search should update the current data surface');
assert.equal((await page.textContent('#query-result'))?.trim(), '1');
await page.fill('#record-search', '');
assert.equal(await page.locator('.record-table tr[data-record-id]').count(), 20);
await page.click('#open-dedupe');
await page.waitForSelector('#dedupe-panel:not([hidden])');
await settleMotion();
assert.equal(await page.locator('[data-dedupe-field].is-selected').count(), 2, 'duplicate checking should default to Company plus Role');
const dedupeFieldHeights = await page.locator('[data-dedupe-field]').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
assert.ok(dedupeFieldHeights.every((height) => height === 32), 'dedupe fields should be real 32px controls rather than tiny secondary copy');
await page.click('[data-dedupe-field="公司"]');
assert.equal(await page.getAttribute('[data-dedupe-field="公司"]', 'aria-pressed'), 'false');
assert.match(await page.textContent('#dedupe-rule-summary'), /^职位/);
await page.click('[data-dedupe-field="公司"]');
assert.equal(await page.getAttribute('[data-dedupe-field="公司"]', 'aria-pressed'), 'true');
assert.match(await page.textContent('#dedupe-rule-summary'), /公司 \+ 职位/);
await page.screenshot({ path: path.join(dir, 'preview-dedupe-panel.png') });
await page.click('#preview-dedupe');
assert.match(await page.textContent('#toast-title'), /2 组可能重复项/);
assert.match(await page.textContent('#toast-copy'), /尚未删除任何记录/);

await page.click('#open-ai');
await page.waitForSelector('#ai-drawer.is-open');
await settleMotion();
assert.equal(await page.locator('.ai-evidence-list article').count(), 3, 'analysis should lead with compact evidence rows rather than repeated cards');
assert.match(await page.textContent('.ai-editorial-lead'), /三条记录已经进入行动窗口/);
assert.match(await page.textContent('.ai-context'), /字段 19/, 'analysis context should follow the live schema after a field is added');
assert.equal(await page.locator('.sheet-copilot-tabs button').count(), 2, 'Sheet analysis should share the Copilot and History session shape');
assert.equal(await page.locator('.sheet-run-receipt').count(), 1, 'analysis should be represented as a session run receipt');
const analysisSurface = await page.locator('#ai-drawer').evaluate((drawer) => ({
  width: drawer.getBoundingClientRect().width,
  radius: getComputedStyle(drawer).borderRadius,
  background: getComputedStyle(drawer).backgroundColor,
}));
assert.equal(analysisSurface.width, 438);
assert.equal(analysisSurface.radius, '0px');
assert.notEqual(analysisSurface.background, 'rgba(0, 0, 0, 0)');
await page.screenshot({ path: path.join(dir, 'preview-analysis.png') });
await page.click('#close-ai');

await page.click('#toggle-stats');
assert.equal(await page.locator('#selection-statistics').isHidden(), true);
await page.click('#toggle-stats');
assert.equal(await page.locator('#selection-statistics').isVisible(), true);

assert.equal(await page.locator('.view-tab[data-view]').count(), 3, 'the fixed view registry should only expose Table, Board and Calendar');
assert.equal(await page.locator('[data-view="gallery"], [data-view="dashboard"]').count(), 0, 'Gallery and Dashboard should not ship as fixed tabs');

await page.click('[data-view="board"]');
await page.waitForSelector('.board-view');
assert.equal(await page.locator('.board-column').count(), 4);
assert.deepEqual(await page.locator('.board-column').evaluateAll((columns) => columns.map((column) => column.dataset.boardColumn)), ['applied', 'followup', 'interview', 'offer']);
assert.equal(await page.locator('.board-card').count(), 18, 'ended records should be summarized instead of becoming a noisy fifth lane');
assert.equal(await page.locator('.board-column-add').count(), 4, 'each workflow lane should expose a nearby add action');
assert.equal(await page.locator('[data-board-control]').count(), 2, 'grouping and card fields should remain configurable from the board header');
assert.equal(await page.locator('.board-card-title').count(), 18);
assert.equal(await page.locator('.board-fit').count(), 18);
assert.equal(await page.locator('.board-card-focus').count(), 18);
assert.match(await page.textContent('.board-local-header'), /已结束\s*2/);
const boardSurface = await page.evaluate(() => {
  const lane = document.querySelector('.board-column');
  const card = document.querySelector('.board-card');
  const lanes = document.querySelector('.board-lanes');
  const laneStyle = getComputedStyle(lane);
  const cardStyle = getComputedStyle(card);
  const lanesStyle = getComputedStyle(lanes);
  return {
    laneBorderTop: laneStyle.borderTopWidth,
    laneBackground: laneStyle.backgroundColor,
    cardRadius: cardStyle.borderRadius,
    cardShadow: cardStyle.boxShadow,
    cardHeight: card.getBoundingClientRect().height,
    laneGap: lanesStyle.columnGap,
    transform: cardStyle.transform,
  };
});
assert.equal(boardSurface.laneBorderTop, '0px', 'lanes should read as transparent workflow tracks rather than full-height cages');
assert.equal(boardSurface.laneBackground, 'rgba(0, 0, 0, 0)');
assert.equal(boardSurface.cardRadius, '6px');
assert.notEqual(boardSurface.cardShadow, 'none');
assert.ok(boardSurface.cardHeight >= 130, 'cards should have enough vertical rhythm for title, next step and metadata');
assert.equal(boardSurface.laneGap, '16px');
assert.equal(boardSurface.transform, 'none', 'resting cards should never be displaced');
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-board.png') });
const boardCardTop = await page.locator('.board-card').first().evaluate((card) => card.getBoundingClientRect().top);
await page.locator('.board-card').first().hover();
await settleMotion();
const hoveredBoardCard = await page.locator('.board-card').first().evaluate((card) => ({
  top: card.getBoundingClientRect().top,
  transform: getComputedStyle(card).transform,
}));
assert.ok(Math.abs(hoveredBoardCard.top - boardCardTop) < 0.5, 'hover should not move the card');
assert.equal(hoveredBoardCard.transform, 'none');
await page.click('[data-board-add="offer"]');
assert.match(await page.textContent('#toast-title'), /添加到Offer/);
await page.click('[data-board-control="fields"]');
assert.match(await page.textContent('#toast-title'), /看板视图配置/);

await page.click('[data-view="calendar"]');
await page.waitForSelector('.calendar-grid');
assert.equal(await page.locator('.calendar-day').count(), 35);
assert.equal(await page.locator('.calendar-event').count(), 6);
assert.equal(await page.locator('.agenda-list button').count(), 4);
assert.match(await page.textContent('.calendar-agenda'), /面试时间 · 下一步/);
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-calendar.png') });

await page.click('#add-view');
await page.waitForSelector('#view-menu:not([hidden])');
assert.equal(await page.locator('#view-menu [data-menu-view]').count(), 2, 'the add-view menu should only offer missing fixed views');
assert.equal(await page.locator('#view-menu [data-menu-view="gallery"], #view-menu [data-menu-view="dashboard"]').count(), 0);
assert.match(await page.textContent('.view-menu-ai-note'), /Copilot 生成 HTML/);
await page.click('#generate-html-from-view');
await page.waitForSelector('#ai-drawer.is-open');
assert.match(await page.inputValue('#ai-prompt'), /HTML 分析页/);
await page.click('#generate-plan');
await page.waitForSelector('#html-artifact-receipt:not([hidden])');
assert.match(await page.textContent('#html-artifact-receipt'), /第 3 份/);
assert.equal(await page.textContent('#copilot-history-count'), '3');
assert.match(await page.textContent('#html-artifact-receipt'), /不是固定视图/);
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-html-artifact.png') });

await page.click('[data-prompt^="找出本周需要行动"]');
await page.click('#generate-plan');
await page.waitForSelector('#plan-preview:not([hidden])');
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-plan.png') });
await page.click('#accept-plan');
await page.waitForSelector('.record-table');
const aiFilteredCount = await page.locator('.record-table tr[data-record-id]').count();
assert.ok(aiFilteredCount > 0 && aiFilteredCount < 20);
assert.match(await page.textContent('#filter-line'), /匹配度 大于等于 80/);

await page.click('#show-source');
await page.waitForSelector('#source-dialog:not([hidden])');
assert.match(await page.textContent('#source-dialog'), /Markdown source/);
assert.match(await page.textContent('#source-dialog'), /Fixed view projections/);
assert.match(await page.textContent('#source-dialog'), /Table · Board · Calendar/);
assert.doesNotMatch(await page.textContent('#source-dialog'), /Gallery|Dashboard/);
await page.click('#confirm-source');

await page.click('#open-mobile');
await page.waitForSelector('#mobile-overlay:not([hidden])');
assert.match(await page.textContent('.phone-footer'), /只读消费模式/);
await settleMotion();
await page.screenshot({ path: path.join(dir, 'preview-mobile.png') });
await page.click('#close-mobile');

await page.emulateMedia({ reducedMotion: 'reduce' });
const reducedMotion = await page.evaluate(() => ({
  buttonTransitionDuration: getComputedStyle(document.querySelector('.tool-button')).transitionDuration,
  scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
}));
assert.match(reducedMotion.buttonTransitionDuration, /(?:0\.00001|1e-05)s/, 'reduced-motion should collapse interaction transitions');
assert.notEqual(reducedMotion.scrollBehavior, 'smooth', 'reduced-motion should not force animated scrolling');
await page.emulateMedia({ reducedMotion: 'no-preference' });

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
  motion: {
    base: initial.motionBase,
    view: initial.viewAnimationName,
    reducedMotion: true,
  },
  lineSystem: {
    vertical: initial.ordinaryVerticalLine,
    row: initial.ordinaryHorizontalLine,
    structural: initial.headerRule,
    active: initial.activeCellEdge,
  },
  localLinks: localHrefs.length,
  viewsChecked: ['table', 'board', 'calendar'],
  flowsChecked: ['long-text-reader', 'bounded-row-wrap', 'independent-role-edit', 'inline-text-edit', 'typed-select-edit', 'numeric-edit', 'checkbox-toggle', 'keyboard-f2-cancel', 'keyboard-tab-commit', 'single-click-keyboard-edit', 'scroll-continuity', 'frozen-cell-selection', 'rectangular-cell-drag-selection', 'native-text-selection-suppression', 'bounded-cell-editor', 'stable-row-hover', 'computed-cell-readonly', 'selection-stat-recompute', 'theme-switch', 'number-format', 'persistent-field-workbench', 'saved-custom-field', 'formula-bar-ai-entry', 'bounded-formula-actions', 'ai-formula-candidates', 'ai-filter-composition', 'multi-priority-sort', 'multi-level-group', 'compact-toolbar-search', 'configurable-dedupe-fields', 'dedupe-preview', 'copilot-session-analysis', 'selection-statistics', 'board-workflow', 'calendar-agenda', 'copilot-html-artifacts', 'compute-plan-accept', 'data-boundary', 'mobile-consumption'],
  screenshots: ['preview.png', 'preview-table.png', 'preview-table-types.png', 'preview-long-text.png', 'preview-long-text-wrap.png', 'preview-cell-edit.png', 'preview-frozen-selection.png', 'preview-cell-range.png', 'preview-dark.png', 'preview-format.png', 'preview-fields.png', 'preview-field-added.png', 'preview-formula-inline.png', 'preview-formula.png', 'preview-filter-panel.png', 'preview-filter-rule.png', 'preview-sort-panel.png', 'preview-group-panel.png', 'preview-group-rule.png', 'preview-dedupe-panel.png', 'preview-analysis.png', 'preview-board.png', 'preview-calendar.png', 'preview-html-artifact.png', 'preview-plan.png', 'preview-mobile.png'],
}, null, 2));
