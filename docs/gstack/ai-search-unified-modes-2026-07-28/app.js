(() => {
  const MODES = ["search", "graph", "intelligence"];
  const MODE_LABELS = {
    search: "AI Search",
    graph: "AI Graph",
    intelligence: "Vault Intelligence",
  };

  const state = {
    surface: "ai",
    mode: "search",
    web: false,
    menuOpen: false,
    lastModeFocus: 0,
  };

  const byId = (id) => document.getElementById(id);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const body = document.body;
  const modal = byId("search-modal");
  const modalBody = byId("modal-body");
  const trigger = byId("ai-mode-trigger");
  const menu = byId("ai-mode-menu");
  const vaultTab = byId("vault-search-tab");
  const footerCount = byId("footer-count");
  const toast = byId("toast");
  let toastTimer = null;

  if (new URLSearchParams(window.location.search).get("embed") === "1") {
    body.classList.add("is-embedded");
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    })[character]);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function historyRow({
    kind,
    symbol,
    title,
    meta,
    time,
    badge,
    badgeClass = "",
    originSurface,
    originContext,
  }) {
    return `
      <button class="history-row" type="button" data-history-kind="${kind}">
        <span class="row-symbol ${kind}">${symbol}</span>
        <span class="row-main">
          <span class="row-title-line">
            <span class="row-title">${title}</span>
            ${badge ? `<span class="badge ${badgeClass}">${badge}</span>` : ""}
          </span>
          <span class="row-meta">${meta}</span>
          ${originSurface ? `
            <span class="row-origin">
              <span>Created in</span>
              <strong>${originSurface}</strong>
              ${originContext ? `<span aria-hidden="true">·</span><span class="origin-context">${originContext}</span>` : ""}
            </span>
          ` : ""}
        </span>
        <span class="row-time">${time}</span>
      </button>
    `;
  }

  function composer({ placeholder, action, web = false }) {
    return `
      <form class="composer-shell" id="workspace-composer">
        <input id="workspace-input" autocomplete="off" placeholder="${placeholder}" aria-label="${placeholder}">
        ${web ? `<button class="web-toggle" id="web-toggle" type="button" aria-pressed="${state.web}">Web ${state.web ? "on" : "off"}</button>` : ""}
        <button class="composer-action" type="submit">${action}</button>
      </form>
    `;
  }

  function renderAISearch() {
    modalBody.innerHTML = `
      <div class="content-shell">
        ${composer({
          placeholder: "Ask AI anything about your vault…",
          action: "Run",
          web: true,
        })}
        <div class="mode-intro">
          <div>
            <h3>Suggested for you</h3>
            <p>这里直接使用当前文档与最近上下文；没有第二层 “Vault Analysis” 模式。</p>
          </div>
        </div>
        <div class="suggestions" aria-label="AI Search suggestions">
          <button class="suggestion" type="button" data-suggestion="Summarize core insights about Peak Composer">
            <strong>Summarize core insights about</strong>
            <span>Peak Composer Visual Parity QA</span>
          </button>
          <button class="suggestion" type="button" data-suggestion="Overview and knowledge structure of this folder">
            <strong>Overview and knowledge structure</strong>
            <span>folder:/</span>
          </button>
          <button class="suggestion" type="button" data-suggestion="Find all notes related to this document">
            <strong>查找与当前文档相关的内容</strong>
            <span>doc:Peak Composer Visual Parity QA</span>
          </button>
          <button class="suggestion" type="button" data-suggestion="Deep analysis with improvement suggestions">
            <strong>Deep analysis with improvement suggestions</strong>
            <span>Uses the current document as context</span>
          </button>
        </div>
        <div class="list-heading">
          <div>
            <h3>Recent</h3>
            <p>AI Search 的历史继续留在原位置。</p>
          </div>
        </div>
        <div class="history-list" data-history-list>
          ${historyRow({ kind: "search", symbol: "AI", title: "我的英语学习相关内容", meta: "6 sources · Vault analysis", time: "5 days ago" })}
          ${historyRow({ kind: "search", symbol: "AI", title: "独立开发产品 idea 综合评价", meta: "15 sources · Vault analysis", time: "2 months ago" })}
          ${historyRow({ kind: "search", symbol: "AI", title: "Personal knowledge workflow gaps", meta: "9 sources · Web enabled", time: "2 months ago" })}
          ${historyRow({ kind: "search", symbol: "AI", title: "Deep analysis of 01-gate-self-conviction", meta: "2 sources · Vault analysis", time: "2 months ago" })}
        </div>
      </div>
    `;
    footerCount.textContent = "1,140 analyses";
    wireCurrentContent();
  }

  function renderAIGraph() {
    modalBody.innerHTML = `
      <div class="content-shell">
        ${composer({
          placeholder: "Describe the graph you want to create or update…",
          action: "Create graph",
          web: true,
        })}
        <div class="mode-intro">
          <div>
            <h3>AI Graph history</h3>
            <p>所有成功生成的 graph 都在这里自动持久化并可重开；不再有独立 Library。</p>
          </div>
        </div>
        <div class="history-list" data-history-list>
          ${historyRow({ kind: "graph", symbol: "G", title: "GraphRAG 概念与方法", meta: "24 nodes · 31 relations · 8 sources · v4", time: "12 min", badge: "3 need review", badgeClass: "review", originSurface: "AI Search", originContext: "query · GraphRAG 概念与方法" })}
          ${historyRow({ kind: "graph", symbol: "G", title: "AI 编辑器生态", meta: "48 nodes · 57 relations · 12 sources · v3", time: "2 days", badge: "2 sources changed", badgeClass: "review", originSurface: "File Atlas", originContext: "AI 编辑器生态调研.md" })}
          ${historyRow({ kind: "graph", symbol: "G", title: "PKM 证据地图", meta: "19 nodes · 22 relations · 6 sources · v6", time: "5 days", badge: "Reviewed", badgeClass: "good", originSurface: "Composer Copilot", originContext: "PKM 产品类别分析.md · 6 selected blocks" })}
          ${historyRow({ kind: "graph", symbol: "G", title: "Agent 能力演化时间线", meta: "32 nodes · 36 relations · 9 sources · v2", time: "3 hours", badge: "4 need review", badgeClass: "review", originSurface: "Chat Studio", originContext: "Agent Runtime project" })}
          ${historyRow({ kind: "graph", symbol: "G", title: "AI provider capability map", meta: "27 nodes · 34 relations · 7 sources · v1", time: "8 days", originSurface: "Vault Search", originContext: "query · AI provider capability" })}
        </div>
      </div>
    `;
    footerCount.textContent = "5 graphs";
    wireCurrentContent();
  }

  function renderVaultIntelligence() {
    modalBody.innerHTML = `
      <div class="content-shell">
        <div class="mode-intro">
          <div>
            <h3>Vault Intelligence</h3>
            <p>Vault graph、结构健康与 review history 都属于这个 workspace；选择模式不会自动运行扫描。</p>
          </div>
          <div class="inline-actions">
            <button class="secondary-action" type="button" data-review-action="quick">Quick review</button>
            <button class="composer-action" type="button" data-review-action="complete">Complete review</button>
          </div>
        </div>
        <div class="intel-summary" aria-label="Vault Intelligence summary">
          <article class="intel-card">
            <strong>Notes</strong>
            <b>3.8k</b>
            <span>1.4m indexed words</span>
          </article>
          <article class="intel-card">
            <strong>Communities</strong>
            <b>18</b>
            <span>42 detected hubs</span>
          </article>
          <article class="intel-card">
            <strong>Attention</strong>
            <b>11</b>
            <span>7 stale hubs · 4 structural holes</span>
          </article>
        </div>
        <div class="vault-intel-grid">
          <article class="vault-graph-card">
            <div class="list-heading compact">
              <div><h3>Vault graph overview</h3><p>Top hubs and current-note position</p></div>
            </div>
            <div class="vault-graph-stage" aria-label="Vault graph overview mock">
              <span class="vault-edge e1"></span><span class="vault-edge e2"></span><span class="vault-edge e3"></span><span class="vault-edge e4"></span>
              <button class="vault-node core" type="button">PKM</button>
              <button class="vault-node n1" type="button">Composer</button>
              <button class="vault-node n2" type="button">AI Search</button>
              <button class="vault-node n3" type="button">Agent Runtime</button>
              <button class="vault-node n4" type="button">Product Research</button>
              <span class="vault-node current">Current note</span>
            </div>
            <div class="bridge-list"><span>Bridge gap · Composer ↔ Search</span><span>Bridge gap · Research ↔ Runtime</span></div>
          </article>
          <article class="vault-hub-card">
            <div class="list-heading compact"><div><h3>Hubs</h3><p>Open a hub document</p></div></div>
            <button type="button">Peak Composer <span>126 notes</span></button>
            <button type="button">AI Search <span>84 notes</span></button>
            <button type="button">Agent Runtime <span>73 notes</span></button>
            <button type="button">Product research <span>61 notes</span></button>
            <small>7 stale hubs need review</small>
          </article>
        </div>
        <div class="list-heading">
          <div>
            <h3>Recent reviews</h3>
            <p>重开真实 Vault review record。</p>
          </div>
        </div>
        <div class="history-list" data-history-list>
          ${historyRow({ kind: "intelligence", symbol: "VI", title: "Weekly Vault review", meta: "Health · hubs · structural holes", time: "4 days", badge: "Reviewed", badgeClass: "good" })}
          ${historyRow({ kind: "intelligence", symbol: "VI", title: "PKM community freshness", meta: "3 stale hubs · 6 changed sources", time: "11 days", badge: "Needs review", badgeClass: "review" })}
          ${historyRow({ kind: "intelligence", symbol: "VI", title: "Orphans and weak bridges", meta: "19 findings · 8 suggested actions", time: "3 weeks" })}
        </div>
      </div>
    `;
    footerCount.textContent = "3 recent reviews";
    wireCurrentContent();
  }

  function renderVaultSearch() {
    modalBody.innerHTML = `
      <div class="content-shell">
        ${composer({
          placeholder: "Search files, headings, blocks, or properties…",
          action: "Search",
        })}
        <div class="mode-intro">
          <div>
            <h3>Vault Search</h3>
            <p>确定性找回保持独立，不和 AI mode 混在同一个下拉里。</p>
          </div>
        </div>
        <div class="history-list" data-history-list>
          ${historyRow({ kind: "search", symbol: "MD", title: "Peak Composer Visual Parity QA.md", meta: "B-2 · Product design · Updated today", time: "98%" })}
          ${historyRow({ kind: "search", symbol: "MD", title: "PKM 产品类别分析.md", meta: "Z-10 · Research · Updated 2 days ago", time: "91%" })}
          ${historyRow({ kind: "search", symbol: "PDF", title: "PKM-工具对比调研-2023.pdf", meta: "Research asset · 41 pages", time: "84%" })}
          ${historyRow({ kind: "search", symbol: "MD", title: "GraphRAG 调研笔记.md", meta: "Concepts · evidence · methods", time: "79%" })}
        </div>
      </div>
    `;
    footerCount.textContent = "4 results";
    wireCurrentContent();
  }

  function wireCurrentContent() {
    const form = byId("workspace-composer");
    const input = byId("workspace-input");
    const webToggle = byId("web-toggle");

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        input.focus();
        showToast("先输入你想完成的任务");
        return;
      }
      const action = state.surface === "vault"
        ? "Search"
        : state.mode === "graph"
          ? "AI Graph"
          : state.mode === "intelligence"
            ? "Vault Intelligence review"
            : "AI Search";
      showToast(`${action} 将使用 shared PromptInput 提交：${escapeHtml(query).slice(0, 48)}`);
    });

    webToggle?.addEventListener("click", () => {
      state.web = !state.web;
      webToggle.setAttribute("aria-pressed", String(state.web));
      webToggle.textContent = `Web ${state.web ? "on" : "off"}`;
      showToast(state.web ? "Web context 已显式开启" : "Web context 已关闭");
    });

    all("[data-suggestion]").forEach((item) => {
      item.addEventListener("click", () => {
        input.value = item.dataset.suggestion;
        input.focus();
      });
    });

    const rows = all("[data-history-list] .history-row");
    rows.forEach((row, index) => {
      row.addEventListener("click", () => {
        rows.forEach((item) => item.classList.remove("active"));
        row.classList.add("active");
        const title = row.querySelector(".row-title")?.textContent ?? "History item";
        if (state.mode === "graph" && state.surface === "ai") {
          showToast(`打开共享 Graph Detail：${title}`);
          return;
        }
        showToast(`重开历史：${title}`);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const next = rows[(index + direction + rows.length) % rows.length];
        next.focus();
      });
    });

    all("[data-review-action]").forEach((button) => {
      button.addEventListener("click", () => {
        showToast(`${button.dataset.reviewAction === "quick" ? "Quick" : "Complete"} Vault review 只在明确点击后启动`);
      });
    });
  }

  function render() {
    modal.dataset.activeSurface = state.surface;
    const onVault = state.surface === "vault";
    vaultTab.classList.toggle("active", onVault);
    vaultTab.setAttribute("aria-pressed", String(onVault));
    trigger.classList.toggle("active", !onVault);
    byId("ai-mode-trigger-label").textContent = MODE_LABELS[state.mode];

    all(".mode-option").forEach((option) => {
      const selected = option.dataset.mode === state.mode;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-selected", String(selected));
      option.querySelector(".mode-mark").textContent = selected ? "✓" : "";
    });

    if (onVault) {
      renderVaultSearch();
      return;
    }
    if (state.mode === "graph") {
      renderAIGraph();
      return;
    }
    if (state.mode === "intelligence") {
      renderVaultIntelligence();
      return;
    }
    renderAISearch();
  }

  function openMenu({ focusSelected = false } = {}) {
    state.menuOpen = true;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (!focusSelected) return;
    const selected = menu.querySelector(`[data-mode="${state.mode}"]`);
    selected?.focus();
    state.lastModeFocus = MODES.indexOf(state.mode);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    state.menuOpen = false;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  }

  function selectMode(mode, { announce = true } = {}) {
    state.surface = "ai";
    state.mode = mode;
    closeMenu();
    render();
    if (announce) showToast(`已切换到 ${MODE_LABELS[mode]}`);
  }

  function cycleMode(direction) {
    const current = MODES.indexOf(state.mode);
    const next = MODES[(current + direction + MODES.length) % MODES.length];
    selectMode(next);
    trigger.focus();
  }

  trigger.addEventListener("click", () => {
    if (state.menuOpen) {
      closeMenu({ restoreFocus: true });
      return;
    }
    openMenu();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu({ focusSelected: true });
  });

  vaultTab.addEventListener("click", () => {
    closeMenu();
    state.surface = "vault";
    render();
  });

  all(".mode-option").forEach((option, index) => {
    option.addEventListener("click", () => selectMode(option.dataset.mode));
    option.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const options = all(".mode-option");
      const nextIndex = (index + direction + options.length) % options.length;
      state.lastModeFocus = nextIndex;
      options[nextIndex].focus();
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!state.menuOpen) return;
    if (event.target.closest(".ai-mode-anchor")) return;
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    const editable = event.target.matches?.("input, textarea, [contenteditable='true']");

    if (event.key === "Escape" && state.menuOpen) {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.altKey && !editable && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      cycleMode(event.key === "ArrowDown" ? 1 : -1);
    }
  });

  byId("reset-demo").addEventListener("click", () => {
    state.surface = "ai";
    state.mode = "search";
    state.web = false;
    closeMenu();
    render();
    showToast("已恢复普通打开状态：AI Search");
  });

  render();
})();
