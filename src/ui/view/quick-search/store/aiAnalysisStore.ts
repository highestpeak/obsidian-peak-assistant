import { create } from 'zustand';
import { AISearchGraph, AISearchSource, AISearchTopic, type AnalysisMode, DashboardBlock } from '@/service/agents/AISearchAgent';

export type { AnalysisMode };

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
	'search-thought-agent-summary_context_messages' |
	'search-dashboard-update-agent' |
	'search-internal-audit-summary' |
	'search-internal-audit-questions' |
	'search-internal-audit-loop' |
	'search-summary' |
	'search-title' |
	'search-overview-mermaid' |
	'search-review-blocks' |
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
	/** Per-source chat history (key = source path or id). */
	sourcesChatRecords?: Record<string, SnapshotChatMessage[]>;

	dashboardBlocks: DashboardBlock[];
	/** Per-dashboard-block chat history (key = block id). */
	blockChatRecords?: Record<string, SnapshotChatMessage[]>;

	/** Overview diagram (raw Mermaid code) from Mermaid Overview Agent. */
	overviewMermaidActiveIndex?: number;
	// all versions of overview mermaid
	overviewMermaidVersions?: string[];

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

interface AIAnalysisStore {
	// before analysis
	triggerAnalysis: number;
	webEnabled: boolean;
	/** docSimple | vaultSimple | vaultFull. Required for agent. */
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
		/** Vault path of the file from last auto-save; used for "Open in document" button. */
		lastSavedPath: string | null;
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
	/** Current streaming UI step (from ui-step); null when idle. Completed steps are in steps[]. */
	currentStep: UIStepRecord | null;
	/** Completed UI steps (from ui-step); never cleared until new run. */
	steps: UIStepRecord[];
	/** Increments when current step changes (for UI key/clear). */
	stepTrigger: number;
	isSummaryStreaming: boolean;
	/**
	 * Timestamp when analysis started (ms).
	 * Used for rendering a global timer inside the AI Analysis area.
	 */
	analysisStartedAtMs: number | null;

	// final state (will change during streaming but will be replaced with the final state after streaming)
	/** Short display title (set when analysis completes). */
	title: string | null;
	/** Current streaming summary chunks. */
	summaryChunks: string[];
	/** All completed summaries (each run adds one). */
	summaries: string[];
	/** 1-based index into summaries: which one is selected for display. */
	summaryVersion: number;
	graph: AISearchGraph | null;
	dashboardBlocks: DashboardBlock[];
	/** Per-dashboard-block chat history (key = block id). Same pattern as dashboardBlocks list + records by id. */
	blockChatRecords: Record<string, SnapshotChatMessage[]>;
	topics: AISearchTopic[];
	sources: AISearchSource[];
	/** Overview diagram (raw Mermaid code). */
	overviewMermaidActiveIndex: number;
	overviewMermaidVersions: string[];
	usage: LLMUsage | null;
	duration: number | null;

