/**
 * Peak Composer — direct-edit burst controller (WP4, S2 决议).
 *
 * Coalesces continuous typing in one contenteditable leaf into debounced
 * `direct` transactions through the hub, all sharing ONE stable groupId per
 * editing session (focus → blur). The groupId is minted here — NOT derived from
 * blockId, which changes on every commit (WP2 interface note) — so the History
 * ledger projects the whole burst as one parent with per-flush children and the
 * Undo stack groups them into one step.
 *
 * The controller is framework-neutral: the UI feeds it the latest text on each
 * input, and supplies `resolveRange` so the byte range is resolved against the
 * CURRENT snapshot at flush time (block ids/offsets shift after every commit).
 * While `dirty` (un-flushed input exists) the UI leaves Cmd/Ctrl+Z to the
 * native contenteditable undo; after the flush boundary it routes to hub.undo.
 */

import { makeGroupId, type ComposerTarget } from '@/core/composer';
import type { ComposerTransactionHub } from './transactionHub';

export interface DirectEditRange {
	from: number;
	to: number;
	/** Current source slice at [from,to) — used to skip no-op flushes. */
	current: string;
	target?: ComposerTarget;
}

export interface DirectEditDeps {
	hub: ComposerTransactionHub;
	/** Resolve the edit range against the CURRENT snapshot (null ⇒ drop the flush). */
	resolveRange: () => DirectEditRange | null;
	label: string;
	burstWindowMs: number;
}

export class DirectEditController {
	private pending: string | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private groupId: string | null = null;
	private composing = false;
	private flushing: Promise<void> = Promise.resolve();

	constructor(private readonly deps: DirectEditDeps) {}

	/** True while un-flushed input exists (native undo keeps ownership). */
	get dirty(): boolean {
		return this.pending !== null;
	}

	/** The current burst group id (stable for the whole editing session). */
	get sessionGroupId(): string | null {
		return this.groupId;
	}

	/** IME composition gate — no flush is scheduled mid-composition. */
	setComposing(composing: boolean): void {
		this.composing = composing;
		if (!composing && this.pending !== null) this.schedule();
	}

	/** Feed the leaf's full current text after an input event. */
	onInput(text: string): void {
		if (!this.groupId) this.groupId = makeGroupId();
		this.pending = text;
		if (!this.composing) this.schedule();
	}

	/** Flush now (blur / explicit boundary). Serialized against prior flushes. */
	flush(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		const text = this.pending;
		this.pending = null;
		if (text === null) return this.flushing;
		this.flushing = this.flushing.then(() => this.commit(text));
		return this.flushing;
	}

	/** End the editing session: flush, then retire the group id. */
	async endSession(): Promise<void> {
		await this.flush();
		this.groupId = null;
	}

	dispose(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.pending = null;
	}

	private schedule(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, this.deps.burstWindowMs);
	}

	private async commit(text: string): Promise<void> {
		const range = this.deps.resolveRange();
		if (!range) return;
		if (range.current === text) return; // no-op burst
		try {
			await this.deps.hub.commit({
				origin: 'direct',
				label: this.deps.label,
				operations: [{ kind: 'replaceRange', from: range.from, to: range.to, text }],
				target: range.target,
				groupId: this.groupId ?? undefined,
			});
		} catch {
			// Conflict (external edit / drift): the burst is dropped; the lifecycle
			// controller surfaces the stale state and the user re-syncs. Never retry
			// blindly against a moved revision.
		}
	}
}
