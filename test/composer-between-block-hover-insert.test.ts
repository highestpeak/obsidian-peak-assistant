import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { adjacentInsertionAnchor } from '@/ui/view/composer/chrome/BetweenBlockInsertGap';
import { FakeVault, makeHub, openSession } from './helpers/composer-fakes';

const rootSource = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const gapSource = readFileSync(
	'src/ui/view/composer/chrome/BetweenBlockInsertGap.tsx',
	'utf8',
);
const menuSource = readFileSync(
	'src/ui/view/composer/chrome/InsertTypeMenu.tsx',
	'utf8',
);
const css = readFileSync('src/styles/composer.css', 'utf8');

function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

function renderComposer(editing: boolean): string {
	const vault = new FakeVault();
	const session = openSession(
		vault,
		'Folder/Between block insert.md',
		'# Title\n\nFirst paragraph.\n\nSecond paragraph.\n',
	);
	const state: DocumentComposerState = {
		status: 'loaded',
		filePath: session.filePath,
		snapshot: session.snapshot,
	};
	const source: ComposerStateSource = {
		getState: () => state,
		subscribe: () => () => undefined,
	};
	const runtime = editing ? { session, hub: makeHub(vault, session) } : undefined;
	return renderToStaticMarkup(React.createElement(ComposerRoot, { source, runtime }));
}

const editableHtml = renderComposer(true);
assert.equal(
	count(editableHtml, 'class="pk-between-block-insert"'),
	2,
	'three source-adjacent blocks expose exactly two between-block insertion gaps',
);
assert.equal(
	count(renderComposer(false), 'class="pk-between-block-insert"'),
	0,
	'read-only Composer does not expose write affordances',
);
assert.ok(
	editableHtml.includes('data-insert-after-block='),
	'each gap records the real source block that owns insert-below',
);

const blocks = [
	{ blockId: 'a' },
	{ blockId: 'hidden' },
	{ blockId: 'b' },
] as never;
assert.equal(adjacentInsertionAnchor(blocks, 'hidden', 'b'), 'hidden');
assert.equal(
	adjacentInsertionAnchor(blocks, 'a', 'b'),
	null,
	'a visually adjacent pair with hidden source content must not expose a misleading insertion gap',
);

assert.ok(
	rootSource.includes('<BetweenBlockInsertGap'),
	'ComposerRoot renders a dedicated gap instead of folding the behavior into every block renderer',
);
assert.ok(
	rootSource.includes('adjacentInsertionAnchor'),
	'folded or otherwise hidden source blocks must fail closed instead of creating a misleading visible gap',
);
assert.ok(
	rootSource.includes("panel: 'insert-draft'"),
	'choosing a gap type reuses the existing NewBlockDraft path',
);

assert.ok(gapSource.includes('onPointerMove={trackPointer}'), 'the insertion anchor follows pointer x');
assert.ok(gapSource.includes('onPointerEnter={openMenu}'), 'hovering the plus opens the type menu');
assert.equal(gapSource.includes('onClick={openMenu}'), false, 'opening the menu never requires a click');
assert.ok(
	gapSource.includes('surfacePreviewCloseDelayMs'),
	'the pointer corridor reuses the configured Composer surface close delay',
);
assert.ok(gapSource.includes('<InsertTypeMenu'), 'the gap and block row share one type-menu implementation');
assert.ok(menuSource.includes('config.types.map'), 'menu options remain template-driven');
assert.ok(menuSource.includes('data-default={type.default'), 'the config-owned default type is visibly emphasized');

assert.match(
	css,
	/\.pk-between-block-insert__hit-area\s*\{[\s\S]*?height:\s*var\(--pk-between-block-gap-size\)/,
	'the interaction lane occupies the existing semantic margin without adding document height',
);
assert.match(
	css,
	/\.pk-between-block-insert__trigger\s*\{[\s\S]*?width:\s*22px !important;[\s\S]*?height:\s*22px !important;[\s\S]*?padding:\s*0 !important;/,
	'the 22px plus survives the Obsidian button reset',
);
assert.match(
	css,
	/\.pk-between-block-insert__trigger\s*\{[\s\S]*?left:\s*clamp\(/,
	'the plus is clamped around the live pointer position rather than fixed at the left edge',
);
assert.match(
	css,
	/\.pk-between-block-insert__menu\s*\{[\s\S]*?left:\s*var\(--pk-between-block-menu-left\)/,
	'the menu is anchored near the pointer and can be shifted inside document bounds',
);

console.log('composer-between-block-hover-insert: passed');
