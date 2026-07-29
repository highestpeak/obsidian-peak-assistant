/**
 * Peak Composer — related-material mapper + focus-context assembly (WP9b
 * integration: real-source related port + focused-block snapshot).
 *
 * Asserts:
 *   (1) `buildRelatedSnapshot` maps search results → a frozen snapshot: complete
 *       ranked items, bounded node-only graph projection, identity node→source
 *       map, default reasons, weak overlay;
 *   (2) `emptyRelatedSnapshot` is the safe degraded value (no items, empty graph);
 *   (3) `buildFocusRunContext` / `resolveRelatedFocus` capture the REAL focused
 *       block (block target + verbatim slice) and default to meaningful body
 *       content rather than YAML frontmatter;
 *   (4) the focus context frozen through `CopilotSessionMachine.send` carries the
 *       focused block id (not a document-level fallback).
 */

import {
	buildRelatedSnapshot,
	emptyRelatedSnapshot,
	selectLocalPreview,
	relatedMaterialCount,
	CopilotSessionMachine,
} from '@/service/composer';
import { buildFocusRunContext, resolveRelatedFocus } from '@/ui/view/composer/sidecar/focusContext';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ComposerBlock, ComposerDocumentSnapshot } from '@/core/composer';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

function item(id: string, path: string, finalScore: number): SearchResultItem {
	return {
		id,
		type: 'markdown' as SearchResultItem['type'],
		title: id.replace(/-/g, ' '),
		path,
		lastModified: 0,
		content: `${id} material preview content`,
		finalScore,
	};
}

// ── (1) buildRelatedSnapshot maps + ranks + caps ────────────────────────────────
{
	const items = [
		item('a', 'notes/a.md', 0.2),
		{ ...item('b', 'projects/b.md', 0.9), content: '---\ntags: [internal]\n---\nReadable source B preview.' },
		item('c', 'c.md', 0.5),
	];
	const snap = buildRelatedSnapshot({
		focus: { anchorId: 'para-1-xy', rootNodeId: 'doc/here.md' },
		revision: 'rev-1',
		items,
		graphNodeCap: 2,
		weakSourceIds: ['a'],
	});
	check('items complete', snap.items.length === 3);
	check('items ranked by score desc', snap.items[0].id === 'b' && snap.items[2].id === 'a');
	check('focus preserved', snap.focus.anchorId === 'para-1-xy' && snap.focus.rootNodeId === 'doc/here.md');
	check('graph capped to graphNodeCap', snap.graph.resultNodes.length === 2);
	check('graph top nodes are strongest', snap.graph.resultNodes[0].id === 'b');
	check('graph overflow counted', snap.graph.overflowCount === 1);
	check('node folder derived from path', snap.graph.resultNodes.some((n) => n.folder === 'projects'));
	check('sourceIdByNodeId is identity over projected nodes', snap.sourceIdByNodeId['b'] === 'b');
	check('reason defaults to empty string', snap.reasonBySourceId['b'] === '');
	check('weak overlay carried', snap.weakNodeIds.includes('a'));

	// preview excludes weak + focus, strongest first, capped.
	const preview = selectLocalPreview(snap, 5, 240);
	check('preview excludes weak node', !preview.some((n) => n.sourceId === 'a'));
	check('preview strongest first', preview[0]?.sourceId === 'b');
	check('preview carries a readable excerpt', preview[0]?.excerpt === 'Readable source B preview.');
	check('preview does not expose leading frontmatter', !preview[0]?.excerpt.includes('tags:'));
	check('material count is items.length', relatedMaterialCount(snap) === 3);
}

// ── (2) emptyRelatedSnapshot is the safe degraded value ─────────────────────────
{
	const empty = emptyRelatedSnapshot({ anchorId: 'para-2', documentId: 'doc/x.md' });
	check('empty has no items', empty.items.length === 0);
	check('empty graph has no nodes', empty.graph.resultNodes.length === 0);
	check('empty focus rootNode is the document', empty.focus.rootNodeId === 'doc/x.md');
	check('empty preview is empty', selectLocalPreview(empty, 6, 240).length === 0);
}

