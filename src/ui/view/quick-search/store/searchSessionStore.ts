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
import type { SearchStep, SearchStepType, V2ToolStep, V2TimelineItem, V2Source } from '../types/search-steps';
import { PHASE_TO_STEP_TYPE, createStep } from '../types/search-steps';
import { exportGraphJson } from './aiGraphStore';

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
// Annotation & Round types (for Continue Append Mode)
// ---------------------------------------------------------------------------

export interface Annotation {
	id: string;
	roundIndex: number;
	sectionIndex: number;
	selectedText?: string;
	comment: string;
	type: 'question' | 'disagree' | 'expand' | 'note';
	createdAt: number;
}

export interface Round {
	index: number;
	query: string;
	sections: V2Section[];
	summary: string;
	summaryStreaming: boolean;
	sources: V2Source[];
	steps: V2ToolStep[];
	timeline: V2TimelineItem[];
	followUpQuestions: string[];
	proposedOutline: string | null;
	annotations: Annotation[];
}

// ---------------------------------------------------------------------------
// V2 Section type
// ---------------------------------------------------------------------------

export interface V2Section {
	id: string;
	title: string;
	contentType: string;
	visualType: string;
	evidencePaths: string[];
	brief: string;
	weight: number;
	missionRole: string;
	status: 'pending' | 'generating' | 'done' | 'error';
	content: string;
	streamingChunks: string[];
	error?: string;
	generations: Array<{ content: string; prompt?: string; timestamp: number }>;
	vizData?: import('@/core/schemas/report-viz-schemas').VizSpec;
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
	phaseUsages: Array<{ phase: string; modelId: string; inputTokens: number; outputTokens: number }>;
	/** Raw agent event log for debug export: tool calls, reasoning, plan messages */
	agentDebugLog: Array<{ ts: number; type: string; taskIndex?: number; data: Record<string, unknown> }>;
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

	// --- V2 (Agent SDK) state ---
	v2Active: boolean;
	/** Current V2 view: process | report | sources */
	v2View: 'process' | 'report' | 'sources';
	v2Steps: V2ToolStep[];
	v2ReportChunks: string[];
	v2ReportComplete: boolean;
	/** Map tool-call id → toolName so we can look up name on tool-result */
	v2ToolCallIndex: Map<string, string>;
	/** Unified timeline: interleaved text + tool items */
	v2Timeline: V2TimelineItem[];
	/** Index in v2Timeline where the final report begins (after last tool call) */
	v2FinalReportStartIndex: number;
	/** Sources extracted from vault_read_note tool calls */
	v2Sources: V2Source[];
	/** Follow-up questions parsed from report tail */
	v2FollowUpQuestions: string[];
	/** The proposed_outline from vault_submit_plan — the real structured report */
	v2ProposedOutline: string | null;
	/** Report plan sections extracted from agent's thinking (for future HITL approval) */
	v2PlanSections: V2Section[];
	/** Whether user has approved the plan and report generation has started */
	v2PlanApproved: boolean;
	/** User insights to incorporate into report — each assigned to a section before generation */
	v2UserInsights: string[];
	/** Executive summary markdown (generated after all sections complete) */
	v2Summary: string;
	v2SummaryStreaming: boolean;

	// --- Round-based state (Continue Append Mode) ---
	rounds: Round[];
	currentRoundIndex: number;

	// --- Continue mode flag ---
	continueMode: boolean;

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
	addPhaseUsage: (usage: { phase: string; modelId: string; inputTokens: number; outputTokens: number }) => void;
	appendAgentDebugLog: (entry: { type: string; taskIndex?: number; data: Record<string, unknown> }) => void;
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

