import React from 'react';
import {
	Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
	ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

import { groupPeakSheetRows, projectPeakSheetRows, PEAK_SHEET_DEFAULTS } from '@/core/sheet';
import type { PeakSheetChartViewDefinition, PeakSheetDatasetSnapshot } from '@/core/sheet';

export function PeakSheetChart({ snapshot, view }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetChartViewDefinition;
}): React.ReactElement {
	const rows = projectPeakSheetRows(snapshot, view.filters);
	const metrics = view.series.map((series, index) => ({
		id: `series-${index}`,
		fieldId: series.aggregate === 'count' ? undefined : series.fieldId,
		operation: series.aggregate,
		label: series.label ?? snapshot.fields.find((field) => field.id === series.fieldId)?.name ?? `Series ${index + 1}`,
	}));
	const groups = groupPeakSheetRows(rows, view.categoryFieldId, metrics, 100);
	const data = groups.map((group) => ({ category: group.key, ...group.metrics }));
	if (data.length === 0) return <div className="peak-sheet-empty">Add rows or adjust filters to render this chart.</div>;
	if (view.chartType === 'pie') {
		const metric = metrics[0];
		return (
			<div className="peak-sheet-chart-canvas">
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie data={data} dataKey={metric.id} nameKey="category" innerRadius="42%" outerRadius="72%" paddingAngle={2}>
							{data.map((_, index) => <Cell key={index} fill={PEAK_SHEET_DEFAULTS.chart.palette[index % PEAK_SHEET_DEFAULTS.chart.palette.length]} />)}
						</Pie>
						<Tooltip /><Legend />
					</PieChart>
				</ResponsiveContainer>
			</div>
		);
	}
	if (view.chartType === 'line') {
		return (
			<div className="peak-sheet-chart-canvas">
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data} margin={{ top: 24, right: 28, left: 0, bottom: 18 }}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="category" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
						{metrics.map((metric, index) => <Line key={metric.id} type="monotone" dataKey={metric.id} name={metric.label} stroke={PEAK_SHEET_DEFAULTS.chart.palette[index % PEAK_SHEET_DEFAULTS.chart.palette.length]} strokeWidth={2} />)}
					</LineChart>
				</ResponsiveContainer>
			</div>
		);
	}
	return (
		<div className="peak-sheet-chart-canvas">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={data} margin={{ top: 24, right: 28, left: 0, bottom: 18 }}>
					<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="category" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
					{metrics.map((metric, index) => <Bar key={metric.id} dataKey={metric.id} name={metric.label} fill={PEAK_SHEET_DEFAULTS.chart.palette[index % PEAK_SHEET_DEFAULTS.chart.palette.length]} radius={[3, 3, 0, 0]} />)}
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
