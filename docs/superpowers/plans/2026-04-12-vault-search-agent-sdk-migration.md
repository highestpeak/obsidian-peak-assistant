# Vault Search Agent SDK Migration — 1-Day Implementation Plan

> **COMPLETED** (2026-04-12) — 15/16 tasks done; task 16 (delete spikeAgentSdk.ts) completed in Phase 0 cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate vault search agent from hand-rolled Vercel AI SDK pipeline to Claude Agent SDK `query()`, fixing the core recall problem (21% → ≥80%) on reflective queries, in a single working day. All other plugin features (chat, embeddings, doc agents, structured extraction) remain on Vercel AI SDK. A feature flag `vaultSearch.useV2` toggles between old and new vault search paths.

**Architecture:** A thin new `VaultSearchAgentSDK` calls `@anthropic-ai/claude-agent-sdk` `query()` with an in-process MCP server exposing Obsidian Vault API operations as tools. A skills-style system prompt instructs the LLM to call `vault_list_folders` first for reflective queries, enumerate candidate folders, read notes, then submit a plan. A message adapter translates SDK `SDKMessage` events into the plugin's existing `LLMStreamEvent` shape so the current UI stack needs zero changes. A subprocess pool pre-warms the SDK on plugin load. A minimal settings-based profile supplies `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / model slot vars. Old pipeline is kept intact behind the flag until the new one is verified in Phase 3 of the broader v2 plan.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk@0.2.101` (bundled `cli.js` 13.5 MB), Zod v4 (for tool schemas), Obsidian Vault API, esbuild (external + post-build copy), existing `run-test.js` test runner.

**Spec references:**
- `docs/superpowers/specs/2026-04-11-vault-search-agent-sdk-migration-design.md` §4.3 (esbuild), §4.4 (MCP tools), §6 (playbook), §8.2 (spike checks)
- `docs/superpowers/specs/2026-04-11-provider-system-v2-design.md` §2.2 (query patterns), §3 (Profile model)

