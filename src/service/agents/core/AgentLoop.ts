/**
 * Generic manual agent loop: plan (with tools) → execute tools → optional structured submit → merge → repeat.
 * Replaces ai-sdk Experimental_Agent with full orchestration control.
 *
 * Pattern extracted from RawSearchAgent.runManualReconLoop and intuition.recon.runKnowledgeIntuitionLoop.
 */

import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import { StreamTriggerName, UIStepType, emptyUsage, mergeTokenUsage } from '@/core/providers/types';
import { isBlankString } from '@/core/utils/common-utils';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { executeToolCalls } from './tool-executor';
import type { AgentLoopConfig, PeakAgentConfig, PeakAgentEvent, PeakAgentStats, PeakAgentLoopResult } from './types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { PromptId } from '@/service/prompt/PromptId';

/**
 * Options for running a generic agent loop.
 */
export interface RunAgentLoopOptions<TState, TSubmit> {
	config: PeakAgentConfig<TState, TSubmit>;
	initialState: TState;
	/** Model to use for plan step. */
	modelForPlan: ReturnType<AIServiceManager['getModelInstanceForPrompt']>;
	/** Step ID for UI event correlation. */
	stepId: string;
	/** Trigger name for stream events. */
	triggerName: StreamTriggerName;
}

/**
 * Generic agent loop with per-iteration timing, token accumulation, and human-readable step progress events.
 * Yields PeakAgentEvent for UI updates, streaming, and debugging.
 *
 * Replaces ai-sdk Experimental_Agent with full orchestration control:
 * plan (with tools) → execute tools → optional structured submit → merge → repeat
 */
export async function* runAgentLoop<TState, TSubmit>(
	options: RunAgentLoopOptions<TState, TSubmit>,
): AsyncGenerator<PeakAgentEvent, PeakAgentLoopResult<TState>> {
	const { config, stepId, triggerName } = options;
	const { stepLabel } = config;
	let state = options.initialState;
	const globalStopwatch = new Stopwatch('PeakAgent.total');
	const iterStopwatch = new Stopwatch('PeakAgent.iter');
	globalStopwatch.start('total');

	let totalToolCalls = 0;
	let stoppedReason: PeakAgentStats['stoppedReason'] = 'max_iterations';
	let totalUsage: LLMUsage = emptyUsage();
	const perIterationMs: number[] = [];
	const perIterationPhaseMs: Array<{ planMs: number; toolExecMs: number; submitMs: number }> = [];
	const toolCallTimings: Array<{ toolName: string; durationMs: number }> = [];

	const messages: ModelMessage[] = await config.buildInitialMessages(state);

	for (let iter = 0; iter < config.maxIterations; iter++) {
		// --- Progress: plan start ---
		yield {
			type: 'agent-step-progress',
			stepLabel,
			detail: `Planning (iter ${iter + 1}/${config.maxIterations})…`,
			triggerName,
		};

		// --- Plan step ---
		iterStopwatch.start(`plan-${iter}`);
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

		// Accumulate token usage
		const planUsage = await planResult.usage;
		if (planUsage) {
			totalUsage = mergeTokenUsage(totalUsage, {
				inputTokens: planUsage.inputTokens,
				outputTokens: planUsage.outputTokens,
				totalTokens: planUsage.totalTokens,
			});
		}
		const planDurationMs = iterStopwatch.getLastDuration();
		iterStopwatch.stop();

		// --- Progress: tool execution ---
		if (toolCalls.length > 0) {
			const toolNames = toolCalls.map((tc) => tc.toolName).join(', ');
			yield {
				type: 'agent-step-progress',
				stepLabel,
				detail: `Running tools: ${toolNames}`,
				triggerName,
			};
		}

		// --- Tool execution ---
		iterStopwatch.start(`tool-exec-${iter}`);
		const { full: fullToolMessages, summary: summaryToolMessages } =
			await executeToolCalls(config.tools, planStepMessages);
		const toolExecDurationMs = iterStopwatch.getLastDuration();
		iterStopwatch.stop();

		// Track per-tool timings (approximate: all tools share exec time equally)
		if (toolCalls.length > 0) {
			const perToolMs = Math.round(toolExecDurationMs / toolCalls.length);
			for (const tc of toolCalls) {
				toolCallTimings.push({ toolName: tc.toolName, durationMs: perToolMs });
			}
		}

		// --- Submit step ---
		let submit: TSubmit | undefined;
		let submitDurationMs = 0;
		if (config.runSubmit) {
			yield {
				type: 'agent-step-progress',
				stepLabel,
				detail: `Submitting results…`,
				triggerName,
			};
			iterStopwatch.start(`submit-${iter}`);
			submit = await config.runSubmit(state, iter, planStepMessages, fullToolMessages);
			submitDurationMs = iterStopwatch.getLastDuration();
			iterStopwatch.stop();
		}

		// --- Merge into state ---
		if (submit != null && config.mergeSubmit) {
			state = config.mergeSubmit(state, submit);
		}

		// --- Append history ---
		messages.push(...planStepMessages);
		messages.push(...summaryToolMessages);

		// --- Track iteration timing ---
		const iterMs = planDurationMs + toolExecDurationMs + submitDurationMs;
		perIterationMs.push(iterMs);
		perIterationPhaseMs.push({ planMs: planDurationMs, toolExecMs: toolExecDurationMs, submitMs: submitDurationMs });

		// --- Yield debug ---
		yield {
			type: 'pk-debug',
			debugName: `PeakAgent [${stepLabel}] iter ${iter + 1}`,
			extra: {
				iteration: iter + 1,
				maxIterations: config.maxIterations,
				toolCallCount: toolCalls.length,
				hasSubmit: submit != null,
				iterMs,
				totalInputTokens: totalUsage.inputTokens,
				totalOutputTokens: totalUsage.outputTokens,
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

	globalStopwatch.stop();
	const totalDurationMs = globalStopwatch.getTotalElapsed();
	const stopwatchSegments = iterStopwatch.getSegments();

	const peakStats: PeakAgentStats = {
		totalIterations: perIterationMs.length,
		totalToolCalls,
		stoppedReason,
		totalInputTokens: totalUsage.inputTokens ?? 0,
		totalOutputTokens: totalUsage.outputTokens ?? 0,
		totalDurationMs,
		perIterationMs,
		perIterationPhaseMs,
		toolCallTimings,
		stopwatchSegments,
	};

	yield {
		type: 'agent-stats',
		stats: peakStats,
		triggerName,
	};

	return {
		finalState: state,
		messages,
		stats: peakStats,
	};
}
