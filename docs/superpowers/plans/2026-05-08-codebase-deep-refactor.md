# Codebase Deep Refactor — 100k → 50k (code lines, cloc)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce from 100k to 50k clean code lines (cloc TypeScript) by eliminating dead code, consolidating duplicate patterns, simplifying over-engineered subsystems, and replacing D3 graph with ReactFlow — while preserving all user-facing functionality.

**Branch:** `refactor/codebase-50k-target`

**Architecture:** 6 waves, ordered by risk (low → high). Each wave independently testable.

---

## Current State (cloc)

| Area | Code Lines |
|------|-----------|
| ui/ (total) | 40,507 |
| service/ (total) | 30,173 |
| core/ (total) | 22,629 |
| app/ (total) | 3,423 |
| desktop/ (total) | 3,062 |
| **Total** | **100,002** |

## Target State

| Area | Current | Target | Δ |
|------|---------|--------|---|
| ui/ | 40,507 | 21,000 | -19,500 |
| service/ | 30,173 | 15,000 | -15,200 |
| core/ | 22,629 | 12,000 | -10,600 |
| app/ | 3,423 | 2,000 | -1,400 |
| desktop/ | 3,062 | 0 | -3,100 |
| **Total** | **100,002** | **~50,000** | **-50,000** |

---

## Wave 0: Dead Code Purge (-11,000 lines, ZERO RISK)

### 0.1 Delete `tmp_code_ref_for_cursor/` (-3,600 code lines)
Zero references from src/. Pure dead weight.

### 0.2 Delete `src/desktop/` (-3,062 code lines)
Dev-only mock system. Not part of the plugin.

### 0.3 Delete `src/app/context/index-debug-tools.ts` (-1,000 code lines)
Window globals for dev console only. Not reachable from UI.

### 0.4 Delete deprecated `ContextBuilder.ts` (-200 code lines)
Marked `@deprecated`, unreachable in production (pipeline always wired).

### 0.5 Delete dead exports & hooks (-800 code lines)
- `useAIAnalysisPostAIInteractions.ts`: 7 dead hooks
- `useAIAnalysisResult.ts`: 3 dead exports
- `ttl-cache.ts`: entire file unused
- `hash-utils.ts`: `calculateFileHash` dead
- `date-utils.ts`: `formatRelativeDate` dead
- `textRank.ts`: deprecated `mergeUserAndTextRankKeywords`
- `TagService.ts`: deprecated `TopicFunctionalTagResult`
- `service-manager.ts`: `blockChat()` + `searchPrompts()` dead
- `VaultSearchAgent.ts` (38 lines): pure pass-through

### 0.6 Purge unused repository methods (-2,000 code lines)
75+ methods across 15 repos confirmed unused:
- MobiusNodeRepo: 17 unused / 86 total
- MobiusEdgeRepo: 18 / 50
- GraphRepo: 8 / 15
- StructuralMetricsRepo: 5 / 12
- EmbeddingRepo: 5 / 27
- ChatProjectRepo: 4 / 9
- ChatStarRepo: 3 / 8
- Others: ~15 methods across 7 repos

### 0.7 Delete dead templates & clean console.log (-300)
- `translate-languages.json`: unreferenced
- `HubDiscoverNextDirections`: registered, never called
- `StructuralHoles` tool: module never imported by agents
- Remove ~200 non-essential console.log/debug statements

**Wave 0 verification:** `npm run build && npm run test && cloc src/`

---

## Wave 1: D3 Graph → ReactFlow (-5,500 net)

### 1.1 Delete D3 graph-viz system (-6,456 code lines)
Delete entire `src/ui/component/mine/graph-viz/` (35 files).

### 1.2 Build ReactFlow search graph (+900 code lines)
Create `src/ui/component/mine/search-graph/SearchGraph.tsx` using ReactFlow (already a dependency via multi-lens-graph):
- Streaming node ingestion (RAF-batched)
- Force layout via d3-force (keep d3-force dep, drop d3-selection/d3-zoom)
- Node context menu, edge styling
- Reuse existing `MultiLensGraph` patterns

