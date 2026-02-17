---
title: Graph Visualization Design Overview
date: 2026-02-18
scope: obsidian-peak-assistant / graph-viz
---

This document describes the overall design and key conventions of **Graph visualization** in this project (`src/ui/component/mine/graph-viz/`). It covers the data model, rendering backends, layout and visible-subgraph derivation, interactions, path selection (Find Path), performance strategies, and historical pitfalls.

> Goal: make the module understandable without reading the entire codebase—how it works, why it is designed this way, what the boundaries are, and which pitfalls to avoid.

## Architecture

- **Entry component**: `GraphVisualization.tsx`
  - Composes hooks and UI components (toolbar / settings / tools panel / main canvas / effects canvas / context menu).
- **Engine layer (state + refs + imperative API)**: `hooks/useGraphEngine.ts`
  - Owns the D3 simulation, zoom, core refs, and path selection state.
  - Exposes `applyPatch/clear/fitToView/...` APIs to callers.
- **Render join (visible subgraph + MST + effects + simulation)**: `hooks/useGraphRenderJoin.ts`
  - Derives the visible subgraph from the master graph and feeds it into the simulation and renderer (SVG / Canvas).
- **Data cache (incremental patches)**: `core/graphData.ts`
  - Maintains persistent node/link caches; applies upsert/remove patches and returns `GraphVizNode[]` / `GraphVizLink[]` for rendering.
- **Streaming (progressive loading for large graphs)**: `hooks/useGraphStreaming.ts`
  - When the node count exceeds a threshold, pushes patches in RAF batches to avoid freezing the UI.

### Data flow (overview)

```mermaid
flowchart LR
  A[UIPreviewGraph\n(nodes, edges)] --> B[previewToPatch]
  B --> C[useGraphStreaming\nbatch patches via RAF]
  C --> D[useGraphEngine.applyPatch]
  D --> E[core/graphData cache\napplyPatch -> nodes/links]
  E --> F[useGraphRenderJoin.renderJoin]
  F --> G[getVisibleGraph + MST + effects]
  G --> H[D3 simulation update]
  H --> I[Render\nCanvas or SVG]
```

## Product capabilities and analysis workflows

This section is a user-facing guide to what GraphViz can do today, how it is configured, and how users can use it to analyze a graph effectively.

### Capabilities (what GraphViz supports)

- **Render large graphs without freezing**
  - Progressive streaming for large graphs (`hooks/useGraphStreaming.ts`), plus RAF coalescing for render joins.
- **Two rendering backends**
  - SVG data-join path (kept as an option) and Canvas rendering (default) for scale and performance.
- **Navigation**
  - Zoom in/out, pan, fit-to-view.
  - Relayout (clear + re-stream) when the host provides a graph input.
- **Filtering and decluttering**
  - Toggle tag nodes/edges.
  - Toggle semantic (AI-inferred) edges.
  - Fold leaf neighbors to reduce noise.
  - Cascade prune removes isolated nodes after filters/folding.
- **Graph structure analysis overlays**
  - **Hubs**: highlight top-degree nodes with a halo.
  - **MST / Skeleton**: show the maximum spanning tree backbone and dim non-tree edges.
  - **Community hulls**: draw convex hulls for detected communities.
- **Path analysis**
  - “Select path” mode: click two nodes to highlight the shortest path.
  - Optional “Discover path”: enter a target note/path and compute a path from a selected start (host-provided tool integration).
- **Export / snapshot**
  - Copy the current graph snapshot as **Markdown**, **JSON**, or **Mermaid**.
- **Extensibility hooks for domain integration**
  - `normalizeNodeId`, `getNodeStyle`, `getEdgeStyle`, `getNodeLabel`, `extractPathFromNode`, `effectKindMap`, and `nodeContextMenu`.

### Configuration surface (where users change behavior)

GraphViz configuration is stored in `GraphConfig` (`config.ts`) and is exposed via:

1) **Toolbar (`components/GraphToolbar.tsx`)**

