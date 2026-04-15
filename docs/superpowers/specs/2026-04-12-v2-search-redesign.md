# V2 Search Redesign: Prompt Intelligence + UI Overhaul

> **Status**: Design spec. Pre-implementation.
> **Branch**: `refactor_search_pipeline`
> **Dependencies**: None for Phase 1 (prompt). Provider v2 for Phase 3.
> **Author**: Synthesized from PRD analysis, git history trace, industry research, and user feedback.

---

## 1. Motivation

V2 (Claude Agent SDK) gained speed and flexibility but lost V1's structured intelligence. The current 50-line playbook produces reports that:

- Cover 0.36% of vault files (9/2481) — catastrophic recall for reflective queries
- Mix agent "self-talk" into the final report ("让我探索…很好！找到了…")
- Never generate Mermaid diagrams (all 5 Mermaid prompts were deleted in commit `b65cc30`)
- Have no SCQA structure, no source scoring, no follow-up questions
- Don't leverage the existing vault intuition cache or probe infrastructure

The root cause is not the SDK runtime (which is correct) — it's that the playbook is too naive. V1's prompt intelligence was not ported to V2.

---

## 2. Problem Inventory

### 2.1 Bugs (功能不工作)

| ID | Problem | Root Cause | Fix Type |
|----|---------|------------|----------|
| B1 | `submit_plan` tool error: `No such tool available: mcp__vault__vault_submit_plan` | MCP tool registered as `submit_plan`, but all other tools have `vault_` prefix. LLM infers `vault_submit_plan`. | Code: rename in vaultMcpServer.ts |
| B2 | Copy All copies empty content | `handleCopyAll` reads V1 stores, V2 doesn't write to them | Code: add V2 fallback |
| B3 | Save to Vault saves empty content | `buildCompletedAnalysisSnapshot()` reads V1 stores | Code: add V2 fallback |
| B4 | Cannot select/copy report text | CSS `select-none` or Shadow DOM isolation | Code: fix CSS |
| B5 | Spinner shows during agent thinking (console has output but UI blank) | V2 mode detection requires `v2Steps.length > 0`, but thinking phase has no tool calls | Code: add `v2Active` flag |
| B6 | Duration shows empty | SDK complete event lacks `durationMs` | Code: self-timing |
| B7 | Step durations show "0.0s" | `startedAt` and `endedAt` timestamps not properly captured | Code: fix timing |

### 2.2 Content Quality (报告质量)

| ID | Problem | Root Cause |
|----|---------|------------|
| C1 | Only 9/2481 files read — critical recall gap | Playbook has no query decomposition or coverage requirement |
| C2 | Agent doesn't know user's context (NZ, 学生, 找工作) | No vault intuition injected into system prompt |
| C3 | No Mermaid diagrams in report | Playbook has zero Mermaid instructions |
| C4 | No SCQA structure — report is free-form prose | Playbook has no report format guidance |
| C5 | No source scoring or reasoning | Playbook has no assessment instructions |
| C6 | No follow-up questions | Playbook doesn't request them |
| C7 | Agent doesn't decompose complex queries | Playbook only has Type A/B binary classification |
| C8 | No closure verification before submitting | Agent submits after reading "enough" without checking completeness |
| C9 | Agent hallucinates file paths in report | No probe results injected to anchor real paths |

### 2.3 UI/UX (界面交互)

| ID | Problem | Design |
|----|---------|--------|
| U1 | Text and tools displayed in separate blocks, losing temporal context | Unified timeline model |
| U2 | Agent self-talk mixed into final report | Separate thinking text from final report |
| U3 | Expanded steps show raw JSON (useless to users) | Remove JSON expand |
| U4 | Process steps visible after completion (noisy) | Default to report view, footer toggle to process |
| U5 | Follow-up input requires footer button hunting | Floating input above footer |
| U6 | No source/reference section | Auto-extract from tool calls |
| U7 | 18 pages, no navigation | Mini TOC / scroll buttons |
| U8 | Token badge in wrong place | Move to footer |
| U9 | No generation suggestions for users | Suggestion chips near follow-up input |
| U10 | Mermaid renders as code blocks | Prompt fix (C3) + ensure StreamdownIsolated handles it |

---

## 3. Architecture Decision: SDK vs. Code Pipeline

