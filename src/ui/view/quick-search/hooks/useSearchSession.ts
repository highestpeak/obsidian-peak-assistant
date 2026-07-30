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
import { consumeFollowupStream, streamSearchFollowup } from './useAIAnalysisPostAIInteractions';
import {
	persistSessionToVault,
	type PersistSessionResult,
} from '@/service/search/analysisDocPersistence';
import type { AnalysisDocVaultWriterPort } from '@/core/ports/AnalysisDocVaultWriterPort';
import type { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import type { EventBus } from '@/core/eventBus';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import { snapshotFromState } from '../store/sessionSnapshot';
import type { V2SessionSnapshot } from '../store/sessionSnapshot';
import { PromptId } from '@/core/types/prompt';

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

function buildReportDirectionContext(outline: string | null, directions: string[]): string {
	const blocks = [outline?.trim() ?? ''];
	if (directions.length > 0) {
		blocks.push([
			'User report directions:',
			...directions.map((direction) => `- ${direction}`),
		].join('\n'));
	}
	return blocks.filter(Boolean).join('\n\n');
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
export async function persistForegroundSession(
	deps: PersistForegroundSessionDeps,
	existingPath?: string | null,
): Promise<PersistSessionResult | null> {
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

	const result = await persistSessionToVault(snapshot, {
		vaultWriter: deps.vaultWriter,
		existingPath: resolvedExistingPath,
		graphJson,
		searchSettings: deps.settings.search,
		enableDevTools: deps.settings.enableDevTools === true,
		historyService: deps.historyService,
		eventBus: deps.eventBus,
		rootFolder: deps.settings.ai.rootFolder,
	});
	if (result) {
		useSearchSessionStore.getState().setAutoSaveState({ lastSavedPath: result.path });
	}
	return result;
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

	const performAnalysis = useCallback(async (abortSignal?: AbortSignal) => {
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
				const { generatedLensGraphToCreateRequest } = await import('@/service/ai-graph');

				const agent = host.createAIGraphAgent();
				useAIGraphStore.getState().setLoading(true);
				useAIGraphStore.getState().setGraphData(null);
				useAIGraphStore.getState().setQuery(searchQuery);
				let webResearch = null;

				for await (const event of agent.startSession(searchQuery, { webEnabled })) {
					if (signal?.aborted) break;
					if (event.type === 'ui-signal' && (event as any).channel === 'ai-graph-data') {
						useAIGraphStore.getState().setGraphData((event as any).data.graphData);
						webResearch = (event as any).data.webResearch ?? null;
					}
				}

				useAIGraphStore.getState().setLoading(false);
				const graphState = useAIGraphStore.getState();
				if (!graphState.graphData) {
					throw new Error('AI Graph generation completed without a valid graph artifact.');
				}
				const artifactRef = await host.persistGeneratedAIGraph(generatedLensGraphToCreateRequest({
					title: searchQuery.slice(0, 80),
					query: searchQuery,
					graphData: graphState.graphData,
					selectedPaths: graphState.selectedPaths,
					webResearch,
					runId: mySessionId,
					...(useSharedStore.getState().aiGraphCreateOrigin
						? {
							createdFrom: {
								surface: useSharedStore.getState().aiGraphCreateOrigin!.surface,
								contextRefs: [useSharedStore.getState().aiGraphCreateOrigin!.contextRef],
							},
						}
						: {}),
				}));
				if (!artifactRef) {
					throw new Error('AI Graph artifact repository is unavailable.');
				}
				store.getState().markCompleted();
				return;
			}

			store.getState().recordError(`Unsupported analysis mode: ${analysisMode}`);
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
		const reportDirection = buildReportDirectionContext(
			state.v2ProposedOutline,
			state.v2UserInsights,
		);

		// Mark plan as approved — this is the user's explicit action
		store.getState().approvePlan();
		store.getState().setReportDebugRunId(null);
		// Report is the generation surface. Keep Activity available in the
		// footer, but stream each section directly into its final report slot.
		store.getState().setV2View('report');

		let traceStatus: 'completed' | 'failed' = 'failed';
		let artifactPath: string | undefined;
		try {
			// B2.analysis (2026-07-03): route report generation through
			// the RunEnvelope so each user "approve plan" click becomes
			// an observable runId with start/finish/error events.
			const { runAnalysisReport } = await import('@/service/agents/report/AnalysisReportRun');
			await runAnalysisReport({
				trigger: 'manual',
				generate: async () => {
						await reportOrchestrator.generateReport(
							sections,
							state.v2Sources.map((s) => s.path),
							reportDirection,
							state.query,
						);
					return null;
				},
			});
			// Milestone: report fully generated — persist to vault
			const persisted = await persistForegroundSession(
				persistDeps,
				store.getState().autoSaveState.lastSavedPath,
			);
			artifactPath = persisted?.path;
			traceStatus = 'completed';
		} catch (err: any) {
			store.getState().recordError(err?.message ?? 'Report generation failed');
		} finally {
			const debugRun = reportOrchestrator.getActiveDebugRun();
			if (debugRun) {
				const runId = debugRun.runId;
				reportOrchestrator.sealActiveDebugRun(traceStatus, artifactPath);
				store.getState().setReportDebugRunId(runId);
			}
		}
	}, []);

	// -----------------------------------------------------------------------
	// handleRegenerateSection — regenerate a single report section
	// -----------------------------------------------------------------------

	const handleRegenerateSection = useCallback(async (sectionId: string, userPrompt?: string) => {
		const state = store.getState();
		const reportDirection = buildReportDirectionContext(
			state.v2ProposedOutline,
			state.v2UserInsights,
		);
		try {
			await reportOrchestrator.regenerateSection(
				sectionId,
				state.v2PlanSections,
				reportDirection,
				state.query,
				userPrompt,
			);
			// Persist updated section to vault
			void persistForegroundSession(persistDeps, store.getState().autoSaveState.lastSavedPath);
		} catch (err: any) {
			store.getState().failSection(sectionId, err?.message ?? 'Regeneration failed');
		}
	}, []);

	// -----------------------------------------------------------------------
	// handleAskSection — grounded, non-destructive section Q&A
	// -----------------------------------------------------------------------

	const handleAskSection = useCallback(async (
		sectionId: string,
		question: string,
		onDelta?: (answer: string) => void,
	): Promise<string> => {
		const state = store.getState();
		const owningRound = state.rounds.find((round) =>
			round.sections.some((candidate) => candidate.id === sectionId),
		);
		const section = owningRound?.sections.find((candidate) => candidate.id === sectionId)
			?? state.v2PlanSections.find((candidate) => candidate.id === sectionId);
		if (!section) throw new Error('Report section not found');

		const evidence = section.evidencePaths.length > 0
			? section.evidencePaths.map((path) => `- [[${path.replace(/\.md$/, '')}]]`).join('\n')
			: '- No direct source paths attached';
		const contextContent = [
			`Section: ${section.title}`,
			`Section answer:\n${section.content}`,
			`Direct sources:\n${evidence}`,
		].join('\n\n');

		const answer = await consumeFollowupStream(
			streamSearchFollowup(
				manager,
				PromptId.AiAnalysisFollowup,
				{
					originalQuery: owningRound?.query ?? state.query,
					question,
					contextContent,
				},
				host.isMockEnv,
			),
			{
				onDelta,
				onUsage: (usage) => store.getState().accumulateUsage(usage),
			},
		);
		if (!answer.trim()) throw new Error('No follow-up answer generated');

		store.getState().addSectionFollowup(sectionId, { question, answer });
		void persistForegroundSession(persistDeps, store.getState().autoSaveState.lastSavedPath);
		return answer;
	}, [host, manager, persistDeps, store]);

	// -----------------------------------------------------------------------
	// cancel
	// -----------------------------------------------------------------------

	const cancel = useCallback(() => {
		if (abortControllerRef.current) {
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

	return {
		performAnalysis,
		cancel,
		handleApprovePlan,
		handleRegenerateSection,
		handleAskSection,
		restoreFromBackground,
	};
}