- **Analysis menu**
  - `highlightHubs`: toggle hub highlighting
  - `skeletonMode`: toggle MST/skeleton mode
  - `communityMode`: toggle community hull overlays
- **Path controls**
  - “Select path” toggle (when `pathMode` is enabled)
  - “Clear path” when a path selection exists
- **Navigation**
  - Zoom in/out, fit-to-view
  - Relayout (host-provided)
- **Copy snapshot**
  - Copy format: `markdown | json | mermaid`

2) **Settings panel (`components/GraphSettingsPanel.tsx`)**

- **Display**
  - `showTags`: show/hide tag nodes and their edges
  - `showSemanticEdges`: show/hide semantic edges
- **Forces (layout tuning)**
  - `centerStrength`, `chargeStrength`, `linkStrength`, `linkDistance`, `collisionRadius`
  - `clusterForceStrength` (when cluster layout is enabled in engine/preset)
- **Nodes**
  - `nodeBaseRadiusPhysical`, `nodeBaseRadiusSemantic`, `nodeDegreeBoost`
- **Edges**
  - `semanticEdgeStyle`, `semanticEdgeOpacity`, `semanticEdgeWidthScale`
  - `physicalEdgeStyle`, `physicalEdgeOpacity`, `physicalEdgeWidthScale`
- **Colors**
  - `tagNodeFill`, `semanticLinkStroke`, `physicalLinkStroke`, `semanticNodeFill`, `physicalNodeFill`
- **Hubs**
  - `hubTopN`, `hubColor` (visual tuning; enable/disable is in toolbar)
- **MST (visual tuning)**
  - `mstColor`, `mstEdgeStyle`, `mstEdgeOpacity`, `mstWidthScale`, `skeletonMinBranchNodes`
- **Path**
  - `pathColor`

3) **Tools panel (`components/GraphToolsPanel.tsx`)**

- **Path**
  - Optional “Discover path” input + results, when the host provides `ToolbarFindPathConfig`.
- **Inspector hops (host integration)**
  - Optional `hops` (1/2/3) selector when the host provides `ToolbarHopsConfig`.

### Recommended analysis workflows (how to “read” the graph)

- **Start broad, then reduce noise**
  - Fit to view, then toggle **Tags** and **Semantic edges** to see how much structure each adds.
  - If the graph is visually overwhelming, fold leaf nodes to reduce “dangling” noise.
- **Find the backbone**
  - Enable **MST** (skeleton mode) to reveal the main structure. Use MST styling controls (opacity/width) to keep the backbone readable.
- **Spot key nodes**
  - Enable **Hubs** and adjust `hubTopN` to highlight the most connected nodes.
  - Combine with MST to see whether hubs are structural connectors or peripheral.
- **Identify clusters**
  - Enable **Hulls** to visualize communities. Use this to detect topical regions and bridges between them.
- **Explain a relationship**
  - Use **Select path** to highlight the shortest connection between two nodes (great for “why are these two notes related?”).
  - If available, use **Discover path** to compute and display explicit note paths (host tool).
- **Export and share**
  - Copy as Markdown/JSON/Mermaid depending on downstream usage:
    - Markdown: human-readable summary
    - JSON: tooling/debugging
    - Mermaid: embed in docs and render diagrams

## Data model and key conventions

### Types (core)

- **`GraphUINode` / `GraphUIEdge`** (input model)
  - Defined in `types.ts`.
  - `GraphUIEdge` uses `from_node_id` / `to_node_id`.
- **`GraphVizNode` / `GraphVizLink`** (rendering model)
  - Defined in `types.ts`.
  - `GraphVizLink.source/target` can be `string | GraphVizNode` (D3 resolves endpoints to node references).
- **`GraphPatch`** (incremental update)
  - Defined in `utils/graphPatches.ts` (continuously pushed by external/tools layer).

### ID consistency (`normalizeNodeId`)

