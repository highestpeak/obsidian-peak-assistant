# Vault Lint / Health Check — Technical Design Spec

> Date: 2026-05-01
> Status: Draft (v2 — comprehensive rewrite)
> Priority: ★★★★★ (Karpathy-validated, competitive whitespace = complete)

---

## 1. Problem Statement

### The "Knowledge Rot" Problem

Knowledge vaults rot silently. Not because users stop writing — because they stop maintaining. Orphan notes accumulate, links break after renames, critical hub nodes go stale, entire topic clusters lose coherence, and the vault's graph structure degrades into a disconnected archipelago. The user never notices until they search for something and realize half their knowledge is unreachable.

<!-- 核心洞察：Obsidian graph view 是用户采用的原因，也是用户失望的原因。
"Your vault feels like a graveyard of completely orphaned images and notes." — Medium, 2025-11
"The graph view turns out to be nothing but a bunch of dots... you can't actually do anything with it." — Obsidian Forum -->

> "Eventually, you're not thinking — you're maintaining." — Reddit/Medium, recurring theme across 2025-2026 user studies

### Karpathy's Lint Operation

Karpathy's LLM Wiki (2026-04-04, GitHub Gist, HN 296 points / 95 comments, 30+ forks, 10+ derivative implementations) defines three core operations for knowledge systems: **Ingest**, **Query**, and **Lint**.

Lint is the periodic health check that finds:
- **Contradictions** — two pages describing the same fact in conflicting ways
- **Orphan pages** — no inbound links, unreachable from the rest of the knowledge graph
- **Missing cross-references** — content that should be linked but isn't
- **Topical gaps** — areas the knowledge base should cover but doesn't

This is the code-linting paradigm applied to knowledge management: catch structural and semantic problems before they compound.

### Competitive Whitespace

| Competitor | Vault Health Check | Gap |
|---|---|---|
| Smart Connections | None | ★★★★★ |
| Copilot for Obsidian | None | ★★★★★ |
| Mem.ai | None | ★★★★★ |
| Khoj | None | ★★★★★ |
| InfraNodus | Gap analysis only (cloud, €19/month, requires data upload) | ★★★★ |
| graph-analysis plugin | Abandoned 4+ years, 28 open issues | ★★★★★ |

Peak is the first to offer comprehensive, local-first, Obsidian-native vault health analysis. The backend infrastructure is already built: hub discovery (`hubDiscover.ts`, ~2300 lines), PageRank (`pagerankMass.ts`), semantic edges (`semanticRelatedEdges.ts`), co-citation analysis (`coCitationService.ts`), unlinked mention detection (`unlinkedMentionService.ts`), and orphan detection (`find-orphans.ts`).

---

## 2. Lint Signals

A multi-signal health detection model organized into five dimensions. Each dimension contains multiple **signals** — atomic, measurable conditions that indicate a specific problem.

### 2.1 Structural Signals

Detect issues in the vault's link topology — the wiring of the knowledge graph.

| Signal ID | Name | Detection Method | Severity | Data Source |
|-----------|------|-----------------|----------|-------------|
| `S-ORPHAN` | Hard Orphan Notes | Zero in-degree AND zero out-degree | warning | `MobiusEdgeRepo.getHardOrphans()` — already implemented in `find-orphans.ts:15` |
| `S-SOFT-ORPHAN` | Soft Orphan Notes | in-degree + out-degree ≤ 2, AND all neighbors are also soft/hard orphans (orphan island) | info | `mobius_edge` degree query + neighbor traversal |
| `S-BROKEN-LINK` | Broken Wikilinks | `[[target]]` in markdown body where target file does not exist in vault | error | Obsidian `metadataCache.unresolvedLinks` |
| `S-MISSING-BACKLINK` | Missing Reciprocal Links | A references B via wikilink, B's content mentions A's concepts, but B does not link back. Detected via co-citation (shared_citer_count ≥ 2) + semantic similarity > 0.7 | info | `coCitationService.buildCoCitationQuery()` + `SemanticRelatedEdgesReadService` |
| `S-ISLAND-CLUSTER` | Disconnected Cluster | Connected component with ≤ 5 nodes and no edges to the main component | warning | BFS/DFS on `mobius_edge` reference graph |
| `S-FRAGILE-BRIDGE` | Fragile Bridge Notes | Note whose removal increases the number of connected components — an articulation point in the reference graph | info | Tarjan's articulation point algorithm on `mobius_edge` |

<!-- S-ORPHAN 已有完整实现（find-orphans.ts），包括语义复活建议 findRevivalSuggestions()。
S-BROKEN-LINK 可直接使用 Obsidian API metadataCache.unresolvedLinks。
S-SOFT-ORPHAN 需要扩展 getHardOrphans 增加 soft 检测逻辑。
S-FRAGILE-BRIDGE 对应 hubDiscover.ts 的 bridge 角色检测，但需要精确的 Tarjan 算法。 -->

### 2.2 Content Signals

Detect issues in the body of individual notes — completeness, quality, and redundancy.

| Signal ID | Name | Detection Method | Severity | Data Source |
|-----------|------|-----------------|----------|-------------|
| `C-EMPTY` | Empty Files | File size = 0 or body is only frontmatter with no prose content | warning | `vault.read()` + frontmatter strip |
| `C-STUB` | Stub Notes | Body length < 100 characters after stripping frontmatter, headings, and whitespace | info | `doc_chunk` content aggregation or `vault.read()` |
| `C-OVERSIZED` | Oversized Documents | Word count > configurable threshold (default: 5000 words) — should be split | warning | Word count from indexed content |
| `C-DUPLICATE` | Near-Duplicate Content | Two documents with doc-center vector similarity > 0.92 AND title similarity (Jaccard) > 0.5 | warning | `EmbeddingRepo.searchSimilarAndGetId()` reusing existing KNN infrastructure |
| `C-FRONTMATTER-MISSING` | Missing Frontmatter | Markdown file with no YAML frontmatter block | info | Obsidian `metadataCache.getFileCache()` |
| `C-NAMING-VIOLATION` | Naming Convention Violations | `index.md`, `mess.md` files without folder-context prefix — indistinguishable in graph view | info | Regex on file paths |

<!-- C-DUPLICATE 利用已有的 semantic_related edge 基础设施。
C-NAMING-VIOLATION 出自 H-Lint检测.md：index 和 mess 文件必须包含 folder name，否则 graph view 中多个同名节点无法区分。 -->

### 2.3 Temporal Signals

Detect time-based decay — notes that are structurally important but chronologically neglected.

