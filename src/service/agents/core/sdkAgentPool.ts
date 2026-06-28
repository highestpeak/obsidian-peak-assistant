import type { AppHandle as App } from '@/core/ports/AppHandle';
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

export interface NodeBinaryInfo { path: string; isElectron: boolean; }

/** Probe common node binary locations, falling back to process.execPath (Electron). */
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

let _setMaxListenersPatched = false;

/** Patch events.setMaxListeners to handle Chromium AbortSignal in Electron renderer. */
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

let _timerShimInstalled = false;

/** Shim setTimeout/setInterval to return objects with .unref() for Electron renderer. */
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

function getCliPathBase(app: App, pluginId: string): string {
    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    return join(adapter.getBasePath(), app.vault.configDir, 'plugins', pluginId, 'sdk', 'cli.js');
}

export interface QueryOptions {
    prompt: string;
    systemPrompt: string;
    maxTurns?: number;
    allowedTools?: string[];
    disallowedTools?: string[];
    mcpServers?: Record<string, unknown>;
    jsonSchema?: unknown;
    canUseTool?: (toolName: string) => boolean;
    signal?: AbortSignal;
    usageFeature?: UsageFeature;
    usageAction?: string;
    usageSessionId?: string;
    /**
     * Override both primary and fast model for this query. When set, the value
     * is materialized into ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL so the
     * agent SDK uses this model regardless of which "class" it picks.
     * Caller should pass an already-canonical model id (the SDK side runs it
     * through resolveApiModelId).
     */
    modelOverride?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SDKMessage = any;

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

let _warmedUp = false;
let _cachedNodeInfo: NodeBinaryInfo | null = null;

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

export function shutdownPool(): void {
    _warmedUp = false;
    _cachedNodeInfo = null;
    console.debug('[sdkAgentPool] pool shutdown');
}

async function ensureNodeInfo(): Promise<NodeBinaryInfo> {
    if (!_warmedUp || !_cachedNodeInfo) {
        await warmupPool();
    }
    // After warmup, _cachedNodeInfo is guaranteed non-null
    return _cachedNodeInfo!;
}

export function getCliPath(app: App, pluginId: string): string {
    const sdkSettings = ProfileRegistry.getInstance().getSdkSettings();
    if (sdkSettings.cliPathOverride) {
        return sdkSettings.cliPathOverride;
    }
    return getCliPathBase(app, pluginId);
}

export async function* queryWithProfile(
    app: App,
    pluginId: string,
    profile: Profile,
    options: QueryOptions,
): AsyncGenerator<SDKMessage> {
    const nodeInfo = await ensureNodeInfo();

    const registry = ProfileRegistry.getInstance();
    const agentConfig = registry.getActiveAgentConfig();
    const agentFastConfig = registry.getActiveAgentFastConfig();
    const resolvedPrimary = modelRegistry.resolveApiModelId(profile.kind, agentConfig?.modelId ?? profile.primaryModel);
    const resolvedFast = modelRegistry.resolveApiModelId(profile.kind, agentFastConfig?.modelId ?? profile.fastModel);
    // When caller specifies a modelOverride (e.g. Fast Auto Review wants Haiku),
    // point ALL model env vars at that model so the SDK can't fall back to the
    // primary even when it requests the "sonnet" class internally.
    const overrideResolved = options.modelOverride
        ? modelRegistry.resolveApiModelId(profile.kind, options.modelOverride)
        : null;
    const agentModelId = overrideResolved ?? resolvedPrimary;
    const agentFastModelId = overrideResolved ?? resolvedFast;
    const subprocessEnv: Record<string, string> = {
        ...toAgentSdkEnv(profile, agentModelId, agentFastModelId),
        PATH: process.env.PATH ?? '',
        CLAUDE_CODE_SIMPLE: '1',
    };
    if (nodeInfo.isElectron) subprocessEnv.ELECTRON_RUN_AS_NODE = '1';

    const disallowedTools = options.disallowedTools
        ? [...new Set([...DEFAULT_DISALLOWED_TOOLS, ...options.disallowedTools])]
        : [...DEFAULT_DISALLOWED_TOOLS];

    const abortController = new AbortController();
    if (options.signal) {
        if (options.signal.aborted) return;
        options.signal.addEventListener('abort', () => abortController.abort());
    }

    const basePath = (app.vault.adapter as unknown as { getBasePath(): string }).getBasePath();
    const messages = query({
        prompt: options.prompt,
        options: {
            pathToClaudeCodeExecutable: getCliPath(app, pluginId),
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

    const startMs = Date.now();
    let inputTokens = 0, outputTokens = 0, cachedTokens = 0;

    for await (const msg of messages) {
        if (options.signal?.aborted) return;
        if (msg?.type === 'result' && msg?.usage) {
            inputTokens = msg.usage.input_tokens ?? 0;
            outputTokens = msg.usage.output_tokens ?? 0;
            cachedTokens = msg.usage.cache_read_input_tokens ?? 0;
        }
        yield msg;
    }

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
