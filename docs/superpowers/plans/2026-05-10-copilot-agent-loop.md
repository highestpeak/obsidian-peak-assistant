# Copilot Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade 4 copilot actions (suggest-links, knowledge-gaps, synthesize-topic, add-evidence) from single-turn LLM calls to multi-step agent loops with vault exploration, and add real-time step display to CopilotResultModal.

**Architecture:** Unify `CopilotAction.execute()` as `AsyncGenerator<LLMStreamEvent>` for all 15 actions. Single-turn actions yield deltas then return. Agent loop actions wrap `queryWithProfile` + vault MCP server. CopilotResultModal consumes the generator and renders steps using reused `ToolRow`/`BatchRow` components from the search timeline.

**Tech Stack:** Claude Agent SDK (`queryWithProfile`), existing vault MCP server (`buildVaultMcpServer`), `V2ToolStep` types, `ToolRow`/`BatchRow` components, Handlebars prompt templates.

**Spec:** `docs/superpowers/specs/2026-05-10-copilot-agent-loop-design.md`

---

### Task 1: Interface change — CopilotAction.execute() to AsyncGenerator

**Files:**
- Modify: `src/service/copilot/CopilotActionRegistry.ts`

- [ ] **Step 1: Update execute() signature and remove ProgressCallback**

In `src/service/copilot/CopilotActionRegistry.ts`, add the import for `LLMStreamEvent` and change the `execute` signature:

```ts
// Add at top:
import type { LLMStreamEvent } from '@/core/providers/types';

// Remove ProgressCallback type entirely:
// DELETE: export type ProgressCallback = (text: string) => void;

// Change execute in CopilotAction interface:
export interface CopilotAction {
	id: string;
	label: string;
	description: string;
	icon: LucideIcon;
	category: 'document' | 'vault' | 'writing';
	relevance(ctx: DocumentContext): number;
	guard?(ctx: DocumentContext): string | null;
	execute(ctx: DocumentContext, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult | void>;
	ResultPanel: React.ComponentType<{ result: any; ctx: DocumentContext; onClose: () => void }>;
}
```

- [ ] **Step 2: Verify build compiles (expect errors in actions/index.ts and CopilotResultModal.tsx)**

Run: `npx esbuild src/main.ts --bundle --platform=node --format=cjs --outfile=/dev/null --external:obsidian --external:electron --external:better-sqlite3 --external:@anthropic-ai/claude-agent-sdk 2>&1 | head -20`

Expected: compilation errors in `actions/index.ts` (old signature) and `CopilotResultModal.tsx` (calls `action.execute` with progress callback). This confirms the interface change is picked up.

- [ ] **Step 3: Commit**

```bash
git add src/service/copilot/CopilotActionRegistry.ts
git commit -m "refactor: change CopilotAction.execute() to AsyncGenerator<LLMStreamEvent>"
```

---

### Task 2: Adapt all single-turn actions to generator syntax

**Files:**
- Modify: `src/service/copilot/actions/index.ts`

- [ ] **Step 1: Update imports — remove ProgressCallback, add LLMStreamEvent**

In `src/service/copilot/actions/index.ts`:

```ts
// Change this import:
import type { CopilotAction, DocumentContext, ActionResult, ActionUsage, ProgressCallback } from '../CopilotActionRegistry';
// To:
import type { CopilotAction, DocumentContext, ActionResult, ActionUsage } from '../CopilotActionRegistry';

// Add:
import type { LLMStreamEvent } from '@/core/providers/types';
```

- [ ] **Step 2: Convert streamAction helper to async generator**

Replace the existing `streamAction` function:

```ts
/** Run a queryTextStream prompt, yielding LLMStreamEvents, and return the ActionResult. */
async function* streamAction(promptId: PromptId, vars: Record<string, any>, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult> {
	const mgr = AppContext.getInstance().manager;
	let fullText = '';
	let usage: ActionUsage | undefined;
	for await (const chunk of mgr.queryTextStream(promptId, vars, { signal })) {
		if (chunk.type === 'delta') {
			fullText += chunk.text;
			yield { type: 'text-delta', text: chunk.text } as LLMStreamEvent;
		} else if (chunk.type === 'done') {
			usage = toActionUsage(chunk.usage);
		}
	}
	return { type: 'stream' as const, text: fullText, usage };
}
```

- [ ] **Step 3: Convert all stream actions to use new signature**

Each stream action changes from `execute: (ctx, progress, signal) =>` to `execute: (ctx, signal) =>`. The `streamAction` call drops the `progress` parameter.

`polishDocumentAction`:
```ts
execute: (ctx, signal) => streamAction(PromptId.DocPolish, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope }, signal),
```

`summarizeAction`:
```ts
execute: (ctx, signal) => streamAction(PromptId.DocSummarize, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope, length: 'short' }, signal),
```

`translateAction`:
```ts
execute(ctx, signal) {
	const content = scopedContent(ctx);
	const targetLanguage = hasCJKMajority(content) ? 'English' : '中文';
	return streamAction(PromptId.DocTranslate, { content, title: ctx.title, scope: ctx.scope, targetLanguage }, signal);
},
```

`continueWritingAction`:
```ts
execute: (ctx, signal) => streamAction(PromptId.WritingContinue, { content: ctx.content, title: ctx.title }, signal),
```

`rewriteSelectionAction`:
```ts
execute: (ctx, signal) => streamAction(PromptId.WritingRewrite, { selection: ctx.selection!, content: ctx.content, title: ctx.title, style: 'concise' }, signal),
```

- [ ] **Step 4: Convert all structured actions to generator syntax**

