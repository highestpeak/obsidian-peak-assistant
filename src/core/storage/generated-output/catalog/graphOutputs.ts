import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, legacyOutput, localOutput, outputPath, userArtifact } from './helpers';

const HUB_WRITER = ['src/app/hub/ObsidianVaultHubDocAdapter.ts'] as const;

export const GRAPH_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	userArtifact({
		documentationId: 'UA-05', id: 'hub.materialized-note', owner: 'hub', carrier: 'markdown',
		path: outputPath('ai-root', 'Hub-Summaries/{slug}.md'), writerEvidence: HUB_WRITER, lifecycle: 'active',
	}),
	userArtifact({
		documentationId: 'UA-07', id: 'ai-graph.markdown-export', owner: 'ai-graph', carrier: 'markdown',
		path: outputPath('user-selected', '<user-selected>.md'),
		writerEvidence: ['src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts'],
	}),
	durableRecord({
		documentationId: 'DR-08', id: 'hub.manifest', owner: 'hub', carrier: 'json',
		path: outputPath('data-store', 'records/hubs/{hubId}/manifest.json'),
		writerEvidence: [
			'src/service/agents/HubMaterializationAgent.ts',
			'src/service/hub/HubRecordStore.ts',
		],
	}),
	durableRecord({
		documentationId: 'DR-09', id: 'hub.events', owner: 'hub', carrier: 'jsonl',
		path: outputPath('data-store', 'records/hubs/{hubId}/events.jsonl'),
		writerEvidence: [
			'src/service/agents/HubCuratorAgent.ts',
			'src/service/hub/HubRecordStore.ts',
		],
	}),
	durableRecord({
		documentationId: 'DR-10', id: 'ai-graph.artifact', owner: 'ai-graph', carrier: 'json',
		path: outputPath('data-store', 'artifacts/ai-graphs'),
		writerEvidence: ['src/app/ai-graph/ObsidianAIGraphArtifactStorage.ts'], lifecycle: 'active',
	}),
	localOutput({
		documentationId: 'LP-05', id: 'projection.hub-graph', owner: 'hub', outputClass: 'projection',
		carrier: 'sqlite', path: outputPath('data-store', 'vault.sqlite'),
		writerEvidence: ['src/core/storage/sqlite/repositories/HubConstituentRepo.ts'],
	}),
	legacyOutput({
		documentationId: 'LG-04', id: 'legacy.hub-auto-markdown', owner: 'hub',
		outputClass: 'durable-record', carrier: 'markdown',
		path: outputPath('ai-root', 'Hub-Summaries/{slug}.md'), replacementId: 'hub.manifest',
		writerEvidence: HUB_WRITER,
	}),
];
