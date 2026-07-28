import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FrontmatterBlockView } from '@/ui/view/composer/blocks/frontmatter';
import { computeVaultPropertyInventory } from '@/service/composer';
import { FakeVault, blockOfKind, openSession } from './helpers/composer-fakes';

const source = [
	'---',
	'status: evergreen',
	'tags: [pkm]',
	'---',
	'',
	'# Property picker',
].join('\n');
const vault = new FakeVault();
const session = openSession(vault, 'picker.md', source);
const frontmatter = blockOfKind(session, 'frontmatter');
const inventory = computeVaultPropertyInventory([
	{ path: 'a.md', frontmatter: { status: 'evergreen', summary: 'A' } },
	{ path: 'b.md', frontmatter: { status: 'draft', source: '[[Book]]' } },
], { status: 'evergreen', tags: ['pkm'] });
const ports = {
	loadInventory: async () => inventory,
	commitField: async () => ({ requiresReview: false, committed: true }),
};

const closed = renderToStaticMarkup(React.createElement(FrontmatterBlockView, {
	block: frontmatter,
	ports,
	propertyPickerEnabled: true,
}));
assert.ok(closed.includes('pk-fm-add-property'), 'editable Frontmatter must expose the persistent add-property row');
assert.ok(closed.includes('添加属性'), 'the entrance must describe the current-note task');
assert.equal(closed.includes('pk-fm-library__table'), false, 'the full Vault table must not render into the document');

const open = renderToStaticMarkup(React.createElement(FrontmatterBlockView, {
	block: frontmatter,
	ports,
	propertyPickerEnabled: true,
	libraryOpen: true,
	onLibraryOpenChange: () => undefined,
}));
assert.ok(open.includes('pk-fm-picker__search'), 'open picker must start with search');
assert.ok(open.includes('搜索或创建属性'), 'search and custom creation share one discoverable input');
assert.ok(open.includes('正在读取 Vault 属性'), 'async inventory loading must have an honest state');

const viewSource = readFileSync('src/ui/view/composer/blocks/frontmatter/FrontmatterBlockView.tsx', 'utf8');
assert.ok(viewSource.includes('setFieldDraft'), 'selection must create a current-note draft before writeback');
assert.ok(viewSource.includes('const result = await ports.commitField('), 'only explicit draft confirmation may commit');
assert.ok(viewSource.includes('fieldDraftPayload(fieldDraft'), 'typed draft values must be materialized only at confirmation');
assert.equal(viewSource.includes('void commitField(payload)'), false, 'picker selection must not write YAML immediately');

const css = readFileSync('src/styles/composer-fm-math.css', 'utf8');
assert.match(css, /\.pk-fm-library\s*\{[\s\S]*?position:\s*absolute;/, 'picker must overlay instead of expanding document flow');
assert.match(css, /\.pk-fm-picker__options\s*\{[\s\S]*?max-height:\s*320px;[\s\S]*?overflow-y:\s*auto;/, 'large Vault results need a bounded scroll region');

console.log('composer-frontmatter-property-picker: passed');