| Signal ID | Name | Detection Method | Severity | Data Source |
|-----------|------|-----------------|----------|-------------|
| `T-STALE-HUB` | Stale Hub Notes | PageRank ≥ 75th percentile AND last modified > 180 days ago | warning | `mobius_node.pagerank` + `mobius_node.modified` via `loadDocPageranks()` |
| `T-DECAYING-BRIDGE` | Decaying Bridge Notes | Articulation-point note (S-FRAGILE-BRIDGE) AND last modified > 365 days | error | Tarjan result + `modified` timestamp |
| `T-ABANDONED-CLUSTER` | Abandoned Topic Cluster | Hub cluster where ALL member notes have `modified` > 180 days — the entire topic has gone cold | warning | Hub discovery cluster membership + `modified` |
| `T-RECENT-DRIFT` | Recent Drift | Note edited in last 30 days, but all its outgoing link targets are stale (>180 days) — user is actively working in a stale neighborhood | info | `mobius_edge` outgoing targets + `modified` |
| `T-ABANDONED-FOLDER` | Abandoned Folders | Folder subtrees where all files have `mtime` > 365 days | info | Aggregate `mtime` per folder prefix |

<!-- T-STALE-HUB 是 Karpathy Lint 最直接的映射：高 PageRank 表示很多笔记依赖它的准确性，但长期不更新意味着信息可能已过时。差异化分析 §9.3 的 "decaying notes" 即此信号。 -->

### 2.4 Semantic Signals

Detect higher-order knowledge structure problems — gaps, contradictions, and incoherence.

| Signal ID | Name | Detection Method | Severity | Data Source |
|-----------|------|-----------------|----------|-------------|
| `M-COVERAGE-GAP` | Topic Coverage Gap | Folders/prefixes with many documents but no hub covering them | warning | `HubDiscoverRoundSummary.topUncoveredFolders` — `HubDiscoverCoverageGap` type, already computed in `hubDiscover.ts:1624` |
| `M-LOW-COHESION` | Low-Cohesion Cluster | Hub cluster with intra-cluster semantic density < 0.3 — members are loosely related | info | `computeIntraClusterSemanticDensity()` from `clusterHubSignals.ts` |
| `M-CONTRADICTION` | Potential Contradiction | Two notes with high semantic similarity (>0.8) but opposing stance on the same entity. Detected by LLM analysis in background batch | warning | LLM call (batch, background, expensive) |
| `M-PHANTOM-NODE` | Missing Concept (Phantom Node) | A concept referenced by 3+ notes via wikilinks or mentions but no dedicated note exists for it — a "hole" in the knowledge graph | info | Obsidian `metadataCache.unresolvedLinks` frequency analysis |
| `M-SEMANTIC-ISOLATION` | Semantic Isolation | Notes with zero `semantic_related` edges — no semantic neighbors at all | info | `SemanticRelatedEdgesReadService.loadGraphSemanticLinkItems()` returning empty |
| `M-REDUNDANT-HUBS` | Redundant Hub Overlap | Two hub candidates with coverage overlap ratio > 0.7 | info | `HubDiscoverRoundSummary.topOverlapPairs` — already computed |

<!-- M-COVERAGE-GAP 直接复用 HubDiscoverCoverageGap（types.ts:410-414）。
M-CONTRADICTION 是唯一需要 LLM 调用的核心信号，应在后台批量处理。
M-PHANTOM-NODE 对应差异化分析中的"幻肢检测"（§5.14）——pattern in the knowledge graph where 3+ notes reference a concept that has no dedicated note. -->

### 2.5 Tag Signals

Detect issues in the tagging taxonomy — the user's explicit classification system.

| Signal ID | Name | Detection Method | Severity | Data Source |
|-----------|------|-----------------|----------|-------------|
| `G-UNTAGGED` | Untagged Notes | Notes with zero tags (no frontmatter tags AND no inline hashtags) | info | `indexed_document.tags` (empty/null check) |
| `G-TAG-ISLAND` | Tag Islands | Tags used by only 1 note — singleton tags that provide no aggregation value | info | `aggregateTagDocFrequencies()` from `folderHubTopicPurity.ts` |
| `G-TAG-REDUNDANCY` | Redundant Tags | Two tags whose document sets overlap by >80% Jaccard similarity — likely synonyms (e.g., `#ml` vs `#machine-learning`) | info | Tag co-occurrence analysis on `indexed_document.tags` |
| `G-TAG-EXPLOSION` | Tag Explosion | Total distinct tag count exceeds `5 × ∛(document_count)` — too many tags relative to vault size | warning | Tag count vs document count heuristic |
| `G-NOISE-TAGS` | Noise Tags | Tags already ranked low by `tagDisplayRank.ts` scoring (high frequency but low information content) | info | Reuse `tagDisplayRank` scoring |

<!-- G-TAG-ISLAND 和 G-TAG-REDUNDANCY 帮助用户清理标签体系。大多数 PKM 用户的标签系统在 200+ 标签时就开始失控。
G-TAG-EXPLOSION 使用 cube root 而不是 sqrt 因为标签增长通常慢于文档增长。 -->

---

## 3. Health Score Model

### 3.1 Composite Score: 0–100

The vault health score is a weighted sum of five dimension scores, each also 0–100.

```
HealthScore = w_S × DimScore_structural
            + w_C × DimScore_content
            + w_T × DimScore_temporal
            + w_M × DimScore_semantic
            + w_G × DimScore_tags
```

### 3.2 Dimension Weights

| Dimension | Weight | Rationale |
|-----------|--------|-----------|
| Structural (`w_S`) | 0.30 | Link topology is the backbone of a knowledge graph — orphans, broken links, disconnected clusters directly degrade retrievability |
| Content (`w_C`) | 0.20 | Content quality matters but is partly subjective; empty/stub/duplicate detection is high-signal |
| Temporal (`w_T`) | 0.15 | Staleness is a silent killer; weighted lower because some notes are intentionally archival |
| Semantic (`w_M`) | 0.25 | Coverage gaps and incoherence are the hardest problems for users to detect manually |
| Tags (`w_G`) | 0.10 | Tags are optional; many healthy vaults use minimal tagging |

### 3.3 Per-Dimension Score Calculation

Each dimension score starts at 100 and is penalized by the weighted ratio of affected notes:

```typescript
function dimensionScore(signals: LintSignal[], totalNotes: number): number {
  let penalty = 0;
  for (const signal of signals) {
    const affectedRatio = signal.affectedCount / totalNotes;
    const severityMultiplier = {
      error: 3.0,    // errors penalize 3x
      warning: 1.5,  // warnings penalize 1.5x
      info: 0.5      // info items penalize 0.5x
    }[signal.severity];
    penalty += affectedRatio * severityMultiplier * signal.signalWeight;
  }
  return Math.max(0, Math.round(100 * (1 - Math.min(1, penalty))));
}
```

### 3.4 Signal Weights Within Each Dimension

Normalized so they sum to ~1.0 within each dimension. Controls relative importance of signals within the same dimension.

