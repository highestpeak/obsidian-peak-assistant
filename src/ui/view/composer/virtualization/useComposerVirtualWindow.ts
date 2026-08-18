import * as React from 'react';
import { flushSync } from 'react-dom';
import type { ComposerBlock } from '@/core/composer';
import type { ComposerVirtualizationConfig } from '../config/composerConfig';
import {
	ComposerBlockLayoutIndex,
	type ComposerVirtualLayoutItem,
} from './ComposerBlockLayoutIndex';
import {
	advanceComposerVirtualViewport,
	composerVirtualViewportIsCovered,
	initialComposerVirtualViewport,
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
	const [, renderMeasurements] = React.useReducer((value: number) => value + 1, 0);
	const [viewport, setViewport] = React.useState<ComposerVirtualViewport>(
		() => initialComposerVirtualViewport(config),
	);
	const sampledViewportRef = React.useRef(viewport);
	const committedViewportRef = React.useRef(viewport);
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

	const commitViewport = React.useCallback((next: ComposerVirtualViewport): void => {
		if (sameVirtualProjection(committedViewportRef.current, next)) {
			committedViewportRef.current = next;
			return;
		}
		committedViewportRef.current = next;
		flushSync(() => {
			setViewport((current) => sameVirtualProjection(current, next) ? current : next);
		});
	}, []);

	const flushMeasurements = React.useCallback(() => {
		measurementFrameRef.current = 0;
		if (pendingMeasurementsRef.current.size === 0) return;
		const measurements = pendingMeasurementsRef.current;
		pendingMeasurementsRef.current = new Map();
		const result = layout.measureBatch(measurements, sampledViewportRef.current.start);
		if (result.changedCount === 0) return;
		const scroller = scrollerFor(shellRef.current);
		let adjustedViewport = sampledViewportRef.current;
		if (scroller && Math.abs(result.anchorDelta) >= 0.5) {
			scroller.scrollTop += result.anchorDelta;
			adjustedViewport = {
				...adjustedViewport,
				start: Math.max(0, adjustedViewport.start + result.anchorDelta),
			};
			sampledViewportRef.current = adjustedViewport;
			committedViewportRef.current = adjustedViewport;
		}
		committedViewportRef.current = adjustedViewport;
		flushSync(() => {
			setViewport((current) => (
				sameVirtualProjection(current, adjustedViewport) ? current : adjustedViewport
			));
			renderMeasurements();
		});
	}, [layout, renderMeasurements, shellRef]);

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
				const blockId = element.dataset.virtualBlockId;
				const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
				if (blockId && Number.isFinite(height) && height > 0) {
					pendingMeasurementsRef.current.set(blockId, height);
				}
			}
			scheduleMeasurements(ownerWindow);
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
	}, [blocks, refreshViewportMetrics]);

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
		const next = advanceComposerVirtualViewport(sampledViewportRef.current, sample, config);
		sampledViewportRef.current = next;
		return next;
	}, [config, refreshViewportMetrics, shellRef]);

	React.useLayoutEffect(() => {
		const shell = shellRef.current;
		const blockList = blocksRef.current;
		const scroller = scrollerFor(shell);
		const ownerWindow = scroller?.ownerDocument.defaultView;
		if (!scroller || !ownerWindow) return;
		let frame = 0;
		let pendingViewport: ComposerVirtualViewport | null = null;
		const flushPendingViewport = () => {
			frame = 0;
			const next = pendingViewport;
			pendingViewport = null;
			if (next) commitViewport(next);
		};
		const scheduleViewport = (next: ComposerVirtualViewport) => {
			pendingViewport = next;
			if (frame) return;
			frame = ownerWindow.requestAnimationFrame(flushPendingViewport);
		};
		const onScroll = () => {
			const next = readViewport();
			if (composerVirtualViewportIsCovered(next, renderedCoverageRef.current)) {
				scheduleViewport(next);
				return;
			}
			pendingViewport = null;
			if (frame) ownerWindow.cancelAnimationFrame(frame);
			frame = 0;
			commitViewport(next);
		};
		const onGeometryChange = () => {
			refreshViewportMetrics();
			scheduleViewport(readViewport());
		};
		refreshViewportMetrics();
		const initial = readViewport();
		committedViewportRef.current = initial;
		setViewport(initial);
		scroller.addEventListener('scroll', onScroll, { passive: true });
		ownerWindow.addEventListener('resize', onGeometryChange);
		const resize = ownerWindow.ResizeObserver
			? new ownerWindow.ResizeObserver(onGeometryChange)
			: null;
		resize?.observe(scroller);
		if (shell) resize?.observe(shell);
		if (blockList) resize?.observe(blockList);
		return () => {
			scroller.removeEventListener('scroll', onScroll);
			ownerWindow.removeEventListener('resize', onGeometryChange);
			resize?.disconnect();
			if (frame) ownerWindow.cancelAnimationFrame(frame);
		};
	}, [blocksRef, commitViewport, readViewport, refreshViewportMetrics, shellRef]);
	const range = layout.range(viewport.start, viewport.height, pinnedBlockIds, {
		before: viewport.overscanBefore,
		after: viewport.overscanAfter,
	});
	React.useLayoutEffect(() => {
		renderedCoverageRef.current = {
			start: range.coverageStart,
			end: range.coverageEnd,
			documentEnd: range.totalHeight,
		};
	}, [range.coverageEnd, range.coverageStart, range.totalHeight]);
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
			commitViewport(readViewport());
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
		config.revealMaxFrames,
		config.revealViewportRatio,
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
		measureElement,
		revealBlock,
		insertionIndexAtClientY,
	};
}

function scrollerFor(shell: HTMLElement | null): HTMLElement | null {
	return shell?.closest<HTMLElement>('.pk-composer-main') ?? null;
}

function animationFrame(ownerWindow: Window): Promise<void> {
	return new Promise((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
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
