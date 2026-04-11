# Search Inspector Tools — Comprehensive Overhaul Design

**Date:** 2026-04-10
**Branch:** refactor_search_pipeline
**Scope:** `src/core/schemas/tools/searchGraphInspector.ts`, `src/service/tools/search-graph-inspector/`, `src/service/tools/search-graph-inspector.ts`, `templates/config/`, `templates/prompts/ai-analysis-vault-recon-plan-system.md`

---

## Background & Motivation

The search inspector tool suite (11 tools, 3 MarkdownOnly variants) is the primary interface between the VaultSearchAgent and the knowledge graph. Tool quality directly determines recon phase effectiveness: whether the agent finds the right notes, how many tokens it burns doing so, and whether it can self-correct when a search strategy fails.

A full audit identified problems across four layers:

1. **Architecture** — MarkdownOnly variant duplication, `params: any` throughout, configurability violations, dead code
2. **Schema** — `limit` means different things in different tools, `find_path` strategies hidden from agent, poor error granularity in `search_by_dimensions`
3. **Implementation** — token inflation in `graph_traversal`, redundant DB queries in `find_key_nodes`, double-filter bug in `find_orphans`, over-engineered `find_path`
4. **Descriptions** — inconsistent format, missing when-to-use/avoid-when guidance, no inter-tool relationship documentation

**Approach:** Architecture First (B) — establish cross-cutting patterns before per-tool fixes, so every tool change has a clean template to follow.

---

## Layer 1: Foundation — Cross-Cutting Patterns

### 1.1 Eliminate MarkdownOnly Variants

**Problem:** Three duplicate function pairs exist solely to override `response_format`:
- `inspectNoteContextTool` / `inspectNoteContextToolMarkdownOnly`
- `graphTraversalTool` / `graphTraversalToolMarkdownOnly`
- `exploreFolderTool` / `exploreFolderToolMarkdownOnly`

**Solution:** Add `forceFormat` option to tool factory functions:

```ts
// Factory signature pattern (all affected tools)
function inspectNoteContextTool(
    tm?: TemplateManager,
    opts?: { forceFormat?: 'markdown' | 'structured' }
): AgentTool

// Recon phase usage
buildReconTools():
    inspect_note_context: inspectNoteContextTool(tm, { forceFormat: 'markdown' })
    graph_traversal:      graphTraversalTool(tm, { forceFormat: 'markdown' })
    explore_folder:       exploreFolderTool(tm, { forceFormat: 'markdown' })
```

**Outcome:** Delete 6 variant functions (`*MarkdownOnly`). `search-graph-inspector.ts` exports shrink accordingly.

### 1.2 `params: any` → Typed Params

**Problem:** Every implementation function uses `params: any`, losing type safety. Schema changes don't propagate to implementations at compile time.

**Solution:** Each implementation function's param type is derived from Zod schema inference plus internal fields:

```ts
// Pattern for all implementation files
type GraphTraversalParams = z.infer<typeof graphTraversalInputSchema> & {
    mode: string;
    scopeValue?: SearchScopeValue;  // if applicable
};

export async function graphTraversal(params: GraphTraversalParams, tm?: TemplateManager)
```

Internal-only fields (like `mode`) are added via intersection, not added to the public schema.

**Files affected:** `graph-traversal.ts`, `inspect-note-context.ts`, `find-path/index.ts`, `find-key-nodes.ts`, `find-orphans.ts`, `search-by-dimensions.ts`, `explore-folder.ts`, `local-search.ts`, `recent-change-whole-vault.ts`

### 1.3 Configurability — Move Hardcoded Values

Per CLAUDE.md: i18n strings, regex patterns, label maps, and color maps must not be hardcoded in logic files.

| Current location | Content | Target |
|---|---|---|
| `searchGraphInspector.ts` | `TIME_WITHIN_NORMALIZE` mapping table | `templates/config/time-within-normalize.json` loaded via TemplateManager |
| `graph-traversal.ts` | Semantic decay map `[limit, 3, 1]` | `constant.ts` as `GRAPH_TRAVERSAL_SEMANTIC_DECAY` |
| `explore-folder.ts` | `DEFAULT_LIMIT = 50` | `constant.ts` as `EXPLORE_FOLDER_DEFAULT_LIMIT` |
| `constant.ts` | `GRAPH_RRF_WEIGHTS` (had TODO saying "make configurable") | Keep in `constant.ts`; remove TODO, add comment: "compiled defaults; not runtime-configurable by design" |

