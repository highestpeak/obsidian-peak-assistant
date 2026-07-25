/**
 * Peak Composer — id & fingerprint utilities (framework-neutral).
 *
 * Stability contract:
 *   - `computeFingerprint` is the block/unit content hash used in every
 *     `SourceAnchor.semanticFingerprint`. WP2 revalidates it before patching.
 *   - `makeBlockId` is deterministic given `(kind, ordinal, fingerprint)`, so
 *     parsing the SAME source twice yields identical block ids — the
 *     "stable within one revision" guarantee from the domain model (§5.1).
 *     Cross-revision stability is a *rematch* problem (fingerprint + ordinal),
 *     handled by `blockIdentity` in the service layer, not by the id itself.
 */

import { hashSHA256 } from '@/core/utils/hash-utils';

/** SHA-256 content fingerprint of a verbatim byte slice. */
export function computeFingerprint(text: string): string {
	return hashSHA256(text);
}

/**
 * A revision id derived from the full document source. Two byte-identical
 * documents share a revision; any external edit changes it. Used by the source
 * revision service to detect stale snapshots.
 */
export function computeRevision(sourceText: string): string {
	return `r-${hashSHA256(sourceText).slice(0, 16)}`;
}

/**
 * Deterministic block id. `ordinal` is the block's document-order index within
 * the parse, and the short fingerprint disambiguates blocks with identical
 * kind+position across revisions.
 */
export function makeBlockId(kind: string, ordinal: number, fingerprint: string): string {
	return `${kind}-${ordinal}-${fingerprint.slice(0, 8)}`;
}

/**
 * Deterministic sub-unit id, unique within its block. `path` segments encode
 * nesting (`li-0`, `li-0.1`) or grid coordinates (`cell-r1c2`).
 */
export function makeUnitId(prefix: string, ...path: Array<string | number>): string {
	return path.length ? `${prefix}-${path.join('.')}` : prefix;
}
