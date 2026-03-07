/**
 * Unified UI event protocol for AISearchAgent pipeline.
 * Defines stage/lane meta, stepId rules, and constructors for ui-step / ui-step-delta / ui-signal.
 * Transport remains LLMStreamEvent (core/providers/types); this file provides semantic layer.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import {
	StreamTriggerName,
	UISignalChannel,
	UISignalKind,
	UIStepType,
} from '@/core/providers/types';

/** Pipeline stages; maps to StreamTriggerName where applicable. */
export type SearchUIStage =
	| 'recall'
	| 'classify'
	| 'recon'
	| 'consolidate'
	| 'grouping'
	| 'groupContext'
	| 'evidence'
	| 'overview'
	| 'report'
	| 'reportPlan'
	| 'visualBlueprint'
	| 'reportBlock'
	| 'summary'
	| 'sourcesStreaming';

/** Lane descriptor for parallel branches so UI can group by lane. */
export interface SearchUILane {
	laneType: 'dimension' | 'group' | 'block' | 'planLine';
	laneId: string;
	index?: number;
}

/** Meta attached to every search UI event for stepId, tree grouping, and filtering. */
export interface SearchUIEventMeta {
	runStepId: string;
	stage: SearchUIStage;
	/** Optional for sequential stages. */
	lane?: SearchUILane;
	/** Human-readable agent name, e.g. 'RawSearchAgent.Recon'. */
	agent?: string;
	/** Parent stepId for tree/nesting in UI. */
	parentStepId?: string;
}

/** Map stage to default StreamTriggerName. */
export function stageToTriggerName(stage: SearchUIStage): StreamTriggerName {
	const map: Record<SearchUIStage, StreamTriggerName> = {
		recall: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
		classify: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
		recon: StreamTriggerName.SEARCH_RAW_AGENT_RECON,
		consolidate: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
		grouping: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
		groupContext: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
		evidence: StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE,
		overview: StreamTriggerName.SEARCH_OVERVIEW_MERMAID,
		report: StreamTriggerName.SEARCH_AI_AGENT,
		reportPlan: StreamTriggerName.SEARCH_REPORT_PLAN_AGENT,
		visualBlueprint: StreamTriggerName.SEARCH_VISUAL_BLUEPRINT_AGENT,
		reportBlock: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT,
		summary: StreamTriggerName.SEARCH_SUMMARY,
		sourcesStreaming: StreamTriggerName.SEARCH_SOURCES_FROM_VERIFIED_PATHS,
	};
	return map[stage];
}

/**
 * Build stable stepId: search:<runStepId>:<stage>[:<laneType>:<laneId>]
 */
export function makeStepId(meta: SearchUIEventMeta): string {
	const base = `search:${meta.runStepId}:${meta.stage}`;
	if (meta.lane) {
		return `${base}:${meta.lane.laneType}:${meta.lane.laneId}`;
	}
	return base;
}

/** Extra payload for UI (stage, lane, agent, parentStepId). */
export function makeStepExtra(meta: SearchUIEventMeta): { meta: SearchUIEventMeta } {
	return { meta: { ...meta } };
}

/** Emit ui-step (start) with optional description and extra meta. */
export function uiStepStart(
	meta: SearchUIEventMeta,
	opts: {
		title: string;
		description?: string;
		triggerName?: StreamTriggerName;
	}
): LLMStreamEvent {
	const triggerName = opts.triggerName ?? stageToTriggerName(meta.stage);
	return {
		type: 'ui-step',
		uiType: UIStepType.STEPS_DISPLAY,
		stepId: makeStepId(meta),
		title: opts.title,
		description: opts.description ?? '',
		triggerName,
		triggerTimestamp: Date.now(),
		extra: makeStepExtra(meta),
	};
}