### 1.3 Migrate consumers
- `SectionExtraChatModal.tsx`: swap `GraphVisualization` → `SearchGraph`
- `graphAnimationStore.ts`: simplify or inline into SearchGraph
- Delete `obsidianGraphPreset.ts`, `graph-utils.ts` if no longer needed

**Wave 1 verification:** Build + visual smoke test (search graph renders)

---

## Wave 2: Quick-Search Store Migration (-5,000)

### 2.1 Complete V1→V2 store migration (-3,500)
`aiAnalysisStore.ts` has 6 legacy stores kept alive by a dual-write bridge:
- Delete `useAIAnalysisRuntimeStore`, `useAIAnalysisSummaryStore`, `useAIAnalysisResultStore`, `useAIAnalysisStepsStore`
- Migrate `useAIAnalysisTopicsStore` + `useAIAnalysisInteractionsStore` fields into `searchSessionStore`
- Delete `LegacyBridgeTarget` from `eventDispatcher.ts` + `useEventRouter.ts`
- Update ~15 consumer files

### 2.2 Simplify quick-search hooks (-1,500)
- Delete 7 dead hooks from `useAIAnalysisPostAIInteractions.ts` (already in 0.5, saves cascade here)
- Merge `eventDispatcher.ts` + `useEventRouter.ts` (shared concern)
- Inline `useAIAnalysisResult.ts` as store selectors
- Merge `SearchResultView` → `V2SearchResultView` (passthrough wrapper)
- Merge `V2ProcessView` + `V2RoundBlock` (single consumer)

**Wave 2 verification:** Build + AI Analysis end-to-end test

---

## Wave 3: Hub/Backbone/Intuition Simplification (-7,000)

### 3.1 Hub subsystem: 7,600 → 2,500 (-5,100)
Keep the concept (hub discovery, scoring, doc generation), simplify implementation:
- `hubDiscover.ts` 3294→800: delete diagnostic functions, strip debug accumulation, compact multi-round loop
- Merge `clusterHubSignals.ts` (382) + `navigationHubGroups.ts` (532) → inline into hubDiscover
- `types.ts` 550→200: delete 8+ internal-only types
- `localGraphAssembler.ts` 752→400: remove unnecessary exports, strip verbose logging
- `hubDocServices.ts` 574→350: compact
- Delete `folderHubTopicPurity.ts` (155) + `folderCohesion.ts` (100): inline essentials into hubDiscover

### 3.2 Backbone: 2,317 → 800 (-1,500)
Merge 15 files → 2 files:
- `backbone.ts`: core algorithms (community detection, structural metrics, gap detection)
- `backboneTypes.ts`: type definitions
- Inline `tagDisplayRank`, `digestLoader`, `renderBackboneMarkdown`, etc.

### 3.3 KnowledgeIntuition: 1,582 → 1,200 (-400)
- `intuitionPrep.ts` 657→350: simplify context building
- Merge `intuition.memory.ts` (137) + `types.ts` (131) into `intuitionPrep.ts`

**Wave 3 verification:** Build + index pipeline test + intuition command test

---

## Wave 4: Service Layer Cleanup (-10,000)

### 4.1 Inspector tools: 4,347 → 1,800 (-2,500)
- `find-path.ts` 2031→800: split 4 strategies into separate files, simplify each
- `explore-folder.ts` 843→400: reduce formatting verbosity
- `common.ts` 555→300: inline small helpers
- Delete `find-structural-holes.ts` (110): tool never loaded by agents
- Delete `hub-local-graph.ts` (86): hub-dependent, simplify or remove

