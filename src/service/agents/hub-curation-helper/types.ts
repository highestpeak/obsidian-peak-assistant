// Types for HubCuratorAgent.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 4.

import type { HubCurationDecision, HubCurationSubmit } from '@/core/schemas/agents/hubCuration';

export interface HubCurationCandidate {
	nodeId: string;
	path: string;
	label: string;
	hubGraphScore: number;
	hubPhysicalAuthorityScore: number;
	hubOrganizationalScore: number;
	hubSemanticCentralityScore: number;
	communityId: string | null;
	betweennessCentrality: number | null;
}

export interface HubCurationCommunityMeta {
	communityId: string;
	memberCount: number;
	modularityContribution: number;
	representativeNodeIds: string[];
}

export interface HubCurationExistingHub {
	nodeId: string;
	path: string;
	lastGeneratedAt: number | null;
	isStale: boolean;
	userOwned: boolean;
}

export interface HubCurationBudget {
	maxIterations: number;
	candidateLimit: number;
}

export interface HubCurationPrepContext {
	vaultName: string;
	currentDateLabel: string;
	documentNodeCount: number;
	candidates: HubCurationCandidate[];
	communityMeta: HubCurationCommunityMeta[];
	existingHubs: HubCurationExistingHub[];
	worldSnapshotMarkdown: string;
	budget: HubCurationBudget;
}

export interface HubCurationMemory {
	decisions: HubCurationDecision[];
	coveragePct: number;
	confidence: number;
	iterations: number;
	lastSubmit: HubCurationSubmit | null;
}

export interface HubCurationRunOptions {
	vaultName?: string;
	currentDateLabel?: string;
	/** Cap on candidate list (post sqrt formula). Default from budget. */
	candidateLimitOverride?: number;
	/** Cap on recon iterations. Default from budget. */
	maxIterationsOverride?: number;
	/** Trigger label passed to persistence. */
	trigger?: 'manual' | 'scheduled';
}
