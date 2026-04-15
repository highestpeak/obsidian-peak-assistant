# Report Generation Reliability Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make report generation reliable: controlled concurrency, repetition detection, separated Content/Visual pipelines, mermaid auto-fix, loading skeletons, and progress bar.

**Architecture:** Content Agent produces text only (no mermaid). Visual Agent always runs with validate→fix→retry loop. A `pLimit` concurrency controller caps parallel streams. A `streamWithRepetitionGuard` utility protects all streaming loops. UI shows skeleton placeholders and a progress bar.

**Tech Stack:** Vercel AI SDK `streamText` + `AbortController`, Zustand store, React + Tailwind (`pktw-` prefix), `mermaid.parse()` for validation

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/service/agents/report/ReportOrchestrator.ts` | Report generation orchestrator | Modify: concurrency, repetition guard, visual retry loop |
| `src/service/agents/report/stream-utils.ts` | `pLimit` + `streamWithRepetitionGuard` utilities | **Create** |
| `templates/prompts/ai-analysis-report-section-system.md` | Content Agent system prompt | Modify: remove mermaid, add prohibition |
| `src/ui/view/quick-search/components/V2ReportView.tsx` | Report view with section blocks | Modify: skeleton, progress bar, spinner visibility |

---

### Task 1: Create stream utilities (pLimit + repetition guard)

**Files:**
- Create: `src/service/agents/report/stream-utils.ts`
- Test: `test/stream-utils.test.ts`

- [ ] **Step 1: Write tests for `detectRepetition`**

Create `test/stream-utils.test.ts`:

```ts
import { detectRepetition } from '../src/service/agents/report/stream-utils';

// Normal text — no repetition
console.assert(detectRepetition('This is normal varied text with many different words.') === -1);

// Obvious repetition
const repeated = '正常开头。' + '个性化的'.repeat(50);
const cut = detectRepetition(repeated);
console.assert(cut > 0 && cut < repeated.length, `Expected truncation point, got ${cut}`);

// Short text — below threshold
console.assert(detectRepetition('短') === -1);

// Edge: repeated but short pattern (< 20 chars)
console.assert(detectRepetition('ab'.repeat(100)) > 0, 'Should detect even short-char patterns when count is high');

