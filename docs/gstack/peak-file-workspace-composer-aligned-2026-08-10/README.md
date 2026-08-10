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
   action. Give PDF whole-document, passage, and bounded-region AI context;
   every factual answer remains page-addressable.
5. Keep Code Source always editable with syntax highlight, save feedback,
   selection AI, Add to Composer, and transient suggestion review. No
   project/symbol UI.
6. Keep Image canvas-first. Crop is a full direct-manipulation task with free
   handles, aspect presets, left/right rotation, and arbitrary straighten.
   View zoom replaces primary Resize; format, dimensions, quality, and live
   size estimates belong to Export copy rather than an opaque Compress button.
7. Treat Add to Composer as the shared handoff for an HTML element, PDF
   passage/region, code selection, Canvas subgraph, or Excalidraw selection.
   The handoff keeps the native source locator, not just copied text.
8. Use one `Selection Lens` interaction language across formats: every file has
   an explicit whole-file scope and a local selection scope; Ask / Change / Add
   follows the active selection rather than appearing only in Intelligence.
9. Expand Image Crop inside the originating dock and anchor Export to that same
   dock. Free crop has eight edge/corner handles plus whole-frame dragging.
10. Make PDF scope explicit (`All pages / This page / Text / Area`). Area uses
    a screenshot-like movable rectangle. Code text selection immediately opens
    a nearby contextual capsule; repeated selections reposition it.

Every visible primary control in the mock must either change the file surface,
change the current selection, or open a concrete Intelligence result. Decorative
capability buttons are not part of this version.

This artifact does not change production code or upgrade any capability to
shipped status.

## Static validation

```bash
node docs/gstack/peak-file-workspace-composer-aligned-2026-08-10/validate.mjs
```
