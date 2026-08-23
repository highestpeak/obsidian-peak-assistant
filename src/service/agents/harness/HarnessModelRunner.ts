/**
 * Canonical model execution entry for Peak-owned agent work.
 *
 * Provider adapters only create a Vercel AI SDK LanguageModel. Peak's
 * AgentLoop remains the owner of turns, tools, budgets, traces, aborts and
 * completion semantics. External agent runtimes must not be introduced here.
 */

import {
	defaultSettingsMiddleware,
	wrapLanguageModel,
	type LanguageModel,
} from 'ai';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { Profile } from '@/core/profiles/types';
import type {
	LLMStreamEvent,
	LLMUsage,
	StreamTriggerName,
} from '@/core/providers/types';
import { createLanguageModel } from '@/core/providers/vercel/provider-factory';
import { runAgentLoop } from './loop/AgentLoop';
import type {
	AgentLoopModelSettings,
	AgentLoopResult,
	AgentLoopStreamEvent,
} from './loop/types';
import { TierController } from './tier/TierController';
import {
	DEFAULT_TIER_CAPABILITIES,
	type ModelTier,
	type TierBinding,
} from './tier/types';
import type { ToolDef } from './tool/types';
import type { StepResult } from './trace/events';

export interface HarnessModelRunRequest {
	loopId: string;
	profile: Profile;
	modelId: string;
	systemPrompt: string;
	prompt: string;
	tools?: ToolDef[];
	tier?: ModelTier;
	maxSteps?: number;
	maxTokens?: number;
	maxToolCalls?: number;
	modelSettings?: AgentLoopModelSettings;
	/** Provider-level output contract. Structured callers use this to pass the
	 * actual JSON Schema instead of relying on prompt-only JSON instructions. */
	responseFormat?: LanguageModelV3CallOptions['responseFormat'];
	signal?: AbortSignal;
	stopWhen?: (step: StepResult) => boolean | Promise<boolean>;
	treatBareTextAsFinal?: boolean;
	bareTextContinuationNudge?: string;
	onStepFinish?: (step: StepResult) => void | Promise<void>;
	onStreamEvent?: (event: AgentLoopStreamEvent) => void;
	/** Test seam; production callers leave this unset. */
	languageModel?: LanguageModel;
}

export interface HarnessModelStreamRequest extends HarnessModelRunRequest {
	triggerName?: StreamTriggerName;
}

export async function runHarnessModel(
	request: HarnessModelRunRequest,
): Promise<AgentLoopResult> {
	const tools = request.tools ?? [];
	const tier = request.tier ?? 'research';
	const baseLanguageModel =
		request.languageModel ?? createLanguageModel(request.profile, request.modelId);
	const languageModel = request.responseFormat
		? wrapLanguageModel({
			model: baseLanguageModel,
			middleware: defaultSettingsMiddleware({
				settings: { responseFormat: request.responseFormat },
			}),
		})
		: baseLanguageModel;
	const binding: TierBinding = {
		tier,
		providerId: request.profile.id ?? request.profile.kind,
		modelId: request.modelId,
		resolve: () => languageModel,
		capabilities: { ...DEFAULT_TIER_CAPABILITIES },
		estimatedSingleStepP: 0.99,
	};
	const tierController = new TierController({
		bindings: { [tier]: binding },
		policy: {
			preferred: tier,
			allowEscalation: false,
			maxEscalationsPerLoop: 0,
		},
		loopId: request.loopId,
	});

	return runAgentLoop({
		loopId: request.loopId,
		systemPrompt: request.systemPrompt,
		initialMessages: [{ role: 'user', content: request.prompt }],
		tools,
		tierController,
		budget: {
			maxSteps: request.maxSteps ?? (tools.length > 0 ? 5 : 1),
			maxTokens: request.maxTokens ?? 20_000,
			maxToolCalls: request.maxToolCalls ?? Math.max(1, tools.length * 4),
		},
		modelSettings: request.modelSettings,
		abortSignal: request.signal,
		stopWhen: request.stopWhen,
		treatBareTextAsFinal: request.treatBareTextAsFinal,
		bareTextContinuationNudge: request.bareTextContinuationNudge,
		onStepFinish: request.onStepFinish,
		onStreamEvent: request.onStreamEvent,
	});
}

