/**
 * Peak Composer — unified History read model.
 *
 * Generation records, Copilot receipts and committed document transactions keep
 * independent ownership. This module only correlates them into one human-facing
 * activity stream; it never mutates source, candidates, receipts or ledgers.
 */

import {
	composerTargetBlockId,
	type ComposerCapabilityEffectKind,
	type ComposerHistoryItem,
	type ComposerTarget,
	type ComposerTransaction,
} from '@/core/composer';
import type {
	CopilotRunStatus,
	RunReceipt,
} from './intelligence/runSession';
import {
	groupComposerGenerationRuns,
	type ComposerGenerationGroup,
	type ComposerGenerationDisposition,
	type FrozenComposerRunEnvelope,
	type WorkspaceRunStatus,
} from './intelligence/workspaceIntelligence';

export type ComposerHistoryActivitySource = 'generation' | 'copilot' | 'document';

export type ComposerHistoryActivityStatus =
	| 'running'
	| 'pending-review'
	| 'accepted'
	| 'not-adopted'
	| 'failed'
	| 'cancelled'
	| 'stale'
	| 'rolled-back'
	| 'completed';

export type ComposerHistoryComparisonKind =
	| 'rewrite'
	| 'insert'
	| 'structural'
	| 'metadata'
	| 'media'
	| 'analysis'
	| 'unavailable';

export type ComposerHistoryDetailAvailability = 'complete' | 'partial' | 'legacy';

export interface ComposerHistoryActivityLabels {
	legacyGeneration: string;
	copilot: string;
	directEdit: string;
	documentTarget: string;
	blockTarget: string;
	unitTarget: string;
	selectionTarget: string;
	unknownTarget: string;
}

export interface ComposerHistoryTransactionResolver {
	preview(historyId: string): {
		beforeText: string;
		afterText: string;
	} | null;
	transaction(historyId: string): ComposerTransaction | null;
}

export interface ComposerHistoryActivity {
	activityId: string;
	documentId: string;
	occurredAt: number;
	source: ComposerHistoryActivitySource;
	actionLabel: string;
	effectKind?: ComposerCapabilityEffectKind;
	targetKind?: ComposerTarget['kind'];
	targetBlockId?: string;
	targetLabel: string;
	targetQuote?: string;
	status: ComposerHistoryActivityStatus;
	variantCount: number;
	changeSummary?: string;
	comparisonKind: ComposerHistoryComparisonKind;
	detailAvailability: ComposerHistoryDetailAvailability;
	generation?: ComposerGenerationGroup;
	receipt?: RunReceipt;
	transactions: readonly ComposerHistoryItem[];
}

export interface ProjectComposerHistoryActivitiesInput {
	documentId: string;
	runs: readonly FrozenComposerRunEnvelope[];
	receipts: readonly RunReceipt[];
	externalRunAliases?: Readonly<Record<string, string>>;
	history: readonly ComposerHistoryItem[];
	labels: ComposerHistoryActivityLabels;
	transactionResolver?: ComposerHistoryTransactionResolver;
}

export interface ComposerHistoryFilters {
	source: ComposerHistoryActivitySource | 'all';
	effect: ComposerCapabilityEffectKind | 'all';
	status: ComposerHistoryActivityStatus | 'all';
	target: ComposerTarget['kind'] | 'all';
}

export const DEFAULT_COMPOSER_HISTORY_FILTERS: ComposerHistoryFilters = {
	source: 'all',
	effect: 'all',
	status: 'all',
	target: 'all',
};

