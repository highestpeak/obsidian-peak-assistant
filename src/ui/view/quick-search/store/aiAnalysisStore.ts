import { create } from 'zustand';
import { AISearchGraph, AISearchSource, AISearchTopic, type AnalysisMode, DashboardBlock, type EvidenceIndex } from '@/service/agents/shared-types';
export type { AnalysisMode };
import type { PlanSnapshot } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';

import { LLMUsage, mergeTokenUsage } from '@/core/providers/types';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import { SnapshotChatMessage } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';

/** Per-topic completed Q&A from Analyze. */
export type SectionAnalyzeResult = { question: string; answer: string };
/** Currently streaming Analyze (single in-flight). Chunks are appended; UI joins for display. */
export type SectionAnalyzeStreaming = { topic: string; question: string; chunks: string[] };

/** Context chat modal state (Graph/Blocks/Sources follow-up). null = closed. */
export type ContextChatModalState = {
	type: 'graph' | 'blocks' | 'sources';
	/** Completed Q&A rounds in this modal session. */
	messages: Array<SectionAnalyzeResult>;
	streamingQuestion?: string;
	streamingText?: string;
	title: string;
	activeQuestion?: string;
	/** When type is 'blocks', which block this modal is for (each block has its own history). */
	blockId?: string;
} | null;

/**
 * Merge two AISearchGraph objects.
 *
 * This is used to preserve incremental graph nodes/edges discovered during
 * "thinking/inspecting" (graph tools) so they are not lost when the final
 * result overwrites the graph.
 */
function mergeAISearchGraphs(base: AISearchGraph | null, incoming: AISearchGraph | null): AISearchGraph | null {
	if (!base && !incoming) return null;
	if (!base) return incoming ? { nodes: [...incoming.nodes], edges: [...incoming.edges] } : null;
	if (!incoming) return { nodes: [...base.nodes], edges: [...base.edges] };

	const nodeById = new Map<string, any>();
	for (const n of base.nodes ?? []) nodeById.set(String(n.id), n);
	for (const n of incoming.nodes ?? []) {
		const id = String(n.id);
		const prev = nodeById.get(id);
		if (!prev) {
			nodeById.set(id, n);
			continue;
		}
		// Prefer incoming title/path/attributes when present.
		nodeById.set(id, {
			...prev,
			...n,
			title: n.title || prev.title,
			path: n.path || prev.path,
			attributes: { ...(prev.attributes ?? {}), ...(n.attributes ?? {}) },
		});
	}

	// Edge identity: (source, target, type). Keep the first id we see.
	const edgeKey = (e: any) => `${String(e.source)}|${String(e.type)}|${String(e.target)}`;
	const edgeByKey = new Map<string, any>();
	for (const e of base.edges ?? []) edgeByKey.set(edgeKey(e), e);
	for (const e of incoming.edges ?? []) {
		const k = edgeKey(e);
		const prev = edgeByKey.get(k);
		if (!prev) {
			edgeByKey.set(k, e);
			continue;
		}
		edgeByKey.set(k, {
			...prev,
			...e,
			attributes: { ...(prev.attributes ?? {}), ...(e.attributes ?? {}) },
		});
	}

	return {
		nodes: Array.from(nodeById.values()),
		edges: Array.from(edgeByKey.values()),
	};
}

/** Completed UI step from ui-step events; persisted in store and not cleared until new run. */
export interface UIStepRecord {
	stepId: string;
	title: string;
	description: string;
	startedAtMs?: number;
	endedAtMs?: number;
}

/**
 * for save to markdown and replay.
 */
