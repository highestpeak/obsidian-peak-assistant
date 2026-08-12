const totalDocuments = 4860;
const initialProcessed = 4102;
const initialElapsedSeconds = 18 * 60 + 4;

const documents = [
  { name: "Research synthesis.md", path: "Projects / Peak / Research", extension: "MD", size: "38 KB", chunks: 5 },
  { name: "Product launch checklist.md", path: "Projects / Peak / Launch", extension: "MD", size: "21 KB", chunks: 4 },
  { name: "Customer interview 08-10.pdf", path: "Inbox / Interviews", extension: "PDF", size: "1.8 MB", chunks: 12 },
  { name: "Architecture map.excalidraw.md", path: "Projects / Peak / Graph", extension: "EX", size: "96 KB", chunks: 7 },
  { name: "Reference architecture.png", path: "Research / Visuals", extension: "IMG", size: "684 KB", chunks: 9 },
  { name: "Model routing decisions.md", path: "System / Architecture", extension: "MD", size: "27 KB", chunks: 5 },
  { name: "Composer flow.excalidraw", path: "Projects / Peak / Composer", extension: "EX", size: "44 KB", chunks: 6 },
  { name: "Interview wall.jpg", path: "Research / Interviews", extension: "IMG", size: "312 KB", chunks: 8 },
  { name: "Ambient notes.md", path: "Daily / 2026 / August", extension: "MD", size: "14 KB", chunks: 3 },
  { name: "AI Graph experiments.md", path: "Labs / AI Graph", extension: "MD", size: "33 KB", chunks: 6 },
  { name: "Launch contract.pdf", path: "Projects / Peak / Launch", extension: "PDF", size: "1.1 MB", chunks: 7 },
  { name: "Knowledge garden.md", path: "Notes / Evergreen", extension: "MD", size: "19 KB", chunks: 4 },
  { name: "Scanned receipt.pdf", path: "Archive / Imports", extension: "PDF", size: "4.2 MB", chunks: 10, error: true },
];

const processingSteps = [
  { id: "read", label: "Read & extract text", weight: 12 },
  { id: "text", label: "Full-text index", weight: 12 },
  { id: "embedding", label: "Generate embeddings", weight: 35 },
  { id: "enrich", label: "Summary & tags", weight: 20 },
  { id: "relations", label: "Find relationships", weight: 14 },
  { id: "save", label: "Save index record", weight: 7 },
];

const state = {
  mode: "running",
  processed: initialProcessed,
  elapsedSeconds: initialElapsedSeconds,
  currentIndex: 0,
  stepIndex: 2,
  stepTick: 2,
  paused: false,
  speed: 63,
  speedHistory: [56, 58, 57, 61, 60, 64, 63, 66, 65],
  order: "recent",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);

function currentDocument() {
  const ordered = orderedDocuments();
  return ordered[state.currentIndex % ordered.length];
}

function orderedDocuments() {
  if (state.order === "vault") {
    return [...documents].sort((left, right) => left.name.localeCompare(right.name));
  }
  if (state.order === "folder") {
    return [...documents].sort((left, right) => {
      const folderOrder = left.path.localeCompare(right.path);
      if (folderOrder !== 0) return folderOrder;
      return left.name.localeCompare(right.name);
    });
  }
  return documents;
}

function currentStep() {
  return processingSteps[state.stepIndex];
}

function stepTicksRequired() {
  const document = currentDocument();
  if (currentStep().id === "embedding") return Math.max(3, document.chunks);
  if (currentStep().id === "enrich") return 3;
  if (currentStep().id === "relations") return 2;
  return 1;
}

function documentProgress() {
  const completedWeight = processingSteps
    .slice(0, state.stepIndex)
    .reduce((sum, step) => sum + step.weight, 0);
  const activeWeight = currentStep().weight * (state.stepTick / stepTicksRequired());
  return Math.min(99, Math.round(completedWeight + activeWeight));
}

function estimatedMinutes() {
  const remaining = totalDocuments - state.processed;
  return Math.max(1, Math.ceil(remaining / Math.max(state.speed, 1)));
}

function formatElapsed(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function completionIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>';
}

