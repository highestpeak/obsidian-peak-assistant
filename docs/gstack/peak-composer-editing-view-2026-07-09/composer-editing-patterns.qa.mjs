import assert from "node:assert/strict";
import { chromium } from "playwright";

const mainUrl = new URL("./index.html?mode=copilot&stage=brief", import.meta.url).href;
const reviewUrl = new URL("./index.html?mode=copilot&stage=review", import.meta.url).href;
const labUrl = new URL("./diff-patterns-lab.html?view=all", import.meta.url).href;
const browser = await chromium.launch({ headless: true });

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function open(url, ready) {
  const page = await browser.newPage({ viewport: { width: 1614, height: 1324 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(8000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    window.__copyWrites = { text: [], image: 0 };
    class TestClipboardItem {
      constructor(data) { this.data = data; }
    }
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: TestClipboardItem });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => { window.__copyWrites.text.push(value); },
        write: async (items) => { window.__copyWrites.image += items.length; },
      },
    });
  });
  await page.goto(url);
  await page.waitForSelector(ready);
  return { page, errors };
}

async function assertNoOverflow(page, label) {
  const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(geometry.width <= geometry.viewport + 1, `${label} has no horizontal overflow`);
}

async function actionGeometry(locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      height: style.height,
      minHeight: style.minHeight,
      borderRadius: style.borderRadius,
      padding: style.padding,
      background: style.backgroundColor,
    };
  });
}

async function shellGeometry(locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      borderRadius: style.borderRadius,
      borderColor: style.borderColor,
      background: style.backgroundColor,
      boxShadow: style.boxShadow,
    };
  });
}

async function screenshotBlockWithRail(page, block, path) {
  const box = await block.boundingBox();
  const rail = await block.locator(":scope > .block-controls").boundingBox();
  if (!box || !rail) return;
  const x = Math.max(0, Math.min(box.x, rail.x) - 8);
  const y = Math.max(0, Math.min(box.y, rail.y) - 8);
  const right = Math.max(box.x + box.width, rail.x + rail.width) + 8;
  const bottom = Math.max(box.y + box.height, rail.y + rail.height) + 8;
  await page.screenshot({
    path,
    clip: {
      x,
      y,
      width: Math.min(page.viewportSize().width - x, right - x),
      height: bottom - y,
    },
  });
}

async function dragTableCells(page, startCell, endCell) {
  const [start, end] = await Promise.all([startCell.boundingBox(), endCell.boundingBox()]);
  assert.ok(start && end, "table cells are visible before pointer-range selection");
  // Object cell-range selection is a padding/edge gesture: begin the drag inside
  // the cell's left padding gutter (left-aligned text starts ~11px in) so the
  // press never lands on a glyph. Starting on the text would — by contract —
  // hand the drag to native text selection instead.
  await page.mouse.move(start.x + 4, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const scope = document.querySelector("#selection-scope");
    const range = document.querySelector("#composer-table")?.dataset.cellRange;
    if (!scope || scope.hidden || !range) return false;
    const [rows, columns] = range.split("x");
    return scope.textContent.includes(`${rows} 行 × ${columns} 列`);
  });
}

async function assertImmediateCopy(page, block, kind, label, { autoClose = false } = {}) {
  const textWriteCount = await page.evaluate(() => window.__copyWrites.text.length);
  await page.evaluate(() => {
    getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    window.updateSelectionToolbar?.();
  });
  await block.hover();
  await block.locator(":scope > .block-action-bar [data-action='easy-copy']").evaluate((button) => button.click());
  const panel = block.locator(":scope > .block-copy-menu");
  assert.deepEqual(
    await panel.locator("[data-copy-kind]").evaluateAll((buttons) => buttons.map((button) => button.dataset.copyKind)),
    ["plain", "image", "markdown", "html"],
    `${label} keeps the owner-approved output order`,
  );
  const choice = panel.locator(`[data-copy-kind='${kind}']`);
  await choice.click();
  await page.waitForFunction(
    ({ title, copyKind }) => document.querySelector(`[data-block-title="${title}"] > .block-copy-menu [data-copy-kind="${copyKind}"]`)?.dataset.copyState === "success",
    { title: await block.getAttribute("data-block-title"), copyKind: kind },
  );
  assert.match(await choice.innerText(), /复制成功|已下载 PNG/, `${label} reports success in the clicked tile`);
  assert.equal(await page.locator("[data-easy-copy-rendered-preview], [data-copy-image-confirm], .easy-copy-raster-preview").count(), 0, `${label} opens no second preview or confirmation`);
  if (kind === "image") assert.ok(await page.evaluate(() => window.__copyWrites.image > 0), `${label} writes the rendered PNG directly`);
  const copiedText = kind === "image"
    ? ""
    : await page.evaluate((index) => window.__copyWrites.text[index] || "", textWriteCount);
  if (autoClose) {
    await page.waitForFunction((title) => document.querySelector(`[data-block-title="${title}"] > .block-copy-menu`)?.hidden, await block.getAttribute("data-block-title"));
    return copiedText;
  }
  await panel.locator("[data-copy-close]").click();
  return copiedText;
}

