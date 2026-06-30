# Service Logic Extraction Map

Date: 2026-06-30
Related issues: Issue 15 (owner-code-review-issue-log.md) + all 14 findings from app-layer-service-logic-issue-map.md, cross-referenced with Issues 1, 2, 3, 7, 9.

## Design Principle

> App adapters may project host/runtime shapes into safe data structures.
> Service/core must own decisions, thresholds, scoring, ranking, prompt wording, product fallback semantics, and maintenance workflows.

Confidence key:
- **High** — adapter contains sorting, scoring, graph traversal, prompt text, or multi-step workflows that clearly belong to service/domain code.
- **Medium** — adapter has one or two policy knobs; the bulk is valid host wiring.
- **Keep** — host projection is the right responsibility; no extraction needed.

---

## Priority-Ordered Findings

### Finding 1 — Serendipity Algorithm in Ambient Search Adapter

| field | value |
|-------|-------|
| priority | 1 (highest) |
| confidence | High |
| issue map ref | Map §3 |
| cross-ref issue log | Issue 1 (clock port), Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/ambient/SearchAmbientSearchAdapter.ts` |
| symptom | `serendipitySearch()` (line 61) performs 2-hop graph traversal, tracks bridge nodes, filters document-like nodes and existing outlinks, computes embedding distance, and sorts+maps results into `AmbientPushItem`. The comment (line 6) explicitly acknowledges this code formerly lived in `service/ambient/SerendipitySearcher.serendipitySearch` and was moved into the app adapter during T8. |
| proposed app port file | `src/app/ambient/SearchAmbientSearchAdapter.ts` → slimmed to: graph read, embedding query, outlink snapshot; returns raw rows/graph slices via a `SerendipityDataPort` |
| proposed service module | `src/service/ambient/SerendipitySearcher.ts` (restore and own: traversal policy, bridge detection, embedding distance sort, topK slicing, `AmbientPushItem` projection) |
| test files to update | `test/ambient-runtime-ports.test.ts` (search port stub); create `test/serendipity-searcher.test.ts` for algorithm unit tests |
| snapshot baseline needed | **Yes** — serendipity ranking affects what Ambient pushes; a golden-output snapshot against a fixed graph + embeddings fixture would guard regressions |

---

### Finding 2 — Morning Briefing Rules in Ambient Briefing Adapter

| field | value |
|-------|-------|
| priority | 2 |
| confidence | High |
| issue map ref | Map §4 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/ambient/SqliteAmbientBriefingAdapter.ts` |
| symptom | Three private functions (`getUnresolvedConnectionNotes`, `getChangedHubs`, `getDecayingEngagementNotes`) define Morning Briefing category logic, scoring formulas (line 80: `score: incoming - outgoing`), decay-window threshold (`BRIEFING_MAX_ITEMS_PER_CATEGORY` constant), and reason-text construction. The adapter both queries SQLite and decides what a "briefing item" means. |
| proposed app port file | `src/app/ambient/SqliteAmbientBriefingAdapter.ts` → only raw queries (unresolved-connection rows, hub rows, decaying rows). Returns raw `BriefingRow[]` via a `BriefingDataPort`. |
| proposed service module | `src/service/ambient/BriefingItemBuilder.ts` — owns category definitions, `BRIEFING_MAX_ITEMS_PER_CATEGORY`, decay window constant, scoring formula, reason-text construction, and merging into `BriefingItem[]` |
| test files to update | `test/ambient-runtime-ports.test.ts` (briefing port stub already exists — verify contract match); create `test/briefing-item-builder.test.ts` for scoring/category unit tests |
| snapshot baseline needed | **Yes** — briefing item ordering and reason-text affect Morning Briefing UX; snapshot against fixture rows |

---

### Finding 3 — Maintenance Workflows in PeakCommandActions

