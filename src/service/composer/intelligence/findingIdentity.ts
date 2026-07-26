/**
 * Peak Composer — Intelligence finding identity (WP9, handoff §5.4 / §12.7 dedup).
 *
 * A {@link SuggestionFinding} is ONE entity shared by two surfaces: the in-body
 * mark rendered next to the prose, and the Sidecar brief item. They are two
 * projections of the SAME record in this store — never two copies of state. The
 * contract (handoff §5.4):
 *
 *   - the same `fingerprint` + `evidenceRevision` is only shown once (ingest
 *     dedup); re-ingesting supplements evidence in place, it never forks;
 *   - accepting in the body marks the finding `consumed`; ignoring from EITHER
 *     surface marks it `dismissed` for BOTH;
 *   - when the document revision drifts away from the finding's evidence, the
 *     finding is re-anchored across the reparse with {@link matchBlocks}. If the
 *     targeted block no longer maps, the finding goes `stale` — it is NEVER
 *     silently redirected to similar text.
 *
 * Ownership: instances are created by the app-composed IntelligenceRuntime per
 * open document. No module-level state, no singletons (CLAUDE.md runtime rule).
 */

import type { ComposerBlock, ComposerDocumentSnapshot, ComposerTarget } from '@/core/composer';
import { composerTargetBlockId } from '@/core/composer';
import { matchBlocks } from '../blockIdentity';

/** Lifecycle state of a finding, shared across both surfaces (handoff §5.4). */
export type SuggestionFindingState = 'active' | 'dismissed' | 'consumed' | 'stale';

/** Which projection surface an interaction originated from. */
export type FindingSurface = 'body' | 'brief';

/**
 * The single shared finding entity. The body mark and the brief item read the
 * SAME record — they carry no independent state of their own.
 */
export interface SuggestionFinding {
	readonly findingId: string;
	/** Stable content signature of the suggestion (dedup key part 1). */
	readonly fingerprint: string;
	/** Document revision the finding's evidence was computed against (dedup key part 2). */
	readonly evidenceRevision: string;
	/** Where in the document the finding is anchored. */
	readonly target: ComposerTarget;
	readonly state: SuggestionFindingState;
	/** Short human reason surfaced identically in both projections. */
	readonly reason: string;
	/** Optional capability the finding would invoke when discussed. */
	readonly capabilityId?: string;
}

/** Input to {@link ComposerFindingStore.ingest} (findingId is assigned by the store). */
export interface FindingIngestInput {
	fingerprint: string;
	evidenceRevision: string;
	target: ComposerTarget;
	reason: string;
	capabilityId?: string;
}

/** The dedup key: identical fingerprint + evidence is the same finding (§5.4). */
export function findingDedupKey(fingerprint: string, evidenceRevision: string): string {
	return `${fingerprint}::${evidenceRevision}`;
}

let findingSeq = 0;
function nextFindingId(): string {
	findingSeq += 1;
	return `cmp-find-${Date.now().toString(36)}-${findingSeq.toString(36)}`;
}

/**
 * Per-document finding store. A finding is addressed by its dedup key so a
 * second sensing pass that rediscovers the same suggestion supplements the
 * existing record instead of creating a duplicate brief item / body mark.
 */
export class ComposerFindingStore {
	/** Canonical records keyed by findingId. */
	private readonly byId = new Map<string, SuggestionFinding>();
	/** dedup key → findingId, so ingest is O(1) and never forks. */
	private readonly byDedupKey = new Map<string, string>();
	private readonly subs = new Set<(findings: readonly SuggestionFinding[]) => void>();

	/** Subscribe to the full finding list (fires immediately). */
	subscribe(cb: (findings: readonly SuggestionFinding[]) => void): () => void {
		this.subs.add(cb);
		cb(this.list());
		return () => this.subs.delete(cb);
	}

	/** All findings in insertion order (immutable copy). */
	list(): readonly SuggestionFinding[] {
		return [...this.byId.values()];
	}

	/**
	 * The body-mark projection: only findings that should paint a mark next to
	 * live prose — `active` and `stale` (a stale mark still shows so the user can
	 * see the evidence drifted). `consumed` / `dismissed` never mark the body.
	 */
	bodyMarks(): readonly SuggestionFinding[] {
		return this.list().filter((f) => f.state === 'active' || f.state === 'stale');
	}

	/**
	 * The brief projection: the same active/stale set — it is the surface that
	 * explains why. Deliberately identical to {@link bodyMarks} in membership —
	 * proving the two surfaces are one projection, not two states.
	 */
	briefItems(): readonly SuggestionFinding[] {
		return this.bodyMarks();
	}

	/** Look up a canonical record. */
	get(findingId: string): SuggestionFinding | undefined {
		return this.byId.get(findingId);
	}

