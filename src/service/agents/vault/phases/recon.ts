/**
 * Recon phase: parallel exploration per physical task.
 *
 * Runs runAgentLoop for each task from decompose, in parallel.
 * Returns {path, reason}[] pairs — not just paths.
 *
 * Adapted from conversational/explore.ts with structured evidence output.
 */

import { streamObject } from 'ai';
import { StreamTriggerName, UISignalChannel, UISignalKind } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { VaultSearchEvent } from '../types';
import type { AgentTool } from '@/service/tools/types';
import { PromptId } from '@/service/prompt/PromptId';
import { runAgentLoop } from '../../core/AgentLoop';
import { pathSubmitOutputSchema, type PathSubmitOutput } from '@/core/schemas/agents/search-agent-schemas';
import {
	inspectNoteContextToolMarkdownOnly,
	graphTraversalToolMarkdownOnly,
	exploreFolderToolMarkdownOnly,
	grepFileTreeTool,
	localSearchWholeVaultTool,
	findPathTool,
	hubLocalGraphTool,
} from '@/service/tools/search-graph-inspector';
import type { ClassifyResult, DecomposeResult, PhysicalTask, ReconEvidence, ReconResult } from '../types';
import type { UserFeedback } from '../../core/types';

/** Max iterations per task in the recon loop. */
const RECON_ITERATIONS_PER_TASK = 3;

function buildReconTools(aiServiceManager: AIServiceManager): Record<string, AgentTool> {
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

/**
 * Run one physical task through the PeakAgent recon loop.
 */
async function* runTaskRecon(options: {
	task: PhysicalTask;
	userQuery: string;
	classify: ClassifyResult;
	aiServiceManager: AIServiceManager;
	stepId: string;
}): AsyncGenerator<VaultSearchEvent, ReconEvidence[]> {
	const { task, userQuery, classify, aiServiceManager, stepId } = options;
	const tools = buildReconTools(aiServiceManager);

	interface TaskState {
		discoveredEvidence: ReconEvidence[];
		shouldStop: boolean;
	}

	const loopResult = yield* runAgentLoop<TaskState, PathSubmitOutput>({
		config: {
			stepLabel: `Recon: ${task.description.slice(0, 40)}`,
			maxIterations: RECON_ITERATIONS_PER_TASK,
			tools,
			toolChoice: 'required',
			buildInitialMessages: async () => {
				const initialLeads = classify.initialLeads.length > 0
					? classify.initialLeads.slice(0, 6).map((l) => `- ${l.path} (score: ${l.score.toFixed(3)})`).join('\n')
					: undefined;
				const content = await aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultReconPlan, {
					userQuery,
					taskDescription: task.description,
					targetAreas: task.targetAreas.length > 0 ? task.targetAreas.join('\n') : undefined,
					initialLeads,
				});
				return [{ role: 'user', content }];
			},
			buildPlanSystemPrompt: async () => aiServiceManager.renderPrompt(
				PromptId.AiAnalysisVaultReconPlanSystem,
				{ toolSuggestions: task.toolHints.length > 0 ? `Suggested tools for this task: ${task.toolHints.join(', ')}` : undefined },
			),
			buildPlanInjection: (_state, iter) => {
				if (iter === 0) return [];
				return [{
					role: 'user' as const,
					content: `[Iter ${iter + 1}/${RECON_ITERATIONS_PER_TASK}] Continue exploring. Focus on areas not yet covered in the task.`,
				}];
			},
			runSubmit: async (state, iter, planMessages, toolResults) => {
				try {
					const { model } = aiServiceManager.getModelInstanceForPrompt(
						PromptId.AiAnalysisVaultReconSubmitSystem,
					);
					const toolResultsMarkdown = toolResults
						.filter((m) => m.role === 'tool')
						.map((m) => JSON.stringify(m.content))
						.join('\n\n')
						.slice(0, 6000);

					const [systemPrompt, userPrompt] = await Promise.all([
						aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultReconSubmitSystem, {}),
						aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultReconSubmit, {
							userQuery,
							taskDescription: task.description,
							toolResultsMarkdown,
						}),
					]);

					const submitResult = streamObject({
						model,
						system: systemPrompt,
						prompt: userPrompt,
						schema: pathSubmitOutputSchema,
					});
					// Must consume partialObjectStream to drive the AI SDK internal pipeline.
					for await (const _partial of submitResult.partialObjectStream) { /* drive stream */ }
					return await submitResult.object as PathSubmitOutput;
				} catch {
					return {
						tactical_summary: 'Recon round completed.',
						battlefield_assessment: null,
						lead_strategy: null,
						search_plan: null,
						discovered_leads: null,
						should_submit_report: false,
					};
				}
			},
			mergeSubmit: (state, submit) => {
				const existingPaths = new Set(state.discoveredEvidence.map((e) => e.path));
				const newPaths: ReconEvidence[] = [];

				// Extract paths from discovered_leads
				if (submit.discovered_leads) {
					for (const path of submit.discovered_leads) {
						if (!existingPaths.has(path)) {
							newPaths.push({ path, reason: submit.tactical_summary, taskId: task.id });
							existingPaths.add(path);
						}
					}
				}

				return {
					discoveredEvidence: [...state.discoveredEvidence, ...newPaths],
					shouldStop: submit.should_submit_report,
				};
			},
			shouldStop: (state) => state.shouldStop,
		},
		initialState: { discoveredEvidence: [], shouldStop: false },
		modelForPlan: aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultReconPlanSystem),
		stepId,
		triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON,
	});

	return loopResult.finalState.discoveredEvidence;
}

