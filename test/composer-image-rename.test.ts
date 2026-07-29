import { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import {
	ComposerDocumentSession,
	ComposerSourceRevisionService,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerImageAttachmentPort,
	type ComposerImageEditPort,
	type ComposerImageReferencePort,
} from '@/service/composer';
import { FakeVault, makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

class FakeEvents implements ComposerFileEventsPort {
	getActiveFilePath(): string | null { return null; }
	onActiveFileChange(): () => void { return () => undefined; }
	onFileEvent(_cb: (event: ComposerFileEvent) => void): () => void { return () => undefined; }
	dispose(): void {}
}

class FakeAttachment implements ComposerImageAttachmentPort {
	attachmentFolder(): string { return 'Attachments'; }
	async save(): Promise<{ path: string }> { return { path: 'Attachments/new.png' }; }
	async overwrite(): Promise<void> {}
	previewUri(path: string): string { return `preview://${path}`; }
}

class FakeReference implements ComposerImageReferencePort {
	readonly renames: Array<[string, string]> = [];
	async findReferences() { return []; }
	async rename(oldPath: string, newPath: string): Promise<void> {
		this.renames.push([oldPath, newPath]);
	}
	async backup(path: string) { return { backupPath: `${path}.bak` }; }
}

class FakeEdit implements ComposerImageEditPort {
	async edit() { return { paths: ['Attachments/generated.png'], mimeType: 'image/png' }; }
}

async function main(): Promise<void> {
	const path = 'note.md';
	const source = '# Images\n\n![[Attachments/old-name.png]]\n';
	const vault = new FakeVault();
	vault.set(path, source);
	const reference = new FakeReference();
	const runtime = new DocumentComposerRuntime(
		vault as never,
		vault as never,
		new FakeEvents() as never,
		new ComposerSourceRevisionService(),
		undefined,
		{
			imagePorts: {
				attachment: new FakeAttachment(),
				reference,
				edit: new FakeEdit(),
			},
		},
	);
	const session = ComposerDocumentSession.fromSource(path, source);
	const editing = runtime.composeEditing(session);
	const block = session.snapshot.blocks.find((candidate) => candidate.kind === 'image');
	if (!block || !editing.imageCoordinator) throw new Error('image block/coordinator unavailable');

	const candidateId = editing.imageCoordinator.beginRename({
		sourcePath: 'Attachments/old-name.png',
		blockId: block.blockId,
		desiredBaseName: 'new semantic name',
	});
	const candidate = editing.hub?.projection().candidates.find((item) => item.candidateId === candidateId);
	check('rename creates an image candidate', Boolean(candidate));
	check(
		'rename candidate preview stays on the existing asset before accept',
		String(candidate?.proposedChange.result && (candidate.proposedChange.result as { payload?: { previewUri?: string } }).payload?.previewUri)
			.includes('old-name.png'),
	);

	await editing.imageCoordinator.accept(candidateId);
	check('accepted rename rewrites the current document through the hub', vault.read(path).includes('Attachments/new-semantic-name.png'));
	check(
		'accepted rename asks the host to rename the physical asset',
		reference.renames[0]?.[0] === 'Attachments/old-name.png' &&
			reference.renames[0]?.[1] === 'Attachments/new-semantic-name.png',
	);
	check('rename candidate clears after accept', editing.hub?.projection().candidates.length === 0);
	done('composer-image-rename');
}

void main();
