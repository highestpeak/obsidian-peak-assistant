import React, { useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import { VaultLintService } from '@/service/lint/VaultLintService';
import { ScoreRing } from './components/ScoreRing';
import { DimensionBars } from './components/DimensionBars';
import { PriorityActionsList } from './components/PriorityActionsList';

export function VaultXRayApp() {
	const currentScan = useVaultLintStore((s) => s.currentScan);
	const isScanning = useVaultLintStore((s) => s.isScanning);
	const trendHistory = useVaultLintStore((s) => s.trendHistory);
	const setScanResult = useVaultLintStore((s) => s.setScanResult);
	const setScanning = useVaultLintStore((s) => s.setScanning);
	const setTrendHistory = useVaultLintStore((s) => s.setTrendHistory);

	useEffect(() => {
		loadLatestResult();
	}, []);

	async function loadLatestResult() {
		try {
			const service = new VaultLintService();
			const result = await service.getLatestResult();
			if (result) {
				setScanResult(result);
			}
			const trend = await service.getTrendData();
			setTrendHistory(trend);
		} catch (e) {
			console.error('[VaultXRayApp] Failed to load latest result:', e);
		}
	}

	async function handleScan() {
		setScanning(true);
		try {
			const service = new VaultLintService();
			const result = await service.runFullScan();
			setScanResult(result);
			const trend = await service.getTrendData();
			setTrendHistory(trend);
		} catch (e) {
			console.error('[VaultXRayApp] Scan failed:', e);
			setScanning(false);
		}
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-3 pktw-border-b pktw-border-border">
				<span className="pktw-text-base pktw-font-semibold">Vault X-Ray</span>
				<Button
					variant="outline"
					size="sm"
					disabled={isScanning}
					onClick={handleScan}
				>
					{isScanning ? (
						<Loader2 className="pktw-h-4 pktw-w-4 pktw-mr-1.5 pktw-animate-spin" />
					) : (
						<RefreshCw className="pktw-h-4 pktw-w-4 pktw-mr-1.5" />
					)}
					{isScanning ? 'Scanning...' : 'Scan Now'}
				</Button>
			</div>

			{/* Content */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-px-4 pktw-py-3 pktw-space-y-4">
				{!currentScan && !isScanning && <EmptyState onScan={handleScan} />}

				{isScanning && !currentScan && (
					<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-gap-3">
						<Loader2 className="pktw-h-8 pktw-w-8 pktw-animate-spin pktw-text-muted-foreground" />
						<span className="pktw-text-sm pktw-text-muted-foreground">Running health check...</span>
					</div>
				)}

				{currentScan && (
					<>
						<ScoreRing
							score={currentScan.healthScore}
							lastScanTimestamp={currentScan.completedAt}
							trendHistory={trendHistory}
						/>
						<DimensionBars scan={currentScan} />
						<PriorityActionsList scan={currentScan} />

						{/* Footer stats */}
						<div className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-py-2 pktw-border-t pktw-border-border">
							{currentScan.totalNotes} notes scanned
							{currentScan.durationMs > 0 && (
								<span> in {(currentScan.durationMs / 1000).toFixed(1)}s</span>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function EmptyState({ onScan }: { onScan: () => void }) {
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-16 pktw-gap-4">
			<span className="pktw-text-sm pktw-text-muted-foreground pktw-text-center">
				No health scan data yet. Run a scan to analyze your vault.
			</span>
			<Button variant="outline" size="sm" onClick={onScan}>
				<RefreshCw className="pktw-h-4 pktw-w-4 pktw-mr-1.5" />
				Run First Scan
			</Button>
		</div>
	);
}
