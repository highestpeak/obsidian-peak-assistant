# App Layer Service-Logic Issue Map

Date: 2026-06-30

Owner context: this note captures a code-reading discussion about `src/app/**`, especially whether recent boundary adapters have become too feature-local or are hiding real service/domain logic. It is an issue map for the next planning pass, not an implementation handoff.

## Core Concern

The app layer should mostly own Obsidian/host wiring:

- Modal/view shells
- AppContext/runtime composition
- Obsidian `App`, `Vault`, `Workspace`, `Notice`, `TFile/TFolder` access
- SQLite/provider/repo binding
- Thin shape projection from host objects into narrow service ports

The app layer should not decide domain behavior:

- recommendation rules
- graph traversal algorithms
- ranking/scoring/slicing policies
- what counts as stale, orphaned, unresolved, or worth surfacing
- LLM prompt content and response strategy
- maintenance cleanup workflows
- product fallback semantics such as "not available" vs "empty result"

The repeated pattern found here: previous modernization work successfully removed many `service -> app` edges, but in several cases it moved service logic into app adapters rather than introducing a clean app-side data port plus service-side orchestrator.

## User Questions Raised

1. Is it really necessary to wrap simple AI calls like `renderPrompt`, `queryStructured`, and `queryTextStream` in a Copilot-specific adapter?

   Finding: not always. The adapter direction is valid, but `AppCopilotActionAiAdapter` is almost pure forwarding. The project already has a more general `IAgentPrompter` surface that may cover this better.

2. Is it necessary for every feature to have its own vault adapter for reading files and metadata?

   Finding: probably not. The project already has `AppVaultReaderAdapter`, `DocumentVaultReaderPort`, and `VaultMetadataResolverPort`. `ObsidianCopilotActionVaultAdapter` duplicates part of that shape and may be a feature-local thin wrapper.

3. Should custom prompt source live under `app/copilot/actions`?

   Finding: only partially. Copilot turns custom prompt definitions into actions, but reading/parsing prompt source is more general than Copilot. A future location such as `app/prompts` plus a shared prompt-source port would fit better.

4. Should search unavailable return an empty item list?

   Finding: this hides an important state. `AppCopilotActionSearchAdapter` currently treats missing `SearchClient` as `{ items: [] }`; this protects boot/mobile paths, but conflates "search unavailable" with "no results".

5. Should semantic graph suggestion logic live inside an app adapter?

   Finding: no. `SqliteCopilotActionSemanticGraphAdapter` contains real domain logic and should be split.

6. Are there similar issues outside `app/copilot`?

   Finding: yes. Similar service logic appears in ambient adapters, command actions, graph cleanup, debug persona helpers, and some maintenance flows.

## High-Confidence Issues

### 1. Copilot Semantic Graph Adapter Contains Domain Logic

File: `src/app/copilot/actions/SqliteCopilotActionSemanticGraphAdapter.ts`

Problem:

- `runSemanticLinkLookup()` merges outgoing/incoming semantic edges.
- It assigns fallback incoming weights.
- It filters existing links.
- It builds titles/snippets.
- It sorts and truncates suggestions.
- `runSmartConnectionsLookup()` also does semantic neighbor selection, shared theme computation, similarity parsing, and top-N selection.

Why this is app-layer drift:

The app layer should bind SQLite repos or expose a read port. The "what should be suggested as a semantic link" algorithm belongs in service/domain code.

Likely direction:

- App layer: `SqliteSemanticGraphReadAdapter` or repo/data port only.
- Service layer: `SemanticLinkSuggestionService` / `SmartConnectionService`.
- Copilot action runtime: calls the service through a narrow port.

### 2. Vault Review Digest Adapter Builds Product Digest in App

File: `src/app/copilot/vault/SqliteVaultReviewDigestAdapter.ts`

Problem:

- Computes vault fingerprint.
- Defines top-K constants and cache TTL.
- Derives orphan/hub/stale-hub/dormant-cluster/tag summaries.
- Merges Vault Lint health.
- Shapes the full `VaultDigest`.

Why this is app-layer drift:

Raw DB reads may be app-side, but digest semantics are product/service logic. The adapter is currently both SQLite access and `VaultDigestBuilder`.

Likely direction:

- App layer: data access adapter returning raw rows or narrow query results.
- Service layer: `VaultDigestBuilder` owns fingerprint/digest construction, thresholds, top-K policy, and shaping.

### 3. Ambient Search Adapter Contains Serendipity Algorithm

File: `src/app/ambient/SearchAmbientSearchAdapter.ts`

Problem:

