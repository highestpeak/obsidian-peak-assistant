/**
 * File Atlas — host port (UI ↔ app boundary).
 *
 * File Atlas is framework-agnostic React; anything that touches the Obsidian
 * runtime (enumerating open tabs, reading a note, revealing a line, clipboard,
 * the document neighborhood graph) is injected through this port and composed
 * at the app layer (see FileAtlasModal). Keeps runtime ownership out of the UI.
 */
import type { GraphEdgeDirectionality } from '@/core/types/graph-edge';

import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import type { ComposerCapabilityId } from '@/core/composer';

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
	/** Shared Graph hover-card evidence from the canonical node projection. */
	summary?: string;
	signals?: string[];
	incomingLinks?: number;
	outgoingLinks?: number;
}

/** An edge in the neighborhood graph. */
export interface AtlasGraphEdge {
	from: string;
	to: string;
	/** Reference link vs. semantic (index-discovered) relation. */
	kind: 'reference' | 'semantic' | 'hub_constituent';
	/** Whether the renderer uses an end arrow, no arrow, or arrows at both ends. */
	directionality?: GraphEdgeDirectionality;
}

export interface AtlasGraphData {
	nodes: AtlasGraphNode[];
	hubAnchors: Array<{
		id: string;
		path: string;
		label: string;
		constituentCount: number;
	}>;
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

/** Transient, network-backed metadata for an external link. Never persisted. */
export interface AtlasExternalLinkPreview {
	url: string;
	domain: string;
	title: string;
	description?: string;
	siteName?: string;
	imageUrl?: string;
	faviconUrl?: string;
}

/** Transient content preview for a linked Vault note; never persisted. */
export interface AtlasVaultLinkPreview {
	path: string;
	title: string;
	excerpt: string;
}

/** A real Composer block-row capability projected onto a File Atlas element. */
export interface AtlasQuickAction {
	capabilityId: ComposerCapabilityId;
	title: string;
	description?: string;
	lucideIcon?: string;
	disabledReason?: string;
}

export interface AtlasQuickActionSnapshot {
	status: 'ready' | 'unavailable';
	actions: AtlasQuickAction[];
}

/** Read-only projection of the canonical Composer Intelligence finding. */
export interface AtlasCopilotSuggestion {
	findingId: string;
	/** Canonical Composer target; used for same-run handoff to the native modal. */
	targetBlockId: string | null;
	/** Source range lets Atlas project findings onto its independently parsed tree. */
	targetFrom: number | null;
	targetTo: number | null;
	title: string;
	summary: string;
	targetLabel: string;
	evidenceLabel: string;
	state: 'active' | 'stale';
	priority: number;
}

export interface AtlasCopilotSuggestionSnapshot {
	status: 'ready' | 'unavailable';
	suggestions: AtlasCopilotSuggestion[];
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
	readDoc(path: string, signal?: AbortSignal): Promise<string>;
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
	/** Load remote metadata in memory for an external-link preview card. */
	loadExternalLinkPreview?(url: string): Promise<AtlasExternalLinkPreview | null>;
	/** Read a linked Vault note into a transient page preview; never stores an image. */
	loadVaultLinkPreview?(target: string, sourcePath: string): Promise<AtlasVaultLinkPreview | null>;
	/** Project the exact Composer block-row actions for an Atlas source range. */
	loadQuickActions?(
		path: string,
		location: DocumentSourceLocation,
		signal?: AbortSignal,
	): Promise<AtlasQuickActionSnapshot>;
	/** Open Composer at the source range and invoke the same canonical capability. */
	runQuickAction?(
		path: string,
		location: DocumentSourceLocation,
		capabilityId: ComposerCapabilityId,
	): Promise<boolean>;
	/**
	 * Load the read-only neighborhood graph around `path`, out to `hops` hops,
	 * optionally including index-discovered semantic edges. Optional so Phase 1
	 * (tree-only) hosts can omit it.
	 */
	loadNeighborhood?(
		path: string,
		opts: { hops: 1 | 2; semantic: boolean },
		signal?: AbortSignal,
	): Promise<AtlasGraphData>;
	/**
	 * Read suggestions from the same per-document IntelligenceRuntime used by
	 * Composer and the native Markdown companion. File Atlas owns no generator.
	 */
	loadCopilotSuggestions?(path: string, signal?: AbortSignal): Promise<AtlasCopilotSuggestionSnapshot>;
	/** Escalate to the shared native Copilot surface; File Atlas never writes. */
	openCopilot?(path: string, context?: {
		blockId?: string;
		findingId?: string;
		sourceFrom?: number;
		sourceTo?: number;
	}): void;
}
