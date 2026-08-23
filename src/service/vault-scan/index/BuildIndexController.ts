import type { VaultScanResolvedRoute, VaultScanUsage } from '@/core/types/vault-intelligence';
import type { FrozenScanPlan, VaultScanIndexLayerId, VaultScanWorkUnitReceipt } from '@/core/types/vault-scan';

const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

export interface IndexLaneResult {
	disposition: VaultScanWorkUnitReceipt['disposition'];
	actualRoute: VaultScanResolvedRoute | null;
	usage?: VaultScanUsage;
	evidenceRefs?: readonly string[];
	error?: string | null;
}

export interface BuildIndexPorts {
	fullText(path: string, signal: AbortSignal): Promise<IndexLaneResult>;
	embedding(path: string, signal: AbortSignal): Promise<IndexLaneResult>;
	aiEnrichment(path: string, signal: AbortSignal): Promise<IndexLaneResult>;
}

export interface BuildIndexControllerOptions {
	now: () => number;
	id: () => string;
	onReceipt: (receipt: VaultScanWorkUnitReceipt) => Promise<void> | void;
	onCurrent?: (lane: VaultScanIndexLayerId, path: string | null, action: string, route: VaultScanResolvedRoute | null) => void;
}

export class BuildIndexController {
	private readonly successfulKeys = new Set<string>();

	constructor(private readonly ports: BuildIndexPorts, private readonly options: BuildIndexControllerOptions) {}

	restore(receipts: readonly VaultScanWorkUnitReceipt[]): void {
		for (const receipt of receipts) {
			if (receipt.disposition === 'ready' || receipt.disposition === 'already-current') this.successfulKeys.add(receipt.workKey);
		}
	}

	async run(plan: FrozenScanPlan, signal: AbortSignal): Promise<VaultScanWorkUnitReceipt[]> {
		const receipts: VaultScanWorkUnitReceipt[] = [];
		for (const path of plan.scope.paths) {
			if (signal.aborted) break;
			const fullText = await this.runUnit(plan, path, 'full-text', signal);
			receipts.push(fullText);
			if (!['ready', 'already-current'].includes(fullText.disposition)) {
				for (const layer of plan.enabledIndexLayers.filter((candidate) => candidate !== 'full-text')) receipts.push(await this.terminalUnavailable(plan, path, layer, 'Full-text prerequisite did not become search-ready.'));
				continue;
			}
			const dependentLayers = plan.enabledIndexLayers.filter((candidate) => candidate !== 'full-text');
			const dependentReceipts = await Promise.all(dependentLayers.map((layer) => this.runUnit(plan, path, layer, signal)));
			receipts.push(...dependentReceipts);
		}
		return receipts;
	}

	private async runUnit(plan: FrozenScanPlan, path: string, layer: VaultScanIndexLayerId, signal: AbortSignal): Promise<VaultScanWorkUnitReceipt> {
		const workKey = workUnitKey(plan, path, layer);
		if (this.successfulKeys.has(workKey)) return this.terminalReceipt(plan, path, layer, workKey, 'already-current', null, null, EMPTY_USAGE, [], null);
		const startedAt = this.options.now();
		this.options.onCurrent?.(layer, path, actionLabel(layer), null);
		let result: IndexLaneResult;
		try {
			result = await this.ports[portName(layer)](path, signal);
		} catch (error) {
			result = { disposition: signal.aborted ? 'skipped-by-policy' : 'failed', actualRoute: null, error: error instanceof Error ? error.message : String(error) };
		}
		const receipt = this.terminalReceipt(plan, path, layer, workKey, result.disposition, result.actualRoute, null, result.usage ?? EMPTY_USAGE, result.evidenceRefs ?? [], result.error ?? null, startedAt);
		if (receipt.disposition === 'ready' || receipt.disposition === 'already-current') this.successfulKeys.add(workKey);
		await this.options.onReceipt(receipt);
		this.options.onCurrent?.(layer, null, actionLabel(layer), null);
		return receipt;
	}

	private async terminalUnavailable(plan: FrozenScanPlan, path: string, layer: VaultScanIndexLayerId, reason: string): Promise<VaultScanWorkUnitReceipt> {
		const receipt = this.terminalReceipt(plan, path, layer, workUnitKey(plan, path, layer), 'unavailable', null, null, EMPTY_USAGE, [], reason);
		await this.options.onReceipt(receipt);
		return receipt;
	}

	private terminalReceipt(plan: FrozenScanPlan, path: string, layer: VaultScanIndexLayerId, workKey: string, disposition: VaultScanWorkUnitReceipt['disposition'], actualRoute: VaultScanResolvedRoute | null, plannedRoute: VaultScanResolvedRoute | null, usage: VaultScanUsage, evidenceRefs: readonly string[], error: string | null, startedAt = this.options.now()): VaultScanWorkUnitReceipt {
		return { receiptId: this.options.id(), workKey, snapshotId: plan.snapshotId, stageSessionId: `${plan.scanRunId}:index`, path, layerId: layer, disposition, plannedRoute, actualRoute, attemptId: this.options.id(), executionId: this.options.id(), startedAt, completedAt: this.options.now(), usage, evidenceRefs, error };
	}
}

export function workUnitKey(plan: FrozenScanPlan, path: string, layer: VaultScanIndexLayerId): string {
	return `${plan.snapshotId}\u0000${path}\u0000${layer}\u0000${plan.routePolicies[layer]?.fingerprint ?? 'local'}\u0000v1`;
}

function portName(layer: VaultScanIndexLayerId): keyof BuildIndexPorts {
	if (layer === 'full-text') return 'fullText';
	if (layer === 'embedding') return 'embedding';
	return 'aiEnrichment';
}

function actionLabel(layer: VaultScanIndexLayerId): string {
	if (layer === 'full-text') return 'Reading, chunking, and publishing search passages';
	if (layer === 'embedding') return 'Generating semantic vectors';
	return 'Generating summary, tags, entities, and file signals';
}
