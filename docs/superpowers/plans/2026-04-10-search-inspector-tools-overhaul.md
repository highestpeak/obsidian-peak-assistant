# Search Inspector Tools — Comprehensive Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul all 11 search inspector tools to fix architecture duplication, type safety, limit inconsistencies, token inflation, and tool description quality.

**Architecture:** Foundation-first (B): constants → schema → tool factory consolidation → per-implementation typing + bug fixes → find-path restructure → descriptions. Each layer is stable before the next layer is touched.

**Tech Stack:** TypeScript, Zod v3, better-sqlite3, Obsidian plugin API. Build: `npm run build`.

---

## File Map

| File | Action |
|---|---|
| `src/core/constant.ts` | Add 4 constants, update `GRAPH_RRF_WEIGHTS` comment |
| `templates/config/time-within-normalize.json` | **New** |
| `src/core/schemas/tools/searchGraphInspector.ts` | Schema cleanup + redesign (Tasks 2–4) |
| `src/service/tools/search-graph-inspector.ts` | Remove 6 MarkdownOnly exports, add `forceFormat` opts |
| `src/service/agents/vault/phases/recon.ts` | Use `forceFormat: 'markdown'` option |
| `src/service/tools/search-graph-inspector/common.ts` | Remove dead `tagsTripleMap` branch |
| `src/service/tools/search-graph-inspector/graph-traversal.ts` | Typed params, token inflation fix, `internalOpts` |
| `src/service/tools/search-graph-inspector/inspect-note-context.ts` | Typed params |
| `src/service/tools/search-graph-inspector/find-key-nodes.ts` | Typed params, remove redundant DB query |
| `src/service/tools/search-graph-inspector/find-orphans.ts` | Typed params, double-filter bug fix |
| `src/service/tools/search-graph-inspector/search-by-dimensions.ts` | Typed params, structured diagnosis output |
| `src/service/tools/search-graph-inspector/explore-folder.ts` | Typed params, `DEFAULT_LIMIT` → constant |
| `src/service/tools/search-graph-inspector/local-search.ts` | Typed params |
| `src/service/tools/search-graph-inspector/hub-local-graph.ts` | Typed params, slim agent output, `internalOpts` |
| `src/service/tools/search-graph-inspector/recent-change-whole-vault.ts` | Typed params |
| `src/service/tools/search-graph-inspector/find-path/types.ts` | **New** — shared types + constants |
| `src/service/tools/search-graph-inspector/find-path/scorer.ts` | **New** — path quality scoring |
| `src/service/tools/search-graph-inspector/find-path/reliable.ts` | **New** — bidirectional BFS |
| `src/service/tools/search-graph-inspector/find-path/fast-track.ts` | **New** — A* with semantic gravity |
| `src/service/tools/search-graph-inspector/find-path/brainstorm.ts` | **New** — cross-domain bridge |
| `src/service/tools/search-graph-inspector/find-path/index.ts` | **New** — entry + strategy routing |
| `src/service/tools/search-graph-inspector/find-path.ts` | **Delete** |
| `src/service/search/inspectorService.ts` | Update calls for `internalOpts` + new findPath shape |
| `templates/prompts/ai-analysis-vault-recon-plan-system.md` | Add tool selection guide |

---

### Task 1: Add Constants to `constant.ts`

**Files:**
- Modify: `src/core/constant.ts`

- [ ] **Step 1: Update `GRAPH_RRF_WEIGHTS` comment and add four new constants**

Find the comment block before `GRAPH_RRF_WEIGHTS` (around line 666):
```ts
/**
 * TODO: Turn these constants into configuration options, or make them optional parameters for tools.
 * 	This will allow the AI Agent to adjust them according to the specific scenario.
 * 	Different tasks require different "exploration scales". If the Agent can fine-tune PHYSICAL_CONNECTION_BONUS,
 * 	its ability to explore and discover will be significantly improved.
 *
 * Graph Inspector RRF weights for document node ranking.
```
Replace with:
```ts
/**
 * Graph Inspector RRF weights for document node ranking.
 * Compiled defaults; not runtime-configurable by design (values tuned for vault graph structure).
```

After `GRAPH_INSPECT_STEP_TIME_LIMIT = 10000` (around line 722), add:
```ts
/** Per-node physical edge query limit in graph_traversal BFS. Decoupled from agent-facing `limit`. */
export const GRAPH_TRAVERSAL_EDGES_PER_NODE = 50;

/**
 * Semantic neighbor limit for graph_traversal BFS at depths > 0. Index = depth - 1.
 * depth=0 uses the full `limit` param; depth=1 → [0]=3; depth=2 → [1]=1.
 */
export const GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY = [3, 1] as const;

/** Hard orphan fetch limit for getHardOrphans(); separate from agent-facing `limit`. */
export const ORPHAN_FETCH_LIMIT = 200;

/** Default per-folder item cap for explore_folder when `limit` is not specified. */
export const EXPLORE_FOLDER_DEFAULT_LIMIT = 50;
```

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Commit**
```bash
git add src/core/constant.ts
git commit -m "feat: add GRAPH_TRAVERSAL_EDGES_PER_NODE, GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY, ORPHAN_FETCH_LIMIT, EXPLORE_FOLDER_DEFAULT_LIMIT"
```

---

### Task 2: `time-within-normalize.json` + Lazy-Load Cache

**Files:**
- Create: `templates/config/time-within-normalize.json`
- Modify: `src/core/schemas/tools/searchGraphInspector.ts`

- [ ] **Step 1: Create config JSON**

Create `templates/config/time-within-normalize.json`:
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

- [ ] **Step 2: Replace `TIME_WITHIN_NORMALIZE` constant and `normalizeTimeWithin` function**

In `src/core/schemas/tools/searchGraphInspector.ts`, remove:
```ts
const TIME_WITHIN_NORMALIZE: Record<string, (typeof TIME_WITHIN_VALUES)[number]> = {
	last_3_years: "this_year",
	...
};
```

