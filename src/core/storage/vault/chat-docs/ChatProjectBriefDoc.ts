import { normalizeLine, splitSections } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

export interface ChatProjectBriefModel {
	description: string;
	instructions: string;
}

/** User-owned Project Bridge/Brief. Machine summaries never enter this file. */
export class ChatProjectBriefDoc {
	static buildMarkdown(model: Partial<ChatProjectBriefModel>): string {
		const builder = new MarkdownDocBuilder();
		builder.heading(1, 'Project Brief');
		const description = (model.description ?? '').trim();
		const instructions = (model.instructions ?? '').trim();
		if (description) builder.section(2, 'Description', description);
		if (instructions) builder.section(2, 'Instructions', instructions);
		return builder.build();
	}

	static parse(raw: string): ChatProjectBriefModel {
		const sections = splitSections(normalizeLine(raw).trim(), 2);
		const read = (title: string) => sections.find((section) => section.title === title)?.body.trim() ?? '';
		return { description: read('Description'), instructions: read('Instructions') };
	}
}
