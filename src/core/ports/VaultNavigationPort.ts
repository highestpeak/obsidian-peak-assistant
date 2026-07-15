// T11N: Narrow port for "open a vault link" actions. Before T11N,
// `BriefingCard`, `PushCard`, the chat-view `OpenLink` event handler,
// and the `openVaultReviewHistoryRecord` module helper each called
// `app.workspace.openLinkText` directly — five different UI files had
// their own copy of the same five-line operation and depended on the
// Obsidian primitive.
//
// T11P (Track D): Port expanded with the rest of the user-level
// vault-navigation operations UI needed (previously fulfilled by raw
// `app.vault.*` / `app.workspace.*` calls inside `view-utils.ts`,
// `vault-utils.ts`, `obsidian-utils.openFileAtLine`, and the search
// `createOpenSourceCallback`). Per Codex review #2, every method names
// a user-level action; the port intentionally does NOT publish
// `App`/`Vault`/`Workspace`/`TFile` accessors — those would only hide
// the dependency from the scanner.
//
// Implementation: `src/app/platform/navigation/AppVaultNavigationAdapter.ts`.
// Composition: `src/app/platform/navigation/composeNavigation.ts` (used by
// `AppContext`).

import type { SearchResultItem } from '@/core/search/searchTypes';

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

export interface OpenVaultPathAtLineOptions extends VaultNavigationOpenOptions {
	/** Zero-indexed line number. */
	line: number;
}

export interface VaultNavigationPort {
	/**
	 * Open a vault file by path or wikilink target. Falls back to
	 * `openLinkText` for non-existent paths so `[[Note Title]]` resolves
	 * via Obsidian's metadata cache.
	 */
	openLink(path: string, opts?: VaultNavigationOpenOptions): Promise<void>;

	/**
	 * Open a vault file by path. Unlike `openLink`, returns whether the
	 * path resolved to an existing file. Used by panels that show an
	 * "open" affordance only when the path exists.
	 */
	openVaultPath(path: string, opts?: VaultNavigationOpenOptions): Promise<boolean>;

	/**
	 * Open a vault file and place the cursor at `line`. No-op if the
	 * file does not exist. Best-effort: scroll/cursor settings may fail
	 * if the editor view has not finished mounting.
	 */
	openVaultPathAtLine(path: string, opts: OpenVaultPathAtLineOptions): Promise<void>;

	/**
	 * Open a search-result item: routes to `openVaultPathAtLine` when
	 * `loc.line` is present, otherwise `openVaultPath`. Centralizes the
	 * "open this hit" logic the various search surfaces share.
	 */
	openSearchResult(
		item: SearchResultItem | string,
		opts?: VaultNavigationOpenOptions,
	): Promise<void>;

	/**
	 * Open an attachment href (wikilink-style or vault path) in a new leaf.
	 * Wraps the legacy `openAttachment` helper.
	 */
	openAttachmentSource(href: string): void;

	/**
	 * Open an external URL in a new browser tab with `noopener,noreferrer`.
	 * Centralized so the UI does not call `window.open` directly with the
	 * security tokens repeated at every site.
	 */
	openExternalUrl(url: string): void;

	/**
	 * Reveal the conversation source file in a markdown leaf, recreating
	 * the "open source" affordance from the conversation header / project
	 * list. Returns `false` when the input does not resolve to a real
	 * markdown file. Accepts the conversation file via an opaque token
	 * (typed `unknown`) so the port stays free of `TFile`.
	 */
	openSourceFile(file: unknown): Promise<boolean>;

	/**
	 * Reveal a folder (by vault path) in Obsidian's left-side File Explorer.
	 * Used by Vault Search's Tree view when the user clicks a folder row to
	 * jump to that folder in the vault tree. Best-effort — no-op if the
	 * File Explorer leaf isn't loaded or the folder can't be resolved.
	 */
	revealFolderInFileExplorer(folderPath: string): void;
}
