import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const fileUrl = pathToFileURL(new URL("./intelligence-ia-lab.html", import.meta.url).pathname).href;
const sessionHeaderPreviewPath = fileURLToPath(new URL("./preview-intelligence-ia-c-session-header.png", import.meta.url));
const captureScreenshots = process.env.CAPTURE_SCREENSHOTS !== "0";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1505, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(5000);
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

async function goto(query) {
  await page.goto(`${fileUrl}?${query}`);
  await page.waitForSelector("#intelligence-panel");
}

await goto("variant=adaptive&mode=copilot&stage=brief");
assert.equal(await page.locator(".brief-view").isVisible(), true, "adaptive opens on brief");
assert.equal(await page.locator("#stage-tabs").isVisible(), false, "adaptive hides permanent stage tabs");
assert.equal(await page.locator("#session-dock").isVisible(), false, "brief has no full composer");
const headerContract = await page.evaluate(() => {
  const header = document.querySelector(".sidecar-header").getBoundingClientRect();
  const presence = document.querySelector(".sidecar-presence").getBoundingClientRect();
  const iconStyle = getComputedStyle(document.querySelector(".presence-icon"));
  return {
    centerDelta: Math.abs((header.left + header.width / 2) - (presence.left + presence.width / 2)),
    iconBackground: iconStyle.backgroundColor,
    iconBorder: iconStyle.borderTopWidth,
    iconWidth: iconStyle.width,
  };
});
assert.ok(headerContract.centerDelta <= 1.5, "Intelligence title group is geometrically centered");
assert.equal(headerContract.iconBackground, "rgba(0, 0, 0, 0)", "header spark has no decorative box");
assert.equal(headerContract.iconBorder, "0px", "header spark has no border box");
assert.equal(headerContract.iconWidth, "18px", "header spark stays a compact mark");

await page.locator('[data-discuss-suggestion="counterpoint"]').click();
assert.equal(await page.locator(".session-view").isVisible(), true, "suggestion enters task session");
assert.equal(await page.locator("#session-dock").isVisible(), true, "session mounts full composer");
assert.equal(await page.locator('.run-receipt[data-run-id="run-current"]').count(), 1, "an existing run is represented once inside the Q&A flow");
assert.equal(await page.locator('.run-receipt[data-run-id="run-reviewed"]').count(), 1, "a reviewed run remains reopenable from its originating conversation");
await page.locator("#prompt-input").focus();
await page.waitForTimeout(160);
assert.equal(await page.locator("#intelligence-panel").evaluate((element) => element.scrollTop), 0, "composer focus does not scroll the sidecar shell");
assert.equal(await page.locator(".sidecar-header").isVisible(), true, "sidecar navigation remains visible after composer focus");
const focusContract = await page.evaluate(() => {
  const editor = document.querySelector("#prompt-input");
  const shell = document.querySelector("#prompt-input-shell");
  const editorStyle = getComputedStyle(editor);
  const shellStyle = getComputedStyle(shell);
  return {
    editorOutline: editorStyle.outlineStyle,
    editorBorder: editorStyle.borderTopStyle,
    shellBorder: shellStyle.borderTopColor,
    shellShadow: shellStyle.boxShadow,
    editorPaddingLeft: editorStyle.paddingLeft,
  };
});
assert.equal(focusContract.editorOutline, "none", "editor does not own focus outline");
assert.equal(focusContract.editorBorder, "none", "editor has no inner border");
assert.match(focusContract.shellShadow, /rgba|rgb/, "outer shell owns focus ring");
assert.equal(focusContract.editorPaddingLeft, "14px", "Chat Studio horizontal input padding is preserved");
const taskAlignment = await page.evaluate(() => {
  const title = document.querySelector(".task-copy h2").getBoundingClientRect();
  const action = document.querySelector(".task-action").getBoundingClientRect();
  const back = document.querySelector(".task-back").getBoundingClientRect();
  return { titleAction: Math.abs(title.top - action.top), titleBack: Math.abs(title.top - back.top) };
});
assert.ok(taskAlignment.titleAction <= 2, "session title aligns with its right-side action");
assert.ok(taskAlignment.titleBack <= 2, "session title aligns with its back control");
await page.evaluate(() => document.activeElement?.blur());
if (captureScreenshots) await page.screenshot({ path: sessionHeaderPreviewPath, fullPage: true });

await page.locator("[data-open-capabilities]").click();
assert.equal(await page.locator("#capability-dialog").getAttribute("open"), "", "capability picker opens");
await page.locator("#capability-search").fill("总结");
assert.equal(await page.locator('[data-capability-choice="summarize"]').isVisible(), true, "picker search filters registry");
await page.locator('[data-capability-choice="summarize"]').click();
assert.equal(await page.locator(".context-chip.is-action").isVisible(), true, "capability becomes action chip");

