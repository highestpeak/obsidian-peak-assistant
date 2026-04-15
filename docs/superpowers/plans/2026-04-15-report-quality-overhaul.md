# Report Quality Overhaul Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 report quality issues: repetition bug, prompt contradictions, maxTokens cap, table enforcement, Executive Summary ordering, and UI weight-based layout.

**Architecture:** Prompt fixes (3 files), orchestrator bug fix + reorder (1 file), UI layout enhancement (1 file). Each task is independently testable.

**Tech Stack:** Handlebars templates, Vercel AI SDK `streamText`, React + Tailwind (`pktw-` prefix), Zustand

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/service/agents/report/ReportOrchestrator.ts:254-259` | Modify | Add repetition guard to `streamSectionContent`; lower `maxTokens`; reorder summary to run first |
| `templates/prompts/ai-analysis-report-section-system.md` | Modify | Enforce tables as MUST; lower word count to 100-180; tighten |
| `templates/prompts/ai-analysis-vault-report-summary-system.md` | Modify | Remove [[wikilink]] instruction; shorten to 150-250字 |
| `templates/prompts/ai-analysis-vault-report-summary.md` | Modify | Align wikilink rule with system prompt |
| `src/service/agents/vault-sdk/vaultMcpServer.ts:432` | Modify | Align title description with playbook |
| `src/ui/view/quick-search/components/V2ReportView.tsx` | Modify | Use weight field for card sizing; summary always on top |

---

### Task 1: Fix repetition bug in streamSectionContent

The main generation path (`streamSectionContent`) has no repetition guard — only the regeneration path (`runContentAgent`) does.

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts:254-263`

- [ ] **Step 1: Add AbortController + streamWithRepetitionGuard**

In `streamSectionContent`, replace the bare streaming loop (lines 254-263):

```ts
const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSection);
const result = streamText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    maxTokens: 2000,
});

for await (const chunk of result.textStream) {
    yield { type: 'text-delta', text: chunk, extra: { sectionId: section.id } } as LLMStreamEvent;
}
```

With:

```ts
const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSection);
const controller = new AbortController();
const result = streamText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    maxTokens: 800,
    abortSignal: controller.signal,
});

let fullText = '';
let lastCheckLen = 0;
for await (const chunk of result.textStream) {
    fullText += chunk;
    yield { type: 'text-delta', text: chunk, extra: { sectionId: section.id } } as LLMStreamEvent;
    // Inline repetition check every ~200 chars
    if (fullText.length - lastCheckLen > 200) {
        lastCheckLen = fullText.length;
        const truncAt = detectRepetition(fullText);
        if (truncAt > 0) {
            controller.abort();
            break;
        }
    }
}
```

Note: `maxTokens` lowered from `2000` to `800` (150-180 words in Chinese ≈ 300-500 tokens, 800 gives some headroom).

Add `detectRepetition` import at the top if not already present:
```ts
import { pLimit, streamWithRepetitionGuard, detectRepetition } from './stream-utils';
```

- [ ] **Step 2: Also lower summary maxTokens**

In `runSummaryAgent`, verify `maxTokens` is `1500`. Change to `600` (150-250字 ≈ 200-400 tokens).

Find the `streamText` call in `runSummaryAgent` and change `maxTokens: 1500` → `maxTokens: 600`.

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/service/agents/report/ReportOrchestrator.ts
git commit -m "fix(report): add repetition guard to streamSectionContent, lower maxTokens to 800/600"
```

---

### Task 2: Fix prompt contradictions and enforce tables

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section-system.md`
- Modify: `templates/prompts/ai-analysis-vault-report-summary-system.md`
- Modify: `templates/prompts/ai-analysis-vault-report-summary.md`
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts:432`

- [ ] **Step 1: Fix section system prompt — enforce tables, tighten word count**

In `templates/prompts/ai-analysis-report-section-system.md`, make these changes:

a) Change word count (find `**150-250 words**`):
```
- **100-180 words**. Every sentence must carry new information. Prefer tables and structured formats over prose.
```

b) Change the VISUALS section from:
```
# VISUALS
- Do NOT include any Mermaid diagrams or code blocks — a dedicated Visual Agent generates charts separately.
- You SHOULD use markdown tables when comparing items on multiple dimensions. Tables are your primary visual tool.
```
To:
```
# VISUALS
- Do NOT include Mermaid diagrams — a dedicated Visual Agent handles that.
- You MUST use a markdown table in every section that involves comparison, enumeration, or evaluation. Tables are your PRIMARY output format — not bullet lists.
- For action_plan/roadmap sections: use a table with columns (Step | Action | Owner/When).
- For risk_audit sections: use a table with columns (Risk | Impact | Mitigation).
- Default to tables. Only use bullet lists for 2 or fewer items.
```

- [ ] **Step 2: Fix summary prompts — remove wikilink contradiction**

In `templates/prompts/ai-analysis-vault-report-summary-system.md`, remove the wikilink instruction. Change:
```
- 用 [[wikilink]] 语法引用具体知识库笔记作为证据
```
To:
```
- 不要包含 [[wikilink]] 引用或参考文献列表 —— Sources 标签页已经处理了来源展示
```

Also change word count:
```
- 写约 200-400 字的连续散文
```
To:
```
- 写约 150-250 字的连续散文
```

In `templates/prompts/ai-analysis-vault-report-summary.md`, the last line already says no wikilinks — keep it. Remove the `{{{evidenceList}}}` block since summary no longer cites sources:

Replace:
```
## Evidence Used (source files)
{{{evidenceList}}}

