/**
 * useContinueAnalysis — handles the "continue analysis" flow.
 *
 * Extracted from useSearchSession to isolate the continue-analysis lifecycle.
 */

import { useCallback } from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import {
	useAIAnalysisRuntimeStore,
	markAIAnalysisCompleted,
} from '../store/aiAnalysisStore';
import { useStepDisplayReplayStore } from '../store/stepDisplayReplayStore';

import { AppContext } from '@/app/context/AppContext';
import type { LLMStreamEvent } from '@/core/providers/types';
import { ContinueAnalysisAgent } from '@/service/agents/ContinueAnalysisAgent';
import type { ContinueContext } from '@/service/agents/ContinueAnalysisAgent';

import { pushTimelineEvent } from './search-session-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContinueAnalysisDeps {
	routeEvent: (event: LLMStreamEvent) => void;
	flushSummaryBuffer: () => void;
	timelineRef: React.MutableRefObject<LLMStreamEvent[]>;
	summaryBufferRef: React.MutableRefObject<string[]>;
	currentUiStepRef: React.MutableRefObject<any>;
	analysisStartTimeRef: React.MutableRefObject<number>;
	didCancelRef: React.MutableRefObject<boolean>;
	noticeSentRef: React.MutableRefObject<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContinueAnalysis(deps: ContinueAnalysisDeps) {
	const store = useSearchSessionStore;

	const runContinueAnalysis = useCallback(async (
		searchQuery: string,
		signal: AbortSignal | undefined,
		abortControllerRef: React.MutableRefObject<AbortController | null>,
		controller: AbortController | null,
	) => {
		const {
			routeEvent,
			flushSummaryBuffer,
			timelineRef,
			summaryBufferRef,
			currentUiStepRef,
			analysisStartTimeRef,
			didCancelRef,
			noticeSentRef,
		} = deps;

		// DON'T reset — we're appending to existing session
		store.setState({ status: 'starting', hasStartedStreaming: false });

		didCancelRef.current = false;
		noticeSentRef.current = false;
		timelineRef.current = [];
		summaryBufferRef.current = [];
		currentUiStepRef.current = null;
		analysisStartTimeRef.current = Date.now();

		const { rounds, v2Sources } = store.getState();
		const ctx: ContinueContext = {
			originalQuery: rounds[0]?.query ?? searchQuery,
			rounds: rounds.map(r => ({
				query: r.query,
				summary: r.summary,
				sections: r.sections.map(s => ({ title: s.title, content: s.content })),
				annotations: r.annotations.map(a => ({
					sectionTitle: r.sections[a.sectionIndex]?.title ?? '',
					selectedText: a.selectedText,
					comment: a.comment,
					type: a.type,
				})),
			})),
			sources: v2Sources.map(s => ({ path: s.path, relevance: s.reasoning ?? '' })),
			graphSummary: await (async () => {
				try {
					const { useAIGraphStore } = await import('../store/aiGraphStore');
					const graph = useAIGraphStore.getState().graphData;
					if (!graph?.nodes?.length) return null;
					return {
						nodeCount: graph.nodes.length,
						keyRelationships: graph.edges.slice(0, 10).map(
							(e: any) => `${e.source} → ${e.target}`,
						),
					};
				} catch { return null; }
			})(),
			followUpQuery: searchQuery,
		};

		// Shared stream consumer
		const consumeContinueStream = async (gen: AsyncIterable<any>) => {
			for await (const event of gen) {
				if (!store.getState().hasStartedStreaming) {
					store.getState().startStreaming();
					useAIAnalysisRuntimeStore.getState().startStreaming();
					useStepDisplayReplayStore.getState().setStreamStarted(true);
				}
				if (signal?.aborted) break;
				pushTimelineEvent(timelineRef.current, event as LLMStreamEvent);
				routeEvent(event as LLMStreamEvent);
			}
		};

		try {
			const appCtx = AppContext.getInstance();
			const continueAgent = new ContinueAnalysisAgent({
				app: appCtx.app,
				pluginId: appCtx.plugin.manifest.id,
				searchClient: appCtx.searchClient,
				aiServiceManager: appCtx.manager,
				settings: appCtx.plugin.settings!,
			});
			await consumeContinueStream(continueAgent.startSession(ctx));
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Continue analysis failed.';
			store.getState().recordError(errorMessage);
			useAIAnalysisRuntimeStore.getState().recordError(errorMessage);
		} finally {
			flushSummaryBuffer();
			if (!store.getState().getIsCompleted() && !store.getState().hitlState) {
				store.getState().markCompleted();
				markAIAnalysisCompleted();
			}
			useSearchSessionStore.setState({ continueMode: false });
			if (controller) {
				abortControllerRef.current = null;
			}
		}
	}, [deps, store]);

	return { runContinueAnalysis };
}
