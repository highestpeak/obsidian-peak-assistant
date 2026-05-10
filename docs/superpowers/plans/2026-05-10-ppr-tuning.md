# PPR Search Tuning Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune and extend the already-implemented Personalized PageRank search pipeline. PPR (Forward Push algorithm) is live in production. This plan closes the gaps between the spec and the current implementation: query-node seeding, co-citation edge layer, settings UI toggle, and a before/after evaluation framework.

**Branch:** `feat/ppr-tuning` (git worktree)

**Architecture:** The PPR core (`personalizedPageRank.ts`) and edge fetcher (`pprEdgeFetcher.ts`) are complete. Integration in `queryService.ts` and `reranker.ts` is complete. Gaps:
1. **Seed strategy:** `applyPPR()` seeds only from top-K RRF results — the spec also calls for query-node seeding (match query terms against FTS to find direct term-matching nodes, then blend into seed distribution). Not implemented.
2. **Co-citation edges:** `pprEdgeFetcher.ts` has 3 layers (reference, semantic, tag). The `coCitationService.ts` SQL exists but is NOT wired into `pprEdgeFetcher.ts` as a 4th edge layer.
3. **Settings persistence:** `enablePPR` lives only on `SearchQuery.enablePPR` (request-time flag, default `true`). There is no persisted `SearchSettings` field, no settings UI toggle, and no loader normalization. Users cannot disable PPR without code changes.
4. **Evaluation:** No side-by-side comparison command. No per-search metric logging beyond `sw.print()`.

**Spec:** `docs/superpowers/specs/2026-05-01-ppr-search-design.md` (sections 2.2, 2.5, 7, 8 Phase 3)

---

## File Structure

### Modified Files

| File | Change Summary |
|------|----------------|
| `src/core/constant.ts` | Add `PPR_QUERY_NODE_SEED_K`, `PPR_QUERY_NODE_WEIGHT_FRACTION`, `PPR_COCITATION_LAYER_WEIGHT`, adjust `PPR_LAYER_WEIGHT_*` to sum correctly |
| `src/service/search/query/pprEdgeFetcher.ts` | Add co-citation as 4th edge layer using `buildCoCitationQuery` |
| `src/service/search/query/queryService.ts` | Blend query-node seeds into `applyPPR()`; log PPR stats via `console.debug` |
| `src/app/settings/types.ts` | Add `enablePPR: boolean` to `SearchSettings` + default |
| `src/app/settings/PluginSettingsLoader.ts` | Normalize `enablePPR` from raw JSON |
| `src/ui/view/settings/SearchTab.tsx` | Add PPR toggle card under Graph section |
| `src/app/commands/SearchCommands.ts` | Add `Peak: Compare Search Results` command |

### New Files

| File | Purpose |
|------|---------|
| `src/service/search/query/pprEvaluator.ts` | Side-by-side evaluation: runs baseline vs PPR pipeline, computes rank displacement + discovery count |

---

## Task 1: Constants + Co-citation Edge Layer

**Files:**
- Modify: `src/core/constant.ts`
- Modify: `src/service/search/query/pprEdgeFetcher.ts`

**Context:** `pprEdgeFetcher.ts` currently has 3 layers with weights `λ_ref=0.4, λ_sem=0.5, λ_tag=0.1` summing to 1.0. Adding co-citation as a 4th layer requires rebalancing weights. The co-citation SQL already exists in `src/service/search/coCitationService.ts` (`buildCoCitationQuery`). The fetcher calls `edgeRepo.getByFromNode(nodeId)` for outgoing edges; co-citation requires a different query (nodes that share citers with `nodeId`).

- [ ] **Step 1: Add new constants**

In `src/core/constant.ts`, after the existing `PPR_MAX_EXPANSION_RESULTS` constant (line 221), add:

```typescript
// PPR query-node seeding
/** Max FTS-matched nodes to add to seed distribution alongside top-K RRF results. */
export const PPR_QUERY_NODE_SEED_K = 5;
/**
 * Fraction of the total seed weight budget allocated to query-node seeds.
 * RRF seeds get (1 - PPR_QUERY_NODE_WEIGHT_FRACTION), query nodes get this fraction.
 * Set to 0 to disable query-node seeding.
 */
export const PPR_QUERY_NODE_WEIGHT_FRACTION = 0.25;

// PPR co-citation layer
/** Layer weight for co-citation edges. Reference + Semantic + Tag + CoCitation must sum to 1.0. */
export const PPR_LAYER_WEIGHT_COCITATION = 0.15;
```

