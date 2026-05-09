import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { useUsageData } from './hooks/useUsageData';
import { KpiCards } from './components/KpiCards';
import { TrendCharts } from './components/TrendCharts';
import { DistributionCharts } from './components/DistributionCharts';
import { DailyBreakdown } from './components/DailyBreakdown';
import { RecentCallsTable } from './components/RecentCallsTable';
import type { TimeRange } from '@/service/usage/types';

const TIME_RANGES: { label: string; value: TimeRange }[] = [
	{ label: 'Today', value: 'today' },
	{ label: '7 Days', value: '7d' },
	{ label: '30 Days', value: '30d' },
	{ label: 'All Time', value: 'all' },
];

export function UsageDashboard() {
	const [range, setRange] = useState<TimeRange>('7d');
	const data = useUsageData(range);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-6 pktw-p-6 pktw-h-full pktw-overflow-y-auto">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<span className="pktw-text-xl pktw-font-semibold" style={{ color: 'var(--text-normal)' }}>
					Token Usage
				</span>
				<div className="pktw-flex pktw-gap-1">
					{TIME_RANGES.map((r) => (
						<Button
							key={r.value}
							variant={range === r.value ? 'default' : 'ghost'}
							size="sm"
							onClick={() => setRange(r.value)}
						>
							{r.label}
						</Button>
					))}
				</div>
			</div>

			{/* KPI Cards */}
			<KpiCards kpis={data.kpis} loading={data.loading} />

			{/* Trend Charts */}
			<TrendCharts tokenTrend={data.tokenTrend} costTrend={data.costTrend} loading={data.loading} />

			{/* Distribution Charts */}
			<DistributionCharts
				featureDist={data.featureDist}
				modelDist={data.modelDist}
				costBreakdown={data.costBreakdown}
				loading={data.loading}
			/>

			{/* Daily Breakdown */}
			<DailyBreakdown dailyBreakdown={data.dailyBreakdown} loading={data.loading} />

			{/* Recent Calls Table */}
			<RecentCallsTable range={range} />
		</div>
	);
}
