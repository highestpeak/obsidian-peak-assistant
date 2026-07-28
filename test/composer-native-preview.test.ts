/**
 * Peak Composer — native embed preview chain.
 *
 * Locks the small app-owned preview seam added after WP8: Markdown embeds keep
 * their Markdown source anchors, while `.base` / `.canvas` / `.excalidraw.md`
 * targets are resolved through a native preview port and parsed from real target
 * bytes. The UI never treats native file offsets as Markdown offsets.
 */

import fs from 'fs';
import path from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	type ComposerNativePreviewPort,
	type ComposerNativePreviewRequest,
	type ComposerNativePreviewState,
	analyzeLinks,
	buildBasePreview,
	buildCanvasPreview,
	buildExcalidrawPreview,
	classifyComposerNativeTarget,
	parseComposerDocument,
} from '@/service/composer';
import { NativeBlockFrame, NativeSourceView } from '@/ui/view/composer/blocks/nativeBlockShared';
import { DEFAULT_NATIVE_BLOCK_STRINGS } from '@/ui/view/composer/blocks/nativeBlockConfig';

const ASSETS = path.join(process.cwd(), 'docs', 'gstack', 'peak-composer-editing-view-2026-07-09', 'assets');
const readAsset = (file: string): string => fs.readFileSync(path.join(ASSETS, file), 'utf8');

let count = 0;
let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

function done(): void {
	console.log(`composer-native-preview: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

class FakeNativePreviewPort implements ComposerNativePreviewPort {
	private readonly listeners = new Set<() => void>();

	constructor(private readonly states: Map<string, ComposerNativePreviewState>) {}

	async resolveNativePreview(request: ComposerNativePreviewRequest): Promise<ComposerNativePreviewState> {
		const state = this.states.get(request.target);
		if (state) return state;
		return { status: 'missing', format: request.format, requestedTarget: request.target };
	}

	onNativePreviewChange(_request: ComposerNativePreviewRequest, cb: () => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	set(target: string, state: ComposerNativePreviewState): void {
		this.states.set(target, state);
		for (const cb of this.listeners) cb();
	}
}

function testSharedClassification(): void {
	const source = [
		'![[pkm-composer.base]]',
		'![[pkm-composer.canvas]]',
		'![[101-A-产品类别分析.excalidraw.md]]',
		'![[regular-note]]',
	].join('\n\n');
	const snapshot = parseComposerDocument(source, { filePath: 'folder/source.md' });
	const kinds = snapshot.nativeRefs.map((ref) => ref.kind);
	check('parser: .base classified native', kinds.includes('base'), kinds.join(','));
	check('parser: .canvas classified native', kinds.includes('canvas'), kinds.join(','));
	check('parser: .excalidraw.md classified native', kinds.includes('excalidraw'), kinds.join(','));
	check('parser: normal note remains embed', kinds.includes('embed'), kinds.join(','));
	check('parser: native embeds remain Markdown embed blocks', snapshot.blocks.every((block) => block.kind === 'embed'));

	const links = analyzeLinks(source);
	check('link-analysis: excalidraw markdown embed remains an embed token', links.some((l) => l.kind === 'embed' && l.target.endsWith('.excalidraw.md')));
	check('shared classifier: excalidraw.md resolves to excalidraw', classifyComposerNativeTarget('101-A.excalidraw.md') === 'excalidraw');
	check('shared classifier: note.md is not native excalidraw', classifyComposerNativeTarget('note.md') === 'embed');

	const imageSource = '![[public-image/路线图.png|路线图|720]]';
	const imageSnapshot = parseComposerDocument(imageSource, { filePath: 'folder/source.md' });
	check('parser: bare image wikilink dispatches to image block', imageSnapshot.blocks[0]?.kind === 'image');
	check('parser: bare image wikilink keeps an image native ref', imageSnapshot.nativeRefs[0]?.kind === 'image');
	check('parser: bare image wikilink round-trips byte-identically', imageSnapshot.sourceText === imageSource);

	const aliasImageSource = '![[路线图|720]]';
	const aliasImageSnapshot = parseComposerDocument(aliasImageSource, { filePath: 'folder/source.md' });
	check('parser: extensionless wikilink with image width dispatches to image block', aliasImageSnapshot.blocks[0]?.kind === 'image');
	check('parser: extensionless wikilink with image width keeps an image native ref', aliasImageSnapshot.nativeRefs[0]?.kind === 'image');
}

async function testFakePreviewStates(): Promise<void> {
	const port = new FakeNativePreviewPort(new Map([
		['pkm-composer.base', { status: 'loaded', format: 'base', targetPath: 'folder/pkm-composer.base', text: readAsset('pkm-composer.base') }],
		['missing.canvas', { status: 'missing', format: 'canvas', requestedTarget: 'missing.canvas', message: 'missing' }],
		['bad.base', { status: 'error', format: 'base', requestedTarget: 'bad.base', message: 'permission denied' }],
	]));
	const loaded = await port.resolveNativePreview({ sourcePath: 'folder/source.md', target: 'pkm-composer.base', format: 'base' });
	check('fake port: loaded state explicit', loaded.status === 'loaded' && loaded.targetPath === 'folder/pkm-composer.base');
	check('fake port: loaded bytes are real base bytes', loaded.status === 'loaded' && buildBasePreview(loaded.text).valid);

	const missing = await port.resolveNativePreview({ sourcePath: 'folder/source.md', target: 'missing.canvas', format: 'canvas' });
	check('fake port: missing state explicit', missing.status === 'missing' && missing.requestedTarget === 'missing.canvas');
	const error = await port.resolveNativePreview({ sourcePath: 'folder/source.md', target: 'bad.base', format: 'base' });
	check('fake port: error state explicit', error.status === 'error' && /permission/.test(error.message));

	let changes = 0;
	const off = port.onNativePreviewChange?.({ sourcePath: 'folder/source.md', target: 'pkm-composer.base', format: 'base' }, () => {
		changes += 1;
	});
	port.set('pkm-composer.base', { status: 'loaded', format: 'base', targetPath: 'folder/pkm-composer.base', text: 'views: []\n' });
	check('fake port: external change triggers safe reload hook', changes === 1, String(changes));
	off?.();
}

function testRealFixturePreviews(): void {
	const base = buildBasePreview(readAsset('pkm-composer.base'));
	check('fixture base: valid preview', base.valid);
	check('fixture base: real view name parsed', base.views[0]?.name === 'PKM Pipeline', base.views[0]?.name);

	const canvas = buildCanvasPreview(readAsset('pkm-composer.canvas'));
	check('fixture canvas: valid preview', canvas.valid);
	check('fixture canvas: real nodes parsed', canvas.nodeCount >= 3, String(canvas.nodeCount));
	check('fixture canvas: real edges parsed', canvas.edgeCount >= 1, String(canvas.edgeCount));

	const excalidraw = buildExcalidrawPreview(readAsset('101-A-产品类别分析.excalidraw.md'));
	check('fixture excalidraw: compressed fixture fails safe', !excalidraw.supported && Boolean(excalidraw.reason));
	check('fixture excalidraw: unsupported shell has no fake elements', excalidraw.elementCount === undefined);
}

function testCompressedExcalidrawFailSafe(): void {
	const compressed = [
		'---',
		'excalidraw-plugin: parsed',
		'---',
		'',
		'# Drawing',
		'```compressed-json',
		'N4KABGAOAiCu2VZ0DGKBm+YAsIBcAtYBaYADgFYBGAJwCMWbNMBmVU/',
		'```',
		'%%',
		'',
	].join('\n');
	const preview = buildExcalidrawPreview(compressed);
	check('compressed excalidraw: unsupported preview shell', !preview.supported && Boolean(preview.reason));
	check('compressed excalidraw: no fake element count', preview.elementCount === undefined);
}

