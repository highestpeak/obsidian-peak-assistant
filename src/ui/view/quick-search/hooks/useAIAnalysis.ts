import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getCleanQuery, AIAnalysisStepType } from '../store/aiAnalysisStore';
import { useSharedStore, useAIAnalysisStore } from '@/ui/view/quick-search/store';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AISearchAgent, SearchAgentResult } from '@/service/agents/AISearchAgent';
import { LLMStreamEvent, StreamTriggerName, ToolEvent } from '@/core/providers/types';
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
		appendSummaryDelta,
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

	// Full tool trace for debugging (not stored in state to avoid OOM)
	// NOTE:
	// - Only `content_reader` should avoid full output (too large).
	// - Other tools should keep full output for debugging (user requirement).
	const toolTraceRef = useRef<Array<{
		ts: number;
		triggerName: string;
		type: 'tool-call' | 'tool-result' | 'tool-error';
		toolName: string;
		toolCallId?: string;
		input?: any;
		output?: any; // Full output (except content_reader)
		outputSummary?: any; // Summary for UI display / quick scan
		error?: string;
	}>>([]);

	// Analysis start time for duration tracking
	const analysisStartTimeRef = useRef<number>(0);

	// Summary delta buffer to reduce store update frequency.
	const summaryDeltaBufferRef = useRef<string>('');
	const summaryFlushTimerRef = useRef<number | null>(null);

	const flushSummaryBuffer = useCallback(() => {
		if (summaryFlushTimerRef.current) {
			window.clearTimeout(summaryFlushTimerRef.current);
			summaryFlushTimerRef.current = null;
		}
		const buf = summaryDeltaBufferRef.current;
		if (!buf) return;
		appendSummaryDelta(buf);
		summaryDeltaBufferRef.current = '';
	}, [appendSummaryDelta]);

	const bufferSummaryDelta = useCallback((delta: string) => {
		if (!delta) return;
		summaryDeltaBufferRef.current += delta;
		if (summaryFlushTimerRef.current) return;
		summaryFlushTimerRef.current = window.setTimeout(() => {
			summaryFlushTimerRef.current = null;
			const buf = summaryDeltaBufferRef.current;
			if (!buf) return;
			appendSummaryDelta(buf);
			summaryDeltaBufferRef.current = '';
		}, 120);
	}, [appendSummaryDelta]);

	const updateIfStepChanged = useCallback((newStepType: AIAnalysisStepType, delta?: string, extra?: any) => {
		if (currentStepTypeRef.current !== newStepType) {
			// Step type changed - complete the previous step first
			if (currentStepTypeRef.current !== 'idle') {
				completeCurrentStep([...currentStepTextChunksRef.current]);
				currentStepTextChunksRef.current = [];
			}
			currentStepTypeRef.current = newStepType;
			setCurrentStep(newStepType, extra);
		}
		if (delta) {
			// Accumulate text chunks for current step
			currentStepTextChunksRef.current.push(delta || '');
		}
		// Publish event for real-time UI rendering
		useUIEventStore.getState().publish(newStepType, { text: delta, extra: extra });
	}, [currentStepTypeRef, currentStepTextChunksRef, setCurrentStep, completeCurrentStep]);

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
			currentStepTextChunksRef.current = [];
			toolTraceRef.current = [];
			analysisStartTimeRef.current = Date.now();
			summaryDeltaBufferRef.current = '';
			if (summaryFlushTimerRef.current) {
				window.clearTimeout(summaryFlushTimerRef.current);
				summaryFlushTimerRef.current = null;
			}

			// Start streaming with AISearchAgent
			const stream = await aiSearchAgent.stream(searchQuery);

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

				// Step completion is now handled by updateIfStepChanged when step type changes

				// // debug log for all chunks.
				// const checkIfDeltaEvent = (type: string) =>
				// 	type === 'text-delta' || type === 'reasoning-delta' || type === 'prompt-stream-delta'
				// 	|| type === 'search-thought-talking' || type === 'search-thought-reasoning'
				// 	|| type === 'search-inspector-talking' || type === 'search-inspector-reasoning';
				// if (!checkIfDeltaEvent(event.type)) {
				// 	console.debug('[useAIAnalysis] event:', JSON.stringify(event));
				// } else {
				// 	// delta event are too much to log. useless. only log the type to observe the flow.
				// 	console.debug('[useAIAnalysis] event:', event.type, event.triggerName);
				// }

				switch (event.type) {
					case 'text-delta':
						/**
						 * avoid update store directly. every time store update will copy the entire state. 
						 * and the delta is very fast to generate. which may cause performance issue and memory leak.
						 */
						updateIfStepChanged(
							event.triggerName + '-talking' as AIAnalysisStepType,
							event.text
						);
						break;
					case 'reasoning-delta':
						updateIfStepChanged(
							event.triggerName + '-reasoning' as AIAnalysisStepType,
							event.text
						);
						break;
					case 'tool-call':
						// Record to tool trace for debugging
						toolTraceRef.current.push({
							ts: Date.now(),
							triggerName: event.triggerName || 'unknown',
							type: 'tool-call',
							toolName: event.toolName,
							toolCallId: event.id,
							input: event.input
						});

						// Publish a normalized tool-call event for graph animation / UI orchestration.
						// Keep it separate from step streaming to avoid mixing non-text payloads into the text renderer.
						useUIEventStore.getState().publish('ui:tool-call', {
							triggerName: event.triggerName || 'unknown',
							toolName: event.toolName,
							toolCallId: event.id,
							input: event.input,
						});

						updateIfStepChanged(
							event.triggerName + '--tool-call--' + event.toolName as AIAnalysisStepType,
							undefined,
							{ ...event.input, }
						);
						break;
					case 'tool-result': {
						// Extract summary from tool results
						const output = event.output?.result || event.output;

						// Record to tool trace (full output for non-content_reader tools)
						toolTraceRef.current.push({
							ts: Date.now(),
							triggerName: event.triggerName || 'unknown',
							type: 'tool-result',
							toolName: event.toolName,
							toolCallId: event.id,
							output: event.toolName !== 'content_reader' ? output : undefined,
						});

						if (event.triggerName === StreamTriggerName.SEARCH_THOUGHT_AGENT) {
							// only process update_result tool call.
							if (event.toolName === 'update_result') {
								// full update
								const currentResult = event.extra?.currentResult as SearchAgentResult;
								if (currentResult) {
									applySearchResult(currentResult);
								}
							}
						} else {
							// Publish a normalized tool-result event for graph animation / UI orchestration.
							useUIEventStore.getState().publish('ui:tool-result', {
								triggerName: event.triggerName || 'unknown',
								toolName: event.toolName,
								toolCallId: event.id,
								output,
							});

							useUIEventStore.getState().publish(
								event.triggerName + '--tool-result--' + event.toolName,
								{ output: output }
							);
						}
						break;
					}
					case 'prompt-stream-start':
						if (event.promptId === PromptId.SearchAiSummary) {
							startSummaryStreaming();
						}
						break;
					case 'prompt-stream-delta':
						if (event.promptId === PromptId.SearchAiSummary) {
							const delta = event.delta || '';
							bufferSummaryDelta(delta);
							// publish event for UI rendering
							useUIEventStore.getState().publish('summary-delta', { text: delta });
						}
						break;
					case 'prompt-stream-result':
						if (event.promptId === PromptId.SearchAiSummary) {
							flushSummaryBuffer();
							// Update store with complete summary
							setSummary(event.output as string);
						}
						break;
					case 'complete':
						// Process final result
						handleFinalResult(event);
						break;
					case 'error':
						recordError(event.error.message);
						break;
					case 'on-step-finish':
						updateIfStepChanged('pk-debug', undefined, {
							triggerName: event.triggerName,
							text: event.text,
							finishReason: event.finishReason,
							usage: event.usage,
						});
						break;
					case 'pk-debug':
						updateIfStepChanged('pk-debug', undefined, {
							debugName: event.debugName,
							triggerName: event.triggerName,
							extra: event.extra,
						});
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
			flushSummaryBuffer();
			// Build merged debug dump for easier debugging
			const aiAnalysisStoreState = useAIAnalysisStore.getState();
			const debugDump = {
				meta: {
					query: searchQuery,
					webEnabled,
					totalDurationMs: Date.now() - analysisStartTimeRef.current,
					usage: aiAnalysisStoreState.usage,
					hasError: !!aiAnalysisStoreState.error,
					error: aiAnalysisStoreState.error,
					sourcesCount: aiAnalysisStoreState.sources.length,
					topicsCount: aiAnalysisStoreState.topics.length,
					insightCardsCount: aiAnalysisStoreState.insightCards.length,
					graphNodesCount: aiAnalysisStoreState.graph?.nodes?.length ?? 0,
					graphEdgesCount: aiAnalysisStoreState.graph?.edges?.length ?? 0
				},
				steps: aiAnalysisStoreState.steps.map(step => ({
					type: step.type,
					text: step.textChunks.join(''),
					extra: step.extra,
					startedAtMs: step.startedAtMs,
					endedAtMs: step.endedAtMs,
					durationMs: step.startedAtMs && step.endedAtMs ? step.endedAtMs - step.startedAtMs : undefined
				})),
				currentStep: {
					type: aiAnalysisStoreState.currentStep.type,
					text: aiAnalysisStoreState.currentStep.textChunks.join(''),
					extra: aiAnalysisStoreState.currentStep.extra
				},
				toolTrace: toolTraceRef.current,
				summary: aiAnalysisStoreState.summaryChunks.join(''),
				summaryLen: aiAnalysisStoreState.summaryChunks.join('').length
			};
			// Log merged debug dump
			console.debug('[useAIAnalysis] debugDumpJson', JSON.stringify(debugDump));

			// Reset refs for next analysis
			toolTraceRef.current = [];
			analysisStartTimeRef.current = 0;
			summaryDeltaBufferRef.current = '';
			if (summaryFlushTimerRef.current) {
				window.clearTimeout(summaryFlushTimerRef.current);
				summaryFlushTimerRef.current = null;
			}

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
		appendSummaryDelta,
		bufferSummaryDelta,
		flushSummaryBuffer,
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
