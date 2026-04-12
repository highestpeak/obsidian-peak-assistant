# Per-Section Report Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split report generation from monolithic agent output into orchestrator-driven per-section parallel generation with plan approval and section-level regeneration.

**Architecture:** Agent SDK `query()` only searches and outputs a structured plan via `vault_submit_plan`. After user approval, a new `ReportOrchestrator` generates each section independently via `streamText` in parallel, then generates the executive summary. Any section can be regenerated with an optional user prompt.

**Tech Stack:** Vercel AI SDK (`streamText`), Zustand store, React components, Handlebars prompt templates

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/service/agents/vault-sdk/vaultMcpServer.ts` | Modify | Add `plan_sections` to schema |
| `templates/prompts/ai-analysis-vault-sdk-playbook.md` | Modify | Agent outputs plan only, not report |
| `src/ui/view/quick-search/store/searchSessionStore.ts` | Modify | V2Section type, plan_ready status, new actions |
| `src/service/agents/report/ReportOrchestrator.ts` | **Create** | Per-section generation + regeneration |
| `templates/prompts/ai-analysis-report-section-system.md` | **Create** | Section generation system prompt |
| `templates/prompts/ai-analysis-report-section.md` | **Create** | Section generation user prompt |
| `src/service/prompt/PromptId.ts` | Modify | Register new prompt IDs |
| `src/ui/view/quick-search/hooks/useSearchSession.ts` | Modify | Wire plan → approval → generation |
| `src/ui/view/quick-search/components/V2PlanReview.tsx` | **Create** | Plan approval UI |
| `src/ui/view/quick-search/components/V2ReportView.tsx` | Modify | Block card rendering + regenerate |
| `src/ui/view/quick-search/components/V2ProcessView.tsx` | Modify | Section-level progress steps |
| `src/ui/view/quick-search/components/V2SearchResultView.tsx` | Modify | Route plan_ready to plan review |

---

### Task 1: Store — V2Section type and plan_ready status

**Files:**
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:20` (SessionStatus)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:96` (v2PlanSections type)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:229` (INITIAL_STATE)

- [ ] **Step 1: Replace V2Section type**

In `searchSessionStore.ts`, replace the current `v2PlanSections` type (line 96) with the full interface. Add it above `SearchSessionState`:

```ts
export interface V2Section {
	id: string;
	title: string;
	contentType: string;
	visualType: string;
	evidencePaths: string[];
	brief: string;
	weight: number;
	status: 'pending' | 'generating' | 'done' | 'error';
	content: string;
	streamingChunks: string[];
	error?: string;
	generations: Array<{ content: string; prompt?: string; timestamp: number }>;
}
```

Then change the field in `SearchSessionState`:
```ts
// FROM:
v2PlanSections: Array<{ title: string; contentType: string; visualType: string }>;
// TO:
v2PlanSections: V2Section[];
```

- [ ] **Step 2: Add `plan_ready` to SessionStatus**

At line 20, change:
```ts
// FROM:
export type SessionStatus = 'idle' | 'starting' | 'streaming' | 'completed' | 'error' | 'canceled';
// TO:
export type SessionStatus = 'idle' | 'starting' | 'streaming' | 'plan_ready' | 'completed' | 'error' | 'canceled';
```

- [ ] **Step 3: Add `v2Summary` field to state**

In `SearchSessionState` after `v2PlanSections`:
```ts
/** Executive summary markdown (generated after all sections complete) */
v2Summary: string;
v2SummaryStreaming: boolean;
```

In `INITIAL_STATE`:
```ts
v2Summary: '',
v2SummaryStreaming: false,
```

In `startSession` reset, add:
```ts
v2Summary: '',
v2SummaryStreaming: false,
```

- [ ] **Step 4: Add new actions to interface**

In `SearchSessionActions` (around line 148), add:
```ts
// Plan & section generation
setPlanSections: (sections: V2Section[]) => void;
updatePlanSection: (id: string, updater: (s: V2Section) => V2Section) => void;
reorderPlanSections: (ids: string[]) => void;
removePlanSection: (id: string) => void;
appendSectionChunk: (id: string, chunk: string) => void;
completeSectionContent: (id: string, content: string) => void;
failSection: (id: string, error: string) => void;
startSectionRegenerate: (id: string) => void;
setSummary: (text: string) => void;
setSummaryStreaming: (streaming: boolean) => void;
```

- [ ] **Step 5: Implement the actions**

After the existing V2 actions block (around line 535), add:

