/**
 * RawSearchAgent: Recon (breadth) + Evidence (depth) per dimension.
 * Recon: explore only, submit_rawsearch_report. Evidence: read from leads, submit_evidence_pack.
 */

import type { AIServiceManager } from '@/service/chat/service-manager';
import { Experimental_Agent as Agent, streamText, Output } from 'ai';
import { safeAgentTool, type AgentTool } from '@/service/tools/types';
import { contentReaderTool } from '@/service/tools/content-reader';
import {
	inspectNoteContextTool,
	graphTraversalTool,
	findKeyNodesTool,
	searchByDimensionsTool,
	exploreFolderTool,
	exploreFolderToolMarkdownOnly,
	recentChangesWholeVaultTool,
	localSearchWholeVaultTool,
	findPathTool,
	findOrphansTool,
} from '@/service/tools/search-graph-inspector';
import { PromptId } from '@/service/prompt/PromptId';
import { consolidatorOutputSchema, rawSearchReportSchema, submitEvidencePackInputSchema, markTaskCompletedInputSchema, type RawSearchReport } from '@/core/schemas/agents/search-agent-schemas';
import type { ConsolidatedTaskWithId, ConsolidatorOutput, EvidenceTaskGroup, EvidencePack, RawSearchReportWithDimension, AllDimensionId } from '@/core/schemas/agents/search-agent-schemas';
import type { DimensionChoice } from '@/core/schemas/agents/search-agent-schemas';
import { AgentContextManager } from './AgentContextManager';
import { GroupContextAgent } from './GroupContextAgent';
import { LLMStreamEvent, ProviderOptionsConfig, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { SearchUILane } from './helpers/search-ui-events';
import { makeStepId, uiStageSignal, uiStepStart } from './helpers/search-ui-events';
import { buildPromptTraceDebugEvent, parallelStream, streamTransform } from '@/core/providers/helpers/stream-helper';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { getVaultPersona } from '@/service/tools/system-info';
import { groupConsolidatedTasksGravity } from './helpers/gravityGrouping';

/** Build a ConsolidatorOutput from recon reports when the LLM consolidator returns null. One task per unique path from discovered_leads. */
function buildFallbackConsolidatorOutput(
	dimensions: DimensionChoice[],
	reports: RawSearchReportWithDimension[],
): ConsolidatorOutput {
	const dimensionMap = new Map<AllDimensionId, DimensionChoice>();
	for (const dimension of dimensions) {
		dimensionMap.set(dimension.id, dimension);
	}

	const allPaths = [...new Set(reports.flatMap((r) => r.discovered_leads ?? []))];
	const pathToDimensionMap: Record<string, DimensionChoice[]> = {};
	for (const report of reports) {
		for (const path of report.discovered_leads ?? []) {
			if (!pathToDimensionMap[path]) {
				pathToDimensionMap[path] = [];
			}
			const dimension = dimensionMap.get(report.dimension);
			if (dimension) {
				pathToDimensionMap[path].push(dimension);
			}
		}
	}
	const consolidated_tasks = allPaths.map((path) => {
		return {
			path,
			relevant_dimension_ids: pathToDimensionMap[path].map((dimension) => ({
				id: dimension.id,
				intent: dimension.intent_description,
			})),
			extraction_focus: `Extract evidence for this file.`,
			priority: 'Secondary' as const,
			task_load: 'medium' as const,
		};
	});
	return {
		consolidated_tasks,
		global_recon_insight: 'Fallback: tasks derived from recon discovered_leads only (consolidator output was null).',
	};
}

export class RawSearchAgent {

	private reconAgent: ReconAgent;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager
	) {
		this.reconAgent = new ReconAgent(this.aiServiceManager, this.context);
	}

	async *streamSearchForOneDimension(dimension: DimensionChoice, stepId?: string): AsyncGenerator<LLMStreamEvent> {
		if (!stepId) {
			stepId = generateUuidWithoutHyphens();
		}
		let report: RawSearchReport | undefined;
		yield* this.reconAgent.streamRecon(dimension, stepId, (r) => {
			report = r;
		});

		if (report) {
			const evidenceAgent = new EvidenceAgent(this.aiServiceManager, this.context);
			yield* evidenceAgent.streamEvidence(dimension, report, stepId);
		}
	}

	async *streamSearch(options: {
		runStepId?: string;
		dimensions: DimensionChoice[];
		onAllEvidenceFinish: (evidencePacks: EvidencePack[]) => void;
		onGroupEvidenceFinish?: (groupTasks: ConsolidatedTaskWithId[], evidencePacks: EvidencePack[]) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		const stopWatch = new Stopwatch("streamSearch");
		const { runStepId, dimensions, onAllEvidenceFinish, onGroupEvidenceFinish } = options;

		stopWatch.start("batchStreamRecon");
		let evidenceTaskGroups: EvidenceTaskGroup[] = [];
		yield* this.reconAgent.batchStreamRecon({
			runStepId,
			dimensions,
			stepId: runStepId ?? generateUuidWithoutHyphens(),
			onReconFinish: (eg) => {
				evidenceTaskGroups = eg;
			},
		});
		this.context.setRecallEvidenceTaskGroups(evidenceTaskGroups);
		stopWatch.stop();
		yield {
			type: 'pk-debug',
			debugName: 'parallelSearchResultAfterBatchRecon',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT,
			extra: {
				evidenceTaskGroups,
				durationLabel: 'parallelSearchResultAfterBatchRecon',
				totalDuration: stopWatch.getTotalElapsed(),
				stepDuration: stopWatch.getLastDuration(),
			},
		}

		const evidencePacks: EvidencePack[] = [];
		stopWatch.start("parallelStreamTaskEvidence");
		const groupStreams = evidenceTaskGroups.map((eg, idx) => {
			const evidenceAgent = new EvidenceAgent(this.aiServiceManager, this.context);
			const groupId = eg.groupId ?? `group_${String(idx).padStart(3, '0')}`;
			return evidenceAgent.streamTaskEvidence({
				tasks: eg.tasks,
				groupFocus: eg.group_focus,
				topicAnchor: eg.topic_anchor,
				groupSharedContext: eg.sharedContext,
				stepId: runStepId ? makeStepId({ runStepId, stage: 'evidence', lane: { laneType: 'group', laneId: groupId, index: idx }, agent: 'EvidenceAgent' }) : generateUuidWithoutHyphens(),
				runStepId,
				groupId,
				onEvidenceFinish: (p) => {
					evidencePacks.push(...p);
					onGroupEvidenceFinish?.(eg.tasks, p);
				},
			});
		});
		const evidenceMeta = runStepId ? { runStepId, stage: 'evidence' as const, agent: 'RawSearchAgent' } : null;
		for await (const ev of parallelStream(groupStreams)) {
			yield ev;
			if (ev.type === 'parallel-stream-progress' && evidenceMeta) {
				yield uiStageSignal(evidenceMeta, {
					status: 'progress',
					payload: {
						completed: (ev as { completed: number }).completed,
						total: (ev as { total: number }).total,
						completedIndices: (ev as { completedIndices?: number[] }).completedIndices ?? [],
					},
					triggerName: StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE,
				});
			}
		}
		this.context.setRecallEvidencePacks(evidencePacks);
		stopWatch.stop();

		yield {
			type: 'pk-debug',
			debugName: 'streamSearchResultAfterGroupEvidence',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT,
			extra: {
				evidenceGroups: evidenceTaskGroups,
				evidencePacks,
				durationLabel: 'streamSearchResultAfterGroupEvidence',
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		}

		onAllEvidenceFinish(evidencePacks);
	}
}

type ReconAgentTools = {
	submit_rawsearch_report: AgentTool;
	inspect_note_context: AgentTool;
	graph_traversal: AgentTool;
	find_key_nodes: AgentTool;
	search_by_dimensions: AgentTool;
	find_path: AgentTool;
	find_orphans: AgentTool;
	explore_folder: AgentTool;
	recent_changes_whole_vault: AgentTool;
	local_search_whole_vault: AgentTool;
}

class ReconAgent {

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
	}

	async *batchStreamRecon(options: {
		runStepId?: string;
		dimensions: DimensionChoice[];
		stepId?: string;
		onReconFinish?: (evidenceTaskGroups: EvidenceTaskGroup[]) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		let { runStepId, dimensions, stepId, onReconFinish } = options;
		if (!stepId) {
			stepId = runStepId ?? generateUuidWithoutHyphens();
		}

		const reconMeta = runStepId
			? { runStepId, stage: 'recon' as const, agent: 'RawSearchAgent.Recon' }
			: null;
		if (reconMeta) {
			yield uiStepStart(reconMeta, {
				title: 'Parallel recon…',
				description: `${dimensions.length} dimension(s)`,
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON,
			});
		}

		const stopWatch = new Stopwatch("batchStreamRecon");
		stopWatch.start("parallel_all_dimensions_recon");
		const reports: RawSearchReportWithDimension[] = [];
		const reconStreams = dimensions.map((dimension, index) => {
			const lane: SearchUILane = { laneType: 'dimension', laneId: dimension.id, index };
			const dimensionStepId =
				reconMeta && runStepId
					? makeStepId({ ...reconMeta, lane })
					: `${index}-${dimension.id}-${generateUuidWithoutHyphens()}`;
			return this.streamRecon(dimension, dimensionStepId, (report) => {
				reports.push({ dimension: dimension.id, ...report });
			}, runStepId ? { runStepId, lane } : undefined);
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
			yield uiStageSignal(reconMeta, { status: 'complete', payload: { dimensions: dimensions.length }, triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON });
		}

		this.context.setReconReports(reports);

		yield {
			type: 'pk-debug',
			debugName: 'parallelSearchResultAfterRecon',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				reconReports: reports,
				durationLabel: 'parallelSearchResultAfterRecon',
				stepDuration: stopWatch.getLastDuration(),
			},
		}

		stopWatch.start("streamTaskConsolidator");
		// gen task from recon reports.
		let consolidatorOutput: ConsolidatorOutput | undefined;
		yield* this.streamTaskConsolidator({
			dimensions,
			reports,
			stepId,
			onConsolidatorFinish: (p) => {
				consolidatorOutput = p;
				this.context.setConsolidatorOutput(p);
			},
		});
		stopWatch.stop();

		yield {
			type: 'pk-debug',
			debugName: 'parallelSearchResultAfterTaskConsolidator',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				consolidatorOutput,
				durationLabel: 'parallelSearchResultAfterTaskConsolidator',
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		}

		if (!consolidatorOutput) {
			consolidatorOutput = buildFallbackConsolidatorOutput(dimensions, reports);
			this.context.setConsolidatorOutput(consolidatorOutput);
		}

		stopWatch.start("groupConsolidatedTasks");
		const groupingMeta = stepId ? { runStepId: stepId, stage: 'grouping' as const, agent: 'RawSearchAgent' } : null;
		if (groupingMeta) {
			yield uiStepStart(groupingMeta, {
				title: 'Grouping tasks…',
				description: `${consolidatorOutput.consolidated_tasks.length} task(s)`,
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			});
		}
		const consolidatedTasks = consolidatorOutput.consolidated_tasks.map((t, i) =>
			({ ...t, taskId: `task-${i}` })
		);
		const groups = await groupConsolidatedTasksGravity(consolidatedTasks);
		if (groupingMeta) {
			yield uiStageSignal(groupingMeta, {
				status: 'progress',
				payload: { groupCount: groups.length },
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			});
		}
		yield {
			type: 'pk-debug',
			debugName: 'groupConsolidatedTasksGravity',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				groups,
				durationLabel: 'groupConsolidatedTasksGravity',
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		}

		stopWatch.start("streamGroupContextRefinement");
		let evidenceTaskGroups: EvidenceTaskGroup[] = [];
		const groupContextAgent = new GroupContextAgent(this.aiServiceManager, this.context);
		yield* groupContextAgent.streamAllGroupsContext({
			groups,
			dimensions,
			stepId,
			onRefinementFinish: (eg) => { evidenceTaskGroups = eg; },
		});
		stopWatch.stop();
		yield {
			type: 'pk-debug',
			debugName: 'groupContextRefinement',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				evidenceGroups: evidenceTaskGroups,
				durationLabel: 'groupContextRefinement',
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		};

		onReconFinish?.(evidenceTaskGroups);
		if (groupingMeta) {
			yield uiStageSignal(groupingMeta, {
				status: 'complete',
				payload: {
					groups: evidenceTaskGroups.map((g) => ({
						groupId: g.groupId,
						topic_anchor: g.topic_anchor,
						group_focus: g.group_focus,
					})),
				},
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			});
		}
	}

	private async *streamTaskConsolidator(
		options: {
			dimensions: DimensionChoice[];
			reports: RawSearchReportWithDimension[];
			stepId?: string;
			onConsolidatorFinish?: (consolidatorOutput: ConsolidatorOutput) => void;
		}
	): AsyncGenerator<LLMStreamEvent> {
		let { dimensions, reports, stepId, onConsolidatorFinish } = options;
		stepId = stepId ?? generateUuidWithoutHyphens();
		const consolidateMeta = { runStepId: stepId, stage: 'consolidate' as const, agent: 'RawSearchAgent.Consolidator' };
		const stepIdConsolidate = makeStepId(consolidateMeta);

		const hasLeads = reports.some((r) => (r.discovered_leads?.length ?? 0) > 0);
		if (!hasLeads || reports.length === 0) {
			yield {
				type: 'pk-debug',
				debugName: 'parallelSearchResultAfterClassify',
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
				extra: { evidencePacks: this.context.getRecallEvidencePacks(), reconReports: reports },
			};
			return;
		}
		yield uiStepStart(consolidateMeta, {
			title: 'Consolidating tasks…',
			description: '',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
		});

		try {
			const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisTaskConsolidatorSystem, {});
			const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisTaskConsolidator, {
				userQuery: this.context.getInitialPrompt(),
				dimensions,
				reports,
			});
			const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisTaskConsolidator);
			const providerOptionsConfig: ProviderOptionsConfig = {
				noReasoning: false,
				reasoningEffort: 'low',
			}
			const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId, providerOptionsConfig);
			const providerOptions = this.aiServiceManager.getMultiChat().getProviderService(provider).getProviderOptions(providerOptionsConfig);
			const result = streamText({
				model,
				system,
				prompt,
				providerOptions,
				experimental_output: Output.object({
					schema: consolidatorOutputSchema,
				}),
			});
			yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR, system, prompt);
			yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR, {
				yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId: stepIdConsolidate },
			});
			const text = await result.text;
			const parsed = consolidatorOutputSchema.safeParse(JSON.parse(text));
			if (parsed.success) onConsolidatorFinish?.(parsed.data);
			yield uiStageSignal(consolidateMeta, { status: 'complete', triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR });
		} catch (err) {
			yield {
				type: 'error',
				error: err instanceof Error ? err : new Error(String(err)),
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			};
			yield uiStageSignal(consolidateMeta, {
				status: 'error',
				payload: { error: err instanceof Error ? err.message : String(err) },
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			});
			yield {
				type: 'pk-debug',
				debugName: 'parallelSearchResultAfterClassify',
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
				extra: { evidencePacks: this.context.getRecallEvidencePacks(), reconReports: reports },
			};
			return;
		}
	}

	async *streamRecon(
		dimension: DimensionChoice,
		stepId?: string,
		reportCollector?: (report: RawSearchReport) => void,
		meta?: { runStepId: string; lane: SearchUILane }
	): AsyncGenerator<LLMStreamEvent> {
		const singleReconAgent = new SingleReconAgent(this.aiServiceManager, this.context);
		yield* singleReconAgent.streamRecon(dimension, stepId, reportCollector, meta);
	}

}