Each structured action wraps its body in `async *execute(ctx, signal)` and just returns the result (no yields needed — the modal sees no events before the return).

`reviewArticleAction`:
```ts
async *execute(ctx, signal) {
	let usage: ActionUsage | undefined;
	const result = await AppContext.getInstance().manager.queryStructured(
		PromptId.DocReview, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope },
		await toJsonSchema(reviewResultSchema),
		{ signal, usageCallback: u => { usage = toActionUsage(u); } },
	);
	return { type: 'structured' as const, data: result, usage };
},
```

Apply the same pattern to: `suggestLinksAction`, `suggestSplitAction`, `extractConceptsAction`, `knowledgeGapsAction`, `vaultHealthAction`, `addEvidenceAction`.

For each, change `async execute(ctx, _progress, signal)` to `async *execute(ctx, signal)` and remove the unused `_progress` parameter.

`suggestTagsAction`:
```ts
async *execute(ctx, _signal) {
	const engine = new TagSuggestionEngine(AppContext.getInstance().manager);
	const ranked = await engine.suggestTags(ctx.file.path, ctx.content, ctx.title);
	return {
		type: 'structured' as const,
		data: {
			suggestions: ranked.map(r => ({
				tag: r.tag, confidence: r.confidence, reason: r.reason,
				source: r.sources[0]?.source ?? 'content',
			})),
			summary: `Found ${ranked.length} tag suggestions using content analysis, graph neighbors, and folder history.`,
		},
	};
},
```

`findRelatedAction`:
```ts
async *execute(ctx, _signal) {
	const response = await AppContext.getInstance().searchClient.vectorSearch({
		text: ctx.content.slice(0, 1000), scopeMode: 'vault', topK: 10,
	});
	const items = response.items
		.filter(item => item.path !== ctx.file.path)
		.map(item => ({
			path: item.path,
			title: item.title || item.path.replace(/\.md$/, '').split('/').pop() || item.path,
			score: item.finalScore ?? item.score ?? 0,
			excerpt: item.content?.slice(0, 200) ?? item.highlight?.text ?? '',
		}));
	return { type: 'structured' as const, data: { items } as FindRelatedResult };
},
```

`synthesizeTopicAction` — keep as stream for now (will be upgraded to agent loop in Task 8):
```ts
async *execute(ctx, signal) {
	const searchClient = AppContext.getInstance().searchClient;
	const response = await searchClient.vectorSearch({
		text: ctx.content.slice(0, 1000), scopeMode: 'vault', topK: 8,
	});
	const sources = response.items
		.filter(item => item.path !== ctx.file.path)
		.map(item => ({
			path: item.path,
			title: item.title || item.path.replace(/\.md$/, '').split('/').pop() || item.path,
			excerpt: item.content?.slice(0, 500) ?? '',
		}));
	const sourcesText = sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.excerpt}`).join('\n\n');
	let fullText = '';
	let usage: ActionUsage | undefined;
	for await (const chunk of AppContext.getInstance().manager.queryTextStream(PromptId.VaultSynthesize, { topic: ctx.title, sources: sourcesText }, { signal })) {
		if (chunk.type === 'delta') {
			fullText += chunk.text;
			yield { type: 'text-delta', text: chunk.text } as LLMStreamEvent;
		} else if (chunk.type === 'done') {
			usage = toActionUsage(chunk.usage);
		}
	}
	const result: SynthesizeResult = { text: fullText, sources: sources.map(s => ({ path: s.path, title: s.title })) };
	return { type: 'structured' as const, data: result, usage };
},
```

- [ ] **Step 5: Verify the actions file compiles in isolation**

Run: `npx esbuild src/service/copilot/actions/index.ts --bundle --platform=node --format=cjs --outfile=/dev/null --external:obsidian --external:electron --external:better-sqlite3 --external:@anthropic-ai/claude-agent-sdk 2>&1 | head -10`

Expected: success (or only errors from CopilotResultModal which hasn't been updated yet).

- [ ] **Step 6: Commit**

```bash
git add src/service/copilot/actions/index.ts
git commit -m "refactor: adapt all copilot actions to AsyncGenerator execute() signature"
```

---

### Task 3: CopilotResultModal — generator consumption + streaming phase

**Files:**
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx`

- [ ] **Step 1: Add imports and new types**

Add to the imports section of `CopilotResultModal.tsx`:

```ts
import type { LLMStreamEvent } from '@/core/providers/types';
import type { V2ToolStep } from '@/ui/view/quick-search/types/search-steps';
import { v2ToolDisplay, extractV2Summary, unwrapToolOutput } from '@/ui/view/quick-search/types/search-steps';
```

Update `ModalPhase` type to add the `streaming` phase:

```ts
type ModalPhase =
	| { phase: 'loading'; startTime: number }
	| { phase: 'streaming'; steps: V2ToolStep[]; progressText: string; startTime: number }
	| { phase: 'result'; data: any; usage?: ActionUsage }
	| { phase: 'cancelled' }
	| { phase: 'error'; error: Error };
```

Remove `statusText` and `progressText` from `loading` — loading is now just the initial spinner before any events arrive.

- [ ] **Step 2: Write the consumeCopilotStream function**

Add this function before the component definitions:

