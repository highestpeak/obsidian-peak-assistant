/**
 * Classify phase: structured query understanding with vault context and full dimensionality.
 *
 * Loads precomputed intuition data (global map + folder intuitions), runs a
 * quick FTS search, then calls one LLM to classify the query into semantic/topology/temporal dimensions.
 *
 * Returns the complete 15-dimension + topology + temporal breakdown, not a simple query type.
 */

import { streamObject } from 'ai';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { queryClassifierOutputSchema, defaultClassify, type QueryClassifierOutput } from '@/core/schemas/agents/search-agent-schemas';
import type { ClassifyResult } from '../types';
import type { UserFeedback } from '../../core/types';

const CLASSIFY_FOLDER_LIMIT = 20;
const CLASSIFY_SEARCH_TOP_K = 10;

/**
 * Run the Classify phase: load vault context + one LLM call.
 */
export async function* runClassifyPhase(options: {
	userQuery: string;
	aiServiceManager: AIServiceManager;
	stepId: string;
	/** Previous conversation history for re-entry after HITL redirect. */
	conversationHistory?: UserFeedback[];
}): AsyncGenerator<LLMStreamEvent, ClassifyResult> {
	const { userQuery, aiServiceManager, stepId, conversationHistory } = options;

	// --- Load precomputed context ---
	const [folderIntuitions, globalIntuitionJson, quickSearchResults] = await Promise.all([
		loadFolderIntuitions(),
		loadGlobalIntuitionMap(),
		runQuickSearch(userQuery),
	]);

	yield {
		type: 'pk-debug',
		debugName: 'Classify: context loaded',
		extra: {
			folderCount: folderIntuitions.length,
			hasGlobalMap: !!globalIntuitionJson,
			searchResultCount: quickSearchResults.length,
			hasHistory: (conversationHistory?.length ?? 0) > 0,
		},
	};

	// --- Build context ---
	const folderContext = folderIntuitions
		.slice(0, CLASSIFY_FOLDER_LIMIT)
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

	const { model } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisVaultClassifySystem);
	const [systemPrompt, userPrompt] = await Promise.all([
		aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultClassifySystem, {}),
		aiServiceManager.renderPrompt(PromptId.AiAnalysisVaultClassify, {
			userQuery,
			historyContext: historyContext || undefined,
			folderContext: folderContext || undefined,
			searchContext: searchContext || undefined,
			globalIntuitionJson: globalIntuitionTruncated,
		}),
	]);

	const result = streamObject({
		model,
		system: systemPrompt,
		prompt: userPrompt,
		schema: queryClassifierOutputSchema,
	});

	let output: QueryClassifierOutput;
	try {
		output = await result.object as QueryClassifierOutput;
	} catch {
		output = defaultClassify;
	}

	yield {
		type: 'pk-debug',
		debugName: 'Classify: LLM complete',
		extra: {
			semanticDimensions: output.semantic_dimensions.map((d) => ({
				id: d.id,
				intent: d.intent_description,
				scope: d.scope_constraint?.path,
				retrieval_orientation: d.retrieval_orientation,
			})),
			topologyDimensions: output.topology_dimensions.map((d) => ({
				intent: d.intent_description,
				scope: d.scope_constraint?.path,
			})),
			temporalDimensions: output.temporal_dimensions.map((d) => ({
				intent: d.intent_description,
				scope: d.scope_constraint?.path,
			})),
			userPersona: output.user_persona_config,
			isCrossDomain: output.is_cross_domain,
		},
	};

	return {
		// Complete classifier output with all dimensions
		semantic_dimensions: output.semantic_dimensions,
		topology_dimensions: output.topology_dimensions,
		temporal_dimensions: output.temporal_dimensions,
		user_persona_config: output.user_persona_config,
		is_cross_domain: output.is_cross_domain,
		// Additional context for pipeline
		initialLeads: quickSearchResults,
	};
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function loadFolderIntuitions() {
	try {
		if (!sqliteStoreManager.isInitialized()) return [];
		const mobius = sqliteStoreManager.getMobiusNodeRepo('vault');
		return await mobius.listTopFoldersForSearchOrient(30);
	} catch {
		return [];
	}
}

async function loadGlobalIntuitionMap(): Promise<string | undefined> {
	try {
		if (!sqliteStoreManager.isInitialized()) return undefined;
		const stateRepo = sqliteStoreManager.getIndexStateRepo();
		const value = await stateRepo.get('knowledge_intuition_json');
		return value ?? undefined;
	} catch {
		return undefined;
	}
}

async function runQuickSearch(query: string): Promise<Array<{ path: string; title: string; score: number }>> {
	try {
		const ctx = AppContext.getInstance();
		const searchClient = ctx.searchClient;
		if (!searchClient) return [];
		const res = await searchClient.search({
			text: query,
			scopeMode: 'vault',
			topK: CLASSIFY_SEARCH_TOP_K,
			searchMode: 'hybrid',
			indexTenant: 'vault',
		});
		return (res.items ?? []).map((item) => ({
			path: item.path,
			title: item.title ?? item.path.split('/').pop() ?? '',
			score: item.score ?? 0,
		}));
	} catch {
		return [];
	}
}

