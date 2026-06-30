// T11N: Port the streamdown / chat-attachment hover-preview components
// depend on for vault reads. Before T11N, `WikilinkHoverPreview` and
// `ResourcePreviewHover` reached `app.vault.readBinary` /
// `app.vault.read` / `app.vault.getResourcePath` directly, so each
// preview render leaked an Obsidian primitive into UI code and the file
// could not be exercised without booting the plugin.
//
// Naming rule (carried forward from T11M `CopilotPanelVaultPort`): every
// method names a concrete preview action. The port intentionally does
// NOT expose `app` / `vault` / `workspace` accessors — that would only
// hide the dependency without removing it.
//
// Implementation: `src/app/adapters/preview/AppVaultPreviewAdapter.ts`.
// Composition: `src/app/adapters/preview/composeVaultPreview.ts` (called once at
// boot inside `AppContext`).

export interface VaultPreviewPort {
	/**
	 * Return the file's bytes for image / binary preview, or `null` when the
	 * path does not point to a markdown/binary file in the vault.
	 */
	readBinary(path: string): Promise<ArrayBuffer | null>;

	/**
	 * Return the file's text content for textual preview (truncated by the
	 * caller), or `null` when the path is unknown.
	 */
	readText(path: string): Promise<string | null>;

	/**
	 * Return Obsidian's served resource URL for embedding (used for PDF
	 * `<iframe>` preview), or `null` when the path is unknown.
	 */
	getResourcePath(path: string): string | null;
}
