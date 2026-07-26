/**
 * Peak Composer — multi-image layout (WP7, CMP-IMG-08).
 *
 * Covers the deterministic layout HTML generator + the layout block ops + the
 * coordinator's deterministic apply and AI smart-layout:
 *   - all four modes render distinct, Markdown-embeddable HTML;
 *   - every image src is a VAULT path, never a base64 data URI;
 *   - alt / caption are HTML-escaped;
 *   - insert / replace planners produce correct ops (round-trip through the doc);
 *   - `commitLayout` writes the block atomically; `beginLayoutSuggest` yields a
 *     typed image-layout-patch candidate that accepts into the document.
 */

import { applyOperations, type ComposerResultEnvelope } from '@/core/composer';
import {
	renderLayoutHtml,
	isLayoutBlockSource,
	planLayoutInsert,
	planLayoutReplace,
	LAYOUT_MARKER_ATTR,
	ImageCapabilityCoordinator,
	type ComposerImageLayoutSpec,
	type ComposerImageAttachmentPort,
	type ComposerImageReferencePort,
	type ComposerImageEditPort,
	type ComposerImageTextPort,
	type ComposerImageLayoutPatchPayload,
} from '@/service/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const ITEMS = [
	{ path: 'Attachments/a.png', alt: 'Alpha', caption: 'First' },
	{ path: 'Attachments/b.png', alt: 'Beta' },
	{ path: 'Attachments/c.png' },
];

function spec(mode: ComposerImageLayoutSpec['mode']): ComposerImageLayoutSpec {
	return { mode, items: ITEMS, gap: 12, columns: 3 };
}

// ── deterministic HTML ────────────────────────────────────────────────────────

function testRenderModes(): void {
	const row = renderLayoutHtml(spec('row'));
	check('row: marker + flex', row.includes(`${LAYOUT_MARKER_ATTR}="row"`) && row.includes('display:flex'));
	const grid = renderLayoutHtml(spec('grid'));
	check('grid: marker + 3 columns', grid.includes(`${LAYOUT_MARKER_ATTR}="grid"`) && grid.includes('repeat(3,1fr)'));
	const hero = renderLayoutHtml(spec('hero-thumbs'));
	check('hero: marker + thumb row', hero.includes(`${LAYOUT_MARKER_ATTR}="hero-thumbs"`) && hero.includes('margin-top:12px'));
	const masonry = renderLayoutHtml(spec('masonry'));
	check('masonry: column-count', masonry.includes(`${LAYOUT_MARKER_ATTR}="masonry"`) && masonry.includes('column-count:3'));

	for (const html of [row, grid, hero, masonry]) {
		check('all: 3 images present', (html.match(/<img /g) ?? []).length === 3);
		check('all: vault paths in src', html.includes('src="Attachments/a.png"'));
		check('all: NO base64 data URI', !html.includes('data:image') && !html.includes('base64'));
		check('all: caption rendered', html.includes('First'));
	}
	check('isLayoutBlockSource detects marker', isLayoutBlockSource(grid) && !isLayoutBlockSource('plain text'));
}

function testEscaping(): void {
	const html = renderLayoutHtml({
		mode: 'grid',
		items: [{ path: 'a.png', alt: 'A & "quote" <b>', caption: 'x < y & z' }],
	});
	check('escape: alt attr escaped', html.includes('&amp;') && html.includes('&quot;') && html.includes('&lt;b&gt;'));
	check('escape: caption text escaped', html.includes('x &lt; y &amp; z'));
}

// ── block ops ─────────────────────────────────────────────────────────────────

function testInsertReplacePlanners(): void {
	const vault = new FakeVault();
	const src = '# Title\n\nBody paragraph.\n';
	const session = openSession(vault, 't.md', src);
	const para = blockOfKind(session, 'paragraph');
	const html = renderLayoutHtml(spec('grid'));

	const insertAfter = planLayoutInsert(session, para.blockId, html);
	check('insert: delta +1', insertAfter.blockDelta === 1);
	const inserted = applyOperations(src, insertAfter.operations);
	check('insert: html present after paragraph', inserted.includes(html) && inserted.indexOf('Body') < inserted.indexOf(LAYOUT_MARKER_ATTR));

	const insertEnd = planLayoutInsert(session, null, html);
	check('insert at end: html appended', applyOperations(src, insertEnd.operations).trimEnd().endsWith('</div>'));
}