The module allows the host to inject `normalizeNodeId(id)` (e.g. the Obsidian preset strips prefixes like `file:`/`node:`).

**Design principles:**

- **The “true node id” is stored in the data layer**: in `core/graphData.ts`, the `nodeById` key uses the raw string.
- **The id space used for comparisons/dedup/pathfinding/highlighting must be unified**:
  - `linkKey(l, normalizeNodeId)` generates link keys in normalized id space.
  - Find Path computes and returns `pathNodeIds` in normalized id space.
  - The renderer highlights path nodes by comparing `normalizeNodeId(node.id)` against `pathNodeIds`.

> Rule of thumb: do not mix raw ids and normalized ids across layers. Once mixed, issues like “source degree becomes 0”, “no path found”, and “inconsistent highlighting” will keep recurring.

### Link key convention (`linkKey`)

- `utils/link-key.ts`: `linkKey(l, normalizeNodeId)` normalizes endpoints and builds a stable key from (source, target, kind).
- `core/graphData.ts` uses the same normalization rule to build `linkByKey` keys to avoid duplicate edges.

## Rendering backends: SVG and Canvas

### Why support both backends

- **SVG**: simpler to implement and debug; suitable for smaller graphs.
- **Canvas**: more stable for larger graphs; avoids layout/reflow costs from a large DOM tree.

The engine currently defaults to **Canvas** (`renderBackend: 'canvas'` inside `useGraphEngine`), while `useGraphRenderJoin` keeps the SVG data-join path as an optional implementation.

### Canvas layers

- **Main canvas**: `components/GraphMainCanvas.tsx`
  - Draws nodes/links/labels (pure canvas rendering) and implements hit-test/drag/hover interactions.
- **Effects canvas**: `components/GraphEffectsCanvas.tsx`
  - Renders hub halos / community hulls / path glow / effects.
  - Critical constraint: **must not read DOM layout every frame** (see Crash Fix below).

## Visible subgraph and folding

The visible subgraph is computed by `utils/visibleGraph.ts`:

- Input: master `nodesRef.current` + `linksRef.current`, plus config:
  - `showTags`: whether to show tag nodes and their edges
  - `showSemanticEdges`: whether to include semantic edges
  - `foldedSet`: set of folded/hidden nodes
- Output:
  - `visibleNodeIds: Set<string>`
  - `visibleLinkKeys: Set<string>`

### Cascade prune

After hiding tags / folded nodes, isolated nodes may appear. `getVisibleGraph` computes degrees on the visible graph and iteratively removes degree-0 nodes until reaching a fixpoint, keeping the visible graph compact.

### Folding

`useGraphEngine.onFoldNode(nodeId)` calls `getLeavesOf(...)` to find leaf neighbors and updates `foldedSet`, implementing “fold leaf nodes”.

## MST / Skeleton mode

Computed in Phase 1 inside `useGraphRenderJoin`:

- **MST computation**: `utils/mst.ts` (maximum spanning tree + optional pruning/skeletonization)
- **Skeleton rendering strategy** (`config.skeletonMode`):
  - Draw backbone edges first
  - Render terminal/leaf edges with original style (or reduced opacity/width)
  - Dim non-MST edges in skeleton mode to reduce visual noise

> Purpose: quickly surface the “backbone structure” for large graphs, avoiding unreadable edge clutter.

## Layout and simulation

We use `d3-force`:

- **Simulation setup**: `hooks/useGraphSimulation.ts` initializes the simulation and zoom behavior.
- **Force parameters**: come from `GraphConfig` (`config.ts`), including center/charge/link/collision and cluster layout.
- **Initial positions**: `utils/topologyLayout.ts` assigns initial positions by group/topology to reduce cold-start jitter.
- **Streaming**: be careful with simulation restart/alpha during streaming to avoid frequent restarts and jank (see Crash Fix).

## Interaction design

### Zoom / Pan

