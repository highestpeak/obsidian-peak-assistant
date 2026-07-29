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
export type SuggestionFindingState = 'active' | 'ignored' | 'dismissed' | 'consumed' | 'stale';

/** Which projection surface an interaction originated from. */
export type FindingSurface = 'body' | 'brief';

/**
 * Optional, producer-owned presentation for the Brief projection. The canonical
 * `reason` remains the shared body/brief explanation; this record carries the
 * richer hierarchy when a producer has real source-backed values for it.
 */
export interface FindingBriefPresentation {
	readonly title: string;
	readonly summary: string;
	readonly targetLabel: string;
	readonly evidenceLabel: string;
	/** Lower values sort earlier. Producers must not treat this as an AI confidence score. */
	readonly priority: number;
}

export type FindingBodyTone = 'violet' | 'teal' | 'amber' | 'red';

/**
 * Concrete in-document presentation. This is intentionally specific (Claim,
 * Evidence, broken link, task, …) so the body never falls back to a vague
 * catch-all "AI 建议" badge.
 */
export interface FindingBodyPresentation {
	readonly label: string;
	readonly statusLabel: string;
	readonly title: string;
	readonly detail?: string;
	readonly provenance?: string;
	readonly issueLabel?: string;
	readonly tone: FindingBodyTone;
}

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
	/**
	 * App-owned producer identity. It prevents one producer's refresh from
	 * rewriting a coincidentally identical finding owned by another producer.
	 */
	readonly producerId?: string;
	/** Optional richer copy for the Brief; absent producers retain the legacy reason. */
	readonly brief?: FindingBriefPresentation;
	/** Optional concrete copy for the in-body finding badge and review panel. */
	readonly body?: FindingBodyPresentation;
	/** Deferred items stay active, but sort after non-deferred items in the Brief. */
	readonly deferredAt?: number;
}

/** Input to {@link ComposerFindingStore.ingest} (findingId is assigned by the store). */
export interface FindingIngestInput {
	fingerprint: string;
	evidenceRevision: string;
	target: ComposerTarget;
	reason: string;
	capabilityId?: string;
	producerId?: string;
	brief?: FindingBriefPresentation;
	body?: FindingBodyPresentation;
	deferredAt?: number;
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
	/**
	 * Cached immutable list, invalidated by {@link notify}. `list()` is used
	 * directly as a `useSyncExternalStore` getSnapshot — it MUST return the same
	 * reference until the store actually changes, or React loops on the "new"
	 * snapshot every render (minified error #185, hit in real Obsidian).
	 */
	private cachedList: readonly SuggestionFinding[] | null = null;

	/** Subscribe to the full finding list (fires immediately). */
	subscribe(cb: (findings: readonly SuggestionFinding[]) => void): () => void {
		this.subs.add(cb);
		cb(this.list());
		return () => this.subs.delete(cb);
	}

	/** All findings in insertion order (immutable copy, referentially stable between mutations). */
	list(): readonly SuggestionFinding[] {
		if (!this.cachedList) this.cachedList = [...this.byId.values()];
		return this.cachedList;
	}

	/**
	 * The body-mark projection: only findings that should paint a mark next to
	 * live prose — `active` and `stale` (a stale mark still shows so the user can
	 * see the evidence drifted). `ignored`, `consumed` and `dismissed` never mark
	 * the body.
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
			// A producer must not silently take over an external finding that happens
			// to use the same source fingerprint and revision.
			if (input.producerId !== undefined && existing.producerId !== input.producerId) return existing;
			const next: SuggestionFinding = {
				...existing,
				reason: input.reason,
				target: input.target,
				...(input.capabilityId !== undefined ? { capabilityId: input.capabilityId } : {}),
				...(input.producerId !== undefined ? { producerId: input.producerId } : {}),
				...(input.brief !== undefined ? { brief: input.brief } : {}),
				...(input.body !== undefined ? { body: input.body } : {}),
				...(input.deferredAt !== undefined ? { deferredAt: input.deferredAt } : {}),
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
			...(input.producerId !== undefined ? { producerId: input.producerId } : {}),
			...(input.brief !== undefined ? { brief: input.brief } : {}),
			...(input.body !== undefined ? { body: input.body } : {}),
			...(input.deferredAt !== undefined ? { deferredAt: input.deferredAt } : {}),
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
	 * Hide a producer-backed item for the current Brief refresh only. This is
	 * intentionally distinct from {@link dismiss}: the next producer refresh
	 * may restore it, matching the product label “本轮忽略”.
	 */
	ignoreForCurrentRefresh(findingId: string): boolean {
		const existing = this.byId.get(findingId);
		if (!existing || (existing.state !== 'active' && existing.state !== 'stale')) return false;
		this.byId.set(findingId, { ...existing, state: 'ignored' });
		this.notify();
		return true;
	}

	/** Restore a current-refresh ignore when its producer re-observes the finding. */
	restoreIgnored(findingId: string): boolean {
		const existing = this.byId.get(findingId);
		if (!existing || existing.state !== 'ignored') return false;
		this.byId.set(findingId, { ...existing, state: 'active' });
		this.notify();
		return true;
	}

	/**
	 * Defer an active finding without changing its lifecycle membership. It stays
	 * visible to both body and Brief projections; the timestamp gives the Brief a
	 * real, deterministic way to move it later in its local ordering.
	 */
	defer(findingId: string, deferredAt = Date.now()): boolean {
		const existing = this.byId.get(findingId);
		if (!existing || existing.state !== 'active') return false;
		this.byId.set(findingId, { ...existing, deferredAt });
		this.notify();
		return true;
	}

	/**
	 * Remove a transient producer-owned finding once a newer sensing pass replaces
	 * it. This is intentionally not a user dismissal or consumption transition;
	 * the record simply no longer represents the current producer snapshot.
	 */
	remove(findingId: string): boolean {
		const existing = this.byId.get(findingId);
		if (!existing) return false;
		this.byId.delete(findingId);
		this.byDedupKey.delete(findingDedupKey(existing.fingerprint, existing.evidenceRevision));
		this.notify();
		return true;
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
		this.cachedList = null;
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
