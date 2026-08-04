import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, legacyOutput, outputPath, userArtifact } from './helpers';

export const ANALYSIS_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	userArtifact({
		documentationId: 'UA-06', id: 'analysis.markdown-export', owner: 'ai-analysis', carrier: 'markdown',
		path: outputPath('user-selected', '<user-selected>.md'),
		writerEvidence: [
			'src/app/search/AppAnalysisDocVaultWriterAdapter.ts',
			'src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts',
		],
		userSurface: { visibility: 'my-content', kind: 'ai-result', source: 'ai-search', label: 'Saved AI Search result' },
	}),
	durableRecord({
		documentationId: 'DR-03', id: 'resource.summary-snapshot', owner: 'chat-context', carrier: 'json',
		path: outputPath('data-store', 'records/resources/{resourceKey}.json'),
		writerEvidence: ['src/service/chat/context/ResourceSummaryService.ts'],
	}),
	durableRecord({
		documentationId: 'DR-04', id: 'analysis.snapshot', owner: 'ai-analysis', carrier: 'json',
		path: outputPath('data-store', 'ai-analysis/{runId}.json'),
		writerEvidence: [
			'src/core/storage/vault/search-docs/AiAnalysisJsonStore.ts',
			'src/service/search/analysisDocPersistence.ts',
		],
		lifecycle: 'active',
	}),
	legacyOutput({
		documentationId: 'LG-03', id: 'legacy.resource-summary-markdown', owner: 'chat-context',
		outputClass: 'durable-record', carrier: 'markdown',
		path: outputPath('ai-root', 'resources-summary-cache/Resource-{resourceId}.md'),
		replacementId: 'resource.summary-snapshot',
		writerEvidence: ['src/service/chat/context/ResourceSummaryService.ts'],
	}),
	legacyOutput({
		documentationId: 'LG-05', id: 'legacy.analysis-markdown', owner: 'ai-analysis',
		outputClass: 'durable-record', carrier: 'markdown',
		path: outputPath('ai-root', 'AI-Analysis/{analysisId}.md'), replacementId: 'analysis.snapshot',
		writerEvidence: ['src/app/search/AppAnalysisDocVaultWriterAdapter.ts'],
	}),
];
