import assert from 'node:assert/strict';
import type { ComposerTransaction } from '@/core/composer';
import {
	ComposerDocumentSession,
	ComposerSourceRevisionService,
	ComposerTransactionEngine,
	ComposerTransactionHub,
	IntelligenceRuntime,
	type ComposerDocumentHistoryEvent,
	type ComposerHistoryPersistencePort,
	type CopilotSessionStateSnapshot,
} from '@/service/composer';

class MemoryHistoryPersistence implements ComposerHistoryPersistencePort {
	readonly events: ComposerDocumentHistoryEvent[] = [];
	state: CopilotSessionStateSnapshot | null = null;

	async loadDocumentHistory(): Promise<readonly ComposerDocumentHistoryEvent[]> {
		return this.events;
	}

	async appendDocumentHistory(
		_documentId: string,
		_filePath: string,
		event: ComposerDocumentHistoryEvent,
	): Promise<void> {
		if (!this.events.some((item) => item.eventId === event.eventId)) this.events.push(event);
	}

	async loadCopilotSession(): Promise<CopilotSessionStateSnapshot | null> {
		return this.state;
	}

	async appendCopilotSession(
		_documentId: string,
		_filePath: string,
		state: CopilotSessionStateSnapshot,
	): Promise<void> {
		this.state = JSON.parse(JSON.stringify(state)) as CopilotSessionStateSnapshot;
	}

	async renameDocument(): Promise<void> {}
}

function transaction(): ComposerTransaction {
	return {
		transactionId: 'txn-persisted',
		documentId: 'Doc.md',
		baseRevision: 'r1',
		resultRevision: 'r2',
		origin: 'ai',
		label: 'AI 润色',
		operations: [{ kind: 'replaceRange', from: 0, to: 3, text: 'New' }],
		inverseOperations: [{ kind: 'replaceRange', from: 0, to: 3, text: 'Old' }],
		expectedBlockDelta: 0,
		runId: 'external-run',
		stats: { added: 3, removed: 3 },
		target: { kind: 'block', blockId: 'paragraph-0-abcd1234' },
		committedAt: 20,
	};
}

async function main(): Promise<void> {
	const persistence = new MemoryHistoryPersistence();
	persistence.events.push({
		type: 'document.transaction.committed',
		eventId: 'transaction:txn-persisted',
		at: 20,
		transaction: transaction(),
	});
	const session = ComposerDocumentSession.fromSource(
		'Doc.md',
		'New',
		new ComposerSourceRevisionService(),
	);
	const source = { readSource: async () => 'New' };
	const write = { writeSource: async () => undefined };
	const hub = new ComposerTransactionHub(session, {
		engine: new ComposerTransactionEngine(source, write, new ComposerSourceRevisionService()),
		historyPersistence: persistence,
	});
	await hub.whenHistoryReady();
	assert.equal(hub.projection().history.length, 1);
	assert.equal(hub.projection().undo.undoDepth, 0, 'durable replay does not pollute live Undo');
	const historyId = hub.projection().history[0].historyId;
	assert.equal(hub.historyPreview(historyId)?.beforeText, 'Old');
	assert.equal(hub.historyPreview(historyId)?.afterText, 'New');

	const fakeHub = {
		on: () => () => undefined,
	} as unknown as ComposerTransactionHub;
	const first = new IntelligenceRuntime({
		hub: fakeHub,
		historyPersistence: persistence,
		documentId: 'Doc.md',
		filePath: 'Doc.md',
	});
	await first.whenSessionHistoryReady();
	first.session.openSession('检查段落');
	const frozen = first.session.send({
		snapshot: {
			documentId: 'Doc.md',
			revision: 'r1',
			target: { kind: 'document', documentId: 'Doc.md' },
			targetSource: 'Old',
			nearby: { before: '', after: '' },
		},
		instruction: '哪里不清楚？',
		targetQuote: 'Old',
	});
	first.session.linkExternalRun('external-run', frozen.runId);
	first.session.markNoChange(frozen.runId, { responseSummary: '没有需要改动的地方' });
	await new Promise<void>((resolve) => setImmediate(resolve));
	first.dispose();

	const second = new IntelligenceRuntime({
		hub: fakeHub,
		historyPersistence: persistence,
		documentId: 'Doc.md',
		filePath: 'Doc.md',
	});
	await second.whenSessionHistoryReady();
	const restored = second.session.projection();
	assert.equal(restored.receipts[0]?.instruction, '哪里不清楚？');
	assert.equal(restored.receipts[0]?.responseSummary, '没有需要改动的地方');
	assert.equal(restored.externalRunAliases['external-run'], frozen.runId);
	second.dispose();

	console.log('composer-history-ledger-replay: transaction and Copilot reload passed');
}

void main();
