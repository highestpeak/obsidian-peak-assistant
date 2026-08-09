import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(directory, 'index.html');
const cssPath = path.join(directory, 'mock.css');
const jsPath = path.join(directory, 'mock.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const docsRoot = path.resolve(directory, '../..');
const capabilityAudit = fs.readFileSync(path.join(docsRoot, 'research/2026-07-31-file-format-capability-audit/index.html'), 'utf8');
const docsIndex = fs.readFileSync(path.join(docsRoot, 'index.html'), 'utf8');
const legacyReport = fs.readFileSync(path.resolve(directory, '../peak-file-workspace-2026-07-24/index.html'), 'utf8');

const surfaces = ['image', 'html', 'pdf', 'code', 'canvas', 'excalidraw'];

for (const surface of surfaces) {
  assert.match(html, new RegExp(`data-file-target="${surface}"`), `missing ${surface} file switcher`);
  assert.match(html, new RegExp(`data-surface="${surface}"`), `missing ${surface} surface`);
  assert.match(html, new RegExp(`data-toolbar-for="${surface}"`), `missing ${surface} toolbar`);
  assert.match(js, new RegExp(`\\b${surface}: \\{`), `missing ${surface} runtime fixture`);
}

for (const hook of [
  'data-image-tool',
  'data-html-mode',
  'data-html-pick',
  'data-pdf-page',
  'data-pdf-selection',
  'data-code-mode',
  'data-symbol',
  'data-canvas-scope',
  'data-canvas-node',
  'data-scene-mode',
  'data-scene-element',
  'data-run-copilot',
  'data-candidate-accept',
]) {
  assert.match(html, new RegExp(hook), `missing ${hook} control`);
  assert.match(js, new RegExp(`\\[${hook.replace('data-', 'data-')}`), `missing ${hook} handler`);
}

assert.match(html, /Interactive design mock · not implemented/);
assert.match(html, /Run disabled · separate permission/);
assert.match(html, /Atomic multi-file candidate/);
assert.match(html, /Native PDF companion/);
assert.match(html, /typed object patch/);
assert.match(js, /history\.replaceState\(null, '', `#\$\{nextFile\}`\)/);
assert.match(js, /fileButtons\.forEach\(\(button\) => \{/);
assert.match(js, /button\.addEventListener\('click', \(\) => setFile/);
assert.match(js, /document\.querySelector\('\[data-run-copilot\]'\)\.addEventListener\('click', showCandidate\)/);
assert.match(css, /grid-template-columns: 232px minmax\(560px, 1fr\) 310px/);
assert.match(css, /@media \(max-width: 940px\)/);
assert.match(css, /prefers-reduced-motion/);

const localLinks = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((target) => !target.startsWith('#') && !target.startsWith('http'));

for (const target of localLinks) {
  const fileTarget = target.split('#')[0].split('?')[0];
  assert.ok(fs.existsSync(path.resolve(directory, fileTarget)), `missing local asset: ${target}`);
}

for (const file of ['index.html', 'mock.css', 'mock.js', 'README.md']) {
  assert.ok(fs.existsSync(path.join(directory, file)), `missing artifact: ${file}`);
}

for (const surface of surfaces) {
  assert.match(capabilityAudit, new RegExp(`peak-file-workspace-interactive-2026-08-10/index\\.html#${surface}`), `capability audit does not link ${surface}`);
}
assert.match(docsIndex, /peak-file-workspace-interactive-2026-08-10\/index\.html/);
assert.match(legacyReport, /peak-file-workspace-interactive-2026-08-10\/index\.html/);

console.log(`Validated ${surfaces.length} interactive File Workspace surfaces, ${localLinks.length} local links, and 3 inbound entry points.`);
