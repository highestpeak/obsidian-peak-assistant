import { App, Notice } from 'obsidian';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
// Static import: esbuild bundles sdk.mjs directly into main.js (ESM → CJS at
// build time). This avoids runtime ESM loading, which Obsidian's current
// Electron/Node (20.18 / 32.2) does not support via require(). cli.js stays a
// sidecar file that the SDK spawns as a subprocess via pathToClaudeCodeExecutable.
import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Find a real Node binary on the user's system. Electron Node mode
 * (process.execPath + ELECTRON_RUN_AS_NODE=1) causes SIGTRAP when running
 * cli.js, so we prefer a real node binary. Falls back to Electron if none
 * found.
 */
function findNodeBinary(): { path: string; isElectron: boolean } {
    const home = process.env.HOME ?? '';
    const candidates: string[] = [];

    // 1. Explicit override via window global for debugging
    const override = (globalThis as unknown as { PEAK_NODE_PATH?: string }).PEAK_NODE_PATH;
    if (override) candidates.push(override);

    // 2. nvm: iterate all installed versions, newest first
    const nvmDir = join(home, '.nvm', 'versions', 'node');
    try {
        const versions = readdirSync(nvmDir).sort().reverse();
        for (const v of versions) candidates.push(join(nvmDir, v, 'bin', 'node'));
    } catch { /* nvm not installed */ }

    // 3. Homebrew & system paths
    candidates.push(
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node',
    );

    for (const p of candidates) {
        try {
            if (existsSync(p)) return { path: p, isElectron: false };
        } catch { /* ignore */ }
    }

    // Fallback: Electron in Node mode
    return { path: process.execPath, isElectron: true };
}

/**
 * Patch renderer globals for Node-compat. The bundled SDK parent-side code
 * expects Node's setTimeout (returns a Timeout object with .unref()/.ref()/
 * .refresh()), but in the Electron renderer setTimeout is Chromium's (returns
 * a number). Wrap the return value so .unref() et al are no-ops.
 *
 * Idempotent. Safe to call multiple times.
 */
let _timerShimInstalled = false;
function installRendererTimerShim(): void {
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
            handler,
            timeout,
            ...args,
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
            handler,
            timeout,
            ...args,
        );
        return wrap(id);
    };
    (globalThis as unknown as { clearInterval: unknown }).clearInterval = function patchedClearInterval(
        maybeWrapped: unknown,
    ): void {
        (origClearInterval as unknown as (id: unknown) => void)(unwrap(maybeWrapped));
    };

    console.debug('[spike] installed renderer timer shim (setTimeout/setInterval .unref())');
}

/**
 * Monkey-patch Node's events.setMaxListeners to tolerate browser-context
 * AbortSignal instances in Electron renderer. The SDK calls
 * events.setMaxListeners(100, abortSignal) internally. In Electron renderer,
 * globalThis.AbortController is Chromium's, and its signal is not an instance
 * of Node's EventTarget class, so Node rejects it with a TypeError.
 *
 * Use runtime require() to get a mutable reference to the events module
 * (esbuild disallows assignment to namespace imports). 'events' is a Node
 * built-in listed in esbuild external so this resolves to Node's real module.
 *
 * Idempotent. Safe to call multiple times.
 */
let _setMaxListenersPatched = false;
function patchEventsSetMaxListenersForRenderer(): void {
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
                // Browser-world AbortSignal in renderer — drop targets, set default only
                original(n);
                return;
            }
            throw err;
        }
    };
    console.debug('[spike] patched events.setMaxListeners for renderer dual-globals');
}

/**
 * Temporary spike command to verify @anthropic-ai/claude-agent-sdk runs inside
 * the Obsidian plugin. Delete this file after migration is verified in Task 16.
 */
export async function runAgentSdkSpike(app: App, pluginId: string): Promise<void> {
    // Apply the renderer compatibility patches before any SDK call.
    patchEventsSetMaxListenersForRenderer();
    installRendererTimerShim();

    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    const basePath = adapter.getBasePath();
    const pluginDir = join(basePath, app.vault.configDir, 'plugins', pluginId);

    const cliPath = join(pluginDir, 'sdk', 'cli.js');

    const nodeInfo = findNodeBinary();
    console.log('[spike] node binary:', nodeInfo);
    new Notice(`[spike] node=${nodeInfo.path} (${nodeInfo.isElectron ? 'ELECTRON' : 'native'})`);
    console.log('[spike] query fn:', typeof query);

    const apiKey = (window as unknown as { PEAK_SPIKE_ANTHROPIC_KEY?: string }).PEAK_SPIKE_ANTHROPIC_KEY;
    if (!apiKey) {
        new Notice(
            '[spike] Set window.PEAK_SPIKE_ANTHROPIC_KEY in DevTools before running this command',
            8000
        );
        return;
    }

    // Build subprocess env. Only set ELECTRON_RUN_AS_NODE when falling back
    // to Electron — real node binaries don't need it (and setting it confuses
    // them).
    const subprocessEnv: Record<string, string> = {
        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        PATH: process.env.PATH ?? '',
    };
    if (nodeInfo.isElectron) {
        subprocessEnv.ELECTRON_RUN_AS_NODE = '1';
    }

    new Notice(`[spike] starting query() via ${nodeInfo.path}`);
    const messages: unknown[] = [];
    try {
        for await (const msg of query({
            prompt: 'What files end with .md in the current directory? List at most 3.',
            options: {
                pathToClaudeCodeExecutable: cliPath,
                executable: nodeInfo.path as 'node',
                executableArgs: [],
                cwd: basePath,
                allowedTools: ['Glob'],
                settingSources: [],
                maxTurns: 3,
                model: 'claude-haiku-4-5',
                env: subprocessEnv,
            } as Parameters<typeof query>[0]['options'],
        })) {
            messages.push(msg);
            console.log('[spike] message', messages.length, msg);
            if (messages.length > 50) {
                console.warn('[spike] too many messages, breaking');
                break;
            }
        }
        new Notice(`[spike] done — ${messages.length} messages received`);
    } catch (err) {
        console.error('[spike] query error', err);
        new Notice(`[spike] query failed: ${(err as Error).message}`, 10000);
    }
}
