/**
 * RawSearchAgent: physical-task recon only. Recon explores via tools; stop when path-submit
 * should_submit_report, then system produces final report. Used by SlotRecallAgent after Search Architect.
 */

import type { AIServiceManager } from '@/service/chat/service-manager';
import { streamText, streamObject } from 'ai';
import type { JSONValue, ModelMessage, ToolModelMessage } from 'ai';
import type { AgentTool } from '@/service/tools/types';
import {
	inspectNoteContextToolMarkdownOnly,
	graphTraversalToolMarkdownOnly,
	exploreFolderToolMarkdownOnly,
	grepFileTreeTool,
	localSearchWholeVaultTool,
	findPathTool,
} from '@/service/tools/search-graph-inspector';
import { PromptId } from '@/service/prompt/PromptId';
import { pathSubmitOutputSchema, type PathSubmitOutput } from '@/core/schemas/agents/search-agent-schemas';
import type { PathSubmitHistoryEntry } from '@/core/schemas/agents/search-agent-schemas';
import type { PhysicalSearchTask, PhysicalTaskReconResult } from '@/core/schemas/agents/search-agent-schemas';
import { AgentContextManager } from './AgentContextManager';
import { LLMStreamEvent, ProviderOptionsConfig, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { SearchUILane } from './helpers/search-ui-events';
import { makeStepId, uiStageSignal, uiStepStart } from './helpers/search-ui-events';
import { buildPromptTraceDebugEvent, parallelStream, streamTransform } from '@/core/providers/helpers/stream-helper';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { getVaultPersona } from '@/service/tools/system-info';
import { isBlankString } from '@/core/utils/common-utils';
import { getFullVaultFilePathsForGrep } from '@/service/tools/search-graph-inspector/explore-folder';
import { AppContext } from '@/app/context/AppContext';
import { compactPathsForPrompt } from '@/core/utils/pathTreeCompact';
import { weavePathsToContext } from './helpers/weavePathsToContext';

/** Resolve path-submit output (lead_strategy + search_plan + discovered_leads) to a full list of file paths. */
async function resolvePathSubmitToPaths(report: PathSubmitOutput, getFullVaultPaths: () => string[]): Promise<string[]> {
	const paths = new Set<string>();

	if (report.lead_strategy?.must_expand_prefixes?.length) {
		const full = getFullVaultPaths();
		const maxCap = report.lead_strategy.max_expand_results ?? 5000;
		let expanded: string[] = full.filter((p) =>
			report.lead_strategy!.must_expand_prefixes!.some((prefix) => {
				const norm = prefix.replace(/\/$/, '');
				return norm === '' ? true : p === norm || p.startsWith(norm + '/');
			})
		);
		const includeRegex = report.lead_strategy.include_path_regex;
		if (includeRegex?.length) {
			const compiled = includeRegex.map((r) => {
				try {
					return new RegExp(r, 'i');
				} catch {
					return null;
				}
			}).filter(Boolean) as RegExp[];
			if (compiled.length) expanded = expanded.filter((p) => compiled.some((re) => re.test(p)));
		}
		const excludeRegex = report.lead_strategy.exclude_path_regex;
		if (excludeRegex?.length) {
			const compiled = excludeRegex.map((r) => {
				try {
					return new RegExp(r, 'i');
				} catch {
					return null;
				}
			}).filter(Boolean) as RegExp[];
			if (compiled.length) expanded = expanded.filter((p) => !compiled.some((re) => re.test(p)));
		}
		expanded.slice(0, maxCap).forEach((p) => paths.add(p));
	}

	if (report.search_plan?.length) {
		const client = AppContext.getInstance().searchClient;
		for (const item of report.search_plan) {
			try {
				const res = await client.search({
					text: item.query,
					scopeMode: 'inFolder',
					scopeValue: { folderPath: item.scope_path },
					topK: item.top_k ?? 80,
					searchMode: item.search_mode ?? 'fulltext',
					indexTenant: 'vault',
				});
				(res.items ?? []).forEach((i) => paths.add(i.path));
			} catch {
				// skip failed search
			}
		}
	}

	if (report.discovered_leads?.length) {
		const mdOnly = report.discovered_leads.filter((p) => /\.md$/i.test(p));
		mdOnly.forEach((p) => paths.add(p));
	}

	return Array.from(paths).sort();
}

export class RawSearchAgent {

	private reconAgent: ReconAgent;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager
	) {
		this.reconAgent = new ReconAgent(this.aiServiceManager, this.context);
	}

	/**
	 * Recon-only path for physical tasks (Search Architect output). Uses physical-task recon prompt (unified_intent).
	 * onReconFinish receives (results, mergedPaths, weavedContext).
	 */
	async *streamSearchReconOnlyForPhysicalTasks(options: {
		runStepId?: string;
		physicalTasks: PhysicalSearchTask[];
		onReconFinish: (results: PhysicalTaskReconResult[], mergedPaths: string[], weavedContext?: string) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		const stopWatch = new Stopwatch("streamSearchReconOnlyForPhysicalTasks");
		const { runStepId, physicalTasks, onReconFinish } = options;
		let lastResults: PhysicalTaskReconResult[] = [];
		let lastMergedPaths: string[] = [];
		let lastWeavedContext: string = '';

		stopWatch.start("streamPhysicalTasksReconOnly");
		yield* this.reconAgent.streamPhysicalTasksReconOnly({
			runStepId,
			physicalTasks,
			stepId: runStepId ?? generateUuidWithoutHyphens(),
			onReconFinish: (results, mergedPaths, weavedContext) => {
				lastResults = results;
				lastMergedPaths = mergedPaths;
				lastWeavedContext = weavedContext ?? '';
				onReconFinish(results, mergedPaths, weavedContext);
			},
		});
		stopWatch.stop();

		yield {
			type: 'pk-debug',
			debugName: 'streamSearchReconOnlyForPhysicalTasksResult',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT,
			extra: {
				physicalTasksCount: physicalTasks.length,
				durationLabel: 'streamSearchReconOnlyForPhysicalTasks',
				totalDuration: stopWatch.getTotalElapsed(),
				lastResults,
				lastMergedPaths,
				lastWeavedContext,
			},
		};
	}
}

export class ReconAgent {

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
	}

	/**
	 * Runs parallel recon for physical tasks (Search Architect output). Uses physical-task recon prompt.
	 * Collects one result per run; merges all paths; weaves paths to context; onReconFinish(results, mergedPaths, weavedContext).
	 */
	async *streamPhysicalTasksReconOnly(options: {
		runStepId?: string;
		physicalTasks: PhysicalSearchTask[];
		stepId?: string;
		onReconFinish: (results: PhysicalTaskReconResult[], mergedPaths: string[], weavedContext?: string) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		const { runStepId, physicalTasks, onReconFinish } = options;
		const stepId = options.stepId ?? runStepId ?? generateUuidWithoutHyphens();

		const reconMeta = runStepId
			? { runStepId, stage: 'recon' as const, agent: 'RawSearchAgent.Recon' }
			: null;
		if (reconMeta) {
			yield uiStepStart(reconMeta, {
				title: 'Parallel recon (physical tasks)…',
				description: `${physicalTasks.length} task(s)`,
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON,
			});
		}

		const stopWatch = new Stopwatch("streamPhysicalTasksReconOnly");

		stopWatch.start("parallel_physical_tasks_recon");
		const results: (PhysicalTaskReconResult | undefined)[] = new Array(physicalTasks.length);
		const reconStreams = physicalTasks.map((task, index) => {
			const lane: SearchUILane = { laneType: 'physical-task' as const, laneId: `physical-${index}`, index };
			const taskStepId = reconMeta && runStepId
				? makeStepId({ ...reconMeta, lane })
				: `${index}-${generateUuidWithoutHyphens()}`;
			return this.streamReconForPhysicalTask(task, taskStepId, (result) => {
				results[index] = result;
			});
		});
		for await (const ev of parallelStream(reconStreams)) {
			yield ev;
			if (ev.type === 'parallel-stream-progress' && reconMeta) {
				yield uiStageSignal(reconMeta, {
					status: 'progress',
					payload: {
						completed: (ev as { completed: number }).completed,
						total: (ev as { total: number }).total,
						completedIndices: (ev as { completedIndices?: number[] }).completedIndices ?? [],
					},
					triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON,
				});
			}
		}
		stopWatch.stop();
		if (reconMeta) {
			yield uiStageSignal(reconMeta, { status: 'complete', payload: { physicalTasks: physicalTasks.length }, triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON });
		}

		const finishedResults = results.filter((r): r is PhysicalTaskReconResult => r != null);
		const mergedPaths = [...new Set(finishedResults.flatMap((r) => r.paths))].sort();
		const tm = this.aiServiceManager.getTemplateManager?.();
		const weavedContext = await weavePathsToContext(mergedPaths, tm);
		onReconFinish(finishedResults, mergedPaths, weavedContext ?? '');
		yield {
			type: 'pk-debug',
			debugName: 'parallelPhysicalTasksReconResult',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				physicalTasksCount: physicalTasks.length,
				resultsCount: finishedResults.length,
				mergedPathsCount: mergedPaths.length,
				stepDuration: stopWatch.getLastDuration(),
				physicalTaskResults: finishedResults,
				mergedPaths,
			},
		};
	}

	/**
	 * Recon for one physical task (unified_intent). Reuses dimension recon prompt with unified_intent + scope.
	 */
	async *streamReconForPhysicalTask(
		physicalTask: PhysicalSearchTask,
		stepId?: string,
		onResult?: (result: PhysicalTaskReconResult) => void,
	): AsyncGenerator<LLMStreamEvent> {
		const singleReconAgent = new SingleReconAgent(this.aiServiceManager, this.context);
		yield* singleReconAgent.streamReconForPhysicalTask(physicalTask, stepId, onResult);
	}
}

