# Inspector Tools Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the 11 search graph inspector tools: eliminate MarkdownOnly variant duplication, add type safety (`params: any` to typed), fix implementation bugs (double-filter, redundant DB query, token inflation), unify `limit` semantics, restructure `find_path`, improve `searchByDimensions` error granularity, move hardcoded values to constants/config, rewrite tool descriptions, and add an inter-tool selection guide to the recon system prompt.

**Architecture:** Four-layer overhaul applied bottom-up: (1) Foundation — constants, types, dead code; (2) Schema — `limit` unification, `find_path` strategy exposure, error granularity; (3) Implementation — per-tool fixes; (4) Integration — tool factory refactoring, recon wiring, descriptions, system prompt guide.

**Spec:** `docs/superpowers/specs/2026-04-10-search-inspector-tools-overhaul-design.md`

**Tech Stack:** Zod (schemas), TypeScript (strict params), TemplateManager (config loading)

**Branch:** `feat/inspector-overhaul`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `templates/config/time-within-normalize.json` | Runtime-editable time normalization map |
| `src/service/tools/search-graph-inspector/find-path/reliable.ts` | Bidirectional BFS, physical edges only |
| `src/service/tools/search-graph-inspector/find-path/fast-track.ts` | A* with semantic gravity field |
| `src/service/tools/search-graph-inspector/find-path/brainstorm.ts` | Cross-domain bridge discovery |
| `src/service/tools/search-graph-inspector/find-path/scorer.ts` | Shared path quality scoring |
| `src/service/tools/search-graph-inspector/find-path/index.ts` | Entry point, strategy routing |

### Modified Files

| File | Change |
|------|--------|
| `src/core/constant.ts` | Add `GRAPH_TRAVERSAL_EDGES_PER_NODE`, `GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY`, `ORPHAN_FETCH_LIMIT`, `EXPLORE_FOLDER_DEFAULT_LIMIT`; update `GRAPH_RRF_WEIGHTS` comment |
| `src/core/schemas/tools/searchGraphInspector.ts` | Schema redesign: `limit` unification, `find_path` strategy/max_paths, `BaseLimit.limit` desc, `SemanticFilter.topK` max 30, minor cleanup |
| `src/core/template/TemplateRegistry.ts` | Add `ConfigTemplateId.TimeWithinNormalize` |
| `src/service/tools/search-graph-inspector.ts` | Delete 6 MarkdownOnly exports; add `forceFormat` option to 3 tool factories; rewrite all tool descriptions |
| `src/service/tools/search-graph-inspector/common.ts` | Delete dead `tagsTripleMap` branch in `getDefaultItemFiledGetter` |
| `src/service/tools/search-graph-inspector/graph-traversal.ts` | Type params; output by `response_format`; add `internalOpts`; semantic decay to constant |
| `src/service/tools/search-graph-inspector/inspect-note-context.ts` | Type params |
| `src/service/tools/search-graph-inspector/find-path.ts` | Deleted — restructured into `find-path/` directory |
| `src/service/tools/search-graph-inspector/find-key-nodes.ts` | Type params; remove redundant DB query |
| `src/service/tools/search-graph-inspector/find-orphans.ts` | Fix double-filter bug; type params |
| `src/service/tools/search-graph-inspector/search-by-dimensions.ts` | Type params; structured diagnostic output on zero results |
| `src/service/tools/search-graph-inspector/explore-folder.ts` | Type params; `DEFAULT_LIMIT` to constant |
| `src/service/tools/search-graph-inspector/local-search.ts` | Type params |
| `src/service/tools/search-graph-inspector/recent-change-whole-vault.ts` | Type params |
| `src/service/agents/intuition-helper/intuition.recon.ts` | Update imports to use `forceFormat` option instead of MarkdownOnly variants |
| `templates/prompts/knowledge-intuition-plan-system.md` | Add tool selection guide section |

---

## Task 1: Foundation Constants

Add new constants to `constant.ts` and create the `time-within-normalize.json` config template.

**Files:**
- Modify: `src/core/constant.ts:256` (after `PATH_FINDING_CONSTANTS`)
- Create: `templates/config/time-within-normalize.json`
- Modify: `src/core/template/TemplateRegistry.ts:123-124`

- [ ] **Step 1: Add inspector constants to `constant.ts`**

After `PATH_FINDING_CONSTANTS` block (around line 256), add:

```ts
/** Per-node edge query limit for graph traversal (decoupled from user-facing `limit`). */
export const GRAPH_TRAVERSAL_EDGES_PER_NODE = 50;

/**
 * Semantic neighbor limit for BFS depth > 0. Index = depth-1.
 * depth=0 uses the full `limit` param; depth=1 -> 3; depth=2 -> 1.
 */
export const GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY = [3, 1] as const;

/** Internal fetch size for orphan candidate pool (decoupled from user-facing `limit`). */
export const ORPHAN_FETCH_LIMIT = 200;

/** Default per-folder item cap for explore_folder tool. */
export const EXPLORE_FOLDER_DEFAULT_LIMIT = 50;
```

- [ ] **Step 2: Update `GRAPH_RRF_WEIGHTS` comment**

In `constant.ts:206-212`, replace the TODO comment block:

```ts
/**
 * TODO: Turn these constants into configuration options...
 */
```

with:

```ts
/**
 * Graph Inspector RRF weights for document node ranking.
 * Compiled defaults; not runtime-configurable by design.
 * Weights are applied to each ranking dimension in the RRF formula.
 */
```

- [ ] **Step 3: Create `templates/config/` directory and `time-within-normalize.json`**

Create directory `templates/config/` if it doesn't exist, then create file:

```json
{
  "last_3_years": "this_year",
  "last_2_years": "this_year",
  "last_year": "this_year",
  "last_6_months": "last_3_months",
  "last_month": "this_month",
  "last_week": "this_week",
  "recent": "this_month"
}
```