- Contains `serendipitySearch()`.
- Performs 2-hop graph traversal.
- Tracks bridge nodes.
- Filters document-like nodes and existing outlinks.
- Computes embedding distance.
- Sorts and maps results into `AmbientPushItem`.

Why this is app-layer drift:

This is the core serendipity recommendation algorithm. It was moved from service into an app adapter, but it is not host wiring.

Likely direction:

- App layer: graph/embedding read port.
- Service layer: `SerendipitySearcher` owns traversal and ranking again.
- Ambient runtime: uses service algorithm with injected data access.

### 4. Ambient Briefing Adapter Owns Briefing Rules

File: `src/app/ambient/SqliteAmbientBriefingAdapter.ts`

Problem:

- Defines unresolved connection rules.
- Defines changed hub selection.
- Defines decaying engagement selection.
- Defines decay day window and category limit.
- Computes scores and reason text.

Why this is app-layer drift:

The queries touch SQLite, but the categories and reason/score construction are Morning Briefing product logic.

Likely direction:

- App layer: query/read port for rows needed by briefing.
- Service layer: `MorningBriefingQueryService` or `BriefingItemBuilder` owns categories, scoring, limits, and reason text.

### 5. Command Actions Contain Maintenance Use Cases

File: `src/app/commands/PeakCommandActions.ts`

High-confidence examples:

- `cleanupUselessData()`
- `compareSearchResults()`
- parts of `analyzeVaultIntuition()`

Problem:

`cleanupUselessData()` performs a full maintenance workflow:

- find indexed docs missing from vault
- delete search documents
- clean orphaned index records
- clean vec embeddings
- identify orphan chat conversations
- delete chat resources/stars/messages/conversations
- emit multiple progress notices

`compareSearchResults()` performs search evaluation orchestration and metric reporting.

Why this is app-layer drift:

Commands should gather user input, ask for confirmation, call a service, and show Notices. They should not contain multi-repo maintenance workflows.

Likely direction:

- `MaintenanceCleanupService` for cleanup.
- `SearchEvaluationService` for PPR comparison.
- Command file stays as UI shell.

### 6. Graph Cleanup Is a DB Service Hidden in App Context

File: `src/app/context/graph-cleanup.ts`

Problem:

- Finds orphan graph edges.
- Finds document-like graph nodes without indexed documents.
- Runs transactional deletes with chunking.

Why this is app-layer drift:

This is database maintenance service logic, even if exposed to DevTools. It should not live under `app/context`.

Likely direction:

- Move to `service/search/index/maintenance` or similar.
- App/devtools only calls the service.

### 7. Ambient LLM Explanation Adapter Owns Prompt and Policy

File: `src/app/ambient/LlmAmbientExplanationAdapter.ts`

Problem:

- Builds inline prompt text.
- Chooses system prompt.
- Applies cooldown policy.
- Truncates paragraph/excerpt.
- Parses and truncates model output.

Why this is app-layer drift:

Provider/profile wiring can be app-side. Prompt wording and explanation policy should be service/template-owned.

Likely direction:

- Move prompt text into templates.
- Service owns `AmbientExplanationService` policy.
- App adapter only invokes the provider/profile runtime.

## Medium-Confidence Issues

### 8. Copilot AI Adapter Is Mostly Thin Forwarding

File: `src/app/copilot/actions/AppCopilotActionAiAdapter.ts`

Problem:

The adapter just forwards:

- `renderPrompt`
- `queryStructured`
- `queryTextStream`

Why this is questionable:

It does not transform host objects, protect a boundary beyond typing, or add meaningful availability semantics. Existing `IAgentPrompter` may already be the better shared port.

Likely direction:

- Reuse a general AI/prompter port where possible.
- Avoid Copilot-specific wrappers unless they add Copilot-specific semantics.

### 9. Copilot Vault Adapter Duplicates Existing Vault Reader Shape

File: `src/app/copilot/actions/ObsidianCopilotActionVaultAdapter.ts`

Problem:

It wraps common vault read/metadata operations:

- markdown files
- cached read
- file cache
- resolved links
- linkpath resolution

Why this is questionable:

The repo already has `AppVaultReaderAdapter`, `DocumentVaultReaderPort`, and `VaultMetadataResolverPort`. This Copilot-specific wrapper may be duplicating a general read/metadata port.

Likely direction:

- Reuse common vault reader/metadata ports.
- Add one narrow extra port only for data that is genuinely not covered, such as full resolved-link snapshots.

### 10. Copilot Search Adapter Hides Availability State

File: `src/app/copilot/actions/AppCopilotActionSearchAdapter.ts`

Problem:

If `SearchClient` is unavailable, it returns `{ items: [] }`.

Why this is questionable:

Boot/mobile safety is good, but "search unavailable" and "no results" are different states. Returning empty results hides a product/runtime condition.

Likely direction:

- Introduce a shared `VectorSearchPort` / `SearchAvailabilityPort`.
- Return `available: false` or a reason value instead of silent empty results.

### 11. Custom Prompt Source Is Tied to Copilot Actions

File: `src/app/copilot/actions/ObsidianCustomPromptSourceAdapter.ts`

Problem:

It scans the configured prompt folder and parses prompt markdown under `app/copilot/actions`.

Why this is questionable:

The source of custom prompts is not inherently a Copilot action concern. Copilot action building is one consumer of prompt definitions.

Likely direction:

- Move Obsidian prompt source adapter toward `app/prompts` or a shared prompt-source composition area.
- Let Copilot action runtime consume parsed prompt definitions.

### 12. Ambient Persistence Adapter Contains Pattern Learning Policy

File: `src/app/ambient/SqliteAmbientPersistenceAdapter.ts`

Problem:

- Owns pattern cache duration.
- Owns pattern lookback window.
- Owns minimum occurrences.
- Computes `strength = count * avgScore`.

Why this is questionable:

Persistence and cache may be app/infrastructure, but pattern learning thresholds and strength formula belong closer to service logic.

Likely direction:

- App adapter returns recurring pair rows.
- Service/pattern learner owns cache policy and strength calculation.

### 13. Vault Lint Detector Context Adapter Is Mostly Fine but Large

File: `src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts`

Problem:

Mostly valid adapter work, but it also normalizes tags, projects graph nodes, and calls semantic neighbor helper.

Why this is only medium-confidence:

Projection from raw Obsidian/SQLite shapes into detector-safe shapes is a valid app adapter responsibility. This is not as clearly wrong as Ambient or Copilot semantic graph logic.

Likely direction:

- Keep host projection here for now.
- If it grows, split generic graph/tag projection helpers into service/core pure helpers.

### 14. Debug System Persona Is a Service-Like Aggregator

File: `src/app/debug/system-info.ts`

Problem:

`getVaultPersona()` aggregates vault stats, vault description, tag cloud, folder structure, and capabilities.

Why this is questionable:

It is debug-facing, but it combines domain summary logic with app context and SQLite access.

Likely direction:

- If still used, move persona aggregation to service/debug or service/system-info.
- App/debug should only expose/call it.

## Lower-Priority Observations

### 15. Settings Sanitization in App Is Acceptable

File: `src/app/settings/PluginSettingsLoader.ts`

Observation:

`sanitizeBudget()` and related persisted-settings normalization are app-layer acceptable because loading/sanitizing persisted plugin settings is app ownership.

No immediate action.

### 16. Quick Search Host Is Large but Mostly Composition

File: `src/app/quick-search/composeQuickSearchHost.ts`

Observation:

This file is broad, but it mainly composes host capabilities, factories, settings flags, and file operations into a UI host bundle.

Caveat:

It imports many service constructors directly. This may be a future composition cleanup, but it is less clearly misplaced than adapters that contain ranking/graph algorithms.

## Suggested Priority

1. `SearchAmbientSearchAdapter.serendipitySearch`
2. `SqliteAmbientBriefingAdapter` briefing categories/scoring
3. `PeakCommandActions.cleanupUselessData`
4. `app/context/graph-cleanup.ts`
5. `SqliteVaultReviewDigestAdapter`
6. `SqliteCopilotActionSemanticGraphAdapter`
7. `LlmAmbientExplanationAdapter` prompt/policy
8. `AppCopilotActionSearchAdapter` availability semantics
9. `AppCopilotActionAiAdapter` / `ObsidianCopilotActionVaultAdapter` consolidation
10. `ObsidianCustomPromptSourceAdapter` relocation

## Planning Guidance For Next Agent

Do not solve this by creating a single giant `AppAdapter` or `VaultAdapter`.

Better target shape:

- App adapters expose narrow environment/data ports.
- Service owns algorithms, decisions, thresholds, scoring, prompt wording, and result shaping.
- Shared generic ports should exist for common capabilities:
  - AI/prompter
  - vault reader
  - vault metadata resolver
  - vector search/search availability
  - semantic graph read access
  - prompt source
- Feature-specific adapters should only remain where the feature truly needs a feature-specific host operation.

Guardrail:

If an app file contains `sort`, `score`, `threshold`, `topK`, multi-step graph traversal, prompt text, or multi-repo cleanup workflow, inspect it carefully. It may be service logic hiding in app.
