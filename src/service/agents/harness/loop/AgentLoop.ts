/**
 * Self-hosted agent loop driving Vercel AI SDK generateText one step at a
 * time. See spec §3.4.
 *
 * The outer while handles: tier switching, per-step token/tool/abort budget,
 * trace emission, and finalAnswer detection. Per-step model invocation +
 * tool execution is delegated to generateText with stopWhen=stepCountIs(1).
 *
 * Tools are wrapped so their results round-trip through harness ToolResult
 * shape; the AI SDK sees a normal tool execute fn, so the model gets the
 * `{ ok, ...}` envelope as JSON.
 */

import { generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from 'ai';
import type { ModelTier } from '../tier/types';
import type { ToolDef, ToolExecCtx, ToolResult } from '../tool/types';
import { TraceBus } from '../trace/events';
import type { StepResult, ToolCallTrace, ToolResultTrace } from '../trace/events';
import { DEFAULT_BUDGET } from './types';
import type {
    AgentLoopBudget,
    AgentLoopConfig,
    AgentLoopFinishReason,
    AgentLoopResult,
} from './types';
import { evaluateStopConditions, hasFinalAnswer } from './stopConditions';
import { SubAgentDispatcher } from '../subagent/SubAgentDispatcher';
import { buildSubagentTool } from '../subagent/subagentTool';
import type { MemoryBlock } from '../memory/types';
import { renderMemoryBlocks } from '../memory/MemoryBlock';

const ESCALATE_TOOL_NAME = 'escalate';

interface CapturedToolEvent {
    call: ToolCallTrace;
    result: ToolResultTrace;
}

export async function runAgentLoop(cfg: AgentLoopConfig): Promise<AgentLoopResult> {
    const budget: AgentLoopBudget = { ...DEFAULT_BUDGET, ...cfg.budget };
    const trace = cfg.trace ?? new TraceBus();
    const startedAt = Date.now();
    trace.emit('loop_start', { loopId: cfg.loopId, startedAt });

    // Fire session_start hook before any model work. A block here aborts the
    // entire loop — the harness layer is the guarantee point, not the model.
    if (cfg.hooks) {
        const sessionStart = await cfg.hooks.fire('session_start', {
            loopId: cfg.loopId,
            timestamp: startedAt,
        });
        if (sessionStart.kind === 'block') {
            trace.emit('loop_finish', {
                loopId: cfg.loopId,
                finishReason: 'hook_block',
                durationMs: Date.now() - startedAt,
            });
            return {
                loopId: cfg.loopId,
                finalText: '',
                steps: [],
                finishReason: 'hook_block',
                tierUsage: { 'local-fast': 0, 'local-deep': 0, online: 0 },
                totalTokens: 0,
                totalToolCalls: 0,
                durationMs: Date.now() - startedAt,
                error: `session_start blocked: ${sessionStart.reason}`,
            };
        }
    }

    const tierUsage: Record<ModelTier, number> = {
        'local-fast': 0,
        'local-deep': 0,
        online: 0,
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

        const captured: CapturedToolEvent[] = [];
        const allowedTools = effectiveTools.filter(
            (t) => !t.allowedTiers || t.allowedTiers.includes(tier.tier),
        );
        const toolSet: ToolSet = {};
        for (const t of allowedTools) {
            toolSet[t.name] = wrapTool(t, cfg, tier.tier, stepIndex, trace, captured);
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
                });
            }
            keptBlocks = compaction.keptBlocks;
        }
        const systemPrompt = composeSystemPrompt(baseSystemPrompt, keptBlocks);

        const stepStart = Date.now();
        let result: Awaited<ReturnType<typeof generateText>>;
        try {
            result = await generateText({
                model: tier.resolve(),
                system: systemPrompt || undefined,
                messages,
                tools: toolSet,
                stopWhen: stepCountIs(1),
                abortSignal: cfg.abortSignal,
            });
        } catch (err) {
            errorMessage = err instanceof Error ? err.message : String(err);
            finishReason = cfg.abortSignal?.aborted ? 'abort' : 'error';
            break;
        }

        const stepDuration = Date.now() - stepStart;
        tierUsage[tier.tier] += 1;

        // Splice in any new assistant/tool messages produced this step.
        const newMessages = result.response?.messages ?? [];
        for (const m of newMessages) {
            messages.push(m as ModelMessage);
        }

        const callTraces: ToolCallTrace[] = (result.toolCalls ?? []).map((tc: any) => ({
            toolName: String(tc.toolName),
            toolCallId: String(tc.toolCallId),
            args: tc.input,
        }));
        const resultTraces: ToolResultTrace[] = captured.map((c) => c.result);
        // Fallback: if a tool result came back through generateText that we
        // didn't capture (e.g. SDK retry replaced our wrapper), still record it.
        if (resultTraces.length === 0 && Array.isArray(result.toolResults)) {
            for (const tr of result.toolResults as any[]) {
                resultTraces.push({
                    toolName: String(tr.toolName),
                    toolCallId: String(tr.toolCallId),
                    ok: true,
                    payload: tr.output,
                    durationMs: 0,
                });
            }
        }

        const usage = result.usage ?? ({} as any);
        const promptTokens = usage.inputTokens ?? 0;
        const completionTokens = usage.outputTokens ?? 0;
        const stepTotal = usage.totalTokens ?? promptTokens + completionTokens;

        const step: StepResult = {
            loopId: cfg.loopId,
            stepIndex,
            tier: tier.tier,
            modelId: tier.modelId,
            providerId: tier.providerId,
            promptTokens,
            completionTokens,
            totalTokens: stepTotal,
            toolCalls: callTraces,
            toolResults: resultTraces,
            text: result.text ?? '',
            finishReason: String(result.finishReason ?? 'unknown'),
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

        try {
            await cfg.onStepFinish?.(step);
        } catch (err) {
            console.error('[AgentLoop] onStepFinish handler error:', err);
        }

        if (hasFinalAnswer(step)) {
            finishReason = 'stop';
            break;
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
    trace.emit('loop_finish', { loopId: cfg.loopId, finishReason, durationMs });

    return {
        loopId: cfg.loopId,
        finalText,
        steps,
        finishReason,
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

function wrapTool(
    def: ToolDef,
    cfg: AgentLoopConfig,
    tier: ModelTier,
    stepIndex: number,
    trace: TraceBus,
    captured: CapturedToolEvent[],
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
                return result;
            };

            // (1) Permission check FIRST — deny-first invariant. Even if a
            // pre_tool_use hook would allow, an explicit deny rule wins.
            if (cfg.permission) {
                const decision = cfg.permission.check(
                    { name: def.name, kind: def.kind },
                    args,
                );
                if (decision.decision === 'deny') {
                    return finalize({
                        ok: false,
                        error: `permission denied: ${decision.reason}`,
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
