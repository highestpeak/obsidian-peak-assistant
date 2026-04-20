# Query Pattern Discovery & Contextual Suggestions

## Overview

Replace the current "RECENT" frequent-query chips in the AI Analysis search modal with a **pattern-based contextual suggestion system**. Instead of showing raw repeated queries, the system discovers reusable query templates (patterns) from usage history, stores them with placeholder variables and display conditions, and renders context-aware suggestions by filling placeholders with the user's current vault context.

A background **PatternDiscoveryAgent** incrementally analyzes new query records, outputs structured patterns, and a merge layer deduplicates/deprecates them over time. On cold start, seed patterns provide useful defaults until enough history accumulates.

## Data Model

### `query_pattern` Table (vault.sqlite)

```sql
CREATE TABLE IF NOT EXISTS query_pattern (
  id              TEXT PRIMARY KEY,
  template        TEXT NOT NULL,
  variables       TEXT NOT NULL,       -- JSON string array, e.g. ["activeDocumentTitle"]
  conditions      TEXT NOT NULL,       -- JSON MatchCondition object
  source          TEXT NOT NULL,       -- "default" | "discovered"
  confidence      REAL DEFAULT 1.0,   -- 0-1, agent confidence (default patterns = 1.0)
  usage_count     INTEGER DEFAULT 0,
  discovered_at   INTEGER NOT NULL,
  last_used_at    INTEGER,
  deprecated      INTEGER DEFAULT 0
);
```

### Context Variables (fixed set)

The `ContextProvider` collects a `VaultContext` snapshot when the search modal opens. All values are derived from synchronous Obsidian API calls.

**Document basics:**

| Variable | Source | Example |
|---|---|---|
| `activeDocumentTitle` | Active file title | "Competitor Analysis" |
| `activeDocumentPath` | Vault-relative path | "Projects/Competitor Analysis.md" |
| `currentFolder` | Parent folder | "Projects" |
| `documentTags` | Frontmatter tags | "product, competitor" |
| `vaultName` | Vault name | "My Knowledge Base" |

**Content features:**

| Variable | Source | Example |
|---|---|---|
| `documentKeywords` | Top 5 keywords from title + H1 + H2 | "indie dev, SaaS, pricing" |
| `firstHeading` | First H1 in document | "My SaaS Product Plan" |
| `frontmatterProperties` | All frontmatter key-value pairs | "status: draft, type: project" |
| `documentType` | Frontmatter `type` or `category` field | "project" |

**Relationship network:**

| Variable | Source | Example |
|---|---|---|
| `outgoingLinks` | `[[wikilinks]]` in current document | "Pricing Strategy, User Persona, MVP" |
| `backlinks` | Documents linking to current document | "Weekly Report, Product Roadmap" |
| `linkContext` | Text surrounding each wikilink (±20 chars) | "see [[Pricing Strategy]] for tier model" |

**Temporal/history:**

| Variable | Source | Example |
|---|---|---|
| `recentDocuments` | 5 most recently edited document titles | "Journal, Weekly Report, Book Notes" |
| `recentFolders` | Recently active folders | "Projects, Journal, Reading Notes" |
| `documentAge` | Days since document creation | "30" |

### Match Conditions

Each pattern carries a `conditions` object. A pattern is displayed only when ALL specified conditions are satisfied by the current `VaultContext`.

| Condition | Type | Semantics |
|---|---|---|
| `hasActiveDocument` | `boolean` | An active file is open |
| `folderMatch` | `string` (glob) | `currentFolder` matches glob, e.g. `"Projects/*"` |
| `tagMatch` | `string[]` | `documentTags` intersects with array (empty array = document has any tags) |
| `hasOutgoingLinks` | `boolean` | Document contains wikilinks |
| `hasBacklinks` | `boolean` | Other documents link to this one |
| `propertyMatch` | `{ key: string; value?: string }` | Frontmatter contains key (optionally matching value) |
| `keywordMatch` | `string[]` | `documentKeywords` intersects with array |
| `always` | `boolean` | Unconditionally shown |

## Pattern Discovery Agent

### Role

A lightweight agent (`PatternDiscoveryAgent`) that analyzes **incremental** query records (since last discovery run) and outputs new patterns. It does NOT see the full history — only the delta.

### Input

```typescript
interface PatternDiscoveryInput {
  newQueries: Array<{
    query: string;
    count: number;
    lastUsedAt: number;
  }>;
  existingPatterns: Array<{
    id: string;
    template: string;
    variables: string[];
    conditions: object;
  }>;
  vaultStructure: {
    folders: string[];
    commonTags: string[];
    commonProperties: string[];
  };
  availableVariables: string[];
  availableConditions: string[];
}
```

### Output (Zod-constrained structured output)

```typescript
interface DiscoveredPattern {
  template: string;
  variables: string[];
  conditions: MatchCondition;
  confidence: number;       // 0-1
  reasoning: string;        // brief explanation
}

interface PatternDiscoveryOutput {
  newPatterns: DiscoveredPattern[];
  deprecateIds: string[];   // existing pattern IDs superseded by new ones
}
```

### Trigger Mechanism

```
On plugin load:
  if (query_pattern table is empty) → insert seed patterns
  delta = ai_analysis_record.count() since lastDiscoveryTimestamp
  if (delta >= N) → run PatternDiscoveryAgent

After each AI Analysis completes:
  incrementNewQueryCounter()
  if (counter >= N) → run PatternDiscoveryAgent

N = 20 (configurable, stored in settings)
lastDiscoveryTimestamp stored in plugin settings or a metadata row
```

The agent runs in the background (non-blocking). If already running, skip.

### Merge Logic (PatternMergeService, system layer)

After agent returns `PatternDiscoveryOutput`:

1. **Dedup**: For each new pattern, compare template (normalized, variables replaced with `{}`) against existing patterns. If similarity > threshold → treat as variant, update existing instead of inserting.
2. **Insert**: Patterns passing dedup check → insert into `query_pattern` with `source = "discovered"`.
3. **Deprecate (agent-suggested)**: Mark `deprecateIds` as `deprecated = 1`.
4. **Auto-deprecate**: `discovered` patterns with `usage_count = 0` and `discovered_at` older than 30 days → `deprecated = 1`.
5. **Timestamp**: Update `lastDiscoveryTimestamp` to now.

Key: `default` patterns are never auto-deprecated — only explicitly deprecated when an agent suggests a discovered pattern supersedes them.

## Context Collection & Pattern Matching

### ContextProvider

On search modal open, synchronously builds `VaultContext`:

```typescript
class ContextProvider {
  collect(): VaultContext {
    const activeFile = app.workspace.getActiveFile();
    const metadata = activeFile ? app.metadataCache.getFileCache(activeFile) : null;
    // ... populate all fields from Obsidian API
    return context;
  }
}
```

All data sources are synchronous Obsidian APIs — no async, no LLM calls, zero latency.

### PatternMatcher

```
1. Load all query_pattern WHERE deprecated = 0
2. Evaluate each pattern's conditions against VaultContext
3. Filter to patterns where ALL conditions pass
4. Fill {variables} in template with VaultContext values
5. Sort by: usage_count DESC, last_used_at DESC
6. Return top 5-8
```

### Handling Missing Variables

If a variable referenced in `template` resolves to `null`/empty in current context, that pattern is **filtered out** (not shown with empty placeholders). The condition checks should already prevent this in most cases, but this is a safety net.

## UI Changes

### SearchModal.tsx — Replace RECENT with SUGGESTED

Current (`SearchModal.tsx:282-308`):
```
RECENT
[我的独立开发产品 idea... x834]  [search pipeline design x11]  ...
```

New:
```
SUGGESTED
[Analyze competitors of Competitor Analysis]  [Summarize progress in Projects folder]
[Relationship network of Pricing Strategy, User Persona]
```

- Label changes from "RECENT" to "SUGGESTED"
- Chips show **filled** templates (ready-to-use queries)
- Click → fill search input + trigger analysis (same as current behavior)
- Click also increments `usage_count` and updates `last_used_at`
- Area hidden when no patterns match current context
- Remove existing `frequentQueries` fetching and display logic
- Remove dependency on `default-analysis-queries.json` (can delete that file)

## Seed Patterns (Default)

Hardcoded in source (not in templates/config/), inserted on first run when table is empty.

```typescript
const SEED_PATTERNS: SeedPattern[] = [
  {
    template: "Summarize core insights about {documentKeywords} in my vault",
    variables: ["documentKeywords"],
    conditions: { hasActiveDocument: true },
  },
  {
    template: "What connections exist between {recentDocuments}?",
    variables: ["recentDocuments"],
    conditions: { always: true },
  },
  {
    template: "Overview and knowledge structure of the {currentFolder} folder",
    variables: ["currentFolder"],
    conditions: { hasActiveDocument: true },
  },
  {
    template: "Analyze the relationship network of {activeDocumentTitle} and {outgoingLinks}",
    variables: ["activeDocumentTitle", "outgoingLinks"],
    conditions: { hasOutgoingLinks: true },
  },
  {
    template: "Which notes reference {activeDocumentTitle}? What themes do they share?",
    variables: ["activeDocumentTitle"],
    conditions: { hasBacklinks: true },
  },
  {
    template: "Deep analysis of {activeDocumentTitle} with improvement suggestions",
    variables: ["activeDocumentTitle"],
    conditions: { hasActiveDocument: true },
  },
  {
    template: "Find related notes by {documentTags} tags and compare perspectives",
    variables: ["documentTags"],
    conditions: { hasActiveDocument: true, tagMatch: [] },  // tagMatch:[] = has any tags
  },
];
```

## Lifecycle

```
              ┌──────────┐
              │  default  │──── user clicks ──→ usage_count++
              └────┬─────┘
                   │ discovered pattern supersedes (agent suggests)
                   ▼
              ┌──────────┐
              │deprecated │  (retained in DB, not shown)
              └──────────┘

              ┌───────────┐
 agent ──→    │ discovered │──── user clicks ──→ usage_count++
              └─────┬─────┘
                    │ 30 days with usage_count=0 OR agent suggests deprecation
                    ▼
              ┌──────────┐
              │deprecated │
              └──────────┘
```

- `default` patterns only deprecated by explicit agent suggestion, never auto-deprecated
- `discovered` patterns auto-deprecated after 30 days of zero usage
- Deprecated records are retained (not deleted) for agent reference
- No manual user management required — fully automatic

## Files Affected

| File | Change |
|---|---|
| `src/core/storage/sqlite/ddl.ts` | Add `query_pattern` table DDL |
| `src/core/storage/sqlite/repositories/` | New `QueryPatternRepo.ts` |
| `src/service/agents/PatternDiscoveryAgent.ts` | New agent |
| `src/service/PatternMergeService.ts` | New merge logic |
| `src/service/ContextProvider.ts` | New context collector |
| `src/service/PatternMatcher.ts` | New matcher + filler |
| `src/ui/view/quick-search/SearchModal.tsx:282-308` | Replace RECENT with SUGGESTED |
| `src/core/schemas/` | Zod schema for `PatternDiscoveryOutput` |
| `templates/prompts/` | Prompt template for PatternDiscoveryAgent |
| `templates/config/default-analysis-queries.json` | Delete (replaced by seed patterns) |
| `src/core/storage/sqlite/repositories/AIAnalysisRepo.ts` | `frequentQueries()` can be removed after migration |