export async function runHarnessText(
	request: HarnessModelRunRequest,
): Promise<{ text: string; usage: LLMUsage; result: AgentLoopResult }> {
	const result = await runHarnessModel(request);
	assertSuccessfulRun(result);
	return {
		text: result.finalText,
		usage: usageFromHarnessResult(result),
		result,
	};
}

export async function* streamHarnessModel(
	request: HarnessModelStreamRequest,
): AsyncGenerator<LLMStreamEvent, AgentLoopResult, void> {
	const queue: LLMStreamEvent[] = [];
	let wake: (() => void) | null = null;
	let settled = false;

	const push = (event: LLMStreamEvent) => {
		queue.push(event);
		const resolve = wake;
		wake = null;
		resolve?.();
	};

	const runPromise = runHarnessModel({
		...request,
		onStreamEvent: (event) => {
			request.onStreamEvent?.(event);
			const translated = translateHarnessEvent(event, request.triggerName);
			if (translated) push(translated);
		},
	}).finally(() => {
		settled = true;
		const resolve = wake;
		wake = null;
		resolve?.();
	});

	try {
		while (true) {
			if (queue.length > 0) {
				yield queue.shift() as LLMStreamEvent;
				continue;
			}
			if (settled) break;
			await new Promise<void>((resolve) => {
				wake = resolve;
			});
		}

		const result = await runPromise;
		yield {
			type: 'complete',
			usage: usageFromHarnessResult(result),
			finishReason: result.finishReason === 'error' ? 'error' : 'stop',
			durationMs: result.durationMs,
			...(request.triggerName ? { triggerName: request.triggerName } : {}),
		} as LLMStreamEvent;
		return result;
	} finally {
		queue.length = 0;
	}
}

export function usageFromHarnessResult(result: AgentLoopResult): LLMUsage {
	let inputTokens = 0;
	let outputTokens = 0;
	let reasoningTokens = 0;
	let cachedInputTokens = 0;
	for (const step of result.steps) {
		inputTokens += step.promptTokens;
		outputTokens += step.completionTokens;
		reasoningTokens += step.reasoningTokens ?? 0;
		cachedInputTokens += step.cachedInputTokens ?? 0;
	}
	return {
		inputTokens,
		outputTokens,
		totalTokens: result.totalTokens,
		reasoningTokens,
		cachedInputTokens,
	};
}

export function assertSuccessfulRun(result: AgentLoopResult): void {
	if (result.status === 'completed') return;
	if (result.status === 'cancelled') {
		throw new DOMException('Harness run cancelled', 'AbortError');
	}
	throw new Error(result.error || `Harness run failed (${result.finishReason})`);
}

function translateHarnessEvent(
	event: AgentLoopStreamEvent,
	triggerName?: StreamTriggerName,
): LLMStreamEvent | null {
	const trigger = triggerName ? { triggerName } : {};
	switch (event.type) {
		case 'text_delta':
			return { type: 'text-delta', text: event.delta, ...trigger } as LLMStreamEvent;
		case 'reasoning_delta':
			return { type: 'reasoning-delta', text: event.delta, ...trigger } as LLMStreamEvent;
		case 'tool_input_start':
			return {
				type: 'tool-input-start',
				toolName: event.toolName,
				id: event.toolCallId,
				...trigger,
			} as LLMStreamEvent;
		case 'tool_input_delta':
			return {
				type: 'tool-input-delta',
				delta: event.delta,
				id: event.toolCallId,
				...trigger,
			} as LLMStreamEvent;
		case 'tool_call':
			return {
				type: 'tool-call',
				id: event.toolCallId,
				toolName: event.toolName,
				input: event.args,
				...trigger,
			} as LLMStreamEvent;
		case 'tool_result':
			return {
				type: 'tool-result',
				id: event.toolCallId,
				toolName: event.toolName,
				input: {},
				output: event.payload,
				...trigger,
			} as LLMStreamEvent;
		case 'step_finish':
			return {
				type: 'on-step-finish',
				text: event.text,
				finishReason: event.finishReason,
				usage: {
					inputTokens: event.promptTokens,
					outputTokens: event.completionTokens,
					totalTokens: event.totalTokens,
				},
				...trigger,
			} as LLMStreamEvent;
		case 'error':
			return {
				type: 'error',
				error: new Error(event.error),
				...trigger,
			} as LLMStreamEvent;
		case 'loop_start':
		case 'step_start':
		case 'permission_request':
		case 'permission_resolved':
		case 'run_status':
		case 'loop_finish':
			return null;
	}
}
