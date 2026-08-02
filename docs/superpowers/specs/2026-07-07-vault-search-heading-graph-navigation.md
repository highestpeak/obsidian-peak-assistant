# Vault Search Heading Mode And Result Graph View Design

**Status:** design decided (open questions resolved 2026-07-07)
**Date:** 2026-07-07
**Owner surface:** Vault Search / Quick Search
**Concept image:** [`docs/gstack/vault-search-navigation-2026-07-07/concept-board-v4.png`](../../gstack/vault-search-navigation-2026-07-07/concept-board-v4.png) — predates the Result Graph View pivot; the concept board still shows a standalone Graph mode. Text in this spec is authoritative; the concept image is kept as historical reference only.

> **2026-08-02 Hub storage update:** 本文的 `hub_doc` Markdown lookup 与 open-path 行为仍描述当前实现。长期目标改为 Hub manifest canonical + SQLite virtual projection；Result Graph 可直接显示 virtual Hub，默认打开 Peak Hub Detail，只有显式物化的 Hub 才按 Markdown path 打开并进入原生 Obsidian Graph。见 [生成产物注册表](../../conventions/generated-artifact-registry.md) 与 [存储治理实现设计](./2026-08-02-generated-artifact-storage-governance-implementation-design.md)。

## Summary

Vault Search should move from a flat keyword-result picker toward two changes:

1. **Heading mode** for navigating inside the current document.
2. **Result Graph View** — a one-click projection of the current result set onto the vault's structured graph (hubs, communities, folders), available from `All` and `Heading` modes as a toggle, not a separate mode.

The core user problem is not just "find next match". The user wants to understand where a term lives inside a document, and — when facing a wall of results — how those results actually connect through the knowledge structure, which the flat list cannot show and Obsidian's native graph deliberately does not surface (native graph treats all nodes as equal; the value of *our* graph is showing hubs, communities, and folder structure explicitly).

An earlier draft proposed a full `Graph` mode as a third search mode with vault-wide overview and scope-walk interaction. Design review scoped that down: a standalone Graph mode's user journey (browse landscape → scope → walk) was not concrete enough to justify a new surface, while the result-set projection has a specific, well-defined trigger and payoff. See §Product Variants (historical) for the earlier framing.

This is design-only. It does not prescribe code changes yet.

## User Intent

When the user types `#`, Heading mode should immediately show the active document's full heading tree. The empty `#` state should be useful by itself: it should reveal the document structure before any keyword is typed.

When the user continues typing, for example `#方案`, the heading tree should stay visible. Nonmatching headings should become visually muted, matching headings and snippets should be highlighted, and the user should be able to jump by section instead of stepping line-by-line through raw matches.

The current `Folder` and `Line` modes feel low-value:

- Users usually do not remember exact line numbers.
- Users often do not remember or care which folder a note lives in.
- Line navigation is subsumed by heading-aware jump targets in the new Heading mode.
- Folder narrowing has no direct replacement in this design (see §Recommended visible modes below for the rationale).

Recommended visible modes:

1. `All`
2. `Heading`

`Folder` and `Line` are removed outright, including the legacy `@folder` and `:line` prefix parsers. There is no hidden compatibility path: the parser code, the mode-bar entries, and any related settings are deleted together. Heading jump targets subsume Line stepping. Folder narrowing has no direct replacement in this design — feedback so far is that users rarely remember which folder a note lives in, so the mode was net-negative; if strong feedback surfaces later, folder scoping can return as an Inspector filter without a top-level mode.

Result Graph View is not a mode. It is a toggle on top of the `All` or `Heading` result pane that swaps the linear result list for a structured graph projection of the same result set. Same query, same set, different projection. See §Result Graph View.

## External Design Notes

