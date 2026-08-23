import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parse } from 'parse5';

const root = path.dirname(new URL(import.meta.url).pathname);
const file = path.join(root, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const document = parse(html, { sourceCodeLocationInfo: true });

const ids = new Map();
const tags = new Map();

function visit(node) {
  if (node.tagName) tags.set(node.tagName, (tags.get(node.tagName) ?? 0) + 1);
  const id = node.attrs?.find((attribute) => attribute.name === 'id')?.value;
  if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  for (const child of node.childNodes ?? []) visit(child);
}

visit(document);

const requiredIds = [
  'run-state',
  'restart-btn',
  'pause-btn',
  'stop-btn',
  'percent',
  'progress-bar',
  'elapsed',
  'remaining',
  'accounted',
  'planned',
  'ready-attention',
  'task-plan',
  'stream-kind',
  'stream-route',
  'stream-time',
  'stream-text',
  'stream-citation',
  'log-list',
  'new-events',
];

const missing = requiredIds.filter((id) => !ids.has(id));
const duplicates = [...ids.entries()].filter(([, count]) => count > 1);
if (missing.length) throw new Error(`Missing required ids: ${missing.join(', ')}`);
if (duplicates.length) throw new Error(`Duplicate ids: ${duplicates.map(([id]) => id).join(', ')}`);

const scripts = [];
function collectScripts(node) {
  if (node.tagName === 'script' && !node.attrs?.some((attribute) => attribute.name === 'src')) {
    scripts.push((node.childNodes ?? []).map((child) => child.value ?? '').join(''));
  }
  for (const child of node.childNodes ?? []) collectScripts(child);
}
collectScripts(document);
if (scripts.length !== 1) throw new Error(`Expected one inline script, found ${scripts.length}`);
new vm.Script(scripts[0], { filename: 'index.html:inline-script' });

const contracts = [
  ['dynamic task count', /Tasks planned/],
  ['planning without fake percent', /Planning…/],
  ['elapsed time', /Elapsed/],
  ['remaining estimate', /Estimated remaining/],
  ['read-only model receipt', /Models are read-only here · configured in Scan setup/],
  ['actual task model', /Claude Sonnet 4/],
  ['live agent stream', /function renderLiveStream/],
  ['full-row citation', /class="live-citation"/],
  ['non-follow log behavior', /The list will not move automatically/],
  ['pause interaction', /pause-btn/],
  ['restart interaction', /restart-btn/],
  ['stop interaction', /stop-btn/],
];

const missingContracts = contracts.filter(([, pattern]) => !pattern.test(html)).map(([label]) => label);
if (missingContracts.length) throw new Error(`Missing interaction contracts: ${missingContracts.join(', ')}`);

const forbiddenProgressControls = ['model-btn', 'model-modal', 'fixed-model', 'ai-toggle', 'model-save'];
const leakedControls = forbiddenProgressControls.filter((id) => ids.has(id));
if (leakedControls.length || /Inherit Vault-wide review model|Choose another model/.test(html)) {
  throw new Error(`Model routing belongs in Scan setup, not Run progress: ${leakedControls.join(', ')}`);
}

if (!/taskPlan\.dataset\.mode/.test(html)) {
  throw new Error('Task rows must keep stable DOM nodes between timer updates.');
}
if (/\.task-row\s*\{[^}]*animation:/s.test(html) || /\.log-row\s*\{[^}]*animation:/s.test(html)) {
  throw new Error('Repeated task and log updates must not replay entrance animations.');
}
if (/cursor-blink|stream-text::after/.test(html)) {
  throw new Error('Live output must not restore a blinking cursor.');
}

if ((tags.get('h1') ?? 0) + (tags.get('h2') ?? 0) + (tags.get('p') ?? 0) > 0) {
  throw new Error('Mock should use the same neutral div/span hierarchy as the existing Scan artifacts.');
}

console.log(`Validated ${path.relative(process.cwd(), file)}`);
console.log(`${ids.size} unique ids · ${tags.get('button') ?? 0} buttons · no model controls in Run progress`);
