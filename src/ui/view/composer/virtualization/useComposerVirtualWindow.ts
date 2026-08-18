import * as React from 'react';
import { flushSync } from 'react-dom';
import type { ComposerBlock } from '@/core/composer';
import type { ComposerVirtualizationConfig } from '../config/composerConfig';
import {
	ComposerBlockLayoutIndex,
	type ComposerVirtualLayoutItem,
} from './ComposerBlockLayoutIndex';
import {
	composerVirtualViewportIsCovered,
	composerVirtualViewportNeedsRecenter,
	decideComposerVirtualProjection,
	emergencyComposerVirtualViewport,
	initialComposerVirtualViewport,
	sampleComposerVirtualViewport,
	shouldUseComposerLightweightScrollProjection,
	settledComposerVirtualViewport,
	type ComposerVirtualCoverage,
	type ComposerVirtualViewport,
} from './ComposerVirtualScrollPolicy';

interface ComposerViewportMetrics {
	documentOrigin: number;
	scrollerTop: number;
	height: number;
	ready: boolean;
}

export interface ComposerVirtualWindow {
	items: readonly ComposerVirtualLayoutItem[];
	totalHeight: number;
	start: number;
	end: number;
	lightweightProjection: boolean;
	measureElement(blockId: string, element: HTMLElement | null): void;
	revealBlock(blockId: string, behavior?: ScrollBehavior): Promise<HTMLElement | null>;
	insertionIndexAtClientY(clientY: number): number;
}