await page.locator(".task-head [data-start-review]").click();
assert.equal(await page.locator(".review-view").isVisible(), true, "session enters review");
assert.match(await page.locator(".review-progress > span").first().textContent(), /改动 2 \/ 8/, "review starts on requested 2/8 state");
const targetBox = await page.locator(".doc-block.is-review-target").boundingBox();
const paperBox = await page.locator("#paper").boundingBox();
assert.ok(targetBox && paperBox, "review target and paper are measurable");
assert.ok(targetBox.width < paperBox.width, "review highlight follows the block rather than spanning the page");

const firstTarget = await page.locator(".doc-block.is-review-target").getAttribute("data-block-id");
await page.locator('[data-review-nav="next"]').click();
const secondTarget = await page.locator(".doc-block.is-review-target").getAttribute("data-block-id");
assert.notEqual(secondTarget, firstTarget, "next change moves the document anchor");
const historyBeforeAccept = Number(await page.locator("#history-count").textContent());
await page.locator('#intelligence-panel .review-card [data-review-action="accept"]').click();
assert.equal(Number(await page.locator("#history-count").textContent()), historyBeforeAccept + 1, "accepted change creates exactly one History transaction");
await page.locator('[data-change-index="2"]').click();
assert.equal(await page.locator("#live-change-nav").isVisible(), true, "resolved changes keep stable document-local navigation");
assert.match(await page.locator("#live-change-nav").textContent(), /已接受/, "resolved navigator exposes the accepted decision");
assert.equal(await page.locator('#intelligence-panel .review-card [data-review-action]').count(), 0, "resolved sidecar detail no longer exposes decision actions");

await page.locator('[data-mode="history"]').click();
assert.equal(await page.locator(".history-view").isVisible(), true, "History is a separate top-level surface");
await page.locator(".history-row").first().click();
assert.equal(await page.locator("#history-dialog").getAttribute("open"), "", "History transaction opens diff dialog");
await page.locator("[data-close-history]").click();

await goto("variant=staged&mode=copilot&stage=brief");
assert.equal(await page.locator("#stage-tabs").isVisible(), true, "staged variant exposes lifecycle navigation");
assert.equal(await page.locator('.stage-tabs button[data-stage="brief"]').getAttribute("aria-selected"), "true", "brief stage is selected");
assert.equal(await page.locator("#session-dock").isVisible(), false, "staged brief still hides composer");

await page.locator('.stage-tabs button[data-stage="session"]').click();
assert.equal(await page.locator("#session-dock").isVisible(), true, "staged session shows composer in the same position");
await page.locator('.stage-tabs button[data-stage="review"]').click();
assert.equal(await page.locator(".review-navigator").isVisible(), true, "staged review uses the same change set");

await goto("variant=hybrid&mode=copilot&stage=brief");
assert.equal(await page.locator("#stage-tabs").isVisible(), true, "hybrid reveals queue navigation when work exists");
assert.equal(await page.locator('.stage-tabs button[data-stage="brief"] [data-stage-label]').textContent(), "建议", "hybrid keeps the brief label plain");
assert.equal(await page.locator('.stage-tabs button[data-stage="session"] [data-stage-label]').textContent(), "进行中", "hybrid names the active task queue");
assert.equal(await page.locator('.stage-tabs button[data-stage="review"] [data-stage-label]').textContent(), "待审", "hybrid names the pending change queue");
assert.equal(await page.locator("#session-dock").isVisible(), false, "hybrid workbench stays composer-free");

const firstSuggestionBefore = await page.locator(".suggestion-row").first().getAttribute("data-suggestion-id");
const visibleSuggestionCount = await page.locator(".suggestion-row").count();
const suggestionMore = page.locator(".suggestion-more > summary").first();
assert.equal(await suggestionMore.getAttribute("aria-label"), "更多操作", "ellipsis means more actions rather than immediate ignore");
await suggestionMore.click();
assert.equal(await page.locator(".suggestion-menu").first().isVisible(), true, "ellipsis opens an explicit suggestion menu");
assert.equal(await page.locator('.suggestion-menu [data-ignore-suggestion]').first().textContent().then((text) => text.includes("本轮忽略")), true, "ignore is a labelled menu action");
assert.equal(await page.locator(".suggestion-row").count(), visibleSuggestionCount, "opening more actions does not discard the suggestion");
await page.locator('.suggestion-menu [data-defer-suggestion]').first().click();
assert.notEqual(await page.locator(".suggestion-row").first().getAttribute("data-suggestion-id"), firstSuggestionBefore, "defer moves the suggestion behind higher priorities");
assert.equal(await page.locator(".suggestion-row").count(), visibleSuggestionCount, "defer preserves the visible suggestion count");

