import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.dirname(new URL(import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'mock.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'mock.js'), 'utf8');

const requiredHtml = [
  'data-view="overview"',
  'data-view="run"',
  'data-view="problems"',
  'data-view="history"',
  'data-view="content"',
  'data-view="folders"',
  'data-demo-state-button="running"',
  'data-demo-state-button="attention"',
  'data-demo-state-button="complete"',
  'Keyword search',
  'Semantic search',
  'Tags & summaries',
  'Relationships',
  'Peak Sheet',
  'AI Graph',
  'Draw.io',
];

const requiredCss = [
  '.workspace-layout',
  '.readiness-row',
  '.run-card',
  '.problem-row',
  '.type-list',
  'body[data-demo-state="attention"]',
  'body[data-demo-state="complete"]',
];

const requiredJs = [
  'DEMO_STATES',
  'applyDemoState',
  'activateView',
  'data-problem-toggle',
  'data-open-settings',
];

const missing = [
  ...requiredHtml.filter((value) => !html.includes(value)).map((value) => `HTML: ${value}`),
  ...requiredCss.filter((value) => !css.includes(value)).map((value) => `CSS: ${value}`),
  ...requiredJs.filter((value) => !js.includes(value)).map((value) => `JS: ${value}`),
];

if (missing.length > 0) {
  console.error(`Knowledge Index mock validation failed:\n${missing.join('\n')}`);
  process.exit(1);
}

console.log('Knowledge Index mock validation passed.');
