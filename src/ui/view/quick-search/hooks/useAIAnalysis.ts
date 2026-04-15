import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
	getCleanQuery,
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
import { SearchAgentResult } from '@/service/agents/shared-types';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { DELTA_EVENT_TYPES } from '@/core/providers/helpers/stream-helper';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { useStepDisplayReplayStore } from '../store/stepDisplayReplayStore';
import { createAIAnalysisStreamDispatcher } from './aiAnalysisStreamDispatcher';
import { Notice } from 'obsidian';
import type { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import type { VaultHitlPauseEvent, VaultPhaseTransitionEvent } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';

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

	const setDashboardBlocks = useAIAnalysisResultStore((s) => s.setDashboardBlocks);
	const setTopics = useAIAnalysisResultStore((s) => s.setTopics);
	const setSources = useAIAnalysisResultStore((s) => s.setSources);
	const setEvidenceIndex = useAIAnalysisResultStore((s) => s.setEvidenceIndex);
	const pushOverviewMermaidVersion = useAIAnalysisResultStore((s) => s.pushOverviewMermaidVersion);

	const setSuggestedFollowUpQuestions = useAIAnalysisInteractionsStore((s) => s.setSuggestedFollowUpQuestions);

	// Chronological timeline for debug: raw LLMStreamEvent[] (no delta events; content_reader output not stored).
	const timelineRef = useRef<LLMStreamEvent[]>([]);
	const pushTimeline = (event: LLMStreamEvent) => {
		try {
			if (DELTA_EVENT_TYPES.has(event.type)) return;

			const arr = timelineRef.current;
			const anyEvent = event as Record<string, unknown>;
			if (anyEvent.toolName === 'content_reader' && anyEvent.output !== undefined) {
				arr.push({ ...event, output: 'content_reader_skipped' } as LLMStreamEvent);
			} else {
				arr.push(event);
			}
		} catch (error) {
			console.error('[useAIAnalysis] pushTimeline error:', error);
		}
	};

	/** Group consecutive timeline entries by triggerName into { agent, items } blocks. */
	const reorganizeTimelineByAgent = (entries: LLMStreamEvent[]): Array<{ agent: string; items: LLMStreamEvent[] }> => {
		if (entries.length === 0) return [];
		const result: Array<{ agent: string; items: LLMStreamEvent[] }> = [];
		let currentAgent = (entries[0] as { triggerName?: string }).triggerName ?? 'unknown';
		let currentItems: LLMStreamEvent[] = [entries[0]];

		for (let i = 1; i < entries.length; i++) {
			const agent = (entries[i] as { triggerName?: string }).triggerName ?? 'unknown';
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

	// AbortController for canceling analysis
	const abortControllerRef = useRef<AbortController | null>(null);
	const didCancelRef = useRef<boolean>(false);
	const noticeSentRef = useRef<boolean>(false);

	// Legacy AISearchAgent fallback; vault modes use VaultSearchAgent via vaultAgentRef.
	const aiSearchAgent = useMemo(() => AppContext.searchAgent(), []);

	// VaultSearchAgent ref — created per-session (not memoized, stateful).
	const vaultAgentRef = useRef<VaultSearchAgent | null>(null);

	// Detect @web@ trigger in search query (don't remove from display, just enable web mode)
	useEffect(() => {
		updateWebFromQuery(searchQuery);
	}, [searchQuery, updateWebFromQuery]);

	/**
	 * Apply search result to state. Summary: prefer streamed content; use result.summary only when no streamed summary.
	 */
	const applySearchResult = useCallback((result: SearchAgentResult) => {
		if (result.summary) {
			const chunks = useAIAnalysisSummaryStore.getState().summaryChunks ?? [];
			const streamed = chunks.join('').trim();
			if (streamed.length === 0) setSummary(result.summary);
		}
		if (result.dashboardBlocks) setDashboardBlocks(result.dashboardBlocks);
		if (result.topics) setTopics(result.topics);
		if (result.sources) setSources(result.sources);
		if (result.evidenceIndex !== undefined) setEvidenceIndex(result.evidenceIndex ?? {});
		if (result.evidenceMermaidOverviewAgent !== undefined && result.evidenceMermaidOverviewAgent != null) {
			pushOverviewMermaidVersion(result.evidenceMermaidOverviewAgent, { makeActive: true, dedupe: true });
		}
		if (result.title !== undefined) setTitle(result.title ?? null);
		if (result.suggestedFollowUpQuestions !== undefined) setSuggestedFollowUpQuestions(result.suggestedFollowUpQuestions ?? []);
		setHasAnalyzed(true);
	}, [setSummary, setDashboardBlocks, setTopics, setSources, setEvidenceIndex, pushOverviewMermaidVersion, setTitle, setSuggestedFollowUpQuestions, setHasAnalyzed]);

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
		let controller: AbortController | null = null;
		if (!abortSignal) {
			controller = new AbortController();
			abortControllerRef.current = controller;
		}
		const signal = abortSignal || controller?.signal;
		let dispatcher: ReturnType<typeof createAIAnalysisStreamDispatcher> | undefined;

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

			const publish = (type: string, payload: any) => useUIEventStore.getState().publish(type, payload);
			const recordErrorOnlyWhenDevTools = (msg: string) => {
				if (AppContext.getInstance().plugin.settings?.enableDevTools) recordError(msg);
			};
			dispatcher = createAIAnalysisStreamDispatcher({
				appendCompletedUiStep,
				appendSummaryDelta,
				setSummary,
				setDashboardBlocks,
				setTopics,
				setSources,
				setEvidenceIndex,
				pushOverviewMermaidVersion,
				setTitle,
				setSuggestedFollowUpQuestions,
				setHasAnalyzed,
				setUsage,
				setDuration,
				setDashboardUpdatedLine,
				publish,
				applySearchResult,
				recordError: recordErrorOnlyWhenDevTools,
				startStreaming,
				onFinalResult: handleFinalResult,
				onHitlPause: (ev: VaultHitlPauseEvent) => {
					useAIAnalysisRuntimeStore.getState().setHitlPause({
						pauseId: ev.pauseId,
						phase: ev.phase,
						snapshot: ev.snapshot,
					});
				},
				onPhaseTransition: (_ev: VaultPhaseTransitionEvent) => {
					// Phase transitions published via dispatcher.publish — no extra store action needed
				},
			});
			dispatcher.reset();

			// Shared event consumer helper
			const consumeStream = async (gen: AsyncIterable<any>) => {
				for await (const event of gen) {
					if (!useAIAnalysisRuntimeStore.getState().hasStartedStreaming) {
						console.debug('[useAIAnalysis] Starting streaming');
						startStreaming();
						useStepDisplayReplayStore.getState().setStreamStarted(true);
					}
					if (signal?.aborted) {
						console.debug('[useAIAnalysis] Analysis cancelled by user');
						break;
					}
					pushTimeline(event as LLMStreamEvent);
					dispatcher!.consumeEvent(event as LLMStreamEvent);
				}
			};

			// Use VaultSearchAgent for vault modes; legacy AISearchAgent for aiGraph fallback
			const isVaultMode = analysisMode === 'vaultFull';

			if (isVaultMode) {
				vaultAgentRef.current = AppContext.vaultSearchAgent();

				// Register HITL feedback callback for UI to call after user reviews plan
				useAIAnalysisRuntimeStore.getState().setHitlFeedbackCallback(async (feedback: UserFeedback) => {
					const agent = vaultAgentRef.current;
					if (!agent) return;
					useAIAnalysisRuntimeStore.getState().clearHitlPause();
					await consumeStream(agent.continueWithFeedback(feedback));
					if (!useAIAnalysisRuntimeStore.getState().hitlState) {
						markAIAnalysisCompleted();
					}
				});

				await consumeStream(vaultAgentRef.current.startSession(searchQuery));
				// If pipeline paused at HITL, completion is deferred until user approves
				if (!useAIAnalysisRuntimeStore.getState().hitlState) {
					markAIAnalysisCompleted();
				}
				return;
			} else {
				console.warn('[aiGraph] agent not yet wired, falling back to legacy agent');
				const stream = aiSearchAgent.stream(searchQuery, scopeValue ? { scopeValue } : { scopeValue: undefined });
				await consumeStream(stream);
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
			dispatcher?.flushSummaryBuffer();
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

			setLastAnalysisHistorySearch(null);

			timelineRef.current = [];
			analysisStartTimeRef.current = 0;

			// Guard: only mark completed if not already done (vault mode calls it earlier)
			if (!useAIAnalysisRuntimeStore.getState().analysisCompleted) {
				markAIAnalysisCompleted();
			}
			// Clear abort controller
			if (controller) {
				abortControllerRef.current = null;
			}
		}
	}, [
		searchQuery,
		webEnabled,
		applySearchResult,
		recordError,
		startAnalyzing,
		startStreaming,
		handleFinalResult,
		appendCompletedUiStep,
		appendSummaryDelta,
		setSummary,
		setDashboardBlocks,
		setTopics,
		setSources,
		setEvidenceIndex,
		pushOverviewMermaidVersion,
		setTitle,
		setSuggestedFollowUpQuestions,
		setHasAnalyzed,
		setUsage,
		setDuration,
		setDashboardUpdatedLine,
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
