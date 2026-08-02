// Types for HubMaterializationAgent.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 6.

import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';
import type { HubDraft, HubCritiqueGap } from '@/core/schemas/agents/hubMaterialization';

export interface HubMaterializationMember {
	nodeId: string;
	path: string;
	title: string;
	pagerank: number;
	betweenness: number;
	excerpt: string;
	tags: string[];
	/** `core` = top-K by (0.6*pagerank + 0.4*betweenness); `fringe` = the rest. */
	role: 'core' | 'fringe';
}

export interface HubMaterializationBudget {
	maxCritiqueIterations: number;
}

export interface HubMaterializationPrepContext {
	hubNodeId: string;
	hubPath: string;
	planId: string;
	vaultName: string;
	curatorReason: string;
	members: HubMaterializationMember[];
	aggregatedTags: Array<{ tag: string; count: number }>;
	aggregatedSemanticKeywords: string[];
	existingUserContent: string;
	isUserOwned: boolean;
	budget: HubMaterializationBudget;
}

export interface HubMaterializationRunOptions {
	decision: HubCurationDecision;
	planId: string;
	trigger: 'manual' | 'scheduled' | 'stale-triggered';
	vaultName?: string;
	budget?: Partial<HubMaterializationBudget>;
	/** Markdown is an explicit user action. Scheduled/stale runs remain virtual. */
	materializeMarkdown?: boolean;
	/** Optional override so tests can skip Vault lookups. */
	prepOverride?: HubMaterializationPrepContext;
}

export interface HubMaterializationRunResult {
	status: 'virtualized' | 'written' | 'skipped-user-owned' | 'failed';
	hubPath: string;
	coverage?: number;
	draftIterations: number;
	gapsRemaining: HubCritiqueGap[];
	error?: string;
	draft?: HubDraft;
}

export interface HubMaterializationVaultReaderPort {
	/** Read title from a vault-relative path (falls back to basename). */
	readTitle(path: string): Promise<string>;
	/** Read the first N chars of file content, excluding frontmatter. */
	readExcerpt(path: string, maxChars: number): Promise<string>;
	/** Read tags from a doc (frontmatter + inline). */
	readTags(path: string): Promise<string[]>;
}