	/** Follow-up sections from "Continue Analysis" (each user question → answer); cleared on reset. */
	fullAnalysisFollowUp: Array<{ title: string; content: string }>;
	/** Suggested follow-up questions from dedicated agent (full session context); not from topics. */
	suggestedFollowUpQuestions: string[];
	/** Currently streaming follow-up (question + accumulating content). Null when idle or done. */
	followUpStreaming: { question: string; content: string } | null;
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
	/** Append a completed UI step (e.g. when next ui-step arrives or on complete). */
	appendCompletedUiStep: (step: UIStepRecord) => void;
	/** Set/switch current streaming step; pushes previous to steps if present. */
	setCurrentUiStep: (stepId: string, title: string, description?: string) => void;
	/** Overwrite current step title/description when stepId matches (no push to completed). */
	updateCurrentUiStep: (stepId: string, title: string, description?: string) => void;
	/** Clear current streaming step (e.g. on analysis complete so last step shows as finished). */
	clearCurrentUiStep: () => void;
	/** Append delta to current step description/title. */
	appendCurrentUiStepDelta: (descriptionDelta?: string, titleDelta?: string) => void;
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
	/** Set or append chat messages for a block; prunes records for block ids not in dashboardBlocks. */
	setBlockChatRecords: (blockId: string, messages: SnapshotChatMessage[]) => void;
	addTopic: (topic: AISearchTopic) => void;
	setTopics: (topics: AISearchTopic[]) => void;
	setSources: (sources: AISearchSource[]) => void;
	setOverviewMermaidActiveIndex: (index: number) => void;
	setOverviewMermaidVersions: (versions: string[]) => void;
	/** Append a new overview mermaid version; optionally set as active and dedupe against last. */
	pushOverviewMermaidVersion: (code: string, opts?: { makeActive?: boolean; dedupe?: boolean }) => void;
	setTitle: (title: string | null) => void;
	setUsage: (usage: LLMUsage) => void;
	/** Add follow-up chat usage to current analysis usage (merged totals). */
	accumulateUsage: (usage: LLMUsage) => void;
	setDuration: (duration: number) => void;
	setFullAnalysisFollowUp: (question: string, answer: string, mode: 'append' | 'replace') => void;
	setSuggestedFollowUpQuestions: (questions: string[]) => void;
	setFollowUpStreaming: (payload: { question: string; content: string } | null) => void;
	setTopicModalOpen: (topic: string | null) => void;
	setTopicInspectResults: (topic: string, items: SearchResultItem[]) => void;
	setTopicAnalyzeResult: (topic: string, question: string, answer: string) => void;
	setTopicAnalyzeStreaming: (payload: SectionAnalyzeStreaming | null) => void;
	/** Append a chunk to current topic streaming (no-op if none). Avoids replacing large string. */
	setTopicAnalyzeStreamingAppend: (chunk: string) => void;
	setTopicGraphResult: (topic: string, graph: GraphPreview | null) => void;
	setTopicGraphLoading: (topic: string | null) => void;
	setTopicInspectLoading: (topic: string | null) => void;
	setAutoSaveState: (state: { lastRunId?: string | null; lastSavedSummaryHash?: string | null; lastSavedPath?: string | null }) => void;
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
	getStepText: (step: UIStepRecord) => string;
	getHasGraphData: () => boolean;
	getHasCompletedContent: () => boolean;
	getHasSummarySection: () => boolean;
	/** Current summary for display (streaming = summaryChunks, else summaries[summaryVersion-1]). */
	getSummary: () => string;
	getHasTopicsSection: () => boolean;
	getHasDashboardBlocksSection: () => boolean;
	getHasSourcesSection: () => boolean;
	/** Active overview mermaid string (versions[activeIndex]). */
	getActiveOverviewMermaid: () => string;
}