- D3 zoom is bound to SVG or Canvas (depending on the backend).
- `fitToView(force)` computes bounds and a fit transform via `core/graphBounds.ts`.
- `userInteractedRef`: after user interaction, we do not auto-fit by default (unless `force=true`).

### Hover highlighting (neighbors / dimming)

- `hooks/useGraphHoverHighlight.ts` computes neighbor sets and highlight keys; the canvas renderer dims non-neighbors accordingly.

### Dragging nodes

- Canvas: `GraphMainCanvas` sets `fx/fy` on pointerdown hit and updates during pointer move.
- SVG: `drivers/dragBehavior.ts` provides a drag behavior (if SVG backend is enabled).

### Context menu

- `hooks/useGraphContextMenu.ts` manages menu state, click-outside close, leave-delay close, etc.
- Business extensions are injected via `NodeContextMenuConfig` (open source file, copy, fold, set path start/end, etc.).

## Path selection (shortest path between two nodes)

### State machine (two clicks)

- When `config.pathMode` is enabled, users can enter path-select mode:
  - First click sets start (`pathStartIdRef`)
  - Second click sets end and computes the shortest path
- Output:
  - `pathNodeIds: string[]` (**normalized id space**)
  - `pathLinkKeys: Set<string>` (consistent with `linkKey(l, normalizeNodeId)`)

### Handling D3 “in-place mutation” of `link.source/target`

D3’s link force mutates `link.source/target` in-place, replacing ids with node references.

**Strategy:**

- The engine builds a **pathfinding edge snapshot** at `applyPatch` time (only endpoint ids + kind/weight) for pathfinding inputs, so it is not polluted by D3/resolve mutations.

### Shortest path algorithm (Dijkstra)

Implemented in `utils/shortestPath.ts`. Key constraints:

- The node set and edge endpoints must be in the same id space (normalize consistently).
- Weights must be finite; otherwise cost computation and relax comparisons break (guarded in both data layer and algorithm layer).

#### Historical pitfall: heap implementation prevented Dijkstra from starting at the source

We once observed logs like `sourceDegree > 0` but `visitedCount = 0`.

Root cause: we pushed all nodes (including Infinity) into an array as a heap but never heapified it. `extractMin()` could pop an Infinity node first and terminate early.

Fix: use a standard **lazy heap** Dijkstra:

- Push only the source initially
- Push new entries on relax
- Skip stale entries using `u.d !== dist.get(u.id)`

### Path highlighting (Canvas and effects)

Because `pathNodeIds` are normalized:

- Main canvas checks: `pathNodeIds.has(normalizeNodeId(node.id))`
- Start ring: `normalizeNodeId(node.id) === normalizeNodeId(pathStartId)`
- Effects canvas uses `Map(normalizeNodeId(n.id) -> node)` to resolve nodes from `pathNodeIds`

## Performance (large graphs)

### Streaming (batch push)

In `hooks/useGraphStreaming.ts`:

- Graphs larger than `STREAM_NODE_THRESHOLD` use streaming
- `STREAM_BATCH_SIZE`: max nodes processed per batch
- `STREAM_TIME_SLICE_MS`: per-frame time slice; break when exceeded and continue next frame
- `STREAM_INTERVAL_MS`: interval between batches to reduce GPU/main-thread pressure

### RAF coalescing and throttling

`useGraphRenderJoin.scheduleRenderJoin` coalesces triggers via RAF, preventing repeated `renderJoin` runs.

### Avoid forced reflow (Crash Fix)

Key principles (see “Crash Fix Postmortem (2026-02-13)” below):

- `GraphEffectsCanvas` **must not** read `container.clientWidth/clientHeight` inside the RAF loop
- Use `containerSizeRef` (cached ResizeObserver results from `useGraphContainer`)
- Do not start the animation loop when `effect === 'none'` or intensity is 0

### Other verified optimizations (Crash Fix summary)

