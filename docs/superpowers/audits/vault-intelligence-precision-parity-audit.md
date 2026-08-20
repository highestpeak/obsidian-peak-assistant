# Vault Intelligence precision parity audit

## Scope and evidence

- Reference: `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/index.html`.
- Production: the real `VaultIntelligenceWorkspace` and compiled production CSS, rendered by `.dev/harness/vault-intelligence.html`.
- Measurement viewport: `1512 × 982` CSS pixels at DPR 1 with the same reference-compatible fixture.
- The owner recording at `~/Downloads/iShot_2026-08-20_21.08.42.mp4` was used to identify real-data failures, especially the 49-type Files popover and the 528% Index display. The recording was not used as a source for guessed CSS values.

## Element mapping and measured convergence

| Region | Mock selector | Production selector/component | Reference bbox | Before | After |
| --- | --- | --- | --- | --- | --- |
| Header | `.topbar` | `.pk-vi-title-row` / `WorkspaceHeader` | `0,0 1512×80` | exact | exact |
| Navigation | `.main-nav` | `.pk-vi-nav` / `WorkspaceHeader` | `0,80 1512×45` | exact | exact |
| Inventory grid | `.inventory-strip` | `.pk-vi-inventory-strip` / `ObjectInventory` | `28,146 1456×76` | exact | exact |
| Files card | `.inventory-item.files` | `.pk-vi-inventory-item.is-files` | `28,146 355×76` | exact | exact |
| Continue card | `.continue-card` | `.pk-vi-continue` | `28,236 1456×473` | `1456×503` | exact |
| Continue summary | `.continue-change-strip` | `.pk-vi-continue-summary` | `29,289 1454×41` | `29,290 1454×62` | exact |
| First work row | `.continue-row` | `.pk-vi-compact-task` | `29,330 1454×54` | `38,352 1436×54` | exact |
| Activity card | `.overview-activity-card` | `.pk-vi-overview-activity` | `28,723 1456×481` | `28,753 1456×499` | exact |
| Activity body | `.overview-activity-body` | `.pk-vi-overview-activity-body` | `29,781 1454×422` | `47,825 1418×409` | exact |
| Heatmap grid | `.overview-heatmap-grid` | `.pk-vi-overview-grid` | `217,840 1109×143` | size exact, `y +40` | exact |
| Activity evidence | `.overview-heatmap-evidence` | `.pk-vi-overview-evidence` | `44,998 1424×160` | `62,1038 1388×160` | exact |
| Knowledge Index | `.overview-bottom > .card` | `.pk-vi-index-overview` | `28,1218 1456×264.25` | `28,1266 1456×270.59` | exact |
| Index body | `.search-body` | `.pk-vi-index-overview-body` | `29,1277.22 1454×204.03` | `47,1338 1418×180.59` | exact |
| Readiness ring | `.readiness-ring` | `.pk-vi-readiness-ring` | `92×92` | `112×112` | exact |
| Files popover | `.inventory-hover` | `.pk-vi-inventory-hover` | `650×334.44` | `650×343.59` with 16 types; unbounded with 49 | exact; 49 types remain `650×334.44` |

Coordinates are `x,y width×height` in CSS pixels. “Exact” means the audited bounding-box delta was zero at the locked viewport and fixture.

## Root causes and changes

### Geometry and render grouping

- `Continue work` still used the previous 62px summary and a padded task-list container. It now uses the Mock's 41px summary, 136px first summary column, edge-to-edge 54px rows, and three-column row structure.
- `Vault activity` and `Knowledge Index` retained card-level padding from the older implementation. Resetting those parents removed the repeated 18px child offset.
- Activity was missing the Mock's summary, calendar, and footer wrappers. Restoring those groups made the months, heatmap, evidence, and legend share the same layout contract.
- Knowledge Index now restores the Mock's readiness-summary wrapper and `154px / 1fr / 300px` grid.

### Typography

- Mock-specific sizes and line heights were restored where they drive geometry: activity range control, heatmap summary/month labels, Index caption/reason note, hover copy/caption/readout, and hover status.
- The Obsidian system font stack remains at the root. Components with reference geometry use explicit local metrics; replacing the host font family globally was unnecessary and would reduce environment integration.

### Data and presentation contracts

