# Codebase Deep Refactor — 127k → 60k Lines

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically reduce the codebase from 127k to ~60k lines by eliminating dead code, consolidating duplicated patterns, simplifying over-engineered subsystems, and removing unused abstractions — while preserving all user-facing functionality.

**Architecture:** Bottom-up reduction in 6 waves. Wave 0 removes pure dead code (zero risk). Waves 1–3 consolidate subsystems with duplicate/unused patterns. Waves 4–5 simplify over-engineered architectures. Each wave is independently testable and committable.

**Tech Stack:** TypeScript, React 18, Zustand, SQLite (Kysely), Obsidian API, Claude Agent SDK

---

## Reduction Budget

| Wave | Target Area | Current | Target | Δ Lines |
|------|-------------|---------|--------|---------|
| 0 | Dead code & files | — | — | -12,000 |
| 1 | Storage repos & DDL | 15,000 | 9,000 | -6,000 |
| 2 | Search index (hub+backbone+cascade) | 18,000 | 10,000 | -8,000 |
| 3 | UI views & components | 48,000 | 32,000 | -16,000 |
| 4 | Document loaders & utils | 8,900 | 5,000 | -3,900 |
| 5 | Service layer (agents+tools+chat) | 16,000 | 10,000 | -6,000 |
| **Total** | | **127,162** | **~75,000** | **~-52,000** |

> Conservative target: 75k. Aggressive target: 60k if Waves 3–5 hit their full potential.

---

## Wave 0: Dead Code Purge (est. -12,000 lines, ZERO RISK)

### Task 0.1: Delete `tmp_code_ref_for_cursor/`

**Files:**
- Delete: `tmp_code_ref_for_cursor/` (entire directory, 19 files, ~5,711 lines)

- [ ] **Step 1: Verify zero references**
```bash
grep -r "tmp_code_ref" src/ --include="*.ts" --include="*.tsx" -l
# Expected: empty
```

- [ ] **Step 2: Delete**
```bash
rm -rf tmp_code_ref_for_cursor/
```

- [ ] **Step 3: Commit**
```bash
git add -A tmp_code_ref_for_cursor/
git commit -m "chore: delete dead tmp_code_ref_for_cursor directory (-5711 lines)"
```

---

### Task 0.2: Delete `src/desktop/` Mock System

**Files:**
- Delete: `src/desktop/` (entire directory, ~3,715 lines)

- [ ] **Step 1: Verify no production imports**
```bash
grep -r "from.*desktop/" src/ --include="*.ts" --include="*.tsx" -l | grep -v "src/desktop/"
# Expected: empty (desktop/ is a standalone dev app)
```

- [ ] **Step 2: Check build config doesn't reference it**
```bash
grep -r "desktop" esbuild*.js tsconfig.json 2>/dev/null
```

- [ ] **Step 3: Delete and remove any dev scripts referencing it**
```bash
rm -rf src/desktop/
```

- [ ] **Step 4: Commit**
```bash
git add -A src/desktop/
git commit -m "chore: remove desktop mock system (-3715 lines)"
```

---

### Task 0.3: Delete `src/app/context/index-debug-tools.ts`

**Files:**
- Delete: `src/app/context/index-debug-tools.ts` (1,265 lines)
- Modify: `src/app/context/AppContext.ts` — remove import and registration of debug tools

- [ ] **Step 1: Find all references**
```bash
grep -r "index-debug-tools\|indexDebugTools\|debugTools" src/ --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 2: Remove import/registration from AppContext**

In `src/app/context/AppContext.ts`, remove the import and any method that registers debug tools on `window` or exposes them.

- [ ] **Step 3: Delete the file**
```bash
rm src/app/context/index-debug-tools.ts
```

- [ ] **Step 4: Build check**
```bash
npm run build
```

- [ ] **Step 5: Commit**
```bash
git add src/app/context/
git commit -m "chore: remove index-debug-tools (-1265 lines, dev-only diagnostics)"
```

---

### Task 0.4: Purge Unused Repository Methods

**Files:**
- Modify: `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts` — delete 17 unused methods
- Modify: `src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts` — delete 18 unused methods
- Modify: `src/core/storage/sqlite/repositories/GraphRepo.ts` — delete 8 unused methods
- Modify: `src/core/storage/sqlite/repositories/EmbeddingRepo.ts` — delete 5 unused methods
- Modify: `src/core/storage/sqlite/repositories/StructuralMetricsRepo.ts` — delete 5 unused methods
- Modify: `src/core/storage/sqlite/repositories/ChatProjectRepo.ts` — delete 4 unused methods
- Modify: `src/core/storage/sqlite/repositories/ChatStarRepo.ts` — delete 3 unused methods
- Modify: `src/core/storage/sqlite/repositories/ChatConversationRepo.ts` — delete 3 unused methods
- Modify: `src/core/storage/sqlite/repositories/IndexedDocumentRepo.ts` — delete 4 unused methods
- Modify: `src/core/storage/sqlite/repositories/IndexStateRepo.ts` — delete 2 unused methods
- Modify: `src/core/storage/sqlite/repositories/DocChunkRepo.ts` — delete 2 unused methods
- Modify: `src/core/storage/sqlite/repositories/VaultLintRepo.ts` — delete 2 unused methods
- Modify: Various other repos with 1 unused method each

**Estimated reduction: ~2,500 lines**

- [ ] **Step 1: For each repo, verify each method is truly unused**

Run for each file:
```bash
# Example for MobiusNodeRepo
grep "async " src/core/storage/sqlite/repositories/MobiusNodeRepo.ts | sed 's/.*async //' | sed 's/(.*//' | while read func; do
  count=$(grep -r "$func" src/ --include="*.ts" --include="*.tsx" -l | grep -v "MobiusNodeRepo.ts" | wc -l)
  if [ "$count" -eq 0 ]; then echo "DELETE: $func"; fi
