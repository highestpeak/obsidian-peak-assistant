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
assert.ok(
	virtualHook.includes('onScrollIntent?.(scroller)') &&
		virtualHook.includes('frame < config.revealMaxFrames') &&
		virtualHook.includes('if (target) return target'),
	'far locator requests must authorize scrolling and wait for the virtual target to mount',
);
assert.ok(
	virtualHook.includes('composerVirtualViewportIsCovered') &&
		virtualHook.includes('commitViewport(next)') &&
		virtualHook.includes('flushSync'),
	'viewport escape must synchronously replace the stale mounted window before paint',
);
assert.ok(
	virtualHook.includes('layout.measureBatch(measurements') &&
		virtualHook.includes('requestAnimationFrame(flushMeasurements)'),
	'ResizeObserver reports must share one animation-frame measurement batch',
);
assert.ok(
	!virtualHook.includes('getComputedStyle(element)') &&
		!virtualHook.includes('element.getBoundingClientRect().height'),
	'row mounting must not synchronously force per-element style and geometry reads',
);

console.log(`composer-virtualized-rendering: mounted ${mountedRows}/5000 rows`);
