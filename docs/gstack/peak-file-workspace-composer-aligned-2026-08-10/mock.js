const surfaces = {
  image: {
    name: "ai-knowledge-workflow.png",
    path: "Assets / Research / ai-knowledge-workflow.png",
    icon: "#i-image",
    state: "Original protected · Save as new version",
    contextTitle: "I can see this image",
    contextDetail: "Pixels · dimensions · visible text",
    headline: "Select precisely, crop directly, and keep AI attached to the source.",
    description: "Use the whole image, a resizable rectangle, or a freehand selection as context. Crop opens above the dock and provides independent rectangle and freehand methods without moving the toolbar.",
    scope: "Whole image",
    placeholder: "Ask about this image or propose a change…",
    actions: [
      ["Describe & extract text", "Understand layout, objects, and visible copy", "describe-image"],
      ["Remove the background", "Create a transparent-background version", "remove-background"],
      ["Remove or replace selection", "Use the active rectangle or freehand region", "remove-object"],
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
    headline: "Use the whole page, or annotate one live element.",
    description: "Pick elements repeatedly and the action capsule follows. Whole-page and element-level context can both move into Intelligence or Composer.",
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
    headline: "Ask with an exact PDF page, passage, or freehand region.",
    description: "All pages, one page, native text, and lasso are explicit scopes. Every local selection keeps the PDF identity, page, normalized geometry, and extracted text or OCR.",
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
    headline: "Select code, then ask or add it to Composer.",
    description: "The editor stays directly editable. Every fresh text selection gets a nearby Ask / Add capsule, while the whole file remains available from the tab bar.",
    scope: "index_pipeline.py · current selection",
    placeholder: "Ask about the selected code…",
    actions: [
      ["Explain the selection", "Describe behavior, assumptions, and failure paths", "explain-selection"],
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
    headline: "Canvas stays native. Peak follows the selected card.",
    description: "Native node controls remain separate. A small Peak capsule moves with the selected card; the whole canvas is also available as context.",
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
    headline: "Excalidraw owns selection. Peak stays attached to it.",
    description: "Click another scene element and the Peak capsule follows. Use selected elements or the whole scene without replacing Excalidraw's native editor language.",
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
let imageScale = 1;
let imageScope = "all";
let pdfZoom = 112;
let pdfMode = "document";
let pdfSelection = null;
let codeSelectionText = "";
let canvasZoom = 84;
let excalZoom = 72;
let toastTimer;
let activeLasso = null;
let surfaceDragState = null;
const lassoSelections = { image: null, pdf: null };

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
  window.requestAnimationFrame(() => {
    if (surface === "canvas") positionCanvasSelection(document.querySelector(".canvas-card.is-selected"));
    if (surface === "excalidraw") {
      positionSelectionLens(document.querySelector(".excalidraw-selection-bar"), document.querySelector("[data-excal-element].is-scene-selected"), document.querySelector(".excalidraw-board"), "below");
    }
  });
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
  image.style.transform = `rotate(${imageQuarterRotation}deg) scale(${imageScale})`;
  document.querySelector("#imageScaleLabel").textContent = `${Math.round(imageScale * 100)}%`;
}

function handleImageTool(tool, button) {
  const cropOverlay = document.querySelector("#cropOverlay");
  const cropStudio = document.querySelector("#cropStudio");
  const exportSheet = document.querySelector("#imageExportSheet");
  if (tool === "crop") {
    const opening = cropStudio.hidden;
    if (!opening) {
      closeCrop(false);
      return;
    }
    if (imageScope === "lasso" && !lassoSelections.image) {
      showToast("Draw a freehand selection first, then crop it");
      return;
    }
    prepareCropOverlay();
    document.querySelector("#imageSelectionToolbar").hidden = true;
    cropStudio.hidden = false;
    exportSheet.hidden = true;
    button.classList.add("is-active");
    document.querySelector('[data-image-tool="export"]').classList.remove("is-active");
    showToast(imageScope === "lasso" ? "Crop will use the current freehand selection" : "Drag the crop frame directly on the image");
    return;
  }
  if (tool !== "export") return;

  const opening = exportSheet.hidden;
  closeCrop(false, true);
  exportSheet.hidden = !opening;
  button.classList.toggle("is-active", opening);
}

function hideImageSelections() {
  document.querySelector("#imageRegionSelection").hidden = true;
  document.querySelector("#imageLassoLayer").toggleAttribute("hidden", true);
  document.querySelector("#imageLassoHint").hidden = true;
  document.querySelector("#imageSelectionToolbar").hidden = true;
}

function showImageSelectionLens(kind, label, target) {
  const toolbar = document.querySelector("#imageSelectionToolbar");
  const frame = document.querySelector("#imageFrame");
  document.querySelector("#imageSelectionKind").textContent = kind;
  document.querySelector("#imageSelectionLabel").textContent = label;
  positionSelectionLens(toolbar, target, frame, "above", document.querySelector("#imageContextDock"));
}

function setImageScope(scope, button, preserveTool = false) {
  imageScope = scope;
  document.querySelectorAll("[data-image-scope]").forEach((item) => item.classList.toggle("is-active", item === button));
  if (!preserveTool) closeCrop(false, true);
  hideImageSelections();
  if (scope !== "lasso") clearLassoSelection("image", false);
  document.querySelector("#imageExportSheet").hidden = true;
  if (!preserveTool) document.querySelectorAll("[data-image-tool]").forEach((item) => item.classList.remove("is-active"));

  const layer = document.querySelector("#imageLassoLayer");
  const hint = document.querySelector("#imageLassoHint");
  if (scope === "lasso") {
    layer.toggleAttribute("hidden", false);
    hint.hidden = Boolean(lassoSelections.image);
    contextTitle.textContent = "Draw a freehand image region";
    contextDetail.textContent = "Irregular mask · Ask · Composer · AI edit";
    selectionScope.textContent = "Waiting for freehand mask";
    showToast("Draw around any irregular subject with the pen");
    return;
  }
  if (scope === "region") {
    const region = document.querySelector("#imageRegionSelection");
    region.hidden = false;
    updateImageRegionLabel(region);
    contextTitle.textContent = "I can see the rectangular image selection";
    contextDetail.textContent = "Pixels · coordinates · visible text inside selection";
    selectionScope.textContent = "Resizable rectangle";
    showToast("Drag the rectangle or any of its eight handles");
    return;
  }

  contextTitle.textContent = "I can see the whole image";
  contextDetail.textContent = "All pixels · dimensions · visible text";
  selectionScope.textContent = "Whole image";
  showToast("Whole image is the active context");
}

function updateImageZoom(direction) {
  if (direction === "fit") imageScale = 1;
  if (direction === "in") imageScale = Math.min(1.8, imageScale + 0.1);
  if (direction === "out") imageScale = Math.max(0.5, imageScale - 0.1);
  updateImageTransform();
  refreshImageLassoForZoom();
}

function prepareCropOverlay() {
  const overlay = document.querySelector("#cropOverlay");
  const frame = document.querySelector("#imageFrame");
  const resetButton = document.querySelector('[data-crop-action="reset"]');
  const label = document.querySelector("#cropScopeLabel");
  overlay.removeAttribute("style");
  if (imageScope === "lasso") {
    overlay.hidden = true;
    resetButton.hidden = true;
    label.textContent = "Uses current freehand selection";
    return;
  }

  overlay.hidden = false;
  resetButton.hidden = false;
  if (imageScope !== "region") {
    document.querySelector(".crop-drag-label").textContent = "Drag edges or frame";
    label.textContent = "Drag edges or frame";
    return;
  }

  const frameRect = frame.getBoundingClientRect();
  const regionRect = document.querySelector("#imageRegionSelection").getBoundingClientRect();
  overlay.style.inset = "auto";
  overlay.style.left = `${regionRect.left - frameRect.left}px`;
  overlay.style.top = `${regionRect.top - frameRect.top}px`;
  overlay.style.width = `${regionRect.width}px`;
  overlay.style.height = `${regionRect.height}px`;
  updateCropLabel(overlay);
}

function startRectDrag(event, element, container, handle, onMove, onEnd) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  surfaceDragState = {
    element,
    container,
    handle,
    onMove,
    onEnd,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
    left: elementRect.left - containerRect.left,
    top: elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height,
  };
  event.preventDefault();
  event.stopPropagation();
}

function dragSurfaceRect(event) {
  if (!surfaceDragState || event.pointerId !== surfaceDragState.pointerId) return;
  event.preventDefault();
  const state = surfaceDragState;
  const minSize = 70;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  let { left, top, width, height } = state;

  if (state.handle === "move") {
    left = Math.max(6, Math.min(state.containerWidth - width - 6, left + dx));
    top = Math.max(6, Math.min(state.containerHeight - height - 6, top + dy));
  } else {
    if (state.handle.includes("w")) {
      const nextLeft = Math.max(6, Math.min(left + width - minSize, left + dx));
      width += left - nextLeft;
      left = nextLeft;
    }
    if (state.handle.includes("e")) width = Math.max(minSize, Math.min(state.containerWidth - left - 6, width + dx));
    if (state.handle.includes("n")) {
      const nextTop = Math.max(6, Math.min(top + height - minSize, top + dy));
      height += top - nextTop;
      top = nextTop;
    }
    if (state.handle.includes("s")) height = Math.max(minSize, Math.min(state.containerHeight - top - 6, height + dy));
  }

  state.element.style.inset = "auto";
  state.element.style.left = `${left}px`;
  state.element.style.top = `${top}px`;
  state.element.style.width = `${width}px`;
  state.element.style.height = `${height}px`;
  state.onMove?.(state.element);
}

function endSurfaceRectDrag(event) {
  if (!surfaceDragState || event.pointerId !== surfaceDragState.pointerId) return;
  const { element, onEnd } = surfaceDragState;
  surfaceDragState = null;
  onEnd?.(element);
}

function updateCropLabel(overlay) {
  const frameRect = document.querySelector("#imageFrame").getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  const width = Math.round(2048 * overlayRect.width / frameRect.width);
  const height = Math.round(1365 * overlayRect.height / frameRect.height);
  document.querySelector(".crop-drag-label").textContent = `${width} × ${height}`;
  document.querySelector("#cropScopeLabel").textContent = `${width} × ${height} px`;
}

function updateImageRegionLabel(region) {
  const frame = document.querySelector("#imageFrame");
  const frameRect = frame.getBoundingClientRect();
  const regionRect = region.getBoundingClientRect();
  const percent = Math.round(regionRect.width * regionRect.height / (frameRect.width * frameRect.height) * 100);
  showImageSelectionLens("Rectangle", `${percent}% of image · drag to adjust`, region);
}

function restoreImageSelectionLens() {
  if (imageScope === "region") {
    updateImageRegionLabel(document.querySelector("#imageRegionSelection"));
    return;
  }
  if (imageScope !== "lasso" || !lassoSelections.image) return;
  const selection = lassoSelections.image;
  const percent = Math.round(selection.normalizedBounds.width * selection.normalizedBounds.height * 100);
  showImageSelectionLens("Freehand mask", `1 closed mask · ${percent}% bounding area`, selection.viewportBounds);
}

function rotateImage(direction) {
  closeCrop(false, true);
  closeExport();
  imageQuarterRotation += direction === "right" ? 90 : -90;
  updateImageTransform();
  setDirty(`Image rotated ${imageQuarterRotation}° · not saved`);
  showToast(`Rotated ${direction} 90° · original remains protected`);
}

function resetCrop(silent = false) {
  prepareCropOverlay();
  if (!silent) showToast(imageScope === "region" ? "Crop restored to the current rectangle" : "Crop frame reset");
}

function closeCrop(commit, silent = false) {
  const overlay = document.querySelector("#cropOverlay");
  const studio = document.querySelector("#cropStudio");
  const wasOpen = !studio.hidden;
  if (commit && imageScope === "lasso" && !lassoSelections.image) {
    showToast("Draw a freehand selection before applying Crop");
    return;
  }
  overlay.hidden = true;
  studio.hidden = true;
  document.querySelector('[data-image-tool="crop"]').classList.remove("is-active");
  if (!wasOpen) return;
  if (commit) {
    setDirty(`${imageScope === "lasso" ? "Freehand" : "Rectangle"} crop applied to a new image version · not saved`);
    restoreImageSelectionLens();
    if (!silent) showToast("Crop applied to the working copy; original remains protected");
    return;
  }
  overlay.removeAttribute("style");
  restoreImageSelectionLens();
  if (!silent) showToast("Crop cancelled; original framing restored");
}

function pointFromEvent(event, container) {
  const rect = container.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  };
}

function renderLassoPath(state, closed = false) {
  if (!state.points.length) {
    state.path.setAttribute("d", "");
    return;
  }
  const [first, ...rest] = state.points;
  const segments = rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  state.path.setAttribute("d", `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${segments}${closed ? " Z" : ""}`);
}

function beginLasso(event, kind) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const layer = event.currentTarget;
  const isImageSurface = kind === "image";
  const container = isImageSurface ? document.querySelector("#imageFrame") : document.querySelector("#pdfPage");
  const pathSelector = kind === "image" ? "#imageLassoPath" : "#pdfLassoPath";
  const path = document.querySelector(pathSelector);
  const rect = container.getBoundingClientRect();
  clearLassoSelection(kind, false);
  layer.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  activeLasso = { kind, layer, path, container, pointerId: event.pointerId, points: [pointFromEvent(event, container)] };
  layer.setPointerCapture?.(event.pointerId);
  layer.classList.add("is-drawing");
  renderLassoPath(activeLasso);
  event.preventDefault();
  event.stopPropagation();
}

