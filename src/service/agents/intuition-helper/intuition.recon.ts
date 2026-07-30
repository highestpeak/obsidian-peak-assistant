/**
 * Knowledge intuition recon: plan (tools) → structured submit loop.
 *
 * Peak Harness owns both model turns and tool execution. The submit step uses
 * queryText + Zod parse after the plan tools have completed.
 */

import { knowledgeIntuitionSubmitSchema } from '@/core/schemas';
import { buildPromptTraceDebugEvent, StreamTriggerName, type LLMStreamEvent } from '@/core/providers/types';
import { Stopwatch } from '@/core/utils/Stopwatch';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/core/types/prompt';
export type ReconLoopDebugOptions = {
	/** Overrides budget-derived iteration cap (clamped to 1..6). */
	maxIterations?: number;
	/** 1-based: exit after this iteration's plan + host tool execution (before structured submit). */
	stopAfterPlanIteration?: number;
	/** 1-based: exit after this iteration's submit and memory merge. */
	stopAfterSubmitIteration?: number;
};

function effectiveReconMaxIterations(budgetDerived: number, debug?: ReconLoopDebugOptions): number {
	const base = Math.max(1, Math.min(6, budgetDerived));
	if (debug?.maxIterations !== undefined) {
		return Math.max(1, Math.min(6, Math.min(base, debug.maxIterations)));
	}
	return base;
}
import { mergeIntuitionSubmitIntoMemory, buildInitialIntuitionMemory } from './intuition.memory';
import type { IntuitionMemory, IntuitionPrepContext } from './types';
import { exploreFolderTool, findPathTool, graphTraversalTool, grepFileTreeTool, inspectNoteContextTool, localSearchWholeVaultTool } from '@/service/tools/search-graph-inspector';
import { exploreFolderEnvFromManager } from '@/service/tools/exploreFolderEnv';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
	assertSuccessfulRun,
	streamHarnessModel,
} from '@/service/agents/harness/HarnessModelRunner';
import { adaptAgentTool } from '@/service/agents/harness-bridge/agentToolAdapter';
import { getAllMcpToolDefs } from '@/service/mcp/MCPToolAdapter';

export type IntuitionReconCompleteCallback = (memory: IntuitionMemory) => void;

// ─── History entry for manual conversation tracking ─────────────────────────

interface HistoryEntry {
	role: 'user' | 'assistant' | 'tool-results';
	content: string;
}

/** Serialize conversation history into a prompt-friendly text block. */
function serializeHistory(history: HistoryEntry[]): string {
	return history
		.map((entry) => {
			switch (entry.role) {
				case 'user':
					return `<user>\n${entry.content}\n</user>`;
				case 'assistant':
					return `<assistant>\n${entry.content}\n</assistant>`;
				case 'tool-results':
					return `<tool-results>\n${entry.content}\n</tool-results>`;
			}
		})
		.join('\n\n');
}

const MCP_SERVER_NAME = 'recon';

/**
 * Runs the intuition manual loop until should_stop or max iterations.
 */
