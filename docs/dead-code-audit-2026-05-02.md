# Dead Code Audit — 2026-05-02

> Full audit of legacy/dead code remaining after V1 retirement. This is the cleanup manifest for the next major refactoring pass.
>
> **Verified against working tree on 2026-05-02.** Items already cleaned are marked ~~strikethrough~~.

## 1. Entire Files/Directories to Delete

| Path | Reason | Status |
|------|--------|--------|
| ~~`src/service/search/MobileSearchService.ts`~~ | ~~Zero imports~~ | **ALREADY DELETED** |
| `src/service/agents/search-agent-helper/tool-call-ui.ts` | `buildToolCallUIEvent` zero callers; old RawSearchAgent remnant | TODO |
| `src/core/profiles/peak-config.ts` | `loadPeakConfig`/`getPeakConfig` zero callers; peak-config.json mechanism never wired | TODO |
| `src/core/schemas/agents/search-agent-prompts.ts` | Only exports `REPORT_PLAN_PHASE_REQUIREMENTS`, zero external callers | TODO |
| `tmp_code_ref_for_cursor/` (entire dir) | Design reference dump, not part of build | TODO |
| `streamdown-styles.css` (root) | Stale CSS artifact; build uses `styles.streamdown.css` | TODO |
| `templates/config/vault-lint-config.json` | Registered but `VaultLintService` uses hardcoded default; never loaded | TODO |
| ~~`templates/config/search-query-routing.json`~~ | ~~No registry entry~~ | **ALREADY DELETED** |

## 2. Dead UI Components

| File | Reason |
|------|--------|
| `src/ui/view/chat-view/hooks/useChatSession.ts` | Zero callers; logic inlined into ChatInputArea |
| `src/ui/view/chat-view/components/messages/ToolCallsDisplay.tsx` | Superseded by `ToolCallSummary`; zero imports |
| `src/ui/view/chat-view/components/ThinkingIndicator.tsx` | Superseded by `AnimatedSparkles`; zero imports |
| `src/ui/view/shared/graph-utils.ts` | `convertGraphToGraphPreview()` zero callers |
| `src/ui/view/shared/common-utils.ts` | `copyText()` only used by desktop harness |
| `src/ui/view/quick-search/components/inspector/LinksSection.tsx` (610 lines) | Replaced by Connected/Discovered/AIGraph split sections; only desktop mock references it |
| `src/ui/view/quick-search/components/ai-analysis-sections/MermaidMindFlowSection.tsx` | Only desktop test view references it |
| `src/ui/component/icon/BrainOff.tsx` | Zero imports |
| `src/ui/component/icon/MarkdownIcon.tsx` | Zero imports |
| `src/ui/component/mine/SafeIconWrapper.tsx` | Barrel-exported but zero consumers |
| `src/ui/component/shared-ui/dialog.tsx` | Radix Dialog primitive, zero imports |

### Dead-in-place (stub/placeholder code inside live files)

| Location | Issue |
|----------|-------|
| `view-Messages.tsx` 3 suggestion actions | Empty `/* placeholder */` callbacks (Summarize/Search vault/Explain further) |
| `MessageViewItem.tsx` `MessageStyleButtons` handler | `console.log` no-op |
| `useStreamChat.ts:3+5` | Duplicate import of `useChatDataStore` |
| `view-Messages.tsx:3+4` | Duplicate import of `useChatDataStore` |

## 3. Dead Service/Agent Code

| Item | Reason |
|------|--------|
| `src/service/agents/AIGraphAgent.ts` | Legacy graph agent; superseded by `ai-graph/GraphAgent.ts` (SDK-based); `enrichThinkingTree` says "Placeholder until Task 7" |
| `src/service/agents/vault-sdk/sdkAgentPool.ts` exports `warmupSdkAgentPool` / `_resetPoolForTests` | Zero external callers |
| `src/service/agents/report/ReportOrchestrator.ts` `runVisualAgent()` | First line is `return;`; ~60 lines unreachable |
| `src/service/chat/service-manager.ts` 5 `@deprecated` methods | Pure delegation wrappers: `chatWithPrompt`, `chatWithPromptWithUsage`, `streamObjectWithPrompt`, `streamObjectWithPromptWithUsage`, `chatWithPromptStream` |
| `src/service/prompt/PromptService.ts` `setChatService()` | `@deprecated` no-op |
| `src/service/agents/shared-types.ts` fields `reportPlan` / `reportVisualBlueprint` on `SearchAgentResult` | Zero assignments anywhere |
| `src/service/agents/vault/types.ts` — `VaultSearchPhase` old values | `classify`/`decompose`/`recon`/`present-plan`/`intuition-feedback` never emitted by SDK pipeline |
| `src/service/agents/vault/types.ts` — `PlanSnapshot`/`DiscoveryGroup`/`VaultHitlPauseEvent` | `hitl-pause` event never fired |
| `src/service/search/index/helper/backbone/structuralTypes.ts` `StructuralAnalysisResult` | Exported but zero imports |

