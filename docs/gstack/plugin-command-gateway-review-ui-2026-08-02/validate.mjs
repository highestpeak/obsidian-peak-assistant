import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(here, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(here, 'app.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert(new Set(ids).size === ids.length, 'HTML IDs must be unique.');

for (const marker of [
  'External plugin commands',
  'Allow filtered',
  'Allow all eligible commands',
  'Batch actions apply to the current filter',
  'id="scan-progress"',
  'id="scan-progress-bar"',
  'class="access-toggle"',
  'class="access-unavailable"',
  'data-access-toggle',
  'Not allowed',
]) {
  assert(html.includes(marker) || script.includes(marker), `Missing interaction marker: ${marker}`);
}

assert(css.includes('grid-template-columns: minmax(460px, 1fr) 120px 174px'), 'Review rows must keep a stable far-right Access column.');
assert(css.includes('@keyframes scan-spin'), 'Scan must expose a visible animated state.');
assert(script.includes("command.state === 'off'"), 'Bulk Allow must be limited to Off commands.');
assert(script.includes("command.risk === 'unknown'"), 'Unknown commands must remain system-excluded.');
assert(script.includes("command.risk === 'destructive'"), 'Destructive commands must remain system-excluded.');
assert(!html.includes('<span>Purpose</span>'), 'Purpose must not be exposed as an owner-facing Review column.');
assert(!script.includes('data-purpose-index'), 'Purpose must not be owner-editable in the mock.');
assert(!script.includes('access-menu'), 'Row access must not require a dropdown menu.');
assert(!script.includes("state: 'blocked'"), 'Primary Review state must not expose explicit Block.');
assert(!html.includes('data-bulk="block"'), 'Bulk menu must not expose Block.');
assert(!script.includes('data-choice'), 'Row access must be a direct two-state switch.');
assert(!html.includes('<option value="blocked">'), 'Access filter must not expose Block.');
assert(!html.includes('<span>Blocked</span>'), 'Summary must not expose Block.');
assert(!html.includes('data-screen='), 'Focused Review UI must not be another flow prototype.');
assert(!css.includes('linear-gradient'), 'Mock must not use decorative gradients.');
new Function(script);

console.log('PASS: focused Review UI is not a flow prototype');
console.log('PASS: stable far-right two-state Allowed switch');
console.log('PASS: visible animated Scan state');
console.log('PASS: Purpose removed from owner-facing Review UI');
console.log('PASS: filter-scoped and all-eligible bulk actions present');
console.log('PASS: unsafe commands remain excluded from bulk Allow');
console.log(`PASS: ${ids.length} unique HTML IDs and app script parses`);
