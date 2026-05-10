# Vault Search Pipeline Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor vault search from hardcoded tri-hybrid pipeline to composable Query Pipeline with stemming, fuzzy matching, phrase/boolean search, adaptive RRF, click-through learning, and unified highlighting.

**Architecture:** QueryParser parses raw input → 5 registered Retrievers execute in parallel → single-stage adaptive RRF Merger → PPR + Ranker with click-through boost → HighlightEngine renders raw-text snippets. Two-tier debounce: fast (FTS/Meta/Fuzzy at 200ms) and slow (Vector at 500ms with async enrichment).

**Tech Stack:** SQLite FTS5, sqlite-vec, Porter Stemmer (custom), Levenshtein (custom), React/Zustand (UI layer).

**Spec:** `docs/superpowers/specs/2026-05-09-vault-search-pipeline-upgrade-design.md`

---

## Task 1: Porter Stemmer

**Files:**
- Create: `src/service/search/support/porter-stemmer.ts`
- Create: `test/porter-stemmer.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// test/porter-stemmer.test.ts
import { porterStem, stemText } from '../src/service/search/support/porter-stemmer';

// Standard Porter test cases
const cases: [string, string][] = [
  ['running', 'run'],
  ['studies', 'studi'],
  ['caresses', 'caress'],
  ['ponies', 'poni'],
  ['ties', 'ti'],
  ['cats', 'cat'],
  ['feed', 'feed'],
  ['agreed', 'agre'],
  ['disabled', 'disabl'],
  ['matting', 'mat'],
  ['mating', 'mate'],
  ['meeting', 'meet'],
  ['milling', 'mill'],
  ['messing', 'mess'],
  ['meetings', 'meet'],
  ['generalization', 'gener'],
  ['oscillators', 'oscil'],
  ['conditional', 'condit'],
];

for (const [input, expected] of cases) {
  const result = porterStem(input);
  if (result !== expected) {
    console.error(`FAIL: porterStem("${input}") = "${result}", expected "${expected}"`);
    process.exit(1);
  }
}

// Non-English should pass through unchanged
const nonEnglish = ['观察', 'データ', '한국어', '42', ''];
for (const input of nonEnglish) {
  const result = porterStem(input);
  if (result !== input) {
    console.error(`FAIL: porterStem("${input}") = "${result}", expected "${input}" (pass-through)`);
    process.exit(1);
  }
}

// stemText: stem all English tokens in a mixed string
const mixed = stemText('running tests with 观察 and meetings');
if (!mixed.includes('run') || !mixed.includes('test') || !mixed.includes('观察') || !mixed.includes('meet')) {
  console.error(`FAIL: stemText mixed = "${mixed}"`);
  process.exit(1);
}

console.log('All porter-stemmer tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/porter-stemmer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Porter Stemmer**

```ts
// src/service/search/support/porter-stemmer.ts

/**
 * Porter Stemming Algorithm (Porter, 1980).
 * Only stems English words ([a-zA-Z]+). All other tokens pass through unchanged.
 */

const consonant = '[^aeiou]';
const vowel = '[aeiouy]';
const C = `${consonant}[^aeiouy]*`;
const V = `${vowel}[aeiou]*`;
const mgr0 = new RegExp(`^(${C})?${V}${C}`);
const meq1 = new RegExp(`^(${C})?${V}${C}(${V})?$`);
const mgr1 = new RegExp(`^(${C})?${V}${C}${V}${C}`);
const s_v = new RegExp(`^(${C})?${vowel}`);

function step1a(w: string): string {
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ies')) return w.slice(0, -2);
  if (w.endsWith('ss')) return w;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function step1b(w: string): string {
  let stem: string;
  if (w.endsWith('eed')) {
    stem = w.slice(0, -3);
    if (mgr0.test(stem + 'ee')) return stem + 'ee';
    return w;
  }
  if (w.endsWith('ed')) {
    stem = w.slice(0, -2);
    if (s_v.test(stem)) return step1bHelper(stem);
    return w;
  }
  if (w.endsWith('ing')) {
    stem = w.slice(0, -3);
    if (s_v.test(stem)) return step1bHelper(stem);
    return w;
  }
  return w;
}

function step1bHelper(stem: string): string {
  if (stem.endsWith('at') || stem.endsWith('bl') || stem.endsWith('iz')) return stem + 'e';
  const last = stem[stem.length - 1];
  const secondLast = stem[stem.length - 2];
  if (last === secondLast && last !== 'l' && last !== 's' && last !== 'z') return stem.slice(0, -1);
  if (meq1.test(stem) && /[^aeiouwxy]$/.test(stem)) return stem + 'e';
  return stem;
}

function step1c(w: string): string {
  if (w.endsWith('y') && s_v.test(w.slice(0, -1))) return w.slice(0, -1) + 'i';
  return w;
}

const step2Map: Record<string, string> = {
  ational: 'ate', tional: 'tion', enci: 'ence', anci: 'ance', izer: 'ize',
  abli: 'able', alli: 'al', entli: 'ent', eli: 'e', ousli: 'ous',
  ization: 'ize', ation: 'ate', ator: 'ate', alism: 'al', iveness: 'ive',
  fulness: 'ful', ousness: 'ous', aliti: 'al', iviti: 'ive', biliti: 'ble',
};

function step2(w: string): string {
  for (const [suffix, replacement] of Object.entries(step2Map)) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (mgr0.test(stem)) return stem + replacement;
      return w;
    }
  }
  return w;
}

const step3Map: Record<string, string> = {
  icate: 'ic', ative: '', alize: 'al', iciti: 'ic', ical: 'ic', ful: '', ness: '',
};

function step3(w: string): string {
  for (const [suffix, replacement] of Object.entries(step3Map)) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (mgr0.test(stem)) return stem + replacement;
      return w;
    }
  }
  return w;
}

const step4Suffixes = [
  'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement',
  'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize',
];

function step4(w: string): string {
  for (const suffix of step4Suffixes) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (suffix === 'ion') {
        if (mgr1.test(stem) && /[st]$/.test(stem)) return stem;
      } else {
        if (mgr1.test(stem)) return stem;
      }
      return w;
    }
  }
  return w;
}

function step5a(w: string): string {
  if (w.endsWith('e')) {
    const stem = w.slice(0, -1);
    if (mgr1.test(stem)) return stem;
    if (meq1.test(stem) && !/[^aeiouwxy]$/.test(stem)) return stem;
  }
  return w;
}

function step5b(w: string): string {
  if (mgr1.test(w) && w.endsWith('ll')) return w.slice(0, -1);
  return w;
}

export function porterStem(word: string): string {
  if (!word || !/^[a-zA-Z]+$/.test(word)) return word;
  let w = word.toLowerCase();
  if (w.length <= 2) return w;
  w = step1a(w);
  w = step1b(w);
  w = step1c(w);
  w = step2(w);
  w = step3(w);
  w = step4(w);
  w = step5a(w);
  w = step5b(w);
  return w;
}

/**
 * Stem all English tokens in a whitespace-delimited string.
 * Non-English tokens (CJK, digits, etc.) pass through unchanged.
 */
