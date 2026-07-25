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
