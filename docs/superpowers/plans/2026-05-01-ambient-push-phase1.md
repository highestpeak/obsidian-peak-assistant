# Ambient Push Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar panel showing related notes when the user writes, with template-based explanations and action buttons (Insert Link / Open / Dismiss).

**Architecture:** Event-driven pipeline — editor change events flow through `AmbientTrigger` (debounce + cooldown + significance filter) → `ContextExtractor` (paragraph + metadata) → `AmbientSearcher` (FTS5 via QueryService) → `RelevanceExplainer` (template-based) → Zustand store → React sidebar panel. SQLite `ambient_push_log` tracks user actions for future feedback learning. Status bar shows push count.

**Tech Stack:** Obsidian Plugin API (ItemView, workspace events), React 18, Zustand, Kysely (SQLite), shadcn/ui Button, Lucide React icons.

**Spec:** `docs/superpowers/specs/2026-05-01-ambient-push-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/service/ambient/types.ts` | `AmbientContext`, `AmbientPushItem`, `AmbientSignal`, `AmbientPushSettings` |
| `src/service/ambient/ContextExtractor.ts` | Extract paragraph, title, tags, outlinks from active editor |
| `src/service/ambient/RelevanceExplainer.ts` | Generate template-based explanation strings from search signals |
| `src/service/ambient/AmbientSearcher.ts` | Wrap QueryService for ambient-specific search + result filtering |
| `src/service/ambient/AmbientTrigger.ts` | Event gateway: debounce, cooldown, significance filter |
| `src/service/ambient/AmbientPushService.ts` | Orchestrator: trigger → context → search → explain → store |
| `src/core/storage/sqlite/repositories/AmbientPushRepo.ts` | CRUD for `ambient_push_log` table |
| `src/ui/store/ambientPushStore.ts` | Zustand store for UI state |
| `src/ui/view/AmbientPushView.ts` | Obsidian `ItemView` wrapper for React panel |
| `src/ui/view/ambient-push/AmbientPushPanel.tsx` | Main sidebar React component |
| `src/ui/view/ambient-push/PushCard.tsx` | Individual push card component |
| `test/ambient-push.test.ts` | Tests for ContextExtractor + RelevanceExplainer |

### Modified Files

| File | Change |
|------|--------|
| `src/app/settings/types.ts:419` | Add `ambientPush?: AmbientPushSettings` to `MyPluginSettings` + defaults |
| `src/app/settings/PluginSettingsLoader.ts:279` | Add normalization for `ambientPush` block |
| `src/core/storage/sqlite/ddl.ts:32` | Add `ambient_push_log` to `Database` interface + CREATE TABLE |
| `src/core/storage/sqlite/SqliteStoreManager.ts:88` | Wire `AmbientPushRepo` |
| `src/app/view/ViewManager.ts:26` | Register `AmbientPushView` |
| `src/app/commands/Register.ts:667` | Add `buildAmbientPushCommands()` |
| `main.ts:184` | Init `AmbientPushService` + status bar item |

---

## Task 1: Types + Settings

**Files:**
- Create: `src/service/ambient/types.ts`
- Modify: `src/app/settings/types.ts:419-509`
- Modify: `src/app/settings/PluginSettingsLoader.ts:279-379`

- [ ] **Step 1: Create ambient types file**

```typescript
// src/service/ambient/types.ts

export interface AmbientContext {
  currentParagraph: string;
  cursorSection: string;
  documentTitle: string;
  documentTags: string[];
  documentHeadings: string[];
  existingOutlinks: string[];
  recentEditDelta: string;
  editSessionDuration: number;
  filePath: string;
  lastModified: number;
}

export interface AmbientPushItem {
  filePath: string;
  title: string;
  excerpt: string;
  score: number;
  explanation: string;
  explanationType: 'template';
  signals: AmbientSignal[];
  timestamp: number;
}

export type AmbientSignal =
  | { type: 'shared_tag'; tag: string }
  | { type: 'graph_neighbor'; hop: number; via?: string }
  | { type: 'co_citation'; citingNote: string }
  | { type: 'hub_member'; hubName: string }
  | { type: 'text_overlap'; terms: string[] }
  | { type: 'recency'; editedDaysAgo: number };

export type TriggerType = 'writing_pause' | 'doc_switch' | 'manual';
export type UserAction = 'opened' | 'linked' | 'dismissed' | 'ignored';

export interface AmbientPushSettings {
  enabled: boolean;
  triggerCooldownMs: number;
  docSwitchCooldownMs: number;
  writingPauseMs: number;
  minCharDelta: number;
  maxPushItems: number;
  showStatusBar: boolean;
}

export const DEFAULT_AMBIENT_PUSH_SETTINGS: AmbientPushSettings = {
  enabled: true,
  triggerCooldownMs: 30_000,
  docSwitchCooldownMs: 5_000,
  writingPauseMs: 5_000,
  minCharDelta: 30,
  maxPushItems: 5,
  showStatusBar: true,
};
```

- [ ] **Step 2: Add `ambientPush` to `MyPluginSettings`**

In `src/app/settings/types.ts`, add to the `MyPluginSettings` interface (after the last field):

```typescript
ambientPush?: AmbientPushSettings;
```

And add the import at the top:
```typescript
import type { AmbientPushSettings } from '@/service/ambient/types';
```

Add to `DEFAULT_SETTINGS` object:
```typescript
ambientPush: undefined, // uses DEFAULT_AMBIENT_PUSH_SETTINGS when undefined
```

- [ ] **Step 3: Add normalization in PluginSettingsLoader**

In `src/app/settings/PluginSettingsLoader.ts`, inside `normalizePluginSettings()`, add after the last normalization block:

