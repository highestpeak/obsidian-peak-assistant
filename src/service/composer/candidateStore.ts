/**
 * Peak Composer — candidate / variant store (WP2, handoff §5.3).
 *
 * Holds PENDING proposals. Pending candidates never touch Markdown, History or
 * the Undo stack — they live entirely here until accepted (which routes their
 * operations through the transaction engine) or discarded. Rules enforced:
 *
 *   - regeneration APPENDS a variant, never overwrites (variant history kept);
 *   - only an active `ready` variant on a non-`stale` candidate can be accepted;
 *   - a `stale` candidate cannot be accepted — the caller must rebase / re-run;
 *   - the targeted instruction is stored beside a variant as run context, never
 *     merged into the candidate body;
 *   - on reparse, anchors are migrated via `matchBlocks`; a candidate whose
 *     target block no longer maps is marked `stale` (never silently redirected).
 *
 * Discard/restore is a candidate-local lifecycle and is deliberately NOT part of
 * document undo/redo (§9.7).
 */

import {
	makeCandidateId,
	makeVariantId,
	type ComposerCandidate,
	type ComposerCandidateStatus,
	type ComposerTarget,
	type CandidateVariant,
	type ProposedChange,
	type ComposerDocumentSnapshot,
} from '@/core/composer';
import { matchBlocks } from './blockIdentity';

export interface CreateCandidateInput<TResult = unknown> {
	target: ComposerTarget;
	baseRevision: string;
	/** The first variant's proposed change. */
	proposedChange: ProposedChange<TResult>;
	/** Whether the first variant is still streaming (default: ready). */
	streaming?: boolean;
	instruction?: string;
}

export interface AddVariantInput<TResult = unknown> {
	proposedChange: ProposedChange<TResult>;
	streaming?: boolean;
	instruction?: string;
}

function blockOf(target: ComposerTarget): string | undefined {
	if (target.kind === 'block' || target.kind === 'unit') return target.blockId;
	return undefined;
}

export class ComposerCandidateStore {
	private readonly candidates = new Map<string, ComposerCandidate>();
	/** Discarded candidates are retained so `restore` can bring them back. */
	private readonly discarded = new Map<string, ComposerCandidate>();

	list(): ComposerCandidate[] {
		return [...this.candidates.values()];
	}

	get(candidateId: string): ComposerCandidate | undefined {
		return this.candidates.get(candidateId) ?? this.discarded.get(candidateId);
	}

	/** Create a new pending candidate with its first (active) variant. */
	create<TResult = unknown>(input: CreateCandidateInput<TResult>): ComposerCandidate<TResult> {
		const variant: CandidateVariant<TResult> = {
			variantId: makeVariantId(),
			provenance: 'initial',
			status: input.streaming ? 'streaming' : 'ready',
			proposedChange: input.proposedChange,
			instruction: input.instruction,
			createdAt: Date.now(),
		};
		const candidate: ComposerCandidate<TResult> = {
			candidateId: makeCandidateId(),
			target: input.target,
			baseRevision: input.baseRevision,
			status: variant.status,
			variants: [variant],
			activeVariantId: variant.variantId,
			proposedChange: variant.proposedChange,
			anchorBlockId: blockOf(input.target),
		};
		this.candidates.set(candidate.candidateId, candidate as ComposerCandidate);
		return candidate;
	}

	/** Append a regeneration variant (never overwrites) and make it active. */
	addVariant<TResult = unknown>(
		candidateId: string,
		input: AddVariantInput<TResult>,
	): ComposerCandidate<TResult> {
		const candidate = this.requireActive(candidateId);
		const variant: CandidateVariant = {
			variantId: makeVariantId(),
			provenance: 'regeneration',
			status: input.streaming ? 'streaming' : 'ready',
			proposedChange: input.proposedChange as ProposedChange,
			instruction: input.instruction,
			createdAt: Date.now(),
		};
		const next: ComposerCandidate = {
			...candidate,
			variants: [...candidate.variants, variant],
			activeVariantId: variant.variantId,
			proposedChange: variant.proposedChange,
			status: variant.status === 'streaming' ? 'streaming' : 'ready',
		};
		this.candidates.set(candidateId, next);
		return next as ComposerCandidate<TResult>;
	}

	/** Switch which variant is active (blocked while any variant is streaming). */
	setActiveVariant(candidateId: string, variantId: string): ComposerCandidate {
		const candidate = this.requireActive(candidateId);
		const variant = candidate.variants.find((v) => v.variantId === variantId);
		if (!variant) throw new Error(`unknown variant ${variantId} on ${candidateId}`);
		const next: ComposerCandidate = {
			...candidate,
			activeVariantId: variantId,
			proposedChange: variant.proposedChange,
			status: variant.status === 'streaming' ? 'streaming' : candidate.status,
		};
		this.candidates.set(candidateId, next);
		return next;
	}

	/** Mark the active streaming variant ready (with its final change). */
	markVariantReady<TResult = unknown>(
		candidateId: string,
		proposedChange: ProposedChange<TResult>,
	): ComposerCandidate {
		return this.patchActiveVariant(candidateId, 'ready', proposedChange as ProposedChange);
	}