- `inventoryPreviewTypeLimit` is a typed template setting with a compiled fallback of 16.
- Files keeps every canonical type in Production data and the full inventory. The compact hover presents the largest 15 plus an aggregated `Other formats` slice when more than 16 types exist.
- The popover reports the true canonical type count, so a 49-type Vault reads `49 actual file types` while retaining the Mock's 16-row geometry.
- Index readiness preserves the real numerator and denominator, caps the visual percentage at 100%, and reports when searchable projection records exceed discovered Vault objects.

### Host adaptation

- The shared Obsidian/Tailwind button reset overrides border, typography, and geometry. Narrow, scoped `!important` declarations remain only on affected button contracts, including the hover text action and fixed heatmap/range controls.
- Page root sizing, system font inheritance, and native Obsidian chrome remain host-owned. Internal workspace geometry, component typography, and control dimensions remain scope-owned.

## Verification

- Focused Vault Intelligence rendered parity, standalone contract, model, and runtime tests pass.
- Production build and bundle boundary checks pass.
- Harness interaction checks pass for Files hover, info Escape/focus restoration, date range selection, route transitions, and scroll reset.
- Reference, current, 50% overlay, and pixel-difference images are stored under `.dev/harness/shots/`.

## Known differences

- Production shows real counts, task labels, readiness availability, dates, and event evidence; the Mock's invented values are not copied into runtime data.
- Vectors, summaries, and AI Tags remain `Not reported` where the current runtime has no trustworthy count. No display-only values were fabricated to match the Mock.
- Native Obsidian chrome and the host system font family are intentionally outside the standalone Mock contract.
- Post-change real-Obsidian interaction is `INTERACTION NOT VERIFIED`; this pass used the requested lightweight production harness plus the owner recording, not repeated host automation.

## Structural parity correction

The owner recording exposed two regions that could not be treated as visual polish.

### Activity component mapping

```text
Reference .activity-explorer
→ Production ActivityView / .pk-vi-activity-explorer
  ├─ answer header + Recorded activity / AI work themes tabs
  ├─ recorded/generated analysis state
  └─ complete workspace
     ├─ chart pane
     │  ├─ source picker + selected-range count
     │  ├─ five recorded source lanes or generated theme rows
     │  ├─ draggable range navigator
     │  └─ selected-range summary
     └─ selected-period pane
        ├─ four period metrics
        ├─ optional theme mix + previous equal-period comparison
        └─ work sessions / stable empty treatment
```

The old standalone `Period summary`, generic timeline card, session card, and theme card were removed. The compressed body was caused by applying the legacy heatmap class `.pk-vi-activity-grid` to the whole Activity workspace. That selector forced column auto-flow, seven grid rows, and 11px columns. The Activity root no longer carries that class. At `1512 × 982`, the corrected workspace measures `1454px` wide with `1099px + 355px` columns; the navigator is `1072 × 60px`.

### Scan Setup component mapping

```text
Reference .scan-setup-shell
→ Production ScanSetup / .pk-vi-scan-setup-shell
  ├─ hero + three trust facts
  ├─ Step 1 scope builder + included scope
  ├─ Step 2 four compact task category summaries
  │  └─ collapsed Knowledge Index plan
  ├─ Step 3 five collapsed AI operation groups
  │  └─ operation rows only after explicit expansion
  ├─ estimated run block
  └─ user-file boundary + Cancel / Start scan footer
```

Production previously rendered all 19 detector labels and every AI operation by default. The corrected default renders four category summaries with counts and five collapsed AI group rows. Real detector and operation data remain available inside the corresponding category/group interaction instead of changing the Reference information density.

### Zero-data contract

- `normal-data` and `zero-data` are deterministic adapters around the real Production component and CSS.
- Overview always keeps four object cards, Continue work summary, activity heatmap, and Knowledge Index. Missing object rows are adapted to canonical zero-count presentation objects.
- Activity always keeps five source lanes, the range navigator, selected-period metrics, and the work-session region.
- Scan Setup always keeps all three steps, four task categories, five AI groups, estimate, boundary, and actions. Missing scan history reads `Not indexed yet` instead of removing Step 1.
- Map text always keeps the Community rail, editor, evidence facts, version history, and actions. With no indexed Community, those controls are explicitly unavailable instead of replacing the workspace with one line of text.

The browser harness verified the searchable source/theme picker, default collapsed state, one-at-a-time AI group expansion, Recorded/AI theme switching, and a real navigator window drag. Post-change real-Obsidian interaction remains `INTERACTION NOT VERIFIED`.
