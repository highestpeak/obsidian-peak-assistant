/**
 * Peak Composer — Zod schemas for the source/block model.
 *
 * Per the project convention, only files under `src/core/schemas/` import
 * `zod/v3`; everything else consumes the pre-built schemas re-exported from
 * `@/core/schemas`. These validators mirror the TS interfaces in
 * `src/core/composer/types.ts` and are used to (a) validate snapshots that
 * cross a persistence / port boundary and (b) give WP2+ a runtime guard when
 * rehydrating a session store.
 */

import { z } from 'zod/v3';

export const ComposerBlockKindSchema = z.enum([
	'frontmatter',
	'heading',
	'paragraph',
	'list',
	'task',
	'quote',
	'callout',
	'divider',
	'code',
	'math',
	'table',
	'image',
	'mermaid',
	'dataview',
	'html',
	'comment',
	'footnote-def',
	'embed',
	'base',
	'canvas',
	'excalidraw',
	'unknown',
]);

export const ComposerUnitKindSchema = z.enum([
	'list-item',
	'table-row',
	'table-cell',
	'callout-body',
]);

export const SourceAnchorSchema = z
	.object({
		revision: z.string(),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		semanticFingerprint: z.string(),
	})
	.refine((a) => a.to >= a.from, { message: 'SourceAnchor.to must be >= from' });

export const ComposerSubBlockAnchorSchema = z
	.object({
		unitId: z.string(),
		unitKind: ComposerUnitKindSchema,
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		fingerprint: z.string(),
		parentUnitId: z.string().optional(),
		row: z.number().int().nonnegative().optional(),
		col: z.number().int().nonnegative().optional(),
		isHeader: z.boolean().optional(),
	})
	.refine((a) => a.to >= a.from, { message: 'sub-block anchor.to must be >= from' });

export const ComposerRenderModelSchema = z.object({
	raw: z.string(),
	text: z.string().optional(),
	level: z.number().int().min(1).max(6).optional(),
	ordered: z.boolean().optional(),
	checked: z.boolean().nullable().optional(),
	language: z.string().optional(),
	calloutType: z.string().optional(),
	itemCount: z.number().int().nonnegative().optional(),
	rows: z.number().int().nonnegative().optional(),
	columns: z.number().int().nonnegative().optional(),
});

export const ComposerBlockSchema = z.object({
	blockId: z.string(),
	kind: ComposerBlockKindSchema,
	source: SourceAnchorSchema,
	parentId: z.string().optional(),
	children: z.array(z.string()).readonly(),
	units: z.array(ComposerSubBlockAnchorSchema).readonly(),
	renderModel: ComposerRenderModelSchema,
});

export const ComposerNativeKindSchema = z.enum([
	'image',
	'attachment',
	'embed',
	'base',
	'canvas',
	'excalidraw',
	'unknown',
]);

export const ComposerNativeRefSchema = z.object({
	refId: z.string(),
	blockId: z.string(),
	kind: ComposerNativeKindSchema,
	target: z.string(),
	source: SourceAnchorSchema,
});

export const ComposerDocumentSnapshotSchema = z.object({
	documentId: z.string(),
	filePath: z.string(),
	revision: z.string(),
	sourceText: z.string(),
	blocks: z.array(ComposerBlockSchema).readonly(),
	nativeRefs: z.array(ComposerNativeRefSchema).readonly(),
});

// ── WP2: operations / transactions / candidates ─────────────────────────────

export const ComposerTargetSchema = z.union([
	z.object({ kind: z.literal('document'), documentId: z.string() }),
	z.object({ kind: z.literal('block'), blockId: z.string() }),
	z.object({ kind: z.literal('unit'), blockId: z.string(), unitId: z.string() }),
]);

export const ComposerOperationSchema = z.union([
	z.object({
		kind: z.literal('replaceRange'),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		text: z.string(),
	}),
	z.object({
		kind: z.literal('insertBlock'),
		at: z.number().int().nonnegative(),
		text: z.string(),
		blockKind: ComposerBlockKindSchema.optional(),
	}),
	z.object({
		kind: z.literal('removeBlock'),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal('moveBlock'),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		insertAt: z.number().int().nonnegative(),
	}),
]);

export const OperationStatsSchema = z.object({
	added: z.number().int().nonnegative(),
	removed: z.number().int().nonnegative(),
});

export const ComposerTransactionOriginSchema = z.enum([
	'direct',
	'deterministic',
	'ai',
	'system-rollback',
]);

export const ComposerTransactionSchema = z.object({
	transactionId: z.string(),
	documentId: z.string(),
	baseRevision: z.string(),
	resultRevision: z.string(),
	origin: ComposerTransactionOriginSchema,
	label: z.string(),
	operations: z.array(ComposerOperationSchema).readonly(),
	inverseOperations: z.array(ComposerOperationSchema).readonly(),
	groupId: z.string().optional(),
	runId: z.string().optional(),
	stats: OperationStatsSchema,
	target: ComposerTargetSchema.optional(),
	committedAt: z.number(),
});

