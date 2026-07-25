/**
 * Peak Composer — comment anchors & store (WP4, CMP-COMMENT-01).
 *
 * Comments bind to a block (whole-block or a sub-range) beside the document, and
 * survive edits via matchBlocks-based revalidation: an unrelated edit migrates
 * the anchor's block id and keeps it active; an edit that relocates the quote
 * re-points the range; an edit that removes the anchored text marks it stale —
 * never silently dropped, never written into Markdown. The store persists
 * through an injected port.
 */

import { parseComposerDocument } from '@/service/composer';
import { makeCommentAnchor, revalidateComments, ComposerCommentStore } from '@/service/composer';
import type { ComposerComment, ComposerCommentPersistencePort } from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const V1 = '# Title\n\nAlpha paragraph about foxes.\n\nBravo paragraph about hounds.\n';

function commentOn(anchor: ReturnType<typeof makeCommentAnchor>, body: string): ComposerComment {
	if (!anchor) throw new Error('anchor');
	const now = Date.now();
	return { commentId: 'c1', anchor, body, status: 'active', createdAt: now, updatedAt: now };
}

// ── anchor construction ───────────────────────────────────────────────────────
const s1 = parseComposerDocument(V1, { filePath: 'c.md' });
const bravo = s1.blocks.find((b) => b.source.from === V1.indexOf('Bravo'))!;
const wholeAnchor = makeCommentAnchor(s1, bravo.blockId);
check('whole-block anchor has no range', !!wholeAnchor && wholeAnchor.range === undefined);
check('whole-block anchor quotes the block', !!wholeAnchor && wholeAnchor.quote.includes('Bravo paragraph'));

const foxFrom = V1.indexOf('foxes');
const subAnchor = makeCommentAnchor(s1, s1.blocks.find((b) => b.source.from === V1.indexOf('Alpha'))!.blockId, {
	from: foxFrom,
	to: foxFrom + 'foxes'.length,
});
check('sub-range anchor quotes the selection', !!subAnchor && subAnchor.quote === 'foxes');

// ── migrate across an unrelated edit ──────────────────────────────────────────
// Edit the Alpha paragraph (unrelated to the Bravo whole-block comment).
const V2 = V1.replace('Alpha paragraph about foxes.', 'Alpha paragraph about clever foxes and cats.');
const s2 = parseComposerDocument(V2, { filePath: 'c.md' });
const migrated = revalidateComments([commentOn(wholeAnchor, 'note on bravo')], s1, s2);
check('unrelated edit keeps the comment active', migrated[0].status === 'active');
check('unrelated edit migrates the block id', migrated[0].anchor.blockId === s2.blocks.find((b) => b.source.from === V2.indexOf('Bravo'))!.blockId);

// ── relocate a sub-range when its quote moves ─────────────────────────────────
const relocated = revalidateComments([commentOn(subAnchor, 'about foxes')], s1, s2);
check('quote that still exists stays active', relocated[0].status === 'active');
const relRange = relocated[0].anchor.range!;
check('relocated range still points at the quote', V2.slice(relRange.from, relRange.to) === 'foxes', V2.slice(relRange.from, relRange.to));

// ── go stale when the anchored text disappears ────────────────────────────────
const V3 = V1.replace('about foxes', 'about badgers');
const s3 = parseComposerDocument(V3, { filePath: 'c.md' });
const staled = revalidateComments([commentOn(subAnchor, 'about foxes')], s1, s3);
check('removed quote goes stale', staled[0].status === 'stale');
check('stale comment is not dropped', staled.length === 1);

// ── store + persistence port ──────────────────────────────────────────────────
async function testStore(): Promise<void> {
	const saved: ComposerComment[][] = [];
	const port: ComposerCommentPersistencePort = {
		async load() {
			return [];
		},
		async save(_docId, comments) {
			saved.push([...comments]);
		},
	};
	const store = new ComposerCommentStore('c.md', port);
	let emitted = 0;
	store.subscribe(() => (emitted += 1));
	const added = store.add({ anchor: wholeAnchor!, body: 'hello' });
	check('store emits on add', emitted >= 2);
	check('store persists on add', saved.length >= 1 && saved.at(-1)!.length === 1);
	check('forBlock returns the comment', store.forBlock(wholeAnchor!.blockId).length === 1);
	store.updateBody(added.commentId, 'edited');
	check('update changes the body', store.list()[0].body === 'edited');
	store.remove(added.commentId);
	check('remove clears the store', store.list().length === 0);
	check('remove persisted the empty set', saved.at(-1)!.length === 0);
	done('composer-comment-anchor');
}

void testStore();
