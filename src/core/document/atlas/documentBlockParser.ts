/**
 * File Atlas — deterministic Markdown → ordered block tree parser (Phase 0).
 *
 * Turns raw Markdown into an ordered {@link AtlasDocument}. Order is document
 * order; headings become containers; links are split into three kinds
 * (vault / external / embed-attachment) per the spec hard rule.
 *
 * Why remark AST (not Obsidian metadata cache): the parser must run
 * framework-agnostically (tests, future non-Obsidian hosts) and must produce
 * *ordered* blocks with accurate line ranges. Remark's mdast already carries
 * `position.start.line` / `position.end.line` for every node and is the
 * project's canonical Markdown parser (see src/core/utils/markdown-utils.ts).
 * Obsidian's `metadataCache` gives headings/links/tags but NOT an ordered block
 * stream with source slices, so it can't be the backbone here. A thin
 * line-level pass supplements mdast for constructs mdast under-describes:
 * callouts (`> [!type]`), math (`$$…$$`), mermaid fences, external-vs-vault
 * link classification, and embed/attachment kind detection.
 */

import { hashString } from '@/core/utils/hash-utils';
import type { Root, RootContent } from 'mdast';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import matter from 'gray-matter';
import {
	type AtlasDocument,
	type AtlasStats,
	type BlockDetail,
	type DocumentBlock,
	type FileAtlasAnchor,
	RawBlockKind,
} from './types';
import {
	ATTACHMENT_EXTENSIONS,
	IMAGE_EXTENSIONS,
	classifyEmbedTarget,
	extractDomain,
	isExternalUrl,
} from './linkClassifier';

const processor = remark().use(remarkFrontmatter, ['yaml']).use(remarkGfm);

/** Kinds counted as "resources" in the doc-context stats bar. */
const RESOURCE_KINDS: ReadonlySet<RawBlockKind> = new Set([
	RawBlockKind.Tag,
	RawBlockKind.Property,
	RawBlockKind.Table,
	RawBlockKind.Code,
	RawBlockKind.Math,
	RawBlockKind.Mermaid,
	RawBlockKind.Image,
	RawBlockKind.Embed,
	RawBlockKind.Attachment,
	RawBlockKind.Footnote,
	RawBlockKind.VaultLink,
	RawBlockKind.ExternalLink,
]);

interface ParseCtx {
	filePath: string;
	lines: string[];
	/** monotonically increasing per-parse counter for blockId uniqueness. */
	seq: number;
}

/**
 * Parse a Markdown string into an ordered Atlas document tree.
 *
 * @param content Raw file content (frontmatter included).
 * @param filePath Vault-relative path — stored on every anchor.
 */
export function parseDocumentBlocks(content: string, filePath: string): AtlasDocument {
	const ctx: ParseCtx = { filePath, lines: content.split(/\r?\n/), seq: 0 };
	const ast = safeParse(content);

	const top: DocumentBlock[] = [];

	// 1. Frontmatter → one Property block per key; tags become Tag blocks.
	emitFrontmatter(ctx, ast, top);

	// 2. Walk top-level AST children in document order, nesting under headings.
	const headingStack: DocumentBlock[] = [];
	const pushBlock = (block: DocumentBlock): void => {
		const parent = headingStack.length ? headingStack[headingStack.length - 1] : null;
		const siblings = parent ? (parent.children ??= []) : top;
		block.anchor.ordinalInHeading = siblings.length;
		block.anchor.nearestHeading = parent ? parent.title : null;
		siblings.push(block);
	};

	for (const node of ast.children) {
		if (node.type === 'yaml') continue; // handled above
		if (node.type === 'heading') {
			const heading = makeHeading(ctx, node);
			// Pop headings of equal-or-deeper level so nesting follows depth.
			while (
				headingStack.length &&
				(headingStack[headingStack.length - 1].level ?? 0) >= (heading.level ?? 0)
			) {
				headingStack.pop();
			}
			const parent = headingStack.length ? headingStack[headingStack.length - 1] : null;
			const siblings = parent ? (parent.children ??= []) : top;
			heading.anchor.ordinalInHeading = siblings.length;
			heading.anchor.nearestHeading = parent ? parent.title : null;
			siblings.push(heading);
			headingStack.push(heading);
			continue;
		}
		for (const block of makeBlocksFromNode(ctx, node)) pushBlock(block);
	}

	return { filePath, blocks: top, stats: computeStats(content, top) };
}

