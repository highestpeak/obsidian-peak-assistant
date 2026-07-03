// Deterministic prep for HubMaterializationAgent.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 6.

import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';
import type {
	HubMaterializationMember,
	HubMaterializationPrepContext,
	HubMaterializationVaultReaderPort,
} from './types';
import type { VaultHubDocWritePort } from '@/core/ports/HubGenerationPorts';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';

const EXCERPT_MAX = 400;
const AGGREGATED_TAG_LIMIT = 20;
const AGGREGATED_KEYWORD_LIMIT = 10;

export function coreCountFor(memberCount: number): number {
	if (memberCount <= 0) return 0;
	const raw = Math.ceil(Math.sqrt(memberCount));
	return Math.max(3, Math.min(12, raw));
}

function rankScore(pagerank: number, betweenness: number): number {
	return 0.6 * pagerank + 0.4 * betweenness;
}

export interface HubMaterializationPrepDeps {
	mobiusNodeRepo: MobiusNodeRepo;
	vaultReader: HubMaterializationVaultReaderPort;
	vaultWritePort: VaultHubDocWritePort;
}

export async function prepareHubMaterializationContext(input: {
	decision: HubCurationDecision;
	planId: string;
	vaultName: string;
	budget: { maxCritiqueIterations: number };
	deps: HubMaterializationPrepDeps;
}): Promise<HubMaterializationPrepContext> {
	const { decision, planId, vaultName, budget, deps } = input;

	// 1. Load node signals for each member id in decision scope.
	const memberIds = decision.scope.memberNodeIds ?? [];
	const memberSignals = await Promise.all(
		memberIds.map((id) => deps.mobiusNodeRepo.getDocumentNodeSignals(id)),
	);

	// 2. Build member records with excerpts + tags. Skip ids whose signals are null (deleted since curation).
	const memberRecords = await Promise.all(
		memberSignals.map(async (sig, i) => {
			if (!sig || !sig.path) return null;
			const [title, excerpt, tags] = await Promise.all([
				deps.vaultReader.readTitle(sig.path).catch(() => sig.label ?? ''),
				deps.vaultReader.readExcerpt(sig.path, EXCERPT_MAX).catch(() => ''),
				deps.vaultReader.readTags(sig.path).catch(() => [] as string[]),
			]);
			return {
				nodeId: memberIds[i],
				path: sig.path,
				title: title || sig.label || sig.path,
				pagerank: Number(sig.pagerank ?? 0),
				betweenness: Number(sig.betweenness_centrality ?? 0),
				excerpt,
				tags,
			};
		}),
	);

	const members = memberRecords.filter((m): m is NonNullable<typeof m> => m !== null);

	// 3. Rank + classify core/fringe.
	members.sort((a, b) => rankScore(b.pagerank, b.betweenness) - rankScore(a.pagerank, a.betweenness));
	const coreCount = coreCountFor(members.length);
	const classified: HubMaterializationMember[] = members.map((m, idx) => ({
		...m,
		role: idx < coreCount ? 'core' : 'fringe',
	}));

	// 4. Aggregate tags across members.
	const tagCounts = new Map<string, number>();
	for (const m of classified) {
		for (const t of m.tags) {
			tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
		}
	}
	const aggregatedTags = [...tagCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, AGGREGATED_TAG_LIMIT)
		.map(([tag, count]) => ({ tag, count }));

	// 5. Semantic keyword aggregation — reuse tag ordering as a proxy; a richer TextRank-style extract is a follow-up.
	const aggregatedSemanticKeywords = aggregatedTags.slice(0, AGGREGATED_KEYWORD_LIMIT).map((t) => t.tag);

	// 6. Read existing hub file for user-owned flag + preserved content.
	const [isUserOwned, existingUserContent] = await Promise.all([
		deps.vaultWritePort.readPeakUserOwned(decision.hubPath).catch(() => false),
		deps.vaultWritePort.extractUserPreservedContent(decision.hubPath).catch(() => ''),
	]);

	return {
		hubNodeId: decision.nodeId,
		hubPath: decision.hubPath,
		planId,
		vaultName,
		curatorReason: decision.reason,
		members: classified,
		aggregatedTags,
		aggregatedSemanticKeywords,
		existingUserContent,
		isUserOwned,
		budget: { maxCritiqueIterations: Math.max(1, Math.min(4, budget.maxCritiqueIterations)) },
	};
}
