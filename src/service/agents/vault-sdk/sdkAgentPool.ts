/**
 * Claude Agent SDK renderer-compat + subprocess setup for Obsidian.
 *
 * The Agent SDK's parent-side code (bundled into main.js, runs in Obsidian's
 * Electron renderer) requires several compat patches before query() can be
 * safely called:
 *
 * 1. events.setMaxListeners accepts browser AbortSignal without TypeError
 * 2. setTimeout/setInterval returns a handle with .unref()/.ref() methods
 * 3. The subprocess spawn must use a real node binary (not Electron Node mode,
 *    which causes SIGTRAP on macOS 32.2.5 / Node 20.18)
 *
 * Task 11's VaultSearchAgentSDK calls `warmupSdkAgentPool(app, pluginId)`
 * once on plugin load (or first use). After that it can call query() with
 * `findNodeBinary().path` as options.executable.
 *
 * All functions in this module are idempotent.
 */

import type { App } from 'obsidian';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

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
 *   2. ~/.nvm/versions/node/*/bin/node (newest version first)
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
 * Absolute path to the bundled cli.js sidecar file. The SDK uses this via
 * options.pathToClaudeCodeExecutable to spawn its subprocess.
 */
export function getCliPath(app: App, pluginId: string): string {
    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    return join(adapter.getBasePath(), app.vault.configDir, 'plugins', pluginId, 'sdk', 'cli.js');
}

// ─── Warmup ───────────────────────────────────────────────────────────────────

let _warmupComplete = false;
let _cachedNodeInfo: NodeBinaryInfo | null = null;

/**
 * Idempotent warmup: installs both renderer compat patches and probes for
 * a node binary. Call this once on plugin load (non-blocking) or lazily on
 * first vault search. Safe to call multiple times.
 */
export async function warmupSdkAgentPool(
    _app: App,
    _pluginId: string,
): Promise<NodeBinaryInfo> {
    if (_warmupComplete && _cachedNodeInfo) {
        return _cachedNodeInfo;
    }

    patchEventsSetMaxListenersForRenderer();
    installRendererTimerShim();

    _cachedNodeInfo = findNodeBinary();
    _warmupComplete = true;

    console.debug('[sdkAgentPool] warmup complete', {
        nodeBinary: _cachedNodeInfo,
    });

    return _cachedNodeInfo;
}

/** For tests only: reset cached state so patches re-apply. */
export function _resetPoolForTests(): void {
    _setMaxListenersPatched = false;
    _timerShimInstalled = false;
    _warmupComplete = false;
    _cachedNodeInfo = null;
}
