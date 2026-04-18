# Context Handoff: V2 Vault Search UI
> **STATUS: SUPERSEDED**

> **For the next session**: Read this file first. It contains everything you need to continue work.

**Date**: 2026-04-12
**Branch**: `refactor_search_pipeline`
**Last commit**: `644c570` (fix: persist vaultSearch settings across plugin reload)

---

## What Was Accomplished Today

### The Problem (Root Cause)
Vault search agent failed to find user's 56 idea files in `kb2-learn-prd/B-2-创意和想法管理/A-All Ideas/` — recall rate was 21%. Root cause: an 8-layer signal loss chain where the user's directory structure (ground-truth taxonomy) never entered the LLM's context, and the pipeline defaulted to vector search which collapsed on homogeneous corpora.

### The Solution (Implemented & Verified)
Migrated vault search to **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk@0.2.101`). The SDK's `query()` function runs a subprocess (`cli.js` bundled in npm package) that handles the agent loop. Custom vault tools run in-process via `createSdkMcpServer()`.

### What Was Built (16 Tasks, 15 Completed)

| File | Purpose |
|---|---|
| `src/service/agents/vault-sdk/sdkProfile.ts` | SdkProfile type + toAgentSdkEnv() + readProfileFromSettings() with Claude/OpenRouter auto-fallback |
| `src/service/agents/vault-sdk/sdkMessageAdapter.ts` | Translates SDK SDKMessage → plugin LLMStreamEvent (7 tests) |
| `src/service/agents/vault-sdk/vaultMcpServer.ts` | 6 vault tools: listFolders, readFolder, readNote, grep, wikilinkExpand, submitPlan + buildVaultMcpServer() wrapper (12 tests) |
| `src/service/agents/vault-sdk/sdkAgentPool.ts` | Renderer compat patches (setMaxListeners shim, timer shim, node binary detection) + warmup |
| `src/service/agents/VaultSearchAgentSDK.ts` | Main outer shell: query() + MCP + adapter + HITL auto-approve |
| `templates/prompts/ai-analysis-vault-sdk-playbook.md` | Skills-style system prompt (Type A: reflective → vault_list_folders first; Type B: specific → grep first) |
| `scripts/copy-agent-sdk.mjs` | Post-build script to copy cli.js sidecar |
| `src/app/commands/spikeAgentSdk.ts` | Dev-only spike command (to be deleted in Task 16) |

### Key Technical Decisions (Obsidian + Electron compat)

1. **SDK bundled into main.js** via esbuild (NOT external) — because Electron renderer Node 20.18 can't `require(esm)` and dynamic `import()` is blocked by Chromium webSecurity
2. **cli.js stays as sidecar file** in `sdk/` dir — spawned via `child_process.spawn` with explicit `pathToClaudeCodeExecutable`
3. **Real node binary preferred** over Electron Node mode — Electron's `ELECTRON_RUN_AS_NODE=1` caused SIGTRAP. `findNodeBinary()` probes nvm/brew/system paths
4. **events.setMaxListeners shim** — SDK uses browser AbortSignal which fails Node's instanceof check
5. **setTimeout/setInterval shim** — SDK calls `.unref()` on timer handles, which returns number (not Timeout object) in Chromium renderer
6. **OpenRouter auto-detect** — readProfileFromSettings falls back to `settings.ai.llmProviderConfigs.openrouter.apiKey` with Anthropic Skin base URL
7. **Feature flag** — `settings.vaultSearch.useV2 === true` routes to V2; persisted via PluginSettingsLoader fix

### E2E Test Result (Verified)

- **vault_list_folders called first** ✅ (62 folders, 2476 files)
- **A-All Ideas fully discovered** ✅ (56/56 files listed via vault_read_folder)
- **10 notes read in depth** ✅
- **submit_plan with 10 paths + comprehensive outline** ✅
- **91s total, 9.2K tokens, Haiku via OpenRouter** ✅
- **5000+ word report generated with specific vault content citations** ✅

---

## What's Left To Do: V2 UI

### The Problem Now
V2 backend works perfectly but the **UI shows only a blank spinner** ("Analyzing..."). The old pipeline's step components (Classify/Decompose/Recon/Plan/Report) don't render because V2 doesn't emit those phase-transition events. Users can't see:
1. What the agent is doing (which tool it's calling)
2. What files it found
3. The final report

### The Design (Approved by User)

**Core concept**: Each tool call = a visible "step card" in the UI, appearing in real-time. Final report rendered as full-width markdown below the steps.

**Tool Call → Step Card Mapping:**

| Tool call | Step title | Summary line | Icon |
|---|---|---|---|
| `vault_list_folders` | Browsing vault structure | `{n} folders · {total} files` | 📂 |
| `vault_read_folder` | Reading {last path segment} | `📂 {n} files discovered` | 📂 |
| `vault_read_note` (single) | Reading {basename} | `📄 {chars} chars` | 📄 |
| `vault_read_note` (consecutive batch) | Reading {n} notes in depth | file name list, max 6 + "+N more" | 📄 |
| `vault_grep` | Searching "{query}" | `🔍 {n} hits · top: {basename}` | 🔍 |
| `vault_wikilink_expand` | Following links from {basename} | `🔗 {n} notes discovered` | 🔗 |
| `submit_plan` | Evidence plan | `📋 {n} sources · coverage: ✓ X ✓ Y` | 📋 |

**Step card states:**
- Running: blue spinner, title ends with "..."
- Done: green ✅, summary appears, click `▸` to expand full result
- Expanded: shows complete tool input + result JSON

**Report section:**
- Appears below steps after submit_plan
- Streams markdown via existing `StreamdownIsolated` component
- Full width, rendered in real-time

**Footer:**
- `⏱ 91s · 📊 9.2K tokens · 🤖 haiku-4-5 via openrouter`
- Buttons: [📋 Copy Report] [💾 Save to Vault] [🔄 Continue Chat]

### New Files To Create

| File | Responsibility | Est. lines |
|---|---|---|
| `src/ui/view/quick-search/components/steps/V2StepCard.tsx` | Single tool-call step card with expand/collapse | ~80 |
| `src/ui/view/quick-search/components/steps/V2StepList.tsx` | Container: renders V2StepCard[] + groups consecutive read_note calls | ~60 |
| `src/ui/view/quick-search/components/ai-analysis-sections/V2ReportSection.tsx` | Markdown report renderer (wrapper around StreamdownIsolated) | ~50 |
| `src/ui/view/quick-search/components/V2SearchResultView.tsx` | Layout: V2StepList + V2ReportSection + TokenStatsBanner + footer buttons | ~100 |

### Files To Modify

| File | Change |
|---|---|
| `src/ui/view/quick-search/store/searchSessionStore.ts` | Add V2 state: `v2Steps: V2ToolStep[]`, `v2ReportChunks: string[]`, `v2ReportComplete: boolean`, actions to push/update steps and append report chunks |
| `src/ui/view/quick-search/types/search-steps.ts` | Add `V2ToolStep` interface |
| `src/ui/view/quick-search/hooks/useSearchSession.ts` | In `routeEvent`, when V2 is active: `tool-call` → push V2ToolStep, `tool-result` → update step summary, `text-delta` (after submit_plan) → append to v2ReportChunks |
| `src/ui/view/quick-search/components/SearchResultView.tsx` | Check if V2 mode → render `V2SearchResultView` instead of `StepList` |

### Existing Components To Reuse (No Changes Needed)

- `StreamdownIsolated.tsx` — markdown rendering with mermaid/shiki/CJK
- `TokenStatsBanner` in SearchResultView.tsx — already shows token usage
- `ResultSaveDialog.tsx` — save to vault
- `RecentAIAnalysis.tsx` — history list below results
- `AIAnalysisPreStreamingState.tsx` — spinner before streaming starts
- `AIAnalysisErrorState.tsx` — error display

### V2ToolStep Type (For Store)

```typescript
interface V2ToolStep {
    id: string;                    // tool call id from SDK
    toolName: string;              // e.g. 'mcp__vault__vault_list_folders'
    displayName: string;           // e.g. 'Browsing vault structure'
    icon: string;                  // emoji: 📂 📄 🔍 🔗 📋
    input: Record<string, unknown>;
    status: 'running' | 'done' | 'error';
    startedAt: number;
    endedAt?: number;
    summary?: string;              // one-line summary (extracted from tool result)
    resultPreview?: string;        // expanded view content
}
```

### How V2 Mode Is Detected In UI

```typescript
// In SearchResultView.tsx:
const useV2 = useSearchSessionStore((s) => s.v2Steps.length > 0);
if (useV2) return <V2SearchResultView onClose={onClose} onRetry={onRetry} />;
// else: existing StepList rendering
```

### Summary Extraction Logic (Per Tool)

When `tool-result` arrives, extract a human-readable summary from the JSON:

```typescript
function extractV2Summary(toolName: string, result: unknown): string {
    const data = typeof result === 'string' ? JSON.parse(result) : result;
    switch (toolName) {
        case 'mcp__vault__vault_list_folders':
            return `${data.folders?.length ?? 0} folders · ${data.totalMdFiles ?? 0} files`;
        case 'mcp__vault__vault_read_folder':
            return `📂 ${data.totalCount ?? data.files?.length ?? 0} files in ${data.folder}`;
        case 'mcp__vault__vault_read_note':
            return data.error ? `⚠️ ${data.error}` : `📄 ${data.bodyPreview?.length ?? 0} chars`;
        case 'mcp__vault__vault_grep':
            return `🔍 ${data.hits?.length ?? 0} hits`;
        case 'mcp__vault__vault_wikilink_expand':
            return `🔗 ${data.visited?.length ?? 0} notes discovered`;
        case 'mcp__vault__submit_plan':
            return `📋 ${data.adjustedPaths?.length ?? 0} sources selected`;
        default:
            return '';
    }
}
```

---

## Reference Documents

| Document | Path | Status |
|---|---|---|
| Migration design spec | `docs/superpowers/specs/2026-04-11-vault-search-agent-sdk-migration-design.md` | Active |
| Provider system v2 spec | `docs/superpowers/specs/2026-04-11-provider-system-v2-design.md` | Active |
| 1-day migration plan | `docs/superpowers/plans/2026-04-12-vault-search-agent-sdk-migration.md` | 15/16 tasks done |
| **This handoff** | `docs/superpowers/plans/2026-04-12-context-handoff-v2-ui.md` | Read this first |

## How To Enable V2 For Testing

```javascript
// In Obsidian DevTools Console:
const p = app.plugins.plugins['obsidian-peak-assistant']
p.settings.vaultSearch = { useV2: true }
await p.saveSettings()
// Then reload plugin (Settings → Community plugins → toggle)
```

The OpenRouter API key is auto-detected from `settings.ai.llmProviderConfigs.openrouter.apiKey`.

## Next Session Action

1. Read this handoff file
2. Read the existing UI files listed in "Files To Modify" above
3. Write implementation plan for V2 UI (~6 tasks)
4. Execute via subagent-driven or inline
5. Manual test: enable V2, run query, verify steps + report render correctly
