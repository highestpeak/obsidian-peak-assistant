import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getCleanQuery, AIAnalysisStepType } from '../store/aiAnalysisStore';
import { useSharedStore, useAIAnalysisStore } from '@/ui/view/quick-search/store';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AISearchAgent, SearchAgentResult } from '@/service/agents/AISearchAgent';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import { useUIEventStore } from '@/ui/store/uiEventStore';

export function useAIAnalysis() {
	const { searchQuery } = useSharedStore();
	const { manager, plugin } = useServiceContext();

	const {
		webEnabled,
		completeCurrentStep,
		setUsage,
		setDuration,
		setSummary,
		setGraph,
		setInsightCards,
		setSuggestions,
		setTopics,
		setSources,
		startAnalyzing,
		startStreaming,
		markCompleted,
		recordError,
		setCurrentStep,
		startSummaryStreaming,
		resetAnalysisState,
		updateWebFromQuery
	} = useAIAnalysisStore();

	// Track current step type to avoid unnecessary store updates
	const currentStepTypeRef = useRef<AIAnalysisStepType>('idle');
	// Reset accumulated text chunks and step type for new analysis
	const currentStepTextChunksRef = useRef<string[]>([]);

	const updateIfStepChanged = useCallback((newStepType: AIAnalysisStepType, delta?: string, extra?: any) => {
		if (currentStepTypeRef.current !== newStepType) {
			currentStepTypeRef.current = newStepType;
			setCurrentStep(newStepType, extra);
		}
		if (delta) {
			// Accumulate text chunks for current step
			currentStepTextChunksRef.current.push(delta || '');
			// Publish event for real-time UI rendering
			useUIEventStore.getState().publish(newStepType, { text: delta, extra: extra });
		}
	}, [currentStepTypeRef, currentStepTextChunksRef, setCurrentStep]);

	// AbortController for canceling analysis
	const abortControllerRef = useRef<AbortController | null>(null);

	// Create AISearchAgent instance
	const aiSearchAgent = useMemo(() => {
		if (!manager) return null;

		return new AISearchAgent(manager, {
			enableWebSearch: webEnabled,
			enableLocalSearch: true,
			maxMultiAgentIterations: plugin.settings.search.maxMultiAgentIterations,
			thoughtAgentModel: plugin.settings.search.aiAnalysisModel?.thoughtAgentModel?.modelId!,
			thoughtAgentProvider: plugin.settings.search.aiAnalysisModel?.thoughtAgentModel?.provider!,
			searchAgentModel: plugin.settings.search.aiAnalysisModel?.searchAgentModel?.modelId!,
			searchAgentProvider: plugin.settings.search.aiAnalysisModel?.searchAgentModel?.provider!,
		});
	}, [manager, plugin, webEnabled]);

	// Detect @web@ trigger in search query (don't remove from display, just enable web mode)
	useEffect(() => {
		updateWebFromQuery(searchQuery);
	}, [searchQuery, updateWebFromQuery]);

	/**
	 * Apply search result to state
	 */
	const applySearchResult = useCallback((result: SearchAgentResult) => {
		if (result.summary) {
			setSummary(result.summary);
		}
		if (result.graph) {
			setGraph(result.graph);
		}
		if (result.insightCards) {
			setInsightCards(result.insightCards);
		}
		if (result.suggestions) {
			setSuggestions(result.suggestions);
		}
		if (result.topics) {
			setTopics(result.topics);
		}
		if (result.sources) {
			setSources(result.sources);
		}
	}, [setSummary, setGraph, setInsightCards, setSuggestions, setTopics, setSources]);

	/**
	 * Handle the final result from AISearchAgent
	 */
	const handleFinalResult = useCallback((event: LLMStreamEvent) => {
		if (event.type !== 'complete') return;

		// Set usage and duration
		setUsage(event.usage);
		setDuration(event.durationMs || 0);

		let finalResult = event.result;
		if (!finalResult) return;
		finalResult = finalResult as SearchAgentResult;

		applySearchResult(finalResult);
	}, [setUsage, setDuration, applySearchResult]);

	const performAnalysis = useCallback(async (abortSignal?: AbortSignal) => {
		// Create AbortController if not provided
		let controller: AbortController | null = null;
		if (!abortSignal) {
			controller = new AbortController();
			abortControllerRef.current = controller;
		}
		const signal = abortSignal || controller?.signal;

		try {
			// Validate query: must have content after removing @web@ and references
			const cleanQuery = getCleanQuery(searchQuery);
			if (!cleanQuery) {
				recordError('Please enter a search query.');
				return;
			}
			if (!aiSearchAgent) {
				recordError('AI search agent is not ready yet. Please try again.');
				return;
			}

			resetAnalysisState();
			startAnalyzing();
			currentStepTypeRef.current = 'idle';

			// Start streaming with AISearchAgent
			const stream = await aiSearchAgent.stream(searchQuery);

			let prevEvent: LLMStreamEvent | null = null;
			// Process the stream directly
			for await (const event of stream) {
				// avoid closure trap. use useAIAnalysisStore.getState() to get the latest state. otherwise always get the old state.
				if (!useAIAnalysisStore.getState().hasStartedStreaming) {
					console.debug('[useAIAnalysis] Starting streaming');
					startStreaming();
				}
				// Check if analysis is being cancelled
				if (signal?.aborted) {
					console.debug('[useAIAnalysis] Analysis cancelled by user');
					break;
				}

				// event type changed. complete the current step.
				// currentStepTextChunksRef only change within event switch case statements.
				if (prevEvent && prevEvent.type !== event.type) {
					// Complete current step with accumulated text chunks
					completeCurrentStep([...currentStepTextChunksRef.current]);
					// Reset accumulated text chunks and step type for next step
					currentStepTextChunksRef.current = [];
					currentStepTypeRef.current = 'idle';
				}

				prevEvent = event;

				// debug log for all chunks.
				const checkIfDeltaEvent = (type: string) =>
					type === 'text-delta' || type === 'reasoning-delta' || type === 'prompt-stream-delta'
					|| type === 'search-thought-talking' || type === 'search-thought-reasoning'
					|| type === 'search-inspector-talking' || type === 'search-inspector-reasoning';
				if (!checkIfDeltaEvent(event.type)) {
					console.debug('[useAIAnalysis] event:', JSON.stringify(event));
				} else {
					// delta event are too much to log. useless. only log the type to observe the flow.
					console.debug('[useAIAnalysis] event:', event.type, event.triggerName);
				}

				switch (event.type) {
					case 'text-delta':
						/**
						 * avoid update store directly. every time store update will copy the entire state. 
						 * and the delta is very fast to generate. which may cause performance issue and memory leak.
						 */
						updateIfStepChanged(
							event.triggerName === StreamTriggerName.SEARCH_INSPECTOR_AGENT
								? 'search-inspector-talking'
								: 'search-thought-talking',
							event.text
						);
						break;
					case 'reasoning-delta':
						updateIfStepChanged(
							event.triggerName === StreamTriggerName.SEARCH_INSPECTOR_AGENT
								? 'search-inspector-reasoning'
								: 'search-thought-reasoning',
							event.text
						);
						break;
					case 'tool-call':
						if (event.triggerName === StreamTriggerName.SEARCH_THOUGHT_AGENT) {
							if (event.toolName === 'summary_context_messages') {
								updateIfStepChanged('search-thought-summary-context-messages', undefined);
							}
						}
						if (event.triggerName === StreamTriggerName.SEARCH_INSPECTOR_AGENT) {
							if (event.toolName === 'content_reader') {
								updateIfStepChanged('search-inspector-content-reader', undefined, {
									path: event.input.path,
									mode: event.input.mode,
									lineRange: event.input.lineRange
								});
							} else if (event.toolName === 'web_search') {
								updateIfStepChanged('search-inspector-web-search', undefined, {
									query: event.input.query,
									limit: event.input.limit
								});
							} else if (event.toolName === 'vault_inspector') {
								/**
								 * see {@link vaultGraphInspectorTool} for more details.
								 */
								const { mode } = event.input as { mode: string };
								switch (mode) {
									case 'inspect_note_context':
										updateIfStepChanged('search-inspector-inspect-note-context', undefined, {
											note_path: event.input.note_path
										});
										break;
									case 'graph_traversal':
										updateIfStepChanged('search-inspector-graph-traversal', undefined, {
											hops: event.input.hops,
											note_path: event.input.note_path
										});
										break;
									case 'find_path':
										updateIfStepChanged('search-inspector-find-path', undefined, {
											start_note_path: event.input.start_note_path,
											end_note_path: event.input.end_note_path
										});
										break;
									case 'find_key_nodes':
										updateIfStepChanged('search-inspector-find-key-nodes');
										break;
									case 'find_orphans':
										updateIfStepChanged('search-inspector-find-orphans');
										break;
									case 'search_by_dimensions':
										updateIfStepChanged('search-inspector-search-by-dimensions', undefined, {
											boolean_expression: event.input.boolean_expression
										});
										break;
									case 'explore_folder':
										updateIfStepChanged('search-inspector-explore-folder', undefined, {
											folder_path: event.input.folder_path,
											recursive: event.input.recursive,
											max_depth: event.input.max_depth
										});
										break;
									case 'recent_changes_whole_vault':
										updateIfStepChanged('search-inspector-recent-changes-whole-vault');
										break;
									case 'local_search_whole_vault':
										updateIfStepChanged('search-inspector-local-search-whole-vault', undefined, {
											query: event.input.query,
											searchMode: event.input.searchMode,
											scopeMode: event.input.scopeMode,
											scopeValue: event.input.scopeValue
										});
										break;
									default:
										console.warn('[useAIAnalysis] Unknown tool call:', event.toolName, event.input);
										break;
								}
							}
						}
						break;
					case 'tool-result':
						if (event.triggerName === StreamTriggerName.SEARCH_THOUGHT_AGENT) {
							// only process update_result tool call.
							if (event.toolName === 'update_result') {
								// full update
								const currentResult = event.extra?.currentResult as SearchAgentResult;
								if (currentResult) {
									applySearchResult(currentResult);
								}
							}
						}
						break;
					case 'prompt-stream-start':
						if (event.promptId === PromptId.SearchAiSummary) {
							startSummaryStreaming();
						}
						break;
					case 'prompt-stream-delta':
						if (event.promptId === PromptId.SearchAiSummary) {
							const delta = event.delta || '';
							// publish event for UI rendering
							useUIEventStore.getState().publish('summary-delta', { text: delta });
						}
						break;
					case 'prompt-stream-result':
						if (event.promptId === PromptId.SearchAiSummary) {
							// Update store with complete summary
							setSummary(event.output as string);
						}
						break;
					case 'complete':
						// Process final result
						handleFinalResult(event);
						markCompleted();
						break;
					case 'error':
						recordError(event.error.message);
						break;
					default:
						// we have debug log ahead of the switch statement.
						// console.debug('[useAIAnalysis] Unhandled event:', event.type);
						break;
				}
			}
		} catch (err) {
			const errorMessage = err instanceof Error
				? err.message
				: 'Failed to connect to AI service. Please check your network connection and try again.';
			recordError(errorMessage);
		} finally {
			// comment this after debugging.
			const aiAnalysisStoreState = useAIAnalysisStore.getState();
			console.debug('[useAIAnalysis] complete. log all steps for debugging.', JSON.stringify({
				...Object.fromEntries(
					Object.entries(aiAnalysisStoreState).filter(([key]) => key !== 'steps' && key !== 'currentStep' && key !== 'summaryChunks')
				),
				steps: aiAnalysisStoreState.steps.map(step => ({
					type: step.type,
					text: step.textChunks.join(''),
					extra: step.extra
				})),
				currentStep: {
					type: aiAnalysisStoreState.currentStep.type,
					text: aiAnalysisStoreState.currentStep.textChunks.join(''),
					extra: aiAnalysisStoreState.currentStep.extra
				},
				summary: aiAnalysisStoreState.summaryChunks.join('')
			}));

			markCompleted();
			// Clear abort controller
			if (controller) {
				abortControllerRef.current = null;
			}
		}
	}, [
		currentStepTextChunksRef,
		searchQuery,
		webEnabled,
		aiSearchAgent,
		applySearchResult,
		recordError,
		resetAnalysisState,
		startAnalyzing,
		startStreaming,
		markCompleted,
		setCurrentStep,
		startSummaryStreaming,
		handleFinalResult
	]);

	/**
	 * Cancel the current analysis
	 */
	const cancel = useCallback(() => {
		if (abortControllerRef.current) {
			console.log('[useAIAnalysis] Canceling analysis');
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
	}, []);

	return { performAnalysis, cancel };
}
