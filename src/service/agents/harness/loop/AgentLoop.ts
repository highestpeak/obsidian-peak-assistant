/**
 * Self-hosted agent loop driving Vercel AI SDK `streamText` one step at a
 * time. See spec §3.4 (structure) and the 2026-07-20 chat-runtime plan §5.1
 * (streaming contract that this loop must satisfy so Chat can drop its
 * bespoke Vercel wrapper and share this runtime).
 *
 * The outer while handles: tier switching, per-step token/tool/abort budget,
 * trace emission, permission asks, and finalAnswer detection. Per-step model
 * invocation + tool execution is delegated to `streamText`; we consume its
 * `fullStream` and re-emit each chunk as both a TraceBus event and a unified
 * `onStreamEvent` fan-out so a single Chat subscription can reconstruct the
 * full UI timeline (token deltas, tool i/o, permission asks, step boundaries)
 * without stitching two channels together.
 *
 * Tools are wrapped so their results round-trip through the harness
 * ToolResult shape; the AI SDK sees a normal tool execute fn, so the model
 * gets the `{ ok, ...}` envelope as JSON.
 *
 * Backwards compatibility:
 *   - Non-streaming callers (VaultSearch, Copilot, subagents) do not need to
 *     change. They ignore the new stream events and read `finalText` /
 *     `steps` on the returned AgentLoopResult exactly as before.
 *   - `finishReason` string values are unchanged (`abort`, `error`, `stop`,
 *     …). A new coarse-grained `status` field is added for consumers that
 *     want lifecycle buckets without matching every enum.
 */

import { streamText, tool, type ModelMessage, type ToolSet, type LanguageModelUsage } from 'ai';
import type { ModelTier } from '../tier/types';
import type { ToolDef, ToolExecCtx, ToolResult } from '../tool/types';
import { TraceBus } from '../trace/events';
import type { StepResult, ToolCallTrace, ToolResultTrace } from '../trace/events';
import { checkSkillQuarantine } from '@/service/skills/quarantine';
import { DEFAULT_BUDGET, deriveAgentLoopStatus } from './types';
import type {
    AgentLoopBudget,
    AgentLoopConfig,
    AgentLoopFinishReason,
    AgentLoopResult,
    AgentLoopStreamEvent,
    PermissionAskRequest,
    PermissionAskResolution,
} from './types';
import { evaluateStopConditions, hasFinalAnswer } from './stopConditions';
import { SubAgentDispatcher } from '../subagent/SubAgentDispatcher';
import { PermissionGuard } from '../permission/PermissionGuard';
import { buildSubagentTool } from '../subagent/subagentTool';
import type { MemoryBlock } from '../memory/types';
import { renderMemoryBlocks } from '../memory/MemoryBlock';

const ESCALATE_TOOL_NAME = 'escalate';

/**
 * Safety cap for `treatBareTextAsFinal === false`: after this many consecutive
 * text-only steps with no progress toward `stopWhen`, give up and finalize
 * rather than re-prompting a model that refuses to call its tools.
 */
const MAX_BARE_TEXT_CONTINUATIONS = 3;

interface CapturedToolEvent {
    call: ToolCallTrace;
    result: ToolResultTrace;
}

interface StepStreamCapture {
    text: string;
    reasoning: string;
    finishReason: string;
    usage: LanguageModelUsage | undefined;
    responseMessages: ModelMessage[];
    toolCalls: Array<{ toolName: string; toolCallId: string; input: unknown }>;
    toolResults: Array<{ toolName: string; toolCallId: string; output: unknown }>;
    errored: boolean;
    errorMessage?: string;
}

