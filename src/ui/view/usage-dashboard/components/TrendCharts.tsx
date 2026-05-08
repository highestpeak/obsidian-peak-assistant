import React from 'react';
import {
	AreaChart,
	Area,
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from 'recharts';
import type { TokenTrendPoint, CostTrendPoint } from '../hooks/useUsageData';

interface TrendChartsProps {
	tokenTrend: TokenTrendPoint[];
	costTrend: CostTrendPoint[];
	loading: boolean;
}

/** Format date string (YYYY-MM-DD) to short form (MM/DD). */
function shortDate(d: string): string {
	const parts = d.split('-');
	return `${parts[1]}/${parts[2]}`;
}

/** Format large token numbers for axis. */
function formatTokenAxis(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
	return String(n);
}

/** Generate stable color for a provider name. */
const PROVIDER_COLORS = ['#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8', '#cba6f7', '#94e2d5', '#fab387', '#74c7ec'];

function getProviderColor(provider: string, idx: number): string {
	return PROVIDER_COLORS[idx % PROVIDER_COLORS.length];
}

function ChartSkeleton() {
	return (
		<div
			className="pktw-rounded-lg pktw-p-4 pktw-h-[280px] pktw-animate-pulse"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<div className="pktw-h-4 pktw-w-32 pktw-rounded pktw-mb-4" style={{ backgroundColor: 'var(--background-modifier-border)' }} />
			<div className="pktw-h-[200px] pktw-rounded" style={{ backgroundColor: 'var(--background-modifier-border)', opacity: 0.3 }} />
		</div>
	);
}

function TokenTrendChart({ data }: { data: TokenTrendPoint[] }) {
	const chartData = data.map((d) => ({
		date: shortDate(d.date),
		total: d.inputTokens + d.outputTokens,
		input: d.inputTokens,
		output: d.outputTokens,
	}));

	return (
		<div
			className="pktw-rounded-lg pktw-p-4"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<span className="pktw-text-sm pktw-font-medium pktw-mb-3 pktw-block" style={{ color: 'var(--text-normal)' }}>
				Token Usage Trend
			</span>
			<ResponsiveContainer width="100%" height={220}>
				<AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
					<defs>
						<linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="#89b4fa" stopOpacity={0.3} />
							<stop offset="95%" stopColor="#89b4fa" stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--background-modifier-border)" />
					<XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
					<YAxis tickFormatter={formatTokenAxis} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} />
					<Tooltip
						contentStyle={{
							backgroundColor: 'var(--background-primary)',
							border: '1px solid var(--background-modifier-border)',
							borderRadius: 6,
							fontSize: 12,
						}}
						labelStyle={{ color: 'var(--text-normal)' }}
					/>
					<Area type="monotone" dataKey="total" stroke="#89b4fa" fill="url(#tokenGrad)" strokeWidth={2} />
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

function CostTrendChart({ data }: { data: CostTrendPoint[] }) {
	// Pivot: group by date, with each provider as a separate key
	const providers = [...new Set(data.map((d) => d.provider))];
	const dateMap = new Map<string, Record<string, number>>();

	for (const d of data) {
		const key = shortDate(d.date);
		if (!dateMap.has(key)) dateMap.set(key, { date: key } as Record<string, number>);
		dateMap.get(key)![d.provider] = d.cost;
	}

	const chartData = Array.from(dateMap.values());

	return (
		<div
			className="pktw-rounded-lg pktw-p-4"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<span className="pktw-text-sm pktw-font-medium pktw-mb-3 pktw-block" style={{ color: 'var(--text-normal)' }}>
				Cost Trend
			</span>
			<ResponsiveContainer width="100%" height={220}>
				<LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--background-modifier-border)" />
					<XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
					<YAxis
						tickFormatter={(v: number) => `$${v.toFixed(2)}`}
						tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
						width={55}
					/>
					<Tooltip
						contentStyle={{
							backgroundColor: 'var(--background-primary)',
							border: '1px solid var(--background-modifier-border)',
							borderRadius: 6,
							fontSize: 12,
						}}
						labelStyle={{ color: 'var(--text-normal)' }}
						formatter={(value: number) => [`$${value.toFixed(4)}`, undefined]}
					/>
					<Legend wrapperStyle={{ fontSize: 11 }} />
					{providers.map((p, i) => (
						<Line
							key={p}
							type="monotone"
							dataKey={p}
							stroke={getProviderColor(p, i)}
							strokeWidth={2}
							dot={false}
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

export function TrendCharts({ tokenTrend, costTrend, loading }: TrendChartsProps) {
	if (loading) {
		return (
			<div className="pktw-grid pktw-grid-cols-1 lg:pktw-grid-cols-2 pktw-gap-4">
				<ChartSkeleton />
				<ChartSkeleton />
			</div>
		);
	}

	if (tokenTrend.length === 0 && costTrend.length === 0) return null;

	return (
		<div className="pktw-grid pktw-grid-cols-1 lg:pktw-grid-cols-2 pktw-gap-4">
			<TokenTrendChart data={tokenTrend} />
			<CostTrendChart data={costTrend} />
		</div>
	);
}
