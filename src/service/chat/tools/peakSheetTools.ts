import { z } from 'zod';

import type { PeakSheetToolPort } from '@/core/ports/PeakSheetToolPort';
import type { PeakSheetDatasetDraft, PeakSheetDatasetPatch } from '@/core/sheet';
import type { ToolDef } from '@/core/types/tool';
import { fail, ok } from '@/core/types/tool';

const cellValueSchema = z.union([
	z.string(), z.number(), z.boolean(), z.null(),
	z.object({ kind: z.enum(['vault', 'external-copy']), vaultPath: z.string(), mediaType: z.string().optional(), displayName: z.string().optional() }),
]);
const fieldSchema = z.object({
	id: z.string(), name: z.string(), type: z.enum(['text', 'number', 'date', 'singleSelect', 'checkbox', 'link', 'file']),
	width: z.number().optional(), hidden: z.boolean().optional(), formula: z.string().optional(),
	options: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().optional() })).optional(),
});
const rowSchema = z.object({ id: z.string(), cells: z.record(z.string(), cellValueSchema) });
const filterRuleSchema = z.object({
	id: z.string(), fieldId: z.string(),
	operator: z.enum(['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'isNotEmpty', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'before', 'after']),
	value: cellValueSchema.optional(),
});
const filtersSchema = z.object({ conjunction: z.enum(['all', 'any']), rules: z.array(filterRuleSchema) });
const sortsSchema = z.array(z.object({ fieldId: z.string(), direction: z.enum(['asc', 'desc']) }));
const viewBaseSchema = { id: z.string(), name: z.string(), filters: filtersSchema.optional(), sorts: sortsSchema.optional() };
const viewSchema = z.discriminatedUnion('type', [
	z.object({ ...viewBaseSchema, type: z.literal('table'), groupBy: z.string().optional(), hiddenFieldIds: z.array(z.string()).optional() }),
	z.object({ ...viewBaseSchema, type: z.literal('chart'), chartType: z.enum(['bar', 'line', 'pie']), categoryFieldId: z.string(), series: z.array(z.object({ fieldId: z.string(), aggregate: z.enum(['count', 'sum', 'average', 'min', 'max']), label: z.string().optional() })).min(1) }),
	z.object({ ...viewBaseSchema, type: z.literal('board'), laneFieldId: z.string(), titleFieldId: z.string(), cardFieldIds: z.array(z.string()).optional() }),
	z.object({ ...viewBaseSchema, type: z.literal('calendar'), dateFieldId: z.string(), titleFieldId: z.string() }),
]);
const metricSchema = z.object({ id: z.string(), fieldId: z.string().optional(), operation: z.enum(['count', 'sum', 'average', 'min', 'max']), label: z.string().optional() });
const analysisStepSchema = z.discriminatedUnion('op', [
	z.object({ op: z.literal('filter'), filters: filtersSchema }),
	z.object({ op: z.literal('sort'), sorts: sortsSchema }),
	z.object({ op: z.literal('group'), fieldId: z.string() }),
	z.object({ op: z.literal('aggregate'), metrics: z.array(metricSchema) }),
	z.object({ op: z.literal('topN'), count: z.number(), fieldId: z.string(), direction: z.enum(['asc', 'desc']).optional() }),
	z.object({ op: z.literal('dedupe'), fieldIds: z.array(z.string()) }),
	z.object({ op: z.literal('cast'), fieldId: z.string(), target: z.enum(['text', 'number', 'date', 'checkbox']) }),
	z.object({ op: z.literal('derive'), fieldId: z.string(), formula: z.string() }),
	z.object({ op: z.literal('chart'), chartType: z.enum(['bar', 'line', 'pie']), categoryFieldId: z.string(), metrics: z.array(metricSchema) }),
]);
const operationSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('setCell'), rowId: z.string(), fieldId: z.string(), value: cellValueSchema }),
	z.object({ type: z.literal('addRow'), row: rowSchema, index: z.number().optional() }),
	z.object({ type: z.literal('deleteRow'), rowId: z.string() }),
	z.object({ type: z.literal('addField'), field: fieldSchema, index: z.number().optional(), values: z.record(z.string(), cellValueSchema).optional() }),
	z.object({ type: z.literal('deleteField'), fieldId: z.string() }),
	z.object({ type: z.literal('renameField'), fieldId: z.string(), name: z.string() }),
	z.object({ type: z.literal('resizeField'), fieldId: z.string(), width: z.number() }),
	z.object({ type: z.literal('setFieldHidden'), fieldId: z.string(), hidden: z.boolean() }),
	z.object({ type: z.literal('setFieldOptions'), fieldId: z.string(), options: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().optional() })) }),
	z.object({ type: z.literal('setFieldFormula'), fieldId: z.string(), formula: z.string().optional() }),
	z.object({ type: z.literal('upsertView'), view: viewSchema }),
	z.object({ type: z.literal('deleteView'), viewId: z.string() }),
	z.object({ type: z.literal('renameDataset'), name: z.string() }),
	z.object({ type: z.literal('setDatasetDeleted'), deletedAt: z.string().optional() }),
]);

