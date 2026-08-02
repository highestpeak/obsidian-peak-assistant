import type { App } from 'obsidian';
import {
	AtomicJsonSnapshotStore,
	GeneratedArtifactBodyStore,
	GeneratedOutputMigrationJournal,
	PartitionedJsonlStore,
	ProjectionRebuildRegistry,
	buildGeneratedOutputSyncManifest,
	type GeneratedOutputPathRoots,
	type GeneratedOutputPersistenceRuntime,
	type GeneratedOutputRegistry,
} from '@/core/storage/generated-output';
import { ObsidianGeneratedOutputDataAdapter } from './ObsidianGeneratedOutputDataAdapter';

export function composeGeneratedOutputPersistenceRuntime(
	app: App,
	outputs: GeneratedOutputRegistry,
	roots: GeneratedOutputPathRoots,
): GeneratedOutputPersistenceRuntime {
	const adapter = new ObsidianGeneratedOutputDataAdapter(app);
	const events = new PartitionedJsonlStore(adapter, outputs, roots);
	return Object.freeze({
		snapshots: new AtomicJsonSnapshotStore(adapter, outputs, roots),
		events,
		artifactBodies: new GeneratedArtifactBodyStore(adapter, outputs, roots),
		migrations: new GeneratedOutputMigrationJournal(events),
		projections: new ProjectionRebuildRegistry(outputs),
		syncManifest: buildGeneratedOutputSyncManifest(outputs),
	});
}
