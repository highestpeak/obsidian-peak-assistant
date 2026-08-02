import type { GeneratedOutputDescriptor } from '../types';
import { legacyOutput, localOutput, outputPath } from './helpers';

export const LOCAL_LEGACY_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	localOutput({
		documentationId: 'LP-01', id: 'projection.vault', owner: 'search-index', outputClass: 'projection',
		carrier: 'sqlite', path: outputPath('data-store', 'vault.sqlite'),
		writerEvidence: ['src/core/storage/sqlite/SqliteStoreManager.ts'],
	}),
	localOutput({
		documentationId: 'LP-02', id: 'projection.chat', owner: 'chat', outputClass: 'projection',
		carrier: 'sqlite', path: outputPath('data-store', 'chat.sqlite'),
		writerEvidence: ['src/core/storage/sqlite/SqliteStoreManager.ts'],
	}),
	localOutput({
		documentationId: 'LP-03', id: 'index.full-text', owner: 'search-index', outputClass: 'projection',
		carrier: 'sqlite', path: outputPath('data-store', 'vault.sqlite'),
		writerEvidence: ['src/service/search/index/indexService.ts'],
	}),
	localOutput({
		documentationId: 'LP-04', id: 'index.embedding', owner: 'search-index', outputClass: 'projection',
		carrier: 'sqlite', path: outputPath('data-store', 'vault.sqlite'),
		writerEvidence: ['src/service/search/index/indexService.ts'],
	}),
	localOutput({
		documentationId: 'LP-06', id: 'cache.summary-preview', owner: 'storage-projection', outputClass: 'cache',
		carrier: 'json', path: outputPath('data-store', 'cache/summary-preview/{key}.json'),
		writerEvidence: ['src/service/chat/context/ResourceSummaryService.ts'],
	}),
	localOutput({
		documentationId: 'LP-07', id: 'telemetry.composer', owner: 'composer', outputClass: 'telemetry',
		carrier: 'jsonl', path: outputPath('data-store', 'telemetry/composer/composer-intelligence.jsonl'),
		writerEvidence: ['src/app/composer/ObsidianComposerAdapters.ts'], retentionPolicy: 'bounded',
	}),
	localOutput({
		documentationId: 'LP-08', id: 'debug.local-snapshots', owner: 'developer-tools', outputClass: 'telemetry',
		carrier: 'native', path: outputPath('plugin-data', 'debug/{filename}'),
		writerEvidence: ['src/app/context/devtools.ts'], retentionPolicy: 'bounded',
	}),
	localOutput({
		documentationId: 'LP-09', id: 'runtime.native-module', owner: 'sqlite-runtime', outputClass: 'cache',
		carrier: 'binary', path: outputPath('plugin-data', 'native/{platform}/{filename}'),
		writerEvidence: ['src/core/storage/sqlite/NativeModuleManager.ts'],
	}),
	localOutput({
		documentationId: 'LP-10', id: 'backup.sqlite', owner: 'sqlite-runtime', outputClass: 'cache',
		carrier: 'binary', path: outputPath('data-store', '{database}.backup'),
		writerEvidence: ['src/core/storage/sqlite/SqliteStoreManager.ts'], retentionPolicy: 'bounded',
	}),
	legacyOutput({
		documentationId: 'LG-06', id: 'legacy.copilot-auto-review', owner: 'legacy-copilot',
		outputClass: 'durable-record', carrier: 'markdown',
		path: outputPath('vault-root', 'peak-system/auto-review/{recordId}.md'),
		replacementId: 'composer.generation-history',
		writerEvidence: ['src/service/copilot/CopilotReviewHistoryService.ts'],
	}),
	legacyOutput({
		documentationId: 'LG-07', id: 'legacy.vault-review-report', owner: 'legacy-copilot',
		outputClass: 'durable-record', carrier: 'markdown',
		path: outputPath('vault-root', 'peak-system/vault-reviews/{recordId}.md'),
		replacementId: 'composer.generation-history',
		writerEvidence: ['src/app/copilot/vault/ObsidianVaultReviewReportAdapter.ts'],
	}),
	legacyOutput({
		documentationId: 'LG-08', id: 'legacy.run-artifact-catalog', owner: 'run-envelope',
		outputClass: 'durable-record', carrier: 'json',
		path: outputPath('vault-root', '.peak/artifacts/artifact-index.json'),
		replacementId: 'run.artifact-body',
		writerEvidence: ['src/service/run-envelope/VaultArtifactStore.ts'],
	}),
];
