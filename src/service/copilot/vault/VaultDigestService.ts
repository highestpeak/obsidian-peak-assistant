/**
 * VaultDigestService — pre-flight aggregation for Vault Auto Review.
 *
 * Produces a compact (~1-2 KB) structured snapshot of the vault that the
 * meta-agent consumes as its system-prompt context. NO LLM calls.
 *
 * Sources of truth (all already implemented elsewhere):
 *  - mobius_node table          → file count / word count / mtime / orphans / hubs
 *  - community_metadata table   → clusters (Louvain output)
 *  - structural_holes table     → structural-hole candidates
 *  - VaultLintService           → 5-dim health signals (cached scan)
 *  - VaultFingerprintService    → fingerprint + delta vs last review
 *
 * See docs/superpowers/specs/2026-05-20-vault-auto-review-design.md §5, §14.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { VaultLintService } from '@/service/lint/VaultLintService';
import type { LintScanResult, LintDimension } from '@/service/lint/types';
import { getVaultFingerprint, type VaultFingerprint } from './VaultFingerprintService';

export interface VaultClusterDigestTopNode {
	path: string;
	label: string;
	betweenness?: number;
}

export interface VaultClusterDigest {
	id: string;
	label: string;
	memberCount: number;
	internalDensity: number;
	dominantTopics: string[];
	/**
	 * Top representative nodes for this cluster. Stored as objects (path + label
	 * + betweenness) per `community_metadata.top_nodes_json`.
	 */
	topNodes: VaultClusterDigestTopNode[];
}

export interface VaultStructuralHoleDigest {
	id: string;
	communityALabel: string;
	communityBLabel: string;
	gapType: string;
	gapScore: number;
	semanticBridgePotential: number;
}

export interface VaultHubDigest {
	path: string;
	pagerank: number | null;
	incomingCount: number | null;
	mtime: number | null;
	wordCount: number | null;
}

export interface VaultDangling {
	target: string;
	referencedBy: number;
}

export interface VaultRecentActivity {
	createdLast30d: number;
	modifiedLast30d: number;
	dormantClusters: string[]; // cluster labels with no activity in 90d
}

export interface VaultDigest {
	fingerprint: VaultFingerprint;
	counts: {
		notes: number;
		words: number;
		clusters: number;
		hubs: number;
		orphans: number;
		danglingRefs: number;
	};
	health: {
		score: number;
		dimensions: Partial<Record<LintDimension, number>>;
		signalCounts: Record<string, number>;
	} | null;
	clusters: VaultClusterDigest[];
	structuralHoles: VaultStructuralHoleDigest[];
	hubs: VaultHubDigest[];
	staleHubs: VaultHubDigest[];
	orphans: string[]; // top-N orphan paths (truncated)
	dangling: VaultDangling[];
	recentActivity: VaultRecentActivity;
	tags: Array<{ tag: string; count: number }>;
	computedAt: number;
}

export interface ClusterMember {
	path: string;
	title: string | null;
	wordCount: number | null;
	pagerank: number | null;
	mtime: number | null;
	incomingCount: number | null;
}

/**
 * Top-N members of a community, ordered by PageRank descending. Used to drill
 * into a cluster from the Clusters tab.
 */
export async function listClusterMembers(communityId: string, limit = 15): Promise<ClusterMember[]> {
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
		console.warn('[listClusterMembers] failed', err);
		return [];
	}
}

const TOP_K_CLUSTERS = 12;
const TOP_K_HOLES = 8;
const TOP_K_HUBS = 15;
const TOP_K_ORPHANS = 20;
const TOP_K_DANGLING = 20;
const TOP_K_TAGS = 25;
const STALE_HUB_DAYS = 180;
const RECENT_DAYS = 30;
const DORMANT_DAYS = 90;

