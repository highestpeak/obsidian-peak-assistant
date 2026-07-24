/**
 * File Atlas — Phase 0 data model.
 *
 * File Atlas is an ordered, block-level map of a single Markdown document. The
 * parser in this folder turns raw Markdown into an ordered tree of
 * {@link DocumentBlock} nodes. This is deterministic, framework-agnostic, and
 * carries no AI/persistence concerns (those are later phases).
 *
 * Design source: docs/superpowers/specs/2026-07-08-file-atlas-design.md
 *   (Layer Model → Raw Block Layer; Block Anchoring → FileAtlasAnchor).
 *
 * Hard rules encoded here:
 *  - Vault links, external links, and embeds/attachments are THREE distinct
 *    block kinds — never a single generic "link" kind.
 *  - Headings are containers; the tree preserves document order.
 *  - Every block carries an anchor shape (blockId, contentHash, line range,
 *    nearestHeading, ordinalInHeading, blockType). Phase 0 only computes it;
 *    persistence / re-anchoring is Phase 2+.
 */

/**
 * Raw block kinds produced by deterministic parsing. This is the Phase 0
 * surface — insight/issue kinds (claim, evidence, action, …) require the
 * Phase 2 persisted-insight store and are intentionally absent here.
 *
 * Kept as a const object (not a bare union) so callers can iterate all kinds
 * and so the kind→label/icon/badge config module can key off it.
 */
export const RawBlockKind = {
	/** Synthetic document root (the file itself). */
	FileRoot: 'file-root',
	/**
	 * Synthetic collapsible container that groups the document's leading
	 * frontmatter Property/Tag blocks under one folding title. Never emitted by
	 * the parser — the tree view-model wraps the leading property/tag run into a
	 * single Frontmatter node so it reads (and folds) like a heading section.
	 */
	Frontmatter: 'frontmatter',
	/** A single frontmatter / properties key-value line. */
	Property: 'property',
	/** A tag reference (#tag or frontmatter `tags`). */
	Tag: 'tag',
	Heading: 'heading',
	Paragraph: 'paragraph',
	List: 'list',
	Task: 'task',
	Callout: 'callout',
	Quote: 'quote',
	Table: 'table',
	Code: 'code',
	Math: 'math',
	Mermaid: 'mermaid',
	Image: 'image',
	/** `![[embed]]` of a non-image note/media (canvas, audio, video, …). */
	Embed: 'embed',
	/** `![[file.pdf]]` and other embedded file attachments. */
	Attachment: 'attachment',
	Footnote: 'footnote',
	/** `[[note]]`, `[[note#heading]]`, `[[note#^block]]` — internal navigation. */
	VaultLink: 'vault-link',
	/** Bare URL or `[text](https://…)` / mailto: — internet reference. */
	ExternalLink: 'external-link',
} as const;

export type RawBlockKind = (typeof RawBlockKind)[keyof typeof RawBlockKind];

/**
 * Anchor data shape from the spec's `FileAtlasAnchor`. Phase 0 computes these
 * fields during parse; `status` is always `active` here because there is no
 * persisted prior anchor to compare against yet (re-anchoring is Phase 4).
 */
export interface FileAtlasAnchor {
	filePath: string;
	/** Stable-ish id assigned by the current parse (document-order + kind). */
	blockId: string;
	/** Title of the nearest enclosing heading, or null at document top-level. */
	nearestHeading: string | null;
	blockType: RawBlockKind;
	/** 0-based position of this block within its nearest heading's children. */
	ordinalInHeading: number;
	/** Stable hash of the block's source text (drives future re-anchoring). */
	contentHash: string;
	/** 1-based inclusive start line in the source file. */
	lineStart: number;
	/** 1-based inclusive end line in the source file. */
	lineEnd: number;
	status: 'active' | 'stale' | 'unresolved';
}

/**
 * One node in the ordered document tree.
 *
 * Only {@link RawBlockKind.Heading} blocks carry `children`; every other kind
 * is a leaf. Order of `children` mirrors document order exactly.
 */
export interface DocumentBlock {
	/** Same value as `anchor.blockId` — hoisted for convenient keying. */
	id: string;
	kind: RawBlockKind;
	/** Primary label shown in the tree row. */
	title: string;
	/** Secondary descriptor (e.g. "3 items", "TypeScript · 32 lines"). */
	sub?: string;
	/** Heading depth (1–6). Only present when `kind === 'heading'`. */
	level?: number;
	/** Raw source slice for this block (used by Inspector preview). */
	source: string;
	anchor: FileAtlasAnchor;
	/** Heading containers only. */
	children?: DocumentBlock[];

	/**
	 * Kind-specific extras surfaced by the Inspector. Deterministic, no network.
	 */
	detail?: BlockDetail;
}

/** Kind-specific structured detail computed at parse time. */
export interface BlockDetail {
	/** External links: registrable domain / host. */
	domain?: string;
	/** Links: raw target (URL or vault path incl. #heading / #^block). */
	target?: string;
	/** Vault links: the `#heading` or `#^block` fragment, if any. */
	linkFragment?: string;
	/** External links: true when the URL was bare (not `[text](url)`). */
	nakedUrl?: boolean;
	/** Code / math / mermaid: fenced language id. */
	language?: string;
	/** Code / list / table: line or item count. */
	lineCount?: number;
	/** Lists: number of top-level items. */
	itemCount?: number;
	/** Tables: row / column counts. */
	rows?: number;
	columns?: number;
	/** Tasks: whether the checkbox is checked. */
	checked?: boolean;
	/** Callouts: the `[!type]` keyword (lowercased). */
	calloutType?: string;
	/** Images / embeds / attachments: resolved-ish file target. */
	fileTarget?: string;
}

/** Result of parsing a whole document into the Atlas tree. */
export interface AtlasDocument {
	filePath: string;
	/** Ordered top-level blocks (properties, tags, headings, loose blocks). */
	blocks: DocumentBlock[];
	stats: AtlasStats;
}

/** Lightweight counts for the doc-context bar. */
export interface AtlasStats {
	words: number;
	/** Total non-heading blocks. */
	blocks: number;
	/** Resource-category blocks (links, media, embeds, tables, code, math, tags). */
	resources: number;
}
