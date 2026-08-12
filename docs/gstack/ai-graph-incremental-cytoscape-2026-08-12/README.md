# Incremental AI Graph · step-stream mock

This is a design-only, standalone `file://` prototype for owner review. It does not modify the production AI Graph runtime or write a graph artifact.

## Product model demonstrated

One AI run can produce five related graph views: `Topology`, `Thinking Tree`, `Bridges`, `Timeline`, and `Gaps`. They share the same frozen source revision and one final acceptance boundary, but each view has its own graph state and its own meaningful Agent operation sequence.

The run is step-streamed rather than token-streamed. Each visible Activity entry represents one validated graph transaction:

```text
inspect current revision
→ decide one bounded operation
→ emit typed patch
→ validate endpoints and revision
→ apply patch atomically
→ animate changed objects
→ optionally perform a local layout
→ observe the new revision
```

The Agent controls graph semantics. It can inspect the graph, add or update nodes and relations, remove a rejected object, inspect connected components or paths, and request a layout. The rendering engine owns coordinates, collision avoidance, viewport movement, and animation.

The current accepted AI Graph remains immutable throughout the run. The working graph becomes a new canonical version only after the complete five-view package is validated and accepted.

## Five distinct construction stories

- `Topology` starts from a stable six-node graph. The Agent stages unlinked nodes, connects them only after evidence is available, focuses an off-screen addition, refines one predicate, and removes rejected structure.
- `Thinking Tree` starts empty. The question appears first, and each decision or outcome is added only when its parent is known. A provisional shortcut branch is later pruned. Future node names never appear as ghost placeholders.
- `Bridges` starts with three real disconnected domain components. Here, a bridge means a concept that gives two otherwise separate domains a validated path. A concept is promoted from candidate only after it reaches both sides; a one-sided keyword candidate is rejected. A valid run may also report no bridge rather than fabricate one.
- `Timeline` starts empty and builds a temporal DAG rather than a single chain. The same dated contract opens two parallel branches; branch-local work can be inserted later; independent tasks merge at provenance, quality, and release gates; and one retrieval dependency crosses forward into observability. Phase wrappers are Cytoscape compound nodes created with their first real child, so wrappers follow the graph geometry. The completed DAG can be viewed horizontally or vertically.
- `Gaps` starts from an existing semantic graph. Here, a gap means that a path required by the task contract is absent or supported too weakly between two real endpoints. The Agent finds one missing path and one weak path while rejecting one false positive that already has a valid route. A gap is a typed diagnostic overlay, never a fabricated semantic node; a valid run may report zero gaps.

## Interaction and layout rules

- Each view owns one persistent Cytoscape instance from the first patch through review. Switching tabs does not recreate or replay a graph.
- Nodes and edges use one renderer and one coordinate system. There is no separate HTML-node/SVG-edge overlay, so resize, zoom, and drawer changes cannot detach lines from their endpoints.
- A normal add/update/remove patch never calls whole-graph `fit()`. Existing coordinates and the camera stay stable.
- If a newly added node falls outside the visible viewport, the camera pans to that node without changing graph coordinates.
- A local reflow happens only when the Agent explicitly changes structure, such as pruning a tree branch or inserting one task into a temporal branch. It changes the affected structure while preserving the current construction orientation.
- `Constellation`, `Flow`, and Timeline orientation are display layouts, not Agent generation tools. Their controls are locked while any view is generating. Incremental placement therefore stays spatially continuous and does not jump between presentation algorithms.
- After all views finish, one explicit `Refine` stage applies the selected display layout on the same graph instances. Only after Refine can the owner switch layouts interactively.
- Layout controls are semantic: Topology offers `Constellation`, `Flow →`, and `Flow ↓`; Bridges offers `Flow →` and `Constellation`; Thinking Tree is horizontal flow; Timeline offers `Time →` and `Time ↓` while retaining the same temporal DAG; Gaps is a diagnostic map.
- Activity is optional and opens as a drawer. The graph remains the primary UI; there is no permanent Added/Changed/Removed review dashboard.

## Production implication

The mock uses Cytoscape directly so the interaction model can be tested without changing production source. A production implementation should extend the shared `AtlasGraphCanvas` stack with a revision-guarded incremental patch API rather than introducing another renderer.

Suggested public operation vocabulary:

```text
graph.inspect
graph.inspectNeighborhood
graph.inspectComponents
graph.inspectPath
graph.addNode
graph.addEdge
graph.updateNode
graph.updateEdge
graph.removeNode
graph.removeEdge
graph.addGroup
graph.requestLayout
graph.validate
graph.completeView
```

A patch envelope should carry at least `runId`, `viewId`, `baseRevision`, `operationId`, `operation`, `payload`, `evidenceRefs`, and `expectedRevision`. The UI may animate an accepted patch, but animation completion must not define persistence or validation state.

These Activity events expose tool calls and graph mutations, not hidden chain-of-thought.

## Rebuild

From the repository root:

```bash
./node_modules/.bin/esbuild \
  docs/gstack/ai-graph-incremental-cytoscape-2026-08-12/prototype.tsx \
  --bundle \
  --outfile=docs/gstack/ai-graph-incremental-cytoscape-2026-08-12/prototype.bundle.js \
  --format=iife \
  --platform=browser \
  --target=es2018 \
  --minify \
  --jsx=automatic \
  --tsconfig=tsconfig.json \
  --alias:@=./src \
  --alias:crypto=./docs/gstack/ai-graph-incremental-cytoscape-2026-08-12/browser-crypto-shim.ts

perl -pi -e 's/[ \t]+$//' \
  docs/gstack/ai-graph-incremental-cytoscape-2026-08-12/prototype.bundle.js
```

Open [`index.html`](./index.html) directly in a browser.
