/**
 * SlotRecallAgent: classifier → batch recon (parallel) → consolidator → grouped batch evidence.
 */

import { SLICE_CAPS } from '@/core/constant';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UIStepType } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AgentContextManager } from './AgentContextManager';
import { makeStepId, SearchUILane, uiStageSignal, uiStepStart } from './helpers/search-ui-events';
import { streamText, Output } from 'ai';
import { PromptId } from '@/service/prompt/PromptId';
import { getVaultDescription } from '@/service/tools/system-info';
import { parallelStream, streamTransform } from '@/core/providers/helpers/stream-helper';
import {
	AXIS_TEMPORAL_ID,
	AXIS_TOPOLOGY_ID,
	defaultClassify,
	DimensionChoice,
	EvidencePack,
	PhysicalSearchTask,
	QueryClassifierOutput,
	queryClassifierOutputSchema,
	SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS,
	SemanticDimensionChoice,
	TemporalDimensionChoice,
	TopologyDimensionChoice,
} from '@/core/schemas/agents/search-agent-schemas';
import { RawSearchAgent } from './RawSearchAgent';
import { streamSearchArchitect } from './SearchArchitectAgent';
import { Stopwatch } from '@/core/utils/Stopwatch';

/** Format dimension → functional tags for classifier user prompt (hand-maintained mapping). */
function formatFunctionalTagsMapping(
	mapping: Record<string, string[]>,
): string {
	return Object.entries(mapping)
		.map(([dim, tags]) => `${dim} → ${tags.join(', ')}`)
		.join('\n');
}

export interface SlotRecallAgentOptions {
	/** Root step id from AISearchAgent for unified stepId tree. */
	runStepId?: string;
	vaultSkeleton?: string;
	skipStreamSearchArchitect: boolean;
	skipSearch?: boolean;
}

/**
 * Runs classifier (streamText + experimental_output) then slot pipeline. Yields UI steps and signals.
 */
export class SlotRecallAgent {