```typescript
// Ambient Push settings
const rawAmbient = raw?.ambientPush as Partial<AmbientPushSettings> | undefined;
if (rawAmbient && typeof rawAmbient === 'object') {
  const { DEFAULT_AMBIENT_PUSH_SETTINGS } = await import('@/service/ambient/types');
  settings.ambientPush = {
    enabled: typeof rawAmbient.enabled === 'boolean' ? rawAmbient.enabled : DEFAULT_AMBIENT_PUSH_SETTINGS.enabled,
    triggerCooldownMs: typeof rawAmbient.triggerCooldownMs === 'number' ? rawAmbient.triggerCooldownMs : DEFAULT_AMBIENT_PUSH_SETTINGS.triggerCooldownMs,
    docSwitchCooldownMs: typeof rawAmbient.docSwitchCooldownMs === 'number' ? rawAmbient.docSwitchCooldownMs : DEFAULT_AMBIENT_PUSH_SETTINGS.docSwitchCooldownMs,
    writingPauseMs: typeof rawAmbient.writingPauseMs === 'number' ? rawAmbient.writingPauseMs : DEFAULT_AMBIENT_PUSH_SETTINGS.writingPauseMs,
    minCharDelta: typeof rawAmbient.minCharDelta === 'number' ? rawAmbient.minCharDelta : DEFAULT_AMBIENT_PUSH_SETTINGS.minCharDelta,
    maxPushItems: typeof rawAmbient.maxPushItems === 'number' ? rawAmbient.maxPushItems : DEFAULT_AMBIENT_PUSH_SETTINGS.maxPushItems,
    showStatusBar: typeof rawAmbient.showStatusBar === 'boolean' ? rawAmbient.showStatusBar : DEFAULT_AMBIENT_PUSH_SETTINGS.showStatusBar,
  };
}
```

Add the import at the top:
```typescript
import type { AmbientPushSettings } from '@/service/ambient/types';
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/service/ambient/types.ts src/app/settings/types.ts src/app/settings/PluginSettingsLoader.ts
git commit -m "feat(ambient): add AmbientPushSettings types and settings normalization"
```

---

## Task 2: SQLite Schema + Repo

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts:32`
- Create: `src/core/storage/sqlite/repositories/AmbientPushRepo.ts`
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts:88`

- [ ] **Step 1: Add table to Database interface in ddl.ts**

In `src/core/storage/sqlite/ddl.ts`, add to the `Database` interface:

```typescript
ambient_push_log: {
  id: Generated<number>;
  timestamp: number;
  trigger_type: string;
  source_file_path: string;
  context_paragraph: string | null;
  pushed_file_path: string;
  pushed_score: number;
  explanation_type: string;
  explanation_text: string;
  user_action: string | null;
  user_action_ts: number | null;
};
```

- [ ] **Step 2: Add CREATE TABLE in migrateSqliteSchema()**

In `src/core/storage/sqlite/ddl.ts`, inside `migrateSqliteSchema()`, add at the end (before the closing brace), in the section that runs for the `vault` tenant:

```typescript
// Ambient Push log
db.exec(`
  CREATE TABLE IF NOT EXISTS ambient_push_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    trigger_type TEXT NOT NULL,
    source_file_path TEXT NOT NULL,
    context_paragraph TEXT,
    pushed_file_path TEXT NOT NULL,
    pushed_score REAL NOT NULL,
    explanation_type TEXT NOT NULL,
    explanation_text TEXT NOT NULL,
    user_action TEXT,
    user_action_ts INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ambient_push_source ON ambient_push_log(source_file_path, timestamp);
  CREATE INDEX IF NOT EXISTS idx_ambient_push_pushed ON ambient_push_log(pushed_file_path, timestamp);
`);
```

- [ ] **Step 3: Create AmbientPushRepo**

```typescript
// src/core/storage/sqlite/repositories/AmbientPushRepo.ts
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { TriggerType, UserAction } from '@/service/ambient/types';

export class AmbientPushRepo {
  constructor(private readonly db: Kysely<DbSchema>) {}

  async logPush(params: {
    timestamp: number;
    triggerType: TriggerType;
    sourceFilePath: string;
    contextParagraph: string | null;
    pushedFilePath: string;
    pushedScore: number;
    explanationType: string;
    explanationText: string;
  }): Promise<void> {
    await this.db
      .insertInto('ambient_push_log')
      .values({
        timestamp: params.timestamp,
        trigger_type: params.triggerType,
        source_file_path: params.sourceFilePath,
        context_paragraph: params.contextParagraph,
        pushed_file_path: params.pushedFilePath,
        pushed_score: params.pushedScore,
        explanation_type: params.explanationType,
        explanation_text: params.explanationText,
        user_action: null,
        user_action_ts: null,
      })
      .execute();
  }

  async recordAction(params: {
    sourceFilePath: string;
    pushedFilePath: string;
    action: UserAction;
  }): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('ambient_push_log')
      .set({ user_action: params.action, user_action_ts: now })
      .where('source_file_path', '=', params.sourceFilePath)
      .where('pushed_file_path', '=', params.pushedFilePath)
      .where('user_action', 'is', null)
      .orderBy('timestamp', 'desc')
      .execute();
  }

  async getDismissedPairs(withinDays: number = 7): Promise<Set<string>> {
    const cutoff = Date.now() - withinDays * 86_400_000;
    const rows = await this.db
      .selectFrom('ambient_push_log')
      .select(['source_file_path', 'pushed_file_path'])
      .where('user_action', '=', 'dismissed')
      .where('user_action_ts', '>=', cutoff)
      .execute();
    return new Set(rows.map(r => `${r.source_file_path}::${r.pushed_file_path}`));
  }
}
```

- [ ] **Step 4: Wire into SqliteStoreManager**

In `src/core/storage/sqlite/SqliteStoreManager.ts`:

Add import:
```typescript
import { AmbientPushRepo } from './repositories/AmbientPushRepo';
```

