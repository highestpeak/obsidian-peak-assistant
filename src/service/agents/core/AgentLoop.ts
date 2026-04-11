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
import type { PeakAgentConfig, PeakAgentEvent, PeakAgentStats, PeakAgentLoopResult } from './types';
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
	/** Optional abort signal — checked before each iteration and threaded into streamText. */
	signal?: AbortSignal;
	/** Optional task index — for parallel task identification in agent-step-progress events. */
	taskIndex?: number;
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
	const { config, stepId, triggerName, signal, taskIndex } = options;
	const { stepLabel } = config;
	let state = options.initialState;
	const globalStopwatch = new Stopwatch('PeakAgent.total');
	const iterStopwatch = new Stopwatch('PeakAgent.iter');
	globalStopwatch.start('total');

	let totalToolCalls = 0;
	let stoppedReason: PeakAgentStats['stoppedReason'] = 'max_iterations';
	let totalUsage: LLMUsage = emptyUsage();
	const perIterationPhaseMs: Array<{ planMs: number; toolExecMs: number; submitMs: number }> = [];
	const toolCallTimings: Array<{ toolName: string; durationMs: number }> = [];

	const messages: ModelMessage[] = await config.buildInitialMessages(state);

	for (let iter = 0; iter < config.maxIterations; iter++) {
		// --- Abort check ---
		if (signal?.aborted) {
			stoppedReason = 'aborted';
			break;
		}

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
			abortSignal: signal,
		});
		const planStepMessages: ModelMessage[] = [];
		let planText = '';
		let toolCalls: Awaited<typeof planResult.toolCalls> = [];
		try {
			// Manual loop instead of yield* so we can intercept { type: 'error' } events
			// (AI SDK emits tool validation errors as stream chunks, not thrown exceptions)
			for await (const event of streamTransform(planResult.fullStream, triggerName, {
				yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
			})) {
				if (event.type === 'error') {
					throw (event as any).error ?? new Error('Stream error');
				}
				// Attach taskIndex to raw stream events so debug log can correlate by task
				yield taskIndex != null ? { ...event, taskIndex } as typeof event : event;
			}

			const planReasoning = (await planResult.reasoning).map((r) => r.text).join('\n');
			if (!isBlankString(planReasoning)) {
				planStepMessages.push({ role: 'assistant', content: planReasoning });
			}
			planText = await planResult.text;
			if (!isBlankString(planText)) {
				planStepMessages.push({ role: 'assistant', content: planText });
				// Emit plan reasoning to UI
				yield {
					type: 'agent-step-progress',
					stepLabel,
					detail: `📋 Plan: ${planText.slice(0, 150).replace(/\n/g, ' ')}`,
					taskIndex,
					triggerName,
				};
			}
			toolCalls = await planResult.toolCalls;
		} catch (streamErr) {
			const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
			yield {
				type: 'agent-step-progress',
				stepLabel,
				detail: `⚠️ Tool error (skipping): ${errMsg.slice(0, 120)}`,
				taskIndex,
				triggerName,
			};
			// Recover: try to get any partial tool calls that completed before the error
			try { toolCalls = await planResult.toolCalls; } catch { toolCalls = []; }
		}
		// Synthesize plan from tool calls when LLM skips text (e.g. toolChoice: 'required')
		if (isBlankString(planText) && toolCalls.length > 0) {
			const actions = toolCalls.map(tc => summarizeToolInput(tc.toolName, tc.input));
			const synthesizedPlan = `Will ${actions.join(', then ')}`;
			yield {
				type: 'agent-step-progress',
				stepLabel,
				detail: `📋 Plan: ${synthesizedPlan}`,
				taskIndex,
				triggerName,
			};
		}
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

		// Accumulate token usage (may fail if stream errored; ignore gracefully)
		const planUsage = await planResult.usage.catch(() => null);
		if (planUsage) {
			totalUsage = mergeTokenUsage(totalUsage, {
				inputTokens: planUsage.inputTokens,
				outputTokens: planUsage.outputTokens,
				totalTokens: planUsage.totalTokens,
			});
		}
		iterStopwatch.stop();
		const planDurationMs = iterStopwatch.getLastDuration();

		// --- Progress: tool execution ---
		if (toolCalls.length > 0) {
			// Emit detailed tool call info for UI
			for (const tc of toolCalls) {
				const inputSummary = summarizeToolInput(tc.toolName, tc.input);
				yield {
					type: 'agent-step-progress',
					stepLabel,
					detail: `🔧 ${tc.toolName}: ${inputSummary}`,
					taskIndex,
					triggerName,
				};
			}
		}

		// --- Tool execution ---
		iterStopwatch.start(`tool-exec-${iter}`);
		const { full: fullToolMessages, summary: summaryToolMessages, timings: iterToolTimings } =
			await executeToolCalls(config.tools, planStepMessages);
		iterStopwatch.stop();
		const toolExecDurationMs = iterStopwatch.getLastDuration();

		// Emit tool results summary for UI — pair each tool call with its result
		for (let tcIdx = 0; tcIdx < toolCalls.length; tcIdx++) {
			const tc = toolCalls[tcIdx];
			// Find the corresponding tool result
			let resultSummary: string | null = null;
			for (const msg of summaryToolMessages) {
				if (msg.role !== 'tool') continue;
				for (const part of (msg.content as any[])) {
					if (part.type === 'tool-result' && typeof part.result === 'string') {
						resultSummary = summarizeToolResult(tc.toolName, part.result);
						break;
					}
				}
				if (resultSummary !== null) break;
			}
			if (resultSummary) {
				yield {
					type: 'agent-step-progress',
					stepLabel,
					detail: `📄 ${resultSummary}`,
					taskIndex,
					triggerName,
				};
			}
		}

		// Track per-tool timings (real wall-clock time per tool from executeToolCalls)
		toolCallTimings.push(...iterToolTimings);

		// --- Submit step ---
		let submit: TSubmit | undefined;
		let submitDurationMs = 0;
		if (config.runSubmit) {
			iterStopwatch.start(`submit-${iter}`);
			submit = await config.runSubmit(state, iter, planStepMessages, fullToolMessages);
			iterStopwatch.stop();
			submitDurationMs = iterStopwatch.getLastDuration();
			// Emit discovery summary after submit
			if (submit != null && config.summarizeSubmit) {
				const submitSummary = config.summarizeSubmit(submit);
				if (submitSummary) {
					yield {
						type: 'agent-step-progress',
						stepLabel,
						detail: `📊 ${submitSummary}`,
						taskIndex,
						triggerName,
					};
				}
			}
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
		totalIterations: perIterationPhaseMs.length,
		totalToolCalls,
		stoppedReason,
		totalInputTokens: totalUsage.inputTokens ?? 0,
		totalOutputTokens: totalUsage.outputTokens ?? 0,
		totalDurationMs,
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

/**
 * Extract a human-readable summary of a tool result.
 * Parses common result shapes to show "Found N paths: a, b, c…" or a brief excerpt.
 */
function summarizeToolResult(toolName: string, result: string): string | null {
	if (!result) return null;
	// Try to detect markdown list of paths (lines starting with "- ")
	const pathLines = result.split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.trim().slice(2));
	if (pathLines.length > 0) {
		const shown = pathLines.slice(0, 3).map(p => p.split('/').pop()).join(', ');
		const more = pathLines.length > 3 ? ` +${pathLines.length - 3} more` : '';
		return `Found ${pathLines.length} path${pathLines.length !== 1 ? 's' : ''}: ${shown}${more}`;
	}
	// Generic: first 100 chars, strip newlines
	const preview = result.slice(0, 100).replace(/\n/g, ' ').trim();
	return preview || null;
}