- Ref-forward in `useImperativeHandle` to avoid stale closures
- Unify link key format to prevent edge dedup failures / edge explosion
- Reduce simulation restarts during streaming
- Use Zustand selectors to avoid whole-store subscriptions and useless re-renders
- Fullscreen toggle must not trigger re-fetch / re-streaming

### Crash Fix Postmortem (2026-02-13)

**Context:** Inspector graph (hops 1/2/3) caused page crashes (especially hops=2). Console showed `[Violation] Forced reflow` and slow `requestAnimationFrame` handlers.

#### Root cause summary

The crash was caused by **six interacting issues** in the graph visualization pipeline; a **seventh** addresses streaming RAF performance to avoid jank/GC/GPU strain:

1. **GraphEffectsCanvas forced reflow every frame** (primary)
2. **useImperativeHandle stale closure**
3. **Edge key format mismatch in upsertEdges**
4. **D3 simulation over-restart during streaming**
5. **Zustand full-store subscription causing unnecessary re-renders**
6. **fullscreenOpen in runGraph dependencies triggering re-fetch on fullscreen toggle**
7. **Streaming RAF: long callbacks, GC churn, GPU/layout pressure** (time slice + precomputed keys + batch/interval)

#### 1) GraphEffectsCanvas forced reflow (critical)

**Problem:** The effects canvas ran a RAF loop **even when `effect === 'none'`**, and read `container.clientWidth/clientHeight` every frame. With hundreds of SVG nodes/links from D3, this forced synchronous layout each frame, leading to 30–100ms reflows and repeated “[Violation] Forced reflow” warnings.

**Fix:**

- Pass **cached container size** via `containerSizeRef` instead of reading from the DOM.
- When `effect.type === 'none'` or `intensity <= 0`, **do not start the animation loop** — clear the canvas once and return.

**Files:** `src/ui/component/mine/graph-viz/components/GraphEffectsCanvas.tsx`, `GraphVisualization.tsx` (pass `containerSizeRef`).

#### 2) useImperativeHandle stale closure

**Problem:** `useImperativeHandle(ref, () => ({ applyPatch, clear, fitToView }), [])` captured the **first render’s** closures. Calls to `graphRef.current.applyPatch()` / `clear()` / `fitToView()` therefore used outdated `config`, callbacks, and streaming logic from render 0.

**Fix:** Keep refs to the latest closures and forward calls:

```ts
const applyPatchRef = useRef(applyPatch);
const clearRef = useRef(clear);
const fitToViewRef = useRef(fitToView);
applyPatchRef.current = applyPatch;
clearRef.current = clear;
fitToViewRef.current = fitToView;

useImperativeHandle(ref, () => ({
  applyPatch: (patch) => applyPatchRef.current(patch),
  clear: () => clearRef.current(),
  fitToView: () => fitToViewRef.current(),
}), []);
```

**File:** `src/ui/component/mine/graph-viz/GraphVisualization.tsx`.

#### 3) Edge key format mismatch in upsertEdges

**Problem:** Existing links were keyed with `linkKey(l, normalizeNodeId)` but new edges were checked with a different key format. The formats never matched, so deduplication failed and edges could accumulate incorrectly.

**Fix:** Use a **single key format** for both existing and new edges: `normalizeNodeId(source)::normalizeNodeId(target)::kind`. Build the map from `linksRef.current` using the same helper used when adding new edges.

**File:** `src/ui/component/mine/graph-viz/GraphVisualization.tsx` (`upsertEdges`).

#### 4) D3 simulation over-restart during streaming

**Problem:** Every `renderJoin()` did `simulation.alpha(0.08).restart()`. During incremental push, simulation stayed at high alpha and the tick handler ran heavy work every frame.

**Fix:** In **streaming mode**, only nudge simulation when alpha is very low; avoid full restart each time:

```ts
if (isStreaming) {
  if (simulation.alpha() < 0.03) {
    simulation.alpha(0.03).restart();
  }
} else {
  simulation.alpha(Math.max(simulation.alpha(), 0.08)).alphaTarget(0.02).restart();
  // ... settle timer
}
```

