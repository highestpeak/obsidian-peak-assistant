/**
 * Shared types and helpers for the useSearchSession hook family.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import type { UIStepRecord } from '../store/aiAnalysisStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUMMARY_FLUSH_MS = 120;

// ---------------------------------------------------------------------------
// UiStep accumulator (same logic as old dispatcher)
// ---------------------------------------------------------------------------

export type UiStepAccum = { stepId: string; titleChunks: string[]; descChunks: string[]; startedAtMs: number };

export function flushUiStep(accum: UiStepAccum | UIStepRecord): UIStepRecord {
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
// Timeline helpers
// ---------------------------------------------------------------------------

import { DELTA_EVENT_TYPES } from '@/core/providers/helpers/stream-helper';

export function pushTimelineEvent(timeline: LLMStreamEvent[], event: LLMStreamEvent): void {
	try {
		if (DELTA_EVENT_TYPES.has(event.type)) return;
		const anyEvent = event as Record<string, unknown>;
		if (anyEvent.toolName === 'content_reader' && anyEvent.output !== undefined) {
			timeline.push({ ...event, output: 'content_reader_skipped' } as LLMStreamEvent);
		} else {
			timeline.push(event);
		}
	} catch (error) {
		console.error('[useSearchSession] pushTimeline error:', error);
	}
}

/** Group consecutive timeline entries by triggerName. */
export function reorganizeTimelineByAgent(entries: LLMStreamEvent[]): Array<{ agent: string; items: LLMStreamEvent[] }> {
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
}
