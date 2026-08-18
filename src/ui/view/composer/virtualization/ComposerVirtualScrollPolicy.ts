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

export type ComposerVirtualProjectionDecision = 'none' | 'recenter' | 'emergency';

export function initialComposerVirtualViewport(
	config: ComposerVirtualizationConfig,
): ComposerVirtualViewport {
	return settledComposerVirtualViewport({
		start: 0,
		height: 0,
		sampledAtMs: 0,
	}, config);
}

/** Sampling the compositor scroll position never changes the committed window size. */
export function sampleComposerVirtualViewport(
	previous: ComposerVirtualViewport,
	sample: ComposerVirtualViewportSample,
): ComposerVirtualViewport {
	const start = finiteNonNegative(sample.start);
	const height = finiteNonNegative(sample.height);
	const sampledAtMs = Number.isFinite(sample.sampledAtMs)
		? sample.sampledAtMs
		: previous.sampledAtMs;
	return {
		start,
		height,
		sampledAtMs,
		overscanBefore: finiteNonNegative(previous.overscanBefore),
		overscanAfter: finiteNonNegative(previous.overscanAfter),
	};
}

export function emergencyComposerVirtualViewport(
	viewport: Pick<ComposerVirtualViewport, 'start' | 'height' | 'sampledAtMs'>,
	config: ComposerVirtualizationConfig,
): ComposerVirtualViewport {
	return withOverscan(viewport, config.emergencyOverscanPx);
}

export function settledComposerVirtualViewport(
	viewport: Pick<ComposerVirtualViewport, 'start' | 'height' | 'sampledAtMs'>,
	config: ComposerVirtualizationConfig,
): ComposerVirtualViewport {
	return withOverscan(viewport, config.overscanPx);
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

/** Recenter only near a real document edge of the mounted coverage window. */
export function composerVirtualViewportNeedsRecenter(
	viewport: Pick<ComposerVirtualViewport, 'start' | 'height'>,
	coverage: ComposerVirtualCoverage,
	thresholdPx: number,
): boolean {
	if (!composerVirtualViewportIsCovered(viewport, coverage)) return true;
	const threshold = finiteNonNegative(thresholdPx);
	const viewportStart = Math.min(viewport.start, coverage.documentEnd);
	const viewportEnd = Math.min(viewport.start + viewport.height, coverage.documentEnd);
	const nearStart = viewportStart > 0 && viewportStart - coverage.start < threshold;
	const nearEnd = viewportEnd < coverage.documentEnd && coverage.end - viewportEnd < threshold;
	return nearStart || nearEnd;
}

export function decideComposerVirtualProjection(
	viewport: Pick<ComposerVirtualViewport, 'start' | 'height'>,
	coverage: ComposerVirtualCoverage,
	recenterThresholdPx: number,
): ComposerVirtualProjectionDecision {
	if (!composerVirtualViewportIsCovered(viewport, coverage)) return 'emergency';
	if (composerVirtualViewportNeedsRecenter(viewport, coverage, recenterThresholdPx)) {
		return 'recenter';
	}
	return 'none';
}

export function shouldUseComposerStaticProjection(
	blockCount: number,
	config: ComposerVirtualizationConfig,
): boolean {
	const threshold = Math.max(1, Math.floor(finiteNonNegative(config.staticProjectionMinBlocks)));
	return Number.isFinite(blockCount) && blockCount >= threshold;
}

function withOverscan(
	viewport: Pick<ComposerVirtualViewport, 'start' | 'height' | 'sampledAtMs'>,
	overscanPx: number,
): ComposerVirtualViewport {
	const overscan = finiteNonNegative(overscanPx);
	return {
		start: finiteNonNegative(viewport.start),
		height: finiteNonNegative(viewport.height),
		sampledAtMs: Number.isFinite(viewport.sampledAtMs) ? viewport.sampledAtMs : 0,
		overscanBefore: overscan,
		overscanAfter: overscan,
	};
}

function finiteNonNegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}
