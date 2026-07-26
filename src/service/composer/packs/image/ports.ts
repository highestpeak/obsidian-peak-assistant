/**
 * Peak Composer — image pack ports (WP7).
 *
 * Narrow, framework-neutral boundaries the image capabilities talk to. The app
 * layer implements them over Obsidian's vault / metadata cache / media
 * generation service; tests implement deterministic fakes. Service code NEVER
 * imports `obsidian` (boundary-guarded) and NEVER reaches a provider adapter
 * directly — everything crosses one of these ports.
 *
 * All binary payloads are `Uint8Array` so the model stays portable to node
 * tests and future non-Obsidian hosts.
 */

/** Request to persist bytes as a new vault attachment. */
export interface ComposerImageSaveRequest {
	bytes: Uint8Array;
	/** Preferred base name (no extension) — already semantically named + sanitized. */
	baseName: string;
	/** File extension without a leading dot (`png` / `jpg` / `webp`). */
	extension: string;
	/** Explicit target folder (vault-relative); defaults to {@link attachmentFolder}. */
	folder?: string;
}

export interface ComposerImageSaveResult {
	/** Final vault-relative path of the written asset (post dedup). */
	path: string;
}

/**
 * Writes/serves image attachments in the vault. The default folder follows the
 * plugin's existing attachment convention (`<root>/Attachments/media`).
 */
export interface ComposerImageAttachmentPort {
	/** Default attachment folder for pasted / generated images (vault-relative). */
	attachmentFolder(): string;
	/** Persist bytes as a NEW attachment; dedups the path on collision. */
	save(request: ComposerImageSaveRequest): Promise<ComposerImageSaveResult>;
	/** Overwrite an existing asset's bytes in place (Converter overwrite path). */
	overwrite(path: string, bytes: Uint8Array): Promise<void>;
	/** A short-lived preview URI for on-screen display — NEVER persisted to Markdown. */
	previewUri(path: string): string;
}

/** A document that references an asset (from the metadata cache). */
export interface ComposerImageReferenceLocation {
	/** Vault path of the referencing document. */
	documentPath: string;
	/** Reference count within that document. */
	count: number;
}

/**
 * Reference bookkeeping for a rename. Cross-document reference rewriting +
 * physical file rename is done through the host (Obsidian
 * `fileManager.renameFile`, which updates every backlink atomically). The
 * composer's OWN open document is rewritten through the transaction hub instead,
 * so the rename lands in the composer's History / Undo.
 */
export interface ComposerImageReferencePort {
	/** Every document that references `assetPath`. */
	findReferences(assetPath: string): Promise<ComposerImageReferenceLocation[]>;
	/** Rename the physical asset and update all cross-document references atomically. */
	rename(oldPath: string, newPath: string): Promise<void>;
	/** Back up an asset before an in-place overwrite (reversible Converter path). */
	backup(path: string): Promise<{ backupPath: string }>;
}

/** An AI image-edit / generation request routed to the media generation service. */
export interface ComposerImageEditRequest {
	/** Base image (vault path) being edited; omit for text-to-image generation. */
	sourcePath?: string;
	instruction: string;
	/** Optional region/mask (vault path to a mask image). */
	maskPath?: string;
	/** How many variants to request (defaults to 1). */
	variants?: number;
	signal?: AbortSignal;
}

export interface ComposerImageEditResult {
	/** Written vault paths for the generated variant(s). */
	paths: string[];
	mimeType: string;
}

/** The media-generation boundary (fal.ai / native adapters live behind it). */
export interface ComposerImageEditPort {
	edit(request: ComposerImageEditRequest): Promise<ComposerImageEditResult>;
}

/** A model text-completion request for caption / layout suggestions. */
export interface ComposerImageTextRequest {
	kind: 'caption' | 'layout';
	instruction: string;
	/** Bounded context (the image block source, or the layout item list as JSON). */
	context: string;
	signal?: AbortSignal;
}

/**
 * Text boundary for the model-backed caption + smart-layout flows. The app
 * implements it over the shared AI service (a template-registered prompt — never
 * inline text); tests provide a deterministic fake. Kept separate from the media
 * edit port because it returns text, not image bytes.
 */
export interface ComposerImageTextPort {
	complete(request: ComposerImageTextRequest): Promise<string>;
}
