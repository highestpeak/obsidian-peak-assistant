export type LintSeverity = 'error' | 'warning' | 'info';
export type LintDimension = 'structural' | 'content' | 'temporal' | 'semantic' | 'tags';
export const LINT_DIMENSIONS: LintDimension[] = ['structural', 'content', 'temporal', 'semantic', 'tags'];

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

export interface LintSignalDetector {
	id: LintSignalId;
	dimension: LintDimension;
	severity: LintSeverity;
	signalWeight: number;
	label: string;
	description: string;
	requiresLlm: boolean;
	detect(context: LintScanContext): Promise<LintFinding[]>;
}

export interface LintScanContext {
	totalNotes: number;
	allNodeIds: string[];
	lastScanTimestamp: number | null;
	dismissals: Map<string, LintDismissal>;  // key: `${signalId}:${filePath}`
	config: VaultLintConfig;
}

export interface LintFinding {
	id: string;                     // deterministic: SHA256(scan_id + signal_id + file_path)
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

export type FixActionId =
	| 'suggest-links' | 'delete-note' | 'redirect-link' | 'create-note'
	| 'remove-link' | 'insert-backlink' | 'bridge-to-main' | 'strengthen-connections'
	| 'draft-content' | 'suggest-split' | 'merge-notes' | 'link-as-alias'
	| 'add-frontmatter' | 'rename-with-prefix'
	| 'review-update' | 'mark-current' | 'snooze' | 'archive-cluster' | 'update-neighborhood'
	| 'create-hub' | 'review-cluster' | 'reconcile-contradiction' | 'create-phantom-note'
	| 'suggest-tags' | 'merge-tag' | 'review-taxonomy';

export interface LintTrendPoint {
	timestamp: number;
	healthScore: number;
	dimensions: Record<LintDimension, number>;
	totalFindings: number;
}

export interface VaultLintConfig {
	dimensionWeights: Record<LintDimension, number>;
	thresholds: Record<string, number>;
	scan: { incrementalDebounceMs: number; fullScanIntervalHours: number; contradictionBatchSize: number; contradictionConcurrency: number };
}

export const DEFAULT_VAULT_LINT_CONFIG: VaultLintConfig = {
	dimensionWeights: { structural: 0.30, content: 0.20, temporal: 0.15, semantic: 0.25, tags: 0.10 },
	thresholds: {
		stubMaxChars: 100,
		oversizedMinWords: 5000,
		duplicateMinSimilarity: 0.92,
		duplicateMinTitleJaccard: 0.50,
		staleHubDays: 180,
		staleHubMinPageRankPercentile: 75,
		decayingBridgeDays: 365,
		abandonedClusterDays: 180,
		abandonedFolderDays: 365,
		recentDriftActiveDays: 30,
		recentDriftStaleDays: 180,
		tagExplosionMultiplier: 5,
		softOrphanMaxDegree: 2,
		phantomNodeMinReferences: 3,
		contradictionMinSimilarity: 0.80,
		missingBacklinkMinSimilarity: 0.70,
		lowCohesionMaxDensity: 0.30,
		islandClusterMaxSize: 5,
		redundantHubMinOverlap: 0.70,
	},
	scan: { incrementalDebounceMs: 30000, fullScanIntervalHours: 168, contradictionBatchSize: 20, contradictionConcurrency: 2 },
};
