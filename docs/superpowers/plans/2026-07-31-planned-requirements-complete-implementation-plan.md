# Planned Requirements Complete Implementation Plan

Date: 2026-07-31
Branch: `codex/planned-requirements-20260731`
Base: `ebb875f2c1ec60654d4889f295b2314182b80462`
Document status: **Historical execution plan · completed; product IA superseded on 2026-08-02**
Execution-time source of truth: `docs/planned-requirements.html`

> This plan records what the isolated worktree was instructed to build. It is not the current product backlog. The owner correction moved Vault Intelligence into Quick Search, moved document graph context into File Atlas, merged Search Hub Drawer into the File Atlas handoff, and retired Ambient Floating Panel. Use the [2026-08-02 correction audit](../audits/2026-08-02-planned-requirements-product-ia-correction.md) for current review.

## Outcome

Implement every requirement currently registered in
`docs/planned-requirements.html` as production behavior. Existing partial
implementations must be completed in place; no second Copilot, graph, search,
history, or Ambient runtime may be introduced merely to host a new surface.

## Impact Contract

### Primary target

Move all 11 registered requirement IDs from `planned` / `design only` to a
verified production state, with executable contract tests and one app-owned
composition path per capability.

### Required tracks

1. `PR-VAULT-GRAPH-SEGMENT`
2. `PR-DOC-LOCAL-GRAPH`
3. `PR-SEARCH-HUB-DRAWER`
4. `PR-AMBIENT-FLOATING-PANEL`
5. `PR-FILE-ATLAS-WORK-FILE-RAIL`
6. `PR-COPILOT-INTELLIGENCE-NATIVE-MODAL`
7. `PR-FILE-ATLAS-COPILOT-SUGGESTIONS-FLATTEN`
8. `PR-SHARED-AI-INSTRUCTION-COMPOSER`
9. `PR-AI-SEARCH-UNIFIED-MODES`
10. `PR-COMPOSER-AI-GRAPH`
11. `PR-COMPOSER-GRAPH-EMPTY-FOLDER-COLLAPSE`

### Forbidden scope

- Do not merge AI Search, AI Graph, Vault Intelligence, Chat, or Composer
  runtimes.
- Do not add service-layer runtime singletons.
- Do not make Markdown or an analysis snapshot the canonical AI Graph store.
- Do not create a File Atlas-only Copilot taxonomy or writeback path.
- Do not auto-run Vault Intelligence, Web research, graph update, or note
  writeback merely because a mode/surface is opened.
- Do not replace real Obsidian acceptance with a mock or green build.
- Do not include the original worktree's unrelated uncommitted changes.

### Minimum acceptable delta

- 11/11 requirement IDs have production entry points and contract coverage.
- AI Graph has stable graph/version IDs, immutable JSON versions, creation
  provenance, source/evidence/review metadata, restart-safe browse, semantic
  diff preview, and accept-only version creation.
- Quick Search exposes only `Vault Search` plus one AI workspace selector;
  ordinary open resets to AI Search; `Tab` no longer switches modes.
- Chat Studio, Composer Copilot, and AI Graph import the same shared instruction
  capability and provide separate surface adapters.
- File Atlas provides all three rail sorts, same-source Copilot suggestions,
  icon-only filter/flatten controls, flattened document order with breadcrumbs,
  and no direct Markdown writeback.
- Ambient has a window-local persistent floating surface, explicit close and
  manual refresh, without becoming system-level always-on-top.
- Contextual graph surfaces expose Vault overview, document hubs/source
  chain/local graph, and search-result hub actions.
- Folder-tree layout collapses empty transit folders from the visible layout
  while retaining canonical paths.

### Stop and commit rule

Stop only for a blocker that cannot be resolved from repository/runtime
evidence, or after the complete verification matrix has run. Commit only files
owned by this worktree. A green focused suite/build without real Obsidian
interaction must be reported as `INTERACTION NOT VERIFIED`, not as full UI
acceptance.

## Baseline Matrix

| Requirement | Existing production base | Gap to close |
| --- | --- | --- |
| Vault graph segment | Vault digest/review runtime and Copilot Vault projection | No cohesive stats/overview/hubs/current-note/last-report segment |
| Document local graph | File Atlas neighborhood and hub query services | No Document Copilot context strip with hub/source/local graph |
| Search hub drawer | Inspector `HubSection` and hub graph pin | Missing complete primary/candidate/orphan actions and explicit local-graph route |
| Ambient floating panel | `RelatedNotesView` right sidebar and Ambient store | Not a window-local overlay; no visible manual runtime refresh |
| Work-file rail | Workspace inventory, resizable rail, Open/Recent groups | Missing default `Recently viewed` sort and exact three-mode contract |
| Native Copilot modal | App-owned document runtime and modal host | Whole-sidecar projection; incomplete native context/write/history/escalation/focus contract |
| Atlas Copilot/flatten | Atlas selection/inspector/filter/tree | No same-source suggestions or flatten projection; filter still text-labelled |
| Shared AI composer | Shared PromptInput primitives in Chat and Composer | No headless submission/draft/context/run contract; AI Graph not a consumer |
| Unified AI modes | Quick Search Vault/AI tabs and analysis/graph modes | Duplicate input mode pill, external Vault button, wrong `Tab` behavior, no graph artifact history |
| AI Graph artifact | Graph agent, lens renderer, legacy analysis JSON | No canonical repository/version/evidence/projection/update/source separation |
| Empty folder collapse | Folder-tree graph layout | Empty transit folders still own visible group frames |

## Dependency Order

```text
shared contracts
  ├─ contextual graph projection ──> Vault / Document / Search surfaces
  ├─ instruction composer ─────────> Native modal / Atlas / AI Graph
  └─ AI Graph domain + repository ─> capability + history + detail
                                      └─ Quick Search unified modes

folder layout + Ambient + rail can proceed independently
```

## Verification Matrix

### Automated

- Requirement-specific pure/model/component source contracts.
- Repository restart, immutable version, atomic manifest, projection rebuild,
  legacy import, source-change separation, semantic diff accept/cancel tests.
- Cross-surface shared instruction import and behavior tests.
- Focused existing Composer, File Atlas, Search, graph direction, Ambient, and
  button reset defense suites.
- Full `npm run test`.
- `npm run build`.
- `git diff --check`.

### Real Obsidian

When a renderer CDP listener is available:

- Quick Search ordinary open/default mode, menu keyboard, `Tab`, Escape focus,
  Graph history/detail/back.
- Native editor modal context, send, escalation, close/focus restoration.
- Atlas rail sorts, filter/flatten, suggestion handoff.
- Ambient overlay typing persistence, manual refresh, close/reopen.
- Directed graph arrows and folder-tree empty-group collapse.

If the listener is unavailable, record the exact missing interaction evidence
as `INTERACTION NOT VERIFIED`.
