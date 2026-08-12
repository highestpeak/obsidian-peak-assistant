import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const [html, css, js, research, readme] = await Promise.all([
  readFile(join(root, "index.html"), "utf8"),
  readFile(join(root, "mock.css"), "utf8"),
  readFile(join(root, "mock.js"), "utf8"),
  readFile(join(root, "research.html"), "utf8"),
  readFile(join(root, "README.md"), "utf8"),
]);

const formats = ["image", "html", "pdf", "code", "canvas", "excalidraw"];
for (const format of formats) {
  assert.match(html, new RegExp(`data-surface="${format}"`), `${format} surface missing`);
  assert.match(html, new RegExp(`data-surface-tab="${format}"`), `${format} switcher missing`);
  assert.match(js, new RegExp(`\\b${format}: \\{`), `${format} AI configuration missing`);
}

assert.match(html, /class="intelligence-panel"/, "always-visible Intelligence panel missing");
assert.match(html, /id="candidateReview"/, "candidate review missing");
assert.match(html, /Accept/, "candidate Accept action missing");
assert.match(html, /Restore/, "candidate Restore action missing");
assert.match(js, /data-citation-page/, "PDF page citations missing");
assert.match(html, /id="imageLassoLayer"/, "Image freehand layer missing");
assert.match(html, /id="imageLassoPath"/, "Image freehand mask path missing");
assert.match(html, /id="lasso-outline-purple"[\s\S]+feMorphology[\s\S]+operator="out"/, "Completed lasso must derive its visible outline from the filled-region silhouette");
assert.doesNotMatch(html, /lasso-outline-white/, "Retired duplicate crop mask filter must not remain");
assert.equal((html.match(/class="lasso-hit-area"/g) || []).length, 2, "Image and PDF lasso each need a full-surface hit target");
assert.match(html, /data-image-workflow="select"[\s\S]+data-image-workflow="crop"/, "Select and Crop must be the two direct image tasks");
assert.match(html, /id="imageMethodPanel"[^>]+hidden[\s\S]+data-image-method="rectangle"[\s\S]+data-image-method="freehand"/, "Rectangle and Freehand must appear in the temporary method panel");
assert.match(html, /class="image-dock-primary"[\s\S]+data-image-workflow="crop"[\s\S]+id="imageMethodPanel"[\s\S]+class="toolbar-divider"/, "The method panel must live inline after the active image task, before the next primary group");
assert.doesNotMatch(html, /image-method-title|imageMethodTitle|imageMethodDetail/, "The rejected second-row method summary must not return");
assert.doesNotMatch(html, /data-image-method="whole"|data-image-scope=/, "Whole must not return as a selection method or persistent scope segment");
assert.match(html, /id="imageSelectionToolbar"[^>]+hidden[\s\S]+data-ai-action="describe-image-region"[\s\S]+data-add-composer="image"[\s\S]+data-ai-action="remove-object"[\s\S]+data-image-selection-action="clear"/, "Image selection lens must expose Ask, Add, contextual AI edit, and Clear together");
assert.doesNotMatch(html, /data-image-scope="object"|id="imageObjectSelection"|id="imageSelectPopover"/, "Object detect and the old Select popover must not return");
assert.match(html, /id="imageRegionSelection"[^>]+hidden/, "Resizable rectangular image selection missing");
assert.equal((html.match(/data-region-handle=/g) || []).length, 8, "Rectangle selection needs eight handles");
assert.equal((html.match(/data-crop-handle=/g) || []).length, 8, "Crop needs eight handles");
assert.match(html, /id="imageMethodPanel"[\s\S]+id="cropCommit"[^>]+hidden[\s\S]+data-crop-action="cancel"[\s\S]+data-crop-action="done"/, "Crop must extend the shared method panel with explicit commit controls");
assert.doesNotMatch(html, /data-crop-mode=|data-crop-ratio=|id="cropAngle"|data-crop-rotate=/, "Nested crop modes, ratios, and rotation must not return");
assert.match(html, /data-image-rotate="left"/, "Primary left rotation missing");
assert.match(html, /data-image-rotate="right"/, "Primary right rotation missing");
assert.match(html, /class="dock-icon-button" data-image-tool="export" aria-label="Export"[^>]*>[\s\S]*?#i-download[\s\S]*?<\/button>/, "Export must be an accessible icon-only primary action");
assert.doesNotMatch(html, /data-image-tool="export"[^>]*>[\s\S]*?<span>Export<\/span>/, "Export text label must not crowd the primary dock");
assert.match(html, /class="image-export-sheet"/, "Image export sheet missing");
assert.match(html, /id="exportQuality"/, "Export quality control missing");
assert.match(html, /id="exportEstimate"/, "Live export estimate missing");
assert.match(html, /id="exportWidth"/, "Optional export dimensions missing");
assert.match(html, /id="imageContextDock"[\s\S]+class="dock-zoom"[\s\S]+id="imageExportSheet"/, "Image zoom and Export must remain inside the originating dock");
assert.match(html, /data-add-composer="image" data-context-scope="all"[^>]+aria-label="Add whole image to Composer"[^>]*>[\s\S]*?#i-plus[\s\S]*?<span>Composer<\/span>/, "Primary Composer handoff must remain explicit without the long overflowing label");
assert.match(html, /data-image-ai-toggle[^>]+aria-expanded="false"[\s\S]+id="imageAiPanel"[^>]+hidden[\s\S]+data-image-ai-action="cleanup"[\s\S]+data-image-ai-action="replace"[\s\S]+data-image-ai-action="remove-background"[\s\S]+data-image-ai-action="expand"/, "AI edit must expose the four researched shortcuts inline");
assert.doesNotMatch(html, /class="image-zoom"/, "Detached image zoom controls must not return");
assert.doesNotMatch(html, /data-image-tool="resize"/, "Resize must not return as a primary image tool");
assert.doesNotMatch(html, /data-image-tool="compress"/, "Opaque one-click Compress must not return");
assert.match(js, /remove-background/, "Image background removal action missing");
assert.match(html, /data-editable-source="code" contenteditable="plaintext-only"/, "Code must be directly editable");
assert.match(html, /data-html-action="source"/, "HTML local source action missing");
for (const metric of ["metric-deploy", "metric-incidents", "metric-latency"]) {
  assert.match(html, new RegExp(`data-html-element="${metric}"[^>]+data-html-label=`), `HTML selectable metric missing: ${metric}`);
}
assert.match(html, /data-pdf-zoom="in"/, "PDF zoom action missing");
assert.match(html, /data-pdf-mode="text"/, "PDF text selection mode missing");
assert.match(html, /data-pdf-mode="lasso"/, "PDF freehand lasso mode missing");
assert.match(html, /data-pdf-mode="document"/, "Whole-PDF selection mode missing");
assert.match(html, /data-pdf-mode="page"/, "PDF page selection mode missing");
assert.match(html, /id="pdfLassoLayer"[\s\S]+id="pdfLassoPath"/, "PDF freehand mask layer missing");
assert.doesNotMatch(html, /pdfAreaSelection|data-pdf-area-handle|data-pdf-mode="region"/, "PDF rectangle area selection must not return");
assert.match(html, /data-pdf-select="passage"/, "PDF passage target missing");
assert.match(html, /data-pdf-select="region"/, "PDF region target missing");
assert.match(js, /data-citation-target/, "PDF citations must return to exact page geometry");
assert.match(html, /class="[^"]*canvas-selection-tools[^"]*follows-selection/, "Canvas selection-following controls missing");
assert.match(html, /class="canvas-create-toolbar"/, "native-like Canvas create toolbar missing");
assert.match(html, /class="excalidraw-tools"/, "Excalidraw tool palette missing");
assert.match(html, /class="excalidraw-properties"/, "Excalidraw properties missing");
for (const format of ["image", "html", "pdf", "code", "canvas", "excalidraw"]) {
  assert.match(html, new RegExp(`data-add-composer="${format}"`), `${format} selection-to-Composer action missing`);
}
for (const format of ["image", "html", "code", "canvas", "excalidraw"]) {
  assert.match(html, new RegExp(`data-add-composer="${format}"[^>]+data-context-scope="all"`), `${format} whole-file Composer handoff missing`);
}
assert.match(html, /id="codeSelectionToolbar"[^>]+hidden/, "Code selection-local toolbar missing");
assert.doesNotMatch(html, /data-ai-action="change-code"/, "Code selection must not expose Change");
assert.doesNotMatch(js, /"change-code"|"fix-code"/, "Code suggestion actions must not return");
assert.match(html, /data-excal-element="Peak diamond"/, "Excalidraw selectable element missing");
assert.doesNotMatch(html, />Symbols?</i, "Code UI must not expose Symbols navigation");
assert.doesNotMatch(html, /project explorer/i, "Code UI must not expose a project explorer");
assert.doesNotMatch(html, /data-view-mode|class="view-modes"|class="code-diff"/, "global file modes must not return");
assert.doesNotMatch(html, /class="intelligence-tabs"/, "Intelligence tab strip must not return");
assert.doesNotMatch(js, /\bmodes:|defaultMode|setMode\(/, "runtime mode system must not return");

assert.match(css, /grid-template-columns:\s*minmax\(700px,\s*1fr\) 390px/, "equal-height file/Intelligence split missing");
assert.match(css, /\.file-column[^}]+grid-template-rows:\s*58px minmax\(0,\s*1fr\)/, "file column layout missing");
assert.match(css, /\.intelligence-panel[^}]+height:\s*100%/, "Intelligence must span the whole workspace height");
assert.match(html, /current file connected/i, "context connection language missing from prototype");
assert.match(js, /source surface remains active/i, "source-active AI response missing");
assert.match(js, /handleImageTool|openImageWorkflow|setImageMethod|fillImageRectangle|startRectDrag|dragSurfaceRect|rotateImage|closeImageWorkflow|beginLasso|appendLassoPoint|finishLasso|normalizedLassoSelection|handleImageSelectionAction|updateExportEstimate|toggleHtmlSource|positionSelectionLens|setPdfMode|completePdfLasso|selectPdfContent|addToComposer|codeEditor\.addEventListener\("input"\)|positionCanvasSelection|handleExcalStyle/, "direct interaction handlers missing");
assert.match(js, /lassoSelections = \{ image: null, pdf: null \}/, "Image selection must be the single freehand geometry source for selection and Crop");
assert.match(js, /setImageMethod\("rectangle", document\.querySelector\('\[data-image-method="rectangle"\]'\), true\)/, "Select and Crop must both open with Rectangle as the default method");
assert.match(js, /function fillImageRectangle[\s\S]+element\.style\.inset = "0"/, "The default Rectangle must cover the whole image");
assert.match(js, /panel\.dataset\.task = task;[\s\S]+button\.after\(panel\)/, "Rectangle and Freehand must move directly after the active Select or Crop button");
assert.match(js, /coversWholeImage[\s\S]+"Whole image · drag to refine"/, "The default full-image rectangle must identify itself as whole-image context");
assert.match(js, /function updateImageRegionLabel[\s\S]+showImageSelectionLens\("Rectangle"/, "Select Rectangle must open the Ask / Composer Selection Lens immediately");
assert.match(js, /function updateCropLabel[\s\S]+showImageSelectionLens\("Crop rectangle"/, "Crop Rectangle must also expose the contextual Selection Lens immediately");
assert.match(js, /if \(method === "freehand"\)[\s\S]+layer\.toggleAttribute\("hidden", false\)/, "Freehand must replace the rectangle with the drawing layer");
assert.match(js, /function completeImageLasso[\s\S]+showImageSelectionLens\(kind/, "Freehand must open the Selection Lens only after the contour closes");
assert.doesNotMatch(js, /imageCrop|setCropMode|setCropRatio|cropStraighten/, "Retired nested Crop state must not remain in the runtime");
assert.match(js, /setPointerCapture\?\.\(event\.pointerId\)/, "Lasso drag must capture the active pointer");
assert.match(js, /releasePointerCapture\(state\.pointerId\)/, "Lasso drag must release pointer capture");
assert.match(js, /renderLassoPath\(activeLasso\);[\s\S]+renderLassoPath\(state, true\);/, "Lasso must remain open while drawing and close only on pointer release");
assert.match(js, /closed \? " Z" : ""/, "Lasso path must not connect the current point to the origin before completion");
assert.match(js, /layer\.toggleAttribute\("hidden", false\)/, "Image SVG lasso visibility must remove the hidden attribute");
assert.match(js, /lassoLayer\.toggleAttribute\("hidden", mode !== "lasso"\)/, "PDF SVG lasso visibility must remove the hidden attribute");
assert.doesNotMatch(js, /(?:layer|lassoLayer)\.hidden\s*=/, "SVG lasso layers cannot use HTMLElement.hidden assignment");
assert.match(js, /normalizedPoints[\s\S]+normalizedBounds/, "Shared normalized lasso envelope missing");
assert.match(js, /knowledge-work-ai-era\.pdf[\s\S]+p\.\$\{page\}[\s\S]+lasso mask \+ normalized bounds/, "PDF Composer receipt must retain file, page, mask, and bounds");
assert.match(css, /\.selection-context-bar\.follows-selection/, "shared selection-following capsule styles missing");
assert.match(js, /function positionSelectionLens\(bar, target, container, preferredPlacement = "above", avoidElements = \[\]\)/, "Selection Lens must accept multiple collision boundaries");
assert.match(js, /avoidRect\.top - containerRect\.top \+ scrollTop - 8/, "Selection Lens must reserve space above the image dock");
assert.match(js, /placement = "inside"[\s\S]+targetBottom - barRect\.height - 10/, "Selection Lens must fall back inside a large selection");
assert.match(js, /positionSelectionLens\(toolbar, target, frame, "above", \[document\.querySelector\("#imageContextDock"\)\]\)/, "Image selection controls must avoid the unified inline dock");
assert.match(css, /\.selection-context-bar\.follows-selection\[data-placement="inside"\]::after\{display:none\}/, "Inside Selection Lens placement must not render a misleading pointer");
assert.match(css, /\.freehand-layer\{[^}]+touch-action:none/, "Shared freehand pointer layer missing");
assert.match(css, /\.freehand-layer\.is-drawing \.lasso-mask\{fill:none;[^}]*stroke-dasharray:[^}]+\}/, "Freehand drawing must show only the sampled trail without a temporary closing fill");
assert.match(css, /\.lasso-hit-area\{[^}]*fill:transparent[^}]*pointer-events:all/, "Lasso needs a painted full-surface SVG hit target");
assert.match(css, /\.lasso-mask\{[^}]*fill-rule:nonzero[^}]*stroke:none[^}]*filter:url\(#lasso-outline-purple\)[^}]*pointer-events:none/, "Completed lasso must render only the filled-region silhouette and its external outline");
assert.match(css, /\.image-context-toolbar \.image-export-sheet\{position:absolute/, "Export must be anchored to the image dock");
assert.match(css, /\.image-context-toolbar\{box-sizing:border-box;width:max-content;max-width:calc\(100% - 20px\)[^}]+\}/, "Image dock must use content width while staying bounded by the image frame");
assert.match(css, /\.image-dock-primary\{width:max-content;max-width:100%;min-width:0[^}]+justify-content:flex-start/, "Primary image tools must remove the forced full-width blank area");
assert.match(css, /\.image-method-panel,\.image-ai-panel\{[^}]+flex:0 0 auto[^}]+max-width:0[^}]+overflow:hidden/, "Method and AI controls must expand inline instead of floating above the dock");
assert.match(css, /\.image-method-panel\[data-task="crop"\]\{--inline-panel-width:340px\}/, "Crop commit controls need enough inline reveal width");
assert.match(css, /\.image-method-panel\.is-entering,\.image-ai-panel\.is-entering\{animation:dock-inline-reveal 170ms/, "Inline controls need a restrained expansion animation");
assert.match(css, /@keyframes dock-inline-reveal\{from\{max-width:0;opacity:0;transform:scaleX\(\.94\)\}to\{max-width:var\(--inline-panel-width\)/, "Dock controls must grow horizontally from their trigger");
assert.match(css, /\.image-method-panel\.is-leaving,\.image-ai-panel\.is-leaving\{pointer-events:none;animation:dock-inline-dismiss 120ms/, "Inline controls need a short non-interactive collapse animation");
assert.doesNotMatch(css, /\.image-scope-switch|\.crop-studio/, "The rejected persistent scope group and Crop-only panel must not remain");
assert.doesNotMatch(css, /\.crop-mode-switch|\.crop-presets|\.crop-angle|\.crop-rectangle-controls/, "Retired nested Crop hierarchy must not remain in CSS");
assert.doesNotMatch(css, /\.image-context-toolbar:has\(/, "Opening Crop must not resize or move the image dock");
assert.match(readme, /stable dock has two explicit tasks: Select and\s+Crop/i, "README must record the Select / Crop task hierarchy");
assert.match(readme, /Clean up \/ Replace \/ Remove BG \/ Expand/, "README must record the researched quick AI set");
assert.match(js, /function handleImageAiQuick[\s\S]+cleanup-image-selection[\s\S]+remove-background[\s\S]+extend-image/, "Quick image AI actions must route to explicit reviewable candidates");
assert.match(js, /promptInput\.value = "Replace the selected area with ";[\s\S]+promptInput\.focus\(\)/, "Replace must request a prompt in Composer instead of guessing");
assert.match(js, /#pdfPage"\)\.addEventListener\("mouseup"/, "PDF native text selection must open contextual actions");

const officialSources = [
  "helpx.adobe.com/photoshop",
  "helpx.adobe.com/acrobat",
  "support.goodnotes.com/hc/en-us/articles/10779390143247",
  "support.goodnotes.com/hc/en-us/articles/7353727617295",
  "support.google.com/photos",
  "support.apple.com",
  "canva.com/features/ai-photo-editing",
  "help.openai.com/en/articles/11084440-images-in-chatgpt",
  "photoroom.com/tools",
  "code.visualstudio.com/docs/languages/html",
  "obsidian.md/help/Plugins/Canvas",
  "github.com/excalidraw/excalidraw",
  "docs.excalidraw.com",
  "github.com/steveruizok/perfect-freehand",
  "mozilla.github.io/pdf.js/examples",
  "github.com/DanielArnould/react-pdf-highlighter-extended",
  "konvajs.org/docs/sandbox/Free_Drawing",
];
for (const source of officialSources) {
  assert.match(research, new RegExp(source.replaceAll(".", "\\.")), `research source missing: ${source}`);
}

const publicDemandSources = [
  "reddit.com/r/SideProject/comments/1urhn9s",
  "reddit.com/r/StableDiffusion/comments/1ovklz3",
  "reddit.com/r/photoshop/comments/13rhq82",
  "reddit.com/r/Depop/comments/1u5sx0u",
  "reddit.com/r/SideProject/comments/1sq3sj4",
];
for (const source of publicDemandSources) {
  assert.match(research, new RegExp(source.replaceAll(".", "\\.")), `public image-edit demand source missing: ${source}`);
}
assert.match(research, /定性抽样，不是市场份额或需求量统计/, "Public demand research must keep its qualitative evidence boundary");

assert.match(research, /production implementation pending/i, "design-only status missing");
assert.match(research, /Rejected V1/, "rejected predecessor not identified");
assert.match(readme, /Design-only successor/, "README status boundary missing");

console.log("Peak File Workspace Composer-aligned prototype: static contract OK");
