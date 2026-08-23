# Peak Sheet Mock to Production Parity Contract

## Reference

The locked reference implementation is `docs/gstack/peak-sheet-file-native-2026-08-11/`.
Its current HTML, CSS, JavaScript, README, validation script, and assets are the
product contract. Production may replace browser-only implementation details,
fixtures, and host chrome, but it must not redesign the sheet surface.

The Obsidian file explorer and workspace tab strip in the Mock are host context.
Production maps only the `.sheet-document` subtree into the existing Obsidian
file view; native Obsidian owns the surrounding file tree and tabs.

## Impact Contract

- Primary metric: every required Mock subtree and interaction state has a
  Production owner, and no legacy default subtree changes the reference
  information density.
- Required tracks: state parity, typed presentation/data contracts, render-tree
  parity, grid interactions, multi-view projection behavior, AI and Script
  sidecars, scoped host adaptation, tests, and rendered comparison.
- Optional tracks: real PeakShare cloud upload and arbitrary user-authored code
  execution. Their reference geometry and boundary copy remain present, but the
  local file must not upload or execute arbitrary code.
- Forbidden scope: redesigning the Mock, changing the Mock to match Production,
  adding an internal sheet finder, restoring Chart as a primary view, adding
  conditional formatting/pivot/workflow builder, or changing unrelated plugin
  surfaces.
- Skip budget: zero for required visible subtrees and local interactions. A
  missing external cloud or configured-model capability must render an honest
  unavailable state instead of disappearing.
- Minimum acceptable delta: Production must move from a materialized-only field
  table to the Mock's virtual Excel-style grid and must expose Formula, Ask AI,
  Scripts, Table/Board/Calendar projection return, multi-filter, multi-sort, and
  multi-group behavior.
- Stop/commit rule: do not call the wave complete until focused tests and the
  production build pass, a production-component harness has been rendered, and
  every remaining visible difference is classified. Real Obsidian interaction
  evidence is reported separately and never inferred from the harness.

## Component Mapping

| Mock subtree | Production owner | Contract |
| --- | --- | --- |
| `.sheet-document` | `PeakSheet` | Six-row document grid: header, views, toolbar, formula bar, view stage, status bar |
| `.document-head` | `PeakSheetDocumentHeader` | File identity and optional PeakShare action; import/export/delete move to overflow |
| `.view-tabs` | `PeakSheetViewTabs` | Table, Board, Calendar plus Scripts sidecar; Chart is not a primary tab |
| `.data-toolbar` | `PeakSheetDataToolbar` | Undo/Redo, search, multi Filter/Sort/Group, Fields, New, Ask AI, overflow |
| `.formula-bar` | `PeakSheetFormulaBar` | Full-row value/formula entry and typed-only near-text AI shortcut |
| `.data-grid` | `PeakSheetTable` | 30 virtual columns, 64 virtual rows, letter-only headers, range GridState, materialize-on-use |
| `.board-shell` | `PeakSheetBoard` | Same rows projected by Status; drag changes the source field; click returns to Table |
| `.calendar-shell` | `PeakSheetCalendar` | Same rows projected by Date; month actions; click returns to Table |
| Filter/Sort/Group popovers | `PeakSheetViewRulePopover` | Ordered multi-rule editing; Filter conjunction is AND; multi-level grouping |
| Field/row menus | `PeakSheetTable` menus | Right-click-only column menu and row-number context menu |
| `.ai-drawer` | `PeakSheetAiDrawer` | Stable run states, grounded preview, formula generation/check/apply, analysis/chart result |
| `.scripts-drawer` | `PeakSheetScriptsDrawer` | Saved declarative scripts, scope, preview, bounded local run, progress, history |
| `.peakshare-card` | `PeakSheetPeakShareDialog` | Explicit local/cloud boundary; no implicit upload |
| `.status-bar` | `PeakSheetStatusBar` | Selection/range statistics, path, canonical format, revision |

## Mismatch Audit

### STATE_MISMATCH

