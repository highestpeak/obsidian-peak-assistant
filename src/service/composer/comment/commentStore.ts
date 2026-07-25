/**
 * Peak Composer — comment store (WP4, §7.8).
 *
 * A per-document, subscribable store of {@link ComposerComment}s. It owns no
 * Obsidian / React state: persistence is a {@link ComposerCommentPersistencePort}
 * the app layer implements (plugin data / sqlite) and tests fake. On every
 * source reparse the controller calls {@link ComposerCommentStore.revalidate}
 * so anchors migrate or go stale — comments never enter Markdown body text.
 */

import type { ComposerDocumentSnapshot } from '@/core/composer';
import { revalidateComments, type ComposerComment } from './commentModel';

/** Injected persistence — the product's existing comment/plugin-data storage. */
export interface ComposerCommentPersistencePort {
	load(documentId: string): Promise<ComposerComment[]>;
	save(documentId: string, comments: readonly ComposerComment[]): Promise<void>;
}

let seq = 0;
function nextCommentId(): string {
	seq += 1;
	return `cmt-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export class ComposerCommentStore {
	private comments: ComposerComment[] = [];
	private readonly subs = new Set<(comments: readonly ComposerComment[]) => void>();

	constructor(
		private readonly documentId: string,
		private readonly port?: ComposerCommentPersistencePort,
	) {}

	/** Hydrate from the persistence port (no-op when none is injected). */
	async load(): Promise<void> {
		if (!this.port) return;
		this.comments = await this.port.load(this.documentId);
		this.notify();
	}

	list(): readonly ComposerComment[] {
		return this.comments;
	}

	forBlock(blockId: string): readonly ComposerComment[] {
		return this.comments.filter((c) => c.anchor.blockId === blockId);
	}

	subscribe(cb: (comments: readonly ComposerComment[]) => void): () => void {
		this.subs.add(cb);
		cb(this.comments);
		return () => this.subs.delete(cb);
	}

	add(input: Omit<ComposerComment, 'commentId' | 'status' | 'createdAt' | 'updatedAt'>): ComposerComment {
		const now = Date.now();
		const comment: ComposerComment = {
			...input,
			commentId: nextCommentId(),
			status: 'active',
			createdAt: now,
			updatedAt: now,
		};
		this.comments = [...this.comments, comment];
		this.persist();
		this.notify();
		return comment;
	}

	updateBody(commentId: string, body: string): void {
		this.comments = this.comments.map((c) =>
			c.commentId === commentId ? { ...c, body, updatedAt: Date.now() } : c,
		);
		this.persist();
		this.notify();
	}

	remove(commentId: string): void {
		this.comments = this.comments.filter((c) => c.commentId !== commentId);
		this.persist();
		this.notify();
	}

	/** Migrate/stale anchors after a reparse. Called by the lifecycle controller. */
	revalidate(prev: ComposerDocumentSnapshot, next: ComposerDocumentSnapshot): void {
		const updated = revalidateComments(this.comments, prev, next);
		// Only re-emit / persist when something actually changed.
		if (updated.some((c, i) => c !== this.comments[i])) {
			this.comments = updated;
			this.persist();
			this.notify();
		}
	}

	private persist(): void {
		void this.port?.save(this.documentId, this.comments);
	}

	private notify(): void {
		for (const cb of this.subs) cb(this.comments);
	}
}