console.log('detectRepetition tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/stream-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `stream-utils.ts`**

Create `src/service/agents/report/stream-utils.ts`:

```ts
/**
 * Concurrency limiter — like p-limit but zero dependencies.
 * Usage: const limit = pLimit(3); await Promise.all(tasks.map(t => limit(() => t())));
 */
export function pLimit(concurrency: number) {
	let active = 0;
	const queue: (() => void)[] = [];
	const next = () => {
		while (queue.length > 0 && active < concurrency) {
			active++;
			queue.shift()!();
		}
	};
	return <T>(fn: () => Promise<T>): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			queue.push(() =>
				fn()
					.then(resolve, reject)
					.finally(() => {
						active--;
						next();
					}),
			);
			next();
		});
}

/**
 * Detect repetitive text in a string.
 * Returns the index to truncate at, or -1 if no repetition found.
 *
 * Algorithm: in the last `windowSize` chars, check if any substring of
 * length `minLen..windowSize/3` appears 3+ times consecutively.
 */
export function detectRepetition(
	text: string,
	windowSize = 500,
	minLen = 10,
): number {
	if (text.length < windowSize) return -1;
	const window = text.slice(-windowSize);

	// Check progressively longer patterns
	for (let len = minLen; len <= Math.floor(windowSize / 3); len++) {
		const pattern = window.slice(window.length - len);
		// Count consecutive occurrences from the end
		let count = 0;
		let pos = window.length;
		while (pos >= len) {
			if (window.slice(pos - len, pos) === pattern) {
				count++;
				pos -= len;
			} else {
				break;
			}
		}
		if (count >= 3) {
			// Return truncation point in original text
			return text.length - (count * len);
		}
	}
	return -1;
}

/**
 * Stream text with automatic repetition detection.
 * Returns { fullText, aborted }.
 * Calls `onChunk` for each streamed chunk.
 * Automatically aborts if repetition detected.
 */
export async function streamWithRepetitionGuard(
	textStream: AsyncIterable<string>,
	abortController: AbortController,
	onChunk: (chunk: string) => void,
): Promise<{ fullText: string; aborted: boolean }> {
	let fullText = '';
	let lastCheckLen = 0;
	let aborted = false;

	for await (const chunk of textStream) {
		fullText += chunk;
		onChunk(chunk);

		// Check every ~200 chars
		if (fullText.length - lastCheckLen > 200) {
			lastCheckLen = fullText.length;
			const truncAt = detectRepetition(fullText);
			if (truncAt > 0) {
				fullText = fullText.slice(0, truncAt);
				aborted = true;
				abortController.abort();
				break;
			}
		}
	}

	return { fullText, aborted };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/stream-utils.test.ts`
Expected: PASS — all assertions pass

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: successful build

- [ ] **Step 6: Commit**

```bash
git add src/service/agents/report/stream-utils.ts test/stream-utils.test.ts
git commit -m "feat(report): add pLimit concurrency limiter and repetition detection utilities"
```

---

### Task 2: Content Agent prompt — remove mermaid responsibility

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section-system.md:48-57`

- [ ] **Step 1: Replace mermaid section with prohibition**

In `templates/prompts/ai-analysis-report-section-system.md`, replace lines 48-57:

```
# CHARTS / MERMAID
When visual_type is not "none", you MUST include exactly one Mermaid diagram of that type within the Answer section. The diagram must directly support the section's conclusion — not decorative.

Mermaid Safety Rules (CRITICAL — violation causes render failure):
- All node labels in double quotes: `N1["Label text"]`
- Labels max 15 characters; use `<br/>` for longer text
- Max 4 edges per node, max 15 nodes per diagram
- `quadrantChart` axis labels: single words only, no spaces
- **Forbidden in labels**: `"`, `\`, `/`, `(`, `)`, `[`, `]`, `{`, `}`, `:`, `;`
- Use only: letters (any language), numbers, spaces, hyphens, commas
```

With:

```
# VISUALS
- Do NOT include any Mermaid diagrams or code blocks — a dedicated Visual Agent generates charts separately.
- You SHOULD use markdown tables when comparing items on multiple dimensions. Tables are your primary visual tool.
```

- [ ] **Step 2: Build and commit**

```bash
npm run build
git add templates/prompts/ai-analysis-report-section-system.md
git commit -m "fix(prompts): remove mermaid from content agent, delegate to visual agent"
```

---

### Task 3: ReportOrchestrator — concurrency + repetition guard + visual retry

This is the core task. Modify `ReportOrchestrator.ts` to use the new utilities and add a visual validation/retry loop.

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts`

- [ ] **Step 1: Add imports**

At the top of `ReportOrchestrator.ts` (after line 5), add:

```ts
import { pLimit, streamWithRepetitionGuard } from './stream-utils';
import { validateMermaidCode } from '@/core/utils/analysis-data-validator';
```

- [ ] **Step 2: Replace `generateReport` method (lines 55-82)**

Replace the current `generateReport` method:

```ts
async generateReport(
    sections: V2Section[],
    allEvidencePaths: string[],
    overview: string,
    userQuery: string,
): Promise<void> {
    // Pass 0: assign user insights to sections (if any)
    const insights = this.store.getState().v2UserInsights;
    if (insights.length > 0) {
        await this.assignInsightsToSections(insights, sections, userQuery);
        sections = this.store.getState().v2PlanSections;
    }

    // Mark all sections as generating
    for (const sec of sections) {
        this.store.getState().updatePlanSection(sec.id, (s) => ({ ...s, status: 'generating' }));
    }

    // Pass 1+2: content + visual per section, concurrency-limited
    const limit = pLimit(3);
    await Promise.all(sections.map((sec) => limit(async () => {
        await this.runContentAgent(sec, sections, overview, userQuery);
        await this.runVisualAgent(sec);
    })));

    // Pass 3: executive summary (needs all sections completed first)
    await this.runSummaryAgent(sections, allEvidencePaths, overview, userQuery);
}
```

The only change is wrapping `sections.map(...)` with `limit(async () => ...)`.

- [ ] **Step 3: Replace `runContentAgent` streaming loop (lines 226-234)**

Replace the streaming section of `runContentAgent` (from the `streamText` call to `completeSectionContent`):

```ts
const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportSection);
const controller = new AbortController();
const result = streamText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    maxTokens: 4000,
    abortSignal: controller.signal,
});

