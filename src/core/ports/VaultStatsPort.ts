// T11P (Track H): Tiny stat-only port the settings screens use to render
// "X markdown files" pills without reaching for `app.vault.getMarkdownFiles().length`.
// The Quick Search modal also reads `activeFilePath()` to decide whether to
// route to in-file / in-folder search modes.
//
// Implementation: `src/app/adapters/vault/AppVaultStatsAdapter.ts`.
// Kept intentionally narrow — if more stats are needed later, add a named
// accessor here rather than exposing the vault.

export interface VaultStatsPort {
	/** Total number of markdown files currently in the vault. */
	markdownCount(): number;

	/**
	 * Path of the currently active note (or null if none). Used by the
	 * Quick Search modal to scope in-file / in-folder modes — it does not
	 * expose any Obsidian file primitive.
	 */
	activeFilePath(): string | null;
}
