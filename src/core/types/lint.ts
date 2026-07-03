// Pure-data lint types shared by core repositories and the service-side
// detector pipeline. Runtime-context types (LintScanContext,
// LintSignalDetector) that hold service-internal port references stay in
// `src/service/lint/types.ts`.

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
  brokenTarget?: string;
  brokenTargets?: string[];
  brokenTargetCount?: number;
  brokenOccurrenceCount?: number;
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
    tagExplosionMultiplier: number;
  };
  scan: {
    incrementalDebounceMs: number;
    fullScanIntervalHours: number;
  };
}