And replace `normalizeTimeWithin` with:
```ts
// Compiled fallback — mirrors time-within-normalize.json.
const TIME_WITHIN_NORMALIZE_DEFAULT: Record<string, (typeof TIME_WITHIN_VALUES)[number]> = {
	last_3_years: "this_year",
	last_2_years: "this_year",
	last_year: "this_year",
	last_6_months: "last_3_months",
	last_month: "this_month",
	last_week: "this_week",
	recent: "this_month",
};

// Module-level cache, updated lazily from templates/config/time-within-normalize.json.
let _timeWithinCache: Record<string, (typeof TIME_WITHIN_VALUES)[number]> = { ...TIME_WITHIN_NORMALIZE_DEFAULT };
let _timeWithinCacheLoaded = false;

function loadTimeWithinNormalizeConfig(): void {
	if (_timeWithinCacheLoaded) return;
	_timeWithinCacheLoaded = true;
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { AppContext } = require('@/app/context/AppContext');
		const raw = AppContext.getInstance()?.templateManager?.loadRaw?.('config/time-within-normalize.json');
		if (raw) {
			const json = JSON.parse(raw) as Record<string, string>;
			const validated: Record<string, (typeof TIME_WITHIN_VALUES)[number]> = {};
			for (const [k, v] of Object.entries(json)) {
				if (TIME_WITHIN_VALUES.includes(v as (typeof TIME_WITHIN_VALUES)[number])) {
					validated[k] = v as (typeof TIME_WITHIN_VALUES)[number];
				}
			}
			_timeWithinCache = { ...TIME_WITHIN_NORMALIZE_DEFAULT, ...validated };
		}
	} catch {
		// AppContext not ready — compiled defaults remain active.
	}
}

export function normalizeTimeWithin(
	val: unknown
): (typeof TIME_WITHIN_VALUES)[number] | undefined {
	if (val == null) return undefined;
	const s = String(val).trim().toLowerCase();
	if (TIME_WITHIN_VALUES.includes(s as (typeof TIME_WITHIN_VALUES)[number]))
		return s as (typeof TIME_WITHIN_VALUES)[number];
	if (!_timeWithinCacheLoaded) loadTimeWithinNormalizeConfig();
	return (_timeWithinCache[s] as (typeof TIME_WITHIN_VALUES)[number]) ?? "this_year";
}
```

- [ ] **Step 3: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 4: Commit**
```bash
git add templates/config/time-within-normalize.json src/core/schemas/tools/searchGraphInspector.ts
git commit -m "feat: extract TIME_WITHIN_NORMALIZE to config JSON with lazy-load cache"
```

---

### Task 3: Schema Cleanup — Dead Code + Minor Fixes

**Files:**
- Modify: `src/core/schemas/tools/searchGraphInspector.ts`

- [ ] **Step 1: Fix `BaseLimit` description**

Find:
```ts
		.describe(
			"Maximum number of results(each step inner also. not so strictly.)"
		),
```
Replace:
```ts
		.describe("Maximum number of results returned to the agent."),
```

- [ ] **Step 2: Fix `SemanticFilter.topK` max 50 → 30**

Find:
```ts
	topK: z
		.number()
		.min(1)
		.max(50)
		.default(20)
		.describe("Number of top similar nodes to keep"),
```
Replace:
```ts
	topK: z
		.number()
		.min(1)
		.max(30)
		.default(20)
		.describe("Number of top similar nodes to keep. Values above 30 yield diminishing returns."),
```

- [ ] **Step 3: Simplify `ResponseFormat` description (remove overflow warning)**

Find the `ResponseFormat` definition and replace the `describe` argument:
```ts
		.describe(
			"Output format. " +
			"'structured' — machine-readable data, best for piping results to another tool. " +
			"'markdown' — human-readable prose, best for reasoning about relationships. " +
			"'hybrid' — both data and prose."
		),
```

- [ ] **Step 4: Remove double `.nullable()` from `localSearchWholeVaultInputSchema`**

Find both occurrences of `.nullable().nullable()` (on `current_file_path` and `folder_path`) and remove one `.nullable()` from each.

- [ ] **Step 5: Clean up `searchByDimensionsInputSchema` — replace `FilterOption.omit({...}).nullable()` with `FilterOption.nullable()`**

Find:
```ts
		filters: FilterOption.omit({
			// tag_category_boolean_expression: true
		 }).nullable(),
```
Replace:
```ts
		filters: FilterOption.nullable(),
```

- [ ] **Step 6: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 7: Commit**
```bash
git add src/core/schemas/tools/searchGraphInspector.ts
git commit -m "fix: schema cleanup — BaseLimit desc, SemanticFilter topK max, ResponseFormat desc, double nullable, dead omit"
```

---

### Task 4: Schema Redesign — `limit` Unification + `findPathInputSchema` Replacement

**Files:**
- Modify: `src/core/schemas/tools/searchGraphInspector.ts`

- [ ] **Step 1: Update `graphTraversalInputSchema.limit` description**

Find the standalone `limit` override inside `graphTraversalInputSchema` (the one with default 15):
```ts
		limit: z
			.number()
			.min(1)
			.max(100)
			.nullable()
			.default(15)
			.describe(
				"Maximum number of results. do not set too large as it may cause context overflow."
			),
```
Replace:
```ts
		limit: z
			.number()
			.min(1)
			.max(100)
			.nullable()
			.default(15)
			.describe(
				"Maximum document nodes returned per depth level. Keep ≤20 for hops=2, ≤10 for hops=3 to avoid context overflow."
			),
```

- [ ] **Step 2: Add `response_format` description to `hubLocalGraphInputSchema`**

Find:
```ts
		response_format: ResponseFormat.shape.response_format.default("structured"),
```
inside `hubLocalGraphInputSchema` and replace:
```ts
		response_format: ResponseFormat.shape.response_format.default("structured")
			.describe(
				"'structured' for agent use (slim node/edge list with roleHint). 'markdown' for a short summary. 'hybrid' for both."
			),
```

- [ ] **Step 3: Replace `findPathInputSchema` entirely**