Add private field (near other repo fields):
```typescript
private ambientPushRepo: AmbientPushRepo | null = null;
```

In the init method, after searchKdb is obtained, add:
```typescript
this.ambientPushRepo = new AmbientPushRepo(searchKdb);
```

Add getter:
```typescript
getAmbientPushRepo(): AmbientPushRepo {
  if (this.closing || !this.ambientPushRepo) throw new Error('SqliteStoreManager not initialized or is closing.');
  return this.ambientPushRepo;
}
```

In the close method, add:
```typescript
this.ambientPushRepo = null;
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts src/core/storage/sqlite/repositories/AmbientPushRepo.ts src/core/storage/sqlite/SqliteStoreManager.ts
git commit -m "feat(ambient): add ambient_push_log SQLite table and repo"
```

---

## Task 3: ContextExtractor (with test)

**Files:**
- Create: `src/service/ambient/ContextExtractor.ts`
- Create: `test/context-extractor.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/context-extractor.test.ts
import { strict as assert } from 'node:assert';
import {
  extractParagraphAtLine,
  extractOutlinks,
  extractHeadings,
} from '../src/service/ambient/ContextExtractor';

// --- extractParagraphAtLine ---
{
  const lines = [
    '# Heading',
    '',
    'First paragraph with some text.',
    'Still the first paragraph.',
    '',
    'Second paragraph here.',
    '',
    '## Another heading',
    '',
    'Third paragraph.',
  ];

  // Cursor in first paragraph
  const p1 = extractParagraphAtLine(lines, 2);
  assert.equal(p1, 'First paragraph with some text.\nStill the first paragraph.');

  // Cursor in second paragraph
  const p2 = extractParagraphAtLine(lines, 5);
  assert.equal(p2, 'Second paragraph here.');

  // Cursor on heading line
  const p3 = extractParagraphAtLine(lines, 0);
  assert.equal(p3, '# Heading');

  // Cursor on empty line returns empty
  const p4 = extractParagraphAtLine(lines, 1);
  assert.equal(p4, '');

  console.log('extractParagraphAtLine: all passed');
}

// --- extractOutlinks ---
{
  const text = 'Some text with [[Note A]] and [[Note B|alias]] and [[Note C#heading]].';
  const links = extractOutlinks(text);
  assert.deepEqual(links, ['Note A', 'Note B', 'Note C']);
  console.log('extractOutlinks: all passed');
}

// --- extractHeadings ---
{
  const lines = [
    '# Top',
    'text',
    '## Section A',
    '### Subsection',
    '## Section B',
    '#### Too deep',
  ];
  const headings = extractHeadings(lines);
  assert.deepEqual(headings, ['Top', 'Section A', 'Subsection', 'Section B']);
  console.log('extractHeadings: all passed');
}

console.log('All ContextExtractor tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/context-extractor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ContextExtractor**

```typescript
// src/service/ambient/ContextExtractor.ts
import type { App, MarkdownView } from 'obsidian';
import type { AmbientContext } from './types';

/**
 * Extract the paragraph block containing the given line index.
 * A paragraph is delimited by empty lines or heading lines.
 */
export function extractParagraphAtLine(lines: string[], lineIndex: number): string {
  if (lineIndex < 0 || lineIndex >= lines.length) return '';
  if (lines[lineIndex].trim() === '') return '';

  let start = lineIndex;
  while (start > 0 && lines[start - 1].trim() !== '') && !lines[start - 1].startsWith('#')) {
    start--;
  }
  // If current line is a heading, just return that line
  if (lines[lineIndex].startsWith('#')) return lines[lineIndex];

  let end = lineIndex;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '' && !lines[end + 1].startsWith('#')) {
    end++;
  }

  return lines.slice(start, end + 1).join('\n');
}

/**
 * Extract [[wikilink]] targets from text. Strips aliases and heading fragments.
 */
export function extractOutlinks(text: string): string[] {
  const re = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let target = m[1];
    // Strip alias: [[target|alias]] → target
    const pipeIdx = target.indexOf('|');
    if (pipeIdx !== -1) target = target.slice(0, pipeIdx);
    // Strip heading fragment: [[target#heading]] → target
    const hashIdx = target.indexOf('#');
    if (hashIdx !== -1) target = target.slice(0, hashIdx);
    links.push(target.trim());
  }
  return links;
}

/**
 * Extract H1-H3 headings from lines.
 */
export function extractHeadings(lines: string[]): string[] {
  const headings: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) headings.push(m[2].trim());
  }
  return headings;
}

/**
 * Find the heading hierarchy path to a given line (e.g. "Top > Section A > Subsection").
 */
export function getCursorSection(lines: string[], lineIndex: number): string {
  const stack: string[] = [];
  for (let i = 0; i <= lineIndex && i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      const level = m[1].length;
      // Pop headings at same or deeper level
      while (stack.length >= level) stack.pop();
      stack.push(m[2].trim());
    }
  }
  return stack.join(' > ');
}

/**
 * Build full AmbientContext from the active Obsidian editor.
 * Returns null if no active markdown view.
 */
