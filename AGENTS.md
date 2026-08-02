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

**Storage:** Current production uses two SQLite databases (`vault.sqlite` for search/embeddings, `chat.sqlite` for conversations) plus mixed Vault Markdown/JSON/JSONL outputs. The target governance keeps user-owned or explicitly materialized artifacts in Markdown/native formats, stores expensive machine facts in JSON/partitioned JSONL, and treats SQLite, full-text indexes, embeddings, caches, and telemetry as local rebuildable state. Before adding or changing any persistent writer, consult the canonical [`generated-artifact-registry.md`](./docs/conventions/generated-artifact-registry.md) and the phased [`2026-08-02 implementation design`](./docs/superpowers/specs/2026-08-02-generated-artifact-storage-governance-implementation-design.md); the older [`2026-07-21 JSONL design`](./docs/superpowers/specs/2026-07-21-machine-record-storage-jsonl-design.md) remains background.

**State management:** Zustand for global stores (`projectStore`, `uiEventStore`), per-view scoped stores, React Context for service injection.

## Code Conventions

- Use shadcn/ui `Button` component, never raw `<button>` elements
- **Obsidian button geometry rule**: `.peak-design-root button` resets
  `height: auto`, `min-height: 0`, and `max-height: none` with `!important`.
  Therefore any shared/button primitive that promises a fixed hit target must
  declare its effective `width`/`height`/`min-*`/`max-*` dimensions with
  `!important`; padding in that fixed-size rule must also use `!important`.
  Do not accept source inspection or a green build as proof that the size
  rendered. Add the selector to
  `test/shared-button-reset-defense.test.ts` when introducing a new public
  button primitive, and verify computed geometry in real Obsidian through CDP
  when available. See `docs/conventions/ui-design.md` §4.3.1.
- Avoid semantic HTML tags (`<h1-h6>`, `<p>`) — use `<span>` with Tailwind classes
- Extract components when they exceed ~8 lines
- Prefer simple async functions over `useCallback`; use `store.getState()` inside handlers to avoid dependency arrays
- Eliminate arrow code: use early returns/guard clauses, max nesting depth of 2
- No redundant `else` after `return`/`throw`
- Centralize small cross-cutting constants in `src/core/constant.ts`; do not dump large domain config tables there.
- **Configurability rule**: Never hardcode i18n strings, regex patterns (especially multilingual ones), label maps, color maps, thresholds, weights, timing knobs, or style configs directly in logic files. Preferred source is **`templates/config/`** JSON loaded via TemplateManager. If code needs a compiled fallback, put it in a clearly named domain defaults file (for example `src/service/lint/config/VaultLintDefaults.ts`) that documents which template it mirrors; use `src/core/constant.ts` only for small cross-cutting constants.
- **Runtime ownership rule**: Capability runtimes must be composed and owned at the app layer (`main.ts`, `AppContext`, or an app-owned runtime registry). Do not add service-layer module singletons such as `let currentRuntime = null` + `set/getRuntime`. Do not expand service-side `AppContext.getInstance()` usage as a dependency shortcut; pass runtime/dependencies through app composition, constructors, ports, or RunEnvelope boundaries.
- **Command Palette governance**: Only stable, owner-approved global entry points may ship in Obsidian's Command Palette. Feature-local, Work Intelligence, maintenance, debug, QA, and experimental actions must stay on their owning surfaces; temporary commands require an explicit non-production gate and removal condition. Follow [`docs/conventions/command-palette-governance.md`](./docs/conventions/command-palette-governance.md).
- **Composer inline formatting**: Keep pure Markdown formatting as Markdown. Once an overlapping style stack enters the HTML domain, serialize all visual marks as canonical HTML; never nest Markdown delimiters inside raw HTML or erase wikilink/code/formula semantics. Follow [`docs/conventions/composer-inline-format-serialization.md`](./docs/conventions/composer-inline-format-serialization.md).
- **Generated artifact governance**: Every persistent writer must have a registered output ID, canonical carrier, sync policy, Peak knowledge-index policy, and materialization rule. Markdown/native files are for user-owned or explicit outputs; durable JSON/JSONL syncs, while SQLite/index/cache/telemetry stays local. Follow [`docs/conventions/generated-artifact-registry.md`](./docs/conventions/generated-artifact-registry.md).
- Templates: register via `TemplateRegistry` / `TemplateId`, load with `TemplateManager`; prompts use `PromptId` + `PromptService`, not scattered prompt strings
- Agents: follow `runAgentLoop` / `AgentLoop` (`service/agents/core`); reuse tool + schema patterns from existing agents; wire through `src/core/schemas/` for Zod
- Streaming: normalize with `src/core/providers/helpers/stream-helper.ts` (`streamTransform`, etc.) and `LLMStreamEvent`; UI streaming hooks live under `ui/view/chat-view/hooks/`

