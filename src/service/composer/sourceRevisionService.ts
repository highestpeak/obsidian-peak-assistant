/**
 * Peak Composer — source revision service (WP1).
 *
 * Owns revision computation and staleness / anchor-drift detection. This is the
 * guard that WP2's atomic writeback leans on: before a block patch is applied,
 * the anchor fingerprint is revalidated against the LIVE source. If the file
 * was modified externally (or by the other editor) the snapshot is stale and
 * the caller must revalidate / re-run instead of blindly overwriting.
 *
 * Pure logic, no I/O — the caller supplies the current text (read via a port).
 */

import { computeFingerprint, computeRevision, type ComposerDocumentSnapshot } from '@/core/composer';

export type AnchorValidation = 'valid' | 'drifted' | 'missing';

export class ComposerSourceRevisionService {
	/** Revision id for a document's current bytes. */
	computeRevision(sourceText: string): string {
		return computeRevision(sourceText);
	}

	/**
	 * True when the live source no longer matches the snapshot it was parsed
	 * from — i.e. an external modification happened since the snapshot.
	 */
	isExternallyModified(snapshot: ComposerDocumentSnapshot, currentText: string): boolean {
		return this.computeRevision(currentText) !== snapshot.revision;
	}

	/**
	 * Revalidate a single block's anchor against the live source. `valid` means
	 * the bytes at `[from,to)` still hash to the recorded fingerprint (safe to
	 * patch); `drifted` means the region changed; `missing` means the range no
	 * longer exists (file shrank).
	 */
	revalidateAnchor(
		snapshot: ComposerDocumentSnapshot,
		blockId: string,
		currentText: string,
	): AnchorValidation {
		const block = snapshot.blocks.find((b) => b.blockId === blockId);
		if (!block) return 'missing';
		const { from, to, semanticFingerprint } = block.source;
		if (to > currentText.length) return 'missing';
		const slice = currentText.slice(from, to);
		return computeFingerprint(slice) === semanticFingerprint ? 'valid' : 'drifted';
	}
}
