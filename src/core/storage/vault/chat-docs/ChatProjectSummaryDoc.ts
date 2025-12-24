/**
 * Document model for project summary markdown (plain text, no meta).
 */
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
		const model: ChatProjectSummaryModel = {
			shortSummary: (params.shortSummary ?? '').trim(),
			fullSummary: (params.fullSummary ?? '').trim(),
		};
		return ChatProjectSummaryDoc.render(model);
	}

	/**
	 * Render project summary markdown.
	 */
	private static render(model: ChatProjectSummaryModel): string {
		const parts: string[] = [];
		if (model.shortSummary) {
			parts.push('## Short Summary', model.shortSummary, '');
		}
		if (model.fullSummary) {
			parts.push('## Full Summary', model.fullSummary, '');
		}
		return parts.join('\n').trim() + '\n';
	}

	/**
	 * Parse project summary markdown.
	 *
	 * Supported formats:
	 * - Sectioned headings: `## Short Summary`, `## Full Summary`
	 * - Legacy/plain text: first paragraph => shortSummary, remainder => fullSummary
	 */
	static parse(raw: string): ChatProjectSummaryModel {
		const text = raw.replace(/\r\n/g, '\n').trim();
		if (!text) {
			return { shortSummary: '', fullSummary: '' };
		}

		const hasSectionHeadings =
			/^##\s+Short Summary\s*$/m.test(text) ||
			/^##\s+Full Summary\s*$/m.test(text);

		if (!hasSectionHeadings) {
			// Heuristic: first paragraph is short, rest is full.
			const blocks = text.split(/\n{2,}/);
			const shortSummary = (blocks[0] ?? '').trim();
			const fullSummary = blocks.slice(1).join('\n\n').trim();
			return { shortSummary, fullSummary };
		}

		const pickSection = (heading: string): string => {
			const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const re = new RegExp(
				`^##\\s+${escaped}\\s*$\\n([\\s\\S]*?)(?=^##\\s+|\\n?$)`,
				'm'
			);
			const m = text.match(re);
			return (m?.[1] ?? '').trim();
		};

		return {
			shortSummary: pickSection('Short Summary'),
			fullSummary: pickSection('Full Summary'),
		};
	}
}
