/**
 * CustomPromptRegistry — parses user-defined Copilot prompts.
 *
 * T11B (2026-06-14): the static singleton is gone. Vault folder
 * scanning lives in an app adapter
 * (`src/app/copilot/actions/ObsidianCustomPromptSourceAdapter.ts`,
 * relocated in T11Y-7d 2026-06-30)
 * which uses {@link parseCustomPromptFile} to turn raw markdown into
 * {@link CustomPromptDef}. Action construction is now a free
 * function — {@link buildCustomPromptAction} — that takes an injected
 * agent port instead of reaching `AppContext.getInstance()` from
 * inside the closure.
 *
 * Custom prompts are markdown files in the configured `customPromptsFolder`
 * (by default under ai.rootFolder). Each file becomes a copilot action available
 * when a note's frontmatter includes `prompts: [prompt-name]` matching
 * the file's basename.
 *
 * Format of a custom prompt file:
 * ```markdown
 * ---
 * label: "My Custom Prompt"
 * description: "What this prompt does"
 * category: "document"  # document | vault | writing
 * icon: "wand"          # lucide icon name (optional)
 * model: "gpt-5-mini"   # optional override within the active provider profile
 * ---
 * You are an assistant. Given the following document:
 *
 * {{content}}
 *
 * Title: {{title}}
 *
 * [Your instructions here...]
 * ```
 */

import type { CopilotAction, DocumentContext, ActionResult } from './CopilotActionRegistry';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { CopilotActionAgentPort } from '@/core/ports/CopilotActionPorts';
import type { PromptTemplateRendererPort } from '@/core/ports/PromptTemplateRendererPort';

export interface CustomPromptDef {
	id: string;
	label: string;
	description: string;
	category: 'document' | 'vault' | 'writing';
	template: string;
	filePath: string;
	/** Optional model override within the active Copilot provider profile. */
	modelId?: string;
}

/**
 * Variables supplied to every Custom Prompt at run time. The editor can use
 * this declaration to explain exactly what each Handlebars field means.
 */
export const CUSTOM_PROMPT_TEMPLATE_VARIABLES = [
	{
		name: 'title',
		description: 'The title of the note where the action was started.',
	},
	{
		name: 'content',
		description: 'The full current Markdown content of that note.',
	},
	{
		name: 'selection',
		description: 'The selected text, or an empty string when nothing is selected.',
	},
	{
		name: 'tags',
		description: 'The note tags as a comma-separated list, or an empty string when there are none.',
	},
] as const;

const CUSTOM_PROMPT_DOCUMENT_CONTEXT_TEMPLATE = [
	'## Document: "{{title}}"',
	'{{#if selection}}\n## Selected Text\n{{selection}}\n{{/if}}',
	'## Content',
	'{{content}}',
].join('\n\n');

/**
 * Slug a custom prompt id from a basename. Keeps the legacy
 * lowercase + hyphen normalization so frontmatter `prompts:` matching
 * still works after the registry was demoted.
 */
export function normalizeCustomPromptSlug(value: string): string {
	return value.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Parse the markdown body of a custom prompt file into a
 * {@link CustomPromptDef}. Returns `null` if the body is empty after
 * stripping frontmatter — the caller can skip the file.
 *
 * `basename` and `filePath` come from the source adapter so this
 * function has no Obsidian / vault knowledge.
 */
export function parseCustomPromptFile(basename: string, filePath: string, content: string): CustomPromptDef | null {
	const id = normalizeCustomPromptSlug(basename);

	const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	let label = basename;
	let description = 'Custom prompt';
	let category: 'document' | 'vault' | 'writing' = 'document';
	let template = content;
	let modelId: string | undefined;

	if (fmMatch) {
		const fmBlock = fmMatch[1];
		template = fmMatch[2].trim();

		const labelMatch = fmBlock.match(/^label:\s*["']?(.+?)["']?\s*$/m);
		if (labelMatch) label = labelMatch[1];

		const descMatch = fmBlock.match(/^description:\s*["']?(.+?)["']?\s*$/m);
		if (descMatch) description = descMatch[1];

		const catMatch = fmBlock.match(/^category:\s*["']?(document|vault|writing)["']?\s*$/m);
		if (catMatch) category = catMatch[1] as any;

		const modelMatch = fmBlock.match(/^model:\s*["']?(.+?)["']?\s*$/m);
		if (modelMatch?.[1].trim()) modelId = modelMatch[1].trim();
	}

	if (!template) return null;

	return { id, label, description, category, template, filePath, ...(modelId ? { modelId } : {}) };
}

/**
 * Build a {@link CopilotAction} from a parsed custom prompt definition.
 * The agent port closes over Obsidian / profile / pluginId so this
 * function stays pure orchestration: it delegates both system and user
 * prompt rendering to the injected PromptService-owned Handlebars port and
 * yields the agent stream. No action-local placeholder replacement is allowed.
 */
export function buildCustomPromptAction(
	def: CustomPromptDef,
	agent: CopilotActionAgentPort,
	promptTemplates: PromptTemplateRendererPort,
): CopilotAction {
	return {
		id: `custom-${def.id}`,
		label: def.label,
		description: def.description,
		iconId: 'file-text',
		category: def.category,
		relevance: (ctx: DocumentContext) => {
			const fmPrompts = ctx.frontmatter?.prompts;
			if (Array.isArray(fmPrompts)) {
				const normalized = fmPrompts.map((p: string) => normalizeCustomPromptSlug(p));
				return normalized.includes(def.id) ? 0.9 : 0.1;
			}
			return 0.4;
		},
		async *execute(ctx: DocumentContext, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult | void> {
			const variables = customPromptVariables(ctx);
			const systemPrompt = promptTemplates.render(def.template, variables);
			const userPrompt = promptTemplates.render(CUSTOM_PROMPT_DOCUMENT_CONTEXT_TEMPLATE, variables);

			yield* agent.runAgentStream({
				systemPrompt,
				userPrompt,
				signal,
				...(def.modelId ? { modelId: def.modelId } : {}),
			});
		},
	};
}

function customPromptVariables(ctx: DocumentContext): Record<string, string> {
	return {
		title: ctx.title,
		content: ctx.content,
		selection: ctx.selection ?? '',
		tags: ctx.tags.join(', '),
	};
}
