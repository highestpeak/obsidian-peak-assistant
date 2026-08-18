// VaultDigestBuilder — service-layer owner of vault digest derivation
// (T11Y-4a extraction from `SqliteVaultReviewDigestAdapter`).
//
// Owns:
//   - Vault fingerprint algorithm (sorted `${path}:${contentHash}` lines,
//     SHA-256 hash) + the 30 s in-memory cache.
//   - Top-K constants (clusters, holes, hubs, orphans, dangling, tags).
//   - Recency / staleness / dormancy windows.
//   - Orphan / hub / stale-hub / dormant-cluster / tag derivation.
//   - Lint health merge (delegates to the `VaultLintRuntime` handed in).
//   - Final `VaultDigest` shaping.
//
// Constructor takes a `VaultReviewReadPort` (SQL boundary) plus a
// `VaultLintRuntime` (already wired by the lint composition). No
// Obsidian / sqlite / AppContext imports.
//
// The fingerprint cache is an instance field, not a module global, so
// disposing the builder (or hot-reloading the plugin) flushes it.

import type {
	VaultReviewReadPort,
} from '@/core/ports/VaultReviewReadPort';
import { hashSHA256 } from '@/core/utils/hash-utils';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { LintScanResult } from '@/service/lint/types';
import type {
	BuildVaultDigestOptions,
	ClusterMember,
	VaultClusterDigest,
	VaultClusterDigestTopNode,
	VaultDangling,
	VaultDigest,
	VaultHubDigest,
	VaultStructuralHoleDigest,
} from './VaultDigestService';
import type { VaultFingerprint } from './VaultFingerprintService';
import type {
	VaultReviewDigestDataPort,
} from './ports/VaultReviewPorts';

const TOP_K_CLUSTERS = 12;
const TOP_K_HOLES = 8;
const TOP_K_HUBS = 15;
const TOP_K_STALE_HUBS = 10;
const TOP_K_ORPHANS = 20;
const TOP_K_DANGLING = 20;
const TOP_K_TAGS = 25;
const STALE_HUB_DAYS = 180;
const RECENT_DAYS = 30;
const DORMANT_DAYS = 90;
const DAY_MS = 86_400_000;

const FINGERPRINT_CACHE_TTL_MS = 30_000;

/**
 * Provides "now()" so tests can pin time without monkey-patching
 * `Date.now`. Defaults to `() => Date.now()` in production composition.
 */
export interface VaultDigestClock {
	now(): number;
}

const REAL_CLOCK: VaultDigestClock = { now: () => Date.now() };

export class VaultDigestBuilder implements VaultReviewDigestDataPort {
	private cachedFingerprint: VaultFingerprint | null = null;

	constructor(
		private readonly reads: VaultReviewReadPort,
		private readonly lint: VaultLintRuntime,
		private readonly clock: VaultDigestClock = REAL_CLOCK,
	) {}

	async getVaultFingerprint(force = false): Promise<VaultFingerprint | null> {
		const now = this.clock.now();
		if (!force && this.cachedFingerprint && now - this.cachedFingerprint.computedAt < FINGERPRINT_CACHE_TTL_MS) {
			return this.cachedFingerprint;
		}
		try {
			const rows = await this.reads.listFingerprintRows();
			const lines: string[] = [];
			let totalWords = 0;
			let lastMtime = 0;
			for (const row of rows) {
				if (!row.path || !row.contentHash) continue;
				lines.push(`${row.path}:${row.contentHash}`);
				totalWords += row.wordCount ?? 0;
				if (row.mtime && row.mtime > lastMtime) lastMtime = row.mtime;
			}
			lines.sort();
			const fingerprint: VaultFingerprint = {
				fingerprint: hashSHA256(lines.join('\n')),
				fileCount: lines.length,
				totalWordCount: totalWords,
				lastMaxMtime: lastMtime,
				computedAt: now,
			};
			this.cachedFingerprint = fingerprint;
			return fingerprint;
		} catch (err) {
			console.warn('[VaultDigestBuilder] fingerprint failed', err);
			return null;
		}
	}