- [ ] **Step 4: Register `ConfigTemplateId.TimeWithinNormalize` in TemplateRegistry**

In `src/core/template/TemplateRegistry.ts:123`, add to the `ConfigTemplateId` object:

```ts
export const ConfigTemplateId = {
    TimeWithinNormalize: 'time-within-normalize' as const,
} as const;
```

And in the `TEMPLATE_METADATA` map (find the config section, or add at the end of the map), add:

```ts
[ConfigTemplateId.TimeWithinNormalize]: meta('config', 'time-within-normalize', { expectsJson: true }),
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/core/constant.ts templates/config/time-within-normalize.json src/core/template/TemplateRegistry.ts
git commit -m "refactor(inspector): add inspector constants and time-within-normalize config template"
```

---

## Task 2: Schema Redesign

Update Zod schemas: unify `limit` semantics, redesign `findPathInputSchema`, fix minor schema issues, prepare for typed params.

**Files:**
- Modify: `src/core/schemas/tools/searchGraphInspector.ts`

- [ ] **Step 1: Update `TIME_WITHIN_NORMALIZE` to support template loading**

At the top of `searchGraphInspector.ts`, after the `TIME_WITHIN_NORMALIZE` constant (line 29-37), add a mutable cache + setter pattern:

```ts
/** Mutable cache for runtime-loaded normalize map; initializes to compiled defaults. */
let timeWithinNormalizeMap: Record<string, string> = { ...TIME_WITHIN_NORMALIZE };

/** Called by TemplateManager after loading time-within-normalize.json. */
export function setTimeWithinNormalizeMap(loaded: Record<string, string>): void {
    timeWithinNormalizeMap = loaded;
}
```

Then update `normalizeTimeWithin` (line 39-47) to read from the mutable cache:

```ts
export function normalizeTimeWithin(
    val: unknown
): (typeof TIME_WITHIN_VALUES)[number] | null {
    if (val == null) return null;
    const s = String(val).trim().toLowerCase();
    if (TIME_WITHIN_VALUES.includes(s as (typeof TIME_WITHIN_VALUES)[number]))
        return s as (typeof TIME_WITHIN_VALUES)[number];
    return (timeWithinNormalizeMap[s] as (typeof TIME_WITHIN_VALUES)[number]) ?? "this_year";
}
```

- [ ] **Step 2: Update `BaseLimit.limit` description**

In `BaseLimit` (line 101-111), change the `limit` description from:

```ts
.describe("Maximum number of results(each step inner also. not so strictly.)")
```

to:

```ts
.describe("Maximum number of results returned to the agent.")
```

- [ ] **Step 3: Update `SemanticFilter.topK` max**

In `SemanticFilter` (line 76-88), change `.max(50)` to `.max(30)`:

```ts
topK: z
    .number()
    .min(1)
    .max(30)
    .default(20)
    .describe("Number of top similar nodes to keep"),
```

- [ ] **Step 4: Redesign `findPathInputSchema`**

Replace the `findPathInputSchema` (line 181-193) entirely:

```ts
export const findPathInputSchema = z.object({
    start_note_path: z.string().min(1, 'start_note_path must be a non-empty vault path — retry with a valid path'),
    end_note_path: z.string().min(1, 'end_note_path must be a non-empty vault path — retry with a valid path'),
    strategy: z
        .enum(["reliable", "fastTrack", "brainstorm"])
        .default("reliable")
        .describe(
            "Path-finding strategy:\n" +
            "- 'reliable' — bidirectional BFS on physical links only. Fast, deterministic. " +
            "Use when you need the shortest actual wiki-link chain between two notes.\n" +
            "- 'fastTrack' — A* guided by semantic gravity. Finds conceptually coherent paths " +
            "even if physically longer. Use when direct links are sparse.\n" +
            "- 'brainstorm' — forces cross-domain jumps to surface unexpected bridges between concepts. " +
            "Use for creative discovery, not for precise relationship mapping."
        ),
    max_paths: z
        .number().min(1).max(5).default(3)
        .describe("Maximum number of distinct paths to return. Higher values increase computation time."),
    filters: NullableFilterOption,
    include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
    response_format: ResponseFormat.shape.response_format.default("structured"),
});
```

Note: `findPathInputSchema` no longer extends `BaseLimit`. The old `limit` param is replaced by `max_paths`.

- [ ] **Step 5: Update `graphTraversalInputSchema.limit` description**

In `graphTraversalInputSchema` (line 170-178), change the `limit` description:

```ts
limit: z
    .number()
    .min(1)
    .max(100)
    .nullable()
    .default(15)
    .describe(
        "Maximum number of document nodes returned per depth level."
    ),
```

- [ ] **Step 6: Clean up `searchByDimensionsInputSchema`**

In `searchByDimensionsInputSchema` (line 230-236), simplify the filters field from:

```ts
filters: FilterOption.omit({ 
    // tag_category_boolean_expression: true
 }).nullable(),
```

to:

```ts
filters: FilterOption.nullable(),
```

- [ ] **Step 7: Fix `localSearchWholeVaultInputSchema` double `.nullable()`**

In `localSearchWholeVaultInputSchema` (line 302-310), remove the duplicate `.nullable()` calls:

Change `current_file_path` from `.nullable().nullable()` to `.nullable()`.
Change `folder_path` from `.nullable().nullable()` to `.nullable()`.

- [ ] **Step 8: Update `ResponseFormat.hybrid` description**

In `ResponseFormat` (line 90-99), update to remove the context overflow warning from the hybrid description:

```ts
response_format: z
    .enum(["structured", "markdown", "hybrid"])
    .default("hybrid")
    .describe(
        "Choose 'markdown' if you need to reason about relationships, summarize content, or present findings. " +
        "Choose 'structured' if you are performing multi-step operations for programmatic piping (e.g., getting IDs for another tool). " +
        "Choose 'hybrid' if you need to get both data and context."
    ),
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build may show errors in `find-path.ts` due to schema change (expected — will be fixed in Task 5).

- [ ] **Step 10: Commit**

```bash
git add src/core/schemas/tools/searchGraphInspector.ts
git commit -m "refactor(inspector): redesign schemas — unify limit semantics, find_path strategy exposure, minor fixes"
```

---

## Task 3: Dead Code Cleanup + `common.ts` Fix

Remove dead code branches and fix the `tagsTripleMap` dead-code guard in `common.ts`.

**Files:**
- Modify: `src/service/tools/search-graph-inspector/common.ts:154-158`

- [ ] **Step 1: Remove dead `tag_category_boolean_expression` branch**

In `common.ts:156`, the `getDefaultItemFiledGetter` function queries `tagsTripleMap` only when `filters?.tag_category_boolean_expression` is truthy. Since `tag_category_boolean_expression` is commented out of the `FilterOption` schema, this branch is never taken. However, `shouldIncludeItem` still calls `getCachedBooleanExpression(filters?.tag_category_boolean_expression)` at line 226, so the filter actually works via a different code path. The `tagsTripleMap` branch in `getDefaultItemFiledGetter` is truly dead.

Change `common.ts:156-158` from:

```ts
const tagsTripleMap = filters?.tag_category_boolean_expression
    ? (await sqliteStoreManager.getGraphRepo().getTagsByDocIds(nodeIds)).idMapToTags
    : emptyMap();
```

to:

```ts
// tag_category_boolean_expression is not in the public schema; tag data is resolved
// downstream in shouldIncludeItem via getCachedBooleanExpression.
const tagsTripleMap = emptyMap();
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/tools/search-graph-inspector/common.ts
git commit -m "refactor(inspector): remove dead tagsTripleMap branch in getDefaultItemFiledGetter"
```

---

## Task 4: `find_orphans` Double-Filter Bug Fix

Fix the double `applyFiltersAndSorters` call that applies `limit` twice.

**Files:**
- Modify: `src/service/tools/search-graph-inspector/find-orphans.ts`

- [ ] **Step 1: Fix the double-filter bug**

Replace the body of `findOrphanNotes` (lines 10-59) with:

```ts
export async function findOrphanNotes(params: any, templateManager?: TemplateManager) {
    const { filters, sorter, limit, response_format } = params;
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    const hardOrphanIds = await mobiusEdgeRepo.getHardOrphans(ORPHAN_FETCH_LIMIT);
    let candidateAllOrphanNodes: OrphanNode[] = [];
    if (hardOrphanIds.length > 0) {
        const hardOrphanNodeMap = await mobiusNodeRepo.getByIds(hardOrphanIds);
        candidateAllOrphanNodes = Array.from(hardOrphanNodeMap.values()).map(node => ({
            ...node,
            orphanType: 'hard'
        }));
    }

    // NOT YET IMPLEMENTED: soft orphan detection (requires low-degree index)

    // Apply filters, sorting, and limit ONCE
    const itemFiledGetter = await getDefaultItemFiledGetter<OrphanNode>(
        candidateAllOrphanNodes.map(node => node.id), filters, sorter
    );
    const finalAllOrphanNodes = applyFiltersAndSorters(
        candidateAllOrphanNodes, filters, sorter, limit, itemFiledGetter
    );

    // Find revival suggestions for all orphans
    const orphanRevivalSuggestions = await findRevivalSuggestions(finalAllOrphanNodes);

    const hardOrphans = finalAllOrphanNodes.map((orphan: any, i: number) => {
        const suggestion = orphanRevivalSuggestions.get(orphan.id);
        return {
            index: i + 1,
            modified: orphan.modified,
            label: orphan.label,
            revival_suggestion: suggestion ? {
                title: suggestion.suggestedNode.title,
                reason: suggestion.reason
            } : null
        };
    });

    const data = {
        total_count: candidateAllOrphanNodes.length,
        filtered_count: finalAllOrphanNodes.length,
        hard_orphans: hardOrphans,
    };
    return buildResponse(response_format, ToolTemplateId.OrphanNotes, data, { templateManager });
}
```

Add the import for `ORPHAN_FETCH_LIMIT`:

```ts
import { ORPHAN_FETCH_LIMIT } from "@/core/constant";
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/tools/search-graph-inspector/find-orphans.ts
git commit -m "fix(inspector): remove double applyFiltersAndSorters in find_orphans; use ORPHAN_FETCH_LIMIT constant"
```

---

## Task 5: `find_path` Restructure — Split into Strategy Modules

Restructure `find-path.ts` (987 lines) into a directory with per-strategy files and remove the `temporal` strategy.

**Files:**
- Delete: `src/service/tools/search-graph-inspector/find-path.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/index.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/reliable.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/fast-track.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/brainstorm.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/scorer.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/service/tools/search-graph-inspector/find-path
```

- [ ] **Step 2: Create `find-path/scorer.ts`**

Extract from existing `find-path.ts` these shared utilities:
- `PathSegment` interface (remove `timestamp` and `folderPath` fields)
- `NeighborNode` interface
- `ScoredPath` interface
- `PathScore` interface
- `EDGE_WEIGHTS`, `SIMILARITY_THRESHOLD`, `SCORE_WEIGHTS` constants
- `PATH_STRING_SEPARATOR` constant
- `createEmptyScore()`, `scorePaths()`, `calculateUniqueness()`, `countDomainJumps()`, `generatePathReasoning()`, `identifyKeyEdge()`, `deduplicatePaths()`, `ensureStrategyDiversity()` functions
- `getNodeLabel()`, `getParentFolder()` helpers
- `getPhysicalNeighbors()`, `getNeighbors()` functions
- `reconstructPath()`, `reconstructVisitedPath()` functions
- `applyNeighborFilters()` function

Key changes:
- `StrategyType` becomes `'reliable' | 'fastTrack' | 'brainstorm'` (remove `'temporal'`)
- `PathSegment` removes `timestamp` and `folderPath` fields
- `STRATEGY_NAMES` removes `temporal` entry
- `ensureStrategyDiversity` iterates only `['reliable', 'fastTrack', 'brainstorm']`

- [ ] **Step 3: Create `find-path/reliable.ts`**

Extract `reliableStrategy()` and `bidirectionalBFS()` + `expandFrontier()` from existing code. The function signatures stay the same but import types from `scorer.ts`.

```ts
// find-path/reliable.ts
import type { ScoredPath, SearchContext } from './scorer';
import { createEmptyScore, bidirectionalBFS, identifyKeyEdge } from './scorer';