`time-within-normalize.json` structure:
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

**Loading strategy:** `normalizeTimeWithin` is called inside `z.preprocess()` which is synchronous. TemplateManager loading is async. Solution: at plugin startup (or first use), load and cache the JSON into a module-level variable `let timeWithinNormalizeMap: Record<string, string> = TIME_WITHIN_NORMALIZE_DEFAULT` (compiled fallback). TemplateManager loads the JSON async and calls a `setTimeWithinNormalizeMap(loaded)` setter to update the cache. `normalizeTimeWithin` always reads from the cached variable synchronously. This ensures Zod schema validation works correctly even if the JSON hasn't loaded yet (falls back to compiled defaults).

### 1.4 Dead Code Removal

- `FilterOption.tag_category_boolean_expression` — commented out in schema; the `tagsTripleMap` branch in `getDefaultItemFiledGetter` that checks `filters?.tag_category_boolean_expression` is therefore unreachable → delete the branch
- `localSearchWholeVaultInputSchema` — `.nullable().nullable()` on `current_file_path` and `folder_path` → remove one `.nullable()` each
- `searchByDimensionsInputSchema` — `FilterOption.omit({ /* tag_category_boolean_expression: true */ })` comment block → clean up to plain `FilterOption.nullable()`
- `find-orphans.ts` — second `applyFiltersAndSorters` call on already-filtered results is a bug (see Layer 3)

---

## Layer 2: Schema Redesign

### 2.1 `limit` Semantic Unification

**Rule:** `limit` = the maximum number of results returned to the agent. No other meaning.

Internal fetch sizes, candidate pool sizes, and per-node edge query limits are moved to `constant.ts` and not exposed in schemas.

| Tool | Before | After |
|---|---|---|
| `graph_traversal` | `limit` controls both per-node edge query and per-level doc cap | `limit` = per-level doc cap only; per-node edge query uses `GRAPH_TRAVERSAL_EDGES_PER_NODE = 50` from `constant.ts` |
| `find_key_nodes` | `limit` is final result count, but internally used as `limit * 2` | `limit` = final result count; pool size = `RRF_RANKING_POOL_SIZE` (unchanged) |
| `find_orphans` | `getHardOrphans(params.limit \|\| 100)` then `applyFiltersAndSorters(limit)` | `getHardOrphans(ORPHAN_FETCH_LIMIT)` (internal constant = 200); `limit` = final result count only |
| `find_path` | `limit` (from BaseLimit) — actually controlled iterations | Remove `limit`; add `max_paths` (see 2.2) |
| All others | Consistent already | No change |

New constants in `constant.ts`:
```ts
export const GRAPH_TRAVERSAL_EDGES_PER_NODE = 50;
// Semantic neighbor limit for BFS depth > 0. Index = depth-1.
// depth=0 uses the full `limit` param; depth=1 → 3; depth=2 → 1.
export const GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY = [3, 1] as const;
export const ORPHAN_FETCH_LIMIT = 200;
export const EXPLORE_FOLDER_DEFAULT_LIMIT = 50;
```

### 2.2 `find_path` Strategy Exposure

Remove `temporal` strategy (time-ordered path has no independent value in vault context; achievable via `sorter: modified_desc` + `reliable`).

Three strategies remain: `reliable`, `fastTrack`, `brainstorm`.

