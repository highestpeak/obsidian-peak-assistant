import { createHash } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getSemanticNeighbors } from '@/service/tools/search-graph-inspector/common';
import { isIndexedNoteNodeType } from '@/core/po/graph.po';
import type { LintSignalDetector, LintScanContext, LintFinding, OrphanMetadata, BrokenLinkMetadata } from '../types';
import { ORPHAN_FETCH_LIMIT } from '@/core/constant';

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
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();

		const orphanIds = await mobiusEdgeRepo.getHardOrphans(ORPHAN_FETCH_LIMIT);
		if (orphanIds.length === 0) return [];

		const nodeMap = await mobiusNodeRepo.getByIds(orphanIds);
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
			if (isIndexedNoteNodeType(node.type)) {
				try {
					const neighbors = await getSemanticNeighbors(nodeId, 5, orphanIdSet);
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
		const app = AppContext.getInstance().app;
		const unresolvedLinks = app.metadataCache.unresolvedLinks;
		return buildBrokenLinkFindings(unresolvedLinks, context.dismissals);
	},
};
