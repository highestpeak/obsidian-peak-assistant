/**
 * WorkflowAgent: generates workflow steps from a natural language description,
 * then executes them using WorkflowRunner.
 */

import type { WorkflowStep, WorkflowResult } from './types';
import { WorkflowRunner } from './WorkflowRunner';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { warmupPool, queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { collectJson } from '@/service/agents/core/sdkMessageAdapter';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

const WORKFLOW_SYSTEM_PROMPT = `You are a workflow planner for an Obsidian knowledge base.
Given a user's natural language description of a multi-step task, generate a JSON array of workflow steps.

Each step has this shape:
{
  "id": "unique_id",
  "description": "Human-readable description",
  "action": "search" | "read" | "summarize" | "filter" | "aggregate" | "create-note",
  "params": { ... action-specific parameters },
  "condition": "hasResults" | "notEmpty" | null
}

Action parameters:
- search: { "query": "search text", "limit": 10 }
- read: { "limit": 5 } (reads notes from previous search results)
- summarize: { "instruction": "what to summarize about" }
- filter: { "contains": "keyword" } or { "minScore": 0.5 }
- aggregate: { "title": "Report Title", "format": "markdown" }
- create-note: { "folder": "Workflow-Output", "filename": "report-name" }

Common patterns:
1. "find notes matching X → summarize each → create report"
   = search → read → summarize → aggregate → create-note
2. "find all notes about X"
   = search → aggregate
3. "summarize notes in folder Y about topic Z"
   = search (with folder context) → read → summarize → aggregate

IMPORTANT: Return ONLY a valid JSON array of steps. No markdown fences, no explanation.`;

export interface WorkflowAgentResult {
	steps: WorkflowStep[];
	executionResult: WorkflowResult;
}

/**
 * Parse a natural language workflow description into steps, then execute them.
 */
export async function runWorkflow(
	description: string,
	signal?: AbortSignal,
): Promise<WorkflowAgentResult> {
	// 1. Generate steps from description using LLM
	const steps = await generateWorkflowSteps(description, signal);

	// 2. Execute the generated steps
	const runner = new WorkflowRunner();
	if (signal) {
		signal.addEventListener('abort', () => runner.cancel());
	}
	const executionResult = await runner.execute(steps);

	return { steps, executionResult };
}

/**
 * Use the Agent SDK to generate workflow steps from a description.
 */
async function generateWorkflowSteps(
	description: string,
	signal?: AbortSignal,
): Promise<WorkflowStep[]> {
	await warmupPool();

	const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
	if (!profile) {
		throw new Error('No active agent profile configured.');
	}

	const ctx = AppContext.getInstance();
	const messages = queryWithProfile(ctx.app, ctx.pluginId, profile, {
		prompt: `Generate workflow steps for: "${description}"`,
		systemPrompt: WORKFLOW_SYSTEM_PROMPT,
		maxTurns: 1,
		signal,
	});

	const raw = await collectJson<WorkflowStep[]>(messages);

	// Validate and assign IDs if missing
	if (!Array.isArray(raw)) {
		throw new Error('LLM did not return a valid workflow step array');
	}

	return raw.map((step, idx) => ({
		id: step.id || generateUuidWithoutHyphens(),
		description: step.description || `Step ${idx + 1}`,
		action: step.action,
		params: step.params || {},
		condition: step.condition ?? undefined,
	}));
}