New schema:
```ts
export const findPathInputSchema = z.object({
    start_note_path: z.string(),
    end_note_path: z.string(),
    strategy: z
        .enum(["reliable", "fastTrack", "brainstorm"])
        .default("reliable")
        .describe(
            "Path-finding strategy:\n" +
            "• 'reliable' — bidirectional BFS on physical links only. Fast, deterministic. " +
            "Use when you need the shortest actual wiki-link chain between two notes.\n" +
            "• 'fastTrack' — A* guided by semantic gravity. Finds conceptually coherent paths " +
            "even if physically longer. Use when direct links are sparse.\n" +
            "• 'brainstorm' — forces cross-domain jumps to surface unexpected bridges between concepts. " +
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

`findPathInputSchema` no longer extends `BaseLimit`.

### 2.3 `searchByDimensions` Error Granularity

**Problem:** Agent cannot distinguish "tag doesn't exist in vault" from "tag exists but AND intersection is empty."

**Solution:** Replace raw string error returns with structured diagnostic output when no results are found:

```ts
// Returned as structured data (not thrown error) when matched === 0
{
    boolean_expression,
    matched: 0,
    diagnosis: {
        unknown_tags: string[];       // tags not found in vault at all
        unknown_functionals: string[]; // functionals not found in vault at all
        known_tags: string[];         // tags that exist but intersection was empty
        known_functionals: string[];
        suggestion: string;           // e.g. "Try OR instead of AND, or check tag spelling"
    }
}
```

Agent can self-correct: `unknown_tags` → fix spelling or try `local_search`; `known_*` with empty intersection → relax AND to OR.

### 2.4 Minor Schema Fixes

- `BaseLimit.limit` description: `"Maximum number of results(each step inner also. not so strictly.)"` → `"Maximum number of results returned to the agent."`
- `ResponseFormat.hybrid` description: remove context overflow warning (move to tool description layer where appropriate)
- `SemanticFilter.topK` max: 50 → 30 (marginal returns diminish past 30; reduces vector query cost)
- `graphTraversalInputSchema.limit` description: align with unified limit semantics (currently says "not so strictly")
- `hubLocalGraphInputSchema`: add `response_format` description guidance (currently missing)

---

## Layer 3: Implementation Fixes

### 3.1 `graph_traversal` Token Inflation

**Problem:** `structured` output contains both `levels` (agent-readable) and `graph` (UI visualization), up to 50k tokens at hops=3.

**Solution:** Output content controlled by `response_format`:

| response_format | Output |
|---|---|
| `structured` | Only `levels` (depth-grouped document lists). `graph` field omitted. |
| `markdown` | Rendered template only. |
| `hybrid` | `levels` + slim `graph` (nodes: `{id, type, depth, path}` only; edges: `{from, to, type, weight}` only) |

UI internal callers (`inspectorService.ts → runInspectorGraph`) call the underlying `graphTraversal()` function directly with an internal `includeGraph: true` option (not in schema). This keeps graph visualization data fully functional for UI without exposing it to agents.

```ts
// Internal option (not in schema)
type GraphTraversalInternalOpts = { includeGraph?: boolean };

export async function graphTraversal(
    params: GraphTraversalParams,
    tm?: TemplateManager,
    internalOpts?: GraphTraversalInternalOpts
)
```

### 3.2 `find_key_nodes` Redundant DB Query

**Problem:** `getTopNodeIdsByDegree` called twice — once with pool size 500, once again with `limit` on the candidate subset. Second call is redundant since degree data is already available from the first call's Maps.

**Solution:** Delete second `getTopNodeIdsByDegree` call. Extract `candidateOutDegrees` and `candidateInDegrees` directly from `outDegreeMap` / `inDegreeMap` built during the first call:

```ts
// After sorting and slicing candidateNodeIds from RRF results:
const candidateOutDegrees = candidateNodeIds
    .filter(id => outDegreeMap.has(id))
    .map(id => ({ nodeId: id, outDegree: outDegreeMap.get(id)! }));
const candidateInDegrees = candidateNodeIds
    .filter(id => inDegreeMap.has(id))
    .map(id => ({ nodeId: id, inDegree: inDegreeMap.get(id)! }));
```

Eliminates one DB round-trip per `find_key_nodes` call.

### 3.3 `hub_local_graph` Output Verbosity

**Problem:** Every node/edge includes full weight breakdown (`hubNodeWeight`, `distancePenalty`, `cohesionScore`, `bridgePenalty`, `expandPriority`, `edgeTypeWeight`, `semanticSupport`, `crossBoundaryPenalty`). Useful for UI, bloating for agents.

**Solution:** Same internal option pattern as graph_traversal:

- Agent-facing (`response_format: structured`): node → `{id, label, type, depth, path, roleHint}`; edge → `{from, to, type, weight}`
- UI-facing (`runInspectorHubLocalGraph` in `inspectorService.ts`): calls `hubLocalGraph()` with `internalOpts: { includeWeightDetails: true }` to get full attributes

`roleHint` is preserved in agent output because agents can use it to understand node roles (hub/leaf/bridge).

### 3.4 `find_path` Restructure and `temporal` Removal

**Changes:**
1. Delete `temporal` strategy and all associated code (`PathSegment.timestamp`, `PathSegment.folderPath`, temporal BFS implementation)
2. Split into directory structure:
   ```
   src/service/tools/search-graph-inspector/find-path/
     reliable.ts      ← bidirectional BFS, physical edges only
     fast-track.ts    ← A* with semantic gravity field
     brainstorm.ts    ← forced cross-domain bridge discovery
     scorer.ts        ← shared path quality scoring
     index.ts         ← entry point, routes by strategy param
   ```
3. Entry `index.ts` reads `params.strategy` (from new schema field) and delegates to the appropriate strategy module
4. `params: any` replaced with typed params (Layer 1.2)

Expected file size reduction: ~60% of current 19k tokens.

### 3.5 `find_orphans` Double-Filter Bug Fix

**Problem:** `applyFiltersAndSorters` applied twice — once on `hardOrphanNodes` to produce `filteredHardOrphans`, then again on `cadidateAllOrphanNodes = [...filteredHardOrphans]`. `limit` is applied twice, causing incorrect result counts.

**Fix:** Remove first `applyFiltersAndSorters` call. Apply once at the final merge step:

```ts
// Before (buggy)
filteredHardOrphans = applyFiltersAndSorters(hardOrphanNodes, filters, sorter, limit, ...)
cadidateAllOrphanNodes = [...filteredHardOrphans]
finalAllOrphanNodes = applyFiltersAndSorters(cadidateAllOrphanNodes, filters, sorter, limit, ...) // double filter!

