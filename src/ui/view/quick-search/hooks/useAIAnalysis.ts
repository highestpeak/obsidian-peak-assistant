import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getCleanQuery, type UIStepRecord } from '../store/aiAnalysisStore';
import { useSharedStore, useAIAnalysisStore } from '@/ui/view/quick-search/store';
import { setLastAnalysisHistorySearch, invalidateFollowupContextCache } from '../followupContextRuntime';
import { AppContext } from '@/app/context/AppContext';
import { SearchAgentResult } from '@/service/agents/AISearchAgent';
import { RESULT_UPDATE_TOOL_NAMES } from '@/service/agents/AISearchAgent';
import { LLMStreamEvent } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { Notice } from 'obsidian';
import { normalizeMermaidForDisplay } from '@/core/utils/mermaid-utils';

export function useAIAnalysis() {
	const { searchQuery } = useSharedStore();

	const {
		webEnabled,
		analysisMode,
		setUsage,
		setDuration,
		setSummary,
		appendSummaryDelta,
		setGraph,
		setDashboardBlocks,
		setTopics,
		setSources,
		pushOverviewMermaidVersion,
		setTitle,
		startAnalyzing,
		startStreaming,
		markCompleted,
		recordError,
		startSummaryStreaming,
		resetAnalysisState,
		updateWebFromQuery,
		appendCompletedUiStep,
		setCurrentUiStep,
		appendCurrentUiStepDelta,
	} = useAIAnalysisStore();

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

	// Current UI step (from ui-step) for persisting to store when next step or complete
	const currentUiStepRef = useRef<UIStepRecord | null>(null);

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

	// AbortController for canceling analysis
	const abortControllerRef = useRef<AbortController | null>(null);
	const didCancelRef = useRef<boolean>(false);
	const noticeSentRef = useRef<boolean>(false);

	// Real agent when not mock; MockAISearchAgent in desktop dev so one code path
	const aiSearchAgent = useMemo(() => {
		const plugin = AppContext.getInstance().plugin
		return AppContext.searchAgent({
			enableWebSearch: webEnabled,
			enableLocalSearch: true,
			analysisMode,
			maxMultiAgentIterations: plugin.settings.search.maxMultiAgentIterations,
			thoughtAgentModel: plugin.settings.search.aiAnalysisModel?.thoughtAgentModel?.modelId!,
			thoughtAgentProvider: plugin.settings.search.aiAnalysisModel?.thoughtAgentModel?.provider!,
			searchAgentModel: plugin.settings.search.aiAnalysisModel?.searchAgentModel?.modelId!,
			searchAgentProvider: plugin.settings.search.aiAnalysisModel?.searchAgentModel?.provider!,
		});
	}, [webEnabled]);

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
		if (result.dashboardBlocks) {
			setDashboardBlocks(result.dashboardBlocks);
		}
		if (result.topics) {
			setTopics(result.topics);
		}
		if (result.sources) {
			setSources(result.sources);
		}
		if (result.overviewMermaid !== undefined && result.overviewMermaid != null) {
			const code = normalizeMermaidForDisplay(result.overviewMermaid);
			pushOverviewMermaidVersion(code, { makeActive: true, dedupe: true });
		}
		if (result.title !== undefined) {
			setTitle(result.title ?? null);
		}
	}, [setSummary, setGraph, setDashboardBlocks, setTopics, setSources, pushOverviewMermaidVersion, setTitle]);

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

		// Notice (success): only when modal is closed and not canceled.
		// Use store state directly to avoid stale closures.
		if (!didCancelRef.current && !noticeSentRef.current && !useAIAnalysisStore.getState().aiModalOpen) {
			noticeSentRef.current = true;
			new Notice(
				'AI Analysis completed. Reopen Quick Search → AI Analysis tab to view results.',
				8000,
			);
		}
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
			invalidateFollowupContextCache();
			startAnalyzing();
			didCancelRef.current = false;
			noticeSentRef.current = false;
			toolTraceRef.current = [];
			analysisStartTimeRef.current = Date.now();
			summaryDeltaBufferRef.current = '';
			if (summaryFlushTimerRef.current) {
				window.clearTimeout(summaryFlushTimerRef.current);
				summaryFlushTimerRef.current = null;
			}

			const stream = await aiSearchAgent!.stream(searchQuery);

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

				// debug log for all chunks.
				const checkIfDeltaEvent = (type: string) =>
					type === 'text-delta' || type === 'reasoning-delta' || type === 'prompt-stream-delta'
					|| type === 'search-thought-talking' || type === 'search-thought-reasoning'
					|| type === 'search-inspector-talking' || type === 'search-inspector-reasoning'
					|| type === 'ui-step-delta';
				if (!checkIfDeltaEvent(event.type)) {
					console.debug('[useAIAnalysis] event:', JSON.stringify(event));
				} else {
					// delta event are too much to log. useless. only log the type to observe the flow.
					console.debug('[useAIAnalysis] delta event:', event.triggerName);
				}

				switch (event.type) {
					case 'text-delta':
					case 'reasoning-delta':
						// Steps are now driven by ui-step / ui-step-delta events from the agent.
						break;
					case 'tool-call':
						// Record to tool trace for debugging only; graph animation is driven by ui-signal.
						toolTraceRef.current.push({
							ts: Date.now(),
							triggerName: event.triggerName || 'unknown',
							type: 'tool-call',
							toolName: event.toolName,
							toolCallId: event.id,
							input: event.input
						});
						break;
					case 'tool-result': {
						// Extract summary from tool results
						const output = event.output?.result || event.output;

						// Record to tool trace for debugging only; graph animation is driven by ui-signal.
						toolTraceRef.current.push({
							ts: Date.now(),
							triggerName: event.triggerName || 'unknown',
							type: 'tool-result',
							toolName: event.toolName,
							toolCallId: event.id,
							output: event.toolName !== 'content_reader' ? output : undefined,
						});

						// useUIEventStore.getState().publish(
						// 	event.triggerName + '--tool-result--' + event.toolName,
						// 	{ output: output }
						// );

						if (RESULT_UPDATE_TOOL_NAMES.has(event.toolName)) {
							const currentResult = event.extra?.currentResult as SearchAgentResult | undefined;
							if (currentResult) {
								applySearchResult(currentResult);
							}
						}
						break;
					}
					case 'prompt-stream-start': {
						const pid = event.promptId as string;
						if (pid === PromptId.AiAnalysisSummary) {
							startSummaryStreaming();
						}
						break;
					}
					case 'prompt-stream-delta':
						if (event.promptId === PromptId.AiAnalysisSummary) {
							const delta = event.delta || '';
							bufferSummaryDelta(delta);
							// publish event for UI rendering
							useUIEventStore.getState().publish('summary-delta', { text: delta });
						}
						break;
					case 'prompt-stream-result':
						if (event.promptId === PromptId.AiAnalysisSummary) {
							flushSummaryBuffer();
							// Update store with complete summary
							setSummary(event.output as string);
						}
						break;
					case 'ui-step': {
						useUIEventStore.getState().publish(event.type, event);
						const stepId = event.stepId as string | undefined;
						const title = typeof event.title === 'string' ? event.title : '';
						const description = typeof event.description === 'string' ? event.description : '';
						if (stepId) {
							const prev = currentUiStepRef.current;
							if (prev && prev.stepId !== stepId) {
								appendCompletedUiStep({ ...prev, endedAtMs: Date.now() });
							}
							if (prev && prev.stepId === stepId) {
								appendCurrentUiStepDelta(description, title);
								currentUiStepRef.current = {
									...prev,
									title: prev.title + title,
									description: prev.description + description,
								};
							} else {
								currentUiStepRef.current = { stepId, title: title || 'Step', description, startedAtMs: Date.now() };
								setCurrentUiStep(stepId, title || 'Step', description);
							}
						}
						break;
					}
					case 'ui-step-delta': {
						useUIEventStore.getState().publish(event.type, event);
						const descDelta = typeof event.descriptionDelta === 'string' ? event.descriptionDelta : '';
						const titleDelta = typeof event.titleDelta === 'string' ? event.titleDelta : '';
						if (descDelta || titleDelta) {
							appendCurrentUiStepDelta(descDelta, titleDelta);
							const cur = currentUiStepRef.current;
							if (cur) {
								currentUiStepRef.current = {
									...cur,
									title: cur.title + titleDelta,
									description: cur.description + descDelta,
								};
							}
						}
						break;
					}
					case 'ui-signal':
						useUIEventStore.getState().publish(event.type, event);
						break;
					case 'complete': {
						const lastStep = currentUiStepRef.current;
						if (lastStep) {
							appendCompletedUiStep({ ...lastStep, endedAtMs: Date.now() });
							currentUiStepRef.current = null;
						}
						handleFinalResult(event);
						break;
					}
					case 'error':
						recordError(event.error.message);
						// Notice (error): only when modal is closed and not canceled.
						if (!didCancelRef.current && !noticeSentRef.current && !useAIAnalysisStore.getState().aiModalOpen) {
							noticeSentRef.current = true;
							new Notice(
								'AI Analysis failed. Reopen Quick Search → AI Analysis tab for details.',
								8000,
							);
						}
						break;
					case 'on-step-finish':
					case 'pk-debug':
						// Steps are now driven by ui-step events; debug events ignored for step display.
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
			// Notice (error): only when modal is closed and not canceled.
			if (!didCancelRef.current && !noticeSentRef.current && !useAIAnalysisStore.getState().aiModalOpen) {
				noticeSentRef.current = true;
				new Notice(
					'AI Analysis failed. Reopen Quick Search → AI Analysis tab for details.',
					8000,
				);
			}
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
					dashboardBlocksCount: aiAnalysisStoreState.dashboardBlocks?.length ?? 0,
					graphNodesCount: aiAnalysisStoreState.graph?.nodes?.length ?? 0,
					graphEdgesCount: aiAnalysisStoreState.graph?.edges?.length ?? 0
				},
				steps: aiAnalysisStoreState.steps.map(step => ({
					stepId: step.stepId,
					title: step.title,
					description: step.description,
					startedAtMs: step.startedAtMs,
					endedAtMs: step.endedAtMs,
				})),
				currentStep: aiAnalysisStoreState.currentStep
					? {
						stepId: aiAnalysisStoreState.currentStep.stepId,
						title: aiAnalysisStoreState.currentStep.title,
						description: aiAnalysisStoreState.currentStep.description,
					}
					: null,
				toolTrace: toolTraceRef.current,
				summary: aiAnalysisStoreState.summaryChunks.join(''),
				summaryLen: aiAnalysisStoreState.summaryChunks.join('').length
			};
			// Log merged debug dump
			console.debug('[useAIAnalysis] debugDumpJson', JSON.stringify(debugDump));

			// Persist history search for follow-up agent (memory only, not store)
			try {
				const runId = aiAnalysisStoreState.analysisRunId ?? null;
				if (aiSearchAgent) {
					setLastAnalysisHistorySearch(
                        (q, opts) => aiSearchAgent.searchHistory(q, opts),
                        runId
                    );
				} else {
					setLastAnalysisHistorySearch(null);
				}
			} catch {
				setLastAnalysisHistorySearch(null);
			}

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
		searchQuery,
		webEnabled,
		aiSearchAgent,
		applySearchResult,
		recordError,
		resetAnalysisState,
		startAnalyzing,
		startStreaming,
		markCompleted,
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
			didCancelRef.current = true;
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
	}, []);

	return { performAnalysis, cancel };
}
