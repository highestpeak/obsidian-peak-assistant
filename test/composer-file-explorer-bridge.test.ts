import assert from 'assert';
import { readFileSync } from 'fs';

const host = readFileSync('src/app/ui-host/ReactFileViewHost.ts', 'utf8');
const view = readFileSync('src/app/composer/DocumentComposerView.ts', 'utf8');

assert.match(
	host,
	/export abstract class ReactFileViewHost extends FileView/,
	'file-bound React surfaces must use Obsidian FileView so the host can discover the active file',
);
assert.match(
	view,
	/export class DocumentComposerView extends ReactFileViewHost/,
	'Composer must participate in Obsidian active-file and File Explorer behavior',
);
assert.match(
	view,
	/await super\.setState\(\{ \.\.\.normalized, file: normalized\.filePath \}, result\)/,
	'Composer state must bind its filePath through FileView.setState',
);
assert.match(
	view,
	/return this\.file\?\.path\s*\?\?/,
	'the host-owned FileView binding must be the primary current-file source',
);
assert.match(
	view,
	/canAcceptExtension\(extension: string\): boolean \{\s*return extension === 'md';/,
	'Composer must only accept Markdown file bindings',
);

console.log('composer-file-explorer-bridge: passed');
