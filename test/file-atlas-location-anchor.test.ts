import assert from 'assert';
import { parseDocumentBlocks } from '@/core/document/atlas/documentBlockParser';
import { RawBlockKind, type DocumentBlock } from '@/core/document/atlas/types';

const source = [
	'---',
	'status: active',
	'tags: [atlas, composer]',
	'---',
	'# Atlas',
	'Read [[Target Note]] beside https://example.com and #navigation.',
	'',
	'- first',
	'- [ ] second task',
	'',
	'> quoted line',
	'',
	'> [!note] Callout',
	'> body',
	'',
	'| Name | Value |',
	'| --- | --- |',
	'| Atlas | Composer |',
	'',
	'```ts',
	'const answer = 42;',
	'```',
	'',
	'```mermaid',
	'flowchart LR',
	'  A --> B',
	'```',
	'',
	'$$',
	'x + y',
	'$$',
	'',
	'![[image.png]]',
	'![[Other Note]]',
	'![[paper.pdf]]',
	'',
	'[^source]: Footnote definition.',
].join('\n');

const document = parseDocumentBlocks(source, 'Atlas.md');
const all: DocumentBlock[] = [];
const visit = (blocks: DocumentBlock[]): void => {
	for (const block of blocks) {
		all.push(block);
		visit(block.children ?? []);
	}
};
visit(document.blocks);

for (const block of all) {
	const { sourceFrom, sourceTo } = block.anchor;
	assert.equal(typeof sourceFrom, 'number', `${block.kind} has sourceFrom`);
	assert.equal(typeof sourceTo, 'number', `${block.kind} has sourceTo`);
	assert.ok(sourceFrom! >= 0 && sourceTo! >= sourceFrom!, `${block.kind} has a valid range`);
}

const vaultLink = all.find((block) => block.kind === RawBlockKind.VaultLink);
assert.ok(vaultLink);
assert.equal(
	source.slice(vaultLink!.anchor.sourceFrom, vaultLink!.anchor.sourceTo),
	'[[Target Note]]',
	'inline resources preserve their exact source token',
);

const external = all.find((block) => block.kind === RawBlockKind.ExternalLink);
assert.ok(external);
assert.equal(
	source.slice(external!.anchor.sourceFrom, external!.anchor.sourceTo),
	'https://example.com',
);

const task = all.find((block) => block.kind === RawBlockKind.Task);
assert.ok(task);
assert.ok(
	source.slice(task!.anchor.sourceFrom, task!.anchor.sourceTo).includes('second task'),
	'list sub-items retain their authored source range',
);

const property = all.find(
	(block) => block.kind === RawBlockKind.Property && block.detail?.propertyKey === 'status',
);
assert.ok(property);
assert.equal(source.slice(property!.anchor.sourceFrom, property!.anchor.sourceTo), 'status: active');

const expectedKinds = [
	RawBlockKind.Property,
	RawBlockKind.Tag,
	RawBlockKind.Heading,
	RawBlockKind.Paragraph,
	RawBlockKind.List,
	RawBlockKind.ListItem,
	RawBlockKind.Task,
	RawBlockKind.Callout,
	RawBlockKind.Quote,
	RawBlockKind.Table,
	RawBlockKind.Code,
	RawBlockKind.Math,
	RawBlockKind.Mermaid,
	RawBlockKind.Image,
	RawBlockKind.Embed,
	RawBlockKind.Attachment,
	RawBlockKind.Footnote,
	RawBlockKind.VaultLink,
	RawBlockKind.ExternalLink,
];
for (const kind of expectedKinds) {
	assert.ok(all.some((block) => block.kind === kind), `fixture covers ${kind}`);
}

console.log('PASS: File Atlas anchors retain exact document source locations');
