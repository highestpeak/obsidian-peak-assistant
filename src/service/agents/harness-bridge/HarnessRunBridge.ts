/**
 * Single app-facing bridge into Peak Harness. Every dispatch runs inside a
 * RunEnvelope so timing and failures land uniformly in trace/usage pipelines.
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

export class HarnessRunBridge {
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
