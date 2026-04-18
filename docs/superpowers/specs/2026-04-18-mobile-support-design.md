# Mobile Support Design: iCloud + Long Context (No-RAG)

## Problem

Peak Assistant is desktop-only. The plugin crashes on Obsidian mobile at `main.ts:142` (`sqliteStoreManager.init()`) because `better-sqlite3` is a native Node.js module unavailable on iOS/Android. The user wants mobile AI chat with their knowledge base.

## Key Decisions (User-Provided)

1. **Data sync**: iCloud. No Git, no server.
2. **No RAG**: Drop embedding/vector/chunk/similarity pipeline. Use Claude 1M long context instead.
3. **Reuse AI analysis flow**: file search -> file content -> Claude API -> answer.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Plugin Startup (main.ts)              │
│                                                         │
│  1. registerTemplateEngineHelpers()          ✅ both     │
│  2. installHoverMenuGlobals()                ✅ both     │
│  3. loadData() / normalizePluginSettings()   ✅ both     │
│  4. TemplateManager (pluginDir)              ⚠️ desktop  │
│  5. AIServiceManager                         ✅ both     │
│  6. AppContext                               ✅ both     │
│  7. DocumentLoaderManager                    ✅ both     │
│  8. aiServiceManager.init()                  ✅ both     │
│  9. sqliteStoreManager.init()                ❌ desktop  │
│ 10. initializeSearchService()                ❌ desktop  │
│ 11. ViewManager / Commands / Events          ✅ both     │
│                                                         │
│  Mobile: skip steps 9-10, use MobileSearchService       │
└─────────────────────────────────────────────────────────┘
```

**Dual-mode architecture**: one codebase, two runtime paths. Desktop keeps full RAG pipeline. Mobile runs a lightweight path with file-based search + Claude long context.

## Components

### 1. Platform Gate (`src/core/platform.ts`)

A thin utility wrapping Obsidian's `Platform` object for conditional initialization.

```typescript
import { Platform } from 'obsidian';

export const isMobile = (): boolean => Platform.isMobile;
export const isDesktop = (): boolean => !Platform.isMobile;
```

Used in `main.ts` to branch initialization:

```typescript
// main.ts:141-150 — wrap in platform check
if (isDesktop()) {
    await sqliteStoreManager.init({ ... });
    await this.initializeSearchService();
    appContext.searchClient = this.searchClient!;
} else {
    // Mobile: no SQLite, no indexing
    // searchClient remains null — MobileSearchService handles queries
}
```

### 2. Mobile Search Service (`src/service/search/MobileSearchService.ts`)

Replaces `SearchClient` on mobile. No SQLite, no embeddings. Pure Obsidian vault API.

**Search strategy (tiered)**:
1. **Path/title match**: `app.vault.getMarkdownFiles()` → filter by query keywords in `file.path`
2. **Tag/frontmatter match**: `app.metadataCache.getFileCache(file)` → match tags, aliases, frontmatter fields
3. **Content match** (top N candidates): `app.vault.cachedRead(file)` → simple keyword scoring
4. **Intuition-guided boost**: if intuition map file exists, boost files in relevant partitions

```typescript
interface MobileSearchResult {
    path: string;
    title: string;
    score: number;
    snippet?: string;    // first keyword-matching paragraph
    matchType: 'path' | 'tag' | 'content' | 'intuition';
}

class MobileSearchService {
    constructor(private app: App) {}

