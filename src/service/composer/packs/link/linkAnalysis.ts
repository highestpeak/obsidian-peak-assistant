/**
 * Peak Composer — link / citation / embed / attachment analysis (WP8, §10.13).
 *
 * Framework-neutral detection over a block's verbatim Markdown source. It
 * classifies every reference token, exposes the exact source range (so the UI
 * can make each navigation target hover/click/keyboard reachable via the WP4
 * link layer), and provides the deterministic transforms the link capability
 * pack rides on:
 *   - internal links  → double-link (MOC line) generation, broken-link probe;
 *   - external links  → host extraction for a link card / summary;
 *   - footnotes       → inline ⇄ reference conversion;
 *   - embeds          → expand-to-link / anchor-repair helpers;
 *   - attachments     → citation-line generation.
 *
 * Resolution of an internal target to a real vault note (existence, title,
 * summary) is an app-layer concern (metadata cache) — this module stays pure
 * and consumes only the source text.
 */

import type { ComposerNativeKind } from '@/core/composer';

export type ComposerLinkTokenKind =
	| 'internal' // [[wikilink]] to a note
	| 'internal-heading' // [[note#heading]] / [[#heading]]
	| 'external' // [text](https://…) or bare URL
	| 'embed' // ![[…]] embed of a note/section
	| 'image' // ![[img.png]] / ![](img.png)
	| 'attachment' // ![[file.pdf]] and similar non-image binaries
	| 'footnote-ref' // [^id] usage
	| 'footnote-inline'; // ^[inline footnote text]

export interface DetectedLink {
	kind: ComposerLinkTokenKind;
	/** The full matched token (e.g. `[[Note|Alias]]`). */
	raw: string;
	/** The navigation target (vault path/note name, URL, or footnote id). */
	target: string;
	/** Display/alias text when present. */
	display?: string;
	/** Heading/block anchor after `#`, when present. */
	anchor?: string;
	/** Source offset of the token, relative to the analyzed slice. */
	from: number;
	to: number;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif'];
const ATTACHMENT_EXTS = ['pdf', 'docx', 'pptx', 'xlsx', 'zip', 'mp3', 'mp4', 'mov', 'wav', 'csv'];

// Order matters: embeds (`![[ ]]` / `![]( )`) are matched before plain links.
const EMBED_WIKI_RE = /!\[\[([^\]]+)\]\]/g;
const WIKILINK_RE = /(?<!!)\[\[([^\]]+)\]\]/g;
const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const MD_LINK_RE = /(?<!!)\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g;
const BARE_URL_RE = /(?<![("[])\bhttps?:\/\/[^\s)>\]]+/g;
const FOOTNOTE_REF_RE = /(?<!\^)\[\^([^\]]+)\]/g;
const FOOTNOTE_INLINE_RE = /\^\[([^\]]+)\]/g;

/** Detect every reference in a source slice, in source order. */
export function analyzeLinks(source: string): DetectedLink[] {
	const out: DetectedLink[] = [];
	collect(source, EMBED_WIKI_RE, out, (m) => classifyWikiEmbed(m[1], m[0], m.index));
	collect(source, WIKILINK_RE, out, (m) => classifyWikiLink(m[1], m[0], m.index));
	collect(source, MD_IMAGE_RE, out, (m) => classifyMdImage(m[1], m[0], m.index));
	collect(source, MD_LINK_RE, out, (m) => classifyMdLink(m[1], m[2], m[0], m.index));
	collect(source, BARE_URL_RE, out, (m) => {
		// Trailing sentence punctuation (.,;:!?) and a closing paren are not part
		// of the URL — trim them so `…foo.org/y.` yields `https://foo.org/y`.
		const url = m[0].replace(/[.,;:!?)\]]+$/, '');
		return { kind: 'external' as const, raw: url, target: url, from: m.index, to: m.index + url.length };
	});
	collect(source, FOOTNOTE_INLINE_RE, out, (m) => ({
		kind: 'footnote-inline' as const,
		raw: m[0],
		target: m[1],
		from: m.index,
		to: m.index + m[0].length,
	}));
	collect(source, FOOTNOTE_REF_RE, out, (m) => ({
		kind: 'footnote-ref' as const,
		raw: m[0],
		target: m[1],
		from: m.index,
		to: m.index + m[0].length,
	}));
	return dedupeByRange(out).sort((a, b) => a.from - b.from);
}

function collect(
	source: string,
	re: RegExp,
	out: DetectedLink[],
	build: (m: RegExpExecArray) => DetectedLink | null,
): void {
	re.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) {
		const link = build(m);
		if (link) out.push(link);
	}
}

