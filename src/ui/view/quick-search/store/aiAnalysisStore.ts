import { create } from 'zustand';
import type { AISearchGraph, AISearchSource, AISearchTopic, AnalysisMode, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
export type { AnalysisMode };
import { useSearchSessionStore } from './searchSessionStore';
import { useAIGraphStore } from './aiGraphStore';
import { useGraphAgentStore } from './graphAgentStore';

import type { LLMUsage } from '@/core/providers/types';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { SnapshotChatMessage } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';

/** Per-topic completed Q&A from Analyze. */
export type SectionAnalyzeResult = { question: string; answer: string };
/** Currently streaming Analyze (single in-flight). Text is accumulated; UI reads directly. */
export type SectionAnalyzeStreaming = { topic: string; question: string; text: string };

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
	/** Mode used for this run: vaultFull | aiGraph. Omit = vaultFull. */
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

	// V2 fields
	v2ProcessLog?: string[];
	v2PlanOutline?: string | null;
	v2ReportSections?: Array<{ title: string; content: string }>;
	v2FollowUpQuestions?: string[];
	v2GraphJson?: string | null;
};

/** Current summary text from snapshot (selected by summaryVersion). */
export function getSnapshotSummary(snapshot: CompletedAnalysisSnapshot): string {
	const list = snapshot.summaries ?? [];
	const idx = (snapshot.summaryVersion ?? 1) - 1;
	return list[idx] ?? list[0] ?? '';
}

// ---------------------------------------------------------------------------
// Remaining stores: Topics & Interactions (no V2 equivalent yet)
// ---------------------------------------------------------------------------

/** Topic streaming buffer -- RAF-throttled to avoid O(n^2) chunk array copies. */
const _topicBuf = { text: '', raf: null as number | null };
function _resetTopicBuf() {
	if (_topicBuf.raf !== null) { cancelAnimationFrame(_topicBuf.raf); _topicBuf.raf = null; }
	_topicBuf.text = '';
}

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
	setTopicAnalyzeStreaming: (p) => {
		_resetTopicBuf();
		if (p) _topicBuf.text = p.text;
		set({ topicAnalyzeStreaming: p });
	},
	setTopicAnalyzeStreamingAppend: (chunk) => {
		if (!chunk) return;
		_topicBuf.text += chunk;
		if (_topicBuf.raf === null) {
			_topicBuf.raf = requestAnimationFrame(() => {
				_topicBuf.raf = null;
				set((s) =>
					s.topicAnalyzeStreaming
						? { topicAnalyzeStreaming: { ...s.topicAnalyzeStreaming, text: _topicBuf.text } }
						: s
				);
			});
		}
	},
	setTopicGraphResult: (topic, graph) => set((s) => ({
		topicGraphResults: { ...s.topicGraphResults, [topic]: graph },
		topicGraphLoading: null,
	})),
	setTopicGraphLoading: (t) => set({ topicGraphLoading: t }),
	setTopicInspectLoading: (t) => set({ topicInspectLoading: t }),
	resetTopics: () => { _resetTopicBuf(); set({
		topicInspectResults: {},
		topicAnalyzeResults: {},
		topicAnalyzeStreaming: null,
		topicGraphResults: {},
		topicModalOpen: null,
		topicGraphLoading: null,
		topicInspectLoading: null,
	}); },
}));

/** Follow-ups, context chat, block chat records. */
export const useAIAnalysisInteractionsStore = create<{
	fullAnalysisFollowUp: Array<{ title: string; content: string }>;
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
	setFollowUpStreaming: (p: { question: string; content: string } | null) => void;
	setBlockChatRecords: (blockId: string, messages: SnapshotChatMessage[]) => void;
	pruneBlockChatRecords: (blockIds: Set<string>) => void;
	resetInteractions: () => void;
}>((set) => ({
	fullAnalysisFollowUp: [],
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
		followUpStreaming: null,
		contextChatModal: null,
		graphFollowupHistory: [],
		blocksFollowupHistoryByBlockId: {},
		sourcesFollowupHistory: [],
		blockChatRecords: {},
	}),
}));

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Reset remaining legacy stores (Topics + Interactions). */
export function resetAIAnalysisAll(): void {
	useAIAnalysisTopicsStore.getState().resetTopics();
	useAIAnalysisInteractionsStore.getState().resetInteractions();
}

/** Load snapshot into remaining stores + searchSessionStore. */
export function loadCompletedAnalysisSnapshot(snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string): void {
	// Populate kept legacy stores (Topics + Interactions)
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
		blocksFollowupHistoryByBlockId: snapshot.blocksFollowupsByBlockId ?? {},
		sourcesFollowupHistory: snapshot.sourcesFollowups ?? [],
		blockChatRecords: snapshot.blockChatRecords ?? {},
		contextChatModal: null,
	});

	// Populate unified searchSessionStore
	bridgeSnapshotToSearchSessionStore(snapshot, sourceVaultPath);
}

// ---------------------------------------------------------------------------
// Snapshot bridge
// ---------------------------------------------------------------------------