| Dimension | Signal | Weight |
|-----------|--------|--------|
| Structural | `S-ORPHAN` | 0.30 |
| Structural | `S-BROKEN-LINK` | 0.25 |
| Structural | `S-ISLAND-CLUSTER` | 0.20 |
| Structural | `S-FRAGILE-BRIDGE` | 0.10 |
| Structural | `S-SOFT-ORPHAN` | 0.10 |
| Structural | `S-MISSING-BACKLINK` | 0.05 |
| Content | `C-EMPTY` | 0.30 |
| Content | `C-DUPLICATE` | 0.25 |
| Content | `C-OVERSIZED` | 0.20 |
| Content | `C-STUB` | 0.10 |
| Content | `C-FRONTMATTER-MISSING` | 0.05 |
| Content | `C-NAMING-VIOLATION` | 0.10 |
| Temporal | `T-STALE-HUB` | 0.35 |
| Temporal | `T-DECAYING-BRIDGE` | 0.30 |
| Temporal | `T-ABANDONED-CLUSTER` | 0.20 |
| Temporal | `T-RECENT-DRIFT` | 0.10 |
| Temporal | `T-ABANDONED-FOLDER` | 0.05 |
| Semantic | `M-COVERAGE-GAP` | 0.30 |
| Semantic | `M-LOW-COHESION` | 0.20 |
| Semantic | `M-CONTRADICTION` | 0.20 |
| Semantic | `M-PHANTOM-NODE` | 0.15 |
| Semantic | `M-SEMANTIC-ISOLATION` | 0.10 |
| Semantic | `M-REDUNDANT-HUBS` | 0.05 |
| Tags | `G-UNTAGGED` | 0.25 |
| Tags | `G-TAG-ISLAND` | 0.25 |
| Tags | `G-TAG-REDUNDANCY` | 0.20 |
| Tags | `G-TAG-EXPLOSION` | 0.20 |
| Tags | `G-NOISE-TAGS` | 0.10 |

### 3.5 Score Interpretation

| Range | Label | Color | Meaning |
|-------|-------|-------|---------|
| 90–100 | Excellent | Green | Vault is well-maintained with minimal issues |
| 70–89 | Good | Blue | Some minor issues; routine maintenance recommended |
| 50–69 | Needs Attention | Amber | Notable structural/content problems accumulating |
| 0–49 | Critical | Red | Vault health is severely degraded; major intervention needed |

### 3.6 Trend Tracking

Health scores are persisted per scan. The dashboard shows a sparkline trend over the last 30 scans, allowing users to see whether their vault health is improving or deteriorating.

<!-- 权重是初始默认值，通过 templates/config/vault-lint-config.json 覆盖（per CLAUDE.md configurability rule）。
用户在 Settings 中可调整维度权重但不能调信号权重（防止过度复杂化 UI）。 -->

---

## 4. Vault X-Ray Dashboard UI

The primary UI surface. Designed per the Vault X-Ray concept in the differentiation analysis (§9.3).

<!-- 参考差异化分析 §9.3 的完整 UI 设计。UI 使用 React 18 + Tailwind + Radix primitives（项目约定）。图可视化复用 @xyflow/react。Lucide icons only，no emoji（per CLAUDE.md）。 -->

### 4.1 Entry Points

| Entry | Mechanism |
|-------|-----------|
| Command | `Peak: Vault X-Ray` — opens dashboard in a new Obsidian leaf (tab) |
| Ribbon icon | Health score badge in the left sidebar ribbon, colored by score range |
| Status bar | Compact `72/100` score in the bottom status bar, click to open dashboard |
| Settings | Link from Settings > General to open Vault X-Ray |

### 4.2 Dashboard Layout

The Vault X-Ray is a **standalone Obsidian leaf view** (like the chat view), not a modal.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Vault X-Ray                                    [Scan Now] [History] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────┐  ┌─────────────────────────────────────┐  │
│  │                      │  │  Trend (last 30 scans)              │  │
│  │      72 / 100        │  │  ┌─────────────────────────────┐    │  │
│  │       GOOD           │  │  │  ╱╲  ╱╲                     │    │  │
│  │                      │  │  │ ╱  ╲╱  ╲___╱╲               │    │  │
│  │   Last scan: 2h ago  │  │  └─────────────────────────────┘    │  │
│  │      +3 since 7d     │  │  Apr 15    Apr 22    Apr 29         │  │
│  └──────────────────────┘  └─────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Dimension Scores ───────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Structural  ████████░░  78    Content   ██████████  95       │   │
│  │  Temporal    ██████░░░░  58    Semantic  ████████░░  82       │   │
│  │  Tags        ████░░░░░░  42                                   │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ Priority Actions ──────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  [!] 12 broken wikilinks                         [Fix]      │    │
│  │  [!] 2 decaying bridge notes                     [Review]   │    │
│  │  [~] 47 orphan notes — no links in or out        [Suggest]  │    │
│  │  [~] 8 stale hub notes (high PR, >6mo old)       [Review]   │    │
│  │  [~] 5 near-duplicate pairs                      [Merge]    │    │
│  │  [~] 3 coverage gaps in uncovered folders        [Explore]  │    │
│  │  [ ] 23 unlinked mentions                        [Link]     │    │
│  │  [ ] 15 singleton tags (used on 1 note)          [Clean]    │    │
│  │                                                              │    │
│  │  ─── Info (22 more) ─── [Show all]                          │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─ Structural Map ────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  [Community Map]  [Orphan Islands]  [Bridge Notes]           │    │
│  │                                                              │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │              (React Flow graph visualization)       │    │    │
│  │  │                                                     │    │    │
│  │  │    Cluster A (42)        Cluster B (28)            │    │    │
│  │  │       ●───●                  ●──●                  │    │    │
│  │  │      / \   \                / \                    │    │    │
│  │  │     ●   ●   ●             ●   ●                   │    │    │
│  │  │              ╲               ╱                     │    │    │
│  │  │               ╲─ bridge ──╱                        │    │    │
│  │  │                                                     │    │    │
│  │  │    Orphan Island (5)       Cluster C (15)          │    │    │
│  │  │       ○  ○  ○                 ●──●──●              │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Component Breakdown

#### A. Score Ring

- Circular progress ring (0-100), colored by health range (green/blue/amber/red)
- Label text beneath: "EXCELLENT" / "GOOD" / "NEEDS ATTENTION" / "CRITICAL"
- Subtitle 1: "Last scan: {relative time}"
- Subtitle 2: "{+/-delta} since {N days}" — trend since the scan before last

#### B. Trend Sparkline

- SVG sparkline showing score history over last 30 full scans
- X-axis: dates. Y-axis: 0-100 (implicit, no labels)
- Hover tooltip: exact score + date
- Click to open full history view with per-dimension breakdown

#### C. Dimension Score Cards

- Five horizontal progress bars with numeric score, colored by that dimension's health range
- Click a dimension to expand its signal breakdown inline below the card
- Expanded view: list of signals within the dimension, each showing affected count + severity icon

#### D. Priority Actions List

- **Sorted by**: severity (error first, then warning, then info), within same severity by affected count descending
- Each row: severity icon (Lucide: `AlertCircle` for error, `AlertTriangle` for warning, `Info` for info) + description text + affected count + action button
- Action buttons are contextual per signal type (see §5 Fix Actions)
- "Info" tier collapsed by default with count badge + "Show all" toggle
- Clicking a row expands an inline detail panel below it

#### E. Structural Map

Three tab views using the existing `@xyflow/react` graph infrastructure from `MultiLensGraph.tsx`:

