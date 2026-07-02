# Execution Roadmap

> Last updated: 2026-04-20
> Purpose: task scheduling + parallelization strategy for batch session launches

---

## Already Done (in working tree, needs commit)

- **Milestone-Based Persistence** -- `analysisDocPersistence.ts` fully implemented, 4 save milestones wired into BGM + useSearchSession, incremental persist effect deleted. Just needs commit.
- **Dead code cleanup** -- 58 files changed, -5710 lines in working tree (shared-ui, ai-analysis-sections, old components). Needs commit.

---

## Conflict Matrix

File-level conflict analysis for parallel feasibility:

```
              QP    VR    ProvV2  Trace  Phase0  Phase3
QP             -    !!      ok      ok     ok      ok
VR            !!     -      ok      ok     ok      ok
ProvV2        ok    ok       -      XX     ok      ok
Trace         ok    ok      XX       -     ok      ok
Phase0        ok    ok      ok      ok      -      ok
Phase3        ok    ok      ok      ok     ok       -
```

- `XX` = hard dependency, must be sequential
- `!!` = file conflict, same file different regions, needs manual merge
- `ok` = no conflict, safe to parallelize in worktrees

**Conflict details:**

| Pair | Conflicting files | Nature |
|---|---|---|
| QP <-> VR | `SearchModal.tsx` (AI tab vs Vault tab, different regions), `AIAnalysisHistoryService.ts` | Mergeable, different regions |
| ProvV2 -> Trace | `VaultSearchAgentSDK.ts`, `package.json` | Hard sequential, Trace requires v2 to land first |

---

## Wave 0: Cleanup Sprint

**Status: MOSTLY DONE** -- only GitHub triage remains.

| Task | Content | Status |
|------|---------|--------|
| 0-A | GitHub triage: close 22 done + 6 merge + 1 won't-fix = 29 issues | PENDING (needs `gh` batch ops) |
| 0-B | Archive 4 stale docs to `docs/archive/` | DONE (already archived) |
| 0-C | Update 3 stale docs (DEVTOOLS_GUIDE, quick-search-ui-design, AI_ANALYSIS_ARCHITECTURE) | DONE (already updated) |
| 0-D | Mark completed plan headers (3 plans) | DONE (already marked) |
| 0-E | Delete `spikeAgentSdk.ts` | DONE (already deleted) |

**Done when**: `git log` shows cleanup commit, GitHub issue count 89 -> ~60

---

## Wave 1: Search Enhancement

**Parallelism**: 2 independent worktrees + 1 cleanup worktree
**Current state**: QP started (Task 1 done), VR spec+plan ready

### Session layout

```
+-------------------------------------------------------+
|  Wave 1 -- 3 parallel worktrees                       |
|                                                       |
|  +----------+  +----------+  +--------+               |
|  |  feat/qp |  |  feat/vr |  |cleanup |               |
|  |          |  |          |  |/phase0 |               |
|  | 14 tasks |  | 14 tasks |  | 5 tasks|               |
|  | (1 done) |  |          |  |        |               |
|  +----+-----+  +----+-----+  +---+----+               |
|       |             |            |                     |
|       +------+------+            |                     |
|         merge SearchModal.tsx    |                     |
|         + AIAnalysisHistory      |                     |
|              |                   |                     |
|              +-------------------+                     |
|                       |                                |
|                 master (Wave 1 complete)                |
+-------------------------------------------------------+
```

### 1A: Query Pattern Discovery

**Branch**: `feat/query-pattern-discovery`
**Plan**: `docs/superpowers/plans/2026-04-20-query-pattern-discovery.md`
**Tasks**: 14 (Task 1 done)
**Scale**: Large -- 13 new files, 9 modified files

Key deliverables:
- `query_pattern` SQLite table + QueryPatternRepo (done)
- ContextProvider + PatternMatcher services
- PatternDiscoveryAgent (LLM-driven)
- SuggestionGrid / ActiveSessionsList / RecentAnalysisList UI
- SearchModal AI tab overhaul (idle state -> landing page)

### 1B: Vault Search Redesign

**Branch**: `feat/vault-search-redesign`
**Plan**: `docs/superpowers/plans/2026-04-20-vault-search-redesign.md`
**Tasks**: 14
**Scale**: Large -- 10 new files, 6 modified files

Key deliverables:
- InspectorSidePanel (340px side panel)
- ConnectedSection + DiscoveredSection (SEM/CO-CITE/UNLINKED)
- Mode prefix system (`#`, `@`, `:`, `?`)
- coCitationService + unlinkedMentionService
- Keyboard navigation (right/left arrows)

### Merge strategy

1. **1A (QP)** and **1B (VR)** complete, merge 1A -> master first, then rebase 1B to resolve `SearchModal.tsx` conflict (different regions, auto-merge likely succeeds)
2. Wave 0 cleanup merges whenever ready

