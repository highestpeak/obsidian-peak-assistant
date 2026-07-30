import { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import {
	ComposerSourceRevisionService,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerSourcePort,
	type ComposerWritePort,
} from '@/service/composer';

let failures = 0;
let count = 0;
function check(name: string, condition: boolean, detail = ''): void {
	count += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ` — ${detail}` : ''}`);
}

class FakeFiles implements ComposerSourcePort, ComposerWritePort {
	readonly files = new Map<string, string>([
		['A.md', '# A\n\nAlpha.\n'],
		['B.md', '# B\n\nBeta.\n'],
	]);
	async readSource(path: string): Promise<string> {
		const text = this.files.get(path);
		if (text === undefined) throw new Error(`missing ${path}`);
		return text;
	}
	async writeSource(path: string, next: string): Promise<void> {
		this.files.set(path, next);
	}
}

class FakeEvents implements ComposerFileEventsPort {
	private readonly subscribers = new Set<(event: ComposerFileEvent) => void>();
	onFileEvent(cb: (event: ComposerFileEvent) => void): () => void {
		this.subscribers.add(cb);
		return () => this.subscribers.delete(cb);
	}
	emit(event: ComposerFileEvent): void {
		for (const subscriber of this.subscribers) subscriber(event);
	}
	dispose(): void {
		this.subscribers.clear();
	}
}

async function main(): Promise<void> {
	const files = new FakeFiles();
	const events = new FakeEvents();
	const runtime = new DocumentComposerRuntime(
		files as never,
		files as never,
		events as never,
		new ComposerSourceRevisionService(),
	);

	const leafA1 = runtime.createController('leaf-a-1');
	const leafB = runtime.createController('leaf-b');
	const leafA2 = runtime.createController('leaf-a-2');
	leafA1.start('A.md');
	leafB.start('B.md');
	leafA2.start('A.md');
	await Promise.all([leafA1.settled(), leafB.settled(), leafA2.settled()]);

	check('first leaf remains bound to A', leafA1.getState().filePath === 'A.md');
	check('second leaf remains bound to B', leafB.getState().filePath === 'B.md');
	check('same-file leaves share app-owned hub', leafA1.getRuntime()?.hub === leafA2.getRuntime()?.hub);
	check('different-file leaves isolate document hub', leafA1.getRuntime()?.hub !== leafB.getRuntime()?.hub);

	const sharedHub = leafA1.getRuntime()?.hub;
	leafA1.stop();
	check('closing one leaf does not dispose shared document runtime', leafA2.getRuntime()?.hub === sharedHub);

	leafA2.stop();
	files.files.set('A.md', '# A\n\nExternally changed while every host was closed.\n');
	const reopenedA = runtime.createController('leaf-a-3');
	reopenedA.start('A.md');
	await reopenedA.settled();
	check('reopening document reuses pending-review lifetime', reopenedA.getRuntime()?.hub === sharedHub);
	check(
		'reopening reconciles the cached hub to the current file revision',
		reopenedA.getRuntime()?.hub.currentRevision === reopenedA.getState().snapshot?.revision,
	);
	check(
		'reopened controller adopts the canonical shared document session',
		reopenedA.getRuntime()?.session.snapshot.sourceText.includes('Externally changed') === true,
	);

	reopenedA.stop();
	const deleted = runtime.createController('leaf-a-delete');
	deleted.start('A.md');
	await deleted.settled();
	events.emit({ type: 'delete', path: 'A.md' });
	check('deleting the backing file leaves the bound leaf in missing state', deleted.getState().status === 'missing');
	check(
		'deleting the file preserves the read-only review and History runtime',
		deleted.getRuntime()?.hub === sharedHub,
	);
	deleted.stop();
	leafB.stop();
	runtime.dispose();

	console.log(`composer-multi-leaf: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

void main();
