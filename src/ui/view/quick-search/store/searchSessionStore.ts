/**
 * Unified Zustand store for a single AI search session.
 * Replaces the four fragmented stores (Runtime, Summary, Result, Steps)
 * with a single step-based state model.
 *
 * V2-specific types (V2Section, Round, Annotation) live in ./v2SessionTypes.ts
 * and are re-exported here for backward compatibility.
 */

import { create } from 'zustand';
import type { LLMUsage } from '@/core/providers/types';
import { mergeTokenUsage } from '@/core/providers/types';
import type { AnalysisMode } from '@/service/agents/shared-types';
import type { PlanSnapshot } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';
import type { V2ToolStep, V2TimelineItem, V2Source } from '../types/search-steps';
import { exportGraphJson } from './aiGraphStore';
import { useGraphAgentStore } from './graphAgentStore';
import {
	V2_INITIAL_STATE,
	buildV2AnalysisSnapshot as buildV2AnalysisSnapshotImpl,
	getAllSectionsFrom,
	getAllSourcesFrom,
} from './v2SessionTypes';
import type { V2Section, Annotation, Round, V2SessionState } from './v2SessionTypes';
import type { V2SessionSnapshot } from './sessionSnapshot';
import { snapshotFromState } from './sessionSnapshot';

// Re-export V2 types for backward compatibility
export type { V2Section, Annotation, Round };

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

interface SearchSessionState extends V2SessionState {
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

	// --- Control state ---
	triggerAnalysis: number;
	hitlState: HitlState | null;
	hitlFeedbackCallback: ((feedback: UserFeedback) => void) | null;
	autoSaveState: AutoSaveState;

	// --- V2 (Agent SDK) state inherited from V2SessionState ---

	restoredFromHistory: boolean;
	restoredFromVaultPath: string | null;
	aiModalOpen: boolean;
	dashboardUpdatedLine: string;
	sourcesViewMode: 'list' | 'graph';
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

	// V2 step management
	setV2Active: (active: boolean) => void;
	setV2View: (view: 'process' | 'report' | 'sources') => void;
	setSourcesViewMode: (mode: 'list' | 'graph') => void;
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

	// Snapshot / Restore
	snapshotState: () => V2SessionSnapshot;
	restoreFromSnapshot: (snapshot: V2SessionSnapshot) => void;

	// Reset
	resetAll: () => void;

	// Computed
	getIsAnalyzing: () => boolean;
	getIsCompleted: () => boolean;
	getHasContent: () => boolean;
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

	// V2 state from v2SessionTypes.ts
	...V2_INITIAL_STATE,

	triggerAnalysis: 0,
	hitlState: null,
	hitlFeedbackCallback: null,
	autoSaveState: { lastRunId: null, lastSavedSummaryHash: null, lastSavedPath: null },
	restoredFromHistory: false,
	restoredFromVaultPath: null,
	aiModalOpen: false,
	dashboardUpdatedLine: '',
	sourcesViewMode: 'list' as const,
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
			sourcesViewMode: 'list' as const,
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
	// V2 step management
	// -----------------------------------------------------------------------

	setV2Active: (active) => set({ v2Active: active }),
	setV2View: (view) => set({ v2View: view }),
	setSourcesViewMode: (mode) => set({ sourcesViewMode: mode }),

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
			usage: s.usage,
			duration: s.duration,
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
	// Snapshot / Restore
	// -----------------------------------------------------------------------

	snapshotState: () => snapshotFromState(get()),

	restoreFromSnapshot: (snapshot) => set({
		// Write all snapshot fields into the store
		...snapshot,
		// Reset runtime-only fields
		restoredFromHistory: false,
		restoredFromVaultPath: null,
		isInputFrozen: false,
		// Clear function refs (not serializable)
		hitlFeedbackCallback: null,
		// Preserve UI-only fields at their defaults
		aiModalOpen: false,
		triggerAnalysis: 0,
		sourcesViewMode: 'list' as const,
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

	getIsAnalyzing: () => {
		const { status } = get();
		return status === 'starting' || status === 'streaming';
	},

	getIsCompleted: () => get().status === 'completed',

	getHasContent: () => get().v2Active && get().v2PlanSections.length > 0,
}));

// ---------------------------------------------------------------------------
// V2 snapshot builder (for auto-save pipeline)
// ---------------------------------------------------------------------------

export function buildV2AnalysisSnapshot() {
	return buildV2AnalysisSnapshotImpl(
		() => useSearchSessionStore.getState(),
		() => exportGraphJson() ?? null,
		() => {
			const gStore = useGraphAgentStore.getState();
			if (!gStore.graphData) return null;
			return JSON.stringify({
				lenses: { topology: gStore.graphData },
				source: 'graphAgent',
				generatedAt: new Date().toISOString(),
			});
		},
	);
}

// ---------------------------------------------------------------------------
// Round utility functions (derived state helpers)
// ---------------------------------------------------------------------------

