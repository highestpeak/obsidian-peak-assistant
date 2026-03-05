/**
 * SlotRecallAgent: classifier → batch recon (parallel) → consolidator → grouped batch evidence.
 */

import type { AIServiceManager } from '@/service/chat/service-manager';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UIStepType } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AgentContextManager } from './AgentContextManager';
import { streamObject } from 'ai';
import { PromptId } from '@/service/prompt/PromptId';
import { getVaultDescription } from '@/service/tools/system-info';
import { streamTransform } from '@/core/providers/helpers/stream-helper';
import {
	AXIS_TEMPORAL_ID,
	AXIS_TOPOLOGY_ID,
	defaultClassify,
	DimensionChoice,
	EvidencePack,
	QueryClassifierOutput,
	queryClassifierOutputSchema,
	SEARCH_CLASSIFY_TO_FUNCTIONAL_TAGS,
	SemanticDimensionChoice,
	TemporalDimensionChoice,
	TopologyDimensionChoice,
} from '@/core/schemas/agents/search-agent-schemas';
import { RawSearchAgent } from './RawSearchAgent';

/** Format dimension → functional tags for classifier user prompt (hand-maintained mapping). */
function formatFunctionalTagsMapping(
	mapping: Record<string, string[]>,
): string {
	return Object.entries(mapping)
		.map(([dim, tags]) => `${dim} → ${tags.join(', ')}`)
		.join('\n');
}

export interface SlotRecallAgentOptions {
	vaultSkeleton?: string;

	// debug option
	skipSearch?: boolean;
}

/**
 * Runs classifier (streamObject) then slot pipeline. Yields UI steps and signals.
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
	 * 1) yield "Classifying...", run classifier (streamObject);
	 * 2) yield "Running parallel recall...", run pipeline.
	 */
	async *stream(opts?: SlotRecallAgentOptions): AsyncGenerator<LLMStreamEvent> {
		const stepId = generateUuidWithoutHyphens();
		const streamStartTime = Date.now();

		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Classifying query...',
			description: '',
			triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			triggerTimestamp: Date.now(),
		};

		let queryClassify: QueryClassifierOutput = defaultClassify;
		try {
			yield* this.classifyQuery({
				stepId,
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

		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			title: 'Running parallel recall...',
			description: '',
			triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
		};

		yield {
			type: 'pk-debug',
			debugName: 'queryClassifyResult',
			triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			triggerTimestamp: Date.now(),
			extra: {
				queryClassify
			},
		}

		if (opts?.skipSearch) {
			return;
		}

		const dimensions = this.getDimensionsForRecall(queryClassify);
		this.context.setRecallDimensions(dimensions);
		const evidencePacks: EvidencePack[] = [];
		yield* this.rawSearchAgent.streamSearch({
			dimensions,
			onAllEvidenceFinish: (p) => {
				evidencePacks.push(...p);
			}
		});
		yield {
			type: 'pk-debug',
			debugName: 'searchResultAfterGroupEvidence',
			triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			triggerTimestamp: Date.now(),
			extra: {
				queryClassify,
				dimensions,
				evidencePacks,
				streamStartTime: streamStartTime,
				cost: Date.now() - streamStartTime,
			},
		};
	}

	private async *classifyQuery(
		options?: {
			vaultSkeleton?: string;
			stepId?: string;
			onClassifyFinish?: (classifierOutput: QueryClassifierOutput) => void;
		}
	): AsyncGenerator<LLMStreamEvent> {
		const stepId = options?.stepId ?? generateUuidWithoutHyphens();

		const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.AiAnalysisQueryClassifier);
		const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
		const vaultDescription = await getVaultDescription();
		const functionalTagsMapping = formatFunctionalTagsMapping(SEARCH_CLASSIFY_TO_FUNCTIONAL_TAGS);
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisQueryClassifier, {
			userQuery: this.context.getInitialPrompt(),
			vaultSkeleton: options?.vaultSkeleton,
			vaultDescription: vaultDescription ?? undefined,
			functionalTagsMapping,
		});

		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisQueryClassifier);
		const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
		const result = streamObject({
			model,
			schema: queryClassifierOutputSchema,
			schemaName: 'QueryClassifierOutput',
			schemaDescription: 'Query type and routing hints for the user question.',
			system,
			prompt,
		});

		yield* streamTransform(
			result.fullStream,
			StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
			{
				yieldUIStep: stepId ? { uiType: UIStepType.STEPS_DISPLAY, stepId } : undefined,
				chunkEventInterceptor: (chunk) => {
					if (chunk.type === 'finish') {
						const raw = (chunk as { object?: unknown }).object;
						const parsed = queryClassifierOutputSchema.safeParse(raw);
						if (parsed.success) options?.onClassifyFinish?.(parsed.data);
					}
				},
			},
		);
		if (result.object) {
			const obj = await result.object;
			options?.onClassifyFinish?.(obj);
		}
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
		}));

		const topologySource: TopologyDimensionChoice[] = topology_dimensions && topology_dimensions.length > 0
			? topology_dimensions
			: defaultClassify.topology_dimensions;
		const topology: DimensionChoice[] = topologySource.map((d) => ({
			id: AXIS_TOPOLOGY_ID,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
		}));

		const temporalSource: TemporalDimensionChoice[] = temporal_dimensions && temporal_dimensions.length > 0
			? temporal_dimensions
			: defaultClassify.temporal_dimensions;
		const temporal: DimensionChoice[] = temporalSource.map((d) => ({
			id: AXIS_TEMPORAL_ID,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
		}));

		const finalDimensions: DimensionChoice[] = [];
		finalDimensions.push(...semantic, ...topology, ...temporal);

		return finalDimensions;
	}
}
