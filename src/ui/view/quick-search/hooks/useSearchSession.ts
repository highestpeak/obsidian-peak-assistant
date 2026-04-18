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

import { reorganizeTimelineByAgent } from './search-session-types';
import { consumeStream } from './streamConsumer';
import type { StreamConsumerContext } from './streamConsumer';
import { useEventRouter, eventTargetRedirect } from './useEventRouter';
import { useContinueAnalysis } from './useContinueAnalysis';
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';

// ---------------------------------------------------------------------------
// Module-level ref holder — survives React unmount so QuickSearchModal.onClose
// can snapshot the running agent/abort controller for background detach.
// ---------------------------------------------------------------------------

export const sessionRefs = {
	agentRef: null as VaultSearchAgent | null,
	abortController: null as AbortController | null,
};

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
			sessionRefs.abortController = controller;
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
			const mySessionId = store.getState().id;
			// Bridge: sync analysisMode to runtime store before startAnalyzing
			useAIAnalysisRuntimeStore.getState().setAnalysisMode(analysisMode);
			useAIAnalysisRuntimeStore.getState().startAnalyzing();

			didCancelRef.current = false;
			noticeSentRef.current = false;
			timelineRef.current = [];
			summaryBufferRef.current = [];
			currentUiStepRef.current = null;
			analysisStartTimeRef.current = Date.now();

			// Build stream consumer context
			const streamCtx: StreamConsumerContext = {
				hasStartedStreaming: () => store.getState().hasStartedStreaming,
				onStreamStart: () => {
					store.getState().startStreaming();
					useAIAnalysisRuntimeStore.getState().startStreaming();
					useStepDisplayReplayStore.getState().setStreamStarted(true);
				},
				signal,
				routeEvent,
				timeline: timelineRef.current,
			};

			// Choose agent mode
			const isVaultMode = analysisMode === 'vaultFull';

			if (isVaultMode) {
				vaultAgentRef.current = AppContext.vaultSearchAgent();
				sessionRefs.agentRef = vaultAgentRef.current;

				// Register HITL feedback callback
				const hitlCallback = async (feedback: UserFeedback) => {
					const agent = vaultAgentRef.current;
					if (!agent) return;
					store.getState().clearHitlPause();
					useAIAnalysisRuntimeStore.getState().clearHitlPause();
					await consumeStream(agent.continueWithFeedback(feedback), streamCtx);
					if (!store.getState().hitlState) {
						store.getState().markCompleted();
						markAIAnalysisCompleted();
					}
				};
				store.getState().setHitlFeedbackCallback(hitlCallback);
				// Bridge
				useAIAnalysisRuntimeStore.getState().setHitlFeedbackCallback(hitlCallback);

				await consumeStream(vaultAgentRef.current.startSession(searchQuery), streamCtx);

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
			await consumeStream(stream, streamCtx);
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
			// If this session was detached to background, skip all foreground cleanup
			const isStillForeground = store.getState().id === mySessionId;
			if (!isStillForeground) {
				console.debug('[useSearchSession] Session was detached to background, skipping foreground cleanup');
			} else {
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
				sessionRefs.abortController = null;
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
			sessionRefs.agentRef = null;
			sessionRefs.abortController = null;
		}
	}, []);

	// -----------------------------------------------------------------------
	// restoreFromBackground — restore a background session to the foreground
	// -----------------------------------------------------------------------

	const restoreFromBackground = useCallback((sessionId: string) => {
		const manager = BackgroundSessionManager.getInstance();

		// If current foreground is active, detach it first
		const currentStore = store.getState();
		const isActive = currentStore.status === 'streaming' || currentStore.status === 'starting';
		const hasPlan = currentStore.v2PlanSections.length > 0 && !currentStore.v2PlanApproved;
		if (isActive || hasPlan) {
			manager.detachForeground({
				agentRef: sessionRefs.agentRef,
				abortController: sessionRefs.abortController,
			});
		}

		// Get agent refs before restoring (removes session from manager)
		const refs = manager.getAgentRefs(sessionId);
		const snapshot = manager.restoreToForeground(sessionId);
		if (!snapshot) return;

		// Restore snapshot to foreground store
		store.getState().restoreFromSnapshot(snapshot);

		// Re-bind agent refs
		if (refs) {
			vaultAgentRef.current = refs.agentRef;
			abortControllerRef.current = refs.abortController;
			sessionRefs.agentRef = refs.agentRef;
			sessionRefs.abortController = refs.abortController;
		}

		// Deactivate event redirect (events now go back to foreground store)
		eventTargetRedirect.active = false;
		eventTargetRedirect.target = null;
		eventTargetRedirect.summaryBuffer = null;
		eventTargetRedirect.uiStepRef = null;

		// Re-register HITL callback if plan-ready (so user can approve and continue)
		if (snapshot.v2PlanSections.length > 0 && !snapshot.v2PlanApproved && refs?.agentRef) {
			const hitlCallback = async (feedback: UserFeedback) => {
				const agent = vaultAgentRef.current;
				if (!agent) return;
				store.getState().clearHitlPause();
				useAIAnalysisRuntimeStore.getState().clearHitlPause();

				const streamCtx: StreamConsumerContext = {
					hasStartedStreaming: () => store.getState().hasStartedStreaming,
					onStreamStart: () => {
						store.getState().startStreaming();
						useAIAnalysisRuntimeStore.getState().startStreaming();
					},
					signal: abortControllerRef.current?.signal,
					routeEvent,
					timeline: timelineRef.current,
				};
				await consumeStream(agent.continueWithFeedback(feedback), streamCtx);
				if (!store.getState().hitlState) {
					store.getState().markCompleted();
					markAIAnalysisCompleted();
				}
			};
			store.getState().setHitlFeedbackCallback(hitlCallback);
			useAIAnalysisRuntimeStore.getState().setHitlFeedbackCallback(hitlCallback);
		}
	}, [routeEvent]);

	return { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection, restoreFromBackground };
}