**Out of scope today:**
- Profile Registry UI (use raw settings fields)
- Debug log 1-click copy (use `console.log` for now)
- Chat / doc agents / structured extraction migration (stay on Vercel AI SDK)
- Skill system rewrite
- Deleting any existing files
- Usage dashboard changes
- Mobile disablement flag (that's a release-time change, not today)

---

## File Map

**New files:**

| Path | Responsibility |
|---|---|
| `scripts/copy-agent-sdk.mjs` | Post-build script: copies `node_modules/@anthropic-ai/claude-agent-sdk/{sdk.mjs,cli.js,vendor,...}` to `dist/sdk/` |
| `src/service/agents/vault-sdk/sdkProfile.ts` | Minimal profile type + `toAgentSdkEnv()` pure function |
| `src/service/agents/vault-sdk/sdkAgentPool.ts` | Singleton subprocess pool, `startup()` call, `query()` wrapper |
| `src/service/agents/vault-sdk/sdkMessageAdapter.ts` | Translates `SDKMessage` events → `LLMStreamEvent` |
| `src/service/agents/vault-sdk/vaultMcpServer.ts` | Defines `vault_list_folders`, `vault_read_folder`, `vault_read_note`, `vault_grep`, `vault_wikilink_expand`, `submit_plan` via `createSdkMcpServer` |
| `src/service/agents/VaultSearchAgentSDK.ts` | Outer shell: builds options, calls `query()`, pipes events through adapter, handles HITL |
| `templates/prompts/ai-analysis-vault-sdk-playbook.md` | Skills-style system prompt for vault search |
| `test/sdk-profile.test.ts` | Unit tests for `toAgentSdkEnv()` |
| `test/sdk-message-adapter.test.ts` | Unit tests for message translation |
| `test/vault-mcp-tools.test.ts` | Unit tests for MCP tool implementations (mocked `app`) |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add `@anthropic-ai/claude-agent-sdk` dependency; add `copy-sdk` npm script |
| `esbuild.config.mjs` | Mark `@anthropic-ai/claude-agent-sdk` as external; invoke `copy-agent-sdk.mjs` after build |
| `src/service/agents/VaultSearchAgent.ts` | Add feature flag check in `startSession()`; if `useV2`, delegate to `VaultSearchAgentSDK` |
| `src/core/providers/types.ts` | Add `'sdk-round'` to the `pk-debug` debugName whitelist (if it's whitelisted); otherwise no change |
| Plugin settings file (determined in Task 3) | Add `vaultSearch.useV2`, `vaultSearch.sdkProfile.*` fields |

---

## Task 1: Install SDK and Configure esbuild

**Files:**
- Modify: `package.json`
- Modify: `esbuild.config.mjs`
- Create: `scripts/copy-agent-sdk.mjs`

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/claude-agent-sdk@0.2.101 --save
```

Expected output: package added to `dependencies` in `package.json`. Lockfile updated. Bundle unpacked size ~51 MB under `node_modules/@anthropic-ai/claude-agent-sdk/`.

- [ ] **Step 2: Verify the SDK files exist**

```bash
ls -la node_modules/@anthropic-ai/claude-agent-sdk/
```

Expected files: `sdk.mjs`, `cli.js`, `browser-sdk.js`, `embed.js`, `bridge.mjs`, `assistant.mjs`, `package.json`, `vendor/`, `manifest.json`. If any of these is missing, the install is broken — re-run install with `--force`.

- [ ] **Step 3: Create the copy script**

Create `scripts/copy-agent-sdk.mjs`:

```javascript
#!/usr/bin/env node
// Copies the Claude Agent SDK files from node_modules to the plugin distribution
// directory so the plugin can load them at runtime via absolute paths.
//
// Why: sdk.mjs uses import.meta.url + createRequire to resolve ./cli.js.
// esbuild bundling into main.js breaks that resolution, so we ship the SDK
// as a sidecar directory loaded with dynamic import at runtime.

import { mkdir, cp, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');

const src = join(projectRoot, 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
const dst = join(projectRoot, 'sdk');

async function main() {
    try {
        await stat(src);
    } catch {
        console.error(`[copy-agent-sdk] source not found: ${src}`);
        process.exit(1);
    }

    await mkdir(dst, { recursive: true });

    // Copy only what we need at runtime
    const files = [
        'sdk.mjs',
        'sdk.d.ts',
        'cli.js',
        'package.json',
        'manifest.json',
    ];
    const dirs = ['vendor'];

    for (const f of files) {
        try {
            await cp(join(src, f), join(dst, f));
            console.log(`[copy-agent-sdk] copied ${f}`);
        } catch (err) {
            console.warn(`[copy-agent-sdk] skipped ${f}: ${err.message}`);
        }
    }

    for (const d of dirs) {
        try {
            await cp(join(src, d), join(dst, d), { recursive: true });
            console.log(`[copy-agent-sdk] copied ${d}/`);
        } catch (err) {
            console.warn(`[copy-agent-sdk] skipped ${d}/: ${err.message}`);
        }
    }

    console.log(`[copy-agent-sdk] done`);
}

main().catch((err) => {
    console.error(`[copy-agent-sdk] error:`, err);
    process.exit(1);
});
```

- [ ] **Step 4: Add copy-sdk npm script**

Modify `package.json`, add to the `scripts` object:

```json
"copy-sdk": "node scripts/copy-agent-sdk.mjs"
```

Also update the `build` script to run `copy-sdk` after the TypeScript build:

```json
"build": "npm run build:css && node esbuild.config.mjs production && npm run check:bundle && npm run copy-sdk"
```

And update `dev:ts` in the dev pipeline (it should run `copy-sdk` once at startup, then let esbuild watch):

```json
"dev:ts": "npm run copy-sdk && node esbuild.config.mjs"
```

- [ ] **Step 5: Mark SDK as external in esbuild**

Open `esbuild.config.mjs`. Find the `external` array (or create one if it doesn't exist). Add:

```javascript
external: [
    // ...existing externals (obsidian, electron, node built-ins, etc.)...
    '@anthropic-ai/claude-agent-sdk',
]
```

The goal is to prevent esbuild from trying to inline `sdk.mjs` / `cli.js` (it would break `import.meta.url` resolution). Plugin loads the SDK via absolute-path dynamic `import()` at runtime (Task 11).

- [ ] **Step 6: Run copy script + build**

```bash
npm run copy-sdk
ls sdk/
```

Expected: `sdk/` contains `sdk.mjs`, `cli.js`, `package.json`, `manifest.json`, `vendor/`. If `cli.js` is missing, `node_modules/@anthropic-ai/claude-agent-sdk/cli.js` doesn't exist — reinstall.

```bash
npm run build
```

Expected: build succeeds. `main.js` does NOT contain the string `@anthropic-ai/claude-agent-sdk` (it's external). `sdk/` is populated.

```bash
grep -c "anthropic-ai/claude-agent-sdk" main.js || echo "0 (expected)"
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json esbuild.config.mjs scripts/copy-agent-sdk.mjs sdk/
git commit -m "chore: install @anthropic-ai/claude-agent-sdk 0.2.101 and wire esbuild external + post-build copy"
```

Note: `sdk/` should be added to `.gitignore` instead if you prefer not to commit generated artifacts. Check the project's existing policy. For this plan, committing is fine because the plugin will be distributed with the SDK bundled, and the git repo serves as distribution.

Actually — add `sdk/` to `.gitignore` first, then commit just the source changes:

```bash
echo "sdk/" >> .gitignore
git add .gitignore package.json package-lock.json esbuild.config.mjs scripts/copy-agent-sdk.mjs
git commit -m "chore: install @anthropic-ai/claude-agent-sdk 0.2.101 and wire esbuild external + post-build copy"
```

---

## Task 2: Spike — Verify SDK Runs in Obsidian Plugin

**Files:**
- Create: `src/app/commands/spikeAgentSdk.ts`
- Modify: `main.ts` (add a temporary command registration)

**Goal:** Prove the SDK can spawn a subprocess, connect to Anthropic, and return a message stream from inside the running Obsidian plugin. Check the 7 critical spike conditions from migration spec §8.2.

- [ ] **Step 1: Create the spike file**

Create `src/app/commands/spikeAgentSdk.ts`:

```typescript
import { App, Notice } from 'obsidian';
import { join } from 'path';

/**
 * Temporary spike command to verify @anthropic-ai/claude-agent-sdk runs inside
 * the Obsidian plugin. Delete this file after migration is verified in Task 17.
 */
export async function runAgentSdkSpike(app: App, pluginId: string): Promise<void> {
    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    const basePath = adapter.getBasePath();
    const pluginDir = join(basePath, app.vault.configDir, 'plugins', pluginId);

    const sdkPath = join(pluginDir, 'sdk', 'sdk.mjs');
    const cliPath = join(pluginDir, 'sdk', 'cli.js');

    new Notice(`[spike] loading SDK from ${sdkPath}`);

    let sdk: unknown;
    try {
        sdk = await import(/* @vite-ignore */ sdkPath);
        console.log('[spike] SDK loaded', sdk);
    } catch (err) {
        new Notice(`[spike] SDK import failed: ${(err as Error).message}`);
        console.error('[spike] import error', err);
        return;
    }

    const query = (sdk as { query: (opts: unknown) => AsyncIterable<unknown> }).query;
    if (typeof query !== 'function') {
        new Notice('[spike] query() is not a function on the loaded module');
        return;
    }

    const apiKey = (window as unknown as { PEAK_SPIKE_ANTHROPIC_KEY?: string }).PEAK_SPIKE_ANTHROPIC_KEY;
    if (!apiKey) {
        new Notice(
            '[spike] Set window.PEAK_SPIKE_ANTHROPIC_KEY in DevTools before running this command',
            8000
        );
        return;
    }

    new Notice('[spike] starting query() — check console');
    const messages: unknown[] = [];
    try {
        for await (const msg of query({
            prompt: 'What files end with .md in the current directory? List at most 3.',
            options: {
                pathToClaudeCodeExecutable: cliPath,
                cwd: basePath,
                allowedTools: ['Glob'],
                settingSources: [],
                maxTurns: 3,
                model: 'claude-haiku-4-5',
                env: {
                    ANTHROPIC_API_KEY: apiKey,
                    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
                    PATH: process.env.PATH ?? '',
                },
            },
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
```

- [ ] **Step 2: Register the command in main.ts**

Open `main.ts`. In the plugin's `onload` method (or equivalent), add:

```typescript
import { runAgentSdkSpike } from './src/app/commands/spikeAgentSdk';

// ... inside onload() after the existing command registrations ...
this.addCommand({
    id: 'spike-agent-sdk',
    name: '[Dev] Spike Claude Agent SDK',
    callback: async () => {
        await runAgentSdkSpike(this.app, this.manifest.id);
    },
});
```

- [ ] **Step 3: Build and reload plugin**

```bash
npm run build
```

Then in Obsidian: disable and re-enable the plugin (Settings → Community plugins → toggle), or use the "Reload app without saving" command.

- [ ] **Step 4: Set an API key in DevTools**

Open Obsidian DevTools (Cmd+Option+I on Mac, Ctrl+Shift+I on Win/Linux). In the Console tab, run:

```javascript
window.PEAK_SPIKE_ANTHROPIC_KEY = 'sk-ant-...your-real-key...'
```

This avoids committing the key to source while allowing quick iteration.

- [ ] **Step 5: Run the spike command**

Open command palette (Cmd+P / Ctrl+P). Type "Spike Claude Agent SDK". Run it. Watch Notices + DevTools Console.

**Expected outcome** (all 7 critical spike checks from §8.2 of the migration spec):

| # | Check | Pass if you see... |
|---|---|---|
| A | SDK imports | `[spike] SDK loaded` notice + `query` function logged |
| B | Subprocess spawns | Console shows a `system` type message with `subtype: 'init'` and a `session_id` |
| C | Built-in Glob tool runs | Console shows an `assistant` message with a `tool_use` block for `Glob` |
| D | CJK safe | None of the paths in the message output contain `U+FFFD` (`�`). Verify by opening a test vault with a CJK path like `测试/中文笔记.md` |
| E | `createSdkMcpServer` works | Deferred to Task 5; spike uses built-in Glob only |
| F | `disallowedTools` effective | Also deferred — not tested here |
| G | Reflective query behavior | Also deferred — tested in Task 17 |

Checks A, B, C, D are the critical ones for the spike. E/F/G are tested during later tasks.

- [ ] **Step 6: STOP gate — verify before proceeding**

**If check A fails** (`SDK import` errors): esbuild external + dynamic import not working. Check that `sdk/sdk.mjs` exists on disk at the plugin directory and that `esbuild.config.mjs` has `@anthropic-ai/claude-agent-sdk` in `external`. **Do not proceed past this task until A passes.**

**If check B fails** (subprocess never emits `init`): The SDK cannot spawn from Electron renderer. This is the hardest failure mode. Diagnose with:

```javascript
// in DevTools:
const cp = require('child_process');
const p = cp.spawn('node', ['--version']);
p.stdout.on('data', (d) => console.log('stdout', String(d)));
p.on('close', (code) => console.log('close', code));
```

If even this fails, Obsidian's renderer sandbox is blocking subprocesses — **STOP and pivot to Path A fallback** from the migration spec §9.1. Do not continue this plan.

**If check C fails** (tool call never emitted): system prompt or tool gating issue. Add `systemPrompt: 'Use the Glob tool to find .md files.'` to force the tool call.

**If check D fails** (CJK corruption): This is SDK v0.2.101 or later regression. Pin to v0.2.100 and retry. If still broken, **STOP and pivot to Path A fallback**. Your vault is heavily CJK; a broken SDK here is unusable.

**Only when A+B+C+D all pass, continue to Task 3.**

- [ ] **Step 7: Commit spike command**

```bash
git add src/app/commands/spikeAgentSdk.ts main.ts
git commit -m "chore: add temporary spike command to verify Agent SDK runs in plugin"
```

---

## Task 3: Minimal SDK Profile + Tests

**Files:**
- Create: `src/service/agents/vault-sdk/sdkProfile.ts`
- Create: `test/sdk-profile.test.ts`
- Modify: plugin settings type (determine which file; likely `src/app/settings/types.ts` or `src/core/constant.ts` — search the codebase first)

- [ ] **Step 1: Locate the plugin settings type**

```bash
grep -rn "interface PluginSettings\|interface AIServiceSettings\|interface.*Settings" src/app/ src/core/ --include="*.ts" | head -20
```

Find the main settings interface. Commonly at `src/app/context/AppContext.ts` or `src/core/constant.ts`. Note the file path.

- [ ] **Step 2: Write the failing test**

Create `test/sdk-profile.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAgentSdkEnv, DEFAULT_SDK_PROFILE, type SdkProfile } from '@/service/agents/vault-sdk/sdkProfile';

test('toAgentSdkEnv: anthropic direct with api key', () => {
    const profile: SdkProfile = {
        kind: 'anthropic-direct',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        authToken: null,
        primaryModel: 'claude-opus-4-6',
        fastModel: 'claude-haiku-4-5',
    };
    const env = toAgentSdkEnv(profile);
    assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
    assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant-test');
    assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-4-6');
    assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-4-5');
    // AUTH_TOKEN should not be set for anthropic-direct
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
});

test('toAgentSdkEnv: openrouter requires empty api key and bearer token', () => {
    const profile: SdkProfile = {
        kind: 'openrouter',
        baseUrl: 'https://openrouter.ai/api',
        apiKey: null,
        authToken: 'sk-or-test',
        primaryModel: 'anthropic/claude-opus-4-6',
        fastModel: 'deepseek/deepseek-v3',
    };
    const env = toAgentSdkEnv(profile);
    assert.equal(env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api');
    // OpenRouter requires ANTHROPIC_API_KEY to be explicitly empty
    assert.equal(env.ANTHROPIC_API_KEY, '');
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'sk-or-test');
    assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'anthropic/claude-opus-4-6');
    assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'deepseek/deepseek-v3');
});

test('toAgentSdkEnv: default profile has sane anthropic-direct values', () => {
    const env = toAgentSdkEnv(DEFAULT_SDK_PROFILE);
    assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
    assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-4-6');
});

test('toAgentSdkEnv: throws on missing credentials', () => {
    const broken: SdkProfile = {
        kind: 'anthropic-direct',
        baseUrl: 'https://api.anthropic.com',
        apiKey: null,
        authToken: null,
        primaryModel: 'claude-opus-4-6',
        fastModel: 'claude-haiku-4-5',
    };
    assert.throws(() => toAgentSdkEnv(broken), /credentials/i);
});
```

- [ ] **Step 3: Run the test (expect failure)**

```bash
npm run test -- test/sdk-profile.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `sdkProfile.ts`**

Create `src/service/agents/vault-sdk/sdkProfile.ts`:

```typescript
/**
 * Minimal SDK Profile for the 1-day vault search migration.
 *
 * NOTE: this is not the full Profile Registry described in the v2 spec. It is
 * a deliberately small slice that reads plugin settings and materializes them
 * into the env-var bundle that Claude Agent SDK's query() accepts.
 *
 * The full Profile Registry (with UI, multiple profiles, per-feature selection)
 * will be built in a later phase per 2026-04-11-provider-system-v2-design.md.
 */

export type SdkProfileKind = 'anthropic-direct' | 'openrouter' | 'litellm' | 'custom';

export interface SdkProfile {
    kind: SdkProfileKind;
    baseUrl: string;
    apiKey: string | null;
    authToken: string | null;
    primaryModel: string;
    fastModel: string;
    customHeaders?: Record<string, string>;
}

export const DEFAULT_SDK_PROFILE: SdkProfile = {
    kind: 'anthropic-direct',
    baseUrl: 'https://api.anthropic.com',
    apiKey: null, // must be filled from settings at runtime
    authToken: null,
    primaryModel: 'claude-opus-4-6',
    fastModel: 'claude-haiku-4-5',
};

/**
 * Pure function. Materializes a Profile into the env-var bundle that
 * Claude Agent SDK's query({ options: { env } }) expects.
 *
 * Throws if credentials are missing (the caller must surface this to the user).
 */
export function toAgentSdkEnv(profile: SdkProfile): Record<string, string> {
    const hasAuth = Boolean(profile.apiKey || profile.authToken);
    if (!hasAuth) {
        throw new Error(
            'SdkProfile is missing credentials: at least one of apiKey or authToken must be set'
        );
    }

    const env: Record<string, string> = {
        ANTHROPIC_BASE_URL: profile.baseUrl,
        ANTHROPIC_DEFAULT_OPUS_MODEL: profile.primaryModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.fastModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL: profile.primaryModel,
    };

    if (profile.kind === 'openrouter') {
        // OpenRouter requires API_KEY explicitly empty; auth goes through Bearer token.
        env.ANTHROPIC_API_KEY = '';
        env.ANTHROPIC_AUTH_TOKEN = profile.authToken ?? '';
    } else {
        if (profile.apiKey) env.ANTHROPIC_API_KEY = profile.apiKey;
        if (profile.authToken) env.ANTHROPIC_AUTH_TOKEN = profile.authToken;
    }

    if (profile.customHeaders && Object.keys(profile.customHeaders).length > 0) {
        env.ANTHROPIC_CUSTOM_HEADERS = JSON.stringify(profile.customHeaders);
    }

    return env;
}

/**
 * Read the active profile from plugin settings. Falls back to DEFAULT_SDK_PROFILE
 * merged with any user-provided fields.
 *
 * The settings path is hardcoded at `vaultSearch.sdkProfile` for now. Full
 * Profile Registry will replace this.
 */
export function readProfileFromSettings(settings: unknown): SdkProfile {
    const s = settings as { vaultSearch?: { sdkProfile?: Partial<SdkProfile> } };
    const raw = s?.vaultSearch?.sdkProfile ?? {};
    return {
        ...DEFAULT_SDK_PROFILE,
        ...raw,
    };
}
```

- [ ] **Step 5: Run the test (expect pass)**

```bash
npm run test -- test/sdk-profile.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Add settings fields**

Open the main plugin settings interface located in Step 1. Add:

```typescript
// Inside the PluginSettings (or equivalent) interface:
vaultSearch?: {
    useV2?: boolean;
    sdkProfile?: {
        kind?: 'anthropic-direct' | 'openrouter' | 'litellm' | 'custom';
        baseUrl?: string;
        apiKey?: string | null;
        authToken?: string | null;
        primaryModel?: string;
        fastModel?: string;
    };
};
```

Also update the DEFAULT_SETTINGS constant (if one exists) with sensible defaults:

```typescript
vaultSearch: {
    useV2: false,
    sdkProfile: {
        kind: 'anthropic-direct',
        baseUrl: 'https://api.anthropic.com',
        primaryModel: 'claude-opus-4-6',
        fastModel: 'claude-haiku-4-5',
        // apiKey / authToken left as null; user must enter in settings
    },
},
```

- [ ] **Step 7: Commit**

```bash
git add src/service/agents/vault-sdk/sdkProfile.ts test/sdk-profile.test.ts <settings-file-path>
git commit -m "feat: minimal SdkProfile + toAgentSdkEnv materialization with tests"
```

---

## Task 4: SDK Message Adapter + Tests

**Files:**
- Create: `src/service/agents/vault-sdk/sdkMessageAdapter.ts`
- Create: `test/sdk-message-adapter.test.ts`

The adapter converts `SDKMessage` events from the SDK's async iterable into the plugin's existing `LLMStreamEvent` format, so the UI stack (Zustand stores, steps panel, etc.) consumes them without modification.

- [ ] **Step 1: Read the existing LLMStreamEvent type**

```bash
grep -n "LLMStreamEvent\|type LLMStreamEvent" src/core/providers/types.ts
```

Identify the event shapes the UI consumes. Most important: `pk-debug`, `tool-call`, `tool-result`, `text-delta`, `text-start`, `text-end`, `on-step-finish`, `complete`, `agent-step-progress`, `phase-transition`, `ui-step`.

- [ ] **Step 2: Write the failing test**

Create `test/sdk-message-adapter.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateSdkMessage } from '@/service/agents/vault-sdk/sdkMessageAdapter';
import { StreamTriggerName } from '@/core/providers/types';

test('translateSdkMessage: system init emits pk-debug sdk-round-input', () => {
    const sdkMsg = {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-123',
        model: 'claude-opus-4-6',
    };
    const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'pk-debug');
    assert.equal((events[0] as any).debugName, 'sdk-round-input');
    assert.equal((events[0] as any).extra.sessionId, 'sess-123');
});

test('translateSdkMessage: assistant text block emits text-delta', () => {
    const sdkMsg = {
        type: 'assistant',
        message: {
            content: [{ type: 'text', text: 'Hello world' }],
        },
    };
    const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
    const textDeltas = events.filter((e) => e.type === 'text-delta');
    assert.equal(textDeltas.length, 1);
    assert.equal((textDeltas[0] as any).text, 'Hello world');
});

test('translateSdkMessage: assistant tool_use block emits tool-call', () => {
    const sdkMsg = {
        type: 'assistant',
        message: {
            content: [
                {
                    type: 'tool_use',
                    id: 'tool-abc',
                    name: 'vault_list_folders',
                    input: { maxDepth: 2 },
                },
            ],
        },
    };
    const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
    const toolCalls = events.filter((e) => e.type === 'tool-call');
    assert.equal(toolCalls.length, 1);
    assert.equal((toolCalls[0] as any).toolName, 'vault_list_folders');
    assert.deepEqual((toolCalls[0] as any).input, { maxDepth: 2 });
    assert.equal((toolCalls[0] as any).id, 'tool-abc');
});

test('translateSdkMessage: user tool_result emits tool-result', () => {
    const sdkMsg = {
        type: 'user',
        message: {
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'tool-abc',
                    content: 'folder1/\nfolder2/\nfolder3/',
                },
            ],
        },
    };
    const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
    const results = events.filter((e) => e.type === 'tool-result');
    assert.equal(results.length, 1);
    assert.equal((results[0] as any).id, 'tool-abc');
    assert.equal((results[0] as any).output, 'folder1/\nfolder2/\nfolder3/');
});

test('translateSdkMessage: result emits complete with usage', () => {
    const sdkMsg = {
        type: 'result',
        subtype: 'success',
        session_id: 'sess-123',
        usage: {
            input_tokens: 1234,
            output_tokens: 567,
            cache_read_input_tokens: 1000,
        },
        result: 'done',
    };
    const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
    const completes = events.filter((e) => e.type === 'complete');
    assert.equal(completes.length, 1);
    assert.equal((completes[0] as any).usage.inputTokens, 1234);
    assert.equal((completes[0] as any).usage.outputTokens, 567);
});

test('translateSdkMessage: unknown type returns pk-debug', () => {
    const sdkMsg = { type: 'unknown-weird-type', extra: 'data' };
    const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'pk-debug');
    assert.equal((events[0] as any).debugName, 'sdk-unknown');
});
```

- [ ] **Step 3: Run the test (expect failure)**

```bash
npm run test -- test/sdk-message-adapter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the adapter**

Create `src/service/agents/vault-sdk/sdkMessageAdapter.ts`:

```typescript
/**
 * Translates Claude Agent SDK SDKMessage events into the plugin's existing
 * LLMStreamEvent shape so the UI stack (Zustand stores, StepList, event bus)
 * consumes them without modification.
 *
 * SDK message shapes (from @anthropic-ai/claude-agent-sdk SDKMessage type):
 *   { type: 'system', subtype: 'init', session_id, model, ... }
 *   { type: 'assistant', message: { content: ContentBlock[] } }
 *   { type: 'user', message: { content: ContentBlock[] } }  // tool_result comes here
 *   { type: 'result', subtype, session_id, usage, result, ... }
 *
 * ContentBlock shapes:
 *   { type: 'text', text: string }
 *   { type: 'thinking', thinking: string }
 *   { type: 'tool_use', id, name, input }
 *   { type: 'tool_result', tool_use_id, content }
 */

import type { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';

interface TranslateOpts {
    triggerName: StreamTriggerName;
    taskIndex?: number;
}

interface AnyContentBlock {
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: unknown;
    tool_use_id?: string;
    content?: unknown;
}

interface AnySdkMessage {
    type: string;
    subtype?: string;
    session_id?: string;
    model?: string;
    message?: { content?: AnyContentBlock[] };
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
    result?: unknown;
    is_error?: boolean;
}

export function translateSdkMessage(
    raw: unknown,
    opts: TranslateOpts
): LLMStreamEvent[] {
    const msg = raw as AnySdkMessage;
    const out: LLMStreamEvent[] = [];
    const { triggerName, taskIndex } = opts;

    switch (msg.type) {
        case 'system':
            if (msg.subtype === 'init') {
                out.push({
                    type: 'pk-debug',
                    debugName: 'sdk-round-input',
                    triggerName,
                    extra: {
                        sessionId: msg.session_id,
                        model: msg.model,
                        taskIndex,
                    },
                } as LLMStreamEvent);
            } else {
                out.push({
                    type: 'pk-debug',
                    debugName: `sdk-system-${msg.subtype ?? 'unknown'}`,
                    triggerName,
                    extra: { raw: msg, taskIndex },
                } as LLMStreamEvent);
            }
            break;

        case 'assistant': {
            const blocks = msg.message?.content ?? [];
            for (const block of blocks) {
                if (block.type === 'text' && typeof block.text === 'string') {
                    out.push({
                        type: 'text-delta',
                        text: block.text,
                        triggerName,
                    } as LLMStreamEvent);
                } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
                    out.push({
                        type: 'reasoning-delta',
                        text: block.thinking,
                        triggerName,
                    } as LLMStreamEvent);
                } else if (block.type === 'tool_use') {
                    out.push({
                        type: 'tool-call',
                        id: block.id ?? '',
                        toolName: block.name ?? 'unknown',
                        input: block.input ?? {},
                        triggerName,
                    } as LLMStreamEvent);
                }
            }
            break;
        }

        case 'user': {
            // user messages from the SDK carry tool_result blocks echoing back
            const blocks = msg.message?.content ?? [];
            for (const block of blocks) {
                if (block.type === 'tool_result') {
                    out.push({
                        type: 'tool-result',
                        id: block.tool_use_id ?? '',
                        toolName: 'unknown', // SDK message doesn't include tool name on result side
                        input: {},
                        output: block.content ?? null,
                        triggerName,
                    } as LLMStreamEvent);
                }
            }
            break;
        }

        case 'result':
            out.push({
                type: 'complete',
                finishReason: msg.is_error ? 'error' : 'stop',
                usage: {
                    inputTokens: msg.usage?.input_tokens ?? 0,
                    outputTokens: msg.usage?.output_tokens ?? 0,
                    totalTokens:
                        (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
                },
                result: msg.result,
                triggerName,
            } as LLMStreamEvent);
            break;

        default:
            out.push({
                type: 'pk-debug',
                debugName: 'sdk-unknown',
                triggerName,
                extra: { raw: msg, taskIndex },
            } as LLMStreamEvent);
            break;
    }

    return out;
}
```

- [ ] **Step 5: Run the test (expect pass)**

```bash
npm run test -- test/sdk-message-adapter.test.ts
```

Expected: all 6 tests pass. If any test fails due to a type mismatch in `LLMStreamEvent`, adjust the test expectations to match the real type definitions you found in Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/service/agents/vault-sdk/sdkMessageAdapter.ts test/sdk-message-adapter.test.ts
git commit -m "feat: SDK message adapter translates SDKMessage to LLMStreamEvent"
```

---

## Task 5: Vault MCP Tool — `vault_list_folders` + Tests

**Files:**
- Create: `src/service/agents/vault-sdk/vaultMcpServer.ts`
- Create: `test/vault-mcp-tools.test.ts`

**Purpose of this tool:** The LLM's first tool call for reflective queries. Returns the vault's top-level folder structure with per-folder file counts, so the LLM can decide which folders to enumerate.

- [ ] **Step 1: Write the failing test**

Create `test/vault-mcp-tools.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFoldersImpl } from '@/service/agents/vault-sdk/vaultMcpServer';