async function testMainEditingSurface() {
  const { page, errors } = await open(mainUrl, '[data-intelligence-root][data-intelligence-mounted="true"]');
  const transactionNotice = page.locator("#toast.is-transaction");
  const composerUndo = page.locator("#composer-undo");
  const composerRedo = page.locator("#composer-redo");
  const noticeUndo = page.locator("#toast [data-transaction-action='undo']");
  const noticeRedo = page.locator("#toast [data-transaction-action='redo']");
  assert.equal(await page.locator(".top-strip #composer-undo, .top-strip #composer-redo, .top-strip [data-transaction-action]").count(), 0, "the demo-only top strip owns no production Undo/Redo controls");
  assert.equal(await composerUndo.isVisible(), true, "document Undo remains permanently reachable in the Composer status bar");
  assert.equal(await composerRedo.isVisible(), true, "document Redo remains permanently reachable in the Composer status bar");
  assert.equal(await composerUndo.isDisabled(), true, "opening an existing document does not treat durable History receipts as session-local Undo");
  assert.equal(await composerRedo.isDisabled(), true, "Redo starts disabled before a session-local Undo");
  assert.equal(await composerUndo.locator("use").getAttribute("href"), "#i-undo", "persistent Undo uses the standard Undo icon");
  assert.equal(await composerRedo.locator("use").getAttribute("href"), "#i-redo", "persistent Redo uses the matching Redo icon");
  assert.equal(await transactionNotice.count(), 0, "opening an existing document does not show transaction chrome for seeded History receipts");
  const blockCount = await page.locator("#paper > .doc-block").count();
  assert.equal(await page.locator('#paper > .doc-block > .block-controls [data-action="collapse"]').count(), blockCount, "every top-level block has a disclosure control");
  assert.equal(await page.locator("#paper > .doc-block > .block-tail-actions").count(), 0, "top-level Blocks no longer render a separate tail action row");
  assert.equal(await page.locator("#paper > .doc-block > .ai-anchor, #paper > .doc-block > .ai-hint").count(), 0, "top-level Blocks have no second AI-suggestion trigger level");

  const frontmatter = page.locator("#paper > .frontmatter-block");
  const metadataActionBar = frontmatter.locator(":scope > .block-action-bar");
  assert.equal(await frontmatter.locator(":scope > .metadata-actions").count(), 0, "Frontmatter has no second permanent metadata action row");
  assert.equal(await metadataActionBar.locator("[data-metadata-action]").count(), 0, "Frontmatter Block bar has no ambiguous metadata write button");
  assert.deepEqual(await frontmatter.locator(":scope > .block-badges .block-state-row > button").allTextContents(), ["属性告警", "AI 属性建议 · 2"], "AI property suggestions sit beside the metadata warning");
  await frontmatter.locator('[data-metadata-action="suggest"]').click();
  assert.equal(await page.locator("#metadata-ai-suggestions").isVisible(), true, "AI property suggestions open beside the current Frontmatter");
  await page.locator('#metadata-ai-suggestions [data-metadata-key="summary"]').click();
  assert.equal(await frontmatter.locator(":scope > .metadata-property-draft").isVisible(), true, "AI choice becomes an editable field candidate");
  assert.match(await frontmatter.locator(".metadata-property-draft").innerText(), /尚未写入 YAML/, "candidate is explicitly review-only");
  await frontmatter.locator('[data-metadata-draft="cancel"]').first().click();

  await frontmatter.hover();
  const propertyTrigger = metadataActionBar.locator("#vault-property-trigger");
  assert.equal(await page.locator(".top-strip #vault-property-trigger").count(), 0, "Vault property entry does not occupy the global Composer header");
  assert.equal(await frontmatter.locator(":scope > .metadata-library-entry").count(), 0, "Frontmatter has no permanently visible Vault-property entry row");
  assert.equal(await propertyTrigger.isVisible(), true, "Vault property entry appears in the Frontmatter hover action row");
  assert.deepEqual(
    await metadataActionBar.locator(".block-action-core > button").allTextContents(),
    ["在下方插入", "复制", "评论", "Vault 属性库"],
    "Frontmatter deterministic actions include the Vault property library in the same hover row",
  );
  await propertyTrigger.click();
  const propertySurface = frontmatter.locator(":scope > #vault-property-overlay");
  assert.equal(await propertySurface.isVisible(), true, "Vault field statistics expand inline under the current Frontmatter");
  assert.equal(await propertyTrigger.getAttribute("aria-expanded"), "true", "local Vault property disclosure reports its expanded state");
  assert.equal(await propertySurface.evaluate((node) => getComputedStyle(node).position), "relative", "Vault property library is an inline surface rather than a fixed modal");
  assert.equal(await propertySurface.locator(".vault-property-scrim").count(), 0, "inline Vault property library has no global modal scrim");
  assert.equal(await page.locator("body").evaluate((node) => node.classList.contains("has-vault-property-library")), false, "opening the local library does not put the whole Composer into modal state");
  const [metadataGridBox, propertySurfaceBox] = await Promise.all([
    frontmatter.locator(":scope > .metadata-grid").boundingBox(),
    propertySurface.boundingBox(),
  ]);
  assert.ok((propertySurfaceBox?.y || 0) >= (metadataGridBox?.y || 0) + (metadataGridBox?.height || 0), "the library content opens below the Frontmatter field box");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await frontmatter.screenshot({ path: new URL("./preview-frontmatter-vault-property-library.png", import.meta.url).pathname });
  }
  await page.locator('[data-vault-property-key="cssclasses"]').click();
  assert.equal(await propertySurface.isHidden(), true, "choosing a field closes the inline library");
  assert.equal(await propertyTrigger.getAttribute("aria-expanded"), "false", "local Vault property disclosure returns to collapsed state");
  assert.equal(await frontmatter.locator(".metadata-property-draft [data-metadata-draft-key]").inputValue(), "cssclasses", "library selection creates a current-note key candidate");
  await frontmatter.locator(".metadata-property-draft [data-metadata-draft-value]").fill("wide-page");
  await frontmatter.locator('[data-metadata-draft="accept"]').click();
  assert.match(await frontmatter.getAttribute("data-source"), /cssclasses: wide-page/, "only explicit acceptance writes the new YAML field");
  await transactionNotice.waitFor({ state: "visible" });
  assert.match(await transactionNotice.innerText(), /改动已写入[\s\S]*添加属性 cssclasses/, "a committed write surfaces one contextual transaction notice");
  assert.equal(await composerUndo.isEnabled(), true, "accepting a write transaction enables document Undo");
  assert.equal(await composerRedo.isDisabled(), true, "a new write transaction clears persistent Redo");
  assert.equal(await noticeUndo.isVisible(), true, "transaction feedback exposes the valid Undo action");
  assert.equal(await noticeRedo.isHidden(), true, "transaction feedback omits invalid Redo");
  assert.match(await composerUndo.getAttribute("title"), /添加属性 cssclasses/, "Undo names the exact transaction it will reverse");
  await composerUndo.click();
  assert.doesNotMatch(await frontmatter.getAttribute("data-source"), /cssclasses: wide-page/, "Undo restores the prior Frontmatter source");
  assert.equal(await frontmatter.locator(".metadata-grid > span").filter({ hasText: "cssclasses" }).count(), 0, "Undo restores the prior rendered Frontmatter");
  assert.equal(await composerRedo.isEnabled(), true, "Undo enables persistent Redo");
  assert.equal(await noticeRedo.isVisible(), true, "Undo also reveals Redo in the transient transaction feedback");
  await composerRedo.click();
  assert.match(await frontmatter.getAttribute("data-source"), /cssclasses: wide-page/, "Redo reapplies the Frontmatter source transaction");
  assert.equal(await frontmatter.locator(".metadata-grid > span").filter({ hasText: "cssclasses" }).count(), 1, "Redo reapplies the rendered Frontmatter");
  await composerUndo.focus();
  await page.keyboard.press("Control+z");
  assert.doesNotMatch(await frontmatter.getAttribute("data-source"), /cssclasses: wide-page/, "Ctrl+Z invokes document Undo outside editable fields");
  await page.keyboard.press("Control+y");
  assert.match(await frontmatter.getAttribute("data-source"), /cssclasses: wide-page/, "Ctrl+Y invokes document Redo");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({ path: new URL("./preview-composer-transaction-feedback.png", import.meta.url).pathname });
  }

  const lead = page.locator('[data-block-title="导语段落"]');
  const leadParagraph = lead.locator(":scope > p");
  const leadOriginalText = await leadParagraph.innerText();
  const directHistoryCountBefore = Number(await page.locator("#ambient-panel [data-history-count]").innerText());
  await leadParagraph.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" 直接编辑");
  await page.waitForTimeout(540);
  await transactionNotice.waitFor({ state: "visible" });
  assert.equal(Number(await page.locator("#ambient-panel [data-history-count]").innerText()), directHistoryCountBefore + 1, "direct user editing appends one durable History transaction");
  assert.match(await composerUndo.getAttribute("title"), /直接编辑 · 导语段落/, "direct contenteditable input becomes one debounced document transaction");
  await page.evaluate(() => {
    window.PeakIntelligencePanel.controller("#ambient-panel").recordDocumentTransaction({
      id: "qa-direct-edit-companion",
      title: "直接编辑 · 知识结构列表",
      target: "知识结构列表 · List block · 3 行",
      time: "现在",
      delta: "+3 −3",
      origin: "user",
      originLabel: "你直接编辑",
      groupId: "composer-session-user-burst",
      groupLabel: "连续直接编辑",
      before: "网络结构 / 树形结构",
      after: "树形结构 / 网络结构",
    });
  });
  assert.equal(Number(await page.locator("#ambient-panel [data-history-count]").innerText()), directHistoryCountBefore + 2, "History count keeps the two grouped direct edits as two durable transactions");
  await page.locator('#ambient-panel [data-mode="history"]').click();
  assert.match(await page.locator("#ambient-panel .history-heading").innerText(), /文档历史[\s\S]*直接编辑[\s\S]*AI 辅助后接受[\s\S]*系统回滚/, "History explicitly covers user, AI-assisted and rollback document operations");
  const directBatch = page.locator('#ambient-panel [data-history-group="composer-session-user-burst"]');
  assert.equal(await directBatch.isVisible(), true, "adjacent direct edits collapse into one visual batch");
  assert.match(await directBatch.locator(".history-batch-summary").innerText(), /连续直接编辑 · 2 处[\s\S]*2 笔独立事务/, "the direct-edit batch states both its visual scope and retained transaction count");
  assert.equal(await directBatch.locator(".history-batch-entries").isHidden(), true, "the grouped direct-edit rows start collapsed");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({ path: new URL("./preview-composer-history-user-actions.png", import.meta.url).pathname });
  }
  await directBatch.locator(".history-batch-summary").click();
  assert.equal(await directBatch.locator(".history-row.is-nested").count(), 2, "expanding the direct-edit batch restores two independently addressable rows");
  assert.match(await directBatch.locator(".history-row.is-nested").first().innerText(), /你直接编辑/, "expanded direct-edit transactions retain user provenance");
  await page.locator('#ambient-panel [data-mode="copilot"]').click();
  await composerUndo.click();
  assert.equal(await leadParagraph.innerText(), leadOriginalText, "the contextual Undo action restores a direct text edit");
  await composerRedo.click();
  assert.match(await leadParagraph.innerText(), /直接编辑/, "the contextual Redo action reapplies a direct text edit");
  await composerUndo.click();
  assert.equal(await leadParagraph.innerText(), leadOriginalText, "direct-edit roundtrip can return to the clean document state");
  await lead.hover();
  const leadCollapse = lead.locator('[data-action="collapse"]');
  const leadMove = lead.locator('[data-action="move"]');
  const [collapseBox, moveBox] = await Promise.all([leadCollapse.boundingBox(), leadMove.boundingBox()]);
  assert.deepEqual(
    { width: collapseBox?.width, height: collapseBox?.height },
    { width: moveBox?.width, height: moveBox?.height },
    "collapse and drag controls use the same hit target",
  );
  assert.ok((collapseBox?.width || 0) >= 30, "collapse control is large enough to identify and hit");
  assert.equal(await leadCollapse.locator("use").getAttribute("href"), "#i-chevron-up", "expanded Block uses the up-to-collapse icon");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.waitForTimeout(180);
    await screenshotBlockWithRail(page, lead, new URL("./preview-block-controls-expanded.png", import.meta.url).pathname);
  }
  await leadCollapse.click();
  assert.equal(await lead.evaluate((node) => node.classList.contains("is-collapsed")), true, "paragraph collapses to one line");
  assert.equal(await lead.locator(":scope > .block-collapse-preview").isVisible(), true, "collapsed paragraph keeps a one-line preview");
  assert.equal(await leadCollapse.locator("use").getAttribute("href"), "#i-chevron-down", "collapsed Block uses the down-to-expand icon instead of a left arrow");
  assert.equal(await leadCollapse.getAttribute("aria-label"), "向下展开当前块", "collapsed control names the expand direction");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await lead.hover();
    await page.waitForTimeout(180);
    await screenshotBlockWithRail(page, lead, new URL("./preview-block-controls-collapsed.png", import.meta.url).pathname);
  }
  await leadCollapse.click();
  assert.equal(await leadCollapse.locator("use").getAttribute("href"), "#i-chevron-up", "expanding restores the up-to-collapse icon");

  const heading = page.locator('[data-block-kind="heading-2"]').first();
  await heading.hover();
  const headingCollapse = heading.locator(':scope > .block-controls [data-action="collapse"]');
  await headingCollapse.evaluate((button) => button.click());
  assert.equal(await heading.evaluate((node) => node.classList.contains("is-section-collapsed")), true, "heading collapses its section");
  assert.ok(await page.locator("#paper > .doc-block.is-section-hidden").count() > 0, "section children are hidden");
  assert.equal(await headingCollapse.locator("use").getAttribute("href"), "#i-chevron-down", "collapsed heading uses the down-to-expand icon");
  await headingCollapse.evaluate((button) => button.click());

  await heading.hover();
  const headingActionBar = heading.locator(":scope > .block-action-bar");
  assert.equal(await headingActionBar.isVisible(), true, "hover reveals the combined Block action row");
  assert.deepEqual(
    await headingActionBar.locator(":scope .block-action-core > button").allTextContents(),
    ["在下方插入", "复制", "评论"],
    "common Block actions lead the single row",
  );
  assert.ok(await headingActionBar.locator(".aim-pills [data-ai-quick]").count() >= 2, "contextual AI suggestions are visible in the same row without another click");
  assert.equal(await headingActionBar.locator('[data-action="ai"], .ai-hint').count(), 0, "the combined row has no redundant AI suggestions opener");
  assert.equal(await headingActionBar.locator('.aim-history-toggle use').getAttribute("href"), "#i-history", "Block generation history uses the standard History icon rather than Undo");
  const [commonButtonStyle, aiButtonStyle] = await Promise.all([
    headingActionBar.locator('.block-action-core [data-action="insert"]').evaluate((button) => {
      const style = getComputedStyle(button);
      return { borderRadius: style.borderRadius, background: style.backgroundColor, minHeight: style.minHeight };
    }),
    headingActionBar.locator(".aim-pills [data-ai-quick]").first().evaluate((button) => {
      const style = getComputedStyle(button);
      return { borderRadius: style.borderRadius, background: style.backgroundColor, minHeight: style.minHeight };
    }),
  ]);
  assert.deepEqual(commonButtonStyle, aiButtonStyle, "common and AI actions share the same pill radius, resting background and height");
  const commonAction = headingActionBar.locator('.block-action-core [data-action="insert"]');
  const aiAction = headingActionBar.locator(".aim-pills [data-ai-quick]").first();
  await commonAction.hover({ force: true });
  const commonHover = await commonAction.evaluate((button) => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }));
  await aiAction.hover({ force: true });
  const aiHover = await aiAction.evaluate((button) => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }));
  assert.deepEqual(commonHover, aiHover, "common and AI actions share the same hover surface and text color");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await headingActionBar.locator(".aim").screenshot({ path: new URL("./preview-component-consistency-block-actions.png", import.meta.url).pathname });
  }

  const headingInsert = headingActionBar.locator('[data-action="insert"]');
  await headingInsert.evaluate((button) => button.click());
  await heading.locator(":scope > .insert-strip").waitFor({ state: "visible" });
  assert.equal(await heading.locator(":scope > .insert-strip").isVisible(), true, "the existing insert strip still opens from the combined row");
  const [toolbarShell, insertPanel, statusChip] = await Promise.all([
    shellGeometry(headingActionBar.locator(".aim")),
    shellGeometry(heading.locator(":scope > .insert-strip")),
    frontmatter.locator(":scope > .block-badges .issue-pill").evaluate((node) => getComputedStyle(node).borderRadius),
  ]);
  assert.equal(toolbarShell.borderRadius, insertPanel.borderRadius, "toolbar and panel shells use the same outer radius rung");
  assert.notEqual(insertPanel.borderRadius, statusChip, "status chips remain pill-shaped instead of making every panel bubbly");
  await headingInsert.evaluate((button) => button.click());
  assert.equal(await heading.locator(":scope > .insert-strip").isHidden(), true, "the existing insert action still toggles closed");

  await headingActionBar.locator('[data-action="comment"]').evaluate((button) => button.click());
  assert.equal(await heading.locator(":scope > .comment-editor").isVisible(), true, "comment opens directly from the combined row");
  await heading.locator(':scope > .comment-editor [data-action="cancel-comment"]').click();

  const headingOriginalText = await heading.locator(":scope > h2").innerText();
  await headingActionBar.locator(".aim-pills [data-ai-quick]").first().evaluate((button) => button.click());
  const directAiReview = heading.locator(":scope > .rw-review");
  await directAiReview.waitFor({ state: "visible" });
  assert.equal(await headingActionBar.isVisible(), true, "a direct AI action keeps the combined row available during review");
  assert.equal(await headingActionBar.getAttribute("hidden"), null, "a direct AI action does not hide the combined row itself");
  const rewriteReviewGeometry = await directAiReview.locator(".rw-btn").evaluateAll((buttons) => buttons.map((button) => {
    const style = getComputedStyle(button);
    return `${style.height}|${style.borderRadius}`;
  }));
  assert.equal(new Set(rewriteReviewGeometry).size, 1, "rewrite review actions share one height and radius regardless of semantic color");
  await page.waitForFunction(() => !document.querySelector('[data-block-kind="heading-2"] .rw-review')?.classList.contains("is-busy"));
  const rewriteInstruction = directAiReview.locator("[data-candidate-instruction]");
  assert.equal(await rewriteInstruction.isVisible(), true, "in-place AI rewrite exposes a targeted regeneration instruction");
  await rewriteInstruction.fill("更简洁，保留“知识库”");
  await page.keyboard.press("Control+z");
  assert.match(await frontmatter.getAttribute("data-source"), /cssclasses: wide-page/, "native undo inside an AI instruction field does not undo the Composer document");
  await rewriteInstruction.fill("更简洁，保留“知识库”");
  await rewriteInstruction.press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-block-kind="heading-2"] .rw-review')?.classList.contains("is-busy"));
  await page.waitForFunction(() => !document.querySelector('[data-block-kind="heading-2"] .rw-review')?.classList.contains("is-busy"));
  assert.match(await heading.locator(":scope > h2").innerText(), /更简洁，保留“知识库”/, "targeted rewrite instruction changes the regenerated candidate");
  assert.equal(await directAiReview.locator("[data-candidate-instruction]").inputValue(), "更简洁，保留“知识库”", "rewrite keeps the used instruction editable for the next iteration");
  assert.equal(await directAiReview.locator('[data-rw="retry"]').innerText(), "重新生成", "rewrite uses the same regenerate language as additive drafts");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await heading.screenshot({ path: new URL("./preview-ai-rewrite-instruction.png", import.meta.url).pathname });
  }
  await directAiReview.locator('[data-rw="accept"]').click();
  assert.match(await heading.locator(":scope > h2").innerText(), /更简洁，保留“知识库”/, "accepted AI rewrite becomes a document transaction");
  await page.locator('#ambient-panel [data-mode="history"]').click();
  const acceptedRewriteHistory = page.locator('#ambient-panel .history-row[data-origin="ai"]').filter({ hasText: "改短标题" });
  assert.equal(await acceptedRewriteHistory.count(), 1, "accepted inline AI rewrite is projected into document History");
  assert.match(await acceptedRewriteHistory.innerText(), /AI 辅助 · 已接受/, "inline AI rewrite keeps accepted AI authorship in History");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({ path: new URL("./preview-composer-inline-ai-history.png", import.meta.url).pathname });
  }
  await page.locator('#ambient-panel [data-mode="copilot"]').click();
  await transactionNotice.waitFor({ state: "visible" });
  await composerUndo.click();
  assert.equal(await heading.locator(":scope > h2").innerText(), headingOriginalText, "document Undo restores the original text of an accepted AI rewrite");
  await composerRedo.click();
  assert.match(await heading.locator(":scope > h2").innerText(), /更简洁，保留“知识库”/, "document Redo reapplies the accepted AI rewrite");

  await page.evaluate(() => {
    const paragraph = document.querySelector('[data-block-title="导语段落"] p');
    const text = Array.from(paragraph.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const start = text.textContent.search(/\S/);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, Math.min(start + 8, text.textContent.length));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    window.updateSelectionToolbar?.();
  });
  await page.waitForFunction(() => !document.querySelector("#selection-toolbar").hidden);
  assert.equal(await page.locator("#selection-scope").isHidden(), true, "single-block selection has no redundant scope label");
  assert.equal(await page.locator("[data-selection-format]").count(), 7, "toolbar exposes seven deterministic formatting controls");
  assert.equal(await page.locator('[data-selection-action="easy-copy"]').count(), 1, "selection toolbar exposes Easy Copy");
  assert.deepEqual(
    await page.locator("[data-selection-action]:not([data-selection-action='easy-copy'])").evaluateAll((buttons) => buttons.map((button) => button.textContent.trim())),
    ["评论", "润色", "精简", "扩写", "问 AI"],
    "comment and AI actions share the same toolbar",
  );
  const selectionActionGeometry = await page.locator("#selection-toolbar > .selection-format-group > button, #selection-toolbar > button[data-selection-action], #selection-toolbar > .selection-ai-group > button").evaluateAll((buttons) => buttons.map((button) => {
    const style = getComputedStyle(button);
    return `${style.height}|${style.borderRadius}`;
  }));
  assert.equal(new Set(selectionActionGeometry).size, 1, "selection format, comment and AI controls share one compact density and radius rung");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.locator("#selection-toolbar").screenshot({ path: new URL("./preview-component-consistency-selection-toolbar.png", import.meta.url).pathname });
  }
  await page.locator('[data-selection-format="link"]').click();
  assert.equal(await page.locator("[data-selection-link-paste]").isVisible(), true, "link control exposes Paste URL into selection");
  await page.locator("[data-selection-popover-close]").click();
  await page.locator('[data-selection-format="hiliteColor"]').click();
  assert.deepEqual(await page.locator(".selection-palette button i").allTextContents(), ["重点", "定义", "资料", "想法", "风险", "清除"], "Highlightr palette exposes named mark colors");
  await page.evaluate(() => { document.querySelector("#selection-toolbar-popover").hidden = true; });
  await page.locator('[data-selection-action="easy-copy"]').click();
  assert.equal(await page.locator("#selection-toolbar-popover [data-copy-kind]").count(), 4, "Easy Copy offers plain, Markdown, HTML and image output");
  assert.deepEqual(await page.locator("#selection-toolbar-popover [data-copy-kind]").evaluateAll((buttons) => buttons.map((button) => button.dataset.copyKind)), ["plain", "image", "markdown", "html"], "selection Easy Copy uses the approved order");
  await page.locator("#selection-toolbar-popover [data-copy-close]").click();
  await page.locator('[data-selection-format="bold"]').click();
  assert.ok(await lead.locator("p > strong").count() > 0, "bold applies inside the selected range");

  await page.evaluate(() => {
    const paragraph = document.querySelector('[data-block-title="Composer 定位段落"] p');
    const text = Array.from(paragraph.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const start = text.textContent.search(/Composer/);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + "Composer".length);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files: [], getData: () => "https://example.com/composer" } });
    paragraph.dispatchEvent(event);
  });
  assert.equal(await page.locator('[data-block-title="Composer 定位段落"] a[href="https://example.com/composer"]').count(), 1, "pasting a URL wraps the active text selection as a link");

  await page.evaluate(() => {
    window.__composerLinkOpens = [];
    window.addEventListener("peak:composer-open-link", (event) => window.__composerLinkOpens.push(event.detail));
    window.open = (...args) => {
      window.__composerExternalOpen = args;
      return null;
    };
  });
  const vaultLink = page.locator('[data-block-title="相关笔记双链段"] .vault-chip[data-vault-target="知识库.md"]');
  assert.match(await vaultLink.getAttribute("href"), /vault-note=知识库\.md/, "Vault chip is a semantic clickable link rather than decorative text");
  await vaultLink.scrollIntoViewIfNeeded();
  await vaultLink.hover();
  const linkPopover = page.locator(".link-popover");
  await linkPopover.waitFor({ state: "visible" });
  assert.match(await linkPopover.locator("[data-link-open]").innerText(), /打开 知识库\.md/, "Vault hover exposes a direct destination action before AI helpers");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({ path: new URL("./preview-composer-link-navigation.png", import.meta.url).pathname });
  }
  await linkPopover.locator("[data-link-open]").click();
  assert.deepEqual(
    await page.evaluate(() => window.__composerLinkOpens.at(-1)),
    { kind: "vault", target: "知识库.md", sourceBlock: "相关笔记双链段" },
    "clicking the Vault hover destination delegates a precise note target to the Composer host",
  );
  await vaultLink.click();
  assert.equal(await page.evaluate(() => window.__composerLinkOpens.length), 2, "clicking the inline Vault chip navigates through the same host contract");

  const externalLink = page.locator('[data-block-title="外部参考链接段"] .ext-chip').first();
  assert.equal(await externalLink.getAttribute("href"), "https://infranodus.com", "external source keeps its real URL");
  assert.equal(await externalLink.getAttribute("target"), "_blank", "external source opens without replacing the Composer document");
  await externalLink.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await page.mouse.move(10, 100);
  await externalLink.hover();
  await linkPopover.waitFor({ state: "visible" });
  assert.match(await linkPopover.locator("[data-link-open]").innerText(), /访问 https:\/\/infranodus\.com\//, "external hover exposes the complete destination");
  await linkPopover.locator("[data-link-open]").click();
  assert.deepEqual(
    await page.evaluate(() => window.__composerExternalOpen),
    ["https://infranodus.com/", "_blank", "noopener,noreferrer"],
    "clicking the external hover destination opens the real URL",
  );

  await assertImmediateCopy(page, lead, "plain", "Block text copy", { autoClose: true });

  const listBlock = page.locator('#paper > [data-block-title="知识结构列表"]');
  await assertImmediateCopy(page, listBlock, "image", "list image output");
  const originalListText = await listBlock.locator(":scope > ul").innerText();
  await listBlock.hover();
  await listBlock.locator(":scope > .block-action-bar [data-ai-quick='转成表格']").click();
  const listToTableReview = listBlock.locator(":scope > .list-to-table-review");
  await listToTableReview.waitFor({ state: "visible" });
  assert.equal(await listBlock.locator(":scope > ul").count(), 1, "the real source list remains visible exactly once during table conversion review");
  assert.equal(await listBlock.locator(":scope > ul").innerText(), originalListText, "opening the table candidate does not alter the real list");
  assert.equal(await listBlock.locator(":scope > ul").evaluate((node) => node.classList.contains("is-review-original")), false, "the real list remains fully legible instead of being treated as a duplicate comparison side");
  assert.equal(await listToTableReview.locator("ul, ol, .list-compare-original, .list-compare-arrow").count(), 0, "the review never clones the original list or renders a redundant before-side");
  assert.equal(await listToTableReview.locator(":scope > .table-transform-candidate").count(), 1, "the review contains one candidate surface");
  assert.equal(await listToTableReview.locator(":scope > .table-transform-candidate > .composer-table").count(), 1, "the only transformed object in review is the proposed table");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await listBlock.screenshot({ path: `${process.cwd()}/output/playwright/preview-list-to-table-candidate-only.png` });
  }
  await listToTableReview.locator('[data-object-review="restore"]').click();
  assert.equal(await listToTableReview.count(), 0, "keeping the original list dismisses the candidate review");
  assert.equal(await listBlock.locator(":scope > ul").count(), 1, "dismissing the candidate leaves one real list");
  assert.equal(await listBlock.locator(":scope > ul").innerText(), originalListText, "dismissing the candidate preserves the original list content");

  await listBlock.hover();
  await listBlock.locator(":scope > .block-action-bar [data-ai-quick='重排列表']").click();
  const listReorderReview = listBlock.locator(":scope > .list-review");
  await listReorderReview.waitFor({ state: "visible" });
  assert.equal(await listBlock.locator(":scope > ul").count(), 1, "list reordering keeps the real source list visible exactly once");
  assert.equal(await listBlock.locator(":scope > ul").innerText(), originalListText, "list reordering does not mutate the source before acceptance");
  assert.equal(await listBlock.locator(":scope > ul").evaluate((node) => node.classList.contains("is-review-original")), false, "list reordering never dims the authoritative source");
  assert.equal(await listReorderReview.locator(".list-compare-original, .list-compare-arrow").count(), 0, "list reordering renders no duplicated before-side");
  assert.equal(await listReorderReview.locator(":scope > .list-transform-candidate > ul").count(), 1, "list reordering renders one proposed ordering");
  assert.notEqual(await listReorderReview.locator(":scope > .list-transform-candidate > ul").innerText(), originalListText, "the proposed ordering is visibly distinct from the source");
  await listReorderReview.locator('[data-object-review="restore"]').click();
  assert.equal(await listBlock.locator(":scope > ul").innerText(), originalListText, "dismissing list reordering preserves the single source list");

  const tableBlock = page.locator('#paper > [data-block-title="PKM pipeline table"]');
  await assertImmediateCopy(page, tableBlock, "image", "table image output");
  assert.equal(
    await tableBlock.locator(".table-toolbar button").evaluateAll((buttons) => new Set(buttons.map((button) => Math.round(button.offsetTop))).size),
    1,
    "the flattened table toolbar stays on one line and scrolls internally instead of wrapping",
  );

  const tableRows = tableBlock.locator("#composer-table tbody tr");
  await dragTableCells(page, tableRows.nth(0).locator("td").nth(0), tableRows.nth(0).locator("td").nth(3));
  assert.equal(await tableBlock.locator(".is-range-cell").count(), 4, "horizontal drag selects complete cells instead of native text fragments");
  assert.equal(await page.locator("#selection-scope").textContent(), "1 行 × 4 列 · 4 个单元格", "horizontal selection reports its exact cell geometry");

  await dragTableCells(page, tableBlock.locator("#composer-table thead th").nth(0), tableRows.nth(2).locator("td").nth(2));
  assert.equal(await tableBlock.locator(".is-range-cell").count(), 12, "rectangular drag can cross the header/body boundary");
  assert.equal(await page.locator("#selection-scope").textContent(), "4 行 × 3 列 · 12 个单元格", "cross-region selection remains a rectangular cell range");

  await dragTableCells(page, tableRows.nth(0).locator("td").nth(1), tableRows.nth(3).locator("td").nth(1));
  assert.equal(await tableBlock.locator(".is-range-cell").count(), 4, "vertical drag selects one column across multiple rows");
  assert.equal(await page.locator("#selection-scope").textContent(), "4 行 × 1 列 · 4 个单元格", "vertical selection reports rows and columns separately");
  assert.equal(await page.evaluate(() => window.getSelection()?.toString() || ""), "", "cell-range dragging suppresses the browser's fragmented native text highlight");
  const verticalRangeStyle = await tableBlock.locator(".is-range-cell").evaluateAll((cells) => cells.map((cell) => ({
    borderRight: getComputedStyle(cell).borderRightWidth,
    topEdge: getComputedStyle(cell, "::after").borderTopColor,
    bottomEdge: getComputedStyle(cell, "::after").borderBottomColor,
  })));
  assert.ok(verticalRangeStyle.every((cell) => cell.borderRight === "1px"), "selection tint preserves the table's internal grid boundaries");
  assert.notEqual(verticalRangeStyle[0].topEdge, "rgba(0, 0, 0, 0)", "the first selected cell draws the range's top perimeter");
  assert.notEqual(verticalRangeStyle.at(-1).bottomEdge, "rgba(0, 0, 0, 0)", "the last selected cell draws the range's bottom perimeter");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await tableBlock.screenshot({ path: `${process.cwd()}/output/playwright/preview-table-vertical-cell-range.png` });
  }
  await page.locator(".top-strip").click({ position: { x: 24, y: 20 } });
  assert.equal(await tableBlock.locator(".is-range-cell").count(), 0, "clicking outside dismisses the table-cell range");

  // Complementary half of the gesture contract: a drag that BEGINS on a glyph
  // must fall through to the browser's native text selection, so the words
  // inside a cell stay selectable — object cell-range is the padding/edge
  // gesture, never the way to disable in-cell text selection.
  const glyphCell = tableRows.nth(0).locator("td").nth(1);
  const glyphRect = await glyphCell.evaluate((cell) => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent.trim()) node = walker.nextNode();
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = Array.from(range.getClientRects()).find((candidate) => candidate.width > 4);
    return { left: rect.left, right: rect.right, midY: (rect.top + rect.bottom) / 2 };
  });
  await page.mouse.move(glyphRect.left + 1, glyphRect.midY);
  await page.mouse.down();
  await page.mouse.move(glyphRect.right - 1, glyphRect.midY, { steps: 6 });
  await page.mouse.up();
  assert.equal(await tableBlock.locator(".is-range-cell").count(), 0, "dragging across a cell's glyphs starts native text selection, not an object cell-range");
  assert.notEqual(await page.evaluate(() => window.getSelection()?.toString().trim() || ""), "", "cell text stays natively selectable when the drag begins on a glyph");
  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  await tableBlock.locator('[data-action="align-table"]').evaluate((button) => button.click());
  assert.equal(await tableBlock.locator("tbody tr").first().locator("td").nth(1).evaluate((cell) => cell.style.textAlign), "center", "align works immediately on a visible default column when no cell was preselected");
  assert.match(await tableBlock.getAttribute("data-source"), /\| --- \| :---: \|/, "column alignment persists through Markdown separator syntax");

  await tableBlock.locator('[data-action="sort-table"]').evaluate((button) => button.click());
  assert.equal(await tableBlock.locator("thead th").nth(1).getAttribute("aria-sort"), "ascending", "sort exposes its real ascending state on the active header");
  assert.equal(await tableBlock.locator("thead th").nth(1).getAttribute("data-sort-indicator"), "↑", "sort direction is visible instead of toast-only");

  await tableBlock.locator('[data-action="formula-table"]').evaluate((button) => button.click());
  const formulaEditor = tableBlock.locator("[data-table-formula-editor]");
  assert.equal(await formulaEditor.isVisible(), true, "formula opens a real column-scoped editor");
  assert.equal(await formulaEditor.locator("[data-table-formula-preview]").textContent(), "4", "formula preview is calculated from the four visible body values");
  await formulaEditor.locator('[data-action="apply-table-formula"]').evaluate((button) => button.click());
  assert.equal(await tableBlock.locator(".table-formula-row .is-formula-cell").textContent(), "4", "applying a formula writes a visible summary result into the table");
  assert.match(await tableBlock.getAttribute("data-source"), /<!-- TBLFM: @>\$2=COUNTA\(B2:B5\) -->/, "formula persists as an inspectable TBLFM source annotation");

  await tableBlock.locator('[data-action="merge-cells"]').evaluate((button) => button.click());
  assert.equal(await tableBlock.locator("[data-table-merge-prompt]").isVisible(), true, "merge exposes an explicit rectangular-selection mode instead of silently doing nothing");
  await tableBlock.locator('[data-action="cancel-merge-mode"]').evaluate((button) => button.click());
  assert.equal(await tableBlock.locator("[data-table-merge-prompt]").count(), 0, "merge selection mode can be cancelled without mutating the table");

  const mergeCells = tableBlock.locator("tbody tr").first().locator("td");
  await mergeCells.nth(1).click();
  await tableBlock.locator('[data-action="merge-cells"]').evaluate((button) => button.click());
  assert.equal(await tableBlock.locator(".is-range-cell").count(), 1, "merge mode uses the current cell as its visible first corner");
  await mergeCells.nth(2).click();
  assert.equal(await tableBlock.getAttribute("data-table-source-mode"), "html", "merged cells upgrade the block source mode to HTML");
  assert.match(await tableBlock.getAttribute("data-source"), /<table>[\s\S]*colspan="2"/, "merged-cell semantics persist as a raw HTML table in Markdown");

  await tableBlock.locator('[data-action="chart-table"]').evaluate((button) => button.click());
  const chartDraft = page.locator("#paper > .chart-draft-block");
  assert.equal(await chartDraft.isVisible(), true, "table creates a separate review-only Chart Block");
  const chartReviewGeometry = await chartDraft.locator(".chart-draft-actions button").evaluateAll((buttons) => buttons.map((button) => {
    const style = getComputedStyle(button);
    return `${style.height}|${style.borderRadius}`;
  }));
  assert.equal(new Set(chartReviewGeometry).size, 1, "chart review actions keep the shared review geometry across primary and secondary intent");
  assert.equal(await chartDraft.locator('[data-chart-type="bar"]').getAttribute("aria-selected"), "true", "Chart Block exposes the initial active tab");
  await chartDraft.locator('[data-chart-type="line"]').click();
  assert.equal(await chartDraft.locator('svg[role="img"]').getAttribute("aria-label"), "表格条目数量折线图", "Chart Block switches to a real line renderer");
  assert.equal(await chartDraft.locator('[data-chart-type="line"]').getAttribute("aria-selected"), "true", "line click updates the active tab state");
  await chartDraft.locator('[data-chart-type="pie"]').click();
  assert.equal(await chartDraft.locator('[data-chart-type][aria-selected="true"]').count(), 1, "only one Chart tab is active after a real pointer click");
  assert.match(await chartDraft.getAttribute("data-source"), /```chart[\s\S]*type: pie/, "Chart Block exposes inspectable fenced source");
  await chartDraft.locator('[data-chart-draft="accept"]').evaluate((button) => button.click());
  const acceptedChart = page.locator("#paper > .chart-block");
  assert.equal(await acceptedChart.locator("[data-chart-draft]").count(), 0, "accepted chart removes draft controls");
  assert.match(await acceptedChart.getAttribute("data-source"), /```chart[\s\S]*type: pie/, "accepted chart keeps its fenced Markdown contract");

  const formulaBlock = page.locator('#paper > [data-block-title="图算法公式组"]');
  assert.ok(await formulaBlock.locator(":scope > .math-stack .katex").count() >= 3, "formula source is the rendered KaTeX group rather than raw formula text");
  await assertImmediateCopy(page, formulaBlock, "image", "formula-group image output");
  assert.equal(await formulaBlock.locator(":scope .micro-block > .micro-action-bar").count(), 3, "every formula micro-block has one combined action row");
  assert.equal(await formulaBlock.locator(":scope .micro-tail-actions, :scope .micro-ai-hint").count(), 0, "the retired common row and AI · N opener are absent");

  const textRank = formulaBlock.locator(':scope > .math-stack > .micro-block[data-micro-title="TextRank"]');
  await textRank.hover();
  const textRankActionBar = textRank.locator(":scope > .micro-action-bar");
  assert.equal(await textRankActionBar.isVisible(), true, "hover reveals one formula action row");
  assert.deepEqual(
    await textRankActionBar.locator(".block-action-core > button").allTextContents(),
    ["在下方插入", "复制", "评论"],
    "formula deterministic actions lead the combined row",
  );
  assert.deepEqual(
    await textRankActionBar.locator(".aim-pills [data-ai-quick]").allTextContents(),
    ["解释公式", "拆分公式", "变量表"],
    "formula AI actions are directly visible in the same row",
  );
  assert.equal(await textRankActionBar.locator('[data-action="ai"], .ai-hint').count(), 0, "formula row has no second-level AI opener");
  assert.equal(await textRankActionBar.locator('.aim-history-toggle use').getAttribute("href"), "#i-history", "formula generation history reuses the standard History icon");
  const [microCommonStyle, microAiStyle] = await Promise.all([
    textRankActionBar.locator('.block-action-core [data-action="insert"]').evaluate((button) => {
      const style = getComputedStyle(button);
      return { borderRadius: style.borderRadius, background: style.backgroundColor, minHeight: style.minHeight };
    }),
    textRankActionBar.locator('.aim-pills [data-ai-quick="解释公式"]').evaluate((button) => {
      const style = getComputedStyle(button);
      return { borderRadius: style.borderRadius, background: style.backgroundColor, minHeight: style.minHeight };
    }),
  ]);
  assert.deepEqual(microCommonStyle, microAiStyle, "formula common and AI actions use one capsule geometry");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await textRankActionBar.locator(".aim").screenshot({ path: new URL("./preview-component-consistency-formula-actions.png", import.meta.url).pathname });
  }

  await textRankActionBar.locator("[data-ai-quick='解释公式']").click();
  const textRankExplainer = textRank.locator(':scope > [data-formula-detail="explain"]');
  await textRankExplainer.waitFor({ state: "visible" });
  assert.match(await textRankExplainer.innerText(), /TextRank · 解释公式/, "direct formula AI action stays scoped to the selected micro-block");
  assert.equal(await textRankExplainer.locator("[data-candidate-instruction]").isVisible(), true, "formula explanation accepts a targeted AI follow-up");

  await textRankActionBar.locator("[data-ai-quick='拆分公式']").click();
  const textRankSplit = textRank.locator(':scope > [data-formula-detail="split"]');
  await textRankSplit.waitFor({ state: "visible" });
  assert.equal(await textRankExplainer.isVisible(), true, "opening a split view keeps the same formula's explanation open");

  await textRankActionBar.locator("[data-ai-quick='变量表']").click();
  const textRankVariableTable = textRank.locator(':scope > [data-formula-detail="variables"]');
  await textRankVariableTable.waitFor({ state: "visible" });
  assert.equal(await textRank.locator(":scope > [data-formula-detail]").count(), 3, "one formula can keep explanation, split and variable details open together");
  assert.equal(await textRank.locator(":scope > [data-formula-detail] [data-candidate-instruction]").count(), 3, "every formula detail view exposes its own targeted AI instruction");

  await textRankExplainer.locator("[data-candidate-instruction]").fill("改成适合初学者的解释");
  await textRankExplainer.locator("[data-candidate-instruction]").press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-micro-title="TextRank"] [data-formula-detail="explain"] [data-formula-version]')?.textContent.trim() === "2 / 2");
  assert.equal(await textRankSplit.isVisible(), true, "regenerating an explanation does not close the same formula's split view");
  assert.equal(await textRankVariableTable.isVisible(), true, "regenerating an explanation does not close the same formula's variable table");
  assert.match(await textRankExplainer.innerText(), /改成适合初学者的解释/, "formula explanation displays the instruction applied to its new version");
  assert.equal(await textRankExplainer.locator(".formula-detail-version-nav").isVisible(), true, "formula detail reveals version navigation after targeted regeneration");

  await textRankSplit.locator("[data-candidate-instruction]").fill("把归一化步骤拆得更细");
  await textRankSplit.locator('[data-formula-review="regenerate"]').click();
  await page.waitForFunction(() => document.querySelector('[data-micro-title="TextRank"] [data-formula-detail="split"] [data-formula-version]')?.textContent.trim() === "2 / 2");
  assert.match(await textRankSplit.innerText(), /把归一化步骤拆得更细/, "formula split supports its own independent follow-up instruction");

  await textRankVariableTable.locator("[data-candidate-instruction]").fill("补充每个变量的典型取值");
  await textRankVariableTable.locator("[data-candidate-instruction]").press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-micro-title="TextRank"] [data-formula-detail="variables"] [data-formula-version]')?.textContent.trim() === "2 / 2");
  assert.match(await textRankVariableTable.innerText(), /补充每个变量的典型取值/, "variable table supports independent AI refinement and versioning");

  const pageRank = formulaBlock.locator(':scope > .math-stack > .micro-block[data-micro-title="PageRank"]');
  await pageRank.hover();
  await pageRank.locator(":scope > .micro-action-bar [data-ai-quick='变量表']").click();
  const pageRankVariableTable = pageRank.locator(':scope > [data-formula-detail="variables"]');
  await pageRankVariableTable.waitFor({ state: "visible" });
  const formulaVariableText = await pageRankVariableTable.innerText();
  assert.match(formulaVariableText, /PageRank · 变量表/, "variable table is titled for the formula that triggered it");
  assert.match(formulaVariableText, /当前公式 · 4 个变量/, "variable table states its single-formula scope");
  assert.doesNotMatch(formulaVariableText, /TextRank|Louvain/, "unrelated formulas never leak into the current formula result");
  assert.equal(await formulaBlock.locator(":scope > .formula-variable-table").count(), 0, "variable table is not projected to the parent formula group");
  assert.equal(await pageRankVariableTable.locator(':scope .formula-variable-group[data-formula-name="PageRank"]').count(), 1, "only the selected PageRank formula is rendered");
  assert.equal(await pageRankVariableTable.locator(".formula-variable-row").count(), 4, "only PageRank's variables are listed");
  assert.equal(await pageRankVariableTable.locator("[data-formula-scope], [data-formula-choice], [data-formula-shared]").count(), 0, "single-formula action exposes no group scope switcher or shared-variable browser");
  assert.equal(await textRank.locator(":scope > [data-formula-detail]").count(), 3, "opening a different formula's detail keeps all TextRank detail views open");

  await pageRank.locator(":scope > .micro-action-bar [data-ai-quick='解释公式']").click();
  const pageRankExplainer = pageRank.locator(':scope > [data-formula-detail="explain"]');
  await pageRankExplainer.waitFor({ state: "visible" });
  assert.equal(await pageRankVariableTable.isVisible(), true, "PageRank explanation and PageRank variable table can coexist");
  assert.equal(await textRankExplainer.isVisible(), true, "PageRank explanation does not close TextRank explanation");
  assert.equal(await formulaBlock.locator(":scope > .math-stack > .micro-block > [data-formula-detail]").count(), 5, "detail views coexist across both formula and detail type");
  await pageRank.locator(":scope > .micro-action-bar [data-ai-quick='解释公式']").click();
  assert.equal(await pageRank.locator(':scope > [data-formula-detail="explain"]').count(), 1, "reopening the same formula detail focuses it instead of creating a duplicate");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await pageRank.screenshot({ path: `${process.cwd()}/output/playwright/preview-formula-variable-table-current.png` });
  }

  const louvain = formulaBlock.locator(':scope > .math-stack > .micro-block[data-micro-title="Louvain ΔQ"]');
  await louvain.hover();
  await louvain.locator(":scope > .micro-action-bar [data-ai-quick='变量表']").click();
  const louvainVariableTable = louvain.locator(':scope > [data-formula-detail="variables"]');
  await louvainVariableTable.waitFor({ state: "visible" });
  assert.equal(await pageRankVariableTable.isVisible(), true, "opening Louvain variables keeps PageRank open");
  assert.equal(await textRankVariableTable.isVisible(), true, "opening Louvain variables keeps TextRank open");
  assert.match(await louvainVariableTable.innerText(), /Louvain ΔQ · 变量表/, "Louvain opens its own variable table");
  assert.doesNotMatch(await louvainVariableTable.innerText(), /PageRank|TextRank/, "Louvain's table contains no unrelated formula data");
  assert.equal(await formulaBlock.locator(":scope > .math-stack > .micro-block > .formula-variable-table").count(), 3, "all three formula cards may keep independent variable tables open simultaneously");
  await pageRank.hover();
  await pageRank.locator(":scope > .micro-action-bar [data-ai-quick='变量表']").click();
  assert.equal(await formulaBlock.locator(":scope > .math-stack > .micro-block > .formula-variable-table").count(), 3, "reopening the same formula focuses its existing table instead of creating a duplicate");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 1614, height: 2400 });
    await pageRank.evaluate((node) => node.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${process.cwd()}/output/playwright/preview-formula-variable-tables-independent.png` });
    await page.setViewportSize(originalViewport);
  }
  while (await formulaBlock.locator(":scope > .math-stack > .micro-block > [data-formula-detail]").count()) {
    await formulaBlock.locator(':scope > .math-stack > .micro-block > [data-formula-detail] [data-formula-review="close"]').first().click();
  }

  await textRank.hover();
  await textRankActionBar.locator("[data-action='easy-copy']").click();
  const textRankCopy = textRank.locator(":scope > .block-copy-menu");
  await textRank.locator(":scope > .block-copy-menu [data-copy-kind='image']").click();
  assert.ok(await textRank.locator(":scope > .math-render .katex").count() >= 1, "micro formula source is rendered KaTeX rather than raw formula text");
  await page.waitForFunction(() => document.querySelector('[data-micro-title="TextRank"] > .block-copy-menu [data-copy-kind="image"]')?.dataset.copyState === "success");
  assert.match(await textRankCopy.innerText(), /复制成功/, "micro formula image copies immediately without a second preview");
  assert.equal(await textRankCopy.locator("[data-copy-image-confirm], canvas, .easy-copy-snapshot-root").count(), 0, "micro formula copy opens no detached preview or confirmation");
  await textRankCopy.locator("[data-copy-close]").click();

  const imageBlock = page.locator('[data-block-title="路线图"]');
  const originalImageSource = await imageBlock.getAttribute("data-source");
  await imageBlock.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(700);
  await imageBlock.hover();
  const nativeBlock = page.locator("#paper > .native-file-block").first();
  const [imageToolbarShell, tableToolbarShell, nativeToolbarShell] = await Promise.all([
    shellGeometry(imageBlock.locator(".image-toolbar")),
    shellGeometry(tableBlock.locator(".table-toolbar")),
    shellGeometry(nativeBlock.locator(".native-actions")),
  ]);
  assert.deepEqual(imageToolbarShell, tableToolbarShell, "image and table toolbars share one shell contract");
  assert.deepEqual(imageToolbarShell, nativeToolbarShell, "native-object toolbar uses the same shell contract as image and table tools");
  const [imageToolAction, tableToolAction, nativeToolAction] = await Promise.all([
    actionGeometry(imageBlock.locator(".image-toolbar > button").first()),
    actionGeometry(tableBlock.locator(".table-toolbar > button").first()),
    actionGeometry(nativeBlock.locator(".native-actions > button").first()),
  ]);
  assert.deepEqual(imageToolAction, tableToolAction, "image and table commands share one compact control geometry");
  assert.deepEqual(imageToolAction, nativeToolAction, "native commands share the same compact control geometry");
  const mermaidBlock = page.locator('#paper > [data-block-kind="mermaid"]');
  assert.deepEqual(
    await mermaidBlock.locator(".mermaid-head .native-inline-tools > button").allTextContents(),
    ["预览", "源码"],
    "Mermaid header keeps only the two view-mode controls",
  );
  assert.equal(await mermaidBlock.locator(".mermaid-head").getByText(/复制源码|复制图像|AI 增量编辑/).count(), 0, "Mermaid header does not duplicate Easy Copy or AI actions");
  await mermaidBlock.hover();
  assert.equal(await mermaidBlock.locator(":scope > .block-action-bar [data-action='easy-copy']").isVisible(), true, "Mermaid uses the shared Block copy action");
  assert.ok(await mermaidBlock.locator(":scope > .block-action-bar [data-ai-quick]").count() >= 2, "Mermaid AI actions stay in the flattened contextual row");
  const mermaidMarkdown = await assertImmediateCopy(page, mermaidBlock, "markdown", "Mermaid source copy");
  assert.match(mermaidMarkdown, /^```mermaid\n/, "Mermaid Markdown copy uses the native source instead of component chrome");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await imageBlock.locator(".real-image-frame").screenshot({ path: new URL("./preview-component-consistency-object-toolbar.png", import.meta.url).pathname });
  }
  await imageBlock.locator('.image-toolbar [data-action="edit-image"]').evaluate((button) => button.click());
  const imageConverter = imageBlock.locator(":scope > .image-tool-panel");
  assert.equal(await imageConverter.isVisible(), true, "Image Converter opens inside the image Block");
  assert.equal(await imageConverter.locator("[data-crop-handle]").count(), 8, "rectangle crop exposes eight direct resize handles");
  const cropBox = imageConverter.locator("[data-image-crop-box]");
  const cropBefore = await cropBox.getAttribute("style");
  const eastHandle = imageConverter.locator('[data-crop-handle="e"]');
  await eastHandle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(220);
  const eastHandleBounds = await eastHandle.boundingBox();
  await page.mouse.move(eastHandleBounds.x + eastHandleBounds.width / 2, eastHandleBounds.y + eastHandleBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(eastHandleBounds.x + eastHandleBounds.width / 2 - 24, eastHandleBounds.y + eastHandleBounds.height / 2, { steps: 4 });
  await page.mouse.up();
  assert.notEqual(await cropBox.getAttribute("style"), cropBefore, "rectangle crop can be resized directly from its handles");
  await imageConverter.locator('[data-image-crop-mode="free"]').click();
  assert.equal(await imageConverter.locator('[data-image-crop-mode="free"]').getAttribute("aria-pressed"), "true", "free crop mode is an explicit alternative");
  const cropSurface = imageConverter.locator("[data-image-crop-surface]");
  const cropSurfaceBounds = await cropSurface.boundingBox();
  await page.mouse.move(cropSurfaceBounds.x + 80, cropSurfaceBounds.y + 60);
  await page.mouse.down();
  await page.mouse.move(cropSurfaceBounds.x + 210, cropSurfaceBounds.y + 70, { steps: 3 });
  await page.mouse.move(cropSurfaceBounds.x + 190, cropSurfaceBounds.y + 180, { steps: 3 });
  await page.mouse.move(cropSurfaceBounds.x + 90, cropSurfaceBounds.y + 170, { steps: 3 });
  await page.mouse.up();
  assert.match(await imageConverter.locator("[data-crop-lasso-path]").getAttribute("d"), /Z$/, "free crop records a closed lasso path");
  await imageConverter.locator('[data-image-crop-mode="rectangle"]').click();
  await imageConverter.locator('[data-image-tool="rotate-right"]').click();
  await imageConverter.locator("[data-image-straighten]").evaluate((input) => {
    input.value = "4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.match(await imageConverter.locator("[data-image-converter-preview]").getAttribute("style"), /rotate\(94deg\)/, "rotation uses a 90 degree action plus small straighten adjustment");
  await imageConverter.locator('[data-image-format="png"]').click();
  await imageConverter.locator('[data-image-panel-action="review-convert"]').click();
  assert.equal(await imageConverter.locator("[data-image-conversion-candidate]").isVisible(), true, "conversion review renders the adjusted image candidate instead of a text-only receipt");
  assert.match(await imageConverter.locator("[data-image-conversion-candidate]").getAttribute("style"), /clip-path/, "crop state is carried into the candidate preview");
  assert.equal(await imageBlock.getAttribute("data-source"), originalImageSource, "conversion review does not rewrite the Markdown reference");
  await imageConverter.locator('[data-image-panel-action="restore-convert"]').click();
  assert.match(await imageConverter.locator("[data-image-converter-preview]").getAttribute("style"), /rotate\(94deg\)/, "returning to adjustments preserves the pending edit state");
  await imageConverter.locator('[data-image-panel-action="review-convert"]').click();
  await imageConverter.locator('[data-image-panel-action="accept-convert"]').click();
  assert.match(await imageBlock.getAttribute("data-source"), /\.png/, "accepted conversion swaps the controlled image reference");
  assert.match(await imageBlock.getAttribute("data-image-edit-state"), /"quarterTurn":90/, "accepted conversion keeps the crop and rotation transaction state");

  await imageBlock.hover();
  await imageBlock.locator('.image-toolbar [data-action="rename-image"]').evaluate((button) => button.click());
  assert.equal(await imageConverter.locator("[data-image-rename-version]").innerText(), "1 / 1", "semantic rename begins with one real candidate");
  await imageConverter.locator(".image-rename-instruction [data-candidate-instruction]").fill("auckland route summary");
  await imageConverter.locator('[data-image-panel-action="regenerate-rename"]').click();
  assert.equal(await imageConverter.locator("[data-image-rename-version]").innerText(), "2 / 2", "rename can generate another targeted candidate");
  await imageConverter.locator('[data-image-panel-action="rename-history"]').click();
  assert.equal(await imageConverter.locator("[data-image-rename-history-index]").count(), 2, "rename history retains every candidate");
  await imageConverter.locator('[data-image-panel-action="rename-history"]').click();
  await imageConverter.locator('[data-image-panel-action="rename-previous"]').click();
  assert.equal(await imageConverter.locator("[data-image-rename-version]").innerText(), "1 / 2", "rename can return to an earlier candidate");
  await imageConverter.locator('[data-image-panel-action="rename-next"]').click();
  await imageBlock.locator("[data-image-rename-input]").fill("auckland-route-summary.png");
  await imageBlock.locator('[data-image-panel-action="apply-rename"]').click();
  assert.match(await imageBlock.getAttribute("data-source"), /auckland-route-summary\.png/, "rename updates the image reference as one reviewed transaction");
  assert.equal(await imageBlock.locator('.image-toolbar [data-action="paste-image"]').count(), 0, "image paste is not exposed as an action on an existing image");
  assert.equal(await page.locator(".image-paste-hint").count(), 0, "image toolbar contains no misleading paste hint");

  await imageBlock.hover();
  await imageBlock.locator('.image-toolbar [data-action="ai-caption"]').evaluate((button) => button.click());
  const imageCaption = imageBlock.locator(":scope > .real-image-frame > figcaption");
  const captionReview = imageBlock.locator(":scope > .real-image-frame > .image-caption-review");
  await captionReview.waitFor({ state: "visible" });
  assert.equal(await page.locator('[data-block-title="路线图"] + .generated-draft').count(), 0, "image caption generation never inserts a new paragraph Block");
  assert.equal(await imageCaption.evaluate((node) => node.nextElementSibling?.classList.contains("image-caption-review")), true, "caption review stays directly beneath the existing caption inside the same figure");
  await imageCaption.locator(".ai-caret").waitFor({ state: "visible" });
  assert.equal(await imageCaption.evaluate((node) => node.classList.contains("is-diffing")), true, "AI caption streams in the existing figcaption line");
  assert.equal(await imageCaption.locator(".ai-caret").isVisible(), true, "in-place caption generation exposes a live streaming caret");
  await page.waitForFunction(() => !document.querySelector('[data-block-title="路线图"] .image-caption-review')?.classList.contains("is-busy"));
  assert.ok(await imageCaption.locator("del").count() > 0, "existing caption text is shown as the replaced side of the inline diff");
  assert.ok(await imageCaption.locator("ins").count() > 0, "new caption text is shown in the same caption line");
  assert.deepEqual(
    await captionReview.locator('.rw-btns > [data-rw="accept"], .rw-btns > [data-rw="restore"], .rw-btns > [data-rw="retry"]').allTextContents(),
    ["接受", "还原", "重新生成"],
    "in-place caption review exposes accept, restore, and targeted regeneration",
  );
  assert.equal(await captionReview.locator(".rw-variant-nav").isHidden(), true, "single-version caption review omits inactive previous/next controls");
  const captionReviewLayout = await captionReview.evaluate((node) => {
    const reviewBox = node.getBoundingClientRect();
    const instructionBox = node.querySelector(".candidate-instruction").getBoundingClientRect();
    const actionBox = node.querySelector(".rw-btns").getBoundingClientRect();
    const buttons = Array.from(node.querySelectorAll('.rw-btns > [data-rw="accept"], .rw-btns > [data-rw="restore"], .rw-btns > [data-rw="retry"]'));
    return {
      height: reviewBox.height,
      centers: [instructionBox, actionBox].map((box) => Math.round(box.top + box.height / 2)),
      buttons: buttons.map((button) => ({
        height: button.getBoundingClientRect().height,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
        whiteSpace: getComputedStyle(button).whiteSpace,
      })),
    };
  });
  assert.ok(captionReviewLayout.height <= 50, "completed caption review stays one compact aligned row");
  assert.equal(new Set(captionReviewLayout.centers).size, 1, "caption instruction and review actions share one vertical center");
  assert.equal(new Set(captionReviewLayout.buttons.map(({ height }) => height)).size, 1, "caption review actions share one control height");
  assert.ok(captionReviewLayout.buttons.every(({ clientWidth, scrollWidth, whiteSpace }) => whiteSpace === "nowrap" && scrollWidth <= clientWidth + 1), "caption review action labels never wrap or clip");
  const captionInstruction = captionReview.locator("[data-candidate-instruction]");
  await captionInstruction.fill("更简洁，保留全部地名");
  await captionInstruction.press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-block-title="路线图"] .image-caption-review')?.classList.contains("is-busy"));
  await imageCaption.locator(".ai-caret").waitFor({ state: "visible" });
  assert.equal(await imageCaption.locator(".ai-caret").isVisible(), true, "targeted caption regeneration streams in the same figcaption");
  await page.waitForFunction(() => !document.querySelector('[data-block-title="路线图"] .image-caption-review')?.classList.contains("is-busy"));
  assert.equal(await captionReview.locator("[data-rw-version]").innerText(), "2 / 2", "caption regeneration keeps the new version beside the old one");
  assert.equal(await captionReview.locator(".rw-variant-nav").isVisible(), true, "caption version navigation appears only after another candidate exists");
  await captionReview.locator('[data-rw="history"]').click();
  assert.equal(await captionReview.locator("[data-rw-version-index]").count(), 2, "caption history exposes both generated versions");
  assert.match(await captionReview.locator(".rw-version-history-head").innerText(), /版本历史[\s\S]*2 个候选/, "caption history has a clear compact heading");
  assert.equal(await captionReview.locator(".rw-version-history-list > button.is-active").count(), 1, "caption history marks exactly one active candidate");
  const captionHistoryRows = await captionReview.locator(".rw-version-history-list > button").evaluateAll((buttons) => buttons.map((button) => ({
    badge: button.querySelector(".rw-version-badge")?.textContent.trim(),
    title: button.querySelector(".rw-version-copy > strong")?.textContent.trim(),
    top: Math.round(button.getBoundingClientRect().top),
    width: Math.round(button.getBoundingClientRect().width),
  })));
  assert.deepEqual(
    captionHistoryRows.map(({ badge, title }) => ({ badge, title })),
    [
      { badge: "V1", title: "初始候选" },
      { badge: "V2", title: "按要求调整" },
    ],
    "caption history uses a clear version-and-purpose hierarchy",
  );
  assert.ok(captionHistoryRows[1].top > captionHistoryRows[0].top, "caption history versions are stacked as readable rows instead of gray chips");
  assert.equal(new Set(captionHistoryRows.map(({ width }) => width)).size, 1, "caption history rows share one full-width geometry");
  await captionReview.locator('[data-rw="history"]').click();
  await captionReview.locator('[data-rw="previous"]').click();
  assert.equal(await captionReview.locator("[data-rw-version]").innerText(), "1 / 2", "caption can return to the first generated version");
  await captionReview.locator('[data-rw="next"]').click();
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await imageBlock.locator(":scope > .real-image-frame").screenshot({ path: `${process.cwd()}/output/playwright/preview-image-caption-inline-review.png` });
  }
  await captionReview.locator('[data-rw="accept"]').click();
  const acceptedCaption = await imageCaption.innerText();
  assert.match(acceptedCaption, /更简洁，保留全部地名/, "accepted targeted caption remains in the original caption line");
  assert.match(await imageBlock.getAttribute("data-source"), new RegExp(acceptedCaption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "accepted caption updates the image Block Markdown source");
  await page.locator('#ambient-panel [data-mode="history"]').click();
  assert.equal(await page.locator('#ambient-panel .history-row[data-origin="ai"]').filter({ hasText: "生成图注" }).count(), 1, "accepted inline caption patch is recorded in document History");
  await page.locator('#ambient-panel [data-mode="copilot"]').click();

  const sourceBeforeAiImage = await imageBlock.getAttribute("data-source");
  await imageBlock.hover();
  await imageBlock.locator('.image-toolbar [data-action="ai-image"]').click();
  assert.equal(await imageConverter.locator("[data-image-ai-prompt]").isVisible(), true, "AI image edit first asks what should change");
  assert.equal(await imageConverter.locator("[data-image-ai-result]").isHidden(), true, "AI image edit does not generate a candidate before an instruction");
  await imageConverter.locator('[data-image-ai-preset="突出路线，弱化底图"]').click();
  assert.match(await imageConverter.locator("[data-image-ai-instruction]").inputValue(), /突出路线/, "preset remains editable as the initial instruction");
  await imageConverter.locator('[data-image-ai-prompt] [data-image-panel-action="generate-ai-image"]').click();
  assert.equal(await imageConverter.locator("[data-image-ai-generation]").isVisible(), true, "AI image edit exposes an in-progress generation state");
  assert.equal(await imageBlock.getAttribute("data-source"), sourceBeforeAiImage, "AI image generation keeps the existing attachment unchanged");
  await imageConverter.locator("[data-image-ai-result]").waitFor({ state: "visible" });
  assert.equal(await imageConverter.locator("[data-image-ai-version]").innerText(), "1 / 1", "the first AI image candidate is versioned");
  await imageConverter.locator(".image-ai-followup [data-candidate-instruction]").fill("保留地名，进一步增强路线对比");
  await imageConverter.locator('[data-image-ai-result] [data-image-panel-action="generate-ai-image"]').click();
  await page.waitForFunction(() => document.querySelector('[data-block-title="路线图"] [data-image-ai-version]')?.textContent.trim() === "2 / 2");
  await imageConverter.locator('[data-image-panel-action="ai-image-history"]').click();
  assert.equal(await imageConverter.locator("[data-image-ai-history-index]").count(), 2, "AI image edit keeps prior candidates in history");
  await imageConverter.locator('[data-image-panel-action="ai-image-history"]').click();
  await imageConverter.locator('[data-image-panel-action="ai-image-previous"]').click();
  assert.equal(await imageConverter.locator("[data-image-ai-version]").innerText(), "1 / 2", "AI image edit can browse back without regenerating");
  await imageConverter.locator('[data-image-panel-action="ai-image-next"]').click();
  await imageConverter.locator('[data-image-panel-action="accept-ai-image"]').click();
  assert.notEqual(await imageBlock.getAttribute("data-source"), sourceBeforeAiImage, "accepting AI image edit swaps only the active candidate attachment");
  await page.locator('#ambient-panel [data-mode="history"]').click();
  assert.equal(await page.locator('#ambient-panel .history-row[data-origin="ai"]').filter({ hasText: "AI 改图" }).count(), 1, "accepted AI image edit is recorded in document History");
  await page.locator('#ambient-panel [data-mode="copilot"]').click();

  const questionSource = page.locator('[data-block-title="AI 旁路段落"]');
  await questionSource.hover();
  await questionSource.locator('.block-action-bar [data-ai-quick]').filter({ hasText: "提出追问" }).click();
  const questionDraft = page.locator('[data-block-title="AI 旁路段落"] + .generated-draft');
  await questionDraft.waitFor({ state: "visible" });
  await page.waitForFunction(() => (document.querySelector('[data-block-title="AI 旁路段落"] + .generated-draft [data-draft-stream-text]')?.textContent.length || 0) >= 6);
  const initialStreamText = await questionDraft.locator("[data-draft-stream-text]").innerText();
  assert.equal(await questionDraft.evaluate((node) => node.classList.contains("is-generating")), true, "initial additive AI draft remains generating while text is partial");
  assert.equal(await questionDraft.locator(".generated-draft-stream .ai-caret").isVisible(), true, "additive AI draft exposes a live streaming caret");
  assert.equal(await questionDraft.locator('[data-draft-result="accept"]').isDisabled(), true, "partial streamed draft cannot be accepted");
  await page.waitForFunction(() => !document.querySelector('[data-block-title="AI 旁路段落"] + .generated-draft')?.classList.contains("is-generating"));
  const firstQuestionDraft = await questionDraft.locator(":scope > .markdown-list").innerText();
  const initialQuestionLead = initialStreamText.replace(/^-\s*/, "").split("\n")[0];
  assert.equal(firstQuestionDraft.includes(initialQuestionLead), true, "streamed prefix becomes the completed first draft");
  assert.equal(await questionDraft.locator(":scope > .markdown-list > li").count(), 3, "question generation resolves into one readable list draft");
  assert.deepEqual(
    await questionDraft.locator(".draft-review-actions > button").allTextContents(),
    ["接受", "重新生成", "丢弃"],
    "additive AI-created content keeps accept, regenerate, and discard in one review row",
  );
  assert.equal(await questionDraft.locator(":scope > .block-action-bar").evaluate((node) => getComputedStyle(node).display), "none", "list draft also keeps ordinary Block chrome hidden until acceptance");
  assert.equal(await questionDraft.locator(":scope > .generated-draft-review").isVisible(), true, "single-version list draft keeps its aligned review footer visible");
  assert.equal(await questionDraft.locator(".draft-variant-nav").isHidden(), true, "single-version draft omits inactive version arrows");
  assert.equal(await questionDraft.locator('[data-draft-result="regenerate"] use').getAttribute("href"), "#i-refresh", "regenerate uses the standard refresh icon");
  const draftSurfaceStyle = await questionDraft.evaluate((node) => {
    const surface = getComputedStyle(node);
    const footer = getComputedStyle(node.querySelector(".generated-draft-review"));
    return {
      background: surface.backgroundColor,
      borderLeftWidth: surface.borderLeftWidth,
      borderLeftColor: surface.borderLeftColor,
      borderTopColor: surface.borderTopColor,
      boxShadow: surface.boxShadow,
      footerBorderTopStyle: footer.borderTopStyle,
    };
  });
  assert.equal(draftSurfaceStyle.background, "rgb(255, 255, 255)", "draft content keeps the document's neutral white surface");
  assert.equal(draftSurfaceStyle.borderLeftWidth, "1px", "draft does not use a decorative colored card rail");
  assert.equal(draftSurfaceStyle.borderLeftColor, draftSurfaceStyle.borderTopColor, "draft outline stays neutral on every edge");
  assert.equal(draftSurfaceStyle.boxShadow, "none", "draft does not add a floating-card shadow");
  assert.equal(draftSurfaceStyle.footerBorderTopStyle, "solid", "draft review controls use one quiet separator");
  const questionInstruction = questionDraft.locator("[data-candidate-instruction]");
  await questionInstruction.fill("更聚焦读者下一步");
  await questionInstruction.press("Enter");
  assert.match(await questionDraft.locator("[data-draft-status]").innerText(), /重新生成中/, "targeted regeneration has an explicit in-progress state");
  assert.equal(await questionDraft.locator('[data-draft-result="accept"]').isDisabled(), true, "accept is blocked while the next draft version streams");
  assert.equal(await questionDraft.locator('[data-draft-result="discard"]').isDisabled(), false, "discard remains available during regeneration");
  await page.waitForFunction(() => (document.querySelector('[data-block-title="AI 旁路段落"] + .generated-draft [data-draft-stream-text]')?.textContent.length || 0) >= 8);
  assert.equal(await questionDraft.locator(".generated-draft-stream .ai-caret").isVisible(), true, "regenerated draft streams inside the same body");
  assert.match(await questionDraft.locator("[data-draft-status-detail]").innerText(), /更聚焦读者下一步/, "streaming progress exposes the targeted instruction");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await questionDraft.screenshot({ path: `${process.cwd()}/output/playwright/preview-ai-draft-streaming.png` });
  }
  await page.waitForFunction(() => document.querySelector('[data-block-title="AI 旁路段落"] + .generated-draft [data-draft-version]')?.textContent.trim() === "2 / 2");
  const secondQuestionDraft = await questionDraft.locator(":scope > .markdown-list").innerText();
  assert.notEqual(secondQuestionDraft, firstQuestionDraft, "regeneration creates a distinct second draft version");
  assert.match(secondQuestionDraft, /更聚焦读者下一步/, "targeted instruction changes the regenerated draft content");
  assert.equal(await questionDraft.locator(".draft-variant-nav").isVisible(), true, "version navigation appears after a second candidate exists");
  const alignedReviewControls = await questionDraft.locator(".draft-variant-nav, .draft-review-actions > button").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { height: Math.round(box.height), centerY: Math.round(box.top + box.height / 2) };
  }));
  assert.equal(new Set(alignedReviewControls.map(({ height }) => height)).size, 1, "version navigation and review actions share one control height");
  assert.equal(new Set(alignedReviewControls.map(({ centerY }) => centerY)).size, 1, "version navigation and review actions share one vertical center");
  await questionDraft.locator('[data-draft-result="previous"]').click();
  assert.equal(await questionDraft.locator(":scope > .markdown-list").innerText(), firstQuestionDraft, "previous returns to the first draft version");
  await questionDraft.locator('[data-draft-result="next"]').click();
  assert.equal(await questionDraft.locator(":scope > .markdown-list").innerText(), secondQuestionDraft, "next returns to the regenerated draft version");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await questionDraft.screenshot({ path: `${process.cwd()}/output/playwright/preview-ai-draft-regenerate-versions.png` });
  }
  const [questionDraftBox, questionReviewBox] = await Promise.all([
    questionDraft.boundingBox(),
    questionDraft.locator(":scope > .generated-draft-review").boundingBox(),
  ]);
  assert.ok((questionReviewBox?.y || 0) >= (questionDraftBox?.y || 0), "review footer remains inside the draft surface");
  assert.ok((questionReviewBox?.y || 0) + (questionReviewBox?.height || 0) <= (questionDraftBox?.y || 0) + (questionDraftBox?.height || 0) + 1, "draft surface contains the complete review footer");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await questionDraft.screenshot({ path: `${process.cwd()}/output/playwright/preview-ai-draft-inline-surface.png` });
  }
  await questionDraft.evaluate((node) => { node.id = "accepted-question-draft"; });
  await questionDraft.locator('[data-draft-result="accept"]').click();
  const acceptedQuestionBlock = page.locator("#accepted-question-draft");
  await acceptedQuestionBlock.hover();
  assert.equal(await acceptedQuestionBlock.evaluate((node) => node.classList.contains("generated-draft")), false, "acceptance turns the transaction into an ordinary Composer Block");
  assert.equal(await acceptedQuestionBlock.locator(":scope > .block-controls").evaluate((node) => getComputedStyle(node).display), "grid", "accepted content restores normal Block controls");
  assert.equal(await acceptedQuestionBlock.locator(":scope > .block-action-bar").isVisible(), true, "accepted content restores the normal Block action row");
  await page.locator('#ambient-panel [data-mode="history"]').click();
  const acceptedInsertHistory = page.locator('#ambient-panel .history-row[data-origin="ai"]').filter({ hasText: "提出追问 · v2" });
  assert.equal(await acceptedInsertHistory.count(), 1, "accepted additive Block AI draft is projected into document History");
  await page.locator('#ambient-panel [data-mode="copilot"]').click();
  await acceptedQuestionBlock.evaluate((node) => node.remove());

  const closingQuote = page.locator('[data-block-title="结尾引用"]');
  await closingQuote.hover();
  await closingQuote.locator('.block-action-bar [data-ai-quick]').filter({ hasText: "找反例" }).click();
  const counterexampleDraft = page.locator('[data-block-title="结尾引用"] + .generated-draft');
  await page.waitForFunction(() => !document.querySelector('[data-block-title="结尾引用"] + .generated-draft')?.classList.contains("is-generating"));
  const counterexampleBodySpacing = await counterexampleDraft.locator(":scope > p:not(.generated-draft-stream)").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      paddingTop: parseFloat(style.paddingTop),
      paddingRight: parseFloat(style.paddingRight),
      paddingBottom: parseFloat(style.paddingBottom),
      paddingLeft: parseFloat(style.paddingLeft),
      lineHeight: parseFloat(style.lineHeight),
    };
  });
  assert.ok(counterexampleBodySpacing.paddingTop >= 10, "completed paragraph draft keeps breathing room above its text");
  assert.ok(counterexampleBodySpacing.paddingRight >= 14, "completed paragraph draft keeps its text away from the right edge");
  assert.ok(counterexampleBodySpacing.paddingBottom >= 8, "completed paragraph draft keeps breathing room before the review separator");
  assert.ok(counterexampleBodySpacing.paddingLeft >= 14, "completed paragraph draft aligns with the padded streaming state instead of touching the outline");
  assert.ok(counterexampleBodySpacing.lineHeight >= 24, "completed paragraph draft preserves a readable text rhythm");
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await counterexampleDraft.screenshot({ path: `${process.cwd()}/output/playwright/preview-ai-draft-paragraph-spacing.png` });
  }
  await counterexampleDraft.locator('[data-draft-result="discard"]').click();

  const baseBlock = page.locator('#paper > [data-block-title="PKM Base preview"]');
  await baseBlock.hover();
  await baseBlock.locator(":scope > .block-action-bar [data-ai-quick]").filter({ hasText: "生成视图" }).click();
  const baseDraft = page.locator('[data-block-title="PKM Base preview"] + .generated-draft');
  await baseDraft.waitFor({ state: "visible" });
  assert.equal(await baseDraft.locator(":scope > .generated-object-skeleton").isVisible(), true, "structured Base generation uses an object-shaped progress surface");
  assert.equal((await baseDraft.innerText()).includes("生成一个新的 Base view 草案"), false, "trigger copy is never rendered as the Base candidate body");
  assert.equal((await baseDraft.innerText()).includes("views:\n  - type"), false, "Base generation does not flash raw YAML before the real candidate");
  await page.waitForFunction(() => !document.querySelector('[data-block-title="PKM Base preview"] + .generated-draft')?.classList.contains("is-generating"));
  assert.equal(await baseDraft.locator(":scope > .generated-base-view").isVisible(), true, "completed Base generation renders a real view candidate");
  assert.match(await baseDraft.getAttribute("data-source"), /^views:\n  - type: table/, "Base candidate still retains inspectable typed source");
  await baseDraft.locator("[data-candidate-instruction]").fill("只显示本周待推进");
  await baseDraft.locator("[data-candidate-instruction]").press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-block-title="PKM Base preview"] + .generated-draft [data-draft-version]')?.textContent.trim() === "2 / 2");
  assert.match(await baseDraft.locator(".generated-base-view").innerText(), /只显示本周待推进/, "Base candidate supports targeted regeneration");
  await baseDraft.locator('[data-draft-result="previous"]').click();
  assert.equal(await baseDraft.locator("[data-draft-version]").innerText(), "1 / 2", "Base candidate can browse its previous version");
  await baseDraft.locator('[data-draft-result="next"]').click();
  await baseDraft.locator('[data-draft-result="discard"]').click();

  const pasteResult = await page.evaluate(() => {
    const anchor = document.querySelector('[data-block-title="AI 旁路段落"]');
    const paragraph = anchor.querySelector(":scope > p");
    const text = Array.from(paragraph.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const original = paragraph.textContent.trim();
    const offset = Math.floor(text.textContent.length / 2);
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files: [file], getData: () => "" } });
    paragraph.dispatchEvent(event);
    const pasted = anchor.nextElementSibling;
    const continuation = pasted?.nextElementSibling;
    return {
      original,
      pastedClass: pasted?.className || "",
      continuationClass: continuation?.className || "",
      reconstructed: `${paragraph.textContent.trim()}${continuation?.querySelector(":scope > p")?.textContent.trim() || ""}`,
    };
  });
  const pasted = page.locator("#paper > .pasted-image-block").last();
  assert.equal(await pasted.count(), 1, "pasting an image creates a real image draft Block");
  assert.match(pasteResult.pastedClass, /pasted-image-block/, "the new image Block is inserted exactly at the document caret");
  assert.match(pasteResult.continuationClass, /pasted-image-continuation/, "mid-paragraph paste splits the paragraph into before / image / after Blocks");
  assert.equal(pasteResult.reconstructed, pasteResult.original, "splitting around an image paste preserves the paragraph text");
  assert.equal(await pasted.locator(":scope > .image-tool-panel").isVisible(), true, "pasted image immediately opens semantic rename review");
  assert.equal(await pasted.locator(".image-paste-receipt").isVisible(), true, "paste receipt explains attachment and embed are still pending");
  assert.match(await pasted.locator("[data-image-rename-input]").inputValue(), /pkm-knowledge-workflow-\d{4}-\d{2}-\d{2}\.png/, "automatic filename uses the caret section context");
  if (process.env.CAPTURE_SCREENSHOTS === "1") await pasted.screenshot({ path: "/tmp/peak-composer-caret-image-paste.png" });

  const codeBlock = page.locator('#paper > [data-block-title="Base source code"]');
  const copiedCode = await assertImmediateCopy(page, codeBlock, "plain", "Code Block plain-text copy");
  assert.match(copiedCode, /^views:\n  - type: table\n    name: PKM Pipeline\n/, "Code Block plain text preserves semantic line breaks and indentation");

  await page.evaluate(() => {
    const code = document.querySelector('[data-block-kind="code"] code');
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    window.updateSelectionToolbar?.();
  });
  assert.equal(await page.locator("#selection-toolbar").isHidden(), true, "Code Block selections suppress rich-text formatting controls");

  await page.evaluate(() => {
    const blocks = [
      document.querySelector('[data-block-title="导语段落"] p'),
      document.querySelector('[data-block-title="Composer 定位段落"] p'),
    ];
    const textNodes = (root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
      }
      return nodes;
    };
    const first = textNodes(blocks[0])[0];
    const last = textNodes(blocks[1]).at(-1);
    const firstStart = first.textContent.search(/\S/);
    const lastStart = last.textContent.search(/\S/);
    const range = document.createRange();
    range.setStart(first, firstStart);
    range.setEnd(last, Math.min(lastStart + 8, last.textContent.length));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    window.updateSelectionToolbar?.();
  });
  await page.waitForFunction(() => document.querySelector("#selection-scope")?.textContent.includes("跨 2 个块"));
  assert.equal(await page.locator("#selection-scope").isVisible(), true, "true cross-block selection shows its scope");

  await assertNoOverflow(page, "main Composer");
  assert.deepEqual(errors, [], `main Composer has no runtime errors: ${errors.join("; ")}`);
  await page.close();
}

