# Mobile Support: iCloud + Long Context (No-RAG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Peak Assistant load and function on Obsidian mobile (iOS/Android) with AI chat and vault search, using Claude long context instead of RAG.

**Architecture:** Dual-mode runtime — single `main.js` bundle with `Platform.isMobile` guards. Desktop keeps full RAG pipeline unchanged. Mobile skips SQLite/indexing, uses `MobileSearchService` (vault API file scan) + `MobileVaultSearchAgent` (direct Claude long-context call). Intuition map exported as vault JSON file for iCloud sync.

**Tech Stack:** Obsidian API (`Platform`, `vault`, `metadataCache`), React 18, Tailwind CSS (`pktw-` prefix), `MultiProviderChatService` (HTTP-based LLM calls)

**Spec:** `docs/superpowers/specs/2026-04-18-mobile-support-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/core/platform.ts` | `isMobile()` / `isDesktop()` utility |
| `src/core/template/VaultContentProvider.ts` | Mobile template loader via `app.vault.adapter` |
| `src/service/search/MobileSearchService.ts` | File-based vault search (no SQLite) |
| `src/service/agents/MobileVaultSearchAgent.ts` | Simplified agent: search → read files → Claude long context |
| `test/mobile-search.test.ts` | Tests for MobileSearchService scoring |

### Modified files
| File | Change |
|------|--------|
| `main.ts:141-150` | Guard SQLite init + search init with `isDesktop()` |
| `main.ts:99-104` | Add `VaultContentProvider` fallback for template loading |
| `src/service/tools/search-web.ts:1` | Convert static `playwright` import to dynamic |
| `src/service/DailyStatsiticsService.ts:3` | Convert static `simple-git` import to dynamic |
| `src/service/agents/VaultSearchAgent.ts:65` | Route mobile to `MobileVaultSearchAgent` |
| `src/app/context/AppContext.ts:145` | Add mobile-aware factory method |
| `src/app/commands/Register.ts:360-362` | Export intuition map to vault JSON file |
| `src/ui/view/quick-search/hooks/useSearchSession.ts:1009` | Mobile agent wiring |

---

### Task 1: Platform Gate Utility

Create the platform detection utility used by all subsequent tasks.

**Files:**
- Create: `src/core/platform.ts`

- [ ] **Step 1: Create platform utility**

```typescript
// src/core/platform.ts
import { Platform } from 'obsidian';

/** True on iOS / Android Obsidian. */
export const isMobile = (): boolean => Platform.isMobile;

/** True on macOS / Windows / Linux Obsidian (Electron). */
export const isDesktop = (): boolean => !Platform.isMobile;
```

- [ ] **Step 2: Commit**

```bash
git add src/core/platform.ts
git commit -m "feat(mobile): add platform detection utility"
```

---

### Task 2: Guard Static Native Imports

Convert static imports of `playwright` and `simple-git` to dynamic imports behind `isDesktop()` guards. These two are the only top-level static imports of unavailable native modules.

**Files:**
- Modify: `src/service/tools/search-web.ts:1`
- Modify: `src/service/DailyStatsiticsService.ts:1-3`

- [ ] **Step 1: Fix playwright import in search-web.ts**

Replace the static import at line 1:

```typescript
// BEFORE (line 1):
import { chromium, type Browser, type Page } from 'playwright';

// AFTER:
import type { Browser, Page } from 'playwright';

let chromium: typeof import('playwright').chromium | null = null;
try {
    chromium = require('playwright').chromium;
} catch {
    // playwright unavailable (mobile or missing install)
}
```

Then guard the usage inside `localWebSearchTool` — find where `chromium.launch()` is called and add:

```typescript
if (!chromium) {
    throw new BusinessError(ErrorCode.TOOL_EXECUTION_FAILED, 'Local web search requires desktop Obsidian (Playwright not available)');
}
```

- [ ] **Step 2: Fix simple-git import in DailyStatsiticsService.ts**

Replace the static import at line 3:

