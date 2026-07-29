/**
 * Peak Composer — selection partition, mark serialization & guards (WP4,
 * CMP-SEL-01..05 / CMP-LINK-01).
 *
 * Pure service-layer logic (no DOM): given a parsed snapshot and a source range,
 *   - the range partitions into one unit per semantic inline unit (paragraph /
 *     list item / table cell), with the right cross-structure scope;
 *   - the mark serializer writes ONE in-range patch per unit, never a wrapper
 *     that spans a structural node, and re-parses to a stable top-level Block
 *     count;
 *   - mark application is mark-aware: it toggles off, keeps whitespace outside,
 *     absorbs an adjacent identical mark, and never emits `****`;
 *   - a Code Block selection refuses rich formatting;
 *   - Paste-URL only links a single semantic unit and refuses across a boundary.
 */

import { applyOperations, type ComposerSelection } from '@/core/composer';
import {
	parseComposerDocument,
	partitionSourceRange,
	applyMarkToSelection,
	removeInlineMarkWrapper,
	pasteUrlIntoSelection,
	projectSourceVisualParts,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const DOC = [
	'# Heading one', // heading
	'', // 1
	'The quick brown fox jumps over the lazy dog.', // paragraph A
	'', // 3
	'A second prose paragraph with more words here.', // paragraph B
	'', // 5
	'- alpha item', // list item 0
	'- bravo item', // list item 1
	'- charlie item', // list item 2
	'', // 9
	'| h1 | h2 | h3 |', // table header
	'| --- | --- | --- |',
	'| a1 | b1 | c1 |',
	'| a2 | b2 | c2 |',
	'', //
	'```ts', // code
	'const x = 1;',
	'```',
	'',
].join('\n');

function idx(sub: string): number {
	const i = DOC.indexOf(sub);
	if (i < 0) throw new Error(`fixture missing: ${sub}`);
	return i;
}

const snapshot = parseComposerDocument(DOC, { filePath: 'sel.md' });

function stableBlockCount(sel: ComposerSelection, next: string): boolean {
	const before = parseComposerDocument(sel.sourceText).blocks.length;
	const after = parseComposerDocument(next).blocks.length;
	return before === after;
}

// ── partition scopes ──────────────────────────────────────────────────────────

function testScopes(): void {
	// cross-paragraph: from inside paragraph A to inside paragraph B.
	const pA = idx('quick brown');
	const pB = idx('more words');
	const crossPara = partitionSourceRange(snapshot, pA, pB + 5);
	check('cross-paragraph scope', crossPara.scope === 'cross-paragraph', crossPara.scope);
	check('cross-paragraph two units', crossPara.units.length === 2, String(crossPara.units.length));
	check(
		'cross-paragraph units are distinct blocks',
		new Set(crossPara.units.map((u) => u.blockId)).size === 2,
	);

	// cross-item: across three list items.
	const li0 = idx('alpha item');
	const li2 = idx('charlie item');
	const crossItem = partitionSourceRange(snapshot, li0, li2 + 'charlie item'.length);
	check('cross-item scope', crossItem.scope === 'cross-item', crossItem.scope);
	check('cross-item three units', crossItem.units.length === 3, String(crossItem.units.length));
	check('cross-item units are list-items', crossItem.units.every((u) => u.unitKind === 'list-item'));

	// cross-cell: across body-row cells.
	const cellA = idx('a1');
	const cellC = idx('c2');
	const crossCell = partitionSourceRange(snapshot, cellA, cellC + 2);
	check('cross-cell scope', crossCell.scope === 'cross-cell', crossCell.scope);
	check('cross-cell many units', crossCell.units.length >= 4, String(crossCell.units.length));
	check('cross-cell units are cells', crossCell.units.every((u) => u.unitKind === 'table-cell'));

	// cross-block: paragraph B into the list.
	const crossBlock = partitionSourceRange(snapshot, pB, idx('bravo item') + 5);
	check('cross-block scope', crossBlock.scope === 'cross-block', crossBlock.scope);
	check('cross-block spans >1 block', new Set(crossBlock.units.map((u) => u.blockId)).size >= 2);
}

// ── per-unit mark serialization (never a structural wrapper) ──────────────────

function testCrossStructureFormatting(): void {
	const li0 = idx('alpha item');
	const li2 = idx('charlie item');
	const sel = partitionSourceRange(snapshot, li0, li2 + 'charlie item'.length);
	const res = applyMarkToSelection(sel, 'bold');
	check('bold cross-item ok', res.ok === true);
	if (!res.ok) return;
	check('one op per selected unit', res.operations.length === sel.units.length, String(res.operations.length));
	// every op stays inside its unit's owning block range (no boundary crossing).
	const okBounds = res.operations.every((op) => {
		if (op.kind !== 'replaceRange') return false;
		const owner = snapshot.blocks.find((b) => b.source.from <= op.from && b.source.to >= op.to);
		return Boolean(owner);
	});
	check('ops stay inside a block', okBounds);
	const next = applyOperations(sel.sourceText, res.operations);
	check('bold produces no empty ****', !next.includes('****'));
	check('bold keeps 3 list items', (next.match(/^- /gm) ?? []).length === 3);
	check('cross-item formatting keeps block count', stableBlockCount(sel, next));
	check('each item is wrapped', (next.match(/\*\*/g) ?? []).length === 6);
}

function testColorAcrossCells(): void {
	const cellA = idx('a1');
	const cellC = idx('c2');
	const sel = partitionSourceRange(snapshot, cellA, cellC + 2);
	const res = applyMarkToSelection(sel, 'text-color', { value: '#b42318' });
	check('color cross-cell ok', res.ok === true);
	if (!res.ok) return;
	const next = applyOperations(sel.sourceText, res.operations);
	check('color writes a span per cell', (next.match(/<span style="color: #b42318">/g) ?? []).length === sel.units.length);
	check('color keeps table structure', stableBlockCount(sel, next));
	check('table still has 4 rows', (next.match(/^\| /gm) ?? []).length === 4);
}

// ── mark-aware behaviour ──────────────────────────────────────────────────────

function testMarkAware(): void {
	// whitespace stays outside the wrap; toggle off round-trips.
	const src = 'hello world foo';
	const snap = parseComposerDocument(src);
	const from = src.indexOf('world');
	const sel = partitionSourceRange(snap, from - 1, from + 'world'.length + 1); // includes a space each side
	const on = applyMarkToSelection(sel, 'bold');
	check('bold ok', on.ok === true);
	if (!on.ok) return;
	const bolded = applyOperations(src, on.operations);
	check('whitespace kept outside wrap', bolded.includes('hello **world** foo'), bolded);

	// toggle off: selecting the exact **world** strips it.
	const snap2 = parseComposerDocument(bolded);
	const wFrom = bolded.indexOf('**world**');
	const sel2 = partitionSourceRange(snap2, wFrom, wFrom + '**world**'.length);
	const off = applyMarkToSelection(sel2, 'bold');
	check('toggle-off ok', off.ok === true);
	if (!off.ok) return;
	const plain = applyOperations(bolded, off.operations);
	check('toggle-off removes the mark', plain.includes('hello world foo'), plain);

	// adjacency absorption: bolding text touching an existing bold never doubles.
	const src3 = 'x**bold**y and more';
	const snap3 = parseComposerDocument(src3);
	const yFrom = src3.indexOf('y and');
	const sel3 = partitionSourceRange(snap3, yFrom, yFrom + 1); // just "y"
	const merged = applyMarkToSelection(sel3, 'bold');
	check('absorption ok', merged.ok === true);
	if (!merged.ok) return;
	const out = applyOperations(src3, merged.operations);
	check('absorption emits no ****', !out.includes('****'), out);
	check('absorption merges into one bold', out.includes('**boldy**'), out);
}

function testDirectTokenRemoval(): void {
	const cases: Array<{ source: string; mark: 'bold' | 'underline' | 'text-color' | 'highlight'; expected: string }> = [
		{ source: '**strong**', mark: 'bold', expected: 'strong' },
		{ source: '<u>under</u>', mark: 'underline', expected: 'under' },
		{ source: '<span style="color: #b42318">red</span>', mark: 'text-color', expected: 'red' },
		{ source: '==important==', mark: 'highlight', expected: 'important' },
	];
	for (const item of cases) {
		const op = removeInlineMarkWrapper(item.source, item.mark, { from: 0, to: item.source.length });
		const next = op ? applyOperations(item.source, [op]) : null;
		check(`direct token removal: ${item.mark}`, next === item.expected, String(next));
	}
}

function testOverlappingRichMarksStayRendered(): void {
	const source =
		'Alpha <mark style="background: #dff4e8">green middle</mark> omega tail';
	const visible = 'Alpha green middle omega tail';
	const snap = parseComposerDocument(source);
	// Start inside the existing mark and end outside it — the exact boundary
	// crossing that used to emit `<mark new>…</mark old>…</mark new>`.
	const from = source.indexOf('middle');
	const to = source.indexOf('omega') + 'omega'.length;
	const sel = partitionSourceRange(snap, from, to);
	const highlighted = applyMarkToSelection(sel, 'highlight', { value: '#dfeaff' });
	check('overlap highlight applies', highlighted.ok === true);
	if (!highlighted.ok) return;
	const next = applyOperations(source, highlighted.operations);
	check('overlap highlight keeps HTML properly nested', htmlTagsAreNested(next), next);
	check('overlap highlight never exposes raw HTML', projectedVisible(next) === visible, projectedVisible(next));
}

function testLinkAcrossStyledRunsStayRendered(): void {
	const source =
		'Alpha <mark style="background: #dff4e8">green middle</mark> omega tail';
	const visible = 'Alpha green middle omega tail';
	const snap = parseComposerDocument(source);
	const from = source.indexOf('green');
	const to = source.indexOf('omega') + 'omega'.length;
	const sel = partitionSourceRange(snap, from, to);
	const linked = pasteUrlIntoSelection(sel, 'https://example.com');
	check('styled link applies', linked.ok === true);
	if (!linked.ok) return;
	const next = applyOperations(source, linked.operations);
	check('styled link keeps HTML properly nested', htmlTagsAreNested(next), next);
	check('styled link never exposes raw HTML', projectedVisible(next) === visible, projectedVisible(next));
	const links = projectSourceVisualParts(next, 0, { mathMode: 'source' })
		.filter((part) => part.kind === 'run' && part.linkTarget === 'https://example.com');
	check('styled link preserves linked visible segments', links.length >= 2, JSON.stringify(links));
}

function projectedVisible(source: string): string {
	return projectSourceVisualParts(source, 0, { mathMode: 'source' })
		.map((part) => {
			if (part.kind === 'hidden') return '';
			if (part.kind === 'math') return part.latex;
			return part.text;
		})
		.join('');
}

function htmlTagsAreNested(source: string): boolean {
	const stack: string[] = [];
	for (const match of source.matchAll(/<(\/?)(mark|span|u)\b[^>]*>/gi)) {
		const closing = match[1] === '/';
		const name = match[2].toLowerCase();
		if (!closing) {
			stack.push(name);
			continue;
		}
		if (stack.pop() !== name) return false;
	}
	return stack.length === 0;
}

// ── guards ────────────────────────────────────────────────────────────────────

function testCodeGuard(): void {
	const codeFrom = idx('const x = 1;');
	const sel = partitionSourceRange(snapshot, codeFrom, codeFrom + 'const x'.length);
	const res = applyMarkToSelection(sel, 'bold');
	check('code block refuses rich formatting', res.ok === false && res.reason === 'code-block-rich-format');
}

function testUrlPaste(): void {
	// single unit → link written.
	const pA = idx('quick brown');
	const single = partitionSourceRange(snapshot, pA, pA + 'quick'.length);
	const okRes = pasteUrlIntoSelection(single, 'https://example.com/x');
	check('single-unit paste ok', okRes.ok === true);
	if (okRes.ok) {
		const next = applyOperations(single.sourceText, okRes.operations);
		check('paste writes a markdown link', next.includes('[quick](https://example.com/x)'), next);
	}
	// internal target → wikilink.
	const internal = pasteUrlIntoSelection(single, 'ignored', { internalTarget: '知识库' });
	check('internal paste ok', internal.ok === true);
	if (internal.ok) {
		const next = applyOperations(single.sourceText, internal.operations);
		check('internal paste writes a wikilink', next.includes('[[知识库|quick]]'), next);
	}
	// cross-cell → refused, nothing changes.
	const cellA = idx('a1');
	const cellC = idx('c2');
	const cross = partitionSourceRange(snapshot, cellA, cellC + 2);
	const refused = pasteUrlIntoSelection(cross, 'https://example.com/y');
	check('cross-structure link refused', refused.ok === false && refused.reason === 'cross-structure-link');
}

testScopes();
testCrossStructureFormatting();
testColorAcrossCells();
testMarkAware();
testDirectTokenRemoval();
testOverlappingRichMarksStayRendered();
testLinkAcrossStyledRunsStayRendered();
testCodeGuard();
testUrlPaste();
done('composer-selection-partition');