Remove the existing `findPathInputSchema` export and replace with:
```ts
export const findPathInputSchema = z.object({
	start_note_path: z.string().describe("Vault-relative path of the start note."),
	end_note_path: z.string().describe("Vault-relative path of the end note."),
	strategy: z
		.enum(["reliable", "fastTrack", "brainstorm"])
		.default("reliable")
		.describe(
			"Path-finding strategy:\n" +
			"• 'reliable' — bidirectional BFS on physical links only. Fast and deterministic. " +
			"Use when you need the shortest actual wiki-link chain between two notes.\n" +
			"• 'fastTrack' — A* guided by semantic gravity. Finds conceptually coherent paths " +
			"even if physically longer. Use when direct physical links are sparse.\n" +
			"• 'brainstorm' — forces cross-domain jumps to surface unexpected bridges between concepts. " +
			"Use for creative discovery, not for precise relationship mapping."
		),
	max_paths: z
		.number()
		.min(1)
		.max(5)
		.default(3)
		.describe("Maximum number of distinct paths to return. Higher values increase computation time."),
	filters: NullableFilterOption.describe("Filter nodes included in paths."),
	include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
	response_format: ResponseFormat.shape.response_format.default("structured"),
});
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: exits 0. (`find-path.ts` still uses `params: any` so the removed `limit` won't cause a TS error yet — fixed in Task 16.)

- [ ] **Step 5: Commit**
```bash
git add src/core/schemas/tools/searchGraphInspector.ts
git commit -m "feat: schema — limit desc unification, findPath strategy+max_paths, hubLocalGraph response_format desc"
```

---

### Task 5: Eliminate MarkdownOnly Variants

**Files:**
- Modify: `src/service/tools/search-graph-inspector.ts`
- Modify: `src/service/agents/vault/phases/recon.ts`

- [ ] **Step 1: Add `opts` to `inspectNoteContextTool` and delete `inspectNoteContextToolMarkdownOnly`**

Replace both `inspectNoteContextTool` and `inspectNoteContextToolMarkdownOnly` with one function:
```ts
export function inspectNoteContextTool(
    templateManager?: TemplateManager,
    opts?: { forceFormat?: 'markdown' | 'structured' | 'hybrid' }
): AgentTool {
    return safeAgentTool({
        description: `[Deep Dive] Use this tool to understand a single note's identity (tags, connections, location).`,
        inputSchema: inspectNoteContextInputSchema,
        execute: async (params) => {
            const response_format = opts?.forceFormat ?? params.response_format;
            return await inspectNoteContext({ ...params, response_format, mode: 'inspect_note_context' }, templateManager);
        }
    });
}
```

- [ ] **Step 2: Add `opts` to `graphTraversalTool` and delete `graphTraversalToolMarkdownOnly`**

Replace both with:
```ts
export function graphTraversalTool(
    templateManager?: TemplateManager,
    opts?: { forceFormat?: 'markdown' | 'structured' | 'hybrid' }
): AgentTool {
    return safeAgentTool({
        description: `[Relational Discovery] Explore related notes within N degrees of separation (hops).`,
        inputSchema: graphTraversalInputSchema,
        execute: async (params) => {
            const response_format = opts?.forceFormat ?? params.response_format;
            return await graphTraversal({ ...params, response_format, mode: 'graph_traversal' }, templateManager);
        }
    });
}
```

- [ ] **Step 3: Add `opts` to `exploreFolderTool` and delete `exploreFolderToolMarkdownOnly`**

Replace both with:
```ts
export function exploreFolderTool(
    templateManager?: TemplateManager,
    opts?: { forceFormat?: 'markdown' | 'structured' | 'hybrid' }
): AgentTool {
    return safeAgentTool({
        description: `Inspect vault structure with spatial navigation. Browse folders and understand vault organization.`,
        inputSchema: exploreFolderInputSchema,
        execute: async (params) => {
            const response_format = opts?.forceFormat ?? params.response_format;
            return await exploreFolder({ ...params, response_format, mode: 'explore_folder' }, templateManager);
        }
    });
}
```

- [ ] **Step 4: Update `recon.ts` imports and `buildReconTools`**

In `src/service/agents/vault/phases/recon.ts`:

Change imports — remove the three `*MarkdownOnly` imports, keep the base names:
```ts
import {
    inspectNoteContextTool,
    graphTraversalTool,
    exploreFolderTool,
    grepFileTreeTool,
    localSearchWholeVaultTool,
    findPathTool,
    hubLocalGraphTool,
} from '@/service/tools/search-graph-inspector';
```

Update `buildReconTools`:
```ts
function buildReconTools(aiServiceManager: AIServiceManager): Record<string, AgentTool> {
    const tm = aiServiceManager.getTemplateManager?.();
    return {
        inspect_note_context: inspectNoteContextTool(tm, { forceFormat: 'markdown' }),
        graph_traversal: graphTraversalTool(tm, { forceFormat: 'markdown' }),
        explore_folder: exploreFolderTool(tm, { forceFormat: 'markdown' }),
        grep_file_tree: grepFileTreeTool(),
        local_search_whole_vault: localSearchWholeVaultTool(tm),
        find_path: findPathTool(tm),
        hub_local_graph: hubLocalGraphTool(tm),
    };
}
```

- [ ] **Step 5: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 6: Confirm MarkdownOnly is gone**
```bash
grep -r "MarkdownOnly" src/
```
Expected: no output.

- [ ] **Step 7: Commit**
```bash
git add src/service/tools/search-graph-inspector.ts src/service/agents/vault/phases/recon.ts
git commit -m "refactor: eliminate MarkdownOnly tool variants — use forceFormat option"
```

---

### Task 6: `common.ts` — Remove Dead `tagsTripleMap` Branch

**Files:**
- Modify: `src/service/tools/search-graph-inspector/common.ts`

- [ ] **Step 1: Remove conditional tagsTripleMap in `getDefaultItemFiledGetter`**

Find in `getDefaultItemFiledGetter`:
```ts
    const tagsTripleMap = filters?.tag_category_boolean_expression
        ? (await sqliteStoreManager.getGraphRepo().getTagsByDocIds(nodeIds)).idMapToTags
        : emptyMap<
              string,
              { ... }
          >();
```
Replace with just:
```ts
    const tagsTripleMap = emptyMap<
        string,
        {
            topicTags: string[];
            topicTagEntries?: TopicTagEntry[];
            functionalTagEntries: FunctionalTagEntry[];
            keywordTags: string[];
            timeTags: string[];
            geoTags: string[];
            personTags: string[];
        }
    >();
```

Then check if `getGraphRepo` is imported and no longer used anywhere else in the file — if so, remove the import.

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Commit**
```bash
git add src/service/tools/search-graph-inspector/common.ts
git commit -m "fix: remove dead tagsTripleMap branch in getDefaultItemFiledGetter"
```

---

### Task 7: `graph-traversal.ts` — Typed Params + Token Inflation Fix

**Files:**
- Modify: `src/service/tools/search-graph-inspector/graph-traversal.ts`
- Modify: `src/service/search/inspectorService.ts`

- [ ] **Step 1: Add imports, typed param, and `internalOpts` type**

At the top of `graph-traversal.ts`, add:
```ts
import { z } from "zod/v3";
import { graphTraversalInputSchema } from "@/core/schemas/tools/searchGraphInspector";
import { GRAPH_TRAVERSAL_EDGES_PER_NODE, GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY } from "@/core/constant";

type GraphTraversalParams = z.infer<typeof graphTraversalInputSchema> & { mode: string };
export type GraphTraversalInternalOpts = { includeGraph?: boolean };
```

Change function signature:
```ts
export async function graphTraversal(
    params: GraphTraversalParams,
    templateManager?: TemplateManager,
    internalOpts?: GraphTraversalInternalOpts
)
```

- [ ] **Step 2: Replace `limit` with constants inside BFS**

Find:
```ts
        const physicalInAndOutEdges = await mobiusEdgeRepo.getAllEdgesForNode(current.id, limit);
```
Replace:
```ts
        const physicalInAndOutEdges = await mobiusEdgeRepo.getAllEdgesForNode(current.id, GRAPH_TRAVERSAL_EDGES_PER_NODE);
```

Find:
```ts
        let semanticLimit = limit;
        if (include_semantic_paths && current.depth > 0) {
            // Reduce semantic neighbor limit for farther hops (deeper nodes are less likely to be relevant).
            const decayMap = [limit, 3, 1];
            semanticLimit = decayMap[current.depth] ?? 0;
        }
```
Replace:
```ts
        let semanticLimit = limit ?? 15;
        if (include_semantic_paths && current.depth > 0) {
            semanticLimit = GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY[current.depth - 1] ?? 0;
        }
