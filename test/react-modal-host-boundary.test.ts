import assert from 'assert';
import { readFileSync } from 'fs';

const host = readFileSync('src/app/ui-host/ReactModalHost.ts', 'utf8');

assert.match(
	host,
	/modalEl\.addClass\('pktw-root', 'peak-design-root'\)/,
	'React modal outer chrome must resolve Peak tokens and reset Obsidian styles',
);
assert.match(
	host,
	/contentEl\.addClass\('pktw-root', 'peak-design-root'\)/,
	'React modal content must retain the Peak design scope',
);
assert.match(
	host,
	/new ReactRenderer\(contentEl\)/,
	'React modal contentEl must remain the persistent React mount',
);
assert.doesNotMatch(
	host,
	/new ReactRenderer\(this\.containerEl\)/,
	'Rendering from Modal.containerEl replaces contentEl and discards its scope classes',
);

console.log('react-modal-host-boundary: passed');
