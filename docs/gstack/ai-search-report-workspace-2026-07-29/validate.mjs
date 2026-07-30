import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(directory, '..', '..', '..');
const pageUrl = pathToFileURL(path.join(directory, 'index.html')).href;
const embeddedUrl = `${pageUrl}?embed=1`;
const landingPreview = path.join(directory, 'preview-landing.png');
const planPreview = path.join(directory, 'preview-plan.png');
const reportPreview = path.join(directory, 'preview-report.png');
const sourcesPreview = path.join(directory, 'preview-sources.png');
const errors = [];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function validateLocalLinks(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const links = [];
  const markdownLink = /\]\(([^)]+)\)/g;
  const htmlLink = /(?:href|src)="([^"]+)"/g;

  for (const pattern of [markdownLink, htmlLink]) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      links.push(match[1]);
    }
  }

  for (const link of links) {
    if (/^(?:https?:|mailto:|data:|javascript:)/.test(link) || link.startsWith('#')) {
      continue;
    }

    const cleanPath = link.split('#')[0].split('?')[0];
    const target = path.resolve(path.dirname(filePath), cleanPath);
    assert(fs.existsSync(target), `missing local link target: ${link} from ${filePath}`);
  }
}

[
  path.join(directory, 'index.html'),
  path.join(directory, 'README.md'),
  path.join(repoRoot, 'docs', 'superpowers', 'specs', '2026-07-29-ai-search-report-workspace-ux-design.md'),
].forEach(validateLocalLinks);

