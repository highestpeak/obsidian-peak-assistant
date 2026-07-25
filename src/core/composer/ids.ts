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

// ── WP2: ephemeral record ids ───────────────────────────────────────────────
// Unlike block/unit ids these identify *records* (a transaction, a candidate, a
// history entry), not source positions, so they are unique per creation rather
// than content-derived. `idSeq` is a pure monotonic counter for collision-free
// ids without a uuid dependency — NOT a runtime/dependency holder (it stores no
// services or app state), so it is not the kind of module singleton the
// runtime-ownership rule forbids.

let idSeq = 0;
function nextSeq(): string {
	idSeq += 1;
	return `${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

/** Fresh id for a committed transaction. */
export function makeTransactionId(origin: string): string {
	return `txn-${origin}-${nextSeq()}`;
}

/** Fresh id for a pending candidate. */
export function makeCandidateId(): string {
	return `cand-${nextSeq()}`;
}

/** Fresh id for a candidate variant. */
export function makeVariantId(): string {
	return `var-${nextSeq()}`;
}

/** Fresh id for a History ledger entry. */
export function makeHistoryId(): string {
	return `hist-${nextSeq()}`;
}

/** Fresh id for a grouping key (typing burst / AI run parent). */
export function makeGroupId(): string {
	return `grp-${nextSeq()}`;
}
