/**
 * Peak Composer — comment anchors (WP4, §7.8).
 *
 * A comment binds to a block (optionally a sub-range/selection inside it) but is
 * NOT Markdown body text — it lives beside the document via a persistence port.
 * After the source changes, every anchor is revalidated: the owning block is
 * rematched across the reparse with {@link matchBlocks} (never bare id equality,
 * per the WP1 interface note), and the anchored quote is relocated inside the
 * new block; anything that can no longer be located is marked `stale` rather
 * than silently dropped or re-pointed.
 *
 * Pure/framework-neutral; storage is injected (see commentStore + the app
 * adapter).
 */

import type { ComposerDocumentSnapshot } from '@/core/composer';
import { matchBlocks } from '../blockIdentity';
import { computeFingerprint } from '@/core/composer';

export type CommentStatus = 'active' | 'stale';
export type CommentThreadState = 'open' | 'resolved';
export type CommentVisibility = 'private' | 'shared';
export type CommentOrigin = 'local' | 'share' | 'portal';
export type CommentActorKind = 'owner' | 'guest' | 'customer' | 'copilot';

export const COMPOSER_COMMENT_SCHEMA_VERSION = 2;

export interface ComposerCommentActor {
	actorId: string;
	displayName: string;
	kind: CommentActorKind;
	/** A display claim is not a verified identity unless the host says so. */
	verified?: boolean;
}

export const LOCAL_COMMENT_ACTOR: ComposerCommentActor = Object.freeze({
	actorId: 'local-owner',
	displayName: 'local-owner',
	kind: 'owner',
	verified: true,
});

export interface ComposerCommentReply {
	replyId: string;
	body: string;
	actor: ComposerCommentActor;
	createdAt: number;
	updatedAt: number;
	/** Tombstone retained for future Share/Portal event reconciliation. */
	deletedAt?: number;
	remoteEventId?: string;
}

/** Where a comment is anchored. `range` absent ⇒ the whole block. */
export interface CommentAnchor {
	blockId: string;
	/** Selection sub-range within the block, in that revision's source offsets. */
	range?: { from: number; to: number };
	/** The anchored text at creation, used to relocate the anchor after edits. */
	quote: string;
	/** Fingerprint of `quote`, for a cheap unchanged check. */
	fingerprint: string;
}

export interface ComposerComment {
	/** Additive schema marker; absent means the legacy WP4 shape. */
	schemaVersion?: number;
	commentId: string;
	anchor: CommentAnchor;
	body: string;
	status: CommentStatus;
	threadState?: CommentThreadState;
	visibility?: CommentVisibility;
	origin?: CommentOrigin;
	actor?: ComposerCommentActor;
	replies?: ComposerCommentReply[];
	/** Local Composer revision or published PageVersion at creation time. */
	sourceRevision?: string;
	pageVersionId?: string;
	remoteEventId?: string;
	createdAt: number;
	updatedAt: number;
	/** Thread tombstone. Deleted records stay persistable but leave projections. */
	deletedAt?: number;
}

export interface ComposerCommentCreateInput {
	anchor: CommentAnchor;
	body: string;
	actor?: ComposerCommentActor;
	visibility?: CommentVisibility;
	origin?: CommentOrigin;
	sourceRevision?: string;
	pageVersionId?: string;
	remoteEventId?: string;
}

/**
 * Structured Copilot source. External comment text stays DATA and is never
 * concatenated into an instruction string by the comment layer.
 */
export interface ComposerCommentSourceRef {
	kind: 'comment';
	commentId: string;
	blockId: string;
	range?: { from: number; to: number };
	quote: string;
	body: string;
	replies: readonly string[];
	revision?: string;
	pageVersionId?: string;
	trust: 'owner' | 'external';
	visibility: CommentVisibility;
}

/** Build an anchor for a block (whole block or a sub-range selection). */
export function makeCommentAnchor(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	range?: { from: number; to: number },
): CommentAnchor | null {
	const block = snapshot.blocks.find((b) => b.blockId === blockId);
	if (!block) return null;
	const quote = range
		? snapshot.sourceText.slice(range.from, range.to)
		: snapshot.sourceText.slice(block.source.from, block.source.to);
	return { blockId, range, quote, fingerprint: computeFingerprint(quote) };
}

