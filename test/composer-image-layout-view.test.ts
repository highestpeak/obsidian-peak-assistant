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

function renderHtml(raw: string, editing = false): string {
	const value = {
		runtime: editing ? { hub: { commit: async () => undefined } as never } : {},
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
			React.createElement(BlockKindView, { block: createBlock(raw), editing }),
		),
	);
}

function testContractRecognized(): void {
	const html = renderHtml(KNOWN_LAYOUT_HTML);
	check('exact layout contract renders image layout view', html.includes('pk-composer-image-layout'));
	check('exact layout contract does not use mono fallback', html.includes('pk-composer-mono') === false);
	check('exact layout has mock shell, head and source footer', html.includes('image-layout-shell') && html.includes('image-layout-head') && html.includes('image-layout-source'));
	check('exact layout keeps four flat figures, never nested thumbs', (html.match(/peak-image-layout__item/g) ?? []).length === 4 && html.includes('peak-image-layout__thumbs') === false);
	check('layout root is a block container, not a span that browsers reparent', html.includes('<div class="pk-composer-image-layout"'));
	check('read-only layout has no non-functional mode controls', html.includes('pk-composer-image-layout-mode') === false);
	const editable = renderHtml(KNOWN_LAYOUT_HTML, true);
	check('editable layout exposes four transaction-backed mode controls', (editable.match(/pk-composer-image-layout-mode/g) ?? []).length === 4);
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