function safeParse(content: string): Root {
	const ast = processor.parse(content) as Root;
	if (!ast || !Array.isArray(ast.children)) {
		return { type: 'root', children: [] };
	}
	return ast;
}

// --------------------------------------------------------------------------
// frontmatter
// --------------------------------------------------------------------------

function emitFrontmatter(ctx: ParseCtx, ast: Root, out: DocumentBlock[]): void {
	const yaml = ast.children.find((c) => c.type === 'yaml') as
		| (RootContent & { value: string })
		| undefined;
	if (!yaml) return;
	const startLine = yaml.position?.start.line ?? 1;
	const endLine = yaml.position?.end.line ?? startLine;

	let data: Record<string, unknown> = {};
	try {
		data = matter(`---\n${yaml.value}\n---`).data ?? {};
	} catch {
		data = {};
	}

	// One Property block per top-level frontmatter key. `tags` also fans out
	// into Tag blocks so they show up in the References group.
	const yamlLines = yaml.value.split(/\r?\n/);
	let ordinal = 0;
	for (const [key, value] of Object.entries(data)) {
		const rel = yamlLines.findIndex((l) => l.trimStart().startsWith(`${key}:`));
		const line = rel >= 0 ? startLine + 1 + rel : startLine;
		const rendered = renderScalar(value);
		out.push(
			finalizeLeaf(ctx, {
				kind: RawBlockKind.Property,
				title: `${key}: ${truncate(rendered, 60)}`,
				sub: 'Frontmatter property',
				source: `${key}: ${rendered}`,
				lineStart: line,
				lineEnd: line,
				ordinal: ordinal++,
			})
		);
	}

	if (data.tags !== undefined) {
		for (const tag of normalizeTags(data.tags)) {
			out.push(
				finalizeLeaf(ctx, {
					kind: RawBlockKind.Tag,
					title: `#${tag}`,
					sub: 'Frontmatter tag',
					source: `#${tag}`,
					lineStart: startLine,
					lineEnd: endLine,
					ordinal: ordinal++,
				})
			);
		}
	}
}

// --------------------------------------------------------------------------
// headings
// --------------------------------------------------------------------------