/** Max iterations for manual recon loop (manifest / inventory tasks). */
const RECON_MANUAL_LOOP_MAX_ITERATIONS_MANIFEST = 10;
/** Max iterations for non-manifest recon (smaller budget, anchor→expand then stop). */
const RECON_MANUAL_LOOP_MAX_ITERATIONS_DEFAULT = 5;

/** Context for the recon manual loop; all prompts are rendered from templates using this. */
export interface ReconLoopContext {
	userQuery: string;
	dimensionId?: string;
	intent_description?: string;
	unified_intent?: string;
	coveredDimensionIds?: string;
	inventoryRequiresManifest?: boolean;
	scopePath?: string;
	scopeAnchor?: string;
	scopeTags?: string;
	vaultDescription?: string;
	vaultStructure?: string;
	vaultTopTags?: string;
	vaultCapabilities?: string;
	maxIterations: number;
}

/** Build a short task-reminder string for re-injection (plan, path-submit, final report). Not appended to history. */
function buildTaskReminder(ctx: ReconLoopContext): string {
	const parts: string[] = [
		'[Task focus — stay aligned]',
		'User query: ' + (ctx.userQuery || '(none)'),
	];
	if (ctx.dimensionId) parts.push('Dimension: ' + ctx.dimensionId);
	if (ctx.intent_description) parts.push('Intent: ' + ctx.intent_description);
	if (ctx.unified_intent) parts.push('Unified intent: ' + ctx.unified_intent);
	return parts.join('\n');
}

