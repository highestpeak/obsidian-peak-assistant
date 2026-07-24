import assert from "node:assert/strict";
import { chromium } from "playwright";

const entrypoints = {
  index: new URL("./index.html?mode=copilot&stage=brief", import.meta.url).href,
  lab: new URL("./intelligence-lab.html?mode=copilot&stage=brief", import.meta.url).href,
};

const selectedAcceptanceFixture = new URL(
  "./intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief",
  import.meta.url,
).href;

const expectedModes = ["copilot", "history"];
const browser = await chromium.launch({ headless: true });

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function openPage(
  url,
  viewport = { width: 1470, height: 900 },
  readySelector = '[data-intelligence-root][data-intelligence-mounted="true"]',
) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(8000);
  const errors = collectErrors(page);
  await page.goto(url);
  await page.waitForSelector(readySelector);
  return { page, errors };
}

async function openEntrypoint(name, viewport) {
  return openPage(entrypoints[name], viewport);
}

async function drawerIsOpen(page) {
  return page.locator("[data-intelligence-root]").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.visibility !== "hidden"
      && Number(style.opacity) !== 0
      && element.getAttribute("aria-hidden") === "false"
      && Math.abs(innerWidth - rect.right) <= 24;
  });
}

async function ensureDrawerOpen(page) {
  await page.waitForTimeout(260);
  if (await drawerIsOpen(page)) return;
  const toggle = page.locator('#ambient-toggle, [data-intelligence-toggle], [data-panel-toggle]').first();
  if (await toggle.count()) {
    await toggle.dispatchEvent("click");
  } else {
    await page.evaluate(() => {
      const root = document.querySelector("[data-intelligence-root]");
      window.PeakIntelligencePanel?.setOpen(true, root, { restoreFocus: false });
    });
  }
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-intelligence-root]");
    if (!root) return false;
    const rect = root.getBoundingClientRect();
    return root.getAttribute("aria-hidden") === "false"
      && Math.abs(innerWidth - rect.right) <= 24;
  });
  await page.waitForTimeout(260);
}

async function assertSharedAssets(page, name) {
  const assets = await page.evaluate(() => ({
    styles: Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'), (node) => new URL(node.href).pathname.split("/").pop()),
    scripts: Array.from(document.querySelectorAll("script[src]"), (node) => new URL(node.src).pathname.split("/").pop()),
  }));
  assert.ok(assets.styles.includes("intelligence.css"), `${name} references intelligence.css`);
  assert.ok(assets.scripts.includes("intelligence-panel.js"), `${name} references intelligence-panel.js`);
  assert.equal(
    await page.evaluate(() => typeof window.PeakIntelligencePanel?.mount === "function"),
    true,
    `${name} executes the shared controller`,
  );
}