VS Code's navigation model is relevant because it combines file path, symbol path, symbol filtering, and direct jump behavior. Its docs describe breadcrumbs as showing file and symbol location, and `Go to Symbol` as a way to navigate symbols inside a file by typing into a picker. The useful lesson is not to copy VS Code's UI, but to preserve **tree context while filtering symbols**. Source: [VS Code Code Navigation](https://code.visualstudio.com/docs/editing/editingevolved).

Obsidian's graph model is relevant because graph search already uses notes as nodes, links as edges, search filters, local graph depth, hover highlighting, and click-to-open behavior. The useful lesson is that graph exploration should remain navigational, not only decorative. Source: [Obsidian Graph view](https://obsidian.md/help/plugins/graph).

Search UI research supports this direction. Marti Hearst summarizes berry-picking and orienteering models: real search often shifts as users learn, and users commonly use an imprecise query to get into the right area, then navigate locally. That matches a manual graph walk better than a single final result set. Source: [Search User Interfaces, Chapter 3](https://searchuserinterfaces.com/book/sui_ch3_models_of_information_seeking.html).

Hierarchical graph navigation research also fits this product shape: when users explore unknown hierarchical graphs, they need both horizontal navigation across the layout and vertical navigation across abstraction levels. Subtle visual cues can recommend where to go next without taking over the user's agency. Source: [Navigation Recommendations for Exploring Hierarchical Graphs](https://vca.informatik.uni-rostock.de/~ct/publications/Gladisch13Recommendation.pdf).

## Recommended Heading Mode

### Empty State: `#`

Typing only `#` should show the full heading tree for the active document.

Each row:

- Heading icon or level marker.
- Heading title.
- Indentation by heading level.
- Line range without a letter prefix, for example `12-34`.
- Match count as a compact number, for example `3`.
- Optional section metrics such as outbound link count. Per-heading salience is not shipped in the first cut because no persisted signal supports it — see §Ranking Signals.

Tree indentation:

- H1: no indent.
- H2: one visible tree indent.
- H3: two visible tree indents.
- Deeper headings continue the same rhythm.

Use visual tree structure, not literal tab characters. The target is scanability, stable alignment, and keyboard navigation.

### Filtered State: `#方案`

When the user types query text after `#`:

- Keep the full outline visible.
- Dim headings/subtrees with no matches.
- Keep ancestors of matching headings visible so the user does not lose context.
- Highlight matching heading text and matching snippet terms.
- Show per-section match counts.
- Show total match count in the footer or mode bar.

Snippets do not render inline under matching heading rows. The left tree stays a stable document map at all times; the right detail pane owns snippet rendering for the currently active heading only (see §Selection And Detail Pane). Rationale: inline expansion bloats the tree on long documents with many matches and destroys the "outline at a glance" property that Heading mode exists to provide.

Keyboard behavior in the filtered state:

- Up/down moves the active row through visible heading rows in the tree.
- Left/right collapses or expands a heading subtree.
- Enter opens the active heading in the document.
- When focus is in the right detail pane (via Tab), Up/down moves through that heading's snippets and Enter opens the selected snippet's line.

### Selection And Detail Pane

Heading mode should be a two-zone surface:

1. **Left zone:** the full heading tree.
2. **Right zone:** match details for the currently selected heading or section.

Keyboard behavior:

- Up/down moves the active row in the heading tree.
- The active row gets a visible background highlight.
- The right detail pane updates immediately as the active row changes.
- Enter opens the active heading in the document.
- If focus is in the right detail pane, Enter opens the selected snippet line.
- Left/right collapses or expands a heading subtree.

Right detail pane content:

- Section title.
- Section range, for example `35-128`.
- Total matches in this section.
- A denser list of keyword hit snippets.
- Each snippet shows its exact line, short surrounding text, and highlighted query term.

This keeps the left side as a stable document map while giving the user enough room on the right to inspect where the word appears inside the selected section.

### Section Range

Line range should be derived from heading boundaries:

- A heading starts at its own line.
- It ends before the next heading at the same or higher level.
- If it is the last heading, it ends at the document end.

Example:

```text
H1  表格编辑协议改造          1-96      7
  H2  hash值计算              12-24     2
  H2  后续展望                25-96     5
    H3  性能风险              40-52     0
```

### Link Positions

The bottom of Heading mode should optionally show link anchors in the current document:

- Outgoing link positions, for example `34 -> [[Target Note]]`.
- Optional backlink positions if available cheaply.
- Links should be grouped by section when possible.

This helps the user see not only "where the word appears", but also where the document connects outward.

## Ranking Signals

### Available Today

Vault Search can consume the following persisted signals without adding new pipelines:

- **Reference PageRank** (`mobius_node.pagerank`) — vault-wide PageRank on the `references` (links) subgraph, persisted with `pagerank_version`.
- **Semantic PageRank** (`mobius_node.semantic_pagerank`) — weighted PageRank on the `semantic_related` edge set.
- **Personalized PageRank (PPR)** — query-time rerank signal, gated by the `usePersonalizedPagerank` setting.
- **TextRank** — document-level keyword and sentence extraction (`src/core/document/loader/helper/textRank.ts`), stored via the doc summary templates. TextRank operates on the whole document, not per heading.
- **Hub candidate scores** — four materialized columns on `mobius_node`: `hub_graph_score`, `hub_physical_authority_score`, `hub_organizational_score`, `hub_semantic_centrality_score`. Consumed by `HubCuratorAgent`; also usable as read-only heat signals.
- **Community id and betweenness centrality** — persisted for hub curation, reusable for Result Graph View community background coloring.

### Not Available Today

- **Per-heading / per-section salience** is *not* a first-class column. Any "salience dot beside a heading" or "most relevant sections rail" must be derived at query time from existing signals — for example, aggregating TextRank sentence positions into heading ranges, or averaging chunk scores of chunks that fall inside a section. This derivation is not free and belongs in a follow-up spec if the surface needs it.
- **Chunk score** exists only implicitly inside vector search results, not as a persisted per-chunk column.

### Rules For Using Signals

- Do not reorder the default heading tree by rank. The tree preserves document order because its job is orientation.
- Rank can appear as: a subtle salience dot or bar beside a heading (requires derived signal, see above); tie-breaker for snippet order inside a section; Result Graph View hub / community heat coloring.
- A "most relevant sections" compact rail above the tree is out of scope for the first cut of Heading mode — it depends on the derived heading-salience signal that does not exist yet.
- Ranking should help the user notice important sections. It must never destroy the document map.

## Result Graph View

### Purpose

Result Graph View projects the current query's result set onto the vault's structured graph — hubs, communities, folders — not onto the raw link graph. Obsidian's native graph treats every note and every link as equal, which produces a "fragmented cloud" that fails to answer the question a searcher actually has: *what structure does this set of matches belong to?* Result Graph View exists to make that structure visible.

The trigger is concrete: the user has already typed a query in `All` or `Heading` mode and is looking at N results. They can already read the list; they now want to see how those N documents cluster, which hubs they orbit, and which are isolated. One click swaps the list for the graph; one click swaps back. Same query, same result set, different projection.

This view is **not** a mode of Vault Search, and it is **not** an entry point for open-ended vault exploration. It is a projection of an already-scoped result set. Open-ended landscape browsing is out of scope for this spec; use Obsidian's native graph if that is the need.

### Entry Point

- Available from `All` and `Heading` result panes.
- Right-side icon in the result pane header (Lucide `Network` or `Waypoints`) toggles between list projection and graph projection.
- Toggle state persists within the current search session; new queries preserve the projection preference.
- Query input, Inspector, and open-document behavior are unchanged. Only the middle result-rendering swaps.

### Content Layers

Rendered bottom-up, so structure sits behind the result nodes:

1. **Community background regions.** Subtle color wash grouping nodes by `mobius_node.community_id`. Purely spatial; no interaction.
2. **Folder groupings.** Optional dashed boundary around result docs that share the same top-level folder prefix (the first path segment). First cut deliberately uses this simple rule; a follow-up spec can refine to "first differentiating folder segment" if deep vault layouts (e.g. `D-26年找工作/interviews/behavioral/*.md`) cause the top-level grouping to feel too coarse. Toggle in the view header; off by default to avoid over-decoration on a first render.
3. **Hub anchor nodes.** For every result doc that has an entry in `HubConstituentRepo`, the corresponding `hub_doc` node is pulled into the graph — even if the hub_doc itself was not part of the result set. Hub anchors render as larger nodes in a distinct color from result nodes. This is the layer that separates Result Graph View from a naked link graph: hubs are the backbone.
4. **Result document nodes.** The N result documents. Node size is uniform; node color intensity reflects the match score (heat scale). Selected node uses the same accent color as active rows in Heading mode.
5. **Structural edges.** From `mobius_edge`, render only edges whose both endpoints are inside {result docs} ∪ {hub anchors}. Edges that reach outside the projection scope are dropped.
6. **Semantic overlay.** Optional toggleable layer showing `semantic_related` edges as dashed lines. Off by default; visually noisy.

### Isolated Result Nodes

Result docs that connect to neither another result doc nor any hub anchor go into a right-side rail titled "Isolated Matches" — not scattered as floating nodes on the canvas. Rationale: floating unconnected dots make the canvas feel broken and hide the structure that *does* exist among the connected results. The isolated list is still fully selectable and openable.

### Empty / Sparse Fallback

If the result set has fewer than 3 connected pairs AND fewer than 2 shared hub anchors, the canvas renders a hint banner: "These results don't form a shared structure. Try widening the query, or stay in list view." The toggle itself remains available; do not hide the entry point, because seeing the sparse state teaches the user something about their vault.

### Node Cap

- First cut caps at 100 result nodes plus their hub anchors.
- Beyond the cap, keep the top 100 by match score and render a footer note: "Showing top 100 of N results; switch to list view for the full set."
- The cap prevents both performance issues and the "cloud of dots" failure mode for very broad queries.

### Interaction

- **Single click a result node** → select it. Inspector updates, matches list-mode row selection.
- **Double click a result node** → open the document (matches list-mode Enter behavior).
- **Single click a hub anchor** → `openLinkText` on the hub_doc, opening the hub markdown file. Same rule as §Hub Reference.
- **Cmd / Ctrl+click a hub anchor** → open hub graph subview scoped to that hub. Same rule as §Hub Reference.
- **Hover an edge** → tooltip shows edge kind: `reference`, `semantic`, or `hub_constituent`.
- **Query typing** → nodes leaving the result set fade out; new matching nodes fade in. Structure layers reflow to accommodate.
- **Esc** returns to list projection (does not close Vault Search).

### Rationale For The Structural Layers

The user's stated pain: "Obsidian native graph 看不到 hub 这些，太碎了，反而没什么价值." The three deliberate layers that answer this — community background, folder groupings, hub anchors — are precisely what a naked link graph hides. Without them, a result subgraph is only slightly better than the list. With them, the user can immediately see: this query wakes up two hubs, most matches cluster around one of them, three matches are isolated stragglers. That is the answer the list cannot give.

## Product Variants (historical exploration)

The two variants below were the initial framing that treated Heading and Graph as competing full modes. Design review superseded this framing: Heading mode and Result Graph View ship together, where Result Graph View is a projection toggle rather than a separate mode (see §Recommended Direction). The variants are kept here for tradeoff context, not as an active choice.

### Variant A: Heading-First

Best if the immediate pain is in-file navigation.

Layout:

- Modes: `All / Heading / Graph`.
- `#` opens full heading tree instantly.
- Search text filters the tree.
- Graph mode stays separate from Inspector support.

Strengths:

- Lowest cognitive jump from current UI.
- Directly replaces weak `Line` mode.
- Makes long documents easier to read and jump through.

Risks:

- Does not fully solve vault-level exploration.
- Hub/graph value remains secondary.

### Variant B: Graph Scope Walk (rejected)

An earlier draft proposed `Graph` as a full third mode with a vault-wide canvas that the user could scope-walk step by step (type query → highlight hubs → click hub to scope → refine → Esc to back out).

Reasons the direction was rejected during design review:

- The user journey was not concrete. "Browse landscape → scope → walk" sounded good but broke into three distinct tasks (orient / see result structure / walk a neighborhood) with no single triggering ritual.
- The result-set projection covers the highest-value slice of the same problem — "what structure do these matches belong to" — with a specific trigger (user already searched) and a specific payoff. See §Result Graph View.
- Full-vault landscape browsing does not clearly beat Obsidian's native graph as an entry point, so building a competing surface was hard to justify.
- Local-neighborhood walk from a doc is already covered by Obsidian's Local Graph. Duplicating it was net-negative.

Elements salvaged from Variant B and reused elsewhere:

- Hub anchor rendering → moved into §Result Graph View · Content Layers.
- Community grouping → moved into §Result Graph View · Content Layers.
- Hub graph subview as a modifier action → moved into §Hub Reference · Click Behavior.

## Supporting Inspector Composition

There should not be a third user-facing search mode.

The Inspector can still combine supporting context around the selected result:

- Connected notes.
- Discovered notes.
- AI Graph as a button or entry control, not an embedded graph visualization.
- Hub reference at the bottom.

This is composition inside the existing Inspector, not a third search mode. The primary mode vocabulary should stay small: `All / Heading`.

### Hub Reference

The Hub Reference block sits at the bottom of the Inspector, below Connected, Discovered, and the AI Graph entry. It applies across both search modes (`All / Heading`) because the Inspector itself is mode-agnostic, and it also appears when a node is selected inside Result Graph View.

#### Definition

"Hub" in this spec means a `hub_doc` node produced by the hub generation pipeline, not a raw PageRank / TextRank top-K bucket:

1. `HubCandidateDiscoveryService` scores document candidates in SQL (graph / physical authority / organizational / semantic centrality scores + `community_id` + betweenness).
2. `HubCuratorAgent` (LLM) decides which candidates deserve to be hubs and writes `hub_curation_plan`.
3. `HubMaterializationAgent` materializes each planned hub as a real markdown file under `hubSummaryFolder`, registered as a `hub_doc` graph node.
4. `HubConstituentRepo` records the many-to-many `hub_doc ↔ document` membership.

See [`docs/superpowers/specs/2026-07-03-hub-generation-agent.md`](./2026-07-03-hub-generation-agent.md) §Component 4 for the authoritative pipeline definition. Vault Search consumes the result; it does not redefine what a hub is.

#### Row Model

Each Hub Reference entry is a "hub reference row" (single-row visual affordance, not a control group):

- Row content: hub name, optional constituent count (documents in the hub), optional community label.
- Multi-hub source: if the selected document appears in multiple `hub_constituent` entries, list the top 5 hubs sorted by constituent affinity score (fallback: hub curator score). Append `+N more` when the count exceeds 5; expanding reveals the full list.
- Empty state: hide the entire Hub Reference block when the selected document has no `hub_constituent` entries. Do not render a "no hub" placeholder.

#### Click Behavior

- Default single click on a hub reference row: `openLinkText` on the hub_doc path, opening the hub markdown file in the current pane — same behavior as clicking a Connected or Discovered link. Zero new surface.
- Modifier click (Cmd / Ctrl+click) or an explicit right-side icon on the row: open the hub graph subview. "Hub graph subview" is defined as Result Graph View entered with the query auto-set to the hub's constituents (all `hub_doc ↔ document` entries in `HubConstituentRepo` for the selected hub). This reuses the Result Graph View rendering pipeline instead of introducing a new surface, and keeps a consistent visual language for anything graph-shaped inside Vault Search.
- Middle click / Cmd+Enter: open hub_doc in a new tab, mirroring standard Obsidian link behavior.

The row itself does not host multi-button control groups. The modifier / icon affordance is one additional entry point, not a competing action bar.

## Recommended Direction

Vault Search's mode set shrinks to two: `All / Heading`. Result Graph View is a projection toggle available inside both modes, not a third mode. Rollout order:

1. Delete `Folder` and `Line` modes and their legacy parsers outright.
2. Land `Heading` mode as a real outline tree with the left-tree + right-detail-pane model from §Selection And Detail Pane.
3. Preserve title-first result layout in `All` mode from the separate Inspector polish request.
4. Keep the AI Graph affordance as an Inspector entry button, not an embedded mini graph.
5. Put the hub reference at the bottom of the Inspector when available, using the model from §Hub Reference.
6. Land Result Graph View as a right-header toggle inside `All` and `Heading` result panes. First cut ships the structural layer (community background + hub anchors + result nodes + reference edges + isolated matches rail + node cap + sparse fallback). Folder groupings and semantic overlay ship as toggleable options in the same first cut. Deferred to follow-up: arrow-key graph focus, edge-reason hover tooltips beyond the basic kind label, and any form of open-ended landscape browsing (which is explicitly out of scope; see §Result Graph View · Purpose).

Rationale: Heading answers "where does this term live inside a document"; Result Graph View answers "how do these matches connect to each other". Both are anchored to concrete triggers (open a doc, run a query) with concrete payoffs. Landscape-style vault browsing without a query was cut because the user journey stayed abstract during design review — see §Product Variants (historical) · Variant B.

## Acceptance Criteria For Heading Mode

- Typing `#` immediately shows the active document's heading tree.
- The tree preserves heading hierarchy and indentation.
- Every heading row shows a meaningful line range without an `L` prefix, for example `12-34`.
- Every heading row shows match count as a compact number.
- Typing query text filters by dimming nonmatches, not by deleting the whole outline.
- The active heading row has a visible selected background.
- Moving the active row updates a right-side section detail pane.
- The right-side pane shows keyword hit snippets for the active section.
- Enter opens the selected heading or snippet in the document.
- The footer shows total matches.
- Snippets are never rendered inline under heading rows in the left tree; they appear only in the right detail pane for the active heading.
- `Line` mode and its legacy `:line` parser are removed from the codebase.
- `Folder` mode and its legacy `@folder` parser are removed from the codebase.

## Acceptance Criteria For Result Graph View

- A toggle icon appears in the result pane header of both `All` and `Heading` modes; clicking it swaps the linear result list for the graph projection and swaps back.
- The projection covers exactly the current query's result set (subject to the node cap below), not the full vault graph.
- Community background regions are rendered from `mobius_node.community_id` behind the result nodes.
- Every result document that has an entry in `HubConstituentRepo` pulls its `hub_doc` into the canvas as a distinct larger hub anchor node, even if the hub_doc itself was not part of the query result set.
- Edges rendered come from `mobius_edge` (references) and are limited to edges where either both endpoints are result docs or one endpoint is a hub anchor from the previous point. Vault edges outside this projection are not drawn.
- Semantic overlay (dashed `semantic_related` edges) is a toggleable layer, off by default.
- Folder groupings are a toggleable layer, off by default, drawing dashed boundaries around result docs sharing a top-level folder prefix.
- Result docs with no edges to other result docs and no hub anchor are rendered in a right-side "Isolated Matches" rail, not as floating nodes on the canvas.
- When the result set has fewer than 3 connected pairs and fewer than 2 shared hub anchors, a sparse-fallback hint banner is shown; the toggle itself is not hidden.
- The graph caps at 100 result nodes plus their hub anchors; larger sets show the top 100 by match score with a footer note.
- Single click a result node selects it and updates the Inspector; double click opens the document.
- Single click a hub anchor calls `openLinkText` on the hub_doc; Cmd / Ctrl+click opens the hub graph subview scoped to that hub_doc (matching §Hub Reference · Click Behavior).
- Hover an edge shows a tooltip identifying the edge as `reference`, `semantic`, or `hub_constituent`.
- Esc returns to list projection without closing Vault Search.
- Query typing updates the projection: nodes leaving the result set fade out, new matching nodes fade in.

## Acceptance Criteria For Hub Reference

- The Hub Reference block renders at the bottom of the Inspector, below Connected, Discovered, and the AI Graph entry, in both search modes (`All / Heading`) and when a node is selected inside Result Graph View.
- When the selected document has no `hub_constituent` entries, the entire Hub Reference block is hidden (no placeholder row).
- When the selected document belongs to one or more hubs, each hub renders as a single hub reference row containing the hub name and optional constituent count.
- When the selected document belongs to more than 5 hubs, the top 5 by constituent affinity are shown followed by a `+N more` expander that reveals the remainder.
- Hub identity is sourced from `HubConstituentRepo` (materialized `hub_doc` nodes), not from raw PageRank / TextRank scoring.
- Default single click on a hub reference row calls `openLinkText` on the hub_doc path, opening the hub markdown file in the current pane.
- Cmd / Ctrl+click, or an explicit affordance icon on the row, opens the hub graph subview scoped to that hub_doc.
- Middle click and Cmd+Enter open hub_doc in a new tab, matching standard Obsidian link behavior.
- The row does not host a multi-button control group; only the primary click target and the single modifier / icon affordance exist.

## Open Questions

None outstanding. See Resolved below.

## Resolved During Design Review

All resolutions dated 2026-07-07.

- **Folder / Line removal scope.** Both modes and their legacy `@folder` / `:line` parsers are deleted outright. No hidden compatibility path. See §User Intent.
- **Heading mode snippet placement.** Snippets do not render inline under matching heading rows. The left tree stays a stable document map; the right detail pane owns snippet rendering for the currently active heading only. See §Filtered State and §Selection And Detail Pane.
- **Available rank signals.** Reference PageRank, Semantic PageRank, PPR (query-time), TextRank (doc-level keywords + sentences), hub candidate scores, community id, and betweenness centrality are persisted today. Per-heading / per-section salience and per-chunk score are not first-class columns and must be derived if needed. See §Ranking Signals.
- **Graph mode surface framing (superseded).** An earlier resolution kept Graph as a sibling mode of `All` and `Heading`. During a second review the standalone Graph mode was dropped: its landscape-browse / scope-walk journey stayed too abstract to justify a new surface. Replacement is Result Graph View, a projection toggle on top of `All` / `Heading` result panes that answers the specific "how do these matches connect" question with a concrete trigger. See §Result Graph View and §Product Variants (historical) · Variant B.
- **Hub Reference click destination.** Default click opens the hub_doc markdown via `openLinkText`; modifier click or explicit icon opens the hub graph subview scoped to that hub_doc. See §Hub Reference · Click Behavior.

## Concept Board

![Vault Search Heading and Graph Navigation Concept](../../gstack/vault-search-navigation-2026-07-07/concept-board-v4.png)