/** Reconstruct V2ToolStep[] + V2TimelineItem[] from saved process log strings. */
function reconstructProcessTimeline(
	processLog: string[],
	startedAt: number,
): { steps: import('../types/search-steps').V2ToolStep[]; timeline: import('../types/search-steps').V2TimelineItem[] } {
	const steps: import('../types/search-steps').V2ToolStep[] = [];
	const timeline: import('../types/search-steps').V2TimelineItem[] = [];

	let stepIdx = 0;
	for (let i = 0; i < processLog.length; i++) {
		const line = processLog[i];

		// Thinking text: lines prefixed with 💭
		if (line.startsWith('\u{1F4AD} ') || line.startsWith('💭 ')) {
			const text = line.slice(line.indexOf(' ') + 1);
			timeline.push({ kind: 'text', id: `restored-text-${i}`, text, complete: true });
			continue;
		}

		const parts = line.split(' — ').map(p => p.trim());
		const firstSpace = parts[0].indexOf(' ');
		const icon = firstSpace > 0 ? parts[0].slice(0, firstSpace) : '🔧';
		const displayName = firstSpace > 0 ? parts[0].slice(firstSpace + 1) : parts[0];

		let summary = '';
		let durationSec = 0;
		if (parts.length >= 3) {
			const durMatch = parts[parts.length - 1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
				summary = parts.slice(1, -1).join(' — ');
			} else {
				summary = parts.slice(1).join(' — ');
			}
		} else if (parts.length === 2) {
			const durMatch = parts[1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
			} else {
				summary = parts[1];
			}
		}

		const stepStartedAt = startedAt + stepIdx * 100;
		const step: import('../types/search-steps').V2ToolStep = {
			id: `restored-step-${stepIdx}`,
			toolName: 'restored',
			displayName,
			icon,
			input: {},
			status: 'done',
			startedAt: stepStartedAt,
			endedAt: stepStartedAt + durationSec * 1000,
			summary: summary || undefined,
		};
		steps.push(step);
		timeline.push({ kind: 'tool', step });
		stepIdx++;
	}

	return { steps, timeline };
}

function bridgeSnapshotToSearchSessionStore(snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string): void {
	const now = Date.now();
	const startedAt = snapshot.analysisStartedAtMs ?? now;
	const isV2 = !!(
		(snapshot.v2ReportSections && snapshot.v2ReportSections.length > 0) ||
		(snapshot.v2ProcessLog && snapshot.v2ProcessLog.length > 0) ||
		snapshot.v2PlanOutline ||
		snapshot.v2GraphJson
	);

	if (isV2) {
		// Restore V2 state — reconstruct V2Section[] from persisted report sections
		const v2PlanSections: import('./searchSessionStore').V2Section[] = (snapshot.v2ReportSections ?? []).map((sec, i) => ({
			id: `restored-sec-${i}`,
			title: sec.title,
			contentType: '',
			visualType: '',
			evidencePaths: [],
			brief: '',
			weight: 1,
			missionRole: '',
			status: 'done' as const,
			content: sec.content,
			streamingText: '',
			generations: [{ content: sec.content, timestamp: startedAt }],
		}));

		// Convert AISearchSource[] back to V2Source[] if sources were saved
		const v2Sources: import('../types/search-steps').V2Source[] = (snapshot.sources ?? []).map(s => ({
			path: s.path,
			title: s.title,
			readAt: startedAt,
			reasoning: s.reasoning ?? undefined,
		}));

		// Reconstruct process timeline from saved log
		const { steps: restoredSteps, timeline: restoredTimeline } =
			(snapshot.v2ProcessLog?.length)
				? reconstructProcessTimeline(snapshot.v2ProcessLog, startedAt)
				: { steps: [], timeline: [] };

		// Restore graph data if present
		if (snapshot.v2GraphJson) {
			try {
				const graphPayload = JSON.parse(snapshot.v2GraphJson);
				if (graphPayload.lenses) {
					const lensKeys = Object.keys(graphPayload.lenses);
					if (lensKeys.length > 0) {
						const graphData = graphPayload.lenses[lensKeys[0]];

						// Restore to graphAgentStore (used by SourcesGraph → useGraphAgent)
						const sourcePaths = (snapshot.sources ?? []).map(s => s.path).sort().join('|');
						useGraphAgentStore.getState().setCacheKey(sourcePaths);
						useGraphAgentStore.getState().setGraphData(graphData);

						// Also restore to aiGraphStore (used by standalone graph view)
						useAIGraphStore.setState({
							graphData,
							activeLens: lensKeys[0] as any,
						});
					}
				}
			} catch { /* ignore malformed graph JSON */ }
		}

		useSearchSessionStore.setState({
			id: snapshot.analysisStartedAtMs ? `restored:${snapshot.analysisStartedAtMs}` : `restored:${now}`,
			query: snapshot.query ?? '',
			status: 'completed',
			startedAt,
			duration: snapshot.duration ?? null,
			usage: snapshot.usage ?? null,
			title: snapshot.title ?? null,
			hasAnalyzed: true,
			restoredFromHistory: true,
			restoredFromVaultPath: sourceVaultPath ?? null,
			analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
			// V2 state
			v2Active: true,
			v2View: 'report',
			v2PlanSections,
			v2PlanApproved: true,
			v2ReportComplete: true,
			v2ProposedOutline: snapshot.v2PlanOutline ?? null,
			v2Sources,
			v2FollowUpQuestions: snapshot.v2FollowUpQuestions ?? [],
			v2Summary: getSnapshotSummary(snapshot),
			v2SummaryStreaming: false,
			v2Steps: restoredSteps,
			v2Timeline: restoredTimeline,
		});
		return;
	}

	// Non-V2 snapshots: restore minimal session state for display
	useSearchSessionStore.setState({
		id: snapshot.analysisStartedAtMs ? `restored:${snapshot.analysisStartedAtMs}` : `restored:${now}`,
		query: snapshot.query ?? '',
		status: 'completed',
		startedAt,
		duration: snapshot.duration ?? null,
		usage: snapshot.usage ?? null,
		title: snapshot.title ?? null,
		hasAnalyzed: true,
		restoredFromHistory: true,
		restoredFromVaultPath: sourceVaultPath ?? null,
		analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
	});
}

/** Get clean query without @web@ for actual search. */
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};
