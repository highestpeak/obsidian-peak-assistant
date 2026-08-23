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
  'model-btn',
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
  'log-list',
  'new-events',
  'model-modal',
  'fixed-model',
  'ai-toggle',
  'model-save',
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
  ['inherited review model', /Inherit Vault-wide review model/],
  ['optional ambiguous-group AI', /Use AI for ambiguous task groups/],
  ['proposal boundary', /File proposal models are selected later/],
  ['non-follow log behavior', /The list will not move automatically/],
  ['pause interaction', /pause-btn/],
  ['restart interaction', /restart-btn/],
  ['stop interaction', /stop-btn/],
  ['local model path', /Gemma 4 local/],
  ['remote model path', /GPT-5 mini/],
];

const missingContracts = contracts.filter(([, pattern]) => !pattern.test(html)).map(([label]) => label);
if (missingContracts.length) throw new Error(`Missing interaction contracts: ${missingContracts.join(', ')}`);

if ((tags.get('h1') ?? 0) + (tags.get('h2') ?? 0) + (tags.get('p') ?? 0) > 0) {
  throw new Error('Mock should use the same neutral div/span hierarchy as the existing Scan artifacts.');
}

console.log(`Validated ${path.relative(process.cwd(), file)}`);
console.log(`${ids.size} unique ids · ${tags.get('button') ?? 0} buttons · ${tags.get('select') ?? 0} model selector`);
