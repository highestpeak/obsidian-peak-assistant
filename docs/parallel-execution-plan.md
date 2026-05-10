# Parallel Execution Plan

> Date: 2026-05-10
> Status: Active
> Scope: 6 work streams across 4 waves

## Overview

6 条独立工作线，按依赖关系编排为 4 个 wave。每条线在**独立 git worktree** 中执行，避免文件冲突。完成后合并到 master，下一个 wave 从更新后的 master 创建新 worktree。

## Conflict Map

被多个 plan 修改的高危文件——决定了执行顺序：

| File | Plans | Conflict Risk |
|------|-------|--------------|
| `searchSessionStore.ts` | Persistence + Report UI + AI UX P3 | HIGH |
| `aiAnalysisStore.ts` | Persistence + AI UX P3 | HIGH |
| `tab-AISearch.tsx` | Persistence + AI UX P3 | MEDIUM |
| `ai-analysis-report-section-system.md` | Report UI + AI UX P3 | MEDIUM |
| `recon.ts` | Inspector + AI UX P3 | LOW |
| `TemplateRegistry.ts` | Report UI + AI UX P3 | LOW |

Rule: 有冲突的 plan 不放在同一个 wave。AI UX Phase 3 碰了所有热点文件，必须最后做。

---

## Wave 1 — Parallel (5 streams, zero file overlap)

All 5 can run simultaneously. Each in its own worktree.

### Line A: Inspector Tools Overhaul

```bash
git worktree add ../peak-inspector feat/inspector-overhaul
```

- **Spec**: `docs/superpowers/specs/2026-04-10-search-inspector-tools-overhaul-design.md`
- **Plan**: needs writing (from spec, ~12 tasks)
- **Scope**: `service/tools/search-graph-inspector/*`, `core/schemas/tools/`, `core/constant.ts`
- **Isolation**: only touches inspector tool files, no store/UI overlap
- **Est.**: 12 tasks, medium

### Line B: V2 Persistence Bug Fix

```bash
git worktree add ../peak-persistence feat/v2-persistence-fix
```

- **Plan**: `docs/superpowers/plans/2026-04-18-v2-persistence-fix.md` (ready to execute)
- **Scope**: `quick-search/store/*`, `tab-AISearch.tsx`, `V2SourcesView.tsx`
- **Isolation**: only touches search stores and tab-AISearch — no inspector, no ambient, no provider
- **Est.**: 5 tasks, small-medium

### Line C: Report UI (Sticky Footer + Inline Edit)

```bash
git worktree add ../peak-report-ui feat/report-ui-polish
```

- **Plan**: `docs/superpowers/plans/2026-04-14-report-ui-quality.md` Tasks 3-4 (ready to execute)
- **Scope**: `V2PlanReview.tsx`, `useSearchSession.ts` (different lines from B), prompt template
- **Isolation**: V2PlanReview is untouched by any other plan
- **Est.**: 5 tasks, small

### Line D: Ambient Push Phase 2 (Graph Intelligence)

```bash
git worktree add ../peak-ambient-p2 feat/ambient-push-phase2
```

- **Spec**: `docs/superpowers/specs/2026-05-01-ambient-push-design.md` §Phase 2
- **Plan**: needs writing (~8 tasks)
- **Scope**: `service/ambient/*`, `ui/view/ambient-push/*`, `ui/store/ambientPushStore.ts`
- **Isolation**: completely independent module, zero overlap with A/B/C
- **Est.**: 8 tasks, medium

### Line E: MCP Feasibility Spike

```bash
git worktree add ../peak-mcp-spike spike/mcp-electron-compat
```

- **Spec**: `docs/superpowers/specs/2026-04-10-provider-mcp-skills-design.md` §PRE
- **Goal**: verify `@modelcontextprotocol/sdk` works in Obsidian/Electron + esbuild bundle
- **Deliverable**: spike report with go/no-go + fallback strategy (HTTP-only)
- **Isolation**: standalone test, no source code changes
- **Est.**: 1 task, small

### Wave 1 Merge Sequence

All 5 branches merge independently (no order required):

```
master ← feat/inspector-overhaul
       ← feat/v2-persistence-fix
       ← feat/report-ui-polish
       ← feat/ambient-push-phase2
       (spike/mcp-electron-compat — no merge, just report)
```

Merge criterion: build passes + tests pass. No cross-branch dependencies.

---

## Wave 2 — AI UX Phase 3 + Ambient Push Phase 3 (parallel)

**Prerequisite**: Wave 1 Lines A/B/C merged to master.

### Line F: AI Analysis UX Phase 3

```bash
git worktree add ../peak-ai-ux-p3 feat/ai-analysis-ux-phase3
```

- **Plan**: `docs/superpowers/plans/2026-04-17-ai-analysis-ux-overhaul.md` Phase ③ (ready)
- **Scope**: 17 tasks, ~25 files — the largest single effort
- **Why it must wait**: touches `searchSessionStore`, `aiAnalysisStore`, `tab-AISearch`, `recon.ts`, `TemplateRegistry` — all modified by Wave 1 A/B/C
- **Internal phases**: ① format constraints → ② persistence enhancement → ③ continue analysis core → ④ annotation UI → ⑤ synthesize agent → ⑥ history
- **Est.**: 17 tasks, large