done
```

Known unused in MobiusNodeRepo:
- `listNodeIdsByTypesKeyset`, `listAllDocLikeNodeIds`, `existsByNodeId`, `upsertMobiusRow`
- `updatePathAndDocumentFields`, `existsByDocId`, `insertDocumentStatistics`
- `updateDocumentStatisticsByDocId`, `upsertDocumentStatistics`, `getTopByRichness`
- `computeIncomingDocDegreeCountsBatch`, `computeOutgoingDocDegreeCountsBatch`
- `listDocumentNodesForHubDiscovery`, `getDocumentNodeForHubByPath`
- `listDocumentNodeIdPathByIds`, `listDocumentPathsByPathPrefix`, `countDocumentNodes`

Known unused in MobiusEdgeRepo:
- `countOutgoingEdges`, `countIncomingEdgesFromEdgeTable`, `countOutgoingEdgesFromEdgeTable`
- `countIncomingEdgesFromNodeColumns`, `countOutgoingEdgesFromNodeColumns`, `getBetweenNodes`
- `*iterateMobiusEdgeBatchesWithEndpointMetadata`, `loadMobiusNodeTypePathByIds`
- `*iterateReferenceEdgeBatches`, `*iterateSemanticRelatedEdgeBatches`
- `getByCustomWhere`, `getNodesWithZeroOutDegree`, `getNodesWithZeroInDegree`
- `listDocIdsFromTaggedTopicExcluding`, `deleteBetweenNodes`
- `getDegreeMapsByNodeIdsChunked`, `getIntraEdges`, `getExternalEdgeCountsChunked`

Known unused in GraphRepo:
- 8 of 15 methods (53%) — re-verify each at deletion time

- [ ] **Step 2: Delete methods in batches per file**

For each repo file, delete all confirmed-unused methods. Ensure no internal calls within the repo file itself.

- [ ] **Step 3: Build check**
```bash
npm run build
```

- [ ] **Step 4: Run tests**
```bash
npm run test
```

- [ ] **Step 5: Commit**
```bash
git add src/core/storage/sqlite/repositories/
git commit -m "chore: purge ~75 unused repository methods (-2500 lines)"
```

---

### Task 0.5: Purge Unused Hooks, Utils, and Dead Exports

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useAIAnalysisPostAIInteractions.ts` — delete 6 unused hooks
- Modify: `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts` — delete 3 unused exports
- Modify: `src/core/utils/ttl-cache.ts` — DELETE entire file (108 lines, zero importers)
- Modify: `src/core/utils/hash-utils.ts` — delete `calculateFileHash` (unused)
- Modify: `src/core/utils/date-utils.ts` — delete `formatRelativeDate` (unused, duplicates `humanReadableTime`)
- Modify: `src/core/utils/format-utils.ts` — delete internal `LRUCache` class (duplicates TtlCache pattern)
- Modify: `src/core/document/helper/TagService.ts` — delete deprecated `TopicFunctionalTagResult` type
- Modify: `src/core/document/loader/helper/textRank.ts` — delete deprecated `mergeUserAndTextRankKeywords`
- Modify: `src/service/search/query/queryService.ts` — delete 4 unused methods

**Estimated reduction: ~800 lines**

- [ ] **Step 1: Verify and delete each**

Unused hooks in `useAIAnalysisPostAIInteractions.ts`:
- `useRegenerateOverviewMermaid`
- `useGraphFollowupChatConfig`
- `useSummaryFollowupChatConfig`
- `useContinueAnalysisFollowupChatConfig`
- `useBlocksFollowupChatConfig`
- `useSourcesFollowupChatConfig`
- `useTopicFollowupChatConfig`

Unused in `useAIAnalysisResult.ts`:
- `convertSourcesToSearchResultItems`
- `useAnalyzeTopicResults`
- `useAnalyzeGraphResults`

- [ ] **Step 2: Build check**
```bash
npm run build
```

- [ ] **Step 3: Commit**
```bash
git commit -m "chore: purge unused hooks, utils, and dead exports (-800 lines)"
```

---

### Task 0.6: Clean `console.log` / `console.debug` Statements

**Files:**
- Modify: ~50 files across src/

277 console.log/debug statements exist across the codebase. Keep only error/warn level logging and intentional debug-gated logs.

- [ ] **Step 1: Audit**
```bash
grep -rn "console\.log\|console\.debug" src/ --include="*.ts" --include="*.tsx" | grep -v "// " | wc -l
```

- [ ] **Step 2: Remove non-essential logs** (keep console.error, console.warn, and logs behind `DEBUG` flags)

- [ ] **Step 3: Build + commit**

