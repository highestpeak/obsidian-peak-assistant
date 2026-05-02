/**
 * Document model for project summary markdown (plain text, no meta).
 */

import { normalizeLine, splitSections } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

export interface ChatProjectSummaryModel {
	shortSummary: string;
	fullSummary: string;
}

export class ChatProjectSummaryDoc {
	/**
	 * Build project summary markdown (plain text, no meta).
	 */
	static buildMarkdown(params: {
		shortSummary?: string;
		fullSummary?: string;
	}): string {
		const b = new MarkdownDocBuilder();
		const short = (params.shortSummary ?? '').trim();
		const full = (params.fullSummary ?? '').trim();
		if (short) b.section(2, 'Short Summary', short);
		if (full) b.section(2, 'Full Summary', full);
		return b.build();
	}

	/**
	 * Parse project summary markdown.
	 *
	 * Supported formats:
	 * - Sectioned headings: `## Short Summary`, `## Full Summary`
	 * - Legacy/plain text: first paragraph => shortSummary, remainder => fullSummary
	 */
	static parse(raw: string): ChatProjectSummaryModel {
		const text = normalizeLine(raw).trim();
		if (!text) return { shortSummary: '', fullSummary: '' };

		const sections = splitSections(text, 2);
		if (sections.length === 0) {
			// Legacy format: first paragraph is short, rest is full.
			const blocks = text.split(/\n{2,}/);
			return {
				shortSummary: (blocks[0] ?? '').trim(),
				fullSummary: blocks.slice(1).join('\n\n').trim(),
			};
		}

		const findSection = (title: string) =>
			sections.find((s) => s.title === title)?.body.trim() ?? '';

		return {
			shortSummary: findSection('Short Summary'),
			fullSummary: findSection('Full Summary'),
		};
	}
}
