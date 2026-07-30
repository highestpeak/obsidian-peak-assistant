import React, { useMemo } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { V2Section } from '@/core/search/v2SessionTypes';
import type { V2Source, V2ToolStep } from '@/core/search/v2ToolTypes';
import { deriveAnalysisActivityMetrics } from '@/service/search/activityMetrics';

function metricValue(value: number | null, kind?: 'duration' | 'characters'): string {
	if (value === null) return '—';
	if (kind === 'duration') {
		if (value < 1000) return `${Math.max(1, Math.round(value))} ms`;
		return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
	}
	if (kind === 'characters') return value.toLocaleString();
	return value.toLocaleString();
}

export const V2ActivitySummary: React.FC<{
	steps: V2ToolStep[];
	sections: V2Section[];
	sources: V2Source[];
	duration: number | null;
	running: boolean;
}> = ({ steps, sections, sources, duration, running }) => {
	const metrics = useMemo(
		() => deriveAnalysisActivityMetrics(steps, sections, sources, duration),
		[steps, sections, sources, duration],
	);
	const items = [
		{ label: 'Elapsed', value: metricValue(metrics.durationMs, 'duration') },
		{ label: 'Folders mapped', value: metricValue(metrics.foldersScanned) },
		{ label: 'Files considered', value: metricValue(metrics.filesConsidered) },
		{ label: 'Files read', value: metricValue(metrics.filesRead) },
		{ label: 'Characters read', value: metricValue(metrics.charactersRead, 'characters') },
		{ label: 'Sources cited', value: metricValue(metrics.sourcesCited) },
	];

	if (steps.length === 0 && !running) return null;

	return (
		<div className="pktw-mt-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface-raised pktw-overflow-hidden">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-border-b pktw-border-pk-border">
				{running
					? <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent pktw-animate-spin" />
					: <CheckCircle2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-success" />}
				<span className="pktw-text-xs pktw-font-semibold pktw-text-pk-text-primary">
					{running ? 'Collecting evidence' : 'Evidence ready'}
				</span>
				<span className="pktw-text-pk-xs pktw-text-pk-foreground-muted">
					Derived from this run
				</span>
			</div>
			<div className="pktw-grid pktw-grid-cols-3 lg:pktw-grid-cols-6">
				{items.map((item) => (
					<div key={item.label} className="pktw-px-3 pktw-py-2.5 pktw-border-r last:pktw-border-r-0 pktw-border-pk-border">
						<span className="pktw-block pktw-text-sm pktw-font-semibold pktw-tabular-nums pktw-text-pk-text-primary">
							{item.value}
						</span>
						<span className="pktw-block pktw-text-pk-xs pktw-text-pk-foreground-muted pktw-mt-0.5">
							{item.label}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};