1. **Community Map**: Hub clusters visualized as colored node groups, sized by member count. Hub nodes enlarged. Inter-cluster edges shown. Data source: hub discovery cluster data from `hubDiscover.ts`
2. **Orphan Islands**: Hard orphan nodes + small disconnected components, visually separated from the main graph body. Each orphan shows a dotted line to its best semantic neighbor (revival suggestion)
3. **Bridge Notes**: Highlights articulation points with a distinct color/border. Shows "fragility score" — the number of notes that would become disconnected if the bridge were removed

### 4.4 Drill-Down Detail Panels

Clicking any action row in the Priority Actions list expands an inline detail panel (reuse the inspector side panel pattern from Vault Search):

| Signal | Detail Panel Contents |
|--------|----------------------|
| `S-ORPHAN` | Note title + excerpt, top 3 semantic neighbors with similarity scores, "Add link to X" / "Delete" / "Dismiss" buttons |
| `S-BROKEN-LINK` | Source note path, broken target text, top 3 fuzzy-matched existing notes, "Redirect to X" / "Create Note" / "Remove Link" buttons |
| `S-MISSING-BACKLINK` | Source + target note paths, context snippet showing the mention, "Add [[link]]" button |
| `T-STALE-HUB` | Hub note info (PageRank, role, last modified, inbound count), list of dependent notes, "Open" / "Mark Current" / "Snooze" buttons |
| `M-COVERAGE-GAP` | Folder path, uncovered note count, 5 example note paths, "Create Hub" button (delegates to `HubDocService`) |
| `C-DUPLICATE` | Side-by-side card view of both notes (title, excerpt, similarity score), "Merge" / "Link" / "Dismiss" buttons |
| `G-TAG-ISLAND` | The singleton tag, the one note using it, related tags by edit distance, "Merge into X" / "Keep" / "Remove" buttons |

### 4.5 Design Constraints (Academic Red Lines)

1. **Suggestion mode, never silent execution** — all fix actions require explicit user confirmation (Generation Effect: Slamecka & Graf 1978, 20-40% better retention with active participation)
2. **Glanceable** — the score card must be readable within 2 seconds without scrolling (Mankoff et al. CHI 2003 ambient display heuristics)
3. **No modal interruptions** — lint results appear in a persistent view, not pop-ups (Technology Overload: Karr-Wisniewski & Lu 2010)
4. **AI-suggested vs. user-created clearly distinguished** — AI suggestions carry a distinct visual marker, e.g., a small badge or different background tint (Clark 2025, Nature Communications: users must maintain cognitive agency)

---

## 5. Fix Actions

Each lint signal maps to specific fix actions. Actions are categorized as:
- **Auto** — one-click with confirmation dialog, deterministic outcome
- **Semi-Auto** — AI suggests options, user picks one
- **Manual** — navigates to the file for user editing

### 5.1 Structural Fixes

| Signal | Action | Type | Implementation |
|--------|--------|------|---------------|
| `S-ORPHAN` | Suggest links | semi-auto | Reuse `findRevivalSuggestions()` from `find-orphans.ts:64` — shows top 3 semantically similar non-orphan notes. User clicks to insert `[[wikilink]]` |
| `S-ORPHAN` | Delete note | auto | `vault.trash()` with confirmation dialog |
| `S-BROKEN-LINK` | Redirect link | auto | Fuzzy-match renamed files by edit distance, offer top match. Replace `[[broken-target]]` → `[[correct-target]]` via `vault.modify()` |
| `S-BROKEN-LINK` | Create note | auto | Create empty note at the expected path with `vault.create()` |
| `S-BROKEN-LINK` | Remove link | auto | Replace `[[broken-target]]` → `broken-target` (plain text) via `vault.modify()` |
| `S-MISSING-BACKLINK` | Insert backlink | auto | Append `[[source-note]]` at the end of the target note (or in a "Related" section if one exists). Confirmation dialog |
| `S-ISLAND-CLUSTER` | Bridge to main graph | semi-auto | Find semantically closest note in the main component, suggest creating a link from the island |
| `S-FRAGILE-BRIDGE` | Strengthen connections | semi-auto | Suggest 2-3 alternative paths between the communities the bridge connects |

### 5.2 Content Fixes

| Signal | Action | Type | Implementation |
|--------|--------|------|---------------|
| `C-EMPTY` | Delete | auto | `vault.trash()` with confirmation |
| `C-EMPTY` | Draft content | semi-auto | LLM generates a stub based on filename + folder context |
| `C-STUB` | Expand note | manual | Open note in editor; optionally show an AI prompt pre-filled: "Expand this note" |
| `C-OVERSIZED` | Suggest split | semi-auto | Reuse existing `SplitPanel` from Copilot Document Intelligence (`copilot-commands.ts` split command) |
| `C-DUPLICATE` | Merge notes | semi-auto | Side-by-side diff; LLM can suggest merged version; user picks which to keep |
| `C-DUPLICATE` | Link as alias | auto | Insert `[[duplicate]]` link from one to the other to make the relationship explicit |
| `C-FRONTMATTER-MISSING` | Add frontmatter | auto | Insert empty `---\n---\n` block, or LLM-suggested frontmatter based on content |
| `C-NAMING-VIOLATION` | Rename with folder prefix | auto | Offer rename: `index.md` → `FolderName - Index.md` via Obsidian file rename API |

### 5.3 Temporal Fixes

| Signal | Action | Type | Implementation |
|--------|--------|------|---------------|
| `T-STALE-HUB` | Review & update | manual | Open note in editor with a sidebar showing what has changed in linked notes since last edit |
| `T-STALE-HUB` | Mark as current | auto | Touch `modified` timestamp (re-save without content change) to reset staleness clock |
| `T-STALE-HUB` | Snooze (30/90/365 days) | auto | Add to `vault_lint_dismissal` with `snooze_until` timestamp |
| `T-DECAYING-BRIDGE` | Priority review | manual | Same as T-STALE-HUB but flagged with higher urgency UI treatment |
| `T-ABANDONED-CLUSTER` | Archive cluster | semi-auto | Move all member notes to an `Archive/` folder |
| `T-RECENT-DRIFT` | Update neighborhood | manual | Open the note with a checklist of its stale outgoing link targets |

### 5.4 Semantic Fixes

| Signal | Action | Type | Implementation |
|--------|--------|------|---------------|
| `M-COVERAGE-GAP` | Create hub note | semi-auto | Generate a new hub summary for the uncovered folder using `HubDocService.createHubDoc()` |
| `M-LOW-COHESION` | Review cluster | manual | Open the cluster's hub note with member list, highlight members with lowest affinity scores |
| `M-CONTRADICTION` | Reconcile | manual | Open both notes side-by-side with the contradicting passages highlighted by LLM |
| `M-PHANTOM-NODE` | Create missing note | semi-auto | Create a new note for the phantom concept, pre-populated with LLM-drafted content synthesized from referencing notes |

### 5.5 Tag Fixes