Then update the existing three layer-weight constants so they sum to 0.85 (making room for co-citation's 0.15):

```typescript
export const PPR_LAYER_WEIGHT_REFERENCE = 0.35;  // was 0.4
export const PPR_LAYER_WEIGHT_SEMANTIC  = 0.40;  // was 0.5
export const PPR_LAYER_WEIGHT_TAG       = 0.10;  // unchanged
```

Rationale: semantic edges are the most accurate relevance signal; reference edges encode user intent; co-citation adds structural discovery; tag co-occurrence adds thematic spread.

- [ ] **Step 2: Wire co-citation into `pprEdgeFetcher.ts`**

At the top of `src/service/search/query/pprEdgeFetcher.ts`, add import:

```typescript
import { buildCoCitationQuery } from '@/service/search/coCitationService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { PPR_LAYER_WEIGHT_COCITATION } from '@/core/constant';
```

(Note: `sqliteStoreManager` is already imported — deduplicate.)

Inside the `createPPREdgeFetcher` closure, after building `tagRaw`, add a co-citation fetch block before the normalize-and-combine step:

```typescript
// 4. Co-citation: nodes that share reference citers with `nodeId`.
//    Reuses the existing buildCoCitationQuery (IDF-weighted SQL).
//    Needs the nodeId's indexed-doc ID to pass to the SQL.
const coCitRaw: MultiLayerEdge[] = [];
try {
    // Look up docId for nodeId — mobius_node.node_id IS docId in vault graph.
    const { sql: coCitSql, params: coCitParams } = buildCoCitationQuery(
        nodeId,
        20, // limit co-citation candidates per node
    );
    const rawDb = sqliteStoreManager.getSearchStore();
    if (rawDb) {
        type CoCitRow = { co_cited_id: string; weighted_score: number };
        const rows = rawDb.prepare(coCitSql).all(...coCitParams) as CoCitRow[];
        for (const row of rows) {
            if (row.co_cited_id && row.weighted_score > 0) {
                coCitRaw.push({ to: row.co_cited_id, weight: row.weighted_score });
            }
        }
    }
} catch {
    // Co-citation is best-effort; failure falls back to 3-layer PPR.
}
```

Then update `normalizeLayer` calls and `combineLayers` to include the new layer:

```typescript
const coCitNorm = normalizeLayer(coCitRaw);

const result = combineLayers([
    { edges: refNorm,    lambda: PPR_LAYER_WEIGHT_REFERENCE },
    { edges: semNorm,    lambda: PPR_LAYER_WEIGHT_SEMANTIC },
    { edges: tagNorm,    lambda: PPR_LAYER_WEIGHT_TAG },
    { edges: coCitNorm,  lambda: PPR_LAYER_WEIGHT_COCITATION },
]);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. No TypeScript errors. Constants sum check: `0.35 + 0.40 + 0.10 + 0.15 = 1.00`.

- [ ] **Step 4: Commit**

```bash
git add src/core/constant.ts src/service/search/query/pprEdgeFetcher.ts
git commit -m "feat(ppr): add co-citation edge layer and rebalance layer weights"
```

---

## Task 2: Query-Node Seeding

**Files:**
- Modify: `src/service/search/query/queryService.ts`

**Context:** Currently `applyPPR()` takes only the top RRF results as seeds. The spec (section 2.2) proposes an additional "query-node" seed set: find nodes whose FTS metadata directly matches query terms, then blend a fraction of the seed weight budget to those nodes. This improves PPR on queries where top RRF results are ambiguous (e.g., when 50 similar notes cluster together in embedding space), because it anchors the walk to explicit term-matching nodes in addition to score-ranked results.

The FTS retriever results are already computed and available in `retrieverResults` (keyed by retriever name). We can extract FTS matches without a second query.

- [ ] **Step 1: Add imports at top of `queryService.ts`**

```typescript
import {
    PPR_QUERY_NODE_SEED_K,
    PPR_QUERY_NODE_WEIGHT_FRACTION,
} from '@/core/constant';
```

- [ ] **Step 2: Extract query-node seeds from existing FTS results**

Inside `applyPPR()` (currently at line 233), after extracting `seeds` from `items`, add query-node blending. The method signature needs a third parameter `queryNodeDocIds`:

```typescript
private async applyPPR(
    items: Array<{ path: string; score: number; docId?: string }>,
    tenant: IndexTenant,
    queryNodeDocIds: string[] = [],  // <-- new optional param
): Promise<Array<{ path: string; score: number; docId?: string }>> {
```

Seed weight blending logic (add after `pprSeeds` construction, before `computePPR` call):

```typescript
// Blend query-node seeds into the seed distribution.
// Query-node seeds get PPR_QUERY_NODE_WEIGHT_FRACTION of total weight;
// RRF seeds are scaled to (1 - PPR_QUERY_NODE_WEIGHT_FRACTION).
if (queryNodeDocIds.length > 0 && PPR_QUERY_NODE_WEIGHT_FRACTION > 0) {
    const rrfFraction = 1 - PPR_QUERY_NODE_WEIGHT_FRACTION;
    for (const seed of pprSeeds) seed.weight *= rrfFraction;

    const existingNodeIds = new Set(pprSeeds.map(s => s.nodeId));
    const queryOnlyNodes = queryNodeDocIds
        .filter(id => !existingNodeIds.has(id))
        .slice(0, PPR_QUERY_NODE_SEED_K);

    if (queryOnlyNodes.length > 0) {
        const perQueryNodeWeight = PPR_QUERY_NODE_WEIGHT_FRACTION / queryOnlyNodes.length;
        for (const nodeId of queryOnlyNodes) {
            pprSeeds.push({ nodeId, weight: perQueryNodeWeight });
        }
    }
}
```

- [ ] **Step 3: Extract query-node docIds from FTS retriever results and pass to `applyPPR`**

In `textSearch()`, after `rrfMerge` and before calling `applyPPR`, extract FTS-matched docIds:

```typescript
// Collect docIds from FTS retrievers for query-node seeding in PPR.
// FTS matches are the most direct term-level relevance signal.
const ftsDocIds: string[] = (() => {
    const ftsResult = retrieverResults.find(r => r.name === 'fts' || r.name === 'fts-stem');
    if (!ftsResult) return [];
    return ftsResult.results
        .slice(0, PPR_QUERY_NODE_SEED_K)
        .map(r => r.docId)
        .filter((id): id is string => typeof id === 'string');
})();
```

Then update the `applyPPR` call:

```typescript
const pprEnriched = await this.applyPPR(resultItems, tenant, ftsDocIds);
```

- [ ] **Step 4: Add debug logging for PPR stats**

After `computePPR` returns `pprResult`, add:

```typescript
console.debug('[PPR]', {
    seeds: pprSeeds.length,
    queryNodeSeeds: queryNodeDocIds.length,
    pushOps: pprResult.pushOps,
    nodesExplored: pprResult.nodesExplored,
    elapsedMs: pprResult.elapsedMs,
    truncated: pprResult.truncated,
    expansion: candidateNodeIds.length,
});
```

- [ ] **Step 5: Check RetrieverResult type includes docId**

Verify `src/service/search/retriever/` types: confirm `RetrieverResult` items have a `docId` field. If it's `nodeId` or a different name, adjust the extraction in Step 3 accordingly.

```bash
grep -r "docId\|nodeId\|node_id" src/service/search/retriever/fts-retriever.ts | head -20
```

Adapt field name as needed.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/service/search/query/queryService.ts
git commit -m "feat(ppr): add query-node seeding with configurable weight fraction"
```

---

## Task 3: Settings Persistence + UI Toggle

**Files:**
- Modify: `src/app/settings/types.ts`
- Modify: `src/app/settings/PluginSettingsLoader.ts`
- Modify: `src/ui/view/settings/SearchTab.tsx`

**Context:** `enablePPR` currently defaults to `true` via `query.enablePPR !== false` in `queryService.ts`. There is no user-facing toggle and no persisted setting. The spec (section 7.1) requires a `SearchSettings.enablePPR` field. The settings UI should expose this as a switch under a "Graph Search" section in SearchTab — near the existing "Auto-index" section.

- [ ] **Step 1: Add `enablePPR` to `SearchSettings`**

In `src/app/settings/types.ts`, add to the `SearchSettings` interface after `searchUpgradePromptDismissedAt`:

```typescript
/** Enable Personalized PageRank graph reranking during text search. Default: true. */
enablePPR: boolean;
```

In `DEFAULT_SEARCH_SETTINGS`, add:

```typescript
enablePPR: true,
```

- [ ] **Step 2: Add loader normalization**

In `src/app/settings/PluginSettingsLoader.ts`, inside the `loadSearchSettings` function (after the `indexLevel` block near line 204), add:

```typescript
// enablePPR: restore persisted value or keep default
settings.enablePPR = getBoolean((rawSearch as any).enablePPR, settings.enablePPR);
```

- [ ] **Step 3: Thread `enablePPR` from settings into `QueryService`**

`QueryService` is constructed with `SearchSettings` in `src/service/search/query/queryService.ts`. In `textSearch()`, change the PPR gate from:

```typescript
const enablePPR = query.enablePPR !== false;
```

to:

```typescript
// Settings flag takes priority; query-level flag can still force-disable.
const enablePPR = this.searchSettings.enablePPR !== false && query.enablePPR !== false;
```

This keeps the request-level override (useful for the comparison command in Task 4) while respecting the persisted user preference.

- [ ] **Step 4: Add PPR toggle to SearchTab**

In `src/ui/view/settings/SearchTab.tsx`, import `Network` from `lucide-react` (already available in the icon set). After the existing `<SectionHeader icon={Database} title="Indexing" />` block and before the `{/* ── Chunking ── */}` comment, add a new Graph Search section:

```tsx
<div className="pktw-border-t pktw-border-border pktw-my-1" />

{/* ── Graph Search ── */}
<SectionHeader icon={Network} title="Graph Search" />

<SettingCard
    label="Personalized PageRank"
    description="Rerank results using per-query graph walks. Surfaces related notes that keyword and vector search miss."
>
    <Switch
        checked={settings.search.enablePPR ?? true}
        onChange={(v) => updateSearch('enablePPR', v)}
    />
</SettingCard>
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds. Open Obsidian settings → Search tab → verify "Graph Search" section with PPR toggle appears.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/types.ts src/app/settings/PluginSettingsLoader.ts \
        src/service/search/query/queryService.ts \
        src/ui/view/settings/SearchTab.tsx
git commit -m "feat(ppr): add persistent enablePPR setting with UI toggle"
```

---

## Task 4: Side-by-Side Evaluation Command

**Files:**
- New: `src/service/search/query/pprEvaluator.ts`
- Modify: `src/app/commands/SearchCommands.ts`

**Context:** The spec (section 7.2) requires a `Peak: Compare Search Results` command that runs both pipelines and shows rank differences. Since we cannot split traffic (single user), evaluation is interactive: the user triggers a query in comparison mode and views a diff. This task implements the evaluator logic and wires it to a command. The UI rendering is minimal — results go to the DevTools console and a Notice (full comparison UI is out of scope for this plan).

- [ ] **Step 1: Create `pprEvaluator.ts`**

Create `src/service/search/query/pprEvaluator.ts`:

```typescript
/**
 * PPR evaluation utilities.
 *
 * Computes side-by-side metrics between baseline (no PPR) and PPR-enabled pipelines.
 * Used by the "Peak: Compare Search Results" command.
 */

export interface PPREvalMetrics {
    /** Query text evaluated. */
    query: string;
    /** Number of rank positions shifted for docs in both result sets. */
    rankDisplacement: number;
    /** Paths present in PPR results but absent in baseline (graph-discovered). */
    pprOnlyPaths: string[];
    /** Paths present in baseline but absent in PPR results (demoted out of top-K). */
    baselineOnlyPaths: string[];
    /** PPR compute overhead as fraction of total search time. */
    pprOverheadFraction: number;
    /** Wall-clock time for baseline search (ms). */
    baselineMs: number;
    /** Wall-clock time for PPR search (ms). */
    pprMs: number;
}

export function computeEvalMetrics(
    query: string,
    baselinePaths: string[],
    pprPaths: string[],
    baselineMs: number,
    pprMs: number,
): PPREvalMetrics {
    const baselineSet = new Set(baselinePaths);
    const pprSet = new Set(pprPaths);

    // Rank displacement: sum of |rank_ppr - rank_baseline| for shared docs.
    let rankDisplacement = 0;
    const baselineRank = new Map(baselinePaths.map((p, i) => [p, i + 1]));
    const pprRank = new Map(pprPaths.map((p, i) => [p, i + 1]));
    for (const [path, bRank] of baselineRank) {
        const pRank = pprRank.get(path);
        if (pRank !== undefined) {
            rankDisplacement += Math.abs(pRank - bRank);
        }
    }

    const pprOnlyPaths = pprPaths.filter(p => !baselineSet.has(p));
    const baselineOnlyPaths = baselinePaths.filter(p => !pprSet.has(p));
    const pprOverheadFraction = pprMs > 0 ? Math.max(0, (pprMs - baselineMs) / pprMs) : 0;

    return {
        query,
        rankDisplacement,
        pprOnlyPaths,
        baselineOnlyPaths,
        pprOverheadFraction,
        baselineMs,
        pprMs,
    };
}

export function formatEvalReport(m: PPREvalMetrics): string {
    const lines: string[] = [
        `PPR Evaluation: "${m.query}"`,
        `  Rank displacement: ${m.rankDisplacement} positions (lower = PPR agrees with baseline)`,
        `  PPR-only (graph-discovered): [${m.pprOnlyPaths.slice(0, 5).join(', ')}]${m.pprOnlyPaths.length > 5 ? ` +${m.pprOnlyPaths.length - 5} more` : ''}`,
        `  Baseline-only (demoted): [${m.baselineOnlyPaths.slice(0, 5).join(', ')}]${m.baselineOnlyPaths.length > 5 ? ` +${m.baselineOnlyPaths.length - 5} more` : ''}`,
        `  Latency: baseline=${m.baselineMs}ms PPR=${m.pprMs}ms overhead=${(m.pprOverheadFraction * 100).toFixed(1)}%`,
    ];
    return lines.join('\n');
}
```

- [ ] **Step 2: Add comparison command to `SearchCommands.ts`**

Find `src/app/commands/SearchCommands.ts` and add a new command registration. First, import the evaluator and QueryService at the top if not already present:

```typescript
import { computeEvalMetrics, formatEvalReport } from '@/service/search/query/pprEvaluator';
```

Add the command (inside the `registerCommands` or equivalent method):

```typescript
// Peak: Compare Search Results — side-by-side PPR vs baseline evaluation
this.plugin.addCommand({
    id: 'compare-search-results',
    name: 'Compare Search Results (PPR vs Baseline)',
    callback: async () => {
        const query = await promptUserForQuery(); // use existing modal/input util
        if (!query) return;

        const queryService = AppContext.getInstance().queryService;

        // Baseline: PPR disabled
        const t0 = Date.now();
        const baseline = await queryService.textSearch(
            { text: query, enablePPR: false },
        );
        const baselineMs = Date.now() - t0;

        // PPR: enabled
        const t1 = Date.now();
        const pprResult = await queryService.textSearch(
            { text: query, enablePPR: true },
        );
        const pprMs = Date.now() - t1;

        const metrics = computeEvalMetrics(
            query,
            baseline.items.map(i => i.path),
            pprResult.items.map(i => i.path),
            baselineMs,
            pprMs,
        );

        const report = formatEvalReport(metrics);
        console.log(report);
        new Notice(`PPR eval: ${metrics.pprOnlyPaths.length} graph-discovered, displacement=${metrics.rankDisplacement}`, 8000);
    },
});
```

Note: `promptUserForQuery` should reuse the existing query input mechanism. Check whether there is a `QuickInputModal` or similar utility in the codebase; if not, use `new Notice` with a hardcoded prompt flow or a simple `window.prompt` as a placeholder.

- [ ] **Step 3: Verify the command is registered**

Run: `npm run build`
Open Obsidian command palette, search "Compare Search Results" — command should appear.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/query/pprEvaluator.ts src/app/commands/SearchCommands.ts
git commit -m "feat(ppr): add side-by-side evaluation command and metrics"
```

---

## Tuning Reference

These are the concrete numeric targets from the spec. After Tasks 1-4 are complete, validate against these before merging:

| Metric | Target | How to measure |
|--------|--------|----------------|
| PPR compute time (10K vault) | < 30ms | `elapsedMs` in debug log |
| PPR compute time (50K vault) | < 100ms | `elapsedMs` in debug log |
| Nodes explored per query | < 1000 | `nodesExplored` in debug log |
| Rank displacement vs baseline | > 0 (PPR changes something) | Eval command output |
| Graph-discovered docs per query | >= 1 on most queries | `pprOnlyPaths.length` in eval |
| Layer weight sum | = 1.0 | `0.35 + 0.40 + 0.10 + 0.15` |
| Seed weight sum after blending | = 1.0 | Verified by `computePPR` normalization |

**Parameter adjustment guidance:**
- If PPR changes nothing (displacement = 0): increase `PPR_QUERY_NODE_WEIGHT_FRACTION` from 0.25 → 0.35 to give query-node seeds more influence.
- If PPR over-promotes unrelated graph neighbors: decrease `PPR_RRF_WEIGHT` from 0.3 → 0.2 in `constant.ts`.
- If co-citation edges add noise (unrelated notes appear): decrease `PPR_LAYER_WEIGHT_COCITATION` from 0.15 → 0.05 and redistribute to semantic.
- If tag edges cause fan-out to irrelevant notes: reduce `TAG_MAX_DOC_COUNT` in `pprEdgeFetcher.ts` from 100 → 50.
- If latency exceeds budget: decrease `PPR_MAX_PUSH_OPS` from 50_000 → 20_000 or `PPR_MAX_MS` from 200 → 100.
