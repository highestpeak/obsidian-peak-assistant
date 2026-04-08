/**
 * Report phase: synthesize evidence into a final report.
 *
 * Two steps:
 * 1. Weave evidence paths into structured context (reuse weavePathsToContext)
 * 2. Single LLM call → summary + topics + sources + dashboard blocks + follow-up questions
 *
 * Adapted from conversational/synthesize.ts with HITL plan context.
 */

import { streamObject } from 'ai';
import { z } from 'zod/v3';
import { StreamTriggerName, type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { weavePathsToContext } from '../../search-agent-helper/weavePathsToContext';
import type { AISearchSource, AISearchTopic, DashboardBlock, SearchAgentResult } from '../../shared-types';
import { getFileNameFromPath, normalizeFilePath } from '@/core/utils/file-utils';
import type { ClassifyResult, PlanSnapshot, ReconResult } from '../types';

const reportOutputSchema = z.object({
	title: z.string().describe('Short title for this analysis (5-15 words)'),
	summary: z.string().describe('Comprehensive summary directly answering the user query'),
	topics: z.array(z.object({
		label: z.string(),
		weight: z.number().min(0).max(1),
	})).describe('Key topics identified'),
	dashboard_blocks: z.array(z.object({
		id: z.string(),
		title: z.string(),
		weight: z.number().min(0).max(10),
		markdown: z.string(),
	})).describe('Dashboard content blocks'),
	source_assessments: z.array(z.object({
		path: z.string(),
		reasoning: z.string(),
		badges: z.array(z.string()),
		physical_score: z.number().min(0).max(100),
		semantic_score: z.number().min(0).max(100),
	})).describe('Assessment of each source document'),
	follow_up_questions: z.array(z.string()).max(5).describe('Suggested follow-up questions'),
});

type ReportOutput = z.infer<typeof reportOutputSchema>;

/**
 * Run the Report phase: weave context + one LLM call → SearchAgentResult.
 */
export async function* runReportPhase(options: {
	userQuery: string;
	classify: ClassifyResult;
	recon: ReconResult;
	planSnapshot: PlanSnapshot;
	aiServiceManager: AIServiceManager;
	stepId: string;
}): AsyncGenerator<LLMStreamEvent, SearchAgentResult> {
	const { userQuery, classify, recon, planSnapshot, aiServiceManager } = options;
	const paths = [...new Set(recon.evidence.map((e) => e.path))].sort();

	yield {
		type: 'pk-debug',
		debugName: 'Report: start',
		extra: { pathCount: paths.length },
	};

	// --- Weave paths into structured context ---
	const tm = aiServiceManager.getTemplateManager?.();
	const weavedContext = await weavePathsToContext(paths, tm);

	yield {
		type: 'pk-debug',
		debugName: 'Report: context weaved',
		extra: { contextLength: weavedContext.length },
	};

	// --- Single LLM call for full report ---
	const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSystem);

	const evidenceList = recon.evidence
		.slice(0, 40)
		.map((e) => `- **${e.path}**: ${e.reason}`)
		.join('\n');
	const proposedSections = planSnapshot.suggestedSections.length > 0
		? planSnapshot.suggestedSections.map((s) => `- ${s}`).join('\n')
		: undefined;
	const weavedContextTruncated = weavedContext && weavedContext.length > 10000
		? weavedContext.slice(0, 10000) + '\n\n_(context truncated)_'
		: weavedContext || undefined;

	let output: ReportOutput;
	try {
		const [systemPrompt, userPrompt] = await Promise.all([
			aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultReportSystem, {}),
			aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultReport, {
				userQuery,
				reportPlan: planSnapshot.proposedOutline,
				proposedSections,
				evidenceCount: String(recon.evidence.length),
				evidenceList,
				weavedContext: weavedContextTruncated,
			}),
		]);
		const result = streamObject({
			model,
			system: systemPrompt,
			prompt: userPrompt,
			schema: reportOutputSchema,
		});
		output = await result.object as ReportOutput;
	} catch {
		output = {
			title: userQuery.slice(0, 50),
			summary: 'Analysis could not be completed. Please try again.',
			topics: [],
			dashboard_blocks: [],
			source_assessments: [],
			follow_up_questions: [],
		};
	}

	// --- Build final result ---
	const assessedPaths = new Set(output.source_assessments.map((sa) => sa.path));

	const sources: AISearchSource[] = output.source_assessments.map((sa) => ({
		id: `src:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		title: getFileNameFromPath(sa.path) ?? sa.path,
		path: normalizeFilePath(sa.path) ?? sa.path,
		reasoning: sa.reasoning,
		badges: sa.badges,
		score: {
			physical: sa.physical_score,
			semantic: sa.semantic_score,
			average: (sa.physical_score + sa.semantic_score) / 2,
		},
	}));

	// Fill in sources for paths without explicit assessments
	for (const path of paths) {
		if (!assessedPaths.has(path)) {
			// Find the reason from recon evidence
			const ev = recon.evidence.find((e) => e.path === path);
			sources.push({
				id: `src:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				title: getFileNameFromPath(path) ?? path,
				path: normalizeFilePath(path) ?? path,
				reasoning: ev?.reason ?? 'Discovered during exploration.',
				badges: [],
				score: { physical: 0, semantic: 0, average: 0 },
			});
		}
	}

	const topics: AISearchTopic[] = output.topics.map((t) => ({
		label: t.label,
		weight: t.weight,
	}));

	const dashboardBlocks: DashboardBlock[] = output.dashboard_blocks.map((b) => ({
		id: b.id,
		title: b.title,
		weight: b.weight,
		renderEngine: 'MARKDOWN' as const,
		markdown: b.markdown,
	}));

	const agentResult: SearchAgentResult = {
		title: output.title,
		summary: output.summary,
		topics,
		sources,
		dashboardBlocks,
		suggestedFollowUpQuestions: output.follow_up_questions,
	};

	yield {
		type: 'pk-debug',
		debugName: 'Report: complete',
		extra: {
			titleLength: output.title.length,
			summaryLength: output.summary.length,
			topicCount: topics.length,
			sourceCount: sources.length,
			blockCount: dashboardBlocks.length,
			followUpCount: output.follow_up_questions.length,
		},
	};

	return agentResult;
}

