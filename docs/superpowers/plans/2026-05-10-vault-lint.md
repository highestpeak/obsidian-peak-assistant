# Vault Lint / Health Check — Implementation Plan (Phase 1 Core Engine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Vault X-Ray lint engine — Phase 1 (Core Engine + Highest-Impact Signals). This delivers a working lint service with structural/content/tag signal detectors, health score computation, a Zustand store, a standalone Obsidian leaf view (Score Ring + Dimension Bars + Priority Actions list), and command registration. No graph visualization (Phase 5) and no LLM-batch signals (Phase 6) in this plan.

**Branch:** `feat/vault-lint`

**Architecture:** A new `src/service/lint/` layer houses the signal detector registry, individual detectors, and the orchestrating `VaultLintService`. SQLite schema already exists in `ddl.ts` (all three `vault_lint_*` tables are live). The DDL type definitions are already in `src/core/storage/sqlite/ddl.ts` (`vault_lint_scan`, `vault_lint_finding`, `vault_lint_dismissal`). `ConfigTemplateId.VaultLintConfig` is already registered in `TemplateRegistry.ts`. What is missing: `VaultLintRepo`, the service layer under `src/service/lint/`, the Zustand store, the standalone view, and command registration.

**Spec:** `docs/superpowers/specs/2026-05-01-vault-lint-design.md` (full document — all section references below are to this spec)

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/service/lint/types.ts` | `LintSignalId`, `LintDimension`, `LintSeverity`, `LintFinding`, `LintScanResult`, `LintDismissal`, `LintSignalDetector`, `LintScanContext`, `FixActionId`, `LintTrendPoint`, all metadata types |
| `src/service/lint/SignalRegistry.ts` | Registry holding all registered `LintSignalDetector` instances |
| `src/service/lint/HealthScoreEngine.ts` | `dimensionScore()` + `computeCompositeScore()` |
| `src/service/lint/VaultLintService.ts` | Orchestrator: load config, run detectors, persist results, update store |
| `src/service/lint/signals/structural.ts` | `S-ORPHAN`, `S-BROKEN-LINK` detectors |
| `src/service/lint/signals/content.ts` | `C-EMPTY`, `C-STUB` detectors |
| `src/service/lint/signals/tags.ts` | `G-UNTAGGED` detector |
| `src/core/storage/sqlite/repositories/VaultLintRepo.ts` | CRUD for `vault_lint_scan`, `vault_lint_finding`, `vault_lint_dismissal` |
| `src/ui/store/vaultLintStore.ts` | Zustand store: scan state, findings, actions |
| `src/ui/view/vault-lint/VaultXRayView.ts` | Obsidian `ItemView` leaf shell |
| `src/ui/view/vault-lint/VaultXRayPanel.tsx` | Root React panel (Score Ring + Dimension Bars + Priority Actions) |
| `src/ui/view/vault-lint/components/ScoreRing.tsx` | Circular progress ring component |
| `src/ui/view/vault-lint/components/DimensionBars.tsx` | Five horizontal dimension score bars |
| `src/ui/view/vault-lint/components/PriorityActionsList.tsx` | Sorted findings list with severity icons |
| `templates/config/vault-lint-config.json` | Runtime config (weights, thresholds, scan schedule) |

### Modified Files

| File | Change Summary |
|------|---------------|
| `src/core/storage/sqlite/SqliteStoreManager.ts` | Add `vaultLintRepo` field + getter, instantiate in `init()` |
| `src/app/commands/Register.ts` | Register `Peak: Vault X-Ray` command |
| `src/app/view/types.ts` | Export `VAULT_XRAY_VIEW_TYPE`, add to `TRACKED_VIEW_TYPES` |
| `src/core/template/TemplateRegistry.ts` | Add `expectsJson: true` to `VaultLintConfig` metadata (currently missing) |

---

## Task 1: Types + Config File

**Files:**
- New: `src/service/lint/types.ts`
- New: `templates/config/vault-lint-config.json`

- [ ] **Step 1: Create `src/service/lint/types.ts`**

Create the file with all types from spec §7.2. Key interfaces:

```typescript
// src/service/lint/types.ts

export type LintSeverity = 'error' | 'warning' | 'info';
export type LintDimension = 'structural' | 'content' | 'temporal' | 'semantic' | 'tags';

export type LintSignalId =
  | 'S-ORPHAN' | 'S-SOFT-ORPHAN' | 'S-BROKEN-LINK' | 'S-MISSING-BACKLINK'
  | 'S-ISLAND-CLUSTER' | 'S-FRAGILE-BRIDGE'
  | 'C-EMPTY' | 'C-STUB' | 'C-OVERSIZED' | 'C-DUPLICATE'
  | 'C-FRONTMATTER-MISSING' | 'C-NAMING-VIOLATION'
  | 'T-STALE-HUB' | 'T-DECAYING-BRIDGE' | 'T-ABANDONED-CLUSTER'
  | 'T-RECENT-DRIFT' | 'T-ABANDONED-FOLDER'
  | 'M-COVERAGE-GAP' | 'M-LOW-COHESION' | 'M-CONTRADICTION'
  | 'M-PHANTOM-NODE' | 'M-SEMANTIC-ISOLATION' | 'M-REDUNDANT-HUBS'
  | 'G-UNTAGGED' | 'G-TAG-ISLAND' | 'G-TAG-REDUNDANCY'
  | 'G-TAG-EXPLOSION' | 'G-NOISE-TAGS';

export type FixActionId =
  | 'suggest-links' | 'delete-note' | 'redirect-link' | 'create-note'
  | 'remove-link' | 'insert-backlink' | 'bridge-to-main' | 'strengthen-connections'
  | 'draft-content' | 'suggest-split' | 'merge-notes' | 'link-as-alias'
  | 'add-frontmatter' | 'rename-with-prefix'
  | 'review-update' | 'mark-current' | 'snooze' | 'archive-cluster' | 'update-neighborhood'
  | 'create-hub' | 'review-cluster' | 'reconcile-contradiction' | 'create-phantom-note'
  | 'suggest-tags' | 'merge-tag' | 'review-taxonomy';

export interface LintFinding {
  id: string;
  signalId: LintSignalId;
  severity: LintSeverity;
  filePath: string | null;
  title: string;
  description: string;
  fixActions: FixActionId[];
  metadata: Record<string, unknown>;
  status: 'open' | 'dismissed' | 'fixed';
}

export interface LintScanContext {
  totalNotes: number;
  allNodeIds: string[];
  lastScanTimestamp: number | null;
  dismissals: Map<string, LintDismissal>;  // key: `${signalId}:${filePath}`
}

export interface LintSignalDetector {
  id: LintSignalId;
  dimension: LintDimension;
  severity: LintSeverity;
  signalWeight: number;
  requiresLlm: boolean;
  detect(context: LintScanContext): Promise<LintFinding[]>;
}

export interface LintScanResult {
  id: string;
  scanType: 'full' | 'incremental';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  totalNotes: number;
  healthScore: number;
  dimensionScores: Record<LintDimension, number>;
  findings: LintFinding[];
  signalCounts: Partial<Record<LintSignalId, number>>;
}

