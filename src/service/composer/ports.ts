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
 * Observes lifecycle events on the vault. File identity is supplied by the
 * versioned Composer leaf state; this port must never follow global active file.
 */
export interface ComposerFileEventsPort {
	/** Subscribe to modify/rename/delete events. Returns an unsubscribe fn. */
	onFileEvent(cb: (event: ComposerFileEvent) => void): () => void;
}

export type ComposerNativePreviewFormat = 'base' | 'canvas' | 'excalidraw';

export interface ComposerResourcePreviewRequest {
	sourcePath: string;
	target: string;
	/** Composer-only exact range boundaries for a normal Markdown embed. */
	range?: { startAnchor: string; endAnchor: string };
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
		/** Verbatim source slice when the caller requested a persisted Composer range. */
		rangeText?: string;
		rangeResolved?: boolean;
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

/** A persisted, source-backed Obsidian block anchor for one embedded Markdown region. */
export interface ComposerEmbedSelectionAnchorRequest {
	/** Already-resolved Vault path of the embedded Markdown note. */
	targetPath: string;
	/** Ordered visible texts of complete semantic Markdown blocks resolved from the preview selection. */
	selectedBlockTexts: string[];
	/**
	 * Lower-priority semantic interpretations of the same DOM selection. Native
	 * renderers may add a wrapper that is not a Markdown block; the app tries
	 * these only when the primary interpretation cannot map losslessly.
	 */
	fallbackBlockTextGroups?: string[][];
	/** Exact Composer-owned anchors from the currently persisted preview, if any. */
	previousSelection?: ComposerManagedEmbedSelectionAnchors;
}

export type ComposerManagedEmbedSelectionAnchors =
	| { kind: 'block'; anchor: string }
	| { kind: 'range'; startAnchor: string; endAnchor: string };

export type ComposerEmbedSelectionAnchorResult =
	| {
		kind: 'block';
		/** Bare ID; callers build the Obsidian subpath as `#^${anchor}`. */
		anchor: string;
		/** `true` when the matching source block already carried an anchor. */
		reused: boolean;
	}
	| {
		kind: 'range';
		startAnchor: string;
		endAnchor: string;
		reused: boolean;
	};

export type ComposerEmbedSelectionAnchorMutation =
	& ComposerEmbedSelectionAnchorResult
	& {
		/**
		 * Compensate the target-note mutation when the parent Composer commit
		 * fails. Implementations must refuse to overwrite a newer target edit.
		 */
		rollback(): Promise<void>;
	};

export interface ComposerEmbedSelectionAnchorReleaseRequest {
	targetPath: string;
	selection: ComposerManagedEmbedSelectionAnchors;
}

/**
 * App-owned two-file bridge for persisted Markdown embed selections. The target
 * note write is revision guarded and compensatable; the owning Composer
 * document updates its embed token through the normal transaction hub.
 */
export interface ComposerEmbedSelectionAnchorPort {
	persistSelection(request: ComposerEmbedSelectionAnchorRequest): Promise<ComposerEmbedSelectionAnchorMutation>;
	releaseSelection(request: ComposerEmbedSelectionAnchorReleaseRequest): Promise<{ rollback(): Promise<void> }>;
}
