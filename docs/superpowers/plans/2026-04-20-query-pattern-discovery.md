# Query Pattern Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "RECENT" chips and hardcoded default queries in the AI Analysis tab with a pattern-based contextual suggestion system that discovers reusable query templates from usage history and renders context-aware suggestions.

**Architecture:** New `query_pattern` SQLite table stores templates with placeholder variables and match conditions. `ContextProvider` collects vault context from Obsidian APIs synchronously. `PatternMatcher` filters/fills/sorts patterns against current context. A background `PatternDiscoveryAgent` incrementally analyzes query history to discover new patterns. The AI Analysis tab landing state is redesigned into a command-palette-style page with suggestion cards, active sessions, and recent history.

**Tech Stack:** Kysely (query builder), Zod (structured output), Claude Agent SDK (agent), React 18 + Tailwind (UI), Zustand (state)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/core/storage/sqlite/ddl.ts` | `query_pattern` table DDL + Database interface |
| `src/core/storage/sqlite/repositories/QueryPatternRepo.ts` | CRUD for query_pattern table |
| `src/core/schemas/agents/pattern-discovery-schemas.ts` | Zod schemas for discovery I/O |
| `src/service/context/ContextProvider.ts` | Collects VaultContext from Obsidian APIs |
| `src/service/context/PatternMatcher.ts` | Filters patterns by conditions, fills variables, sorts |
| `src/service/context/seed-patterns.ts` | Seed pattern definitions + insert-if-empty logic |
| `src/service/agents/PatternDiscoveryAgent.ts` | Background agent that discovers patterns from query history |
| `src/service/PatternMergeService.ts` | Dedup + insert + deprecate after agent run |
| `templates/prompts/pattern-discovery.md` | Prompt template for the discovery agent |
| `src/ui/view/quick-search/components/SuggestionGrid.tsx` | 2-col card grid for contextual suggestions |
| `src/ui/view/quick-search/components/ActiveSessionsList.tsx` | Background session cards (extracted from RecentAIAnalysis) |
| `src/ui/view/quick-search/components/RecentAnalysisList.tsx` | Flat history list + "View all" link |
| `src/ui/view/quick-search/SearchModal.tsx` | Modal overhaul: mode pills, footer, wire new components |

---

### Task 1: query_pattern Table DDL + QueryPatternRepo

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts:195-211` (Database interface), `ddl.ts:522` (after ai_analysis_record DDL)
- Create: `src/core/storage/sqlite/repositories/QueryPatternRepo.ts`
- Test: `test/query-pattern-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/query-pattern-repo.test.ts
import { QueryPatternRepo } from '../src/core/storage/sqlite/repositories/QueryPatternRepo';

// We test the repo methods against a mock that verifies Kysely call shapes.
// Since we can't easily spin up SQLite in tests, test the type contracts and seed logic.

function createMockDb() {
  const rows: any[] = [];
  return {
    insertInto: () => ({
      values: (v: any) => ({ onConflict: () => ({ doNothing: () => ({ execute: async () => { rows.push(v); } }) }) }),
    }),
    selectFrom: () => ({
      selectAll: () => ({
        where: (col: string, op: string, val: any) => ({
          where: () => ({ orderBy: () => ({ orderBy: () => ({ limit: () => ({ execute: async () => rows.filter((r: any) => !r.deprecated) }) }) }) }),
          execute: async () => rows.filter((r: any) => !r.deprecated),
        }),
        orderBy: () => ({ limit: () => ({ execute: async () => rows }) }),
        execute: async () => rows,
      }),
    }),
    updateTable: () => ({
      set: () => ({ where: () => ({ execute: async () => {} }) }),
    }),
    _rows: rows,
  } as any;
}

async function main() {
  // Test 1: insert and list non-deprecated patterns
  const db = createMockDb();
  const repo = new QueryPatternRepo(db);

  await repo.insert({
    id: 'p1',
    template: 'Analyze {activeDocumentTitle}',
    variables: JSON.stringify(['activeDocumentTitle']),
    conditions: JSON.stringify({ hasActiveDocument: true }),
    source: 'default',
    confidence: 1.0,
    usage_count: 0,
    discovered_at: Date.now(),
    last_used_at: null,
    deprecated: 0,
  });

  console.assert(db._rows.length === 1, 'Should have 1 row after insert');
  console.log('✅ QueryPatternRepo: insert works');

  // Test 2: Pattern shape matches Database interface
  const pattern = db._rows[0];
  console.assert(typeof pattern.id === 'string', 'id should be string');
  console.assert(typeof pattern.template === 'string', 'template should be string');
  console.assert(typeof pattern.variables === 'string', 'variables should be JSON string');
  console.assert(typeof pattern.conditions === 'string', 'conditions should be JSON string');
  console.assert(pattern.source === 'default' || pattern.source === 'discovered', 'source should be default|discovered');
  console.log('✅ QueryPatternRepo: shape matches Database interface');

  console.log('All QueryPatternRepo tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/query-pattern-repo.test.ts`
Expected: FAIL — `QueryPatternRepo` module not found

- [ ] **Step 3: Add query_pattern to Database interface in ddl.ts**

In `src/core/storage/sqlite/ddl.ts`, after `ai_analysis_record` interface (line 211), add:

```typescript
  query_pattern: {
    id: string;
    template: string;
    /** JSON string array of variable names, e.g. '["activeDocumentTitle"]' */
    variables: string;
    /** JSON MatchCondition object */
    conditions: string;
    /** "default" | "discovered" */
    source: string;
    confidence: number;
    usage_count: number;
    discovered_at: number;
    last_used_at: number | null;
    /** 0 = active, 1 = deprecated */
    deprecated: number;
  };
```

- [ ] **Step 4: Add query_pattern CREATE TABLE DDL**

In `src/core/storage/sqlite/ddl.ts`, after line 522 (after `analysis_preset` migration), add:

```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS query_pattern (
      id              TEXT PRIMARY KEY,
      template        TEXT NOT NULL,
      variables       TEXT NOT NULL,
      conditions      TEXT NOT NULL,
      source          TEXT NOT NULL,
      confidence      REAL DEFAULT 1.0,
      usage_count     INTEGER DEFAULT 0,
      discovered_at   INTEGER NOT NULL,
      last_used_at    INTEGER,
      deprecated      INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_query_pattern_deprecated ON query_pattern(deprecated);
    CREATE INDEX IF NOT EXISTS idx_query_pattern_source ON query_pattern(source);
  `);
```

- [ ] **Step 5: Implement QueryPatternRepo**

```typescript
// src/core/storage/sqlite/repositories/QueryPatternRepo.ts
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

export class QueryPatternRepo {
  constructor(private readonly db: Kysely<DbSchema>) {}

  async insert(record: DbSchema['query_pattern']): Promise<void> {
    await this.db
      .insertInto('query_pattern')
      .values(record)
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
  }

  async listActive(): Promise<DbSchema['query_pattern'][]> {
    return this.db
      .selectFrom('query_pattern')
      .selectAll()
      .where('deprecated', '=', 0)
      .orderBy('usage_count', 'desc')
      .orderBy('discovered_at', 'desc')
      .execute();
  }

  async listAll(): Promise<DbSchema['query_pattern'][]> {
    return this.db
      .selectFrom('query_pattern')
      .selectAll()
      .execute();
  }

  async incrementUsage(id: string): Promise<void> {
    await this.db
      .updateTable('query_pattern')
      .set({ usage_count: (eb) => eb.bxp('usage_count', '+', 1), last_used_at: Date.now() })
      .where('id', '=', id)
      .execute();
  }

