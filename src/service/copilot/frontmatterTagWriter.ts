import type { TFile } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';

/**
 * Write accepted tags into a document's YAML frontmatter.
 * Uses Obsidian's atomic processFrontMatter API.
 */
export async function writeTagsToFrontmatter(file: TFile, tagsToAdd: string[]): Promise<void> {
	if (tagsToAdd.length === 0) return;

	const app = AppContext.getInstance().app;
	await app.fileManager.processFrontMatter(file, (fm) => {
		const existing = Array.isArray(fm.tags)
			? fm.tags as string[]
			: typeof fm.tags === 'string'
				? [fm.tags]
				: [];

		const normalized = new Set(existing.map(t => t.replace(/^#/, '').toLowerCase()));
		const merged = [...existing];

		for (const tag of tagsToAdd) {
			const key = tag.replace(/^#/, '').toLowerCase();
			if (!normalized.has(key)) {
				merged.push(tag.replace(/^#/, ''));
				normalized.add(key);
			}
		}

		fm.tags = merged;
	});
}
