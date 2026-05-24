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

    const tierUsage: Record<ModelTier, number> = {
        'local-fast': 0,
        'local-deep': 0,
        online: 0,
    };

    const systemPrompt = buildSystemPrompt(cfg);
    const messages: ModelMessage[] = [...cfg.initialMessages];

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
        const allowedTools = cfg.tools.filter(
            (t) => !t.allowedTiers || t.allowedTiers.includes(tier.tier),
        );
        const toolSet: ToolSet = {};
        for (const t of allowedTools) {
            toolSet[t.name] = wrapTool(t, cfg, tier.tier, stepIndex, trace, captured);
        }
        toolSet[ESCALATE_TOOL_NAME] = cfg.tierController.escalateTool();

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
        },
    });
}
