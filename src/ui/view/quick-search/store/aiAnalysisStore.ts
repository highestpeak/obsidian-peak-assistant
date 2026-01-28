import { create } from 'zustand';
import { AISearchGraph, AISearchSource, AISearchTopic, InsightCard, Suggestion } from '@/service/agents/AISearchAgent';
import { LLMUsage } from '@/core/providers/types';
import { useUIEventStore } from '@/ui/store/uiEventStore';

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

interface AIAnalysisStore {
	// before analysis
	triggerAnalysis: number;
	webEnabled: boolean;

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
	summaryChunks: string[];
	graph: AISearchGraph | null;
	insightCards: InsightCard[];
	suggestions: Suggestion[];
	topics: AISearchTopic[];
	sources: AISearchSource[];
	usage: LLMUsage | null;
	duration: number | null;

	// before analysis actions
	incrementTriggerAnalysis: () => void;
	toggleWeb: (currentQuery: string) => string;
	updateWebFromQuery: (query: string) => void;

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

	// Computed getters
	setGraph: (graph: AISearchGraph) => void;
	setInsightCards: (insightCards: InsightCard[]) => void;
	setSuggestions: (suggestions: Suggestion[]) => void;
	setTopics: (topics: AISearchTopic[]) => void;
	setSources: (sources: AISearchSource[]) => void;
	setUsage: (usage: LLMUsage) => void;
	setDuration: (duration: number) => void;

	// Reset analysis state
	resetAnalysisState: () => void;

	// Computed getters
	getCurrentStepText: () => string;
	getStepText: (step: AIAnalysisStep) => string;
}

export const useAIAnalysisStore = create<AIAnalysisStore>((set, get) => ({
	// before analysis
	triggerAnalysis: 0,
	webEnabled: false,

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
	graph: null,
	insightCards: [],
	suggestions: [],
	topics: [],
	sources: [],
	usage: null,
	duration: null,

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

	// streaming actions
	startAnalyzing: () => set({ isAnalyzing: true, analyzingBeforeFirstToken: true, analysisStartedAtMs: Date.now() }),
	startStreaming: () => set({ hasStartedStreaming: true, analyzingBeforeFirstToken: false }),
	markCompleted: () => {
		set({
			isAnalyzing: false,
			hasStartedStreaming: false,
			analysisCompleted: true,
			isSummaryStreaming: false
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
		set({
			summaryChunks: [summary], // Set as single chunk for backward compatibility
			hasAnalyzed: true,
		});
	},

	setGraph: (graph: AISearchGraph) => {
		set({ graph, hasAnalyzed: true });
	},
	setInsightCards: (insightCards: InsightCard[]) => {
		set({ insightCards, hasAnalyzed: true });
	},
	setSuggestions: (suggestions: Suggestion[]) => {
		set({ suggestions, hasAnalyzed: true });
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
		summaryChunks: [],
		graph: null,
		insightCards: [],
		suggestions: [],
		topics: [],
		sources: [],
		usage: null,
		duration: null,
	}),

	// Computed getters
	getCurrentStepText: () => get().currentStep.textChunks.join(''),
	getStepText: (step: AIAnalysisStep) => step.textChunks.join(''),
}));

// Get clean query without @web@ for actual search
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};