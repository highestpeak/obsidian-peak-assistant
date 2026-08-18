export type ComposerDocumentTitleDraft =
	| { ok: true; title: string }
	| { ok: false; reason: 'empty' | 'path-separator' };

/** Match Obsidian's inline-title identity: the file basename without `.md`. */
export function composerDocumentTitle(filePath: string): string {
	const normalized = filePath.split('\\').join('/');
	const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
	if (!basename.toLocaleLowerCase().endsWith('.md')) return basename;
	return basename.slice(0, -3) || basename;
}

/** Normalize the inline title without allowing it to escape the current folder. */
export function normalizeComposerDocumentTitleDraft(
	value: string,
): ComposerDocumentTitleDraft {
	const trimmed = value.trim();
	const title = trimmed.toLocaleLowerCase().endsWith('.md')
		? trimmed.slice(0, -3).trim()
		: trimmed;
	if (!title) return { ok: false, reason: 'empty' };
	if (title.includes('/') || title.includes('\\')) {
		return { ok: false, reason: 'path-separator' };
	}
	return { ok: true, title };
}

/** Keep an inline-title rename in the same Vault folder and preserve `.md`. */
export function composerDocumentRenamePath(filePath: string, title: string): string {
	const normalized = filePath.split('\\').join('/');
	const slash = normalized.lastIndexOf('/');
	const folder = slash < 0 ? '' : normalized.slice(0, slash + 1);
	return `${folder}${title}.md`;
}
