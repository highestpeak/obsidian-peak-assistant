// T9: SQLite adapter for the Vault Review digest data port.
//
// Owns every concrete sqlite query the digest used to perform from
// `src/service/copilot/vault/*`. Pre-T9 these lived inside
// `VaultDigestService.ts` (sqliteStoreManager) and
// `VaultFingerprintService.ts` (sqliteStoreManager + cached
// fingerprint in a module global). After T9:
//   - Service files own types + pure formatting + diff helpers.
//   - This adapter owns raw queries, fingerprint caching, and the
//     shaping that turns rows into a `VaultDigest`.
//
// The fingerprint cache is an instance field so a hot-reloaded plugin
// bundle starts with a fresh cache instead of inheriting a stale
// module global.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { hashSHA256 } from '@/core/utils/hash-utils';
import type {
	VaultReviewDigestDataPort,
} from '@/service/copilot/vault/ports/VaultReviewPorts';
import type {
	BuildVaultDigestOptions,
	ClusterMember,
	VaultClusterDigest,
	VaultClusterDigestTopNode,
	VaultDangling,
	VaultDigest,
	VaultHubDigest,
	VaultStructuralHoleDigest,
} from '@/service/copilot/vault/VaultDigestService';
import type {
	VaultFingerprint,
} from '@/service/copilot/vault/VaultFingerprintService';
import type { LintScanResult } from '@/service/lint/types';

const TOP_K_CLUSTERS = 12;
const TOP_K_HOLES = 8;
const TOP_K_HUBS = 15;
const TOP_K_ORPHANS = 20;
const TOP_K_DANGLING = 20;
const TOP_K_TAGS = 25;
const STALE_HUB_DAYS = 180;
const RECENT_DAYS = 30;
const DORMANT_DAYS = 90;

const FINGERPRINT_CACHE_TTL_MS = 30_000;

export class SqliteVaultReviewDigestAdapter implements VaultReviewDigestDataPort {
	// Instance-scoped fingerprint cache. Pre-T9 this lived in a module
	// global inside VaultFingerprintService.ts; T9 moves it here so
	// `dispose()` (or simply dropping the adapter) clears the cache.
	private cachedFingerprint: VaultFingerprint | null = null;

	async getVaultFingerprint(force = false): Promise<VaultFingerprint | null> {
		if (!force && this.cachedFingerprint && Date.now() - this.cachedFingerprint.computedAt < FINGERPRINT_CACHE_TTL_MS) {
			return this.cachedFingerprint;
		}
		try {
			const db = sqliteStoreManager.getIndexContext('vault');
			const rows = await db
				.selectFrom('mobius_node')
				.select(['path', 'content_hash', 'word_count', 'mtime'])
				.where('path', 'is not', null)
				.execute();
			const lines: string[] = [];
			let totalWords = 0;
			let lastMtime = 0;
			for (const row of rows) {
				if (!row.path || !row.content_hash) continue;
				lines.push(`${row.path}:${row.content_hash}`);
				totalWords += row.word_count ?? 0;
				if (row.mtime && row.mtime > lastMtime) lastMtime = row.mtime;
			}
			lines.sort();
			const fingerprint: VaultFingerprint = {
				fingerprint: hashSHA256(lines.join('\n')),
				fileCount: lines.length,
				totalWordCount: totalWords,
				lastMaxMtime: lastMtime,
				computedAt: Date.now(),
			};
			this.cachedFingerprint = fingerprint;
			return fingerprint;
		} catch (err) {
			console.warn('[SqliteVaultReviewDigestAdapter] fingerprint failed', err);
			return null;
		}
	}