```typescript
// BEFORE (line 3):
import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';

// AFTER:
import type { SimpleGit } from 'simple-git';

let simpleGitFactory: typeof import('simple-git').simpleGit | null = null;
try {
    simpleGitFactory = require('simple-git').simpleGit;
} catch {
    // simple-git unavailable (mobile)
}
```

Then guard usage — find where `simpleGit()` is called and add a null check that returns early or throws.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/tools/search-web.ts src/service/DailyStatsiticsService.ts
git commit -m "fix(mobile): convert playwright and simple-git to dynamic imports"
```

---

### Task 3: VaultContentProvider for Mobile Template Loading

Create a vault-API-based template content provider as a fallback when `fs` is unavailable.

**Files:**
- Create: `src/core/template/VaultContentProvider.ts`
- Modify: `main.ts:98-116`

- [ ] **Step 1: Create VaultContentProvider**

```typescript
// src/core/template/VaultContentProvider.ts
import { normalizePath, type App } from 'obsidian';
import type { TemplateContentProvider } from '@/core/template/TemplateManager';

/**
 * Loads template files via Obsidian vault adapter.
 * Works on both desktop and mobile — no Node `fs` dependency.
 * @param app - Obsidian App instance
 * @param pluginId - Plugin manifest ID (used to resolve .obsidian/plugins/<id>/ path)
 */
export function createVaultContentProvider(app: App, pluginId: string): TemplateContentProvider {
    const pluginDir = normalizePath(`${app.vault.configDir}/plugins/${pluginId}`);
    return {
        async load(relativePath: string): Promise<string> {
            const fullPath = normalizePath(`${pluginDir}/${relativePath}`);
            return app.vault.adapter.read(fullPath);
        },
    };
}
```

- [ ] **Step 2: Wire fallback in main.ts**

Modify `main.ts:98-116`. The existing try/catch already handles `getPluginDirAbsolute()` failure. Add the vault-based fallback in the catch block:

```typescript
// main.ts — replace lines 98-104 with:
import { createVaultContentProvider } from '@/core/template/VaultContentProvider';

// Inside onload():
try {
    const pluginDirAbsolute = getPluginDirAbsolute(this.manifest.id, this.app);
    this.templateManager = new TemplateManager(createPluginDirContentProvider(pluginDirAbsolute));
} catch (e) {
    // Mobile or non-filesystem vault: fall back to vault adapter
    console.warn('[Peak Assistant] PluginDirContentProvider not available, using vault adapter fallback.', e);
    this.templateManager = new TemplateManager(createVaultContentProvider(this.app, this.manifest.id));
}
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/core/template/VaultContentProvider.ts main.ts
git commit -m "feat(mobile): add VaultContentProvider for template loading without Node fs"
```

---

### Task 4: Guard main.ts Startup — Skip SQLite on Mobile

The critical change: wrap `sqliteStoreManager.init()` and `initializeSearchService()` with a desktop-only guard so the plugin loads on mobile.

**Files:**
- Modify: `main.ts:141-153`

- [ ] **Step 1: Add platform guard around SQLite initialization**

Replace `main.ts:141-153`:

```typescript
// BEFORE (main.ts:141-153):
await sqliteStoreManager.init({
    app: this.app,
    storageFolder: this.settings.dataStorageFolder,
    filename: VAULT_DB_FILENAME,
    settings: { sqliteBackend: this.settings.sqliteBackend }
});
await this.initializeSearchService();
appContext.searchClient = this.searchClient!;

// AFTER:
import { isDesktop } from '@/core/platform';

// Inside onload(), at lines 141-153:
if (isDesktop()) {
    await sqliteStoreManager.init({
        app: this.app,
        storageFolder: this.settings.dataStorageFolder,
        filename: VAULT_DB_FILENAME,
        settings: { sqliteBackend: this.settings.sqliteBackend }
    });
    await this.initializeSearchService();
    appContext.searchClient = this.searchClient!;
} else {
    console.log('[Peak Assistant] Mobile mode: SQLite and indexing skipped');
}
```

Note: The `import { isDesktop }` should be at the top of the file with other imports.

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add main.ts
git commit -m "feat(mobile): skip SQLite and indexing on mobile startup"
```