## 4. ~~Dead PromptId Enum Values~~ — **ALREADY CLEANED**

> PromptId.ts has already been cleaned. The 63 dead enum values and their PromptVariables stubs are gone. No action needed.

## 5. Dead Schemas — `search-agent-schemas.ts` (~70% dead, ~900 of 1347 lines)

### Dead exports (old pipeline schemas)

```
queryClassifierOutputSchema, QueryClassifierOutput
queryUnderstandingOutputSchema, QueryUnderstandingOutput
searchArchitectOutputSchema, SearchArchitectOutput
physicalSearchTaskSchema, PhysicalSearchTask, PhysicalTaskReconResult
defaultClassify
battlefieldAssessmentSchema
submitReconPathsSchema, SubmitReconPathsInput
rawSearchReportSchema, RawSearchReport, RawSearchReportWithDimension
leadStrategySchema, searchPlanItemSchema
pathSubmitOutputSchema, PathSubmitOutput, PathSubmitHistoryEntry
evidenceFactSchema, evidencePackSchema, EvidencePack
submitEvidencePackInputSchema, markTaskCompletedInputSchema
consolidatedTaskSchema, ConsolidatedTask, ConsolidatedTaskWithId
consolidatorOutputSchema, ConsolidatorOutput
groupContextItemSchema, GroupContextItem
setGroupContextInputSchema, SetGroupContextInput
groupContextRefinementOutputSchema, GroupContextRefinementOutput
EvidenceTaskGroup
overviewLogicModelSchema, OverviewLogicModel
needMoreDashboardBlocksInputSchema, dashboardUpdatePlanSchema
submitTopicsPlanInputSchema, submitBlocksPlanInputSchema
REPORT_PLAN_PHASE_IDS, REPORT_PLAN_BODY_PHASE_IDS, ReportPlanPhaseId
submitReportPhaseInputSchema, SubmitReportPhaseInput, SubmitReportPhaseOutput
bodyBlockSpecSchema, BodyBlockSpec, appendicesBlockSpecSchema, AppendicesBlockSpec
reportPlanSchema, ReportPlan
visualTaskTypeSchema, VisualTaskType
mermaidDiagramTypeSchema, MermaidDiagramType
visualDiagramPrescriptionSchema, VisualDiagramPrescription
audiencePrecisionSchema, AudiencePrecision
visualDataTypeSchema, VisualDataType
visualPrescriptionSchema, VisualPrescription
reportVisualBlueprintSchema, ReportVisualBlueprint
submitPrescriptionInputSchema, SubmitPrescriptionInput, SubmitPrescriptionOutput
DEFAULT_PLACEHOLDER, NO_MEANINGFUL_CONTENT_MESSAGE, DEFAULT_NODE_TYPE
overviewMermaidInputSchema, updateSourceScoresInputSchema
DASHBOARD_BLOCK_CONTENT_SCHEMAS, BlockContentSchema
topicItemSchema, graphNodeItemSchema, graphEdgeItemSchema, sourceItemSchema, dashboardBlockItemSchema
USER_APPEAL_TYPES, USER_APPEAL_LABELS, UserAppealType
SemanticDimensionChoice, TopologyDimensionChoice, TemporalDimensionChoice
AXIS_TOPOLOGY_ID, AXIS_TEMPORAL_ID
DimensionChoice
```

### Live exports (keep these)

