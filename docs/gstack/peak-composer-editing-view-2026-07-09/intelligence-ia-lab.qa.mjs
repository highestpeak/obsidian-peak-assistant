import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const fileUrl = pathToFileURL(new URL("./intelligence-ia-lab.html", import.meta.url).pathname).href;
const graphParityPreviewPath = fileURLToPath(new URL("./preview-intelligence-ia-c-graph-parity.png", import.meta.url));
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

assert.equal(await page.locator("#related-material-graph").isVisible(), true, "brief shows the local evidence graph");
assert.equal(await page.locator("#related-material-graph [data-graph-node]").count(), 5, "inline graph keeps only current object and strong neighbours");
const compactRevision = await page.locator('#related-material-graph [data-graph-surface="compact"]').getAttribute("data-graph-revision");
const compactNodeIds = await page.locator("#related-material-graph [data-graph-node]").evaluateAll((nodes) => nodes.map((node) => node.dataset.graphNode));
await page.locator('#related-material-graph [data-graph-node="source:base-judgement"]').click();
assert.equal(await page.locator('#related-material-graph [data-selected-source="base-judgement"]').isVisible(), true, "node selection updates the inline evidence detail");

const graphOpener = page.locator("[data-open-graph]");
await graphOpener.click();
assert.equal(await page.locator("#graph-dialog").getAttribute("open"), "", "local graph opens a wide relationship explorer");
const graphDialogBox = await page.locator("#graph-dialog").boundingBox();
const graphSidecarBox = await page.locator("#intelligence-panel").boundingBox();
assert.ok(graphDialogBox && graphSidecarBox && graphDialogBox.width > graphSidecarBox.width * 1.8, "expanded graph is materially wider than the sidecar");
assert.equal(await page.locator('#graph-dialog [data-graph-node="source:base-judgement"]').getAttribute("aria-pressed"), "true", "expanded graph preserves the selected source");
const explorerRevision = await page.locator('#graph-dialog [data-graph-surface="explorer"]').getAttribute("data-graph-revision");
assert.equal(explorerRevision, compactRevision, "compact and explorer consume the same graph revision");
const explorerNodeIds = await page.locator("#graph-dialog [data-graph-node]").evaluateAll((nodes) => nodes.map((node) => node.dataset.graphNode));
assert.ok(compactNodeIds.every((id) => explorerNodeIds.includes(id)), "compact nodes are a bounded projection of explorer nodes");
assert.equal(explorerNodeIds.length, 6, "explorer includes the weak isolated material without changing edge kind");
const presetIds = await page.locator("#graph-dialog [data-graph-preset]").evaluateAll((tabs) => tabs.map((tab) => tab.dataset.graphPreset));
assert.deepEqual(presetIds, ["constellation", "flow-tb", "flow-lr", "folder", "orbit"], "graph exposes the five Vault Search presets");

await page.locator('#graph-dialog [data-graph-preset="flow-tb"]').click();
assert.equal(await page.locator('#graph-dialog [data-graph-preset="flow-tb"]').getAttribute("aria-selected"), "true", "top-down flow is a distinct preset");
await page.locator('#graph-dialog [data-graph-preset="flow-lr"]').click();
assert.equal(await page.locator('#graph-dialog [data-graph-preset="flow-lr"]').getAttribute("aria-selected"), "true", "left-right flow is a distinct preset");
await page.locator('#graph-dialog [data-graph-preset="folder"]').click();
assert.equal(await page.locator("#graph-dialog .graph-folder-group").count(), 2, "folder preset exposes full-depth folder group regions");
await page.locator('#graph-dialog [data-graph-preset="orbit"]').click();
assert.equal(await page.locator("#graph-dialog [data-graph-semantic]").isChecked(), true, "Orbit automatically enables Semantic like Vault Search");
assert.ok(await page.locator("#graph-dialog .graph-edge.is-semantic").count() > 0, "semantic overlay renders dashed semantic edges");
await page.locator('#graph-dialog [data-graph-preset="constellation"]').click();
assert.equal(await page.locator("#graph-dialog [data-graph-semantic]").isChecked(), false, "leaving Orbit resets Semantic like Vault Search");
assert.equal(await page.locator("#graph-dialog .graph-edge.is-semantic").count(), 0, "semantic-off keeps reference edges only");
await page.locator("#graph-dialog [data-graph-semantic]").check();
const edgeKinds = await page.locator("#graph-dialog [data-edge-kind]").evaluateAll((edges) => [...new Set(edges.map((edge) => edge.dataset.edgeKind))].sort());
assert.deepEqual(edgeKinds, ["reference", "semantic"], "visible relations keep the locked reference and semantic kinds");

