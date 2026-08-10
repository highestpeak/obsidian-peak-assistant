const surfaces = {
  image: {
    name: "ai-knowledge-workflow.png",
    path: "Assets / Research / ai-knowledge-workflow.png",
    icon: "#i-image",
    state: "Original protected · Save as new version",
    contextTitle: "I can see this image",
    contextDetail: "Pixels · dimensions · visible text",
    headline: "Direct tools on the canvas. AI actions beside it.",
    description: "Crop, rotate, resize, and compress directly on the canvas. Semantic edits create a reviewable version.",
    scope: "Whole image",
    placeholder: "Ask about this image or propose a change…",
    actions: [
      ["Describe & extract text", "Understand layout, objects, and visible copy", "describe-image"],
      ["Remove the background", "Create a transparent-background version", "remove-background"],
      ["Remove or replace object", "Select an object, then generate a candidate", "remove-object"],
      ["Extend the frame", "Generate surrounding pixels beyond the edge", "extend-image"],
    ],
  },
  html: {
    name: "release-health.html",
    path: "Dashboards / Operations / release-health.html",
    icon: "#i-code",
    state: "Interactive preview · Scripts isolated",
    contextTitle: "I can read the page and its source",
    contextDetail: "Rendered DOM · HTML/CSS · visible state",
    headline: "The page stays visible while you work on it.",
    description: "Select an element or open its source locally. AI changes appear while the live page remains visible.",
    scope: "Rendered page + source",
    placeholder: "Ask about the page or change the selected element…",
    actions: [
      ["Explain this dashboard", "Summarize the visible state and important signals", "explain-html"],
      ["Change the selected element", "Update copy, style, or structure in place", "change-html"],
      ["Repair the layout", "Find overflow, spacing, and responsive problems", "repair-html"],
      ["Review interaction & data", "Check scripts, clicks, and persistence needs", "audit-html"],
    ],
  },
  pdf: {
    name: "knowledge-work-ai-era.pdf",
    path: "Research / Reports / knowledge-work-ai-era.pdf",
    icon: "#i-file",
    state: "Read-only source · Linked notes available",
    contextTitle: "I can read all 18 pages",
    contextDetail: "Text · page geometry · source citations",
    headline: "Ask, cite, and return to the exact page.",
    description: "The PDF remains the reading surface. Every factual answer carries a page citation; derived work becomes a linked note.",
    scope: "Entire PDF · page 1 visible",
    placeholder: "Ask a question across this PDF…",
    actions: [
      ["Summarize the document", "Key argument, evidence, and open questions", "summarize-pdf"],
      ["Ask with page citations", "Answer and jump back to exact evidence", "ask-pdf"],
      ["Explain or translate selection", "Use the selected passage and its page", "translate-pdf"],
      ["Extract to a linked note", "Keep highlights, tables, and page references", "materialize-pdf"],
    ],
  },
  code: {
    name: "index_pipeline.py",
    path: "src / search / index_pipeline.py",
    icon: "#i-code",
    state: "Editable now · Execution requires permission",
    contextTitle: "I can read the current source file",
    contextDetail: "Python · current selection · related Vault files",
    headline: "Type directly. Ask AI only when it helps.",
    description: "Read, type, and save in the highlighted source editor. AI suggestions stay attached to the active selection.",
    scope: "index_pipeline.py · current selection",
    placeholder: "Explain or change the selected code…",
    actions: [
      ["Explain the selection", "Describe behavior, assumptions, and failure paths", "explain-selection"],
      ["Change the selection", "Prepare one focused suggestion beside the source", "change-code"],
      ["Fix a problem", "Propose a small correction without running code", "fix-code"],
      ["Review this file", "Find correctness and maintainability risks", "review-code"],
    ],
  },
  canvas: {
    name: "peak-launch-system.canvas",
    path: "Planning / peak-launch-system.canvas",
    icon: "#i-layout",
    state: "Native Canvas · Autosaved",
    contextTitle: "I can see the native Canvas selection",
    contextDetail: "3 cards · 2 edges · workflow card selected",
    headline: "Canvas stays native. Intelligence follows selection.",
    description: "Select cards, create objects, and zoom on the canvas itself. Peak explains or proposes graph changes from the sidecar.",
    scope: "Selected media card + neighbors",
    placeholder: "Ask about this card or propose a connection…",
    actions: [
      ["Explain this neighborhood", "Use the selected card and connected context", "explain-canvas"],
      ["Suggest a missing connection", "Preview one edge before accepting it", "connect-canvas"],
      ["Create cards from a note", "Draft native Canvas cards in this group", "create-canvas-cards"],
      ["Create a brief from this group", "Materialize a linked Markdown document", "brief-canvas"],
    ],
  },
  excalidraw: {
    name: "source-to-candidate.excalidraw.md",
    path: "Diagrams / source-to-candidate.excalidraw.md",
    icon: "#i-pen",
    state: "Native Excalidraw · Autosaved",
    contextTitle: "I can see the Excalidraw scene",
    contextDetail: "4 elements · Peak diamond selected",
    headline: "Draw natively. Use AI on the active scene.",
    description: "Excalidraw owns tools, properties, libraries, and editing. Peak adds explanations and scene suggestions in Intelligence.",
    scope: "Selected diamond + connected arrows",
    placeholder: "Ask about the diagram or propose a scene change…",
    actions: [
      ["Explain the diagram", "Summarize the flow and missing assumptions", "explain-diagram"],
      ["Generate from a prompt", "Add native shapes and bound arrows", "generate-diagram"],
      ["Rewrite selected labels", "Clarify wording inside existing elements", "rewrite-labels"],
      ["Tidy the selection", "Preview alignment and spacing changes", "tidy-diagram"],
    ],
  },
};