async function assertAdaptiveShell(page, name) {
  const root = page.locator("[data-intelligence-root]").first();
  await ensureDrawerOpen(page);

  const modes = await root.locator("[data-mode]").evaluateAll((tabs) => tabs.map((tab) => tab.dataset.mode));
  assert.deepEqual(modes, expectedModes, `${name} exposes only Copilot / History`);
  assert.equal(await root.getAttribute("data-variant"), "adaptive", `${name} uses the selected adaptive shell`);
  assert.equal(await root.getAttribute("data-stage"), "brief", `${name} starts on Copilot brief`);
  assert.equal(await root.locator(".stage-tabs").evaluate((element) => element.hidden), true, `${name} has no permanent stage rail`);
  assert.equal(await root.locator(".brief-view").count(), 1, `${name} renders the Ambient-powered brief inside Copilot`);
  assert.equal(await root.locator(".brief-section").count(), 3, `${name} keeps all three proactive sections in one brief`);
  assert.match(await root.locator(".brief-view").innerText(), /接下来可能要做/);
  assert.match(await root.locator(".brief-view").innerText(), /相关材料/);
  assert.match(await root.locator(".brief-view").innerText(), /还没安放的想法/);
  assert.equal(await root.locator(".session-dock").evaluate((element) => element.hidden), true, `${name} hides the composer in brief`);

  const sensingSummary = root.locator(".sensing-control > summary");
  assert.match(await sensingSummary.innerText(), /建议更新 · 停笔后/, `${name} describes the default trigger in user language`);
  await sensingSummary.click();
  const sensingMenu = root.locator(".sensing-menu");
  assert.equal(await sensingMenu.locator(".sensing-menu-label").count(), 2, `${name} separates update timing from candidate preparation`);
  assert.match(await sensingMenu.innerText(), /什么时候检查新建议/);
  assert.match(await sensingMenu.innerText(), /仅手动/);
  assert.match(await sensingMenu.innerText(), /停笔后更新/);
  assert.match(await sensingMenu.innerText(), /编辑时定期更新/);
  assert.match(await sensingMenu.innerText(), /自动准备待审改动/);
  assert.doesNotMatch(await sensingMenu.innerText(), /自动运行建议|感知模式/, `${name} avoids internal policy names`);
  await sensingSummary.click();

  const materialPreview = root.locator("[data-related-material-preview]");
  await materialPreview.waitFor();
  assert.equal(
    await materialPreview.locator('[data-graph-surface="compact"]').count(),
    1,
    `${name} keeps the bounded related-material graph preview in the sidecar`,
  );
  assert.equal(
    await materialPreview.locator("[data-graph-node]").count(),
    5,
    `${name} previews the current object and four ranked materials without opening the browser`,
  );
  const previewSource = materialPreview.locator('[data-source-id]:not([data-source-id=""])').nth(1);
  const previewSourceId = await previewSource.getAttribute("data-source-id");
  await previewSource.click();
  assert.equal(
    await root.locator("[data-related-material-preview] [data-selected-source]").getAttribute("data-selected-source"),
    previewSourceId,
    `${name} updates the inline source detail in place`,
  );

  const materialTrigger = root.locator("[data-related-material-preview] [data-open-graph]");
  await materialTrigger.click();
  const graphDialog = root.locator(".graph-dialog[open]");
  await graphDialog.waitFor();
  const reusedResultBrowser = graphDialog.locator("[data-vault-result-browser-reuse]");
  await reusedResultBrowser.waitFor();
  assert.match(
    await reusedResultBrowser.innerText(),
    /完整资料浏览组件/,
    `${name} hands related materials to the shared result-browser component without exposing its internal name`,
  );
  assert.equal(
    await graphDialog.locator("[data-result-view]").count(),
    0,
    `${name} does not duplicate Vault Search result views in the Composer mock`,
  );
  assert.equal(
    await graphDialog.locator("[data-graph-preset]").count(),
    0,
    `${name} does not duplicate Vault Search graph layouts in the Composer mock`,
  );
  await graphDialog.locator("[data-close-graph]").click();
  await graphDialog.waitFor({ state: "hidden" });
  assert.equal(await root.locator(".graph-dialog[open]").count(), 0, `${name} closes the material explorer`);
  assert.equal(
    await materialTrigger.evaluate((button) => document.activeElement === button),
    true,
    `${name} restores focus to the inline preview trigger`,
  );

  await root.locator("[data-start-session]").click();
  await root.locator(".session-view").waitFor();
  assert.equal(await root.getAttribute("data-stage"), "session", `${name} enters task session from brief`);
  assert.equal(await root.locator(".session-dock").evaluate((element) => element.hidden), false, `${name} shows the composer only in session`);
  assert.ok(await root.locator(".thread-event").count() >= 4, `${name} session exposes typed conversation events`);

  await root.locator("[data-open-capabilities]").click();
  const capabilityDialog = root.locator(".capability-dialog[open]");
  await capabilityDialog.waitFor();
  assert.ok(await capabilityDialog.locator(".capability-group").count() >= 4, `${name} groups the complete capability catalog`);
  assert.ok(await capabilityDialog.locator(".capability-row").count() >= 16, `${name} renders capability rows instead of a raw text dump`);
  const firstCapabilityMetrics = await capabilityDialog.locator(".capability-row").first().evaluate((row) => ({
    display: getComputedStyle(row).display,
    height: row.getBoundingClientRect().height,
  }));
  assert.equal(firstCapabilityMetrics.display, "grid", `${name} capability rows use the shared visual layout`);
  assert.ok(firstCapabilityMetrics.height >= 48, `${name} capability rows preserve readable hit targets`);
  assert.equal(
    await capabilityDialog.locator(".capability-row > i").first().evaluate((badge) => {
      const use = badge.querySelector("svg use");
      const symbol = use?.getAttribute("href");
      return badge.textContent.trim() === "" && Boolean(symbol && document.querySelector(symbol));
    }),
    true,
    `${name} renders a real semantic icon instead of a text abbreviation`,
  );
  await capabilityDialog.locator("[data-capability-search]").fill("Translate");
  assert.equal(await capabilityDialog.locator(".capability-row").count(), 1, `${name} capability search filters the catalog`);
  assert.match(await capabilityDialog.locator(".capability-row").innerText(), /翻译/);
  assert.equal(await capabilityDialog.locator('[data-picker-capability="translate"]').isDisabled(), true, `${name} capability rows expose their disabled reason`);
  await capabilityDialog.locator("[data-capability-search]").fill("Correct Content");
  await capabilityDialog.locator('[data-picker-capability="correct-content"]').click();
  assert.match(await root.locator(".context-chip.is-action").innerText(), /修正内容/, `${name} capability selection becomes an action chip`);

  await root.locator("[data-add-context]").click();
  const contextDialog = root.locator(".capability-dialog[open]");
  assert.match(await contextDialog.locator("#capability-dialog-title").innerText(), /添加上下文/);
  await contextDialog.locator("[data-capability-search]").fill("图谱");
  await contextDialog.locator('[data-context-option="graph"]').click();
  assert.match(await root.locator(".prompt-context").innerText(), /链接图谱/);
  assert.equal(await root.locator('[data-remove-context="current"]').count(), 0, `${name} keeps the current object as a non-removable system context`);

  const capabilityTrigger = root.locator("[data-open-capabilities]");
  await capabilityTrigger.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(40);
  assert.equal(await root.locator(".capability-dialog[open]").count(), 0, `${name} Escape closes only the active dialog`);
  assert.equal(await drawerIsOpen(page), true, `${name} Escape leaves the Intelligence drawer open`);
  assert.equal(await capabilityTrigger.evaluate((button) => document.activeElement === button), true, `${name} Escape restores the capability trigger focus`);
  await capabilityTrigger.click();
  await root.locator(".capability-dialog[open]").evaluate((dialog) => dialog.click());
  await page.waitForTimeout(40);
  assert.equal(await root.locator(".capability-dialog[open]").count(), 0, `${name} clicking the dialog backdrop closes it`);
  assert.equal(await capabilityTrigger.evaluate((button) => document.activeElement === button), true, `${name} backdrop close restores the capability trigger focus`);

  await root.locator("[data-model-info]").click();
  assert.match(await root.locator(".toast").innerText(), /自动模型/);
  const voice = root.locator("[data-voice]");
  await voice.click();
  assert.equal(await voice.evaluate((button) => button.classList.contains("is-listening")), true, `${name} exposes the listening state`);
  await page.waitForTimeout(1100);
  assert.equal(await voice.evaluate((button) => button.classList.contains("is-listening")), false, `${name} clears the listening state after dictation`);
  assert.match(await root.locator(".prompt-input").inputValue(), /风险从高到低/, `${name} dictation writes into the composer draft`);

  const prompt = root.locator(".prompt-input");
  const draftCount = await page.locator(".draft-block").count();
  await prompt.fill(`QA ${name}：补清这个判断`);
  await prompt.press("Control+Enter");
  await root.locator(".thread-event.is-run").waitFor();
  await root.locator(".run-receipt").waitFor({ timeout: 3000 });
  assert.equal(await prompt.inputValue(), "", `${name} clears the submitted draft`);
  assert.equal(await page.locator(".draft-block").count(), draftCount, `${name} Ctrl+Enter submits only to Copilot and never creates a document draft`);
  assert.deepEqual(
    await root.locator("[data-run-tab]").evaluateAll((tabs) => tabs.map((tab) => tab.dataset.runTab)),
    ["changes", "insights", "sources", "trace"],
    `${name} keeps run artifacts inside one message receipt`,
  );

  await root.locator("[data-start-review]").last().click();
  await root.locator(".review-view").waitFor();
  assert.equal(await root.getAttribute("data-stage"), "review", `${name} enters transient review`);
  assert.equal(await root.locator(".session-dock").evaluate((element) => element.hidden), true, `${name} hides the ordinary composer in review`);
  const initialReviewText = await root.locator(".review-progress").innerText();
  await root.locator('[data-review-nav="next"]').click();
  assert.notEqual(await root.locator(".review-progress").innerText(), initialReviewText, `${name} review previous/next changes the active location`);
  await root.locator('[data-review-action="accept"]').click();
  assert.ok(await root.locator('.change-row[data-status="accepted"]').count() >= 1, `${name} review acceptance creates resolved state`);
  await root.locator('[data-review-action="accept"]').click();
  assert.ok(await root.locator('.change-row[data-status="accepted"]').count() >= 2, `${name} retains two accepted changes as independent transactions`);

  await root.locator('[data-mode="history"]').click();
  await root.locator(".history-view").waitFor();
  assert.equal(await root.locator(".session-dock").evaluate((element) => element.hidden), true, `${name} History never shows the composer`);
  assert.ok(await root.locator(".history-row").count() >= 9, `${name} History exposes dated document transactions`);
  assert.match(await root.locator(".history-heading").innerText(), /文档历史[\s\S]*直接编辑[\s\S]*AI 辅助后接受[\s\S]*系统回滚/, `${name} History explains every durable document-operation origin`);
  assert.ok(await root.locator('.history-row[data-origin="user"]').count() >= 1, `${name} History includes direct user operations`);
  assert.ok(await root.locator('.history-row[data-origin="ai"], .history-row[data-origin="mixed"]').count() >= 1, `${name} History includes accepted AI-assisted operations`);
  assert.ok(await root.locator('.history-row[data-origin="system"]').count() >= 1, `${name} History includes explicit rollback operations`);
  const aiBatch = root.locator('[data-history-group="copilot-run-current"]');
  assert.equal(await aiBatch.isVisible(), true, `${name} groups accepted changes from one Copilot run`);
  assert.match(await aiBatch.locator(".history-batch-summary").innerText(), /本轮 Copilot 写入 · 2 处[\s\S]*2 笔独立事务/, `${name} AI batch preserves its independent transaction count`);
  await aiBatch.locator(".history-batch-summary").click();
  assert.equal(await aiBatch.locator(".history-row.is-nested").count(), 2, `${name} expands one Copilot group back into individual transactions`);
  const historyTrigger = root.locator(".history-row").first();
  await historyTrigger.click();
  await root.locator(".history-dialog[open]").waitFor();
  assert.match(await root.locator(".history-dialog-body").innerText(), /.+/);
  await root.locator("[data-close-history]").click();
  await page.waitForTimeout(40);
  assert.equal(await historyTrigger.evaluate((button) => document.activeElement === button), true, `${name} History close restores the transaction focus`);
}