function currentIcon() {
  return '<span class="spinner"></span>';
}

function waitingIcon() {
  return '<span class="waiting-core"></span>';
}

function errorIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 17h.01" /></svg>';
}

function queueDocumentAt(relativeIndex) {
  const ordered = orderedDocuments();
  const index = (state.currentIndex + relativeIndex + ordered.length * 10) % ordered.length;
  return ordered[index];
}

function queueStatus(relativeIndex, document) {
  if (relativeIndex < 0) {
    return { className: "is-complete", title: "Complete", time: `${(1.1 + Math.abs(relativeIndex) * 0.35).toFixed(1)}s`, icon: completionIcon() };
  }
  if (relativeIndex === 0) {
    const percent = documentProgress();
    const step = currentStep();
    const title = step.id === "embedding"
      ? `Embeddings ${Math.min(state.stepTick, document.chunks)} / ${document.chunks}`
      : step.label;
    return { className: "is-current", title, time: "now", icon: currentIcon(), percent };
  }
  if (document.error && relativeIndex === 4) {
    return { className: "is-error", title: "Will retry", time: "—", icon: errorIcon() };
  }
  return { className: "is-waiting", title: relativeIndex === 1 ? "Up next" : "Waiting", time: "—", icon: waitingIcon() };
}

function renderQueue() {
  const relativeRows = [-3, -2, -1, 0, 1, 2, 3, 4];
  const rows = relativeRows.map((relativeIndex) => {
    const document = queueDocumentAt(relativeIndex);
    const status = queueStatus(relativeIndex, document);
    const sequence = state.processed + 1 + relativeIndex;
    const progressMarkup = status.percent
      ? `<span class="status-detail"><span style="width:${status.percent}%"></span></span>`
      : "";
    return `
      <div class="queue-row ${status.className}" data-queue-position="${sequence}">
        <span class="queue-number">${formatNumber(sequence)}</span>
        <span class="queue-document">
          <span class="queue-name">${document.name}</span>
          <span class="queue-path">${document.path}</span>
        </span>
        <span class="queue-status">
          <span class="status-icon">${status.icon}</span>
          <span class="status-copy">
            <span class="status-title">${status.title}</span>
            ${progressMarkup}
          </span>
        </span>
        <span class="queue-time">${status.time}</span>
      </div>`;
  }).join("");

  $("[data-queue-body]").innerHTML = rows;
}

function renderSubsteps() {
  processingSteps.forEach((step, index) => {
    const row = $(`[data-step="${step.id}"]`);
    const icon = row.querySelector(".substep-icon");
    const value = row.querySelector(".substep-value");
    row.classList.toggle("is-complete", index < state.stepIndex);
    row.classList.toggle("is-active", index === state.stepIndex);

    if (index < state.stepIndex) {
      icon.innerHTML = completionIcon();
      value.textContent = "Done";
      return;
    }
    if (index === state.stepIndex) {
      icon.innerHTML = currentIcon();
      const required = stepTicksRequired();
      value.textContent = step.id === "embedding"
        ? `${Math.min(state.stepTick, required)} / ${required}`
        : `${Math.round((state.stepTick / required) * 100)}%`;
      return;
    }
    icon.innerHTML = "";
    value.textContent = "Waiting";
  });
}

function renderCurrentDocument() {
  const document = currentDocument();
  const progress = documentProgress();
  $("[data-current-name]").textContent = document.name;
  $("[data-current-path]").textContent = document.path;
  $("[data-current-extension]").textContent = document.extension;
  $("[data-current-size]").textContent = document.size;
  $("[data-current-chunks]").textContent = `${document.chunks} chunks`;
  $("[data-current-position]").textContent = `${formatNumber(state.processed + 1)} / ${formatNumber(totalDocuments)}`;
  $("[data-document-progress]").style.width = `${progress}%`;
  $("[data-document-progress-label]").textContent = `${progress}%`;
  renderSubsteps();
}