---

**Wave 0 Total: ~12,000 lines removed**

---

## Wave 1: Storage Layer Consolidation (est. -6,000 lines)

### Task 1.1: Slim Down DDL & Remove Unused Tables

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts:1-951`

- [ ] **Step 1: Audit which tables are actually queried**

For each `CREATE TABLE` in ddl.ts, grep for the table name across all repo files:
```bash
grep "CREATE TABLE" src/core/storage/sqlite/ddl.ts | sed "s/.*CREATE TABLE IF NOT EXISTS //" | sed "s/ .*//" | while read tbl; do
  count=$(grep -r "$tbl" src/core/storage/sqlite/repositories/ --include="*.ts" -l | wc -l)
  echo "$count repos use: $tbl"
done
```

- [ ] **Step 2: Remove DDL for unused tables**
- [ ] **Step 3: Remove corresponding TypeScript interfaces**
- [ ] **Step 4: Build check + commit**

---

### Task 1.2: Merge MobiusNodeRepo + IndexedDocumentRepo

**Files:**
- Modify: `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts:1-2048` (after Task 0.4 pruning)
- Delete: `src/core/storage/sqlite/repositories/IndexedDocumentRepo.ts` (676 lines)
- Modify: All consumers of IndexedDocumentRepo

`IndexedDocumentRepo` is a projected view over `mobius_node` where `type IN ('document', 'hub_doc')`. After deleting its unused methods, merge the remaining methods into `MobiusNodeRepo` as filtered queries.

- [ ] **Step 1: List IndexedDocumentRepo consumers**
```bash
grep -r "IndexedDocumentRepo\|indexedDocumentRepo\|getIndexedDocumentRepo" src/ --include="*.ts" -l
```

- [ ] **Step 2: Move remaining used methods to MobiusNodeRepo**
- [ ] **Step 3: Update all consumers to use MobiusNodeRepo**
- [ ] **Step 4: Delete IndexedDocumentRepo.ts**
- [ ] **Step 5: Update SqliteStoreManager to remove IndexedDocumentRepo construction**
- [ ] **Step 6: Build check + test + commit**

---

### Task 1.3: Simplify DatabaseHealthVerifier

**Files:**
- Modify: `src/core/storage/sqlite/DatabaseHealthVerifier.ts:1-559`

559 lines for health verification is excessive. Core function: check integrity, verify WAL mode, run vacuum if needed.

- [ ] **Step 1: Read the full file and identify essential vs optional checks**
- [ ] **Step 2: Reduce to ~150 lines** — keep: `PRAGMA integrity_check`, WAL mode check, basic table existence. Remove: verbose diagnostic output, repair logic, edge-case workarounds
- [ ] **Step 3: Build check + commit**

---

### Task 1.4: Simplify NativeModuleManager

**Files:**
- Modify: `src/core/storage/sqlite/NativeModuleManager.ts:1-596`

596 lines for binary module loading. Multi-strategy: ABI detect → prebuilt download → node-gyp fallback → binary verify.

- [ ] **Step 1: Read and audit** — which strategies actually succeed in practice?
- [ ] **Step 2: Simplify to ~250 lines** — remove node-gyp fallback (never works in Electron), simplify ABI detection, reduce retry logic
- [ ] **Step 3: Build check + commit**

---

### Task 1.5: Compact ChatStore (Vault Markdown)

**Files:**
- Modify: `src/core/storage/vault/ChatStore.ts:1-977`

977 lines for managing conversation markdown files. Much of this is parsing/serializing between markdown and structured data.

- [ ] **Step 1: Audit which methods are used**
- [ ] **Step 2: Target ~500 lines** — simplify serialization, remove legacy format handling, extract shared utilities
- [ ] **Step 3: Build check + test + commit**

---

### Task 1.6: Compact BetterSqliteStore Adapter

**Files:**
- Modify: `src/core/storage/sqlite/better-sqlite3-adapter/BetterSqliteStore.ts:1-699`

699 lines wrapping better-sqlite3. Much of this is error handling and connection management.

- [ ] **Step 1: Audit** — how much is actual interface vs error handling?
- [ ] **Step 2: Target ~400 lines** — simplify error paths, remove redundant connection checks
- [ ] **Step 3: Build check + commit**

---

**Wave 1 Total: ~6,000 lines removed**

---

## Wave 2: Search Index Simplification (est. -8,000 lines)

### Task 2.1: Refactor hubDiscover.ts (3,294 → ~1,200 lines)

**Files:**
- Modify: `src/service/search/index/helper/hub/hubDiscover.ts:1-3294`

The single largest file in the codebase. Contains the `HubCandidateDiscoveryService` class with multi-round hub discovery, coverage-based budgeting, cluster candidate generation, and extensive diagnostic logging.

- [ ] **Step 1: Identify core algorithm vs diagnostics**

Core (keep): Multi-round discovery loop, coverage index, candidate scoring, budget computation.
Remove: Verbose diagnostic types (`FolderHubDiscoveryDiagnosticsRow`), detailed logging, redundant intermediate data structures, inline utility functions that belong elsewhere.

- [ ] **Step 2: Extract diagnostic types to separate file** (or delete if unused)
- [ ] **Step 3: Inline small helper functions, remove dead code paths**
- [ ] **Step 4: Consolidate the multi-round loop** — the core algorithm can be expressed much more concisely
- [ ] **Step 5: Build check + test + commit**

---

### Task 2.2: Consolidate Hub Helper Files

**Files:**
- Modify: `src/service/search/index/helper/hub/localGraphAssembler.ts:1-752` → target ~300
- Modify: `src/service/search/index/helper/hub/hubDocServices.ts:1-574` → target ~250
- Modify: `src/service/search/index/helper/hub/navigationHubGroups.ts:1-532` → target ~200
- Modify: `src/service/search/index/helper/hub/clusterHubSignals.ts:1-382` → target ~150
- Modify: `src/service/search/index/helper/hub/types.ts:1-550` → target ~200

- [ ] **Step 1: Audit types.ts** — which types are used externally? Delete internal-only types that are only used in one file (inline them)
- [ ] **Step 2: Simplify each helper** — remove verbose intermediate representations, consolidate small functions
- [ ] **Step 3: Build check + test + commit**

---

### Task 2.3: Simplify Backbone Subsystem (2,317 → ~800 lines)

**Files:**
- All files in `src/service/search/index/helper/backbone/` (15 files, 2,317 lines)

This subsystem builds a "backbone map" with community detection, betweenness centrality, Burt structural constraint, gap detection, and tag display rank. Audit whether this is used in production or only by experimental features.

- [ ] **Step 1: Trace usage**
```bash
grep -r "backbone\|buildBackboneMap\|digestLoader\|communityDetection\|structuralMetrics" src/ --include="*.ts" -l | grep -v "backbone/"
```

- [ ] **Step 2: If consumers < 3, merge used functions into a single `backbone.ts` file**
- [ ] **Step 3: Delete unused backbone files**
- [ ] **Step 4: Build check + commit**

---

### Task 2.4: Slim indexService.ts (2,465 → ~1,200 lines)

**Files:**
- Modify: `src/service/search/index/indexService.ts:1-2465`

Monolithic index manager. Contains: full indexing, incremental indexing, maintenance, vector enrichment, LLM enrichment, cleanup, status queries.

- [ ] **Step 1: Extract maintenance methods to `indexMaintenance.ts`**
- [ ] **Step 2: Extract enrichment methods to `indexEnrichment.ts`** (already partially done)
- [ ] **Step 3: Remove dead/redundant methods**
- [ ] **Step 4: Build check + test + commit**

---

### Task 2.5: Simplify semanticRelatedEdges (527 → ~250 lines)

**Files:**
- Modify: `src/service/search/index/helper/semanticRelatedEdges.ts:1-527`

- [ ] **Step 1: Audit what's used**
- [ ] **Step 2: Simplify edge computation logic**
- [ ] **Step 3: Build check + commit**

---

### Task 2.6: Simplify queryService.ts (849 → ~500 lines)

**Files:**
- Modify: `src/service/search/query/queryService.ts:1-849`

After deleting 4 unused methods (Task 0.5), further simplify the tri-hybrid search pipeline.

- [ ] **Step 1: Inline the PPR helper** (currently a separate method `applyPPR` of ~80 lines that's only called once)
- [ ] **Step 2: Simplify the RRF fusion logic**
- [ ] **Step 3: Build check + test + commit**

---

**Wave 2 Total: ~8,000 lines removed**

---

## Wave 3: UI Simplification (est. -16,000 lines)

### Task 3.1: Consolidate Quick-Search Stores (aiAnalysisStore + searchSessionStore)

**Files:**
- Modify: `src/ui/view/quick-search/store/aiAnalysisStore.ts:1-1006`
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:1-818`
- Modify: `src/ui/view/quick-search/store/v2SessionTypes.ts:1-322`