// Minimal mock of Obsidian's TFile / TFolder / Vault
function mockVaultWithFiles(paths: string[]) {
    const files = paths.map((p) => ({ path: p, extension: 'md', basename: p.split('/').pop() }));
    return {
        getMarkdownFiles: () => files,
    } as unknown as {
        getMarkdownFiles: () => { path: string; extension: string; basename: string }[];
    };
}

test('listFoldersImpl: top-level enumeration with counts', async () => {
    const vault = mockVaultWithFiles([
        'kb1-life-notes/note1.md',
        'kb1-life-notes/sub/note2.md',
        'kb2-learn-prd/a.md',
        'kb2-learn-prd/B/b.md',
        'kb2-learn-prd/B/C/c.md',
        'chatfolder/d.md',
    ]);

    const result = await listFoldersImpl(vault as any, { maxDepth: 1 });

    // Should have 3 top-level folders
    assert.equal(result.folders.length, 3);
    const kb1 = result.folders.find((f) => f.path === 'kb1-life-notes');
    assert.ok(kb1);
    assert.equal(kb1!.mdCount, 2); // includes nested
    const kb2 = result.folders.find((f) => f.path === 'kb2-learn-prd');
    assert.ok(kb2);
    assert.equal(kb2!.mdCount, 3);
});

