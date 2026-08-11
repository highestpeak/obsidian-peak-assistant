# Peak File Workspace · Composer-aligned redesign

Design-only successor to the rejected six-surface prototype in
`../peak-file-workspace-interactive-2026-08-10/`.

## Open

- `index.html#image` — Image
- `index.html#html` — HTML
- `index.html#pdf` — PDF
- `index.html#code` — Code Source
- `index.html#canvas` — Obsidian Canvas
- `index.html#excalidraw` — Excalidraw
- `research.html` — research sources, scope decisions, exclusions, and the
  Composer reuse contract

## Reset decisions

1. Use one direct-manipulation shell: the file surface and the always-visible,
   equal-height Intelligence sidecar share the full workspace.
2. Keep native Canvas and Excalidraw renderer/editor language. Peak adds
   context and candidates; it does not replace those editors.
3. Remove global View / Edit / Compare / Changes controls. Editing is a native
   file affordance; review appears only after an AI suggestion exists.
4. Keep HTML as a live page with element selection and one local source-edit
   action. Every visible dashboard unit—including the three metric cards—is a
   valid selection target. Give PDF whole-document, passage, and freehand-region
   AI context; every factual answer remains page-addressable.
5. Keep Code Source always editable with syntax highlight, save feedback,
   selection Ask, and Add to Composer. Do not expose a separate Code Suggest
   Change path, project tree, or symbol UI.
6. Keep Image canvas-first, but do not collapse every task into Lasso. Whole,
   Rectangle, and Freehand are three direct buttons in the dock—there is no
   Select dropdown or Object-detect mode. All three scopes can feed Ask /
   Composer, while Rectangle and Freehand can also feed contextual AI edits.
   Selection owns the geometry; Crop consumes that active scope instead of
   asking for Rectangle / Freehand a second time. Whole starts a direct movable
   eight-handle crop frame, Rectangle reuses the current rectangle, and
   Freehand reuses the current closed mask. Crop only adds a compact
   Reset / Cancel / Done row above the stable dock—there are no ratio presets,
   straighten slider, or nested rotation controls. Left/right rotation are
   independent first-level image actions. Format, dimensions, quality, and live
   size estimates remain in Export rather than an opaque Compress action; its
   primary dock trigger is icon-only with an accessible label.
7. Treat Add to Composer as the shared handoff for an HTML element, PDF
   passage/region, code selection, Canvas subgraph, or Excalidraw selection.
   The handoff keeps the native source locator, not just copied text.
8. Use one `Selection Lens` interaction language across formats: every file has
   an explicit whole-file scope and a local selection scope. Ask / Add follows
   the active selection; format-owned write actions appear only where they make
   sense.
9. Keep Image selection, Crop, Export, rotation, Ask, Add, and zoom anchored to
   one compact dock. Selection methods are always one click away. Crop and
   Export float upward from the dock without changing its geometry; rotation
   never hides inside Crop.
10. Make PDF scope explicit (`All pages / This page / Text / Lasso`). The lasso
    carries file identity, page, normalized point mask, bounds, selected text or
    OCR, and source revision into Composer. Code text selection immediately
    opens a nearby Ask / Add capsule; repeated selections reposition it.

## Open-source implementation boundary

- Use PDF.js for page rendering and viewport/PDF coordinate transforms.
- Spike `react-pdf-highlighter-extended` for native text selection, scaled
  anchors, screenshots, and selection-tip positioning. It supports text and
  rectangular highlights; the freehand lasso remains a thin Peak overlay.
- Optionally use `perfect-freehand` only to smooth sampled pointer points. It
  does not own Peak selection, crop, AI, or Composer semantics.
- Do not add a second canvas/editor runtime merely to draw one lasso or rectangle.
  Store a shared `SelectionEnvelope`: source path/id + revision, surface,
  selection kind, page, normalized points/bounds, selected text/OCR, and preview
  snapshot. Selection and crop may share the contour input engine without
  sharing product state or commit semantics.

Every visible primary control in the mock must either change the file surface,
change the current selection, or open a concrete Intelligence result. Decorative
capability buttons are not part of this version.

This artifact does not change production code or upgrade any capability to
shipped status.

## Static validation

```bash
node docs/gstack/peak-file-workspace-composer-aligned-2026-08-10/validate.mjs
```