```
SEMANTIC_DIMENSION_IDS, ALL_DIMENSION_IDS, FUNCTIONAL_TAG_IDS
FunctionalTagId, SemanticDimensionId
FUNCTIONAL_TAG_CORE, FUNCTIONAL_TAG_ENHANCEMENT
SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS
suggestedFollowUpQuestionsSchema, SuggestedFollowUpQuestions
FunctionalTagGroup (type)
```

## 6. Template Registry & Template Files

> ~~29 retired prompt entries~~ — **ALREADY CLEANED** (TemplateRegistry.ts is 317 lines, no retired block).

### Still need verification/cleanup

| Item | Status | Action |
|------|--------|--------|
| `AgentTemplateId` (5 entries) + `renderTemplate()` method | Registered but `renderTemplate()` has zero callers | Verify if agent templates are consumed via some other path, then delete if dead |
| `IndexingTemplateId.HubDiscoverNextDirections` | Registered, template file exists | Verify if loaded at runtime |
| `IndexingTemplateId.HubDiscoveryDefaultUserGoal` | Registered, template file exists | Verify if loaded at runtime |
| `IndexingTemplateId.HubDiscoveryPipelineBudgetNote` | Registered, template file exists | Verify if loaded at runtime |
| `ConfigTemplateId.VaultLintConfig` | Registered, file exists, but `VaultLintService` uses hardcoded default | Delete registration + file |

## 7. Dead Settings Fields

| Field | Location | Reason |
|-------|----------|--------|
| `graphViz.mstPruneDepth` | `types.ts:447` | `pruneMstEdgeKeys()` never called |
| `graphViz.skeletonBackboneOnly` | `types.ts:448` | Config value zero reads |
| `graphViz.mstLeafOpacity` | `types.ts:450` | Renderer uses hardcoded values |
| `graphViz.mstLeafWidthScale` | `types.ts:451` | Renderer uses hardcoded values |
| `search.searchSummaryModel` | `types.ts:102` | `@deprecated`; loaded then immediately deleted |
| `search.aiAnalysisWebSearchImplement` | `types.ts` | Only in settings UI, zero runtime reads |
| `search.perplexitySearchModel` | `types.ts` | Only in settings UI, zero runtime reads |
| `ai.promptRewriteEnabled` | `types.ts:361` | Loaded but zero reads |

## 8. Settings UI: "Moved to peak-config.json" footer text

The footer in `GeneralTab.tsx` mentions "Moved to peak-config.json: MST prune depth / Skeleton backbone only / MST leaf opacity-width scale / Prompt rewrite toggle" — but `peak-config.ts` is itself dead code. Remove the footer text along with the dead settings.

## 9. Legacy Graph Component Assessment

### `graph-viz/` (D3-based, 47 files)

- Only 2 production consumers: `SectionExtraChatModal.tsx` + `obsidianGraphPreset.ts`
- `multi-lens-graph/` (ReactFlow-based, 12 files) is the production replacement
- Decision needed: migrate last 2 consumers to `multi-lens-graph`, then delete entire `graph-viz/`

### `AIGraphAgent.ts` vs `ai-graph/GraphAgent.ts`

- `AIGraphAgent.ts` is the legacy non-SDK graph agent (still wired in `AppContext.aiGraphAgent()` + `useSearchSession` aiGraph mode)
- `ai-graph/GraphAgent.ts` is the SDK-based replacement
- Decision needed: migrate `AppContext.aiGraphAgent()` to `GraphAgent`, then delete `AIGraphAgent.ts`

## 10. Cleanup Execution Plan

### Batch 1: Pure deletion (no logic changes)
- Delete dead files/directories (Section 1)
- Delete dead UI components (Section 2)
- Delete dead template files (Section 1)
- Remove dead PromptId enum values + PromptVariables stubs (Section 4)
- Remove 39 dead TemplateRegistry entries (Section 6)
- Remove `AgentTemplateId` type + `renderTemplate()` method

### Batch 2: Schema + types cleanup
- Strip dead exports from `search-agent-schemas.ts` (~900 lines)
- Delete `search-agent-prompts.ts`
- Clean `shared-types.ts` dead fields
- Clean `vault/types.ts` dead phases/events
- Remove dead settings fields + UI (Section 7-8)
- Remove `peak-config.ts` + dead constants