export async function reliableStrategy(context: SearchContext): Promise<ScoredPath[]> {
    // ... existing code unchanged
}
```

- [ ] **Step 4: Create `find-path/fast-track.ts`**

Extract `fastTrackStrategy()`, `aStarSearch()`, `MinHeap`, `calculateHeuristic()`, `cosineSimilarity()`, `reconstructAStarPath()`, and `fallbackStrategy()`.

```ts
// find-path/fast-track.ts
import type { ScoredPath, SearchContext } from './scorer';
export async function fastTrackStrategy(context: SearchContext): Promise<ScoredPath[]> { ... }
export async function fallbackStrategy(context: SearchContext): Promise<ScoredPath[]> { ... }
```

- [ ] **Step 5: Create `find-path/brainstorm.ts`**

Extract `brainstormStrategy()`. Remove all temporal-related code (no more `segment.timestamp`).

```ts
// find-path/brainstorm.ts
import type { ScoredPath, SearchContext } from './scorer';
export async function brainstormStrategy(context: SearchContext): Promise<ScoredPath[]> { ... }
```

- [ ] **Step 6: Create `find-path/index.ts`**

This is the main entry point. It reads `params.strategy` (from new schema field) and delegates to the appropriate strategy. Also reads `params.max_paths` instead of `params.limit`.

```ts
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GRAPH_INSPECT_STEP_TIME_LIMIT, PATH_FINDING_CONSTANTS } from "@/core/constant";
import { buildResponse, withTimeoutMessage } from "../../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import type { SearchContext, ScoredPath, HubAnalysis } from './scorer';
import { scorePaths, deduplicatePaths, ensureStrategyDiversity, generatePathReasoning, getNodeLabel, analyzeHubs, analyzeContextIntersection, formatPathsForOutput, buildAnalysisSection } from './scorer';
import { reliableStrategy } from './reliable';
import { fastTrackStrategy, fallbackStrategy } from './fast-track';
import { brainstormStrategy } from './brainstorm';

export async function findPath(params: any, templateManager?: TemplateManager) {
    const { start_note_path, end_note_path, strategy, max_paths, include_semantic_paths, response_format, filters } = params;
    // ... same validation as before ...
    
    // Build search context
    const context: SearchContext = { ... };
    
    // Execute strategy based on params.strategy
    const allPaths: ScoredPath[] = [];
    
    switch (strategy ?? 'reliable') {
        case 'reliable':
            allPaths.push(...await reliableStrategy(context));
            break;
        case 'fastTrack':
            if (context.startVector && context.endVector) {
                allPaths.push(...await fastTrackStrategy(context));
            }
            // Fallback to reliable if no semantic vectors
            if (allPaths.length === 0) {
                allPaths.push(...await reliableStrategy(context));
            }
            break;
        case 'brainstorm':
            allPaths.push(...await brainstormStrategy(context));
            break;
    }
    
    // Fallback if nothing found
    if (allPaths.length === 0) {
        allPaths.push(...await fallbackStrategy(context));
    }
    
    // Score, deduplicate, format — same as before but using max_paths instead of limit
    const uniquePaths = deduplicatePaths(allPaths);
    const scoredPaths = await scorePaths(uniquePaths, allPaths);
    // ... format and return using max_paths (default 3)
}
```

- [ ] **Step 7: Delete old `find-path.ts`**

```bash
git rm src/service/tools/search-graph-inspector/find-path.ts
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: Build succeeds. The import in `search-graph-inspector.ts` line 11 (`import { findPath } from "./search-graph-inspector/find-path"`) still resolves because `find-path/index.ts` exports `findPath`.

- [ ] **Step 9: Commit**

```bash
git add src/service/tools/search-graph-inspector/find-path/
git add -u src/service/tools/search-graph-inspector/find-path.ts
git commit -m "refactor(inspector): restructure find_path into strategy modules; remove temporal strategy"
```

---

## Task 6: `graph_traversal` Token Inflation Fix

Add `response_format`-aware output and `internalOpts` for UI callers; use constants for edge query and semantic decay.

**Files:**
- Modify: `src/service/tools/search-graph-inspector/graph-traversal.ts`

- [ ] **Step 1: Add imports for new constants**

At the top of `graph-traversal.ts`, add:

```ts
import { GRAPH_INSPECT_STEP_TIME_LIMIT, GRAPH_TRAVERSAL_EDGES_PER_NODE, GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY } from "@/core/constant";
```

