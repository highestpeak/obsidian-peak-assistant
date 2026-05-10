# Onboarding Index Configuration — Design Spec

## Overview

Add index level configuration to the onboarding wizard and settings, with smart defaults, error handling, and intelligent upgrade prompts for existing users.

**Current state**: Onboarding is 3 steps (Welcome → Provider → System Check). No embedding/indexing configuration. Users must manually find Settings → Profile → Embedding section after onboarding. Most users never configure it → semantic search silently disabled.

**Target state**: Onboarding is 4 steps (Welcome → Provider → **Index Config** → System Check+Index). Settings gains an "Search Index" panel. Existing users get a subtle search prompt when semantic search could help.

---

## 1. Onboarding Step 3: Index Configuration

### 1.1 Position in Flow

Inserted between Provider (step 1) and System Check (step 2), making the flow:

```
Step 0: Welcome
Step 1: AI Provider (existing)
Step 2: Index Configuration (NEW)
Step 3: System Check + Indexing (modified — now triggers indexing after SQLite init)
```

`TOTAL_STEPS` changes from 3 to 4 in `OnboardingModal.tsx`.

### 1.2 Three-Tier Selection

| Tier | Label | What it does | Requires | Est. time (1000 docs) |
|------|-------|-------------|----------|----------------------|
| `fast` | Quick Index | FTS chunking + graph nodes/edges + PageRank maintenance | Nothing (pure local) | ~30s |
| `semantic` | + Semantic Search | Everything in `fast` + embedding vectors | Embedding endpoint + model | ~5min |
| `full` | + Smart Enrichment | Everything in `semantic` + LLM tags + LLM summaries | LLM model | ~30min |

Each tier is a radio option. Selecting a higher tier includes all lower tiers.

### 1.3 Smart Defaults Based on Provider

After the user configures a provider in Step 1, the Index Config step pre-selects and pre-fills based on the provider kind:

| Provider Kind | Default Tier | Embedding Pre-fill |
|--------------|-------------|-------------------|
| `openai` | `semantic` | endpoint: `https://api.openai.com/v1`, model: `text-embedding-3-small` |
| `google` | `semantic` | endpoint: `https://generativelanguage.googleapis.com/v1beta`, model: `text-embedding-004` |
| `ollama` | `fast` | When `semantic` selected: endpoint hint `http://localhost:11434/v1`, model hint `nomic-embed-text` |
| `anthropic` | `fast` | No embedding API — show info text: "Anthropic doesn't provide embeddings. Use a separate embedding provider or stay with Quick Index." |
| `openrouter` | `fast` | No standard embedding — same info text as Anthropic |
| `perplexity` | `fast` | Same as Anthropic |
| `litellm` / `custom` | `fast` | When `semantic` selected: blank fields for manual entry |

### 1.4 Inline Embedding Config

When the user selects `semantic` or `full`, an inline configuration area expands below the tier selection:

```
Embedding Configuration
  Endpoint: [http://localhost:11434/v1____]
  Model:    [nomic-embed-text____________]
  API Key:  [____________________________]  (optional, uses provider key if blank)
  
  [Test Connection]  → "Connected ✓" or "Failed: connection refused"
```

The endpoint and model fields are pre-filled with smart defaults (Section 1.3). API key defaults to the provider's API key if left blank.

"Test Connection" calls the embedding endpoint with a short test string and shows success/failure inline (reuse the existing `testProviderConnection` pattern from `OnboardingModal.tsx`).

### 1.5 Proceed to Indexing

Clicking "Start Indexing" (or "Next") transitions to Step 3 (System Check). After SQLite initialization succeeds, the selected index level is persisted to settings and indexing begins automatically with the chosen tier.

If the user clicks "Skip" (available on all tiers), `indexLevel` is set to `fast` and no indexing runs. A notice appears: "You can start indexing anytime from Settings → Search Index."

---

## 2. Index Progress UI

### 2.1 Progress Display