export async function runAgentLoop(cfg: AgentLoopConfig): Promise<AgentLoopResult> {
    const budget: AgentLoopBudget = { ...DEFAULT_BUDGET, ...cfg.budget };
    const trace = cfg.trace ?? new TraceBus();
    const startedAt = Date.now();
    const permissionGuard = cfg.permission ?? new PermissionGuard();

    // Fan-out helper: TraceBus event + unified stream event, in one call.
    // Chat subscribes to `onStreamEvent` alone; debug adapters keep using
    // TraceBus. Both channels see events in identical order.
    const fanOut = (event: AgentLoopStreamEvent) => {
        try {
            cfg.onStreamEvent?.(event);
        } catch (err) {
            console.error('[AgentLoop] onStreamEvent handler error:', err);
        }
    };

    trace.emit('loop_start', { loopId: cfg.loopId, startedAt });
    fanOut({ type: 'loop_start', loopId: cfg.loopId, startedAt });
    trace.emit('run_status', { loopId: cfg.loopId, state: 'running' });
    fanOut({ type: 'run_status', loopId: cfg.loopId, state: 'running' });

    // Fire session_start hook before any model work. A block here aborts the
    // entire loop — the harness layer is the guarantee point, not the model.
    if (cfg.hooks) {
        const sessionStart = await cfg.hooks.fire('session_start', {
            loopId: cfg.loopId,
            timestamp: startedAt,
        });
        if (sessionStart.kind === 'block') {
            const finishReason: AgentLoopFinishReason = 'hook_block';
            trace.emit('loop_finish', {
                loopId: cfg.loopId,
                finishReason,
                durationMs: Date.now() - startedAt,
            });
            trace.emit('run_status', { loopId: cfg.loopId, state: 'failed', reason: 'hook_block' });
            fanOut({
                type: 'run_status',
                loopId: cfg.loopId,
                state: 'failed',
                reason: 'hook_block',
            });
            fanOut({
                type: 'loop_finish',
                loopId: cfg.loopId,
                finishReason,
                status: deriveAgentLoopStatus(finishReason),
                durationMs: Date.now() - startedAt,
            });
            return {
                loopId: cfg.loopId,
                finalText: '',
                steps: [],
                finishReason,
                status: deriveAgentLoopStatus(finishReason),
                tierUsage: { fast: 0, research: 0, stronger: 0 },
                totalTokens: 0,
                totalToolCalls: 0,
                durationMs: Date.now() - startedAt,
                error: `session_start blocked: ${sessionStart.reason}`,
            };
        }
    }

    const tierUsage: Record<ModelTier, number> = {
        fast: 0,
        research: 0,
        stronger: 0,
    };

    // Auto-inject subagent tools. The parent loop never sees subagent
    // internals — only the tool surface. We construct one dispatcher per loop
    // run so subagent loopIds nest under the parent.
    const effectiveTools: ToolDef[] = [...cfg.tools];
    if (cfg.subagents && cfg.subagents.length > 0) {
        const dispatcher = new SubAgentDispatcher({
            parentLoopId: cfg.loopId,
            tierController: cfg.tierController,
            trace,
            hooks: cfg.hooks,
        });
        for (const def of cfg.subagents) {
            effectiveTools.push(buildSubagentTool(def, dispatcher) as ToolDef);
        }
    }

    const baseSystemPrompt = buildSystemPrompt(cfg);
    let messages: ModelMessage[] = [...cfg.initialMessages];

    const steps: StepResult[] = [];
    let totalTokens = 0;
    let totalToolCalls = 0;
    let finishReason: AgentLoopFinishReason = 'max_steps';
    let errorMessage: string | undefined;

    // When `treatBareTextAsFinal === false`, a text-only step is an
    // intermediate planning turn rather than a final answer (see config docs).
    // We continue the loop instead, but cap consecutive bare-text steps so a
    // model that never calls a tool can't burn the whole step budget on prose.
    const treatBareTextAsFinal = cfg.treatBareTextAsFinal ?? true;
    let consecutiveBareText = 0;

    while (true) {
        const stop = evaluateStopConditions(
            { steps, totalTokens, totalToolCalls, aborted: !!cfg.abortSignal?.aborted },
            budget,
        );
        if (stop) {
            finishReason = stop;
            break;
        }

        const tier = cfg.tierController.current();
        const stepIndex = steps.length;
        trace.emit('step_start', {
            loopId: cfg.loopId,
            stepIndex,
            tier: tier.tier,
            modelId: tier.modelId,
        });
        fanOut({
            type: 'step_start',
            loopId: cfg.loopId,
            stepIndex,
            tier: tier.tier,
            modelId: tier.modelId,
        });

        const captured: CapturedToolEvent[] = [];
        const allowedTools = effectiveTools.filter(
            (t) => !t.allowedTiers || t.allowedTiers.includes(tier.tier),
        );
        const toolSet: ToolSet = {};
        for (const t of allowedTools) {
			toolSet[t.name] = wrapTool(t, cfg, permissionGuard, tier.tier, stepIndex, trace, captured, fanOut);
        }
        toolSet[ESCALATE_TOOL_NAME] = cfg.tierController.escalateTool();

        // Compact (if configured) BEFORE the model call so the request fits
        // the tier's context window. Memory blocks are sourced fresh each
        // step in case prior steps mutated the store.
        const activeBlocks: MemoryBlock[] = cfg.memory ? cfg.memory.activeBlocks() : [];
        let keptBlocks: MemoryBlock[] = activeBlocks;
        if (cfg.context) {
            const before = cfg.context.estimateTokens(messages, activeBlocks);
            const compaction = await cfg.context.compactIfNeeded(messages, activeBlocks);
            if (compaction.compacted) {
                messages = compaction.messages;
                trace.emit('context_compacted', {
                    loopId: cfg.loopId,
                    stepIndex,
                    tokensBefore: before,
                    tokensAfter: compaction.estimatedTokens,
                    droppedBlocks: compaction.droppedBlocks.length,
                    droppedMessages: compaction.droppedMessageCount,
                    compactSummaries: compaction.compactSummaries,
                });
            }
            keptBlocks = compaction.keptBlocks;
        }
        const systemPrompt = composeSystemPrompt(baseSystemPrompt, keptBlocks);

        const stepStart = Date.now();
        const capture: StepStreamCapture = {
            text: '',
            reasoning: '',
            finishReason: 'unknown',
            usage: undefined,
            responseMessages: [],
            toolCalls: [],
            toolResults: [],
            errored: false,
        };

        try {
            const streamed = streamText({
                model: tier.resolve(),
                system: systemPrompt || undefined,
                messages,
                tools: toolSet,
                // stepCountIs(1) is enforced by the outer while loop; we only
                // ask streamText for a single provider round-trip per iteration
                // so tier switching / budget accounting happen at this layer.
                stopWhen: () => true,
                abortSignal: cfg.abortSignal,
                // A3: forward optional generation knobs (temperature, topP,
                // topK, maxOutputTokens, penalties) so callers like Chat
                // preserve their pre-migration provider behaviour.
                temperature: cfg.modelSettings?.temperature,
                topP: cfg.modelSettings?.topP,
                topK: cfg.modelSettings?.topK,
                maxOutputTokens: cfg.modelSettings?.maxOutputTokens,
                frequencyPenalty: cfg.modelSettings?.frequencyPenalty,
                presencePenalty: cfg.modelSettings?.presencePenalty,
            });

            // Consume the unified fullStream. Errors surface both as `error`
            // chunks *and* as thrown exceptions from the async iterator; we
            // handle both. Ordering follows the SDK: text-delta ↔ tool-input-*
            // ↔ tool-call ↔ tool-result ↔ finish-step ↔ finish.
            for await (const chunk of streamed.fullStream) {
                switch (chunk.type) {
                    case 'text-delta': {
                        capture.text += chunk.text;
                        trace.emit('text_delta', {
                            loopId: cfg.loopId,
                            stepIndex,
                            delta: chunk.text,
                        });
                        fanOut({
                            type: 'text_delta',
                            loopId: cfg.loopId,
                            stepIndex,
                            delta: chunk.text,
                        });
                        break;
                    }
                    case 'reasoning-delta': {
                        capture.reasoning += chunk.text;
                        trace.emit('reasoning_delta', {
                            loopId: cfg.loopId,
                            stepIndex,
                            delta: chunk.text,
                        });
                        fanOut({
                            type: 'reasoning_delta',
                            loopId: cfg.loopId,
                            stepIndex,
                            delta: chunk.text,
                        });
                        break;
                    }
                    case 'tool-input-start': {
                        trace.emit('tool_input_start', {
                            loopId: cfg.loopId,
                            stepIndex,
                            toolName: chunk.toolName,
                            toolCallId: chunk.id,
                        });
                        fanOut({
                            type: 'tool_input_start',
                            loopId: cfg.loopId,
                            stepIndex,
                            toolName: chunk.toolName,
                            toolCallId: chunk.id,
                        });
                        break;
                    }
                    case 'tool-input-delta': {
                        trace.emit('tool_input_delta', {
                            loopId: cfg.loopId,
                            stepIndex,
                            toolCallId: chunk.id,
                            delta: chunk.delta,
                        });
                        fanOut({
                            type: 'tool_input_delta',
                            loopId: cfg.loopId,
                            stepIndex,
                            toolCallId: chunk.id,
                            delta: chunk.delta,
                        });
                        break;
                    }
                    case 'tool-call': {
                        // Note: TraceBus `tool_call` is also fired inside
                        // `wrapTool.execute` for the pre-execution ordering,
                        // to match the previous behaviour. Here we only stash
                        // for later step aggregation.
                        capture.toolCalls.push({
                            toolName: (chunk as any).toolName,
                            toolCallId: (chunk as any).toolCallId,
                            input: (chunk as any).input,
                        });
                        break;
                    }
                    case 'tool-result': {
                        capture.toolResults.push({
                            toolName: (chunk as any).toolName,
                            toolCallId: (chunk as any).toolCallId,
                            output: (chunk as any).output,
                        });
                        break;
                    }
                    case 'finish-step': {
                        capture.finishReason = String(chunk.finishReason ?? capture.finishReason);
                        capture.usage = chunk.usage ?? capture.usage;
                        break;
                    }
                    case 'error': {
                        capture.errored = true;
                        capture.errorMessage =
                            chunk.error instanceof Error
                                ? chunk.error.message
                                : String(chunk.error);
                        break;
                    }
                    case 'abort': {
                        capture.errored = true;
                        capture.errorMessage = (chunk as any).reason ?? 'aborted';
                        break;
                    }
                    default:
                        // Unhandled chunk types (start, start-step, finish,
                        // text-start, text-end, source, file, raw, …) are
                        // deliberately ignored — they don't map to a harness
                        // event and don't affect step semantics.
                        break;
                }
            }

            // Wait for the full response promise so we get final assembled
            // messages / usage. This resolves once the stream terminates.
            try {
                const responseMessages = await streamed.response;
                capture.responseMessages = (responseMessages?.messages ?? []) as ModelMessage[];
            } catch (err) {
                // response promise rejects on stream error — already captured
                // above via error chunk.
                if (!capture.errored) {
                    capture.errored = true;
                    capture.errorMessage = err instanceof Error ? err.message : String(err);
                }
            }
            try {
                const finalUsage = await streamed.usage;
                if (finalUsage) capture.usage = finalUsage;
            } catch {
                // usage may reject if the stream errored; ignore.
            }
            try {
                const finalReason = await streamed.finishReason;
                if (finalReason) capture.finishReason = String(finalReason);
            } catch {
                // ignore
            }
        } catch (err) {
            // streamText may throw during setup (before fullStream), or the
            // iterator itself may throw on transport failure that isn't
            // surfaced as an `error` chunk.
            capture.errored = true;
            capture.errorMessage =
                capture.errorMessage ?? (err instanceof Error ? err.message : String(err));
        }

        // Provider-level error → break the loop with `error` / `abort`. This
        // preserves the pre-migration finishReason values so existing callers
        // (subagent, VaultSearch) don't observe a semantic change.
        if (capture.errored) {
            const aborted = !!cfg.abortSignal?.aborted;
            errorMessage = capture.errorMessage ?? (aborted ? 'aborted' : 'stream error');
            finishReason = aborted ? 'abort' : 'error';
            trace.emit('run_status', {
                loopId: cfg.loopId,
                state: aborted ? 'cancelled' : 'failed',
                reason: errorMessage,
            });
            fanOut({
                type: 'error',
                loopId: cfg.loopId,
                stepIndex,
                error: errorMessage,
            });
            break;
        }

        const stepDuration = Date.now() - stepStart;
        tierUsage[tier.tier] += 1;

        // Splice in any new assistant/tool messages produced this step.
        for (const m of capture.responseMessages) {
            messages.push(m);
        }

        const callTraces: ToolCallTrace[] = capture.toolCalls.map((tc) => ({
            toolName: String(tc.toolName),
            toolCallId: String(tc.toolCallId),
            args: tc.input,
        }));
        const resultTraces: ToolResultTrace[] = captured.map((c) => c.result);
        // Fallback: if the SDK reported a tool result that our wrapper never
        // saw (e.g. wrapper bypassed by retry), still record it so downstream
        // trace consumers observe the pairing.
        if (resultTraces.length === 0 && capture.toolResults.length > 0) {
            for (const tr of capture.toolResults) {
                resultTraces.push({
                    toolName: String(tr.toolName),
                    toolCallId: String(tr.toolCallId),
                    ok: true,
                    payload: tr.output,
                    durationMs: 0,
                });
            }
        }

        const usage = capture.usage ?? ({} as LanguageModelUsage);
        const promptTokens = usage.inputTokens ?? 0;
        const completionTokens = usage.outputTokens ?? 0;
        const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0;
        const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
        const stepTotal = usage.totalTokens ?? promptTokens + completionTokens;

        const step: StepResult = {
            loopId: cfg.loopId,
            stepIndex,
            tier: tier.tier,
            modelId: tier.modelId,
            providerId: tier.providerId,
            promptTokens,
            completionTokens,
            reasoningTokens,
            cachedInputTokens,
            totalTokens: stepTotal,
            toolCalls: callTraces,
            toolResults: resultTraces,
            text: capture.text,
            finishReason: capture.finishReason,
            durationMs: stepDuration,
        };

        const escalateInvoked = callTraces.some((c) => c.toolName === ESCALATE_TOOL_NAME);
        const forcedScore = escalateInvoked ? 0 : undefined;
        const score = cfg.tierController.onStepFinish(step, { forcedScore });
        step.selfScore = score;

        totalTokens += stepTotal;
        totalToolCalls += callTraces.filter((c) => c.toolName !== ESCALATE_TOOL_NAME).length;
        steps.push(step);

        trace.emit('step_finish', step);
        fanOut({
            type: 'step_finish',
            loopId: cfg.loopId,
            stepIndex,
            finishReason: step.finishReason,
            text: step.text,
            promptTokens: step.promptTokens,
            completionTokens: step.completionTokens,
            totalTokens: step.totalTokens,
        });

        try {
            await cfg.onStepFinish?.(step);
        } catch (err) {
            console.error('[AgentLoop] onStepFinish handler error:', err);
        }

        if (cfg.stopWhen) {
            try {
                if (await cfg.stopWhen(step)) {
                    finishReason = 'stop';
                    break;
                }
            } catch (err) {
                errorMessage = err instanceof Error ? err.message : String(err);
                finishReason = 'error';
                break;
            }
        }

        // A step that called tools resets the bare-text streak.
        if (callTraces.length > 0) consecutiveBareText = 0;

        if (hasFinalAnswer(step)) {
            // Chat-style callers (no domain stop condition): text == done.
            // Terminal-tool callers (`treatBareTextAsFinal: false`) instead keep
            // going — this bare-text step is the model's planning turn before it
            // calls its first tool, not a finished answer. Cap the streak so a
            // model that never calls a tool still terminates.
            if (treatBareTextAsFinal || consecutiveBareText >= MAX_BARE_TEXT_CONTINUATIONS) {
                finishReason = 'stop';
                break;
            }
            consecutiveBareText += 1;
            if (cfg.bareTextContinuationNudge) {
                messages.push({ role: 'user', content: cfg.bareTextContinuationNudge });
            }
        }
    }

    // Fire stop hook before emitting loop_finish. Block here is informational
    // only — the loop has already exited and there's no further work to halt.
    if (cfg.hooks) {
        try {
            await cfg.hooks.fire('stop', { loopId: cfg.loopId, timestamp: Date.now() });
        } catch (err) {
            console.error('[AgentLoop] stop hook error:', err);
        }
    }

    const last = steps[steps.length - 1];
    const finalText = last?.text ?? '';
    const durationMs = Date.now() - startedAt;
    const status = deriveAgentLoopStatus(finishReason);
    trace.emit('loop_finish', { loopId: cfg.loopId, finishReason, durationMs });
    trace.emit('run_status', { loopId: cfg.loopId, state: status, reason: errorMessage });
    fanOut({
        type: 'run_status',
        loopId: cfg.loopId,
        state: status,
        reason: errorMessage,
    });
    fanOut({
        type: 'loop_finish',
        loopId: cfg.loopId,
        finishReason,
        status,
        durationMs,
    });

    return {
        loopId: cfg.loopId,
        finalText,
        steps,
        finishReason,
        status,
        tierUsage,
        totalTokens,
        totalToolCalls,
        durationMs,
        error: errorMessage,
    };
}

