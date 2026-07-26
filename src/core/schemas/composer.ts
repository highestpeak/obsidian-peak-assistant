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

// ── WP7: image asset / annotation / layout payloads (additive) ───────────────
// Result kinds `image-asset-candidate` / `image-annotation-patch` /
// `image-layout-patch` are already declared in the frozen capabilityContracts.
// These schemas are the payload validators the materializers / writeback
// adapters / renderers share. Additive: nothing above changes shape.

/** Supported deterministic export formats for the Converter (Canvas API only). */
export const ComposerImageFormatSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export type ComposerImageFormat = z.infer<typeof ComposerImageFormatSchema>;

/** A rectangular crop expressed in SOURCE pixel coordinates. */
export const ComposerImageCropRectSchema = z.object({
	x: z.number().nonnegative(),
	y: z.number().nonnegative(),
	width: z.number().positive(),
	height: z.number().positive(),
});
export type ComposerImageCropRect = z.infer<typeof ComposerImageCropRectSchema>;

/** A polygon point (free-crop / lasso mask), in SOURCE pixel coordinates. */
export const ComposerImagePointSchema = z.object({ x: z.number(), y: z.number() });

/**
 * A deterministic, non-destructive Converter transform. Every field is
 * optional; an empty transform is the identity. Applied by the Canvas renderer
 * (crop → rotate/straighten/flip → re-encode). Rotation is quarter-turns so the
 * pure geometry stays integral and testable in node; straighten is a free angle
 * applied in the browser renderer.
 */
export const ComposerImageTransformSchema = z
	.object({
		/** Rectangular crop in source pixels. */
		crop: ComposerImageCropRectSchema.optional(),
		/** Free-crop polygon (≥3 points); pixels outside are cleared via clip(). */
		freeCropPath: z.array(ComposerImagePointSchema).min(3).optional(),
		/** Quarter turns clockwise: 0..3. */
		rotateQuarters: z.number().int().min(0).max(3).optional(),
		/** Fine straighten angle in degrees (−45..45). */
		straightenDegrees: z.number().min(-45).max(45).optional(),
		flipHorizontal: z.boolean().optional(),
		flipVertical: z.boolean().optional(),
		format: ComposerImageFormatSchema.optional(),
		/** Lossy quality 0..1 (JPEG/WebP only; ignored for PNG). */
		quality: z.number().min(0).max(1).optional(),
		/** Strip EXIF/metadata by re-encoding from the decoded pixels (always true in practice). */
		stripMetadata: z.boolean().optional(),
	})
	.strict();
export type ComposerImageTransform = z.infer<typeof ComposerImageTransformSchema>;

/**
 * A rename-review filename model: a list of candidate base names (no extension)
 * the user can page through, plus the active index and the fixed extension.
 */
export const ComposerImageFileNameModelSchema = z.object({
	versions: z.array(z.string().min(1)).min(1),
	activeIndex: z.number().int().nonnegative(),
	extension: z.string().min(1),
});
export type ComposerImageFileNameModel = z.infer<typeof ComposerImageFileNameModelSchema>;

/** Why an image-asset candidate exists (drives the review affordances). */
export const ComposerImageAssetIntentSchema = z.enum(['paste', 'ai-edit', 'convert']);
export type ComposerImageAssetIntent = z.infer<typeof ComposerImageAssetIntentSchema>;

/**
 * Payload of an `image-asset-candidate` result: a proposed image asset (already
 * written to the vault at `assetPath`) plus preview metadata and the rename
 * model. `previewUri` is for on-screen preview ONLY (a vault resource path or a
 * transient object URL) — it is never persisted into Markdown; the accepted
 * document reference always points at the vault `assetPath`.
 */
export const ComposerImageAssetCandidatePayloadSchema = z.object({
	intent: ComposerImageAssetIntentSchema,
	/** Vault-relative path of the written asset (the reference target). */
	assetPath: z.string().min(1),
	/** Preview-only URI (resource path / object URL). Never written to Markdown. */
	previewUri: z.string(),
	mimeType: z.string().min(1),
	width: z.number().int().nonnegative().optional(),
	height: z.number().int().nonnegative().optional(),
	/** Exact output byte size (== blob.size). */
	byteSize: z.number().int().nonnegative().optional(),
	altText: z.string().optional(),
	/** Present for paste/convert intents that offer a semantic rename. */
	fileName: ComposerImageFileNameModelSchema.optional(),
});
export type ComposerImageAssetCandidatePayload = z.infer<typeof ComposerImageAssetCandidatePayloadSchema>;

/**
 * Payload of an `image-annotation-patch` result (caption / alt text). Carries
 * the human-readable caption for the renderer AND the fully-rebuilt block source
 * so the writeback is one atomic `replaceRange` over the image block's range.
 */
export const ComposerImageAnnotationPatchPayloadSchema = z.object({
	caption: z.string().optional(),
	altText: z.string().optional(),
	/** Full replacement source for the targeted image block. */
	replacementText: z.string(),
});
export type ComposerImageAnnotationPatchPayload = z.infer<typeof ComposerImageAnnotationPatchPayloadSchema>;

/** The four Markdown-embeddable multi-image layout modes. */
export const ComposerImageLayoutModeSchema = z.enum(['row', 'grid', 'hero-thumbs', 'masonry']);
export type ComposerImageLayoutMode = z.infer<typeof ComposerImageLayoutModeSchema>;

export const ComposerImageLayoutAlignmentSchema = z.enum(['start', 'center', 'end', 'stretch']);

/** One image in a multi-image layout. `path` is ALWAYS a vault attachment path — never base64. */
export const ComposerImageLayoutItemSchema = z.object({
	path: z.string().min(1),
	alt: z.string().optional(),
	caption: z.string().optional(),
});
export type ComposerImageLayoutItem = z.infer<typeof ComposerImageLayoutItemSchema>;

/** A typed multi-image layout spec (source of the embedded HTML). */
export const ComposerImageLayoutSpecSchema = z.object({
	mode: ComposerImageLayoutModeSchema,
	items: z.array(ComposerImageLayoutItemSchema).min(1),
	/** Inter-image gap in px. */
	gap: z.number().int().nonnegative().optional(),
	/** Column count for grid/masonry (ignored for row/hero-thumbs). */
	columns: z.number().int().positive().optional(),
	alignment: ComposerImageLayoutAlignmentSchema.optional(),
});
export type ComposerImageLayoutSpec = z.infer<typeof ComposerImageLayoutSpecSchema>;

/**
 * Payload of an `image-layout-patch` result: the typed layout spec plus the
 * rendered, Markdown-embeddable HTML block. The writeback replaces/inserts the
 * HTML block; `html` is deterministically derived from `layout` (no base64).
 */
export const ComposerImageLayoutPatchPayloadSchema = z.object({
	layout: ComposerImageLayoutSpecSchema,
	html: z.string().min(1),
});
export type ComposerImageLayoutPatchPayload = z.infer<typeof ComposerImageLayoutPatchPayloadSchema>;
