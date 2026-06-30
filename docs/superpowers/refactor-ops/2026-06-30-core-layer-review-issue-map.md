# Core Layer Review Issue Map

Date: 2026-06-30

Scope: owner-facing review map for `src/core` after the app-layer review. This document is separate from `2026-06-30-owner-code-review-issue-log.md` because that rolling review document is being used for active work. This is analysis only; it does not imply product code changes until the owner asks for implementation.

## Summary

`src/core` is currently too broad. It contains some things that genuinely belong in a core layer:

- pure domain/entity types;
- prompt ids and typed prompt variable contracts;
- stable port contracts;
- schema definitions;
- pure utilities with no runtime side effects;
- neutral vault file refs and other host-free data shapes.

But it also contains concrete runtime implementation:

- SQLite connection lifecycle and repository factory/singleton;
- native module download/install/verification;
- concrete provider adapters and network fetch helpers;
- vault write helpers that duck-type Obsidian through `AppHandle`;
- document indexing orchestration with LLM calls and telemetry;
- UI display caps and visual labels;
- prompt/system-prompt content that should live in templates.

The practical result is that `core` has become a globally importable runtime bucket. Because it is named `core`, app/service/ui code imports from it freely, and `core/storage/sqlite/SqliteStoreManager` acts like a global service locator.

## Relevant Files And Folders

- `src/core/constant.ts`
- `src/core/ports/*`
- `src/core/template/*`
- `src/core/prompt/PromptId.ts`
- `src/core/providers/*`
- `src/core/storage/sqlite/*`
- `src/core/storage/vault/*`
- `src/core/document/loader/*`
- `src/core/document/helper/TagService.ts`
- `src/core/search/*`
- `src/core/types/*`
- `src/service/**/ports/*`
- `src/service/**/*Port.ts`
- `src/service/**/types.ts`
- UI files that import SQLite directly, including `src/ui/view/quick-search/SearchModal.tsx`, `src/ui/view/quick-search/components/VaultSearchResult.tsx`, settings tabs, and copilot panels.

## Confirmed Code Facts

- `src/core` currently has 171 files.
- `src/core/storage` alone has 46 files, and `src/core/document/loader` has 18 files.
- `src/core/storage/sqlite/NativeModuleManager.ts` performs native module lifecycle work: checks Electron/Node ABI, downloads `better-sqlite3` tarballs from GitHub/npm, writes under `{pluginDir}/native`, uses Node `fs/path/zlib`, and reports user-visible notices through ports.
- `src/core/storage/sqlite/SqliteStoreManager.ts` is a global singleton that opens database connections, builds vault file paths, creates storage folders with Node `fs`, wires all repositories, and exposes repo getters.
- `sqliteStoreManager` / `SqliteStoreManager` is referenced from 89 distinct files under `src/app`, `src/service`, and `src/ui`; raw line hits are 418.
- UI imports storage internals directly in at least 9 files, including Quick Search, settings, and copilot panels.
- `src/ui/view/quick-search/components/VaultSearchResult.tsx` constructs `SearchClickRepo` directly from `sqliteStoreManager.getDatabase('vault')`, so click telemetry bypasses a service/action boundary.
- `src/ui/view/quick-search/SearchModal.tsx` imports `sqliteStoreManager`, `ProfileRegistry`, `SearchQueryEvent`, and vault analysis doc parsing in one UI surface.
- `src/core/storage/vault/vault-ops.ts` uses `AppHandle = Record<string, any>` to duck-type `app.vault`; its own comments describe it as a temporary bridge until proper `VaultWriterPort` wiring lands.
- `src/core/ports/AppHandle.ts` is explicitly an escape hatch. It avoids importing Obsidian types, but trades type safety for `Record<string, any>`.
- `src/core/ports` contains several good narrow ports: `DocumentVaultReaderPort`, `VaultMetadataResolverPort`, `VaultWriterPort`, `HttpClientPort`, `NotifierPort`, `HostMetadataPort`, and `AnalysisHistoryPort`.
- Port migration is incomplete: `src/service` still has many pure contract files such as `EditorCommandsPort`, `VaultStatsPort`, `ProgressReporterPort`, `ViewActivationPort`, `VaultPreviewPort`, `AmbientPorts`, navigation ports, lint ports, copilot action ports, vault review ports, quick-search background ports, and many `types.ts` files.
- `src/core/constant.ts` mixes unrelated policy layers: database filenames, indexing/scoring weights, graph traversal limits, search ranking defaults, slice/truncation caps, UI display caps, typewriter timing, visual labels, color/icon metadata, capability-detection regexes, structural analysis thresholds, and `PLAN_MODE_SYSTEM_PROMPT`.
- `src/core/constant.ts` therefore centralizes magic numbers, but it also hides product policy, UI display policy, prompt text, algorithm defaults, and storage constants in one global file.
- `src/core/template/TemplateRegistry.ts` is the registry for template metadata and already points to `templates/prompts`, `templates/tools`, `templates/agents`, `templates/indexing`, `templates/stopwords`, and `templates/config`.
- `TemplateRegistry` also contains UI-facing prompt group labels/order, JSON config template ids, prompt descriptions, system-prompt bindings, JSON constraints, and many product categories.
- `src/core/prompt/PromptId.ts` centralizes prompt ids and variable schemas, which is good for template consistency, but the registry and schema file are becoming very large product maps.
- `src/core/providers/vercel/vercel-adapter.ts` is a concrete Vercel AI SDK adapter with stream timeout policy, SDK message conversion, generated tool-call ids using `Date.now()`/`Math.random()`, and console logging.
- `src/core/providers/ollama/fetchOllamaModels.ts`, rerank providers, and model registry code perform actual network/provider runtime work from under `core`.
- `src/core/document/loader/MarkdownDocumentLoader.ts` does more than load files: it parses markdown, resolves wikilinks, extracts TextRank signals, computes merged keyword tags, calls LLM tag generation, calls LLM summary generation, logs telemetry, assembles chunks, and returns index-ready documents.
- `src/core/document/helper/TagService.ts` owns LLM output schemas, functional tag mapping, context tag validation, doc-type folding, prompt variable assembly, and LLM call orchestration through `PromptId.DocTagGenerateJson`.
- `src/core/document/loader/helper/DocumentLoaderHelpers.ts` owns summary prompt variable assembly, short/full summary mode policy, LLM call parallelism, and logging.

