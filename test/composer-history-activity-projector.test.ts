import assert from 'node:assert/strict';
import type {
	ComposerCandidate,
	ComposerHistoryItem,
	ComposerTransaction,
} from '@/core/composer';
import {
	DEFAULT_COMPOSER_HISTORY_FILTERS,
	filterComposerHistoryActivities,
	projectComposerHistoryActivities,
	type ComposerHistoryActivityLabels,
	type FrozenComposerRunEnvelope,
	type RunReceipt,
} from '@/service/composer';

const labels: ComposerHistoryActivityLabels = {
	legacyGeneration: '旧 AI 生成',
	copilot: 'Copilot',
	directEdit: '直接编辑',
	documentTarget: '全文',
	blockTarget: '正文块',
	unitTarget: '列表项',
	selectionTarget: '文本选区',
	unknownTarget: '当前正文',
};

function candidate(): ComposerCandidate {
	return {
		candidateId: 'candidate-1',
		target: { kind: 'block', blockId: 'paragraph-0-abcd1234' },
		baseRevision: 'r1',
		status: 'accepted',
		activeVariantId: 'variant-1',
		variants: [{
			variantId: 'variant-1',
			provenance: 'initial',
			status: 'ready',
			createdAt: 10,
			proposedChange: {
				operations: [{ kind: 'replaceRange', from: 0, to: 8, text: 'New copy' }],
				result: {
					payload: { replacementText: 'New copy' },
				},
			},
		}],
		proposedChange: {
			operations: [{ kind: 'replaceRange', from: 0, to: 8, text: 'New copy' }],
			result: { payload: { replacementText: 'New copy' } },
		},
	};
}

function generation(overrides: Partial<FrozenComposerRunEnvelope> = {}): FrozenComposerRunEnvelope {
	return {
		runId: 'external-run-1',
		candidateId: 'candidate-1',
		variantId: 'variant-1',
		originDocumentId: 'Doc.md',
		originPathAtStart: 'Doc.md',
		originRevision: 'r1',
		originHost: 'composer',
		workSegmentId: 'segment-1',
		scopeSnapshot: { kind: 'document', documentId: 'Doc.md' },
		capabilityId: 'composer.prose.polish-block',
		target: { kind: 'block', blockId: 'paragraph-0-abcd1234' },
		startedAt: 10,
		completedAt: 20,
		status: 'ready',
		disposition: 'accepted',
		acceptedTransactionId: 'txn-1',
		review: {
			candidate: candidate(),
			runtime: {
				ownerId: 'capability',
				rendererId: 'composer.renderer.streaming-text',
				label: '润色文本',
				effectKind: 'rewrite',
				payload: {
					snapshot: {
						targetSource: 'Original paragraph',
					},
				},
			},
		},
		...overrides,
	};
}

function receipt(overrides: Partial<RunReceipt> = {}): RunReceipt {
	return {
		runId: 'session-run-1',
		status: 'proposed',
		action: '润色文本',
		instruction: '让它更清楚',
		targetLabel: 'Original paragraph',
		targetQuote: 'Original paragraph',
		startedAt: 10,
		completedAt: 20,
		elapsedMs: 10,
		changes: [],
		insights: [],
		sources: [],
		trace: [],
		acceptedTransactionIds: ['txn-1'],
		...overrides,
	};
}

function transactionItem(overrides: Partial<ComposerHistoryItem> = {}): ComposerHistoryItem {
	return {
		historyId: 'history-txn-1',
		transactionId: 'txn-1',
		origin: 'ai',
		label: 'AI 润色',
		timestamp: 20,
		target: { kind: 'block', blockId: 'paragraph-0-abcd1234' },
		runId: 'external-run-1',
		stats: { added: 8, removed: 8 },
		...overrides,
	};
}

const txn = {
	transactionId: 'txn-1',
	documentId: 'Doc.md',
	baseRevision: 'r1',
	resultRevision: 'r2',
	origin: 'ai',
	label: 'AI 润色',
	operations: [{ kind: 'replaceRange', from: 0, to: 8, text: 'New copy' }],
	inverseOperations: [{ kind: 'replaceRange', from: 0, to: 8, text: 'Original' }],
	expectedBlockDelta: 0,
	stats: { added: 8, removed: 8 },
	committedAt: 20,
} as ComposerTransaction;

const activities = projectComposerHistoryActivities({
	documentId: 'Doc.md',
	runs: [generation()],
	receipts: [receipt()],
	externalRunAliases: { 'external-run-1': 'session-run-1' },
	history: [
		transactionItem(),
		transactionItem({
			historyId: 'history-direct',
			transactionId: 'txn-direct',
			runId: undefined,
			origin: 'direct',
			label: '编辑段落',
			timestamp: 30,
		}),
	],
	labels,
	transactionResolver: {
		preview: (historyId) => historyId === 'history-direct'
			? { beforeText: 'Before direct', afterText: 'After direct' }
			: { beforeText: 'Original', afterText: 'New copy' },
		transaction: (historyId) => historyId === 'history-txn-1'
			? txn
			: {
				...txn,
				transactionId: 'txn-direct',
				origin: 'direct',
				runId: undefined,
				committedAt: 30,
			},
	},
});

assert.equal(activities.length, 2, 'accepted generation, receipt and transaction collapse into one activity');
const merged = activities.find((activity) => activity.source === 'generation');
assert.equal(merged?.actionLabel, '润色文本');
assert.equal(merged?.targetQuote, 'Original paragraph');
assert.equal(merged?.receipt?.instruction, '让它更清楚');
assert.equal(merged?.transactions[0]?.transactionId, 'txn-1');
assert.equal(merged?.comparisonKind, 'rewrite');
assert.equal(merged?.status, 'accepted');

const direct = activities.find((activity) => activity.source === 'document');
assert.equal(direct?.targetQuote, 'Before direct');
assert.equal(direct?.actionLabel, '编辑段落');

const generationOnly = projectComposerHistoryActivities({
	documentId: 'Doc.md',
	runs: [generation({
		runId: 'legacy-run',
		candidateId: 'legacy-candidate',
		review: undefined,
		disposition: 'not-adopted',
		acceptedTransactionId: undefined,
	})],
	receipts: [],
	history: [],
	labels,
});
assert.equal(generationOnly[0]?.actionLabel, '旧 AI 生成', 'raw capability IDs never become visible titles');
assert.equal(generationOnly[0]?.detailAvailability, 'legacy');
assert.equal(generationOnly[0]?.status, 'not-adopted');

const onlyGeneration = filterComposerHistoryActivities(activities, {
	...DEFAULT_COMPOSER_HISTORY_FILTERS,
	source: 'generation',
});
assert.deepEqual(onlyGeneration.map((activity) => activity.activityId), ['generation:candidate-1']);

const onlyRewrite = filterComposerHistoryActivities(activities, {
	...DEFAULT_COMPOSER_HISTORY_FILTERS,
	effect: 'rewrite',
});
assert.equal(onlyRewrite.length, 2);

console.log('composer-history-activity-projector: correlation, presentation, legacy, and filters passed');