/** Result passed from runManualReconLoop to the caller (no LLM report step). */
type ReconLoopResult = {
	paths: string[];
	messages: ModelMessage[];
	pathSubmitHistory: Array<PathSubmitHistoryEntry>;
};

class SingleReconAgent {

	private reconResultRef: ((result: ReconLoopResult) => void) | null = null;

	private readonly explorationTools: Record<string, AgentTool>;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
		const tm = this.aiServiceManager.getTemplateManager?.();
		this.explorationTools = {
			inspect_note_context: inspectNoteContextToolMarkdownOnly(tm),
			graph_traversal: graphTraversalToolMarkdownOnly(tm),
			find_path: findPathTool(tm),
			explore_folder: exploreFolderToolMarkdownOnly(tm),
			grep_file_tree: grepFileTreeTool(),
			local_search_whole_vault: localSearchWholeVaultTool(tm),
		};
	}

	private async *runPlanRecon(ops: {
		iter: number;
		ctx: ReconLoopContext;
		messages: ModelMessage[];
		stepId: string;
		onPlanFinish: (messages: ModelMessage[]) => void;
		stopwatch: Stopwatch;
	}): AsyncGenerator<LLMStreamEvent> {
		const { iter, ctx, messages, stepId, onPlanFinish, stopwatch } = ops;

		stopwatch.start('[iteration ' + iter + '] plan step messages.');
		yield {
			type: 'pk-debug',
			debugName: 'Recon Manual Loop - iteration ' + iter + ' plan step start.',
			extra: { currentMessages: JSON.stringify(messages) },
		};
		const planStepMessages: ModelMessage[] = [];
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReconLoopPlanSystem, ctx);
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_RECON_PLAN_STEP, system, JSON.stringify(messages));
		const stepResult = streamText({
			model: this.aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisReconLoopPlanSystem).model,
			system,
			messages,
			tools: this.explorationTools,
			toolChoice: 'required',
		});
		yield* streamTransform(stepResult.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_RECON_PLAN_STEP, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
		});
		const responseReasoning = (await stepResult.reasoning).map((r) => r.text).join('\n');
		if (!isBlankString(responseReasoning)) {
			planStepMessages.push({ role: 'assistant', content: responseReasoning });
		}
		const responseText = await stepResult.text;
		if (!isBlankString(responseText)) {
			planStepMessages.push({ role: 'assistant', content: responseText });
		}
		const toolCalls = await stepResult.toolCalls;
		if (toolCalls.length > 0) {
			planStepMessages.push({
				role: 'assistant',
				content: toolCalls.map((tc) => ({
					type: 'tool-call',
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					input: tc.input,
				})),
			});
		}

		stopwatch.stop();
		yield {
			type: 'pk-debug',
			debugName: 'Recon Manual Loop - iteration ' + iter + ' plan step finish.',
			extra: {
				currentStepCost: stopwatch.getLastDuration(),
				responseMessages: JSON.stringify(planStepMessages),
			},
		};
		onPlanFinish(planStepMessages);
	}

	private async *runReconTool(ops: {
		iter: number;
		planStepMessages: ModelMessage[];
		stopwatch: Stopwatch;
		onToolCallFinish: (fullMessages: ModelMessage[], summaryMessages: ModelMessage[], needToSubmitPaths: boolean) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		const { iter, planStepMessages, stopwatch, onToolCallFinish } = ops;
		stopwatch.start('[iteration ' + iter + '] process tool calls.');

		const toolCalls = planStepMessages.flatMap((msg) =>
			msg.role === 'assistant' && Array.isArray(msg.content)
				? msg.content.filter((part) => part.type === 'tool-call')
				: []
		);

		const currentRoundToolMessagesFull: ModelMessage[] = [];
		const currentRoundToolMessagesSummary: ModelMessage[] = [];
		for (const tc of toolCalls) {
			const exec = this.explorationTools[tc.toolName];
			if (!exec || !exec.execute) continue;
			let output: unknown;
			try {
				output = await exec.execute(tc.input);
			} catch (err) {
				console.error('[RawSearchAgent][runReconTool] Error executing tool', tc.toolName, tc.input, err);
				output = { error: err instanceof Error ? err.message : String(err) };
			}

			const toolResultGetter = (outputValue: string | JSONValue): ToolModelMessage => ({
				role: 'tool',
				content: [{
					type: 'tool-result',
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					output: typeof outputValue === 'string'
						? { type: 'text', value: outputValue }
						: { type: 'json', value: outputValue },
				}],
			});
			currentRoundToolMessagesFull.push(toolResultGetter(output as string | JSONValue));
			currentRoundToolMessagesSummary.push(toolResultGetter('[truncated for context]'));
		}
		stopwatch.stop();
		yield {
			type: 'pk-debug',
			debugName: 'Recon Manual Loop - iteration ' + iter + ' process tool calls',
			extra: { currentStepCost: stopwatch.getLastDuration() },
		};
		onToolCallFinish(currentRoundToolMessagesFull, currentRoundToolMessagesSummary, toolCalls.length > 0);
	}

	private async *runSubmitReconPaths(ops: {
		iter: number;
		ctx: ReconLoopContext;
		planStepMessages: ModelMessage[];
		fullToolResultMessages: ModelMessage[];
		alreadyCollectedPaths: string[];
		previousPathSubmitHistory?: Array<PathSubmitHistoryEntry>;
		stepId: string;
		stopwatch: Stopwatch;
		onSubmitFinish: (discovered_leads_callback: string[], pathSubmitOutput?: PathSubmitOutput) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		const { iter, ctx, planStepMessages, fullToolResultMessages, alreadyCollectedPaths, previousPathSubmitHistory, stepId, stopwatch, onSubmitFinish } = ops;

		stopwatch.start('[iteration ' + iter + '] path submit.');
		const systemPathSubmit = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReconLoopPathSubmitSystem, {});
		const taskReminderMessage: ModelMessage[] = [{ role: 'user', content: buildTaskReminder(ctx) }];
		const historyMessage: ModelMessage[] = (previousPathSubmitHistory?.length ?? 0) > 0
			? [{ role: 'user', content: 'Previous rounds\' path-submit strategies (do not duplicate must_expand_prefixes or search_plan):\n' + JSON.stringify(previousPathSubmitHistory) }]
			: [];
		const currentPathsMessage: ModelMessage[] = alreadyCollectedPaths.length > 0
			? [{ role: 'user', content: 'Current paths already collected (do not include in discovered_leads):\n' + compactPathsForPrompt(alreadyCollectedPaths) }]
			: [];
		const messages = [...taskReminderMessage, ...historyMessage, ...currentPathsMessage, ...planStepMessages, ...fullToolResultMessages];
		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_RECON_PATH_SUBMIT_STEP, systemPathSubmit, JSON.stringify(messages));

		const providerOptionsConfig: ProviderOptionsConfig = {
			noReasoning: false,
			reasoningEffort: 'low',
		};
		const { model: modelPathSubmit, providerOptions } = this.aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisReconLoopPathSubmitSystem, providerOptionsConfig);
		const pathResult = streamObject({
			model: modelPathSubmit,
			system: systemPathSubmit,
			messages,
			schema: pathSubmitOutputSchema,
			providerOptions,
		});
		yield* streamTransform(pathResult.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_RECON_PATH_SUBMIT_STEP, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
		});
		let pathSubmitOutput: PathSubmitOutput | undefined;
		let resolvedPaths: string[] = [];
		try {
			pathSubmitOutput = (await pathResult.object) as PathSubmitOutput;
			resolvedPaths = await resolvePathSubmitToPaths(pathSubmitOutput, getFullVaultFilePathsForGrep);
		} catch {
			resolvedPaths = [];
		}
		stopwatch.stop();
		yield {
			type: 'pk-debug',
			debugName: 'Recon Manual Loop - iteration ' + iter + ' path submit result',
			extra: {
				currentStepCost: stopwatch.getLastDuration(),
				pathSubmitOutput,
				resolvedPaths,
			},
		};
		onSubmitFinish(resolvedPaths, pathSubmitOutput);
	}

	private async *runManualReconLoop(
		ctx: ReconLoopContext,
		stepId: string,
		triggerName: StreamTriggerName,
	): AsyncGenerator<LLMStreamEvent> {
		const stopwatch = new Stopwatch('Recon Manual Loop');
		const messages: ModelMessage[] = [
			{ role: 'user', content: await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisReconLoopPlan, ctx) },
		];
		const allPaths: Set<string> = new Set();
		const pathSubmitHistory: Array<PathSubmitHistoryEntry> = [];
		for (let iter = 0; iter < ctx.maxIterations; iter++) {
			const planStepMessages: ModelMessage[] = [];
			yield* this.runPlanRecon({
				iter,
				ctx,
				stopwatch,
				stepId,
				messages: [
					...messages,
					{ role: 'user', content: buildTaskReminder(ctx) },
					{
						role: 'assistant',
						content: allPaths.size === 0 ? 'Current paths: (none yet)' : 'Current paths (compact):\n' + compactPathsForPrompt(Array.from(allPaths)),
					},
				],
				onPlanFinish: (messageCallback) => planStepMessages.push(...messageCallback),
			});

			let needToSubmitPaths = false;
			let fullToolResultMessages: ModelMessage[] = [];
			let summaryToolResultMessages: ModelMessage[] = [];
			yield* this.runReconTool({
				iter,
				planStepMessages,
				stopwatch,
				onToolCallFinish: (fullMessages, summaryMessages, needSubmitPaths) => {
					fullToolResultMessages = fullMessages;
					summaryToolResultMessages = summaryMessages;
					needToSubmitPaths = needSubmitPaths;
				},
			});
			let lastPathSubmitOutput: PathSubmitOutput | undefined;
			let discoveredLeadsCollection: string[] = [];
			if (needToSubmitPaths) {
				yield* this.runSubmitReconPaths({
					iter,
					ctx,
					planStepMessages,
					fullToolResultMessages,
					alreadyCollectedPaths: Array.from(allPaths),
					previousPathSubmitHistory: pathSubmitHistory,
					stepId,
					stopwatch,
					onSubmitFinish: (discovered_leads_callback, pathSubmitOutput) => {
						discoveredLeadsCollection = discovered_leads_callback;
						lastPathSubmitOutput = pathSubmitOutput;
					},
				});
			}

			messages.push(...planStepMessages);
			messages.push(...summaryToolResultMessages);
			messages.push({
				role: 'assistant',
				content: JSON.stringify({
					tactical_summary: lastPathSubmitOutput?.tactical_summary ?? '',
					battlefield_assessment: lastPathSubmitOutput?.battlefield_assessment ?? null,
					lead_strategy: lastPathSubmitOutput?.lead_strategy,
					search_plan: lastPathSubmitOutput?.search_plan,
					resolved_count: discoveredLeadsCollection?.length ?? 0,
				}),
			});
			discoveredLeadsCollection.forEach((p) => allPaths.add(p));
			pathSubmitHistory.push({
				lead_strategy: lastPathSubmitOutput?.lead_strategy,
				search_plan: lastPathSubmitOutput?.search_plan,
				resolved_count: discoveredLeadsCollection?.length ?? 0,
			});

			if (lastPathSubmitOutput?.should_submit_report === true) break;
		}

		yield {
			type: 'pk-debug',
			debugName: 'Recon Manual Loop',
			extra: {
				stopwatch: stopwatch.toString(),
				pathsCount: allPaths.size,
				pathSubmitHistory,
			},
		};
		this.reconResultRef?.({
			paths: Array.from(allPaths).sort(),
			messages,
			pathSubmitHistory,
		});
		this.reconResultRef = null;
	}

	/**
	 * Recon for one physical task (unified_intent). Reuses dimension recon prompt with unified_intent + scope.
	 * Passes back paths, messages, pathSubmitHistory (no final report step).
	 */
	async *streamReconForPhysicalTask(
		physicalTask: PhysicalSearchTask,
		stepId?: string,
		onResult?: (result: PhysicalTaskReconResult) => void,
	): AsyncGenerator<LLMStreamEvent> {
		if (!stepId) stepId = generateUuidWithoutHyphens();
		const scope = physicalTask.scope_constraint;
		const persona = await getVaultPersona();
		const isManifest = physicalTask.covered_dimension_ids.includes('inventory_mapping');
		const maxIterations = isManifest ? RECON_MANUAL_LOOP_MAX_ITERATIONS_MANIFEST : RECON_MANUAL_LOOP_MAX_ITERATIONS_DEFAULT;
		const ctx: ReconLoopContext = {
			userQuery: this.context.getInitialPrompt(),
			unified_intent: physicalTask.unified_intent,
			coveredDimensionIds: physicalTask.covered_dimension_ids.join(', '),
			inventoryRequiresManifest: isManifest,
			scopePath: scope?.path,
			scopeAnchor: scope?.anchor_entity,
			scopeTags: scope?.tags?.length ? scope.tags.join(', ') : undefined,
			vaultDescription: persona.description,
			vaultStructure: persona.structure,
			vaultTopTags: persona.topTags,
			vaultCapabilities: persona.capabilities,
			maxIterations,
		};
		this.reconResultRef = (loopResult) => {
			onResult?.({
				task: physicalTask,
				paths: loopResult.paths,
				messages: loopResult.messages,
				pathSubmitHistory: loopResult.pathSubmitHistory,
			});
		};
		yield* this.runManualReconLoop(ctx, stepId, StreamTriggerName.SEARCH_RAW_AGENT_RECON);
	}
}