export type CompletedAnalysisSnapshot = {
	/** Snapshot schema version. */
	version: 1;
	/** Mode used for this run: docSimple | vaultSimple | vaultFull. Omit = vaultFull. */
	runAnalysisMode?: AnalysisMode;
	analysisStartedAtMs?: number | null;
	duration?: number | null;
	usage?: LLMUsage | null;

	/** Short display title (from AI at end of analysis). */
	title?: string;
	/** All generated summaries (each run or re-gen adds one). */
	summaries: string[];
	/** 1-based index into summaries: which one is selected for display. */
	summaryVersion: number;

	topics: AISearchTopic[];
	/** Per-topic vault inspect results (key = topic label). */
	topicInspectResults?: Record<string, SearchResultItem[]>;
	/** Per-topic completed Analyze Q&A. */
	topicAnalyzeResults?: Record<string, SectionAnalyzeResult[]>;
	/** Per-topic graph (for Topic expansions). */
	topicGraphResults?: Record<string, GraphPreview | null>;

	graph: AISearchGraph | null;
	/** Per-graph-node/concept chat history (key = node id or concept label). */
	graphNodeChatRecords?: Record<string, SnapshotChatMessage[]>;

	sources: AISearchSource[];
	/** Evidence by path for Sources Evidence view (claim/quote per file). */
	evidenceIndex?: EvidenceIndex;
	/** Per-source chat history (key = source path or id). */
	sourcesChatRecords?: Record<string, SnapshotChatMessage[]>;

	dashboardBlocks: DashboardBlock[];
	/** Per-dashboard-block chat history (key = block id). */
	blockChatRecords?: Record<string, SnapshotChatMessage[]>;

	/** Overview diagram (raw Mermaid code) from Mermaid Overview Agent. */
	overviewMermaidActiveIndex?: number;
	// all versions of overview mermaid
	overviewMermaidVersions?: string[];
	/** Slot coverage diagram (raw Mermaid code) from slot pipeline. Latest only. */
	mindflowMermaid?: string;

	/** Continue Analysis Q&A (user question → answer). */
	fullAnalysisFollowUp?: Array<{ title: string; content: string }>;

	/** Graph section follow-up history. */
	graphFollowups?: SectionAnalyzeResult[];
	/** Blocks section follow-up history (legacy flat list). */
	blocksFollowups?: SectionAnalyzeResult[];
	/** Per-block follow-up history (key = block id). */
	blocksFollowupsByBlockId?: Record<string, SectionAnalyzeResult[]>;
	/** Sources section follow-up history. */
	sourcesFollowups?: SectionAnalyzeResult[];

	/** All completed UI steps (from ui-step events) for replay and dev copy. */
	steps?: UIStepRecord[];
};

/** Current summary text from snapshot (selected by summaryVersion). */
export function getSnapshotSummary(snapshot: CompletedAnalysisSnapshot): string {
	const list = snapshot.summaries ?? [];
	const idx = (snapshot.summaryVersion ?? 1) - 1;
	return list[idx] ?? list[0] ?? '';
}

// ---------------------------------------------------------------------------
// Split stores (6) for isolation; all in this file.
// ---------------------------------------------------------------------------

/** Single phase for analysis lifecycle; bools below kept in sync for compatibility. */
export type AnalysisPhase = 'idle' | 'starting' | 'streaming' | 'completed' | 'error' | 'canceled';