export function stemText(text: string): string {
  if (!text) return '';
  return text.split(/\s+/).map(t => porterStem(t)).join(' ');
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test -- test/porter-stemmer.test.ts
```

Expected: `All porter-stemmer tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/service/search/support/porter-stemmer.ts test/porter-stemmer.test.ts
git commit -m "feat(search): add Porter Stemmer algorithm"
```

---

## Task 2: Levenshtein Distance

**Files:**
- Create: `src/service/search/support/levenshtein.ts`
- Create: `test/levenshtein.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// test/levenshtein.test.ts
import { levenshtein, findFuzzyCandidates } from '../src/service/search/support/levenshtein';

// Basic distance tests
const distCases: [string, string, number][] = [
  ['', '', 0],
  ['abc', '', 3],
  ['', 'abc', 3],
  ['kitten', 'sitting', 3],
  ['machine', 'machien', 2], // transposition
  ['obsidian', 'obsidian', 0],
  ['test', 'tset', 2],
  ['abc', 'abc', 0],
];

for (const [a, b, expected] of distCases) {
  const result = levenshtein(a, b);
  if (result !== expected) {
    console.error(`FAIL: levenshtein("${a}", "${b}") = ${result}, expected ${expected}`);
    process.exit(1);
  }
}

// findFuzzyCandidates: given a term and a vocabulary, find words within distance threshold
const vocab = ['machine', 'learning', 'obsidian', 'plugin', 'search', 'matching'];
const candidates = findFuzzyCandidates('machien', vocab, 2);
if (!candidates.includes('machine') || candidates.includes('learning')) {
  console.error(`FAIL: findFuzzyCandidates("machien") = ${JSON.stringify(candidates)}`);
  process.exit(1);
}

const candidates2 = findFuzzyCandidates('serch', vocab, 2);
if (!candidates2.includes('search')) {
  console.error(`FAIL: findFuzzyCandidates("serch") = ${JSON.stringify(candidates2)}`);
  process.exit(1);
}

// Empty or exact match
const exact = findFuzzyCandidates('machine', vocab, 2);
if (exact.length !== 0) { // exact match should NOT be in fuzzy candidates
  console.error(`FAIL: exact match should not return fuzzy candidates: ${JSON.stringify(exact)}`);
  process.exit(1);
}

console.log('All levenshtein tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/levenshtein.test.ts
```

- [ ] **Step 3: Implement Levenshtein**

```ts
// src/service/search/support/levenshtein.ts

/**
 * Compute Levenshtein edit distance between two strings.
 * Uses Wagner-Fischer dynamic programming (O(m*n) time, O(min(m,n)) space).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for O(min(m,n)) space
  if (a.length > b.length) [a, b] = [b, a];

  const aLen = a.length;
  const bLen = b.length;
  let prev = new Array(aLen + 1);
  let curr = new Array(aLen + 1);

  for (let i = 0; i <= aLen; i++) prev[i] = i;

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,      // deletion
        curr[i - 1] + 1,  // insertion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[aLen];
}

/**
 * Find vocabulary tokens within Levenshtein distance threshold of the query term.
 * Excludes exact matches (distance 0) — those are handled by exact FTS.
 */
export function findFuzzyCandidates(
  term: string,
  vocabulary: string[],
  maxDistance: number = 2,
): string[] {
  const lower = term.toLowerCase();
  const results: Array<{ word: string; distance: number }> = [];

  for (const word of vocabulary) {
    const wLower = word.toLowerCase();
    // Quick length filter: if length difference > maxDistance, skip
    if (Math.abs(wLower.length - lower.length) > maxDistance) continue;
    // Skip exact matches
    if (wLower === lower) continue;
    const d = levenshtein(lower, wLower);
    if (d <= maxDistance) {
      results.push({ word, distance: d });
    }
  }

  // Sort by distance (closer = better), then alphabetically for stability
  results.sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word));
  return results.map(r => r.word);
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test -- test/levenshtein.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/service/search/support/levenshtein.ts test/levenshtein.test.ts
git commit -m "feat(search): add Levenshtein distance + fuzzy candidate finder"
```

---

## Task 3: QueryParser

**Files:**
- Create: `src/service/search/query/query-parser.ts`
- Create: `test/query-parser.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// test/query-parser.test.ts
import { parseQuery, type QueryPlan } from '../src/service/search/query/query-parser';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

// Basic single term
const q1 = parseQuery('obsidian');
assert(q1.terms.length === 1, 'single term count');
assert(q1.terms[0].text === 'obsidian', 'single term text');
assert(q1.terms[0].isPrefix === true, 'single term isPrefix');
assert(q1.phrases.length === 0, 'no phrases');
assert(q1.excludes.length === 0, 'no excludes');

// Multiple terms
const q2 = parseQuery('obsidian plugin search');
assert(q2.terms.length === 3, 'multi term count');
assert(q2.terms[0].text === 'obsidian', 'multi term 0');
assert(q2.terms[2].text === 'search', 'multi term 2');

// Phrase in quotes
const q3 = parseQuery('"machine learning" tutorial');
assert(q3.phrases.length === 1, 'phrase count');
assert(q3.phrases[0] === 'machine learning', 'phrase text');
assert(q3.terms.length === 1, 'remaining term after phrase');
assert(q3.terms[0].text === 'tutorial', 'remaining term text');

// Exclude with -
const q4 = parseQuery('python -snake');
assert(q4.terms.length === 1, 'exclude: term count');
assert(q4.terms[0].text === 'python', 'exclude: term text');
assert(q4.excludes.length === 1, 'exclude count');
assert(q4.excludes[0] === 'snake', 'exclude text');

// tag: filter
const q5 = parseQuery('notes tag:project');
assert(q5.terms.length === 1, 'tag filter: term count');
assert(q5.filters.length === 1, 'filter count');
assert(q5.filters[0].field === 'tag', 'filter field');
assert(q5.filters[0].value === 'project', 'filter value');

// ext: filter
const q6 = parseQuery('report ext:pdf');
assert(q6.filters.length === 1, 'ext filter count');
assert(q6.filters[0].field === 'ext', 'ext filter field');
assert(q6.filters[0].value === 'pdf', 'ext filter value');

// Mixed: phrase + exclude + filter + term
const q7 = parseQuery('"deep learning" tutorial -beginner tag:ai');
assert(q7.phrases.length === 1, 'mixed: phrase');
assert(q7.terms.length === 1, 'mixed: term');
assert(q7.excludes.length === 1, 'mixed: exclude');
assert(q7.filters.length === 1, 'mixed: filter');

// Empty input
const q8 = parseQuery('');
assert(q8.terms.length === 0, 'empty: no terms');
assert(q8.raw === '', 'empty: raw is empty');

// CJK term — stem should equal text (no stemming for CJK)
const q9 = parseQuery('机器学习');
assert(q9.terms.length === 1, 'CJK: term count');
assert(q9.terms[0].stem === q9.terms[0].text, 'CJK: stem equals text');

// English term — stem should differ
const q10 = parseQuery('running');
assert(q10.terms[0].stem === 'run', 'stem: running → run');

// Adaptive weights: single term → vector suppressed
assert(q1.retrievers.vector < 0.3, 'single term: vector weight low');

// Adaptive weights: multi term → vector boosted
assert(q2.retrievers.vector > 0.5, 'multi term: vector weight higher');

// Adaptive weights: phrase → vector suppressed
assert(q3.retrievers.vector < 0.3, 'phrase: vector weight low');

// Adaptive weights: CJK → ftsStem suppressed
assert(q9.retrievers.ftsStem < 0.1, 'CJK: ftsStem weight near zero');

console.log('All query-parser tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/query-parser.test.ts
```

- [ ] **Step 3: Implement QueryParser**

```ts
// src/service/search/query/query-parser.ts

import { porterStem } from '@/service/search/support/porter-stemmer';
import { normalizeForSearch } from '@/service/search/support/segmenter';

export type QueryTerm = {
  text: string;       // Normalized term
  stem: string;       // Stemmed form
  isPrefix: boolean;  // Auto prefix match
};

export type QueryFilter = {
  field: 'tag' | 'ext' | 'folder';
  value: string;
};

export type RetrieverWeights = {
  fts: number;
  ftsStem: number;
  vector: number;
  meta: number;
  fuzzy: number;
};

export type QueryPlan = {
  terms: QueryTerm[];
  phrases: string[];
  excludes: string[];
  filters: QueryFilter[];
  raw: string;
  retrievers: RetrieverWeights;
};

const FILTER_PREFIXES = ['tag:', 'ext:', 'folder:'] as const;
const CJK_REGEX = /[\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/;

/**
 * Parse raw search input into a structured QueryPlan.
 * Pure function — no side effects or external dependencies beyond stemmer.
 */
export function parseQuery(raw: string): QueryPlan {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return {
      terms: [], phrases: [], excludes: [], filters: [],
      raw: '', retrievers: { fts: 0, ftsStem: 0, vector: 0, meta: 0, fuzzy: 0 },
    };
  }

  const phrases: string[] = [];
  const excludes: string[] = [];
  const filters: QueryFilter[] = [];
  const termTexts: string[] = [];

  // Extract quoted phrases first
  let remaining = trimmed;
  const phraseRegex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = phraseRegex.exec(remaining)) !== null) {
    phrases.push(match[1]);
  }
  remaining = remaining.replace(phraseRegex, ' ').trim();

  // Split remaining into tokens
  const tokens = remaining.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    // Check for exclude
    if (token.startsWith('-') && token.length > 1) {
      excludes.push(normalizeForSearch(token.slice(1)));
      continue;
    }

    // Check for filters
    let isFilter = false;
    for (const prefix of FILTER_PREFIXES) {
      if (token.toLowerCase().startsWith(prefix) && token.length > prefix.length) {
        const field = prefix.slice(0, -1) as QueryFilter['field'];
        filters.push({ field, value: token.slice(prefix.length) });
        isFilter = true;
        break;
      }
    }
    if (isFilter) continue;

    // Regular term
    termTexts.push(token);
  }

  // Build QueryTerms with normalization and stemming
  const terms: QueryTerm[] = termTexts.map(t => {
    const normalized = normalizeForSearch(t);
    const stem = porterStem(normalized);
    return {
      text: normalized,
      stem,
      isPrefix: true, // All terms are auto-prefix
    };
  });

  const retrievers = computeRetrieverWeights(terms, phrases);

  return { terms, phrases, excludes, filters, raw: trimmed, retrievers };
}

function computeRetrieverWeights(terms: QueryTerm[], phrases: string[]): RetrieverWeights {
  const w: RetrieverWeights = { fts: 1.0, ftsStem: 0.7, vector: 0.6, meta: 0.8, fuzzy: 0.3 };

  // Phrase query → suppress semantic, boost exact
  if (phrases.length > 0) {
    w.vector *= 0.3;
    w.fts *= 1.2;
  }

  // Long query (≥3 terms) → boost semantic
  if (terms.length >= 3) {
    w.vector *= 1.5;
  }

  // Single term → suppress semantic (single-word embeddings are weak)
  if (terms.length === 1) {
    w.vector *= 0.3;
  }

  // CJK terms → stem is meaningless
  if (terms.some(t => CJK_REGEX.test(t.text))) {
    w.ftsStem *= 0.1;
  }

  return w;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test -- test/query-parser.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/service/search/query/query-parser.ts test/query-parser.test.ts
git commit -m "feat(search): add QueryParser with phrase/exclude/filter/stem support"
```

---

## Task 4: DDL — New Tables + Migration

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts:460-495` (add `doc_fts_stem`, `search_click`, recreate `doc_meta_fts` with `tags`)

- [ ] **Step 1: Add `doc_fts_stem` virtual table**

After the existing `doc_fts` creation block (`ddl.ts:480-485`), add:

```ts
// FTS5 virtual table for stemmed document content (Porter Stemmer).
// Enables morphological matching: "running" matches "run".
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts_stem USING fts5(
    chunk_id UNINDEXED,
    doc_id UNINDEXED,
    content
  );
`);
```

- [ ] **Step 2: Recreate `doc_meta_fts` with `tags` column**

Replace the existing `doc_meta_fts` creation block (`ddl.ts:490-495`) with:

```ts
// FTS5 virtual table for document metadata (title/path/tags).
// Tags column enables tag:value filtering in search.
// Schema version check: if table exists without tags column, drop and recreate.
try {
  const cols = db.prepare(`PRAGMA table_info(doc_meta_fts)`).all() as Array<{ name: string }>;
  const hasTagsCol = cols.some(c => c.name === 'tags');
  if (!hasTagsCol && cols.length > 0) {
    db.exec(`DROP TABLE IF EXISTS doc_meta_fts;`);
  }
} catch { /* table doesn't exist yet, fine */ }
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS doc_meta_fts USING fts5(
    doc_id UNINDEXED,
    path,
    title,
    tags
  );
`);
```

- [ ] **Step 3: Add `search_click` table**

After the FTS blocks, add:

