/**
 * ClaudeAgentSDKBridge — the single choke point for external `runAgentLoop`
 * invocations. Every dispatch runs inside a `RunEnvelope` so timing, failures,
 * and backend-selection land uniformly in the trace/usage pipelines.
 *
 * History (2026-07): the bridge used to dispatch between two backends — the
 * self-hosted harness and a `queryWithProfile`-based Cloud Agent SDK path
 * gated by `agentBackend === 'claude-agent-sdk'`. That backend was retired
 * (see docs/superpowers/specs/2026-07-03-cloud-sdk-and-mode-choice-audit.md
 * Part A / Option 2). The SDK stays imported as a library — `tool()` /
 * `createSdkMcpServer()` / `queryWithProfile` are still used by MCP servers
 * (`vaultMcpServer`, `graphMcpServer`, `webSearchTool`) and one-shot LLM
 * callers (`service-manager.ts`, `LlmAmbientExplanationAdapter`) — but the
 * bridge no longer routes to them as a chosen backend.
 *
 * The class name is preserved because a large number of imports reference it;
 * conceptually it is now `HarnessRunBridge`.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { AgentLoopConfig, AgentLoopResult } from '@/service/agents/harness/loop/types';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import type { HarnessSettings } from '@/core/config/settingsTypes';
import { ContextManager } from '@/service/agents/harness/context/ContextManager';
import { createDefaultCompactSummarizer } from '@/service/agents/harness/context/compactSummarizerRuntime';

export interface BridgeRunConfig extends AgentLoopConfig {
    /** T11J B1: explicit app + pluginId so the bridge doesn't reach AppContext. */
    app: AppHandle;
    pluginId: string;
    /**
     * Current harness settings. Kept on the config even after the SDK-backend
     * retirement so future gating (permission modes, escalation caps) has a
     * single passthrough surface.
     */
    harnessSettings: HarnessSettings;
}

export class ClaudeAgentSDKBridge {
    async run(cfg: BridgeRunConfig): Promise<AgentLoopResult> {
        const { runHarnessAgent } = await import('@/service/agents/harness/HarnessAgentRun');
        const loopConfig = withDefaultContextManager(cfg);
        const { payload } = await runHarnessAgent<AgentLoopResult>({
            trigger: 'manual',
            execute: async () => runAgentLoop(loopConfig),
        });
        return payload;
    }
}

function withDefaultContextManager(cfg: BridgeRunConfig): BridgeRunConfig {
    if (cfg.context) return cfg;
    const maxTokens =
        cfg.tierController.current().capabilities.maxContextTokens ??
        cfg.budget?.maxTokens ??
        20_000;
    return {
        ...cfg,
        context: new ContextManager({
            maxTokens,
            summarizer: createDefaultCompactSummarizer() ?? undefined,
        }),
    };
}