const appShell = document.querySelector(".app-shell");
const documentName = document.querySelector("#documentName");
const documentPath = document.querySelector("#documentPath");
const documentIconUse = document.querySelector("#documentIconUse");
const documentState = document.querySelector("#documentState");
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
let pendingCandidateAction = "";
let htmlSourceOpen = false;
let htmlPicking = false;
let imageRotation = 0;
let imageScale = 1;
let imageResizeIndex = 1;
let pdfZoom = 112;
let canvasZoom = 84;
let excalZoom = 72;
let toastTimer;

function iconMarkup() {
  return '<svg><use href="#i-sparkles"></use></svg>';
}

function setHash(surface) {
  if (window.location.hash === `#${surface}`) return;
  history.replaceState(null, "", `#${surface}`);
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

function setDirty(message) {
  documentState.textContent = message;
  document.querySelector(".state-dot").classList.add("is-dirty");
}

function setClean(message) {
  documentState.textContent = message;
  document.querySelector(".state-dot").classList.remove("is-dirty");
}

function selectSurface(surface, updateHash = true) {
  const config = surfaces[surface];
  if (!config) return;

  currentSurface = surface;
  appShell.dataset.currentSurface = surface;
  documentName.textContent = config.name;
  documentPath.textContent = config.path;
  documentIconUse.setAttribute("href", config.icon);
  setClean(config.state);
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
  pendingCandidateAction = "";

  document.querySelectorAll("[data-surface-tab]").forEach((button) => {
    const active = button.dataset.surfaceTab === surface;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".format-surface").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.surface === surface);
  });

  renderActions(config);
  if (updateHash) setHash(surface);
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

function showCandidate(action, title, description) {
  pendingCandidateAction = action;
  candidateTitle.textContent = title;
  candidateDescription.textContent = description;
  candidateReview.hidden = false;
}

function updateImageTransform() {
  const image = document.querySelector("#imageFrame img");
  image.style.transform = `rotate(${imageRotation}deg) scale(${imageScale})`;
  document.querySelector("#imageScaleLabel").textContent = `${Math.round(imageScale * 100)}%`;
}

function handleImageTool(tool, button) {
  const cropOverlay = document.querySelector("#cropOverlay");
  if (tool === "crop") {
    cropOverlay.hidden = !cropOverlay.hidden;
    button.classList.toggle("is-active", !cropOverlay.hidden);
    showToast(cropOverlay.hidden ? "Crop handles closed" : "Drag the crop handles on the image");
    return;
  }
  cropOverlay.hidden = true;
  document.querySelector('[data-image-tool="crop"]').classList.remove("is-active");

  if (tool === "rotate") {
    imageRotation = (imageRotation + 90) % 360;
    updateImageTransform();
    setDirty(`Rotated ${imageRotation}° · not saved`);
    return;
  }
  if (tool === "resize") {
    const sizes = [0.9, 1, 1.1];
    imageResizeIndex = (imageResizeIndex + 1) % sizes.length;
    imageScale = sizes[imageResizeIndex];
    updateImageTransform();
    setDirty(`Resize ${Math.round(imageScale * 100)}% · not saved`);
    return;
  }
  if (tool === "compress") {
    document.querySelector("#imageMetadata").textContent = "2048 × 1365 · PNG · 820 KB estimated";
    showCandidate("compress-image", "Compressed copy ready", "Estimated 54% smaller · quality 92% · original protected");
  }
}

