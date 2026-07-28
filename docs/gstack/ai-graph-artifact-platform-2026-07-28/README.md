# AI Graph interactive prototype

This docs-only prototype uses the real AI Analysis graph renderer:

- `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx`
- `@xyflow/react`
- the production node, edge, topology, thinking-tree, bridge, and timeline layout components
- the built production `styles.css`

The prototype entry is `prototype.tsx`. Rebuild its browser bundle from the repository root:

```bash
./node_modules/.bin/esbuild \
  docs/gstack/ai-graph-artifact-platform-2026-07-28/prototype.tsx \
  --bundle \
  --outfile=docs/gstack/ai-graph-artifact-platform-2026-07-28/prototype.bundle.js \
  --format=iife \
  --platform=browser \
  --target=es2018 \
  --jsx=automatic \
  --tsconfig=tsconfig.json \
  --alias:@=./src
```

Boundary:

- Graph rendering and its direct interactions are production-stack parity.
- The normal graph stage matches the 500px production reading height. The Graph Detail shell adds a design-target fullscreen mode and remounts the production renderer so `fitView` recalculates for the larger viewport.
- The prototype follows the production AI Analysis default by showing Controls without the optional MiniMap.
- Thinking Tree and Timeline use target-state lens projections before entering the production renderer: the tree receives only parent/child derivation edges, while Timeline receives generated evolution-chain edges without duplicate raw temporal edges. This documents a required input-contract correction; current production still renders all edges in Thinking Tree and can duplicate Timeline paths.
- The stronger tree/timeline stroke treatment and reading guide are target visual treatments in the docs shell, not a claim that production CSS already ships them.
- The former standalone Library mock has been superseded by the embedded [AI Search unified modes prototype](../ai-search-unified-modes-2026-07-28/index.html). AI Graph now uses the AI Search modal's compact history list; artifact persistence remains an independent target capability.
- Artifact persistence, evidence review, instruction-first Update graph, Sources management, and Create Graph are target-product prototype interactions.
- `Update graph` automatically carries the current graph, version, selection, and sources into a natural-language instruction flow. It previews a semantic diff and only creates an immutable version after explicit acceptance.
- The target Update UI consumes the peer-level [Shared AI Instruction Composer](../../superpowers/specs/2026-07-28-shared-ai-instruction-composer.md). That capability is not owned by AI Graph: Chat Studio, Composer Copilot, AI Graph, and future AI surfaces are sibling consumers. The docs-shell textarea is only the AI Graph adapter projection.
- `Sources` manages source membership and freshness. Adding or checking a source intentionally leaves the graph and its version unchanged until the user sends those changes through `Update graph`.
- Current `LensGraphData` is file-path centric. This prototype uses `ai-graph://...` adapter paths until the proposed heterogeneous `AIGraphArtifact` domain model exists.
- Current `MultiLensGraph` exposes node click but not relation click. The prototype does not simulate edge click; relationship review starts from the Needs review queue.
- No production feature source is modified by this prototype.
