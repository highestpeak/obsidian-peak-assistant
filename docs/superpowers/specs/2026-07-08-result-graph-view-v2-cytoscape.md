# Result Graph View V2 · Cytoscape Port + Preset UX

**Date:** 2026-07-08
**Status:** shipped (2026-07-08)
**Supersedes:** the graph portion of `2026-07-07-vault-search-heading-graph-navigation.md`. Heading Mode is untouched.

## Why V2

The V1 ship (2026-07-07) landed a working Result Graph View but the user's actual usage exposed three issues that a single-day polish pass could not fix without a bigger rethink:

1. **Renderer:** ReactFlow gave us nodes and edges but not native compound / nested-parent semantics, and its layout ecosystem is thin — dagre alone was the only serious option, and dagre TB / LR on 50-node search results turned into hairballs.
2. **Layout selection UX:** exposing all layout algorithms as configurable toggles (semantic edges, folder overlay, hub grouping…) forced the user to think in graph-viz vocabulary. The user's own review showed they wanted **named modes** ("Constellation", "Flow", "Folder tree", "Orbit") not raw toggles.
3. **Hub-constituent noise:** every hub-doc edge was rendered as a dashed accent line. Since hub docs are themselves documents with real reference / semantic edges, the dashed lines added visual weight without new information.

Rather than iterate inside the plugin's live loop (reload → search → click → screenshot × N), we built the design in a standalone HTML sandbox at `docs/research/2026-07-07-result-graph-layout/index.html`, tuned every parameter against real data, then ported the final design back.

## Design pillars

### 1 · Cytoscape.js replaces ReactFlow

- Native compound (parent/child) nodes — makes the full-depth folder tree ("kb1-life-notes → D-留学和移民 → mess → doc") render as nested rectangles automatically. ReactFlow needs a bespoke group-node component per layer.
- Rich layout ecosystem: **fcose** (force-directed successor to CoSE), **cise** (compound-aware spring), **cola** (constraint-based force), **dagre** (TB / LR), **concentric** (with per-node concentric level function). Each does a different job cleanly; we hard-coded the mapping so users never pick a "layout algorithm".
- Style engine reads like CSS with `mapData(depth, 0, 4, 0.55, 0.08)` — depth-driven opacity / border-weight / padding falls out of one declaration instead of five conditional React styles.
- Compatible with the existing `@dagrejs/dagre` and `@xyflow/react` used elsewhere (`multi-lens-graph` still on ReactFlow); the two coexist in `package.json` with no shared state.

### 2 · Preset-based UX (Variant A of the header prototype)

The user articulated the core insight during layout iteration: *"很多东西不用让用户选择，我们可以直接给用户几个 view mode 去点击选择就行"*. Five named presets each bundle a layout + grouping + edge-kind default:

| Preset | Layout | Grouping | Default edges |
|---|---|---|---|
| **Constellation** | fcose | none | reference |
| **Flow ↓** | dagre TB | none | reference |
| **Flow →** | dagre LR | none | reference |
| **Folder tree** | cola | full-depth folder tree (compound) | none (structure is in the tree) |
| **Orbit** | concentric with hubs at center | none | reference + semantic (default on) |

Three behaviors that never varied across the user's ~10 preferred screenshots are baked in and hidden from the UI entirely:

