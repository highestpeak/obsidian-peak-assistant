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
4. Keep HTML as a live page with one local source-edit action, and keep PDF
   answers page-addressable.
5. Keep Code Source always editable with syntax highlight, save feedback,
   selection AI, and transient suggestion review. No project/symbol UI.
6. Keep Image canvas-first with a compact contextual toolbar. Semantic edits
   go through Intelligence and before/after candidate review.

Every visible primary control in the mock must either change the file surface,
change the current selection, or open a concrete Intelligence result. Decorative
capability buttons are not part of this version.

This artifact does not change production code or upgrade any capability to
shipped status.

## Static validation

```bash
node docs/gstack/peak-file-workspace-composer-aligned-2026-08-10/validate.mjs
```
