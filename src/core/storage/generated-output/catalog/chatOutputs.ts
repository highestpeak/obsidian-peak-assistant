import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, legacyOutput, outputPath, userArtifact } from './helpers';

const CHAT_STORE = ['src/core/storage/vault/ChatStore.ts'] as const;
const ARTIFACT_WRITER = ['src/app/chat/AppArtifactVaultWriterAdapter.ts'] as const;

export const CHAT_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	userArtifact({
		documentationId: 'UA-04', id: 'project.brief', owner: 'chat-project', carrier: 'markdown',
		path: outputPath('ai-root', 'Projects/{projectId}/Brief.md'), writerEvidence: CHAT_STORE, lifecycle: 'active',
	}),
	userArtifact({
		documentationId: 'UA-08', id: 'artifact.dataview', owner: 'chat-artifact', carrier: 'markdown',
		path: outputPath('ai-root', 'Artifacts/Dataview/{slug}.md'), writerEvidence: ARTIFACT_WRITER,
	}),
	userArtifact({
		documentationId: 'UA-09', id: 'artifact.excalidraw', owner: 'chat-artifact', carrier: 'native',
		path: outputPath('ai-root', 'Artifacts/Excalidraw/{slug}.excalidraw.md'), writerEvidence: ARTIFACT_WRITER,
	}),
	userArtifact({
		documentationId: 'UA-10', id: 'artifact.drawio', owner: 'chat-artifact', carrier: 'native',
		path: outputPath('ai-root', 'Artifacts/DrawIO/{slug}.drawio'), writerEvidence: ARTIFACT_WRITER, peakIndexPolicy: 'exclude',
	}),
	userArtifact({
		documentationId: 'UA-11', id: 'artifact.extract', owner: 'chat-artifact', carrier: 'markdown',
		path: outputPath('ai-root', 'Artifacts/Extracts/{slug}.md'), writerEvidence: ARTIFACT_WRITER,
	}),
	userArtifact({
		documentationId: 'UA-12', id: 'artifact.reminder', owner: 'chat-artifact', carrier: 'markdown',
		path: outputPath('ai-root', 'Artifacts/Reminders/{slug}.md'), writerEvidence: ARTIFACT_WRITER,
	}),
	durableRecord({
		documentationId: 'DR-01', id: 'chat.conversation-events', owner: 'chat', carrier: 'jsonl',
		path: outputPath('data-store', 'records/chat/conversations/{conversationId}.jsonl'), writerEvidence: CHAT_STORE,
	}),
	durableRecord({
		documentationId: 'DR-02', id: 'chat.project-state', owner: 'chat-project', carrier: 'json',
		path: outputPath('data-store', 'records/chat/projects/{projectId}/state.json'), writerEvidence: CHAT_STORE,
	}),
	durableRecord({
		documentationId: 'DR-05', id: 'run.events', owner: 'run-envelope', carrier: 'jsonl',
		path: outputPath('data-store', 'records/{domain}/runs'),
		writerEvidence: [
			'src/app/ai-graph/ObsidianAIGraphRunEventStore.ts',
			'src/core/storage/vault/ChatStore.ts',
		], lifecycle: 'active',
	}),
	durableRecord({
		documentationId: 'DR-06', id: 'chat.artifact-receipt', owner: 'chat-artifact', carrier: 'jsonl',
		path: outputPath('data-store', 'records/chat/artifact-receipts/{conversationId}.jsonl'),
		writerEvidence: [
			'src/core/storage/sqlite/repositories/ChatArtifactReceiptRepo.ts',
			'src/core/storage/vault/ChatStore.ts',
		],
	}),
	durableRecord({
		documentationId: 'DR-18', id: 'chat.assistant-definition', owner: 'chat-assistant', carrier: 'json',
		path: outputPath('data-store', 'records/chat/assistants/{assistantId}.json'), writerEvidence: CHAT_STORE,
		lifecycle: 'active',
	}),
	durableRecord({
		documentationId: 'DR-19', id: 'chat.project-plan-state', owner: 'chat-project', carrier: 'json',
		path: outputPath('data-store', 'records/chat/project-plans/{planId}.json'), writerEvidence: CHAT_STORE,
		lifecycle: 'active',
	}),
	legacyOutput({
		documentationId: 'LG-01', id: 'legacy.chat-markdown', owner: 'chat', outputClass: 'durable-record',
		carrier: 'markdown', path: outputPath('ai-root', 'Conv-{conversationId}.md'),
		replacementId: 'chat.conversation-events', writerEvidence: CHAT_STORE,
	}),
	legacyOutput({
		documentationId: 'LG-02', id: 'legacy.project-summary-markdown', owner: 'chat-project', outputClass: 'durable-record',
		carrier: 'markdown', path: outputPath('ai-root', '{projectFolder}/Project-Summary.md'),
		replacementId: 'chat.project-state', writerEvidence: CHAT_STORE,
	}),
];
