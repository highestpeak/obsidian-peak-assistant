import { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
import { DEFAULT_GENERATED_OUTPUTS } from './catalog';

export * from './types';
export * from './AtomicJsonSnapshotStore';
export * from './GeneratedArtifactBodyStore';
export * from './GeneratedOutputDataAdapter';
export * from './GeneratedOutputIntegrity';
export * from './GeneratedOutputMigrationJournal';
export * from './GeneratedOutputPersistenceRuntime';
export * from './GeneratedOutputSyncManifest';
export * from './PartitionedJsonlStore';
export * from './ProjectionRebuildRegistry';
export { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
export { DEFAULT_GENERATED_OUTPUTS } from './catalog';

export function createDefaultGeneratedOutputRegistry(): GeneratedOutputRegistry {
	return new GeneratedOutputRegistry(DEFAULT_GENERATED_OUTPUTS);
}