**File:** `src/ui/component/mine/graph-viz/GraphVisualization.tsx` (`renderJoin`).

#### 5) Zustand full-store subscription

**Problem:** Using the store without a selector subscribed to the whole store. Any change re-rendered large UI subtrees.

**Fix:**

- Use selectors, e.g. `useGraphAnimationStore((s) => s.effect)`.
- In queue pumping, subscribe to specific fields (`enqueue`, `queueLength`) instead of the entire store or `queue.length` directly.

**Files:** `src/ui/view/quick-search/components/inspector/GraphSection.tsx`, `src/ui/component/mine/graph-viz/graphAnimationStore.ts`.

#### 6) `fullscreenOpen` in runGraph dependencies

**Problem:** Toggling fullscreen recreated `runGraph` (it was in deps), which retriggered the effect that calls `runGraph`, causing a **full re-fetch and restart of incremental push**.

**Fix:** Use a ref for fullscreen state and remove it from deps:

```ts
const fullscreenOpenRef = useRef(fullscreenOpen);
fullscreenOpenRef.current = fullscreenOpen;
// In pushBatch: if (fullscreenOpenRef.current) void fullscreenGraphRef.current?.applyPatch(patch);
// useCallback deps: [currentPath, hops, graphIncludeSemantic, stopIncrementalPush]
```

**File:** `src/ui/view/quick-search/components/inspector/GraphSection.tsx`.

#### 7) Streaming RAF performance (jank / GC / GPU)

**Problem:** The streaming effect could still cause jank due to long callbacks, allocation churn, and GPU/layout pressure.

**Fix:**

1. **Time slicing**: cap work per frame, using `STREAM_TIME_SLICE_MS = 10`.
2. **Precomputed edge keys**: store each incident edge as `{ e, key }` and reuse `key` in the hot path.
3. **Batch and interval**: increase `STREAM_BATCH_SIZE` and `STREAM_INTERVAL_MS` to reduce tick frequency.

**Files changed (summary):**

| File | Changes |
|------|--------|
| `GraphEffectsCanvas.tsx` | Use `containerSizeRef`; no loop when effect is none; use cached size |
| `GraphVisualization.tsx` | Pass `containerSizeRef`; ref-forward imperative API; unify edge key; streaming alpha; streaming time slice + precomputed keys + batch/interval |
| `graphAnimationStore.ts` | Narrow subscriptions using selectors |
| `GraphSection.tsx` | `effect` selector; `fullscreenOpenRef`; remove fullscreen from callback deps |

**Verification:** Lint clean; expected fewer/zero forced reflow violations, stable hops=2, no re-fetch on fullscreen toggle.

## Refactoring plan and module boundaries

This module was refactored to improve maintainability and performance while preserving behavior (throttling, streaming, refs).

### Goals

- **Single responsibility**: each module does one thing (data, rendering, orchestration).
- **Logic vs side effects**: pure logic in `core/`; D3/DOM/environment in `drivers/` and hooks.
- **Readability**: smaller files, explicit names, comments for non-obvious behavior.
- **Performance**: preserve throttling/streaming/RAF and ref-based updates.

### Target directory structure

```
graph-viz/
├── core/                    # Pure logic, no React/D3/DOM
│   ├── constants.ts
│   ├── nodeShape.ts
│   ├── graphBounds.ts
│   ├── degreeRadius.ts
│   └── linkResolver.ts
├── drivers/                 # D3 / DOM / environment integrations
│   ├── nodeShapeRenderer.ts
│   ├── dragBehavior.ts
│   └── zoomHelpers.ts
├── hooks/                   # React state & effects
│   ├── useGraphContainer.ts
│   ├── useGraphContextMenu.ts
│   └── useGraphCopy.ts
├── GraphVisualization.tsx
├── types.ts
├── config.ts
├── components/
├── utils/
└── formatters/
```

### Decoupling summary (surgery)

