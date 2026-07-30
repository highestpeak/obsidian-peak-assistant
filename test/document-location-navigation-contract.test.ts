import assert from 'assert';
import { readFileSync } from 'fs';

const read = (path: string): string => readFileSync(path, 'utf8');

const navigation = read('src/app/platform/navigation/AppVaultNavigationAdapter.ts');
const router = read('src/app/composer/ComposerDocumentRouter.ts');
const composerView = read('src/app/composer/DocumentComposerView.ts');
const composerRoot = read('src/ui/view/composer/ComposerRoot.tsx');
const fileAtlasHost = read('src/app/file-atlas/composeFileAtlasHost.ts');
const fileAtlasModal = read('src/app/file-atlas/FileAtlasModal.tsx');
const quickSearchHeading = read('src/ui/view/quick-search/components/heading-mode/HeadingModeContainer.tsx');

assert.match(navigation, /openVaultPathAtLocation/);
assert.match(navigation, /router\.revealLocation/);
assert.match(navigation, /openVaultPathAtLine[\s\S]*openVaultPathAtLocation/);
assert.match(navigation, /sourceLineForFragment/);
assert.match(navigation, /splitVaultLinkTarget/);
assert.match(router, /selectDocumentLocationLeaf/);
assert.match(router, /revealMarkdownLocation/);
assert.match(router, /revealSourceLocation/);
assert.match(composerView, /revealSourceLocation/);
assert.match(composerRoot, /resolveComposerSourceLocation/);
assert.match(composerRoot, /unfoldForDocumentLocation/);
assert.match(composerRoot, /data-src-link-from/);
assert.match(fileAtlasHost, /openVaultPathAtLocation/);
assert.doesNotMatch(fileAtlasHost, /openVaultPathAtLine/);
assert.match(fileAtlasModal, /host\.revealLocation/);
assert.match(quickSearchHeading, /openVaultPathAtLocation/);

console.log('PASS: location-aware navigation is shared by File Atlas, Composer, Markdown, and Quick Search');
