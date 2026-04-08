/**
 * Single place that maps LLMStreamEvent to store updates and UI event publishes.
 * Used by useAIAnalysis so the event loop stays thin: for await → dispatcher.consume(event).
 */
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UISignalChannel } from '@/core/providers/types';
import { getDeltaEventDeltaText } from '@/core/providers/helpers/stream-helper';
import type { UIStepRecord } from '../store/aiAnalysisStore';
import type { SearchAgentResult, EvidenceIndex } from '@/service/agents/shared-types';
import { useAIAnalysisSummaryStore } from '../store/aiAnalysisStore';
import type { VaultHitlPauseEvent, VaultPhaseTransitionEvent } from '@/service/agents/vault/types';

const SUMMARY_FLUSH_MS = 120;

type UiStepAccum = { stepId: string; titleChunks: string[]; descChunks: string[]; startedAtMs: number };

export type AIAnalysisStreamDispatcherDeps = {
	appendCompletedUiStep: (step: UIStepRecord) => void;
	appendSummaryDelta: (delta: string) => void;
	setSummary: (summary: string) => void;
	setDashboardBlocks: (blocks: SearchAgentResult['dashboardBlocks']) => void;
	setTopics: (topics: SearchAgentResult['topics']) => void;
	setSources: (sources: SearchAgentResult['sources']) => void;
	setEvidenceIndex: (index: EvidenceIndex) => void;
	pushOverviewMermaidVersion: (code: string, opts?: { makeActive?: boolean; dedupe?: boolean }) => void;
	setTitle: (title: string | null) => void;
	setSuggestedFollowUpQuestions: (questions: string[]) => void;
	setHasAnalyzed: (v: boolean) => void;
	setUsage: (u: any) => void;
	setDuration: (d: number) => void;
	setDashboardUpdatedLine: (line: string) => void;
	publish: (type: string, payload: any) => void;
	applySearchResult: (result: SearchAgentResult) => void;
	recordError: (error: string) => void;
	startStreaming: () => void;
	onFinalResult?: (event: LLMStreamEvent) => void;
	/** Called when a vault HITL pause event is received. */
	onHitlPause?: (event: VaultHitlPauseEvent) => void;
	/** Called when a vault phase transition event is received. */
	onPhaseTransition?: (event: VaultPhaseTransitionEvent) => void;
};

export function createAIAnalysisStreamDispatcher(deps: AIAnalysisStreamDispatcherDeps) {
	const currentUiStepRef: { current: UiStepAccum | UIStepRecord | null } = { current: null };
	const summaryDeltaBufferRef: { current: string[] } = { current: [] };
	const summaryFlushTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };

	function flushSummaryBuffer(): void {
		if (summaryFlushTimerRef.current) {
			clearTimeout(summaryFlushTimerRef.current);
			summaryFlushTimerRef.current = null;
		}
		const chunks = summaryDeltaBufferRef.current;
		if (chunks.length === 0) return;
		deps.appendSummaryDelta(chunks.join(''));
		summaryDeltaBufferRef.current = [];
	}

	function bufferSummaryDelta(delta: string): void {
		if (!delta) return;
		summaryDeltaBufferRef.current.push(delta);
		if (summaryFlushTimerRef.current) return;
		summaryFlushTimerRef.current = setTimeout(() => {
			summaryFlushTimerRef.current = null;
			const chunks = summaryDeltaBufferRef.current;
			if (chunks.length === 0) return;
			deps.appendSummaryDelta(chunks.join(''));
			summaryDeltaBufferRef.current = [];
		}, SUMMARY_FLUSH_MS);
	}

	function consumeEvent(event: LLMStreamEvent): void {
		console.debug('[aiAnalysisStreamDispatcher] consumeEvent:', event);
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
				}
				break;
			case 'text-end':
				if (event.triggerName === StreamTriggerName.SEARCH_SUMMARY || event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT) {
					flushSummaryBuffer();
				}
				break;
			case 'reasoning-delta':
			case 'tool-call':
				break;
			case 'tool-result': {
				const currentResult = (event as any).extra?.currentResult as SearchAgentResult | undefined;
				if (currentResult) deps.applySearchResult(currentResult);
				break;
			}
			case 'ui-step': {
				deps.publish(event.type, event);
				const stepId = (event as any).stepId as string | undefined;
				const title = typeof (event as any).title === 'string' ? (event as any).title : '';
				const description = typeof (event as any).description === 'string' ? (event as any).description : '';
				if (event.triggerName === StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT && title === 'Dashboard Updated' && description) {
					deps.setDashboardUpdatedLine(description);
				}
				if (stepId) {
					const prev = currentUiStepRef.current;
					if (prev && prev.stepId !== stepId) {
						const toAppend: UIStepRecord = 'titleChunks' in prev
							? { stepId: prev.stepId, title: prev.titleChunks.join('') || 'Step', description: prev.descChunks.join(''), startedAtMs: prev.startedAtMs, endedAtMs: Date.now() }
							: { ...prev, endedAtMs: Date.now() };
						deps.appendCompletedUiStep(toAppend);
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
				deps.publish(event.type, event);
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
			case 'parallel-stream-progress': {
				deps.publish('parallel-stream-progress', event);
				break;
			}
			case 'ui-signal': {
				const ev = event as { channel?: string; payload?: { mermaid?: string } };
				if (ev.channel === UISignalChannel.OVERVIEW_MERMAID && typeof ev.payload?.mermaid === 'string') {
					deps.pushOverviewMermaidVersion(ev.payload.mermaid.trim(), { makeActive: true, dedupe: true });
				}
				deps.publish(event.type, event);
				break;
			}
			case 'complete': {
				const lastStep = currentUiStepRef.current;
				if (lastStep) {
					const toAppend: UIStepRecord = 'titleChunks' in lastStep
						? { stepId: lastStep.stepId, title: lastStep.titleChunks.join('') || 'Step', description: lastStep.descChunks.join(''), startedAtMs: lastStep.startedAtMs, endedAtMs: Date.now() }
						: { ...lastStep, endedAtMs: Date.now() };
					deps.appendCompletedUiStep(toAppend);
					currentUiStepRef.current = null;
				}
				deps.publish('complete', event);
				if (event.triggerName === StreamTriggerName.SEARCH_AI_AGENT || event.triggerName === StreamTriggerName.DOC_SIMPLE_AGENT) {
					deps.onFinalResult?.(event);
				}
				break;
			}
			case 'error': {
				const errMsg = (event as any).error?.message ?? String((event as any).error);
				if (errMsg) deps.recordError(errMsg);
				break;
			}
			case 'hitl-pause': {
				deps.onHitlPause?.(event as unknown as VaultHitlPauseEvent);
				break;
			}
			case 'phase-transition': {
				deps.onPhaseTransition?.(event as unknown as VaultPhaseTransitionEvent);
				deps.publish('phase-transition', event);
				break;
			}
			case 'agent-step-progress': {
				deps.publish('agent-step-progress', event);
				break;
			}
			case 'agent-stats': {
				deps.publish('agent-stats', event);
				break;
			}
			default:
				break;
		}
	}

	function reset(): void {
		currentUiStepRef.current = null;
		summaryDeltaBufferRef.current = [];
		if (summaryFlushTimerRef.current) {
			clearTimeout(summaryFlushTimerRef.current);
			summaryFlushTimerRef.current = null;
		}
	}

	return { consumeEvent, flushSummaryBuffer, reset };
}
