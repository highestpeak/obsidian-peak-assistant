/**
 * useSearchSession — orchestrator hook for AI analysis lifecycle.
 *
 * Delegates event routing to useEventRouter, continue-analysis to
 * useContinueAnalysis, and keeps only the top-level performAnalysis
 * flow + cancel/approve/regenerate actions.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Notice } from 'obsidian';

import { useSearchSessionStore } from '../store/searchSessionStore';
import {
	getCleanQuery,
	useAIAnalysisRuntimeStore,
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	resetAIAnalysisAll,
	markAIAnalysisCompleted,
} from '../store/aiAnalysisStore';
import { useSharedStore } from '../store';
import { setLastAnalysisHistorySearch, invalidateFollowupContextCache } from '../followupContextRuntime';
import { useStepDisplayReplayStore } from '../store/stepDisplayReplayStore';

import { AppContext } from '@/app/context/AppContext';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { UserFeedback } from '@/service/agents/core/types';
import type { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import { ReportOrchestrator } from '@/service/agents/report/ReportOrchestrator';

import { pushTimelineEvent, reorganizeTimelineByAgent } from './search-session-types';
import { useEventRouter } from './useEventRouter';
import { useContinueAnalysis } from './useContinueAnalysis';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSearchSession() {
	const { searchQuery } = useSharedStore();
	const store = useSearchSessionStore;

	const webEnabled = store((s) => s.webEnabled);
	const analysisMode = store((s) => s.analysisMode);
	const updateWebFromQuery = store((s) => s.updateWebFromQuery);

	// Debug timeline (non-delta events only)
	const timelineRef = useRef<LLMStreamEvent[]>([]);

	const analysisStartTimeRef = useRef<number>(0);
	const abortControllerRef = useRef<AbortController | null>(null);
	const didCancelRef = useRef<boolean>(false);
	const noticeSentRef = useRef<boolean>(false);

	// DocSimpleAgent (memoized, stateless)
	const aiSearchAgent = useMemo(() => AppContext.searchAgent(), []);

	// VaultSearchAgent (created per session)
	const vaultAgentRef = useRef<VaultSearchAgent | null>(null);

	// Detect @web@ trigger in search query
	useEffect(() => {
		updateWebFromQuery(searchQuery);
	}, [searchQuery, updateWebFromQuery]);

	// -----------------------------------------------------------------------
	// Delegated hooks
	// -----------------------------------------------------------------------

	const { routeEvent, flushSummaryBuffer, currentUiStepRef, summaryBufferRef } = useEventRouter();

	const { runContinueAnalysis } = useContinueAnalysis({
		routeEvent,
		flushSummaryBuffer,
		timelineRef,
		summaryBufferRef,
		currentUiStepRef,
		analysisStartTimeRef,
		didCancelRef,
		noticeSentRef,
	});

	// -----------------------------------------------------------------------
	// performAnalysis
	// -----------------------------------------------------------------------

	const performAnalysis = useCallback(async (abortSignal?: AbortSignal, scopeValue?: string) => {
		let controller: AbortController | null = null;
		if (!abortSignal) {
			controller = new AbortController();
			abortControllerRef.current = controller;
		}
		const signal = abortSignal || controller?.signal;

		try {
			// Validate query
			const cleanQuery = getCleanQuery(searchQuery);
			if (!cleanQuery) {
				store.getState().recordError('Please enter a search query.');
				useAIAnalysisRuntimeStore.getState().recordError('Please enter a search query.');
				return;
			}
			if (!aiSearchAgent) {
				store.getState().recordError('AI search agent is not ready yet. Please try again.');
				useAIAnalysisRuntimeStore.getState().recordError('AI search agent is not ready yet. Please try again.');
				return;
			}

			// ----- Continue mode: append a new round without resetting -----
			const isContinue = store.getState().continueMode;
			if (isContinue) {
				await runContinueAnalysis(searchQuery, signal, abortControllerRef, controller);
				return;
			}

			// Reset everything
			store.getState().resetAll();
			resetAIAnalysisAll();
			useStepDisplayReplayStore.getState().reset();
			invalidateFollowupContextCache();

			// Start session
			store.getState().startSession(searchQuery);
			// Bridge: sync analysisMode to runtime store before startAnalyzing
			useAIAnalysisRuntimeStore.getState().setAnalysisMode(analysisMode);
			useAIAnalysisRuntimeStore.getState().startAnalyzing();

			didCancelRef.current = false;
			noticeSentRef.current = false;
			timelineRef.current = [];
			summaryBufferRef.current = [];
			currentUiStepRef.current = null;
			analysisStartTimeRef.current = Date.now();

			// Shared stream consumer
			const consumeStream = async (gen: AsyncIterable<any>) => {
				for await (const event of gen) {
					if (!store.getState().hasStartedStreaming) {
						console.debug('[useSearchSession] Starting streaming');
						store.getState().startStreaming();
						// Bridge
						useAIAnalysisRuntimeStore.getState().startStreaming();
						useStepDisplayReplayStore.getState().setStreamStarted(true);
					}
					if (signal?.aborted) {
						console.debug('[useSearchSession] Analysis cancelled by user');
						break;
					}
					pushTimelineEvent(timelineRef.current, event as LLMStreamEvent);
					routeEvent(event as LLMStreamEvent);
				}
			};

			// Choose agent mode
			const isVaultMode = analysisMode === 'vaultFull';

			if (isVaultMode) {
				vaultAgentRef.current = AppContext.vaultSearchAgent();

				// Register HITL feedback callback
				const hitlCallback = async (feedback: UserFeedback) => {
					const agent = vaultAgentRef.current;
					if (!agent) return;
					store.getState().clearHitlPause();
					useAIAnalysisRuntimeStore.getState().clearHitlPause();
					// Clear hitlPauseId from plan step so HitlInlineInput hides immediately
					store.getState().updateStep('plan', (step) => ({ ...step, hitlPauseId: undefined }));
					await consumeStream(agent.continueWithFeedback(feedback));
					if (!store.getState().hitlState) {
						store.getState().markCompleted();
						markAIAnalysisCompleted();
					}
				};
				store.getState().setHitlFeedbackCallback(hitlCallback);
				// Bridge
				useAIAnalysisRuntimeStore.getState().setHitlFeedbackCallback(hitlCallback);

				await consumeStream(vaultAgentRef.current.startSession(searchQuery));

				// If pipeline paused at HITL or plan_ready, completion is deferred
				const postStreamStatus = store.getState().status;
				if (!store.getState().hitlState && postStreamStatus !== 'plan_ready') {
					store.getState().markCompleted();
					markAIAnalysisCompleted();
				}
				return;
			}

			// aiGraph mode — run AIGraphAgent and route events to aiGraphStore
			if (analysisMode === 'aiGraph') {
				const { useAIGraphStore } = await import('../store/aiGraphStore');
				const { AIGraphAgent } = await import('@/service/agents/AIGraphAgent');

				const agent = new AIGraphAgent(AppContext.getInstance().manager);
				useAIGraphStore.getState().setLoading(true);
				useAIGraphStore.getState().setQuery(searchQuery);

				for await (const event of agent.startSession(searchQuery)) {
					if (signal?.aborted) break;
					if (event.type === 'ui-signal' && (event as any).channel === 'ai-graph-data') {
						useAIGraphStore.getState().setGraphData((event as any).data.graphData);
					}
				}

				useAIGraphStore.getState().setLoading(false);
				store.getState().markCompleted();
				markAIAnalysisCompleted();
				return;
			}

			const stream = aiSearchAgent.stream(searchQuery, scopeValue ? { scopeValue } : { scopeValue: undefined });
			await consumeStream(stream);
		} catch (err) {
			const errorMessage = err instanceof Error
				? err.message
				: 'Failed to connect to AI service. Please check your network connection and try again.';
			store.getState().recordError(errorMessage);
			// Bridge
			useAIAnalysisRuntimeStore.getState().recordError(errorMessage);

			// Notice (error): only when modal is closed and not canceled
			if (!didCancelRef.current && !noticeSentRef.current && !store.getState().aiModalOpen) {
				noticeSentRef.current = true;
				new Notice(
					'AI Analysis failed. Reopen Quick Search \u2192 AI Analysis tab for details.',
					8000,
				);
			}
		} finally {
			// Flush pending summary deltas
			flushSummaryBuffer();

			// Debug dump
			const ss = store.getState();
			const sum = useAIAnalysisSummaryStore.getState();
			const res = useAIAnalysisResultStore.getState();
			const debugDump = {
				meta: {
					query: searchQuery,
					webEnabled,
					totalDurationMs: Date.now() - analysisStartTimeRef.current,
					usage: ss.usage,
					hasError: !!ss.error,
					error: ss.error,
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
			console.debug('[useSearchSession] debugDumpJson', JSON.stringify(debugDump));

			setLastAnalysisHistorySearch(null);
			timelineRef.current = [];
			analysisStartTimeRef.current = 0;

			// Guard: only mark completed if not already done AND not waiting for HITL
			if (!store.getState().getIsCompleted() && !store.getState().hitlState) {
				store.getState().markCompleted();
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
		analysisMode,
		aiSearchAgent,
		store,
		routeEvent,
		flushSummaryBuffer,
		runContinueAnalysis,
	]);

	// -----------------------------------------------------------------------
	// handleApprovePlan — start report generation from approved plan
	// -----------------------------------------------------------------------

	const reportOrchestrator = useMemo(() => new ReportOrchestrator(AppContext.getInstance().plugin.aiServiceManager), []);

	const handleApprovePlan = useCallback(async () => {
		const state = store.getState();
		const sections = state.v2PlanSections;
		if (sections.length === 0) return;

		// Mark plan as approved — this is the user's explicit action
		store.getState().approvePlan();

		try {
			await reportOrchestrator.generateReport(
				sections,
				state.v2Sources.map((s) => s.path),
				state.v2ProposedOutline ?? '',
				state.query,
			);
		} catch (err: any) {
			store.getState().recordError(err?.message ?? 'Report generation failed');
		}
	}, []);

	// -----------------------------------------------------------------------
	// handleRegenerateSection — regenerate a single report section
	// -----------------------------------------------------------------------

	const handleRegenerateSection = useCallback(async (sectionId: string, userPrompt?: string) => {
		const state = store.getState();
		try {
			await reportOrchestrator.regenerateSection(
				sectionId,
				state.v2PlanSections,
				state.v2ProposedOutline ?? '',
				state.query,
				userPrompt,
			);
		} catch (err: any) {
			store.getState().failSection(sectionId, err?.message ?? 'Regeneration failed');
		}
	}, []);

	// -----------------------------------------------------------------------
	// cancel
	// -----------------------------------------------------------------------

	const cancel = useCallback(() => {
		if (abortControllerRef.current) {
			console.log('[useSearchSession] Canceling analysis');
			didCancelRef.current = true;
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
	}, []);

	return { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection };
}
