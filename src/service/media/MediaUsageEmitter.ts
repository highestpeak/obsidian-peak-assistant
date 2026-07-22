/**
 * MediaUsageEmitter — narrow port for recording media-generation usage
 * events into the Usage Dashboard telemetry stream (Task V1 §R2).
 *
 * Contract:
 *   1. Composed at the app layer (main.ts / composeMediaGenerationService)
 *      as a closure over EventBus.dispatch(UsageRecordedViewEvent). No
 *      module singleton, no direct import from service code — passed via
 *      DI to `MediaGenerationService` and `MediaJobRunner`.
 *   2. Fire-and-forget: implementations MUST swallow errors so a broken
 *      telemetry sink cannot fail a media generation run. The service /
 *      runner call sites also wrap in try/catch as belt-and-braces.
 *   3. Every recorded `estimated`-confidence cost carries
 *      `metadata.costConfidence: 'estimated'` so the dashboard can render
 *      the value with an "est." caveat instead of pretending it's a
 *      settled bill. Dashboard display-side support is out of scope for
 *      this task (see task V1 report).
 *
 * The event shape mirrors what `AIQueryRewriteService.recordCandidateSelection`
 * already emits for `feature: 'query_rewrite'` — same telemetry sink,
 * same feature-tag convention (`media_generation` distinct value in
 * `UsageFeature`).
 */

import type { MediaGenerationResult } from '@/core/ports/MediaGenerationPort';
import type {
	MediaGenerationRequest,
	MediaKind,
	ResolvedMediaRoute,
} from '@/core/types/media-generation';
import type { MediaPreset } from './mediaGenerationConfig';

/** Per-run summary the emitter needs to build the usage_log row. */
export interface MediaUsageEventInput {
	/** Whether the run completed or failed (used as `action`). */
	outcome: 'success' | 'failure';
	kind: MediaKind;
	route: ResolvedMediaRoute;
	provider: string;
	modelId: string;
	jobId: string;
	/** The originating chat run — falls back to jobId when the run had none. */
	runId?: string;
	sessionId: string;
	/** Preset `estimatedCostUsd` at the time of dispatch. */
	estimatedCostUsd?: number;
	/** Preset `costConfidence` — always `'estimated'` in current presets. */
	costConfidence: MediaPreset['costConfidence'];
	/** Preset `billingUnit` (e.g. `"video"`, `"clip"`, `"image"`). */
	billingUnit: string;
	/** Total wall-clock ms for the run (submit + poll + write). */
	durationMs: number;
	/** Failure reason when `outcome === 'failure'`. */
	errorMessage?: string;
	/** Ancillary request context for the dashboard drill-in. */
	request: Pick<
		MediaGenerationRequest,
		'presetId' | 'durationSeconds' | 'quantity' | 'aspectRatio'
	>;
}

/**
 * Narrow DI shape. Implementations dispatch a UsageRecordedViewEvent so
 * `UsageTrackingService` persists the row through its EventBus listener.
 * The service/runner never import EventBus directly — this port keeps
 * the dependency at the app layer.
 */
export interface MediaUsageEmitter {
	record(input: MediaUsageEventInput): void;
}

/**
 * Convenience builder that both call sites can use to assemble the
 * `MediaUsageEventInput` from their available data. Keeps the shape in
 * one place so a future field addition edits ONE builder.
 */
export function buildMediaUsageEvent(args: {
	outcome: 'success' | 'failure';
	kind: MediaKind;
	route: ResolvedMediaRoute;
	provider: string;
	modelId: string;
	jobId: string;
	sessionId: string;
	runId?: string;
	preset: Pick<MediaPreset, 'estimatedCostUsd' | 'costConfidence' | 'billingUnit'>;
	durationMs: number;
	request: Pick<
		MediaGenerationRequest,
		'presetId' | 'durationSeconds' | 'quantity' | 'aspectRatio'
	>;
	errorMessage?: string;
}): MediaUsageEventInput {
	return {
		outcome: args.outcome,
		kind: args.kind,
		route: args.route,
		provider: args.provider,
		modelId: args.modelId,
		jobId: args.jobId,
		sessionId: args.sessionId,
		runId: args.runId,
		estimatedCostUsd: args.preset.estimatedCostUsd,
		costConfidence: args.preset.costConfidence,
		billingUnit: args.preset.billingUnit,
		durationMs: args.durationMs,
		request: args.request,
		errorMessage: args.errorMessage,
	};
}

/**
 * Optional adapter helper the service/runner can use to safely fire an
 * emitter. Swallowed errors keep the media pipeline resilient to a
 * telemetry outage.
 */
export function safeRecordMediaUsage(
	emitter: MediaUsageEmitter | undefined,
	input: MediaUsageEventInput,
): void {
	if (!emitter) return;
	try {
		emitter.record(input);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.warn('[MediaUsageEmitter] record failed:', e);
	}
}

/**
 * Derive the `MediaGenerationResult`-shaped extras that the success path
 * needs — kept as a separate helper so the service body stays readable.
 */
export function extractResultLatency(result: MediaGenerationResult | null): number {
	if (!result) return 0;
	return typeof result.latencyMs === 'number' && Number.isFinite(result.latencyMs)
		? result.latencyMs
		: 0;
}
