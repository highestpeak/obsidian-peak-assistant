import React from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useVaultLintRunState } from './hooks/useVaultLintRunState';
import { buildVaultHealthInsights } from '@/service/lint/insights';
import { ScoreRing } from './components/ScoreRing';
import { DimensionBars } from './components/DimensionBars';
import { HealthInsightsPanel } from './components/HealthInsightsPanel';

function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60000);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

export const VaultXRayPanel: React.FC = () => {
	// T5: runtime state (isScanning / currentScan / progress / error) is
	// projected from the RunEnvelope trace of the most recent scan in
	// this mount. There is no UI store anymore; the projection lives in
	// `useVaultLintRunState`.
	const { currentScan, isScanning, error, startScan } = useVaultLintRunState();
	const insights = currentScan ? buildVaultHealthInsights(currentScan.findings) : [];

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-y-auto">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3
				pktw-border-b pktw-border-border pktw-sticky pktw-top-0 pktw-bg-background pktw-z-10">
				<span className="pktw-text-sm pktw-font-semibold">Vault X-Ray</span>
				<Button variant="outline" size="sm" onClick={startScan} disabled={isScanning}
					className="pktw-h-7 pktw-text-[11px] pktw-gap-1.5">
					{isScanning
						? <><Loader2 className="pktw-w-3 pktw-h-3 pktw-animate-spin" /> Scanning...</>
						: <><RefreshCw className="pktw-w-3 pktw-h-3" /> Scan Now</>
					}
				</Button>
			</div>

			{/* Body */}
			<div className="pktw-flex pktw-flex-col pktw-gap-5 pktw-p-5">
				{error && !isScanning && (
					<div className="pktw-rounded-lg pktw-border pktw-border-red-500/40 pktw-bg-red-500/10
						pktw-px-4 pktw-py-3">
						<span className="pktw-block pktw-text-[11px] pktw-font-semibold pktw-uppercase
							pktw-tracking-wider pktw-text-red-500 pktw-mb-1">Scan failed</span>
						<span className="pktw-block pktw-text-[12px] pktw-text-foreground pktw-break-words">
							{error}
						</span>
					</div>
				)}

				{!currentScan && !isScanning && !error && (
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

						{/* Repair Opportunities */}
						<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-p-4">
							<span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground
								pktw-uppercase pktw-tracking-wider pktw-block pktw-mb-3">
								Repair Opportunities ({insights.length})
							</span>
							<HealthInsightsPanel insights={insights} />
						</div>
					</>
				)}
			</div>
		</div>
	);
};