// After (correct)
const hardOrphanNodes = Array.from(hardOrphanNodeMap.values()).map(n => ({ ...n, orphanType: 'hard' }))
// cadidateAllOrphanNodes = [...hardOrphanNodes, ...softOrphans (future)]
const finalAllOrphanNodes = applyFiltersAndSorters(cadidateAllOrphanNodes, filters, sorter, limit, ...)
```

Soft orphan TODO comment updated to `// NOT YET IMPLEMENTED: soft orphan detection (requires low-degree index)`.

---

## Layer 4: Tool Descriptions

### Format Standard

All tool descriptions follow this structure:

```
[One-sentence core capability]

When to use:
• [scenario 1]
• [scenario 2]

Avoid when:
• [anti-scenario — when another tool is better]
```

Simple tools (grep_file_tree, recent_changes) may omit "Avoid when" if the anti-cases are obvious.

### Per-Tool Description Rewrites

**`local_search_whole_vault`**
- Core: Full-text, vector, or hybrid search across vault content
- When to use: finding notes by keyword or concept; use `fulltext` for exact terms, `vector` for semantic concepts, `hybrid` for best of both
- Avoid when: you already know the tag/category structure → use `search_by_dimensions` instead
- Note: `scopeMode: inFolder` restricts search to a subtree; `limitIdsSet` restricts to a pre-found set of IDs

**`grep_file_tree`**
- Core: Pattern-match against all vault file paths (regex or substring). Returns paths only.
- When to use: first step to find anchor paths or folder names before deeper exploration; fastest path-discovery available
- Avoid when: you need file content or structure — use `explore_folder` after finding anchor paths

**`graph_traversal`**
- Core: BFS from a start note across N hops of physical + optional semantic links
- When to use: understanding a note's knowledge neighborhood; 1-2 hops for direct cluster, 3 hops only when results are too sparse
- Avoid when: you want to understand a single hub's structure → use `hub_local_graph`; you want the shortest path between two notes → use `find_path`

**`inspect_note_context`**
- Core: Single-note deep dive — tags, functional categories, in/out links, semantic neighbors
- When to use: after `local_search` finds a candidate, to fully understand one note before including it as evidence
- Avoid when: you need to inspect multiple notes in bulk — call `graph_traversal` from a common anchor instead

**`find_path`**
- Core: Discover connection paths between two known notes using one of three strategies
- Strategies explained in schema (Section 2.2)
- When to use: "how are note A and note B related?" — directional bridge finding
- Avoid when: you don't know both endpoints — use `graph_traversal` for open-ended exploration

**`hub_local_graph`**
- Core: Weighted local graph expansion around one hub-like note; includes `roleHint` per node (hub/leaf/bridge)
- When to use: understanding the influence radius and structural quality of a candidate hub note; `roleHint` field tells you which nodes are hubs vs leaves vs bridges
- Avoid when: you want broad exploration → `graph_traversal`; you want the whole vault's most connected notes → `find_key_nodes`

**`find_key_nodes`**
- Core: Vault-wide influential note discovery using RRF on out-degree, in-degree, and optional semantic filter
- Node types: `hub` (many outgoing), `authority` (many incoming), `bridge` (cross-category), `balanced`
- When to use: orientation at the start of recon when you need to find the most important notes in a topic area
- Avoid when: you already have a starting note — start with `inspect_note_context` or `graph_traversal` instead

