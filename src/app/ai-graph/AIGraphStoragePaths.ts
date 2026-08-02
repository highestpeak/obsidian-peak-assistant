import type { GeneratedOutputRegistry } from '@/core/storage/generated-output';
import { joinAdapterPath } from '@/app/composer/ObsidianComposerDataStore';

export interface AIGraphStoragePaths {
	readonly artifactDirectory: string;
	readonly runEventsDirectory: string;
}

export function resolveAIGraphStoragePaths(
	dataStoreDir: string,
	registry: GeneratedOutputRegistry,
): AIGraphStoragePaths {
	return {
		artifactDirectory: joinAdapterPath(
			dataStoreDir,
			registry.resolveRelativePath('ai-graph.artifact'),
		),
		runEventsDirectory: joinAdapterPath(
			dataStoreDir,
			registry.resolveRelativePath('run.events', { domain: 'analysis' }),
		),
	};
}
