# Incremental AI Graph · Cytoscape interaction mock

This is a design-only, standalone `file://` prototype for owner review.

## What it demonstrates

- The current immutable AI Graph version remains the canonical base while an Agent run is active.
- Agent output is projected as a typed, ordered 16-operation working overlay: inspect source, place nodes, focus the viewport, add relations, update, remove, validate, and choose auto-layout.
- New nodes use separate open placement slots and do not cover prior nodes. Seven candidates are placed before the Agent creates any relation, including one deliberately disconnected hypothesis.
- When the newest node lands beyond the right edge, a dedicated focus operation pans the working scene to that node without changing any graph coordinates or triggering layout.
- Relations arrive in later batches. The Agent can therefore place disconnected nodes first, ground only the supported subset, and remove a transient orphan without ever adding it to the semantic diff.
- Additions appear immediately; removals remain recoverable tombstones until the run is accepted.
- The graph stays primary and uses the full workspace by default. Agent operations live in an optional Activity drawer opened from the top bar; there is no dedicated Review rail or Added / Changed / Removed dashboard.
- The complete graph restores the five original AI Graph content lenses without restoring the legacy React Flow renderer: `Topology`, `Thinking Tree`, `Bridges`, `Timeline`, and `Gaps` now render through the shared Cytoscape canvas.
- Lens and layout are separate concepts, but a lens exposes only layouts that preserve its meaning. `Topology` offers `Constellation`, `Flow →`, and `Flow ↓`; `Thinking Tree` is a fixed horizontal `Flow →`; `Bridges` offers `Flow →` and `Constellation`; `Timeline` is a fixed horizontal `Flow →`; and `Gaps` uses a dedicated `Gap map`. Document-specific `Community`, `Folders`, and `Orbit` controls are deliberately absent because an AI Graph may contain arbitrary entity and concept nodes.
- `Links` is renamed to `Flow`. A fixed layout appears as a compact status badge rather than a misleading one-option switcher.
- Timeline keeps its semantic presentation instead of becoming a generic flowchart. Three chronological wrappers (`Foundation`, `Evidence`, and `Control`) follow the three Cytoscape chains. The previous independent decorative axis and ticks were removed: the real Cytoscape relation is now the only timeline line, so the wrapper, nodes, arrows, and dates cannot describe competing geometry.
- Bridges is a semantic projection rather than an unexplained filtered subgraph. It shows three named source → bridge → destination paths, labels the middle concepts directly (`Retrieval`, `Global search`, and `Claim provenance`), and explains which knowledge domains each one connects.
- Gaps no longer means “community view with faint dashed edges.” Its dedicated map shows three concrete structural-gap objects (`Missing bridge`, `Weak bridge`, and `Latent connection`) between named knowledge areas, with score and evidence status. A gap is therefore visible as a meaningful missing or fragile relationship, not as empty canvas space.
- The lens projections are not five copies of the same edge set: Thinking Tree keeps a derivation hierarchy, Bridges exposes cross-domain concepts, Timeline creates dated evolution chains, and Gaps renders explicit diagnostic objects. Choosing a lens during replay opens the complete proposal for direct comparison; the incremental run can still be replayed.
- A completed run leaves the final graph visible. `Accept new version` is the only action that advances `v12` to `v13`; `Pause`, `Continue`, `Stop`, `Skip to final graph`, `Discard`, and `Replay` expose the minimum control and recovery model.
- The graph is rendered through the production public `AtlasGraphCanvas` facade and therefore uses the shared Cytoscape stack. No React Flow dependency or consumer is introduced.
- The Cytoscape base receives one stable `subgraph` reference for the entire replay. Agent changes are demonstrated in a transient working-overlay layer, so an operation cannot destroy the canvas, rerun the whole layout, or auto-fit the viewport.
- Overlay relations share one calibrated canvas coordinate system. Paths terminate at the boundary of their source and target cards rather than at free-floating cursor coordinates; removal strokes trace the two existing relations attached to the original node.
- Added relations no longer animate dash values. Each mounted curve is sampled with `getTotalLength()` / `getPointAtLength()`, and `requestAnimationFrame` grows one continuous path geometry for 1.05 seconds with a 190 ms per-edge stagger. This avoids the coordinate mismatch created by `preserveAspectRatio="none"` plus non-scaling strokes. The exact original Bézier and arrowhead replace the sampled path only after the body reaches its endpoint; relation operations dwell for 2.2 seconds before the Agent advances.
- Node-targeted Agent markers sit on the lower-right card corner, with their object label opening below and outside the card. Relation markers remain near their paths, so activity feedback never masks node content.
- After all 16 Agent operations complete, the Agent explicitly chooses `Auto layout`. A second shared `AtlasGraphCanvas` renders the complete 12-node / 15-relation proposal once and cross-fades it over the spatially locked working view. The finished graph remains the primary result; Activity stays optional.

The graph content and run events are illustrative mock data. This prototype does not call an AI provider, write an AI Graph version, or modify production source.

The working overlay is intentionally mock-only. A production implementation should apply the same mutations through a shared `AtlasGraphCanvas` incremental patch API (`add / update / tombstone`) rather than keeping HTML/SVG overlay objects.

## Product implication being tested

The current production update path waits for one final generated graph, computes a semantic diff, and then renders the result. Supporting this mock faithfully would require the generation path to emit typed incremental graph-patch events while preserving the final validated `AIGraphSemanticDiff` as the acceptance boundary.

Likely event families:

```text
run.started
source.inspected
node.proposed
node.updated
node.removal-proposed
viewport.focused
relation.proposed
relation.updated
relation.removal-proposed
validation.completed
layout.requested
layout.completed
diff.ready
version.created
```

These events describe observable graph mutations and evidence, not hidden chain-of-thought.

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