```ts
setPlanSections: (sections) => set({ v2PlanSections: sections }),

updatePlanSection: (id, updater) => set((s) => ({
	v2PlanSections: s.v2PlanSections.map((sec) => sec.id === id ? updater(sec) : sec),
})),

reorderPlanSections: (ids) => set((s) => {
	const map = new Map(s.v2PlanSections.map((sec) => [sec.id, sec]));
	return { v2PlanSections: ids.map((id) => map.get(id)!).filter(Boolean) };
}),

removePlanSection: (id) => set((s) => ({
	v2PlanSections: s.v2PlanSections.filter((sec) => sec.id !== id),
})),

appendSectionChunk: (id, chunk) => set((s) => ({
	v2PlanSections: s.v2PlanSections.map((sec) =>
		sec.id === id ? { ...sec, streamingChunks: [...sec.streamingChunks, chunk] } : sec
	),
})),

completeSectionContent: (id, content) => set((s) => ({
	v2PlanSections: s.v2PlanSections.map((sec) =>
		sec.id === id ? { ...sec, status: 'done' as const, content, streamingChunks: [] } : sec
	),
})),

failSection: (id, error) => set((s) => ({
	v2PlanSections: s.v2PlanSections.map((sec) =>
		sec.id === id ? { ...sec, status: 'error' as const, error } : sec
	),
})),

startSectionRegenerate: (id) => set((s) => ({
	v2PlanSections: s.v2PlanSections.map((sec) => {
		if (sec.id !== id) return sec;
		const prev = sec.content ? { content: sec.content, timestamp: Date.now() } : null;
		return {
			...sec,
			status: 'generating' as const,
			content: '',
			streamingChunks: [],
			error: undefined,
			generations: prev ? [...sec.generations, prev] : sec.generations,
		};
	}),
})),

setSummary: (text) => set({ v2Summary: text }),
setSummaryStreaming: (streaming) => set({ v2SummaryStreaming: streaming }),
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(store): V2Section type, plan_ready status, section generation actions"
```

---

### Task 2: Schema — Add plan_sections to vault_submit_plan

**Files:**
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts:273` (SubmitPlanInput interface)
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts:415` (Zod schema)

- [ ] **Step 1: Update SubmitPlanInput interface**

At line 273, add `plan_sections`:
```ts
export interface SubmitPlanInput {
    selected_paths: string[];
    rationale: string;
    proposed_outline: string;
    coverage_assessment: string;
    follow_up_questions?: string[];
    plan_sections?: Array<{
        id: string;
        title: string;
        content_type: string;
        visual_type: string;
        evidence_paths: string[];
        brief: string;
        weight: number;
    }>;
}
```

- [ ] **Step 2: Update Zod schema in tool() call**

At line 415, add `plan_sections` to the Zod schema:
```ts
plan_sections: z.array(z.object({
    id: z.string(),
    title: z.string().describe('Conclusion-as-heading for this section'),
    content_type: z.enum(['enumeration', 'comparison', 'analysis', 'recommendation', 'timeline']),
    visual_type: z.enum(['table', 'quadrantChart', 'flowchart', 'timeline', 'mindmap', 'none']),
    evidence_paths: z.array(z.string()).describe('Vault paths relevant to this section'),
    brief: z.string().describe('1-2 sentence description of section content'),
    weight: z.number().min(0).max(10).describe('Display weight: 1-3=small, 4-6=medium, 7-10=full-width'),
})).optional().describe('Structured report plan: 3-6 sections with content types and visual prescriptions'),
```

- [ ] **Step 3: Pass plan_sections through onSubmitPlan callback**

In the `async (input, _extra) =>` handler (line 422), add:
```ts
plan_sections: input.plan_sections,
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/vault-sdk/vaultMcpServer.ts
git commit -m "feat(schema): add plan_sections to vault_submit_plan"
```

---

### Task 3: Playbook — Agent outputs plan only

**Files:**
- Modify: `templates/prompts/ai-analysis-vault-sdk-playbook.md`

- [ ] **Step 1: Rewrite vault_submit_plan section**

Replace the `## vault_submit_plan Format` section at the end of the playbook with:

```markdown
## vault_submit_plan Format

Call `vault_submit_plan` with:
- `selected_paths`: array of all vault paths you found relevant
- `rationale`: per-path reasoning (one line each, format: "path: reasoning")
- `proposed_outline`: a 2-3 sentence overview of the report you would write (NOT the full report — that is generated separately)
- `plan_sections`: structured array of 3-6 report sections. For each:
  - `id`: unique section id ("s1", "s2", ...)
  - `title`: conclusion-as-heading (NOT a topic label — state the finding)
  - `content_type`: one of enumeration | comparison | analysis | recommendation | timeline
  - `visual_type`: mandated visualization — one of table | quadrantChart | flowchart | timeline | mindmap | none (see Section Plan mapping above)
  - `evidence_paths`: vault paths relevant to this specific section
  - `brief`: 1-2 sentence description of what to cover and why it matters
  - `weight`: display weight 1-10 (enumeration tables → 8-10, brief analysis → 3-5, overview → 5-7)
- `coverage_assessment`: map of each sub-question → answered/unanswered with source notes
- `follow_up_questions`: array of 3-5 context-specific follow-up question strings

**IMPORTANT**: Do NOT write the full report in `proposed_outline`. The report is generated section-by-section after this plan is approved. Your job is to search thoroughly and plan the report structure.
```

- [ ] **Step 2: Remove Report Format section from playbook**

The playbook's `## Report Format` section (which instructed the agent to write the full report) should be removed or replaced with a brief note:

```markdown
## Report Format (Reference for Plan Quality)

The report will be generated section-by-section after your plan is approved. Your plan_sections must be structured well enough for independent section generation:
- Each section title must be a conclusion (not a topic label)
- Each section must have the correct content_type and visual_type
- evidence_paths must be specific to what that section needs
- brief must clearly state what the section will analyze and why

The actual report writing rules (McKinsey SCQA, [[wikilink]] citations, Mermaid safety, language matching) are applied at generation time, not by you.
```

- [ ] **Step 3: Verify no Handlebars syntax issues**

Run: `grep -n '{{' templates/prompts/ai-analysis-vault-sdk-playbook.md`
Expected: Only `{{{vaultIntuition}}}` and `{{{probeResults}}}`.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add templates/prompts/ai-analysis-vault-sdk-playbook.md
git commit -m "feat(playbook): agent outputs structured plan only, not full report"
```

---

### Task 4: Prompt templates — Section generation prompts

**Files:**
- Create: `templates/prompts/ai-analysis-report-section-system.md`
- Create: `templates/prompts/ai-analysis-report-section.md`
- Modify: `src/service/prompt/PromptId.ts:215`

- [ ] **Step 1: Create section system prompt**

Create `templates/prompts/ai-analysis-report-section-system.md`:

```markdown
You are a direct, no-nonsense knowledge analyst writing ONE section of a structured report.