	// V2 step management
	setV2Active: (active: boolean) => void;
	setV2View: (view: 'process' | 'report' | 'sources') => void;
	pushV2Step: (step: V2ToolStep) => void;
	updateV2Step: (id: string, updater: (step: V2ToolStep) => V2ToolStep) => void;
	appendV2ReportChunk: (chunk: string) => void;
	markV2ReportComplete: () => void;
	registerV2ToolCall: (id: string, toolName: string) => void;
	resolveV2ToolName: (id: string) => string;
	// V2 timeline management
	pushV2TimelineText: (id: string, chunk: string) => void;
	pushV2TimelineTool: (step: V2ToolStep) => void;
	updateV2TimelineTool: (id: string, updater: (step: V2ToolStep) => V2ToolStep) => void;
	completeV2TimelineText: (id: string) => void;
	addV2Source: (source: V2Source) => void;

	// Plan & section generation
	approvePlan: () => void;
	addUserInsight: (insight: string) => void;
	removeUserInsight: (index: number) => void;
	setPlanSections: (sections: V2Section[]) => void;
	updatePlanSection: (id: string, updater: (s: V2Section) => V2Section) => void;
	reorderPlanSections: (ids: string[]) => void;
	removePlanSection: (id: string) => void;
	addPlanSection: (missionRole: string) => void;
	appendSectionChunk: (id: string, chunk: string) => void;
	completeSectionContent: (id: string, content: string) => void;
	failSection: (id: string, error: string) => void;
	startSectionRegenerate: (id: string) => void;
	setSummary: (text: string) => void;
	setSummaryStreaming: (streaming: boolean) => void;

	// Round management (Continue Append Mode)
	freezeCurrentRound: () => void;
	startContinueRound: (followUpQuery: string) => void;
	addAnnotation: (annotation: Annotation) => void;
	replaceSynthesized: (summary: string, sections: Array<{ title: string; content: string }>) => void;

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
	phaseUsages: [],
	agentDebugLog: [],
	title: null,
	error: null,
	analysisMode: 'vaultFull',
	runAnalysisMode: null,
	webEnabled: false,
	isInputFrozen: false,
	hasStartedStreaming: false,
	hasAnalyzed: false,

	steps: [],

	v2Active: false,
	v2View: 'process' as const,
	v2Steps: [],
	v2ReportChunks: [],
	v2ReportComplete: false,
	v2ToolCallIndex: new Map(),
	v2Timeline: [],
	v2FinalReportStartIndex: -1,
	v2Sources: [],
	v2FollowUpQuestions: [],
	v2ProposedOutline: null,
	v2PlanSections: [],
	v2PlanApproved: false,
	v2UserInsights: [],
	v2Summary: '',
	v2SummaryStreaming: false,

	// Round-based state
	rounds: [],
	currentRoundIndex: 0,