| field | value |
|-------|-------|
| priority | 3 |
| confidence | High |
| issue map ref | Map §5 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/commands/PeakCommandActions.ts` |
| symptom | `cleanupUselessData()` (line 453) runs a multi-repo maintenance workflow: find indexed docs missing from vault, delete search documents, clean orphaned index records, clean vec embeddings, identify orphan chat conversations, delete chat resources/stars/messages/conversations, emit multiple progress notices. `compareSearchResults()` (line 526) orchestrates search evaluation and metric reporting. Both are multi-step domain workflows, not command UI shells. |
| proposed app port file | `src/app/commands/PeakCommandActions.ts` — keep only: user confirmation dialog, progress reporter wiring, calling service, surface-level Notice output |
| proposed service module | `src/service/maintenance/MaintenanceCleanupService.ts` (owns: repo sweep, orphan detection, chunked deletes, progress callback), `src/service/search/evaluation/SearchEvaluationService.ts` (owns: PPR comparison, metric aggregation) |
| test files to update | Create `test/maintenance-cleanup-service.test.ts` (in-memory SQLite fixture); existing regression tests guard `PeakCommandActions` path — update if needed |
| snapshot baseline needed | No — cleanup is idempotent and deterministic given repo state; unit test with fixture is sufficient |

---

### Finding 4 — Graph Cleanup as DevTools Global (Already Partially Extracted)

| field | value |
|-------|-------|
| priority | 4 |
| confidence | High |
| issue map ref | Map §6 |
| cross-ref issue log | Issue 7, Issue 15 |
| current app file | `src/app/context/AppContext.ts:428–434` (instantiates `GraphCleanupService` inline as a `window.cleanupGraphTable` lambda) |
| symptom | `app/context/graph-cleanup.ts` was mentioned in the issue log but has since been **deleted**. `GraphCleanupService` already lives at `src/service/search/index/maintenance/GraphCleanupService.ts`. The remaining app-layer issue is that `AppContext` instantiates and registers the service inline inside `handleDevToolsSettingChange()` rather than delegating to a consolidated devtools registration module. |
| proposed app port file | Create `src/app/context/devtools.ts` — consolidates all `window.*` devtools registrations currently scattered across `AppContext` inline lambdas, `test-tools.ts`, and `system-info.ts` references |
| proposed service module | `src/service/search/index/maintenance/GraphCleanupService.ts` — **already exists**; no extraction needed |
| test files to update | `test/app-runtime-registry.test.ts` may need update if devtools module boundary changes |
| snapshot baseline needed | No |
| notes | Primary action: extract `handleDevToolsSettingChange` content into `src/app/context/devtools.ts`, import and call from `AppContext` |

---

### Finding 5 — Vault Review Digest Construction in App Adapter

| field | value |
|-------|-------|
| priority | 5 |
| confidence | High |
| issue map ref | Map §2 |
| cross-ref issue log | Issue 9, Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/copilot/vault/SqliteVaultReviewDigestAdapter.ts` |
| symptom | Adapter computes vault fingerprint (lines 48–85), defines `FINGERPRINT_CACHE_TTL_MS` and `STALE_HUB_DAYS` constants, derives orphan/hub/stale-hub lists with classification logic (lines 91–153), merges Vault Lint health, and shapes the complete `VaultDigest` struct. The adapter is both SQLite access layer and `VaultDigestBuilder`. |
| proposed app port file | `src/app/copilot/vault/SqliteVaultReviewDigestAdapter.ts` → raw data adapter only: returns `{ orphanRows, hubRows, staleHubRows, dormantClusterRows, lintHealth }` via a `VaultDigestDataPort` |
| proposed service module | `src/service/copilot/vault/VaultDigestBuilder.ts` — owns: fingerprint computation/caching, `FINGERPRINT_CACHE_TTL_MS`, `STALE_HUB_DAYS`, classification thresholds, top-K policies, `VaultDigest` shaping |
| test files to update | `test/vault-review-runtime-ports.test.ts` (update port stubs to match new data shape); create `test/vault-digest-builder.test.ts` |
| snapshot baseline needed | **Yes** — digest shape drives Vault Intelligence agent input; snapshot with fixture rows guards regressions |

---

### Finding 6 — Semantic Graph Suggestion Algorithm in App Adapter

