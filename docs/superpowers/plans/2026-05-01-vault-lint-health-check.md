# Vault Lint / Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a vault health scoring engine with 5-dimension lint signals and a Vault X-Ray dashboard UI.

**Architecture:** Signal-based engine — each lint signal is a pure function `(tenant) => LintViolation[]`. A `LintScanService` orchestrator runs all signals, feeds results to `HealthScoreCalculator`, persists to SQLite, and exposes via Zustand store. The UI is an Obsidian leaf view with React components.

**Tech Stack:** SQLite (Kysely), Zustand, React 18, @xyflow/react (community map), Lucide React icons

**Spec:** `docs/superpowers/specs/2026-05-01-vault-lint-design.md`

---

## File Structure

```
src/service/lint/
├── types.ts                    # All lint types: LintDimension, LintSignalDef, LintViolation, LintScanResult
├── LintSignalRegistry.ts       # Signal registry + runner
├── signals/
│   ├── structural.ts           # hard_orphan, broken_link, missing_backlink
│   ├── content.ts              # empty_note, stub_note, oversized_note, duplicate_content
│   ├── temporal.ts             # decaying_hub, stale_content
│   ├── semantic.ts             # coverage_gap, semantic_isolation, redundant_hub
│   └── tags.ts                 # untagged_note, tag_island
├── HealthScoreCalculator.ts    # Dimension scoring + composite score
└── LintScanService.ts          # Orchestrator: run signals → score → persist

src/core/storage/sqlite/
├── ddl.ts                      # MODIFY: add vault_lint_scan + vault_lint_violation + vault_lint_dismissal
└── repositories/
    └── LintRepo.ts             # CRUD for lint tables

src/ui/
├── store/
│   └── vaultLintStore.ts       # Zustand store for lint UI state
└── view/
    └── vault-xray/
        ├── VaultXRayView.ts    # Obsidian ItemView subclass
        ├── VaultXRayRoot.tsx   # React root mount
        └── components/
            ├── ScoreCard.tsx           # Gauge + dimension pills + trend
            ├── ActionableItemsList.tsx  # Severity-sorted violation list
            ├── HubHealthSection.tsx     # Top hubs with staleness
            └── ViolationDetail.tsx      # Right-side drill-down panel

src/app/view/ViewManager.ts     # MODIFY: register VAULT_XRAY_VIEW_TYPE
src/app/commands/Register.ts    # MODIFY: add scan + open commands

test/
├── lint-health-score.test.ts   # HealthScoreCalculator unit tests
└── lint-signals.test.ts        # Signal logic unit tests
```

---

### Task 1: Lint Types + SQLite Schema + LintRepo

**Files:**
- Create: `src/service/lint/types.ts`
- Modify: `src/core/storage/sqlite/ddl.ts:307` (inside `migrateSqliteSchema`)
- Create: `src/core/storage/sqlite/repositories/LintRepo.ts`
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts:170-225` (add `lintRepo` getter)

- [ ] **Step 1: Create lint types**

Create `src/service/lint/types.ts`:

```typescript
export type LintDimension = 'structural' | 'content' | 'temporal' | 'semantic' | 'tags';
export type LintSeverity = 'error' | 'warning' | 'suggestion' | 'info';

export interface LintSignalDef {
  id: string;
  dimension: LintDimension;
  severity: LintSeverity;
  weight: number;          // Within-dimension weight for scoring (0-1)
  label: string;           // Human-readable label
  description: string;
}

export interface LintViolation {
  signalId: string;
  dimension: LintDimension;
  severity: LintSeverity;
  nodeId?: string;
  nodePath?: string;
  label?: string;
  details: Record<string, unknown>;
}

export interface LintDimensionScore {
  dimension: LintDimension;
  score: number;            // 0-100
  violationCount: number;
  eligibleCount: number;
}

export interface LintScanResult {
  scanId: number;
  timestamp: number;
  scanType: 'full' | 'incremental';
  durationMs: number;
  totalNotes: number;
  overallScore: number;
  dimensions: Record<LintDimension, LintDimensionScore>;
  violations: LintViolation[];
}

export const LINT_DIMENSIONS: LintDimension[] = ['structural', 'content', 'temporal', 'semantic', 'tags'];

export const DIMENSION_WEIGHTS: Record<LintDimension, number> = {
  structural: 0.30,
  content: 0.20,
  temporal: 0.15,
  semantic: 0.25,
  tags: 0.10,
};
```

- [ ] **Step 2: Add SQLite tables to ddl.ts**

In `src/core/storage/sqlite/ddl.ts`, add to the `Database` interface:

```typescript
vault_lint_scan: {
  id: number;
  timestamp: number;
  scan_type: string;
  duration_ms: number;
  total_notes: number;
  overall_score: number;
  structural_score: number;
  content_score: number;
  temporal_score: number;
  semantic_score: number;
  tag_score: number;
  total_violations: number;
};

vault_lint_violation: {
  id: number;
  scan_id: number;
  signal_id: string;
  dimension: string;
  severity: string;
  node_id: string | null;
  node_path: string | null;
  label: string | null;
  details: string;
  is_resolved: number;
  resolved_at: number | null;
};

vault_lint_dismissal: {
  signal_id: string;
  node_path: string;
  dismissed_at: number;
  reason: string | null;
  snooze_until: number | null;
};
```

Inside `migrateSqliteSchema()`, append:

```sql
CREATE TABLE IF NOT EXISTS vault_lint_scan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  scan_type TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  total_notes INTEGER NOT NULL,
  overall_score REAL NOT NULL,
  structural_score REAL NOT NULL,
  content_score REAL NOT NULL,
  temporal_score REAL NOT NULL,
  semantic_score REAL NOT NULL,
  tag_score REAL NOT NULL,
  total_violations INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_lint_violation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES vault_lint_scan(id),
  signal_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  severity TEXT NOT NULL,
  node_id TEXT,
  node_path TEXT,
  label TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  is_resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS vault_lint_dismissal (
  signal_id TEXT NOT NULL,
  node_path TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL,
  reason TEXT,
  snooze_until INTEGER,
  PRIMARY KEY (signal_id, node_path)
);
```

- [ ] **Step 3: Create LintRepo**

Create `src/core/storage/sqlite/repositories/LintRepo.ts`:

```typescript
import { Kysely } from 'kysely';

export class LintRepo {
  constructor(private readonly db: Kysely<any>) {}

