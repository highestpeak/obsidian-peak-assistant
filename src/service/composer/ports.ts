/**
 * Peak Composer — service-layer ports (WP1).
 *
 * The service layer is framework-neutral: it must not import `obsidian`
 * (enforced by test/boundary/service-layer-boundaries.test.ts). All vault /
 * workspace interaction is expressed through these interfaces, which the app
 * layer implements with real Obsidian adapters and tests implement with fakes.
 */

/** Reads the current bytes of a document from the underlying store. */
export interface ComposerSourcePort {
	/** Resolve the verbatim source text for a vault-relative path. */
	readSource(filePath: string): Promise<string>;
}

/**
 * Atomically persists new document bytes (WP2). The write is revision-guarded:
 * the adapter compares the file's CURRENT bytes against `expectedBaseText` and
 * throws {@link ComposerConflictError}(`revision-mismatch`) if they differ, so a
 * concurrent external edit can never be silently clobbered. On success the exact
 * `nextText` bytes are what land on disk (a splice, no re-serialization).
 */
export interface ComposerWritePort {
	writeSource(filePath: string, nextText: string, expectedBaseText: string): Promise<void>;
}

/** A file lifecycle event observed on the underlying store. */
export interface ComposerFileEvent {
	type: 'modify' | 'rename' | 'delete';
	/** Current path (for rename this is the NEW path). */
	path: string;
	/** Previous path — only present for `rename`. */
	oldPath?: string;
}

/**
 * Observes which document is "active" and lifecycle events on the vault. The
 * app adapter maps Obsidian's `workspace`/`vault` events onto this port; the
 * controller subscribes and never touches Obsidian directly.
 */
export interface ComposerFileEventsPort {
	/** Currently active Markdown file path, or null if none. */
	getActiveFilePath(): string | null;
	/** Subscribe to active-file changes. Returns an unsubscribe fn. */
	onActiveFileChange(cb: (path: string | null) => void): () => void;
	/** Subscribe to modify/rename/delete events. Returns an unsubscribe fn. */
	onFileEvent(cb: (event: ComposerFileEvent) => void): () => void;
}

export type ComposerNativePreviewFormat = 'base' | 'canvas' | 'excalidraw';

export interface ComposerResourcePreviewRequest {
	sourcePath: string;
	target: string;
}

export type ComposerResourcePreviewState =
	| {
		status: 'loaded';
		targetPath: string;
		name: string;
		extension: string;
		size: number;
		mtime: number;
		anchor?: string;
		anchorResolved?: boolean;
		textExcerpt?: string;
		pageCount?: number;
	}
	| { status: 'missing'; requestedTarget: string }
	| { status: 'error'; requestedTarget: string; message: string };

export interface ComposerNativePreviewRequest {
	/** Markdown source document that owns the embed token. */
	sourcePath: string;
	/** The raw wikilink/embed target from Markdown, before app-layer resolution. */
	target: string;
	format: ComposerNativePreviewFormat;
}

export type ComposerNativePreviewState =
	| { status: 'loaded'; format: ComposerNativePreviewFormat; targetPath: string; text: string }
	| { status: 'missing'; format: ComposerNativePreviewFormat; requestedTarget: string; targetPath?: string; message?: string }
	| { status: 'error'; format: ComposerNativePreviewFormat; requestedTarget: string; targetPath?: string; message: string };

/**
 * Reads native embed preview bytes for `.base`, `.canvas` and `.excalidraw.md`.
 * Framework-neutral: the app layer resolves Obsidian links + vault reads, while
 * UI components only see explicit loaded/missing/error states.
 */
export interface ComposerNativePreviewPort {
	resolveNativePreview(request: ComposerNativePreviewRequest): Promise<ComposerNativePreviewState>;
	/** Resolve note embeds and binary attachments without leaking Obsidian APIs into UI. */
	resolveResourcePreview?(request: ComposerResourcePreviewRequest): Promise<ComposerResourcePreviewState>;
	/**
	 * Optional external-change hook. Implementations may call `cb` when the target
	 * file is modified, renamed or deleted so UI can safely reload the preview.
	 */
	onNativePreviewChange?(request: ComposerNativePreviewRequest, cb: () => void): () => void;
}