function makeHeading(ctx: ParseCtx, node: RootContent & { depth?: number }): DocumentBlock {
	const line = node.position?.start.line ?? 1;
	const text = sliceLines(ctx, line, node.position?.end.line ?? line).replace(/^#+\s*/, '').trim();
	const level = node.depth ?? 1;
	const block = finalizeLeaf(ctx, {
		kind: RawBlockKind.Heading,
		title: text || '(untitled heading)',
		source: sliceLines(ctx, line, node.position?.end.line ?? line),
		lineStart: line,
		lineEnd: node.position?.end.line ?? line,
		ordinal: 0,
	});
	block.level = level;
	block.children = [];
	return block;
}

// --------------------------------------------------------------------------
// block-producing nodes
// --------------------------------------------------------------------------

/**
 * Expand a single top-level AST node into zero or more Atlas blocks. Some nodes
 * (paragraphs) yield the paragraph itself *plus* extracted link/tag/image
 * blocks so resources surface as their own tree nodes in document order.
 */
function makeBlocksFromNode(ctx: ParseCtx, node: RootContent): DocumentBlock[] {
	const start = node.position?.start.line ?? 1;
	const end = node.position?.end.line ?? start;
	const raw = sliceLines(ctx, start, end);

	switch (node.type) {
		case 'thematicBreak':
			return [];

		case 'code': {
			const lang = (node as any).lang ?? '';
			const kind = lang === 'mermaid' ? RawBlockKind.Mermaid : RawBlockKind.Code;
			const inner = (node as any).value ?? '';
			const lineCount = inner ? inner.split('\n').length : 0;
			return [
				finalizeLeaf(ctx, {
					kind,
					title:
						kind === RawBlockKind.Mermaid
							? firstMeaningfulLine(inner) || 'Mermaid diagram'
							: `${lang || 'text'} code block`,
					sub: kind === RawBlockKind.Mermaid ? 'Mermaid diagram' : `${lineCount} lines`,
					source: raw,
					lineStart: start,
					lineEnd: end,
					detail: { language: lang || undefined, lineCount },
					ordinal: 0,
				}),
			];
		}

		case 'table': {
			const rows = (node as any).children?.length ?? 0;
			const columns = (node as any).children?.[0]?.children?.length ?? 0;
			return [
				finalizeLeaf(ctx, {
					kind: RawBlockKind.Table,
					title: firstMeaningfulText(raw) || 'Table',
					sub: `${Math.max(0, rows - 1)} rows · ${columns} columns`,
					source: raw,
					lineStart: start,
					lineEnd: end,
					detail: { rows: Math.max(0, rows - 1), columns },
					ordinal: 0,
				}),
			];
		}

		case 'blockquote': {
			// Callout = blockquote whose first line is `> [!type]`.
			const calloutType = matchCalloutType(raw);
			if (calloutType) {
				return [
					finalizeLeaf(ctx, {
						kind: RawBlockKind.Callout,
						title: calloutTitle(raw) || `${calloutType} callout`,
						sub: `${calloutType} callout`,
						source: raw,
						lineStart: start,
						lineEnd: end,
						detail: { calloutType },
						ordinal: 0,
					}),
				];
			}
			return [
				finalizeLeaf(ctx, {
					kind: RawBlockKind.Quote,
					title: firstMeaningfulText(raw) || 'Quote',
					sub: 'Blockquote',
					source: raw,
					lineStart: start,
					lineEnd: end,
					ordinal: 0,
				}),
			];
		}

		case 'list': {
			return expandList(ctx, node as any, start, end, raw);
		}

		case 'footnoteDefinition': {
			const id = (node as any).identifier ?? '';
			return [
				finalizeLeaf(ctx, {
					kind: RawBlockKind.Footnote,
					title: `[^${id}]`,
					sub: 'Footnote definition',
					source: raw,
					lineStart: start,
					lineEnd: end,
					detail: { target: id },
					ordinal: 0,
				}),
			];
		}

		case 'paragraph': {
			return expandParagraph(ctx, raw, start, end);
		}

		case 'html': {
			// Bare HTML (e.g. <!-- comment -->) — treat as paragraph-ish text.
			return [
				finalizeLeaf(ctx, {
					kind: RawBlockKind.Paragraph,
					title: firstMeaningfulText(raw) || 'HTML block',
					sub: 'HTML block',
					source: raw,
					lineStart: start,
					lineEnd: end,
					ordinal: 0,
				}),
			];
		}

		default: {
			// Unknown container — represent as a paragraph so nothing is lost.
			return [
				finalizeLeaf(ctx, {
					kind: RawBlockKind.Paragraph,
					title: firstMeaningfulText(raw) || node.type,
					sub: 'Body block',
					source: raw,
					lineStart: start,
					lineEnd: end,
					ordinal: 0,
				}),
			];
		}
	}
}

/**
 * A list becomes: one List block for the whole list (with item count), plus a
 * Task block for every checkbox item (tasks are high-signal per the spec and
 * must surface individually). Non-task items stay folded into the List block.
 */
function expandList(
	ctx: ParseCtx,
	node: { children?: any[]; ordered?: boolean },
	start: number,
	end: number,
	raw: string
): DocumentBlock[] {
	const items = node.children ?? [];
	const out: DocumentBlock[] = [
		finalizeLeaf(ctx, {
			kind: RawBlockKind.List,
			title: firstMeaningfulText(raw) || `${node.ordered ? 'Ordered' : 'Bullet'} list`,
			sub: `${items.length} items`,
			source: raw,
			lineStart: start,
			lineEnd: end,
			detail: { itemCount: items.length },
			ordinal: 0,
		}),
	];

	for (const item of items) {
		if (typeof item.checked !== 'boolean') continue;
		const iStart = item.position?.start.line ?? start;
		const iEnd = item.position?.end.line ?? iStart;
		const itemRaw = sliceLines(ctx, iStart, iEnd);
		out.push(
			finalizeLeaf(ctx, {
				kind: RawBlockKind.Task,
				title: itemRaw.replace(/^\s*[-*+]\s*\[.\]\s*/, '').trim() || 'Task',
				sub: item.checked ? 'Checked' : 'Unchecked',
				source: itemRaw,
				lineStart: iStart,
				lineEnd: iEnd,
				detail: { checked: item.checked },
				ordinal: 0,
			})
		);
	}
	return out;
}

/**
 * A paragraph yields the paragraph block plus one block per extracted resource
 * (vault link / external link / image / embed / attachment / naked URL / tag).
 * Resources appear right after their paragraph, preserving reading order.
 */
function expandParagraph(ctx: ParseCtx, raw: string, start: number, end: number): DocumentBlock[] {
	// remark-gfm does not emit math nodes, so a display-math block `$$…$$`
	// arrives here as a paragraph. Detect and reclassify it as Math.
	if (isDisplayMath(raw)) {
		return [
			finalizeLeaf(ctx, {
				kind: RawBlockKind.Math,
				title: firstMeaningfulText(raw.replace(/\$\$/g, '')) || 'Math block',
				sub: 'Math / formula block',
				source: raw,
				lineStart: start,
				lineEnd: end,
				ordinal: 0,
			}),
		];
	}

	const out: DocumentBlock[] = [
		finalizeLeaf(ctx, {
			kind: RawBlockKind.Paragraph,
			title: truncate(firstMeaningfulText(raw), 80) || 'Paragraph',
			sub: 'Body paragraph',
			source: raw,
			lineStart: start,
			lineEnd: end,
			ordinal: 0,
		}),
	];
	extractInlineResources(ctx, raw, start, end).forEach((b) => out.push(b));
	return out;
}

/** True when a source slice is a standalone display-math block. */
function isDisplayMath(raw: string): boolean {
	const trimmed = raw.trim();
	return trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4;
}

// --------------------------------------------------------------------------
// inline resource extraction (links, embeds, images, urls, tags)
// --------------------------------------------------------------------------

const EMBED_RE = /!\[\[([^\]]+)\]\]/g;
const WIKILINK_RE = /(?<!!)\[\[([^\]]+)\]\]/g;
const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const MD_LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const BARE_URL_RE = /(?<![\(<"'\]])\bhttps?:\/\/[^\s<>)\]]+/g;
const INLINE_TAG_RE = /(?:^|\s)#([A-Za-z一-鿿][\w一-鿿/-]*)/g;

/**
 * Extract link/embed/image/url/tag blocks from a raw source slice. Line range
 * of the enclosing block is reused (inline offsets aren't tracked in Phase 0).
 */
export function extractInlineResources(
	ctx: ParseCtx,
	raw: string,
	lineStart: number,
	lineEnd: number
): DocumentBlock[] {
	const out: DocumentBlock[] = [];
	const push = (
		kind: RawBlockKind,
		title: string,
		sub: string,
		source: string,
		detail?: BlockDetail
	): void => {
		out.push(finalizeLeaf(ctx, { kind, title, sub, source, lineStart, lineEnd, detail, ordinal: 0 }));
	};

	// Embeds first (they share the `[[…]]` shape but are prefixed with `!`).
	for (const m of raw.matchAll(EMBED_RE)) {
		const target = m[1].split('|')[0].trim();
		const { kind, fileTarget } = classifyEmbedTarget(target);
		const label = fileTarget || target;
		if (kind === RawBlockKind.Image) push(kind, label, 'Embedded image', m[0], { fileTarget });
		else if (kind === RawBlockKind.Attachment)
			push(kind, label, 'Embedded attachment', m[0], { fileTarget });
		else push(kind, label, 'Embedded note / media', m[0], { fileTarget });
	}

	// Markdown images ![alt](path)
	for (const m of raw.matchAll(MD_IMAGE_RE)) {
		const target = m[1];
		if (isExternalUrl(target)) {
			push(RawBlockKind.Image, target, 'Remote image', m[0], { fileTarget: target, domain: extractDomain(target) });
		} else {
			push(RawBlockKind.Image, target, 'Embedded image', m[0], { fileTarget: target });
		}
	}

	// Vault wiki links [[note]] / [[note#heading]] / [[note#^block]]
	for (const m of raw.matchAll(WIKILINK_RE)) {
		const inner = m[1].split('|')[0].trim();
		const hashIdx = inner.indexOf('#');
		const fragment = hashIdx >= 0 ? inner.slice(hashIdx) : undefined;
		push(RawBlockKind.VaultLink, inner, 'Vault link', m[0], {
			target: inner,
			linkFragment: fragment,
		});
	}

	// Markdown links [text](target)
	for (const m of raw.matchAll(MD_LINK_RE)) {
		const target = m[1];
		if (isExternalUrl(target)) {
			push(RawBlockKind.ExternalLink, extractDomain(target) || target, 'External link', m[0], {
				target,
				domain: extractDomain(target),
				nakedUrl: false,
			});
		} else if (!target.startsWith('#')) {
			// Relative/local path → vault link.
			push(RawBlockKind.VaultLink, target, 'Vault link', m[0], { target });
		}
	}

	// Bare URLs
	for (const m of raw.matchAll(BARE_URL_RE)) {
		const url = m[0];
		push(RawBlockKind.ExternalLink, extractDomain(url) || url, 'External link', url, {
			target: url,
			domain: extractDomain(url),
			nakedUrl: true,
		});
	}

	// Inline tags
	for (const m of raw.matchAll(INLINE_TAG_RE)) {
		const tag = m[1];
		push(RawBlockKind.Tag, `#${tag}`, 'Inline tag', `#${tag}`, { target: tag });
	}

	return out;
}

// --------------------------------------------------------------------------
// leaf finalization + anchor
// --------------------------------------------------------------------------

interface LeafSpec {
	kind: RawBlockKind;
	title: string;
	sub?: string;
	source: string;
	lineStart: number;
	lineEnd: number;
	ordinal: number;
	detail?: BlockDetail;
}

function finalizeLeaf(ctx: ParseCtx, spec: LeafSpec): DocumentBlock {
	const contentHash = hashString(spec.source, 32);
	const blockId = `${spec.kind}-${spec.lineStart}-${(ctx.seq++).toString(36)}-${contentHash.slice(0, 8)}`;
	const anchor: FileAtlasAnchor = {
		filePath: ctx.filePath,
		blockId,
		nearestHeading: null,
		blockType: spec.kind,
		ordinalInHeading: spec.ordinal,
		contentHash,
		lineStart: spec.lineStart,
		lineEnd: spec.lineEnd,
		status: 'active',
	};
	return {
		id: blockId,
		kind: spec.kind,
		title: spec.title,
		sub: spec.sub,
		source: spec.source,
		anchor,
		detail: spec.detail,
	};
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function computeStats(content: string, top: DocumentBlock[]): AtlasStats {
	let blocks = 0;
	let resources = 0;
	const visit = (list: DocumentBlock[]): void => {
		for (const b of list) {
			if (b.kind !== RawBlockKind.Heading) {
				blocks += 1;
				if (RESOURCE_KINDS.has(b.kind)) resources += 1;
			}
			if (b.children) visit(b.children);
		}
	};
	visit(top);
	const words = (content.match(/[\w一-鿿]+/g) ?? []).length;
	return { words, blocks, resources };
}

/** 1-based inclusive line slice from the source. */
function sliceLines(ctx: ParseCtx, start: number, end: number): string {
	return ctx.lines.slice(start - 1, end).join('\n');
}

function matchCalloutType(raw: string): string | null {
	const m = raw.match(/^>\s*\[!([\w-]+)\]/m);
	return m ? m[1].toLowerCase() : null;
}

function calloutTitle(raw: string): string {
	const m = raw.match(/^>\s*\[![\w-]+\][+-]?\s*(.*)$/m);
	const inline = m?.[1]?.trim();
	if (inline) return truncate(inline, 80);
	// Fall back to first body line after the marker.
	const body = raw
		.split(/\r?\n/)
		.slice(1)
		.map((l) => l.replace(/^>\s?/, '').trim())
		.find((l) => l.length > 0);
	return truncate(body ?? '', 80);
}

function firstMeaningfulLine(text: string): string {
	return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
}

function firstMeaningfulText(raw: string): string {
	const line = raw
		.split(/\r?\n/)
		.map((l) => l.replace(/^[>\s|*_+-]+/, '').trim())
		.find((l) => l.length > 0);
	return (line ?? '').replace(/[|*_`]/g, '').trim();
}

function renderScalar(value: unknown): string {
	if (value == null) return '';
	if (Array.isArray(value)) return `[${value.map(renderScalar).join(', ')}]`;
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

function normalizeTags(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean);
	return String(value)
		.split(',')
		.map((t) => t.replace(/^#/, '').trim())
		.filter(Boolean);
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

export { IMAGE_EXTENSIONS, ATTACHMENT_EXTENSIONS };
