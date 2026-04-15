# Playbook Dimension Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the 17-dimension taxonomy into the V2 SDK playbook's Query Analysis Protocol, add Phase 0 first-principles thinking, and extend the `decomposition` mission role with explicit first-principles guidance.

**Architecture:** Two targeted prompt template edits. No schema changes, no code compilation, no test infrastructure — these are runtime-loaded markdown templates. The `templates/prompts/` directory is watched by TemplateManager and loaded at startup.

**Tech Stack:** Markdown prompt templates only. Build check: `npm run build` to verify no TypeScript errors (templates are loaded at runtime, not compiled).

---

## File Map

| File | Change |
|------|--------|
| `templates/prompts/ai-analysis-vault-sdk-playbook.md:20-46` | Replace 3-axis Query Analysis Protocol with 4-Phase structure including 17-dimension table |
| `templates/prompts/ai-analysis-report-section-system.md:43` | Extend `decomposition` role description with first-principles approach guidance |

---

### Task 1: Replace Query Analysis Protocol in playbook

**Files:**
- Modify: `templates/prompts/ai-analysis-vault-sdk-playbook.md:20-46`

- [ ] **Step 1: Verify current content at lines 20-46**

Run:
```bash
sed -n '20,46p' templates/prompts/ai-analysis-vault-sdk-playbook.md
```
Expected: Shows the current 3-axis structure starting with `## Query Analysis Protocol`.

- [ ] **Step 2: Replace lines 20-46 with 4-Phase structure**

Replace this exact block (lines 20–46):
```
## Query Analysis Protocol

Before choosing your first tool, analyze the query on three axes:

### Axis 1 — Semantic Depth
What information dimensions does this query need? Decompose into 3-6 sub-questions.
Example: "evaluate my product ideas" →
  Sub-Q1: What product ideas exist in the vault?
  Sub-Q2: What is the user's current situation/context?
  Sub-Q3: What feasibility evidence exists?
  Sub-Q4: What past attempts are documented?
  Sub-Q5: What skills/resources does the user have?

### Axis 2 — Topological Breadth
- **Point query**: specific note, concept, or fact → narrow search (2-5 folders)
- **Plane query**: collection, enumeration, comparison → broad sweep (5+ folders, multiple strategies)

### Axis 3 — Temporal Dynamics
Does the query involve change, comparison, or history? If yes, explicitly search for temporal evidence (dates, "before/after", evolution).

### Query Decomposition (think step)
Before your first tool call, output your decomposition:
```
Sub-Q1: [description] → strategy: [folder browse / grep / wikilink]
Sub-Q2: [description] → strategy: [...]
...
```
```

With this new content:
```
## Query Analysis Protocol

Before choosing your first tool, work through four phases in order.

### Phase 0 — First Principles
Strip the query to its irreducible core:
- What is the user actually trying to achieve? (goal beneath the stated request)
- What assumptions are embedded in the question?
- What would a "fully answered" response look like from first principles?

Output: 1-3 sentences capturing the fundamental question beneath the surface question.
This analysis should later inform the `decomposition` section of your report.

### Phase 1 — Dimension Scan
Review the 17 information dimensions below. Identify which ones apply to this query.
For each applicable dimension, draft one sub-question it implies.
Aim for 3-6 sub-questions that collectively cover the applicable dimensions.

**Always consider these 6 by default** (skip only if clearly irrelevant):
`essence_definition`, `why_mechanism`, `how_method`, `example_case`, `options_comparison`, `impact_consequence`

Most queries touch 3-6 dimensions. Rare to need more than 8.

**CRITICAL:** Each sub-question must be directly tied to the user's actual query topic.
Do NOT generate generic descriptions — "find notes about the user's specific X" not "search for concept Y in general".

#### 17 Dimensions Reference

| # | ID | Cluster | What it asks | Trigger signal |
|---|-----|---------|--------------|----------------|
| 1 | `essence_definition` | Base | What is this fundamentally? Core identity, definition | "what is", "define", "explain" |
| 2 | `history_origin` | Base | Where did it come from? Development, background | "origin", "history", "how did X start" |
| 3 | `why_mechanism` | Causal | Why does it work this way? Cause, principle | "why", "mechanism", "reason" |
| 4 | `evidence_source` | Causal | What proves this? Evidence, citation, data | "prove", "evidence", "source" |
| 5 | `pitfall_misconception` | Causal | What do people get wrong? Traps, blind spots | "mistake", "wrong", "trap", "avoid" |
| 6 | `how_method` | Practice | How is it done? Method, procedure, how-to | "how to", "steps", "method" |
| 7 | `example_case` | Practice | What are real instances? Examples, stories | "example", "case", "show me" |
| 8 | `options_comparison` | Evaluation | What are the alternatives? Comparison, choices | "compare", "vs", "options", "which" |
| 9 | `cost_risk_limit` | Evaluation | What are the downsides? Cost, risk, tradeoff, boundary | "risk", "downside", "limit", "tradeoff" |
| 10 | `applicable_condition` | Context | When does this apply? Who it's for, scenario | "when", "who", "condition", "scenario" |
| 11 | `impact_consequence` | Context | What does this lead to? Impact, outcome | "impact", "result", "consequence", "effect" |
| 12 | `related_extension` | Context | What connects to this? Related concepts, links | "related", "connected", "extension" |
| 13 | `next_action` | Action | What should be done next? Immediately actionable step | "next", "action", "do", "start" |
| 14 | `trend_future` | Action | Where is this heading? Trend, prediction, potential | "future", "trend", "potential", "direction" |
| 15 | `tool_resource` | Action | What tools/resources exist? Software, books, references | "tool", "resource", "software", "book" |
| 16 | `inventory_mapping` | Topology | What is the full landscape? Exhaustive catalog | "all my", "list", "overview", "inventory" |
| 17 | `temporal_mapping` | Temporal | How has this changed? Evolution, before/after | "history", "change", "over time", "evolve" |

### Phase 2 — Topological Breadth
- **Point query**: specific note, concept, or fact → narrow search (2-5 folders)
- **Plane query**: collection, enumeration, comparison → broad sweep (5+ folders, multiple strategies)

### Phase 3 — Temporal Dynamics
Does the query involve change, comparison, or history? If yes, explicitly search for temporal evidence (dates, "before/after", evolution).

### Output (write before first tool call)

```
Core question: [Phase 0 — 1-3 sentences on fundamental intent]
Sub-Q1: [from Phase 1] → Strategy: [folder browse / grep / wikilink]
Sub-Q2: [from Phase 1] → Strategy: [...]
...
Query type: [Point / Plane] | Temporal: [yes / no]
```
```