async function assertDesktopEntrypoint(name) {
  const { page, errors } = await openEntrypoint(name);
  try {
    await assertSharedAssets(page, name);
    const root = page.locator("[data-intelligence-root]").first();
    const version = await root.getAttribute("data-intelligence-version");
    assert.ok(version, `${name} exposes the shared sidecar version`);
    assert.equal(version, await page.evaluate(() => window.PeakIntelligencePanel?.version), `${name} DOM/API versions match`);
    await assertAdaptiveShell(page, name);
    assert.deepEqual(errors, [], `${name} has no console or page errors`);
    return version;
  } finally {
    await page.close();
  }
}

async function assertAcceptanceFixture() {
  const { page, errors } = await openPage(
    selectedAcceptanceFixture,
    { width: 1470, height: 900 },
    "#intelligence-panel",
  );
  try {
    const root = page.locator("#intelligence-panel");
    assert.deepEqual(
      await root.locator(".primary-tabs [data-mode]").evaluateAll((tabs) => tabs.map((tab) => tab.dataset.mode)),
      expectedModes,
      "selected IA fixture exposes Copilot / History",
    );
    assert.equal(await root.getAttribute("data-variant"), "adaptive", "selected IA fixture is adaptive");
    assert.equal(await root.getAttribute("data-stage"), "brief", "selected IA fixture opens on brief");
    assert.ok(await root.locator(".brief-view").count() === 1, "selected IA fixture renders brief");
    const sensingSummary = root.locator(".sensing-control > summary");
    assert.match(await sensingSummary.innerText(), /建议更新 · 停笔后/, "selected IA fixture uses the shared update vocabulary");
    await sensingSummary.click();
    assert.match(await root.locator(".sensing-menu").innerText(), /自动准备待审改动/, "selected IA fixture separates candidate preparation from update timing");
    assert.deepEqual(errors, [], "selected IA fixture has no console or page errors");
  } finally {
    await page.close();
  }
}