```ts
/** Map tool-call ID → tool name for resolving tool-result events (SDK doesn't carry name on results). */
type ToolCallRegistry = Map<string, string>;

async function consumeCopilotStream(
	generator: AsyncGenerator<LLMStreamEvent, ActionResult | void>,
	setPhase: (phase: ModalPhase) => void,
	startTime: number,
	signal: AbortSignal,
): Promise<ActionResult | void> {
	const steps: V2ToolStep[] = [];
	const callRegistry: ToolCallRegistry = new Map();
	let progressText = '';
	let lastUsage: ActionUsage | undefined;

	function pushStep(step: V2ToolStep) {
		steps.push(step);
		setPhase({ phase: 'streaming', steps: [...steps], progressText, startTime });
	}

	function updateStep(id: string, updater: (s: V2ToolStep) => V2ToolStep) {
		const idx = steps.findIndex(s => s.id === id);
		if (idx >= 0) {
			steps[idx] = updater(steps[idx]);
			setPhase({ phase: 'streaming', steps: [...steps], progressText, startTime });
		}
	}

	try {
		while (true) {
			if (signal.aborted) return;
			const { value, done } = await generator.next();
			if (done) return value as ActionResult | void;

			const event = value as LLMStreamEvent;
			switch (event.type) {
				case 'tool-call': {
					const { id, toolName, input } = event as any;
					callRegistry.set(id, toolName);
					const display = v2ToolDisplay(toolName, input ?? {});
					pushStep({
						id,
						toolName,
						displayName: display.displayName,
						icon: display.icon,
						input: input ?? {},
						status: 'running',
						startedAt: Date.now(),
					});
					break;
				}
				case 'tool-result': {
					const { id, output } = event as any;
					const toolName = callRegistry.get(id) ?? 'unknown';
					const summary = extractV2Summary(toolName, output);
					updateStep(id, s => ({
						...s,
						status: 'done',
						endedAt: Date.now(),
						summary,
						resultPreview: unwrapToolOutput(output).slice(0, 500),
					}));
					break;
				}
				case 'text-delta': {
					progressText += (event as any).text;
					setPhase({ phase: 'streaming', steps: [...steps], progressText, startTime });
					break;
				}
				case 'complete': {
					const { usage } = event as any;
					if (usage) {
						lastUsage = {
							inputTokens: usage.inputTokens ?? 0,
							outputTokens: usage.outputTokens ?? 0,
						};
					}
					break;
				}
				case 'error': {
					const { error } = event as any;
					setPhase({ phase: 'error', error: error instanceof Error ? error : new Error(String(error)) });
					return;
				}
				// pk-debug, reasoning-delta, etc. — silently ignore
			}
		}
	} catch (err) {
		if (signal.aborted) return;
		setPhase({ phase: 'error', error: err instanceof Error ? err : new Error(String(err)) });
	}
}
```

- [ ] **Step 3: Update LoadingView — simplify to pure spinner (no progressText)**

```ts
const LoadingView: React.FC<{
	label: string;
	startTime: number;
	onCancel: () => void;
}> = ({ label, startTime, onCancel }) => {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [startTime]);

	const autoStatus = LOADING_STEPS.filter(s => elapsed >= s.after).pop()?.text;

	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
			<Loader2 className="pktw-w-8 pktw-h-8 pktw-animate-spin pktw-text-accent" />
			<span className="pktw-text-sm pktw-font-medium">{label}...</span>
			{autoStatus && (
				<span className="pktw-text-xs pktw-text-muted-foreground">{autoStatus}</span>
			)}
			<span className="pktw-text-[10px] pktw-text-muted-foreground/50">{elapsed}s</span>
			<Button variant="ghost" size="sm" onClick={onCancel} className="pktw-mt-2">
				<X className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
				Cancel
			</Button>
		</div>
	);
};
```

- [ ] **Step 4: Add StreamingView component (placeholder — StepTimeline component comes in Task 4)**

```ts
import { CopilotStepTimeline } from './components/CopilotStepTimeline';

const StreamingView: React.FC<{
	label: string;
	steps: V2ToolStep[];
	progressText: string;
	startTime: number;
	onCancel: () => void;
}> = ({ label, steps, progressText, startTime, onCancel }) => {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [startTime]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-py-4 pktw-px-4">
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin pktw-text-accent" />
					<span className="pktw-text-sm pktw-font-medium">{label}</span>
				</div>
				<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-font-mono">{elapsed}s</span>
			</div>
			{steps.length > 0 && <CopilotStepTimeline steps={steps} />}
			{progressText && (
				<div className="pktw-max-h-[200px] pktw-overflow-y-auto pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-mt-2">
					{progressText}
				</div>
			)}
			<div className="pktw-flex pktw-justify-center pktw-mt-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					<X className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					Cancel
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 5: Update CopilotResultContent to handle streaming phase**

In the `CopilotResultContent` component body, add the streaming phase branch after the loading check:

```ts
if (phase.phase === 'streaming') {
	return (
		<div className="pktw-relative">
			{backButton}
			<StreamingView
				label={action.label}
				steps={phase.steps}
				progressText={phase.progressText}
				startTime={phase.startTime}
				onCancel={onCancel}
			/>
		</div>
	);
}
```

- [ ] **Step 6: Rewrite onOpen() to consume the generator**

Replace the `action.execute(...).then(...)` block in `onOpen()`:

```ts
// Execute the action and wire results into the modal
const { action, ctx } = this.props;
const guard = action.guard?.(ctx);
if (guard) {
	this.setError(new Error(guard));
	return;
}
const signal = this.abortController.signal;
const startTime = Date.now();

