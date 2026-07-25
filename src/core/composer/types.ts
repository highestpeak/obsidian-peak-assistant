/**
 * Peak Composer — framework-neutral domain types (WP1 / Phase 1).
 *
 * These types are the source-of-truth model the whole Composer wave builds on.
 * They intentionally know NOTHING about Obsidian, React, or the DOM: the
 * boundary test (`test/boundary/service-layer-boundaries.test.ts`) forbids the
 * service layer from importing `obsidian`, and everything here must stay
 * portable to tests / future non-Obsidian hosts.
 *
 * Design contract (locked by WP0 gate — see
 * docs/superpowers/plans/2026-07-25-composer-wave-execution-log.md §S1):
 *
 *   1. A {@link ComposerDocumentSnapshot} is a *lossless index over the source
 *      bytes*. Every {@link ComposerBlock} carries a {@link SourceAnchor}
 *      `{from,to}` byte range; block content is ALWAYS the verbatim byte slice
 *      `sourceText.slice(from,to)` — the parser never re-serializes. This makes
 *      round-trip a splice and preserves unknown Markdown / native syntax
 *      "by construction".
 *
 *   2. Reconstructing the document by walking block ranges + inter-block gaps
 *      MUST return the original `sourceText` byte-for-byte. This "reconstruct ===
 *      source" invariant is asserted now (WP1); the real block patcher lands in
 *      WP2, but the contract — patches must preserve the trailing separator
 *      between blocks — is encoded here and in the tests so WP2 cannot regress
 *      it (see {@link SourceAnchor} notes).
 *
 *   3. Sub-block addressing is a first-class concern: list items, table cells,
 *      and callout bodies each get their own {@link ComposerSubBlockAnchor}
 *      with independent `{from,to}` byte ranges (mdast nested nodes carry their
 *      own offsets). WP4 (list/cross-unit editing) and WP6 (table cell
 *      selection/merge) depend on these anchors existing today.
 */

/**
 * Top-level block taxonomy. Every top-level mdast node maps to exactly one
 * kind; anything the parser cannot confidently classify falls back to
 * {@link 'unknown'} and is still rendered verbatim (never dropped).
 *
 * `base` / `canvas` / `excalidraw` are reserved for the future native-file
 * hosts (WP8). In a Markdown document those objects appear as embeds and are
 * captured as {@link ComposerNativeRef}s, not as top-level blocks.
 */
export type ComposerBlockKind =
	| 'frontmatter'
	| 'heading'
	| 'paragraph'
	| 'list'
	| 'task'
	| 'quote'
	| 'callout'
	| 'divider'
	| 'code'
	| 'math'
	| 'table'
	| 'image'
	| 'mermaid'
	| 'dataview'
	| 'html'
	| 'comment'
	| 'footnote-def'
	| 'embed'
	| 'base'
	| 'canvas'
	| 'excalidraw'
	| 'unknown';

/** Sub-block unit taxonomy for nested addressing (WP4 / WP6). */
export type ComposerUnitKind =
	| 'list-item'
	| 'table-row'
	| 'table-cell'
	| 'callout-body';

/**
 * A byte-range anchor into a specific document revision.
 *
 * `from`/`to` are UTF-16 offsets into `ComposerDocumentSnapshot.sourceText`
 * (the same offset space JS `String.slice` uses). `semanticFingerprint` is a
 * content hash of the exact byte slice; before any WP2 patch is applied the
 * fingerprint MUST be revalidated against the live source so a drifted /
 * externally-modified block is caught instead of silently overwritten.
 *
 * Patch contract (enforced from WP2, asserted structurally from WP1): a block
 * patch may only replace bytes strictly INSIDE `[from,to)`. The inter-block
 * separator (blank line / whitespace that belongs to no block) lives in the
 * gap between one block's `to` and the next block's `from` and must never be
 * absorbed into a block range — otherwise a reparse fuses adjacent blocks.
 */
export interface SourceAnchor {
	revision: string;
	from: number;
	to: number;
	semanticFingerprint: string;
}

/**
 * Anchor for an addressable sub-unit inside a block (a list item, a table
 * cell, a callout body paragraph). Mirrors {@link SourceAnchor} at finer
 * granularity so WP4/WP6 can target and patch a single unit.
 */
export interface ComposerSubBlockAnchor {
	/** Stable-within-revision id, unique inside the owning block. */
	unitId: string;
	unitKind: ComposerUnitKind;
	from: number;
	to: number;
	fingerprint: string;
	/** Parent unit id for nested list items (`li-0` → `li-0.1`). */
	parentUnitId?: string;
	/** Grid coordinates for table cells (0-based; header row is `row === 0`). */
	row?: number;
	col?: number;
	/** True for the header row's cells — WP6 pipe/HTML upgrade needs this. */
	isHeader?: boolean;
}

