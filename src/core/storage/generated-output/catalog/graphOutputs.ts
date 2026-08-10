import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, legacyOutput, localOutput, outputPath, userArtifact } from './helpers';

const HUB_WRITER = ['src/app/hub/ObsidianVaultHubDocAdapter.ts'] as const;

export const GRAPH_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	userArtifact({
		documentationId: 'UA-05', id: 'hub.materialized-note', owner: 'hub', carrier: 'markdown',
		path: outputPath('ai-root', 'Hub-Summaries/{slug}.md'), writerEvidence: HUB_WRITER, lifecycle: 'active',
		userSurface: { visibility: 'my-content', kind: 'hub', source: 'hub', label: 'Materialized Hub' },
	}),
	userArtifact({
		documentationId: 'UA-07', id: 'ai-graph.markdown-export', owner: 'ai-graph', carrier: 'markdown',
		path: outputPath('user-selected', '<user-selected>.md'),
		writerEvidence: ['src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts'],
		userSurface: { visibility: 'my-content', kind: 'ai-graph', source: 'ai-graph', label: 'AI Graph export' },
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
	durableRecord({
		documentationId: 'DR-21', id: 'graph.community-explanation', owner: 'result-graph', carrier: 'json',
		path: outputPath('data-store', 'records/graph-communities/{communityId}/explanation.json'),
		writerEvidence: ['src/service/search/community/CommunityExplanationService.ts'], lifecycle: 'active',
	}),
	durableRecord({
		documentationId: 'DR-22', id: 'graph.community-explanation-events', owner: 'result-graph', carrier: 'jsonl',
		path: outputPath('data-store', 'records/graph-communities/{communityId}/events.jsonl'),
		writerEvidence: ['src/service/search/community/CommunityExplanationService.ts'], lifecycle: 'active',
	}),
	localOutput({
		documentationId: 'LP-05', id: 'projection.hub-graph', owner: 'hub', outputClass: 'projection',
		carrier: 'sqlite', path: outputPath('data-store', 'vault.sqlite'),
		writerEvidence: ['src/core/storage/sqlite/repositories/HubConstituentRepo.ts'],
	}),
	localOutput({
		documentationId: 'LP-11', id: 'projection.graph-community', owner: 'result-graph', outputClass: 'projection',
		carrier: 'sqlite', path: outputPath('data-store', 'vault.sqlite'),
		writerEvidence: [
			'src/core/storage/sqlite/repositories/StructuralAnalysisRepo.ts',
			'src/service/search/index/helper/structural/orchestrator.ts',
		],
	}),
	legacyOutput({
		documentationId: 'LG-04', id: 'legacy.hub-auto-markdown', owner: 'hub',
		outputClass: 'durable-record', carrier: 'markdown',
		path: outputPath('ai-root', 'Hub-Summaries/{slug}.md'), replacementId: 'hub.manifest',
		writerEvidence: HUB_WRITER,
	}),
];