	async buildDigest(options: BuildVaultDigestOptions): Promise<VaultDigest | null> {
		const fingerprint = await this.getVaultFingerprint();
		if (!fingerprint) return null;

		const db = sqliteStoreManager.getIndexContext('vault');
		const structRepo = sqliteStoreManager.getStructuralAnalysisRepo();

		const docRows = await db
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

		const now = Date.now();
		const recentCutoff = now - RECENT_DAYS * 86_400_000;
		const dormantCutoff = now - DORMANT_DAYS * 86_400_000;
		const staleCutoff = now - STALE_HUB_DAYS * 86_400_000;

		const orphanPaths: string[] = [];
		const hubCandidates: VaultHubDigest[] = [];
		const staleHubCandidates: VaultHubDigest[] = [];
		let modifiedLast30 = 0;
		const tagCounts = new Map<string, number>();

		for (const row of docRows) {
			if (!row.path) continue;
			const incoming = row.doc_incoming_cnt ?? 0;
			const outgoing = row.doc_outgoing_cnt ?? 0;
			const otherIn = row.other_incoming_cnt ?? 0;
			const isOrphan = incoming === 0 && outgoing === 0;
			if (isOrphan) orphanPaths.push(row.path);

			const pagerank = row.pagerank ?? 0;
			if (pagerank > 0 && (incoming + otherIn) > 2) {
				const hubEntry: VaultHubDigest = {
					path: row.path,
					pagerank,
					incomingCount: incoming + otherIn,
					mtime: row.mtime ?? null,
					wordCount: row.word_count ?? null,
				};
				hubCandidates.push(hubEntry);
				if (row.mtime && row.mtime < staleCutoff) {
					staleHubCandidates.push(hubEntry);
				}
			}

			if (row.mtime && row.mtime >= recentCutoff) modifiedLast30++;

			if (row.tags_json) {
				try {
					const tags = JSON.parse(row.tags_json) as string[];
					for (const tag of tags) {
						tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
					}
				} catch {
					// tolerate bad JSON
				}
			}
		}

		hubCandidates.sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0));
		staleHubCandidates.sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0));

		const communityInfos = await structRepo.getCommunities();
		const clusters: VaultClusterDigest[] = communityInfos
			.slice()
			.sort((a, b) => b.memberCount - a.memberCount)
			.slice(0, TOP_K_CLUSTERS)
			.map(c => {
				const normalisedTopNodes: VaultClusterDigestTopNode[] = (c.topNodes ?? []).map((n: unknown) => {
					if (typeof n === 'string') return { path: n, label: n.split('/').pop()?.replace(/\.md$/, '') ?? n };
					const obj = n as { path?: string; label?: string; betweenness?: number };
					return {
						path: obj.path ?? '',
						label: obj.label ?? obj.path ?? '',
						betweenness: obj.betweenness,
					};
				}).filter(n => n.path);
				return {
					id: c.id,
					label: c.label,
					memberCount: c.memberCount,
					internalDensity: c.internalDensity,
					dominantTopics: c.dominantTopics,
					topNodes: normalisedTopNodes,
				};
			});

		const recentNodeIds = new Set(
			docRows.filter(r => r.mtime && r.mtime >= dormantCutoff).map(r => r.path),
		);
		const dormantClusters = clusters
			.filter(c => c.topNodes.length > 0 && c.topNodes.every(n => !recentNodeIds.has(n.path)))
			.map(c => c.label);

		const holes = await structRepo.getTopHoles(TOP_K_HOLES);
		const structuralHoles: VaultStructuralHoleDigest[] = holes.map(h => ({
			id: h.id,
			communityALabel: h.communityA.label,
			communityBLabel: h.communityB.label,
			gapType: h.gapType,
			gapScore: h.gapScore,
			semanticBridgePotential: h.semanticBridgePotential,
		}));

		const dangling: VaultDangling[] = [];
		try {
			const danglingRows = await db
				.selectFrom('mobius_edge' as never)
				.select((eb: any) => [eb.ref('target_label').as('target'), eb.fn.count('id').as('cnt')])
				.where('relation' as any, '=', 'wikilink')
				.where('target_node_id' as any, 'is', null)
				.groupBy('target_label' as any)
				.orderBy(eb => eb.fn.count('id') as any, 'desc')
				.limit(TOP_K_DANGLING)
				.execute() as Array<{ target: string; cnt: number }>;
			for (const r of danglingRows) {
				if (r.target) dangling.push({ target: r.target, referencedBy: Number(r.cnt) });
			}
		} catch {
			// schema mismatch — skip dangling for this digest run
		}

		let health: VaultDigest['health'] = null;
		try {
			const latest: LintScanResult | null = await options.vaultLintRuntime.loadLatestScan();
			if (latest) {
				health = {
					score: latest.healthScore,
					dimensions: latest.dimensionScores,
					signalCounts: latest.signalCounts as Record<string, number>,
				};
			}
		} catch (err) {
			console.debug('[SqliteVaultReviewDigestAdapter] lint snapshot unavailable', err);
		}

		const tags = [...tagCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, TOP_K_TAGS)
			.map(([tag, count]) => ({ tag, count }));

		return {
			fingerprint,
			counts: {
				notes: fingerprint.fileCount,
				words: fingerprint.totalWordCount,
				clusters: communityInfos.length,
				hubs: hubCandidates.length,
				orphans: orphanPaths.length,
				danglingRefs: dangling.length,
			},
			health,
			clusters,
			structuralHoles,
			hubs: hubCandidates.slice(0, TOP_K_HUBS),
			staleHubs: staleHubCandidates.slice(0, 10),
			orphans: orphanPaths.slice(0, TOP_K_ORPHANS),
			dangling,
			recentActivity: {
				createdLast30d: 0,
				modifiedLast30d: modifiedLast30,
				dormantClusters,
			},
			tags,
			computedAt: Date.now(),
		};
	}

	async listClusterMembers(communityId: string, limit = 15): Promise<ClusterMember[]> {
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
			console.warn('[SqliteVaultReviewDigestAdapter] listClusterMembers failed', err);
			return [];
		}
	}

	dispose(): void {
		this.cachedFingerprint = null;
	}
}
