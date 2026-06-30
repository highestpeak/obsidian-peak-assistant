// SQL-only adapter for `VaultReviewReadPort` (T11Y-4a).
//
// Owns every sqlite query the Vault Review digest pipeline used to
// embed inside `SqliteVaultReviewDigestAdapter`. No business decisions,
// no caching, no scoring, no top-K constants. Just rows.
//
// Pre-T11Y-4a the digest adapter mixed SQL with fingerprint caching,
// top-K caps, recency cutoffs, lint merging, and `VaultDigest`
// shaping. T11Y-4a splits that into:
//   - app/adapters/copilot/SqliteVaultReviewReadAdapter (this file)
//   - service/copilot/vault/VaultDigestBuilder (owns the derivation)

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type {
	ClusterMemberRow,
	DanglingReferenceRow,
	VaultFingerprintRow,
	VaultNodeDigestRow,
	VaultReviewReadPort,
} from '@/core/ports/VaultReviewReadPort';
import type { CommunityInfo, StructuralHole } from '@/core/search/structuralTypes';

export class SqliteVaultReviewReadAdapter implements VaultReviewReadPort {
	async listFingerprintRows(): Promise<VaultFingerprintRow[]> {
		const db = sqliteStoreManager.getIndexContext('vault');
		const rows = await db
			.selectFrom('mobius_node')
			.select(['path', 'content_hash', 'word_count', 'mtime'])
			.where('path', 'is not', null)
			.execute();
		return rows.map(r => ({
			path: r.path ?? null,
			contentHash: r.content_hash ?? null,
			wordCount: r.word_count ?? null,
			mtime: r.mtime ?? null,
		}));
	}

	async listNodeRowsForDigest(): Promise<VaultNodeDigestRow[]> {
		const db = sqliteStoreManager.getIndexContext('vault');
		const rows = await db
			.selectFrom('mobius_node')
			.select([
				'path',
				'word_count',
				'mtime',
				'tags_json',
				'pagerank',
				'doc_incoming_cnt',
				'doc_outgoing_cnt',
				'other_incoming_cnt',
			])
			.where('path', 'is not', null)
			.execute();
		return rows.map(r => ({
			path: r.path ?? null,
			wordCount: r.word_count ?? null,
			mtime: r.mtime ?? null,
			tagsJson: r.tags_json ?? null,
			pagerank: r.pagerank ?? null,
			docIncomingCnt: r.doc_incoming_cnt ?? null,
			docOutgoingCnt: r.doc_outgoing_cnt ?? null,
			otherIncomingCnt: r.other_incoming_cnt ?? null,
		}));
	}

	async listCommunities(): Promise<CommunityInfo[]> {
		const structRepo = sqliteStoreManager.getStructuralAnalysisRepo();
		return structRepo.getCommunities();
	}

	async listTopStructuralHoles(limit: number): Promise<StructuralHole[]> {
		const structRepo = sqliteStoreManager.getStructuralAnalysisRepo();
		return structRepo.getTopHoles(limit);
	}

	async listDanglingReferences(limit: number): Promise<DanglingReferenceRow[]> {
		try {
			const db = sqliteStoreManager.getIndexContext('vault');
			const rows = await db
				.selectFrom('mobius_edge' as never)
				.select((eb: any) => [eb.ref('target_label').as('target'), eb.fn.count('id').as('cnt')])
				.where('relation' as any, '=', 'wikilink')
				.where('target_node_id' as any, 'is', null)
				.groupBy('target_label' as any)
				.orderBy(eb => eb.fn.count('id') as any, 'desc')
				.limit(limit)
				.execute() as Array<{ target: string; cnt: number }>;
			const out: DanglingReferenceRow[] = [];
			for (const r of rows) {
				if (r.target) out.push({ target: r.target, referencedBy: Number(r.cnt) });
			}
			return out;
		} catch {
			// Schema mismatch — caller treats this as "no dangling data".
			return [];
		}
	}

	async listClusterMembers(communityId: string, limit: number): Promise<ClusterMemberRow[]> {
		try {
			const db = sqliteStoreManager.getIndexContext('vault');
			const rows = await db
				.selectFrom('mobius_node')
				.select(['path', 'title', 'word_count', 'pagerank', 'mtime', 'doc_incoming_cnt', 'other_incoming_cnt'])
				.where('community_id' as never, '=', communityId as never)
				.where('path', 'is not', null)
				.orderBy('pagerank' as never, 'desc')
				.limit(limit)
				.execute() as Array<{
					path: string | null;
					title: string | null;
					word_count: number | null;
					pagerank: number | null;
					mtime: number | null;
					doc_incoming_cnt: number | null;
					other_incoming_cnt: number | null;
				}>;
			return rows
				.filter(r => r.path)
				.map(r => ({
					path: r.path!,
					title: r.title,
					wordCount: r.word_count,
					pagerank: r.pagerank,
					mtime: r.mtime,
					incomingCount: (r.doc_incoming_cnt ?? 0) + (r.other_incoming_cnt ?? 0),
				}));
		} catch (err) {
			console.warn('[SqliteVaultReviewReadAdapter] listClusterMembers failed', err);
			return [];
		}
	}
}
