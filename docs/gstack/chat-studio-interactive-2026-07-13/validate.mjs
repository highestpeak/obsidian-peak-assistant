import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(directory, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const composerHtml = fs.readFileSync(path.join(directory, 'composer-lab.html'), 'utf8');
const strategyHtml = fs.readFileSync(path.join(directory, 'product-strategy.html'), 'utf8');

const failures = [];
const localReferences = [html, composerHtml, strategyHtml].flatMap((source) => [...source.matchAll(/(?:href|src)="([^"#?]+)"/g)].map((match) => match[1]));
for (const reference of localReferences) {
  if (/^(?:https?:|data:)/.test(reference)) continue;
  const target = path.resolve(directory, reference);
  if (!fs.existsSync(target)) failures.push(`Missing local reference: ${reference}`);
}

const requiredFiles = ['index.html', 'mock.css', 'mock.js', 'fixtures.js', 'composer-lab.html', 'composer-lab.css', 'composer-lab.js', 'product-strategy.html', 'product-strategy.css', 'qa-gate2.mjs', 'README.md', 'discussion-synthesis.md', 'decisions.md', 'calibration.md', 'research-and-inventory.md'];
for (const filename of requiredFiles) {
  if (!fs.existsSync(path.join(directory, filename))) failures.push(`Missing required file: ${filename}`);
}

const canonicalSpec = path.resolve(directory, '../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md');
if (!fs.existsSync(canonicalSpec)) failures.push('Missing canonical implementation spec');
for (const [name, source] of [['index.html', html], ['composer-lab.html', composerHtml], ['product-strategy.html', strategyHtml], ['README.md', fs.readFileSync(path.join(directory, 'README.md'), 'utf8')], ['discussion-synthesis.md', fs.readFileSync(path.join(directory, 'discussion-synthesis.md'), 'utf8')]]) {
  if (!source.includes('2026-07-15-chat-studio-complete-implementation-spec.md')) failures.push(`${name} does not link the canonical implementation spec`);
}

for (const rejectedPhrase of ['快速 / 平衡 / 最佳', 'Composer 四层工作契约', '只需要做四个决定']) {
  if (strategyHtml.includes(rejectedPhrase)) failures.push(`Product strategy contains superseded decision: ${rejectedPhrase}`);
}

const fixtures = fs.readFileSync(path.join(directory, 'fixtures.js'), 'utf8');
const reviewStates = ['active', 'project', 'catalog', 'new', 'streaming', 'tool-run', 'resources', 'artifacts', 'empty'];
for (const hash of reviewStates) {
  if (!fixtures.includes(`hash: '${hash}'`)) failures.push(`Missing review state: #${hash}`);
}

const requiredIds = ['studio', 'left-panel', 'centre-panel', 'right-panel', 'review-drawer'];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) failures.push(`Missing required shell node: #${id}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Validated ${localReferences.length} local references, ${requiredFiles.length} files, ${reviewStates.length} review states, and ${requiredIds.length} shell nodes.`);