export function projectComposerHistoryActivities(
	input: ProjectComposerHistoryActivitiesInput,
): readonly ComposerHistoryActivity[] {
	const groups = groupComposerGenerationRuns(input.runs, input.documentId);
	const transactionItems = flattenHistory(input.history);
	const transactionById = new Map(
		transactionItems.map((item) => [item.transactionId, item]),
	);
	const receiptById = new Map(input.receipts.map((receipt) => [receipt.runId, receipt]));
	const aliases = input.externalRunAliases ?? {};
	const consumedReceipts = new Set<string>();
	const consumedTransactions = new Set<string>();
	const activities: ComposerHistoryActivity[] = [];

	for (const group of groups) {
		const receipt = receiptForGeneration(group, receiptById, aliases, transactionById);
		if (receipt) consumedReceipts.add(receipt.runId);
		const transactions = transactionsForGeneration(group, receipt, transactionById);
		for (const item of transactions) consumedTransactions.add(item.transactionId);
		activities.push(generationActivity(input, group, receipt, transactions));
	}

	for (const receipt of input.receipts) {
		if (consumedReceipts.has(receipt.runId)) continue;
		const transactions = receipt.acceptedTransactionIds
			.map((transactionId) => transactionById.get(transactionId))
			.filter((item): item is ComposerHistoryItem => Boolean(item));
		for (const item of transactions) consumedTransactions.add(item.transactionId);
		activities.push(copilotActivity(input, receipt, transactions));
	}

	for (const item of input.history) {
		const transactions = item.children?.length ? item.children : [item];
		if (transactions.some((transaction) => consumedTransactions.has(transaction.transactionId))) {
			continue;
		}
		activities.push(documentActivity(input, item));
	}

	return activities.sort((left, right) => {
		if (left.occurredAt !== right.occurredAt) return right.occurredAt - left.occurredAt;
		return left.activityId.localeCompare(right.activityId);
	});
}

export function filterComposerHistoryActivities(
	activities: readonly ComposerHistoryActivity[],
	filters: ComposerHistoryFilters,
): readonly ComposerHistoryActivity[] {
	return activities.filter((activity) => {
		if (filters.source !== 'all' && activity.source !== filters.source) return false;
		if (filters.effect !== 'all' && activity.effectKind !== filters.effect) return false;
		if (filters.status !== 'all' && activity.status !== filters.status) return false;
		if (filters.target !== 'all' && activity.targetKind !== filters.target) return false;
		return true;
	});
}

export function activityMatchesBlock(
	activity: ComposerHistoryActivity,
	blockId: string,
): boolean {
	const targetBlockId = activity.targetBlockId;
	if (!targetBlockId) return false;
	const prefix = stableBlockPrefix(blockId);
	return targetBlockId === blockId || targetBlockId.startsWith(prefix);
}

export function generationVariantText(run: FrozenComposerRunEnvelope): string {
	const candidate = run.review?.candidate;
	if (!candidate) return run.error ?? '';
	const variant = candidate.variants.find((item) => item.variantId === run.variantId)
		?? candidate.variants.find((item) => item.variantId === candidate.activeVariantId);
	const result = variant?.proposedChange.result;
	if (typeof result === 'string') return result;
	const resultRecord = asRecord(result);
	const payload = asRecord(resultRecord?.payload);
	for (const key of ['text', 'replacementText', 'itemText', 'markdown', 'source']) {
		const value = payload?.[key] ?? resultRecord?.[key];
		if (typeof value === 'string' && value.trim()) return value;
	}
	const operationText = variant?.proposedChange.operations
		.map((operation) => ('text' in operation ? operation.text : ''))
		.filter(Boolean)
		.join('\n');
	return operationText || variant?.error || run.error || '';
}

export function generationSourceText(run: FrozenComposerRunEnvelope): string {
	const payload = asRecord(run.review?.runtime.payload);
	const snapshot = asRecord(payload?.snapshot);
	const targetSource = snapshot?.targetSource;
	return typeof targetSource === 'string' ? targetSource : '';
}