export interface LintDismissal {
  signalId: LintSignalId;
  filePath: string;
  dismissedAt: number;
  reason?: 'false_positive' | 'wont_fix' | 'snoozed';
  snoozeUntil?: number;
}

export interface LintTrendPoint {
  timestamp: number;
  healthScore: number;
  dimensions: Record<LintDimension, number>;
  totalFindings: number;
}

// Signal-specific metadata types
export interface OrphanMetadata {
  orphanType: 'hard' | 'soft';
  edgeCount: number;
  revivalSuggestion?: { targetPath: string; targetTitle: string; similarity: number; reason: string };
}

export interface BrokenLinkMetadata {
  sourcePath: string;
  brokenTarget: string;
  suggestedReplacement?: string;
  matchConfidence?: number;
}

export interface VaultLintConfig {
  dimensionWeights: Record<LintDimension, number>;
  thresholds: {
    stubMaxChars: number;
    oversizedMinWords: number;
    duplicateMinSimilarity: number;
    staleHubDays: number;
    staleHubMinPageRankPercentile: number;
    phantomNodeMinReferences: number;
    softOrphanMaxDegree: number;
    islandClusterMaxSize: number;
  };
  scan: {
    incrementalDebounceMs: number;
    fullScanIntervalHours: number;
  };
}
```

- [ ] **Step 2: Create `templates/config/vault-lint-config.json`**

Create the file with all default values from spec §7.3:

```json
{
  "dimensionWeights": {
    "structural": 0.30,
    "content": 0.20,
    "temporal": 0.15,
    "semantic": 0.25,
    "tags": 0.10
  },
  "thresholds": {
    "stubMaxChars": 100,
    "oversizedMinWords": 5000,
    "duplicateMinSimilarity": 0.92,
    "duplicateMinTitleJaccard": 0.50,
    "staleHubDays": 180,
    "staleHubMinPageRankPercentile": 75,
    "decayingBridgeDays": 365,
    "abandonedClusterDays": 180,
    "abandonedFolderDays": 365,
    "recentDriftActiveDays": 30,
    "recentDriftStaleDays": 180,
    "tagExplosionMultiplier": 5,
    "softOrphanMaxDegree": 2,
    "phantomNodeMinReferences": 3,
    "contradictionMinSimilarity": 0.80,
    "missingBacklinkMinSimilarity": 0.70,
    "lowCohesionMaxDensity": 0.30,
    "islandClusterMaxSize": 5,
    "redundantHubMinOverlap": 0.70
  },
  "scan": {
    "incrementalDebounceMs": 30000,
    "fullScanIntervalHours": 168,
    "contradictionBatchSize": 20,
    "contradictionConcurrency": 2
  }
}
```

- [ ] **Step 3: Fix `VaultLintConfig` metadata in `TemplateRegistry.ts`**

In `src/core/template/TemplateRegistry.ts`, update the `VaultLintConfig` entry to add `expectsJson: true` (currently it is missing this flag, unlike `TimeWithinNormalize`):

Old line (around line 342):
```typescript
[ConfigTemplateId.VaultLintConfig]: meta('config', 'vault-lint-config'),
```

New:
```typescript
[ConfigTemplateId.VaultLintConfig]: meta('config', 'vault-lint-config', { expectsJson: true }),
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant && npm run build
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/service/lint/types.ts templates/config/vault-lint-config.json src/core/template/TemplateRegistry.ts
git commit -m "feat(vault-lint): add lint types, config file, fix TemplateRegistry expectsJson"
```

---

## Task 2: VaultLintRepo

**Files:**
- New: `src/core/storage/sqlite/repositories/VaultLintRepo.ts`
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts`

- [ ] **Step 1: Create `VaultLintRepo.ts`**

All three tables (`vault_lint_scan`, `vault_lint_finding`, `vault_lint_dismissal`) already exist in `ddl.ts` DDL and the `Database` type. Create the repo following the pattern of `AmbientPushRepo.ts` (Kysely, no raw SQL).

```typescript
// src/core/storage/sqlite/repositories/VaultLintRepo.ts
import { sql, type Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { LintScanResult, LintFinding, LintDismissal, LintDimension, LintTrendPoint, LintSignalId } from '@/service/lint/types';

export class VaultLintRepo {
  constructor(private readonly db: Kysely<DbSchema>) {}

  /** Persist a completed scan and its findings atomically. */
  async saveScanResult(result: LintScanResult): Promise<void> {
    await this.db
      .insertInto('vault_lint_scan')
      .values({
        id: result.id,
        scan_type: result.scanType,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        duration_ms: result.durationMs,
        total_notes: result.totalNotes,
        health_score: result.healthScore,
        dim_structural: result.dimensionScores.structural,
        dim_content: result.dimensionScores.content,
        dim_temporal: result.dimensionScores.temporal,
        dim_semantic: result.dimensionScores.semantic,
        dim_tags: result.dimensionScores.tags,
        signal_counts: JSON.stringify(result.signalCounts),
        config_hash: null,
      })
      .execute();

    if (result.findings.length > 0) {
      await this.db
        .insertInto('vault_lint_finding')
        .values(result.findings.map(f => ({
          id: f.id,
          scan_id: result.id,
          signal_id: f.signalId,
          severity: f.severity,
          file_path: f.filePath,
          title: f.title,
          description: f.description,
          fix_actions: JSON.stringify(f.fixActions),
          metadata: JSON.stringify(f.metadata),
          status: f.status,
          dismissed_at: null,
          fixed_at: null,
        })))
        .execute();
    }
  }

  /** Load the latest completed scan with its findings. */
  async loadLatestScan(): Promise<LintScanResult | null> {
    const row = await this.db
      .selectFrom('vault_lint_scan')
      .selectAll()
      .where('completed_at', 'is not', null)
      .orderBy('started_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!row) return null;
    const findings = await this.loadFindingsByScanId(row.id);
    return this.rowToScanResult(row, findings);
  }

  /** Load findings for a scan id. */
  async loadFindingsByScanId(scanId: string): Promise<LintFinding[]> {
    const rows = await this.db
      .selectFrom('vault_lint_finding')
      .selectAll()
      .where('scan_id', '=', scanId)
      .where('status', '=', 'open')
      .execute();

    return rows.map(r => ({
      id: r.id,
      signalId: r.signal_id as LintSignalId,
      severity: r.severity as LintFinding['severity'],
      filePath: r.file_path,
      title: r.title,
      description: r.description ?? '',
      fixActions: JSON.parse(r.fix_actions),
      metadata: JSON.parse(r.metadata),
      status: r.status as LintFinding['status'],
    }));
  }

  /** Load trend history (last N completed scans, no findings). */
  async loadTrendHistory(limit = 30): Promise<LintTrendPoint[]> {
    const rows = await this.db
      .selectFrom('vault_lint_scan')
      .selectAll()
      .where('completed_at', 'is not', null)
      .where('health_score', 'is not', null)
      .orderBy('started_at', 'desc')
      .limit(limit)
      .execute();

    return rows.reverse().map(r => ({
      timestamp: r.started_at,
      healthScore: r.health_score!,
      dimensions: {
        structural: r.dim_structural ?? 0,
        content: r.dim_content ?? 0,
        temporal: r.dim_temporal ?? 0,
        semantic: r.dim_semantic ?? 0,
        tags: r.dim_tags ?? 0,
      },
      totalFindings: 0, // filled from signal_counts if needed
    }));
  }

  /** Load active dismissals (not snoozed past snooze_until). */
  async loadActiveDismissals(): Promise<LintDismissal[]> {
    const now = Date.now();
    const rows = await this.db
      .selectFrom('vault_lint_dismissal')
      .selectAll()
      .where(eb => eb.or([
        eb('snooze_until', 'is', null),
        eb('snooze_until', '>', now),
      ]))
      .execute();

    return rows.map(r => ({
      signalId: r.signal_id as LintSignalId,
      filePath: r.file_path,
      dismissedAt: r.dismissed_at,
      reason: r.reason as LintDismissal['reason'],
      snoozeUntil: r.snooze_until ?? undefined,
    }));
  }

  /** Persist a new dismissal (upsert). */
  async upsertDismissal(d: LintDismissal): Promise<void> {
    await this.db
      .insertInto('vault_lint_dismissal')
      .values({
        signal_id: d.signalId,
        file_path: d.filePath,
        dismissed_at: d.dismissedAt,
        reason: d.reason ?? null,
        snooze_until: d.snoozeUntil ?? null,
      })
      .onConflict(oc => oc.columns(['signal_id', 'file_path']).doUpdateSet({
        dismissed_at: d.dismissedAt,
        reason: d.reason ?? null,
        snooze_until: d.snoozeUntil ?? null,
      }))
      .execute();
  }

  /** Mark a finding as fixed. */
  async markFindingFixed(findingId: string): Promise<void> {
    await this.db
      .updateTable('vault_lint_finding')
      .set({ status: 'fixed', fixed_at: Date.now() })
      .where('id', '=', findingId)
      .execute();
  }

  /** Get the timestamp of the last completed full scan. */
  async getLastFullScanTimestamp(): Promise<number | null> {
    const row = await this.db
      .selectFrom('vault_lint_scan')
      .select('started_at')
      .where('scan_type', '=', 'full')
      .where('completed_at', 'is not', null)
      .orderBy('started_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.started_at ?? null;
  }

  private rowToScanResult(
    row: DbSchema['vault_lint_scan'],
    findings: LintFinding[],
  ): LintScanResult {
    return {
      id: row.id,
      scanType: row.scan_type as 'full' | 'incremental',
      startedAt: row.started_at,
      completedAt: row.completed_at!,
      durationMs: row.duration_ms ?? 0,
      totalNotes: row.total_notes,
      healthScore: row.health_score ?? 0,
      dimensionScores: {
        structural: row.dim_structural ?? 0,
        content: row.dim_content ?? 0,
        temporal: row.dim_temporal ?? 0,
        semantic: row.dim_semantic ?? 0,
        tags: row.dim_tags ?? 0,
      },
      findings,
      signalCounts: JSON.parse(row.signal_counts),
    };
  }
}
```