    async search(query: string, limit?: number): Promise<MobileSearchResult[]>;
    async readFileContent(path: string): Promise<string>;
    async getRecentFiles(limit?: number): Promise<TFile[]>;
}
```

**Scoring**: Simple TF-IDF-like scoring without any vector operations. Filename match > tag match > content match. The intuition map (if available) provides partition-level boosting.

### 3. Intuition Map Export (`src/service/search/index/intuition-export.ts`)

The intuition map (knowledge graph summary) is currently stored only in SQLite (`knowledge_intuition_json`). For mobile, it needs to be a vault file so iCloud syncs it.

**Desktop export**: After `KnowledgeIntuitionAgent` generates the map, write it to:
```
.obsidian/plugins/obsidian-peak-assistant/data/vault-intuition.json
```

**Mobile read**: `MobileSearchService` reads this file on startup via `app.vault.adapter.read()`.

**Trigger**: The existing "Build Intuition Map" command in `Register.ts` already calls `KnowledgeIntuitionAgent`. Add a post-step that writes `result.json` to the vault file. This is a ~5-line change.

### 4. Mobile Agent Path (`src/service/agents/MobileVaultSearchAgent.ts`)

A simplified version of `VaultSearchAgent` for mobile. Skips the classify/decompose/recon multi-agent loop. Uses Claude's long context directly.

**Flow**:
```
user query
  → MobileSearchService.search(query)           // find relevant files
  → MobileSearchService.readFileContent(top N)   // read full content
  → assemble prompt: [intuition context] + [file contents] + [user query]
  → Claude API (streaming)                       // 1M context handles the rest
  → stream response back to UI
