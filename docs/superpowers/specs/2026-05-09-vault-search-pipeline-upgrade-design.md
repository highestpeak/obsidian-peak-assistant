# Vault Search Pipeline Upgrade — Design Spec

## Overview

Upgrade the vault search system from a hardcoded tri-hybrid pipeline to a composable **Query Pipeline** architecture with improved matching quality, query syntax, and ranking intelligence.

**Current state**: FTS5/BM25 + Vector/KNN + Meta FTS → two-stage RRF → PPR → metadata boosts. Architecture is top-5% for personal KB plugins but has a critical BM25 scoring bug, no typo tolerance, no phrase/boolean search, and fixed fusion weights.

**Target state**: QueryParser → 5 registered Retrievers → adaptive RRF Merger → enhanced Ranker → unified HighlightEngine. Adds stemming, fuzzy matching, phrase search, boolean operators, click-through learning, and query-adaptive fusion weights.

---

## 1. QueryParser & QueryPlan

### 1.1 User-Facing Query Syntax

| Syntax | Meaning | Example |
|--------|---------|---------|
| `word` | Normal term (auto prefix match) | `obs` matches `obsidian` |
| `"exact phrase"` | Phrase exact match | `"machine learning"` |
| `-word` | Exclude results containing term | `python -snake` |
| `tag:value` | Tag filter | `tag:project` |
| `ext:pdf` | File type filter | `ext:md` |

Existing mode prefixes (`#` in-file, `@` in-folder, `:` go-to-line, `?` help) remain unchanged — they are handled before QueryParser.

### 1.2 QueryPlan Data Structure

```ts
type QueryPlan = {
  terms: QueryTerm[];        // Positive search terms (with prefix flag)
  phrases: string[];         // Exact phrase matches
  excludes: string[];        // Exclusion terms
  filters: QueryFilter[];    // tag:/ext: filters
  raw: string;               // Original input (used for embedding generation)
  retrievers: RetrieverWeights; // Dynamic per-retriever weights
};

type QueryTerm = {
  text: string;              // Normalized term
  stem: string;              // Stemmed form (Porter Stemmer for English, identity for CJK)
  isPrefix: boolean;         // Whether to do prefix matching
};

type QueryFilter = {
  field: 'tag' | 'ext' | 'folder';
  value: string;
};

type RetrieverWeights = {
  fts: number;
  ftsStem: number;
  vector: number;
  meta: number;
  fuzzy: number;
};
```

### 1.3 Adaptive Retriever Weight Logic

```ts
function computeRetrieverWeights(plan: QueryPlan): RetrieverWeights {
  const w = { fts: 1.0, ftsStem: 0.7, vector: 0.6, meta: 0.8, fuzzy: 0.3 };

  // Phrase query → suppress semantic, boost exact
  if (plan.phrases.length > 0) { w.vector *= 0.3; w.fts *= 1.2; }

  // Long query (≥3 terms) → boost semantic
  if (plan.terms.length >= 3) { w.vector *= 1.5; }

  // Single term → suppress semantic (single-word embeddings are weak)
  if (plan.terms.length === 1) { w.vector *= 0.3; }

  // CJK terms → stem is meaningless
  if (plan.terms.some(t => /[\u4e00-\u9fff\u3040-\u30ff]/.test(t.text))) {
    w.ftsStem *= 0.1;
  }

  return w;
}
```

### 1.4 File Location

`src/service/search/query/query-parser.ts` — pure function, no dependencies on SQLite or services.

---

## 2. Index Layer Enhancements

### 2.1 Stem FTS5 Table

New virtual table for stemmed content:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts_stem USING fts5(
    chunk_id UNINDEXED,
    doc_id UNINDEXED,
    content
);
```

At index time, each chunk's content is processed through `normalizeTextForFts()` then `porterStem()` before insertion. Only English tokens (matching `[a-zA-Z]+`) are stemmed; CJK and other scripts pass through unchanged.

### 2.2 Porter Stemmer

~120 lines of pure JS implementing the Porter Stemming Algorithm. File: `src/service/search/support/porter-stemmer.ts`.

The stemmer handles standard English suffixes:
- Step 1: plurals and past participles (`running` → `run`, `studies` → `studi`)
- Step 2-4: derivational suffixes (`conditional` → `condition`)
- Step 5: cleanup

### 2.3 Meta FTS Enhancement

Add `tags` column to `doc_meta_fts`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS doc_meta_fts USING fts5(
    doc_id UNINDEXED,
    path,
    title,
    tags           -- NEW: space-separated frontmatter tags
);
```

