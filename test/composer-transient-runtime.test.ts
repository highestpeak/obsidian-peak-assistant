import assert from 'node:assert/strict';
import { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import {
	ComposerSourceRevisionService,
	type ComposerCommentPersistencePort,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerHistoryPersistencePort,
	type ComposerSourcePort,
	type ComposerWritePort,
} from '@/service/composer';
import type { DocumentComposerRuntimeAdapters } from '@/app/composer/DocumentComposerRuntime';

const PATH = 'Atlas.md';
const SOURCE = '# Atlas\n\nTransient preview.\n';

class FakeSource implements ComposerSourcePort, ComposerWritePort {
	readonly files = new Map<string, string>([[PATH, SOURCE]]);

	async readSource(path: string): Promise<string> {
		const source = this.files.get(path);
		if (source === undefined) throw new Error(`missing: ${path}`);
		return source;
	}

	async writeSource(path: string, source: string): Promise<void> {
		this.files.set(path, source);
	}
}

class DeferredSource extends FakeSource {
	private resolveRead: ((source: string) => void) | null = null;

	readSource(): Promise<string> {
		return new Promise((resolve) => {
			this.resolveRead = resolve;
		});
	}

	finishRead(): void {
		this.resolveRead?.(SOURCE);
		this.resolveRead = null;
	}
}

class FakeEvents implements ComposerFileEventsPort {
	private readonly callbacks = new Set<(event: ComposerFileEvent) => void>();

	onFileEvent(callback: (event: ComposerFileEvent) => void): () => void {
		this.callbacks.add(callback);
		return () => this.callbacks.delete(callback);
	}

	dispose(): void {
		this.callbacks.clear();
	}

	count(): number {
		return this.callbacks.size;
	}
}

function createRuntime(
	source: FakeSource,
	events: FakeEvents,
	adapters: DocumentComposerRuntimeAdapters = {},
): DocumentComposerRuntime {
	return new DocumentComposerRuntime(
		source as unknown as never,
		source as unknown as never,
		events as unknown as never,
		new ComposerSourceRevisionService(),
		undefined,
		adapters,
	);
}

async function main(): Promise<void> {
	const source = new FakeSource();
	const events = new FakeEvents();
	const runtime = createRuntime(source, events);

	const firstPreview = runtime.createTransientController('atlas-preview-1', 'markdown');
	firstPreview.start(PATH);
	await firstPreview.settled();
	const firstHub = firstPreview.getRuntime()?.hub;
	assert.ok(firstHub, 'a transient preview still receives the full projection runtime');
	firstPreview.stop();
	assert.equal(events.count(), 0, 'stopping a transient preview releases its file listener');

	const secondPreview = runtime.createTransientController('atlas-preview-2', 'markdown');
	secondPreview.start(PATH);
	await secondPreview.settled();
	assert.notEqual(
		secondPreview.getRuntime()?.hub,
		firstHub,
		'a closed transient preview must not populate the workspace-lifetime document cache',
	);
	secondPreview.stop();

	const shared = runtime.createController('composer-leaf');
	shared.start(PATH);
	await shared.settled();
	const sharedHub = shared.getRuntime()?.hub;
	const previewOfOpenDocument = runtime.createTransientController('atlas-open-doc', 'markdown');
	previewOfOpenDocument.start(PATH);
	await previewOfOpenDocument.settled();
	assert.equal(
		previewOfOpenDocument.getRuntime()?.hub,
		sharedHub,
		'a preview may reuse an actively referenced Composer runtime instead of duplicating it',
	);
	previewOfOpenDocument.stop();
	shared.stop();

	let commentLoads = 0;
	let copilotHistoryLoads = 0;
	const persistenceRuntime = createRuntime(source, events, {
		commentPersistence: {
			load: async () => {
				commentLoads += 1;
				return [];
			},
		} as unknown as ComposerCommentPersistencePort,
		historyPersistence: {
			loadCopilotSession: async () => {
				copilotHistoryLoads += 1;
				return null;
			},
		} as unknown as ComposerHistoryPersistencePort,
	});
	const capabilityPreview = persistenceRuntime.createTransientController(
		'atlas-capabilities',
		'markdown',
		{ capabilities: true },
	);
	capabilityPreview.start(PATH);
	await capabilityPreview.settled();
	capabilityPreview.stop();
	const intelligencePreview = persistenceRuntime.createTransientController(
		'atlas-intelligence',
		'markdown',
		{ intelligence: true },
	);
	intelligencePreview.start(PATH);
	await intelligencePreview.settled();
	intelligencePreview.stop();
	await Promise.resolve();
	assert.equal(commentLoads, 0, 'transient projections do not hydrate persisted comments');
	assert.equal(copilotHistoryLoads, 0, 'transient projections do not hydrate Copilot history');
	persistenceRuntime.dispose();

	const deferredSource = new DeferredSource();
	const deferredEvents = new FakeEvents();
	const deferredRuntime = createRuntime(deferredSource, deferredEvents);
	const stoppedWhileLoading = deferredRuntime.createTransientController('atlas-aborted', 'markdown');
	stoppedWhileLoading.start(PATH);
	stoppedWhileLoading.stop();
	deferredSource.finishRead();
	await stoppedWhileLoading.settled();
	assert.equal(
		stoppedWhileLoading.getRuntime(),
		undefined,
		'a source read that settles after stop must not resurrect an editing runtime',
	);
	assert.equal(deferredEvents.count(), 0, 'an aborted preview leaves no event subscription');

	runtime.dispose();
	deferredRuntime.dispose();
	console.log('composer-transient-runtime: passed');
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
