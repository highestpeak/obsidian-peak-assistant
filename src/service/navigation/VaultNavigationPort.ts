// T11N: Narrow port for "open a vault link" actions. Before T11N,
// `BriefingCard`, `PushCard`, the chat-view `OpenLink` event handler,
// and the `openVaultReviewHistoryRecord` module helper each called
// `app.workspace.openLinkText` directly — five different UI files had
// their own copy of the same five-line operation and depended on the
// Obsidian primitive.
//
// Implementation: `src/app/navigation/AppVaultNavigationAdapter.ts`.
// Composition: `src/app/navigation/composeNavigation.ts` (used by
// `AppContext`).

export interface VaultNavigationOpenOptions {
	/**
	 * `'tab'` opens in a new tab (default for cards/links), `'window'` in a
	 * detached window, `false` reuses the current leaf, `true` opens in a
	 * new leaf. Mirrors Obsidian's `getLeaf` semantics.
	 */
	newLeaf?: boolean | 'tab' | 'window';
	/** Source path used for relative-link resolution. Defaults to the active file. */
	sourcePath?: string;
}

export interface VaultNavigationPort {
	/**
	 * Open a vault file by path or wikilink target. Falls back to
	 * `openLinkText` for non-existent paths so `[[Note Title]]` resolves
	 * via Obsidian's metadata cache.
	 */
	openLink(path: string, opts?: VaultNavigationOpenOptions): Promise<void>;
}