**Done when**: master contains both branches' code, `npm run build` passes

---

## Wave 2: Provider v2 + UI Foundation

**Prerequisite**: Wave 1 fully merged to master
**Parallelism**: 2 worktrees

### Session layout

```
+------------------------------------------+
|  Wave 2 -- 2 parallel worktrees          |
|                                          |
|  +---------------+  +----------------+   |
|  |  feat/        |  |  feat/         |   |
|  |  provider-v2  |  |  ui-theme      |   |
|  |               |  |                |   |
|  |  12 tasks     |  |  4 tasks       |   |
|  |  MASSIVE      |  |  medium        |   |
|  |  -5k~7k/      |  |                |   |
|  |  +1.5k~2k LOC |  |  #92 dark      |   |
|  |               |  |  #77 isolation  |   |
|  +-------+-------+  |  #56 theme cfg |   |
|          |          |  #74 FileIcon   |   |
|          |          +-------+--------+   |
|          |                  |            |
|          +------------------+            |
|                    |                     |
|              master (Wave 2)             |
+------------------------------------------+
```

### 2A: Provider System v2 -- CRITICAL PATH

**Branch**: `feat/provider-v2`
**Spec**: `docs/superpowers/specs/2026-04-11-provider-system-v2-design.md`
**Plan**: NEEDS WRITING (TASKS.md Phase 1 has 12-task outline)
**Scale**: Massive -- delete entire Vercel AI SDK stack, unify to Agent SDK `query()`

Execution phases:
1. Profile Registry (`src/core/profiles/`)
2. Profile materialization -> Agent SDK env vars
3. Chat migration: `streamText`/`generateText` -> `query()`
4. Skill migration
5. Structured extraction: `streamObject`/`generateObject` -> `query()` + tools
6. Document agents (tag/title/summary) -> `query()`
7. Embedding utility (~50 lines)
8. MCP unification -- Agent SDK built-in MCP client
9. Delete old code: `core/providers/adapter/`, `core/providers/base/`, `@ai-sdk/*`
10. Settings UI -> Profile-based
11. Usage tracking unification
12. `isDesktopOnly` + manifest update

**Risk**: Largest refactor in the project. Recommend splitting into sub-waves:
- 2A-alpha: Profile Registry + Chat migration (core path working)
- 2A-beta: Remaining migrations + old code deletion
- Merge each sub-wave to master before starting next, avoid long-lived branch

### 2B: UI/Theme Foundation (Phase 3)

**Branch**: `feat/ui-theme`
**Plan**: NEEDS WRITING (based on TASKS.md Phase 3)
**Scale**: Medium

| Issue | Content | Priority |
|-------|---------|----------|
| #92 | Dark theme support | HIGH |
| #77 | Style isolation (Tailwind/Obsidian boundary + CSS vars) | HIGH |
| #56 | Theme configuration (user settings) | MED |
| #74 | Unified `<FileIcon>` component | MED |

Zero file conflicts with Provider v2, fully independent.

**Done when**: Provider v2 migration complete + build passes + old `@ai-sdk/*` deps deleted + dark theme available

---

## Wave 3: Observability + Chat Polish

**Prerequisite**: Wave 2A (Provider v2) merged to master
**Parallelism**: 2 worktrees

### Session layout

```
+------------------------------------------+
|  Wave 3 -- 2 parallel worktrees          |
|                                          |
|  +---------------+  +----------------+   |
|  |  feat/        |  |  feat/         |   |
|  |  agent-trace  |  |  chat-polish   |   |
|  |               |  |                |   |
|  |  11 tasks     |  |  ~8 tasks      |   |
|  |  medium       |  |  medium        |   |
|  |               |  |                |   |
|  |  TraceSink    |  |  #93 del tab   |   |
|  |  CLI harness  |  |  #72 input     |   |
|  |  fixtures     |  |  #68 views     |   |
|  |  scenarios    |  |  #73 modes     |   |
|  +-------+-------+  +-------+--------+   |
|          +------------------+            |
|                    |                     |
|              master (Wave 3)             |
+------------------------------------------+
```

### 3A: Agent Trace Observability

**Branch**: `feat/agent-trace`
**Plan**: `docs/superpowers/plans/2026-04-12-agent-trace-observability.md` (11 tasks)
**Scale**: Medium -- ~1000 new lines, ~25 fixture files, almost all new files

Key deliverables:
- TraceSink (JSONL output)
- `scripts/run-agent.ts` CLI harness
- 5 named scenarios + fixture vault
- Obsidian command: `Peak: Run Trace Scenario`

### 3B: Chat System Polish (architecture)