async function testDocumentReviewModes() {
  const { page, errors } = await open(reviewUrl, '[data-intelligence-root][data-intelligence-mounted="true"]');
  await page.waitForFunction(() => !document.querySelector("#composer-change-navigator").hidden);
  const labels = await page.locator(".composer-review-modes [data-composer-review-view]").allTextContents();
  assert.deepEqual(labels, ["工作视图", "全部改动", "纯净阅读"], "review controller uses the three document states");
  const navigatorGeometry = await page.locator(".composer-review-modes button, .composer-change-actions button").evaluateAll((buttons) => buttons.map((button) => {
    const style = getComputedStyle(button);
    return `${style.height}|${style.borderRadius}`;
  }));
  assert.equal(new Set(navigatorGeometry).size, 1, "review modes, navigation and decisions share the review-control geometry");
  assert.doesNotMatch(await page.locator("#composer-change-navigator").innerText(), /当前一处|候选尚未写入|\+\d+\s+−\d+/, "global controller omits the retired mode and per-change deltas");
  assert.equal(await page.locator(".composer-inline-diff-text").count(), 0, "work view does not expand pending candidates");

  await page.locator('.composer-review-modes [data-composer-review-view="all"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".composer-inline-diff-text").length > 0);
  assert.ok(await page.locator(".composer-inline-diff-text").count() > 0, "all-changes view renders text diff inside the real sentence");
  assert.equal(await page.locator(".composer-inline-change").count(), 0, "review no longer appends a detached text candidate row");

  await page.locator('.composer-review-modes [data-composer-review-view="clean"]').click();
  assert.equal(await page.locator("#paper").evaluate((node) => node.classList.contains("is-clean-reading")), true, "clean reading hides AI decorations");
  assert.equal(await page.locator(".composer-change-pins").count(), 0, "clean reading hides change pins");
  assert.deepEqual(errors, [], `document review has no runtime errors: ${errors.join("; ")}`);
  await page.close();
}

async function testDiffPatternLab() {
  const { page, errors } = await open(labUrl, "#diff-document");
  assert.equal(await page.locator("[data-pattern-id]").count(), 9, "lab covers nine object diff patterns");
  assert.deepEqual(await page.locator(".lab-intro [data-view]").allTextContents(), ["工作视图", "全部改动", "纯净阅读"], "lab exposes the three document states");

  await page.locator('[data-pattern-id="text-replace"] [data-decision="accept"]').click();
  assert.equal(await page.locator("#pending-total").textContent(), "8 处待审", "accept resolves only one pattern");
  assert.equal(await page.locator('[data-pattern-id="text-replace"]').getAttribute("data-status"), "accepted", "accepted pattern keeps its own state");

  await page.locator('[data-filter="object"]').click();
  assert.equal(await page.locator('[data-pattern-id]:visible').count(), 2, "object filter shows table and image patterns");
  await page.locator('.lab-intro [data-view="clean"]').click();
  assert.equal(await page.locator("body").getAttribute("data-view"), "clean", "clean reading state is interactive");

  await assertNoOverflow(page, "diff pattern lab");
  if (process.env.CAPTURE_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/peak-composer-diff-patterns-lab.png", fullPage: true });
  assert.deepEqual(errors, [], `diff pattern lab has no runtime errors: ${errors.join("; ")}`);
  await page.close();
}

try {
  await testMainEditingSurface();
  await testDocumentReviewModes();
  await testDiffPatternLab();
  console.log("Composer editing patterns QA passed");
} finally {
  await browser.close();
}