  async insertScan(scan: {
    timestamp: number; scanType: string; durationMs: number;
    totalNotes: number; overallScore: number;
    structuralScore: number; contentScore: number;
    temporalScore: number; semanticScore: number; tagScore: number;
    totalViolations: number;
  }): Promise<number> {
    const result = await this.db.insertInto('vault_lint_scan').values({
      timestamp: scan.timestamp,
      scan_type: scan.scanType,
      duration_ms: scan.durationMs,
      total_notes: scan.totalNotes,
      overall_score: scan.overallScore,
      structural_score: scan.structuralScore,
      content_score: scan.contentScore,
      temporal_score: scan.temporalScore,
      semantic_score: scan.semanticScore,
      tag_score: scan.tagScore,
      total_violations: scan.totalViolations,
    }).executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  async insertViolations(scanId: number, violations: Array<{
    signalId: string; dimension: string; severity: string;
    nodeId?: string; nodePath?: string; label?: string;
    details: Record<string, unknown>;
  }>): Promise<void> {
    if (violations.length === 0) return;
    const rows = violations.map(v => ({
      scan_id: scanId,
      signal_id: v.signalId,
      dimension: v.dimension,
      severity: v.severity,
      node_id: v.nodeId ?? null,
      node_path: v.nodePath ?? null,
      label: v.label ?? null,
      details: JSON.stringify(v.details),
      is_resolved: 0,
      resolved_at: null,
    }));
    // Batch insert in chunks of 100
    for (let i = 0; i < rows.length; i += 100) {
      await this.db.insertInto('vault_lint_violation').values(rows.slice(i, i + 100)).execute();
    }
  }

  async getLatestScan(): Promise<any | undefined> {
    return this.db.selectFrom('vault_lint_scan')
      .selectAll()
      .orderBy('timestamp', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getViolationsForScan(scanId: number): Promise<any[]> {
    return this.db.selectFrom('vault_lint_violation')
      .selectAll()
      .where('scan_id', '=', scanId)
      .where('is_resolved', '=', 0)
      .execute();
  }

  async getRecentScans(limit: number): Promise<any[]> {
    return this.db.selectFrom('vault_lint_scan')
      .selectAll()
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .execute();
  }

  async getDismissals(): Promise<Map<string, Set<string>>> {
    const rows = await this.db.selectFrom('vault_lint_dismissal')
      .selectAll()
      .execute();
    const map = new Map<string, Set<string>>();
    const now = Date.now();
    for (const row of rows) {
      // Skip expired snoozes
      if (row.snooze_until && row.snooze_until < now) continue;
      if (!map.has(row.signal_id)) map.set(row.signal_id, new Set());
      map.get(row.signal_id)!.add(row.node_path);
    }
    return map;
  }

  async dismissViolation(signalId: string, nodePath: string, reason?: string, snoozeUntil?: number): Promise<void> {
    await this.db.insertInto('vault_lint_dismissal').values({
      signal_id: signalId,
      node_path: nodePath,
      dismissed_at: Date.now(),
      reason: reason ?? null,
      snooze_until: snoozeUntil ?? null,
    }).onConflict(oc => oc.columns(['signal_id', 'node_path']).doUpdateSet({
      dismissed_at: Date.now(),
      reason: reason ?? null,
      snooze_until: snoozeUntil ?? null,
    })).execute();
  }
}
```

- [ ] **Step 4: Wire LintRepo into SqliteStoreManager**

In `src/core/storage/sqlite/SqliteStoreManager.ts`, add:

```typescript
import { LintRepo } from './repositories/LintRepo';

// Add field
private _lintRepo: LintRepo | null = null;

// In init() or after DB open:
this._lintRepo = new LintRepo(this.vaultDb);

// Add getter:
get lintRepo(): LintRepo {
  if (!this._lintRepo) throw new Error('LintRepo not initialized');
  return this._lintRepo;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/service/lint/types.ts src/core/storage/sqlite/ddl.ts \
  src/core/storage/sqlite/repositories/LintRepo.ts src/core/storage/sqlite/SqliteStoreManager.ts
git commit -m "feat(lint): add lint types, SQLite schema, and LintRepo"
```

---

### Task 2: Signal Framework + Structural Signals

**Files:**
- Create: `src/service/lint/LintSignalRegistry.ts`
- Create: `src/service/lint/signals/structural.ts`
- Test: `test/lint-signals.test.ts`

- [ ] **Step 1: Create LintSignalRegistry**

Create `src/service/lint/LintSignalRegistry.ts`:

```typescript
import { LintSignalDef, LintViolation } from './types';

export type SignalComputeFn = () => Promise<LintViolation[]>;

interface RegisteredSignal {
  def: LintSignalDef;
  compute: SignalComputeFn;
}

export class LintSignalRegistry {
  private signals = new Map<string, RegisteredSignal>();

  register(def: LintSignalDef, compute: SignalComputeFn): void {
    this.signals.set(def.id, { def, compute });
  }

  getSignalDef(id: string): LintSignalDef | undefined {
    return this.signals.get(id)?.def;
  }

  getAllDefs(): LintSignalDef[] {
    return Array.from(this.signals.values()).map(s => s.def);
  }

  async runAll(): Promise<LintViolation[]> {
    const results: LintViolation[] = [];
    for (const [, signal] of this.signals) {
      const violations = await signal.compute();
      results.push(...violations);
    }
    return results;
  }

  async runDimension(dimension: string): Promise<LintViolation[]> {
    const results: LintViolation[] = [];
    for (const [, signal] of this.signals) {
      if (signal.def.dimension === dimension) {
        const violations = await signal.compute();
        results.push(...violations);
      }
    }
    return results;
  }
}
```

- [ ] **Step 2: Create structural signals**

Create `src/service/lint/signals/structural.ts`:

```typescript
import { LintSignalDef, LintViolation } from '../types';
import { LintSignalRegistry } from '../LintSignalRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { AppContext } from '@/app/context/AppContext';

const HARD_ORPHAN: LintSignalDef = {
  id: 'hard_orphan',
  dimension: 'structural',
  severity: 'warning',
  weight: 1.0,
  label: 'Orphan Notes',
  description: 'Notes with zero inbound or outbound links',
};

const BROKEN_LINK: LintSignalDef = {
  id: 'broken_link',
  dimension: 'structural',
  severity: 'error',
  weight: 1.0,
  label: 'Broken Links',
  description: 'Wikilinks pointing to non-existent notes',
};

const MISSING_BACKLINK: LintSignalDef = {
  id: 'missing_backlink',
  dimension: 'structural',
  severity: 'suggestion',
  weight: 0.5,
  label: 'Potential Links',
  description: 'Content mentions a note title but no wikilink exists',
};

async function detectHardOrphans(): Promise<LintViolation[]> {
  const mobiusEdgeRepo = sqliteStoreManager.vaultMobiusEdgeRepo;
  const mobiusNodeRepo = sqliteStoreManager.vaultMobiusNodeRepo;

  const orphanIds = await mobiusEdgeRepo.getHardOrphanNodeIds(500);
  if (orphanIds.length === 0) return [];

  const nodes = await mobiusNodeRepo.getByIds(orphanIds);
  const violations: LintViolation[] = [];

  for (const [id, node] of nodes) {
    violations.push({
      signalId: 'hard_orphan',
      dimension: 'structural',
      severity: 'warning',
      nodeId: id,
      nodePath: node.path ?? undefined,
      label: node.label ?? undefined,
      details: { orphanType: 'hard', edgeCount: 0 },
    });
  }
  return violations;
}

async function detectBrokenLinks(): Promise<LintViolation[]> {
  const app = AppContext.getApp();
  const vault = app.vault;
  const allFiles = new Set(vault.getFiles().map(f => f.path));
  const violations: LintViolation[] = [];

  const markdownFiles = vault.getMarkdownFiles();
  for (const file of markdownFiles) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache?.links) continue;

    for (const link of cache.links) {
      const resolvedFile = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (!resolvedFile) {
        violations.push({
          signalId: 'broken_link',
          dimension: 'structural',
          severity: 'error',
          nodePath: file.path,
          label: file.basename,
          details: {
            brokenTarget: link.link,
            position: { line: link.position.start.line, col: link.position.start.col },
          },
        });
      }
    }
  }
  return violations;
}

async function detectMissingBacklinks(): Promise<LintViolation[]> {
  const { getUnlinkedMentions } = await import('@/service/search/unlinkedMentionService');
  const app = AppContext.getApp();
  const violations: LintViolation[] = [];

  // Sample top files by PageRank to avoid scanning entire vault
  const mobiusNodeRepo = sqliteStoreManager.vaultMobiusNodeRepo;
  const topNodes = await mobiusNodeRepo.listNodeIdsByTypesKeyset(['note'], null, 200);
  const nodes = await mobiusNodeRepo.getByIds(topNodes);

  for (const [, node] of nodes) {
    if (!node.path) continue;
    try {
      const mentions = await getUnlinkedMentions(node.path, 5);
      for (const mention of mentions) {
        violations.push({
          signalId: 'missing_backlink',
          dimension: 'structural',
          severity: 'suggestion',
          nodePath: mention.sourcePath ?? node.path,
          label: node.label ?? undefined,
          details: {
            targetPath: node.path,
            targetTitle: node.label,
            sourcePath: mention.sourcePath,
          },
        });
      }
    } catch {
      // Skip files that can't be analyzed
    }
  }
  return violations;
}

export function registerStructuralSignals(registry: LintSignalRegistry): void {
  registry.register(HARD_ORPHAN, detectHardOrphans);
  registry.register(BROKEN_LINK, detectBrokenLinks);
  registry.register(MISSING_BACKLINK, detectMissingBacklinks);
}
```

- [ ] **Step 3: Write test for structural signal definitions**

Create `test/lint-signals.test.ts`:

```typescript
import { LintSignalRegistry } from '../src/service/lint/LintSignalRegistry';
import type { LintSignalDef, LintViolation } from '../src/service/lint/types';

// Test LintSignalRegistry
const registry = new LintSignalRegistry();

const testSignal: LintSignalDef = {
  id: 'test_signal',
  dimension: 'structural',
  severity: 'warning',
  weight: 1.0,
  label: 'Test Signal',
  description: 'A test signal',
};

const mockCompute = async (): Promise<LintViolation[]> => [
  {
    signalId: 'test_signal',
    dimension: 'structural',
    severity: 'warning',
    nodePath: 'test.md',
    details: { reason: 'test' },
  },
];

registry.register(testSignal, mockCompute);

// Test getDef
const def = registry.getSignalDef('test_signal');
console.assert(def !== undefined, 'FAIL: signal def should be registered');
console.assert(def!.id === 'test_signal', 'FAIL: signal id mismatch');
console.assert(def!.dimension === 'structural', 'FAIL: dimension mismatch');
console.log('PASS: LintSignalRegistry.getSignalDef');

// Test getAllDefs
const allDefs = registry.getAllDefs();
console.assert(allDefs.length === 1, 'FAIL: should have 1 signal');
console.log('PASS: LintSignalRegistry.getAllDefs');

// Test runAll
(async () => {
  const violations = await registry.runAll();
  console.assert(violations.length === 1, 'FAIL: should produce 1 violation');
  console.assert(violations[0].signalId === 'test_signal', 'FAIL: violation signalId mismatch');
  console.assert(violations[0].nodePath === 'test.md', 'FAIL: violation path mismatch');
  console.log('PASS: LintSignalRegistry.runAll');

  // Test runDimension
  const structuralViolations = await registry.runDimension('structural');
  console.assert(structuralViolations.length === 1, 'FAIL: should produce 1 structural violation');
  console.log('PASS: LintSignalRegistry.runDimension');

  const contentViolations = await registry.runDimension('content');
  console.assert(contentViolations.length === 0, 'FAIL: should produce 0 content violations');
  console.log('PASS: LintSignalRegistry.runDimension (empty)');

  // Test multiple signals
  const registry2 = new LintSignalRegistry();
  registry2.register(
    { ...testSignal, id: 'sig_a', dimension: 'structural' },
    async () => [{ signalId: 'sig_a', dimension: 'structural', severity: 'error', details: {} }]
  );
  registry2.register(
    { ...testSignal, id: 'sig_b', dimension: 'content' },
    async () => [
      { signalId: 'sig_b', dimension: 'content', severity: 'info', details: {} },
      { signalId: 'sig_b', dimension: 'content', severity: 'info', details: {} },
    ]
  );
  const all2 = await registry2.runAll();
  console.assert(all2.length === 3, 'FAIL: should produce 3 total violations');
  console.log('PASS: LintSignalRegistry multi-signal runAll');

  const contentOnly = await registry2.runDimension('content');
  console.assert(contentOnly.length === 2, 'FAIL: should produce 2 content violations');
  console.log('PASS: LintSignalRegistry multi-signal runDimension');

  console.log('=== All lint-signals tests passed ===');
})();
```

- [ ] **Step 4: Run test**

Run: `npm run test -- test/lint-signals.test.ts`
Expected: All assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/service/lint/LintSignalRegistry.ts src/service/lint/signals/structural.ts \
  test/lint-signals.test.ts
git commit -m "feat(lint): add signal registry and structural signal detectors"
```

---

### Task 3: Content + Temporal + Semantic + Tag Signals

**Files:**
- Create: `src/service/lint/signals/content.ts`
- Create: `src/service/lint/signals/temporal.ts`
- Create: `src/service/lint/signals/semantic.ts`
- Create: `src/service/lint/signals/tags.ts`

- [ ] **Step 1: Create content signals**

Create `src/service/lint/signals/content.ts`:

```typescript
import { LintSignalDef, LintViolation } from '../types';
import { LintSignalRegistry } from '../LintSignalRegistry';
import { AppContext } from '@/app/context/AppContext';

const EMPTY_NOTE: LintSignalDef = {
  id: 'empty_note', dimension: 'content', severity: 'warning', weight: 0.8,
  label: 'Empty Notes', description: 'Files with less than 50 characters of content',
};

const STUB_NOTE: LintSignalDef = {
  id: 'stub_note', dimension: 'content', severity: 'info', weight: 0.3,
  label: 'Stub Notes', description: 'Notes with 50-200 chars but many inbound links',
};

const OVERSIZED_NOTE: LintSignalDef = {
  id: 'oversized_note', dimension: 'content', severity: 'suggestion', weight: 0.5,
  label: 'Oversized Notes', description: 'Notes exceeding 5000 words that should be split',
};

async function detectEmptyNotes(): Promise<LintViolation[]> {
  const app = AppContext.getApp();
  const violations: LintViolation[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const stat = await app.vault.adapter.stat(file.path);
    if (stat && stat.size < 100) {  // ~50 chars + frontmatter overhead
      const content = await app.vault.cachedRead(file);
      const bodyContent = content.replace(/^---[\s\S]*?---\n?/, '').trim();
      if (bodyContent.length < 50) {
        violations.push({
          signalId: 'empty_note', dimension: 'content', severity: 'warning',
          nodePath: file.path, label: file.basename,
          details: { contentLength: bodyContent.length },
        });
      }
    }
  }
  return violations;
}

async function detectStubNotes(): Promise<LintViolation[]> {
  const app = AppContext.getApp();
  const violations: LintViolation[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const content = await app.vault.cachedRead(file);
    const bodyContent = content.replace(/^---[\s\S]*?---\n?/, '').trim();
    if (bodyContent.length >= 50 && bodyContent.length <= 200) {
      const backlinks = app.metadataCache.getBacklinksForFile(file);
      const inboundCount = backlinks?.data ? Object.keys(backlinks.data).length : 0;
      if (inboundCount >= 3) {
        violations.push({
          signalId: 'stub_note', dimension: 'content', severity: 'info',
          nodePath: file.path, label: file.basename,
          details: { contentLength: bodyContent.length, inboundLinkCount: inboundCount },
        });
      }
    }
  }
  return violations;
}

async function detectOversizedNotes(): Promise<LintViolation[]> {
  const app = AppContext.getApp();
  const violations: LintViolation[] = [];
  const WORD_THRESHOLD = 5000;

  for (const file of app.vault.getMarkdownFiles()) {
    const stat = await app.vault.adapter.stat(file.path);
    // Only check files > ~25KB (rough 5000-word estimate)
    if (stat && stat.size > 25000) {
      const content = await app.vault.cachedRead(file);
      const wordCount = content.split(/\s+/).length;
      if (wordCount > WORD_THRESHOLD) {
        violations.push({
          signalId: 'oversized_note', dimension: 'content', severity: 'suggestion',
          nodePath: file.path, label: file.basename,
          details: { wordCount },
        });
      }
    }
  }
  return violations;
}

export function registerContentSignals(registry: LintSignalRegistry): void {
  registry.register(EMPTY_NOTE, detectEmptyNotes);
  registry.register(STUB_NOTE, detectStubNotes);
  registry.register(OVERSIZED_NOTE, detectOversizedNotes);
}
```

- [ ] **Step 2: Create temporal signals**

Create `src/service/lint/signals/temporal.ts`:

```typescript
import { LintSignalDef, LintViolation } from '../types';
import { LintSignalRegistry } from '../LintSignalRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

const DECAYING_HUB: LintSignalDef = {
  id: 'decaying_hub', dimension: 'temporal', severity: 'warning', weight: 1.0,
  label: 'Decaying Hubs', description: 'High-PageRank notes not updated in 6+ months',
};

const STALE_CONTENT: LintSignalDef = {
  id: 'stale_content', dimension: 'temporal', severity: 'info', weight: 0.5,
  label: 'Stale Content', description: 'Heavily referenced notes that are outdated',
};

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 12 * 30 * 24 * 60 * 60 * 1000;

async function detectDecayingHubs(): Promise<LintViolation[]> {
  const repo = sqliteStoreManager.vaultMobiusNodeRepo;
  // Get nodes with high PageRank
  const topNodes = await repo.listNodeIdsByTypesKeyset(['note', 'hub_doc'], null, 500);
  const nodes = await repo.getByIds(topNodes);
  const violations: LintViolation[] = [];
  const now = Date.now();
  const cutoff = now - SIX_MONTHS_MS;

  for (const [id, node] of nodes) {
    const pagerank = (node as any).pagerank ?? 0;
    const modified = (node as any).modified ?? 0;
    const incomingCount = (node as any).doc_incoming_cnt ?? 0;

    // High PageRank (top tier) + stale
    if (pagerank > 0.01 && modified < cutoff && incomingCount >= 3) {
      const daysSinceModified = Math.floor((now - modified) / (24 * 60 * 60 * 1000));
      violations.push({
        signalId: 'decaying_hub', dimension: 'temporal', severity: 'warning',
        nodeId: id, nodePath: node.path ?? undefined, label: node.label ?? undefined,
        details: { pagerank, lastModified: modified, daysSinceModified, inboundLinkCount: incomingCount },
      });
    }
  }
  return violations;
}

async function detectStaleContent(): Promise<LintViolation[]> {
  const repo = sqliteStoreManager.vaultMobiusNodeRepo;
  const topNodes = await repo.listNodeIdsByTypesKeyset(['note'], null, 500);
  const nodes = await repo.getByIds(topNodes);
  const violations: LintViolation[] = [];
  const now = Date.now();
  const cutoff = now - ONE_YEAR_MS;

  for (const [id, node] of nodes) {
    const modified = (node as any).modified ?? 0;
    const incomingCount = (node as any).doc_incoming_cnt ?? 0;

    if (modified < cutoff && incomingCount >= 5) {
      const daysSinceModified = Math.floor((now - modified) / (24 * 60 * 60 * 1000));
      violations.push({
        signalId: 'stale_content', dimension: 'temporal', severity: 'info',
        nodeId: id, nodePath: node.path ?? undefined, label: node.label ?? undefined,
        details: { lastModified: modified, daysSinceModified, inboundLinkCount: incomingCount },
      });
    }
  }
  return violations;
}

export function registerTemporalSignals(registry: LintSignalRegistry): void {
  registry.register(DECAYING_HUB, detectDecayingHubs);
  registry.register(STALE_CONTENT, detectStaleContent);
}
```

- [ ] **Step 3: Create semantic signals**

Create `src/service/lint/signals/semantic.ts`:

```typescript
import { LintSignalDef, LintViolation } from '../types';
import { LintSignalRegistry } from '../LintSignalRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SemanticRelatedEdgesReadService } from '@/service/search/index/helper/semanticRelatedEdges';

const COVERAGE_GAP: LintSignalDef = {
  id: 'coverage_gap', dimension: 'semantic', severity: 'warning', weight: 1.0,
  label: 'Topic Blind Spots', description: 'Vault folder subtrees with no hub coverage',
};

const SEMANTIC_ISOLATION: LintSignalDef = {
  id: 'semantic_isolation', dimension: 'semantic', severity: 'info', weight: 0.5,
  label: 'Semantically Isolated', description: 'Notes with zero semantic neighbors',
};

async function detectCoverageGaps(): Promise<LintViolation[]> {
  // Reuse HubDiscoverRoundSummary.topUncoveredFolders if a recent hub discovery exists
  // Otherwise compute from stored hub constituent data
  const { HubCandidateDiscoveryService } = await import(
    '@/service/search/index/helper/hub/hubDiscover'
  );
  const violations: LintViolation[] = [];

  try {
    const service = new HubCandidateDiscoveryService();
    const result = await service.discoverAllHubCandidates({ tenant: 'vault' });

    // Get coverage gaps from the last round summary
    const lastRound = result.roundSummaries[result.roundSummaries.length - 1];
    if (lastRound?.topUncoveredFolders) {
      for (const gap of lastRound.topUncoveredFolders) {
        if (gap.uncoveredDocumentCount >= 3) {
          violations.push({
            signalId: 'coverage_gap', dimension: 'semantic', severity: 'warning',
            nodePath: gap.pathPrefix,
            details: {
              folderPrefix: gap.pathPrefix,
              uncoveredNoteCount: gap.uncoveredDocumentCount,
              examplePaths: gap.examplePaths.slice(0, 5),
            },
          });
        }
      }
    }
  } catch {
    // Hub discovery may not be ready yet
  }
  return violations;
}

async function detectSemanticIsolation(): Promise<LintViolation[]> {
  const repo = sqliteStoreManager.vaultMobiusNodeRepo;
  const topNodes = await repo.listNodeIdsByTypesKeyset(['note'], null, 500);
  const violations: LintViolation[] = [];

  for (const nodeId of topNodes) {
    const links = await SemanticRelatedEdgesReadService.loadGraphSemanticLinkItems(
      nodeId, 'vault', 1
    );
    if (links.length === 0) {
      const nodes = await repo.getByIds([nodeId]);
      const node = nodes.get(nodeId);
      if (node) {
        violations.push({
          signalId: 'semantic_isolation', dimension: 'semantic', severity: 'info',
          nodeId, nodePath: node.path ?? undefined, label: node.label ?? undefined,
          details: { semanticEdgeCount: 0 },
        });
      }
    }
  }
  return violations;
}

export function registerSemanticSignals(registry: LintSignalRegistry): void {
  registry.register(COVERAGE_GAP, detectCoverageGaps);
  registry.register(SEMANTIC_ISOLATION, detectSemanticIsolation);
}
```

- [ ] **Step 4: Create tag signals**

Create `src/service/lint/signals/tags.ts`:

```typescript
import { LintSignalDef, LintViolation } from '../types';
import { LintSignalRegistry } from '../LintSignalRegistry';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

const UNTAGGED_NOTE: LintSignalDef = {
  id: 'untagged_note', dimension: 'tags', severity: 'info', weight: 0.5,
  label: 'Untagged Notes', description: 'Notes with zero tags',
};

const TAG_ISLAND: LintSignalDef = {
  id: 'tag_island', dimension: 'tags', severity: 'info', weight: 0.3,
  label: 'Tag Islands', description: 'Tags used by only 1 note',
};

async function detectUntaggedNotes(): Promise<LintViolation[]> {
  const app = AppContext.getApp();
  const violations: LintViolation[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const hasFrontmatterTags = cache?.frontmatter?.tags?.length > 0;
    const hasInlineTags = cache?.tags && cache.tags.length > 0;
    if (!hasFrontmatterTags && !hasInlineTags) {
      violations.push({
        signalId: 'untagged_note', dimension: 'tags', severity: 'info',
        nodePath: file.path, label: file.basename,
        details: {},
      });
    }
  }
  return violations;
}

async function detectTagIslands(): Promise<LintViolation[]> {
  const edgeRepo = sqliteStoreManager.vaultMobiusEdgeRepo;
  const violations: LintViolation[] = [];

  try {
    const tagCounts = await edgeRepo.getTagCategoryEdgeCountsByToNode();
    for (const [tagNodeId, count] of Object.entries(tagCounts)) {
      if (count === 1) {
        const nodes = await sqliteStoreManager.vaultMobiusNodeRepo.getByIds([tagNodeId]);
        const node = nodes.get(tagNodeId);
        violations.push({
          signalId: 'tag_island', dimension: 'tags', severity: 'info',
          nodeId: tagNodeId, label: node?.label ?? tagNodeId,
          details: { usageCount: 1 },
        });
      }
    }
  } catch {
    // Tag edges may not exist yet
  }
  return violations;
}

export function registerTagSignals(registry: LintSignalRegistry): void {
  registry.register(UNTAGGED_NOTE, detectUntaggedNotes);
  registry.register(TAG_ISLAND, detectTagIslands);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/service/lint/signals/
git commit -m "feat(lint): add content, temporal, semantic, and tag signal detectors"
```

---

### Task 4: HealthScoreCalculator + Unit Tests

**Files:**
- Create: `src/service/lint/HealthScoreCalculator.ts`
- Create: `test/lint-health-score.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/lint-health-score.test.ts`:

```typescript
import { HealthScoreCalculator } from '../src/service/lint/HealthScoreCalculator';
import type { LintViolation, LintSignalDef } from '../src/service/lint/types';

const signalDefs: LintSignalDef[] = [
  { id: 'hard_orphan', dimension: 'structural', severity: 'warning', weight: 1.0, label: '', description: '' },
  { id: 'broken_link', dimension: 'structural', severity: 'error', weight: 1.0, label: '', description: '' },
  { id: 'empty_note', dimension: 'content', severity: 'warning', weight: 0.8, label: '', description: '' },
  { id: 'decaying_hub', dimension: 'temporal', severity: 'warning', weight: 1.0, label: '', description: '' },
  { id: 'coverage_gap', dimension: 'semantic', severity: 'warning', weight: 1.0, label: '', description: '' },
  { id: 'untagged_note', dimension: 'tags', severity: 'info', weight: 0.5, label: '', description: '' },
];

const calculator = new HealthScoreCalculator(signalDefs);

// Test 1: Perfect score (no violations)
const result1 = calculator.compute([], 100);
console.assert(result1.overallScore === 100, `FAIL: expected 100, got ${result1.overallScore}`);
console.assert(result1.dimensions.structural.score === 100, 'FAIL: structural should be 100');
console.assert(result1.dimensions.content.score === 100, 'FAIL: content should be 100');
console.log('PASS: perfect score with no violations');

// Test 2: Some violations
const violations: LintViolation[] = [
  { signalId: 'hard_orphan', dimension: 'structural', severity: 'warning', details: {} },
  { signalId: 'hard_orphan', dimension: 'structural', severity: 'warning', details: {} },
  { signalId: 'hard_orphan', dimension: 'structural', severity: 'warning', details: {} },
  { signalId: 'hard_orphan', dimension: 'structural', severity: 'warning', details: {} },
  { signalId: 'hard_orphan', dimension: 'structural', severity: 'warning', details: {} },
];
const result2 = calculator.compute(violations, 100);
console.assert(result2.overallScore < 100, 'FAIL: score should be less than 100 with violations');
console.assert(result2.overallScore > 0, 'FAIL: score should be positive');
console.assert(result2.dimensions.structural.score < 100, 'FAIL: structural should be < 100');
console.assert(result2.dimensions.structural.violationCount === 5, 'FAIL: structural should have 5 violations');
console.assert(result2.dimensions.content.score === 100, 'FAIL: content should be 100 (no content violations)');
console.log('PASS: partial violations score');

// Test 3: All notes are violations
const allViolations: LintViolation[] = Array.from({ length: 100 }, () => ({
  signalId: 'hard_orphan', dimension: 'structural', severity: 'warning', details: {},
}));
const result3 = calculator.compute(allViolations, 100);
console.assert(result3.dimensions.structural.score === 0, `FAIL: structural should be 0, got ${result3.dimensions.structural.score}`);
console.log('PASS: worst-case score');

// Test 4: Mixed dimensions
const mixed: LintViolation[] = [
  { signalId: 'hard_orphan', dimension: 'structural', severity: 'warning', details: {} },
  { signalId: 'empty_note', dimension: 'content', severity: 'warning', details: {} },
  { signalId: 'decaying_hub', dimension: 'temporal', severity: 'warning', details: {} },
  { signalId: 'coverage_gap', dimension: 'semantic', severity: 'warning', details: {} },
  { signalId: 'untagged_note', dimension: 'tags', severity: 'info', details: {} },
];
const result4 = calculator.compute(mixed, 100);
console.assert(result4.overallScore > 0 && result4.overallScore < 100, 'FAIL: mixed score out of range');
for (const dim of ['structural', 'content', 'temporal', 'semantic', 'tags'] as const) {
  console.assert(result4.dimensions[dim].score < 100, `FAIL: ${dim} should be < 100`);
  console.assert(result4.dimensions[dim].violationCount >= 1, `FAIL: ${dim} should have violations`);
}
console.log('PASS: mixed-dimension violations');

// Test 5: Zero notes edge case
const result5 = calculator.compute([], 0);
console.assert(result5.overallScore === 100, 'FAIL: zero notes should give 100');
console.log('PASS: zero notes edge case');

console.log('=== All lint-health-score tests passed ===');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/lint-health-score.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement HealthScoreCalculator**

Create `src/service/lint/HealthScoreCalculator.ts`:

```typescript
import {
  LintDimension, LintDimensionScore, LintSignalDef,
  LintViolation, LINT_DIMENSIONS, DIMENSION_WEIGHTS,
} from './types';

export class HealthScoreCalculator {
  private signalsByDimension: Map<LintDimension, LintSignalDef[]>;
  private signalMap: Map<string, LintSignalDef>;

  constructor(signalDefs: LintSignalDef[]) {
    this.signalMap = new Map(signalDefs.map(s => [s.id, s]));
    this.signalsByDimension = new Map();
    for (const dim of LINT_DIMENSIONS) {
      this.signalsByDimension.set(dim, signalDefs.filter(s => s.dimension === dim));
    }
  }

  compute(violations: LintViolation[], totalNotes: number): {
    overallScore: number;
    dimensions: Record<LintDimension, LintDimensionScore>;
  } {
    const dimensions = {} as Record<LintDimension, LintDimensionScore>;

    for (const dim of LINT_DIMENSIONS) {
      const dimViolations = violations.filter(v => v.dimension === dim);
      dimensions[dim] = this.computeDimensionScore(dim, dimViolations, totalNotes);
    }

    let overallScore = 0;
    for (const dim of LINT_DIMENSIONS) {
      overallScore += DIMENSION_WEIGHTS[dim] * dimensions[dim].score;
    }
    overallScore = Math.round(overallScore * 10) / 10;

    return { overallScore, dimensions };
  }

  private computeDimensionScore(
    dimension: LintDimension,
    violations: LintViolation[],
    totalNotes: number,
  ): LintDimensionScore {
    if (totalNotes === 0 || violations.length === 0) {
      return {
        dimension,
        score: 100,
        violationCount: violations.length,
        eligibleCount: totalNotes,
      };
    }

    // Sum weighted violations
    let weightedCount = 0;
    for (const v of violations) {
      const signalDef = this.signalMap.get(v.signalId);
      weightedCount += signalDef?.weight ?? 1.0;
    }

    const violationRatio = Math.min(1, weightedCount / totalNotes);
    const score = Math.round((1 - violationRatio) * 1000) / 10;

    return {
      dimension,
      score: Math.max(0, score),
      violationCount: violations.length,
      eligibleCount: totalNotes,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/lint-health-score.test.ts`
Expected: All assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/service/lint/HealthScoreCalculator.ts test/lint-health-score.test.ts
git commit -m "feat(lint): add HealthScoreCalculator with weighted dimension scoring"
```

---

### Task 5: LintScanService Orchestrator

**Files:**
- Create: `src/service/lint/LintScanService.ts`

- [ ] **Step 1: Create LintScanService**

Create `src/service/lint/LintScanService.ts`:

```typescript
import { LintSignalRegistry } from './LintSignalRegistry';
import { HealthScoreCalculator } from './HealthScoreCalculator';
import { LintScanResult, LintViolation } from './types';
import { registerStructuralSignals } from './signals/structural';
import { registerContentSignals } from './signals/content';
import { registerTemporalSignals } from './signals/temporal';
import { registerSemanticSignals } from './signals/semantic';
import { registerTagSignals } from './signals/tags';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { AppContext } from '@/app/context/AppContext';

export class LintScanService {
  private registry: LintSignalRegistry;
  private calculator: HealthScoreCalculator;
  private scanning = false;

  constructor() {
    this.registry = new LintSignalRegistry();
    registerStructuralSignals(this.registry);
    registerContentSignals(this.registry);
    registerTemporalSignals(this.registry);
    registerSemanticSignals(this.registry);
    registerTagSignals(this.registry);
    this.calculator = new HealthScoreCalculator(this.registry.getAllDefs());
  }

  get isScanning(): boolean {
    return this.scanning;
  }

  async runFullScan(): Promise<LintScanResult> {
    if (this.scanning) throw new Error('Scan already in progress');
    this.scanning = true;

    const startTime = Date.now();
    try {
      // Count total notes
      const app = AppContext.getApp();
      const totalNotes = app.vault.getMarkdownFiles().length;

      // Run all signals
      let violations = await this.registry.runAll();

      // Filter out dismissed violations
      const dismissals = await sqliteStoreManager.lintRepo.getDismissals();
      violations = violations.filter(v => {
        const dismissed = dismissals.get(v.signalId);
        if (!dismissed) return true;
        return !v.nodePath || !dismissed.has(v.nodePath);
      });

      // Compute scores
      const { overallScore, dimensions } = this.calculator.compute(violations, totalNotes);

      const durationMs = Date.now() - startTime;

      // Persist to SQLite
      const scanId = await sqliteStoreManager.lintRepo.insertScan({
        timestamp: startTime,
        scanType: 'full',
        durationMs,
        totalNotes,
        overallScore,
        structuralScore: dimensions.structural.score,
        contentScore: dimensions.content.score,
        temporalScore: dimensions.temporal.score,
        semanticScore: dimensions.semantic.score,
        tagScore: dimensions.tags.score,
        totalViolations: violations.length,
      });

      // Persist violations
      await sqliteStoreManager.lintRepo.insertViolations(scanId, violations);

      return {
        scanId,
        timestamp: startTime,
        scanType: 'full',
        durationMs,
        totalNotes,
        overallScore,
        dimensions,
        violations,
      };
    } finally {
      this.scanning = false;
    }
  }

  async getLatestResult(): Promise<LintScanResult | null> {
    const scan = await sqliteStoreManager.lintRepo.getLatestScan();
    if (!scan) return null;

    const violations = await sqliteStoreManager.lintRepo.getViolationsForScan(scan.id);
    const parsedViolations: LintViolation[] = violations.map(v => ({
      signalId: v.signal_id,
      dimension: v.dimension as any,
      severity: v.severity as any,
      nodeId: v.node_id ?? undefined,
      nodePath: v.node_path ?? undefined,
      label: v.label ?? undefined,
      details: JSON.parse(v.details || '{}'),
    }));

    return {
      scanId: scan.id,
      timestamp: scan.timestamp,
      scanType: scan.scan_type as any,
      durationMs: scan.duration_ms,
      totalNotes: scan.total_notes,
      overallScore: scan.overall_score,
      dimensions: {
        structural: { dimension: 'structural', score: scan.structural_score, violationCount: parsedViolations.filter(v => v.dimension === 'structural').length, eligibleCount: scan.total_notes },
        content: { dimension: 'content', score: scan.content_score, violationCount: parsedViolations.filter(v => v.dimension === 'content').length, eligibleCount: scan.total_notes },
        temporal: { dimension: 'temporal', score: scan.temporal_score, violationCount: parsedViolations.filter(v => v.dimension === 'temporal').length, eligibleCount: scan.total_notes },
        semantic: { dimension: 'semantic', score: scan.semantic_score, violationCount: parsedViolations.filter(v => v.dimension === 'semantic').length, eligibleCount: scan.total_notes },
        tags: { dimension: 'tags', score: scan.tag_score, violationCount: parsedViolations.filter(v => v.dimension === 'tags').length, eligibleCount: scan.total_notes },
      },
      violations: parsedViolations,
    };
  }

  async getTrendData(limit = 20): Promise<Array<{ timestamp: number; overallScore: number }>> {
    const scans = await sqliteStoreManager.lintRepo.getRecentScans(limit);
    return scans.map(s => ({ timestamp: s.timestamp, overallScore: s.overall_score })).reverse();
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/service/lint/LintScanService.ts
git commit -m "feat(lint): add LintScanService orchestrator with full scan + persistence"
```

---

### Task 6: Zustand Store + VaultXRayView Registration

**Files:**
- Create: `src/ui/store/vaultLintStore.ts`
- Create: `src/ui/view/vault-xray/VaultXRayView.ts`
- Create: `src/ui/view/vault-xray/VaultXRayRoot.tsx`
- Modify: `src/app/view/ViewManager.ts:26-51`
- Modify: `src/app/commands/Register.ts`

- [ ] **Step 1: Create Zustand store**

Create `src/ui/store/vaultLintStore.ts`:

```typescript
import { create } from 'zustand';
import type { LintScanResult, LintViolation, LintDimension } from '@/service/lint/types';

interface VaultLintState {
  scanResult: LintScanResult | null;
  isScanning: boolean;
  selectedViolation: LintViolation | null;
  filterDimension: LintDimension | null;
  filterSeverity: string | null;
  trendData: Array<{ timestamp: number; overallScore: number }>;
}

interface VaultLintActions {
  setScanResult: (result: LintScanResult) => void;
  setScanning: (scanning: boolean) => void;
  selectViolation: (violation: LintViolation | null) => void;
  setFilterDimension: (dimension: LintDimension | null) => void;
  setFilterSeverity: (severity: string | null) => void;
  setTrendData: (data: Array<{ timestamp: number; overallScore: number }>) => void;
  getFilteredViolations: () => LintViolation[];
}

type VaultLintStore = VaultLintState & VaultLintActions;

export const useVaultLintStore = create<VaultLintStore>((set, get) => ({
  scanResult: null,
  isScanning: false,
  selectedViolation: null,
  filterDimension: null,
  filterSeverity: null,
  trendData: [],

  setScanResult: (result) => set({ scanResult: result, isScanning: false }),
  setScanning: (scanning) => set({ isScanning: scanning }),
  selectViolation: (violation) => set({ selectedViolation: violation }),
  setFilterDimension: (dimension) => set({ filterDimension: dimension }),
  setFilterSeverity: (severity) => set({ filterSeverity: severity }),
  setTrendData: (data) => set({ trendData: data }),

  getFilteredViolations: () => {
    const { scanResult, filterDimension, filterSeverity } = get();
    if (!scanResult) return [];
    let violations = scanResult.violations;
    if (filterDimension) violations = violations.filter(v => v.dimension === filterDimension);
    if (filterSeverity) violations = violations.filter(v => v.severity === filterSeverity);
    return violations;
  },
}));
```

- [ ] **Step 2: Create VaultXRayView (Obsidian leaf)**

Create `src/ui/view/vault-xray/VaultXRayView.ts`:

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { AppContext } from '@/app/context/AppContext';

export const VAULT_XRAY_VIEW_TYPE = 'peak-vault-xray-view';

export class VaultXRayView extends ItemView {
  private root: any = null;

  constructor(leaf: WorkspaceLeaf, private readonly appContext: AppContext) {
    super(leaf);
  }

  getViewType(): string { return VAULT_XRAY_VIEW_TYPE; }
  getDisplayText(): string { return 'Vault X-Ray'; }
  getIcon(): string { return 'activity'; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.classList.add('peak-vault-xray');

    const { mountVaultXRay } = await import('./VaultXRayRoot');
    this.root = mountVaultXRay(container, this.appContext);
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}
```

- [ ] **Step 3: Create VaultXRayRoot**

Create `src/ui/view/vault-xray/VaultXRayRoot.tsx`:

```tsx
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { AppContext } from '@/app/context/AppContext';
import { ScoreCard } from './components/ScoreCard';
import { ActionableItemsList } from './components/ActionableItemsList';
import { ViolationDetail } from './components/ViolationDetail';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import { LintScanService } from '@/service/lint/LintScanService';

function VaultXRayApp() {
  const { scanResult, isScanning, selectedViolation } = useVaultLintStore();

  const handleScan = async () => {
    useVaultLintStore.getState().setScanning(true);
    try {
      const service = new LintScanService();
      const result = await service.runFullScan();
      useVaultLintStore.getState().setScanResult(result);
      const trend = await service.getTrendData();
      useVaultLintStore.getState().setTrendData(trend);
    } catch (err) {
      console.error('Vault lint scan failed:', err);
      useVaultLintStore.getState().setScanning(false);
    }
  };

  const handleLoadLatest = async () => {
    const service = new LintScanService();
    const latest = await service.getLatestResult();
    if (latest) {
      useVaultLintStore.getState().setScanResult(latest);
      const trend = await service.getTrendData();
      useVaultLintStore.getState().setTrendData(trend);
    }
  };

  React.useEffect(() => { void handleLoadLatest(); }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[--background-modifier-border]">
        <span className="text-lg font-semibold text-[--text-normal]">Vault X-Ray</span>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-[--interactive-accent] text-[--text-on-accent] hover:bg-[--interactive-accent-hover] disabled:opacity-50"
        >
          {isScanning ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <ScoreCard />
          <ActionableItemsList />
        </div>

        {selectedViolation && (
          <div className="w-[340px] border-l border-[--background-modifier-border] overflow-y-auto">
            <ViolationDetail />
          </div>
        )}
      </div>
    </div>
  );
}

export function mountVaultXRay(container: HTMLElement, _appContext: AppContext): Root {
  const root = createRoot(container);
  root.render(<VaultXRayApp />);
  return root;
}
```

- [ ] **Step 4: Register view in ViewManager**

In `src/app/view/ViewManager.ts`, add import and registration:

```typescript
import { VaultXRayView, VAULT_XRAY_VIEW_TYPE } from '@/ui/view/vault-xray/VaultXRayView';

// In constructor, add to viewCreators:
this.viewCreators.set(VAULT_XRAY_VIEW_TYPE, (leaf) => new VaultXRayView(leaf, appContext));
```

- [ ] **Step 5: Register commands in Register.ts**

In `src/app/commands/Register.ts`, add:

```typescript
import { VAULT_XRAY_VIEW_TYPE } from '@/ui/view/vault-xray/VaultXRayView';
import { LintScanService } from '@/service/lint/LintScanService';

// Add commands:
plugin.addCommand({
  id: 'open-vault-xray',
  name: 'Open Vault X-Ray',
  callback: async () => {
    const leaf = app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VAULT_XRAY_VIEW_TYPE, active: true });
    app.workspace.revealLeaf(leaf);
  },
});

plugin.addCommand({
  id: 'run-vault-health-check',
  name: 'Run Vault Health Check',
  callback: async () => {
    const service = new LintScanService();
    const result = await service.runFullScan();
    new Notice(`Vault Health: ${result.overallScore}/100 (${result.violations.length} issues)`);
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/store/vaultLintStore.ts src/ui/view/vault-xray/ \
  src/app/view/ViewManager.ts src/app/commands/Register.ts
git commit -m "feat(lint): add VaultXRayView, Zustand store, and commands"
```

---

### Task 7: ScoreCard + ActionableItemsList Components

**Files:**
- Create: `src/ui/view/vault-xray/components/ScoreCard.tsx`
- Create: `src/ui/view/vault-xray/components/ActionableItemsList.tsx`

- [ ] **Step 1: Create ScoreCard component**

Create `src/ui/view/vault-xray/components/ScoreCard.tsx`:

```tsx
import React from 'react';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import { LintDimension, LINT_DIMENSIONS } from '@/service/lint/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const DIMENSION_LABELS: Record<LintDimension, string> = {
  structural: 'Structure',
  content: 'Content',
  temporal: 'Freshness',
  semantic: 'Coverage',
  tags: 'Tags',
};

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-500';
  if (score >= 70) return 'text-blue-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBgColor(score: number): string {
  if (score >= 90) return 'bg-green-500/10 text-green-600';
  if (score >= 70) return 'bg-blue-500/10 text-blue-600';
  if (score >= 50) return 'bg-amber-500/10 text-amber-600';
  return 'bg-red-500/10 text-red-600';
}

export function ScoreCard() {
  const { scanResult, trendData, filterDimension, setFilterDimension } = useVaultLintStore();

  if (!scanResult) {
    return (
      <div className="rounded-lg border border-[--background-modifier-border] p-6 text-center text-[--text-muted]">
        <span className="text-sm">No scan data yet. Click "Scan" to run a health check.</span>
      </div>
    );
  }

  const { overallScore, dimensions, totalNotes, violations, durationMs } = scanResult;
  const prevScore = trendData.length >= 2 ? trendData[trendData.length - 2]?.overallScore : null;
  const delta = prevScore != null ? overallScore - prevScore : null;

  return (
    <div className="rounded-lg border border-[--background-modifier-border] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${scoreColor(overallScore)}`}>
            {Math.round(overallScore)}
          </span>
          <span className="text-sm text-[--text-muted]">/ 100</span>
          {delta != null && (
            <span className={`flex items-center gap-0.5 text-xs ${delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-[--text-muted]'}`}>
              {delta > 0 ? <TrendingUp size={12} /> : delta < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}
            </span>
          )}
        </div>
        <div className="text-xs text-[--text-muted]">
          {totalNotes} notes · {violations.length} issues · {durationMs}ms
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-[--background-modifier-border] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${overallScore >= 90 ? 'bg-green-500' : overallScore >= 70 ? 'bg-blue-500' : overallScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${overallScore}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LINT_DIMENSIONS.map(dim => {
          const ds = dimensions[dim];
          const isActive = filterDimension === dim;
          return (
            <button
              key={dim}
              onClick={() => setFilterDimension(isActive ? null : dim)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-[--interactive-accent] text-[--text-on-accent]'
                  : scoreBgColor(ds.score)
              }`}
            >
              {DIMENSION_LABELS[dim]} {Math.round(ds.score)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ActionableItemsList component**

Create `src/ui/view/vault-xray/components/ActionableItemsList.tsx`:

```tsx
import React from 'react';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import type { LintViolation } from '@/service/lint/types';
import { AlertCircle, AlertTriangle, Info, Lightbulb, FileText } from 'lucide-react';

const SEVERITY_ORDER = { error: 0, warning: 1, suggestion: 2, info: 3 };

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  error: <AlertCircle size={14} className="text-red-500" />,
  warning: <AlertTriangle size={14} className="text-amber-500" />,
  suggestion: <Lightbulb size={14} className="text-blue-500" />,
  info: <Info size={14} className="text-[--text-muted]" />,
};

const SIGNAL_LABELS: Record<string, string> = {
  hard_orphan: 'Orphan Notes',
  broken_link: 'Broken Links',
  missing_backlink: 'Potential Links',
  empty_note: 'Empty Notes',
  stub_note: 'Stub Notes',
  oversized_note: 'Oversized Notes',
  decaying_hub: 'Decaying Hubs',
  stale_content: 'Stale Content',
  coverage_gap: 'Topic Blind Spots',
  semantic_isolation: 'Isolated Notes',
  untagged_note: 'Untagged Notes',
  tag_island: 'Tag Islands',
};

function groupViolations(violations: LintViolation[]): Array<{ signalId: string; severity: string; items: LintViolation[] }> {
  const groups = new Map<string, LintViolation[]>();
  for (const v of violations) {
    const existing = groups.get(v.signalId) ?? [];
    existing.push(v);
    groups.set(v.signalId, existing);
  }
  return Array.from(groups.entries())
    .map(([signalId, items]) => ({ signalId, severity: items[0].severity, items }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 9) - (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 9));
}

export function ActionableItemsList() {
  const violations = useVaultLintStore(s => s.getFilteredViolations());
  const selectViolation = useVaultLintStore(s => s.selectViolation);

  if (violations.length === 0) {
    return (
      <div className="text-sm text-[--text-muted] text-center py-4">
        No issues found. Your vault is healthy!
      </div>
    );
  }

  const groups = groupViolations(violations);

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-[--text-muted] uppercase tracking-wide">Issues</span>
      {groups.map(group => (
        <ViolationGroup
          key={group.signalId}
          signalId={group.signalId}
          severity={group.severity}
          items={group.items}
          onSelect={selectViolation}
        />
      ))}
    </div>
  );
}

function ViolationGroup({ signalId, severity, items, onSelect }: {
  signalId: string; severity: string; items: LintViolation[];
  onSelect: (v: LintViolation) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const label = SIGNAL_LABELS[signalId] ?? signalId;
  const previewItems = expanded ? items : items.slice(0, 3);

  return (
    <div className="rounded-md border border-[--background-modifier-border] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[--background-modifier-hover] transition-colors"
      >
        {SEVERITY_ICON[severity] ?? <Info size={14} />}
        <span className="text-sm font-medium text-[--text-normal] flex-1 text-left">{label}</span>
        <span className="text-xs text-[--text-muted] tabular-nums">{items.length}</span>
      </button>

      <div className="border-t border-[--background-modifier-border]">
        {previewItems.map((v, i) => (
          <button
            key={i}
            onClick={() => onSelect(v)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[--background-modifier-hover] transition-colors"
          >
            <FileText size={12} className="text-[--text-muted] shrink-0" />
            <span className="text-xs text-[--text-normal] truncate">{v.label ?? v.nodePath ?? 'Unknown'}</span>
          </button>
        ))}
        {!expanded && items.length > 3 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full px-3 py-1.5 text-xs text-[--text-accent] hover:bg-[--background-modifier-hover]"
          >
            Show all {items.length} items
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/vault-xray/components/ScoreCard.tsx \
  src/ui/view/vault-xray/components/ActionableItemsList.tsx
git commit -m "feat(lint): add ScoreCard and ActionableItemsList UI components"
```

---

### Task 8: ViolationDetail Panel

**Files:**
- Create: `src/ui/view/vault-xray/components/ViolationDetail.tsx`

- [ ] **Step 1: Create ViolationDetail component**

Create `src/ui/view/vault-xray/components/ViolationDetail.tsx`:

```tsx
import React from 'react';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import { AppContext } from '@/app/context/AppContext';
import { X, ExternalLink, EyeOff } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  hard_orphan: 'This note has no incoming or outgoing links. Consider connecting it to related notes.',
  broken_link: 'A wikilink in this note points to a file that does not exist.',
  missing_backlink: 'This note\'s title is mentioned in another note without a wikilink.',
  empty_note: 'This file has very little content. Consider adding content or deleting it.',
  stub_note: 'This note is short but heavily referenced. Consider expanding it.',
  oversized_note: 'This note is very long. Consider splitting it into smaller, focused notes.',
  decaying_hub: 'This is an important hub note that hasn\'t been updated recently.',
  stale_content: 'This note is heavily referenced but hasn\'t been updated in over a year.',
  coverage_gap: 'This folder area has no hub coverage. Consider creating a hub note.',
  semantic_isolation: 'This note has no semantic connections to other notes.',
  untagged_note: 'This note has no tags. Consider adding tags for better organization.',
  tag_island: 'This tag is used by only one note. Consider merging with a similar tag.',
};

export function ViolationDetail() {
  const { selectedViolation, selectViolation, scanResult, setScanResult } = useVaultLintStore();

  if (!selectedViolation) return null;

  const { signalId, nodePath, label, details, severity } = selectedViolation;

  const handleOpenFile = () => {
    if (!nodePath) return;
    const app = AppContext.getApp();
    const file = app.vault.getAbstractFileByPath(nodePath);
    if (file) {
      app.workspace.getLeaf('tab').openFile(file as any);
    }
  };

  const handleDismiss = async () => {
    if (!nodePath) return;
    await sqliteStoreManager.lintRepo.dismissViolation(signalId, nodePath, 'false_positive');
    // Remove from current results
    if (scanResult) {
      setScanResult({
        ...scanResult,
        violations: scanResult.violations.filter(
          v => !(v.signalId === signalId && v.nodePath === nodePath)
        ),
      });
    }
    selectViolation(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[--background-modifier-border]">
        <span className="text-sm font-medium text-[--text-normal] truncate">{label ?? nodePath ?? signalId}</span>
        <button onClick={() => selectViolation(null)} className="text-[--text-muted] hover:text-[--text-normal]">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <div className="text-xs text-[--text-muted]">
          {SIGNAL_DESCRIPTIONS[signalId] ?? 'No description available.'}
        </div>

        {nodePath && (
          <div className="text-xs text-[--text-muted]">
            <span className="font-medium">Path:</span> {nodePath}
          </div>
        )}

        {Object.keys(details).length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-[--text-muted]">Details</span>
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="text-[--text-muted]">{key}</span>
                <span className="text-[--text-normal]">{String(value)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Signal-specific details */}
        {signalId === 'hard_orphan' && (details as any).revivalSuggestion && (
          <div className="rounded-md bg-[--background-secondary] p-2 space-y-1">
            <span className="text-xs font-medium text-[--text-normal]">Suggested Connection</span>
            <span className="text-xs text-[--text-muted]">{(details as any).revivalSuggestion.targetPath}</span>
          </div>
        )}

        {signalId === 'broken_link' && (
          <div className="rounded-md bg-[--background-secondary] p-2 space-y-1">
            <span className="text-xs font-medium text-[--text-normal]">Broken Target</span>
            <span className="text-xs text-[--text-muted]">{(details as any).brokenTarget}</span>
          </div>
        )}

        {signalId === 'coverage_gap' && (
          <div className="rounded-md bg-[--background-secondary] p-2 space-y-1">
            <span className="text-xs font-medium text-[--text-normal]">Uncovered Folder</span>
            <span className="text-xs text-[--text-muted]">{(details as any).folderPrefix}</span>
            <span className="text-xs text-[--text-muted]">{(details as any).uncoveredNoteCount} notes without hub coverage</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-3 py-2 border-t border-[--background-modifier-border]">
        {nodePath && (
          <Button variant="outline" size="sm" onClick={handleOpenFile} className="flex items-center gap-1">
            <ExternalLink size={12} /> Open
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleDismiss} className="flex items-center gap-1 text-[--text-muted]">
          <EyeOff size={12} /> Dismiss
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/vault-xray/components/ViolationDetail.tsx
git commit -m "feat(lint): add ViolationDetail drill-down panel"
```

---

### Task 9: Integration Test + Final Wiring

**Files:**
- Modify: `src/ui/view/vault-xray/VaultXRayRoot.tsx` (if needed)
- Run: full build + manual verification checklist

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass (including new lint tests).

- [ ] **Step 3: Manual verification checklist**

Verify in Obsidian:
1. `Peak: Open Vault X-Ray` command opens a new tab with the X-Ray view
2. "Scan" button runs a full scan and populates the score card
3. Dimension pills filter the violation list
4. Clicking a violation opens the detail panel on the right
5. "Open" button navigates to the affected note
6. "Dismiss" button removes the violation from the list
7. `Peak: Run Vault Health Check` command shows a Notice with the score
8. Subsequent scans load from SQLite on view open

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(lint): complete Vault X-Ray — lint engine + dashboard UI"
```
