# V2 Report Quality Overhaul + UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore V1's McKinsey report quality (per-section visualization, plan-before-generate, logic audit) within V2's Agent SDK framework, and fix remaining UI bugs (TOC sticky, continue analysis suggestions).

**Architecture:** The playbook (`ai-analysis-vault-sdk-playbook.md`) is rewritten to instruct the SDK agent to execute a multi-phase report flow within a single `query()` call: evidence collection → report plan (with per-section visual prescriptions) → per-section generation (each with mandated format: table/mermaid/prose) → executive summary → submit. UI fixes are independent of the playbook rewrite.

**Tech Stack:** Handlebars templates (playbook), React + Zustand (UI components), Claude Agent SDK (`query()`)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `templates/prompts/ai-analysis-vault-sdk-playbook.md` | **Rewrite** | Complete playbook with multi-phase report generation |
| `src/ui/view/quick-search/components/V2TableOfContents.tsx` | **Modify** | Fix: make TOC button `sticky` instead of `absolute` |
| `src/ui/view/quick-search/components/V2ContinueAnalysisInput.tsx` | **Modify** | Fix: show follow-up question suggestion chips |
| `src/ui/view/quick-search/store/searchSessionStore.ts` | **Modify** | Add `v2PlanSections` field for plan data |

---

### Task 1: Fix UI — TOC button sticky positioning

**Files:**
- Modify: `src/ui/view/quick-search/components/V2TableOfContents.tsx:34`

The TOC button uses `pktw-absolute pktw-right-2 pktw-top-2` which scrolls away. Change to `pktw-sticky` so it stays visible.

- [ ] **Step 1: Fix TOC container positioning**

In `V2TableOfContents.tsx:34`, change:
```tsx
// FROM:
<div className="pktw-absolute pktw-right-2 pktw-top-2 pktw-z-10">
// TO:
<div className="pktw-sticky pktw-top-2 pktw-float-right pktw-z-10 pktw-mr-2">
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors. TOC button stays visible when scrolling.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2TableOfContents.tsx
git commit -m "fix(v2-ui): make TOC button sticky so it stays visible on scroll"
```

---