async function assertNarrowDrawer(name) {
  const { page, errors } = await openEntrypoint(name, { width: 760, height: 900 });
  try {
    await ensureDrawerOpen(page);
    const root = page.locator("[data-intelligence-root]").first();
    const geometry = await root.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        position: getComputedStyle(element).position,
        rightDelta: Math.abs(innerWidth - rect.right),
        width: rect.width,
        viewportWidth: innerWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(geometry.position, "fixed", `${name} narrow Intelligence is a fixed drawer`);
    assert.ok(geometry.rightDelta <= 24, `${name} drawer stays on the right edge (${geometry.rightDelta}px inset)`);
    assert.ok(geometry.width <= geometry.viewportWidth, `${name} drawer fits the viewport`);
    assert.ok(geometry.overflow <= 1, `${name} drawer creates no horizontal overflow`);

    await root.locator("[data-panel-close]").dispatchEvent("click");
    await page.waitForFunction(() => {
      const element = document.querySelector("[data-intelligence-root]");
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.left >= innerWidth - 1 || rect.right <= 1;
    });
    assert.equal(await drawerIsOpen(page), false, `${name} close moves the drawer fully off-canvas`);

    const toggle = page.locator('#ambient-toggle, [data-intelligence-toggle], [data-panel-toggle]').first();
    assert.ok(await toggle.count() > 0, `${name} exposes a stable reopen control`);
    await toggle.dispatchEvent("click");
    await page.waitForFunction(() => {
      const element = document.querySelector("[data-intelligence-root]");
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return element.getAttribute("aria-hidden") === "false"
        && Math.abs(innerWidth - rect.right) <= 24;
    });
    assert.equal(await drawerIsOpen(page), true, `${name} reopens the same right drawer`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      true,
      `${name} remains overflow-free after reopen`,
    );
    assert.deepEqual(errors, [], `${name} narrow state has no console or page errors`);
  } finally {
    await page.close();
  }
}

