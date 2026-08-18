/**
 * VaultDigestService — pure types + prompt formatter for the Vault Auto
 * Review digest.
 *
 * Pre-T9 this file also owned the SQLite queries (`sqliteStoreManager`)
 * that materialised the digest and the cluster drill-down. T9 moves
 * those queries into `SqliteVaultReviewDigestAdapter` behind the
 * `VaultReviewDigestDataPort`. The service file now exports types,
 * options, and the human-readable prompt formatter only.
 *
 * Original source-of-truth lists for the digest signals:
 *  - mobius_node table          → file count / word count / mtime / orphans / hubs
 *  - community_metadata table   → clusters (Louvain output)
 *  - structural_holes table     → structural-hole candidates
 *  - VaultLintService           → 5-dim health signals (cached scan)
 *  - VaultFingerprintService    → fingerprint + delta vs last review
 *
 * See docs/superpowers/specs/2026-05-20-vault-auto-review-design.md §5, §14.
 */

import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { LintDimension } from '@/service/lint/types';
import type { VaultFingerprint } from './VaultFingerprintService';

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

/** A real indexed reference crossing two computed communities. */
export interface VaultCommunityLinkDigest {
	communityAId: string;
	communityBId: string;
	referenceCount: number;
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
	communityLinks?: VaultCommunityLinkDigest[];
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
 * Options for the digest port's `buildDigest`. `vaultLintRuntime` is
 * supplied by the composition (`composeVaultReviewRuntime`) which
 * resolves it from `AppContext.getVaultLintRuntime()`. Service-side
 * orchestration just forwards the value through ports.
 */
export interface BuildVaultDigestOptions {
	vaultLintRuntime: VaultLintRuntime;
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
