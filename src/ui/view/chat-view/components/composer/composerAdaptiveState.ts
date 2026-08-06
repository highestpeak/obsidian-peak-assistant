export interface ScrollMetrics {
	scrollHeight: number;
	clientHeight: number;
	scrollTop: number;
}

export type AdaptiveComposerDisplay = 'compact' | 'expanded';

export interface AdaptiveComposerInput {
	activePlacement: boolean;
	nearBottom: boolean;
	focused: boolean;
	hasDraft: boolean;
	hasAttachments: boolean;
	hasOpenSurface: boolean;
	hasActiveRun: boolean;
}

export function distanceFromBottom(metrics: ScrollMetrics): number {
	return Math.max(0, metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop);
}

export function isTimelineNearBottom(metrics: ScrollMetrics, thresholdPx: number): boolean {
	return distanceFromBottom(metrics) <= Math.max(0, thresholdPx);
}

export function resolveAdaptiveComposerDisplay(input: AdaptiveComposerInput): AdaptiveComposerDisplay {
	if (!input.activePlacement) return 'expanded';
	if (input.nearBottom) return 'expanded';
	if (input.focused) return 'expanded';
	if (input.hasDraft) return 'expanded';
	if (input.hasAttachments) return 'expanded';
	if (input.hasOpenSurface) return 'expanded';
	if (input.hasActiveRun) return 'expanded';
	return 'compact';
}

export function canScrollInDirection(metrics: ScrollMetrics, deltaY: number, edgePx: number): boolean {
	if (Math.abs(deltaY) < 0.01) return false;
	if (metrics.scrollHeight <= metrics.clientHeight + 1) return false;
	if (deltaY < 0) return metrics.scrollTop > Math.max(0, edgePx);
	return distanceFromBottom(metrics) > Math.max(0, edgePx);
}

export function metricsForElement(element: Element): ScrollMetrics {
	const node = element as HTMLElement;
	return {
		scrollHeight: node.scrollHeight,
		clientHeight: node.clientHeight,
		scrollTop: node.scrollTop,
	};
}