```

- [ ] **Step 3: Control graph output by `response_format` + `internalOpts`**

Find the final `data` object construction and replace:
```ts
    // Determine graph field based on response_format and caller intent.
    let graphField: { nodes: unknown[]; edges: unknown[] } | undefined;
    if (internalOpts?.includeGraph) {
        // UI caller: full graph data with all attributes.
        graphField = { nodes: graphVisualizationNodes, edges: graphVisualizationEdges };
    } else if (response_format === 'hybrid') {
        // Agent hybrid: slim graph (id/type/depth/path only, no attributes).
        graphField = {
            nodes: graphVisualizationNodes.map(n => ({
                id: n.id,
                type: n.type,
                depth: n.depth,
                ...(n.path ? { path: n.path } : {}),
            })),
            edges: graphVisualizationEdges.map(e => ({
                from_node_id: e.from_node_id,
                to_node_id: e.to_node_id,
                type: e.type,
                weight: e.weight,
            })),
        };
    }
    // structured + markdown: no graph field — agent only sees `levels`.

    const data = {
        isTimeOut,
        start_note_path,
        hops,
        levels,
        ...(graphField ? { graph: graphField } : {}),
    };
    return buildResponse(response_format, ToolTemplateId.GraphTraversal, data, { templateManager });
```

- [ ] **Step 4: Update `inspectorService.ts → runInspectorGraph`**

Find the `graphTraversal` call in `runInspectorGraph` and add `internalOpts`:
```ts
        const result = await graphTraversal(
            {
                start_note_path: startPath,
                hops,
                include_semantic_paths: includeSemantic,
                limit: 20,
                response_format: 'structured',
                mode: 'graph_traversal',
            },
            undefined,
            { includeGraph: true }
        );
```

- [ ] **Step 5: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 6: Commit**
```bash
git add src/service/tools/search-graph-inspector/graph-traversal.ts src/service/search/inspectorService.ts
git commit -m "feat: graph_traversal typed params + token inflation fix + GRAPH_TRAVERSAL constants"
```

---

### Task 8: Simple Typed Params — `inspect-note-context`, `local-search`, `recent-change-whole-vault`

**Files:**
- Modify: `src/service/tools/search-graph-inspector/inspect-note-context.ts`
- Modify: `src/service/tools/search-graph-inspector/local-search.ts`
- Modify: `src/service/tools/search-graph-inspector/recent-change-whole-vault.ts`

- [ ] **Step 1: Type `inspect-note-context.ts`**

Add at top:
```ts
import { z } from "zod/v3";
import { inspectNoteContextInputSchema } from "@/core/schemas/tools/searchGraphInspector";

type InspectNoteContextParams = z.infer<typeof inspectNoteContextInputSchema> & { mode?: string };
```
Change signature:
```ts
export async function inspectNoteContext(params: InspectNoteContextParams, templateManager?: TemplateManager)
```

- [ ] **Step 2: Type `local-search.ts`**

Add at top:
```ts
import { z } from "zod/v3";
import { localSearchWholeVaultInputSchema } from "@/core/schemas/tools/searchGraphInspector";
import type { SearchScopeValue } from "@/service/search/types";

type LocalSearchParams = z.infer<typeof localSearchWholeVaultInputSchema> & {
    mode?: string;
    scopeValue?: SearchScopeValue;
};
```
Change signature:
```ts
export async function localSearch(params: LocalSearchParams, templateManager?: TemplateManager)
```

- [ ] **Step 3: Type `recent-change-whole-vault.ts`**

Add at top:
```ts
import { z } from "zod/v3";
import { recentChangesWholeVaultInputSchema } from "@/core/schemas/tools/searchGraphInspector";

type RecentChangesParams = z.infer<typeof recentChangesWholeVaultInputSchema> & { mode?: string };
```
Change signature:
```ts
export async function getRecentChanges(params: RecentChangesParams, templateManager?: TemplateManager)
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 5: Commit**
```bash
git add src/service/tools/search-graph-inspector/inspect-note-context.ts \
        src/service/tools/search-graph-inspector/local-search.ts \
        src/service/tools/search-graph-inspector/recent-change-whole-vault.ts
git commit -m "refactor: typed params for inspect-note-context, local-search, recent-change-whole-vault"
```

---

### Task 9: `find-key-nodes.ts` — Typed Params + Remove Redundant DB Query

**Files:**
- Modify: `src/service/tools/search-graph-inspector/find-key-nodes.ts`

- [ ] **Step 1: Add typed params**

Add at top:
```ts
import { z } from "zod/v3";
import { findKeyNodesInputSchema } from "@/core/schemas/tools/searchGraphInspector";

type FindKeyNodesParams = z.infer<typeof findKeyNodesInputSchema> & { mode?: string };
```
Change signature:
```ts
export async function findKeyNodes(params: FindKeyNodesParams, templateManager?: TemplateManager)
```

- [ ] **Step 2: Remove the second `getTopNodeIdsByDegree` call**

Find:
```ts
    // Get degree stats only for candidate nodes
    // For two getTopNodeIdsByDegree query: Above RRF algorithm requires a sufficiently large node pool (500 nodes)
    //     to calculate accurate ranking scores, avoiding bias from considering too few nodes.
    //     Then we use the user-specified limit (a smaller number, e.g., 10-20) on top of this pool.
    const { topByOutDegree: candidateOutDegrees, topByInDegree: candidateInDegrees } =
        await mobiusEdgeRepo.getTopNodeIdsByDegree(limit, candidateNodeIds);
```
Replace with:
```ts
    // Extract degree data directly from already-fetched Maps — no second DB query needed.
    const candidateNodeIdSet = new Set(candidateNodeIds);
    const candidateOutDegrees = allOutDegreeStats
        .filter(stat => candidateNodeIdSet.has(stat.nodeId))
        .slice(0, limit ?? 20);
    const candidateInDegrees = allInDegreeStats
        .filter(stat => candidateNodeIdSet.has(stat.nodeId))
        .slice(0, limit ?? 20);
```

- [ ] **Step 3: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 4: Commit**
```bash
git add src/service/tools/search-graph-inspector/find-key-nodes.ts
git commit -m "perf: find-key-nodes typed params + remove redundant getTopNodeIdsByDegree DB query"
```

---

### Task 10: `find-orphans.ts` — Typed Params + Double-Filter Bug Fix

**Files:**
- Modify: `src/service/tools/search-graph-inspector/find-orphans.ts`

- [ ] **Step 1: Add typed params + import `ORPHAN_FETCH_LIMIT`**

Add at top:
```ts
import { z } from "zod/v3";
import { findOrphansInputSchema } from "@/core/schemas/tools/searchGraphInspector";
import { ORPHAN_FETCH_LIMIT } from "@/core/constant";

type FindOrphansParams = z.infer<typeof findOrphansInputSchema> & { mode?: string };
```
Change signature:
```ts
export async function findOrphanNotes(params: FindOrphansParams, templateManager?: TemplateManager)
```

- [ ] **Step 2: Fix double-filter and use `ORPHAN_FETCH_LIMIT`**