Rules:
- Write self-contained markdown for this section only — do not include a title heading (it is rendered separately)
- Start with a "**Why it matters**" paragraph (2-3 sentences on strategic implication)
- Follow with evidence and analysis appropriate to the content_type specified
- End with a "**What to do**" paragraph (clear action or recommendation) and optionally "**Risks/Blind spots**" (what could go wrong, what evidence is missing)
- Use [[wikilink]] syntax when referencing vault documents — every factual claim must have a citation
- If content_type is "enumeration": MUST include a comparison TABLE listing all found items with key attributes
- If visual_type is not "none": MUST include exactly one Mermaid diagram of the specified type
- Mermaid safety: all labels in double quotes, labels ≤15 chars, max 15 nodes, max 4 edges per node, no raw [ ( " : ; inside labels
- CRITICAL: Write in the SAME LANGUAGE as the user's query. Chinese query → Chinese section.
- CRITICAL: NEVER generate external URLs. Use [[wikilink]] syntax ONLY.
- CRITICAL: NEVER write disclaimers like "知识库中没有..." / "I couldn't find...". Synthesize what you have.
- CRITICAL: Use 你 (not 您) when addressing the user in Chinese. Friendly, direct tone.
```

- [ ] **Step 2: Create section user prompt template**

Create `templates/prompts/ai-analysis-report-section.md`:

```markdown
## User Query
{{{userQuery}}}

## Report Overview
{{{reportOverview}}}

## This Section
- **Title**: {{{sectionTitle}}}
- **Content type**: {{{contentType}}}
- **Required visualization**: {{{visualType}}}
- **Brief**: {{{sectionBrief}}}

## Other Sections in This Report (for context, do not write these)
{{{otherSections}}}

## Evidence for This Section
{{{evidenceContent}}}
{{#if userPrompt}}

## Additional Instructions
{{{userPrompt}}}
{{/if}}

Write the content for this section following the system rules. Do not include the section title as a heading — it is rendered separately.
```

- [ ] **Step 3: Register new PromptIds**

In `src/service/prompt/PromptId.ts`, after line 221 (AiAnalysisVaultReportSummary), add:

```ts
AiAnalysisReportSectionSystem = 'ai-analysis-report-section-system',
AiAnalysisReportSection = 'ai-analysis-report-section',
```

Also add to the array of promptIds that have user templates (around line 261):
```ts
PromptId.AiAnalysisReportSection,
```

And add the template variables type (around line 658):
```ts
[PromptId.AiAnalysisReportSectionSystem]: Record<string, never>;
[PromptId.AiAnalysisReportSection]: {
    userQuery: string;
    reportOverview: string;
    sectionTitle: string;
    contentType: string;
    visualType: string;
    sectionBrief: string;
    otherSections: string;
    evidenceContent: string;
    userPrompt?: string;
};
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add templates/prompts/ai-analysis-report-section-system.md templates/prompts/ai-analysis-report-section.md src/service/prompt/PromptId.ts
git commit -m "feat(prompts): add per-section report generation templates and PromptIds"
```

---

### Task 5: ReportOrchestrator — Per-section generation

**Files:**
- Create: `src/service/agents/report/ReportOrchestrator.ts`

- [ ] **Step 1: Create ReportOrchestrator**

```ts
import { streamText } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { V2Section } from '@/ui/view/quick-search/store/searchSessionStore';

export class ReportOrchestrator {
	private get aiServiceManager() {
		return AppContext.getInstance().aiServiceManager;
	}

	/**
	 * Read vault note content for given paths.
	 * Uses the Obsidian vault API directly (same as vaultMcpServer).
	 */
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

	/**
	 * Generate all sections in parallel, then generate executive summary.
	 */
	async generateReport(
		sections: V2Section[],
		allEvidencePaths: string[],
		overview: string,
		userQuery: string,
	): Promise<void> {
		const store = useSearchSessionStore;

		// Mark all sections as generating
		for (const sec of sections) {
			store.getState().updatePlanSection(sec.id, (s) => ({ ...s, status: 'generating' }));
		}

		// Generate body sections in parallel
		await Promise.all(sections.map((sec) => this.generateSection(sec, sections, overview, userQuery)));

		// Generate executive summary after all sections complete
		await this.generateSummary(sections, allEvidencePaths, overview, userQuery);
	}

	/**
	 * Generate a single section via streamText.
	 */
	async generateSection(
		section: V2Section,
		allSections: V2Section[],
		overview: string,
		userQuery: string,
		userPrompt?: string,
	): Promise<void> {
		const store = useSearchSessionStore;
		const mgr = this.aiServiceManager;

		try {
			const evidenceContent = await this.readEvidence(section.evidencePaths);
			const otherSections = allSections
				.filter((s) => s.id !== section.id)
				.map((s) => `- ${s.title} (${s.contentType})`)
				.join('\n');

			const [systemPrompt, userMessage] = await Promise.all([
				mgr.renderPrompt(PromptId.AiAnalysisReportSectionSystem, {}),
				mgr.renderPrompt(PromptId.AiAnalysisReportSection, {
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

			const { model } = mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSectionSystem);
			const result = streamText({
				model,
				system: systemPrompt,
				prompt: userMessage,
			});

			let fullText = '';
			for await (const chunk of result.textStream) {
				fullText += chunk;
				store.getState().appendSectionChunk(section.id, chunk);
			}

			store.getState().completeSectionContent(section.id, fullText);
		} catch (err: any) {
			store.getState().failSection(section.id, err?.message ?? 'Generation failed');
		}
	}

	/**
	 * Regenerate a single section with optional user prompt.
	 */
	async regenerateSection(
		sectionId: string,
		allSections: V2Section[],
		overview: string,
		userQuery: string,
		userPrompt?: string,
	): Promise<void> {
		const store = useSearchSessionStore;
		store.getState().startSectionRegenerate(sectionId);

		const section = store.getState().v2PlanSections.find((s) => s.id === sectionId);
		if (!section) return;

		await this.generateSection(section, allSections, overview, userQuery, userPrompt);
	}

	/**
	 * Generate executive summary after all body sections are complete.
	 * Reuses V1's summary approach: blocksSummary = first 300 chars per section.
	 */
	private async generateSummary(
		sections: V2Section[],
		allEvidencePaths: string[],
		overview: string,
		userQuery: string,
	): Promise<void> {
		const store = useSearchSessionStore;
		const mgr = this.aiServiceManager;

		store.getState().setSummaryStreaming(true);

		const blocksSummary = sections
			.map((sec) => `### ${sec.title}\n${sec.content.slice(0, 300)}`)
			.join('\n\n');

		const evidenceList = allEvidencePaths
			.map((p) => `- [[${p.replace(/\.md$/, '')}]]`)
			.join('\n');

		const [systemPrompt, userMessage] = await Promise.all([
			mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummarySystem, {}),
			mgr.renderPrompt(PromptId.AiAnalysisVaultReportSummary, {
				userQuery,
				reportPlan: overview,
				blocksSummary,
				evidenceList,
			}),
		]);

		const { model } = mgr.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummarySystem);
		const result = streamText({ model, system: systemPrompt, prompt: userMessage });

		let fullText = '';
		for await (const chunk of result.textStream) {
			fullText += chunk;
			store.getState().setSummary(fullText);
		}

		store.getState().setSummaryStreaming(false);
	}
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/service/agents/report/ReportOrchestrator.ts
git commit -m "feat: add ReportOrchestrator for per-section parallel generation"
```

---

### Task 6: Hook — Wire plan extraction and report generation

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts:792`

- [ ] **Step 1: Extract plan_sections from vault_submit_plan**

In `useSearchSession.ts`, find the `if (shortName === 'vault_submit_plan')` block (line 792). After the existing `v2FollowUpQuestions` extraction, add plan_sections handling:

```ts
// Extract structured plan sections
const planSections = input.plan_sections;
if (Array.isArray(planSections) && planSections.length > 0) {
    const sections: V2Section[] = planSections.map((ps: any) => ({
        id: ps.id ?? `s${Math.random().toString(36).slice(2, 6)}`,
        title: ps.title ?? '',
        contentType: ps.content_type ?? 'analysis',
        visualType: ps.visual_type ?? 'none',
        evidencePaths: Array.isArray(ps.evidence_paths) ? ps.evidence_paths : [],
        brief: ps.brief ?? '',
        weight: typeof ps.weight === 'number' ? ps.weight : 5,
        status: 'pending' as const,
        content: '',
        streamingChunks: [],
        generations: [],
    }));
    store.getState().setPlanSections(sections);
}
```

Add the import at the top:
```ts
import type { V2Section } from '../store/searchSessionStore';
```

- [ ] **Step 2: Set status to plan_ready when agent completes with plan sections**

Find where `markCompleted()` is called after the agent query finishes (around line 662). Before `markCompleted()`, add a check:

```ts
const hasPlan = store.getState().v2PlanSections.length > 0;
if (hasPlan) {
    // Don't mark completed — mark plan_ready instead
    set({ status: 'plan_ready', isInputFrozen: false });
    return; // skip markCompleted
}
```

Note: `set` refers to the store's set. Use `store.setState({ status: 'plan_ready', isInputFrozen: false })` if outside the store.

- [ ] **Step 3: Add handleApprovePlan callback**

After the `performAnalysis` callback definition (around line 839), add:

```ts
const reportOrchestrator = useMemo(() => new ReportOrchestrator(), []);

const handleApprovePlan = useCallback(async () => {
    const state = store.getState();
    const sections = state.v2PlanSections;
    if (sections.length === 0) return;

    store.setState({ status: 'streaming' });

    try {
        await reportOrchestrator.generateReport(
            sections,
            state.v2Sources.map((s) => s.path),
            state.v2ProposedOutline ?? '',
            state.query,
        );
        store.getState().markCompleted();
    } catch (err: any) {
        store.getState().recordError(err?.message ?? 'Report generation failed');
    }
}, []);
```

Add import:
```ts
import { ReportOrchestrator } from '@/service/agents/report/ReportOrchestrator';
```

- [ ] **Step 4: Add handleRegenerateSection callback**

```ts
const handleRegenerateSection = useCallback(async (sectionId: string, userPrompt?: string) => {
    const state = store.getState();
    try {
        await reportOrchestrator.regenerateSection(
            sectionId,
            state.v2PlanSections,
            state.v2ProposedOutline ?? '',
            state.query,
            userPrompt,
        );
    } catch (err: any) {
        store.getState().failSection(sectionId, err?.message ?? 'Regeneration failed');
    }
}, []);
```

- [ ] **Step 5: Export the new callbacks**

Add `handleApprovePlan` and `handleRegenerateSection` to the return object (around line 1017):
```ts
return { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection };
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "feat(hook): wire plan extraction, approve, and section regeneration"
```

---

### Task 7: UI — Plan approval component

**Files:**
- Create: `src/ui/view/quick-search/components/V2PlanReview.tsx`

- [ ] **Step 1: Create V2PlanReview component**

```tsx
import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/ui/component/shadcn/button';
import { useSearchSessionStore } from '../store/searchSessionStore';

const CONTENT_TYPE_LABELS: Record<string, string> = {
	enumeration: 'Enumeration',
	comparison: 'Comparison',
	analysis: 'Analysis',
	recommendation: 'Recommendation',
	timeline: 'Timeline',
};

const VISUAL_TYPE_LABELS: Record<string, string> = {
	table: 'Table',
	quadrantChart: 'Quadrant',
	flowchart: 'Flowchart',
	timeline: 'Timeline',
	mindmap: 'Mindmap',
	none: 'None',
};

interface V2PlanReviewProps {
	onApprove: () => void;
}

export const V2PlanReview: React.FC<V2PlanReviewProps> = ({ onApprove }) => {
	const sections = useSearchSessionStore((s) => s.v2PlanSections);
	const overview = useSearchSessionStore((s) => s.v2ProposedOutline);
	const removePlanSection = useSearchSessionStore((s) => s.removePlanSection);
	const reorderPlanSections = useSearchSessionStore((s) => s.reorderPlanSections);
	const updatePlanSection = useSearchSessionStore((s) => s.updatePlanSection);

	const moveSection = useCallback((id: string, direction: -1 | 1) => {
		const ids = sections.map((s) => s.id);
		const idx = ids.indexOf(id);
		if (idx < 0) return;
		const newIdx = idx + direction;
		if (newIdx < 0 || newIdx >= ids.length) return;
		[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
		reorderPlanSections(ids);
	}, [sections, reorderPlanSections]);

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-px-1 pktw-py-3">
			{/* Overview */}
			{overview && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-xl pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-mb-4">
					<span className="pktw-text-sm pktw-text-[#6b7280]">{overview}</span>
				</div>
			)}

			{/* Section cards */}
			<div className="pktw-space-y-2 pktw-mb-4">
				{sections.map((sec, i) => (
					<motion.div
						key={sec.id}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: i * 0.05 }}
						className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-p-3 pktw-flex pktw-items-start pktw-gap-3 pktw-group"
					>
						{/* Reorder buttons */}
						<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-shrink-0 pktw-pt-0.5">
							<div
								onClick={() => moveSection(sec.id, -1)}
								className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${i === 0 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}
							>
								<ChevronUp className="pktw-w-3.5 pktw-h-3.5" />
							</div>
							<div
								onClick={() => moveSection(sec.id, 1)}
								className={`pktw-p-0.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors ${i === sections.length - 1 ? 'pktw-text-[#e5e7eb]' : 'pktw-text-[#9ca3af] hover:pktw-text-[#6b7280]'}`}
							>
								<ChevronDown className="pktw-w-3.5 pktw-h-3.5" />
							</div>
						</div>

						{/* Content */}
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
								<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">{sec.title}</span>
							</div>
							<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1.5">
								<span className="pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-bg-purple-100 pktw-text-[#7c3aed] pktw-rounded">
									{CONTENT_TYPE_LABELS[sec.contentType] ?? sec.contentType}
								</span>
								{sec.visualType !== 'none' && (
									<span className="pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-bg-blue-100 pktw-text-blue-700 pktw-rounded">
										{VISUAL_TYPE_LABELS[sec.visualType] ?? sec.visualType}
									</span>
								)}
								<span className="pktw-text-[10px] pktw-text-[#9ca3af]">
									{sec.evidencePaths.length} sources
								</span>
							</div>
							<span className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed">{sec.brief}</span>
						</div>

						{/* Delete button */}
						<div
							onClick={() => removePlanSection(sec.id)}
							className="pktw-p-1 pktw-rounded pktw-text-[#e5e7eb] group-hover:pktw-text-[#9ca3af] hover:!pktw-text-red-500 pktw-cursor-pointer pktw-transition-colors pktw-shrink-0"
						>
							<Trash2 className="pktw-w-3.5 pktw-h-3.5" />
						</div>
					</motion.div>
				))}
			</div>

			{/* Generate button */}
			<Button
				onClick={onApprove}
				className="pktw-w-full pktw-bg-[#7c3aed] hover:pktw-bg-[#6d28d9] pktw-text-white pktw-font-medium"
			>
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-mr-2" />
				Generate Report ({sections.length} sections)
			</Button>
		</motion.div>
	);
};
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2PlanReview.tsx
git commit -m "feat(ui): add V2PlanReview component for plan approval"
```

---

### Task 8: UI — Report View with block cards and regeneration

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx`

- [ ] **Step 1: Rewrite V2ReportView for per-section rendering**

Replace the entire file content:

```tsx
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Copy, Check, Sparkles, Loader2 } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Section } from '../store/searchSessionStore';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';
import { V2PlanReview } from './V2PlanReview';

interface V2ReportViewProps {
	onClose?: () => void;
	onApprove?: () => void;
	onRegenerateSection?: (id: string, prompt?: string) => void;
}

/** Single section block card — matches V1's DashboardBlocksSection visual */
const SectionBlock: React.FC<{
	section: V2Section;
	index: number;
	onRegenerate?: (id: string, prompt?: string) => void;
}> = ({ section, index, onRegenerate }) => {
	const [showPrompt, setShowPrompt] = useState(false);
	const [prompt, setPrompt] = useState('');
	const [copied, setCopied] = useState(false);

	const content = section.status === 'generating'
		? section.streamingChunks.join('')
		: section.content;

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(`## ${section.title}\n\n${section.content}`);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	}, [section]);

	const handleRegenerate = useCallback(() => {
		if (showPrompt && prompt.trim()) {
			onRegenerate?.(section.id, prompt.trim());
			setPrompt('');
			setShowPrompt(false);
		} else {
			setShowPrompt(!showPrompt);
		}
	}, [showPrompt, prompt, section.id, onRegenerate]);

	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
			className="pktw-bg-[#f9fafb] pktw-rounded-xl pktw-p-5 pktw-border pktw-border-[#e5e7eb] pktw-flex pktw-flex-col pktw-group pktw-w-full"
		>
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#374151] pktw-flex-1">
					{section.title}
				</span>
				<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity">
					{section.status === 'done' && (
						<>
							<div
								onClick={handleCopy}
								className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer hover:pktw-bg-[#f5f3ff] pktw-transition-colors"
								title="Copy section"
							>
								{copied ? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" /> : <Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />}
							</div>
							<div
								onClick={handleRegenerate}
								className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer hover:pktw-bg-[#f5f3ff] pktw-transition-colors"
								title="Regenerate section"
							>
								<RefreshCw className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
							</div>
						</>
					)}
					{section.status === 'generating' && (
						<Loader2 className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed] pktw-animate-spin" />
					)}
				</div>
			</div>

			{/* Regeneration prompt input */}
			<AnimatePresence>
				{showPrompt && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						className="pktw-mb-3 pktw-overflow-hidden"
					>
						<div className="pktw-flex pktw-gap-2">
							<input
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Enter') handleRegenerate(); }}
								placeholder="Describe what to change..."
								className="pktw-flex-1 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/50"
								autoFocus
							/>
							<div
								onClick={() => { onRegenerate?.(section.id, prompt.trim() || undefined); setPrompt(''); setShowPrompt(false); }}
								className="pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-text-white pktw-bg-[#7c3aed] pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-[#6d28d9]"
							>
								Regenerate
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Content */}
			{(content || section.status === 'generating') && (
				<StreamdownIsolated isAnimating={section.status === 'generating'} className="pktw-select-text pktw-break-words">
					{content}
				</StreamdownIsolated>
			)}

			{/* Error */}
			{section.status === 'error' && section.error && (
				<div className="pktw-text-xs pktw-text-red-500 pktw-mt-2">{section.error}</div>
			)}
		</motion.div>
	);
};

export const V2ReportView: React.FC<V2ReportViewProps> = ({ onClose, onApprove, onRegenerateSection }) => {
	const status = useSearchSessionStore((s) => s.status);
	const sections = useSearchSessionStore((s) => s.v2PlanSections);
	const summary = useSearchSessionStore((s) => s.v2Summary);
	const summaryStreaming = useSearchSessionStore((s) => s.v2SummaryStreaming);

	// Plan review mode
	if (status === 'plan_ready') {
		return <V2PlanReview onApprove={onApprove ?? (() => {})} />;
	}

	// No sections yet — fallback (shouldn't happen in normal flow)
	if (sections.length === 0 && !summary) return null;

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-px-1 pktw-py-2">
			{/* Executive Summary */}
			{(summary || summaryStreaming) && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-xl pktw-p-5 pktw-border pktw-border-[#e5e7eb] pktw-mb-4">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Executive Summary</span>
						{summaryStreaming && <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed] pktw-animate-spin" />}
					</div>
					<StreamdownIsolated isAnimating={summaryStreaming} className="pktw-select-text pktw-break-words">
						{summary}
					</StreamdownIsolated>
				</div>
			)}

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
		</motion.div>
	);
};
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2ReportView.tsx
git commit -m "feat(ui): V2ReportView with per-section block cards and regeneration"
```

---

### Task 9: UI — Wire V2SearchResultView and V2NavBar

**Files:**
- Modify: `src/ui/view/quick-search/components/V2SearchResultView.tsx`
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx` (pass callbacks)

- [ ] **Step 1: Update V2SearchResultView to pass callbacks**

In `V2SearchResultView.tsx`, add props for approve and regenerate:

```tsx
interface V2SearchResultViewProps {
    onClose?: () => void;
    onRetry?: () => void;
    onApprove?: () => void;
    onRegenerateSection?: (id: string, prompt?: string) => void;
}
```

Pass them to `V2ReportView`:
```tsx
{activeView === 'report' && (
    <V2ReportView
        key="report"
        onClose={onClose}
        onApprove={onApprove}
        onRegenerateSection={onRegenerateSection}
    />
)}
```

Also add `plan_ready` to the view routing — when plan_ready and view is process, switch to report:
```tsx
useEffect(() => {
    const status = useSearchSessionStore.getState().status;
    if (status === 'plan_ready') {
        useSearchSessionStore.getState().setV2View('report');
    }
}, [useSearchSessionStore((s) => s.status)]);
```

- [ ] **Step 2: Pass callbacks from tab-AISearch.tsx**

In `tab-AISearch.tsx`, find where `V2SearchResultView` (or `SearchResultView`) is rendered. The `useSearchSession` hook returns `handleApprovePlan` and `handleRegenerateSection`. Pass them through:

```tsx
<SearchResultView
    onClose={onClose}
    onRetry={handleRetry}
    onApprove={handleApprovePlan}
    onRegenerateSection={handleRegenerateSection}
/>
```

Ensure `handleApprovePlan` and `handleRegenerateSection` are destructured from `useSearchSession()`.

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/V2SearchResultView.tsx src/ui/view/quick-search/tab-AISearch.tsx
git commit -m "feat(ui): wire plan approval and section regeneration callbacks"
```

---

### Task 10: Process View — Section generation steps

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ProcessView.tsx`

- [ ] **Step 1: Add section generation progress display**

After the `ReportEvolution` component (or replacing it), add a section progress display that shows during report generation:

In `V2ProcessView`, after the existing timeline rendering, add:

```tsx
{/* Section generation progress */}
{sections.length > 0 && status !== 'plan_ready' && (
    <div className="pktw-mt-3 pktw-space-y-1">
        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-1 pktw-mb-2">
            <Brain className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">
                Generating sections ({sections.filter((s) => s.status === 'done').length}/{sections.length})
            </span>
        </div>
        {sections.map((sec) => (
            <div key={sec.id} className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-0.5 pktw-px-1">
                {sec.status === 'done' ? (
                    <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-green-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
                        <Check className="pktw-w-2.5 pktw-h-2.5 pktw-text-green-600" />
                    </div>
                ) : sec.status === 'generating' ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"
                    >
                        <Loader2 className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#7c3aed]" />
                    </motion.div>
                ) : (
                    <div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-gray-100 pktw-shrink-0" />
                )}
                <span className="pktw-text-xs pktw-text-[#6b7280] pktw-truncate">{sec.title}</span>
            </div>
        ))}
    </div>
)}
```

Add the store subscription:
```tsx
const sections = useSearchSessionStore((s) => s.v2PlanSections);
const status = useSearchSessionStore((s) => s.status);
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2ProcessView.tsx
git commit -m "feat(ui): process view shows per-section generation progress"
```

---

### Task 11: Integration — End-to-end build and manual test prep

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: No errors, clean build.

- [ ] **Step 2: Verify data flow documentation**

Verify the end-to-end flow works conceptually:
1. Agent searches → calls `vault_submit_plan` with `plan_sections`
2. `useSearchSession` extracts `plan_sections` → `setPlanSections()` → status `plan_ready`
3. UI shows `V2PlanReview` with section cards
4. User clicks "Generate Report" → `handleApprovePlan()` → `ReportOrchestrator.generateReport()`
5. Each section streams via `appendSectionChunk()` → block card renders streaming content
6. All sections done → executive summary streams → `markCompleted()`
7. User clicks regenerate on a section → `handleRegenerateSection()` → section re-streams

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: per-section report generation — complete implementation"
```

---

## Deferred Items

| Item | Why deferred |
|------|-------------|
| Section inline editing (click title to edit) | Polish — plan review works with current simple cards |
| Source assessment scoring per section | Requires scoring model changes |
| Section version diff UI | History is stored; UI for comparing versions is future work |
| Drag-and-drop section reordering | Arrow buttons work; DnD is polish |
| TILE/MERMAID render engines | All sections use MARKDOWN initially |
| Add new section after generation | Regenerate covers most use cases |