const relatedMaterialPreview = page.locator("[data-related-material-preview]");
await relatedMaterialPreview.waitFor();
assert.equal(await relatedMaterialPreview.locator('[data-graph-surface="compact"]').count(), 1, "the sidecar retains its bounded related-material graph preview");
assert.equal(await relatedMaterialPreview.locator("[data-graph-node]").count(), 5, "the compact preview shows the current object plus four ranked materials");
const previewMaterialNode = relatedMaterialPreview.locator('[data-source-id]:not([data-source-id=""])').nth(1);
const previewMaterialId = await previewMaterialNode.getAttribute("data-source-id");
await previewMaterialNode.click();
assert.equal(
  await page.locator("[data-related-material-preview] [data-selected-source]").getAttribute("data-selected-source"),
  previewMaterialId,
  "selecting an inline graph node updates the local material detail without opening the modal",
);

const materialsOpener = page.locator("[data-related-material-preview] [data-open-graph]");
await materialsOpener.click();
const materialsDialog = page.locator("#graph-dialog[open]");
await materialsDialog.waitFor();
const reusedMaterialsBrowser = materialsDialog.locator("[data-vault-result-browser-reuse]");
await reusedMaterialsBrowser.waitFor();
assert.match(
  await reusedMaterialsBrowser.innerText(),
  /Vault Search Result Browser/,
  "the full-materials entry uses the same shared Vault Search Result Browser",
);
assert.equal(
  await materialsDialog.locator("[data-result-view]").count(),
  0,
  "the full-materials entry has no local result-view implementation",
);
assert.equal(
  await materialsDialog.locator("[data-graph-preset]").count(),
  0,
  "the full-materials entry has no local graph-layout implementation",
);
await materialsDialog.locator("[data-close-graph]").click();
await materialsDialog.waitFor({ state: "hidden" });
assert.equal(
  await materialsOpener.evaluate((button) => document.activeElement === button),
  true,
  "closing the shared result browser restores focus to the inline preview entry",
);

await page.locator('.stage-tabs button[data-stage="session"]').click();
assert.equal(await page.locator("#session-dock").isVisible(), true, "hybrid composer belongs only to the active task");
await page.locator('.stage-tabs button[data-stage="review"]').click();
assert.equal(await page.locator(".review-navigator").isVisible(), true, "hybrid pending queue opens the change navigator");

await goto("variant=hybrid&mode=copilot&stage=brief&fresh=1");
assert.equal(await page.locator("#stage-tabs").isVisible(), false, "fresh hybrid keeps A's minimal idle state");
await page.locator(".sensing-control > summary").click();
assert.equal(await page.locator('[data-sensing-mode="smart"]').getAttribute("aria-checked"), "true", "smart sensing is the default");
assert.equal(await page.locator("[data-toggle-auto-run]").getAttribute("aria-checked"), "false", "auto-run is a separate opt-in");
const sensingHistory = Number(await page.locator("#history-count").textContent());
const sensingDocument = await page.locator('[data-block-id="ai-sidecar"]').innerHTML();
await page.locator('[data-sensing-mode="continuous"]').click();
await page.locator(".sensing-control > summary").click();
assert.equal(await page.locator('[data-sensing-mode="continuous"]').getAttribute("aria-checked"), "true", "continuous sensing can be selected independently");
assert.equal(await page.locator("[data-toggle-auto-run]").getAttribute("aria-checked"), "false", "changing sensing does not enable auto-run");
await page.locator("[data-toggle-auto-run]").click();
await page.locator(".sensing-control > summary").click();
assert.equal(await page.locator("[data-toggle-auto-run]").getAttribute("aria-checked"), "true", "auto-run can be opted into separately");
assert.equal(await page.locator('[data-sensing-mode="continuous"]').getAttribute("aria-checked"), "true", "auto-run does not rewrite sensing cadence");
assert.equal(Number(await page.locator("#history-count").textContent()), sensingHistory, "sensing settings never create History entries");
assert.equal(await page.locator('[data-block-id="ai-sidecar"]').innerHTML(), sensingDocument, "sensing settings never write the document");
await page.locator("[data-start-session]").click();
assert.equal(await page.locator("#stage-tabs").isVisible(), true, "starting a task progressively reveals queue navigation");
assert.equal(await page.locator('.stage-tabs button[data-stage="review"]').isDisabled(), true, "review stays unavailable until a change set exists");

