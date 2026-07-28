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
import {
	COMPOSER_COMMENT_SCHEMA_VERSION,
	LOCAL_COMMENT_ACTOR,
	normalizeComposerComment,
	revalidateComments,
	type ComposerComment,
	type ComposerCommentActor,
	type ComposerCommentCreateInput,
	type ComposerCommentReply,
	type CommentVisibility,
} from './commentModel';

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

function nextReplyId(): string {
	seq += 1;
	return `cmt-reply-${Date.now().toString(36)}-${seq.toString(36)}`;
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
		this.comments = (await this.port.load(this.documentId)).map(normalizeComposerComment);
		this.notify();
	}

	list(): readonly ComposerComment[] {
		return this.comments.filter((comment) => comment.deletedAt === undefined);
	}

	forBlock(blockId: string): readonly ComposerComment[] {
		return this.list().filter((comment) => comment.anchor.blockId === blockId);
	}

	subscribe(cb: (comments: readonly ComposerComment[]) => void): () => void {
		this.subs.add(cb);
		cb(this.list());
		return () => this.subs.delete(cb);
	}

	add(input: ComposerCommentCreateInput): ComposerComment {
		const now = Date.now();
		const comment: ComposerComment = {
			...input,
			schemaVersion: COMPOSER_COMMENT_SCHEMA_VERSION,
			commentId: nextCommentId(),
			status: 'active',
			threadState: 'open',
			visibility: input.visibility ?? 'private',
			origin: input.origin ?? 'local',
			actor: input.actor ?? { ...LOCAL_COMMENT_ACTOR },
			replies: [],
			createdAt: now,
			updatedAt: now,
		};
		this.comments = [...this.comments, comment];
		this.persist();
		this.notify();
		return comment;
	}

	reply(commentId: string, body: string, actor: ComposerCommentActor = LOCAL_COMMENT_ACTOR): ComposerCommentReply | null {
		const trimmed = body.trim();
		if (!trimmed) return null;
		const now = Date.now();
		const reply: ComposerCommentReply = {
			replyId: nextReplyId(),
			body: trimmed,
			actor: { ...actor },
			createdAt: now,
			updatedAt: now,
		};
		let found = false;
		this.comments = this.comments.map((comment) => {
			if (comment.commentId !== commentId || comment.deletedAt !== undefined) return comment;
			found = true;
			return {
				...normalizeComposerComment(comment),
				replies: [...(comment.replies ?? []), reply],
				updatedAt: now,
			};
		});
		if (!found) return null;
		this.persist();
		this.notify();
		return reply;
	}

	resolve(commentId: string): void {
		this.setThreadState(commentId, 'resolved');
	}

	reopen(commentId: string): void {
		this.setThreadState(commentId, 'open');
	}

	setVisibility(commentId: string, visibility: CommentVisibility): void {
		this.updateComment(commentId, (comment, now) => ({ ...comment, visibility, updatedAt: now }));
	}

	updateBody(commentId: string, body: string): void {
		const trimmed = body.trim();
		if (!trimmed) return;
		this.updateComment(commentId, (comment, now) => ({ ...comment, body: trimmed, updatedAt: now }));
	}

	remove(commentId: string): void {
		this.updateComment(commentId, (comment, now) => ({
			...comment,
			deletedAt: now,
			updatedAt: now,
		}));
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
		const visible = this.list();
		for (const cb of this.subs) cb(visible);
	}

	private setThreadState(commentId: string, threadState: 'open' | 'resolved'): void {
		this.updateComment(commentId, (comment, now) => ({ ...comment, threadState, updatedAt: now }));
	}

	private updateComment(
		commentId: string,
		update: (comment: ComposerComment, now: number) => ComposerComment,
	): void {
		let changed = false;
		const now = Date.now();
		this.comments = this.comments.map((comment) => {
			if (comment.commentId !== commentId || comment.deletedAt !== undefined) return comment;
			changed = true;
			return update(normalizeComposerComment(comment), now);
		});
		if (!changed) return;
		this.persist();
		this.notify();
	}
}
