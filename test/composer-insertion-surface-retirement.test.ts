import assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { FakeVault, makeHub, openSession } from './helpers/composer-fakes';

const vault = new FakeVault();
const session = openSession(
	vault,
	'Folder/Explicit block insertion.md',
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
const html = renderToStaticMarkup(
	React.createElement(ComposerRoot, {
		source,
		runtime: { session, hub: makeHub(vault, session) },
	}),
);

assert.equal(
	existsSync('src/ui/view/composer/chrome/BetweenBlockInsertGap.tsx'),
	false,
	'the between-block hover component is retired',
);
assert.equal(
	existsSync('src/ui/view/composer/chrome/ListItemInsertGap.tsx'),
	false,
	'the list-item hover component is retired',
);
assert.equal(
	html.includes('pk-between-block-insert') || html.includes('pk-composer-list__gap'),
	false,
	'editable Composer renders no pointer-relative insertion hit areas',
);
assert.ok(
	html.includes('data-action="insert"') && html.includes('在下方插入'),
	'each block keeps the explicit insert-below action',
);

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const css = readFileSync('src/styles/composer.css', 'utf8');
const config = readFileSync('templates/config/composer.json', 'utf8');
assert.equal(root.includes('BetweenBlockInsertGap'), false);
assert.equal(root.includes('ListItemInsertGap'), false);
assert.equal(css.includes('pk-between-block-insert'), false);
assert.equal(css.includes('pk-composer-list__gap'), false);
assert.equal(config.includes('listGapLabel'), false);
assert.equal(config.includes('listGapPlaceholder'), false);

console.log('composer-insertion-surface-retirement: passed');