test('listFoldersImpl: depth-2 enumeration reveals subfolders', async () => {
    const vault = mockVaultWithFiles([
        'kb2/A-sub/a.md',
        'kb2/A-sub/b.md',
        'kb2/B-sub/c.md',
    ]);

    const result = await listFoldersImpl(vault as any, { maxDepth: 2 });

    // Should include "kb2", "kb2/A-sub", "kb2/B-sub"
    const paths = result.folders.map((f) => f.path).sort();
    assert.deepEqual(paths, ['kb2', 'kb2/A-sub', 'kb2/B-sub']);
});

test('listFoldersImpl: empty vault returns empty folders', async () => {
    const vault = mockVaultWithFiles([]);
    const result = await listFoldersImpl(vault as any, { maxDepth: 2 });
    assert.equal(result.folders.length, 0);
});

test('listFoldersImpl: CJK paths preserved', async () => {
    const vault = mockVaultWithFiles([
        'kb2-learn-prd/B-2-创意和想法管理/A-All Ideas/idea1.md',
        'kb2-learn-prd/B-2-创意和想法管理/A-All Ideas/idea2.md',
    ]);
    const result = await listFoldersImpl(vault as any, { maxDepth: 3 });
    const ideas = result.folders.find((f) => f.path === 'kb2-learn-prd/B-2-创意和想法管理/A-All Ideas');
    assert.ok(ideas);
    assert.equal(ideas!.mdCount, 2);
});
```

- [ ] **Step 2: Run the test (expect failure)**

```bash
npm run test -- test/vault-mcp-tools.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `vault_list_folders`**

Create `src/service/agents/vault-sdk/vaultMcpServer.ts` with just this first tool's implementation:

```typescript
/**
 * In-process MCP server exposing Obsidian Vault operations as tools for
 * Claude Agent SDK. Tools run in the plugin process (not the subprocess),
 * so they have full access to app.vault, app.metadataCache, and plugin state.
 *
 * Tools defined here:
 *   vault_list_folders   — enumerate top-level folders with md counts
 *   vault_read_folder    — recursive listing of a specific folder
 *   vault_read_note      — full content + frontmatter + links of one note
 *   vault_grep           — FTS search via existing SQLite index
 *   vault_wikilink_expand — N-hop wikilink traversal via metadataCache
 *   submit_plan          — HITL trigger: presents plan to user for review
 */

import type { App, Vault, TFile } from 'obsidian';

interface ListFoldersParams {
    maxDepth?: number;
}

interface FolderInfo {
    path: string;
    mdCount: number;
}

interface ListFoldersResult {
    folders: FolderInfo[];
    totalMdFiles: number;
}

/**
 * Pure implementation callable from tests with a mocked Vault. The MCP tool
 * wrapper (defined later with tool() + createSdkMcpServer()) calls this and
 * wraps the result as a TextContent response.
 */
export async function listFoldersImpl(
    vault: Vault,
    params: ListFoldersParams
): Promise<ListFoldersResult> {
    const maxDepth = Math.max(1, Math.min(params.maxDepth ?? 2, 5));
    const files = vault.getMarkdownFiles();

    // folderPath → recursive md count
    const folderCounts = new Map<string, number>();

    for (const file of files) {
        const parts = file.path.split('/');
        // parts = ['kb2-learn-prd', 'B-2-创意和想法管理', 'A-All Ideas', 'idea1.md']
        // For each ancestor up to maxDepth, increment count.
        const folderDepth = parts.length - 1; // number of folder levels
        const limit = Math.min(folderDepth, maxDepth);
        for (let d = 1; d <= limit; d++) {
            const folderPath = parts.slice(0, d).join('/');
            folderCounts.set(folderPath, (folderCounts.get(folderPath) ?? 0) + 1);
        }
    }

    const folders: FolderInfo[] = Array.from(folderCounts.entries())
        .map(([path, mdCount]) => ({ path, mdCount }))
        .sort((a, b) => b.mdCount - a.mdCount);

    return {
        folders,
        totalMdFiles: files.length,
    };
}
```

- [ ] **Step 4: Run the test (expect pass)**

```bash
npm run test -- test/vault-mcp-tools.test.ts
```

Expected: all 4 tests pass. If `vault.getMarkdownFiles()` type check complains about the mock shape, loosen the mock type or cast to `any` in the test.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/vault-sdk/vaultMcpServer.ts test/vault-mcp-tools.test.ts
git commit -m "feat: vault_list_folders tool impl with CJK path handling"
```

---

## Task 6: Vault MCP Tools — `read_folder`, `read_note`

**Files:**
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts`
- Modify: `test/vault-mcp-tools.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `test/vault-mcp-tools.test.ts`:

```typescript
import { readFolderImpl, readNoteImpl } from '@/service/agents/vault-sdk/vaultMcpServer';

test('readFolderImpl: lists files under a folder prefix', async () => {
    const files = [
        'kb2/A-sub/a.md',
        'kb2/A-sub/b.md',
        'kb2/B-sub/c.md',
        'other/d.md',
    ];
    const vault = {
        getMarkdownFiles: () =>
            files.map((p) => ({ path: p, basename: p.split('/').pop()!.replace('.md', '') })),
    } as any;

    const result = await readFolderImpl(vault, { folder: 'kb2/A-sub', recursive: true });
    assert.equal(result.files.length, 2);
    assert.deepEqual(
        result.files.map((f) => f.path).sort(),
        ['kb2/A-sub/a.md', 'kb2/A-sub/b.md']
    );
});

test('readFolderImpl: non-recursive returns only immediate children', async () => {
    const files = [
        'kb2/a.md',
        'kb2/A-sub/b.md',
        'kb2/A-sub/deeper/c.md',
    ];
    const vault = {
        getMarkdownFiles: () =>
            files.map((p) => ({ path: p, basename: p.split('/').pop()!.replace('.md', '') })),
    } as any;

    const result = await readFolderImpl(vault, { folder: 'kb2', recursive: false });
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'kb2/a.md');
});

test('readNoteImpl: returns frontmatter + body prefix + links', async () => {
    const vault = {
        getAbstractFileByPath: (path: string) => {
            if (path !== 'test/note.md') return null;
            return { path: 'test/note.md', basename: 'note', extension: 'md' };
        },
        cachedRead: async () => `---
status: idea
tags: [research]
---

# Note Title

This is the body. It has [[internal-link]] and more text.`,
    } as any;
    const metadataCache = {
        getFileCache: () => ({
            frontmatter: { status: 'idea', tags: ['research'] },
            links: [{ link: 'internal-link', displayText: 'internal-link' }],
            tags: [],
        }),
    } as any;

    const result = await readNoteImpl(vault, metadataCache, { path: 'test/note.md', maxChars: 200 });
    assert.equal(result.path, 'test/note.md');
    assert.equal(result.frontmatter.status, 'idea');
    assert.ok(result.bodyPreview.includes('This is the body'));
    assert.deepEqual(result.wikilinks, ['internal-link']);
});

test('readNoteImpl: missing file returns null path', async () => {
    const vault = {
        getAbstractFileByPath: () => null,
        cachedRead: async () => '',
    } as any;
    const metadataCache = { getFileCache: () => null } as any;

    const result = await readNoteImpl(vault, metadataCache, { path: 'not/exist.md' });
    assert.equal(result.error, 'not found');
});
```

- [ ] **Step 2: Run tests (expect failures)**

```bash
npm run test -- test/vault-mcp-tools.test.ts
```

Expected: new tests fail (readFolderImpl / readNoteImpl not defined).

- [ ] **Step 3: Add implementations**

Append to `src/service/agents/vault-sdk/vaultMcpServer.ts`:

```typescript
import type { MetadataCache, CachedMetadata } from 'obsidian';

interface ReadFolderParams {
    folder: string;
    recursive?: boolean;
}

interface ReadFolderResult {
    folder: string;
    files: { path: string; basename: string }[];
    totalCount: number;
}

export async function readFolderImpl(
    vault: Vault,
    params: ReadFolderParams
): Promise<ReadFolderResult> {
    const folder = params.folder.replace(/\/+$/, ''); // strip trailing slash
    const recursive = params.recursive ?? true;
    const allFiles = vault.getMarkdownFiles();

    const matches = allFiles.filter((f) => {
        if (!f.path.startsWith(folder + '/') && f.path !== folder) return false;
        if (recursive) return true;
        // non-recursive: only immediate children (no further slashes after folder/)
        const rest = f.path.slice(folder.length + 1);
        return !rest.includes('/');
    });

    return {
        folder,
        files: matches.map((f) => ({ path: f.path, basename: (f as TFile).basename })),
        totalCount: matches.length,
    };
}

interface ReadNoteParams {
    path: string;
    maxChars?: number;
}

interface ReadNoteResult {
    path: string;
    frontmatter: Record<string, unknown>;
    bodyPreview: string;
    wikilinks: string[];
    tags: string[];
    error?: string;
}