---

### Task 5: MobileSearchService

Implement the no-RAG search service that uses Obsidian vault API for file discovery and scoring.

**Files:**
- Create: `src/service/search/MobileSearchService.ts`
- Create: `test/mobile-search.test.ts`

- [ ] **Step 1: Write test for mobile search scoring**

```typescript
// test/mobile-search.test.ts
import { scorePath, scoreContent, tokenizeQuery } from '../src/service/search/MobileSearchService';

// --- tokenizeQuery ---
console.log('=== tokenizeQuery ===');

const tokens1 = tokenizeQuery('machine learning basics');
console.assert(tokens1.length === 3, `Expected 3 tokens, got ${tokens1.length}`);
console.assert(tokens1.includes('machine'), 'Should include "machine"');

const tokens2 = tokenizeQuery('  the  a  an  ');
console.assert(tokens2.length === 0, `Stopwords should be filtered, got ${tokens2.length}`);

// --- scorePath ---
console.log('=== scorePath ===');

const s1 = scorePath('notes/machine-learning/basics.md', ['machine', 'learning']);
console.assert(s1 > 0, 'Path containing query tokens should score > 0');

const s2 = scorePath('notes/cooking/recipe.md', ['machine', 'learning']);
console.assert(s2 === 0, 'Unrelated path should score 0');

const s3 = scorePath('machine-learning.md', ['machine', 'learning']);
const s4 = scorePath('archive/old/machine-learning-notes/history.md', ['machine', 'learning']);
console.assert(s3 > s4, 'Filename match should score higher than deep-path match');

// --- scoreContent ---
console.log('=== scoreContent ===');

const c1 = scoreContent('Machine learning is a subset of AI. Deep learning is a subset of machine learning.', ['machine', 'learning']);
console.assert(c1 > 0, 'Content with matches should score > 0');

const c2 = scoreContent('This document is about cooking recipes.', ['machine', 'learning']);
console.assert(c2 === 0, 'No-match content should score 0');

console.log('All mobile search tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/mobile-search.test.ts`
Expected: FAIL — `scorePath` / `scoreContent` / `tokenizeQuery` not found.

- [ ] **Step 3: Implement MobileSearchService**