### Core Principle

> **LLM reasoning is only warranted where the problem is genuinely continuous (intent understanding, synthesis). For discrete problems (tool selection, query classification, file routing), rules + lightweight classification beats agentic reasoning on cost, latency, and stability.**
>
> — Derived from `peakassistant-两阶段也不快-第一性原理-再次反思系统.md`

### What the SDK replaces (don't rebuild)

| V1 Code | Why SDK handles it |
|---------|-------------------|
| `runAgentLoop` / manual tool dispatch | `query()` handles the tool-calling loop |
| `streamObject` + Zod schemas for intermediate phases | Agent decides its own flow |
| Separate classify → decompose as two independent LLM calls | Agent does this naturally in one continuous session |
| Per-phase AbortController/timeout | `maxTurns` limit |
| `SearchArchitectAgent` (tool strategy selection) | Agent selects tools — this is what LLMs are best at |
| 5 separate Mermaid agents (generator, fixer, overview, decorator, blueprint) | Over-engineering — one agent can generate Mermaid inline if the prompt is right |

### What must return as prompt engineering (zero code)

| V1 Intelligence | How to inject | Why agent needs it |
|----------------|---------------|-------------------|
| Three-axis pre-classification (semantic/topological/temporal) | Playbook section | Without it, agent defaults to semantic-only search |
| Query decomposition into sub-questions | Playbook section | Complex queries need parallel coverage |
| Closure verification | Playbook pre-submit checklist | Prevents "9 files and done" |
| SCQA report framework | Playbook report format spec | Prevents formless prose |
| Mermaid generation rules + safety constraints | Playbook visualization section | Agent won't use Mermaid unless told |
| `[[wikilink]]` citation format | Playbook output rules | Obsidian-native references |
| Follow-up question generation | Playbook output rules | Guide continued exploration |
| Source assessment with reasoning | Playbook submit_plan format | User needs "why these files" |

### What needs code changes

| Need | Change | Why not pure prompt |
|------|--------|-------------------|
| Vault intuition injection | Load `knowledge_intuition_json` + folder intuitions from SQLite, prepend to systemPrompt | Runtime data — can't be in static prompt |
| Probe results injection | Run FTS before `query()`, prepend real file paths to systemPrompt | Real-time search results — can't be in static prompt |
| `submit_plan` rename | `vaultMcpServer.ts`: rename `submit_plan` → `vault_submit_plan` | Bug fix |
| Timeline data model | New `v2Timeline` in store, event routing | New UI concept |
| Dual-view UI | New components | New UI concept |
| Source extraction | Parse `vault_read_note` tool calls into source list | Runtime event processing |

### What to defer (conflicts with provider v2 / MCP refactor)

| Feature | Reason to wait |
|---------|---------------|
| Graph visualization (separate agent call) | Needs stable `query()` cost model after provider v2 |
| Per-step model selection | Profile Registry not yet built |
| Agent trace integration | Gated on provider v2 per spec |
| MCP-based skill execution | MCP client spec not finalized |

---

## 4. Design: Phase 1 — Playbook Rewrite + Bug Fixes

### 4.1 New Playbook Structure (~200 lines)

The playbook replaces `templates/prompts/ai-analysis-vault-sdk-playbook.md`:

```
Section 1: ROLE AND MISSION
  - You are a vault analysis agent
  - Your job: comprehensive search → structured report with visualizations

Section 2: VAULT CONTEXT (runtime-injected)
  {{vaultIntuition}}     ← folder intuitions + global map
  {{probeResults}}       ← FTS results for query keywords

Section 3: QUERY ANALYSIS PROTOCOL
  Three-axis classification:
    Axis 1 (Semantic Depth): What information dimensions does this query need?
      → Map to sub-questions (3-6)
    Axis 2 (Topological Breadth): Point query or plane query?
      → Point: specific note/concept. Plane: collection/directory enumeration
    Axis 3 (Temporal Dynamics): Does query involve change/comparison/history?
      → If yes: explicitly search for temporal evidence

  Query decomposition output (think step):
    Sub-Q1: [description] → strategy: [folder browse / grep / wikilink]
    Sub-Q2: [description] → strategy: [...]
    ...

Section 4: SEARCH EXECUTION RULES
  Tool set and usage patterns (current content, refined)
  Three-phase search discipline:
    Phase 1 (BROAD_RECON): Sweep folders/grep, no deep reads yet
    Phase 2 (MULTI_POINT_SAMPLING): Read headers/summaries of candidates
    Phase 3 (DEEP_DIVE): Full read only after targets confirmed
  
  Coverage requirements:
    Reflective queries: minimum 15-20 notes across 3+ folders
    Specific queries: 3-8 notes
    Always include at least one search in kb1-life-notes/ (personal context)

Section 5: CLOSURE VERIFICATION (before submit_plan)
  For each sub-question from Section 3:
    ✓ Sub-Q1: answered? Source notes: [list]
    ✓ Sub-Q2: answered? Source notes: [list]
    ...
  If any sub-question unanswered → continue searching
  If all answered → proceed to submit_plan

Section 6: REPORT FORMAT
  Language: Mirror user's query language (Chinese → Chinese, etc.)
  
  Structure (SCQA-inspired):
    1. Title (answer-first, propositional — not "关于X的分析" but "X的核心结论是Y")
    2. Executive summary (3-5 sentences, directly answering the query)
    3. Mermaid overview (mindmap of key concepts, mandatory)
    4. Body sections (each with heading conclusion, evidence, wikilink citations)
    5. Additional Mermaid diagrams (1-2, selected per content type — see Section 7)
    6. Sources (list of all [[wikilinks]] cited, with one-line reasoning each)
    7. Follow-up questions (3 context-specific questions the user might ask next)
  
  Citation format: [[note-name]] inline with every factual claim
  Forbidden: external URLs, backtick file paths, disclaimers about vault limitations

Section 7: MERMAID VISUALIZATION RULES
  Every report MUST include at least 2 Mermaid diagrams:
    1. mindmap — mandatory — overview of all concepts in the query scope
    2. Content-appropriate diagram — selected by content type:
       - Comparing/evaluating → quadrantChart
       - Decision/choice → flowchart TD
       - Timeline/evolution → timeline
       - Cause/effect → flowchart LR
       - Composition/breakdown → pie (≤4 parts only) or mindmap subtree
  
  Mermaid safety rules (CRITICAL — violation causes render failure):
    - All node labels in double quotes: `N1["Label text"]`
    - Labels ≤ 15 characters, insert `<br/>` every 10-15 chars
    - Max 4 edges per node
    - quadrantChart axis labels: single words only, no spaces
    - No raw `[`, `(`, `"` inside labels
    - Conflict edges: dashed + red (`-.->` with linkStyle stroke:#e11d48)
  
  Shape semantics (when using flowchart):
    (()) = core tension/nucleus
    {} = decision/trade-off
    () = concrete evidence
    {{}} = heuristic/inference

Section 8: submit_plan FORMAT
  Call vault_submit_plan with:
    selected_paths: [list of all paths to cite]
    reasoning: [one-line per path explaining why it's relevant]
    coverage_check: [map of sub-question → answered/unanswered]
    confidence: "high" | "medium" | "low"
```

### 4.2 Vault Intuition Injection

**File**: `src/service/agents/VaultSearchAgentSDK.ts`

Before calling `query()`, load and prepend to systemPrompt:

```
1. Folder intuitions (top 30, from IndexService)
   Format: "## Vault Structure\n" + folders with descriptions

2. Global intuition map (from SQLite `knowledge_intuition_json`)
   Format: "## Vault Understanding\n" + JSON (truncated to 3000 chars)

3. Probe results (run FTS with query keywords)
   Format: "## Relevant Files Found\n" + top 10-15 hits with paths + snippets
```

This is exactly what V1's `queryUnderstanding.ts:53-100` did. The code to load this data exists — just need to wire it into `VaultSearchAgentSDK.ts`.

### 4.3 Bug Fixes

| Bug | Fix |
|-----|-----|
| B1: submit_plan naming | `vaultMcpServer.ts`: rename registration from `submit_plan` to `vault_submit_plan`. Update `allowedTools` in `VaultSearchAgentSDK.ts`. Update `v2ToolDisplay` switch case. |
| B5: spinner during thinking | Add `v2Active: boolean` to store. Set `true` on first `stream_event` or `pk-debug` with `vault-sdk-starting`. Use in `SearchResultView.tsx` for V2 detection. |
| B6: empty duration | Calculate `duration = Date.now() - startedAt` in the `complete` handler. |
| B7: 0.0s step durations | Already fixed by per-token streaming (step events now arrive before result). Verify. |

---

## 5. Design: Phase 2 — UI Redesign

### 5.1 Data Model: Unified Timeline

Replace `v2Steps` + `v2ReportChunks` with a unified timeline:

```typescript
type V2TimelineItem =
  | { kind: 'text'; id: string; chunks: string[]; complete: boolean }
  | { kind: 'tool'; step: V2ToolStep }

interface V2State {
  v2Active: boolean;
  v2Timeline: V2TimelineItem[];
  v2FinalReportStartIndex: number;    // index in timeline where the final report begins
  v2Sources: V2Source[];               // extracted from tool calls
  v2FollowUpQuestions: string[];       // parsed from report tail
  // ... existing fields (v2ToolCallIndex stays for tool-result correlation)
}
```

**Event routing logic:**
- `text-delta` → append to last `kind: 'text'` item; if last item is `kind: 'tool'`, create new text item
- `tool-call` → push `kind: 'tool'` item; mark preceding text item as `complete: true`
- `tool-result` → update corresponding tool item (existing logic)
- `complete` → mark last text item as `complete: true`; detect final report (last text item after last tool item)

**Source extraction** (on `tool-call` with `vault_read_note`):
```typescript
{ path: input.path, title: basename, readAt: Date.now() }
```

**Follow-up extraction** (on final report completion):
- Parse last text item for a "## Follow-up" or "## 继续探索" section
- Extract bullet items as follow-up questions
- If not found, leave empty (user can still type their own)

### 5.2 Dual View Architecture

**Two views, one data source:**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   View A: PROCESS (timeline)                        │
│   ─ Rendered during streaming                       │
│   ─ Interleaved text bubbles + tool cards           │
│   ─ Auto-scrolls to bottom                          │
│                                                     │
│   View B: REPORT (final output)                     │
│   ─ Rendered after completion                       │
│   ─ Only the final report (last text block after    │
│     last tool call), rendered in StreamdownIsolated  │
│   ─ Sources section below                           │
│   ─ Follow-up questions below                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**State machine:**
```
streaming → View A (process) forced
completed → View B (report) by default
user clicks "Show Process" → View A
user clicks "Show Report" → View B
```

**Footer layout (completed state):**
```
[🔄 探索过程] [📋 Copy] [💾 Save] [↑↓ Scroll] | [Continue Analysis ▸] [Open in Chat]
```

### 5.3 Report View Components

```
┌─ Report View ──────────────────────────────────────┐
│                                                     │
│  [Mini TOC — floating, top-right or left margin]    │
│    ├ 一、想法综合评价                                │
│    ├ 二、个人现状分析                                │
│    └ 三、行动建议                                   │
│                                                     │
│  [StreamdownIsolated — full report content]          │
│    Including inline Mermaid diagrams                 │
│    Including inline [[wikilink]] citations           │
│                                                     │
│  ┌─ Sources (N notes) ────────────────────────────┐ │
│  │ 📄 A-2-独立开发             → click to open    │ │
│  │ 📄 CA-WHOAMI                → click to open    │ │
│  │ 📄 B-5-付费策略和变现策略     → click to open    │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ Continue Exploring ───────────────────────────┐ │
│  │ 💬 这些想法中哪些最适合零成本启动？               │ │
│  │ 💬 有没有已经验证过的类似产品？                   │ │
│  │ 💬 如何评估这些想法的市场规模？                   │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.4 Process View Components

```
┌─ Process View ──────────────────────────────────────┐
│                                                      │
│  💭 根据查询，我需要找到关于独立开发产品想法…          │
│     最相关的文件夹应该是：                            │
│     - kb2-learn-prd/B-2-创意和想法管理                │
│     - kb1-life-notes/CA-WHOAMI                       │
│                                                      │
│  📂 Browsing vault structure       62 folders · 2481 │
│  📂 Reading B-2-创意和想法管理       330 files         │
│  📂 Reading CA-WHOAMI               94 files          │
│                                                      │
│  💭 很好！找到了相关文件。让我搜索更多…               │
│                                                      │
│  🔍 Searching "独立开发 产品 idea"   20 hits          │
│  📄 Reading 9 notes in depth        A-2-独立开发, ... │
│                                                      │
│  💭 完美！我已经收集了足够的信息。                     │
│                                                      │
│  📋 Evidence plan                   9 sources         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Text bubbles (`kind: 'text'`): light gray background, small font, max 3 lines with expand.
Tool cards (`kind: 'tool'`): existing V2StepCard style (no JSON expand).

### 5.5 Floating Follow-up Input

When user clicks "Continue Analysis" in footer:

```
┌──────────────────────────────────────────────────────────┐
│  [Input: Ask a follow-up question...]              [→]   │
│  Suggestions: [📊 对比表格] [🗺 思维导图] [📋 行动清单]  │
└──────────────────────────────────────────────────────────┘
[Footer: ...]
```

- Absolute-positioned above footer with backdrop blur
- Closes on Escape or clicking outside
- Suggestions are clickable — clicking inserts the text and auto-submits
- Uses existing `InlineFollowupChat` component, adapted for floating position

### 5.6 Mini TOC for Report Navigation

For reports with 3+ `##` headings:
- Parse heading structure from the report markdown
- Render a compact floating TOC (top-right, sticky)
- Click to scroll to section
- Highlight current section during scroll

Implementation: parse `v2Timeline` final report text for `## ` lines, generate anchor IDs, render as a small `<nav>` overlay.

### 5.7 Copy All / Save Adaptation

Both `handleCopyAll` and `buildCompletedAnalysisSnapshot` need V2 fallbacks:

```typescript
// In useAIAnalysisResult or wherever these are:
const getV2Content = () => {
  const s = useSearchSessionStore.getState();
  if (s.v2Timeline.length === 0) return null;
  const finalReport = s.v2Timeline
    .filter(item => item.kind === 'text')
    .pop();
  return {
    summary: finalReport?.chunks.join('') ?? '',
    sources: s.v2Sources.map(s => s.path),
    // no topics, no dashboardBlocks — V2 is markdown-native
  };
};
```

---

## 6. Design: Phase 3 — Post-Provider-v2

### 6.1 Knowledge Graph Agent

After the main report is generated, optionally dispatch a second `query()` call:
- Input: the final report markdown + source list
- Task: generate a relationship graph between the key concepts/notes
- Output: Mermaid `flowchart` or `erDiagram` showing connections
- Render: in a collapsible section below Sources

This requires a second `query()` call, which has IPC overhead. Gate behind a user-triggered action ("🔗 Generate relationship graph"), not auto-run.

### 6.2 Mermaid Auto-Repair

If StreamdownIsolated fails to render a Mermaid block:
1. Capture the parse error
2. Dispatch a lightweight repair call (could be a small local model)
3. Replace the failed block with the repaired version

This requires the trace/observability infrastructure to detect render failures.

### 6.3 Vault Intuition Feedback Loop

After each search session:
- Compare what the agent found vs. what the intuition map predicted
- Log discrepancies (files in unexpected locations, missing folders, etc.)
- Periodically update the intuition map with learned corrections

This is V1's `intuitionFeedback.ts` concept, but with actual write-back.

---

## 7. Mermaid Strategy (Detailed)

### 7.1 Why Mermaid is Critical

From information theory: visual comprehension of structured relationships is ~60,000x faster than parsing equivalent text. For a query like "evaluate all my ideas", a mindmap showing 4 products with their attributes communicates in 2 seconds what takes 2 pages of text.

From user research (design docs): the "Visual Logic Decorator" pattern — where each report section gets a visual prescription — was the most sophisticated part of V1's output system. It was entirely deleted.

### 7.2 Diagram Type Selection Matrix

| Content Pattern | Mermaid Type | Example |
|----------------|-------------|---------|
| Concept overview, all topics in scope | `mindmap` | All product ideas |
| Priority/comparison on 2 axes | `quadrantChart` | Ideas by feasibility × market size |
| Decision with branches | `flowchart TD` | Which idea to pursue |
| Cause → effect chain | `flowchart LR` | Why PeakAssistant → revenue |
| Chronological progression | `timeline` | Past year's projects |
| Task/project plan | `gantt` | 90-day action plan |
| Proportion (≤4 parts only) | `pie` | Time allocation |

### 7.3 Safety Rules (from historical prompts + user docs)

These rules were in the deleted prompts and must be restored:

1. **Labels**: double-quoted, ≤15 chars, `<br/>` every 10-15 chars
2. **No special chars in labels**: no `[`, `(`, `"`, `:`, `;` — they break the parser
3. **Degree limit**: max 4 edges per node
4. **quadrantChart**: axis labels must be single words (no spaces)
5. **Conflict edges**: dashed + red with `linkStyle N stroke:#e11d48`
6. **Size limit**: max 15 nodes per diagram — break large concepts into multiple small diagrams

### 7.4 Integration with StreamdownIsolated

StreamdownIsolated already integrates `@streamdown/mermaid`. Mermaid code blocks (` ```mermaid `) render automatically. No code changes needed — only prompt changes to make the agent output them.

The surviving `ai-analysis-overview-mermaid-render-system.md` prompt can be referenced for syntax patterns but is not directly used in V2 (it was for the two-phase logic-model → flowchart pipeline, which is too heavy for V2).

---

## 8. Compatibility with Future Refactors

### Provider v2 (from spec `2026-04-11-provider-system-v2-design.md`)

- All AI calls move to Claude Agent SDK `query()` — V2 search already uses this, so no conflict
- Profile Registry replaces per-feature provider config — V2 search should read from Profile Registry when it lands, not maintain its own
- `SDKMessage` is the stable event surface — V2 UI already targets this via `sdkMessageAdapter.ts`

### Agent Trace Observability (from spec `2026-04-12-agent-trace-observability-design.md`)

- Trace sink is an additional subscriber on `query()` iterator — V2 UI must not assume sole ownership of the stream (already true)
- No direct UI impact

### MCP / Skills Redesign (from spec `2026-04-10-provider-mcp-skills-design.md`)

- V2 vault tools are already MCP-based (`createSdkMcpServer`) — compatible
- Future skill execution may use the same `query()` runtime — no conflict

### Key constraint

> **Do not build UI that surfaces or depends on V1's intermediate pipeline phases** (probe, classify, decompose, recon). These concepts are being eliminated. The V2 timeline view shows what the SDK agent actually does (tool calls + text), not reconstructed pipeline phases.

---

## 9. Implementation Phases

### Phase 1: Prompt Intelligence + Bug Fixes (do now)

| Task | Effort | Impact |
|------|--------|--------|
| Rewrite playbook (~200 lines) | 1-2 hours | Content quality: HIGH |
| Inject vault intuition into systemPrompt | 30 min | Recall: HIGH |
| Inject probe results into systemPrompt | 30 min | Anti-hallucination: HIGH |
| Fix B1: submit_plan → vault_submit_plan | 10 min | Bug: CRITICAL |
| Fix B5: v2Active flag for early detection | 20 min | UX: MEDIUM |
| Fix B6: self-timing for duration | 10 min | UX: LOW |

**Validation**: Run the test query "我的独立开发产品 idea 的综合评价 给我快速致富路 给我符合我的现状的方案" and verify:
- Report includes Mermaid diagrams
- Report covers all 6 information needs (all ideas, feasibility, context, tech stack, history, past attempts)
- Sources are properly cited with [[wikilinks]]
- Follow-up questions generated
- At least 15 notes read

### Phase 2: UI Overhaul (after Phase 1 validated)

| Task | Effort | Impact |
|------|--------|--------|
| Timeline data model (`v2Timeline`) | 1 hour | Architecture: FOUNDATION |
| Event routing for timeline | 1 hour | Data flow |
| Process view (interleaved text + tools) | 1-2 hours | UX: HIGH |
| Report view (StreamdownIsolated + sources + follow-ups) | 1-2 hours | UX: HIGH |
| Dual view toggle in footer | 30 min | UX: MEDIUM |
| Mini TOC for report navigation | 1 hour | UX: MEDIUM |
| Floating follow-up input | 1 hour | UX: MEDIUM |
| Copy All / Save V2 adaptation | 30 min | Bug fix |
| Fix B4: text selection in report | 30 min | Bug fix |
| Source section extraction from tool calls | 30 min | UX: MEDIUM |
| Scroll to top/bottom buttons | 20 min | UX: LOW |
| Remove JSON expand from step cards | 10 min | UX: LOW |

### Phase 3: Post-Provider-v2 (after provider refactor lands)

| Task | Effort | Impact |
|------|--------|--------|
| Graph visualization agent | 2-3 hours | Feature: MEDIUM |
| Generation suggestions (chips) | 1 hour | UX: MEDIUM |
| Mermaid auto-repair loop | 1-2 hours | Quality: MEDIUM |
| Vault intuition feedback loop | 1-2 hours | Quality: LOW (long-term gain) |
| Agent trace integration | 1 hour | DevEx |

---

## 10. Key Design Principles

1. **Prompt over code**: If it can be a prompt instruction, don't make it code. SDK agent can follow complex instructions — trust it.

2. **Structure ≫ content**: A report with clear SCQA structure and 2 Mermaid diagrams beats a longer unstructured report every time.

3. **Mermaid is a first-class output, not decoration**: Every report must have at least 2 diagrams. This is enforced in the playbook, not in post-processing.

4. **The vault is a small-world network**: 1% hub knowledge enables O(log N) navigation. Vault intuition gives the agent this 1% upfront.

5. **Closure before submission**: Agent must verify coverage against sub-questions before calling submit_plan. "Read enough" is not a valid stopping criterion.

6. **Process is temporary, report is permanent**: During streaming, show everything. After completion, collapse process and highlight the deliverable.

7. **Obsidian-native interactions**: [[wikilinks]] for citations (click to open), Mermaid for diagrams (already supported), keyboard shortcuts, dark mode awareness.

---

## Appendix A: Reference Documents

| Document | Path | Key Insight |
|----------|------|-------------|
| Search essence | `kb2-learn-prd/B-Z-mess/peakAssistant-搜索的本质.md` | "搜索 = 锚点初始化 → 受控图遍历 → 路径闭环验证" |
| Agentic search plan | `kb2-learn-prd/B-Z-mess/peakassistant-索引优化-AgenticSearch综合方案.md` | Hub-centric traversal, structured delivery |
| Mermaid two-phase | `kb2-learn-prd/B-Z-mess/peakassistant-mermaid图.md` | Logic meta-modeling → syntax rendering |
| Mermaid per section | `kb2-learn-prd/B-Z-mess/peakassistant-mermaid-plan-for-each-section.md` | Visual Logic Decorator pattern |
| Chart selection | `kb2-learn-prd/B-Z-mess/peakassistant-何时用何种图.md` | 3 questions before any chart |
| Dashboard design | `kb2-learn-prd/B-Z-mess/peakassistant-dashboard和summary.md` | McKinsey MECE + SCQA |
| Slot-filling paradigm | `kb2-learn-prd/B-Z-mess/peakassistant-知识调用是否是填而不是搜索.md` | "结构 ≫ 内容" |
| Pipeline reflection | `kb2-learn-prd/B-Z-mess/peakassistant-两阶段也不快-第一性原理-再次反思系统.md` | "80% queries need type-matching, not thinking" |
| User emotional spectrum | `kb2-learn-prd/B-Z-mess/peakassistant-用户感性诉求光谱.md` | 9-type taxonomy |
| Final architecture | `kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-最终AI搜索设计方案-重构方案-claude.md` | PeakAgent loop, intuition feedback |
| Provider v2 spec | `docs/superpowers/specs/2026-04-11-provider-system-v2-design.md` | Profile Registry, SDK-only runtime |
| SDK migration spec | `docs/superpowers/specs/2026-04-11-vault-search-agent-sdk-migration-design.md` | 8-layer signal loss root cause |
| Trace observability spec | `docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md` | Fan-out subscriber pattern |

## Appendix B: Industry Research

| Product | Pattern | Applicability |
|---------|---------|--------------|
| ChatGPT Deep Research | Full-screen document viewer + TOC + citations sidebar | Report view navigation |
| Perplexity | Citation-forward `[n]` inline + 3 follow-up questions | Source attribution + follow-ups |
| Claude Artifacts | Side panel for deliverable, chat for conversation | Process/report separation |
| Google NotebookLM | mindmap as standard output format | Mermaid mindmap validation |
| Smart Connections (Obsidian) | Sidebar with similarity scores | Source section design |
| Mem0 (Agent Memory) | Episodic + Semantic + Procedural memory layers | Vault intuition architecture |
