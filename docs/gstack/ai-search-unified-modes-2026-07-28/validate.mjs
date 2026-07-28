import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = pathToFileURL(path.join(directory, "index.html")).href;
const aiGraphPageUrl = pathToFileURL(path.join(directory, "..", "ai-graph-artifact-platform-2026-07-28", "index.html")).href;
const screenshotPath = path.join("/tmp", "ai-search-unified-modes-preview.png");
const menuScreenshotPath = path.join("/tmp", "ai-search-mode-menu-preview.png");
const graphScreenshotPath = path.join("/tmp", "ai-search-ai-graph-list-preview.png");
const embeddedScreenshotPath = path.join("/tmp", "ai-graph-unified-entry-preview.png");
const repoRoot = path.resolve(directory, "..", "..", "..");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(pageUrl, { waitUntil: "load" });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function validateLocalLinks(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const links = [];
  const markdownLink = /\]\(([^)]+)\)/g;
  const htmlLink = /(?:href|src)="([^"]+)"/g;

  for (const pattern of [markdownLink, htmlLink]) {
    let match;
    while ((match = pattern.exec(source)) !== null) links.push(match[1]);
  }

  for (const link of links) {
    if (/^(?:https?:|mailto:|data:|javascript:)/.test(link) || link.startsWith("#")) continue;
    const [pathPart, fragment] = link.split("#");
    const cleanPath = pathPart.split("?")[0];
    const target = path.resolve(path.dirname(filePath), cleanPath);
    assert(fs.existsSync(target), `missing local link target: ${link} from ${filePath}`);

    if (!fragment || path.extname(target) !== ".html") continue;
    const targetHtml = fs.readFileSync(target, "utf8");
    const hasFragment = targetHtml.includes(`id="${fragment}"`) || targetHtml.includes(`name="${fragment}"`);
    assert(hasFragment, `missing fragment #${fragment} in ${target}`);
  }
}

[
  path.join(directory, "index.html"),
  path.join(directory, "README.md"),
  path.join(repoRoot, "docs", "superpowers", "specs", "2026-07-28-ai-search-unified-modes.md"),
].forEach(validateLocalLinks);

assert(await page.locator("#ai-mode-trigger-label").textContent() === "AI Search", "normal open must default to AI Search");
assert(await page.locator(".mode-option").count() === 3, "mode menu must expose exactly three AI modes");

const vaultTabBox = await page.locator("#vault-search-tab").boundingBox();
const modeTriggerBox = await page.locator("#ai-mode-trigger").boundingBox();
const modalBox = await page.locator("#search-modal").boundingBox();
assert(vaultTabBox && modeTriggerBox && modalBox, "top-level switcher controls must have measurable geometry");
const vaultTabCenterY = vaultTabBox.y + vaultTabBox.height / 2;
const modeTriggerCenterY = modeTriggerBox.y + modeTriggerBox.height / 2;
assert(Math.abs(vaultTabCenterY - modeTriggerCenterY) <= 1, "Vault Search and AI mode selector must share the same vertical center");
assert(Math.abs(vaultTabBox.height - modeTriggerBox.height) <= 1, "AI mode selector must fill the same top-bar height as Vault Search");

await page.locator("#ai-mode-trigger").click();
const menuBox = await page.locator("#ai-mode-menu").boundingBox();
assert(menuBox && modalBox, "mode menu and modal must have measurable geometry");
assert(menuBox.x >= modalBox.x && menuBox.x + menuBox.width <= modalBox.x + modalBox.width, "mode menu must stay inside the modal");
await page.locator(".search-modal").screenshot({ path: menuScreenshotPath });
await page.locator('[data-mode="graph"]').click();
assert(await page.locator("#ai-mode-trigger-label").textContent() === "AI Graph", "AI Graph selection did not update the trigger");
assert(await page.locator('[data-history-list] .history-row').count() === 5, "AI Graph must render one compact history list");
assert(await page.locator('[data-history-list] .row-origin').count() === 5, "every AI Graph row must expose stable creation provenance");
const fileAtlasOrigin = page.locator('[data-history-list] .row-origin').filter({ hasText: "File Atlas" });
assert(await fileAtlasOrigin.count() === 1, "AI Graph history must identify the File Atlas creation surface");
assert((await fileAtlasOrigin.textContent()).includes("AI 编辑器生态调研.md"), "File Atlas provenance must identify the exact atlas file");
assert(await page.getByText("Vault / Web / Mixed", { exact: false }).count() === 1, "old filters should appear only in the explanatory removed list");
await page.locator(".search-modal").screenshot({ path: graphScreenshotPath });

await page.locator("#ai-mode-trigger").click();
await page.locator('[data-mode="intelligence"]').focus();
await page.keyboard.press("Escape");
assert(await page.locator("#ai-mode-trigger").getAttribute("aria-expanded") === "false", "Escape must close the mode menu");
assert(await page.locator("#ai-mode-trigger").evaluate((element) => element === document.activeElement), "Escape must restore focus to the mode trigger");

await page.locator("#ai-mode-trigger").press("Alt+ArrowDown");
assert(await page.locator("#ai-mode-trigger-label").textContent() === "Vault Intelligence", "modifier shortcut should cycle modes outside editable fields");
await page.locator("#workspace-input").focus();
await page.keyboard.press("Alt+ArrowDown");
assert(await page.locator("#ai-mode-trigger-label").textContent() === "Vault Intelligence", "modifier shortcut must not steal editable input");

await page.locator("#vault-search-tab").click();
assert(await page.locator("#search-modal").getAttribute("data-active-surface") === "vault", "Vault Search surface did not activate");

await page.locator("#reset-demo").click();
assert(await page.locator("#ai-mode-trigger-label").textContent() === "AI Search", "reset must restore AI Search");
assert(await page.locator("#search-modal").getAttribute("data-active-surface") === "ai", "reset must restore the AI surface");
await page.waitForTimeout(2500);

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
assert(!overflow, "page has horizontal overflow at the primary desktop viewport");
assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);

await page.screenshot({ path: screenshotPath, fullPage: true });

await page.goto(aiGraphPageUrl, { waitUntil: "load" });
const embedded = page.frameLocator(".unified-search-frame");
assert(await embedded.locator("#ai-mode-trigger-label").textContent() === "AI Search", "AI Graph prototype must embed the same default AI Search mock");
const parentOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
assert(!parentOverflow, "AI Graph prototype has horizontal overflow after embedding the unified mock");
assert(errors.length === 0, `browser errors after embedded verification: ${errors.join(" | ")}`);
await page.locator(".unified-search-frame").screenshot({ path: embeddedScreenshotPath });

await browser.close();

console.log(`PASS ${pageUrl}`);
console.log(`PASS ${aiGraphPageUrl}`);
console.log(`SCREENSHOT ${screenshotPath}`);
console.log(`SCREENSHOT ${menuScreenshotPath}`);
console.log(`SCREENSHOT ${graphScreenshotPath}`);
console.log(`SCREENSHOT ${embeddedScreenshotPath}`);
