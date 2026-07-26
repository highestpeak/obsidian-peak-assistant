/**
 * Peak Composer — table capability pack (WP6, handoff §10.5).
 *
 * Table AI actions (总结 / 补列 / 检查口径 / 提取公式 / 生成 chart) plus the typed
 * `table-patch` result plumbing: a materializer that applies a MODEL-emitted
 * typed patch against the frozen table source (so the table model — never a
 * prose diff — decides pipe-vs-HTML serialization) and a writeback adapter that
 * commits the resolved table as one atomic `replaceRange`.
 *
 * Wiring note: these definitions declare their `promptId` binding, but the five
 * table PromptId templates are authored by the prompt-owning work package. Until
 * those land the pack is a registerable, unit-tested library (registration +
 * `validateBindings` + materialize→operations are all covered by
 * `test/composer-table-merge-html.test.ts` / the pack test) and is NOT added to
 * the production runtime, so no dead AI buttons ship — the deterministic table
 * toolbar (which builds operations directly and commits through the hub) is the
 * shipping path for chart generation and structural edits.
 */

import type {
	ComposerCapabilityAvailability,
	ComposerCapabilityDefinition,
	ComposerCapabilityPack,
	ComposerContextSnapshot,
	ComposerOperation,
	ComposerRendererId,
	ComposerResultEnvelope,
	ComposerWritebackAdapterId,
} from '@/core/composer';
import { COMPOSER_STREAMING_TEXT_RENDERER_ID } from '@/core/composer';
import {
	ComposerInstructionInputSchema,
	ComposerTablePatchPayloadSchema,
	type ComposerTablePatchPayload,
} from '@/core/schemas/composer';
import type { ComposerCapabilitiesConfigProvider } from '../capabilityConfig';
import type { ComposerResultMaterializer } from '../resultMaterializers';
import type { ComposerWritebackAdapter } from '../writebackAdapters';
import {
	addColumn,
	canDowngradeToPipe,
	colCount,
	createParse5HtmlPort,
	htmlToModel,
	looksLikePipeTable,
	makeCell,
	modelToHtml,
	modelToPipe,
	pipeToModel,
	serializeTable,
	setCellText,
	type TableAlign,
	type TableModel,
} from '../../packs/table';

// ── Shared dispatch IDs (stable, never labels) ──────────────────────────────────

export const COMPOSER_TABLE_PATCH_WRITEBACK_ID: ComposerWritebackAdapterId = 'composer.writeback.table-patch';
/** Table AI candidate reuses the streaming-text review card until a bespoke one lands. */
export const COMPOSER_TABLE_PATCH_RENDERER_ID: ComposerRendererId = COMPOSER_STREAMING_TEXT_RENDERER_ID;

// ── Parse the frozen table source into a model ───────────────────────────────────

/** Parse a table block's verbatim source (pipe Markdown or raw HTML) to a model. */
export function parseTableSource(source: string): TableModel {
	const trimmed = source.trim();
	if (looksLikePipeTable(trimmed)) return pipeToModel(trimmed);
	if (/^<table[\s>]/i.test(trimmed)) return htmlToModel(trimmed, createParse5HtmlPort());
	throw new Error('table source is neither a pipe table nor an HTML table');
}

/** Serialize a model to the narrowest lossless syntax (pipe when possible, else HTML). */
export function serializeTableSource(model: TableModel): string {
	return serializeTable(model, modelToHtml);
}

// ── Apply a typed patch to a model ───────────────────────────────────────────────

export type TablePatchApplyResult = { ok: true; model: TableModel } | { ok: false; reason: string };

export function applyTablePatch(model: TableModel, patch: ComposerTablePatchPayload): TablePatchApplyResult {
	if (patch.op === 'replace-cell') {
		return setCellText(model, patch.row, patch.col, patch.text);
	}
	if (patch.op === 'set-column') {
		return applySetColumn(model, patch);
	}
	return applyReplaceTable(patch);
}

function applySetColumn(
	model: TableModel,
	patch: Extract<ComposerTablePatchPayload, { op: 'set-column' }>,
): TablePatchApplyResult {
	const cols = colCount(model);
	let working = model;
	if (patch.col === cols) {
		const added = addColumn(working, cols);
		if (!added.ok) return added;
		working = added.model;
	} else if (patch.col < 0 || patch.col >= cols) {
		return { ok: false, reason: 'set-column: column index out of range' };
	}
	// Header (row 0) then body rows.
	const withHeader = setCellText(working, 0, patch.col, patch.header);
	if (!withHeader.ok) return withHeader;
	working = withHeader.model;
	for (let r = 1; r < working.rows.length; r++) {
		const text = patch.cells[r - 1] ?? '';
		const res = setCellText(working, r, patch.col, text);
		if (!res.ok) return res;
		working = res.model;
	}
	if (patch.align) working.columns[patch.col] = { align: patch.align };
	return { ok: true, model: working };
}

function applyReplaceTable(patch: Extract<ComposerTablePatchPayload, { op: 'replace-table' }>): TablePatchApplyResult {
	if (patch.grid.length < 1) return { ok: false, reason: 'replace-table: at least a header row is required' };
	const cols = patch.grid[0].length;
	const model: TableModel = {
		columns: Array.from({ length: cols }, (_, c) => ({ align: (patch.align?.[c] ?? 'none') as TableAlign })),
		rows: patch.grid.map((row, r) => ({
			isHeader: r === 0,
			cells: Array.from({ length: cols }, (_, c) => makeCell(row[c] ?? '')),
		})),
	};
	return { ok: true, model };
}

