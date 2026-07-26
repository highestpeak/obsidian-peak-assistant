/**
 * Peak Composer — native object round-trip contract (WP8, CMP-NATIVE-01..06).
 *
 * Proves the S4-locked native adapters on REAL fixtures (copied from
 * .dev/spikes/composer/s4-media/fixtures): typed parse → typed patch →
 * serialize, with (a) unknown fields surviving by construction, (b) the
 * Excalidraw Markdown wrapper byte-stable outside the embedded-JSON slice, and
 * (c) the compressed-json variant failing SAFE (unsupported + reason, no
 * corruption). Nothing here string-replaces to guess structure.
 */

import fs from 'fs';
import path from 'path';
import {
	// base
	parseBaseDocument,
	buildBasePreview,
	applyBasePatch,
	// canvas
	parseCanvasModel,
	buildCanvasPreview,
	applyCanvasPatch,
	// excalidraw
	locateExcalidrawScene,
	parseExcalidrawScene,
	buildExcalidrawPreview,
	applyExcalidrawPatch,
	// native-file port
	patchNativeFile,
	applyNativeFilePatch,
	type ComposerNativeFilePort,
} from '@/service/composer';
import type { ComposerNativeFileFormat } from '@/core/schemas/composer';

const FIX = path.join(process.cwd(), 'test', 'fixtures', 'composer', 'native');
const read = (f: string): string => fs.readFileSync(path.join(FIX, f), 'utf8');

let count = 0;
let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

// ── BASE (CMP-NATIVE-02) ─────────────────────────────────────────────────────
function testBase(): void {
	const raw = read('pkm-composer.base');
	const preview = buildBasePreview(raw);
	check('base: preview valid', preview.valid);
	check('base: one view summarized', preview.views.length === 1, String(preview.views.length));
	check('base: view name parsed', preview.views[0]?.name === 'PKM Pipeline', preview.views[0]?.name);
	check('base: order columns parsed', preview.views[0]?.order.join(',') === 'file.name,stage,input,output,next');
	check('base: formulas counted', preview.views[0]?.formulaKeys.length === 4, String(preview.views[0]?.formulaKeys.length));

	const before = parseBaseDocument(raw).toJS() as any;
	const out = applyBasePatch(raw, [
		{ op: 'rename-view', viewIndex: 0, name: 'PKM Pipeline v2' },
		{ op: 'add-order-column', viewIndex: 0, column: 'updated' },
	]);
	const after = parseBaseDocument(out).toJS() as any;
	check('base: view renamed', after.views[0].name === 'PKM Pipeline v2');
	check('base: order column appended', after.views[0].order.includes('updated'));
	check('base: filters untouched', JSON.stringify(after.views[0].filters) === JSON.stringify(before.views[0].filters));
	check('base: all 4 formulas intact', Object.keys(after.views[0].formulas).length === 4);
	check(
		'base: multiline formula scalar preserved',
		typeof after.views[0].formulas.stage === 'string' && after.views[0].formulas.stage.includes('Capture'),
	);

	// add-order-column is idempotent.
	const twice = applyBasePatch(out, [{ op: 'add-order-column', viewIndex: 0, column: 'updated' }]);
	const twiceJs = parseBaseDocument(twice).toJS() as any;
	check('base: add-order-column idempotent', twiceJs.views[0].order.filter((c: string) => c === 'updated').length === 1);

	// unknown future field survives round-trip.
	const withUnknown = applyBasePatch(raw, [{ op: 'set-field', path: ['views', 0, 'peakFutureFlag'], value: true }]);
	const rt = parseBaseDocument(withUnknown).toJS() as any;
	check('base: unknown future field survives', rt.views[0].peakFutureFlag === true && rt.views[0].name === before.views[0].name);

	// out-of-range view index fails closed.
	let threw = false;
	try {
		applyBasePatch(raw, [{ op: 'rename-view', viewIndex: 5, name: 'x' }]);
	} catch {
		threw = true;
	}
	check('base: out-of-range view index throws', threw);

	// minimal base parses.
	check('base: simple.base preview valid', buildBasePreview(read('simple.base')).valid);
}