## Codex Collaboration Rules

- **Commit ownership is the default delivery contract.** After an implementation task passes its relevant verification, the agent must commit only the changes it created for that task and report the commit SHA. Record the starting `git status`; never use a broad `git add -A` when pre-existing or parallel changes are present, and never include runtime data or ignored artifacts. A worktree/subagent must commit its owned branch before handoff. If the task diff cannot be separated safely, stop and report the overlap instead of mixing ownership. Do not push, rebase, or commit someone else's changes unless the owner explicitly requests it. An explicit task instruction not to commit overrides this default.
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

## Obsidian Debugging & Real-UI QA

The canonical maintainer protocol is [`docs/conventions/obsidian-real-ui-qa.md`](./docs/conventions/obsidian-real-ui-qa.md). Use two channels with explicit ownership. Do not spend time guessing UI state from screenshots or repeated coordinate clicks.

### Channel ownership

- **Obsidian CDP + Playwright** owns precise state setup, DOM inspection, scroll anchoring, focus, clicks, keyboard flows, geometry, and runtime evidence.
- **Computer Use** owns proof that the visible result came from the real Obsidian app, plus human-visible screenshots and interactions that need OS-level observation.
- **Harness / static mock** owns fast characterization and design-reference rendering only. It never counts as real-Obsidian acceptance.
- When CDP is available, do not use Computer Use coordinate clicks to find or close internal Composer controls. Obsidian exposes little useful accessibility structure, so coordinate recovery is slow and fragile.
- Computer Use is not a fallback controller when CDP is unavailable. Do not use AX element indexes, guessed shortcuts, Command Palette reload attempts, Settings toggles, or repeated coordinate clicks to recover internal Composer state.
- If the tool reports that the user changed Obsidian state, stop immediately and yield control. Do not reclaim focus or continue the previous automation chain.

### Connect to the running Obsidian renderer

Discover the current loopback debugging port instead of hard-coding it:

```bash
lsof -nP -iTCP -sTCP:LISTEN | rg '^Obsidian'
```

The port is often `9223` in this workspace, but it may change. Connect Playwright to that port, then select the real Obsidian page:

```js
const { chromium } = await import('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:<port>');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url() === 'app://obsidian.md/index.html');
```

Use `page.locator(...)`, DOM attributes, computed styles, bounding boxes, and the real scroll containers to establish and verify state. Close transient panels through their real DOM controls, move the pointer away before a resting-state capture, and re-read state after every material interaction.

If no CDP listener exists, use an already-open Obsidian DevTools Console only for one deterministic plugin reload/open command described in the canonical protocol. If CDP still cannot be established, keep source/test/build evidence, mark the exact interaction `INTERACTION NOT VERIFIED`, and stop. Never replace hover, drag, focus, or keyboard verification with click-only Computer Use evidence.

### Fast build → reload → verify loop

Do not restart Obsidian manually after every code change. After a successful build, reload only this plugin through the running renderer:

```js
await page.evaluate(async () => {
  const pluginId = 'obsidian-peak-assistant';
  await app.plugins.disablePlugin(pluginId);
  await app.plugins.enablePlugin(pluginId);
});
await page.waitForFunction(() =>
  Boolean(
    app.commands.commands[
      'obsidian-peak-assistant:peak-open-document-composer'
    ],
  ),
);
```

Plugin reload may remove the existing Composer leaf. Re-select the canonical Markdown tab and open Composer through the stable command id:

```js
await page.locator(
  '.workspace-tab-header[data-type="markdown"][aria-label="Peak Composer Visual Parity QA"]',
).click();
await page.evaluate(() =>
  app.commands.executeCommandById(
    'obsidian-peak-assistant:peak-open-document-composer',
  ),
);
await page.locator('.peak-composer-root').waitFor({ state: 'visible' });
```

Then verify the production DOM before taking a screenshot: expected block kind, real resource URI, natural bitmap size, source SHA, and the active Composer leaf. This is the default tight loop for isolated UI fixes:

```text
focused test → production build → plugin-only reload → CDP DOM assertion
→ Computer Use screenshot → normalized overlay/diff
```