function generationActivity(
	input: ProjectComposerHistoryActivitiesInput,
	group: ComposerGenerationGroup,
	receipt: RunReceipt | undefined,
	transactions: readonly ComposerHistoryItem[],
): ComposerHistoryActivity {
	const latest = group.latest;
	const target = latest.target;
	const targetQuote = generationSourceText(latest) || receipt?.targetQuote;
	const label = group.label === latest.capabilityId
		? input.labels.legacyGeneration
		: group.label;
	const effectKind = latest.review?.runtime.effectKind;
	const status = generationStatus(group.runs, latest.status, latest.disposition);
	return {
		activityId: `generation:${group.candidateId}`,
		documentId: latest.originDocumentId,
		occurredAt: latest.completedAt ?? latest.startedAt,
		source: 'generation',
		actionLabel: label,
		...(effectKind ? { effectKind } : {}),
		targetKind: target.kind,
		...targetBlock(target),
		targetLabel: targetLabel(target, targetQuote, input.labels),
		...(targetQuote ? { targetQuote: compactQuote(targetQuote) } : {}),
		status,
		variantCount: group.runs.length,
		changeSummary: generationVariantText(latest) || undefined,
		comparisonKind: comparisonKind(effectKind),
		detailAvailability: group.runs.some((run) => Boolean(run.review))
			? 'complete'
			: receipt
				? 'partial'
				: 'legacy',
		generation: group,
		...(receipt ? { receipt } : {}),
		transactions,
	};
}

function copilotActivity(
	input: ProjectComposerHistoryActivitiesInput,
	receipt: RunReceipt,
	transactions: readonly ComposerHistoryItem[],
): ComposerHistoryActivity {
	const target = receipt.changes[0]?.target;
	return {
		activityId: `copilot:${receipt.runId}`,
		documentId: input.documentId,
		occurredAt: receipt.completedAt ?? receipt.startedAt,
		source: 'copilot',
		actionLabel: receipt.action || input.labels.copilot,
		effectKind: receipt.changes.length > 0 ? 'rewrite' : 'analyze',
		...(target ? { targetKind: target.kind, ...targetBlock(target) } : {}),
		targetLabel: receipt.targetLabel || input.labels.unknownTarget,
		...(receipt.targetQuote ? { targetQuote: compactQuote(receipt.targetQuote) } : {}),
		status: copilotStatus(receipt.status, transactions.length > 0),
		variantCount: 1,
		...(receipt.responseSummary ? { changeSummary: receipt.responseSummary } : {}),
		comparisonKind: receipt.changes.length > 0 ? 'rewrite' : 'analysis',
		detailAvailability: 'complete',
		receipt,
		transactions,
	};
}

function documentActivity(
	input: ProjectComposerHistoryActivitiesInput,
	item: ComposerHistoryItem,
): ComposerHistoryActivity {
	const target = item.target;
	const preview = input.transactionResolver?.preview(item.historyId) ?? null;
	const transaction = input.transactionResolver?.transaction(item.historyId) ?? null;
	const targetQuote = preview?.beforeText || undefined;
	const effectKind = transactionEffect(transaction, item);
	return {
		activityId: `document:${item.historyId}`,
		documentId: transaction?.documentId ?? input.documentId,
		occurredAt: item.timestamp,
		source: 'document',
		actionLabel: item.label || input.labels.directEdit,
		effectKind,
		...(target ? { targetKind: target.kind, ...targetBlock(target) } : {}),
		targetLabel: targetLabel(target, targetQuote, input.labels),
		...(targetQuote ? { targetQuote: compactQuote(targetQuote) } : {}),
		status: item.isRollback || item.origin === 'system-rollback'
			? 'rolled-back'
			: 'completed',
		variantCount: item.children?.length ?? 1,
		...(preview?.afterText ? { changeSummary: compactQuote(preview.afterText) } : {}),
		comparisonKind: comparisonKind(effectKind),
		detailAvailability: transaction ? 'complete' : 'partial',
		transactions: item.children?.length ? item.children : [item],
	};
}

function receiptForGeneration(
	group: ComposerGenerationGroup,
	receiptById: ReadonlyMap<string, RunReceipt>,
	aliases: Readonly<Record<string, string>>,
	transactionById: ReadonlyMap<string, ComposerHistoryItem>,
): RunReceipt | undefined {
	for (const run of [...group.runs].reverse()) {
		const sessionRunId = aliases[run.runId];
		if (sessionRunId && receiptById.has(sessionRunId)) return receiptById.get(sessionRunId);
	}
	const accepted = new Set(
		group.runs
			.map((run) => run.acceptedTransactionId)
			.filter((id): id is string => Boolean(id && transactionById.has(id))),
	);
	if (accepted.size === 0) return undefined;
	for (const receipt of receiptById.values()) {
		if (receipt.acceptedTransactionIds.some((id) => accepted.has(id))) return receipt;
	}
	return undefined;
}

