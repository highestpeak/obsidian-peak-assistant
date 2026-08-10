# Result Graph Community — production specification

Date: 2026-08-10

## Outcome

Result Graph gains a Community projection that explains a computed cluster without pretending the cluster has a permanent human name. The feature combines deterministic graph evidence with an optional, user-triggered AI explanation. It reuses the existing Result Browser and Cytoscape renderer; it does not create a second graph product.

## Product contract

- Keep five visible graph controls: Connections, Community, Links (direction toggles between down/right), Folders, and Hubs.
- Community labels are view-local ordinals (`Community 01`) derived from the current result projection. A stored `community_id` is not presented as a stable identity.
- Community color is optional presentation state. A single translucent hull groups visible members; node match intensity remains legible inside the hue.
- Physical/reference edges are directed and use straight routing unless parallel or reverse edges require a curve. Semantic edges are dashed, undirected, optional, and visually subordinate.
- A node hover card follows its node and shows title, path, preview, community membership, deterministic grouping evidence, and incoming/outgoing/total physical-link counts.
- A community hover card follows the hull/label and shows visible coverage, total membership, descriptors with support, internal physical-link count, and optional AI explanation.
- Hover cards form an interactive pointer corridor: moving from anchor to card does not dismiss the card; Escape closes it; AI actions never close it.

## Community computation

The analysis graph is a sparse, weighted, undirected graph for clustering:

1. Vault references are the strongest signal.
2. Explicit topic/user/functional tags add IDF-weighted document-to-document affinity.
3. TextRank terms add a lower TF-IDF-style affinity and require multi-document support.
4. Semantic similarity is optional and weak. Similarity is used directly; it is never converted to `1 - similarity` for Louvain.
5. Common signals above the configured document-frequency ratio are suppressed. Per-document signals, per-signal pairs, and per-node neighbors are capped.

For large vaults, expensive Brandes/constraint/hole analysis may degrade independently, but community computation must continue on a bounded sparse graph. The result reports its coverage and analysis mode; it must not silently return an empty community set solely because the vault has more than 4000 nodes.

Each community emits:

- current ephemeral `communityId`;
- stable content fingerprint over sorted member IDs, evidence/config version, and descriptors;
- member count and internal reference count;
- top descriptors with kind, support, and score;
- representative nodes;
- analysis version and coverage/mode.

## AI explanation contract

- Generation is explicit (`Explain with AI` / `Regenerate`), never background or batch.
- The model receives only deterministic evidence: descriptors/support, internal-link count, representative notes, coverage, and current fingerprint.
- Output streams into the open card. The final record may contain a suggested label, but the UI never renames the community automatically.
- The saved snapshot is bound to the evidence fingerprint. A record whose fingerprint differs is shown as stale and is not represented as a current explanation.
- Cancel/error leaves deterministic evidence visible and appends a run event.

## Persistence contract

- `graph.community-explanation`: durable atomic JSON snapshot, one current record per ephemeral community slot.
- `graph.community-explanation-events`: append-only JSONL generation history/receipt.
- `projection.graph-community`: rebuildable SQLite projection for computed community metadata only.
- No automatic Markdown. A future export is an explicit user artifact and is outside this change.
- All writers are registered in the generated-output catalog. SQLite is never the source of truth for AI explanation text.

## Non-goals

- No permanent automatic community naming.
- No second search/index runtime.
- No generated hub substitution.
- No promise that a force/dagre layout proves causality or time order.
- No background LLM cost.

## Acceptance

- Unit tests prove weight direction, IDF/common-signal suppression, stable fingerprinting, evidence aggregation, bounded large-vault mode, stale detection, and generated-output registration.
- Result Browser contract tests prove the five-control toolbar and Community preset propagation.
- Production build passes.
- Real Obsidian verification proves anchored hover corridors, directed arrows, semantic toggle, streaming, persistence restore, stale state, Escape, and focus. If the renderer is unavailable, those items are reported as `INTERACTION NOT VERIFIED`.