class SingleReconAgent {

	private submitReportSuccess = false;
	private reconAgent: Agent<ReconAgentTools>;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
		const temperature = this.aiServiceManager.getSettings?.()?.defaultOutputControl?.temperature;

		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDimensionEvidence);
		const tm = this.aiServiceManager.getTemplateManager?.();
		this.reconAgent = new Agent<ReconAgentTools>({
			model: this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId),
			tools: {
				submit_rawsearch_report: safeAgentTool({
					description:
						'Submit the recon report. tactical_summary: descriptive summary or preliminary inventory list (up to 500 words). Use discovered_leads to pass specific paths/entities for deeper evidence collection. Optional battlefield_assessment. Call once when done exploring.',
					inputSchema: rawSearchReportSchema,
					execute: async (input) => {
						const report = input as RawSearchReport;
						const parsed = rawSearchReportSchema.safeParse(report);
						if (!parsed.success) return { ok: false, error: parsed.error.message };
						this.context.appendVerifiedPaths(report?.discovered_leads ?? []);
						this.submitReportSuccess = true;
						return { ok: true };
					},
				}),
				inspect_note_context: inspectNoteContextTool(tm),
				graph_traversal: graphTraversalTool(tm),
				find_path: findPathTool(tm),
				find_key_nodes: findKeyNodesTool(tm),
				find_orphans: findOrphansTool(tm),
				search_by_dimensions: searchByDimensionsTool(tm),
				explore_folder: exploreFolderToolMarkdownOnly(tm),
				recent_changes_whole_vault: recentChangesWholeVaultTool(tm),
				local_search_whole_vault: localSearchWholeVaultTool(tm),
			},
			stopWhen: [() => this.submitReportSuccess],
			temperature,
		});
	}

	/**
	 * Recon mode: breadth exploration. Returns report with discovered_leads.
	 * No content_reader; must call submit_rawsearch_report when done.
	 */
	async *streamRecon(
		dimension: DimensionChoice,
		stepId?: string,
		reportCollector?: (report: RawSearchReport) => void,
		meta?: { runStepId: string; lane: SearchUILane }
	): AsyncGenerator<LLMStreamEvent> {
		if (!stepId) {
			stepId = generateUuidWithoutHyphens();
		}
		if (meta) {
			yield uiStepStart(
				{ runStepId: meta.runStepId, stage: 'recon', lane: meta.lane, agent: 'RawSearchAgent.Recon' },
				{
					title: `Recon: ${dimension.id}`,
					description: (dimension.intent_description ?? '').slice(0, 200),
					triggerName: StreamTriggerName.SEARCH_RAW_AGENT_RECON,
				}
			);
		}
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionReconSystem, {});
		const persona = await getVaultPersona();
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionRecon, {
			dimensionId: dimension.id,
			intent_description: dimension.intent_description,
			userQuery: this.context.getInitialPrompt(),
			scopePath: dimension.scope_constraint?.path,
			scopeAnchor: dimension.scope_constraint?.anchor_entity,
			vaultDescription: persona.description,
			vaultStructure: persona.structure,
			vaultTopTags: persona.topTags,
			vaultCapabilities: persona.capabilities,
		});

		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_RECON, system, prompt);

		const stream = this.reconAgent.stream({ system, prompt });
		yield* streamTransform(stream.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_RECON, {
			yieldUIStep: {
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
			},
			chunkEventInterceptor: !reportCollector ? undefined : (event) => {
				if (event.type === 'tool-call' && event.toolName === 'submit_rawsearch_report') {
					reportCollector(event.input as RawSearchReport);
				}
			},
		});
	}
}

