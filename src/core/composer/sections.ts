/**
 * Peak Composer — heading section derivation (framework-neutral, pure).
 *
 * Fold is *view state only* — it never mutates Markdown (handoff §6.3). Heading
 * folding must hide everything from a heading down to (but not including) the
 * next heading of equal-or-higher level. Rather than materialize a block tree,
 * we derive that membership on demand from the flat block stream + heading
 * levels. This keeps `ComposerBlock.children` reserved (empty) while still
 * giving the UI correct section ranges.
 */

import type { ComposerBlock } from './types';

/** True when a block is a heading (the only collapsible section owner). */
export function isHeadingBlock(block: ComposerBlock): boolean {
	return block.kind === 'heading';
}

/**
 * Block ids that belong to the section owned by `headingBlockId`: every block
 * after the heading, up to the next heading whose level is <= this heading's
 * level (or end of document). The heading itself is NOT included.
 *
 * Returns an empty array when the id is not a heading or has no following
 * content.
 */
export function sectionBlockIds(
	blocks: readonly ComposerBlock[],
	headingBlockId: string,
): string[] {
	const startIndex = blocks.findIndex((b) => b.blockId === headingBlockId);
	if (startIndex < 0) return [];
	const heading = blocks[startIndex];
	if (heading.kind !== 'heading') return [];
	const level = heading.renderModel.level ?? 1;

	const out: string[] = [];
	for (let i = startIndex + 1; i < blocks.length; i++) {
		const b = blocks[i];
		if (b.kind === 'heading' && (b.renderModel.level ?? 1) <= level) break;
		out.push(b.blockId);
	}
	return out;
}