### 4.2 Agents: 4,415 → 2,200 (-2,200)
- Merge `vault-sdk/sdkAgentPool.ts` (224) + `core/sdkAgentPool.ts` (254) → single file (~300)
- Merge `vault-sdk/sdkMessageAdapter.ts` (186) + `core/sdkMessageAdapter.ts` (151) → single file (~200)
- `intuitionPrep.ts` already simplified in 3.3
- Extract shared `buildVaultSearchToolSet()` from `FollowupChatAgent` + `DocSimpleAgent`
- Delete `VaultSearchAgent.ts` (38 lines pass-through)
- Simplify `ReportOrchestrator.ts` 523→300

### 4.3 Chat service: 3,434 → 1,800 (-1,600)
- Merge `service-conversation.ts` (701) into `service-manager.ts` or vice versa (eliminate delegate layer)
- `service-manager.ts` 1063→600: remove dead methods, extract pipeline wiring
- Delete `ContextBuilder.ts` (already in 0.4)
- Merge small context slots (5 slots × 50 lines → inline into ContextBuilder)
- Simplify `ContextUpdateService.ts` (245→150)

### 4.4 Search subsystem: 10,896 → 6,000 (-4,900)
- `indexService.ts` 2465→1200: extract maintenance to separate file, remove dead methods
- `indexInitializer.ts` 666→350: remove hub step, simplify
- Hub/backbone already handled in Wave 3
- `semanticRelatedEdges.ts` 527→250
- `queryService.ts` 849→500: inline PPR helper, simplify RRF
- `reranker.ts` 379→200: simplify after hub refactor
- `inspectorService.ts` 683→350: delete unused methods
- Merge `coCitationService.ts` + `unlinkedMentionService.ts` into inspectorService

### 4.5 Other services (-800)
- `BackgroundSessionManager.ts` 556→350
- `SessionContextService.ts` 467→250
- `copilot/actions/`: extract shared shell pattern (~-400)
- `prompt/PromptId.ts` 587→400: remove unused IDs

**Wave 4 verification:** Build + test + chat/search/copilot smoke test

---

## Wave 5: Core Layer Cleanup (-8,000)

### 5.1 Storage repos: 6,447 → 3,500 (-3,000)
After Wave 0.6 repo pruning, further:
- Merge `IndexedDocumentRepo` (676) into `MobiusNodeRepo` (already shares table)
- Delete `GraphRepo` delegate methods (8 pass-throughs), keep only unique methods
- Simplify `MobiusNodeRepo` after hub simplification
- Inline `AmbientPushRepo` (94) + `UserProfileProcessedHashRepo` (65) into their single consumers

### 5.2 Storage infrastructure: 2,800 → 1,500 (-1,300)
- `DatabaseHealthVerifier.ts` 559→100: replace 7 hand-rolled tests with `PRAGMA integrity_check`
- `NativeModuleManager.ts` 596→350: remove node-gyp fallback, simplify ABI detection
- `ChatStore.ts` 977→550: simplify serialization
- `BetterSqliteStore.ts` 699→450: reduce error handling verbosity
- `ddl.ts` 951→600: remove deprecated type aliases, unused table interfaces

### 5.3 Document loaders: 3,930 → 2,500 (-1,400)
- Extract `BaseDocumentLoader` (+60 lines): shared `scanDocuments`, `chunkContent`, `getSummary`, `readByPath`
- Each simple loader shrinks from ~190 to ~50 lines (~-1,200 across 9 loaders)
- Replace `@langchain/textsplitters` with local 70-line implementation (-package dep)
- Fix broken `ImageDocumentLoader` AI description path
- Delete `UrlDocumentLoader.scanDocuments` no-op

### 5.4 Utils/types: 4,700 → 2,500 (-2,200)
- `markdown-utils.ts` 575→350
- `obsidian-utils.ts` 496→300
- Delete `format-utils.ts` internal LRUCache (duplicates TtlCache)
- Merge `hash-utils.ts` redundant algorithms
- `constant.ts` 1093→500: audit usage, move configs to templates
- `providers/types.ts` 684→350: split mega-file by concern
- `profiles/ProfileRegistry.ts` 312→180: replace 6 role fields with Map
- Deduplicate `normalizeVaultFolderPath` (3 copies → 1)