/** Runtime/control: settings, streaming flags, meta, auto-save. */
export const useAIAnalysisRuntimeStore = create<{
	phase: AnalysisPhase;
	triggerAnalysis: number;
	webEnabled: boolean;
	analysisMode: AnalysisMode;
	runAnalysisMode: AnalysisMode | null;
	analysisRunId: string | null;
	restoredFromHistory: boolean;
	restoredFromVaultPath: string | null;
	autoSaveState: { lastRunId: string | null; lastSavedSummaryHash: string | null; lastSavedPath: string | null };
	aiModalOpen: boolean;
	isAnalyzing: boolean;
	analyzingBeforeFirstToken: boolean;
	hasStartedStreaming: boolean;
	hasAnalyzed: boolean;
	analysisCompleted: boolean;
	error: string | null;
	analysisStartedAtMs: number | null;
	title: string | null;
	usage: LLMUsage | null;
	duration: number | null;
	dashboardUpdatedLine: string;
	incrementTriggerAnalysis: () => void;
	toggleWeb: (currentQuery: string) => string;
	updateWebFromQuery: (query: string) => void;
	setAnalysisMode: (mode: AnalysisMode) => void;
	startAnalyzing: () => void;
	startStreaming: () => void;
	markCompleted: () => void;
	recordError: (error: string) => void;
	setAutoSaveState: (s: { lastRunId?: string | null; lastSavedSummaryHash?: string | null; lastSavedPath?: string | null }) => void;
	setAiModalOpen: (open: boolean) => void;
	setTitle: (title: string | null) => void;
	setUsage: (usage: LLMUsage) => void;
	accumulateUsage: (usage: LLMUsage) => void;
	setDuration: (duration: number) => void;
	setDashboardUpdatedLine: (line: string) => void;
	setHasAnalyzed: (v: boolean) => void;
	resetRuntime: () => void;
	/** HITL state: set when pipeline pauses for user input. */
	hitlState: {
		isPaused: boolean;
		pauseId: string;
		phase: string;
		snapshot: PlanSnapshot;
	} | null;
	setHitlPause: (state: { pauseId: string; phase: string; snapshot: PlanSnapshot }) => void;
	clearHitlPause: () => void;
	/** Callback to send user feedback to the running VaultSearchAgent. */
	hitlFeedbackCallback: ((feedback: UserFeedback) => void) | null;
	setHitlFeedbackCallback: (cb: ((feedback: UserFeedback) => void) | null) => void;
}>((set, get) => ({
	phase: 'idle' as AnalysisPhase,
	triggerAnalysis: 0,
	webEnabled: false,
	analysisMode: 'vaultFull',
	runAnalysisMode: null,
	analysisRunId: null,
	restoredFromHistory: false,
	restoredFromVaultPath: null,
	autoSaveState: { lastRunId: null, lastSavedSummaryHash: null, lastSavedPath: null },
	aiModalOpen: false,
	isAnalyzing: false,
	analyzingBeforeFirstToken: false,
	hasStartedStreaming: false,
	hasAnalyzed: false,
	analysisCompleted: false,
	error: null,
	analysisStartedAtMs: null,
	title: null,
	usage: null,
	duration: null,
	dashboardUpdatedLine: '',
	hitlState: null,
	hitlFeedbackCallback: null,
	setHitlPause: (state) => set({ hitlState: { isPaused: true, ...state } }),
	clearHitlPause: () => set({ hitlState: null }),
	setHitlFeedbackCallback: (cb) => set({ hitlFeedbackCallback: cb }),
	incrementTriggerAnalysis: () => set((s) => ({ triggerAnalysis: s.triggerAnalysis + 1 })),
	toggleWeb: (q) => {
		if (q.includes('@web@')) {
			set({ webEnabled: false });
			return q.replace(/@web@\s*/g, '').trim();
		}
		set({ webEnabled: true });
		return q + (q.trim() ? ' @web@' : '@web@');
	},
	updateWebFromQuery: (q) => set({ webEnabled: q.trim().includes('@web@') }),
	setAnalysisMode: (m) => set({ analysisMode: m }),
	startAnalyzing: () => {
		const ts = Date.now();
		const mode = get().analysisMode;
		set({
			phase: 'starting',
			isAnalyzing: true,
			analyzingBeforeFirstToken: true,
			analysisStartedAtMs: ts,
			analysisRunId: `run:${ts}`,
			restoredFromHistory: false,
			restoredFromVaultPath: null,
			autoSaveState: { ...get().autoSaveState, lastSavedPath: null },
			runAnalysisMode: mode,
		});
	},
	startStreaming: () => set({ phase: 'streaming', hasStartedStreaming: true, analyzingBeforeFirstToken: false }),
	markCompleted: () => set({
		phase: 'completed',
		isAnalyzing: false,
		hasStartedStreaming: false,
		analysisCompleted: true,
	}),
	recordError: (e) => set({ phase: 'error', error: e }),
	setAutoSaveState: (s) => set((prev) => ({
		autoSaveState: {
			lastRunId: s.lastRunId !== undefined ? s.lastRunId : prev.autoSaveState.lastRunId,
			lastSavedSummaryHash: s.lastSavedSummaryHash !== undefined ? s.lastSavedSummaryHash : prev.autoSaveState.lastSavedSummaryHash,
			lastSavedPath: s.lastSavedPath !== undefined ? s.lastSavedPath : prev.autoSaveState.lastSavedPath,
		},
	})),
	setAiModalOpen: (o) => set({ aiModalOpen: o }),
	setTitle: (t) => set({ title: t }),
	setUsage: (u) => set({ usage: u }),
	accumulateUsage: (u) => set((s) => ({ usage: mergeTokenUsage(s.usage, u) })),
	setDuration: (d) => set({ duration: d }),
	setDashboardUpdatedLine: (l) => set({ dashboardUpdatedLine: l ?? '' }),
	setHasAnalyzed: (v) => set({ hasAnalyzed: v }),
	resetRuntime: () => set({
		phase: 'idle',
		isAnalyzing: false,
		analyzingBeforeFirstToken: false,
		hasStartedStreaming: false,
		hasAnalyzed: false,
		analysisCompleted: false,
		error: null,
		analysisStartedAtMs: null,
		analysisRunId: null,
		restoredFromHistory: false,
		restoredFromVaultPath: null,
		title: null,
		usage: null,
		duration: null,
		runAnalysisMode: null,
		autoSaveState: { lastRunId: null, lastSavedSummaryHash: null, lastSavedPath: null },
		hitlState: null,
		hitlFeedbackCallback: null,
	}),
}));

