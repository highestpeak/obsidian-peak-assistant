/**
 * Markdown Processing Utilities with AST-based Parsing
 *
 * This module provides comprehensive markdown parsing capabilities using the Remark ecosystem,
 * implementing a unified AST-based approach for extracting structured information from markdown content.
 *
 * WHY NOT USE OBSIDIAN'S BUILT-IN PARSING?
 * - Obsidian's API is tightly coupled to its internal implementation and may change without notice
 * - We need cross-platform compatibility beyond Obsidian's ecosystem
 * - Obsidian's parsing may include Obsidian-specific extensions we don't need
 * - We require fine-grained control over parsing behavior and output format
 * - Better performance and reliability for our specific use cases
 *
 * WHY AST-BASED PARSING INSTEAD OF REGEX?
 * - AST provides structural understanding of markdown, not just pattern matching
 * - Correctly handles nested structures (code blocks, links within headings, etc.)
 * - CRITICAL: Avoids false positives in code blocks - pure regex would incorrectly parse
 *   `[[links in backticks]]` or ```[[code block links]]``` as valid references
 * - Context-aware skipping: AST nodes carry parent relationship information
 * - More maintainable and extensible than complex regex patterns
 * - Better performance with single-pass parsing vs multiple regex scans
 * - Handles edge cases like escaped characters, multiline constructs automatically
 *
 * PROCESSED AST NODE TYPES:
 * - yaml: Frontmatter extraction (YAML metadata at document start)
 * - heading: Document title extraction (first H1, fallback to frontmatter)
 * - wikiLink: Obsidian-style wiki links [[Link]] and [[Link|Alias]]
 * - link: Standard markdown links [text](url) - local references only
 * - image: Embedded images ![alt](url) and wiki image embeds ![[image.png]]
 * - text: Hashtag extraction (#tag) with context awareness
 *
 * CONTEXT-AWARE SKIPPING (Critical for Accuracy):
 * - code: Skip processing in ```code blocks``` - treats [[links]] as literal text
 * - inlineCode: Skip processing in `inline code` - treats [[links]] as literal text
 * - link: Skip hashtag extraction within [markdown links](url) to avoid false positives
 * - Special handling for backtick-enclosed content: `[[links in backticks]]` are ignored
 *
 * PARSING STRATEGY:
 * 1. Use Remark processor with plugins for robust AST generation
 * 2. Single visitor pass extracts all information in one traversal
 * 3. AST-first approach with intelligent regex fallback for edge cases
 * 4. Context-aware extraction with critical skipping rules:
 *    - Skip `code` blocks (```): [[links]] in code blocks are literal, not references
 *    - Skip `inlineCode` (`): `[[links in backticks]]` are ignored as code
 *    - Skip `link` contexts: no hashtag extraction in [markdown](links)
 *    - Only process `text` nodes in paragraph/heading/list contexts
 * 5. Unified output format for all document processing needs
 *
 * ARCHITECTURAL BENEFITS:
 * - Single source of truth for markdown parsing
 * - Consistent behavior across different document types
 * - Easy to add new extraction features
 * - Performance optimized with minimal redundant processing
 * - Type-safe with full TypeScript support
 */

import { SLICE_CAPS } from '@/core/constant';
import matter from 'gray-matter';
import type { DocumentReferences, DocumentReference } from '../document/types';
import type { Root, Heading, Text, Link } from 'mdast';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkWikiLink from 'remark-wiki-link';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import { compileTemplate } from '../template-engine-helper';
import type { TemplateManager } from '../template/TemplateManager';
import { IndexingTemplateId } from '../template/TemplateRegistry';
import type { ChunkingSettings } from '../../app/settings/types';

/**
 * Parsed frontmatter result
 */
export interface ParsedFrontmatter<T> {
	data: T;
	body: string;
}

/**
 * Result of parsing markdown with remark
 */