(Remove `GRAPH_INSPECT_STEP_TIME_LIMIT` from the existing import if it's already there, and merge.)

- [ ] **Step 2: Add typed params and internal options**

Replace the function signature (line 11-12):

```ts
export async function graphTraversal(params: any, templateManager?: TemplateManager) {
```

with:

```ts
import { z } from "zod/v3";
import { graphTraversalInputSchema } from "@/core/schemas/tools/searchGraphInspector";

type GraphTraversalParams = z.infer<typeof graphTraversalInputSchema> & { mode: string };
type GraphTraversalInternalOpts = { includeGraph?: boolean };

export async function graphTraversal(
    params: GraphTraversalParams,
    templateManager?: TemplateManager,
    internalOpts?: GraphTraversalInternalOpts,
) {
```

- [ ] **Step 3: Replace hardcoded edge limit with constant**

Line 54 — change:

```ts
const edges = await mobiusEdgeRepo.getAllEdgesForNode(current.id, limit);
```

to:

```ts
const edges = await mobiusEdgeRepo.getAllEdgesForNode(current.id, GRAPH_TRAVERSAL_EDGES_PER_NODE);
```

- [ ] **Step 4: Replace semantic decay hardcoded array with constant**

Line 61 — change:

```ts
const semLimit = include_semantic_paths && current.depth > 0 ? ([limit, 3, 1][current.depth] ?? 0) : limit;
```

to:

```ts
const semLimit = include_semantic_paths && current.depth > 0
    ? (GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY[current.depth - 1] ?? 0)
    : limit;
```

- [ ] **Step 5: Conditionally include graph data based on response_format**

After building `graphNodes` and `graphEdges` (around lines 97-104), change the data construction to:

```ts
const includeGraph = internalOpts?.includeGraph || response_format === 'hybrid';
const data: Record<string, any> = {
    isTimeOut,
    start_note_path,
    hops,
    levels,
};
if (includeGraph) {
    // For hybrid: slim graph (no full attributes)
    if (response_format === 'hybrid') {
        data.graph = {
            nodes: result.map(node => {
                const attrs = parseAttrs(node.attributes);
                const path = typeof attrs?.path === 'string' && attrs.path.trim() ? attrs.path.trim() : undefined;
                return { id: node.id, type: node.type, depth: node.depth, ...(path ? { path } : {}) };
            }),
            edges: collectedEdges
                .filter(e => visitedNodeIds.has(e.from_node_id) && visitedNodeIds.has(e.to_node_id))
                .map(e => ({ from: e.from_node_id, to: e.to_node_id, type: e.type, weight: e.weight })),
        };
    } else {
        // Internal callers (UI) get full graph
        data.graph = { nodes: graphNodes, edges: graphEdges };
    }
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/service/tools/search-graph-inspector/graph-traversal.ts
git commit -m "refactor(inspector): graph_traversal — typed params, response_format-aware output, edge/decay constants"
```

---

## Task 7: `find_key_nodes` Redundant DB Query Fix

Remove the second `getTopNodeIdsByDegree` call and use degree data from the first call.

**Files:**
- Modify: `src/service/tools/search-graph-inspector/find-key-nodes.ts:36-37`

- [ ] **Step 1: Build degree maps from first query**

In `findKeyNodes`, after line 24 (`getTopNodeIdsByDegree` call), add:

```ts
const outDegreeMap = new Map(allOutDegreeStats.map(s => [s.nodeId, s.outDegree]));
const inDegreeMap = new Map(allInDegreeStats.map(s => [s.nodeId, s.inDegree]));
```

- [ ] **Step 2: Replace second DB query with map lookups**

Replace lines 36-37:

```ts
const { topByOutDegree: candidateOutDegrees, topByInDegree: candidateInDegrees } =
    await mobiusEdgeRepo.getTopNodeIdsByDegree(limit, candidateNodeIds);
```

with:

```ts
const candidateOutDegrees = candidateNodeIds
    .filter(id => outDegreeMap.has(id))
    .map(id => ({ nodeId: id, outDegree: outDegreeMap.get(id)! }));
const candidateInDegrees = candidateNodeIds
    .filter(id => inDegreeMap.has(id))
    .map(id => ({ nodeId: id, inDegree: inDegreeMap.get(id)! }));
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/service/tools/search-graph-inspector/find-key-nodes.ts
git commit -m "fix(inspector): remove redundant getTopNodeIdsByDegree call in find_key_nodes"
```

---

## Task 8: `search_by_dimensions` Structured Error Diagnostics

Add structured diagnostic output when zero results are found, enabling agent self-correction.

**Files:**
- Modify: `src/service/tools/search-graph-inspector/search-by-dimensions.ts:81-119`

- [ ] **Step 1: Update `findByExpressionWhere` return type**

Change the return type and add diagnostic information when no results found.

In the function `findByExpressionWhere` (line 81), change the return type to include diagnostics:

```ts
async function findByExpressionWhere(
    expressionTags: string[],
    expressionFunctionals: string[],
    expressionKeywords: string[],
): Promise<{
    success: boolean;
    message?: string;
    data?: Map<string, GraphNode>;
    diagnosis?: {
        unknown_tags: string[];
        unknown_functionals: string[];
        known_tags: string[];
        known_functionals: string[];
        suggestion: string;
    };
}> {
```

- [ ] **Step 2: Build diagnosis on zero results**

Replace the error returns in `findByExpressionWhere` (lines 104-106 and 111-113) with diagnostic-rich returns:

After building `tagLookupMap` and `functionalLookupMap` (lines 89-97), add:

```ts
const unknownTags = expressionTags.filter(t => !tagLookupMap.has(t));
const unknownFunctionals = expressionFunctionals.filter(f => !functionalLookupMap.has(f));
const knownTags = expressionTags.filter(t => tagLookupMap.has(t));
const knownFunctionals = expressionFunctionals.filter(f => functionalLookupMap.has(f));
```

Then change the `allTargetNodeIds.length === 0` check to:

```ts
if (allTargetNodeIds.length === 0) {
    return {
        success: false,
        diagnosis: {
            unknown_tags: unknownTags,
            unknown_functionals: unknownFunctionals,
            known_tags: knownTags,
            known_functionals: knownFunctionals,
            suggestion: unknownTags.length + unknownFunctionals.length > 0
                ? `Tags/functionals not found in vault: ${[...unknownTags, ...unknownFunctionals].join(', ')}. Check spelling or use local_search to discover valid tags.`
                : 'All tags/functionals exist but no documents match the expression.',
        },
    };
}
```

And change the `documentIds.length === 0` check to:

```ts
if (documentIds.length === 0) {
    return {
        success: false,
        diagnosis: {
            unknown_tags: unknownTags,
            unknown_functionals: unknownFunctionals,
            known_tags: knownTags,
            known_functionals: knownFunctionals,
            suggestion: 'Tags exist but AND intersection is empty. Try OR instead of AND, or check if tags are used on different documents.',
        },
    };
}
```

- [ ] **Step 3: Return structured diagnosis in `searchByDimensions`**

In the main `searchByDimensions` function, change lines 30-34 from:

```ts
if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
    return matchingDocumentsMessage || 'Error finding matching documents.';
}
```

to:

```ts
if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
    if (matchingDocumentsDiagnosis) {
        const diagData = {
            boolean_expression,
            matched: 0,
            diagnosis: matchingDocumentsDiagnosis,
        };
        return buildResponse(response_format, ToolTemplateId.SearchByDimensions, diagData, { templateManager });
    }
    return matchingDocumentsMessage || 'Error finding matching documents.';
}
```

Update the destructuring to capture `diagnosis`:

```ts
const { success: matchingDocumentsSuccess, message: matchingDocumentsMessage, data: matchingExpressionDocNodes, diagnosis: matchingDocumentsDiagnosis } =
    await findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/service/tools/search-graph-inspector/search-by-dimensions.ts
git commit -m "feat(inspector): structured diagnostic output for search_by_dimensions zero-result cases"
```

---

## Task 9: `explore_folder` — Use Constant for DEFAULT_LIMIT

Move the hardcoded `DEFAULT_LIMIT = 50` to the constant imported from `constant.ts`.

**Files:**
- Modify: `src/service/tools/search-graph-inspector/explore-folder.ts:27`

- [ ] **Step 1: Replace local constant with imported one**

Add import at the top:

```ts
import { EXPLORE_FOLDER_DEFAULT_LIMIT, SLICE_CAPS } from '@/core/constant';
```

(Update the existing `SLICE_CAPS` import line to include `EXPLORE_FOLDER_DEFAULT_LIMIT`.)

Delete the local constant:

```ts
const DEFAULT_LIMIT = 50;  // DELETE THIS LINE
```

Then find all usages of `DEFAULT_LIMIT` in the file and replace with `EXPLORE_FOLDER_DEFAULT_LIMIT`. Search for references — the constant is likely used in the function body as a fallback.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/tools/search-graph-inspector/explore-folder.ts
git commit -m "refactor(inspector): use EXPLORE_FOLDER_DEFAULT_LIMIT constant in explore_folder"
```

---

## Task 10: Eliminate MarkdownOnly Variants + Add `forceFormat` + Rewrite Descriptions

Refactor the tool factory to support `forceFormat` option, delete 6 MarkdownOnly variant functions, update recon imports, and rewrite all tool descriptions.

**Files:**
- Modify: `src/service/tools/search-graph-inspector.ts`
- Modify: `src/service/agents/intuition-helper/intuition.recon.ts:32,79-83`

- [ ] **Step 1: Add `forceFormat` to tool factory**

In `search-graph-inspector.ts`, update the `makeTool` function (line 22-24) to accept an `opts` parameter:

```ts
/** Factory: create a tool that delegates to an executor with `{ ...params, mode }`. */
function makeTool(
    desc: string,
    schema: ZodType,
    mode: string,
    exec: (p: any, tm?: TemplateManager) => Promise<any>,
    tm?: TemplateManager,
    opts?: { forceFormat?: 'markdown' | 'structured' },
): AgentTool {
    return safeAgentTool({
        description: desc,
        inputSchema: schema,
        execute: (p) => exec({
            ...p,
            mode,
            ...(opts?.forceFormat ? { response_format: opts.forceFormat } : {}),
        }, tm),
    });
}
```

Delete the `makeMarkdownOnlyTool` function entirely (lines 26-29).

- [ ] **Step 2: Update tool factory functions with `forceFormat` option**

Change the three tools that had MarkdownOnly variants to accept `opts`:

```ts
export function inspectNoteContextTool(tm?: TemplateManager, opts?: { forceFormat?: 'markdown' | 'structured' }): AgentTool {
    return makeTool(
        `Single-note deep dive — tags, functional categories, in/out links, semantic neighbors.\n\n` +
        `When to use:\n` +
        `- After local_search finds a candidate, to fully understand one note before including it as evidence\n\n` +
        `Avoid when:\n` +
        `- You need to inspect multiple notes in bulk — call graph_traversal from a common anchor instead`,
        inspectNoteContextInputSchema, 'inspect_note_context', inspectNoteContext, tm, opts,
    );
}

export function graphTraversalTool(tm?: TemplateManager, opts?: { forceFormat?: 'markdown' | 'structured' }): AgentTool {
    return makeTool(
        `BFS from a start note across N hops of physical + optional semantic links.\n\n` +
        `When to use:\n` +
        `- Understanding a note's knowledge neighborhood; 1-2 hops for direct cluster, 3 hops only when results are too sparse\n\n` +
        `Avoid when:\n` +
        `- You want the shortest path between two notes — use find_path`,
        graphTraversalInputSchema, 'graph_traversal', graphTraversal, tm, opts,
    );
}

export function exploreFolderTool(tm?: TemplateManager, opts?: { forceFormat?: 'markdown' | 'structured' }): AgentTool {
    return makeTool(
        `Vault folder structure inspection with per-folder item caps and extension summaries.\n\n` +
        `When to use:\n` +
        `- After grep_file_tree finds a folder anchor, to see its contents and structure; max_depth: 1 for quick browse, 2 standard, 3 for deep structure mapping\n\n` +
        `Avoid when:\n` +
        `- You just need to check if a path exists — use grep_file_tree`,
        exploreFolderInputSchema, 'explore_folder', exploreFolder, tm, opts,
    );
}
```

- [ ] **Step 3: Delete MarkdownOnly export functions**

Delete these 6 functions entirely:
- `inspectNoteContextToolMarkdownOnly` (line 34-36)
- `graphTraversalToolMarkdownOnly` (line 41-43)
- `exploreFolderToolMarkdownOnly` (line 67-69)

- [ ] **Step 4: Rewrite remaining tool descriptions**

Update all other tool factory functions with spec descriptions:

```ts
export function findPathTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Discover connection paths between two known notes using one of three strategies (reliable/fastTrack/brainstorm).\n\n` +
        `When to use:\n` +
        `- "How are note A and note B related?" — directional bridge finding\n\n` +
        `Avoid when:\n` +
        `- You don't know both endpoints — use graph_traversal for open-ended exploration`,
        findPathInputSchema, 'find_path', findPath, tm,
    );
}

