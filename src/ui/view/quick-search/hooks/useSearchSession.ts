/**
 * useSearchSession — replaces useAIAnalysis + aiAnalysisStreamDispatcher.
 *
 * Manages the AI analysis lifecycle and consumes stream events inline,
 * updating the unified searchSessionStore while keeping backward-compat
 * bridge writes to the old fragmented stores.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Notice } from 'obsidian';

import { useSearchSessionStore } from '../store/searchSessionStore';
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
import type { UIStepRecord } from '../store/aiAnalysisStore';
import { useSharedStore } from '../store';
import { setLastAnalysisHistorySearch, invalidateFollowupContextCache } from '../followupContextRuntime';
import { useStepDisplayReplayStore } from '../store/stepDisplayReplayStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';

import { AppContext } from '@/app/context/AppContext';
import type { SearchAgentResult } from '@/service/agents/shared-types';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UISignalChannel } from '@/core/providers/types';
import { getDeltaEventDeltaText, DELTA_EVENT_TYPES } from '@/core/providers/helpers/stream-helper';
import { createStep } from '../types/search-steps';

import type { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import type { VaultHitlPauseEvent, VaultPhaseTransitionEvent } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUMMARY_FLUSH_MS = 120;

// ---------------------------------------------------------------------------
// UiStep accumulator (same logic as old dispatcher)
// ---------------------------------------------------------------------------

type UiStepAccum = { stepId: string; titleChunks: string[]; descChunks: string[]; startedAtMs: number };

function flushUiStep(accum: UiStepAccum | UIStepRecord): UIStepRecord {
	if ('titleChunks' in accum) {
		return {
			stepId: accum.stepId,
			title: accum.titleChunks.join('') || 'Step',
			description: accum.descChunks.join(''),
			startedAtMs: accum.startedAtMs,
			endedAtMs: Date.now(),
		};
	}
	return { ...accum, endedAtMs: Date.now() };
}

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
	const pushTimeline = (event: LLMStreamEvent) => {
		try {
			if (DELTA_EVENT_TYPES.has(event.type)) return;
			const anyEvent = event as Record<string, unknown>;
			if (anyEvent.toolName === 'content_reader' && anyEvent.output !== undefined) {
				timelineRef.current.push({ ...event, output: 'content_reader_skipped' } as LLMStreamEvent);
			} else {
				timelineRef.current.push(event);
			}
		} catch (error) {
			console.error('[useSearchSession] pushTimeline error:', error);
		}
	};

	/** Group consecutive timeline entries by triggerName. */
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

	const analysisStartTimeRef = useRef<number>(0);
	const abortControllerRef = useRef<AbortController | null>(null);
	const didCancelRef = useRef<boolean>(false);
	const noticeSentRef = useRef<boolean>(false);

	// Summary delta buffer (120 ms debounce)
	const summaryBufferRef = useRef<string[]>([]);
	const summaryFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// UI step accumulator
	const currentUiStepRef = useRef<UiStepAccum | UIStepRecord | null>(null);

	// DocSimpleAgent (memoized, stateless)
	const aiSearchAgent = useMemo(() => AppContext.searchAgent(), []);

	// VaultSearchAgent (created per session)
	const vaultAgentRef = useRef<VaultSearchAgent | null>(null);

	// Detect @web@ trigger in search query
	useEffect(() => {
		updateWebFromQuery(searchQuery);
	}, [searchQuery, updateWebFromQuery]);

	// -----------------------------------------------------------------------
	// Summary buffer helpers
	// -----------------------------------------------------------------------

	const flushSummaryBuffer = useCallback(() => {
		if (summaryFlushTimerRef.current) {
			clearTimeout(summaryFlushTimerRef.current);
			summaryFlushTimerRef.current = null;
		}
		const chunks = summaryBufferRef.current;
		if (chunks.length === 0) return;
		const joined = chunks.join('');
		summaryBufferRef.current = [];

		// New store: append to summary step
		const s = store.getState();
		const hasSummary = s.steps.some((st) => st.type === 'summary');
		if (hasSummary) {
			store.getState().updateStep('summary', (step) => ({
				...step,
				chunks: [...step.chunks, joined],
			}));
		}

		// Bridge: old store
		useAIAnalysisSummaryStore.getState().appendSummaryDelta(joined);
	}, [store]);

	const bufferSummaryDelta = useCallback((delta: string) => {
		if (!delta) return;
		summaryBufferRef.current.push(delta);
		if (summaryFlushTimerRef.current) return;
		summaryFlushTimerRef.current = setTimeout(() => {
			summaryFlushTimerRef.current = null;
			flushSummaryBuffer();
		}, SUMMARY_FLUSH_MS);
	}, [flushSummaryBuffer]);

	// -----------------------------------------------------------------------
	// applySearchResult — bridge to old stores + update new steps
	// -----------------------------------------------------------------------

	const applySearchResult = useCallback((result: SearchAgentResult) => {
		const ss = store.getState();

		// Summary: prefer streamed content
		if (result.summary) {
			const summaryStep = ss.getStep('summary');
			const streamed = (summaryStep?.chunks ?? []).join('').trim();
			if (streamed.length === 0) {
				// Old store bridge
				useAIAnalysisSummaryStore.getState().setSummary(result.summary);
			}
		}

		// Sources
		if (result.sources) {
			// Ensure sources step exists
			if (!ss.steps.some((st) => st.type === 'sources')) {
				store.getState().pushStep(createStep('sources'));
			}
			store.getState().updateStep('sources', (step) => ({
				...step,
				sources: result.sources,
				evidenceIndex: result.evidenceIndex ?? step.evidenceIndex,
			}));
			// Bridge
			useAIAnalysisResultStore.getState().setSources(result.sources);
		}
		if (result.evidenceIndex !== undefined) {
			useAIAnalysisResultStore.getState().setEvidenceIndex(result.evidenceIndex ?? {});
		}

		// Dashboard blocks
		if (result.dashboardBlocks) {
			// Ensure report step exists
			if (!ss.steps.some((st) => st.type === 'report')) {
				store.getState().pushStep(createStep('report'));
			}
			store.getState().updateStep('report', (step) => ({
				...step,
				blocks: result.dashboardBlocks ?? step.blocks,
			}));
			// Bridge
			useAIAnalysisResultStore.getState().setDashboardBlocks(result.dashboardBlocks);
		}

		// Topics
		if (result.topics) {
			// Bridge
			useAIAnalysisResultStore.getState().setTopics(result.topics);
		}

		// Graph (overview mermaid)
		if (result.evidenceMermaidOverviewAgent != null) {
			if (!ss.steps.some((st) => st.type === 'graph')) {
				store.getState().pushStep(createStep('graph'));
			}
			store.getState().updateStep('graph', (step) => {
				const versions = [...step.overviewMermaidVersions];
				const code = result.evidenceMermaidOverviewAgent!;
				if (versions.length === 0 || versions[versions.length - 1] !== code) {
					versions.push(code);
				}
				return {
					...step,
					overviewMermaidVersions: versions,
					overviewMermaidActiveIndex: versions.length - 1,
				};
			});
			// Bridge
			useAIAnalysisResultStore.getState().pushOverviewMermaidVersion(
				result.evidenceMermaidOverviewAgent,
				{ makeActive: true, dedupe: true },
			);
		}

		// Title
		if (result.title !== undefined) {
			store.getState().setTitle(result.title ?? null);
			// Bridge
			useAIAnalysisRuntimeStore.getState().setTitle(result.title ?? null);
		}

		// Follow-up questions
		if (result.suggestedFollowUpQuestions !== undefined) {
			useAIAnalysisInteractionsStore.getState().setSuggestedFollowUpQuestions(
				result.suggestedFollowUpQuestions ?? [],
			);
		}

		// HasAnalyzed
		store.getState().setHasAnalyzed(true);
		// Bridge
		useAIAnalysisRuntimeStore.getState().setHasAnalyzed(true);
	}, [store]);

	// -----------------------------------------------------------------------
	// Event routing (inlined dispatcher)
	// -----------------------------------------------------------------------

	const routeEvent = useCallback((event: LLMStreamEvent) => {
		console.debug('[useSearchSession] routeEvent:', event);
		const publish = (type: string, payload: any) => useUIEventStore.getState().publish(type, payload);

		switch (event.type) {
			// ---- Phase transitions (vault pipeline) ----
			case 'phase-transition': {
				const ev = event as unknown as VaultPhaseTransitionEvent;
				store.getState().pushPhaseStep(ev.to);
				publish('phase-transition', event);
				break;
			}

			// ---- Summary streaming ----
			case 'text-start': {
				if (
					event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
					event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
				) {
					// Ensure summary step exists
					const ss = store.getState();
					if (!ss.steps.some((st) => st.type === 'summary')) {
						store.getState().pushStep(createStep('summary'));
					}
					store.getState().updateStep('summary', (step) => ({
						...step,
						streaming: true,
					}));
					// Bridge
					if (!useAIAnalysisSummaryStore.getState().isSummaryStreaming) {
						useAIAnalysisSummaryStore.getState().startSummaryStreaming();
					}
				}
				break;
			}
			case 'text-delta': {
				if (
					event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
					event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
				) {
					const delta = getDeltaEventDeltaText(event);
					bufferSummaryDelta(delta);
				}
				break;
			}
			case 'text-end': {
				if (
					event.triggerName === StreamTriggerName.SEARCH_SUMMARY ||
					event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
				) {
					flushSummaryBuffer();
				}
				break;
			}

			// ---- Tool results ----
			case 'tool-result': {
				const currentResult = (event as any).extra?.currentResult as SearchAgentResult | undefined;
				if (currentResult) applySearchResult(currentResult);
				break;
			}

			// ---- UI steps (timeline narration) ----
			case 'ui-step': {
				publish(event.type, event);
				const stepId = (event as any).stepId as string | undefined;
				const title = typeof (event as any).title === 'string' ? (event as any).title : '';
				const description = typeof (event as any).description === 'string' ? (event as any).description : '';

				// Dashboard Updated detection
				if (
					event.triggerName === StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT &&
					title === 'Dashboard Updated' &&
					description
				) {
					store.getState().setDashboardUpdatedLine(description);
					// Bridge
					useAIAnalysisRuntimeStore.getState().setDashboardUpdatedLine(description);
				}

				if (stepId) {
					const prev = currentUiStepRef.current;
					if (prev && prev.stepId !== stepId) {
						// Bridge: old steps store
						useAIAnalysisStepsStore.getState().appendCompletedUiStep(flushUiStep(prev));
					}
					if (!prev || prev.stepId !== stepId) {
						currentUiStepRef.current = {
							stepId,
							titleChunks: title ? [title] : [],
							descChunks: description ? [description] : [],
							startedAtMs: Date.now(),
						};
					} else if ('titleChunks' in prev) {
						prev.titleChunks = title ? [title] : prev.titleChunks;
						prev.descChunks = description !== '' ? [description] : prev.descChunks;
					}
				}
				break;
			}
			case 'ui-step-delta': {
				publish(event.type, event);
				const descDelta = typeof (event as any).descriptionDelta === 'string' ? (event as any).descriptionDelta : '';
				const titleDelta = typeof (event as any).titleDelta === 'string' ? (event as any).titleDelta : '';
				if (descDelta || titleDelta) {
					const cur = currentUiStepRef.current;
					if (cur && 'descChunks' in cur) {
						if (descDelta) cur.descChunks.push(descDelta);
						if (titleDelta) cur.titleChunks.push(titleDelta);
					}
				}
				break;
			}

			// ---- UI signals ----
			case 'ui-signal': {
				const ev = event as { channel?: string; payload?: { mermaid?: string; dimensions?: any; completedIndices?: any; tasks?: any; groupProgress?: any } };

				// Overview mermaid
				if (ev.channel === UISignalChannel.OVERVIEW_MERMAID && typeof ev.payload?.mermaid === 'string') {
					const code = ev.payload.mermaid.trim();
					// New store
					const ss = store.getState();
					if (!ss.steps.some((st) => st.type === 'graph')) {
						store.getState().pushStep(createStep('graph'));
					}
					store.getState().updateStep('graph', (step) => {
						const versions = [...step.overviewMermaidVersions];
						if (versions.length === 0 || versions[versions.length - 1] !== code) {
							versions.push(code);
						}
						return {
							...step,
							overviewMermaidVersions: versions,
							overviewMermaidActiveIndex: versions.length - 1,
						};
					});
					// Bridge
					useAIAnalysisResultStore.getState().pushOverviewMermaidVersion(code, { makeActive: true, dedupe: true });
				}

				// Search stage (recon progress)
				if (ev.channel === UISignalChannel.SEARCH_STAGE && ev.payload) {
					const payload = ev.payload as any;
					const ss = store.getState();
					if (ss.steps.some((st) => st.type === 'recon')) {
						store.getState().updateStep('recon', (step) => ({
							...step,
							dimensions: payload.dimensions ?? step.dimensions,
							completedIndices: payload.completedIndices ?? step.completedIndices,
							tasks: payload.tasks ?? step.tasks,
							groupProgress: payload.groupProgress ?? step.groupProgress,
						}));
					}
				}

				publish(event.type, event);
				break;
			}

			// ---- Parallel stream progress ----
			case 'parallel-stream-progress': {
				const ev = event as any;
				const ss = store.getState();
				if (ss.steps.some((st) => st.type === 'recon')) {
					store.getState().updateStep('recon', (step) => ({
						...step,
						completedIndices: ev.completedIndices ?? step.completedIndices,
						total: ev.total ?? step.total,
					}));
				}
				publish('parallel-stream-progress', event);
				break;
			}

			// ---- Completion ----
			case 'complete': {
				// Flush last UI step
				const lastStep = currentUiStepRef.current;
				if (lastStep) {
					useAIAnalysisStepsStore.getState().appendCompletedUiStep(flushUiStep(lastStep));
					currentUiStepRef.current = null;
				}
				publish('complete', event);

				if (
					event.triggerName === StreamTriggerName.SEARCH_AI_AGENT ||
					event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT
				) {
					// Set usage and duration
					const completeEvent = event as any;
					if (completeEvent.usage) {
						store.getState().setUsage(completeEvent.usage);
						// Bridge
						useAIAnalysisRuntimeStore.getState().setUsage(completeEvent.usage);
					}
					if (completeEvent.durationMs) {
						store.getState().setDuration(completeEvent.durationMs);
						// Bridge
						useAIAnalysisRuntimeStore.getState().setDuration(completeEvent.durationMs);
					}

					const finalResult = completeEvent.result as SearchAgentResult | undefined;
					if (finalResult) {
						applySearchResult(finalResult);
					}

					// Notice (success): only when modal is closed and not canceled
					if (
						!didCancelRef.current &&
						!noticeSentRef.current &&
						!store.getState().aiModalOpen
					) {
						noticeSentRef.current = true;
						new Notice(
							'AI Analysis completed. Reopen Quick Search \u2192 AI Analysis tab to view results.',
							8000,
						);
					}

					store.getState().markCompleted();
					// Bridge
					markAIAnalysisCompleted();
				}
				break;
			}

			// ---- Errors ----
			case 'error': {
				const errMsg = (event as any).error?.message ?? String((event as any).error);
				if (errMsg) {
					if (AppContext.getInstance().plugin.settings?.enableDevTools) {
						store.getState().recordError(errMsg);
					}
					// Bridge
					if (AppContext.getInstance().plugin.settings?.enableDevTools) {
						useAIAnalysisRuntimeStore.getState().recordError(errMsg);
					}
				}
				break;
			}

			// ---- HITL pause ----
			case 'hitl-pause': {
				const ev = event as unknown as VaultHitlPauseEvent;

				// Update plan step
				const ss = store.getState();
				if (ss.steps.some((st) => st.type === 'plan')) {
					store.getState().updateStep('plan', (step) => ({
						...step,
						snapshot: ev.snapshot,
						hitlPauseId: ev.pauseId,
						hitlPhase: ev.phase,
					}));
				}

				store.getState().setHitlPause({
					pauseId: ev.pauseId,
					phase: ev.phase,
					snapshot: ev.snapshot,
				});
				// Bridge
				useAIAnalysisRuntimeStore.getState().setHitlPause({
					pauseId: ev.pauseId,
					phase: ev.phase,
					snapshot: ev.snapshot,
				});
				break;
			}

			// ---- Agent progress / stats ----
			case 'agent-step-progress': {
				publish('agent-step-progress', event);
				break;
			}
			case 'agent-stats': {
				publish('agent-stats', event);
				break;
			}

			// Ignored
			case 'reasoning-delta':
			case 'tool-call':
				break;

			default:
				break;
		}
	}, [store, applySearchResult, bufferSummaryDelta, flushSummaryBuffer]);

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

			// Reset everything
			store.getState().resetAll();
			resetAIAnalysisAll();
			useStepDisplayReplayStore.getState().reset();
			invalidateFollowupContextCache();

			// Start session
			store.getState().startSession(searchQuery);
			// Bridge: old store start
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
					pushTimeline(event as LLMStreamEvent);
					routeEvent(event as LLMStreamEvent);
				}
			};

			// Choose agent mode
			const isVaultMode = analysisMode === 'vaultFull' || analysisMode === 'vaultSimple';

			if (isVaultMode) {
				vaultAgentRef.current = AppContext.vaultSearchAgent();

				// Register HITL feedback callback
				const hitlCallback = async (feedback: UserFeedback) => {
					const agent = vaultAgentRef.current;
					if (!agent) return;
					store.getState().clearHitlPause();
					useAIAnalysisRuntimeStore.getState().clearHitlPause();
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

				// If pipeline paused at HITL, completion is deferred
				if (!store.getState().hitlState) {
					store.getState().markCompleted();
					markAIAnalysisCompleted();
				}
				return;
			}

			// docSimple mode
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

			// Guard: only mark completed if not already done
			if (!store.getState().getIsCompleted()) {
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
	]);

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

	return { performAnalysis, cancel };
}