type EvidenceAgentTools = {
	submit_evidence_pack: AgentTool;
	content_reader: AgentTool;
	inspect_note_context: AgentTool;
	graph_traversal: AgentTool;
	find_path: AgentTool;
	search_by_dimensions: AgentTool;
	explore_folder: AgentTool;
	recent_changes_whole_vault: AgentTool;
	local_search_whole_vault: AgentTool;
}

/** Batch evidence adds mark_task_completed for completion tracking. */
type EvidenceAgentBatchTools = EvidenceAgentTools & {
	mark_task_completed: AgentTool;
};

export class EvidenceAgent {

	/** Batch evidence: multiple submit_evidence_pack + mark_task_completed. */
	private batchAgent: Agent<EvidenceAgentBatchTools>;
	private singleAgent: Agent<EvidenceAgentTools & { submit_final_answer: AgentTool }>;

	private tasks: ConsolidatedTaskWithId[] = [];
	private requiredTaskIds: Set<string> = new Set();
	private completedTaskIds: Set<string> = new Set();
	private evidencePacks: EvidencePack[] = [];

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
		const { provider: evidenceProvider, modelId: evidenceModelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDimensionEvidence);
		const temperature = this.aiServiceManager.getSettings?.()?.defaultOutputControl?.temperature;
		const maxTokens = this.aiServiceManager.getSettings?.()?.defaultOutputControl?.maxOutputTokens;
		const tm = this.aiServiceManager.getTemplateManager?.();

