import { create } from 'zustand';
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
 * Merged store: interactions (follow-ups, context chat, block chat records)
 * + topics (inspect/analyze/graph and streaming state).
 */
export const useSearchInteractionsStore = create<{
	// --- Interactions fields ---
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

	// --- Topics fields ---
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

	// --- Combined reset ---
	resetAllInteractions: () => void;
}>((set) => ({
	// --- Interactions initial state ---
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

	// --- Topics initial state ---
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

	// --- Combined reset ---
	resetAllInteractions: () => set({
		// Interactions
		fullAnalysisFollowUp: [],
		suggestedFollowUpQuestions: [],
		followUpStreaming: null,
		contextChatModal: null,
		graphFollowupHistory: [],
		blocksFollowupHistoryByBlockId: {},
		sourcesFollowupHistory: [],
		blockChatRecords: {},
		// Topics
		topicInspectResults: {},
		topicAnalyzeResults: {},
		topicAnalyzeStreaming: null,
		topicGraphResults: {},
		topicModalOpen: null,
		topicGraphLoading: null,
		topicInspectLoading: null,
	}),
}));