| Signal | Action | Type | Implementation |
|--------|--------|------|---------------|
| `G-UNTAGGED` | Suggest tags | semi-auto | LLM-suggested tags based on content + neighbor tags (existing `includeLlmTags` pathway in `indexDocument`) |
| `G-TAG-ISLAND` | Merge or delete | semi-auto | Show the singleton tag's note, suggest merging into a semantically related tag or removing it |
| `G-TAG-REDUNDANCY` | Merge tags | auto | Rename all instances of tag B to tag A across all affected files via `vault.modify()`. Confirmation dialog with preview |
| `G-TAG-EXPLOSION` | Review taxonomy | manual | Show tag frequency histogram in the detail panel, highlight tags with <3 uses |

### 5.6 Batch Operations

For signals with high counts (e.g., 47 orphans), the detail panel supports batch mode:
- Checkbox selection: select all / select none / invert
- "Apply fix to selected" button with batch progress indicator
- Each batch fix is atomic per-file (if one fails, others continue)
- Undo support: store pre-fix file content for session-scoped rollback

<!-- 所有 auto fix 都需要确认对话框。Semi-auto fix 展示 AI 建议后用户 Accept/Reject。这是不可妥协的设计红线（Generation Effect）。 -->

---

## 6. Incremental vs Full Scan

### 6.1 Full Scan

Runs all signal detectors across the entire vault. Triggered by:
- User clicks "Scan Now" button in the X-Ray dashboard
- Manual command: `Peak: Run Vault Health Check`
- First run after plugin install
- Scheduled weekly scan (if Obsidian is open)

**Performance budget**: For a 5K-note vault:
- Non-LLM signals: < 10 seconds (pure SQLite queries + graph algorithms)
- LLM signals (M-CONTRADICTION only): batched in background, < 5 minutes total
- Core health score is available immediately; M-CONTRADICTION updates asynchronously

**Execution strategy**: Each signal detector is an independent async task. Non-LLM detectors run in parallel. The health score is computed progressively — display partial results as each detector completes.

### 6.2 Incremental Scan

Triggered by Obsidian vault events, debounced to batch rapid file changes:

| Event | Debounce | Signals to Re-evaluate |
|-------|----------|----------------------|
| File modified | 30s | `C-EMPTY`, `C-STUB`, `C-OVERSIZED`, `S-BROKEN-LINK` (in this file), `T-*` (timestamp reset), `G-UNTAGGED` |
| File created | 30s | `S-ORPHAN` (new file starts as orphan), `C-EMPTY`, `C-STUB`, `C-FRONTMATTER-MISSING`, `G-UNTAGGED` |
| File deleted | 30s | `S-BROKEN-LINK` (links TO this file), `S-ORPHAN` (neighbors may become orphans), `S-FRAGILE-BRIDGE` (bridge removal) |
| File renamed | 30s | `S-BROKEN-LINK` (links to old name), `C-NAMING-VIOLATION` |
| Index rebuilt | — | All semantic signals (`M-*`), all structural signals (`S-*`) — full scan |

**What incremental does NOT re-run**: `M-CONTRADICTION` (too expensive for real-time), `M-COVERAGE-GAP` and `M-LOW-COHESION` (require hub discovery data, only updated on full index rebuild).

### 6.3 Incremental Strategy

```
On vault event (modify/create/delete/rename):
  1. Buffer events for 30 seconds (debounce timer resets on each new event)
  2. When timer fires, collect unique affected file paths
  3. Identify affected note IDs: changed files + their 1-hop neighbors in the reference graph
  4. Re-run only the relevant signal detectors for those file paths
  5. Merge results into the existing scan: update affected findings, preserve unaffected ones
  6. Recompute composite health score from updated per-signal counts
  7. If X-Ray view is open, update UI reactively via Zustand store
  8. If score changed by ≥3 points, show a subtle Notice
```

### 6.4 Background Scan on Plugin Load

```
On plugin load (after SQLite and index are initialized):
  1. Read last_full_scan_timestamp from vault_lint_scan table
  2. If no prior scan OR last scan > 24 hours ago:
     → Schedule deferred full scan (10 seconds after startup, non-blocking)
  3. If last scan < 24 hours ago:
     → Run incremental scan covering files with mtime > last_scan_timestamp
  4. Update status bar badge with the (new or existing) health score
```

### 6.5 Scheduled Full Scan

Optional, configurable via `vault-lint-config.json`:
- Default: weekly (fires at next plugin load after 7 days since last full scan)
- Uses existing `BackgroundSessionManager` infrastructure for non-blocking execution
- Posts a Notice when complete: "Vault Health: 72/100 (+3 since last week)"

---

## 7. Data Model

### 7.1 SQLite Tables (vault.sqlite)

```sql
-- Scan run metadata (one row per scan)
CREATE TABLE IF NOT EXISTS vault_lint_scan (
  id             TEXT PRIMARY KEY,              -- UUID
  scan_type      TEXT NOT NULL,                 -- 'full' | 'incremental'
  started_at     INTEGER NOT NULL,              -- epoch ms
  completed_at   INTEGER,                       -- epoch ms (null if in-progress)
  duration_ms    INTEGER,
  total_notes    INTEGER NOT NULL,
  health_score   INTEGER,                       -- 0-100 (null if in-progress)
  dim_structural INTEGER,                       -- 0-100
  dim_content    INTEGER,
  dim_temporal   INTEGER,
  dim_semantic   INTEGER,
  dim_tags       INTEGER,
  signal_counts  TEXT NOT NULL DEFAULT '{}',     -- JSON: { "S-ORPHAN": 47, "S-BROKEN-LINK": 12, ... }
  config_hash    TEXT                            -- SHA256 of weight config (for cross-scan comparability)
);

-- Individual findings (one row per affected-file per signal)
CREATE TABLE IF NOT EXISTS vault_lint_finding (
  id           TEXT PRIMARY KEY,                 -- deterministic: SHA256(scan_id + signal_id + file_path)
  scan_id      TEXT NOT NULL REFERENCES vault_lint_scan(id),
  signal_id    TEXT NOT NULL,                    -- e.g. 'S-ORPHAN', 'T-STALE-HUB'
  severity     TEXT NOT NULL,                    -- 'error' | 'warning' | 'info'
  file_path    TEXT,                             -- affected file (null for vault-level signals like G-TAG-EXPLOSION)
  title        TEXT NOT NULL,                    -- human-readable finding title
  description  TEXT,                             -- detailed explanation
  fix_actions  TEXT NOT NULL DEFAULT '[]',       -- JSON array of available FixActionId strings
  metadata     TEXT NOT NULL DEFAULT '{}',       -- signal-specific data (similarity score, target path, etc.)
  status       TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'dismissed' | 'fixed'
  dismissed_at INTEGER,
  fixed_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_lint_finding_scan ON vault_lint_finding(scan_id);
CREATE INDEX IF NOT EXISTS idx_lint_finding_signal ON vault_lint_finding(signal_id);
CREATE INDEX IF NOT EXISTS idx_lint_finding_status ON vault_lint_finding(status);
CREATE INDEX IF NOT EXISTS idx_lint_finding_path ON vault_lint_finding(file_path);

-- User dismissals (persisted across scans so resolved items don't reappear)
CREATE TABLE IF NOT EXISTS vault_lint_dismissal (
  signal_id    TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL,
  reason       TEXT,                             -- 'false_positive' | 'wont_fix' | 'snoozed'
  snooze_until INTEGER,                          -- epoch ms (nullable; for snoozed items)
  PRIMARY KEY (signal_id, file_path)
);
```