Replace the opening of the function body (from `const { filters, ... }` through `filteredHardOrphans = applyFiltersAndSorters(...)`):
```ts
    const { filters, sorter, limit, response_format } = params;
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    const hardOrphanIds = await mobiusEdgeRepo.getHardOrphans(ORPHAN_FETCH_LIMIT);
    const cadidateAllOrphanNodes: OrphanNode[] = [];

    if (hardOrphanIds.length > 0) {
        const hardOrphanNodeMap = await mobiusNodeRepo.getByIds(hardOrphanIds);
        for (const node of hardOrphanNodeMap.values()) {
            cadidateAllOrphanNodes.push({ ...node, orphanType: 'hard' });
        }
    }

    // NOT YET IMPLEMENTED: soft orphan detection (requires low-degree index on graph_nodes table)

    const itemFiledGetter = await getDefaultItemFiledGetter<OrphanNode>(
        cadidateAllOrphanNodes.map(node => node.id), filters, sorter
    );
    const finalAllOrphanNodes = applyFiltersAndSorters(
        cadidateAllOrphanNodes, filters, sorter, limit ?? 50, itemFiledGetter
    );
```
The rest of the function (revival suggestions, data construction) stays as-is.

- [ ] **Step 3: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 4: Commit**
```bash
git add src/service/tools/search-graph-inspector/find-orphans.ts
git commit -m "fix: find-orphans double-filter bug + typed params + ORPHAN_FETCH_LIMIT"
```

---

### Task 11: `search-by-dimensions.ts` — Typed Params + Structured Diagnosis

**Files:**
- Modify: `src/service/tools/search-graph-inspector/search-by-dimensions.ts`

- [ ] **Step 1: Add typed params**

Add at top:
```ts
import { z } from "zod/v3";
import { searchByDimensionsInputSchema } from "@/core/schemas/tools/searchGraphInspector";

type SearchByDimensionsParams = z.infer<typeof searchByDimensionsInputSchema> & { mode?: string };
```
Change signature:
```ts
export async function searchByDimensions(params: SearchByDimensionsParams, templateManager?: TemplateManager)
```

- [ ] **Step 2: Add diagnosis tracking to `findByExpressionWhere`**

Change return type and add tracking:
```ts
async function findByExpressionWhere(
    expressionTags: string[],
    expressionFunctionals: string[],
    expressionKeywords: string[],
): Promise<{
    success: boolean;
    data?: Map<string, GraphNode>;
    diagnosis: {
        unknown_tags: string[];
        unknown_functionals: string[];
        known_tags: string[];
        known_functionals: string[];
    };
}> {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    const tagLookupMap = await mobiusNodeRepo
        .getByTypeAndLabels(GraphNodeType.TopicTag, expressionTags)
        .then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
    const functionalLookupMap = await mobiusNodeRepo
        .getByTypeAndLabels(GraphNodeType.FunctionalTag, expressionFunctionals)
        .then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
    const keywordLookupMap = await mobiusNodeRepo
        .getByTypeAndLabels(GraphNodeType.KeywordTag, expressionKeywords)
        .then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));

    const diagnosis = {
        unknown_tags: expressionTags.filter(t => !tagLookupMap.has(t)),
        unknown_functionals: expressionFunctionals.filter(f => !functionalLookupMap.has(f)),
        known_tags: expressionTags.filter(t => tagLookupMap.has(t)),
        known_functionals: expressionFunctionals.filter(f => functionalLookupMap.has(f)),
    };

    const allTargetNodeIds: string[] = [];
    tagLookupMap.forEach((id) => allTargetNodeIds.push(id));
    functionalLookupMap.forEach((id) => allTargetNodeIds.push(id));
    keywordLookupMap.forEach((id) => allTargetNodeIds.push(id));

    if (allTargetNodeIds.length === 0) {
        return { success: false, diagnosis };
    }

    const documentIds = await mobiusEdgeRepo.getSourceNodesConnectedToAllTargets(allTargetNodeIds);
    if (documentIds.length === 0) {
        return { success: false, diagnosis };
    }

    return { success: true, data: await mobiusNodeRepo.getByIds(documentIds), diagnosis };
}
```

- [ ] **Step 3: Update `searchByDimensions` to use structured diagnosis on failure**

Find the result handling after `findByExpressionWhere` call. Replace the error return:
```ts
    const { success: matchingDocumentsSuccess, message: matchingDocumentsMessage, data: matchingExpressionDocNodes } =
        await findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords);
    if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
        return matchingDocumentsMessage || 'Error finding matching documents.';
    }
```
With:
```ts
    const { success: matchingDocumentsSuccess, data: matchingExpressionDocNodes, diagnosis } =
        await findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords);

    if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
        const hasUnknown = diagnosis.unknown_tags.length > 0 || diagnosis.unknown_functionals.length > 0;
        const suggestion = hasUnknown
            ? "Some tags/functionals not found in vault — check spelling or try local_search_whole_vault."
            : "All tags exist but AND intersection is empty — try relaxing constraints with OR logic.";
        const diagData = {
            boolean_expression,
            matched: 0,
            diagnosis: { ...diagnosis, suggestion },
        };
        return buildResponse(response_format, ToolTemplateId.SearchByDimensions, diagData, { templateManager });
    }
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 5: Commit**
```bash
git add src/service/tools/search-graph-inspector/search-by-dimensions.ts
git commit -m "feat: search-by-dimensions typed params + structured diagnosis on empty results"
```

---

### Task 12: `explore-folder.ts` + `hub-local-graph.ts` — Typed Params + Fixes

**Files:**
- Modify: `src/service/tools/search-graph-inspector/explore-folder.ts`
- Modify: `src/service/tools/search-graph-inspector/hub-local-graph.ts`
- Modify: `src/service/search/inspectorService.ts`

- [ ] **Step 1: Type `explore-folder.ts` + use `EXPLORE_FOLDER_DEFAULT_LIMIT`**

Add at top:
```ts
import { z } from "zod/v3";
import { exploreFolderInputSchema } from "@/core/schemas/tools/searchGraphInspector";
import { EXPLORE_FOLDER_DEFAULT_LIMIT } from "@/core/constant";

type ExploreFolderParams = z.infer<typeof exploreFolderInputSchema> & { mode?: string };
```
Change signature:
```ts
export async function exploreFolder(params: ExploreFolderParams, templateManager?: TemplateManager)
```

Remove `const DEFAULT_LIMIT = 50;` and update its usage:
```ts
    const perFolderLimit = Math.max(1, Number(limit) ?? EXPLORE_FOLDER_DEFAULT_LIMIT);
```

- [ ] **Step 2: Type `hub-local-graph.ts` + add `internalOpts` + slim agent output**

Replace the function signature and add type:
```ts
import { z } from "zod/v3";
import { hubLocalGraphInputSchema } from "@/core/schemas/tools/searchGraphInspector";

type HubLocalGraphParams = z.infer<typeof hubLocalGraphInputSchema> & { mode?: string };
type HubLocalGraphInternalOpts = { includeWeightDetails?: boolean };

