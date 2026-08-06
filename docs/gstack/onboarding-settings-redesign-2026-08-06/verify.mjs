import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(fileURLToPath(import.meta.url));
const pages = ['index.html', 'start-variants.html', 'onboarding.html', 'settings.html', 'provider-picker.html'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const failures = [];

page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console: ${message.text()}`);
});

for (const file of pages) {
  await access(join(root, file));
  await page.goto(pathToFileURL(join(root, file)).href, { waitUntil: 'load' });

  const geometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
  }));
  if (geometry.contentWidth > geometry.viewportWidth + 1) {
    failures.push(`${file}: horizontal overflow ${geometry.contentWidth} > ${geometry.viewportWidth}`);
  }

  const missingLocalLinks = await page.locator('a[href]').evaluateAll((links) => links
    .map((link) => link.href)
    .filter((href) => href.startsWith('file:')));
  for (const href of missingLocalLinks) {
    const localPath = fileURLToPath(href.split('#')[0]);
    try {
      await access(localPath);
    } catch {
      failures.push(`${file}: missing local link ${localPath}`);
    }
  }
}

await page.goto(pathToFileURL(join(root, 'onboarding.html')).href, { waitUntil: 'load' });
await page.locator('[data-step-target="1"]').click();
await page.locator('[data-onboarding-panel="1"]:not([hidden])').waitFor();
const footerBox = await page.locator('.wizard-footer').boundingBox();
if (!footerBox || footerBox.y + footerBox.height > 900) {
  failures.push('onboarding.html: sticky footer is outside the 1440x900 viewport');
}
await page.screenshot({ path: join(root, 'screens/onboarding-connect.png'), fullPage: true });

await page.goto(pathToFileURL(join(root, 'start-variants.html')).href, { waitUntil: 'load' });
await page.locator('[data-variant-target="b"]').click();
await page.locator('[data-variant-panel="b"]:not([hidden])').waitFor();
if ((await page.locator('[data-variant-title]').textContent())?.includes('Variant B') !== true) {
  failures.push('start-variants.html: switching variants did not update the review title');
}
await page.screenshot({ path: join(root, 'screens/onboarding-start-variant-b.png'), fullPage: true });
await page.locator('[data-variant-target="a"]').click();
await page.locator('[data-variant-panel="a"]:not([hidden])').waitFor();
await page.screenshot({ path: join(root, 'screens/onboarding-start-variant-a.png'), fullPage: true });
await page.locator('[data-variant-target="c"]').click();
await page.locator('[data-variant-panel="c"]:not([hidden])').waitFor();
await page.screenshot({ path: join(root, 'screens/onboarding-start-variant-c.png'), fullPage: true });

await page.goto(pathToFileURL(join(root, 'settings.html')).href, { waitUntil: 'load' });
await page.locator('[data-settings-panel="overview"]:not([hidden])').waitFor();
await page.screenshot({ path: join(root, 'screens/settings-overview.png'), fullPage: true });
await page.locator('[data-settings-target="models"]').click();
if (await page.locator('.assignment-list:visible').count() !== 0) {
  failures.push('settings.html: Standard mode exposed concrete assignment overrides');
}
await page.locator('[data-settings-mode-target="advanced"]').click();
if (await page.locator('[data-settings-target="routing"]:visible').count() !== 1) {
  failures.push('settings.html: Advanced mode did not reveal advanced navigation');
}
if (await page.locator('.assignment-list:visible').count() !== 6) {
  failures.push('settings.html: Advanced mode did not reveal all six assignment groups');
}
if (await page.locator('.assignment-list > div:visible').count() !== 18) {
  failures.push('settings.html: Advanced mode did not expose exactly 18 concrete assignments');
}
await page.screenshot({ path: join(root, 'screens/settings-models-advanced.png'), fullPage: true });

await page.goto(pathToFileURL(join(root, 'provider-picker.html')).href, { waitUntil: 'load' });
await page.screenshot({ path: join(root, 'screens/openrouter-picker.png'), fullPage: true });
await page.locator('[data-model-query]').fill('Mistral');
if (await page.locator('[data-searchable-model]:visible').count() !== 1) {
  failures.push('provider-picker.html: model search did not narrow the visible list to one row');
}
await page.locator('[data-model-query]').fill('');
await page.locator('[data-searchable-model]').first().locator('[data-model-card]').click();
if (!(await page.locator('[data-model-selection]').textContent())?.includes('Claude Haiku')) {
  failures.push('provider-picker.html: selected model summary did not update');
}

await browser.close();

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Verified 5 HTML pages at 1440x900: links, overflow, footer visibility, variants, settings depth, screenshots, and core prototype interactions.');
}