/** Completed steps only; real-time rendering is event-driven (ui-step/ui-step-delta). */
export const useAIAnalysisStepsStore = create<{
	steps: UIStepRecord[];
	appendCompletedUiStep: (step: UIStepRecord) => void;
	resetSteps: () => void;
}>((set) => ({
	steps: [],
	appendCompletedUiStep: (step) => {
		const withEnd = step.endedAtMs != null ? step : { ...step, endedAtMs: Date.now() };
		set((s) => ({ steps: [...s.steps, withEnd] }));
	},
	resetSteps: () => set({ steps: [] }),
}));

/** Summary streaming and versions. */
const CONSOLIDATE_THRESHOLD = 50;
export const useAIAnalysisSummaryStore = create<{
	isSummaryStreaming: boolean;
	summaryChunks: string[];
	summaries: string[];
	summaryVersion: number;
	startSummaryStreaming: () => void;
	appendSummaryDelta: (delta: string) => void;
	setSummary: (summary: string) => void;
	setSummaryVersion: (version: number) => void;
	getSummary: () => string;
	markCompletedFlush: () => void;
	resetSummary: () => void;
}>((set, get) => ({
	isSummaryStreaming: false,
	summaryChunks: [],
	summaries: [],
	summaryVersion: 1,
	startSummaryStreaming: () => set({ isSummaryStreaming: true }),
	appendSummaryDelta: (delta) => {
		if (!delta) return;
		set((s) => {
			const prev = s.summaryChunks ?? [];
			const next = prev.length >= CONSOLIDATE_THRESHOLD ? [prev.join('') + delta] : [...prev, delta];
			return { summaryChunks: next };
		});
	},
	setSummary: (summary) => set((s) => {
		const nextSummaries = summary ? [...s.summaries, summary] : s.summaries;
		return {
			summaryChunks: [summary],
			summaries: nextSummaries,
			summaryVersion: nextSummaries.length || s.summaryVersion,
		};
	}),
	setSummaryVersion: (v) => set((s) => ({
		summaryVersion: Math.max(1, Math.min(v, s.summaries.length || 1)),
	})),
	getSummary: () => {
		const s = get();
		const chunks = s.summaryChunks ?? [];
		if (s.isSummaryStreaming || chunks.length > 0) {
			return chunks.join('');
		}
		const list = s.summaries;
		const idx = (s.summaryVersion ?? 1) - 1;
		return list[idx] ?? list[0] ?? '';
	},
	markCompletedFlush: () => set((s) => {
		const full = (s.summaryChunks ?? []).join('');
		const nextSummaries = full ? [...s.summaries, full] : s.summaries;
		return {
			isSummaryStreaming: false,
			summaries: nextSummaries,
			summaryVersion: nextSummaries.length || s.summaryVersion,
		};
	}),
	resetSummary: () => set({
		isSummaryStreaming: false,
		summaryChunks: [],
		summaries: [],
		summaryVersion: 1,
	}),
}));