export const ProposedChangeSchema = z.object({
	operations: z.array(ComposerOperationSchema).readonly(),
	result: z.unknown().optional(),
	summary: z.string().optional(),
});

export const CandidateVariantSchema = z.object({
	variantId: z.string(),
	provenance: z.enum(['initial', 'regeneration']),
	status: z.enum(['streaming', 'ready', 'failed']),
	proposedChange: ProposedChangeSchema,
	instruction: z.string().optional(),
	createdAt: z.number(),
});

export const ComposerCandidateStatusSchema = z.enum([
	'streaming',
	'ready',
	'stale',
	'accepted',
	'discarded',
	'failed',
]);

export const ComposerCandidateSchema = z.object({
	candidateId: z.string(),
	target: ComposerTargetSchema,
	baseRevision: z.string(),
	status: ComposerCandidateStatusSchema,
	variants: z.array(CandidateVariantSchema).readonly(),
	activeVariantId: z.string(),
	proposedChange: ProposedChangeSchema,
	anchorBlockId: z.string().optional(),
});

// ── WP3: capability runtime input / result payloads ─────────────────────────

/**
 * Input for instruction-driven text capabilities (polish family). The targeted
 * instruction is run context frozen into the submitted variant — never merged
 * into the candidate body.
 */
export const ComposerInstructionInputSchema = z.object({
	instruction: z.string().optional(),
});
export type ComposerInstructionInput = z.infer<typeof ComposerInstructionInputSchema>;

/**
 * Payload of a `text-patch` result envelope: the full replacement text for the
 * targeted block/unit source range. Writeback compiles it into one atomic
 * `replaceRange` operation via the text-patch adapter.
 */
export const ComposerTextPatchPayloadSchema = z.object({
	replacementText: z.string(),
});
export type ComposerTextPatchPayload = z.infer<typeof ComposerTextPatchPayloadSchema>;

// ── WP8: native object (Base / Canvas / Excalidraw) file patches ─────────────

/** The three native file formats the composer patches through a dedicated adapter. */
export const ComposerNativeFileFormatSchema = z.enum(['base', 'canvas', 'excalidraw']);
export type ComposerNativeFileFormat = z.infer<typeof ComposerNativeFileFormatSchema>;

/**
 * Payload of a `native-file-patch` result: the FULL next bytes for a native
 * object file (a separate `.base`/`.canvas` file, or the embedded-JSON slice of
 * an Excalidraw `.excalidraw.md`). Produced by the format-specific typed patch
 * adapters (never string-replace) and written back through the native-file port
 * — NOT the Markdown transaction hub — because it targets a different file.
 *
 * `unsupported` is set (with a `reason`) when the format could not be safely
 * patched (e.g. a compressed-json Excalidraw variant), so accept fails closed.
 */
export const ComposerNativeFilePatchPayloadSchema = z
	.object({
		format: ComposerNativeFileFormatSchema,
		/** Vault path of the native file (the `.excalidraw.md` host for excalidraw). */
		targetPath: z.string(),
		/** Full replacement bytes for the target file; absent when unsupported. */
		nextText: z.string().optional(),
		/** True when the patch could not be applied (compressed variant, parse error). */
		unsupported: z.boolean().optional(),
		reason: z.string().optional(),
	})
	.refine((p) => p.unsupported === true || typeof p.nextText === 'string', {
		message: 'native-file-patch: nextText is required unless unsupported',
	});
export type ComposerNativeFilePatchPayload = z.infer<typeof ComposerNativeFilePatchPayloadSchema>;

// ── WP6: table + chart typed result payloads (additive) ──────────────────────

export const ComposerTableAlignSchema = z.enum(['none', 'left', 'right', 'center']);

/**
 * Payload of a `table-patch` result envelope (handoff §10.5). A structured,
 * typed mutation of the targeted table — never a prose diff. The writeback
 * adapter applies it against the frozen table model, so the model — not a text
 * guess — decides pipe vs HTML serialization on accept.
 *
 * Variants:
 *  - `replace-cell`  — set one anchor cell's text (row/col are logical grid coords);
 *  - `set-column`    — replace/append a whole column's cell texts (补一列);
 *  - `replace-table` — supply a full new grid (row-major cell texts) plus per-column
 *                      alignment (总结重排 / 结构性补全).
 */
export const ComposerTablePatchPayloadSchema = z.union([
	z.object({
		op: z.literal('replace-cell'),
		row: z.number().int().nonnegative(),
		col: z.number().int().nonnegative(),
		text: z.string(),
	}),
	z.object({
		op: z.literal('set-column'),
		/** Logical column index; === current column count ⇒ append a new column. */
		col: z.number().int().nonnegative(),
		header: z.string(),
		cells: z.array(z.string()).readonly(),
		align: ComposerTableAlignSchema.optional(),
	}),
	z.object({
		op: z.literal('replace-table'),
		/** Row-major cell texts; row 0 is the header row. */
		grid: z.array(z.array(z.string()).readonly()).readonly(),
		align: z.array(ComposerTableAlignSchema).readonly().optional(),
	}),
]);
export type ComposerTablePatchPayload = z.infer<typeof ComposerTablePatchPayloadSchema>;