**`search_by_dimensions`**
- Core: Boolean-expression filter over tag/functional dimensions (e.g. `tag:javascript AND functional:programming`)
- Rules: only `tag:value` and `functional:value` prefixes; values must be single words (no spaces, no special characters)
- Error output: when no results found, returns `diagnosis` with `unknown_tags` and `known_tags` — use these to self-correct (unknown → fix spelling; known but empty → relax AND to OR)
- Avoid when: searching by content keywords → use `local_search_whole_vault`

**`explore_folder`**
- Core: Vault folder structure inspection with per-folder item caps and extension summaries
- When to use: after `grep_file_tree` finds a folder anchor, to see its contents and structure; `max_depth: 1` for quick browse, `2` standard, `3` for deep structure mapping
- Avoid when: you just need to check if a path exists → use `grep_file_tree`

**`find_orphans`**
- Core: Discover disconnected notes (no physical links) with semantic revival suggestions
- `revival_suggestion` field: nearest semantically similar non-orphan note — agent can propose linking it
- When to use: knowledge base maintenance and gap discovery, not search tasks

**`recent_changes_whole_vault`**
- Core: Recently modified notes, sorted by mtime
- When to use: establishing user's current focus at the start of recon; gives temporal context before running targeted searches
- Avoid when: you need precise search results — this is orientation, not discovery

### Inter-Tool Relationship Guide (Recon System Prompt)

Add to `templates/prompts/ai-analysis-vault-recon-plan-system.md`:

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
| Understand a hub's influence | `hub_local_graph` |
| Find path between two concepts | `find_path` |
| Identify most important notes | `find_key_nodes` |
| Understand user's current focus | `recent_changes_whole_vault` |

Typical recon sequence: recent_changes → grep_file_tree → local_search → inspect_note_context / graph_traversal
```

---

## Files Changed Summary

| File | Change type |
|---|---|
| `templates/config/time-within-normalize.json` | **New** |
| `templates/prompts/ai-analysis-vault-recon-plan-system.md` | Add tool selection guide |
| `src/core/schemas/tools/searchGraphInspector.ts` | Schema redesign (limit, find_path strategy, error granularity, cleanup) |
| `src/core/constant.ts` | Add `GRAPH_TRAVERSAL_EDGES_PER_NODE`, `GRAPH_TRAVERSAL_SEMANTIC_DECAY`, `ORPHAN_FETCH_LIMIT`, `EXPLORE_FOLDER_DEFAULT_LIMIT` |
| `src/service/tools/search-graph-inspector.ts` | Remove 6 MarkdownOnly exports; add `forceFormat` option to 3 tool factories |
| `src/service/agents/vault/phases/recon.ts` | Update `buildReconTools` to use `forceFormat: 'markdown'` option |
| `src/service/tools/search-graph-inspector/common.ts` | Remove dead `tagsTripleMap` branch in `getDefaultItemFiledGetter` |
| `src/service/tools/search-graph-inspector/graph-traversal.ts` | Type params; output by response_format; add `internalOpts`; semantic decay to constant |
| `src/service/tools/search-graph-inspector/inspect-note-context.ts` | Type params |
| `src/service/tools/search-graph-inspector/find-path.ts` | → restructured to `find-path/` directory; remove temporal; add strategy routing |
| `src/service/tools/search-graph-inspector/find-key-nodes.ts` | Type params; remove redundant DB query |
| `src/service/tools/search-graph-inspector/find-orphans.ts` | Fix double-filter bug; type params |
| `src/service/tools/search-graph-inspector/search-by-dimensions.ts` | Type params; structured error/diagnosis output |
| `src/service/tools/search-graph-inspector/explore-folder.ts` | Type params; DEFAULT_LIMIT → constant |
| `src/service/tools/search-graph-inspector/local-search.ts` | Type params |
| `src/service/tools/search-graph-inspector/hub-local-graph.ts` | Type params; output verbosity by response_format; add `internalOpts` |
| `src/service/tools/search-graph-inspector/recent-change-whole-vault.ts` | Type params |
| `src/service/search/inspectorService.ts` | Update calls to use `internalOpts: { includeGraph: true }` / `{ includeWeightDetails: true }` |

---

## Non-Goals

- No changes to the underlying DB query logic (MobiusEdgeRepo, MobiusNodeRepo, EmbeddingRepo)
- No changes to the recon agent loop iteration count or prompt text beyond the tool selection guide
- No changes to `find_orphans` soft orphan detection (deferred, requires DB schema change)
- No changes to `hub_local_graph` internal scoring algorithm
- No UI changes