During indexing (triggered from onboarding Step 3 or Settings), show a progress component:

```
Indexing vault...
Step 1/3: Building search index
████████████░░░░░░░░  234 / 500 files

Estimated time remaining: ~2 minutes
```

The step label changes per tier:
- `fast`: Step 1/2 (FTS) → Step 2/2 (Graph maintenance)
- `semantic`: Step 1/3 (FTS) → Step 2/3 (Embeddings) → Step 3/3 (Maintenance)
- `full`: Step 1/4 (FTS) → Step 2/4 (Embeddings) → Step 3/4 (LLM enrichment) → Step 4/4 (Maintenance)

### 2.2 Error Handling Dialog

When an embedding or LLM API call fails during indexing, show a modal dialog:

```
⚠ Embedding connection failed

3 files could not be processed.
Error: Connection refused (is Ollama running?)

[Continue without]    [Retry]    [Cancel]
```

| Button | Behavior |
|--------|----------|
| **Continue without** | Mark failed documents as `vector_pending` / `llm_pending`. Indexing continues with remaining files. At the end, downgrade displayed level to match what actually completed. |
| **Retry** | Retry the failed batch only. If it fails again, show the dialog again. |
| **Cancel** | Stop indexing. Already-completed FTS work is preserved (not rolled back). |

The dialog appears after the first batch failure, not per-file. Failed files are accumulated and reported as a count.

---

## 3. Settings: Search Index Panel

### 3.1 Location

New section in the Settings tab, below the Profiles section. Title: "Search Index".

### 3.2 Content

```
Search Index
─────────────────────────────────────

Current level:  [Quick Index ▾]     ← dropdown to change level
                ↳ Semantic search and smart enrichment are not configured.

Statistics:
  Indexed files:     1,234
  Pending embedding:   0
  Pending LLM:         0
  Last indexed:      2 hours ago

Embedding Configuration
  Endpoint: [________________________]
  Model:    [________________________]
  API Key:  [________________________]

[Test Connection]    [Rebuild Index]
```

### 3.3 Level Change Behavior

When the user changes the dropdown from `fast` → `semantic`:
1. Validate embedding endpoint/model are configured
2. If not configured, expand the Embedding Configuration section with a highlight
3. If configured, show confirmation: "This will generate embeddings for 1,234 files. Continue?"
4. On confirm, trigger `performStagedFullIndexing` with the new level
5. Update `settings.indexLevel`

### 3.4 Rebuild Index

"Rebuild Index" drops all existing index data and re-runs the full pipeline at the current level. Shows the same progress UI (Section 2.1). Confirmation required: "This will rebuild the entire search index. Continue?"

---

## 4. Smart Search Upgrade Prompt

### 4.1 Trigger Conditions

All must be true:
- `settings.indexLevel === 'fast'` (embedding not configured)
- User has performed ≥ 10 searches (count from `search_click` table: `SELECT COUNT(*) FROM search_click`)
- The prompt has not been dismissed in the last 7 days (tracked via `settings.searchUpgradePromptDismissedAt: number | null`)

### 4.2 Display

A single-line banner at the bottom of the vault search results list:

```
Enable semantic search for better results  →  Settings
```

Styled as muted text (`text-muted-foreground`, `text-xs`), with a subtle left border accent. "Settings" is a clickable link that opens the Settings tab and scrolls to the Search Index section.

### 4.3 Dismiss

Clicking the `×` close button on the banner sets `settings.searchUpgradePromptDismissedAt = Date.now()`. The banner won't appear again for 7 days.

### 4.4 Icon

Use `Sparkles` from lucide-react (semantic association with AI/enhancement). No emoji.

---

## 5. IndexService Changes

### 5.1 IndexLevel Type

```ts
type IndexLevel = 'fast' | 'semantic' | 'full';
```

Defined in `src/service/search/index/types.ts`.

### 5.2 Staged Indexing with Level