export interface RemarkParseResult {
	/** Frontmatter data if present */
	frontmatter: Record<string, any> | null;
	/** Extracted title (from frontmatter or first heading) */
	title: string | null;
	/** All tags (from frontmatter and content hashtags) */
	tags: string[];
	/** Document references (wiki links, markdown links) */
	references: DocumentReferences;
	/** Embedded files (images, PDFs, etc.) */
	embeddings: string[];
	/** Parsed AST */
	ast: Root;
}

/**
 * Parse frontmatter from markdown content.
 * 
 * @param text The markdown content with frontmatter.
 * @returns Parsed frontmatter data and body, or null if no frontmatter found.
 */
export function parseFrontmatter<T extends object>(text: string): ParsedFrontmatter<T> | null {
	const parsed = matter(text);
	if (parsed.matter === '') {
		return null;
	}

	return {
		data: parsed.data as T,
		body: parsed.content,
	};
}

/**
 * Build frontmatter string from data object.
 * Filters out undefined values to avoid YAML serialization errors.
 *
 * @param data The data object to serialize as frontmatter.
 * @returns Frontmatter string (without body content).
 */
export function buildFrontmatter<T extends object>(data: T): string {
	// Filter out undefined values to prevent YAML serialization errors
	const cleaned = Object.fromEntries(
		Object.entries(data).filter(([_, value]) => value !== undefined)
	) as T;
	return matter.stringify('', cleaned);
}

/**
 * Options for resolving wiki link text to full vault path (e.g. via Obsidian's metadataCache).
 * When provided, link targets that are names/titles will be resolved to full paths.
 */
export interface ParseMarkdownOptions {
	/** Resolve wiki link text to full vault path. Return null to keep original. */
	resolveWikiLinkToPath: (linkText: string) => string | null;
}

/**
 * Parse markdown content using remark and extract frontmatter, title, and tags.
 * Uses remark library instead of regex for more reliable parsing.
 *
 * @param content The markdown content to parse
 * @param options Optional. When provided with sourcePath and resolveWikiLinkToPath, wiki link
 *   targets (e.g. [[name]] without path) are resolved to full vault paths.
 * @returns Parsed result with frontmatter, title, and tags
 */
