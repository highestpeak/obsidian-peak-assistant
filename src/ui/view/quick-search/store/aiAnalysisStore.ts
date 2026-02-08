import { create } from 'zustand';
import { AISearchGraph, AISearchSource, AISearchTopic, type AnalysisMode, DashboardBlock } from '@/service/agents/AISearchAgent';

export type { AnalysisMode };
import { LLMUsage } from '@/core/providers/types';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';

/** Per-topic completed Q&A from Analyze. */
export type SectionAnalyzeResult = { question: string; answer: string };
/** Currently streaming Analyze (single in-flight). */
export type SectionAnalyzeStreaming = { topic: string; question: string; answerSoFar: string };

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

/** Single chat message for snapshot (graph/source/block context chats). */
export type SnapshotChatMessage = { role: string; content: string };

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

export type AIAnalysisStepType =
	'idle' |
	'search-thought-agent-talking' |
	'search-thought-agent-reasoning' |
	'search-inspector-agent-talking' |
	'search-inspector-agent-reasoning' |
	'search-inspector-agent-inspect_note_context' |
	'search-inspector-agent-graph_traversal' |
	'search-inspector-agent-find_path' |
	'search-inspector-agent-find_key_nodes' |
	'search-inspector-agent-find_orphans' |
	'search-inspector-agent-search_by_dimensions' |
	'search-inspector-agent-explore_folder' |
	'search-inspector-agent-recent_changes_whole_vault' |
	'search-inspector-agent-local_search_whole_vault' |
	'search-inspector-agent-content_reader' |
	'search-inspector-agent-web_search' |
	'search-thought-agent-summary_context_messages' | 'pk-debug';
'pk-debug';

export const StepsUISkipShouldSkip = new Set<AIAnalysisStepType>([
	'idle',
	'pk-debug',
]);

export interface AIAnalysisStep {
	type: AIAnalysisStepType;
	textChunks: string[]; // Use array to efficiently accumulate text chunks
	extra?: any;
	startedAtMs?: number; // Timestamp when step started (for timer display)
	endedAtMs?: number;   // Timestamp when step completed (for duration calculation)
}

/**
 * for save to markdown and replay.
 */
export type CompletedAnalysisSnapshot = {
	/** Snapshot schema version. */
	version: 1;
	/** Mode used for this run (for display filtering). Omit = full. */
	runAnalysisMode?: AnalysisMode;
	analysisStartedAtMs?: number | null;
	duration?: number | null;
	usage?: LLMUsage | null;

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
	/** Per-source chat history (key = source path or id). */
	sourcesChatRecords?: Record<string, SnapshotChatMessage[]>;

	dashboardBlocks: DashboardBlock[];
	/** Per-dashboard-block chat history (key = block id). */
	blockChatRecords?: Record<string, SnapshotChatMessage[]>;

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

	/** All analysis steps (thought/inspector tool calls, etc.) for replay and dev copy. */
	steps?: AIAnalysisStep[];
};

/** Current summary text from snapshot (selected by summaryVersion). */
export function getSnapshotSummary(snapshot: CompletedAnalysisSnapshot): string {
	const list = snapshot.summaries ?? [];
	const idx = (snapshot.summaryVersion ?? 1) - 1;
	return list[idx] ?? list[0] ?? '';
}

interface AIAnalysisStore {
	// before analysis
	triggerAnalysis: number;
	webEnabled: boolean;
	/** Simple = summary + sources only; Full = topics, graph, blocks, etc. */
	analysisMode: AnalysisMode;

	/**
	 * Mark whether the current completed state was restored from history/cache.
	 * This helps avoid unintended auto-save on modal reopen.
	 */
	restoredFromHistory: boolean;
	/** Vault path of the file when restored from history; used for "Open in document" button. */
	restoredFromVaultPath: string | null;
	/**
	 * Auto-save bookkeeping to prevent duplicate file generation.
	 */
	autoSaveState: {
		lastRunId: string | null;
		lastSavedSummaryHash: string | null;
	};
	/**
	 * Whether the Quick Search modal is currently open.
	 * Used to decide if we should send a Notice after analysis completes.
	 */
	aiModalOpen: boolean;
	/** Mode used for the current/completed run. Set at analysis start, used for display filtering. */
	runAnalysisMode: AnalysisMode | null;