function renderSparkline() {
  const width = 260;
  const height = 48;
  const min = Math.min(...state.speedHistory) - 2;
  const max = Math.max(...state.speedHistory) + 2;
  const range = Math.max(max - min, 1);
  const points = state.speedHistory.map((value, index) => {
    const x = (index / (state.speedHistory.length - 1)) * width;
    const y = 44 - ((value - min) / range) * 34;
    return [Math.round(x), Math.round(y)];
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  $("[data-spark-path]").setAttribute("d", line);
  $("[data-spark-area]").setAttribute("d", area);
}

function renderMetrics() {
  const percent = ((state.processed / totalDocuments) * 100).toFixed(1);
  const remaining = totalDocuments - state.processed;
  const metricLabels = $$(".metric-label");
  ["estimated remaining", "current speed", "elapsed", "documents left"].forEach((label, index) => {
    metricLabels[index].textContent = label;
  });
  $("[data-processed-count]").textContent = formatNumber(state.processed);
  $("[data-completed-today]").textContent = formatNumber(state.processed);
  $("[data-overall-progress]").textContent = `${percent}%`;
  $("[data-progress-fill]").style.width = `${percent}%`;
  $("[data-speed]").textContent = `${state.speed} docs/min`;
  $("[data-speed-compact]").textContent = `${state.speed}/min`;
  $("[data-eta]").textContent = `${estimatedMinutes()} min`;
  $("[data-elapsed]").textContent = formatElapsed(state.elapsedSeconds);
  $("[data-remaining]").textContent = formatNumber(remaining);
  $("[data-stage-progress]").textContent = `${formatNumber(state.processed)} complete`;
  const previousSpeed = state.speedHistory[state.speedHistory.length - 2] || state.speed;
  const delta = state.speed - previousSpeed;
  $("[data-speed-trend]").textContent = Math.abs(delta) <= 1 ? "steady" : delta > 0 ? "speeding up" : "slowing slightly";

  if (state.mode !== "complete") return;
  $("[data-run-status]").textContent = "Complete";
  $("[data-active-phase]").textContent = "Search ready · 2 files need attention";
  $("[data-eta]").textContent = "Ready";
  $("[data-speed]").textContent = "Just now";
  $("[data-speed-compact]").textContent = "—";
  $("[data-elapsed]").textContent = "31m 02s";
  $("[data-remaining]").textContent = "0";
  ["search status", "run finished", "total time", "documents left"].forEach((label, index) => {
    metricLabels[index].textContent = label;
  });
}

function renderAll() {
  document.body.dataset.indexState = state.mode;
  document.body.classList.toggle("is-paused", state.paused);
  $("[data-pause-label]").textContent = state.paused ? "Resume" : "Pause";
  $("[data-run-status]").textContent = state.paused ? "Paused" : "Indexing";
  $("[data-page-title]").textContent = state.mode === "setup"
    ? "Build your knowledge index"
    : state.mode === "complete"
      ? "Your knowledge index is ready"
      : "Preparing your vault";
  $("[data-page-subtitle]").textContent = state.mode === "setup"
    ? "Choose what Peak should scan. Your saved files are never changed by indexing."
    : state.mode === "complete"
      ? "Search can use full text and semantic knowledge across the indexed Vault."
      : "Search is already available. Peak is enriching the rest of your notes in the background.";
  renderMetrics();
  if (state.mode !== "running") return;
  renderCurrentDocument();
  renderQueue();
  renderSparkline();
}

function finishCurrentDocument() {
  state.processed = Math.min(totalDocuments, state.processed + 1);
  state.currentIndex = (state.currentIndex + 1) % documents.length;
  state.stepIndex = 0;
  state.stepTick = 1;
}

function advanceSimulation() {
  if (state.mode !== "running" || state.paused || state.processed >= totalDocuments) return;
  state.elapsedSeconds += 2;
  state.stepTick += 1;

  if (state.stepTick > stepTicksRequired()) {
    state.stepIndex += 1;
    state.stepTick = 1;
  }
  if (state.stepIndex >= processingSteps.length) finishCurrentDocument();

  const speedDelta = Math.floor(Math.random() * 5) - 2;
  state.speed = Math.max(54, Math.min(71, state.speed + speedDelta));
  state.speedHistory.push(state.speed);
  state.speedHistory = state.speedHistory.slice(-9);
  renderAll();
}

function startSimulation() {
  window.clearInterval(window.__peakIndexTimer);
  window.__peakIndexTimer = window.setInterval(advanceSimulation, 1300);
}

function setIndexMode(mode, options = {}) {
  state.mode = mode;
  const freshRun = mode === "running" && options.fresh === true;
  state.processed = mode === "complete" ? totalDocuments : mode === "setup" ? 0 : freshRun ? 48 : initialProcessed;
  state.elapsedSeconds = mode === "complete" ? 31 * 60 + 2 : mode === "setup" ? 0 : freshRun ? 34 : initialElapsedSeconds;
  state.currentIndex = 0;
  state.stepIndex = freshRun ? 0 : 2;
  state.stepTick = freshRun ? 1 : 2;
  state.paused = false;
  state.speed = 63;
  state.speedHistory = [56, 58, 57, 61, 60, 64, 63, 66, 65];
  state.order = "recent";
  $("[data-order-select]").value = "recent";
  $$('[data-preview-state]').forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.previewState === mode);
  });
  toggleIndexSetup(mode === "setup");
  renderAll();
}

