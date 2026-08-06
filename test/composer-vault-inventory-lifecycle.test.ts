import assert from 'node:assert/strict';
import type { App, EventRef } from 'obsidian';
import { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import { ObsidianComposerVaultInventory } from '@/app/composer/ObsidianComposerAdapters';
import {
	ComposerSourceRevisionService,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerSourcePort,
	type ComposerWritePort,
} from '@/service/composer';

class FakeSource implements ComposerSourcePort, ComposerWritePort {
	async readSource(): Promise<string> {
		return '';
	}

	async writeSource(): Promise<void> {}
}

class FakeEvents implements ComposerFileEventsPort {
	onFileEvent(_callback: (event: ComposerFileEvent) => void): () => void {
		return () => undefined;
	}

	dispose(): void {}
}

function createMetadataCacheHarness(): {
	app: App;
	listenerCount(name: string): number;
	offrefCount(): number;
} {
	type Ref = EventRef & { name: string; callback: () => void };
	const listeners = new Map<string, Set<Ref>>();
	let released = 0;
	const metadataCache = {
		on(name: string, callback: () => void): EventRef {
			const ref = { name, callback } as Ref;
			const bucket = listeners.get(name) ?? new Set<Ref>();
			bucket.add(ref);
			listeners.set(name, bucket);
			return ref;
		},
		offref(ref: EventRef): void {
			const typed = ref as Ref;
			if (!listeners.get(typed.name)?.delete(typed)) return;
			released += 1;
		},
		getFileCache(): null {
			return null;
		},
	};
	return {
		app: {
			metadataCache,
			vault: { getMarkdownFiles: () => [] },
		} as unknown as App,
		listenerCount: (name) => listeners.get(name)?.size ?? 0,
		offrefCount: () => released,
	};
}

function main(): void {
	const harness = createMetadataCacheHarness();
	const inventory = new ObsidianComposerVaultInventory(harness.app);
	const source = new FakeSource();
	const runtime = new DocumentComposerRuntime(
		source as never,
		source as never,
		new FakeEvents() as never,
		new ComposerSourceRevisionService(),
		undefined,
		{ vaultInventory: inventory },
	);

	assert.equal(harness.listenerCount('changed'), 1);
	assert.equal(harness.listenerCount('resolved'), 1);
	assert.equal(harness.listenerCount('deleted'), 1);

	runtime.dispose();
	runtime.dispose();

	assert.equal(harness.listenerCount('changed'), 0);
	assert.equal(harness.listenerCount('resolved'), 0);
	assert.equal(harness.listenerCount('deleted'), 0);
	assert.equal(harness.offrefCount(), 3, 'runtime unload releases each metadata cache listener once');
	console.log('composer-vault-inventory-lifecycle: passed');
}

main();
