/**
 * Orient phase: quick intuition-driven positioning (< 2s deterministic + 1 LLM call).
 *
 * Reads precomputed L2 folder intuition + L3 global intuition map,
 * runs a quick FTS/vector search, then asks one LLM call to produce
 * an understanding + candidate folders + exploration plan.
 */

import { streamObject } from 'ai';
import { z } from 'zod/v3';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { StreamTriggerName, type LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import type { OrientResult } from './types';

const orientOutputSchema = z.object({
	understanding: z.string().describe('One-paragraph explanation of what the user is looking for'),
	candidate_folders: z.array(z.object({
		path: z.string(),
		relevance_reason: z.string(),
	})).describe('Top relevant folders from the vault'),
	exploration_plan: z.string().describe('Brief plan for how to explore the vault'),
	clarifying_questions: z.array(z.string()).describe('Questions to ask the user if the query is ambiguous'),
});

type OrientOutput = z.infer<typeof orientOutputSchema>;

/** Max folders to include in Orient context. */
const ORIENT_FOLDER_CONTEXT_LIMIT = 15;
/** Max initial search results. */
const ORIENT_SEARCH_TOP_K = 8;

/**
 * Run the Orient phase: deterministic data loading + one LLM call.
 */
export async function* runOrientPhase(options: {
	userQuery: string;
	aiServiceManager: AIServiceManager;
	stepId: string;
}): AsyncGenerator<LLMStreamEvent, OrientResult> {
	const { userQuery, aiServiceManager, stepId } = options;
	const ctx = AppContext.getInstance();

	// --- Step 1: Load precomputed intuition data ---
	const folderIntuitions = await loadFolderIntuitions();
	const globalIntuitionJson = await loadGlobalIntuitionMap();
	const quickSearchResults = await runQuickSearch(userQuery);

	yield {
		type: 'pk-debug',
		debugName: 'Orient: data loaded',
		extra: {
			folderCount: folderIntuitions.length,
			hasGlobalMap: !!globalIntuitionJson,
			searchResultCount: quickSearchResults.length,
		},
	};

	// --- Step 2: Build context and call LLM ---
	const folderContext = folderIntuitions
		.slice(0, ORIENT_FOLDER_CONTEXT_LIMIT)
		.map((f) => `- **${f.folderPath}** (${f.docCount} docs, rank: ${f.hubRank?.toFixed(2) ?? 'N/A'}): ${f.oneLiner}\n  Tags: ${f.topTags.join(', ')}\n  Keywords: ${f.topKeywords.join(', ')}`)
		.join('\n');

	const searchContext = quickSearchResults
		.map((r) => `- [${r.title}](${r.path}) (score: ${r.score.toFixed(3)})`)
		.join('\n');

	const systemPrompt = buildOrientSystemPrompt();
	const userPrompt = buildOrientUserPrompt({
		userQuery,
		folderContext,
		searchContext,
		globalIntuitionJson,
	});

	const { model: orientModel } = aiServiceManager.getModelInstanceForPrompt(PromptId.AiAnalysisQueryClassifier);

	const result = streamObject({
		model: orientModel,
		system: systemPrompt,
		prompt: userPrompt,
		schema: orientOutputSchema,
	});

	let orientOutput: OrientOutput | undefined;
	try {
		orientOutput = await result.object as OrientOutput;
	} catch (err) {
		orientOutput = {
			understanding: `Searching for: ${userQuery}`,
			candidate_folders: [],
			exploration_plan: 'Will explore the vault broadly using search and graph tools.',
			clarifying_questions: [],
		};
	}

	yield {
		type: 'pk-debug',
		debugName: 'Orient: LLM complete',
		extra: {
			understanding: orientOutput.understanding,
			candidateFolderCount: orientOutput.candidate_folders.length,
			hasClarifyingQuestions: orientOutput.clarifying_questions.length > 0,
		},
	};

	const folderMap = new Map(folderIntuitions.map((f) => [f.folderPath, f]));
	return {
		understanding: orientOutput.understanding,
		candidateFolders: orientOutput.candidate_folders.map((cf: { path: string; relevance_reason: string }) => ({
			path: cf.path,
			oneLiner: folderMap.get(cf.path)?.oneLiner ?? '',
			relevanceReason: cf.relevance_reason,
		})),
		initialLeads: quickSearchResults,
		explorationPlan: orientOutput.exploration_plan,
		clarifyingQuestions: orientOutput.clarifying_questions,
	};
}

// ---------------------------------------------------------------------------
// Helpers
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
			topK: ORIENT_SEARCH_TOP_K,
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

function buildOrientSystemPrompt(): string {
	return `You are a knowledge vault navigator. Given a user's question and precomputed folder-level intuition data + initial search results, your job is to:

1. Understand what the user is looking for (one paragraph)
2. Identify the most relevant folders in the vault
3. Suggest a brief exploration plan
4. Ask clarifying questions ONLY if the query is genuinely ambiguous

Be concise and action-oriented. Do NOT over-explain. Focus on guiding the exploration efficiently.
The candidate_folders should reference actual folder paths from the provided folder intuition data.`;
}

function buildOrientUserPrompt(options: {
	userQuery: string;
	folderContext: string;
	searchContext: string;
	globalIntuitionJson?: string;
}): string {
	const parts: string[] = [];
	parts.push(`## User Query\n${options.userQuery}`);

	if (options.folderContext) {
		parts.push(`## Folder Intuition (precomputed)\n${options.folderContext}`);
	}

	if (options.searchContext) {
		parts.push(`## Quick Search Results\n${options.searchContext}`);
	}

	if (options.globalIntuitionJson) {
		const truncated = options.globalIntuitionJson.length > 3000
			? options.globalIntuitionJson.slice(0, 3000) + '\n_(truncated)_'
			: options.globalIntuitionJson;
		parts.push(`## Global Intuition Map (excerpt)\n${truncated}`);
	}

	return parts.join('\n\n');
}
