/**
 * Explore phase: HITL agentic exploration loop.
 *
 * Uses the generic AgentLoop with search-graph-inspector tools.
 * After each round, yields an HITL pause point for user feedback.
 * The user can: continue, redirect, focus on a path, add constraints, or stop.
 */

import { streamObject } from 'ai';
import { z } from 'zod/v3';
import type { ModelMessage } from 'ai';
import { StreamTriggerName, type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { AgentTool } from '@/service/tools/types';
import { PromptId } from '@/service/prompt/PromptId';
import { runAgentLoop } from '../core/AgentLoop';
import {
	inspectNoteContextToolMarkdownOnly,
	graphTraversalToolMarkdownOnly,
	exploreFolderToolMarkdownOnly,
	grepFileTreeTool,
	localSearchWholeVaultTool,
	findPathTool,
	hubLocalGraphTool,
} from '@/service/tools/search-graph-inspector';
import type {
	ExploreState,
	ExploreFinding,
	ExploreSnapshot,
	OrientResult,
	UserFeedback,
	ConversationalSearchEvent,
} from './types';

const exploreSubmitSchema = z.object({
	findings_summary: z.string().describe('Brief summary of what was found in this round'),
	discovered_paths: z.array(z.string()).describe('File paths discovered in this round'),
	coverage_assessment: z.string().describe('How well the current findings cover the user query'),
	confidence: z.enum(['high', 'medium', 'low']),
	suggested_next_action: z.string().describe('What to explore next'),
	should_stop: z.boolean().describe('True if enough evidence has been gathered'),
	tools_used: z.array(z.string()).describe('Names of tools that were called'),
});

type ExploreSubmitOutput = z.infer<typeof exploreSubmitSchema>;

/** Max rounds before auto-synthesize (can be overridden). */
const DEFAULT_MAX_EXPLORE_ROUNDS = 5;
/** Max tool-call iterations within a single explore round. */
const ITERATIONS_PER_ROUND = 3;

/** Build the full tool set for exploration. */
function buildExploreTools(aiServiceManager: AIServiceManager): Record<string, AgentTool> {
	const tm = aiServiceManager.getTemplateManager?.();
	return {
		inspect_note_context: inspectNoteContextToolMarkdownOnly(tm),
		graph_traversal: graphTraversalToolMarkdownOnly(tm),
		explore_folder: exploreFolderToolMarkdownOnly(tm),
		grep_file_tree: grepFileTreeTool(),
		local_search_whole_vault: localSearchWholeVaultTool(tm),
		find_path: findPathTool(tm),
		hub_local_graph: hubLocalGraphTool(tm),
	};
}

export interface ExploreRoundOptions {
	userQuery: string;
	orient: OrientResult | undefined;
	currentState: ExploreState;
	aiServiceManager: AIServiceManager;
	stepId: string;
	/** User feedback from previous round (undefined for first round). */
	userFeedback?: UserFeedback;
	maxRounds?: number;
}

/**
 * Run one explore round: plan → tools → submit → yield HITL pause.
 * Returns updated ExploreState and yields stream events including hitl-pause.
 */
export async function* runExploreRound(options: ExploreRoundOptions): AsyncGenerator<
	ConversationalSearchEvent,
	{ state: ExploreState; snapshot: ExploreSnapshot; shouldAutoStop: boolean }
> {
	const { userQuery, orient, currentState, aiServiceManager, stepId, userFeedback } = options;
	const tools = buildExploreTools(aiServiceManager);
	const roundIndex = currentState.roundCount;

	const systemPrompt = buildExploreSystemPrompt(userQuery, orient, currentState, userFeedback);
	const userPrompt = buildExploreUserPrompt(userQuery, orient, currentState, userFeedback);

	const loopResult = yield* runAgentLoop({
		config: {
			maxIterations: ITERATIONS_PER_ROUND,
			tools,
			toolChoice: 'required',
			buildInitialMessages: async () => [{ role: 'user', content: userPrompt }],
			buildPlanSystemPrompt: async () => systemPrompt,
			buildPlanInjection: (_state, iter) => {
				if (iter === 0) return [];
				return [{
					role: 'user' as const,
					content: `[Round ${roundIndex + 1}, iteration ${iter + 1}/${ITERATIONS_PER_ROUND}] Continue exploring. Focus on areas not yet covered.`,
				}];
			},
		},
		initialState: {},
		modelForPlan: aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisReconLoopPlanSystem),
		stepId,
		triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON,
	});

	// --- Submit step: structured assessment of this round ---
	let submitOutput: ExploreSubmitOutput;
	try {
		const { model: submitModel } = aiServiceManager.getModelInstanceForPrompt(
			PromptId.AiAnalysisReconLoopPathSubmitSystem,
		);
		const toolResultsMarkdown = loopResult.messages
			.filter((m) => m.role === 'tool')
			.map((m) => JSON.stringify(m.content))
			.join('\n\n')
			.slice(0, 8000);

		const submitResult = streamObject({
			model: submitModel,
			system: buildExploreSubmitSystem(),
			prompt: buildExploreSubmitPrompt(userQuery, toolResultsMarkdown, currentState),
			schema: exploreSubmitSchema,
		});
		submitOutput = await submitResult.object as ExploreSubmitOutput;
	} catch {
		submitOutput = {
			findings_summary: 'Exploration round completed.',
			discovered_paths: [],
			coverage_assessment: 'Partial coverage.',
			confidence: 'low',
			suggested_next_action: 'Continue exploring.',
			should_stop: false,
			tools_used: [],
		};
	}

	// --- Update state ---
	const newPaths = submitOutput.discovered_paths.filter(
		(p: string) => !currentState.verifiedPaths.has(p),
	);
	for (const p of newPaths) {
		currentState.verifiedPaths.add(p);
	}

	const finding: ExploreFinding = {
		roundIndex,
		paths: newPaths,
		summary: submitOutput.findings_summary,
		toolsUsed: submitOutput.tools_used,
	};
	currentState.findings.push(finding);
	currentState.roundCount++;

	const snapshot: ExploreSnapshot = {
		totalPaths: currentState.verifiedPaths.size,
		findings: currentState.findings,
		coverageAssessment: submitOutput.coverage_assessment,
		suggestedNextAction: submitOutput.suggested_next_action,
		confidence: submitOutput.confidence,
	};

	yield {
		type: 'pk-debug',
		debugName: `Explore round ${roundIndex + 1} complete`,
		extra: {
			newPathsCount: newPaths.length,
			totalPaths: currentState.verifiedPaths.size,
			confidence: submitOutput.confidence,
			shouldStop: submitOutput.should_stop,
		},
	};

	return {
		state: currentState,
		snapshot,
		shouldAutoStop: submitOutput.should_stop,
	};
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildExploreSystemPrompt(
	userQuery: string,
	orient: OrientResult | undefined,
	state: ExploreState,
	feedback?: UserFeedback,
): string {
	const parts: string[] = [];
	parts.push(`You are a vault exploration agent. Your task is to find relevant documents and evidence for the user's query.

Use the available tools to explore the vault:
- **local_search_whole_vault**: Full-text and semantic search
- **explore_folder**: Browse folder structure
- **grep_file_tree**: Find files by name patterns
- **inspect_note_context**: Deep dive into a single note
- **graph_traversal**: Explore related notes via link graph
- **hub_local_graph**: Hub-centric local graph view
- **find_path**: Find connection paths between two notes

Strategy:
1. Start with the most promising leads (from Orient or user feedback)
2. Use search tools to find anchor documents
3. Use graph tools to expand from anchors to related content
4. Be systematic: don't repeat searches you've already done`);

	if (orient) {
		parts.push(`\n## Orient Result\nUnderstanding: ${orient.understanding}\nPlan: ${orient.explorationPlan}`);
		if (orient.candidateFolders.length > 0) {
			parts.push('Candidate folders: ' + orient.candidateFolders.map((f) => `${f.path} (${f.relevanceReason})`).join('; '));
		}
	}

	if (state.verifiedPaths.size > 0) {
		const pathList = Array.from(state.verifiedPaths).slice(0, 30).join(', ');
		parts.push(`\n## Already Found (${state.verifiedPaths.size} paths)\n${pathList}`);
	}

	if (feedback) {
		parts.push(`\n## User Feedback\nType: ${feedback.type}`);
		if (feedback.message) parts.push(`Message: ${feedback.message}`);
		if (feedback.focusPath) parts.push(`Focus path: ${feedback.focusPath}`);
	}

	return parts.join('\n');
}

function buildExploreUserPrompt(
	userQuery: string,
	orient: OrientResult | undefined,
	state: ExploreState,
	feedback?: UserFeedback,
): string {
	const parts: string[] = [];
	parts.push(`## Query\n${userQuery}`);

	if (feedback?.type === 'redirect' && feedback.message) {
		parts.push(`## User Redirect\n${feedback.message}`);
	} else if (feedback?.type === 'focus_path' && feedback.focusPath) {
		parts.push(`## User Focus\nPlease focus exploration around: ${feedback.focusPath}`);
	} else if (feedback?.type === 'add_constraint' && feedback.message) {
		parts.push(`## Additional Constraint\n${feedback.message}`);
	}

	if (orient?.initialLeads.length) {
		const leads = orient.initialLeads
			.map((l) => `- ${l.path} (score: ${l.score.toFixed(3)})`)
			.join('\n');
		parts.push(`## Initial Search Leads\n${leads}`);
	}

	if (state.findings.length > 0) {
		const lastFinding = state.findings[state.findings.length - 1];
		parts.push(`## Previous Round Summary\n${lastFinding.summary}`);
	}

	parts.push('\nExplore the vault using the tools. Find relevant documents for this query.');

	return parts.join('\n\n');
}

function buildExploreSubmitSystem(): string {
	return `You are analyzing the results of a vault exploration round. Based on the tool results,
assess what was found, extract file paths, and determine if enough evidence has been gathered.

Be accurate about file paths — only include paths that actually appeared in tool results.
Set should_stop=true only when you have high confidence the user's question can be answered with current evidence.`;
}

function buildExploreSubmitPrompt(
	userQuery: string,
	toolResultsMarkdown: string,
	state: ExploreState,
): string {
	return `## User Query
${userQuery}

## Tool Results from This Round
${toolResultsMarkdown}

## Current State
- Verified paths so far: ${state.verifiedPaths.size}
- Rounds completed: ${state.roundCount}
- Previous findings: ${state.findings.map((f) => f.summary).join(' | ')}

Analyze these results and produce a structured assessment.`;
}