```

**Key differences from desktop VaultSearchAgent**:
- No probe phase (no SQLite FTS/vector)
- No recon phase (no multi-tool agent loop)
- No HITL plan review (direct answer, simpler UX for mobile)
- Files are read fully, not chunked — Claude 1M context handles long docs
- Uses `MultiProviderChatService` directly, not Agent SDK subprocess

**Context budget**: With 1M tokens (~750K words), we can fit ~100-200 full-length notes. The search service should rank well enough that top 50-100 files cover most queries.

### 5. esbuild Mobile Configuration

Currently `esbuild.config.mjs` targets `platform: "node"` and externalizes all Node builtins. Mobile needs a separate build target or conditional handling.

**Approach A (recommended): Runtime guards, single bundle**

Keep the single `main.js` output. All native module imports that are already dynamic (`require('better-sqlite3')`, `require('sqlite-vec')`, `require('electron')`) will fail gracefully at runtime on mobile — their call sites are wrapped in try/catch or guarded by `isDesktop()`.

The static imports that need fixing:
- `playwright` in `search-web.ts:1` → convert to dynamic `require()` behind `isDesktop()` guard
- `simple-git` in `DailyStatisticsService.ts:3` → convert to dynamic `require()` behind `isDesktop()` guard
- `path` / `fs` in ~10 files → these are already external; on mobile the `require()` calls fail, but the call sites need guards

**Why not a separate mobile build**: Obsidian loads one `main.js` per plugin. Two builds would require the user to manually swap files or a post-install script. A single bundle with runtime branching is simpler.

### 6. Template Loading on Mobile

`PluginDirContentProvider` uses `fs.readFileSync()` to read template files from the plugin's absolute directory. This fails on mobile.

**Fix**: Add a fallback `VaultContentProvider` that reads templates from vault files instead of the filesystem. Templates would be stored in `.obsidian/plugins/obsidian-peak-assistant/templates/` (already the current location — they're just read via `fs` instead of vault API).

```typescript
// main.ts:99-104 — already try/catch wrapped
try {
    const pluginDirAbsolute = getPluginDirAbsolute(this.manifest.id, this.app);
    this.templateManager = new TemplateManager(createPluginDirContentProvider(pluginDirAbsolute));
} catch (e) {
    // Mobile fallback: read from vault adapter
    this.templateManager = new TemplateManager(createVaultContentProvider(this.app, this.manifest.id));
}
```

The `createVaultContentProvider` would use `app.vault.adapter.read(normalizePath(...))` instead of `fs.readFileSync()`.

### 7. Chat Flow (No Changes Needed)

The chat pipeline is already mobile-compatible:
- `ConversationService` → vault file I/O via `ChatStorageService`
- `ContextBuilder` → reads vault files via `app.vault.read()`
- `MultiProviderChatService` → HTTP API calls (fetch)
- `UserProfileService` → vault file storage

No SQLite dependency in the core chat send/receive path. Chat works on mobile out of the box once startup is fixed.

### 8. UI Considerations

The existing React UI renders inside Obsidian's leaf system, which works on mobile. Key adaptations:

- **SearchModal**: Full-screen on mobile (Obsidian handles this)
- **AI Analysis tabs**: Stack vertically instead of side-by-side
- **Graph visualization**: May be too heavy for mobile; consider disabling or simplifying
- **Chat view**: Already scrollable, should work

Specific changes:
- Add `Platform.isMobile` CSS class for responsive overrides
- Hide desktop-only features (Inspector panel, Graph full-screen, local web search)
- Simplify the AI Analysis result view — report text only, no graph/mermaid on mobile

### 9. Features Disabled on Mobile

These features require desktop-only capabilities and should be hidden/disabled:

| Feature | Why | Mobile alternative |
|---------|-----|-------------------|
| SQLite full-text search | Native module | MobileSearchService |
| Vector/embedding search | SQLite + sqlite-vec | Claude long context |
| Vault indexing | SQLite writes | Not needed (no RAG) |
| Agent SDK queries | Node subprocess | Direct Claude API |
| Local web search | Playwright | Perplexity API (or disable) |
| Git statistics | simple-git subprocess | Disable |
| Python scripts | child_process | Disable |
| DOCX/PPTX parsing | Uncertain (mammoth/officeparser) | Disable initially, test later |
| Graph Inspector (full) | Depends on SQLite graph data | Disable |

## Data Flow

```
┌──────────┐    iCloud     ┌──────────┐
│ Desktop  │ ────sync────→ │  Mobile  │
│          │               │          │
│ vault/   │               │ vault/   │  ← markdown files (iCloud)
│ ├─ notes │               │ ├─ notes │
│ ├─ chat  │               │ ├─ chat  │  ← conversation history (vault md)
│ └─ data/ │               │ └─ data/ │
│   └─ vault-intuition.json│   └─ vault-intuition.json  ← intuition map
│          │               │          │
│ SQLite   │    (not       │ (none)   │  ← no SQLite on mobile
│ ├─vault  │     synced)   │          │
│ └─chat   │               │          │
└──────────┘               └──────────┘
```

Chat history is already stored as vault markdown files via `ChatStorageService`, so conversation history syncs via iCloud automatically. The only new file to sync is `vault-intuition.json`.

## Implementation Phases

### Phase M1: Startup Unblocking (Foundation)
Make the plugin load without crashing on mobile.
- Add `Platform.isMobile` guards around `sqliteStoreManager.init()` and `initializeSearchService()` in `main.ts:141-150`
- Convert static `playwright` import to dynamic in `search-web.ts:1`
- Convert static `simple-git` import to dynamic in `DailyStatisticsService.ts:3`
- Add `VaultContentProvider` fallback for template loading
- Guard `basePath` usage in `obsidian-utils.ts:getPluginDirAbsolute()`

### Phase M2: Mobile Search
Implement the no-RAG search path.
- Create `MobileSearchService` with path/tag/content search
- Create `MobileVaultSearchAgent` with simplified pipeline
- Add intuition map export to vault file (desktop-side, ~5 lines in `Register.ts`)
- Wire mobile search into the AI Analysis tab

### Phase M3: UI Adaptation
Make the UI work on small screens.
- Add mobile CSS overrides (responsive stacking)
- Hide desktop-only features when `Platform.isMobile`
- Simplify AI Analysis result view for mobile
- Test chat view on mobile viewport

### Phase M4: Testing & Polish
- Test on iOS Obsidian (real device)
- Performance profiling (file scan speed, prompt size)
- Handle edge cases: large vaults (>1000 files), long files, poor network
- Token budget management: warn user when context exceeds limits

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Large vault (>5000 files) → slow mobile file scan | Search latency | Cache file list; incremental scan; limit search to recently-modified files |
| Context overflow (>1M tokens) | API error or truncation | Token counting before send; truncate file contents to first N tokens; warn user |
| iCloud sync conflicts on chat history files | Lost messages | Obsidian's built-in conflict resolution; chat files are append-only |
| Template files not synced by iCloud | Missing prompts on mobile | Bundle essential prompts as constants (fallback); or embed in plugin |
| Obsidian mobile API differences | Runtime errors | Test early (Phase M1); use only documented Obsidian API |

## Success Criteria

1. Plugin loads without errors on iOS Obsidian
2. User can chat with AI about their notes on mobile
3. User can search vault and get AI analysis on mobile
4. Chat history syncs between desktop and mobile via iCloud
5. No regression on desktop functionality