	async buildDigest(options: BuildVaultDigestOptions): Promise<VaultDigest | null> {
		// Honour the lint runtime the caller passes through, falling
		// back to the runtime bound at construction time. The session
		// layer threads `options.vaultLintRuntime` from `VaultReviewDeps`
		// — for builder-only callers (e.g. picker readiness) the bound
		// runtime is sufficient.
		const lintRuntime: VaultLintRuntime = options?.vaultLintRuntime ?? this.lint;

		const fingerprint = await this.getVaultFingerprint();
		if (!fingerprint) return null;

		const docRows = await this.reads.listNodeRowsForDigest();
		const communityInfos = await this.reads.listCommunities();
		const communityLinks = await this.reads.listCommunityLinks?.() ?? [];
		const holes = await this.reads.listTopStructuralHoles(TOP_K_HOLES);
		const danglingRows = await this.reads.listDanglingReferences(TOP_K_DANGLING);

		const now = this.clock.now();
		const recentCutoff = now - RECENT_DAYS * DAY_MS;
		const dormantCutoff = now - DORMANT_DAYS * DAY_MS;
		const staleCutoff = now - STALE_HUB_DAYS * DAY_MS;

		const orphanPaths: string[] = [];
		const hubCandidates: VaultHubDigest[] = [];
		const staleHubCandidates: VaultHubDigest[] = [];
		let modifiedLast30 = 0;
		const tagCounts = new Map<string, number>();

		for (const row of docRows) {
			if (!row.path) continue;
			const incoming = row.docIncomingCnt ?? 0;
			const outgoing = row.docOutgoingCnt ?? 0;
			const otherIn = row.otherIncomingCnt ?? 0;
			const isOrphan = incoming === 0 && outgoing === 0;
			if (isOrphan) orphanPaths.push(row.path);

			const pagerank = row.pagerank ?? 0;
			if (pagerank > 0 && (incoming + otherIn) > 2) {
				const hubEntry: VaultHubDigest = {
					path: row.path,
					pagerank,
					incomingCount: incoming + otherIn,
					mtime: row.mtime ?? null,
					wordCount: row.wordCount ?? null,
				};
				hubCandidates.push(hubEntry);
				if (row.mtime && row.mtime < staleCutoff) {
					staleHubCandidates.push(hubEntry);
				}
			}

			if (row.mtime && row.mtime >= recentCutoff) modifiedLast30++;

			if (row.tagsJson) {
				try {
					const tags = JSON.parse(row.tagsJson) as string[];
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

		const structuralHoles: VaultStructuralHoleDigest[] = holes.map(h => ({
			id: h.id,
			communityALabel: h.communityA.label,
			communityBLabel: h.communityB.label,
			gapType: h.gapType,
			gapScore: h.gapScore,
			semanticBridgePotential: h.semanticBridgePotential,
		}));

		const dangling: VaultDangling[] = danglingRows.map(r => ({
			target: r.target,
			referencedBy: r.referencedBy,
		}));

		let health: VaultDigest['health'] = null;
		try {
			const latest: LintScanResult | null = await lintRuntime.loadLatestScan();
			if (latest) {
				health = {
					score: latest.healthScore,
					dimensions: latest.dimensionScores,
					signalCounts: latest.signalCounts as Record<string, number>,
				};
			}
		} catch (err) {
			console.debug('[VaultDigestBuilder] lint snapshot unavailable', err);
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
			...(communityLinks.length > 0 ? { communityLinks } : {}),
			structuralHoles,
			hubs: hubCandidates.slice(0, TOP_K_HUBS),
			staleHubs: staleHubCandidates.slice(0, TOP_K_STALE_HUBS),
			orphans: orphanPaths.slice(0, TOP_K_ORPHANS),
			dangling,
			recentActivity: {
				createdLast30d: 0,
				modifiedLast30d: modifiedLast30,
				dormantClusters,
			},
			tags,
			computedAt: now,
		};
	}

	async listClusterMembers(communityId: string, limit = 15): Promise<ClusterMember[]> {
		const rows = await this.reads.listClusterMembers(communityId, limit);
		return rows.map(r => ({
			path: r.path,
			title: r.title,
			wordCount: r.wordCount,
			pagerank: r.pagerank,
			mtime: r.mtime,
			incomingCount: r.incomingCount,
		}));
	}

	dispose(): void {
		this.cachedFingerprint = null;
	}
}
