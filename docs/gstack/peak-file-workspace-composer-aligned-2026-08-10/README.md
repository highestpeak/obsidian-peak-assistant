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

1. Use the Composer shell: source header, main file surface, always-visible
   Intelligence sidecar, prompt, and candidate review.
2. Keep native Canvas and Excalidraw renderer/editor language. Peak adds
   context and candidates; it does not replace those editors.
3. Make HTML preview-first and PDF answer citations page-addressable.
4. Keep Code Source intentionally small: preview, syntax highlight,
   lightweight edit, selection AI, and patch review. No project/symbol UI.
5. Keep Image canvas-first with a compact contextual toolbar. Semantic edits
   go through Intelligence and before/after candidate review.

This artifact does not change production code or upgrade any capability to
shipped status.

## Static validation

```bash
node docs/gstack/peak-file-workspace-composer-aligned-2026-08-10/validate.mjs
```
