const surfaces = {
  image: {
    name: "ai-knowledge-workflow.png",
    path: "Assets / Research / ai-knowledge-workflow.png",
    icon: "#i-image",
    state: "Original protected · Save as new version",
    contextTitle: "I can see this image",
    contextDetail: "Pixels · dimensions · visible text",
    headline: "Crop by touch. Export with a predictable result.",
    description: "Free crop and rotation stay on the canvas. Zoom changes only the view; format, dimensions, quality, and estimated size live in Export copy.",
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
    headline: "Select a live element, then carry its context forward.",
    description: "The element, DOM path, visible text, and source can move together into Intelligence or Composer while the page stays interactive.",
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
    headline: "Select a passage or region. Ask, cite, and carry it forward.",
    description: "AI can use the whole PDF, exact text, or a bounded table/image region. Answers jump back to page geometry; selections can enter Composer.",
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
    headline: "Type directly. Send the useful selection to Composer.",
    description: "Read, type, and save in the highlighted source editor. Selected code can be explained, changed, or attached as source context in Composer.",
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
    headline: "Canvas stays native. Selection becomes portable context.",
    description: "Select cards and neighbors on the native canvas, then ask Intelligence or attach that subgraph to a Composer task.",
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
    headline: "Draw natively. Carry selected elements into Composer.",
    description: "Excalidraw owns editing. Peak can explain selected elements, propose scene changes, or attach element IDs, labels, and bindings to Composer.",
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
const composerReceipt = document.querySelector("#composerReceipt");
const composerReceiptDetail = document.querySelector("#composerReceiptDetail");
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
let imageQuarterRotation = 0;
let cropStraighten = 0;
let imageScale = 1;
let pdfZoom = 112;
let pdfMode = "text";
let pdfSelection = null;
let codeSelectionText = "";
let canvasZoom = 84;
let excalZoom = 72;
let toastTimer;
let cropDragState = null;

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
  composerReceipt.hidden = true;
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
  image.style.transform = `rotate(${imageQuarterRotation + cropStraighten}deg) scale(${imageScale})`;
  document.querySelector("#imageScaleLabel").textContent = `${Math.round(imageScale * 100)}%`;
}

function handleImageTool(tool, button) {
  const cropOverlay = document.querySelector("#cropOverlay");
  const cropStudio = document.querySelector("#cropStudio");
  const exportSheet = document.querySelector("#imageExportSheet");
  const imageStage = document.querySelector(".image-stage");
  if (tool === "crop") {
    const opening = cropOverlay.hidden;
    cropOverlay.hidden = !opening;
    cropStudio.hidden = !opening;
    exportSheet.hidden = true;
    imageStage.classList.toggle("is-cropping", opening);
    button.classList.toggle("is-active", opening);
    document.querySelector('[data-image-tool="export"]').classList.remove("is-active");
    showToast(opening ? "Drag freely, choose an aspect ratio, or straighten the image" : "Crop cancelled");
    return;
  }
  if (tool !== "export") return;

  const opening = exportSheet.hidden;
  exportSheet.hidden = !opening;
  cropOverlay.hidden = true;
  cropStudio.hidden = true;
  imageStage.classList.remove("is-cropping");
  document.querySelector('[data-image-tool="crop"]').classList.remove("is-active");
  button.classList.toggle("is-active", opening);
}

function updateImageZoom(direction) {
  if (direction === "fit") imageScale = 1;
  if (direction === "in") imageScale = Math.min(1.8, imageScale + 0.1);
  if (direction === "out") imageScale = Math.max(0.5, imageScale - 0.1);
  updateImageTransform();
}

function setCropRatio(ratio, button) {
  const overlay = document.querySelector("#cropOverlay");
  overlay.style.inset = "";
  overlay.dataset.cropRatio = ratio;
  document.querySelectorAll("[data-crop-ratio]").forEach((item) => item.classList.toggle("is-active", item === button));
  showToast(`${button.textContent.trim()} crop ratio`);
}

function startCropDrag(event, handleIndex) {
  const overlay = document.querySelector("#cropOverlay");
  const frame = document.querySelector("#imageFrame");
  const overlayRect = overlay.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  cropDragState = {
    handleIndex,
    frame,
    overlay,
    frameRect,
    left: overlayRect.left - frameRect.left,
    top: overlayRect.top - frameRect.top,
    right: overlayRect.right - frameRect.left,
    bottom: overlayRect.bottom - frameRect.top,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function dragCrop(event) {
  if (!cropDragState) return;
  const { handleIndex, overlay, frameRect } = cropDragState;
  const minSize = 82;
  const x = Math.max(10, Math.min(frameRect.width - 10, event.clientX - frameRect.left));
  const y = Math.max(10, Math.min(frameRect.height - 10, event.clientY - frameRect.top));
  let { left, top, right, bottom } = cropDragState;
  if (handleIndex === 0 || handleIndex === 2) left = Math.min(x, right - minSize);
  if (handleIndex === 1 || handleIndex === 3) right = Math.max(x, left + minSize);
  if (handleIndex === 0 || handleIndex === 1) top = Math.min(y, bottom - minSize);
  if (handleIndex === 2 || handleIndex === 3) bottom = Math.max(y, top + minSize);
  Object.assign(cropDragState, { left, top, right, bottom });
  overlay.style.inset = `${top}px ${frameRect.width - right}px ${frameRect.height - bottom}px ${left}px`;
  overlay.dataset.cropRatio = "free";
  const freeButton = document.querySelector('.crop-presets [data-crop-ratio="free"]');
  document.querySelectorAll(".crop-presets button").forEach((item) => item.classList.toggle("is-active", item === freeButton));
}

function endCropDrag() {
  if (!cropDragState) return;
  cropDragState = null;
  setDirty("Free crop adjusted · not saved");
}

function rotateCrop(direction) {
  imageQuarterRotation += direction === "right" ? 90 : -90;
  updateImageTransform();
  setDirty(`Crop rotation ${imageQuarterRotation + cropStraighten}° · not saved`);
}

function resetCrop() {
  imageQuarterRotation = 0;
  cropStraighten = 0;
  document.querySelector("#cropAngle").value = "0";
  document.querySelector("#cropAngleValue").textContent = "0°";
  const freeButton = document.querySelector('.crop-presets [data-crop-ratio="free"]');
  setCropRatio("free", freeButton);
  updateImageTransform();
}

function closeCrop(commit) {
  document.querySelector("#cropOverlay").hidden = true;
  document.querySelector("#cropStudio").hidden = true;
  document.querySelector(".image-stage").classList.remove("is-cropping");
  document.querySelector('[data-image-tool="crop"]').classList.remove("is-active");
  if (commit) {
    setDirty("Crop applied to a new image version · not saved");
    showToast("Crop applied to the working copy");
    return;
  }
  resetCrop();
  showToast("Crop cancelled; original framing restored");
}

function updateExportEstimate() {
  const quality = Number(document.querySelector("#exportQuality").value);
  const format = document.querySelector("[data-export-format].is-active").dataset.exportFormat;
  const width = Math.max(320, Number(document.querySelector("#exportWidth").value) || 2048);
  const height = Math.max(240, Number(document.querySelector("#exportHeight").value) || 1365);
  const factors = { PNG: 1.05, JPEG: 0.58, WebP: 0.43 };
  const pixelScale = (width * height) / (2048 * 1365);
  const estimatedKb = Math.round(1800 * factors[format] * (0.3 + quality / 145) * pixelScale);
  const saving = Math.max(0, Math.round((1 - estimatedKb / 1800) * 100));
  document.querySelector("#exportQualityLabel").textContent = `${quality >= 85 ? "High" : quality >= 65 ? "Balanced" : "Small"} quality · ${quality}%`;
  document.querySelector("#exportEstimate").textContent = estimatedKb >= 1000 ? `${(estimatedKb / 1000).toFixed(1)} MB` : `${estimatedKb} KB`;
  document.querySelector("#exportSaving").textContent = saving ? `${saving}% smaller than original` : "Original-size estimate";
  document.querySelector("#exportDimensions").textContent = `${width} × ${height} px`;
}

function closeExport() {
  document.querySelector("#imageExportSheet").hidden = true;
  document.querySelector('[data-image-tool="export"]').classList.remove("is-active");
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

function addToComposer(kind) {
  const contexts = {
    html: {
      label: `${surfaces.html.name} · ${document.querySelector("#htmlSelectionLabel").textContent}`,
      detail: "Rendered element, DOM path, visible text, and local source",
    },
    pdf: {
      label: `${surfaces.pdf.name} · page 1 ${pdfSelection?.kind || "selection"}`,
      detail: pdfSelection?.text || "Selected PDF passage with page geometry",
    },
    code: {
      label: `${surfaces.code.name} · ${codeSelectionText ? "selected code" : "current file"}`,
      detail: codeSelectionText ? `${codeSelectionText.slice(0, 72)}${codeSelectionText.length > 72 ? "…" : ""}` : "Current Python source and visible range",
    },
    canvas: {
      label: `${surfaces.canvas.name} · selected card + neighbors`,
      detail: "Native Canvas node, connected edges, and adjacent card labels",
    },
    excalidraw: {
      label: `${surfaces.excalidraw.name} · selected elements`,
      detail: "Peak diamond, two bound arrows, element IDs, and scene labels",
    },
  };
  const context = contexts[kind];
  if (!context) return;

  promptFile.textContent = context.label;
  composerReceiptDetail.textContent = context.detail;
  composerReceipt.hidden = false;
  selectionScope.textContent = context.label.replace(`${surfaces[kind].name} · `, "");
  showToast("Selection added to Composer context");
}

function setPdfMode(mode, button) {
  pdfMode = mode;
  document.querySelectorAll("[data-pdf-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
  document.querySelector(".pdf-page").classList.toggle("is-region-mode", mode === "region");
  showToast(mode === "region" ? "Drag or click a table, image, or page region" : "Select or click a passage");
}

function selectPdfContent(element) {
  const kind = element.dataset.pdfSelect;
  if (pdfMode === "text" && kind !== "passage") {
    showToast("Switch to Area to select this region");
    return;
  }
  if (pdfMode === "region" && kind !== "region") {
    showToast("Area mode is for tables, images, and bounded regions");
    return;
  }

  document.querySelectorAll("[data-pdf-select]").forEach((item) => item.classList.toggle("is-pdf-selected", item === element));
  const text = element.textContent.trim().replace(/\s+/g, " ");
  pdfSelection = { kind, text };
  document.querySelector("#pdfSelectionKind").textContent = `${kind === "region" ? "Area" : "Passage"} · page 1`;
  document.querySelector("#pdfSelectionText").textContent = kind === "region" ? "3-part workflow callout" : `“${text.slice(0, 48)}${text.length > 48 ? "…" : ""}”`;
  document.querySelector("#pdfExtractAction").hidden = kind !== "region";
  document.querySelector("#pdfSelectionToolbar").hidden = false;
  selectionScope.textContent = `${kind === "region" ? "Selected area" : "Selected passage"} · page 1`;
  contextTitle.textContent = "I can see the PDF selection";
  contextDetail.textContent = kind === "region" ? "Page geometry · OCR · embedded elements" : "Exact text · page 1 · source geometry";
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
      'The report argues that AI should remain inside the user’s source workflow rather than create another detached destination. <button class="citation" data-citation-page="1" data-citation-target="pdfHighlight">1 · p.1 passage</button>',
      'It treats citations and candidate review as the mechanisms that preserve trust while increasing actionability. <button class="citation" data-citation-page="1" data-citation-target="pdfCallouts">2 · p.1 area</button>',
    ]);
    return;
  }
  if (action === "explain-pdf-selection") {
    showAnswer("Answer grounded in the selected passage", [
      'The selected passage argues for a reviewable source-to-answer loop: keep the file visible, make evidence navigable, and separate a proposed write from an accepted write. <button class="citation" data-citation-page="1" data-citation-target="pdfHighlight">p.1 · selected passage</button>',
      "This answer is scoped to the passage, not inferred from the whole report.",
    ]);
    return;
  }
  if (action === "extract-pdf-region") {
    showAnswer("Region extracted", [
      "Detected three labeled items: Source visible, Citations jump back, and Writes are reviewable.",
      'The extracted structure remains linked to its page geometry. <button class="citation" data-citation-page="1" data-citation-target="pdfCallouts">p.1 · selected area</button>',
    ]);
    return;
  }
  if (action === "translate-pdf") {
    showAnswer("Selection explained", [
      '“Source-connected” means the answer retains a navigable relationship to the exact page and passage that supports it. <button class="citation" data-citation-page="1" data-citation-target="pdfHighlight">p.1 · selected passage</button>',
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

  const imageZoomButton = event.target.closest("[data-image-zoom]");
  if (imageZoomButton) {
    updateImageZoom(imageZoomButton.dataset.imageZoom);
    return;
  }

  const cropRatioButton = event.target.closest(".crop-presets [data-crop-ratio]");
  if (cropRatioButton) {
    setCropRatio(cropRatioButton.dataset.cropRatio, cropRatioButton);
    return;
  }

  const cropRotateButton = event.target.closest("[data-crop-rotate]");
  if (cropRotateButton) {
    rotateCrop(cropRotateButton.dataset.cropRotate);
    return;
  }

  const cropAction = event.target.closest("[data-crop-action]");
  if (cropAction) {
    if (cropAction.dataset.cropAction === "reset") resetCrop();
    if (cropAction.dataset.cropAction === "cancel") closeCrop(false);
    if (cropAction.dataset.cropAction === "done") closeCrop(true);
    return;
  }

  const exportFormat = event.target.closest("[data-export-format]");
  if (exportFormat) {
    exportFormat.parentElement.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === exportFormat));
    updateExportEstimate();
    return;
  }

  const exportAction = event.target.closest("[data-export-action]");
  if (exportAction) {
    if (exportAction.dataset.exportAction === "save") {
      const format = document.querySelector("[data-export-format].is-active").dataset.exportFormat;
      showToast(`${format} copy exported; original unchanged`);
      setClean("Exported a copy · original unchanged");
    }
    closeExport();
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
    const elementLabel = `section.${htmlElement.classList[0]}`;
    document.querySelector("#htmlSelectionLabel").textContent = elementLabel;
    document.querySelector("#htmlSelectionToolbar").hidden = false;
    selectionScope.textContent = `Selected ${elementLabel}`;
    contextTitle.textContent = "I can see the selected page element";
    contextDetail.textContent = `${elementLabel} · rendered state · local source`;
    htmlPicking = false;
    document.querySelector('[data-html-action="select"]').classList.remove("is-active");
    showToast("Element connected to Intelligence");
    return;
  }

  const pdfModeButton = event.target.closest("[data-pdf-mode]");
  if (pdfModeButton) {
    setPdfMode(pdfModeButton.dataset.pdfMode, pdfModeButton);
    return;
  }

  const pdfSelectable = event.target.closest("[data-pdf-select]");
  if (pdfSelectable) {
    selectPdfContent(pdfSelectable);
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

  const addComposerButton = event.target.closest("[data-add-composer]");
  if (addComposerButton) {
    addToComposer(addComposerButton.dataset.addComposer);
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
    const target = document.querySelector(`#${citation.dataset.citationTarget || "pdfHighlight"}`);
    target.classList.add("citation-focus");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target.classList.remove("citation-focus"), 1700);
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

document.querySelector("#cropAngle").addEventListener("input", (event) => {
  cropStraighten = Number(event.target.value);
  document.querySelector("#cropAngleValue").textContent = `${cropStraighten}°`;
  updateImageTransform();
  setDirty(`Straightened ${cropStraighten}° · not saved`);
});

document.querySelector("#exportQuality").addEventListener("input", updateExportEstimate);
document.querySelector("#exportWidth").addEventListener("input", updateExportEstimate);
document.querySelector("#exportHeight").addEventListener("input", updateExportEstimate);

document.querySelectorAll("#cropOverlay i").forEach((handle, index) => {
  handle.addEventListener("pointerdown", (event) => startCropDrag(event, index));
  handle.addEventListener("pointermove", dragCrop);
  handle.addEventListener("pointerup", endCropDrag);
  handle.addEventListener("pointercancel", endCropDrag);
});

document.querySelector("#imageFrame").addEventListener("wheel", (event) => {
  if (document.querySelector(".image-stage").classList.contains("is-cropping")) return;
  event.preventDefault();
  updateImageZoom(event.deltaY < 0 ? "in" : "out");
}, { passive: false });

document.querySelector('[data-editable-source="html"]').addEventListener("input", () => {
  setDirty("Unsaved HTML changes · live preview connected");
});

const codeEditor = document.querySelector('[data-editable-source="code"]');
codeEditor.addEventListener("input", () => {
  document.querySelector("#codeEditState").textContent = "Unsaved changes · press ⌘S to save";
  document.querySelector(".file-tab").classList.add("is-dirty");
  setDirty("Unsaved source changes · nothing executed");
});
codeEditor.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || "";
  if (!selectedText || !codeEditor.contains(selection.anchorNode)) return;
  codeSelectionText = selectedText;
  const lineCount = selectedText.split("\n").length;
  selectionScope.textContent = `${lineCount} line${lineCount === 1 ? "" : "s"} selected in index_pipeline.py`;
  contextTitle.textContent = "I can see the selected code";
  contextDetail.textContent = `Python · ${lineCount} selected line${lineCount === 1 ? "" : "s"} · related Vault files`;
  document.querySelector("#codeEditState").textContent = `${lineCount} line${lineCount === 1 ? "" : "s"} selected · edit or add to Composer`;
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
