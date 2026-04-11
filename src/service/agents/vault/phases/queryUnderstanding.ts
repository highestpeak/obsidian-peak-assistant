/**
 * Query Understanding phase: combined classify + decompose in one LLM call.
 *
 * Replaces the separate classify → decompose flow to reduce latency and error propagation.
 * Falls back to the original two-step approach if the combined call fails.
 */

import { streamObject } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { type LLMStreamEvent, UIStepType, StreamTriggerName, UISignalChannel, UISignalKind } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { queryUnderstandingOutputSchema, defaultClassify, type QueryUnderstandingOutput } from '@/core/schemas/agents/search-agent-schemas';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { ClassifyResult, DecomposeResult, PhysicalTask } from '../types';
import type { UserFeedback } from '../../core/types';
import type { ProbeResult } from './probe';

const FOLDER_LIMIT = 20;
const SEARCH_TOP_K = 10;

interface QueryUnderstandingResult {
	classify: ClassifyResult;
	decompose: DecomposeResult;
	/** Raw physical tasks from LLM — needed by VaultSearchAgent to emit decompose ui-signal after step creation. */
	physicalTasks: Array<{ unified_intent: string; covered_dimension_ids: string[]; search_priority: number; scope_constraint: any }>;
}

/**
 * Run the combined Query Understanding phase: one LLM call for both classify and decompose.
 */
export async function* runQueryUnderstandingPhase(options: {
	userQuery: string;
	aiServiceManager: AIServiceManager;
	stepId: string;
	conversationHistory?: UserFeedback[];
	probeResult?: ProbeResult;
}): AsyncGenerator<LLMStreamEvent, QueryUnderstandingResult> {
	const { userQuery, aiServiceManager, stepId, conversationHistory, probeResult } = options;

	// Signal start
	yield {
		type: 'ui-signal',
		channel: UISignalChannel.SEARCH_STAGE,
		kind: UISignalKind.STAGE,
		entityId: stepId,
		payload: { stage: 'classify', status: 'start' },
		triggerName: StreamTriggerName.SEARCH_AI_AGENT,
	} as LLMStreamEvent;

	// Load context (same as classify phase)
	const [folderIntuitions, globalIntuitionJson, quickSearchResults] = await Promise.all([
		loadFolderIntuitions(),
		loadGlobalIntuitionMap(),
		runQuickSearch(userQuery),
	]);

	// Emit context loaded progress
	const contextParts: string[] = [];
	if (folderIntuitions.length > 0) contextParts.push(`${folderIntuitions.length} folders`);
	if (quickSearchResults.length > 0) contextParts.push(`${quickSearchResults.length} initial leads`);
	if (globalIntuitionJson) contextParts.push('vault intuition map');
	if (contextParts.length > 0) {
		yield {
			type: 'ui-step-delta',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId,
			descriptionDelta: ` · ${contextParts.join(', ')} loaded`,
			triggerName: StreamTriggerName.SEARCH_AI_AGENT,
		} as LLMStreamEvent;
	}

	// Build context strings
	const folderContext = folderIntuitions
		.slice(0, FOLDER_LIMIT)
		.map((f) => `- **${f.folderPath}** (${f.docCount} docs): ${f.oneLiner}\n  Tags: ${f.topTags.join(', ')}`)
		.join('\n');

	const searchContext = quickSearchResults
		.map((r) => `- [${r.title}](${r.path}) (score: ${r.score.toFixed(3)})`)
		.join('\n');

	const historyContext = (conversationHistory ?? []).length > 0
		? conversationHistory!.map((fb) => `- [${fb.type}] ${fb.message ?? ''}`).join('\n')
		: '';

	const globalIntuitionTruncated = globalIntuitionJson && globalIntuitionJson.length > 3000
		? globalIntuitionJson.slice(0, 3000) + '\n_(truncated)_'
		: globalIntuitionJson;

	const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultQueryUnderstandingSystem);
	const [systemPrompt, userPrompt] = await Promise.all([
		aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultQueryUnderstandingSystem, {}),
		aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultQueryUnderstanding, {
			userQuery,
			historyContext: historyContext || undefined,
			folderContext: folderContext || undefined,
			searchContext: searchContext || undefined,
			globalIntuitionJson: globalIntuitionTruncated,
			probeContext: probeResult?.formattedContext || undefined,
		}),
	]);

	let output: QueryUnderstandingOutput;
	try {
		const result = streamObject({
			model,
			system: systemPrompt,
			prompt: userPrompt,
			schema: queryUnderstandingOutputSchema,
		});

		// Stream partial — emit dimension discoveries as they arrive
		let lastDimCount = 0;
		for await (const partial of result.partialObjectStream) {
			const dims = [
				...(partial.semantic_dimensions ?? []).filter((d: any) => d?.id).map((d: any) => ({ id: d.id, intent_description: d.intent_description, axis: 'semantic' as const, scope_constraint: d.scope_constraint ?? null })),
				...(partial.topology_dimensions ?? []).filter((d: any) => d?.intent_description).map((d: any) => ({ id: 'inventory_mapping', intent_description: d.intent_description, axis: 'topology' as const, scope_constraint: d.scope_constraint ?? null })),
				...(partial.temporal_dimensions ?? []).filter((d: any) => d?.intent_description).map((d: any) => ({ id: 'temporal_mapping', intent_description: d.intent_description, axis: 'temporal' as const, scope_constraint: d.scope_constraint ?? null })),
			];
			if (dims.length > lastDimCount) {
				lastDimCount = dims.length;
				yield {
					type: 'ui-signal',
					channel: UISignalChannel.SEARCH_STAGE,
					kind: UISignalKind.PROGRESS,
					entityId: stepId,
					payload: { stage: 'classify', status: 'progress', dimensions: dims },
					triggerName: StreamTriggerName.SEARCH_AI_AGENT,
				} as LLMStreamEvent;
			}
		}
		output = await result.object as QueryUnderstandingOutput;
	} catch (err) {
		console.error('[runQueryUnderstandingPhase] LLM error, using defaults:', err);
		// Fallback: return default classify with a single vault-wide task
		return {
			classify: {
				...defaultClassify,
				initialLeads: quickSearchResults,
			},
			decompose: {
				tasks: [{
					id: generateUuidWithoutHyphens(),
					description: userQuery,
					targetAreas: [],
					toolHints: ['local_search_whole_vault', 'explore_folder'],
				}],
			},
		};
	}

	// Emit classify complete
	const allDimensions = [
		...output.semantic_dimensions.map((d) => ({ id: d.id, intent_description: d.intent_description, axis: 'semantic' as const, scope_constraint: d.scope_constraint ?? null })),
		...(output.topology_dimensions ?? []).map((d) => ({ id: 'inventory_mapping' as const, intent_description: d.intent_description, axis: 'topology' as const, scope_constraint: d.scope_constraint ?? null })),
		...(output.temporal_dimensions ?? []).map((d) => ({ id: 'temporal_mapping' as const, intent_description: d.intent_description, axis: 'temporal' as const, scope_constraint: d.scope_constraint ?? null })),
	];
	yield {
		type: 'ui-signal',
		channel: UISignalChannel.SEARCH_STAGE,
		kind: UISignalKind.COMPLETE,
		entityId: stepId,
		payload: { stage: 'classify', status: 'complete', dimensions: allDimensions },
		triggerName: StreamTriggerName.SEARCH_AI_AGENT,
	} as LLMStreamEvent;

	// Build decompose tasks
	const tasks: PhysicalTask[] = (output.physical_tasks ?? []).map((pt) => ({
		id: generateUuidWithoutHyphens(),
		description: pt.unified_intent,
		targetAreas: pt.scope_constraint?.path ? [pt.scope_constraint.path] : [],
		toolHints: inferToolHints(pt.covered_dimension_ids),
	}));

	// NOTE: decompose ui-signal is NOT emitted here — it must be emitted by VaultSearchAgent
	// AFTER the decompose phase-transition creates the decompose step in the store.

	return {
		physicalTasks: output.physical_tasks ?? [],
		classify: {
			semantic_dimensions: output.semantic_dimensions,
			topology_dimensions: output.topology_dimensions ?? [],
			temporal_dimensions: output.temporal_dimensions ?? [],
			initialLeads: quickSearchResults,
		},
		decompose: { tasks },
	};
}

