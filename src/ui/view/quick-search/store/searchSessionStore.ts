/**
 * Unified Zustand store for a single AI search session.
 * Replaces the four fragmented stores (Runtime, Summary, Result, Steps)
 * with a single step-based state model.
 */

import { create } from 'zustand';
import type { LLMUsage } from '@/core/providers/types';
import { mergeTokenUsage } from '@/core/providers/types';
import type { AnalysisMode } from '@/service/agents/shared-types';
import type { PlanSnapshot } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';
import type { SearchStep, SearchStepType } from '../types/search-steps';
import { PHASE_TO_STEP_TYPE, createStep } from '../types/search-steps';

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

export type SessionStatus = 'idle' | 'starting' | 'streaming' | 'completed' | 'error' | 'canceled';

// ---------------------------------------------------------------------------
// HITL state
// ---------------------------------------------------------------------------

export interface HitlState {
	isPaused: boolean;
	pauseId: string;
	phase: string;
	snapshot: PlanSnapshot;
}

// ---------------------------------------------------------------------------
// Auto-save state
// ---------------------------------------------------------------------------

export interface AutoSaveState {
	lastRunId: string | null;
	lastSavedSummaryHash: string | null;
	lastSavedPath: string | null;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface SearchSessionState {
	// --- Session state ---
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
	hasStartedStreaming: boolean;
	hasAnalyzed: boolean;

	// --- Steps ---
	steps: SearchStep[];

	// --- Control state ---
	triggerAnalysis: number;
	hitlState: HitlState | null;
	hitlFeedbackCallback: ((feedback: UserFeedback) => void) | null;
	autoSaveState: AutoSaveState;
	restoredFromHistory: boolean;
	restoredFromVaultPath: string | null;
	aiModalOpen: boolean;
	dashboardUpdatedLine: string;
}

interface SearchSessionActions {
	// Session lifecycle
	incrementTriggerAnalysis: () => void;
	startSession: (query: string) => void;
	startStreaming: () => void;
	markCompleted: () => void;
	recordError: (error: string) => void;

	// Metadata
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
	updateStep: <T extends SearchStepType>(type: T, updater: (step: Extract<SearchStep, { type: T }>) => Extract<SearchStep, { type: T }>) => void;
	pushPhaseStep: (phaseName: string) => void;
	completeStep: (type: SearchStepType) => void;
	markAllStepsCompleted: () => void;

	// HITL
	setHitlPause: (state: { pauseId: string; phase: string; snapshot: PlanSnapshot }) => void;
	clearHitlPause: () => void;
	setHitlFeedbackCallback: (cb: ((feedback: UserFeedback) => void) | null) => void;

	// History
	setRestoredFromHistory: (restored: boolean, vaultPath?: string | null) => void;

	// Reset
	resetAll: () => void;

