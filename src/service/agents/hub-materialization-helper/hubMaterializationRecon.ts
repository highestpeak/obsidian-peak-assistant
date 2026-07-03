// Draft → critique loop for HubMaterializationAgent.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 6.3.

import { PromptId } from '@/core/types/prompt';
import type { AIServiceManager } from '@/service/chat/service-manager';
import {
	hubDraftSchema,
	hubCritiqueSchema,
	type HubDraft,
	type HubCritique,
	type HubCritiqueGap,
} from '@/core/schemas/agents/hubMaterialization';
import type { HubMaterializationPrepContext } from './types';

export interface HubReconLoopResult {
	draft: HubDraft;
	critique: HubCritique;
	iterations: number;
	gapsRemaining: HubCritiqueGap[];
}

interface DraftVariables {
	vaultName: string;
	hubNodeId: string;
	hubPath: string;
	curatorReason: string;
	coreMembers: Array<{
		path: string;
		title: string;
		pagerank: string;
		betweenness: string;
		tagsCsv: string;
		excerpt: string;
	}>;
	fringeMembers: Array<{ path: string; title: string }>;
	aggregatedTagsCsv: string;
	aggregatedKeywordsCsv: string;
	previousGaps: HubCritiqueGap[];
}

function buildDraftVariables(prep: HubMaterializationPrepContext, previousGaps: HubCritiqueGap[]): DraftVariables {
	const core = prep.members.filter((m) => m.role === 'core');
	const fringe = prep.members.filter((m) => m.role === 'fringe');
	return {
		vaultName: prep.vaultName,
		hubNodeId: prep.hubNodeId,
		hubPath: prep.hubPath,
		curatorReason: prep.curatorReason,
		coreMembers: core.map((m) => ({
			path: m.path,
			title: m.title,
			pagerank: m.pagerank.toFixed(4),
			betweenness: m.betweenness.toFixed(4),
			tagsCsv: m.tags.join(', '),
			excerpt: m.excerpt.replace(/\s+/g, ' ').slice(0, 400),
		})),
		fringeMembers: fringe.map((m) => ({ path: m.path, title: m.title })),
		aggregatedTagsCsv: prep.aggregatedTags.map((t) => `${t.tag}(${t.count})`).join(', '),
		aggregatedKeywordsCsv: prep.aggregatedSemanticKeywords.join(', '),
		previousGaps,
	};
}

function renderDraftMarkdown(draft: HubDraft): string {
	return [
		`# ${draft.title}`,
		'',
		draft.summary,
		'',
		'## 核心概念',
		draft.coreConceptSection,
		'',
		'## 结构脉络',
		draft.structureSection,
		'',
		'## 演化时间线',
		draft.evolutionSection,
		'',
		'## 未解问题',
		draft.openQuestionsSection,
		'',
		'## 入口',
		draft.entryPointsSection,
	].join('\n');
}

export async function runHubMaterializationReconLoop(input: {
	prep: HubMaterializationPrepContext;
	aiServiceManager: AIServiceManager;
	usageSessionId?: string;
}): Promise<HubReconLoopResult> {
	const { prep, aiServiceManager, usageSessionId } = input;

	let iteration = 0;
	let previousGaps: HubCritiqueGap[] = [];
	let lastDraft: HubDraft | null = null;
	let lastCritique: HubCritique = { retryDraft: true, gaps: [], overallCoverage: 0 };

	while (iteration < prep.budget.maxCritiqueIterations) {
		iteration += 1;

		const draftVars = buildDraftVariables(prep, previousGaps);
		const draftRaw = await aiServiceManager.queryStructured<HubDraft>(
			PromptId.HubMaterializationDraft,
			draftVars as unknown as Record<string, unknown>,
			undefined,
			{
				usageFeature: 'indexing',
				usageAction: 'hub-materialization-draft',
				usageSessionId,
			},
		);
		const draft = hubDraftSchema.parse(draftRaw);
		lastDraft = draft;

		const critiqueRaw = await aiServiceManager.queryStructured<HubCritique>(
			PromptId.HubMaterializationCritique,
			{
				hubPath: prep.hubPath,
				memberCount: prep.members.length,
				coreCount: prep.members.filter((m) => m.role === 'core').length,
				fringeCount: prep.members.filter((m) => m.role === 'fringe').length,
				draftMarkdown: renderDraftMarkdown(draft),
				referencedMemberIds: draft.referencedMemberIds,
			},
			undefined,
			{
				usageFeature: 'indexing',
				usageAction: 'hub-materialization-critique',
				usageSessionId,
			},
		);
		const critique = hubCritiqueSchema.parse(critiqueRaw);
		lastCritique = critique;

		if (!critique.retryDraft) break;
		previousGaps = critique.gaps;
	}

	if (!lastDraft) {
		throw new Error('HubMaterializationAgent: draft loop finished without a draft.');
	}
	return {
		draft: lastDraft,
		critique: lastCritique,
		iterations: iteration,
		gapsRemaining: lastCritique.gaps,
	};
}

export { renderDraftMarkdown };