export function useComposerVirtualWindow({
	blocks,
	shellRef,
	blocksRef,
	config,
	pinnedBlockIds,
	onScrollIntent,
}: {
	blocks: readonly ComposerBlock[];
	shellRef: React.RefObject<HTMLElement | null>;
	blocksRef: React.RefObject<HTMLElement | null>;
	config: ComposerVirtualizationConfig;
	pinnedBlockIds: ReadonlySet<string>;
	onScrollIntent?(scroller: HTMLElement): void;
}): ComposerVirtualWindow {
	const layoutRef = React.useRef<ComposerBlockLayoutIndex | null>(null);
	if (!layoutRef.current) layoutRef.current = new ComposerBlockLayoutIndex(config);
	const layout = layoutRef.current;
	layout.update(blocks, config);
	const [viewport, setViewport] = React.useState<ComposerVirtualViewport>(
		() => initialComposerVirtualViewport(config),
	);
	const [lightweightProjection, setLightweightProjection] = React.useState(false);
	const sampledViewportRef = React.useRef(viewport);
	const committedViewportRef = React.useRef(viewport);
	const lightweightProjectionRef = React.useRef(false);
	const lightweightProjectionGenerationRef = React.useRef(0);
	const pendingProjectionRef = React.useRef<ComposerVirtualViewport | null>(null);
	const projectionGenerationRef = React.useRef(0);
	const renderedSpanRef = React.useRef({ start: 0, end: 0 });
	const renderedCoverageRef = React.useRef<ComposerVirtualCoverage>({
		start: 0,
		end: 0,
		documentEnd: 0,
	});
	const viewportMetricsRef = React.useRef<ComposerViewportMetrics>({
		documentOrigin: 0,
		scrollerTop: 0,
		height: 0,
		ready: false,
	});
	const elements = React.useRef(new Map<string, HTMLElement>());
	const observer = React.useRef<ResizeObserver | null>(null);
	const pendingMeasurementsRef = React.useRef(new Map<string, number>());
	const measurementFrameRef = React.useRef(0);
	const programmaticMeasurementScrollTopRef = React.useRef<number | null>(null);
	const lightweightProjectionEligible = shouldUseComposerLightweightScrollProjection(
		blocks.length,
		config,
	);

	const beginLightweightProjection = React.useCallback((ownerWindow: Window): void => {
		if (!lightweightProjectionEligible || lightweightProjectionRef.current) return;
		lightweightProjectionRef.current = true;
		lightweightProjectionGenerationRef.current += 1;
		pendingMeasurementsRef.current.clear();
		if (measurementFrameRef.current) {
			ownerWindow.cancelAnimationFrame(measurementFrameRef.current);
			measurementFrameRef.current = 0;
		}
		flushSync(() => setLightweightProjection(true));
	}, [lightweightProjectionEligible]);

	const endLightweightProjection = React.useCallback((): void => {
		if (!lightweightProjectionRef.current) return;
		lightweightProjectionRef.current = false;
		const generation = lightweightProjectionGenerationRef.current + 1;
		lightweightProjectionGenerationRef.current = generation;
		React.startTransition(() => {
			setLightweightProjection((current) => (
				generation === lightweightProjectionGenerationRef.current ? false : current
			));
		});
	}, []);

	React.useEffect(() => {
		if (lightweightProjectionEligible || !lightweightProjectionRef.current) return;
		lightweightProjectionRef.current = false;
		lightweightProjectionGenerationRef.current += 1;
		setLightweightProjection(false);
	}, [lightweightProjectionEligible]);

	const commitViewport = React.useCallback((
		next: ComposerVirtualViewport,
		synchronous: boolean,
		force = false,
	): void => {
		if (!force && sameVirtualProjection(committedViewportRef.current, next)) {
			if (synchronous) pendingProjectionRef.current = null;
			return;
		}
		if (!synchronous && pendingProjectionRef.current) return;
		if (!synchronous) pendingProjectionRef.current = next;
		else pendingProjectionRef.current = null;
		const generation = projectionGenerationRef.current + 1;
		projectionGenerationRef.current = generation;
		const update = () => {
			setViewport((current) => {
				if (generation !== projectionGenerationRef.current) return current;
				return !force && sameVirtualProjection(current, next) ? current : { ...next };
			});
		};
		if (synchronous) {
			flushSync(update);
			return;
		}
		React.startTransition(update);
	}, []);

	React.useLayoutEffect(() => {
		committedViewportRef.current = viewport;
		pendingProjectionRef.current = null;
	}, [viewport]);

	const flushMeasurements = React.useCallback(() => {
		measurementFrameRef.current = 0;
		if (pendingMeasurementsRef.current.size === 0) return;
		const measurements = new Map(
			[...pendingMeasurementsRef.current].filter(([blockId]) => {
				const element = elements.current.get(blockId);
				return element?.dataset.virtualMeasurementSuspended !== 'true';
			}),
		);
		pendingMeasurementsRef.current = new Map();
		if (measurements.size === 0) return;
		const result = layout.measureBatch(measurements, sampledViewportRef.current.start);
		if (result.changedCount === 0) return;
		const scroller = scrollerFor(shellRef.current);
		let adjustedViewport = sampledViewportRef.current;
		if (scroller && Math.abs(result.anchorDelta) >= 0.5) {
			scroller.scrollTop += result.anchorDelta;
			programmaticMeasurementScrollTopRef.current = scroller.scrollTop;
			adjustedViewport = {
				...adjustedViewport,
				start: Math.max(0, adjustedViewport.start + result.anchorDelta),
			};
			sampledViewportRef.current = adjustedViewport;
		}
		syncMountedVirtualGeometry(layout, elements.current, blocksRef.current);
		renderedCoverageRef.current = coverageForRenderedSpan(
			layout,
			renderedSpanRef.current.start,
			renderedSpanRef.current.end,
		);
		if (!composerVirtualViewportIsCovered(
			sampledViewportRef.current,
			renderedCoverageRef.current,
		)) {
			commitViewport(
				emergencyComposerVirtualViewport(sampledViewportRef.current, config),
				true,
				true,
			);
		}
	}, [blocksRef, commitViewport, config, layout, shellRef]);

	const scheduleMeasurements = React.useCallback((ownerWindow: Window): void => {
		if (measurementFrameRef.current) return;
		measurementFrameRef.current = ownerWindow.requestAnimationFrame(flushMeasurements);
	}, [flushMeasurements]);

	React.useLayoutEffect(() => {
		const ownerWindow = shellRef.current?.ownerDocument.defaultView;
		if (!ownerWindow?.ResizeObserver) return;
		const next = new ownerWindow.ResizeObserver((entries) => {
			for (const entry of entries) {
				const element = entry.target as HTMLElement;
				if (element.dataset.virtualMeasurementSuspended === 'true') continue;
				const blockId = element.dataset.virtualBlockId;
				const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
				if (blockId && Number.isFinite(height) && height > 0) {
					pendingMeasurementsRef.current.set(blockId, height);
				}
			}
			if (pendingMeasurementsRef.current.size > 0) scheduleMeasurements(ownerWindow);
		});
		observer.current = next;
		for (const element of elements.current.values()) next.observe(element);
		return () => {
			next.disconnect();
			observer.current = null;
			if (measurementFrameRef.current) {
				ownerWindow.cancelAnimationFrame(measurementFrameRef.current);
				measurementFrameRef.current = 0;
			}
			pendingMeasurementsRef.current.clear();
		};
	}, [scheduleMeasurements, shellRef]);

	const measureElement = React.useCallback((blockId: string, element: HTMLElement | null) => {
		const previous = elements.current.get(blockId);
		if (previous === element) return;
		if (previous) observer.current?.unobserve(previous);
		if (!element) {
			elements.current.delete(blockId);
			return;
		}
		element.dataset.virtualBlockId = blockId;
		elements.current.set(blockId, element);
		observer.current?.observe(element);
	}, []);

	const refreshViewportMetrics = React.useCallback((): void => {
		const shell = shellRef.current;
		const blockList = blocksRef.current;
		const scroller = scrollerFor(shell);
		if (!blockList || !scroller) return;
		const scrollerRect = scroller.getBoundingClientRect();
		const blockRect = blockList.getBoundingClientRect();
		viewportMetricsRef.current = {
			documentOrigin: blockRect.top - scrollerRect.top + scroller.scrollTop,
			scrollerTop: scrollerRect.top,
			height: scroller.clientHeight,
			ready: true,
		};
	}, [blocksRef, shellRef]);

	React.useLayoutEffect(() => {
		refreshViewportMetrics();
	});

	const readViewport = React.useCallback((): ComposerVirtualViewport => {
		const scroller = scrollerFor(shellRef.current);
		if (!scroller) return sampledViewportRef.current;
		if (!viewportMetricsRef.current.ready) refreshViewportMetrics();
		const metrics = viewportMetricsRef.current;
		const ownerWindow = scroller.ownerDocument.defaultView;
		const sample = {
			start: Math.max(0, scroller.scrollTop - metrics.documentOrigin),
			height: metrics.height || scroller.clientHeight,
			sampledAtMs: ownerWindow?.performance.now() ?? sampledViewportRef.current.sampledAtMs,
		};
		const next = sampleComposerVirtualViewport(sampledViewportRef.current, sample);
		sampledViewportRef.current = next;
		return next;
	}, [refreshViewportMetrics, shellRef]);

	React.useLayoutEffect(() => {
		const shell = shellRef.current;
		const scroller = scrollerFor(shell);
		const ownerWindow = scroller?.ownerDocument.defaultView;
		if (!scroller || !ownerWindow) return;
		let idleTimer = 0;
		const scheduleSettledProjection = () => {
			if (idleTimer) ownerWindow.clearTimeout(idleTimer);
			idleTimer = ownerWindow.setTimeout(() => {
				idleTimer = 0;
				const latest = sampledViewportRef.current;
				const committed = committedViewportRef.current;
				const emergencyMounted = committed.overscanBefore < config.overscanPx
					|| committed.overscanAfter < config.overscanPx;
				const needsRecenter = composerVirtualViewportNeedsRecenter(
					latest,
					renderedCoverageRef.current,
					config.recenterThresholdPx,
				);
				if (emergencyMounted || needsRecenter) {
					commitViewport(
						settledComposerVirtualViewport(latest, config),
						false,
					);
				}
				endLightweightProjection();
			}, config.scrollIdleMs);
		};
		const projectSample = (next: ComposerVirtualViewport) => {
			const decision = decideComposerVirtualProjection(
				next,
				renderedCoverageRef.current,
				config.recenterThresholdPx,
			);
			recordVirtualProjectionDecision(blocksRef.current, decision);
			if (decision === 'emergency') {
				commitViewport(emergencyComposerVirtualViewport(next, config), true);
				return;
			}
			if (decision === 'recenter') {
				commitViewport(settledComposerVirtualViewport(next, config), false);
			}
		};
		const onScroll = () => {
			const measurementScrollTop = programmaticMeasurementScrollTopRef.current;
			if (
				measurementScrollTop !== null
				&& Math.abs(scroller.scrollTop - measurementScrollTop) < 0.5
			) {
				programmaticMeasurementScrollTopRef.current = null;
				return;
			}
			programmaticMeasurementScrollTopRef.current = null;
			beginLightweightProjection(ownerWindow);
			projectSample(readViewport());
			scheduleSettledProjection();
		};
		const onGeometryChange = () => {
			refreshViewportMetrics();
			projectSample(readViewport());
		};
		refreshViewportMetrics();
		const initial = settledComposerVirtualViewport(readViewport(), config);
		sampledViewportRef.current = initial;
		committedViewportRef.current = initial;
		setViewport(initial);
		scroller.addEventListener('scroll', onScroll, { passive: true });
		ownerWindow.addEventListener('resize', onGeometryChange);
		const resize = ownerWindow.ResizeObserver
			? new ownerWindow.ResizeObserver(onGeometryChange)
			: null;
		resize?.observe(scroller);
		return () => {
			scroller.removeEventListener('scroll', onScroll);
			ownerWindow.removeEventListener('resize', onGeometryChange);
			resize?.disconnect();
			if (idleTimer) ownerWindow.clearTimeout(idleTimer);
		};
	}, [
		beginLightweightProjection,
		blocksRef,
		commitViewport,
		config,
		endLightweightProjection,
		readViewport,
		refreshViewportMetrics,
		shellRef,
	]);
	const range = layout.range(viewport.start, viewport.height, pinnedBlockIds, {
		before: viewport.overscanBefore,
		after: viewport.overscanAfter,
	});
	React.useLayoutEffect(() => {
		renderedSpanRef.current = { start: range.start, end: range.end };
		renderedCoverageRef.current = coverageForRenderedSpan(layout, range.start, range.end);
		syncMountedVirtualGeometry(layout, elements.current, blocksRef.current);
	}, [blocksRef, layout, range.end, range.start, range.totalHeight]);
	const revealBlock = React.useCallback(async (
		blockId: string,
		behavior: ScrollBehavior = 'auto',
	): Promise<HTMLElement | null> => {
		const shell = shellRef.current;
		const blockList = blocksRef.current;
		const scroller = scrollerFor(shell);
		const offset = layout.offsetOf(blockId);
		if (!shell || !blockList || !scroller || offset === null) return null;
		if (!viewportMetricsRef.current.ready) refreshViewportMetrics();
		const top = Math.max(
			0,
			viewportMetricsRef.current.documentOrigin
				+ offset
				- scroller.clientHeight * config.revealViewportRatio,
		);
		onScrollIntent?.(scroller);
		scroller.scrollTo({ top, behavior });
		const ownerWindow = shell.ownerDocument.defaultView;
		if (!ownerWindow) return null;
		for (let frame = 0; frame < config.revealMaxFrames; frame += 1) {
			const next = readViewport();
			if (!composerVirtualViewportIsCovered(next, renderedCoverageRef.current)) {
				commitViewport(emergencyComposerVirtualViewport(next, config), true);
			}
			await animationFrame(ownerWindow);
			const target = shell.querySelector<HTMLElement>(
				`[data-block-id="${CSS.escape(blockId)}"]`,
			);
			if (target) return target;
		}
		return null;
	}, [
		blocksRef,
		commitViewport,
		config,
		layout,
		onScrollIntent,
		readViewport,
		refreshViewportMetrics,
		shellRef,
	]);

	const insertionIndexAtClientY = React.useCallback((clientY: number): number => {
		const shell = shellRef.current;
		const blockList = blocksRef.current;
		const scroller = scrollerFor(shell);
		if (!blockList || !scroller) return layout.length;
		if (!viewportMetricsRef.current.ready) refreshViewportMetrics();
		const metrics = viewportMetricsRef.current;
		const documentOffset = clientY
			- metrics.scrollerTop
			+ scroller.scrollTop
			- metrics.documentOrigin;
		return layout.insertionIndexAtOffset(documentOffset);
	}, [blocksRef, layout, refreshViewportMetrics, shellRef]);

	return {
		items: range.items,
		totalHeight: range.totalHeight,
		start: range.start,
		end: range.end,
		lightweightProjection,
		measureElement,
		revealBlock,
		insertionIndexAtClientY,
	};
}