/** Topic inspect/analyze/graph and streaming state. */
export const useAIAnalysisTopicsStore = create<{
	topicInspectResults: Record<string, SearchResultItem[]>;
	topicAnalyzeResults: Record<string, SectionAnalyzeResult[]>;
	topicAnalyzeStreaming: SectionAnalyzeStreaming | null;
	topicGraphResults: Record<string, GraphPreview | null>;
	topicModalOpen: string | null;
	topicGraphLoading: string | null;
	topicInspectLoading: string | null;
	setTopicModalOpen: (t: string | null) => void;
	setTopicInspectResults: (topic: string, items: SearchResultItem[]) => void;
	setTopicAnalyzeResult: (topic: string, question: string, answer: string) => void;
	setTopicAnalyzeStreaming: (p: SectionAnalyzeStreaming | null) => void;
	setTopicAnalyzeStreamingAppend: (chunk: string) => void;
	setTopicGraphResult: (topic: string, graph: GraphPreview | null) => void;
	setTopicGraphLoading: (t: string | null) => void;
	setTopicInspectLoading: (t: string | null) => void;
	resetTopics: () => void;
}>((set) => ({
	topicInspectResults: {},
	topicAnalyzeResults: {},
	topicAnalyzeStreaming: null,
	topicGraphResults: {},
	topicModalOpen: null,
	topicGraphLoading: null,
	topicInspectLoading: null,
	setTopicModalOpen: (t) => set({ topicModalOpen: t }),
	setTopicInspectResults: (topic, items) => set((s) => ({
		topicInspectResults: { ...s.topicInspectResults, [topic]: items },
	})),
	setTopicAnalyzeResult: (topic, question, answer) => set((s) => ({
		topicAnalyzeResults: { ...s.topicAnalyzeResults, [topic]: [{ question, answer }, ...(s.topicAnalyzeResults[topic] ?? [])] },
		topicAnalyzeStreaming: null,
	})),
	setTopicAnalyzeStreaming: (p) => set({ topicAnalyzeStreaming: p }),
	setTopicAnalyzeStreamingAppend: (chunk) => {
		if (!chunk) return;
		set((s) =>
			s.topicAnalyzeStreaming
				? { topicAnalyzeStreaming: { ...s.topicAnalyzeStreaming, chunks: [...s.topicAnalyzeStreaming.chunks, chunk] } }
				: s
		);
	},
	setTopicGraphResult: (topic, graph) => set((s) => ({
		topicGraphResults: { ...s.topicGraphResults, [topic]: graph },
		topicGraphLoading: null,
	})),
	setTopicGraphLoading: (t) => set({ topicGraphLoading: t }),
	setTopicInspectLoading: (t) => set({ topicInspectLoading: t }),
	resetTopics: () => set({
		topicInspectResults: {},
		topicAnalyzeResults: {},
		topicAnalyzeStreaming: null,
		topicGraphResults: {},
		topicModalOpen: null,
		topicGraphLoading: null,
		topicInspectLoading: null,
	}),
}));

/** Follow-ups, context chat, block chat records. */
export const useAIAnalysisInteractionsStore = create<{
	fullAnalysisFollowUp: Array<{ title: string; content: string }>;
	suggestedFollowUpQuestions: string[];
	followUpStreaming: { question: string; content: string } | null;
	contextChatModal: ContextChatModalState;
	graphFollowupHistory: SectionAnalyzeResult[];
	blocksFollowupHistoryByBlockId: Record<string, SectionAnalyzeResult[]>;
	sourcesFollowupHistory: SectionAnalyzeResult[];
	blockChatRecords: Record<string, SnapshotChatMessage[]>;
	setContextChatModal: (action: ContextChatModalState | ((prev: ContextChatModalState) => ContextChatModalState)) => void;
	appendGraphFollowup: (question: string, answer: string) => void;
	appendBlocksFollowup: (blockId: string, question: string, answer: string) => void;
	appendSourcesFollowup: (question: string, answer: string) => void;
	setFullAnalysisFollowUp: (question: string, answer: string, mode: 'append' | 'replace') => void;
	setSuggestedFollowUpQuestions: (questions: string[]) => void;
	setFollowUpStreaming: (p: { question: string; content: string } | null) => void;
	setBlockChatRecords: (blockId: string, messages: SnapshotChatMessage[]) => void;
	pruneBlockChatRecords: (blockIds: Set<string>) => void;
	resetInteractions: () => void;
}>((set) => ({
	fullAnalysisFollowUp: [],
	suggestedFollowUpQuestions: [],
	followUpStreaming: null,
	contextChatModal: null,
	graphFollowupHistory: [],
	blocksFollowupHistoryByBlockId: {},
	sourcesFollowupHistory: [],
	blockChatRecords: {},
	setContextChatModal: (action) => set((s) => ({
		contextChatModal: typeof action === 'function' ? action(s.contextChatModal) : action,
	})),
	appendGraphFollowup: (q, a) => set((s) => ({
		graphFollowupHistory: [...(s.graphFollowupHistory ?? []), { question: q, answer: a }],
	})),
	appendBlocksFollowup: (blockId, q, a) => set((s) => {
		const prev = s.blocksFollowupHistoryByBlockId?.[blockId] ?? [];
		return {
			blocksFollowupHistoryByBlockId: { ...(s.blocksFollowupHistoryByBlockId ?? {}), [blockId]: [...prev, { question: q, answer: a }] },
		};
	}),
	appendSourcesFollowup: (q, a) => set((s) => ({
		sourcesFollowupHistory: [...(s.sourcesFollowupHistory ?? []), { question: q, answer: a }],
	})),
	setFullAnalysisFollowUp: (q, a, mode) => set((s) => {
		const entry = { title: q || 'Continue', content: a };
		if (mode === 'replace') return { fullAnalysisFollowUp: [entry] };
		return { fullAnalysisFollowUp: [...(s.fullAnalysisFollowUp ?? []), entry] };
	}),
	setSuggestedFollowUpQuestions: (qs) => set({ suggestedFollowUpQuestions: qs ?? [] }),
	setFollowUpStreaming: (p) => set({ followUpStreaming: p }),
	setBlockChatRecords: (blockId, messages) => set((s) => ({
		blockChatRecords: { ...s.blockChatRecords, [blockId]: messages },
	})),
	pruneBlockChatRecords: (blockIds) => set((s) => {
		const next: Record<string, SnapshotChatMessage[]> = {};
		for (const id of blockIds) {
			if (s.blockChatRecords[id]) next[id] = s.blockChatRecords[id];
		}
		return { blockChatRecords: next };
	}),
	resetInteractions: () => set({
		fullAnalysisFollowUp: [],
		suggestedFollowUpQuestions: [],
		followUpStreaming: null,
		contextChatModal: null,
		graphFollowupHistory: [],
		blocksFollowupHistoryByBlockId: {},
		sourcesFollowupHistory: [],
		blockChatRecords: {},
	}),
}));