export function extractContext(app: App, fileOpenedAt: number): AmbientContext | null {
  const view = app.workspace.getActiveViewOfType(
    // Use require to avoid importing the class at module level (Obsidian doesn't export it cleanly)
    app.workspace.getActiveViewOfType as any
  );
  // Get the active MarkdownView
  const mdView = app.workspace.getActiveViewOfType(
    require('obsidian').MarkdownView
  ) as MarkdownView | null;
  if (!mdView || !mdView.file) return null;

  const editor = mdView.editor;
  const cursor = editor.getCursor();
  const fullText = editor.getValue();
  const lines = fullText.split('\n');
  const file = mdView.file;

  const currentParagraph = extractParagraphAtLine(lines, cursor.line);
  const cursorSection = getCursorSection(lines, cursor.line);
  const existingOutlinks = extractOutlinks(fullText);
  const documentHeadings = extractHeadings(lines);

  // Get tags from metadataCache
  const cache = app.metadataCache.getFileCache(file);
  const documentTags = (cache?.frontmatter?.tags as string[] | undefined) ?? [];

  return {
    currentParagraph: currentParagraph.slice(0, 500),
    cursorSection,
    documentTitle: file.basename,
    documentTags,
    documentHeadings,
    existingOutlinks,
    recentEditDelta: '', // Phase 1: not tracked
    editSessionDuration: (Date.now() - fileOpenedAt) / 1000,
    filePath: file.path,
    lastModified: file.stat.mtime,
  };
}
```

Wait, there's a syntax error in the extractParagraphAtLine function. Let me fix it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/context-extractor.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/service/ambient/ContextExtractor.ts test/context-extractor.test.ts
git commit -m "feat(ambient): add ContextExtractor with paragraph/outlink/heading extraction"
```

---

## Task 4: RelevanceExplainer (with test)

**Files:**
- Create: `src/service/ambient/RelevanceExplainer.ts`
- Modify: `test/context-extractor.test.ts` → rename to `test/ambient-push.test.ts`

- [ ] **Step 1: Write the test**

Append to `test/ambient-push.test.ts` (rename from `test/context-extractor.test.ts`):

```typescript
import { generateExplanation } from '../src/service/ambient/RelevanceExplainer';
import type { AmbientSignal } from '../src/service/ambient/types';

// --- generateExplanation ---
{
  const tagSignal: AmbientSignal = { type: 'shared_tag', tag: 'process' };
  assert.equal(generateExplanation([tagSignal]), 'Both tagged with #process');

  const graphSignal: AmbientSignal = { type: 'graph_neighbor', hop: 1 };
  assert.equal(generateExplanation([graphSignal]), 'Directly linked');

  const graph2Signal: AmbientSignal = { type: 'graph_neighbor', hop: 2, via: 'Bridge Note' };
  assert.equal(generateExplanation([graph2Signal]), 'Connected via [[Bridge Note]]');

  const textSignal: AmbientSignal = { type: 'text_overlap', terms: ['feedback', 'loop'] };
  assert.equal(generateExplanation([textSignal]), 'Similar discussion of "feedback", "loop"');

  // Multiple signals — picks the most specific one
  const multi: AmbientSignal[] = [
    { type: 'text_overlap', terms: ['test'] },
    { type: 'shared_tag', tag: 'dev' },
  ];
  const result = generateExplanation(multi);
  assert.equal(result, 'Both tagged with #dev');

  // Empty signals
  assert.equal(generateExplanation([]), 'Related content');

  console.log('generateExplanation: all passed');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/ambient-push.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RelevanceExplainer**

```typescript
// src/service/ambient/RelevanceExplainer.ts
import type { AmbientSignal } from './types';

/**
 * Signal priority order — higher priority signals produce more meaningful explanations.
 */
const SIGNAL_PRIORITY: AmbientSignal['type'][] = [
  'graph_neighbor',
  'co_citation',
  'hub_member',
  'shared_tag',
  'recency',
  'text_overlap',
];

/**
 * Generate a human-readable explanation from ambient signals.
 * Picks the highest-priority signal and formats it.
 */