	// Continue mode flag
	continueMode: false,

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
			v2Active: false,
			v2Steps: [],
			v2ReportChunks: [],
			v2ReportComplete: false,
			v2ToolCallIndex: new Map(),
			v2Timeline: [],
			v2FinalReportStartIndex: -1,
			v2Sources: [],
			v2FollowUpQuestions: [],
			v2ProposedOutline: null,
			v2PlanSections: [],
			v2PlanApproved: false,
			v2UserInsights: [],
			v2Summary: '',
			v2SummaryStreaming: false,
			rounds: [],
			currentRoundIndex: 0,
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
		const completedV2Steps = s.v2Steps.map((step) => {
			if (step.status !== 'running') return step;
			return { ...step, status: 'done' as const, endedAt: now };
		});
		// Complete running tool steps in timeline
		const completedTimeline = s.v2Timeline.map((item) => {
			if (item.kind === 'tool' && item.step.status === 'running') {
				return { ...item, step: { ...item.step, status: 'done' as const, endedAt: now } };
			}
			if (item.kind === 'text' && !item.complete) {
				return { ...item, complete: true };
			}
			return item;
		});
		// Detect final report start index: last text item after last tool item
		let finalIdx = -1;
		for (let i = completedTimeline.length - 1; i >= 0; i--) {
			if (completedTimeline[i].kind === 'tool') {
				// Final report starts at the next text item after this tool
				for (let j = i + 1; j < completedTimeline.length; j++) {
					if (completedTimeline[j].kind === 'text') { finalIdx = j; break; }
				}
				break;
			}
		}
		// Use follow-up questions already set by useSearchSession (from vault_submit_plan structured field)
		// Only keep existing ones — no regex fallback needed since agent provides them structurally
		return {
			status: 'completed',
			isInputFrozen: false,
			hasStartedStreaming: false,
			steps: completedSteps,
			v2Steps: completedV2Steps,
			v2Timeline: completedTimeline,
			v2FinalReportStartIndex: finalIdx,
			// Only auto-switch to report when sections are fully generated; otherwise stay on current view (process)
			v2View: s.v2Active && s.v2PlanApproved && s.v2PlanSections.length > 0 && s.v2PlanSections.every(sec => sec.status === 'done')
				? 'report' as const
				: s.v2View,
		};
	}),

	recordError: (error) => set({ status: 'error', error, isInputFrozen: false }),

	// -----------------------------------------------------------------------
	// Metadata
	// -----------------------------------------------------------------------

	setTitle: (title) => set({ title }),
	setUsage: (usage) => set({ usage }),
	accumulateUsage: (usage) => set((s) => ({ usage: mergeTokenUsage(s.usage, usage) })),
	addPhaseUsage: (usage) => set((s) => ({ phaseUsages: [...s.phaseUsages, usage] })),
	appendAgentDebugLog: (entry) => set((s) => {
		const log = s.agentDebugLog;
		// Cap at 2000 entries to avoid unbounded memory growth
		const trimmed = log.length >= 2000 ? log.slice(log.length - 1999) : log;
		return { agentDebugLog: [...trimmed, { ts: Date.now(), ...entry }] };
	}),
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
					// Use deduplicated count (same logic as groupByAxis in ClassifyStep)
					const uniqueIds = new Set(classifyStep.dimensions.map(d => d.id));
					const axisCounts = { semantic: 0, topology: 0, temporal: 0 };
					for (const d of classifyStep.dimensions) { axisCounts[(d.axis as keyof typeof axisCounts) ?? 'semantic']++; }
					(newStep as any).dimensionCount = uniqueIds.size;
				}
			}
			// Carry forward decompose task descriptions to recon step as labels
			if (stepType === 'recon') {
				const decomposeFound = findLastStepOfType(completedSteps, 'decompose');
				const decomposeStep = decomposeFound?.step;
				if (decomposeStep && decomposeStep.taskDescriptions.length > 0) {
					(newStep as any).tasks = decomposeStep.taskDescriptions.map((td, i) => ({
						index: i,
						label: td.description,
						completedFiles: 0,
						totalFiles: 0,
						done: false,
					}));
					(newStep as any).total = decomposeStep.taskDescriptions.length;
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
	// V2 step management
	// -----------------------------------------------------------------------

	setV2Active: (active) => set({ v2Active: active }),
	setV2View: (view) => set({ v2View: view }),

	pushV2Step: (step) => set((s) => ({ v2Steps: [...s.v2Steps, step] })),

	updateV2Step: (id, updater) => set((s) => {
		const idx = s.v2Steps.findIndex((st) => st.id === id);
		if (idx === -1) return s;
		const next = [...s.v2Steps];
		next[idx] = updater({ ...next[idx] });
		return { v2Steps: next };
	}),

	appendV2ReportChunk: (chunk) => set((s) => ({
		v2ReportChunks: [...s.v2ReportChunks, chunk],
	})),

	markV2ReportComplete: () => set({ v2ReportComplete: true }),

	registerV2ToolCall: (id, toolName) => set((s) => {
		const next = new Map(s.v2ToolCallIndex);
		next.set(id, toolName);
		return { v2ToolCallIndex: next };
	}),

	resolveV2ToolName: (id) => get().v2ToolCallIndex.get(id) ?? 'unknown',

	// V2 timeline management
	pushV2TimelineText: (id, chunk) => set((s) => {
		const timeline = [...s.v2Timeline];
		const last = timeline[timeline.length - 1];
		if (last && last.kind === 'text' && !last.complete) {
			// Append to existing text item
			timeline[timeline.length - 1] = { ...last, chunks: [...last.chunks, chunk] };
		} else {
			// Create new text item
			timeline.push({ kind: 'text', id, chunks: [chunk], complete: false });
		}
		return { v2Timeline: timeline };
	}),

	pushV2TimelineTool: (step) => set((s) => {
		const timeline = [...s.v2Timeline];
		// Mark preceding text item as complete
		const last = timeline[timeline.length - 1];
		if (last && last.kind === 'text' && !last.complete) {
			timeline[timeline.length - 1] = { ...last, complete: true };
		}
		timeline.push({ kind: 'tool', step });
		return { v2Timeline: timeline };
	}),

	updateV2TimelineTool: (id, updater) => set((s) => {
		const idx = s.v2Timeline.findIndex((item) => item.kind === 'tool' && item.step.id === id);
		if (idx === -1) return s;
		const timeline = [...s.v2Timeline];
		const item = timeline[idx] as { kind: 'tool'; step: V2ToolStep };
		timeline[idx] = { kind: 'tool', step: updater({ ...item.step }) };
		return { v2Timeline: timeline };
	}),

	completeV2TimelineText: (id) => set((s) => {
		const idx = s.v2Timeline.findIndex((item) => item.kind === 'text' && item.id === id);
		if (idx === -1) return s;
		const timeline = [...s.v2Timeline];
		const item = timeline[idx] as { kind: 'text'; id: string; chunks: string[]; complete: boolean };
		timeline[idx] = { ...item, complete: true };
		return { v2Timeline: timeline };
	}),

	addV2Source: (source) => set((s) => {
		// Deduplicate by path
		if (s.v2Sources.some((src) => src.path === source.path)) return s;
		return { v2Sources: [...s.v2Sources, source] };
	}),

	// -----------------------------------------------------------------------
	// Plan & section generation
	// -----------------------------------------------------------------------

	approvePlan: () => set({ v2PlanApproved: true }),

	addUserInsight: (insight) => set((s) => ({ v2UserInsights: [...s.v2UserInsights, insight] })),
	removeUserInsight: (index) => set((s) => ({ v2UserInsights: s.v2UserInsights.filter((_, i) => i !== index) })),

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

	addPlanSection: (missionRole) => set((s) => {
		const newId = `user-${Date.now()}`;
		const newSection: V2Section = {
			id: newId,
			title: 'New section',
			contentType: 'analysis',
			visualType: 'none',
			evidencePaths: [],
			brief: '',
			weight: 5,
			missionRole,
			status: 'pending',
			content: '',
			streamingChunks: [],
			generations: [],
		};
		return { v2PlanSections: [...s.v2PlanSections, newSection] };
	}),

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

	// -----------------------------------------------------------------------
	// Round management (Continue Append Mode)
	// -----------------------------------------------------------------------

	freezeCurrentRound: () => set((s) => {
		if (!s.v2Active) return {};
		const round: Round = {
			index: s.currentRoundIndex,
			query: s.query,
			sections: [...s.v2PlanSections],
			summary: s.v2Summary,
			summaryStreaming: false,
			sources: [...s.v2Sources],
			steps: [...s.v2Steps],
			timeline: [...s.v2Timeline],
			followUpQuestions: [...s.v2FollowUpQuestions],
			proposedOutline: s.v2ProposedOutline,
			annotations: [],
		};
		return {
			rounds: [...s.rounds, round],
			currentRoundIndex: s.currentRoundIndex + 1,
		};
	}),

	startContinueRound: (followUpQuery) => set(() => ({
		query: followUpQuery,
		status: 'starting' as const,
		hasStartedStreaming: false,
		v2Steps: [],
		v2Timeline: [],
		v2ReportChunks: [],
		v2ReportComplete: false,
		v2ToolCallIndex: new Map(),
		v2PlanSections: [],
		v2PlanApproved: false,
		v2ProposedOutline: null,
		v2Summary: '',
		v2SummaryStreaming: false,
		v2FollowUpQuestions: [],
		v2View: 'process' as const,
		// Preserve: rounds, currentRoundIndex, v2Active, v2Sources (accumulate)
	})),

	addAnnotation: (annotation) => set((s) => {
		const rounds = [...s.rounds];
		if (annotation.roundIndex < rounds.length) {
			rounds[annotation.roundIndex] = {
				...rounds[annotation.roundIndex],
				annotations: [...rounds[annotation.roundIndex].annotations, annotation],
			};
		}
		return { rounds };
	}),

	replaceSynthesized: (summary, sections) => set((s) => {
		const synthesizedRound: Round = {
			index: 0,
			query: s.rounds[0]?.query ?? s.query,
			sections: sections.map((sec, i) => ({
				id: `synth-${i}`,
				title: sec.title,
				contentType: 'narrative',
				visualType: 'none',
				evidencePaths: [],
				brief: '',
				weight: 5,
				missionRole: 'synthesis',
				status: 'done' as const,
				content: sec.content,
				streamingChunks: [],
				generations: [{ content: sec.content, timestamp: Date.now() }],
			})),
			summary,
			summaryStreaming: false,
			sources: s.rounds.flatMap((r) => r.sources),
			steps: [],
			timeline: [],
			followUpQuestions: [],
			proposedOutline: null,
			annotations: [],
		};
		return {
			rounds: [synthesizedRound],
			currentRoundIndex: 1,
			v2PlanSections: [],
			v2Summary: summary,
		};
	}),

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

// ---------------------------------------------------------------------------
// V2 snapshot builder (for auto-save pipeline)
// ---------------------------------------------------------------------------

export function buildV2AnalysisSnapshot(): {
	v2ProcessLog: string[];
	v2PlanOutline: string | null;
	v2ReportSections: Array<{ title: string; content: string }>;
	v2Sources: V2Source[];
	v2FollowUpQuestions: string[];
	v2Summary: string;
	v2GraphJson: string | null;
	usage: LLMUsage | null;
	duration: number | null;
} | null {
	const s = useSearchSessionStore.getState();
	if (!s.v2Active) return null;

	const processLog = s.v2Steps
		.filter(st => st.status === 'done')
		.map(st => {
			const dur = st.endedAt && st.startedAt
				? `${((st.endedAt - st.startedAt) / 1000).toFixed(1)}s`
				: '';
			return `${st.icon} ${st.displayName}${st.summary ? ' — ' + st.summary : ''} ${dur ? '— ' + dur : ''}`.trim();
		});

	const sections = s.v2PlanSections
		.filter(sec => sec.status === 'done' && sec.content)
		.map(sec => ({ title: sec.title, content: sec.content }));

	return {
		v2ProcessLog: processLog,
		v2PlanOutline: s.v2ProposedOutline,
		v2ReportSections: sections,
		v2Sources: s.v2Sources,
		v2FollowUpQuestions: s.v2FollowUpQuestions,
		v2Summary: s.v2Summary,
		v2GraphJson: exportGraphJson(),
		usage: s.usage,
		duration: s.duration,
	};
}

// ---------------------------------------------------------------------------
// Round utility functions (derived state helpers)
// ---------------------------------------------------------------------------

/** Get all sections flattened across all rounds + current */
export function getAllSections(): V2Section[] {
	const s = useSearchSessionStore.getState();
	const fromRounds = s.rounds.flatMap(r => r.sections);
	return [...fromRounds, ...s.v2PlanSections];
}

/** Get all sources deduplicated across all rounds + current */
export function getAllSources(): V2Source[] {
	const s = useSearchSessionStore.getState();
	const seen = new Set<string>();
	const result: V2Source[] = [];
	for (const src of [...s.rounds.flatMap(r => r.sources), ...s.v2Sources]) {
		if (!seen.has(src.path)) {
			seen.add(src.path);
			result.push(src);
		}
	}
	return result;
}