| field | value |
|-------|-------|
| priority | 6 |
| confidence | High |
| issue map ref | Map §1 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/copilot/actions/SqliteCopilotActionSemanticGraphAdapter.ts` |
| symptom | `runSemanticLinkLookup()` merges outgoing/incoming semantic edges, assigns fallback incoming weights (line 60: `weight: 0.5`), filters existing links, builds titles/snippets, sorts (line 92) and truncates to 20. `runSmartConnectionsLookup()` does semantic neighbor selection, shared theme computation (line 139), similarity parsing, and top-N selection. The adapter currently implements `CopilotActionSemanticGraphPort`. |
| proposed app port file | `src/app/copilot/actions/SqliteSemanticGraphReadAdapter.ts` (rename) — only: graph node/edge reads and embedding queries; implements a narrow `SemanticGraphDataPort` |
| proposed service module | `src/service/copilot/actions/SemanticLinkSuggestionService.ts` — owns: neighbor merging, weight fallbacks, existence filtering, snippet building, sort+truncate; `SmartConnectionService.ts` — owns: neighbor selection, shared-theme computation, top-N |
| test files to update | `test/copilot-action-runtime-ports.test.ts` (update stubs); create `test/semantic-link-suggestion-service.test.ts` |
| snapshot baseline needed | No — algorithm unit tests with fixture node/edge data are sufficient |

---

### Finding 7 — Prompt and Policy in LLM Ambient Explanation Adapter

| field | value |
|-------|-------|
| priority | 7 |
| confidence | High |
| issue map ref | Map §7 |
| cross-ref issue log | Issues 2, 3, 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/ambient/LlmAmbientExplanationAdapter.ts` |
| symptom | Adapter builds inline system prompt ("You are a concise research assistant…" line 44), constructs user prompt inline (excerpt truncation + framing, ~lines 30–42), applies cooldown policy via direct `Date.now()` (bypassing `AmbientClockPort`), and hard-truncates model output to 500 characters (magic number). |
| proposed app port file | `src/app/ambient/LlmAmbientExplanationAdapter.ts` → only: provider/profile selection, stream collection; delegates prompt rendering to service |
| proposed service module | `src/service/ambient/AmbientExplanationService.ts` — owns: `PromptId.AmbientExplanationSystem` + `PromptId.AmbientExplanation` rendering, explanation max-length config, cooldown policy (using injected clock port), truncation rationale |
| test files to update | `test/ambient-runtime-ports.test.ts` (explanation port stub already covers interface); add test for `AmbientExplanationService` cooldown and truncation logic |
| snapshot baseline needed | No |
| notes | Max-length (currently 500) should become a named constant in `src/core/constant.ts` ambient section or a config template value, not a magic number in the adapter |

---

### Finding 8 — Search Unavailability Silently Returns Empty Results

| field | value |
|-------|-------|
| priority | 8 |
| confidence | Medium |
| issue map ref | Map §10 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/copilot/actions/AppCopilotActionSearchAdapter.ts` |
| symptom | When `SearchClient` is unavailable (boot, mobile), the adapter returns `{ items: [] }`, conflating "search unavailable" with "no results". The product cannot distinguish the two states. |
| proposed app port file | `src/app/copilot/actions/AppCopilotActionSearchAdapter.ts` → return a discriminated union or a `SearchAvailabilityPort` contract that exposes `available: boolean` |
| proposed service module | Existing `CopilotActionRuntime` or a shared `VectorSearchAvailabilityPort` in `src/core/ports/VectorSearchPort.ts` — service layer uses `available` flag to show appropriate UI state or fallback message |
| test files to update | `test/copilot-action-runtime-degraded-ports.test.ts` — already tests degraded ports; update to assert `available: false` vs empty-results distinction |
| snapshot baseline needed | No |

---

### Finding 9 — Copilot AI Adapter Is Redundant Forwarding

| field | value |
|-------|-------|
| priority | 9a |
| confidence | Medium |
| issue map ref | Map §8 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/copilot/actions/AppCopilotActionAiAdapter.ts` |
| symptom | Adapter only forwards `renderPrompt`, `queryStructured`, `queryTextStream`. No transformation, no host-API access, no boundary protection beyond typing. `IAgentPrompter` already covers this shape. |
| proposed app port file | Remove or inline into `composeCopilotActionRuntime.ts` — pass `IAgentPrompter` directly through the port |
| proposed service module | `src/core/llm/IAgentPrompter.ts` (existing) — already the right contract |
| test files to update | `test/copilot-action-runtime-ports.test.ts` — update port stub to reference `IAgentPrompter` directly |
| snapshot baseline needed | No |

