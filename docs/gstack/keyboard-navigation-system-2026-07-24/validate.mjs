import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const directory = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(directory, 'index.html');
const readmePath = path.join(directory, 'README.md');
const specPath = path.resolve(directory, '../../superpowers/specs/2026-07-24-peak-keyboard-navigation-system.md');
const researchPath = path.resolve(directory, '../../research/2026-07-24-peak-keyboard-navigation/README.md');

const html = fs.readFileSync(htmlPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');
const spec = fs.readFileSync(specPath, 'utf8');
const research = fs.readFileSync(researchPath, 'utf8');
const failures = [];

const requiredFiles = [
  htmlPath,
  readmePath,
  specPath,
  researchPath,
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing required file: ${file}`);
}

const localReferences = [
  ...[...html.matchAll(/(?:href|src)="([^"#?]+)"/g)]
    .map((match) => ({ base: directory, reference: match[1] })),
  ...[
    { source: readme, file: readmePath },
    { source: spec, file: specPath },
    { source: research, file: researchPath },
  ].flatMap(({ source, file }) =>
    [...source.matchAll(/\[[^\]]+\]\(([^)#?]+)(?:#[^)]+)?\)/g)]
      .map((match) => ({ base: path.dirname(file), reference: match[1] }))),
].filter(({ reference }) => !/^(?:https?:|data:|mailto:)/.test(reference));

for (const { base, reference } of localReferences) {
  const target = path.resolve(base, reference);
  if (target === path.join(directory, 'preview-composer-selection-toolbar.png')) continue;
  if (!fs.existsSync(target)) failures.push(`Missing local reference: ${reference}`);
}

const requiredAnchors = [
  'overview',
  'grammar',
  'research',
  'focus-model',
  'surfaces',
  'conflicts',
  'validation',
  'verdict',
];

for (const id of requiredAnchors) {
  if (!html.includes(`id="${id}"`)) failures.push(`Missing report anchor: #${id}`);
}

const requiredSurfaceNames = [
  'Vault Search',
  'AI Analysis',
  'File Atlas',
  'Composer View',
  'Chat Studio',
];

for (const surface of requiredSurfaceNames) {
  if (!html.includes(surface)) failures.push(`Missing surface map: ${surface}`);
  if (!spec.includes(surface)) failures.push(`Missing surface contract in spec: ${surface}`);
}

for (const excluded of ['Usage Dashboard', 'Setup Wizard', 'Settings']) {
  if (!html.includes(excluded)) failures.push(`Missing explicit exclusion in report: ${excluded}`);
  if (!spec.includes(excluded)) failures.push(`Missing explicit exclusion in spec: ${excluded}`);
}

for (const key of ['F6', 'Shift+F6', 'Tab', 'Enter', 'Space', 'Shift+F10', 'Alt+F10', 'Escape']) {
  if (!spec.includes(key)) failures.push(`Missing core key in spec: ${key}`);
}

for (const selectionToolbarEvidence of [
  'Selection contextual toolbar',
  'selection-toolbar-demo',
  '润色',
  '精简',
  '扩写',
  '问 AI',
]) {
  if (!html.includes(selectionToolbarEvidence) && !spec.includes(selectionToolbarEvidence)) {
    failures.push(`Missing selection toolbar evidence: ${selectionToolbarEvidence}`);
  }
}

for (const source of [
  'w3.org/WAI/ARIA/apg',
  'code.visualstudio.com',
  'blainelewis.ca',
  'webaim.org',
]) {
  if (!research.includes(source)) failures.push(`Missing research source: ${source}`);
}

for (const source of [html, readme, spec]) {
  if (!/Design only|implementation pending|未实现/i.test(source)) {
    failures.push('One authority file does not state the design-only boundary');
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
await page.screenshot({
  path: path.join(directory, 'preview-desktop.png'),
  fullPage: true,
});
await page.locator('#composer-view').screenshot({
  path: path.join(directory, 'preview-composer-selection-toolbar.png'),
});
if (!fs.existsSync(path.join(directory, 'preview-composer-selection-toolbar.png'))) {
  failures.push('Missing generated Composer selection toolbar preview');
}

const desktopMetrics = await page.evaluate(() => ({
  bodyWidth: document.body.scrollWidth,
  viewportWidth: window.innerWidth,
  headings: document.querySelectorAll('h1, h2, h3').length,
  surfaces: document.querySelectorAll('.surface').length,
  focusStyle: getComputedStyle(document.documentElement).getPropertyValue('--focus').trim(),
}));

if (desktopMetrics.bodyWidth > desktopMetrics.viewportWidth + 1) {
  failures.push(`Desktop horizontal overflow: ${desktopMetrics.bodyWidth}px > ${desktopMetrics.viewportWidth}px`);
}
if (desktopMetrics.surfaces !== 5) failures.push(`Expected 5 surface maps, found ${desktopMetrics.surfaces}`);
if (!desktopMetrics.focusStyle) failures.push('Missing visible focus token');

await page.setViewportSize({ width: 1024, height: 768 });
await page.reload({ waitUntil: 'load' });
await page.screenshot({
  path: path.join(directory, 'preview-compact.png'),
  fullPage: true,
});

const compactMetrics = await page.evaluate(() => ({
  bodyWidth: document.body.scrollWidth,
  viewportWidth: window.innerWidth,
  surfaceOverflow: Array.from(document.querySelectorAll('.surface'))
    .every((element) => getComputedStyle(element).overflowX === 'auto'),
}));

if (compactMetrics.bodyWidth > compactMetrics.viewportWidth + 1) {
  failures.push(`Compact horizontal overflow: ${compactMetrics.bodyWidth}px > ${compactMetrics.viewportWidth}px`);
}
if (!compactMetrics.surfaceOverflow) failures.push('Compact surface maps do not own horizontal overflow');

await browser.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  localReferences: localReferences.length,
  anchors: requiredAnchors.length,
  surfaces: desktopMetrics.surfaces,
  headings: desktopMetrics.headings,
  screenshots: ['preview-desktop.png', 'preview-compact.png', 'preview-composer-selection-toolbar.png'],
  overflow: {
    desktop: `${desktopMetrics.bodyWidth}/${desktopMetrics.viewportWidth}`,
    compact: `${compactMetrics.bodyWidth}/${compactMetrics.viewportWidth}`,
  },
}, null, 2));
