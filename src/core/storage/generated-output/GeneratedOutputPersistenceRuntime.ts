import type { AtomicJsonSnapshotStore } from './AtomicJsonSnapshotStore';
import type { GeneratedArtifactBodyStore } from './GeneratedArtifactBodyStore';
import type { GeneratedOutputMigrationJournal } from './GeneratedOutputMigrationJournal';
import type { GeneratedOutputSyncManifest } from './GeneratedOutputSyncManifest';
import type { PartitionedJsonlStore } from './PartitionedJsonlStore';
import type { ProjectionRebuildRegistry } from './ProjectionRebuildRegistry';
import type { GeneratedOutputPathVariables } from './types';

export interface GeneratedOutputPersistenceRuntime {
	readonly snapshots: AtomicJsonSnapshotStore;
	readonly events: PartitionedJsonlStore;
	readonly artifactBodies: GeneratedArtifactBodyStore;
	readonly migrations: GeneratedOutputMigrationJournal;
	readonly projections: ProjectionRebuildRegistry;
	readonly syncManifest: GeneratedOutputSyncManifest;
	resolvePath(outputId: string, variables?: GeneratedOutputPathVariables): string;
}
