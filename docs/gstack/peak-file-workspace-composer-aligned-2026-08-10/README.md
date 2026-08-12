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
6. Keep Image canvas-first. The stable dock has two explicit tasks: Select and
   Crop. Opening either one expands Rectangle / Freehand directly after the
   active task inside the same dock; the content-width dock grows around its
   center anchor instead of creating a second floating row. There is no
   persistent Whole / Rectangle / Freehand segment, Select dropdown, or
   Object-detect mode. Rectangle is the
   default and starts as an eight-handle full-image rectangle, so a valid local
   context and its Ask / Composer lens exist immediately; dragging refines it.
   Freehand removes the rectangle and shows the closed-mask lens only after the
   user finishes drawing. Crop uses the same two method names but keeps its own
   Reset / Cancel / Done commit semantics. There are no ratio presets,
   straighten slider, or nested rotation controls. Left/right rotation remain
   independent first-level image actions. Format, dimensions, quality, and live
   size estimates stay in icon-triggered Export rather than an opaque Compress.
7. Treat Add to Composer as the shared handoff for an HTML element, PDF
   passage/region, code selection, Canvas subgraph, or Excalidraw selection.
   The handoff keeps the native source locator, not just copied text.
8. Use one `Selection Lens` interaction language across formats: every file has
   an explicit whole-file scope and a local selection scope. Ask / Add follows
   the active selection; format-owned write actions appear only where they make
   sense.
9. Keep Select, Crop, Export, rotation, Ask, AI edit, Add, and zoom anchored to
   one compact, content-width dock. Rectangle / Freehand appear inline only
   while Select or Crop is active. AI edit is a single entry point: it opens a
   dedicated Intelligence workspace rather than expanding a preset wall inside
   the dock. That workspace groups intent as
   `Quick / Restyle / Light / Material / Compose`, gives reference images typed
   roles (`Style / Subject / Composition`), exposes Identity / Layout / Text /
   Unselected preservation plus creative strength, and returns four comparable
   candidates. Accept always saves a new version; Restore returns to the
   protected source. Export is the only dock-owned sheet that floats upward,
   and rotation never hides inside Crop.
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

The AI shortcut set is intentionally smaller than the capability catalog.
Public product feedback repeatedly asks for fast cleanup, faithful local edits,
background work, and reframing while objecting to changes outside the mask,
re-created removed objects, lost texture/color, opaque credits, and destructive
results. Peak therefore keeps the source protected, uses selection before local
edits, sends prompt-required replacement to Composer, and exposes every
generation as a reviewable candidate rather than an immediate overwrite.

This artifact does not change production code or upgrade any capability to
shipped status.

## Static validation

```bash
node docs/gstack/peak-file-workspace-composer-aligned-2026-08-10/validate.mjs
```
