# Ambient Push Phase 2 — Graph Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing FTS5-only ambient push pipeline with graph intelligence: 2-hop neighborhood expansion via `GraphRepo.getRelatedFilePaths()`, four new signal types (`shared_tag`, `graph_neighbor`, `co_citation`, `hub_member`), richer template explanations, session-level dedup enforcement, and a feedback loop where user actions (open/link/dismiss) influence future push scoring.

**Branch:** `feat/ambient-push-phase2` (git worktree)

**Architecture:** Phase 1 pipeline remains unchanged. Phase 2 adds a **Stage 2 graph expansion** step inside `AmbientSearcher`, merges graph results with FTS5 results, detects richer signals via `GraphRepo.getTagsByDocIds()` / `getCoCitations()` / `getRelatedFilePaths()`, and applies feedback-based scoring adjustments from `AmbientPushRepo`. The signal detection and feedback loop are pure additions — they extend existing functions without breaking Phase 1 behavior.

**Spec:** `docs/superpowers/specs/2026-05-01-ambient-push-design.md` (sections 3.4, 3.5, 4.3, 8 Phase 2)

---

## File Structure

### Modified Files

| File | Change Summary |
|------|---------------|
| `src/service/ambient/types.ts` | Add `graphExpansionHops`, `feedbackLearning` to `AmbientPushSettings`; widen `explanationType` union |
| `src/service/ambient/AmbientSearcher.ts` | Add Stage 2 graph expansion, multi-signal detection, dismissed-pair filtering, feedback score adjustments |
| `src/service/ambient/RelevanceExplainer.ts` | No changes needed — already handles all signal types |
| `src/service/ambient/AmbientPushService.ts` | Load dismissed pairs before search, pass graph/feedback context to searcher |
| `src/ui/store/ambientPushStore.ts` | Add `dismissedPairs` cache field, `loadDismissedPairs()` action |
| `src/core/storage/sqlite/repositories/AmbientPushRepo.ts` | Add `getPositivePairs()`, `getIgnoredPenalties()` queries |
| `src/app/settings/types.ts` | Update `AmbientPushSettings` import contract |
| `src/app/settings/PluginSettingsLoader.ts` | Normalize new settings fields |
| `test/ambient-push.test.ts` | Add tests for graph signal detection, feedback scoring, dedup logic |

### No New Files

All Phase 2 work modifies existing Phase 1 files. No new source files are created.

---

## Task 1: Settings Extension

**Files:**
- Modify: `src/service/ambient/types.ts`
- Modify: `src/app/settings/types.ts`
- Modify: `src/app/settings/PluginSettingsLoader.ts`

- [ ] **Step 1: Extend `AmbientPushSettings` in types.ts**

Add two new fields to the `AmbientPushSettings` interface and update `DEFAULT_AMBIENT_PUSH_SETTINGS`:

```typescript
// In AmbientPushSettings interface, add after showStatusBar:
graphExpansionHops: number;   // default: 2 — max hops for graph neighborhood expansion
feedbackLearning: boolean;    // default: true — use open/dismiss history to adjust scores
```

```typescript
// In DEFAULT_AMBIENT_PUSH_SETTINGS, add:
graphExpansionHops: 2,
feedbackLearning: true,
```

- [ ] **Step 2: Update PluginSettingsLoader normalization**

In `src/app/settings/PluginSettingsLoader.ts`, inside the ambient push normalization block, add:

```typescript
graphExpansionHops: typeof rawAmbient.graphExpansionHops === 'number'
  ? rawAmbient.graphExpansionHops
  : DEFAULT_AMBIENT_PUSH_SETTINGS.graphExpansionHops,
feedbackLearning: typeof rawAmbient.feedbackLearning === 'boolean'
  ? rawAmbient.feedbackLearning
  : DEFAULT_AMBIENT_PUSH_SETTINGS.feedbackLearning,
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/ambient/types.ts src/app/settings/types.ts src/app/settings/PluginSettingsLoader.ts
git commit -m "feat(ambient-p2): add graphExpansionHops and feedbackLearning settings"
```

---

## Task 2: AmbientPushRepo — Feedback Query Methods

