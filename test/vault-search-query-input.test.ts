import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync('src/ui/view/quick-search/SearchModal.tsx', 'utf8');
const resultBrowserToolbar = readFileSync(
	'src/ui/component/result-browser/toolbar/ResultBrowserToolbar.tsx',
	'utf8',
);
const codeMirrorInput = readFileSync(
	'src/ui/component/mine/codemirror-input.tsx',
	'utf8',
);
const codeMirrorStyles = readFileSync('src/styles/codemirror.css', 'utf8');

assert.match(
	modal,
	/<ResultBrowserSearchInput[\s\S]*?layout="adaptive"[\s\S]*?placeholder="Search your vault…"/,
	'Vault Search must opt into the compact adaptive query field',
);
assert.match(
	modal,
	/className="pktw-flex pktw-gap-3 pktw-items-end"/,
	'the Refine action must remain bottom-aligned while the query field grows',
);
assert.match(
	resultBrowserToolbar,
	/layout\?: 'single-line' \| 'adaptive'/,
	'the shared Result Browser query field must distinguish filters from adaptive search queries',
);
assert.match(
	resultBrowserToolbar,
	/heightMode=\{layout === 'adaptive' \? 'compact-adaptive' : 'compact-single-line'\}/,
	'the Result Browser query layout must reach the CodeMirror geometry contract',
);
assert.match(
	resultBrowserToolbar,
	/layout === 'adaptive' \? 'pktw-py-1' : 'pktw-py-2\.5'/,
	'the adaptive field must not retain the old twenty pixels of vertical padding',
);
assert.match(
	codeMirrorInput,
	/heightMode\?: 'default' \| 'compact-single-line' \| 'compact-adaptive'/,
	'CodeMirrorInput must expose explicit height behavior instead of a stale singleLine boolean',
);
assert.ok(
	codeMirrorInput.includes('EditorView.lineWrapping'),
	'the adaptive query must wrap at the available width before it grows downward',
);
assert.match(
	codeMirrorStyles,
	/\.cm-editor-compact-adaptive \.cm-content[\s\S]*?min-height:\s*28px !important;[\s\S]*?max-height:\s*72px !important;[\s\S]*?padding:\s*4px 0 !important;/,
	'the adaptive field must center one line and grow to a bounded three-line height',
);
assert.match(
	codeMirrorStyles,
	/\.cm-editor-compact-adaptive \.cm-scroller[\s\S]*?max-height:\s*72px !important;[\s\S]*?overflow-y:\s*auto !important;/,
	'content beyond three lines must scroll inside the query field',
);

console.log('vault-search-query-input: passed');
