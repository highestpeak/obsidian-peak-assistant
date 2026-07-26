/**
 * Peak Composer — image insertion & reference-rewrite planning (WP7,
 * CMP-IMG-01 / CMP-IMG-02). Framework-neutral, deterministic, node-tested.
 *
 * Produces {@link ComposerOperation}s (base-revision coords) the transaction hub
 * commits atomically. The WP1/WP2 patch contract is respected: a mid-paragraph
 * paste is a ZERO-WIDTH insert strictly inside the block's `[from,to)` (it never
 * absorbs the inter-block separator), and a new-block paste is inserted at the
 * end of a block's range with its own blank-line separation. `blockDelta` is
 * reported so the caller can pass `expectedBlockDelta` to the commit's reparse
 * guard.
 */

import type { ComposerOperation } from '@/core/composer';
import type { ComposerDocumentSession } from '../../documentSession';

/** A planned insertion: the operations to apply and the block-count change. */
export interface ImageInsertionPlan {
	operations: ComposerOperation[];
	/** Net change in top-level block count after applying (for the commit guard). */
	blockDelta: number;
}

/**
 * Markdown embed for a single image. Uses an Obsidian wikilink embed with the
 * FULL vault path (unambiguous → stable rename matching). An alt is carried as
 * the wikilink display segment (`![[path|alt]]`).
 */
export function buildImageEmbed(vaultPath: string, alt?: string): string {
	const trimmed = alt?.trim();
	return trimmed && trimmed.length > 0 ? `![[${vaultPath}|${trimmed}]]` : `![[${vaultPath}]]`;
}

/**
 * Plan a new image block inserted AFTER the given block (or at document end when
 * `afterBlockId` is null). Always inserts `\n\n<embed>` at the end of the anchor
 * block's range, so exactly one blank line separates it from the neighbour and
 * the trailing gap (and any following block) is preserved verbatim.
 */
export function planImageInsertAfterBlock(
	session: ComposerDocumentSession,
	afterBlockId: string | null,
	embed: string,
): ImageInsertionPlan {
	const snapshot = session.snapshot;
	if (afterBlockId === null) {
		const at = snapshot.sourceText.length;
		return {
			operations: [{ kind: 'insertBlock', at, text: `\n\n${embed}`, blockKind: 'image' }],
			blockDelta: 1,
		};
	}
	const block = session.getBlock(afterBlockId);
	if (!block) throw new Error(`planImageInsertAfterBlock: unknown block '${afterBlockId}'`);
	return {
		operations: [{ kind: 'insertBlock', at: block.source.to, text: `\n\n${embed}`, blockKind: 'image' }],
		blockDelta: 1,
	};
}

/**
 * Plan a paste INSIDE a block at `offset` (a source offset in `[from,to)`). When
 * the caret sits at a block boundary the split degenerates to a clean
 * before/after new-block insert; otherwise the paragraph is split into
 * before-paragraph / image / after-paragraph via a single interior zero-width
 * insert (`\n\n<embed>\n\n`), which stays strictly inside the block bounds.
 */
export function planImageSplitInsert(
	session: ComposerDocumentSession,
	blockId: string,
	offset: number,
	embed: string,
): ImageInsertionPlan {
	const block = session.getBlock(blockId);
	if (!block) throw new Error(`planImageSplitInsert: unknown block '${blockId}'`);
	const { from, to } = block.source;
	if (offset < from || offset > to) {
		throw new Error(`planImageSplitInsert: offset ${offset} outside block [${from},${to})`);
	}
	const before = session.snapshot.sourceText.slice(from, offset);
	const after = session.snapshot.sourceText.slice(offset, to);
	// Caret at the leading edge → insert a new block before this one.
	if (before.trim().length === 0) {
		return {
			operations: [{ kind: 'insertBlock', at: from, text: `${embed}\n\n`, blockKind: 'image' }],
			blockDelta: 1,
		};
	}
	// Caret at the trailing edge → new block after this one.
	if (after.trim().length === 0) {
		return planImageInsertAfterBlock(session, blockId, embed);
	}
	// True mid-block split → the paragraph becomes three blocks.
	return {
		operations: [{ kind: 'replaceRange', from: offset, to: offset, text: `\n\n${embed}\n\n` }],
		blockDelta: 2,
	};
}

/** True when a native-ref `target` addresses the asset at `vaultPath`. */
export function referencesAsset(target: string, vaultPath: string): boolean {
	const t = target.replace(/#.*$/, '').replace(/\|.*$/, '').trim();
	if (t.length === 0) return false;
	if (t === vaultPath) return true;
	const base = vaultPath.slice(vaultPath.lastIndexOf('/') + 1);
	const tBase = t.slice(t.lastIndexOf('/') + 1);
	// Wikilinks frequently use the basename or a shortest-unique suffix.
	return t === base || tBase === base || vaultPath.endsWith('/' + t);
}

/**
 * Plan the in-document reference rewrite for an asset rename (CMP-IMG-02). Uses
 * the session's typed native refs (no source-scraping regex) to locate every
 * embed of `oldPath` in the CURRENT document and replace its exact source range
 * with a fresh embed of `newPath`, preserving any alt segment. Cross-document
 * references are the reference port's job (fileManager.renameFile).
 */
export function planReferenceRewrite(
	session: ComposerDocumentSession,
	oldPath: string,
	newPath: string,
): { operations: ComposerOperation[]; count: number } {
	const source = session.snapshot.sourceText;
	const operations: ComposerOperation[] = [];
	for (const ref of session.snapshot.nativeRefs) {
		if (!referencesAsset(ref.target, oldPath)) continue;
		const token = source.slice(ref.source.from, ref.source.to);
		const alt = extractEmbedAlt(token);
		operations.push({
			kind: 'replaceRange',
			from: ref.source.from,
			to: ref.source.to,
			text: buildImageEmbed(newPath, alt),
		});
	}
	return { operations, count: operations.length };
}

/** Pull the alt/display segment out of an embed token (`![[p|alt]]` / `![alt](p)`). */
function extractEmbedAlt(token: string): string | undefined {
	const wiki = token.match(/!\[\[[^\]|]*\|([^\]]*)\]\]/);
	if (wiki) return wiki[1].trim() || undefined;
	const md = token.match(/!\[([^\]]*)\]\(/);
	if (md) return md[1].trim() || undefined;
	return undefined;
}