- [ ] **Step 2: Wire `VaultLintRepo` into `SqliteStoreManager`**

In `src/core/storage/sqlite/SqliteStoreManager.ts`:

Add import at top (with other repo imports):
```typescript
import { VaultLintRepo } from './repositories/VaultLintRepo';
```

Add field (with other private search store repos, after `ambientPushRepo`):
```typescript
private vaultLintRepo: VaultLintRepo | null = null;
```

In `init()`, after `this.ambientPushRepo = new AmbientPushRepo(searchKdb);`:
```typescript
this.vaultLintRepo = new VaultLintRepo(searchKdb);
```

In `close()`, inside the null-out block:
```typescript
this.vaultLintRepo = null;
```

Add getter (with other single-tenant repo getters):
```typescript
getVaultLintRepo(): VaultLintRepo { return this.requireRepo(this.vaultLintRepo); }
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant && npm run build
```

Expected: no type errors on new repo or store manager.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/repositories/VaultLintRepo.ts src/core/storage/sqlite/SqliteStoreManager.ts
git commit -m "feat(vault-lint): add VaultLintRepo + wire into SqliteStoreManager"
```

---

## Task 3: SignalRegistry + HealthScoreEngine

**Files:**
- New: `src/service/lint/SignalRegistry.ts`
- New: `src/service/lint/HealthScoreEngine.ts`

- [ ] **Step 1: Create `src/service/lint/SignalRegistry.ts`**

```typescript
// src/service/lint/SignalRegistry.ts
import type { LintSignalDetector, LintDimension, LintSignalId } from './types';

/**
 * Global registry for lint signal detectors.
 * Detectors are registered at startup; the VaultLintService reads from this registry.
 */
export class SignalRegistry {
  private static instance: SignalRegistry | null = null;
  private detectors = new Map<LintSignalId, LintSignalDetector>();

  static getInstance(): SignalRegistry {
    if (!SignalRegistry.instance) SignalRegistry.instance = new SignalRegistry();
    return SignalRegistry.instance;
  }

  register(detector: LintSignalDetector): void {
    this.detectors.set(detector.id, detector);
  }

  getAll(): LintSignalDetector[] {
    return Array.from(this.detectors.values());
  }

  getByDimension(dimension: LintDimension): LintSignalDetector[] {
    return this.getAll().filter(d => d.dimension === dimension);
  }

  getNonLlm(): LintSignalDetector[] {
    return this.getAll().filter(d => !d.requiresLlm);
  }
}
```

- [ ] **Step 2: Create `src/service/lint/HealthScoreEngine.ts`**

Implements the spec §3.3 scoring formula. Signal weights per dimension from spec §3.4:

```typescript
// src/service/lint/HealthScoreEngine.ts
import type { LintFinding, LintDimension, LintSignalId, VaultLintConfig } from './types';

// Per-signal weight table (spec §3.4) — normalized within each dimension
const SIGNAL_WEIGHTS: Partial<Record<LintSignalId, number>> = {
  'S-ORPHAN': 0.30, 'S-BROKEN-LINK': 0.25, 'S-ISLAND-CLUSTER': 0.20,
  'S-FRAGILE-BRIDGE': 0.10, 'S-SOFT-ORPHAN': 0.10, 'S-MISSING-BACKLINK': 0.05,
  'C-EMPTY': 0.30, 'C-DUPLICATE': 0.25, 'C-OVERSIZED': 0.20,
  'C-STUB': 0.10, 'C-FRONTMATTER-MISSING': 0.05, 'C-NAMING-VIOLATION': 0.10,
  'T-STALE-HUB': 0.35, 'T-DECAYING-BRIDGE': 0.30, 'T-ABANDONED-CLUSTER': 0.20,
  'T-RECENT-DRIFT': 0.10, 'T-ABANDONED-FOLDER': 0.05,
  'M-COVERAGE-GAP': 0.30, 'M-LOW-COHESION': 0.20, 'M-CONTRADICTION': 0.20,
  'M-PHANTOM-NODE': 0.15, 'M-SEMANTIC-ISOLATION': 0.10, 'M-REDUNDANT-HUBS': 0.05,
  'G-UNTAGGED': 0.25, 'G-TAG-ISLAND': 0.25, 'G-TAG-REDUNDANCY': 0.20,
  'G-TAG-EXPLOSION': 0.20, 'G-NOISE-TAGS': 0.10,
};