export function buildPeakSheetTools(runtime: PeakSheetToolPort): readonly ToolDef[] {
	return [listTool(runtime), queryTool(runtime), analysisTool(runtime), patchTool(runtime), createTool(runtime)];
}

function listTool(runtime: PeakSheetToolPort): ToolDef {
	return {
		name: 'peak_sheet_list', kind: 'read', source: 'local',
		description: 'List local Peak Sheet datasets with stable ids, revisions, field counts and row counts.',
		inputSchema: z.object({}),
		async execute() { return ok(runtime.listDatasets()); },
	};
}

function queryTool(runtime: PeakSheetToolPort): ToolDef {
	return {
		name: 'peak_sheet_query', kind: 'read', source: 'local',
		description: 'Read rows, fields and saved-view projection from a local Peak Sheet. Use the returned revision before analysis or mutation.',
		inputSchema: z.object({ datasetId: z.string(), viewId: z.string().optional(), limit: z.number().min(1).max(5000).optional() }),
		async execute(args: { datasetId: string; viewId?: string; limit?: number }) {
			try { return ok(runtime.query(args)); } catch (error) { return fail(message(error), false); }
		},
	};
}

function analysisTool(runtime: PeakSheetToolPort): ToolDef {
	return {
		name: 'peak_sheet_analyze', kind: 'read', source: 'local',
		description: 'Run the safe Peak Sheet analysis DSL: filter, sort, group, aggregate, topN, dedupe, cast, formula derive and chart. No arbitrary JavaScript or Python.',
		inputSchema: z.object({
			planId: z.string(), datasetId: z.string(), baseRevision: z.number().int().positive(), steps: z.array(analysisStepSchema).min(1).max(24),
			limits: z.object({ maxRows: z.number().optional(), maxGroups: z.number().optional(), maxOutputBytes: z.number().optional() }).optional(),
		}),
		async execute(args) {
			try { return ok(runtime.analyze(args)); } catch (error) { return fail(message(error), true); }
		},
	};
}

function patchTool(runtime: PeakSheetToolPort): ToolDef {
	return {
		name: 'peak_sheet_patch', kind: 'edit', source: 'local',
		description: 'Apply an atomic, revision-checked patch to a Peak Sheet. This edit requires user permission and is fully undoable.',
		inputSchema: z.object({ datasetId: z.string(), baseRevision: z.number().int().positive(), operations: z.array(operationSchema).min(1).max(200) }),
		async execute(args, ctx) {
			const patch: PeakSheetDatasetPatch = {
				patchId: `ai-patch-${crypto.randomUUID()}`, datasetId: args.datasetId, baseRevision: args.baseRevision,
				operations: args.operations, actor: { kind: 'ai', runId: ctx.loopId }, createdAt: new Date().toISOString(),
			};
			try { return ok(await runtime.applyPatch(patch)); } catch (error) { return fail(message(error), true); }
		},
	};
}

function createTool(runtime: PeakSheetToolPort): ToolDef {
	return {
		name: 'peak_sheet_create', kind: 'edit', source: 'local',
		description: 'Create a local Peak Sheet from structured fields and rows. This edit requires user permission.',
		inputSchema: z.object({ name: z.string(), fields: z.array(fieldSchema).min(1).max(100), rows: z.array(rowSchema).max(5000).default([]) }),
		async execute(args) {
			const draft: PeakSheetDatasetDraft = { ...args, diagnostics: [], source: 'ai' };
			try { return ok(await runtime.createDataset(draft)); } catch (error) { return fail(message(error), true); }
		},
	};
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