	/** Mark the active variant failed. */
	markVariantFailed(candidateId: string): ComposerCandidate {
		return this.patchActiveVariant(candidateId, 'failed');
	}

	/**
	 * Attempt to accept a candidate. Returns the operations to commit only when
	 * the candidate is acceptable: it must be `ready`, its active variant ready,
	 * and its base revision must still match `currentRevision`. Otherwise returns
	 * a typed refusal (the caller surfaces a conflict / re-run prompt).
	 */
	prepareAccept(
		candidateId: string,
		currentRevision: string,
	): { ok: true; candidate: ComposerCandidate } | { ok: false; reason: 'stale' | 'not-ready' } {
		const candidate = this.candidates.get(candidateId);
		if (!candidate) return { ok: false, reason: 'not-ready' };
		if (candidate.status === 'stale' || candidate.baseRevision !== currentRevision) {
			this.setStatus(candidateId, 'stale');
			return { ok: false, reason: 'stale' };
		}
		const active = candidate.variants.find((v) => v.variantId === candidate.activeVariantId);
		if (!active || active.status !== 'ready') return { ok: false, reason: 'not-ready' };
		return { ok: true, candidate };
	}

	/** Finalize an accepted candidate (called after the commit succeeds). */
	markAccepted(candidateId: string): void {
		this.setStatus(candidateId, 'accepted');
	}

	/** Discard a pending candidate (retained for `restore`; NOT an undo op). */
	discard(candidateId: string): void {
		const candidate = this.candidates.get(candidateId);
		if (!candidate) return;
		this.candidates.delete(candidateId);
		this.discarded.set(candidateId, { ...candidate, status: 'discarded' });
	}

	/** Restore a previously discarded candidate (NOT a redo op). */
	restore(candidateId: string): ComposerCandidate | undefined {
		const candidate = this.discarded.get(candidateId);
		if (!candidate) return undefined;
		this.discarded.delete(candidateId);
		const revived: ComposerCandidate = { ...candidate, status: activeStatus(candidate) };
		this.candidates.set(candidateId, revived);
		return revived;
	}

	/**
	 * Migrate every pending candidate's anchor across a reparse. A candidate
	 * whose target block still maps (via `matchBlocks`) is re-anchored to the new
	 * block id; one that no longer maps is marked `stale`. Returns the ids that
	 * went stale.
	 */
	revalidate(prev: ComposerDocumentSnapshot, next: ComposerDocumentSnapshot): string[] {
		const matches = matchBlocks(prev.blocks, next.blocks);
		const oldToNew = new Map<string, string>();
		for (const m of matches) if (m.oldBlockId) oldToNew.set(m.oldBlockId, m.newBlockId);
		const staleIds: string[] = [];
		for (const [id, candidate] of this.candidates) {
			if (candidate.status === 'accepted' || candidate.status === 'stale') continue;
			const anchor = candidate.anchorBlockId;
			if (!anchor) {
				// Document-level target: only the revision moved.
				this.candidates.set(id, { ...candidate, baseRevision: next.revision });
				continue;
			}
			const mappedNew = oldToNew.get(anchor);
			if (!mappedNew) {
				this.candidates.set(id, { ...candidate, status: 'stale' });
				staleIds.push(id);
				continue;
			}
			// Re-anchor but keep baseRevision: the proposal's operations were built
			// against the OLD revision, so it must be re-run/rebased before accept.
			this.candidates.set(id, { ...candidate, anchorBlockId: mappedNew, status: 'stale' });
			staleIds.push(id);
		}
		return staleIds;
	}

	// ── internals ─────────────────────────────────────────────────────────────

	private requireActive(candidateId: string): ComposerCandidate {
		const candidate = this.candidates.get(candidateId);
		if (!candidate) throw new Error(`unknown or non-active candidate ${candidateId}`);
		return candidate;
	}

	private setStatus(candidateId: string, status: ComposerCandidateStatus): void {
		const candidate = this.candidates.get(candidateId);
		if (!candidate) return;
		this.candidates.set(candidateId, { ...candidate, status });
	}

	private patchActiveVariant(
		candidateId: string,
		status: CandidateVariant['status'],
		proposedChange?: ProposedChange,
	): ComposerCandidate {
		const candidate = this.requireActive(candidateId);
		const variants = candidate.variants.map((v) =>
			v.variantId === candidate.activeVariantId
				? { ...v, status, proposedChange: proposedChange ?? v.proposedChange }
				: v,
		);
		const active = variants.find((v) => v.variantId === candidate.activeVariantId)!;
		const next: ComposerCandidate = {
			...candidate,
			variants,
			proposedChange: active.proposedChange,
			status: status === 'streaming' ? 'streaming' : status === 'failed' ? 'failed' : 'ready',
		};
		this.candidates.set(candidateId, next);
		return next;
	}
}

function activeStatus(candidate: ComposerCandidate): ComposerCandidateStatus {
	const active = candidate.variants.find((v) => v.variantId === candidate.activeVariantId);
	if (!active) return 'ready';
	return active.status === 'streaming' ? 'streaming' : active.status === 'failed' ? 'failed' : 'ready';
}
