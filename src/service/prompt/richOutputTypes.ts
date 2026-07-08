/**
 * Rich-output types registry — the model-facing "supported output types" list
 * that gets stitched into the conversation-system prompt.
 *
 * Design (2026-07-05, chat-unified-mode):
 *   - The list of supported rich-output blocks (Mermaid, Bases, …) is a
 *     template/config concern, NOT a runtime plugin registry. Adding a new
 *     type is one entry in `templates/config/rich-output-types.json`; the
 *     conversation-system prompt iterates the entries via Handlebars.
 *   - Each entry contains a `conventionMarkdown` string that describes when
 *     the model should emit that block and what structural rules to follow.
 *     Kept in JSON (not code) so template authors + prompt overrides can
 *     evolve conventions without touching typescript.
 *   - `renderer` distinguishes `native` (plugin renders directly, e.g.
 *     Mermaid via Streamdown) from `source-only` (model emits source and
 *     the user copies it out, e.g. Bases). This field is metadata for now
 *     — no UI branches on it, but it documents intent for future work.
 *
 * Domain fallback: the compiled DEFAULT_RICH_OUTPUT_TYPES mirrors the
 * shipped JSON so SystemPromptSlot can still render if the template file
 * fails to load. See docs/conventions/configurability.md.
 */

import { z } from 'zod';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

export const RichOutputTypeSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	renderer: z.enum(['native', 'source-only']),
	conventionMarkdown: z.string().min(1),
});

export type RichOutputType = z.infer<typeof RichOutputTypeSchema>;

const RichOutputTypesFileSchema = z.object({
	types: z.array(RichOutputTypeSchema).min(1),
}).passthrough();

/**
 * Compiled fallback — mirrors `templates/config/rich-output-types.json`.
 * If the two ever drift, the JSON wins at runtime and this fallback is only
 * used when the template loader itself fails.
 */
export const DEFAULT_RICH_OUTPUT_TYPES: readonly RichOutputType[] = Object.freeze([
	{
		id: 'mermaid',
		label: 'Mermaid diagram',
		renderer: 'native',
		conventionMarkdown:
			'Mermaid diagram conventions (when generating mermaid blocks):\n' +
			'- Prefer node labels that reference real vault documents. Wrap document references with double-quoted labels: `A["Note Title"]`.\n' +
			'- To make a node clickable and open the referenced vault note, add a `click` directive with a `peak://wikilink/` URL: `click A "peak://wikilink/Note%20Title" "Open note"`. Use URL-encoding for spaces and special characters.\n' +
			'- Do NOT invent vault paths. Only add `click` directives for notes you know exist (from the current conversation context or attached resources).',
	},
	{
		id: 'bases',
		label: 'Obsidian Bases view',
		renderer: 'source-only',
		conventionMarkdown:
			'Obsidian Bases view conventions (when the user asks for a data view / database / Bases file):\n' +
			'- Bases files use extension `.base` and contain YAML with three top-level keys: `filters`, `views`, and optionally `properties`.\n' +
			'- Emit generated Bases in a fenced code block tagged `base`. The chat UI adds a "Save & Open in Bases" button that writes the YAML to a `.base` file and opens it in Obsidian for native rendering.\n' +
			'- **First line of the block should be a filename hint**: `# filename: my-projects.base` (kebab-case, no spaces). Absent hint → timestamped name. The hint is stripped before the file is written.\n' +
			'- Filter operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains(...)`, `startsWith(...)`, `endsWith(...)`, `taggedWith(...)`. Combine with `and:` / `or:` / `not:` blocks.\n' +
			'- Built-in file properties: `file.name`, `file.path`, `file.folder`, `file.ext`, `file.mtime`, `file.ctime`, `file.size`, `file.tags`, `file.links`, `file.inlinks`, `file.outlinks`.\n' +
			'- View types: `table` (columns via `order`), `cards` (`imageProperty` optional), `board` (`groupBy` required), `calendar` (`dateProperty` required).\n' +
			'- Only reference vault properties that exist. If unsure, use `file.*` built-ins.',
	},
]);

/**
 * Load and validate the rich-output types config. Falls back to
 * DEFAULT_RICH_OUTPUT_TYPES on load or validation failure so the system
 * prompt is never empty.
 */
export async function loadRichOutputTypes(templateManager: TemplateManager): Promise<RichOutputType[]> {
	try {
		const raw = await templateManager.loadJson<unknown>(ConfigTemplateId.RichOutputTypes);
		const parsed = RichOutputTypesFileSchema.safeParse(raw);
		if (!parsed.success) {
			console.warn('[richOutputTypes] template failed schema; using compiled defaults', parsed.error.issues);
			return [...DEFAULT_RICH_OUTPUT_TYPES];
		}
		return parsed.data.types;
	} catch (err) {
		console.warn('[richOutputTypes] template load failed; using compiled defaults', err);
		return [...DEFAULT_RICH_OUTPUT_TYPES];
	}
}
