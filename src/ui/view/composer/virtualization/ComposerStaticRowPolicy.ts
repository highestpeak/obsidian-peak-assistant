import type { ComposerBlockKind } from '@/core/composer';

const STATIC_BLOCK_ROW_KINDS = new Set<ComposerBlockKind>([
	'paragraph',
	'heading',
	'quote',
	'callout',
	'list',
	'task',
]);

/**
 * Decide whether a virtual row can use the low-allocation visual shell.
 * Stateful rows stay on ComposerBlockRow so editors, AI review, findings and
 * failure recovery never disappear merely because the document is long.
 */
export function shouldUseComposerStaticBlockRow(
	staticProjection: boolean,
	rowEditing: boolean,
	blockKind: ComposerBlockKind,
	candidateCount: number,
	findingCount: number,
	hasInvokeError: boolean,
): boolean {
	if (!staticProjection || rowEditing) return false;
	if (candidateCount > 0 || findingCount > 0 || hasInvokeError) return false;
	return STATIC_BLOCK_ROW_KINDS.has(blockKind);
}
