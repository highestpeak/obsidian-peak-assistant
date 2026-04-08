/**
 * Knowledge intuition recon: plan (tools) → structured submit loop.
 */

import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { knowledgeIntuitionSubmitSchema } from '@/core/schemas';
import { isBlankString } from '@/core/utils/common-utils';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { StreamTriggerName, UIStepType, type LLMStreamEvent } from '@/core/providers/types';
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
import { buildIntuitionTools, executeReconToolCalls } from './intuition.tools';
import type { IntuitionMemory, IntuitionPrepContext } from './types';

export type IntuitionReconCompleteCallback = (memory: IntuitionMemory) => void;

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
	const tools = buildIntuitionTools(ctx.tm);
	const budgetDerived = Math.min(6, Math.max(3, Math.floor(ctx.indexBudgetRaw.limitTotal / 160)));
	const maxIter = effectiveReconMaxIterations(budgetDerived, debug);

	let memory = buildInitialIntuitionMemory();
	const messages: ModelMessage[] = [
		{
			role: 'user',
			content: await aiServiceManager.renderPrompt(PromptId.KnowledgeIntuitionPlan, {
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
			}),
		},
	];

	for (let iter = 0; iter < maxIter; iter++) {
		const planSystem = await aiServiceManager.renderPrompt(PromptId.KnowledgeIntuitionPlanSystem, {});
		const planMessages: ModelMessage[] = [
			...messages,
			...(iter > 0
				? [
						{
							role: 'user' as const,
							content:
								`[Iteration ${iter + 1}/${maxIter}] Intuition memory (JSON):\n` + JSON.stringify(memory),
						},
				  ]
				: []),
		];
		yield buildPromptTraceDebugEvent(
			StreamTriggerName.KNOWLEDGE_INTUITION_PLAN,
			planSystem,
			JSON.stringify(planMessages),
		);
		stopwatch.start(`knowledge intuition plan iter ${iter}`);
		const planResult = streamText({
			model: aiServiceManager.getModelInstanceForPrompt(PromptId.KnowledgeIntuitionPlan).model,
			system: planSystem,
			messages: planMessages,
			tools,
			toolChoice: 'auto',
		});
		yield* streamTransform(planResult.fullStream, StreamTriggerName.KNOWLEDGE_INTUITION_PLAN, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
		});
		const planStepMessages: ModelMessage[] = [];
		const planReasoning = (await planResult.reasoning).map((r) => r.text).join('\n');
		if (!isBlankString(planReasoning)) {
			planStepMessages.push({ role: 'assistant', content: planReasoning });
		}
		const planText = await planResult.text;
		if (!isBlankString(planText)) {
			planStepMessages.push({ role: 'assistant', content: planText });
		}
		const toolCalls = await planResult.toolCalls;
		if (toolCalls.length > 0) {
			planStepMessages.push({
				role: 'assistant',
				content: toolCalls.map((tc) => ({
					type: 'tool-call' as const,
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					input: tc.input,
				})),
			});
		}
		stopwatch.stop();

		const { full: fullToolMessages, summary: summaryToolMessages } = await executeReconToolCalls(tools, planStepMessages);
		const toolResultsMarkdown =
			fullToolMessages.length > 0
				? fullToolMessages.map((m) => JSON.stringify(m.content)).join('\n\n')
				: '(no tool calls executed)';

		const iterOneBased = iter + 1;
		yield {
			type: 'pk-debug',
			debugName: 'Knowledge intuition plan+tools raw',
			extra: {
				iteration: iterOneBased,
				maxIter,
				planReasoning: planReasoning || undefined,
				planText: planText || undefined,
				toolCalls: toolCalls.map((tc) => ({
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					input: tc.input,
				})),
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

		const submit = await aiServiceManager.streamObjectWithPrompt(
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
			knowledgeIntuitionSubmitSchema,
		);
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
		messages.push(...planStepMessages);
		messages.push(...summaryToolMessages);
		messages.push({
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