Use the Edit tool with `old_string` = the entire lines 20-46 block and `new_string` = the new 4-Phase content above.

- [ ] **Step 3: Verify the edit**

Run:
```bash
sed -n '18,55p' templates/prompts/ai-analysis-vault-sdk-playbook.md
```
Expected: Shows `## Query Analysis Protocol`, then `### Phase 0 — First Principles`, `### Phase 1 — Dimension Scan`, the 17-dimension table, `### Phase 2`, `### Phase 3`, and the `### Output` block.

- [ ] **Step 4: Verify the section after the edit still flows into Search Execution Rules**

Run:
```bash
grep -n "## Search Execution Rules" templates/prompts/ai-analysis-vault-sdk-playbook.md
```
Expected: Shows one match. The line number should be after the new Query Analysis Protocol section.

---

### Task 2: Extend `decomposition` mission role in report section system

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section-system.md:43`

- [ ] **Step 1: Verify current line 43**

Run:
```bash
sed -n '41,46p' templates/prompts/ai-analysis-report-section-system.md
```
Expected:
```
- **decomposition**: Break the topic into irreducible first-principles components. Strip surface detail.
- **blindspots**: Explicitly identify what evidence is MISSING...
```

- [ ] **Step 2: Replace the decomposition line**

Replace:
```
- **decomposition**: Break the topic into irreducible first-principles components. Strip surface detail.
```

With:
```
- **decomposition**: Break the topic into irreducible first-principles components. Strip surface detail.
  Approach: Imagine you are the first person studying this topic. What are the basic facts that cannot be simplified further? What assumptions does the user's query embed — are they valid? What would remain if every assumption were removed? Your Phase 0 "Core question" analysis should directly inform this section — surface the gap between what the user asked and what they fundamentally need.
```

- [ ] **Step 3: Verify the edit**

Run:
```bash
sed -n '41,50p' templates/prompts/ai-analysis-report-section-system.md
```
Expected: Shows the extended `decomposition` line (now 2 lines: the original + the `Approach:` line), followed by `- **blindspots**:...`.

---

### Task 3: Build check and commit

- [ ] **Step 1: Run build**

Run:
```bash
npm run build 2>&1 | tail -20
```
Expected: Build completes without errors. Template files are not compiled — this just checks TypeScript is still clean.

- [ ] **Step 2: Commit both template changes**

```bash
git add templates/prompts/ai-analysis-vault-sdk-playbook.md templates/prompts/ai-analysis-report-section-system.md
git commit -m "feat(prompts): add 17-dimension taxonomy and Phase 0 first-principles to playbook

- Replace 3-axis Query Analysis Protocol with 4-phase structure
- Phase 0: first principles analysis before dimension scanning
- Phase 1: 17-dimension reference table with clusters and trigger signals
- Phase 2/3: preserve existing topological breadth and temporal dynamics
- Extend decomposition mission role with first-principles approach guidance"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Restore 17-dimension taxonomy as soft reference guidance | Task 1 — Phase 1 section with full dimension table |
| Add first principles as meta-cognitive pre-step before dimension scanning | Task 1 — Phase 0 before Phase 1 |
| Strengthen `decomposition` mission role for first-principles breakdowns | Task 2 — extended description with Approach guidance |
| Connect Phase 0 to report planning via soft guidance | Task 1 — "This analysis should later inform the `decomposition` section" |
| No structured output required from agent for dimension selection | ✓ Table is labeled "Reference", no schema change |
| No schema changes to `vault_submit_plan` | ✓ Not touched |
| No changes to search execution rules | ✓ Task 1 only replaces lines 20-46; search rules start at line 48+ |
| No changes to legacy pipeline | ✓ Not touched |

**Placeholder scan:** None found. All steps show exact content to insert.

**Type consistency:** N/A — prompt template edits only.