	/**
	 * Stable identifier for the current analysis run.
	 * Used to dedupe auto-save across modal reopen/re-render.
	 */
	analysisRunId: string | null;
	/**
	 * streaming states
	 * analyzingBeforeFirstToken => hasStartedStreaming => hasAnalyzed => analysisCompleted
	 */
	isAnalyzing: boolean;
	analyzingBeforeFirstToken: boolean;
	hasStartedStreaming: boolean;
	hasAnalyzed: boolean;
	// Flag to prevent re-triggering analysis on tab switch
	analysisCompleted: boolean;
	error: string | null;
	currentStep: AIAnalysisStep;
	/**
	 * eg: Explored xxx, Thought xxx, Read xxx.
	 * some step may trigger animation, eg find path shimmer, read note shimmer, etc.
	 * every time step change. currentStep will be replace and append to the steps array.
	 */
	steps: AIAnalysisStep[];
	stepTrigger: number;
	isSummaryStreaming: boolean;
	/**
	 * Timestamp when analysis started (ms).
	 * Used for rendering a global timer inside the AI Analysis area.
	 */
	analysisStartedAtMs: number | null;

	// final state (will change during streaming but will be replaced with the final state after streaming)
	/** Current streaming summary chunks. */
	summaryChunks: string[];
	/** All completed summaries (each run adds one). */
	summaries: string[];
	/** 1-based index into summaries: which one is selected for display. */
	summaryVersion: number;
	graph: AISearchGraph | null;
	dashboardBlocks: DashboardBlock[];
	topics: AISearchTopic[];
	sources: AISearchSource[];
	usage: LLMUsage | null;
	duration: number | null;

	/** Follow-up sections from "Continue Analysis" (each user question → answer); cleared on reset. */
	fullAnalysisFollowUp: Array<{ title: string; content: string }>;
	/** Per-topic vault inspect results (key = topic label). */
	topicInspectResults: Record<string, SearchResultItem[]>;
	/** Per-topic completed Analyze Q&A. */
	topicAnalyzeResults: Record<string, SectionAnalyzeResult[]>;
	topicModalOpen: string | null;
	/** Currently streaming Analyze (one at a time). */
	topicAnalyzeStreaming: SectionAnalyzeStreaming | null;
	/** Per-topic graph. */
	topicGraphResults: Record<string, GraphPreview | null>;
	/** Topic for which graph is loading. */
	topicGraphLoading: string | null;
	/** Topic for which Inspect is loading. */
	topicInspectLoading: string | null;

	/** Context chat modal (Graph/Blocks/Sources). null = closed. */
	contextChatModal: ContextChatModalState;
	setContextChatModal: (action: ContextChatModalState | ((prev: ContextChatModalState) => ContextChatModalState)) => void;

	/** Graph section follow-up history (all rounds). */
	graphFollowupHistory: SectionAnalyzeResult[];
	/** Per-block follow-up history (key = block id). */
	blocksFollowupHistoryByBlockId: Record<string, SectionAnalyzeResult[]>;
	/** Sources section follow-up history (all rounds). */
	sourcesFollowupHistory: SectionAnalyzeResult[];

	appendGraphFollowup: (question: string, answer: string) => void;
	appendBlocksFollowup: (blockId: string, question: string, answer: string) => void;
	appendSourcesFollowup: (question: string, answer: string) => void;

	// before analysis actions
	incrementTriggerAnalysis: () => void;
	toggleWeb: (currentQuery: string) => string;
	updateWebFromQuery: (query: string) => void;
	setAnalysisMode: (mode: AnalysisMode) => void;

	// streaming actions
	startAnalyzing: () => void;
	startStreaming: () => void;
	markCompleted: () => void;
	recordError: (error: string) => void;
	// Set current step type and extra data (completion handled by completeCurrentStep)
	setCurrentStep: (type: AIAnalysisStepType, extra?: any) => void;
	// Complete current step with text chunks (called when step finishes)
	completeCurrentStep: (textChunks: string[]) => void;
	startSummaryStreaming: () => void;
	/**
	 * Append summary delta in a throttled manner (caller should throttle).
	 * Used for Markdown rendering with Streamdown.
	 */
	appendSummaryDelta: (delta: string) => void;