function buildSystemPrompt(cfg: AgentLoopConfig): string {
    const parts: string[] = [cfg.systemPrompt.trim()];
    if (cfg.skills && cfg.skills.length > 0) {
        const summary = cfg.skills
            .filter((s) => s.invocation === 'model-first')
            .map((s) => `- ${s.id}: ${s.description}`)
            .join('\n');
        if (summary) {
            parts.push('Available skills (invoke by name when relevant):\n' + summary);
        }
    }
    return parts.join('\n\n');
}

/**
 * Append rendered memory blocks (priority desc) to the base system prompt.
 * Called each step so block content reflects the latest store snapshot.
 */
function composeSystemPrompt(base: string, blocks: ReadonlyArray<MemoryBlock>): string {
    if (blocks.length === 0) return base;
    const rendered = renderMemoryBlocks(blocks);
    if (!rendered) return base;
    return base ? `${base}\n\n${rendered}` : rendered;
}

let permissionAskCounter = 0;
function nextPermissionRequestId(loopId: string): string {
    permissionAskCounter += 1;
    return `${loopId}:ask-${permissionAskCounter}`;
}

function wrapTool(
    def: ToolDef,
    cfg: AgentLoopConfig,
    permissionGuard: PermissionGuard,
    tier: ModelTier,
    stepIndex: number,
    trace: TraceBus,
    captured: CapturedToolEvent[],
    fanOut: (event: AgentLoopStreamEvent) => void,
) {
    return tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (args: any, info: { toolCallId: string; abortSignal?: AbortSignal }) => {
            const callTrace: ToolCallTrace = {
                toolName: def.name,
                toolCallId: info.toolCallId,
                args,
            };
            trace.emit('tool_call', { loopId: cfg.loopId, stepIndex, ...callTrace });
            fanOut({
                type: 'tool_call',
                loopId: cfg.loopId,
                stepIndex,
                toolName: def.name,
                toolCallId: info.toolCallId,
                args,
            });
            const start = Date.now();

            const finalize = (result: ToolResult): ToolResult => {
                const resultTrace: ToolResultTrace = {
                    toolName: def.name,
                    toolCallId: info.toolCallId,
                    ok: result.ok,
                    payload: result.ok ? result.data : result.error,
                    durationMs: Date.now() - start,
                };
                captured.push({ call: callTrace, result: resultTrace });
                trace.emit('tool_result', { loopId: cfg.loopId, stepIndex, ...resultTrace });
                fanOut({
                    type: 'tool_result',
                    loopId: cfg.loopId,
                    stepIndex,
                    toolName: def.name,
                    toolCallId: info.toolCallId,
                    ok: result.ok,
                    payload: resultTrace.payload,
                    durationMs: resultTrace.durationMs,
                });
                return result;
            };

            // (1) Permission check FIRST — deny-first invariant. Even if a
            // pre_tool_use hook would allow, an explicit deny rule wins.
			{
				const decision = permissionGuard.check(
                    { name: def.name, kind: def.kind },
                    args,
                );
                if (decision.decision === 'deny') {
                    trace.emit('permission_check', {
                        loopId: cfg.loopId,
                        stepIndex,
                        toolName: def.name,
                        source: 'permission',
                        decision: 'deny',
                        ...(decision.reason ? { reason: decision.reason } : {}),
                    });
                    return finalize({
                        ok: false,
                        error: `permission denied: ${decision.reason}`,
                        recoverable: false,
                    });
				}

                if (decision.decision === 'ask') {
                    // Resolve out-of-band. Trace + fan-out the request so UI
                    // can render an approval prompt; resolve to allow/deny.
                    const requestId = nextPermissionRequestId(cfg.loopId);
                    const resolution = await runPermissionAsk({
                        cfg,
                        def,
                        stepIndex,
                        requestId,
                        args,
                        trace,
                        fanOut,
                        reason: decision.reason,
                    });
                    if (resolution.decision === 'deny') {
                        return finalize({
                            ok: false,
                            error: `permission denied: ${resolution.reason ?? 'user declined'}`,
                            recoverable: false,
                        });
                    }
                    // allow → fall through to hook + execute path
                } else {
                    trace.emit('permission_check', {
                        loopId: cfg.loopId,
                        stepIndex,
                        toolName: def.name,
                        source: 'permission',
                        decision: 'allow',
                    });
                }
            }

            // (1b) Skill quarantine check — strict compiled skills only
            // allow tools listed in `allowedTools`. Runs alongside the
            // PermissionGuard because they enforce different policies:
            // permission = deny lists from user config; quarantine = the
            // skill's own capability boundary. Either can veto.
            if (cfg.compiledSkill) {
                const verdict = checkSkillQuarantine(cfg.compiledSkill, def.name);
                trace.emit('permission_check', {
                    loopId: cfg.loopId,
                    stepIndex,
                    toolName: def.name,
                    source: 'quarantine',
                    decision: verdict === 'allow' ? 'allow' : 'deny',
                    ...(verdict !== 'allow' && verdict.reason ? { reason: verdict.reason } : {}),
                });
                if (verdict !== 'allow') {
                    return finalize({
                        ok: false,
                        error: `skill-quarantine: ${verdict.reason}`,
                        recoverable: false,
                    });
                }
            }

            // (2) PreToolUse hook — block / continue. Hooks run in harness,
            // not via model, so guarantees hold even for adversarial outputs.
            if (cfg.hooks) {
                const pre = await cfg.hooks.fire(
                    'pre_tool_use',
                    {
                        loopId: cfg.loopId,
                        stepIndex,
                        tier,
                        toolName: def.name,
                        toolCallId: info.toolCallId,
                        args,
                    },
                    def.name,
                );
                if (pre.kind === 'block') {
                    return finalize({
                        ok: false,
                        error: `blocked by pre_tool_use hook: ${pre.reason}`,
                        recoverable: false,
                    });
                }
                // PreToolUse modify is intentionally NOT supported in M2 — we'd
                // need typed arg patching; revisit in M3 if a real use case
                // emerges.
            }

            // (3) Execute the tool.
            const ctx: ToolExecCtx = {
                loopId: cfg.loopId,
                stepIndex,
                tier,
                signal: info.abortSignal ?? cfg.abortSignal ?? new AbortController().signal,
            };
            let result: ToolResult;
            try {
                result = await def.execute(args, ctx);
            } catch (err) {
                result = {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                    recoverable: false,
                };
            }

            // (4) PostToolUse hook — may modify the result before it reaches
            // the model (e.g. redact secrets) or block to surface an error.
            if (cfg.hooks) {
                const post = await cfg.hooks.fire(
                    'post_tool_use',
                    {
                        loopId: cfg.loopId,
                        stepIndex,
                        tier,
                        toolName: def.name,
                        toolCallId: info.toolCallId,
                        args,
                        result,
                    },
                    def.name,
                );
                if (post.kind === 'block') {
                    result = {
                        ok: false,
                        error: `blocked by post_tool_use hook: ${post.reason}`,
                        recoverable: false,
                    };
                } else if (post.kind === 'modify') {
                    result = post.result;
                }
            }

            return finalize(result);
        },
    });
}