const zoomBefore = await page.locator("#graph-dialog [data-graph-zoom-value]").textContent();
await page.locator('#graph-dialog [data-graph-zoom="in"]').click();
assert.notEqual(await page.locator("#graph-dialog [data-graph-zoom-value]").textContent(), zoomBefore, "explicit zoom changes the controlled viewport");
await page.locator("#graph-dialog [data-graph-fit]").click();
assert.match(await page.locator("#graph-dialog [data-graph-zoom-value]").textContent(), /^\d+%$/, "fit computes and reports a real viewport scale");

await page.locator('#graph-dialog [data-copy-graph="relations"]').click();
await page.waitForFunction(() => window.__peakGraphMermaid?.startsWith("flowchart TD"));
assert.match(await page.evaluate(() => window.__peakGraphMermaid), /\|sem\|/, "Mermaid export follows the currently visible Semantic layer");
await page.locator('#graph-dialog [data-copy-graph="image"]').click();
await page.waitForFunction(() => window.__peakGraphImage?.startsWith("data:image/png"));

await page.locator('#graph-dialog [data-graph-node="source:knowledge-base"]').hover();
await page.waitForTimeout(120);
assert.ok(await page.locator("#graph-dialog .material-node.is-dimmed").count() > 0, "hover highlights the closed neighborhood and dims unrelated nodes");
await page.locator("#graph-dialog .graph-dialog-head").hover();
await page.waitForTimeout(140);
if (captureScreenshots) await page.screenshot({ path: graphParityPreviewPath, fullPage: true });
await page.keyboard.press("Escape");
await page.waitForTimeout(60);
assert.equal(await page.locator("#graph-dialog").getAttribute("open"), null, "Escape closes the graph explorer");
assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-open-graph")), true, "closing the graph restores focus to its opener");

await page.locator("[data-open-graph]").click();
await page.locator('#graph-dialog [data-use-source="base-judgement"]').click();
assert.equal(await page.locator(".session-view").isVisible(), true, "bringing in a graph source enters the task session without running");
assert.match(await page.locator("#prompt-context").textContent(), /相关材料 · Base 使用判断\.md/, "the selected graph node becomes a concrete source context chip");

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
const liveTargetBefore = await page.locator(".doc-block.is-streaming-target").getAttribute("data-block-id");
await page.locator('#live-change-nav [data-live-review-nav="next"]').click();
const liveTargetNext = await page.locator(".doc-block.is-streaming-target").getAttribute("data-block-id");
assert.notEqual(liveTargetNext, liveTargetBefore, "live next moves to the next document-local candidate");
await page.locator('#live-change-nav [data-live-review-nav="previous"]').click();
assert.equal(await page.locator(".doc-block.is-streaming-target").getAttribute("data-block-id"), liveTargetBefore, "live previous returns to the original candidate");

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
await page.locator("[data-panel-toggle]").click();
assert.equal(await page.locator("#composer-app").getAttribute("class").then((value) => value.includes("is-panel-open")), true, "drawer reopens from stable entry");

await goto("variant=hybrid&mode=copilot&stage=brief");
await page.locator("[data-open-graph]").click();
const narrowGraph = await page.locator("#graph-dialog").boundingBox();
const narrowCanvas = await page.locator("#graph-dialog .graph-canvas.is-dialog").boundingBox();
const narrowInspector = await page.locator("#graph-dialog .graph-inspector").boundingBox();
assert.ok(narrowGraph && narrowGraph.x >= 0 && narrowGraph.x + narrowGraph.width <= 759, "narrow graph dialog stays fully inside the viewport");
assert.ok(narrowCanvas && narrowInspector && narrowInspector.y >= narrowCanvas.y + narrowCanvas.height - 1, "narrow graph moves the inspector below the canvas");
assert.equal(await page.locator("#graph-dialog [data-graph-preset]").count(), 5, "all five presets remain reachable in the narrow explorer");
await page.keyboard.press("Escape");

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
  states: ["adaptive-brief", "adaptive-session", "adaptive-review", "history", "staged-brief", "staged-session", "staged-review", "hybrid-active", "hybrid-session", "hybrid-review", "hybrid-fresh", "sensing-independent", "run-running", "run-stopped", "run-reviewable", "run-inline-four-tabs", "reviewed-run-inline-readonly", "message-clue-items", "narrow-review", "narrow-run-inline"],
  focusContract,
  headerContract,
  taskAlignment,
  screenshots: captureScreenshots ? [
    sessionHeaderPreviewPath,
    graphParityPreviewPath,
  ] : [],
  consoleErrors: errors.length,
}, null, 2));

await browser.close();
