const surfaces = {
  image: {
    name: "ai-knowledge-workflow.png",
    path: "Assets / Research / ai-knowledge-workflow.png",
    icon: "#i-image",
    state: "Original protected · Save as new version",
    modes: ["View", "Edit", "Compare"],
    defaultMode: "view",
    contextTitle: "I can see this image",
    contextDetail: "Pixels · dimensions · visible text",
    headline: "Work with the image, not around it.",
    description: "Use lightweight transforms on the canvas. Bring AI in only for semantic changes or understanding.",
    scope: "Whole image",
    placeholder: "Ask about this image or propose a change…",
    actions: [
      ["Describe & extract text", "Understand layout, objects, and visible copy", "describe-image"],
      ["Remove the background", "Create a transparent-background candidate", "remove-background"],
      ["Remove or replace object", "Brush or select first, then generate a candidate", "remove-object"],
      ["Extend the frame", "Expand the canvas with generated surroundings", "extend-image"],
    ],
  },
  html: {
    name: "release-health.html",
    path: "Dashboards / Operations / release-health.html",
    icon: "#i-code",
    state: "Local preview · Scripts isolated",
    modes: ["Preview", "Edit", "Split"],
    defaultMode: "preview",
    contextTitle: "I can read the page and its source",
    contextDetail: "Rendered DOM · HTML/CSS · visible state",
    headline: "Preview first. Source one click away.",
    description: "Treat generated HTML as a living document or dashboard, while keeping execution isolated and explicit.",
    scope: "Rendered page + source",
    placeholder: "Ask about the page or propose an HTML change…",
    actions: [
      ["Explain this dashboard", "Summarize the visible state and important signals", "explain-html"],
      ["Change the selected section", "Propose a small HTML/CSS patch with live preview", "change-html"],
      ["Find interaction risks", "Inspect links, forms, scripts, and persistence needs", "audit-html"],
    ],
  },
  pdf: {
    name: "knowledge-work-ai-era.pdf",
    path: "Research / Reports / knowledge-work-ai-era.pdf",
    icon: "#i-file",
    state: "Read-only source · Notes can be materialized",
    modes: ["Read", "Annotations"],
    defaultMode: "read",
    contextTitle: "I can read all 18 pages",
    contextDetail: "Text · page geometry · source citations",
    headline: "Every answer returns to the page.",
    description: "The PDF stays the primary surface. AI answers carry page citations that jump back to exact evidence.",
    scope: "Entire PDF · page 1 visible",
    placeholder: "Ask a question across this PDF…",
    actions: [
      ["Summarize the document", "Key argument, evidence, and open questions", "summarize-pdf"],
      ["What is the central claim?", "Answer with exact page citations", "ask-pdf"],
      ["Turn highlights into a note", "Materialize a linked Markdown note", "materialize-pdf"],
    ],
  },
  code: {
    name: "index_pipeline.py",
    path: "src / search / index_pipeline.py",
    icon: "#i-code",
    state: "Lightweight edit · Execution requires permission",
    modes: ["Preview", "Edit", "Changes"],
    defaultMode: "preview",
    contextTitle: "I can read this source file",
    contextDetail: "Python · selected lines 12–13 · file references",
    headline: "A focused source editor, not another IDE.",
    description: "Read with syntax highlighting, make a small edit, and review the exact patch. Running code remains a separate permission boundary.",
    scope: "index_pipeline.py · lines 12–13",
    placeholder: "Explain or change the selected code…",
    actions: [
      ["Explain the selection", "Describe behavior, assumptions, and failure paths", "explain-selection"],
      ["Make this concurrent", "Propose a minimal, reviewable patch", "change-code"],
      ["Review this file", "Find correctness and maintainability risks", "review-code"],
    ],
  },
  canvas: {
    name: "peak-launch-system.canvas",
    path: "Planning / peak-launch-system.canvas",
    icon: "#i-layout",
    state: "Native Canvas · Autosaved",
    modes: ["Canvas", "Outline"],
    defaultMode: "canvas",
    contextTitle: "I can see the native Canvas selection",
    contextDetail: "3 cards · 2 edges · workflow card selected",
    headline: "AI sits beside Canvas; it does not redraw Canvas.",
    description: "Keep Obsidian cards, groups, edges, and controls intact. Peak proposes graph changes as reviewable candidates.",
    scope: "Selected media card + neighbors",
    placeholder: "Ask about this card or propose a connection…",
    actions: [
      ["Explain this neighborhood", "Use the selected card and connected context", "explain-canvas"],
      ["Suggest a missing connection", "Preview one ghost edge before accepting", "connect-canvas"],
      ["Create a brief from this group", "Materialize a linked Markdown document", "brief-canvas"],
    ],
  },
  excalidraw: {
    name: "source-to-candidate.excalidraw.md",
    path: "Diagrams / source-to-candidate.excalidraw.md",
    icon: "#i-pen",
    state: "Native Excalidraw · Autosaved",
    modes: ["Drawing", "Preview"],
    defaultMode: "drawing",
    contextTitle: "I can see the Excalidraw scene",
    contextDetail: "4 elements · Peak diamond selected",
    headline: "Keep the drawing tool native and recognizable.",
    description: "Excalidraw owns tools, properties, libraries, and scene editing. Peak adds contextual reasoning in the Composer sidecar.",
    scope: "Selected diamond + connected arrows",
    placeholder: "Ask about the diagram or propose a scene change…",
    actions: [
      ["Explain the diagram", "Summarize the flow and its missing assumptions", "explain-diagram"],
      ["Rewrite selected labels", "Propose clearer wording in the existing shapes", "rewrite-labels"],
      ["Tidy the layout", "Preview alignment and spacing changes", "tidy-diagram"],
    ],
  },
};