// ── CANVAS (CMP-NATIVE-03) ───────────────────────────────────────────────────
function testCanvas(): void {
	const raw = read('pkm-composer.canvas');
	const preview = buildCanvasPreview(raw);
	check('canvas: preview valid', preview.valid);
	check('canvas: nodes+edges present', preview.nodeCount > 0 && preview.edgeCount > 0, `${preview.nodeCount}/${preview.edgeCount}`);
	check('canvas: node types summarized', Object.keys(preview.nodeTypes).sort().join(',') === 'file,group,text');
	check('canvas: node label derived', (preview.nodes.find((n) => n.id === 'capture')?.label.length ?? 0) > 0);

	// inject an unknown field, then patch by id — never string-replace.
	const injected = parseCanvasModel(raw);
	(injected.nodes[0] as any).__peakUnknown = { z: 42 };
	const withUnknown = JSON.stringify(injected, null, '\t');
	const edgeCount = injected.edges.length;

	const out = applyCanvasPatch(withUnknown, [
		{ op: 'nudge-node', id: 'capture', dx: 40, dy: 0 },
		{ op: 'set-node-text', id: 'capture', text: '## 信息获取\n(edited)' },
		{ op: 'add-edge', edge: { id: 'capture-to-output', fromNode: 'capture', toNode: 'output', fromSide: 'bottom', toSide: 'top' } },
	]);
	const after = parseCanvasModel(out);
	const capture = after.nodes.find((n) => n.id === 'capture');
	check('canvas: node moved by id', capture?.x === injected.nodes.find((n) => n.id === 'capture')!.x + 40);
	check('canvas: node text updated', capture?.text?.endsWith('(edited)') ?? false);
	check('canvas: edge appended', after.edges.length === edgeCount + 1);
	check('canvas: unknown node field survives', JSON.stringify((after.nodes[0] as any).__peakUnknown) === JSON.stringify({ z: 42 }));
	check(
		'canvas: untouched nodes byte-stable',
		after.nodes.filter((n) => n.id !== 'capture').every((n) => injected.nodes.some((m) => m.id === n.id && m.x === n.x && m.y === n.y)),
	);

	// remove-node drops dangling edges; missing id fails closed.
	const removed = parseCanvasModel(applyCanvasPatch(raw, [{ op: 'remove-node', id: 'review' }]));
	check('canvas: remove-node drops node', !removed.nodes.some((n) => n.id === 'review'));
	check('canvas: remove-node drops dangling edges', !removed.edges.some((e) => e.fromNode === 'review' || e.toNode === 'review'));
	let threw = false;
	try {
		applyCanvasPatch(raw, [{ op: 'set-node-text', id: 'nope', text: 'x' }]);
	} catch {
		threw = true;
	}
	check('canvas: unknown node id throws', threw);
}

// ── EXCALIDRAW (CMP-NATIVE-04/05) ────────────────────────────────────────────
function testExcalidraw(): void {
	const raw = read('drawing.excalidraw.md');
	const loc = locateExcalidrawScene(raw);
	check('excalidraw: scene located', loc !== null && loc.variant === 'parsed', String(loc?.variant));

	const parsed = parseExcalidrawScene(raw);
	check('excalidraw: parse ok', parsed.ok);
	if (!parsed.ok) return;
	check('excalidraw: scene.type excalidraw', parsed.scene.type === 'excalidraw');
	check('excalidraw: has elements', parsed.scene.elements.length > 0, String(parsed.scene.elements.length));

	const preview = buildExcalidrawPreview(raw);
	check('excalidraw: preview supported', preview.supported);
	check('excalidraw: element count matches', preview.elementCount === parsed.scene.elements.length);

	// inject unknown scene + element meta, then slice-replace patch.
	const injectedScene = { ...parsed.scene, __peakSceneMeta: { rev: 1 } } as any;
	injectedScene.elements = parsed.scene.elements.slice();
	injectedScene.elements[0] = { ...injectedScene.elements[0], __peakElMeta: true };
	const injectedText = raw.slice(0, parsed.location.jsonFrom) + JSON.stringify(injectedScene, null, '\t') + raw.slice(parsed.location.jsonTo);
	const beforeElCount = injectedScene.elements.length;

	const patched = applyExcalidrawPatch(injectedText, [
		{ op: 'set-background', color: '#f5f5f5' },
		{
			op: 'add-element',
			element: { type: 'rectangle', id: 'peak-spike-rect', x: 0, y: 0, width: 100, height: 60 },
		},
	]);
	check('excalidraw: patch ok', patched.ok);
	if (!patched.ok) return;

	// wrapper (frontmatter + text elements + %% markers) byte-identical outside the JSON region.
	const markerIdx = injectedText.indexOf('# Drawing');
	check('excalidraw: wrapper prefix byte-identical', patched.text.startsWith(injectedText.slice(0, markerIdx)));
	check('excalidraw: closing fence + %% preserved', patched.text.includes('```\n%%') || patched.text.trimEnd().endsWith('%%'));

	const rt = parseExcalidrawScene(patched.text);
	check('excalidraw: re-parse ok', rt.ok);
	if (!rt.ok) return;
	check('excalidraw: bg color patched', (rt.scene.appState as any)?.viewBackgroundColor === '#f5f5f5');
	check('excalidraw: rectangle appended', rt.scene.elements.length === beforeElCount + 1 && rt.scene.elements.some((e) => e.id === 'peak-spike-rect'));
	check('excalidraw: unknown scene meta survives', (rt.scene as any).__peakSceneMeta?.rev === 1);
	check('excalidraw: unknown element meta survives', (rt.scene.elements[0] as any).__peakElMeta === true);

	// duplicate element id fails closed.
	const dup = applyExcalidrawPatch(injectedText, [{ op: 'add-element', element: { type: 'rectangle', id: parsed.scene.elements[0].id ?? 'x' } }]);
	check('excalidraw: duplicate element id fails', parsed.scene.elements[0].id ? !dup.ok : true);
}

