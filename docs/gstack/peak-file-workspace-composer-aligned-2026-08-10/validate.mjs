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
assert.match(html, /id="cropFreehandLayer"[\s\S]+id="cropFreehandPath"/, "Freehand crop layer missing");
assert.match(html, /id="lasso-outline-purple"[\s\S]+feMorphology[\s\S]+operator="out"[\s\S]+id="lasso-outline-white"/, "Completed lasso must derive its visible outline from the filled-region silhouette");
assert.equal((html.match(/class="lasso-hit-area"/g) || []).length, 3, "Image selection, freehand crop, and PDF lasso each need a full-surface hit target");
assert.match(html, /class="scope-switch image-scope-switch"[\s\S]+data-image-scope="all"[\s\S]+data-image-scope="region"[\s\S]+data-image-scope="lasso"/, "Whole, Rectangle, and Freehand must be direct dock buttons");
assert.match(html, /id="imageSelectionToolbar"[^>]+hidden[\s\S]+data-ai-action="describe-image-region"[\s\S]+data-add-composer="image"[\s\S]+data-ai-action="remove-object"[\s\S]+data-image-selection-action="clear"/, "Image selection lens must expose Ask, Add, contextual AI edit, and Clear together");
for (const scope of ["all", "region", "lasso"]) assert.match(html, new RegExp(`data-image-scope="${scope}"`), `Image ${scope} selection missing`);
assert.doesNotMatch(html, /data-image-scope="object"|id="imageObjectSelection"|id="imageSelectPopover"/, "Object detect and the Select popover must not return");
assert.match(html, /id="imageRegionSelection"[^>]+hidden/, "Resizable rectangular image selection missing");
assert.equal((html.match(/data-region-handle=/g) || []).length, 8, "Rectangle selection needs eight handles");
assert.equal((html.match(/data-crop-handle=/g) || []).length, 8, "Crop needs eight handles");
assert.match(html, /id="cropStudio"[^>]+hidden/, "Dock-anchored crop controls missing");
assert.match(html, /data-crop-mode="rectangle"/, "Rectangle crop mode missing");
assert.match(html, /data-crop-mode="freehand"/, "Freehand crop mode missing");
for (const ratio of ["unlocked", "original", "square", "classic", "wide"]) assert.match(html, new RegExp(`data-crop-ratio="${ratio}"`), `Crop ratio missing: ${ratio}`);
assert.match(html, /id="cropAngle"[^>]+min="-45"[^>]+max="45"/, "Crop straighten control missing");
assert.match(html, /data-crop-rotate="left"/, "Crop-owned left rotation missing");
assert.match(html, /data-crop-rotate="right"/, "Crop-owned right rotation missing");
assert.doesNotMatch(html, /data-image-rotate=/, "Duplicate image rotation controls must not crowd the primary dock");
assert.match(html, /class="image-export-sheet"/, "Image export sheet missing");
assert.match(html, /id="exportQuality"/, "Export quality control missing");
assert.match(html, /id="exportEstimate"/, "Live export estimate missing");
assert.match(html, /id="exportWidth"/, "Optional export dimensions missing");
assert.match(html, /data-image-scope="all"/, "Whole-image context missing");
assert.match(html, /id="imageContextDock"[\s\S]+class="dock-zoom"[\s\S]+id="imageExportSheet"/, "Image zoom and Export must remain inside the originating dock");
assert.match(html, /data-add-composer="image" data-context-scope="all"[^>]+aria-label="Add whole image to Composer"[^>]*>[\s\S]*?#i-plus[\s\S]*?<span>Composer<\/span>/, "Primary Composer handoff must remain explicit without the long overflowing label");
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
assert.match(js, /handleImageTool|setImageScope|startRectDrag|dragSurfaceRect|setCropMode|setCropRatio|closeCrop|beginLasso|appendLassoPoint|finishLasso|normalizedLassoSelection|completeCropFreehand|handleImageSelectionAction|updateExportEstimate|toggleHtmlSource|positionSelectionLens|setPdfMode|completePdfLasso|selectPdfContent|addToComposer|codeEditor\.addEventListener\("input"\)|positionCanvasSelection|handleExcalStyle/, "direct interaction handlers missing");
assert.match(js, /lassoSelections = \{ image: null, imageCrop: null, pdf: null \}/, "Selection and freehand crop must retain independent contour state");
assert.match(js, /#cropFreehandLayer"\)\.addEventListener\("pointerdown", \(event\) => beginLasso\(event, "imageCrop"\)\)/, "Freehand crop must use the shared pointer contour engine");
assert.match(js, /const currentRect = overlay\.getBoundingClientRect\(\)[\s\S]+const centerX =[\s\S]+const centerY =[\s\S]+centerX - width \/ 2[\s\S]+centerY - height \/ 2/, "Crop ratios must preserve the current crop center");
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
assert.match(js, /function positionSelectionLens\(bar, target, container, preferredPlacement = "above", avoidElement = null\)/, "Selection Lens must accept a collision boundary");
assert.match(js, /avoidRect\.top - containerRect\.top \+ scrollTop - 8/, "Selection Lens must reserve space above the image dock");
assert.match(js, /placement = "inside"[\s\S]+targetBottom - barRect\.height - 10/, "Selection Lens must fall back inside a large selection");
assert.match(js, /positionSelectionLens\(toolbar, target, frame, "above", document\.querySelector\("#imageContextDock"\)\)/, "Image selection controls must avoid the primary image dock");
assert.match(css, /\.selection-context-bar\.follows-selection\[data-placement="inside"\]::after\{display:none\}/, "Inside Selection Lens placement must not render a misleading pointer");
assert.match(css, /\.freehand-layer\{[^}]+touch-action:none/, "Shared freehand pointer layer missing");
assert.match(css, /\.freehand-layer\.is-drawing \.lasso-mask\{fill:none;[^}]*stroke-dasharray:[^}]+\}/, "Freehand drawing must show only the sampled trail without a temporary closing fill");
assert.match(css, /\.lasso-hit-area\{[^}]*fill:transparent[^}]*pointer-events:all/, "Lasso needs a painted full-surface SVG hit target");
assert.match(css, /\.lasso-mask\{[^}]*fill-rule:nonzero[^}]*stroke:none[^}]*filter:url\(#lasso-outline-purple\)[^}]*pointer-events:none/, "Completed lasso must render only the filled-region silhouette and its external outline");
assert.match(css, /\.crop-freehand-mask\{[^}]*filter:url\(#lasso-outline-white\)/, "Freehand crop must use the same silhouette-only completion rule");
assert.match(css, /\.image-context-toolbar \.image-export-sheet\{position:absolute/, "Export must be anchored to the image dock");
assert.match(css, /\.image-context-toolbar\{box-sizing:border-box;width:calc\(100% - 20px\);max-width:none[^}]+\}/, "Image dock must remain bounded by the image frame");
assert.match(css, /\.image-dock-primary\{width:100%;max-width:100%;min-width:0[^}]+justify-content:center/, "Primary image tools must honor the bounded dock width");
assert.match(css, /\.crop-studio\{position:absolute[^}]+bottom:calc\(100% \+ 12px\)[^}]+grid-template-areas:"mode spacer commit" "body body body"/, "Crop controls must float above the dock in a non-overlapping two-row hierarchy");
assert.match(css, /\.crop-studio\{[^}]*transform:translateX\(-50%\)[^}]*animation:crop-studio-reveal/, "Crop studio must use its transform-safe reveal animation");
assert.match(css, /@keyframes crop-studio-reveal\{from\{[^}]*transform:translateX\(-50%\)[^}]*\}to\{[^}]*transform:translateX\(-50%\)/, "Crop reveal must preserve horizontal centering in every keyframe");
assert.doesNotMatch(css, /\.crop-studio\{[^}]*animation:lens-reveal/, "Generic lens animation must not override Crop horizontal centering");
assert.match(css, /\.crop-rectangle-controls\{grid-area:body[^}]+justify-content:space-between[^}]+border-top:/, "Rectangle crop controls need a separate secondary row");
assert.doesNotMatch(css, /\.image-context-toolbar:has\(/, "Opening Crop must not resize or move the image dock");
assert.match(readme, /do not collapse every task into Lasso/i, "README must preserve multiple image selection and crop methods");
assert.match(js, /#pdfPage"\)\.addEventListener\("mouseup"/, "PDF native text selection must open contextual actions");

const officialSources = [
  "helpx.adobe.com/photoshop",
  "helpx.adobe.com/acrobat",
  "support.goodnotes.com/hc/en-us/articles/10779390143247",
  "support.goodnotes.com/hc/en-us/articles/7353727617295",
  "support.google.com/photos",
  "support.apple.com",
  "canva.com/features/ai-photo-editing",
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

assert.match(research, /production implementation pending/i, "design-only status missing");
assert.match(research, /Rejected V1/, "rejected predecessor not identified");
assert.match(readme, /Design-only successor/, "README status boundary missing");

console.log("Peak File Workspace Composer-aligned prototype: static contract OK");