### Task 2: Fix UI — Continue Analysis suggestion chips

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ContinueAnalysisInput.tsx:15`

The `suggestions` read from `v2FollowUpQuestions` but this may be empty if the follow-up questions weren't parsed. The issue: `v2FollowUpQuestions` is populated in `markCompleted()` by parsing the report markdown, but if the report doesn't have a "继续探索" section header, no questions are extracted.

Two fixes: (a) also parse from `proposed_outline` which may use different heading formats, (b) ensure the playbook instructs agent to always include follow-up questions with a consistent heading.

- [ ] **Step 1: Broaden follow-up question parsing in markCompleted**

In `searchSessionStore.ts`, the `markCompleted` function (around line 328) parses follow-up questions with:
```ts
const followUpMatch = reportText.match(/##\s*(?:继续探索|Follow-up\s*Questions?|延伸问题|进一步探索)\s*\n([\s\S]*?)(?:\n##\s|\n---|\z|$)/i);
```

Broaden the regex to also match numbered lists and common variations:
```ts
const followUpMatch = reportText.match(
  /##\s*(?:继续探索|Follow-up\s*Questions?|延伸问题|进一步探索|后续探索|后续问题|Further\s*Questions?)\s*\n([\s\S]*?)(?:\n##\s|\n---|\z|$)/i
);
if (followUpMatch) {
  followUps = followUpMatch[1]
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').replace(/^💬\s*/, '').replace(/\*\*/g, '').trim())
    .filter((l) => l.length > 5);
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors. Follow-up questions now appear in Continue Analysis floating overlay.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "fix(v2-ui): broaden follow-up question parsing to catch more heading formats"
```

---

### Task 3: Rewrite playbook — Multi-phase report generation

**Files:**
- Rewrite: `templates/prompts/ai-analysis-vault-sdk-playbook.md`

This is the core change. The playbook must instruct the agent to follow a structured multi-phase report flow within a single `query()` session. The key additions from V1's design philosophy:

1. **Report Plan phase** — after evidence collection, before writing, agent outputs a structured plan with per-section visual prescriptions
2. **Per-section generation** — each section has a mandated format (table for comparisons, mermaid for relationships, prose for analysis)
3. **Logic Audit** — scan evidence for conflicts before synthesis
4. **McKinsey SCQA structure** — each section = insight headline + why it matters + evidence + action
5. **Enumeration requirement** — for "all my X" queries, MUST list all found items in a comparison table before analyzing

- [ ] **Step 1: Write the new playbook**

Replace the full content of `templates/prompts/ai-analysis-vault-sdk-playbook.md` with the following (~250 lines). Key design decisions:

**Section 1-5: Search** — keep existing (query analysis, search execution, closure verification). These work well.

**NEW Section 6: Report Planning** — after closure verification, before writing the report:
```
## Report Planning (MANDATORY — do this BEFORE writing)

After verifying closure, plan your report structure. Output your plan as a thinking step:

### Step 1: Logic Audit
Scan all collected evidence for:
- Contradictions between sources (e.g., one note says X, another says not-X)
- Numbers/dates that conflict
- Causal claims without supporting evidence
Document any conflicts — they MUST appear in the report.

### Step 2: Section Plan
Design 3-6 McKinsey-style sections. For each section, decide:
- **Section title**: a conclusion sentence (NOT a topic label)
- **Content type**: enumeration | comparison | analysis | recommendation | timeline
- **Mandated format**:
  | Content type | Required format |
  |---|---|
  | Enumeration (listing all items) | Comparison TABLE with columns for key attributes |
  | Comparison (evaluating options) | quadrantChart or comparison TABLE |
  | Trend / timeline | timeline or gantt mermaid diagram |
  | Causal analysis | flowchart mermaid diagram |
  | Recommendation / action plan | Numbered action list with owner + timeline |
  | Concept overview | mindmap mermaid diagram |

### Step 3: Enumeration Check
For reflective/enumerative queries ("all my X", "evaluate my Y"):
- Count how many distinct items you found
- ALL items MUST appear in a comparison table
- Do NOT say "你有超过50个想法" without listing them
- If too many items: group into tiers (Tier 1: top 5 detailed, Tier 2: next 10 brief, Tier 3: remainder listed)
```

**REWRITTEN Section 7: Report Format** — replace current Section 6 with McKinsey structure:
```
## Report Format

Language: Mirror the user's query language.

### Structure (McKinsey SCQA + Dashboard Blocks)

1. **Title** — answer-first, propositional conclusion

2. **Executive Summary** (~800 words, continuous prose)
   - Answer-first opening (no warm-up sentences)
   - Key findings with [[wikilink]] evidence citations
   - 2-3 concrete, immediately actionable next steps
   - Reference section titles for detail: "如下方'[Section Title]'部分所详述"

3. **Mermaid Overview** — mandatory concept map (mindmap or flowchart)

4. **Body Sections** (3-6 sections, each following this template):

   #### [Conclusion-as-heading]

   **Why it matters**: 2-3 sentences on strategic implication

   **Evidence**: 
   - For enumeration → COMPARISON TABLE (mandatory)
   - For analysis → Mermaid diagram (type from Section Plan)
   - For all → [[wikilink]] citations for every factual claim

   **Key data points**: bullet list of specific facts/numbers from vault

   **What to do**: clear action or recommendation

   **Risks/Blind spots**: what could go wrong, what evidence is missing

5. **Evidence Conflicts** (mandatory if any contradictions found in Logic Audit)

6. **Sources** — [[wikilink]] list with one-line reasoning per source

7. **继续探索** — 3-5 context-specific follow-up questions
```

**REWRITTEN Section 8: Mermaid Rules** — keep existing safety rules, add per-section prescription:
```
## Mermaid Visualization Rules

Every report MUST include at least 2 Mermaid diagrams.
Each body section SHOULD include a visualization matching its content type (see Section Plan).

### Per-Section Visual Prescription
Before generating each section's Mermaid, ask three questions:
1. What is the task goal? (compare, trend, compose, relate, structure?)
2. What data precision? (executive scan vs analyst detail?)  
3. Which chart family matches?

### Anti-patterns (REJECT these)
- Pie chart with >4 parts → use table or bar-style comparison instead
- Qualitative data forced into bar chart → use mindmap or concept flowchart
- Timeline as bullet list → use mermaid timeline or gantt

[Keep existing safety rules: labels ≤15 chars, double quotes, max 4 edges, etc.]
```

**REWRITTEN Section 9: vault_submit_plan format** — clarify that proposed_outline contains the COMPLETE structured report:
```
## vault_submit_plan Format

Call vault_submit_plan with:
- selected_paths: array of all vault paths cited
- rationale: per-path reasoning (one line each, format: "path: reasoning")
- proposed_outline: the COMPLETE structured report following the Report Format above
  - MUST include all tables, all Mermaid diagrams, all [[wikilink]] citations
  - MUST include the Executive Summary as Section 2
  - MUST include Evidence Conflicts section if any were found
  - MUST include 继续探索 section with 3-5 follow-up questions
- coverage_assessment: map of each sub-question → answered/unanswered with source notes
```

- [ ] **Step 2: Verify playbook has no Handlebars syntax issues**

Check for bare `{{` or `}}` in the playbook that would cause Handlebars parse errors. Only `{{{vaultIntuition}}}` and `{{{probeResults}}}` should use curly braces (triple-stache for unescaped).

Run: `grep -n '{{' templates/prompts/ai-analysis-vault-sdk-playbook.md`
Expected: Only lines with `{{{vaultIntuition}}}` and `{{{probeResults}}}`.

- [ ] **Step 3: Build to verify template loads**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add templates/prompts/ai-analysis-vault-sdk-playbook.md
git commit -m "feat(playbook): rewrite with multi-phase report generation (plan→per-section→summary)"
```

---

### Task 4: Store — Add plan sections field for future HITL

**Files:**
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts`

Add a `v2PlanSections` field to store the agent's report plan (extracted from thinking text or submit_plan). This prepares for future HITL plan approval.

- [ ] **Step 1: Add v2PlanSections to state interface**

In `searchSessionStore.ts`, after `v2ProposedOutline`:
```ts
/** Report plan sections extracted from agent's thinking (for future HITL approval) */
v2PlanSections: Array<{ title: string; contentType: string; visualType: string }>;
```

- [ ] **Step 2: Add to INITIAL_STATE and startSession reset**

```ts
v2PlanSections: [],
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(store): add v2PlanSections field for report plan data"
```

---

### Task 5: Integration test — End-to-end report quality validation

This is a manual test using the Obsidian plugin. No automated test possible for prompt quality.

- [ ] **Step 1: Reload plugin in Obsidian**

In Obsidian DevTools: disable and re-enable the plugin, or press Cmd+R to reload.

- [ ] **Step 2: Run test query**

Query: `我的独立开发产品 idea 的综合评价 给我快速致富路 给我符合我的现状的方案`

- [ ] **Step 3: Verify report structure checklist**

Check the generated report for:
- [ ] Title is answer-first (propositional conclusion, not "关于X的分析")
- [ ] Executive Summary is continuous prose (~800 words), no bullet lists
- [ ] At least 1 comparison TABLE listing found ideas with attributes
- [ ] At least 2 Mermaid diagrams (1 mindmap overview + 1 content-appropriate)
- [ ] Each body section has: conclusion heading + why it matters + evidence + action + risks
- [ ] Evidence Conflicts section present (if contradictions found)
- [ ] [[wikilink]] citations on factual claims
- [ ] "继续探索" section with 3-5 follow-up questions
- [ ] No agent self-talk ("让我分析...", "很好！我找到了...")

- [ ] **Step 4: Verify UI elements**

- [ ] TOC button stays visible when scrolling report
- [ ] TOC headings are clickable and scroll to correct section
- [ ] Continue Analysis floating overlay shows suggestion chips (follow-up questions)
- [ ] Process view shows "Generating report..." progress indicator during final phase

- [ ] **Step 5: Document issues for iteration**

If any checklist items fail, note which playbook section needs adjustment and iterate on Task 3.

---

---

### Task 6: UI Fixes — Process View improvements

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ProcessView.tsx`

User feedback from Image 46:

- [ ] **Step 1: Report Evolution clickable — clicking it should switch to Report view**

In `ReportEvolution` component, add `onClick` that sets `v2View` to `'report'`:
```tsx
<div className="... pktw-cursor-pointer" onClick={() => useSearchSessionStore.getState().setV2View('report')}>
```

- [ ] **Step 2: Process step info truncation — show full path on hover, optimize display**

Tool summaries like "330 files in kb2-learn-prd/B-2-创意和想..." are truncated. Add `title` attribute for full text on hover.
In `ToolRow`, add `title={step.summary}` to the summary span.

- [ ] **Step 3: Duration display — show ms instead of s when < 1s**

When duration is 0.0s, show `<1ms` or just hide. In `ToolRow` duration display:
```tsx
const dur = (step.endedAt - step.startedAt);
const durStr = dur < 100 ? '<0.1s' : `${(dur / 1000).toFixed(1)}s`;
```

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/ui/view/quick-search/components/V2ProcessView.tsx
git commit -m "fix(v2-ui): report evolution clickable, tool info truncation, duration display"
```

---

### Task 7: UI Fixes — Report View header improvements

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx` or `tab-AISearch.tsx`
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx`

User feedback from Image 47:

- [ ] **Step 1: Input field → report title after completion**

Once analysis completes, the top input bar should show the generated report title (not the editable query). The original query should appear as a small subtitle or on hover. 

In `tab-AISearch.tsx`, when `isV2Active && analysisCompleted`, replace the input with a title display:
- Show `searchSessionStore.title` or first line of `v2ProposedOutline` as the title
- Show original query as `pktw-text-xs pktw-text-[#9ca3af]` subtitle
- Input should be disabled / read-only

- [ ] **Step 2: Auto-save indicator**

The Copy and Save icons in the footer should show whether auto-save has occurred. If `autoSaveState.lastSavedPath` exists, show a subtle "Saved" indicator or the file icon.

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/ui/view/quick-search/tab-AISearch.tsx
git commit -m "fix(v2-ui): show report title instead of query input after completion"
```

---

### Task 8: UI Fixes — Sources view improvements

**Files:**
- Modify: `src/ui/view/quick-search/components/V2SourcesView.tsx`

User feedback from Image 48-49:

- [ ] **Step 1: Add sorting and grouping options to Sources list**

Sources should be sortable by name and groupable by folder. Add sort/group controls:
- Default: group by folder (extract folder path from `source.path`)
- Show folder group headers with file count

In `V2SourcesView`, add grouping logic:
```tsx
const grouped = useMemo(() => {
    const map = new Map<string, V2Source[]>();
    for (const src of sources) {
        const folder = src.path.split('/').slice(0, -1).join('/') || '/';
        const list = map.get(folder) ?? [];
        list.push(src);
        map.set(folder, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}, [sources]);
```

Render with folder group headers:
```tsx
{grouped.map(([folder, items]) => (
    <div key={folder}>
        <div className="pktw-text-xs pktw-text-[#9ca3af] pktw-font-mono pktw-py-1 pktw-px-1 pktw-mt-2">
            {folder} ({items.length})
        </div>
        {items.map((source, i) => <SourceCard ... />)}
    </div>
))}
```

- [ ] **Step 2: Remove Evidence tab**

User says "evidence 可以删除了我觉得". Remove the `evidence` option from `viewModes` array and the evidence rendering block.

- [ ] **Step 3: Graph view — implement basic AI-generated relationship graph**

Replace "Graph view coming soon" placeholder with an actual graph using `@xyflow/react`:
- Nodes: each source as a node
- Edges: group by folder proximity and query relevance
- Layout: force-directed or hierarchical
- Keep it simple and readable — don't overload with information

This is a larger sub-task. For now, generate a Mermaid diagram of source relationships and render it via StreamdownIsolated:
```tsx
function SourcesGraph({ sources }: { sources: V2Source[] }) {
    const mermaid = useMemo(() => {
        // Group sources by folder, create a mindmap
        const folders = new Map<string, string[]>();
        for (const s of sources) {
            const folder = s.path.split('/')[0] || 'root';
            const list = folders.get(folder) ?? [];
            list.push(s.title);
            folders.set(folder, list);
        }
        let md = '```mermaid\nmindmap\n  root((Sources))\n';
        for (const [folder, titles] of folders) {
            md += `    ${folder}\n`;
            for (const t of titles.slice(0, 5)) {
                md += `      ${t.slice(0, 20)}\n`;
            }
        }
        md += '```';
        return md;
    }, [sources]);
    return <StreamdownIsolated>{mermaid}</StreamdownIsolated>;
}
```

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/ui/view/quick-search/components/V2SourcesView.tsx
git commit -m "feat(v2-ui): sources folder grouping, remove evidence tab, basic graph view"
```

---

## Deferred Items (require architecture changes, not in this plan)

| Item | Why deferred | Prerequisite |
|------|-------------|-------------|
| Multi-round agent loop (append follow-up steps below existing) | Requires `performAnalysis` to support "append" mode without `resetAll()` | Store redesign for multi-round sessions |
| Report Evolution timeline (V1→V2→Current with multiple entries) | Requires tracking multiple report versions per session | Multi-round support |
| HITL plan approval (user reviews plan before report generates) | Requires UI for plan display + approve/reject + resume agent | `v2PlanSections` field (added in Task 4) + new UI component |
| Per-section streaming (generate sections one at a time with progress) | Requires multiple `query()` calls or structured output parsing | Agent SDK streaming architecture |
| Source badges + P/S/A scores | Requires scoring model or structured output from agent | Schema changes to `V2Source` |
| Full @xyflow/react graph for Sources | Requires node/edge data model + layout algorithm | V2Source relationship data from agent |