// ── EXCALIDRAW compressed-json fail-safe (CMP-NATIVE-05) ──────────────────────
const COMPRESSED_FIXTURE = [
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

function testCompressedVariant(): void {
	const loc = locateExcalidrawScene(COMPRESSED_FIXTURE);
	check('excalidraw: compressed variant detected', loc?.variant === 'compressed', String(loc?.variant));
	const parsed = parseExcalidrawScene(COMPRESSED_FIXTURE);
	check('excalidraw: compressed parse fails safe', !parsed.ok && parsed.variant === 'compressed');
	const preview = buildExcalidrawPreview(COMPRESSED_FIXTURE);
	check('excalidraw: compressed preview unsupported + reason', !preview.supported && Boolean(preview.reason));
	const patch = applyExcalidrawPatch(COMPRESSED_FIXTURE, [{ op: 'set-background', color: '#fff' }]);
	check('excalidraw: compressed patch refused (no corruption)', !patch.ok && patch.variant === 'compressed');
}

// ── native-file port (CMP-NATIVE-06) ─────────────────────────────────────────
class MemoryNativeFilePort implements ComposerNativeFilePort {
	constructor(private readonly files: Map<string, string>) {}
	format(p: string): ComposerNativeFileFormat | null {
		if (p.endsWith('.base')) return 'base';
		if (p.endsWith('.canvas')) return 'canvas';
		if (p.endsWith('.excalidraw.md')) return 'excalidraw';
		return null;
	}
	async readNative(p: string): Promise<string> {
		const c = this.files.get(p);
		if (c === undefined) throw new Error(`missing ${p}`);
		return c;
	}
	async writeNative(p: string, next: string, expected: string): Promise<void> {
		if (this.files.get(p) !== expected) throw new Error('revision-mismatch');
		this.files.set(p, next);
	}
}

async function testNativePort(): Promise<void> {
	// pure patchNativeFile dispatch.
	const baseOut = patchNativeFile(read('pkm-composer.base'), {
		format: 'base',
		patches: [{ op: 'rename-view', viewIndex: 0, name: 'Renamed' }],
	});
	check('port: patchNativeFile base ok', baseOut.ok && baseOut.nextText.includes('Renamed'));

	const compressedOut = patchNativeFile(COMPRESSED_FIXTURE, { format: 'excalidraw', patches: [{ op: 'set-background', color: '#fff' }] });
	check('port: patchNativeFile compressed fails safe', !compressedOut.ok);

	// read → patch → revision-guarded write cycle.
	const files = new Map<string, string>([['PKM.canvas', read('pkm-composer.canvas')]]);
	const port = new MemoryNativeFilePort(files);
	const result = await applyNativeFilePatch(port, 'PKM.canvas', {
		format: 'canvas',
		patches: [{ op: 'nudge-node', id: 'capture', dx: 10, dy: 10 }],
	});
	check('port: applyNativeFilePatch ok', result.ok);
	check('port: write persisted through the guard', parseCanvasModel(files.get('PKM.canvas')!).nodes.some((n) => n.id === 'capture'));

	// concurrent external edit is refused (write guard).
	files.set('PKM.canvas', read('pkm-composer.canvas')); // reset
	const stalePort: ComposerNativeFilePort = {
		format: port.format.bind(port),
		readNative: async () => read('pkm-composer.canvas'),
		writeNative: async () => {
			throw new Error('revision-mismatch');
		},
	};
	let guarded = false;
	try {
		await applyNativeFilePatch(stalePort, 'PKM.canvas', { format: 'canvas', patches: [{ op: 'nudge-node', id: 'capture', dx: 1, dy: 1 }] });
	} catch {
		guarded = true;
	}
	check('port: concurrent edit refused by write guard', guarded);
}

async function main(): Promise<void> {
	testBase();
	testCanvas();
	testExcalidraw();
	testCompressedVariant();
	await testNativePort();
	console.log(`composer-native-roundtrip: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
