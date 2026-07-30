import assert from 'assert';
import { parseComposerDocument } from '@/service/composer/documentParser';
import { resolveComposerSourceLocation } from '@/service/composer/sourceLocation';
import { selectDocumentLocationLeaf } from '@/app/composer/DocumentLocationPolicy';

const source = [
	'---',
	'status: active',
	'tags: [atlas, composer]',
	'---',
	'# Overview',
	'Alpha with [[Target Note]] and https://example.com.',
	'',
	'- first item',
	'- second item',
	'',
	'## Details',
	'Final paragraph.',
].join('\n');

const snapshot = parseComposerDocument(source, 'Example.md');

const secondItemFrom = source.indexOf('second item');
const secondItem = resolveComposerSourceLocation(snapshot, {
	line: 8,
	from: secondItemFrom,
	to: secondItemFrom + 'second item'.length,
	text: 'second item',
});
assert.equal(secondItem?.block.kind, 'list');
assert.equal(secondItem?.unit?.unitKind, 'list-item');
assert.equal(
	source.slice(secondItem!.unit!.from, secondItem!.unit!.to).includes('second item'),
	true,
);

const linkFrom = source.indexOf('[[Target Note]]');
const link = resolveComposerSourceLocation(snapshot, {
	line: 5,
	from: linkFrom,
	to: linkFrom + '[[Target Note]]'.length,
	text: '[[Target Note]]',
});
assert.equal(link?.block.kind, 'paragraph');
assert.equal(link?.sourceFrom, linkFrom);

const driftedLink = resolveComposerSourceLocation(snapshot, {
	line: 5,
	from: linkFrom - 4,
	to: linkFrom + 100,
	text: '[[Target Note]]',
});
assert.equal(driftedLink?.sourceFrom, linkFrom, 'line-local text repairs a stale source offset');
assert.equal(
	driftedLink?.sourceTo,
	linkFrom + '[[Target Note]]'.length,
	'a repaired start does not retain a stale end offset',
);

const property = resolveComposerSourceLocation(snapshot, {
	line: 1,
	from: source.indexOf('status: active'),
	to: source.indexOf('status: active') + 'status: active'.length,
	text: 'status: active',
	frontmatterKey: 'status',
});
assert.equal(property?.block.kind, 'frontmatter');
assert.equal(property?.frontmatterKey, 'status');

const byLine = resolveComposerSourceLocation(snapshot, { line: 11 });
assert.equal(byLine?.block.kind, 'paragraph');
assert.equal(byLine?.block.renderModel.text, 'Final paragraph.');

type Leaf = { id: string };
const markdown = { id: 'markdown' };
const composer = { id: 'composer' };
const other = { id: 'other' };
const candidates = [
	{ leaf: markdown, path: 'Example.md', view: 'markdown' as const, active: false },
	{ leaf: composer, path: 'Example.md', view: 'composer' as const, active: true },
	{ leaf: other, path: 'Other.md', view: 'composer' as const, active: false },
];

assert.equal(
	selectDocumentLocationLeaf<Leaf>(candidates, 'Example.md', 'markdown'),
	composer,
	'the active same-file leaf wins even when another view kind was preferred',
);
assert.equal(
	selectDocumentLocationLeaf<Leaf>(
		candidates.map((candidate) => ({ ...candidate, active: false })),
		'Example.md',
		'composer',
	),
	composer,
	'the preferred existing view wins when no same-file leaf is active',
);
assert.equal(
	selectDocumentLocationLeaf<Leaf>(
		candidates.map((candidate) => ({ ...candidate, active: false })),
		'Example.md',
		'markdown',
	),
	markdown,
);
assert.equal(selectDocumentLocationLeaf<Leaf>(candidates, 'Missing.md', 'composer'), null);

console.log('PASS: document location resolves Composer blocks/units and preserves leaf identity');