const appShell = document.querySelector(".app-shell");
const documentName = document.querySelector("#documentName");
const documentPath = document.querySelector("#documentPath");
const documentIconUse = document.querySelector("#documentIconUse");
const documentState = document.querySelector("#documentState");
const viewModes = document.querySelector("#viewModes");
const contextTitle = document.querySelector("#contextTitle");
const contextDetail = document.querySelector("#contextDetail");
const aiHeadline = document.querySelector("#aiHeadline");
const aiDescription = document.querySelector("#aiDescription");
const selectionScope = document.querySelector("#selectionScope");
const aiActions = document.querySelector("#aiActions");
const aiAnswer = document.querySelector("#aiAnswer");
const promptFile = document.querySelector("#promptFile");
const promptInput = document.querySelector("#promptInput");
const candidateReview = document.querySelector("#candidateReview");
const candidateTitle = document.querySelector("#candidateTitle");
const candidateDescription = document.querySelector("#candidateDescription");
const toast = document.querySelector("#workbenchToast");

let currentSurface = "image";
let currentMode = "view";
let toastTimer;

function iconMarkup() {
  return '<svg><use href="#i-sparkles"></use></svg>';
}

function setHash(surface) {
  if (window.location.hash === `#${surface}`) return;
  history.replaceState(null, "", `#${surface}`);
}

function renderModes(config) {
  viewModes.innerHTML = config.modes
    .map((mode) => {
      const key = mode.toLowerCase();
      const active = key === config.defaultMode ? " is-active" : "";
      return `<button class="${active.trim()}" data-view-mode="${key}">${mode}</button>`;
    })
    .join("");
}

function renderActions(config) {
  aiActions.innerHTML = config.actions
    .map(([title, detail, action]) => `
      <button class="ai-action" data-ai-action="${action}">
        ${iconMarkup()}
        <span><strong>${title}</strong><small>${detail}</small></span>
        <span>›</span>
      </button>
    `)
    .join("");
}

