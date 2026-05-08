/**
 * Shared SDK Agent Pool — manages renderer compat, node binary detection,
 * and provides a unified `queryWithProfile()` for all agents.
 *
 * Replaces the per-agent inline warmup + env materialization pattern.
 * Both VaultSearchAgentSDK and GraphAgent delegate to this service.
 *
 * Provider v2 Task 2.
 */

import type { App } from 'obsidian';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Profile } from '@/core/profiles/types';
import { toAgentSdkEnv } from '@/core/profiles/materialize';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
    patchEventsSetMaxListenersForRenderer,
    installRendererTimerShim,
    findNodeBinary,
    getCliPath as getCliPathFromVaultSdk,
    type NodeBinaryInfo,
} from '../vault-sdk/sdkAgentPool';
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import type { UsageFeature } from '@/service/usage/types';
import { computeUsdFromUsage } from '@/service/search/support/llm-cost-utils';
import { modelRegistry } from '@/core/providers/model-registry';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Options for `queryWithProfile`. Fields mirror Agent SDK `query()` options. */
export interface QueryOptions {
    prompt: string;
    systemPrompt: string;
    maxTurns?: number;
    allowedTools?: string[];
    disallowedTools?: string[];
    mcpServers?: Record<string, unknown>;
    /** JSON schema for structured output (if the agent needs it). */
    jsonSchema?: unknown;
    /** Called by the SDK before a tool executes. Return false to deny. */
    canUseTool?: (toolName: string) => boolean;
    /** AbortSignal for cancellation. */
    signal?: AbortSignal;
    /** Usage tracking fields — emitted as UsageRecordedViewEvent after the query. */
    usageFeature?: UsageFeature;
    usageAction?: string;
    usageSessionId?: string;
}

/** Messages yielded by `queryWithProfile`. Transparent pass-through from SDK. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SDKMessage = any;

// ─── Default disallowed tools ────────────────────────────────────────────────

const DEFAULT_DISALLOWED_TOOLS = [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
];

// ─── Pool state ──────────────────────────────────────────────────────────────

let _warmedUp = false;
let _cachedNodeInfo: NodeBinaryInfo | null = null;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Idempotent warmup: install renderer compat patches and probe for a node
 * binary. Safe to call multiple times. Non-blocking on failure — caller can
 * retry on first use.
 */
export async function warmupPool(): Promise<void> {
    if (_warmedUp) return;

    patchEventsSetMaxListenersForRenderer();
    installRendererTimerShim();

    _cachedNodeInfo = findNodeBinary();
    _warmedUp = true;

    console.debug('[sdkAgentPool] pool warmup complete', {
        nodeBinary: _cachedNodeInfo,
    });
}

/**
 * Mark pool as not warmed up. Called on plugin unload so a subsequent reload
 * re-applies compat patches against the new bundle context.
 */
export function shutdownPool(): void {
    _warmedUp = false;
    _cachedNodeInfo = null;
    console.debug('[sdkAgentPool] pool shutdown');
}

/**
 * Get the cached NodeBinaryInfo, warming up if needed.
 * Throws if warmup fails.
 */
async function ensureNodeInfo(): Promise<NodeBinaryInfo> {
    if (!_warmedUp || !_cachedNodeInfo) {
        await warmupPool();
    }
    // After warmup, _cachedNodeInfo is guaranteed non-null
    return _cachedNodeInfo!;
}

/**
 * Resolve the CLI path. Uses `SdkSettings.cliPathOverride` from ProfileRegistry
 * if set, otherwise falls back to the standard plugin-dir cli.js location.
 */
export function getCliPath(app: App, pluginId: string): string {
    const sdkSettings = ProfileRegistry.getInstance().getSdkSettings();
    if (sdkSettings.cliPathOverride) {
        return sdkSettings.cliPathOverride;
    }
    return getCliPathFromVaultSdk(app, pluginId);
}

/**
 * Execute an Agent SDK `query()` call using the given profile's credentials.
 *
 * Handles:
 *   - Warmup (idempotent)
 *   - Profile → env-var materialization
 *   - ELECTRON_RUN_AS_NODE handling
 *   - Default disallowed tools merge
 *   - Signal/abort forwarding
 *
 * Yields raw SDK messages (caller translates as needed).
 */