`performStagedFullIndexing()` in `indexInitializer.ts` gains an `indexLevel` parameter:

```ts
async performStagedFullIndexing(level: IndexLevel = 'full'): Promise<void> {
  // Step 1: FTS (always)
  await this.indexService.runCoreFtsIndexing();

  // Step 2: Embeddings (semantic or full)
  if (level === 'semantic' || level === 'full') {
    await this.indexService.runPendingVectorIndexEnrichment();
  }

  // Step 3: LLM tags + summaries (full only)
  if (level === 'full') {
    await this.indexService.runPendingLlmIndexEnrichment();
  }

  // Step 4: Graph maintenance (always)
  await this.indexService.runMobiusGlobalMaintenance('vault');
}
```

### 5.3 Incremental Indexing Respects Level

`performIncrementalIndexing()` uses `settings.indexLevel` to decide which `IndexDocumentOptions` to use for newly detected files:

| `settings.indexLevel` | `includeEmbeddings` | `includeLlmTags` | `includeLlmSummary` |
|----------------------|--------------------|-----------------|--------------------|
| `fast` | `false` | `false` | `false` |
| `semantic` | `true` | `false` | `false` |
| `full` | `true` | `true` | `true` |

This ensures new files added after initial indexing get the same treatment without requiring a full rebuild.

### 5.4 Error Callback

`performStagedFullIndexing` accepts an optional error callback for UI integration:

```ts
type IndexErrorAction = 'continue' | 'retry' | 'cancel';
type IndexErrorHandler = (error: { 
  step: string; 
  failedCount: number; 
  error: Error;
}) => Promise<IndexErrorAction>;
```

When a batch fails, the handler is called. The UI can show the error dialog (Section 2.2) and return the user's choice. If no handler is provided, default behavior is `'continue'` (silent skip, mark pending).

---

## 6. Settings Persistence

### 6.1 New Settings Fields

Add to the plugin settings type:

```ts
indexLevel: IndexLevel;                          // default: 'fast'
searchUpgradePromptDismissedAt: number | null;   // timestamp or null
```

### 6.2 Migration

Existing users upgrading the plugin get `indexLevel: 'fast'` by default. If they already have `embeddingEndpoint` and `embeddingModel` configured on their active profile, auto-detect and set `indexLevel: 'semantic'`. If they also have LLM-enriched documents (check `mobius_node` for any row with `functional_tags_status = 'done'`), set `indexLevel: 'full'`.

---

## 7. Files Changed Summary

### New Files

| File | Purpose |
|------|---------|
| `src/ui/view/modals/onboarding/IndexConfigStep.tsx` | Onboarding step 2: tier selection + embedding config |
| `src/ui/view/modals/onboarding/IndexProgressDisplay.tsx` | Progress bar + step label component (shared by onboarding and settings) |
| `src/ui/view/modals/onboarding/IndexErrorDialog.tsx` | Error handling dialog (continue/retry/cancel) |
| `src/ui/view/settings/SearchIndexSection.tsx` | Settings panel for index level, stats, embedding config |
| `src/ui/view/quick-search/components/SearchUpgradePrompt.tsx` | Smart upgrade banner in search results |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui/view/modals/OnboardingModal.tsx` | `TOTAL_STEPS` 3→4, insert IndexConfigStep, pass provider info forward, trigger indexing in SystemCheckStep |
| `src/service/search/index/indexInitializer.ts` | `performStagedFullIndexing(level)` parameter, incremental indexing respects level |
| `src/service/search/index/types.ts` | Add `IndexLevel` type |
| `src/app/settings/types.ts` | Add `indexLevel`, `searchUpgradePromptDismissedAt` fields |
| `src/ui/view/settings/PluginSettingTab.tsx` | Render `SearchIndexSection` |
| `src/ui/view/quick-search/tab-VaultSearch.tsx` | Render `SearchUpgradePrompt` conditionally |
| `src/core/profiles/presets.ts` | Add embedding pre-fill hints per provider kind |