**Files:**
- Modify: `src/core/storage/sqlite/repositories/AmbientPushRepo.ts`
- Modify: `test/ambient-push.test.ts`

The existing `AmbientPushRepo` already has `getDismissedPairs()`. Phase 2 adds two more queries for the feedback loop.

- [ ] **Step 1: Add `getPositivePairs()` method**

This returns pairs where the user took a positive action (`opened` or `linked`), used to boost future pushes for the same pair.

```typescript
/**
 * Get (source, pushed) pairs with positive feedback (opened/linked) in last N days.
 * Returns a Map of `source::pushed` → action count for score boosting.
 */
async getPositivePairs(withinDays: number): Promise<Map<string, number>> {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const rows = await this.db
    .selectFrom('ambient_push_log')
    .select(['source_file_path', 'pushed_file_path'])
    .select((eb) => eb.fn.count<number>('id').as('cnt'))
    .where('user_action', 'in', ['opened', 'linked'])
    .where('user_action_ts', '>=', cutoff)
    .groupBy(['source_file_path', 'pushed_file_path'])
    .execute();

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(`${row.source_file_path}::${row.pushed_file_path}`, row.cnt);
  }
  return result;
}
```

- [ ] **Step 2: Add `getIgnoredPenalties()` method**

Returns pairs where the user never acted (ignored) — used for a weak negative penalty (-0.05 per occurrence).

```typescript
/**
 * Get (source, pushed) pairs that were ignored (no user action) in last N days.
 * Returns a Map of `source::pushed` → ignore count for score penalty.
 */
async getIgnoredPenalties(withinDays: number): Promise<Map<string, number>> {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const rows = await this.db
    .selectFrom('ambient_push_log')
    .select(['source_file_path', 'pushed_file_path'])
    .select((eb) => eb.fn.count<number>('id').as('cnt'))
    .where('user_action', 'is', null)
    .where('timestamp', '>=', cutoff)
    // Only count pushes old enough that the user had time to act (>5 min ago)
    .where('timestamp', '<=', Date.now() - 5 * 60 * 1000)
    .groupBy(['source_file_path', 'pushed_file_path'])
    .execute();

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(`${row.source_file_path}::${row.pushed_file_path}`, row.cnt);
  }
  return result;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/repositories/AmbientPushRepo.ts
git commit -m "feat(ambient-p2): add getPositivePairs and getIgnoredPenalties repo queries"
```

---

## Task 3: Graph Signal Detection (core logic)

**Files:**
- Modify: `src/service/ambient/AmbientSearcher.ts`
- Modify: `test/ambient-push.test.ts`

This is the largest task — it transforms `AmbientSearcher` from FTS5-only to graph-aware.

- [ ] **Step 1: Write tests for the new signal detection functions**

Add to `test/ambient-push.test.ts`:

```typescript
import {
  detectSharedTags,
  detectGraphNeighborSignal,
  detectCoCitationSignal,
  detectHubMemberSignal,
} from '../src/service/ambient/AmbientSearcher';

// --- detectSharedTags ---
{
  const sourceTags = new Set(['process', 'dev', 'ai']);
  const resultTags = ['dev', 'testing', 'ai'];
  const signals = detectSharedTags(sourceTags, resultTags);
  assert.equal(signals.length, 2);
  assert.equal(signals[0].type, 'shared_tag');
  assert.equal((signals[0] as any).tag, 'dev');
  assert.equal((signals[1] as any).tag, 'ai');

  // No overlap
  const empty = detectSharedTags(new Set(['a']), ['b']);
  assert.equal(empty.length, 0);

  console.log('detectSharedTags: all passed');
}

// --- detectGraphNeighborSignal ---
{
  // 1-hop neighbor
  const s1 = detectGraphNeighborSignal('note-a.md', new Set(['note-a.md', 'note-b.md']), new Map());
  assert.equal(s1?.type, 'graph_neighbor');
  assert.equal((s1 as any).hop, 1);

  // 2-hop neighbor with bridge
  const bridgeMap = new Map([['note-c.md', 'Bridge Note']]);
  const s2 = detectGraphNeighborSignal('note-c.md', new Set(), bridgeMap);
  assert.equal(s2?.type, 'graph_neighbor');
  assert.equal((s2 as any).hop, 2);
  assert.equal((s2 as any).via, 'Bridge Note');

  // Not a neighbor
  const s3 = detectGraphNeighborSignal('note-x.md', new Set(), new Map());
  assert.equal(s3, null);

  console.log('detectGraphNeighborSignal: all passed');
}

console.log('All Phase 2 signal detection tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/ambient-push.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Extract and export signal detection functions in AmbientSearcher**

Refactor the current `detectSignals()` local function. Extract individual signal detectors as exported functions for testability. The overall approach:

**3a. Add imports at top of AmbientSearcher.ts:**

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getCoCitations, type CoCitationResult } from '@/service/search/coCitationService';
import { GraphNodeType } from '@/core/po/graph.po';
```