`aiAnalysisStore.ts` contains **6 separate Zustand stores** in one file. Many fields overlap with `searchSessionStore`. `v2SessionTypes.ts` defines types used across both.

- [ ] **Step 1: Map which store fields are actually read by components**
```bash
grep -rn "useAiAnalysis\|useSearchSession\|useRuntimeStore\|useStepsStore\|useSummaryStore\|useResultStore\|useTopicStore\|useInteractionsStore" src/ui/ --include="*.tsx" --include="*.ts" -l
```

- [ ] **Step 2: Merge into 2 stores max**: `analysisSessionStore` (session state + results) and `analysisUIStore` (UI interactions + view state)
- [ ] **Step 3: Delete unused store fields and their corresponding setter actions**
- [ ] **Step 4: Update all consumers**
- [ ] **Step 5: Build check + commit**

**Target: 1,824 lines → ~800 lines**

---

### Task 3.2: Simplify Quick-Search Hooks

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useAIAnalysisPostAIInteractions.ts:1-514` (after Task 0.5 pruning)
- Modify: `src/ui/view/quick-search/hooks/eventDispatcher.ts:1-482`
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts:1-472`
- Modify: `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts:1-355`
- Modify: `src/ui/view/quick-search/hooks/useEventRouter.ts:1-206`

After dead hook deletion in Task 0.5, these files still have excessive indirection.

- [ ] **Step 1: Merge eventDispatcher + useEventRouter** — they handle the same event routing concern
- [ ] **Step 2: Inline useAIAnalysisResult into the store** — most of it is derived state that belongs as store selectors
- [ ] **Step 3: Simplify useSearchSession** — remove legacy bridge code
- [ ] **Step 4: Build check + commit**