function toggleHtmlSource(button) {
  htmlSourceOpen = !htmlSourceOpen;
  appShell.dataset.htmlSourceOpen = String(htmlSourceOpen);
  button.classList.toggle("is-active", htmlSourceOpen);
  button.querySelector("span").textContent = htmlSourceOpen ? "Close source" : "Edit source";
  if (htmlSourceOpen) document.querySelector('[data-editable-source="html"]').focus();
}

function toggleHtmlPicker(button) {
  htmlPicking = !htmlPicking;
  button.classList.toggle("is-active", htmlPicking);
  showToast(htmlPicking ? "Click an element in the preview" : "Element selection closed");
}

function selectPdfPage(page) {
  document.querySelectorAll("[data-pdf-page]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.pdfPage === page);
  });
  document.querySelector("#pdfPageNumber").textContent = page;
  document.querySelector("#pdfToolbarPage").textContent = page;
}

function updatePdfZoom(direction) {
  pdfZoom = Math.max(80, Math.min(144, pdfZoom + (direction === "in" ? 8 : -8)));
  document.querySelector("#pdfZoomLabel").textContent = `${pdfZoom}%`;
  document.querySelector(".pdf-page").style.width = `${Math.round(607 * pdfZoom / 100)}px`;
}

function updateCanvasZoom(direction) {
  canvasZoom = Math.max(60, Math.min(120, direction === "fit" ? 84 : canvasZoom + (direction === "in" ? 8 : -8)));
  document.querySelector("#canvasZoomLabel").textContent = `${canvasZoom}%`;
  document.querySelector(".canvas-board").style.backgroundSize = `${Math.round(18 * canvasZoom / 84)}px ${Math.round(18 * canvasZoom / 84)}px`;
}

function updateExcalZoom(direction) {
  excalZoom = Math.max(48, Math.min(120, excalZoom + (direction === "in" ? 8 : -8)));
  document.querySelector("#excalZoomLabel").textContent = `${excalZoom}%`;
  document.querySelector(".excalidraw-scene").style.transform = `scale(${excalZoom / 72})`;
  document.querySelector(".excalidraw-scene").style.transformOrigin = "center";
}

function handleExcalStyle(button) {
  const kind = button.dataset.excalStyle;
  const value = button.dataset.value;
  button.parentElement.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  const paths = document.querySelectorAll(".selected-shape > path");
  paths.forEach((path) => {
    if (kind === "stroke") path.style.stroke = value;
    if (kind === "fill") path.style.fill = value;
    if (kind === "width") path.style.strokeWidth = value;
  });
  setDirty(`Excalidraw ${kind} changed · autosaving`);
}