	// Computed
	getStep: <T extends SearchStepType>(type: T) => Extract<SearchStep, { type: T }> | undefined;
	getIsAnalyzing: () => boolean;
	getIsCompleted: () => boolean;
	getHasContent: () => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mark all currently running steps as completed. */
function completeRunningSteps(steps: SearchStep[]): SearchStep[] {
	const now = Date.now();
	return steps.map((step) => {
		if (step.status !== 'running') return step;
		return { ...step, status: 'completed' as const, endedAt: now };
	});
}

/** Find the last step of a given type. */
function findLastStepOfType<T extends SearchStepType>(
	steps: SearchStep[],
	type: T,
): { index: number; step: Extract<SearchStep, { type: T }> } | undefined {
	for (let i = steps.length - 1; i >= 0; i--) {
		if (steps[i].type === type) {
			return { index: i, step: steps[i] as Extract<SearchStep, { type: T }> };
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Initial state (extracted so resetAll can reuse it)
// ---------------------------------------------------------------------------

const INITIAL_STATE: SearchSessionState = {
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

	steps: [],

	triggerAnalysis: 0,
	hitlState: null,
	hitlFeedbackCallback: null,
	autoSaveState: { lastRunId: null, lastSavedSummaryHash: null, lastSavedPath: null },
	restoredFromHistory: false,
	restoredFromVaultPath: null,
	aiModalOpen: false,
	dashboardUpdatedLine: '',
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSearchSessionStore = create<SearchSessionState & SearchSessionActions>((set, get) => ({
	...INITIAL_STATE,

	// -----------------------------------------------------------------------
	// Session lifecycle
	// -----------------------------------------------------------------------

	incrementTriggerAnalysis: () => set((s) => ({ triggerAnalysis: s.triggerAnalysis + 1 })),

	startSession: (query) => {
		const ts = Date.now();
		const { analysisMode, webEnabled } = get();
		set({
			id: `run:${ts}`,
			query,
			status: 'starting',
			startedAt: ts,
			duration: null,
			usage: null,
			title: null,
			error: null,
			runAnalysisMode: analysisMode,
			isInputFrozen: true,
			hasStartedStreaming: false,
			restoredFromHistory: false,
			restoredFromVaultPath: null,
			autoSaveState: { ...get().autoSaveState, lastSavedPath: null },
			hitlState: null,
			hitlFeedbackCallback: null,
			dashboardUpdatedLine: '',
			steps: [],
			// Preserve analysisMode and webEnabled (already in closure)
			analysisMode,
			webEnabled,
		});
	},

	startStreaming: () => set({ status: 'streaming', hasStartedStreaming: true }),

	markCompleted: () => set((s) => {
		const now = Date.now();
		const completedSteps = s.steps.map((step) => {
			if (step.status !== 'running') return step;
			const completed = { ...step, status: 'completed' as const, endedAt: now };
			// For summary steps, also mark streaming as false
			if (completed.type === 'summary') {
				return { ...completed, streaming: false };
			}
			return completed;
		});
		return {
			status: 'completed',
			isInputFrozen: false,
			hasStartedStreaming: false,
			steps: completedSteps,
		};
	}),

	recordError: (error) => set({ status: 'error', error, isInputFrozen: false }),

	// -----------------------------------------------------------------------
	// Metadata
	// -----------------------------------------------------------------------

	setTitle: (title) => set({ title }),
	setUsage: (usage) => set({ usage }),
	accumulateUsage: (usage) => set((s) => ({ usage: mergeTokenUsage(s.usage, usage) })),
	setDuration: (duration) => set({ duration }),
	setHasAnalyzed: (v) => set({ hasAnalyzed: v }),
	setDashboardUpdatedLine: (line) => set({ dashboardUpdatedLine: line ?? '' }),
	setAiModalOpen: (open) => set({ aiModalOpen: open }),
	setAnalysisMode: (mode) => set({ analysisMode: mode }),

	toggleWeb: (currentQuery) => {
		if (currentQuery.includes('@web@')) {
			set({ webEnabled: false });
			return currentQuery.replace(/@web@\s*/g, '').trim();
		}
		set({ webEnabled: true });
		return currentQuery + (currentQuery.trim() ? ' @web@' : '@web@');
	},

	updateWebFromQuery: (query) => set({ webEnabled: query.trim().includes('@web@') }),

	setAutoSaveState: (s) => set((prev) => ({
		autoSaveState: {
			lastRunId: s.lastRunId !== undefined ? s.lastRunId : prev.autoSaveState.lastRunId,
			lastSavedSummaryHash: s.lastSavedSummaryHash !== undefined ? s.lastSavedSummaryHash : prev.autoSaveState.lastSavedSummaryHash,
			lastSavedPath: s.lastSavedPath !== undefined ? s.lastSavedPath : prev.autoSaveState.lastSavedPath,
		},
	})),

	// -----------------------------------------------------------------------
	// Step management
	// -----------------------------------------------------------------------

	pushStep: (step) => set((s) => ({ steps: [...s.steps, step] })),

	updateStep: (type, updater) => set((s) => {
		const found = findLastStepOfType(s.steps, type);
		if (!found) return s;
		const updated = updater({ ...found.step } as any);
		const nextSteps = [...s.steps];
		nextSteps[found.index] = updated;
		return { steps: nextSteps };
	}),

	pushPhaseStep: (phaseName) => {
		const stepType = PHASE_TO_STEP_TYPE[phaseName];
		if (!stepType) return;
		set((s) => {
			const completedSteps = completeRunningSteps(s.steps);
			const newStep = createStep(stepType);
			// Carry forward classify dimension count to decompose step
			if (stepType === 'decompose') {
				const classifyStep = completedSteps.find((st) => st.type === 'classify');
				if (classifyStep && classifyStep.type === 'classify') {
					(newStep as any).dimensionCount = classifyStep.dimensions.length;
				}
			}
			return { steps: [...completedSteps, newStep] };
		});
	},

	completeStep: (type) => set((s) => {
		const found = findLastStepOfType(s.steps, type);
		if (!found || found.step.status !== 'running') return s;
		const nextSteps = [...s.steps];
		nextSteps[found.index] = { ...found.step, status: 'completed', endedAt: Date.now() };
		return { steps: nextSteps };
	}),

	markAllStepsCompleted: () => set((s) => ({ steps: completeRunningSteps(s.steps) })),

	// -----------------------------------------------------------------------
	// HITL
	// -----------------------------------------------------------------------

	setHitlPause: (state) => set({ hitlState: { isPaused: true, ...state } }),
	clearHitlPause: () => set({ hitlState: null }),
	setHitlFeedbackCallback: (cb) => set({ hitlFeedbackCallback: cb }),

	// -----------------------------------------------------------------------
	// History
	// -----------------------------------------------------------------------

	setRestoredFromHistory: (restored, vaultPath) => set({
		restoredFromHistory: restored,
		restoredFromVaultPath: vaultPath ?? null,
	}),

	// -----------------------------------------------------------------------
	// Reset
	// -----------------------------------------------------------------------

	resetAll: () => {
		const { analysisMode, webEnabled } = get();
		set({
			...INITIAL_STATE,
			analysisMode,
			webEnabled,
		});
	},

	// -----------------------------------------------------------------------
	// Computed
	// -----------------------------------------------------------------------

	getStep: (type) => {
		const found = findLastStepOfType(get().steps, type);
		return found?.step as any;
	},

	getIsAnalyzing: () => {
		const { status } = get();
		return status === 'starting' || status === 'streaming';
	},

	getIsCompleted: () => get().status === 'completed',

	getHasContent: () => get().steps.length > 0,
}));