async function testReplacePlanner(): Promise<void> {
	const vault = new FakeVault();
	const existing = renderLayoutHtml(spec('row'));
	const src = `Intro.\n\n${existing}\n`;
	const session = openSession(vault, 'r.md', src);
	const layoutBlock = session.snapshot.blocks.find((b) => isLayoutBlockSource(b.renderModel.raw))!;
	check('replace: existing layout block found', !!layoutBlock);
	const nextHtml = renderLayoutHtml(spec('grid'));
	const plan = planLayoutReplace(session, layoutBlock.blockId, nextHtml);
	check('replace: delta 0', plan.blockDelta === 0);
	const next = applyOperations(src, plan.operations);
	check('replace: switched row → grid', next.includes(`${LAYOUT_MARKER_ATTR}="grid"`) && !next.includes(`${LAYOUT_MARKER_ATTR}="row"`));
}

// ── coordinator ───────────────────────────────────────────────────────────────

class NoopAttachment implements ComposerImageAttachmentPort {
	attachmentFolder() {
		return 'Attachments';
	}
	async save() {
		return { path: 'Attachments/x.png' };
	}
	async overwrite() {}
	previewUri(p: string) {
		return p;
	}
}
class NoopReference implements ComposerImageReferencePort {
	async findReferences() {
		return [];
	}
	async rename() {}
	async backup(p: string) {
		return { backupPath: p };
	}
}
class NoopEdit implements ComposerImageEditPort {
	async edit() {
		return { paths: [], mimeType: 'image/png' };
	}
}
class LayoutTextPort implements ComposerImageTextPort {
	async complete() {
		return '```json\n{"mode":"hero-thumbs","items":[{"path":"Attachments/a.png"},{"path":"Attachments/b.png"}]}\n```';
	}
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function makeCoord(vault: FakeVault, path: string, src: string) {
	const session = openSession(vault, path, src);
	const hub = makeHub(vault, session);
	const coordinator = new ImageCapabilityCoordinator({
		session,
		hub,
		attachment: new NoopAttachment(),
		reference: new NoopReference(),
		edit: new NoopEdit(),
		text: new LayoutTextPort(),
	});
	return { session, hub, coordinator };
}

async function testCommitLayout(): Promise<void> {
	const vault = new FakeVault();
	const { session, coordinator } = makeCoord(vault, 'c.md', 'Body.\n');
	const before = session.snapshot.blocks.length;
	await coordinator.commitLayout({ spec: spec('grid'), insertion: { kind: 'after-block', blockId: null } });
	check('commitLayout: block added', session.snapshot.blocks.length === before + 1);
	check('commitLayout: html in doc', vault.read('c.md').includes(`${LAYOUT_MARKER_ATTR}="grid"`));
}

async function testSmartLayout(): Promise<void> {
	const vault = new FakeVault();
	const { hub, coordinator } = makeCoord(vault, 's.md', 'Body.\n');
	coordinator.beginLayoutSuggest({
		items: ITEMS,
		instruction: 'make a hero collage',
		afterBlockId: null,
	});
	await flush();
	const ready = hub.projection().candidates[0];
	check('smart layout: ready', ready.status === 'ready');
	const env = ready.proposedChange.result as ComposerResultEnvelope<ComposerImageLayoutPatchPayload>;
	check('smart layout: typed patch', env.resultKind === 'image-layout-patch' && env.payload.layout.mode === 'hero-thumbs');
	await coordinator.accept(ready.candidateId);
	check('smart layout: html committed', vault.read('s.md').includes(`${LAYOUT_MARKER_ATTR}="hero-thumbs"`));
}

async function main(): Promise<void> {
	testRenderModes();
	testEscaping();
	testInsertReplacePlanners();
	await testReplacePlanner();
	await testCommitLayout();
	await testSmartLayout();
	done('composer-image-layout');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
