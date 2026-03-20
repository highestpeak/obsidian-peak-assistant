/**
 * Search Architect Agent: collapses logical dimensions into fewer physical search tasks
 * (dimension-to-task collapse) to reduce I/O and preserve cross-dimension context.
 */

import type { AIServiceManager } from '@/service/chat/service-manager';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UIStepType } from '@/core/providers/types';
import { streamText, Output } from 'ai';
import { PromptId } from '@/service/prompt/PromptId';
import { makeStepId } from './helpers/search-ui-events';
import { streamTransform } from '@/core/providers/helpers/stream-helper';
import type { DimensionChoice, PhysicalSearchTask } from '@/core/schemas/agents/search-agent-schemas';
import { searchArchitectOutputSchema } from '@/core/schemas/agents/search-agent-schemas';

/** Build 1:1 physical tasks from dimensions (no collapse). Used when LLM fails or returns invalid. */
function fallbackPhysicalTasks(dimensions: DimensionChoice[]): PhysicalSearchTask[] {
	return dimensions.map((d, i) => ({
		unified_intent: d.intent_description,
		covered_dimension_ids: [d.id],
		search_priority: i,
		scope_constraint: d.scope_constraint,
	}));
}

export interface StreamSearchArchitectOptions {
	runStepId?: string;
	onFinish: (tasks: PhysicalSearchTask[]) => void;
}

/**
 * Streams Search Architect LLM output; on completion parses and calls onFinish with physical tasks.
 * On parse failure or empty output, onFinish receives 1:1 fallback tasks.
 */
export async function* streamSearchArchitect(
	aiServiceManager: AIServiceManager,
	dimensions: DimensionChoice[],
	userQuery: string,
	options: StreamSearchArchitectOptions,
): AsyncGenerator<LLMStreamEvent> {
	const { runStepId, onFinish } = options;
	if (dimensions.length === 0) {
		onFinish([]);
		return;
	}

	const dimensionsPayload = dimensions.map((d) => ({
		id: d.id,
		intent_description: d.intent_description,
		scope_constraint: d.scope_constraint,
	}));
	const dimensionsJson = JSON.stringify(dimensionsPayload, null, 2);

	const promptInfo = await aiServiceManager.getPromptInfo(PromptId.AiAnalysisSearchArchitect);
	const system = await aiServiceManager.renderPrompt(promptInfo.systemPromptId!, {});
	const prompt = await aiServiceManager.renderPrompt(PromptId.AiAnalysisSearchArchitect, {
		userQuery,
		dimensionsJson,
	});

	const { provider, modelId } = aiServiceManager.getModelForPrompt(PromptId.AiAnalysisSearchArchitect);
	const model = aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);

	const result = streamText({
		model,
		system,
		prompt,
		experimental_output: Output.object({
			schema: searchArchitectOutputSchema,
		}),
	});

	const meta = runStepId
		? { runStepId, stage: 'classify' as const, agent: 'SlotRecallAgent', lane: { laneType: 'dimension' as const, laneId: 'search-architect' } }
		: null;
	const stepId = meta ? makeStepId(meta) : undefined;

	yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_SLOT_RECALL_AGENT, {
		yieldUIStep: stepId ? { uiType: UIStepType.STEPS_DISPLAY, stepId } : undefined,
	});

	const text = await result.text;
	let parsed: { physical_tasks?: PhysicalSearchTask[] };
	try {
		parsed = JSON.parse(text);
	} catch {
		onFinish(fallbackPhysicalTasks(dimensions));
		return;
	}
	const validated = searchArchitectOutputSchema.safeParse(parsed);
	if (!validated.success || validated.data.physical_tasks.length === 0) {
		onFinish(fallbackPhysicalTasks(dimensions));
		return;
	}

	const tasks = validated.data.physical_tasks;
	tasks.sort((a, b) => a.search_priority - b.search_priority);
	onFinish(tasks);
}