## Main Problems

### 1. `core` Is Not A Pure Core Layer

The current `core` layer mixes:

- pure contracts;
- domain model;
- concrete runtime implementation;
- runtime singletons;
- native module management;
- storage/repository access;
- provider SDK adapters;
- indexing orchestration;
- UI/product constants.

This weakens dependency direction because anything under `core` feels safe to import from anywhere.

### 2. SQLite Is A Global Service Locator

`SqliteStoreManager` is placed under `core`, but its actual role is concrete runtime/storage management. It owns database lifecycle and repository wiring, then exposes getters to app/service/ui. This makes it easy for UI to bypass service boundaries and directly query or mutate storage internals.

The immediate smell is not just the file location; it is the import pattern. UI code should not construct repos or call `sqliteStoreManager.getDatabase()` directly.

### 3. `constant.ts` Has Become A Global Junk Drawer

`constant.ts` contains storage names, algorithm weights, UI caps, graph visualization values, capability regexes, prompt/system-prompt text, and structural analysis thresholds. Centralizing magic numbers helps, but mixing ownership makes it hard to know what can be configured, what is product policy, what is UI-only, and what is algorithmic.

### 4. Port Migration Is Half Complete

`core/ports` has the right idea, but many cross-layer ports still live under `service`. This creates ambiguity:

- some ports are in `core`;
- some ports are in `service`;
- some service code still reaches concrete core storage directly.

The desired rule should be clearer:

- cross-layer contracts go to `core/ports`;
- service-internal types stay with their service;
- concrete adapters/implementations stay outside core.

### 5. Provider Implementations Are Under Core

The provider protocol/types may belong in core, but concrete adapters like Vercel AI SDK streaming, Ollama model fetch, rerank provider clients, timeout policy, and generated tool-call ids are runtime implementation. These are closer to service-level provider adapters than core primitives.

### 6. Document Loaders Are Indexing Runtime, Not Just Core Types

The document loader cluster owns parsing, TextRank, LLM tag generation, LLM summary generation, telemetry logs, chunk creation, and index-ready document shaping. That is meaningful indexing pipeline behavior, not just core data definitions.

### 7. Temporary Host Bridges Are Living In Core

`AppHandle = Record<string, any>` and `core/storage/vault/vault-ops.ts` are reasonable migration bridges, but long term they should not define the core boundary. They preserve host decoupling at the import level while still allowing duck-typed Obsidian behavior to leak through.

### 8. One-File Core Folders And Unclear Names Make Core Harder To Scan

Several `src/core` subfolders are effectively one-file folders:

- `src/core/prompt/PromptId.ts`
- `src/core/po/graph.po.ts` plus `src/core/po/index.ts`
- `src/core/graph/lensGraphTypes.ts`
- `src/core/errors/llm-errors.ts`
- `src/core/embeddings/embedClient.ts`

Owner concern:

- `prompt` does not need to be a directory if it only contains `PromptId.ts`.
- `po` is unclear, and currently only contains graph constants/types.
- `lensGraphTypes.ts` is hard to understand from the folder name.
- `errors/` has only one LLM error file while `src/core/errors.ts` already exists.
- `embeddings/` has only one client file, and that file is not a pure core type.

Confirmed code facts:

- `PromptId.ts` is not prompt content. It contains prompt ids, prompt variable contracts, prompt grouping lists, and prompt info types. The actual prompt text should stay in `templates/prompts`.
- `graph.po.ts` defines canonical graph node/edge type constants such as `GraphNodeType`, `GraphEdgeType`, and graph edge/node group helpers. It is widely used by storage repos, search/indexing, graph inspector tools, ambient adapters, and tests.
- `po` appears to mean a persistent/domain object-style constants package, but the abbreviation is not obvious to readers.
- `lensGraphTypes.ts` is framework-agnostic data for the multi-lens graph feature. It was moved out of UI so service/agent/storage code could produce Lens graph data without importing React/ReactFlow UI types.
- `core/errors.ts` already contains `BusinessError`, `ErrorCode`, and `getErrorMessage`.
- `core/errors/llm-errors.ts` contains LLM-specific error classes and `throwTypedError`, used by SDK message parsing and Copilot UI.
- `core/embeddings/embedClient.ts` is a concrete embedding runtime client. It reads `ProfileRegistry`, materializes profile config, calls `fetch`, reports usage through module-level reporter state, and is used by indexing/vector retrieval. It is not a pure type/contract file.

Preliminary judgement:

The owner intuition is right for the type-like files: do not keep one-file top-level core folders just to preserve a concept name. Prefer a small number of stable, readable buckets.

Good consolidation candidates:

- Move `PromptId.ts` to something like `src/core/types/prompt.ts` or `src/core/prompt-types.ts`.
- Move `graph.po.ts` to `src/core/types/graph.ts` or `src/core/types/graph-po.ts`; avoid the unexplained `po` directory name.
- Move `lensGraphTypes.ts` to `src/core/types/lens-graph.ts`, or merge graph/lens graph contracts into a small `core/types/graph*` group.
- Merge `core/errors/llm-errors.ts` into `src/core/errors.ts`, or create a real `src/core/errors/index.ts` only if multiple error files are justified.

Important exception:

- Do not move `embedClient.ts` into `core/types`. It is runtime/network code. It should move out of `core` toward an existing service boundary such as `src/service/embeddings` or `src/service/search/embeddings`, while keeping any pure embedding request/usage types in `core/types` only if they are shared.

Suggested cleanup shape:

```text
src/core/types/prompt.ts
src/core/types/graph.ts
src/core/types/lens-graph.ts
src/core/errors.ts

src/service/embeddings/embedClient.ts
```

This keeps `core` readable without introducing a new top-level `infra` directory.

## Suggested Boundary Rule

Use this as the target mental model:

Do not create a new top-level `infra/` directory for this cleanup. The goal is fewer clearer boundaries, not another architectural bucket. Prefer the existing app/service/core/ui shape, with coarse subfolders only where the file count and responsibility justify it.

```text
core/types
= pure shared data types and domain primitives

core/ports
= cross-layer contracts only; no singletons, no concrete storage/provider implementation

core/schemas
= zod/json schemas and pure validators

core/types/prompt
= prompt ids and typed prompt variable contracts only; prompt bodies stay in templates/prompts

core/utils
= pure or near-pure helpers; audit anything with timers, global caches, DOM/Node runtime, network, or storage

app/adapters/storage or app/context
= SQLite runtime composition, native module manager wiring, and app-owned storage lifecycle

service/providers or service/llm
= concrete AI/provider SDK adapters and network clients

service/indexing
= document loader orchestration, LLM tag/summary enrichment, TextRank policy, chunk/index shaping

app/adapters
= Obsidian/browser/vault host capability adapters

ui
= React display and interaction; no direct SQLite/repo access
```

## Suggested Priority

1. Stop UI from importing `sqliteStoreManager` and repo classes directly. Replace with service/context actions or read ports.
2. Treat `SqliteStoreManager` as concrete runtime/storage management, not core domain. Plan a move into existing app/service boundaries, or at least add a facade boundary before moving files.
3. Finish port migration consistently: cross-layer ports to `core/ports`; service-internal types stay local.
4. Split `constant.ts` so UI caps, algorithm defaults, storage names, and prompt text have separate owners.
5. Move remaining prompt/system-prompt text from core constants and code into `templates/prompts`.
6. Audit `core/document/loader` and `TagService` as indexing service logic, not just file/model helpers.
7. Audit concrete provider adapters under `core/providers` and separate protocol types from SDK/network implementations.
8. Consolidate one-file core folders (`prompt`, `po`, `graph`, `errors`, `embeddings`) by moving pure contracts into `core/types`, merging errors, and moving embedding runtime code to service.

## Claude Handoff Note

If this is handed to an implementation agent, do not ask it to rename everything at once. The safe order is:

1. Remove direct UI-to-SQLite access through narrow UI-facing services/actions.
2. Introduce or reuse ports/read models for the most common storage needs.
3. Move or facade concrete runtime/storage pieces only after consumers are no longer scattered.
4. Split constants by ownership.
5. Then do directory moves.

The goal is not a prettier folder tree. The goal is dependency direction: UI and app surfaces should not reach into concrete storage/runtime internals just because those internals are under `core`.