function selectSurface(surface, updateHash = true) {
  const config = surfaces[surface];
  if (!config) return;

  currentSurface = surface;
  currentMode = config.defaultMode;
  appShell.dataset.currentSurface = surface;
  appShell.dataset.viewMode = currentMode;
  documentName.textContent = config.name;
  documentPath.textContent = config.path;
  documentIconUse.setAttribute("href", config.icon);
  documentState.textContent = config.state;
  contextTitle.textContent = config.contextTitle;
  contextDetail.textContent = config.contextDetail;
  aiHeadline.textContent = config.headline;
  aiDescription.textContent = config.description;
  selectionScope.textContent = config.scope;
  promptFile.textContent = config.name;
  promptInput.placeholder = config.placeholder;
  promptInput.value = "";
  aiAnswer.hidden = true;
  candidateReview.hidden = true;

  document.querySelectorAll("[data-surface-tab]").forEach((button) => {
    const active = button.dataset.surfaceTab === surface;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".format-surface").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.surface === surface);
  });

  renderModes(config);
  renderActions(config);
  setMode(currentMode);
  if (updateHash) setHash(surface);
}

function setMode(mode) {
  currentMode = mode;
  appShell.dataset.viewMode = mode;
  viewModes.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewMode === mode);
  });
  document.querySelectorAll("[data-editable-source]").forEach((editor) => {
    const editable = editor.dataset.editableSource === currentSurface && (mode === "edit" || currentSurface === "html" && mode === "split");
    if (editable) editor.setAttribute("contenteditable", "plaintext-only");
    if (!editable) editor.removeAttribute("contenteditable");
  });
  if (currentSurface === "code" && mode === "edit") showToast("Lightweight editing enabled · source not saved yet");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2200);
}

