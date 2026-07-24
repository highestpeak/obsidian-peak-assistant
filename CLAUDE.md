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

**Storage:** Current production uses two SQLite databases (`vault.sqlite` for search/embeddings, `chat.sqlite` for conversations) plus Vault markdown files for chat history/projects. The accepted, not-yet-implemented persistence redesign moves machine run records to JSONL streams, keeps SQLite as rebuildable read models, and reserves Markdown for user documents/explicit exports; see [`2026-07-21-machine-record-storage-jsonl-design.md`](./docs/superpowers/specs/2026-07-21-machine-record-storage-jsonl-design.md).

**State management:** Zustand for global stores (`projectStore`, `uiEventStore`), per-view scoped stores, React Context for service injection.

## Code Conventions

- CTA buttons go through the `<Button>` primitive (see Project Rules → primitive-usage), never raw `<button>` elements
- Avoid semantic HTML tags (`<h1-h6>`, `<p>`) — use `<span>` with Tailwind classes
- Extract components when they exceed ~8 lines
- Prefer simple async functions over `useCallback`; use `store.getState()` inside handlers to avoid dependency arrays
- Eliminate arrow code: use early returns/guard clauses, max nesting depth of 2
- No redundant `else` after `return`/`throw`
- Centralize small cross-cutting constants in `src/core/constant.ts`; do not dump large domain config tables there.
- Runtime ownership: capability runtimes must be composed and owned at the app layer (`main.ts`, `AppContext`, or an app-owned runtime registry). Do not add service-layer module singletons such as `let currentRuntime = null` + `set/getRuntime`. Do not expand service-side `AppContext.getInstance()` usage as a dependency shortcut; pass runtime/dependencies through app composition, constructors, ports, or RunEnvelope boundaries.
- Templates: register via `TemplateRegistry` / `TemplateId`, load with `TemplateManager`; prompts use `PromptId` + `PromptService`, not scattered prompt strings
- Agents: follow `runAgentLoop` / `AgentLoop` (`service/agents/core`); reuse tool + schema patterns from existing agents; wire through `src/core/schemas/` for Zod
- Streaming: normalize with `src/core/providers/helpers/stream-helper.ts` (`streamTransform`, etc.) and `LLMStreamEvent`; UI streaming hooks live under `ui/view/chat-view/hooks/`
- Repo hygiene: never create scaffolding / preview harnesses / screenshot dirs in the project root. All dev-only tooling goes under `.dev/` (gitignored, not shipped — e.g. `.dev/harness/` for the File Atlas browser preview). One-off temp artifacts (frame grabs, throwaway HTML/scripts) go to the agent scratchpad, never the project. See `.dev/README.md`.

## Project Rules

Detailed conventions live in `docs/conventions/`. Read `docs/conventions/README.md` for the index and how to add new rules. Each pointer below is intentionally one line — open the linked file for the rule itself.

- **UI design system** — tokens, primitive catalog, primitive usage decisions, Obsidian CSS defense, JSX-mock fidelity. One file, 5 sections, section-anchored. [`ui-design.md`](./docs/conventions/ui-design.md)
- **Prompt input consistency** — Chat Studio、Composer sidecar 与未来输入面共享 PromptInput 内核、trigger/keyboard grammar 和单层 focus owner；各自 runtime/state 保持隔离。[`prompt-input-consistency.md`](./docs/conventions/prompt-input-consistency.md)
- **Command Palette governance** — 生产 Palette 只允许 owner 明确批准的稳定全局入口；feature-local、Work Intelligence、maintenance、debug、QA、实验性和临时动作必须留在所属 surface，并由精确 allowlist 测试防回流。[`command-palette-governance.md`](./docs/conventions/command-palette-governance.md)
- **Configurability** — no inline i18n / regex / label maps / color, thresholds, weights, timing knobs, or style configs; route through `templates/config/` plus a documented domain fallback when needed. [`configurability.md`](./docs/conventions/configurability.md)
- **Root docs** — final-state `docs/*.html` manuals, not work logs; status language, dense tables, long paths, Mermaid, formulas, and viewport QA rules. [`root-docs.md`](./docs/conventions/root-docs.md)
- **Spec + tests one doc** — spec 与 acceptance criteria / test 文件清单 / bad-case 复现写在同一份 `docs/superpowers/specs/*.md`，不拆到 `test-plan.md` / `qa.md`。[`spec-and-tests.md`](./docs/conventions/spec-and-tests.md)

## Docs & Research Workflow

三个文件承担不同职责，不要混用：

| 文件 | 职责 | 写入时机 |
|---|---|---|
| [`docs/index.html`](./docs/index.html) | 根目录**文档索引**（哪份 HTML 存在、待写、归档） | 新增/挪动根目录文档时 |
| [`docs/roadmap.html`](./docs/roadmap.html) | **产品状态快照**：已完成关键里程碑 + 已决策待建 + 调研候选 + 远期 backlog | 关键节点 shipped、新 spec、新调研、新 backlog 想法时 |
| [`docs/progress.md`](./docs/progress.md) | **历史流水账**：逐 session / Phase 追加日志 | 每次 session end |

三条硬规则：

- **调研必须落库到 `docs/research/`。** 任何"调研 / 竞品分析 / 学术梳理 / 第一性原理拆解"类产出，写到 `docs/research/YYYY-MM-DD-slug/README.md`（复杂主题可拆成 `01-*.md`、`02-*.md`，参照 `2026-05-24-agent-harness/`）。不要把结论只留对话里，也不要写进 feature 页。
- **潜在功能登记到 `docs/roadmap.html`。** 调研完成后在 `#researching` 段补一行；新 spec 落地在 `#decided` 段补一行；backlog 想法在 `#backlog` 段补一行。**不要**再往 `index.html` 加"潜在功能"表——那里只装文档索引。
- **只登记关键节点。** `roadmap.html` 是"读者一屏看战线"的看板，不复制 `progress.md` 的每 Phase 粒度。判定标准：能一句话向新读者解释"我们做了什么、他能感知到什么"的才上。逐 session 的 UI 微调、bug 修复、局部 refactor 留在 `progress.md` 就够。

状态迁移：**Backlog → 调研候选**需要一份 `docs/research/` 报告；**调研候选 → 已决策**需要一份 `docs/superpowers/specs/` spec；**已决策 → shipped** 需要 `progress.md` 对应 Phase 完成条目 + `roadmap.html` 迁移到 Done 段。

## Key External Dependencies

- **AI:** Vercel AI SDK adapters (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, etc.)
- **Database:** better-sqlite3 + sqlite-vec + kysely (query builder)
- **Document processing:** pdf-parse, mammoth, officeparser, playwright
- **Search:** @langchain/textsplitters for chunking
- **UI:** React 18, Radix UI primitives, @xyflow/react (graph viz), framer-motion, shiki (syntax highlighting), mermaid
