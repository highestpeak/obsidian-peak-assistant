# Peak Sheet Mock to Production Parity Implementation Plan

## Phase 1 - Contract and adapters

1. Extend the typed table-view contract for ordered grouping while preserving
   legacy `groupBy` reads.
2. Add optional saved declarative scripts and run history to the file-native
   carrier and patch system.
3. Add a presentation adapter for fixed views, virtual dimensions, semantic
   widths, field/date/status presentation, selection labels, and empty states.
4. Add operation builders that materialize virtual fields/rows atomically.

## Phase 2 - Reference render tree

1. Replace the current `PeakSheet` header/view/toolbar/content hierarchy with
   the Mock's six-row document grid.
2. Move Import/Export/Delete into the Mock overflow surface.
3. Replace arbitrary saved-view tabs with fixed Table/Board/Calendar projection
   tabs and the Scripts action.
4. Add Formula, status, overlay, AI, Scripts, and PeakShare subtrees.

## Phase 3 - Grid core

1. Replace set-only selection with active/anchor/focus/mode GridState.
2. Render 30 virtual columns and 64 virtual rows without writing them.
3. Implement direct typing, double-click/F2, Enter/Tab/Escape, arrow/Shift
   range extension, Delete, copy/cut/paste, row/column selection, and stats.
4. Materialize virtual rows/columns only on committed typing, paste, New, AI,
   or an explicit context-menu insertion.
5. Use letter-only headers; open column configuration only from right-click;
   preserve resize and row context actions.

## Phase 4 - Data operations and projections

1. Implement multi-filter, multi-sort, and multi-group popovers backed by saved
   table-view definitions.
2. Port Board layout/drop states and update the source lane field through the
   runtime.
3. Port Calendar layout/month actions and source-date updates.
4. Return Board/Calendar items to the source Table cell, center it, focus it,
   and flash the source row.

## Phase 5 - AI, Scripts, and cloud boundary

1. Implement Ask AI state transitions and grounded selection/file context.
2. Generate checked formulas from compatible fields, preview before applying,
   and insert through one undoable runtime mutation.
3. Produce grounded summaries and chart analysis from the runtime analysis DSL.
4. Implement saved declarative Script preview/run/progress/history; derive write
   operations only from bounded analysis results.
5. Port PeakShare boundary dialog without implicit upload.

## Phase 6 - CSS and host adaptation

1. Port the Mock CSS geometry under `.peak-sheet-root` after subtree parity.
2. Map colors to restrained Obsidian-aware fallbacks without changing geometry.
3. Defend fixed shared Button geometry against the Obsidian reset.
4. Preserve Mock scroll ownership, overlay ownership, focus restoration, and
   reduced-motion behavior.

## Phase 7 - Verification and review

1. Run focused core, codec, runtime, production-contract, and UI tests.
2. Run the full production build.
3. Render the real Production component/CSS harness at the locked viewport and
   save comparison artifacts.
4. Perform a read-only review pass over state/data/structure/host/visual deltas.
5. If CDP is available, reload only the plugin and verify the critical real
   Obsidian flows; otherwise report exact unverified interactions.
6. Commit only Peak Sheet-owned files and report the SHA.
