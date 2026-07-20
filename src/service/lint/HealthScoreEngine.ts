import type { LintFinding, LintDimension, LintSignalId, VaultLintConfig } from './types';

// Per-signal weight table (spec section 3.4) — normalized within each dimension
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

/** Compute a single dimension's 0-100 score from its findings. */
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

/** Map a score 0-100 to a human label. */
export function scoreLabel(score: number): 'Excellent' | 'Good' | 'Needs Attention' | 'Critical' {
	if (score >= 90) return 'Excellent';
	if (score >= 70) return 'Good';
	if (score >= 50) return 'Needs Attention';
	return 'Critical';
}

/** Map a score to a semantic color class (success/info/warning/error — dark-adaptive). */
export function scoreColorClass(score: number): string {
	if (score >= 90) return 'pktw-text-pk-success';
	if (score >= 70) return 'pktw-text-pk-info';
	if (score >= 50) return 'pktw-text-pk-warning';
	return 'pktw-text-pk-error';
}