	private rawSearchAgent: RawSearchAgent;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly context: AgentContextManager
	) {
		this.rawSearchAgent = new RawSearchAgent(this.aiServiceManager, this.context);
	}

	/**
	 * Stream:
	 * 1) yield "Classifying...", run classifier (streamText + Output.object);
	 * 2) yield "Running parallel recall...", run pipeline.
	 */
	async *stream(opts?: SlotRecallAgentOptions): AsyncGenerator<LLMStreamEvent> {
		const runStepId = opts?.runStepId ?? generateUuidWithoutHyphens();

		const stopWatch = new Stopwatch();
		stopWatch.start("classifyQuery");
		yield uiStepStart(
			{ runStepId, stage: 'classify' as const, agent: 'SlotRecallAgent' },
			{
				title: 'Classifying query…',
				description: '',
				triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			}
		);

		let queryClassify: QueryClassifierOutput = defaultClassify;
		try {
			yield* this.classifyQuery({
				runStepId,
				stepId: undefined,
				vaultSkeleton: opts?.vaultSkeleton,
				onClassifyFinish: (p) => { queryClassify = p; },
			});
		} catch (error) {
			yield {
				type: 'error',
				error,
				triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			};
			queryClassify = defaultClassify;
		}
		// Cap semantic dimensions at 10: merge any excess (tail) into one by string concatenation.
		if (queryClassify.semantic_dimensions.length > 10) {
			const tail = queryClassify.semantic_dimensions.slice(10);
			const mergedIntent = tail.map((d) => d.intent_description).join(' ');
			const mergedDimension = {
				id: tail[0].id,
				intent_description: mergedIntent,
				scope_constraint: null,
				retrieval_orientation: null,
			};
			queryClassify = {
				...queryClassify,
				semantic_dimensions: [...queryClassify.semantic_dimensions.slice(0, SLICE_CAPS.agent.slotRecallDimensions), mergedDimension],
			};
		}
		const raw = queryClassify.user_persona_config;
		this.context.setUserPersonaConfig(
			raw == null
				? undefined
				: {
					appeal: raw.appeal ?? undefined,
					detail_level: raw.detail_level ?? undefined,
				}
		);
		const dimensions = this.getDimensionsForRecall(queryClassify);
		this.context.setRecallDimensions(dimensions);
		yield uiStageSignal(
			{ runStepId, stage: 'classify', agent: 'SlotRecallAgent' },
			{ status: 'complete', payload: { dimensions }, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT },
		);
		stopWatch.stop();
		yield {
			type: 'pk-debug',
			debugName: 'queryClassifyResult',
			triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			triggerTimestamp: Date.now(),
			extra: {
				queryClassify,
				durationLabel: 'queryClassifyResult',
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		}

		if (opts?.skipStreamSearchArchitect) {
			return;
		}

		// Dimension-to-task collapse: stream architect LLM, then recon with synthetic dimensions.
		stopWatch.start("streamSearchArchitect");
		let physicalTasks: PhysicalSearchTask[] = [];
		yield* streamSearchArchitect(this.aiServiceManager, dimensions, this.context.getInitialPrompt(), {
			runStepId,
			onFinish: (tasks) => { physicalTasks = tasks; },
		});
		if (physicalTasks.length === 0) {
			physicalTasks = dimensions.map((d, i) => ({
				unified_intent: d.intent_description,
				covered_dimension_ids: [d.id],
				search_priority: i,
				scope_constraint: d.scope_constraint,
			}));
		}
		stopWatch.stop();
		yield {
			type: 'pk-debug',
			debugName: 'searchArchitectResult',
			triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			triggerTimestamp: Date.now(),
			extra: {
				physicalTasks,
				durationLabel: 'searchArchitectResult',
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		}

		if (opts?.skipSearch) {
			return;
		}

		stopWatch.start("streamSearchReconOnlyForPhysicalTasks");
		yield uiStepStart(
			{ runStepId, stage: 'recon' as const, agent: 'SlotRecallAgent' },
			{
				title: 'Running parallel recall…',
				description: '',
				triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			}
		);
		yield* this.rawSearchAgent.streamSearchReconOnlyForPhysicalTasks({
			runStepId,
			physicalTasks,
			onReconFinish: (results, mergedPaths, weavedContext) => {
				this.context.setReconReportsFromPhysicalTasks(
					results.map((r) => r.task),
					mergedPaths,
				);
				this.context.setReconWeavedContext(weavedContext ?? '');
			},
		});
		stopWatch.stop();
		// const reconMeta = { runStepId, stage: 'recon' as const, agent: 'RawSearchAgent.Recon' };
		// const searchStreams = dimensions.map((dimension, index) => {
		// 	const lane: SearchUILane = { laneType: 'dimension', laneId: dimension.id, index };
		// 	const dimensionStepId =
		// 		reconMeta && runStepId
		// 			? makeStepId({ ...reconMeta, lane })
		// 			: `${index}-${dimension.id}-${generateUuidWithoutHyphens()}`;
		// 	return this.rawSearchAgent.streamSearchForOneDimension(dimension, dimensionStepId);
		// });
		// yield* parallelStream(searchStreams);

		yield {
			type: 'pk-debug',
			debugName: 'searchResultAfterGroupEvidence',
			triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			triggerTimestamp: Date.now(),
			extra: {
				queryClassify,
				dimensions,
				evidencePacks: this.context.getRecallEvidencePacks(),
				durationLabel: 'searchResultAfterGroupEvidence',
				stepDuration: stopWatch.getLastDuration(),
				totalDuration: stopWatch.getTotalElapsed(),
			},
		};
	}

	private async *classifyQuery(
		options?: {
			runStepId?: string;
			vaultSkeleton?: string;
			stepId?: string;
			onClassifyFinish?: (classifierOutput: QueryClassifierOutput) => void;
		}
	): AsyncGenerator<LLMStreamEvent> {
		const meta = options?.runStepId
			? { runStepId: options.runStepId, stage: 'classify' as const, agent: 'SlotRecallAgent' }
			: null;
		const stepId = meta ? makeStepId(meta) : (options?.stepId ?? generateUuidWithoutHyphens());

		const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisQueryClassifier);
		const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
		const vaultDescription = await getVaultDescription();
		const functionalTagsMapping = formatFunctionalTagsMapping(SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS);
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisQueryClassifier, {
			userQuery: this.context.getInitialPrompt(),
			vaultSkeleton: options?.vaultSkeleton,
			vaultDescription: vaultDescription ?? undefined,
			functionalTagsMapping,
		});

		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisQueryClassifier);
		const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
		const result = streamText({
			model,
			system,
			prompt,
			experimental_output: Output.object({
				schema: queryClassifierOutputSchema,
			}),
		});

		yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_SLOT_RECALL_AGENT, {
			yieldUIStep: stepId ? { uiType: UIStepType.STEPS_DISPLAY, stepId } : undefined,
		});
		const text = await result.text;
		const parsed = queryClassifierOutputSchema.safeParse(JSON.parse(text));
		if (parsed.success) options?.onClassifyFinish?.(parsed.data);
	}

	private getDimensionsForRecall(output: QueryClassifierOutput): DimensionChoice[] {
		const { semantic_dimensions, topology_dimensions, temporal_dimensions } = output;

		const semanticSource: SemanticDimensionChoice[] = semantic_dimensions && semantic_dimensions.length > 0
			? semantic_dimensions
			// we will find whether it's default or raw output. as we have yield all event from the transform stream.
			: defaultClassify.semantic_dimensions;
		const semantic: DimensionChoice[] = semanticSource.map((d) => ({
			id: d.id,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
			retrieval_orientation: d.retrieval_orientation,
			output_format: null,
			mustIncludeKeywords: null,
		}));

		const topologySource: TopologyDimensionChoice[] = topology_dimensions && topology_dimensions.length > 0
			? topology_dimensions
			: defaultClassify.topology_dimensions;
		const topology: DimensionChoice[] = topologySource.map((d) => ({
			id: AXIS_TOPOLOGY_ID,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
			retrieval_orientation: null,
			output_format: null,
			mustIncludeKeywords: null,
		}));

		const temporalSource: TemporalDimensionChoice[] = temporal_dimensions && temporal_dimensions.length > 0
			? temporal_dimensions
			: defaultClassify.temporal_dimensions;
		const temporal: DimensionChoice[] = temporalSource.map((d) => ({
			id: AXIS_TEMPORAL_ID,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
			retrieval_orientation: null,
			output_format: null,
			mustIncludeKeywords: null,
		}));

		const finalDimensions: DimensionChoice[] = [];
		finalDimensions.push(...semantic, ...topology, ...temporal);

		return finalDimensions;
	}
}