/**
 * Extract a human-readable summary of a tool call input.
 * Tool input schemas are tightly coupled to tool definitions — this logic belongs near the agent loop.
 * Tool display NAMES (for UI labels) are centralized in RECON_TOOL_LABELS (core/constant.ts).
 */
function summarizeToolInput(toolName: string, input: any): string {
	if (!input || typeof input !== 'object') return '';
	// Extract common path/query fields regardless of tool
	const query = input.query ?? input.pattern ?? input.keyword ?? '';
	const path = input.path ?? input.note_path ?? input.start_note_path ?? input.startPath ?? input.from ?? '';
	const shortPath = typeof path === 'string' && path ? path.split('/').slice(-2).join('/') : '';

	switch (toolName) {
		case 'local_search_whole_vault':
			return `search "${String(query).slice(0, 50)}"`;
		case 'explore_folder':
			return `explore ${shortPath || '/'}`;
		case 'grep_file_tree':
			return `grep "${String(query).slice(0, 40)}" in ${shortPath || 'vault'}`;
		case 'graph_traversal':
			return shortPath ? `traverse from "${shortPath}"` : 'graph traversal (no path)';
		case 'hub_local_graph':
			return shortPath ? `hub graph for "${shortPath}"` : 'hub graph (no path)';
		case 'find_path':
			return `find path ${String(input.from ?? '').split('/').pop()} → ${String(input.to ?? '').split('/').pop()}`;
		case 'inspect_note_context':
			return shortPath ? `inspect "${shortPath}"` : 'inspect (no path — will fail)';
		default:
			return query ? `"${String(query).slice(0, 40)}"` : JSON.stringify(input).slice(0, 60);
	}
}