function resetSimulation() {
  setIndexMode("running");
}

function toggleFileTypes(forceOpen) {
  const panel = $("[data-file-types-panel]");
  const trigger = $("[data-file-types-trigger]");
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : panel.hidden;
  panel.hidden = !shouldOpen;
  trigger.setAttribute("aria-expanded", String(shouldOpen));
}

function setActiveFileType(typeKey) {
  const chart = $(".file-types-donut");
  chart.classList.toggle("has-active", Boolean(typeKey));
  $$('[data-type-segment]').forEach((segment) => {
    segment.classList.toggle("is-active", segment.dataset.typeSegment === typeKey);
  });
  $$('[data-type-row]').forEach((row) => {
    row.classList.toggle("is-active", row.dataset.typeRow === typeKey);
  });
}

$("[data-pause]").addEventListener("click", () => {
  state.paused = !state.paused;
  renderAll();
});

$("[data-restart-demo]").addEventListener("click", resetSimulation);

$("[data-file-types-trigger]").addEventListener("click", (event) => {
  event.stopPropagation();
  toggleFileTypes();
});

$("[data-file-types-close]").addEventListener("click", () => toggleFileTypes(false));

$("[data-file-types-panel]").addEventListener("click", (event) => event.stopPropagation());

document.addEventListener("click", () => toggleFileTypes(false));

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  toggleFileTypes(false);
  toggleIndexSetup(false);
});

$$('[data-type-segment], [data-type-row]').forEach((element) => {
  const typeKey = element.dataset.typeSegment || element.dataset.typeRow;
  element.addEventListener("mouseenter", () => setActiveFileType(typeKey));
  element.addEventListener("mouseleave", () => setActiveFileType(null));
  element.addEventListener("focus", () => setActiveFileType(typeKey));
  element.addEventListener("blur", () => setActiveFileType(null));
});

$("[data-skip-current]").addEventListener("click", () => {
  finishCurrentDocument();
  renderAll();
});

$("[data-order-select]").addEventListener("change", (event) => {
  state.order = event.target.value;
  state.stepIndex = 0;
  state.stepTick = 1;
  renderAll();
});

let selectedIndexDepth = "Semantic";

const indexDepthPresets = {
  Fast: {
    kicker: "FAST INDEX",
    title: "Find exact words and phrases quickly",
    description: "Peak builds full-text search and skips AI processing.",
    estimate: "About 5 min",
    recommendation: "Fastest",
    capabilities: [["Text", true], ["Meaning", false], ["Summaries", false], ["Relations", false]],
  },
  Semantic: {
    kicker: "SEMANTIC INDEX",
    title: "Search by meaning, not only exact words",
    description: "Peak adds embeddings to full-text search.",
    estimate: "About 18 min",
    recommendation: "Recommended",
    capabilities: [["Text", true], ["Meaning", true], ["Summaries", false], ["Relations", false]],
  },
  "Full knowledge": {
    kicker: "FULL KNOWLEDGE",
    title: "Connect documents into reusable knowledge",
    description: "Peak also generates summaries, tags and relationship signals.",
    estimate: "About 31 min",
    recommendation: "Most complete",
    capabilities: [["Text", true], ["Meaning", true], ["Summaries", true], ["Relations", true]],
  },
};