**Target: ~1,700 lines → ~600 lines**

---

### Task 3.3: Consolidate Quick-Search V2 Components

**Files:**
- `src/ui/view/quick-search/components/V2ReportView.tsx` (422 lines)
- `src/ui/view/quick-search/components/V2InlinePlanReview.tsx` (341 lines)
- `src/ui/view/quick-search/components/V2Footer.tsx` (296 lines)
- `src/ui/view/quick-search/components/V2SourcesView.tsx` (181 lines)
- `src/ui/view/quick-search/components/V2RoundBlock.tsx` (169 lines)
- `src/ui/view/quick-search/components/V2ProcessView.tsx` (164 lines)
- `src/ui/view/quick-search/components/V2ScrollButtons.tsx` + `V2SearchResultView.tsx` + `V2TableOfContents.tsx` + `V2ContinueAnalysisInput.tsx`

Many V2 components share patterns and could be consolidated.

- [ ] **Step 1: Merge V2ProcessView + V2RoundBlock** (process view is just a list of round blocks)
- [ ] **Step 2: Simplify V2Footer** (300 lines for a footer is excessive)
- [ ] **Step 3: Simplify V2InlinePlanReview** (341 lines for a plan review panel)
- [ ] **Step 4: Build check + commit**

**Target: reduce V2 components from ~1,800 to ~1,000 lines**

---

### Task 3.4: Simplify Graph Visualization (7,564 → ~4,000 lines)

**Files:**
- All files in `src/ui/component/mine/graph-viz/` (30+ files, 7,564 lines)

The D3 canvas graph is used for the search results graph. ReactFlow multi-lens is used for AI-generated graphs. Both are needed but the D3 system is over-engineered.

- [ ] **Step 1: Simplify GraphSettingsPanel** (546 → ~200 lines) — too many granular settings that users rarely change
- [ ] **Step 2: Simplify GraphEffectsCanvas** (428 → ~150 lines) — decorative effects (nebula, particles) that add visual complexity without function
- [ ] **Step 3: Merge useGraphRenderJoin (363 lines) into useGraphEngine** — they're always used together
- [ ] **Step 4: Simplify graphData.ts (364 lines)** — data transformation utilities
- [ ] **Step 5: Remove graphPatches.ts (285 lines)** if it's only patches for bugs that are now fixed
- [ ] **Step 6: Simplify mst.ts (325 lines)** — minimum spanning tree, check if actually used
- [ ] **Step 7: Build check + commit**

---

### Task 3.5: Simplify SearchModal (688 → ~350 lines)

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:1-688`

- [ ] **Step 1: Extract session restore logic to a hook**
- [ ] **Step 2: Extract suggestion/mode selection to a sub-component**
- [ ] **Step 3: Simplify tab switching logic**
- [ ] **Step 4: Build check + commit**

---

### Task 3.6: Simplify Inspector Components (610 + others → ~400)

**Files:**
- Modify: `src/ui/view/quick-search/components/inspector/LinksSection.tsx:1-610`
- Modify: Other inspector components

- [ ] **Step 1: Simplify LinksSection** — 610 lines for a links panel is excessive
- [ ] **Step 2: Build check + commit**

---

### Task 3.7: Simplify Mine Components

**Files:**
- Modify: `src/ui/component/mine/StreamdownIsolated.tsx:1-482` → target ~300
- Modify: `src/ui/component/mine/NavigableMenu.tsx:1-338` → target ~200
- Modify: `src/ui/component/mine/ModelSelector.tsx:1-317` → target ~200
- Modify: `src/ui/component/mine/resource-preview-hover.tsx:1-249` → target ~150
- Modify: `src/ui/component/mine/ProgressBarSlider.tsx:1-199` → target ~100
- Modify: `src/ui/component/mine/hover-menu-manager.tsx:1-183` → target ~100

- [ ] **Step 1: Simplify each component** — remove over-engineered animation, reduce prop drilling, simplify state management
- [ ] **Step 2: Build check + commit**

---

### Task 3.8: Simplify Prompt Input System (2,045 → ~1,200)

**Files:**
- Modify: `src/ui/component/prompt-input/PromptInputBody.tsx:1-524`
- Modify: Other prompt-input files

- [ ] **Step 1: Simplify PromptInputBody** — 524 lines for a text input is excessive
- [ ] **Step 2: Build check + commit**

---

### Task 3.9: Simplify AI Elements (1,786 → ~1,000)

**Files:**
- Modify: `src/ui/component/ai-elements/message.tsx:1-454` → target ~250
- Modify: `src/ui/component/ai-elements/queue.tsx:1-273` → target ~150

- [ ] **Step 1: Simplify message.tsx** — remove version navigation if rarely used, simplify bubble layout
- [ ] **Step 2: Build check + commit**

---

### Task 3.10: Compact Other Views

**Files:**
- Modify: `src/ui/view/project-list-view/ProjectsSection.tsx:1-561` → target ~300
- Modify: `src/ui/view/message-history-view/MessageHistoryView.tsx:1-447` → target ~250
- Modify: `src/ui/view/modals/OnboardingModal.tsx:1-482` → target ~300
- Modify: `src/ui/view/quick-search/components/ai-analysis-modal/SectionExtraChatModal.tsx:1-460` → target ~250
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx:1-440` → target ~250

