import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const directory = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(directory, 'index.html');
const readmePath = path.join(directory, 'README.md');
const specPath = path.resolve(directory, '../../superpowers/specs/2026-07-24-peak-file-workspace.md');
const researchPath = path.resolve(directory, '../../research/2026-07-24-peak-file-workspace/README.md');
const roadmapPath = path.resolve(directory, '../../roadmap.html');

const requiredFiles = [htmlPath, readmePath, specPath, researchPath, roadmapPath];
const failures = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');
const spec = fs.readFileSync(specPath, 'utf8');
const research = fs.readFileSync(researchPath, 'utf8');
const roadmap = fs.readFileSync(roadmapPath, 'utf8');

const sources = [
  { content: html, file: htmlPath, html: true },
  { content: readme, file: readmePath },
  { content: spec, file: specPath },
  { content: research, file: researchPath },
];
const localReferences = sources.flatMap(({ content, file, html: isHtml }) => {
  const matches = isHtml
    ? [...content.matchAll(/(?:href|src)="([^"#?]+)"/g)].map((match) => match[1])
    : [...content.matchAll(/\[[^\]]+\]\(([^)#?]+)(?:#[^)]+)?\)/g)].map((match) => match[1]);
  return matches
    .filter((reference) => !/^(?:https?:|data:|mailto:|javascript:)/.test(reference))
    .map((reference) => ({ base: path.dirname(file), reference }));
});
for (const { base, reference } of localReferences) {
  const target = path.resolve(base, reference);
  if (!fs.existsSync(target)) failures.push(`Missing local reference: ${reference}`);
}

const requiredAnchors = [
  'overview',
  'flow',
  'image',
  'html',
  'pdf',
  'architecture',
  'safety',
  'rollout',
  'verdict',
];
for (const id of requiredAnchors) {
  if (!html.includes(`id="${id}"`)) failures.push(`Missing report anchor: #${id}`);
}

for (const type of ['Image Workspace', 'HTML Workspace', 'PDF Companion']) {
  if (!html.includes(type)) failures.push(`Missing focused workspace: ${type}`);
}
for (const phrase of [
  'Design only',
  'implementation pending',
  'Safe preview',
  'Original file unchanged',
  'Obsidian native PDF',
  'app-owned',
  'Save as new version',
]) {
  if (!html.includes(phrase) && !spec.includes(phrase)) failures.push(`Missing design boundary: ${phrase}`);
}
for (const phrase of ['Peak File Workspace', 'decided', 'implementation pending']) {
  if (!roadmap.toLowerCase().includes(phrase.toLowerCase())) failures.push(`Roadmap missing: ${phrase}`);
}
for (const source of [html, readme, spec, research]) {
  if (!/not implemented|implementation pending|未实现/i.test(source)) {
    failures.push('Authority file does not state the non-production boundary');
  }
}

const tableTags = [...html.matchAll(/<table(?:\s[^>]*)?>/g)].length;
const colgroups = [...html.matchAll(/<colgroup>/g)].length;
if (tableTags !== colgroups) failures.push(`Every table needs colgroup: ${tableTags} tables / ${colgroups} colgroups`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
await page.screenshot({ path: path.join(directory, 'preview-desktop.png'), fullPage: true });

const metrics = await page.evaluate(() => {
  const tables = Array.from(document.querySelectorAll('table')).map((table) => {
    const rows = Array.from(table.rows);
    const heights = rows.map((row) => row.getBoundingClientRect().height);
    const cells = Array.from(table.querySelectorAll('th,td'));
    return {
      cols: rows[0]?.cells.length ?? 0,
      rows: rows.length,
      avgRowH: heights.reduce((sum, value) => sum + value, 0) / Math.max(heights.length, 1),
      maxRowH: Math.max(...heights, 0),
      longestCell: Math.max(...cells.map((cell) => (cell.textContent ?? '').trim().length), 0),
    };
  });
  return {
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    workspaces: document.querySelectorAll('.workspace').length,
    headings: document.querySelectorAll('h1,h2,h3').length,
    tables,
  };
});

if (metrics.bodyWidth > metrics.viewportWidth + 1) {
  failures.push(`Desktop horizontal overflow: ${metrics.bodyWidth}px > ${metrics.viewportWidth}px`);
}
if (metrics.workspaces !== 3) failures.push(`Expected 3 focused workspaces, found ${metrics.workspaces}`);
for (const [index, table] of metrics.tables.entries()) {
  if (table.maxRowH > 200) failures.push(`Table ${index + 1} row exceeds 200px`);
  if (table.longestCell > 120) failures.push(`Table ${index + 1} cell exceeds 120 chars`);
}

await browser.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  localReferences: localReferences.length,
  anchors: requiredAnchors.length,
  workspaces: metrics.workspaces,
  headings: metrics.headings,
  tables: metrics.tables,
  screenshot: 'preview-desktop.png',
  overflow: `${metrics.bodyWidth}/${metrics.viewportWidth}`,
}, null, 2));