const ChartSeriesSchema = z.object({
	key: z.string(),
	label: z.string().optional(),
	color: z.string().optional(),
});

/**
 * Payload of a `chart-source` result envelope (handoff §10.6, S4 schema). The
 * fenced ```chart JSON spec generated from a table. Writeback inserts it as an
 * independent pending block; the chart renderer reads the same spec.
 */
export const ComposerChartSourcePayloadSchema = z.object({
	type: z.enum(['bar', 'line', 'pie']),
	title: z.string().optional(),
	/** Category-axis field name (bar/line). */
	x: z.string(),
	series: z.array(ChartSeriesSchema).min(1).readonly(),
	data: z.array(z.record(z.union([z.string(), z.number()]))).readonly(),
});
export type ComposerChartSourcePayload = z.infer<typeof ComposerChartSourcePayloadSchema>;
// ── WP5: frontmatter (metadata) ──────────────────────────────────────────────

/**
 * Provenance of a frontmatter field value (handoff §8.1). `program` values are
 * maintained by deterministic logic (created/updated); `ai` is a model
 * suggestion that never impersonates a program field; `convention` is a
 * rule/template-derived suggestion; `human` is author-authored.
 */
export const ComposerMetadataOriginSchema = z.enum(['program', 'human', 'ai', 'convention']);
export type ComposerMetadataOrigin = z.infer<typeof ComposerMetadataOriginSchema>;

/** Displayed value shape of a frontmatter field (handoff §8.1 — all YAML kinds). */
export const ComposerMetadataValueKindSchema = z.enum([
	'scalar',
	'list',
	'boolean',
	'date',
	'link',
	'unknown',
]);
export type ComposerMetadataValueKind = z.infer<typeof ComposerMetadataValueKindSchema>;

/** Input for the AI property-suggestion capability (§8.3). Instruction is optional context. */
export const ComposerMetadataSuggestionInputSchema = z.object({
	instruction: z.string().optional(),
});
export type ComposerMetadataSuggestionInput = z.infer<typeof ComposerMetadataSuggestionInputSchema>;

/**
 * Payload of a `metadata-field-patch` result envelope (handoff §11.4): ONE
 * frontmatter field candidate. `requiresReview` is set when accepting would
 * change the field's shape (e.g. scalar→list), which the writeback refuses to
 * do silently (§8.4). Never written to YAML without explicit confirmation (§8.3).
 */
export const ComposerMetadataFieldPatchPayloadSchema = z.object({
	key: z.string().min(1),
	value: z.union([z.string(), z.array(z.string())]),
	valueKind: ComposerMetadataValueKindSchema,
	origin: ComposerMetadataOriginSchema,
	/** Human-readable evidence/reason surfaced next to the suggestion (§8.3). */
	evidence: z.string().optional(),
	/** True when accepting changes the field's YAML shape and needs review (§8.4). */
	requiresReview: z.boolean().optional(),
});
export type ComposerMetadataFieldPatchPayload = z.infer<typeof ComposerMetadataFieldPatchPayloadSchema>;

// ── WP5: formula (math) ───────────────────────────────────────────────────────

/** The three independent formula detail kinds (handoff §10.2 / §3.3). */
export const ComposerFormulaDetailKindSchema = z.enum(['explain', 'split', 'variables']);
export type ComposerFormulaDetailKind = z.infer<typeof ComposerFormulaDetailKindSchema>;

/** One row of a formula variable table (symbol → meaning). */
export const ComposerFormulaVariableSchema = z.object({
	symbol: z.string(),
	meaning: z.string(),
});
export type ComposerFormulaVariable = z.infer<typeof ComposerFormulaVariableSchema>;

/**
 * Input for a formula detail capability. `detailKind` selects the independent
 * result family; `latex` is the frozen TeX of the ONE targeted formula (§3.3:
 * clicking PageRank's table shows PageRank only).
 */
export const ComposerFormulaDetailInputSchema = z.object({
	detailKind: ComposerFormulaDetailKindSchema,
	latex: z.string(),
	label: z.string().optional(),
	instruction: z.string().optional(),
});
export type ComposerFormulaDetailInput = z.infer<typeof ComposerFormulaDetailInputSchema>;

/**
 * Payload of a `formula-annotation` result envelope (handoff §11.4). Carries the
 * detail kind so the renderer dispatches the right layout; `text` holds the
 * explain/split narrative, `variables` holds the parsed variable table.
 */
export const ComposerFormulaAnnotationPayloadSchema = z.object({
	detailKind: ComposerFormulaDetailKindSchema,
	latex: z.string(),
	text: z.string().optional(),
	variables: z.array(ComposerFormulaVariableSchema).optional(),
});
export type ComposerFormulaAnnotationPayload = z.infer<typeof ComposerFormulaAnnotationPayloadSchema>;
