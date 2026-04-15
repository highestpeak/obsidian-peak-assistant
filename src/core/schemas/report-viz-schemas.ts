import { z } from 'zod/v3';

// Graph (relationship/concept map) — rendered by @xyflow/react + dagre
export const graphNodeSchema = z.object({
	id: z.string(),
	label: z.string().max(40),
	group: z.string().optional(),
});

export const graphEdgeSchema = z.object({
	source: z.string(),
	target: z.string(),
	label: z.string().max(30).optional(),
});

export const graphVizDataSchema = z.object({
	nodes: z.array(graphNodeSchema).min(2).max(20),
	edges: z.array(graphEdgeSchema).max(30),
});

// Bar chart — rendered by recharts
export const chartItemSchema = z.object({
	name: z.string(),
	value: z.number(),
	value2: z.number().optional(),
});

export const barChartDataSchema = z.object({
	items: z.array(chartItemSchema).min(1).max(20),
	xLabel: z.string().optional(),
	yLabel: z.string().optional(),
	y2Label: z.string().optional(),
});

// Comparison table
export const comparisonTableDataSchema = z.object({
	headers: z.array(z.string()).min(2).max(10),
	rows: z.array(z.array(z.string()).min(1)).min(1).max(20),
	highlightColumn: z.number().int().min(0).optional(),
});

// Timeline
export const timelineEventSchema = z.object({
	date: z.string(),
	title: z.string().max(60),
	description: z.string().max(200).optional(),
});

export const timelineDataSchema = z.object({
	events: z.array(timelineEventSchema).min(2).max(15),
});

// Discriminated union
export const graphVizSpecSchema = z.object({
	vizType: z.literal('graph'),
	title: z.string(),
	data: graphVizDataSchema,
});

export const barVizSpecSchema = z.object({
	vizType: z.literal('bar'),
	title: z.string(),
	data: barChartDataSchema,
});

export const tableVizSpecSchema = z.object({
	vizType: z.literal('table'),
	title: z.string(),
	data: comparisonTableDataSchema,
});

export const timelineVizSpecSchema = z.object({
	vizType: z.literal('timeline'),
	title: z.string(),
	data: timelineDataSchema,
});

export const vizSpecSchema = z.discriminatedUnion('vizType', [
	graphVizSpecSchema,
	barVizSpecSchema,
	tableVizSpecSchema,
	timelineVizSpecSchema,
]);

export type GraphVizData = z.infer<typeof graphVizDataSchema>;
export type BarChartData = z.infer<typeof barChartDataSchema>;
export type ComparisonTableData = z.infer<typeof comparisonTableDataSchema>;
export type TimelineData = z.infer<typeof timelineDataSchema>;
export type VizSpec = z.infer<typeof vizSpecSchema>;