**Branch**: `feat/chat-polish`
**Plan**: `docs/superpowers/plans/2026-04-20-chat-system-polish.md` (12 tasks)
**Scale**: Medium -- store restructure (4->2), ChatInputArea refactor, delete/modes/shortcuts

### 3C: Chat UI Redesign (visual/UX)

**Branch**: `feat/chat-ui-redesign`
**Plan**: `docs/superpowers/plans/2026-04-22-chat-ui-redesign.md` (15 tasks)
**Spec**: `docs/superpowers/specs/2026-04-22-chat-ui-redesign-design.md`
**Scale**: Large -- message list, actions, tool calls, menus, home, conv list, project overview, outline, types
**Depends on**: 3B (store restructure) + Wave 2B (CSS vars)

Key deliverables:
- ConversationType as first-class field (chat/agent/plan/canvas/template/custom)
- Message: role avatars, hover-reveal inline actions, style switch buttons, date separators
- Tool calls: collapsed summary (Option A)
- Custom @ and / menus (replace CodeMirror tooltip)
- Home: suggestion cards + compact recent list
- Conversation list: two-row with type badges, search, date grouping
- Topic tree outline panel
- ThinkingIndicator, IME fix, mock data cleanup

Zero file conflicts with Agent Trace.

**Done when**: all chat views match approved mockups

---

## Wave 4+: Feature Expansion

Lower priority after Wave 3. Organized by TASKS.md phases:

| Wave | Phase | Content | Dependency |
|------|-------|---------|------------|
| 4 | Phase 4 | Search bugs (#60), score (#90), modes (#91), smart connection (#89) | Wave 1 (search foundation) |
| 4 | Phase 6 | Mock env (#58), popover (#79), save graph (#76) | None |
| 5 | Phase 7 | Copilot: polish (#42), reviewer (#33), links (#38), split (#36) | Wave 2 (Provider v2) |
| 5 | Phase 8 | Copilot: workflow (#48), summarize (#47), tasks (#44) | Wave 2 |
| 6 | Phase 9 | Quick capture: inbox (#45), DIY prompts (#40), prompt audit (#29) | None |
| 6 | Phase 10 | Integrations: loader tests (#24), model eval (#50), sync (#49) | None |
| 7 | Phase 11 | Docs: tutorial (#88), model guide (#26) | All features stable |

---

## Summary: Execution Timeline

```
        Week 1            Week 2            Week 3            Week 4+
  +-----------------+ +-----------------+ +-----------------+ +------------+
  |  WAVE 0+1       | |  WAVE 2         | |  WAVE 3         | |  WAVE 4+   |
  |                 | |                 | |                 | |            |
  |  [==] cleanup   | |  [=========]    | |  [========]     | |  Search    |
  |  [====] QP      | |  | Provider v2| | |  | Agent Trace| | |  polish    |
  |  [====] VR      | |  [=========]    | |  [========]     | |            |
  |                 | |                 | |                 | |  Copilot   |
  |                 | |  [=====] theme  | |  [=====] chat   | |  features  |
  |                 | |                 | |                 | |            |
  +-----------------+ +-----------------+ +-----------------+ +------------+
       3 parallel         2 parallel         2 parallel        as needed
```

**Critical path**: Wave 1 -> Wave 2A (Provider v2) -> Wave 3A (Agent Trace)

Provider v2 is the only bottleneck. All Wave 1 work and Wave 2B (theme) are off the critical path.

---

## Launch Checklist

### Wave 1 launch (NOW)
- [x] QP spec + plan ready
- [x] VR spec + plan ready
- [x] QP Task 1 completed
- [x] Milestone Persistence already implemented (just needs commit)
- [ ] Create worktrees for each branch

### Wave 2 launch
- [ ] Wave 1 fully merged to master, build passes
- [x] Provider v2 implementation plan written: `docs/superpowers/plans/2026-04-20-provider-system-v2.md` (12 tasks, 3 sub-waves)
- [x] UI/Theme spec + plan written: `docs/superpowers/plans/2026-04-20-ui-theme-foundation.md` (11 tasks)
- [ ] Confirm Provider v2 sub-wave split strategy

### Wave 3 launch
- [ ] Provider v2 merged to master
- [ ] Agent Trace plan preconditions all met
- [x] Chat polish spec + plan written: `docs/superpowers/plans/2026-04-20-chat-system-polish.md` (12 tasks)

---

## Plans Still Needed

All plans are written. No remaining gaps.

| Plan | Status |
|------|--------|
| Provider v2 | DONE: `docs/superpowers/plans/2026-04-20-provider-system-v2.md` (12 tasks, 3 sub-waves) |
| UI/Theme | DONE: `docs/superpowers/plans/2026-04-20-ui-theme-foundation.md` (11 tasks) |
| Chat polish | DONE: `docs/superpowers/plans/2026-04-20-chat-system-polish.md` (12 tasks) |
