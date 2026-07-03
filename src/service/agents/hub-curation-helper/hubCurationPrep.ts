// Deterministic prep for HubCuratorAgent.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 4.

import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type { StructuralAnalysisRepo } from '@/core/storage/sqlite/repositories/StructuralAnalysisRepo';
import type { HubConstituentRepo } from '@/core/storage/sqlite/repositories/HubConstituentRepo';
import type { VaultHubDocWritePort } from '@/core/ports/HubGenerationPorts';
import type {
	HubCurationBudget,
	HubCurationCandidate,
	HubCurationCommunityMeta,
	HubCurationExistingHub,
	HubCurationPrepContext,
} from './types';

export interface HubCurationPrepDeps {
	tm: TemplateManager;
	mobiusNodeRepo: MobiusNodeRepo;
	structuralRepo: StructuralAnalysisRepo;
	hubConstituentRepo: HubConstituentRepo;
	vaultWritePort: VaultHubDocWritePort;
	hubSummaryFolder: string;
}

export function computeCuratorBudget(documentNodeCount: number): HubCurationBudget {
	const n = Math.max(0, Math.floor(documentNodeCount));
	const raw = Math.ceil(Math.sqrt(n) * 1.5);
	const candidateLimit = Math.max(12, Math.min(60, raw));
	const iters = Math.max(1, Math.min(4, Math.ceil(Math.log2(Math.max(candidateLimit, 2)))));
	return { maxIterations: iters, candidateLimit };
}

export async function prepareHubCurationContext(input: {
	vaultName: string;
	currentDateLabel: string;
	candidateLimitOverride?: number;
	maxIterationsOverride?: number;
	deps: HubCurationPrepDeps;
}): Promise<HubCurationPrepContext> {
	const { vaultName, currentDateLabel, deps } = input;

	const documentNodeCount = await deps.mobiusNodeRepo.countDocumentNodes();
	const baselineBudget = computeCuratorBudget(documentNodeCount);
	const budget: HubCurationBudget = {
		candidateLimit: input.candidateLimitOverride ?? baselineBudget.candidateLimit,
		maxIterations: input.maxIterationsOverride ?? baselineBudget.maxIterations,
	};

	// 1. Candidate shortlist (SQL).
	const rawCandidates = await deps.mobiusNodeRepo.listCuratorHubCandidates(
		budget.candidateLimit,
		deps.hubSummaryFolder,
	);
	const candidates: HubCurationCandidate[] = rawCandidates.map((r) => ({
		nodeId: r.node_id,
		path: String(r.path ?? ''),
		label: r.label,
		hubGraphScore: Number(r.hub_graph_score ?? 0),
		hubPhysicalAuthorityScore: Number(r.hub_physical_authority_score ?? 0),
		hubOrganizationalScore: Number(r.hub_organizational_score ?? 0),
		hubSemanticCentralityScore: Number(r.hub_semantic_centrality_score ?? 0),
		communityId: r.community_id ?? null,
		betweennessCentrality: r.betweenness_centrality ?? null,
	}));

	// 2. Community metadata.
	let communities: HubCurationCommunityMeta[] = [];
	try {
		const rows = await deps.structuralRepo.getCommunities();
		communities = rows.map((c) => ({
			communityId: c.id,
			memberCount: c.memberCount,
			modularityContribution: c.internalDensity,
			representativeNodeIds: (c.topNodes as Array<{ nodeId?: string; id?: string }> | undefined)
				?.map((n) => n?.nodeId ?? n?.id ?? '')
				.filter(Boolean)
				.slice(0, 3) ?? [],
		}));
	} catch {
		communities = [];
	}

	// 3. Existing hubs snapshot.
	const existingHubs: HubCurationExistingHub[] = [];
	try {
		// Approach: collect known hub nodes via constituent index — one row per hub_node_id.
		// A dedicated query in MobiusNodeRepo would be cleaner; this stays additive.
		const seen = new Set<string>();
		const stale = await deps.mobiusNodeRepo.getStaleHubs?.(200).catch(() => []);
		if (Array.isArray(stale)) {
			for (const h of stale) {
				const hubNodeId = String((h as any).node_id ?? (h as any).nodeId ?? '');
				const hubPath = String((h as any).path ?? '');
				if (!hubNodeId || seen.has(hubNodeId)) continue;
				seen.add(hubNodeId);
				const userOwned = await deps.vaultWritePort.readPeakUserOwned(hubPath).catch(() => false);
				existingHubs.push({
					nodeId: hubNodeId,
					path: hubPath,
					lastGeneratedAt: (h as any).hub_stale_since ?? null,
					isStale: true,
					userOwned,
				});
			}
		}
	} catch {
		// existingHubs stays empty
	}

	const worldSnapshotMarkdown = await deps.tm.render(IndexingTemplateId.HubCurationWorldSnapshot, {
		vaultName,
		currentDateLabel,
		candidateCount: candidates.length,
		candidates: candidates.map((c) => ({
			path: c.path,
			hubGraphScore: c.hubGraphScore.toFixed(3),
			hubPhysicalAuthorityScore: c.hubPhysicalAuthorityScore.toFixed(3),
			hubOrganizationalScore: c.hubOrganizationalScore.toFixed(3),
			hubSemanticCentralityScore: c.hubSemanticCentralityScore.toFixed(3),
			communityId: c.communityId ?? '—',
		})),
		communityMeta: communities.map((c) => ({
			communityId: c.communityId,
			memberCount: c.memberCount,
			modularityContribution: c.modularityContribution.toFixed(3),
			repsCsv: c.representativeNodeIds.join(', ') || '—',
		})),
		existingHubs: existingHubs.map((h) => ({
			path: h.path,
			lastGeneratedAtHuman: h.lastGeneratedAt ? new Date(h.lastGeneratedAt).toISOString() : '—',
			isStale: h.isStale ? 'yes' : 'no',
			userOwned: h.userOwned ? 'yes' : 'no',
		})),
		budget,
	});

	return {
		vaultName,
		currentDateLabel,
		documentNodeCount,
		candidates,
		communityMeta: communities,
		existingHubs,
		worldSnapshotMarkdown,
		budget,
	};
}
