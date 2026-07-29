/**
 * Peak Composer — native structural-edit AI rail (WP-INT, WP8 §10.12).
 *
 * Locks the native-file-patch candidate rail end to end over the REAL production
 * composition (`composeComposerCapabilityRuntime`) plus a fake native-file port:
 *
 *   1. `describeNativePatches` maps typed patches → readable preview lines (the
 *      pure function the renderer card lays out — goal 1);
 *   2. the composition's `validateBindings` accepts the native structural pack
 *      (a materializer + writeback for `native-file-patch` are registered);
 *   3. actionsFor projects EXACTLY the matching-format edit on a native embed,
 *      disabled with a reason when no native-file port is wired (no dead button);
 *   4. a run streams a typed patch bundle as a SKELETON (JSON never surfaces),
 *      materializes into a native-file-patch envelope, and accept writes the
 *      patched bytes through the revision-guarded native-file port — not the
 *      Markdown hub (no document write / History entry);
 *   5. a concurrent external edit to the native file makes accept FAIL CLOSED;
 *   6. an unpatchable/out-of-range patch lands as `unsupported` (accept refused).
 */

import { composeComposerCapabilityRuntime } from '@/app/composer/capabilities/composeComposerCapabilityRuntime';
import {
	ComposerConflictError,
	type ComposerCapabilityDefinition,
	type ComposerResultEnvelope,
} from '@/core/composer';
import type { ComposerNativeFileFormat } from '@/core/schemas/composer';
import {
	createNativeCapabilityPack,
	createNativeFilePatchMaterializer,
	describeNativePatches,
	CANVAS_EDIT_CAPABILITY_ID,
	BASE_EDIT_CAPABILITY_ID,
	EXCALIDRAW_EDIT_CAPABILITY_ID,
	CODE_EXPLAIN_CAPABILITY_ID,
	MERMAID_EXPLAIN_CAPABILITY_ID,
	MERMAID_FILL_BRANCHES_CAPABILITY_ID,
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	type ComposerNativeFilePort,
	type NativeFilePatchEnvelopePayload,
} from '@/service/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';
import { FakeComposerExecutor, nextRunEvent, collectRunEvents } from './helpers/capability-fakes';

const { check, done } = makeChecker();

const PATH = 'note.md';
const CANVAS_PATH = 'board.canvas';
const SOURCE = `# Notes\n\n![[${CANVAS_PATH}]]\n`;
const CANVAS = JSON.stringify(
	{ nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' }], edges: [] },
	null,
	'\t',
);

/** In-memory native-file port with a revision-guarded write (mirrors WP8 adapter). */
class FakeNativePort implements ComposerNativeFilePort {
	writeCount = 0;
	constructor(readonly files: Map<string, string>) {}
	format(path: string): ComposerNativeFileFormat | null {
		if (path.endsWith('.canvas')) return 'canvas';
		if (path.endsWith('.base')) return 'base';
		if (path.endsWith('.excalidraw.md') || path.endsWith('.excalidraw')) return 'excalidraw';
		return null;
	}
	async readNative(path: string): Promise<string> {
		const c = this.files.get(path);
		if (c === undefined) throw new Error(`missing native: ${path}`);
		return c;
	}
	async writeNative(path: string, next: string, expected: string): Promise<void> {
		if ((this.files.get(path) ?? '') !== expected) {
			throw new ComposerConflictError('revision-mismatch', `native write conflict on ${path}`);
		}
		this.files.set(path, next);
		this.writeCount += 1;
	}
}

function setup(opts: { withPort?: boolean } = {}) {
	const vault = new FakeVault();
	const session = openSession(vault, PATH, SOURCE);
	const hub = makeHub(vault, session);
	const executor = new FakeComposerExecutor();
	const nativeFiles = new Map<string, string>([[CANVAS_PATH, CANVAS]]);
	const nativePort = new FakeNativePort(nativeFiles);
	// The production composition — validateBindings runs here; a missing native
	// materializer/writeback would throw before this returns.
	const factory = composeComposerCapabilityRuntime(
		opts.withPort === false ? { executor } : { executor, nativeFilePort: nativePort },
	);
	const runtime = factory.forDocument(session, hub);
	const embed = blockOfKind(session, 'embed');
	const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: embed.blockId });
	return { vault, session, hub, executor, runtime, nativePort, nativeFiles, snapshot };
}