export async function parseMarkdownWithRemark(
	content: string,
	options?: ParseMarkdownOptions
): Promise<RemarkParseResult> {
	// Unified processor with all plugins - let plugins handle frontmatter and wiki links
	const processor = remark()
		.use(remarkFrontmatter, ['yaml'])
		.use(remarkGfm)
		.use(remarkWikiLink, {
			pageResolver: (name: string) => [name],
			hrefTemplate: (permalink: string) => permalink,
			wikiLinkClassName: null,
			newClassName: null,
			aliasDivider: '|',
		});

	// Use .parse() instead of .process() to get raw AST without HTML transformation
	const ast = processor.parse(content);

	// Fallback AST if parsing failed
	const validAst: Root = (!ast || !ast.children) ? {
		type: 'root',
		children: [{
			type: 'paragraph',
			children: [{ type: 'text', value: content }]
		}]
	} : ast;

	// Single visitor pass to extract all information
	let frontmatter: Record<string, any> | null = null;
	let title: string | null = null;
	const tags = new Set<string>();
	const outgoingRefs: Array<{ fullPath: string }> = [];
	const embeddings: string[] = [];

	const resolveToFullPath = (linkTarget: string): string => {
		if (options?.resolveWikiLinkToPath) {
			const resolved = options.resolveWikiLinkToPath(linkTarget);
			if (resolved) return resolved;
		}
		return linkTarget;
	};

	visit(validAst, (node: any, index: number | undefined, parent: any) => {
		switch (node.type) {
			case 'yaml':
				// Parse YAML frontmatter using gray-matter for reliability
				try {
					const yamlContent = node.value;
					const parsed = matter(`---\n${yamlContent}\n---`);
					frontmatter = Object.keys(parsed.data).length > 0 ? parsed.data : null;

					// Extract tags from frontmatter
					if (frontmatter?.tags) {
						const frontmatterTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : String(frontmatter.tags).split(',');
						frontmatterTags.forEach((tag: any) => tags.add(String(tag).trim()));
					}

					// Extract title from frontmatter
					if (frontmatter?.title && !title) {
						title = String(frontmatter.title).trim().replace(/^["']|["']$/g, '');
					}
				} catch (e) {
					// Ignore YAML parsing errors
				}
				break;

			// case 'heading':
			// 	// Extract title from first h1 if not already set
			// 	if (!title && (node as Heading).depth === 1) {
			// 		title = toString(node);
			// 	}
			// 	break;

			case 'wikiLink':
				// Direct wiki link extraction from AST node
				// Try multiple possible locations where the plugin might store the value
				const target = node.value || node.data?.permalink || node.data?.value || node.url;
				if (target) {
					// Check if it's an embed (image/PDF) by looking for embed indicators
					const isEmbed = node.data?.isEmbed ||
						(typeof node.value === 'string' && node.value.startsWith('!')) ||
						node.data?.embed;

					if (isEmbed) {
						// Remove leading '!' for embeddings; resolve to full path when options provided
						embeddings.push(resolveToFullPath(target.replace(/^!/, '')));
					} else {
						outgoingRefs.push({ fullPath: resolveToFullPath(target) });
					}
				}
				break;

			case 'link':
				// Extract markdown links (local references only)
				const linkNode = node as Link;
				if (linkNode.url && !linkNode.url.startsWith('http') && !linkNode.url.startsWith('#')) {
					outgoingRefs.push({ fullPath: linkNode.url });
				}
				break;

			case 'image':
				// Extract image references (embeddings)
				const imageNode = node as any;
				if (imageNode.url && !imageNode.url.startsWith('http')) {
					embeddings.push(imageNode.url);
				}
				break;

			case 'text':
				// Skip if parent is code, inlineCode, or link
				if (parent && ['code', 'inlineCode', 'link'].includes(parent.type)) {
					return; // Skip processing
				}

				// Fallback: Only use regex if wikiLink plugin didn't work (text still contains [[ ]])
				// Supports: [[path|alias]] (use path before pipe as fullPath) and [[name]] (use full content as target).
				if (node.value.includes('[[')) {
					const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
					const wikiMatches = node.value.matchAll(wikiLinkRegex);
					for (const match of wikiMatches) {
						const content = match[1];
						const pipeIndex = content.indexOf('|');
						// Link target is always the part BEFORE the pipe (path); part after pipe is display alias only.
						let target: string =
							pipeIndex !== -1 ? content.substring(0, pipeIndex).trim() : content.trim();

						// Check if it's an embed (starts with !)
						if (target.startsWith('!')) {
							target = target.substring(1).trim();
							// Strip #anchor or #^block-ref for file path
							const hashIndex = target.indexOf('#');
							const filePath = hashIndex !== -1 ? target.substring(0, hashIndex).trim() : target;
							if (filePath && filePath.length > 0 && filePath.length <= 200 &&
								!filePath.startsWith('@') && !filePath.includes('\n') &&
								/[a-zA-Z\u4e00-\u9fff]/.test(filePath)) {
								embeddings.push(filePath);
							}
							continue;
						}

						// Strip #anchor or #^block-ref so fullPath is the file path only
						const hashIndex = target.indexOf('#');
						const fullPath = hashIndex !== -1 ? target.substring(0, hashIndex).trim() : target;

						// Basic validation; resolve to full vault path when options provided
						if (fullPath && fullPath.length > 0 && fullPath.length <= 200 &&
							!fullPath.startsWith('@') &&
							!fullPath.includes('\n') &&
							/[a-zA-Z\u4e00-\u9fff]/.test(fullPath)) {
							outgoingRefs.push({ fullPath: resolveToFullPath(fullPath) });
						}
					}
				}

				// Extract hashtags from clean text only
				const hashtagRegex = /#([a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff_-]*)/g;
				const matches = node.value.matchAll(hashtagRegex);
				for (const match of matches) {
					const tag = match[1];
					if (tag && tag.length >= 2) {
						tags.add(tag);
					}
				}
				break;
		}
	});

	const references: DocumentReferences = {
		outgoing: outgoingRefs,
		incoming: [], // Will be populated by indexing process
	};

	return {
		frontmatter,
		title,
		tags: Array.from(tags),
		references,
		embeddings,
		ast: validAst,
	};
}

/**
 * Create a markdown code block string.
 *
 * @param type The code block language/type.
 * @param content The code block content.
 * @returns Formatted code block string.
 */
export function codeBlock(type: string, content: string): string {
	return `\`\`\`${type}\n${content.trim()}\n\`\`\``;
}

// --- Chunking / code-fence helpers (stopwords: templates/indexing/code-stopwords.md via Handlebars) ---

/** Default placeholder when {@link ChunkingSettings.codeBlockPlaceholder} is unset. */
export const DEFAULT_CODE_BLOCK_PLACEHOLDER = '\n\n[code omitted]\n\n';

/** How many keyword tokens to keep in the rich placeholder. */
const CODE_KEYWORD_TOP_N = 6;

/** Min token length after normalization. */
const MIN_TOKEN_LEN = 2;

/**
 * Parses rendered stopword template body into a lowercase set (one word per line; `#` line comments).
 */
function parseCodeStopwordsRendered(rendered: string): Set<string> {
	const set = new Set<string>();
	for (const line of rendered.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		for (const w of trimmed.split(/\s+/)) {
			if (w) set.add(w.toLowerCase());
		}
	}
	return set;
}

let codeStopwordsSet: Set<string> | null = null;

function getCodeStopwords(): Set<string> {
	return codeStopwordsSet ?? new Set<string>();
}

/**
 * Loads and compiles `IndexingTemplateId.CodeStopwords` with Handlebars, then builds the in-memory stopword set.
 * Call from plugin onload before indexing (e.g. before DocumentLoaderManager.init).
 *
 * @param variables Optional context (e.g. `extraStopwords` from settings) merged into the template.
 */
export async function hydrateCodeStopwordsFromTemplateManager(
	tm: TemplateManager,
	variables: Record<string, unknown> = {},
): Promise<void> {
	const raw = await tm.getTemplate(IndexingTemplateId.CodeStopwords);
	const rendered = compileTemplate(raw)({ extraStopwords: [], ...variables });
	codeStopwordsSet = parseCodeStopwordsRendered(rendered);
}

/** Test hook: apply already-rendered template output (same parsing as production). */
export function setCodeStopwordsForTests(rendered: string): void {
	codeStopwordsSet = parseCodeStopwordsRendered(rendered);
}

/** Reset stopwords cache (e.g. tests). */
export function resetCodeStopwordsForTests(): void {
	codeStopwordsSet = null;
}

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]{1,63}/g;

/**
 * Parses fenced code block info (language id after ```).
 */
export function parseFenceLang(infoLine: string): string {
	const raw = infoLine.trim().split(/\s+/)[0] ?? '';
	if (!raw) return 'unknown';
	const cleaned = raw.replace(/[^a-zA-Z0-9.+#-]/g, '').toLowerCase();
	return cleaned.slice(0, SLICE_CAPS.utils.chunkSlugFallback) || 'unknown';
}

/**
 * Splits camelCase / PascalCase / snake_case tokens into rough word pieces.
 */
function expandIdentifier(id: string): string[] {
	const withSplits = id
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
	return withSplits.split(/[^a-zA-Z0-9_]+/).filter((p) => p.length >= MIN_TOKEN_LEN);
}

/**
 * Top frequency keywords from code text after stopword filtering (for index placeholders only).
 */
export function extractCodeKeywordsForIndex(code: string, topN: number): string[] {
	const counts = new Map<string, number>();
	let m: RegExpExecArray | null;
	const re = new RegExp(IDENT_RE.source, 'g');
	while ((m = re.exec(code)) !== null) {
		const id = m[0];
		for (const part of expandIdentifier(id)) {
			const w = part.toLowerCase();
			if (w.length < MIN_TOKEN_LEN) continue;
			if (/^\d+$/.test(w)) continue;
			if (getCodeStopwords().has(w)) continue;
			counts.set(w, (counts.get(w) ?? 0) + 1);
		}
	}
	const ranked = [...counts.entries()].sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1];
		return a[0].localeCompare(b[0]);
	});
	const out: string[] = [];
	const seen = new Set<string>();
	for (const [w] of ranked) {
		if (seen.has(w)) continue;
		seen.add(w);
		out.push(w);
		if (out.length >= topN) break;
	}
	return out;
}