const SEVERITY_MULTIPLIER: Record<string, number> = {
  error: 3.0,
  warning: 1.5,
  info: 0.5,
};

const DIMENSION_OF: Partial<Record<LintSignalId, LintDimension>> = {
  'S-ORPHAN': 'structural', 'S-SOFT-ORPHAN': 'structural',
  'S-BROKEN-LINK': 'structural', 'S-MISSING-BACKLINK': 'structural',
  'S-ISLAND-CLUSTER': 'structural', 'S-FRAGILE-BRIDGE': 'structural',
  'C-EMPTY': 'content', 'C-STUB': 'content', 'C-OVERSIZED': 'content',
  'C-DUPLICATE': 'content', 'C-FRONTMATTER-MISSING': 'content', 'C-NAMING-VIOLATION': 'content',
  'T-STALE-HUB': 'temporal', 'T-DECAYING-BRIDGE': 'temporal',
  'T-ABANDONED-CLUSTER': 'temporal', 'T-RECENT-DRIFT': 'temporal', 'T-ABANDONED-FOLDER': 'temporal',
  'M-COVERAGE-GAP': 'semantic', 'M-LOW-COHESION': 'semantic', 'M-CONTRADICTION': 'semantic',
  'M-PHANTOM-NODE': 'semantic', 'M-SEMANTIC-ISOLATION': 'semantic', 'M-REDUNDANT-HUBS': 'semantic',
  'G-UNTAGGED': 'tags', 'G-TAG-ISLAND': 'tags', 'G-TAG-REDUNDANCY': 'tags',
  'G-TAG-EXPLOSION': 'tags', 'G-NOISE-TAGS': 'tags',
};

/** Compute a single dimension's 0–100 score from its findings. */
function dimensionScore(findings: LintFinding[], totalNotes: number): number {
  if (totalNotes === 0) return 100;
  let penalty = 0;
  for (const f of findings) {
    const affectedRatio = 1 / totalNotes; // one finding = one note
    const mult = SEVERITY_MULTIPLIER[f.severity] ?? 0.5;
    const weight = SIGNAL_WEIGHTS[f.signalId] ?? 0.1;
    penalty += affectedRatio * mult * weight;
  }
  return Math.max(0, Math.round(100 * (1 - Math.min(1, penalty))));
}

/** Compute composite health score + per-dimension scores from all findings. */
export function computeHealthScore(
  findings: LintFinding[],
  totalNotes: number,
  config: VaultLintConfig,
): { healthScore: number; dimensionScores: Record<LintDimension, number> } {
  const byDimension: Record<LintDimension, LintFinding[]> = {
    structural: [], content: [], temporal: [], semantic: [], tags: [],
  };

  for (const f of findings) {
    const dim = DIMENSION_OF[f.signalId];
    if (dim) byDimension[dim].push(f);
  }

  const dimensionScores: Record<LintDimension, number> = {
    structural: dimensionScore(byDimension.structural, totalNotes),
    content: dimensionScore(byDimension.content, totalNotes),
    temporal: dimensionScore(byDimension.temporal, totalNotes),
    semantic: dimensionScore(byDimension.semantic, totalNotes),
    tags: dimensionScore(byDimension.tags, totalNotes),
  };

  const w = config.dimensionWeights;
  const healthScore = Math.round(
    dimensionScores.structural * w.structural +
    dimensionScores.content * w.content +
    dimensionScores.temporal * w.temporal +
    dimensionScores.semantic * w.semantic +
    dimensionScores.tags * w.tags,
  );

  return { healthScore, dimensionScores };
}

/** Map a score 0–100 to a human label (spec §3.5). */
export function scoreLabel(score: number): 'Excellent' | 'Good' | 'Needs Attention' | 'Critical' {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs Attention';
  return 'Critical';
}

/** Map a score to a Tailwind color class (green/blue/amber/red). */
export function scoreColorClass(score: number): string {
  if (score >= 90) return 'pktw-text-green-500';
  if (score >= 70) return 'pktw-text-blue-500';
  if (score >= 50) return 'pktw-text-amber-500';
  return 'pktw-text-red-500';
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/service/lint/SignalRegistry.ts src/service/lint/HealthScoreEngine.ts
git commit -m "feat(vault-lint): add SignalRegistry and HealthScoreEngine"
```

---

## Task 4: Signal Detectors (S-ORPHAN, S-BROKEN-LINK, C-EMPTY, C-STUB, G-UNTAGGED)

**Files:**
- New: `src/service/lint/signals/structural.ts`
- New: `src/service/lint/signals/content.ts`
- New: `src/service/lint/signals/tags.ts`

- [ ] **Step 1: Create `src/service/lint/signals/structural.ts`**

Two detectors: `S-ORPHAN` (reuses `MobiusEdgeRepo.getHardOrphans()` + `findRevivalSuggestions()` from `find-orphans.ts`) and `S-BROKEN-LINK` (uses Obsidian `metadataCache.unresolvedLinks`).

```typescript
// src/service/lint/signals/structural.ts
import { createHash } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getSemanticNeighbors } from '@/service/tools/search-graph-inspector/common';
import { isIndexedNoteNodeType } from '@/core/po/graph.po';
import type { LintSignalDetector, LintScanContext, LintFinding, OrphanMetadata, BrokenLinkMetadata } from '../types';
import { ORPHAN_FETCH_LIMIT } from '@/core/constant';

function findingId(scanSeed: string, signalId: string, filePath: string | null): string {
  return createHash('sha256').update(`${scanSeed}:${signalId}:${filePath ?? ''}`).digest('hex').slice(0, 32);
}

export const orphanDetector: LintSignalDetector = {
  id: 'S-ORPHAN',
  dimension: 'structural',
  severity: 'warning',
  signalWeight: 0.30,
  requiresLlm: false,

  async detect(context: LintScanContext): Promise<LintFinding[]> {
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();

    // Reuse existing getHardOrphans() from MobiusEdgeRepo (line 576)
    const orphanIds = await mobiusEdgeRepo.getHardOrphans(ORPHAN_FETCH_LIMIT);
    if (orphanIds.length === 0) return [];

    const nodeMap = await mobiusNodeRepo.getByIds(orphanIds);
    const orphanIdSet = new Set(orphanIds);

    const findings: LintFinding[] = [];

    for (const nodeId of orphanIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      // Check if dismissed
      const dismissalKey = `S-ORPHAN:${node.attributes ? JSON.parse(node.attributes)?.path : nodeId}`;
      if (context.dismissals.has(dismissalKey)) continue;

      // Find revival suggestion using getSemanticNeighbors (same pattern as find-orphans.ts:79)
      let revivalSuggestion: OrphanMetadata['revivalSuggestion'] | undefined;
      if (isIndexedNoteNodeType(node.type)) {
        const neighbors = await getSemanticNeighbors(nodeId, 5, orphanIdSet);
        const best = neighbors.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))[0];
        if (best) {
          const bestAttrs = best.attributes ? JSON.parse(best.attributes) : {};
          revivalSuggestion = {
            targetPath: bestAttrs?.path ?? best.id,
            targetTitle: best.label,
            similarity: parseFloat(best.similarity),
            reason: `Semantic similarity ${best.similarity}`,
          };
        }
      }

      const filePath: string | null = node.attributes ? (JSON.parse(node.attributes)?.path ?? null) : null;
      const meta: OrphanMetadata = { orphanType: 'hard', edgeCount: 0, revivalSuggestion };

      findings.push({
        id: findingId('scan', 'S-ORPHAN', filePath),
        signalId: 'S-ORPHAN',
        severity: 'warning',
        filePath,
        title: `Orphan note: ${node.label}`,
        description: 'This note has no inbound or outbound links and is unreachable from the knowledge graph.',
        fixActions: ['suggest-links', 'delete-note'],
        metadata: meta as unknown as Record<string, unknown>,
        status: 'open',
      });
    }

    return findings;
  },
};

