/**
 * Peak Composer — Easy Copy payloads & ordering (WP4, CMP-COPY-01..03).
 *
 * The four outputs keep one fixed order; Markdown is verbatim; a Code Block's
 * plain text preserves newlines / indentation / tabs; prose strips inline marks
 * but keeps line breaks; the chrome-exclusion contract lists the editing chrome
 * the raster snapshot must drop.
 */

import {
	EASY_COPY_ORDER,
	EASY_COPY_CHROME_SELECTORS,
	buildEasyCopyText,
	toPlainText,
} from '@/service/composer';
import { readFileSync } from 'node:fs';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

// ── fixed order ───────────────────────────────────────────────────────────────
check('order is plain → image → markdown → html', JSON.stringify(EASY_COPY_ORDER) === JSON.stringify(['plain', 'image', 'markdown', 'html']));

// ── code preserves whitespace exactly ─────────────────────────────────────────
const CODE = '```ts\nfunction f() {\n\tif (a) {\n\t\treturn 1;\n\t}\n}\n```';
const codePayloads = buildEasyCopyText({ markdown: CODE, blockKind: 'code' });
check('code markdown is verbatim', codePayloads.markdown === CODE);
const codePlain = codePayloads.plain;
check('code plain drops the fences', !codePlain.includes('```'));
check('code plain keeps tab indentation', codePlain.includes('\t\treturn 1;'), JSON.stringify(codePlain));
check('code plain keeps newlines', codePlain.split('\n').length === 5, String(codePlain.split('\n').length));
check('code html wraps in pre/code', codePayloads.html.startsWith('<pre><code>') && codePayloads.html.endsWith('</code></pre>'));

// ── prose strips inline marks, keeps line breaks ─────────────────────────────
const PROSE = '# Title\n\nThis is **bold**, *italic*, ~~struck~~ and a [link](https://x.io) plus `code`.';
const prosePlain = toPlainText(PROSE, 'paragraph');
check('prose plain removes bold markers', !prosePlain.includes('**') && prosePlain.includes('bold'));
check('prose plain removes italic markers', !/\*italic\*/.test(prosePlain) && prosePlain.includes('italic'));
check('prose plain removes strike markers', !prosePlain.includes('~~') && prosePlain.includes('struck'));
check('prose plain resolves link text', prosePlain.includes('link') && !prosePlain.includes('https://x.io'));
check('prose plain resolves heading', prosePlain.startsWith('Title'));
check('prose plain keeps the paragraph line break', prosePlain.includes('\n'));

// list plain resolves bullets but keeps the lines.
const LIST = '- one\n- two\n- three';
const listPlain = toPlainText(LIST, 'list');
check('list plain drops bullets', listPlain === 'one\ntwo\nthree', JSON.stringify(listPlain));

// wikilink resolves to its alias.
check('wikilink alias resolves', toPlainText('see [[知识库|the vault]] now', 'paragraph') === 'see the vault now');

// ── chrome exclusion contract ─────────────────────────────────────────────────
check('excludes the block rail', EASY_COPY_CHROME_SELECTORS.includes('.pk-composer-rail'));
check('excludes the action row', EASY_COPY_CHROME_SELECTORS.includes('.pk-block-action-row'));
check('excludes the selection toolbar', EASY_COPY_CHROME_SELECTORS.includes('.pk-selection-toolbar'));

// Chromium returns an empty string for getComputedStyle(...).cssText. Guard the
// raster path against regressing to an unstyled text-only-looking PNG.
const rasterSource = readFileSync('src/ui/view/composer/chrome/rasterize.ts', 'utf8');
check('raster copies computed styles property-by-property', rasterSource.includes('computed.getPropertyValue(property)'));
check('raster does not rely on empty computed cssText', !rasterSource.includes('computed.cssText'));
check(
	'raster inlines styles before removing chrome so source/clone nodes stay paired',
	rasterSource.indexOf('inlineStyles(el, clone, win)') < rasterSource.indexOf('clone.querySelectorAll(sel)'),
);

done('composer-easy-copy');
