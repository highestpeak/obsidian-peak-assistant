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
6. Keep Image canvas-first, but do not collapse every task into Lasso. Selection
   supports the whole image, a resizable rectangle, a pen-drawn freehand mask,
   and one detected object. All four scopes can feed Ask / Composer; object and
   mask scopes can also feed contextual AI edits. Crop is a separate direct
   tool with a movable eight-handle frame, Free / Original / 1:1 / 4:3 / 16:9
   ratios, straighten, and left/right rotation. A lasso may additionally create
   a transparent mask crop, but it does not replace ordinary framing. Format,
   dimensions, quality, and live size estimates remain in Export copy rather
   than an opaque Compress action.
7. Treat Add to Composer as the shared handoff for an HTML element, PDF
   passage/region, code selection, Canvas subgraph, or Excalidraw selection.
   The handoff keeps the native source locator, not just copied text.
8. Use one `Selection Lens` interaction language across formats: every file has
   an explicit whole-file scope and a local selection scope. Ask / Add follows
   the active selection; format-owned write actions appear only where they make
   sense.
9. Keep Image Select, Crop, Export, rotation, Ask, Add, and zoom anchored to one
   compact dock. Select and Crop expand locally from that dock; a mask-crop
   action appears only after a freehand selection exists.
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
  selection kind, page, normalized points/bounds or object mask, selected
  text/OCR, and preview snapshot.

Every visible primary control in the mock must either change the file surface,
change the current selection, or open a concrete Intelligence result. Decorative
capability buttons are not part of this version.

This artifact does not change production code or upgrade any capability to
shipped status.

## Static validation

```bash
node docs/gstack/peak-file-workspace-composer-aligned-2026-08-10/validate.mjs
```