### Line D (continued): Ambient Push Phase 3 (Serendipity Engine)

```bash
git worktree add ../peak-ambient-p3 feat/ambient-push-phase3
```

- **Spec**: design spec §Phase 3
- **Plan**: needs writing (~10 tasks)
- **Scope**: `service/ambient/*`, CodeMirror gutter decoration, LLM micro-explanation
- **Isolation**: still zero overlap with Line F
- **Est.**: 10 tasks, medium-large

### Line E (continued): Provider MCP Phase 1-3

```bash
git worktree add ../peak-mcp-impl feat/provider-mcp-client
```

- **Spec**: `docs/superpowers/specs/2026-04-10-provider-mcp-skills-design.md` Phase 1-3
- **Plan**: needs writing (~10 tasks)
- **Prerequisite**: spike report from Wave 1 confirms feasibility
- **Scope**: `core/providers/model-registry/`, `service/mcp/`, Settings UI
- **Isolation**: provider files are not touched by Line F
- **Est.**: 10 tasks, medium-large

---

## Wave 3 — Ambient Push Phase 4 + Provider Skills

### Line D (final): Ambient Push Phase 4 (Morning Briefing)

```bash
git worktree add ../peak-ambient-p4 feat/ambient-push-phase4
```

- **Spec**: design spec §Phase 4
- **Plan**: needs writing (~6 tasks)
- **Prerequisite**: Phase 3 merged
- **Est.**: 6 tasks, medium

### Line E (final): Provider MCP Phase 4-5 (Skill System + Usage)

```bash
git worktree add ../peak-skills feat/skill-system
```

- **Spec**: provider-mcp-skills spec Phase 4-5
- **Plan**: needs writing (~7 tasks)
- **Prerequisite**: AI UX Phase 3 merged (StepList UI stable), MCP client merged
- **Est.**: 7 tasks, medium

---

## Wave 4 — Integration Testing & Cleanup

- Smoke test all features end-to-end on real vault
- Update `docs/manual-testing-checklist.md` with new sections
- Update `docs/progress.md` with completed phases
- Clean up worktrees: `git worktree list && git worktree prune`

---

## Plans That Need Writing

Before each wave starts, the following plans must be created from their specs:

| Plan | Source Spec | Wave | Priority |
|------|-----------|------|----------|
| Inspector Tools Overhaul | `specs/2026-04-10-search-inspector-tools-overhaul-design.md` | W1 | Write first |
| Ambient Push Phase 2 | `specs/2026-05-01-ambient-push-design.md` §Phase 2 | W1 | Write first |
| Ambient Push Phase 3 | same spec §Phase 3 | W2 | Write before W2 |
| Ambient Push Phase 4 | same spec §Phase 4 | W3 | Write before W3 |
| Provider MCP Phase 1-3 | `specs/2026-04-10-provider-mcp-skills-design.md` Phase 1-3 | W2 | Write before W2 |
| Provider MCP Phase 4-5 | same spec Phase 4-5 | W3 | Write before W3 |

Plans ready to execute (no writing needed): V2 Persistence, Report UI, AI UX Phase 3.

---

## Worktree Discipline

### Setup

```bash
# From project root
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

# Create worktree for a task
git worktree add ../peak-<name> feat/<branch-name>

# Each session works in its worktree
cd ../peak-<name>
```

### Rules

1. **One worktree per line** — never mix work from two lines in one worktree
2. **Branch from latest master** — `git fetch && git checkout -b feat/xxx origin/master` before adding worktree
3. **Merge to master before starting dependent wave** — no stacking branches
4. **Build + test in worktree before merge** — `npm run build && npm run test`
5. **Prune after merge** — `git worktree remove ../peak-<name>`

### Claude Code Session Dispatch

Each worktree gets its own Claude Code session. Suggested prompt pattern:

```
Working directory: ../peak-<name>
Branch: feat/<branch-name>

Execute plan: docs/superpowers/plans/<plan-file>.md
- Start from Task N
- Build and test after each task
- Commit atomically per task
```

### Parallel Session Layout

```
Terminal 1: ../peak-inspector     (Line A — Inspector)
Terminal 2: ../peak-persistence   (Line B — Persistence)
Terminal 3: ../peak-report-ui     (Line C — Report UI)
Terminal 4: ../peak-ambient-p2    (Line D — Ambient Push)
Terminal 5: ../peak-mcp-spike     (Line E — MCP Spike)
```

---

## Timeline Estimate

| Wave | Lines | Parallelism | Est. Duration |
|------|-------|-------------|--------------|
| W1 | A + B + C + D + E | 5 parallel | 1 session each |
| W2 | F + D(p3) + E(mcp) | 3 parallel | F: 2-3 sessions, D/E: 1 session each |
| W3 | D(p4) + E(skills) | 2 parallel | 1 session each |
| W4 | Integration test | 1 | 1 session |

Total: ~8-10 sessions, vs ~20+ sessions if sequential.