const { fullText } = await streamWithRepetitionGuard(
    result.textStream,
    controller,
    (chunk) => this.store.getState().appendSectionChunk(section.id, chunk),
);

this.store.getState().completeSectionContent(section.id, fullText);
```

- [ ] **Step 4: Replace `runVisualAgent` method (lines 244-279)**

Replace the entire `runVisualAgent` with a validate→fix→retry loop:

```ts
private async runVisualAgent(section: V2Section): Promise<void> {
    if (section.visualType === 'none') return;
    const currentContent = this.store.getState().v2PlanSections.find((s) => s.id === section.id)?.content ?? '';

    try {
        let mermaidBlock = await this.generateMermaidBlock(section, currentContent);
        if (!mermaidBlock) return;

        // Validate → fix → retry loop (max 2 retries)
        for (let attempt = 0; attempt < 2; attempt++) {
            const inner = this.extractMermaidInner(mermaidBlock);
            if (!inner) break;
            const validation = await validateMermaidCode(inner);
            if (validation.valid) break;
            // Try to fix
            const fixed = await this.runMermaidFixAgent(inner, validation.error);
            if (!fixed || !fixed.includes('```mermaid')) { mermaidBlock = ''; break; }
            mermaidBlock = fixed;
        }

        if (mermaidBlock && mermaidBlock.includes('```mermaid')) {
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

private async generateMermaidBlock(section: V2Section, sectionContent: string): Promise<string> {
    const [systemPrompt, userMessage] = await Promise.all([
        this.mgr.renderPrompt(PromptId.AiAnalysisReportVisualSystem, {}),
        this.mgr.renderPrompt(PromptId.AiAnalysisReportVisual, {
            sectionTitle: section.title,
            visualType: section.visualType,
            sectionContent: sectionContent.slice(0, 2000),
        }),
    ]);

    const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisReportVisual);
    const controller = new AbortController();
    const result = streamText({
        model,
        system: systemPrompt,
        prompt: userMessage,
        maxTokens: 1000,
        abortSignal: controller.signal,
    });

    const { fullText } = await streamWithRepetitionGuard(
        result.textStream,
        controller,
        () => {}, // Visual agent doesn't stream to UI
    );

    return fullText;
}

private extractMermaidInner(block: string): string {
    const match = block.match(/```mermaid\s*\n([\s\S]*?)```/);
    return match ? match[1].trim() : '';
}
```

- [ ] **Step 5: Also add repetition guard to `runSummaryAgent` (lines 314-319)**

Replace the summary streaming loop:

```ts
const { model } = this.mgr.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummary);
const controller = new AbortController();
const result = streamText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    maxTokens: 4000,
    abortSignal: controller.signal,
});

const { fullText } = await streamWithRepetitionGuard(
    result.textStream,
    controller,
    (chunk) => this.store.getState().setSummary(
        (this.store.getState().v2Summary ?? '') + chunk
    ),
);
// Ensure final state is the clean text
this.store.getState().setSummary(fullText);
```

Note: The summary onChunk is different — it reads+appends from store because `setSummary` sets the full text, not appends. Keep the existing pattern of accumulating into `setSummary`.

Wait — looking at the original code (line 319): `this.store.getState().setSummary(fullText);` — it accumulates fullText locally and sets the entire string on each chunk. So the guard wrapper needs to match. Let me revise:

Actually the original is:
```ts
let fullText = '';
for await (const chunk of result.textStream) {
    fullText += chunk;
    this.store.getState().setSummary(fullText);
}
```

It sets the entire accumulated text each time. With `streamWithRepetitionGuard`, the `onChunk` only gets the delta chunk. We need to track the running total for `setSummary`. Solution:

```ts
let accumulated = '';
const { fullText } = await streamWithRepetitionGuard(
    result.textStream,
    controller,
    (chunk) => {
        accumulated += chunk;
        this.store.getState().setSummary(accumulated);
    },
);
this.store.getState().setSummary(fullText);
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: successful build, no type errors