// ── focus fixtures ──────────────────────────────────────────────────────────────
function makeSnapshot(): ComposerDocumentSnapshot {
	const sourceText = '---\ncreated: 2026-07-28\ntags: [qa]\n---\n\n# Title\n\nAlpha paragraph body.\n\nBeta paragraph body.';
	const frontmatterTo = sourceText.indexOf('\n\n# Title');
	const heading = sourceText.indexOf('# Title');
	const alphaFrom = sourceText.indexOf('Alpha');
	const alphaTo = alphaFrom + 'Alpha paragraph body.'.length;
	const betaFrom = sourceText.indexOf('Beta');
	const betaTo = betaFrom + 'Beta paragraph body.'.length;
	const block = (blockId: string, kind: ComposerBlock['kind'], from: number, to: number): ComposerBlock => ({
		blockId,
		kind,
		source: { revision: 'r1', from, to, semanticFingerprint: blockId },
		children: [],
		units: [],
		renderModel: { raw: sourceText.slice(from, to), text: sourceText.slice(from, to) } as ComposerBlock['renderModel'],
	});
	return {
		documentId: 'doc/here.md',
		filePath: 'doc/here.md',
		revision: 'r1',
		sourceText,
		blocks: [
			block('frontmatter-0-f', 'frontmatter', 0, frontmatterTo),
			block('heading-0-t', 'heading', heading, heading + '# Title'.length),
			block('paragraph-1-a', 'paragraph', alphaFrom, alphaTo),
			block('paragraph-2-b', 'paragraph', betaFrom, betaTo),
		],
		nativeRefs: [],
	};
}

// ── (3) buildFocusRunContext captures the real focused block ────────────────────
{
	const snapshot = makeSnapshot();
	const focused = buildFocusRunContext(snapshot, 'paragraph-2-b');
	check('focus target is block', focused.snapshot.target.kind === 'block');
	check(
		'focus target is the focused block',
		focused.snapshot.target.kind === 'block' && focused.snapshot.target.blockId === 'paragraph-2-b',
	);
	check('focus targetSource is verbatim slice', focused.snapshot.targetSource === 'Beta paragraph body.');
	check('focus targetQuote is the block text', focused.targetQuote === 'Beta paragraph body.');
	check('focus documentId is real', focused.snapshot.documentId === 'doc/here.md');
	check('focus revision is snapshot revision', focused.snapshot.revision === 'r1');
	check('focus nearby captured', (focused.snapshot.nearby?.before ?? '').includes('Alpha'));

	// no focus → first meaningful body block, never YAML frontmatter.
	const doc = buildFocusRunContext(snapshot, null);
	check('no-focus target is the first body block', doc.snapshot.target.kind === 'block');
	check(
		'no-focus target skips frontmatter',
		doc.snapshot.target.kind === 'block'
			&& doc.snapshot.target.blockId === 'heading-0-t'
			&& doc.snapshot.targetSource === '# Title',
	);

	// null snapshot → hard document fallback.
	const none = buildFocusRunContext(null, 'paragraph-2-b');
	check('null snapshot → document fallback', none.snapshot.target.kind === 'document');
	check('null snapshot → placeholder documentId', none.snapshot.documentId === 'document');
}

// ── resolveRelatedFocus resolves the query text ─────────────────────────────────
{
	const snapshot = makeSnapshot();
	const focus = resolveRelatedFocus(snapshot, 'paragraph-1-a');
	check('related anchor is the focused block', focus.anchorId === 'paragraph-1-a');
	check('related documentId is real', focus.documentId === 'doc/here.md');
	check('related focusText is the block slice', focus.focusText === 'Alpha paragraph body.');

	const docFocus = resolveRelatedFocus(snapshot, null);
	check('no-focus related anchor is the first body block', docFocus.anchorId === 'heading-0-t');
	check('no-focus related focusText skips frontmatter', docFocus.focusText === '# Title');

	const none = resolveRelatedFocus(null, 'x');
	check('null snapshot related focus is empty', none.focusText === '' && none.documentId === 'document');
}

// ── (4) focus context frozen through send carries the block id ──────────────────
{
	const snapshot = makeSnapshot();
	const m = new CopilotSessionMachine();
	m.openSession('润色 Beta 段');
	const ctx = buildFocusRunContext(snapshot, 'paragraph-2-b');
	const frozen = m.send({ snapshot: ctx.snapshot, targetQuote: ctx.targetQuote });
	check(
		'frozen run context captures the focused block',
		frozen.snapshot.target.kind === 'block' && frozen.snapshot.target.blockId === 'paragraph-2-b',
	);
	check('frozen targetSource preserved', frozen.snapshot.targetSource === 'Beta paragraph body.');
	check('frozen context is immutable', Object.isFrozen(frozen));
}

if (failures > 0) {
	console.error(`\n${failures}/${count} related-materials assertion(s) failed`);
	process.exit(1);
}
console.log(`OK composer-related-materials (${count} assertions)`);