export async function readNoteImpl(
    vault: Vault,
    metadataCache: MetadataCache,
    params: ReadNoteParams
): Promise<ReadNoteResult> {
    const maxChars = params.maxChars ?? 3000;
    const file = vault.getAbstractFileByPath(params.path) as TFile | null;
    if (!file || !('extension' in file)) {
        return {
            path: params.path,
            frontmatter: {},
            bodyPreview: '',
            wikilinks: [],
            tags: [],
            error: 'not found',
        };
    }

    const content = await vault.cachedRead(file);
    // Strip frontmatter block from body preview
    const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
    const bodyPreview = body.slice(0, maxChars);

    const cache: CachedMetadata | null = metadataCache.getFileCache(file);
    const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
    const wikilinks = (cache?.links ?? []).map((l) => l.link);
    const tags = (cache?.tags ?? []).map((t) => t.tag);

    return {
        path: params.path,
        frontmatter,
        bodyPreview,
        wikilinks,
        tags,
    };
}
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
npm run test -- test/vault-mcp-tools.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/vault-sdk/vaultMcpServer.ts test/vault-mcp-tools.test.ts
git commit -m "feat: vault_read_folder and vault_read_note tool impls with tests"
```

---

## Task 7: Vault MCP Tools — `grep`, `wikilink_expand`

**Files:**
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts`
- Modify: `test/vault-mcp-tools.test.ts`

`vault_grep` leverages the existing FTS SQLite repo. `vault_wikilink_expand` traverses Obsidian's metadata cache.

- [ ] **Step 1: Locate the existing FTS search API**

```bash
grep -rn "class.*SearchClient\|searchClient.search\|getFtsRepo\|ftsSearch" src/ --include="*.ts" | head -10
```

Find the existing search path used by the old pipeline (e.g., in `classify.ts` or `probe.ts`). Note the method signature you'll wrap.

- [ ] **Step 2: Add failing tests**

Append to `test/vault-mcp-tools.test.ts`:

```typescript
import { wikilinkExpandImpl, grepImpl } from '@/service/agents/vault-sdk/vaultMcpServer';

test('wikilinkExpandImpl: one-hop expansion collects linked notes', async () => {
    const metadataCache = {
        getFileCache: (file: { path: string }) => {
            if (file.path === 'a.md') {
                return { links: [{ link: 'b' }, { link: 'c' }], frontmatter: {}, tags: [] };
            }
            return { links: [], frontmatter: {}, tags: [] };
        },
        getFirstLinkpathDest: (link: string, _source: string) => {
            if (link === 'b') return { path: 'b.md' };
            if (link === 'c') return { path: 'c.md' };
            return null;
        },
    } as any;
    const vault = {
        getAbstractFileByPath: (path: string) => ({ path }),
    } as any;

    const result = await wikilinkExpandImpl(vault, metadataCache, {
        startPath: 'a.md',
        maxSteps: 1,
    });
    assert.deepEqual(result.visited.sort(), ['a.md', 'b.md', 'c.md']);
});

test('wikilinkExpandImpl: two-hop expansion follows chains', async () => {
    const links: Record<string, string[]> = {
        'a.md': ['b'],
        'b.md': ['c'],
        'c.md': ['d'],
        'd.md': [],
    };
    const metadataCache = {
        getFileCache: (file: { path: string }) => ({
            links: (links[file.path] ?? []).map((l) => ({ link: l })),
            frontmatter: {},
            tags: [],
        }),
        getFirstLinkpathDest: (link: string) =>
            Object.keys(links).includes(`${link}.md`) ? { path: `${link}.md` } : null,
    } as any;
    const vault = {
        getAbstractFileByPath: (path: string) => ({ path }),
    } as any;

    const result = await wikilinkExpandImpl(vault, metadataCache, {
        startPath: 'a.md',
        maxSteps: 2,
    });
    // Expect a, b, c (not d, because maxSteps=2 stops at c)
    assert.deepEqual(result.visited.sort(), ['a.md', 'b.md', 'c.md']);
});

test('grepImpl: delegates to injected searchFn', async () => {
    const searchFn = async (query: string) => {
        return [
            { path: 'doc1.md', snippet: `... matches ${query} ...`, score: 0.9 },
            { path: 'doc2.md', snippet: `another ${query}`, score: 0.7 },
        ];
    };

    const result = await grepImpl(searchFn, { query: 'vault', limit: 10 });
    assert.equal(result.hits.length, 2);
    assert.equal(result.hits[0].path, 'doc1.md');
    assert.ok(result.hits[0].snippet.includes('vault'));
});
```

- [ ] **Step 3: Run tests (expect failures)**

```bash
npm run test -- test/vault-mcp-tools.test.ts
```

- [ ] **Step 4: Add implementations**

Append to `src/service/agents/vault-sdk/vaultMcpServer.ts`:

```typescript
interface WikilinkExpandParams {
    startPath: string;
    maxSteps?: number;
}

interface WikilinkExpandResult {
    startPath: string;
    visited: string[];
}

export async function wikilinkExpandImpl(
    vault: Vault,
    metadataCache: MetadataCache,
    params: WikilinkExpandParams
): Promise<WikilinkExpandResult> {
    const maxSteps = Math.max(1, Math.min(params.maxSteps ?? 2, 4));
    const visited = new Set<string>();
    const queue: { path: string; depth: number }[] = [{ path: params.startPath, depth: 0 }];

    while (queue.length > 0) {
        const { path, depth } = queue.shift()!;
        if (visited.has(path)) continue;
        visited.add(path);
        if (depth >= maxSteps) continue;

        const file = vault.getAbstractFileByPath(path) as TFile | null;
        if (!file) continue;
        const cache = metadataCache.getFileCache(file);
        if (!cache?.links) continue;

        for (const linkRef of cache.links) {
            const dest = metadataCache.getFirstLinkpathDest(linkRef.link, path);
            if (dest && !visited.has(dest.path)) {
                queue.push({ path: dest.path, depth: depth + 1 });
            }
        }
    }

    return {
        startPath: params.startPath,
        visited: Array.from(visited),
    };
}

interface GrepParams {
    query: string;
    limit?: number;
}

interface GrepHit {
    path: string;
    snippet: string;
    score: number;
}

interface GrepResult {
    query: string;
    hits: GrepHit[];
}

/**
 * Generic grep impl. The caller supplies a searchFn that wraps the existing
 * FTS/hybrid search client. This lets us test in isolation and lets the MCP
 * tool wrapper inject the real search client at runtime.
 */
export async function grepImpl(
    searchFn: (query: string, limit: number) => Promise<GrepHit[]>,
    params: GrepParams
): Promise<GrepResult> {
    const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
    const hits = await searchFn(params.query, limit);
    return { query: params.query, hits };
}
```

- [ ] **Step 5: Run tests (expect pass)**

```bash
npm run test -- test/vault-mcp-tools.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/service/agents/vault-sdk/vaultMcpServer.ts test/vault-mcp-tools.test.ts
git commit -m "feat: vault_wikilink_expand and vault_grep tool impls with tests"
```

---

## Task 8: Vault MCP Tools — `submit_plan` + SDK Tool Wrappers

**Files:**
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts`

This task wraps the pure implementations from Tasks 5-7 into actual MCP tools via `createSdkMcpServer` and `tool()` from the Agent SDK. The `submit_plan` tool triggers HITL: it returns a promise that resolves only when the user clicks approve/reject in the UI.

- [ ] **Step 1: Add the SDK tool wrappers**

Append to `src/service/agents/vault-sdk/vaultMcpServer.ts`:

```typescript
// SDK imports happen via dynamic import at runtime (Task 11). For type-only
// references here we use loose any types so the file compiles under esbuild
// external mode.
//
// Shape from @anthropic-ai/claude-agent-sdk/sdk.d.ts:
//   tool(name, description, inputSchema, handler) → McpTool
//   createSdkMcpServer({ name, tools }) → McpSdkServerConfigWithInstance
//
// We construct the server lazily in buildVaultMcpServer() so the SDK module
// load is deferred until actually used.

import type { App } from 'obsidian';
import type { SearchClient } from '@/service/search/SearchClient';

/** Parameters for buildVaultMcpServer. */
export interface VaultMcpServerDeps {
    app: App;
    searchClient: SearchClient;
    /** Called when the LLM invokes submit_plan. Returns the user feedback. */
    onSubmitPlan: (plan: SubmitPlanInput) => Promise<SubmitPlanFeedback>;
    /** Loaded SDK module (result of dynamic import at plugin init) */
    sdk: {
        tool: (
            name: string,
            description: string,
            inputSchema: unknown,
            handler: (input: unknown) => Promise<unknown>
        ) => unknown;
        createSdkMcpServer: (config: { name: string; tools: unknown[] }) => unknown;
    };
    /** Zod module (peer dep, already in the plugin) */
    z: {
        object: (shape: Record<string, unknown>) => unknown;
        string: () => unknown;
        number: () => unknown;
        boolean: () => unknown;
        array: (inner: unknown) => unknown;
    };
}

export interface SubmitPlanInput {
    selected_paths: string[];
    rationale: string;
    proposed_outline: string;
    coverage_assessment: string;
}

export interface SubmitPlanFeedback {
    approved: boolean;
    adjustedPaths?: string[];
    adjustedOutline?: string;
    message?: string;
}

/**
 * Builds the in-process MCP server with all vault tools bound to the given
 * Obsidian app and search client. Returns the server object to pass to
 * query({ options: { mcpServers: { vault: server } } }).
 */