(async () => {
	try {
		const generator = action.execute(ctx, signal);
		const result = await consumeCopilotStream(generator, (p) => {
			_currentSetPhase?.(p);
		}, startTime, signal);
		if (signal.aborted) return;
		if (result) {
			this.setResult(result.data ?? result.text ?? result, result.usage);
		}
	} catch (err) {
		if (signal.aborted) {
			_currentSetPhase?.({ phase: 'cancelled' });
			return;
		}
		this.setError(err instanceof Error ? err : new Error(String(err)));
	}
})();
```

Also remove the `updateProgress` method from the class — it's no longer needed.

- [ ] **Step 7: Commit**

```bash
git add src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "feat: CopilotResultModal consumes AsyncGenerator with streaming phase"
```

---

### Task 4: CopilotStepTimeline component

**Files:**
- Create: `src/ui/view/copilot/components/CopilotStepTimeline.tsx`

- [ ] **Step 1: Create the CopilotStepTimeline component**

```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { ToolRow, BatchRow, groupTimeline } from '@/ui/view/quick-search/components/timeline-helpers';
import type { V2ToolStep, V2TimelineItem } from '@/ui/view/quick-search/types/search-steps';

interface CopilotStepTimelineProps {
	steps: V2ToolStep[];
	/** When true, show collapsed summary instead of full list */
	collapsed?: boolean;
}