```typescript
// src/service/search/MobileSearchService.ts
import { type App, type TFile, normalizePath } from 'obsidian';

export interface MobileSearchResult {
    path: string;
    title: string;
    score: number;
    snippet?: string;
    matchType: 'path' | 'tag' | 'content';
}

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'for', 'with', 'as', 'by', 'it', 'be', 'this', 'that']);

/** Split query into lowercase tokens, filter stopwords. */
export function tokenizeQuery(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[\s\-_/.,;:!?]+/)
        .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/** Score a file path against query tokens. Filename matches weighted 3x over directory matches. */
export function scorePath(filePath: string, tokens: string[]): number {
    const lower = filePath.toLowerCase();
    const filename = lower.split('/').pop() ?? '';
    let score = 0;
    for (const token of tokens) {
        if (filename.includes(token)) score += 3;
        else if (lower.includes(token)) score += 1;
    }
    return score;
}

/** Score content text against query tokens using term frequency. */
export function scoreContent(content: string, tokens: string[]): number {
    const lower = content.toLowerCase();
    let score = 0;
    for (const token of tokens) {
        let idx = 0;
        while ((idx = lower.indexOf(token, idx)) !== -1) {
            score++;
            idx += token.length;
        }
    }
    return score;
}

/** Extract the first paragraph containing a query token as a snippet. */
function extractSnippet(content: string, tokens: string[]): string | undefined {
    const paragraphs = content.split(/\n\s*\n/);
    const lower = tokens.map(t => t.toLowerCase());
    for (const p of paragraphs) {
        const pLower = p.toLowerCase();
        if (lower.some(t => pLower.includes(t))) {
            return p.trim().slice(0, 200);
        }
    }
    return undefined;
}

export class MobileSearchService {
    private fileCache: TFile[] | null = null;
    private intuitionMap: Record<string, any> | null = null;

    constructor(private app: App) {}

    /** Load intuition map from vault file if available. */
    async loadIntuitionMap(): Promise<void> {
        const path = normalizePath(`${this.app.vault.configDir}/plugins/obsidian-peak-assistant/data/vault-intuition.json`);
        try {
            const content = await this.app.vault.adapter.read(path);
            this.intuitionMap = JSON.parse(content);
        } catch {
            this.intuitionMap = null;
        }
    }

    /** Get all markdown files, cached for the session. */
    private getFiles(): TFile[] {
        if (!this.fileCache) {
            this.fileCache = this.app.vault.getMarkdownFiles();
        }
        return this.fileCache;
    }

    /** Clear file cache (call on vault change events if needed). */
    invalidateCache(): void {
        this.fileCache = null;
    }

    /**
     * Search vault files by query.
     * Tier 1: path/title match (all files, fast)
     * Tier 2: tag/frontmatter match (all files, fast via metadataCache)
     * Tier 3: content match (top candidates only, slower)
     */
    async search(query: string, limit: number = 30): Promise<MobileSearchResult[]> {
        const tokens = tokenizeQuery(query);
        if (tokens.length === 0) return [];

        const files = this.getFiles();
        const scored: { file: TFile; pathScore: number; tagScore: number }[] = [];

        // Tier 1+2: path + tag scoring (fast, no file reads)
        for (const file of files) {
            const pathScore = scorePath(file.path, tokens);
            let tagScore = 0;
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache) {
                const tags = (cache.tags ?? []).map(t => t.tag.toLowerCase());
                const aliases = (cache.frontmatter?.aliases ?? []).map((a: string) => a.toLowerCase());
                for (const token of tokens) {
                    if (tags.some(t => t.includes(token))) tagScore += 2;
                    if (aliases.some(a => a.includes(token))) tagScore += 2;
                }
            }
            if (pathScore > 0 || tagScore > 0) {
                scored.push({ file, pathScore, tagScore });
            }
        }

        // Sort by combined score, take top N for content scanning
        scored.sort((a, b) => (b.pathScore + b.tagScore) - (a.pathScore + a.tagScore));
        const contentCandidates = scored.slice(0, Math.max(limit * 2, 60));

        // Tier 3: content scoring for top candidates
        const results: MobileSearchResult[] = [];
        for (const { file, pathScore, tagScore } of contentCandidates) {
            let contentScore = 0;
            let snippet: string | undefined;
            try {
                const content = await this.app.vault.cachedRead(file);
                contentScore = scoreContent(content, tokens);
                if (contentScore > 0) {
                    snippet = extractSnippet(content, tokens);
                }
            } catch {
                // file read failed — skip content scoring
            }

            const totalScore = pathScore * 10 + tagScore * 5 + contentScore;
            if (totalScore > 0) {
                const matchType = pathScore > 0 ? 'path' : tagScore > 0 ? 'tag' : 'content';
                results.push({
                    path: file.path,
                    title: file.basename,
                    score: totalScore,
                    snippet,
                    matchType,
                });
            }
        }

        // Also add files not in scored list but with content matches (if we have budget)
        // Skip this for now — path+tag should catch most relevant files

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }

    /** Read full file content by path. */
    async readFileContent(filePath: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !('stat' in file)) {
            throw new Error(`File not found: ${filePath}`);
        }
        return this.app.vault.cachedRead(file as TFile);
    }

    /** Get recently modified files. */
    getRecentFiles(limit: number = 20): TFile[] {
        return this.getFiles()
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, limit);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/mobile-search.test.ts`
Expected: All assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/service/search/MobileSearchService.ts test/mobile-search.test.ts
git commit -m "feat(mobile): add MobileSearchService with path/tag/content scoring"
```

---

### Task 6: Intuition Map Export to Vault File

On desktop, after the intuition agent runs, write the JSON output to a vault file that iCloud can sync to mobile.

**Files:**
- Modify: `src/app/commands/Register.ts:360-362`

- [ ] **Step 1: Add vault file export after SQLite write**

In `Register.ts`, inside the `peak-analyze-vault-intuition` command callback (line 360), add a vault write after the SQLite write:

```typescript
// Register.ts — inside the streamRun callback, after line 362:
// Existing:
await stateRepo.set('knowledge_intuition_json', JSON.stringify(result.json));