/**
 * Lightweight, kind-tagged render hints. The renderer never needs to re-parse:
 * `raw` is the verbatim slice, and the optional fields carry the cheap
 * structural facts (heading level, code language, callout type, …) already
 * known from the mdast node. Rich rendering (KaTeX, Mermaid, tables) is layered
 * on top in later WPs; WP1 renders from `raw` + these hints.
 */
export interface ComposerRenderModel {
	/** Verbatim source slice for this block — the render fallback of last resort. */
	raw: string;
	/** Plain-text preview (first meaningful line), used for collapsed summaries. */
	text?: string;
	/** Heading depth 1–6. */
	level?: number;
	/** Ordered vs bullet list. */
	ordered?: boolean;
	/** Task checkbox state of the first item (`null` = mixed / unknown). */
	checked?: boolean | null;
	/** Fenced-code / dataview language token. */
	language?: string;
	/** Obsidian callout type (`note`, `warning`, …), lower-cased. */
	calloutType?: string;
	/** List item count. */
	itemCount?: number;
	/** Table body-row / column counts. */
	rows?: number;
	columns?: number;
}

/**
 * One top-level block: a lossless window over the source plus its render model
 * and any addressable sub-units.
 *
 * `parentId` / `children` are reserved for future block-tree nesting (heading
 * sections). WP1 produces a FLAT block stream — section membership is derived
 * on demand from heading levels (see `sections.ts`) rather than materialized —
 * so these stay `undefined` / `[]` today but are part of the locked shape.
 */
export interface ComposerBlock {
	blockId: string;
	kind: ComposerBlockKind;
	source: SourceAnchor;
	parentId?: string;
	children: readonly string[];
	units: readonly ComposerSubBlockAnchor[];
	renderModel: ComposerRenderModel;
}

/** Native / embedded object kinds a Markdown block can point at. */
export type ComposerNativeKind =
	| 'image'
	| 'attachment'
	| 'embed'
	| 'base'
	| 'canvas'
	| 'excalidraw'
	| 'unknown';

/**
 * A reference from a Markdown block to a native / embedded object (image,
 * `.base`, `.canvas`, `.excalidraw`, generic embed). Kept as a typed reference
 * — NOT flattened into prose — so WP7/WP8 can attach format-specific adapters.
 * `source` locates the reference token itself within the document.
 */
export interface ComposerNativeRef {
	refId: string;
	/** Owning block. */
	blockId: string;
	kind: ComposerNativeKind;
	/** Vault path or external URL the reference points at. */
	target: string;
	source: SourceAnchor;
}

/**
 * The immutable parse result for one document at one revision. This is the
 * object handed across the WP1→WP2 boundary: WP2 reads `sourceText` + block
 * `SourceAnchor`s to build transactions, revalidates fingerprints, and splices.
 */
export interface ComposerDocumentSnapshot {
	documentId: string;
	filePath: string;
	revision: string;
	sourceText: string;
	blocks: readonly ComposerBlock[];
	nativeRefs: readonly ComposerNativeRef[];
}

/**
 * A pointer to something the Composer can act on. WP1 needed document / block /
 * unit granularity; the editing chrome (WP4.5 integration) adds a `selection`
 * target that carries an explicit source byte range `[from,to)` inside a block/
 * unit, so a selection-scoped AI action replaces exactly the selected bytes
 * (never the whole block). Table object-range targets arrive with WP6. This
 * shape is referenced by the frozen capability contract but is itself additive
 * (see execution log 2026-07-25 WP4.5 note).
 */
export type ComposerTarget =
	| { kind: 'document'; documentId: string }
	| { kind: 'block'; blockId: string }
	| { kind: 'unit'; blockId: string; unitId: string }
	| { kind: 'selection'; blockId: string; unitId?: string; from: number; to: number };

/**
 * The block a target is anchored to, or null for a whole-document target. The
 * one place every target→blockId derivation goes through, so adding a target
 * kind is a single-file change for the grouping/anchoring helpers that consume it.
 */
export function composerTargetBlockId(target: ComposerTarget): string | null {
	if (target.kind === 'document') return null;
	return target.blockId;
}

/**
 * Lifecycle status of a document host. `stale` means the underlying file was
 * modified out from under the snapshot (external edit) and must be revalidated
 * before further work — the read-only WP1 host surfaces it; WP2 turns it into
 * transaction-aware conflict handling.
 */
export type ComposerLifecycleStatus =
	| 'empty'
	| 'loading'
	| 'loaded'
	| 'missing'
	| 'stale'
	| 'error';

/** The observable state the read-only view renders. */
export interface DocumentComposerState {
	status: ComposerLifecycleStatus;
	filePath: string | null;
	snapshot: ComposerDocumentSnapshot | null;
	error?: string;
}

/**
 * Minimal external-store contract the read-only UI subscribes to. The app-layer
 * lifecycle controller satisfies it structurally, so the UI never imports the
 * app layer — it depends only on this neutral shape.
 */
export interface ComposerStateSource {
	getState(): DocumentComposerState;
	subscribe(cb: (state: DocumentComposerState) => void): () => void;
}