export async function hubLocalGraph(
    params: HubLocalGraphParams,
    templateManager?: TemplateManager,
    internalOpts?: HubLocalGraphInternalOpts,
)
```

In the node/edge mapping inside `data`, replace:
```ts
            nodes: local.nodes.map((node) => {
                const base = {
                    id: node.nodeId,
                    label: node.label,
                    type: node.type,
                    depth: node.depth,
                    path: node.path,
                    roleHint: node.roleHint,
                };
                if (internalOpts?.includeWeightDetails) {
                    return {
                        ...base,
                        attributes: {
                            hubNodeWeight: node.hubNodeWeight,
                            distancePenalty: node.distancePenalty,
                            cohesionScore: node.cohesionScore,
                            bridgePenalty: node.bridgePenalty,
                            expandPriority: node.expandPriority,
                        },
                    };
                }
                return base;
            }),
            edges: local.edges.map((edge) => {
                const base = {
                    from_node_id: edge.fromNodeId,
                    to_node_id: edge.toNodeId,
                    type: edge.edgeType,
                    weight: edge.hubEdgeWeight,
                };
                if (internalOpts?.includeWeightDetails) {
                    return {
                        ...base,
                        attributes: {
                            hubEdgeWeight: edge.hubEdgeWeight,
                            edgeTypeWeight: edge.edgeTypeWeight,
                            semanticSupport: edge.semanticSupport,
                            crossBoundaryPenalty: edge.crossBoundaryPenalty,
                        },
                    };
                }
                return base;
            }),
```

- [ ] **Step 3: Update `inspectorService.ts → runInspectorHubLocalGraph`**

Find the `hubLocalGraph` call in `runInspectorHubLocalGraph` and add `internalOpts`:
```ts
        const result = await hubLocalGraph(
            {
                center_note_path: startPath,
                max_depth: maxDepth,
                response_format: 'structured',
            },
            undefined,
            { includeWeightDetails: true }
        );
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 5: Commit**
```bash
git add src/service/tools/search-graph-inspector/explore-folder.ts \
        src/service/tools/search-graph-inspector/hub-local-graph.ts \
        src/service/search/inspectorService.ts
git commit -m "feat: explore-folder + hub-local-graph typed params; hub slim agent output via internalOpts"
```

---

### Task 13: `find-path` — Restructure Into Directory + Strategy Routing

The old `find-path.ts` (19k tokens) is split into 6 focused files. **Read `find-path.ts` fully before starting this task.**

**Files:**
- Create: `src/service/tools/search-graph-inspector/find-path/types.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/scorer.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/reliable.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/fast-track.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/brainstorm.ts`
- Create: `src/service/tools/search-graph-inspector/find-path/index.ts`
- Delete: `src/service/tools/search-graph-inspector/find-path.ts`
- Modify: `src/service/search/inspectorService.ts`

- [ ] **Step 1: Create `find-path/types.ts`**

Create `src/service/tools/search-graph-inspector/find-path/types.ts`:
```ts
/**
 * Shared types, interfaces, and constants for find-path strategies.
 */

export interface PathSegment {
    nodeId: string;
    type: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

export interface NeighborNode {
    id: string;
    foundBy: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

export type StrategyType = 'reliable' | 'fastTrack' | 'brainstorm';

export interface PathScore {
    totalScore: number;
    physicalRatio: number;
    avgSimilarity: number;
    uniqueness: number;
    freshness: number;
    domainJumps: number;
    length: number;
}

export interface ScoredPath {
    segments: PathSegment[];
    strategy: StrategyType;
    score: PathScore;
    insightLabel: string;
    reasoning: string;
}

export interface AStarNode {
    nodeId: string;
    gCost: number;
    hCost: number;
    fCost: number;
    parent: AStarNode | null;
    connectionType: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

export interface SearchContext {
    startId: string;
    endId: string;
    startVector: number[] | null;
    endVector: number[] | null;
    maxHops: number;
    filters?: unknown;
    forbiddenEdges: Set<string>;
    includeSemantic: boolean;
    excludedDocIds: Set<string>;
}

export const EDGE_WEIGHTS = {
    physical: 1.0,
    semantic: 1.5,
    consecutiveSemantic: 2.0,
} as const;

export const SIMILARITY_THRESHOLD = 0.5;
export const MAX_CONSECUTIVE_SEMANTIC = 3;
export const PATH_STRING_SEPARATOR = ' -> ';

export const SCORE_WEIGHTS = {
    physicalRatio: 0.35,
    freshness: 0.25,
    domainJumps: 0.20,
    uniqueness: 0.15,
    lengthPenalty: 0.05,
} as const;
```

- [ ] **Step 2: Create `find-path/scorer.ts`**

Create `src/service/tools/search-graph-inspector/find-path/scorer.ts`.

Move from `find-path.ts` into this file (copy the full implementation bodies):
- `scoreAndRankPaths(rawPaths, context)` — scores and deduplicates paths
- All private helpers it calls: `calculatePathScore`, `calculateUniqueness`, `calculateFreshness`, `calculateDomainJumps`, etc.
- `buildPathString(segments, labelMap)`
- `getNodeLabel(nodeId)`

File header:
```ts
import { ScoredPath, PathScore, PathSegment, SearchContext, StrategyType, SCORE_WEIGHTS, PATH_STRING_SEPARATOR } from './types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export async function scoreAndRankPaths(
    rawPaths: Array<{ segments: PathSegment[]; strategy: StrategyType }>,
    context: SearchContext,
): Promise<ScoredPath[]> { /* copy from find-path.ts */ }

export function buildPathString(segments: PathSegment[], labelMap: Map<string, string>): string { /* copy */ }

export async function getNodeLabel(nodeId: string): Promise<string> { /* copy */ }
```

- [ ] **Step 3: Create `find-path/reliable.ts`**

Create `src/service/tools/search-graph-inspector/find-path/reliable.ts`.

Move `executeReliableStrategy` from `find-path.ts` (the bidirectional BFS implementation). Header:
```ts
import { SearchContext, PathSegment, StrategyType, EDGE_WEIGHTS } from './types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { isIndexedNoteNodeType } from '@/core/po/graph.po';

export async function executeReliableStrategy(
    context: SearchContext
): Promise<Array<{ segments: PathSegment[]; strategy: StrategyType }>>
```

- [ ] **Step 4: Create `find-path/fast-track.ts`**

Create `src/service/tools/search-graph-inspector/find-path/fast-track.ts`.

Move `executeFastTrackStrategy` (A* with semantic gravity field). Header:
```ts
import { SearchContext, PathSegment, StrategyType, AStarNode, EDGE_WEIGHTS, SIMILARITY_THRESHOLD, MAX_CONSECUTIVE_SEMANTIC } from './types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { isIndexedNoteNodeType } from '@/core/po/graph.po';

export async function executeFastTrackStrategy(
    context: SearchContext
): Promise<Array<{ segments: PathSegment[]; strategy: StrategyType }>>
```

- [ ] **Step 5: Create `find-path/brainstorm.ts`**

Create `src/service/tools/search-graph-inspector/find-path/brainstorm.ts`.

