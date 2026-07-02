# Peak Assistant — Task Board

> **Last updated**: 2026-04-12
> **Open issues**: 89 → triage target ~56 after cleanup

---

## Project State

```
[DONE] V2 Vault Search Agent SDK Migration (15/16)
[DONE] V2 Search UI (step cards, streaming report)
  ↓
[NEXT] Provider System v2 — delete Vercel AI SDK, unify to Agent SDK query()
  ↓
[THEN] Agent Trace Observability (gated on v2)
  ↓
[THEN] Feature work by phase
```

---

## 1. GitHub Triage: Close as Done

These 22 issues already have working implementations in the codebase. Close with a comment citing the evidence.

| # | Title | Evidence |
|---|-------|---------|
| #3 | Viewmode switch bug | `chatViewStore.ts` — ViewMode enum + typed actions, fully refactored |
| #4 | Thinking/reasoning UI | `ui/component/ai-elements/reasoning.tsx` — collapsible reasoning with streaming, duration |
| #5 | Note to chat | `useOpenInChat.ts` — sends search results/sources to chat |
| #6 | Web search | `service/tools/search-web.ts` — `localWebSearchTool` (Playwright) + `perplexityWebSearchTool` |
| #7 | Add context to input area | `ChatInputArea.tsx` — `@`/`[[]]` triggers with `handleSearchContext` |
| #8 | Cmd+P quick conv create | `Register.ts:106` — `peak-chat-new-conversation` command registered |
| #9 | Conv topic suggestion | `service-conversation.ts:476` — `generateConversationTitle()` + auto-trigger |
| #16 | More providers | 6 providers: OpenAI, Claude, Gemini, Ollama, OpenRouter, Perplexity |
| #19 | URL fetch context | `UrlDocumentLoader` + `ResourceKindDetector` auto-detects `https?://` |
| #25 | Image/PDF direct send | `ContextBuilder.ts:253` — vision→base64, PDF→direct; `PromptInputAttachments.tsx` |
| #27 | User profile context | `UserProfileService` + `BuildUserProfileRunner` + command in `Register.ts:441` |
| #28 | Organize logs | `LogMetricRegister.ts` + `ActivityService.ts` + `DailyStatisticsService.ts` |
| #35 | Auto detect info & remember | `UserProfileService` auto-extracts from conversations + `searchMemoryStoreTool` |
| #61 | Web search for AI analysis | Same as #6 — `searchWeb` tool available to agents |
| #62 | Model change not applying | `useChatSession.ts:119` subscribes reactively, calls `updateConversationModel()` |
| #64 | Doc ID too long | `id-utils.ts:34` — `generateDocIdFromPath()` returns stable 32-char MD5 UUID |
| #65 | Remove stopwords | `stopword-utils.ts` + templates `stopwords/{common,en,zh}.md` + integrated in TextRank |
| #71 | Voice input | `PromptInputSubmit.tsx:8-78` — SpeechRecognition API, mic toggle, transcript append |
| #78 | Separate search/meta DB | `SqliteStoreManager.ts:52` — `vault.sqlite` (search) + `chat.sqlite` (meta) |
| #84 | Search highlight lost | `highlight-builder.ts:205` — position offset adjustment relative to snippet start |
| #85 | AI Analysis graph intelligence | `KnowledgeGraphSection.tsx` + `TopicGraphPopover.tsx` render graph data |
| #87 | Cache fields in graphNodeRepo | `MobiusNodeRepo.ts` has `doc_outgoing_cnt` cache field; docMetaRepo already removed |

### Close as Duplicate (after merge)

| Close | Merge into | Reason |
|-------|-----------|--------|
| #75 | #77 | Both address Obsidian/Tailwind style boundary |
| #10 | #17 | Both address prompt suggestion UX |
| #37 | #42 | Format correction ⊂ one-click polish |
| #84 | #60 | Highlight loss is a sub-bug of search UI bugs |
| #11 | #57 | Project template ⊂ work focus mode |
| #69 | — | Convert to epic, close as standalone; children: #66 + #51 |

