// T11N: Narrow port for "save a chat message body to a fresh markdown
// note" used by `MessageViewItem.handleSaveToVault`. Before T11N
// the React message item reached `app.vault.createFolder` +
// `app.vault.create` directly.
//
// Implementation: `src/app/chat/AppChatVaultWriterAdapter.ts`. Content
// composition (frontmatter, body, telemetry) stays in the React caller —
// this port owns only the IO.

export interface ChatVaultWriterPort {
	/**
	 * Ensure `folder` exists (creating it when missing) and create a new
	 * markdown file at `folder/<fileNameWithExt>` with the given UTF-8
	 * `content`. Returns the resolved vault-relative path. Throws when
	 * either the folder operation or the create call fails — callers
	 * present the `Notice` themselves.
	 */
	saveChatMessageToFolder(folder: string, fileNameWithExt: string, content: string): Promise<string>;
}
