import React, { useEffect, useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import type { BulkCostEstimate } from '@/service/search/support/cost-estimator';
import {
	formatDurationEstimateMs,
	formatTokenCount,
	formatUsdEstimate,
} from '@/service/search/support/llm-progress-format';

export type CostEstimationContentProps = {
	onRun: () => void;
	onSkip: () => void;
	onCancel: () => void;
	estimatePromise: Promise<BulkCostEstimate>;
};

function EstimateRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="pktw-flex pktw-justify-between pktw-py-1 pktw-border-b pktw-border-border last:pktw-border-0">
			<span className="pktw-text-sm pktw-text-muted-foreground">{label}</span>
			<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">{value}</span>
		</div>
	);
}

function LoadingSpinner() {
	return (
		<div className="pktw-flex pktw-items-center pktw-justify-center pktw-py-6 pktw-gap-2">
			<div className="pktw-w-4 pktw-h-4 pktw-border-2 pktw-border-border pktw-border-t-blue-500 pktw-rounded-full pktw-animate-spin" />
			<span className="pktw-text-sm pktw-text-muted-foreground">Calculating estimate...</span>
		</div>
	);
}

export function CostEstimationContent({ onRun, onSkip, onCancel, estimatePromise }: CostEstimationContentProps) {
	const [estimate, setEstimate] = useState<BulkCostEstimate | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		estimatePromise
			.then(setEstimate)
			.catch((e: unknown) => setError((e as Error).message ?? String(e)));
	}, [estimatePromise]);

	return (
		<div className="pktw-bg-popover pktw-rounded-xl pktw-shadow-lg pktw-p-5 pktw-w-full pktw-max-w-sm">
			<span className="pktw-block pktw-text-base pktw-font-semibold pktw-text-foreground pktw-mb-1">
				LLM Enrichment — Cost Estimate
			</span>
			<span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-mb-4">
				Review the estimated cost before running LLM enrichment on pending documents.
			</span>

			{!estimate && !error && <LoadingSpinner />}

			{error && (
				<span className="pktw-block pktw-text-sm pktw-text-red-600 pktw-mb-4">
					Failed to calculate estimate: {error}
				</span>
			)}

			{estimate && estimate.totalDocs > 0 && (
				<div className="pktw-bg-muted pktw-rounded-lg pktw-px-3 pktw-py-2 pktw-mb-4">
					<EstimateRow label="Documents" value={String(estimate.totalDocs)} />
					<EstimateRow
						label="Input tokens"
						value={formatTokenCount(estimate.totalInputTokens)}
					/>
					<EstimateRow
						label="Output tokens"
						value={formatTokenCount(estimate.totalOutputTokens)}
					/>
					<EstimateRow
						label="Estimated cost"
						value={formatUsdEstimate(estimate.totalCostUsd)}
					/>
					<EstimateRow
						label="Estimated time"
						value={formatDurationEstimateMs(estimate.estimatedDurationMs)}
					/>
				</div>
			)}

			{estimate?.totalDocs === 0 && (
				<span className="pktw-block pktw-text-sm pktw-text-muted-foreground pktw-mb-4">
					No pending documents found.
				</span>
			)}

			<div className="pktw-flex pktw-flex-col pktw-gap-2">
				{(!estimate || estimate.totalDocs > 0) && (
					<>
						<Button
							onClick={onRun}
							disabled={!estimate}
							className="pktw-w-full pktw-text-sm pktw-font-medium"
						>
							Run with LLM
						</Button>
						<Button
							onClick={onSkip}
							variant="outline"
							disabled={!estimate}
							className="pktw-w-full pktw-text-sm pktw-font-medium"
						>
							Skip LLM enrichment
						</Button>
					</>
				)}
				<Button
					onClick={onCancel}
					variant="ghost"
					className="pktw-w-full pktw-text-sm pktw-text-muted-foreground"
				>
					Cancel
				</Button>
			</div>
		</div>
	);
}