If an interaction unexpectedly switches to a Markdown leaf, do not recover with coordinate clicking or assume the control merely closed. Inspect the active tab type, record the behavior as evidence when it is the bug under test, then return through the stable `data-type` selector.

For ordinary plugin QA, never guess `Cmd+R`, open Settings to toggle community plugins, or run `Reload app without saving`. Full renderer reload is reserved for a confirmed renderer-level problem with an explicit impact and recovery plan.

### Interaction evidence contract

- A click-pinned menu does not prove hover behavior.
- A final screenshot does not prove a pointer corridor, focus restoration, Escape handling, or an Undo/Redo/History sequence.
- Hover and pointer-corridor claims require a real pointer path with the final DOM still visible.
- Keyboard and focus claims require `activeElement` and state assertions before and after the real key flow.
- If the available tool cannot perform the claimed interaction, report `NOT VERIFIED` or `OWNER-CONFIRMED`; never upgrade it to automated acceptance.

### Screenshot economy and bisection debugging

Treat screenshots as final visual evidence, not a click-by-click activity log. For a known path (for example: open Command Palette → enter a command → open Composer → trigger an AI action), execute the deterministic setup continuously and capture only once the intended final state is reached. Do not take a screenshot merely because a menu opened, a query was typed, or a normal navigation click succeeded.

If the final state is wrong, missing, or visually unstable, then use bisection: replay the same path, inspect the midpoint state, and keep halving the uncertain portion until the first divergent transition is identified. Use CDP/DOM/accessibility reads for cheap state checks between steps; introduce intermediate screenshots only when text/DOM evidence cannot explain the divergence. Continue to capture the required reference/current/normalized comparison set for a real visual-parity claim, and use video for the interaction classes listed below.

### Lock evidence before changing code

For every design comparison or interaction regression, create one run directory and record:

- canonical Vault file path and SHA-256;
- attachment/native-file paths;
- Obsidian theme and app zoom;
- `innerWidth`, `innerHeight`, and `devicePixelRatio` from the real renderer;
- native sidebar state;
- document scroll container and exact `scrollTop` or named anchor;
- Composer display state, focused/selected block, open transient surface, sidecar tab/stage, and data revision when available;
- capture time and SHA-256 of reference/current/overlay artifacts.

Save a byte-identical source snapshot beside the evidence. If the source SHA or interaction state differs, the screenshots are not comparable.

Computer Use screenshots may be downsampled even when the real Electron renderer is `1728x1084` at DPR 2. Read CSS viewport/DPR from CDP, record the original screenshot dimensions, and normalize before overlay/diff. Never treat Computer Use bitmap dimensions as the CSS viewport.

The minimum visual set is:

```text
reference + real current + normalized current + 50% overlay or pixel diff + manifest
```

Use the same document, viewport, theme, zoom, scroll anchor, sidecar stage, and interaction state. Native Obsidian chrome differences must be identified explicitly rather than mistaken for Composer drift.

### When to record video

Use a short local screen recording when a still image cannot prove the behavior:

- Chinese IME composition and submit guards;
- forward/reverse cross-block selection;
- drag, autoscroll, table hover corridor, or resize gestures;
- AI first-token, stable-prefix streaming, stop, regenerate, and variant switching;
- narrow drawer focus trap, Escape, close/reopen, and focus restoration;
- Undo/Redo/History sequences where intermediate state matters.

Record one flow per clip, keep it short, and store it under the run evidence directory, for example `.dev/harness/shots/<run>/recordings/`. Start each clip from a manifest-locked state and pair it with final-state screenshots and source-byte evidence. Do not record unrelated tabs, credentials, or private Vault content outside the canonical QA fixture.

### Stop rule

If the real app cannot be placed in the same source revision, viewport, scroll anchor, and interaction state as the reference, stop and label the comparison `NOT COMPARABLE`. Fix the evidence setup before editing CSS or product code. A green harness, geometry test, or visually similar screenshot is never sufficient by itself.

## Key External Dependencies

- **AI:** Vercel AI SDK adapters (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, etc.)
- **Database:** better-sqlite3 + sqlite-vec + kysely (query builder)
- **Document processing:** pdf-parse, mammoth, officeparser, playwright
- **Search:** @langchain/textsplitters for chunking
- **UI:** React 18, Radix UI primitives, @xyflow/react (graph viz), framer-motion, shiki (syntax highlighting), mermaid
