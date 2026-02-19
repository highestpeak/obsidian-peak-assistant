import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getCleanQuery, type UIStepRecord } from '../store/aiAnalysisStore';
import { useSharedStore, useAIAnalysisStore } from '@/ui/view/quick-search/store';
import { setLastAnalysisHistorySearch, invalidateFollowupContextCache } from '../followupContextRuntime';
import { AppContext } from '@/app/context/AppContext';
import { SearchAgentResult } from '@/service/agents/AISearchAgent';
import { RESULT_UPDATE_TOOL_NAMES } from '@/service/agents/AISearchAgent';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { checkIfDeltaEvent, getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';
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
		setSuggestedFollowUpQuestions,
		startAnalyzing,
		startStreaming,
		markCompleted,
		recordError,
		startSummaryStreaming,
		resetAnalysisState,
		updateWebFromQuery,
		appendCompletedUiStep,
		setCurrentUiStep,
		updateCurrentUiStep,
		appendCurrentUiStepDelta,
	} = useAIAnalysisStore();

	// Chronological timeline for debug: every step in order with agent, input, output, token delta
	type TimelineEntry = {
		ts: number;
		eventType: string;
		agent?: string;
		what?: string;
		input?: unknown;
		output?: unknown;
		tokens?: { inputTokens: number; outputTokens: number; totalTokens: number };
	};
	const timelineRef = useRef<TimelineEntry[]>([]);
	const pushTimeline = (event: LLMStreamEvent) => {
		try {
			const anyEvent = event as any;
			const isDelta = checkIfDeltaEvent(event.type);
			const deltaText = getDeltaEventDeltaText(event) || (event.type === 'ui-step-delta' ? anyEvent.descriptionDelta : undefined);
			const arr = timelineRef.current;

			if (isDelta && arr.length > 0 && checkIfDeltaEvent(arr[arr.length - 1].eventType as LLMStreamEvent['type'])) {
				const prev = arr[arr.length - 1];
				const base = String(prev.output ?? '').replace(/\s*\[\w[-.\w]*\]\s*$/, '');
				prev.output = base + (deltaText || '') + (event.type ? ` [${event.type}]` : '');
				prev.ts = Date.now();
				return;
			}

			arr.push({
				ts: Date.now(),
				eventType: event.type,
				agent: event.triggerName || 'unknown',
				what: anyEvent.toolName
					? `${anyEvent.toolName}${anyEvent.id ? ` (${anyEvent.id})` : ''}`
					: anyEvent.promptId
						? `${anyEvent.promptId}`
						: anyEvent.debugName
							? anyEvent.debugName
							: 'unknown',
				input: anyEvent.input,
				output: anyEvent.output !== undefined
					? anyEvent.toolName !== 'content_reader' ? anyEvent.output : 'content_reader_skipped'
					: anyEvent.title || anyEvent.description
						? [anyEvent.title, anyEvent.description].filter(Boolean).join('. ')
						: deltaText
							? deltaText + (event.type ? ` [${event.type}]` : '')
							: anyEvent.error?.message ?? String(anyEvent.error) ?? (anyEvent.extra ?? undefined),
				tokens: anyEvent.usage ? {
					inputTokens: anyEvent.usage.inputTokens ?? 0,
					outputTokens: anyEvent.usage.outputTokens ?? 0,
					totalTokens: anyEvent.usage.totalTokens ?? 0,
				} : undefined,
			});
		} catch (error) {
			console.error('[useAIAnalysis] pushTimeline error:', error);
		}
	};

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
		const plugin = AppContext.getInstance().plugin;
		return AppContext.searchAgent({
			enableWebSearch: webEnabled,
			enableLocalSearch: true,
			analysisMode: analysisMode ?? 'vaultFull',
			maxMultiAgentIterations: plugin.settings.search.maxMultiAgentIterations,
		});
	}, [webEnabled, analysisMode]);

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
		if (result.suggestedFollowUpQuestions !== undefined) {
			setSuggestedFollowUpQuestions(result.suggestedFollowUpQuestions ?? []);
		}
	}, [setSummary, setGraph, setDashboardBlocks, setTopics, setSources, pushOverviewMermaidVersion, setTitle, setSuggestedFollowUpQuestions]);

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

	const performAnalysis = useCallback(async (abortSignal?: AbortSignal, scopeValue?: string) => {
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
			timelineRef.current = [];
			analysisStartTimeRef.current = Date.now();
			summaryDeltaBufferRef.current = '';
			if (summaryFlushTimerRef.current) {
				window.clearTimeout(summaryFlushTimerRef.current);
				summaryFlushTimerRef.current = null;
			}

			const stream = await aiSearchAgent!.stream(searchQuery, scopeValue ? { scopeValue } : undefined);

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
				// if (!checkIfDeltaEvent(event.type)) {
				// 	console.debug('[useAIAnalysis] event:', JSON.stringify(event));
				// } else {
				// 	// delta event are too much to log. useless. only log the type to observe the flow.
				// 	console.debug('[useAIAnalysis] delta event:', event.triggerName);
				// }

				pushTimeline(event);

				switch (event.type) {
					case 'text-delta':
					case 'reasoning-delta':
						break;
					case 'tool-call':
						break;
					case 'tool-result': {
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
					case 'prompt-stream-result': {
						const ev = event as { promptId: string; output?: unknown; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } };
						if (ev.promptId === PromptId.AiAnalysisSummary) {
							flushSummaryBuffer();
							setSummary(ev.output as string);
						}
						break;
					}
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
								const newTitle = title || prev.title;
								const newDescription = description !== '' ? description : prev.description;
								currentUiStepRef.current = { ...prev, title: newTitle, description: newDescription };
								updateCurrentUiStep(stepId, newTitle, newDescription);
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
						useAIAnalysisStore.getState().clearCurrentUiStep();
						useUIEventStore.getState().publish('complete', event);
						// Only apply final result and notice for top-level complete (thought agent), not inner agents (e.g. inspector)
						if (event.triggerName === StreamTriggerName.SEARCH_THOUGHT_AGENT || event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT) {
							handleFinalResult(event);
						}
						break;
					}
					case 'error': {
						const errMsg = event.error?.message ?? String(event.error);
						recordError(errMsg);
						// Notice (error): only when modal is closed and not canceled.
						if (!didCancelRef.current && !noticeSentRef.current && !useAIAnalysisStore.getState().aiModalOpen) {
							noticeSentRef.current = true;
							new Notice(
								'AI Analysis failed. Reopen Quick Search → AI Analysis tab for details.',
								8000,
							);
						}
						break;
					}
					case 'on-step-finish':
					case 'pk-debug':
					case 'unSupported':
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
			// Build debug dump: single chronological timeline (every step in order with agent, input, output, token delta)
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
				timeline: timelineRef.current,
				summary: (aiAnalysisStoreState.summaryChunks ?? []).join(''),
				summaryLen: (aiAnalysisStoreState.summaryChunks ?? []).join('').length
			};
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
			timelineRef.current = [];
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
