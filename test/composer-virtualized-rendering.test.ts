import assert from 'assert';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import { ComposerDocumentSession } from '@/service/composer';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { readFileSync } from 'fs';
import { FakeVault, makeHub } from './helpers/composer-fakes';

const sourceText = Array.from({ length: 5_000 }, (_, index) => index === 0
	? 'Read [[Vault Note]] and [OpenAI](https://openai.com).'
	: `Paragraph ${index}.`).join('\n\n');
const session = ComposerDocumentSession.fromSource('Virtual.md', sourceText);
const vault = new FakeVault();
vault.set('Virtual.md', sourceText);
const hub = makeHub(vault, session);
const state: DocumentComposerState = {
	status: 'loaded',
	filePath: 'Virtual.md',
	snapshot: session.snapshot,
};
const source: ComposerStateSource = {
	getState: () => state,
	subscribe: () => () => undefined,
};

const html = renderToStaticMarkup(React.createElement(ComposerRoot, {
	source,
	runtime: { session, hub },
}));
const mountedRows = html.match(/class="pk-composer-virtual-item"/g)?.length ?? 0;
assert.ok(mountedRows > 0, 'initial viewport must render useful document rows');
assert.ok(mountedRows < 80, `5000-block document mounted ${mountedRows} rows`);
assert.ok(html.includes('data-virtual-total-blocks="5000"'), 'diagnostics must expose complete model size');
assert.ok(
	html.includes(`data-virtual-mounted-blocks="${mountedRows}"`),
	'diagnostics must expose bounded mounted row count',
);
assert.ok(html.includes('data-virtual-hard-pins="0"'), 'diagnostics must expose hard-pin pressure');
assert.ok(html.includes('data-candidate-count="0"'), 'diagnostics must expose candidate projection size');
assert.ok(
	html.includes('data-virtual-static-projection="true"'),
	'long documents must use the stable visual projection from first paint',
);
assert.equal(
	html.match(/contenteditable="true"/g)?.length ?? 0,
	0,
	'long-document first paint must allocate zero text editors even with a live hub',
);
assert.equal(
	html.match(/data-static-block-row="true"/g)?.length ?? 0,
	mountedRows,
	'ordinary long-document rows must mount the lightweight visual row, not full Composer chrome',
);
assert.equal(
	html.match(/class="pk-composer-rail/g)?.length ?? 0,
	0,
	'static virtual rows must not allocate one rail and its SVG controls per mounted block',
);
assert.equal(
	html.match(/class="pk-block-action-row/g)?.length ?? 0,
	0,
	'static virtual rows must not allocate hidden action surfaces during scroll',
);
assert.ok(
	html.includes('class="pk-composer-link pk-composer-wikilink"') &&
		html.includes('class="pk-composer-link pk-composer-link--external"') &&
		html.includes('data-link-target="https://openai.com"'),
	'the low-allocation projection must retain wikilink and external-link semantics from first paint',
);
assert.ok(!html.includes('Paragraph 4999.'), 'far document tail cannot be mounted on first paint');

const virtualHook = readFileSync(
	'src/ui/view/composer/virtualization/useComposerVirtualWindow.ts',
	'utf8',
);
const composerRoot = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const composerCss = readFileSync('src/styles/composer.css', 'utf8');
assert.ok(
	virtualHook.includes('onScrollIntent?.(scroller)') &&
		virtualHook.includes('frame < config.revealMaxFrames') &&
		virtualHook.includes('if (target) return target'),
	'far locator requests must authorize scrolling and wait for the virtual target to mount',
);
assert.ok(
	virtualHook.includes('composerVirtualViewportIsCovered') &&
		virtualHook.includes('emergencyComposerVirtualViewport(next, config), true') &&
		virtualHook.includes('flushSync'),
	'viewport escape must synchronously mount only the emergency projection',
);
assert.ok(
	virtualHook.includes('composerVirtualViewportNeedsRecenter') &&
		virtualHook.includes('React.startTransition(update)') &&
		virtualHook.includes('scheduleSettledProjection()'),
	'covered scroll must defer ordinary recentering outside the input-critical path',
);
assert.ok(
	virtualHook.includes('layout.measureBatch(measurements') &&
		virtualHook.includes('requestAnimationFrame(flushMeasurements)') &&
		virtualHook.includes('syncMountedVirtualGeometry') &&
		!virtualHook.includes('renderMeasurements') &&
		!virtualHook.includes('resize?.observe(shell)'),
	'ResizeObserver reports must update geometry once without a second React render',
);
assert.ok(
	!virtualHook.includes('getComputedStyle(element)') &&
		!virtualHook.includes('element.getBoundingClientRect().height'),
	'row mounting must not synchronously force per-element style and geometry reads',
);
assert.ok(
	!composerRoot.includes('pk-composer-virtual-gap') &&
		composerRoot.includes('style={{ top: offset }}') &&
		composerRoot.includes('style={{ height: virtualWindow.totalHeight }}'),
	'virtual rows must use independent absolute offsets instead of cumulative normal-flow gaps',
);
assert.ok(
	/\.pk-composer-virtual-item\s*\{[\s\S]*?position:\s*absolute;/.test(composerCss),
	'virtual row CSS must keep each mounted row independently positioned',
);
assert.ok(
	virtualHook.includes('staticProjection') &&
		!virtualHook.includes('lightweightProjection') &&
		!virtualHook.includes('virtualMeasurementSuspended') &&
		virtualHook.includes('programmaticMeasurementScrollTopRef') &&
		virtualHook.includes('scheduleSettledProjection()'),
	'long documents must keep one visual renderer while retaining frame-stable window recentering',
);
assert.ok(
	!composerRoot.includes('ComposerScrollProjectionRow') &&
		!composerRoot.includes('toPlainText') &&
		!composerRoot.includes('measurementSuspended'),
	'Composer must not swap to a plain-text proxy or freeze measured row height while scrolling',
);
assert.ok(
	composerRoot.includes('shouldHydrateComposerBlockEditor') &&
		composerRoot.includes('hydratedBlockId') &&
		composerRoot.includes("pinRegistry.acquire('hydrated-editor'") &&
		composerRoot.includes('editorHydrated={rowEditing}') &&
		composerRoot.includes('<ComposerStaticBlockRow') &&
		composerRoot.includes('editorPinnedBlockIds') &&
		composerRoot.includes('focusedEditorBlockIdState') &&
		composerRoot.includes("pinRegistry.acquire(`selection-${index}`") &&
		composerRoot.includes("block?.dataset.staticBlockRow === 'true' ? null") &&
		composerRoot.includes('blockCandidates.length') &&
		composerRoot.includes('blockFindings.length'),
	'long documents must keep ordinary selection/link rows static and upgrade only editor-critical or stateful blocks',
);
assert.ok(
	virtualHook.includes('onScrollSettled?.') &&
		composerRoot.includes('releaseOffscreenEditor') &&
		composerRoot.includes('chrome.flushAll().then(() =>') &&
		composerRoot.includes('setHydratedBlockId(null)'),
	'offscreen editors must save and close their interaction state before hard-pin release',
);

const editableText = readFileSync(
	'src/ui/view/composer/chrome/EditableText.tsx',
	'utf8',
);
const commentPanel = readFileSync(
	'src/ui/view/composer/chrome/CommentPanel.tsx',
	'utf8',
);
const staticBranch = /function StaticEditableText[\s\S]*?function InteractiveEditableText/.exec(
	editableText,
)?.[0] ?? '';
const interactiveBranch = /function InteractiveEditableText[\s\S]*?export function SourceVisualPartView/.exec(
	editableText,
)?.[0] ?? '';
assert.ok(staticBranch, 'EditableText must expose a dedicated static visual branch');
assert.ok(
	!staticBranch.includes('DirectEditController') && !staticBranch.includes('MarkdownSourceEditor'),
	'static visual rows must allocate neither editor controller nor contenteditable runtime',
);
assert.ok(
	interactiveBranch.includes('new DirectEditController') &&
		interactiveBranch.includes('<MarkdownSourceEditor'),
	'only the hydrated interactive branch may allocate editing machinery',
);
const commentMarkerBranch = /export function CommentAnchorMarker[\s\S]*?const CommentDraftCard/.exec(
	commentPanel,
)?.[0] ?? '';
assert.ok(
	composerRoot.includes('useDocumentComments(runtime.comments)') &&
		composerRoot.includes('indexCommentsByBlock(comments)') &&
		commentMarkerBranch &&
		!commentMarkerBranch.includes('useComposerChrome()') &&
		!commentMarkerBranch.includes('.subscribe('),
	'comments must be subscribed and indexed once at the document root, never once per virtual row',
);

console.log(`composer-virtualized-rendering: mounted ${mountedRows}/5000 rows`);