export const brokenLinkDetector: LintSignalDetector = {
  id: 'S-BROKEN-LINK',
  dimension: 'structural',
  severity: 'error',
  signalWeight: 0.25,
  requiresLlm: false,

  async detect(context: LintScanContext): Promise<LintFinding[]> {
    // Uses Obsidian metadataCache.unresolvedLinks — direct API access (spec §2.1)
    const app = AppContext.getInstance().app;
    const unresolvedLinks = app.metadataCache.unresolvedLinks;
    const findings: LintFinding[] = [];

    for (const [sourcePath, targets] of Object.entries(unresolvedLinks)) {
      for (const brokenTarget of Object.keys(targets)) {
        if (!brokenTarget) continue;

        const dismissalKey = `S-BROKEN-LINK:${sourcePath}`;
        if (context.dismissals.has(dismissalKey)) continue;

        const meta: BrokenLinkMetadata = { sourcePath, brokenTarget };

        findings.push({
          id: findingId('scan', 'S-BROKEN-LINK', `${sourcePath}::${brokenTarget}`),
          signalId: 'S-BROKEN-LINK',
          severity: 'error',
          filePath: sourcePath,
          title: `Broken link in ${sourcePath.split('/').pop()}`,
          description: `[[${brokenTarget}]] does not resolve to any file in the vault.`,
          fixActions: ['redirect-link', 'create-note', 'remove-link'],
          metadata: meta as unknown as Record<string, unknown>,
          status: 'open',
        });
      }
    }

    return findings;
  },
};
```

- [ ] **Step 2: Create `src/service/lint/signals/content.ts`**

Two detectors: `C-EMPTY` (file size = 0 or only frontmatter) and `C-STUB` (< threshold chars after stripping).

```typescript
// src/service/lint/signals/content.ts
import { createHash } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
import type { LintSignalDetector, LintScanContext, LintFinding, VaultLintConfig } from '../types';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

function findingId(signalId: string, filePath: string): string {
  return createHash('sha256').update(`${signalId}:${filePath}`).digest('hex').slice(0, 32);
}