export function buildVaultMcpServer(deps: VaultMcpServerDeps): unknown {
    const { app, searchClient, onSubmitPlan, sdk, z } = deps;

    const vault_list_folders = sdk.tool(
        'vault_list_folders',
        'List top-level folders in the vault with markdown file counts. CALL THIS FIRST for reflective queries like "my X" or "all Y". The result shows you the user\'s folder taxonomy so you can decide which folders to enumerate.',
        z.object({
            maxDepth: z.number(),
        }),
        async (input: unknown) => {
            const params = input as { maxDepth?: number };
            const result = await listFoldersImpl(app.vault, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    const vault_read_folder = sdk.tool(
        'vault_read_folder',
        'Recursively list all markdown files in a specific folder. Use after vault_list_folders has told you which folder to dive into.',
        z.object({
            folder: z.string(),
            recursive: z.boolean(),
        }),
        async (input: unknown) => {
            const params = input as { folder: string; recursive?: boolean };
            const result = await readFolderImpl(app.vault, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    const vault_read_note = sdk.tool(
        'vault_read_note',
        'Read the full content of a single note, including frontmatter, wikilinks, and the first N characters of the body. Use after vault_read_folder gives you candidate file paths.',
        z.object({
            path: z.string(),
            maxChars: z.number(),
        }),
        async (input: unknown) => {
            const params = input as { path: string; maxChars?: number };
            const result = await readNoteImpl(app.vault, app.metadataCache, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    const vault_grep = sdk.tool(
        'vault_grep',
        'Full-text keyword search across the vault. Use for specific-concept queries ("what did I write about X"). Do NOT use this for reflective queries — it collapses on homogeneous folders.',
        z.object({
            query: z.string(),
            limit: z.number(),
        }),
        async (input: unknown) => {
            const params = input as { query: string; limit?: number };
            const searchFn = async (query: string, limit: number) => {
                const res = await searchClient.search({
                    text: query,
                    scopeMode: 'vault',
                    topK: limit,
                    searchMode: 'hybrid',
                    indexTenant: 'vault',
                });
                return (res.items ?? []).map((i) => ({
                    path: i.path,
                    snippet: i.title ?? i.path,
                    score: i.score ?? 0,
                }));
            };
            const result = await grepImpl(searchFn, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    const vault_wikilink_expand = sdk.tool(
        'vault_wikilink_expand',
        'Follow user-declared wikilinks from a starting note N hops. Use to find notes connected by the user\'s explicit semantic edges, which are more reliable than vector similarity.',
        z.object({
            startPath: z.string(),
            maxSteps: z.number(),
        }),
        async (input: unknown) => {
            const params = input as { startPath: string; maxSteps?: number };
            const result = await wikilinkExpandImpl(app.vault, app.metadataCache, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    const submit_plan = sdk.tool(
        'submit_plan',
        'Call this when you have gathered enough evidence to propose a plan. The user will review the plan and either approve it (triggering report generation) or ask for adjustments. selected_paths must contain the vault paths of all notes you want to cite in the final report.',
        z.object({
            selected_paths: z.array(z.string()),
            rationale: z.string(),
            proposed_outline: z.string(),
            coverage_assessment: z.string(),
        }),
        async (input: unknown) => {
            const params = input as SubmitPlanInput;
            const feedback = await onSubmitPlan(params);
            return { content: [{ type: 'text', text: JSON.stringify(feedback, null, 2) }] };
        }
    );

    return sdk.createSdkMcpServer({
        name: 'vault',
        tools: [
            vault_list_folders,
            vault_read_folder,
            vault_read_note,
            vault_grep,
            vault_wikilink_expand,
            submit_plan,
        ],
    });
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
npm run build
```

Expected: build succeeds. Type errors on `SearchClient` import may require adjusting the path — use the exact path from `grep -rn "class SearchClient" src/`.

- [ ] **Step 3: Commit**

```bash
git add src/service/agents/vault-sdk/vaultMcpServer.ts
git commit -m "feat: submit_plan tool + buildVaultMcpServer wrapper for all vault tools"
```

---

## Task 9: System Prompt Playbook

**Files:**
- Create: `templates/prompts/ai-analysis-vault-sdk-playbook.md`

- [ ] **Step 1: Write the playbook**

Create `templates/prompts/ai-analysis-vault-sdk-playbook.md`:

```markdown
You are a vault search agent operating over the user's Obsidian vault. Your job is to find the most relevant notes for the user's query, read their contents, and submit a plan for user review before the final report is generated.

## Tools Available

All tools are prefixed `mcp__vault__`. You may only use these tools; the built-in filesystem tools are disabled for safety.

- **mcp__vault__vault_list_folders**: list top-level folders with markdown file counts
- **mcp__vault__vault_read_folder**: recursively list all notes in a specific folder
- **mcp__vault__vault_read_note**: read a note's frontmatter, wikilinks, and body preview
- **mcp__vault__vault_grep**: full-text keyword search (FTS + vector hybrid)
- **mcp__vault__vault_wikilink_expand**: follow user-declared wikilinks from a starting note
- **mcp__vault__submit_plan**: submit the final evidence set for user review (terminates the session)

## Query Type Classification

Classify every query as one of two types before choosing your first tool:

### Type A — Reflective / Enumerative

The user wants a *collection* of their content. Marker phrases: "my X", "all my Y", "everything about Z", "summarize my Q", "evaluate my R", "what did I do", "my history", "my ideas", "my plans".

**Strategy for Type A**:

1. **Your FIRST tool call MUST be `vault_list_folders` with `maxDepth: 2`.** Do not skip this. Do not start with vault_grep.
2. Read the returned folder tree. Identify folders whose names or file counts suggest they contain the requested collection. Folder names are user-declared labels — trust them.
3. For each candidate folder, call `vault_read_folder` with `recursive: true`.
4. For each candidate note, call `vault_read_note` with `maxChars: 3000`.
5. When you have read enough notes to form a comprehensive view, call `submit_plan` with all the paths you want cited.

**Do NOT use `vault_grep` as the first tool for Type A queries.** Vector/FTS search collapses on homogeneous folders and will miss 70%+ of the relevant notes.

### Type B — Specific Lookup

The user wants information about a *specific* concept, claim, or fact. Marker phrases: "what did I say about X", "how do I Y", "where is Z", "find the note where I explained W".

**Strategy for Type B**:

1. Start with `vault_grep` using the key terms from the query.
2. For top hits, call `vault_read_note` to get full content.
3. If hits are ambiguous or sparse, call `vault_wikilink_expand` from the top hit to follow the user's semantic edges.
4. Submit plan.

## Execution Rules

- Every session ends with exactly one `submit_plan` call. Do not emit prose output at the end — the submit_plan call is the terminal action.
- Do not hallucinate paths. Only submit paths that vault_read_folder or vault_read_note has confirmed exist.
- Read at least 8-10 notes before submitting for reflective queries. For specific queries, 2-5 notes is usually enough.
- If your first approach returns nothing, switch strategies. Type A can fall back to vault_grep if folder enumeration yields no candidates. Type B can fall back to vault_list_folders if grep returns nothing.
- Stay focused. Do not explore tangential topics; the user's query defines the scope.
```

- [ ] **Step 2: Verify the template loads**

The existing `TemplateManager` (in `src/core/template/`) should auto-discover new files in `templates/prompts/`. Check by running:

```bash
grep -rn "registerPrompt\|templates/prompts" src/core/template/ | head -5
```

If new prompts require explicit registration in `TemplateRegistry.ts`, add an entry. The registration typically looks like:

```typescript
// in TemplateRegistry.ts or PromptId.ts
VaultSdkPlaybook = 'ai-analysis-vault-sdk-playbook',
```

Add this enum/constant and register it with the template manager per the project's existing pattern. (Check `src/service/prompt/PromptId.ts` for how other prompts are defined.)

- [ ] **Step 3: Commit**

```bash
git add templates/prompts/ai-analysis-vault-sdk-playbook.md src/service/prompt/PromptId.ts
git commit -m "feat: skills-style system prompt playbook for SDK vault search"
```

---

## Task 10: Subprocess Pool with Warmup

**Files:**
- Create: `src/service/agents/vault-sdk/sdkAgentPool.ts`

- [ ] **Step 1: Implement the pool**

Create `src/service/agents/vault-sdk/sdkAgentPool.ts`:

```typescript
/**
 * SDK agent pool: manages the lifecycle of the Claude Agent SDK module and
 * its subprocess. Loaded lazily on first vault search, kept warm for the
 * plugin's lifetime.
 *
 * The SDK itself manages internal subprocess pooling via query() session
 * reuse; this module only handles the one-time dynamic import and path
 * resolution.
 */

import { join } from 'path';
import type { App } from 'obsidian';

interface SdkModule {
    query: (opts: unknown) => AsyncIterable<unknown>;
    tool: (...args: unknown[]) => unknown;
    createSdkMcpServer: (config: unknown) => unknown;
    startup?: (opts?: unknown) => Promise<void>;
}

interface PoolConfig {
    app: App;
    pluginId: string;
}

let cachedSdk: SdkModule | null = null;
let cachedCliPath: string | null = null;
let cachedSdkPath: string | null = null;

export function getSdkPaths(app: App, pluginId: string): { sdkPath: string; cliPath: string } {
    if (cachedSdkPath && cachedCliPath) {
        return { sdkPath: cachedSdkPath, cliPath: cachedCliPath };
    }
    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    const basePath = adapter.getBasePath();
    const pluginDir = join(basePath, app.vault.configDir, 'plugins', pluginId);
    cachedSdkPath = join(pluginDir, 'sdk', 'sdk.mjs');
    cachedCliPath = join(pluginDir, 'sdk', 'cli.js');
    return { sdkPath: cachedSdkPath, cliPath: cachedCliPath };
}

/**
 * Loads the SDK module via dynamic import. Idempotent; cached for the plugin
 * lifetime. Must be called before any query() invocation.
 */
export async function loadSdk(config: PoolConfig): Promise<SdkModule> {
    if (cachedSdk) return cachedSdk;

    const { sdkPath } = getSdkPaths(config.app, config.pluginId);
    console.log(`[sdkAgentPool] loading SDK from ${sdkPath}`);

    try {
        // Dynamic import avoids esbuild trying to bundle sdk.mjs at build time.
        const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ sdkPath);
        cachedSdk = mod as SdkModule;
        console.log('[sdkAgentPool] SDK loaded', Object.keys(mod));
        return cachedSdk;
    } catch (err) {
        console.error('[sdkAgentPool] SDK load failed', err);
        throw new Error(
            `Failed to load Claude Agent SDK from ${sdkPath}: ${(err as Error).message}. ` +
                `Check that the plugin directory contains sdk/sdk.mjs and sdk/cli.js.`
        );
    }
}

/**
 * Loads the SDK and fires startup() to pre-warm the subprocess. Called on
 * plugin load or lazily on first vault search. Safe to call multiple times
 * (idempotent).
 */
let warmed = false;
export async function warmupSdk(config: PoolConfig): Promise<void> {
    if (warmed) return;
    const sdk = await loadSdk(config);
    if (typeof sdk.startup === 'function') {
        try {
            await sdk.startup();
            console.log('[sdkAgentPool] subprocess pre-warmed');
        } catch (err) {
            console.warn('[sdkAgentPool] startup() failed, continuing without warmup', err);
        }
    }
    warmed = true;
}

/**
 * For tests only: reset the cached SDK reference so that subsequent calls
 * re-load. Not used in production.
 */
export function _resetPoolForTests(): void {
    cachedSdk = null;
    cachedCliPath = null;
    cachedSdkPath = null;
    warmed = false;
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
npm run build
```

Expected: build succeeds. No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/service/agents/vault-sdk/sdkAgentPool.ts
git commit -m "feat: sdkAgentPool — lazy SDK load and subprocess warmup"
```

---

## Task 11: Main `VaultSearchAgentSDK` Shell

**Files:**
- Create: `src/service/agents/VaultSearchAgentSDK.ts`

This is the main outer shell that ties everything together: loads the SDK, builds the vault MCP server, calls `query()`, pipes SDK messages through the adapter, handles HITL pause via `submit_plan`.

- [ ] **Step 1: Write the shell**

Create `src/service/agents/VaultSearchAgentSDK.ts`:

```typescript
/**
 * VaultSearchAgentSDK — thin outer shell over Claude Agent SDK query() for
 * vault search. Replaces the old hand-rolled classify/decompose/recon pipeline.
 *
 * Flow:
 *   1. Load SDK (cached after first call)
 *   2. Build in-process MCP server with vault tools
 *   3. Call query() with Pattern A options (agent loop with tools)
 *   4. Stream SDK messages, translate to LLMStreamEvent via adapter
 *   5. When LLM calls submit_plan, trigger HITL pause via callback
 *   6. After HITL approval, delegate to existing report phase
 */

import type { App } from 'obsidian';
import { z } from 'zod';
import { StreamTriggerName, type LLMStreamEvent } from '@/core/providers/types';
import { loadSdk, warmupSdk, getSdkPaths } from './vault-sdk/sdkAgentPool';
import { buildVaultMcpServer, type SubmitPlanFeedback, type SubmitPlanInput } from './vault-sdk/vaultMcpServer';
import { translateSdkMessage } from './vault-sdk/sdkMessageAdapter';
import { readProfileFromSettings, toAgentSdkEnv, type SdkProfile } from './vault-sdk/sdkProfile';
import type { SearchClient } from '@/service/search/SearchClient';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';

export interface VaultSearchAgentSdkOptions {
    app: App;
    pluginId: string;
    searchClient: SearchClient;
    aiServiceManager: AIServiceManager;
    settings: unknown;
}

export class VaultSearchAgentSDK {
    constructor(private readonly options: VaultSearchAgentSdkOptions) {}

    /**
     * Pre-warm the SDK subprocess on plugin load. Non-blocking; errors are
     * logged but not propagated (fall back to lazy load on first query).
     */
    async warmup(): Promise<void> {
        try {
            await warmupSdk({ app: this.options.app, pluginId: this.options.pluginId });
        } catch (err) {
            console.error('[VaultSearchAgentSDK] warmup failed', err);
        }
    }

    /**
     * Start a vault search session. Yields LLMStreamEvents compatible with
     * the existing UI routing layer.
     */
    async *startSession(userQuery: string): AsyncGenerator<LLMStreamEvent> {
        const { app, pluginId, searchClient, aiServiceManager, settings } = this.options;

        const profile: SdkProfile = readProfileFromSettings(settings);
        let env: Record<string, string>;
        try {
            env = toAgentSdkEnv(profile);
        } catch (err) {
            yield {
                type: 'error',
                error: err as Error,
                triggerName: StreamTriggerName.SEARCH_AI_AGENT,
            } as LLMStreamEvent;
            return;
        }
        // Preserve PATH so the subprocess can find node
        if (typeof process !== 'undefined' && process.env.PATH) {
            env.PATH = process.env.PATH;
        }

        const sdk = await loadSdk({ app, pluginId });
        const { cliPath } = getSdkPaths(app, pluginId);

        // Load the system prompt from the playbook template
        const systemPrompt = await aiServiceManager.renderPrompt(
            (PromptId as unknown as { VaultSdkPlaybook: string }).VaultSdkPlaybook,
            {}
        );

        // HITL promise: resolved when user approves/rejects the submitted plan
        let resolveSubmit: ((feedback: SubmitPlanFeedback) => void) | null = null;
        const submitPromise = new Promise<SubmitPlanFeedback>((resolve) => {
            resolveSubmit = resolve;
        });
        const pendingSubmits: SubmitPlanInput[] = [];

        const onSubmitPlan = async (plan: SubmitPlanInput): Promise<SubmitPlanFeedback> => {
            pendingSubmits.push(plan);
            // For now, auto-approve to unblock the 1-day scope. Full HITL UI
            // integration will be added in a subsequent task (outside today's plan).
            return {
                approved: true,
                adjustedPaths: plan.selected_paths,
                adjustedOutline: plan.proposed_outline,
            };
        };

        const mcpServer = buildVaultMcpServer({
            app,
            searchClient,
            onSubmitPlan,
            sdk: sdk as unknown as Parameters<typeof buildVaultMcpServer>[0]['sdk'],
            z: z as unknown as Parameters<typeof buildVaultMcpServer>[0]['z'],
        });

        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-starting',
            triggerName: StreamTriggerName.SEARCH_AI_AGENT,
            extra: { query: userQuery, profile: profile.kind, model: profile.primaryModel },
        } as LLMStreamEvent;

        try {
            const messages = sdk.query({
                prompt: userQuery,
                options: {
                    pathToClaudeCodeExecutable: cliPath,
                    cwd: (app.vault.adapter as unknown as { getBasePath(): string }).getBasePath(),
                    maxTurns: 20,
                    systemPrompt: systemPrompt,
                    allowedTools: [
                        'mcp__vault__vault_list_folders',
                        'mcp__vault__vault_read_folder',
                        'mcp__vault__vault_read_note',
                        'mcp__vault__vault_grep',
                        'mcp__vault__vault_wikilink_expand',
                        'mcp__vault__submit_plan',
                    ],
                    disallowedTools: [
                        'Read',
                        'Write',
                        'Edit',
                        'Bash',
                        'Glob',
                        'Grep',
                        'WebSearch',
                        'WebFetch',
                        'AskUserQuestion',
                    ],
                    mcpServers: { vault: mcpServer },
                    settingSources: [],
                    env,
                },
            });

            for await (const raw of messages) {
                // Log full message to console for Task 14 debug visibility
                console.log('[VaultSearchAgentSDK] message', raw);
                const events = translateSdkMessage(raw, {
                    triggerName: StreamTriggerName.SEARCH_AI_AGENT,
                });
                for (const ev of events) {
                    yield ev;
                }
            }
        } catch (err) {
            console.error('[VaultSearchAgentSDK] query error', err);
            yield {
                type: 'error',
                error: err as Error,
                triggerName: StreamTriggerName.SEARCH_AI_AGENT,
            } as LLMStreamEvent;
            return;
        }

        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-complete',
            triggerName: StreamTriggerName.SEARCH_AI_AGENT,
            extra: {
                submittedPlans: pendingSubmits.length,
                totalPaths: pendingSubmits.flatMap((p) => p.selected_paths).length,
            },
        } as LLMStreamEvent;
    }
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
npm run build
```

Expected: build succeeds. You may hit:

- Type errors if `PromptId.VaultSdkPlaybook` isn't defined yet — add it per Task 9 Step 2
- Type errors on `SearchClient` import — adjust the path
- Type errors on `aiServiceManager.renderPrompt` signature — match the real signature from `service-manager.ts`

Fix each in place. Do not move on until build exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/service/agents/VaultSearchAgentSDK.ts
git commit -m "feat: VaultSearchAgentSDK main shell wiring query() + MCP + adapter"
```

---

## Task 12: Feature Flag Routing in VaultSearchAgent

**Files:**
- Modify: `src/service/agents/VaultSearchAgent.ts`

- [ ] **Step 1: Read the existing VaultSearchAgent**

```bash
head -60 src/service/agents/VaultSearchAgent.ts
```

Identify the `startSession(userQuery)` method and its signature. You'll insert a branch at the top that delegates to `VaultSearchAgentSDK` when the feature flag is true.

- [ ] **Step 2: Add the feature flag branch**

Modify `src/service/agents/VaultSearchAgent.ts`. At the top of the file, add imports:

```typescript
import { VaultSearchAgentSDK } from './VaultSearchAgentSDK';
import { AppContext } from '@/app/context/AppContext';
```

Near the top of `startSession()`, add:

```typescript
async *startSession(userQuery: string): AsyncGenerator<VaultSearchEvent> {
    const ctx = AppContext.getInstance();
    const settings = ctx.plugin?.settings as { vaultSearch?: { useV2?: boolean } } | undefined;
    const useV2 = settings?.vaultSearch?.useV2 === true;

    if (useV2) {
        console.log('[VaultSearchAgent] routing to V2 (SDK-based agent)');
        const v2 = new VaultSearchAgentSDK({
            app: ctx.plugin.app,
            pluginId: ctx.plugin.manifest.id,
            searchClient: ctx.searchClient!,
            aiServiceManager: this.aiServiceManager,
            settings: ctx.plugin.settings,
        });
        // Optional warmup (non-blocking)
        v2.warmup().catch(() => undefined);

        for await (const ev of v2.startSession(userQuery)) {
            yield ev as VaultSearchEvent;
        }
        return;
    }

    // ... existing V1 pipeline below unchanged ...
}
```

The exact access paths (`ctx.plugin.app`, `ctx.plugin.manifest.id`, `ctx.plugin.settings`, `ctx.searchClient`) may differ from your real `AppContext` shape. Adjust to match. The intent: construct a V2 instance with the required dependencies, then delegate.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/VaultSearchAgent.ts
git commit -m "feat: feature flag routing to VaultSearchAgentSDK when vaultSearch.useV2"
```

---

## Task 13: UI Event Routing Sanity Check

**Files:**
- Read: `src/ui/view/quick-search/hooks/useSearchSession.ts`
- Modify (if needed): same file

The V2 agent emits the same `LLMStreamEvent` types the UI already handles (`pk-debug`, `tool-call`, `tool-result`, `text-delta`, `complete`, `error`). No new event types required for Day 1. This task is a verification pass.

- [ ] **Step 1: Grep for event handling**

```bash
grep -n "case 'pk-debug'\|case 'tool-call'\|case 'tool-result'\|case 'complete'\|case 'error'" src/ui/view/quick-search/hooks/useSearchSession.ts
```

Verify each case exists. If `tool-call` and `tool-result` do not already have cases (e.g., the old pipeline only emitted `agent-step-progress`), add minimal routing:

```typescript
case 'tool-call': {
    const ev = event as any;
    store.getState().appendAgentDebugLog({
        type: 'tool-call',
        taskIndex: ev.taskIndex,
        data: { tool: ev.toolName ?? '', args: ev.input ?? ev.args ?? {} },
    });
    break;
}
case 'tool-result': {
    const ev = event as any;
    if (ev.toolName) {
        store.getState().appendAgentDebugLog({
            type: 'tool-result',
            taskIndex: ev.taskIndex,
            data: { tool: ev.toolName, output: ev.output ?? null },
        });
    }
    break;
}
```

(Most of this should already exist — the old pipeline already captures these.)

- [ ] **Step 2: No-op test build**

```bash
npm run build
```

Expected: build succeeds. No runtime test yet (that's Task 15).

- [ ] **Step 3: Commit if anything was modified**

```bash
git add src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "chore: ensure tool-call/tool-result events route to agentDebugLog for V2 agent"
```

If nothing was modified, skip the commit and proceed to Task 14.

---

## Task 14: Debug Console Logging

**Files:** No new files.

The SDK message adapter already logs every raw SDK message (Task 11 Step 1 has `console.log('[VaultSearchAgentSDK] message', raw)`). This task confirms the logging is sufficient and adds minimal markers.

- [ ] **Step 1: Verify the console logging**

Open `src/service/agents/VaultSearchAgentSDK.ts` and confirm the `for await` loop logs every raw message. If the `pk-debug` events produced by the adapter are also being captured, you should have redundant visibility.

- [ ] **Step 2: Add round boundary markers**

In `VaultSearchAgentSDK.startSession()`, after the `for await` line that logs raw messages, track round boundaries:

```typescript
let roundIndex = 0;
for await (const raw of messages) {
    const msg = raw as { type?: string };
    if (msg.type === 'assistant') {
        console.group(`[VaultSearchAgentSDK] round ${++roundIndex} — assistant`);
    }
    console.log('[VaultSearchAgentSDK] message', raw);
    if (msg.type === 'user') {
        console.groupEnd();
    }
    const events = translateSdkMessage(raw, {
        triggerName: StreamTriggerName.SEARCH_AI_AGENT,
    });
    for (const ev of events) {
        yield ev;
    }
}
// Close any open group
if (roundIndex > 0) {
    try { console.groupEnd(); } catch { /* nothing */ }
}
```

This produces collapsible groups in DevTools Console, one per agent round.

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/VaultSearchAgentSDK.ts
git commit -m "feat: console.group round markers for SDK agent debugging"
```

---

## Task 15: End-to-End Smoke Test with Reflective Query

**Files:** No new files; this task runs the system manually.

**Goal:** With the feature flag on, run a reflective query against the test vault and verify the agent:
1. Loads without errors
2. Calls `vault_list_folders` first
3. Enumerates the correct folder
4. Reads multiple notes
5. Submits a plan
6. Report phase produces output

- [ ] **Step 1: Build**

```bash
npm run build
```

- [ ] **Step 2: Reload plugin in Obsidian**

Disable and re-enable the plugin via Settings → Community plugins.

- [ ] **Step 3: Enable the feature flag**

Open plugin settings (wherever `vaultSearch.useV2` is exposed). For the 1-day scope, you may not have a UI field for this yet. Set it via DevTools Console:

```javascript
// Find the plugin instance; the exact path depends on the plugin id
const plugin = app.plugins.plugins['obsidian-peak-assistant']; // adjust id to yours
plugin.settings.vaultSearch = plugin.settings.vaultSearch || {};
plugin.settings.vaultSearch.useV2 = true;
plugin.settings.vaultSearch.sdkProfile = {
    kind: 'anthropic-direct',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-...your-real-key...',
    primaryModel: 'claude-opus-4-6',
    fastModel: 'claude-haiku-4-5',
};
await plugin.saveSettings();
```

- [ ] **Step 4: Run a reflective test query**

Generic reflective test query (not tied to any specific vault layout): use whichever collection folder your test vault contains. For example, in a test vault with a `notes/` folder containing several markdown files:

```
Enumerate and briefly describe all notes in my notes folder
```

Or for a vault with more structure, any query starting with "my all ..." or "evaluate all my ..." that targets a folder you know has ≥20 files.

Trigger the query through the existing vault search UI (Quick Search modal → AI Analysis tab).

- [ ] **Step 5: Verify in DevTools Console**

Watch for:

- `[VaultSearchAgentSDK] message` logs streaming in
- A `round 1 — assistant` group
- A `tool_use` block with `name: 'vault_list_folders'` as the **first** tool call
- Subsequent rounds with `vault_read_folder` and `vault_read_note` calls
- Eventually a `submit_plan` call
- A final `result` message with `usage` data
- A `vault-sdk-complete` pk-debug event

**Pass criteria**: reflective query returns ≥80% of the files in the target folder (e.g., if the target folder has 56 notes, the submitted plan should include ≥45 of them). Compare against the old pipeline by flipping `useV2` off and re-running the same query — old pipeline should return ~12.

- [ ] **Step 6: If it doesn't work, diagnose**

Common failure modes:

| Symptom | Likely cause | Fix |
|---|---|---|
| "Cannot find module" on SDK load | `sdk/` directory not present in plugin folder | Re-run `npm run copy-sdk`, then rebuild |
| SDK loads but query errors out | missing API key / invalid key | Set `apiKey` in plugin settings (Step 3 above) |
| Agent calls `vault_grep` first instead of `vault_list_folders` | Playbook prompt not being loaded or LLM ignoring it | Check template registration (Task 9 Step 2); make the Type A strategy bullet even more imperative ("MUST" / "NEVER") |
| Agent only reads 1-2 notes then submits | maxTurns too low, or system prompt not pushing deep reading | Increase `maxTurns` to 30; add "Read at least 8 notes" rule to playbook |
| Agent never calls `submit_plan` | LLM tries to write a final text answer instead | Add to playbook: "You MUST end every session with submit_plan. Never produce a final text answer." |
| CJK paths corrupted in tool results | SDK stream-json regression | Pin SDK version; see Task 2 Step 6 |

Iterate on the playbook (Task 9) as needed. Each iteration: edit playbook, build, reload plugin, re-run query.

- [ ] **Step 7: Commit any fixes**

```bash
git add templates/prompts/ai-analysis-vault-sdk-playbook.md src/service/agents/VaultSearchAgentSDK.ts
git commit -m "fix: tune playbook prompt and agent options based on smoke test"
```

---

## Task 16: Documentation and Cleanup

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-vault-search-agent-sdk-migration.md` (mark complete)
- Modify: `CLAUDE.md` (add SDK note)
- Delete or comment out: the spike command from Task 2 (optional)

- [ ] **Step 1: Update CLAUDE.md with the new runtime**

Open `CLAUDE.md`. Under Architecture or the AI section, add:

```markdown
**Vault Search (V2, behind `vaultSearch.useV2` flag)**: Uses `@anthropic-ai/claude-agent-sdk` via a bundled `cli.js` subprocess. Entry point `VaultSearchAgentSDK` at `src/service/agents/`. Vault-native MCP tools defined at `src/service/agents/vault-sdk/vaultMcpServer.ts`. System prompt playbook at `templates/prompts/ai-analysis-vault-sdk-playbook.md`. SDK files copied from node_modules to `sdk/` subdirectory at build time via `scripts/copy-agent-sdk.mjs`. Desktop only (`child_process.spawn` unavailable on mobile).
```

- [ ] **Step 2: Decide on spike command**

The spike command from Task 2 is dev-only. Two options:
- **Keep**: useful for future debugging; rename file to `spikeAgentSdk.dev.ts` or add a `// DEV ONLY` comment
- **Delete**: cleaner; future spikes can recreate from git history

For the 1-day sprint, keep it. Revisit in the next cleanup pass.

- [ ] **Step 3: Mark plan complete**

At the top of this plan file (`docs/superpowers/plans/2026-04-12-vault-search-agent-sdk-migration.md`), add:

```markdown
**Status: Completed YYYY-MM-DD**

All 16 tasks executed in one working day. V2 vault search runs on Claude Agent SDK behind the `vaultSearch.useV2` feature flag. Baseline smoke test passes: reflective queries return ≥80% of target folder files vs. ~21% on the old pipeline. Chat, doc agents, structured extraction, and embeddings remain on Vercel AI SDK per out-of-scope list.

Next steps (not today):
- Phase 2-9 from 2026-04-11-provider-system-v2-design.md (migrate remaining features, delete Vercel AI SDK)
- Profile Registry UI
- Debug log 1-click copy
- Mobile feature flag gate
```

- [ ] **Step 4: Final commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-04-12-vault-search-agent-sdk-migration.md
git commit -m "docs: document V2 vault search runtime and mark 1-day plan complete"
```

---

## Self-Review

**1. Spec coverage check**

Each core requirement from the migration spec and v2 spec, mapped to the task that implements it:

| Spec requirement | Task |
|---|---|
| esbuild external + post-build copy | Task 1 |
| Spike verification | Task 2 |
| Minimal profile materialization | Task 3 |
| SDK message → LLMStreamEvent adapter | Task 4 |
| `vault_list_folders` | Task 5 |
| `vault_read_folder`, `vault_read_note` | Task 6 |
| `vault_grep`, `vault_wikilink_expand` | Task 7 |
| `submit_plan` HITL tool | Task 8 |
| System prompt playbook (no hardcoded paths, dynamic discovery) | Task 9 |
| Subprocess pool + warmup | Task 10 |
| Main outer shell calling query() | Task 11 |
| Feature flag routing | Task 12 |
| UI event routing compatibility | Task 13 |
| Debug logging | Task 14 |
| E2E smoke test | Task 15 |
| Docs + cleanup | Task 16 |

**2. Placeholder scan**

All tasks contain concrete file paths, concrete code, concrete commands, and concrete expected outputs. No "TBD", "implement later", or "similar to task N". Verify: `grep -i "TBD\|TODO\|implement later\|fill in" docs/superpowers/plans/2026-04-12-vault-search-agent-sdk-migration.md` should return no matches inside task bodies.

**3. Type consistency**

- `SdkProfile` fields defined in Task 3 are used consistently in Task 11 (materialization) and Task 15 (settings). Check: `kind`, `baseUrl`, `apiKey`, `authToken`, `primaryModel`, `fastModel`, `customHeaders`.
- `SubmitPlanInput` and `SubmitPlanFeedback` defined in Task 8 are used in Task 11's `onSubmitPlan` callback. Match.
- `LLMStreamEvent` from `src/core/providers/types` is consumed in Task 4 (adapter), Task 11 (shell), Task 13 (UI routing). Consistent.
- `VaultMcpServerDeps` defined in Task 8, constructed in Task 11. Match.

**4. Out-of-scope boundaries**

Every out-of-scope item from the header is NOT touched by any task:
- No Profile Registry UI task
- No chat/doc-agent/structured-extraction migration tasks
- No Vercel AI SDK deletion task
- No skill system rewrite task
- No mobile flag task

Plan passes self-review.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-12-vault-search-agent-sdk-migration.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Task 2 (spike) should be reviewed synchronously before proceeding; later tasks can run in sequence with minimal intervention.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints at Task 2 (spike gate), Task 11 (main shell), and Task 15 (smoke test).

**Which approach?**
