/**
 * CustomPromptRegistry — discovers and loads user-defined prompts from a vault folder.
 *
 * Custom prompts are markdown files in the `customPromptsFolder` (default: `_prompts/`).
 * Each file becomes a copilot action available when a note's frontmatter
 * includes `prompts: [prompt-name]` matching the file's basename.
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

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { CopilotAction, DocumentContext, ActionResult } from './CopilotActionRegistry';
import type { LLMStreamEvent } from '@/core/providers/types';
import { AppContext } from '@/app/context/AppContext';
import { buildCopilotAgentStream } from './actions/agent-actions';
import { FileText } from 'lucide-react';

export interface CustomPromptDef {
	id: string;
	label: string;
	description: string;
	category: 'document' | 'vault' | 'writing';
	template: string;
	filePath: string;
}

export class CustomPromptRegistry {
	private static instance: CustomPromptRegistry;
	private prompts = new Map<string, CustomPromptDef>();
	private loaded = false;

	static getInstance(): CustomPromptRegistry {
		if (!this.instance) this.instance = new CustomPromptRegistry();
		return this.instance;
	}

	/** Discover and load all custom prompts from the configured folder. */
	async loadFromVault(app: App, folder: string): Promise<void> {
		this.prompts.clear();
		this.loaded = true;

		const normalizedFolder = normalizePath(folder);
		const folderRef = app.vault.getAbstractFileByPath(normalizedFolder);
		if (!folderRef || !(folderRef instanceof TFolder)) return;

		const files = folderRef.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md',
		);

		for (const file of files) {
			try {
				const content = await app.vault.cachedRead(file);
				const parsed = this.parsePromptFile(file, content);
				if (parsed) this.prompts.set(parsed.id, parsed);
			} catch (e) {
				console.warn(`[CustomPromptRegistry] Failed to parse ${file.path}:`, e);
			}
		}
	}

	/** Parse a markdown file into a CustomPromptDef. */
	private parsePromptFile(file: TFile, content: string): CustomPromptDef | null {
		const id = file.basename.toLowerCase().replace(/\s+/g, '-');

		// Extract frontmatter
		const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		let label = file.basename;
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

		return { id, label, description, category, template, filePath: file.path };
	}

	/** Get all loaded custom prompts. */
	getAll(): CustomPromptDef[] {
		return Array.from(this.prompts.values());
	}

	/** Get custom prompts matching a list of names (from frontmatter). */
	getByNames(names: string[]): CustomPromptDef[] {
		const normalized = names.map(n => n.toLowerCase().replace(/\s+/g, '-'));
		return normalized
			.map(n => this.prompts.get(n))
			.filter((p): p is CustomPromptDef => !!p);
	}

	/** Check if prompts have been loaded. */
	isLoaded(): boolean {
		return this.loaded;
	}

	/** Build a CopilotAction from a custom prompt definition. */
	buildAction(def: CustomPromptDef): CopilotAction {
		return {
			id: `custom-${def.id}`,
			label: def.label,
			description: def.description,
			icon: FileText,
			category: def.category,
			relevance: (ctx: DocumentContext) => {
				// If the note has a `prompts:` frontmatter field, show high relevance
				// only for prompts listed there; otherwise show moderate relevance.
				const fmPrompts = ctx.frontmatter?.prompts;
				if (Array.isArray(fmPrompts)) {
					const normalized = fmPrompts.map((p: string) => p.toLowerCase().replace(/\s+/g, '-'));
					return normalized.includes(def.id) ? 0.9 : 0.1;
				}
				return 0.4;
			},
			async *execute(ctx: DocumentContext, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult | void> {
				// Simple variable substitution for the template
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

				yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
			},
			ResultPanel: null as any,
		};
	}
}
