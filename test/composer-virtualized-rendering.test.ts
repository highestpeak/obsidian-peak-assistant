import assert from 'assert';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import { ComposerDocumentSession } from '@/service/composer';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { readFileSync } from 'fs';

const sourceText = Array.from({ length: 5_000 }, (_, index) => `Paragraph ${index}.`).join('\n\n');
const session = ComposerDocumentSession.fromSource('Virtual.md', sourceText);
const state: DocumentComposerState = {
	status: 'loaded',
	filePath: 'Virtual.md',
	snapshot: session.snapshot,
};
const source: ComposerStateSource = {
	getState: () => state,
	subscribe: () => () => undefined,
};

const html = renderToStaticMarkup(React.createElement(ComposerRoot, { source }));
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
		composerRoot.includes("? { top: offset, height, overflow: 'hidden' }") &&
		composerRoot.includes(': { top: offset }}') &&
		composerRoot.includes('style={{ height: virtualWindow.totalHeight }}'),
	'virtual rows must use independent absolute offsets instead of cumulative normal-flow gaps',
);
assert.ok(
	/\.pk-composer-virtual-item\s*\{[\s\S]*?position:\s*absolute;/.test(composerCss),
	'virtual row CSS must keep each mounted row independently positioned',
);
assert.ok(
	virtualHook.includes('lightweightProjection') &&
		virtualHook.includes('dataset.virtualMeasurementSuspended') &&
		virtualHook.includes('programmaticMeasurementScrollTopRef') &&
		virtualHook.includes('scheduleSettledProjection()'),
	'long-document scrolling must suspend heavy row projection and ignore proxy measurements',
);
const scrollProjection = /function ComposerScrollProjectionRow[\s\S]*?function ComposerBlockRow/.exec(
	composerRoot,
)?.[0] ?? '';
assert.ok(scrollProjection, 'Composer must define a dedicated scrolling projection row');
assert.ok(
	!scrollProjection.includes('<ComposerBlockRow') &&
		!scrollProjection.includes('<BlockRail') &&
		!scrollProjection.includes('<BlockBody') &&
		!scrollProjection.includes('<EditableText'),
	'scrolling projection must not instantiate editor, rail, object renderer, or action chrome',
);
assert.ok(
	composerRoot.includes('data-virtual-measurement-suspended') &&
		composerRoot.includes('virtualWindow.lightweightProjection') &&
		composerRoot.includes('&& !pinnedBlockIds.has(b.blockId)') &&
		composerRoot.includes('lightweightScrollMaxChars'),
	'lightweight rows must keep their indexed height while hard-pinned interactions stay complete',
);

console.log(`composer-virtualized-rendering: mounted ${mountedRows}/5000 rows`);
