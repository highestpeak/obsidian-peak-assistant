/**
 * ArtifactVaultWriterPort — narrow port for structured `artifact_create`
 * outputs (Chat Studio zero-gap Track D, 2026-07-21).
 *
 * Unlike ChatVaultWriterPort (which owns the "save a chat message body to a
 * markdown note" flow), this port creates arbitrary text files in a chosen
 * folder with idempotent name-conflict handling — the same tool call twice
 * in a row should not overwrite the first file. The implementation lives at
 * `src/app/chat/AppArtifactVaultWriterAdapter.ts` and closes over Obsidian's
 * `app.vault` API.
 *
 * All content composition (frontmatter, fenced blocks, XML wrapping) stays
 * in the producer service; this port owns only vault IO.
 */

export interface ArtifactVaultWriterPort {
	/**
	 * Ensure `folder` exists (creating intermediate folders as needed) and
	 * write `content` to `folder/<basename>.<ext>`. When a file with the
	 * requested name already exists, the writer appends `-2`, `-3`, ... until
	 * it lands on a free path (never silently overwrites).
	 *
	 * @returns the resolved vault-relative path that was written.
	 */
	writeTextFile(
		folder: string,
		basename: string,
		ext: string,
		content: string,
	): Promise<string>;

	/** Read a text file for verification / round-trip tests. */
	readTextFile(path: string): Promise<string | null>;

	/**
	 * In-place mutate a single YAML frontmatter field on an existing note.
	 * Intentionally lightweight: we do a line-scoped `field: value` replace
	 * and append the field to an existing frontmatter block if it is missing.
	 * When the file has no `---` frontmatter, the writer creates one and
	 * inserts the field. Body content is preserved verbatim.
	 *
	 * The reminder scheduler flips `status: open` → `status: done` here so
	 * the on-disk note reflects the runtime receipt state — but a failing
	 * write must never break the receipt flip (callers wrap in try/catch).
	 */
	modifyFrontmatterField(vaultPath: string, field: string, value: string): Promise<void>;
}