/**
 * Suspend the tool call until an external resolver answers, or the loop is
 * aborted. Emits `permission_request` (via TraceBus + fanOut) before waiting
 * and `permission_resolved` on completion. Missing resolver → deny; abort →
 * deny with reason=`cancelled`; resolver throw → deny with error message.
 * Callers see this as a synchronous decision — the AgentLoop treats the
 * suspension window as `waiting-permission` for observability.
 */
async function runPermissionAsk(input: {
    cfg: AgentLoopConfig;
    def: ToolDef;
    stepIndex: number;
    requestId: string;
    args: unknown;
    trace: TraceBus;
    fanOut: (event: AgentLoopStreamEvent) => void;
    reason?: string;
}): Promise<PermissionAskResolution> {
    const { cfg, def, stepIndex, requestId, args, trace, fanOut, reason } = input;

    // trace + fan-out the request. Emit `decision: 'ask'` — NOT a fake
    // `'allow'`. The eventual allow/deny is reported by the `permission_resolved`
    // event below; upstream trace consumers must not observe a spurious approval
    // during the suspension window.
    trace.emit('permission_check', {
        loopId: cfg.loopId,
        stepIndex,
        toolName: def.name,
        source: 'permission',
        decision: 'ask',
        reason: reason ?? 'ask',
    });
    trace.emit('permission_request', {
        loopId: cfg.loopId,
        stepIndex,
        requestId,
        toolName: def.name,
        argsSummary: args,
    });
    fanOut({
        type: 'permission_request',
        loopId: cfg.loopId,
        stepIndex,
        requestId,
        toolName: def.name,
        argsSummary: args,
    });
    trace.emit('run_status', {
        loopId: cfg.loopId,
        state: 'waiting-permission',
        reason: def.name,
    });
    fanOut({
        type: 'run_status',
        loopId: cfg.loopId,
        state: 'waiting-permission',
        reason: def.name,
    });

    const emitResolved = (resolution: PermissionAskResolution) => {
        trace.emit('permission_resolved', {
            loopId: cfg.loopId,
            stepIndex,
            requestId,
            decision: resolution.decision === 'allow-for-run' ? 'allow' : resolution.decision,
            reason: resolution.reason,
        });
        fanOut({
            type: 'permission_resolved',
            loopId: cfg.loopId,
            stepIndex,
            requestId,
            decision: resolution.decision === 'allow-for-run' ? 'allow' : resolution.decision,
            reason: resolution.reason,
        });
        // Return to running state after each ask, so downstream observers
        // never see two `waiting-permission` events without a `running` in
        // between.
        trace.emit('run_status', { loopId: cfg.loopId, state: 'running' });
        fanOut({ type: 'run_status', loopId: cfg.loopId, state: 'running' });
    };

    // No resolver → deny by default. Silent auto-allow would violate the
    // "no surprise" invariant PermissionGuard exists to enforce.
    if (!cfg.resolvePermissionAsk) {
        const resolution: PermissionAskResolution = {
            decision: 'deny',
            reason: 'no permission resolver registered',
        };
        emitResolved(resolution);
        return resolution;
    }

    const askAbortController = new AbortController();
    const external = cfg.abortSignal;
    const forwardAbort = () => askAbortController.abort();
    if (external) {
        if (external.aborted) {
            askAbortController.abort();
        } else {
            external.addEventListener('abort', forwardAbort, { once: true });
        }
    }

    const request: PermissionAskRequest = {
        loopId: cfg.loopId,
        stepIndex,
        requestId,
        toolName: def.name,
        toolKind: def.kind,
        args,
        signal: askAbortController.signal,
    };

    let resolution: PermissionAskResolution;
    try {
        // Race the resolver against the loop's abort signal so a cancelled
        // loop doesn't leak a pending Promise.
        resolution = await new Promise<PermissionAskResolution>((resolve, reject) => {
            let settled = false;
            const onAbort = () => {
                if (settled) return;
                settled = true;
                resolve({ decision: 'deny', reason: 'cancelled' });
            };
            if (askAbortController.signal.aborted) {
                onAbort();
                return;
            }
            askAbortController.signal.addEventListener('abort', onAbort, { once: true });

            (async () => {
                try {
                    const answer = await cfg.resolvePermissionAsk!(request);
                    if (settled) return;
                    settled = true;
                    // MSG-07 permission triage — `allow-for-run` is a UI-level
                    // decision. From the loop's perspective it is `allow`; the
                    // resolver caches the tool name so subsequent asks in the
                    // same run short-circuit without re-prompting. Anything
                    // else deny-defaults to keep the "no surprise" invariant.
                    const isRecognisedAllow =
                        answer && (answer.decision === 'allow' || answer.decision === 'allow-for-run');
                    const isDeny = answer && answer.decision === 'deny';
                    resolve(
                        isRecognisedAllow || isDeny
                            ? answer
                            : { decision: 'deny', reason: 'invalid ask resolution' },
                    );
                } catch (err) {
                    if (settled) return;
                    settled = true;
                    resolve({
                        decision: 'deny',
                        reason: err instanceof Error ? err.message : String(err),
                    });
                }
            })();
        });
    } finally {
        if (external) external.removeEventListener('abort', forwardAbort);
    }

    emitResolved(resolution);
    return resolution;
}
