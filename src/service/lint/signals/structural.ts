// T7: structural detectors no longer reach `AppContext`,
// `sqliteStoreManager`, or the graph inspector helper. All graph and
// metadata access goes through `context.detectorContext` (the
// `VaultLintDetectorContextPort`).
//
// The narrow port projects raw Obsidian `metadataCache.unresolvedLinks`,
// sqlite `MobiusEdgeRepo.getHardOrphans` / `MobiusNodeRepo.getByIds`,
// `getSemanticNeighbors`, and `isIndexedNoteNodeType` into plain shapes
// detectors can fake. The orphan/broken-link algorithms are
// behaviorally identical to T6R; only the dependency surface changed.

import { createHash } from 'crypto';
import type { LintSignalDetector, LintScanContext, LintFinding, OrphanMetadata, BrokenLinkMetadata, VaultLintConfig } from '../types';
import { ORPHAN_FETCH_LIMIT } from '@/core/constant';

const SOFT_ORPHAN_FETCH_LIMIT = 5_000;

export function buildStructuralDetectors(config: VaultLintConfig): LintSignalDetector[] {
	return [
		buildSoftOrphanDetector(config.thresholds.softOrphanMaxDegree),
		buildMissingBacklinkDetector(config.thresholds.missingBacklinkMinSimilarity),
	];
}

const MISSING_BACKLINK_FETCH_LIMIT = 5_000;
const MISSING_BACKLINK_NEIGHBOR_LIMIT = 5;

/**
 * `S-MISSING-BACKLINK` — surface pairs where two notes are semantically
 * close (similarity ≥ `missingBacklinkMinSimilarity`) but neither
 * wiki-links to the other. Rule-based; no LLM.
 *
 * Ranks the missing side on the anchor (lex-smaller) so the pair
 * collapses to one finding per (a, b) group.
 */
function buildMissingBacklinkDetector(minSimilarity: number): LintSignalDetector {
	return {
		id: 'S-MISSING-BACKLINK',
		dimension: 'structural',
		severity: 'info',
		signalWeight: 0.15,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			const dc = context.detectorContext;
			const rows = await dc.listDocDegrees(MISSING_BACKLINK_FETCH_LIMIT);
			if (rows.length === 0) return [];

			const resolved = dc.getResolvedLinks();
			const nodeIdToPath = new Map<string, string>();
			const pathToNodeId = new Map<string, string>();
			for (const row of rows) {
				if (row.filePath) {
					nodeIdToPath.set(row.nodeId, row.filePath);
					pathToNodeId.set(row.filePath, row.nodeId);
				}
			}

			const linksBetween = (a: string, b: string): boolean => {
				const outA = resolved[a];
				if (outA && outA[b] && outA[b] > 0) return true;
				const outB = resolved[b];
				if (outB && outB[a] && outB[a] > 0) return true;
				return false;
			};

			const seenPairs = new Set<string>();
			const findings: LintFinding[] = [];
			for (const row of rows) {
				let neighbors: Awaited<ReturnType<typeof dc.getSemanticNeighbors>>;
				try {
					neighbors = await dc.getSemanticNeighbors(row.nodeId, MISSING_BACKLINK_NEIGHBOR_LIMIT, new Set());
				} catch {
					continue;
				}
				const rowPath = row.filePath;
				if (!rowPath) continue;
				for (const n of neighbors) {
					if (n.id === row.nodeId) continue;
					const simPct = parseFloat(n.similarity);
					if (!Number.isFinite(simPct)) continue;
					const sim = simPct / 100;
					if (sim < minSimilarity) continue;

					const otherPath = nodeIdToPath.get(n.id);
					if (!otherPath) continue;
					if (linksBetween(rowPath, otherPath)) continue;

					const [a, b] = [rowPath, otherPath].sort();
					const pairKey = `${a}::${b}`;
					if (seenPairs.has(pairKey)) continue;
					seenPairs.add(pairKey);

					const dismissalKey = `S-MISSING-BACKLINK:${a}`;
					if (context.dismissals.has(dismissalKey)) continue;

					findings.push({
						id: findingId('scan', 'S-MISSING-BACKLINK', pairKey),
						signalId: 'S-MISSING-BACKLINK',
						severity: 'info',
						filePath: a,
						title: `Missing wiki-link: ${fileName(a)} ↔ ${fileName(b)}`,
						description: `Semantic similarity ${(sim * 100).toFixed(1)}% (≥ ${(minSimilarity * 100).toFixed(0)}%) but the two notes don't reference each other. Adding a wiki-link makes the connection explicit.`,
						fixActions: ['insert-backlink', 'suggest-links'],
						metadata: {
							similarity: sim,
							threshold: minSimilarity,
							partner: b,
						},
						status: 'open',
					});
				}
			}
			return findings;
		},
	};
}

function buildSoftOrphanDetector(maxDegree: number): LintSignalDetector {
	return {
		id: 'S-SOFT-ORPHAN',
		dimension: 'structural',
		severity: 'info',
		signalWeight: 0.20,
		requiresLlm: false,

		async detect(context: LintScanContext): Promise<LintFinding[]> {
			const dc = context.detectorContext;
			const rows = await dc.listDocDegrees(SOFT_ORPHAN_FETCH_LIMIT);
			const findings: LintFinding[] = [];
			for (const row of rows) {
				const degree = row.incoming + row.outgoing;
				// Hard orphans (degree === 0) are already surfaced by
				// `S-ORPHAN`; skip so users don't see both.
				if (degree === 0) continue;
				if (degree > maxDegree) continue;
				const key = row.filePath ?? row.nodeId;
				const dismissalKey = `S-SOFT-ORPHAN:${key}`;
				if (context.dismissals.has(dismissalKey)) continue;
				findings.push({
					id: findingId('scan', 'S-SOFT-ORPHAN', key),
					signalId: 'S-SOFT-ORPHAN',
					severity: 'info',
					filePath: row.filePath,
					title: `Weakly connected: ${row.label || row.nodeId}`,
					description: `Note has only ${degree} link${degree === 1 ? '' : 's'} (threshold ${maxDegree}). Consider adding more inbound/outbound links.`,
					fixActions: ['suggest-links', 'strengthen-connections'],
					metadata: {
						nodeId: row.nodeId,
						incoming: row.incoming,
						outgoing: row.outgoing,
						threshold: maxDegree,
					},
					status: 'open',
				});
			}
			return findings;
		},
	};
}

