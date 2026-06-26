import type { TFile, App } from 'obsidian';

/**
 * Write accepted tags into a document's YAML frontmatter.
 * Uses Obsidian's atomic processFrontMatter API.
 *
 * T11J B2: caller passes the live `app` so the helper no longer reaches
 * `AppContext.getInstance().app`.
 */
export async function writeTagsToFrontmatter(file: TFile, tagsToAdd: string[], app: App): Promise<void> {
	if (tagsToAdd.length === 0) return;

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
