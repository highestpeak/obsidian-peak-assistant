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
import { getCleanQuery } from '../store/aiAnalysisStore';
import { useSharedStore } from '../store';
import { setLastAnalysisHistorySearch, invalidateFollowupContextCache } from '../followupContextRuntime';
import { useStepDisplayReplayStore } from '../store/stepDisplayReplayStore';

import { useServiceContext } from '@/ui/context/ServiceContext';
import { useQuickSearchHost } from './useQuickSearchHost';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { UserFeedback } from '@/service/agents/core/types';
import type { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';

import { consumeStream } from './streamConsumer';
import type { StreamConsumerContext } from './streamConsumer';
import { useEventRouter } from './useEventRouter';
import { useContinueAnalysis } from './useContinueAnalysis';
import { persistSessionToVault } from '@/service/search/analysisDocPersistence';
import type { AnalysisDocVaultWriterPort } from '@/service/search/ports/AnalysisDocVaultWriterPort';
import type { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import type { EventBus } from '@/core/eventBus';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import { snapshotFromState } from '../store/sessionSnapshot';
import type { V2SessionSnapshot } from '../store/sessionSnapshot';

// ---------------------------------------------------------------------------
// Module-level ref holder — survives React unmount so QuickSearchModal.onClose
// can snapshot the running agent/abort controller for background detach.
// ---------------------------------------------------------------------------

export const sessionRefs = {
	agentRef: null as VaultSearchAgent | null,
	abortController: null as AbortController | null,
};

export interface PersistForegroundSessionDeps {
	settings: MyPluginSettings;
	historyService: AIAnalysisHistoryService;
	eventBus: EventBus;
	vaultWriter: AnalysisDocVaultWriterPort;
}

/**
 * Persist the current foreground session to vault.
 * Called at completion milestones (plan ready / fully complete) and after
 * on-demand graph generation (so the saved markdown captures the graph).
 * Updates the store's autoSaveState with the saved path.
 *
 * If existingPath is not supplied, falls back to autoSaveState.lastSavedPath
 * then restoredFromVaultPath, so re-saves after restoring from history
 * overwrite the original markdown instead of creating a new file.
 *
 * T11O Track 6: caller threads `settings` / `historyService` / `eventBus` /
 * `vaultWriter` from `useServiceContext()` so this helper no longer reaches
 * `AppContext.getInstance()`.
 */
export function persistForegroundSession(
	deps: PersistForegroundSessionDeps,
	existingPath?: string | null,
): void {
	const store = useSearchSessionStore.getState();
	const snapshot = snapshotFromState(store);
	const resolvedExistingPath =
		existingPath ?? store.autoSaveState?.lastSavedPath ?? store.restoredFromVaultPath ?? null;

	let graphJson: string | null = null;
	try {
		const { exportGraphJson } = require('../store/aiGraphStore');
		const { useGraphAgentStore } = require('../store/graphAgentStore');
		graphJson = exportGraphJson() ?? null;
		if (!graphJson) {
			const gStore = useGraphAgentStore.getState();
			if (gStore.graphData) {
				graphJson = JSON.stringify({
					lenses: { topology: gStore.graphData },
					source: 'graphAgent',
					generatedAt: new Date().toISOString(),
				});
			}
		}
	} catch { /* graph stores not available */ }

	void persistSessionToVault(snapshot, {
		vaultWriter: deps.vaultWriter,
		existingPath: resolvedExistingPath,
		graphJson,
		searchSettings: deps.settings.search,
		enableDevTools: deps.settings.enableDevTools === true,
		historyService: deps.historyService,
		eventBus: deps.eventBus,
	}).then((result) => {
		if (result) {
			useSearchSessionStore.getState().setAutoSaveState({ lastSavedPath: result.path });
		}
	});
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSearchSession() {
	const { searchQuery } = useSharedStore();
	const store = useSearchSessionStore;
	const {
		manager,
		plugin,
		settings,
		eventBus,
		aiAnalysisHistoryService,
		analysisDocVaultWriter,
		reportSessionPort,
	} = useServiceContext();
	const host = useQuickSearchHost();
	const persistDeps = useMemo<PersistForegroundSessionDeps>(() => ({
		settings,
		historyService: aiAnalysisHistoryService,
		eventBus,
		vaultWriter: analysisDocVaultWriter,
	}), [settings, aiAnalysisHistoryService, eventBus, analysisDocVaultWriter]);

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
	const aiSearchAgent = useMemo(() => host.createDocSimpleAgent(), [host]);

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
		let mySessionId: string | undefined;

		try {
			// Validate query
			const cleanQuery = getCleanQuery(searchQuery);
			if (!cleanQuery) {
				store.getState().recordError('Please enter a search query.');
				return;
			}
			if (!aiSearchAgent) {
				store.getState().recordError('AI search agent is not ready yet. Please try again.');
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
			useStepDisplayReplayStore.getState().reset();
			invalidateFollowupContextCache();

			// Start session
			store.getState().startSession(searchQuery);
			mySessionId = store.getState().id;

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
					useStepDisplayReplayStore.getState().setStreamStarted(true);
				},
				signal,
				routeEvent,
				timeline: timelineRef.current,
			};

			// Choose agent mode
			const isVaultMode = analysisMode === 'vaultFull';

			if (isVaultMode) {
				vaultAgentRef.current = host.createVaultSearchAgent();
				sessionRefs.agentRef = vaultAgentRef.current;

				// Register HITL feedback callback
				const hitlCallback = async (feedback: UserFeedback) => {
					const agent = vaultAgentRef.current;
					if (!agent) return;
					store.getState().clearHitlPause();
					await consumeStream(agent.continueWithFeedback(feedback), streamCtx);
					if (!store.getState().hitlState) {
						store.getState().markCompleted();
					}
				};
				store.getState().setHitlFeedbackCallback(hitlCallback);

				await consumeStream(vaultAgentRef.current.startSession(searchQuery, { webEnabled, signal }), streamCtx);

				// If pipeline paused at HITL or plan_ready, completion is deferred
				const postStreamStatus = store.getState().status;
				if (!store.getState().hitlState && postStreamStatus !== 'plan_ready') {
					store.getState().markCompleted();
				}
				return;
			}

			// aiGraph mode — run AIGraphAgent and route events to aiGraphStore
			if (analysisMode === 'aiGraph') {
				const { useAIGraphStore } = await import('../store/aiGraphStore');
				const { AIGraphAgent } = await import('@/service/agents/AIGraphAgent');

				const agent = host.createAIGraphAgent();
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
				// Persist graph to markdown — aiGraph mode produces the graph as its primary result
				persistForegroundSession(persistDeps);
				return;
			}

			const stream = aiSearchAgent.stream(searchQuery, scopeValue ? { scopeValue } : { scopeValue: undefined });
			await consumeStream(stream, streamCtx);
		} catch (err) {
			const errorMessage = err instanceof Error
				? err.message
				: 'Failed to connect to AI service. Please check your network connection and try again.';
			store.getState().recordError(errorMessage);

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

				setLastAnalysisHistorySearch(null);
				timelineRef.current = [];
				analysisStartTimeRef.current = 0;

				// Guard: only mark completed if not already done AND not waiting for HITL
				if (!store.getState().getIsCompleted() && !store.getState().hitlState) {
					store.getState().markCompleted();
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

	const reportOrchestrator = useMemo(
		() => host.createReportOrchestrator(),
		[host],
	);

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
			// Milestone: report fully generated — persist to vault
			persistForegroundSession(persistDeps, store.getState().autoSaveState.lastSavedPath);
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
			// Persist updated section to vault
			persistForegroundSession(persistDeps, store.getState().autoSaveState.lastSavedPath);
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
		const runtime = host.quickSearchRuntime;
		if (!runtime) return;

		// T10: if the foreground is still alive, the runtime's
		// `detachForeground()` consults the foreground-session port to
		// snapshot + reset + park it before we restore the requested id.
		runtime.detachForeground();

		const result = runtime.restoreToForeground(sessionId);
		if (!result) return;

		// Restore snapshot to foreground store.
		store.getState().restoreFromSnapshot(result.snapshot as V2SessionSnapshot);

		// Re-bind agent refs (the runtime cleared its redirect inside restoreToForeground).
		const handle = result.agentHandle;
		const restoredAgent = (handle?.agentRef as VaultSearchAgent | null) ?? null;
		if (handle) {
			vaultAgentRef.current = restoredAgent;
			abortControllerRef.current = handle.abortController;
			sessionRefs.agentRef = restoredAgent;
			sessionRefs.abortController = handle.abortController;
		}

		// Re-register HITL callback if plan-ready (so user can approve and continue)
		const snapshot = result.snapshot as V2SessionSnapshot;
		if (snapshot.v2PlanSections.length > 0 && !snapshot.v2PlanApproved && restoredAgent) {
			const hitlCallback = async (feedback: UserFeedback) => {
				const agent = vaultAgentRef.current;
				if (!agent) return;
				store.getState().clearHitlPause();

				const streamCtx: StreamConsumerContext = {
					hasStartedStreaming: () => store.getState().hasStartedStreaming,
					onStreamStart: () => {
						store.getState().startStreaming();
					},
					signal: abortControllerRef.current?.signal,
					routeEvent,
					timeline: timelineRef.current,
				};
				await consumeStream(agent.continueWithFeedback(feedback), streamCtx);
				if (!store.getState().hitlState) {
					store.getState().markCompleted();
				}
			};
			store.getState().setHitlFeedbackCallback(hitlCallback);
		}
	}, [routeEvent]);

	return { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection, restoreFromBackground };
}