function inferToolHints(dimensionIds: string[]): string[] {
	const hints = new Set<string>();
	if (dimensionIds.includes('inventory_mapping')) {
		hints.add('explore_folder');
		hints.add('grep_file_tree');
	}
	if (dimensionIds.includes('temporal_mapping')) {
		hints.add('local_search_whole_vault');
	}
	if (dimensionIds.some((d) => ['related_extension', 'next_action'].includes(d))) {
		hints.add('graph_traversal');
		hints.add('hub_local_graph');
		hints.add('find_path');
	}
	if (hints.size === 0) {
		hints.add('local_search_whole_vault');
		hints.add('explore_folder');
	}
	return Array.from(hints);
}

// --- Shared helpers (same as classify.ts) ---

async function loadFolderIntuitions() {
	try {
		if (!sqliteStoreManager.isInitialized()) return [];
		const mobius = sqliteStoreManager.getMobiusNodeRepo('vault');
		return await mobius.listTopFoldersForSearchOrient(30);
	} catch { return []; }
}

async function loadGlobalIntuitionMap(): Promise<string | undefined> {
	try {
		if (!sqliteStoreManager.isInitialized()) return undefined;
		const stateRepo = sqliteStoreManager.getIndexStateRepo();
		const value = await stateRepo.get('knowledge_intuition_json');
		return value ?? undefined;
	} catch { return undefined; }
}

async function runQuickSearch(query: string): Promise<Array<{ path: string; title: string; score: number }>> {
	try {
		const ctx = AppContext.getInstance();
		const searchClient = ctx.searchClient;
		if (!searchClient) return [];
		const res = await searchClient.search({
			text: query,
			scopeMode: 'vault',
			topK: SEARCH_TOP_K,
			searchMode: 'hybrid',
			indexTenant: 'vault',
		});
		return (res.items ?? []).map((item) => ({
			path: item.path,
			title: item.title ?? item.path.split('/').pop() ?? '',
			score: item.score ?? 0,
		}));
	} catch { return []; }
}