- [ ] **Step 1: Simplify each** — remove over-engineered layouts, reduce component nesting
- [ ] **Step 2: Build check + commit per batch**

---

**Wave 3 Total: ~16,000 lines removed**

---

## Wave 4: Document Loaders & Utils (est. -3,900 lines)

### Task 4.1: Extract Shared Loader Base (eliminate 20-line boilerplate × 11)

**Files:**
- Create: `src/core/document/loader/BaseDocumentLoader.ts` (~60 lines)
- Modify: All 11+ concrete loaders

Every concrete loader copy-pastes the same `scanDocuments` generator body. Extract to a shared base.

- [ ] **Step 1: Create BaseDocumentLoader with shared `scanDocuments`**

```typescript
export abstract class BaseDocumentLoader {
  abstract readonly supportedExtensions: string[];
  abstract readDocument(path: string, opts: DocumentLoaderReadOptions): Promise<Document>;
  
  *scanDocuments(files: TFile[], batchSize: number): Generator<TFile[]> {
    const matching = files.filter(f => this.supportedExtensions.some(ext => f.path.endsWith(ext)));
    for (let i = 0; i < matching.length; i += batchSize) {
      yield matching.slice(i, i + batchSize);
    }
  }
}
```

- [ ] **Step 2: Refactor each loader to extend base**
- [ ] **Step 3: Build check + test + commit**

**Estimated savings: ~220 lines (20 lines × 11 loaders)**

---

### Task 4.2: Simplify Niche Loaders

**Files:**
- Modify: `src/core/document/loader/ExcalidrawDocumentLoader.ts:1-202` → target ~80
- Modify: `src/core/document/loader/DataloomDocumentLoader.ts:1-193` → target ~80
- Modify: `src/core/document/loader/CanvasDocumentLoader.ts:1-214` → target ~80
- Modify: `src/core/document/loader/JsonDocumentLoader.ts:1-227` → target ~80
- Modify: `src/core/document/loader/UrlDocumentLoader.ts:1-188` — consider deleting (no actual fetching implemented)

- [ ] **Step 1: Check UrlDocumentLoader** — if scanDocuments yields nothing, it's dead code
- [ ] **Step 2: Simplify each loader** — remove verbose error handling, reduce format-specific parsing
- [ ] **Step 3: Build check + commit**

---

### Task 4.3: Simplify TagService (575 → ~300 lines)

**Files:**
- Modify: `src/core/document/helper/TagService.ts:1-575`

- [ ] **Step 1: Remove deprecated types/functions**
- [ ] **Step 2: Simplify blob encode/decode** — binary format may be over-engineered
- [ ] **Step 3: Build check + commit**

---

### Task 4.4: Consolidate Utils

**Files:**
- Modify: `src/core/utils/markdown-utils.ts:1-575` → target ~350
- Modify: `src/core/utils/obsidian-utils.ts:1-496` → target ~300
- Modify: `src/core/utils/format-utils.ts:1-252` → target ~100
- Modify: `src/core/utils/date-utils.ts:1-204` → target ~120
- Modify: `src/core/utils/hash-utils.ts:1-108` → target ~50
- Delete: `src/core/utils/ttl-cache.ts` (already in Task 0.5)
- Modify: `src/core/utils/Stopwatch.ts:1-179` → target ~80

- [ ] **Step 1: Remove dead functions from each file** (identified in agent analysis)
- [ ] **Step 2: Merge `hash-utils.ts`** — 3 hash algorithms when only 1-2 are needed
- [ ] **Step 3: Simplify Stopwatch** — 179 lines for a timer is excessive
- [ ] **Step 4: Build check + commit**

---

### Task 4.5: Deduplicate `normalizeVaultFolderPath`

**Files:**
- `src/service/tools/search-graph-inspector/explore-folder.ts:539`
- `src/service/agents/intuition-helper/intuitionPrep.ts:49`
- `src/service/search/index/helper/backbone/vaultFolderScan.ts:14`

Same 4-line function copy-pasted in 3 files.

- [ ] **Step 1: Move to `src/core/utils/vault-path-utils.ts`**
- [ ] **Step 2: Update all 3 import sites**
- [ ] **Step 3: Build check + commit**

---

**Wave 4 Total: ~3,900 lines removed**

---

## Wave 5: Service Layer Cleanup (est. -6,000 lines)

### Task 5.1: Split find-path.ts (2,031 → ~1,200 total across files)

**Files:**
- Modify: `src/service/tools/search-graph-inspector/find-path.ts:1-2031`
- Create: `src/service/tools/search-graph-inspector/strategies/reliable.ts`
- Create: `src/service/tools/search-graph-inspector/strategies/fasttrack.ts`
- Create: `src/service/tools/search-graph-inspector/strategies/brainstorm.ts`
- Create: `src/service/tools/search-graph-inspector/strategies/temporal.ts`

4 completely independent strategies embedded in one 2k-line file.