function appendLassoPoint(event) {
  if (!activeLasso) return;
  if (event.pointerId !== activeLasso.pointerId) return;
  const point = pointFromEvent(event, activeLasso.container);
  const previous = activeLasso.points.at(-1);
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return;
  activeLasso.points.push(point);
  renderLassoPath(activeLasso);
  event.preventDefault();
}

function normalizedLassoSelection(state) {
  const rect = state.container.getBoundingClientRect();
  const xs = state.points.map((point) => point.x);
  const ys = state.points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const round = (value) => Number(value.toFixed(4));
  const viewportPoints = state.points.map((point) => [point.x / rect.width, point.y / rect.height]);
  const isImageSurface = state.kind === "image";
  const normalizedPoints = isImageSurface
    ? viewportPoints.map(([x, y]) => [round(0.5 + (x - 0.5) / imageScale), round(0.5 + (y - 0.5) / imageScale)])
    : viewportPoints.map(([x, y]) => [round(x), round(y)]);
  const normalizedXs = normalizedPoints.map(([x]) => x);
  const normalizedYs = normalizedPoints.map(([, y]) => y);
  const normalizedLeft = Math.min(...normalizedXs);
  const normalizedRight = Math.max(...normalizedXs);
  const normalizedTop = Math.min(...normalizedYs);
  const normalizedBottom = Math.max(...normalizedYs);
  return {
    normalizedPoints,
    normalizedBounds: {
      x: round(normalizedLeft),
      y: round(normalizedTop),
      width: round(normalizedRight - normalizedLeft),
      height: round(normalizedBottom - normalizedTop),
    },
    viewportBounds: {
      left: rect.left + left,
      top: rect.top + top,
      right: rect.left + right,
      bottom: rect.top + bottom,
      width: right - left,
      height: bottom - top,
    },
    viewTransform: isImageSurface ? { scale: imageScale, quarterRotation: imageQuarterRotation } : null,
  };
}