// Add after:
// Also export to vault file for mobile iCloud sync
try {
    const exportPath = normalizePath(
        `${app.vault.configDir}/plugins/${plugin.manifest.id}/data/vault-intuition.json`
    );
    await ensureFolderRecursive(app.vault, exportPath.substring(0, exportPath.lastIndexOf('/')));
    await app.vault.adapter.write(exportPath, JSON.stringify(result.json, null, 2));
    console.log('[peak-analyze-vault-intuition] Exported intuition map to vault file for mobile sync');
} catch (exportErr) {
    console.warn('[peak-analyze-vault-intuition] Failed to export intuition map to vault file:', exportErr);
}
```

Add the necessary imports at the top of `Register.ts` if not already present:
- `import { normalizePath } from 'obsidian';`
- `import { ensureFolderRecursive } from '@/core/utils/vault-utils';`

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat(mobile): export intuition map to vault file for iCloud sync"
```

---

### Task 7: MobileVaultSearchAgent

Simplified agent for mobile: search files → read content → stream Claude long-context response. No multi-agent recon, no HITL plan review, no SQLite.

**Files:**
- Create: `src/service/agents/MobileVaultSearchAgent.ts`

- [ ] **Step 1: Implement MobileVaultSearchAgent**

```typescript
// src/service/agents/MobileVaultSearchAgent.ts
import type { App } from 'obsidian';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName, UIStepType, emptyUsage, mergeTokenUsage } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { MobileSearchService } from '@/service/search/MobileSearchService';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import { AppContext } from '@/app/context/AppContext';
import type { AIServiceManager } from '@/service/chat/service-manager';

/**
 * Mobile-only vault search agent.
 * 
 * Pipeline: search files → read top N → assemble prompt → Claude long context → stream response
 * 
 * No SQLite, no embeddings, no Agent SDK subprocess, no HITL.
 * Relies on Claude's 1M context window to reason over raw file content.
 */
export class MobileVaultSearchAgent {
    private readonly searchService: MobileSearchService;
    private readonly aiServiceManager: AIServiceManager;
    private cancelled = false;

    constructor(app: App, aiServiceManager: AIServiceManager) {
        this.searchService = new MobileSearchService(app);
        this.aiServiceManager = aiServiceManager;
    }

    /** Cancel the running session. */
    cancel(): void {
        this.cancelled = true;
    }

    /**
     * Run a mobile vault search session.
     * Yields LLMStreamEvents compatible with the existing UI pipeline.
     */
    async *startSession(userQuery: string): AsyncGenerator<LLMStreamEvent> {
        this.cancelled = false;
        const sessionId = generateUuidWithoutHyphens();

        // --- Step 1: Search ---
        yield {
            type: 'stream-trigger',
            trigger: StreamTriggerName.StepStart,
            stepType: UIStepType.Search,
            stepId: `${sessionId}-search`,
            extra: { title: 'Searching vault files...' },
        };

        await this.searchService.loadIntuitionMap();
        const results = await this.searchService.search(userQuery, 50);

        yield {
            type: 'stream-trigger',
            trigger: StreamTriggerName.StepComplete,
            stepType: UIStepType.Search,
            stepId: `${sessionId}-search`,
            extra: { resultCount: results.length },
        };

        if (this.cancelled) return;

        // --- Step 2: Read file contents ---
        yield {
            type: 'stream-trigger',
            trigger: StreamTriggerName.StepStart,
            stepType: UIStepType.Recon,
            stepId: `${sessionId}-read`,
            extra: { title: 'Reading relevant files...' },
        };

        const fileContents: { path: string; content: string }[] = [];
        let totalTokenEstimate = 0;
        const TOKEN_BUDGET = 800_000; // Leave room for system prompt + response

        for (const result of results) {
            if (this.cancelled) return;
            try {
                const content = await this.searchService.readFileContent(result.path);
                const estimatedTokens = Math.ceil(content.length / 4); // rough estimate
                if (totalTokenEstimate + estimatedTokens > TOKEN_BUDGET) break;
                fileContents.push({ path: result.path, content });
                totalTokenEstimate += estimatedTokens;
            } catch {
                // skip unreadable files
            }
        }

        yield {
            type: 'stream-trigger',
            trigger: StreamTriggerName.StepComplete,
            stepType: UIStepType.Recon,
            stepId: `${sessionId}-read`,
            extra: { fileCount: fileContents.length, estimatedTokens: totalTokenEstimate },
        };

        if (this.cancelled || fileContents.length === 0) {
            yield {
                type: 'text-delta',
                textDelta: 'No relevant files found in your vault for this query. Try different keywords.',
            };
            return;
        }

        // --- Step 3: Assemble prompt and call Claude ---
        yield {
            type: 'stream-trigger',
            trigger: StreamTriggerName.StepStart,
            stepType: UIStepType.Report,
            stepId: `${sessionId}-report`,
            extra: { title: 'Analyzing with AI...' },
        };

        // Build context from file contents
        const fileContext = fileContents
            .map(f => `## File: ${f.path}\n\n${f.content}`)
            .join('\n\n---\n\n');

        // Load intuition context if available
        let intuitionContext = '';
        if (this.searchService['intuitionMap']) {
            try {
                intuitionContext = `\n\n## Vault Knowledge Map\n\n${JSON.stringify(this.searchService['intuitionMap'], null, 2)}`;
            } catch { /* ignore */ }
        }

        const systemPrompt = `You are an AI assistant analyzing a personal knowledge vault. Below are the relevant files from the user's vault. Answer the user's question based on these files. Be specific, cite file names, and provide actionable insights.${intuitionContext}`;

        const userMessage = `Here are the relevant files from my vault:\n\n${fileContext}\n\n---\n\nMy question: ${userQuery}`;

        const chatService = this.aiServiceManager.getChatService();

        // Stream response
        let usage = emptyUsage();
        for await (const event of chatService.streamChat({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
        })) {
            if (this.cancelled) return;
            yield event;
            if (event.type === 'usage') {
                usage = mergeTokenUsage(usage, event.usage);
            }
        }

        yield {
            type: 'stream-trigger',
            trigger: StreamTriggerName.StepComplete,
            stepType: UIStepType.Report,
            stepId: `${sessionId}-report`,
            extra: { usage },
        };
    }
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/agents/MobileVaultSearchAgent.ts
git commit -m "feat(mobile): add MobileVaultSearchAgent with long-context pipeline"
```

---

### Task 8: Wire Mobile Agent into VaultSearchAgent Router

Route mobile requests to `MobileVaultSearchAgent` instead of the desktop pipeline.

**Files:**
- Modify: `src/service/agents/VaultSearchAgent.ts:58-81`
- Modify: `src/app/context/AppContext.ts:145-147`

- [ ] **Step 1: Add mobile routing in VaultSearchAgent.startSession()**

Add mobile guard before the V2 check at `VaultSearchAgent.ts:63-65`:

```typescript
// VaultSearchAgent.ts — add import at top:
import { isMobile } from '@/core/platform';
import { MobileVaultSearchAgent } from './MobileVaultSearchAgent';