function handleAiAction(action) {
  if (action === "ask-pdf" || action === "summarize-pdf") {
    showAnswer("Answer with page citations", [
      'The report argues that AI should remain inside the user’s source workflow rather than create another detached destination. <button class="citation" data-citation-page="1">1 · p.1</button>',
      'It treats citations and candidate review as the mechanisms that preserve trust while increasing actionability. <button class="citation" data-citation-page="3">2 · p.3</button>',
    ]);
    return;
  }
  if (action === "translate-pdf") {
    showAnswer("Selection explained", [
      '“Source-connected” means the answer retains a navigable relationship to the exact page and passage that supports it. <button class="citation" data-citation-page="1">p.1</button>',
      "Translation: 与来源相连——答案始终能够返回支持它的具体页面与段落。",
    ]);
    return;
  }
  if (action === "describe-image") {
    showAnswer("Image understanding", [
      "The image presents a left-to-right knowledge workflow: multiple sources converge into a Peak reasoning layer, then produce a reviewable output.",
      "Visible text is legible and can be copied into a note. No source pixels changed.",
    ]);
    return;
  }
  if (action === "explain-selection") {
    showAnswer("Selection explained", [
      "The selected loop processes changed sources sequentially. One slow source delays every item behind it.",
      "You can keep typing in the source editor while Intelligence explains the active selection.",
    ]);
    return;
  }

  const explanations = {
    "explain-html": ["Dashboard summary", "Deploy health is strong, but Webhooks are degraded. The page exposes three top-level metrics and one incident-detail action."],
    "repair-html": ["Layout review", "The service column becomes narrow before the metric row does. A container query or earlier two-column breakpoint would prevent crowding."],
    "audit-html": ["Interaction & data review", "The incident action needs an explicit persistence contract: what is written, where it is written, and whether the preview may perform that write."],
    "review-code": ["File review", "The sequential loop is readable but has no per-source failure policy. Execution remains outside this editor."],
    "explain-canvas": ["Canvas neighborhood", "Research informs the workflow image, which then ships into the launch brief. The selected card is the bridge between evidence and outcome."],
    "explain-diagram": ["Diagram explanation", "Sources enter Peak context and review, producing a candidate that is accepted or restored."],
  };
  if (explanations[action]) {
    const [title, text] = explanations[action];
    showAnswer(title, [text]);
    return;
  }

  const candidates = {
    "remove-background": ["Transparent background ready", "Background removed · original protected · review on the image surface"],
    "remove-object": ["Object edit ready", "Selected object replaced · original protected · one generated version"],
    "extend-image": ["Expanded frame ready", "Generated surroundings extend the image by 18% on both sides"],
    "change-html": ["Element update ready", "Selected service card rewritten · live page remains visible"],
    "materialize-pdf": ["Linked note ready", "Highlights, extracted text, and page citations will be written to a new Markdown note"],
    "change-code": ["Code suggestion ready", "Focused replacement for the current selection · source remains directly editable"],
    "fix-code": ["Code fix ready", "Add a failure policy around each source update · nothing executed"],
    "connect-canvas": ["Canvas edge proposed", "Preview one native connection from Workflow to Launch brief"],
    "create-canvas-cards": ["Canvas cards proposed", "Three native cards will be added inside Peak launch system"],
    "brief-canvas": ["Linked brief ready", "The selected group will become a sourced Markdown brief"],
    "generate-diagram": ["Scene elements ready", "Four native shapes and three bound arrows will be added"],
    "rewrite-labels": ["Label changes ready", "Three labels clarified inside the existing elements"],
    "tidy-diagram": ["Scene layout ready", "Spacing and alignment changed; shapes and arrow bindings preserved"],
  };
  const [title, description] = candidates[action] || ["AI suggestion ready", "Review this suggestion before it changes the source."];
  if (action === "change-code" || action === "fix-code") document.querySelector(".code-preview").classList.add("has-ai-suggestion");
  showCandidate(action, title, description);
  showAnswer("Suggestion prepared", [description, "The source surface remains active. Accept or restore from the bar over the file."]);
}

function completeCandidate(action) {
  const accepted = action === "accept";
  if (pendingCandidateAction === "compress-image" && !accepted) {
    document.querySelector("#imageMetadata").textContent = "2048 × 1365 · PNG · 1.8 MB";
  }
  document.querySelector(".code-preview").classList.remove("has-ai-suggestion");
  candidateReview.hidden = true;
  if (accepted) setClean("Suggestion accepted · saved in prototype state");
  showToast(accepted ? "Suggestion accepted" : "Suggestion restored; source unchanged");
  pendingCandidateAction = "";
}

