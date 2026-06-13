/**
 * Vault Health Report — pure markdown build / parse / metadata helpers.
 *
 * Pre-T9, this file also owned the `VaultReviewReportService` class
 * (which used `App`, `Notice`, `TFile`, `TFolder`) and a lazy
 * `_singleton`. T9 moves all Obsidian-touching code into
 * `src/app/copilot/vault/ObsidianVaultReviewReportAdapter.ts`. This
 * file is now pure: types + constants + format helpers. UI / runtime
 * callers reach the report port through `VaultReviewRuntime`.
 *
 * Each completed (or cancelled) vault review writes ONE markdown file at
 *   `peak-system/vault-reviews/<ISO-date>-<short-hash>.md`
 *
 * Format: frontmatter metadata + human-readable summary + JSON-fence snapshot.
 * The snapshot lets the modal re-open a historical review read-only.
 */

import type { VaultReviewSessionSnapshot } from './VaultReviewSession';

export const VAULT_REVIEW_FOLDER = 'peak-system/vault-reviews';
export const SNAPSHOT_FENCE_TAG = 'peak-vault-review-data';

export interface VaultReviewHistoryRecord {
	id: string;
	storagePath: string;
	mode: 'fast' | 'complete';
	startedAt: number;
	completedAt: number;
	status: string;
	headline?: string;
	noteCount: number;
	wordCount: number;
	clusterCount: number;
	insightCount: number;
	gapCount: number;
	actionCount: number;
	sourceCount: number;
	roundCount: number;
	turnCount: number;
	fingerprint: string;
}

export function sanitizeForFileName(s: string): string {
	return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function isoTimestamp(ms: number): string {
	return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

export function uniqueId(ts: number): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${ts.toString(36)}-${r}`;
}

function escapeFrontmatter(value: string): string {
	if (/[:\n"#&*?<>|%@`{}[\],]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
		return JSON.stringify(value);
	}
	return value;
}

export function computeVaultReviewHeadline(snapshot: VaultReviewSessionSnapshot): string | undefined {
	const trim = (s: string): string => {
		const t = s.trim().replace(/\s+/g, ' ');
		return t.length > 100 ? `${t.slice(0, 97)}…` : t;
	};
	const lastSub = snapshot.collectorSnapshot.submissions[snapshot.collectorSnapshot.submissions.length - 1];
	if (lastSub?.summary) {
		const first = lastSub.summary.split(/[。\.\n]/)[0];
		if (first.trim()) return trim(first);
	}
	const firstInsight = snapshot.collectorSnapshot.insights[0];
	if (firstInsight?.title) return trim(firstInsight.title);
	const firstCluster = snapshot.collectorSnapshot.clusterObservations[0];
	if (firstCluster?.headline) return trim(firstCluster.headline);
	return undefined;
}

export function summaryStats(snapshot: VaultReviewSessionSnapshot) {
	const insightCount = snapshot.collectorSnapshot.insights.length;
	const sourceCount = snapshot.collectorSnapshot.sources.length;
	const clusterCount = snapshot.collectorSnapshot.clusterObservations.length;
	const gapCount = snapshot.collectorSnapshot.gaps.length;
	const actionCount = snapshot.collectorSnapshot.actions.length;
	const roundCount = snapshot.rounds.length;
	const turnCount = snapshot.rounds.reduce((s, r) => s + r.turnCount, 0);
	const startedAt = snapshot.rounds[0]?.startedAt ?? Date.now();
	const completedAt = snapshot.rounds[snapshot.rounds.length - 1]?.endedAt ?? Date.now();
	return { insightCount, sourceCount, clusterCount, gapCount, actionCount, roundCount, turnCount, startedAt, completedAt };
}

function statusEmoji(status: string): string {
	switch (status) {
		case 'growing': return '▲';
		case 'dying': return '💤';
		case 'central': return '🔥';
		case 'fragmenting': return '⚠️';
		default: return '·';
	}
}