export function findKeyNodesTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Vault-wide influential note discovery using RRF on out-degree, in-degree, and optional semantic filter. ` +
        `Node types: hub (many outgoing), authority (many incoming), bridge (cross-category), balanced.\n\n` +
        `When to use:\n` +
        `- Orientation at the start of recon when you need to find the most important notes in a topic area\n\n` +
        `Avoid when:\n` +
        `- You already have a starting note — start with inspect_note_context or graph_traversal instead`,
        findKeyNodesInputSchema, 'find_key_nodes', findKeyNodes, tm,
    );
}

export function findOrphansTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Discover disconnected notes (no physical links) with semantic revival suggestions. ` +
        `revival_suggestion field: nearest semantically similar non-orphan note — agent can propose linking it.\n\n` +
        `When to use:\n` +
        `- Knowledge base maintenance and gap discovery, not search tasks`,
        findOrphansInputSchema, 'find_orphans', findOrphanNotes, tm,
    );
}

export function searchByDimensionsTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Boolean-expression filter over tag/functional dimensions (e.g. tag:javascript AND functional:programming). ` +
        `Rules: only tag:value and functional:value prefixes; values must be single words (no spaces, no special characters). ` +
        `Error output: when no results found, returns diagnosis with unknown_tags and known_tags — use these to self-correct.\n\n` +
        `Avoid when:\n` +
        `- Searching by content keywords — use local_search_whole_vault`,
        searchByDimensionsInputSchema, 'search_by_dimensions', searchByDimensions, tm,
    );
}

export function grepFileTreeTool(): AgentTool {
    return safeAgentTool({
        description:
            `Pattern-match against all vault file paths (regex or substring). Returns paths only.\n\n` +
            `When to use:\n` +
            `- First step to find anchor paths or folder names before deeper exploration; fastest path-discovery available\n\n` +
            `Avoid when:\n` +
            `- You need file content or structure — use explore_folder after finding anchor paths`,
        inputSchema: grepFileTreeInputSchema,
        execute: (params) => grepFileTree(params),
    });
}

export function recentChangesWholeVaultTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Recently modified notes, sorted by mtime.\n\n` +
        `When to use:\n` +
        `- Establishing user's current focus at the start of recon; gives temporal context before running targeted searches\n\n` +
        `Avoid when:\n` +
        `- You need precise search results — this is orientation, not discovery`,
        recentChangesWholeVaultInputSchema, 'recent_changes_whole_vault', getRecentChanges, tm,
    );
}

