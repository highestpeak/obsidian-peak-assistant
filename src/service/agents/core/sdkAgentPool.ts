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
    const profileEnv = toAgentSdkEnv(profile);
    const subprocessEnv: Record<string, string> = {
        ...profileEnv,
        PATH: process.env.PATH ?? '',
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

    // 8. Yield messages, checking for abort
    for await (const msg of messages) {
        if (options.signal?.aborted) return;
        yield msg;
    }
}
