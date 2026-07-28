/**
 * Peak Composer — observable Brief state.
 *
 * The Intelligence sidecar is a projection over a live document, not a static
 * fixture. This store holds only document-adjacent Brief controls and derived
 * session-insight thoughts. It deliberately owns no document source, parser,
 * or AI producer; those are injected into {@link IntelligenceRuntime} by the
 * app composition root.
 */

import type { RunReceipt } from './runSession';

/** How aggressively the Brief should recompute after a document reparse. */
export type BriefSensingMode = 'manual' | 'idle' | 'continuous';

/** The real document anchor the Brief is currently describing. */
export interface BriefFocus {
	readonly anchorId: string;
	readonly label: string;
}

/** A real insight from a Copilot receipt that has not yet been organised. */
export interface BriefThought {
	readonly thoughtId: string;
	readonly runId: string;
	readonly insightId: string;
	readonly label: string;
	readonly detail?: string;
	/** `organized` thoughts leave the unplaced projection without being deleted. */
	readonly state: 'active' | 'organized';
}

/**
 * Stable, subscribable projection consumed by the Brief UI.
 *
 * `revision` is an in-memory state revision for external-store consumers;
 * `refreshVersion` is the small human-facing refresh sequence; and
 * `refreshRevision` is the source-document revision used for the last real
 * finding computation. They intentionally answer different questions.
 */
export interface IntelligenceBriefProjection {
	readonly focus: BriefFocus | null;
	readonly sensingMode: BriefSensingMode;
	readonly autoPrepare: boolean;
	/** Whether an app-owned candidate-preparation runtime is actually wired. */
	readonly autoPrepareAvailable: boolean;
	readonly lastRefreshedAt: number | null;
	/** Small sidecar-local counter, suitable for `v1` display without leaking source hashes. */
	readonly refreshVersion: number;
	readonly refreshRevision: string | null;
	readonly revision: number;
	readonly unplacedThoughts: readonly BriefThought[];
}

type BriefSubscriber = (projection: IntelligenceBriefProjection) => void;

/**
 * Per-document Brief state. The cached projection is referentially stable until
 * a material change, so it is safe to use with `useSyncExternalStore`.
 */
export class ComposerBriefState {
	private focus: BriefFocus | null = null;
	private sensingMode: BriefSensingMode = 'idle';
	private autoPrepare = false;
	private readonly autoPrepareAvailable: boolean;
	private lastRefreshedAt: number | null = null;
	private refreshVersion = 0;
	private refreshRevision: string | null = null;
	private revision = 0;
	private readonly thoughtsById = new Map<string, BriefThought>();
	private readonly subscribers = new Set<BriefSubscriber>();
	private cachedProjection: IntelligenceBriefProjection | null = null;

	constructor(options: { autoPrepareAvailable?: boolean } = {}) {
		this.autoPrepareAvailable = options.autoPrepareAvailable ?? false;
	}

	/** Subscribe to the immutable Brief projection (fires immediately). */
	subscribe(subscriber: BriefSubscriber): () => void {
		this.subscribers.add(subscriber);
		subscriber(this.projection());
		return () => this.subscribers.delete(subscriber);
	}

	/** Read a referentially stable projection until the next mutation. */
	projection(): IntelligenceBriefProjection {
		if (this.cachedProjection) return this.cachedProjection;
		this.cachedProjection = Object.freeze({
			focus: this.focus,
			sensingMode: this.sensingMode,
			autoPrepare: this.autoPrepare,
			autoPrepareAvailable: this.autoPrepareAvailable,
			lastRefreshedAt: this.lastRefreshedAt,
			refreshVersion: this.refreshVersion,
			refreshRevision: this.refreshRevision,
			revision: this.revision,
			unplacedThoughts: Object.freeze(
				[...this.thoughtsById.values()].filter((thought) => thought.state === 'active'),
			),
		});
		return this.cachedProjection;
	}

	updateFocus(focus: BriefFocus): void {
		if (sameFocus(this.focus, focus)) return;
		this.focus = Object.freeze({ ...focus });
		this.changed();
	}

	setSensingMode(mode: BriefSensingMode): void {
		if (this.sensingMode === mode) return;
		this.sensingMode = mode;
		this.changed();
	}

	setAutoPrepare(autoPrepare: boolean): boolean {
		if (!this.autoPrepareAvailable) return false;
		if (this.autoPrepare === autoPrepare) return true;
		this.autoPrepare = autoPrepare;
		this.changed();
		return true;
	}

	/** Record a completed finding computation against an actual source revision. */
	markRefreshed(refreshRevision: string, at = Date.now()): void {
		this.refreshRevision = refreshRevision;
		this.lastRefreshedAt = at;
		this.refreshVersion += 1;
		this.changed();
	}

	/**
	 * Mirror real receipt insights into unplaced thoughts. The receipt is the
	 * source of truth: if an insight disappears from its receipt (for example an
	 * errored run clears it), its thought disappears too.
	 */
	syncReceiptInsights(receipts: readonly RunReceipt[]): void {
		const next = new Map<string, BriefThought>();
		for (const receipt of receipts) {
			for (const insight of receipt.insights) {
				const thoughtId = receiptThoughtId(receipt.runId, insight.id);
				const existing = this.thoughtsById.get(thoughtId);
				next.set(thoughtId, {
					thoughtId,
					runId: receipt.runId,
					insightId: insight.id,
					label: insight.label,
					...(insight.detail !== undefined ? { detail: insight.detail } : {}),
					state: existing?.state ?? 'active',
				});
			}
		}
		if (sameThoughts(this.thoughtsById, next)) return;
		this.thoughtsById.clear();
		for (const [id, thought] of next) this.thoughtsById.set(id, thought);
		this.changed();
	}

	/** Mark one real receipt insight as organised without deleting its provenance. */
	organizeThought(thoughtId: string): boolean {
		const existing = this.thoughtsById.get(thoughtId);
		if (!existing || existing.state !== 'active') return false;
		this.thoughtsById.set(thoughtId, { ...existing, state: 'organized' });
		this.changed();
		return true;
	}

	private changed(): void {
		this.revision += 1;
		this.cachedProjection = null;
		const projection = this.projection();
		for (const subscriber of this.subscribers) subscriber(projection);
	}
}

function receiptThoughtId(runId: string, insightId: string): string {
	return `receipt:${runId}:insight:${insightId}`;
}

function sameFocus(left: BriefFocus | null, right: BriefFocus): boolean {
	return left?.anchorId === right.anchorId && left.label === right.label;
}

function sameThoughts(
	left: ReadonlyMap<string, BriefThought>,
	right: ReadonlyMap<string, BriefThought>,
): boolean {
	if (left.size !== right.size) return false;
	for (const [id, next] of right) {
		const current = left.get(id);
		if (!current) return false;
		if (
			current.runId !== next.runId ||
			current.insightId !== next.insightId ||
			current.label !== next.label ||
			current.detail !== next.detail ||
			current.state !== next.state
		) {
			return false;
		}
	}
	return true;
}