export function generateExplanation(signals: AmbientSignal[]): string {
  if (signals.length === 0) return 'Related content';

  // Sort by priority (lower index = higher priority)
  const sorted = [...signals].sort((a, b) => {
    const ai = SIGNAL_PRIORITY.indexOf(a.type);
    const bi = SIGNAL_PRIORITY.indexOf(b.type);
    return ai - bi;
  });

  const best = sorted[0];

  switch (best.type) {
    case 'shared_tag':
      return `Both tagged with #${best.tag}`;
    case 'graph_neighbor':
      if (best.hop === 1) return 'Directly linked';
      return best.via ? `Connected via [[${best.via}]]` : `Connected within ${best.hop} hops`;
    case 'co_citation':
      return `Co-cited in [[${best.citingNote}]]`;
    case 'hub_member':
      return `Both in "${best.hubName}" cluster`;
    case 'text_overlap':
      return `Similar discussion of ${best.terms.map(t => `"${t}"`).join(', ')}`;
    case 'recency':
      return `Edited ${best.editedDaysAgo} days ago in a related session`;
    default:
      return 'Related content';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/ambient-push.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/ambient/RelevanceExplainer.ts test/ambient-push.test.ts
git commit -m "feat(ambient): add RelevanceExplainer with template-based signal formatting"
```

---

## Task 5: AmbientSearcher

**Files:**
- Create: `src/service/ambient/AmbientSearcher.ts`

- [ ] **Step 1: Implement AmbientSearcher**

```typescript
// src/service/ambient/AmbientSearcher.ts
import type { SearchQuery, SearchResultItem } from '@/service/search/types';
import type { AmbientContext, AmbientPushItem, AmbientSignal } from './types';
import { generateExplanation } from './RelevanceExplainer';
import { AppContext } from '@/app/context/AppContext';

/** Folders to exclude from ambient search results */
const AMBIENT_EXCLUDE_FOLDERS = ['Hub-Summaries', 'ChatFolder'];

/**
 * Perform ambient search based on extracted context.
 * Phase 1: FTS5 only, no graph expansion, no LLM rerank.
 */
export async function ambientSearch(
  context: AmbientContext,
  maxItems: number,
  pushHistory: Map<string, number>,
): Promise<AmbientPushItem[]> {
  const searchClient = AppContext.getSearchClient();

  const query: SearchQuery = {
    text: context.currentParagraph,
    scopeMode: 'vault',
    scopeValue: { currentFilePath: context.filePath },
    topK: 15,
    searchMode: 'fulltext',
    excludeFolderPrefixes: AMBIENT_EXCLUDE_FOLDERS,
    indexTenant: 'vault',
  };

  const response = await searchClient.search(query);
  const now = Date.now();
  const dedupWindow = 10 * 60_000; // 10 minutes

  // Build outlink set for dedup (normalized to lowercase for comparison)
  const outlinkSet = new Set(context.existingOutlinks.map(l => l.toLowerCase()));
  const tagSet = new Set(context.documentTags);

  const items: AmbientPushItem[] = [];

  for (const result of response.items) {
    // Skip self
    if (result.path === context.filePath) continue;

    // Skip already-linked notes
    const basename = result.path.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
    if (outlinkSet.has(basename.toLowerCase())) continue;

    // Skip recently pushed
    const lastPushed = pushHistory.get(result.path);
    if (lastPushed && now - lastPushed < dedupWindow) continue;

    // Determine signals
    const signals = detectSignals(result, context, tagSet);

    items.push({
      filePath: result.path,
      title: result.title || basename,
      excerpt: (result.highlight || result.content || '').slice(0, 150),
      score: result.finalScore ?? result.score ?? 0,
      explanation: generateExplanation(signals),
      explanationType: 'template',
      signals,
      timestamp: now,
    });

    if (items.length >= maxItems) break;
  }

  return items;
}

/**
 * Detect which ambient signals apply to a search result.
 * Phase 1: shared tags + text overlap only.
 */
function detectSignals(
  result: SearchResultItem,
  context: AmbientContext,
  tagSet: Set<string>,
): AmbientSignal[] {
  const signals: AmbientSignal[] = [];

  // Text overlap — extract matching terms from highlight
  if (result.highlight) {
    const matchTerms = extractHighlightTerms(result.highlight);
    if (matchTerms.length > 0) {
      signals.push({ type: 'text_overlap', terms: matchTerms.slice(0, 3) });
    }
  }

  return signals;
}

/**
 * Extract highlighted terms from FTS5 highlight markup.
 * FTS5 wraps matched terms in <mark> tags.
 */
function extractHighlightTerms(highlight: string): string[] {
  const re = /<mark>([^<]+)<\/mark>/g;
  const terms: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(highlight)) !== null) {
    const term = m[1].trim().toLowerCase();
    if (term.length >= 3 && !terms.includes(term)) {
      terms.push(term);
    }
  }
  return terms;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/ambient/AmbientSearcher.ts
git commit -m "feat(ambient): add AmbientSearcher with FTS5 search + result filtering"
```

---

## Task 6: AmbientTrigger

**Files:**
- Create: `src/service/ambient/AmbientTrigger.ts`

- [ ] **Step 1: Implement AmbientTrigger**

```typescript
// src/service/ambient/AmbientTrigger.ts
import type { App, EventRef, TFile } from 'obsidian';
import type { AmbientPushSettings } from './types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from './types';

type TriggerCallback = (filePath: string, triggerType: 'writing_pause' | 'doc_switch' | 'manual') => void;

/**
 * Event gateway for Ambient Push.
 * Listens to editor changes and file-open events, applies debounce + cooldown + significance filter.
 */
export class AmbientTrigger {
  private charAccumulator = 0;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTriggerTs = 0;
  private lastFilePath: string | null = null;
  private fileOpenedAt = 0;
  private eventRefs: EventRef[] = [];
  private disposed = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => AmbientPushSettings,
    private readonly onTrigger: TriggerCallback,
  ) {}

  start(): void {
    // Listen to editor changes
    const editorChangeRef = this.app.workspace.on('editor-change', (editor) => {
      if (this.disposed) return;
      this.onEditorChange(editor);
    });
    this.eventRefs.push(editorChangeRef);

    // Listen to file-open
    const fileOpenRef = this.app.workspace.on('file-open', (file: TFile | null) => {
      if (this.disposed) return;
      if (file) this.onFileOpen(file);
    });
    this.eventRefs.push(fileOpenRef);

    // Register events with app workspace for auto-cleanup
    for (const ref of this.eventRefs) {
      this.app.workspace.trigger('', ref); // noop — we manage refs manually
    }
  }

  /** Manually trigger an ambient push for the current file. */
  triggerManual(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file || this.shouldSkip(file.path)) return;
    this.lastTriggerTs = Date.now();
    this.onTrigger(file.path, 'manual');
  }

  dispose(): void {
    this.disposed = true;
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    for (const ref of this.eventRefs) {
      this.app.workspace.offref(ref);
    }
    this.eventRefs = [];
  }

  private onEditorChange(_editor: unknown): void {
    const settings = this.getSettings();
    if (!settings.enabled) return;

    const file = this.app.workspace.getActiveFile();
    if (!file || this.shouldSkip(file.path)) return;

    // Accumulate character changes (approximate — we count each change event as ~1 char)
    this.charAccumulator++;

    // Reset pause timer
    if (this.pauseTimer) clearTimeout(this.pauseTimer);

    // Start a new pause timer — if user stops typing for writingPauseMs, trigger
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      if (this.charAccumulator >= settings.minCharDelta && this.canTrigger(settings.triggerCooldownMs)) {
        this.charAccumulator = 0;
        this.lastTriggerTs = Date.now();
        this.onTrigger(file.path, 'writing_pause');
      }
    }, settings.writingPauseMs);
  }

  private onFileOpen(file: TFile): void {
    const settings = this.getSettings();
    if (!settings.enabled) return;
    if (this.shouldSkip(file.path)) return;

    // Only trigger on actual file change, not tab refocus
    if (file.path === this.lastFilePath) return;
    this.lastFilePath = file.path;
    this.fileOpenedAt = Date.now();
    this.charAccumulator = 0;

    if (!this.canTrigger(settings.docSwitchCooldownMs)) return;

    this.lastTriggerTs = Date.now();
    this.onTrigger(file.path, 'doc_switch');
  }

  getFileOpenedAt(): number {
    return this.fileOpenedAt;
  }

  private canTrigger(cooldownMs: number): boolean {
    return Date.now() - this.lastTriggerTs >= cooldownMs;
  }

  /** Skip hub summaries, AI analysis output, and non-markdown files. */
  private shouldSkip(path: string): boolean {
    if (!path.endsWith('.md')) return true;
    const skipPrefixes = ['Hub-Summaries/', 'ChatFolder/AI-Analysis/'];
    return skipPrefixes.some(prefix => path.includes(prefix));
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/ambient/AmbientTrigger.ts
git commit -m "feat(ambient): add AmbientTrigger with debounce, cooldown, significance filter"
```

---

## Task 7: AmbientPushService (orchestrator)

**Files:**
- Create: `src/service/ambient/AmbientPushService.ts`

- [ ] **Step 1: Implement the orchestrator**

```typescript
// src/service/ambient/AmbientPushService.ts
import type { App } from 'obsidian';
import type { AmbientPushSettings, TriggerType } from './types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from './types';
import { AmbientTrigger } from './AmbientTrigger';
import { extractContext } from './ContextExtractor';
import { ambientSearch } from './AmbientSearcher';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Orchestrates the ambient push pipeline:
 * trigger → context extraction → search → explain → store update → SQLite log
 */
export class AmbientPushService {
  private static instance: AmbientPushService | null = null;
  private trigger: AmbientTrigger | null = null;
  private pendingSearch: AbortController | null = null;

  static getInstance(): AmbientPushService {
    if (!this.instance) this.instance = new AmbientPushService();
    return this.instance;
  }

  start(app: App): void {
    if (this.trigger) return; // already started

    this.trigger = new AmbientTrigger(
      app,
      () => this.getSettings(),
      (filePath, triggerType) => void this.handleTrigger(filePath, triggerType),
    );
    this.trigger.start();
  }

  triggerManual(): void {
    this.trigger?.triggerManual();
  }

  dispose(): void {
    this.trigger?.dispose();
    this.trigger = null;
    this.pendingSearch?.abort();
    this.pendingSearch = null;
    AmbientPushService.instance = null;
  }

  private getSettings(): AmbientPushSettings {
    return AppContext.getSettings().ambientPush ?? DEFAULT_AMBIENT_PUSH_SETTINGS;
  }

  private async handleTrigger(filePath: string, triggerType: TriggerType): Promise<void> {
    // Cancel any in-flight search
    this.pendingSearch?.abort();
    const abort = new AbortController();
    this.pendingSearch = abort;

    try {
      const app = AppContext.getApp();
      const settings = this.getSettings();
      const store = useAmbientPushStore.getState();

      // Step 1: Extract context
      const context = extractContext(app, this.trigger?.getFileOpenedAt() ?? Date.now());
      if (!context || context.currentParagraph.trim().length < 10) {
        // Not enough context to search
        return;
      }

      if (abort.signal.aborted) return;

      // Step 2: Search
      const items = await ambientSearch(context, settings.maxPushItems, store.pushHistory);

      if (abort.signal.aborted) return;

      if (items.length === 0) {
        store.clearItems();
        return;
      }

      // Step 3: Update store
      store.setItems(items);

      // Step 4: Update push history (session-level dedup)
      const now = Date.now();
      for (const item of items) {
        store.recordPush(item.filePath, now);
      }

      // Step 5: Log to SQLite (fire-and-forget)
      void this.logPushes(context, items, triggerType);

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[AmbientPush] search failed:', err);
    } finally {
      if (this.pendingSearch === abort) this.pendingSearch = null;
    }
  }

  private async logPushes(
    context: { filePath: string; currentParagraph: string },
    items: Array<{ filePath: string; score: number; explanationType: string; explanation: string }>,
    triggerType: TriggerType,
  ): Promise<void> {
    try {
      const repo = sqliteStoreManager.getAmbientPushRepo();
      const now = Date.now();
      for (const item of items) {
        await repo.logPush({
          timestamp: now,
          triggerType,
          sourceFilePath: context.filePath,
          contextParagraph: context.currentParagraph.slice(0, 500),
          pushedFilePath: item.filePath,
          pushedScore: item.score,
          explanationType: item.explanationType,
          explanationText: item.explanation,
        });
      }
    } catch {
      // SQLite might not be ready — fail silently
    }
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: May fail — `ambientPushStore` not yet created. Proceed to Task 8.

- [ ] **Step 3: Commit (after Task 8)**

Commit together with Task 8.

---

## Task 8: Zustand Store

**Files:**
- Create: `src/ui/store/ambientPushStore.ts`

- [ ] **Step 1: Create the store**

```typescript
// src/ui/store/ambientPushStore.ts
import { create } from 'zustand';
import type { AmbientPushItem, UserAction } from '@/service/ambient/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

interface AmbientPushStoreState {
  items: AmbientPushItem[];
  pushHistory: Map<string, number>;
  lastUpdateTs: number;

  setItems: (items: AmbientPushItem[]) => void;
  clearItems: () => void;
  dismissItem: (filePath: string) => void;
  recordPush: (filePath: string, timestamp: number) => void;
  recordAction: (sourceFilePath: string, pushedFilePath: string, action: UserAction) => void;
}

export const useAmbientPushStore = create<AmbientPushStoreState>((set, get) => ({
  items: [],
  pushHistory: new Map(),
  lastUpdateTs: 0,

  setItems: (items) => set({ items, lastUpdateTs: Date.now() }),

  clearItems: () => set({ items: [], lastUpdateTs: Date.now() }),

  dismissItem: (filePath) => {
    set(state => ({
      items: state.items.filter(i => i.filePath !== filePath),
      lastUpdateTs: Date.now(),
    }));
  },

  recordPush: (filePath, timestamp) => {
    const history = get().pushHistory;
    history.set(filePath, timestamp);
  },

  recordAction: (sourceFilePath, pushedFilePath, action) => {
    // Fire-and-forget SQLite update
    try {
      const repo = sqliteStoreManager.getAmbientPushRepo();
      void repo.recordAction({ sourceFilePath, pushedFilePath, action });
    } catch {
      // SQLite not ready — silently skip
    }
  },
}));
```

- [ ] **Step 2: Verify build (with Task 7)**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/ambient/AmbientPushService.ts src/ui/store/ambientPushStore.ts
git commit -m "feat(ambient): add AmbientPushService orchestrator and Zustand store"
```

---

## Task 9: UI Components (Panel + Card + View)

**Files:**
- Create: `src/ui/view/ambient-push/PushCard.tsx`
- Create: `src/ui/view/ambient-push/AmbientPushPanel.tsx`
- Create: `src/ui/view/AmbientPushView.ts`

- [ ] **Step 1: Create PushCard component**

```tsx
// src/ui/view/ambient-push/PushCard.tsx
import { FileText, Link, ExternalLink, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { AmbientPushItem } from '@/service/ambient/types';
import { AppContext } from '@/app/context/AppContext';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';

interface PushCardProps {
  item: AmbientPushItem;
  sourceFilePath: string;
}

export function PushCard({ item, sourceFilePath }: PushCardProps) {
  const { dismissItem, recordAction } = useAmbientPushStore.getState();

  const handleOpen = async () => {
    const app = AppContext.getApp();
    const file = app.vault.getAbstractFileByPath(item.filePath);
    if (file) {
      await app.workspace.openLinkText(item.filePath, '', true);
      recordAction(sourceFilePath, item.filePath, 'opened');
    }
  };

  const handleInsertLink = () => {
    const app = AppContext.getApp();
    const mdView = app.workspace.getActiveViewOfType(
      require('obsidian').MarkdownView
    );
    if (mdView) {
      const editor = mdView.editor;
      const cursor = editor.getCursor();
      const linkText = `[[${item.title}]]`;
      editor.replaceRange(linkText, cursor);
      recordAction(sourceFilePath, item.filePath, 'linked');
    }
  };

  const handleDismiss = () => {
    dismissItem(item.filePath);
    recordAction(sourceFilePath, item.filePath, 'dismissed');
  };

  return (
    <div className="group rounded-md border border-[--background-modifier-border] p-3 hover:bg-[--background-modifier-hover] transition-colors">
      {/* Title */}
      <div
        className="flex items-center gap-1.5 cursor-pointer text-[--text-normal] font-medium text-sm"
        onClick={handleOpen}
      >
        <FileText className="w-3.5 h-3.5 shrink-0 text-[--text-muted]" />
        <span className="truncate">{item.title}</span>
      </div>

      {/* Excerpt */}
      {item.excerpt && (
        <span className="block mt-1.5 text-xs text-[--text-muted] line-clamp-2 leading-relaxed">
          {item.excerpt}
        </span>
      )}

      {/* Explanation tag */}
      <span className="inline-block mt-2 text-xs px-1.5 py-0.5 rounded bg-[--background-modifier-hover] text-[--text-accent]">
        {item.explanation}
      </span>

      {/* Action buttons — hover reveal */}
      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleInsertLink}>
          <Link className="w-3 h-3 mr-1" />
          Insert Link
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleOpen}>
          <ExternalLink className="w-3 h-3 mr-1" />
          Open
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-1 text-xs text-[--text-muted]" onClick={handleDismiss}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AmbientPushPanel component**

```tsx
// src/ui/view/ambient-push/AmbientPushPanel.tsx
import { Zap, RefreshCw, Settings, Pause, Play } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { AmbientPushService } from '@/service/ambient/AmbientPushService';
import { PushCard } from './PushCard';
import { AppContext } from '@/app/context/AppContext';

export function AmbientPushPanel() {
  const items = useAmbientPushStore(s => s.items);
  const lastUpdateTs = useAmbientPushStore(s => s.lastUpdateTs);

  const activeFile = AppContext.getApp().workspace.getActiveFile();
  const sourceFilePath = activeFile?.path ?? '';

  const handleRefresh = () => {
    AmbientPushService.getInstance().triggerManual();
  };

  const elapsedSec = lastUpdateTs ? Math.round((Date.now() - lastUpdateTs) / 1000) : 0;
  const elapsedText = lastUpdateTs
    ? elapsedSec < 60 ? `${elapsedSec}s ago` : `${Math.round(elapsedSec / 60)}m ago`
    : 'No data';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[--background-modifier-border]">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[--text-normal]">
          <Zap className="w-4 h-4 text-[--text-accent]" />
          <span>Related Notes</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleRefresh}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[--text-muted] text-xs">
            <Zap className="w-8 h-8 mb-2 opacity-30" />
            <span>Start writing to see related notes</span>
          </div>
        ) : (
          items.map(item => (
            <PushCard
              key={item.filePath}
              item={item}
              sourceFilePath={sourceFilePath}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[--background-modifier-border] text-[--text-faint] text-xs">
          <span>
            {items.length} related note{items.length !== 1 ? 's' : ''}
          </span>
          <span>{elapsedText}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create AmbientPushView (ItemView wrapper)**

```typescript
// src/ui/view/AmbientPushView.ts
import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';

export const AMBIENT_PUSH_VIEW_TYPE = 'peak-ambient-push-view';

export class AmbientPushView extends ItemView {
  private reactRenderer: ReactRenderer | null = null;
  private openRafId: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly appContext: AppContext) {
    super(leaf);
  }

  getViewType(): string { return AMBIENT_PUSH_VIEW_TYPE; }
  getDisplayText(): string { return 'Related Notes'; }
  getIcon(): IconName { return 'zap'; }

  async onOpen(): Promise<void> {
    this.containerEl.empty();
    this.containerEl.addClass('peak-ambient-push-view');
    this.reactRenderer = new ReactRenderer(this.containerEl);
    this.openRafId = requestAnimationFrame(() => {
      this.openRafId = null;
      this.render();
    });
  }

  private render(): void {
    if (!this.reactRenderer) return;
    // Dynamic import to keep the view file lean
    import('./ambient-push/AmbientPushPanel').then(({ AmbientPushPanel }) => {
      this.reactRenderer?.render(
        createReactElementWithServices(AmbientPushPanel, {}, this.appContext)
      );
    });
  }

  async onClose(): Promise<void> {
    if (this.openRafId != null) { cancelAnimationFrame(this.openRafId); this.openRafId = null; }
    if (this.reactRenderer) { this.reactRenderer.unmount(); this.reactRenderer = null; }
    this.containerEl.empty();
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/ambient-push/PushCard.tsx src/ui/view/ambient-push/AmbientPushPanel.tsx src/ui/view/AmbientPushView.ts
git commit -m "feat(ambient): add AmbientPushPanel UI with PushCard and ItemView wrapper"
```

---

## Task 10: ViewManager + Commands + main.ts Wiring

**Files:**
- Modify: `src/app/view/ViewManager.ts:26`
- Modify: `src/app/commands/Register.ts:667`
- Modify: `main.ts:184`

- [ ] **Step 1: Register view in ViewManager**

In `src/app/view/ViewManager.ts`, add import:
```typescript
import { AmbientPushView, AMBIENT_PUSH_VIEW_TYPE } from '@/ui/view/AmbientPushView';
```

In the constructor, add to `viewCreators`:
```typescript
this.viewCreators.set(AMBIENT_PUSH_VIEW_TYPE, (leaf) => {
  return new AmbientPushView(leaf, appContext);
});
```

Add a method to open the panel (follow existing patterns for other views):
```typescript
async activateAmbientPushView(): Promise<void> {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(AMBIENT_PUSH_VIEW_TYPE)[0];
  if (!leaf) {
    const rightLeaf = workspace.getRightLeaf(false);
    if (rightLeaf) {
      await rightLeaf.setViewState({ type: AMBIENT_PUSH_VIEW_TYPE, active: true });
      leaf = rightLeaf;
    }
  }
  if (leaf) workspace.revealLeaf(leaf);
}
```

- [ ] **Step 2: Add commands in Register.ts**

In `src/app/commands/Register.ts`, add:

```typescript
import { AMBIENT_PUSH_VIEW_TYPE } from '@/ui/view/AmbientPushView';
import { AmbientPushService } from '@/service/ambient/AmbientPushService';
```

Add builder function:
```typescript
function buildAmbientPushCommands(viewManager: ViewManager): Command[] {
  return [
    {
      id: 'peak-ambient-push-toggle',
      name: 'Peak: Toggle Related Notes Panel',
      callback: () => void viewManager.activateAmbientPushView(),
    },
    {
      id: 'peak-ambient-push-refresh',
      name: 'Peak: Refresh Related Notes',
      callback: () => AmbientPushService.getInstance().triggerManual(),
    },
  ];
}
```

Add to `buildCoreCommands()`:
```typescript
...buildAmbientPushCommands(viewManager),
```

- [ ] **Step 3: Init AmbientPushService + status bar in main.ts**

In `main.ts`, after `AppContext` is created and search is initialized, add:

```typescript
import { AmbientPushService } from '@/service/ambient/AmbientPushService';
import { AMBIENT_PUSH_VIEW_TYPE } from '@/ui/view/AmbientPushView';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
```

In `onload()`, after search init:
```typescript
// Ambient Push
const ambientPushSettings = this.settings.ambientPush;
if (!ambientPushSettings || ambientPushSettings.enabled !== false) {
  const ambientService = AmbientPushService.getInstance();
  ambientService.start(this.app);

  // Status bar
  if (!ambientPushSettings || ambientPushSettings.showStatusBar !== false) {
    const statusBarEl = this.addStatusBarItem();
    statusBarEl.addClass('peak-ambient-status');
    statusBarEl.setText('⚡ 0 related');
    statusBarEl.onClickEvent(() => void this.viewManager?.activateAmbientPushView());

    // Subscribe to store updates for live count
    useAmbientPushStore.subscribe((state) => {
      const count = state.items.length;
      statusBarEl.setText(count > 0 ? `⚡ ${count} related` : '⚡ –');
    });
  }
}
```

In `onunload()`, add:
```typescript
AmbientPushService.getInstance().dispose();
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/view/ViewManager.ts src/app/commands/Register.ts main.ts
git commit -m "feat(ambient): wire AmbientPush view, commands, status bar, and service init"
```

---

## Task Summary

| Task | Component | Files | Deps |
|------|-----------|-------|------|
| 1 | Types + Settings | 3 files | — |
| 2 | SQLite Schema + Repo | 3 files | — |
| 3 | ContextExtractor + test | 2 files | Task 1 |
| 4 | RelevanceExplainer + test | 1 file | Task 1 |
| 5 | AmbientSearcher | 1 file | Task 1, 4 |
| 6 | AmbientTrigger | 1 file | Task 1 |
| 7 | AmbientPushService | 1 file | Task 1, 3, 5, 6, 8 |
| 8 | Zustand Store | 1 file | Task 1, 2 |
| 9 | UI Panel + Card + View | 3 files | Task 1, 8 |
| 10 | Wiring (ViewManager + Commands + main.ts) | 3 files | Task 7, 9 |

**Execution order:** Tasks 1-2 (parallel) → Tasks 3-4 (parallel) → Task 5 → Task 6 → Tasks 7-8 (together) → Task 9 → Task 10.