### 7.2 TypeScript Types

```typescript
// --- Signal system ---

type LintSeverity = 'error' | 'warning' | 'info';
type LintDimension = 'structural' | 'content' | 'temporal' | 'semantic' | 'tags';

type LintSignalId =
  // Structural
  | 'S-ORPHAN' | 'S-SOFT-ORPHAN' | 'S-BROKEN-LINK' | 'S-MISSING-BACKLINK'
  | 'S-ISLAND-CLUSTER' | 'S-FRAGILE-BRIDGE'
  // Content
  | 'C-EMPTY' | 'C-STUB' | 'C-OVERSIZED' | 'C-DUPLICATE'
  | 'C-FRONTMATTER-MISSING' | 'C-NAMING-VIOLATION'
  // Temporal
  | 'T-STALE-HUB' | 'T-DECAYING-BRIDGE' | 'T-ABANDONED-CLUSTER'
  | 'T-RECENT-DRIFT' | 'T-ABANDONED-FOLDER'
  // Semantic
  | 'M-COVERAGE-GAP' | 'M-LOW-COHESION' | 'M-CONTRADICTION'
  | 'M-PHANTOM-NODE' | 'M-SEMANTIC-ISOLATION' | 'M-REDUNDANT-HUBS'
  // Tags
  | 'G-UNTAGGED' | 'G-TAG-ISLAND' | 'G-TAG-REDUNDANCY'
  | 'G-TAG-EXPLOSION' | 'G-NOISE-TAGS';

/** Signal detector: a pure function that scans the vault and returns findings. */
interface LintSignalDetector {
  id: LintSignalId;
  dimension: LintDimension;
  severity: LintSeverity;
  signalWeight: number;           // weight within dimension (0-1)
  requiresLlm: boolean;           // if true, runs in background batch
  /** Run the detector and return findings. */
  detect(context: LintScanContext): Promise<LintFinding[]>;
}

interface LintScanContext {
  totalNotes: number;
  allNodeIds: string[];
  lastScanTimestamp: number | null;
  dismissals: Map<string, LintDismissal>;  // key: `${signalId}:${filePath}`
}

// --- Finding ---

interface LintFinding {
  id: string;                     // deterministic hash
  signalId: LintSignalId;
  severity: LintSeverity;
  filePath: string | null;
  title: string;
  description: string;
  fixActions: FixActionId[];
  metadata: Record<string, unknown>;
  status: 'open' | 'dismissed' | 'fixed';
}

// --- Signal-specific metadata types ---

interface OrphanMetadata {
  orphanType: 'hard' | 'soft';
  edgeCount: number;
  revivalSuggestion?: {
    targetPath: string;
    targetTitle: string;
    similarity: number;
    reason: string;
  };
}

interface BrokenLinkMetadata {
  sourcePath: string;
  brokenTarget: string;
  suggestedReplacement?: string;
  matchConfidence?: number;
}

interface StaleHubMetadata {
  pagerank: number;
  semanticPagerank: number;
  lastModified: number;         // epoch ms
  daysSinceModified: number;
  inboundLinkCount: number;
  hubRole?: string;             // 'bridge' | 'authority' | 'cluster_center'
}

interface CoverageGapMetadata {
  pathPrefix: string;
  uncoveredDocumentCount: number;
  examplePaths: string[];       // up to 5
}

interface DuplicateMetadata {
  otherPath: string;
  otherTitle: string;
  similarity: number;
  titleJaccard: number;
}

interface PhantomNodeMetadata {
  conceptName: string;          // the unresolved link target
  referenceCount: number;       // how many notes link to it
  referencingPaths: string[];   // up to 5
}

// --- Scan result ---

interface LintScanResult {
  id: string;
  scanType: 'full' | 'incremental';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  totalNotes: number;
  healthScore: number;          // 0-100
  dimensionScores: Record<LintDimension, number>;
  findings: LintFinding[];
  signalCounts: Partial<Record<LintSignalId, number>>;
}

// --- Dismissal ---

interface LintDismissal {
  signalId: LintSignalId;
  filePath: string;
  dismissedAt: number;
  reason?: 'false_positive' | 'wont_fix' | 'snoozed';
  snoozeUntil?: number;
}

// --- Fix actions ---

type FixActionId =
  | 'suggest-links' | 'delete-note' | 'redirect-link' | 'create-note'
  | 'remove-link' | 'insert-backlink' | 'bridge-to-main' | 'strengthen-connections'
  | 'draft-content' | 'suggest-split' | 'merge-notes' | 'link-as-alias'
  | 'add-frontmatter' | 'rename-with-prefix'
  | 'review-update' | 'mark-current' | 'snooze' | 'archive-cluster' | 'update-neighborhood'
  | 'create-hub' | 'review-cluster' | 'reconcile-contradiction' | 'create-phantom-note'
  | 'suggest-tags' | 'merge-tag' | 'review-taxonomy';

// --- Trend ---

interface LintTrendPoint {
  timestamp: number;
  healthScore: number;
  dimensions: Record<LintDimension, number>;
  totalFindings: number;
}
```

### 7.3 Configuration File

`templates/config/vault-lint-config.json` — runtime-editable configuration (per CLAUDE.md configurability rule: never hardcode in logic files).

```json
{
  "dimensionWeights": {
    "structural": 0.30,
    "content": 0.20,
    "temporal": 0.15,
    "semantic": 0.25,
    "tags": 0.10
  },
  "thresholds": {
    "stubMaxChars": 100,
    "oversizedMinWords": 5000,
    "duplicateMinSimilarity": 0.92,
    "duplicateMinTitleJaccard": 0.50,
    "staleHubDays": 180,
    "staleHubMinPageRankPercentile": 75,
    "decayingBridgeDays": 365,
    "abandonedClusterDays": 180,
    "abandonedFolderDays": 365,
    "recentDriftActiveDays": 30,
    "recentDriftStaleDays": 180,
    "tagExplosionMultiplier": 5,
    "softOrphanMaxDegree": 2,
    "phantomNodeMinReferences": 3,
    "contradictionMinSimilarity": 0.80,
    "missingBacklinkMinSimilarity": 0.70,
    "lowCohesionMaxDensity": 0.30,
    "islandClusterMaxSize": 5,
    "redundantHubMinOverlap": 0.70
  },
  "scan": {
    "incrementalDebounceMs": 30000,
    "fullScanIntervalHours": 168,
    "contradictionBatchSize": 20,
    "contradictionConcurrency": 2
  }
}
```

### 7.4 Zustand Store

