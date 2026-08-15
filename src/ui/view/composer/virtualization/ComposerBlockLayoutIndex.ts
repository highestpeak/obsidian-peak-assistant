import type { ComposerBlock, ComposerBlockKind } from '@/core/composer';
import type { ComposerVirtualizationConfig } from '../config/composerConfig';
import { matchBlocks } from '@/service/composer';

export interface ComposerVirtualLayoutItem {
	blockId: string;
	index: number;
	offset: number;
	height: number;
}

export interface ComposerVirtualRange {
	start: number;
	end: number;
	items: readonly ComposerVirtualLayoutItem[];
	totalHeight: number;
}

/** Variable-height, DOM-free layout truth for the complete visible block list. */
export class ComposerBlockLayoutIndex {
	private blocks: readonly ComposerBlock[] = [];
	private readonly measured = new Map<string, number>();
	private offsets: number[] = [];
	private heights: number[] = [];
	private indexById = new Map<string, number>();
	private total = 0;

	constructor(private config: ComposerVirtualizationConfig) {}

	update(blocks: readonly ComposerBlock[], config = this.config): void {
		if (blocks === this.blocks && config === this.config) return;
		const previousBlocks = this.blocks;
		this.config = config;
		this.blocks = blocks;
		for (const match of matchBlocks(previousBlocks, blocks)) {
			if (!match.oldBlockId || this.measured.has(match.newBlockId)) continue;
			const previousHeight = this.measured.get(match.oldBlockId);
			if (previousHeight !== undefined) this.measured.set(match.newBlockId, previousHeight);
		}
		const liveIds = new Set(blocks.map((block) => block.blockId));
		for (const id of this.measured.keys()) {
			if (!liveIds.has(id)) this.measured.delete(id);
		}
		this.rebuild();
	}

	measure(blockId: string, height: number): boolean {
		if (!Number.isFinite(height) || height <= 0) return false;
		const index = this.indexById.get(blockId);
		if (index === undefined) return false;
		const current = this.measured.get(blockId);
		if (current !== undefined && Math.abs(current - height) < 0.5) return false;
		this.measured.set(blockId, height);
		this.rebuild(index);
		return true;
	}

	get length(): number {
		return this.blocks.length;
	}

	get totalHeight(): number {
		return this.total;
	}

	indexOf(blockId: string): number | null {
		return this.indexById.get(blockId) ?? null;
	}

	offsetOf(blockId: string): number | null {
		const index = this.indexById.get(blockId);
		return index === undefined ? null : this.offsets[index];
	}

	heightOf(blockId: string): number | null {
		const index = this.indexById.get(blockId);
		return index === undefined ? null : this.heights[index];
	}

	blockAt(index: number): ComposerBlock | undefined {
		return this.blocks[index];
	}

	insertionIndexAtOffset(offset: number): number {
		if (this.blocks.length === 0) return 0;
		const index = this.indexAtOffset(offset);
		const midpoint = this.offsets[index] + this.heights[index] / 2;
		return offset < midpoint ? index : index + 1;
	}

	range(
		viewportStart: number,
		viewportHeight: number,
		pinnedBlockIds: ReadonlySet<string> = new Set(),
	): ComposerVirtualRange {
		if (this.blocks.length === 0) {
			return { start: 0, end: 0, items: [], totalHeight: 0 };
		}
		const overscanStart = Math.max(0, viewportStart - this.config.overscanPx);
		const overscanEnd = Math.max(
			overscanStart,
			viewportStart + Math.max(0, viewportHeight) + this.config.overscanPx,
		);
		const start = this.indexAtOffset(overscanStart);
		const end = Math.min(this.blocks.length, this.indexAtOffset(overscanEnd) + 1);
		const indices = new Set<number>();
		for (let index = start; index < end; index += 1) indices.add(index);
		for (const blockId of pinnedBlockIds) {
			const index = this.indexById.get(blockId);
			if (index !== undefined) indices.add(index);
		}
		const items = [...indices]
			.sort((left, right) => left - right)
			.map((index) => ({
				blockId: this.blocks[index].blockId,
				index,
				offset: this.offsets[index],
				height: this.heights[index],
			}));
		return { start, end, items, totalHeight: this.total };
	}

	private indexAtOffset(offset: number): number {
		const bounded = Math.max(0, Math.min(offset, Math.max(0, this.total - 1)));
		let low = 0;
		let high = this.offsets.length - 1;
		while (low < high) {
			const middle = Math.floor((low + high + 1) / 2);
			if (this.offsets[middle] <= bounded) low = middle;
			else high = middle - 1;
		}
		return low;
	}

	private rebuild(fromIndex = 0): void {
		const start = Math.max(0, Math.min(fromIndex, this.blocks.length));
		if (start === 0) {
			this.offsets = new Array(this.blocks.length);
			this.heights = new Array(this.blocks.length);
			this.indexById = new Map();
		}
		let offset = start === 0
			? 0
			: this.offsets[start - 1] + this.heights[start - 1];
		for (let index = start; index < this.blocks.length; index += 1) {
			const block = this.blocks[index];
			this.indexById.set(block.blockId, index);
			const height = this.measured.get(block.blockId) ?? this.estimate(block.kind);
			this.offsets[index] = offset;
			this.heights[index] = height;
			offset += height;
		}
		this.total = offset;
	}

	private estimate(kind: ComposerBlockKind): number {
		return this.config.kindHeightPx[kind] ?? this.config.defaultBlockHeightPx;
	}
}

/** Owner-scoped pins keep only truly DOM-dependent rows alive. */
export class ComposerHardPinRegistry {
	private readonly byOwner = new Map<string, { blockId: string; critical: boolean }>();

	constructor(private maxPins: number) {}

	setLimit(maxPins: number): void {
		if (Number.isFinite(maxPins) && maxPins > 0) this.maxPins = maxPins;
	}

	acquire(owner: string, blockId: string, critical = false): boolean {
		const previous = this.byOwner.get(owner);
		if (previous?.blockId === blockId) return true;
		const nextBlocks = new Set([...this.byOwner.values()].map((pin) => pin.blockId));
		if (previous) nextBlocks.delete(previous.blockId);
		if (!nextBlocks.has(blockId) && nextBlocks.size >= this.maxPins && !critical) return false;
		this.byOwner.set(owner, { blockId, critical });
		return true;
	}

	release(owner: string): void {
		this.byOwner.delete(owner);
	}

	clear(): void {
		this.byOwner.clear();
	}

	blocks(): ReadonlySet<string> {
		return new Set([...this.byOwner.values()].map((pin) => pin.blockId));
	}
}