	// final state reset actions
	setSummary: (summary: string) => void;
	setSummaryVersion: (version: number) => void;

	// Computed getters
	setGraph: (graph: AISearchGraph) => void;
	setDashboardBlocks: (blocks: DashboardBlock[]) => void;
	addTopic: (topic: AISearchTopic) => void;
	setTopics: (topics: AISearchTopic[]) => void;
	setSources: (sources: AISearchSource[]) => void;
	setUsage: (usage: LLMUsage) => void;
	setDuration: (duration: number) => void;
	setFullAnalysisFollowUp: (question: string, answer: string, mode: 'append' | 'replace') => void;
	setTopicModalOpen: (topic: string | null) => void;
	setTopicInspectResults: (topic: string, items: SearchResultItem[]) => void;
	setTopicAnalyzeResult: (topic: string, question: string, answer: string) => void;
	setTopicAnalyzeStreaming: (payload: SectionAnalyzeStreaming | null) => void;
	setTopicGraphResult: (topic: string, graph: GraphPreview | null) => void;
	setTopicGraphLoading: (topic: string | null) => void;
	setTopicInspectLoading: (topic: string | null) => void;
	setAutoSaveState: (state: { lastRunId?: string | null; lastSavedSummaryHash?: string | null }) => void;
	setAiModalOpen: (open: boolean) => void;

	/**
	 * Load a completed analysis snapshot into the store.
	 * Used by "Recent AI Analysis" replay in the modal.
	 * @param sourceVaultPath - When loading from a saved file, pass its vault path for "Open in document" button.
	 */
	loadCompletedAnalysis: (snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string) => void;

	// Reset analysis state
	resetAnalysisState: () => void;

	// Computed getters
	getCurrentStepText: () => string;
	getStepText: (step: AIAnalysisStep) => string;
	getHasGraphData: () => boolean;
	getHasCompletedContent: () => boolean;
	getHasSummarySection: () => boolean;
	/** Current summary for display (streaming = summaryChunks, else summaries[summaryVersion-1]). */
	getSummary: () => string;
	getHasTopicsSection: () => boolean;
	getHasDashboardBlocksSection: () => boolean;
	getHasSourcesSection: () => boolean;
}