/** Upgrade a persisted legacy comment without invalidating its stable id. */
export function normalizeComposerComment(input: ComposerComment): ComposerComment {
	const createdAt = finiteTimestamp(input.createdAt, Date.now());
	const updatedAt = finiteTimestamp(input.updatedAt, createdAt);
	return {
		...input,
		schemaVersion: COMPOSER_COMMENT_SCHEMA_VERSION,
		threadState: input.threadState === 'resolved' ? 'resolved' : 'open',
		visibility: input.visibility === 'shared' ? 'shared' : 'private',
		origin: isCommentOrigin(input.origin) ? input.origin : 'local',
		actor: normalizeActor(input.actor),
		replies: Array.isArray(input.replies)
			? input.replies
				.filter(isReplyLike)
				.map((reply) => ({
					...reply,
					actor: normalizeActor(reply.actor),
					createdAt: finiteTimestamp(reply.createdAt, createdAt),
					updatedAt: finiteTimestamp(reply.updatedAt, reply.createdAt),
				}))
			: [],
		createdAt,
		updatedAt,
	};
}

export function buildCommentSourceRef(comment: ComposerComment): ComposerCommentSourceRef {
	const normalized = normalizeComposerComment(comment);
	const replies = (normalized.replies ?? [])
		.filter((reply) => reply.deletedAt === undefined)
		.map((reply) => reply.body);
	const hasExternalActor =
		normalized.actor?.kind !== 'owner' ||
		(normalized.replies ?? []).some((reply) =>
			reply.deletedAt === undefined && reply.actor.kind !== 'owner');
	return Object.freeze({
		kind: 'comment',
		commentId: normalized.commentId,
		blockId: normalized.anchor.blockId,
		...(normalized.anchor.range ? { range: { ...normalized.anchor.range } } : {}),
		quote: normalized.anchor.quote,
		body: normalized.body,
		replies: Object.freeze(replies),
		...(normalized.sourceRevision ? { revision: normalized.sourceRevision } : {}),
		...(normalized.pageVersionId ? { pageVersionId: normalized.pageVersionId } : {}),
		trust: hasExternalActor ? 'external' : 'owner',
		visibility: normalized.visibility ?? 'private',
	});
}

/**
 * Revalidate every comment against a new snapshot. Returns a new array; each
 * comment is either migrated (new blockId + relocated range, still `active`) or
 * marked `stale`.
 */
export function revalidateComments(
	comments: readonly ComposerComment[],
	prev: ComposerDocumentSnapshot,
	next: ComposerDocumentSnapshot,
): ComposerComment[] {
	const matches = matchBlocks(prev.blocks, next.blocks);
	// old blockId → new blockId (only for blocks that survived the reparse).
	const oldToNew = new Map<string, string>();
	for (const m of matches) {
		if (m.oldBlockId) oldToNew.set(m.oldBlockId, m.newBlockId);
	}

	return comments.map((comment) => relocate(comment, oldToNew, next));
}

function relocate(
	comment: ComposerComment,
	oldToNew: Map<string, string>,
	next: ComposerDocumentSnapshot,
): ComposerComment {
	const newBlockId = oldToNew.get(comment.anchor.blockId);
	const block = newBlockId ? next.blocks.find((b) => b.blockId === newBlockId) : undefined;
	if (!newBlockId || !block) return staleOf(comment);

	const blockText = next.sourceText.slice(block.source.from, block.source.to);
	// Whole-block anchor: valid as long as the block survived.
	if (!comment.anchor.range) {
		return {
			...comment,
			status: 'active',
			anchor: {
				...comment.anchor,
				blockId: newBlockId,
				quote: blockText,
				fingerprint: computeFingerprint(blockText),
			},
		};
	}

	// Sub-range anchor: relocate the quote inside the new block slice.
	const idx = blockText.indexOf(comment.anchor.quote);
	if (idx < 0) return staleOf({ ...comment, anchor: { ...comment.anchor, blockId: newBlockId } });
	const from = block.source.from + idx;
	return {
		...comment,
		status: 'active',
		anchor: {
			...comment.anchor,
			blockId: newBlockId,
			range: { from, to: from + comment.anchor.quote.length },
		},
	};
}

function staleOf(comment: ComposerComment): ComposerComment {
	return comment.status === 'stale' ? comment : { ...comment, status: 'stale' };
}

function finiteTimestamp(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

function normalizeActor(actor?: ComposerCommentActor): ComposerCommentActor {
	if (!actor || !actor.actorId || !actor.displayName || !isActorKind(actor.kind)) {
		return { ...LOCAL_COMMENT_ACTOR };
	}
	return { ...actor };
}

function isCommentOrigin(value: unknown): value is CommentOrigin {
	return value === 'local' || value === 'share' || value === 'portal';
}

function isActorKind(value: unknown): value is CommentActorKind {
	return value === 'owner' || value === 'guest' || value === 'customer' || value === 'copilot';
}

function isReplyLike(value: unknown): value is ComposerCommentReply {
	if (!value || typeof value !== 'object') return false;
	const reply = value as Partial<ComposerCommentReply>;
	return typeof reply.replyId === 'string' && typeof reply.body === 'string';
}