const clueThreadCount = await page.locator(".thread-event").count();
const clueContext = await page.locator("#prompt-context .context-chip:not(.is-action)").evaluateAll((chips) => chips.map((chip) => chip.textContent.trim()));
const clueHistory = Number(await page.locator("#history-count").textContent());
const clueUpdate = page.locator(".thread-event.is-clue-update");
assert.equal(await clueUpdate.count(), 3, "each ambient finding uses the same ordinary Copilot message item model");
assert.equal(await clueUpdate.locator(".clue-message-evidence").count(), 3, "every clue exposes its reason directly without an external detail panel");
assert.equal(await clueUpdate.locator("[data-use-session-clue]").count(), 3, "each clue can be brought into the next turn from its own message");
const clueMessageIds = await clueUpdate.evaluateAll((messages) => messages.map((message) => message.dataset.messageId));
assert.equal(new Set(clueMessageIds).size, clueMessageIds.length, "each projected clue keeps a stable message ID");
assert.deepEqual(await page.locator("#prompt-context .context-chip:not(.is-action)").evaluateAll((chips) => chips.map((chip) => chip.textContent.trim())), clueContext, "rendering clue messages does not mutate frozen context");
assert.equal(Number(await page.locator("#history-count").textContent()), clueHistory, "rendering clue messages does not create History");
await clueUpdate.first().locator("[data-use-session-clue]").click();
assert.match(await page.locator("#prompt-input").inputValue(), /先说明依据，再生成可审阅的修改/, "bringing in a clue assembles the next prompt in place");
assert.equal(await page.locator(".thread-event").count(), clueThreadCount, "bringing in a clue updates the existing message instead of appending another event");
assert.deepEqual(await page.locator("#prompt-context .context-chip:not(.is-action)").evaluateAll((chips) => chips.map((chip) => chip.textContent.trim())), clueContext, "bringing in a clue keeps the frozen source context intact");
assert.equal(await page.locator(".thread-event.is-run").count(), 0, "bringing in a clue never starts a run automatically");
assert.equal(Number(await page.locator("#history-count").textContent()), clueHistory, "bringing in a clue never writes History");

await page.locator("#prompt-input").fill("把这一段改得更清楚，并给出可审阅的修改。");
const runHistoryBefore = Number(await page.locator("#history-count").textContent());
const runReceiptCountBefore = await page.locator(".run-receipt").count();
const reviewedReceiptBefore = await page.locator('.run-receipt[data-run-id="run-reviewed"]').textContent();
await page.locator("#session-dock [data-send]").click();
await page.locator(".thread-event.is-run").waitFor();
assert.ok(await page.locator(".run-progress-list li").count() >= 1, "agent run exposes safe progress events");
assert.equal(await page.locator("#session-dock [data-send]").isDisabled(), true, "a running task prevents a concurrent send");
assert.equal(await page.locator("#live-change-nav").isVisible(), true, "a running task exposes document-local change navigation");
assert.equal(await page.locator(".doc-block.is-streaming-target").count(), 1, "one live candidate is projected into the document");
assert.equal(await page.locator(".doc-block.is-streaming-target del").count(), 1, "live candidate shows removals in place");
assert.equal(await page.locator(".doc-block.is-streaming-target ins").count(), 1, "live candidate shows additions in place");
assert.equal(Number(await page.locator("#history-count").textContent()), runHistoryBefore, "generation progress never enters History");
await page.waitForFunction((expected) => document.querySelectorAll(".run-receipt").length === expected, runReceiptCountBefore + 1);
const currentReceipt = page.locator(".run-receipt").last();
assert.match(await currentReceipt.textContent(), /改动\s*8.*洞察\s*2.*来源\s*5.*记录\s*6/s, "run receipt summarizes all four artifact groups");
assert.equal(await page.locator('.run-receipt[data-run-id="run-reviewed"]').textContent(), reviewedReceiptBefore, "starting a new run never rewrites a previous receipt");
assert.equal(await page.locator('.run-receipt[data-run-id="run-reviewed"] .run-inline-panel').getAttribute("hidden"), "", "previous receipts remain folded while the current run opens in place");
const receiptIds = await page.locator(".run-receipt").evaluateAll((receipts) => receipts.map((receipt) => receipt.dataset.runId));
assert.equal(new Set(receiptIds).size, receiptIds.length, "every message keeps an immutable run ID");
const runTabIds = await page.locator("[data-run-inline-tab]").evaluateAll((tabs) => tabs.map((tab) => tab.id));
assert.equal(new Set(runTabIds).size, runTabIds.length, "stable run IDs prevent duplicate tab DOM IDs");
assert.match(await page.locator("#live-change-nav").textContent(), /候选尚未写入/, "completed generation remains a candidate until review");
assert.equal(Number(await page.locator("#history-count").textContent()), runHistoryBefore, "reviewable candidates still do not enter History");