- [ ] **Step 1: Extract each strategy to its own file**
- [ ] **Step 2: Simplify each** — reduce verbose intermediate data structures
- [ ] **Step 3: find-path.ts becomes a thin dispatcher** (~100 lines)
- [ ] **Step 4: Build check + test + commit**

---

### Task 5.2: Simplify explore-folder.ts (843 → ~400 lines)

**Files:**
- Modify: `src/service/tools/search-graph-inspector/explore-folder.ts:1-843`

- [ ] **Step 1: Remove `normalizeVaultFolderPath` duplicate** (moved in Task 4.5)
- [ ] **Step 2: Simplify tree rendering** — reduce formatting verbosity
- [ ] **Step 3: Build check + commit**

---

### Task 5.3: Merge sdkAgentPool Two-Layer Split

**Files:**
- Modify: `src/service/agents/core/sdkAgentPool.ts:1-254`
- Modify: `src/service/agents/vault-sdk/sdkAgentPool.ts:1-224`
- Delete one of them after merge

Two files named `sdkAgentPool.ts` in different directories with confused boundaries.

- [ ] **Step 1: Merge into single `src/service/agents/core/sdkAgentPool.ts`**
- [ ] **Step 2: Update all importers**
- [ ] **Step 3: Build check + commit**

**Target: 478 lines → ~300 lines**

---

### Task 5.4: Merge sdkMessageAdapter Two-Layer Split

**Files:**
- Modify: `src/service/agents/vault-sdk/sdkMessageAdapter.ts:1-186`
- Modify: `src/service/agents/core/sdkMessageAdapter.ts:1-151`

Same issue — re-export wrapper adding minimal value.

- [ ] **Step 1: Merge into single file**
- [ ] **Step 2: Update all importers**
- [ ] **Step 3: Build check + commit**

**Target: 337 lines → ~200 lines**

---

### Task 5.5: Simplify service-manager.ts (1,063 → ~600 lines)

**Files:**
- Modify: `src/service/chat/service-manager.ts:1-1063`

- [ ] **Step 1: Audit which methods are used externally**
- [ ] **Step 2: Remove unused methods**
- [ ] **Step 3: Simplify query routing** (the dual Vercel/Agent SDK dispatch may have dead branches)
- [ ] **Step 4: Build check + commit**

---

### Task 5.6: Simplify service-conversation.ts (701 → ~400 lines)

**Files:**
- Modify: `src/service/chat/service-conversation.ts:1-701`

- [ ] **Step 1: Audit method usage**
- [ ] **Step 2: Remove dead conversation management methods**
- [ ] **Step 3: Build check + commit**

---

### Task 5.7: Simplify Intuition Subsystem (1,312 → ~600 lines)

**Files:**
- Modify: `src/service/agents/intuition-helper/intuitionPrep.ts:1-657` → target ~300
- Modify: Other intuition files

- [ ] **Step 1: Simplify intuitionPrep.ts** — 657 lines for building a context prompt is excessive
- [ ] **Step 2: Merge intuition.memory.ts and types.ts** — small files that could be inlined
- [ ] **Step 3: Build check + commit**

---

### Task 5.8: Simplify Context Pipeline (2,204 → ~1,200 lines)

**Files:**
- All files in `src/service/chat/context/`

10 "slot" files + 5 services + pipeline. Many slots are < 60 lines — can be inlined.

- [ ] **Step 1: Merge small slots** (SystemPromptSlot 31, ResourceIndexSlot 54, WorkingContextSlot 52, PrevAnalysisSlot 48, VaultIntuitionSlot 48) into the ContextBuilder directly
- [ ] **Step 2: Simplify UserProfileService + BuildUserProfileRunner** — consider merging
- [ ] **Step 3: Build check + commit**

---