### Close as Won't Fix / Outdated

| # | Title | Reason |
|---|-------|--------|
| #61 | Web search for AI analysis | Duplicate of #6 (same tools serve both) |

**Net: close 22 done + 6 merge + 1 won't-fix = 29 removals → ~60 remaining**

---

## 2. GitHub Triage: Narrow Scope

These issues have partial implementations. Update the issue description to reflect what's done and what remains.

| # | Title | Done | Remaining |
|---|-------|------|-----------|
| #2 | More message status | `ChainOfThought` component, reasoning UI | Formal `MessageStatus` enum (queued/cancelled/timeout), lifecycle tracking |
| #12 | Context prompt auto rewrite | `PromptRewriteWithLibrary` + `PromptQualityEvalJson` templates | Auto-trigger in chat flow, UI button to invoke |
| #14 | Message branch/regenerate | Last-message regen works (`MessageViewItem.tsx:579`) | Fork from arbitrary message point (branching) |
| #15 | Multi model call | Per-prompt model routing in settings | Ensemble/parallel fan-out with voting |
| #17 | Prompt suggestion (absorbs #10) | `handleSearchPrompts` works | Fast cycling UI, ranking quality, trigger improvements |
| #20 | File hash duplicate | `hash-utils.ts` MD5/SHA256, processed hash tracking | Vault-wide dedup scan/report |
| #24 | Document type loader test | Parsing tests exist for chat/search docs | Loader-specific tests: PDF, DOCX, Image, Excalidraw |
| #29 | Rewrite all prompts | Rewrite infra + templates exist | Actual quality audit pass on all prompt templates |
| #30 | Batch operate files | Batch processing via indexing pipeline | Dedicated batch-tag/categorize UI |
| #31 | Extract todos from vault | TODO extraction in `DailyStatisticsService` git diffs | Vault-wide task extraction command |
| #36 | Large doc split | Chunking for indexing exists | User-facing "suggest how to split this doc" |
| #38 | Suggest in/out links | Semantic edges in index graph | User-facing link suggestion panel/command |
| #44 | Find tasks from vault | Vault search agent can answer task queries | Dedicated task finder command |
| #47 | Daily/weekly summarize | `DailyStatisticsService` with git-diff stats | Weekly/monthly aggregation, AI-driven summaries |
| #49 | Content sync maintain | Vault indexing pipeline (incremental sync) | Cross-device sync, external storage |
| #51 | Image tools (DrawIO/Excalidraw) | `ExcalidrawDocumentLoader` reads files | AI-assisted drawing generation, DrawIO support |
| #58 | Separate obsidian dependency | `src/desktop/` mock env functional | Expand mocks beyond service-manager level |
| #67 | Recent search memory cache | Agent-side `searchMemoryStoreTool` | User-facing in-memory recent search cache for UI |
| #68 | Refactor views | Store/hook/view separation started | Complete separation in remaining large components |
| #72 | Refactor ChatInputArea | Modularized into sub-components | Still 454 lines of orchestration logic |
| #73 | Conversation modes | `chat`/`plan`/`agent` enum in UI | Backend branching per mode, graphics/workflow modes |
| #74 | File type icons | `getFileIcon()` utility in `file-utils.tsx` | Unified `<FileIcon>` component, more file types |
| #76 | Save graph view | Clipboard export (Markdown/Mermaid/JSON) | Persistent save to vault file + restore |
| #77 | Style isolation (absorbs #75) | `pktw-` prefix, shadow DOM for Streamdown | Obsidian CSS reset, Tailwind colors → CSS vars |
| #79 | Menu popover position | Position calc exists with `// todo` comment | Better algorithm per the TODO |
| #83 | Manual chatbot topics | Topic add UI for AI analysis results | Per-conversation system prompt / topic setting |
| #90 | Search score & highlight | Reranker + highlight-builder done | "Open result in new tab" behavior |
| #91 | Quick Search modes | `inFolder` scope backend exists | UI mode picker for folder/heading/@context |

