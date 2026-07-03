/**
 * Ports consumed by HubMaterializationAgent and HubCurationExecutor.
 * See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 7.
 *
 * The service layer speaks in vault-relative paths + markdown content.
 * File-system semantics (ensureFolder, atomic-ish overwrite, archive move,
 * TFile lookup) live in the Obsidian adapter under `src/app/hub/`.
 */

export interface VaultHubDocWritePort {
	/** Read the raw file contents (frontmatter + body). Returns `null` when the file does not exist. */
	read(path: string): Promise<string | null>;

	/**
	 * Parse the frontmatter and return the value of `peak_user_owned`.
	 * Returns `false` when the file does not exist or the flag is not set.
	 * The frontmatter parse errors bubble up.
	 */
	readPeakUserOwned(path: string): Promise<boolean>;

	/**
	 * Return the content after the `<!-- USER_SECTIONS_BELOW -->` marker.
	 * Returns `''` when the file does not exist, has no marker, or has no content after it.
	 */
	extractUserPreservedContent(path: string): Promise<string>;

	/** Overwrite (or create) the hub markdown file. The adapter ensures parent folders exist. */
	writeHubDoc(path: string, markdown: string): Promise<void>;
}

export interface VaultHubArchivePort {
	/**
	 * Move `srcPath` under `_archive/hub/<sanitized-orig-path>`. Preserves file content.
	 * Returns the new archive path. No-op (returns `srcPath`) if the source file does not exist.
	 */
	archive(srcPath: string): Promise<string>;
}
