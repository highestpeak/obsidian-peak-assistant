import React from 'react';
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from 'recharts';
import type { DailyBreakdownItem } from '../hooks/useUsageData';

interface DailyBreakdownProps {
	dailyBreakdown: DailyBreakdownItem[];
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

function formatTokenAxis(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
	return String(n);
}

function shortDate(d: string): string {
	const parts = d.split('-');
	return `${parts[1]}/${parts[2]}`;
}

export function DailyBreakdown({ dailyBreakdown, loading }: DailyBreakdownProps) {
	if (loading) {
		return (
			<div
				className="pktw-rounded-lg pktw-p-4 pktw-h-[320px] pktw-animate-pulse"
				style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
			>
				<div className="pktw-h-4 pktw-w-40 pktw-rounded pktw-mb-4" style={{ backgroundColor: 'var(--background-modifier-border)' }} />
				<div className="pktw-h-[250px] pktw-rounded" style={{ backgroundColor: 'var(--background-modifier-border)', opacity: 0.3 }} />
			</div>
		);
	}

	if (dailyBreakdown.length === 0) return null;

	// Pivot data: one row per date, feature tokens as separate keys
	const features = [...new Set(dailyBreakdown.map((d) => d.feature))];
	const dateMap = new Map<string, Record<string, number>>();

	for (const d of dailyBreakdown) {
		const key = shortDate(d.date);
		if (!dateMap.has(key)) {
			dateMap.set(key, { date: key } as Record<string, number>);
		}
		const row = dateMap.get(key)!;
		row[d.feature] = (row[d.feature] ?? 0) + d.inputTokens + d.outputTokens;
	}

	const chartData = Array.from(dateMap.values());

	return (
		<div
			className="pktw-rounded-lg pktw-p-4"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<span className="pktw-text-sm pktw-font-medium pktw-mb-3 pktw-block" style={{ color: 'var(--text-normal)' }}>
				Daily Breakdown by Feature
			</span>
			<ResponsiveContainer width="100%" height={260}>
				<BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
						formatter={(value: number) => [formatTokenAxis(value), undefined]}
					/>
					<Legend wrapperStyle={{ fontSize: 11 }} />
					{features.map((f) => (
						<Bar
							key={f}
							dataKey={f}
							stackId="tokens"
							fill={FEATURE_COLORS[f] ?? '#94e2d5'}
							radius={[0, 0, 0, 0]}
						/>
					))}
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