function finishLasso(event) {
  if (!activeLasso) return;
  if (event.pointerId !== activeLasso.pointerId) return;
  const state = activeLasso;
  activeLasso = null;
  if (state.layer.hasPointerCapture?.(state.pointerId)) state.layer.releasePointerCapture(state.pointerId);
  state.layer.classList.remove("is-drawing");
  event.preventDefault();
  if (state.points.length < 4) {
    clearLassoSelection(state.kind);
    showToast("Draw a larger closed region");
    return;
  }
  renderLassoPath(state, true);
  const selection = normalizedLassoSelection(state);
  lassoSelections[state.kind] = selection;
  if (state.kind === "image") completeImageLasso(selection);
  if (state.kind === "pdf") completePdfLasso(selection);
}

function clearLassoSelection(kind, resetContext = true) {
  lassoSelections[kind] = null;
  const isImage = kind === "image";
  const path = document.querySelector(isImage ? "#imageLassoPath" : "#pdfLassoPath");
  const toolbar = document.querySelector(isImage ? "#imageSelectionToolbar" : "#pdfSelectionToolbar");
  const hint = document.querySelector(isImage ? "#imageLassoHint" : "#pdfLassoHint");
  path?.setAttribute("d", "");
  if (toolbar) toolbar.hidden = true;
  if (hint) hint.hidden = isImage ? !document.querySelector('[data-image-scope="lasso"]').classList.contains("is-active") : pdfMode !== "lasso";
  if (!resetContext) return;
  if (isImage) {
    contextTitle.textContent = "Draw a freehand image region";
    contextDetail.textContent = "One mask will power Ask, Composer, and crop";
    selectionScope.textContent = "Waiting for freehand mask";
    return;
  }
  pdfSelection = null;
  const page = document.querySelector("#pdfToolbarPage").textContent;
  contextTitle.textContent = "Circle a PDF region";
  contextDetail.textContent = `${surfaces.pdf.name} · p.${page} · awaiting mask, bounds, and OCR`;
  selectionScope.textContent = `Waiting for PDF lasso · page ${page}`;
}

