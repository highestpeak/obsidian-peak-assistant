/**
 * GroupContextAgent: per-group stream (one LLM call per group, streamObject → topic_anchor + group_focus).
 * streamAllGroupsContext runs all groups in parallel via parallelStream; caller gets EvidenceGroup[] from onRefinementFinish.
 */

import type { AIServiceManager } from '@/service/chat/service-manager';
import { streamText, Output } from 'ai';
import { PromptId } from '@/service/prompt/PromptId';
import { groupContextItemSchema, type GroupContextItem } from '@/core/schemas/agents/search-agent-schemas';
import type { ConsolidatedTaskWithId, DimensionChoice, EvidenceTaskGroup } from '@/core/schemas/agents/search-agent-schemas';
import type { AgentContextManager } from './AgentContextManager';
import { LLMStreamEvent, ProviderOptionsConfig, StreamTriggerName, UIStepType } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { buildPromptTraceDebugEvent, parallelStream, streamTransform } from '@/core/providers/helpers/stream-helper';
import { buildEvidenceGroupSharedContext } from './helpers/buildEvidenceGroupSharedContext';
import { makeStepId, uiStepStart } from './helpers/search-ui-events';

export class GroupContextAgent {
	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager,
	) { }

	/**
	 * Run one stream per group in parallel; assemble EvidenceGroup[] and call onRefinementFinish when all done.
	 */
	async *streamAllGroupsContext(options: {
		groups: ConsolidatedTaskWithId[][];
		dimensions: DimensionChoice[];
		stepId?: string;
		onRefinementFinish?: (evidenceTaskGroups: EvidenceTaskGroup[]) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		const { groups, dimensions, stepId, onRefinementFinish } = options;
		if (groups.length === 0) {
			onRefinementFinish?.([]);
			return;
		}

		const results: (GroupContextItem | null)[] = new Array(groups.length);
		for (let i = 0; i < groups.length; i++) results[i] = null;

		console.debug('[streamAllGroupsContext] groups:', groups);
		const groupStreams = groups.map((g, i) =>
			this.streamGroupContext({
				groupIndex: i,
				tasks: g,
				dimensions,
				stepId: stepId ?? generateUuidWithoutHyphens(),
				onFinish: (item) => { results[i] = item; },
			}),
		);

		yield* parallelStream(groupStreams);

		const tm = this.aiServiceManager.getTemplateManager?.();
		const sharedContexts = await Promise.all(
			groups.map((tasks) => buildEvidenceGroupSharedContext(tasks, tm))
		);

		const evidenceTaskGroups: EvidenceTaskGroup[] = groups.map((tasks, i) => ({
			groupId: `group_${String(i).padStart(3, '0')}`,
			topic_anchor: results[i]?.topic_anchor ?? '',
			group_focus: results[i]?.group_focus ?? '',
			tasks,
			sharedContext: sharedContexts[i] || undefined,
			clustering_reason: 'Vector similarity & graph co-citation',
		}));
		onRefinementFinish?.(evidenceTaskGroups);
	}

	/**
	 * One group → one LLM call (streamObject) → topic_anchor + group_focus. Used as one branch in parallelStream.
	 */
	private async *streamGroupContext(options: {
		groupIndex: number;
		tasks: ConsolidatedTaskWithId[];
		dimensions: DimensionChoice[];
		stepId?: string;
		onFinish?: (item: GroupContextItem) => void;
	}): AsyncGenerator<LLMStreamEvent> {
		const { groupIndex, tasks, dimensions, onFinish } = options;
		if (tasks.length === 0) {
			onFinish?.({ topic_anchor: '', group_focus: '' });
			return;
		}

		const runStepId = options.stepId ?? generateUuidWithoutHyphens();
		const laneId = `group_${String(groupIndex).padStart(3, '0')}`;
		const meta = { runStepId, stage: 'groupContext' as const, lane: { laneType: 'group' as const, laneId, index: groupIndex }, agent: 'GroupContextAgent' };
		const stepId = makeStepId(meta);
		yield uiStepStart(meta, {
			title: `Group context: ${laneId}`,
			description: `${tasks.length} file(s)`,
			triggerName: StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR,
		});

		console.debug('[streamGroupContext] tasks:', tasks);
		const files = tasks.map((t) => ({
			path: t.path,
			extraction_focus: t.extraction_focus,
			priority: t.priority,
			task_load: t.task_load,
			relevant_dimension_ids: t.relevant_dimension_ids.map((d) => ({ id: d.id, intent: d.intent })),
		}));

		const userQuery = this.context.getInitialPrompt();
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisGroupContextSystem, {});
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisGroupContextSingle, {
			userQuery,
			dimensions,
			groupIndex,
			files,
		});

		const providerOptionsConfig: ProviderOptionsConfig = {
			noReasoning: false,
			reasoningEffort: 'low',
		}
		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisGroupContextSingle);
		const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId, providerOptionsConfig);
		const providerOptions = this.aiServiceManager.getMultiChat().getProviderService(provider).getProviderOptions(providerOptionsConfig);
		const result = streamText({
			model,
			system,
			prompt,
			providerOptions,
			experimental_output: Output.object({
				schema: groupContextItemSchema,
			}),
		});

		yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR, system, prompt);
		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_RAW_AGENT_TASK_CONSOLIDATOR, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
		});

		const text = await result.text;
		const parsed = groupContextItemSchema.safeParse(JSON.parse(text));
		if (parsed.success) {
			onFinish?.(parsed.data);
		} else {
			onFinish?.({ topic_anchor: '', group_focus: '' });
		}
	}
}
