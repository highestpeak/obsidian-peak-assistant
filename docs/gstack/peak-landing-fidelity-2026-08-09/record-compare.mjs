import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const recordingDir = path.join(evidenceDir, 'recordings');

const harness = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1440px; height: 450px; margin: 0; overflow: hidden; background: #0c0d16; }
    body { display: grid; grid-template-columns: 1fr 1fr; }
    .pane { position: relative; width: 720px; height: 450px; overflow: hidden; }
    .pane + .pane { border-left: 1px solid rgba(255,255,255,.16); }
    iframe { width: 1440px; height: 900px; border: 0; transform: scale(.5); transform-origin: top left; }
    .label { position: absolute; z-index: 2; left: 13px; top: 13px; padding: 6px 9px; color: #fff; background: rgba(0,0,0,.72); font: 600 12px/1.2 system-ui, sans-serif; letter-spacing: .04em; }
  </style>
</head>
<body>
  <div class="pane"><span class="label">REFERENCE · UNPACKED</span><iframe name="reference" src="http://127.0.0.1:8777/"></iframe></div>
  <div class="pane"><span class="label">IMPLEMENTATION</span><iframe name="implementation" src="http://127.0.0.1:8778/"></iframe></div>
</body>
</html>`;

async function glide(frames, selector, duration = 900) {
  const targets = await Promise.all(frames.map((frame) =>
    frame.locator(selector).first().evaluate((element) =>
      Math.max(0, element.getBoundingClientRect().top + window.scrollY - 70),
    ),
  ));
  const starts = await Promise.all(frames.map((frame) => frame.evaluate(() => window.scrollY)));
  const steps = Math.max(1, Math.round(duration / 30));

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    await Promise.all(frames.map((frame, index) => {
      const y = starts[index] + (targets[index] - starts[index]) * eased;
      return frame.evaluate((nextY) => window.scrollTo(0, nextY), y);
    }));
    await frames[0].page().waitForTimeout(30);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  colorScheme: 'dark',
  deviceScaleFactor: 1,
  recordVideo: { dir: recordingDir, size: { width: 1440, height: 450 } },
  viewport: { width: 1440, height: 450 },
});

await context.addInitScript(() => {
  let seed = 0x5045414b;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.setContent(harness, { waitUntil: 'load' });
const frames = ['reference', 'implementation'].map((name) => page.frame({ name }));
if (frames.some((frame) => !frame)) throw new Error('Comparison frames did not load');

await Promise.all(frames.map((frame) => frame.locator('[data-screen-label="Hero"]').waitFor({ state: 'visible' })));
await Promise.all(frames.map((frame) => frame.evaluate(() => document.fonts.ready)));
await page.waitForTimeout(900);

await Promise.all(frames.map((frame) => frame.getByText('Agentic Search', { exact: true }).first().click()));
await page.waitForTimeout(700);
await glide(frames, '#context');
await page.waitForTimeout(700);
await glide(frames, '#search');
await Promise.all(frames.map((frame) => frame.getByText('List', { exact: true }).first().click()));
await page.waitForTimeout(900);
await glide(frames, '#studio', 1100);
await page.waitForTimeout(700);
await glide(frames, '#configure', 1100);
await page.waitForTimeout(700);
await glide(frames, '#terms', 1000);
await page.waitForTimeout(700);
await glide(frames, '[data-screen-label="Close"]', 900);
await page.waitForTimeout(900);

const video = page.video();
await page.close();
await video.saveAs(path.join(recordingDir, 'synchronized-comparison.webm'));
await context.close();
await browser.close();

if (errors.length > 0) {
  throw new Error(`Comparison console errors:\n${errors.join('\n')}`);
}

console.log('Recorded synchronized reference and implementation flow.');
