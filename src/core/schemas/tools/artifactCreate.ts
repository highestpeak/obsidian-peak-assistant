/**
 * `artifact_create` tool input schema — Chat Studio zero-gap Track D
 * (2026-07-21). Registers 5 structured artifact producers:
 *
 *   • dataview    — DQL or dataviewjs query note (Dataview community plugin)
 *   • excalidraw  — Excalidraw scene (renders in Excalidraw plugin)
 *   • drawio      — draw.io XML diagram
 *   • extract     — user-editable Markdown extract (highlights, notes, snippets)
 *   • reminder    — persisted reminder note the ReminderSchedulerService watches
 *
 * The producer service (`src/service/chat/artifacts/artifactProducers.ts`)
 * validates per-type payloads, saves the file under a ChatFolder subfolder,
 * and emits a persistent ChatArtifactReceipt. `kind: 'edit'` on the ToolDef
 * routes every call through PermissionGuard's ask path.
 *
 * The schema is a Zod discriminated union so the model gets a clear
 * per-type shape; type-safe access is available via `ArtifactCreateInput`.
 */

import { z } from 'zod';

const commonFields = {
	title: z
		.string()
		.min(1)
		.describe(
			'Short human-readable title used for the receipt card and the filename basename. Keep under 60 chars.',
		),
};

// ── dataview ─────────────────────────────────────────────────────────────────

export const artifactDataviewSchema = z.object({
	type: z.literal('dataview'),
	...commonFields,
	flavor: z
		.enum(['dql', 'dataviewjs'])
		.describe(
			'`dql` = DQL query (TABLE/LIST/TASK/CALENDAR); `dataviewjs` = JavaScript block via `dv.pages(...)`.',
		),
	query: z.string().min(1).describe(
		'The query body. For DQL: start with TABLE/LIST/TASK/CALENDAR keyword. ' +
		'For dataviewjs: JavaScript that calls the injected `dv` API.',
	),
	note: z
		.string()
		.optional()
		.describe('Optional prose note added above the query fence (Markdown, user-editable).'),
});
export type ArtifactDataviewInput = z.infer<typeof artifactDataviewSchema>;

// ── excalidraw ───────────────────────────────────────────────────────────────

export const artifactExcalidrawSchema = z.object({
	type: z.literal('excalidraw'),
	...commonFields,
	elementsJson: z
		.string()
		.min(2)
		.describe(
			'The Excalidraw scene JSON as a string. Must parse to an object with an `elements` array. ' +
			'The producer wraps it into the Excalidraw plugin `.excalidraw.md` frontmatter/fence format.',
		),
});
export type ArtifactExcalidrawInput = z.infer<typeof artifactExcalidrawSchema>;

// ── drawio ───────────────────────────────────────────────────────────────────

export const artifactDrawioSchema = z.object({
	type: z.literal('drawio'),
	...commonFields,
	xml: z
		.string()
		.min(1)
		.describe(
			'The draw.io diagram XML. Must contain an `<mxfile>` or `<mxGraphModel>` root element.',
		),
});
export type ArtifactDrawioInput = z.infer<typeof artifactDrawioSchema>;

// ── extract ──────────────────────────────────────────────────────────────────

export const artifactExtractSchema = z.object({
	type: z.literal('extract'),
	...commonFields,
	content: z
		.string()
		.min(1)
		.describe('The extract body as Markdown. Rendered as a user-editable note.'),
	sourceMessageIds: z
		.array(z.string())
		.optional()
		.describe(
			'Optional list of message ids in THIS conversation the extract was drawn from. ' +
			'Used to embed backlinks — do NOT invent ids.',
		),
	sourceRefs: z
		.array(z.string())
		.optional()
		.describe(
			'Optional vault paths / wikilinks the extract was drawn from. Must only reference ' +
			'context the user explicitly attached this turn — do NOT invent paths.',
		),
});
export type ArtifactExtractInput = z.infer<typeof artifactExtractSchema>;

// ── reminder ─────────────────────────────────────────────────────────────────

export const artifactReminderSchema = z.object({
	type: z.literal('reminder'),
	...commonFields,
	dueIso: z
		.string()
		.min(1)
		.describe(
			'ISO-8601 timestamp (with timezone) when the reminder should fire, e.g. 2026-07-22T09:00:00+08:00. ' +
			'Must be a real absolute time — do NOT emit vague strings like "tomorrow".',
		),
	note: z.string().optional().describe('Optional prose body for the reminder note.'),
});
export type ArtifactReminderInput = z.infer<typeof artifactReminderSchema>;

// ── discriminated union ──────────────────────────────────────────────────────

export const artifactCreateInputSchema = z.discriminatedUnion('type', [
	artifactDataviewSchema,
	artifactExcalidrawSchema,
	artifactDrawioSchema,
	artifactExtractSchema,
	artifactReminderSchema,
]);
export type ArtifactCreateInput = z.infer<typeof artifactCreateInputSchema>;

/** Coarse type surfaced in receipt kind / label mapping. */
export type ArtifactCreateType = ArtifactCreateInput['type'];
