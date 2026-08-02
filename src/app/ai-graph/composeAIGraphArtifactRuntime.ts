import type { App } from 'obsidian';
import type { GeneratedOutputRegistry } from '@/core/storage/generated-output';
import { AIGraphArtifactRepository, AIGraphArtifactRuntime } from '@/service/ai-graph';
import { ObsidianAIGraphArtifactStorage } from './ObsidianAIGraphArtifactStorage';
import { ObsidianAIGraphRunEventStore } from './ObsidianAIGraphRunEventStore';
import { SqliteAIGraphProjection } from './SqliteAIGraphProjection';
import { resolveAIGraphStoragePaths } from './AIGraphStoragePaths';

export function composeAIGraphArtifactRuntime(
	app: App,
	dataStoreDir: string,
	generatedOutputs: GeneratedOutputRegistry,
): AIGraphArtifactRuntime {
	const paths = resolveAIGraphStoragePaths(dataStoreDir, generatedOutputs);
	return new AIGraphArtifactRuntime(
		new AIGraphArtifactRepository(
			new ObsidianAIGraphArtifactStorage(app, paths.artifactDirectory),
		),
		undefined,
		undefined,
		new SqliteAIGraphProjection(),
		new ObsidianAIGraphRunEventStore(app, paths.runEventsDirectory),
	);
}
