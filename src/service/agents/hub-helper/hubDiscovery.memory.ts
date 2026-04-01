/**
 * Hub recon working memory: merge submits, initial state, and pipeline result shaping.
 */

import type {
	CoverageAssessment,
	DocumentHubLead,
	FolderIntuitionRoundOutput,
	HubDiscoveryDocumentReconSubmit,
} from '@/core/schemas';
import type {
	DocumentReconMemory,
	FolderReconMemory,
	HubDiscoveryPrepContext,
	WorldMetricsDigest,
} from './types';

function orphanHintToLevel(hint: WorldMetricsDigest['orphanRiskHint']): CoverageAssessment['orphanRiskLevel'] {
	if (hint === 'high') return 'high';
	if (hint === 'medium') return 'medium';
	return 'low';
}

function mergeDocumentHubLeads(a: DocumentHubLead[], b: DocumentHubLead[]): DocumentHubLead[] {
	const key = (x: DocumentHubLead) => `${x.sourceFolderPath}|${x.goal}|${x.targetPathPrefix ?? ''}|${x.expectedRole}`;
	const m = new Map<string, DocumentHubLead>();
	for (const x of [...a, ...b]) m.set(key(x), x);
	return [...m.values()];
}

export function mergeDocumentSubmitIntoMemory(
	mem: DocumentReconMemory,
	submit: HubDiscoveryDocumentReconSubmit,
): DocumentReconMemory {
	const byPath = new Map(mem.confirmedDocumentHubPaths.map((p) => [p.path, p]));
	for (const p of submit.confirmedDocumentHubPaths) {
		const prev = byPath.get(p.path);
		if (!prev || (p.confidence ?? 0) >= (prev.confidence ?? 0)) byPath.set(p.path, p);
	}
	return {
		refinedDocumentHubLeads: mergeDocumentHubLeads(mem.refinedDocumentHubLeads, submit.refinedDocumentHubLeads),
		confirmedDocumentHubPaths: [...byPath.values()],
		rejectedSeeds: [...mem.rejectedSeeds, ...submit.rejectedSeeds],
		openQuestions: submit.openQuestions ?? mem.openQuestions,
	};
}

/** Initial folder recon memory from prep context (coverage + exclusions). */
export function buildInitialFolderReconMemory(ctx: HubDiscoveryPrepContext): FolderReconMemory {
	return {
		confirmedFolderHubs: [],
		rejectedFolderPaths: [],
		highwayFolderLeads: [],
		ignoredPathPrefixes: [...ctx.baselineExcludedPrefixes],
		coverage: {
			coveredRootPaths: [],
			coveredThemes: [],
			missingThemes: [],
			weakBranches: [],
			messyBranches: [],
			orphanRiskLevel: orphanHintToLevel(ctx.world.metrics.orphanRiskHint),
			globalPictureSufficient: false,
		},
		openQuestions: [],
	};
}

export function buildInitialDocumentReconMemory(): DocumentReconMemory {
	return {
		refinedDocumentHubLeads: [],
		confirmedDocumentHubPaths: [],
		rejectedSeeds: [],
		openQuestions: [],
	};
}

/** One synthetic folder round for backward-compatible `folderRounds` on the pipeline result. */
export function buildSyntheticFolderRound(
	folderMemory: FolderReconMemory,
	findingsSummary: string,
): FolderIntuitionRoundOutput {
	return {
		folderHubCandidates: folderMemory.confirmedFolderHubs,
		exploreFolderTasks: [],
		documentHubLeads: [],
		ignoredFolders: [],
		coverageAssessment: folderMemory.coverage,
		findingsSummary,
	};
}

/** Merges refined leads with leads implied by confirmed document paths. */
export function mergeLeadsFromConfirmedPaths(
	folderMemory: FolderReconMemory,
	docMemory: DocumentReconMemory,
): DocumentHubLead[] {
	const base = docMemory.refinedDocumentHubLeads;
	const fromPaths: DocumentHubLead[] = docMemory.confirmedDocumentHubPaths.map((p) => ({
		sourceFolderPath: folderMemory.confirmedFolderHubs[0]?.path ?? '',
		targetPathPrefix: p.path,
		goal:
			p.role === 'bridge'
				? 'find_cross_folder_bridge'
				: p.role === 'index'
					? 'find_index_note'
					: 'find_authority_note',
		expectedRole: p.role,
		reason: p.reason,
	}));
	return mergeDocumentHubLeads(base, fromPaths);
}