### Finding 9b — Copilot Vault Adapter Duplicates General Vault Reader Shape

| field | value |
|-------|-------|
| priority | 9b |
| confidence | Medium |
| issue map ref | Map §9 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/copilot/actions/ObsidianCopilotActionVaultAdapter.ts` |
| symptom | Wraps `app.vault.cachedRead`, `metadataCache.getFileCache`, `metadataCache.resolvedLinks`. The project already has `AppVaultReaderAdapter` (`DocumentVaultReaderPort`) and `VaultMetadataResolverPort`. This adapter may duplicate them for a Copilot-specific shape. |
| proposed app port file | Audit against `DocumentVaultReaderPort` and `VaultMetadataResolverPort`. If the Copilot action runtime only needs `resolvedLinks` snapshot data, add that as a narrow extra field to an existing port. |
| proposed service module | Use existing `AppVaultReaderAdapter` / `VaultMetadataResolverPort` — no new service module needed |
| test files to update | `test/copilot-action-runtime-ports.test.ts` |
| snapshot baseline needed | No |

---

### Finding 10 — Custom Prompt Source Tied to Copilot Actions Folder

| field | value |
|-------|-------|
| priority | 10 |
| confidence | Medium |
| issue map ref | Map §11 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/copilot/actions/ObsidianCustomPromptSourceAdapter.ts` |
| symptom | Scans configured prompt folder and parses prompt markdown. Custom prompt *definitions* are not inherently a Copilot action concern — they are a vault-hosted prompt source that multiple consumers (Copilot, future Chat, future Skills) could share. |
| proposed app port file | Relocate to `src/app/prompts/ObsidianCustomPromptSourceAdapter.ts` — a shared prompt-source area independent of Copilot's action runtime folder |
| proposed service module | `src/service/copilot/CustomPromptRegistry.ts` (existing) already owns the pure parsing logic via `parseCustomPromptFile`. No new service module needed — only relocation of the app adapter. |
| test files to update | `test/copilot-action-runtime-source-guard.test.ts` — update import path assertion |
| snapshot baseline needed | No |

---

### Finding 11 — Pattern Learning Policy in Ambient Persistence Adapter

| field | value |
|-------|-------|
| priority | 11 |
| confidence | Medium |
| issue map ref | Map §12 |
| cross-ref issue log | Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/ambient/SqliteAmbientPersistenceAdapter.ts` |
| symptom | Owns `PATTERN_REFRESH_INTERVAL_MS` (10 min), `PATTERN_LOOKBACK_DAYS` (30), `PATTERN_MIN_OCCURRENCES` (2), and `strength = count * avgScore` formula (line 67). These are pattern-learning policy decisions, not SQLite query concerns. |
| proposed app port file | `src/app/ambient/SqliteAmbientPersistenceAdapter.ts` → query only: returns raw `RecurringPairRow[]` without score computation |
| proposed service module | `src/service/ambient/PatternLearner.ts` (new, small) — owns constants, cache policy, `strength` formula |
| test files to update | `test/seed-patterns.test.ts` may be relevant; create `test/pattern-learner.test.ts` |
| snapshot baseline needed | No |

---

### Finding 12 — Vault Lint Detector Context Adapter (Keep with Caveat)

| field | value |
|-------|-------|
| priority | 12 |
| confidence | Medium-low — likely Keep |
| issue map ref | Map §13 |
| cross-ref issue log | Issue 9, Issue 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts` |
| symptom | Projects Obsidian `TFile`/`TagCache`, SQLite `GraphNode`, and semantic-neighbor results into `VaultLintDetectorContext` shapes. Also normalizes frontmatter tags via `normalizeFrontmatterTags()` (line 126) and calls `getSemanticNeighbors` helper (line 106). Projection from host shapes is valid app-layer work. |
| proposed app port file | Keep as-is for now. If `getSemanticNeighbors` grows or is shared, extract to `src/service/search/graph/SemanticNeighborQueryService.ts` |
| proposed service module | No immediate extraction. Monitor for growth. |
| test files to update | `test/vault-lint-source-guard.test.ts` guards current boundary; no change needed |
| snapshot baseline needed | No |

