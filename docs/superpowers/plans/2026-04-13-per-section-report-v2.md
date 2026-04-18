# Per-Section Report Generation v2 — Bug Fix + Multi-Agent Implementation Plan
> **STATUS: SUPERSEDED**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken plan_ready flow so plan review UI shows, then implement multi-agent parallel report generation with visual blueprint and mermaid fix agents.

**Architecture:** Agent SDK `query()` searches → yields `complete` event → status `plan_ready` → user reviews plan → ReportOrchestrator runs 3 parallel agent passes per section (content → visual blueprint → mermaid fix) via `streamText`, then generates executive summary.

**Tech Stack:** Vercel AI SDK (`streamText`), Zustand store, React

**Previous plan:** `docs/superpowers/plans/2026-04-13-per-section-report-generation.md` — store, schema, playbook, UI components are DONE. This plan fixes the flow bug and rewrites the orchestrator.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/service/agents/VaultSearchAgentSDK.ts:330` | Modify | Yield `complete` event instead of only `pk-debug` |
| `src/service/agents/report/ReportOrchestrator.ts` | **Rewrite** | Multi-agent orchestrator: content → visual → mermaid fix → summary |
| `templates/prompts/ai-analysis-report-visual-system.md` | **Create** | Visual blueprint agent system prompt |
| `templates/prompts/ai-analysis-report-visual.md` | **Create** | Visual blueprint agent user prompt |
| `templates/prompts/ai-analysis-mermaid-fix-system.md` | **Create** | Mermaid fix agent system prompt |
| `templates/prompts/ai-analysis-mermaid-fix.md` | **Create** | Mermaid fix agent user prompt |
| `src/service/prompt/PromptId.ts` | Modify | Register 4 new prompt IDs |
| `src/ui/view/quick-search/hooks/useSearchSession.ts:1015` | Modify | Clean up plan_ready logic |

---

### Task 1: Fix — VaultSearchAgentSDK must yield `complete` event

**Files:**
- Modify: `src/service/agents/VaultSearchAgentSDK.ts:330`

The root cause of the broken flow: `startSession()` ends with a `pk-debug` event (line 330), but `routeEvent` in `useSearchSession.ts` only sets `plan_ready` in `case 'complete':`. Since no `complete` event is ever yielded, `plan_ready` is never set via the primary path.

- [ ] **Step 1: Add complete event yield**

In `VaultSearchAgentSDK.ts`, replace the final `pk-debug` yield (lines 329–338) with a proper `complete` event followed by the debug marker:

```ts
        // 8. Emit complete event (triggers plan_ready in routeEvent if plan_sections exist)
        const totalDuration = Date.now() - startTs;
        yield {
            type: 'complete',
            triggerName,
            durationMs: totalDuration,
            result: undefined,
        } as LLMStreamEvent;

        // Debug marker
        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-complete',
            triggerName,
            extra: {
                submittedPlans: pendingSubmits.length,
                totalPaths: pendingSubmits.flatMap((p) => p.selected_paths).length,
            },
        } as LLMStreamEvent;
```

Also capture `startTs` at the beginning of `startSession()`. Find where `const triggerName = StreamTriggerName.SEARCH_AI_AGENT;` is (line 77) and add after it:

```ts
        const startTs = Date.now();
```

- [ ] **Step 2: Simplify the finally block in useSearchSession**

In `useSearchSession.ts`, the finally block (line 1012–1021) was patched with a `plan_ready` fallback. Now that `complete` is yielded properly, simplify the finally block back to its original guard — the `case 'complete':` handler will handle `plan_ready`:

```ts
            // Guard: only mark completed if not already done AND not waiting for HITL or plan review
            const finalStatus = store.getState().status;
            if (!store.getState().getIsCompleted() && !store.getState().hitlState && finalStatus !== 'plan_ready') {
                store.getState().markCompleted();
                markAIAnalysisCompleted();
            }
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/VaultSearchAgentSDK.ts src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "fix: VaultSearchAgentSDK yields complete event, fixes plan_ready flow"
```

---

### Task 2: Prompt templates — Visual blueprint and mermaid fix

**Files:**
- Create: `templates/prompts/ai-analysis-report-visual-system.md`
- Create: `templates/prompts/ai-analysis-report-visual.md`
- Create: `templates/prompts/ai-analysis-mermaid-fix-system.md`
- Create: `templates/prompts/ai-analysis-mermaid-fix.md`
- Modify: `src/service/prompt/PromptId.ts`

- [ ] **Step 1: Create visual blueprint system prompt**

Create `templates/prompts/ai-analysis-report-visual-system.md`:

```markdown
You are a data visualization specialist. Given a report section's content and its prescribed visualization type, generate exactly ONE Mermaid diagram that best communicates the section's key insight.