export async function buildVaultDigest(): Promise<VaultDigest | null> {
	const fingerprint = await getVaultFingerprint();
	if (!fingerprint) return null;

	const db = sqliteStoreManager.getIndexContext('vault');
	const structRepo = sqliteStoreManager.getStructuralAnalysisRepo();

	// ─── Counts & top docs in one mobius_node sweep ───────────────────────
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

	// ─── Clusters from community_metadata ─────────────────────────────────
	const communityInfos = await structRepo.getCommunities();
	const clusters: VaultClusterDigest[] = communityInfos
		.slice()
		.sort((a, b) => b.memberCount - a.memberCount)
		.slice(0, TOP_K_CLUSTERS)
		.map(c => {
			// Normalise topNodes: tolerate string[] (older shape) AND object[].
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

	// Dormant clusters: any cluster with no top node touched in last 90d.
	// Approximated by checking if any of its topNodes (treated as paths) maps
	// to a recently-modified doc. Cheap heuristic; refined later.
	const recentNodeIds = new Set(
		docRows.filter(r => r.mtime && r.mtime >= dormantCutoff).map(r => r.path),
	);
	const dormantClusters = clusters
		.filter(c => c.topNodes.length > 0 && c.topNodes.every(n => !recentNodeIds.has(n.path)))
		.map(c => c.label);

	// ─── Structural holes ─────────────────────────────────────────────────
	const holes = await structRepo.getTopHoles(TOP_K_HOLES);
	const structuralHoles: VaultStructuralHoleDigest[] = holes.map(h => ({
		id: h.id,
		communityALabel: h.communityA.label,
		communityBLabel: h.communityB.label,
		gapType: h.gapType,
		gapScore: h.gapScore,
		semanticBridgePotential: h.semanticBridgePotential,
	}));

	// ─── Dangling references ──────────────────────────────────────────────
	// Outgoing edges with no resolved target node. Cheap proxy: edges of kind
	// 'wikilink' where target_node_id is null. Schema may differ; we wrap in
	// try/catch so the digest doesn't fail if the column shape evolves.
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

	// ─── Lint health snapshot (read latest scan, don't trigger new one) ───
	let health: VaultDigest['health'] = null;
	try {
		// Initialize registry so the cached scan can be deserialized correctly
		VaultLintService.getInstance().initRegistry();
		const lintRepo = sqliteStoreManager.getVaultLintRepo();
		const latest: LintScanResult | null = await lintRepo.loadLatestScan();
		if (latest) {
			health = {
				score: latest.healthScore,
				dimensions: latest.dimensionScores,
				signalCounts: latest.signalCounts as Record<string, number>,
			};
		}
	} catch (err) {
		console.debug('[VaultDigestService] lint snapshot unavailable', err);
	}

	// ─── Tags ─────────────────────────────────────────────────────────────
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
			createdLast30d: 0, // ctime not reliable across loaders; left for Phase 2
			modifiedLast30d: modifiedLast30,
			dormantClusters,
		},
		tags,
		computedAt: Date.now(),
	};
}

/**
 * Format a VaultDigest as a compact human-readable block suitable for
 * inclusion in an agent system prompt. Mirrors `formatSignalReportForPrompt`.
 */
export function formatVaultDigestForPrompt(digest: VaultDigest): string {
	const lines: string[] = [];
	lines.push(`Vault notes: ${digest.counts.notes}`);
	lines.push(`Total words: ${digest.counts.words}`);
	lines.push(`Clusters: ${digest.counts.clusters} · Hubs: ${digest.counts.hubs} · Orphans: ${digest.counts.orphans} · Dangling: ${digest.counts.danglingRefs}`);
	if (digest.health) {
		lines.push(`Health score: ${digest.health.score.toFixed(1)} / 10`);
		const dims = Object.entries(digest.health.dimensions)
			.map(([d, s]) => `${d}=${(s ?? 0).toFixed(1)}`).join(' · ');
		if (dims) lines.push(`Health dimensions: ${dims}`);
	}
	if (digest.clusters.length > 0) {
		lines.push('');
		lines.push('Top clusters (Louvain):');
		for (const c of digest.clusters) {
			const topics = c.dominantTopics.slice(0, 5).join(', ');
			lines.push(`  - ${c.label} · ${c.memberCount} notes · density ${c.internalDensity.toFixed(2)}${topics ? ` · topics: ${topics}` : ''}`);
		}
	}
	if (digest.structuralHoles.length > 0) {
		lines.push('');
		lines.push('Structural holes (top candidates):');
		for (const h of digest.structuralHoles) {
			lines.push(`  - ${h.communityALabel} ↔ ${h.communityBLabel} · gap ${h.gapScore.toFixed(2)} · bridge potential ${h.semanticBridgePotential.toFixed(2)}`);
		}
	}
	if (digest.hubs.length > 0) {
		lines.push('');
		lines.push('Hub notes (top by PageRank):');
		for (const h of digest.hubs.slice(0, 8)) {
			lines.push(`  - ${h.path} · in=${h.incomingCount ?? 0}${h.wordCount ? ` · ${h.wordCount} words` : ''}`);
		}
	}
	if (digest.staleHubs.length > 0) {
		lines.push('');
		lines.push('Stale hubs (unedited 180d+):');
		for (const h of digest.staleHubs.slice(0, 5)) {
			lines.push(`  - ${h.path}`);
		}
	}
	if (digest.dangling.length > 0) {
		lines.push('');
		lines.push('Dangling references (top):');
		for (const d of digest.dangling.slice(0, 10)) {
			lines.push(`  - [[${d.target}]] referenced by ${d.referencedBy} notes`);
		}
	}
	if (digest.recentActivity.dormantClusters.length > 0) {
		lines.push('');
		lines.push(`Dormant clusters (no activity 90d+): ${digest.recentActivity.dormantClusters.join(', ')}`);
	}
	lines.push('');
	lines.push(`Modified in last 30 days: ${digest.recentActivity.modifiedLast30d} notes`);
	if (digest.tags.length > 0) {
		lines.push(`Top tags: ${digest.tags.slice(0, 10).map(t => `#${t.tag}(${t.count})`).join(' ')}`);
	}
	return lines.join('\n');
}