const reviewModeButtons = page.locator("#live-change-nav [data-review-mode]");
assert.deepEqual(await reviewModeButtons.evaluateAll((buttons) => buttons.map((button) => button.dataset.reviewMode).sort()), ["all", "current", "original"], "document review offers current, all, and original modes in one navigator");
const documentPins = page.locator("[data-document-change-index]");
assert.equal(await documentPins.count(), 8, "every generated change keeps a document-local pin");
assert.equal(await page.locator(".doc-block").evaluateAll((blocks) => blocks.filter((block) => block.querySelector("del, ins")).length), 1, "current mode projects an inline diff into exactly one document block");
await page.locator('#live-change-nav [data-review-mode="current"]').focus();
await page.keyboard.press("ArrowRight");
assert.equal(await page.locator('#live-change-nav [data-review-mode="all"]').getAttribute("aria-pressed"), "true", "review mode arrow navigation switches to the next display mode");
assert.equal(await page.evaluate(() => document.activeElement?.dataset.reviewMode), "all", "review mode arrow navigation restores focus after rerender");
await page.keyboard.press("ArrowLeft");
assert.equal(await page.locator('#live-change-nav [data-review-mode="current"]').getAttribute("aria-pressed"), "true", "review mode arrow navigation can return to current");
const keyboardPinBefore = await page.locator('[data-document-change-index][aria-current="true"]').getAttribute("data-document-change-index");
await page.locator('[data-document-change-index][aria-current="true"]').focus();
await page.keyboard.press("ArrowDown");
const keyboardPinAfter = await page.locator('[data-document-change-index][aria-current="true"]').getAttribute("data-document-change-index");
assert.notEqual(keyboardPinAfter, keyboardPinBefore, "document pin arrow navigation moves to the next change anchor");
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-document-change-index")), keyboardPinAfter, "document pin arrow navigation restores focus at the new anchor");
await page.keyboard.press("ArrowUp");
assert.equal(await page.locator('[data-document-change-index][aria-current="true"]').getAttribute("data-document-change-index"), keyboardPinBefore, "document pin arrow navigation can return to the previous anchor");
await page.locator('#live-change-nav [data-review-mode="current"]').focus();
await page.keyboard.press("Alt+ArrowDown");
assert.notEqual(await page.locator('[data-document-change-index][aria-current="true"]').getAttribute("data-document-change-index"), keyboardPinBefore, "Alt+ArrowDown advances review without requiring the sidecar queue");
await page.keyboard.press("Alt+ArrowUp");
assert.equal(await page.locator('[data-document-change-index][aria-current="true"]').getAttribute("data-document-change-index"), keyboardPinBefore, "Alt+ArrowUp returns to the previous review anchor");

await page.locator('#live-change-nav [data-review-mode="all"]').click();
assert.equal(await documentPins.count(), 8, "all mode preserves every change anchor");
assert.equal(await documentPins.evaluateAll((pins) => pins.every((pin) => Boolean(pin.offsetWidth || pin.offsetHeight || pin.getClientRects().length))), true, "all mode makes every document change anchor visible");
assert.ok(await page.locator(".doc-block").evaluateAll((blocks) => blocks.filter((block) => block.querySelector("del, ins")).length) > 1, "all mode projects multiple inline diffs into their document anchors");

await page.locator('#live-change-nav [data-review-mode="original"]').click();
assert.equal(await page.locator("#paper del, #paper ins").count(), 0, "original mode restores committed text without diff markup");
assert.equal(await documentPins.count(), 8, "original mode keeps document pins available for navigation");
const inactivePin = page.locator('[data-document-change-index]:not([aria-current="true"])').first();
const selectedPinIndex = await inactivePin.getAttribute("data-document-change-index");
const selectedPinBlock = await inactivePin.evaluate((pin) => pin.closest(".doc-block")?.dataset.blockId || null);
assert.ok(selectedPinIndex !== null && selectedPinBlock, "an inactive document pin identifies a stable change and block");
await inactivePin.click();
const activePin = page.locator('[data-document-change-index][aria-current="true"]');
assert.equal(await activePin.count(), 1, "clicking a document pin selects exactly one active change");
assert.equal(await activePin.getAttribute("data-document-change-index"), selectedPinIndex, "the clicked pin becomes the active change");
assert.equal(await activePin.evaluate((pin) => pin.closest(".doc-block")?.dataset.blockId || null), selectedPinBlock, "the active pin remains attached to the requested document location");