export function localSearchWholeVaultTool(tm?: TemplateManager): AgentTool {
    return safeAgentTool({
        description:
            `Full-text, vector, or hybrid search across vault content.\n\n` +
            `When to use:\n` +
            `- Finding notes by keyword or concept; use fulltext for exact terms, vector for semantic concepts, hybrid for best of both\n\n` +
            `Avoid when:\n` +
            `- You already know the tag/category structure — use search_by_dimensions instead`,
        inputSchema: localSearchWholeVaultInputSchema,
        execute: async (params) => {
            const rawFolder = params.folder_path;
            const folderPath = rawFolder != null && String(rawFolder).trim() !== ''
                ? String(rawFolder).trim().replace(/\/+$/, '') : undefined;
            return localSearch({
                ...params, mode: 'local_search_whole_vault',
                scopeValue: { currentFilePath: params.current_file_path, folderPath, limitIdsSet: params.limit_ids_set },
            }, tm);
        }
    });
}
```

- [ ] **Step 5: Update recon phase imports**

In `src/service/agents/intuition-helper/intuition.recon.ts:32`, change:

```ts
import { exploreFolderToolMarkdownOnly, findPathTool, graphTraversalToolMarkdownOnly, grepFileTreeTool, inspectNoteContextToolMarkdownOnly, localSearchWholeVaultTool } from '@/service/tools/search-graph-inspector';
```

to:

```ts
import { exploreFolderTool, findPathTool, graphTraversalTool, grepFileTreeTool, inspectNoteContextTool, localSearchWholeVaultTool } from '@/service/tools/search-graph-inspector';
```

Then update the tool construction (lines 79-84) from:

```ts
explore_folder: exploreFolderToolMarkdownOnly(ctx.tm),
...
inspect_note_context: inspectNoteContextToolMarkdownOnly(ctx.tm),
graph_traversal: graphTraversalToolMarkdownOnly(ctx.tm),
```

to:

```ts
explore_folder: exploreFolderTool(ctx.tm, { forceFormat: 'markdown' }),
...
inspect_note_context: inspectNoteContextTool(ctx.tm, { forceFormat: 'markdown' }),
graph_traversal: graphTraversalTool(ctx.tm, { forceFormat: 'markdown' }),
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/service/tools/search-graph-inspector.ts src/service/agents/intuition-helper/intuition.recon.ts
git commit -m "refactor(inspector): eliminate MarkdownOnly variants with forceFormat option; rewrite all tool descriptions"
```

---

## Task 11: Recon System Prompt — Tool Selection Guide

Add the inter-tool relationship guide to the recon system prompt template.

**Files:**
- Modify: `templates/prompts/knowledge-intuition-plan-system.md`

- [ ] **Step 1: Append tool selection guide**

Add the following section at the end of `templates/prompts/knowledge-intuition-plan-system.md`:

```markdown

