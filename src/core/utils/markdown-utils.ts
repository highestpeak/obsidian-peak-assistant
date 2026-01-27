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

import matter from 'gray-matter';
import type { DocumentReferences, DocumentReference } from '../document/types';
import type { Root, Heading, Text, Link } from 'mdast';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkWikiLink from 'remark-wiki-link';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

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
 * Parse markdown content using remark and extract frontmatter, title, and tags.
 * Uses remark library instead of regex for more reliable parsing.
 *
 * @param content The markdown content to parse
 * @returns Parsed result with frontmatter, title, and tags
 */
export async function parseMarkdownWithRemark(content: string): Promise<RemarkParseResult> {
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
						// Remove leading '!' for embeddings
						embeddings.push(target.replace(/^!/, ''));
					} else {
						outgoingRefs.push({ fullPath: target });
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
				if (node.value.includes('[[')) {
					const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
					const wikiMatches = node.value.matchAll(wikiLinkRegex);
					for (const match of wikiMatches) {
						const content = match[1];
						const pipeIndex = content.indexOf('|');
						let target: string;
						let isEmbed = false;

						if (pipeIndex !== -1) {
							target = content.substring(0, pipeIndex).trim();
						} else {
							target = content.trim();
						}

						// Check if it's an embed (starts with !)
						if (target.startsWith('!')) {
							isEmbed = true;
							target = target.substring(1); // Remove leading '!'
						}

						// Basic validation
						if (target && target.length > 0 && target.length <= 200 &&
							!target.startsWith('@') &&
							!target.includes('\n') &&
							/[a-zA-Z\u4e00-\u9fff]/.test(target)) {
							if (isEmbed) {
								embeddings.push(target);
							} else {
								outgoingRefs.push({ fullPath: target });
							}
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
