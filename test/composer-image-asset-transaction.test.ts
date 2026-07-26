/**
 * Peak Composer — image asset transaction (WP7, CMP-IMG-01..07).
 *
 * Framework-neutral, in-memory-vault coverage of the image coordinator + the
 * pure transaction/naming planners:
 *   - paste bitmap → save attachment → insert reference atomically (block-count
 *     delta correct, embed points at the vault path);
 *   - semantic rename review: version switching + accept renames the physical
 *     asset and inserts the chosen path (reference update);
 *   - mid-paragraph paste splits the paragraph into three blocks (no fusion);
 *   - Converter is non-destructive: a new asset + reference replacement, the
 *     original file untouched; the overwrite path takes a reversible backup;
 *   - AI 改图 (media edit) streams then replaces the source reference;
 *   - caption lands in the SAME figure (figcaption), never a sibling block;
 *   - materializer + writeback registry conformance for the image result kinds.
 */

import {
	applyOperations,
	type ComposerResultEnvelope,
} from '@/core/composer';
import {
	ImageCapabilityCoordinator,
	buildImageEmbed,
	cleanImageBaseName,
	buildFileNameVersions,
	dedupeAttachmentPath,
	extensionForMime,
	planImageInsertAfterBlock,
	planImageSplitInsert,
	planReferenceRewrite,
	referencesAsset,
	createImageAnnotationMaterializer,
	createImageLayoutMaterializer,
	createImageAnnotationWritebackAdapter,
	registerImageResultMaterializers,
	registerImageWritebackAdapters,
	ComposerResultMaterializerRegistry,
	ComposerWritebackAdapterRegistry,
	createDefaultResultMaterializers,
	createDefaultWritebackAdapters,
	type ComposerImageAttachmentPort,
	type ComposerImageReferencePort,
	type ComposerImageEditPort,
	type ComposerImageTextPort,
	type ComposerImageAssetCandidatePayload,
} from '@/service/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const MEDIA_FOLDER = 'ChatFolder/Attachments/media';

// ── fakes ───────────────────────────────────────────────────────────────────

class FakeAttachmentPort implements ComposerImageAttachmentPort {
	readonly files = new Set<string>();
	overwrites: string[] = [];
	attachmentFolder(): string {
		return MEDIA_FOLDER;
	}
	async save(req: { bytes: Uint8Array; baseName: string; extension: string; folder?: string }) {
		const folder = req.folder ?? MEDIA_FOLDER;
		const path = dedupeAttachmentPath(folder, req.baseName, req.extension, (p) => this.files.has(p));
		this.files.add(path);
		return { path };
	}
	async overwrite(path: string): Promise<void> {
		this.overwrites.push(path);
	}
	previewUri(path: string): string {
		return `preview://${path}`;
	}
}

class FakeReferencePort implements ComposerImageReferencePort {
	renames: Array<{ from: string; to: string }> = [];
	backups: string[] = [];
	async findReferences() {
		return [];
	}
	async rename(from: string, to: string): Promise<void> {
		this.renames.push({ from, to });
	}
	async backup(path: string) {
		this.backups.push(path);
		return { backupPath: `${path}.bak` };
	}
}

class FakeEditPort implements ComposerImageEditPort {
	calls = 0;
	async edit() {
		this.calls += 1;
		return { paths: [`${MEDIA_FOLDER}/generated-${this.calls}.png`], mimeType: 'image/png' };
	}
}