/** Strip YAML frontmatter + headings + whitespace; returns remaining prose length. */
function strippedLength(content: string): number {
  return content
    .replace(/^---[\s\S]*?---\n?/, '')   // strip frontmatter
    .replace(/^#{1,6}\s+.*/gm, '')        // strip headings
    .trim()
    .length;
}

export function buildContentDetectors(config: VaultLintConfig): LintSignalDetector[] {
  return [emptyDetector, buildStubDetector(config.thresholds.stubMaxChars)];
}

export const emptyDetector: LintSignalDetector = {
  id: 'C-EMPTY',
  dimension: 'content',
  severity: 'warning',
  signalWeight: 0.30,
  requiresLlm: false,

  async detect(context: LintScanContext): Promise<LintFinding[]> {
    const app = AppContext.getInstance().app;
    const files = app.vault.getMarkdownFiles();
    const findings: LintFinding[] = [];

    for (const file of files) {
      if (context.dismissals.has(`C-EMPTY:${file.path}`)) continue;

      const content = await app.vault.cachedRead(file);
      if (strippedLength(content) === 0) {
        findings.push({
          id: findingId('C-EMPTY', file.path),
          signalId: 'C-EMPTY',
          severity: 'warning',
          filePath: file.path,
          title: `Empty note: ${file.basename}`,
          description: 'This note has no prose content after removing frontmatter and headings.',
          fixActions: ['delete-note', 'draft-content'],
          metadata: {},
          status: 'open',
        });
      }
    }

    return findings;
  },
};

function buildStubDetector(stubMaxChars: number): LintSignalDetector {
  return {
    id: 'C-STUB',
    dimension: 'content',
    severity: 'info',
    signalWeight: 0.10,
    requiresLlm: false,

    async detect(context: LintScanContext): Promise<LintFinding[]> {
      const app = AppContext.getInstance().app;
      const files = app.vault.getMarkdownFiles();
      const findings: LintFinding[] = [];

      for (const file of files) {
        if (context.dismissals.has(`C-STUB:${file.path}`)) continue;

        const content = await app.vault.cachedRead(file);
        const len = strippedLength(content);
        if (len > 0 && len < stubMaxChars) {
          findings.push({
            id: findingId('C-STUB', file.path),
            signalId: 'C-STUB',
            severity: 'info',
            filePath: file.path,
            title: `Stub note: ${file.basename}`,
            description: `Only ${len} characters of prose content — consider expanding this note.`,
            fixActions: ['draft-content'],
            metadata: { charCount: len },
            status: 'open',
          });
        }
      }

      return findings;
    },
  };
}
```

- [ ] **Step 3: Create `src/service/lint/signals/tags.ts`**

`G-UNTAGGED` detector: notes with zero tags (frontmatter tags AND no inline hashtags).

```typescript
// src/service/lint/signals/tags.ts
import { createHash } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
import type { LintSignalDetector, LintScanContext, LintFinding } from '../types';

function findingId(signalId: string, filePath: string): string {
  return createHash('sha256').update(`${signalId}:${filePath}`).digest('hex').slice(0, 32);
}

export const untaggedDetector: LintSignalDetector = {
  id: 'G-UNTAGGED',
  dimension: 'tags',
  severity: 'info',
  signalWeight: 0.25,
  requiresLlm: false,

  async detect(context: LintScanContext): Promise<LintFinding[]> {
    const app = AppContext.getInstance().app;
    const files = app.vault.getMarkdownFiles();
    const findings: LintFinding[] = [];

    for (const file of files) {
      if (context.dismissals.has(`G-UNTAGGED:${file.path}`)) continue;

      const cache = app.metadataCache.getFileCache(file);
      const inlineTags = cache?.tags ?? [];
      const fmTags: string[] = (cache?.frontmatter?.tags as string[] | undefined) ?? [];

      if (inlineTags.length === 0 && fmTags.length === 0) {
        findings.push({
          id: findingId('G-UNTAGGED', file.path),
          signalId: 'G-UNTAGGED',
          severity: 'info',
          filePath: file.path,
          title: `Untagged: ${file.basename}`,
          description: 'This note has no tags — adding tags improves discoverability and clustering.',
          fixActions: ['suggest-tags'],
          metadata: {},
          status: 'open',
        });
      }
    }

    return findings;
  },
};
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/service/lint/signals/
git commit -m "feat(vault-lint): add S-ORPHAN, S-BROKEN-LINK, C-EMPTY, C-STUB, G-UNTAGGED detectors"
```

---

## Task 5: VaultLintService (Orchestrator)

**Files:**
- New: `src/service/lint/VaultLintService.ts`

- [ ] **Step 1: Create `src/service/lint/VaultLintService.ts`**

Orchestrates: load config → load dismissals → run detectors in parallel → compute score → persist → update store.

```typescript
// src/service/lint/VaultLintService.ts
import { randomUUID } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { SignalRegistry } from './SignalRegistry';
import { computeHealthScore } from './HealthScoreEngine';
import { orphanDetector, brokenLinkDetector } from './signals/structural';
import { emptyDetector, buildContentDetectors } from './signals/content';
import { untaggedDetector } from './signals/tags';
import type { VaultLintConfig, LintScanResult, LintFinding, LintScanContext } from './types';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';

const DEFAULT_CONFIG: VaultLintConfig = {
  dimensionWeights: { structural: 0.30, content: 0.20, temporal: 0.15, semantic: 0.25, tags: 0.10 },
  thresholds: {
    stubMaxChars: 100, oversizedMinWords: 5000, duplicateMinSimilarity: 0.92,
    staleHubDays: 180, staleHubMinPageRankPercentile: 75, decayingBridgeDays: 365,
    abandonedClusterDays: 180, abandonedFolderDays: 365, recentDriftActiveDays: 30,
    recentDriftStaleDays: 180, tagExplosionMultiplier: 5, softOrphanMaxDegree: 2,
    phantomNodeMinReferences: 3, contradictionMinSimilarity: 0.80,
    missingBacklinkMinSimilarity: 0.70, lowCohesionMaxDensity: 0.30,
    islandClusterMaxSize: 5, redundantHubMinOverlap: 0.70,
  },
  scan: { incrementalDebounceMs: 30000, fullScanIntervalHours: 168 },
};

export class VaultLintService {
  private static instance: VaultLintService | null = null;
  private config: VaultLintConfig = DEFAULT_CONFIG;
  private registryInitialized = false;

  static getInstance(): VaultLintService {
    if (!VaultLintService.instance) VaultLintService.instance = new VaultLintService();
    return VaultLintService.instance;
  }

  /** Register all built-in detectors. Call once at plugin startup. */
  initRegistry(): void {
    if (this.registryInitialized) return;
    const registry = SignalRegistry.getInstance();
    // Phase 1 detectors
    registry.register(orphanDetector);
    registry.register(brokenLinkDetector);
    registry.register(emptyDetector);
    // buildContentDetectors returns stub detector — register it
    for (const d of buildContentDetectors(this.config)) {
      if (d.id !== 'C-EMPTY') registry.register(d); // C-EMPTY already registered above
    }
    registry.register(untaggedDetector);
    this.registryInitialized = true;
  }

  /** Load config from template file, fall back to DEFAULT_CONFIG. */
  async loadConfig(): Promise<void> {
    try {
      const mgr = AppContext.getInstance().manager;
      const raw = await mgr.loadTemplate(ConfigTemplateId.VaultLintConfig);
      if (raw) this.config = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<VaultLintConfig>) };
    } catch {
      // Template not found — use defaults
    }
  }

  /** Run a full scan: all non-LLM detectors in parallel. */
  async runFullScan(): Promise<LintScanResult> {
    const store = useVaultLintStore.getState();
    store.setScanProgress({ detector: 'init', processed: 0, total: 0 });

    await this.loadConfig();

    const lintRepo = sqliteStoreManager.getVaultLintRepo();
    const app = AppContext.getInstance().app;
    const files = app.vault.getMarkdownFiles();
    const totalNotes = files.length;

    // Load dismissals
    const dismissalList = await lintRepo.loadActiveDismissals();
    const dismissals = new Map(dismissalList.map(d => [`${d.signalId}:${d.filePath}`, d]));

    const lastScanTimestamp = await lintRepo.getLastFullScanTimestamp();
    const context: LintScanContext = {
      totalNotes,
      allNodeIds: [],
      lastScanTimestamp,
      dismissals,
    };

    const detectors = SignalRegistry.getInstance().getNonLlm();
    const startedAt = Date.now();

    store.setScanProgress({ detector: 'scanning', processed: 0, total: detectors.length });

    // Run all non-LLM detectors in parallel
    const findingArrays = await Promise.all(
      detectors.map(d => d.detect(context).catch(err => {
        console.warn(`[VaultLintService] detector ${d.id} failed:`, err);
        return [] as LintFinding[];
      }))
    );

    const findings = findingArrays.flat();
    const completedAt = Date.now();

    const { healthScore, dimensionScores } = computeHealthScore(findings, totalNotes, this.config);

    // Build signal counts
    const signalCounts: LintScanResult['signalCounts'] = {};
    for (const f of findings) {
      signalCounts[f.signalId] = (signalCounts[f.signalId] ?? 0) + 1;
    }

    const result: LintScanResult = {
      id: randomUUID(),
      scanType: 'full',
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      totalNotes,
      healthScore,
      dimensionScores,
      findings,
      signalCounts,
    };

    await lintRepo.saveScanResult(result);

    const trend = await lintRepo.loadTrendHistory(30);
    store.setScanResult(result, trend);
    store.setScanProgress(null);

    return result;
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/service/lint/VaultLintService.ts src/service/lint/SignalRegistry.ts src/service/lint/HealthScoreEngine.ts
git commit -m "feat(vault-lint): add VaultLintService orchestrator"
```

---

## Task 6: Zustand Store + Standalone View

**Files:**
- New: `src/ui/store/vaultLintStore.ts`
- New: `src/ui/view/vault-lint/VaultXRayView.ts`
- New: `src/ui/view/vault-lint/VaultXRayPanel.tsx`
- New: `src/ui/view/vault-lint/components/ScoreRing.tsx`
- New: `src/ui/view/vault-lint/components/DimensionBars.tsx`
- New: `src/ui/view/vault-lint/components/PriorityActionsList.tsx`
- Modify: `src/app/view/types.ts`

- [ ] **Step 1: Create `src/ui/store/vaultLintStore.ts`**

Follow `ambientPushStore.ts` pattern (Zustand, no `useCallback`).

```typescript
// src/ui/store/vaultLintStore.ts
import { create } from 'zustand';
import type { LintScanResult, LintSignalId, LintTrendPoint } from '@/service/lint/types';

interface VaultLintState {
  currentScan: LintScanResult | null;
  isScanning: boolean;
  scanProgress: { detector: string; processed: number; total: number } | null;
  trendHistory: LintTrendPoint[];
  expandedSignal: LintSignalId | null;
  showInfoFindings: boolean;

  setScanResult: (scan: LintScanResult, trend: LintTrendPoint[]) => void;
  setScanProgress: (p: VaultLintState['scanProgress']) => void;
  setExpandedSignal: (id: LintSignalId | null) => void;
  setShowInfoFindings: (show: boolean) => void;
}

export const useVaultLintStore = create<VaultLintState>((set) => ({
  currentScan: null,
  isScanning: false,
  scanProgress: null,
  trendHistory: [],
  expandedSignal: null,
  showInfoFindings: false,

  setScanResult: (scan, trend) => set({ currentScan: scan, trendHistory: trend, isScanning: false }),
  setScanProgress: (p) => set({ scanProgress: p, isScanning: p !== null }),
  setExpandedSignal: (id) => set({ expandedSignal: id }),
  setShowInfoFindings: (show) => set({ showInfoFindings: show }),
}));
```

- [ ] **Step 2: Create `ScoreRing.tsx`**

```typescript
// src/ui/view/vault-lint/components/ScoreRing.tsx
import React from 'react';
import { scoreLabel, scoreColorClass } from '@/service/lint/HealthScoreEngine';

interface ScoreRingProps {
  score: number;
  lastScanAgo: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({ score, lastScanAgo }) => {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const colorClass = scoreColorClass(score);
  const label = scoreLabel(score);

  return (
    <div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-2">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="10"
          className="pktw-stroke-muted" />
        <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="10"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round" className={colorClass.replace('text', 'stroke')}
          transform="rotate(-90 64 64)" />
        <text x="64" y="60" textAnchor="middle" dominantBaseline="middle"
          className="pktw-fill-foreground" style={{ fontSize: 28, fontWeight: 700 }}>
          {score}
        </text>
        <text x="64" y="82" textAnchor="middle"
          className="pktw-fill-muted-foreground" style={{ fontSize: 11 }}>
          / 100
        </text>
      </svg>
      <span className={`pktw-text-xs pktw-font-semibold pktw-uppercase pktw-tracking-wider ${colorClass}`}>
        {label}
      </span>
      <span className="pktw-text-[10px] pktw-text-muted-foreground">{lastScanAgo}</span>
    </div>
  );
};
```

- [ ] **Step 3: Create `DimensionBars.tsx`**

```typescript
// src/ui/view/vault-lint/components/DimensionBars.tsx
import React from 'react';
import type { LintDimension } from '@/service/lint/types';
import { scoreColorClass } from '@/service/lint/HealthScoreEngine';

const DIMENSION_LABELS: Record<LintDimension, string> = {
  structural: 'Structural',
  content: 'Content',
  temporal: 'Temporal',
  semantic: 'Semantic',
  tags: 'Tags',
};

interface DimensionBarsProps {
  scores: Record<LintDimension, number>;
  onClickDimension?: (dim: LintDimension) => void;
}

export const DimensionBars: React.FC<DimensionBarsProps> = ({ scores, onClickDimension }) => (
  <div className="pktw-grid pktw-grid-cols-2 pktw-gap-x-4 pktw-gap-y-2">
    {(Object.keys(DIMENSION_LABELS) as LintDimension[]).map(dim => {
      const score = scores[dim];
      const colorClass = scoreColorClass(score);
      return (
        <div key={dim} className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer"
          onClick={() => onClickDimension?.(dim)}>
          <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-w-20 pktw-shrink-0">
            {DIMENSION_LABELS[dim]}
          </span>
          <div className="pktw-flex-1 pktw-h-1.5 pktw-rounded-full pktw-bg-muted">
            <div className={`pktw-h-full pktw-rounded-full ${colorClass.replace('text', 'bg')}`}
              style={{ width: `${score}%` }} />
          </div>
          <span className={`pktw-text-[11px] pktw-font-semibold pktw-w-6 pktw-text-right ${colorClass}`}>
            {score}
          </span>
        </div>
      );
    })}
  </div>
);
```

- [ ] **Step 4: Create `PriorityActionsList.tsx`**

Sorted severity (error → warning → info). Info collapsed by default. Uses `AlertCircle`, `AlertTriangle`, `Info` from Lucide.

```typescript
// src/ui/view/vault-lint/components/PriorityActionsList.tsx
import React from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import type { LintFinding } from '@/service/lint/types';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

const SeverityIcon: React.FC<{ severity: LintFinding['severity'] }> = ({ severity }) => {
  if (severity === 'error') return <AlertCircle className="pktw-w-4 pktw-h-4 pktw-text-red-500 pktw-shrink-0" />;
  if (severity === 'warning') return <AlertTriangle className="pktw-w-4 pktw-h-4 pktw-text-amber-500 pktw-shrink-0" />;
  return <Info className="pktw-w-4 pktw-h-4 pktw-text-blue-400 pktw-shrink-0" />;
};

interface PriorityActionsListProps {
  findings: LintFinding[];
}

export const PriorityActionsList: React.FC<PriorityActionsListProps> = ({ findings }) => {
  const { showInfoFindings, setShowInfoFindings } = useVaultLintStore();

  const sorted = [...findings].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return 0; // preserve insertion order within same severity
  });

  const visible = showInfoFindings ? sorted : sorted.filter(f => f.severity !== 'info');
  const infoCount = sorted.filter(f => f.severity === 'info').length;

  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-1">
      {visible.map(f => (
        <div key={f.id} className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3 pktw-py-2
          pktw-rounded-lg hover:pktw-bg-muted pktw-transition-colors pktw-cursor-pointer">
          <SeverityIcon severity={f.severity} />
          <span className="pktw-flex-1 pktw-text-[12px]">{f.title}</span>
        </div>
      ))}

      {!showInfoFindings && infoCount > 0 && (
        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5">
          <span className="pktw-text-[11px] pktw-text-muted-foreground">
            {infoCount} more info items
          </span>
          <Button variant="ghost" size="sm" onClick={() => setShowInfoFindings(true)}
            className="pktw-h-6 pktw-text-[11px] pktw-gap-1">
            Show all <ChevronDown className="pktw-w-3 pktw-h-3" />
          </Button>
        </div>
      )}

      {showInfoFindings && infoCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowInfoFindings(false)}
          className="pktw-self-start pktw-ml-3 pktw-h-6 pktw-text-[11px] pktw-gap-1">
          Collapse info <ChevronUp className="pktw-w-3 pktw-h-3" />
        </Button>
      )}
    </div>
  );
};
```

- [ ] **Step 5: Create `VaultXRayPanel.tsx`**

Root panel composing Score Ring + Dimension Bars + Priority Actions. Scan button triggers `VaultLintService.getInstance().runFullScan()`.

```typescript
// src/ui/view/vault-lint/VaultXRayPanel.tsx
import React from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import { VaultLintService } from '@/service/lint/VaultLintService';
import { ScoreRing } from './components/ScoreRing';
import { DimensionBars } from './components/DimensionBars';
import { PriorityActionsList } from './components/PriorityActionsList';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const VaultXRayPanel: React.FC = () => {
  const { currentScan, isScanning } = useVaultLintStore();

  const startScan = async () => {
    await VaultLintService.getInstance().runFullScan();
  };

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-y-auto">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3
        pktw-border-b pktw-border-border pktw-sticky pktw-top-0 pktw-bg-background pktw-z-10">
        <span className="pktw-text-sm pktw-font-semibold">Vault X-Ray</span>
        <Button variant="outline" size="sm" onClick={startScan} disabled={isScanning}
          className="pktw-h-7 pktw-text-[11px] pktw-gap-1.5">
          {isScanning
            ? <><Loader2 className="pktw-w-3 pktw-h-3 pktw-animate-spin" /> Scanning…</>
            : <><RefreshCw className="pktw-w-3 pktw-h-3" /> Scan Now</>
          }
        </Button>
      </div>

      {/* Body */}
      <div className="pktw-flex pktw-flex-col pktw-gap-5 pktw-p-5">
        {!currentScan && !isScanning && (
          <div className="pktw-text-center pktw-py-12 pktw-text-muted-foreground pktw-text-sm">
            <span className="pktw-block">No scan data yet.</span>
            <span className="pktw-block pktw-text-[11px] pktw-mt-1">Click Scan Now to analyze your vault.</span>
          </div>
        )}

        {currentScan && (
          <>
            {/* Score + Trend row */}
            <div className="pktw-flex pktw-gap-4 pktw-items-center">
              <ScoreRing
                score={currentScan.healthScore}
                lastScanAgo={relativeTime(currentScan.completedAt)}
              />
            </div>

            {/* Dimension Scores */}
            <div className="pktw-border pktw-border-border pktw-rounded-lg pktw-p-4">
              <span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground
                pktw-uppercase pktw-tracking-wider pktw-block pktw-mb-3">Dimension Scores</span>
              <DimensionBars scores={currentScan.dimensionScores} />
            </div>

            {/* Priority Actions */}
            <div className="pktw-border pktw-border-border pktw-rounded-lg pktw-p-4">
              <span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground
                pktw-uppercase pktw-tracking-wider pktw-block pktw-mb-3">
                Priority Actions ({currentScan.findings.filter(f => f.status === 'open').length})
              </span>
              <PriorityActionsList findings={currentScan.findings.filter(f => f.status === 'open')} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 6: Create `VaultXRayView.ts`**

Follow `AmbientPushView.ts` pattern exactly:

```typescript
// src/ui/view/vault-lint/VaultXRayView.ts
import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';

export const VAULT_XRAY_VIEW_TYPE = 'peak-vault-xray-view';

export class VaultXRayView extends ItemView {
  private reactRenderer: ReactRenderer | null = null;
  private openRafId: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly appContext: AppContext) {
    super(leaf);
  }

  getViewType(): string { return VAULT_XRAY_VIEW_TYPE; }
  getDisplayText(): string { return 'Vault X-Ray'; }
  getIcon(): IconName { return 'activity'; }

  async onOpen(): Promise<void> {
    this.containerEl.empty();
    this.containerEl.addClass('peak-vault-xray-view');
    this.reactRenderer = new ReactRenderer(this.containerEl);
    this.openRafId = requestAnimationFrame(() => {
      this.openRafId = null;
      this.render();
    });
  }

  private render(): void {
    if (!this.reactRenderer) return;
    import('./VaultXRayPanel').then(({ VaultXRayPanel }) => {
      this.reactRenderer?.render(
        createReactElementWithServices(VaultXRayPanel, {}, this.appContext),
      );
    });
  }

  async onClose(): Promise<void> {
    if (this.openRafId != null) { cancelAnimationFrame(this.openRafId); this.openRafId = null; }
    this.reactRenderer?.unmount();
    this.reactRenderer = null;
    this.containerEl.empty();
  }
}
```

- [ ] **Step 7: Update `src/app/view/types.ts`**

Add `VAULT_XRAY_VIEW_TYPE` import and export (no need to add to `TRACKED_VIEW_TYPES` — X-Ray is a standalone center view, not a layout-consistent sidebar view):

```typescript
// Add to imports at top:
import { VAULT_XRAY_VIEW_TYPE } from '@/ui/view/vault-lint/VaultXRayView';

// Add to exports:
export { VAULT_XRAY_VIEW_TYPE };
```

- [ ] **Step 8: Verify build**

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant && npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/ui/store/vaultLintStore.ts src/ui/view/vault-lint/ src/app/view/types.ts
git commit -m "feat(vault-lint): add Zustand store, VaultXRayView leaf, VaultXRayPanel + sub-components"
```

---

## Task 7: Command Registration + Service Init

**Files:**
- Modify: `src/app/commands/Register.ts`

- [ ] **Step 1: Register `Peak: Vault X-Ray` command in `Register.ts`**

In `src/app/commands/Register.ts`, add imports at the top (with existing imports):

```typescript
import { VaultXRayView, VAULT_XRAY_VIEW_TYPE } from '@/ui/view/vault-lint/VaultXRayView';
import { VaultLintService } from '@/service/lint/VaultLintService';
```

Find the function that builds and registers commands (e.g., the block that calls `plugin.addCommand(...)` multiple times). Add a new command entry:

```typescript
plugin.addCommand({
  id: 'peak-vault-xray',
  name: 'Vault X-Ray',
  callback: async () => {
    // Initialize service + registry on first use
    const lintService = VaultLintService.getInstance();
    lintService.initRegistry();

    // Open or reveal the X-Ray leaf in the center
    const existing = app.workspace.getLeavesOfType(VAULT_XRAY_VIEW_TYPE);
    if (existing.length > 0) {
      app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VAULT_XRAY_VIEW_TYPE, active: true });
  },
});
```

Also register the view type in the plugin `onload` (find where `AmbientPushView` is registered and add alongside it):

```typescript
// In the registerView block (find existing pattern in main.ts or ViewManager)
app.workspace.registerView(
  VAULT_XRAY_VIEW_TYPE,
  (leaf) => new VaultXRayView(leaf, appContext),
);
```

Check `src/app/view/ViewManager.ts` for where other views are registered — add `VaultXRayView` registration there if that's where it belongs.

- [ ] **Step 2: Verify build**

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant && npm run build
```

Expected: clean build, no type errors.

- [ ] **Step 3: Smoke test**

Using Obsidian DevTools: reload plugin, open Command Palette, run "Peak: Vault X-Ray". Verify:
- Leaf opens with the X-Ray panel
- "Scan Now" button triggers a scan
- Score ring, dimension bars, and priority actions list appear after scan completes
- No console errors

- [ ] **Step 4: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat(vault-lint): register Peak: Vault X-Ray command and VaultXRayView"
```

---

## Phase 1 Completion Checklist

After all 7 tasks are committed, verify:

- [ ] `templates/config/vault-lint-config.json` loads correctly (check TemplateManager path in DevTools)
- [ ] `VaultLintRepo` getters work: `sqliteStoreManager.getVaultLintRepo()` does not throw
- [ ] Full scan completes without hanging (check `vault_lint_scan` row in vault.sqlite)
- [ ] `S-ORPHAN` findings include revival suggestions for note-type orphans
- [ ] `S-BROKEN-LINK` findings enumerate all unresolved wikilinks from `metadataCache`
- [ ] Score ring renders correctly for all 4 health ranges (test with a mostly-orphan vault)
- [ ] Build is clean: `npm run build` exits 0 with no TS errors