function testSourceMappingMarkup(): void {
	const source = '![[pkm-composer.base]]';
	const block = parseComposerDocument(source, { filePath: 'folder/source.md' }).blocks[0];
	const frame = renderToStaticMarkup(
		React.createElement(
			NativeBlockFrame,
			{
				blockId: block.blockId,
				sourceFrom: block.source.from,
				mode: 'preview',
				onMode: () => undefined,
				strings: DEFAULT_NATIVE_BLOCK_STRINGS,
				nativeTarget: 'folder/pkm-composer.base',
			},
			React.createElement('span', null, 'preview'),
		),
	);
	check('mapping: wrapper keeps Markdown embed source offset', frame.includes('data-src-text-from="0"'), frame);
	check('mapping: wrapper carries native target', frame.includes('data-native-target="folder/pkm-composer.base"'), frame);

	const nativeSource = renderToStaticMarkup(
		React.createElement(NativeSourceView, {
			raw: 'views: []\n',
			blockId: block.blockId,
			nativeTarget: 'folder/pkm-composer.base',
		}),
	);
	check('mapping: native source carries target', nativeSource.includes('data-native-target="folder/pkm-composer.base"'), nativeSource);
	check('mapping: native source does not pretend to have Markdown offsets', !nativeSource.includes('data-src-text-from'), nativeSource);

	const markdownSource = renderToStaticMarkup(
		React.createElement(NativeSourceView, {
			raw: source,
			blockId: block.blockId,
			sourceFrom: block.source.from,
		}),
	);
	check('mapping: Markdown fallback source keeps Markdown offset', markdownSource.includes('data-src-text-from="0"'), markdownSource);
}

async function main(): Promise<void> {
	testSharedClassification();
	await testFakePreviewStates();
	testRealFixturePreviews();
	testCompressedExcalidrawFailSafe();
	testSourceMappingMarkup();
	done();
}

void main();