Rules:
- Output ONLY the Mermaid code block (```mermaid ... ```), no other text
- The diagram must directly support the section's conclusion — not decorative
- Match the prescribed visual_type exactly

Mermaid Safety Rules (CRITICAL — violation causes render failure):
- All node labels in double quotes: `N1["Label text"]`
- Labels ≤ 15 characters; insert `<br/>` every 10-15 chars for longer text
- Max 4 edges per node
- Max 15 nodes per diagram
- `quadrantChart` axis labels: single words only, no spaces
- No raw `[`, `(`, `"`, `:`, `;` inside labels — they break the Mermaid parser
- Conflict edges: dashed + red (`-.->` with `linkStyle N stroke:#e11d48`)

Shape Semantics (flowchart only):
- `(())` = core tension / nucleus
- `{ }` = decision / trade-off
- `()` = concrete evidence

CRITICAL: Labels must be in the SAME LANGUAGE as the section content.
```

- [ ] **Step 2: Create visual blueprint user prompt**

Create `templates/prompts/ai-analysis-report-visual.md`:

```markdown
## Section Title
{{{sectionTitle}}}

## Prescribed Visualization Type
{{{visualType}}}

## Section Content
{{{sectionContent}}}

Generate a single Mermaid diagram (type: {{{visualType}}}) that visualizes the key finding of this section. Output only the ```mermaid code block.
```

- [ ] **Step 3: Create mermaid fix system prompt**

Create `templates/prompts/ai-analysis-mermaid-fix-system.md`:

```markdown
You are a Mermaid diagram syntax fixer. Given a broken Mermaid diagram and the error message, fix the syntax so it renders correctly.

Rules:
- Output ONLY the fixed Mermaid code block (```mermaid ... ```), no other text
- Preserve the original diagram's intent and structure
- Apply these safety rules:
  - All node labels in double quotes: `N1["Label text"]`
  - Labels ≤ 15 characters; insert `<br/>` for longer text
  - Max 4 edges per node, max 15 nodes
  - No raw `[`, `(`, `"`, `:`, `;` inside labels
  - `quadrantChart` axis labels: single words only
- If the diagram is fundamentally broken beyond repair, output a simple mindmap that captures the same concepts
```

- [ ] **Step 4: Create mermaid fix user prompt**

Create `templates/prompts/ai-analysis-mermaid-fix.md`:

```markdown
## Broken Mermaid Diagram
{{{brokenMermaid}}}

## Error Message
{{{errorMessage}}}

Fix this Mermaid diagram so it renders correctly. Output only the fixed ```mermaid code block.
```

- [ ] **Step 5: Register new PromptIds**

In `src/service/prompt/PromptId.ts`, after the existing `AiAnalysisReportSection` entries:

Add to enum:
```ts
    AiAnalysisReportVisualSystem = 'ai-analysis-report-visual-system',
    AiAnalysisReportVisual = 'ai-analysis-report-visual',
    AiAnalysisMermaidFixSystem = 'ai-analysis-mermaid-fix-system',
    AiAnalysisMermaidFix = 'ai-analysis-mermaid-fix',
```

Add to the user-template array (where `PromptId.AiAnalysisReportSection` was added):
```ts
    PromptId.AiAnalysisReportVisual,
    PromptId.AiAnalysisMermaidFix,
```

Add to the template variables type map:
```ts
    [PromptId.AiAnalysisReportVisualSystem]: Record<string, never>;
    [PromptId.AiAnalysisReportVisual]: {
        sectionTitle: string;
        visualType: string;
        sectionContent: string;
    };
    [PromptId.AiAnalysisMermaidFixSystem]: Record<string, never>;
    [PromptId.AiAnalysisMermaidFix]: {
        brokenMermaid: string;
        errorMessage: string;
    };
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add templates/prompts/ai-analysis-report-visual-system.md templates/prompts/ai-analysis-report-visual.md templates/prompts/ai-analysis-mermaid-fix-system.md templates/prompts/ai-analysis-mermaid-fix.md src/service/prompt/PromptId.ts
git commit -m "feat(prompts): add visual blueprint and mermaid fix agent templates"
```

---

### Task 3: Rewrite ReportOrchestrator — Multi-agent parallel generation

**Files:**
- Rewrite: `src/service/agents/report/ReportOrchestrator.ts`

The current orchestrator only runs content generation. Rewrite to run 3 agent passes per section: content → visual blueprint (if needed) → mermaid fix (if needed), then summary.

- [ ] **Step 1: Rewrite ReportOrchestrator.ts**

Replace the full content of `src/service/agents/report/ReportOrchestrator.ts`:

```ts
import { streamText } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { V2Section } from '@/ui/view/quick-search/store/searchSessionStore';

/**
 * Multi-agent report orchestrator.
 *
 * Per section (parallel):
 *   1. Content Agent — streamText → section markdown
 *   2. Visual Blueprint Agent — streamText → mermaid diagram (if visual_type != 'none' and content lacks mermaid)
 *
 * After all sections:
 *   3. Summary Agent — streamText → executive summary
 *
 * On demand:
 *   - Mermaid Fix Agent — streamText → fix broken mermaid syntax
 *   - Section Regeneration — re-run content agent with optional user prompt
 */
export class ReportOrchestrator {
    private get mgr() {
        return AppContext.getInstance().aiServiceManager;
    }

    private get store() {
        return useSearchSessionStore;
    }

    // -----------------------------------------------------------------------
    // Evidence reader
    // -----------------------------------------------------------------------

    private async readEvidence(paths: string[]): Promise<string> {
        const vault = AppContext.getInstance().app.vault;
        const chunks: string[] = [];
        for (const p of paths) {
            const file = vault.getAbstractFileByPath(p);
            if (!file || !('extension' in file)) continue;
            try {
                const content = await vault.cachedRead(file as any);
                chunks.push(`### [[${p.replace(/\.md$/, '')}]]\n${content.slice(0, 3000)}`);
            } catch { /* skip unreadable */ }
        }
        return chunks.join('\n\n---\n\n');
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    async generateReport(
        sections: V2Section[],
        allEvidencePaths: string[],
        overview: string,
        userQuery: string,
    ): Promise<void> {
        // Mark all sections as generating
        for (const sec of sections) {
            this.store.getState().updatePlanSection(sec.id, (s) => ({ ...s, status: 'generating' }));
        }

        // Pass 1+2: content + visual per section, all in parallel
        await Promise.all(sections.map(async (sec) => {
            await this.runContentAgent(sec, sections, overview, userQuery);
            await this.runVisualAgent(sec);
        }));

        // Pass 3: executive summary (needs all sections completed first)
        await this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);
    }

    async regenerateSection(
        sectionId: string,
        allSections: V2Section[],
        overview: string,
        userQuery: string,
        userPrompt?: string,
    ): Promise<void> {
        this.store.getState().startSectionRegenerate(sectionId);
        const section = this.store.getState().v2PlanSections.find((s) => s.id === sectionId);
        if (!section) return;
        await this.runContentAgent(section, allSections, overview, userQuery, userPrompt);
        await this.runVisualAgent(section);
    }

    async fixMermaid(sectionId: string, brokenMermaid: string, errorMessage: string): Promise<string | null> {
        return this.runMermaidFixAgent(brokenMermaid, errorMessage);
    }

    // -----------------------------------------------------------------------
    // Agent 1: Content
    // -----------------------------------------------------------------------

    private async runContentAgent(
        section: V2Section,
        allSections: V2Section[],
        overview: string,
        userQuery: string,
        userPrompt?: string,
    ): Promise<void> {
        try {
            const evidenceContent = await this.readEvidence(section.evidencePaths);
            const otherSections = allSections
                .filter((s) => s.id !== section.id)
                .map((s) => `- ${s.title} (${s.contentType})`)
                .join('\n');

            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSectionSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisReportSection, {
                    userQuery,
                    reportOverview: overview,
                    sectionTitle: section.title,
                    contentType: section.contentType,
                    visualType: section.visualType,
                    sectionBrief: section.brief,
                    otherSections,
                    evidenceContent,
                    userPrompt: userPrompt ?? '',
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSectionSystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

            let fullText = '';
            for await (const chunk of result.textStream) {
                fullText += chunk;
                this.store.getState().appendSectionChunk(section.id, chunk);
            }

            this.store.getState().completeSectionContent(section.id, fullText);
        } catch (err: any) {
            this.store.getState().failSection(section.id, err?.message ?? 'Content generation failed');
        }
    }

    // -----------------------------------------------------------------------
    // Agent 2: Visual Blueprint
    // -----------------------------------------------------------------------

    private async runVisualAgent(section: V2Section): Promise<void> {
        // Skip if no visualization needed or content already has mermaid
        if (section.visualType === 'none') return;
        const currentContent = this.store.getState().v2PlanSections.find((s) => s.id === section.id)?.content ?? '';
        if (currentContent.includes('```mermaid')) return;

        try {
            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisReportVisualSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisReportVisual, {
                    sectionTitle: section.title,
                    visualType: section.visualType,
                    sectionContent: currentContent.slice(0, 2000),
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportVisualSystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

            let mermaidBlock = '';
            for await (const chunk of result.textStream) {
                mermaidBlock += chunk;
            }

            // Append mermaid to section content
            if (mermaidBlock.includes('```mermaid')) {
                const updatedContent = currentContent + '\n\n' + mermaidBlock.trim();
                this.store.getState().updatePlanSection(section.id, (s) => ({
                    ...s,
                    content: updatedContent,
                }));
            }
        } catch {
            // Visual generation is optional — don't fail the section
        }
    }

    // -----------------------------------------------------------------------
    // Agent 3: Summary
    // -----------------------------------------------------------------------

    private async runSummaryAgent(
        sections: V2Section[],
        allEvidencePaths: string[],
        overview: string,
        userQuery: string,
    ): Promise<void> {
        this.store.getState().setSummaryStreaming(true);

        try {
            // Read completed section content from store (may have visual appended)
            const currentSections = this.store.getState().v2PlanSections;
            const blocksSummary = currentSections
                .map((sec) => `### ${sec.title}\n${sec.content.slice(0, 300)}`)
                .join('\n\n');
            const evidenceList = allEvidencePaths
                .map((p) => `- [[${p.replace(/\.md$/, '')}]]`)
                .join('\n');

            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummarySystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummary, {
                    userQuery,
                    reportPlan: overview,
                    blocksSummary,
                    evidenceList,
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummarySystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

            let fullText = '';
            for await (const chunk of result.textStream) {
                fullText += chunk;
                this.store.getState().setSummary(fullText);
            }
        } catch {
            // Summary failure is non-fatal
        }

        this.store.getState().setSummaryStreaming(false);
    }

    // -----------------------------------------------------------------------
    // Agent 4: Mermaid Fix (on-demand)
    // -----------------------------------------------------------------------

    private async runMermaidFixAgent(brokenMermaid: string, errorMessage: string): Promise<string | null> {
        try {
            const [systemPrompt, userMessage] = await Promise.all([
                this.mgr.renderPrompt(PromptId.AiAnalysisMermaidFixSystem, {}),
                this.mgr.renderPrompt(PromptId.AiAnalysisMermaidFix, {
                    brokenMermaid,
                    errorMessage,
                }),
            ]);

            const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisMermaidFixSystem);
            const result = streamText({ model, system: systemPrompt, prompt: userMessage });

            let fixed = '';
            for await (const chunk of result.textStream) {
                fixed += chunk;
            }
            return fixed.includes('```mermaid') ? fixed.trim() : null;
        } catch {
            return null;
        }
    }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/service/agents/report/ReportOrchestrator.ts
git commit -m "feat: rewrite ReportOrchestrator with multi-agent parallel generation"
```

---

### Task 4: Integration build and manual test prep

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Verify end-to-end data flow**

Trace the flow conceptually:

1. `performAnalysis()` → `VaultSearchAgentSDK.startSession()` → agent searches vault
2. Agent calls `vault_submit_plan` with `plan_sections` → `routeEvent` `case 'tool-call':` extracts sections → `store.setPlanSections()`
3. Agent finishes → `startSession()` yields `type: 'complete'` → `routeEvent` `case 'complete':` checks `v2PlanSections.length > 0` → sets `status: 'plan_ready'`
4. `V2SearchResultView` useEffect: `status === 'plan_ready'` → `setV2View('report')`
5. `V2ReportView`: `status === 'plan_ready'` → renders `V2PlanReview`
6. User clicks "Generate Report" → `handleApprovePlan()` → `store.setState({ status: 'streaming' })`
7. `ReportOrchestrator.generateReport()`:
   - Per section (parallel): `runContentAgent()` streams chunks → `runVisualAgent()` appends mermaid
   - After all sections: `runSummaryAgent()` streams summary
8. `markCompleted()` → status `completed` → V2ReportView renders block cards with content

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: per-section report generation v2 — multi-agent with visual blueprint"
```

---

## Deferred Items

| Item | Why deferred |
|------|-------------|
| Mermaid fix auto-trigger on render failure | Needs mermaid render error callback from StreamdownIsolated |
| Section inline title editing in plan review | Current plan review works with delete/reorder |
| Section version diff UI | History stored, UI deferred |
| Per-section token usage tracking | Nice-to-have, not blocking |