function findingId(scanSeed: string, signalId: string, filePath: string | null): string {
	return createHash('sha256').update(`${scanSeed}:${signalId}:${filePath ?? ''}`).digest('hex').slice(0, 32);
}

function fileName(path: string): string {
	return path.split('/').pop() ?? path;
}

function summarizeBrokenTargets(targets: string[]): string {
	const sample = targets.slice(0, 5).map((target) => `[[${target}]]`).join(', ');
	const remaining = targets.length - 5;
	if (remaining <= 0) return sample;
	return `${sample}, and ${remaining} more`;
}

export function buildBrokenLinkFindings(
	unresolvedLinks: Record<string, Record<string, number>>,
	dismissals: Map<string, unknown>,
): LintFinding[] {
	const findings: LintFinding[] = [];

	for (const [sourcePath, targets] of Object.entries(unresolvedLinks)) {
		const brokenEntries = Object.entries(targets).filter(([target]) => target.trim().length > 0);
		if (brokenEntries.length === 0) continue;

		const dismissalKey = `S-BROKEN-LINK:${sourcePath}`;
		if (dismissals.has(dismissalKey)) continue;

		const brokenTargets = brokenEntries.map(([target]) => target);
		const occurrenceCount = brokenEntries.reduce((sum, [, count]) => sum + Math.max(1, count), 0);
		const targetText = brokenTargets.length === 1 ? 'link target' : 'link targets';
		const occurrenceText = occurrenceCount === 1 ? 'occurrence' : 'occurrences';
		const meta: BrokenLinkMetadata = {
			sourcePath,
			brokenTargets,
			brokenTargetCount: brokenTargets.length,
			brokenOccurrenceCount: occurrenceCount,
		};

		findings.push({
			id: findingId('scan', 'S-BROKEN-LINK', sourcePath),
			signalId: 'S-BROKEN-LINK',
			severity: 'error',
			filePath: sourcePath,
			title: `${brokenTargets.length} broken ${targetText} in ${fileName(sourcePath)}`,
			description: `${occurrenceCount} unresolved ${occurrenceText}: ${summarizeBrokenTargets(brokenTargets)}`,
			fixActions: ['redirect-link', 'create-note', 'remove-link'],
			metadata: meta as unknown as Record<string, unknown>,
			status: 'open',
		});
	}

	return findings;
}

export const orphanDetector: LintSignalDetector = {
	id: 'S-ORPHAN',
	dimension: 'structural',
	severity: 'warning',
	signalWeight: 0.30,
	requiresLlm: false,

	async detect(context: LintScanContext): Promise<LintFinding[]> {
		const dc = context.detectorContext;

		const orphanIds = await dc.getHardOrphans(ORPHAN_FETCH_LIMIT);
		if (orphanIds.length === 0) return [];

		const nodeMap = await dc.getNodesByIds(orphanIds);
		const orphanIdSet = new Set(orphanIds);

		const findings: LintFinding[] = [];

		for (const nodeId of orphanIds) {
			const node = nodeMap.get(nodeId);
			if (!node) continue;

			const attrs = node.attributes ? JSON.parse(node.attributes) : {};
			const filePath: string | null = attrs?.path ?? null;

			const dismissalKey = `S-ORPHAN:${filePath ?? nodeId}`;
			if (context.dismissals.has(dismissalKey)) continue;

			let revivalSuggestion: OrphanMetadata['revivalSuggestion'] | undefined;
			if (dc.isIndexedNoteNodeType(node.type)) {
				try {
					const neighbors = await dc.getSemanticNeighbors(nodeId, 5, orphanIdSet);
					const best = neighbors.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))[0];
					if (best) {
						const bestAttrs = best.attributes ? JSON.parse(best.attributes) : {};
						revivalSuggestion = {
							targetPath: bestAttrs?.path ?? best.id,
							targetTitle: best.label,
							similarity: parseFloat(best.similarity),
							reason: `Semantic similarity ${best.similarity}`,
						};
					}
				} catch {
					// Vector search may not be available
				}
			}

			const meta: OrphanMetadata = { orphanType: 'hard', edgeCount: 0, revivalSuggestion };

			findings.push({
				id: findingId('scan', 'S-ORPHAN', filePath ?? nodeId),
				signalId: 'S-ORPHAN',
				severity: 'warning',
				filePath,
				title: `Orphan note: ${node.label}`,
				description: 'This note has no inbound or outbound links and is unreachable from the knowledge graph.',
				fixActions: ['suggest-links', 'delete-note'],
				metadata: meta as unknown as Record<string, unknown>,
				status: 'open',
			});
		}

		return findings;
	},
};

export const brokenLinkDetector: LintSignalDetector = {
	id: 'S-BROKEN-LINK',
	dimension: 'structural',
	severity: 'error',
	signalWeight: 0.25,
	requiresLlm: false,

	async detect(context: LintScanContext): Promise<LintFinding[]> {
		const unresolvedLinks = context.detectorContext.getUnresolvedLinks();
		return buildBrokenLinkFindings(unresolvedLinks, context.dismissals);
	},
};