Move `executeBrainstormStrategy` (forced cross-domain bridge discovery). Header:
```ts
import { SearchContext, PathSegment, StrategyType } from './types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { isIndexedNoteNodeType } from '@/core/po/graph.po';

export async function executeBrainstormStrategy(
    context: SearchContext
): Promise<Array<{ segments: PathSegment[]; strategy: StrategyType }>>
```

Do NOT copy `executeTemporalStrategy` — it is deleted.

- [ ] **Step 6: Create `find-path/index.ts`**

Create `src/service/tools/search-graph-inspector/find-path/index.ts`:
```ts
import { z } from "zod/v3";
import { findPathInputSchema } from "@/core/schemas/tools/searchGraphInspector";
import { GRAPH_INSPECT_STEP_TIME_LIMIT, PATH_FINDING_CONSTANTS } from "@/core/constant";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { buildResponse, withTimeoutMessage } from "../../types";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { executeReliableStrategy } from './reliable';
import { executeFastTrackStrategy } from './fast-track';
import { executeBrainstormStrategy } from './brainstorm';
import { scoreAndRankPaths, buildPathString } from './scorer';
import type { SearchContext } from './types';

export { PATH_STRING_SEPARATOR } from './types';

type FindPathParams = z.infer<typeof findPathInputSchema> & { mode?: string };

export async function findPath(params: FindPathParams, templateManager?: TemplateManager) {
    const { start_note_path, end_note_path, strategy, max_paths, include_semantic_paths, response_format, filters } = params;
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();

    const [startIndexedDoc, endIndexedDoc] = await Promise.all([
        sqliteStoreManager.getIndexedDocumentRepo().getByPath(start_note_path),
        sqliteStoreManager.getIndexedDocumentRepo().getByPath(end_note_path),
    ]);
    if (!startIndexedDoc || !endIndexedDoc) {
        return `# Path Finding Failed\n\n`
            + `${!startIndexedDoc ? `Start note "${start_note_path}" not found.` : ''}`
            + `${!endIndexedDoc ? `End note "${end_note_path}" not found.` : ''}`;
    }

    const [startNode, endNode] = await Promise.all([
        mobiusNodeRepo.getById(startIndexedDoc.id),
        mobiusNodeRepo.getById(endIndexedDoc.id),
    ]);
    if (!startNode || !endNode) {
        return `# Path Finding Failed\n\nOne or both graph nodes not found.`;
    }

    // Only pre-fetch vectors when a strategy actually needs them.
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
    const [startVector, endVector] = strategy === 'reliable'
        ? ([null, null] as [null, null])
        : await Promise.all([
            embeddingRepo.getEmbeddingForSemanticSearch(startNode.id),
            embeddingRepo.getEmbeddingForSemanticSearch(endNode.id),
        ]);

    const context: SearchContext = {
        startId: startNode.id,
        endId: endNode.id,
        startVector,
        endVector,
        maxHops: PATH_FINDING_CONSTANTS.MAX_HOPS_LIMIT,
        filters,
        forbiddenEdges: new Set(),
        includeSemantic: include_semantic_paths ?? false,
        excludedDocIds: new Set<string>(),
    };

    const strategyFn = strategy === 'fastTrack' ? executeFastTrackStrategy
        : strategy === 'brainstorm' ? executeBrainstormStrategy
        : executeReliableStrategy;

    const timeoutResult = await withTimeoutMessage(
        (async () => {
            const rawPaths = await strategyFn(context);
            const scored = await scoreAndRankPaths(rawPaths, context);
            return scored.slice(0, max_paths ?? 3);
        })(),
        GRAPH_INSPECT_STEP_TIME_LIMIT,
        `Path finding from "${start_note_path}" to "${end_note_path}"`
    );

    if (!timeoutResult.success) {
        return `# Path Finding Timeout\n\n**${timeoutResult.message}**\n\nTry strategy 'reliable', fewer hops, or different notes.`;
    }

    const scoredPaths = timeoutResult.data;
    const allNodeIds = new Set(scoredPaths.flatMap(p => p.segments.map(s => s.nodeId)));
    const nodesMap = await mobiusNodeRepo.getByIds([...allNodeIds]);
    const labelMap = new Map<string, string>();
    for (const [id, node] of nodesMap) {
        labelMap.set(id, node.label || id);
    }

    const paths = scoredPaths.map(p => ({
        pathString: buildPathString(p.segments, labelMap),
        strategy: p.strategy,
        score: p.score.totalScore,
        insightLabel: p.insightLabel,
        reasoning: p.reasoning,
    }));

    const data = { start_note_path, end_note_path, strategy, paths, pathCount: paths.length };
    return buildResponse(response_format, ToolTemplateId.GraphPathFinding, data, { templateManager });
}
```

- [ ] **Step 7: Update `inspectorService.ts → runInspectorPath`**

Find `runInspectorPath`. Replace the `findPath` call and result parsing:
```ts
        const result = await findPath({
            start_note_path: startPath,
            end_note_path: endPath,
            strategy: 'reliable',
            max_paths: 3,
            include_semantic_paths: false,
            response_format: 'hybrid',
            mode: 'find_path',
        });
        if (typeof result === 'string') {
            if (result.includes('Failed') || result.includes('Timeout')) {
                return { error: result };
            }
            return { markdown: result };
        }
        const paths = (result as any)?.paths?.map((p: any) =>
            typeof p === 'string' ? p : (p.pathString ?? String(p))
        );
        if (paths?.length) {
            return { paths };
        }
        return {};
```

- [ ] **Step 8: Delete old flat file**
```bash
git rm src/service/tools/search-graph-inspector/find-path.ts
```

- [ ] **Step 9: Build**
```bash
npm run build
```
Expected: exits 0. If TS errors appear in the new strategy files, they're from missed imports — fix by adding the missing import from `./types` or the relevant DB repo.

- [ ] **Step 10: Commit**
```bash
git add src/service/tools/search-graph-inspector/find-path/ src/service/search/inspectorService.ts
git commit -m "refactor: split find-path into strategy modules (reliable/fastTrack/brainstorm) + expose strategy to agent"
```

---

### Task 14: Tool Descriptions — All 11 Tools

**Files:**
- Modify: `src/service/tools/search-graph-inspector.ts`

Replace each tool's `description` field. Format: `[Core capability]\n\nWhen to use:\n• ...\n\nAvoid when:\n• ...`

- [ ] **Step 1: `inspectNoteContextTool`**
```ts
        description:
            `Inspect a single note's full identity: tags, functional categories, in/out links, and semantic neighbors.\n\n` +
            `When to use:\n` +
            `• After local_search finds a candidate — understand it fully before adding as evidence\n` +
            `• When you need the exact tags or functional categories of a specific note\n\n` +
            `Avoid when:\n` +
            `• Inspecting multiple notes in bulk — use graph_traversal from a common anchor instead`,
