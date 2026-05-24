/**
 * ClaudeAgentSDKBridge — unified run() entry point.
 *
 * - useSDK=false (default): delegates to runAgentLoop (self-hosted harness).
 * - useSDK=true: delegates to sdkAgentPool.queryWithProfile, wraps the result
 *   into AgentLoopResult shape so callers stay provider-agnostic.
 *
 * Design goal: thin adapter, zero new abstractions. sdkAgentPool is NOT
 * rewritten — it's imported as-is.
 */

import type { AgentLoopConfig, AgentLoopResult } from '@/service/agents/harness/loop/types';
import { runAgentLoop } from '@/service/agents/harness';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { translateSdkMessages } from '@/service/agents/core/sdkMessageAdapter';

export interface BridgeRunConfig extends AgentLoopConfig {
    /** When true, route through Claude Agent SDK pool instead of harness loop. */
    useSDK?: boolean;
    /** SDK-specific: system prompt string (used instead of AgentLoopConfig.systemPrompt when routing via SDK). */
    sdkPrompt?: string;
    /** SDK-specific: max turns for the SDK agent. Default 10. */
    sdkMaxTurns?: number;
    /** SDK-specific: allowed tool names for the SDK agent. */
    sdkAllowedTools?: string[];
    /** SDK-specific: MCP servers for the SDK agent. */
    sdkMcpServers?: Record<string, unknown>;
}

export class ClaudeAgentSDKBridge {
    async run(cfg: BridgeRunConfig): Promise<AgentLoopResult> {
        if (cfg.useSDK) {
            return this.runViaSDK(cfg);
        }
        return runAgentLoop(cfg);
    }

    private async runViaSDK(cfg: BridgeRunConfig): Promise<AgentLoopResult> {
        const startedAt = Date.now();
        const ctx = AppContext.getInstance();
        const profile = ProfileRegistry.getInstance().getActiveAgentProfile()!;

        // Extract user-facing prompt from initialMessages
        const userMsg = cfg.initialMessages.find((m) => m.role === 'user');
        const prompt =
            cfg.sdkPrompt ??
            (userMsg && typeof userMsg.content === 'string'
                ? userMsg.content
                : Array.isArray(userMsg?.content)
                  ? (userMsg!.content as { type: string; text?: string }[])
                        .filter((p) => p.type === 'text')
                        .map((p) => p.text ?? '')
                        .join('\n')
                  : '');

        const messages = queryWithProfile(ctx.app, ctx.pluginId, profile, {
            prompt,
            systemPrompt: cfg.systemPrompt,
            maxTurns: cfg.sdkMaxTurns ?? 10,
            allowedTools: cfg.sdkAllowedTools,
            mcpServers: cfg.sdkMcpServers ?? {},
            signal: cfg.abortSignal,
        });

        let finalText = '';
        let totalTokens = 0;

        for await (const ev of translateSdkMessages(messages, { hasPartialMessages: true })) {
            if (ev.type === 'text-delta' && typeof (ev as { text?: string }).text === 'string') {
                finalText += (ev as { text: string }).text;
            } else if (ev.type === 'complete') {
                const usage = (ev as { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }).usage;
                if (usage) {
                    totalTokens += usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
                }
            }
        }

        const durationMs = Date.now() - startedAt;
        return {
            loopId: cfg.loopId,
            finalText: finalText.trim(),
            steps: [
                {
                    loopId: cfg.loopId,
                    stepIndex: 0,
                    tier: 'online' as const,
                    modelId: profile.primaryModel ?? 'unknown',
                    providerId: profile.id ?? profile.kind ?? 'unknown',
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens,
                    toolCalls: [],
                    toolResults: [],
                    text: finalText.trim(),
                    finishReason: 'stop',
                    durationMs,
                },
            ],
            finishReason: 'stop' as const,
            tierUsage: { 'local-fast': 0, 'local-deep': 0, online: 1 },
            totalTokens,
            totalToolCalls: 0,
            durationMs,
        };
    }
}

/** Singleton instance for convenience. */
let _instance: ClaudeAgentSDKBridge | null = null;
export function getAgentBridge(): ClaudeAgentSDKBridge {
    if (!_instance) _instance = new ClaudeAgentSDKBridge();
    return _instance;
}