export const CopilotStepTimeline: React.FC<CopilotStepTimelineProps> = ({ steps, collapsed: initialCollapsed }) => {
	const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);

	if (steps.length === 0) return null;

	const allDone = steps.every(s => s.status === 'done');
	const totalDuration = allDone && steps.length > 0
		? ((steps[steps.length - 1].endedAt ?? Date.now()) - steps[0].startedAt) / 1000
		: null;

	// Build timeline items from steps for groupTimeline
	const timeline: V2TimelineItem[] = steps.map(s => ({ kind: 'tool' as const, step: s }));
	const grouped = groupTimeline(timeline);

	if (collapsed) {
		return (
			<button
				onClick={() => setCollapsed(false)}
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-2 pktw-w-full pktw-text-left pktw-bg-transparent pktw-border pktw-border-border pktw-rounded-md hover:pktw-bg-muted/50 pktw-transition-colors pktw-cursor-pointer"
			>
				<div className="pktw-w-4 pktw-h-4 pktw-rounded-full pktw-bg-green-100 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
					<Check className="pktw-w-2.5 pktw-h-2.5 pktw-text-green-600" />
				</div>
				<span className="pktw-text-xs pktw-text-muted-foreground">
					{steps.length} steps completed
				</span>
				<span className="pktw-flex-1" />
				{totalDuration !== null && (
					<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-font-mono pktw-tabular-nums">
						{totalDuration.toFixed(1)}s
					</span>
				)}
				<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
			</button>
		);
	}

	return (
		<div className="pktw-border pktw-border-border pktw-rounded-md pktw-overflow-hidden">
			{allDone && (
				<button
					onClick={() => setCollapsed(true)}
					className="pktw-flex pktw-items-center pktw-gap-1 pktw-py-1 pktw-px-2 pktw-w-full pktw-text-left pktw-bg-transparent pktw-border-b pktw-border-border hover:pktw-bg-muted/50 pktw-transition-colors pktw-cursor-pointer"
				>
					<ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
					<span className="pktw-text-[10px] pktw-text-muted-foreground">collapse</span>
				</button>
			)}
			<div className="pktw-py-1">
				{grouped.map((item, i) => {
					if (item.kind === 'batch') return <BatchRow key={i} steps={item.steps} />;
					if (item.kind === 'tool') return <ToolRow key={item.step.id} step={item.step} />;
					return null; // text items not rendered in copilot timeline
				})}
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/copilot/components/CopilotStepTimeline.tsx
git commit -m "feat: add CopilotStepTimeline component reusing ToolRow/BatchRow"
```

---

### Task 5: Agent loop infrastructure — buildCopilotAgentStream

**Files:**
- Create: `src/service/copilot/actions/agent-actions.ts`

- [ ] **Step 1: Create the shared agent loop helper**

```ts
/**
 * Shared infrastructure for copilot actions that run as agent loops.
 * Wraps queryWithProfile + vault MCP server and yields LLMStreamEvents.
 */

import type { App } from 'obsidian';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import type { ActionResult, ActionUsage } from '../CopilotActionRegistry';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { warmupPool, queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { buildVaultMcpServer, type GrepHit } from '@/service/agents/vault-sdk/vaultMcpServer';
import { translateSdkMessage } from '@/service/agents/core/sdkMessageAdapter';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export interface CopilotAgentOptions {
	/** System prompt for the agent */
	systemPrompt: string;
	/** User prompt (includes document context) */
	userPrompt: string;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

/**
 * Build a lightweight MCP server with a single `submit_result` tool.
 * The agent calls this tool to submit its structured output.
 */
function buildSubmitResultMcpServer(onSubmit: (result: string) => void) {
	const submitResult = tool(
		'submit_result',
		'Call this tool when you have completed your analysis and are ready to submit the final result. Pass the result as a JSON string matching the required output schema.',
		{ result: z.string().describe('JSON string of the structured result') },
		async (input) => {
			onSubmit(input.result);
			return { content: [{ type: 'text' as const, text: '{"acknowledged": true}' }] };
		},
	);
	return createSdkMcpServer({ tools: [submitResult] });
}

/**
 * Run a copilot agent loop. Yields LLMStreamEvents for real-time step display.
 * The generator returns the captured ActionResult when the agent calls submit_result.
 */
export async function* buildCopilotAgentStream(
	options: CopilotAgentOptions,
): AsyncGenerator<LLMStreamEvent, ActionResult | void> {
	const triggerName = StreamTriggerName.COPILOT;
	const appContext = AppContext.getInstance();
	const { app } = appContext;
	const pluginId = appContext.pluginId;

	// 1. Warm up SDK pool
	try {
		await warmupPool();
	} catch (err) {
		yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
		return;
	}

	// 2. Resolve agent profile
	const profile: Profile | null = ProfileRegistry.getInstance().getActiveAgentProfile();
	if (!profile) {
		yield {
			type: 'error',
			error: new Error('No active agent profile configured. Please set up a profile in Settings.'),
			triggerName,
		} as LLMStreamEvent;
		return;
	}

	// 3. Build vault MCP server (reuse existing)
	const searchClient = appContext.searchClient;
	const searchFn = async (q: string, limit: number): Promise<GrepHit[]> => {
		const res = await searchClient.search({
			text: q,
			topK: limit,
			searchMode: 'hybrid',
			scopeMode: 'vault',
			indexTenant: 'vault',
		} as any);
		return (res.items ?? []).map((i: any) => ({
			path: i.path,
			snippet: i.title ?? i.path,
			score: i.score ?? 0,
		}));
	};

	// submit_plan is required by buildVaultMcpServer but unused in copilot — auto-acknowledge
	const vaultMcpServer = buildVaultMcpServer({
		app,
		searchFn,
		onSubmitPlan: async (plan) => ({
			approved: true,
			adjustedPaths: plan.selected_paths,
			adjustedOutline: plan.proposed_outline,
		}),
	});

	// 4. Build submit_result MCP server
	let capturedResult: string | null = null;
	const submitMcpServer = buildSubmitResultMcpServer((result) => {
		capturedResult = result;
	});

	// 5. Run agent
	let sdkUsage: { inputTokens: number; outputTokens: number } | null = null;
	const startTs = Date.now();

	try {
		const allowedTools = [
			'mcp__vault__vault_list_folders',
			'mcp__vault__vault_read_folder',
			'mcp__vault__vault_read_note',
			'mcp__vault__vault_grep',
			'mcp__vault__vault_wikilink_expand',
			'mcp__copilot__submit_result',
		];

		const messages = queryWithProfile(app, pluginId, profile, {
			prompt: options.userPrompt,
			systemPrompt: options.systemPrompt,
			maxTurns: 20,
			allowedTools,
			disallowedTools: ['AskUserQuestion', 'mcp__vault__vault_submit_plan'],
			mcpServers: {
				vault: vaultMcpServer,
				copilot: submitMcpServer,
			},
			signal: options.signal,
		});

		for await (const raw of messages) {
			const events = translateSdkMessage(raw, {
				triggerName,
				hasPartialMessages: true,
			});
			for (const ev of events) {
				yield ev;
			}

			// If we got the result message, capture usage and break
			const msg = raw as any;
			if (msg.type === 'result' && msg.usage) {
				sdkUsage = {
					inputTokens: msg.usage.input_tokens ?? 0,
					outputTokens: msg.usage.output_tokens ?? 0,
				};
			}
		}
	} catch (err) {
		const errMsg = (err as Error)?.message ?? '';
		if (errMsg.toLowerCase().includes('maximum number of turns')) {
			console.warn('[CopilotAgent] max turns reached');
		} else {
			yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
			return;
		}
	}

	// 6. Emit complete
	yield {
		type: 'complete',
		triggerName,
		durationMs: Date.now() - startTs,
		usage: sdkUsage ?? undefined,
	} as LLMStreamEvent;

	// 7. Return captured result
	if (capturedResult) {
		try {
			const parsed = JSON.parse(capturedResult);
			const usage: ActionUsage | undefined = sdkUsage
				? { inputTokens: sdkUsage.inputTokens, outputTokens: sdkUsage.outputTokens }
				: undefined;
			return { type: 'structured', data: parsed, usage } as ActionResult;
		} catch {
			return { type: 'error', message: 'Failed to parse agent result as JSON' } as ActionResult;
		}
	}
}
```

- [ ] **Step 2: Add `COPILOT` to StreamTriggerName if not present**

Check `src/core/providers/types.ts` for `StreamTriggerName` enum. If `COPILOT` is not present, add it:

```ts
COPILOT = 'copilot',
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/service/copilot/actions/agent-actions.ts src/core/providers/types.ts
git commit -m "feat: add buildCopilotAgentStream shared agent loop infrastructure"
```

---

### Task 6: Register 4 agent prompt IDs + template metadata

**Files:**
- Modify: `src/service/prompt/PromptId.ts`
- Modify: `src/core/template/TemplateRegistry.ts`

- [ ] **Step 1: Add 4 new PromptId entries**

In `src/service/prompt/PromptId.ts`, add under the `// Copilot Vault Intelligence` section:

```ts
// Copilot Agent Playbooks
CopilotAgentSuggestLinks = 'copilot-agent-suggest-links',
CopilotAgentKnowledgeGaps = 'copilot-agent-knowledge-gaps',
CopilotAgentSynthesizeTopic = 'copilot-agent-synthesize-topic',
CopilotAgentAddEvidence = 'copilot-agent-add-evidence',
```

- [ ] **Step 2: Add PromptVariables entries**

In the `PromptVariables` interface in the same file, add. These are pure system prompts with no Handlebars variables — document context is injected via the user prompt string built in the action:

```ts
[PromptId.CopilotAgentSuggestLinks]: Record<string, never>;
[PromptId.CopilotAgentKnowledgeGaps]: Record<string, never>;
[PromptId.CopilotAgentSynthesizeTopic]: Record<string, never>;
[PromptId.CopilotAgentAddEvidence]: Record<string, never>;
```

- [ ] **Step 3: Add template metadata entries**

In `src/core/template/TemplateRegistry.ts`, add after the existing copilot entries:

```ts
// Copilot Agent Playbooks (system prompts for agent loop actions)
'copilot-agent-suggest-links': meta('prompts', 'copilot-agent-suggest-links'),
'copilot-agent-knowledge-gaps': meta('prompts', 'copilot-agent-knowledge-gaps'),
'copilot-agent-synthesize-topic': meta('prompts', 'copilot-agent-synthesize-topic'),
'copilot-agent-add-evidence': meta('prompts', 'copilot-agent-add-evidence'),
```

These are system-only prompts (no paired user template, no `systemPromptId`) — the user prompt is built inline in the action.

- [ ] **Step 4: Commit**

```bash
git add src/service/prompt/PromptId.ts src/core/template/TemplateRegistry.ts
git commit -m "feat: register 4 copilot agent prompt IDs and template metadata"
```

---

### Task 7: Create 4 agent playbook prompt templates

**Files:**
- Create: `templates/prompts/copilot-agent-suggest-links.md`
- Create: `templates/prompts/copilot-agent-knowledge-gaps.md`
- Create: `templates/prompts/copilot-agent-synthesize-topic.md`
- Create: `templates/prompts/copilot-agent-add-evidence.md`

- [ ] **Step 1: Create suggest-links playbook**

Create `templates/prompts/copilot-agent-suggest-links.md`:

```markdown
You are a Copilot assistant for an Obsidian knowledge base. Your task is to suggest wiki-links that should be added to the user's current document.

## Available Tools

You have access to vault tools:
- `vault_grep` — Search the vault by keyword (hybrid FTS + vector)
- `vault_read_note` — Read a specific note's content, frontmatter, and links
- `vault_list_folders` — List vault folder structure
- `vault_read_folder` — List files in a specific folder
- `vault_wikilink_expand` — Follow wikilink graph N hops from a note
- `submit_result` — Submit your final structured result

## Your Goal

Analyze the document and find **real, existing notes** in the vault that should be linked from this document. Do NOT guess or hallucinate note titles — every suggested link must point to a note you have verified exists via vault tools.

## Process

1. Read the document content to identify key concepts, topics, and entities
2. Search the vault for notes related to those concepts using `vault_grep`
3. Read promising candidates with `vault_read_note` to verify semantic relevance
4. Optionally use `vault_wikilink_expand` to discover related notes through the link graph
5. Submit your result via `submit_result`

## Output Schema

Call `submit_result` with a JSON string matching this schema:

```json
{
  "links": [
    {
      "target": "exact-note-path.md",
      "context": "sentence or paragraph where the link should be inserted",
      "reason": "why this link is relevant",
      "type": "outgoing"
    }
  ]
}
```

## Rules

- Only suggest links to notes that actually exist in the vault (you must have read or found them)
- Prefer quality over quantity — 3-5 highly relevant links are better than 10 weak ones
- The "context" field should quote the specific text in the document where `[[link]]` should be inserted
- Do not suggest links that already exist in the document
- Consider both outgoing links (from this doc to others) and incoming links (other docs that should link here)
```

- [ ] **Step 2: Create knowledge-gaps playbook**

Create `templates/prompts/copilot-agent-knowledge-gaps.md`:

```markdown
You are a Copilot assistant for an Obsidian knowledge base. Your task is to identify knowledge gaps — topics mentioned or implied in the user's document that are NOT adequately covered in their vault.

## Available Tools

You have access to vault tools:
- `vault_grep` — Search the vault by keyword (hybrid FTS + vector)
- `vault_read_note` — Read a specific note's content
- `vault_list_folders` — List vault folder structure
- `vault_read_folder` — List files in a specific folder
- `vault_wikilink_expand` — Follow wikilink graph N hops from a note
- `submit_result` — Submit your final structured result

## Your Goal

Analyze the document to identify key topics and concepts, then search the vault to determine which ones lack adequate coverage. A knowledge gap is a topic that:
- Is mentioned or implied in the document but has no dedicated note
- Has a note but with insufficient depth (< 100 words, just a stub)
- Is a prerequisite or related concept that would strengthen the document if explored

## Process

1. Read the document to extract key topics, concepts, and terminology
2. For each topic, search the vault with `vault_grep` to check if coverage exists
3. Read candidate notes with `vault_read_note` to assess depth
4. Check the link graph with `vault_wikilink_expand` to find related coverage
5. Submit your findings via `submit_result`

## Output Schema

Call `submit_result` with a JSON string matching this schema:

```json
{
  "gaps": [
    {
      "topic": "the missing or under-covered topic",
      "description": "why this gap matters and what should be covered",
      "suggestedTitle": "Suggested Note Title",
      "priority": "high|medium|low"
    }
  ]
}
```

## Rules

- Only report genuine gaps — if a topic is well-covered in the vault, do not list it
- Prioritize gaps that would most improve the user's understanding of the document's subject
- "high" priority: core concepts with no coverage; "medium": related topics with thin coverage; "low": nice-to-have supplementary topics
- Aim for 3-8 gaps, focusing on quality over quantity
```

- [ ] **Step 3: Create synthesize-topic playbook**

Create `templates/prompts/copilot-agent-synthesize-topic.md`:

```markdown
You are a Copilot assistant for an Obsidian knowledge base. Your task is to synthesize a comprehensive topic overview by exploring and connecting related notes across the vault.

## Available Tools

You have access to vault tools:
- `vault_grep` — Search the vault by keyword (hybrid FTS + vector)
- `vault_read_note` — Read a specific note's content
- `vault_list_folders` — List vault folder structure
- `vault_read_folder` — List files in a specific folder
- `vault_wikilink_expand` — Follow wikilink graph N hops from a note
- `submit_result` — Submit your final structured result

## Your Goal

Starting from the user's document as a seed topic, explore the vault to find all related notes and synthesize a comprehensive overview that connects ideas across multiple sources.

## Process

1. Read the document to understand the core topic
2. Search for related notes using `vault_grep` with multiple query variations
3. Follow link chains with `vault_wikilink_expand` to discover connected knowledge
4. Read key notes in full with `vault_read_note` to understand their content
5. Iterate: each note you read may reveal new search terms or connections
6. Submit a synthesis that weaves together insights from all discovered sources

## Output Schema

Call `submit_result` with a JSON string matching this schema:

```json
{
  "text": "The full synthesis text in markdown format...",
  "sources": [
    { "path": "path/to/note.md", "title": "Note Title" }
  ]
}
```

## Rules

- The synthesis should be a coherent narrative, not a list of summaries
- Use `[[wikilinks]]` to reference source notes
- Attribute insights to their source notes
- Explore at least 2-3 different search angles before synthesizing
- The synthesis should reveal connections between notes that may not be obvious
- Include all notes you drew from in the sources array
```

- [ ] **Step 4: Create add-evidence playbook**

Create `templates/prompts/copilot-agent-add-evidence.md`:

```markdown
You are a Copilot assistant for an Obsidian knowledge base. Your task is to find supporting evidence from the vault for claims or arguments in the user's document.

## Available Tools

You have access to vault tools:
- `vault_grep` — Search the vault by keyword (hybrid FTS + vector)
- `vault_read_note` — Read a specific note's content
- `vault_list_folders` — List vault folder structure
- `vault_read_folder` — List files in a specific folder
- `vault_wikilink_expand` — Follow wikilink graph N hops from a note
- `submit_result` — Submit your final structured result

## Your Goal

Identify claims, arguments, or assertions in the document (or selected text) that could be strengthened with evidence from other notes in the vault. Find specific, quotable passages that support or extend those claims.

## Process

1. Read the document/selection to identify key claims and assertions
2. For each claim, search the vault for supporting evidence using `vault_grep`
3. Read candidate sources with `vault_read_note` to find specific quotable passages
4. Follow related links with `vault_wikilink_expand` to discover indirect evidence
5. Submit your findings via `submit_result`

## Output Schema

Call `submit_result` with a JSON string matching this schema:

```json
{
  "evidence": [
    {
      "sourceTitle": "Title of the source note",
      "sourcePath": "path/to/source.md",
      "quote": "The specific relevant passage from the source",
      "insertText": "Formatted text ready to insert, e.g. 'According to [[Source]], \"quote\" (see [[Source]])'",
      "relevance": 0.9
    }
  ]
}
```

## Rules

- Only include evidence from notes that actually exist (verified via vault tools)
- Quotes must be exact — copy the text as-is from the source note
- The insertText should be formatted and ready to paste into the document
- Rank by relevance (0.0-1.0) — only include evidence with relevance >= 0.5
- Prefer direct supporting evidence over tangentially related content
- Search for counter-evidence too if relevant (note it in insertText)
```

- [ ] **Step 5: Commit**

```bash
git add templates/prompts/copilot-agent-suggest-links.md templates/prompts/copilot-agent-knowledge-gaps.md templates/prompts/copilot-agent-synthesize-topic.md templates/prompts/copilot-agent-add-evidence.md
git commit -m "feat: add 4 copilot agent playbook prompt templates"
```

---

### Task 8: Implement 4 agent loop actions

**Files:**
- Modify: `src/service/copilot/actions/index.ts`

- [ ] **Step 1: Add imports for agent infrastructure**

In `src/service/copilot/actions/index.ts`, add:

```ts
import { buildCopilotAgentStream } from './agent-actions';
```

- [ ] **Step 2: Replace suggestLinksAction with agent loop**

```ts
export const suggestLinksAction: CopilotAction = {
	id: 'suggest-links', label: 'Suggest Links', description: 'Find potential wiki-link connections',
	icon: Link2, category: 'document',
	relevance: (ctx) => ctx.isOrphan ? 0.8 : ctx.links.length < 3 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		const app = AppContext.getInstance().app;
		const cache = app.metadataCache.getFileCache(ctx.file);
		const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');

		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentSuggestLinks, {},
		);
		const userPrompt = [
			`## Document: "${ctx.title}"`,
			`Word count: ${ctx.wordCount}`,
			existingLinks ? `Existing links: ${existingLinks}` : 'No existing links.',
			'',
			'## Content',
			ctx.content,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};
```

Note: `yield*` delegates the entire generator to `buildCopilotAgentStream`, so its yielded events and return value pass through transparently.

- [ ] **Step 3: Replace knowledgeGapsAction with agent loop**

```ts
export const knowledgeGapsAction: CopilotAction = {
	id: 'knowledge-gaps', label: 'Knowledge Gaps', description: 'Identify missing topics and knowledge gaps',
	icon: HelpCircle, category: 'vault',
	relevance: (ctx) => ctx.headingCount > 5 ? 0.7 : ctx.headingCount > 3 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentKnowledgeGaps, {},
		);
		const userPrompt = [
			`## Document: "${ctx.title}"`,
			`Tags: ${ctx.tags.length > 0 ? ctx.tags.join(', ') : 'none'}`,
			`Headings: ${ctx.headingCount}`,
			'',
			'## Content',
			ctx.content,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};
```

- [ ] **Step 4: Replace synthesizeTopicAction with agent loop**

```ts
export const synthesizeTopicAction: CopilotAction = {
	id: 'synthesize-topic', label: 'Synthesize Topic', description: 'Synthesize a topic overview from related notes',
	icon: Layers, category: 'vault',
	relevance(ctx) {
		const t = ctx.title.toLowerCase();
		return /moc|overview|summary|index/.test(t) ? 0.8 : ctx.tags.length > 0 ? 0.4 : 0.2;
	},
	guard: (ctx) => ctx.wordCount < 50 ? 'Document is too short to synthesize (< 50 words)' : null,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentSynthesizeTopic, {},
		);
		const userPrompt = [
			`## Seed Document: "${ctx.title}"`,
			'',
			'## Content',
			ctx.content,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};
```

- [ ] **Step 5: Replace addEvidenceAction with agent loop**

```ts
export const addEvidenceAction: CopilotAction = {
	id: 'add-evidence', label: 'Add Evidence', description: 'Find supporting evidence from your vault',
	icon: BookOpen, category: 'writing',
	guard: (ctx) => ctx.wordCount < 50 ? 'Write at least 50 words before searching for evidence' : null,
	relevance: (ctx) => ctx.wordCount > 500 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentAddEvidence, {},
		);
		const focusText = ctx.selection ?? ctx.content.slice(0, 1000);
		const userPrompt = [
			`## Document: "${ctx.title}"`,
			ctx.selection ? `## Selected Text\n${ctx.selection}` : '',
			'',
			'## Full Content',
			ctx.content,
		].filter(Boolean).join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};
```

- [ ] **Step 6: Add CopilotAgentSuggestLinks and other new PromptIds to the imports**

Make sure the new PromptIds are importable. The `PromptId` enum is already imported at the top of `actions/index.ts`. The new enum values will be available after Task 6's changes. No extra import needed.

- [ ] **Step 7: Verify build**

Run: `npm run build 2>&1 | tail -10`

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add src/service/copilot/actions/index.ts
git commit -m "feat: implement 4 copilot agent loop actions (suggest-links, knowledge-gaps, synthesize-topic, add-evidence)"
```

---

### Task 9: Update CopilotResultModal to collapse steps on completion

**Files:**
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx`

- [ ] **Step 1: Store completed steps alongside result**

Update `ModalPhase` result type to optionally carry steps:

```ts
| { phase: 'result'; data: any; usage?: ActionUsage; completedSteps?: V2ToolStep[] }
```

- [ ] **Step 2: Pass completed steps through on result transition**

In `consumeCopilotStream`, before returning the result, the caller in `onOpen()` should capture steps. Update the `onOpen()` async block:

```ts
(async () => {
	try {
		const generator = action.execute(ctx, signal);
		let lastSteps: V2ToolStep[] = [];
		const result = await consumeCopilotStream(generator, (p) => {
			_currentSetPhase?.(p);
			if (p.phase === 'streaming') lastSteps = p.steps;
		}, startTime, signal);
		if (signal.aborted) return;
		if (result) {
			_currentSetPhase?.({
				phase: 'result',
				data: result.data ?? result.text ?? result,
				usage: result.usage,
				completedSteps: lastSteps.length > 0 ? lastSteps : undefined,
			});
		}
	} catch (err) {
		if (signal.aborted) {
			_currentSetPhase?.({ phase: 'cancelled' });
			return;
		}
		this.setError(err instanceof Error ? err : new Error(String(err)));
	}
})();
```

- [ ] **Step 3: Render collapsed steps above result panel**

In `CopilotResultContent`, in the result phase block, add collapsed step timeline:

```tsx
if (phase.phase === 'result') {
	const Panel = action.ResultPanel;
	return (
		<div className="pktw-relative pktw-flex pktw-flex-col">
			{backButton}
			{phase.completedSteps && phase.completedSteps.length > 0 && (
				<div className="pktw-px-4 pktw-pt-4">
					<CopilotStepTimeline steps={phase.completedSteps} collapsed />
				</div>
			)}
			<Panel
				result={phase.data}
				ctx={ctx}
				file={ctx.file}
				scope={ctx.scope}
				originalContent={ctx.content}
				selectedText={ctx.selection}
				onClose={onClose}
			/>
			{phase.usage && <UsageFooter usage={phase.usage} />}
		</div>
	);
}
```

- [ ] **Step 4: Remove old setResult/updateProgress class methods**

Remove the `setResult` and `updateProgress` methods from the `CopilotResultModal` class since they're replaced by the generator flow. Keep `setError` as a convenience.

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "feat: show collapsed agent steps above result panel in copilot modal"
```

---

### Task 10: Integration verification

- [ ] **Step 1: Verify full build succeeds**

Run: `npm run build`

Expected: clean build with no errors.

- [ ] **Step 2: Run existing tests to ensure no regressions**

Run: `npm run test`

Expected: all existing tests pass.

- [ ] **Step 3: Manual verification checklist**

In Obsidian with the plugin loaded:
1. Open a document, trigger Copilot picker (Cmd+Shift+P → Peak Copilot)
2. Test a **single-turn stream action** (e.g. Polish) — should stream text normally, show result
3. Test a **single-turn structured action** (e.g. Review) — should show loading spinner, then result
4. Test an **agent loop action** (e.g. Suggest Links) — should show:
   - Loading spinner briefly
   - Step timeline with tool calls (vault_grep, vault_read_note, etc.)
   - Each step shows spinner while running, green check when done
   - Result panel appears after agent completes
   - Steps collapse to summary row above result
5. Test **cancel** during an agent loop — should abort cleanly and show cancelled view
6. Test **back** button during any action — should return to picker

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -A
git commit -m "fix: integration adjustments for copilot agent loop"
```