```typescript
// src/ui/store/vaultLintStore.ts

interface VaultLintState {
  // Scan data
  currentScan: LintScanResult | null;
  isScanning: boolean;
  scanProgress: { detector: string; processed: number; total: number } | null;
  
  // Trend
  trendHistory: LintTrendPoint[];
  
  // UI state
  expandedSignal: LintSignalId | null;
  selectedFilePath: string | null;
  showInfoFindings: boolean;
  structuralMapTab: 'community' | 'orphans' | 'bridges';
  
  // Actions
  startScan: (type: 'full' | 'incremental') => Promise<void>;
  dismissFinding: (findingId: string, reason: string) => void;
  applyFix: (findingId: string, actionId: FixActionId) => Promise<void>;
  setExpandedSignal: (signalId: LintSignalId | null) => void;
}
```

---

## 8. Implementation Phases

### Phase 1: Core Engine + Structural/Content Signals (Week 1-2)

**Goal**: Working lint engine with the highest-impact signals and a basic dashboard.

| # | Task | Existing Code Reuse | New Code Location |
|---|------|---------------------|-------------------|
| 1.1 | SQLite schema: `vault_lint_scan`, `vault_lint_finding`, `vault_lint_dismissal` | `SqliteStoreManager` migration pattern | `VaultLintRepo.ts` in `core/storage/sqlite/repositories/` |
| 1.2 | `LintSignalDetector` interface + `SignalRegistry` | — | `src/service/lint/types.ts`, `src/service/lint/SignalRegistry.ts` |
| 1.3 | `S-ORPHAN` detector | `find-orphans.ts:15` `findOrphanNotes()` + `findRevivalSuggestions()` | `src/service/lint/signals/structural.ts` |
| 1.4 | `S-BROKEN-LINK` detector | Obsidian `metadataCache.unresolvedLinks` | `src/service/lint/signals/structural.ts` |
| 1.5 | `C-EMPTY` + `C-STUB` detectors | `vault.read()` | `src/service/lint/signals/content.ts` |
| 1.6 | `G-UNTAGGED` detector | `indexed_document.tags` | `src/service/lint/signals/tags.ts` |
| 1.7 | `HealthScoreEngine` — composite score from dimension scores | — | `src/service/lint/HealthScoreEngine.ts` |
| 1.8 | `VaultLintService` — orchestrator: runs detectors, computes score, persists | — | `src/service/lint/VaultLintService.ts` |
| 1.9 | Config loading from `templates/config/vault-lint-config.json` | `TemplateManager` / `TemplateRegistry` pattern | Template registration |
| 1.10 | Command: `Peak: Vault X-Ray` | `Register.ts` pattern | Registration in `Register.ts` |
| 1.11 | Basic dashboard view: score ring + dimension bars + finding list (no graph) | — | `src/ui/view/vault-lint/VaultXRayView.tsx` |
| 1.12 | `vaultLintStore.ts` Zustand store | — | `src/ui/store/vaultLintStore.ts` |

### Phase 2: Content + Tag + Temporal Signals (Week 3)

| # | Task |
|---|------|
| 2.1 | `C-OVERSIZED` detector (word count from indexed content) |
| 2.2 | `C-DUPLICATE` detector (reuse `EmbeddingRepo.searchSimilarAndGetId()`) |
| 2.3 | `C-FRONTMATTER-MISSING` detector |
| 2.4 | `C-NAMING-VIOLATION` detector (regex on index/mess filenames) |
| 2.5 | `G-TAG-ISLAND` detector (reuse `aggregateTagDocFrequencies()`) |
| 2.6 | `G-TAG-REDUNDANCY` detector (Jaccard on tag document sets) |
| 2.7 | `G-TAG-EXPLOSION` detector (threshold heuristic) |
| 2.8 | `T-STALE-HUB` detector (reuse `loadDocPageranks()` + modified timestamp) |
| 2.9 | `T-ABANDONED-CLUSTER` detector (hub cluster membership + modified scan) |
| 2.10 | `T-ABANDONED-FOLDER` detector (aggregate mtime per folder prefix) |

### Phase 3: Fix Actions + Dismissals (Week 4)

| # | Task |
|---|------|
| 3.1 | Fix: `S-ORPHAN` → suggest links (UI for revival suggestions from `findRevivalSuggestions()`) |
| 3.2 | Fix: `S-BROKEN-LINK` → redirect / create / remove (fuzzy match + `vault.modify()`) |
| 3.3 | Fix: `C-EMPTY` → delete (with confirmation dialog) |
| 3.4 | Fix: `G-TAG-REDUNDANCY` → merge tags (batch `vault.modify()` across affected files) |
| 3.5 | Fix: `G-UNTAGGED` → suggest tags (LLM-based, reuse `includeLlmTags`) |
| 3.6 | Fix: `C-OVERSIZED` → suggest split (delegate to existing `SplitPanel` / copilot split command) |
| 3.7 | Dismissal persistence: `vault_lint_dismissal` table + snooze / false-positive / won't-fix |
| 3.8 | Batch operations: select all, apply fix to selection, progress indicator |
| 3.9 | Drill-down detail panels for each signal type |

### Phase 4: Advanced Structural + Semantic Signals (Week 5)