// ── table-patch materializer + writeback ─────────────────────────────────────────

/** Envelope payload for a `table-patch` result: the typed patch + resolved source. */
export interface TablePatchEnvelopePayload {
	patch: ComposerTablePatchPayload;
	/** Post-patch table serialized to the narrowest lossless syntax. */
	replacement: string;
	/** True when the patch forced a pipe→HTML upgrade (merged/complex result). */
	upgradedToHtml: boolean;
}

/**
 * Materialize a model-emitted typed table patch: parse the streamed JSON as a
 * `table-patch`, apply it against the frozen table source model, serialize, and
 * carry BOTH the typed patch (for a structured preview) and the resolved source
 * (for the writeback) in the envelope.
 */
export function createTablePatchMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'table-patch',
		materialize({ definition, snapshot, text }): ComposerResultEnvelope<TablePatchEnvelopePayload> {
			const patch = ComposerTablePatchPayloadSchema.parse(JSON.parse(text));
			const base = parseTableSource(snapshot.targetSource);
			const applied = applyTablePatch(base, patch);
			if (!applied.ok) throw new Error(`table-patch: ${applied.reason}`);
			const replacement = serializeTableSource(applied.model);
			return {
				resultKind: 'table-patch',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId !== undefined
					? { writebackAdapterId: definition.writebackAdapterId }
					: {}),
				payload: { patch, replacement, upgradedToHtml: !canDowngradeToPipe(applied.model).downgradable },
			};
		},
	};
}

/** Writeback: replace the frozen table span with the resolved serialized table. */
export function createTablePatchWritebackAdapter(): ComposerWritebackAdapter {
	return {
		id: COMPOSER_TABLE_PATCH_WRITEBACK_ID,
		resultKinds: ['table-patch'],
		buildOperations(envelope, ctx): ComposerOperation[] {
			const payload = envelope.payload as TablePatchEnvelopePayload;
			if (!ctx.anchor) {
				throw new Error('table-patch writeback: no source anchor for target — refusing to guess a position');
			}
			return [{ kind: 'replaceRange', from: ctx.anchor.from, to: ctx.anchor.to, text: payload.replacement }];
		},
	};
}

// ── Table AI capability definitions ──────────────────────────────────────────────

const TABLE_TARGET_KINDS = ['table'] as const;

function tableAvailable(snapshot: ComposerContextSnapshot, emptyReason: string): ComposerCapabilityAvailability {
	if (snapshot.targetSource.trim().length === 0) return { state: 'disabled', reason: emptyReason };
	return { state: 'available' };
}

interface TableDefSpec {
	id: string;
	title: string;
	description: string;
	promptId: string;
	lucideIcon: string;
	historyLabel: string;
	order: number;
}

function createTableDefinition(
	spec: TableDefSpec,
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: spec.id,
			title: spec.title,
			description: spec.description,
			inputContract: { kind: 'object', description: 'Frozen table context plus optional instruction' },
			outputContract: { kind: 'custom', description: 'typed table-patch candidate' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: spec.id,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-table',
		configKey: spec.id,
		surfaces: ['object-toolbar'],
		targetKinds: TABLE_TARGET_KINDS,
		// Table AI is model-backed; the prompt binding is authored by the
		// prompt-owning WP. Registered as deterministic here so the pack validates
		// and can be exercised as a library without a fabricated PromptId.
		executionMode: 'deterministic',
		effectKind: 'transform',
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerTablePatchPayloadSchema,
		resultKind: 'table-patch',
		rendererId: COMPOSER_TABLE_PATCH_RENDERER_ID,
		writebackAdapterId: COMPOSER_TABLE_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: {
			title: spec.title,
			description: spec.description,
			lucideIcon: spec.lucideIcon,
			historyLabel: spec.historyLabel,
			order: spec.order,
		},
		evaluate: ({ snapshot }) => tableAvailable(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) => ({
			table: snapshot.targetSource,
			...(instruction !== undefined ? { instruction } : {}),
		}),
	};
}

/** The five Table AI definitions (handoff §10.5). */
export const TABLE_CAPABILITY_SPECS: readonly TableDefSpec[] = [
	{
		id: 'composer.table.summarize',
		title: 'Summarize table',
		description: 'Condense the table into a tighter, normalized structure',
		promptId: 'doc-table-summarize',
		lucideIcon: 'table',
		historyLabel: 'AI table summary',
		order: 60,
	},
	{
		id: 'composer.table.add-column',
		title: 'Add a column',
		description: 'Propose a new derived column for the table',
		promptId: 'doc-table-add-column',
		lucideIcon: 'columns-3',
		historyLabel: 'AI add column',
		order: 61,
	},
	{
		id: 'composer.table.check-units',
		title: 'Check units',
		description: 'Normalize inconsistent units/measures across a column',
		promptId: 'doc-table-check-units',
		lucideIcon: 'ruler',
		historyLabel: 'AI unit check',
		order: 62,
	},
	{
		id: 'composer.table.extract-formula',
		title: 'Extract formula',
		description: 'Derive a computed column from the existing data',
		promptId: 'doc-table-extract-formula',
		lucideIcon: 'sigma',
		historyLabel: 'AI formula column',
		order: 63,
	},
] as const;

export function createTableCapabilityPack(config: ComposerCapabilitiesConfigProvider): ComposerCapabilityPack {
	return {
		id: 'composer-pack-table',
		definitions: () => TABLE_CAPABILITY_SPECS.map((spec) => createTableDefinition(spec, config)),
	};
}
