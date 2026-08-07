import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(fileURLToPath(import.meta.url));
const pages = ['index.html', 'start-variants.html', 'onboarding.html', 'settings-variants.html', 'settings.html', 'provider-picker.html'];
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

await page.goto(pathToFileURL(join(root, 'settings-variants.html')).href, { waitUntil: 'load' });
await page.locator('[data-settings-concept="tabs"]:not([hidden])').waitFor();
await page.locator('[data-settings-concept-target="home"]').click();
await page.locator('[data-settings-concept="home"]:not([hidden])').waitFor();
await page.locator('[data-home-open="ai"]').click();
await page.locator('[data-home-page="detail"]:not([hidden])').waitFor();
await page.screenshot({ path: join(root, 'screens/settings-variant-home-detail.png'), fullPage: true });
await page.locator('[data-settings-concept-target="search"]').click();
await page.locator('[data-concept-search]').fill('media');
if (await page.locator('[data-search-entry]:visible').count() !== 1) {
  failures.push('settings-variants.html: search-first concept did not filter to the media route');
}

await page.goto(pathToFileURL(join(root, 'settings.html')).href, { waitUntil: 'load' });
await page.locator('[data-settings-panel="general"]:not([hidden])').waitFor();
if (await page.locator('[data-settings-mode-target]').count() !== 0) {
  failures.push('settings.html: deprecated global Standard/Advanced mode is still present');
}
if (await page.locator('[data-settings-target]:visible').count() !== 7) {
  failures.push('settings.html: fixed navigation does not expose exactly seven stable categories');
}
await page.screenshot({ path: join(root, 'screens/settings-overview.png'), fullPage: true });
await page.locator('[data-settings-target="ai"]').click();
await page.locator('[data-settings-panel="ai"]:not([hidden])').waitFor();
if (await page.locator('[data-settings-target]:visible').count() !== 7) {
  failures.push('settings.html: navigation changed after opening AI & models');
}
await page.screenshot({ path: join(root, 'screens/settings-ai-models-v3.png'), fullPage: true });
await page.locator('[data-settings-query]').fill('index');
if (await page.locator('[data-setting-search-item]:visible').count() < 1) {
  failures.push('settings.html: search did not reveal a matching index destination');
} else {
  await page.locator('[data-setting-search-item]:visible').first().click();
  await page.locator('[data-settings-panel="knowledge"]:not([hidden])').waitFor();
}
await page.locator('[data-settings-target="developer"]').click();
await page.locator('[data-settings-panel="developer"]:not([hidden])').waitFor();
if (await page.locator('[data-settings-target]:visible').count() !== 7) {
  failures.push('settings.html: Developer page replaced or hid the fixed navigation');
}

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
  console.log('Verified 6 HTML pages at 1440x900: links, overflow, footer visibility, onboarding/settings variants, fixed Settings navigation/search, screenshots, and core prototype interactions.');
}