## Tool Selection Guide

Use this flow to choose tools at each recon step:

| Goal | Tool |
|---|---|
| Find anchor paths quickly | `grep_file_tree` |
| Understand folder structure | `explore_folder` |
| Search by keyword or concept | `local_search_whole_vault` |
| Filter by tag/category structure | `search_by_dimensions` |
| Explore a note's neighborhood | `graph_traversal` |
| Deep-dive one note | `inspect_note_context` |
| Find path between two concepts | `find_path` |
| Identify most important notes | `find_key_nodes` |
| Understand user's current focus | `recent_changes_whole_vault` |

Typical recon sequence: recent_changes -> grep_file_tree -> local_search -> inspect_note_context / graph_traversal
```

- [ ] **Step 2: Commit**

```bash
git add templates/prompts/knowledge-intuition-plan-system.md
git commit -m "docs(inspector): add tool selection guide to recon system prompt"
```

---

## Task 12: Type All Remaining Implementation Params

Add typed params to all remaining implementation files that still use `params: any`.

**Files:**
- Modify: `src/service/tools/search-graph-inspector/inspect-note-context.ts`
- Modify: `src/service/tools/search-graph-inspector/explore-folder.ts`
- Modify: `src/service/tools/search-graph-inspector/local-search.ts`
- Modify: `src/service/tools/search-graph-inspector/recent-change-whole-vault.ts`
- Modify: `src/service/tools/search-graph-inspector/search-by-dimensions.ts`
- Modify: `src/service/tools/search-graph-inspector/find-orphans.ts`
- Modify: `src/service/tools/search-graph-inspector/find-key-nodes.ts`

- [ ] **Step 1: Type params in each file**

For each implementation file, replace `params: any` with a derived type. The pattern is:

```ts
import { z } from "zod/v3";
import { <inputSchema> } from "@/core/schemas/tools/searchGraphInspector";
import type { SearchScopeValue } from "@/service/search/types";

type <ToolName>Params = z.infer<typeof <inputSchema>> & {
    mode: string;
    scopeValue?: SearchScopeValue;
};

export async function <toolFn>(params: <ToolName>Params, templateManager?: TemplateManager) {
```

Files and their schemas:
- `inspect-note-context.ts`: `inspectNoteContextInputSchema` -> `InspectNoteContextParams`
- `explore-folder.ts`: `exploreFolderInputSchema` -> `ExploreFolderParams`
- `local-search.ts`: `localSearchWholeVaultInputSchema` -> `LocalSearchParams` (also needs `scopeValue`)
- `recent-change-whole-vault.ts`: `recentChangesWholeVaultInputSchema` -> `RecentChangesParams`
- `search-by-dimensions.ts`: `searchByDimensionsInputSchema` -> `SearchByDimensionsParams`
- `find-orphans.ts`: `findOrphansInputSchema` -> `FindOrphansParams`
- `find-key-nodes.ts`: `findKeyNodesInputSchema` -> `FindKeyNodesParams`

Note: `graph-traversal.ts` was already typed in Task 6 and `find-path/index.ts` in Task 5.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/service/tools/search-graph-inspector/inspect-note-context.ts \
       src/service/tools/search-graph-inspector/explore-folder.ts \
       src/service/tools/search-graph-inspector/local-search.ts \
       src/service/tools/search-graph-inspector/recent-change-whole-vault.ts \
       src/service/tools/search-graph-inspector/search-by-dimensions.ts \
       src/service/tools/search-graph-inspector/find-orphans.ts \
       src/service/tools/search-graph-inspector/find-key-nodes.ts
git commit -m "refactor(inspector): type all implementation function params with Zod-inferred types"
```

---

## Task Summary

| Task | Component | Files | Deps |
|------|-----------|-------|------|
| 1 | Foundation constants + config template | 3 files | -- |
| 2 | Schema redesign | 1 file | -- |
| 3 | Dead code cleanup (common.ts) | 1 file | -- |
| 4 | find_orphans double-filter fix | 1 file | Task 1 (ORPHAN_FETCH_LIMIT) |
| 5 | find_path restructure + temporal removal | 6 files | Task 2 (schema) |
| 6 | graph_traversal token inflation fix | 1 file | Task 1 (constants) |
| 7 | find_key_nodes redundant DB query fix | 1 file | -- |
| 8 | search_by_dimensions error diagnostics | 1 file | -- |
| 9 | explore_folder constant extraction | 1 file | Task 1 (constant) |
| 10 | MarkdownOnly elimination + descriptions | 2 files | Task 5 (find_path schema) |
| 11 | Recon system prompt guide | 1 file | -- |
| 12 | Type all remaining params | 7 files | Task 2 (schemas) |

**Execution order:** Tasks 1-3 (parallel, foundation) -> Tasks 4, 6, 7, 8, 9 (parallel, per-tool fixes) -> Task 5 (find_path restructure, depends on Task 2) -> Task 10 (integration, depends on Task 5) -> Tasks 11-12 (parallel, finishing touches).
