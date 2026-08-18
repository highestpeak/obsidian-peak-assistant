import type { ComposerVirtualizationConfig } from '../config/composerConfig';

export interface ComposerVirtualViewport {
	start: number;
	height: number;
	sampledAtMs: number;
	overscanBefore: number;
	overscanAfter: number;
}

export interface ComposerVirtualViewportSample {
	start: number;
	height: number;
	sampledAtMs: number;
}

export interface ComposerVirtualCoverage {
	start: number;
	end: number;
	documentEnd: number;
}

export function initialComposerVirtualViewport(
	config: ComposerVirtualizationConfig,
): ComposerVirtualViewport {
	const baseOverscan = finiteNonNegative(config.overscanPx);
	return {
		start: 0,
		height: 0,
		sampledAtMs: 0,
		overscanBefore: baseOverscan,
		overscanAfter: baseOverscan,
	};
}

/**
 * Keep the ordinary window small, but project farther in the current scroll
 * direction when the input velocity says the next paint will travel farther.
 */
export function advanceComposerVirtualViewport(
	previous: ComposerVirtualViewport,
	sample: ComposerVirtualViewportSample,
	config: ComposerVirtualizationConfig,
): ComposerVirtualViewport {
	const start = finiteNonNegative(sample.start);
	const height = finiteNonNegative(sample.height);
	const sampledAtMs = Number.isFinite(sample.sampledAtMs)
		? sample.sampledAtMs
		: previous.sampledAtMs;
	const baseOverscan = finiteNonNegative(config.overscanPx);
	const maxOverscan = Math.max(baseOverscan, finiteNonNegative(config.maxOverscanPx));
	const lookaheadMs = finiteNonNegative(config.overscanLookaheadMs);
	const delta = start - previous.start;
	const elapsedMs = Math.max(1, sampledAtMs - previous.sampledAtMs);
	const lookaheadPx = Math.abs(delta) / elapsedMs * lookaheadMs;
	const adaptiveOverscan = Math.min(
		maxOverscan,
		baseOverscan + lookaheadPx,
	);
	const forward = delta > 0;
	const backward = delta < 0;
	return {
		start,
		height,
		sampledAtMs,
		overscanBefore: backward ? adaptiveOverscan : baseOverscan,
		overscanAfter: forward ? adaptiveOverscan : baseOverscan,
	};
}

/** A stale mounted window is safe only while it still covers the real viewport. */
export function composerVirtualViewportIsCovered(
	viewport: Pick<ComposerVirtualViewport, 'start' | 'height'>,
	coverage: ComposerVirtualCoverage,
): boolean {
	if (viewport.height <= 0) return true;
	const viewportStart = Math.min(viewport.start, coverage.documentEnd);
	const viewportEnd = Math.min(viewport.start + viewport.height, coverage.documentEnd);
	return coverage.start <= viewportStart && coverage.end >= viewportEnd;
}

function finiteNonNegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}
