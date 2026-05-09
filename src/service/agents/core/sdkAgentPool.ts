/**
 * Shared SDK Agent Pool — manages renderer compat, node binary detection,
 * and provides a unified `queryWithProfile()` for all agents.
 *
 * Consolidates the low-level Electron compat patches (timer shim, event
 * listener shim, node binary detection) with the high-level pool API
 * (warmup, shutdown, queryWithProfile).
 *
 * Replaces the per-agent inline warmup + env materialization pattern.
 * Both VaultSearchAgentSDK and GraphAgent delegate to this service.
 */

import type { App } from 'obsidian';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Profile } from '@/core/profiles/types';
import { toAgentSdkEnv } from '@/core/profiles/materialize';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import type { UsageFeature } from '@/service/usage/types';
import { computeUsdFromUsage } from '@/service/search/support/llm-cost-utils';
import { modelRegistry } from '@/core/providers/model-registry';

// ─── Node binary detection ────────────────────────────────────────────────────

export interface NodeBinaryInfo {
    path: string;
    isElectron: boolean;
}

/**
 * Probe common node binary locations. Returns the first that exists,
 * falling back to process.execPath (Electron) + ELECTRON_RUN_AS_NODE=1 flag.
 *
 * Priority:
 *   1. window.PEAK_NODE_PATH override (debug)
 *   2. ~/.nvm/versions/node/<version>/bin/node (newest version first)
 *   3. /opt/homebrew/bin/node
 *   4. /usr/local/bin/node
 *   5. /usr/bin/node
 *   6. process.execPath (Electron fallback)
 *
 * NOTE: Electron fallback is known to SIGTRAP with some cli.js versions.
 * Prefer a real node installation when possible.
 */
export function findNodeBinary(): NodeBinaryInfo {
    const home = process.env.HOME ?? '';
    const candidates: string[] = [];

    const override = (globalThis as unknown as { PEAK_NODE_PATH?: string }).PEAK_NODE_PATH;
    if (override) candidates.push(override);

    const nvmDir = join(home, '.nvm', 'versions', 'node');
    try {
        const versions = readdirSync(nvmDir).sort().reverse();
        for (const v of versions) candidates.push(join(nvmDir, v, 'bin', 'node'));
    } catch {
        /* nvm not installed */
    }

    candidates.push(
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node',
    );

    for (const p of candidates) {
        try {
            if (existsSync(p)) return { path: p, isElectron: false };
        } catch {
            /* ignore */
        }
    }

    return { path: process.execPath, isElectron: true };
}

// ─── events.setMaxListeners shim ──────────────────────────────────────────────

let _setMaxListenersPatched = false;

/**
 * The SDK calls `events.setMaxListeners(100, abortSignal)` to raise the
 * listener cap. In Electron renderer, globalThis.AbortController is
 * Chromium's, and its signal fails Node's EventTarget instanceof check.
 *
 * Patch events.setMaxListeners with a lenient wrapper that catches the
 * specific TypeError and falls back to setting only the global default.
 * Idempotent — safe to call multiple times.
 */
export function patchEventsSetMaxListenersForRenderer(): void {
    if (_setMaxListenersPatched) return;
    _setMaxListenersPatched = true;

    type EventsModule = {
        setMaxListeners: (n: number, ...targets: unknown[]) => void;
    };

    const nodeRequire = (globalThis as unknown as { require: NodeJS.Require }).require;
    const eventsModule = nodeRequire('events') as EventsModule;
    const original = eventsModule.setMaxListeners.bind(eventsModule);

    eventsModule.setMaxListeners = function patchedSetMaxListeners(
        n: number,
        ...targets: unknown[]
    ): void {
        try {
            original(n, ...(targets as never[]));
        } catch (err) {
            if (
                err instanceof TypeError &&
                String(err.message).includes('must be an instance')
            ) {
                // Browser AbortSignal in renderer — drop targets, set default only
                original(n);
                return;
            }
            throw err;
        }
    };

    console.debug('[sdkAgentPool] patched events.setMaxListeners for renderer dual-globals');
}

// ─── Timer shim (setTimeout/setInterval with .unref()) ───────────────────────

let _timerShimInstalled = false;

/**
 * The SDK's parent-side code calls `setTimeout(...).unref()` to mark timers
 * non-blocking (Node semantics). In Chromium renderer, setTimeout returns a
 * number, so `.unref()` is undefined — TypeError during SDK cleanup.
 *
 * Wrap globalThis.setTimeout/setInterval to return a Timeout-like object
 * with the Node methods as no-ops. clearTimeout/clearInterval unwrap to
 * the original numeric id before calling through.
 *
 * Idempotent.
 */
export function installRendererTimerShim(): void {
    if (_timerShimInstalled) return;
    _timerShimInstalled = true;

    type TimeoutLike = {
        _peakId: unknown;
        unref(): TimeoutLike;
        ref(): TimeoutLike;
        refresh(): TimeoutLike;
        hasRef(): boolean;
        valueOf(): unknown;
        [Symbol.toPrimitive](): unknown;
    };

    const wrap = (id: unknown): TimeoutLike | unknown => {
        if (typeof id === 'object' && id !== null) return id;
        const wrapper: TimeoutLike = {
            _peakId: id,
            unref() { return this; },
            ref() { return this; },
            refresh() { return this; },
            hasRef() { return true; },
            valueOf() { return id; },
            [Symbol.toPrimitive]() { return id; },
        };
        return wrapper;
    };
    const unwrap = (maybeWrapped: unknown): unknown => {
        if (
            maybeWrapped != null &&
            typeof maybeWrapped === 'object' &&
            '_peakId' in (maybeWrapped as Record<string, unknown>)
        ) {
            return (maybeWrapped as { _peakId: unknown })._peakId;
        }
        return maybeWrapped;
    };

    const origSetTimeout = globalThis.setTimeout;
    const origClearTimeout = globalThis.clearTimeout;
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;

    (globalThis as unknown as { setTimeout: unknown }).setTimeout = function patchedSetTimeout(
        handler: unknown,
        timeout?: unknown,
        ...args: unknown[]
    ): unknown {
        const id = (origSetTimeout as unknown as (...a: unknown[]) => unknown)(
            handler, timeout, ...args,
        );
        return wrap(id);
    };
    (globalThis as unknown as { clearTimeout: unknown }).clearTimeout = function patchedClearTimeout(
        maybeWrapped: unknown,
    ): void {
        (origClearTimeout as unknown as (id: unknown) => void)(unwrap(maybeWrapped));
    };
    (globalThis as unknown as { setInterval: unknown }).setInterval = function patchedSetInterval(
        handler: unknown,
        timeout?: unknown,
        ...args: unknown[]
    ): unknown {
        const id = (origSetInterval as unknown as (...a: unknown[]) => unknown)(
            handler, timeout, ...args,
        );
        return wrap(id);
    };
    (globalThis as unknown as { clearInterval: unknown }).clearInterval = function patchedClearInterval(
        maybeWrapped: unknown,
    ): void {
        (origClearInterval as unknown as (id: unknown) => void)(unwrap(maybeWrapped));
    };

    console.debug('[sdkAgentPool] installed renderer timer shim');
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Absolute path to the bundled cli.js sidecar file (base implementation).
 * The SDK uses this via options.pathToClaudeCodeExecutable to spawn its subprocess.
 */
function getCliPathBase(app: App, pluginId: string): string {
    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    return join(adapter.getBasePath(), app.vault.configDir, 'plugins', pluginId, 'sdk', 'cli.js');
}

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
    return getCliPathBase(app, pluginId);
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