/** Heavy result data: graph, blocks, sources, topics, mermaid, mindflow, evidenceIndex. */
export const useAIAnalysisResultStore = create<{
	graph: AISearchGraph | null;
	dashboardBlocks: DashboardBlock[];
	sources: AISearchSource[];
	topics: AISearchTopic[];
	evidenceIndex: EvidenceIndex;
	overviewMermaidVersions: string[];
	overviewMermaidActiveIndex: number;
	mindflowMermaid: string;
	setGraph: (graph: AISearchGraph) => void;
	setDashboardBlocks: (blocks: DashboardBlock[]) => void;
	addTopic: (topic: AISearchTopic) => void;
	setTopics: (topics: AISearchTopic[]) => void;
	setSources: (sources: AISearchSource[]) => void;
	setEvidenceIndex: (index: EvidenceIndex) => void;
	setOverviewMermaidActiveIndex: (index: number) => void;
	setOverviewMermaidVersions: (versions: string[]) => void;
	pushOverviewMermaidVersion: (code: string, opts?: { makeActive?: boolean; dedupe?: boolean }) => void;
	setMindflowMermaid: (code: string) => void;
	/** Set mermaid (e.g. from MindFlow/slot pipeline). */
	setMindflowSnapshot: (payload: { mermaid?: string }) => void;
	getHasGraphData: () => boolean;
	getActiveOverviewMermaid: () => string;
	resetResult: () => void;
}>((set, get) => ({
	graph: null,
	dashboardBlocks: [],
	sources: [],
	topics: [],
	evidenceIndex: {},
	overviewMermaidVersions: [],
	overviewMermaidActiveIndex: 0,
	mindflowMermaid: '',
	setGraph: (graph) => set((s) => ({
		graph: mergeAISearchGraphs(s.graph, graph),
	})),
	setDashboardBlocks: (blocks) => {
		const blockIds = new Set(blocks.map((b) => b.id));
		useAIAnalysisInteractionsStore.getState().pruneBlockChatRecords(blockIds);
		set({ dashboardBlocks: blocks });
	},
	addTopic: (topic) => set((s) => ({ topics: [...s.topics, topic] })),
	setTopics: (topics) => set({ topics }),
	setSources: (sources) => set({ sources }),
	setEvidenceIndex: (evidenceIndex) => set({ evidenceIndex: evidenceIndex ?? {} }),
	setOverviewMermaidActiveIndex: (i) => set({ overviewMermaidActiveIndex: i }),
	setOverviewMermaidVersions: (v) => set({ overviewMermaidVersions: v }),
	pushOverviewMermaidVersion: (code, opts) => {
		const makeActive = opts?.makeActive !== false;
		const dedupe = opts?.dedupe === true;
		set((s) => {
			const versions = [...(s.overviewMermaidVersions ?? [])];
			if (dedupe && versions.length > 0 && versions[versions.length - 1] === code) return s;
			versions.push(code);
			return {
				overviewMermaidVersions: versions,
				overviewMermaidActiveIndex: makeActive ? versions.length - 1 : s.overviewMermaidActiveIndex,
			};
		});
	},
	setMindflowMermaid: (code) => set({ mindflowMermaid: code ?? '' }),
	setMindflowSnapshot: (payload) => set((s) => {
		if (payload.mermaid === undefined) return s;
		return { mindflowMermaid: payload.mermaid ?? '' };
	}),
	getHasGraphData: () => {
		const g = get().graph;
		return g != null && (g.nodes?.length ?? 0) > 0;
	},
	getActiveOverviewMermaid: () => {
		const s = get();
		const v = s.overviewMermaidVersions ?? [];
		const i = s.overviewMermaidActiveIndex ?? 0;
		return v[i] ?? '';
	},
	resetResult: () => set({
		graph: null,
		dashboardBlocks: [],
		sources: [],
		topics: [],
		evidenceIndex: {},
		overviewMermaidVersions: [],
		overviewMermaidActiveIndex: 0,
		mindflowMermaid: '',
	}),
}));