---

## 3. GitHub Triage: Rename Merged Issues

| # | New Title |
|---|----------|
| #77 | Style isolation: Tailwind/Obsidian boundary + system theme vars (absorbs #75) |
| #17 | Prompt suggestion UX: fast switching + smarter autocomplete (absorbs #10) |
| #42 | One-click document polish & format correction (absorbs #37) |
| #60 | Search UI bugs incl. highlight regressions (absorbs #84) |
| #57 | Project-scoped context: work focus mode + per-project templates (absorbs #11) |

---

## 4. Remaining Work by Phase

After triage: ~60 issues organized into execution phases.

### Phase 0: Pre-Refactor Cleanup

- [ ] Delete `spikeAgentSdk.ts`
- [ ] Execute all GitHub triage actions above
- [ ] Archive stale docs → `docs/archive/`:
  - `SQLite Storage Implementation.md` (wa-sqlite abandoned)
  - `PROMPT_INJECTION_POINTS.md` (MindFlowAgent era, code deleted)
  - `HEAP_RETAINERS_MAIN_JS.md` (old build line numbers)
  - `RESEARCH_WORKFLOW_ENGINEERING.md` (MindFlowAgent + FinalRefine stale)
- [ ] Update stale docs:
  - `DEVTOOLS_GUIDE.md` — add `window.indexDocument`, `window.cleanupGraphTable`
  - `quick-search-ui-design.md` — `aiAnalysisStore` → `searchSessionStore`
  - `AI_ANALYSIS_ARCHITECTURE_AND_PROMPTS.md` — note V2 Agent SDK pipeline
- [ ] Mark completed plans (add "COMPLETED" header):
  - `plans/2026-04-08-ai-search-ui-step-based-refactor.md`
  - `plans/2026-04-12-vault-search-agent-sdk-migration.md`
  - `plans/2026-04-12-v2-search-ui.md`

---

### Phase 1: Provider System v2

**Spec**: `specs/2026-04-11-provider-system-v2-design.md`
**Delta**: -5000~7000 lines / +1500~2000 lines

| Task | Scope |
|------|-------|
| Profile Registry | `src/service/profile/` — single config surface |
| Profile materialization | → Agent SDK env vars → subprocess IPC |
| Chat migration | `streamText`/`generateText` → `query()` |
| Skill migration | Rewrite for Agent SDK |
| Structured extraction | `streamObject`/`generateObject` → `query()` + tools |
| Document agents | Tag inference, title gen, summary → `query()` |
| Embedding utility | ~50 lines, OpenAI-format `/v1/embeddings` |
| MCP unification | Agent SDK built-in MCP client only |
| Delete old code | `core/providers/adapter/`, `core/providers/base/`, `@ai-sdk/*`, `AgentLoop.ts` |
| Desktop-only flag | `isDesktopOnly` in manifest.json |
| Usage tracking | Unify `usage_log` table |
| Settings UI | Profile-based config |

**Absorbs**: #70 (auto model select), #15 (multi model call)

---

### Phase 2: Agent Trace Observability

**Spec**: `specs/2026-04-12-agent-trace-observability-design.md`
**Blocked by**: Phase 1

| Task | Scope |
|------|-------|
| Trace sink | Attach to `SDKMessage` stream |
| JSONL output | `*.meta.jsonl` + `*.full.jsonl` |
| CLI harness | `scripts/run-agent.ts` |
| Fixture vault | `test/fixtures/vault/` |
| Scenarios | 5 named vault search scenarios |
| Calibration cmd | Obsidian command for real-vault |

---

### Phase 3: UI/Theme Foundation

Fix the style system before building more UI features.

