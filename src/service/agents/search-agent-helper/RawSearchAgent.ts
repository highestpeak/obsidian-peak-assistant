/**
 * RawSearchAgent: Recon (breadth) + Evidence (depth) per dimension.
 * Recon: explore only, submit_rawsearch_report. Evidence: read from leads, submit_evidence_pack.
 */

import type { AIServiceManager } from '@/service/chat/service-manager';
import { Experimental_Agent as Agent, hasToolCall, streamObject } from 'ai';
import { safeAgentTool, type AgentTool } from '@/service/tools/types';
import { contentReaderTool } from '@/service/tools/content-reader';
import {
	inspectNoteContextTool,
	graphTraversalTool,
	findKeyNodesTool,
	searchByDimensionsTool,
	exploreFolderTool,
	recentChangesWholeVaultTool,
	localSearchWholeVaultTool,
	findPathTool,
	findOrphansTool,
} from '@/service/tools/search-graph-inspector';
import { PromptId } from '@/service/prompt/PromptId';
import { consolidatorOutputSchema, rawSearchReportSchema, submitEvidencePackInputSchema, markTaskCompletedInputSchema, type RawSearchReport } from '@/core/schemas/agents/search-agent-schemas';
import type { ConsolidatedTaskWithId, ConsolidatorOutput, EvidenceTaskGroup, EvidencePack, RawSearchReportWithDimension } from '@/core/schemas/agents/search-agent-schemas';
import type { DimensionChoice } from '@/core/schemas/agents/search-agent-schemas';
import { AgentContextManager } from './AgentContextManager';
import { GroupContextAgent } from './GroupContextAgent';
import { LLMStreamEvent, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { buildPromptTraceDebugEvent, parallelStream, streamTransform } from '@/core/providers/helpers/stream-helper';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { groupConsolidatedTasksGravity } from './helpers/gravityGrouping';

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
		dimensions: DimensionChoice[],
		onAllEvidenceFinish: (evidencePacks: EvidencePack[]) => void,
		onGroupEvidenceFinish?: (groupTasks: ConsolidatedTaskWithId[], evidencePacks: EvidencePack[]) => void,
	}): AsyncGenerator<LLMStreamEvent> {
		const stopWatch = new Stopwatch("streamSearch");
		const { dimensions, onAllEvidenceFinish, onGroupEvidenceFinish } = options;

		stopWatch.start("batchStreamRecon");
		let evidenceTaskGroups: EvidenceTaskGroup[] = [];
		yield* this.reconAgent.batchStreamRecon({
			dimensions,
			stepId: generateUuidWithoutHyphens(),
			onReconFinish: (eg) => {
				evidenceTaskGroups = eg;
			},
		});
		this.context.setRecallEvidenceTaskGroups(evidenceTaskGroups);
		stopWatch.stop();

		const evidencePacks: EvidencePack[] = [];
		stopWatch.start("parallelStreamTaskEvidence");
		const groupStreams = evidenceTaskGroups.map((eg) => {
			const evidenceAgent = new EvidenceAgent(this.aiServiceManager, this.context);
			return evidenceAgent.streamTaskEvidence({
				tasks: eg.tasks,
				groupFocus: eg.group_focus,
				topicAnchor: eg.topic_anchor,
				groupSharedContext: eg.sharedContext,
				stepId: generateUuidWithoutHyphens(),
				onEvidenceFinish: (p) => {
					evidencePacks.push(...p);
					onGroupEvidenceFinish?.(eg.tasks, p);
				},
			});
		});
		yield* parallelStream(groupStreams);
		this.context.setRecallEvidencePacks(evidencePacks);
		stopWatch.stop();

		yield {
			type: 'pk-debug',
			debugName: 'streamSearchResultAfterGroupEvidence',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT,
			extra: {
				evidenceGroups: evidenceTaskGroups,
				evidencePacks,
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
	private reconAgent: Agent<ReconAgentTools>;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) {
		const temperature = this.aiServiceManager.getSettings?.()?.defaultOutputControl?.temperature;
		const maxTokens = this.aiServiceManager.getSettings?.()?.defaultOutputControl?.maxOutputTokens;

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
						return { ok: true };
					},
				}),
				inspect_note_context: inspectNoteContextTool(tm),
				graph_traversal: graphTraversalTool(tm),
				find_path: findPathTool(tm),
				find_key_nodes: findKeyNodesTool(tm),
				find_orphans: findOrphansTool(tm),
				search_by_dimensions: searchByDimensionsTool(tm),
				explore_folder: exploreFolderTool(tm),
				recent_changes_whole_vault: recentChangesWholeVaultTool(tm),
				local_search_whole_vault: localSearchWholeVaultTool(tm),
			},
			stopWhen: [hasToolCall('submit_rawsearch_report')],
			temperature,
			maxOutputTokens: maxTokens,
		});
	}

	async *batchStreamRecon(options: {
		dimensions: DimensionChoice[],
		stepId?: string,
		onReconFinish?: (evidenceTaskGroups: EvidenceTaskGroup[]) => void,
	}): AsyncGenerator<LLMStreamEvent> {
		let { dimensions, stepId, onReconFinish } = options;
		if (!stepId) {
			stepId = generateUuidWithoutHyphens();
		}

		const stopWatch = new Stopwatch("batchStreamRecon");
		stopWatch.start("parallel_all_dimensions_recon");
		// parallel all dimension's recon
		const reports: RawSearchReportWithDimension[] = [];
		const reconStreams = dimensions.map((dimension, index) => {
			const dimensionStepId = `${index}-${dimension.id}-${generateUuidWithoutHyphens()}`;
			return this.streamRecon(dimension, dimensionStepId, (report) => {
				reports.push({ dimension: dimension.id, ...report });
			});
		});
		yield* parallelStream(reconStreams);
		stopWatch.stop();

		yield {
			type: 'pk-debug',
			debugName: 'parallelSearchResultAfterRecon',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				reconReports: reports,
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
			},
		});
		stopWatch.stop();

		yield {
			type: 'pk-debug',
			debugName: 'parallelSearchResultAfterTaskConsolidator',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				consolidatorOutput,
				stepDuration: stopWatch.getLastDuration(),
			},
		}

		if (!consolidatorOutput) {
			yield {
				type: 'error',
				error: new Error('Consolidator output is null'),
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
				extra: {
					totalDuration: stopWatch.getTotalElapsed(),
				},
			};
			return;
		}

		stopWatch.start("groupConsolidatedTasks");
		const consolidatedTasks = consolidatorOutput.consolidated_tasks.map((t, i) =>
			({ ...t, taskId: `task-${i}` })
		);
		const groups = await groupConsolidatedTasksGravity(consolidatedTasks);
		yield {
			type: 'pk-debug',
			debugName: 'groupConsolidatedTasksGravity',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			extra: {
				groups,
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
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		};

		onReconFinish?.(evidenceTaskGroups);
	}

	private async *streamTaskConsolidator(
		options: {
			dimensions: DimensionChoice[],
			reports: RawSearchReportWithDimension[],
			stepId?: string,
			onConsolidatorFinish?: (consolidatorOutput: ConsolidatorOutput) => void;
		}
	): AsyncGenerator<LLMStreamEvent> {
		let { dimensions, reports, stepId, onConsolidatorFinish } = options;
		stepId = stepId ?? generateUuidWithoutHyphens();

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
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Consolidating tasks...',
			description: '',
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
		};

		// 2) Consolidator: merge reports into execution blueprint.
		try {
			const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisTaskConsolidatorSystem, {});
			const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisTaskConsolidator, {
				userQuery: this.context.getInitialPrompt(),
				dimensions,
				reports,
			});
			const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisTaskConsolidator);
			const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
			const result = streamObject({
				model,
				schema: consolidatorOutputSchema,
				schemaName: 'ConsolidatorOutput',
				schemaDescription: 'Consolidated evidence tasks and global recon insight.',
				system,
				prompt,
			});
			yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR, system, prompt);
			yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR, {
				yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
				chunkEventInterceptor: (chunk) => {
					if (chunk.type === 'finish') {
						const obj = (chunk as { object?: unknown }).object;
						const parsed = consolidatorOutputSchema.safeParse(obj);
						if (parsed.success) onConsolidatorFinish?.(parsed.data);
					}
				},
			});
			const obj = await result.object;
			const parsed = consolidatorOutputSchema.safeParse(obj);
			if (parsed.success) {
				onConsolidatorFinish?.(parsed.data);
			}
		} catch (err) {
			yield {
				type: 'error',
				error: err instanceof Error ? err : new Error(String(err)),
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
			};
			yield {
				type: 'pk-debug',
				debugName: 'parallelSearchResultAfterClassify',
				triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
				extra: { evidencePacks: this.context.getRecallEvidencePacks(), reconReports: reports },
			};
			return;
		}
	}

	/**
	 * Recon mode: breadth exploration. Returns report with discovered_leads.
	 * No content_reader; must call submit_rawsearch_report when done.
	 */
	async *streamRecon(dimension: DimensionChoice, stepId?: string, reportCollector?: (report: RawSearchReport) => void): AsyncGenerator<LLMStreamEvent> {
		if (!stepId) {
			stepId = generateUuidWithoutHyphens();
		}
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionReconSystem, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDimensionRecon, {
			dimensionId: dimension.id,
			intent_description: dimension.intent_description,
			userQuery: this.context.getInitialPrompt(),
			scopePath: dimension.scope_constraint?.path,
			scopeAnchor: dimension.scope_constraint?.anchor_entity,
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
			maxOutputTokens: maxTokens,
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
			maxOutputTokens: maxTokens,
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
		onEvidenceFinish?: (evidencePacks: EvidencePack[]) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		if (options.tasks.length === 0) return;

		const stepId = options.stepId ?? generateUuidWithoutHyphens();
		this.resetTasks(options.tasks);

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

		const stream = this.batchAgent.stream({ system, prompt });
		yield* streamTransform(stream.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_EVIDENCE, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
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
