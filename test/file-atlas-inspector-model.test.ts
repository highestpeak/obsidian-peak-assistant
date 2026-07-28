import assert from 'assert';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import {
	analysisText,
	computeVisibility,
	defaultCollapsedIds,
	keywordsOf,
	statisticsOf,
} from '@/ui/view/file-atlas/atlasTreeModel';

function block(
	kind: DocumentBlock['kind'],
	source: string,
	options: Partial<DocumentBlock> = {},
): DocumentBlock {
	return {
		id: `${kind}-1`,
		kind,
		title: source.split('\n')[0].replace(/^#+\s*/, ''),
		source,
		anchor: {
			filePath: 'fixture.md',
			blockId: `${kind}-1`,
			nearestHeading: null,
			blockType: kind,
			ordinalInHeading: 0,
			contentHash: '',
			lineStart: 1,
			lineEnd: Math.max(1, source.split('\n').length),
			status: 'active',
		},
		...options,
	};
}

const paragraph = block(RawBlockKind.Paragraph, 'hello world');
assert.strictEqual(analysisText(paragraph), 'hello world', 'derived title is not counted twice');
assert.deepStrictEqual(
	statisticsOf(paragraph),
	{ words: 2, characters: 10, lines: 1 },
);

const task = block(RawBlockKind.Task, '- [x] ship owner review', {
	detail: { checked: true },
});
assert.strictEqual(statisticsOf(task).status, 'Checked');
assert.ok(analysisText(task).startsWith('ship owner review'));

const list = block(RawBlockKind.List, '- first item\n- [x] second item', {
	title: 'Bullet list',
	detail: { itemCount: 2, ordered: false },
	children: [
		block(RawBlockKind.ListItem, '- first item'),
		block(RawBlockKind.Task, '- [x] second item', { detail: { checked: true } }),
	],
});
const listStats = statisticsOf(list);
assert.strictEqual(listStats.items, 2);
assert.strictEqual(listStats.tasks, 1);
assert.strictEqual(listStats.checked, 1);
assert.strictEqual(listStats.unchecked, 0);
assert.doesNotMatch(analysisText(list), /Bullet list/, 'container label is not keyword content');

const table = block(RawBlockKind.Table, '| A | B |\n| - | - |\n| 1 | 2 |', {
	detail: { rows: 1, columns: 2 },
});
assert.strictEqual(statisticsOf(table).rows, 1);
assert.strictEqual(statisticsOf(table).columns, 2);

const code = block(RawBlockKind.Code, '```ts\nconst value = 1;\n```', {
	detail: { language: 'ts', lineCount: 1 },
});
assert.strictEqual(statisticsOf(code).codeLines, 1);
assert.strictEqual(statisticsOf(code).language, 'ts');

const heading = block(RawBlockKind.Heading, '# Head', {
	title: 'Head',
	children: [block(RawBlockKind.Paragraph, 'child text')],
});
assert.strictEqual(
	statisticsOf(heading).words,
	3,
	'heading section includes heading and child exactly once',
);

const cjk = block(RawBlockKind.Paragraph, '确定性来自持续验证');
assert.ok(statisticsOf(cjk).words > 0, 'CJK text receives a non-zero word count');

const resource = block(RawBlockKind.ExternalLink, '[Docs](https://example.com)', {
	title: 'Docs',
	detail: { target: 'https://example.com', domain: 'example.com' },
});
assert.match(analysisText(resource), /example\.com/);
assert.ok(
	keywordsOf(analysisText(resource), { latin: [], cjk: [] }).length > 0,
	'resource blocks also produce keyword candidates',
);

const nestedItem = block(RawBlockKind.ListItem, '- parent item', {
	children: [block(RawBlockKind.List, '- nested child')],
});
const nestedSearch = computeVisibility(
	[nestedItem],
	new Set([RawBlockKind.List]),
	'parent',
);
assert.strictEqual(nestedSearch.hits, 1, 'a collapsible list item remains a search hit');

const ownedLink = block(RawBlockKind.VaultLink, '[[Owned Link]]', { title: 'Owned Link' });
const linkedItem = block(RawBlockKind.ListItem, '- [[Owned Link]]', {
	children: [ownedLink],
});
const linkedList = block(RawBlockKind.List, '- [[Owned Link]]', {
	children: [linkedItem],
	detail: { itemCount: 1 },
});
const resourceOnlyVisibility = computeVisibility(
	[linkedList],
	new Set([RawBlockKind.VaultLink]),
	'',
);
assert.ok(resourceOnlyVisibility.visible.has(linkedList.id), 'list ancestor remains visible');
assert.ok(resourceOnlyVisibility.visible.has(linkedItem.id), 'owning item remains visible');
assert.ok(resourceOnlyVisibility.visible.has(ownedLink.id), 'owned link respects resource filter');
assert.ok(
	!defaultCollapsedIds([linkedList], linkedList.id).has(linkedItem.id),
	'a resource-owning item starts open so its link is not silently hidden',
);

console.log('PASS: File Atlas Inspector analysis and statistics model');