**Wave 5 verification:** Build + test + full smoke test

---

## Wave 6: UI Simplification (-14,500)

### 6.1 Quick-search components: 8,000 → 4,500 (-3,500)
After Wave 2 store cleanup:
- `SearchModal.tsx` 688→350: extract mode selection + suggestions to sub-components
- `LinksSection.tsx` 610→300: extract helpers, simplify filter/sort
- `SectionExtraChatModal.tsx` 460→250: merge enum branches
- `V2ReportView.tsx` 422→250
- `V2InlinePlanReview.tsx` 341→200
- `V2Footer.tsx` 296→180
- Merge `V2ScrollButtons` + `V2TableOfContents` into their single consumers
- `followupContextRuntime.ts` 255→150

### 6.2 Chat view: 5,021 → 3,000 (-2,000)
- `MessageViewItem.tsx` 440→250
- `chatViewStore.ts` 333→200
- `useStreamChat.ts` 313→200
- `view-ProjectOverview.tsx` 310→180
- `ContextMenu.tsx` 271→150
- `conversation-list.tsx` 233→150

### 6.3 Mine components (after graph-viz deletion): 4,419 → 2,500 (-1,900)
- `StreamdownIsolated.tsx` 482→300
- `NavigableMenu.tsx` 338→200: extract `useKeyboardNavigation` hook
- `ModelSelector.tsx` 317→200
- `resource-preview-hover.tsx` 249→150
- `ProgressBarSlider.tsx` 199→50 (replace with styled native range)
- `hover-menu-manager.tsx` 183→100
- `codemirror-input.tsx` 175→120

### 6.4 Prompt input: 1,675 → 900 (-775)
- `PromptInputBody.tsx` 524→280: table-driven trigger detection
- `PromptInput.tsx` 394→250
- `PromptInputSubmit.tsx` 206→120

### 6.5 AI elements: 1,564 → 900 (-664)
- `message.tsx` 454→250
- `queue.tsx` 273→180

### 6.6 Other views: 5,300 → 2,800 (-2,500)
- `ProjectsSection.tsx` 561→280: extract shared `useConversationEvents` hook
- `OnboardingModal.tsx` 482→280: extract step config
- `MessageHistoryView.tsx` 447→250
- `copilot/panels/`: extract `CopilotPanelShell` (-150 across 10 panels)
- `settings/`: `ModelCombobox.tsx` 300→180, `ProfilesTab.tsx` 288→180
- `usage-dashboard/`: compact chart components
- `vault-xray/`: compact

### 6.7 Register.ts + app layer: 3,423 → 2,000 (-1,400)
- `Register.ts` 773→350: extract inline command logic, remove commented code
- `AppContext.ts`: remove debug-tools registration

**Wave 6 verification:** Build + comprehensive visual smoke test

---

## Execution Order

```
Wave 0  Zero-risk dead code purge     │ independent, do first
Wave 1  D3→ReactFlow                  │ independent
Wave 2  V1→V2 store migration         │ independent
Wave 3  Hub/Backbone simplification   │ after Wave 0.6 (repo pruning)
Wave 4  Service layer cleanup         │ after Waves 0, 2, 3
Wave 5  Core layer cleanup            │ after Waves 0, 3
Wave 6  UI simplification             │ after Waves 1, 2
```

Waves 0, 1, 2, 3 can run in parallel (different file sets).
Waves 4, 5 depend on earlier waves.
Wave 6 is last (UI changes need stable underlying layers).

## Verification Checkpoints

After each wave:
1. `npm run build` — must pass
2. `npm run test` — must pass
3. `cloc src/` — track progress toward 50k
4. Smoke test in Obsidian: Chat, Search, Copilot, Settings

## Risk Mitigation

- Commit after each sub-task
- Wave 0 is zero risk (provably dead code)
- Wave 1 is the highest-risk single change (graph replacement) — test thoroughly
- Wave 2 is medium risk (store migration) — test AI Analysis flow
- Waves 3-6 are incremental simplification — build after each file change
