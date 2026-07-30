import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import type { ComposerTransaction } from '@/core/composer';
import { ObsidianComposerHistoryPersistence } from '@/app/composer/ObsidianComposerHistoryPersistence';
import type { CopilotSessionStateSnapshot } from '@/service/composer';

class MemoryAdapter {
	readonly files = new Map<string, string>();
	readonly directories = new Set<string>();

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.directories.has(path);
	}

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) throw new Error(`missing ${path}`);
		return value;
	}

	async write(path: string, value: string): Promise<void> {
		this.files.set(path, value);
	}

	async append(path: string, value: string): Promise<void> {
		this.files.set(path, `${this.files.get(path) ?? ''}${value}`);
	}

	async mkdir(path: string): Promise<void> {
		this.directories.add(path);
	}
}

function fakeApp(adapter: MemoryAdapter, ctimes: Map<string, number>): App {
	return {
		vault: {
			adapter,
			getAbstractFileByPath(path: string) {
				const ctime = ctimes.get(path);
				return ctime === undefined ? null : { stat: { ctime } };
			},
		},
	} as unknown as App;
}

function transaction(): ComposerTransaction {
	return {
		transactionId: 'txn-1',
		documentId: 'Original.md',
		baseRevision: 'r1',
		resultRevision: 'r2',
		origin: 'ai',
		label: 'AI 润色',
		operations: [{ kind: 'replaceRange', from: 0, to: 8, text: 'New copy' }],
		inverseOperations: [{ kind: 'replaceRange', from: 0, to: 8, text: 'Old copy' }],
		expectedBlockDelta: 0,
		runId: 'run-1',
		stats: { added: 8, removed: 8 },
		committedAt: 20,
	};
}

function sessionState(runId: string): CopilotSessionStateSnapshot {
	return {
		schemaVersion: 1,
		surface: 'copilot',
		stage: 'session',
		runStatus: 'no-change',
		activeRunId: runId,
		sessionTitle: '检查内容',
		pendingRelatedRefs: [],
		pendingCommentRefs: [],
		pendingCapabilityId: null,
		receipts: [{
			runId,
			status: 'no-change',
			action: '检查内容',
			instruction: '哪里不清楚？',
			targetLabel: 'Old copy',
			targetQuote: 'Old copy',
			startedAt: 10,
			completedAt: 20,
			elapsedMs: 10,
			changes: [],
			insights: [],
			sources: [],
			trace: [],
			acceptedTransactionIds: [],
		}],
		frozenContexts: [],
		externalRunAliases: {},
	};
}

async function main(): Promise<void> {
	const adapter = new MemoryAdapter();
	const ctimes = new Map([['Original.md', 11]]);
	const app = fakeApp(adapter, ctimes);
	const first = new ObsidianComposerHistoryPersistence(
		app,
		'DataStore/records/document-history',
		'DataStore/records/copilot/sessions',
		{
			identityFile: 'document-index.json',
			copilotCompactionEventThreshold: 3,
		},
	);

	await first.appendDocumentHistory('Original.md', 'Original.md', {
		type: 'document.transaction.committed',
		eventId: 'transaction:txn-1',
		at: 20,
		transaction: transaction(),
	});
	await first.appendDocumentHistory('Original.md', 'Original.md', {
		type: 'document.transaction.committed',
		eventId: 'transaction:txn-1',
		at: 20,
		transaction: transaction(),
	});
	const documentEvents = await first.loadDocumentHistory('Original.md', 'Original.md');
	assert.equal(documentEvents.length, 1, 'event ids make transaction replay idempotent');

	await first.appendCopilotSession('Original.md', 'Original.md', sessionState('run-1'));
	await first.appendCopilotSession('Original.md', 'Original.md', sessionState('run-2'));
	await first.appendCopilotSession('Original.md', 'Original.md', sessionState('run-3'));
	assert.equal(
		(await first.loadCopilotSession('Original.md', 'Original.md'))?.activeRunId,
		'run-3',
		'Copilot replay restores the latest complete snapshot after compaction',
	);

	ctimes.delete('Original.md');
	ctimes.set('Renamed.md', 11);
	await first.renameDocument('Original.md', 'Original.md', 'Renamed.md');
	const afterRename = new ObsidianComposerHistoryPersistence(
		app,
		'DataStore/records/document-history',
		'DataStore/records/copilot/sessions',
		{
			identityFile: 'document-index.json',
			copilotCompactionEventThreshold: 3,
		},
	);
	assert.equal(
		(await afterRename.loadDocumentHistory('Renamed.md', 'Renamed.md')).length,
		1,
		'restart after a Vault rename resolves the same opaque document record',
	);

	ctimes.set('Original.md', 99);
	const pathReuse = new ObsidianComposerHistoryPersistence(
		app,
		'DataStore/records/document-history',
		'DataStore/records/copilot/sessions',
		{
			identityFile: 'document-index.json',
			copilotCompactionEventThreshold: 3,
		},
	);
	assert.equal(
		(await pathReuse.loadDocumentHistory('Original.md', 'Original.md')).length,
		0,
		'a new file reusing an old path does not inherit the renamed document history',
	);

	const indexPath = 'DataStore/records/document-history/document-index.json';
	assert.equal(adapter.files.has(indexPath), true);
	assert.equal(
		[...adapter.files.keys()].some((path) =>
			path.includes('.obsidian/plugins/obsidian-peak-assistant')),
		false,
		'new machine records stay outside the plugin directory',
	);

	console.log('composer-history-persistence: identity, replay, compaction, and path reuse passed');
}

void main();
