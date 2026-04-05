/**
 * Generic manual agent loop: plan (with tools) → execute tools → optional structured submit → merge → repeat.
 * Replaces ai-sdk Experimental_Agent with full orchestration control.
 *
 * Pattern extracted from RawSearchAgent.runManualReconLoop and intuition.recon.runKnowledgeIntuitionLoop.
 */

import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UIStepType } from '@/core/providers/types';
import { isBlankString } from '@/core/utils/common-utils';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { executeReconToolCalls, TOOL_OUTPUT_MAX_CHARS } from '@/service/agents/hub-helper/hubDiscovery.tools';
import type { AgentLoopConfig, AgentLoopStats, AgentLoopEvent } from './types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { PromptId } from '@/service/prompt/PromptId';

export interface RunAgentLoopOptions<TState, TSubmit> {
	config: AgentLoopConfig<TState, TSubmit>;
	initialState: TState;
	/** Model to use for plan step. */
	modelForPlan: ReturnType<AIServiceManager['getModelInstanceForPrompt']>;
	/** Step ID for UI event correlation. */
	stepId: string;
	/** Trigger name for stream events. */
	triggerName: StreamTriggerName;
}

export interface AgentLoopResult<TState> {
	finalState: TState;
	messages: ModelMessage[];
	stats: AgentLoopStats;
}

/**
 * Run a generic plan → tool → submit loop.
 * Yields LLMStreamEvents for UI display; returns final state + messages.
 */
export async function* runAgentLoop<TState, TSubmit>(
	options: RunAgentLoopOptions<TState, TSubmit>,
): AsyncGenerator<AgentLoopEvent, AgentLoopResult<TState>> {
	const { config, stepId, triggerName } = options;
	let state = options.initialState;
	const stopwatch = new Stopwatch('AgentLoop');
	let totalToolCalls = 0;
	let stoppedReason: AgentLoopStats['stoppedReason'] = 'max_iterations';

	const messages: ModelMessage[] = await config.buildInitialMessages(state);

	for (let iter = 0; iter < config.maxIterations; iter++) {
		// --- Plan step ---
		stopwatch.start(`plan-${iter}`);
		const planSystem = await config.buildPlanSystemPrompt(state, iter);
		const injection = config.buildPlanInjection?.(state, iter, messages) ?? [];
		const planInputMessages = [...messages, ...injection];

		yield buildPromptTraceDebugEvent(triggerName, planSystem, JSON.stringify(planInputMessages));

		const planResult = streamText({
			model: options.modelForPlan.model,
			system: planSystem,
			messages: planInputMessages,
			tools: config.tools,
			toolChoice: config.toolChoice ?? 'auto',
		});
		yield* streamTransform(planResult.fullStream, triggerName, {
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
			totalToolCalls += toolCalls.length;
		}
		stopwatch.stop();

		// --- Tool execution ---
		stopwatch.start(`tools-${iter}`);
		const { full: fullToolMessages, summary: summaryToolMessages } =
			await executeReconToolCalls(config.tools, planStepMessages);
		stopwatch.stop();

		// --- Submit step ---
		let submit: TSubmit | undefined;
		if (config.runSubmit) {
			stopwatch.start(`submit-${iter}`);
			submit = await config.runSubmit(state, iter, planStepMessages, fullToolMessages);
			stopwatch.stop();
		}

		// --- Merge into state ---
		if (submit != null && config.mergeSubmit) {
			state = config.mergeSubmit(state, submit);
		}

		// --- Append history ---
		messages.push(...planStepMessages);
		messages.push(...summaryToolMessages);

		// --- Yield debug ---
		yield {
			type: 'pk-debug',
			debugName: `AgentLoop iteration ${iter + 1}`,
			extra: {
				iteration: iter + 1,
				maxIterations: config.maxIterations,
				toolCallCount: toolCalls.length,
				hasSubmit: submit != null,
				stepDuration: stopwatch.getLastDuration(),
			},
		};

		// --- Callback ---
		const callbackResult = config.onIterationComplete?.({
			iteration: iter,
			planMessages: planStepMessages,
			toolResultsFull: fullToolMessages,
			toolResultsSummary: summaryToolMessages,
			submit,
			shouldStop: false,
		});
		if (callbackResult === false) {
			stoppedReason = 'callback_stop';
			break;
		}

		// --- Stop check ---
		if (config.shouldStop?.(state, submit, iter)) {
			stoppedReason = 'should_stop';
			break;
		}
	}

	return {
		finalState: state,
		messages,
		stats: {
			totalIterations: config.maxIterations,
			totalToolCalls,
			stoppedReason,
		},
	};
}
