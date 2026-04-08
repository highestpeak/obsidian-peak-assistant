# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `MultiProviderChatService` (`core/providers/MultiProviderChatService.ts`) — Factory pattern supporting Claude, OpenAI, Google, Perplexity, Ollama, OpenRouter

**Storage:** Two SQLite databases (`vault.sqlite` for search/embeddings, `chat.sqlite` for conversations) plus Vault markdown files for chat history/projects.

**State management:** Zustand for global stores (`projectStore`, `uiEventStore`), per-view scoped stores, React Context for service injection.

## Code Conventions

- Use shadcn/ui `Button` component, never raw `<button>` elements
- Avoid semantic HTML tags (`<h1-h6>`, `<p>`) — use `<span>` with Tailwind classes
- Extract components when they exceed ~8 lines
- Prefer simple async functions over `useCallback`; use `store.getState()` inside handlers to avoid dependency arrays
- Eliminate arrow code: use early returns/guard clauses, max nesting depth of 2
- No redundant `else` after `return`/`throw`
- Centralize constants in `src/core/constant.ts`
- Avoid passing objects like AppContext as function parameters when they can be accessed via a static getInstance() method; instead, directly use AppContext.getInstance() where needed.
- Templates: register via `TemplateRegistry` / `TemplateId`, load with `TemplateManager`; prompts use `PromptId` + `PromptService`, not scattered prompt strings
- Agents: follow `runAgentLoop` / `AgentLoop` (`service/agents/core`); reuse tool + schema patterns from existing agents; wire through `src/core/schemas/` for Zod
- Streaming: normalize with `src/core/providers/helpers/stream-helper.ts` (`streamTransform`, etc.) and `LLMStreamEvent`; UI streaming hooks live under `ui/view/chat-view/hooks/`

## Key External Dependencies

- **AI:** Vercel AI SDK adapters (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, etc.)
- **Database:** better-sqlite3 + sqlite-vec + kysely (query builder)
- **Document processing:** pdf-parse, mammoth, officeparser, playwright
- **Search:** @langchain/textsplitters for chunking
- **UI:** React 18, Radix UI primitives, @xyflow/react (graph viz), framer-motion, shiki (syntax highlighting), mermaid
