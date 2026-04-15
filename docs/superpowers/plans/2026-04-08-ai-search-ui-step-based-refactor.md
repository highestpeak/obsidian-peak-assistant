# AI Search UI Step-Based Refactor

> **COMPLETED** (2026-04-12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual StreamingAnalysis/CompletedAIAnalysis component pattern with a unified step-based architecture that eliminates the completion flicker, improves streaming UX, and simplifies the codebase.

**Architecture:** A single `SearchResultView` component renders a `StepList` of typed `SearchStep` objects. Each agent phase (classify, decompose, recon, report, etc.) maps to a step type with a dedicated renderer. Completion is a state change on steps — no component unmount/mount. Six Zustand stores are consolidated into three.

**Tech Stack:** React 18, Zustand, framer-motion, existing section components (DashboardBlocksSection, TopSourcesSection, etc.)

---

## File Structure

### New Files
- `src/ui/view/quick-search/store/searchSessionStore.ts` — Unified store (replaces Runtime + Summary + Result + Steps stores)
- `src/ui/view/quick-search/store/searchInteractionsStore.ts` — Interactions store (replaces Interactions + Topics stores)
- `src/ui/view/quick-search/types/search-steps.ts` — SearchStep discriminated union types
- `src/ui/view/quick-search/hooks/useSearchSession.ts` — Hook replacing useAIAnalysis + dispatcher
- `src/ui/view/quick-search/components/SearchResultView.tsx` — Single content component
- `src/ui/view/quick-search/components/StepList.tsx` — Step list with collapse logic
- `src/ui/view/quick-search/components/StepRenderer.tsx` — Type-dispatch to step renderers
- `src/ui/view/quick-search/components/steps/ClassifyStep.tsx`
- `src/ui/view/quick-search/components/steps/DecomposeStep.tsx`
- `src/ui/view/quick-search/components/steps/ReconStep.tsx`
- `src/ui/view/quick-search/components/steps/PlanStep.tsx`
- `src/ui/view/quick-search/components/steps/ReportStep.tsx`
- `src/ui/view/quick-search/components/steps/SummaryStep.tsx`
- `src/ui/view/quick-search/components/steps/SourcesStep.tsx`
- `src/ui/view/quick-search/components/steps/GraphStep.tsx`
- `src/ui/view/quick-search/components/steps/FollowupStep.tsx`
- `src/ui/view/quick-search/components/steps/GenericStep.tsx`

### Modified Files
- `src/ui/view/quick-search/tab-AISearch.tsx` — Rewire to use SearchResultView
- `src/ui/view/quick-search/store/aiAnalysisStore.ts` — Keep snapshot compat functions, remove stores
- `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts` — Update to read from new store
- `src/ui/view/quick-search/hooks/useSearchPipelineStage.ts` — Read from new store steps instead of events
- `src/ui/view/quick-search/SearchModal.tsx` — Update store imports

### Deleted Files
- `src/ui/view/quick-search/components/ai-analysis-state/StreamingAnalysis.tsx`
- `src/ui/view/quick-search/components/ai-analysis-state/CompletedAIAnalysis.tsx`
- `src/ui/view/quick-search/hooks/aiAnalysisStreamDispatcher.ts`

### Kept As-Is (reused inside step renderers)
- `src/ui/view/quick-search/components/ai-analysis-sections/SummarySection.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/DashboardBlocksSection.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/SourcesSection.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/TopicSection.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/MermaidMindFlowSection.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/OverviewMermaidSection.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/FollowupQuestionsBlock.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/HitlInlineInput.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/StepsDisplay.tsx`
- `src/ui/view/quick-search/components/ai-analysis-sections/SearchPipelineStrip.tsx`
- `src/ui/view/quick-search/components/ai-analysis-state/AIAnalysisPreStreamingState.tsx`
- `src/ui/view/quick-search/components/ai-analysis-state/AIAnalysisErrorState.tsx`

---

### Task 1: Define SearchStep Types

**Files:**
- Create: `src/ui/view/quick-search/types/search-steps.ts`

- [ ] **Step 1: Create the SearchStep discriminated union**

```typescript
// src/ui/view/quick-search/types/search-steps.ts
import type { AISearchGraph, AISearchSource, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
import type { PlanSnapshot } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';

export type StepStatus = 'running' | 'completed' | 'error' | 'skipped';

export type SearchStep =
	| ClassifyStep
	| DecomposeStep
	| ReconStep
	| PlanStep
	| ReportStep
	| SummaryStep
	| SourcesStep
	| GraphStep
	| FollowupStep
	| GenericStep;

export interface ClassifyStep {
	type: 'classify';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	dimensions: { id: string; intent_description?: string }[];
}

export interface DecomposeStep {
	type: 'decompose';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	taskCount: number;
	dimensionCount: number;
}

export interface ReconTask {
	index: number;
	label?: string;
	completedFiles: number;
	totalFiles: number;
	currentPath?: string;
	done: boolean;
}

export interface ReconStep {
	type: 'recon';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	tasks: ReconTask[];
	completedIndices: number[];
	total: number;
	/** Per-group progress from evidence phase */
	groupProgress: Record<string, { completedTasks: number; totalTasks: number; currentPath?: string }>;
}

export interface PlanStep {
	type: 'plan';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	snapshot?: PlanSnapshot;
	hitlPauseId?: string;
	hitlPhase?: string;
	userFeedback?: UserFeedback;
}

export interface ReportStep {
	type: 'report';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	blocks: DashboardBlock[];
	blockOrder: string[];
	completedBlocks: string[];
	dashboardUpdatedLine?: string;
}

export interface SummaryStep {
	type: 'summary';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	chunks: string[];
	streaming: boolean;
}

export interface SourcesStep {
	type: 'sources';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	sources: AISearchSource[];
	evidenceIndex: EvidenceIndex;
}

export interface GraphStep {
	type: 'graph';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	graphData: AISearchGraph | null;
	mindflowMermaid: string;
	overviewMermaidVersions: string[];
	overviewMermaidActiveIndex: number;
}

export interface FollowupStep {
	type: 'followup';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	questions: string[];
}

export interface GenericStep {
	type: 'generic';
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
	title: string;
	description: string;
}

/** Phase name from VaultSearchAgent → SearchStep type mapping */
export const PHASE_TO_STEP_TYPE: Record<string, SearchStep['type']> = {
	'classify': 'classify',
	'decompose': 'decompose',
	'intuition-feedback': 'generic',
	'recon': 'recon',
	'present-plan': 'plan',
	'report': 'report',
};

/** Which step types auto-collapse when completed */
export const AUTO_COLLAPSE_TYPES: Set<SearchStep['type']> = new Set([
	'classify', 'decompose', 'recon', 'plan', 'generic',
]);

/** Which step types stay expanded when completed */
export const STAY_EXPANDED_TYPES: Set<SearchStep['type']> = new Set([
	'report', 'summary', 'sources', 'graph', 'followup',
]);

/** Create a default step for a given type */
export function createStep(type: SearchStep['type'], id?: string): SearchStep {
	const base = { id: id ?? `${type}-${Date.now()}`, status: 'running' as StepStatus, startedAt: Date.now() };
	switch (type) {
		case 'classify':   return { ...base, type, dimensions: [] };
		case 'decompose':  return { ...base, type, taskCount: 0, dimensionCount: 0 };
		case 'recon':      return { ...base, type, tasks: [], completedIndices: [], total: 0, groupProgress: {} };
		case 'plan':       return { ...base, type };
		case 'report':     return { ...base, type, blocks: [], blockOrder: [], completedBlocks: [] };
		case 'summary':    return { ...base, type, chunks: [], streaming: false };
		case 'sources':    return { ...base, type, sources: [], evidenceIndex: {} };
		case 'graph':      return { ...base, type, graphData: null, mindflowMermaid: '', overviewMermaidVersions: [], overviewMermaidActiveIndex: 0 };
		case 'followup':   return { ...base, type, questions: [] };
		case 'generic':    return { ...base, type, title: '', description: '' };
	}
}
```

- [ ] **Step 2: Build to verify types compile**

Run: `npm run build`
Expected: Build succeeds (new file has no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/types/search-steps.ts
git commit -m "feat: define SearchStep discriminated union types for step-based UI"
```

---

### Task 2: Create searchSessionStore

**Files:**
- Create: `src/ui/view/quick-search/store/searchSessionStore.ts`

- [ ] **Step 1: Create the unified session store**

This store consolidates Runtime + Summary + Result + Steps. It stores the session metadata and the `steps: SearchStep[]` array.

```typescript
// src/ui/view/quick-search/store/searchSessionStore.ts
import { create } from 'zustand';
import type { SearchStep, StepStatus, ReconTask } from '../types/search-steps';
import { createStep, PHASE_TO_STEP_TYPE } from '../types/search-steps';
import type { LLMUsage } from '@/core/providers/types';
import { mergeTokenUsage } from '@/core/providers/types';
import type { AnalysisMode } from '@/service/agents/shared-types';
import type { AISearchGraph, AISearchSource, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
import type { PlanSnapshot } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';

export type SessionStatus = 'idle' | 'starting' | 'streaming' | 'completed' | 'error' | 'canceled';

export interface SearchSession {
	id: string | null;
	query: string;
	status: SessionStatus;
	startedAt: number | null;
	duration: number | null;
	usage: LLMUsage | null;
	title: string | null;
	error: string | null;
	analysisMode: AnalysisMode;
	runAnalysisMode: AnalysisMode | null;
	webEnabled: boolean;
	isInputFrozen: boolean;
	/** True once the first streaming token arrives */
	hasStartedStreaming: boolean;
	/** True once the agent has produced any result data */
	hasAnalyzed: boolean;
}

export interface SearchSessionState {
	session: SearchSession;
	steps: SearchStep[];
	/** Trigger counter — increment to start analysis */
	triggerAnalysis: number;
	/** HITL state */
	hitlState: { isPaused: boolean; pauseId: string; phase: string; snapshot: PlanSnapshot } | null;
	hitlFeedbackCallback: ((feedback: UserFeedback) => Promise<void>) | null;
	/** Auto-save tracking */
	autoSaveState: { lastRunId: string | null; lastSavedSummaryHash: string | null; lastSavedPath: string | null };
	/** Whether result was restored from history */
	restoredFromHistory: boolean;
	restoredFromVaultPath: string | null;
	/** Whether modal is open */
	aiModalOpen: boolean;
	/** Dashboard update line (from DashboardUpdateAgent) */
	dashboardUpdatedLine: string;
}

const defaultSession: SearchSession = {
	id: null,
	query: '',
	status: 'idle',
	startedAt: null,
	duration: null,
	usage: null,
	title: null,
	error: null,
	analysisMode: 'vaultFull',
	runAnalysisMode: null,
	webEnabled: false,
	isInputFrozen: false,
	hasStartedStreaming: false,
	hasAnalyzed: false,
};

export interface SearchSessionActions {
	// Session lifecycle
	incrementTriggerAnalysis: () => void;
	startSession: (query: string) => void;
	startStreaming: () => void;
	markCompleted: () => void;
	recordError: (error: string) => void;

	// Session metadata
	setTitle: (title: string | null) => void;
	setUsage: (usage: LLMUsage) => void;
	accumulateUsage: (usage: LLMUsage) => void;
	setDuration: (duration: number) => void;
	setHasAnalyzed: (v: boolean) => void;
	setDashboardUpdatedLine: (line: string) => void;
	setAiModalOpen: (open: boolean) => void;
	setAnalysisMode: (mode: AnalysisMode) => void;
	toggleWeb: (currentQuery: string) => string;
	updateWebFromQuery: (query: string) => void;
	setAutoSaveState: (s: { lastRunId?: string | null; lastSavedSummaryHash?: string | null; lastSavedPath?: string | null }) => void;

	// Step management
	pushStep: (step: SearchStep) => void;
	updateStep: <T extends SearchStep['type']>(type: T, updater: (step: Extract<SearchStep, { type: T }>) => void) => void;
	/** Push step from phase-transition event */
	pushPhaseStep: (phaseName: string) => void;
	/** Mark the current running step of given type as completed */
	completeStep: (type: SearchStep['type']) => void;
	/** Mark all running steps as completed */
	markAllStepsCompleted: () => void;

	// HITL
	setHitlPause: (state: { pauseId: string; phase: string; snapshot: PlanSnapshot }) => void;
	clearHitlPause: () => void;
	setHitlFeedbackCallback: (cb: ((feedback: UserFeedback) => Promise<void>) | null) => void;

	// History restore
	setRestoredFromHistory: (v: boolean, vaultPath?: string | null) => void;

	// Full reset
	resetAll: () => void;

	// Computed helpers
	getStep: <T extends SearchStep['type']>(type: T) => Extract<SearchStep, { type: T }> | undefined;
	getIsAnalyzing: () => boolean;
	getIsCompleted: () => boolean;
	getHasContent: () => boolean;
}

export const useSearchSessionStore = create<SearchSessionState & SearchSessionActions>((set, get) => ({
	session: { ...defaultSession },
	steps: [],
	triggerAnalysis: 0,
	hitlState: null,
	hitlFeedbackCallback: null,
	autoSaveState: { lastRunId: null, lastSavedSummaryHash: null, lastSavedPath: null },
	restoredFromHistory: false,
	restoredFromVaultPath: null,
	aiModalOpen: false,
	dashboardUpdatedLine: '',

	// Session lifecycle
	incrementTriggerAnalysis: () => set((s) => ({ triggerAnalysis: s.triggerAnalysis + 1 })),
	startSession: (query) => {
		const ts = Date.now();
		const mode = get().session.analysisMode;
		set({
			session: {
				...defaultSession,
				id: `run:${ts}`,
				query,
				status: 'starting',
				startedAt: ts,
				analysisMode: mode,
				runAnalysisMode: mode,
				webEnabled: get().session.webEnabled,
				isInputFrozen: true,
			},
			steps: [],
			hitlState: null,
			restoredFromHistory: false,
			restoredFromVaultPath: null,
			dashboardUpdatedLine: '',
			autoSaveState: { ...get().autoSaveState, lastSavedPath: null },
		});
	},
	startStreaming: () => set((s) => ({
		session: { ...s.session, status: 'streaming', hasStartedStreaming: true },
	})),
	markCompleted: () => {
		const s = get();
		// Mark all running steps as completed
		const steps = s.steps.map((step) =>
			step.status === 'running' ? { ...step, status: 'completed' as StepStatus, endedAt: step.endedAt ?? Date.now() } : step
		);
		// Finalize summary step streaming flag
		const finalSteps = steps.map((step) =>
			step.type === 'summary' ? { ...step, streaming: false } : step
		);
		set({
			session: { ...s.session, status: 'completed', isInputFrozen: false, hasStartedStreaming: false },
			steps: finalSteps,
		});
	},
	recordError: (error) => set((s) => ({
		session: { ...s.session, status: 'error', error, isInputFrozen: false },
	})),

	// Session metadata
	setTitle: (title) => set((s) => ({ session: { ...s.session, title } })),
	setUsage: (usage) => set((s) => ({ session: { ...s.session, usage } })),
	accumulateUsage: (usage) => set((s) => ({
		session: { ...s.session, usage: s.session.usage ? mergeTokenUsage(s.session.usage, usage) : usage },
	})),
	setDuration: (duration) => set((s) => ({ session: { ...s.session, duration } })),
	setHasAnalyzed: (v) => set((s) => ({ session: { ...s.session, hasAnalyzed: v } })),
	setDashboardUpdatedLine: (line) => set({ dashboardUpdatedLine: line }),
	setAiModalOpen: (open) => set({ aiModalOpen: open }),
	setAnalysisMode: (mode) => set((s) => ({ session: { ...s.session, analysisMode: mode } })),
	toggleWeb: (currentQuery) => {
		const next = !get().session.webEnabled;
		set((s) => ({ session: { ...s.session, webEnabled: next } }));
		return currentQuery;
	},
	updateWebFromQuery: (query) => {
		if (query.includes('@web@') && !get().session.webEnabled) {
			set((s) => ({ session: { ...s.session, webEnabled: true } }));
		}
	},
	setAutoSaveState: (s) => set((prev) => ({
		autoSaveState: {
			lastRunId: s.lastRunId !== undefined ? s.lastRunId : prev.autoSaveState.lastRunId,
			lastSavedSummaryHash: s.lastSavedSummaryHash !== undefined ? s.lastSavedSummaryHash : prev.autoSaveState.lastSavedSummaryHash,
			lastSavedPath: s.lastSavedPath !== undefined ? s.lastSavedPath : prev.autoSaveState.lastSavedPath,
		},
	})),

	// Step management
	pushStep: (step) => set((s) => ({ steps: [...s.steps, step] })),
	updateStep: (type, updater) => set((s) => {
		const idx = s.steps.findLastIndex((st) => st.type === type);
		if (idx === -1) return s;
		const next = [...s.steps];
		const clone = { ...next[idx] } as any;
		updater(clone);
		next[idx] = clone;
		return { steps: next };
	}),
	pushPhaseStep: (phaseName) => {
		const stepType = PHASE_TO_STEP_TYPE[phaseName];
		if (!stepType) return;
		// Complete the previous running step of the same phase category
		const s = get();
		const steps = s.steps.map((step) =>
			step.status === 'running' ? { ...step, status: 'completed' as StepStatus, endedAt: Date.now() } : step
		);
		const newStep = createStep(stepType, `${stepType}-${Date.now()}`);
		set({ steps: [...steps, newStep] });
	},
	completeStep: (type) => set((s) => {
		const idx = s.steps.findLastIndex((st) => st.type === type && st.status === 'running');
		if (idx === -1) return s;
		const next = [...s.steps];
		next[idx] = { ...next[idx], status: 'completed', endedAt: Date.now() };
		return { steps: next };
	}),
	markAllStepsCompleted: () => set((s) => ({
		steps: s.steps.map((step) =>
			step.status === 'running' ? { ...step, status: 'completed' as StepStatus, endedAt: step.endedAt ?? Date.now() } : step
		),
	})),

	// HITL
	setHitlPause: (state) => set({ hitlState: { isPaused: true, ...state } }),
	clearHitlPause: () => set({ hitlState: null }),
	setHitlFeedbackCallback: (cb) => set({ hitlFeedbackCallback: cb }),

	// History restore
	setRestoredFromHistory: (v, vaultPath) => set({ restoredFromHistory: v, restoredFromVaultPath: vaultPath ?? null }),

	// Full reset
	resetAll: () => set({
		session: { ...defaultSession, analysisMode: get().session.analysisMode, webEnabled: get().session.webEnabled },
		steps: [],
		hitlState: null,
		dashboardUpdatedLine: '',
	}),

	// Computed helpers
	getStep: (type) => get().steps.find((s) => s.type === type) as any,
	getIsAnalyzing: () => {
		const status = get().session.status;
		return status === 'starting' || status === 'streaming';
	},
	getIsCompleted: () => get().session.status === 'completed',
	getHasContent: () => {
		const steps = get().steps;
		return steps.some((s) =>
			(s.type === 'report' && s.blocks.length > 0) ||
			(s.type === 'summary' && s.chunks.length > 0) ||
			(s.type === 'sources' && s.sources.length > 0)
		);
	},
}));
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat: create unified searchSessionStore replacing 4 fragmented stores"
```

---

### Task 3: Create searchInteractionsStore

**Files:**
- Create: `src/ui/view/quick-search/store/searchInteractionsStore.ts`

- [ ] **Step 1: Create interactions store**

This is essentially the existing `useAIAnalysisInteractionsStore` + `useAIAnalysisTopicsStore` merged into one. Copy the existing logic from `aiAnalysisStore.ts` lines ~400-625 and consolidate.

Keep the same interface as the existing stores — this is a mechanical merge, not a rewrite. The key types (`SectionAnalyzeResult`, `SectionAnalyzeStreaming`, `ContextChatModalState`) and all methods (`setContextChatModal`, `appendGraphFollowup`, `appendBlocksFollowup`, etc.) stay the same.

- [ ] **Step 2: Build to verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/store/searchInteractionsStore.ts
git commit -m "feat: create searchInteractionsStore merging interactions + topics"
```

---

### Task 4: Create useSearchSession hook (event consumer)

**Files:**
- Create: `src/ui/view/quick-search/hooks/useSearchSession.ts`

- [ ] **Step 1: Create the hook**

This replaces `useAIAnalysis` + `aiAnalysisStreamDispatcher`. The event consumption is inline — no separate dispatcher. The key difference: events update `steps[]` in `searchSessionStore` instead of 6 separate stores.

Key mapping logic:
- `phase-transition` → `pushPhaseStep(event.to)` — creates new step in steps array
- `text-delta` (SEARCH_SUMMARY trigger) → `updateStep('summary', s => s.chunks.push(delta))`
- `tool-result` with `currentResult` → update report/sources/graph steps from result data
- `ui-signal` (SEARCH_STAGE) → update recon step progress (dimensions, tasks, completedIndices)
- `ui-signal` (OVERVIEW_MERMAID) → update graph step mermaid versions
- `ui-step` / `ui-step-delta` → still publish to UIEventStore for StepsDisplay (kept for backward compat)
- `complete` → call `markCompleted()`, set usage/duration
- `hitl-pause` → set hitl state on plan step + session store
- `parallel-stream-progress` → update recon step progress

The hook exposes `performAnalysis()` and `cancel()` — same interface as the old `useAIAnalysis`.

Ensure the summary step is created when the first `text-start` event arrives (if not already present). Ensure the sources step is created/updated when `applySearchResult` sets sources. Same for report (blocks) and graph.

For the `complete` event: call `deps.onFinalResult` for final data, then `store.markCompleted()`.

The `finally` block should guard `markCompleted()` with `if (store.getIsCompleted()) return`.

- [ ] **Step 2: Build to verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "feat: create useSearchSession hook with inline event consumption"
```

---

### Task 5: Create Step Renderer Components

**Files:**
- Create: `src/ui/view/quick-search/components/steps/ClassifyStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/DecomposeStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/ReconStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/PlanStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/ReportStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/SummaryStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/SourcesStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/GraphStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/FollowupStep.tsx`
- Create: `src/ui/view/quick-search/components/steps/GenericStep.tsx`
- Create: `src/ui/view/quick-search/components/StepRenderer.tsx`

- [ ] **Step 1: Create GenericStep**

A simple step showing title + description with a status indicator. Used for `intuition-feedback` phase and any unmapped phases.

```tsx
// src/ui/view/quick-search/components/steps/GenericStep.tsx
import React from 'react';
import type { GenericStep as GenericStepType } from '../../types/search-steps';

export const GenericStepView: React.FC<{ step: GenericStepType }> = ({ step }) => (
	<div className="pktw-text-sm pktw-text-[#6b7280]">
		{step.title ? <span className="pktw-font-medium pktw-text-[#2e3338]">{step.title}</span> : null}
		{step.description ? <span className="pktw-ml-2">{step.description}</span> : null}
	</div>
);
```

- [ ] **Step 2: Create ClassifyStep**

Shows dimension chips with semantic/topology/temporal coloring. Reuse the dimension chip rendering logic from SearchPipelineStrip's classify DetailStrip.

```tsx
// src/ui/view/quick-search/components/steps/ClassifyStep.tsx
import React from 'react';
import type { ClassifyStep as ClassifyStepType } from '../../types/search-steps';
import { motion } from 'framer-motion';

const DIMENSION_COLORS: Record<string, string> = {
	semantic: 'pktw-bg-blue-100 pktw-text-blue-700',
	topology: 'pktw-bg-green-100 pktw-text-green-700',
	temporal: 'pktw-bg-amber-100 pktw-text-amber-700',
};

export const ClassifyStepView: React.FC<{ step: ClassifyStepType }> = ({ step }) => (
	<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
		{step.dimensions.map((d, i) => {
			const colorClass = DIMENSION_COLORS[d.id] ?? 'pktw-bg-gray-100 pktw-text-gray-700';
			return (
				<motion.span
					key={d.id}
					initial={{ opacity: 0, scale: 0.8 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ delay: i * 0.05 }}
					className={`pktw-px-2 pktw-py-0.5 pktw-rounded-full pktw-text-xs pktw-font-medium ${colorClass}`}
					title={d.intent_description}
				>
					{d.id}
				</motion.span>
			);
		})}
	</div>
);
```

- [ ] **Step 3: Create DecomposeStep**

Shows dimension count → task count.

```tsx
// src/ui/view/quick-search/components/steps/DecomposeStep.tsx
import React from 'react';
import type { DecomposeStep as DecomposeStepType } from '../../types/search-steps';

export const DecomposeStepView: React.FC<{ step: DecomposeStepType }> = ({ step }) => (
	<div className="pktw-text-sm pktw-text-[#6b7280]">
		{step.dimensionCount} dimensions → {step.taskCount} tasks
	</div>
);
```

- [ ] **Step 4: Create ReconStep**

Shows per-task progress bars + currently reading file. This is the Phase 4 UX enhancement.

```tsx
// src/ui/view/quick-search/components/steps/ReconStep.tsx
import React from 'react';
import type { ReconStep as ReconStepType } from '../../types/search-steps';
import { motion } from 'framer-motion';

export const ReconStepView: React.FC<{ step: ReconStepType }> = ({ step }) => {
	const totalTasks = step.total || step.tasks.length || 1;
	const completedCount = step.completedIndices.length;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{/* Per-task progress */}
			{step.tasks.length > 0 ? (
				step.tasks.map((task, i) => (
					<div key={i} className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs">
						<span className="pktw-w-14 pktw-text-[#6b7280] pktw-shrink-0">Task {task.index + 1}</span>
						<div className="pktw-flex-1 pktw-h-1.5 pktw-bg-[#e5e7eb] pktw-rounded-full pktw-overflow-hidden">
							<motion.div
								className={`pktw-h-full pktw-rounded-full ${task.done ? 'pktw-bg-[#10b981]' : 'pktw-bg-[#7c3aed]'}`}
								initial={{ width: 0 }}
								animate={{ width: task.totalFiles > 0 ? `${(task.completedFiles / task.totalFiles) * 100}%` : '0%' }}
								transition={{ duration: 0.3 }}
							/>
						</div>
						<span className="pktw-text-[#9ca3af] pktw-w-12 pktw-text-right pktw-shrink-0">
							{task.completedFiles}/{task.totalFiles}
						</span>
					</div>
				))
			) : (
				/* Fallback: single progress indicator */
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs">
					<div className="pktw-flex-1 pktw-h-1.5 pktw-bg-[#e5e7eb] pktw-rounded-full pktw-overflow-hidden">
						<motion.div
							className="pktw-h-full pktw-rounded-full pktw-bg-[#7c3aed]"
							animate={{ width: totalTasks > 0 ? `${(completedCount / totalTasks) * 100}%` : '0%' }}
							transition={{ duration: 0.3 }}
						/>
					</div>
					<span className="pktw-text-[#9ca3af]">Task {completedCount}/{totalTasks}</span>
				</div>
			)}

			{/* Currently reading file */}
			{Object.entries(step.groupProgress).map(([groupId, progress]) =>
				progress.currentPath ? (
					<div key={groupId} className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-text-[#9ca3af] pktw-truncate">
						<span className="pktw-opacity-60">reading</span>
						<span className="pktw-text-[#6b7280] pktw-truncate">{progress.currentPath}</span>
					</div>
				) : null
			)}
		</div>
	);
};
```

- [ ] **Step 5: Create PlanStep**

Shows HITL inline input when paused. Reuses `HitlInlineInput`.

```tsx
// src/ui/view/quick-search/components/steps/PlanStep.tsx
import React from 'react';
import type { PlanStep as PlanStepType } from '../../types/search-steps';
import { HitlInlineInput } from '../ai-analysis-sections/HitlInlineInput';

export const PlanStepView: React.FC<{ step: PlanStepType }> = ({ step }) => {
	if (step.hitlPauseId && step.snapshot && step.status === 'running') {
		return (
			<HitlInlineInput
				pauseId={step.hitlPauseId}
				phase={step.hitlPhase ?? 'present-plan'}
				snapshot={step.snapshot}
			/>
		);
	}
	if (step.status === 'completed') {
		return (
			<div className="pktw-text-xs pktw-text-[#6b7280]">
				Plan reviewed{step.userFeedback ? ` — ${step.userFeedback.decision}` : ''}
			</div>
		);
	}
	return (
		<div className="pktw-text-xs pktw-text-[#9ca3af]">Preparing report plan...</div>
	);
};
```

- [ ] **Step 6: Create ReportStep**

Wraps `DashboardBlocksSection`. This is where streaming blocks render inline.

```tsx
// src/ui/view/quick-search/components/steps/ReportStep.tsx
import React from 'react';
import type { ReportStep as ReportStepType } from '../../types/search-steps';
import { DashboardBlocksSection } from '../ai-analysis-sections/DashboardBlocksSection';

export const ReportStepView: React.FC<{
	step: ReportStepType;
	onClose?: () => void;
}> = ({ step, onClose }) => {
	if (step.blocks.length === 0) {
		return step.status === 'running' ? (
			<div className="pktw-text-xs pktw-text-[#9ca3af]">Generating report blocks...</div>
		) : null;
	}
	return (
		<DashboardBlocksSection
			blocks={step.blocks}
			isStreaming={step.status === 'running'}
		/>
	);
};
```

- [ ] **Step 7: Create SummaryStep**

Wraps `SummaryContent` inside `IntelligenceFrame`.

```tsx
// src/ui/view/quick-search/components/steps/SummaryStep.tsx
import React from 'react';
import type { SummaryStep as SummaryStepType } from '../../types/search-steps';
import { SummaryContent } from '../ai-analysis-sections/SummarySection';
import { IntelligenceFrame } from '../../../../component/mine/IntelligenceFrame';

export const SummaryStepView: React.FC<{
	step: SummaryStepType;
	startedAtMs: number | null;
	durationMs: number | null;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}> = ({ step, startedAtMs, durationMs, onOpenWikilink }) => {
	if (step.chunks.length === 0) return null;
	return (
		<IntelligenceFrame isActive={step.streaming} className="pktw-mb-1">
			<SummaryContent
				startedAtMs={startedAtMs}
				finalDurationMs={step.status === 'completed' ? durationMs : null}
				onOpenWikilink={onOpenWikilink}
			/>
		</IntelligenceFrame>
	);
};
```

Note: `SummaryContent` currently reads from `useAIAnalysisSummaryStore`. During migration, we will need it to read from `searchSessionStore` instead. This can be done by either (a) having `SummaryContent` accept chunks as a prop, or (b) keeping a bridge that syncs summary data. For this task, use approach (b) — a bridge layer in Task 7 will sync the new store data into the old summary store so `SummaryContent` works unchanged.

- [ ] **Step 8: Create SourcesStep**

Wraps `TopSourcesSection`.

```tsx
// src/ui/view/quick-search/components/steps/SourcesStep.tsx
import React from 'react';
import type { SourcesStep as SourcesStepType } from '../../types/search-steps';
import { TopSourcesSection } from '../ai-analysis-sections/SourcesSection';
import { convertSourcesToSearchResultItems } from '../../hooks/useAIAnalysisResult';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { useSearchSessionStore } from '../../store/searchSessionStore';

export const SourcesStepView: React.FC<{
	step: SourcesStepType;
	onClose?: () => void;
}> = ({ step, onClose }) => {
	const graphStep = useSearchSessionStore((s) => s.steps.find((st) => st.type === 'graph'));
	const graph = graphStep?.type === 'graph' ? graphStep.graphData : null;

	if (step.sources.length === 0 && Object.keys(step.evidenceIndex).length === 0) return null;

	const dedupedSources = (() => {
		const seen = new Set<string>();
		return step.sources.filter((s: any) => {
			const path = String(s?.path ?? '').trim();
			const id = String(s?.id ?? '').trim();
			const key = path ? `path:${path}` : (id ? `id:${id}` : '');
			if (!key) return false;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	})();

	return (
		<TopSourcesSection
			sources={convertSourcesToSearchResultItems(dedupedSources)}
			onOpen={onClose ? createOpenSourceCallback(onClose) : () => {}}
			skipAnimation={step.status === 'completed'}
			evidenceIndex={step.evidenceIndex}
			graph={graph}
		/>
	);
};
```

- [ ] **Step 9: Create GraphStep**

Wraps `MermaidMindFlowSection` and `OverviewMermaidSection`.

```tsx
// src/ui/view/quick-search/components/steps/GraphStep.tsx
import React from 'react';
import type { GraphStep as GraphStepType } from '../../types/search-steps';
import { MermaidMindFlowSection } from '../ai-analysis-sections/MermaidMindFlowSection';

export const GraphStepView: React.FC<{ step: GraphStepType }> = ({ step }) => {
	if (!(step.mindflowMermaid ?? '').trim()) return null;
	return (
		<MermaidMindFlowSection
			mindflowMermaid={step.mindflowMermaid}
			maxHeightClassName="pktw-min-h-[160px]"
			containerClassName="pktw-flex-1 pktw-min-h-0"
		/>
	);
};
```

- [ ] **Step 10: Create FollowupStep**

Wraps `FollowupQuestionsBlock`.

```tsx
// src/ui/view/quick-search/components/steps/FollowupStep.tsx
import React from 'react';
import type { FollowupStep as FollowupStepType } from '../../types/search-steps';
import { FollowupQuestionsBlock } from '../ai-analysis-sections/FollowupQuestionsBlock';

export const FollowupStepView: React.FC<{
	step: FollowupStepType;
	onClose?: () => void;
}> = ({ step, onClose }) => {
	// FollowupQuestionsBlock reads from store internally, so just render it
	// The summary is read from the summary step
	const summaryStep = require('../../store/searchSessionStore').useSearchSessionStore.getState()
		.steps.find((s: any) => s.type === 'summary');
	const summary = summaryStep?.type === 'summary' ? summaryStep.chunks.join('') : '';

	return <FollowupQuestionsBlock summary={summary} onClose={onClose} />;
};
```

- [ ] **Step 11: Create StepRenderer dispatcher**

```tsx
// src/ui/view/quick-search/components/StepRenderer.tsx
import React from 'react';
import type { SearchStep } from '../types/search-steps';
import { ClassifyStepView } from './steps/ClassifyStep';
import { DecomposeStepView } from './steps/DecomposeStep';
import { ReconStepView } from './steps/ReconStep';
import { PlanStepView } from './steps/PlanStep';
import { ReportStepView } from './steps/ReportStep';
import { SummaryStepView } from './steps/SummaryStep';
import { SourcesStepView } from './steps/SourcesStep';
import { GraphStepView } from './steps/GraphStep';
import { FollowupStepView } from './steps/FollowupStep';
import { GenericStepView } from './steps/GenericStep';

export const StepRenderer: React.FC<{
	step: SearchStep;
	onClose?: () => void;
	startedAtMs: number | null;
	durationMs: number | null;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}> = ({ step, onClose, startedAtMs, durationMs, onOpenWikilink }) => {
	switch (step.type) {
		case 'classify':  return <ClassifyStepView step={step} />;
		case 'decompose': return <DecomposeStepView step={step} />;
		case 'recon':     return <ReconStepView step={step} />;
		case 'plan':      return <PlanStepView step={step} />;
		case 'report':    return <ReportStepView step={step} onClose={onClose} />;
		case 'summary':   return <SummaryStepView step={step} startedAtMs={startedAtMs} durationMs={durationMs} onOpenWikilink={onOpenWikilink} />;
		case 'sources':   return <SourcesStepView step={step} onClose={onClose} />;
		case 'graph':     return <GraphStepView step={step} />;
		case 'followup':  return <FollowupStepView step={step} onClose={onClose} />;
		case 'generic':   return <GenericStepView step={step} />;
	}
};
```

- [ ] **Step 12: Build to verify**

Run: `npm run build`

- [ ] **Step 13: Commit**

```bash
git add src/ui/view/quick-search/components/steps/ src/ui/view/quick-search/components/StepRenderer.tsx
git commit -m "feat: create step renderer components for each SearchStep type"
```

---

### Task 6: Create StepList and SearchResultView

**Files:**
- Create: `src/ui/view/quick-search/components/StepList.tsx`
- Create: `src/ui/view/quick-search/components/SearchResultView.tsx`

- [ ] **Step 1: Create StepList**

Handles the collapse/expand logic per step, auto-scrolling to active step, and step status indicators.

```tsx
// src/ui/view/quick-search/components/StepList.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SearchStep } from '../types/search-steps';
import { AUTO_COLLAPSE_TYPES } from '../types/search-steps';
import { StepRenderer } from './StepRenderer';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, ChevronDown } from 'lucide-react';

const STEP_LABELS: Record<SearchStep['type'], string> = {
	classify: 'Classify',
	decompose: 'Decompose',
	recon: 'Exploring vault',
	plan: 'Review plan',
	report: 'Report',
	summary: 'Summary',
	sources: 'Sources',
	graph: 'Knowledge graph',
	followup: 'Follow-up',
	generic: 'Processing',
};

const StatusIcon: React.FC<{ status: SearchStep['status'] }> = ({ status }) => {
	if (status === 'completed') {
		return (
			<motion.div
				className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#10b981] pktw-flex pktw-items-center pktw-justify-center"
				initial={{ scale: 0 }}
				animate={{ scale: 1 }}
				transition={{ type: 'spring', stiffness: 400, damping: 15 }}
			>
				<Check className="pktw-w-2 pktw-h-2 pktw-text-white" strokeWidth={3} />
			</motion.div>
		);
	}
	if (status === 'running') {
		return (
			<div className="pktw-relative pktw-w-3 pktw-h-3 pktw-flex pktw-items-center pktw-justify-center">
				<motion.div
					className="pktw-absolute pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#7c3aed]"
					animate={{ scale: [1, 1.8, 1.8], opacity: [0.6, 0, 0] }}
					transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
				/>
				<div className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[#7c3aed]" />
			</div>
		);
	}
	if (status === 'error') {
		return <div className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-red-500" />;
	}
	return <div className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#e5e7eb]" />;
};

const StepDuration: React.FC<{ step: SearchStep }> = ({ step }) => {
	const [elapsed, setElapsed] = useState(0);
	const rafRef = useRef<number>();

	useEffect(() => {
		if (step.status !== 'running') {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			return;
		}
		const update = () => {
			setElapsed(Date.now() - step.startedAt);
			rafRef.current = requestAnimationFrame(update);
		};
		rafRef.current = requestAnimationFrame(update);
		return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
	}, [step.status, step.startedAt]);

	if (step.status === 'running') {
		return <span className="pktw-text-[#7c3aed] pktw-font-mono pktw-text-xs pktw-tabular-nums">{(elapsed / 1000).toFixed(1)}s</span>;
	}
	if (step.endedAt && step.startedAt) {
		return <span className="pktw-text-[#9ca3af] pktw-font-mono pktw-text-xs pktw-tabular-nums">{((step.endedAt - step.startedAt) / 1000).toFixed(1)}s</span>;
	}
	return null;
};

export const StepList: React.FC<{
	steps: SearchStep[];
	onClose?: () => void;
	startedAtMs: number | null;
	durationMs: number | null;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}> = ({ steps, onClose, startedAtMs, durationMs, onOpenWikilink }) => {
	// Track which steps are manually toggled by user
	const [manualToggles, setManualToggles] = useState<Record<string, boolean>>({});
	const listEndRef = useRef<HTMLDivElement>(null);
	const prevStepCountRef = useRef(0);

	// Auto-scroll when new step appears
	useEffect(() => {
		if (steps.length > prevStepCountRef.current) {
			const lastStep = steps[steps.length - 1];
			if (lastStep?.status === 'running') {
				// Scroll to the new step smoothly
				setTimeout(() => {
					document.getElementById(`step-${lastStep.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}, 50);
			}
		}
		prevStepCountRef.current = steps.length;
	}, [steps.length]);

	const isExpanded = useCallback((step: SearchStep) => {
		// User manual toggle takes precedence
		if (manualToggles[step.id] !== undefined) return manualToggles[step.id];
		// Running steps are always expanded
		if (step.status === 'running') return true;
		// Auto-collapse types are collapsed when completed
		if (step.status === 'completed' && AUTO_COLLAPSE_TYPES.has(step.type)) return false;
		// Everything else stays expanded
		return true;
	}, [manualToggles]);

	const toggleStep = (stepId: string) => {
		setManualToggles((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1">
			{steps.map((step) => {
				const expanded = isExpanded(step);
				const label = step.type === 'generic' && (step as any).title
					? (step as any).title
					: STEP_LABELS[step.type] ?? step.type;

				return (
					<div key={step.id} id={`step-${step.id}`} className="pktw-scroll-mt-4">
						{/* Step header — always visible */}
						<div
							className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-1 pktw-rounded-md hover:pktw-bg-[#f5f3ff]/50 pktw-cursor-pointer pktw-select-none"
							onClick={() => toggleStep(step.id)}
						>
							<StatusIcon status={step.status} />
							{expanded
								? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
								: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
							}
							<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-flex-1">{label}</span>
							<StepDuration step={step} />
						</div>

						{/* Step content — collapsible */}
						<AnimatePresence initial={false}>
							{expanded ? (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: 'auto', opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.2 }}
									className="pktw-overflow-hidden pktw-pl-7"
								>
									<div className="pktw-py-1">
										<StepRenderer
											step={step}
											onClose={onClose}
											startedAtMs={startedAtMs}
											durationMs={durationMs}
											onOpenWikilink={onOpenWikilink}
										/>
									</div>
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
				);
			})}
			<div ref={listEndRef} />
		</div>
	);
};
```

- [ ] **Step 2: Create SearchResultView**

The single content component that replaces both StreamingAnalysis and CompletedAIAnalysis.

```tsx
// src/ui/view/quick-search/components/SearchResultView.tsx
import React from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { StepList } from './StepList';
import { AIAnalysisPreStreamingState } from './ai-analysis-state/AIAnalysisPreStreamingState';
import { AIAnalysisErrorState } from './ai-analysis-state/AIAnalysisErrorState';
import { RecentAIAnalysis } from './ai-analysis-sections/RecentAIAnalysis';
import { createOpenSourceCallback } from '../callbacks/open-source-file';

export const SearchResultView: React.FC<{
	onClose?: () => void;
	onRetry?: () => void;
}> = ({ onClose, onRetry }) => {
	const session = useSearchSessionStore((s) => s.session);
	const steps = useSearchSessionStore((s) => s.steps);
	const error = session.error;

	const isIdle = session.status === 'idle' && steps.length === 0;
	const hasSteps = steps.length > 0;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-h-full">
			{/* Error state */}
			{error ? (
				<AIAnalysisErrorState error={error} onRetry={onRetry} />
			) : null}

			{/* Idle: show pre-streaming state + recent analyses */}
			{isIdle && !error ? (
				<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-h-full">
					<AIAnalysisPreStreamingState />
					<RecentAIAnalysis onClose={onClose} />
				</div>
			) : null}

			{/* Steps: rendered progressively during streaming AND after completion */}
			{hasSteps ? (
				<StepList
					steps={steps}
					onClose={onClose}
					startedAtMs={session.startedAt}
					durationMs={session.duration}
					onOpenWikilink={onClose ? createOpenSourceCallback(onClose) : undefined}
				/>
			) : null}
		</div>
	);
};
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/StepList.tsx src/ui/view/quick-search/components/SearchResultView.tsx
git commit -m "feat: create StepList and SearchResultView — unified content component"
```

---

### Task 7: Rewire tab-AISearch.tsx

**Files:**
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx`

- [ ] **Step 1: Replace AnimatePresence with SearchResultView**

Replace the entire `AnimatePresence` block (lines 327-393 in current file) with a single `<SearchResultView />`. Remove imports of `StreamingAnalysis`, `CompletedAIAnalysis`, `AnimatePresence`, `motion`.

Update all store reads from `useAIAnalysisRuntimeStore` to `useSearchSessionStore`. The session-level values (`isAnalyzing`, `analysisCompleted`, `hasAnalyzed`, etc.) come from `session` object in the new store.

Replace `useAIAnalysis()` hook calls with `useSearchSession()`.

Replace `resetAIAnalysisAll()` with `useSearchSessionStore.getState().resetAll()`.

Keep the footer, nav bar, save dialog, topic modal, and context chat modal — just update their store reads.

The `useEffect` that triggers analysis on `triggerAnalysis` change stays, but reads from `useSearchSessionStore`.

- [ ] **Step 2: Build to verify**

Run: `npm run build`

- [ ] **Step 3: Manually test in Obsidian**

Reload plugin, open Quick Search, run an AI search. Verify:
1. Steps appear progressively during streaming
2. No flicker on completion
3. Completed steps auto-collapse (classify/decompose/recon)
4. Report/summary/sources stay expanded
5. Footer actions appear after completion
6. Cancel works
7. Clear + Re-analyze works

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/tab-AISearch.tsx
git commit -m "feat: rewire tab-AISearch to use SearchResultView — eliminate dual component"
```

---

### Task 8: Bridge layer for backward compatibility

**Files:**
- Modify: `src/ui/view/quick-search/store/aiAnalysisStore.ts`
- Modify: `src/ui/view/quick-search/SearchModal.tsx`
- Modify: `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts`

- [ ] **Step 1: Create bridge functions in aiAnalysisStore.ts**

Keep `CompletedAnalysisSnapshot` type and `buildCompletedAnalysisSnapshot()` / `loadCompletedAnalysisSnapshot()` but rewrite them to read from/write to `searchSessionStore` + `searchInteractionsStore`.

Keep the old store exports as thin wrappers that read from the new store — this allows existing section components (`SummaryContent`, etc.) to keep working without changes.

```typescript
// Bridge: old store selectors read from new store
export const useAIAnalysisRuntimeStore = {
	// Provide .getState() and selector hook that reads from searchSessionStore
	getState: () => {
		const s = useSearchSessionStore.getState();
		return {
			isAnalyzing: s.getIsAnalyzing(),
			analysisCompleted: s.getIsCompleted(),
			// ... map all fields
		};
	},
};
```

This is the most complex task — it bridges old consumers to the new store. Take care to map every field used by section components.

- [ ] **Step 2: Update SearchModal.tsx store imports**

Replace direct `useAIAnalysisRuntimeStore` calls with `useSearchSessionStore` equivalents.

- [ ] **Step 3: Update useAIAnalysisResult.ts**

Update `buildCompletedAnalysisSnapshot` to read steps from `searchSessionStore` and convert to the old snapshot format.

Update `loadCompletedAnalysisSnapshot` to convert old snapshot format into steps and load into `searchSessionStore`.

- [ ] **Step 4: Build to verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/quick-search/store/aiAnalysisStore.ts src/ui/view/quick-search/SearchModal.tsx src/ui/view/quick-search/hooks/useAIAnalysisResult.ts
git commit -m "feat: bridge layer — old store consumers read from new searchSessionStore"
```

---

### Task 9: Delete old files and clean up

**Files:**
- Delete: `src/ui/view/quick-search/components/ai-analysis-state/StreamingAnalysis.tsx`
- Delete: `src/ui/view/quick-search/components/ai-analysis-state/CompletedAIAnalysis.tsx`
- Delete: `src/ui/view/quick-search/hooks/aiAnalysisStreamDispatcher.ts`
- Modify: `src/ui/view/quick-search/store/aiAnalysisStore.ts` — remove old store definitions that are fully replaced

- [ ] **Step 1: Delete StreamingAnalysis.tsx and CompletedAIAnalysis.tsx**

```bash
git rm src/ui/view/quick-search/components/ai-analysis-state/StreamingAnalysis.tsx
git rm src/ui/view/quick-search/components/ai-analysis-state/CompletedAIAnalysis.tsx
```

- [ ] **Step 2: Delete aiAnalysisStreamDispatcher.ts**

```bash
git rm src/ui/view/quick-search/hooks/aiAnalysisStreamDispatcher.ts
```

- [ ] **Step 3: Remove dead imports**

Search all files under `src/ui/view/quick-search/` for imports of the deleted files. Remove them.

- [ ] **Step 4: Remove old store definitions from aiAnalysisStore.ts**

Remove the old `useAIAnalysisRuntimeStore`, `useAIAnalysisSummaryStore`, `useAIAnalysisResultStore`, `useAIAnalysisStepsStore` definitions if they are fully replaced by bridge wrappers. If bridge wrappers still need them, keep them but mark with `@deprecated`.

- [ ] **Step 5: Build to verify no broken imports**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove StreamingAnalysis, CompletedAIAnalysis, and old dispatcher"
```

---

### Task 10: Final integration test

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 2: Run existing tests**

Run: `npm run test`
Expected: All existing tests pass

- [ ] **Step 3: Manual Obsidian test — streaming flow**

Reload plugin. Open Quick Search (Cmd+O). Type a query. Press Enter.
Verify:
- Steps appear one by one: Classify → Decompose → Recon → Plan/Report
- Each step has a running indicator while active
- Completed steps get green checkmark and auto-collapse
- Recon shows task progress (if tasks > 1)
- Report blocks stream in as they generate
- Summary appears during streaming
- Sources appear when available

- [ ] **Step 4: Manual Obsidian test — completion**

Wait for analysis to complete. Verify:
- NO flicker at completion — steps just stop running
- Report/Summary/Sources remain expanded and visible
- Follow-up questions appear
- Footer shows cost + token count + action buttons
- Copy, Save, Open in Chat work
- Continue Analysis input works

- [ ] **Step 5: Manual Obsidian test — history restore**

Click a recent analysis entry. Verify:
- Steps are restored and displayed correctly
- Collapsed/expanded states are sensible
- All content (summary, blocks, sources) is visible

- [ ] **Step 6: Manual Obsidian test — error + cancel**

Start analysis, click Cancel. Verify:
- Analysis stops cleanly
- Steps show what was completed before cancel
- Can start new analysis without issues

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for step-based AI search UI"
```
