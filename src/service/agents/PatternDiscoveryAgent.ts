import { PromptId } from '@/core/types/prompt';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';
import {
	CONTEXT_VARIABLE_NAMES,
	CONDITION_NAMES,
	PatternDiscoveryOutputSchema,
	type PatternDiscoveryOutput,
} from '@/core/schemas/agents/pattern-discovery-schemas';

// ─── Input ───────────────────────────────────────────────────────────────────

export interface PatternDiscoveryInput {
	newQueries: Array<{ query: string; count: number; lastUsedAt: number }>;
	existingPatterns: Array<{ id: string; template: string; variables: string[]; conditions: object }>;
	vaultStructure: { folders: string[]; commonTags: string[]; commonProperties: string[] };
}

// ─── Singleton guard ─────────────────────────────────────────────────────────

let isRunning = false;

// ─── Main function ───────────────────────────────────────────────────────────

/**
 * Analyse recent queries and discover reusable query-template patterns.
 *
 * Fire-and-forget — returns `null` when skipped (already running) or on error.
 * Harness tier: local-fast (single-turn, no tools).
 *
 * T11J B1: caller injects the prompter so the agent no longer reaches
 * `AppContext.getInstance().manager`.
 */
export async function runPatternDiscovery(
	input: PatternDiscoveryInput,
	prompter: IAgentPrompter,
): Promise<PatternDiscoveryOutput | null> {
	if (isRunning) return null;
	isRunning = true;

	try {
		// 1. Call LLM via Agent SDK (Pattern B: single-turn, no tools)
		const text = await prompter.queryText(
			PromptId.PatternDiscovery,
			{
				availableVariables: CONTEXT_VARIABLE_NAMES.join(', '),
				availableConditions: CONDITION_NAMES.join(', '),
				queriesJson: JSON.stringify(input.newQueries, null, 2),
				existingPatternsJson: JSON.stringify(input.existingPatterns, null, 2),
				vaultStructureJson: JSON.stringify(input.vaultStructure, null, 2),
			},
		);

		// 2. Extract JSON from response
		const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
		if (!jsonMatch) {
			console.error('[PatternDiscovery] No JSON found in response');
			return null;
		}

		const jsonStr = jsonMatch[1] || jsonMatch[0];
		const parsed = PatternDiscoveryOutputSchema.parse(JSON.parse(jsonStr));
		return parsed;
	} catch (err) {
		console.error('[PatternDiscovery] Error:', err);
		return null;
	} finally {
		isRunning = false;
	}
}
