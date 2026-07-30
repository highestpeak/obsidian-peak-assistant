/**
 * File Atlas — host port (UI ↔ app boundary).
 *
 * File Atlas is framework-agnostic React; anything that touches the Obsidian
 * runtime (enumerating open tabs, reading a note, revealing a line, clipboard,
 * the document neighborhood graph) is injected through this port and composed
 * at the app layer (see FileAtlasModal). Keeps runtime ownership out of the UI.
 */

import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';

/** One entry in the left rail: an open or recently viewed Markdown document. */
export interface OpenDocMeta {
	/** Vault-relative path (also the stable id). */
	path: string;
	/** Display title — basename without the `.md` extension. */
	title: string;
	/** The file currently has at least one workspace tab. */
	open: boolean;
	/** Last time the file became the active visible workspace file. */
	lastViewedAt: number;
	/** Persisted number of times the indexed file has been opened. */
	viewCount: number;
	/** Has unsaved changes in its editor. */
	unsaved?: boolean;
	/** Is the workspace's active leaf. */
	active?: boolean;
}

/** A node in the read-only document neighborhood graph. */
export interface AtlasGraphNode {
	id: string;
	label: string;
	/** Distance from the current document: 0 = current, 1 = 1-hop, 2 = 2-hop. */
	hop: 0 | 1 | 2;
	/** Vault path when the node maps to a real note. */
	path?: string;
	sub?: string;
}

/** An edge in the neighborhood graph. */
export interface AtlasGraphEdge {
	from: string;
	to: string;
	/** Reference link vs. semantic (index-discovered) relation. */
	kind: 'reference' | 'semantic';
}

export interface AtlasGraphData {
	nodes: AtlasGraphNode[];
	edges: AtlasGraphEdge[];
}

/** Resolved image resource for the Inspector preview. */
export interface AtlasImageInfo {
	/** Displayable resource URL (Obsidian resource path). */
	src: string;
	/** File size in bytes, when known. */
	sizeBytes: number | null;
	/** Uppercase extension, e.g. "PNG". */
	format: string;
}

export interface FileAtlasHostPort {
	/** File identity owned by the active Markdown or Composer leaf. */
	getActiveDocumentPath(): string | null;
	/** Snapshot of currently-open markdown documents (for the rail). */
	listOpenDocs(): OpenDocMeta[];
	/** Recent + frequently viewed Markdown candidates used to fill the rail. */
	listHistoryDocs(limit: number): Promise<OpenDocMeta[]>;
	/** Subscribe to workspace layout / active-leaf changes; returns an unsubscribe. */
	subscribeOpenDocs(cb: () => void): () => void;
	/** Read a document's current content by path. */
	readDoc(path: string): Promise<string>;
	/** Focus an existing file leaf, or open the recent file in a new tab. */
	activateDoc(path: string): Promise<void>;
	/**
	 * Open a link block's target: navigate a vault link (`note`, `note#heading`,
	 * `note#^block`) resolved relative to `sourcePath`, or open an external URL in
	 * the browser when `external` is true.
	 */
	openLink(target: string, sourcePath: string, external: boolean): void;
	/** Close the document's leaf. */
	closeDoc(path: string): void;
	/** Reveal a source location without changing an existing document View. */
	revealLocation(path: string, location: DocumentSourceLocation): Promise<boolean>;
	/**
	 * The 1-based cursor line in `path`'s open editor, or null when the note isn't
	 * open in an editor / has no cursor. Used to frame the tree on the block the
	 * user is currently editing. Optional so tree-only hosts can omit it.
	 */
	getCursorLine?(path: string): number | null;
	/** Copy text to the clipboard. */
	copyToClipboard(text: string): void | Promise<void>;
	/** Best-effort user notification. */
	notify(message: string): void;
	/**
	 * Resolve an image link target (from an Image block) to a displayable
	 * resource + metadata, or null if it can't be resolved. Optional so
	 * tree-only hosts can omit it (the Inspector falls back to a media card).
	 */
	resolveImage?(target: string, sourcePath: string): Promise<AtlasImageInfo | null>;
	/** Copy the resolved image bytes to the clipboard. Optional. */
	copyImage?(target: string, sourcePath: string): Promise<void>;
	/**
	 * Load the read-only neighborhood graph around `path`, out to `hops` hops,
	 * optionally including index-discovered semantic edges. Optional so Phase 1
	 * (tree-only) hosts can omit it.
	 */
	loadNeighborhood?(path: string, opts: { hops: 1 | 2; semantic: boolean }): Promise<AtlasGraphData>;
}
