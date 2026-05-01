import type {
	LintDimension,
	LintFinding,
	LintSeverity,
	LintSignalDetector,
	LintSignalId,
	VaultLintConfig,
} from './types';
import { LINT_DIMENSIONS } from './types';

interface SignalDef {
	id: LintSignalId;
	dimension: LintDimension;
	severity: LintSeverity;
	signalWeight: number;
}

const SEVERITY_MULTIPLIER: Record<LintSeverity, number> = {
	error: 3.0,
	warning: 1.5,
	info: 0.5,
};

/**
 * Computes per-dimension and overall vault health scores from lint findings.
 *
 * Formula per dimension:
 *   penalty = SUM( (affectedCount / totalNotes) * severityMultiplier * signalWeight )
 *   score = max(0, round(100 * (1 - min(1, penalty))))
 *
 * Overall = weighted sum of dimension scores using config weights.
 */
export class HealthScoreEngine {
	private readonly signalDefs: Map<LintSignalId, SignalDef>;
	private readonly dimensionWeights: Record<LintDimension, number>;

	constructor(detectors: LintSignalDetector[], config: VaultLintConfig) {
		this.signalDefs = new Map();
		for (const d of detectors) {
			this.signalDefs.set(d.id, {
				id: d.id,
				dimension: d.dimension,
				severity: d.severity,
				signalWeight: d.signalWeight,
			});
		}
		this.dimensionWeights = config.dimensionWeights;
	}

	compute(findings: LintFinding[], totalNotes: number): {
		healthScore: number;
		dimensionScores: Record<LintDimension, number>;
	} {
		// Count affected items per signal
		const signalCounts = new Map<LintSignalId, number>();
		for (const f of findings) {
			signalCounts.set(f.signalId, (signalCounts.get(f.signalId) ?? 0) + 1);
		}

		// Compute per-dimension score
		const dimensionScores = {} as Record<LintDimension, number>;
		for (const dim of LINT_DIMENSIONS) {
			const dimSignals: { signalWeight: number; severity: LintSeverity; affectedCount: number }[] = [];
			for (const [signalId, def] of this.signalDefs) {
				if (def.dimension !== dim) continue;
				const count = signalCounts.get(signalId) ?? 0;
				if (count > 0) {
					dimSignals.push({
						signalWeight: def.signalWeight,
						severity: def.severity,
						affectedCount: count,
					});
				}
			}
			dimensionScores[dim] = dimensionScore(dimSignals, totalNotes);
		}

		// Overall = weighted sum
		let overall = 0;
		for (const dim of LINT_DIMENSIONS) {
			overall += dimensionScores[dim] * (this.dimensionWeights[dim] ?? 0);
		}

		return {
			healthScore: Math.round(overall),
			dimensionScores,
		};
	}
}

function dimensionScore(
	signals: { signalWeight: number; severity: LintSeverity; affectedCount: number }[],
	totalNotes: number,
): number {
	if (totalNotes === 0) return 100;
	let penalty = 0;
	for (const signal of signals) {
		const affectedRatio = signal.affectedCount / totalNotes;
		const severityMultiplier = SEVERITY_MULTIPLIER[signal.severity];
		penalty += affectedRatio * severityMultiplier * signal.signalWeight;
	}
	return Math.max(0, Math.round(100 * (1 - Math.min(1, penalty))));
}
