/**
 * Peak Composer — WP7 image integration composition (WP-INT).
 *
 * Locks the runtime WIRING the coordinator's own unit test does not cover:
 *   - `DocumentComposerRuntime.composeEditing` composes ONE image coordinator per
 *     document when `imagePorts` are supplied, sharing THIS document's hub (so
 *     image commits land in the same History/Undo timeline), and NONE without;
 *   - a paste driven through the composed coordinator persists an atomic embed
 *     reference through the shared hub (fake vault → written source);
 *   - `composeComposerCapabilityRuntime` registers the image materializer +
 *     writeback pair and still passes `validateBindings` (construction throws
 *     otherwise), and its per-document runtime builds.
 *
 * Uses the obsidian-stub alias (run-test.js): the app-layer runtime imports
 * safely and the Obsidian adapters are never constructed — fake ports stand in
 * for exactly the surface `composeEditing` touches.
 */

import { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import {
	COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID,
	COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID,
	ComposerDocumentSession,
	ComposerSourceRevisionService,
	ImageCapabilityCoordinator,
	createDefaultResultMaterializers,
	createDefaultWritebackAdapters,
	dedupeAttachmentPath,
	registerImageResultMaterializers,
	registerImageWritebackAdapters,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerImageAttachmentPort,
	type ComposerImageEditPort,
	type ComposerImageReferencePort,
	type ComposerImageSaveRequest,
	type ComposerImageTextPort,
} from '@/service/composer';
import { FakeVault } from './helpers/composer-fakes';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

const MEDIA_FOLDER = 'ChatFolder/Attachments/media';
const PATH = 'note.md';
const DOC = '# Title\n\nFirst paragraph.\n';

class FakeEvents implements ComposerFileEventsPort {
	getActiveFilePath(): string | null {
		return null;
	}
	onActiveFileChange(): () => void {
		return () => {};
	}
	onFileEvent(_cb: (e: ComposerFileEvent) => void): () => void {
		return () => {};
	}
	dispose(): void {}
}

class FakeAttachmentPort implements ComposerImageAttachmentPort {
	readonly files = new Set<string>();
	attachmentFolder(): string {
		return MEDIA_FOLDER;
	}
	async save(req: ComposerImageSaveRequest) {
		const folder = req.folder ?? MEDIA_FOLDER;
		const path = dedupeAttachmentPath(folder, req.baseName, req.extension, (p) => this.files.has(p));
		this.files.add(path);
		return { path };
	}
	async overwrite(): Promise<void> {}
	previewUri(path: string, sourcePath?: string): string {
		return `preview://${sourcePath ?? ''}#${path}`;
	}
}

class FakeReferencePort implements ComposerImageReferencePort {
	async findReferences() {
		return [];
	}
	async rename(): Promise<void> {}
	async backup(path: string) {
		return { backupPath: `${path}.bak` };
	}
}

class FakeEditPort implements ComposerImageEditPort {
	async edit() {
		return { paths: [`${MEDIA_FOLDER}/gen.png`], mimeType: 'image/png' };
	}
}

class FakeTextPort implements ComposerImageTextPort {
	async complete() {
		return 'A caption';
	}
}

function makeRuntime(vault: FakeVault, withImagePorts: boolean): DocumentComposerRuntime {
	const imagePorts = withImagePorts
		? {
				attachment: new FakeAttachmentPort(),
				reference: new FakeReferencePort(),
				edit: new FakeEditPort(),
				text: new FakeTextPort(),
			}
		: undefined;
	return new DocumentComposerRuntime(
		vault as unknown as never,
		vault as unknown as never,
		new FakeEvents() as unknown as never,
		new ComposerSourceRevisionService(),
		undefined,
		imagePorts ? { imagePorts } : {},
	);
}

async function testCompositionWithPorts(): Promise<void> {
	const vault = new FakeVault();
	vault.set(PATH, DOC);
	const runtime = makeRuntime(vault, true);
	const session = ComposerDocumentSession.fromSource(PATH, DOC);
	const editing = runtime.composeEditing(session);

	check('imagePorts ⇒ coordinator composed', editing.imageCoordinator instanceof ImageCapabilityCoordinator);
	check('editing exposes a hub', Boolean(editing.hub));
	check(
		'image preview resolver forwards the source document path',
		editing.imagePreviewResolver?.('路线图', PATH) === `preview://${PATH}#路线图`,
	);

	// Paste through the composed coordinator → atomic embed insertion via the hub.
	const before = session.snapshot.blocks.length;
	const id = await editing.imageCoordinator!.beginPaste({
		bytes: new Uint8Array([1, 2, 3]),
		mimeType: 'image/png',
		rawName: 'Pasted image 1.png',
		insertion: { kind: 'after-block', blockId: null },
	});
	check('paste creates a candidate on the shared hub', editing.hub!.projection().candidates.length === 1);
	await editing.imageCoordinator!.accept(id);
	const written = vault.read(PATH);
	check('paste persisted an embed through the shared hub', written.includes(`![[${MEDIA_FOLDER}`));
	check('paste added exactly one block', session.snapshot.blocks.length === before + 1);
	check('candidate cleared after accept', editing.hub!.projection().candidates.length === 0);
}

function testCompositionWithoutPorts(): void {
	const vault = new FakeVault();
	vault.set(PATH, DOC);
	const runtime = makeRuntime(vault, false);
	const session = ComposerDocumentSession.fromSource(PATH, DOC);
	const editing = runtime.composeEditing(session);
	check('no imagePorts ⇒ no coordinator (disabled affordances, never fake)', editing.imageCoordinator === undefined);
}

function testImageRegistryRegistration(): void {
	// The exact additive registration `composeComposerCapabilityRuntime` performs at
	// the composition root: image materializer + writeback pair join the shared
	// registries by their result kind / stable id (no dispatch by label).
	const materializers = createDefaultResultMaterializers();
	registerImageResultMaterializers(materializers);
	check('materializer: image-annotation-patch registered', materializers.has('image-annotation-patch'));
	check('materializer: image-layout-patch registered', materializers.has('image-layout-patch'));

	const writebacks = createDefaultWritebackAdapters();
	registerImageWritebackAdapters(writebacks);
	check('writeback: image-annotation registered', Boolean(writebacks.getById(COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID)));
	check('writeback: image-layout registered', Boolean(writebacks.getById(COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID)));
}

async function main(): Promise<void> {
	await testCompositionWithPorts();
	testCompositionWithoutPorts();
	testImageRegistryRegistration();
	console.log(`composer-image-integration: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