function completeImageLasso(selection) {
  document.querySelector("#imageLassoHint").hidden = true;
  const percent = Math.round(selection.normalizedBounds.width * selection.normalizedBounds.height * 100);
  showImageSelectionLens("Freehand mask", `1 closed mask · ${percent}% bounding area`, selection.viewportBounds);
  contextTitle.textContent = "I can see the freehand image selection";
  contextDetail.textContent = "Normalized mask · source pixels · OCR · original path";
  selectionScope.textContent = "Freehand image mask · 1 region";
  showToast("Selection ready for Ask, Add to Composer, or AI edit");
}

function refreshImageLassoForZoom() {
  const selection = lassoSelections.image;
  if (!selection) return;
  const frame = document.querySelector("#imageFrame");
  const rect = frame.getBoundingClientRect();
  const points = selection.normalizedPoints.map(([x, y]) => ({
    x: rect.width * (0.5 + (x - 0.5) * imageScale),
    y: rect.height * (0.5 + (y - 0.5) * imageScale),
  }));
  const path = document.querySelector("#imageLassoPath");
  document.querySelector("#imageLassoLayer").setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  renderLassoPath({ points, path }, true);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const viewportBounds = {
    left: rect.left + Math.min(...xs),
    top: rect.top + Math.min(...ys),
    right: rect.left + Math.max(...xs),
    bottom: rect.top + Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  selection.viewportBounds = viewportBounds;
  selection.viewTransform = { scale: imageScale, quarterRotation: imageQuarterRotation };
  positionSelectionLens(
    document.querySelector("#imageSelectionToolbar"),
    viewportBounds,
    frame,
    "above",
    document.querySelector("#imageContextDock"),
  );
}

function handleImageSelectionAction(action) {
  if (action === "clear") {
    setImageScope("all", document.querySelector('[data-image-scope="all"]'));
    showToast("Image selection cleared");
  }
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
  htmlPicking = true;
  document.querySelector(".dashboard-page").dataset.picking = "true";
  document.querySelector('[data-html-scope="all"]').classList.remove("is-active");
  button.classList.add("is-active");
  showToast("Pick an element; keep picking to move the action capsule");
}

function useWholeHtmlPage() {
  htmlPicking = false;
  delete document.querySelector(".dashboard-page").dataset.picking;
  document.querySelector('[data-html-scope="all"]').classList.add("is-active");
  document.querySelector('[data-html-action="select"]').classList.remove("is-active");
  document.querySelectorAll("[data-html-element]").forEach((element) => element.classList.remove("is-picked"));
  document.querySelector("#htmlSelectionToolbar").hidden = true;
  contextTitle.textContent = "I can see the whole rendered page";
  contextDetail.textContent = "Rendered DOM · HTML/CSS · visible state";
  selectionScope.textContent = "Whole rendered page + source";
}

function positionSelectionLens(bar, target, container, preferredPlacement = "above", avoidElement = null) {
  const targetRect = typeof target.getBoundingClientRect === "function" ? target.getBoundingClientRect() : target;
  const containerRect = container.getBoundingClientRect();
  bar.hidden = false;
  const barRect = bar.getBoundingClientRect();
  const scrollLeft = container.scrollLeft || 0;
  const scrollTop = container.scrollTop || 0;
  const safeTop = scrollTop + 6;
  let safeBottom = scrollTop + container.clientHeight - 6;
  if (avoidElement && !avoidElement.hidden) {
    const avoidRect = avoidElement.getBoundingClientRect();
    safeBottom = Math.min(safeBottom, avoidRect.top - containerRect.top + scrollTop - 8);
  }

  const targetTop = targetRect.top - containerRect.top + scrollTop;
  const targetBottom = targetRect.bottom - containerRect.top + scrollTop;
  const centeredLeft = targetRect.left - containerRect.left + scrollLeft + (targetRect.width - barRect.width) / 2;
  const aboveTop = targetTop - barRect.height - 10;
  const belowTop = targetBottom + 10;
  const aboveFits = aboveTop >= safeTop;
  const belowFits = belowTop + barRect.height <= safeBottom;
  let placement = "above";
  let top = aboveTop;

  if (preferredPlacement === "below" && belowFits) {
    placement = "below";
    top = belowTop;
  } else if (aboveFits) {
    placement = "above";
    top = aboveTop;
  } else if (belowFits) {
    placement = "below";
    top = belowTop;
  } else {
    placement = "inside";
    const insideBottom = targetBottom - barRect.height - 10;
    const insideTop = targetTop + 10;
    const desiredInside = insideBottom >= safeTop ? insideBottom : insideTop;
    const maxTop = Math.max(safeTop, safeBottom - barRect.height);
    top = Math.max(safeTop, Math.min(maxTop, desiredInside));
  }

  const maxLeft = Math.max(6, container.scrollWidth - barRect.width - 6);
  bar.style.left = `${Math.max(6, Math.min(maxLeft, centeredLeft))}px`;
  bar.style.top = `${top}px`;
  bar.dataset.placement = placement;
}

function addToComposer(kind, scope = "selection") {
  const selectedCanvasNode = document.querySelector(".canvas-card.is-selected")?.dataset.canvasNode || "workflow";
  const excalSelection = document.querySelector("#excalSelectionLabel")?.textContent || "selected elements";
  const isAll = scope === "all" || scope === "document" || (kind === "pdf" && scope === "current" && pdfMode === "document");
  const imageSelectionContexts = {
    region: {
      label: `${surfaces.image.name} · rectangular selection`,
      detail: "Normalized rectangle bounds, selected pixels, OCR, source path, and revision",
    },
    lasso: {
      label: `${surfaces.image.name} · freehand mask`,
      detail: lassoSelections.image ? `Normalized point mask + bounds ${JSON.stringify(lassoSelections.image.normalizedBounds)} · view transform ${JSON.stringify(lassoSelections.image.viewTransform)} · pixels · OCR · source path + revision` : "No image mask selected",
    },
  };
  const contexts = {
    image: isAll ? {
      label: `${surfaces.image.name} · whole image`,
      detail: "Full-resolution image, dimensions, OCR, and source path",
    } : imageSelectionContexts[imageScope],
    html: {
      label: `${surfaces.html.name} · ${isAll ? "whole rendered page" : document.querySelector("#htmlSelectionLabel").textContent}`,
      detail: isAll ? "Rendered viewport, full DOM, source, and visible runtime state" : "Rendered element, DOM path, visible text, and local source",
    },
    pdf: {
      label: `${surfaces.pdf.name} · ${pdfMode === "document" ? "all 18 pages" : pdfMode === "page" ? `page ${document.querySelector("#pdfToolbarPage").textContent}` : `page ${document.querySelector("#pdfToolbarPage").textContent} ${pdfSelection?.kind || pdfMode}`}`,
      detail: pdfMode === "document" ? "Full document text, layout, images, and source citations" : pdfSelection?.composerDetail || pdfSelection?.text || "Selected PDF context with page geometry",
    },
    code: {
      label: `${surfaces.code.name} · ${isAll ? "whole file" : "selected code"}`,
      detail: !isAll && codeSelectionText ? `${codeSelectionText.slice(0, 72)}${codeSelectionText.length > 72 ? "…" : ""}` : "Current Python source, file path, and related Vault references",
    },
    canvas: {
      label: `${surfaces.canvas.name} · ${isAll ? "whole canvas" : `${selectedCanvasNode} card + neighbors`}`,
      detail: isAll ? "All native Canvas nodes, groups, edges, and file references" : "Native Canvas node, connected edges, and adjacent card labels",
    },
    excalidraw: {
      label: `${surfaces.excalidraw.name} · ${isAll ? "whole scene" : excalSelection}`,
      detail: isAll ? "All scene elements, labels, bindings, and element IDs" : "Selected element IDs, labels, bounds, and bound arrows",
    },
  };
  const context = contexts[kind];
  if (!context) return;

  promptFile.textContent = context.label;
  composerReceiptDetail.textContent = context.detail;
  composerReceipt.hidden = false;
  selectionScope.textContent = context.label.replace(`${surfaces[kind].name} · `, "");
  showToast(`${isAll ? "Whole file" : "Selection"} added to Composer context`);
}

function setPdfMode(mode, button) {
  pdfMode = mode;
  document.querySelectorAll("[data-pdf-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
  const page = document.querySelector("#pdfPage");
  const lassoLayer = document.querySelector("#pdfLassoLayer");
  const lassoHint = document.querySelector("#pdfLassoHint");
  const toolbar = document.querySelector("#pdfSelectionToolbar");
  const askButton = document.querySelector("#pdfAskButton");
  const addButton = document.querySelector(".pdf-add-button");
  const visiblePage = document.querySelector("#pdfToolbarPage").textContent;
  document.querySelectorAll("[data-pdf-select]").forEach((item) => item.classList.remove("is-pdf-selected"));
  clearLassoSelection("pdf", false);
  page.classList.toggle("is-lasso-mode", mode === "lasso");
  page.classList.toggle("is-page-selected", mode === "page");
  lassoLayer.toggleAttribute("hidden", mode !== "lasso");
  lassoHint.hidden = mode !== "lasso";
  toolbar.hidden = true;
  pdfSelection = mode === "page" ? { kind: "page", text: `Page ${visiblePage}`, composerDetail: `${surfaces.pdf.name} · page ${visiblePage} · full page geometry · source revision` } : null;
  askButton.disabled = mode === "text" || mode === "lasso";
  addButton.disabled = mode === "text" || mode === "lasso";

  if (mode === "document") {
    askButton.innerHTML = `${iconMarkup()}Ask document`;
    contextTitle.textContent = "I can read all 18 pages";
    contextDetail.textContent = "Text · layout · images · source citations";
    selectionScope.textContent = "Entire PDF · 18 pages";
    showToast("The complete PDF is the active context");
    return;
  }
  if (mode === "page") {
    askButton.innerHTML = `${iconMarkup()}Ask page ${visiblePage}`;
    document.querySelector("#pdfSelectionKind").textContent = "Page selection";
    document.querySelector("#pdfSelectionText").textContent = `Page ${visiblePage} · visible page`;
    document.querySelector("#pdfExtractAction").hidden = true;
    contextTitle.textContent = `I can see page ${visiblePage}`;
    contextDetail.textContent = "Full page text · layout · embedded regions";
    selectionScope.textContent = `Page ${visiblePage}`;
    showToast(`Page ${visiblePage} is selected; choose another page from the rail`);
    return;
  }
  if (mode === "text") {
    askButton.innerHTML = `${iconMarkup()}Select text first`;
    contextTitle.textContent = "Select a passage on the page";
    contextDetail.textContent = "The action capsule will appear beside the text";
    selectionScope.textContent = "Waiting for text selection";
    showToast("Click a passage; actions will appear beside it");
    return;
  }

  const currentPage = document.querySelector("#pdfToolbarPage").textContent;
  askButton.innerHTML = `${iconMarkup()}Draw lasso first`;
  document.querySelector("#pdfExtractAction").hidden = true;
  document.querySelector("#pdfClearAction").hidden = true;
  contextTitle.textContent = "Circle a PDF region";
  contextDetail.textContent = `${surfaces.pdf.name} · p.${currentPage} · mask, bounds, and OCR will be retained`;
  selectionScope.textContent = `Waiting for PDF lasso · page ${currentPage}`;
  showToast("Use the pen to circle any text, table, or figure");
}

function selectPdfContent(element) {
  const kind = element.dataset.pdfSelect;
  if (pdfMode !== "text") return;
  if (pdfMode === "text" && window.getSelection()?.toString().trim()) return;
  if (pdfMode === "text" && kind !== "passage") {
    showToast("Switch to Lasso to circle this visual region");
    return;
  }

  document.querySelectorAll("[data-pdf-select]").forEach((item) => item.classList.toggle("is-pdf-selected", item === element));
  const text = element.textContent.trim().replace(/\s+/g, " ");
  const page = document.querySelector("#pdfToolbarPage").textContent;
  pdfSelection = { kind, text };
  pdfSelection.composerDetail = `${surfaces.pdf.name} · page ${page} · exact text · source geometry + revision · ${text.slice(0, 80)}`;
  document.querySelector("#pdfSelectionKind").textContent = `Passage · page ${page}`;
  document.querySelector("#pdfSelectionText").textContent = `“${text.slice(0, 48)}${text.length > 48 ? "…" : ""}”`;
  document.querySelector("#pdfExtractAction").hidden = true;
  document.querySelector("#pdfClearAction").hidden = true;
  const toolbar = document.querySelector("#pdfSelectionToolbar");
  positionSelectionLens(toolbar, element, document.querySelector("#pdfCanvas"));
  document.querySelector("#pdfAskButton").innerHTML = `${iconMarkup()}Ask text`;
  document.querySelector("#pdfAskButton").disabled = false;
  document.querySelector(".pdf-add-button").disabled = false;
  selectionScope.textContent = `Selected passage · page ${page}`;
  contextTitle.textContent = "I can see the PDF selection";
  contextDetail.textContent = `Exact text · page ${page} · source geometry`;
}

function completePdfLasso(selection) {
  const page = document.querySelector("#pdfToolbarPage").textContent;
  document.querySelector("#pdfLassoHint").hidden = true;
  pdfSelection = {
    kind: "lasso",
    text: `${surfaces.pdf.name} · page ${page} · freehand region`,
    normalizedBounds: selection.normalizedBounds,
    normalizedPoints: selection.normalizedPoints,
    composerDetail: `${surfaces.pdf.name} · p.${page} · lasso mask + normalized bounds ${JSON.stringify(selection.normalizedBounds)} · selected text/OCR · source revision`,
  };
  document.querySelector("#pdfSelectionKind").textContent = `Lasso region · page ${page}`;
  document.querySelector("#pdfSelectionText").textContent = "Mask, bounds, nearby text, and OCR retained";
  document.querySelector("#pdfExtractAction").hidden = false;
  document.querySelector("#pdfClearAction").hidden = false;
  positionSelectionLens(document.querySelector("#pdfSelectionToolbar"), selection.viewportBounds, document.querySelector("#pdfCanvas"));
  document.querySelector("#pdfAskButton").innerHTML = `${iconMarkup()}Ask lasso`;
  document.querySelector("#pdfAskButton").disabled = false;
  document.querySelector(".pdf-add-button").disabled = false;
  selectionScope.textContent = `Lasso region · page ${page}`;
  contextTitle.textContent = "I can see the circled PDF region";
  contextDetail.textContent = `${surfaces.pdf.name} · p.${page} · mask · normalized bounds · OCR`;
  showToast(`PDF lasso ready · ${surfaces.pdf.name} · page ${page}`);
}

function selectPdfPage(page) {
  document.querySelectorAll("[data-pdf-page]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.pdfPage === page);
  });
  document.querySelector("#pdfPageNumber").textContent = page;
  document.querySelector("#pdfToolbarPage").textContent = page;
  if (pdfMode === "page") {
    pdfSelection = { kind: "page", text: `Page ${page}`, composerDetail: `${surfaces.pdf.name} · page ${page} · full page geometry · source revision` };
    document.querySelector("#pdfSelectionText").textContent = `Page ${page} · visible page`;
    document.querySelector("#pdfAskButton").innerHTML = `${iconMarkup()}Ask page ${page}`;
    selectionScope.textContent = `Page ${page}`;
  }
  if (pdfMode === "lasso") {
    clearLassoSelection("pdf", false);
    document.querySelector("#pdfLassoHint").hidden = false;
    document.querySelector("#pdfAskButton").innerHTML = `${iconMarkup()}Draw lasso first`;
    document.querySelector("#pdfAskButton").disabled = true;
    document.querySelector(".pdf-add-button").disabled = true;
    contextTitle.textContent = `Circle a region on page ${page}`;
    contextDetail.textContent = `${surfaces.pdf.name} · p.${page} · awaiting freehand mask`;
    selectionScope.textContent = `Waiting for PDF lasso · page ${page}`;
  }
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

function positionCanvasSelection(node) {
  const board = document.querySelector(".canvas-board");
  positionSelectionLens(document.querySelector("#canvasSelectionToolbar"), node, board, "below");
  const menu = document.querySelector("#canvasNativeNodeMenu");
  const nodeRect = node.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  menu.style.left = `${Math.max(8, nodeRect.right - boardRect.left - menu.offsetWidth)}px`;
  menu.style.top = `${Math.max(8, nodeRect.top - boardRect.top - menu.offsetHeight - 6)}px`;
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
    const scopeLabel = pdfMode === "document" ? "all 18 pages" : pdfMode === "page" ? `page ${document.querySelector("#pdfToolbarPage").textContent}` : pdfMode === "text" ? "selected text" : `lasso on page ${document.querySelector("#pdfToolbarPage").textContent}`;
    showAnswer(`Answer from ${scopeLabel}`, [
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
      'The extracted structure remains linked to the PDF file, page, freehand mask, and normalized page geometry. <button class="citation" data-citation-page="1" data-citation-target="pdfCallouts">p.1 · lasso region</button>',
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
  if (action === "describe-image-region") {
    const selectionNames = { region: "rectangular image area", lasso: "freehand image selection" };
    showAnswer(`Understanding the ${selectionNames[imageScope] || "image selection"}`, [
      "The selected content contains the central Peak reasoning stage and its incoming source connections.",
      "Only the active selection was used. Its native bounds or mask can move into Composer without changing the source image.",
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
    "remove-object": ["Selection edit ready", "Selected region replaced · original protected · one generated version"],
    "extend-image": ["Expanded frame ready", "Generated surroundings extend the image by 18% on both sides"],
    "crop-image-mask": ["Freehand crop ready", "Bounds fit the lasso · outside-mask pixels stay transparent for PNG/WebP"],
    "change-html": ["Element update ready", "Selected service card rewritten · live page remains visible"],
    "materialize-pdf": ["Linked note ready", "Highlights, extracted text, and page citations will be written to a new Markdown note"],
    "connect-canvas": ["Canvas edge proposed", "Preview one native connection from Workflow to Launch brief"],
    "create-canvas-cards": ["Canvas cards proposed", "Three native cards will be added inside Peak launch system"],
    "brief-canvas": ["Linked brief ready", "The selected group will become a sourced Markdown brief"],
    "generate-diagram": ["Scene elements ready", "Four native shapes and three bound arrows will be added"],
    "rewrite-labels": ["Label changes ready", "Three labels clarified inside the existing elements"],
    "tidy-diagram": ["Scene layout ready", "Spacing and alignment changed; shapes and arrow bindings preserved"],
  };
  const [title, description] = candidates[action] || ["AI suggestion ready", "Review this suggestion before it changes the source."];
  showCandidate(action, title, description);
  showAnswer("Suggestion prepared", [description, "The source surface remains active. Accept or restore from the bar over the file."]);
}

function completeCandidate(action) {
  const accepted = action === "accept";
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

  const imageScopeButton = event.target.closest("[data-image-scope]");
  if (imageScopeButton) {
    setImageScope(imageScopeButton.dataset.imageScope, imageScopeButton);
    return;
  }

  const imageRotateButton = event.target.closest("[data-image-rotate]");
  if (imageRotateButton) {
    rotateImage(imageRotateButton.dataset.imageRotate);
    return;
  }

  const imageZoomButton = event.target.closest("[data-image-zoom]");
  if (imageZoomButton) {
    updateImageZoom(imageZoomButton.dataset.imageZoom);
    return;
  }

  const imageSelectionAction = event.target.closest("[data-image-selection-action]");
  if (imageSelectionAction) {
    handleImageSelectionAction(imageSelectionAction.dataset.imageSelectionAction);
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

  const htmlWholePage = event.target.closest('[data-html-scope="all"]');
  if (htmlWholePage) {
    useWholeHtmlPage();
    showToast("Whole rendered page is the active context");
    return;
  }

  const htmlElement = event.target.closest("[data-html-element]");
  if (htmlElement && htmlPicking) {
    document.querySelectorAll("[data-html-element]").forEach((element) => element.classList.toggle("is-picked", element === htmlElement));
    const elementLabel = htmlElement.dataset.htmlLabel || `section.${htmlElement.classList[0]}`;
    document.querySelector("#htmlSelectionLabel").textContent = elementLabel;
    positionSelectionLens(document.querySelector("#htmlSelectionToolbar"), htmlElement, document.querySelector(".browser-preview"));
    selectionScope.textContent = `Selected ${elementLabel}`;
    contextTitle.textContent = "I can see the selected page element";
    contextDetail.textContent = `${elementLabel} · rendered state · local source`;
    showToast("Element selected; pick another element anytime");
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

  const pdfLassoAction = event.target.closest("[data-pdf-lasso-action]");
  if (pdfLassoAction) {
    clearLassoSelection("pdf");
    showToast("PDF lasso cleared");
    return;
  }

  const actionButton = event.target.closest("[data-ai-action]");
  if (actionButton) {
    handleAiAction(actionButton.dataset.aiAction);
    return;
  }

  const addComposerButton = event.target.closest("[data-add-composer]");
  if (addComposerButton) {
    addToComposer(addComposerButton.dataset.addComposer, addComposerButton.dataset.contextScope || "selection");
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
    document.querySelector("#canvasSelectionLabel").textContent = `${canvasNode.dataset.canvasNode} card + neighbors`;
    positionCanvasSelection(canvasNode);
    contextTitle.textContent = "I can see the selected Canvas card";
    contextDetail.textContent = `${canvasNode.dataset.canvasNode} · connected edges · neighboring cards`;
    showToast("Canvas actions moved to the newly selected card");
    return;
  }

  const excalElement = event.target.closest("[data-excal-element]");
  if (excalElement) {
    document.querySelectorAll("[data-excal-element]").forEach((element) => element.classList.toggle("is-scene-selected", element === excalElement));
    const label = excalElement.dataset.excalElement;
    document.querySelector("#excalSelectionLabel").textContent = label;
    positionSelectionLens(document.querySelector(".excalidraw-selection-bar"), excalElement, document.querySelector(".excalidraw-board"), "below");
    selectionScope.textContent = `Selected ${label}`;
    contextTitle.textContent = "I can see the selected Excalidraw elements";
    contextDetail.textContent = `${label} · bounds · labels · bindings`;
    showToast("Excalidraw actions moved to the new selection");
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

document.querySelector("#exportQuality").addEventListener("input", updateExportEstimate);
document.querySelector("#exportWidth").addEventListener("input", updateExportEstimate);
document.querySelector("#exportHeight").addEventListener("input", updateExportEstimate);

document.querySelector("#imageLassoLayer").addEventListener("pointerdown", (event) => beginLasso(event, "image"));
document.querySelector("#pdfLassoLayer").addEventListener("pointerdown", (event) => beginLasso(event, "pdf"));

const cropOverlay = document.querySelector("#cropOverlay");
cropOverlay.querySelectorAll("[data-crop-handle]").forEach((handle) => {
  handle.addEventListener("pointerdown", (event) => startRectDrag(
    event,
    cropOverlay,
    document.querySelector("#imageFrame"),
    handle.dataset.cropHandle,
    updateCropLabel,
    () => setDirty("Crop adjusted · not saved"),
  ));
});
cropOverlay.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-crop-handle]")) return;
  startRectDrag(event, cropOverlay, document.querySelector("#imageFrame"), "move", updateCropLabel, () => setDirty("Crop moved · not saved"));
});

const imageRegion = document.querySelector("#imageRegionSelection");
imageRegion.querySelectorAll("[data-region-handle]").forEach((handle) => {
  handle.addEventListener("pointerdown", (event) => startRectDrag(
    event,
    imageRegion,
    document.querySelector("#imageFrame"),
    handle.dataset.regionHandle,
    updateImageRegionLabel,
    updateImageRegionLabel,
  ));
});
imageRegion.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-region-handle]")) return;
  startRectDrag(event, imageRegion, document.querySelector("#imageFrame"), "move", updateImageRegionLabel, updateImageRegionLabel);
});

document.querySelector("#pdfPage").addEventListener("mouseup", () => {
  if (pdfMode !== "text") return;
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || "";
  if (!selectedText || !document.querySelector("#pdfPage").contains(selection.anchorNode)) return;
  const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
  const page = document.querySelector("#pdfToolbarPage").textContent;
  pdfSelection = {
    kind: "text",
    text: selectedText,
    composerDetail: `${surfaces.pdf.name} · page ${page} · exact text · source geometry + revision · ${selectedText.slice(0, 80)}`,
  };
  document.querySelector("#pdfSelectionKind").textContent = `Text · page ${page}`;
  document.querySelector("#pdfSelectionText").textContent = `“${selectedText.slice(0, 48)}${selectedText.length > 48 ? "…" : ""}”`;
  document.querySelector("#pdfExtractAction").hidden = true;
  positionSelectionLens(document.querySelector("#pdfSelectionToolbar"), selectionRect, document.querySelector("#pdfCanvas"));
  document.querySelector("#pdfAskButton").innerHTML = `${iconMarkup()}Ask text`;
  document.querySelector("#pdfAskButton").disabled = false;
  document.querySelector(".pdf-add-button").disabled = false;
  contextTitle.textContent = "I can see the selected PDF text";
  contextDetail.textContent = `Exact text · page ${page} · source geometry`;
  selectionScope.textContent = `Selected text · page ${page}`;
});

document.addEventListener("pointermove", appendLassoPoint);
document.addEventListener("pointermove", dragSurfaceRect);
document.addEventListener("pointerup", finishLasso);
document.addEventListener("pointerup", endSurfaceRectDrag);
document.addEventListener("pointercancel", finishLasso);
document.addEventListener("pointercancel", endSurfaceRectDrag);

document.querySelector("#imageFrame").addEventListener("wheel", (event) => {
  if (!document.querySelector("#cropStudio").hidden) return;
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
  const selectionToolbar = document.querySelector("#codeSelectionToolbar");
  if (!selectedText || !codeEditor.contains(selection.anchorNode)) {
    selectionToolbar.hidden = true;
    return;
  }
  codeSelectionText = selectedText;
  const lineCount = selectedText.split("\n").length;
  const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
  document.querySelector("#codeSelectionLabel").textContent = `${lineCount} line${lineCount === 1 ? "" : "s"} selected`;
  positionSelectionLens(selectionToolbar, selectionRect, document.querySelector(".code-editor"));
  selectionScope.textContent = `${lineCount} line${lineCount === 1 ? "" : "s"} selected in index_pipeline.py`;
  contextTitle.textContent = "I can see the selected code";
  contextDetail.textContent = `Python · ${lineCount} selected line${lineCount === 1 ? "" : "s"} · related Vault files`;
  document.querySelector("#codeEditState").textContent = `${lineCount} line${lineCount === 1 ? "" : "s"} selected · edit or add to Composer`;
});
codeEditor.addEventListener("keyup", () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) document.querySelector("#codeSelectionToolbar").hidden = true;
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