function updateDepthOutcome(depth) {
  const preset = indexDepthPresets[depth];
  $("[data-depth-kicker]").textContent = preset.kicker;
  $("[data-depth-title]").textContent = preset.title;
  $("[data-depth-description]").textContent = preset.description;
  $("[data-depth-estimate]").textContent = preset.estimate;
  $("[data-depth-recommendation]").textContent = preset.recommendation;
  $("[data-depth-capabilities]").innerHTML = preset.capabilities
    .map(([label, enabled]) => `<span class="${enabled ? "is-on" : ""}">${label}</span>`)
    .join("");
}

function toggleIndexSetup(open) {
  const setup = $("[data-index-setup]");
  if (!setup) return;
  setup.classList.toggle("is-open", open);
  const content = $("[data-index-setup-content]");
  content.toggleAttribute("inert", !open);
  content.setAttribute("aria-hidden", String(!open));
  $(".setup-summary", setup).setAttribute("aria-expanded", String(open));
  $("[data-setup-summary-action]").textContent = open ? "Collapse" : state.mode === "complete" ? "Run again" : state.mode === "setup" ? "Setup required" : "Configure next run";
  $("[data-setup-summary-title]").textContent = state.mode === "complete" ? "Last run complete · Semantic" : state.mode === "setup" ? "Set up your first index" : "Current run · Semantic";
  $("[data-setup-summary-detail]").textContent = state.mode === "setup"
    ? "Choose a run depth and confirm what Peak may scan"
    : "4 file types · whole Vault · run choices can change without changing long-term Settings";
  if (open) toggleFileTypes(false);
}

$$('[data-open-index-setup]').forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const isSummary = button.classList.contains("setup-summary");
    toggleIndexSetup(isSummary ? !$("[data-index-setup]").classList.contains("is-open") : true);
  });
});

$$('[data-close-index-setup]').forEach((button) => {
  button.addEventListener("click", () => toggleIndexSetup(false));
});

$$('[data-index-depth]').forEach((button) => {
  button.addEventListener("click", () => {
    $$('[data-index-depth]').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    selectedIndexDepth = button.dataset.indexDepth;
    $("[data-next-run-summary]").textContent = `Ready to start · ${selectedIndexDepth}`;
    updateDepthOutcome(selectedIndexDepth);
  });
});

$$('.document-type-chips button:not(:disabled)').forEach((button) => {
  button.addEventListener("click", () => button.classList.toggle("is-selected"));
});

$("[data-save-index-setup]").addEventListener("click", () => {
  const button = $("[data-save-index-setup]");
  button.textContent = "Starting…";
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = "Start indexing";
    button.disabled = false;
    setIndexMode("running", { fresh: true });
    toggleIndexSetup(false);
    $("[data-index-setup]").scrollIntoView({ behavior: "smooth", block: "start" });
  }, 480);
});

$$('[data-preview-state]').forEach((button) => {
  button.addEventListener("click", () => setIndexMode(button.dataset.previewState));
});

$$('[data-search-vault]').forEach((button) => {
  button.addEventListener("click", () => {
    const original = button.textContent;
    button.textContent = "Opening Vault Search…";
    window.setTimeout(() => { button.textContent = original; }, 800);
  });
});

$("[data-run-again]").addEventListener("click", () => {
  toggleIndexSetup(true);
  $("[data-index-setup]").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("[data-retry-failed]").addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.textContent = "Retry queued";
  button.disabled = true;
});

$("[data-open-file-scope]").addEventListener("click", () => {
  toggleIndexSetup(true);
  $("[data-index-setup]").scrollIntoView({ behavior: "smooth", block: "start" });
});

startSimulation();
updateDepthOutcome(selectedIndexDepth);
setIndexMode(window.location.hash === "#complete" ? "complete" : "running");
if (window.location.hash === "#setup") toggleIndexSetup(true);