| # | Title | Status | Pri |
|---|-------|--------|-----|
| #92 | Dark theme support | NOT STARTED | HIGH |
| #77 | Style isolation + system theme (absorbs #75) | PARTIAL | HIGH |
| #56 | Theme configuration (user settings) | NOT STARTED | MED |
| #74 | Unified `<FileIcon>` component | PARTIAL | MED |

---

### Phase 4: Search & Analysis

| # | Title | Status | Pri |
|---|-------|--------|-----|
| #90 | Search score + "open in new tab" | PARTIAL | HIGH |
| #60 | Search UI bugs (absorbs #84) | OPEN | HIGH |
| #67 | Recent search in-memory cache for UI | PARTIAL | MED |
| #91 | Quick Search modes (folder, heading, @) | PARTIAL | MED |
| #89 | Smart connection via graph inspector | NOT STARTED | LOW |

---

### Phase 5: Chat System

| # | Title | Status | Pri |
|---|-------|--------|-----|
| #93 | Delete button for conversation tabs | NOT STARTED | HIGH |
| #72 | Refactor ChatInputArea orchestration | PARTIAL | HIGH |
| #68 | Refactor views — complete UI/data separation | PARTIAL | HIGH |
| #83 | Manual per-conversation topics/system prompt | PARTIAL | MED |
| #73 | Conversation modes backend (plan/agent affect LLM path) | PARTIAL | MED |
| #57 | Work focus mode + project templates (absorbs #11) | NOT STARTED | MED |
| #81 | ChatInput ctrl+arrow shortcut | NOT STARTED | MED |
| #17 | Prompt suggestion UX (absorbs #10) | PARTIAL | LOW |
| #14 | Message branching (fork from any point) | PARTIAL | LOW |
| #2 | Message lifecycle statuses | PARTIAL | LOW |
| #21 | Suggest conv → project | NOT STARTED | LOW |

---

### Phase 6: Infrastructure

| # | Title | Status | Pri |
|---|-------|--------|-----|
| #58 | Expand desktop mock env | PARTIAL | MED |
| #79 | Menu popover position algorithm | PARTIAL | MED |
| #76 | Save graph view to vault file | PARTIAL | LOW |
| #20 | File hash dedup scan | PARTIAL | LOW |
| #55 | Docker image for PDF/code interpreter | NOT STARTED | LOW |

---

### Phase 7: Copilot — Document Intelligence

All NOT STARTED unless noted. Depends on Phase 1+2.

| # | Title | Status |
|---|-------|--------|
| #42 | One-click polish & format (absorbs #37) | NOT STARTED |
| #39 | Correct content errors | NOT STARTED |
| #33 | Article reviewer | NOT STARTED |
| #32 | Find files & write article | NOT STARTED |
| #38 | Suggest in/out links | PARTIAL (index has edges) |
| #36 | Large doc split suggestion | PARTIAL (chunking exists) |
| #34 | Auto detect text → add to docs | NOT STARTED |

---

### Phase 8: Copilot — Task & Workflow

| # | Title | Status |
|---|-------|--------|
| #48 | IFTTT workflow agent mode | NOT STARTED |
| #47 | Daily/weekly/monthly summarize | PARTIAL (daily stats) |
| #46 | Writing plan for tasks | NOT STARTED |
| #44 | Find vault tasks & solve | PARTIAL (search can query) |
| #43 | Task list check & apply | NOT STARTED |
| #31 | Extract todos from vault | PARTIAL (git diff only) |
| #63 | Alfred integration | NOT STARTED |

---

### Phase 9: Copilot — Quick Capture & Prompt

| # | Title | Status |
|---|-------|--------|
| #45 | Fast note / inbox | NOT STARTED |
| #41 | Suggest paste place | NOT STARTED |
| #40 | User DIY prompts per doc | NOT STARTED |
| #12 | Prompt auto rewrite (trigger in chat) | PARTIAL (templates exist) |
| #29 | Prompt quality audit pass | PARTIAL (infra exists) |