export const useAIAnalysisStore = create<AIAnalysisStore>((set, get) => ({
	// before analysis
	triggerAnalysis: 0,
	webEnabled: false,
	analysisMode: 'vaultFull',
	analysisRunId: null,
	restoredFromHistory: false,
	restoredFromVaultPath: null,
	autoSaveState: {
		lastRunId: null,
		lastSavedSummaryHash: null,
		lastSavedPath: null,
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
	currentStep: null,
	steps: [],
	isSummaryStreaming: false,
	analysisStartedAtMs: null,
	stepTrigger: 0,

	// final state
	title: null,
	summaryChunks: [],
	summaries: [],
	summaryVersion: 1,
	graph: null,
	dashboardBlocks: [],
	blockChatRecords: {},
	topics: [],
	sources: [],
	overviewMermaidActiveIndex: 0,
	overviewMermaidVersions: [],
	usage: null,
	duration: null,
	fullAnalysisFollowUp: [],
	suggestedFollowUpQuestions: [],
	followUpStreaming: null,
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
			autoSaveState: { ...get().autoSaveState, lastSavedPath: null },
			runAnalysisMode: mode,
			currentStep: null,
			steps: [],
			stepTrigger: 0,
		});
	},
	startStreaming: () => set({ hasStartedStreaming: true, analyzingBeforeFirstToken: false }),
	markCompleted: () => {
		set((state) => {
			const fullSummary = (state.summaryChunks ?? []).join('');
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
	appendCompletedUiStep: (step: UIStepRecord) => {
		const withEnd = step.endedAtMs != null ? step : { ...step, endedAtMs: Date.now() };
		set((state) => ({ steps: [...state.steps, withEnd] }));
	},
	setCurrentUiStep: (stepId: string, title: string, description?: string) => {
		set((state) => {
			const prev = state.currentStep;
			const nextStep: UIStepRecord = {
				stepId,
				title: title || 'Step',
				description: description ?? '',
				startedAtMs: Date.now(),
			};
			const steps = prev
				? [...state.steps, { ...prev, endedAtMs: prev.endedAtMs ?? Date.now() }]
				: state.steps;
			return {
				stepTrigger: state.stepTrigger + 1,
				currentStep: nextStep,
				steps,
			};
		});
	},
	updateCurrentUiStep: (stepId: string, title: string, description?: string) => {
		set((state) => {
			const cur = state.currentStep;
			if (!cur || cur.stepId !== stepId) return state;
			return {
				currentStep: {
					...cur,
					title: title || cur.title,
					description: description !== undefined && description !== null ? description : cur.description,
				},
			};
		});
	},
	clearCurrentUiStep: () => set({ currentStep: null }),
	appendCurrentUiStepDelta: (descriptionDelta?: string, titleDelta?: string) => {
		set((state) => {
			const cur = state.currentStep;
			if (!cur) return state;
			return {
				currentStep: {
					...cur,
					title: cur.title + (titleDelta ?? ''),
					description: cur.description + (descriptionDelta ?? ''),
				},
			};
		});
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
	setDashboardBlocks: (blocks: DashboardBlock[]) => {
		set((s) => {
			const blockIds = new Set(blocks.map((b) => b.id));
			const nextRecords: Record<string, SnapshotChatMessage[]> = {};
			for (const id of blockIds) {
				if (s.blockChatRecords[id]) nextRecords[id] = s.blockChatRecords[id];
			}
			return { dashboardBlocks: blocks, blockChatRecords: nextRecords, hasAnalyzed: true };
		});
	},
	setBlockChatRecords: (blockId: string, messages: SnapshotChatMessage[]) => {
		set((s) => ({
			blockChatRecords: { ...s.blockChatRecords, [blockId]: messages },
		}));
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
	setOverviewMermaidActiveIndex: (index: number) => {
		set({ overviewMermaidActiveIndex: index, hasAnalyzed: true });
	},
	setOverviewMermaidVersions: (versions: string[]) => {
		set({ overviewMermaidVersions: versions, hasAnalyzed: true });
	},
	pushOverviewMermaidVersion: (code: string, opts?: { makeActive?: boolean; dedupe?: boolean }) => {
		const makeActive = opts?.makeActive !== false;
		const dedupe = opts?.dedupe === true;
		set((s) => {
			const versions = [...(s.overviewMermaidVersions ?? [])];
			if (dedupe && versions.length > 0 && versions[versions.length - 1] === code) {
				return s;
			}
			versions.push(code);
			const nextIndex = makeActive ? versions.length - 1 : s.overviewMermaidActiveIndex;
			return {
				overviewMermaidVersions: versions,
				overviewMermaidActiveIndex: nextIndex,
				hasAnalyzed: true,
			};
		});
	},
	setTitle: (title: string | null) => {
		set({ title, hasAnalyzed: true });
	},
	setUsage: (usage: LLMUsage) => {
		set({ usage, hasAnalyzed: true });
	},
	accumulateUsage: (usage: LLMUsage) => {
		set((s) => ({ usage: mergeTokenUsage(s.usage, usage), hasAnalyzed: true }));
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
	setSuggestedFollowUpQuestions: (questions: string[]) => {
		set({ suggestedFollowUpQuestions: questions ?? [] });
	},
	setFollowUpStreaming: (payload: { question: string; content: string } | null) => {
		set({ followUpStreaming: payload });
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
	setTopicAnalyzeStreamingAppend: (chunk: string) => {
		if (!chunk) return;
		set((s) =>
			s.topicAnalyzeStreaming
				? { topicAnalyzeStreaming: { ...s.topicAnalyzeStreaming, chunks: [...s.topicAnalyzeStreaming.chunks, chunk] } }
				: s
		);
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
				lastSavedPath: state.lastSavedPath !== undefined ? state.lastSavedPath : s.autoSaveState.lastSavedPath,
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
			currentStep: null,
			steps: snapshot.steps ?? [],
			isSummaryStreaming: false,
			analysisStartedAtMs: snapshot.analysisStartedAtMs ?? null,
			analysisRunId: runId,
			restoredFromHistory: true,
			restoredFromVaultPath: sourceVaultPath ?? null,
			title: snapshot.title ?? null,
			summaryChunks: [currentSummary],
			summaries,
			summaryVersion,
			graph: snapshot.graph ?? null,
			dashboardBlocks: snapshot.dashboardBlocks ?? [],
			blockChatRecords: snapshot.blockChatRecords ?? {},
			topics: snapshot.topics ?? [],
			sources: snapshot.sources ?? [],
			overviewMermaidActiveIndex: (() => {
				const raw = snapshot.overviewMermaidActiveIndex as number | string | undefined;
				const versions = snapshot.overviewMermaidVersions ?? [];
				if (typeof raw === 'string' && String(raw).trim()) return 0;
				return typeof raw === 'number' ? raw : 0;
			})(),
			overviewMermaidVersions: (() => {
				const raw = snapshot.overviewMermaidActiveIndex as number | string | undefined;
				const versions = snapshot.overviewMermaidVersions ?? [];
				if (versions.length > 0) return versions;
				if (typeof raw === 'string' && String(raw).trim()) return [raw];
				return [];
			})(),
			topicInspectResults: snapshot.topicInspectResults ?? {},
			topicAnalyzeResults: snapshot.topicAnalyzeResults ?? {},
			topicGraphResults: snapshot.topicGraphResults ?? {},
			topicAnalyzeStreaming: null,
			topicGraphLoading: null,
			topicInspectLoading: null,
			usage: snapshot.usage ?? null,
			duration: snapshot.duration ?? null,
			runAnalysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
			analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
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
		currentStep: null,
		steps: [],
		isSummaryStreaming: false,
		analysisStartedAtMs: null,
		analysisRunId: null,
		restoredFromHistory: false,
		restoredFromVaultPath: null,
		title: null,
		summaryChunks: [],
		summaries: [],
		summaryVersion: 1,
		graph: null,
		dashboardBlocks: [],
		blockChatRecords: {},
		topics: [],
		sources: [],
		overviewMermaidActiveIndex: 0,
		overviewMermaidVersions: [],
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
		suggestedFollowUpQuestions: [],
		followUpStreaming: null,
		runAnalysisMode: null,
		autoSaveState: { lastRunId: null, lastSavedSummaryHash: null, lastSavedPath: null },
	}),

	// Computed getters
	getCurrentStepText: () => get().currentStep?.description ?? '',
	getStepText: (step: UIStepRecord) => step?.description ?? '',

	getHasGraphData: () => {
		const graph = get().graph;
		return graph !== null && graph !== undefined && graph.nodes.length > 0;
	},
	getHasCompletedContent: () => get().analysisCompleted &&
		(get().getHasSummarySection() || get().getHasTopicsSection() || get().getHasDashboardBlocksSection() || get().getHasSourcesSection()),
	getHasSummarySection: () => {
		const s = get();
		return s.analysisCompleted && ((s.summaries?.length ?? 0) > 0 || (s.summaryChunks ?? []).join('').trim().length > 0);
	},
	getSummary: () => {
		const s = get();
		const chunks = s.summaryChunks ?? [];
		if (s.isSummaryStreaming || (s.isAnalyzing && chunks.length > 0)) {
			return chunks.join('');
		}
		const list = s.summaries;
		const idx = (s.summaryVersion ?? 1) - 1;
		return list[idx] ?? list[0] ?? '';
	},
	getHasTopicsSection: () => get().analysisCompleted && get().topics.length > 0,
	getHasDashboardBlocksSection: () => get().analysisCompleted && (get().dashboardBlocks ?? []).length > 0,
	getHasSourcesSection: () => get().sources.length > 0,
	getActiveOverviewMermaid: () => {
		const s = get();
		const versions = s.overviewMermaidVersions ?? [];
		const idx = s.overviewMermaidActiveIndex ?? 0;
		return versions[idx] ?? '';
	},
}));

// Get clean query without @web@ for actual search
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};
