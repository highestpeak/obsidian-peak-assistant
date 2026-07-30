import assert from 'node:assert/strict';
import { captureNativeMarkdownIntelligenceContext } from '../src/app/composer/NativeMarkdownIntelligenceContext';

const source = [
	'# Document',
	'Intro',
	'## Current section',
	'Selected words live here.',
].join('\n');

const context = captureNativeMarkdownIntelligenceContext({
	editor: {
		getValue: () => source,
		getCursor: (which: 'from' | 'to') => which === 'from'
			? { line: 3, ch: 0 }
			: { line: 3, ch: 14 },
		getSelection: () => 'Selected words',
	},
} as any);

assert.equal(context.heading, 'Current section');
assert.equal(context.selectionText, 'Selected words');
assert.equal(context.sourceFrom, source.indexOf('Selected words'));
assert.equal(context.sourceTo, source.indexOf('Selected words') + 14);

const cursorOnly = captureNativeMarkdownIntelligenceContext({
	editor: {
		getValue: () => source,
		getCursor: () => ({ line: 1, ch: 2 }),
		getSelection: () => '',
	},
} as any);

assert.equal(cursorOnly.heading, 'Document');
assert.equal(cursorOnly.selectionText, undefined);
assert.equal(cursorOnly.sourceFrom, cursorOnly.sourceTo);

console.log('native markdown intelligence context tests passed');
