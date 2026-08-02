import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');

function matches(pattern) {
  return [...html.matchAll(pattern)];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const screens = matches(/data-screen="(\d+)"/g).map((match) => match[1]);
const steps = matches(/data-step="(\d+)"/g).map((match) => match[1]);
const jumps = matches(/data-jump="(\d+)"/g).map((match) => match[1]);
const nextTargets = matches(/data-next="(\d+)"/g).map((match) => match[1]);
const previousTargets = matches(/data-prev="(\d+)"/g).map((match) => match[1]);

assert(JSON.stringify(screens) === JSON.stringify(['1', '2', '3', '4', '5', '6']), 'Expected exactly six ordered screens.');
assert(JSON.stringify(steps) === JSON.stringify(['1', '2', '3', '4', '5', '6']), 'Expected exactly six ordered step tabs.');
assert(JSON.stringify(jumps) === JSON.stringify(['1', '2', '3', '4', '5', '6']), 'Expected one overview node per screen.');

for (const target of [...nextTargets, ...previousTargets]) {
  assert(screens.includes(target), `Unknown navigation target: ${target}`);
}

const ids = matches(/\sid="([^"]+)"/g).map((match) => match[1]);
assert(new Set(ids).size === ids.length, 'HTML IDs must be unique.');

for (const required of [
  'Command Gateway<br>不是 Command Center',
  'Settings → Tools',
  'obsidian_command_execute',
  'PermissionGuard',
  'RunEnvelope',
  'INTERACTION NOT VERIFIED',
  '未合入当前工作区',
]) {
  assert(html.includes(required), `Missing scope or flow marker: ${required}`);
}

assert(!html.includes('linear-gradient'), 'Mock must not use decorative gradients.');

const inlineScripts = matches(/<script>([\s\S]*?)<\/script>/g).map((match) => match[1]);
assert(inlineScripts.length === 1, 'Expected one inline interaction script.');
new Function(inlineScripts[0]);

console.log('PASS: six-screen Gateway flow mock contract');
console.log(`PASS: ${ids.length} unique HTML IDs`);
console.log(`PASS: ${nextTargets.length + previousTargets.length} navigation targets resolve`);
console.log('PASS: inline interaction script parses');