/** Emit ui-step-delta (append to current step title/description). */
export function uiStepDelta(
	meta: SearchUIEventMeta,
	opts: {
		titleDelta?: string;
		descriptionDelta?: string;
		triggerName?: StreamTriggerName;
	}
): LLMStreamEvent {
	const triggerName = opts.triggerName ?? stageToTriggerName(meta.stage);
	return {
		type: 'ui-step-delta',
		uiType: UIStepType.STEPS_DISPLAY,
		stepId: makeStepId(meta),
		titleDelta: opts.titleDelta,
		descriptionDelta: opts.descriptionDelta,
		triggerName,
		extra: makeStepExtra(meta),
	};
}

/** Stage signal status for ui-signal payload. */
export type SearchStageSignalStatus = 'start' | 'progress' | 'complete' | 'error';

/** Emit ui-signal for stage control (start/progress/complete/error). */
export function uiStageSignal(
	meta: SearchUIEventMeta,
	opts: {
		status: SearchStageSignalStatus;
		payload?: Record<string, unknown>;
		triggerName?: StreamTriggerName;
	}
): LLMStreamEvent {
	const triggerName = opts.triggerName ?? stageToTriggerName(meta.stage);
	const entityId = `${meta.stage}${meta.lane ? `:${meta.lane.laneId}` : ''}`;
	const kind =
		opts.status === 'complete'
			? UISignalKind.COMPLETE
			: opts.status === 'progress'
				? UISignalKind.PROGRESS
				: UISignalKind.STAGE;
	return {
		type: 'ui-signal',
		channel: UISignalChannel.SEARCH_STAGE,
		kind,
		entityId,
		stepId: makeStepId(meta),
		payload: {
			status: opts.status,
			stage: meta.stage,
			lane: meta.lane,
			...opts.payload,
		},
		triggerName,
		triggerTimestamp: Date.now(),
		extra: makeStepExtra(meta),
	};
}

/**
 * Wrap an async generator with start ui-step + start signal, then optional end signal on done/error.
 */
export async function* wrapStage<T extends LLMStreamEvent>(
	meta: SearchUIEventMeta,
	generator: AsyncGenerator<T>,
	opts: {
		startTitle: string;
		startDescription?: string;
		endTitle?: string;
		triggerName?: StreamTriggerName;
		onError?: (err: unknown) => void;
	}
): AsyncGenerator<LLMStreamEvent> {
	const triggerName = opts.triggerName ?? stageToTriggerName(meta.stage);
	yield uiStepStart(meta, {
		title: opts.startTitle,
		description: opts.startDescription,
		triggerName,
	});
	yield uiStageSignal(meta, { status: 'start', triggerName });

	try {
		for await (const ev of generator) {
			yield ev as LLMStreamEvent;
		}
		if (opts.endTitle) {
			yield uiStepDelta(meta, { descriptionDelta: opts.endTitle, triggerName });
		}
		yield uiStageSignal(meta, { status: 'complete', triggerName });
	} catch (err) {
		opts.onError?.(err);
		yield uiStageSignal(meta, {
			status: 'error',
			payload: { error: err instanceof Error ? err.message : String(err) },
			triggerName,
		});
		throw err;
	}
}

/**
 * Consume a prompt stream and re-yield every event; for prompt-stream-delta also yield ui-step-delta
 * so UI steps timeline stays consistent when not using streamTransform.
 */
export async function* forwardPromptStreamWithUiDelta(
	meta: SearchUIEventMeta,
	promptStream: AsyncGenerator<LLMStreamEvent>,
	triggerName: StreamTriggerName
): AsyncGenerator<LLMStreamEvent> {
	const stepId = makeStepId(meta);
	for await (const ev of promptStream) {
		yield { ...ev, triggerName: ev.triggerName ?? triggerName };

		if (ev.type === 'prompt-stream-delta') {
			const delta = (ev as { delta?: string }).delta ?? '';
			if (delta) {
				yield {
					type: 'ui-step-delta',
					uiType: UIStepType.STEPS_DISPLAY,
					stepId,
					descriptionDelta: delta,
					triggerName,
					extra: makeStepExtra(meta),
				};
			}
		}
	}
}
