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
	root.includes('{unitActions?.renderBefore?.(anchor)}') &&
	root.includes('data-unit-collection-anchor') &&
	root.includes("unit.unitKind === 'paragraph-line'"),
	'the one paragraph-level rail handle and collection row must follow the active authored line',
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
assert.ok(
	!root.includes('CollectionActionPopover') &&
	root.includes('data-collection-action-active') &&
	root.includes('{blockActionRow}'),
	'unitized collection actions reuse the existing horizontal BlockActionRow inside the owning block',
);
assert.ok(
	root.includes('if (collectionActionActive)') &&
	!root.includes('onPointerLeave={editing && unitized ? hideActionRow : undefined}'),
	'the collection action row owns the pointer path from the six-dot rail through the whole block',
);
assert.match(
	css,
	/\.pk-composer-block\[data-unitized='true'\]\[data-collection-action-active\]\s*\{[\s\S]*?background:\s*var\(--pkc-block-hover-bg\);[\s\S]*?box-shadow:\s*var\(--pkc-block-hover-shadow\);/,
	'the owning block keeps its visual indicator while collection actions are active',
);
assert.match(
	css,
	/\.pk-composer-collection-handle-zone::before\s*\{[\s\S]*?inset:\s*-3px -13px -3px -6px;[\s\S]*?pointer-events:\s*auto;/,
	'the active line, dynamic rail handle, and action row share a reachable transparent interaction island',
);
assert.match(
	css,
	/\.pk-block-action-row__shell\s*\{[\s\S]*?white-space:\s*nowrap;[\s\S]*?overflow-x:\s*auto;/,
	'the unchanged action capsules stay in one block-aligned horizontal strip',
);
assert.match(
	css,
	/\.pk-composer-find-highlight\s*\{[\s\S]*?28%[\s\S]*?box-shadow:\s*inset 0 -2px/,
	'find highlights keep the matched text legible with a lighter fill and a strong underline',
);
const externalLinkRule = css.match(/\.pk-composer-link\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const wikilinkRule = css.match(/\.pk-composer-wikilink\s*\{([\s\S]*?)\}/)?.[1] ?? '';
assert.ok(
	externalLinkRule.includes('color: var(--pk-info-text)') &&
	wikilinkRule.includes('color: var(--pk-accent-text)') &&
	!wikilinkRule.includes('background:') &&
	!wikilinkRule.includes('border:'),
	'external links are blue while background-free wikilinks remain purple',
);
assert.match(
	css,
	/\.pk-composer-editable\[contenteditable='true'\][\s\S]*?pk-composer-link:not\(\.pk-composer-wikilink\)::after[\s\S]*?mask-image:/,
	'editable external links keep the same up-right icon semantics without mutating source text',
);
assert.match(
	css,
	/\.pk-composer-display-switch\.pk-segmented\[data-variant='animated-pill'\][\s\S]*?border-radius:\s*var\(--pk-radius-full\)/,
	'the display switch matches the full-pill Result Browser view toggle grammar',
);

console.log('composer-paragraph-line-units: passed');
