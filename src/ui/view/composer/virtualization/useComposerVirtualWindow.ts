import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';
import type { ComposerVirtualizationConfig } from '../config/composerConfig';
import {
	ComposerBlockLayoutIndex,
	type ComposerVirtualLayoutItem,
} from './ComposerBlockLayoutIndex';

interface VirtualViewport {
	start: number;
	height: number;
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
	const [viewport, setViewport] = React.useState<VirtualViewport>({ start: 0, height: 0 });
	const viewportRef = React.useRef(viewport);
	viewportRef.current = viewport;
	const elements = React.useRef(new Map<string, HTMLElement>());
	const observer = React.useRef<ResizeObserver | null>(null);

	const measure = React.useCallback((blockId: string, element: HTMLElement) => {
		const ownerWindow = element.ownerDocument.defaultView;
		if (!ownerWindow) return;
		const style = ownerWindow.getComputedStyle(element);
		const marginTop = Number.parseFloat(style.marginTop) || 0;
		const marginBottom = Number.parseFloat(style.marginBottom) || 0;
		const height = element.getBoundingClientRect().height + marginTop + marginBottom;
		const previousHeight = layout.heightOf(blockId);
		const offset = layout.offsetOf(blockId);
		if (!layout.measure(blockId, height)) return;
		if (previousHeight !== null && offset !== null && offset < viewportRef.current.start) {
			const scroller = scrollerFor(shellRef.current);
			if (scroller) scroller.scrollTop += height - previousHeight;
		}
		renderMeasurements();
	}, [layout, shellRef]);

	React.useLayoutEffect(() => {
		const ownerWindow = shellRef.current?.ownerDocument.defaultView;
		if (!ownerWindow?.ResizeObserver) return;
		const next = new ownerWindow.ResizeObserver((entries) => {
			for (const entry of entries) {
				const element = entry.target as HTMLElement;
				const blockId = element.dataset.virtualBlockId;
				if (blockId) measure(blockId, element);
			}
		});
		observer.current = next;
		for (const element of elements.current.values()) next.observe(element);
		return () => {
			next.disconnect();
			observer.current = null;
		};
	}, [measure, shellRef]);

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
		measure(blockId, element);
	}, [measure]);

	const readViewport = React.useCallback((): VirtualViewport => {
		const shell = shellRef.current;
		const blockList = blocksRef.current;
		const scroller = scrollerFor(shell);
		if (!blockList || !scroller) return { start: 0, height: 0 };
		const scrollerRect = scroller.getBoundingClientRect();
		const blockRect = blockList.getBoundingClientRect();
		return {
			start: Math.max(0, scrollerRect.top - blockRect.top),
			height: scroller.clientHeight,
		};
	}, [blocksRef, shellRef]);

	React.useLayoutEffect(() => {
		const scroller = scrollerFor(shellRef.current);
		const ownerWindow = scroller?.ownerDocument.defaultView;
		if (!scroller || !ownerWindow) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			setViewport(readViewport());
		};
		const schedule = () => {
			if (frame) return;
			frame = ownerWindow.requestAnimationFrame(update);
		};
		update();
		scroller.addEventListener('scroll', schedule, { passive: true });
		ownerWindow.addEventListener('resize', schedule);
		const resize = ownerWindow.ResizeObserver
			? new ownerWindow.ResizeObserver(schedule)
			: null;
		resize?.observe(scroller);
		return () => {
			scroller.removeEventListener('scroll', schedule);
			ownerWindow.removeEventListener('resize', schedule);
			resize?.disconnect();
			if (frame) ownerWindow.cancelAnimationFrame(frame);
		};
	}, [readViewport, shellRef]);

	const range = layout.range(viewport.start, viewport.height, pinnedBlockIds);
	const revealBlock = React.useCallback(async (
		blockId: string,
		behavior: ScrollBehavior = 'auto',
	): Promise<HTMLElement | null> => {
		const shell = shellRef.current;
		const blockList = blocksRef.current;
		const scroller = scrollerFor(shell);
		const offset = layout.offsetOf(blockId);
		if (!shell || !blockList || !scroller || offset === null) return null;
		const scrollerRect = scroller.getBoundingClientRect();
		const blockRect = blockList.getBoundingClientRect();
		const origin = blockRect.top - scrollerRect.top + scroller.scrollTop;
		const top = Math.max(0, origin + offset - scroller.clientHeight * config.revealViewportRatio);
		onScrollIntent?.(scroller);
		scroller.scrollTo({ top, behavior });
		const ownerWindow = shell.ownerDocument.defaultView;
		if (!ownerWindow) return null;
		for (let frame = 0; frame < config.revealMaxFrames; frame += 1) {
			setViewport(readViewport());
			await animationFrame(ownerWindow);
			const target = shell.querySelector<HTMLElement>(
				`[data-block-id="${CSS.escape(blockId)}"]`,
			);
			if (target) return target;
		}
		return null;
	}, [
		blocksRef,
		config.revealMaxFrames,
		config.revealViewportRatio,
		layout,
		onScrollIntent,
		readViewport,
		shellRef,
	]);

	const insertionIndexAtClientY = React.useCallback((clientY: number): number => {
		const shell = shellRef.current;
		const blockList = blocksRef.current;
		const scroller = scrollerFor(shell);
		if (!blockList || !scroller) return layout.length;
		const scrollerRect = scroller.getBoundingClientRect();
		const blockRect = blockList.getBoundingClientRect();
		const origin = blockRect.top - scrollerRect.top + scroller.scrollTop;
		const documentOffset = clientY - scrollerRect.top + scroller.scrollTop - origin;
		return layout.insertionIndexAtOffset(documentOffset);
	}, [blocksRef, layout, shellRef]);

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
