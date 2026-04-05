/**
 * Synthesize phase: generate final report from all collected evidence.
 *
 * Simplified from the original 5-step report pipeline (ReportPlan → VisualBlueprint →
 * DashboardBlocks → MermaidOverview → Summary) into 2 steps:
 * 1. weavePathsToContext (existing, reused)
 * 2. One LLM call for summary + dashboard blocks + topics
 */

import { streamObject } from 'ai';
import { z } from 'zod/v3';
import { StreamTriggerName, type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { weavePathsToContext } from '../search-agent-helper/helpers/weavePathsToContext';
import type { AISearchSource, AISearchTopic, DashboardBlock, SearchAgentResult } from '../AISearchAgent';
import type { ExploreState, OrientResult, SynthesizeOptions } from './types';
import { getFileNameFromPath, normalizeFilePath } from '@/core/utils/file-utils';

const synthesizeOutputSchema = z.object({
	title: z.string().describe('Short title for this analysis (5-15 words)'),
	summary: z.string().describe('Comprehensive summary answering the user query'),
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
});

type SynthesizeOutput = z.infer<typeof synthesizeOutputSchema>;

/**
 * Run the synthesize phase: weave context + one LLM call → SearchAgentResult.
 */
export async function* runSynthesizePhase(options: {
	userQuery: string;
	orient: OrientResult | undefined;
	exploreState: ExploreState;
	aiServiceManager: AIServiceManager;
	stepId: string;
	synthesizeOptions?: SynthesizeOptions;
}): AsyncGenerator<LLMStreamEvent, SearchAgentResult> {
	const { userQuery, orient, exploreState, aiServiceManager, stepId, synthesizeOptions } = options;
	const paths = Array.from(exploreState.verifiedPaths).sort();

	yield {
		type: 'pk-debug',
		debugName: 'Synthesize: start',
		extra: { pathCount: paths.length },
	};

	// --- Step 1: Weave paths into structured context ---
	const tm = aiServiceManager.getTemplateManager?.();
	const weavedContext = await weavePathsToContext(paths, tm);

	yield {
		type: 'pk-debug',
		debugName: 'Synthesize: context weaved',
		extra: { contextLength: weavedContext.length },
	};

	// --- Step 2: Single LLM call for full report ---
	const systemPrompt = buildSynthesizeSystemPrompt();
	const userPrompt = buildSynthesizeUserPrompt({
		userQuery,
		orient,
		exploreState,
		weavedContext,
		synthesizeOptions,
	});

	const { model: synthesizeModel } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisSummary);

	let output: SynthesizeOutput;
	try {
		const result = streamObject({
			model: synthesizeModel,
			system: systemPrompt,
			prompt: userPrompt,
			schema: synthesizeOutputSchema,
		});
		output = await result.object as SynthesizeOutput;
	} catch {
		output = {
			title: userQuery.slice(0, 50),
			summary: 'Analysis could not be completed. Please try again.',
			topics: [],
			dashboard_blocks: [],
			source_assessments: [],
		};
	}

	// --- Build final result ---
	const sources: AISearchSource[] = output.source_assessments.map((sa: SynthesizeOutput['source_assessments'][0]) => ({
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
	const assessedPaths = new Set(output.source_assessments.map((sa: SynthesizeOutput['source_assessments'][0]) => sa.path));
	for (const path of paths) {
		if (!assessedPaths.has(path)) {
			sources.push({
				id: `src:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				title: getFileNameFromPath(path) ?? path,
				path: normalizeFilePath(path) ?? path,
				reasoning: 'Discovered during exploration.',
				badges: [],
				score: { physical: 0, semantic: 0, average: 0 },
			});
		}
	}

	const topics: AISearchTopic[] = output.topics.map((t: SynthesizeOutput['topics'][0]) => ({
		label: t.label,
		weight: t.weight,
	}));

	const dashboardBlocks: DashboardBlock[] = output.dashboard_blocks.map((b: SynthesizeOutput['dashboard_blocks'][0]) => ({
		id: b.id,
		title: b.title,
		weight: b.weight,
		renderEngine: 'MARKDOWN' as const,
		markdown: b.markdown,
	}));

	const result: SearchAgentResult = {
		title: output.title,
		summary: output.summary,
		topics,
		sources,
		dashboardBlocks,
	};

	yield {
		type: 'pk-debug',
		debugName: 'Synthesize: complete',
		extra: {
			titleLength: output.title.length,
			summaryLength: output.summary.length,
			topicCount: topics.length,
			sourceCount: sources.length,
			blockCount: dashboardBlocks.length,
		},
	};

	return result;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSynthesizeSystemPrompt(): string {
	return `You are a knowledge analyst. Given a user query, exploration context, and evidence collected from a vault, produce a comprehensive analysis report.

Rules:
- The summary should directly answer the user's question using evidence from the vault
- Each dashboard_block should be a self-contained section with clear markdown content
- source_assessments should evaluate each source's relevance (physical: how directly it matches; semantic: how conceptually relevant)
- badges on sources should be 1-3 word labels like "primary source", "context", "tangential", "key reference"
- Topics should capture the main themes with weights summing to roughly 1.0
- Use [[wikilink]] syntax when referencing vault documents in the summary and blocks
- Be concise but thorough; prefer depth over breadth`;
}

function buildSynthesizeUserPrompt(options: {
	userQuery: string;
	orient: OrientResult | undefined;
	exploreState: ExploreState;
	weavedContext: string;
	synthesizeOptions?: SynthesizeOptions;
}): string {
	const { userQuery, orient, exploreState, weavedContext, synthesizeOptions } = options;
	const parts: string[] = [];

	parts.push(`## User Query\n${userQuery}`);

	if (orient) {
		parts.push(`## Understanding\n${orient.understanding}`);
	}

	parts.push(`## Exploration Findings (${exploreState.roundCount} rounds, ${exploreState.verifiedPaths.size} paths)`);
	for (const finding of exploreState.findings) {
		parts.push(`### Round ${finding.roundIndex + 1}\n${finding.summary}\nPaths: ${finding.paths.slice(0, 10).join(', ')}`);
	}

	if (weavedContext) {
		const truncated = weavedContext.length > 12000
			? weavedContext.slice(0, 12000) + '\n\n_(context truncated)_'
			: weavedContext;
		parts.push(`## Structured Context (folder tree, tags, graph)\n${truncated}`);
	}

	parts.push(`## Verified Paths (${exploreState.verifiedPaths.size} total)`);
	const pathList = Array.from(exploreState.verifiedPaths).slice(0, 50).join('\n');
	parts.push(pathList);

	if (synthesizeOptions?.maxSummaryWords) {
		parts.push(`\n_Target summary length: ~${synthesizeOptions.maxSummaryWords} words_`);
	}

	parts.push('\nProduce a comprehensive analysis with title, summary, topics, dashboard blocks, and source assessments.');

	return parts.join('\n\n');
}
