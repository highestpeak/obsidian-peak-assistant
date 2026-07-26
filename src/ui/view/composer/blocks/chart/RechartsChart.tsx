import * as React from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { CHART_PALETTE, seriesColor, type ChartSpec } from '@/service/composer';

/**
 * recharts renderer for a Composer chart spec (WP6, S4). This module is loaded
 * LAZILY (`React.lazy(() => import('./RechartsChart'))`) so recharts (+394KB) is
 * only pulled when a chart actually renders. Every chart sets
 * `isAnimationActive={false}` — the composer is a static editing surface and the
 * Pie first-frame radius=0 bug (S4) is avoided outright.
 */
export default function RechartsChart({ spec }: { spec: ChartSpec }): React.ReactElement {
	return (
		<ResponsiveContainer width="100%" height="100%">
			{renderChart(spec)}
		</ResponsiveContainer>
	);
}

function renderChart(spec: ChartSpec): React.ReactElement {
	if (spec.type === 'line') return <LineFig spec={spec} />;
	if (spec.type === 'pie') return <PieFig spec={spec} />;
	return <BarFig spec={spec} />;
}

function BarFig({ spec }: { spec: ChartSpec }): React.ReactElement {
	return (
		<BarChart data={spec.data as Record<string, string | number>[]}>
			<CartesianGrid strokeDasharray="3 3" />
			<XAxis dataKey={spec.x} />
			<YAxis />
			<Tooltip />
			<Legend />
			{spec.series.map((s, i) => (
				<Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={seriesColor(spec, i)} isAnimationActive={false} />
			))}
		</BarChart>
	);
}

function LineFig({ spec }: { spec: ChartSpec }): React.ReactElement {
	return (
		<LineChart data={spec.data as Record<string, string | number>[]}>
			<CartesianGrid strokeDasharray="3 3" />
			<XAxis dataKey={spec.x} />
			<YAxis />
			<Tooltip />
			<Legend />
			{spec.series.map((s, i) => (
				<Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={seriesColor(spec, i)} isAnimationActive={false} />
			))}
		</LineChart>
	);
}

function PieFig({ spec }: { spec: ChartSpec }): React.ReactElement {
	const key = spec.series[0].key;
	return (
		<PieChart>
			<Tooltip />
			<Legend />
			<Pie data={spec.data as Record<string, string | number>[]} dataKey={key} nameKey={spec.x} cx="50%" cy="50%" outerRadius={90} isAnimationActive={false} label>
				{spec.data.map((_, i) => (
					<Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
				))}
			</Pie>
		</PieChart>
	);
}