	/**
	 * Ingest a discovered finding. If a finding with the same fingerprint +
	 * evidence revision already exists, its evidence is supplemented in place
	 * (reason/capability/target refreshed, state preserved) and the SAME id is
	 * returned — a re-run never produces a duplicate surface item (§12.7
	 * duplicate suppression).
	 */
	ingest(input: FindingIngestInput): SuggestionFinding {
		const key = findingDedupKey(input.fingerprint, input.evidenceRevision);
		const existingId = this.byDedupKey.get(key);
		if (existingId) {
			const existing = this.byId.get(existingId)!;
			const next: SuggestionFinding = {
				...existing,
				reason: input.reason,
				target: input.target,
				...(input.capabilityId !== undefined ? { capabilityId: input.capabilityId } : {}),
			};
			this.byId.set(existingId, next);
			this.notify();
			return next;
		}
		const finding: SuggestionFinding = {
			findingId: nextFindingId(),
			fingerprint: input.fingerprint,
			evidenceRevision: input.evidenceRevision,
			target: input.target,
			reason: input.reason,
			state: 'active',
			...(input.capabilityId !== undefined ? { capabilityId: input.capabilityId } : {}),
		};
		this.byId.set(finding.findingId, finding);
		this.byDedupKey.set(key, finding.findingId);
		this.notify();
		return finding;
	}

	/**
	 * The in-body accept path: the user accepted the suggestion in the prose. The
	 * shared record becomes `consumed`, so the brief item disappears in the same
	 * projection read (§5.4 "正文接受后 Sidecar 标 consumed").
	 */
	consume(findingId: string): void {
		this.transition(findingId, 'consumed', (s) => s === 'active' || s === 'stale');
	}

	/**
	 * Ignore from either surface. Because both projections read this single
	 * record, dismissing from the brief also removes the body mark and vice
	 * versa (§5.4 "任一 surface ignore 后另一 surface 同步 dismissed"). `_surface`
	 * is accepted for telemetry attribution only — it does not fork state.
	 */
	dismiss(findingId: string, _surface: FindingSurface): void {
		this.transition(findingId, 'dismissed', (s) => s === 'active' || s === 'stale');
	}

	/**
	 * Re-anchor every active finding across a reparse. For each finding whose
	 * evidence revision no longer equals the new document revision:
	 *   - if its target block still maps (matchBlocks: fingerprint or kind-ordinal)
	 *     the finding is re-anchored to the new block id and stays active;
	 *   - otherwise it goes `stale`. It is never redirected to unrelated text.
	 * Whole-document findings (no block anchor) go stale on any revision drift —
	 * the evidence they summarized may no longer hold. Returns the ids that
	 * turned stale (for the telemetry stale counter).
	 */
	revalidate(prev: ComposerDocumentSnapshot, next: ComposerDocumentSnapshot): readonly string[] {
		const matches = matchBlocks(prev.blocks, next.blocks);
		const oldToNew = new Map<string, string>();
		for (const m of matches) {
			if (m.oldBlockId) oldToNew.set(m.oldBlockId, m.newBlockId);
		}
		const staled: string[] = [];
		let changed = false;
		for (const [id, finding] of this.byId) {
			if (finding.state !== 'active') continue;
			if (finding.evidenceRevision === next.revision) continue; // still current
			const blockId = composerTargetBlockId(finding.target);
			if (!blockId) {
				this.byId.set(id, { ...finding, state: 'stale' });
				staled.push(id);
				changed = true;
				continue;
			}
			const newBlockId = oldToNew.get(blockId);
			const block = newBlockId ? findBlock(next.blocks, newBlockId) : undefined;
			if (!newBlockId || !block) {
				this.byId.set(id, { ...finding, state: 'stale' });
				staled.push(id);
				changed = true;
				continue;
			}
			// Re-anchor to the mapped block; evidence revision is preserved (it
			// records what the finding was computed against, immutably).
			this.byId.set(id, { ...finding, target: reanchorTarget(finding.target, newBlockId) });
			changed = true;
		}
		if (changed) this.notify();
		return staled;
	}

	private transition(
		findingId: string,
		to: SuggestionFindingState,
		allowFrom: (s: SuggestionFindingState) => boolean,
	): void {
		const existing = this.byId.get(findingId);
		if (!existing || !allowFrom(existing.state)) return;
		this.byId.set(findingId, { ...existing, state: to });
		this.notify();
	}

	private notify(): void {
		const snapshot = this.list();
		for (const cb of this.subs) cb(snapshot);
	}
}

function findBlock(blocks: readonly ComposerBlock[], blockId: string): ComposerBlock | undefined {
	return blocks.find((b) => b.blockId === blockId);
}

/** Rewrite a target's block id to the reparsed block, preserving kind + unit. */
function reanchorTarget(target: ComposerTarget, newBlockId: string): ComposerTarget {
	switch (target.kind) {
		case 'document':
			return target;
		case 'block':
			return { kind: 'block', blockId: newBlockId };
		case 'unit':
			return { kind: 'unit', blockId: newBlockId, unitId: target.unitId };
		case 'selection':
			return {
				kind: 'selection',
				blockId: newBlockId,
				...(target.unitId !== undefined ? { unitId: target.unitId } : {}),
				from: target.from,
				to: target.to,
			};
	}
}
