/**
 * Knowledge intuition recon: plan (tools) → structured submit loop.
 *
 * Provider v2: migrated from Vercel AI SDK streamText to Agent SDK queryWithProfile.
 * The plan step uses an MCP server for vault tools. Tool execution happens inside
 * the SDK subprocess via IPC callbacks. The submit step uses queryText + Zod parse.
 */

import { knowledgeIntuitionSubmitSchema } from '@/core/schemas';
import { buildPromptTraceDebugEvent } from '@/core/providers/helpers/stream-helper';
import { StreamTriggerName, type LLMStreamEvent } from '@/core/providers/types';
import { Stopwatch } from '@/core/utils/Stopwatch';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
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
import { exploreFolderToolMarkdownOnly, findPathTool, graphTraversalToolMarkdownOnly, grepFileTreeTool, hubLocalGraphTool, inspectNoteContextToolMarkdownOnly, localSearchWholeVaultTool } from '@/service/tools/search-graph-inspector';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { translateSdkMessages } from '@/service/agents/core/sdkMessageAdapter';
import { agentToolsToMcpServer, mcpToolNames } from '@/service/agents/core/agentToolMcpAdapter';

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
}): AsyncGenerator<LLMStreamEvent, void> {
	const { ctx, stepId, aiServiceManager, onComplete, debug } = options;
	const stopwatch = new Stopwatch('Knowledge intuition recon');
	const tools = {
		explore_folder: exploreFolderToolMarkdownOnly(ctx.tm),
		grep_file_tree: grepFileTreeTool(),
		local_search_whole_vault: localSearchWholeVaultTool(ctx.tm),
		inspect_note_context: inspectNoteContextToolMarkdownOnly(ctx.tm),
		graph_traversal: graphTraversalToolMarkdownOnly(ctx.tm),
		hub_local_graph: hubLocalGraphTool(ctx.tm),
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

	// Build MCP server and tool names once (tools don't change across iterations)
	const mcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, tools);
	const allowedTools = mcpToolNames(MCP_SERVER_NAME, tools);

	// Get app + profile for SDK calls
	const appCtx = AppContext.getInstance();
	const profile = ProfileRegistry.getInstance().getActiveAgentProfile()!;

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

		// Capture tool call results from MCP server execution
		const capturedToolResults: string[] = [];
		const capturedToolCalls: Array<{ toolName: string; input: unknown }> = [];

		// Build a capturing MCP server that records tool results
		const capturingMcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, Object.fromEntries(
			Object.entries(tools).map(([name, agentTool]) => [name, {
				...agentTool,
				execute: async (input: any) => {
					capturedToolCalls.push({ toolName: name, input });
					const result = await agentTool.execute(input);
					const str = typeof result === 'string' ? result : JSON.stringify(result);
					capturedToolResults.push(`[${name}] ${str.slice(0, 2000)}${str.length > 2000 ? '…' : ''}`);
					return result;
				},
			}]),
		));

		// Call Agent SDK for the plan step
		const planMessages = queryWithProfile(appCtx.app, appCtx.pluginId, profile, {
			prompt: iterPrompt,
			systemPrompt: planSystem,
			maxTurns: 2, // one LLM turn with tool calls + one final response
			mcpServers: { [MCP_SERVER_NAME]: capturingMcpServer },
			allowedTools,
		});

		// Stream and collect plan text
		let planText = '';
		for await (const ev of translateSdkMessages(planMessages, {
			triggerName: StreamTriggerName.KNOWLEDGE_INTUITION_PLAN,
			hasPartialMessages: true,
		})) {
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
