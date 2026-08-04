import assert from 'assert';
import { readFileSync } from 'fs';
import { findComposerMatches } from '@/service/composer';

assert.deepEqual(
	findComposerMatches('Alpha beta ALPHA alphabet', 'alpha'),
	[
		{ from: 0, to: 5 },
		{ from: 11, to: 16 },
		{ from: 17, to: 22 },
	],
	'find is case-insensitive and preserves source-coordinate ranges',
);
assert.deepEqual(findComposerMatches('aaaa', 'aa'), [{ from: 0, to: 2 }, { from: 2, to: 4 }]);
assert.deepEqual(findComposerMatches('a+b aab a+b', 'a+b'), [{ from: 0, to: 3 }, { from: 8, to: 11 }]);
assert.deepEqual(findComposerMatches('text', '   '), [], 'blank queries do not create matches');

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const bar = readFileSync('src/ui/view/composer/chrome/ComposerFindBar.tsx', 'utf8');
const table = readFileSync('src/ui/view/composer/blocks/table/TableBlockView.tsx', 'utf8');
assert.ok(root.includes("event.key.toLocaleLowerCase() !== 'f'"), 'Composer owns Mod+F in capture phase');
assert.ok(root.includes('await chrome.flushAll()'), 'find flushes the active editor before searching');
assert.ok(bar.includes("event.key !== 'Enter'"), 'Enter navigation is handled by the find input');
assert.ok(bar.includes('event.shiftKey ? -1 : 1'), 'Shift+Enter navigates to the previous match');
assert.ok(bar.includes("event.key === 'Escape'"), 'Escape closes the find bar');
assert.ok(
	bar.includes('domRangeForVisibleSource'),
	'find highlights require an exact visible source mapping instead of snapping across structural blocks',
);
assert.ok(
	table.includes('data-src-text-from={sourceFrom}'),
	'table cells expose their source anchors so a match paints only the matching cell text',
);

console.log('composer-find: passed');