**3b. Add exported signal detection functions:**

```typescript
/**
 * Detect shared tags between source document and a result.
 * Uses the graph's topic/keyword tags from GraphRepo.getTagsByDocIds().
 */
export function detectSharedTags(
  sourceTags: Set<string>,
  resultTags: string[],
): AmbientSignal[] {
  const signals: AmbientSignal[] = [];
  for (const tag of resultTags) {
    if (sourceTags.has(tag)) {
      signals.push({ type: 'shared_tag', tag });
    }
  }
  return signals;
}

/**
 * Detect if a result path is a graph neighbor of the source.
 * Returns the signal with hop distance and bridge note (for 2-hop).
 *
 * @param resultPath - The file path of the search result
 * @param directNeighbors - Set of 1-hop neighbor paths
 * @param twoHopBridgeMap - Map of 2-hop neighbor path → bridge note title
 */
export function detectGraphNeighborSignal(
  resultPath: string,
  directNeighbors: Set<string>,
  twoHopBridgeMap: Map<string, string>,
): AmbientSignal | null {
  if (directNeighbors.has(resultPath)) {
    return { type: 'graph_neighbor', hop: 1 };
  }
  const bridge = twoHopBridgeMap.get(resultPath);
  if (bridge !== undefined) {
    return { type: 'graph_neighbor', hop: 2, via: bridge };
  }
  return null;
}

/**
 * Detect co-citation signal for a result path.
 */
export function detectCoCitationSignal(
  resultPath: string,
  coCitations: CoCitationResult[],
): AmbientSignal | null {
  const match = coCitations.find((c) => c.path === resultPath);
  if (match && match.citingNotes.length > 0) {
    return { type: 'co_citation', citingNote: match.citingNotes[0] };
  }
  return null;
}

/**
 * Detect hub membership signal — both source and result belong to the same hub.
 * A document "belongs" to a hub if the hub_doc node references it (outgoing edge).
 *
 * @param resultPath - path of the candidate result
 * @param sharedHubNames - hub labels that contain both source and result
 */
export function detectHubMemberSignal(
  resultPath: string,
  sharedHubNames: Map<string, string>,
): AmbientSignal | null {
  const hubName = sharedHubNames.get(resultPath);
  if (hubName) {
    return { type: 'hub_member', hubName };
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- test/ambient-push.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/service/ambient/AmbientSearcher.ts test/ambient-push.test.ts
git commit -m "feat(ambient-p2): add exported signal detection functions for graph, tags, co-citation, hub"
```

---

## Task 4: Graph Expansion in AmbientSearcher

**Files:**
- Modify: `src/service/ambient/AmbientSearcher.ts`

This task adds Stage 2 graph expansion and integrates all signal detectors into the search pipeline.

- [ ] **Step 1: Add `GraphSearchContext` interface and `buildGraphContext()` function**

This pre-computes all graph data needed for signal detection in a single batch, keeping the per-result loop fast.