await page.locator('#live-change-nav [data-review-mode="current"]').click();
const currentDiffBlocks = await page.locator(".doc-block").evaluateAll((blocks) => blocks.filter((block) => block.querySelector("del, ins")).map((block) => block.dataset.blockId));
assert.deepEqual(currentDiffBlocks, [selectedPinBlock], "returning to current mode restores only the active pin's inline diff");
assert.equal(await page.locator(`[data-document-change-index="${selectedPinIndex}"]`).getAttribute("aria-current"), "true", "mode switching preserves the active document change");

const liveTargetBefore = await activePin.getAttribute("data-document-change-index");
await page.locator('#live-change-nav [data-live-review-nav="next"]').click();
const liveTargetNext = await activePin.getAttribute("data-document-change-index");
assert.notEqual(liveTargetNext, liveTargetBefore, "live next moves to the next document-local candidate");
await page.locator('#live-change-nav [data-live-review-nav="previous"]').click();
assert.equal(await activePin.getAttribute("data-document-change-index"), liveTargetBefore, "live previous returns to the original candidate");

assert.deepEqual(await currentReceipt.locator("[data-run-inline-tab]").evaluateAll((tabs) => tabs.map((tab) => tab.dataset.runInlineTab)), ["changes", "insights", "sources", "trace"], "one receipt keeps all four artifact groups as local tabs");
assert.deepEqual(await currentReceipt.locator("[data-run-inline-tab]").evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("tabindex"))), ["0", "-1", "-1", "-1"], "the local artifact browser exposes one roving tab stop");
await currentReceipt.locator('[data-run-inline-tab="changes"]').focus();
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => document.activeElement?.dataset.runInlineTab === "insights");
assert.equal(await currentReceipt.locator('[data-run-inline-tab="insights"]').getAttribute("aria-selected"), "true", "arrow keys switch and focus the next artifact group");
await currentReceipt.locator('[data-run-inline-tab="changes"]').click();
assert.equal(await currentReceipt.locator('.run-inline-panel[data-run-inline-panel="changes"]').count(), 1, "the current run opens its change panel inside the originating message");
assert.equal(await currentReceipt.locator(".run-inline-row").count(), 3, "changes start with three scannable rows");
assert.equal(await page.locator("#run-dialog").getAttribute("open"), null, "opening inline run artifacts never opens the legacy dialog");
await currentReceipt.locator('[data-run-inline-more="changes"]').click();
assert.equal(await currentReceipt.locator(".run-inline-row").count(), 8, "the receipt expands all eight candidate changes in place");
await page.waitForFunction(() => document.activeElement?.dataset.runInlineMore === "changes");
assert.equal(await page.evaluate(() => document.activeElement?.dataset.runInlineMore), "changes", "expanding a long artifact list restores focus to its local control");
assert.equal(await page.locator("#run-dialog").getAttribute("open"), null, "expanding changes remains inside the receipt");
const firstInlineChangeKey = await currentReceipt.locator(".run-inline-row").first().getAttribute("data-run-inline-item");
await currentReceipt.locator(".run-inline-row").first().click();
assert.equal(await currentReceipt.locator(".run-inline-row").first().getAttribute("aria-expanded"), "true", "a change row discloses its detail in place");
await page.waitForFunction((expected) => document.activeElement?.dataset.runInlineItem === expected, firstInlineChangeKey);
assert.equal(await page.evaluate(() => document.activeElement?.dataset.runInlineItem), firstInlineChangeKey, "opening an artifact row restores focus to the same message item");
assert.equal(await currentReceipt.locator(".run-inline-detail del").count(), 1, "inline change detail shows the removed text");
assert.equal(await currentReceipt.locator(".run-inline-detail ins").count(), 1, "inline change detail shows the added text beside it");
assert.equal(await page.locator("#run-dialog").getAttribute("open"), null, "opening a change row never opens the legacy dialog");

await currentReceipt.locator('[data-run-inline-tab="insights"]').click();
assert.equal(await currentReceipt.locator('.run-inline-panel[data-run-inline-panel="insights"]').count(), 1, "insights switch inside the same receipt");
assert.equal(await currentReceipt.locator(".run-inline-insight").count(), 2, "insights remain independently inspectable");
assert.equal(await page.locator("#run-dialog").getAttribute("open"), null, "switching to insights stays inline");