/**
 * One-line placeholder when a fenced block is omitted (embedding-friendly hint).
 */
export function buildCodeOmittedPlaceholder(infoLine: string, inner: string): string {
	const lang = parseFenceLang(infoLine);
	const lines = inner.length === 0 ? 0 : inner.split(/\r?\n/).length;
	const chars = inner.length;
	const kw = extractCodeKeywordsForIndex(inner, CODE_KEYWORD_TOP_N);
	const kwPart = kw.length ? ` kw=${kw.join(',')}` : '';
	return `\n\n[code omitted lang=${lang} lines=${lines} chars=${chars}${kwPart}]\n\n`;
}

function replaceFencedCodeBlocks(
	content: string,
	maxKeep: number,
	fallbackPlaceholder: string,
	useRichOmit: boolean,
): string {
	const re = /```([^\n]*)\n([\s\S]*?)```/g;
	return content.replace(re, (_full, infoLine: string, inner: string) => {
		if (maxKeep <= 0) {
			return useRichOmit ? buildCodeOmittedPlaceholder(infoLine, inner) : fallbackPlaceholder;
		}
		if (inner.length <= maxKeep) return '```' + infoLine + '\n' + inner + '\n```';
		return '```' + infoLine + '\n' + inner.slice(0, maxKeep) + '\n...\n```';
	});
}

