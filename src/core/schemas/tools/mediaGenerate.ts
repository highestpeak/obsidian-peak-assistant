/**
 * `media_generate` Chat tool input schema (Task D1 §R1).
 *
 * Kept in `core/schemas/tools/` so the shape is IPC-safe and reusable
 * between the ToolDef factory (`service/chat/tools/mediaGenerateTool.ts`)
 * and any future UI-driven preflight call.
 *
 * kind: TTS is deliberately NOT exposed to the Chat tool — TTS still
 * runs through the note-scoped command entry (per D1 brief scope). The
 * three kinds surfaced through Chat are image / video / music.
 */

import { z } from 'zod';

/** Media kinds the Chat `media_generate` tool exposes to the model. */
export const MEDIA_GENERATE_KIND_VALUES = ['image', 'video', 'music'] as const;

export const mediaGenerateInputSchema = z.object({
	kind: z
		.enum(MEDIA_GENERATE_KIND_VALUES)
		.describe(
			'Which media kind to generate. "image" is fully supported today; ' +
				'"video" and "music" require explicit user confirmation and may return ' +
				'a "not-available" result until the async job UI ships.',
		),
	prompt: z
		.string()
		.min(1)
		.max(4000)
		.describe(
			'The generation prompt. Describe the intended output in the user\'s language. ' +
				'For image: subject, style, composition. For video: subject + motion. For music: mood + instruments + tempo.',
		),
	quantity: z
		.number()
		.int()
		.min(1)
		.max(4)
		.optional()
		.describe('Number of variants to generate. Defaults to 1. Max 4.'),
	aspectRatio: z
		.enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
		.optional()
		.describe('Aspect ratio (image / video). Defaults to preset value.'),
	durationSeconds: z
		.number()
		.int()
		.min(1)
		.max(60)
		.optional()
		.describe('Duration for video / music. Ignored for image.'),
	route: z
		.enum(['auto', 'native', 'fal'])
		.optional()
		.describe(
			'Routing preference: "auto" lets the runtime pick the best available route, ' +
				'"native" forces the provider-native adapter (OpenAI image today), ' +
				'"fal" forces fal.ai. Defaults to "auto".',
		),
	presetId: z
		.string()
		.optional()
		.describe(
			'Preset id from templates/config/media-generation.json (e.g. "default", "cover-hd"). ' +
				'Defaults to "default".',
		),
	negativePrompt: z
		.string()
		.optional()
		.describe('Optional negative prompt (image / video).'),
	styleHint: z
		.string()
		.optional()
		.describe('Optional style hint (voice for TTS, style for image / video).'),
	// ── edit (image kind, zero-gap §4 A3) ─────────────────────────────────
	operation: z
		.enum(['generate', 'edit'])
		.optional()
		.describe(
			'"generate" (default) = text-to-media. "edit" = transform user-supplied ' +
				'reference image(s), optionally mask-guided. Only "image" supports edit today. ' +
				'For "edit" you MUST provide referenceIds — never invent ids the user did not supply.',
		),
	referenceIds: z
		.array(z.string())
		.max(8)
		.optional()
		.describe(
			'Ids of reference images the user explicitly attached or previously generated in this ' +
				'conversation. Take these VERBATIM from the user turn — do NOT invent vault paths or ' +
				'guess receipt ids. The runtime rejects any id the user did not surface.',
		),
	maskId: z
		.string()
		.optional()
		.describe(
			'Id of an optional mask image (PNG alpha convention). Same sourcing rules as ' +
				'referenceIds — never invent. Only certain edit presets accept a mask.',
		),
});

export type MediaGenerateToolInput = z.infer<typeof mediaGenerateInputSchema>;