for (const fileName of ['01-entry.jpg', '02-plan.jpg', '03-ime.jpg', '04-report.jpg', '05-sources.jpg']) {
  assert(fs.existsSync(path.join(directory, 'evidence', fileName)), `missing recording evidence ${fileName}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') {
    errors.push(message.text());
  }
});

await page.goto(pageUrl, { waitUntil: 'load' });

assert(await page.locator('.evidence-card').count() === 5, 'review must expose five recording evidence checkpoints');
assert(
  await page.locator('.evidence-card img').evaluateAll((images) => images.every((image) => image.naturalWidth > 0)),
  'every recording evidence image must load',
);
assert(await page.locator('.checkpoint').count() === 5, 'mock must expose five flow checkpoints');
assert(await page.locator('.continue-analysis').count() === 1, 'landing must expose one unfinished-analysis surface');
assert(await page.locator('.continue-analysis .analysis-row').count() === 1, 'landing must not mix completed history into Continue analysis');
assert(await page.locator('.quick-start').count() === 3, 'landing must expose current-context quick starts');
assert(
  (await page.locator('#modal-body').textContent()).includes('Start with current context'),
  'landing must replace Suggested for you with current-context language',
);
assert(
  !(await page.locator('#modal-body').textContent()).includes('Report ready'),
  'landing must not expose completed report history',
);
assert(
  !(await page.locator('#modal-body').textContent()).includes('{activeDocumentTitle}'),
  'landing must not expose unresolved context variables',
);
assert(await page.locator('.web-toggle .web-icon').count() === 1, 'landing must preserve the Web-state icon');
assert(await page.locator('.context-add').count() === 1, 'landing must provide quiet opt-in context pinning');
assert(
  await page.locator('.composer-action').evaluate((button) => getComputedStyle(button).borderRadius === '999px'),
  'Analyze must align with the pill composer geometry',
);
await page.locator('.search-modal').screenshot({ path: landingPreview });

await page.locator('[data-action="start-analysis"]').first().click();
assert(await page.locator('.plan-card').count() === 1, 'analysis must open the answer plan');
assert(await page.locator('.activity-card').count() === 1, 'Activity must preserve the visible agent run');
assert(await page.locator('.run-step').count() === 5, 'Activity must show the full simulator step sequence');
assert(await page.locator('.plan-section-row').count() === 4, 'answer plan must render four question-derived sections');
assert(await page.locator('[data-action="edit-plan-section"]').count() === 4, 'every plan section must expose direct editing');
assert(await page.locator('[data-action="move-plan-section"]').count() === 8, 'every plan section must preserve reorder controls');
assert(await page.locator('[data-action="remove-plan-section"]').count() === 4, 'every plan section must preserve removal');
assert(await page.locator('[data-action="add-plan-section"]').count() === 1, 'the plan must preserve add-section capability');
assert(
  await page.locator('.plan-actions button').evaluateAll((buttons) =>
    buttons.map((button) => button.textContent.trim()).join('|') === 'Generate report',
  ),
  'the plan completion row must keep Generate report as its only action',
);
await page.locator('[data-action="edit-plan-section"]').first().click();
assert(await page.locator('[data-plan-editor="0"]').count() === 1, 'direct plan editing must not be hidden behind plan-wide refinement');
await page.locator('[data-action="cancel-plan-edit"]').click();
const planText = await page.locator('.plan-card').textContent();
assert(!planText.includes('Action Plan REQUIRED'), 'plan must not expose a required action-plan group');
assert(planText.includes('Selected analytical moves'), 'plan must preserve and expose selected old-framework analytical moves');
assert(
  (await page.locator('.activity-summary').textContent()).includes('42,780'),
  'activity must render a non-zero character count from the fixture',
);
await page.locator('#toast').evaluate((toast) => toast.classList.remove('show'));
await page.locator('.search-modal').screenshot({ path: planPreview });

const instruction = page.locator('#plan-instruction');
await instruction.fill('输入法候选仍在组合');
await instruction.dispatchEvent('compositionstart');
await instruction.press('Enter');
assert(!(await page.locator('#toast').textContent()).includes('计划已更新'), 'IME candidate confirmation must not apply the plan');
await instruction.dispatchEvent('compositionend');
await instruction.fill('把写回行为单独做成表格；不要给泛化行动建议。');
await instruction.press('Meta+Enter');
assert((await page.locator('#toast').textContent()).includes('计划已更新'), 'Cmd+Enter must explicitly apply the plan instruction');

await page.locator('[data-action="generate-report"]').click();
assert(await page.locator('.report-shell').count() === 1, 'Generate report must immediately open the Report workspace');
assert(
  await page.locator('.workspace-nav [data-action="open-report"]').evaluate((button) => button.classList.contains('active')),
  'Report must be active while sections are generating',
);
assert(
  await page.locator('.workspace-nav button').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('data-action')).join('|') ===
      'show-activity|open-report|toggle-toc|open-sources',
  ),
  'footer order must remain Activity / Report / TOC / Sources',
);
assert(await page.locator('.streaming-line').count() === 3, 'generating report must stream in the final section position');

await page.locator('[data-screen="report"]').click();
assert(await page.locator('.report-outline').count() === 0, 'report outline must not occupy a permanent left rail');
await page.locator('[data-action="toggle-toc"]').click();
assert(await page.locator('.toc-popover').count() === 1, 'footer TOC icon must open the report outline');
await page.locator('[data-action="toggle-toc"]').click();
assert(await page.locator('.report-table').count() === 1, 'full report must exercise a rich table');
assert(await page.locator('.content-chart').count() === 1, 'full report must exercise a content chart');
assert(await page.locator('.process-diagram').count() === 1, 'full report must exercise a process diagram');
assert(await page.locator('.citation-chip').count() >= 6, 'full report must expose inline citations');
assert(await page.locator('[data-action="ask-section"]').count() === 4, 'every report section must preserve non-destructive follow-up');
assert(await page.locator('[data-action="revise-section"]').count() === 4, 'every report section must preserve revision as a separate action');
assert(await page.locator('.overall-followup').count() === 1, 'the full report must preserve report-wide follow-up');
await page.locator('[data-action="ask-section"][data-index="2"]').click();
assert(await page.locator('.section-followup-panel').count() === 1, 'Ask must open a section-anchored follow-up thread');
await page.locator('[data-action="submit-section-followup"]').click();
assert(await page.locator('.section-followup-answer').count() === 1, 'section follow-up must append Q&A without replacing the section');
await page.locator('.workspace-actions [data-action="continue-report"]').click();
assert(await page.locator('.overall-followup-composer').count() === 1, 'footer Continue must reveal the report-wide composer');
await page.locator('[data-action="submit-report-followup"]').click();
assert(await page.locator('.round-preview').count() === 1, 'report-wide follow-up must append a second round');
assert(await page.locator('[data-action="synthesize-report"]').count() >= 1, 'Synthesize must appear after multiple rounds');
assert(
  await page.locator('.report-image img').evaluate((image) => image.naturalWidth > 0),
  'full report must load the real project image fixture',
);
await page.locator('#modal-body').evaluate((element) => {
  element.scrollTop = 0;
});
await page.locator('#toast').evaluate((toast) => toast.classList.remove('show'));
await page.locator('.search-modal').screenshot({ path: reportPreview });

await page.locator('[data-action="open-sources"]').click();
assert(await page.locator('.source-row').count() === 6, 'Sources List must render six grounded fixture files');
await page.locator('[data-source-mode="tree"]').click();
assert(await page.locator('.tree-file').count() === 6, 'Sources Tree must preserve the same six-file evidence set');
await page.locator('[data-source-mode="graph"]').click();
const graphViewBox = await page.locator('[data-source-mode="graph"]').boundingBox();
const graphKindBox = await page.locator('.graph-kind-switch').boundingBox();
const densityBox = await page.locator('.density-switch').boundingBox();
assert(
  graphViewBox && graphKindBox && densityBox && graphKindBox.x > graphViewBox.x && densityBox.x > graphKindBox.x,
  'Graph kind must follow List / Tree / Graph and density must remain at the far right',
);
assert(await page.locator('[data-graph-preset]').count() === 5, 'Sources Graph must expose the shared layout presets');
assert(await page.locator('.graph-node').count() === 6, 'Vault graph must render the evidence set');
await page.locator('[data-graph-kind="ai"]').click();
assert(await page.locator('.ai-resolver-toolbar').count() === 1, 'AI relationship map must expose its data resolver before generation');
assert(await page.locator('.graph-toolbar').count() === 0, 'AI relationship map must not reuse the Vault graph control row');
assert(await page.locator('[data-graph-scope]').count() === 0, 'AI relationship map must not expose Vault hop scope');
assert(await page.locator('[data-graph-preset]').count() === 0, 'AI relationship map must not expose deterministic Vault layouts');
assert(await page.locator('#semantic-toggle').count() === 0, 'AI relationship map must not expose indexed semantic-edge controls');
assert(await page.locator('.ai-map-empty').count() === 1, 'AI relationship map must start from an explicit generation boundary');
await page.locator('[data-action="generate-ai-map"]').click();
assert(await page.locator('.ai-lens-toolbar').count() === 1, 'generated AI map must expose current data-supported lenses');
assert(await page.locator('[data-ai-lens]').count() === 5, 'AI map must use the five current MultiLensGraph lens labels');
assert(
  await page.locator('[data-ai-lens]').evaluateAll((buttons) =>
    buttons.map((button) => button.textContent.trim()).join('|') ===
      'Topology|Thinking Tree|Bridges|Timeline|Gaps',
  ),
  'AI map lens labels must match current MultiLensGraph rather than future artifact candidates',
);
assert(await page.locator('.graph-node.ai').count() === 4, 'AI relationship map must distinguish AI-derived nodes');
assert(
  (await page.locator('.graph-legend').textContent()).toLowerCase().includes('inferred'),
  'AI relationship map must expose inferred provenance',
);
await page.locator('[data-ai-lens="timeline"]').click();
assert(
  (await page.locator('.ai-lens-canvas').getAttribute('data-active-lens')) === 'timeline',
  'AI relationship map must switch to its current Timeline projection',
);
assert(await page.locator('.timeline-axis').count() === 1, 'Timeline must render a distinct projection rather than relabeling one canvas');
await page.locator('#toast').evaluate((toast) => toast.classList.remove('show'));
await page.locator('.search-modal').screenshot({ path: sourcesPreview });

const horizontalOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
assert(!horizontalOverflow, 'review page has horizontal overflow at the desktop viewport');
assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);

await page.goto(embeddedUrl, { waitUntil: 'load' });
assert(await page.locator('body.is-embedded').count() === 1, 'embedded mock mode must activate');
assert(await page.locator('.prototype-section').count() === 1, 'embedded mode must preserve the interactive prototype');
assert(
  await page.locator('.report-section:not(.prototype-section)').evaluateAll((sections) =>
    sections.every((section) => getComputedStyle(section).display === 'none'),
  ),
  'embedded mode must hide the surrounding review',
);
assert(errors.length === 0, `browser errors after embedded verification: ${errors.join(' | ')}`);

await browser.close();

console.log(`PASS ${pageUrl}`);
console.log(`PASS ${embeddedUrl}`);
console.log(`SCREENSHOT ${landingPreview}`);
console.log(`SCREENSHOT ${planPreview}`);
console.log(`SCREENSHOT ${reportPreview}`);
console.log(`SCREENSHOT ${sourcesPreview}`);