export async function* queryWithProfile(
    app: App,
    pluginId: string,
    profile: Profile,
    options: QueryOptions,
): AsyncGenerator<SDKMessage> {
    // 1. Ensure pool is warmed up
    const nodeInfo = await ensureNodeInfo();

    // 2. Materialize profile → env vars
    const registry = ProfileRegistry.getInstance();
    const agentConfig = registry.getActiveAgentConfig();
    const agentFastConfig = registry.getActiveAgentFastConfig();
    const agentModelId = agentConfig?.modelId ?? profile.primaryModel;
    const agentFastModelId = agentFastConfig?.modelId ?? profile.fastModel;
    const profileEnv = toAgentSdkEnv(profile, agentModelId, agentFastModelId);
    const subprocessEnv: Record<string, string> = {
        ...profileEnv,
        PATH: process.env.PATH ?? '',
        // Prevent CLI from reading macOS Keychain OAuth tokens;
        // forces it to use ANTHROPIC_API_KEY from env directly.
        CLAUDE_CODE_SIMPLE: '1',
    };
    if (nodeInfo.isElectron) {
        subprocessEnv.ELECTRON_RUN_AS_NODE = '1';
    }

    // 3. CLI path
    const cliPath = getCliPath(app, pluginId);

    // 4. Merge disallowed tools (caller's list + defaults)
    const disallowedTools = options.disallowedTools
        ? [...new Set([...DEFAULT_DISALLOWED_TOOLS, ...options.disallowedTools])]
        : [...DEFAULT_DISALLOWED_TOOLS];

    // 5. Build abort controller if signal provided
    const abortController = new AbortController();
    if (options.signal) {
        if (options.signal.aborted) {
            return; // Already cancelled
        }
        options.signal.addEventListener('abort', () => abortController.abort());
    }

    // 6. Working directory
    const basePath = (app.vault.adapter as unknown as { getBasePath(): string }).getBasePath();

    // 7. Call SDK query()
    const messages = query({
        prompt: options.prompt,
        options: {
            pathToClaudeCodeExecutable: cliPath,
            executable: nodeInfo.path as 'node',
            executableArgs: [],
            cwd: basePath,
            maxTurns: options.maxTurns ?? 20,
            systemPrompt: options.systemPrompt,
            allowedTools: options.allowedTools,
            disallowedTools,
            mcpServers: options.mcpServers ?? {},
            settingSources: [],
            env: subprocessEnv,
            includePartialMessages: true,
            abortController,
        } as Parameters<typeof query>[0]['options'],
    });

    // 8. Yield messages, checking for abort; track usage from result message
    const startMs = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;

    for await (const msg of messages) {
        if (options.signal?.aborted) return;
        // Extract usage from SDK result message
        if (msg?.type === 'result' && msg?.usage) {
            inputTokens = msg.usage.input_tokens ?? 0;
            outputTokens = msg.usage.output_tokens ?? 0;
            cachedTokens = msg.usage.cache_read_input_tokens ?? 0;
        }
        yield msg;
    }

    // 9. Emit usage event (fire-and-forget)
    if (options.usageFeature && (inputTokens > 0 || outputTokens > 0)) {
        try {
            const durationMs = Date.now() - startMs;
            const modelId = agentModelId ?? profile.primaryModel;
            const modelInfo = modelId
                ? modelRegistry.getModelsForProvider(profile.kind).find(m => m.id === modelId)
                : undefined;
            const costUsd = computeUsdFromUsage(
                { inputTokens, outputTokens, cachedInputTokens: cachedTokens, reasoningTokens: 0, totalTokens: inputTokens + outputTokens },
                modelInfo,
            );
            const eventBus = EventBus.getInstance(app);
            eventBus.dispatch(new UsageRecordedViewEvent({
                sessionId: options.usageSessionId ?? crypto.randomUUID(),
                feature: options.usageFeature,
                action: options.usageAction ?? 'agent_query',
                provider: profile.kind,
                model: modelId ?? 'unknown',
                inputTokens,
                outputTokens,
                cachedTokens,
                reasoningTokens: 0,
                costUsd,
                durationMs,
                isStreaming: false,
            }));
        } catch (e) {
            console.warn('[sdkAgentPool] Failed to emit usage event', e);
        }
    }
}
