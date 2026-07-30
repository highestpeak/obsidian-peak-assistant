import type { App } from 'obsidian';
import { AIGraphArtifactRepository, AIGraphArtifactRuntime } from '@/service/ai-graph';
import { joinAdapterPath } from '@/app/composer/ObsidianComposerDataStore';
import { ObsidianAIGraphArtifactStorage } from './ObsidianAIGraphArtifactStorage';
import { ObsidianAIGraphRunEventStore } from './ObsidianAIGraphRunEventStore';
import { SqliteAIGraphProjection } from './SqliteAIGraphProjection';

export function composeAIGraphArtifactRuntime(
	app: App,
	dataStoreDir: string,
): AIGraphArtifactRuntime {
	const baseDir = joinAdapterPath(dataStoreDir, 'artifacts', 'ai-graphs');
	const runsDir = joinAdapterPath(dataStoreDir, 'records', 'analysis', 'runs');
	return new AIGraphArtifactRuntime(
		new AIGraphArtifactRepository(
			new ObsidianAIGraphArtifactStorage(app, baseDir),
		),
		undefined,
		undefined,
		new SqliteAIGraphProjection(),
		new ObsidianAIGraphRunEventStore(app, runsDir),
	);
}