/** 1. describeNativePatches maps each family's ops to readable lines. */
function testDescribe(): void {
	const base = describeNativePatches('base', [
		{ op: 'rename-view', viewIndex: 0, name: 'Roadmap' },
		{ op: 'add-order-column', viewIndex: 1, column: 'Due' },
	]);
	check('describe: base rename line', base.ops[0].includes('Rename view') && base.ops[0].includes('Roadmap'), base.ops[0]);
	check('describe: base add-column line', base.ops[1].includes('Add column') && base.ops[1].includes('Due'), base.ops[1]);

	const canvas = describeNativePatches('canvas', [
		{ op: 'set-node-text', id: 'n1', text: 'x' },
		{ op: 'add-edge', edge: { id: 'e1', fromNode: 'a', toNode: 'b' } },
	]);
	check('describe: canvas node line', canvas.ops[0].includes('node n1'), canvas.ops[0]);
	check('describe: canvas edge line', canvas.ops[1].includes('a') && canvas.ops[1].includes('b'), canvas.ops[1]);

	const ex = describeNativePatches('excalidraw', [{ op: 'add-element', element: { type: 'rectangle' } }]);
	check('describe: excalidraw element line', ex.ops[0].includes('rectangle'), ex.ops[0]);
	check('describe: format carried', canvas.format === 'canvas');
}

function canvasDef(): ComposerCapabilityDefinition {
	const def = createNativeCapabilityPack(() => DEFAULT_COMPOSER_CAPABILITIES_CONFIG)
		.definitions()
		.find((d) => d.manifest.id === CANVAS_EDIT_CAPABILITY_ID);
	if (!def) throw new Error('canvas edit definition missing from native pack');
	return def;
}

function testDedicatedNativeActions(): void {
	const definitions = createNativeCapabilityPack(() => DEFAULT_COMPOSER_CAPABILITIES_CONFIG).definitions();
	const codeExplain = definitions.find((definition) => definition.manifest.id === CODE_EXPLAIN_CAPABILITY_ID);
	const mermaidExplain = definitions.find((definition) => definition.manifest.id === MERMAID_EXPLAIN_CAPABILITY_ID);
	const fillBranches = definitions.find((definition) => definition.manifest.id === MERMAID_FILL_BRANCHES_CAPABILITY_ID);
	check('native: code explain is a read-only analysis', codeExplain?.effectKind === 'analyze' && codeExplain.resultKind === 'analysis' && !codeExplain.writebackAdapterId);
	check('native: Mermaid explain is a read-only analysis', mermaidExplain?.effectKind === 'analyze' && mermaidExplain.resultKind === 'analysis' && !mermaidExplain.writebackAdapterId);
	check('native: fill branches remains reviewable source edit', fillBranches?.effectKind === 'rewrite' && fillBranches.resultKind === 'text-patch' && !!fillBranches.writebackAdapterId);
}

/** 2. Materializer applies a typed patch → nextText + summary; carries the target path. */
function testMaterializer(): void {
	const mat = createNativeFilePatchMaterializer();
	const def = canvasDef();
	const text = JSON.stringify({ patches: [{ op: 'set-node-text', id: 'n1', text: 'World' }] });
	const envelope = mat.materialize({
		definition: def,
		snapshot: { documentId: 'd', revision: 'r', target: { kind: 'block', blockId: 'b' }, targetSource: `![[${CANVAS_PATH}]]` },
		text,
		nativeBaseText: CANVAS,
		nativeTargetPath: CANVAS_PATH,
	});
	const payload = envelope.payload as NativeFilePatchEnvelopePayload;
	check('materialize: envelope kind native-file-patch', envelope.resultKind === 'native-file-patch');
	check('materialize: streamsTypedObject true', mat.streamsTypedObject === true);
	check('materialize: core carries target path', payload.core.targetPath === CANVAS_PATH, payload.core.targetPath);
	check('materialize: nextText applies the patch', typeof payload.core.nextText === 'string' && payload.core.nextText.includes('World'), payload.core.nextText);
	check('materialize: nextText drops the old text', !payload.core.nextText!.includes('Hello'));
	check('materialize: summary describes the node edit', payload.summary.ops[0].includes('node n1'), payload.summary.ops[0]);
}

/** 6. Out-of-range patch → unsupported (fail closed), never a corrupt nextText. */
function testMaterializerFailClosed(): void {
	const mat = createNativeFilePatchMaterializer();
	const text = JSON.stringify({ patches: [{ op: 'set-node-text', id: 'ghost', text: 'X' }] });
	const envelope = mat.materialize({
		definition: canvasDef(),
		snapshot: { documentId: 'd', revision: 'r', target: { kind: 'block', blockId: 'b' }, targetSource: 'x' },
		text,
		nativeBaseText: CANVAS,
		nativeTargetPath: CANVAS_PATH,
	});
	const payload = envelope.payload as NativeFilePatchEnvelopePayload;
	check('fail-closed: unsupported set', payload.core.unsupported === true);
	check('fail-closed: no nextText', payload.core.nextText === undefined);
	check('fail-closed: reason mentions the missing node', /not found|ghost/.test(payload.core.reason ?? ''), payload.core.reason);
}