document.addEventListener("click", (event) => {
  const surfaceButton = event.target.closest("[data-surface-tab]");
  if (surfaceButton) {
    selectSurface(surfaceButton.dataset.surfaceTab);
    return;
  }

  const imageTool = event.target.closest("[data-image-tool]");
  if (imageTool) {
    handleImageTool(imageTool.dataset.imageTool, imageTool);
    return;
  }

  const htmlAction = event.target.closest("[data-html-action]");
  if (htmlAction) {
    if (htmlAction.dataset.htmlAction === "source") toggleHtmlSource(htmlAction);
    if (htmlAction.dataset.htmlAction === "select") toggleHtmlPicker(htmlAction);
    return;
  }

  const htmlElement = event.target.closest("[data-html-element]");
  if (htmlElement && htmlPicking) {
    document.querySelectorAll("[data-html-element]").forEach((element) => element.classList.toggle("is-picked", element === htmlElement));
    selectionScope.textContent = `Selected ${htmlElement.dataset.htmlElement} element`;
    htmlPicking = false;
    document.querySelector('[data-html-action="select"]').classList.remove("is-active");
    showToast("Element connected to Intelligence");
    return;
  }

  const pdfZoomButton = event.target.closest("[data-pdf-zoom]");
  if (pdfZoomButton) {
    updatePdfZoom(pdfZoomButton.dataset.pdfZoom);
    return;
  }

  const actionButton = event.target.closest("[data-ai-action]");
  if (actionButton) {
    handleAiAction(actionButton.dataset.aiAction);
    return;
  }

  const demoAction = event.target.closest("[data-demo-action]");
  if (demoAction) {
    showToast(demoAction.dataset.demoAction);
    return;
  }

  const citation = event.target.closest("[data-citation-page]");
  if (citation) {
    selectPdfPage(citation.dataset.citationPage);
    document.querySelector("#pdfHighlight").scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(`Jumped to cited evidence · page ${citation.dataset.citationPage}`);
    return;
  }

  const pageButton = event.target.closest("[data-pdf-page]");
  if (pageButton) {
    selectPdfPage(pageButton.dataset.pdfPage);
    showToast(`Page ${pageButton.dataset.pdfPage} selected`);
    return;
  }

  const canvasZoomButton = event.target.closest("[data-canvas-zoom]");
  if (canvasZoomButton) {
    updateCanvasZoom(canvasZoomButton.dataset.canvasZoom);
    return;
  }

  const canvasAction = event.target.closest("[data-canvas-action]");
  if (canvasAction) {
    if (canvasAction.dataset.canvasAction === "fit") updateCanvasZoom("fit");
    if (canvasAction.dataset.canvasAction === "color") {
      const selected = document.querySelector(".canvas-card.is-selected");
      selected.classList.toggle("is-accent-card");
      showToast("Selected Canvas card color changed");
    }
    return;
  }

  const canvasTool = event.target.closest("[data-canvas-tool]");
  if (canvasTool) {
    canvasTool.parentElement.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button === canvasTool));
    if (canvasTool.dataset.canvasTool !== "Select") {
      const draft = document.createElement("div");
      draft.className = "canvas-draft";
      draft.textContent = `New ${canvasTool.dataset.canvasTool}`;
      document.querySelector(".canvas-board").append(draft);
    }
    showToast(`${canvasTool.dataset.canvasTool} tool active`);
    return;
  }

  const canvasNode = event.target.closest("[data-canvas-node]");
  if (canvasNode) {
    document.querySelectorAll("[data-canvas-node]").forEach((node) => node.classList.toggle("is-selected", node === canvasNode));
    selectionScope.textContent = `Selected ${canvasNode.dataset.canvasNode} card + neighbors`;
    showToast("Native Canvas selection connected to Intelligence");
    return;
  }

  const excalTool = event.target.closest("[data-excal-tool]");
  if (excalTool) {
    excalTool.parentElement.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button === excalTool));
    showToast(`${excalTool.dataset.excalTool} tool active`);
    return;
  }

  const excalStyle = event.target.closest("[data-excal-style]");
  if (excalStyle) {
    handleExcalStyle(excalStyle);
    return;
  }

  const excalZoomButton = event.target.closest("[data-excal-zoom]");
  if (excalZoomButton) {
    updateExcalZoom(excalZoomButton.dataset.excalZoom);
    return;
  }

  const candidateAction = event.target.closest("[data-candidate]");
  if (candidateAction) {
    const action = candidateAction.dataset.candidate;
    if (action === "retry") {
      showToast("Generating another suggestion…");
      return;
    }
    completeCandidate(action);
    return;
  }

});

document.querySelector('[data-editable-source="html"]').addEventListener("input", () => {
  setDirty("Unsaved HTML changes · live preview connected");
});

const codeEditor = document.querySelector('[data-editable-source="code"]');
codeEditor.addEventListener("input", () => {
  document.querySelector("#codeEditState").textContent = "Unsaved changes · press ⌘S to save";
  document.querySelector(".file-tab").classList.add("is-dirty");
  setDirty("Unsaved source changes · nothing executed");
});
codeEditor.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
  event.preventDefault();
  document.querySelector("#codeEditState").textContent = "Saved · execution remains separate";
  document.querySelector(".file-tab").classList.remove("is-dirty");
  setClean("Source saved · nothing executed");
  showToast("Source file saved");
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
