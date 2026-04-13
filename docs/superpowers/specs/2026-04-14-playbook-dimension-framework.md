# Spec: Enrich V2 SDK Playbook with Dimension Framework & First Principles

**Date:** 2026-04-14  
**Status:** Draft  
**Files changed:**
- `templates/prompts/ai-analysis-vault-sdk-playbook.md`
- `templates/prompts/ai-analysis-report-section-system.md`

---

## Problem

The V2 Agent SDK playbook's Query Analysis Protocol uses a minimal 3-axis structure (Semantic Depth / Topological / Temporal) with no systematic framework for generating sub-questions. The legacy pipeline had a carefully designed 17-dimension taxonomy (15 semantic + topology + temporal) that ensured comprehensive query coverage — this was lost in the V2 rewrite. The result: sub-questions are shallow and depend entirely on the agent's spontaneous reasoning rather than a structured framework.

Additionally, "first principles" thinking only exists as an optional report section role, not as a query analysis tool.

---

## Goals

1. Restore the 17-dimension taxonomy as soft reference guidance in the Query Analysis Protocol
2. Add first principles reasoning as a meta-cognitive pre-step before dimension scanning
3. Strengthen the `decomposition` mission role description so it produces deeper first-principles breakdowns
4. Connect Phase 0 (first principles analysis) to report planning via soft guidance

---

## Non-Goals

- No structured output required from the agent for dimension selection (stays soft/reference only)
- No schema changes to `vault_submit_plan`
- No changes to search execution rules or coverage requirements
- No changes to the legacy pipeline

---

## Design

### Change 1: Restructure Query Analysis Protocol in playbook

**File:** `templates/prompts/ai-analysis-vault-sdk-playbook.md`

Replace the current `## Query Analysis Protocol` section (lines 20–46) with a 4-Phase structure:

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
| 17 | `temporal_mapping` | Temporal | How has this changed? Evolution, before/after | "change", "over time", "history", "evolve" |

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

### Change 2: Strengthen `decomposition` mission role in report section prompt

**File:** `templates/prompts/ai-analysis-report-section-system.md`

Replace line 43:
```
- **decomposition**: Break the topic into irreducible first-principles components. Strip surface detail.
```

With:
```
- **decomposition**: Break the topic into irreducible first-principles components. Strip surface detail.
  Approach: Imagine you are the first person studying this topic. What are the basic facts that cannot be simplified further? What assumptions does the user's query embed — are they valid? What would remain if every assumption were removed? Your Phase 0 "Core question" analysis should directly inform this section — surface the gap between what the user asked and what they fundamentally need.
```

---

## Approach Rationale

**Soft reference vs structured output:** The 17 dimensions are a thinking tool, not a required schema. The agent decides which apply, scans against the list, and generates sub-questions naturally. This preserves V2's flexibility while giving it a systematic framework.

**Phase 0 before Phase 1:** First principles analysis must precede dimension scanning — you need to understand the fundamental question before deciding which information dimensions are relevant. A user asking "evaluate my product ideas" has a different fundamental need than "find notes about product ideas."

**Soft connection for report:** Phase 0 output lives in the agent's reasoning trace and is available as context when the agent writes the report plan. No schema change needed — the prompt guidance is sufficient for the agent to carry the insight forward.

---

## Files Changed Summary

| File | Section | Change type |
|------|---------|-------------|
| `templates/prompts/ai-analysis-vault-sdk-playbook.md` | `## Query Analysis Protocol` (lines 20-46) | Replace with 4-Phase structure |
| `templates/prompts/ai-analysis-report-section-system.md` | `decomposition` role (line 43) | Extend description |
