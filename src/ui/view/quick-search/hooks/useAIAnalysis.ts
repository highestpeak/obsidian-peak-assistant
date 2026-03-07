import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
	getCleanQuery,
	type UIStepRecord,
	useAIAnalysisRuntimeStore,
	useAIAnalysisStepsStore,
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	useAIAnalysisInteractionsStore,
	resetAIAnalysisAll,
	markAIAnalysisCompleted,
} from '../store/aiAnalysisStore';
import { useSharedStore } from '@/ui/view/quick-search/store';
import { setLastAnalysisHistorySearch, invalidateFollowupContextCache } from '../followupContextRuntime';
import { AppContext } from '@/app/context/AppContext';
import { SearchAgentResult } from '@/service/agents/AISearchAgent';
import { mountSearchMemoryDebug, clearSearchMemoryDebug } from '@/service/agents/search-agent-helper/helpers/searchMemoryDebugMount';
import { LLMStreamEvent, StreamTriggerName, UISignalChannel } from '@/core/providers/types';
import { checkIfDeltaEvent, getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { useStepDisplayReplayStore } from '../store/stepDisplayReplayStore';
import { Notice } from 'obsidian';

export function useAIAnalysis() {
	const { searchQuery } = useSharedStore();

	const webEnabled = useAIAnalysisRuntimeStore((s) => s.webEnabled);
	const analysisMode = useAIAnalysisRuntimeStore((s) => s.analysisMode);
	const updateWebFromQuery = useAIAnalysisRuntimeStore((s) => s.updateWebFromQuery);
	const startAnalyzing = useAIAnalysisRuntimeStore((s) => s.startAnalyzing);
	const startStreaming = useAIAnalysisRuntimeStore((s) => s.startStreaming);
	const recordError = useAIAnalysisRuntimeStore((s) => s.recordError);
	const setUsage = useAIAnalysisRuntimeStore((s) => s.setUsage);
	const setDuration = useAIAnalysisRuntimeStore((s) => s.setDuration);
	const setTitle = useAIAnalysisRuntimeStore((s) => s.setTitle);
	const setDashboardUpdatedLine = useAIAnalysisRuntimeStore((s) => s.setDashboardUpdatedLine);
	const setHasAnalyzed = useAIAnalysisRuntimeStore((s) => s.setHasAnalyzed);

	const appendCompletedUiStep = useAIAnalysisStepsStore((s) => s.appendCompletedUiStep);

	const appendSummaryDelta = useAIAnalysisSummaryStore((s) => s.appendSummaryDelta);
	const setSummary = useAIAnalysisSummaryStore((s) => s.setSummary);

	const setGraph = useAIAnalysisResultStore((s) => s.setGraph);
	const setDashboardBlocks = useAIAnalysisResultStore((s) => s.setDashboardBlocks);
	const setTopics = useAIAnalysisResultStore((s) => s.setTopics);
	const setSources = useAIAnalysisResultStore((s) => s.setSources);
	const pushOverviewMermaidVersion = useAIAnalysisResultStore((s) => s.pushOverviewMermaidVersion);

	const setSuggestedFollowUpQuestions = useAIAnalysisInteractionsStore((s) => s.setSuggestedFollowUpQuestions);

	// Chronological timeline for debug: every step in order with agent, input, output, token delta
	// mainly for debugging.
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
			// Skip ui-step-delta for timeline (redundant with text-delta; causes duplicated output)
			if (event.type === 'ui-step-delta') return;

			const anyEvent = event as any;
			const isDelta = checkIfDeltaEvent(event.type);
			const deltaText = getDeltaEventDeltaText(event);
			const arr = timelineRef.current;

			// Merge delta events with previous delta
			if (isDelta && arr.length > 0 && checkIfDeltaEvent(arr[arr.length - 1].eventType as LLMStreamEvent['type'])) {
				const prev = arr[arr.length - 1];
				const base = String(prev.output ?? '').replace(/\s*\[\w[-.\w]*\]\s*$/, '');
				// eg: xxxx [text-delta]
				prev.output = base + (deltaText || '') + (event.type ? ` [${event.type}]` : '');
				prev.ts = Date.now();
				return;
			}

			// Build what identifier for tool events and ui-signal
			const currentWhat = anyEvent.toolName
				? `${anyEvent.toolName}${anyEvent.id ? ` (${anyEvent.id})` : ''}`
				: anyEvent.promptId
					? `${anyEvent.promptId}`
					: anyEvent.debugName
						? anyEvent.debugName
						: event.type === 'ui-signal'
							? `${anyEvent.channel ?? 'signal'}:${anyEvent.kind ?? 'event'}${anyEvent.entityId ? ` (${anyEvent.entityId})` : ''}`
							: 'unknown';

			// Never store full content_reader output in timeline (too large)
			const isContentReader = anyEvent.toolName === 'content_reader';
			const rawOutput = anyEvent.output !== undefined && !isContentReader
				? anyEvent.output
				: anyEvent.output !== undefined && isContentReader
					? 'content_reader_skipped'
					: anyEvent.title || anyEvent.description
						? [anyEvent.title, anyEvent.description].filter(Boolean).join('. ')
						: deltaText
							? deltaText + (event.type ? ` [${event.type}]` : '')
							: event.type === 'ui-signal'
								? { channel: anyEvent.channel, kind: anyEvent.kind, entityId: anyEvent.entityId, payload: anyEvent.payload }
								: anyEvent.extra ?? (anyEvent.error ? (anyEvent.error?.message ?? String(anyEvent.error)) : undefined);

			arr.push({
				ts: Date.now(),
				eventType: event.type,
				agent: event.triggerName || 'unknown',
				what: currentWhat,
				input: anyEvent.input,
				output: JSON.stringify(rawOutput),
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

	/** Group consecutive timeline entries with the same agent into { agent, items } blocks. */
	const reorganizeTimelineByAgent = (entries: TimelineEntry[]): Array<{ agent: string; items: TimelineEntry[] }> => {
		if (entries.length === 0) return [];
		const result: Array<{ agent: string; items: TimelineEntry[] }> = [];
		let currentAgent = entries[0].agent ?? 'unknown';
		let currentItems: TimelineEntry[] = [entries[0]];

		for (let i = 1; i < entries.length; i++) {
			const agent = entries[i].agent ?? 'unknown';
			if (agent === currentAgent) {
				currentItems.push(entries[i]);
			} else {
				result.push({ agent: currentAgent, items: currentItems });
				currentAgent = agent;
				currentItems = [entries[i]];
			}
		}
		result.push({ agent: currentAgent, items: currentItems });
		return result;
	};

	// Analysis start time for duration tracking
	const analysisStartTimeRef = useRef<number>(0);

	// Current UI step (from ui-step) for persisting to store when next step or complete.
	// Uses chunk arrays to avoid O(n) string concatenation on every delta (GC pressure).
	type UiStepAccum = { stepId: string; titleChunks: string[]; descChunks: string[]; startedAtMs: number };
	const currentUiStepRef = useRef<UiStepAccum | UIStepRecord | null>(null);

	// Summary delta buffer to reduce store update frequency. Use array to avoid O(n) string += per delta.
	const summaryDeltaBufferRef = useRef<string[]>([]);
	const summaryFlushTimerRef = useRef<number | null>(null);

	const flushSummaryBuffer = useCallback(() => {
		if (summaryFlushTimerRef.current) {
			window.clearTimeout(summaryFlushTimerRef.current);
			summaryFlushTimerRef.current = null;
		}
		const chunks = summaryDeltaBufferRef.current;
		if (chunks.length === 0) return;
		appendSummaryDelta(chunks.join(''));
		summaryDeltaBufferRef.current = [];
	}, [appendSummaryDelta]);

	const bufferSummaryDelta = useCallback((delta: string) => {
		if (!delta) return;
		summaryDeltaBufferRef.current.push(delta);
		if (summaryFlushTimerRef.current) return;
		summaryFlushTimerRef.current = window.setTimeout(() => {
			summaryFlushTimerRef.current = null;
			const chunks = summaryDeltaBufferRef.current;
			if (chunks.length === 0) return;
			appendSummaryDelta(chunks.join(''));
			summaryDeltaBufferRef.current = [];
		}, 120);
	}, [appendSummaryDelta]);

	// AbortController for canceling analysis
	const abortControllerRef = useRef<AbortController | null>(null);
	const didCancelRef = useRef<boolean>(false);
	const noticeSentRef = useRef<boolean>(false);

	// Real agent when not mock; MockAISearchAgent in desktop dev so one code path
	const aiSearchAgent = useMemo(() => {
		return AppContext.searchAgent({
			enableWebSearch: webEnabled,
			enableLocalSearch: true,
			analysisMode: analysisMode ?? 'vaultFull',
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
		if (result.summary) setSummary(result.summary);
		if (result.dashboardBlocks) setDashboardBlocks(result.dashboardBlocks);
		if (result.topics) setTopics(result.topics);
		if (result.sources) setSources(result.sources);
		if (result.evidenceMermaidOverviewAgent !== undefined && result.evidenceMermaidOverviewAgent != null) {
			pushOverviewMermaidVersion(result.evidenceMermaidOverviewAgent, { makeActive: true, dedupe: true });
		}
		if (result.title !== undefined) setTitle(result.title ?? null);
		if (result.suggestedFollowUpQuestions !== undefined) setSuggestedFollowUpQuestions(result.suggestedFollowUpQuestions ?? []);
		setHasAnalyzed(true);
	}, [setSummary, setGraph, setDashboardBlocks, setTopics, setSources, pushOverviewMermaidVersion, setTitle, setSuggestedFollowUpQuestions, setHasAnalyzed]);

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
		if (!didCancelRef.current && !noticeSentRef.current && !useAIAnalysisRuntimeStore.getState().aiModalOpen) {
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

			resetAIAnalysisAll();
			useStepDisplayReplayStore.getState().reset();
			invalidateFollowupContextCache();
			startAnalyzing();
			didCancelRef.current = false;
			noticeSentRef.current = false;
			timelineRef.current = [];
			analysisStartTimeRef.current = Date.now();
			summaryDeltaBufferRef.current = [];
			if (summaryFlushTimerRef.current) {
				window.clearTimeout(summaryFlushTimerRef.current);
				summaryFlushTimerRef.current = null;
			}

			if (AppContext.getInstance().settings?.enableDevTools && aiSearchAgent) {
				mountSearchMemoryDebug(aiSearchAgent);
			}

			const stream = await aiSearchAgent!.stream(searchQuery, scopeValue ? { scopeValue } : undefined);

			// Process the stream directly
			for await (const event of stream) {
				if (!useAIAnalysisRuntimeStore.getState().hasStartedStreaming) {
					console.debug('[useAIAnalysis] Starting streaming');
					startStreaming();
					useStepDisplayReplayStore.getState().setStreamStarted(true);
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
					case 'text-start': {
						if (event.triggerName === StreamTriggerName.SEARCH_SUMMARY || event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT) {
							if (!useAIAnalysisSummaryStore.getState().isSummaryStreaming) {
								useAIAnalysisSummaryStore.getState().startSummaryStreaming();
							}
						}
						break;
					}
					case 'text-delta':
						if (event.triggerName === StreamTriggerName.SEARCH_SUMMARY || event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT) {
							const delta = getDeltaEventDeltaText(event);
							bufferSummaryDelta(delta);
							// publish event for UI rendering
							useUIEventStore.getState().publish('summary-delta', { text: delta });
						}
						break;
					case 'text-end':
						if (event.triggerName === StreamTriggerName.SEARCH_SUMMARY || event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT) {
							flushSummaryBuffer();
							// setSummary(ev.output as string);
						}
						break;
					case 'reasoning-delta':
						break;
					case 'tool-call':
						break;
					case 'tool-result': {
						const currentResult = event.extra?.currentResult as SearchAgentResult | undefined;
						if (currentResult) {
							// console.log('[useAIAnalysis] tool-result applySearchResult');
							applySearchResult(currentResult);
						}
						break;
					}
					case 'ui-step': {
						useUIEventStore.getState().publish(event.type, event);
						const stepId = event.stepId as string | undefined;
						const title = typeof event.title === 'string' ? event.title : '';
						const description = typeof event.description === 'string' ? event.description : '';
						if (event.triggerName === StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT && title === 'Dashboard Updated' && description) {
							setDashboardUpdatedLine(description);
						}
						if (stepId) {
							const prev = currentUiStepRef.current;
							if (prev && prev.stepId !== stepId) {
								const toAppend: UIStepRecord = 'titleChunks' in prev
									? { stepId: prev.stepId, title: prev.titleChunks.join('') || 'Step', description: prev.descChunks.join(''), startedAtMs: prev.startedAtMs, endedAtMs: Date.now() }
									: { ...prev, endedAtMs: Date.now() };
								appendCompletedUiStep(toAppend);
							}
							if (!prev || prev.stepId !== stepId) {
								currentUiStepRef.current = { stepId, titleChunks: title ? [title] : [], descChunks: description ? [description] : [], startedAtMs: Date.now() };
							} else if ('titleChunks' in prev) {
								prev.titleChunks = title ? [title] : prev.titleChunks;
								prev.descChunks = description !== '' ? [description] : prev.descChunks;
							}
						}
						break;
					}
					case 'ui-step-delta': {
						useUIEventStore.getState().publish(event.type, event);
						// Skip store update: StepsDisplay subscribes to events and renders. appendCurrentUiStepDelta
						// caused O(n) string concat + store set on every delta → GC pressure and crash.
						const descDelta = typeof event.descriptionDelta === 'string' ? event.descriptionDelta : '';
						const titleDelta = typeof event.titleDelta === 'string' ? event.titleDelta : '';
						if (descDelta || titleDelta) {
							const cur = currentUiStepRef.current;
							if (cur && 'descChunks' in cur) {
								if (descDelta) cur.descChunks.push(descDelta);
								if (titleDelta) cur.titleChunks.push(titleDelta);
							}
						}
						break;
					}
					case 'ui-signal': {
						const ev = event as { channel?: string; payload?: { mermaid?: string; progress?: unknown } };
						if (ev.channel === UISignalChannel.OVERVIEW_MERMAID && typeof ev.payload?.mermaid === 'string') {
							pushOverviewMermaidVersion(ev.payload.mermaid.trim(), { makeActive: true, dedupe: true });
						}
						// // MindFlowAgent sends one combined signal at finish with { mermaid, progress }; single set = one re-render
						if (ev.channel === UISignalChannel.MINDFLOW_MERMAID && ev.payload) {
							const p = ev.payload as { mermaid?: string };
							if (typeof p.mermaid === 'string') {
								useAIAnalysisResultStore.getState().setMindflowSnapshot({ mermaid: p.mermaid.trim() });
							}
						}
						useUIEventStore.getState().publish(event.type, event);
						break;
					}
					case 'complete': {
						const lastStep = currentUiStepRef.current;
						if (lastStep) {
							const toAppend: UIStepRecord = 'titleChunks' in lastStep
								? { stepId: lastStep.stepId, title: lastStep.titleChunks.join('') || 'Step', description: lastStep.descChunks.join(''), startedAtMs: lastStep.startedAtMs, endedAtMs: Date.now() }
								: { ...lastStep, endedAtMs: Date.now() };
							appendCompletedUiStep(toAppend);
							currentUiStepRef.current = null;
						}
						useUIEventStore.getState().publish('complete', event);
						// Only apply final result and notice for top-level complete (thought agent), not inner agents (e.g. inspector)
						if (event.triggerName === StreamTriggerName.SEARCH_AI_AGENT || event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT) {
							handleFinalResult(event);
						}
						break;
					}
					case 'error': {
						if (AppContext.getInstance().plugin.settings.enableDevTools) {
							const errMsg = event.error?.message ?? String(event.error);
							recordError(errMsg);
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
			if (!didCancelRef.current && !noticeSentRef.current && !useAIAnalysisRuntimeStore.getState().aiModalOpen) {
				noticeSentRef.current = true;
				new Notice(
					'AI Analysis failed. Reopen Quick Search → AI Analysis tab for details.',
					8000,
				);
			}
		} finally {
			clearSearchMemoryDebug();
			flushSummaryBuffer();
			const rt = useAIAnalysisRuntimeStore.getState();
			const sum = useAIAnalysisSummaryStore.getState();
			const res = useAIAnalysisResultStore.getState();
			const debugDump = {
				meta: {
					query: searchQuery,
					webEnabled,
					totalDurationMs: Date.now() - analysisStartTimeRef.current,
					usage: rt.usage,
					hasError: !!rt.error,
					error: rt.error,
					sourcesCount: (res.sources ?? []).length,
					topicsCount: (res.topics ?? []).length,
					dashboardBlocksCount: (res.dashboardBlocks ?? []).length,
					graphNodesCount: (res.graph?.nodes ?? []).length,
					graphEdgesCount: (res.graph?.edges ?? []).length,
				},
				timeline: reorganizeTimelineByAgent(timelineRef.current),
				summary: (sum.summaryChunks ?? []).join(''),
				summaryLen: (sum.summaryChunks ?? []).join('').length,
			};
			console.debug('[useAIAnalysis] debugDumpJson', JSON.stringify(debugDump));

			try {
				const runId = rt.analysisRunId ?? null;
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
			summaryDeltaBufferRef.current = [];
			if (summaryFlushTimerRef.current) {
				window.clearTimeout(summaryFlushTimerRef.current);
				summaryFlushTimerRef.current = null;
			}

			markAIAnalysisCompleted();
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
		startAnalyzing,
		startStreaming,
		bufferSummaryDelta,
		flushSummaryBuffer,
		handleFinalResult,
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