---

### Phase 10: Integrations & Advanced

| # | Title | Status | Pri |
|---|-------|--------|-----|
| #24 | Document type loader tests | PARTIAL | MED |
| #13 | Test all supported models | NOT STARTED | MED |
| #30 | Batch operate files UI | PARTIAL | LOW |
| #80 | Integrate OpenCode | NOT STARTED | LOW |
| #54 | Integrate community plugins | NOT STARTED | LOW |
| #53 | Sync flomo, Apple Notes, Calendar | NOT STARTED | LOW |
| #52 | GitHub.io auto sync | NOT STARTED | LOW |
| #66 | antvis/Infographic AI charts | NOT STARTED | LOW |
| #51 | DrawIO/Excalidraw with AI | PARTIAL | LOW |
| #50 | Model evaluation framework | NOT STARTED | LOW |
| #49 | Content sync (Git, Drive) | PARTIAL | LOW |
| #23 | Sync ChatGPT/Gemini/Claude history | NOT STARTED | LOW |
| #22 | Image/video generation | NOT STARTED | LOW |
| #1 | Code interpreter | NOT STARTED | LOW |

---

### Phase 11: Documentation

| # | Title | Status | Pri |
|---|-------|--------|-----|
| #88 | Graph inspector / AI analysis tutorial | NOT STARTED | MED |
| #26 | Model selection best practice doc | NOT STARTED | LOW |

---

## 5. Docs Health

### Archive → `docs/archive/`
| File | Reason |
|------|--------|
| `SQLite Storage Implementation.md` | wa-sqlite abandoned |
| `PROMPT_INJECTION_POINTS.md` | MindFlowAgent deleted |
| `HEAP_RETAINERS_MAIN_JS.md` | old build line numbers |
| `RESEARCH_WORKFLOW_ENGINEERING.md` | MindFlowAgent stale |

### Update
| File | Delta |
|------|-------|
| `DEVTOOLS_GUIDE.md` | +`window.indexDocument`, +`window.cleanupGraphTable` |
| `quick-search-ui-design.md` | store rename: `aiAnalysisStore` → `searchSessionStore` |
| `AI_ANALYSIS_ARCHITECTURE_AND_PROMPTS.md` | note V2 Agent SDK pipeline |

### Current (no action)
`USKE.md`, `graph-design.md`, `graph-viz-design.md`, `HUB_DOC_PIPELINE.md`, `desktop-mock-env.md`, `ChatConversationDoc.md`, `MEMORY_LEAK_AUDIT.md`, `BUNDLE_SIZE_ANALYSIS.md`, `azure_ai_sdk_zod_problem.md`

### Plans
| Plan | Status |
|------|--------|
| `2026-04-08-ai-search-ui-step-based-refactor` | **COMPLETED** |
| `2026-04-12-vault-search-agent-sdk-migration` | **15/16 COMPLETE** |
| `2026-04-12-v2-search-ui` | **COMPLETED** |
| `2026-04-12-context-handoff-v2-ui` | **SUPERSEDED** |
| `2026-04-10-search-inspector-tools-overhaul` | Partially superseded |
| `2026-04-12-agent-trace-observability` | NOT STARTED (gated) |

### Specs
| Spec | Status |
|------|--------|
| `2026-04-10-provider-mcp-skills-design` | Superseded by v2 (still describes current code) |
| `2026-04-10-search-inspector-tools-overhaul-design` | Partially superseded |
| `2026-04-11-provider-system-unification-analysis` | Decision doc |
| `2026-04-11-provider-system-v2-design` | **NEXT** — approved, not implemented |
| `2026-04-11-vault-search-agent-sdk-migration-design` | **IMPLEMENTED** |
| `2026-04-12-agent-trace-observability-design` | Approved, gated |
