/**
 * PPR evaluation utilities.
 *
 * Computes side-by-side metrics between baseline (no PPR) and PPR-enabled pipelines.
 * Used by the "Peak: Compare Search Results" command.
 */

export interface PPREvalMetrics {
	/** Query text evaluated. */
	query: string;
	/** Number of rank positions shifted for docs in both result sets. */
	rankDisplacement: number;
	/** Paths present in PPR results but absent in baseline (graph-discovered). */
	pprOnlyPaths: string[];
	/** Paths present in baseline but absent in PPR results (demoted out of top-K). */
	baselineOnlyPaths: string[];
	/** PPR compute overhead as fraction of total search time. */
	pprOverheadFraction: number;
	/** Wall-clock time for baseline search (ms). */
	baselineMs: number;
	/** Wall-clock time for PPR search (ms). */
	pprMs: number;
}

export function computeEvalMetrics(
	query: string,
	baselinePaths: string[],
	pprPaths: string[],
	baselineMs: number,
	pprMs: number,
): PPREvalMetrics {
	const baselineSet = new Set(baselinePaths);
	const pprSet = new Set(pprPaths);

	// Rank displacement: sum of |rank_ppr - rank_baseline| for shared docs.
	let rankDisplacement = 0;
	const baselineRank = new Map(baselinePaths.map((p, i) => [p, i + 1]));
	const pprRank = new Map(pprPaths.map((p, i) => [p, i + 1]));
	for (const [path, bRank] of baselineRank) {
		const pRank = pprRank.get(path);
		if (pRank !== undefined) {
			rankDisplacement += Math.abs(pRank - bRank);
		}
	}

	const pprOnlyPaths = pprPaths.filter(p => !baselineSet.has(p));
	const baselineOnlyPaths = baselinePaths.filter(p => !pprSet.has(p));
	const pprOverheadFraction = pprMs > 0 ? Math.max(0, (pprMs - baselineMs) / pprMs) : 0;

	return {
		query,
		rankDisplacement,
		pprOnlyPaths,
		baselineOnlyPaths,
		pprOverheadFraction,
		baselineMs,
		pprMs,
	};
}

export function formatEvalReport(m: PPREvalMetrics): string {
	const lines: string[] = [
		`PPR Evaluation: "${m.query}"`,
		`  Rank displacement: ${m.rankDisplacement} positions (lower = PPR agrees with baseline)`,
		`  PPR-only (graph-discovered): [${m.pprOnlyPaths.slice(0, 5).join(', ')}]${m.pprOnlyPaths.length > 5 ? ` +${m.pprOnlyPaths.length - 5} more` : ''}`,
		`  Baseline-only (demoted): [${m.baselineOnlyPaths.slice(0, 5).join(', ')}]${m.baselineOnlyPaths.length > 5 ? ` +${m.baselineOnlyPaths.length - 5} more` : ''}`,
		`  Latency: baseline=${m.baselineMs}ms PPR=${m.pprMs}ms overhead=${(m.pprOverheadFraction * 100).toFixed(1)}%`,
	];
	return lines.join('\n');
}
