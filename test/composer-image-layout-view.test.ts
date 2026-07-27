import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stubComposerCapabilityProjection, type ComposerDocumentSnapshot, type ComposerBlock } from '@/core/composer';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer/config/composerConfig';
import { BlockKindView } from '@/ui/view/composer/blocks/BlockKindView';
import { ComposerChromeProvider } from '@/ui/view/composer/chrome/ComposerChromeContext';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const KNOWN_LAYOUT_HTML =
	'<div class="peak-image-layout" data-layout="hero">' +
	'<figure><img src="a.png" alt="A"><figcaption>Alpha</figcaption></figure>' +
	'<figure><img src="b.png" alt="B"><figcaption>Beta</figcaption></figure>' +
	'<figure><img src="c.png" alt="C"><figcaption>Gamma</figcaption></figure>' +
	'<figure><img src="d.png" alt="D"><figcaption>Delta</figcaption></figure>' +
	'</div>';

const UNKNOWN_LAYOUT_HTML =
	'<div class="peak-image-layout">' +
	'<figure><img src="a.png" alt="A"><figcaption>Alpha</figcaption></figure>' +
	'<figure><img src="b.png" alt="B"><figcaption>Beta</figcaption></figure>' +
	'<figure><img src="c.png" alt="C"><figcaption>Gamma</figcaption></figure>' +
	'<figure><img src="d.png" alt="D"><figcaption>Delta</figcaption></figure>' +
	'</div>';

function createBlock(raw: string): ComposerBlock {
	return {
		blockId: 'b1',
		kind: 'html',
		source: { revision: 'r1', from: 0, to: raw.length, semanticFingerprint: 'f1' },
		children: [],
		units: [],
		renderModel: { raw },
	};
}

function renderHtml(raw: string): string {
	const value = {
		runtime: {},
		projection: stubComposerCapabilityProjection,
		candidateRegistry: {} as never,
		config: DEFAULT_COMPOSER_CONFIG,
		snapshot: null as unknown as ComposerDocumentSnapshot,
		burstWindowMs: 100,
		scrollGuardGestureWindowMs: 100,
		registerFlusher: () => () => {},
		flushAll: async () => {},
	};
	return renderToStaticMarkup(
		React.createElement(
			ComposerChromeProvider,
			{ value },
			React.createElement(BlockKindView, { block: createBlock(raw) }),
		),
	);
}

function testContractRecognized(): void {
	const html = renderHtml(KNOWN_LAYOUT_HTML);
	check('exact layout contract renders image layout view', html.includes('pk-composer-image-layout'));
	check('exact layout contract does not use mono fallback', html.includes('pk-composer-mono') === false);
}

function testUnknownLayoutVerbatim(): void {
	const html = renderHtml(UNKNOWN_LAYOUT_HTML);
	check('non-contract html stays verbatim in mono', html.includes('pk-composer-mono'));
	check('verbatim source escapes html tags', html.includes('&lt;div class=&quot;peak-image-layout&quot;') === true);
}

function main(): void {
	testContractRecognized();
	testUnknownLayoutVerbatim();
	done('composer-image-layout-view');
}

main();