/** Orchestration: mark analysis completed (flush summary chunks into summaries). */
export function markAIAnalysisCompleted(): void {
	useAIAnalysisSummaryStore.getState().markCompletedFlush();
	useAIAnalysisRuntimeStore.getState().markCompleted();
}

/** Orchestration: reset all stores. */
export function resetAIAnalysisAll(): void {
	useAIAnalysisRuntimeStore.getState().resetRuntime();
	useAIAnalysisStepsStore.getState().resetSteps();
	useAIAnalysisSummaryStore.getState().resetSummary();
	useAIAnalysisResultStore.getState().resetResult();
	useAIAnalysisTopicsStore.getState().resetTopics();
	useAIAnalysisInteractionsStore.getState().resetInteractions();
}

/** Orchestration: build CompletedAnalysisSnapshot from all stores. */
export function buildCompletedAnalysisSnapshot(): CompletedAnalysisSnapshot {
	const rt = useAIAnalysisRuntimeStore.getState();
	const sum = useAIAnalysisSummaryStore.getState();
	const res = useAIAnalysisResultStore.getState();
	const top = useAIAnalysisTopicsStore.getState();
	const int = useAIAnalysisInteractionsStore.getState();
	const steps = useAIAnalysisStepsStore.getState().steps;
	const summaries = sum.summaries?.length ? sum.summaries : [sum.getSummary()];
	return {
		version: 1,
		runAnalysisMode: rt.runAnalysisMode ?? undefined,
		analysisStartedAtMs: rt.analysisStartedAtMs,
		duration: rt.duration,
		usage: rt.usage,
		title: rt.title ?? undefined,
		summaries,
		summaryVersion: sum.summaryVersion ?? 1,
		topics: res.topics ?? [],
		topicInspectResults: top.topicInspectResults ?? {},
		topicAnalyzeResults: top.topicAnalyzeResults ?? {},
		topicGraphResults: top.topicGraphResults ?? {},
		graph: res.graph ?? null,
		sources: res.sources ?? [],
		evidenceIndex: (res.evidenceIndex && Object.keys(res.evidenceIndex).length > 0) ? res.evidenceIndex : undefined,
		dashboardBlocks: res.dashboardBlocks ?? [],
		blockChatRecords: Object.keys(int.blockChatRecords ?? {}).length > 0 ? int.blockChatRecords : undefined,
		overviewMermaidVersions: (res.overviewMermaidVersions ?? []).length > 0 ? res.overviewMermaidVersions : undefined,
		overviewMermaidActiveIndex: (res.overviewMermaidVersions ?? []).length > 0 ? (res.overviewMermaidActiveIndex ?? 0) : undefined,
		mindflowMermaid: (res.mindflowMermaid ?? '').trim() ? res.mindflowMermaid : undefined,
		fullAnalysisFollowUp: int.fullAnalysisFollowUp ?? [],
		graphFollowups: int.graphFollowupHistory ?? [],
		blocksFollowupsByBlockId: int.blocksFollowupHistoryByBlockId ?? undefined,
		sourcesFollowups: int.sourcesFollowupHistory ?? [],
		steps: steps?.length ? steps : undefined,
	};
}