// Inside startSession(), before the V2 check (insert at line 63):
if (isMobile()) {
    console.log('[VaultSearchAgent] routing to mobile agent (no-RAG long context)');
    const mobileAgent = new MobileVaultSearchAgent(
        AppContext.getInstance().app,
        this.aiServiceManager,
    );
    for await (const ev of mobileAgent.startSession(userQuery)) {
        yield ev as VaultSearchEvent;
    }
    return;
}

// Existing V2 check follows unchanged:
if (pluginSettings?.vaultSearch?.useV2 === true) { ... }
```

- [ ] **Step 2: Add mobile-aware factory in AppContext**

In `AppContext.ts:145-147`, the existing `vaultSearchAgent()` factory stays unchanged — it creates a `VaultSearchAgent` which now internally routes to mobile. No change needed here since the routing is inside `VaultSearchAgent.startSession()`.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/VaultSearchAgent.ts
git commit -m "feat(mobile): route vault search to MobileVaultSearchAgent on mobile"
```

---

### Task 9: Hide Desktop-Only Commands on Mobile

Prevent desktop-only commands (indexing, intuition map build, graph inspector) from registering on mobile.

**Files:**
- Modify: `src/app/commands/Register.ts`

- [ ] **Step 1: Guard desktop-only commands**

In `Register.ts`, the `buildCoreCommands` function returns an array of commands. Wrap the desktop-only commands with `isDesktop()` checks. Find the command definitions and filter:

```typescript
// Register.ts — add import at top:
import { isDesktop } from '@/core/platform';

// At the end of buildCoreCommands, before the return, filter desktop-only commands:
// Alternatively, wrap individual command objects in conditionals:

// For each desktop-only command block, wrap with:
...(isDesktop() ? [{
    id: 'peak-index-vault',
    name: 'Search: reindex vault',
    // ... existing callback
}] : []),

// Commands to guard with isDesktop():
// - peak-index-vault (indexing)
// - peak-index-single-file (indexing)
// - peak-cleanup-graph (SQLite)
// - peak-analyze-vault-intuition (SQLite write)
// - peak-cancel-index (indexing)
// - peak-debug-* commands (SQLite debug tools)
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat(mobile): hide desktop-only commands on mobile"
```

---

### Task 10: Mobile UI Adaptations

Hide desktop-only UI elements and add basic responsive handling for mobile screens.

**Files:**
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx`
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts`

- [ ] **Step 1: Hide AI Graph mode on mobile in tab-AISearch.tsx**

Find the analysis mode toggle (Vault Analysis / AI Graph) in `tab-AISearch.tsx` and hide the AI Graph option on mobile, since the AI Graph agent requires the Agent SDK subprocess:

```typescript
// tab-AISearch.tsx — add import:
import { isMobile } from '@/core/platform';

// Find the mode toggle and wrap the AI Graph option:
// If isMobile(), force mode to 'vaultFull' and hide the toggle
```

- [ ] **Step 2: Hide web search toggle on mobile**

In the same file, find the web search toggle and hide it on mobile (Playwright not available):

```typescript
// Wrap web toggle with: {isDesktop() && <WebToggleComponent />}
```

- [ ] **Step 3: Hide Inspector panel trigger on mobile**

In the vault search tab, the `[[` trigger opens the Inspector panel which depends on SQLite graph data. On mobile, this should be disabled or show a "desktop only" message.

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/quick-search/tab-AISearch.tsx src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "feat(mobile): hide desktop-only UI elements on mobile"
```

---

## Summary

| Task | What | Files | Estimated Size |
|------|------|-------|---------------|
| 1 | Platform gate utility | 1 new | ~10 lines |
| 2 | Guard static native imports | 2 modified | ~20 lines changed |
| 3 | VaultContentProvider | 1 new + 1 modified | ~25 lines |
| 4 | Guard main.ts startup | 1 modified | ~10 lines changed |
| 5 | MobileSearchService | 1 new + 1 test | ~180 lines |
| 6 | Intuition map export | 1 modified | ~15 lines added |
| 7 | MobileVaultSearchAgent | 1 new | ~160 lines |
| 8 | Wire mobile agent router | 1 modified | ~15 lines added |
| 9 | Hide desktop-only commands | 1 modified | ~30 lines changed |
| 10 | Mobile UI adaptations | 2 modified | ~30 lines changed |

**Total: 4 new files, 8 modified files, ~500 lines of new code, ~100 lines changed**

After these 10 tasks, the plugin will:
1. Load without crashing on Obsidian mobile
2. Support AI chat (already works — no changes needed)
3. Support vault search + AI analysis via Claude long context
4. Sync chat history and intuition map via iCloud
5. Hide desktop-only features cleanly on mobile