- Production models selection as unordered sets of materialized cell keys; the
  Mock uses one `GridState` with active cell, anchor, focus, range, and
  navigation/selecting/editing modes.
- Production defaults to the first saved view and exposes Chart as a peer. The
  reference state has Table active and only Table/Board/Calendar as projections.
- Production has no formula-entry, AI-run, Script-run, overlay-owner, projection
  flash, or virtual materialization state.

### DATA_CONTRACT_MISMATCH

- Production has no virtual row/column projection contract.
- Table view supports only `groupBy`; reference requires ordered group fields.
- Saved declarative scripts and run history are not carried by `.peaksheet`.
- AI UI lacks typed run/result/preview contracts, despite the core already
  exposing revision-safe query/analyze/patch tools.
- Board/Calendar assume compatible saved views exist; the reference keeps their
  geometry and shows a semantic empty state when the required field is absent.

### STRUCTURE_MISMATCH

- The Production header exposes row/field count, Import, Export, and Delete in
  place of the reference file identity and share boundary.
- The Production view strip renders arbitrary saved views, type labels, and a
  manage-view plus button; reference uses fixed projection tabs and Scripts.
- The Production toolbar embeds single Sort/Group selects and saved-view UI;
  reference uses separate multi-rule popovers, search, New, Ask AI, and overflow.
- The Production table renders only materialized rows/fields, named headers,
  header chevrons, a sticky add-field column, and a bottom New record row.
- Formula bar, status bar, AI drawer, Scripts drawer, and PeakShare dialog are
  absent.
- Board cards contain an always-visible lane select; Calendar items contain
  always-visible editors. Both lack projection-return focus and row flash.

### HOST_ENVIRONMENT_MISMATCH

- Production relies on shared `--pk-*` geometry and Obsidian form defaults,
  while the reference establishes its own root font, box sizing, row heights,
  and input/button geometry.
- The production root is a flex column rather than the reference six-row grid.
- Fixed-size shared Button instances must defend against the Obsidian reset;
  native controls need a scoped reset without leaking outside Peak Sheet.

### VISUAL_MISMATCH

Pure visual work begins only after the preceding contracts match. The starting
visual differences include 38px Production data rows versus 31px reference
rows, heavier card/lane chrome, different header heights, absent paper/status
rhythm, different overlay density, and missing reference motion states.

## Empty and Unavailable States

- A blank file still renders 30 columns, 64 rows, all three view tabs, formula
  bar, status bar, Ask AI, and Scripts.
- Board without a Select field and Calendar without a Date field keep their
  full view stage and explain which field is needed.
- Scripts without saved definitions render a saved-script empty row and keep
  the run surface geometry.
- Ask AI without a compatible Status/Date formula target disables only the
  formula action and explains why; analysis remains available.
- Chart analysis with no points renders an empty chart result, not a missing
  result card.

## Storage and Safety

- `.peaksheet` remains canonical JSON; virtual empty cells are presentation-only.
- CSV/XLSX remain import/export formats.
- All materialization, AI insertion, Board moves, Calendar moves, and Script
  writes use revision-checked runtime patches and remain undoable.
- Scripts are declarative `PeakSheetAnalysisStep` plans. Production never runs
  arbitrary JavaScript or Python.
- PeakShare remains an explicit optional handoff; opening its dialog does not
  upload the local file.

## Verification Contract

1. Contract tests assert the Production render tree and absence of legacy
   default controls.
2. Core tests cover virtual materialization, ordered multi-group persistence,
   saved Script codec/patch behavior, and revision-safe mutations.
3. Component tests/harness cover selection, direct typing, paste, popovers,
   AI state transitions, Script preview/run, Board drag, Calendar return, and
   empty geometry.
4. The production component and production CSS render in a fixed viewport.
   Reference, current, normalized current, overlay/diff, and manifest are saved.
5. Real Obsidian verification is performed once after convergence. Any
   interaction not exercised there is reported as `INTERACTION NOT VERIFIED`.