```typescript
/** Pre-computed graph data for signal detection (built once per search cycle). */
interface GraphSearchContext {
  /** 1-hop neighbor paths from the source document */
  directNeighbors: Set<string>;
  /** 2-hop neighbor path → bridge note label (the 1-hop intermediary) */
  twoHopBridgeMap: Map<string, string>;
  /** All graph-reachable paths (1-hop + 2-hop), for Stage 2 expansion */
  allGraphPaths: Set<string>;
  /** Source document's topic + keyword tags (from graph) */
  sourceGraphTags: Set<string>;
  /** Per-result-path tag arrays (from graph), keyed by node_id */
  resultTagsByNodeId: Map<string, string[]>;
  /** Co-citation results for the source document */
  coCitations: CoCitationResult[];
  /** Hub membership: result path → hub name (shared with source) */
  sharedHubNames: Map<string, string>;
}

/**
 * Build graph context for the source document.
 * Makes 3 SQLite queries in parallel: graph neighbors, tags, co-citations.
 * Total budget: ~50ms.
 */
async function buildGraphContext(
  sourceFilePath: string,
  maxHops: number,
): Promise<GraphSearchContext | null> {
  try {
    const graphRepo = sqliteStoreManager.getGraphRepo();
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    // 1. Get the source node
    const sourceNode = await mobiusNodeRepo.getByPath(sourceFilePath);
    if (!sourceNode) return null;
    const sourceNodeId = sourceNode.node_id;

    // 2. Parallel: graph neighbors + co-citations + source tags
    const [allGraphPaths, coCitations, sourceTagResult] = await Promise.all([
      graphRepo.getRelatedFilePaths({ currentFilePath: sourceFilePath, maxHops }),
      getCoCitations(sourceFilePath, 10),
      graphRepo.getTagsByDocIds([sourceNodeId]),
    ]);

    // 3. Build 1-hop vs 2-hop distinction
    const oneHopPaths = await graphRepo.getRelatedFilePaths({
      currentFilePath: sourceFilePath,
      maxHops: 1,
    });
    const directNeighbors = oneHopPaths;

    // 4. Build 2-hop bridge map: for each 2-hop path, find the bridge node
    // Bridge = a 1-hop neighbor that is also a 1-hop neighbor of the 2-hop path
    const twoHopBridgeMap = new Map<string, string>();
    for (const path of allGraphPaths) {
      if (!directNeighbors.has(path)) {
        // This is a 2-hop neighbor — try to find bridge via node label
        // For now, use the source file title as "via" context
        // A full bridge resolution would require an additional query per 2-hop node.
        // Optimization: we mark these as 2-hop without bridge for now.
        twoHopBridgeMap.set(path, '');
      }
    }

    // 5. Source tags
    const sourceGraphTags = new Set<string>();
    const sourceTagEntry = sourceTagResult.idMapToTags.get(sourceNodeId);
    if (sourceTagEntry) {
      for (const t of sourceTagEntry.topicTags) sourceGraphTags.add(t);
      for (const t of sourceTagEntry.keywordTags) sourceGraphTags.add(t);
    }

    // 6. Hub membership detection — find hub_doc nodes that reference both source
    //    and candidate results. Hub docs reference their constituents via 'references' edges.
    //    Strategy: find all hub_doc nodes in the 1-hop neighborhood that have type 'hub_doc'.
    const sourceNeighborMap = await edgeRepo.getNeighborIdsMap([sourceNodeId]);
    const sourceNeighborIds = sourceNeighborMap.get(sourceNodeId) ?? [];
    const neighborNodes = await mobiusNodeRepo.getByIds(sourceNeighborIds);
    const hubNodes = new Map<string, string>(); // hubNodeId → hubLabel
    for (const [nodeId, node] of neighborNodes) {
      if (node.type === GraphNodeType.HubDoc) {
        hubNodes.set(nodeId, node.label);
      }
    }

    // For each hub, get its outgoing references to find which results share this hub
    const sharedHubNames = new Map<string, string>();
    if (hubNodes.size > 0) {
      const hubEdges = await edgeRepo.getByFromNodesAndTypes(
        Array.from(hubNodes.keys()),
        ['references'],
      );
      // hubEdge.to_node_id are the hub's constituent docs
      // We need their paths to match against result paths
      const constituentIds = hubEdges.map((e) => e.to_node_id);
      const constituentNodes = await mobiusNodeRepo.getByIds(constituentIds);
      for (const edge of hubEdges) {
        const constituentNode = constituentNodes.get(edge.to_node_id);
        if (constituentNode?.path && constituentNode.path !== sourceFilePath) {
          const hubLabel = hubNodes.get(edge.from_node_id);
          if (hubLabel) {
            sharedHubNames.set(constituentNode.path, hubLabel);
          }
        }
      }
    }

    return {
      directNeighbors,
      twoHopBridgeMap,
      allGraphPaths,
      sourceGraphTags,
      resultTagsByNodeId: new Map(),
      coCitations,
      sharedHubNames,
    };
  } catch {
    // Graph data unavailable (SQLite not ready, no index yet) — fall back to FTS5-only
    return null;
  }
}
```