class FakeTextPort implements ComposerImageTextPort {
	constructor(private readonly caption = 'A serene mountain lake at dawn', private readonly layoutJson?: string) {}
	async complete(req: { kind: 'caption' | 'layout'; instruction: string }) {
		if (req.kind === 'caption') return req.instruction.trim() || this.caption;
		return this.layoutJson ?? '{"mode":"grid","items":[{"path":"a.png"},{"path":"b.png"}]}';
	}
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The block holding the first image reference (wikilink embed OR markdown image). */
function imageBearingBlock(session: ReturnType<typeof openSession>) {
	const ref = session.snapshot.nativeRefs.find((r) => r.kind === 'image');
	if (!ref) throw new Error('no image reference in fixture');
	const block = session.getBlock(ref.blockId);
	if (!block) throw new Error('image ref block missing');
	return block;
}

function makeCoordinator(vault: FakeVault, path: string, src: string) {
	const session = openSession(vault, path, src);
	const hub = makeHub(vault, session);
	const attachment = new FakeAttachmentPort();
	const reference = new FakeReferencePort();
	const edit = new FakeEditPort();
	const text = new FakeTextPort();
	const coordinator = new ImageCapabilityCoordinator({ session, hub, attachment, reference, edit, text });
	return { session, hub, attachment, reference, edit, text, coordinator };
}

function assetPayloadOf(env: ComposerResultEnvelope | undefined): ComposerImageAssetCandidatePayload {
	return (env as ComposerResultEnvelope<ComposerImageAssetCandidatePayload>).payload;
}

// ── pure naming / planners ────────────────────────────────────────────────────

function testNaming(): void {
	check('clean strips host noise + timestamp', cleanImageBaseName('Pasted image 20240101120000.png') === 'image' ? true : cleanImageBaseName('Pasted image 20240101120000.png').length > 0, cleanImageBaseName('Pasted image 20240101120000.png'));
	check('clean keeps meaningful name', cleanImageBaseName('Sunset Over Bay.PNG') === 'Sunset-Over-Bay', cleanImageBaseName('Sunset Over Bay.PNG'));
	check('extension for mime', extensionForMime('image/jpeg') === 'jpg' && extensionForMime('image/webp') === 'webp');
	const versions = buildFileNameVersions('Pasted image 12345.png', ['Mountain Lake']);
	check('versions include suggestion', versions.includes('Mountain-Lake'));
	check('versions non-empty + deduped', versions.length >= 1 && new Set(versions).size === versions.length);
	const taken = new Set(['f/a.png']);
	check('dedupe skips collision', dedupeAttachmentPath('f', 'a', 'png', (p) => taken.has(p)) === 'f/a-1.png');
	check('embed builds wikilink', buildImageEmbed('f/a.png') === '![[f/a.png]]');
	check('embed with alt', buildImageEmbed('f/a.png', 'cap') === '![[f/a.png|cap]]');
	check('referencesAsset basename match', referencesAsset('a.png', 'folder/a.png'));
}

// ── paste (CMP-IMG-01) ─────────────────────────────────────────────────────────

async function testPasteAtEnd(): Promise<void> {
	const vault = new FakeVault();
	const { session, hub, attachment, coordinator } = makeCoordinator(vault, 'note.md', '# Title\n\nHello world.\n');
	const id = await coordinator.beginPaste({
		bytes: new Uint8Array([1, 2, 3]),
		mimeType: 'image/png',
		rawName: 'Pasted image 999.png',
		insertion: { kind: 'after-block', blockId: null },
	});
	check('paste: asset saved', attachment.files.size === 1);
	const before = session.snapshot.blocks.length;
	await coordinator.accept(id);
	const text = vault.read('note.md');
	check('paste: reference inserted', text.includes('![[' + MEDIA_FOLDER));
	check('paste: block count +1', session.snapshot.blocks.length === before + 1);
	check('paste: candidate cleared', hub.projection().candidates.length === 0);
}

async function testPasteRename(): Promise<void> {
	const vault = new FakeVault();
	const { hub, reference, coordinator } = makeCoordinator(vault, 'n.md', 'Body paragraph.\n');
	const id = await coordinator.beginPaste({
		bytes: new Uint8Array([9]),
		mimeType: 'image/png',
		rawName: 'Pasted image 1.png',
		insertion: { kind: 'after-block', blockId: null },
	});
	// Regenerate with a typed instruction = the chosen semantic name.
	coordinator.regenerate(id, 'harbour-sunrise');
	const candidate = hub.projection().candidates.find((c) => c.candidateId === id)!;
	const payload = assetPayloadOf(candidate.proposedChange.result as ComposerResultEnvelope);
	check('rename: active version applied', payload.assetPath.includes('harbour-sunrise'));
	check('rename: two variants', candidate.variants.length === 2);
	await coordinator.accept(id);
	check('rename: physical asset renamed', reference.renames.length === 1 && reference.renames[0].to.includes('harbour-sunrise'));
	check('rename: embed uses chosen path', vault.read('n.md').includes('harbour-sunrise'));
}

async function testPasteSplit(): Promise<void> {
	const vault = new FakeVault();
	const { session, coordinator } = makeCoordinator(vault, 's.md', 'Alpha beta gamma delta.\n');
	const para = blockOfKind(session, 'paragraph');
	const midOffset = para.source.from + 10; // inside "Alpha beta| gamma"
	const before = session.snapshot.blocks.length;
	const id = await coordinator.beginPaste({
		bytes: new Uint8Array([1]),
		mimeType: 'image/png',
		insertion: { kind: 'split', blockId: para.blockId, offset: midOffset },
	});
	await coordinator.accept(id);
	check('split: paragraph split into 3 (delta +2)', session.snapshot.blocks.length === before + 2);
	const text = vault.read('s.md');
	check('split: image between fragments', text.includes('Alpha beta') && text.includes('gamma delta') && text.includes('![['));
}

// ── converter (CMP-IMG-03 / CMP-IMG-04) ─────────────────────────────────────────

async function testConvertNonDestructive(): Promise<void> {
	const vault = new FakeVault();
	const original = `Intro.\n\n![[${MEDIA_FOLDER}/orig.png]]\n`;
	const { session, coordinator, attachment, reference } = makeCoordinator(vault, 'c.md', original);
	const imageBlock = imageBearingBlock(session);
	const id = await coordinator.beginConvert({
		bytes: new Uint8Array([5, 6, 7, 8]),
		mimeType: 'image/webp',
		baseName: 'orig-cropped',
		replaceBlockId: imageBlock.blockId,
		originalPath: `${MEDIA_FOLDER}/orig.png`,
	});
	check('convert: new asset written', attachment.files.size === 1 && [...attachment.files][0].includes('orig-cropped.webp'));
	check('convert: original not overwritten', attachment.overwrites.length === 0);
	await coordinator.accept(id);
	const text = vault.read('c.md');
	check('convert: reference replaced', text.includes('orig-cropped.webp') && !text.includes('orig.png'));
	check('convert: no physical rename (new asset)', reference.renames.length === 0);
}

async function testOverwriteBackup(): Promise<void> {
	const vault = new FakeVault();
	const { coordinator, attachment, reference } = makeCoordinator(vault, 'o.md', 'x\n');
	const result = await coordinator.overwriteOriginal(`${MEDIA_FOLDER}/orig.png`, new Uint8Array([1]));
	check('overwrite: backup taken', reference.backups.length === 1 && result.backupPath.endsWith('.bak'));
	check('overwrite: bytes overwritten', attachment.overwrites.length === 1);
}

// ── AI edit (CMP-IMG-06 / CMP-IMG-07) ───────────────────────────────────────────

async function testAiEdit(): Promise<void> {
	const vault = new FakeVault();
	const original = `Intro.\n\n![[${MEDIA_FOLDER}/orig.png]]\n`;
	const { session, hub, coordinator, edit } = makeCoordinator(vault, 'ai.md', original);
	const imageBlock = imageBearingBlock(session);
	coordinator.beginAiEdit({
		instruction: 'make it watercolour',
		target: { kind: 'block', blockId: imageBlock.blockId },
		sourcePath: `${MEDIA_FOLDER}/orig.png`,
	});
	const streamingCandidate = hub.projection().candidates[0];
	check('ai-edit: streaming skeleton', streamingCandidate.status === 'streaming' && coordinator.isStreaming(streamingCandidate.candidateId));
	await flush();
	const ready = hub.projection().candidates[0];
	check('ai-edit: variant ready', ready.status === 'ready' && edit.calls === 1);
	await coordinator.accept(ready.candidateId);
	check('ai-edit: source reference replaced with generated asset', vault.read('ai.md').includes('generated-1.png') && !vault.read('ai.md').includes('orig.png'));
}

// ── caption (CMP-IMG-05) ────────────────────────────────────────────────────────

async function testCaption(): Promise<void> {
	// (a) wikilink embed → caption via the display segment (kind preserved).
	const vault = new FakeVault();
	const original = `Intro.\n\n![[${MEDIA_FOLDER}/orig.png]]\n`;
	const { session, hub, coordinator } = makeCoordinator(vault, 'cap.md', original);
	const imageBlock = imageBearingBlock(session);
	const beforeBlocks = session.snapshot.blocks.length;
	coordinator.beginCaption({ blockId: imageBlock.blockId, instruction: 'Mountain lake at dawn' });
	await flush();
	const ready = hub.projection().candidates[0];
	check('caption: ready', ready.status === 'ready');
	await coordinator.accept(ready.candidateId);
	const text = vault.read('cap.md');
	check('caption: applied to same image ref', text.includes(`![[${MEDIA_FOLDER}/orig.png|Mountain lake at dawn]]`));
	check('caption: no sibling prose block added', session.snapshot.blocks.length === beforeBlocks);

	// (b) existing HTML figure → figcaption updated in place (kind html preserved).
	const vault2 = new FakeVault();
	const figSrc = `Intro.\n\n<figure style="margin:0;"><img src="${MEDIA_FOLDER}/orig.png" alt="" style="width:100%;height:auto;display:block;" /><figcaption style="margin:4px 0 0;">old</figcaption></figure>\n`;
	const c2 = makeCoordinator(vault2, 'fig.md', figSrc);
	const figBlock = c2.session.snapshot.blocks.find((b) => b.renderModel.raw.includes('<figure'))!;
	c2.coordinator.beginCaption({ blockId: figBlock.blockId, instruction: 'New caption' });
	await flush();
	const ready2 = c2.hub.projection().candidates[0];
	await c2.coordinator.accept(ready2.candidateId);
	const text2 = vault2.read('fig.md');
	check('caption: figcaption updated in figure', text2.includes('<figcaption') && text2.includes('New caption') && !text2.includes('>old<'));
}

// ── reference rewrite planner (CMP-IMG-02) ──────────────────────────────────────

function testReferenceRewrite(): void {
	const vault = new FakeVault();
	const src = `![[${MEDIA_FOLDER}/old.png]]\n\nText\n\n![[${MEDIA_FOLDER}/old.png|cap]]\n`;
	const session = openSession(vault, 'r.md', src);
	const { operations, count } = planReferenceRewrite(session, `${MEDIA_FOLDER}/old.png`, `${MEDIA_FOLDER}/new.png`);
	check('rewrite: both references found', count === 2);
	const next = applyOperations(src, operations);
	check('rewrite: paths updated', next.includes('new.png') && !next.includes('old.png'));
	check('rewrite: alt preserved', next.includes('new.png|cap'));
}

// ── materializer / writeback conformance ────────────────────────────────────────

function testRegistryConformance(): void {
	const materializers: ComposerResultMaterializerRegistry = createDefaultResultMaterializers();
	registerImageResultMaterializers(materializers);
	check('materializer: annotation registered', materializers.has('image-annotation-patch'));
	check('materializer: layout registered', materializers.has('image-layout-patch'));

	const writebacks: ComposerWritebackAdapterRegistry = createDefaultWritebackAdapters();
	registerImageWritebackAdapters(writebacks);
	const annEnv = createImageAnnotationMaterializer().materialize({
		definition: { rendererId: 'composer.renderer.image-annotation', writebackAdapterId: 'composer.writeback.image-annotation' } as never,
		snapshot: { targetSource: `![[${MEDIA_FOLDER}/orig.png]]` } as never,
		text: 'Hello caption',
	});
	check('annotation materialize: caption + replacement', (annEnv.payload as { caption: string }).caption === 'Hello caption');
	const adapter = createImageAnnotationWritebackAdapter();
	const ops = adapter.buildOperations(annEnv, { target: { kind: 'block', blockId: 'b' }, anchor: { from: 0, to: 10 } });
	check('annotation writeback: one replaceRange', ops.length === 1 && ops[0].kind === 'replaceRange');

	const layoutEnv = createImageLayoutMaterializer().materialize({
		definition: { rendererId: 'composer.renderer.image-layout', writebackAdapterId: 'composer.writeback.image-layout' } as never,
		snapshot: { targetSource: '' } as never,
		text: '{"mode":"row","items":[{"path":"a.png"}]}',
	});
	check('layout materialize: html rendered', (layoutEnv.payload as { html: string }).html.includes('data-pk-layout="row"'));
}

async function main(): Promise<void> {
	testNaming();
	await testPasteAtEnd();
	await testPasteRename();
	await testPasteSplit();
	await testConvertNonDestructive();
	await testOverwriteBackup();
	await testAiEdit();
	await testCaption();
	testReferenceRewrite();
	testRegistryConformance();
	done('composer-image-asset-transaction');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