export function buildVaultReviewMarkdown(
	record: VaultReviewHistoryRecord,
	snapshot: VaultReviewSessionSnapshot,
): string {
	const digest = snapshot.digest;
	const lines: string[] = [];

	lines.push('---');
	lines.push('type: peak-vault-review');
	lines.push('version: 1');
	lines.push(`id: ${escapeFrontmatter(record.id)}`);
	lines.push(`mode: ${record.mode}`);
	lines.push(`status: ${escapeFrontmatter(record.status)}`);
	if (record.headline) lines.push(`headline: ${escapeFrontmatter(record.headline)}`);
	lines.push(`startedAt: ${escapeFrontmatter(new Date(record.startedAt).toISOString())}`);
	lines.push(`completedAt: ${escapeFrontmatter(new Date(record.completedAt).toISOString())}`);
	lines.push(`fingerprint: ${escapeFrontmatter(record.fingerprint)}`);
	lines.push(`noteCount: ${record.noteCount}`);
	lines.push(`wordCount: ${record.wordCount}`);
	lines.push(`clusterCount: ${record.clusterCount}`);
	lines.push(`insightCount: ${record.insightCount}`);
	lines.push(`gapCount: ${record.gapCount}`);
	lines.push(`actionCount: ${record.actionCount}`);
	lines.push(`sourceCount: ${record.sourceCount}`);
	lines.push(`roundCount: ${record.roundCount}`);
	lines.push(`turnCount: ${record.turnCount}`);
	lines.push('---');
	lines.push('');

	const dateLabel = new Date(record.completedAt).toLocaleDateString();
	lines.push(`# Vault Review · ${dateLabel}`);
	lines.push('');
	if (record.headline) {
		lines.push(`**${record.headline}**`);
		lines.push('');
	}

	lines.push('## Snapshot');
	lines.push('');
	lines.push(`- **${record.noteCount.toLocaleString()} notes** · ${record.wordCount.toLocaleString()} words`);
	if (digest?.counts) {
		lines.push(`- **${digest.counts.clusters} clusters** · ${digest.counts.hubs} hubs · ${digest.counts.orphans} orphans · ${digest.counts.danglingRefs} dangling refs`);
	}
	if (digest?.health) {
		lines.push(`- Health score: **${digest.health.score.toFixed(1)} / 10**`);
	}
	if (digest?.recentActivity) {
		lines.push(`- Last 30 days: ${digest.recentActivity.modifiedLast30d} modified notes`);
		if (digest.recentActivity.dormantClusters.length > 0) {
			lines.push(`- Dormant clusters: ${digest.recentActivity.dormantClusters.join(', ')}`);
		}
	}
	lines.push('');

	if (digest && digest.clusters.length > 0) {
		lines.push('## Cluster Activity');
		lines.push('');
		lines.push('| Cluster | Members | Topics | Status |');
		lines.push('|---|---|---|---|');
		const obsByCluster = new Map(
			snapshot.collectorSnapshot.clusterObservations.map(o => [o.clusterId, o]),
		);
		for (const c of digest.clusters.slice(0, 10)) {
			const obs = obsByCluster.get(c.id);
			const status = obs ? `${statusEmoji(obs.status)} ${obs.status}` : 'stable';
			const topics = c.dominantTopics.slice(0, 3).join(', ');
			lines.push(`| ${c.label} | ${c.memberCount} | ${topics || '—'} | ${status} |`);
		}
		lines.push('');
	}

	const insights = snapshot.collectorSnapshot.insights;
	if (insights.length > 0) {
		lines.push('## Insights');
		lines.push('');
		for (const ins of insights) {
			lines.push(`### ${ins.title}`);
			lines.push('');
			lines.push(ins.body);
			lines.push('');
		}
	}

	const clusterObs = snapshot.collectorSnapshot.clusterObservations;
	if (clusterObs.length > 0) {
		lines.push('## Cluster Observations');
		lines.push('');
		for (const c of clusterObs) {
			lines.push(`### ${c.clusterLabel} — ${statusEmoji(c.status)} ${c.status}`);
			lines.push('');
			lines.push(`**${c.headline}**`);
			lines.push('');
			lines.push(c.body);
			if (c.representativeNotes.length > 0) {
				lines.push('');
				lines.push(`Representative notes: ${c.representativeNotes.map(n => `[[${n}]]`).join(', ')}`);
			}
			lines.push('');
		}
	}

	const gaps = snapshot.collectorSnapshot.gaps;
	if (gaps.length > 0) {
		lines.push('## Gaps');
		lines.push('');
		const byKind = new Map<string, typeof gaps>();
		for (const g of gaps) {
			const arr = byKind.get(g.kind) ?? [];
			arr.push(g);
			byKind.set(g.kind, arr);
		}
		const kindOrder = ['structural-hole', 'dangling-reference', 'stale-hub', 'abstraction-mismatch'] as const;
		const kindLabel: Record<string, string> = {
			'structural-hole': 'Structural Holes',
			'dangling-reference': 'Dangling References',
			'stale-hub': 'Stale Hubs',
			'abstraction-mismatch': 'Abstraction Mismatches',
		};
		for (const kind of kindOrder) {
			const arr = byKind.get(kind);
			if (!arr || arr.length === 0) continue;
			lines.push(`### ${kindLabel[kind]}`);
			lines.push('');
			for (const g of arr) {
				lines.push(`**${g.title}** (confidence: ${g.confidence})`);
				lines.push('');
				lines.push(g.body);
				if (g.references.length > 0) {
					lines.push('');
					lines.push(`References: ${g.references.map(r => r.startsWith('[[') ? r : `[[${r}]]`).join(', ')}`);
				}
				lines.push('');
			}
		}
	}

	const actions = snapshot.collectorSnapshot.actions;
	if (actions.length > 0) {
		lines.push('## Recommended Actions');
		lines.push('');
		const sortedActions = actions.slice().sort((a, b) => {
			const pri = { high: 0, medium: 1, low: 2 };
			return pri[a.priority] - pri[b.priority];
		});
		for (const a of sortedActions) {
			const involved = a.involvedNotes.length > 0
				? ` · involves ${a.involvedNotes.length} note${a.involvedNotes.length === 1 ? '' : 's'}`
				: '';
			lines.push(`- **[${a.priority.toUpperCase()}] ${a.title}** (${a.kind})${involved}`);
			lines.push(`  - ${a.rationale}`);
			if (a.estimatedImpact) lines.push(`  - Impact: ${a.estimatedImpact}`);
			if (a.involvedNotes.length > 0) {
				lines.push(`  - Notes: ${a.involvedNotes.map(n => `[[${n}]]`).join(', ')}`);
			}
		}
		lines.push('');
	}

	const sources = snapshot.collectorSnapshot.sources;
	if (sources.length > 0) {
		lines.push('## Sources');
		lines.push('');
		for (const s of sources) {
			lines.push(`- [[${s.path}]] — ${s.relevance}`);
		}
		lines.push('');
	}

	lines.push('## Snapshot Data');
	lines.push('');
	lines.push('```json ' + SNAPSHOT_FENCE_TAG);
	lines.push(JSON.stringify({
		mode: snapshot.mode,
		digest: snapshot.digest,
		rounds: snapshot.rounds.map(r => ({
			roundIndex: r.roundIndex,
			startedAt: r.startedAt,
			endedAt: r.endedAt,
			turnCount: r.turnCount,
			events: r.events,
			submission: r.submission,
			maxTurns: r.maxTurns,
			maxTurnsReached: r.maxTurnsReached ?? false,
		})),
		collectorSnapshot: snapshot.collectorSnapshot,
		status: snapshot.status,
		error: snapshot.error,
		currentRoundIndex: snapshot.currentRoundIndex,
	}, null, 2));
	lines.push('```');
	lines.push('');

	return lines.join('\n');
}

export function parseVaultReviewFenceJson<T>(markdown: string, tag: string): T | null {
	const fenceRegex = new RegExp('```json\\s+' + tag + '\\s*\\n([\\s\\S]*?)\\n```', 'm');
	const match = markdown.match(fenceRegex);
	if (!match) return null;
	try {
		return JSON.parse(match[1]) as T;
	} catch (err) {
		console.warn('[VaultReviewReportService] failed to parse ' + tag + ' JSON', err);
		return null;
	}
}
