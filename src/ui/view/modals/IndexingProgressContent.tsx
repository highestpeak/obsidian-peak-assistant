import React, { useEffect, useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import type { PendingLlmEnrichmentProgress } from '@/service/search/support/llm-enrichment-progress-tracker';
import {
	formatDurationEstimateMs,
	formatTokenCount,
	formatUsdEstimate,
} from '@/service/search/support/llm-progress-format';

export type ProgressSubscriber = (ev: PendingLlmEnrichmentProgress) => void;

export type IndexingProgressContentProps = {
	onCancel: () => void;
	subscribe: (cb: ProgressSubscriber) => () => void;
};

function ProgressBar({ value, max }: { value: number; max: number }) {
	const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
	return (
		<div className="pktw-w-full pktw-bg-muted pktw-rounded-full pktw-h-2 pktw-overflow-hidden">
			<div
				className="pktw-bg-pk-info pktw-h-2 pktw-rounded-full pktw-transition-all pktw-duration-300"
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

function StatRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="pktw-flex pktw-justify-between pktw-py-1">
			<span className="pktw-text-xs pktw-text-muted-foreground">{label}</span>
			<span className="pktw-text-xs pktw-font-medium pktw-text-foreground">{value}</span>
		</div>
	);
}

function truncatePath(path: string, maxLen = 52): string {
	if (path.length <= maxLen) return path;
	return `…${path.slice(-(maxLen - 1))}`;
}

export function IndexingProgressContent({ onCancel, subscribe }: IndexingProgressContentProps) {
	const [ev, setEv] = useState<PendingLlmEnrichmentProgress | null>(null);

	useEffect(() => {
		const unsub = subscribe(setEv);
		return unsub;
	}, [subscribe]);

	const docsPerMin =
		ev && ev.elapsedMs > 0 ? ((ev.processed / ev.elapsedMs) * 60_000).toFixed(1) : '—';

	const tokPerSec =
		ev && ev.elapsedMs > 0
			? formatTokenCount(Math.round((ev.sumTotalTokens / ev.elapsedMs) * 1000))
			: '—';

	return (
		<div className="pktw-bg-popover pktw-rounded-xl pktw-shadow-lg pktw-p-5 pktw-w-full pktw-max-w-sm">
			<span className="pktw-block pktw-text-base pktw-font-semibold pktw-text-foreground pktw-mb-1">
				LLM Enrichment — Running
			</span>

			{!ev && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-4">
					<div className="pktw-w-4 pktw-h-4 pktw-border-2 pktw-border-border pktw-border-t-blue-500 pktw-rounded-full pktw-animate-spin" />
					<span className="pktw-text-sm pktw-text-muted-foreground">Starting...</span>
				</div>
			)}

			{ev && (
				<div className="pktw-flex pktw-flex-col pktw-gap-3">
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1">
						<span className="pktw-text-sm pktw-text-muted-foreground">
							{ev.processed} / {ev.total} docs
						</span>
						<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">
							{ev.total > 0
								? `${Math.round((ev.processed / ev.total) * 100)}%`
								: '0%'}
						</span>
					</div>

					<ProgressBar value={ev.processed} max={ev.total} />

					<div className="pktw-bg-muted pktw-rounded-lg pktw-px-3 pktw-py-2">
						<StatRow label="Speed" value={`${docsPerMin} docs/min · ${tokPerSec} tok/s`} />
						<StatRow label="ETA" value={formatDurationEstimateMs(ev.estimatedRemainingMs)} />
						<StatRow
							label="Running cost"
							value={`${formatUsdEstimate(ev.sumCostUsd)} (est. final: ${formatUsdEstimate(ev.estimatedFinalCostUsd)})`}
						/>
						<StatRow
							label="Tokens used"
							value={`${formatTokenCount(ev.sumTotalTokens)} / ~${formatTokenCount(ev.estimatedFinalTotalTokens)}`}
						/>
					</div>

					<div className="pktw-bg-muted pktw-rounded-lg pktw-px-3 pktw-py-1">
						<span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-font-mono pktw-truncate">
							{truncatePath(ev.path)}
						</span>
					</div>
				</div>
			)}

			<div className="pktw-mt-4">
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