---

### Finding 13 — Debug System Persona Is a Service-Level Aggregator

| field | value |
|-------|-------|
| priority | 13 |
| confidence | Medium |
| issue map ref | Map §14 |
| cross-ref issue log | Issues 7, 15 |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/debug/system-info.ts` |
| symptom | `getVaultPersona()` aggregates vault stats (`getVaultStatistics`), vault description, tag cloud (`getTagCloud`), folder structure, and capability flags. It directly calls `sqliteStoreManager` for tag data and `AppContext.getInstance()` implicitly via imported helpers. This is a service-level "system diagnosis" aggregator disguised as a debug helper. |
| proposed app port file | `src/app/context/devtools.ts` (new, see Finding 4) — `getVaultPersona` becomes one export the devtools module exposes to `window.*`. The app-level wrapper stays thin. |
| proposed service module | `src/service/system/VaultPersonaService.ts` (new) — owns: stats aggregation, tag-cloud query, folder-structure summary, capability detection. Called by devtools wrapper. |
| test files to update | Audit `AppContext` line 517 (`'getVaultPersona'`) and ensure the devtools module re-exports it. No dedicated test file currently. |
| snapshot baseline needed | No — debug-facing only |

---

### Finding 14 — Settings Sanitization in App (Acceptable — No Action)

| field | value |
|-------|-------|
| priority | 14 |
| confidence | Keep |
| issue map ref | Map §15 |
| cross-ref issue log | — |
| current app file | `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/settings/PluginSettingsLoader.ts` |
| symptom | `sanitizeBudget()` and related normalization of persisted plugin settings. |
| verdict | **Acceptable as-is.** Loading and sanitizing persisted plugin settings is app/host ownership. No extraction needed. |

---

## Cross-Reference: Issue Log Issues → Map Findings

| issue log issue | relevant findings | notes |
|----------------|------------------|-------|
| Issue 1 (AmbientClock determinism) | Finding 7 | LLM explanation adapter uses direct `Date.now()`, bypassing clock port; fix when extracting `AmbientExplanationService` |
| Issue 2 (inline prompts) | Finding 7 | Prompt text extraction is the core of Finding 7; see also prompt-inventory.md |
| Issue 3 (LlmAmbientExplanationAdapter design) | Finding 7 | Truncation policy, streaming, full output vs display limit |
| Issue 7 (DevTools scatter) | Finding 4, Finding 13 | Consolidate into `src/app/context/devtools.ts`; move `getVaultPersona` to `VaultPersonaService` |
| Issue 9 (retire standalone X-Ray) | Finding 5 | `VaultDigestBuilder` must remain in service/Vault Intelligence, not app digest adapter |
| Issue 15 (service logic in app adapters) | Findings 1–13 | This map is the implementation detail for Issue 15 |

---

## Execution Order Recommendation

Execute in finding-number order. Each extraction is independently testable:

```
Finding 1  →  SerendipitySearcher (snapshot test)
Finding 2  →  BriefingItemBuilder (snapshot test)
Finding 3  →  MaintenanceCleanupService + SearchEvaluationService
Finding 4  →  devtools.ts consolidation
Finding 5  →  VaultDigestBuilder (snapshot test)
Finding 6  →  SemanticLinkSuggestionService + SmartConnectionService
Finding 7  →  AmbientExplanationService + templates (coordinate with prompt-inventory.md entries 1, 1b)
Finding 8  →  SearchAvailabilityPort (small; can batch with 9a/9b)
Finding 9a →  Remove AppCopilotActionAiAdapter / use IAgentPrompter directly
Finding 9b →  Consolidate ObsidianCopilotActionVaultAdapter into existing ports
Finding 10 →  Relocate ObsidianCustomPromptSourceAdapter to app/prompts/
Finding 11 →  PatternLearner (small)
Finding 12 →  Monitor only
Finding 13 →  VaultPersonaService + devtools consolidation (can batch with Finding 4)
```

The three snapshot baselines (Findings 1, 2, 5) should be captured **before** extraction begins, using the existing adapter under `test/fixtures/` so the service implementation can be verified against the baseline.
