import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function source(relativePath: string): string {
	return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const rail = source('src/ui/view/file-atlas/components/FileRail.tsx');
const host = source('src/ui/view/file-atlas/FileAtlasHost.tsx');
const adapter = source('src/app/file-atlas/composeFileAtlasHost.ts');
const css = source('src/styles/file-atlas.css');

assert.match(rail, /value="frequent"/);
assert.match(rail, /value="name"/);
assert.doesNotMatch(rail, /value="recent"/);
assert.match(rail, /ArrowUpDown/);
assert.match(rail, /ChevronDown/);
assert.match(rail, /role="separator"/);
assert.match(rail, /sections\.open/);
assert.match(rail, /sections\.recent/);

assert.match(host, /buildFileRailSections/);
assert.match(host, /frequentOrderRef/);
assert.match(host, /host\.activateDoc\(path\)/);
assert.match(host, /writeFileRailPreference/);

assert.match(adapter, /getMostUsed/);
assert.match(adapter, /getLastOpenFiles/);
assert.match(adapter, /DOCUMENT_COMPOSER_VIEW_TYPE/);
assert.match(adapter, /workspace\.revealLeaf/);

assert.match(css, /--pkfa-rail-width/);
assert.match(css, /\.pkfa-rail-resizer/);
assert.doesNotMatch(
	css,
	/grid-template-columns:\s*224px/,
	'File Atlas must not regress to the narrow fixed-width rail',
);

console.log('PASS: File Atlas work-file rail production contract');
