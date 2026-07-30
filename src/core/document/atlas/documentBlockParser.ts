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
	content: string;
	lines: string[];
	lineStarts: number[];
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
	const ctx: ParseCtx = {
		filePath,
		content,
		lines: content.split(/\r?\n/),
		lineStarts: lineStartsOf(content),
		seq: 0,
	};
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
		assignDescendantContext(block, block.anchor.nearestHeading);
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
			// A heading may itself contain inline links/tags. Those resource
			// children belong to this heading, not to its parent section.
			assignDescendantContext(heading, heading.title);
			siblings.push(heading);
			headingStack.push(heading);
			continue;
		}
		for (const block of makeBlocksFromNode(ctx, node)) pushBlock(block);
	}

	extendContainerLineRanges(top);
	annotateOccurrences(content, top);
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
		const property = finalizeLeaf(ctx, {
			kind: RawBlockKind.Property,
			title: key,
			sub: rendered,
			source: `${key}: ${rendered}`,
			lineStart: line,
			lineEnd: line,
			detail: {
				propertyKey: key,
				propertyValue: rendered,
				propertyValueType: propertyValueType(value),
			},
			ordinal: ordinal++,
		});
		// Obsidian properties may contain wikilinks or Markdown links. Preserve
		// the Property row while exposing those references as owned resources.
		// Tags are emitted separately below, so exclude them here to avoid
		// representing the same frontmatter tag twice.
		const references = extractInlineResources(ctx, inlineResourceText(value), line, line, false)
			.filter((resource) => resource.kind !== RawBlockKind.Tag);
		if (references.length) property.children = references;
		out.push(property);
	}

	if (data.tags !== undefined) {
		const tagRel = yamlLines.findIndex((line) => line.trimStart().startsWith('tags:'));
		const tagLine = tagRel >= 0 ? startLine + 1 + tagRel : startLine;
		for (const tag of normalizeTags(data.tags)) {
			out.push(
				finalizeLeaf(ctx, {
					kind: RawBlockKind.Tag,
					title: `#${tag}`,
					sub: 'Frontmatter · tags',
					source: `#${tag}`,
					lineStart: tagLine,
					lineEnd: tagLine,
					detail: { target: tag, tagSource: 'frontmatter' },
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
	return attachInlineResourceChildren(
		ctx,
		block,
		block.source,
		line,
		node.position?.end.line ?? line,
	);
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
			const block = finalizeLeaf(ctx, {
				kind: RawBlockKind.Table,
				title: firstMeaningfulText(raw) || 'Table',
				sub: `${Math.max(0, rows - 1)} rows · ${columns} columns`,
				source: raw,
				lineStart: start,
				lineEnd: end,
				detail: { rows: Math.max(0, rows - 1), columns },
				ordinal: 0,
			});
			return [
				attachInlineResourceChildren(ctx, block, raw, start, end),
			];
		}

		case 'blockquote': {
			// Callout = blockquote whose first line is `> [!type]`.
			const calloutType = matchCalloutType(raw);
			if (calloutType) {
				const block = finalizeLeaf(ctx, {
					kind: RawBlockKind.Callout,
					title: calloutTitle(raw) || `${calloutType} callout`,
					sub: `${calloutType} callout`,
					source: raw,
					lineStart: start,
					lineEnd: end,
					detail: { calloutType },
					ordinal: 0,
				});
				return [
					attachInlineResourceChildren(ctx, block, raw, start, end),
				];
			}
			const block = finalizeLeaf(ctx, {
				kind: RawBlockKind.Quote,
				title: firstMeaningfulText(raw) || 'Quote',
				sub: 'Blockquote',
				source: raw,
				lineStart: start,
				lineEnd: end,
				ordinal: 0,
			});
			return [
				attachInlineResourceChildren(ctx, block, raw, start, end),
			];
		}

		case 'list': {
			return expandList(ctx, node as any, start, end, raw);
		}

		case 'footnoteDefinition': {
			const id = (node as any).identifier ?? '';
			const block = finalizeLeaf(ctx, {
				kind: RawBlockKind.Footnote,
				title: `[^${id}]`,
				sub: 'Footnote definition',
				source: raw,
				lineStart: start,
				lineEnd: end,
				detail: { target: id },
				ordinal: 0,
			});
			return [
				attachInlineResourceChildren(ctx, block, raw, start, end),
			];
		}

		case 'paragraph': {
			return expandParagraph(ctx, raw, start, end);
		}

		case 'html': {
			// Bare HTML (e.g. <!-- comment -->) — treat as paragraph-ish text.
			const commentOnly = isCommentOnlyHtml(raw);
			const block = finalizeLeaf(ctx, {
				kind: RawBlockKind.Paragraph,
				title: htmlText(raw) || 'HTML block',
				sub: 'HTML block',
				source: raw,
				lineStart: start,
				lineEnd: end,
				detail: { htmlBlock: true, commentOnly },
				ordinal: 0,
			});
			return [
				attachInlineResourceChildren(ctx, block, raw, start, end),
			];
		}

		default: {
			// Unknown container — represent as a paragraph so nothing is lost.
			const block = finalizeLeaf(ctx, {
				kind: RawBlockKind.Paragraph,
				title: firstMeaningfulText(raw) || node.type,
				sub: 'Body block',
				source: raw,
				lineStart: start,
				lineEnd: end,
				ordinal: 0,
			});
			return [
				attachInlineResourceChildren(ctx, block, raw, start, end),
			];
		}
	}
}

/** A list is one document block with addressable ListItem / Task children. */
function expandList(
	ctx: ParseCtx,
	node: { children?: any[]; ordered?: boolean },
	start: number,
	end: number,
	raw: string
): DocumentBlock[] {
	const items = node.children ?? [];
	const list = finalizeLeaf(ctx, {
		kind: RawBlockKind.List,
		title: node.ordered ? 'Numbered list' : 'Bullet list',
		sub: `${items.length} items`,
		source: raw,
		lineStart: start,
		lineEnd: end,
		detail: { itemCount: items.length, ordered: Boolean(node.ordered) },
		ordinal: 0,
	});
	list.children = items.map((item, index) => makeListItem(ctx, item, start, index));
	return [list];
}

function makeListItem(
	ctx: ParseCtx,
	item: any,
	fallbackLine: number,
	ordinal: number,
): DocumentBlock {
	const start = item.position?.start.line ?? fallbackLine;
	const end = item.position?.end.line ?? start;
	const source = sliceLines(ctx, start, end);
	const checked = typeof item.checked === 'boolean' ? item.checked : null;
	const kind = checked === null ? RawBlockKind.ListItem : RawBlockKind.Task;
	const block = finalizeLeaf(ctx, {
		kind,
		title: listItemTitle(source, checked !== null),
		sub: checked === null ? 'List item' : checked ? 'Checked' : 'Unchecked',
		source,
		lineStart: start,
		lineEnd: end,
		detail: checked === null ? undefined : { checked },
		ordinal,
	});
	const children: DocumentBlock[] = [];
	for (const child of item.children ?? []) {
		const childStart = child.position?.start.line ?? start;
		const childEnd = child.position?.end.line ?? childStart;
		const childRaw = sliceLines(ctx, childStart, childEnd);
		if (child.type === 'list') {
			const [nestedBlock] = expandList(ctx, child, childStart, childEnd, childRaw);
			children.push(nestedBlock);
			continue;
		}
		children.push(...extractInlineResources(ctx, childRaw, childStart, childEnd));
	}
	children.forEach((child, index) => {
		child.anchor.ordinalInHeading = index;
	});
	if (children.length) block.children = children;
	return block;
}

function attachInlineResourceChildren(
	ctx: ParseCtx,
	block: DocumentBlock,
	raw: string,
	lineStart: number,
	lineEnd: number,
): DocumentBlock {
	const resources = extractInlineResources(ctx, raw, lineStart, lineEnd);
	if (!resources.length) return block;
	block.children = [...(block.children ?? []), ...resources];
	return block;
}

function listItemTitle(source: string, task: boolean): string {
	const firstLine = source.split('\n').find((line) => line.trim()) ?? '';
	const marker = task
		? /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/
		: /^\s*(?:[-*+]|\d+[.)])\s+/;
	return truncate(firstLine.replace(marker, '').trim() || (task ? 'Task' : 'List item'), 120);
}

function assignDescendantContext(block: DocumentBlock, nearestHeading: string | null): void {
	for (const [index, child] of (block.children ?? []).entries()) {
		child.anchor.nearestHeading = nearestHeading;
		child.anchor.ordinalInHeading = index;
		assignDescendantContext(child, nearestHeading);
	}
}

/** Make structural container anchors span the descendants they represent. */
function extendContainerLineRanges(blocks: DocumentBlock[]): number {
	let furthestLine = 0;
	for (const block of blocks) {
		let blockEnd = block.anchor.lineEnd;
		if (block.children?.length) {
			blockEnd = Math.max(blockEnd, extendContainerLineRanges(block.children));
			block.anchor.lineEnd = blockEnd;
		}
		furthestLine = Math.max(furthestLine, blockEnd);
	}
	return furthestLine;
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

	// A paragraph whose whole content is a single inline resource (a bare link,
	// embed, image, or url) is fully represented by that extracted resource block —
	// the paragraph wrapper would just duplicate the same line, so drop it and keep
	// only the resource(s). Paragraphs that carry real prose alongside a link stay.
	const resources = extractInlineResources(ctx, raw, start, end);
	if (resources.length > 0 && isResourceOnly(raw, resources)) return resources;

	const paragraph = finalizeLeaf(ctx, {
		kind: RawBlockKind.Paragraph,
		title: truncate(firstMeaningfulText(raw), 80) || 'Paragraph',
		sub: 'Body paragraph',
		source: raw,
		lineStart: start,
		lineEnd: end,
		ordinal: 0,
	});
	if (resources.length) paragraph.children = resources;
	return [paragraph];
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
const AUTOLINK_RE = /<((?:https?:\/\/|mailto:|[a-z][a-z0-9+.-]*:\/\/|\/\/)[^>\s]+)>/gi;
const BARE_URL_RE = /(?<![\(<"'\]])\bhttps?:\/\/[^\s<>)\]]+/g;
const INLINE_TAG_RE = /(?:^|\s)#([A-Za-z一-鿿][\w一-鿿/-]*)/g;

/**
 * True when a paragraph's whole content is inline resources (links / embeds /
 * images / urls / tags) with no other prose — the extracted resource blocks fully
 * represent it, so the paragraph wrapper is redundant. Strips every resource match
 * (same order as {@link extractInlineResources}) and checks that no letters or
 * digits remain.
 */
function isResourceOnly(raw: string, resources: DocumentBlock[]): boolean {
	const stripped = raw
		.replace(EMBED_RE, ' ')
		.replace(MD_IMAGE_RE, ' ')
		.replace(WIKILINK_RE, ' ')
		.replace(MD_LINK_RE, ' ')
		.replace(AUTOLINK_RE, ' ')
		.replace(BARE_URL_RE, ' ')
		.replace(INLINE_TAG_RE, ' ');
	if (!/[\p{L}\p{N}]/u.test(stripped)) return true;
	if (resources.length !== 1 || resources[0].kind !== RawBlockKind.ExternalLink) return false;
	return Boolean(resources[0].detail?.companionTitle);
}

/**
 * Extract link/embed/image/url/tag blocks from a raw source slice. Inline code
 * and comments are masked before scanning so examples and hidden notes do not
 * become semantic resources. Exact source order and 1-based line anchors are
 * retained for every match.
 */
export function extractInlineResources(
	ctx: ParseCtx,
	raw: string,
	lineStart: number,
	lineEnd: number,
	exactSource = true,
): DocumentBlock[] {
	const matches: Array<{
		index: number;
		discoveryOrder: number;
		kind: RawBlockKind;
		title: string;
		sub: string;
		source: string;
		sourceIndex: number;
		sourceLength: number;
		detail?: BlockDetail;
	}> = [];
	const push = (
		match: RegExpMatchArray,
		kind: RawBlockKind,
		title: string,
		sub: string,
		source: string,
		detail?: BlockDetail
	): void => {
		const sourceIndexInMatch = Math.max(0, match[0].indexOf(source));
		matches.push({
			index: match.index ?? 0,
			discoveryOrder: matches.length,
			kind,
			title,
			sub,
			source,
			sourceIndex: (match.index ?? 0) + sourceIndexInMatch,
			sourceLength: source.length,
			detail,
		});
	};
	const scanRaw = maskIgnoredInlineSyntax(raw);

	// Embeds first (they share the `[[…]]` shape but are prefixed with `!`).
	for (const m of scanRaw.matchAll(EMBED_RE)) {
		const [rawTarget, rawAlias] = m[1].split('|');
		const target = rawTarget.trim();
		const authoredLabel = rawAlias?.trim() || undefined;
		const hashIdx = target.indexOf('#');
		const linkFragment = hashIdx >= 0 ? target.slice(hashIdx) : undefined;
		const { kind, fileTarget } = classifyEmbedTarget(target);
		const label = authoredLabel || fileTarget || target;
		const shared = { authoredLabel, fileTarget, target, linkFragment };
		if (kind === RawBlockKind.Image) push(m, kind, label, 'Embedded image', m[0], shared);
		else if (kind === RawBlockKind.Attachment)
			push(m, kind, label, 'Embedded attachment', m[0], shared);
		else push(m, kind, label, 'Embedded note / media', m[0], shared);
	}

	// Markdown images ![alt](path)
	for (const m of scanRaw.matchAll(MD_IMAGE_RE)) {
		const target = m[1];
		const authoredLabel = markdownLabel(m[0]);
		if (isExternalUrl(target)) {
			push(m, RawBlockKind.Image, authoredLabel || target, 'Remote image', m[0], {
				authoredLabel,
				fileTarget: target,
				target,
				domain: extractDomain(target),
			});
		} else {
			push(m, RawBlockKind.Image, authoredLabel || target, 'Embedded image', m[0], {
				authoredLabel,
				fileTarget: target,
				target,
			});
		}
	}

	// Vault wiki links [[note]] / [[note#heading]] / [[note#^block]]
	for (const m of scanRaw.matchAll(WIKILINK_RE)) {
		const [rawTarget, rawAlias] = m[1].split('|');
		const inner = rawTarget.trim();
		const authoredLabel = rawAlias?.trim() || undefined;
		const hashIdx = inner.indexOf('#');
		const fragment = hashIdx >= 0 ? inner.slice(hashIdx) : undefined;
		push(m, RawBlockKind.VaultLink, authoredLabel || inner, 'Vault link', m[0], {
			authoredLabel,
			target: inner,
			linkFragment: fragment,
		});
	}

	// Markdown links [text](target)
	for (const m of scanRaw.matchAll(MD_LINK_RE)) {
		const target = m[1];
		const authoredLabel = markdownLabel(m[0]);
		if (isExternalUrl(target)) {
			push(m, RawBlockKind.ExternalLink, authoredLabel || extractDomain(target) || target, 'External link', m[0], {
				authoredLabel,
				target,
				domain: extractDomain(target),
				nakedUrl: false,
			});
		} else if (!target.startsWith('#')) {
			// Relative/local path → vault link.
			push(m, RawBlockKind.VaultLink, authoredLabel || target, 'Vault link', m[0], {
				authoredLabel,
				target,
			});
		}
	}

	// Markdown autolinks: <https://example.com> / <mailto:user@example.com>.
	for (const m of scanRaw.matchAll(AUTOLINK_RE)) {
		const target = m[1];
		push(m, RawBlockKind.ExternalLink, extractDomain(target) || target, 'External link', m[0], {
			target,
			domain: extractDomain(target),
			nakedUrl: false,
		});
	}

	// Bare URLs
	for (const m of scanRaw.matchAll(BARE_URL_RE)) {
		const url = m[0];
		const companionTitle = importedCompanionTitle(raw, (m.index ?? 0) + url.length);
		push(m, RawBlockKind.ExternalLink, companionTitle || extractDomain(url) || url, 'External link', url, {
			companionTitle,
			target: url,
			domain: extractDomain(url),
			nakedUrl: true,
		});
	}

	// Inline tags
	for (const m of scanRaw.matchAll(INLINE_TAG_RE)) {
		const tag = m[1];
		push(m, RawBlockKind.Tag, `#${tag}`, 'Inline tag', `#${tag}`, {
			target: tag,
			tagSource: 'inline',
		});
	}

	return matches
		.sort((a, b) => a.index - b.index || a.discoveryOrder - b.discoveryOrder)
		.map((match, ordinal) => {
			const linesBefore = (raw.slice(0, match.index).match(/\n/g) ?? []).length;
			const matchedLines = (match.source.match(/\n/g) ?? []).length;
			const resourceLineStart = Math.min(lineEnd, lineStart + linesBefore);
			const resourceLineEnd = Math.min(lineEnd, resourceLineStart + matchedLines);
			const localFrom = match.sourceIndex;
			const localTo = localFrom + match.sourceLength;
			return finalizeLeaf(ctx, {
				kind: match.kind,
				title: match.title,
				sub: match.sub,
				source: match.source,
				lineStart: resourceLineStart,
				lineEnd: resourceLineEnd,
				detail: match.detail,
				ordinal,
				...(exactSource
					? {
							sourceFrom: sourceOffsetFromSlice(ctx, raw, lineStart, localFrom),
							sourceTo: sourceOffsetFromSlice(ctx, raw, lineStart, localTo),
						}
					: {}),
			});
		});
}

/** Replace ignored inline syntax with spaces while preserving offsets/newlines. */
function maskIgnoredInlineSyntax(raw: string): string {
	const mask = (value: string): string => value.replace(/[^\n]/g, ' ');
	return raw
		.replace(/<!--[\s\S]*?-->/g, mask)
		.replace(/%%[\s\S]*?%%/g, mask)
		.replace(/(`+)([\s\S]*?)\1/g, mask);
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
	sourceFrom?: number;
	sourceTo?: number;
}

function finalizeLeaf(ctx: ParseCtx, spec: LeafSpec): DocumentBlock {
	const contentHash = hashString(spec.source, 32);
	const blockId = `${spec.kind}-${spec.lineStart}-${(ctx.seq++).toString(36)}-${contentHash.slice(0, 8)}`;
	const fallbackRange = sourceRangeForLines(ctx, spec.lineStart, spec.lineEnd);
	const anchor: FileAtlasAnchor = {
		filePath: ctx.filePath,
		blockId,
		nearestHeading: null,
		blockType: spec.kind,
		ordinalInHeading: spec.ordinal,
		contentHash,
		lineStart: spec.lineStart,
		lineEnd: spec.lineEnd,
		sourceFrom: spec.sourceFrom ?? fallbackRange.from,
		sourceTo: spec.sourceTo ?? fallbackRange.to,
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
	const countResourceDescendants = (list: DocumentBlock[]): void => {
		for (const child of list) {
			if (RESOURCE_KINDS.has(child.kind)) resources += 1;
			if (child.children) countResourceDescendants(child.children);
		}
	};
	const visit = (list: DocumentBlock[]): void => {
		for (const b of list) {
			if (b.kind !== RawBlockKind.Heading) {
				blocks += 1;
				if (RESOURCE_KINDS.has(b.kind)) resources += 1;
			}
			// List items are addressable sub-units of one document block. Their
			// descendants must not inflate the document-context block count, but
			// semantic resources inside those items still belong in resource stats.
			if (b.kind === RawBlockKind.List) {
				countResourceDescendants(b.children ?? []);
				continue;
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

function lineStartsOf(content: string): number[] {
	const starts = [0];
	for (let index = 0; index < content.length; index += 1) {
		if (content.charCodeAt(index) === 10) starts.push(index + 1);
	}
	return starts;
}

function sourceRangeForLines(
	ctx: ParseCtx,
	startLine: number,
	endLine: number,
): { from: number; to: number } {
	const safeStart = Math.max(1, Math.min(startLine, ctx.lineStarts.length));
	const safeEnd = Math.max(safeStart, Math.min(endLine, ctx.lineStarts.length));
	const from = ctx.lineStarts[safeStart - 1] ?? 0;
	const nextLine = ctx.lineStarts[safeEnd] ?? ctx.content.length;
	let to = nextLine;
	while (to > from && (ctx.content[to - 1] === '\n' || ctx.content[to - 1] === '\r')) to -= 1;
	return { from, to };
}

/** Map an offset in a normalized `sliceLines()` string back to the source. */
function sourceOffsetFromSlice(
	ctx: ParseCtx,
	raw: string,
	startLine: number,
	localOffset: number,
): number {
	const before = raw.slice(0, Math.max(0, localOffset));
	const pieces = before.split('\n');
	const lineIndex = Math.max(0, startLine - 1 + pieces.length - 1);
	const lineFrom = ctx.lineStarts[lineIndex] ?? ctx.content.length;
	return Math.min(ctx.content.length, lineFrom + (pieces.at(-1)?.length ?? 0));
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

function markdownLabel(source: string): string | undefined {
	const label = source.match(/^!?\[([^\]]*)\]/)?.[1]?.trim();
	return label || undefined;
}

function importedCompanionTitle(raw: string, afterIndex: number): string | undefined {
	const tail = raw.slice(afterIndex);
	const match = tail.match(/^\s*(?:\||—)\s*(.+?)\s*$/);
	return match?.[1]?.trim() || undefined;
}

function htmlText(raw: string): string {
	return truncate(
		raw
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim(),
		120,
	);
}

function isCommentOnlyHtml(raw: string): boolean {
	const withoutComments = raw.replace(/<!--[\s\S]*?-->/g, '').trim();
	return withoutComments.length === 0;
}

function propertyValueType(value: unknown): NonNullable<BlockDetail['propertyValueType']> {
	if (Array.isArray(value)) return 'array';
	if (value instanceof Date) return 'date';
	if (typeof value === 'boolean') return 'boolean';
	if (typeof value === 'number') return 'number';
	if (value && typeof value === 'object') return 'object';
	const text = String(value ?? '').trim();
	if (/^\[\[[^\]]+\]\]$/.test(text)) return 'vault-link';
	if (isExternalUrl(text)) return 'url';
	if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(text)) return 'date';
	return 'text';
}

function annotateOccurrences(content: string, blocks: DocumentBlock[]): void {
	const flat: DocumentBlock[] = [];
	const visit = (items: DocumentBlock[]): void => {
		for (const item of items) {
			flat.push(item);
			if (item.children) visit(item.children);
		}
	};
	visit(blocks);

	const tagCounts = new Map<string, number>();
	for (const block of flat.filter((item) => item.kind === RawBlockKind.Tag)) {
		const key = (block.detail?.target ?? block.title.replace(/^#/, '')).toLowerCase();
		tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
	}
	for (const block of flat) {
		if (block.kind === RawBlockKind.Tag) {
			const key = (block.detail?.target ?? block.title.replace(/^#/, '')).toLowerCase();
			block.detail = {
				...block.detail,
				occurrenceCount: Math.max(1, tagCounts.get(key) ?? 1),
			};
		}
		if (block.kind !== RawBlockKind.Footnote) continue;
		const id = block.detail?.target ?? '';
		const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const references = content.match(new RegExp(`\\[\\^${escaped}\\]`, 'g'))?.length ?? 0;
		const definitionText = block.source
			.replace(new RegExp(`^\\s*\\[\\^${escaped}\\]:\\s*`), '')
			.trim();
		block.detail = {
			...block.detail,
			definitionText,
			referenceCount: Math.max(0, references - 1),
		};
	}
}

function renderScalar(value: unknown): string {
	if (value == null) return '';
	if (Array.isArray(value)) return `[${value.map(renderScalar).join(', ')}]`;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/** Flatten scalar property values without adding syntax that can corrupt links. */
function inlineResourceText(value: unknown): string {
	if (value == null) return '';
	if (Array.isArray(value)) return value.map(inlineResourceText).filter(Boolean).join('\n');
	if (typeof value === 'object') {
		return Object.values(value as Record<string, unknown>)
			.map(inlineResourceText)
			.filter(Boolean)
			.join('\n');
	}
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
