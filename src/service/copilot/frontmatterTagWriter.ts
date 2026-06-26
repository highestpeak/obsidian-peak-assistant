import type { TFile } from 'obsidian';

/**
 * IO primitive the writer needs. The app adapter supplies a closure over
 * `app.fileManager.processFrontMatter(file, mutator)` so service code has no
 * concrete Obsidian dependency.
 *
 * T11M: replaces the old `app: App` parameter — every concrete file/editor
 * dependency lives in the app adapter now.
 */
export interface ProcessFrontMatterOp {
	(file: TFile, mutator: (fm: Record<string, unknown>) => void): Promise<void>;
}

/**
 * Merge `tagsToAdd` into a document's YAML frontmatter `tags` field. Existing
 * tags are preserved (case-insensitive de-dup); the leading `#` is stripped on
 * write since Obsidian's frontmatter convention is bare tag names.
 */
export async function writeTagsToFrontmatter(
	file: TFile,
	tagsToAdd: string[],
	processFrontMatter: ProcessFrontMatterOp,
): Promise<void> {
	if (tagsToAdd.length === 0) return;

	await processFrontMatter(file, (fm) => {
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
