# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run dev              # Run all watchers in parallel (CSS + TypeScript)
npm run build            # Production build (CSS pipeline + esbuild + bundle check)
npm run test             # Run all tests
npm run test -- test/boolean-expression-parser.test.ts  # Run a specific test
```

The test runner (`run-test.js`) compiles `.test.ts` files with esbuild, executes them via Node, and cleans up artifacts.

CSS has a two-stage pipeline: Tailwind builds (`styles.tailwind.css`, `styles.streamdown.css`) are concatenated into the final bundle. Two separate Tailwind configs exist—`tailwind.config.js` (main) and `tailwind.streamdown.config.js` (streaming UI).

esbuild bundles `main.ts` → `main.js` as CommonJS (Obsidian requirement). Target is ES2018. Always minified (Shiki JSON parsing requires it). License comments are stripped to avoid breaking Obsidian's eval.

Path alias: `@/*` maps to `src/*` (configured in both tsconfig.json and esbuild).

## Architecture

Four-layer architecture: `app/` → `service/` → `core/` → `ui/`

- **app/** — Obsidian integration: commands, events, settings UI, view lifecycle, and `AppContext` (DI container passed to all views)
- **core/** — Framework-agnostic abstractions: AI providers, document models/loaders, storage (SQLite + Vault), templates, schemas, utilities
- **service/** — Business logic: chat orchestration, search/indexing, AI agents (ReAct loop), tools, prompt management
- **ui/** — React layer: views (chat, project list, message history, quick search), components (shadcn/ui based), Zustand stores, hooks

**Entry point:** `main.ts` extends Obsidian `Plugin`. On load, it initializes services in order: TemplateManager → AIServiceManager → DocumentLoaderManager → SQLite → SearchService → AppContext → ViewManager → Commands/Events.

**Key services:**
- `AIServiceManager` (`service/chat/service-manager.ts`) — Orchestrates conversations, providers, prompts, user profiles, context building
- `SearchClient` (`service/search/SearchClient.ts`) — Text/vector search via SQLite, AI-assisted analysis, reranking
- `IndexService` (`service/search/index/indexService.ts`) — Singleton for document embeddings, chunking, semantic edges, hub discovery
- `MultiProviderChatService` (`core/providers/MultiProviderChatService.ts`) — Factory pattern supporting Codex, OpenAI, Google, Perplexity, Ollama, OpenRouter

**Storage:** Two SQLite databases (`vault.sqlite` for search/embeddings, `chat.sqlite` for conversations) plus Vault markdown files for chat history/projects.

**State management:** Zustand for global stores (`projectStore`, `uiEventStore`), per-view scoped stores, React Context for service injection.

## Code Conventions

- Use shadcn/ui `Button` component, never raw `<button>` elements
- Avoid semantic HTML tags (`<h1-h6>`, `<p>`) — use `<span>` with Tailwind classes
- Extract components when they exceed ~8 lines
- Prefer simple async functions over `useCallback`; use `store.getState()` inside handlers to avoid dependency arrays
- Eliminate arrow code: use early returns/guard clauses, max nesting depth of 2
- No redundant `else` after `return`/`throw`
- Centralize small cross-cutting constants in `src/core/constant.ts`; do not dump large domain config tables there.
- **Configurability rule**: Never hardcode i18n strings, regex patterns (especially multilingual ones), label maps, color maps, thresholds, weights, timing knobs, or style configs directly in logic files. Preferred source is **`templates/config/`** JSON loaded via TemplateManager. If code needs a compiled fallback, put it in a clearly named domain defaults file (for example `src/service/lint/config/VaultLintDefaults.ts`) that documents which template it mirrors; use `src/core/constant.ts` only for small cross-cutting constants.
- **Runtime ownership rule**: Capability runtimes must be composed and owned at the app layer (`main.ts`, `AppContext`, or an app-owned runtime registry). Do not add service-layer module singletons such as `let currentRuntime = null` + `set/getRuntime`. Do not expand service-side `AppContext.getInstance()` usage as a dependency shortcut; pass runtime/dependencies through app composition, constructors, ports, or RunEnvelope boundaries.
- Templates: register via `TemplateRegistry` / `TemplateId`, load with `TemplateManager`; prompts use `PromptId` + `PromptService`, not scattered prompt strings
- Agents: follow `runAgentLoop` / `AgentLoop` (`service/agents/core`); reuse tool + schema patterns from existing agents; wire through `src/core/schemas/` for Zod
- Streaming: normalize with `src/core/providers/helpers/stream-helper.ts` (`streamTransform`, etc.) and `LLMStreamEvent`; UI streaming hooks live under `ui/view/chat-view/hooks/`

## Codex Collaboration Rules

- For major architecture/refactor guidance, do not make the user shuttle many tiny prompts between Codex and another coding agent. Default to one larger, copyable prompt with an internal execution DAG, independent tracks, dependency order, skip rules, protected scopes, verification, and one final implementation note.
- For large modernization waves, prefer scan-first bulk prompts over preselecting only 2-3 tiny candidates. The prompt should make the coding agent scan multiple candidate pools, build a candidate matrix, execute all safe/medium-safe items in one session, and explain skipped high-risk items with evidence.
- Scan-first is not enough by itself. Any task called a "major wave" must include an Impact Contract before implementation: primary metric target, required tracks, optional tracks, forbidden scope, skip budget, minimum acceptable delta, and stop/commit rule. If the result misses the contract, Codex must label it as minor cleanup or partial progress, not as an accepted major wave.
- Major waves should default to a two-stage audit gate: Claude Code first performs read-only investigation and returns candidate matrix, DAG, risks, exact file plan, and expected metric delta; Codex/user audit that plan; only then should Claude Code implement. Skip this gate only when the handoff explicitly says implementation may start immediately.
- For boundary-retirement waves, at least one high-impact metric must move materially, such as `service -> ui` edges, `service -> app` leaks, old runtime owners, source LOC from truly retired paths, or module-level mutable runtime bindings. Build/test pass alone is not enough to claim a large modernization step.
- For code-volume reduction waves, preserve user-facing functionality by default. Do not remove a major feature merely to hit a LOC target. Reduce size through duplicate-code removal, modularity, shared abstractions, reusable UI primitives, design-pattern consolidation, compatibility-path retirement, debug-code extraction, and duplicate entry/surface consolidation. Feature deletion requires explicit owner approval and must be called out as a product decision, not a refactor.
- Use micro-prompts only when the change is genuinely high-risk, blocked on a user decision, or the user explicitly asks for small steps. Otherwise, make the coding agent analyze dependencies and complete all safe work from one prompt.
- Codex should still preserve owner control: explain the big wave in Chinese, include diagrams/code-reading guidance, and make skipped tracks explicit. The goal is fewer user round trips without returning to vibe coding.

## Design Documentation & UX Flow Reports

- When creating UX flow reports, product evolution reports, or flow diagrams for this project, prefer image-first visual flows over text-heavy tables.
- Use real screen thumbnails or generated mock images as the flow nodes, connected with arrows. Text should be short captions, not long prose blocks.
- For complete flows, split branches into visual lanes such as `user trigger -> entry/intent -> agent run -> review surface -> outcome`.
- Include all important branches while keeping each lane readable. For Copilot / Command Center work, cover Document Auto, manual write intents, insight/no-change flows, Vault Intelligence, and Setting/System.
- If a report starts looking like a prose matrix, redesign it into visual screen-node lanes before considering it done.

## Key External Dependencies

- **AI:** Vercel AI SDK adapters (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, etc.)
- **Database:** better-sqlite3 + sqlite-vec + kysely (query builder)
- **Document processing:** pdf-parse, mammoth, officeparser, playwright
- **Search:** @langchain/textsplitters for chunking
- **UI:** React 18, Radix UI primitives, @xyflow/react (graph viz), framer-motion, shiki (syntax highlighting), mermaid