/**
 * Run recon for all physical tasks, collecting merged {path, reason} evidence.
 */
export async function* runReconPhase(options: {
	userQuery: string;
	classify: ClassifyResult;
	decompose: DecomposeResult;
	aiServiceManager: AIServiceManager;
	stepId: string;
	userFeedback?: UserFeedback;
}): AsyncGenerator<VaultSearchEvent, ReconResult> {
	const { userQuery, classify, decompose, aiServiceManager, stepId } = options;

	yield {
		type: 'pk-debug',
		debugName: 'Recon: starting',
		extra: { taskCount: decompose.tasks.length },
	};

	// Signal recon phase start with dimension info for ring visualization
	const allDimensions = [
		...classify.semantic_dimensions.map((d) => ({ id: d.id, intent_description: d.intent_description })),
		...classify.topology_dimensions.map((d) => ({ id: d.id, intent_description: d.intent_description })),
		...classify.temporal_dimensions.map((d) => ({ id: d.id, intent_description: d.intent_description })),
	];
	yield {
		type: 'ui-signal',
		channel: UISignalChannel.SEARCH_STAGE,
		kind: UISignalKind.STAGE,
		entityId: stepId,
		payload: { stage: 'recon', status: 'start', dimensions: allDimensions, total: decompose.tasks.length },
		triggerName: StreamTriggerName.SEARCH_AI_AGENT,
	} as VaultSearchEvent;

	// Run tasks in parallel — yield progress signals as each completes.
	const allEvidence: ReconEvidence[] = [];
	const seenPaths = new Set<string>();
	const completedIndices: number[] = [];

	// Start all tasks concurrently
	type TaskResult = { index: number; evidence: ReconEvidence[] };
	const completionQueue: TaskResult[] = [];
	let notifyCompletion: (() => void) | null = null;

	const taskPromises = decompose.tasks.map(async (task, i) => {
		const gen = runTaskRecon({ task, userQuery, classify, aiServiceManager, stepId });
		let r: IteratorResult<VaultSearchEvent, ReconEvidence[]>;
		while (!(r = await gen.next()).done) { /* consume events */ }
		completionQueue.push({ index: i, evidence: r.value });
		notifyCompletion?.();
	});

	let tasksFinished = false;
	Promise.all(taskPromises).then(() => {
		tasksFinished = true;
		notifyCompletion?.();
	});

	// Yield progress as each task completes
	while (!tasksFinished || completionQueue.length > 0) {
		if (completionQueue.length > 0) {
			const completed = completionQueue.shift()!;
			completedIndices.push(completed.index);
			yield {
				type: 'ui-signal',
				channel: UISignalChannel.SEARCH_STAGE,
				kind: UISignalKind.PROGRESS,
				entityId: stepId,
				payload: { stage: 'recon', status: 'progress', completedIndices: [...completedIndices], total: decompose.tasks.length },
				triggerName: StreamTriggerName.SEARCH_AI_AGENT,
			} as VaultSearchEvent;
			for (const ev of completed.evidence) {
				if (!seenPaths.has(ev.path)) {
					seenPaths.add(ev.path);
					allEvidence.push(ev);
				}
			}
		} else {
			await new Promise<void>(resolve => { notifyCompletion = resolve; });
		}
	}

	yield {
		type: 'pk-debug',
		debugName: `Recon: all tasks complete`,
		extra: {
			taskCount: decompose.tasks.length,
			totalEvidence: allEvidence.length,
		},
	};

	return { evidence: allEvidence };
}

