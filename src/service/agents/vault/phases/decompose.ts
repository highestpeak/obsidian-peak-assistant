/**
 * Decompose phase: collapse logical dimensions into physical search tasks.
 *
 * Takes the ClassifyResult (with semantic/topology/temporal dimensions) and uses
 * the Search Architect LLM to collapse them into a minimal set of non-overlapping
 * physical tasks to run in parallel during recon.
 */

import { streamObject } from 'ai';
import { StreamTriggerName, UISignalChannel, UISignalKind, type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { PromptId } from '@/service/prompt/PromptId';
import {
	searchArchitectOutputSchema,
	type DimensionChoice,
	type PhysicalSearchTask,
	type SearchArchitectOutput,
} from '@/core/schemas/agents/search-agent-schemas';
import type { ClassifyResult, DecomposeResult, PhysicalTask } from '../types';

/**
 * Fallback: 1:1 dimension → task mapping when architect LLM fails.
 */
function fallbackPhysicalTasks(dimensions: DimensionChoice[]): PhysicalSearchTask[] {
	return dimensions.map((d, i) => ({
		unified_intent: d.intent_description,
		covered_dimension_ids: [d.id],
		search_priority: i,
		scope_constraint: d.scope_constraint,
	}));
}

/**
 * Collapse dimensions into physical search tasks via LLM.
 *
 * Yields LLMStreamEvent for UI updates, returns PhysicalSearchTask[].
 */
async function* streamSearchArchitect(
	userQuery: string,
	dimensions: DimensionChoice[],
	aiServiceManager: AIServiceManager,
): AsyncGenerator<LLMStreamEvent, PhysicalSearchTask[]> {
	if (dimensions.length === 0) {
		return [];
	}

	// Format dimensions for prompt
	const dimensionsJson = JSON.stringify(
		dimensions.map((d) => ({
			id: d.id,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
		}))
	);

	const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisSearchArchitectSystem);
	const [systemPrompt, userPrompt] = await Promise.all([
		aiServiceManager.renderPrompt(PromptId.AiAnalysisSearchArchitectSystem, {}),
		aiServiceManager.renderPrompt(PromptId.AiAnalysisSearchArchitect, {
			userQuery,
			dimensionsJson,
		}),
	]);

	let output: SearchArchitectOutput;
	try {
		const result = streamObject({
			model,
			system: systemPrompt,
			prompt: userPrompt,
			schema: searchArchitectOutputSchema,
		});
		// Must consume partialObjectStream to drive the AI SDK internal pipeline.
		// Without this, result.object hangs indefinitely.
		for await (const _partial of result.partialObjectStream) { /* drive stream */ }
		output = (await result.object) as SearchArchitectOutput;
	} catch (err) {
		console.error('[streamSearchArchitect] error:', err);
		return fallbackPhysicalTasks(dimensions);
	}

	if (!output.physical_tasks || output.physical_tasks.length === 0) {
		return fallbackPhysicalTasks(dimensions);
	}

	// Sort by priority
	const tasks = output.physical_tasks.sort((a, b) => a.search_priority - b.search_priority);
	return tasks;
}

/**
 * Run the Decompose phase: collapse dimensions into physical search tasks.
 *
 * Process:
 * 1. Flatten classifier output (semantic + topology + temporal) into DimensionChoice[]
 * 2. Call streamSearchArchitect to merge dimensions into PhysicalSearchTask[]
 * 3. Map PhysicalSearchTask → PhysicalTask with unique IDs for recon phase
 */
export async function* runDecomposePhase(options: {
	userQuery: string;
	classify: ClassifyResult;
	aiServiceManager: AIServiceManager;
	stepId: string;
}): AsyncGenerator<LLMStreamEvent, DecomposeResult> {
	const { userQuery, classify, aiServiceManager } = options;

	// Flatten all dimensions (semantic + topology + temporal) into DimensionChoice[]
	const dimensions: DimensionChoice[] = [
		// Semantic dimensions
		...classify.semantic_dimensions.map((d) => ({
			id: d.id,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
			retrieval_orientation: null,
			output_format: null,
			mustIncludeKeywords: null,
		})),
		// Topology dimension(s)
		...classify.topology_dimensions.map((d) => ({
			id: 'inventory_mapping' as const,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
			retrieval_orientation: null,
			output_format: 'list' as const,
			mustIncludeKeywords: null,
		})) as DimensionChoice[],
		// Temporal dimension(s)
		...classify.temporal_dimensions.map((d) => ({
			id: 'temporal_mapping' as const,
			intent_description: d.intent_description,
			scope_constraint: d.scope_constraint,
			retrieval_orientation: 'chronological' as const,
			output_format: null,
			mustIncludeKeywords: null,
		})) as DimensionChoice[],
	];

	yield {
		type: 'pk-debug',
		debugName: 'Decompose: dimensions flattened',
		extra: {
			dimensions: dimensions.map((d) => ({
				id: d.id,
				intent: d.intent_description,
				scope: d.scope_constraint?.path,
			})),
		},
	};

	// Call Search Architect to collapse dimensions into physical tasks
	const physicalTasks = yield* streamSearchArchitect(userQuery, dimensions, aiServiceManager);

	yield {
		type: 'pk-debug',
		debugName: 'Decompose: architect completed',
		extra: {
			physicalTasks: physicalTasks.map((t) => ({
				intent: t.unified_intent,
				coveredDimensions: t.covered_dimension_ids,
				priority: t.search_priority,
				scope: t.scope_constraint?.path,
				scopeTags: t.scope_constraint?.tags,
				scopeAnchor: t.scope_constraint?.anchor_entity,
			})),
		},
	};

	// Map PhysicalSearchTask → PhysicalTask (add unique IDs for recon tracking)
	const tasks: PhysicalTask[] = physicalTasks.map((pt) => ({
		id: generateUuidWithoutHyphens(),
		description: pt.unified_intent,
		targetAreas: pt.scope_constraint?.path ? [pt.scope_constraint.path] : [],
		toolHints: inferToolHints(pt.covered_dimension_ids),
	}));

	yield {
		type: 'ui-signal',
		channel: UISignalChannel.SEARCH_STAGE,
		kind: UISignalKind.COMPLETE,
		entityId: options.stepId,
		payload: {
			stage: 'decompose',
			status: 'complete',
			taskCount: tasks.length,
			tasks: tasks.map((t) => ({
				id: t.id,
				description: t.description,
				targetAreas: t.targetAreas,
				toolHints: t.toolHints,
			})),
		},
		triggerName: StreamTriggerName.SEARCH_AI_AGENT,
	} as LLMStreamEvent;

	return { tasks };
}

/**
 * Infer tool hints from the dimension IDs covered by a task.
 */
function inferToolHints(dimensionIds: string[]): string[] {
	const hints = new Set<string>();

	// Inventory (topology) → explore + grep
	if (dimensionIds.includes('inventory_mapping')) {
		hints.add('explore_folder');
		hints.add('grep_file_tree');
	}

	// Temporal → search (recent changes, history)
	if (dimensionIds.includes('temporal_mapping')) {
		hints.add('local_search_whole_vault');
	}

	// Graph-related semantic dimensions → graph tools
	if (dimensionIds.some((d) => ['related_extension', 'next_action', 'find_path'].includes(d))) {
		hints.add('graph_traversal');
		hints.add('hub_local_graph');
		hints.add('find_path');
	}

	// Default: search + explore
	if (hints.size === 0) {
		hints.add('local_search_whole_vault');
		hints.add('explore_folder');
	}

	return Array.from(hints);
}
