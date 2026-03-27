import type { SearchSettings } from '@/app/settings/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { defaultIndexDocumentOptions, IndexService, getIndexTenantForPath } from '@/service/search/index/indexService';

export type LlmIndexEnrichmentResult = {
	processed: number;
	skippedWrongTenant: number;
	errors: Array<{ path: string; message: string }>;
};

export type VectorIndexEnrichmentResult = {
	processed: number;
	skippedWrongTenant: number;
	errors: Array<{ path: string; message: string }>;
};

/**
 * Runs LLM tags + summary for documents marked `llm_pending` (fast index deferred enrichment).
 * Does not bump global index_state; does not re-chunk or re-embed unless you change options.
 */
export type PendingEnrichmentProgress = {
	processed: number;
	total: number;
	path: string;
};

export async function runPendingLlmIndexEnrichment(
	settings: SearchSettings,
	options?: { onProgress?: (ev: PendingEnrichmentProgress) => void },
): Promise<LlmIndexEnrichmentResult> {
	if (!sqliteStoreManager.isInitialized()) {
		return { processed: 0, skippedWrongTenant: 0, errors: [{ path: '', message: 'SQLite not initialized' }] };
	}

	const index = IndexService.getInstance();
	const opts = defaultIndexDocumentOptions('llm_enrich_only');
	const tenants: IndexTenant[] = ['vault', 'chat'];
	let processed = 0;
	let skippedWrongTenant = 0;
	const errors: Array<{ path: string; message: string }> = [];

	const pendingPaths: string[] = [];
	for (const tenant of tenants) {
		const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const paths = await repo.listPathsWithPendingLlm();
		for (const path of paths) {
			if (getIndexTenantForPath(path) !== tenant) {
				skippedWrongTenant++;
				continue;
			}
			pendingPaths.push(path);
		}
	}
	const total = pendingPaths.length;
	let done = 0;
	for (const path of pendingPaths) {
		try {
			await index.indexDocument(path, settings, opts);
			processed++;
			done++;
			options?.onProgress?.({ processed: done, total, path });
		} catch (e) {
			errors.push({ path, message: (e as Error).message ?? String(e) });
			done++;
			options?.onProgress?.({ processed: done, total, path });
		}
	}

	return { processed, skippedWrongTenant, errors };
}

/**
 * Runs vector embedding generation for documents marked `vector_pending`.
 * Uses persisted chunks without re-running core chunk/FTS indexing.
 */
export async function runPendingVectorIndexEnrichment(
	settings: SearchSettings,
	options?: { onProgress?: (ev: PendingEnrichmentProgress) => void },
): Promise<VectorIndexEnrichmentResult> {
	if (!sqliteStoreManager.isInitialized()) {
		return { processed: 0, skippedWrongTenant: 0, errors: [{ path: '', message: 'SQLite not initialized' }] };
	}

	const index = IndexService.getInstance();
	const opts = defaultIndexDocumentOptions('vector_enrich_only');
	const tenants: IndexTenant[] = ['vault', 'chat'];
	let processed = 0;
	let skippedWrongTenant = 0;
	const errors: Array<{ path: string; message: string }> = [];

	const pendingPaths: string[] = [];
	for (const tenant of tenants) {
		const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const paths = await repo.listPathsWithPendingVector();
		for (const path of paths) {
			if (getIndexTenantForPath(path) !== tenant) {
				skippedWrongTenant++;
				continue;
			}
			pendingPaths.push(path);
		}
	}
	const total = pendingPaths.length;
	let done = 0;
	for (const path of pendingPaths) {
		try {
			await index.indexDocument(path, settings, opts);
			processed++;
			done++;
			options?.onProgress?.({ processed: done, total, path });
		} catch (e) {
			errors.push({ path, message: (e as Error).message ?? String(e) });
			done++;
			options?.onProgress?.({ processed: done, total, path });
		}
	}

	return { processed, skippedWrongTenant, errors };
}