async function assertIndexHostReviewBridge() {
  const { page, errors } = await openPage(`${entrypoints.index.split("?")[0]}?mode=copilot&stage=review`);
  try {
    await page.locator(".review-view").waitFor();
    assert.equal(await page.locator("[data-composer-change-index]").count(), 4, "direct review entry hydrates all Composer change pins");
    assert.equal(await page.locator("#composer-change-navigator").isVisible(), true, "direct review entry hydrates the document navigator");
    assert.deepEqual(
      await page.locator(".composer-review-modes [data-composer-review-view]").allTextContents(),
      ["工作视图", "全部改动", "纯净阅读"],
      "document navigator exposes work, all-changes and clean-reading states",
    );
    assert.equal(await page.locator(".doc-block.is-intelligence-review-target").count(), 0, "work view keeps pins and insights without expanding a candidate");
    await page.locator('.composer-review-modes [data-composer-review-view="all"]').click();
    assert.equal(await page.locator(".doc-block.is-intelligence-review-target").count(), 1, "all-changes view focuses one active object");
    assert.ok(await page.locator(".composer-inline-diff-text").count() > 0, "all-changes view renders in-place text diff");
    assert.equal(await page.locator(".composer-inline-change").count(), 0, "document review does not append a detached text candidate row");

    const stale = await page.evaluate(() => {
      const controller = window.PeakIntelligencePanel.controller("#ambient-panel");
      const change = controller.state.changes[0];
      const block = document.querySelector(`[data-block-title="${change.target}"]`);
      const before = change.before;
      const source = block.dataset.source;
      const history = controller.totalHistory();
      change.before = "__stale_range_that_does_not_exist__";
      controller.resolveReview("accept");
      const result = { status: change.status, source: block.dataset.source, history: controller.totalHistory() };
      change.before = before;
      return { ...result, expectedSource: source, expectedHistory: history };
    });
    assert.equal(stale.status, "pending", "stale source range cannot be accepted");
    assert.equal(stale.source, stale.expectedSource, "stale source range never overwrites the document block");
    assert.equal(stale.history, stale.expectedHistory, "failed writes never enter History");

    await page.locator('[data-review-action="edit-accept"]').click();
    const editor = page.locator(".review-edit-input");
    await editor.waitFor();
    assert.equal(
      await page.evaluate(() => window.PeakIntelligencePanel.controller("#ambient-panel").state.changes[0].status),
      "pending",
      "edit-after-accept opens an editor without resolving the change",
    );
    const edited = `${await editor.inputValue()}（经用户编辑）`;
    await editor.fill(edited);
    await page.locator("[data-review-edit-save]").click();
    assert.equal(
      await page.evaluate(() => window.PeakIntelligencePanel.controller("#ambient-panel").state.changes[0].status),
      "accepted",
      "saving the edited candidate accepts exactly that revision",
    );
    assert.match(
      await page.locator('[data-block-title="AI 旁路段落"]').getAttribute("data-source"),
      /经用户编辑/,
      "edited acceptance writes through the Composer host bridge",
    );

    await page.locator('#ambient-panel [data-mode="history"]').click();
    await page.locator('#ambient-panel [data-history-id="accepted-chg-01"]').click();
    await page.waitForFunction(() => {
      const rollback = document.querySelector('#ambient-panel [data-rollback-history]');
      return rollback && !rollback.disabled;
    });
    await page.locator('#ambient-panel [data-rollback-history]').click();
    assert.doesNotMatch(
      await page.locator('[data-block-title="AI 旁路段落"]').getAttribute("data-source"),
      /经用户编辑/,
      "safe History rollback restores the pre-write document snapshot",
    );
    assert.equal(
      await page.evaluate(() => window.PeakIntelligencePanel.controller("#ambient-panel").state.history[0].entries[0].originLabel),
      "系统回滚",
      "successful rollback records a visible system transaction",
    );
    assert.equal(
      await page.locator('[data-block-title="AI 旁路段落"]').evaluate((block) => document.activeElement === block),
      true,
      "successful rollback returns keyboard focus to the affected document block",
    );
    assert.deepEqual(errors, [], "index host review bridge has no console or page errors");
  } finally {
    await page.close();
  }
}

try {
  await assertAcceptanceFixture();
  const indexVersion = await assertDesktopEntrypoint("index");
  const labVersion = await assertDesktopEntrypoint("lab");
  assert.equal(indexVersion, labVersion, "index and intelligence-lab consume the exact same sidecar version");
  await assertNarrowDrawer("index");
  await assertNarrowDrawer("lab");
  await assertIndexHostReviewBridge();
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    screenshots: 0,
    acceptanceFixture: "adaptive/copilot/brief",
    entrypoints: Object.keys(entrypoints),
    sharedVersion: indexVersion,
    narrowViewport: "760x900",
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