```ts
// Search click-through recording for personalized ranking.
db.exec(`
  CREATE TABLE IF NOT EXISTS search_click (
    query_stems TEXT NOT NULL,
    path TEXT NOT NULL,
    rank INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_search_click_query ON search_click(query_stems);
`);
```

- [ ] **Step 4: Add TypeScript schema types for new tables**

In the schema type definitions section of `ddl.ts` (around line 138-160), add:

```ts
doc_fts_stem: {
  chunk_id: string;
  doc_id: string;
  content: string;
};

search_click: {
  query_stems: string;
  path: string;
  rank: number;
  ts: number;
};
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts
git commit -m "feat(search): add doc_fts_stem, search_click tables, tags column to doc_meta_fts"
```

---

## Task 5: SearchClickRepo

**Files:**
- Create: `src/core/storage/sqlite/repositories/SearchClickRepo.ts`
- Create: `test/search-click-repo.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// test/search-click-repo.test.ts
import { SearchClickRepo } from '../src/core/storage/sqlite/repositories/SearchClickRepo';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

// Test buildQueryStems
const stems = SearchClickRepo.buildQueryStems(['running', 'test']);
assert(stems === 'run test', `buildQueryStems: got "${stems}"`);

const stems2 = SearchClickRepo.buildQueryStems(['观察', 'data']);
assert(stems2 === 'data 观察', `buildQueryStems CJK: got "${stems2}"`);

// Test with empty
const stems3 = SearchClickRepo.buildQueryStems([]);
assert(stems3 === '', `buildQueryStems empty: got "${stems3}"`);

console.log('All search-click-repo tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/search-click-repo.test.ts
```

- [ ] **Step 3: Implement SearchClickRepo**

```ts
// src/core/storage/sqlite/repositories/SearchClickRepo.ts

import type { Database } from 'better-sqlite3';
import { porterStem } from '@/service/search/support/porter-stemmer';

/**
 * Repository for search click-through signals.
 * Records which search results users open for given queries.
 * Used by Ranker for personalized ranking boost.
 */
export class SearchClickRepo {
  constructor(private db: Database) {}

  /**
   * Record a click: user searched `queryStems` and opened `path` at rank `rank`.
   */
  record(queryStems: string, path: string, rank: number): void {
    this.db.prepare(
      `INSERT INTO search_click (query_stems, path, rank, ts) VALUES (?, ?, ?, ?)`
    ).run(queryStems, path, rank, Date.now());
  }

  /**
   * Get paths that the user has clicked for queries matching the given stems.
   * Returns a Set of paths within the rolling window.
   */
  getClickedPaths(queryStems: string, windowDays: number = 30): Set<string> {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const rows = this.db.prepare(
      `SELECT DISTINCT path FROM search_click WHERE query_stems = ? AND ts > ?`
    ).all(queryStems, cutoff) as Array<{ path: string }>;
    return new Set(rows.map(r => r.path));
  }

  /**
   * Prune clicks older than the retention window.
   */
  prune(windowDays: number = 30): void {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    this.db.prepare(`DELETE FROM search_click WHERE ts < ?`).run(cutoff);
  }

  /**
   * Build a canonical query_stems string from an array of terms.
   * Stems each term, sorts alphabetically, joins with space.
   * This ensures "running tests" and "test running" produce the same key.
   */
  static buildQueryStems(terms: string[]): string {
    if (!terms.length) return '';
    return terms.map(t => porterStem(t.toLowerCase())).sort().join(' ');
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test -- test/search-click-repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/storage/sqlite/repositories/SearchClickRepo.ts test/search-click-repo.test.ts
git commit -m "feat(search): add SearchClickRepo for click-through signals"
```

---

## Task 6: Index Writes — Stem FTS + Tags

**Files:**
- Modify: `src/service/search/index/indexService.ts:855-870` (add stem FTS insert alongside existing FTS insert)
- Modify: `src/core/storage/sqlite/repositories/DocChunkRepo.ts` (add `insertFtsStem()` and `insertMetaFtsWithTags()`)

- [ ] **Step 1: Add `insertFtsStem()` to DocChunkRepo**

In `DocChunkRepo.ts`, after the existing `insertFts()` method, add:

```ts
/**
 * Insert a stemmed content chunk into doc_fts_stem for morphological matching.
 */
insertFtsStem(chunkId: string, docId: string, stemmedContent: string): void {
  this.db.prepare(
    `INSERT INTO doc_fts_stem (chunk_id, doc_id, content) VALUES (?, ?, ?)`
  ).run(chunkId, docId, stemmedContent);
}

/**
 * Delete all stemmed FTS entries for a document.
 */
deleteFtsStemByDocId(docId: string): void {
  this.db.prepare(`DELETE FROM doc_fts_stem WHERE doc_id = ?`).run(docId);
}
```

- [ ] **Step 2: Update meta FTS insert to include tags**

Find the existing `insertMetaFts()` method in `DocChunkRepo.ts` and update its signature and SQL to include tags:

```ts
insertMetaFts(docId: string, path: string, title: string, tags: string = ''): void {
  this.db.prepare(
    `INSERT INTO doc_meta_fts (doc_id, path, title, tags) VALUES (?, ?, ?, ?)`
  ).run(docId, path, title, tags);
}
```

- [ ] **Step 3: Update indexService to write stem FTS + tags**

In `indexService.ts`, find the FTS insert loop (around line 867). After the existing `docChunkRepo.insertFts()` call, add the stem insert:

```ts
import { stemText } from '@/service/search/support/porter-stemmer';

// Inside the FTS insert loop, after insertFts():
const stemmedContent = stemText(normalizedContent);
docChunkRepo.insertFtsStem(chunkId, docId, stemmedContent);
```

For tags, find the meta FTS insert call and update it:

```ts
// Extract tags from frontmatter metadata
const tags = (metadata?.tags ?? []).join(' ');
docChunkRepo.insertMetaFts(docId, docPath, title, tags);
```

- [ ] **Step 4: Update FTS deletion to also delete stem table**

Find the existing `deleteFtsByDocId()` call in the re-indexing path and add stem deletion:

```ts
docChunkRepo.deleteFtsStemByDocId(docId);
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/service/search/index/indexService.ts src/core/storage/sqlite/repositories/DocChunkRepo.ts
git commit -m "feat(search): write stemmed content + tags to new FTS tables during indexing"
```

---

## Task 7: Retriever Types + Registry

**Files:**
- Create: `src/service/search/retriever/types.ts`
- Create: `src/service/search/retriever/registry.ts`

- [ ] **Step 1: Create Retriever interface and types**

```ts
// src/service/search/retriever/types.ts

import type { ChunkType } from '@/service/search/index/chunkTypes';
import type { QueryPlan } from '@/service/search/query/query-parser';

export type MatchType = 'exact' | 'stem' | 'semantic' | 'fuzzy' | 'meta';

export type RetrieverResult = {
  path: string;
  docId?: string;
  score: number;               // Retriever-local normalized score (0-1)
  title?: string;
  content?: string;            // Normalized content (for matching)
  contentRaw?: string;         // Original raw content (for display)
  chunkType?: ChunkType;
  matchType: MatchType;
  source: string;              // Retriever name
  fuzzyCorrection?: string;    // For fuzzy: the corrected term
  lastModified?: number;
  type?: string;               // file type (md, pdf, etc.)
};

export interface SearchRetriever {
  readonly name: string;
  shouldActivate(plan: QueryPlan): boolean;
  retrieve(plan: QueryPlan): Promise<RetrieverResult[]>;
}
```

- [ ] **Step 2: Create RetrieverRegistry**

```ts
// src/service/search/retriever/registry.ts

import type { QueryPlan } from '@/service/search/query/query-parser';
import type { SearchRetriever, RetrieverResult } from './types';

/**
 * Registry of search retrievers. Manages activation and parallel execution.
 */
export class RetrieverRegistry {
  private retrievers: SearchRetriever[] = [];

  register(retriever: SearchRetriever): void {
    this.retrievers.push(retriever);
  }

  /**
   * Execute all active retrievers in parallel.
   * Returns results grouped by retriever name.
   */
  async executeAll(
    plan: QueryPlan,
    exclude?: Set<string>,
  ): Promise<Map<string, RetrieverResult[]>> {
    const active = this.retrievers.filter(r => {
      if (exclude?.has(r.name)) return false;
      return r.shouldActivate(plan);
    });

    const entries = await Promise.all(
      active.map(async (r) => {
        try {
          const results = await r.retrieve(plan);
          return [r.name, results] as const;
        } catch (error) {
          console.error(`[RetrieverRegistry] ${r.name} failed:`, error);
          return [r.name, []] as const;
        }
      }),
    );

    return new Map(entries);
  }

  getRegistered(): readonly SearchRetriever[] {
    return this.retrievers;
  }
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/service/search/retriever/types.ts src/service/search/retriever/registry.ts
git commit -m "feat(search): add SearchRetriever interface and RetrieverRegistry"
```

---

## Task 8: FtsRetriever (with BM25 fix + chunk decay)

**Files:**
- Create: `src/service/search/retriever/fts-retriever.ts`
- Create: `test/fts-retriever.test.ts`

- [ ] **Step 1: Write the test for BM25 normalization and chunk decay**

```ts
// test/fts-retriever.test.ts
import { normalizeBm25Scores, applyChunkDecay } from '../src/service/search/retriever/fts-retriever';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

// BM25 batch normalization: most negative → 1.0, least negative → 0.0
const scores = normalizeBm25Scores([-25, -10, -5, -1]);
assert(Math.abs(scores[0] - 1.0) < 0.01, `best bm25 should be ~1.0, got ${scores[0]}`);
assert(Math.abs(scores[3] - 0.0) < 0.01, `worst bm25 should be ~0.0, got ${scores[3]}`);
assert(scores[1] > scores[2], `bm25 -10 should score higher than -5`);

// Single result: should get 1.0
const single = normalizeBm25Scores([-5]);
assert(single[0] === 1.0, `single bm25 should be 1.0, got ${single[0]}`);

// Chunk decay: same document's chunks get diminishing scores
type ChunkHit = { path: string; score: number; content: string };
const chunks: ChunkHit[] = [
  { path: 'a.md', score: 0.9, content: 'c1' },
  { path: 'a.md', score: 0.7, content: 'c2' },
  { path: 'a.md', score: 0.5, content: 'c3' },
  { path: 'b.md', score: 0.8, content: 'c4' },
];
const decayed = applyChunkDecay(chunks, 0.5);
// a.md: 3 chunks → sum = 0.9*1 + 0.7*0.5 + 0.5*0.25 = 0.9+0.35+0.125 = 1.375
// b.md: 1 chunk → 0.8
assert(decayed.length === 2, `should deduplicate to 2 docs, got ${decayed.length}`);
assert(decayed[0].path === 'a.md', `first should be a.md`);
assert(Math.abs(decayed[0].score - 1.375) < 0.01, `a.md score: ${decayed[0].score}`);
assert(decayed[0].content === 'c1', `should keep best chunk content`);
assert(Math.abs(decayed[1].score - 0.8) < 0.01, `b.md score: ${decayed[1].score}`);

console.log('All fts-retriever tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/fts-retriever.test.ts
```

- [ ] **Step 3: Implement FtsRetriever**

```ts
// src/service/search/retriever/fts-retriever.ts

import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { normalizeTextForFts } from '@/service/search/support/segmenter';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

const CHUNK_DECAY = 0.5;

/**
 * Batch-normalize BM25 scores to 0-1 range.
 * FTS5 bm25() returns negative values (more negative = better match).
 * best → 1.0, worst → 0.0.
 */
export function normalizeBm25Scores(bm25Values: number[]): number[] {
  if (bm25Values.length === 0) return [];
  if (bm25Values.length === 1) return [1.0];
  const min = Math.min(...bm25Values); // Most negative = best
  const max = Math.max(...bm25Values); // Least negative = worst
  const range = max - min || 1;
  return bm25Values.map(v => (max - v) / range);
}

/**
 * Apply exponential decay to chunks from the same document.
 * Groups by path, sorts by score desc, applies CHUNK_DECAY^index,
 * sums into one entry per document.
 */
export function applyChunkDecay<T extends { path: string; score: number; content: string }>(
  chunks: T[],
  decay: number = CHUNK_DECAY,
): T[] {
  const byPath = new Map<string, T[]>();
  for (const chunk of chunks) {
    const list = byPath.get(chunk.path) ?? [];
    list.push(chunk);
    byPath.set(chunk.path, list);
  }

  const results: T[] = [];
  for (const [, docChunks] of byPath) {
    // Sort by score descending (best first)
    docChunks.sort((a, b) => b.score - a.score);
    let totalScore = 0;
    for (let i = 0; i < docChunks.length; i++) {
      totalScore += docChunks[i].score * Math.pow(decay, i);
    }
    // Keep best chunk's data, update score
    results.push({ ...docChunks[0], score: totalScore });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Build FTS5 query from QueryPlan.
 * Supports: terms (OR-joined, prefix with *), phrases, excludes (NOT).
 */
function buildFtsQuery(plan: QueryPlan, useStem: boolean = false): string {
  const parts: string[] = [];

  // Terms: each as prefix match, joined with OR
  const termTokens = plan.terms.map(t => {
    const text = useStem ? t.stem : t.text;
    const escaped = text.includes('"') ? text.replace(/"/g, '""') : text;
    return t.isPrefix ? `${escaped}*` : escaped;
  });
  if (termTokens.length > 0) {
    parts.push(termTokens.join(' OR '));
  }

  // Phrases: quoted for exact matching
  for (const phrase of plan.phrases) {
    const normalizedPhrase = normalizeTextForFts(phrase);
    parts.push(`"${normalizedPhrase}"`);
  }

  if (parts.length === 0) return '';

  // Combine positive parts
  let query = parts.length === 1 ? parts[0] : parts.join(' OR ');

  // Excludes: NOT term
  for (const ex of plan.excludes) {
    query += ` NOT ${ex}`;
  }

  return query;
}

export class FtsRetriever implements SearchRetriever {
  readonly name = 'fts';

  shouldActivate(plan: QueryPlan): boolean {
    return plan.terms.length > 0 || plan.phrases.length > 0;
  }

  async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
    const manager = SqliteStoreManager.getInstance();
    const docChunkRepo = manager.getDocChunkRepo();
    if (!docChunkRepo) return [];

    const ftsQuery = buildFtsQuery(plan);
    if (!ftsQuery) return [];

    const scopeMode = 'vault'; // TODO: respect plan scope if needed
    const rawResults = docChunkRepo.searchFts(ftsQuery, scopeMode, {}, 100);

    if (rawResults.length === 0) return [];

    // Batch-normalize BM25 scores
    const bm25Values = rawResults.map(r => Number(r.bm25 ?? 0));
    const normalizedScores = normalizeBm25Scores(bm25Values);

    // Apply keyword diversity/density boosts
    const keywords = plan.terms.map(t => t.text);
    const items: RetrieverResult[] = rawResults.map((r, i) => {
      const content = r.content ?? '';
      const contentLower = content.toLowerCase();
      const keywordMatchCount = keywords.filter(k => contentLower.includes(k)).length;
      const diversityRatio = keywords.length > 0 ? keywordMatchCount / keywords.length : 0;
      const diversityBoost = 1 + diversityRatio * 0.5;

      const score = normalizedScores[i] * diversityBoost;

      return {
        path: r.path,
        docId: r.doc_id,
        score,
        content,
        contentRaw: r.content_raw ?? content,
        matchType: 'exact' as const,
        source: this.name,
        title: r.title,
        lastModified: Number(r.mtime ?? 0),
        type: r.type,
      };
    });

    // Apply chunk decay (group by doc, diminishing returns)
    return applyChunkDecay(items);
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test -- test/fts-retriever.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/service/search/retriever/fts-retriever.ts test/fts-retriever.test.ts
git commit -m "feat(search): add FtsRetriever with BM25 batch normalization + chunk decay"
```

---

## Task 9: FtsStemRetriever

**Files:**
- Create: `src/service/search/retriever/fts-stem-retriever.ts`

- [ ] **Step 1: Implement FtsStemRetriever**

Structurally identical to FtsRetriever but queries `doc_fts_stem` with stemmed terms. Reuses `normalizeBm25Scores` and `applyChunkDecay` from `fts-retriever.ts`.

```ts
// src/service/search/retriever/fts-stem-retriever.ts

import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { normalizeBm25Scores, applyChunkDecay } from './fts-retriever';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Stem-based FTS retriever. Queries the doc_fts_stem table (Porter-stemmed content).
 * Catches morphological variants: "running" matches documents containing "run".
 */
export class FtsStemRetriever implements SearchRetriever {
  readonly name = 'ftsStem';

  shouldActivate(plan: QueryPlan): boolean {
    // Only activate when stemming produces different tokens
    return plan.terms.some(t => t.stem !== t.text);
  }

  async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
    const manager = SqliteStoreManager.getInstance();
    const docChunkRepo = manager.getDocChunkRepo();
    if (!docChunkRepo) return [];

    // Build FTS query using stemmed terms
    const stemTokens = plan.terms
      .filter(t => t.stem !== t.text) // Only stems that differ from original
      .map(t => t.isPrefix ? `${t.stem}*` : t.stem);

    if (stemTokens.length === 0) return [];
    const ftsQuery = stemTokens.join(' OR ');

    const rawResults = docChunkRepo.searchFtsStem(ftsQuery, 100);
    if (rawResults.length === 0) return [];

    const bm25Values = rawResults.map(r => Number(r.bm25 ?? 0));
    const normalizedScores = normalizeBm25Scores(bm25Values);

    const items: RetrieverResult[] = rawResults.map((r, i) => ({
      path: r.path,
      docId: r.doc_id,
      score: normalizedScores[i],
      content: r.content ?? '',
      contentRaw: r.content_raw ?? r.content ?? '',
      matchType: 'stem' as const,
      source: this.name,
      title: r.title,
      lastModified: Number(r.mtime ?? 0),
      type: r.type,
    }));

    return applyChunkDecay(items);
  }
}
```

- [ ] **Step 2: Add `searchFtsStem()` to DocChunkRepo**

In `DocChunkRepo.ts`, after the existing `searchFts()` method, add:

```ts
/**
 * Search the stemmed FTS5 table. Same structure as searchFts() but targets doc_fts_stem.
 */
searchFtsStem(query: string, limit: number = 50): Array<Record<string, any>> {
  return this.db.prepare(`
    SELECT f.chunk_id, f.doc_id, dm.path, f.content,
      dc.content_raw, dc.content_raw as content_raw,
      bm25(doc_fts_stem) as bm25,
      id.title, id.mtime, id.type
    FROM doc_fts_stem f
    INNER JOIN mobius_node dm ON f.doc_id = dm.id
    LEFT JOIN doc_chunk dc ON f.chunk_id = dc.id
    LEFT JOIN indexed_document id ON dm.path = id.path
    WHERE doc_fts_stem MATCH ?
    ORDER BY bm25 ASC
    LIMIT ?
  `).all(query, limit);
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/service/search/retriever/fts-stem-retriever.ts src/core/storage/sqlite/repositories/DocChunkRepo.ts
git commit -m "feat(search): add FtsStemRetriever for morphological matching"
```

---

## Task 10: MetaRetriever

**Files:**
- Create: `src/service/search/retriever/meta-retriever.ts`

- [ ] **Step 1: Implement MetaRetriever**

Extracts meta search logic from `queryService.ts:545-644`, adds tag/ext filter support.

```ts
// src/service/search/retriever/meta-retriever.ts

import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { normalizeBm25Scores } from './fts-retriever';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export class MetaRetriever implements SearchRetriever {
  readonly name = 'meta';

  shouldActivate(_plan: QueryPlan): boolean {
    return true; // Always active
  }

  async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
    const manager = SqliteStoreManager.getInstance();
    const docChunkRepo = manager.getDocChunkRepo();
    if (!docChunkRepo) return [];

    // Build meta FTS query
    const parts: string[] = [];
    for (const t of plan.terms) {
      parts.push(t.isPrefix ? `${t.text}*` : t.text);
    }
    for (const phrase of plan.phrases) {
      parts.push(`"${phrase}"`);
    }
    // Tag filter: use FTS5 column filter syntax
    for (const f of plan.filters) {
      if (f.field === 'tag') {
        parts.push(`{tags}: ${f.value}`);
      }
    }

    if (parts.length === 0) return [];
    let ftsQuery = parts.join(' OR ');
    for (const ex of plan.excludes) {
      ftsQuery += ` NOT ${ex}`;
    }

    const rawResults = docChunkRepo.searchMetaFts(ftsQuery, 'vault', {}, 50);
    if (rawResults.length === 0) return [];

    const bm25Values = rawResults.map(r => Number(r.bm25 ?? 0));
    const normalizedScores = normalizeBm25Scores(bm25Values);

    // Apply keyword diversity boost (higher weight for meta — 0.8)
    const keywords = plan.terms.map(t => t.text);
    let items: RetrieverResult[] = rawResults.map((r, i) => {
      const titleLower = (r.title ?? '').toLowerCase();
      const pathLower = (r.path ?? '').toLowerCase();
      const combined = titleLower + ' ' + pathLower;
      const keywordMatchCount = keywords.filter(k => combined.includes(k)).length;
      const diversityRatio = keywords.length > 0 ? keywordMatchCount / keywords.length : 0;
      const diversityBoost = 1 + diversityRatio * 0.8;

      return {
        path: r.path,
        docId: r.doc_id,
        score: normalizedScores[i] * diversityBoost,
        matchType: 'meta' as const,
        source: this.name,
        title: r.title,
        lastModified: Number(r.mtime ?? 0),
        type: r.type,
      };
    });

    // Apply ext: filter as post-filter (FTS5 can't filter by extension)
    const extFilters = plan.filters.filter(f => f.field === 'ext');
    if (extFilters.length > 0) {
      const allowedExts = new Set(extFilters.map(f => f.value.toLowerCase()));
      items = items.filter(item => {
        const ext = item.path?.split('.').pop()?.toLowerCase() ?? '';
        return allowedExts.has(ext);
      });
    }

    return items;
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/service/search/retriever/meta-retriever.ts
git commit -m "feat(search): add MetaRetriever with tag/ext filter support"
```

---

## Task 11: VectorRetriever

**Files:**
- Create: `src/service/search/retriever/vector-retriever.ts`

- [ ] **Step 1: Implement VectorRetriever**

Extracts vector search logic from `queryService.ts:437-540`.

```ts
// src/service/search/retriever/vector-retriever.ts

import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { applyChunkDecay } from './fts-retriever';
import { SqliteStoreManager, sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { embedText } from '@/core/embeddings/embedClient';
import { ProfileRegistry } from '@/app/settings/ProfileRegistry';

export class VectorRetriever implements SearchRetriever {
  readonly name = 'vector';

  shouldActivate(plan: QueryPlan): boolean {
    // Check weight threshold and embedding availability
    if ((plan.retrievers.vector ?? 0) < 0.1) return false;
    if (!sqliteStoreManager.isVectorSearchEnabled()) return false;
    const registry = ProfileRegistry.getInstance();
    const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
    return !!(embProfile?.embeddingEndpoint && embProfile?.embeddingModel);
  }

  async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
    const manager = SqliteStoreManager.getInstance();
    const embeddingRepo = manager.getEmbeddingRepo();
    const docChunkRepo = manager.getDocChunkRepo();
    if (!embeddingRepo || !docChunkRepo) return [];

    // Generate embedding for the raw query
    let embedding: number[];
    try {
      embedding = await embedText(plan.raw);
    } catch (error) {
      console.error('[VectorRetriever] Embedding generation failed:', error);
      return [];
    }

    // KNN search
    const knnResults = embeddingRepo.searchSimilar(embedding, 50);
    if (!knnResults || knnResults.length === 0) return [];

    // Convert distance to similarity score (0-1)
    const items: RetrieverResult[] = knnResults.map(r => ({
      path: r.path ?? '',
      docId: r.doc_id,
      score: 1 / (1 + (r.distance ?? 1)), // L2 distance → similarity
      content: r.content ?? '',
      contentRaw: r.content_raw ?? r.content ?? '',
      matchType: 'semantic' as const,
      source: this.name,
      title: r.title,
      lastModified: Number(r.mtime ?? 0),
      type: r.type,
      chunkType: r.chunk_type,
    }));

    return applyChunkDecay(items);
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/service/search/retriever/vector-retriever.ts
git commit -m "feat(search): add VectorRetriever wrapping existing KNN search"
```

---

## Task 12: FuzzyRetriever

**Files:**
- Create: `src/service/search/retriever/fuzzy-retriever.ts`
- Create: `test/fuzzy-retriever.test.ts`

- [ ] **Step 1: Write the test**

```ts
// test/fuzzy-retriever.test.ts
import { buildTitleTokenCache, findFuzzyTerms } from '../src/service/search/retriever/fuzzy-retriever';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

// Build token cache from title rows
const titles = [
  { title: 'Machine Learning Basics' },
  { title: 'Deep Learning Tutorial' },
  { title: 'Obsidian Plugin Development' },
  { title: 'Search Algorithm Design' },
];
const cache = buildTitleTokenCache(titles);
assert(cache.includes('machine'), `cache should contain "machine", got: ${cache.join(',')}`);
assert(cache.includes('obsidian'), `cache should contain "obsidian"`);
// Should be unique tokens
const uniqueCount = new Set(cache).size;
assert(uniqueCount === cache.length, `cache should have unique tokens`);

// Find fuzzy corrections
const corrections = findFuzzyTerms(['machien'], cache);
assert(corrections.length === 1, `should find 1 correction`);
assert(corrections[0].original === 'machien', `original should be machien`);
assert(corrections[0].corrected === 'machine', `corrected should be machine`);

// No corrections for exact match
const noCorrections = findFuzzyTerms(['machine'], cache);
assert(noCorrections.length === 0, `exact match should not return corrections`);

// No corrections for unrelated
const unrelated = findFuzzyTerms(['xyzabc'], cache);
assert(unrelated.length === 0, `unrelated should not match`);

console.log('All fuzzy-retriever tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/fuzzy-retriever.test.ts
```

- [ ] **Step 3: Implement FuzzyRetriever**

```ts
// src/service/search/retriever/fuzzy-retriever.ts

import type { SearchRetriever, RetrieverResult } from './types';
import type { QueryPlan } from '@/service/search/query/query-parser';
import { findFuzzyCandidates } from '@/service/search/support/levenshtein';
import { normalizeBm25Scores } from './fts-retriever';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

type FuzzyCorrection = { original: string; corrected: string };

// In-memory title token cache, refreshed on demand
let titleTokenCache: string[] = [];
let titleTokenCacheTs = 0;
const CACHE_TTL_MS = 60_000; // Refresh every 60s

/**
 * Build a unique token list from document titles.
 * Exported for testing.
 */
export function buildTitleTokenCache(
  titleRows: Array<{ title?: string | null }>,
): string[] {
  const tokens = new Set<string>();
  for (const row of titleRows) {
    if (!row.title) continue;
    for (const word of row.title.toLowerCase().split(/[\s\-_/.,;:!?()\[\]{}]+/)) {
      if (word.length >= 2) tokens.add(word);
    }
  }
  return Array.from(tokens);
}

/**
 * Find fuzzy corrections for query terms against the token cache.
 * Returns corrections (not exact matches).
 */
export function findFuzzyTerms(
  queryTerms: string[],
  cache: string[],
): FuzzyCorrection[] {
  const corrections: FuzzyCorrection[] = [];
  for (const term of queryTerms) {
    const candidates = findFuzzyCandidates(term, cache, 2);
    if (candidates.length > 0) {
      corrections.push({ original: term, corrected: candidates[0] });
    }
  }
  return corrections;
}

export class FuzzyRetriever implements SearchRetriever {
  readonly name = 'fuzzy';

  shouldActivate(_plan: QueryPlan): boolean {
    return true; // Always active
  }

  async retrieve(plan: QueryPlan): Promise<RetrieverResult[]> {
    if (plan.terms.length === 0) return [];

    const manager = SqliteStoreManager.getInstance();
    const docChunkRepo = manager.getDocChunkRepo();
    if (!docChunkRepo) return [];

    // Refresh title token cache if stale
    if (Date.now() - titleTokenCacheTs > CACHE_TTL_MS) {
      const allTitles = docChunkRepo.getAllMetaTitles();
      titleTokenCache = buildTitleTokenCache(allTitles);
      titleTokenCacheTs = Date.now();
    }

    // Find fuzzy corrections for each query term
    const termTexts = plan.terms.map(t => t.text);
    const corrections = findFuzzyTerms(termTexts, titleTokenCache);
    if (corrections.length === 0) return [];

    // Search meta FTS with corrected terms
    const correctedQuery = corrections.map(c => `${c.corrected}*`).join(' OR ');
    const rawResults = docChunkRepo.searchMetaFts(correctedQuery, 'vault', {}, 30);
    if (rawResults.length === 0) return [];

    const bm25Values = rawResults.map(r => Number(r.bm25 ?? 0));
    const normalizedScores = normalizeBm25Scores(bm25Values);

    return rawResults.map((r, i) => ({
      path: r.path,
      docId: r.doc_id,
      score: normalizedScores[i],
      matchType: 'fuzzy' as const,
      source: this.name,
      title: r.title,
      lastModified: Number(r.mtime ?? 0),
      type: r.type,
      fuzzyCorrection: corrections[0]?.corrected,
    }));
  }
}
```

- [ ] **Step 4: Add `getAllMetaTitles()` to DocChunkRepo**

```ts
/**
 * Get all unique titles from doc_meta_fts. Used by FuzzyRetriever for title token cache.
 */
getAllMetaTitles(): Array<{ title: string | null }> {
  return this.db.prepare(`SELECT DISTINCT title FROM doc_meta_fts`).all() as Array<{ title: string | null }>;
}
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm run test -- test/fuzzy-retriever.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/service/search/retriever/fuzzy-retriever.ts test/fuzzy-retriever.test.ts src/core/storage/sqlite/repositories/DocChunkRepo.ts
git commit -m "feat(search): add FuzzyRetriever with Levenshtein title token matching"
```

---

## Task 13: RRF Merger

**Files:**
- Create: `src/service/search/merger/rrf-merger.ts`
- Create: `test/rrf-merger.test.ts`

- [ ] **Step 1: Write the test**

```ts
// test/rrf-merger.test.ts
import { rrfMerge } from '../src/service/search/merger/rrf-merger';
import type { RetrieverResult } from '../src/service/search/retriever/types';
import type { RetrieverWeights } from '../src/service/search/query/query-parser';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

const weights: RetrieverWeights = { fts: 1.0, ftsStem: 0.7, vector: 0.6, meta: 0.8, fuzzy: 0.3 };

const makeResult = (path: string, score: number, source: string): RetrieverResult => ({
  path, score, source, matchType: 'exact', content: '',
});

// Test: doc appearing in multiple retrievers gets higher score
const results = new Map<string, RetrieverResult[]>();
results.set('fts', [
  makeResult('a.md', 0.9, 'fts'),
  makeResult('b.md', 0.7, 'fts'),
]);
results.set('meta', [
  makeResult('a.md', 0.8, 'meta'),
  makeResult('c.md', 0.9, 'meta'),
]);

const merged = rrfMerge(results, weights);
// a.md appears in both fts (rank 1) and meta (rank 1) → highest combined score
assert(merged[0].path === 'a.md', `first should be a.md (in both), got ${merged[0].path}`);
assert(merged.length === 3, `should have 3 unique docs, got ${merged.length}`);
// a.md score = fts_weight/(60+1) + meta_weight/(60+1) = 1.0/61 + 0.8/61 ≈ 0.0295
assert(merged[0].rrfScore > merged[1].rrfScore, 'a.md should score higher than single-source docs');

// Test: sources tracking
assert(merged[0].sources.has('fts') && merged[0].sources.has('meta'), 'a.md sources should include both');

// Test: empty input
const emptyMerged = rrfMerge(new Map(), weights);
assert(emptyMerged.length === 0, 'empty input → empty output');

console.log('All rrf-merger tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/rrf-merger.test.ts
```

- [ ] **Step 3: Implement RRF Merger**

```ts
// src/service/search/merger/rrf-merger.ts

import type { RetrieverResult } from '@/service/search/retriever/types';
import type { RetrieverWeights } from '@/service/search/query/query-parser';

const RRF_K = 60;

export type MergedResult = {
  path: string;
  rrfScore: number;
  best: RetrieverResult;    // Best-scoring variant for content/highlight
  sources: Set<string>;     // Which retrievers contributed
};

/**
 * Single-stage adaptive RRF fusion across all retriever results.
 * Each retriever's contribution is weighted by the plan's adaptive weights.
 */
export function rrfMerge(
  retrieverResults: Map<string, RetrieverResult[]>,
  weights: RetrieverWeights,
): MergedResult[] {
  const byPath = new Map<string, MergedResult>();

  for (const [retrieverName, results] of retrieverResults) {
    const w = (weights as Record<string, number>)[retrieverName] ?? 0.5;
    for (let rank = 0; rank < results.length; rank++) {
      const r = results[rank];
      const rrfContribution = w / (RRF_K + rank + 1); // rank is 1-based in formula

      const existing = byPath.get(r.path);
      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.sources.add(retrieverName);
        if (r.score > existing.best.score) {
          existing.best = r;
        }
      } else {
        byPath.set(r.path, {
          path: r.path,
          rrfScore: rrfContribution,
          best: r,
          sources: new Set([retrieverName]),
        });
      }
    }
  }

  return Array.from(byPath.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test -- test/rrf-merger.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/service/search/merger/rrf-merger.ts test/rrf-merger.test.ts
git commit -m "feat(search): add adaptive RRF Merger with multi-source fusion"
```

---

## Task 14: Ranker Updates

**Files:**
- Modify: `src/service/search/query/reranker.ts:309-378` (add click boost, adjust constants)

- [ ] **Step 1: Add click-through boost parameter**

In `reranker.ts`, update the `applyRankingBoosts` method signature and body. Add `clickedPaths?: Set<string>` to the params type:

```ts
applyRankingBoosts(params: {
  items: SearchResultItem[];
  signals: RankingSignals;
  relatedPaths: Set<string>;
  nowTs?: number;
  pprActive?: boolean;
  clickedPaths?: Set<string>;  // NEW
}): SearchResultItem[] {
```

Inside the `for (const item of items)` loop, after `hubDocBoost`, add:

```ts
// Click-through boost: documents the user has opened for similar queries
const clickBoost = params.clickedPaths?.has(item.path) ? 0.15 : 0;

item.finalScore = base + freqBoost + recencyBoost + graphBoost + anchorBoost + hubDocBoost + clickBoost;
```

- [ ] **Step 2: Adjust recency and frequency constants**

In the same method, change:

```ts
// Frequency boost: reduce from 0.15 to 0.10 to prevent daily notes domination
const freqBoost = Math.log1p(s.openCount) * 0.10;

// Recency boost: softer decay (40 days instead of 30, lower peak)
const recencyBoost = Number.isFinite(days) ? Math.max(0, 0.2 - days * 0.005) : 0;
```

- [ ] **Step 3: Add post-ranking exclude filter**

Add a new method to the Reranker class:

```ts
/**
 * Post-ranking exclude filter. Removes results whose content or title
 * contains any excluded term. Safety net for results from Vector/Fuzzy
 * retrievers that don't support FTS5 NOT syntax.
 */
applyExcludeFilter(
  items: SearchResultItem[],
  excludes: string[],
): SearchResultItem[] {
  if (excludes.length === 0) return items;
  return items.filter(item => {
    const text = ((item.title ?? '') + ' ' + (item.content ?? '')).toLowerCase();
    return !excludes.some(ex => text.includes(ex));
  });
}
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/service/search/query/reranker.ts
git commit -m "feat(search): add click-through boost, adjust recency/frequency, add exclude filter"
```

---

## Task 15: HighlightEngine

**Files:**
- Create: `src/service/search/query/highlight-engine.ts`
- Create: `test/highlight-engine.test.ts`

- [ ] **Step 1: Write the test**

```ts
// test/highlight-engine.test.ts
import { HighlightEngine } from '../src/service/search/query/highlight-engine';
import { parseQuery } from '../src/service/search/query/query-parser';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

const engine = new HighlightEngine();

// Title highlight: exact match
const plan1 = parseQuery('obsidian');
const h1 = engine.highlight('My Obsidian Notes', plan1);
assert(h1.text === 'My Obsidian Notes', 'text preserved');
assert(h1.spans.length === 1, 'one span');
assert(h1.spans[0].type === 'exact', 'span type exact');
assert(h1.text.slice(h1.spans[0].start, h1.spans[0].end).toLowerCase() === 'obsidian', 'span covers "Obsidian"');

// Title highlight: multiple terms
const plan2 = parseQuery('machine learning');
const h2 = engine.highlight('Machine Learning Basics', plan2);
assert(h2.spans.length === 2, 'two spans for two terms');

// Snippet: should use raw text for display, match on normalized
const rawContent = 'The Quick Brown Fox jumps over the lazy dog. The Fox is VERY quick.';
const normalizedContent = rawContent.toLowerCase(); // simplified normalization
const plan3 = parseQuery('fox quick');
const h3 = engine.highlightSnippet(rawContent, normalizedContent, plan3);
assert(h3.text.includes('Fox'), 'snippet should contain raw text with original case');
assert(h3.spans.length >= 2, 'should highlight both terms');
assert(h3.spans.every(s => s.type === 'exact'), 'all exact matches');

// Phrase highlight
const plan4 = parseQuery('"brown fox"');
const h4 = engine.highlightSnippet(rawContent, normalizedContent, plan4);
assert(h4.spans.some(s => {
  const matched = h4.text.slice(s.start, s.end).toLowerCase();
  return matched === 'brown fox';
}), 'phrase should be highlighted as one span');

// Stem highlight
const rawStem = 'The runner was running in the morning';
const normStem = rawStem.toLowerCase();
const plan5 = parseQuery('runs');  // stem: "run"
const h5 = engine.highlightSnippet(rawStem, normStem, plan5);
// "runner" and "running" both contain "run" as prefix
assert(h5.spans.length >= 1, 'stem should match at least one occurrence');
assert(h5.spans.some(s => s.type === 'exact' || s.type === 'stem'), 'should have stem or exact type');

// Empty query → no highlights
const plan6 = parseQuery('');
const h6 = engine.highlight('Some Title', plan6);
assert(h6.spans.length === 0, 'empty query → no spans');

console.log('All highlight-engine tests passed');
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test -- test/highlight-engine.test.ts
```

- [ ] **Step 3: Implement HighlightEngine**

```ts
// src/service/search/query/highlight-engine.ts

import type { QueryPlan } from '@/service/search/query/query-parser';

export type HighlightSpan = {
  start: number;
  end: number;
  type: 'exact' | 'stem' | 'fuzzy';
};

export type HighlightResult = {
  text: string;
  spans: HighlightSpan[];
};

/**
 * Unified highlight engine for both titles and content snippets.
 * Matches against normalized text, renders against raw text.
 */
export class HighlightEngine {
  /**
   * Highlight a short text (title, path). Uses the text directly.
   */
  highlight(text: string, plan: QueryPlan): HighlightResult {
    if (!text || (plan.terms.length === 0 && plan.phrases.length === 0)) {
      return { text, spans: [] };
    }
    const lowerText = text.toLowerCase();
    const spans: HighlightSpan[] = [];

    // Phrase matches first
    for (const phrase of plan.phrases) {
      const lowerPhrase = phrase.toLowerCase();
      let idx = 0;
      while ((idx = lowerText.indexOf(lowerPhrase, idx)) !== -1) {
        spans.push({ start: idx, end: idx + phrase.length, type: 'exact' });
        idx += phrase.length;
      }
    }

    // Term matches
    for (const term of plan.terms) {
      const lowerTerm = term.text.toLowerCase();
      let idx = 0;
      while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
        // Check no overlap with existing spans
        const overlaps = spans.some(s => idx < s.end && idx + lowerTerm.length > s.start);
        if (!overlaps) {
          spans.push({ start: idx, end: idx + lowerTerm.length, type: 'exact' });
        }
        idx += lowerTerm.length;
      }
    }

    spans.sort((a, b) => a.start - b.start);
    return { text, spans };
  }

  /**
   * Highlight a long content string with snippet extraction.
   * Uses normalizedContent for matching, rawContent for display.
   */
  highlightSnippet(
    rawContent: string,
    normalizedContent: string,
    plan: QueryPlan,
    windowBefore: number = 80,
    windowAfter: number = 140,
  ): HighlightResult {
    if (!rawContent || (plan.terms.length === 0 && plan.phrases.length === 0)) {
      const snippet = rawContent?.slice(0, 200) ?? '';
      return { text: snippet, spans: [] };
    }

    const lowerNorm = normalizedContent.toLowerCase();
    const lowerRaw = rawContent.toLowerCase();

    // Find all match positions in raw text (case-insensitive)
    type Match = { start: number; end: number; keyword: string; type: HighlightSpan['type'] };
    const matches: Match[] = [];

    // Phrase matches
    for (const phrase of plan.phrases) {
      const lp = phrase.toLowerCase();
      let idx = 0;
      while ((idx = lowerRaw.indexOf(lp, idx)) !== -1) {
        matches.push({ start: idx, end: idx + lp.length, keyword: phrase, type: 'exact' });
        idx += lp.length;
      }
    }

    // Exact term matches
    for (const term of plan.terms) {
      const lt = term.text.toLowerCase();
      let idx = 0;
      while ((idx = lowerRaw.indexOf(lt, idx)) !== -1) {
        matches.push({ start: idx, end: idx + lt.length, keyword: term.text, type: 'exact' });
        idx += lt.length;
      }
    }

    // Stem matches (if stem differs from text)
    for (const term of plan.terms) {
      if (term.stem === term.text) continue;
      const ls = term.stem.toLowerCase();
      let idx = 0;
      while ((idx = lowerRaw.indexOf(ls, idx)) !== -1) {
        const overlaps = matches.some(m => idx < m.end && idx + ls.length > m.start);
        if (!overlaps) {
          matches.push({ start: idx, end: idx + ls.length, keyword: term.stem, type: 'stem' });
        }
        idx += ls.length;
      }
    }

    if (matches.length === 0) {
      return { text: rawContent.slice(0, 200), spans: [] };
    }

    // Find best snippet window (dual-factor: diversity * 2 + density)
    const window = this.findBestWindow(rawContent, matches, plan, windowBefore, windowAfter);

    // Extract snippet text
    const snippetText = rawContent.slice(window.start, window.end);

    // Filter and adjust spans to snippet-relative positions
    const spans: HighlightSpan[] = [];
    for (const m of matches) {
      if (m.start >= window.start && m.end <= window.end) {
        spans.push({
          start: m.start - window.start,
          end: m.end - window.start,
          type: m.type,
        });
      }
    }

    // Merge overlapping spans
    const merged = this.mergeOverlappingSpans(spans);

    return { text: snippetText, spans: merged };
  }

  private findBestWindow(
    content: string,
    matches: Array<{ start: number; end: number; keyword: string }>,
    plan: QueryPlan,
    windowBefore: number,
    windowAfter: number,
  ): { start: number; end: number } {
    let bestWindow = { start: 0, end: Math.min(200, content.length) };
    let bestScore = -1;

    for (const anchor of matches) {
      const wStart = Math.max(0, anchor.start - windowBefore);
      const wEnd = Math.min(content.length, anchor.end + windowAfter);

      // Count unique keywords in window
      const uniqueKeywords = new Set<string>();
      let totalMatchChars = 0;
      for (const m of matches) {
        if (m.start >= wStart && m.end <= wEnd) {
          uniqueKeywords.add(m.keyword.toLowerCase());
          totalMatchChars += m.end - m.start;
        }
      }

      const windowLen = wEnd - wStart || 1;
      const density = totalMatchChars / windowLen;
      const score = uniqueKeywords.size * 2 + density;

      if (score > bestScore || (score === bestScore && (wEnd - wStart) < (bestWindow.end - bestWindow.start))) {
        bestScore = score;
        bestWindow = { start: wStart, end: wEnd };
      }
    }

    return bestWindow;
  }

  private mergeOverlappingSpans(spans: HighlightSpan[]): HighlightSpan[] {
    if (spans.length <= 1) return spans;
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const merged: HighlightSpan[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = sorted[i];
      if (curr.start <= prev.end) {
        // Merge: extend end, keep higher-priority type
        prev.end = Math.max(prev.end, curr.end);
        if (curr.type === 'exact') prev.type = 'exact'; // exact > stem > fuzzy
      } else {
        merged.push(curr);
      }
    }

    return merged;
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test -- test/highlight-engine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/service/search/query/highlight-engine.ts test/highlight-engine.test.ts
git commit -m "feat(search): add unified HighlightEngine with raw text display + dual-factor snippet"
```

---

## Task 16: Pipeline Integration — Refactor QueryService

**Files:**
- Modify: `src/service/search/query/queryService.ts:61-176` (replace `textSearch()` body)
- Modify: `src/service/search/SearchClient.ts:34` (no change to public API)

This is the critical integration task. The new `textSearch()` orchestrates: QueryParser → Retrievers → Merger → PPR → Ranker → Highlight.

- [ ] **Step 1: Add imports and setup retriever registry in QueryService**

At the top of `queryService.ts`, add:

```ts
import { parseQuery } from './query-parser';
import { RetrieverRegistry } from '@/service/search/retriever/registry';
import { FtsRetriever } from '@/service/search/retriever/fts-retriever';
import { FtsStemRetriever } from '@/service/search/retriever/fts-stem-retriever';
import { VectorRetriever } from '@/service/search/retriever/vector-retriever';
import { MetaRetriever } from '@/service/search/retriever/meta-retriever';
import { FuzzyRetriever } from '@/service/search/retriever/fuzzy-retriever';
import { rrfMerge } from '@/service/search/merger/rrf-merger';
import { HighlightEngine } from './highlight-engine';
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';
```

Add a private field and initialization in the QueryService class:

```ts
private registry: RetrieverRegistry;
private highlightEngine = new HighlightEngine();

constructor() {
  // ... existing constructor ...
  this.registry = new RetrieverRegistry();
  this.registry.register(new FtsRetriever());
  this.registry.register(new FtsStemRetriever());
  this.registry.register(new VectorRetriever());
  this.registry.register(new MetaRetriever());
  this.registry.register(new FuzzyRetriever());
}
```

- [ ] **Step 2: Rewrite `textSearch()` method**

Replace the body of `textSearch()` (lines 61-176) with the new pipeline:

```ts
async textSearch(query: SearchQuery, enableLLMRerank: boolean = false): Promise<SearchResponse & { duration: number }> {
  const sw = new Stopwatch('SearchQuery');

  const termRaw = query?.text ?? '';
  const plan = parseQuery(termRaw);

  if (plan.terms.length === 0 && plan.phrases.length === 0) {
    return { query, items: [], duration: sw.getTotalElapsed() };
  }

  // Execute all active retrievers in parallel (except vector for Tier 1)
  sw.start('retriever_execution');
  const tier1Results = await this.registry.executeAll(plan, new Set(['vector']));
  sw.stop();

  // Merge with adaptive RRF
  sw.start('rrf_merge');
  const merged = rrfMerge(tier1Results, plan.retrievers);
  sw.stop();

  // Convert merged results to SearchResultItems
  const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);
  let resultItems: SearchResultItem[] = merged.slice(0, topK).map(m => ({
    id: m.path,
    path: m.path,
    title: m.best.title ?? m.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? m.path,
    type: (m.best.type ?? 'unknown') as SearchResultType,
    content: m.best.content ?? '',
    contentRaw: m.best.contentRaw ?? m.best.content ?? '',
    score: m.rrfScore,
    lastModified: m.best.lastModified ?? 0,
    docId: m.best.docId,
    matchType: m.best.matchType,
    fuzzyCorrection: m.best.fuzzyCorrection,
    sources: m.sources,
    highlight: null,
  }));

  // PPR (skip in Tier 1 if vector search will follow)
  const vectorAvailable = this.registry.getRegistered().some(
    r => r.name === 'vector' && r.shouldActivate(plan)
  );
  const enablePPR = query.enablePPR !== false;
  if (enablePPR && !vectorAvailable) {
    sw.start('ppr_rerank');
    resultItems = await this.applyPPR(resultItems, query);
    sw.stop();
  }

  // Ranker: metadata + click-through boosts
  sw.start('ranking_boosts');
  const clickRepo = this.getSearchClickRepo();
  const queryStems = SearchClickRepo.buildQueryStems(plan.terms.map(t => t.text));
  const clickedPaths = clickRepo?.getClickedPaths(queryStems) ?? new Set<string>();

  resultItems = this.reranker.applyRankingBoosts({
    items: resultItems,
    signals: await this.fetchRankingSignals(resultItems),
    relatedPaths: await this.getRelatedPaths(query),
    pprActive: enablePPR && !vectorAvailable,
    clickedPaths,
  });
  sw.stop();

  // Exclude filter (post-ranking safety net)
  if (plan.excludes.length > 0) {
    resultItems = this.reranker.applyExcludeFilter(resultItems, plan.excludes);
  }

  // Highlight: compute on final topK only
  sw.start('highlighting');
  for (const item of resultItems.slice(0, topK)) {
    item.highlight = this.highlightEngine.highlightSnippet(
      item.contentRaw ?? item.content ?? '',
      item.content ?? '',
      plan,
    );
    (item as any).titleHighlight = this.highlightEngine.highlight(item.title ?? '', plan);
  }
  sw.stop();

  // Optional LLM rerank (unchanged)
  if (enableLLMRerank) {
    sw.start('llm_rerank');
    resultItems = await this.reranker.rerank(resultItems, termRaw);
    sw.stop();
  }

  return {
    query,
    items: resultItems.slice(0, topK),
    duration: sw.getTotalElapsed(),
    fuzzyCorrection: resultItems.find(i => i.fuzzyCorrection)?.fuzzyCorrection,
  };
}
```

- [ ] **Step 3: Add `contentRaw`, `matchType`, `fuzzyCorrection`, `sources` to SearchResultItem type**

Find the `SearchResultItem` type definition and add:

```ts
contentRaw?: string;
matchType?: string;
fuzzyCorrection?: string;
sources?: Set<string>;
titleHighlight?: { text: string; spans: Array<{ start: number; end: number; type: string }> };
```

- [ ] **Step 4: Delete deprecated methods from queryService.ts**

Delete the following methods (they are now in individual Retrievers):
- `executeFulltextSearch()` (lines 329-432)
- `executeVectorSearch()` (lines 437-540)
- `executeMetaSearch()` (lines 545-644)
- `mergeContentSources()` (lines 651-704)
- `mergeContentAndMetaWithRRF()` (lines 717-752)
- `extractKeywords()` (lines 252-259)
- `buildFtsQuery()` (lines 265-281)

Keep: `applyPPR()`, `fetchRankingSignals()`, `getRelatedPaths()`, and any other helper methods still referenced.

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/service/search/query/queryService.ts src/service/search/SearchClient.ts
git commit -m "refactor(search): integrate Query Pipeline into QueryService"
```

---

## Task 17: Two-Tier Debounce + Vector Async Enrichment

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useVaultSearch.ts:257-313`
- Modify: `src/ui/view/quick-search/store/vaultSearchStore.ts:104-154`

- [ ] **Step 1: Integrate QueryParser into vaultSearchStore**

In `vaultSearchStore.ts`, update imports and add fuzzy correction state:

```ts
import { parseQuery } from '@/service/search/query/query-parser';

// In the store state type, add:
fuzzyCorrection: string | null;

// In the initial state:
fuzzyCorrection: null,
```

- [ ] **Step 2: Split vault search debounce into two tiers**

In `useVaultSearch.ts`, replace the single 500ms vault search debounce (around line 313) with:

```ts
// Tier 1: Fast search (FTS + Meta + Stem + Fuzzy) — 200ms debounce
const tier1Timer = useRef<NodeJS.Timeout>();
// Tier 2: Vector enrichment — 500ms debounce
const tier2Timer = useRef<NodeJS.Timeout>();

// In the search effect:
clearTimeout(tier1Timer.current);
clearTimeout(tier2Timer.current);

tier1Timer.current = setTimeout(async () => {
  const results = await searchClient.search({
    ...parsedQuery,
    skipVector: true, // New flag: skip VectorRetriever in Tier 1
  });
  store.setState({ results: results.items, fuzzyCorrection: results.fuzzyCorrection ?? null });
}, 200);

tier2Timer.current = setTimeout(async () => {
  const results = await searchClient.search(parsedQuery); // Full search with vector
  store.setState({ results: results.items, fuzzyCorrection: results.fuzzyCorrection ?? null });
}, 500);
```

- [ ] **Step 3: Reduce in-file and go-to-line debounce times**

Change in-file search debounce from 300ms to 150ms (line 257):
```ts
}, 150); // Faster debounce for in-file search
```

Change go-to-line debounce from 500ms to 100ms (line 290):
```ts
}, 100); // Trivial operation, nearly instant
```

- [ ] **Step 4: Record click-through on file open**

Find the `handleOpenFile` or equivalent function in `useVaultSearch.ts` and add click recording:

```ts
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';

// Inside the file open handler, after opening the file:
const store = useVaultSearchStore.getState();
if (store.query && store.results) {
  const rank = store.results.findIndex(r => r.path === path);
  if (rank >= 0) {
    const clickRepo = SqliteStoreManager.getInstance().getSearchClickRepo();
    const queryStems = SearchClickRepo.buildQueryStems(
      store.query.split(/\s+/).filter(Boolean)
    );
    clickRepo?.record(queryStems, path, rank);
  }
}
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/quick-search/hooks/useVaultSearch.ts src/ui/view/quick-search/store/vaultSearchStore.ts
git commit -m "feat(search): two-tier debounce (200ms fast + 500ms vector) + click-through recording"
```

---

## Task 18: UI Updates — Highlights + Fuzzy Banner + Help

**Files:**
- Modify: `src/ui/view/quick-search/components/VaultSearchResult.tsx:12-114`
- Modify: `src/ui/view/quick-search/components/tab-VaultSearch.tsx`

- [ ] **Step 1: Replace title/snippet highlight rendering in VaultSearchResult**

Replace the `highlightText()` function (lines 12-44) and `renderHighlightedSnippet()` (lines 49-114) with a unified renderer that consumes pre-computed `HighlightResult`:

```tsx
import type { HighlightResult, HighlightSpan } from '@/service/search/query/highlight-engine';

function renderHighlightSpans(result: HighlightResult): React.ReactNode {
  if (!result.spans.length) return <span>{result.text}</span>;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const span of result.spans) {
    // Text before this span
    if (span.start > lastEnd) {
      parts.push(<span key={`t-${lastEnd}`}>{result.text.slice(lastEnd, span.start)}</span>);
    }
    // Highlighted span with type-specific styling
    const className = span.type === 'fuzzy'
      ? 'pktw-bg-blue-50 pktw-text-blue-800 pktw-underline pktw-decoration-dashed'
      : span.type === 'stem'
        ? 'pktw-bg-amber-50 pktw-text-amber-800'
        : 'pktw-bg-[#fef3c7] pktw-text-[#92400e]'; // exact: current amber style
    parts.push(
      <mark key={`h-${span.start}`} className={className}>
        {result.text.slice(span.start, span.end)}
      </mark>
    );
    lastEnd = span.end;
  }

  // Remaining text
  if (lastEnd < result.text.length) {
    parts.push(<span key={`t-${lastEnd}`}>{result.text.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
}
```

- [ ] **Step 2: Update VaultSearchResult to use pre-computed highlights**

In the result rendering section, replace the old highlight calls with:

```tsx
// Title
{result.titleHighlight
  ? renderHighlightSpans(result.titleHighlight)
  : <span>{result.title}</span>}

// Snippet
{result.highlight
  ? renderHighlightSpans(result.highlight)
  : <span>{result.content?.slice(0, 200)}</span>}
```

Delete the old `highlightText()` function (lines 12-44) and `renderHighlightedSnippet()` (lines 49-114).

- [ ] **Step 3: Add fuzzy correction banner in tab-VaultSearch**

In `tab-VaultSearch.tsx`, above the results list, add:

```tsx
{store.fuzzyCorrection && (
  <div className="pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-muted-foreground pktw-bg-muted/30">
    Showing results for "<span className="pktw-font-medium">{store.fuzzyCorrection}</span>"
    {' '}(similar to "{store.query}")
  </div>
)}
```

- [ ] **Step 4: Extend help mode with query syntax operators**

Find the help mode rendering in `tab-VaultSearch.tsx` or `ModeHelpList` component and add operator docs:

```tsx
// Add to the help items array:
{ prefix: '"..."', description: 'Exact phrase match' },
{ prefix: '-word', description: 'Exclude results containing word' },
{ prefix: 'tag:value', description: 'Filter by tag' },
{ prefix: 'ext:pdf', description: 'Filter by file type' },
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/quick-search/components/VaultSearchResult.tsx src/ui/view/quick-search/components/tab-VaultSearch.tsx
git commit -m "feat(search): unified highlight rendering, fuzzy banner, query syntax help"
```

---

## Task 19: Cleanup + Constant Updates

**Files:**
- Modify: `src/core/constant.ts:180-214`
- Delete: `src/service/search/query/highlight-builder.ts`
- Modify: imports across codebase

- [ ] **Step 1: Update constants**

In `constant.ts`, remove the fixed RRF weight constants that are now dynamically computed:

```ts
// DELETE these lines (replaced by adaptive weights in query-parser.ts):
// export const RRF_CONTENT_WEIGHT = 0.6;
// export const RRF_CONTENT_VS_META_WEIGHT = 0.5;

// DELETE these lines (replaced by inline values in retrievers):
// export const SEARCH_SCORING_DIVERSITY_BOOST_CONTENT = 0.5;
// export const SEARCH_SCORING_DENSITY_BOOST_CONTENT = 0.3;
// export const SEARCH_SCORING_MAX_OCCURRENCES_CONTENT = 10;
// export const SEARCH_SCORING_DIVERSITY_BOOST_META = 0.8;
// export const SEARCH_SCORING_DENSITY_BOOST_META = 0.4;
// export const SEARCH_SCORING_MAX_OCCURRENCES_META = 5;

// KEEP: RRF_K, PPR constants, hub/index constants
```

- [ ] **Step 2: Delete deprecated highlight-builder.ts**

```bash
git rm src/service/search/query/highlight-builder.ts
```

- [ ] **Step 3: Update any remaining imports of deleted functions/constants**

Search for remaining imports of `buildHighlightSnippet`, `RRF_CONTENT_WEIGHT`, `RRF_CONTENT_VS_META_WEIGHT`, and the deleted scoring constants. Update or remove them.

```bash
# Find remaining references (run manually, fix each)
grep -rn "highlight-builder\|RRF_CONTENT_WEIGHT\|RRF_CONTENT_VS_META_WEIGHT\|SEARCH_SCORING_DIVERSITY\|SEARCH_SCORING_DENSITY\|SEARCH_SCORING_MAX_OCCURRENCES" src/
```

- [ ] **Step 4: Verify build passes with zero errors**

```bash
npm run build
```

- [ ] **Step 5: Run all existing tests to confirm no regressions**

```bash
npm run test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(search): cleanup deprecated constants, delete highlight-builder.ts"
```

---

## Dependency Graph

```
Task 1 (Stemmer) ──────┐
Task 2 (Levenshtein) ──┤
                        ├── Task 3 (QueryParser) ──┐
Task 4 (DDL) ──────────┤                           │
Task 5 (ClickRepo) ────┤                           │
                        ├── Task 6 (Index Writes)   │
Task 7 (Registry) ─────┤                           │
                        ├── Task 8 (FtsRetriever) ──┤
                        ├── Task 9 (StemRetriever) ─┤
                        ├── Task 10 (MetaRetriever) ┤
                        ├── Task 11 (VecRetriever) ─┤
                        ├── Task 12 (FuzzyRetriever)┤
                        │                           │
                        ├── Task 13 (Merger) ───────┤
                        ├── Task 14 (Ranker) ───────┤
                        ├── Task 15 (Highlight) ────┤
                        │                           │
                        └───────────────────────── Task 16 (Integration) ──┐
                                                    │                      │
                                                    ├── Task 17 (Debounce) │
                                                    ├── Task 18 (UI) ──────┤
                                                    └── Task 19 (Cleanup) ─┘
```

**Parallelizable groups:**
- Tasks 1, 2, 4, 7 — fully independent
- Tasks 8, 9, 10, 11, 12 — depend on 7, but independent of each other
- Tasks 13, 14, 15 — depend on 3, but independent of each other
- Tasks 17, 18 — depend on 16, but independent of each other