Write a concise executive summary (~200-400 words, flowing prose, answer-first) that synthesizes the key findings for the user. Do NOT include [[wikilinks]] or references — the Sources tab handles that. CRITICAL: Write in the SAME LANGUAGE as the User Query.
```

With:
```
Write a concise executive summary (~150-250 words, flowing prose, answer-first) that synthesizes the key findings. No references or citations. CRITICAL: Write in the SAME LANGUAGE as the User Query.
```

- [ ] **Step 3: Align title schema with playbook**

In `src/service/agents/vault-sdk/vaultMcpServer.ts:432`, change:
```ts
title: z.string().describe('Short section title, max 40 chars. A concise label, NOT a full sentence.'),
```
To:
```ts
title: z.string().describe('Conclusion-as-heading: a short finding sentence, max 50 chars. E.g. "3 projects viable, PeakAssistant is fastest to revenue"'),
```

This aligns with playbook:150 while keeping titles short.

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add templates/prompts/ai-analysis-report-section-system.md templates/prompts/ai-analysis-vault-report-summary-system.md templates/prompts/ai-analysis-vault-report-summary.md src/service/agents/vault-sdk/vaultMcpServer.ts
git commit -m "fix(prompts): enforce tables, fix contradictions, tighten word counts"
```

---

### Task 3: Reorder pipeline — Summary first, then sections

Currently Executive Summary generates LAST (after all sections). Users can't see the report intro until everything finishes. Change: generate summary from the plan overview + evidence FIRST (before sections), so users see the report intro immediately.

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts:73-110`

- [ ] **Step 1: Move summary to run alongside sections (not after)**

Replace the current Pass 1 + Pass 2 block (lines 78-110):

```ts
// Pass 1: summary starts immediately (from plan overview, no need for section content)
// Pass 2: all sections stream in parallel
// Pass 3: visuals run after sections complete
const summaryPromise = this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);

const sectionAccumulators = new Map<string, string>();
const contentPromises = sections.map(async (sec) => {
    try {
        for await (const event of this.streamSectionContent(sec, sections, overview, userQuery)) {
            if (event.type === 'text-delta' && event.extra?.sectionId) {
                const id = event.extra.sectionId as string;
                const prev = sectionAccumulators.get(id) ?? '';
                sectionAccumulators.set(id, prev + event.text);
                this.store.getState().appendSectionChunk(id, event.text);
            }
        }
        const text = sectionAccumulators.get(sec.id) ?? '';
        if (text) {
            this.store.getState().completeSectionContent(sec.id, text);
        } else {
            this.store.getState().failSection(sec.id, 'No content generated');
        }
    } catch (err: any) {
        this.store.getState().failSection(sec.id, err?.message ?? 'Content generation failed');
    }
});

// Summary + sections run simultaneously
await Promise.all([summaryPromise, ...contentPromises]);

// Visuals run after all content is done
const limit = pLimit(3);
await Promise.all(sections.map((sec) => limit(async () => {
    await this.runVisualAgent(sec);
})));
```

The key change: `summaryPromise` starts BEFORE `contentPromises`, and they run in parallel via `Promise.all`. Summary only needs `overview` + `allEvidencePaths` (both available immediately), not section content.

- [ ] **Step 2: Update runSummaryAgent to not depend on section content**

In `runSummaryAgent`, the `blocksSummary` reads completed section content (lines 337-339):
```ts
const currentSections = this.store.getState().v2PlanSections;
const blocksSummary = currentSections
    .map((sec) => `### ${sec.title}\n${sec.content.slice(0, 300)}`)
    .join('\n\n');
```

Since summary now runs alongside sections (content not yet available), change to use section briefs instead:
```ts
const currentSections = this.store.getState().v2PlanSections;
const blocksSummary = currentSections
    .map((sec) => `### ${sec.title}\n${sec.brief}`)
    .join('\n\n');
```

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/service/agents/report/ReportOrchestrator.ts
git commit -m "perf(report): run summary alongside sections, not after; use briefs instead of content"
```

---

### Task 4: UI — weight-based card sizing

Currently all sections render as identical full-width cards. The `weight` field (1-10) exists in V2Section but is never used. Add visual hierarchy.

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx:200-210`

- [ ] **Step 1: Add weight-based CSS classes to section blocks container**

Replace the sections container (around line 200):

```tsx
{/* Section blocks */}
<div className="pktw-space-y-4">
    {sections.map((sec, i) => (
        <SectionBlock
            key={sec.id}
            section={sec}
            index={i}
            onRegenerate={onRegenerateSection}
        />
    ))}
</div>
```

With a grid layout that uses weight for sizing:

```tsx
{/* Section blocks — weight-based layout */}
<div className="pktw-grid pktw-grid-cols-2 pktw-gap-3">
    {sections.map((sec, i) => (
        <div key={sec.id} className={sec.weight >= 7 ? 'pktw-col-span-2' : 'pktw-col-span-2 sm:pktw-col-span-1'}>
            <SectionBlock
                section={sec}
                index={i}
                onRegenerate={onRegenerateSection}
            />
        </div>
    ))}
</div>
```

Logic:
- `weight >= 7` (full-width): `col-span-2` — always full width
- `weight < 7` (medium/small): `col-span-2 sm:col-span-1` — full width on narrow, half width on wider screens

- [ ] **Step 2: Build and commit**

```bash
npm run build
git add src/ui/view/quick-search/components/V2ReportView.tsx
git commit -m "feat(ui): weight-based grid layout for report sections"
```