Enables `tag:value` filter via FTS5 column filter syntax: `{tags}: value`.

### 2.4 Fuzzy Matching Strategy

No trigram index. Fuzzy matching is done at query time via Levenshtein distance on title tokens:

1. FuzzyRetriever extracts distinct title tokens from `doc_meta_fts` (cached in-memory, refreshed on index changes)
2. For each query term, finds candidate tokens with Levenshtein distance ≤ 2
3. Executes FTS MATCH with candidate tokens
4. Results tagged with `matchType: 'fuzzy'` and the corrected term

Performance: ~thousands of title tokens, Levenshtein scan <10ms in JS.

### 2.5 Search Click-Through Table

```sql
CREATE TABLE IF NOT EXISTS search_click (
    query TEXT NOT NULL,
    path TEXT NOT NULL,
    rank INTEGER NOT NULL,
    ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_click_query ON search_click(query);
```

Records which result the user opened for a given query. Used by Ranker for personalized boosting. 30-day rolling window.

### 2.6 Index Migration Strategy

- All new tables use `CREATE IF NOT EXISTS` — zero impact on existing installations
- First upgrade triggers full re-index via existing `reindexAll()` mechanism
- `doc_fts_stem` writes parallel to `doc_fts` in `indexDocument()` — one extra stem transform + INSERT per chunk
- Storage increase: ~30-40% (stem table is slightly smaller than raw, but it's an additional table)

---

## 3. Retriever Registry

### 3.1 Interface

```ts
interface SearchRetriever {
  name: string;
  retrieve(plan: QueryPlan): Promise<RetrieverResult[]>;
  shouldActivate(plan: QueryPlan): boolean;
}

type RetrieverResult = {
  path: string;
  docId?: string;
  score: number;               // Retriever-local normalized score (0-1)
  content?: string;
  chunkType?: ChunkType;
  matchType: 'exact' | 'stem' | 'semantic' | 'fuzzy' | 'meta';
  source: string;              // Retriever name for merger identification
  fuzzyCorrection?: string;    // For fuzzy: the corrected term (e.g. "machine" for query "machien")
  titleHighlight?: HighlightResult;
  contentHighlight?: HighlightResult;
};
```

### 3.2 Five Retrievers

| Retriever | Data Source | shouldActivate | Notes |
|-----------|------------|----------------|-------|
| `FtsRetriever` | `doc_fts` | `plan.terms.length > 0` | BM25 with batch normalization fix. Supports `"phrase"` via FTS5 phrase syntax, `-exclude` via NOT, `prefix*` via FTS5 prefix |
| `FtsStemRetriever` | `doc_fts_stem` | `plan.terms.some(t => t.stem !== t.text)` | Only activates when stemming produces different tokens |
| `VectorRetriever` | `vec_embeddings` | `plan.retrievers.vector > 0.1` | Existing KNN logic. Uses `plan.raw` for embedding generation |
| `MetaRetriever` | `doc_meta_fts` | always `true` | Title + path + tags. Handles `tag:` and `ext:` filters |
| `FuzzyRetriever` | `doc_meta_fts` title tokens | always `true` | Levenshtein ≤ 2 on title token cache |

All five execute in parallel via `Promise.all`. No conditional second round.

### 3.3 Files

- `src/service/search/retriever/types.ts` — interface + RetrieverResult type
- `src/service/search/retriever/fts-retriever.ts`
- `src/service/search/retriever/fts-stem-retriever.ts`
- `src/service/search/retriever/vector-retriever.ts`
- `src/service/search/retriever/meta-retriever.ts`
- `src/service/search/retriever/fuzzy-retriever.ts`
- `src/service/search/retriever/registry.ts` — retriever registration + `getActive()` + `executeAll()`

### 3.4 FTS Query Building per Retriever

FtsRetriever translates QueryPlan to FTS5 syntax:

| QueryPlan Field | FTS5 Translation |
|----------------|------------------|
| `terms: [{text: "obsidian", isPrefix: true}]` | `obsidian*` |
| `phrases: ["machine learning"]` | `"machine learning"` |
| `excludes: ["snake"]` | `NOT snake` |
| `filters: [{field: "tag", value: "project"}]` | Handled as post-filter or via MetaRetriever |
| Multiple terms | Joined with `OR`, post-scored by diversity/density |

FtsStemRetriever uses the same logic but with `term.stem` instead of `term.text`.

---

## 4. Merger — Adaptive RRF Fusion

### 4.1 Per-Document Chunk Decay

A single document may produce many chunks. In the current system, all matching chunks from the same document accumulate RRF scores linearly under the same `path` key — giving long documents an unfair advantage (10 chunks = 10x score).

Fix: **diminishing returns** via exponential decay. Within each Retriever, chunks from the same document are sorted by retriever-local score (best first), and each subsequent chunk's RRF contribution is multiplied by a decay factor:

```ts
const CHUNK_DECAY = 0.5;
// Chunk 1: 1.0x RRF,  Chunk 2: 0.5x RRF,  Chunk 3: 0.25x RRF, ...
rrfContribution = baseRrf * Math.pow(CHUNK_DECAY, chunkIndex);
```

Effect: a document with 10 matching chunks scores ~2x a single-chunk document (geometric sum converges to `1 / (1 - 0.5) = 2x`), not 10x. The signal "many parts match" is preserved with diminishing returns.

### 4.2 Single-Stage RRF

Replace the current two-stage merge (`mergeContentSources` + `mergeContentAndMetaWithRRF`) with a single-pass fusion over all retriever results:

```ts
function merge(
  retrieverResults: Map<string, RetrieverResult[]>,
  plan: QueryPlan,
): MergedResult[] {
  const weights = plan.retrievers;
  const byPath = new Map<string, { rrfScore: number; best: RetrieverResult; sources: Set<string> }>();

  for (const [retrieverName, results] of retrieverResults) {
    const w = weights[retrieverName as keyof RetrieverWeights] ?? 0.5;
    for (let rank = 1; rank <= results.length; rank++) {
      const r = results[rank - 1];
      const rrfContribution = w / (RRF_K + rank);
      const existing = byPath.get(r.path);
      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.sources.add(retrieverName);
        // Keep the variant with best source score for highlight/content
        if (r.score > existing.best.score) existing.best = r;
      } else {
        byPath.set(r.path, {
          rrfScore: rrfContribution,
          best: r,
          sources: new Set([retrieverName]),
        });
      }
    }
  }

  return Array.from(byPath.values())
    .sort((a, b) => b.rrfScore - a.rrfScore);
}
```

### 4.2 Constants

- `RRF_K = 60` — unchanged. Standard value from the original RRF paper (Cormack et al. 2009).
- Per-retriever weights: dynamically computed by `computeRetrieverWeights()` (Section 1.3), not fixed constants.

### 4.3 Files

- `src/service/search/merger/rrf-merger.ts` — the merge function
- Delete: `queryService.ts` methods `mergeContentSources()` and `mergeContentAndMetaWithRRF()`

---

## 5. Ranker Improvements

### 5.1 BM25 Score Fix

Current bug at `queryService.ts:407`:
```js
// BUG: Math.max(0, negative) = 0, all results get score 1.0
const bm25Score = 1 / (1 + Math.max(0, Number(r.bm25 ?? 0)));
```

Fix: **batch normalization** within each retriever's result set:

```js
const bm25Values = rawResults.map(r => Number(r.bm25 ?? 0));
const minBm25 = Math.min(...bm25Values);  // Best (most negative)
const maxBm25 = Math.max(...bm25Values);  // Worst (least negative)
const range = maxBm25 - minBm25 || 1;
// Normalize to 0-1: best → 1.0, worst → 0.0
const bm25Score = (maxBm25 - rawBm25) / range;
```

Batch normalization is correct because BM25 absolute values are not comparable across queries, but relative ordering within a batch is meaningful.

### 5.2 Click-Through Boost

```ts
// Query search_click for current query terms (stem-matched for generalization)
const stemmedTerms = plan.terms.map(t => t.stem);
const clickedPaths = searchClickRepo.getClickedPaths(stemmedTerms, windowDays: 30);
const clickBoost = clickedPaths.has(item.path) ? 0.15 : 0;
```

Added as an additional additive boost in `applyRankingBoosts()`.

### 5.3 Metadata Boost Adjustments

| Boost | Current | New | Reason |
|-------|---------|-----|--------|
| Recency | `0.3 - days * 0.01` (zero at 30d) | `0.2 - days * 0.005` (zero at 40d) | KB is not news; 30-day decay too aggressive |
| Frequency | `log1p(openCount) * 0.15` | `log1p(openCount) * 0.10` | Prevent daily notes from always ranking first |
| Graph (related) | `0.2` (binary) | unchanged | |
| Hub tier | `0.08` / `0.04` | unchanged | |
| Hub doc type | `0.12` | unchanged | |
| Click-through | N/A | `0.15` | **NEW** |

### 5.4 PPR Integration

PPR remains unchanged — it runs after RRF merger, before metadata boosts. The pipeline:

```
Retrievers → Merger (RRF) → PPR rerank + expansion → Ranker (metadata + click boosts)
```

### 5.5 Exclude Filter

Results whose path matches any `plan.excludes` term or `plan.filters` exclusion are removed after ranking (post-filter). This is simpler and more reliable than trying to push exclusion into each retriever's SQL.

### 5.6 Result Deduplication

When multiple chunks from the same document appear, keep only the highest-scoring chunk per document. The current pipeline already deduplicates by path in RRF merge, so this is already handled. Verified: `mergeContentSources` and `mergeContentAndMetaWithRRF` both use `path` as the dedup key.

---

## 6. Highlight Engine

### 6.1 Unified Interface

Replace the dual highlight implementation (content: `highlight-builder.ts` precomputed spans; title: `VaultSearchResult.tsx` runtime regex) with a single `HighlightEngine`:

```ts
type HighlightResult = {
  text: string;
  spans: Array<{
    start: number;
    end: number;
    type: 'exact' | 'stem' | 'fuzzy';
  }>;
};

class HighlightEngine {
  // Highlight any text (titles, short strings) — uses raw text directly
  highlight(text: string, plan: QueryPlan): HighlightResult;

  // Select best snippet window then highlight (for long content)
  // Uses normalizedContent for matching, rawContent for display
  highlightSnippet(
    rawContent: string,
    normalizedContent: string,
    plan: QueryPlan,
    windowBefore?: number,  // default 80
    windowAfter?: number,   // default 140
  ): HighlightResult;
}
```

### 6.2 Raw Text Display (Critical Fix)

**Current problem**: Snippets display FTS-normalized text (`normalizeTextForFts()` output: lowercased, diacritics stripped, CJK spaces inserted), not the user's original writing. Users see processed text in search results.

**Fix**: The `highlightSnippet()` method takes TWO text inputs:

```ts
highlightSnippet(
  rawContent: string,        // From doc_chunk.content_raw — displayed to user
  normalizedContent: string, // From doc_fts.content — used for matching
  plan: QueryPlan,
): HighlightResult;
```

Process:
1. Build position map between `normalizedContent` and `rawContent` (character-level alignment)
2. Find keyword positions in `normalizedContent` (reliable matching)
3. Map positions back to `rawContent` coordinates
4. Extract snippet window from `rawContent` (user sees their original text)
5. Highlight spans reference `rawContent` positions

This requires the Retriever to JOIN `doc_chunk` to fetch `content_raw` alongside the FTS result. The SQL cost is negligible (primary key lookup).

### 6.3 Matching Process

1. Normalize query terms via `normalizeForSearch()` for matching against `normalizedContent`
2. Build position map (normalized index → raw index) for back-mapping
3. Match in order of priority:
   - Phrase matches (full phrase as substring)
   - Exact term matches
   - Stem matches (term.stem against stemmed content)
   - Fuzzy matches (if result has `fuzzyCorrection`, highlight the corrected term)
4. Map matched positions back to raw text
5. Tag each span with its type for differentiated rendering

### 6.3 Snippet Window Improvement

Current: select window with most **unique keywords**.
New: dual-factor scoring:

```ts
windowScore = uniqueKeywordCount * 2 + keywordDensity;
// keywordDensity = totalMatchChars / windowLength
```

Diversity remains primary (×2 weight), density is tiebreaker. When two windows cover the same keyword set, the denser one is selected.

### 6.4 UI Rendering

Highlights are computed at retriever/pipeline level, not in the UI component. `VaultSearchResult.tsx` receives pre-computed `HighlightResult` for both title and content, and renders spans with differentiated styles:

| Span Type | Visual Style |
|-----------|-------------|
| `exact` | `bg-amber-100 text-amber-900` (current amber highlight) |
| `stem` | `bg-amber-50 text-amber-800` (lighter amber) |
| `fuzzy` | `bg-blue-50 text-blue-800 underline decoration-dashed` (blue dashed underline) |

### 6.5 Files

- New: `src/service/search/query/highlight-engine.ts`
- Delete content from: `highlight-builder.ts` (logic migrated to HighlightEngine)
- Modify: `VaultSearchResult.tsx` — remove title regex highlight code (lines 12-44), consume pre-computed `titleHighlight` and `contentHighlight`

---

## 7. Query Syntax UX

### 7.1 Help Mode Integration

The existing `?` help mode shows available search modes. Extend it to also document query syntax operators:

```
Search Operators:
  "exact phrase"    Match exact phrase
  -word             Exclude results with word
  tag:value         Filter by tag
  ext:pdf           Filter by file type
  word              Auto prefix match (obs → obsidian)
```

### 7.2 Fuzzy Correction UI

When FuzzyRetriever contributes results, show a subtle banner below the search input:

```
Showing results for "machine" (similar to "machien")
```

Only shown when fuzzy results rank in top 5 and no exact match exists for the original term.

### 7.3 Debounce Optimization

| Mode | Current | New | Reason |
|------|---------|-----|--------|
| Vault search | 500ms | 200ms | Local SQLite, no network for FTS path |
| In-file search | 300ms | 150ms | Simple string scan |
| Go-to-line | 500ms | 100ms | Trivial operation |

Vector retriever (needs API call for embedding) can run with an independent longer debounce (500ms) and merge its results into the display asynchronously when they arrive. FTS/Meta/Fuzzy results appear instantly; vector results enrich a moment later.

### 7.4 Vector Search Async Enrichment

Pipeline splits into two timing tiers:

```
Keystroke
  → 200ms debounce
  → [FTS + FtsStem + Meta + Fuzzy] → Merger → Ranker → Display (fast, <50ms)
  → 500ms debounce
  → [Vector] → re-Merge with existing results → re-Rank → Update display (enrichment)
```

This gives instant feedback for keyword search while semantic results arrive ~300ms later without blocking.

---

## 8. Full Pipeline Flow

```
User Input
  │
  ├─ Mode prefix? (#/@/:/ ?) → existing mode handlers (unchanged)
  │
  └─ Vault search mode
       │
       QueryParser.parse(rawInput)
       │
       QueryPlan { terms, phrases, excludes, filters, retrievers }
       │
       ┌──── Tier 1 (200ms debounce) ────────────────────────────┐
       │  RetrieverRegistry.executeAll(plan, tier='fast')         │
       │    ├─ FtsRetriever.retrieve(plan)                        │
       │    ├─ FtsStemRetriever.retrieve(plan)                    │
       │    ├─ MetaRetriever.retrieve(plan)                       │
       │    └─ FuzzyRetriever.retrieve(plan)                      │
       │         ↓                                                │
       │  Merger.merge(results, plan)                             │
       │         ↓                                                │
       │  PPR.rerank(merged)                                      │
       │         ↓                                                │
       │  Ranker.applyBoosts(pprResult, signals, clickHistory)    │
       │         ↓                                                │
       │  Display results (fast path, <50ms execution)            │
       └─────────────────────────────────────────────────────────┘
       │
       ┌──── Tier 2 (500ms debounce, async) ─────────────────────┐
       │  VectorRetriever.retrieve(plan)  // needs API call       │
       │         ↓                                                │
       │  Re-merge with Tier 1 results                            │
       │  Re-rank                                                 │
       │  Update display (semantic enrichment)                    │
       └─────────────────────────────────────────────────────────┘
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

| Component | Test Focus |
|-----------|-----------|
| `QueryParser` | Syntax parsing: phrases, excludes, filters, prefix detection, CJK handling |
| `PorterStemmer` | Standard Porter test corpus (known input→output pairs) |
| `HighlightEngine` | Span positions, type tagging, phrase highlights, CJK, overlapping matches |
| `Merger` | RRF math correctness, adaptive weights, dedup behavior |
| `FuzzyRetriever` | Levenshtein candidates, distance threshold, edge cases (empty, all-CJK) |
| `computeRetrieverWeights` | Weight adjustment rules for different query patterns |

### 9.2 Integration Tests

- End-to-end: `QueryParser → Retrievers → Merger → Ranker` with a fixture vault
- BM25 score fix verification: query with known relevance ordering
- Stem search: `running` finds document containing only `run`
- Phrase search: `"machine learning"` does NOT match doc with "machine" and "learning" in separate paragraphs
- Exclude: `python -snake` excludes documents containing "snake"
- Fuzzy: `machien` returns results with fuzzy correction banner
- Click-through: repeated clicks on a result boost its ranking for similar queries

### 9.3 Existing Test Compatibility

The existing test file `test/boolean-expression-parser.test.ts` is unrelated (it tests a different parser). No existing tests break because the search pipeline currently has no unit tests — this upgrade adds the first ones.

---

## 10. Migration & Backward Compatibility

### 10.1 Database Migration

- New tables (`doc_fts_stem`, `search_click`) and new column (`doc_meta_fts.tags`) use `CREATE IF NOT EXISTS`
- `doc_meta_fts` schema change requires dropping and recreating the virtual table (FTS5 doesn't support ALTER). Wrap in a migration version check.
- First launch after upgrade triggers `reindexAll()` — user sees a brief "Rebuilding search index..." notice

### 10.2 API Compatibility

- `SearchClient.textSearch()` signature unchanged — consumers (AI Analysis, Quick Search) are unaffected
- `SearchQuery` type extended with optional `enableStemSearch`, `enableFuzzy` fields (default `true`)
- `SearchResultItem` extended with optional `matchType`, `fuzzyCorrection`, `titleHighlight` fields

### 10.3 Settings

No new user-facing settings. All features are on by default. The adaptive weight system replaces manual tuning. If future need arises, retriever weights could be exposed in settings, but YAGNI for now.

---

## 11. Files Changed Summary

### New Files

| File | Purpose |
|------|---------|
| `src/service/search/query/query-parser.ts` | QueryParser + QueryPlan types |
| `src/service/search/query/highlight-engine.ts` | Unified HighlightEngine |
| `src/service/search/retriever/types.ts` | SearchRetriever interface + RetrieverResult |
| `src/service/search/retriever/fts-retriever.ts` | FTS5 exact match retriever |
| `src/service/search/retriever/fts-stem-retriever.ts` | Stemmed FTS5 retriever |
| `src/service/search/retriever/vector-retriever.ts` | Vector KNN retriever |
| `src/service/search/retriever/meta-retriever.ts` | Title/path/tags retriever |
| `src/service/search/retriever/fuzzy-retriever.ts` | Levenshtein fuzzy retriever |
| `src/service/search/retriever/registry.ts` | Retriever registration + orchestration |
| `src/service/search/merger/rrf-merger.ts` | Adaptive RRF fusion |
| `src/service/search/support/porter-stemmer.ts` | Porter Stemming Algorithm |
| `src/service/search/support/levenshtein.ts` | Levenshtein distance function |
| `src/core/storage/sqlite/repositories/SearchClickRepo.ts` | Click-through recording + querying |

### Modified Files

| File | Changes |
|------|---------|
| `src/service/search/query/queryService.ts` | Refactor `textSearch()` to use pipeline; delete `mergeContentSources`, `mergeContentAndMetaWithRRF`, `executeFulltextSearch`, `executeVectorSearch`, `executeMetaSearch` (logic moved to retrievers) |
| `src/service/search/query/reranker.ts` | Add click-through boost; adjust recency/frequency constants |
| `src/service/search/query/highlight-builder.ts` | Deprecate; logic migrated to highlight-engine.ts |
| `src/core/storage/sqlite/ddl.ts` | Add `doc_fts_stem` table, `search_click` table, recreate `doc_meta_fts` with `tags` column |
| `src/core/constant.ts` | Remove fixed RRF weight constants (replaced by dynamic computation); adjust recency/frequency boost values |
| `src/service/search/index/indexService.ts` | Add stem index writes + tags extraction in `indexDocument()` |
| `src/ui/view/quick-search/hooks/useVaultSearch.ts` | Split debounce into Tier 1 (200ms) / Tier 2 (500ms); record click-through on file open |
| `src/ui/view/quick-search/components/VaultSearchResult.tsx` | Remove title regex highlight (lines 12-44); consume pre-computed HighlightResult; add stem/fuzzy span styles |
| `src/ui/view/quick-search/store/vaultSearchStore.ts` | Integrate QueryParser; add fuzzy correction state |
| `src/ui/view/quick-search/components/tab-VaultSearch.tsx` | Add fuzzy correction banner UI |

### Deleted Files

| File | Reason |
|------|--------|
| `src/service/search/query/highlight-builder.ts` | Replaced by `highlight-engine.ts` |