export const useAIAnalysisStore = create<AIAnalysisStore>((set, get) => ({
	// before analysis
	triggerAnalysis: 0,
	webEnabled: false,
	analysisMode: 'full',
	analysisRunId: null,
	restoredFromHistory: false,
	restoredFromVaultPath: null,
	autoSaveState: {
		lastRunId: null,
		lastSavedSummaryHash: null,
	},
	aiModalOpen: false,
	runAnalysisMode: null,

	// streaming states
	isAnalyzing: false,
	analyzingBeforeFirstToken: false,
	hasStartedStreaming: false,
	hasAnalyzed: false,
	analysisCompleted: false,
	error: null,
	currentStep: { type: 'idle', textChunks: [] },
	steps: [],
	isSummaryStreaming: false,
	analysisStartedAtMs: null,
	stepTrigger: 0,

	// final state
	summaryChunks: [],
	summaries: [],
	summaryVersion: 1,
	graph: null,
	dashboardBlocks: [],
	topics: [],
	sources: [],
	usage: null,
	duration: null,
	fullAnalysisFollowUp: [],
	topicInspectResults: {},
	topicAnalyzeResults: {},
	topicModalOpen: null,
	topicAnalyzeStreaming: null,
	topicGraphResults: {},
	topicGraphLoading: null,
	topicInspectLoading: null,
	contextChatModal: null,
	setContextChatModal: (action) => set((s) => ({
		contextChatModal: typeof action === 'function' ? action(s.contextChatModal) : action,
	})),
	graphFollowupHistory: [],
	blocksFollowupHistoryByBlockId: {},
	sourcesFollowupHistory: [],

	appendGraphFollowup: (question: string, answer: string) =>
		set((s) => ({
			graphFollowupHistory: [...(s.graphFollowupHistory ?? []), { question, answer }],
		})),
	appendBlocksFollowup: (blockId: string, question: string, answer: string) =>
		set((s) => {
			const prev = s.blocksFollowupHistoryByBlockId?.[blockId] ?? [];
			return {
				blocksFollowupHistoryByBlockId: {
					...(s.blocksFollowupHistoryByBlockId ?? {}),
					[blockId]: [...prev, { question, answer }],
				},
			};
		}),
	appendSourcesFollowup: (question: string, answer: string) =>
		set((s) => ({
			sourcesFollowupHistory: [...(s.sourcesFollowupHistory ?? []), { question, answer }],
		})),

	// before analysis actions
	incrementTriggerAnalysis: () => set((state) => ({ triggerAnalysis: state.triggerAnalysis + 1 })),
	toggleWeb: (currentQuery: string) => {
		if (currentQuery.includes('@web@')) {
			set({ webEnabled: false });
			return currentQuery.replace(/@web@\s*/g, '').trim();
		} else {
			set({ webEnabled: true });
			return currentQuery + (currentQuery.trim() ? ' @web@' : '@web@');
		}
	},
	updateWebFromQuery: (query: string) => {
		const trimmed = query.trim();
		const hasWebTrigger = trimmed.includes('@web@');
		set({ webEnabled: hasWebTrigger });
	},
	setAnalysisMode: (mode: AnalysisMode) => set({ analysisMode: mode }),

	// streaming actions
	startAnalyzing: () => {
		const ts = Date.now();
		const mode = get().analysisMode;
		set({
			isAnalyzing: true,
			analyzingBeforeFirstToken: true,
			analysisStartedAtMs: ts,
			analysisRunId: `run:${ts}`,
			restoredFromHistory: false,
			restoredFromVaultPath: null,
			runAnalysisMode: mode,
		});
	},
	startStreaming: () => set({ hasStartedStreaming: true, analyzingBeforeFirstToken: false }),
	markCompleted: () => {
		set((state) => {
			const fullSummary = state.summaryChunks.join('');
			const nextSummaries = fullSummary ? [...state.summaries, fullSummary] : state.summaries;
			return {
				isAnalyzing: false,
				hasStartedStreaming: false,
				analysisCompleted: true,
				isSummaryStreaming: false,
				summaries: nextSummaries,
				summaryVersion: nextSummaries.length || state.summaryVersion,
			};
		});
	},
	recordError: (error: string) => set({ error }),
	setCurrentStep: (type: AIAnalysisStepType, extra?: any) => {
		const prevStep = get().currentStep;
		const prevStepType = prevStep.type;
		if (prevStepType && prevStepType !== type) {
			// Step type changed - trigger UI update but don't auto-complete
			set((state) => ({
				stepTrigger: state.stepTrigger + 1,
				currentStep: {
					type,
					textChunks: [],
					extra: extra,
					startedAtMs: Date.now() // Record start time for timer
				},
			}));
		} else {
			// Same step type, just update extra
			set({
				currentStep: {
					type,
					textChunks: prevStep.textChunks,
					extra: { ...prevStep.extra, ...extra },
					startedAtMs: prevStep.startedAtMs // Preserve start time
				}
			});
		}
	},
	completeCurrentStep: (textChunks: string[]) => {
		const currentStep = get().currentStep;
		if (currentStep.type !== 'idle') {
			const endedAtMs = Date.now();
			set((state) => ({
				stepTrigger: state.stepTrigger + 1,
				steps: [...state.steps, {
					...currentStep,
					textChunks: textChunks,
					endedAtMs: endedAtMs // Record end time for duration
				}],
				currentStep: { type: 'idle', textChunks: [] }
			}));
		}
	},
	startSummaryStreaming: () => set({ isSummaryStreaming: true }),
	appendSummaryDelta: (delta: string) => {
		if (!delta) return;
		set((state) => ({
			summaryChunks: [...state.summaryChunks, delta],
			hasAnalyzed: true,
		}));
	},
	// final state reset actions
	setSummary: (summary: string) => {
		set((state) => {
			const nextSummaries = summary ? [...state.summaries, summary] : state.summaries;
			return {
				summaryChunks: [summary],
				summaries: nextSummaries,
				summaryVersion: nextSummaries.length || state.summaryVersion,
				hasAnalyzed: true,
			};
		});
	},
	setSummaryVersion: (version: number) => {
		set((state) => ({
			summaryVersion: Math.max(1, Math.min(version, state.summaries.length || 1)),
		}));
	},

	setGraph: (graph: AISearchGraph) => {
		set((s) => ({
			graph: mergeAISearchGraphs(s.graph, graph),
			hasAnalyzed: true,
		}));
	},
	setDashboardBlocks: (dashboardBlocks: DashboardBlock[]) => {
		set({ dashboardBlocks, hasAnalyzed: true });
	},
	addTopic: (topic: AISearchTopic) => {
		set((s) => ({ topics: [...s.topics, topic] }));
	},
	setTopics: (topics: AISearchTopic[]) => {
		set({ topics, hasAnalyzed: true });
	},
	setSources: (sources: AISearchSource[]) => {
		set({ sources, hasAnalyzed: true });
	},
	setUsage: (usage: LLMUsage) => {
		set({ usage, hasAnalyzed: true });
	},
	setDuration: (duration: number) => {
		set({ duration, hasAnalyzed: true });
	},
	setFullAnalysisFollowUp: (question: string, answer: string, mode: 'append' | 'replace') => {
		set((s) => {
			const entry = { title: question || 'Continue', content: answer };
			if (mode === 'replace') return { fullAnalysisFollowUp: [entry] };
			return { fullAnalysisFollowUp: [...(s.fullAnalysisFollowUp ?? []), entry] };
		});
	},
	setTopicModalOpen: (topic: string | null) => {
		set({ topicModalOpen: topic });
	},
	setTopicInspectResults: (topic: string, items: SearchResultItem[]) => {
		set((s) => ({
			topicInspectResults: { ...s.topicInspectResults, [topic]: items },
		}));
	},
	setTopicAnalyzeResult: (topic: string, question: string, answer: string) => {
		set((s) => {
			const list = [{ question, answer }, ...(s.topicAnalyzeResults[topic] ?? [])];
			return {
				topicAnalyzeResults: { ...s.topicAnalyzeResults, [topic]: list },
				topicAnalyzeStreaming: null,
			};
		});
	},
	setTopicAnalyzeStreaming: (payload: SectionAnalyzeStreaming | null) => {
		set({ topicAnalyzeStreaming: payload });
	},
	setTopicGraphResult: (topic: string, graph: GraphPreview | null) => {
		set((s) => ({
			topicGraphResults: { ...s.topicGraphResults, [topic]: graph },
			topicGraphLoading: null,
		}));
	},
	setTopicGraphLoading: (topic: string | null) => {
		set({ topicGraphLoading: topic });
	},
	setTopicInspectLoading: (topic: string | null) => {
		set({ topicInspectLoading: topic });
	},
	setAutoSaveState: (state) => {
		set((s) => ({
			autoSaveState: {
				lastRunId: state.lastRunId !== undefined ? state.lastRunId : s.autoSaveState.lastRunId,
				lastSavedSummaryHash: state.lastSavedSummaryHash !== undefined ? state.lastSavedSummaryHash : s.autoSaveState.lastSavedSummaryHash,
			},
		}));
	},
	setAiModalOpen: (open) => set({ aiModalOpen: open }),

	loadCompletedAnalysis: (snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string) => {
		// IMPORTANT:
		// This should not kick off streaming; it only rehydrates a finished result for display.
		const runId = snapshot.analysisStartedAtMs ? `run:${snapshot.analysisStartedAtMs}` : `replay:${Date.now()}`;
		const summaries = snapshot.summaries ?? [];
		const summaryVersion = snapshot.summaryVersion ?? 1;
		const currentSummary = getSnapshotSummary(snapshot);
		set({
			isAnalyzing: false,
			analyzingBeforeFirstToken: false,
			hasStartedStreaming: false,
			hasAnalyzed: true,
			analysisCompleted: true,
			stepTrigger: 0,
			error: null,
			currentStep: { type: 'idle', textChunks: [] },
			steps: snapshot.steps ?? [],
			isSummaryStreaming: false,
			analysisStartedAtMs: snapshot.analysisStartedAtMs ?? null,
			analysisRunId: runId,
			restoredFromHistory: true,
			restoredFromVaultPath: sourceVaultPath ?? null,
			summaryChunks: [currentSummary],
			summaries,
			summaryVersion,
			graph: snapshot.graph ?? null,
			dashboardBlocks: snapshot.dashboardBlocks ?? [],
			topics: snapshot.topics ?? [],
			sources: snapshot.sources ?? [],
			topicInspectResults: snapshot.topicInspectResults ?? {},
			topicAnalyzeResults: snapshot.topicAnalyzeResults ?? {},
			topicGraphResults: snapshot.topicGraphResults ?? {},
			topicAnalyzeStreaming: null,
			topicGraphLoading: null,
			topicInspectLoading: null,
			usage: snapshot.usage ?? null,
			duration: snapshot.duration ?? null,
			runAnalysisMode: snapshot.runAnalysisMode ?? 'full',
			fullAnalysisFollowUp: snapshot.fullAnalysisFollowUp ?? [],
			graphFollowupHistory: snapshot.graphFollowups ?? [],
			blocksFollowupHistoryByBlockId: snapshot.blocksFollowupsByBlockId ?? (snapshot.blocksFollowups?.length ? { __legacy__: snapshot.blocksFollowups } : {}),
			sourcesFollowupHistory: snapshot.sourcesFollowups ?? [],
			contextChatModal: null,
		});
	},

	// Reset analysis state
		resetAnalysisState: () => set({
		isAnalyzing: false,
		analyzingBeforeFirstToken: false,
		hasStartedStreaming: false,
		hasAnalyzed: false,
		analysisCompleted: false,
		stepTrigger: 0,
		error: null,
		currentStep: { type: 'idle', textChunks: [] },
		steps: [],
		isSummaryStreaming: false,
		analysisStartedAtMs: null,
		analysisRunId: null,
		restoredFromHistory: false,
		restoredFromVaultPath: null,
		summaryChunks: [],
		summaries: [],
		summaryVersion: 1,
		graph: null,
		dashboardBlocks: [],
		topics: [],
		sources: [],
		topicInspectResults: {},
		topicAnalyzeResults: {},
		topicGraphResults: {},
		topicAnalyzeStreaming: null,
		topicGraphLoading: null,
		topicInspectLoading: null,
		contextChatModal: null,
		graphFollowupHistory: [],
		blocksFollowupHistoryByBlockId: {},
		sourcesFollowupHistory: [],
		usage: null,
		duration: null,
		fullAnalysisFollowUp: [],
		runAnalysisMode: null,
	}),

	// Computed getters
	getCurrentStepText: () => get().currentStep.textChunks.join(''),
	getStepText: (step: AIAnalysisStep) => step.textChunks.join(''),

	getHasGraphData: () => {
		const graph = get().graph;
		return graph !== null && graph !== undefined && graph.nodes.length > 0;
	},
	getHasCompletedContent: () => get().analysisCompleted &&
		(get().getHasSummarySection() || get().getHasTopicsSection() || get().getHasDashboardBlocksSection() || get().getHasSourcesSection()),
	getHasSummarySection: () => {
		const s = get();
		return s.analysisCompleted && ((s.summaries.length > 0) || s.summaryChunks.join('').trim().length > 0);
	},
	getSummary: () => {
		const s = get();
		if (s.isSummaryStreaming || (s.isAnalyzing && s.summaryChunks.length > 0)) {
			return s.summaryChunks.join('');
		}
		const list = s.summaries;
		const idx = (s.summaryVersion ?? 1) - 1;
		return list[idx] ?? list[0] ?? '';
	},
	getHasTopicsSection: () => get().analysisCompleted && get().topics.length > 0,
	getHasDashboardBlocksSection: () => get().analysisCompleted && (get().dashboardBlocks ?? []).length > 0,
	getHasSourcesSection: () => get().analysisCompleted && get().sources.length > 0,
}));

// Get clean query without @web@ for actual search
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};