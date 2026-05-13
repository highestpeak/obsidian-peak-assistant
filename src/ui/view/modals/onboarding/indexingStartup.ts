import type { GetIndexStatusResponse } from '@/service/search/index/indexService';

export function hasUsableVaultIndex(status: GetIndexStatusResponse): boolean {
	return status.isReady || status.indexBuiltAt !== null || (status.indexedDocs ?? 0) > 0;
}
