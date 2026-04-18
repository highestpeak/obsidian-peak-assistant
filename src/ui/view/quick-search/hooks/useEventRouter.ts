/**
 * useEventRouter — routes LLM stream events to the appropriate stores.
 *
 * Delegates to the pure `dispatchEvent` function from eventDispatcher.ts,
 * building foreground EventDispatchTarget / LegacyBridgeTarget from Zustand stores.
 */

import { useCallback, useRef } from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import {
	useAIAnalysisRuntimeStore,
	useAIAnalysisStepsStore,
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	useAIAnalysisInteractionsStore,
	markAIAnalysisCompleted,
} from '../store/aiAnalysisStore';
import type { UIStepRecord } from '../store/aiAnalysisStore';

import type { SearchAgentResult } from '@/service/agents/shared-types';
import type { LLMStreamEvent } from '@/core/providers/types';

import { SUMMARY_FLUSH_MS } from './search-session-types';
import type { UiStepAccum } from './search-session-types';

import {
	dispatchEvent,
	applySearchResult as applySearchResultImpl,
} from './eventDispatcher';
import type {
	EventDispatchTarget,
	LegacyBridgeTarget,
	SummaryBuffer,
	UiStepAccumRef,
} from './eventDispatcher';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEventRouter() {
	const store = useSearchSessionStore;

	// Summary delta buffer (120 ms debounce)
	const summaryBufferRef = useRef<string[]>([]);
	const summaryFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// UI step accumulator
	const currentUiStepRef = useRef<UiStepAccum | UIStepRecord | null>(null);

	// -------------------------------------------------------------------
	// Summary buffer helpers
	// -------------------------------------------------------------------

	const flushSummaryBuffer = useCallback(() => {
		if (summaryFlushTimerRef.current) {
			clearTimeout(summaryFlushTimerRef.current);
			summaryFlushTimerRef.current = null;
		}
		const chunks = summaryBufferRef.current;
		if (chunks.length === 0) return;
		const joined = chunks.join('');
		summaryBufferRef.current = [];

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

	// -------------------------------------------------------------------
	// Build foreground targets
	// -------------------------------------------------------------------

	const buildTarget = (): EventDispatchTarget => ({
			getV2Active: () => store.getState().v2Active,
			getV2ProposedOutline: () => store.getState().v2ProposedOutline,
			getStartedAt: () => store.getState().startedAt,
			getV2StepsLength: () => store.getState().v2Steps.length,
			getV2Sources: () => store.getState().v2Sources,

			setV2Active: (active) => store.getState().setV2Active(active),
			addPhaseUsage: (usage) => store.getState().addPhaseUsage(usage),
			pushV2TimelineText: (id, chunk) => store.getState().pushV2TimelineText(id, chunk),
			resolveV2ToolName: (id) => store.getState().resolveV2ToolName(id),
			updateV2Step: (id, updater) => store.getState().updateV2Step(id, updater),
			updateV2TimelineTool: (id, updater) => store.getState().updateV2TimelineTool(id, updater),
			appendAgentDebugLog: (entry) => store.getState().appendAgentDebugLog(entry),
			setDashboardUpdatedLine: (line) => store.getState().setDashboardUpdatedLine(line),
			setTitle: (title) => store.getState().setTitle(title),
			setHasAnalyzed: (v) => store.getState().setHasAnalyzed(v),
			setUsage: (usage) => store.getState().setUsage(usage),
			setDuration: (duration) => store.getState().setDuration(duration),
			markCompleted: () => store.getState().markCompleted(),
			markV2ReportComplete: () => store.getState().markV2ReportComplete(),
			recordError: (error) => store.getState().recordError(error),
			setHitlPause: (state) => store.getState().setHitlPause(state),
			pushV2Step: (step) => store.getState().pushV2Step(step),
			pushV2TimelineTool: (step) => store.getState().pushV2TimelineTool(step),
			registerV2ToolCall: (id, toolName) => store.getState().registerV2ToolCall(id, toolName),
			addV2Source: (source) => store.getState().addV2Source(source),
			setPlanSections: (sections) => store.getState().setPlanSections(sections),
			setProposedOutline: (outline) => useSearchSessionStore.setState({ v2ProposedOutline: outline }),
			setFollowUpQuestions: (questions) => useSearchSessionStore.setState({ v2FollowUpQuestions: questions }),
			setV2Sources: (sources) => useSearchSessionStore.setState({ v2Sources: sources }),
	});

	const buildLegacy = (): LegacyBridgeTarget => ({
		isSummaryStreaming: () => useAIAnalysisSummaryStore.getState().isSummaryStreaming,
		startSummaryStreaming: () => useAIAnalysisSummaryStore.getState().startSummaryStreaming(),
		setSummary: (summary) => useAIAnalysisSummaryStore.getState().setSummary(summary),

		setSources: (sources) => useAIAnalysisResultStore.getState().setSources(sources),
		setEvidenceIndex: (index) => useAIAnalysisResultStore.getState().setEvidenceIndex(index),
		setDashboardBlocks: (blocks) => useAIAnalysisResultStore.getState().setDashboardBlocks(blocks),
		setTopics: (topics) => useAIAnalysisResultStore.getState().setTopics(topics),
		pushOverviewMermaidVersion: (code, opts) => useAIAnalysisResultStore.getState().pushOverviewMermaidVersion(code, opts),

		setTitle: (title) => useAIAnalysisRuntimeStore.getState().setTitle(title),
		setHasAnalyzed: (v) => useAIAnalysisRuntimeStore.getState().setHasAnalyzed(v),
		setDashboardUpdatedLine: (line) => useAIAnalysisRuntimeStore.getState().setDashboardUpdatedLine(line),
		setUsage: (usage) => useAIAnalysisRuntimeStore.getState().setUsage(usage),
		setDuration: (duration) => useAIAnalysisRuntimeStore.getState().setDuration(duration),
		recordError: (error) => useAIAnalysisRuntimeStore.getState().recordError(error),
		setHitlPause: (state) => useAIAnalysisRuntimeStore.getState().setHitlPause(state),

		setSuggestedFollowUpQuestions: (questions) => useAIAnalysisInteractionsStore.getState().setSuggestedFollowUpQuestions(questions),

		appendCompletedUiStep: (step) => useAIAnalysisStepsStore.getState().appendCompletedUiStep(step),

		markCompleted: () => markAIAnalysisCompleted(),
	});

	const buildSummaryBuffer = (): SummaryBuffer => ({
		appendDelta: bufferSummaryDelta,
		flush: flushSummaryBuffer,
	});

	const buildUiStepRef = (): UiStepAccumRef => ({
		get: () => currentUiStepRef.current,
		set: (val) => { currentUiStepRef.current = val; },
	});

	// -------------------------------------------------------------------
	// applySearchResult — bridge to old stores + update new steps
	// -------------------------------------------------------------------

	const applySearchResult = useCallback((result: SearchAgentResult) => {
		applySearchResultImpl(result, buildTarget(), buildLegacy());
	}, [store]);

	// -------------------------------------------------------------------
	// routeEvent
	// -------------------------------------------------------------------

	const routeEvent = useCallback((event: LLMStreamEvent) => {
		console.debug('[useSearchSession] routeEvent:', event);
		dispatchEvent(event, buildTarget(), buildLegacy(), buildSummaryBuffer(), buildUiStepRef());
	}, [store, bufferSummaryDelta, flushSummaryBuffer]);

	return { routeEvent, flushSummaryBuffer, applySearchResult, currentUiStepRef, summaryBufferRef };
}