### Task 5.9: Simplify ReportOrchestrator (523 → ~300 lines)

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts:1-523`

- [ ] **Step 1: Simplify orchestration loop**
- [ ] **Step 2: Build check + commit**

---

### Task 5.10: Compact Register.ts (773 → ~400 lines)

**Files:**
- Modify: `src/app/commands/Register.ts:1-773`

- [ ] **Step 1: Extract `openProgressNotice` helper to shared utils**
- [ ] **Step 2: Simplify search index commands** — too much inline logic
- [ ] **Step 3: Remove commented-out code** (the reset-database block)
- [ ] **Step 4: Build check + commit**

---

### Task 5.11: Simplify Copilot Actions (1,317 → ~800 lines)

**Files:**
- All files in `src/service/copilot/actions/`

15 action files with similar patterns.

- [ ] **Step 1: Extract shared action boilerplate** (guard checks, profile resolution, error handling)
- [ ] **Step 2: Simplify each action file** — many are short but have repeated patterns
- [ ] **Step 3: Build check + commit**

---

### Task 5.12: Simplify inspectorService.ts (683 → ~300 lines)

**Files:**
- Modify: `src/service/search/inspectorService.ts:1-683`

Used by 3 inspector components. Audit which of its 8 methods are actually called.

- [ ] **Step 1: Audit callers**
```bash
grep -rn "inspectorService\." src/ui/ --include="*.tsx" --include="*.ts" | grep -v "import"
```

- [ ] **Step 2: Delete unused methods, simplify remaining**
- [ ] **Step 3: Build check + commit**

---

### Task 5.13: Compact constant.ts (1,093 → ~600 lines)

**Files:**
- Modify: `src/core/constant.ts:1-1093`

- [ ] **Step 1: Audit which constants are actually used**
- [ ] **Step 2: Remove unused constants**
- [ ] **Step 3: Move any that should be in templates/config/ per CLAUDE.md configurability rule**
- [ ] **Step 4: Build check + commit**

---

### Task 5.14: Compact Provider Types (684 → ~400 lines)

**Files:**
- Modify: `src/core/providers/types.ts:1-684`

- [ ] **Step 1: Remove unused type definitions**
- [ ] **Step 2: Simplify model metadata types**
- [ ] **Step 3: Build check + commit**

---

### Task 5.15: Remove Unused Dependency Imports

**Files:**
- Modify: `package.json`
- Possibly modify loaders that use playwright

- [ ] **Step 1: Audit playwright usage** — only in UrlDocumentLoader which has a no-op scanDocuments
- [ ] **Step 2: If UrlDocumentLoader is dead, remove playwright dependency**
- [ ] **Step 3: Check for other unused dependencies**
```bash
npx depcheck 2>/dev/null | head -30
```
- [ ] **Step 4: Remove unused deps from package.json**
- [ ] **Step 5: Build check + commit**

---

**Wave 5 Total: ~6,000 lines removed**

---

## Execution Order & Dependencies

```
Wave 0 (no deps, safe first) ─────────────────────────────────────
  Task 0.1  Delete tmp_code_ref      │ independent
  Task 0.2  Delete desktop/          │ independent
  Task 0.3  Delete debug tools       │ independent
  Task 0.4  Purge repo methods       │ independent
  Task 0.5  Purge hooks/utils        │ independent
  Task 0.6  Clean console.log        │ independent

Wave 1 (storage, after Wave 0.4) ─────────────────────────────────
  Task 1.1  DDL audit                │ after 0.4
  Task 1.2  Merge IndexedDocRepo     │ after 0.4
  Task 1.3  Simplify HealthVerifier  │ independent
  Task 1.4  Simplify NativeModule    │ independent
  Task 1.5  Compact ChatStore        │ independent
  Task 1.6  Compact BetterSqlite     │ independent

Wave 2 (search, after Wave 0.4) ──────────────────────────────────
  Task 2.1  hubDiscover refactor     │ after 0.4
  Task 2.2  Hub helpers consolidate  │ after 2.1
  Task 2.3  Backbone simplify        │ independent
  Task 2.4  indexService slim        │ independent
  Task 2.5  semanticRelatedEdges     │ independent
  Task 2.6  queryService simplify    │ after 0.5

Wave 3 (UI, after Waves 0.5) ─────────────────────────────────────
  Task 3.1  Merge QS stores          │ after 0.5
  Task 3.2  Simplify QS hooks        │ after 3.1
  Task 3.3  Consolidate V2 comps     │ after 3.1
  Task 3.4  Graph viz simplify       │ independent
  Task 3.5  SearchModal compact      │ after 3.1, 3.2
  Task 3.6  Inspector compact        │ independent
  Task 3.7  Mine components          │ independent
  Task 3.8  Prompt input             │ independent
  Task 3.9  AI elements              │ independent
  Task 3.10 Other views              │ independent

Wave 4 (loaders/utils, independent) ──────────────────────────────
  Task 4.1  Loader base class        │ independent
  Task 4.2  Simplify niche loaders   │ after 4.1
  Task 4.3  TagService simplify      │ independent
  Task 4.4  Utils consolidate        │ after 0.5
  Task 4.5  Dedup normalizeVaultPath │ independent

Wave 5 (service, after Waves 0+1) ────────────────────────────────
  Task 5.1  Split find-path          │ independent
  Task 5.2  Simplify explore-folder  │ after 4.5
  Task 5.3  Merge sdkAgentPool       │ independent
  Task 5.4  Merge sdkMessageAdapter  │ independent
  Task 5.5  service-manager          │ independent
  Task 5.6  service-conversation     │ independent
  Task 5.7  Intuition simplify       │ independent
  Task 5.8  Context pipeline         │ independent
  Task 5.9  ReportOrchestrator       │ independent
  Task 5.10 Register.ts              │ independent
  Task 5.11 Copilot actions          │ independent
  Task 5.12 inspectorService         │ independent
  Task 5.13 constant.ts              │ independent
  Task 5.14 Provider types           │ independent
  Task 5.15 Unused dependencies      │ after 4.2
```

## Verification Strategy

After each wave:

1. **Build check**: `npm run build` — must pass
2. **Test suite**: `npm run test` — must pass
3. **Line count**: `find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1`
4. **Smoke test**: Load plugin in Obsidian, verify core flows:
   - Chat: send message, receive response
   - Search: open quick search, run vault search, run AI analysis
   - Copilot: open panel, run an action
   - Settings: open settings, view profiles
   - Graph: view search results graph

## Risk Mitigation

- **Wave 0 is ZERO RISK** — only deletes provably dead code
- **Waves 1-2** modify backend code but preserve all public APIs. Test with `npm run test`
- **Wave 3** is the highest risk (UI changes). Test each task with visual smoke test
- **Waves 4-5** are moderate risk. Build + test after each task
- **Always commit after each task** so any breakage can be quickly reverted