/** Later, more specific passes win over an earlier overlapping range. */
function dedupeByRange(links: DetectedLink[]): DetectedLink[] {
	const kept: DetectedLink[] = [];
	for (const link of links) {
		const overlap = kept.findIndex((k) => k.from < link.to && link.from < k.to);
		if (overlap === -1) {
			kept.push(link);
			continue;
		}
		// Prefer image/attachment classification over a generic md-link/url.
		if (specificity(link.kind) > specificity(kept[overlap].kind)) kept[overlap] = link;
	}
	return kept;
}

function specificity(kind: ComposerLinkTokenKind): number {
	if (kind === 'image' || kind === 'attachment' || kind === 'embed') return 3;
	if (kind === 'internal' || kind === 'internal-heading' || kind === 'footnote-inline') return 2;
	return 1;
}

function splitWiki(inner: string): { path: string; anchor?: string; display?: string } {
	const [linkPart, ...aliasParts] = inner.split('|');
	const display = aliasParts.length > 0 ? aliasParts.join('|') : undefined;
	const [path, ...anchorParts] = linkPart.split('#');
	const anchor = anchorParts.length > 0 ? anchorParts.join('#') : undefined;
	return {
		path: path.trim(),
		...(anchor ? { anchor: anchor.trim() } : {}),
		...(display ? { display: display.trim() } : {}),
	};
}

function classifyWikiEmbed(inner: string, raw: string, index: number): DetectedLink {
	const { path, anchor, display } = splitWiki(inner);
	const native = nativeKindOf(path);
	const kind: ComposerLinkTokenKind = native === 'image' ? 'image' : native === 'attachment' ? 'attachment' : 'embed';
	return range({ kind, raw, target: path, ...(anchor ? { anchor } : {}), ...(display ? { display } : {}) }, index, raw);
}

function classifyWikiLink(inner: string, raw: string, index: number): DetectedLink {
	const { path, anchor, display } = splitWiki(inner);
	const kind: ComposerLinkTokenKind = anchor ? 'internal-heading' : 'internal';
	return range({ kind, raw, target: path, ...(anchor ? { anchor } : {}), ...(display ? { display } : {}) }, index, raw);
}

function classifyMdImage(target: string, raw: string, index: number): DetectedLink {
	const kind: ComposerLinkTokenKind = nativeKindOf(target) === 'attachment' ? 'attachment' : 'image';
	return range({ kind, raw, target }, index, raw);
}

function classifyMdLink(display: string, target: string, raw: string, index: number): DetectedLink {
	if (/^https?:\/\//.test(target)) return range({ kind: 'external', raw, target, display }, index, raw);
	return range({ kind: 'internal', raw, target, display }, index, raw);
}

function range(base: Omit<DetectedLink, 'from' | 'to'>, index: number, raw: string): DetectedLink {
	return { ...base, from: index, to: index + raw.length };
}

function nativeKindOf(target: string): ComposerNativeKind {
	const ext = target.split('#')[0].split('.').pop()?.toLowerCase() ?? '';
	if (IMAGE_EXTS.includes(ext)) return 'image';
	if (ATTACHMENT_EXTS.includes(ext)) return 'attachment';
	if (/^https?:\/\//.test(target)) return 'image';
	return 'embed';
}

// ── deterministic transforms (link capability pack rides these) ──────────────

/** Hostname of an external URL (for a link card / summary label). */
export function externalHost(url: string): string | null {
	const m = /^https?:\/\/([^/\s]+)/.exec(url);
	return m ? m[1].replace(/^www\./, '') : null;
}

/** A MOC (map of content) bullet line linking back to a note. */
export function buildMocLine(notePath: string, display?: string): string {
	const name = notePath.replace(/\.md$/, '');
	return display ? `- [[${name}|${display}]]` : `- [[${name}]]`;
}

/** Convert an inline footnote `^[text]` into a reference `[^id]` + its definition. */
export function inlineFootnoteToReference(
	text: string,
	id: string,
): { reference: string; definition: string } {
	return { reference: `[^${id}]`, definition: `[^${id}]: ${text}` };
}

/** Turn an embed `![[target]]` into a plain internal link `[[target]]`. */
export function embedToLink(embedRaw: string): string {
	return embedRaw.replace(/^!\[\[/, '[[');
}

/** Whether a wikilink target already carries a heading/block anchor. */
export function hasAnchor(link: DetectedLink): boolean {
	return typeof link.anchor === 'string' && link.anchor.length > 0;
}

/** Distinct internal note targets referenced in a slice (for backlink/MOC work). */
export function internalTargets(source: string): string[] {
	const seen = new Set<string>();
	for (const link of analyzeLinks(source)) {
		if (link.kind === 'internal' || link.kind === 'internal-heading' || link.kind === 'embed') {
			seen.add(link.target);
		}
	}
	return [...seen];
}
