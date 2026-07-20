/**
 * Document model for project summary markdown (plain text, no meta).
 *
 * Ownership (chat-studio RUN-05):
 * - `description` / `instructions` are USER-OWNED sections. Only explicit
 *   user saves may change them.
 * - `shortSummary` / `fullSummary` are SYSTEM-OWNED (ContextUpdateService /
 *   summarizeProject regenerate them).
 * Both live in the same vault file; the builder/parser keeps them in
 * separate sections so neither owner clobbers the other.
 */

import { normalizeLine, splitSections } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

export interface ChatProjectSummaryModel {
	description: string;
	instructions: string;
	shortSummary: string;
	fullSummary: string;
}

export class ChatProjectSummaryDoc {
	/**
	 * Build project summary markdown (plain text, no meta).
	 */
	static buildMarkdown(params: {
		description?: string;
		instructions?: string;
		shortSummary?: string;
		fullSummary?: string;
	}): string {
		const b = new MarkdownDocBuilder();
		const description = (params.description ?? '').trim();
		const instructions = (params.instructions ?? '').trim();
		const short = (params.shortSummary ?? '').trim();
		const full = (params.fullSummary ?? '').trim();
		if (description) b.section(2, 'Description', description);
		if (instructions) b.section(2, 'Instructions', instructions);
		if (short) b.section(2, 'Short Summary', short);
		if (full) b.section(2, 'Full Summary', full);
		return b.build();
	}

	/**
	 * Parse project summary markdown.
	 *
	 * Supported formats:
	 * - Sectioned headings: `## Description`, `## Instructions`,
	 *   `## Short Summary`, `## Full Summary`
	 * - Legacy sectioned files without Description/Instructions parse with
	 *   empty user sections (backward compatible).
	 * - Legacy/plain text: first paragraph => shortSummary, remainder => fullSummary
	 */
	static parse(raw: string): ChatProjectSummaryModel {
		const text = normalizeLine(raw).trim();
		if (!text) return { description: '', instructions: '', shortSummary: '', fullSummary: '' };

		const sections = splitSections(text, 2);
		if (sections.length === 0) {
			// Legacy format: first paragraph is short, rest is full.
			const blocks = text.split(/\n{2,}/);
			return {
				description: '',
				instructions: '',
				shortSummary: (blocks[0] ?? '').trim(),
				fullSummary: blocks.slice(1).join('\n\n').trim(),
			};
		}

		const findSection = (title: string) =>
			sections.find((s) => s.title === title)?.body.trim() ?? '';

		return {
			description: findSection('Description'),
			instructions: findSection('Instructions'),
			shortSummary: findSection('Short Summary'),
			fullSummary: findSection('Full Summary'),
		};
	}
}