- Isolated docs always split into a labeled bottom grid, sorted alphabetically (zh collation) for stable scanning.
- Hover always dims non-neighbors and highlights the closed neighborhood + ancestor breadcrumb.
- Semantic edges get a marching-ants stroke animation on hover; reference edges stay static (they don't need the animation — the accent color + width bump reads unambiguously as "this is a hard link").

**Layouts explicitly dropped** because they never looked right on realistic data:
- `cose` — superseded by fcose
- `breadthfirst` — collapses to a horizontal line when the graph is not a tree
- `grid` — throws away all relational structure
- `concentric-score` — spreads similar-score nodes across separate rings, no semantic value

`cise` is kept alive as an Advanced-panel choice (great for pathological data sets with many small hub clusters) but is not a top-level preset because our typical result sets have 2 hubs with sparse constituent links, and `cise` visually collapses those to two tiny dots.

### 3 · `hub_constituent` edges dropped everywhere

Rendered dashed accent lines added noise. The isolation criterion also switched to counting reference edges only, so docs whose only link was `hub_constituent` correctly show up in the isolated grid instead of pretending to be connected.

`buildResultSubgraph` still emits `hub_constituent` in its output for callers who want it (e.g. Mermaid export), but the render layer skips the kind entirely and the Advanced-panel toggle for it was removed.

### 4 · Header layout — Variant A (macOS segmented control)

The V1 header put a plain Network icon in the mode-picker row's whitespace. V2 restructures it into three visually distinct controls (see `docs/research/2026-07-07-result-graph-layout/header-variants.html` for the full comparison):

```
[ Graph view ]  ·  [ Constellation | Flow ↓ | Flow → | Folder tree | Orbit ]  ○— Semantic
```

- **Graph view** — leftmost. Filled accent pill when on, outlined muted pill when off. Its own top-level state, not a chip in a row.
- **Vertical divider** — separates the top-level toggle from the preset control so the eye reads them as two distinct groups.
- **Preset segmented control** — accent-tinted container with the active preset as a white floating pill (`0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(124,58,237,0.15)`). Reads as "pick one of these" like a native macOS segmented control.
- **Semantic** — a real toggle switch (30 × 16 track, sliding 12 × 12 thumb). Convey "layer on / off" via a switch idiom instead of another chip.

### 5 · Modal claims full viewport height in graph view

The V1 modal was content-driven — a compact 400 px minimum for list mode. Graph view got squeezed. V2 walks up to the Obsidian `Modal` shell (`.modal` ancestor) and imperatively sets `height: calc(100vh - 160px)` when `resultView === 'graph'`, clearing it when leaving. List view sizing is untouched.

## Interaction spec (what changed vs V1)

| Interaction | V1 | V2 |
|---|---|---|
| Single click doc | select in graph + Inspector | same |
| Double click doc | open in workspace | same |
| Single click hub anchor | open hub doc in tab | same |
| Cmd+click hub anchor | open hub subview (pin results) | same |
| Hover doc | dim rest, highlight direct neighbors | dim rest, highlight neighbors + **all ancestor folders** (breadcrumb) |
| Hover compound folder | (V1 had no compound) | dim rest, highlight the whole subtree + all inner edges |
| Reference edge highlight | orange dashed | orange **solid**, static |
| Semantic edge highlight | orange dashed | orange dashed + marching-ants (rAF, time-based delta) |
| Node labels | truncate with ellipsis | wrap up to 360 px, node auto-sizes to fit |
| Isolated docs | right-side rail | bottom grid, labeled "ISOLATED MATCHES", sorted alphabetically |
| Copy button | JSON to clipboard | **Mermaid** flowchart; icon swaps to Check for 1.5 s |

## Store schema

`vaultSearchStore.ts` state used by graph view (V2 shape):

```ts
resultView: 'list' | 'graph';           // top-level toggle
graphPreset: GraphPreset;               // one of the 5 presets above
graphShowSemantic: boolean;             // overlay switch
pinnedResultDocIds: string[] | null;    // T7 hub subview pin (untouched)
```

`setGraphPreset` auto-enables `graphShowSemantic` when switching to Orbit and clears it otherwise. Every other preset defaults to semantic off; the user can still toggle it on top.

V1 fields removed: `graphOverlayFolder`, `graphOverlaySemantic`, `setGraphOverlayFolder`, `setGraphOverlaySemantic`, `toggleGraphOverlayFolder`, `toggleGraphOverlaySemantic`.

## Files touched

**Renderer:**
- `src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx` — cytoscape port; ~500 lines including inline layout / hover / animation
- Deleted: `HubAnchorNode.tsx`, `ResultDocNode.tsx`, `CommunityBackground.tsx`, `FolderBoundary.tsx`, `IsolatedMatchesRail.tsx`, `SparseFallbackBanner.tsx` (all ReactFlow-era)

**UI:**
- `src/ui/view/quick-search/components/ResultPaneHeader.tsx` — Variant A layout: `GraphViewToggle` (leftmost pill), `GraphPresetSegmented` (macOS segmented), `SemanticToggle` (switch)
- `src/ui/view/quick-search/SearchModal.tsx` — `useEffect` walks up to `.modal` ancestor and forces `height` in graph view

**Store:**
- `src/ui/view/quick-search/store/vaultSearchStore.ts` — `GraphPreset` type + `graphPreset` / `graphShowSemantic` fields

**Deps (new):**
- `cytoscape`, `cytoscape-fcose`, `cytoscape-cise`, `cytoscape-cola`, `cytoscape-dagre`, `@types/cytoscape`

## Sandbox → plugin round-trip

The `docs/research/2026-07-07-result-graph-layout/index.html` sandbox is the reference implementation; the plugin's `ResultGraphView.tsx` mirrors it feature-for-feature. Future layout tweaks should be prototyped in the sandbox first (paste any subgraph JSON via the built-in dialog) before porting. Copy button in the plugin emits Mermaid flowchart — the sandbox's "Paste data" accepts either the Mermaid string or the older JSON shape.

## Acceptance criteria (verified live 2026-07-08)

- [x] Five presets switch layout + grouping + default edges as specified
- [x] Semantic toggle overlays semantic edges on top of any preset without switching preset
- [x] Isolated docs sort alphabetically and stay in place across query changes
- [x] Hover on a doc highlights neighbors + every ancestor folder
- [x] Hover on a folder highlights the whole subtree
- [x] Reference edges on hover are solid + accent, semantic edges are dashed + marching-ants
- [x] Node labels never truncate; long titles wrap to 2 lines
- [x] `hub_constituent` edges are not visible anywhere in render or advanced toggles
- [x] Graph view forces the modal to fill viewport height; list view stays compact
- [x] Copy button copies Mermaid; icon swaps to Check for 1.5 s
- [x] Cmd+click hub anchor still opens the hub subview (T7 hook)
- [x] `npm run build` clean, `npm run test` 191/191 pass

## Deferred

- Edge hover tooltip (already-planned from V1 — still needs a custom cytoscape edge component with popper or native `<title>`)
- Hub anchor label from the hub curator's LLM-generated title rather than the raw `Hub-000031ae70fe` node_id — this is a curator concern, not a viewer concern
- Multi-select / lasso for exporting a subset of nodes to Mermaid