await currentReceipt.locator('[data-run-inline-tab="sources"]').click();
assert.equal(await currentReceipt.locator('.run-inline-panel[data-run-inline-panel="sources"]').count(), 1, "sources switch inside the same receipt");
assert.equal(await currentReceipt.locator(".run-inline-source").count(), 3, "sources start with a compact three-item slice");
await currentReceipt.locator('[data-run-inline-more="sources"]').click();
assert.equal(await currentReceipt.locator(".run-inline-source").count(), 5, "all frozen sources can expand inside the receipt");
assert.equal(await page.locator("#run-dialog").getAttribute("open"), null, "expanding sources never opens the legacy dialog");
await currentReceipt.locator("[data-open-graph-from-run]").click();
assert.equal(await page.locator("#graph-dialog").getAttribute("open"), "", "a run source can still open the dedicated relationship graph");
await page.keyboard.press("Escape");

await currentReceipt.locator('[data-run-inline-tab="trace"]').click();
assert.equal(await currentReceipt.locator('.run-inline-panel[data-run-inline-panel="trace"]').count(), 1, "trace switches inside the same receipt");
assert.equal(await currentReceipt.locator(".run-inline-trace li").count(), 3, "trace starts with three verifiable events");
assert.match(await currentReceipt.locator(".run-inline-trace-note").textContent(), /只显示可验证动作，不展示模型私有推理/, "trace distinguishes evidence from private reasoning");
await currentReceipt.locator('[data-run-inline-more="trace"]').click();
assert.equal(await currentReceipt.locator(".run-inline-trace li").count(), 6, "the complete trace expands in the originating message");
assert.equal(await page.locator("#run-dialog").getAttribute("open"), null, "all ordinary run inspection remains inline");

const reviewedReceipt = page.locator('.run-receipt[data-run-id="run-reviewed"]');
assert.match(await reviewedReceipt.textContent(), /2 已接受 · 1 已拒绝/, "reviewed run receipt keeps its decision summary");
await reviewedReceipt.locator('[data-run-inline-tab="changes"]').click();
assert.equal(await reviewedReceipt.locator('.run-inline-panel[data-run-inline-panel="changes"]').count(), 1, "old reviewed runs reopen inside their original message");
assert.equal(await reviewedReceipt.locator(".run-inline-row").count(), 3, "review replay includes all accepted and rejected decisions");
assert.deepEqual(await reviewedReceipt.locator(".run-inline-item").evaluateAll((rows) => rows.map((row) => row.dataset.status)), ["accepted", "rejected", "accepted"], "reviewed rows preserve accepted and rejected status in place");
assert.equal(await reviewedReceipt.locator("[data-start-review]").count(), 0, "reviewed run cannot be executed again from replay");
assert.equal(await page.locator("#run-dialog").getAttribute("open"), null, "reviewing an old receipt does not open the legacy dialog");

await goto("variant=hybrid&mode=copilot&stage=session&fresh=1");
const stopHistoryBefore = Number(await page.locator("#history-count").textContent());
await page.locator("#prompt-input").fill("先生成一轮候选，我可能会中途停止。");
await page.locator("#session-dock [data-send]").click();
await page.locator(".thread-event.is-run").waitFor();
await page.locator("#live-change-nav [data-stop-run]").click();
assert.equal(await page.locator(".thread-event.is-run").count(), 0, "stop removes the active run progress event");
assert.equal(await page.locator(".doc-block.is-streaming-target").count(), 0, "stop removes uncommitted document candidates");
assert.match(await page.locator(".thread").textContent(), /本轮已停止.*未写入正文/s, "stop leaves an explicit no-write receipt in the conversation");
assert.equal(Number(await page.locator("#history-count").textContent()), stopHistoryBefore, "stopped runs never enter History");

await page.setViewportSize({ width: 759, height: 998 });
await goto("variant=adaptive&mode=copilot&stage=review");
const narrowSidecar = await page.locator("#intelligence-panel").evaluate((element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const content = element.querySelector("#sidecar-content");
  return {
    position: style.position,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    viewport: innerWidth,
    contentOverflowY: getComputedStyle(content).overflowY,
    contentScrollHeight: content.scrollHeight,
    contentClientHeight: content.clientHeight,
  };
});
assert.equal(narrowSidecar.position, "fixed", "narrow sidecar remains a fixed drawer");
assert.ok(narrowSidecar.left >= 0 && narrowSidecar.right <= narrowSidecar.viewport, "narrow drawer stays in viewport");
assert.equal(narrowSidecar.contentOverflowY, "auto", "drawer body owns vertical scrolling");
assert.ok(narrowSidecar.contentScrollHeight >= narrowSidecar.contentClientHeight, "drawer body exposes a valid scroll range");
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "narrow drawer creates no horizontal overflow");
await page.locator("#intelligence-panel [data-panel-close]").click();
assert.equal(await page.locator("#composer-app").getAttribute("class").then((value) => value.includes("is-panel-open")), false, "drawer closes without changing document layout flow");
const narrowReviewToolbar = await page.locator("#live-change-nav").evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    viewport: innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  };
});
assert.ok(narrowReviewToolbar.left >= 0 && narrowReviewToolbar.right <= narrowReviewToolbar.viewport, "narrow document review toolbar stays inside the viewport");
assert.ok(narrowReviewToolbar.scrollWidth <= narrowReviewToolbar.clientWidth + 1, "narrow document review toolbar does not overflow internally");
assert.equal(await page.locator("#live-change-nav [data-review-mode]").count(), 3, "all three document review modes remain reachable after closing the drawer");
assert.equal(await page.locator("[data-document-change-index]").count(), 8, "document-local pins remain available when the narrow drawer is closed");
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "document pins and toolbar create no narrow horizontal overflow");
await page.locator("[data-panel-toggle]").click();
assert.equal(await page.locator("#composer-app").getAttribute("class").then((value) => value.includes("is-panel-open")), true, "drawer reopens from stable entry");

