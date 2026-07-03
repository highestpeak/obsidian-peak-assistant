// Plan → Submit → Memory-merge loop for HubCuratorAgent.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 4.3.

import { PromptId } from '@/core/types/prompt';
import type { AIServiceManager } from '@/service/chat/service-manager';
import {
	hubCurationSubmitSchema,
	type HubCurationSubmit,
} from '@/core/schemas/agents/hubCuration';
import type { HubCurationMemory, HubCurationPrepContext } from './types';
import { buildInitialHubCurationMemory, mergeSubmitIntoMemory } from './hubCurationMemory';

export interface HubCurationReconResult {
	memory: HubCurationMemory;
	iterationsRan: number;
	stoppedEarly: boolean;
}

/**
 * Runs the curator loop until `should_stop=true` or budget.maxIterations reached.
 *
 * NOTE: This implementation calls `queryStructured` for the submit step directly —
 * it does NOT run a separate plan step with tool calls. Tool-augmented planning is a
 * follow-up (mirrors `KnowledgeIntuitionAgent` MCP wiring). For the MVP the LLM sees
 * the world snapshot in the plan prompt and submits a plan in one call per iteration.
 * Multi-iteration behavior is still exercised: the LLM can propose partial plans,
 * see the merged memory, and refine.
 */
export async function runHubCurationLoop(input: {
	prep: HubCurationPrepContext;
	aiServiceManager: AIServiceManager;
	usageSessionId?: string;
}): Promise<HubCurationReconResult> {
	const { prep, aiServiceManager, usageSessionId } = input;
	let memory = buildInitialHubCurationMemory();
	let stoppedEarly = false;

	for (let i = 0; i < prep.budget.maxIterations; i++) {
		// Render the plan prompt (system prompt content); use its rendered text as system.
		const planPromptText = await aiServiceManager.renderPrompt(PromptId.HubCurationPlan, {
			vaultName: prep.vaultName,
			currentDateLabel: prep.currentDateLabel,
			worldSnapshotMarkdown: prep.worldSnapshotMarkdown,
		});

		const submitRaw = await aiServiceManager.queryStructured<HubCurationSubmit>(
			PromptId.HubCurationSubmit,
			{},
			undefined,
			{
				systemPrompt: planPromptText,
				usageFeature: 'indexing',
				usageAction: 'hub-curation-submit',
				usageSessionId,
			},
		);

		const submit = hubCurationSubmitSchema.parse(submitRaw);
		memory = mergeSubmitIntoMemory(memory, submit);

		if (submit.should_stop) {
			stoppedEarly = true;
			break;
		}
	}

	return { memory, iterationsRan: memory.iterations, stoppedEarly };
}
