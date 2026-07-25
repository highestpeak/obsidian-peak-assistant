/**
 * Peak Composer — comment anchors (WP4, §7.8).
 *
 * A comment binds to a block (optionally a sub-range/selection inside it) but is
 * NOT Markdown body text — it lives beside the document via a persistence port.
 * After the source changes, every anchor is revalidated: the owning block is
 * rematched across the reparse with {@link matchBlocks} (never bare id equality,
 * per the WP1 interface note), and the anchored quote is relocated inside the
 * new block; anything that can no longer be located is marked `stale` rather
 * than silently dropped or re-pointed.
 *
 * Pure/framework-neutral; storage is injected (see commentStore + the app
 * adapter).
 */

import type { ComposerDocumentSnapshot } from '@/core/composer';
import { matchBlocks } from '../blockIdentity';
import { computeFingerprint } from '@/core/composer';

export type CommentStatus = 'active' | 'stale';

/** Where a comment is anchored. `range` absent ⇒ the whole block. */
export interface CommentAnchor {
	blockId: string;
	/** Selection sub-range within the block, in that revision's source offsets. */
	range?: { from: number; to: number };
	/** The anchored text at creation, used to relocate the anchor after edits. */
	quote: string;
	/** Fingerprint of `quote`, for a cheap unchanged check. */
	fingerprint: string;
}

export interface ComposerComment {
	commentId: string;
	anchor: CommentAnchor;
	body: string;
	status: CommentStatus;
	createdAt: number;
	updatedAt: number;
}

/** Build an anchor for a block (whole block or a sub-range selection). */
export function makeCommentAnchor(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	range?: { from: number; to: number },
): CommentAnchor | null {
	const block = snapshot.blocks.find((b) => b.blockId === blockId);
	if (!block) return null;
	const quote = range
		? snapshot.sourceText.slice(range.from, range.to)
		: snapshot.sourceText.slice(block.source.from, block.source.to);
	return { blockId, range, quote, fingerprint: computeFingerprint(quote) };
}

/**
 * Revalidate every comment against a new snapshot. Returns a new array; each
 * comment is either migrated (new blockId + relocated range, still `active`) or
 * marked `stale`.
 */
export function revalidateComments(
	comments: readonly ComposerComment[],
	prev: ComposerDocumentSnapshot,
	next: ComposerDocumentSnapshot,
): ComposerComment[] {
	const matches = matchBlocks(prev.blocks, next.blocks);
	// old blockId → new blockId (only for blocks that survived the reparse).
	const oldToNew = new Map<string, string>();
	for (const m of matches) {
		if (m.oldBlockId) oldToNew.set(m.oldBlockId, m.newBlockId);
	}

	return comments.map((comment) => relocate(comment, oldToNew, next));
}

function relocate(
	comment: ComposerComment,
	oldToNew: Map<string, string>,
	next: ComposerDocumentSnapshot,
): ComposerComment {
	const newBlockId = oldToNew.get(comment.anchor.blockId);
	const block = newBlockId ? next.blocks.find((b) => b.blockId === newBlockId) : undefined;
	if (!newBlockId || !block) return staleOf(comment);

	const blockText = next.sourceText.slice(block.source.from, block.source.to);
	// Whole-block anchor: valid as long as the block survived.
	if (!comment.anchor.range) {
		return {
			...comment,
			status: 'active',
			anchor: {
				...comment.anchor,
				blockId: newBlockId,
				quote: blockText,
				fingerprint: computeFingerprint(blockText),
			},
		};
	}

	// Sub-range anchor: relocate the quote inside the new block slice.
	const idx = blockText.indexOf(comment.anchor.quote);
	if (idx < 0) return staleOf({ ...comment, anchor: { ...comment.anchor, blockId: newBlockId } });
	const from = block.source.from + idx;
	return {
		...comment,
		status: 'active',
		anchor: {
			...comment.anchor,
			blockId: newBlockId,
			range: { from, to: from + comment.anchor.quote.length },
		},
	};
}

function staleOf(comment: ComposerComment): ComposerComment {
	return comment.status === 'stale' ? comment : { ...comment, status: 'stale' };
}
