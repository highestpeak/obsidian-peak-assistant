import assert from 'assert';
import { readFileSync } from 'fs';
import {
	createUnitActionSnapshot,
	parseComposerDocument,
	partitionSourceRange,
} from '@/service/composer';

const source = 'VimWiki\nGoogle Keep\npkm · GitHub Topics';
const snapshot = parseComposerDocument(source, { filePath: 'lines.md' });
const paragraph = snapshot.blocks[0];
assert.equal(paragraph?.kind, 'paragraph', 'soft Markdown lines keep one semantic paragraph container');

const lines = paragraph?.units.filter((unit) => unit.unitKind === 'paragraph-line') ?? [];
assert.deepEqual(
	lines.map((line) => source.slice(line.from, line.to)),
	['VimWiki', 'Google Keep', 'pkm · GitHub Topics'],
	'each authored source line is an independently addressable paragraph unit',
);
const secondLine = lines[1]!;
const unitSnapshot = createUnitActionSnapshot(snapshot, paragraph!, secondLine);
assert.deepEqual(
	unitSnapshot.target,
	{
		kind: 'selection',
		blockId: paragraph!.blockId,
		unitId: secondLine.unitId,
		from: secondLine.from,
		to: secondLine.to,
	},
	'line AI action freezes an exact selection target',
);
assert.equal(unitSnapshot.selectionText, 'Google Keep');

const selection = partitionSourceRange(
	snapshot,
	source.indexOf('VimWiki'),
	source.indexOf('Keep') + 'Keep'.length,
);
assert.equal(selection.units.length, 2, 'selection across soft lines preserves two independent units');
assert.ok(
	selection.units.every((unit) => unit.unitKind === 'paragraph-line'),
	'soft-line selections no longer collapse to one oversized paragraph unit',
);

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
assert.ok(root.includes('EditableParagraphLinesBody'), 'multi-line paragraphs render their authored line units');
assert.ok(root.includes('pk-composer-paragraph__line'), 'each paragraph line owns an interaction row');
assert.ok(
	root.includes('{unitActions?.render(anchor)}') && root.includes('createUnitActionSnapshot'),
	'each authored line can render an AI action row against its own source range',
);
assert.ok(
	unitSnapshot.target.kind === 'selection' && unitSnapshot.selectionText === 'Google Keep',
	'unit AI actions freeze an exact selection target instead of rewriting the whole paragraph block',
);

const css = readFileSync('src/styles/composer.css', 'utf8');
assert.match(
	css,
	/\.pk-composer-block\[data-unitized='true'\]:hover[\s\S]*?box-shadow:\s*none/,
	'a unitized paragraph does not draw one large outer hover halo',
);
assert.match(
	css,
	/\.pk-composer-paragraph__line:hover[\s\S]*?var\(--pkc-block-hover-bg\)/,
	'paragraph source lines own their hover feedback',
);

console.log('composer-paragraph-line-units: passed');
