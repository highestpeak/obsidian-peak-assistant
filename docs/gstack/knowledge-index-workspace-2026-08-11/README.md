# Knowledge Index Workspace Mock

Design-only mock for Peak Assistant's long-running knowledge index workflow.
It does not change production source or claim that durable index runs already
exist.

## Open

Serve the repository root and open:

```text
/docs/gstack/knowledge-index-workspace-2026-08-11/index.html
```

## What this mock decides

- The canonical runtime surface is an independent, reopenable View.
- Settings owns long-term policy; this View owns task progress, coverage,
  recovery and history.
- User readiness is separate from background task progress. Keyword search can
  be ready while vectors, summaries or relationships continue.
- Full-text, semantic, enrichment and graph readiness are separate facts.
- File errors are recoverable by item and do not invalidate the healthy index.
- Peak Sheet, AI Graph and Draw.io explain their real access policy instead of
  pretending all generated or imported content is generally indexable.

## Review interactions

- Use the artifact toolbar to compare `Running`, `Needs attention` and
  `Complete` states.
- Open Overview, Current run, Needs attention, History, Content types and
  Folders from the sidebar.
- Expand problem rows and try recovery actions.
- Open Index settings to verify that long-term policy is a separate owner.

## Visual direction

- Restrained Raycast-like tone and hierarchy.
- Linear-like content width rather than full-width dashboards.
- macOS-style sidebar grouping and window chrome.
- ChatGPT-like density and low decoration.
- VS Code-like explicit status, history and search/task semantics.
- Monochrome line icons; semantic color is reserved for real state.
