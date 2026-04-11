/**
 * Report phase: two-stage synthesis into a final report.
 *
 * Stage 1 — blocks: streamObject → title + topics + dashboard_blocks + source_assessments
 *   Emits 'blocks-complete' signal so UI can render blocks immediately.
 *
 * Stage 2 — executive summary: streamText → ~1000 word answer-first executive summary.
 *   Emits streaming 'progress' signals so summary appears word-by-word in the UI.
 *   Generated AFTER blocks, so summary can reference block titles/content.
 */

import { streamObject, streamText } from 'ai';
import { z } from 'zod/v3';
import { StreamTriggerName, UIStepType, UISignalChannel, UISignalKind, type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { weavePathsToContext } from '../../search-agent-helper/weavePathsToContext';
import type { AISearchSource, AISearchTopic, DashboardBlock, SearchAgentResult } from '../../shared-types';
import { getFileNameFromPath, normalizeFilePath } from '@/core/utils/file-utils';
import type { ClassifyResult, PlanSnapshot, ReconResult } from '../types';

// ---------------------------------------------------------------------------
// Stage 1 schema — blocks only (no summary; that gets its own dedicated call)
// ---------------------------------------------------------------------------

const blocksOutputSchema = z.object({
	title: z.string().describe('Short title for this analysis (5-15 words)'),
	topics: z.array(z.object({
		label: z.string(),
		weight: z.number().min(0).max(1),
	})).describe('Key topics identified'),
	dashboard_blocks: z.array(z.object({
		id: z.string(),
		title: z.string(),
		weight: z.number().min(0).max(10),
		markdown: z.string(),
	})).describe('Dashboard content blocks — detailed analysis sections'),
	source_assessments: z.array(z.object({
		path: z.string(),
		reasoning: z.string(),
		badges: z.array(z.string()),
		physical_score: z.number().min(0).max(100),
		semantic_score: z.number().min(0).max(100),
	})).describe('Assessment of each source document'),
	follow_up_questions: z.array(z.string()).max(5).describe('Suggested follow-up questions'),
});

type BlocksOutput = z.infer<typeof blocksOutputSchema>;

// ---------------------------------------------------------------------------
// Main phase
// ---------------------------------------------------------------------------

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

	// Weave paths into structured context (shared by both stages)
	const tm = aiServiceManager.getTemplateManager?.();
	const weavedContext = await weavePathsToContext(paths, tm);

	yield {
		type: 'pk-debug',
		debugName: 'Report: context weaved',
		extra: { contextLength: weavedContext.length },
	};

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

	// -------------------------------------------------------------------------
	// Stage 1: Generate blocks
	// -------------------------------------------------------------------------

	yield {
		type: 'ui-signal',
		channel: UISignalChannel.SEARCH_STAGE,
		kind: UISignalKind.PROGRESS,
		entityId: options.stepId,
		payload: { stage: 'report', status: 'blocks-generating' },
		triggerName: StreamTriggerName.SEARCH_AI_AGENT,
	} as LLMStreamEvent;

	let blocksOutput: BlocksOutput;
	try {
		const [blocksSystemPrompt, blocksUserPrompt] = await Promise.all([
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

		const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSystem);
		const blocksResult = streamObject({
			model,
			system: blocksSystemPrompt,
			prompt: blocksUserPrompt,
			schema: blocksOutputSchema,
		});

		// Consume stream (required by AI SDK — result.object hangs if stream not consumed)
		for await (const _ of blocksResult.partialObjectStream) { /* drain */ }
		blocksOutput = await blocksResult.object as BlocksOutput;
		try {
			const usage = await blocksResult.usage;
			const { modelId } = aiServiceManager.getModelForPrompt(PromptId.AiAnalysisVaultReportSystem);
			yield { type: 'pk-debug', debugName: 'phase-usage', extra: { phase: 'report-blocks', modelId, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
		} catch { /* ignore */ }
	} catch {
		blocksOutput = {
			title: userQuery.slice(0, 50),
			topics: [],
			dashboard_blocks: [],
			source_assessments: [],
			follow_up_questions: [],
		};
	}

	// Build block + source objects
	const assessedPaths = new Set(blocksOutput.source_assessments.map((sa) => sa.path));

	const sources: AISearchSource[] = blocksOutput.source_assessments.map((sa) => ({
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

	// Deduplicate by normalized path (same file may appear in multiple task evidence)
	const seenPaths = new Set<string>();
	const dedupedSources = sources.filter((s) => {
		if (seenPaths.has(s.path)) return false;
		seenPaths.add(s.path);
		return true;
	});

	const topics: AISearchTopic[] = blocksOutput.topics.map((t) => ({
		label: t.label,
		weight: t.weight,
	}));

	const dashboardBlocks: DashboardBlock[] = blocksOutput.dashboard_blocks.map((b) => ({
		id: b.id,
		title: b.title,
		weight: b.weight,
		renderEngine: 'MARKDOWN' as const,
		markdown: b.markdown,
	}));

	// Emit blocks to UI so they render immediately while summary generates
	yield {
		type: 'ui-signal',
		channel: UISignalChannel.SEARCH_STAGE,
		kind: UISignalKind.PROGRESS,
		entityId: options.stepId,
		payload: {
			stage: 'report',
			status: 'blocks-complete',
			blocks: dashboardBlocks,
			blockOrder: dashboardBlocks.map((b) => b.id),
		},
		triggerName: StreamTriggerName.SEARCH_AI_AGENT,
	} as LLMStreamEvent;

	yield {
		type: 'pk-debug',
		debugName: 'Report: blocks complete',
		extra: { blockCount: dashboardBlocks.length },
	};

	// -------------------------------------------------------------------------
	// Stage 2: Stream executive summary (~1000 words, answer-first)
	// -------------------------------------------------------------------------

	// Build a compact blocks summary for the summary prompt (titles + first 200 chars of content)
	const blocksSummary = dashboardBlocks.length > 0
		? dashboardBlocks
			.map((b) => `### ${b.title}\n${b.markdown?.slice(0, 300) ?? ''}`)
			.join('\n\n')
		: '(no analysis sections generated)';

	let executiveSummary = '';
	try {
		const [summarySystemPrompt, summaryUserPrompt] = await Promise.all([
			aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultReportSummarySystem, {}),
			aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultReportSummary, {
				userQuery,
				reportPlan: planSnapshot.proposedOutline,
				blocksSummary,
				evidenceList,
			}),
		]);

		const { model: summaryModel } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSummarySystem);
		const summaryStream = streamText({
			model: summaryModel,
			system: summarySystemPrompt,
			prompt: summaryUserPrompt,
		});

		let accumulated = '';
		let lastEmitLen = 0;
		for await (const delta of summaryStream.textStream) {
			accumulated += delta;
			// Emit every ~50 chars for smooth streaming without flooding
			if (accumulated.length - lastEmitLen >= 50) {
				lastEmitLen = accumulated.length;
				yield {
					type: 'ui-signal',
					channel: UISignalChannel.SEARCH_STAGE,
					kind: UISignalKind.PROGRESS,
					entityId: options.stepId,
					payload: { stage: 'report', status: 'progress', streamingText: accumulated },
					triggerName: StreamTriggerName.SEARCH_AI_AGENT,
				} as LLMStreamEvent;
			}
		}
		executiveSummary = accumulated;
		try {
			const usage = await summaryStream.usage;
			const { modelId } = aiServiceManager.getModelForPrompt(PromptId.AiAnalysisVaultReportSummarySystem);
			yield { type: 'pk-debug', debugName: 'phase-usage', extra: { phase: 'report-summary', modelId, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };
		} catch { /* ignore */ }
	} catch {
		executiveSummary = '';
	}

	yield {
		type: 'pk-debug',
		debugName: 'Report: complete',
		extra: {
			titleLength: blocksOutput.title.length,
			summaryLength: executiveSummary.length,
			topicCount: topics.length,
			sourceCount: dedupedSources.length,
			blockCount: dashboardBlocks.length,
			followUpCount: blocksOutput.follow_up_questions.length,
		},
	};

	return {
		title: blocksOutput.title,
		summary: executiveSummary,
		topics,
		sources: dedupedSources,
		dashboardBlocks,
		suggestedFollowUpQuestions: blocksOutput.follow_up_questions,
	};
}

// ---------------------------------------------------------------------------
// Part B: Lazy report generation helpers
// ---------------------------------------------------------------------------

/**
 * A planned section title + brief description, for lazy/on-demand generation.
 */
export type ReportSectionPlan = {
	sectionId: string;
	title: string;
	description: string;
};

const sectionPlanSchema = z.object({
	sections: z.array(z.object({
		sectionId: z.string(),
		title: z.string(),
		description: z.string().describe('One sentence describing what this section will cover'),
	})).min(2).max(6),
});

/**
 * Generate a plan of report sections without generating content.
 * Returns section titles and brief descriptions for lazy generation.
 */
export async function planReportSections(options: {
	userQuery: string;
	sourceCount: number;
	aiServiceManager: AIServiceManager;
}): Promise<ReportSectionPlan[]> {
	const { userQuery, sourceCount, aiServiceManager } = options;
	const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSystem);

	const result = streamObject({
		model,
		schema: sectionPlanSchema,
		prompt: `Plan a report structure for the query: "${userQuery}"\nAvailable sources: ${sourceCount}\nReturn 3-5 section titles with brief descriptions.`,
	});

	// Consume the stream (required by AI SDK — result.object hangs if stream not consumed)
	for await (const _ of result.partialObjectStream) { /* drain */ }
	const object = await result.object;
	return object.sections;
}

/**
 * Generate content for a single report section as a streaming async generator.
 * Yields LLMStreamEvents with accumulated text, and returns the full text string.
 */
export async function* generateReportSection(options: {
	sectionId: string;
	sectionTitle: string;
	userQuery: string;
	weavedContext: string;
	aiServiceManager: AIServiceManager;
}): AsyncGenerator<LLMStreamEvent, string> {
	const { sectionTitle, userQuery, weavedContext, aiServiceManager } = options;
	const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReportSystem);

	yield {
		type: 'pk-debug',
		debugName: `Section: ${sectionTitle} start`,
		extra: { sectionId: options.sectionId },
	};

	const result = streamText({
		model,
		prompt: `Write the "${sectionTitle}" section for a report on: "${userQuery}"\n\nContext:\n${weavedContext.slice(0, 8000)}`,
	});

	let fullText = '';
	let lastEmitLen = 0;
	for await (const chunk of result.textStream) {
		fullText += chunk;
		// Emit every ~50 chars for smooth streaming without flooding
		if (fullText.length - lastEmitLen >= 50) {
			lastEmitLen = fullText.length;
			yield {
				type: 'ui-signal',
				channel: UISignalChannel.SEARCH_STAGE,
				kind: UISignalKind.PROGRESS,
				entityId: options.sectionId,
				payload: { stage: 'report', status: 'progress', streamingText: fullText },
				triggerName: StreamTriggerName.SEARCH_AI_AGENT,
			} as LLMStreamEvent;
		}
	}

	yield {
		type: 'pk-debug',
		debugName: `Section: ${sectionTitle} complete`,
		extra: { sectionId: options.sectionId, length: fullText.length },
	};

	return fullText;
}