await goto("variant=hybrid&mode=copilot&stage=brief");
const narrowResultTrigger = page.locator("[data-related-material-preview] [data-open-graph]");
await narrowResultTrigger.click();
const narrowResultDialog = page.locator("#graph-dialog[open]");
await narrowResultDialog.waitFor();
const narrowReuseBoundary = narrowResultDialog.locator("[data-vault-result-browser-reuse]");
await narrowReuseBoundary.waitFor();
const narrowDialogBox = await narrowResultDialog.boundingBox();
assert.ok(
  narrowDialogBox && narrowDialogBox.x >= 0 && narrowDialogBox.x + narrowDialogBox.width <= 759,
  "narrow shared result-browser dialog stays fully inside the viewport",
);
assert.match(
  await narrowReuseBoundary.innerText(),
  /Vault Search Result Browser/,
  "narrow related materials preserve the shared Result Browser boundary",
);
assert.equal(
  await narrowResultDialog.locator("[data-result-view]").count(),
  0,
  "narrow Composer mock does not duplicate Vault Search result views",
);
assert.equal(
  await narrowResultDialog.locator("[data-graph-preset]").count(),
  0,
  "narrow Composer mock does not duplicate Vault Search graph layouts",
);
await page.keyboard.press("Escape");
await narrowResultDialog.waitFor({ state: "hidden" });
assert.equal(
  await narrowResultTrigger.evaluate((button) => document.activeElement === button),
  true,
  "closing the narrow shared result browser restores focus to its entry",
);

await goto("variant=hybrid&mode=copilot&stage=session");
const narrowReceipt = page.locator('.run-receipt[data-run-id="run-reviewed"]');
await narrowReceipt.locator('[data-run-inline-tab="changes"]').click();
const narrowRunPanel = await narrowReceipt.locator(".run-inline-panel").evaluate((element) => {
  const rect = element.getBoundingClientRect();
  const receipt = element.closest(".run-receipt").getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    width: rect.width,
    receiptLeft: receipt.left,
    receiptRight: receipt.right,
    viewport: innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    documentOverflow: document.documentElement.scrollWidth - innerWidth,
  };
});
assert.ok(narrowRunPanel.left >= narrowRunPanel.receiptLeft - 1 && narrowRunPanel.right <= narrowRunPanel.receiptRight + 1, "narrow inline run panel stays inside its receipt");
assert.ok(narrowRunPanel.left >= 0 && narrowRunPanel.right <= narrowRunPanel.viewport, "narrow inline run panel stays fully inside the drawer viewport");
assert.ok(narrowRunPanel.scrollWidth <= narrowRunPanel.clientWidth + 1, "narrow inline run panel has no internal horizontal overflow");
assert.ok(narrowRunPanel.documentOverflow <= 0, "narrow inline run panel creates no document overflow");

assert.deepEqual(errors, [], `browser console errors: ${errors.join(" | ")}`);

console.log(JSON.stringify({
  states: ["adaptive-brief", "adaptive-session", "adaptive-review", "history", "staged-brief", "staged-session", "staged-review", "hybrid-active", "hybrid-session", "hybrid-review", "hybrid-fresh", "sensing-independent", "run-running", "run-stopped", "run-reviewable", "document-review-modes", "run-inline-four-tabs", "reviewed-run-inline-readonly", "message-clue-items", "narrow-review", "narrow-run-inline"],
  focusContract,
  headerContract,
  taskAlignment,
  screenshots: captureScreenshots ? [
    sessionHeaderPreviewPath,
  ] : [],
  consoleErrors: errors.length,
}, null, 2));

await browser.close();