| Coupling / smell | Change | Benefit |
|------------------|--------|---------|
| 1300+ line single file | Split into core, drivers, hooks, view | Easier navigation and testing |
| Shape logic + DOM append mixed | `core/nodeShape` + `drivers/nodeShapeRenderer` | Pure logic testable; D3 isolated |
| Inline constants | `core/constants.ts` | One place to tune performance |
| fitToView math in component | `core/graphBounds.ts` | Pure math; unit-testable |
| Degree/radius/hub in renderJoin | `core/degreeRadius.ts` | Reusable and testable |
| ResizeObserver tangled in component | `hooks/useGraphContainer.ts` | Cleaner lifecycle |
| Context menu logic inline | `hooks/useGraphContextMenu.ts` | Reusable; clearer boundaries |
| Clipboard/copy inline | `hooks/useGraphCopy.ts` | Side effects isolated |
| Drag behavior inline | `drivers/dragBehavior.ts` | Clear D3 boundary |

### Implementation order (historical)

1. Core (pure): constants, nodeShape, graphBounds, degreeRadius, linkResolver
2. Drivers: nodeShapeRenderer, dragBehavior
3. Hooks: container, context menu, copy
4. `GraphVisualization`: compose modules; keep orchestration in one place

### Performance preservation principles

- Keep hot-path **refs** (`nodesRef`, `linksRef`, `*Ref`) centralized so renderJoin sees latest values without expensive re-init.
- Preserve **throttle / RAF** behavior (`scheduleRenderJoin`, streaming timers) to avoid regression.
- Keep imperative APIs stable using ref-forwarding to avoid stale closures.

### Refactoring notes (completed)

Key extractions that landed:

- Constants -> `core/constants.ts`
- Shape logic -> `core/nodeShape.ts`
- DOM append -> `drivers/nodeShapeRenderer.ts`
- Drag behavior -> `drivers/dragBehavior.ts`
- ResizeObserver -> `hooks/useGraphContainer.ts`
- Context menu -> `hooks/useGraphContextMenu.ts`
- Copy/clipboard -> `hooks/useGraphCopy.ts`
- Link resolution -> `core/linkResolver.ts`
- Degree/radius/hub -> `core/degreeRadius.ts`
- Fit bounds/math -> `core/graphBounds.ts`
- Data cache and patch apply -> `core/graphData.ts`
- Streaming RAF pump -> `hooks/useGraphStreaming.ts`
- Hover dimming -> `hooks/useGraphHoverHighlight.ts`

**Not extracted by design:** `renderJoin()` orchestration remains in `useGraphRenderJoin` / engine to avoid passing huge bundles of refs and callbacks across a “controller”.

## Extension points: preset and domain integration

The host injects domain semantics via a preset (e.g. Obsidian preset):

- `normalizeNodeId`: unify id semantics
- `getNodeStyle/getEdgeStyle`: map colors/line styles by domain kind/type
- `getNodeLabel/extractPathFromNode`: derive labels and file paths from attributes/path
- `effectKindMap`: map effect type to edge kinds
- `nodeContextMenu`: integrate actions like open/copy/fold/path selection into host capabilities

Example: `src/ui/view/quick-search/presets/obsidianGraphPreset.ts`

## Debugging and validation

- **Basic rendering**
  - Small graphs: non-streaming; Canvas/SVG should render correctly
  - Large graphs: UI should not freeze during streaming; the last batch should trigger a full render
- **Path selection**
  - Selecting two documents that have a reference chain should produce a highlighted path
  - If “no path” occurs:
    - Check whether start/end are in `visibleNodeIds` / master nodes
    - Check whether `normalizeNodeId` matches the id semantics in your data
- **Performance**
  - Use DevTools Performance; ensure there are no persistent “Forced reflow” warnings

---

## Single source of truth

This document is the **single source of truth** for graph-viz design.

- `docs/graph-viz-crash-fix.md` and `docs/graph-viz-refactor.md` are kept only as lightweight redirects to this document.

