import type { VaultFileRef } from './VaultFileRef';

/**
 * T11R: Narrow workspace observation port used by SessionContextService
 * and ContextProvider. Replaces direct `app.workspace.*` access from
 * service-tier modules.
 *
 * `EventRef` is intentionally exposed as `unknown` — callers treat the
 * value as an opaque token and only ever pass it back into `offFileOpen`.
 */
export type FileOpenEventRef = unknown;

export interface WorkspaceObserverPort {
	/** Currently active file in the workspace, or null. */
	getActiveFile(): VaultFileRef | null;

	/** Vault display name. */
	getVaultName(): string;

	/** Recently-opened file paths, most-recent first. */
	getLastOpenFilePaths(): string[];

	/** Subscribe to file-open events. Returns an opaque ref for {@link offFileOpen}. */
	onFileOpen(handler: (file: VaultFileRef | null) => void): FileOpenEventRef;

	/** Remove a previously-registered file-open handler. */
	offFileOpen(ref: FileOpenEventRef): void;
}
