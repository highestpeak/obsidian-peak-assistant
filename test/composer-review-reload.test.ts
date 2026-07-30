import { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import {
	ComposerSourceRevisionService,
	type ComposerCapabilityDocumentRuntime,
	type ComposerDocumentSession,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerSourcePort,
	type ComposerTransactionHub,
	type ComposerWorkspaceStateEvent,
	type ComposerWorkspaceStatePersistencePort,
	type ComposerWritePort,
} from '@/service/composer';
import type {
	ComposerCandidate,
	ComposerCandidateRuntimeSnapshot,
	ComposerCapabilityRunEvent,
} from '@/core/composer';

let failures = 0;
let count = 0;
function check(name: string, condition: boolean): void {
	count += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}`);
}

class MemoryPersistence implements ComposerWorkspaceStatePersistencePort {
	readonly events: ComposerWorkspaceStateEvent[] = [];
	async load(): Promise<readonly ComposerWorkspaceStateEvent[]> {
		return this.events;
	}
	async append(event: ComposerWorkspaceStateEvent): Promise<void> {
		this.events.push(event);
	}
}

class FakeFiles implements ComposerSourcePort, ComposerWritePort {
	readonly files = new Map([['Review.md', '# Review\n\nOriginal text.\n']]);
	async readSource(path: string): Promise<string> {
		const source = this.files.get(path);
		if (source === undefined) throw new Error(`missing ${path}`);
		return source;
	}
	async writeSource(path: string, next: string): Promise<void> {
		this.files.set(path, next);
	}
}

class FakeEvents implements ComposerFileEventsPort {
	onFileEvent(_cb: (event: ComposerFileEvent) => void): () => void {
		return () => undefined;
	}
	dispose(): void {}
}

class FakeCandidateRuntime {
	private readonly runSubscribers = new Set<(event: ComposerCapabilityRunEvent) => void>();
	private readonly owned = new Set<string>();
	readonly restored: string[] = [];

	subscribe(cb: (candidates: readonly ComposerCandidate[]) => void): () => void {
		cb([]);
		return () => undefined;
	}

	onRunEvent(cb: (event: ComposerCapabilityRunEvent) => void): () => void {
		this.runSubscribers.add(cb);
		return () => this.runSubscribers.delete(cb);
	}

	own(candidateId: string): void {
		this.owned.add(candidateId);
	}

	emit(event: ComposerCapabilityRunEvent): void {
		for (const cb of this.runSubscribers) cb(event);
	}

	rendererIdFor(candidateId: string): 'composer.renderer.streaming-text' | null {
		return this.owned.has(candidateId) ? 'composer.renderer.streaming-text' : null;
	}

	candidateLabelFor(candidateId: string): string | null {
		return this.owned.has(candidateId) ? '润色改写' : null;
	}

	exportCandidateRuntimeState(
		candidateId: string,
	): ComposerCandidateRuntimeSnapshot | null {
		if (!this.owned.has(candidateId)) return null;
		return {
			ownerId: 'capability',
			rendererId: 'composer.renderer.streaming-text',
			label: '润色改写',
			payload: {
				capabilityId: 'composer.prose.polish',
				snapshot: { baseRevision: 'rev' },
			},
		};
	}

	restoreCandidateRuntimeState(
		candidate: ComposerCandidate,
		snapshot: ComposerCandidateRuntimeSnapshot,
	): boolean {
		if (snapshot.ownerId !== 'capability') return false;
		this.owned.add(candidate.candidateId);
		this.restored.push(candidate.candidateId);
		return true;
	}

	regenerate(): never {
		throw new Error('not used');
	}
	cancel(): void {}
	isStreaming(): boolean {
		return false;
	}
	async accept(): Promise<void> {}
	discard(): void {}
	setActiveVariant(): void {}
}

function makeRuntime(
	files: FakeFiles,
	persistence: MemoryPersistence,
	fakes: FakeCandidateRuntime[],
): DocumentComposerRuntime {
	const runtime = new DocumentComposerRuntime(
		files as never,
		files as never,
		new FakeEvents() as never,
		new ComposerSourceRevisionService(),
		undefined,
		{ workspaceStatePersistence: persistence },
	);
	runtime.setCapabilityRuntimeFactory({
		forDocument: (
			_session: ComposerDocumentSession,
			_hub: ComposerTransactionHub,
		): ComposerCapabilityDocumentRuntime => {
			const fake = new FakeCandidateRuntime();
			fakes.push(fake);
			return fake as unknown as ComposerCapabilityDocumentRuntime;
		},
	});
	return runtime;
}

async function main(): Promise<void> {
	const files = new FakeFiles();
	const persistence = new MemoryPersistence();
	const firstFakes: FakeCandidateRuntime[] = [];
	const firstRuntime = makeRuntime(files, persistence, firstFakes);
	const firstController = firstRuntime.createController();
	firstController.start('Review.md');
	await firstController.settled();
	const editing = firstController.getRuntime()!;
	const candidate = editing.hub.createCandidate({
		target: { kind: 'document' },
		streaming: false,
		proposedChange: {
			operations: [],
			summary: 'Review copy',
		},
	});
	const firstFake = firstFakes[0];
	firstFake.own(candidate.candidateId);
	firstFake.emit({
		type: 'run-started',
		runId: 'run-review-reload',
		capabilityId: 'composer.prose.polish',
		candidateId: candidate.candidateId,
		variantId: candidate.activeVariantId,
	});
	await Promise.resolve();
	check(
		'first runtime persists a serializable review payload',
		firstRuntime.workspaceIntelligence.projection().runs[0]?.review?.candidate.candidateId
			=== candidate.candidateId,
	);
	firstController.stop();
	firstRuntime.dispose();

	const secondFakes: FakeCandidateRuntime[] = [];
	const secondRuntime = makeRuntime(files, persistence, secondFakes);
	const secondController = secondRuntime.createController();
	secondController.start('Review.md');
	await secondController.settled();
	await secondRuntime.workspaceIntelligence.hydrate();
	await Promise.resolve();
	await Promise.resolve();
	const restored = secondController.getRuntime()?.hub.projection().candidates[0];
	check('plugin reload restores the review candidate into the document hub', restored?.candidateId === candidate.candidateId);
	check(
		'plugin reload rebinds the candidate to its capability runtime',
		secondFakes[0]?.restored.includes(candidate.candidateId) === true,
	);
	check(
		'restored card keeps its renderer routing metadata',
		secondController.getRuntime()?.candidateRuntime?.rendererIdFor(candidate.candidateId)
			=== 'composer.renderer.streaming-text',
	);

	secondController.stop();
	secondRuntime.dispose();
	console.log(`composer-review-reload: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

void main();
