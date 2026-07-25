/**
 * Peak Composer — block identity across revisions (WP1).
 *
 * `makeBlockId` guarantees stability WITHIN a revision (same source → same
 * ids). Across revisions, ids change when content or position changes; to keep
 * findings / candidates / fold state attached to "the same block" after an
 * edit, we rematch new blocks to old blocks. Order of preference:
 *
 *   1. identical fingerprint (content unchanged, possibly moved) — strongest;
 *   2. same kind + same document-order ordinal (edited in place) — fallback.
 *
 * This is intentionally conservative: it never guesses across kinds. WP2 uses
 * it to carry view/selection state through a reparse without re-indexing.
 */

import type { ComposerBlock } from '@/core/composer';

export interface BlockMatch {
	/** Block id in the new snapshot. */
	newBlockId: string;
	/** Matched block id in the old snapshot, or null if this block is new. */
	oldBlockId: string | null;
	reason: 'fingerprint' | 'kind-ordinal' | 'none';
}

/**
 * Rematch `next` blocks onto `prev` blocks. Each old block is consumed at most
 * once (first fingerprint hit wins, then positional fallback).
 */
export function matchBlocks(
	prev: readonly ComposerBlock[],
	next: readonly ComposerBlock[],
): BlockMatch[] {
	const byFingerprint = new Map<string, string[]>();
	prev.forEach((b) => {
		const list = byFingerprint.get(b.source.semanticFingerprint) ?? [];
		list.push(b.blockId);
		byFingerprint.set(b.source.semanticFingerprint, list);
	});
	const consumed = new Set<string>();

	return next.map((b, index) => {
		// 1. exact content match.
		const fpCandidates = byFingerprint.get(b.source.semanticFingerprint) ?? [];
		const fpHit = fpCandidates.find((id) => !consumed.has(id));
		if (fpHit) {
			consumed.add(fpHit);
			return { newBlockId: b.blockId, oldBlockId: fpHit, reason: 'fingerprint' as const };
		}
		// 2. same kind at same ordinal (edited in place).
		const positional = prev[index];
		if (positional && positional.kind === b.kind && !consumed.has(positional.blockId)) {
			consumed.add(positional.blockId);
			return { newBlockId: b.blockId, oldBlockId: positional.blockId, reason: 'kind-ordinal' as const };
		}
		return { newBlockId: b.blockId, oldBlockId: null, reason: 'none' as const };
	});
}
