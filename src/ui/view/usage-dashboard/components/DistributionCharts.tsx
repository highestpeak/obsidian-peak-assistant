import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { FeatureDistItem, ModelDistItem, CostBreakdownItem } from '../hooks/useUsageData';

interface DistributionChartsProps {
	featureDist: FeatureDistItem[];
	modelDist: ModelDistItem[];
	costBreakdown: CostBreakdownItem[];
	loading: boolean;
}

const FEATURE_COLORS: Record<string, string> = {
	chat: '#89b4fa',
	search_analysis: '#a6e3a1',
	copilot: '#f9e2af',
	graph: '#f38ba8',
	indexing: '#cba6f7',
	internal: '#94e2d5',
};

const MODEL_COLORS = ['#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8', '#cba6f7', '#94e2d5', '#fab387', '#74c7ec'];

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

function formatCost(n: number): string {
	if (n >= 1) return `$${n.toFixed(2)}`;
	return `$${n.toFixed(4)}`;
}

function ChartSkeleton() {
	return (
		<div
			className="pktw-rounded-lg pktw-p-4 pktw-h-[300px] pktw-animate-pulse"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<div className="pktw-h-4 pktw-w-24 pktw-rounded pktw-mb-4" style={{ backgroundColor: 'var(--background-modifier-border)' }} />
			<div className="pktw-mx-auto pktw-w-[140px] pktw-h-[140px] pktw-rounded-full" style={{ backgroundColor: 'var(--background-modifier-border)', opacity: 0.3 }} />
		</div>
	);
}

interface DonutChartProps {
	title: string;
	data: Array<{ name: string; value: number; color: string }>;
	formatValue: (v: number) => string;
}

function DonutChart({ title, data, formatValue }: DonutChartProps) {
	const total = data.reduce((sum, d) => sum + d.value, 0);

	return (
		<div
			className="pktw-rounded-lg pktw-p-4 pktw-flex pktw-flex-col"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<span className="pktw-text-sm pktw-font-medium pktw-mb-3" style={{ color: 'var(--text-normal)' }}>
				{title}
			</span>
			{data.length === 0 ? (
				<div className="pktw-flex-1 pktw-flex pktw-items-center pktw-justify-center">
					<span className="pktw-text-xs" style={{ color: 'var(--text-muted)' }}>No data</span>
				</div>
			) : (
				<>
					<ResponsiveContainer width="100%" height={160}>
						<PieChart>
							<Pie
								data={data}
								dataKey="value"
								nameKey="name"
								cx="50%"
								cy="50%"
								innerRadius={40}
								outerRadius={65}
								paddingAngle={2}
								strokeWidth={0}
							>
								{data.map((entry, i) => (
									<Cell key={entry.name} fill={entry.color} />
								))}
							</Pie>
							<Tooltip
								contentStyle={{
									backgroundColor: 'var(--background-primary)',
									border: '1px solid var(--background-modifier-border)',
									borderRadius: 6,
									fontSize: 12,
								}}
								formatter={(value: number) => [formatValue(value), undefined]}
							/>
						</PieChart>
					</ResponsiveContainer>
					{/* Legend */}
					<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-mt-2">
						{data.map((entry) => (
							<div key={entry.name} className="pktw-flex pktw-items-center pktw-justify-between pktw-text-xs">
								<div className="pktw-flex pktw-items-center pktw-gap-1.5">
									<span
										className="pktw-inline-block pktw-w-2 pktw-h-2 pktw-rounded-full pktw-flex-shrink-0"
										style={{ backgroundColor: entry.color }}
									/>
									<span style={{ color: 'var(--text-muted)' }} className="pktw-truncate pktw-max-w-[120px]">
										{entry.name}
									</span>
								</div>
								<span style={{ color: 'var(--text-normal)' }} className="pktw-font-medium pktw-ml-2">
									{formatValue(entry.value)}
								</span>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}

export function DistributionCharts({ featureDist, modelDist, costBreakdown, loading }: DistributionChartsProps) {
	if (loading) {
		return (
			<div className="pktw-grid pktw-grid-cols-1 md:pktw-grid-cols-3 pktw-gap-4">
				<ChartSkeleton />
				<ChartSkeleton />
				<ChartSkeleton />
			</div>
		);
	}

	const featureData = featureDist.map((f) => ({
		name: f.feature,
		value: f.inputTokens + f.outputTokens,
		color: FEATURE_COLORS[f.feature] ?? '#94e2d5',
	}));

	const modelData = modelDist.map((m, i) => ({
		name: `${m.provider}/${m.model}`,
		value: m.inputTokens + m.outputTokens,
		color: MODEL_COLORS[i % MODEL_COLORS.length],
	}));

	const costData = costBreakdown.map((c, i) => ({
		name: c.provider,
		value: c.cost,
		color: MODEL_COLORS[i % MODEL_COLORS.length],
	}));

	return (
		<div className="pktw-grid pktw-grid-cols-1 md:pktw-grid-cols-3 pktw-gap-4">
			<DonutChart title="By Feature (Tokens)" data={featureData} formatValue={formatNumber} />
			<DonutChart title="By Provider & Model" data={modelData} formatValue={formatNumber} />
			<DonutChart title="Cost by Provider" data={costData} formatValue={formatCost} />
		</div>
	);
}
