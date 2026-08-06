import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('main.ts', 'utf8');
const entry = readFileSync('entry.ts', 'utf8');
const atlasHost = readFileSync('src/app/file-atlas/composeFileAtlasHost.ts', 'utf8');
const atlasSurface = readFileSync('src/ui/view/file-atlas/FileAtlasHost.tsx', 'utf8');
const inspector = readFileSync('src/ui/view/file-atlas/components/AtlasInspector.tsx', 'utf8');
const streamdown = readFileSync('src/ui/component/mine/StreamdownIsolated.tsx', 'utf8');
const mermaidLoader = readFileSync('src/ui/mermaid/importMermaidModule.ts', 'utf8');
const composerMermaid = readFileSync('src/ui/view/composer/blocks/mermaid/MermaidBlockView.tsx', 'utf8');
const reactRenderer = readFileSync('src/ui/react/ReactRenderer.tsx', 'utf8');
const unloadStart = main.indexOf('onunload(): void');
const unloadEnd = main.indexOf('\n\t/**\n\t * Persists current plugin settings', unloadStart);
const unloadBody = main.slice(unloadStart, unloadEnd);

assert.doesNotMatch(main, /peak-startup-mem|_peakMemMark|console\.log\s*=\s*_wrap/);
assert.match(main, /onunload\(\): void/);
assert.doesNotMatch(unloadBody, /\bawait\b/);
assert.match(main, /clearPortalHostsForUnload\(\)/);
assert.match(main, /IndexService\.cancelIndexing\(\)[\s\S]*searchUpdateQueue\?\.dispose\(\)/);

assert.match(entry, /private disposed = false/);
assert.match(entry, /if \(this\.disposed\) return/);
assert.match(entry, /this\.disposed = true/);

assert.match(atlasHost, /createTransientController/);
assert.match(atlasHost, /\{ capabilities: true \}/);
assert.match(atlasHost, /\{ intelligence: true \}/);
assert.match(atlasHost, /disposition: 'reuse-existing'/);
assert.match(atlasHost, /setBounded\(sessionViews/);
assert.match(atlasHost, /setBounded\(externalPreviewCache/);
assert.match(atlasHost, /documentReadQueue\.then\(read, read\)/);
assert.match(inspector, /new AbortController\(\)/);
assert.match(inspector, /controller\.abort\(\)/);
assert.match(atlasSurface, /host\.readDoc\(activePath, controller\.signal\)/);

assert.match(streamdown, /importImplWithoutMermaidLoadListener/);
assert.match(mermaidLoader, /Mermaid failed to initialize/);
assert.match(composerMermaid, /importWithoutMermaidLoadListener/);
assert.match(reactRenderer, /export function clearPortalHostsForUnload\(\)/);
assert.match(reactRenderer, /removeEventListener\('unload'/);

console.log('plugin-memory-lifecycle: passed');
