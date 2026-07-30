import assert from 'assert';
import { readFileSync } from 'fs';

const mock = readFileSync(
	'docs/gstack/peak-composer-fluid-writing-2026-07-30/index.html',
	'utf8',
);

assert.ok(
	mock.includes('function projectMarkdownSource('),
	'interaction mock projects source instead of exposing raw Markdown markers',
);
assert.ok(
	mock.includes('data-markdown-block-kind'),
	'interaction mock styles each Markdown block independently',
);
assert.ok(
	mock.includes('data-structural-token="list"'),
	'list source marker is replaced by a visual bullet',
);
assert.ok(
	mock.includes('.markdown-token[data-structural-token]') &&
		mock.includes('opacity: 1;'),
	'visual marker is not hidden by the source token opacity',
);
assert.ok(
	mock.includes('function restoreSourceSelection('),
	'projection restores the caret by source offset after replacing DOM',
);
assert.ok(
	mock.includes("event.key === 'Tab'") &&
		mock.includes('function indentMarkdownListItems('),
	'interaction mock keeps Tab inside list editing and supports Shift+Tab',
);
assert.ok(
	mock.includes('--list-depth'),
	'interaction mock exposes visible indentation for nested list markers',
);
assert.equal(
	mock.includes('.markdown-editor[data-kind="heading"]'),
	false,
	'mixed drafts never style the whole editor from only the first block',
);

console.log('composer-fluid-writing-mock: passed');