/** 3. Projection: matching format available with port; disabled without; others hidden. */
function testProjection(): void {
	const withPort = setup();
	const actions = withPort.runtime.actionsFor(withPort.snapshot, 'block-row');
	const ids = actions.map((a) => a.capabilityId);
	check('projection: canvas edit projects on a .canvas embed', ids.includes(CANVAS_EDIT_CAPABILITY_ID), ids.join(','));
	check('projection: base edit hidden (wrong format)', !ids.includes(BASE_EDIT_CAPABILITY_ID));
	check('projection: excalidraw edit hidden (wrong format)', !ids.includes(EXCALIDRAW_EDIT_CAPABILITY_ID));
	const canvas = actions.find((a) => a.capabilityId === CANVAS_EDIT_CAPABILITY_ID);
	check('projection: canvas edit is an ai action', canvas?.group === 'ai');
	check('projection: canvas edit not dead-disabled with a port', !canvas?.disabledReason);

	const noPort = setup({ withPort: false });
	const noPortActions = noPort.runtime.actionsFor(noPort.snapshot, 'block-row');
	const canvasNoPort = noPortActions.find((a) => a.capabilityId === CANVAS_EDIT_CAPABILITY_ID);
	check('projection: no-port canvas edit is DISABLED with a reason', !!canvasNoPort && !!canvasNoPort.disabledReason, canvasNoPort?.disabledReason);
}

/** 4. Happy path: skeleton stream → native envelope → accept writes via the native port. */
async function testHappyPath(): Promise<void> {
	const { vault, hub, executor, runtime, nativePort, nativeFiles, snapshot } = setup();

	executor.queue({ chunks: ['```json\n', '{ "patches": [{ "op": "set-node', '-text", "id": "n1", "text": "World" }] }', '\n```'] });
	const { events, stop } = collectRunEvents(runtime);
	const ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(CANVAS_EDIT_CAPABILITY_ID, snapshot);
	await ready;
	stop();

	// The raw JSON never leaked into the streamed body (skeleton only).
	const deltas = events.filter((e) => e.type === 'content-delta');
	check('native: streamed deltas never surface raw JSON', deltas.length > 0 && deltas.every((e) => e.type === 'content-delta' && e.text === ''));

	// Executor got the shared native PromptId + the format + the native bytes.
	const request = executor.requests[0];
	check('native: executor got the native PromptId', request?.promptId === 'doc-native-edit', request?.promptId);
	check('native: variables carry the format', request?.variables.format === 'canvas', String(request?.variables.format));
	check('native: variables carry the native bytes', request?.variables.native === CANVAS);

	const candidate = hub.projection().candidates[0];
	const envelope = candidate?.proposedChange.result as ComposerResultEnvelope | undefined;
	check('native: candidate ready with native-file-patch envelope', candidate?.status === 'ready' && envelope?.resultKind === 'native-file-patch');
	check('native: nothing written before accept', nativePort.writeCount === 0 && nativeFiles.get(CANVAS_PATH) === CANVAS && vault.writeCount === 0);

	await runtime.accept(candidate!.candidateId);
	check('native: accept wrote the patched canvas through the native port', nativeFiles.get(CANVAS_PATH)!.includes('World'), nativeFiles.get(CANVAS_PATH));
	check('native: accept did NOT touch the Markdown document', vault.read(PATH) === SOURCE && vault.writeCount === 0);
	check('native: accept produced no Markdown History entry', hub.projection().history.length === 0);
	check('native: candidate left the pending list (accepted)', hub.projection().candidates.every((c) => c.status !== 'ready'));
}

/** 5. Concurrent external native edit → accept fails closed (revision guard). */
async function testAcceptRevisionGuard(): Promise<void> {
	const { hub, executor, runtime, nativeFiles, snapshot } = setup();
	executor.queue({ chunks: [JSON.stringify({ patches: [{ op: 'set-node-text', id: 'n1', text: 'World' }] })] });
	const ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(CANVAS_EDIT_CAPABILITY_ID, snapshot);
	await ready;

	// Someone edits the .canvas file out of band after the run captured its base.
	nativeFiles.set(CANVAS_PATH, CANVAS.replace('Hello', 'Externally changed'));

	const candidate = hub.projection().candidates[0];
	let threw = false;
	try {
		await runtime.accept(candidate!.candidateId);
	} catch {
		threw = true;
	}
	check('guard: accept threw on a concurrent native edit', threw);
	check('guard: the external edit is preserved (no clobber)', nativeFiles.get(CANVAS_PATH)!.includes('Externally changed'));
	check('guard: candidate stays pending after a failed accept', hub.projection().candidates.some((c) => c.candidateId === candidate!.candidateId && c.status === 'ready'));
}

async function main(): Promise<void> {
testDescribe();
testDedicatedNativeActions();
	testMaterializer();
	testMaterializerFailClosed();
	testProjection();
	await testHappyPath();
	await testAcceptRevisionGuard();
	done('composer-native-runtime');
}

void main();
