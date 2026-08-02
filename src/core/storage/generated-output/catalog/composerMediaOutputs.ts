import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, outputPath, userArtifact } from './helpers';

const COMPOSER_HISTORY = ['src/app/composer/ObsidianComposerHistoryPersistence.ts'] as const;

export const COMPOSER_MEDIA_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	userArtifact({
		documentationId: 'UA-13', id: 'media.generated-attachment', owner: 'media', carrier: 'binary',
		path: outputPath('ai-root', 'Attachments/media/{filename}'),
		writerEvidence: ['src/app/platform/media/ObsidianMediaAttachmentWriter.ts'], peakIndexPolicy: 'exclude',
	}),
	userArtifact({
		documentationId: 'UA-14', id: 'document.accepted-writeback', owner: 'copilot-composer', carrier: 'markdown',
		path: outputPath('user-selected', '<user-selected-document>'),
		writerEvidence: [
			'src/app/chat/AppChatVaultWriterAdapter.ts',
			'src/app/copilot/panels/AppCopilotPanelVaultAdapter.ts',
		],
	}),
	userArtifact({
		documentationId: 'UA-15', id: 'artifact.native-file', owner: 'composer-file-workspace', carrier: 'native',
		path: outputPath('user-selected', '<user-selected-native-file>'),
		writerEvidence: [
			'src/app/commands/PeakCommandActions.ts',
			'src/app/composer/ObsidianComposerImageAdapters.ts',
		],
		peakIndexPolicy: 'exclude',
	}),
	durableRecord({
		documentationId: 'DR-07', id: 'media.job-events', owner: 'media', carrier: 'jsonl',
		path: outputPath('data-store', 'records/media/jobs/{jobId}.jsonl'),
		writerEvidence: ['src/service/media/MediaJobRunner.ts'],
	}),
	durableRecord({
		documentationId: 'DR-11', id: 'run.artifact-body', owner: 'run-envelope', carrier: 'native',
		path: outputPath('data-store', 'artifacts/runs/{runId}'),
		writerEvidence: ['src/service/run-envelope/VaultArtifactStore.ts'],
	}),
	durableRecord({
		documentationId: 'DR-12', id: 'composer.comments', owner: 'composer', carrier: 'json',
		path: outputPath('data-store', 'composer/comments/{documentId}.json'),
		writerEvidence: ['src/app/composer/ObsidianComposerAdapters.ts'], lifecycle: 'active',
	}),
	durableRecord({
		documentationId: 'DR-13', id: 'composer.workspace-events', owner: 'composer', carrier: 'jsonl',
		path: outputPath('data-store', 'records/composer/workspaces/current.jsonl'),
		writerEvidence: ['src/app/composer/ObsidianComposerWorkspaceStatePersistence.ts'], lifecycle: 'active',
	}),
	durableRecord({
		documentationId: 'DR-14', id: 'composer.document-history', owner: 'composer', carrier: 'jsonl',
		path: outputPath('data-store', 'records/document-history/{recordId}.jsonl'),
		writerEvidence: COMPOSER_HISTORY, lifecycle: 'active',
	}),
	durableRecord({
		documentationId: 'DR-15', id: 'composer.generation-history', owner: 'composer-copilot', carrier: 'jsonl',
		path: outputPath('data-store', 'records/copilot/sessions/{recordId}.jsonl'),
		writerEvidence: COMPOSER_HISTORY, lifecycle: 'active',
	}),
];