### Batch 3: Structural refactoring
- Remove deprecated methods from `service-manager.ts` (verify callers first)
- Remove `runVisualAgent()` dead body from `ReportOrchestrator`
- Migrate `AIGraphAgent` → `GraphAgent` (or decide to keep both)
- Evaluate `graph-viz/` → `multi-lens-graph/` migration
- Clean up duplicate imports + stub placeholders

### Estimated Impact
- ~63 PromptId enum values removed
- ~39 template registry entries removed
- ~900 lines from search-agent-schemas.ts
- ~16 dead files deleted
- ~10 dead template files deleted
- ~8 dead settings fields removed
- ~15 dead type/interface fields cleaned

---

## 11. Migration / Backward-Compatibility Code (ALL TO REMOVE)

> Policy: NO migration code, NO backward compat, NO v1/v2 dual logic. Use latest version only, old data abandoned.

### 11a. V1 Provider / Profile Migration System

| File | Lines | What to remove |
|------|-------|----------------|
| `src/core/profiles/migrate-v1.ts` | entire | V1→V2 profile migration helper; reads `vaultSearch.sdkProfile` + `llmProviderConfigs` |
| `src/service/agents/vault-sdk/sdkProfile.ts` | entire | V1 profile reader; duplicate `SdkProfile` type + `toAgentSdkEnv` + `readProfileFromSettings()` fallback chain |
| `src/app/settings/PluginSettingsLoader.ts` | 4, 331–406 | `migrateFromV1` import; `vaultSearch` passthrough block; `anthropic-direct`→`anthropic` rename; `delete` of 5 deprecated fields |
| `src/app/settings/types.ts` | 468–479, 508–516 | `vaultSearch?: { sdkProfile }` field + default on `MyPluginSettings` |
| `src/app/settings/types.ts` | 353, 390 | `llmProviderConfigs` on `AIServiceSettings` (v1 API key map) — after migrating 2 remaining runtime readers |
| `src/service/chat/service-manager.ts` | 698 | `getAllAvailableModels()` reads `llmProviderConfigs` — migrate to profile-based lookup |
| `src/service/search/query/reranker.ts` | 250–259 | `getProviderConfig()` reads `llmProviderConfigs` — migrate to profile-based lookup |

### 11b. `__legacy__` Profile Fallback Blocks (3 agents)

All three follow same pattern: `ProfileRegistry.getActiveAgentProfile() ?? readProfileFromSettings() → id: '__legacy__'`

| File | Lines | Remove |
|------|-------|--------|
| `src/service/agents/VaultSearchAgentSDK.ts` | 23, 97–119 | `else` block + `readProfileFromSettings` import |
| `src/service/agents/ai-graph/GraphAgent.ts` | 22, 63–83 | Same pattern |
| `src/service/agents/report/ReportOrchestrator.ts` | 8, 52–70 | Same pattern |

After removal: if `getActiveAgentProfile()` returns null → throw error (no profile configured).

### 11c. Deprecated Settings Fields (load-then-delete pattern)

Fields still in types + defaults but immediately deleted on every load:

| Field | Type location | Delete location |
|-------|--------------|-----------------|
| `search.searchSummaryModel` | `types.ts:101` | `PluginSettingsLoader.ts:397` |
| `search.maxMultiAgentIterations` | `types.ts:138` | `PluginSettingsLoader.ts:398` |
| `search.hubDiscover.maxJudgeCalls` | hub types | `PluginSettingsLoader.ts:400` |
| `search.chunking.rerankModel` | `types.ts:44` | `PluginSettingsLoader.ts:403` |

Action: Remove from type definitions + defaults + loader. No more load-then-delete.

### 11d. Deprecated Methods & Types

| File | Item | Reason |
|------|------|--------|
| `service-manager.ts:617–681` | 5 `@deprecated` wrapper methods | Pure delegation to new API |
| `PromptService.ts:46` | `setChatService()` | No-op, `@deprecated` |
| `chat/types.ts:45` | `thinking` field on `ChatMessage` | `@deprecated use reasoning instead` |
| `chat/types.ts:230–270` | `StreamType` + `StreamingCallbacks` | `@deprecated use LLMStreamEvent` |
| `core/constant.ts:144–148` | `HUB_NAV_GROUP_AFFINITY_THRESHOLD` + `HUB_NAV_GROUP_COVERAGE_STRONG_OVERLAP` | `@deprecated unused` |
| `core/po/graph.po.ts:50` | `GRAPH_TAG_CATEGORY_EDGE_TYPES` alias | `@deprecated` compat alias |
| `search/types.ts:172–179` | `RagSource` type | `@deprecated Use SearchResultItem` |
| `ChatStore.ts:501` | `listStarred()` method | `@deprecated` — `starred` now on `chat_message` |

