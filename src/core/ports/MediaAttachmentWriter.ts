// MediaAttachmentWriter port — abstracts vault-level byte persistence for
// generated media. Lives here (core/ports) so callers (MediaGenerationService,
// ObsidianMediaAttachmentWriter, tests) share a single canonical import path
// without pulling in the MediaRingService orchestrator module.

export interface MediaAttachmentWriter {
	/**
	 * Persist bytes at a vault-relative path under `attachmentFolder`.
	 * Returns the final vault-relative path (adapter may add a collision suffix).
	 * `basename` does NOT include an extension.
	 */
	writeAttachment(input: {
		attachmentFolder: string;
		basename: string;
		extension: string;
		bytes: Uint8Array;
	}): Promise<{ path: string }>;
}