function recordVirtualProjectionDecision(
	blockList: HTMLElement | null,
	decision: 'none' | 'recenter' | 'emergency',
): void {
	if (!blockList) return;
	blockList.dataset.virtualProjectionDecision = decision;
	if (decision !== 'emergency') return;
	const previous = Number.parseInt(blockList.dataset.virtualEmergencyCount ?? '0', 10);
	blockList.dataset.virtualEmergencyCount = String(Number.isFinite(previous) ? previous + 1 : 1);
}

function scrollerFor(shell: HTMLElement | null): HTMLElement | null {
	return shell?.closest<HTMLElement>('.pk-composer-main') ?? null;
}

function animationFrame(ownerWindow: Window): Promise<void> {
	return new Promise((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
}

function syncMountedVirtualGeometry(
	layout: ComposerBlockLayoutIndex,
	elements: ReadonlyMap<string, HTMLElement>,
	blockList: HTMLElement | null,
): void {
	if (blockList) {
		blockList.style.height = `${layout.totalHeight}px`;
		blockList.dataset.totalHeight = String(Math.round(layout.totalHeight));
	}
	for (const [blockId, element] of elements) {
		const offset = layout.offsetOf(blockId);
		if (offset === null) continue;
		element.style.top = `${offset}px`;
		element.dataset.virtualOffset = String(Math.round(offset));
	}
}

function coverageForRenderedSpan(
	layout: ComposerBlockLayoutIndex,
	start: number,
	end: number,
): ComposerVirtualCoverage {
	const boundedStart = Math.max(0, Math.min(start, layout.length));
	const boundedEnd = Math.max(boundedStart, Math.min(end, layout.length));
	if (boundedStart === boundedEnd) {
		return { start: 0, end: 0, documentEnd: layout.totalHeight };
	}
	const first = layout.blockAt(boundedStart);
	const last = layout.blockAt(boundedEnd - 1);
	if (!first || !last) return { start: 0, end: 0, documentEnd: layout.totalHeight };
	const coverageStart = layout.offsetOf(first.blockId) ?? 0;
	const lastOffset = layout.offsetOf(last.blockId) ?? coverageStart;
	const lastHeight = layout.heightOf(last.blockId) ?? 0;
	return {
		start: coverageStart,
		end: lastOffset + lastHeight,
		documentEnd: layout.totalHeight,
	};
}

function sameVirtualProjection(
	left: ComposerVirtualViewport,
	right: ComposerVirtualViewport,
): boolean {
	return left.start === right.start
		&& left.height === right.height
		&& left.overscanBefore === right.overscanBefore
		&& left.overscanAfter === right.overscanAfter;
}