```

- [ ] **Step 2: `graphTraversalTool`**
```ts
        description:
            `BFS exploration from a start note across N hops of physical and optional semantic links. Returns depth-grouped neighbor clusters.\n\n` +
            `When to use:\n` +
            `• Understanding a note's knowledge neighborhood (1-2 hops for direct cluster; 3 hops only when too sparse)\n` +
            `• Expanding from an anchor note to discover related documents\n\n` +
            `Avoid when:\n` +
            `• Analyzing a hub note's structure → hub_local_graph\n` +
            `• Finding the shortest path between two notes → find_path`,
```

- [ ] **Step 3: `hubLocalGraphTool`**
```ts
        description:
            `Weighted local graph expansion around one hub-like note. Each node has a roleHint field: hub/leaf/bridge.\n\n` +
            `When to use:\n` +
            `• Understanding the influence radius of a candidate hub note\n` +
            `• roleHint='hub' → influential connector; 'bridge' → cross-domain link; 'leaf' → endpoint\n\n` +
            `Avoid when:\n` +
            `• Broad neighborhood exploration → graph_traversal\n` +
            `• Vault-wide important notes → find_key_nodes`,
```

- [ ] **Step 4: `findPathTool`**
```ts
        description:
            `Discover connection paths between two known notes.\n` +
            `Strategies: 'reliable' (shortest physical chain), 'fastTrack' (A* semantic guidance), 'brainstorm' (cross-domain jumps).\n\n` +
            `When to use:\n` +
            `• "How are note A and note B related?" — use 'reliable' by default\n` +
            `• 'fastTrack' when physical links are sparse; 'brainstorm' for creative discovery\n\n` +
            `Avoid when:\n` +
            `• You don't know both endpoints → graph_traversal for open-ended exploration`,
```

- [ ] **Step 5: `findKeyNodesTool`**
```ts
        description:
            `Vault-wide influential note discovery using RRF on degree centrality + optional semantic filter.\n` +
            `Node types: hub (many outgoing), authority (many incoming), bridge (cross-category), balanced.\n\n` +
            `When to use:\n` +
            `• Orientation at recon start — find the most important notes in a topic area\n` +
            `• semantic_filter narrows to topic-relevant hubs\n\n` +
            `Avoid when:\n` +
            `• You already have a starting note → inspect_note_context or graph_traversal`,
```

- [ ] **Step 6: `findOrphansTool`**
```ts
        description:
            `Find disconnected notes (no physical links) with semantic revival suggestions.\n` +
            `Each result includes revival_suggestion: the nearest semantically similar non-orphan note.\n\n` +
            `When to use:\n` +
            `• Knowledge base maintenance — finding isolated notes that should be linked\n\n` +
            `Avoid when:\n` +
            `• You need search results — this is a maintenance tool, not a discovery tool`,
```

- [ ] **Step 7: `searchByDimensionsTool`**
```ts
        description:
            `Boolean-expression filter over tag and functional dimensions. Values must be single words.\n` +
            `Syntax: tag:value, functional:value with AND / OR / NOT and parentheses.\n\n` +
            `When to use:\n` +
            `• You know the tag/category structure (e.g. tag:javascript AND functional:programming)\n` +
            `• On failure: check diagnosis.unknown_tags (misspelling) vs diagnosis.known_tags (try OR)\n\n` +
            `Avoid when:\n` +
            `• Searching by content keywords → local_search_whole_vault`,
```

- [ ] **Step 8: `exploreFolderTool`**
```ts
        description:
            `Inspect vault folder structure with per-folder item caps and extension summaries.\n\n` +
            `When to use:\n` +
            `• After grep_file_tree finds a folder anchor — see its full contents\n` +
            `• max_depth=1 for quick browse, 2 standard, 3 for deep structure mapping\n` +
            `• Ideas/project folders rarely surfaced by semantic search\n\n` +
            `Avoid when:\n` +
            `• Only checking if a path exists → grep_file_tree`,
```

- [ ] **Step 9: `grepFileTreeTool`**
```ts
        description:
            `Pattern-match (regex or substring) against all vault file paths. Returns matching paths only — no content.\n\n` +
            `When to use:\n` +
            `• First step to find anchor paths or folder names before deeper exploration\n` +
            `• Fastest path-discovery tool available — use its output as input to explore_folder or graph_traversal`,
```

- [ ] **Step 10: `recentChangesWholeVaultTool`**
```ts
        description:
            `View recently modified notes sorted by last-modified time.\n\n` +
            `When to use:\n` +
            `• At recon start — establish the user's current work focus\n` +
            `• Gives temporal context before running targeted searches\n\n` +
            `Avoid when:\n` +
            `• You need precise search results — this is orientation, not discovery`,
```

- [ ] **Step 11: `localSearchWholeVaultTool`**
```ts
        description:
            `Full-text, vector, or hybrid search across vault content.\n\n` +
            `When to use:\n` +
            `• Finding notes by keyword (fulltext), concept (vector), or both (hybrid — default)\n` +
            `• scopeMode=inFolder restricts to a subtree; limitIdsSet to search within a pre-found set\n\n` +
            `Avoid when:\n` +
            `• You know the tag/category structure → search_by_dimensions`,
```

- [ ] **Step 12: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 13: Commit**
```bash
git add src/service/tools/search-graph-inspector.ts
git commit -m "docs: rewrite all 11 tool descriptions with When-to-use/Avoid-when format"
```

---

### Task 15: Recon System Prompt — Tool Selection Guide

**Files:**
- Modify: `templates/prompts/ai-analysis-vault-recon-plan-system.md`

- [ ] **Step 1: Append tool selection guide**

At the end of `templates/prompts/ai-analysis-vault-recon-plan-system.md`, append:
```markdown

## Tool Selection Guide

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
| Identify vault-wide important notes | `find_key_nodes` |
| Understand user's current focus | `recent_changes_whole_vault` |

**Typical recon sequence:** `recent_changes_whole_vault` → `grep_file_tree` → `local_search_whole_vault` → `inspect_note_context` / `graph_traversal`
```

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Commit**
```bash
git add templates/prompts/ai-analysis-vault-recon-plan-system.md
git commit -m "docs: add tool selection guide to recon system prompt"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Full production build**
```bash
npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 2: No MarkdownOnly variants remain**
```bash
grep -r "MarkdownOnly" src/
```
Expected: no output.

- [ ] **Step 3: No `params: any` in implementation files**
```bash
grep -n "params: any" src/service/tools/search-graph-inspector/
```
Expected: no output.

- [ ] **Step 4: Old flat `find-path.ts` is gone**
```bash
ls src/service/tools/search-graph-inspector/find-path.ts 2>&1
```
Expected: `No such file or directory`

- [ ] **Step 5: New `find-path/` directory has 6 files**
```bash
ls src/service/tools/search-graph-inspector/find-path/
```
Expected: `brainstorm.ts  fast-track.ts  index.ts  reliable.ts  scorer.ts  types.ts`

- [ ] **Step 6: `time-within-normalize.json` exists**
```bash
ls templates/config/time-within-normalize.json
```
Expected: file listed.
