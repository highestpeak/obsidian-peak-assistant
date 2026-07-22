(function () {
  "use strict";

  const app = document.getElementById("composer-app");
  const panel = document.querySelector("[data-intelligence-root]");
  const paper = document.getElementById("paper");
  const toggle = document.getElementById("ambient-toggle");
  const sourcebarContext = document.getElementById("sourcebar-context");
  const bottomSource = document.getElementById("bottom-source");
  const intelligence = window.PeakIntelligencePanel;

  if (!app || !panel || !paper || !toggle || !intelligence) return;

  intelligence.mount(panel);

  let currentBlock = paper.querySelector(".doc-block.is-active") || paper.querySelector(".doc-block");
  let candidateSequence = 0;
  let reviewPreview = null;

  const BLOCK_ALIASES = new Map([
    ["文档标题", "title"],
    ["章节标题", "title"],
    ["Composer 定位段落", "positioning"],
    ["知识库结构段落", "structure"],
    ["知识结构列表", "structure-list"],
    ["AI 旁路段落", "ai-sidecar"],
  ]);

  function blockContext(block) {
    return {
      id: block?.dataset.blockId || "document",
      title: block?.dataset.blockTitle || "当前文档",
      kind: block?.dataset.blockKind || "markdown",
      source: block?.dataset.source || block?.textContent.trim() || "",
    };
  }

  function syncContext(block) {
    if (!block) return;
    currentBlock = block;
    paper.querySelectorAll(".doc-block.is-active").forEach((item) => {
      item.classList.toggle("is-active", item === block);
    });

    const context = blockContext(block);
    sourcebarContext.textContent = `当前块 · ${context.title}`;
    bottomSource.textContent = context.source.replace(/\s+/g, " ").trim();
    intelligence.updateContext(context, panel);
  }

  function blockForTarget(target = "") {
    const normalized = String(target).split("·")[0].trim();
    const id = BLOCK_ALIASES.get(normalized);
    if (id) return paper.querySelector(`[data-block-id="${id}"]`);
    return Array.from(paper.querySelectorAll(".doc-block")).find((block) => (
      normalized.includes(block.dataset.blockTitle || "")
      || (block.dataset.blockTitle || "").includes(normalized)
    )) || currentBlock;
  }

  function clearReviewPreview() {
    reviewPreview?.remove();
    reviewPreview = null;
    paper.querySelectorAll(".doc-block.is-review-target, .doc-block.is-history-target").forEach((block) => {
      block.classList.remove("is-review-target", "is-history-target");
      block.removeAttribute("data-review-status");
    });
  }

  function locateBlock(block, className = "is-review-target") {
    if (!block) return;
    paper.querySelectorAll(`.doc-block.${className}`).forEach((item) => item.classList.remove(className));
    block.classList.add(className);
    if (!block.hasAttribute("tabindex")) block.tabIndex = -1;
    block.focus({ preventScroll: true });
    block.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderReviewLocation(change, index = 0, total = 1) {
    const block = blockForTarget(change?.target);
    if (!block || !change) return;
    clearReviewPreview();
    syncContext(block);
    locateBlock(block);

    const preview = document.createElement("aside");
    const header = document.createElement("header");
    const count = document.createElement("strong");
    const status = document.createElement("small");
    const diff = document.createElement("div");
    const before = document.createElement("del");
    const after = document.createElement("ins");

    preview.className = "lab-review-preview";
    preview.setAttribute("contenteditable", "false");
    preview.dataset.changeId = change.id || "review-change";
    preview.dataset.status = change.status || "pending";
    count.textContent = `候选改动 ${index + 1} / ${total}`;
    status.textContent = change.status === "accepted" ? "已接受" : change.status === "rejected" ? "已拒绝" : "待审阅 · 尚未写入";
    before.textContent = change.before || "";
    after.textContent = change.after || "";
    diff.className = "lab-inline-diff";
    diff.append(before, document.createTextNode(" "), after);
    header.append(count, status);
    preview.append(header, diff);
    block.append(preview);
    block.dataset.reviewStatus = change.status || "pending";
    reviewPreview = preview;
    sourcebarContext.textContent = `审阅 ${index + 1} / ${total} · ${change.target}`;
    bottomSource.textContent = `${change.before || ""} → ${change.after || ""}`;
  }

  function applyReviewDecision(detail = {}) {
    if (detail.action === "accept-all" && Array.isArray(detail.changes)) {
      const accepted = detail.changes.filter((change) => change.status === "accepted").length;
      intelligence.notify("本轮改动已处理", `${accepted} 处已接受`, panel);
      if (reviewPreview) {
        reviewPreview.dataset.status = "accepted";
        reviewPreview.querySelector("small").textContent = "已接受 · 已写入事务记录";
      }
      return;
    }

    const change = detail.change;
    if (!change) return;
    const block = blockForTarget(change.target);
    if (reviewPreview?.dataset.changeId === change.id) {
      reviewPreview.dataset.status = change.status;
      const status = reviewPreview.querySelector("small");
      if (status) status.textContent = change.status === "rejected" ? "已拒绝 · 原文保留" : "已接受 · 已写入事务记录";
    }
    if (block) block.dataset.reviewStatus = change.status;
    intelligence.notify(
      change.status === "rejected" ? "已拒绝这处候选" : "已接受这处候选",
      change.target,
      panel,
    );
  }

  function setDrawerOpen(open, options = {}) {
    intelligence.setOpen(open, panel, {
      restoreFocus: options.restoreFocus !== false,
    });
  }

  function createCandidate(prompt) {
    if (!currentBlock) return;
    currentBlock.querySelectorAll(":scope > .lab-pending-candidate").forEach((candidate) => candidate.remove());

    candidateSequence += 1;
    const context = blockContext(currentBlock);
    const candidate = document.createElement("aside");
    const header = document.createElement("header");
    const title = document.createElement("strong");
    const state = document.createElement("small");
    const body = document.createElement("p");

    candidate.className = "lab-review-candidate lab-pending-candidate";
    candidate.dataset.candidateId = `lab-candidate-${candidateSequence}`;
    candidate.setAttribute("contenteditable", "false");
    candidate.setAttribute("aria-label", "Copilot 原位候选，待审阅");

    title.textContent = "Copilot 候选";
    state.textContent = "待审阅 · 尚未写入 Markdown";
    body.textContent = `根据“${prompt}”生成的候选已锚定到「${context.title}」。接受或拒绝之前，原文保持不变。`;

    header.append(title, state);
    candidate.append(header, body);
    currentBlock.append(candidate);
    currentBlock.classList.add("has-pending-candidate");
    sourcebarContext.textContent = `候选待审 · ${context.title}`;
    intelligence.notify("候选已回到正文", `${context.title} · 等待审阅`, panel);
  }

  function handleBlockIntent(event) {
    const block = event.target.closest(".doc-block");
    if (!block || !paper.contains(block)) return;
    syncContext(block);
  }

  paper.addEventListener("click", handleBlockIntent);
  paper.addEventListener("focusin", handleBlockIntent);

  toggle.addEventListener("click", () => {
    setDrawerOpen(!app.classList.contains("ambient-open"), { restoreFocus: false });
  });

  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-intelligence-close]");
    if (!close || panel.contains(close)) return;
    setDrawerOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !app.classList.contains("ambient-open")) return;
    if (panel.querySelector("dialog[open]")) return;
    setDrawerOpen(false);
  });

  document.addEventListener("peak:intelligence-submit", (event) => {
    const prompt = event.detail?.prompt?.trim();
    if (!prompt) return;
    createCandidate(prompt);
  });

  document.addEventListener("peak:intelligence-stage", (event) => {
    if (event.detail?.stage === "review") return;
    clearReviewPreview();
  });

  document.addEventListener("peak:intelligence-review-location", (event) => {
    renderReviewLocation(event.detail?.change, event.detail?.index, event.detail?.total);
  });

  document.addEventListener("peak:intelligence-review-action", (event) => {
    applyReviewDecision(event.detail);
  });

  document.addEventListener("peak:intelligence-history-locate", (event) => {
    const entry = event.detail?.entry;
    const block = blockForTarget(entry?.target);
    if (!block) return;
    clearReviewPreview();
    syncContext(block);
    locateBlock(block, "is-history-target");
    sourcebarContext.textContent = `历史定位 · ${entry?.title || block.dataset.blockTitle}`;
    intelligence.notify("已定位历史写入", entry?.target || block.dataset.blockTitle, panel);
  });

  document.addEventListener("peak:intelligence-history-rollback", (event) => {
    event.preventDefault();
    const entry = event.detail?.entry;
    const block = blockForTarget(entry?.target);
    if (!block) return;
    locateBlock(block, "is-history-target");
    block.dataset.rollbackRequested = "true";
    sourcebarContext.textContent = `回滚待确认 · ${entry?.title || block.dataset.blockTitle}`;
    intelligence.notify("独立调试入口不执行回滚", "请在主 Composer mock 中验证安全快照与回滚事务", panel);
  });

  document.addEventListener("peak:intelligence-open-source", (event) => {
    const source = event.detail?.source;
    if (!source) return;
    sourcebarContext.textContent = `来源 · ${source.title}`;
    bottomSource.textContent = source.path || source.reason || "Vault 来源";
  });

  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("mode");
  const requestedStage = params.get("stage");
  const initialMode = ["copilot", "history"].includes(requestedMode) ? requestedMode : "copilot";
  const initialStage = ["brief", "session", "review"].includes(requestedStage) ? requestedStage : "brief";

  syncContext(currentBlock);
  intelligence.setMode(initialMode, panel);
  if (initialMode === "copilot") intelligence.setStage(initialStage, panel, { focusComposer: false });
  setDrawerOpen(true, { restoreFocus: false });
})();