/**
 * Replaces fenced ``` blocks with placeholder or truncated copy before chunking.
 * When `maxCodeChunkChars` is 0, each block becomes a compact `[code omitted lang=…]` line unless
 * a custom non-default `codeBlockPlaceholder` is set (then that string is used for every block).
 */
export function preprocessMarkdownForChunking(
	content: string,
	settings: Pick<ChunkingSettings, 'skipCodeBlocksInChunking' | 'codeBlockPlaceholder' | 'maxCodeChunkChars'>,
): string {
	const skip = settings.skipCodeBlocksInChunking === true;
	if (!skip) return content;

	const configured = settings.codeBlockPlaceholder;
	const fallbackPlaceholder = configured ?? DEFAULT_CODE_BLOCK_PLACEHOLDER;
	const useRichOmit = configured === undefined || configured === DEFAULT_CODE_BLOCK_PLACEHOLDER;

	const maxKeep = Math.max(0, settings.maxCodeChunkChars ?? 0);
	return replaceFencedCodeBlocks(content, maxKeep, fallbackPlaceholder, useRichOmit);
}

/**
 * Collects markdown heading lines for compact navigation / evidence hints.
 */
export function extractHeadingSkeleton(content: string, maxChars = 8000): string {
	const lines = content.split(/\r?\n/).filter((l) => /^#{1,6}\s+/.test(l));
	let out = lines.join('\n');
	if (out.length > maxChars) {
		out = out.slice(0, maxChars);
	}
	return out;
}
