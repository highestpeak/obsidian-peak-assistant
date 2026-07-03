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
import type { CopilotActionAgentPort } from './actions/CopilotActionPorts';

export interface CustomPromptDef {
	id: string;
	label: string;
	description: string;
	category: 'document' | 'vault' | 'writing';
	template: string;
	filePath: string;
}

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

	if (fmMatch) {
		const fmBlock = fmMatch[1];
		template = fmMatch[2].trim();

		const labelMatch = fmBlock.match(/^label:\s*["']?(.+?)["']?\s*$/m);
		if (labelMatch) label = labelMatch[1];

		const descMatch = fmBlock.match(/^description:\s*["']?(.+?)["']?\s*$/m);
		if (descMatch) description = descMatch[1];

		const catMatch = fmBlock.match(/^category:\s*["']?(document|vault|writing)["']?\s*$/m);
		if (catMatch) category = catMatch[1] as any;
	}

	if (!template) return null;

	return { id, label, description, category, template, filePath };
}

/**
 * Build a {@link CopilotAction} from a parsed custom prompt definition.
 * The agent port closes over Obsidian / profile / pluginId so this
 * function stays pure orchestration: it only formats prompts and yields
 * the agent stream.
 */
export function buildCustomPromptAction(def: CustomPromptDef, agent: CopilotActionAgentPort): CopilotAction {
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
			let systemPrompt = def.template;
			systemPrompt = systemPrompt.replace(/\{\{content\}\}/g, ctx.content);
			systemPrompt = systemPrompt.replace(/\{\{title\}\}/g, ctx.title);
			systemPrompt = systemPrompt.replace(/\{\{selection\}\}/g, ctx.selection ?? '');
			systemPrompt = systemPrompt.replace(/\{\{tags\}\}/g, ctx.tags.join(', '));

			const userPrompt = [
				`## Document: "${ctx.title}"`,
				ctx.selection ? `## Selected Text\n${ctx.selection}` : '',
				'',
				'## Content',
				ctx.content,
			].filter(Boolean).join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};
}