function transactionsForGeneration(
	group: ComposerGenerationGroup,
	receipt: RunReceipt | undefined,
	transactionById: ReadonlyMap<string, ComposerHistoryItem>,
): readonly ComposerHistoryItem[] {
	const ids = new Set<string>();
	for (const run of group.runs) {
		if (run.acceptedTransactionId) ids.add(run.acceptedTransactionId);
	}
	for (const transactionId of receipt?.acceptedTransactionIds ?? []) ids.add(transactionId);
	return [...ids]
		.map((transactionId) => transactionById.get(transactionId))
		.filter((item): item is ComposerHistoryItem => Boolean(item));
}

function generationStatus(
	runs: readonly FrozenComposerRunEnvelope[],
	status: WorkspaceRunStatus,
	disposition: ComposerGenerationDisposition,
): ComposerHistoryActivityStatus {
	if (runs.some((run) => run.disposition === 'accepted')) return 'accepted';
	if (disposition === 'not-adopted') return 'not-adopted';
	if (status === 'failed') return 'failed';
	if (status === 'cancelled' || status === 'interrupted') return 'cancelled';
	if (status === 'stale') return 'stale';
	if (status === 'starting' || status === 'streaming') return 'running';
	return 'pending-review';
}

function copilotStatus(
	status: CopilotRunStatus,
	hasAcceptedTransaction: boolean,
): ComposerHistoryActivityStatus {
	if (hasAcceptedTransaction) return 'accepted';
	if (status === 'assembling' || status === 'streaming') return 'running';
	if (status === 'proposed') return 'pending-review';
	if (status === 'error') return 'failed';
	if (status === 'cancelled') return 'cancelled';
	return 'completed';
}

function comparisonKind(
	effectKind: ComposerCapabilityEffectKind | undefined,
): ComposerHistoryComparisonKind {
	if (!effectKind) return 'unavailable';
	if (effectKind === 'analyze') return 'analysis';
	if (effectKind === 'insert') return 'insert';
	if (effectKind === 'transform' || effectKind === 'delete') return 'structural';
	if (effectKind === 'metadata-patch') return 'metadata';
	if (effectKind === 'asset-transaction' || effectKind === 'native-object-patch') {
		return 'media';
	}
	return 'rewrite';
}

function transactionEffect(
	transaction: ComposerTransaction | null,
	item: ComposerHistoryItem,
): ComposerCapabilityEffectKind {
	if (item.isRollback || item.origin === 'system-rollback') return 'rewrite';
	if (!transaction) return 'rewrite';
	if (transaction.operations.some((operation) => operation.kind === 'moveBlock')) {
		return 'transform';
	}
	if (transaction.operations.some((operation) => operation.kind === 'insertBlock')) {
		return 'insert';
	}
	return 'rewrite';
}

function targetLabel(
	target: ComposerTarget | undefined,
	quote: string | undefined,
	labels: ComposerHistoryActivityLabels,
): string {
	if (quote?.trim()) return compactQuote(quote);
	if (!target) return labels.unknownTarget;
	if (target.kind === 'document') return labels.documentTarget;
	if (target.kind === 'block') return labels.blockTarget;
	if (target.kind === 'unit') return labels.unitTarget;
	return labels.selectionTarget;
}

function targetBlock(target: ComposerTarget): { targetBlockId?: string } {
	const blockId = composerTargetBlockId(target);
	return blockId ? { targetBlockId: blockId } : {};
}

function flattenHistory(items: readonly ComposerHistoryItem[]): ComposerHistoryItem[] {
	const flattened: ComposerHistoryItem[] = [];
	const visit = (item: ComposerHistoryItem): void => {
		flattened.push(item);
		for (const child of item.children ?? []) visit(child);
	};
	for (const item of items) visit(item);
	return flattened;
}

function compactQuote(value: string): string {
	return value.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function stableBlockPrefix(blockId: string): string {
	return `${blockId.split('-').slice(0, -1).join('-')}-`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object'
		? value as Record<string, unknown>
		: null;
}
