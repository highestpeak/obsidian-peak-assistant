import { TFile } from 'obsidian';
import type { SearchSettings } from '@/app/settings/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import { LlmEnrichmentProgressTracker } from '@/service/search/support/llm-enrichment-progress-tracker';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';

export type BulkCostEstimate = {
	totalDocs: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUsd: number;
	estimatedDurationMs: number;
};

/**
 * Estimates cost for bulk LLM enrichment operations before they run.
 */
export class BulkOperationCostEstimator {
	constructor(
		private readonly settings: SearchSettings,
		private readonly ai: AIServiceManager,
	) {}

	async estimatePendingLlmCost(): Promise<BulkCostEstimate> {
		if (!sqliteStoreManager.isInitialized()) {
			return {
				totalDocs: 0,
				totalInputTokens: 0,
				totalOutputTokens: 0,
				totalCostUsd: 0,
				estimatedDurationMs: 0,
			};
		}

		const tenants: IndexTenant[] = ['vault', 'chat'];
		const pendingPaths: string[] = [];

		for (const tenant of tenants) {
			const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const paths = await repo.listPathsWithPendingLlm();
			for (const path of paths) {
				if (getIndexTenantForPath(path) !== tenant) continue;
				pendingPaths.push(path);
			}
		}

		const tracker = new LlmEnrichmentProgressTracker(this.settings, this.ai);
		const loaderMgr = DocumentLoaderManager.getInstance();
		const app = AppContext.getApp();

		let totalInputTokens = 0;
		let totalOutputTokens = 0;
		let totalCostUsd = 0;
		let estimatedDurationMs = 0;

		const readContentChars = async (path: string): Promise<number> => {
			const f = app.vault.getAbstractFileByPath(path);
			if (f && f instanceof TFile) {
				const content = await app.vault.cachedRead(f);
				return content.length;
			}
			return 0;
		};

		// Process in batches of 10 to reduce total wall time
		const BATCH_SIZE = 10;
		for (let i = 0; i < pendingPaths.length; i += BATCH_SIZE) {
			const batch = pendingPaths.slice(i, i + BATCH_SIZE);
			const plans = await Promise.all(batch.map(async (path) => {
				const docType = loaderMgr.getTypeForPath(path);
				if (docType !== 'markdown') {
					return tracker.emptyPlan();
				}
				const chars = await readContentChars(path);
				return tracker.planForMarkdownDoc(chars);
			}));
			for (const plan of plans) {
				totalInputTokens += plan.plannedInputTokens;
				totalOutputTokens += plan.plannedOutputTokens;
				totalCostUsd += plan.plannedCostUsd;
				estimatedDurationMs += plan.plannedDurationMs;
			}
		}

		return {
			totalDocs: pendingPaths.length,
			totalInputTokens,
			totalOutputTokens,
			totalCostUsd,
			estimatedDurationMs,
		};
	}
}