### 11e. Backward-Compat Re-export Files & Aliases

| File | What | Remove |
|------|------|--------|
| `src/ui/component/mine/GraphVisualization.tsx` | entire file | Pure re-export shim "for backward compatibility" |
| `src/ui/component/mine/resource-preview-hover.tsx:250` | `FilePreviewHover` alias | Compat wrapper around `ResourcePreviewHover` |
| `src/core/utils/hash-utils.ts:55` | `generateContentHash()` alias | "alias for hashString for backward compatibility" |
| `SqliteStoreManager.ts:249` | `getSearchContext()` | "for backward compatibility" — delegates to `getIndexContext('vault')` |
| `searchSessionStore.ts:29` | V2 type re-exports | "Re-export V2 types for backward compatibility" |

### 11f. V1/V2 Dual Rendering Paths

| File | Lines | Issue |
|------|-------|-------|
| `tab-AISearch.tsx` | 187–205 | Continue-analysis forks on `isV2Active` — V1 branch dead |
| `tab-AISearch.tsx` | 285, 320, 340–365 | NavBar/title/footer all fork V1/V2 |
| `useAIAnalysisResult.ts` | 26–47 | `mergeV2IntoSnapshot()` — merges V2 data into V1 snapshot shape |
| `useAIAnalysisResult.ts` | 123–171 | `handleCopyAll` V1/V2 dual path |
| `aiAnalysisStore.ts` | 788 | `blocksFollowups` → `blocksFollowupsByBlockId` compat shim |

### 11g. SQLite Schema Migration

| File | Lines | What |
|------|-------|------|
| `ddl.ts` | 406–427 | `migrateSqliteSchema()` function + `tryExec` error-swallowing wrapper |
| `ddl.ts` | 629–633 | ALTER TABLE `ai_analysis_record` (add `duration`/`title`/`analysis_preset`, drop `meta_json`) |
| `ddl.ts` | 792–796 | ALTER TABLE `mobius_node` (add `folder_cohesion_score`/`hub_stale_since`/`semantic_edges_version`) |
| `ddl.ts` | 799 | DROP TABLE `folder_intuition` |
| `ddl.ts` | 52–87 | Ghost type interfaces: `doc_statistics`, `graph_nodes`, `graph_edges` — "Logical row shape" for tables that no longer exist physically |
| `BetterSqliteStore.ts` | 467–468 | `migrateSqliteSchema(db)` call |

Action: Fold all ALTER columns into base CREATE TABLE statements. Remove `migrateSqliteSchema()`, `tryExec()`, DROP TABLE, and ghost types.

### 11h. Storage Format Compat

| File | Lines | What |
|------|-------|------|
| `DocChunkRepo.ts` | 242–292 | `getByChunkIds()` falls back to `doc_fts` table for "legacy rows" |
| `AiSearchAnalysisDoc.ts` | 75 | Old `blocksFollowups` flat array field alongside new `blocksFollowupsByBlockId` |
| `analysis-markdown-parser.ts` | 90–93 | Legacy preset name mapping: `docsimple`/`vaultsimple` → `vaultFull` |
| `analysis-markdown-parser.ts` | 486–588 | V1 `blocksFollowups` parse path |
| `analysis-markdown-builder.ts` | 365 | V1 `blocksFollowups` write path |
| `ChatProjectSummaryDoc.ts` | 43, 55–60 | Legacy plain-text format parsing fallback |

### 11i. Legacy Edge Kind Styles & Misc

| File | Lines | What |
|------|-------|------|
| `LensEdgeComponent.tsx` | 12–18 | 5 "Legacy kinds (keep for backward compat)" style entries |
| `find-path.ts` | 141–147 | `physicalAncestor` field — "Physical path analysis (legacy, kept for compatibility)" |
| `DocSimpleAgent.ts` | 162–165 | `prompt-stream-result` event fallback — "Legacy PromptService events" |