- [ ] **Step 7: Commit**

```bash
git add src/service/agents/report/ReportOrchestrator.ts
git commit -m "feat(report): concurrency limit, repetition guard, visual validate-fix-retry loop"
```

---

### Task 4: UI — Loading skeleton + progress bar + spinner visibility

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx`

- [ ] **Step 1: Add skeleton shimmer for empty generating sections**

In the `SectionBlock` component, after the `</div>` of the Header block (after line 80), add a skeleton state before the content rendering (replacing lines 111-116):

```tsx
{/* Skeleton when generating but no content yet */}
{section.status === 'generating' && !content && (
    <div className="pktw-space-y-3 pktw-animate-pulse">
        <div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-full" />
        <div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-5/6" />
        <div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-4/6" />
        <div className="pktw-h-8 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-full pktw-mt-2" />
        <div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-full" />
        <div className="pktw-h-3 pktw-bg-[#e5e7eb] pktw-rounded pktw-w-3/4" />
    </div>
)}

{/* Content — only show when we have text */}
{content && (
    <StreamdownIsolated isAnimating={section.status === 'generating'} className="pktw-select-text pktw-break-words">
        {content}
    </StreamdownIsolated>
)}
```

- [ ] **Step 2: Make spinner always visible during generation (line 57)**

Replace the wrapper div (line 57):

```tsx
<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity">
```

With conditional opacity — always visible when generating:

```tsx
<div className={`pktw-flex pktw-items-center pktw-gap-1 pktw-transition-opacity ${
    section.status === 'generating' ? 'pktw-opacity-100' : 'pktw-opacity-0 group-hover:pktw-opacity-100'
}`}>
```

- [ ] **Step 3: Add progress bar to V2ReportView**

In the `V2ReportView` component, add a `useMemo` for progress calculation (after the existing selectors, around line 131):

```tsx
const progress = useMemo(() => {
    const doneCount = sections.filter((s) => s.status === 'done').length;
    const total = sections.length + 1; // +1 for executive summary
    const summaryDone = !summaryStreaming && !!summary;
    const completed = doneCount + (summaryDone ? 1 : 0);
    return { completed, total, pct: Math.round((completed / total) * 100) };
}, [sections, summary, summaryStreaming]);

const isGenerating = sections.some((s) => s.status === 'generating') || summaryStreaming;
```

Add the `useMemo` import at the top (line 1):
```tsx
import React, { useState, useCallback, useMemo } from 'react';
```

Then render the progress bar inside the `motion.div` (line 141), before the Executive Summary block:

```tsx
{/* Progress bar — show during generation */}
{isGenerating && (
    <div className="pktw-mb-4">
        <div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1.5">
            <span className="pktw-text-xs pktw-text-[#6b7280]">
                {progress.completed}/{progress.total} sections
            </span>
            <span className="pktw-text-xs pktw-font-medium pktw-text-[#7c3aed]">
                {progress.pct}%
            </span>
        </div>
        <div className="pktw-h-1.5 pktw-bg-[#e5e7eb] pktw-rounded-full pktw-overflow-hidden">
            <motion.div
                className="pktw-h-full pktw-bg-[#7c3aed] pktw-rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress.pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
            />
        </div>
    </div>
)}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: successful build

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/quick-search/components/V2ReportView.tsx
git commit -m "feat(ui): loading skeleton, always-visible spinner, and progress bar for report generation"
```