  /** Use raw SQL for the increment since Kysely's bxp may not be available. */
  async incrementUsageRaw(id: string): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('query_pattern')
      .set({ last_used_at: now })
      .where('id', '=', id)
      .execute();
    // For usage_count increment, use raw:
    (this.db as any).executeQuery?.({
      sql: 'UPDATE query_pattern SET usage_count = usage_count + 1 WHERE id = ?',
      parameters: [id],
    });
  }

  async deprecate(id: string): Promise<void> {
    await this.db
      .updateTable('query_pattern')
      .set({ deprecated: 1 })
      .where('id', '=', id)
      .execute();
  }

  async deprecateStale(maxAgeDays: number): Promise<void> {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    await this.db
      .updateTable('query_pattern')
      .set({ deprecated: 1 })
      .where('source', '=', 'discovered')
      .where('usage_count', '=', 0)
      .where('discovered_at', '<', cutoff)
      .execute();
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('query_pattern')
      .select((eb) => eb.fn.countAll<number>().as('cnt'))
      .executeTakeFirst();
    return Number((row as any)?.cnt ?? 0);
  }

  async isEmpty(): Promise<boolean> {
    return (await this.count()) === 0;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- test/query-pattern-repo.test.ts`
Expected: PASS — all assertions green

- [ ] **Step 7: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts src/core/storage/sqlite/repositories/QueryPatternRepo.ts test/query-pattern-repo.test.ts
git commit -m "feat(query-pattern): add query_pattern table DDL + QueryPatternRepo"
```

---

### Task 2: Zod Schemas for Pattern Discovery I/O

**Files:**
- Create: `src/core/schemas/agents/pattern-discovery-schemas.ts`
- Test: `test/pattern-discovery-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/pattern-discovery-schemas.test.ts
import { MatchConditionSchema, PatternDiscoveryOutputSchema } from '../src/core/schemas/agents/pattern-discovery-schemas';

function main() {
  // Test 1: valid MatchCondition
  const cond = MatchConditionSchema.parse({ hasActiveDocument: true, tagMatch: ['product'] });
  console.assert(cond.hasActiveDocument === true);
  console.assert(cond.tagMatch![0] === 'product');
  console.log('✅ MatchConditionSchema: valid parse');

  // Test 2: always condition
  const always = MatchConditionSchema.parse({ always: true });
  console.assert(always.always === true);
  console.log('✅ MatchConditionSchema: always condition');

  // Test 3: valid PatternDiscoveryOutput
  const output = PatternDiscoveryOutputSchema.parse({
    newPatterns: [{
      template: 'Analyze {activeDocumentTitle}',
      variables: ['activeDocumentTitle'],
      conditions: { hasActiveDocument: true },
      confidence: 0.85,
      reasoning: 'Common pattern in user queries',
    }],
    deprecateIds: ['old-pattern-1'],
  });
  console.assert(output.newPatterns.length === 1);
  console.assert(output.deprecateIds[0] === 'old-pattern-1');
  console.log('✅ PatternDiscoveryOutputSchema: valid parse');

  // Test 4: confidence clamped to 0-1
  try {
    PatternDiscoveryOutputSchema.parse({
      newPatterns: [{
        template: 'test',
        variables: [],
        conditions: {},
        confidence: 1.5,
        reasoning: 'test',
      }],
      deprecateIds: [],
    });
    console.assert(false, 'Should have thrown for confidence > 1');
  } catch {
    console.log('✅ PatternDiscoveryOutputSchema: rejects confidence > 1');
  }

  console.log('All pattern-discovery-schemas tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/pattern-discovery-schemas.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement schemas**

```typescript
// src/core/schemas/agents/pattern-discovery-schemas.ts
import { z } from 'zod';

export const MatchConditionSchema = z.object({
  hasActiveDocument: z.boolean().optional(),
  folderMatch: z.string().optional(),
  tagMatch: z.array(z.string()).optional(),
  hasOutgoingLinks: z.boolean().optional(),
  hasBacklinks: z.boolean().optional(),
  propertyMatch: z.object({ key: z.string(), value: z.string().optional() }).optional(),
  keywordMatch: z.array(z.string()).optional(),
  always: z.boolean().optional(),
}).passthrough();

export type MatchCondition = z.infer<typeof MatchConditionSchema>;

export const DiscoveredPatternSchema = z.object({
  template: z.string(),
  variables: z.array(z.string()),
  conditions: MatchConditionSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type DiscoveredPattern = z.infer<typeof DiscoveredPatternSchema>;

export const PatternDiscoveryOutputSchema = z.object({
  newPatterns: z.array(DiscoveredPatternSchema),
  deprecateIds: z.array(z.string()),
});

export type PatternDiscoveryOutput = z.infer<typeof PatternDiscoveryOutputSchema>;

/** Context variables available for template filling. */
export const CONTEXT_VARIABLE_NAMES = [
  'activeDocumentTitle', 'activeDocumentPath', 'currentFolder',
  'documentTags', 'vaultName', 'documentKeywords', 'firstHeading',
  'frontmatterProperties', 'documentType', 'outgoingLinks', 'backlinks',
  'linkContext', 'recentDocuments', 'recentFolders', 'documentAge',
] as const;

export type ContextVariableName = typeof CONTEXT_VARIABLE_NAMES[number];

export const CONDITION_NAMES = [
  'hasActiveDocument', 'folderMatch', 'tagMatch', 'hasOutgoingLinks',
  'hasBacklinks', 'propertyMatch', 'keywordMatch', 'always',
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/pattern-discovery-schemas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/schemas/agents/pattern-discovery-schemas.ts test/pattern-discovery-schemas.test.ts
git commit -m "feat(query-pattern): add Zod schemas for pattern discovery I/O"
```

---

### Task 3: ContextProvider — Collect VaultContext

**Files:**
- Create: `src/service/context/ContextProvider.ts`
- Test: `test/context-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/context-provider.test.ts
import { fillVaultContext, type VaultContext } from '../src/service/context/ContextProvider';

function main() {
  // Test 1: fills context from mock Obsidian data
  const mockActiveFile = {
    basename: 'Competitor Analysis',
    path: 'Projects/Competitor Analysis.md',
    parent: { path: 'Projects' },
    stat: { ctime: Date.now() - 30 * 24 * 60 * 60 * 1000 },
  };
  const mockMetadata = {
    frontmatter: { tags: ['product', 'competitor'], type: 'project', status: 'draft' },
    headings: [{ heading: 'My SaaS Product Plan', level: 1 }],
    links: [
      { link: 'Pricing Strategy' },
      { link: 'User Persona' },
      { link: 'MVP' },
    ],
  };

  const ctx = fillVaultContext({
    activeFile: mockActiveFile as any,
    metadata: mockMetadata as any,
    backlinks: ['Weekly Report', 'Product Roadmap'],
    recentFiles: ['Journal', 'Weekly Report', 'Book Notes'],
    vaultName: 'My Knowledge Base',
  });

  console.assert(ctx.activeDocumentTitle === 'Competitor Analysis', 'title');
  console.assert(ctx.currentFolder === 'Projects', 'folder');
  console.assert(ctx.documentTags === 'product, competitor', 'tags');
  console.assert(ctx.outgoingLinks === 'Pricing Strategy, User Persona, MVP', 'outlinks');
  console.assert(ctx.backlinks === 'Weekly Report, Product Roadmap', 'backlinks');
  console.assert(ctx.documentType === 'project', 'docType');
  console.assert(ctx.firstHeading === 'My SaaS Product Plan', 'heading');
  console.log('✅ fillVaultContext: all fields populated');

  // Test 2: null active file → minimal context
  const emptyCtx = fillVaultContext({
    activeFile: null,
    metadata: null,
    backlinks: [],
    recentFiles: ['Recent1', 'Recent2'],
    vaultName: 'Test Vault',
  });
  console.assert(emptyCtx.activeDocumentTitle === null, 'no active doc title');
  console.assert(emptyCtx.vaultName === 'Test Vault', 'vault name still set');
  console.assert(emptyCtx.recentDocuments === 'Recent1, Recent2', 'recent docs');
  console.log('✅ fillVaultContext: null active file handled');

  console.log('All ContextProvider tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/context-provider.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ContextProvider**

```typescript
// src/service/context/ContextProvider.ts
import type { App, TFile, CachedMetadata } from 'obsidian';

export interface VaultContext {
  // Document basics
  activeDocumentTitle: string | null;
  activeDocumentPath: string | null;
  currentFolder: string | null;
  documentTags: string | null;
  vaultName: string;
  // Content features
  documentKeywords: string | null;
  firstHeading: string | null;
  frontmatterProperties: string | null;
  documentType: string | null;
  // Relationships
  outgoingLinks: string | null;
  backlinks: string | null;
  linkContext: string | null;
  // Temporal
  recentDocuments: string | null;
  recentFolders: string | null;
  documentAge: string | null;
}

interface FillParams {
  activeFile: TFile | null;
  metadata: CachedMetadata | null;
  backlinks: string[];
  recentFiles: string[];
  vaultName: string;
}

/**
 * Pure function that builds VaultContext from pre-collected Obsidian data.
 * Testable without Obsidian runtime.
 */
export function fillVaultContext(params: FillParams): VaultContext {
  const { activeFile, metadata, backlinks, recentFiles, vaultName } = params;

  const tags = metadata?.frontmatter?.tags;
  const tagStr = Array.isArray(tags) ? tags.join(', ') : (typeof tags === 'string' ? tags : null);

  const headings = metadata?.headings ?? [];
  const h1 = headings.find((h) => h.level === 1);
  const topHeadings = headings.filter((h) => h.level <= 2).slice(0, 5);

  const links = metadata?.links ?? [];
  const outgoingLinkNames = links.map((l) => l.link).filter(Boolean);

  // Keywords: title + H1 + H2 headings (deduplicated)
  const keywordParts: string[] = [];
  if (activeFile) keywordParts.push(activeFile.basename);
  topHeadings.forEach((h) => keywordParts.push(h.heading));
  const keywords = [...new Set(keywordParts)].slice(0, 5);

  // Frontmatter properties (key: value pairs)
  const fm = metadata?.frontmatter;
  const fmPairs = fm
    ? Object.entries(fm)
        .filter(([k]) => k !== 'tags' && k !== 'position')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : null;

  // Document age
  const ctime = activeFile?.stat?.ctime;
  const ageStr = ctime ? String(Math.floor((Date.now() - ctime) / (24 * 60 * 60 * 1000))) : null;

  // Recent folders (deduplicated from recent files)
  const recentFolders = [...new Set(
    recentFiles.map((f) => {
      const idx = f.lastIndexOf('/');
      return idx >= 0 ? f.slice(0, idx) : '';
    }).filter(Boolean)
  )].slice(0, 5);

  return {
    activeDocumentTitle: activeFile?.basename ?? null,
    activeDocumentPath: activeFile?.path ?? null,
    currentFolder: (activeFile?.parent as any)?.path ?? null,
    documentTags: tagStr,
    vaultName,
    documentKeywords: keywords.length > 0 ? keywords.join(', ') : null,
    firstHeading: h1?.heading ?? null,
    frontmatterProperties: fmPairs || null,
    documentType: fm?.type ?? fm?.category ?? null,
    outgoingLinks: outgoingLinkNames.length > 0 ? outgoingLinkNames.join(', ') : null,
    backlinks: backlinks.length > 0 ? backlinks.join(', ') : null,
    linkContext: null, // TODO: would require reading file content; skip for v1
    recentDocuments: recentFiles.length > 0 ? recentFiles.slice(0, 5).join(', ') : null,
    recentFolders: recentFolders.length > 0 ? recentFolders.join(', ') : null,
    documentAge: ageStr,
  };
}

/**
 * Obsidian-aware context collector. Calls Obsidian APIs synchronously
 * and delegates to fillVaultContext for the actual construction.
 */
export class ContextProvider {
  constructor(private readonly app: App) {}

  collect(): VaultContext {
    const activeFile = this.app.workspace.getActiveFile();
    const metadata = activeFile ? this.app.metadataCache.getFileCache(activeFile) : null;

    // Backlinks: resolvedLinks is { [sourcePath]: { [targetPath]: count } }
    const backlinks: string[] = [];
    if (activeFile) {
      const resolved = this.app.metadataCache.resolvedLinks;
      for (const [sourcePath, targets] of Object.entries(resolved)) {
        if (targets[activeFile.path]) {
          const basename = sourcePath.split('/').pop()?.replace(/\.md$/, '') ?? sourcePath;
          backlinks.push(basename);
        }
      }
    }

    // Recent files from file-open history (last 5)
    const recentFiles = (this.app.workspace as any).getLastOpenFiles?.()?.slice(0, 5) ?? [];

    return fillVaultContext({
      activeFile,
      metadata,
      backlinks: backlinks.slice(0, 10),
      recentFiles,
      vaultName: this.app.vault.getName(),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/context-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/context/ContextProvider.ts test/context-provider.test.ts
git commit -m "feat(query-pattern): add ContextProvider for vault context collection"
```

---

### Task 4: PatternMatcher — Filter, Fill, Sort

**Files:**
- Create: `src/service/context/PatternMatcher.ts`
- Test: `test/pattern-matcher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/pattern-matcher.test.ts
import { matchPatterns, evaluateConditions } from '../src/service/context/PatternMatcher';
import type { VaultContext } from '../src/service/context/ContextProvider';

function main() {
  const ctx: VaultContext = {
    activeDocumentTitle: 'Competitor Analysis',
    activeDocumentPath: 'Projects/Competitor Analysis.md',
    currentFolder: 'Projects',
    documentTags: 'product, competitor',
    vaultName: 'My KB',
    documentKeywords: 'indie dev, SaaS, pricing',
    firstHeading: 'My SaaS Product Plan',
    frontmatterProperties: 'status: draft, type: project',
    documentType: 'project',
    outgoingLinks: 'Pricing Strategy, User Persona, MVP',
    backlinks: 'Weekly Report, Product Roadmap',
    linkContext: null,
    recentDocuments: 'Journal, Weekly Report, Book Notes',
    recentFolders: 'Projects, Journal',
    documentAge: '30',
  };

  // Test 1: hasActiveDocument condition
  console.assert(evaluateConditions({ hasActiveDocument: true }, ctx) === true);
  console.assert(evaluateConditions({ hasActiveDocument: true }, { ...ctx, activeDocumentTitle: null }) === false);
  console.log('✅ hasActiveDocument condition');

  // Test 2: tagMatch condition
  console.assert(evaluateConditions({ tagMatch: ['product'] }, ctx) === true);
  console.assert(evaluateConditions({ tagMatch: ['nonexistent'] }, ctx) === false);
  console.assert(evaluateConditions({ tagMatch: [] }, ctx) === true); // [] = has any tags
  console.log('✅ tagMatch condition');

  // Test 3: hasOutgoingLinks / hasBacklinks
  console.assert(evaluateConditions({ hasOutgoingLinks: true }, ctx) === true);
  console.assert(evaluateConditions({ hasBacklinks: true }, ctx) === true);
  console.assert(evaluateConditions({ hasOutgoingLinks: true }, { ...ctx, outgoingLinks: null }) === false);
  console.log('✅ link conditions');

  // Test 4: always condition
  console.assert(evaluateConditions({ always: true }, ctx) === true);
  console.assert(evaluateConditions({ always: true }, { ...ctx, activeDocumentTitle: null }) === true);
  console.log('✅ always condition');

  // Test 5: folderMatch condition
  console.assert(evaluateConditions({ folderMatch: 'Projects' }, ctx) === true);
  console.assert(evaluateConditions({ folderMatch: 'Projects/*' }, ctx) === false); // exact folder, not subpath
  console.assert(evaluateConditions({ folderMatch: 'Other' }, ctx) === false);
  console.log('✅ folderMatch condition');

  // Test 6: matchPatterns fills variables and filters
  const patterns = [
    { id: 'p1', template: 'Analyze {activeDocumentTitle}', variables: '["activeDocumentTitle"]', conditions: '{"hasActiveDocument":true}', source: 'default', confidence: 1, usage_count: 5, discovered_at: 1000, last_used_at: 2000, deprecated: 0 },
    { id: 'p2', template: 'Links of {outgoingLinks}', variables: '["outgoingLinks"]', conditions: '{"hasOutgoingLinks":true}', source: 'default', confidence: 1, usage_count: 3, discovered_at: 1000, last_used_at: 1500, deprecated: 0 },
    { id: 'p3', template: 'No context {nonexistentVar}', variables: '["nonexistentVar"]', conditions: '{"always":true}', source: 'discovered', confidence: 0.5, usage_count: 0, discovered_at: 1000, last_used_at: null, deprecated: 0 },
  ];

  const results = matchPatterns(patterns, ctx);
  console.assert(results.length === 2, `Expected 2 results, got ${results.length}`); // p3 filtered (missing var)
  console.assert(results[0].filledTemplate === 'Analyze Competitor Analysis', `Got: ${results[0].filledTemplate}`);
  console.assert(results[0].patternId === 'p1', 'Sorted by usage_count desc');
  console.assert(results[1].filledTemplate === 'Links of Pricing Strategy, User Persona, MVP');
  console.log('✅ matchPatterns: fills, filters, sorts');

  console.log('All PatternMatcher tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/pattern-matcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PatternMatcher**

```typescript
// src/service/context/PatternMatcher.ts
import type { VaultContext } from './ContextProvider';
import type { MatchCondition } from '@/core/schemas/agents/pattern-discovery-schemas';

interface StoredPattern {
  id: string;
  template: string;
  variables: string; // JSON string[]
  conditions: string; // JSON MatchCondition
  source: string;
  confidence: number;
  usage_count: number;
  discovered_at: number;
  last_used_at: number | null;
  deprecated: number;
}

export interface MatchedSuggestion {
  patternId: string;
  filledTemplate: string;
  variables: string[];
  source: string;
  confidence: number;
  usageCount: number;
  /** Context source type for icon display */
  contextType: 'activeDoc' | 'outlinks' | 'folder' | 'tags' | 'backlinks' | 'recent' | 'general';
  /** Context tags explaining why this suggestion appeared */
  contextTags: string[];
}

/**
 * Evaluate all conditions in a MatchCondition against the current VaultContext.
 * All specified conditions must pass (AND logic).
 */
export function evaluateConditions(conditions: MatchCondition, ctx: VaultContext): boolean {
  if (conditions.always) return true;

  if (conditions.hasActiveDocument !== undefined) {
    const hasDoc = ctx.activeDocumentTitle !== null;
    if (conditions.hasActiveDocument !== hasDoc) return false;
  }

  if (conditions.folderMatch !== undefined) {
    if (!ctx.currentFolder) return false;
    // Simple glob: exact match or wildcard suffix
    const pattern = conditions.folderMatch;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (!ctx.currentFolder.startsWith(prefix + '/') && ctx.currentFolder !== prefix) return false;
    } else if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (!ctx.currentFolder.startsWith(prefix)) return false;
    } else {
      if (ctx.currentFolder !== pattern) return false;
    }
  }

  if (conditions.tagMatch !== undefined) {
    if (!ctx.documentTags) return false;
    const docTags = ctx.documentTags.split(',').map((t) => t.trim().toLowerCase());
    if (conditions.tagMatch.length === 0) {
      // Empty array means "has any tags" — already passed the null check
    } else {
      const matchTags = conditions.tagMatch.map((t) => t.toLowerCase());
      if (!matchTags.some((mt) => docTags.includes(mt))) return false;
    }
  }

  if (conditions.hasOutgoingLinks !== undefined) {
    const hasLinks = ctx.outgoingLinks !== null;
    if (conditions.hasOutgoingLinks !== hasLinks) return false;
  }

  if (conditions.hasBacklinks !== undefined) {
    const has = ctx.backlinks !== null;
    if (conditions.hasBacklinks !== has) return false;
  }

  if (conditions.propertyMatch !== undefined) {
    if (!ctx.frontmatterProperties) return false;
    const props = ctx.frontmatterProperties;
    const { key, value } = conditions.propertyMatch;
    if (value !== undefined) {
      if (!props.includes(`${key}: ${value}`)) return false;
    } else {
      if (!props.includes(`${key}:`)) return false;
    }
  }

  if (conditions.keywordMatch !== undefined) {
    if (!ctx.documentKeywords) return false;
    const keywords = ctx.documentKeywords.split(',').map((k) => k.trim().toLowerCase());
    const matchKws = conditions.keywordMatch.map((k) => k.toLowerCase());
    if (!matchKws.some((mk) => keywords.includes(mk))) return false;
  }

  return true;
}

/** Determine the primary context type for icon selection. */
function inferContextType(variables: string[]): MatchedSuggestion['contextType'] {
  if (variables.includes('outgoingLinks') || variables.includes('backlinks')) return 'outlinks';
  if (variables.includes('activeDocumentTitle') || variables.includes('activeDocumentPath')) return 'activeDoc';
  if (variables.includes('currentFolder')) return 'folder';
  if (variables.includes('documentTags')) return 'tags';
  if (variables.includes('backlinks')) return 'backlinks';
  if (variables.includes('recentDocuments') || variables.includes('recentFolders')) return 'recent';
  return 'general';
}

/** Build context tags explaining why this suggestion was shown. */
function buildContextTags(variables: string[], ctx: VaultContext): string[] {
  const tags: string[] = [];
  if (variables.includes('activeDocumentTitle') && ctx.activeDocumentTitle) tags.push('Active doc');
  if (variables.includes('outgoingLinks') && ctx.outgoingLinks) {
    const count = ctx.outgoingLinks.split(',').length;
    tags.push(`${count} outlink${count !== 1 ? 's' : ''}`);
  }
  if (variables.includes('backlinks') && ctx.backlinks) tags.push('Has backlinks');
  if (variables.includes('currentFolder') && ctx.currentFolder) tags.push(ctx.currentFolder);
  if (variables.includes('documentTags') && ctx.documentTags) {
    ctx.documentTags.split(',').slice(0, 2).forEach((t) => tags.push(t.trim()));
  }
  if (variables.includes('recentDocuments')) tags.push('Recent activity');
  return tags;
}

/**
 * Filter patterns by conditions, fill variables, and sort by usage.
 * Returns up to `limit` suggestions (default 6).
 */
export function matchPatterns(
  patterns: StoredPattern[],
  ctx: VaultContext,
  limit = 6,
): MatchedSuggestion[] {
  const results: MatchedSuggestion[] = [];

  for (const pattern of patterns) {
    if (pattern.deprecated) continue;

    const conditions: MatchCondition = JSON.parse(pattern.conditions);
    if (!evaluateConditions(conditions, ctx)) continue;

    const variables: string[] = JSON.parse(pattern.variables);

    // Fill template
    let filled = pattern.template;
    let hasMissing = false;
    for (const varName of variables) {
      const value = ctx[varName as keyof VaultContext];
      if (value === null || value === undefined) {
        hasMissing = true;
        break;
      }
      filled = filled.replace(`{${varName}}`, String(value));
    }
    if (hasMissing) continue; // Skip patterns with unresolvable variables

    results.push({
      patternId: pattern.id,
      filledTemplate: filled,
      variables,
      source: pattern.source,
      confidence: pattern.confidence,
      usageCount: pattern.usage_count,
      contextType: inferContextType(variables),
      contextTags: buildContextTags(variables, ctx),
    });
  }

  // Sort: usage_count DESC, then last_used_at DESC (via original array order which is pre-sorted)
  results.sort((a, b) => b.usageCount - a.usageCount);

  return results.slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/pattern-matcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/context/PatternMatcher.ts test/pattern-matcher.test.ts
git commit -m "feat(query-pattern): add PatternMatcher with condition evaluation and variable filling"
```

---

### Task 5: Seed Patterns + Initialization

**Files:**
- Create: `src/service/context/seed-patterns.ts`
- Test: `test/seed-patterns.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/seed-patterns.test.ts
import { SEED_PATTERNS, buildSeedRecords } from '../src/service/context/seed-patterns';

function main() {
  // Test 1: seed patterns are well-formed
  console.assert(SEED_PATTERNS.length >= 5, 'Should have at least 5 seed patterns');
  for (const sp of SEED_PATTERNS) {
    console.assert(sp.template.includes('{'), `Template should have variables: ${sp.template}`);
    console.assert(sp.variables.length > 0, 'Should have at least 1 variable');
    // Every variable in template should be in the variables array
    for (const v of sp.variables) {
      console.assert(sp.template.includes(`{${v}}`), `Template missing variable {${v}}`);
    }
  }
  console.log('✅ SEED_PATTERNS: all well-formed');

  // Test 2: buildSeedRecords creates DB-ready records
  const records = buildSeedRecords();
  console.assert(records.length === SEED_PATTERNS.length);
  for (const r of records) {
    console.assert(r.source === 'default', 'Seed source should be default');
    console.assert(r.confidence === 1.0, 'Seed confidence should be 1.0');
    console.assert(r.deprecated === 0, 'Seed should not be deprecated');
    console.assert(typeof r.id === 'string' && r.id.startsWith('seed-'), `ID should start with seed-: ${r.id}`);
  }
  console.log('✅ buildSeedRecords: correct shape');

  console.log('All seed-patterns tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/seed-patterns.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement seed patterns**

```typescript
// src/service/context/seed-patterns.ts
import type { MatchCondition } from '@/core/schemas/agents/pattern-discovery-schemas';

interface SeedPattern {
  template: string;
  variables: string[];
  conditions: MatchCondition;
}

export const SEED_PATTERNS: SeedPattern[] = [
  {
    template: 'Summarize core insights about {documentKeywords} in my vault',
    variables: ['documentKeywords'],
    conditions: { hasActiveDocument: true },
  },
  {
    template: 'What connections exist between {recentDocuments}?',
    variables: ['recentDocuments'],
    conditions: { always: true },
  },
  {
    template: 'Overview and knowledge structure of the {currentFolder} folder',
    variables: ['currentFolder'],
    conditions: { hasActiveDocument: true },
  },
  {
    template: 'Analyze the relationship network of {activeDocumentTitle} and {outgoingLinks}',
    variables: ['activeDocumentTitle', 'outgoingLinks'],
    conditions: { hasOutgoingLinks: true },
  },
  {
    template: 'Which notes reference {activeDocumentTitle}? What themes do they share?',
    variables: ['activeDocumentTitle'],
    conditions: { hasBacklinks: true },
  },
  {
    template: 'Deep analysis of {activeDocumentTitle} with improvement suggestions',
    variables: ['activeDocumentTitle'],
    conditions: { hasActiveDocument: true },
  },
  {
    template: 'Find related notes by {documentTags} tags and compare perspectives',
    variables: ['documentTags'],
    conditions: { hasActiveDocument: true, tagMatch: [] },
  },
];

/**
 * Build DB-ready records from seed patterns.
 * IDs are deterministic so re-running seed insertion is idempotent.
 */
export function buildSeedRecords() {
  const now = Date.now();
  return SEED_PATTERNS.map((sp, i) => ({
    id: `seed-${i}`,
    template: sp.template,
    variables: JSON.stringify(sp.variables),
    conditions: JSON.stringify(sp.conditions),
    source: 'default' as const,
    confidence: 1.0,
    usage_count: 0,
    discovered_at: now,
    last_used_at: null,
    deprecated: 0,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/seed-patterns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/context/seed-patterns.ts test/seed-patterns.test.ts
git commit -m "feat(query-pattern): add seed patterns with deterministic IDs"
```

---

### Task 6: PatternDiscoveryAgent + Prompt Template

**Files:**
- Create: `src/service/agents/PatternDiscoveryAgent.ts`
- Create: `templates/prompts/pattern-discovery.md`
- Modify: `src/service/prompt/PromptId.ts:33` (add enum member)
- Modify: `src/core/template/TemplateRegistry.ts:124` (register template)

- [ ] **Step 1: Create the prompt template**

```markdown
<!-- templates/prompts/pattern-discovery.md -->
You are a pattern discovery agent for a knowledge management tool. Your job is to analyze recent user search queries and discover reusable query templates.

## Input

You receive:
1. **New queries** — recent search queries with usage counts
2. **Existing patterns** — templates already discovered (avoid duplicates)
3. **Vault structure** — folders, common tags, and properties in the user's vault
4. **Available variables** — context variables you can use in templates: {{availableVariables}}
5. **Available conditions** — conditions to control when patterns appear: {{availableConditions}}

## Rules

1. **Generalize** — Extract the common intent from queries and create a template with `{variableName}` placeholders.
2. **Context-aware conditions** — Each pattern must have conditions that ensure the template will produce a useful, complete query (no empty placeholders).
3. **No duplicates** — If a new pattern is similar to an existing one, suggest deprecating the old one and provide an improved version.
4. **Confidence** — Rate your confidence (0-1) based on how many queries support this pattern. Single-query patterns get ≤ 0.5.
5. **Quality over quantity** — Only output patterns you're confident will be useful. 1-3 patterns per run is ideal.

## Output

Return a JSON object with:
- `newPatterns`: array of discovered patterns (template, variables, conditions, confidence, reasoning)
- `deprecateIds`: array of existing pattern IDs that should be deprecated (superseded by new patterns)

## Queries to Analyze

{{queriesJson}}

## Existing Patterns

{{existingPatternsJson}}

## Vault Structure

{{vaultStructureJson}}
```

- [ ] **Step 2: Register PromptId**

In `src/service/prompt/PromptId.ts`, add after `HubSemanticMerge` (around line 73):

```typescript
  /** Pattern discovery agent: analyze query history → new query templates. */
  PatternDiscovery = 'pattern-discovery',
```

- [ ] **Step 3: Register template in TemplateRegistry**

In `src/core/template/TemplateRegistry.ts`, add to `TEMPLATE_METADATA` (after existing prompt entries):

```typescript
  'pattern-discovery': meta('prompts', 'pattern-discovery'),
```

- [ ] **Step 4: Implement PatternDiscoveryAgent**

```typescript
// src/service/agents/PatternDiscoveryAgent.ts
import { AppContext } from '@/app/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import {
  PatternDiscoveryOutputSchema,
  CONTEXT_VARIABLE_NAMES,
  CONDITION_NAMES,
  type PatternDiscoveryOutput,
} from '@/core/schemas/agents/pattern-discovery-schemas';

interface PatternDiscoveryInput {
  newQueries: Array<{ query: string; count: number; lastUsedAt: number }>;
  existingPatterns: Array<{ id: string; template: string; variables: string[]; conditions: object }>;
  vaultStructure: { folders: string[]; commonTags: string[]; commonProperties: string[] };
}

let isRunning = false;

/**
 * Run the pattern discovery agent. Non-blocking, skips if already running.
 * Returns the parsed output or null if skipped/failed.
 */
export async function runPatternDiscovery(input: PatternDiscoveryInput): Promise<PatternDiscoveryOutput | null> {
  if (isRunning) return null;
  isRunning = true;

  try {
    const ctx = AppContext.getInstance();
    const promptService = ctx.aiServiceManager.getPromptService();

    const prompt = await promptService.render(PromptId.PatternDiscovery, {
      availableVariables: CONTEXT_VARIABLE_NAMES.join(', '),
      availableConditions: CONDITION_NAMES.join(', '),
      queriesJson: JSON.stringify(input.newQueries, null, 2),
      existingPatternsJson: JSON.stringify(input.existingPatterns, null, 2),
      vaultStructureJson: JSON.stringify(input.vaultStructure, null, 2),
    });

    const provider = ctx.aiServiceManager.getDefaultProvider();
    if (!provider) return null;

    const response = await provider.generateText({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
    });

    // Extract JSON from response
    const text = typeof response === 'string' ? response : (response as any).text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return PatternDiscoveryOutputSchema.parse(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error('[PatternDiscovery] Agent failed:', err);
    return null;
  } finally {
    isRunning = false;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add templates/prompts/pattern-discovery.md src/service/agents/PatternDiscoveryAgent.ts src/service/prompt/PromptId.ts src/core/template/TemplateRegistry.ts
git commit -m "feat(query-pattern): add PatternDiscoveryAgent + prompt template"
```

---

### Task 7: PatternMergeService + Trigger Mechanism

**Files:**
- Create: `src/service/PatternMergeService.ts`
- Test: `test/pattern-merge-service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/pattern-merge-service.test.ts
import { normalizeTemplate, isDuplicate } from '../src/service/PatternMergeService';

function main() {
  // Test 1: normalizeTemplate replaces variables with {}
  const t1 = normalizeTemplate('Analyze {activeDocumentTitle} in {currentFolder}');
  console.assert(t1 === 'Analyze {} in {}', `Got: ${t1}`);
  console.log('✅ normalizeTemplate');

  // Test 2: isDuplicate detects similar templates
  console.assert(isDuplicate(
    'Analyze {} in {}',
    'Analyze {} in {}',
  ) === true);
  console.assert(isDuplicate(
    'Analyze {} in {}',
    'Deep analysis of {} with suggestions',
  ) === false);
  console.log('✅ isDuplicate');

  console.log('All PatternMergeService tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/pattern-merge-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement PatternMergeService**

```typescript
// src/service/PatternMergeService.ts
import type { PatternDiscoveryOutput } from '@/core/schemas/agents/pattern-discovery-schemas';
import type { QueryPatternRepo } from '@/core/storage/sqlite/repositories/QueryPatternRepo';

/**
 * Normalize a template by replacing all {variableName} placeholders with {}.
 */
export function normalizeTemplate(template: string): string {
  return template.replace(/\{[^}]+\}/g, '{}');
}

/**
 * Check if two normalized templates are duplicates (exact match after normalization).
 */
export function isDuplicate(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function generateId(): string {
  return `disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Process the agent's output: dedup, insert new patterns, deprecate old ones.
 */
export async function mergeDiscoveredPatterns(
  repo: QueryPatternRepo,
  output: PatternDiscoveryOutput,
): Promise<{ inserted: number; deprecated: number }> {
  const existingPatterns = await repo.listAll();
  const existingNormalized = existingPatterns.map((p) => ({
    id: p.id,
    normalized: normalizeTemplate(p.template),
  }));

  let inserted = 0;
  let deprecated = 0;

  // 1. Process new patterns (dedup against existing)
  for (const newPattern of output.newPatterns) {
    const newNorm = normalizeTemplate(newPattern.template);
    const dup = existingNormalized.find((e) => isDuplicate(e.normalized, newNorm));

    if (dup) {
      // Variant of existing pattern — skip (don't insert duplicate)
      continue;
    }

    await repo.insert({
      id: generateId(),
      template: newPattern.template,
      variables: JSON.stringify(newPattern.variables),
      conditions: JSON.stringify(newPattern.conditions),
      source: 'discovered',
      confidence: newPattern.confidence,
      usage_count: 0,
      discovered_at: Date.now(),
      last_used_at: null,
      deprecated: 0,
    });
    inserted++;
  }

  // 2. Deprecate agent-suggested patterns
  for (const id of output.deprecateIds) {
    await repo.deprecate(id);
    deprecated++;
  }

  // 3. Auto-deprecate stale discovered patterns (30 days, 0 usage)
  await repo.deprecateStale(30);

  return { inserted, deprecated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/pattern-merge-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/PatternMergeService.ts test/pattern-merge-service.test.ts
git commit -m "feat(query-pattern): add PatternMergeService with dedup and auto-deprecation"
```

---

### Task 8: Trigger Wiring + Plugin Initialization

**Files:**
- Create: `src/service/context/PatternDiscoveryTrigger.ts`
- Modify: `src/main.ts` (wire seed insertion + trigger)

- [ ] **Step 1: Implement PatternDiscoveryTrigger**

```typescript
// src/service/context/PatternDiscoveryTrigger.ts
import { AppContext } from '@/app/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { buildSeedRecords } from './seed-patterns';
import { runPatternDiscovery } from '@/service/agents/PatternDiscoveryAgent';
import { mergeDiscoveredPatterns } from '@/service/PatternMergeService';
import { CONTEXT_VARIABLE_NAMES, CONDITION_NAMES } from '@/core/schemas/agents/pattern-discovery-schemas';

const DISCOVERY_THRESHOLD = 20;
let queryCounter = 0;
let lastDiscoveryTs = 0;

/**
 * Initialize pattern system on plugin load:
 * 1. Seed patterns if table is empty
 * 2. Check if enough new queries to trigger discovery
 */
export async function initPatternSystem(): Promise<void> {
  if (!sqliteStoreManager.isInitialized()) return;

  const repo = sqliteStoreManager.getQueryPatternRepo();
  if (!repo) return;

  // Seed if empty
  if (await repo.isEmpty()) {
    const seeds = buildSeedRecords();
    for (const seed of seeds) {
      await repo.insert(seed);
    }
  }

  // Check for pending discovery
  const analysisRepo = sqliteStoreManager.getAIAnalysisRepo();
  if (!analysisRepo) return;

  const totalAnalyses = await analysisRepo.count();
  if (totalAnalyses >= DISCOVERY_THRESHOLD && lastDiscoveryTs === 0) {
    triggerDiscovery().catch(() => {});
  }
}

/**
 * Call after each AI analysis completes to track the counter.
 */
export function onAnalysisComplete(): void {
  queryCounter++;
  if (queryCounter >= DISCOVERY_THRESHOLD) {
    queryCounter = 0;
    triggerDiscovery().catch(() => {});
  }
}

async function triggerDiscovery(): Promise<void> {
  if (!sqliteStoreManager.isInitialized()) return;

  const repo = sqliteStoreManager.getQueryPatternRepo();
  const analysisRepo = sqliteStoreManager.getAIAnalysisRepo();
  if (!repo || !analysisRepo) return;

  try {
    // Gather inputs
    const frequentQueries = await analysisRepo.frequentQueries(50);
    const existingPatterns = await repo.listAll();
    const existingForAgent = existingPatterns
      .filter((p) => !p.deprecated)
      .map((p) => ({
        id: p.id,
        template: p.template,
        variables: JSON.parse(p.variables),
        conditions: JSON.parse(p.conditions),
      }));

    // Vault structure from node repo
    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
    const folders = await nodeRepo.listTopFoldersForSearchOrient(30);
    const vaultStructure = {
      folders: folders.map((f: any) => f.label ?? f.path ?? ''),
      commonTags: [], // Could be enriched from tag nodes
      commonProperties: [],
    };

    const output = await runPatternDiscovery({
      newQueries: frequentQueries.map((fq) => ({
        query: fq.query,
        count: fq.count,
        lastUsedAt: Date.now(),
      })),
      existingPatterns: existingForAgent,
      vaultStructure,
    });

    if (output) {
      await mergeDiscoveredPatterns(repo, output);
    }

    lastDiscoveryTs = Date.now();
  } catch (err) {
    console.error('[PatternDiscovery] Trigger failed:', err);
  }
}
```

- [ ] **Step 2: Wire into main.ts**

Find the plugin `onload()` method in `src/main.ts`. After SQLite initialization and SearchService setup, add:

```typescript
import { initPatternSystem } from '@/service/context/PatternDiscoveryTrigger';

// After: await this.searchService.initialize(); (or equivalent)
initPatternSystem().catch((e) => console.error('[PatternDiscovery] Init failed:', e));
```

- [ ] **Step 3: Wire onAnalysisComplete into search session flow**

Find the AI analysis completion handler (where `ai_analysis_record` is inserted) and add:

```typescript
import { onAnalysisComplete } from '@/service/context/PatternDiscoveryTrigger';

// After: aiAnalysisHistoryService.insertOrIgnore(...)
onAnalysisComplete();
```

- [ ] **Step 4: Commit**

```bash
git add src/service/context/PatternDiscoveryTrigger.ts src/main.ts
git commit -m "feat(query-pattern): wire pattern system init + discovery trigger"
```

---

### Task 9: SuggestionGrid UI Component

**Files:**
- Create: `src/ui/view/quick-search/components/SuggestionGrid.tsx`

- [ ] **Step 1: Implement SuggestionGrid**

```tsx
// src/ui/view/quick-search/components/SuggestionGrid.tsx
import React from 'react';
import { FileText, Link, FolderOpen, Tag, ArrowLeft, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { MatchedSuggestion } from '@/service/context/PatternMatcher';

const CONTEXT_ICONS: Record<MatchedSuggestion['contextType'], React.ElementType> = {
  activeDoc: FileText,
  outlinks: Link,
  folder: FolderOpen,
  tags: Tag,
  backlinks: ArrowLeft,
  recent: Clock,
  general: Sparkles,
};

interface SuggestionCardProps {
  suggestion: MatchedSuggestion;
  onClick: (suggestion: MatchedSuggestion) => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onClick }) => {
  const Icon = CONTEXT_ICONS[suggestion.contextType];
  return (
    <div
      onClick={() => onClick(suggestion)}
      className={cn(
        'pktw-flex pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-[#e5e7eb]',
        'pktw-cursor-pointer pktw-transition-all',
        'hover:pktw-border-[#7c3aed]/40 hover:pktw-bg-[#faf5ff]',
        'pktw-min-h-[72px]',
      )}
    >
      <div className="pktw-flex-shrink-0 pktw-w-7 pktw-h-7 pktw-rounded-md pktw-bg-[#f5f3ff] pktw-flex pktw-items-center pktw-justify-center">
        <Icon className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
      </div>
      <div className="pktw-flex-1 pktw-min-w-0">
        <span className="pktw-text-sm pktw-text-[#374151] pktw-line-clamp-2 pktw-leading-snug">
          {suggestion.filledTemplate}
        </span>
        {suggestion.contextTags.length > 0 && (
          <div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-mt-1.5">
            {suggestion.contextTags.map((tag, i) => (
              <span
                key={i}
                className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-[#f3f4f6] pktw-text-[#6b7280]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface SuggestionGridProps {
  suggestions: MatchedSuggestion[];
  onSelect: (suggestion: MatchedSuggestion) => void;
}

export const SuggestionGrid: React.FC<SuggestionGridProps> = ({ suggestions, onSelect }) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="pktw-px-3 pktw-py-2">
      <span className="pktw-text-[10px] pktw-text-[--text-faint] pktw-uppercase pktw-tracking-wide">
        Suggested for you
      </span>
      <div className="pktw-grid pktw-grid-cols-2 pktw-gap-2 pktw-mt-1.5">
        {suggestions.map((s) => (
          <SuggestionCard key={s.patternId} suggestion={s} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/quick-search/components/SuggestionGrid.tsx
git commit -m "feat(query-pattern): add SuggestionGrid 2-column card component"
```

---

### Task 10: ActiveSessionsList Extraction

**Files:**
- Create: `src/ui/view/quick-search/components/ActiveSessionsList.tsx`
- Modify: `src/ui/view/quick-search/components/ai-analysis-sections/RecentAIAnalysis.tsx:36-76` (extract `ActiveSessionCard`)

- [ ] **Step 1: Extract ActiveSessionCard and ActiveSessionsList**

```tsx
// src/ui/view/quick-search/components/ActiveSessionsList.tsx
import React, { useSyncExternalStore } from 'react';
import { Loader2, CheckCircle, AlertCircle, Clock, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { BackgroundSessionManager, type BackgroundSession, type BackgroundSessionStatus } from '@/service/BackgroundSessionManager';
import { formatDuration } from '@/core/utils/format-utils';

const STATUS_CONFIG: Record<BackgroundSessionStatus, { icon: React.ElementType; label: string; color: string }> = {
  streaming: { icon: Loader2, label: 'Streaming', color: 'pktw-text-[#7c3aed]' },
  'plan-ready': { icon: CheckCircle, label: 'Plan ready', color: 'pktw-text-blue-500' },
  queued: { icon: Clock, label: 'Queued', color: 'pktw-text-gray-400' },
  completed: { icon: CheckCircle, label: 'Completed', color: 'pktw-text-green-500' },
  error: { icon: AlertCircle, label: 'Error', color: 'pktw-text-red-500' },
};

const ActiveSessionCard: React.FC<{ session: BackgroundSession; onRestore: (id: string) => void }> = ({ session, onRestore }) => {
  const config = STATUS_CONFIG[session.status];
  const Icon = config.icon;
  const elapsed = Date.now() - session.createdAt;

  return (
    <div
      onClick={() => onRestore(session.id)}
      className={cn(
        'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2.5 pktw-rounded-lg',
        'pktw-bg-[#faf5ff]/50 pktw-border pktw-border-[#e5e7eb]',
        'pktw-cursor-pointer hover:pktw-bg-[#faf5ff] pktw-transition-colors',
        'pktw-group',
      )}
    >
      <Icon className={cn('pktw-w-4 pktw-h-4 pktw-flex-shrink-0', config.color, session.status === 'streaming' && 'pktw-animate-spin')} />
      <div className="pktw-flex-1 pktw-min-w-0">
        <span className="pktw-text-sm pktw-text-[#374151] pktw-truncate pktw-block">
          {session.title ?? session.query}
        </span>
        <span className="pktw-text-[11px] pktw-text-[#9ca3af]">
          {formatDuration(elapsed)} · {config.label}
        </span>
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="pktw-shadow-none pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity !pktw-w-5 !pktw-h-5"
        onClick={(e) => {
          e.stopPropagation();
          BackgroundSessionManager.getInstance().cancel(session.id);
        }}
      >
        <X className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af]" />
      </Button>
    </div>
  );
};

interface ActiveSessionsListProps {
  onRestore: (sessionId: string) => void;
}

export const ActiveSessionsList: React.FC<ActiveSessionsListProps> = ({ onRestore }) => {
  const sessions = useSyncExternalStore(
    (cb) => BackgroundSessionManager.getInstance().subscribe(cb),
    () => BackgroundSessionManager.getInstance().getSessions(),
  );

  const activeSessions = sessions.filter((s) => s.status !== 'completed');
  if (activeSessions.length === 0) return null;

  return (
    <div className="pktw-px-3 pktw-py-2">
      <span className="pktw-text-[10px] pktw-text-[--text-faint] pktw-uppercase pktw-tracking-wide">
        Active
      </span>
      <div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-mt-1.5">
        {activeSessions.map((s) => (
          <ActiveSessionCard key={s.id} session={s} onRestore={onRestore} />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Update RecentAIAnalysis to import from new file**

In `src/ui/view/quick-search/components/ai-analysis-sections/RecentAIAnalysis.tsx`, the active session rendering (lines 274-290) should now delegate to the new `ActiveSessionsList` or remain as-is (both share the same BackgroundSessionManager). The key change is that the SearchModal idle state will use `ActiveSessionsList` from the new file instead of rendering sessions inside `RecentAIAnalysis`.

No code changes needed in RecentAIAnalysis.tsx at this point — it continues to work for the analysis-in-progress view. The new `ActiveSessionsList` is a parallel component for the landing page.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/ActiveSessionsList.tsx
git commit -m "feat(query-pattern): extract ActiveSessionsList from RecentAIAnalysis"
```

---

### Task 11: RecentAnalysisList (Compact History)

**Files:**
- Create: `src/ui/view/quick-search/components/RecentAnalysisList.tsx`

- [ ] **Step 1: Implement RecentAnalysisList**

```tsx
// src/ui/view/quick-search/components/RecentAnalysisList.tsx
import React, { useEffect, useState } from 'react';
import { Brain, Network, Clock } from 'lucide-react';
import { AppContext } from '@/app/AppContext';
import { humanReadableTime } from '@/core/utils/format-utils';

interface AnalysisRecord {
  id: string;
  query: string | null;
  title: string | null;
  created_at_ts: number;
  analysis_preset: string | null;
  sources_count: number | null;
  topics_count: number | null;
}

interface RecentAnalysisListProps {
  onSelectQuery: (query: string) => void;
  limit?: number;
}

export const RecentAnalysisList: React.FC<RecentAnalysisListProps> = ({ onSelectQuery, limit = 8 }) => {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const svc = AppContext.getInstance().aiAnalysisHistoryService;
    Promise.all([
      svc.list({ limit, offset: 0 }),
      svc.count(),
    ]).then(([recs, cnt]) => {
      setRecords(recs as AnalysisRecord[]);
      setTotalCount(cnt);
    }).catch(() => {});
  }, [limit]);

  if (records.length === 0) return null;

  return (
    <div className="pktw-px-3 pktw-py-2">
      <span className="pktw-text-[10px] pktw-text-[--text-faint] pktw-uppercase pktw-tracking-wide">
        Recent
      </span>
      <div className="pktw-flex pktw-flex-col pktw-mt-1.5">
        {records.map((r) => {
          const Icon = r.analysis_preset === 'aiGraph' ? Network : Brain;
          const displayText = r.title ?? r.query ?? 'Untitled analysis';
          return (
            <div
              key={r.id}
              onClick={() => r.query && onSelectQuery(r.query)}
              className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-2 pktw-py-2 pktw-rounded-md pktw-cursor-pointer hover:pktw-bg-[#f5f3ff] pktw-transition-colors pktw-group"
            >
              <Icon className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af] pktw-flex-shrink-0" />
              <span className="pktw-flex-1 pktw-text-sm pktw-text-[#374151] pktw-truncate">
                {displayText}
              </span>
              <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-shrink-0">
                {r.sources_count != null && (
                  <span className="pktw-text-[10px] pktw-text-[#9ca3af]">
                    {r.sources_count} sources
                  </span>
                )}
                <span className="pktw-text-[10px] pktw-text-[#9ca3af]">
                  {humanReadableTime(r.created_at_ts)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {totalCount > limit && (
        <div className="pktw-px-2 pktw-pt-1">
          <span className="pktw-text-xs pktw-text-[#7c3aed] pktw-cursor-pointer hover:pktw-underline">
            View all {totalCount} analyses →
          </span>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/quick-search/components/RecentAnalysisList.tsx
git commit -m "feat(query-pattern): add compact RecentAnalysisList component"
```

---

### Task 12: SearchModal AI Tab Overhaul

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:130-351` (AITabContent)
- Modify: `src/ui/view/quick-search/components/ai-analysis-state/AIAnalysisPreStreamingState.tsx:18-43` (remove idle state)
- Delete: `templates/config/default-analysis-queries.json`

This is the largest task. It replaces the RECENT chips (L282-308), default query buttons (L309-346), and hover-card preset switcher (L168-199) with the new landing page components.

- [ ] **Step 1: Remove frequentQueries and defaultQueries state from AITabContent**

In `SearchModal.tsx`, remove lines 143-154 (the `frequentQueries` state + effect and the `defaultQueries` useMemo):

```typescript
// REMOVE these lines:
const [frequentQueries, setFrequentQueries] = useState<...>([]);
useEffect(() => { ... frequentQueries(5) ... }, []);
const defaultQueries = useMemo<...>(() => { ... default-analysis-queries.json ... }, []);
```

- [ ] **Step 2: Add suggestion loading state**

Replace the removed code with:

```typescript
import { ContextProvider } from '@/service/context/ContextProvider';
import { matchPatterns, type MatchedSuggestion } from '@/service/context/PatternMatcher';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

// Inside AITabContent, replace frequentQueries/defaultQueries with:
const [suggestions, setSuggestions] = useState<MatchedSuggestion[]>([]);
useEffect(() => {
  (async () => {
    try {
      const repo = sqliteStoreManager.getQueryPatternRepo();
      if (!repo) return;
      const patterns = await repo.listActive();
      const ctxProvider = new ContextProvider(AppContext.getInstance().app);
      const ctx = ctxProvider.collect();
      setSuggestions(matchPatterns(patterns, ctx, 6));
    } catch { setSuggestions([]); }
  })();
}, []);
```

- [ ] **Step 3: Replace hover-card preset switcher (L168-199) with mode pills**

Replace the `<HoverCard>` block (L168-199) with inline mode pills:

```tsx
{/* Mode pills — replaces HoverCard preset switcher */}
<div className="pktw-absolute pktw-left-4 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10 pktw-flex pktw-gap-1">
  {PRESETS.map((p) => {
    const Icon = p === 'aiGraph' ? Network : Brain;
    return (
      <Button
        key={p}
        variant="ghost"
        size="xs"
        style={{ cursor: 'pointer' }}
        onClick={() => setAnalysisMode(p)}
        className={cn(
          'pktw-shadow-none !pktw-h-6 pktw-px-2 pktw-rounded-full pktw-text-[11px] pktw-font-medium pktw-transition-all',
          analysisMode === p
            ? 'pktw-bg-[#7c3aed] pktw-text-white'
            : 'pktw-bg-white pktw-text-[#6b7280] pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/40 hover:pktw-text-[#7c3aed]'
        )}
      >
        <Icon className="pktw-w-3 pktw-h-3 pktw-mr-1" />
        {PRESET_LABELS[p].short}
      </Button>
    );
  })}
</div>
```

- [ ] **Step 4: Replace RECENT chips (L282-308) and default query buttons (L309-346) with landing page**

Replace the two conditional blocks with:

```tsx
{!searchQuery && sessionStatus === 'idle' && (
  <div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
    <SuggestionGrid
      suggestions={suggestions}
      onSelect={(s) => {
        useSharedStore.getState().setSearchQuery(s.filledTemplate);
        useSearchSessionStore.getState().resetAll();
        resetAIAnalysisAll();
        useSearchSessionStore.getState().incrementTriggerAnalysis();
        // Increment usage count
        sqliteStoreManager.getQueryPatternRepo()?.incrementUsageRaw(s.patternId).catch(() => {});
      }}
    />
    <ActiveSessionsList
      onRestore={(sessionId) => {
        BackgroundSessionManager.pendingRestore = sessionId;
        // Modal re-mount will handle restore
      }}
    />
    <RecentAnalysisList
      onSelectQuery={(query) => {
        useSharedStore.getState().setSearchQuery(query);
        useSearchSessionStore.getState().resetAll();
        resetAIAnalysisAll();
        useSearchSessionStore.getState().incrementTriggerAnalysis();
      }}
    />
    {suggestions.length === 0 && (
      <div className="pktw-px-4 pktw-py-8 pktw-text-center pktw-text-sm pktw-text-[#9ca3af]">
        No analyses yet. Type a question above or click a suggestion to get started.
      </div>
    )}
  </div>
)}
```

Add the necessary imports at the top of the file:

```typescript
import { SuggestionGrid } from './components/SuggestionGrid';
import { ActiveSessionsList } from './components/ActiveSessionsList';
import { RecentAnalysisList } from './components/RecentAnalysisList';
```

- [ ] **Step 5: Add footer at modal level**

Inside `AITabContent`, after the scrollable content `<div>` and before the closing `</>`, add a footer:

```tsx
{sessionStatus === 'idle' && (
  <div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between">
    <div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
      <KeyboardShortcut keys="↑↓" description="Navigate" />
      <KeyboardShortcut keys="↵" description="Run" />
      <KeyboardShortcut keys="⌥↑⌥↓" description="Switch mode" />
    </div>
    <span className="pktw-text-xs pktw-text-[#7c3aed]">
      {totalAnalysisCount} analyses
    </span>
  </div>
)}
```

Add `totalAnalysisCount` state:

```typescript
const [totalAnalysisCount, setTotalAnalysisCount] = useState(0);
useEffect(() => {
  AppContext.getInstance().aiAnalysisHistoryService.count().then(setTotalAnalysisCount).catch(() => {});
}, []);
```

- [ ] **Step 6: Remove idle state from AIAnalysisPreStreamingState**

In `src/ui/view/quick-search/components/ai-analysis-state/AIAnalysisPreStreamingState.tsx`, the idle rendering ("Ready to Analyze with AI" at lines 18-43) should only show during analysis, not idle. Change the condition at line 24:

```tsx
// Change: {checkIfAnalyzing() || isSummaryStreaming ? 'Analyzing...' : 'Ready to Analyze with AI'}
// To: always show 'Analyzing...' since idle state is now handled by the landing page
{checkIfAnalyzing() || isSummaryStreaming ? 'Analyzing...' : null}
```

Or better — guard the entire component to only render when analyzing:

```tsx
if (!checkIfAnalyzing() && !isSummaryStreaming) return null;
```

- [ ] **Step 7: Delete default-analysis-queries.json**

```bash
rm templates/config/default-analysis-queries.json
```

- [ ] **Step 8: Remove lastQuery state (L156-161)**

Remove the `lastQuery` state and its effect since the "Re-analyze last" button is removed:

```typescript
// REMOVE:
const [lastQuery, setLastQuery] = useState<string | null>(null);
useEffect(() => {
  AppContext.getInstance().aiAnalysisHistoryService.list({ limit: 1, offset: 0 }).then(...)...
}, []);
```

- [ ] **Step 9: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx src/ui/view/quick-search/components/ai-analysis-state/AIAnalysisPreStreamingState.tsx
git rm templates/config/default-analysis-queries.json
git commit -m "feat(query-pattern): overhaul AI Analysis landing page with suggestion cards, active sessions, and recent history"
```

---

### Task 13: Wire QueryPatternRepo into SqliteStoreManager

**Files:**
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts` (add repo accessor)

- [ ] **Step 1: Add QueryPatternRepo to SqliteStoreManager**

Find `SqliteStoreManager` class and add:

```typescript
import { QueryPatternRepo } from './repositories/QueryPatternRepo';

// Inside class, add field:
private queryPatternRepo: QueryPatternRepo | null = null;

// Add accessor method:
getQueryPatternRepo(): QueryPatternRepo | null {
  if (!this.chatDb) return null;
  if (!this.queryPatternRepo) {
    this.queryPatternRepo = new QueryPatternRepo(this.chatDb);
  }
  return this.queryPatternRepo;
}
```

Note: The `query_pattern` table lives in `vault.sqlite` (alongside `ai_analysis_record`). Check which DB handle is correct — if `ai_analysis_record` uses `this.chatDb`, use the same for `query_pattern`. Otherwise use `this.vaultDb`.

- [ ] **Step 2: Commit**

```bash
git add src/core/storage/sqlite/SqliteStoreManager.ts
git commit -m "feat(query-pattern): wire QueryPatternRepo into SqliteStoreManager"
```

---

### Task 14: Cleanup — Remove frequentQueries from AIAnalysisRepo

**Files:**
- Modify: `src/core/storage/sqlite/repositories/AIAnalysisRepo.ts:68-84` (remove `frequentQueries` or keep for trigger)
- Modify: `src/service/AIAnalysisHistoryService.ts` (update if needed)

- [ ] **Step 1: Evaluate whether to remove frequentQueries**

The `frequentQueries()` method in `AIAnalysisRepo.ts:68-84` is still needed by `PatternDiscoveryTrigger.ts` to gather input for the discovery agent. Keep it, but remove the direct call from `SearchModal.tsx` (already done in Task 12).

Verify that no other code calls `aiAnalysisHistoryService.frequentQueries()` besides the trigger:

```bash
grep -r "frequentQueries" src/ --include="*.ts" --include="*.tsx"
```

If only `PatternDiscoveryTrigger.ts` and `AIAnalysisRepo.ts` reference it, no cleanup needed.

- [ ] **Step 2: Commit (if any changes)**

```bash
git add -A && git commit -m "refactor(query-pattern): remove unused frequentQueries call from UI"
```

---

## Self-Review Checklist

1. **Spec coverage**: Every section of the spec is covered:
   - Data model (Task 1) ✓
   - Context variables (Task 3) ✓
   - Match conditions (Task 4) ✓
   - Pattern Discovery Agent (Task 6) ✓
   - Merge logic (Task 7) ✓
   - Trigger mechanism (Task 8) ✓
   - UI: Suggestion cards (Task 9), Active sessions (Task 10), Recent list (Task 11), Modal overhaul (Task 12) ✓
   - Seed patterns (Task 5) ✓
   - Lifecycle (handled by merge service + trigger) ✓
   - Removed elements (Task 12) ✓

2. **Placeholder scan**: No TBD/TODO placeholders. One intentional skip: `linkContext` field is set to `null` with comment explaining it requires file content reading — acceptable for v1.

3. **Type consistency**: `MatchedSuggestion.patternId` matches throughout. `fillVaultContext` params align with `ContextProvider.collect()`. Schema types used consistently via imports.