		const evidenceAgentTools: EvidenceAgentTools = {
			submit_evidence_pack: this.submitEvidencePackTool(),
			content_reader: contentReaderTool(),
			inspect_note_context: inspectNoteContextTool(tm),
			graph_traversal: graphTraversalTool(tm),
			find_path: findPathTool(tm),
			search_by_dimensions: searchByDimensionsTool(tm),
			explore_folder: exploreFolderTool(tm),
			recent_changes_whole_vault: recentChangesWholeVaultTool(tm),
			local_search_whole_vault: localSearchWholeVaultTool(tm),
		};

		this.batchAgent = new Agent<EvidenceAgentBatchTools>({
			model: this.aiServiceManager.getMultiChat().getProviderService(evidenceProvider).modelClient(evidenceModelId),
			tools: {
				...evidenceAgentTools,
				mark_task_completed: this.markTaskCompletedTool(),
			},
			stopWhen: [
				() => this.allTasksMarkedCompleted(),
			],
			temperature,
		});

		this.singleAgent = new Agent<EvidenceAgentTools & { submit_final_answer: AgentTool }>({
			model: this.aiServiceManager.getMultiChat().getProviderService(evidenceProvider).modelClient(evidenceModelId),
			tools: {
				...evidenceAgentTools,
				submit_final_answer: submitFinalAnswerTool(),
			},
			stopWhen: [
				({ steps }) => this.hasSubmitFinalAnswer(steps) && this.evidencePacks.length > 0,
			],
			temperature,
		});
	}

	/** True if any step contains a call to submit_final_answer. */
	private hasSubmitFinalAnswer(steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>): boolean {
		return steps?.some((s) => s.toolCalls?.some((tc) => tc.toolName === 'submit_final_answer')) ?? false;
	}

	/** True when every task ID is in completedTaskIds (used by stopWhen). */
	private allTasksMarkedCompleted(): boolean {
		if (this.requiredTaskIds.size === 0) return false;
		for (const id of this.requiredTaskIds) {
			if (!this.completedTaskIds.has(id)) return false;
		}
		return true;
	}

	/** Tool for batch evidence: mark one task as completed (single param: taskId). */
	private markTaskCompletedTool(): AgentTool {
		return safeAgentTool({
			description: 'Mark a task as completed. Call after you have read and extracted evidence for that task. Single param: taskId.',
			inputSchema: markTaskCompletedInputSchema,
			execute: async (input) => {
				const parsed = markTaskCompletedInputSchema.safeParse(input);
				if (!parsed.success) return { ok: false, error: parsed.error.message };

				this.completedTaskIds.add(parsed.data.taskId);
				return { ok: true };
			},
		});
	}

	private submitEvidencePackTool(): AgentTool {
		return safeAgentTool({
			description:
				'Submit evidence packs. Each pack: origin (tool + path_or_url), facts (claim + quote), optional snippet. In batch mode, assign packs to dimensions by path; then call mark_task_completed for each task you finished.',
			inputSchema: submitEvidencePackInputSchema,
			execute: async (input) => {
				const parsed = submitEvidencePackInputSchema.safeParse(input);
				if (!parsed.success) return { ok: false, error: parsed.error.message };
				const { packs } = parsed.data;
				this.evidencePacks.push(...packs);
				return { ok: true };
			},
		});
	}

	private resetTasks(tasks: ConsolidatedTaskWithId[]): void {
		this.tasks = tasks;
		this.completedTaskIds.clear();
		this.requiredTaskIds.clear();
		this.evidencePacks.length = 0;
		for (const t of tasks) this.requiredTaskIds.add(t.taskId);
	}

	public async *streamTaskEvidence(options: {
		tasks: ConsolidatedTaskWithId[];
		topicAnchor?: string;
		groupFocus?: string;
		groupSharedContext?: string;
		stepId?: string;
		runStepId?: string;
		groupId?: string;
		onEvidenceFinish?: (evidencePacks: EvidencePack[]) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		if (options.tasks.length === 0) return;

		const stepId = options.stepId ?? generateUuidWithoutHyphens();
		this.resetTasks(options.tasks);

		if (options.runStepId && options.groupId != null) {
			yield uiStepStart(
				{
					runStepId: options.runStepId,
					stage: 'evidence',
					lane: { laneType: 'group', laneId: options.groupId },
					agent: 'EvidenceAgent',
				},
				{
					title: `Evidence: ${options.groupId}`,
					description: `${options.tasks.length} task(s)`,
					triggerName: StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE,
				}
			);
		}

		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionEvidenceSystem, {});
		const topicAnchor = options.topicAnchor ?? '';
		const groupFocus = options.groupFocus ?? '';
		const groupSharedContext = options.groupSharedContext ?? '';
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionEvidenceBatch, {
			userQuery: this.context.getInitialPrompt(),
			tasks: this.tasks,
			topicAnchor,
			groupFocus,
			groupSharedContext,
			showSchedulerContext: !!(topicAnchor || groupFocus || groupSharedContext),
		});

		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE, system, prompt);

		const evidenceMeta =
			options.runStepId && options.groupId != null
				? {
					runStepId: options.runStepId,
					stage: 'evidence' as const,
					lane: { laneType: 'group' as const, laneId: options.groupId },
					agent: 'EvidenceAgent' as const,
				}
				: null;
		const stream = this.batchAgent.stream({ system, prompt });
		yield* streamTransform(stream.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
			yieldExtraAfterEvent: (chunk) => {
				if (!evidenceMeta) return;
				if (chunk.type === 'tool-call' && (chunk as { toolName?: string }).toolName === 'content_reader') {
					const input = (chunk as { input?: { path?: string } }).input;
					return uiStageSignal(evidenceMeta, {
						status: 'progress',
						payload: { groupId: options.groupId, currentPath: input?.path },
						triggerName: StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE,
					});
				}
				if (chunk.type === 'tool-result' && (chunk as { toolName?: string }).toolName === 'mark_task_completed') {
					return uiStageSignal(evidenceMeta, {
						status: 'progress',
						payload: {
							groupId: options.groupId,
							completedTasks: this.completedTaskIds.size,
							totalTasks: this.requiredTaskIds.size,
						},
						triggerName: StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE,
					});
				}
			},
		});
		options.onEvidenceFinish?.(this.evidencePacks);
	}

	/**
	 * Evidence mode: precise collection from leads. Returns evidence packs.
	 * Uses content_reader; must call submit_evidence_pack when done.
	 */
	public async *streamEvidence(
		dimension: DimensionChoice,
		report: RawSearchReport,
		stepId?: string,
	): AsyncGenerator<LLMStreamEvent> {
		if (!stepId) stepId = generateUuidWithoutHyphens();
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionEvidenceSystem, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionEvidence, {
			userQuery: this.context.getInitialPrompt(),
			dimension,
			report,
		});

		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE, system, prompt);

		const stream = this.singleAgent.stream({ system, prompt });
		yield* streamTransform(stream.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE, {
			yieldUIStep: {
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
			},
		});
	}

	public getEvidencePacks(): EvidencePack[] {
		return this.evidencePacks;
	}
}