/** Orchestration: load snapshot into all stores. */
export function loadCompletedAnalysisSnapshot(snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string): void {
	const runId = snapshot.analysisStartedAtMs ? `run:${snapshot.analysisStartedAtMs}` : `replay:${Date.now()}`;
	const summaries = snapshot.summaries ?? [];
	const summaryVersion = snapshot.summaryVersion ?? 1;
	const currentSummary = getSnapshotSummary(snapshot);

	useAIAnalysisRuntimeStore.setState({
		phase: 'completed',
		isAnalyzing: false,
		analyzingBeforeFirstToken: false,
		hasStartedStreaming: false,
		hasAnalyzed: true,
		analysisCompleted: true,
		error: null,
		analysisStartedAtMs: snapshot.analysisStartedAtMs ?? null,
		analysisRunId: runId,
		restoredFromHistory: true,
		restoredFromVaultPath: sourceVaultPath ?? null,
		title: snapshot.title ?? null,
		usage: snapshot.usage ?? null,
		duration: snapshot.duration ?? null,
		runAnalysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
		analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
	});

	useAIAnalysisStepsStore.setState({ steps: snapshot.steps ?? [] });

	useAIAnalysisSummaryStore.setState({
		isSummaryStreaming: false,
		summaryChunks: [currentSummary],
		summaries,
		summaryVersion,
	});

	const ovRaw = snapshot.overviewMermaidActiveIndex as number | string | undefined;
	const ovVers = snapshot.overviewMermaidVersions ?? [];
	const ovIdx = typeof ovRaw === 'number' ? ovRaw : 0;
	const ovVersFinal = ovVers.length > 0 ? ovVers : (typeof ovRaw === 'string' && String(ovRaw).trim() ? [String(ovRaw)] : []);

	useAIAnalysisResultStore.setState({
		graph: snapshot.graph ?? null,
		dashboardBlocks: snapshot.dashboardBlocks ?? [],
		sources: snapshot.sources ?? [],
		topics: snapshot.topics ?? [],
		evidenceIndex: snapshot.evidenceIndex ?? {},
		overviewMermaidVersions: ovVersFinal,
		overviewMermaidActiveIndex: ovIdx,
		mindflowMermaid: (snapshot.mindflowMermaid ?? '').trim() ? snapshot.mindflowMermaid! : '',
	});

	useAIAnalysisTopicsStore.setState({
		topicInspectResults: snapshot.topicInspectResults ?? {},
		topicAnalyzeResults: snapshot.topicAnalyzeResults ?? {},
		topicGraphResults: snapshot.topicGraphResults ?? {},
		topicAnalyzeStreaming: null,
		topicGraphLoading: null,
		topicInspectLoading: null,
	});

	useAIAnalysisInteractionsStore.setState({
		fullAnalysisFollowUp: snapshot.fullAnalysisFollowUp ?? [],
		graphFollowupHistory: snapshot.graphFollowups ?? [],
		blocksFollowupHistoryByBlockId: snapshot.blocksFollowupsByBlockId ?? (snapshot.blocksFollowups?.length ? { __legacy__: snapshot.blocksFollowups } : {}),
		sourcesFollowupHistory: snapshot.sourcesFollowups ?? [],
		blockChatRecords: snapshot.blockChatRecords ?? {},
		contextChatModal: null,
	});
}

/** Helpers that read from multiple stores (for components). */
export function getHasGraphData(): boolean {
	const res = useAIAnalysisResultStore.getState();
	const g = res.graph;
	return g != null && (g.nodes?.length ?? 0) > 0;
}
export function getHasSummarySection(): boolean {
	const rt = useAIAnalysisRuntimeStore.getState();
	const sum = useAIAnalysisSummaryStore.getState();
	return rt.analysisCompleted && ((sum.summaries?.length ?? 0) > 0 || (sum.summaryChunks ?? []).join('').trim().length > 0);
}
export function getHasTopicsSection(): boolean {
	const rt = useAIAnalysisRuntimeStore.getState();
	const res = useAIAnalysisResultStore.getState();
	return rt.analysisCompleted && (res.topics?.length ?? 0) > 0;
}
export function getHasDashboardBlocksSection(): boolean {
	const rt = useAIAnalysisRuntimeStore.getState();
	const res = useAIAnalysisResultStore.getState();
	return rt.analysisCompleted && (res.dashboardBlocks?.length ?? 0) > 0;
}
export function getHasSourcesSection(): boolean {
	const res = useAIAnalysisResultStore.getState();
	return (res.sources?.length ?? 0) > 0;
}
export function getHasCompletedContent(): boolean {
	const rt = useAIAnalysisRuntimeStore.getState();
	return rt.analysisCompleted && (getHasSummarySection() || getHasTopicsSection() || getHasDashboardBlocksSection() || getHasSourcesSection());
}

// Get clean query without @web@ for actual search
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};
