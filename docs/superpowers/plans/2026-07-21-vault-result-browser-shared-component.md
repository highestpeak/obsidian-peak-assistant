# Vault Result Browser Shared Component Plan

Date: 2026-07-21

## Current status

- Accepted static-mock boundary: `index.html`, `intelligence-lab.html` and `intelligence-ia-lab.html` keep a bounded Composer-owned relationship preview. Their expanded modal shows only a Result Browser reuse slot / contract marker and does not implement or visually clone Vault Search List / Folder / Graph, toolbar, layouts or inspector.
- Not yet implemented in the production React runtime: Quick Search still owns store-bound List / Tree / Graph components, and there is no production Composer adapter yet. The DAG below is the required migration; a mock marker is not production reuse.

## Objective

Extract the production Vault Search result projections into one controlled React `ResultBrowser`, then make both Quick Search and Composer Related Materials consume it through host adapters. That production component package is the only expanded-browser UI source of truth. The docs mock may retain the compact Composer preview, but its modal exposes only the integration slot/contract and never implements browser internals or becomes runtime code.

## Impact contract

- Primary outcome: Quick Search and Composer render List / Tree / Graph from the same neutral component package.
- Required tracks: stable selection contract, scoped keyboard navigation, controlled toolbar, List/Tree extraction, Graph extraction, Quick Search adapter, Composer adapter, component/contract tests, desktop + narrow QA.
- Forbidden scope: query/ranking rewrite, new search store, moving `vaultSearchStore` into Composer, copying Cytoscape renderer, replacing `resultSubgraph.ts`, importing docs JavaScript into production, or keeping a parallel List/Folder/Graph mock implementation.
- Minimum acceptable delta: no shared renderer may import `useVaultSearchStore`, `useServiceContext`, `SearchClickRepo`, `BehaviorContextRecorder`, or Composer session stores; both hosts must be live consumers before the work is called complete.
- Stop rule: if Quick Search parity cannot be retained, stop after the controlled-core extraction and mark the wave partial; do not keep a second renderer as a fallback without an explicit retirement plan.

## Shared contracts

1. Normalize selection to `docId ?? path ?? id` in every view.
2. One immutable result snapshot contains complete ranked items and one capped `ResultSubgraphOutput`.
3. List leaf IDs equal Tree file IDs. Graph result IDs are a subset and must include root plus selected item.
4. View, density, collapse, preset, Semantic, selection and inspector changes never trigger search or snapshot rebuild.
5. Browser owns presentation and scoped navigation. Host adapters own query, open/reveal policy, telemetry, inspector data and task/session side effects.

## Execution DAG

### A. Contract and tests

- Add neutral `ResultBrowserState`, props, stable-key helper and state-change reasons.
- Add production component fixtures that assert List/Tree equality, Graph cap/root/selected inclusion and revision stability. Do not use a static 37-item docs fixture as the contract test.
- Keep `SearchResultItem` and `ResultSubgraphOutput` as the production data sources; do not define parallel DTOs unless Composer-only reason/weak metadata lives in an app-owned envelope.

### B. Controlled presentation primitives

- Move the pure tree builder into `src/ui/component/result-browser/result-tree/` and leave a temporary re-export for Quick Search imports.
- Extract controlled toolbar components from `ResultPaneHeader.tsx`.
- Extract a controlled List row; inject open/action/telemetry callbacks.
- Move keyboard handling from `window` listeners to the focused `ResultBrowser` root.

### C. Controlled Graph

- Split Cytoscape element projection, styles, layouts, selection and viewport lifecycle from `ResultGraphView.tsx`.
- Accept an already-built `ResultSubgraphOutput`; the renderer must not call SearchClient or build a second graph.
- Restore selected node and viewport after controlled preset/Semantic changes; add node keyboard focus and ARIA.

### D. Host adapters

- `QuickSearchResultBrowserAdapter`: binds Zustand/search results, fuzzy/recent syntax, Vault navigation, SearchClickRepo, BehaviorRecorder, hub pin and modal close policy.
- `ComposerRelatedMaterialsAdapter`: binds the frozen brief snapshot, source inspector, `查看来源`, `带入协作`, context chips and session entry.
- Remove the old Quick Search-only projection router after parity tests pass.

### E. Verification

- Unit/contract: projection ID invariants, controlled state transitions, no query/build on projection changes.
- Quick Search: List/Tree/Graph, density, five graph presets, Semantic, inspector, open/reveal, keyboard, export and pinned hub.
- Composer: compact graph to wide explorer, selection continuity, source/context actions, Escape/focus restore, near-fullscreen narrow layout and no horizontal overflow.
- Static docs: `index.html`, `intelligence-lab.html` and IA fixture assert the bounded preview plus its in-place source selection, then the reuse slot, host modal/drawer bounds, open/close and focus restoration. They must not exercise copied expanded List/Folder/Graph controls or treat a fixed result dataset as production parity.

## Source of truth after completion

- Production runtime: `src/ui/component/result-browser/`.
- Structural graph data: `src/service/search/graph/resultSubgraph.ts`.
- Quick Search host adapter: `src/ui/view/quick-search/QuickSearchResultBrowserAdapter.tsx`.
- Composer host adapter: `src/ui/view/composer/ComposerRelatedMaterialsAdapter.tsx` (final path follows the production Composer owner).
- Static review fixture: the compact relationship preview is Composer-owned; the expanded Result Browser has no docs renderer source of truth, only a reuse slot / contract marker owned by the Composer host mock.