| # | Task |
|---|------|
| 4.1 | `S-SOFT-ORPHAN` detector (degree ≤ 2, neighbors also low-degree) |
| 4.2 | `S-ISLAND-CLUSTER` detector (connected components via BFS on `mobius_edge`) |
| 4.3 | `S-FRAGILE-BRIDGE` detector (Tarjan's articulation point algorithm) |
| 4.4 | `S-MISSING-BACKLINK` detector (co-citation + semantic similarity threshold) |
| 4.5 | `T-DECAYING-BRIDGE` detector (Tarjan result + timestamp) |
| 4.6 | `T-RECENT-DRIFT` detector (outgoing link staleness analysis) |
| 4.7 | `M-COVERAGE-GAP` detector (consume `HubDiscoverCoverageGap` from hub discovery) |
| 4.8 | `M-LOW-COHESION` detector (cluster density from `computeIntraClusterSemanticDensity()`) |
| 4.9 | `M-PHANTOM-NODE` detector (unresolved link frequency analysis) |
| 4.10 | `M-SEMANTIC-ISOLATION` + `M-REDUNDANT-HUBS` detectors |

### Phase 5: Structural Map + Incremental + Trend (Week 6)

| # | Task |
|---|------|
| 5.1 | Structural Map: Community Map tab (React Flow, reuse `@xyflow/react` from `MultiLensGraph.tsx`) |
| 5.2 | Structural Map: Orphan Islands tab |
| 5.3 | Structural Map: Bridge Notes tab |
| 5.4 | Incremental scan engine (file event debouncing + change-affected signal mapping) |
| 5.5 | Background-on-load scan (deferred full scan if > 24h since last) |
| 5.6 | Trend sparkline: score history chart from `vault_lint_scan` table |
| 5.7 | Status bar badge + ribbon icon colored by health range |
| 5.8 | Post-scan Notice: "Vault Health: 72/100 (+3)" |

### Phase 6: LLM-Enhanced Signals + MCP Exposure (Week 7)

| # | Task |
|---|------|
| 6.1 | `M-CONTRADICTION` detector — background LLM batch (pairwise stance comparison for same-topic pairs) |
| 6.2 | `G-NOISE-TAGS` detector (reuse `tagDisplayRank.ts`) |
| 6.3 | Fix: `M-COVERAGE-GAP` → create hub (delegate to `HubDocService`) |
| 6.4 | Fix: `M-PHANTOM-NODE` → create note (LLM-drafted content from referencing notes) |
| 6.5 | Fix: `M-CONTRADICTION` → reconcile (open both notes side-by-side) |
| 6.6 | MCP tools: `vault_health_score()`, `vault_get_lint_findings(dimension?, severity?)`, `vault_get_coverage_gaps()` |
| 6.7 | Scheduled weekly full scan via `BackgroundSessionManager` |
| 6.8 | Settings UI: dimension weight sliders, scan schedule, threshold overrides |

<!-- Phase 6 的 LLM 信号是增强功能。Phase 1-5 的核心功能不依赖 LLM，确保零成本零延迟的基础体验。
MCP exposure 实现 §9.4 的反向输出策略——让 Claude Code 能调用 Peak 的结构化知识分析。 -->

---

## Appendix A: Existing Code Anchors

| Capability | File | Key Function/Class | Line |
|------------|------|--------------------|----|
| Hard orphan detection + revival suggestions | `src/service/tools/search-graph-inspector/find-orphans.ts` | `findOrphanNotes()`, `findRevivalSuggestions()` | :10, :64 |
| Hard orphan node IDs (SQL) | `src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts` | `getHardOrphanNodeIds()`, `getHardOrphans()` | :650, :680 |
| Hub discovery + coverage gaps | `src/service/search/index/helper/hub/hubDiscover.ts` | `HubCandidateDiscoveryService` | :2274 |
| Coverage gap type | `src/service/search/index/helper/hub/types.ts` | `HubDiscoverCoverageGap` | :410 |
| Hub cluster cohesion signals | `src/service/search/index/helper/hub/clusterHubSignals.ts` | `computeIntraClusterSemanticDensity()`, `computeClusterCohesionFromMembers()` | — |
| PageRank loading | `src/service/search/index/helper/backbone/pagerankMass.ts` | `loadDocPageranks()` | :9 |
| Tag display ranking | `src/service/search/index/helper/backbone/tagDisplayRank.ts` | tag noise suppression | — |
| Tag frequency aggregation | `src/service/search/index/helper/hub/folderHubTopicPurity.ts` | `aggregateTagDocFrequencies()` | — |
| Semantic edges (doc-to-doc) | `src/service/search/index/helper/semanticRelatedEdges.ts` | `SemanticRelatedEdgesReadService`, `SemanticRelatedEdgesRebuildService` | :135, :187 |
| Co-citation analysis | `src/service/search/coCitationService.ts` | `buildCoCitationQuery()` | :22 |
| Unlinked mention detection | `src/service/search/unlinkedMentionService.ts` | `getUnlinkedMentions()` | :19 |
| Inspector service (links, graph) | `src/service/search/inspectorService.ts` | `getInspectorLinks()` | :58 |
| Split plan UI | `src/ui/component/mine/copilot/SplitPanel.tsx` | heading-based split | — |
| Copilot split command | `src/app/commands/copilot-commands.ts` | split command registration | — |
| Background sessions | `src/service/BackgroundSessionManager.ts` | `BackgroundSessionManager` singleton | — |
| SQLite migration pattern | `src/core/storage/sqlite/SqliteStoreManager.ts` | table creation on init | — |
| Template config loading | `src/core/template/TemplateManager.ts` | `loadTemplate()` | — |
| Graph visualization | `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx` | React Flow `@xyflow/react` | — |
| Vector similarity search | `src/core/storage/sqlite/repositories/EmbeddingRepo.ts` | `searchSimilarAndGetId()` | — |

## Appendix B: Academic References

| Reference | Relevance to Vault Lint |
|---|---|
| Karpathy, "LLM Wiki" (2026-04-04) | Lint as a first-class operation: contradictions, orphans, missing cross-references, topical gaps |
| Burt (2004), AJS, "Structural Holes and Good Ideas" | Bridge notes bridging disconnected communities are high-value; their fragility is a risk signal |
| Microsoft GraphRAG (2024), arXiv 2404.16130 | Community detection (Leiden/Louvain) for topic cluster identification; coverage gaps |
| HippoRAG (NeurIPS 2024) | PPR feasibility on <50K node graphs validates local health computation in an Obsidian plugin |
| Mankoff et al. (CHI 2003) | Ambient display heuristics — score card must be glanceable in 2 seconds |
| Slamecka & Graf (1978), Generation Effect | Fix actions MUST be suggestions, not silent execution — 20-40% better retention |
| Karr-Wisniewski & Lu (2010), Technology Overload | Notification frequency must be user-controllable; over-notification reduces productivity |
| Clark (2025), Nature Communications | AI-suggested content must be visually distinguishable from user-created |
| Whittaker (2011), ARIST | User-created folder structure encodes intent — tag signals should respect user organization |
| Brain Cache (CHI 2025) | Three-layer cognitive exoskeleton: externalize → structure → **activate**; Vault Lint is the activation layer |

## Appendix C: MCP Exposure

<!-- 差异化分析 §9.4 的 MCP 反向导出策略：把 Vault X-Ray 能力暴露为 MCP Server 给 Claude Code 用。
差异不是"更专一化"，是更高层的抽象：Peak 提供"知识理解"（预计算的结构+关系+评分），不是"文件访问"（原始读写）。 -->

Lint results exposed as MCP tools for external consumption (e.g., Claude Code calling Peak's analysis):

| Tool | Signature | Returns |
|------|-----------|---------|
| `vault_health_score` | `()` | Overall score + 5 dimension scores + trend delta |
| `vault_get_lint_findings` | `(dimension?, severity?, limit?)` | Filtered finding list with metadata |
| `vault_get_orphans` | `(limit?)` | Orphan notes with revival suggestions |
| `vault_get_decay` | `(limit?)` | Decaying critical notes (stale hubs + bridges) |
| `vault_get_coverage_gaps` | `()` | Uncovered folder subtrees with example paths |
| `vault_get_bridges` | `(limit?)` | Articulation-point notes + fragility scores |
| `vault_get_duplicates` | `(limit?)` | Near-duplicate pairs with similarity scores |

## Appendix D: Non-Goals (Explicitly Out of Scope)

1. **Real-time inline lint markers** (like ESLint underlines in editors) — too intrusive for knowledge work. Vault Lint is a periodic health check, not a writing-time distraction
2. **Automated fixes without user confirmation** — violates the Generation Effect principle. All fixes require at least one user click
3. **Cross-vault comparison** — each vault is analyzed independently. Anonymous topology sharing is a separate feature (see differentiation analysis §5.19)
4. **Content quality scoring** (readability, grammar, writing style) — subjective and out of scope. Lint signals are structural/organizational, not editorial
5. **LLM-powered rewriting** of stale notes — the fix for T-STALE-HUB is "open for review", not "silently rewrite the content"
6. **Circular reference detection** — excluded from the signal set because circular references in a knowledge graph are not inherently problematic (unlike in code dependencies). MOC/index notes naturally create cycles