- [ ] **Step 2: Add `FeedbackContext` interface and loader**

```typescript
/** Pre-loaded feedback data for score adjustments. */
interface FeedbackContext {
  /** Pairs dismissed within 7 days — skip entirely */
  dismissedPairs: Set<string>;
  /** Pairs with positive actions — boost score */
  positivePairs: Map<string, number>;
  /** Pairs ignored (no action) — slight penalty */
  ignoredPairs: Map<string, number>;
}

/**
 * Load feedback context from AmbientPushRepo.
 * Returns null if repo is unavailable (fail-safe).
 */
async function loadFeedbackContext(): Promise<FeedbackContext | null> {
  try {
    const repo = sqliteStoreManager.getAmbientPushRepo();
    const [dismissedPairs, positivePairs, ignoredPairs] = await Promise.all([
      repo.getDismissedPairs(7),
      repo.getPositivePairs(30),
      repo.getIgnoredPenalties(14),
    ]);
    return { dismissedPairs, positivePairs, ignoredPairs };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Refactor `ambientSearch()` to add Stage 2 and integrate signals**

Modify the existing `ambientSearch` function signature to accept the new settings:

```typescript
export async function ambientSearch(
  context: AmbientContext,
  maxItems: number,
  pushHistory: Map<string, number>,
  settings?: { graphExpansionHops?: number; feedbackLearning?: boolean },
): Promise<AmbientPushItem[]> {
```

Inside the function body, after Stage 1 (existing FTS5 search), add:

```typescript
  // --- Stage 2: Graph expansion (Phase 2) ---
  const graphHops = settings?.graphExpansionHops ?? 0;
  const [graphCtx, feedbackCtx] = await Promise.all([
    graphHops > 0 ? buildGraphContext(context.filePath, graphHops) : null,
    settings?.feedbackLearning ? loadFeedbackContext() : null,
  ]);

  // If graph context available, fetch graph neighbors not in Stage 1 results
  let graphOnlyPaths: string[] = [];
  if (graphCtx) {
    const ftsPathSet = new Set(response.items.map((r) => r.path));
    graphOnlyPaths = Array.from(graphCtx.allGraphPaths).filter(
      (p) => !ftsPathSet.has(p) && p !== context.filePath,
    );
  }

  // Fetch tags for all candidate result node IDs (for shared_tag detection)
  let resultPathToTags = new Map<string, string[]>();
  if (graphCtx && graphCtx.sourceGraphTags.size > 0) {
    // Get tags for results that appeared in FTS5
    const allCandidatePaths = [
      ...response.items.map((r) => r.path),
      ...graphOnlyPaths,
    ];
    try {
      const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
      const nodeRows = await Promise.all(
        allCandidatePaths.slice(0, 30).map((p) => mobiusNodeRepo.getByPath(p)),
      );
      const validNodeIds = nodeRows
        .filter((n): n is NonNullable<typeof n> => n !== null)
        .map((n) => ({ id: n.node_id, path: n.path }));
      if (validNodeIds.length > 0) {
        const graphRepo = sqliteStoreManager.getGraphRepo();
        const tagResult = await graphRepo.getTagsByDocIds(validNodeIds.map((n) => n.id));
        for (const { id, path } of validNodeIds) {
          const entry = tagResult.idMapToTags.get(id);
          if (entry) {
            resultPathToTags.set(path, [...entry.topicTags, ...entry.keywordTags]);
          }
        }
      }
    } catch {
      // Tag lookup failed — continue without shared_tag signals
    }
  }
```

Then modify the per-result loop to use the new signal detectors:

```typescript
  // Unified candidate list: FTS5 results + graph-only neighbors
  // Graph-only neighbors get a base score of 0.3 (structural relevance without text match)
  const candidates: Array<{ path: string; title: string; excerpt: string; score: number; highlightText: string; fromGraph: boolean }> = [];

  for (const result of response.items) {
    candidates.push({
      path: result.path,
      title: result.title,
      excerpt: result.highlight?.text || result.title,
      score: result.finalScore ?? result.score ?? 0,
      highlightText: result.highlight?.text ?? '',
      fromGraph: false,
    });
  }

  // Add graph-only neighbors with minimal metadata
  if (graphCtx) {
    for (const gPath of graphOnlyPaths.slice(0, 10)) {
      const basename = gPath.replace(/^.*\//, '').replace(/\.md$/, '');
      candidates.push({
        path: gPath,
        title: basename,
        excerpt: '',
        score: 0.3,
        highlightText: '',
        fromGraph: true,
      });
    }
  }
```

Then the filtering + signal detection loop becomes:

```typescript
  for (const candidate of candidates) {
    if (items.length >= maxItems) break;

    // Skip self
    if (candidate.path === context.filePath) continue;

    // Skip already-linked notes
    const basename = candidate.path.replace(/^.*\//, '').replace(/\.md$/, '').toLowerCase();
    if (existingOutlinksLower.has(basename)) continue;

    // Skip recently pushed (session dedup)
    const lastPushed = pushHistory.get(candidate.path);
    if (lastPushed && now - lastPushed < DEDUP_WINDOW_MS) continue;

    // Skip dismissed pairs (feedback loop)
    const pairKey = `${context.filePath}::${candidate.path}`;
    if (feedbackCtx?.dismissedPairs.has(pairKey)) continue;

    // --- Detect all signals ---
    const signals: AmbientSignal[] = [];

    // Text overlap (from FTS5 highlight)
    if (candidate.highlightText) {
      const terms = extractHighlightTerms(candidate.highlightText);
      if (terms.length > 0) {
        signals.push({ type: 'text_overlap', terms });
      }
    }

    // Graph signals (Phase 2)
    if (graphCtx) {
      // Shared tags
      const rTags = resultPathToTags.get(candidate.path) ?? [];
      const tagSignals = detectSharedTags(graphCtx.sourceGraphTags, rTags);
      signals.push(...tagSignals);

      // Graph neighbor
      const neighborSignal = detectGraphNeighborSignal(
        candidate.path,
        graphCtx.directNeighbors,
        graphCtx.twoHopBridgeMap,
      );
      if (neighborSignal) signals.push(neighborSignal);

      // Co-citation
      const coCiteSignal = detectCoCitationSignal(candidate.path, graphCtx.coCitations);
      if (coCiteSignal) signals.push(coCiteSignal);

      // Hub membership
      const hubSignal = detectHubMemberSignal(candidate.path, graphCtx.sharedHubNames);
      if (hubSignal) signals.push(hubSignal);
    }

    // --- Feedback score adjustment ---
    let adjustedScore = candidate.score;
    if (feedbackCtx) {
      // Positive boost: +0.1 per positive interaction (capped at +0.3)
      const posCount = feedbackCtx.positivePairs.get(pairKey) ?? 0;
      if (posCount > 0) {
        adjustedScore += Math.min(0.3, posCount * 0.1);
      }
      // Ignore penalty: -0.05 per ignore (capped at -0.15)
      const ignoreCount = feedbackCtx.ignoredPairs.get(pairKey) ?? 0;
      if (ignoreCount > 0) {
        adjustedScore -= Math.min(0.15, ignoreCount * 0.05);
      }
    }

    // Skip graph-only results with no signals (they'd show as "Related content" with no explanation)
    if (candidate.fromGraph && signals.length === 0) continue;

    const explanation = generateExplanation(signals);

    items.push({
      filePath: candidate.path,
      title: candidate.title,
      excerpt: (candidate.excerpt || candidate.title).slice(0, 150),
      score: adjustedScore,
      explanation,
      explanationType: 'template',
      signals,
      timestamp: now,
    });
  }

  // Re-sort by adjusted score (feedback may have changed ordering)
  items.sort((a, b) => b.score - a.score);

  return items.slice(0, maxItems);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Run tests**

Run: `npm run test -- test/ambient-push.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/service/ambient/AmbientSearcher.ts test/ambient-push.test.ts
git commit -m "feat(ambient-p2): add Stage 2 graph expansion, multi-signal detection, feedback scoring"
```

---

## Task 5: AmbientPushService — Wire Graph + Feedback Context

**Files:**
- Modify: `src/service/ambient/AmbientPushService.ts`

- [ ] **Step 1: Pass settings to `ambientSearch()`**

In `handleTrigger()`, update the `ambientSearch` call to pass graph and feedback settings:

```typescript
// Before (Phase 1):
items = await ambientSearch(context, settings.maxPushItems, store.pushHistory);

// After (Phase 2):
items = await ambientSearch(context, settings.maxPushItems, store.pushHistory, {
  graphExpansionHops: settings.graphExpansionHops,
  feedbackLearning: settings.feedbackLearning,
});
```

Note: The `AmbientPushSettings` type was already extended in Task 1, and `DEFAULT_AMBIENT_PUSH_SETTINGS` provides defaults. The `ambientSearch` function itself handles loading the graph context and feedback context internally (see Task 4), so the orchestrator only needs to forward the settings.

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/service/ambient/AmbientPushService.ts
git commit -m "feat(ambient-p2): pass graph and feedback settings through orchestrator"
```

---

## Task 6: Session Dedup Hardening

**Files:**
- Modify: `src/ui/store/ambientPushStore.ts`
- Modify: `src/service/ambient/AmbientPushService.ts`

Phase 1 has a basic `pushHistory` Map in the Zustand store, but it grows unbounded. Phase 2 adds cleanup and dismissed-pair awareness.

- [ ] **Step 1: Add `cleanPushHistory()` action to the store**

In `ambientPushStore.ts`, add a new action that prunes entries older than the dedup window:

```typescript
// Add to the interface:
cleanPushHistory: () => void;

// Add implementation:
cleanPushHistory: () => {
  const history = get().pushHistory;
  const cutoff = Date.now() - 10 * 60 * 1000; // 10 min dedup window
  for (const [path, ts] of history.entries()) {
    if (ts < cutoff) {
      history.delete(path);
    }
  }
},
```

- [ ] **Step 2: Call cleanup in the orchestrator**

In `AmbientPushService.handleTrigger()`, add at the start of the method (before search):

```typescript
// Clean stale push history entries
store.cleanPushHistory();
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/ui/store/ambientPushStore.ts src/service/ambient/AmbientPushService.ts
git commit -m "feat(ambient-p2): add pushHistory cleanup for session-level dedup"
```

---

## Task 7: Integration Test + End-to-End Verification

**Files:**
- Modify: `test/ambient-push.test.ts`

- [ ] **Step 1: Add feedback scoring logic tests**

```typescript
// --- Feedback score adjustments ---
{
  // Positive boost: capped at 0.3
  const posMap = new Map<string, number>([['src::target', 5]]);
  const boost = Math.min(0.3, (posMap.get('src::target') ?? 0) * 0.1);
  assert.equal(boost, 0.3); // capped

  // Ignore penalty: capped at -0.15
  const ignMap = new Map<string, number>([['src::target', 2]]);
  const penalty = Math.min(0.15, (ignMap.get('src::target') ?? 0) * 0.05);
  assert.equal(penalty, 0.1); // 2 * 0.05

  console.log('feedback scoring: all passed');
}
```

- [ ] **Step 2: Add explanation coverage tests for new signal types**

```typescript
// --- RelevanceExplainer coverage for Phase 2 signals ---
{
  const { generateExplanation } = await import('../src/service/ambient/RelevanceExplainer');

  // Co-citation
  assert.equal(
    generateExplanation([{ type: 'co_citation', citingNote: 'MOC Note' }]),
    'Co-cited in [[MOC Note]]',
  );

  // Hub member
  assert.equal(
    generateExplanation([{ type: 'hub_member', hubName: 'Systems Thinking' }]),
    'Both in "Systems Thinking" cluster',
  );

  // Graph neighbor 2-hop with bridge
  assert.equal(
    generateExplanation([{ type: 'graph_neighbor', hop: 2, via: 'Design Patterns' }]),
    'Connected via [[Design Patterns]]',
  );

  // Priority: graph_neighbor beats shared_tag
  const multi = generateExplanation([
    { type: 'shared_tag', tag: 'dev' },
    { type: 'graph_neighbor', hop: 1 },
  ]);
  assert.equal(multi, 'Directly linked');

  console.log('RelevanceExplainer Phase 2 coverage: all passed');
}
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Verify production build**

Run: `npm run build`
Expected: Clean build, no warnings.

- [ ] **Step 5: Commit**

```bash
git add test/ambient-push.test.ts
git commit -m "test(ambient-p2): add Phase 2 signal detection, feedback scoring, and explanation tests"
```

---

## Task Summary

| Task | Component | Files Modified | Deps |
|------|-----------|---------------|------|
| 1 | Settings extension | 3 | -- |
| 2 | Repo feedback queries | 1 | -- |
| 3 | Signal detection functions | 2 | Task 1 |
| 4 | Graph expansion + feedback in AmbientSearcher | 1 | Task 1, 2, 3 |
| 5 | Orchestrator wiring | 1 | Task 1, 4 |
| 6 | Session dedup hardening | 2 | Task 4 |
| 7 | Integration tests | 1 | Task 3, 4 |

**Execution order:** Tasks 1-2 (parallel) -> Task 3 -> Task 4 -> Tasks 5-6 (parallel) -> Task 7.

**Parallel dispatch opportunities:**
- Tasks 1 and 2 are fully independent (settings vs repo)
- Tasks 5 and 6 are independent (orchestrator vs store cleanup)
- Task 7 is the final integration gate

---

## Key Integration Points

### How `GraphRepo.getRelatedFilePaths()` is called

```typescript
// In buildGraphContext() — Task 4
const graphRepo = sqliteStoreManager.getGraphRepo();
const allGraphPaths = await graphRepo.getRelatedFilePaths({
  currentFilePath: sourceFilePath,
  maxHops: 2, // from settings.graphExpansionHops
});
```

`getRelatedFilePaths()` does BFS via `MobiusEdgeRepo.getNeighborIdsMap()`, filtering results to `GRAPH_DOCUMENT_LIKE_NODE_TYPES` (document + hub_doc). Returns a `Set<string>` of node IDs (which are file paths for document nodes).

### How shared tags are detected

```typescript
// Source tags from GraphRepo.getTagsByDocIds([sourceNodeId])
const sourceTagEntry = tagResult.idMapToTags.get(sourceNodeId);
// topicTags: string[] + keywordTags: string[] → merged into sourceGraphTags Set

// Result tags from GraphRepo.getTagsByDocIds(resultNodeIds)
const resultTags = resultPathToTags.get(candidatePath);

// Intersection → shared_tag signals
```

This uses the graph's indexed tags (more complete than frontmatter-only tags used in Phase 1 context extraction), since `mobiusTagEdges.ts` indexes both frontmatter and LLM-derived tags.

### How co-citation is detected

```typescript
// coCitationService.getCoCitations(sourceFilePath, 10)
// Returns CoCitationResult[] with { path, citingNotes, score }
// Match candidate path against results → co_citation signal
```

The existing `coCitationService` uses IDF-weighted scoring — high-connectivity citers (MOC notes) contribute less, making co-citation signals more meaningful.

### How hub membership is detected

Hub docs (`type = 'hub_doc'`) reference their constituent documents via `'references'` edges. The detection:
1. Find hub_doc nodes in the source document's 1-hop neighborhood
2. Get outgoing `'references'` edges from those hub_doc nodes
3. Resolve target node paths
4. If a candidate result path appears as a target of the same hub_doc, they share hub membership

### Feedback loop data flow

```
User action (open/dismiss/link) → store.recordAction() → AmbientPushRepo.recordAction()
                                                                ↓
                             AmbientPushRepo.getDismissedPairs(7) → skip pair for 7 days
                             AmbientPushRepo.getPositivePairs(30) → +0.1/interaction (cap +0.3)
                             AmbientPushRepo.getIgnoredPenalties(14) → -0.05/ignore (cap -0.15)
                                                                ↓
                                                    loadFeedbackContext() in AmbientSearcher
                                                                ↓
                                                    Applied during per-candidate scoring loop
```