---

## 12. Updated Execution Plan

### Batch 1: Pure deletion (no logic changes needed)
- Delete dead files/directories (Section 1) — `tool-call-ui.ts`, `peak-config.ts`, `search-agent-prompts.ts`, `tmp_code_ref_for_cursor/`, `streamdown-styles.css`, `vault-lint-config.json`
- Delete dead UI components (Section 2)
- Delete `migrate-v1.ts`, `sdkProfile.ts`
- ~~Remove dead PromptId enum values~~ — **ALREADY DONE**
- ~~Remove retired TemplateRegistry entries~~ — **ALREADY DONE**
- Verify + remove `AgentTemplateId` type + `renderTemplate()` method if dead
- Delete `GraphVisualization.tsx` re-export shim

### Batch 2: Migration/compat removal
- Remove `__legacy__` fallback blocks from 3 agents (throw on missing profile instead)
- Remove `PluginSettingsLoader` migration logic (v1 migration, anthropic-direct rename, delete blocks)
- Remove deprecated settings fields from types + defaults
- Remove `vaultSearch` field from `MyPluginSettings`
- Remove 5 deprecated wrapper methods from `service-manager.ts`
- Remove deprecated types: `thinking`, `StreamType`, `StreamingCallbacks`, `RagSource`
- Remove compat aliases: `generateContentHash`, `FilePreviewHover`, `GRAPH_TAG_CATEGORY_EDGE_TYPES`, `getSearchContext`
- Remove V1 branches from `tab-AISearch.tsx`, `useAIAnalysisResult.ts`, `aiAnalysisStore.ts`
- Remove `mergeV2IntoSnapshot()`

### Batch 3: Schema + deep cleanup
- Strip dead exports from `search-agent-schemas.ts` (~900 lines)
- Clean `shared-types.ts` dead fields
- Fold ALTER TABLE columns into CREATE TABLE; remove `migrateSqliteSchema()` entirely
- Remove `doc_fts` fallback in `DocChunkRepo`
- Remove ghost type interfaces from `ddl.ts`
- Remove `blocksFollowups` old field from `AiSearchAnalysisDoc` + parser/builder
- Remove legacy preset name mapping in parser
- Remove legacy plain-text parsing in `ChatProjectSummaryDoc`
- Remove `chat_star` table + `listStarred()` if fully superseded

### Batch 4: Provider v1 retirement (requires 2 call-site migrations first)
- Migrate `service-manager.ts:698` `getAllAvailableModels()` to profile-based model listing
- Migrate `reranker.ts:250` `getProviderConfig()` to profile-based credential lookup
- Then remove `llmProviderConfigs` field from `AIServiceSettings` + defaults + loader

### Batch 5: Component consolidation (optional)
- Migrate `SectionExtraChatModal` from `graph-viz` to `multi-lens-graph`
- Delete entire `graph-viz/` directory (47 files)
- Migrate `AIGraphAgent` → `GraphAgent` in `AppContext` + `useSearchSession`
- Delete `AIGraphAgent.ts`
- Merge `vault-sdk/sdkAgentPool.ts` → `core/sdkAgentPool.ts`
- Merge `vault-sdk/sdkMessageAdapter.ts` → `core/sdkMessageAdapter.ts`

### Estimated Total Impact (updated after verification)

**Already done:**
- ~~63 PromptId enum values removed~~ — DONE
- ~~29 retired template registry entries removed~~ — DONE
- ~~MobileSearchService.ts deleted~~ — DONE
- ~~search-query-routing.json deleted~~ — DONE

**Remaining:**
- ~900 lines from search-agent-schemas.ts (1346 lines, ~70% dead)
- ~10 dead files to delete
- ~1 dead template file to delete (vault-lint-config.json)
- ~8 dead settings fields to remove
- ~15 dead type/interface fields to clean
- All migration/compat code eliminated (~500+ lines across ~20 files)
- SQLite migration system removed (fold ALTER into CREATE TABLE)
- V1/V2 dual rendering paths eliminated in tab-AISearch.tsx
- `__legacy__` profile fallback removed from 3 agents
- `llmProviderConfigs` v1 provider system retired (after migrating 2 call sites)
- `migrate-v1.ts` + `sdkProfile.ts` + `peak-config.ts` deleted