export async function* runKnowledgeIntuitionLoop(options: {
	ctx: IntuitionPrepContext;
	stepId: string;
	aiServiceManager: AIServiceManager;
	onComplete: IntuitionReconCompleteCallback;
	debug?: ReconLoopDebugOptions;
	/** T11J B1: caller passes app + pluginId so this module no longer reaches AppContext. */
	app: import('@/core/ports/AppHandle').AppHandle;
	pluginId: string;
	/** T13: MCP client manager injected so this module never reaches AppContext. */
	mcpClientManager: import('@/service/mcp/MCPClientManager').MCPClientManager | null;
}): AsyncGenerator<LLMStreamEvent, void> {
	const { ctx, stepId, aiServiceManager, onComplete, debug, mcpClientManager } = options;
	const stopwatch = new Stopwatch('Knowledge intuition recon');
	const getEnv = () => exploreFolderEnvFromManager(aiServiceManager);
	const tools = {
		explore_folder: exploreFolderTool(ctx.tm, { forceFormat: 'markdown' }, getEnv),
		grep_file_tree: grepFileTreeTool(getEnv),
		local_search_whole_vault: localSearchWholeVaultTool(ctx.tm, () => aiServiceManager.getSearchClient()),
		inspect_note_context: inspectNoteContextTool(ctx.tm, { forceFormat: 'markdown' }),
		graph_traversal: graphTraversalTool(ctx.tm, { forceFormat: 'markdown' }),
		find_path: findPathTool(ctx.tm),
	}
	const budgetDerived = Math.min(6, Math.max(3, Math.floor(ctx.indexBudgetRaw.limitTotal / 160)));
	const maxIter = effectiveReconMaxIterations(budgetDerived, debug);

	let memory = buildInitialIntuitionMemory();

	const initialUserPrompt = await aiServiceManager.renderPrompt(PromptId.KnowledgeIntuitionPlan, {
		userGoal: ctx.userGoal,
		vaultName: ctx.vaultName,
		currentDateLabel: ctx.currentDateLabel,
		vaultSummaryMarkdown: ctx.vaultSummaryMarkdown,
		baselineExcludedMarkdown: ctx.baselineExcludedMarkdown,
		backboneMarkdownExcerpt: ctx.backboneMarkdownExcerpt,
		backboneEdgesMarkdown: ctx.backboneEdgesMarkdown,
		folderSignalsMarkdown: ctx.folderSignalsMarkdown,
		documentShortlistMarkdown: ctx.documentShortlistMarkdown,
		folderTreeMarkdown: ctx.folderTreeMarkdown,
	});

	// Conversation history for multi-iteration context
	const history: HistoryEntry[] = [
		{ role: 'user', content: initialUserPrompt },
	];

	const externalTools = mcpClientManager
		? getAllMcpToolDefs(mcpClientManager)
		: [];
	const binding = ProfileRegistry.getInstance().getActiveAgentConfig();
	if (!binding) {
		throw new Error('Knowledge intuition requires an active Agent model');
	}

	for (let iter = 0; iter < maxIter; iter++) {
		const planSystem = await aiServiceManager.renderPrompt(PromptId.KnowledgeIntuitionPlanSystem, {});

		// Build the prompt: serialized history + iteration context
		let iterPrompt = serializeHistory(history);
		if (iter > 0) {
			iterPrompt += `\n\n[Iteration ${iter + 1}/${maxIter}] Intuition memory (JSON):\n${JSON.stringify(memory)}`;
		}

		yield buildPromptTraceDebugEvent(
			StreamTriggerName.KNOWLEDGE_INTUITION_PLAN,
			planSystem,
			iterPrompt,
		);
		stopwatch.start(`knowledge intuition plan iter ${iter}`);

		// Capture tool call results from Harness-owned execution.
		const capturedToolResults: string[] = [];
		const capturedToolCalls: Array<{ toolName: string; input: unknown }> = [];
		const localTools = Object.entries(tools).map(([name, agentTool]) =>
			adaptAgentTool(`mcp__${MCP_SERVER_NAME}__${name}`, {
				...agentTool,
				execute: async (input: any) => {
					capturedToolCalls.push({ toolName: name, input });
					const result = await agentTool.execute(input);
					const str = typeof result === 'string' ? result : JSON.stringify(result);
					capturedToolResults.push(`[${name}] ${str.slice(0, 2000)}${str.length > 2000 ? '…' : ''}`);
					return result;
				},
			}),
		);

		const planStream = streamHarnessModel({
			loopId: `intuition-recon-${stepId}-${iter + 1}`,
			profile: binding.profile,
			modelId: binding.modelId,
			prompt: iterPrompt,
			systemPrompt: planSystem,
			tools: [...localTools, ...externalTools],
			maxSteps: 2,
			maxToolCalls: 12,
			triggerName: StreamTriggerName.KNOWLEDGE_INTUITION_PLAN,
		});

		// Stream and collect plan text
		let planText = '';
		while (true) {
			const next = await planStream.next();
			if (next.done) {
				assertSuccessfulRun(next.value);
				break;
			}
			const ev = next.value;
			if (ev.type === 'text-delta' && typeof (ev as any).text === 'string') {
				planText += (ev as any).text;
			}
			yield ev;
		}

		stopwatch.stop();

		const toolResultsMarkdown = capturedToolResults.length > 0
			? capturedToolResults.join('\n\n')
			: '(no tool calls executed)';

		const iterOneBased = iter + 1;
		yield {
			type: 'pk-debug',
			debugName: 'Knowledge intuition plan+tools raw',
			extra: {
				iteration: iterOneBased,
				maxIter,
				planText: planText || undefined,
				toolCalls: capturedToolCalls,
				toolResultsPreview: toolResultsMarkdown.slice(0, 400) + (toolResultsMarkdown.length > 400 ? '…' : ''),
			},
		};

		if (debug?.stopAfterPlanIteration === iterOneBased) {
			yield {
				type: 'pk-debug',
				debugName: 'Knowledge intuition stop (after plan + tools)',
				extra: { stopped: true, iteration: iterOneBased, maxIter, phase: 'intuition_plan' as const },
			};
			onComplete(memory);
			return;
		}

		// Submit step: structured output via queryText + Zod parse
		const submitRaw = await aiServiceManager.queryText(
			PromptId.KnowledgeIntuitionSubmit,
			{
				userGoal: ctx.userGoal,
				iteration: iterOneBased,
				memoryJson: JSON.stringify(memory),
				vaultScaleHintMarkdown: ctx.vaultScaleHintMarkdown,
				folderTreeMarkdown: ctx.folderTreeMarkdown,
				backboneEdgesJson: ctx.backboneEdgesJson,
				toolResultsMarkdown,
			},
		);
		const submitJsonMatch = submitRaw.match(/```json\s*([\s\S]*?)```/) || submitRaw.match(/(\{[\s\S]*\})/);
		if (!submitJsonMatch) {
			console.error('[IntuitionRecon] No JSON in submit response, stopping loop');
			break;
		}
		const submit = knowledgeIntuitionSubmitSchema.parse(JSON.parse(submitJsonMatch[1] || submitJsonMatch[0]));

		yield {
			type: 'pk-debug',
			debugName: 'knowledge-intuition-submit',
			triggerName: StreamTriggerName.KNOWLEDGE_INTUITION_SUBMIT,
			extra: {
				iteration: iterOneBased,
				maxIter,
				should_stop: submit.should_stop,
				submit,
			},
		};

		memory = mergeIntuitionSubmitIntoMemory(memory, submit);

		// Update conversation history for next iteration
		if (planText) {
			history.push({ role: 'assistant', content: planText });
		}
		if (capturedToolResults.length > 0) {
			history.push({ role: 'tool-results', content: toolResultsMarkdown });
		}
		history.push({
			role: 'assistant',
			content: JSON.stringify({
				findingsSummary: submit.findingsSummary,
				should_stop: submit.should_stop,
			}),
		});

		if (debug?.stopAfterSubmitIteration === iterOneBased) {
			yield {
				type: 'pk-debug',
				debugName: 'Knowledge intuition stop (after submit)',
				extra: {
					stopped: true,
					iteration: iterOneBased,
					maxIter,
					phase: 'intuition_submit' as const,
					memoryAfterMerge: memory,
				},
			};
			onComplete(memory);
			return;
		}

		if (submit.should_stop) break;
	}

	yield {
		type: 'pk-debug',
		debugName: 'Knowledge intuition recon complete',
		extra: { stopwatch: stopwatch.toString() },
	};
	onComplete(memory);
}
