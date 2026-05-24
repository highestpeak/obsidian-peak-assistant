/**
 * ClaudeAgentSDKBridge — unified run() entry point.
 *
 * Routing rules (in order):
 * 1. cfg.useSDK explicitly true/false  → honor caller's choice (overrides settings)
 * 2. Settings agentBackend = 'claude-agent-sdk'  → SDK
 * 3. Settings agentBackend = 'harness'           → harness
 * 4. Settings agentBackend = 'auto' (default)    → harness (with SDK reserved for hard-coded callers like VaultSearchAgentSDK)
 */

import type { AgentLoopConfig, AgentLoopResult } from '@/service/agents/harness/loop/types';
import { runAgentLoop } from '@/service/agents/harness';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { translateSdkMessages } from '@/service/agents/core/sdkMessageAdapter';

export interface BridgeRunConfig extends AgentLoopConfig {
    /**
     * Explicit backend override. When set, ignores user settings.
     * Used by VaultSearchAgentSDK which is HITL-coupled to vaultMcpServer.
     */
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
        if (this.shouldUseSDK(cfg)) {
            return this.runViaSDK(cfg);
        }
        return runAgentLoop(cfg);
    }

    /** Resolve which backend to use, honoring caller override then settings. */
    private shouldUseSDK(cfg: BridgeRunConfig): boolean {
        if (typeof cfg.useSDK === 'boolean') return cfg.useSDK;
        const backend = AppContext.getHarnessSettings().agentBackend;
        return backend === 'claude-agent-sdk';
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