function showAnswer(title, paragraphs) {
  aiAnswer.innerHTML = `<header>${iconMarkup()}${title}</header>${paragraphs.map((text) => `<p>${text}</p>`).join("")}`;
  aiAnswer.hidden = false;
  aiAnswer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showCandidate(title, description) {
  candidateTitle.textContent = title;
  candidateDescription.textContent = description;
  candidateReview.hidden = false;
}

function handleAiAction(action) {
  const understandingActions = new Set([
    "describe-image", "explain-html", "audit-html", "summarize-pdf", "ask-pdf",
    "explain-selection", "review-code", "explain-canvas", "brief-canvas", "explain-diagram",
  ]);

  if (action === "ask-pdf" || action === "summarize-pdf") {
    showAnswer("Answer with sources", [
      'The report argues that AI becomes most useful when it remains inside the user’s source workflow, not when it creates another disconnected destination. <button class="citation" data-citation-page="1">1 · p.1</button>',
      'It treats citations and candidate review as the two mechanisms that preserve trust while increasing actionability. <button class="citation" data-citation-page="3">2 · p.3</button>',
    ]);
    return;
  }

  if (action === "describe-image") {
    showAnswer("Image understanding", [
      "The image presents a left-to-right knowledge workflow: multiple sources converge into a Peak reasoning layer, then produce a reviewable output.",
      "Visible text is legible and can be copied into a note. No source pixels will change.",
    ]);
    return;
  }

  if (action === "explain-selection") {
    showAnswer("Selection explained", [
      "Lines 12–13 process changed sources sequentially. The behavior is easy to read, but a slow source delays every item behind it.",
      "A concurrent rewrite should define its failure policy before changing execution order.",
    ]);
    return;
  }

  if (understandingActions.has(action)) {
    showAnswer("Contextual answer", [
      `Peak used the current ${currentSurface} surface and its active selection—not a detached upload.`,
      "The source remains visible so you can verify the answer against the file.",
    ]);
    return;
  }

  const candidateCopy = {
    "remove-background": ["Transparent background ready", "Before/after preview · background removed · original protected"],
    "remove-object": ["Image candidate ready", "Before/after preview · selected object removed · original protected"],
    "extend-image": ["Expanded frame ready", "Generated surroundings extend the image by 18% on both sides"],
    "change-html": ["HTML patch ready", "3 lines changed · live preview updated · scripts remain isolated"],
    "materialize-pdf": ["Linked note ready", "Highlights and page citations will be written to a new Markdown note"],
    "change-code": ["Source patch ready", "5 lines changed · review in Changes · nothing executed"],
    "connect-canvas": ["Canvas edge proposed", "Preview one connection from Workflow to Launch brief"],
    "rewrite-labels": ["Label changes ready", "3 labels clarified inside existing Excalidraw elements"],
    "tidy-diagram": ["Scene layout ready", "Spacing and alignment changed; shapes and bindings preserved"],
  };
  const [title, description] = candidateCopy[action] || ["AI candidate ready", "Review the preview before it touches the source."];
  if (action === "change-code") setMode("changes");
  showCandidate(title, description);
  showAnswer("Candidate prepared", [description, "Accept, restore, or retry from the review bar over the source surface."]);
}

document.addEventListener("click", (event) => {
  const surfaceButton = event.target.closest("[data-surface-tab]");
  if (surfaceButton) {
    selectSurface(surfaceButton.dataset.surfaceTab);
    return;
  }

  const modeButton = event.target.closest("[data-view-mode]");
  if (modeButton) {
    setMode(modeButton.dataset.viewMode);
    return;
  }

  const imageTool = event.target.closest("[data-image-tool]");
  if (imageTool) {
    const tool = imageTool.dataset.imageTool;
    document.querySelectorAll("[data-image-tool]").forEach((button) => button.classList.toggle("is-active", button === imageTool));
    document.querySelector("#cropOverlay").hidden = tool !== "crop";
    showToast(`${imageTool.textContent.trim()} controls opened on canvas`);
    return;
  }

  const actionButton = event.target.closest("[data-ai-action]");
  if (actionButton) {
    handleAiAction(actionButton.dataset.aiAction);
    return;
  }

  const citation = event.target.closest("[data-citation-page]");
  if (citation) {
    const page = citation.dataset.citationPage;
    document.querySelectorAll("[data-pdf-page]").forEach((button) => button.classList.toggle("is-active", button.dataset.pdfPage === page));
    document.querySelector("#pdfPageNumber").textContent = page;
    document.querySelector("#pdfHighlight").scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(`Jumped to cited evidence · page ${page}`);
    return;
  }

  const pageButton = event.target.closest("[data-pdf-page]");
  if (pageButton) {
    const page = pageButton.dataset.pdfPage;
    document.querySelectorAll("[data-pdf-page]").forEach((button) => button.classList.toggle("is-active", button === pageButton));
    document.querySelector("#pdfPageNumber").textContent = page;
    showToast(`Page ${page} selected`);
    return;
  }

  const canvasNode = event.target.closest("[data-canvas-node]");
  if (canvasNode) {
    document.querySelectorAll("[data-canvas-node]").forEach((node) => node.classList.toggle("is-selected", node === canvasNode));
    selectionScope.textContent = `Selected ${canvasNode.dataset.canvasNode} card + neighbors`;
    showToast("Native Canvas selection connected to Intelligence");
    return;
  }

  const candidateAction = event.target.closest("[data-candidate]");
  if (candidateAction) {
    const action = candidateAction.dataset.candidate;
    if (action === "retry") {
      showToast("Generating another candidate…");
      return;
    }
    candidateReview.hidden = true;
    showToast(action === "accept" ? "Candidate accepted into this prototype state" : "Candidate restored; source unchanged");
  }
});

document.querySelector("#sendPrompt").addEventListener("click", () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    showToast("Write a question or requested change first");
    return;
  }
  showAnswer("Response", [
    `I used ${surfaces[currentSurface].name} and the current visible selection as context.`,
    `Your request: “${prompt}”`,
  ]);
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  document.querySelector("#sendPrompt").click();
});

window.addEventListener("hashchange", () => {
  const surface = window.location.hash.slice(1);
  if (surfaces[surface]) selectSurface(surface, false);
});

const initialSurface = window.location.hash.slice(1);
selectSurface(surfaces[initialSurface] ? initialSurface : "image", false);
